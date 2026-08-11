\echo 'Teste Migration 124_release_version_0_44_20.sql ...'

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
    FROM application_versions WHERE version = '0.44.20';
    IF stand IS NULL OR stand NOT IN ('production', 'superseded') THEN
        RAISE EXCEPTION 'Die Fassung 0.44.20 fehlt oder besitzt einen ungültigen Status';
    END IF;
    IF NOT (migrationen @> '["123"]'::JSONB AND migrationen @> '["124"]'::JSONB) THEN
        RAISE EXCEPTION 'Die Fassung 0.44.20 nennt ihre Migrationen nicht vollständig';
    END IF;

    SELECT release_status INTO vorgaenger
    FROM application_versions WHERE version = '0.44.19';
    IF vorgaenger IS DISTINCT FROM 'superseded' THEN
        RAISE EXCEPTION 'Die Vorgängerfassung 0.44.19 wurde nicht korrekt abgelöst';
    END IF;

    -- Nicht verpflichtend: wer die alte Fassung hat, sieht keine
    -- Reservierungen. Die Sperre greift trotzdem, weil sie im Server sitzt.
    IF EXISTS (
        SELECT 1 FROM application_versions
        WHERE version = '0.44.20' AND mandatory_update = TRUE
    ) THEN
        RAISE EXCEPTION 'Die Fassung 0.44.20 ist als Pflichtupdate eingetragen';
    END IF;
END;
$$;

\echo 'Migration 124_release_version_0_44_20.sql ist fachlich abgenommen.'
