\echo 'Teste Migration 045_record_unreviewed_corrections.sql ...'

BEGIN;

DO $$
DECLARE
    target_company_id UUID;
    target_employee_id UUID;
    reviewer_id UUID;
    target_work_day_id UUID;
    source_entry_id UUID;
    unreviewed_id UUID;
    reviewed_id UUID;
BEGIN
    SELECT id INTO target_company_id FROM companies WHERE company_number = 'F-000001';

    INSERT INTO users (company_id, personnel_number, first_name, last_name)
    VALUES (target_company_id, 'UNREVIEWED-045', 'Ulf', 'Ungeprueft')
    RETURNING id INTO target_employee_id;

    INSERT INTO users (company_id, personnel_number, first_name, last_name)
    VALUES (target_company_id, 'REVIEWER-045', 'Rita', 'Pruefung')
    RETURNING id INTO reviewer_id;

    INSERT INTO work_days (company_id, user_id, work_date, target_work_minutes)
    VALUES (target_company_id, target_employee_id, DATE '2026-07-20', 480)
    RETURNING id INTO target_work_day_id;

    INSERT INTO time_entries (
        company_id, user_id, work_day_id, entry_type, recorded_at,
        client_entry_id, client_created_at, source, entered_by_user_id
    ) VALUES (
        target_company_id, target_employee_id, target_work_day_id, 'clock_in',
        TIMESTAMPTZ '2026-07-20 08:00:00+02', gen_random_uuid(), CURRENT_TIMESTAMP,
        'employee', target_employee_id
    ) RETURNING id INTO source_entry_id;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'time_entries'
          AND column_name = 'applied_without_review'
    ) OR NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'time_change_operations'
          AND column_name = 'applied_without_review'
    ) THEN
        RAISE EXCEPTION 'Die Kennzeichnung ungeprüft wirksamer Korrekturen fehlt';
    END IF;

    -- Eine ungeprüft wirksame Korrektur trägt keinen Prüfer, aber den
    -- Zeitpunkt der Wirksamkeit.
    INSERT INTO time_entries (
        company_id, user_id, work_day_id, entry_type, recorded_at,
        client_entry_id, client_created_at, source, entered_by_user_id,
        original_entry_id, correction_kind, correction_reason
    ) VALUES (
        target_company_id, target_employee_id, target_work_day_id, 'clock_in',
        TIMESTAMPTZ '2026-07-20 07:00:00+02', gen_random_uuid(), CURRENT_TIMESTAMP,
        'employee', target_employee_id, source_entry_id, 'replacement',
        'Arbeitsbeginn war frueher'
    ) RETURNING id INTO unreviewed_id;

    UPDATE time_entries
    SET correction_status = 'approved',
        applied_without_review = TRUE,
        reviewed_at = CURRENT_TIMESTAMP
    WHERE id = unreviewed_id;

    IF NOT EXISTS (
        SELECT 1 FROM time_entries
        WHERE id = unreviewed_id
          AND correction_status = 'approved'
          AND applied_without_review
          AND reviewed_by_user_id IS NULL
          AND reviewed_at IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'Eine ungeprüft wirksame Korrektur wurde nicht ohne Prüfer gespeichert';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM time_entries
        WHERE id = source_entry_id AND invalidated_at IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'Die ungeprüft wirksame Korrektur hat das Original nicht entwertet';
    END IF;

    -- Der ungeprüfte Zustand lässt sich nachträglich nicht abstreifen.
    BEGIN
        UPDATE time_entries SET applied_without_review = FALSE WHERE id = unreviewed_id;
        RAISE EXCEPTION USING
            ERRCODE = 'ZX451',
            MESSAGE = 'Der ungeprüfte Zustand konnte nachträglich entfernt werden';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM = 'Der ungeprüfte Zustand konnte nachträglich entfernt werden' THEN RAISE; END IF;
    END;

    -- Eine echte Entscheidung braucht weiterhin einen Prüfer.
    INSERT INTO time_entries (
        company_id, user_id, work_day_id, entry_type, recorded_at,
        client_entry_id, client_created_at, source, entered_by_user_id,
        original_entry_id, correction_kind, correction_reason
    ) VALUES (
        target_company_id, target_employee_id, target_work_day_id, 'clock_in',
        TIMESTAMPTZ '2026-07-20 06:30:00+02', gen_random_uuid(), CURRENT_TIMESTAMP,
        'employee', target_employee_id, unreviewed_id, 'replacement',
        'Zweite Korrektur mit ordentlicher Pruefung'
    ) RETURNING id INTO reviewed_id;

    BEGIN
        UPDATE time_entries SET correction_status = 'approved' WHERE id = reviewed_id;
        RAISE EXCEPTION USING
            ERRCODE = 'ZX452',
            MESSAGE = 'Eine Korrektur wurde ohne Pruefer und ohne Kennzeichnung wirksam';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM = 'Eine Korrektur wurde ohne Pruefer und ohne Kennzeichnung wirksam' THEN RAISE; END IF;
    END;

    UPDATE time_entries
    SET correction_status = 'approved', reviewed_by_user_id = reviewer_id
    WHERE id = reviewed_id;

    IF NOT EXISTS (
        SELECT 1 FROM time_entries
        WHERE id = reviewed_id
          AND correction_status = 'approved'
          AND NOT applied_without_review
          AND reviewed_by_user_id = reviewer_id
          AND reviewed_at IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'Die geprüfte Korrektur wurde nicht mit ihrem Prüfer gespeichert';
    END IF;
END;
$$;

ROLLBACK;

\echo 'Migration 045_record_unreviewed_corrections.sql erfolgreich getestet.'
