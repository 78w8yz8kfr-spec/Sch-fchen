\echo 'Teste Migration 031_allow_locked_time_corrections.sql ...'

BEGIN;

DO $$
DECLARE
    target_company_id UUID;
    employee_id UUID;
    work_day_id UUID;
    clock_out_id UUID;
    correction_id UUID;
BEGIN
    SELECT id INTO target_company_id
    FROM companies
    WHERE company_number = 'F-000001';

    INSERT INTO users (company_id, personnel_number, first_name, last_name)
    VALUES (target_company_id, 'LOCK-CORR-1', 'Lena', 'Abrechnung')
    RETURNING id INTO employee_id;

    INSERT INTO work_days (company_id, user_id, work_date)
    VALUES (target_company_id, employee_id, DATE '2026-07-24')
    RETURNING id INTO work_day_id;

    INSERT INTO time_entries (
        company_id, user_id, work_day_id, entry_type, recorded_at,
        client_entry_id, client_created_at, source, entered_by_user_id
    ) VALUES (
        target_company_id, employee_id, work_day_id, 'clock_in',
        TIMESTAMPTZ '2026-07-24 08:00:00+02', gen_random_uuid(),
        CURRENT_TIMESTAMP, 'employee', employee_id
    );

    INSERT INTO time_entries (
        company_id, user_id, work_day_id, entry_type, recorded_at,
        client_entry_id, client_created_at, source, entered_by_user_id
    ) VALUES (
        target_company_id, employee_id, work_day_id, 'clock_out',
        TIMESTAMPTZ '2026-07-24 16:00:00+02', gen_random_uuid(),
        CURRENT_TIMESTAMP, 'employee', employee_id
    ) RETURNING id INTO clock_out_id;

    UPDATE work_days SET status = 'submitted' WHERE id = work_day_id;
    UPDATE work_days
    SET status = 'approved', approved_by_user_id = employee_id
    WHERE id = work_day_id;
    PERFORM set_config('app.controlled_time_correction', 'on', TRUE);
    UPDATE work_days
    SET status = 'locked', locked_by_user_id = employee_id
    WHERE id = work_day_id;
    PERFORM set_config('app.controlled_time_correction', '', TRUE);

    INSERT INTO time_entries (
        company_id, user_id, work_day_id, entry_type, recorded_at,
        client_entry_id, client_created_at, source, entered_by_user_id,
        original_entry_id, correction_reason
    ) VALUES (
        target_company_id, employee_id, work_day_id, 'clock_out',
        TIMESTAMPTZ '2026-07-24 16:30:00+02', gen_random_uuid(),
        CURRENT_TIMESTAMP, 'employee', employee_id, clock_out_id,
        'Feierabend nach der Abrechnung als falsch erkannt'
    ) RETURNING id INTO correction_id;

    IF NOT EXISTS (
        SELECT 1 FROM time_entries
        WHERE id = correction_id AND correction_status = 'pending'
    ) THEN
        RAISE EXCEPTION 'Korrekturantrag am abgerechneten Tag fehlt';
    END IF;

    UPDATE time_entries
    SET correction_status = 'approved', reviewed_by_user_id = employee_id
    WHERE id = correction_id;

    IF NOT EXISTS (
        SELECT 1
        FROM work_days
        WHERE id = work_day_id
          AND status = 'locked'
          AND last_clock_out_at = TIMESTAMPTZ '2026-07-24 16:30:00+02'
    ) THEN
        RAISE EXCEPTION 'Abgerechneter Tag wurde nach Genehmigung nicht korrekt neu berechnet';
    END IF;

    BEGIN
        INSERT INTO time_entries (
            company_id, user_id, work_day_id, entry_type, recorded_at,
            client_entry_id, client_created_at, source, entered_by_user_id
        ) VALUES (
            target_company_id, employee_id, work_day_id, 'clock_in',
            TIMESTAMPTZ '2026-07-24 17:00:00+02', gen_random_uuid(),
            CURRENT_TIMESTAMP, 'employee', employee_id
        );
        RAISE EXCEPTION USING ERRCODE = 'ZXN01',
            MESSAGE = 'Normale Buchung am abgerechneten Tag wurde akzeptiert';
    EXCEPTION
        WHEN SQLSTATE 'P0001' THEN NULL;
    END;
END;
$$;

ROLLBACK;

\echo 'Migration 031_allow_locked_time_corrections.sql erfolgreich getestet.'
