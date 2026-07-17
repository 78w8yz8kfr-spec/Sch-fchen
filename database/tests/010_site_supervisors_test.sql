\echo 'Teste Migration 010_create_site_supervisors.sql ...'

BEGIN;

DO $$
<<supervisor_test>>
DECLARE
    company_id UUID;
    customer_id UUID;
    location_id UUID;
    project_id UUID;
    site_id UUID;
    foreman_role_id UUID;
    foreman_one_id UUID;
    foreman_two_id UUID;
    installer_id UUID;
    first_assignment_id UUID;
    second_assignment_id UUID;
BEGIN
    SELECT id INTO company_id
    FROM companies
    WHERE company_number = 'F-000001';

    SELECT id INTO foreman_role_id
    FROM roles
    WHERE roles.company_id = supervisor_test.company_id
      AND role_key = 'foreman';

    INSERT INTO customers (company_id, customer_type, company_name)
    VALUES (company_id, 'company', 'Vorarbeitertest Kunde GmbH')
    RETURNING id INTO customer_id;

    INSERT INTO customer_locations (
        company_id, customer_id, name, street, house_number, postal_code, city
    ) VALUES (
        company_id, customer_id, 'Vorarbeitertest Ort', 'Testweg', '10', '12345', 'Teststadt'
    ) RETURNING id INTO location_id;

    INSERT INTO projects (company_id, customer_id, name)
    VALUES (company_id, customer_id, 'Vorarbeitertest Projekt')
    RETURNING id INTO project_id;

    INSERT INTO construction_sites (
        company_id, project_id, customer_location_id, name
    ) VALUES (
        company_id, project_id, location_id, 'Vorarbeitertest Baustelle'
    ) RETURNING id INTO site_id;

    INSERT INTO users (company_id, personnel_number, first_name, last_name)
    VALUES (company_id, 'FOREMAN-1', 'Erste', 'Vorarbeiterin')
    RETURNING id INTO foreman_one_id;

    INSERT INTO users (company_id, personnel_number, first_name, last_name)
    VALUES (company_id, 'FOREMAN-2', 'Zweiter', 'Vorarbeiter')
    RETURNING id INTO foreman_two_id;

    INSERT INTO users (company_id, personnel_number, first_name, last_name)
    VALUES (company_id, 'INSTALLER-1', 'Keine', 'Vorarbeiterrolle')
    RETURNING id INTO installer_id;

    INSERT INTO user_roles (company_id, user_id, role_id)
    VALUES
        (company_id, foreman_one_id, foreman_role_id),
        (company_id, foreman_two_id, foreman_role_id);

    IF (
        SELECT COUNT(*)
        FROM users AS candidate
        WHERE candidate.id IN (foreman_one_id, foreman_two_id)
          AND candidate.is_foreman
    ) <> 2 THEN
        RAISE EXCEPTION 'Vorarbeiter-Lesewert wurde nicht aus Rollen gepflegt';
    END IF;

    INSERT INTO site_supervisors (
        company_id, construction_site_id, user_id, valid_from,
        status, is_primary, report_responsible
    ) VALUES (
        company_id, site_id, foreman_one_id, DATE '2026-07-20',
        'active', TRUE, TRUE
    ) RETURNING id INTO first_assignment_id;

    INSERT INTO site_supervisors (
        company_id, construction_site_id, user_id, valid_from,
        status, is_primary
    ) VALUES (
        company_id, site_id, foreman_two_id, DATE '2026-07-21',
        'active', TRUE
    ) RETURNING id INTO second_assignment_id;

    IF NOT EXISTS (
        SELECT 1 FROM site_supervisors
        WHERE id = first_assignment_id
          AND status = 'ended'
          AND NOT is_primary
          AND NOT report_responsible
          AND last_change_reason = 'Automatische Übergabe an neuen Hauptvorarbeiter'
    ) THEN
        RAISE EXCEPTION 'Bisheriger Hauptvorarbeiter wurde nicht automatisch beendet';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM site_supervisors
        WHERE id = second_assignment_id
          AND status = 'active'
          AND is_primary
          AND report_responsible
    ) THEN
        RAISE EXCEPTION 'Haupt- oder Berichtsverantwortung wurde nicht übertragen';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM site_supervisor_history
        WHERE site_supervisor_id = first_assignment_id
          AND previous_values ->> 'status' = 'active'
    ) THEN
        RAISE EXCEPTION 'Automatische Übergabe wurde nicht historisiert';
    END IF;

    INSERT INTO site_supervisors (
        company_id, construction_site_id, user_id, valid_from,
        status, is_primary
    ) VALUES (
        company_id, site_id, foreman_one_id, DATE '2026-08-01',
        'planned', TRUE
    );

    BEGIN
        INSERT INTO site_supervisors (
            company_id, construction_site_id, user_id, valid_from, status
        ) VALUES (
            company_id, site_id, installer_id, DATE '2026-07-22', 'planned'
        );
        RAISE EXCEPTION USING ERRCODE = 'ZXA01', MESSAGE = 'Monteur ohne Vorarbeiterrolle wurde akzeptiert';
    EXCEPTION
        WHEN SQLSTATE 'P0001' THEN NULL;
    END;

    BEGIN
        DELETE FROM site_supervisors WHERE id = second_assignment_id;
        RAISE EXCEPTION USING ERRCODE = 'ZXA02', MESSAGE = 'Hartes Löschen wurde akzeptiert';
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
    IF (SELECT COUNT(*) FROM site_supervisors) <> 3 THEN
        RAISE EXCEPTION 'API-Rolle sieht nicht alle eigenen Vorarbeiterzuweisungen';
    END IF;

    PERFORM set_config('app.current_company_id', gen_random_uuid()::TEXT, TRUE);

    IF EXISTS (SELECT 1 FROM site_supervisors) THEN
        RAISE EXCEPTION 'API-Rolle sieht Vorarbeiterzuweisungen eines anderen Mandanten';
    END IF;
END;
$$;

RESET ROLE;
ROLLBACK;

\echo 'Migration 010_create_site_supervisors.sql erfolgreich getestet.'
