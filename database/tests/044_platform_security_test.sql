\echo 'Teste Migration 044_finalize_platform_security.sql ...'

BEGIN;

DO $$
DECLARE
    target_company_id UUID;
    target_user_id UUID;
    login_count INTEGER;
    foreign_company_id UUID;
    announcement_author_id UUID;
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

    UPDATE companies SET status = 'active' WHERE id = target_company_id;

    INSERT INTO companies (legal_name, display_name)
    VALUES ('Mitteilungs Zweitfirma GmbH', 'Mitteilungs Zweitfirma')
    RETURNING id INTO foreign_company_id;

    INSERT INTO platform_users (first_name, last_name, email, password_hash)
    VALUES ('Mitteilungs', 'Verfasser', 'mitteilung-044@example.invalid', 'test-hash')
    RETURNING id INTO announcement_author_id;

    INSERT INTO platform_announcements (
        title, message, announcement_type, status, targets,
        publish_at, created_by_platform_user_id
    ) VALUES
        ('Mitteilung an alle', 'Gilt für jede Firma', 'update', 'published',
         '{"scope":"all"}'::JSONB, CURRENT_TIMESTAMP - INTERVAL '1 hour', announcement_author_id),
        ('Mitteilung nur an Firma B', 'Darf Firma A nicht erreichen', 'update', 'published',
         jsonb_build_object('scope', 'companies', 'values', jsonb_build_array(foreign_company_id::TEXT)),
         CURRENT_TIMESTAMP - INTERVAL '1 hour', announcement_author_id),
        ('Unveröffentlichter Entwurf', 'Darf niemanden erreichen', 'update', 'draft',
         '{"scope":"all"}'::JSONB, NULL, announcement_author_id);
END;
$$;

SELECT id AS tenant_a_id
FROM companies
WHERE company_number = 'F-000001'
\gset

SET LOCAL ROLE schaefchen_api;
SELECT set_config('app.current_company_id', :'tenant_a_id', TRUE);

DO $$
DECLARE
    visible_titles TEXT[];
BEGIN
    SELECT COALESCE(ARRAY_AGG(title ORDER BY title), ARRAY[]::TEXT[])
    INTO visible_titles
    FROM platform_announcements;

    IF NOT ('Mitteilung an alle' = ANY (visible_titles)) THEN
        RAISE EXCEPTION 'Firmenrolle sieht die an alle gerichtete Mitteilung nicht';
    END IF;

    IF 'Mitteilung nur an Firma B' = ANY (visible_titles) THEN
        RAISE EXCEPTION 'Firmenrolle sieht eine an eine fremde Firma gerichtete Mitteilung';
    END IF;

    IF 'Unveröffentlichter Entwurf' = ANY (visible_titles) THEN
        RAISE EXCEPTION 'Firmenrolle sieht einen unveröffentlichten Mitteilungsentwurf';
    END IF;

    BEGIN
        PERFORM COUNT(*) FROM platform_users;
        RAISE EXCEPTION USING
            ERRCODE = 'ZX441',
            MESSAGE = 'Firmenrolle kann Plattformkonten lesen';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;
END;
$$;

RESET ROLE;
ROLLBACK;

\echo 'Migration 044_finalize_platform_security.sql erfolgreich getestet.'
