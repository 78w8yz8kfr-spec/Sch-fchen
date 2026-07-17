BEGIN;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS weekly_target_minutes JSONB NOT NULL
    DEFAULT '{"1":510,"2":510,"3":510,"4":510,"5":360,"6":0,"7":0}'::JSONB;

CREATE OR REPLACE FUNCTION weekly_target_minutes_valid(targets JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
    SELECT jsonb_typeof(targets) = 'object'
       AND targets ?& ARRAY['1', '2', '3', '4', '5', '6', '7']
       AND NOT EXISTS (
            SELECT 1
            FROM jsonb_each(targets) AS entry(day_key, minutes_value)
            WHERE day_key !~ '^[1-7]$'
               OR jsonb_typeof(minutes_value) <> 'number'
               OR (minutes_value #>> '{}')::NUMERIC <> TRUNC((minutes_value #>> '{}')::NUMERIC)
               OR (minutes_value #>> '{}')::INTEGER NOT BETWEEN 0 AND 1440
       );
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'users_weekly_target_minutes_check'
          AND conrelid = 'users'::REGCLASS
    ) THEN
        ALTER TABLE users
            ADD CONSTRAINT users_weekly_target_minutes_check
            CHECK (weekly_target_minutes_valid(weekly_target_minutes));
    END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS work_days (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    user_id UUID NOT NULL,
    work_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'open',
    target_work_minutes INTEGER NOT NULL,
    first_clock_in_at TIMESTAMPTZ,
    last_clock_out_at TIMESTAMPTZ,
    gross_minutes INTEGER NOT NULL DEFAULT 0,
    break_minutes INTEGER NOT NULL DEFAULT 0,
    work_minutes INTEGER NOT NULL DEFAULT 0,
    travel_minutes INTEGER NOT NULL DEFAULT 0,
    overtime_minutes INTEGER NOT NULL DEFAULT 0,
    calculation_version INTEGER NOT NULL DEFAULT 1,
    note TEXT,
    submitted_at TIMESTAMPTZ,
    approved_at TIMESTAMPTZ,
    approved_by_user_id UUID,
    locked_at TIMESTAMPTZ,
    locked_by_user_id UUID,
    correction_requested_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    row_version BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT work_days_company_id_fkey
        FOREIGN KEY (company_id)
        REFERENCES companies (id)
        ON DELETE RESTRICT,
    CONSTRAINT work_days_user_fkey
        FOREIGN KEY (company_id, user_id)
        REFERENCES users (company_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT work_days_approved_by_fkey
        FOREIGN KEY (company_id, approved_by_user_id)
        REFERENCES users (company_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT work_days_locked_by_fkey
        FOREIGN KEY (company_id, locked_by_user_id)
        REFERENCES users (company_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT work_days_company_user_date_key UNIQUE (company_id, user_id, work_date),
    CONSTRAINT work_days_company_user_id_key UNIQUE (company_id, user_id, id),
    CONSTRAINT work_days_status_check CHECK (
        status IN ('open', 'submitted', 'approved', 'locked')
    ),
    CONSTRAINT work_days_target_minutes_check CHECK (
        target_work_minutes BETWEEN 0 AND 1440
    ),
    CONSTRAINT work_days_calculated_minutes_check CHECK (
        gross_minutes >= 0
        AND break_minutes >= 0
        AND work_minutes >= 0
        AND travel_minutes >= 0
        AND overtime_minutes >= 0
        AND break_minutes <= gross_minutes
        AND work_minutes + break_minutes = gross_minutes
        AND travel_minutes <= work_minutes
    ),
    CONSTRAINT work_days_clock_order_check CHECK (
        last_clock_out_at IS NULL
        OR first_clock_in_at IS NULL
        OR last_clock_out_at >= first_clock_in_at
    ),
    CONSTRAINT work_days_calculation_version_check CHECK (calculation_version >= 1),
    CONSTRAINT work_days_note_not_blank CHECK (
        note IS NULL OR BTRIM(note) <> ''
    ),
    CONSTRAINT work_days_state_timestamps_check CHECK (
        (status = 'open' AND submitted_at IS NULL AND approved_at IS NULL AND locked_at IS NULL)
        OR
        (status = 'submitted' AND submitted_at IS NOT NULL AND approved_at IS NULL AND locked_at IS NULL)
        OR
        (status = 'approved' AND submitted_at IS NOT NULL AND approved_at IS NOT NULL AND locked_at IS NULL)
        OR
        (status = 'locked' AND submitted_at IS NOT NULL AND approved_at IS NOT NULL AND locked_at IS NOT NULL)
    ),
    CONSTRAINT work_days_approver_check CHECK (
        (approved_at IS NULL AND approved_by_user_id IS NULL)
        OR approved_at IS NOT NULL
    ),
    CONSTRAINT work_days_locker_check CHECK (
        (locked_at IS NULL AND locked_by_user_id IS NULL)
        OR locked_at IS NOT NULL
    )
);

CREATE INDEX IF NOT EXISTS work_days_company_date_idx
    ON work_days (company_id, work_date, status);

CREATE INDEX IF NOT EXISTS work_days_user_date_idx
    ON work_days (company_id, user_id, work_date DESC);

CREATE OR REPLACE FUNCTION work_days_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    configured_target INTEGER;
BEGIN
    NEW.note := NULLIF(BTRIM(NEW.note), '');

    IF TG_OP = 'INSERT' AND NEW.target_work_minutes IS NULL THEN
        SELECT (weekly_target_minutes ->> EXTRACT(ISODOW FROM NEW.work_date)::INTEGER::TEXT)::INTEGER
        INTO configured_target
        FROM users
        WHERE company_id = NEW.company_id
          AND id = NEW.user_id;

        NEW.target_work_minutes := COALESCE(configured_target, 0);
    END IF;

    IF NEW.status = 'open' THEN
        NEW.submitted_at := NULL;
        NEW.approved_at := NULL;
        NEW.approved_by_user_id := NULL;
        NEW.locked_at := NULL;
        NEW.locked_by_user_id := NULL;
    ELSIF NEW.status = 'submitted' THEN
        NEW.submitted_at := COALESCE(NEW.submitted_at, CURRENT_TIMESTAMP);
        NEW.approved_at := NULL;
        NEW.approved_by_user_id := NULL;
        NEW.locked_at := NULL;
        NEW.locked_by_user_id := NULL;
    ELSIF NEW.status = 'approved' THEN
        NEW.submitted_at := COALESCE(NEW.submitted_at, CURRENT_TIMESTAMP);
        NEW.approved_at := COALESCE(NEW.approved_at, CURRENT_TIMESTAMP);
        NEW.locked_at := NULL;
        NEW.locked_by_user_id := NULL;
    ELSIF NEW.status = 'locked' THEN
        NEW.submitted_at := COALESCE(NEW.submitted_at, CURRENT_TIMESTAMP);
        NEW.approved_at := COALESCE(NEW.approved_at, CURRENT_TIMESTAMP);
        NEW.locked_at := COALESCE(NEW.locked_at, CURRENT_TIMESTAMP);
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF NEW.company_id <> OLD.company_id
            OR NEW.user_id <> OLD.user_id
            OR NEW.work_date <> OLD.work_date THEN
            RAISE EXCEPTION 'Firma, Mitarbeiter und Datum eines Arbeitstags sind unveränderlich.';
        END IF;

        IF OLD.status = 'locked'
            AND CURRENT_SETTING('app.recalculating_work_day', TRUE) IS DISTINCT FROM 'on' THEN
            RAISE EXCEPTION 'Ein gesperrter Arbeitstag kann nicht mehr geändert werden.';
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

DROP TRIGGER IF EXISTS work_days_before_write_trigger ON work_days;
CREATE TRIGGER work_days_before_write_trigger
    BEFORE INSERT OR UPDATE ON work_days
    FOR EACH ROW
    EXECUTE FUNCTION work_days_before_write();

CREATE OR REPLACE FUNCTION work_days_prevent_hard_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF CURRENT_SETTING('app.allow_hard_delete', TRUE) = 'on' THEN
        RETURN OLD;
    END IF;

    RAISE EXCEPTION 'Arbeitstage dürfen nach der Erfassung nicht hart gelöscht werden.';
END;
$$;

DROP TRIGGER IF EXISTS work_days_prevent_hard_delete_trigger ON work_days;
CREATE TRIGGER work_days_prevent_hard_delete_trigger
    BEFORE DELETE ON work_days
    FOR EACH ROW
    EXECUTE FUNCTION work_days_prevent_hard_delete();

ALTER TABLE work_days ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS work_days_tenant_isolation ON work_days;
CREATE POLICY work_days_tenant_isolation ON work_days
    USING (company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID)
    WITH CHECK (company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID);

GRANT SELECT, INSERT, UPDATE ON work_days TO schaefchen_api;
ALTER TABLE work_days FORCE ROW LEVEL SECURITY;

COMMENT ON COLUMN users.weekly_target_minutes IS 'Individuelle Sollminuten je ISO-Wochentag 1 (Montag) bis 7 (Sonntag).';
COMMENT ON TABLE work_days IS 'Berechnete Tageszusammenfassung und unveränderlicher Abrechnungs-Sperrstatus.';
COMMENT ON COLUMN work_days.break_minutes IS 'Automatische Pause: 30 Minuten ab 3,5 Stunden, insgesamt 60 Minuten ab 6 Stunden Bruttozeit.';
COMMENT ON COLUMN work_days.overtime_minutes IS 'Arbeitsminuten oberhalb des am Arbeitstag eingefrorenen individuellen Tagessolls.';
COMMENT ON COLUMN work_days.calculation_version IS 'Version der reproduzierbaren Zeitberechnungsregeln.';

COMMIT;
