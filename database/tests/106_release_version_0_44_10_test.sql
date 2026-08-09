\echo 'Teste Migration 106_release_version_0_44_10.sql ...'

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
    FROM application_versions WHERE version = '0.44.10';
    IF release_state IS NULL OR release_state NOT IN ('production', 'superseded') THEN
        RAISE EXCEPTION 'Die Fassung 0.44.10 fehlt oder besitzt einen ungültigen Status';
    END IF;
    IF NOT migrations @> '["106"]'::JSONB THEN
        RAISE EXCEPTION 'Die Fassung 0.44.10 nennt Migration 106 nicht';
    END IF;

    SELECT release_status INTO previous_state
    FROM application_versions WHERE version = '0.44.9';
    IF previous_state IS DISTINCT FROM 'superseded' THEN
        RAISE EXCEPTION 'Die Vorgängerfassung 0.44.9 wurde nicht korrekt abgelöst';
    END IF;

    -- Eine eingerichtete App haelt Stylesheet und Oberflaeche im Speicher des
    -- Dienst-Workers fest. Ohne verpflichtendes Update saehe der Auszubildende
    -- die Korrektur an genau dem Geraet nicht, an dem er sie braucht.
    IF NOT EXISTS (
        SELECT 1 FROM application_versions
        WHERE version = '0.44.10'
          AND rollout_percent = 100
          AND mandatory_update = TRUE
    ) THEN
        RAISE EXCEPTION 'Fassung 0.44.10 ist nicht vollständig als notwendige Reparatur ausgerollt';
    END IF;
END;
$$;

\echo 'Migration 106_release_version_0_44_10.sql ist fachlich abgenommen.'
