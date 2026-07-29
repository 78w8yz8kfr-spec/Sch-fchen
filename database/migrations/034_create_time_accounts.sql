BEGIN;

CREATE TABLE IF NOT EXISTS time_account_profiles (
    company_id UUID NOT NULL,
    user_id UUID NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    account_start_date DATE NOT NULL,
    updated_by_user_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    row_version BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT time_account_profiles_pkey PRIMARY KEY (company_id, user_id),
    CONSTRAINT time_account_profiles_user_fkey
        FOREIGN KEY (company_id, user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT time_account_profiles_updater_fkey
        FOREIGN KEY (company_id, updated_by_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT time_account_profiles_version_check CHECK (row_version >= 1)
);

INSERT INTO time_account_profiles (
    company_id,
    user_id,
    account_start_date
)
SELECT
    account.company_id,
    account.id,
    LEAST(
        account.created_at::DATE,
        COALESCE(MIN(work_day.work_date), account.created_at::DATE)
    )
FROM users AS account
LEFT JOIN work_days AS work_day
  ON work_day.company_id = account.company_id
 AND work_day.user_id = account.id
GROUP BY account.company_id, account.id, account.created_at
ON CONFLICT (company_id, user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION time_account_profiles_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW.company_id <> OLD.company_id
            OR NEW.user_id <> OLD.user_id
            OR NEW.created_at <> OLD.created_at THEN
            RAISE EXCEPTION 'Firma, Mitarbeiter und Anlagezeit des Stundenkontos sind unveränderlich.';
        END IF;
        NEW.updated_at := CURRENT_TIMESTAMP;
        NEW.row_version := OLD.row_version + 1;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS time_account_profiles_before_write_trigger ON time_account_profiles;
CREATE TRIGGER time_account_profiles_before_write_trigger
    BEFORE INSERT OR UPDATE ON time_account_profiles
    FOR EACH ROW EXECUTE FUNCTION time_account_profiles_before_write();

CREATE OR REPLACE FUNCTION time_account_profiles_prevent_hard_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF CURRENT_SETTING('app.allow_hard_delete', TRUE) = 'on' THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'Stundenkonten dürfen nicht hart gelöscht werden.';
END;
$$;

DROP TRIGGER IF EXISTS time_account_profiles_prevent_hard_delete_trigger ON time_account_profiles;
CREATE TRIGGER time_account_profiles_prevent_hard_delete_trigger
    BEFORE DELETE ON time_account_profiles
    FOR EACH ROW EXECUTE FUNCTION time_account_profiles_prevent_hard_delete();

CREATE TABLE IF NOT EXISTS time_account_vacation_entitlements (
    company_id UUID NOT NULL,
    user_id UUID NOT NULL,
    calendar_year INTEGER NOT NULL,
    vacation_days NUMERIC(4, 1) NOT NULL DEFAULT 30.0,
    updated_by_user_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    row_version BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT time_account_vacation_entitlements_pkey
        PRIMARY KEY (company_id, user_id, calendar_year),
    CONSTRAINT time_account_vacation_entitlements_user_fkey
        FOREIGN KEY (company_id, user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT time_account_vacation_entitlements_updater_fkey
        FOREIGN KEY (company_id, updated_by_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT time_account_vacation_entitlements_year_check CHECK (
        calendar_year BETWEEN 2000 AND 2100
    ),
    CONSTRAINT time_account_vacation_entitlements_days_check CHECK (
        vacation_days BETWEEN 0 AND 60
        AND vacation_days * 2 = TRUNC(vacation_days * 2)
    ),
    CONSTRAINT time_account_vacation_entitlements_version_check CHECK (row_version >= 1)
);

INSERT INTO time_account_vacation_entitlements (
    company_id,
    user_id,
    calendar_year,
    vacation_days
)
SELECT
    account.company_id,
    account.id,
    EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER,
    30.0
FROM users AS account
ON CONFLICT (company_id, user_id, calendar_year) DO NOTHING;

CREATE OR REPLACE FUNCTION time_account_vacation_entitlements_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW.company_id <> OLD.company_id
            OR NEW.user_id <> OLD.user_id
            OR NEW.calendar_year <> OLD.calendar_year
            OR NEW.created_at <> OLD.created_at THEN
            RAISE EXCEPTION 'Firma, Mitarbeiter, Jahr und Anlagezeit des Urlaubsanspruchs sind unveränderlich.';
        END IF;
        NEW.updated_at := CURRENT_TIMESTAMP;
        NEW.row_version := OLD.row_version + 1;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS time_account_vacation_entitlements_before_write_trigger
    ON time_account_vacation_entitlements;
CREATE TRIGGER time_account_vacation_entitlements_before_write_trigger
    BEFORE INSERT OR UPDATE ON time_account_vacation_entitlements
    FOR EACH ROW EXECUTE FUNCTION time_account_vacation_entitlements_before_write();

CREATE OR REPLACE FUNCTION time_account_vacation_entitlements_prevent_hard_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF CURRENT_SETTING('app.allow_hard_delete', TRUE) = 'on' THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'Jahresurlaubsansprüche dürfen nicht hart gelöscht werden.';
END;
$$;

DROP TRIGGER IF EXISTS time_account_vacation_entitlements_prevent_hard_delete_trigger
    ON time_account_vacation_entitlements;
CREATE TRIGGER time_account_vacation_entitlements_prevent_hard_delete_trigger
    BEFORE DELETE ON time_account_vacation_entitlements
    FOR EACH ROW EXECUTE FUNCTION time_account_vacation_entitlements_prevent_hard_delete();

CREATE OR REPLACE FUNCTION users_create_time_account_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
BEGIN
    INSERT INTO time_account_profiles (
        company_id,
        user_id,
        account_start_date
    ) VALUES (
        NEW.company_id,
        NEW.id,
        NEW.created_at::DATE
    )
    ON CONFLICT (company_id, user_id) DO NOTHING;

    INSERT INTO time_account_vacation_entitlements (
        company_id,
        user_id,
        calendar_year,
        vacation_days
    ) VALUES (
        NEW.company_id,
        NEW.id,
        EXTRACT(YEAR FROM NEW.created_at)::INTEGER,
        30.0
    )
    ON CONFLICT (company_id, user_id, calendar_year) DO NOTHING;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION users_create_time_account_defaults() FROM PUBLIC;

DROP TRIGGER IF EXISTS users_create_time_account_defaults_trigger ON users;
CREATE TRIGGER users_create_time_account_defaults_trigger
    AFTER INSERT ON users
    FOR EACH ROW EXECUTE FUNCTION users_create_time_account_defaults();

CREATE TABLE IF NOT EXISTS time_account_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    user_id UUID NOT NULL,
    client_adjustment_id UUID NOT NULL,
    adjustment_date DATE NOT NULL,
    adjustment_minutes INTEGER NOT NULL,
    adjustment_type VARCHAR(30) NOT NULL,
    note TEXT NOT NULL,
    created_by_user_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT time_account_adjustments_company_fkey
        FOREIGN KEY (company_id)
        REFERENCES companies (id) ON DELETE RESTRICT,
    CONSTRAINT time_account_adjustments_user_fkey
        FOREIGN KEY (company_id, user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT time_account_adjustments_creator_fkey
        FOREIGN KEY (company_id, created_by_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT time_account_adjustments_company_id_id_key UNIQUE (company_id, id),
    CONSTRAINT time_account_adjustments_client_key UNIQUE (company_id, client_adjustment_id),
    CONSTRAINT time_account_adjustments_minutes_check CHECK (
        adjustment_minutes <> 0
        AND ABS(adjustment_minutes) <= 600000
    ),
    CONSTRAINT time_account_adjustments_type_check CHECK (
        adjustment_type IN ('opening_balance', 'correction', 'payout')
    ),
    CONSTRAINT time_account_adjustments_note_check CHECK (
        BTRIM(note) <> ''
        AND CHAR_LENGTH(note) BETWEEN 3 AND 500
    )
);

CREATE INDEX IF NOT EXISTS time_account_adjustments_user_date_idx
    ON time_account_adjustments (company_id, user_id, adjustment_date, created_at);

CREATE OR REPLACE FUNCTION time_account_adjustments_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'Stundenkonto-Buchungen sind unveränderlich; bitte eine Gegenbuchung erfassen.';
    END IF;
    NEW.adjustment_type := LOWER(BTRIM(NEW.adjustment_type));
    NEW.note := BTRIM(NEW.note);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS time_account_adjustments_before_write_trigger ON time_account_adjustments;
CREATE TRIGGER time_account_adjustments_before_write_trigger
    BEFORE INSERT OR UPDATE ON time_account_adjustments
    FOR EACH ROW EXECUTE FUNCTION time_account_adjustments_before_write();

CREATE OR REPLACE FUNCTION time_account_adjustments_prevent_hard_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF CURRENT_SETTING('app.allow_hard_delete', TRUE) = 'on' THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'Stundenkonto-Buchungen dürfen nicht hart gelöscht werden.';
END;
$$;

DROP TRIGGER IF EXISTS time_account_adjustments_prevent_hard_delete_trigger
    ON time_account_adjustments;
CREATE TRIGGER time_account_adjustments_prevent_hard_delete_trigger
    BEFORE DELETE ON time_account_adjustments
    FOR EACH ROW EXECUTE FUNCTION time_account_adjustments_prevent_hard_delete();

CREATE OR REPLACE FUNCTION time_account_daily_balances(
    requested_company_id UUID,
    requested_user_id UUID,
    requested_from DATE,
    requested_to DATE
)
RETURNS TABLE (
    work_date DATE,
    target_minutes INTEGER,
    worked_minutes INTEGER,
    absence_credit_minutes INTEGER,
    balance_minutes INTEGER
)
LANGUAGE sql
STABLE
AS $$
    WITH account AS (
        SELECT
            account.company_id,
            account.id AS user_id,
            account.weekly_target_minutes,
            COALESCE(profile.enabled, TRUE) AS enabled,
            COALESCE(profile.account_start_date, account.created_at::DATE) AS account_start_date
        FROM users AS account
        LEFT JOIN time_account_profiles AS profile
          ON profile.company_id = account.company_id
         AND profile.user_id = account.id
        WHERE account.company_id = requested_company_id
          AND account.id = requested_user_id
    ),
    calendar AS (
        SELECT
            account.company_id,
            account.user_id,
            account.weekly_target_minutes,
            day.work_date::DATE AS work_date
        FROM account
        CROSS JOIN LATERAL generate_series(
            GREATEST(requested_from, account.account_start_date),
            requested_to,
            INTERVAL '1 day'
        ) AS day(work_date)
        WHERE account.enabled
          AND requested_to >= GREATEST(requested_from, account.account_start_date)
    ),
    daily AS (
        SELECT
            calendar.work_date,
            COALESCE(
                work_day.target_work_minutes,
                (
                    calendar.weekly_target_minutes
                    ->> EXTRACT(ISODOW FROM calendar.work_date)::INTEGER::TEXT
                )::INTEGER,
                0
            ) AS target_minutes,
            COALESCE(work_day.work_minutes, 0) AS worked_minutes,
            absence.absence_type,
            absence.day_part
        FROM calendar
        LEFT JOIN work_days AS work_day
          ON work_day.company_id = calendar.company_id
         AND work_day.user_id = calendar.user_id
         AND work_day.work_date = calendar.work_date
        LEFT JOIN LATERAL (
            SELECT request.absence_type, request.day_part
            FROM absence_requests AS request
            WHERE request.company_id = calendar.company_id
              AND request.user_id = calendar.user_id
              AND request.status = 'approved'
              AND calendar.work_date BETWEEN request.start_date AND request.end_date
            ORDER BY request.created_at, request.id
            LIMIT 1
        ) AS absence ON TRUE
    ),
    credited AS (
        SELECT
            daily.*,
            CASE
                WHEN daily.absence_type IS NULL THEN 0
                WHEN daily.absence_type = 'time_off' AND daily.day_part = 'full_day' THEN 0
                WHEN daily.day_part = 'full_day' THEN daily.target_minutes
                ELSE ROUND(daily.target_minutes / 2.0)::INTEGER
            END AS absence_credit_minutes
        FROM daily
    )
    SELECT
        credited.work_date,
        credited.target_minutes,
        credited.worked_minutes,
        credited.absence_credit_minutes,
        credited.worked_minutes
            + credited.absence_credit_minutes
            - credited.target_minutes AS balance_minutes
    FROM credited
    ORDER BY credited.work_date;
$$;

ALTER TABLE time_account_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS time_account_profiles_tenant_isolation ON time_account_profiles;
CREATE POLICY time_account_profiles_tenant_isolation ON time_account_profiles
    USING (company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID)
    WITH CHECK (company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID);

ALTER TABLE time_account_vacation_entitlements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS time_account_vacation_entitlements_tenant_isolation
    ON time_account_vacation_entitlements;
CREATE POLICY time_account_vacation_entitlements_tenant_isolation
    ON time_account_vacation_entitlements
    USING (company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID)
    WITH CHECK (company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID);

ALTER TABLE time_account_adjustments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS time_account_adjustments_tenant_isolation ON time_account_adjustments;
CREATE POLICY time_account_adjustments_tenant_isolation ON time_account_adjustments
    USING (company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID)
    WITH CHECK (company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID);

GRANT SELECT, INSERT, UPDATE ON time_account_profiles TO schaefchen_api;
GRANT SELECT, INSERT, UPDATE ON time_account_vacation_entitlements TO schaefchen_api;
GRANT SELECT, INSERT ON time_account_adjustments TO schaefchen_api;
REVOKE ALL ON FUNCTION time_account_daily_balances(UUID, UUID, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION time_account_daily_balances(UUID, UUID, DATE, DATE) TO schaefchen_api;
ALTER TABLE time_account_profiles NO FORCE ROW LEVEL SECURITY;
ALTER TABLE time_account_vacation_entitlements NO FORCE ROW LEVEL SECURITY;
ALTER TABLE time_account_adjustments NO FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE time_account_profiles IS
    'Aktivierung und Startdatum des fortlaufenden Stundenkontos je Mitarbeiter.';
COMMENT ON TABLE time_account_vacation_entitlements IS
    'Jahresbezogener Urlaubsanspruch je Mitarbeiter in ganzen oder halben Arbeitstagen.';
COMMENT ON TABLE time_account_adjustments IS
    'Unveränderliche manuelle Zu- und Abbuchungen des fortlaufenden Stundenkontos.';
COMMENT ON FUNCTION time_account_daily_balances(UUID, UUID, DATE, DATE) IS
    'Berechnet tägliche Soll-, Ist-, Abwesenheits- und Saldo-Minuten für ein aktiviertes Stundenkonto.';

COMMIT;
