\echo 'Teste Migration 044_finalize_platform_security.sql ...'

BEGIN;

DO $$
DECLARE
    target_company_id UUID;
    target_user_id UUID;
    login_count INTEGER;
BEGIN
    SELECT id INTO target_company_id
    FROM companies WHERE company_number = 'F-000001';
    INSERT INTO users (
        company_id,personnel_number,first_name,last_name,password_hash
    ) VALUES (
        target_company_id,'LOGIN-044','Login','Sperre','test-hash'
    ) RETURNING id INTO target_user_id;

    FOR login_count IN 1..10 LOOP
        PERFORM api_record_login_failure(target_company_id,target_user_id);
    END LOOP;
    IF NOT EXISTS (
        SELECT 1 FROM users
        WHERE id = target_user_id
          AND failed_login_attempts = 10
          AND locked_until > CURRENT_TIMESTAMP
    ) OR EXISTS (
        SELECT 1 FROM api_lookup_login_user('F-000001','LOGIN-044')
    ) THEN
        RAISE EXCEPTION 'Firmenkonto wurde nach wiederholten Fehlversuchen nicht wirksam gesperrt';
    END IF;

    PERFORM api_record_login_success(target_company_id,target_user_id);
    IF NOT EXISTS (
        SELECT 1 FROM users
        WHERE id = target_user_id
          AND failed_login_attempts = 0
          AND locked_until IS NULL
          AND last_login_at IS NOT NULL
    ) OR NOT EXISTS (
        SELECT 1 FROM api_lookup_login_user('F-000001','LOGIN-044')
    ) THEN
        RAISE EXCEPTION 'Erfolgreicher Login hat Sperrzustand nicht zurückgesetzt';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'user_roles' AND policyname = 'user_roles_platform_write'
    ) OR NOT has_table_privilege('schaefchen_platform_api','user_roles','INSERT') THEN
        RAISE EXCEPTION 'Plattformregistrierung kann die erste Firmenrolle nicht kontrolliert anlegen';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'user_sessions'
          AND column_name = 'app_version'
    ) OR NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'platform_sessions'
          AND column_name = 'app_version'
    ) THEN
        RAISE EXCEPTION 'App-Versionen werden nicht für Firmen- und Plattformsitzungen erfasst';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'platform_announcements'
          AND policyname = 'announcements_tenant_read'
          AND qual LIKE '%company_roles%'
          AND qual LIKE '%company_module_entitlements%'
    ) THEN
        RAISE EXCEPTION 'Mitteilungsempfänger sind nicht vollständig per RLS eingeschränkt';
    END IF;

    UPDATE companies SET status = 'suspended' WHERE id = target_company_id;
    IF EXISTS (
        SELECT 1 FROM api_lookup_login_user('F-000001','LOGIN-044')
    ) THEN
        RAISE EXCEPTION 'Gesperrte Firmen können sich weiterhin anmelden';
    END IF;

    IF (SELECT COUNT(*) FROM application_versions WHERE release_status = 'production') <> 1
       OR NOT EXISTS (
            SELECT 1 FROM application_versions
            WHERE version = '0.42.0' AND release_status = 'production'
              AND database_migrations = '["039", "040", "041", "042", "043", "044"]'::JSONB
       )
       OR EXISTS (
            SELECT 1 FROM application_versions
            WHERE version = '0.41.0' AND release_status = 'production'
       ) THEN
        RAISE EXCEPTION 'Produktionsversion oder Migrationsstand ist nicht eindeutig';
    END IF;

    UPDATE application_versions
    SET mandatory_update = TRUE
    WHERE version = '0.42.0';
    IF NOT EXISTS (
        SELECT 1 FROM application_versions
        WHERE version = '0.42.0' AND mandatory_update
    ) THEN
        RAISE EXCEPTION 'Dynamische Pflichtupdate-Entscheidung konnte nicht gespeichert werden';
    END IF;
END;
$$;

ROLLBACK;

\echo 'Migration 044_finalize_platform_security.sql erfolgreich getestet.'
