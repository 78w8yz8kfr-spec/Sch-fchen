\echo 'Teste Migration 034_create_time_accounts.sql ...'

BEGIN;

DO $$
DECLARE
    target_company_id UUID;
    employee_id UUID;
    office_user_id UUID;
    management_user_id UUID;
    adjustment_id UUID;
    request_id UUID;
BEGIN
    SELECT id INTO target_company_id
    FROM companies
    WHERE company_number = 'F-000001';

    INSERT INTO users (company_id, personnel_number, first_name, last_name, created_at)
    VALUES
        (target_company_id, 'TIME-ACCOUNT-1', 'Tina', 'Zeitkonto', '2026-07-01T06:00:00Z'),
        (target_company_id, 'TIME-ACCOUNT-2', 'Britta', 'Büro', '2026-07-01T06:00:00Z'),
        (target_company_id, 'TIME-ACCOUNT-3', 'Gerd', 'Freigabe', '2026-07-01T06:00:00Z');

    SELECT id INTO employee_id
    FROM users
    WHERE company_id = target_company_id AND personnel_number = 'TIME-ACCOUNT-1';
    SELECT id INTO office_user_id
    FROM users
    WHERE company_id = target_company_id AND personnel_number = 'TIME-ACCOUNT-2';
    SELECT id INTO management_user_id
    FROM users
    WHERE company_id = target_company_id AND personnel_number = 'TIME-ACCOUNT-3';

    IF NOT EXISTS (
        SELECT 1
        FROM time_account_profiles
        WHERE company_id = target_company_id AND user_id = employee_id
    ) OR NOT EXISTS (
        SELECT 1
        FROM time_account_vacation_entitlements
        WHERE company_id = target_company_id
          AND user_id = employee_id
          AND calendar_year = 2026
          AND vacation_days = 30.0
    ) THEN
        RAISE EXCEPTION 'Neue Mitarbeiter erhalten kein Standard-Stundenkonto';
    END IF;

    UPDATE time_account_profiles
    SET account_start_date = DATE '2026-07-01',
        updated_by_user_id = management_user_id
    WHERE company_id = target_company_id AND user_id = employee_id;

    UPDATE time_account_vacation_entitlements
    SET vacation_days = 30.0,
        updated_by_user_id = management_user_id
    WHERE company_id = target_company_id
      AND user_id = employee_id
      AND calendar_year = 2026;

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
        DATE '2026-07-01',
        510,
        600,
        600,
        90
    );

    INSERT INTO absence_requests (
        company_id,
        user_id,
        absence_type,
        start_date,
        end_date,
        day_part,
        requested_by_user_id
    ) VALUES (
        target_company_id,
        employee_id,
        'vacation',
        DATE '2026-07-02',
        DATE '2026-07-02',
        'full_day',
        employee_id
    ) RETURNING id INTO request_id;

    UPDATE absence_requests
    SET status = 'management_review',
        office_reviewed_by_user_id = office_user_id,
        office_reviewed_at = CURRENT_TIMESTAMP
    WHERE id = request_id;
    UPDATE absence_requests
    SET status = 'approved',
        management_reviewed_by_user_id = management_user_id,
        management_reviewed_at = CURRENT_TIMESTAMP
    WHERE id = request_id;

    INSERT INTO absence_requests (
        company_id,
        user_id,
        absence_type,
        start_date,
        end_date,
        day_part,
        requested_by_user_id
    ) VALUES (
        target_company_id,
        employee_id,
        'time_off',
        DATE '2026-07-03',
        DATE '2026-07-03',
        'first_half',
        employee_id
    ) RETURNING id INTO request_id;

    UPDATE absence_requests
    SET status = 'management_review',
        office_reviewed_by_user_id = office_user_id,
        office_reviewed_at = CURRENT_TIMESTAMP
    WHERE id = request_id;
    UPDATE absence_requests
    SET status = 'approved',
        management_reviewed_by_user_id = management_user_id,
        management_reviewed_at = CURRENT_TIMESTAMP
    WHERE id = request_id;

    IF (
        SELECT SUM(balance_minutes)
        FROM time_account_daily_balances(
            target_company_id,
            employee_id,
            DATE '2026-07-01',
            DATE '2026-07-03'
        )
    ) <> -90 THEN
        RAISE EXCEPTION 'Arbeitszeit, Urlaub und halber Überstundenabbau wurden falsch verrechnet';
    END IF;

    INSERT INTO time_account_adjustments (
        company_id,
        user_id,
        client_adjustment_id,
        adjustment_date,
        adjustment_minutes,
        adjustment_type,
        note,
        created_by_user_id
    ) VALUES (
        target_company_id,
        employee_id,
        gen_random_uuid(),
        DATE '2026-07-03',
        60,
        'CORRECTION',
        '  Geprüfte Korrektur  ',
        management_user_id
    ) RETURNING id INTO adjustment_id;

    IF NOT EXISTS (
        SELECT 1
        FROM time_account_adjustments
        WHERE id = adjustment_id
          AND adjustment_type = 'correction'
          AND note = 'Geprüfte Korrektur'
    ) THEN
        RAISE EXCEPTION 'Stundenkonto-Korrektur wurde nicht normalisiert';
    END IF;

    BEGIN
        UPDATE time_account_adjustments
        SET adjustment_minutes = 90
        WHERE id = adjustment_id;
        RAISE EXCEPTION USING ERRCODE = 'ZTA01', MESSAGE = 'Korrektur wurde überschrieben';
    EXCEPTION
        WHEN SQLSTATE 'P0001' THEN NULL;
    END;

    BEGIN
        DELETE FROM time_account_adjustments WHERE id = adjustment_id;
        RAISE EXCEPTION USING ERRCODE = 'ZTA02', MESSAGE = 'Korrektur wurde hart gelöscht';
    EXCEPTION
        WHEN SQLSTATE 'P0001' THEN NULL;
    END;

    BEGIN
        DELETE FROM time_account_vacation_entitlements
        WHERE company_id = target_company_id
          AND user_id = employee_id
          AND calendar_year = 2026;
        RAISE EXCEPTION USING ERRCODE = 'ZTA03', MESSAGE = 'Urlaubsanspruch wurde hart gelöscht';
    EXCEPTION
        WHEN SQLSTATE 'P0001' THEN NULL;
    END;

    BEGIN
        DELETE FROM time_account_profiles
        WHERE company_id = target_company_id AND user_id = employee_id;
        RAISE EXCEPTION USING ERRCODE = 'ZTA04', MESSAGE = 'Stundenkonto wurde hart gelöscht';
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
        FROM time_account_profiles
        WHERE user_id = (
            SELECT id FROM users
            WHERE personnel_number = 'TIME-ACCOUNT-1'
        )
    ) OR NOT EXISTS (
        SELECT 1
        FROM time_account_vacation_entitlements
        WHERE calendar_year = 2026 AND vacation_days = 30.0
    ) OR NOT EXISTS (SELECT 1 FROM time_account_adjustments) THEN
        RAISE EXCEPTION 'API-Rolle sieht das eigene Stundenkonto nicht';
    END IF;
    IF (
        SELECT COUNT(*)
        FROM time_account_daily_balances(
            CURRENT_SETTING('app.current_company_id')::UUID,
            (
                SELECT id
                FROM users
                WHERE personnel_number = 'TIME-ACCOUNT-1'
            ),
            DATE '2026-07-01',
            DATE '2026-07-03'
        )
    ) <> 3 THEN
        RAISE EXCEPTION 'API-Rolle kann die mandantengeschützte Tagesberechnung nicht ausführen';
    END IF;

    PERFORM set_config('app.current_company_id', gen_random_uuid()::TEXT, TRUE);
    IF EXISTS (SELECT 1 FROM time_account_profiles)
        OR EXISTS (SELECT 1 FROM time_account_vacation_entitlements)
        OR EXISTS (SELECT 1 FROM time_account_adjustments) THEN
        RAISE EXCEPTION 'API-Rolle sieht Stundenkonten eines anderen Mandanten';
    END IF;
END;
$$;

RESET ROLE;
ROLLBACK;

\echo 'Migration 034_create_time_accounts.sql erfolgreich getestet.'
