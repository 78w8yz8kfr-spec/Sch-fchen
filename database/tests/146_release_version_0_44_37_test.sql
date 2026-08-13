\echo 'Teste Migration 146_release_version_0_44_37.sql ...'

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
    FROM application_versions WHERE version = '0.44.37';
    IF stand IS NULL OR stand NOT IN ('production', 'superseded') THEN
        RAISE EXCEPTION 'Die Fassung 0.44.37 fehlt oder besitzt einen ungültigen Status';
    END IF;

    SELECT release_status INTO vorgaenger
    FROM application_versions WHERE version = '0.44.36';
    IF vorgaenger IS DISTINCT FROM 'superseded' THEN
        RAISE EXCEPTION 'Die Vorgängerfassung 0.44.36 wurde nicht korrekt abgelöst';
    END IF;

    -- Der fehlende Hintergrunddienst steht als bekannte Einschränkung dabei:
    -- der Hinweis entsteht, wenn jemand die App öffnet, und nicht nachts von
    -- selbst. Wer die Fassung ausrollt, soll das wissen, bevor jemand fragt,
    -- warum am freien Tag nichts kam.
    IF NOT EXISTS (
        SELECT 1 FROM application_versions
        WHERE version = '0.44.37' AND jsonb_array_length(known_issues) = 1
    ) THEN
        RAISE EXCEPTION 'Die bekannte Einschränkung zum Entstehen der Hinweise fehlt';
    END IF;
END;
$$;

\echo 'Migration 146_release_version_0_44_37.sql ist fachlich abgenommen.'
