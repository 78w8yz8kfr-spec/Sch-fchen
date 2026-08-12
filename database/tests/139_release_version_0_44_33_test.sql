\echo 'Teste Migration 139_release_version_0_44_33.sql ...'

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
    FROM application_versions WHERE version = '0.44.33';
    IF stand IS NULL OR stand NOT IN ('production', 'superseded') THEN
        RAISE EXCEPTION 'Die Fassung 0.44.33 fehlt oder besitzt einen ungültigen Status';
    END IF;

    SELECT release_status INTO vorgaenger
    FROM application_versions WHERE version = '0.44.32';
    IF vorgaenger IS DISTINCT FROM 'superseded' THEN
        RAISE EXCEPTION 'Die Vorgängerfassung 0.44.32 wurde nicht korrekt abgelöst';
    END IF;

    -- Der Notlauf mit kleinerem Bild steht als bekannte Einschränkung dabei:
    -- wer die Fassung ausrollt, soll wissen, dass ein zweiter Anlauf zwar den
    -- Kopf rettet, aber nicht jede Positionszeile.
    IF NOT EXISTS (
        SELECT 1 FROM application_versions
        WHERE version = '0.44.33' AND jsonb_array_length(known_issues) = 1
    ) THEN
        RAISE EXCEPTION 'Die bekannte Einschränkung des Notlaufs fehlt';
    END IF;
END;
$$;

\echo 'Migration 139_release_version_0_44_33.sql ist fachlich abgenommen.'
