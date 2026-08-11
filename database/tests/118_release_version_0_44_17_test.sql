\echo 'Teste Migration 118_release_version_0_44_17.sql ...'

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
    FROM application_versions WHERE version = '0.44.17';
    IF stand IS NULL OR stand NOT IN ('production', 'superseded') THEN
        RAISE EXCEPTION 'Die Fassung 0.44.17 fehlt oder besitzt einen ungültigen Status';
    END IF;

    -- Diese Fassung bringt zwei Migrationen mit: die Spalte und den
    -- Fassungseintrag. Beide müssen genannt sein, sonst fehlt beim
    -- Zurückrollen die Spur zur Spalte.
    IF NOT (migrationen @> '["117"]'::JSONB AND migrationen @> '["118"]'::JSONB) THEN
        RAISE EXCEPTION 'Die Fassung 0.44.17 nennt ihre Migrationen nicht vollständig';
    END IF;
    IF (SELECT jsonb_array_length(migrationen)) <> 2 THEN
        RAISE EXCEPTION 'Die Fassung 0.44.17 nennt mehr Migrationen, als sie mitbringt';
    END IF;

    SELECT release_status INTO vorgaenger
    FROM application_versions WHERE version = '0.44.16';
    IF vorgaenger IS DISTINCT FROM 'superseded' THEN
        RAISE EXCEPTION 'Die Vorgängerfassung 0.44.16 wurde nicht korrekt abgelöst';
    END IF;

    -- Nicht verpflichtend: wer noch die alte Fassung hat, führt die
    -- Materialliste wie bisher als Freitext. Kaputt ist daran nichts.
    IF EXISTS (
        SELECT 1 FROM application_versions
        WHERE version = '0.44.17' AND mandatory_update = TRUE
    ) THEN
        RAISE EXCEPTION 'Die Fassung 0.44.17 ist als Pflichtupdate eingetragen';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM application_versions
        WHERE version = '0.44.17' AND rollout_percent = 100
    ) THEN
        RAISE EXCEPTION 'Die Fassung 0.44.17 ist nicht vollständig ausgerollt';
    END IF;
END;
$$;

\echo 'Migration 118_release_version_0_44_17.sql ist fachlich abgenommen.'
