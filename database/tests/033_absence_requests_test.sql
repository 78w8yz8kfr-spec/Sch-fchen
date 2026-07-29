\echo 'Teste Migration 033_create_absence_requests.sql ...'

BEGIN;

DO $$
DECLARE
    target_company_id UUID;
    employee_id UUID;
    office_user_id UUID;
    management_user_id UUID;
    request_id UUID;
    event_id UUID;
BEGIN
    SELECT id INTO target_company_id
    FROM companies
    WHERE company_number = 'F-000001';

    INSERT INTO users (company_id, personnel_number, first_name, last_name)
    VALUES
        (target_company_id, 'ABSENCE-1', 'Anna', 'Abwesend'),
        (target_company_id, 'ABSENCE-2', 'Berta', 'Büro'),
        (target_company_id, 'ABSENCE-3', 'Gerd', 'Geschäftsführung');

    SELECT id INTO employee_id
    FROM users
    WHERE company_id = target_company_id AND personnel_number = 'ABSENCE-1';

    SELECT id INTO office_user_id
    FROM users
    WHERE company_id = target_company_id AND personnel_number = 'ABSENCE-2';

    SELECT id INTO management_user_id
    FROM users
    WHERE company_id = target_company_id AND personnel_number = 'ABSENCE-3';

    INSERT INTO absence_requests (
        company_id,
        user_id,
        absence_type,
        start_date,
        end_date,
        day_part,
        note,
        requested_by_user_id
    ) VALUES (
        target_company_id,
        employee_id,
        'VACATION',
        DATE '2026-08-10',
        DATE '2026-08-14',
        'FULL_DAY',
        '  Familienurlaub  ',
        employee_id
    ) RETURNING id INTO request_id;

    IF NOT EXISTS (
        SELECT 1
        FROM absence_requests
        WHERE id = request_id
          AND absence_type = 'vacation'
          AND note = 'Familienurlaub'
          AND status = 'office_review'
          AND row_version = 1
    ) THEN
        RAISE EXCEPTION 'Abwesenheitsantrag wurde nicht korrekt eingereicht';
    END IF;

    UPDATE absence_requests
    SET status = 'management_review',
        office_reviewed_by_user_id = office_user_id,
        office_reviewed_at = CURRENT_TIMESTAMP,
        office_comment = 'Einsatzplanung ist angepasst'
    WHERE id = request_id;

    BEGIN
        UPDATE absence_requests
        SET status = 'approved',
            management_reviewed_by_user_id = office_user_id,
            management_reviewed_at = CURRENT_TIMESTAMP,
            management_comment = 'Unzulässige Selbstfreigabe'
        WHERE id = request_id;
        RAISE EXCEPTION USING ERRCODE = 'ZXA05', MESSAGE = 'Vier-Augen-Regel wurde umgangen';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;

    UPDATE absence_requests
    SET status = 'approved',
        management_reviewed_by_user_id = management_user_id,
        management_reviewed_at = CURRENT_TIMESTAMP,
        management_comment = 'Freigegeben'
    WHERE id = request_id;

    IF NOT EXISTS (
        SELECT 1
        FROM absence_requests
        WHERE id = request_id
          AND status = 'approved'
          AND office_reviewed_by_user_id = office_user_id
          AND management_reviewed_by_user_id = management_user_id
          AND row_version = 3
    ) OR (
        SELECT COUNT(*)
        FROM absence_request_events
        WHERE absence_request_id = request_id
    ) <> 3 THEN
        RAISE EXCEPTION 'Zweistufige Freigabe oder Historie ist unvollständig';
    END IF;

    SELECT id INTO event_id
    FROM absence_request_events
    WHERE absence_request_id = request_id
    ORDER BY request_row_version
    LIMIT 1;

    BEGIN
        UPDATE absence_requests
        SET start_date = DATE '2026-08-11'
        WHERE id = request_id;
        RAISE EXCEPTION USING ERRCODE = 'ZXA01', MESSAGE = 'Antragsinhalt wurde verändert';
    EXCEPTION
        WHEN SQLSTATE 'P0001' THEN NULL;
    END;

    BEGIN
        UPDATE absence_request_events
        SET comment = 'Manipuliert'
        WHERE id = event_id;
        RAISE EXCEPTION USING ERRCODE = 'ZXA02', MESSAGE = 'Historie wurde verändert';
    EXCEPTION
        WHEN SQLSTATE 'P0001' THEN NULL;
    END;

    BEGIN
        DELETE FROM absence_requests WHERE id = request_id;
        RAISE EXCEPTION USING ERRCODE = 'ZXA03', MESSAGE = 'Antrag wurde hart gelöscht';
    EXCEPTION
        WHEN SQLSTATE 'P0001' THEN NULL;
    END;

    BEGIN
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
            DATE '2026-08-20',
            DATE '2026-08-21',
            'first_half',
            employee_id
        );
        RAISE EXCEPTION USING ERRCODE = 'ZXA04', MESSAGE = 'Mehrtaegiger Halbtagsantrag wurde akzeptiert';
    EXCEPTION
        WHEN check_violation THEN NULL;
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
    IF (SELECT COUNT(*) FROM absence_requests) <> 1 THEN
        RAISE EXCEPTION 'API-Rolle sieht den eigenen Abwesenheitsantrag nicht';
    END IF;
    IF (SELECT COUNT(*) FROM absence_request_events) <> 3 THEN
        RAISE EXCEPTION 'API-Rolle sieht die eigene Abwesenheitshistorie nicht';
    END IF;

    PERFORM set_config('app.current_company_id', gen_random_uuid()::TEXT, TRUE);
    IF EXISTS (SELECT 1 FROM absence_requests)
        OR EXISTS (SELECT 1 FROM absence_request_events) THEN
        RAISE EXCEPTION 'API-Rolle sieht Abwesenheiten eines anderen Mandanten';
    END IF;
END;
$$;

RESET ROLE;
ROLLBACK;

\echo 'Migration 033_create_absence_requests.sql erfolgreich getestet.'
