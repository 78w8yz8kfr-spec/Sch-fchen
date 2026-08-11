\echo 'Teste Migration 130_release_version_0_44_24.sql ...'

DO $$
DECLARE
    produktionsstaende INTEGER;
    stand VARCHAR(30);
    vorgaenger VARCHAR(30);
    migrationen JSONB;
BEGIN
    SELECT COUNT(*) INTO produktionsstaende
    FROM application_versions WHERE release_status = 'production';
    IF produktionsstaende <> 1 THEN
        RAISE EXCEPTION 'Es muss genau eine Produktionsfassung geben, gefunden: %', produktionsstaende;
    END IF;

    SELECT release_status, database_migrations INTO stand, migrationen
    FROM application_versions WHERE version = '0.44.24';
    IF stand IS NULL OR stand NOT IN ('production', 'superseded') THEN
        RAISE EXCEPTION 'Die Fassung 0.44.24 fehlt oder besitzt einen ungültigen Status';
    END IF;
    IF NOT (migrationen @> '["129"]'::JSONB AND migrationen @> '["130"]'::JSONB) THEN
        RAISE EXCEPTION 'Die Fassung 0.44.24 nennt ihre Migrationen nicht vollständig';
    END IF;

    SELECT release_status INTO vorgaenger
    FROM application_versions WHERE version = '0.44.23';
    IF vorgaenger IS DISTINCT FROM 'superseded' THEN
        RAISE EXCEPTION 'Die Vorgängerfassung 0.44.23 wurde nicht korrekt abgelöst';
    END IF;

    IF EXISTS (
        SELECT 1 FROM application_versions
        WHERE version = '0.44.24' AND mandatory_update = TRUE
    ) THEN
        RAISE EXCEPTION 'Die Fassung 0.44.24 ist als Pflichtupdate eingetragen';
    END IF;
END;
$$;

\echo 'Migration 130_release_version_0_44_24.sql ist fachlich abgenommen.'
