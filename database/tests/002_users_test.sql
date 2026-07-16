\echo 'Teste Migration 002_create_users.sql ...'

BEGIN;

DO $$
DECLARE
    seeded_company_id UUID;
    test_user_id UUID;
    version_before BIGINT;
    version_after BIGINT;
BEGIN
    SELECT id
    INTO seeded_company_id
    FROM companies
    WHERE company_number = 'F-000001';

    IF seeded_company_id IS NULL THEN
        RAISE EXCEPTION 'Seed-Firma für Benutzertest fehlt';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_class
        WHERE oid = 'users'::REGCLASS
          AND relrowsecurity
    ) THEN
        RAISE EXCEPTION 'Row Level Security ist für users nicht aktiviert';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'users'
          AND policyname = 'users_tenant_isolation'
    ) THEN
        RAISE EXCEPTION 'Mandanten-Policy users_tenant_isolation fehlt';
    END IF;

    INSERT INTO users (
        company_id,
        personnel_number,
        first_name,
        last_name,
        email,
        password_hash
    )
    VALUES (
        seeded_company_id,
        '  TEST-1001  ',
        '  Erika  ',
        '  Mustermann  ',
        '  TEST.USER@EXAMPLE.INVALID  ',
        'test-only-password-hash'
    )
    RETURNING id, row_version
    INTO test_user_id, version_before;

    IF NOT EXISTS (
        SELECT 1
        FROM users
        WHERE id = test_user_id
          AND personnel_number = 'TEST-1001'
          AND first_name = 'Erika'
          AND last_name = 'Mustermann'
    ) THEN
        RAISE EXCEPTION 'Benutzerdaten wurden nicht normalisiert';
    END IF;

    UPDATE users
    SET phone = '+49 000 000000'
    WHERE id = test_user_id
    RETURNING row_version INTO version_after;

    IF version_after <> version_before + 1 THEN
        RAISE EXCEPTION 'row_version wurde beim Benutzer-Update nicht erhöht';
    END IF;

    BEGIN
        INSERT INTO users (
            company_id,
            personnel_number,
            first_name,
            last_name
        )
        VALUES (
            seeded_company_id,
            'TEST-1001',
            'Doppelt',
            'Vergeben'
        );
        RAISE EXCEPTION USING
            ERRCODE = 'ZX101',
            MESSAGE = 'Doppelte Personalnummer wurde akzeptiert';
    EXCEPTION
        WHEN unique_violation THEN
            NULL;
    END;

    BEGIN
        INSERT INTO users (
            company_id,
            personnel_number,
            first_name,
            last_name,
            email
        )
        VALUES (
            seeded_company_id,
            'TEST-1002',
            'E-Mail',
            'Doppelt',
            'test.user@example.invalid'
        );
        RAISE EXCEPTION USING
            ERRCODE = 'ZX102',
            MESSAGE = 'Doppelte E-Mail wurde akzeptiert';
    EXCEPTION
        WHEN unique_violation THEN
            NULL;
    END;

    UPDATE users
    SET status = 'inactive'
    WHERE id = test_user_id;

    IF NOT EXISTS (
        SELECT 1
        FROM users
        WHERE id = test_user_id
          AND status = 'inactive'
          AND deactivated_at IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'Benutzerdeaktivierung setzt deactivated_at nicht';
    END IF;

    BEGIN
        DELETE FROM users WHERE id = test_user_id;
        RAISE EXCEPTION USING
            ERRCODE = 'ZX103',
            MESSAGE = 'Hartes Löschen eines Benutzers wurde akzeptiert';
    EXCEPTION
        WHEN SQLSTATE 'P0001' THEN
            NULL;
    END;
END;
$$;

ROLLBACK;

\echo 'Migration 002_create_users.sql erfolgreich getestet.'
