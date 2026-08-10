\echo 'Teste Migration 110_release_version_0_44_11.sql ...'

DO $$
DECLARE
    produktionsstaende INTEGER;
    stand VARCHAR(30);
    vorgaenger VARCHAR(30);
    migrationen JSONB;
BEGIN
    SELECT COUNT(*) INTO produktionsstaende
    FROM application_versions
    WHERE release_status = 'production';
    IF produktionsstaende <> 1 THEN
        RAISE EXCEPTION 'Es muss genau eine Produktionsfassung geben, gefunden: %', produktionsstaende;
    END IF;

    SELECT release_status, database_migrations
      INTO stand, migrationen
    FROM application_versions WHERE version = '0.44.11';
    IF stand IS NULL OR stand NOT IN ('production', 'superseded') THEN
        RAISE EXCEPTION 'Die Fassung 0.44.11 fehlt oder besitzt einen ungültigen Status';
    END IF;

    -- Die Fassung liefert die Lagerverwaltung aus. Nennt sie deren Migrationen
    -- nicht, laesst sich spaeter nicht mehr feststellen, mit welchem Stand ein
    -- Betrieb das Lager bekommen hat.
    IF NOT migrationen @> '["107", "108", "109", "110"]'::JSONB THEN
        RAISE EXCEPTION 'Die Fassung 0.44.11 nennt die Lagermigrationen nicht vollständig';
    END IF;

    SELECT release_status INTO vorgaenger
    FROM application_versions WHERE version = '0.44.10';
    IF vorgaenger IS DISTINCT FROM 'superseded' THEN
        RAISE EXCEPTION 'Die Vorgängerfassung 0.44.10 wurde nicht korrekt abgelöst';
    END IF;

    -- Nicht verpflichtend: wer die Freigabe fuer das Lager nicht hat, merkt
    -- von dieser Fassung nichts. Ein erzwungenes Update waere eine Zumutung
    -- ohne Gegenwert.
    IF EXISTS (
        SELECT 1 FROM application_versions
        WHERE version = '0.44.11' AND mandatory_update = TRUE
    ) THEN
        RAISE EXCEPTION 'Die Fassung 0.44.11 ist als Pflichtupdate eingetragen';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM application_versions
        WHERE version = '0.44.11' AND rollout_percent = 100
    ) THEN
        RAISE EXCEPTION 'Die Fassung 0.44.11 ist nicht vollständig ausgerollt';
    END IF;
END;
$$;

\echo 'Migration 110_release_version_0_44_11.sql ist fachlich abgenommen.'
