\echo 'Teste Migration 099_release_version_0_44_3.sql ...'

DO $$
DECLARE
    production_count INTEGER;
    release_state VARCHAR(30);
    previous_state VARCHAR(30);
    migrations JSONB;
BEGIN
    SELECT COUNT(*) INTO production_count
    FROM application_versions
    WHERE release_status = 'production';
    IF production_count <> 1 THEN
        RAISE EXCEPTION 'Es muss genau eine Produktionsfassung geben, gefunden: %', production_count;
    END IF;

    SELECT release_status, database_migrations
      INTO release_state, migrations
    FROM application_versions WHERE version = '0.44.3';
    IF release_state IS NULL OR release_state NOT IN ('production', 'superseded') THEN
        RAISE EXCEPTION 'Die Fassung 0.44.3 fehlt oder besitzt einen ungültigen Status';
    END IF;
    IF NOT migrations @> '["099"]'::JSONB THEN
        RAISE EXCEPTION 'Die Fassung 0.44.3 nennt Migration 099 nicht';
    END IF;

    SELECT release_status INTO previous_state
    FROM application_versions WHERE version = '0.44.2';
    IF previous_state IS DISTINCT FROM 'superseded' THEN
        RAISE EXCEPTION 'Die Vorgängerfassung 0.44.2 wurde nicht korrekt abgelöst';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM application_versions
        WHERE version = '0.44.3' AND rollout_percent = 100
          AND mandatory_update = FALSE
    ) THEN
        RAISE EXCEPTION 'Fassung 0.44.3 ist nicht vollständig und freiwillig ausgerollt';
    END IF;
END;
$$;

\echo 'Migration 099_release_version_0_44_3.sql ist fachlich abgenommen.'
