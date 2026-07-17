\echo 'Teste Migration 012_create_time_entries.sql ...'

BEGIN;

DO $$
DECLARE
    target_company_id UUID;
    customer_id UUID;
    location_id UUID;
    project_id UUID;
    site_id UUID;
    employee_id UUID;
    work_day_id UUID;
    clock_in_id UUID;
    arrival_id UUID;
    departure_id UUID;
    clock_out_id UUID;
    clock_out_client_id UUID := gen_random_uuid();
    correction_id UUID;
BEGIN
    SELECT id INTO target_company_id
    FROM companies
    WHERE company_number = 'F-000001';

    INSERT INTO customers (company_id, customer_type, company_name)
    VALUES (target_company_id, 'company', 'Zeitentest Kunde GmbH')
    RETURNING id INTO customer_id;

    INSERT INTO customer_locations (
        company_id, customer_id, name, street, house_number, postal_code, city
    ) VALUES (
        target_company_id, customer_id, 'Zeitentest Ort', 'Testweg', '12', '12345', 'Teststadt'
    ) RETURNING id INTO location_id;

    INSERT INTO projects (company_id, customer_id, name)
    VALUES (target_company_id, customer_id, 'Zeitentest Projekt')
    RETURNING id INTO project_id;

    INSERT INTO construction_sites (
        company_id, project_id, customer_location_id, name
    ) VALUES (
        target_company_id, project_id, location_id, 'Zeitentest Baustelle'
    ) RETURNING id INTO site_id;

    INSERT INTO users (company_id, personnel_number, first_name, last_name)
    VALUES (target_company_id, 'TIME-1', 'Zeit', 'Erfassung')
    RETURNING id INTO employee_id;

    INSERT INTO work_days (company_id, user_id, work_date)
    VALUES (target_company_id, employee_id, DATE '2026-07-17')
    RETURNING id INTO work_day_id;

    INSERT INTO time_entries (
        company_id, user_id, work_day_id, entry_type, recorded_at,
        client_entry_id, client_created_at, source, entered_by_user_id
    ) VALUES (
        target_company_id, employee_id, work_day_id, 'clock_in',
        TIMESTAMPTZ '2026-07-17 07:00:00+02', gen_random_uuid(),
        TIMESTAMPTZ '2026-07-17 07:00:01+02', 'offline', employee_id
    ) RETURNING id INTO clock_in_id;

    INSERT INTO time_entries (
        company_id, user_id, work_day_id, construction_site_id,
        entry_type, recorded_at, client_entry_id, client_created_at,
        source, entered_by_user_id
    ) VALUES (
        target_company_id, employee_id, work_day_id, site_id,
        'site_arrival', TIMESTAMPTZ '2026-07-17 07:30:00+02',
        gen_random_uuid(), TIMESTAMPTZ '2026-07-17 07:30:01+02',
        'offline', employee_id
    ) RETURNING id INTO arrival_id;

    INSERT INTO time_entries (
        company_id, user_id, work_day_id, construction_site_id,
        entry_type, recorded_at, client_entry_id, client_created_at,
        source, entered_by_user_id
    ) VALUES (
        target_company_id, employee_id, work_day_id, site_id,
        'site_departure', TIMESTAMPTZ '2026-07-17 12:00:00+02',
        gen_random_uuid(), TIMESTAMPTZ '2026-07-17 12:00:01+02',
        'offline', employee_id
    ) RETURNING id INTO departure_id;

    INSERT INTO time_entries (
        company_id, user_id, work_day_id, entry_type, recorded_at,
        client_entry_id, client_created_at, source, entered_by_user_id
    ) VALUES (
        target_company_id, employee_id, work_day_id, 'clock_out',
        TIMESTAMPTZ '2026-07-17 14:00:00+02', clock_out_client_id,
        TIMESTAMPTZ '2026-07-17 14:00:01+02', 'offline', employee_id
    ) RETURNING id INTO clock_out_id;

    IF NOT EXISTS (
        SELECT 1 FROM work_days
        WHERE id = work_day_id
          AND gross_minutes = 420
          AND break_minutes = 60
          AND work_minutes = 360
          AND travel_minutes = 150
          AND overtime_minutes = 0
    ) THEN
        RAISE EXCEPTION 'Arbeits-, Pausen- oder Fahrzeit wurde falsch berechnet';
    END IF;

    BEGIN
        INSERT INTO time_entries (
            company_id, user_id, work_day_id, construction_site_id,
            entry_type, recorded_at, client_entry_id, client_created_at,
            source, entered_by_user_id
        ) VALUES (
            target_company_id, employee_id, work_day_id, site_id,
            'site_arrival', TIMESTAMPTZ '2026-07-17 15:00:00+02',
            clock_out_client_id, CURRENT_TIMESTAMP, 'offline', employee_id
        );
        RAISE EXCEPTION USING ERRCODE = 'ZXC01', MESSAGE = 'Doppelte Client-ID wurde akzeptiert';
    EXCEPTION
        WHEN unique_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO time_entries (
            company_id, user_id, work_day_id, entry_type, recorded_at,
            client_entry_id, client_created_at, source, entered_by_user_id
        ) VALUES (
            target_company_id, employee_id, work_day_id, 'clock_in',
            TIMESTAMPTZ '2026-07-17 08:00:00+02', gen_random_uuid(),
            CURRENT_TIMESTAMP, 'employee', employee_id
        );
        RAISE EXCEPTION USING ERRCODE = 'ZXC02', MESSAGE = 'Zweiter Arbeitsbeginn wurde akzeptiert';
    EXCEPTION
        WHEN unique_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO time_entries (
            company_id, user_id, work_day_id, entry_type, recorded_at,
            client_entry_id, client_created_at, source, entered_by_user_id,
            original_entry_id
        ) VALUES (
            target_company_id, employee_id, work_day_id, 'clock_out',
            TIMESTAMPTZ '2026-07-17 14:15:00+02', gen_random_uuid(),
            CURRENT_TIMESTAMP, 'office', employee_id, clock_out_id
        );
        RAISE EXCEPTION USING ERRCODE = 'ZXC03', MESSAGE = 'Korrektur ohne Begründung wurde akzeptiert';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;

    INSERT INTO time_entries (
        company_id, user_id, work_day_id, entry_type, recorded_at,
        client_entry_id, client_created_at, source, entered_by_user_id,
        original_entry_id, correction_reason
    ) VALUES (
        target_company_id, employee_id, work_day_id, 'clock_out',
        TIMESTAMPTZ '2026-07-17 14:30:00+02', gen_random_uuid(),
        CURRENT_TIMESTAMP, 'office', employee_id,
        clock_out_id, 'Feierabend versehentlich zu früh gebucht'
    ) RETURNING id INTO correction_id;

    IF (SELECT gross_minutes FROM work_days WHERE id = work_day_id) <> 420 THEN
        RAISE EXCEPTION 'Offener Korrekturantrag hat die Abrechnung vorzeitig verändert';
    END IF;

    UPDATE time_entries
    SET correction_status = 'approved',
        reviewed_by_user_id = employee_id
    WHERE id = correction_id;

    IF NOT EXISTS (
        SELECT 1 FROM time_entries
        WHERE id = clock_out_id AND invalidated_at IS NOT NULL
    ) OR NOT EXISTS (
        SELECT 1 FROM work_days
        WHERE id = work_day_id
          AND gross_minutes = 450
          AND break_minutes = 60
          AND work_minutes = 390
          AND travel_minutes = 180
          AND overtime_minutes = 30
    ) THEN
        RAISE EXCEPTION 'Genehmigte Korrektur wurde nicht korrekt übernommen';
    END IF;

    INSERT INTO time_entries (
        company_id, user_id, work_day_id, construction_site_id,
        entry_type, recorded_at, client_entry_id, client_created_at,
        source, entered_by_user_id, original_entry_id, correction_reason
    ) VALUES (
        target_company_id, employee_id, work_day_id, site_id,
        'site_arrival', TIMESTAMPTZ '2026-07-17 07:35:00+02',
        gen_random_uuid(), CURRENT_TIMESTAMP, 'office', employee_id,
        arrival_id, 'Ankunftszeit nachgetragen'
    );

    IF (SELECT COUNT(*) FROM pending_time_entry_corrections) <> 1 THEN
        RAISE EXCEPTION 'Offener Korrekturantrag fehlt in der Büroansicht';
    END IF;

    BEGIN
        DELETE FROM time_entries WHERE id = departure_id;
        RAISE EXCEPTION USING ERRCODE = 'ZXC04', MESSAGE = 'Hartes Löschen wurde akzeptiert';
    EXCEPTION
        WHEN SQLSTATE 'P0001' THEN NULL;
    END;

    UPDATE work_days
    SET status = 'locked', locked_by_user_id = employee_id
    WHERE id = work_day_id;

    BEGIN
        INSERT INTO time_entries (
            company_id, user_id, work_day_id, construction_site_id,
            entry_type, recorded_at, client_entry_id, client_created_at,
            source, entered_by_user_id
        ) VALUES (
            target_company_id, employee_id, work_day_id, site_id,
            'next_site', TIMESTAMPTZ '2026-07-17 15:00:00+02',
            gen_random_uuid(), CURRENT_TIMESTAMP, 'employee', employee_id
        );
        RAISE EXCEPTION USING ERRCODE = 'ZXC05', MESSAGE = 'Buchung für gesperrten Tag wurde akzeptiert';
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
    IF (SELECT COUNT(*) FROM time_entries) <> 6 THEN
        RAISE EXCEPTION 'API-Rolle sieht nicht alle eigenen Zeitereignisse';
    END IF;

    IF (SELECT COUNT(*) FROM pending_time_entry_corrections) <> 1 THEN
        RAISE EXCEPTION 'API-Rolle sieht den offenen Korrekturantrag nicht';
    END IF;

    PERFORM set_config('app.current_company_id', gen_random_uuid()::TEXT, TRUE);

    IF EXISTS (SELECT 1 FROM time_entries)
        OR EXISTS (SELECT 1 FROM pending_time_entry_corrections) THEN
        RAISE EXCEPTION 'API-Rolle sieht Zeitdaten eines anderen Mandanten';
    END IF;
END;
$$;

RESET ROLE;
ROLLBACK;

\echo 'Migration 012_create_time_entries.sql erfolgreich getestet.'
