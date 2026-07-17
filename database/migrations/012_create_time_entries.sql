BEGIN;

CREATE TABLE IF NOT EXISTS time_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    user_id UUID NOT NULL,
    work_day_id UUID NOT NULL,
    construction_site_id UUID,
    entry_type VARCHAR(30) NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL,
    client_entry_id UUID NOT NULL,
    client_created_at TIMESTAMPTZ NOT NULL,
    source VARCHAR(20) NOT NULL DEFAULT 'employee',
    entered_by_user_id UUID,
    original_entry_id UUID,
    correction_status VARCHAR(20),
    correction_reason TEXT,
    reviewed_by_user_id UUID,
    reviewed_at TIMESTAMPTZ,
    invalidated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT time_entries_company_id_fkey
        FOREIGN KEY (company_id)
        REFERENCES companies (id)
        ON DELETE RESTRICT,
    CONSTRAINT time_entries_user_fkey
        FOREIGN KEY (company_id, user_id)
        REFERENCES users (company_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT time_entries_work_day_fkey
        FOREIGN KEY (company_id, user_id, work_day_id)
        REFERENCES work_days (company_id, user_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT time_entries_site_fkey
        FOREIGN KEY (company_id, construction_site_id)
        REFERENCES construction_sites (company_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT time_entries_entered_by_fkey
        FOREIGN KEY (company_id, entered_by_user_id)
        REFERENCES users (company_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT time_entries_reviewed_by_fkey
        FOREIGN KEY (company_id, reviewed_by_user_id)
        REFERENCES users (company_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT time_entries_company_user_id_key UNIQUE (company_id, user_id, id),
    CONSTRAINT time_entries_original_fkey
        FOREIGN KEY (company_id, user_id, original_entry_id)
        REFERENCES time_entries (company_id, user_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT time_entries_client_entry_key UNIQUE (company_id, user_id, client_entry_id),
    CONSTRAINT time_entries_type_check CHECK (
        entry_type IN (
            'clock_in',
            'site_arrival',
            'site_departure',
            'next_site',
            'clock_out'
        )
    ),
    CONSTRAINT time_entries_site_required_check CHECK (
        (entry_type IN ('site_arrival', 'site_departure', 'next_site') AND construction_site_id IS NOT NULL)
        OR
        (entry_type IN ('clock_in', 'clock_out') AND construction_site_id IS NULL)
    ),
    CONSTRAINT time_entries_source_check CHECK (
        source IN ('employee', 'office', 'automatic', 'import', 'offline')
    ),
    CONSTRAINT time_entries_correction_status_check CHECK (
        correction_status IS NULL OR correction_status IN ('pending', 'approved', 'rejected')
    ),
    CONSTRAINT time_entries_correction_shape_check CHECK (
        (
            original_entry_id IS NULL
            AND correction_status IS NULL
            AND correction_reason IS NULL
            AND reviewed_by_user_id IS NULL
            AND reviewed_at IS NULL
        )
        OR
        (
            original_entry_id IS NOT NULL
            AND correction_status IS NOT NULL
            AND correction_reason IS NOT NULL
            AND BTRIM(correction_reason) <> ''
            AND (
                (correction_status = 'pending' AND reviewed_by_user_id IS NULL AND reviewed_at IS NULL)
                OR
                (correction_status IN ('approved', 'rejected') AND reviewed_by_user_id IS NOT NULL AND reviewed_at IS NOT NULL)
            )
        )
    ),
    CONSTRAINT time_entries_not_self_correction_check CHECK (
        original_entry_id IS NULL OR original_entry_id <> id
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS time_entries_one_effective_clock_in_key
    ON time_entries (company_id, user_id, work_day_id)
    WHERE entry_type = 'clock_in'
      AND invalidated_at IS NULL
      AND (original_entry_id IS NULL OR correction_status = 'approved');

CREATE UNIQUE INDEX IF NOT EXISTS time_entries_one_effective_clock_out_key
    ON time_entries (company_id, user_id, work_day_id)
    WHERE entry_type = 'clock_out'
      AND invalidated_at IS NULL
      AND (original_entry_id IS NULL OR correction_status = 'approved');

CREATE INDEX IF NOT EXISTS time_entries_work_day_timeline_idx
    ON time_entries (company_id, user_id, work_day_id, recorded_at, created_at);

CREATE INDEX IF NOT EXISTS time_entries_pending_corrections_idx
    ON time_entries (company_id, created_at)
    WHERE correction_status = 'pending';

CREATE OR REPLACE FUNCTION time_entries_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    original_work_day_id UUID;
    original_entry_type VARCHAR(30);
    work_day_status VARCHAR(20);
    previous_approval_setting TEXT;
BEGIN
    NEW.correction_reason := NULLIF(BTRIM(NEW.correction_reason), '');

    IF TG_OP = 'INSERT' THEN
        NEW.invalidated_at := NULL;
    END IF;

    SELECT status
    INTO work_day_status
    FROM work_days
    WHERE company_id = NEW.company_id
      AND user_id = NEW.user_id
      AND id = NEW.work_day_id;

    IF work_day_status = 'locked' THEN
        RAISE EXCEPTION 'Für einen gesperrten Arbeitstag sind keine Zeitbuchungen mehr möglich.';
    END IF;

    IF TG_OP = 'INSERT' AND NEW.original_entry_id IS NOT NULL THEN
        SELECT work_day_id, entry_type
        INTO original_work_day_id, original_entry_type
        FROM time_entries
        WHERE company_id = NEW.company_id
          AND user_id = NEW.user_id
          AND id = NEW.original_entry_id;

        IF original_work_day_id IS NULL THEN
            RAISE EXCEPTION 'Der zu korrigierende Zeiteintrag wurde nicht gefunden.';
        END IF;

        IF NEW.work_day_id <> original_work_day_id OR NEW.entry_type <> original_entry_type THEN
            RAISE EXCEPTION 'Eine Korrektur muss Arbeitstag und Buchungsart des Originals beibehalten.';
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
            OR NEW.correction_reason IS DISTINCT FROM OLD.correction_reason
            OR NEW.created_at <> OLD.created_at THEN
            RAISE EXCEPTION 'Zeitbuchungen sind unveränderlich; bitte eine Korrektur anlegen.';
        END IF;

        IF OLD.original_entry_id IS NULL
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

            IF NEW.correction_status = 'approved' THEN
                previous_approval_setting := CURRENT_SETTING('app.approving_time_correction', TRUE);
                PERFORM set_config('app.approving_time_correction', 'on', TRUE);

                UPDATE time_entries
                SET invalidated_at = CURRENT_TIMESTAMP
                WHERE company_id = NEW.company_id
                  AND user_id = NEW.user_id
                  AND id = NEW.original_entry_id
                  AND invalidated_at IS NULL;

                PERFORM set_config(
                    'app.approving_time_correction',
                    COALESCE(previous_approval_setting, ''),
                    TRUE
                );
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS time_entries_before_write_trigger ON time_entries;
CREATE TRIGGER time_entries_before_write_trigger
    BEFORE INSERT OR UPDATE ON time_entries
    FOR EACH ROW
    EXECUTE FUNCTION time_entries_before_write();

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
    calculated_travel INTEGER := 0;
    target_minutes INTEGER := 0;
    previous_recalculation_setting TEXT;
BEGIN
    WITH effective_entries AS (
        SELECT entry_type, recorded_at
        FROM time_entries
        WHERE company_id = target_company_id
          AND user_id = target_user_id
          AND work_day_id = target_work_day_id
          AND invalidated_at IS NULL
          AND (
              (original_entry_id IS NULL AND correction_status IS NULL)
              OR correction_status = 'approved'
          )
    )
    SELECT
        MIN(recorded_at) FILTER (WHERE entry_type = 'clock_in'),
        MAX(recorded_at) FILTER (WHERE entry_type = 'clock_out')
    INTO calculated_clock_in, calculated_clock_out
    FROM effective_entries;

    IF calculated_clock_in IS NOT NULL
        AND calculated_clock_out IS NOT NULL
        AND calculated_clock_out >= calculated_clock_in THEN
        calculated_gross := FLOOR(
            EXTRACT(EPOCH FROM (calculated_clock_out - calculated_clock_in)) / 60
        )::INTEGER;
    END IF;

    calculated_break := CASE
        WHEN calculated_gross >= 360 THEN 60
        WHEN calculated_gross >= 210 THEN 30
        ELSE 0
    END;
    calculated_work := GREATEST(calculated_gross - calculated_break, 0);

    WITH effective_entries AS (
        SELECT id, entry_type, recorded_at
        FROM time_entries
        WHERE company_id = target_company_id
          AND user_id = target_user_id
          AND work_day_id = target_work_day_id
          AND invalidated_at IS NULL
          AND (
              (original_entry_id IS NULL AND correction_status IS NULL)
              OR correction_status = 'approved'
          )
    ),
    travel_segments AS (
        SELECT
            start_entry.recorded_at AS starts_at,
            (
                SELECT MIN(end_entry.recorded_at)
                FROM effective_entries AS end_entry
                WHERE end_entry.recorded_at > start_entry.recorded_at
                  AND end_entry.entry_type IN ('site_arrival', 'clock_out')
            ) AS ends_at
        FROM effective_entries AS start_entry
        WHERE start_entry.entry_type IN ('clock_in', 'site_departure')
    )
    SELECT COALESCE(
        SUM(FLOOR(EXTRACT(EPOCH FROM (ends_at - starts_at)) / 60)),
        0
    )::INTEGER
    INTO calculated_travel
    FROM travel_segments
    WHERE ends_at IS NOT NULL
      AND ends_at >= starts_at;

    SELECT target_work_minutes
    INTO target_minutes
    FROM work_days
    WHERE company_id = target_company_id
      AND user_id = target_user_id
      AND id = target_work_day_id;

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
        calculation_version = 1
    WHERE company_id = target_company_id
      AND user_id = target_user_id
      AND id = target_work_day_id;

    PERFORM set_config(
        'app.recalculating_work_day',
        COALESCE(previous_recalculation_setting, ''),
        TRUE
    );
END;
$$;

CREATE OR REPLACE FUNCTION time_entries_after_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    PERFORM recalculate_work_day(NEW.company_id, NEW.user_id, NEW.work_day_id);

    IF TG_OP = 'INSERT' AND NEW.correction_status = 'pending' THEN
        PERFORM pg_notify('schaefchen_time_correction', NEW.id::TEXT);
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS time_entries_after_write_trigger ON time_entries;
CREATE TRIGGER time_entries_after_write_trigger
    AFTER INSERT OR UPDATE ON time_entries
    FOR EACH ROW
    EXECUTE FUNCTION time_entries_after_write();

CREATE OR REPLACE FUNCTION time_entries_prevent_hard_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF CURRENT_SETTING('app.allow_hard_delete', TRUE) = 'on' THEN
        RETURN OLD;
    END IF;

    RAISE EXCEPTION 'Zeitbuchungen dürfen nicht gelöscht werden; Korrekturen bleiben historisch erhalten.';
END;
$$;

DROP TRIGGER IF EXISTS time_entries_prevent_hard_delete_trigger ON time_entries;
CREATE TRIGGER time_entries_prevent_hard_delete_trigger
    BEFORE DELETE ON time_entries
    FOR EACH ROW
    EXECUTE FUNCTION time_entries_prevent_hard_delete();

ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS time_entries_tenant_isolation ON time_entries;
CREATE POLICY time_entries_tenant_isolation ON time_entries
    USING (company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID)
    WITH CHECK (company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID);

CREATE OR REPLACE VIEW pending_time_entry_corrections
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
    entry.created_at AS requested_at
FROM time_entries AS entry
JOIN time_entries AS original
  ON original.company_id = entry.company_id
 AND original.user_id = entry.user_id
 AND original.id = entry.original_entry_id
JOIN work_days AS day
  ON day.company_id = entry.company_id
 AND day.user_id = entry.user_id
 AND day.id = entry.work_day_id
WHERE entry.correction_status = 'pending';

GRANT SELECT, INSERT, UPDATE ON time_entries TO schaefchen_api;
GRANT SELECT ON pending_time_entry_corrections TO schaefchen_api;
ALTER TABLE time_entries NO FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE time_entries IS 'Offline-fähige, unveränderliche Zeitereignisse ohne GPS-Speicherung.';
COMMENT ON COLUMN time_entries.client_entry_id IS 'Vom Endgerät einmalig erzeugte UUID zur idempotenten Offline-Synchronisation.';
COMMENT ON COLUMN time_entries.original_entry_id IS 'Korrekturen werden als neuer Eintrag angelegt; das Original bleibt erhalten.';
COMMENT ON VIEW pending_time_entry_corrections IS 'Offene Korrekturanträge für Büroprüfung und Benachrichtigung.';

COMMIT;
