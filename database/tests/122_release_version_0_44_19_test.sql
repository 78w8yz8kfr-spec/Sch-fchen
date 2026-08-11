\echo 'Teste Migration 122_release_version_0_44_19.sql ...'

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
    FROM application_versions WHERE version = '0.44.19';
    IF stand IS NULL OR stand NOT IN ('production', 'superseded') THEN
        RAISE EXCEPTION 'Die Fassung 0.44.19 fehlt oder besitzt einen ungültigen Status';
    END IF;
    IF NOT (migrationen @> '["121"]'::JSONB AND migrationen @> '["122"]'::JSONB) THEN
        RAISE EXCEPTION 'Die Fassung 0.44.19 nennt ihre Migrationen nicht vollständig';
    END IF;

    SELECT release_status INTO vorgaenger
    FROM application_versions WHERE version = '0.44.18';
    IF vorgaenger IS DISTINCT FROM 'superseded' THEN
        RAISE EXCEPTION 'Die Vorgängerfassung 0.44.18 wurde nicht korrekt abgelöst';
    END IF;

    -- Nicht verpflichtend: wer die alte Fassung hat, bucht Wareneingänge wie
    -- bisher über die Bestellung. Falsch wird davon nichts.
    IF EXISTS (
        SELECT 1 FROM application_versions
        WHERE version = '0.44.19' AND mandatory_update = TRUE
    ) THEN
        RAISE EXCEPTION 'Die Fassung 0.44.19 ist als Pflichtupdate eingetragen';
    END IF;
END;
$$;

\echo 'Migration 122_release_version_0_44_19.sql ist fachlich abgenommen.'
