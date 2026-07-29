BEGIN;

CREATE TABLE IF NOT EXISTS company_holiday_calendars (
    company_id UUID PRIMARY KEY,
    country_code CHAR(2) NOT NULL DEFAULT 'DE',
    federal_state_code CHAR(2),
    configured_at TIMESTAMPTZ,
    updated_by_user_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    row_version BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT company_holiday_calendars_company_fkey
        FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE RESTRICT,
    CONSTRAINT company_holiday_calendars_updater_fkey
        FOREIGN KEY (company_id, updated_by_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT company_holiday_calendars_country_check CHECK (
        country_code ~ '^[A-Z]{2}$'
    ),
    CONSTRAINT company_holiday_calendars_state_check CHECK (
        federal_state_code IS NULL
        OR federal_state_code IN (
            'BW', 'BY', 'BE', 'BB', 'HB', 'HH', 'HE', 'MV',
            'NI', 'NW', 'RP', 'SL', 'SN', 'ST', 'SH', 'TH'
        )
    ),
    CONSTRAINT company_holiday_calendars_country_state_check CHECK (
        country_code = 'DE' OR federal_state_code IS NULL
    ),
    CONSTRAINT company_holiday_calendars_configured_check CHECK (
        (federal_state_code IS NULL AND configured_at IS NULL)
        OR
        (federal_state_code IS NOT NULL AND configured_at IS NOT NULL)
    ),
    CONSTRAINT company_holiday_calendars_version_check CHECK (row_version >= 1)
);

INSERT INTO company_holiday_calendars (
    company_id,
    country_code,
    federal_state_code,
    configured_at
)
SELECT
    company.id,
    company.country_code,
    CASE
        WHEN UPPER(BTRIM(company.settings ->> 'holidayFederalState')) IN (
            'BW', 'BY', 'BE', 'BB', 'HB', 'HH', 'HE', 'MV',
            'NI', 'NW', 'RP', 'SL', 'SN', 'ST', 'SH', 'TH'
        ) THEN UPPER(BTRIM(company.settings ->> 'holidayFederalState'))
        WHEN company.company_number = 'F-000001' THEN 'SN'
        ELSE NULL
    END,
    CASE
        WHEN UPPER(BTRIM(company.settings ->> 'holidayFederalState')) IN (
            'BW', 'BY', 'BE', 'BB', 'HB', 'HH', 'HE', 'MV',
            'NI', 'NW', 'RP', 'SL', 'SN', 'ST', 'SH', 'TH'
        ) OR company.company_number = 'F-000001'
            THEN CURRENT_TIMESTAMP
        ELSE NULL
    END
FROM companies AS company
ON CONFLICT (company_id) DO NOTHING;

CREATE OR REPLACE FUNCTION company_holiday_calendars_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.country_code := UPPER(BTRIM(NEW.country_code));
    NEW.federal_state_code := NULLIF(UPPER(BTRIM(NEW.federal_state_code)), '');

    IF TG_OP = 'INSERT' THEN
        NEW.configured_at := CASE
            WHEN NEW.federal_state_code IS NULL THEN NULL
            ELSE COALESCE(NEW.configured_at, CURRENT_TIMESTAMP)
        END;
    ELSIF NEW.federal_state_code IS NULL THEN
        NEW.configured_at := NULL;
    ELSIF OLD.federal_state_code IS DISTINCT FROM NEW.federal_state_code
        OR OLD.country_code IS DISTINCT FROM NEW.country_code THEN
        NEW.configured_at := CURRENT_TIMESTAMP;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF NEW.company_id <> OLD.company_id
            OR NEW.created_at <> OLD.created_at THEN
            RAISE EXCEPTION 'Firma und Anlagezeit des Feiertagskalenders sind unveränderlich.';
        END IF;
        NEW.updated_at := CURRENT_TIMESTAMP;
        NEW.row_version := OLD.row_version + 1;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS company_holiday_calendars_before_write_trigger
    ON company_holiday_calendars;
CREATE TRIGGER company_holiday_calendars_before_write_trigger
    BEFORE INSERT OR UPDATE ON company_holiday_calendars
    FOR EACH ROW EXECUTE FUNCTION company_holiday_calendars_before_write();

CREATE OR REPLACE FUNCTION company_holiday_calendars_prevent_hard_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF CURRENT_SETTING('app.allow_hard_delete', TRUE) = 'on' THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'Feiertagskalender dürfen nicht hart gelöscht werden.';
END;
$$;

DROP TRIGGER IF EXISTS company_holiday_calendars_prevent_hard_delete_trigger
    ON company_holiday_calendars;
CREATE TRIGGER company_holiday_calendars_prevent_hard_delete_trigger
    BEFORE DELETE ON company_holiday_calendars
    FOR EACH ROW EXECUTE FUNCTION company_holiday_calendars_prevent_hard_delete();

CREATE OR REPLACE FUNCTION companies_create_holiday_calendar()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
    initial_state CHAR(2);
BEGIN
    initial_state := CASE
        WHEN UPPER(BTRIM(NEW.settings ->> 'holidayFederalState')) IN (
            'BW', 'BY', 'BE', 'BB', 'HB', 'HH', 'HE', 'MV',
            'NI', 'NW', 'RP', 'SL', 'SN', 'ST', 'SH', 'TH'
        ) THEN UPPER(BTRIM(NEW.settings ->> 'holidayFederalState'))
        WHEN NEW.company_number = 'F-000001' THEN 'SN'
        ELSE NULL
    END;

    INSERT INTO company_holiday_calendars (
        company_id,
        country_code,
        federal_state_code,
        configured_at
    ) VALUES (
        NEW.id,
        NEW.country_code,
        initial_state,
        CASE WHEN initial_state IS NULL THEN NULL ELSE CURRENT_TIMESTAMP END
    )
    ON CONFLICT (company_id) DO NOTHING;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION companies_create_holiday_calendar() FROM PUBLIC;

DROP TRIGGER IF EXISTS companies_create_holiday_calendar_trigger ON companies;
CREATE TRIGGER companies_create_holiday_calendar_trigger
    AFTER INSERT ON companies
    FOR EACH ROW EXECUTE FUNCTION companies_create_holiday_calendar();

CREATE TABLE IF NOT EXISTS company_holiday_closures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    client_closure_id UUID NOT NULL,
    holiday_date DATE NOT NULL,
    name VARCHAR(120) NOT NULL,
    note TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_by_user_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    cancelled_by_user_id UUID,
    cancelled_at TIMESTAMPTZ,
    cancellation_note TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    row_version BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT company_holiday_closures_company_fkey
        FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE RESTRICT,
    CONSTRAINT company_holiday_closures_creator_fkey
        FOREIGN KEY (company_id, created_by_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT company_holiday_closures_canceller_fkey
        FOREIGN KEY (company_id, cancelled_by_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT company_holiday_closures_company_id_id_key UNIQUE (company_id, id),
    CONSTRAINT company_holiday_closures_client_key
        UNIQUE (company_id, client_closure_id),
    CONSTRAINT company_holiday_closures_name_check CHECK (
        BTRIM(name) <> '' AND CHAR_LENGTH(name) BETWEEN 2 AND 120
    ),
    CONSTRAINT company_holiday_closures_note_check CHECK (
        BTRIM(note) <> '' AND CHAR_LENGTH(note) BETWEEN 3 AND 500
    ),
    CONSTRAINT company_holiday_closures_date_check CHECK (
        holiday_date BETWEEN DATE '2000-01-01' AND DATE '2100-12-31'
    ),
    CONSTRAINT company_holiday_closures_status_check CHECK (
        status IN ('active', 'cancelled')
    ),
    CONSTRAINT company_holiday_closures_cancellation_check CHECK (
        (
            status = 'active'
            AND cancelled_by_user_id IS NULL
            AND cancelled_at IS NULL
            AND cancellation_note IS NULL
        )
        OR
        (
            status = 'cancelled'
            AND cancelled_by_user_id IS NOT NULL
            AND cancelled_at IS NOT NULL
            AND cancellation_note IS NOT NULL
            AND BTRIM(cancellation_note) <> ''
            AND CHAR_LENGTH(cancellation_note) BETWEEN 3 AND 500
        )
    ),
    CONSTRAINT company_holiday_closures_version_check CHECK (row_version >= 1)
);

CREATE INDEX IF NOT EXISTS company_holiday_closures_year_idx
    ON company_holiday_closures (company_id, holiday_date, status);

CREATE UNIQUE INDEX IF NOT EXISTS company_holiday_closures_active_date_key
    ON company_holiday_closures (company_id, holiday_date)
    WHERE status = 'active';

CREATE OR REPLACE FUNCTION company_holiday_closures_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.name := BTRIM(NEW.name);
        NEW.note := BTRIM(NEW.note);
        RETURN NEW;
    END IF;

    IF NEW.company_id <> OLD.company_id
        OR NEW.client_closure_id <> OLD.client_closure_id
        OR NEW.holiday_date <> OLD.holiday_date
        OR NEW.name <> OLD.name
        OR NEW.note IS DISTINCT FROM OLD.note
        OR NEW.created_by_user_id <> OLD.created_by_user_id
        OR NEW.created_at <> OLD.created_at THEN
        RAISE EXCEPTION 'Datum, Bezeichnung, Grund und Ersteller eines freien Tages sind unveränderlich.';
    END IF;
    IF OLD.status = 'cancelled' THEN
        RAISE EXCEPTION 'Ein aufgehobener freier Tag bleibt unverändert in der Historie.';
    END IF;
    IF NEW.status <> 'cancelled' THEN
        RAISE EXCEPTION 'Ein betrieblicher freier Tag kann nur nachvollziehbar aufgehoben werden.';
    END IF;

    NEW.cancellation_note := NULLIF(BTRIM(NEW.cancellation_note), '');
    NEW.cancelled_at := COALESCE(NEW.cancelled_at, CURRENT_TIMESTAMP);
    NEW.updated_at := CURRENT_TIMESTAMP;
    NEW.row_version := OLD.row_version + 1;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS company_holiday_closures_before_write_trigger
    ON company_holiday_closures;
CREATE TRIGGER company_holiday_closures_before_write_trigger
    BEFORE INSERT OR UPDATE ON company_holiday_closures
    FOR EACH ROW EXECUTE FUNCTION company_holiday_closures_before_write();

CREATE OR REPLACE FUNCTION company_holiday_closures_prevent_hard_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF CURRENT_SETTING('app.allow_hard_delete', TRUE) = 'on' THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'Betriebliche freie Tage dürfen nicht hart gelöscht werden.';
END;
$$;

DROP TRIGGER IF EXISTS company_holiday_closures_prevent_hard_delete_trigger
    ON company_holiday_closures;
CREATE TRIGGER company_holiday_closures_prevent_hard_delete_trigger
    BEFORE DELETE ON company_holiday_closures
    FOR EACH ROW EXECUTE FUNCTION company_holiday_closures_prevent_hard_delete();

CREATE OR REPLACE FUNCTION gregorian_easter_sunday(calendar_year INTEGER)
RETURNS DATE
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
DECLARE
    a INTEGER;
    b INTEGER;
    c INTEGER;
    d INTEGER;
    e INTEGER;
    f INTEGER;
    g INTEGER;
    h INTEGER;
    i INTEGER;
    k INTEGER;
    l INTEGER;
    m INTEGER;
    easter_month INTEGER;
    easter_day INTEGER;
BEGIN
    IF calendar_year < 1583 OR calendar_year > 4099 THEN
        RAISE EXCEPTION 'Das Osterjahr muss zwischen 1583 und 4099 liegen.';
    END IF;
    a := calendar_year % 19;
    b := calendar_year / 100;
    c := calendar_year % 100;
    d := b / 4;
    e := b % 4;
    f := (b + 8) / 25;
    g := (b - f + 1) / 3;
    h := (19 * a + b - d - g + 15) % 30;
    i := c / 4;
    k := c % 4;
    l := (32 + 2 * e + 2 * i - h - k) % 7;
    m := (a + 11 * h + 22 * l) / 451;
    easter_month := (h + l - 7 * m + 114) / 31;
    easter_day := ((h + l - 7 * m + 114) % 31) + 1;
    RETURN MAKE_DATE(calendar_year, easter_month, easter_day);
END;
$$;

CREATE OR REPLACE FUNCTION german_public_holidays(
    calendar_year INTEGER,
    requested_federal_state_code VARCHAR
)
RETURNS TABLE (
    holiday_date DATE,
    holiday_name TEXT,
    holiday_scope VARCHAR(20)
)
LANGUAGE sql
IMMUTABLE
AS $$
    WITH anchor AS (
        SELECT
            calendar_year AS year_number,
            gregorian_easter_sunday(calendar_year) AS easter_sunday,
            UPPER(BTRIM(COALESCE(requested_federal_state_code, ''))) AS state_code
        WHERE calendar_year BETWEEN 2000 AND 2100
    ),
    candidates (holiday_date, holiday_name, holiday_scope) AS (
        SELECT MAKE_DATE(year_number, 1, 1), 'Neujahr', 'nationwide' FROM anchor
        UNION ALL
        SELECT easter_sunday - 2, 'Karfreitag', 'nationwide' FROM anchor
        UNION ALL
        SELECT easter_sunday + 1, 'Ostermontag', 'nationwide' FROM anchor
        UNION ALL
        SELECT MAKE_DATE(year_number, 5, 1), 'Tag der Arbeit', 'nationwide' FROM anchor
        UNION ALL
        SELECT easter_sunday + 39, 'Christi Himmelfahrt', 'nationwide' FROM anchor
        UNION ALL
        SELECT easter_sunday + 50, 'Pfingstmontag', 'nationwide' FROM anchor
        UNION ALL
        SELECT MAKE_DATE(year_number, 10, 3), 'Tag der Deutschen Einheit', 'nationwide' FROM anchor
        UNION ALL
        SELECT MAKE_DATE(year_number, 12, 25), '1. Weihnachtstag', 'nationwide' FROM anchor
        UNION ALL
        SELECT MAKE_DATE(year_number, 12, 26), '2. Weihnachtstag', 'nationwide' FROM anchor
        UNION ALL
        SELECT MAKE_DATE(year_number, 1, 6), 'Heilige Drei Könige', 'state'
        FROM anchor WHERE state_code IN ('BW', 'BY', 'ST')
        UNION ALL
        SELECT MAKE_DATE(year_number, 3, 8), 'Internationaler Frauentag', 'state'
        FROM anchor
        WHERE (state_code = 'BE' AND year_number >= 2019)
           OR (state_code = 'MV' AND year_number >= 2023)
        UNION ALL
        SELECT easter_sunday, 'Ostersonntag', 'state'
        FROM anchor WHERE state_code = 'BB'
        UNION ALL
        SELECT easter_sunday + 49, 'Pfingstsonntag', 'state'
        FROM anchor WHERE state_code = 'BB'
        UNION ALL
        SELECT easter_sunday + 60, 'Fronleichnam', 'state'
        FROM anchor WHERE state_code IN ('BW', 'BY', 'HE', 'NW', 'RP', 'SL')
        UNION ALL
        SELECT MAKE_DATE(year_number, 8, 15), 'Mariä Himmelfahrt', 'state'
        FROM anchor WHERE state_code = 'SL'
        UNION ALL
        SELECT MAKE_DATE(year_number, 9, 20), 'Weltkindertag', 'state'
        FROM anchor WHERE state_code = 'TH' AND year_number >= 2019
        UNION ALL
        SELECT MAKE_DATE(year_number, 10, 31), 'Reformationstag', 'state'
        FROM anchor
        WHERE year_number <> 2017
          AND (
              state_code IN ('BB', 'MV', 'SN', 'ST', 'TH')
              OR (year_number >= 2018 AND state_code IN ('HB', 'HH', 'NI', 'SH'))
          )
        UNION ALL
        SELECT MAKE_DATE(year_number, 10, 31), 'Reformationstag', 'nationwide'
        FROM anchor WHERE year_number = 2017
        UNION ALL
        SELECT MAKE_DATE(year_number, 11, 1), 'Allerheiligen', 'state'
        FROM anchor WHERE state_code IN ('BW', 'BY', 'NW', 'RP', 'SL')
        UNION ALL
        SELECT
            MAKE_DATE(year_number, 11, 22)
                - (
                    (
                        EXTRACT(ISODOW FROM MAKE_DATE(year_number, 11, 22))::INTEGER
                        - 3
                        + 7
                    ) % 7
                ),
            'Buß- und Bettag',
            'state'
        FROM anchor WHERE state_code = 'SN'
        UNION ALL
        SELECT
            MAKE_DATE(year_number, 5, 8),
            CASE
                WHEN year_number = 2020 THEN '75. Jahrestag der Befreiung'
                ELSE '80. Jahrestag der Befreiung'
            END,
            'state'
        FROM anchor
        WHERE state_code = 'BE' AND year_number IN (2020, 2025)
        UNION ALL
        SELECT
            MAKE_DATE(year_number, 6, 17),
            '75. Jahrestag des Aufstandes vom 17. Juni 1953',
            'state'
        FROM anchor
        WHERE state_code = 'BE' AND year_number = 2028
    )
    SELECT DISTINCT ON (holiday_date)
        holiday_date,
        holiday_name,
        holiday_scope
    FROM candidates
    ORDER BY
        holiday_date,
        CASE WHEN holiday_scope = 'nationwide' THEN 0 ELSE 1 END,
        holiday_name;
$$;

CREATE OR REPLACE FUNCTION company_holiday_dates(
    requested_company_id UUID,
    requested_from DATE,
    requested_to DATE
)
RETURNS TABLE (
    holiday_date DATE,
    holiday_name TEXT,
    holiday_source VARCHAR(20)
)
LANGUAGE sql
STABLE
AS $$
    WITH calendar AS (
        SELECT
            company.id AS company_id,
            COALESCE(setting.country_code, company.country_code) AS country_code,
            setting.federal_state_code
        FROM companies AS company
        LEFT JOIN company_holiday_calendars AS setting
          ON setting.company_id = company.id
        WHERE company.id = requested_company_id
    ),
    requested_years AS (
        SELECT year_number
        FROM GENERATE_SERIES(
            EXTRACT(YEAR FROM requested_from)::INTEGER,
            EXTRACT(YEAR FROM requested_to)::INTEGER
        ) AS generated(year_number)
        WHERE requested_from <= requested_to
    ),
    automatic_holidays AS (
        SELECT
            holiday.holiday_date,
            holiday.holiday_name,
            'statutory'::VARCHAR(20) AS holiday_source
        FROM calendar
        CROSS JOIN requested_years
        CROSS JOIN LATERAL german_public_holidays(
            requested_years.year_number,
            calendar.federal_state_code
        ) AS holiday
        WHERE calendar.country_code = 'DE'
          AND holiday.holiday_date BETWEEN requested_from AND requested_to
    ),
    company_closures AS (
        SELECT
            closure.holiday_date,
            closure.name::TEXT AS holiday_name,
            'company'::VARCHAR(20) AS holiday_source
        FROM company_holiday_closures AS closure
        WHERE closure.company_id = requested_company_id
          AND closure.status = 'active'
          AND closure.holiday_date BETWEEN requested_from AND requested_to
    )
    SELECT DISTINCT ON (holiday_date)
        holiday_date,
        holiday_name,
        holiday_source
    FROM (
        SELECT * FROM automatic_holidays
        UNION ALL
        SELECT * FROM company_closures
    ) AS combined
    ORDER BY
        holiday_date,
        CASE WHEN holiday_source = 'statutory' THEN 0 ELSE 1 END,
        holiday_name;
$$;

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
        CROSS JOIN LATERAL GENERATE_SERIES(
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
            CASE
                WHEN holiday.holiday_date IS NOT NULL THEN 0
                ELSE COALESCE(
                    work_day.target_work_minutes,
                    (
                        calendar.weekly_target_minutes
                        ->> EXTRACT(ISODOW FROM calendar.work_date)::INTEGER::TEXT
                    )::INTEGER,
                    0
                )
            END AS target_minutes,
            COALESCE(work_day.work_minutes, 0) AS worked_minutes,
            absence.absence_type,
            absence.day_part
        FROM calendar
        LEFT JOIN work_days AS work_day
          ON work_day.company_id = calendar.company_id
         AND work_day.user_id = calendar.user_id
         AND work_day.work_date = calendar.work_date
        LEFT JOIN company_holiday_dates(
            requested_company_id,
            requested_from,
            requested_to
        ) AS holiday
          ON holiday.holiday_date = calendar.work_date
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

ALTER TABLE company_holiday_calendars ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_holiday_calendars_tenant_isolation
    ON company_holiday_calendars;
CREATE POLICY company_holiday_calendars_tenant_isolation
    ON company_holiday_calendars
    USING (company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID)
    WITH CHECK (company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID);

ALTER TABLE company_holiday_closures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_holiday_closures_tenant_isolation
    ON company_holiday_closures;
CREATE POLICY company_holiday_closures_tenant_isolation
    ON company_holiday_closures
    USING (company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID)
    WITH CHECK (company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID);

GRANT SELECT, INSERT, UPDATE ON company_holiday_calendars TO schaefchen_api;
GRANT SELECT, INSERT, UPDATE ON company_holiday_closures TO schaefchen_api;
REVOKE ALL ON FUNCTION gregorian_easter_sunday(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION german_public_holidays(INTEGER, VARCHAR) FROM PUBLIC;
REVOKE ALL ON FUNCTION company_holiday_dates(UUID, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION gregorian_easter_sunday(INTEGER) TO schaefchen_api;
GRANT EXECUTE ON FUNCTION german_public_holidays(INTEGER, VARCHAR) TO schaefchen_api;
GRANT EXECUTE ON FUNCTION company_holiday_dates(UUID, DATE, DATE) TO schaefchen_api;
ALTER TABLE company_holiday_calendars NO FORCE ROW LEVEL SECURITY;
ALTER TABLE company_holiday_closures NO FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE company_holiday_calendars IS
    'Verbindlicher Länder- und Bundeslandbezug des Feiertagskalenders je Mandant.';
COMMENT ON TABLE company_holiday_closures IS
    'Zusätzliche betriebliche oder örtliche freie Tage mit unveränderlicher Anlage- und Aufhebungshistorie.';
COMMENT ON FUNCTION german_public_holidays(INTEGER, VARCHAR) IS
    'Berechnet nach dem Rechtsstand 29.07.2026 bundesweite und bundeslandweite deutsche Feiertage; kommunale Ausnahmen werden als betriebliche freie Tage ergänzt.';
COMMENT ON FUNCTION company_holiday_dates(UUID, DATE, DATE) IS
    'Vereinigt gesetzliche Feiertage und aktive betriebliche freie Tage eines Mandanten.';
COMMENT ON FUNCTION time_account_daily_balances(UUID, UUID, DATE, DATE) IS
    'Berechnet tägliche Soll-, Ist-, Abwesenheits- und Saldo-Minuten; Feiertage setzen das Tagessoll verbindlich auf null.';

COMMIT;
