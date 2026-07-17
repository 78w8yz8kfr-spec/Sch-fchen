\echo 'Teste Migration 011_create_work_days.sql ...'

BEGIN;

DO $$
DECLARE
    target_company_id UUID;
    employee_id UUID;
    monday_id UUID;
    friday_id UUID;
    monday_target INTEGER;
    friday_target INTEGER;
BEGIN
    SELECT id INTO target_company_id
    FROM companies
    WHERE company_number = 'F-000001';

    INSERT INTO users (company_id, personnel_number, first_name, last_name)
    VALUES (target_company_id, 'WORKDAY-1', 'Arbeitszeit', 'Test')
    RETURNING id INTO employee_id;

    INSERT INTO work_days (company_id, user_id, work_date)
    VALUES (target_company_id, employee_id, DATE '2026-07-13')
    RETURNING id, target_work_minutes INTO monday_id, monday_target;

    INSERT INTO work_days (company_id, user_id, work_date)
    VALUES (target_company_id, employee_id, DATE '2026-07-17')
    RETURNING id, target_work_minutes INTO friday_id, friday_target;

    IF monday_target <> 510 OR friday_target <> 360 THEN
        RAISE EXCEPTION 'Standard-Sollzeiten sind ungültig: Montag %, Freitag %', monday_target, friday_target;
    END IF;

    UPDATE users
    SET weekly_target_minutes = jsonb_set(weekly_target_minutes, '{5}', '420'::JSONB)
    WHERE id = employee_id;

    IF (SELECT (weekly_target_minutes ->> '5')::INTEGER FROM users WHERE id = employee_id) <> 420 THEN
        RAISE EXCEPTION 'Individuelle Sollzeit wurde nicht gespeichert';
    END IF;

    IF (SELECT target_work_minutes FROM work_days WHERE id = friday_id) <> 360 THEN
        RAISE EXCEPTION 'Sollzeit eines bestehenden Arbeitstags wurde rückwirkend verändert';
    END IF;

    BEGIN
        UPDATE users
        SET weekly_target_minutes = '{"1":510}'::JSONB
        WHERE id = employee_id;
        RAISE EXCEPTION USING ERRCODE = 'ZXB01', MESSAGE = 'Unvollständige Wochen-Sollzeit wurde akzeptiert';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;

    UPDATE work_days
    SET status = 'submitted'
    WHERE id = friday_id;

    UPDATE work_days
    SET status = 'approved', approved_by_user_id = employee_id
    WHERE id = friday_id;

    UPDATE work_days
    SET status = 'locked', locked_by_user_id = employee_id
    WHERE id = friday_id;

    IF NOT EXISTS (
        SELECT 1 FROM work_days
        WHERE id = friday_id
          AND status = 'locked'
          AND submitted_at IS NOT NULL
          AND approved_at IS NOT NULL
          AND locked_at IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'Freigabe- und Sperrstatus wurde nicht vollständig protokolliert';
    END IF;

    BEGIN
        UPDATE work_days SET note = 'Zu spät' WHERE id = friday_id;
        RAISE EXCEPTION USING ERRCODE = 'ZXB02', MESSAGE = 'Gesperrter Arbeitstag wurde verändert';
    EXCEPTION
        WHEN SQLSTATE 'P0001' THEN NULL;
    END;

    BEGIN
        UPDATE work_days SET work_minutes = 10, gross_minutes = 10 WHERE id = monday_id;
        RAISE EXCEPTION USING ERRCODE = 'ZXB03', MESSAGE = 'Berechnete Zeit wurde manuell verändert';
    EXCEPTION
        WHEN SQLSTATE 'P0001' THEN NULL;
    END;

    BEGIN
        DELETE FROM work_days WHERE id = monday_id;
        RAISE EXCEPTION USING ERRCODE = 'ZXB04', MESSAGE = 'Hartes Löschen wurde akzeptiert';
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
    IF (SELECT COUNT(*) FROM work_days) <> 2 THEN
        RAISE EXCEPTION 'API-Rolle sieht nicht alle eigenen Arbeitstage';
    END IF;

    PERFORM set_config('app.current_company_id', gen_random_uuid()::TEXT, TRUE);

    IF EXISTS (SELECT 1 FROM work_days) THEN
        RAISE EXCEPTION 'API-Rolle sieht Arbeitstage eines anderen Mandanten';
    END IF;
END;
$$;

RESET ROLE;
ROLLBACK;

\echo 'Migration 011_create_work_days.sql erfolgreich getestet.'
