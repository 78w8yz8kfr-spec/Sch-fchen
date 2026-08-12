\echo 'Teste Migration 138_release_version_0_44_32.sql ...'

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
    FROM application_versions WHERE version = '0.44.32';
    IF stand IS NULL OR stand NOT IN ('production', 'superseded') THEN
        RAISE EXCEPTION 'Die Fassung 0.44.32 fehlt oder besitzt einen ungültigen Status';
    END IF;

    SELECT release_status INTO vorgaenger
    FROM application_versions WHERE version = '0.44.31';
    IF vorgaenger IS DISTINCT FROM 'superseded' THEN
        RAISE EXCEPTION 'Die Vorgängerfassung 0.44.31 wurde nicht korrekt abgelöst';
    END IF;

    -- Der Rückfall ohne Bildwerkzeug steht als bekannte Einschränkung dabei
    -- und nicht nur im Quelltext: wer die Fassung ausrollt, soll wissen, dass
    -- ein fehlendes ImageMagick die Erkennung langsam, aber nicht kaputt macht.
    IF NOT EXISTS (
        SELECT 1 FROM application_versions
        WHERE version = '0.44.32' AND jsonb_array_length(known_issues) = 1
    ) THEN
        RAISE EXCEPTION 'Die bekannte Einschränkung ohne Bildwerkzeug fehlt';
    END IF;
END;
$$;

\echo 'Migration 138_release_version_0_44_32.sql ist fachlich abgenommen.'
