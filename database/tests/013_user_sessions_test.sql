\echo 'Teste Migration 013_create_user_sessions.sql ...'

BEGIN;

DO $$
DECLARE
    tenant_id UUID;
    account_id UUID;
    active_session_id UUID;
    revoked_session_id UUID;
BEGIN
    SELECT id INTO tenant_id
    FROM companies
    WHERE company_number = 'F-000001';

    INSERT INTO users (
        company_id, personnel_number, first_name, last_name,
        password_hash, must_change_password
    ) VALUES (
        tenant_id, 'SESSION-1', 'Sitzung', 'Test',
        'scrypt$16384$8$1$dGVzdHNhbHQ$ZHVtbXloYXNo', FALSE
    ) RETURNING id INTO account_id;

    INSERT INTO user_sessions (
        company_id, user_id, token_hash, expires_at
    ) VALUES (
        tenant_id,
        account_id,
        REPEAT('a', 64),
        CURRENT_TIMESTAMP + INTERVAL '8 hours'
    ) RETURNING id INTO active_session_id;

    INSERT INTO user_sessions (
        company_id, user_id, token_hash, expires_at,
        revoked_at, revocation_reason
    ) VALUES (
        tenant_id,
        account_id,
        REPEAT('b', 64),
        CURRENT_TIMESTAMP + INTERVAL '8 hours',
        CURRENT_TIMESTAMP,
        'Test-Widerruf'
    ) RETURNING id INTO revoked_session_id;

    BEGIN
        UPDATE user_sessions
        SET token_hash = REPEAT('c', 64)
        WHERE id = active_session_id;
        RAISE EXCEPTION USING ERRCODE = 'ZXD01', MESSAGE = 'Sitzungstoken wurde nachträglich verändert';
    EXCEPTION
        WHEN SQLSTATE 'P0001' THEN NULL;
    END;

    BEGIN
        UPDATE user_sessions
        SET revoked_at = NULL, revocation_reason = NULL
        WHERE id = revoked_session_id;
        RAISE EXCEPTION USING ERRCODE = 'ZXD02', MESSAGE = 'Widerrufene Sitzung wurde reaktiviert';
    EXCEPTION
        WHEN SQLSTATE 'P0001' THEN NULL;
    END;

    BEGIN
        DELETE FROM user_sessions WHERE id = active_session_id;
        RAISE EXCEPTION USING ERRCODE = 'ZXD03', MESSAGE = 'Hartes Löschen wurde akzeptiert';
    EXCEPTION
        WHEN SQLSTATE 'P0001' THEN NULL;
    END;
END;
$$;

SET LOCAL ROLE schaefchen_api;

DO $$
DECLARE
    resolved_company_id UUID;
    resolved_user_id UUID;
    looked_up_user_id UUID;
BEGIN
    IF EXISTS (SELECT 1 FROM user_sessions) THEN
        RAISE EXCEPTION 'API-Rolle sieht Sitzungen ohne aufgelösten Mandanten';
    END IF;

    SELECT company_id, user_id
    INTO resolved_company_id, resolved_user_id
    FROM api_resolve_session(REPEAT('a', 64)::CHAR(64));

    IF resolved_company_id IS NULL OR resolved_user_id IS NULL THEN
        RAISE EXCEPTION 'Gültige Sitzung wurde nicht aufgelöst';
    END IF;

    IF EXISTS (
        SELECT 1 FROM api_resolve_session(REPEAT('b', 64)::CHAR(64))
    ) THEN
        RAISE EXCEPTION 'Widerrufene Sitzung wurde als gültig aufgelöst';
    END IF;

    SELECT user_id INTO looked_up_user_id
    FROM api_lookup_login_user('F-000001', 'SESSION-1');

    IF looked_up_user_id IS DISTINCT FROM resolved_user_id THEN
        RAISE EXCEPTION 'Login-Suche hat einen falschen Benutzer geliefert';
    END IF;

    PERFORM set_config('app.current_company_id', resolved_company_id::TEXT, TRUE);

    IF (SELECT COUNT(*) FROM user_sessions) <> 2 THEN
        RAISE EXCEPTION 'API-Rolle sieht nicht alle Sitzungen des eigenen Mandanten';
    END IF;
END;
$$;

RESET ROLE;
ROLLBACK;

\echo 'Migration 013_create_user_sessions.sql erfolgreich getestet.'
