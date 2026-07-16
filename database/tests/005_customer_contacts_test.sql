\echo 'Teste Migration 005_create_customer_contacts.sql ...'

BEGIN;

DO $$
DECLARE
    company_a_id UUID;
    company_b_id UUID;
    customer_a_id UUID;
    customer_b_id UUID;
    contact_id UUID;
    version_before BIGINT;
    version_after BIGINT;
BEGIN
    SELECT id INTO company_a_id
    FROM companies
    WHERE company_number = 'F-000001';

    INSERT INTO companies (legal_name, display_name)
    VALUES ('Kontakttest Zweitfirma GmbH', 'Kontakttest Zweitfirma')
    RETURNING id INTO company_b_id;

    INSERT INTO customers (company_id, customer_number, customer_type, company_name)
    VALUES (company_a_id, NULL, 'company', 'Kontaktkunde GmbH')
    RETURNING id INTO customer_a_id;

    INSERT INTO customers (company_id, customer_number, customer_type, company_name)
    VALUES (company_b_id, NULL, 'company', 'Fremder Kontaktkunde GmbH')
    RETURNING id INTO customer_b_id;

    INSERT INTO customer_contacts (
        company_id,
        customer_id,
        first_name,
        last_name,
        function_title,
        responsibilities,
        email,
        is_primary
    )
    VALUES (
        company_a_id,
        customer_a_id,
        '  Frieda  ',
        '  Beispiel  ',
        ' Bauleitung ',
        ARRAY['site_management', 'billing', 'billing'],
        'frieda@example.invalid',
        TRUE
    )
    RETURNING id, row_version INTO contact_id, version_before;

    IF NOT EXISTS (
        SELECT 1 FROM customer_contacts
        WHERE id = contact_id
          AND first_name = 'Frieda'
          AND last_name = 'Beispiel'
          AND responsibilities = ARRAY['billing', 'site_management']
    ) THEN
        RAISE EXCEPTION 'Ansprechpartner wurde nicht normalisiert';
    END IF;

    UPDATE customer_contacts
    SET mobile = '+49 000 000001'
    WHERE id = contact_id
    RETURNING row_version INTO version_after;

    IF version_after <> version_before + 1 THEN
        RAISE EXCEPTION 'row_version wurde beim Ansprechpartner-Update nicht erhöht';
    END IF;

    BEGIN
        INSERT INTO customer_contacts (
            company_id, customer_id, first_name, last_name, phone, is_primary
        )
        VALUES (company_a_id, customer_a_id, 'Zweiter', 'Hauptkontakt', '1', TRUE);
        RAISE EXCEPTION USING ERRCODE = 'ZX501', MESSAGE = 'Zweiter Hauptkontakt wurde akzeptiert';
    EXCEPTION
        WHEN unique_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO customer_contacts (
            company_id, customer_id, first_name, last_name, phone
        )
        VALUES (company_a_id, customer_b_id, 'Fremd', 'Kontakt', '1');
        RAISE EXCEPTION USING ERRCODE = 'ZX502', MESSAGE = 'Firmenfremder Kunde wurde akzeptiert';
    EXCEPTION
        WHEN foreign_key_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO customer_contacts (
            company_id, customer_id, first_name, last_name, phone, responsibilities
        )
        VALUES (company_a_id, customer_a_id, 'Unbekannt', 'Zuständig', '1', ARRAY['marketing']);
        RAISE EXCEPTION USING ERRCODE = 'ZX503', MESSAGE = 'Unbekannte Zuständigkeit wurde akzeptiert';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;

    UPDATE customer_contacts SET status = 'inactive' WHERE id = contact_id;

    IF NOT EXISTS (
        SELECT 1 FROM customer_contacts
        WHERE id = contact_id
          AND status = 'inactive'
          AND deactivated_at IS NOT NULL
          AND NOT is_primary
    ) THEN
        RAISE EXCEPTION 'Ansprechpartner-Deaktivierung wurde nicht historisiert';
    END IF;

    BEGIN
        DELETE FROM customer_contacts WHERE id = contact_id;
        RAISE EXCEPTION USING ERRCODE = 'ZX504', MESSAGE = 'Hartes Löschen wurde akzeptiert';
    EXCEPTION
        WHEN SQLSTATE 'P0001' THEN NULL;
    END;
END;
$$;

ROLLBACK;

\echo 'Migration 005_create_customer_contacts.sql erfolgreich getestet.'
