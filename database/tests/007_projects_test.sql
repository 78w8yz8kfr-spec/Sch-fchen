\echo 'Teste Migration 007_create_projects.sql ...'

BEGIN;

DO $$
DECLARE
    company_a_id UUID;
    company_b_id UUID;
    customer_a_id UUID;
    customer_a_other_id UUID;
    customer_b_id UUID;
    location_a_id UUID;
    location_a_other_id UUID;
    location_b_id UUID;
    user_a_id UUID;
    user_b_id UUID;
    project_id UUID;
    project_number VARCHAR(20);
    version_before BIGINT;
    version_after BIGINT;
BEGIN
    SELECT id INTO company_a_id
    FROM companies
    WHERE company_number = 'F-000001';

    INSERT INTO companies (legal_name, display_name)
    VALUES ('Projekttest Zweitfirma GmbH', 'Projekttest Zweitfirma')
    RETURNING id INTO company_b_id;

    INSERT INTO customers (company_id, customer_number, customer_type, company_name)
    VALUES (company_a_id, NULL, 'company', 'Projektkunde GmbH')
    RETURNING id INTO customer_a_id;

    INSERT INTO customers (company_id, customer_number, customer_type, company_name)
    VALUES (company_a_id, NULL, 'company', 'Anderer Projektkunde GmbH')
    RETURNING id INTO customer_a_other_id;

    INSERT INTO customers (company_id, customer_number, customer_type, company_name)
    VALUES (company_b_id, NULL, 'company', 'Fremder Projektkunde GmbH')
    RETURNING id INTO customer_b_id;

    INSERT INTO customer_locations (
        company_id, customer_id, location_number, name, street,
        house_number, postal_code, city
    )
    VALUES (company_a_id, customer_a_id, NULL, 'Projektstandort', 'Straße', '1', '12345', 'Ort')
    RETURNING id INTO location_a_id;

    INSERT INTO customer_locations (
        company_id, customer_id, location_number, name, street,
        house_number, postal_code, city
    )
    VALUES (company_a_id, customer_a_other_id, NULL, 'Anderer Standort', 'Straße', '2', '12345', 'Ort')
    RETURNING id INTO location_a_other_id;

    INSERT INTO customer_locations (
        company_id, customer_id, location_number, name, street,
        house_number, postal_code, city
    )
    VALUES (company_b_id, customer_b_id, NULL, 'Fremdstandort', 'Straße', '1', '12345', 'Ort')
    RETURNING id INTO location_b_id;

    INSERT INTO users (company_id, personnel_number, first_name, last_name)
    VALUES (company_a_id, 'PROJECT-A', 'Projekt', 'Verantwortlich')
    RETURNING id INTO user_a_id;

    INSERT INTO users (company_id, personnel_number, first_name, last_name)
    VALUES (company_b_id, 'PROJECT-B', 'Fremd', 'Verantwortlich')
    RETURNING id INTO user_b_id;

    INSERT INTO projects (
        company_id,
        customer_id,
        project_number,
        name,
        priority,
        installer_short_text,
        budget_amount,
        start_date,
        target_end_date
    )
    VALUES (
        company_a_id,
        customer_a_id,
        NULL,
        '  Büroausbau  ',
        'high',
        '  Verteilung erneuern  ',
        25000.00,
        CURRENT_DATE,
        CURRENT_DATE + 30
    )
    RETURNING id, project_number, row_version
    INTO project_id, project_number, version_before;

    IF project_number <> 'SE-' || EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER || '-0001' THEN
        RAISE EXCEPTION 'Projektnummer wurde nicht korrekt erzeugt: %', project_number;
    END IF;

    INSERT INTO project_locations (company_id, project_id, customer_location_id)
    VALUES (company_a_id, project_id, location_a_id);

    INSERT INTO project_responsibles (
        company_id, project_id, user_id, responsibility, is_primary
    )
    VALUES (company_a_id, project_id, user_a_id, 'project_management', TRUE);

    UPDATE projects SET status = 'completed' WHERE id = project_id
    RETURNING row_version INTO version_after;

    IF version_after <> version_before + 1 OR NOT EXISTS (
        SELECT 1 FROM projects
        WHERE id = project_id AND completed_at IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'Projektabschluss oder row_version ist ungültig';
    END IF;

    UPDATE projects SET status = 'active' WHERE id = project_id;

    IF NOT EXISTS (
        SELECT 1 FROM projects
        WHERE id = project_id
          AND completed_at IS NULL
          AND reopened_at IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'Wiederöffnung des Projekts wurde nicht historisiert';
    END IF;

    BEGIN
        INSERT INTO project_locations (company_id, project_id, customer_location_id)
        VALUES (company_a_id, project_id, location_a_other_id);
        RAISE EXCEPTION USING ERRCODE = 'ZX701', MESSAGE = 'Standort eines anderen Kunden wurde akzeptiert';
    EXCEPTION
        WHEN SQLSTATE 'P0001' THEN NULL;
    END;

    BEGIN
        INSERT INTO project_locations (company_id, project_id, customer_location_id)
        VALUES (company_a_id, project_id, location_b_id);
        RAISE EXCEPTION USING ERRCODE = 'ZX704', MESSAGE = 'Firmenfremder Standort wurde akzeptiert';
    EXCEPTION
        WHEN foreign_key_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO project_responsibles (
            company_id, project_id, user_id, responsibility
        )
        VALUES (company_a_id, project_id, user_b_id, 'technical');
        RAISE EXCEPTION USING ERRCODE = 'ZX705', MESSAGE = 'Firmenfremder Verantwortlicher wurde akzeptiert';
    EXCEPTION
        WHEN foreign_key_violation THEN NULL;
    END;

    BEGIN
        DELETE FROM projects WHERE id = project_id;
        RAISE EXCEPTION USING ERRCODE = 'ZX706', MESSAGE = 'Hartes Löschen wurde akzeptiert';
    EXCEPTION
        WHEN SQLSTATE 'P0001' THEN NULL;
    END;
END;
$$;

ROLLBACK;

\echo 'Migration 007_create_projects.sql erfolgreich getestet.'
