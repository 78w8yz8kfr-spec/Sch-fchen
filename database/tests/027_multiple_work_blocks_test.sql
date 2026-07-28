\echo 'Teste Migration 027_allow_multiple_work_blocks.sql ...'

BEGIN;

DO $$
DECLARE
    target_company_id UUID;
    employee_id UUID;
    target_work_day_id UUID;
BEGIN
    SELECT id INTO target_company_id
    FROM companies
    WHERE company_number = 'F-000001';

    INSERT INTO users (company_id, personnel_number, first_name, last_name)
    VALUES (target_company_id, 'BLOCK-1', 'Mehrfach', 'Start')
    RETURNING id INTO employee_id;

    INSERT INTO work_days (
        company_id, user_id, work_date, target_work_minutes
    ) VALUES (
        target_company_id, employee_id, DATE '2026-07-26', 420
    ) RETURNING id INTO target_work_day_id;

    INSERT INTO time_entries (
        company_id, user_id, work_day_id, entry_type, recorded_at,
        client_entry_id, client_created_at, source, entered_by_user_id
    ) VALUES
        (
            target_company_id, employee_id, target_work_day_id, 'clock_in',
            TIMESTAMPTZ '2026-07-26 07:00:00+02', gen_random_uuid(),
            TIMESTAMPTZ '2026-07-26 07:00:01+02', 'employee', employee_id
        ),
        (
            target_company_id, employee_id, target_work_day_id, 'clock_out',
            TIMESTAMPTZ '2026-07-26 12:00:00+02', gen_random_uuid(),
            TIMESTAMPTZ '2026-07-26 12:00:01+02', 'employee', employee_id
        ),
        (
            target_company_id, employee_id, target_work_day_id, 'clock_in',
            TIMESTAMPTZ '2026-07-26 14:00:00+02', gen_random_uuid(),
            TIMESTAMPTZ '2026-07-26 14:00:01+02', 'employee', employee_id
        ),
        (
            target_company_id, employee_id, target_work_day_id, 'clock_out',
            TIMESTAMPTZ '2026-07-26 16:00:00+02', gen_random_uuid(),
            TIMESTAMPTZ '2026-07-26 16:00:01+02', 'employee', employee_id
        );

    IF NOT EXISTS (
        SELECT 1
        FROM work_days AS day
        WHERE day.id = target_work_day_id
          AND day.first_clock_in_at = TIMESTAMPTZ '2026-07-26 07:00:00+02'
          AND day.last_clock_out_at = TIMESTAMPTZ '2026-07-26 16:00:00+02'
          AND day.gross_minutes = 540
          AND day.break_minutes = 120
          AND day.work_minutes = 420
          AND day.overtime_minutes = 0
          AND day.calculation_version >= 2
    ) THEN
        RAISE EXCEPTION 'Mehrere Arbeitsblöcke wurden nicht korrekt zusammengeführt';
    END IF;

    IF (
        SELECT COUNT(*)
        FROM time_entries AS entry
        WHERE entry.company_id = target_company_id
          AND entry.user_id = employee_id
          AND entry.work_day_id = target_work_day_id
          AND entry.entry_type = 'clock_in'
    ) <> 2 THEN
        RAISE EXCEPTION 'Der zweite Arbeitsbeginn wurde nicht historisch erhalten';
    END IF;
END;
$$;

ROLLBACK;

\echo 'Migration 027_allow_multiple_work_blocks.sql erfolgreich getestet.'
