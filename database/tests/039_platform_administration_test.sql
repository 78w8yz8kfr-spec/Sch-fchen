\echo 'Teste Migration 039_create_platform_administration.sql ...'

BEGIN;

DO $$
DECLARE
    test_platform_user_id UUID;
    test_platform_session_id UUID;
    test_audit_id UUID;
BEGIN
    INSERT INTO platform_users (first_name, last_name, email, password_hash)
    VALUES ('Sina', 'System', 'sql-platform-039@example.test', 'test-hash')
    RETURNING id INTO test_platform_user_id;

    INSERT INTO platform_user_roles (platform_user_id, platform_role_id, reason)
    SELECT test_platform_user_id, id, 'SQL-Abnahme Migration 039'
    FROM platform_roles WHERE role_key = 'superadmin';

    IF EXISTS (SELECT 1 FROM users WHERE id = test_platform_user_id)
       OR NOT EXISTS (
            SELECT 1
            FROM platform_user_roles AS assignment
            JOIN platform_roles AS role ON role.id = assignment.platform_role_id
            WHERE assignment.platform_user_id = test_platform_user_id
              AND role.role_key = 'superadmin'
              AND role.permissions ? '*'
       ) THEN
        RAISE EXCEPTION 'Plattformkonto und Firmenmitarbeiter sind nicht sauber getrennt';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM platform_roles
        WHERE role_key = 'support'
          AND permissions ? 'support.access'
          AND permissions ? 'accounts.unlock'
          AND NOT permissions ? 'plans.manage'
    ) OR NOT EXISTS (
        SELECT 1 FROM platform_roles
        WHERE role_key = 'technical'
          AND permissions ? 'errors.manage'
          AND permissions ? 'backups.manage'
          AND NOT permissions ? 'contracts.manage'
    ) OR NOT EXISTS (
        SELECT 1 FROM platform_roles
        WHERE role_key = 'privacy'
          AND permissions ? 'privacy.manage'
          AND permissions ? 'audit.read'
          AND NOT permissions ? 'plans.manage'
    ) THEN
        RAISE EXCEPTION 'Plattformrollen trennen Support, Technik, Datenschutz und Preise nicht granular';
    END IF;

    INSERT INTO platform_sessions (
        platform_user_id, token_hash, authentication_method, expires_at
    ) VALUES (
        test_platform_user_id, repeat('a', 64), 'setup', CURRENT_TIMESTAMP + INTERVAL '1 hour'
    ) RETURNING id INTO test_platform_session_id;

    PERFORM set_config('app.current_platform_user_id', test_platform_user_id::TEXT, TRUE);
    INSERT INTO platform_audit_log (
        platform_user_id, platform_session_id, action, target_type, target_id,
        new_state, reason, session_identifier
    ) VALUES (
        test_platform_user_id, test_platform_session_id, 'sql.test', 'platform_user',
        test_platform_user_id::TEXT, jsonb_build_object('status', 'active'),
        'SQL-Abnahme Migration 039', test_platform_session_id::TEXT
    ) RETURNING id INTO test_audit_id;

    BEGIN
        UPDATE platform_audit_log SET reason = 'unzulässig' WHERE id = test_audit_id;
        RAISE EXCEPTION 'Audit-Eintrag konnte verändert werden';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'Audit-Eintrag konnte verändert werden' THEN RAISE; END IF;
    END;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'companies' AND policyname = 'companies_platform_access'
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'platform_audit_log' AND policyname = 'platform_audit_platform_access'
    ) THEN
        RAISE EXCEPTION 'Plattform- oder Firmen-RLS fehlt';
    END IF;
END;
$$;

ROLLBACK;

\echo 'Migration 039_create_platform_administration.sql erfolgreich getestet.'
