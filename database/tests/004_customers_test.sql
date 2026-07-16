\echo 'Teste Migration 004_create_customers.sql ...'

BEGIN;

DO $$
DECLARE
    company_a_id UUID;
    company_b_id UUID;
    customer_a_id UUID;
    customer_b_id UUID;
    foreign_customer_id UUID;
    number_a VARCHAR(20);
    number_b VARCHAR(20);
    version_before BIGINT;
    version_after BIGINT;
BEGIN
    SELECT id INTO company_a_id
    FROM companies
    WHERE company_number = 'F-000001';

    INSERT INTO companies (legal_name, display_name)
    VALUES ('Kundentest Zweitfirma GmbH', 'Kundentest Zweitfirma')
    RETURNING id INTO company_b_id;

    INSERT INTO customers (
        company_id,
        customer_number,
        customer_type,
        first_name,
        last_name,
        debtor_number,
        email
    )
    VALUES (
        company_a_id,
        NULL,
        'private',
        '  Erika  ',
        '  Mustermann  ',
        'DEB-100',
        'erika@example.invalid'
    )
    RETURNING id, customer_number, row_version
    INTO customer_a_id, number_a, version_before;

    INSERT INTO customers (
        company_id,
        customer_number,
        customer_type,
        company_name,
        vat_id
    )
    VALUES (
        company_a_id,
        NULL,
        'company',
        '  Testbetrieb GmbH  ',
        ' de123456789 '
    )
    RETURNING id, customer_number INTO customer_b_id, number_b;

    IF number_a <> 'SE-K-00001' OR number_b <> 'SE-K-00002' THEN
        RAISE EXCEPTION 'Kundennummern wurden nicht fortlaufend erzeugt: %, %', number_a, number_b;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM customers
        WHERE id = customer_a_id
          AND first_name = 'Erika'
          AND last_name = 'Mustermann'
    ) THEN
        RAISE EXCEPTION 'Kundendaten wurden nicht normalisiert';
    END IF;

    UPDATE customers
    SET phone = '+49 000 000000'
    WHERE id = customer_a_id
    RETURNING row_version INTO version_after;

    IF version_after <> version_before + 1 THEN
        RAISE EXCEPTION 'row_version wurde beim Kunden-Update nicht erhöht';
    END IF;

    BEGIN
        INSERT INTO customers (
            company_id,
            customer_number,
            customer_type,
            company_name,
            debtor_number
        )
        VALUES (company_a_id, NULL, 'company', 'Doppelt GmbH', 'DEB-100');
        RAISE EXCEPTION USING ERRCODE = 'ZX401', MESSAGE = 'Doppelte Debitorennummer wurde akzeptiert';
    EXCEPTION
        WHEN unique_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO customers (
            company_id,
            customer_number,
            customer_type,
            first_name,
            last_name,
            vat_id
        )
        VALUES (company_a_id, NULL, 'private', 'Privat', 'Kunde', 'DE000');
        RAISE EXCEPTION USING ERRCODE = 'ZX402', MESSAGE = 'USt-ID bei Privatkunde wurde akzeptiert';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;

    INSERT INTO customers (
        company_id,
        customer_number,
        customer_type,
        company_name
    )
    VALUES (company_b_id, NULL, 'company', 'Fremdkunde GmbH')
    RETURNING id INTO foreign_customer_id;

    BEGIN
        UPDATE customers
        SET status = 'merged',
            merged_into_customer_id = foreign_customer_id
        WHERE id = customer_a_id;
        RAISE EXCEPTION USING ERRCODE = 'ZX403', MESSAGE = 'Firmenfremde Zusammenführung wurde akzeptiert';
    EXCEPTION
        WHEN foreign_key_violation THEN NULL;
    END;

    UPDATE customers
    SET status = 'merged',
        merged_into_customer_id = customer_b_id
    WHERE id = customer_a_id;

    IF NOT EXISTS (
        SELECT 1 FROM customers
        WHERE id = customer_a_id
          AND status = 'merged'
          AND archived_at IS NOT NULL
          AND merged_into_customer_id = customer_b_id
    ) THEN
        RAISE EXCEPTION 'Dubletten-Zusammenführung wurde nicht historisiert';
    END IF;

    BEGIN
        DELETE FROM customers WHERE id = customer_b_id;
        RAISE EXCEPTION USING ERRCODE = 'ZX404', MESSAGE = 'Hartes Löschen eines Kunden wurde akzeptiert';
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
        SELECT 1 FROM customers
        WHERE company_id <> NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID
    ) THEN
        RAISE EXCEPTION 'API-Rolle sieht firmenfremde Kunden';
    END IF;
END;
$$;

RESET ROLE;
ROLLBACK;

\echo 'Migration 004_create_customers.sql erfolgreich getestet.'
