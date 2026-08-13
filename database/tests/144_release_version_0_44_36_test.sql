\echo 'Teste Migration 144_release_version_0_44_36.sql ...'

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
    FROM application_versions WHERE version = '0.44.36';
    IF stand IS NULL OR stand NOT IN ('production', 'superseded') THEN
        RAISE EXCEPTION 'Die Fassung 0.44.36 fehlt oder besitzt einen ungültigen Status';
    END IF;

    SELECT release_status INTO vorgaenger
    FROM application_versions WHERE version = '0.44.35';
    IF vorgaenger IS DISTINCT FROM 'superseded' THEN
        RAISE EXCEPTION 'Die Vorgängerfassung 0.44.35 wurde nicht korrekt abgelöst';
    END IF;

    -- Die fehlende Offline-Erfassung steht als bekannte Einschränkung dabei:
    -- der Verteiler steht im Keller eines Rohbaus, und dort ist oft kein Netz.
    -- Wer die Fassung ausrollt, soll das wissen, bevor es der Monteur meldet.
    IF NOT EXISTS (
        SELECT 1 FROM application_versions
        WHERE version = '0.44.36' AND jsonb_array_length(known_issues) = 1
    ) THEN
        RAISE EXCEPTION 'Die bekannte Einschränkung der Offline-Erfassung fehlt';
    END IF;

    -- Diese Fassung nimmt nichts weg und aendert nichts an vorhandenen Daten.
    -- Ein Pflicht-Update waere hier nur eine erzwungene Unterbrechung.
    IF EXISTS (
        SELECT 1 FROM application_versions
        WHERE version = '0.44.36' AND mandatory_update = TRUE
    ) THEN
        RAISE EXCEPTION 'Eine rein additive Fassung darf kein Pflicht-Update sein';
    END IF;
END;
$$;

\echo 'Migration 144_release_version_0_44_36.sql ist fachlich abgenommen.'
