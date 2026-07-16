\echo 'Teste Migration 001_create_companies.sql ...'

BEGIN;

DO $$
DECLARE
    seeded_company companies%ROWTYPE;
    test_company_id UUID;
    generated_number VARCHAR(20);
    version_before BIGINT;
    version_after BIGINT;
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_extension
        WHERE extname = 'pgcrypto'
    ) THEN
        RAISE EXCEPTION 'pgcrypto wurde nicht aktiviert';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_class
        WHERE oid = 'companies'::REGCLASS
          AND relrowsecurity
    ) THEN
        RAISE EXCEPTION 'Row Level Security ist für companies nicht aktiviert';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'companies'
          AND policyname = 'companies_tenant_isolation'
    ) THEN
        RAISE EXCEPTION 'Mandanten-Policy companies_tenant_isolation fehlt';
    END IF;

    SELECT *
    INTO seeded_company
    FROM companies
    WHERE company_number = 'F-000001';

    IF NOT FOUND OR seeded_company.legal_name <> 'Schaaf Elektro GmbH' THEN
        RAISE EXCEPTION 'Seed-Datensatz Schaaf Elektro GmbH fehlt oder ist ungültig';
    END IF;

    INSERT INTO companies (legal_name, display_name)
    VALUES ('Migrationstest GmbH', 'Migrationstest')
    RETURNING id, company_number, row_version
    INTO test_company_id, generated_number, version_before;

    IF generated_number !~ '^F-[0-9]{6}$' THEN
        RAISE EXCEPTION 'Automatische Firmennummer ist ungültig: %', generated_number;
    END IF;

    UPDATE companies
    SET display_name = 'Migrationstest aktualisiert'
    WHERE id = test_company_id
    RETURNING row_version INTO version_after;

    IF version_after <> version_before + 1 THEN
        RAISE EXCEPTION 'row_version wurde beim Update nicht erhöht';
    END IF;

    UPDATE companies
    SET status = 'inactive'
    WHERE id = test_company_id;

    IF NOT EXISTS (
        SELECT 1
        FROM companies
        WHERE id = test_company_id
          AND status = 'inactive'
          AND deactivated_at IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'Deaktivierung setzt deactivated_at nicht korrekt';
    END IF;

    BEGIN
        INSERT INTO companies (legal_name, display_name, status)
        VALUES ('Ungültige Firma', 'Ungültig', 'deleted');
        RAISE EXCEPTION USING ERRCODE = 'ZX001', MESSAGE = 'Ungültiger Status wurde akzeptiert';
    EXCEPTION
        WHEN check_violation THEN
            NULL;
    END;

    BEGIN
        DELETE FROM companies WHERE id = test_company_id;
        RAISE EXCEPTION USING ERRCODE = 'ZX002', MESSAGE = 'Hartes Löschen wurde akzeptiert';
    EXCEPTION
        WHEN SQLSTATE 'P0001' THEN
            NULL;
    END;
END;
$$;

ROLLBACK;

\echo 'Migration 001_create_companies.sql erfolgreich getestet.'
