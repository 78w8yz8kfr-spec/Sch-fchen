\echo 'Teste Migration 008_create_construction_sites.sql ...'

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
    project_a_id UUID;
    project_b_id UUID;
    site_id UUID;
    generated_site_number VARCHAR(24);
    version_before BIGINT;
    version_after BIGINT;
BEGIN
    SELECT id INTO company_a_id
    FROM companies
    WHERE company_number = 'F-000001';

    INSERT INTO companies (legal_name, display_name)
    VALUES ('Baustellentest Zweitfirma GmbH', 'Baustellentest Zweitfirma')
    RETURNING id INTO company_b_id;

    INSERT INTO customers (company_id, customer_number, customer_type, company_name)
    VALUES (company_a_id, NULL, 'company', 'Baustellenkunde GmbH')
    RETURNING id INTO customer_a_id;

    INSERT INTO customers (company_id, customer_number, customer_type, company_name)
    VALUES (company_a_id, NULL, 'company', 'Anderer Baustellenkunde GmbH')
    RETURNING id INTO customer_a_other_id;

    INSERT INTO customers (company_id, customer_number, customer_type, company_name)
    VALUES (company_b_id, NULL, 'company', 'Fremder Baustellenkunde GmbH')
    RETURNING id INTO customer_b_id;

    INSERT INTO customer_locations (
        company_id, customer_id, location_number, name, street,
        house_number, postal_code, city
    )
    VALUES (company_a_id, customer_a_id, NULL, 'Baustellenstandort', 'Straße', '1', '12345', 'Ort')
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

    INSERT INTO projects (company_id, customer_id, project_number, name)
    VALUES (company_a_id, customer_a_id, NULL, 'Baustellenprojekt')
    RETURNING id INTO project_a_id;

    INSERT INTO projects (company_id, customer_id, project_number, name)
    VALUES (company_b_id, customer_b_id, NULL, 'Fremdprojekt')
    RETURNING id INTO project_b_id;

    INSERT INTO construction_sites (
        company_id,
        project_id,
        customer_location_id,
        site_number,
        name,
        area_label,
        status,
        latitude,
        longitude,
        qr_code,
        planned_start_date,
        planned_end_date
    )
    VALUES (
        company_a_id,
        project_a_id,
        location_a_id,
        NULL,
        '  Hauptbaustelle  ',
        '  Erdgeschoss  ',
        'planned',
        52.520000,
        13.405000,
        'site-test-001',
        CURRENT_DATE,
        CURRENT_DATE + 14
    )
    RETURNING id, site_number, row_version
    INTO site_id, generated_site_number, version_before;

    IF generated_site_number <> 'SE-B-' || EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER || '-0001' THEN
        RAISE EXCEPTION 'Baustellennummer wurde nicht korrekt erzeugt: %', generated_site_number;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM construction_sites
        WHERE id = site_id
          AND name = 'Hauptbaustelle'
          AND area_label = 'Erdgeschoss'
    ) THEN
        RAISE EXCEPTION 'Baustellendaten wurden nicht normalisiert';
    END IF;

    UPDATE construction_sites SET status = 'active' WHERE id = site_id
    RETURNING row_version INTO version_after;

    IF version_after <> version_before + 1 OR NOT EXISTS (
        SELECT 1 FROM construction_sites
        WHERE id = site_id AND actual_start_at IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'Baustellenstart oder row_version ist ungültig';
    END IF;

    UPDATE construction_sites SET status = 'delayed' WHERE id = site_id;
    UPDATE construction_sites SET status = 'completed' WHERE id = site_id;

    IF NOT EXISTS (
        SELECT 1 FROM construction_sites
        WHERE id = site_id
          AND status = 'completed'
          AND completed_at IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'Baustellenabschluss wurde nicht historisiert';
    END IF;

    BEGIN
        INSERT INTO construction_sites (
            company_id, project_id, customer_location_id,
            site_number, name
        )
        VALUES (company_a_id, project_a_id, location_a_other_id, NULL, 'Falscher Kunde');
        RAISE EXCEPTION USING ERRCODE = 'ZX801', MESSAGE = 'Standort eines anderen Kunden wurde akzeptiert';
    EXCEPTION
        WHEN SQLSTATE 'P0001' THEN NULL;
    END;

    BEGIN
        INSERT INTO construction_sites (
            company_id, project_id, customer_location_id,
            site_number, name
        )
        VALUES (company_a_id, project_b_id, location_a_id, NULL, 'Fremdprojekt');
        RAISE EXCEPTION USING ERRCODE = 'ZX805', MESSAGE = 'Firmenfremdes Projekt wurde akzeptiert';
    EXCEPTION
        WHEN foreign_key_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO construction_sites (
            company_id, project_id, customer_location_id,
            site_number, name
        )
        VALUES (company_a_id, project_a_id, location_b_id, NULL, 'Fremdstandort');
        RAISE EXCEPTION USING ERRCODE = 'ZX806', MESSAGE = 'Firmenfremder Standort wurde akzeptiert';
    EXCEPTION
        WHEN foreign_key_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO construction_sites (
            company_id, project_id, site_number, name, latitude
        )
        VALUES (company_a_id, project_a_id, NULL, 'Halbe Koordinate', 51.0);
        RAISE EXCEPTION USING ERRCODE = 'ZX807', MESSAGE = 'Unvollständige Koordinaten wurden akzeptiert';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;

    BEGIN
        DELETE FROM construction_sites WHERE id = site_id;
        RAISE EXCEPTION USING ERRCODE = 'ZX808', MESSAGE = 'Hartes Löschen wurde akzeptiert';
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
        SELECT 1 FROM construction_sites
        WHERE company_id <> NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID
    ) THEN
        RAISE EXCEPTION 'API-Rolle sieht firmenfremde Baustellen';
    END IF;
END;
$$;

RESET ROLE;
ROLLBACK;

\echo 'Migration 008_create_construction_sites.sql erfolgreich getestet.'
