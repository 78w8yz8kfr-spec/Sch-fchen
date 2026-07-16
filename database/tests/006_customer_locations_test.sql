\echo 'Teste Migration 006_create_customer_locations.sql ...'

BEGIN;

DO $$
DECLARE
    company_a_id UUID;
    company_b_id UUID;
    customer_a_id UUID;
    customer_b_id UUID;
    location_id UUID;
    location_number VARCHAR(20);
    version_before BIGINT;
    version_after BIGINT;
BEGIN
    SELECT id INTO company_a_id
    FROM companies
    WHERE company_number = 'F-000001';

    INSERT INTO companies (legal_name, display_name)
    VALUES ('Standorttest Zweitfirma GmbH', 'Standorttest Zweitfirma')
    RETURNING id INTO company_b_id;

    INSERT INTO customers (company_id, customer_number, customer_type, company_name)
    VALUES (company_a_id, NULL, 'company', 'Standortkunde GmbH')
    RETURNING id INTO customer_a_id;

    INSERT INTO customers (company_id, customer_number, customer_type, company_name)
    VALUES (company_b_id, NULL, 'company', 'Fremder Standortkunde GmbH')
    RETURNING id INTO customer_b_id;

    INSERT INTO customer_locations (
        company_id,
        customer_id,
        location_number,
        name,
        location_type,
        street,
        house_number,
        postal_code,
        city,
        latitude,
        longitude,
        geocoded_at,
        opening_hours,
        is_billing_location
    )
    VALUES (
        company_a_id,
        customer_a_id,
        NULL,
        '  Hauptstandort  ',
        'commercial',
        '  Teststraße  ',
        '  1  ',
        '  12345  ',
        '  Teststadt  ',
        52.520000,
        13.405000,
        CURRENT_TIMESTAMP,
        '{"monday":"08:00-16:00"}',
        TRUE
    )
    RETURNING id, location_number, row_version
    INTO location_id, location_number, version_before;

    IF location_number <> 'SE-S-00001' THEN
        RAISE EXCEPTION 'Standortnummer wurde nicht korrekt erzeugt: %', location_number;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM customer_locations
        WHERE id = location_id
          AND name = 'Hauptstandort'
          AND street = 'Teststraße'
          AND city = 'Teststadt'
    ) THEN
        RAISE EXCEPTION 'Standortdaten wurden nicht normalisiert';
    END IF;

    UPDATE customer_locations
    SET access_notes = '  Anmeldung am Empfang  '
    WHERE id = location_id
    RETURNING row_version INTO version_after;

    IF version_after <> version_before + 1 THEN
        RAISE EXCEPTION 'row_version wurde beim Standort-Update nicht erhöht';
    END IF;

    BEGIN
        INSERT INTO customer_locations (
            company_id, customer_id, location_number, name, street,
            house_number, postal_code, city, latitude
        )
        VALUES (
            company_a_id, customer_a_id, NULL, 'Halbes Geocoding',
            'Straße', '2', '12345', 'Ort', 51.0
        );
        RAISE EXCEPTION USING ERRCODE = 'ZX601', MESSAGE = 'Unvollständige Koordinaten wurden akzeptiert';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO customer_locations (
            company_id, customer_id, location_number, name, street,
            house_number, postal_code, city
        )
        VALUES (
            company_a_id, customer_b_id, NULL, 'Fremdstandort',
            'Straße', '2', '12345', 'Ort'
        );
        RAISE EXCEPTION USING ERRCODE = 'ZX602', MESSAGE = 'Firmenfremder Kunde wurde akzeptiert';
    EXCEPTION
        WHEN foreign_key_violation THEN NULL;
    END;

    UPDATE customer_locations SET status = 'archived' WHERE id = location_id;

    IF NOT EXISTS (
        SELECT 1 FROM customer_locations
        WHERE id = location_id
          AND status = 'archived'
          AND archived_at IS NOT NULL
          AND NOT is_billing_location
    ) THEN
        RAISE EXCEPTION 'Standortarchivierung wurde nicht historisiert';
    END IF;

    BEGIN
        DELETE FROM customer_locations WHERE id = location_id;
        RAISE EXCEPTION USING ERRCODE = 'ZX603', MESSAGE = 'Hartes Löschen wurde akzeptiert';
    EXCEPTION
        WHEN SQLSTATE 'P0001' THEN NULL;
    END;
END;
$$;

ROLLBACK;

\echo 'Migration 006_create_customer_locations.sql erfolgreich getestet.'
