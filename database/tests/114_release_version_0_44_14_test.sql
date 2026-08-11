\echo 'Teste Migration 114_release_version_0_44_14.sql ...'

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
    FROM application_versions WHERE version = '0.44.14';
    IF stand IS NULL OR stand NOT IN ('production', 'superseded') THEN
        RAISE EXCEPTION 'Die Fassung 0.44.14 fehlt oder besitzt einen ungültigen Status';
    END IF;
    IF NOT migrationen @> '["114"]'::JSONB THEN
        RAISE EXCEPTION 'Die Fassung 0.44.14 nennt Migration 114 nicht';
    END IF;

    SELECT release_status INTO vorgaenger
    FROM application_versions WHERE version = '0.44.13';
    IF vorgaenger IS DISTINCT FROM 'superseded' THEN
        RAISE EXCEPTION 'Die Vorgängerfassung 0.44.13 wurde nicht korrekt abgelöst';
    END IF;

    -- Nicht verpflichtend: wer noch die alte Fassung hat, druckt das höhere
    -- Etikett. Beide tragen denselben Code, beide bleiben gültig.
    IF EXISTS (
        SELECT 1 FROM application_versions
        WHERE version = '0.44.14' AND mandatory_update = TRUE
    ) THEN
        RAISE EXCEPTION 'Die Fassung 0.44.14 ist als Pflichtupdate eingetragen';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM application_versions
        WHERE version = '0.44.14' AND rollout_percent = 100
    ) THEN
        RAISE EXCEPTION 'Die Fassung 0.44.14 ist nicht vollständig ausgerollt';
    END IF;

    -- Nur der Fassungseintrag: der Etikettenaufbau steht im Browser, nicht in
    -- der Datenbank.
    IF (SELECT jsonb_array_length(migrationen)) <> 1 THEN
        RAISE EXCEPTION 'Die Fassung 0.44.14 nennt mehr Migrationen, als sie mitbringt';
    END IF;
END;
$$;

\echo 'Migration 114_release_version_0_44_14.sql ist fachlich abgenommen.'
