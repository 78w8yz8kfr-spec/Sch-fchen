\echo 'Teste Migration 112_release_version_0_44_12.sql ...'

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
    FROM application_versions WHERE version = '0.44.12';
    IF stand IS NULL OR stand NOT IN ('production', 'superseded') THEN
        RAISE EXCEPTION 'Die Fassung 0.44.12 fehlt oder besitzt einen ungültigen Status';
    END IF;
    IF NOT migrationen @> '["111", "112"]'::JSONB THEN
        RAISE EXCEPTION 'Die Fassung 0.44.12 nennt ihre Migrationen nicht vollständig';
    END IF;

    SELECT release_status INTO vorgaenger
    FROM application_versions WHERE version = '0.44.11';
    IF vorgaenger IS DISTINCT FROM 'superseded' THEN
        RAISE EXCEPTION 'Die Vorgängerfassung 0.44.11 wurde nicht korrekt abgelöst';
    END IF;

    -- Nicht verpflichtend: die Fassung verbessert das Lager, sie repariert
    -- nichts, was ohne sie kaputt waere. Ein erzwungenes Update ist dafür
    -- keine angemessene Störung des Arbeitstages.
    IF EXISTS (
        SELECT 1 FROM application_versions
        WHERE version = '0.44.12' AND mandatory_update = TRUE
    ) THEN
        RAISE EXCEPTION 'Die Fassung 0.44.12 ist als Pflichtupdate eingetragen';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM application_versions
        WHERE version = '0.44.12' AND rollout_percent = 100
    ) THEN
        RAISE EXCEPTION 'Die Fassung 0.44.12 ist nicht vollständig ausgerollt';
    END IF;

    -- Genau die zwei: das Gebinde am Artikel und dieser Fassungseintrag. Stünde
    -- hier eine dritte, wäre die Beschreibung falsch und jemand suchte sie
    -- vergeblich.
    IF (SELECT jsonb_array_length(migrationen)) <> 2 THEN
        RAISE EXCEPTION 'Die Fassung 0.44.12 nennt mehr Migrationen, als sie mitbringt';
    END IF;

    -- Die Pruefung auf die Gebindespalte ist mit Migration 141 entfallen: die
    -- Lagerverwaltung wurde abgeschafft, und mit ihr die Tabelle. Der Eintrag
    -- im Fassungsverzeichnis bleibt stehen - er beschreibt, was damals
    -- ausgeliefert wurde, und das aendert sich rueckwirkend nicht.
END;
$$;

\echo 'Migration 112_release_version_0_44_12.sql ist fachlich abgenommen.'
