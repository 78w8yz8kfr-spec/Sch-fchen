\echo 'Teste Migration 009_create_site_assignments.sql ...'

BEGIN;

DO $$
DECLARE
    company_a_id UUID;
    company_b_id UUID;
    customer_a_id UUID;
    customer_b_id UUID;
    location_a_id UUID;
    location_b_id UUID;
    project_a_id UUID;
    project_b_id UUID;
    site_a_id UUID;
    site_b_id UUID;
    user_a_id UUID;
    user_b_id UUID;
    assignment_id UUID;
BEGIN
    SELECT id INTO company_a_id
    FROM companies
    WHERE company_number = 'F-000001';

    INSERT INTO companies (legal_name, display_name)
    VALUES ('Planungstest Zweitfirma GmbH', 'Planungstest Zweitfirma')
    RETURNING id INTO company_b_id;

    INSERT INTO customers (company_id, customer_type, company_name)
    VALUES (company_a_id, 'company', 'Planungskunde A GmbH')
    RETURNING id INTO customer_a_id;

    INSERT INTO customers (company_id, customer_type, company_name)
    VALUES (company_b_id, 'company', 'Planungskunde B GmbH')
    RETURNING id INTO customer_b_id;

    INSERT INTO customer_locations (
        company_id, customer_id, name, street, house_number, postal_code, city
    ) VALUES (
        company_a_id, customer_a_id, 'Planungsort A', 'Testweg', '1', '12345', 'Teststadt'
    ) RETURNING id INTO location_a_id;

    INSERT INTO customer_locations (
        company_id, customer_id, name, street, house_number, postal_code, city
    ) VALUES (
        company_b_id, customer_b_id, 'Planungsort B', 'Testweg', '2', '12345', 'Teststadt'
    ) RETURNING id INTO location_b_id;

    INSERT INTO projects (company_id, customer_id, name)
    VALUES (company_a_id, customer_a_id, 'Planungsprojekt A')
    RETURNING id INTO project_a_id;

    INSERT INTO projects (company_id, customer_id, name)
    VALUES (company_b_id, customer_b_id, 'Planungsprojekt B')
    RETURNING id INTO project_b_id;

    INSERT INTO construction_sites (
        company_id, project_id, customer_location_id, name
    ) VALUES (
        company_a_id, project_a_id, location_a_id, 'Planungsbaustelle A'
    ) RETURNING id INTO site_a_id;

    INSERT INTO construction_sites (
        company_id, project_id, customer_location_id, name
    ) VALUES (
        company_b_id, project_b_id, location_b_id, 'Planungsbaustelle B'
    ) RETURNING id INTO site_b_id;

    INSERT INTO users (company_id, personnel_number, first_name, last_name)
    VALUES (company_a_id, 'PLAN-A', 'Plan', 'A')
    RETURNING id INTO user_a_id;

    INSERT INTO users (company_id, personnel_number, first_name, last_name)
    VALUES (company_b_id, 'PLAN-B', 'Plan', 'B')
    RETURNING id INTO user_b_id;

    INSERT INTO site_assignments (
        company_id, user_id, construction_site_id, work_date,
        sequence_number, status, planned_start_time
    ) VALUES (
        company_a_id, user_a_id, site_a_id, DATE '2026-07-20',
        1, 'released', TIME '07:30'
    ) RETURNING id INTO assignment_id;

    INSERT INTO site_assignments (
        company_id, user_id, construction_site_id, work_date,
        sequence_number, status
    ) VALUES (
        company_a_id, user_a_id, site_a_id, DATE '2026-07-20',
        2, 'released'
    );

    IF (SELECT COUNT(*) FROM site_assignments WHERE company_id = company_a_id) <> 2 THEN
        RAISE EXCEPTION 'Dieselbe Baustelle konnte nicht mehrfach am Tag geplant werden';
    END IF;

    BEGIN
        INSERT INTO site_assignments (
            company_id, user_id, construction_site_id, work_date,
            sequence_number
        ) VALUES (
            company_a_id, user_a_id, site_a_id, DATE '2026-07-20', 2
        );
        RAISE EXCEPTION USING ERRCODE = 'ZX901', MESSAGE = 'Doppelte Tagesreihenfolge wurde akzeptiert';
    EXCEPTION
        WHEN unique_violation THEN NULL;
    END;

    BEGIN
        UPDATE site_assignments
        SET planned_start_time = TIME '08:00'
        WHERE id = assignment_id;
        RAISE EXCEPTION USING ERRCODE = 'ZX902', MESSAGE = 'Planänderung ohne Begründung wurde akzeptiert';
    EXCEPTION
        WHEN SQLSTATE 'P0001' THEN NULL;
    END;

    UPDATE site_assignments
    SET planned_start_time = TIME '08:00',
        last_change_reason = 'Kunde öffnet später'
    WHERE id = assignment_id;

    IF NOT EXISTS (
        SELECT 1
        FROM site_assignment_history
        WHERE site_assignment_id = assignment_id
          AND change_reason = 'Kunde öffnet später'
          AND previous_values ->> 'planned_start_time' = '07:30:00'
    ) THEN
        RAISE EXCEPTION 'Freigegebene Planänderung wurde nicht historisiert';
    END IF;

    BEGIN
        INSERT INTO site_assignments (
            company_id, user_id, construction_site_id, work_date, sequence_number
        ) VALUES (
            company_a_id, user_a_id, site_b_id, DATE '2026-07-21', 1
        );
        RAISE EXCEPTION USING ERRCODE = 'ZX903', MESSAGE = 'Firmenfremde Baustelle wurde akzeptiert';
    EXCEPTION
        WHEN foreign_key_violation THEN NULL;
    END;

    INSERT INTO site_assignments (
        company_id, user_id, construction_site_id, work_date, sequence_number
    ) VALUES (
        company_b_id, user_b_id, site_b_id, DATE '2026-07-20', 1
    );

    BEGIN
        DELETE FROM site_assignments WHERE id = assignment_id;
        RAISE EXCEPTION USING ERRCODE = 'ZX904', MESSAGE = 'Hartes Löschen wurde akzeptiert';
    EXCEPTION
        WHEN SQLSTATE 'P0001' THEN NULL;
    END;
END;
$$;

SELECT id AS tenant_a_id
FROM companies
WHERE company_number = 'F-000001'
\gset

SET LOCAL ROLE schaefchen_api;
SELECT set_config('app.current_company_id', :'tenant_a_id', TRUE);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM site_assignments
        WHERE company_id <> NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID
    ) THEN
        RAISE EXCEPTION 'API-Rolle sieht firmenfremde Planungen';
    END IF;
END;
$$;

RESET ROLE;
ROLLBACK;

\echo 'Migration 009_create_site_assignments.sql erfolgreich getestet.'
