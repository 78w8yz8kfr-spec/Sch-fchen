\echo 'Teste Migration 107_release_version_0_44_11.sql ...'

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
    FROM application_versions WHERE version = '0.44.11';
    IF release_state IS NULL OR release_state NOT IN ('production', 'superseded') THEN
        RAISE EXCEPTION 'Die Fassung 0.44.11 fehlt oder besitzt einen ungültigen Status';
    END IF;
    IF NOT migrations @> '["107"]'::JSONB THEN
        RAISE EXCEPTION 'Die Fassung 0.44.11 nennt Migration 107 nicht';
    END IF;

    SELECT release_status INTO previous_state
    FROM application_versions WHERE version = '0.44.10';
    IF previous_state IS DISTINCT FROM 'superseded' THEN
        RAISE EXCEPTION 'Die Vorgängerfassung 0.44.10 wurde nicht korrekt abgelöst';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM application_versions
        WHERE version = '0.44.11' AND rollout_percent = 100
    ) THEN
        RAISE EXCEPTION 'Fassung 0.44.11 ist nicht vollständig ausgerollt';
    END IF;

    -- Die Spalten, auf die sich diese Fassung stützt, gibt es seit den
    -- Migrationen 056 und 060. Ohne sie hätte der neue Weg im Personalbogen
    -- kein Ziel.
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'apprenticeship_occupation'
    ) OR NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'apprenticeship_started_on'
    ) THEN
        RAISE EXCEPTION 'Die Ausbildungsangaben fehlen an der Mitarbeitertabelle';
    END IF;
END;
$$;

\echo 'Migration 107_release_version_0_44_11.sql ist fachlich abgenommen.'
