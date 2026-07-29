\echo 'Teste Migration 035_create_holiday_calendars.sql ...'

BEGIN;

DO $$
DECLARE
    target_company_id UUID;
    employee_id UUID;
    administrator_id UUID;
    closure_id UUID;
    calendar_version BIGINT;
    state_rule RECORD;
BEGIN
    SELECT id INTO target_company_id
    FROM companies
    WHERE company_number = 'F-000001';

    INSERT INTO users (
        company_id,
        personnel_number,
        first_name,
        last_name,
        weekly_target_minutes,
        created_at
    ) VALUES (
        target_company_id,
        'HOLIDAY-EMPLOYEE',
        'Frieda',
        'Feiertag',
        '{"1":480,"2":480,"3":480,"4":480,"5":480,"6":0,"7":0}'::JSONB,
        '2026-11-16T06:00:00Z'
    ) RETURNING id INTO employee_id;

    INSERT INTO users (
        company_id,
        personnel_number,
        first_name,
        last_name,
        created_at
    ) VALUES (
        target_company_id,
        'HOLIDAY-ADMIN',
        'Ada',
        'Administration',
        '2026-01-01T06:00:00Z'
    ) RETURNING id INTO administrator_id;

    IF NOT EXISTS (
        SELECT 1
        FROM company_holiday_calendars
        WHERE company_id = target_company_id
          AND country_code = 'DE'
          AND federal_state_code = 'SN'
          AND configured_at IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'Der vorhandene Schaaf-Mandant ist nicht für Sachsen vorkonfiguriert';
    END IF;

    IF gregorian_easter_sunday(2026) <> DATE '2026-04-05' THEN
        RAISE EXCEPTION 'Die Osterberechnung für 2026 ist falsch';
    END IF;

    IF (
        SELECT COUNT(*)
        FROM german_public_holidays(2026, 'SN')
    ) <> 11 THEN
        RAISE EXCEPTION 'Die Zahl der sächsischen Feiertage 2026 ist falsch';
    END IF;

    FOR state_rule IN
        SELECT *
        FROM (
            VALUES
                ('BW', 12), ('BY', 12), ('BE', 10), ('BB', 12),
                ('HB', 10), ('HH', 10), ('HE', 10), ('MV', 11),
                ('NI', 10), ('NW', 11), ('RP', 11), ('SL', 12),
                ('SN', 11), ('ST', 11), ('SH', 10), ('TH', 11)
        ) AS expected(state_code, holiday_count)
    LOOP
        IF (
            SELECT COUNT(*)
            FROM german_public_holidays(2026, state_rule.state_code)
        ) <> state_rule.holiday_count THEN
            RAISE EXCEPTION
                'Die Feiertagszahl 2026 für % ist falsch',
                state_rule.state_code;
        END IF;
    END LOOP;

    IF NOT EXISTS (
        SELECT 1
        FROM german_public_holidays(2026, 'SN')
        WHERE holiday_date = DATE '2026-04-03' AND holiday_name = 'Karfreitag'
    ) OR NOT EXISTS (
        SELECT 1
        FROM german_public_holidays(2026, 'SN')
        WHERE holiday_date = DATE '2026-11-18' AND holiday_name = 'Buß- und Bettag'
    ) OR EXISTS (
        SELECT 1
        FROM german_public_holidays(2026, 'SN')
        WHERE holiday_name = 'Fronleichnam'
    ) THEN
        RAISE EXCEPTION 'Bundesweite und sächsische Feiertagsregeln sind falsch';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM german_public_holidays(2026, 'BW')
        WHERE holiday_date = DATE '2026-01-06'
          AND holiday_name = 'Heilige Drei Könige'
    ) OR NOT EXISTS (
        SELECT 1
        FROM german_public_holidays(2026, 'BW')
        WHERE holiday_date = DATE '2026-06-04'
          AND holiday_name = 'Fronleichnam'
    ) OR NOT EXISTS (
        SELECT 1
        FROM german_public_holidays(2020, 'BE')
        WHERE holiday_date = DATE '2020-05-08'
    ) OR NOT EXISTS (
        SELECT 1
        FROM german_public_holidays(2025, 'BE')
        WHERE holiday_date = DATE '2025-05-08'
    ) OR NOT EXISTS (
        SELECT 1
        FROM german_public_holidays(2028, 'BE')
        WHERE holiday_date = DATE '2028-06-17'
    ) OR NOT EXISTS (
        SELECT 1
        FROM german_public_holidays(2026, 'BB')
        WHERE holiday_date = DATE '2026-04-05'
          AND holiday_name = 'Ostersonntag'
    ) THEN
        RAISE EXCEPTION 'Weitere Bundeslandregeln sind unvollständig';
    END IF;

    UPDATE time_account_profiles
    SET account_start_date = DATE '2026-11-16',
        updated_by_user_id = administrator_id
    WHERE company_id = target_company_id
      AND user_id = employee_id;

    INSERT INTO work_days (
        company_id,
        user_id,
        work_date,
        target_work_minutes,
        gross_minutes,
        work_minutes,
        overtime_minutes
    ) VALUES (
        target_company_id,
        employee_id,
        DATE '2026-11-18',
        480,
        120,
        120,
        0
    );

    IF (
        SELECT SUM(target_minutes)
        FROM time_account_daily_balances(
            target_company_id,
            employee_id,
            DATE '2026-11-16',
            DATE '2026-11-20'
        )
    ) <> 1920 OR (
        SELECT SUM(balance_minutes)
        FROM time_account_daily_balances(
            target_company_id,
            employee_id,
            DATE '2026-11-16',
            DATE '2026-11-20'
        )
    ) <> -1800 THEN
        RAISE EXCEPTION 'Buß- und Bettag setzt das Soll nicht auf null oder Feiertagsarbeit wird falsch gebucht';
    END IF;

    INSERT INTO company_holiday_closures (
        company_id,
        client_closure_id,
        holiday_date,
        name,
        note,
        created_by_user_id
    ) VALUES (
        target_company_id,
        gen_random_uuid(),
        DATE '2026-11-17',
        '  Betrieblicher Ausgleichstag  ',
        '  Betriebsvereinbarung  ',
        administrator_id
    ) RETURNING id INTO closure_id;

    IF NOT EXISTS (
        SELECT 1
        FROM company_holiday_closures
        WHERE id = closure_id
          AND name = 'Betrieblicher Ausgleichstag'
          AND note = 'Betriebsvereinbarung'
          AND status = 'active'
    ) OR (
        SELECT SUM(target_minutes)
        FROM time_account_daily_balances(
            target_company_id,
            employee_id,
            DATE '2026-11-16',
            DATE '2026-11-20'
        )
    ) <> 1440 THEN
        RAISE EXCEPTION 'Ein betrieblicher freier Tag wird nicht korrekt berücksichtigt';
    END IF;

    BEGIN
        INSERT INTO company_holiday_closures (
            company_id,
            client_closure_id,
            holiday_date,
            name,
            note,
            created_by_user_id
        ) VALUES (
            target_company_id,
            gen_random_uuid(),
            DATE '2026-11-19',
            'Freier Tag ohne Grund',
            '  ',
            administrator_id
        );
        RAISE EXCEPTION USING
            ERRCODE = 'ZHC04',
            MESSAGE = 'Ein betrieblicher freier Tag wurde ohne Pflichtgrund angelegt';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;

    UPDATE company_holiday_closures
    SET status = 'cancelled',
        cancelled_by_user_id = administrator_id,
        cancellation_note = 'Fehlerhafte Anlage'
    WHERE id = closure_id;

    IF (
        SELECT SUM(target_minutes)
        FROM time_account_daily_balances(
            target_company_id,
            employee_id,
            DATE '2026-11-16',
            DATE '2026-11-20'
        )
    ) <> 1920 THEN
        RAISE EXCEPTION 'Ein aufgehobener freier Tag wirkt weiterhin auf das Stundenkonto';
    END IF;

    BEGIN
        UPDATE company_holiday_closures
        SET cancellation_note = 'Nachträglich überschrieben'
        WHERE id = closure_id;
        RAISE EXCEPTION USING ERRCODE = 'ZHC01', MESSAGE = 'Aufhebungshistorie wurde überschrieben';
    EXCEPTION
        WHEN SQLSTATE 'P0001' THEN NULL;
    END;

    SELECT row_version INTO calendar_version
    FROM company_holiday_calendars
    WHERE company_id = target_company_id;

    UPDATE company_holiday_calendars
    SET federal_state_code = 'BE',
        updated_by_user_id = administrator_id
    WHERE company_id = target_company_id;

    IF NOT EXISTS (
        SELECT 1
        FROM company_holiday_calendars
        WHERE company_id = target_company_id
          AND federal_state_code = 'BE'
          AND row_version = calendar_version + 1
    ) THEN
        RAISE EXCEPTION 'Kalenderänderung erhöht die Version nicht';
    END IF;

    UPDATE company_holiday_calendars
    SET federal_state_code = 'SN',
        updated_by_user_id = administrator_id
    WHERE company_id = target_company_id;

    BEGIN
        DELETE FROM company_holiday_closures WHERE id = closure_id;
        RAISE EXCEPTION USING ERRCODE = 'ZHC02', MESSAGE = 'Freier Tag wurde hart gelöscht';
    EXCEPTION
        WHEN SQLSTATE 'P0001' THEN NULL;
    END;

    BEGIN
        DELETE FROM company_holiday_calendars WHERE company_id = target_company_id;
        RAISE EXCEPTION USING ERRCODE = 'ZHC03', MESSAGE = 'Feiertagskalender wurde hart gelöscht';
    EXCEPTION
        WHEN SQLSTATE 'P0001' THEN NULL;
    END;
END;
$$;

SELECT id AS tenant_id
FROM companies
WHERE company_number = 'F-000001'
\gset

SET LOCAL ROLE schaefchen_api;
SELECT set_config('app.current_company_id', :'tenant_id', TRUE);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM company_holiday_calendars
        WHERE federal_state_code = 'SN'
    ) OR NOT EXISTS (
        SELECT 1
        FROM company_holiday_closures
        WHERE status = 'cancelled'
    ) OR NOT EXISTS (
        SELECT 1
        FROM company_holiday_dates(
            CURRENT_SETTING('app.current_company_id')::UUID,
            DATE '2026-11-01',
            DATE '2026-11-30'
        )
        WHERE holiday_date = DATE '2026-11-18'
    ) THEN
        RAISE EXCEPTION 'API-Rolle kann den eigenen Feiertagskalender nicht lesen';
    END IF;

    PERFORM set_config('app.current_company_id', gen_random_uuid()::TEXT, TRUE);
    IF EXISTS (SELECT 1 FROM company_holiday_calendars)
        OR EXISTS (SELECT 1 FROM company_holiday_closures) THEN
        RAISE EXCEPTION 'API-Rolle sieht Feiertagsdaten eines anderen Mandanten';
    END IF;
END;
$$;

RESET ROLE;
ROLLBACK;

\echo 'Migration 035_create_holiday_calendars.sql erfolgreich getestet.'
