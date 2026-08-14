\echo 'Teste Migration 148_release_version_0_44_39.sql ...'

DO $$
DECLARE
    produktionsstaende INTEGER;
    stand VARCHAR(30);
    vorgaenger VARCHAR(30);
BEGIN
    SELECT COUNT(*) INTO produktionsstaende
    FROM application_versions WHERE release_status = 'production';
    IF produktionsstaende <> 1 THEN
        RAISE EXCEPTION 'Es muss genau eine Produktionsfassung geben, gefunden: %', produktionsstaende;
    END IF;

    SELECT release_status INTO stand
    FROM application_versions WHERE version = '0.44.39';
    IF stand IS NULL OR stand NOT IN ('production', 'superseded') THEN
        RAISE EXCEPTION 'Die Fassung 0.44.39 fehlt oder besitzt einen ungültigen Status';
    END IF;

    SELECT release_status INTO vorgaenger
    FROM application_versions WHERE version = '0.44.38';
    IF vorgaenger IS DISTINCT FROM 'superseded' THEN
        RAISE EXCEPTION 'Die Vorgängerfassung 0.44.38 wurde nicht korrekt abgelöst';
    END IF;

    -- Die vier Fassungen, die im Betrieb nie ankamen, stehen weiterhin im
    -- Verzeichnis. Sie sind ausgeliefert worden, nur eben alle zusammen: wer
    -- später nachsieht, warum zwischen 0.44.34 und 0.44.39 kein Tag lag,
    -- findet ihre Einträge und diesen hier daneben.
    IF (
        SELECT COUNT(*) FROM application_versions
        WHERE version IN ('0.44.35', '0.44.36', '0.44.37', '0.44.38')
    ) <> 4 THEN
        RAISE EXCEPTION 'Die aufgestauten Fassungen fehlen im Verzeichnis';
    END IF;
END;
$$;

\echo 'Migration 148_release_version_0_44_39.sql ist fachlich abgenommen.'
