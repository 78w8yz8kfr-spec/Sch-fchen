BEGIN;

ALTER TABLE work_days
    ADD COLUMN IF NOT EXISTS break_minutes_override INTEGER,
    ADD COLUMN IF NOT EXISTS break_override_reason TEXT,
    ADD COLUMN IF NOT EXISTS break_override_by_user_id UUID;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'work_days_break_override_by_fkey'
          AND conrelid = 'work_days'::REGCLASS
    ) THEN
        ALTER TABLE work_days ADD CONSTRAINT work_days_break_override_by_fkey
            FOREIGN KEY (company_id, break_override_by_user_id)
            REFERENCES users (company_id, id) ON DELETE RESTRICT;
    END IF;
END;
$$;

ALTER TABLE work_days
    DROP CONSTRAINT IF EXISTS work_days_break_override_check;
ALTER TABLE work_days
    ADD CONSTRAINT work_days_break_override_check CHECK (
        (
            break_minutes_override IS NULL
            AND break_override_reason IS NULL
            AND break_override_by_user_id IS NULL
        ) OR (
            break_minutes_override BETWEEN 0 AND 1440
            AND BTRIM(break_override_reason) <> ''
            AND break_override_by_user_id IS NOT NULL
        )
    );

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'time_entries_company_id_id_key'
          AND conrelid = 'time_entries'::REGCLASS
    ) THEN
        ALTER TABLE time_entries
            ADD CONSTRAINT time_entries_company_id_id_key UNIQUE (company_id, id);
    END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS time_change_operations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
    user_id UUID NOT NULL,
    client_change_id UUID NOT NULL,
    action VARCHAR(30) NOT NULL,
    reason TEXT NOT NULL,
    status VARCHAR(20) NOT NULL,
    requested_by_user_id UUID,
    reviewed_by_user_id UUID,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMPTZ,
    row_version BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT time_change_operations_user_fkey
        FOREIGN KEY (company_id, user_id) REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT time_change_operations_requester_fkey
        FOREIGN KEY (company_id, requested_by_user_id) REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT time_change_operations_reviewer_fkey
        FOREIGN KEY (company_id, reviewed_by_user_id) REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT time_change_operations_client_key UNIQUE (company_id, client_change_id),
    CONSTRAINT time_change_operations_action_check CHECK (
        action IN ('edit_entry', 'delete_entry', 'move_site', 'move_work_day', 'change_break', 'controlled_correction')
    ),
    CONSTRAINT time_change_operations_reason_check CHECK (BTRIM(reason) <> ''),
    CONSTRAINT time_change_operations_status_check CHECK (
        status IN ('applied', 'pending', 'approved', 'rejected')
    ),
    CONSTRAINT time_change_operations_review_check CHECK (
        (status IN ('applied', 'pending') AND reviewed_by_user_id IS NULL AND reviewed_at IS NULL)
        OR (status IN ('approved', 'rejected') AND reviewed_by_user_id IS NOT NULL AND reviewed_at IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS time_change_operations_user_idx
    ON time_change_operations (company_id, user_id, requested_at DESC);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'time_change_operations_company_id_id_key'
          AND conrelid = 'time_change_operations'::REGCLASS
    ) THEN
        ALTER TABLE time_change_operations
            ADD CONSTRAINT time_change_operations_company_id_id_key UNIQUE (company_id, id);
    END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS time_change_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
    operation_id UUID NOT NULL REFERENCES time_change_operations (id) ON DELETE RESTRICT,
    original_entry_id UUID,
    replacement_entry_id UUID,
    item_action VARCHAR(30) NOT NULL,
    old_value JSONB,
    new_value JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT time_change_items_original_fkey
        FOREIGN KEY (company_id, original_entry_id) REFERENCES time_entries (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT time_change_items_replacement_fkey
        FOREIGN KEY (company_id, replacement_entry_id) REFERENCES time_entries (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT time_change_items_action_check CHECK (
        item_action IN ('replace', 'invalidate', 'add', 'break_override')
    ),
    CONSTRAINT time_change_items_old_check CHECK (old_value IS NULL OR jsonb_typeof(old_value) = 'object'),
    CONSTRAINT time_change_items_new_check CHECK (new_value IS NULL OR jsonb_typeof(new_value) = 'object'),
    CONSTRAINT time_change_items_value_check CHECK (old_value IS NOT NULL OR new_value IS NOT NULL)
);

ALTER TABLE time_entries
    ADD COLUMN IF NOT EXISTS activity_note TEXT,
    ADD COLUMN IF NOT EXISTS travel_minutes_override INTEGER,
    ADD COLUMN IF NOT EXISTS edit_operation_id UUID;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'time_entries_edit_operation_fkey'
          AND conrelid = 'time_entries'::REGCLASS
    ) THEN
        ALTER TABLE time_entries ADD CONSTRAINT time_entries_edit_operation_fkey
            FOREIGN KEY (company_id, edit_operation_id)
            REFERENCES time_change_operations (company_id, id) ON DELETE RESTRICT;
    END IF;
END;
$$;

ALTER TABLE time_entries
    DROP CONSTRAINT IF EXISTS time_entries_activity_note_check,
    DROP CONSTRAINT IF EXISTS time_entries_travel_override_check;
ALTER TABLE time_entries
    ADD CONSTRAINT time_entries_activity_note_check
        CHECK (activity_note IS NULL OR BTRIM(activity_note) <> ''),
    ADD CONSTRAINT time_entries_travel_override_check
        CHECK (travel_minutes_override IS NULL OR travel_minutes_override BETWEEN 0 AND 1440);

CREATE UNIQUE INDEX IF NOT EXISTS time_entries_effective_event_key
    ON time_entries (
        company_id, user_id, work_day_id, entry_type, recorded_at,
        COALESCE(construction_site_id, '00000000-0000-0000-0000-000000000000'::UUID)
    )
    WHERE invalidated_at IS NULL
      AND correction_kind IS DISTINCT FROM 'invalidation'
      AND (correction_status IS NULL OR correction_status = 'approved');

CREATE UNIQUE INDEX IF NOT EXISTS time_entries_one_open_replacement_key
    ON time_entries (company_id, user_id, original_entry_id)
    WHERE original_entry_id IS NOT NULL
      AND invalidated_at IS NULL
      AND correction_status IN ('pending', 'approved');

CREATE OR REPLACE FUNCTION time_entries_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    original_entry_type VARCHAR(30);
    work_day_status VARCHAR(20);
    previous_approval_setting TEXT;
BEGIN
    NEW.correction_reason := NULLIF(BTRIM(NEW.correction_reason), '');
    NEW.activity_note := NULLIF(BTRIM(NEW.activity_note), '');

    IF TG_OP = 'INSERT' THEN
        NEW.invalidated_at := NULL;
        IF NEW.original_entry_id IS NOT NULL THEN
            NEW.correction_kind := COALESCE(NEW.correction_kind, 'replacement');
        END IF;
    END IF;

    SELECT status INTO work_day_status
    FROM work_days
    WHERE company_id = NEW.company_id AND user_id = NEW.user_id AND id = NEW.work_day_id;

    IF work_day_status IS NULL THEN
        RAISE EXCEPTION 'Der Ziel-Arbeitstag wurde nicht gefunden.';
    END IF;

    IF work_day_status = 'locked' THEN
        IF TG_OP = 'INSERT' AND NEW.correction_kind IS NULL THEN
            RAISE EXCEPTION 'Für einen abgerechneten Arbeitstag sind nur kontrollierte Korrekturen möglich.';
        ELSIF TG_OP = 'UPDATE'
            AND OLD.correction_kind IS NULL
            AND CURRENT_SETTING('app.approving_time_correction', TRUE) IS DISTINCT FROM 'on' THEN
            RAISE EXCEPTION 'Für einen abgerechneten Arbeitstag sind nur kontrollierte Korrekturen möglich.';
        END IF;
    END IF;

    IF TG_OP = 'INSERT' AND NEW.original_entry_id IS NOT NULL THEN
        SELECT entry_type INTO original_entry_type
        FROM time_entries
        WHERE company_id = NEW.company_id AND user_id = NEW.user_id AND id = NEW.original_entry_id;

        IF original_entry_type IS NULL THEN
            RAISE EXCEPTION 'Der zu korrigierende Zeiteintrag wurde nicht gefunden.';
        END IF;
        IF NEW.entry_type <> original_entry_type THEN
            RAISE EXCEPTION 'Die Buchungsart einer Ersetzung muss dem Original entsprechen.';
        END IF;
    END IF;

    IF TG_OP = 'INSERT' AND NEW.correction_kind IS NOT NULL THEN
        IF NEW.correction_kind = 'addition' AND NEW.original_entry_id IS NOT NULL THEN
            RAISE EXCEPTION 'Eine ergänzte Buchung darf kein Original referenzieren.';
        END IF;
        IF NEW.correction_kind IN ('replacement', 'invalidation') AND NEW.original_entry_id IS NULL THEN
            RAISE EXCEPTION 'Diese Korrektur benötigt eine Originalbuchung.';
        END IF;
        NEW.correction_status := 'pending';
        NEW.reviewed_by_user_id := NULL;
        NEW.reviewed_at := NULL;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF NEW.company_id <> OLD.company_id
            OR NEW.user_id <> OLD.user_id
            OR NEW.work_day_id <> OLD.work_day_id
            OR NEW.construction_site_id IS DISTINCT FROM OLD.construction_site_id
            OR NEW.entry_type <> OLD.entry_type
            OR NEW.recorded_at <> OLD.recorded_at
            OR NEW.client_entry_id <> OLD.client_entry_id
            OR NEW.client_created_at <> OLD.client_created_at
            OR NEW.source <> OLD.source
            OR NEW.entered_by_user_id IS DISTINCT FROM OLD.entered_by_user_id
            OR NEW.original_entry_id IS DISTINCT FROM OLD.original_entry_id
            OR NEW.correction_kind IS DISTINCT FROM OLD.correction_kind
            OR NEW.correction_reason IS DISTINCT FROM OLD.correction_reason
            OR NEW.activity_note IS DISTINCT FROM OLD.activity_note
            OR NEW.travel_minutes_override IS DISTINCT FROM OLD.travel_minutes_override
            OR NEW.edit_operation_id IS DISTINCT FROM OLD.edit_operation_id
            OR NEW.created_at <> OLD.created_at THEN
            RAISE EXCEPTION 'Zeitbuchungen sind unveränderlich; bitte eine protokollierte Korrektur anlegen.';
        END IF;

        IF OLD.correction_kind IS NULL
            AND NEW.correction_status IS DISTINCT FROM OLD.correction_status THEN
            RAISE EXCEPTION 'Nur Korrektureinträge besitzen einen Prüfstatus.';
        END IF;
        IF NEW.invalidated_at IS DISTINCT FROM OLD.invalidated_at
            AND CURRENT_SETTING('app.approving_time_correction', TRUE) IS DISTINCT FROM 'on' THEN
            RAISE EXCEPTION 'Ein Original darf nur durch eine genehmigte Korrektur entwertet werden.';
        END IF;
        IF OLD.correction_status IN ('approved', 'rejected')
            AND NEW.correction_status IS DISTINCT FROM OLD.correction_status THEN
            RAISE EXCEPTION 'Eine entschiedene Korrektur kann nicht erneut bewertet werden.';
        END IF;

        IF OLD.correction_status = 'pending'
            AND NEW.correction_status IN ('approved', 'rejected') THEN
            IF NEW.reviewed_by_user_id IS NULL THEN
                RAISE EXCEPTION 'Eine Korrekturentscheidung benötigt einen Prüfer.';
            END IF;
            NEW.reviewed_at := COALESCE(NEW.reviewed_at, CURRENT_TIMESTAMP);

            IF NEW.correction_status = 'approved'
                AND NEW.correction_kind IN ('replacement', 'invalidation') THEN
                previous_approval_setting := CURRENT_SETTING('app.approving_time_correction', TRUE);
                PERFORM set_config('app.approving_time_correction', 'on', TRUE);
                UPDATE time_entries
                SET invalidated_at = CURRENT_TIMESTAMP
                WHERE company_id = NEW.company_id AND user_id = NEW.user_id
                  AND id = NEW.original_entry_id AND invalidated_at IS NULL;
                PERFORM set_config('app.approving_time_correction', COALESCE(previous_approval_setting, ''), TRUE);
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION recalculate_work_day(
    target_company_id UUID,
    target_user_id UUID,
    target_work_day_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    calculated_clock_in TIMESTAMPTZ;
    calculated_clock_out TIMESTAMPTZ;
    calculated_gross INTEGER := 0;
    calculated_break INTEGER := 0;
    calculated_work INTEGER := 0;
    calculated_recorded_work INTEGER := 0;
    calculated_explicit_break INTEGER := 0;
    calculated_required_break INTEGER := 0;
    calculated_travel INTEGER := 0;
    target_minutes INTEGER := 0;
    configured_break_override INTEGER;
    previous_recalculation_setting TEXT;
BEGIN
    WITH effective_entries AS (
        SELECT entry_type, recorded_at
        FROM time_entries
        WHERE company_id = target_company_id AND user_id = target_user_id
          AND work_day_id = target_work_day_id AND invalidated_at IS NULL
          AND correction_kind IS DISTINCT FROM 'invalidation'
          AND ((original_entry_id IS NULL AND correction_status IS NULL) OR correction_status = 'approved')
    )
    SELECT MIN(recorded_at) FILTER (WHERE entry_type = 'clock_in'),
           MAX(recorded_at) FILTER (WHERE entry_type = 'clock_out')
    INTO calculated_clock_in, calculated_clock_out
    FROM effective_entries;

    IF calculated_clock_in IS NOT NULL AND calculated_clock_out IS NOT NULL
       AND calculated_clock_out >= calculated_clock_in THEN
        calculated_gross := FLOOR(EXTRACT(EPOCH FROM (calculated_clock_out - calculated_clock_in)) / 60)::INTEGER;
    END IF;

    WITH effective_entries AS (
        SELECT id, entry_type, recorded_at
        FROM time_entries
        WHERE company_id = target_company_id AND user_id = target_user_id
          AND work_day_id = target_work_day_id AND invalidated_at IS NULL
          AND correction_kind IS DISTINCT FROM 'invalidation'
          AND ((original_entry_id IS NULL AND correction_status IS NULL) OR correction_status = 'approved')
    ), work_segments AS (
        SELECT start_entry.recorded_at AS starts_at,
               (SELECT MIN(end_entry.recorded_at)
                FROM effective_entries AS end_entry
                WHERE end_entry.recorded_at > start_entry.recorded_at
                  AND end_entry.entry_type = 'clock_out'
                  AND NOT EXISTS (
                      SELECT 1 FROM effective_entries AS next_start
                      WHERE next_start.entry_type = 'clock_in'
                        AND next_start.recorded_at > start_entry.recorded_at
                        AND next_start.recorded_at < end_entry.recorded_at
                  )) AS ends_at
        FROM effective_entries AS start_entry WHERE start_entry.entry_type = 'clock_in'
    )
    SELECT COALESCE(SUM(FLOOR(EXTRACT(EPOCH FROM (ends_at - starts_at)) / 60)), 0)::INTEGER
    INTO calculated_recorded_work
    FROM work_segments WHERE ends_at IS NOT NULL AND ends_at >= starts_at;

    calculated_explicit_break := GREATEST(calculated_gross - calculated_recorded_work, 0);
    calculated_required_break := CASE
        WHEN calculated_gross >= 360 THEN 60
        WHEN calculated_gross >= 210 THEN 30
        ELSE 0
    END;

    SELECT target_work_minutes, break_minutes_override
    INTO target_minutes, configured_break_override
    FROM work_days
    WHERE company_id = target_company_id AND user_id = target_user_id AND id = target_work_day_id;

    calculated_break := LEAST(
        COALESCE(configured_break_override, GREATEST(calculated_explicit_break, calculated_required_break)),
        calculated_gross
    );
    calculated_work := GREATEST(calculated_gross - calculated_break, 0);

    WITH effective_entries AS (
        SELECT entry_type, recorded_at, travel_minutes_override
        FROM time_entries
        WHERE company_id = target_company_id AND user_id = target_user_id
          AND work_day_id = target_work_day_id AND invalidated_at IS NULL
          AND correction_kind IS DISTINCT FROM 'invalidation'
          AND ((original_entry_id IS NULL AND correction_status IS NULL) OR correction_status = 'approved')
    ), travel_segments AS (
        SELECT start_entry.recorded_at AS starts_at,
               start_entry.travel_minutes_override AS override_minutes,
               (SELECT MIN(end_entry.recorded_at)
                FROM effective_entries AS end_entry
                WHERE end_entry.recorded_at > start_entry.recorded_at
                  AND end_entry.entry_type IN ('site_arrival', 'clock_out')) AS ends_at
        FROM effective_entries AS start_entry
        WHERE start_entry.entry_type IN ('clock_in', 'site_departure')
    )
    SELECT COALESCE(SUM(
        COALESCE(override_minutes, FLOOR(EXTRACT(EPOCH FROM (ends_at - starts_at)) / 60)::INTEGER)
    ), 0)::INTEGER
    INTO calculated_travel
    FROM travel_segments WHERE ends_at IS NOT NULL AND ends_at >= starts_at;

    previous_recalculation_setting := CURRENT_SETTING('app.recalculating_work_day', TRUE);
    PERFORM set_config('app.recalculating_work_day', 'on', TRUE);
    UPDATE work_days
    SET first_clock_in_at = calculated_clock_in,
        last_clock_out_at = calculated_clock_out,
        gross_minutes = calculated_gross,
        break_minutes = calculated_break,
        work_minutes = calculated_work,
        travel_minutes = LEAST(calculated_travel, calculated_work),
        overtime_minutes = GREATEST(calculated_work - COALESCE(target_minutes, 0), 0),
        calculation_version = 4
    WHERE company_id = target_company_id AND user_id = target_user_id AND id = target_work_day_id;
    PERFORM set_config('app.recalculating_work_day', COALESCE(previous_recalculation_setting, ''), TRUE);
END;
$$;

CREATE OR REPLACE FUNCTION work_days_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE configured_target INTEGER;
BEGIN
    NEW.note := NULLIF(BTRIM(NEW.note), '');
    NEW.break_override_reason := NULLIF(BTRIM(NEW.break_override_reason), '');
    IF TG_OP = 'INSERT' AND NEW.target_work_minutes IS NULL THEN
        SELECT (weekly_target_minutes ->> EXTRACT(ISODOW FROM NEW.work_date)::INTEGER::TEXT)::INTEGER
        INTO configured_target FROM users
        WHERE company_id = NEW.company_id AND id = NEW.user_id;
        NEW.target_work_minutes := COALESCE(configured_target, 0);
    END IF;

    IF NEW.status = 'open' THEN
        NEW.submitted_at := NULL; NEW.approved_at := NULL; NEW.approved_by_user_id := NULL;
        NEW.locked_at := NULL; NEW.locked_by_user_id := NULL;
    ELSIF NEW.status = 'submitted' THEN
        NEW.submitted_at := COALESCE(NEW.submitted_at, CURRENT_TIMESTAMP);
        NEW.approved_at := NULL; NEW.approved_by_user_id := NULL; NEW.locked_at := NULL; NEW.locked_by_user_id := NULL;
    ELSIF NEW.status = 'approved' THEN
        NEW.submitted_at := COALESCE(NEW.submitted_at, CURRENT_TIMESTAMP);
        NEW.approved_at := COALESCE(NEW.approved_at, CURRENT_TIMESTAMP);
        NEW.locked_at := NULL; NEW.locked_by_user_id := NULL;
    ELSIF NEW.status = 'locked' THEN
        NEW.submitted_at := COALESCE(NEW.submitted_at, CURRENT_TIMESTAMP);
        NEW.approved_at := COALESCE(NEW.approved_at, CURRENT_TIMESTAMP);
        NEW.locked_at := COALESCE(NEW.locked_at, CURRENT_TIMESTAMP);
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF NEW.company_id <> OLD.company_id OR NEW.user_id <> OLD.user_id OR NEW.work_date <> OLD.work_date THEN
            RAISE EXCEPTION 'Firma, Mitarbeiter und Datum eines Arbeitstags sind unveränderlich.';
        END IF;
        IF OLD.status IN ('approved', 'locked')
           AND CURRENT_SETTING('app.recalculating_work_day', TRUE) IS DISTINCT FROM 'on'
           AND CURRENT_SETTING('app.controlled_time_correction', TRUE) IS DISTINCT FROM 'on' THEN
            RAISE EXCEPTION 'Ein endgültig freigegebener oder abgerechneter Arbeitstag benötigt einen kontrollierten Korrekturprozess.';
        END IF;
        IF CURRENT_SETTING('app.recalculating_work_day', TRUE) IS DISTINCT FROM 'on'
           AND (
                NEW.first_clock_in_at IS DISTINCT FROM OLD.first_clock_in_at
                OR NEW.last_clock_out_at IS DISTINCT FROM OLD.last_clock_out_at
                OR NEW.gross_minutes IS DISTINCT FROM OLD.gross_minutes
                OR NEW.break_minutes IS DISTINCT FROM OLD.break_minutes
                OR NEW.work_minutes IS DISTINCT FROM OLD.work_minutes
                OR NEW.travel_minutes IS DISTINCT FROM OLD.travel_minutes
                OR NEW.overtime_minutes IS DISTINCT FROM OLD.overtime_minutes
                OR NEW.calculation_version IS DISTINCT FROM OLD.calculation_version
           ) THEN
            RAISE EXCEPTION 'Berechnete Arbeitszeitwerte dürfen nicht manuell geändert werden.';
        END IF;
        NEW.updated_at := CURRENT_TIMESTAMP;
        NEW.row_version := OLD.row_version + 1;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION time_change_history_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Das Zeitkorrektur-Audit ist unveränderlich.';
END;
$$;

CREATE OR REPLACE FUNCTION time_change_operations_before_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.company_id <> OLD.company_id
       OR NEW.user_id <> OLD.user_id
       OR NEW.client_change_id <> OLD.client_change_id
       OR NEW.action <> OLD.action
       OR NEW.reason <> OLD.reason
       OR NEW.requested_by_user_id IS DISTINCT FROM OLD.requested_by_user_id
       OR NEW.requested_at <> OLD.requested_at THEN
        RAISE EXCEPTION 'Der Inhalt eines Zeitkorrekturvorgangs ist unveränderlich.';
    END IF;
    IF OLD.status <> 'pending'
       OR NEW.status NOT IN ('approved','rejected')
       OR NEW.reviewed_by_user_id IS NULL
       OR NEW.reviewed_at IS NULL THEN
        RAISE EXCEPTION 'Ein Zeitkorrekturvorgang darf nur einmal kontrolliert entschieden werden.';
    END IF;
    NEW.row_version := OLD.row_version + 1;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS time_change_operations_before_update_trigger ON time_change_operations;
CREATE TRIGGER time_change_operations_before_update_trigger
    BEFORE UPDATE ON time_change_operations
    FOR EACH ROW EXECUTE FUNCTION time_change_operations_before_update();

DROP TRIGGER IF EXISTS time_change_operations_prevent_delete_trigger ON time_change_operations;
CREATE TRIGGER time_change_operations_prevent_delete_trigger
    BEFORE DELETE ON time_change_operations
    FOR EACH ROW EXECUTE FUNCTION time_change_history_immutable();

DROP TRIGGER IF EXISTS time_change_items_immutable_trigger ON time_change_items;
CREATE TRIGGER time_change_items_immutable_trigger
    BEFORE UPDATE OR DELETE ON time_change_items
    FOR EACH ROW EXECUTE FUNCTION time_change_history_immutable();

ALTER TABLE time_change_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_change_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS time_change_operations_tenant_isolation ON time_change_operations;
CREATE POLICY time_change_operations_tenant_isolation ON time_change_operations
    USING (company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID)
    WITH CHECK (company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID);
DROP POLICY IF EXISTS time_change_items_tenant_isolation ON time_change_items;
CREATE POLICY time_change_items_tenant_isolation ON time_change_items
    USING (company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID)
    WITH CHECK (company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID);
GRANT SELECT, INSERT, UPDATE ON time_change_operations TO schaefchen_api;
GRANT SELECT, INSERT ON time_change_items TO schaefchen_api;
ALTER TABLE time_change_operations NO FORCE ROW LEVEL SECURITY;
ALTER TABLE time_change_items NO FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE VIEW pending_time_entry_corrections_v2
WITH (security_invoker = TRUE)
AS
SELECT
    entry.id,
    entry.company_id,
    entry.user_id,
    entry.work_day_id,
    day.work_date,
    entry.original_entry_id,
    entry.entry_type,
    entry.recorded_at AS requested_recorded_at,
    original.recorded_at AS original_recorded_at,
    entry.correction_reason,
    entry.created_at AS requested_at,
    entry.correction_kind,
    entry.edit_operation_id
FROM time_entries AS entry
LEFT JOIN time_entries AS original
  ON original.company_id = entry.company_id
 AND original.user_id = entry.user_id
 AND original.id = entry.original_entry_id
JOIN work_days AS day
  ON day.company_id = entry.company_id
 AND day.user_id = entry.user_id
 AND day.id = entry.work_day_id
WHERE entry.correction_status = 'pending';

GRANT SELECT ON pending_time_entry_corrections_v2 TO schaefchen_api;

COMMENT ON TABLE time_change_operations IS
    'Idempotente, begründete Änderung oder kontrollierte Korrektur eines Zeiteintrags.';
COMMENT ON TABLE time_change_items IS
    'Unveränderliche Vorher-/Nachher-Werte je Bestandteil einer Zeitänderung.';
COMMENT ON COLUMN work_days.break_minutes_override IS
    'Begründete Pausenkorrektur; jede Neuberechnung verwendet diesen Wert reproduzierbar.';
COMMENT ON COLUMN time_entries.travel_minutes_override IS
    'Optional korrigierte Fahrtdauer des mit diesem Start-Ereignis beginnenden Fahrtsegments.';

COMMIT;
