\echo 'Teste Migration 150_release_version_0_45_0.sql ...'

DO $$
DECLARE
    production_count INTEGER;
    release RECORD;
BEGIN
    SELECT COUNT(*) INTO production_count
    FROM application_versions WHERE release_status = 'production';
    IF production_count <> 1 THEN
        RAISE EXCEPTION 'Es muss genau eine Produktionsfassung geben, gefunden: %', production_count;
    END IF;

    SELECT release_status, database_migrations, known_issues INTO release
    FROM application_versions WHERE version = '0.45.0';
    IF release.release_status IS DISTINCT FROM 'production' THEN
        RAISE EXCEPTION 'Die Fassung 0.45.0 ist nicht als Produktionsstand eingetragen';
    END IF;
    IF NOT release.database_migrations @> '["149","150"]'::JSONB THEN
        RAISE EXCEPTION 'Die Sicherheitsmigrationen fehlen im Versionsverzeichnis';
    END IF;
    IF jsonb_array_length(release.known_issues) < 2 THEN
        RAISE EXCEPTION 'Externe Produktionsgates werden nicht transparent ausgewiesen';
    END IF;
END;
$$;

\echo 'Migration 150_release_version_0_45_0.sql ist fachlich abgenommen.'
