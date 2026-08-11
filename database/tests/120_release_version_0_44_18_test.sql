\echo 'Teste Migration 120_release_version_0_44_18.sql ...'

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
    FROM application_versions WHERE version = '0.44.18';
    IF stand IS NULL OR stand NOT IN ('production', 'superseded') THEN
        RAISE EXCEPTION 'Die Fassung 0.44.18 fehlt oder besitzt einen ungültigen Status';
    END IF;
    IF NOT (migrationen @> '["119"]'::JSONB AND migrationen @> '["120"]'::JSONB) THEN
        RAISE EXCEPTION 'Die Fassung 0.44.18 nennt ihre Migrationen nicht vollständig';
    END IF;
    IF (SELECT jsonb_array_length(migrationen)) <> 2 THEN
        RAISE EXCEPTION 'Die Fassung 0.44.18 nennt mehr Migrationen, als sie mitbringt';
    END IF;

    SELECT release_status INTO vorgaenger
    FROM application_versions WHERE version = '0.44.17';
    IF vorgaenger IS DISTINCT FROM 'superseded' THEN
        RAISE EXCEPTION 'Die Vorgängerfassung 0.44.17 wurde nicht korrekt abgelöst';
    END IF;

    -- Nicht verpflichtend: wer die alte Fassung hat, sieht die neue
    -- Buchungsart nicht und bucht wie bisher. Falsch wird davon nichts.
    IF EXISTS (
        SELECT 1 FROM application_versions
        WHERE version = '0.44.18' AND mandatory_update = TRUE
    ) THEN
        RAISE EXCEPTION 'Die Fassung 0.44.18 ist als Pflichtupdate eingetragen';
    END IF;
END;
$$;

\echo 'Migration 120_release_version_0_44_18.sql ist fachlich abgenommen.'
