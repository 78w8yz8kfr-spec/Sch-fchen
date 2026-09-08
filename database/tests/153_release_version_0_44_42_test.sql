\echo 'Teste Migration 153_release_version_0_44_42.sql ...'

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
    FROM application_versions WHERE version = '0.44.42';
    IF stand IS NULL OR stand NOT IN ('production', 'superseded') THEN
        RAISE EXCEPTION 'Die Fassung 0.44.42 fehlt oder besitzt einen ungültigen Status';
    END IF;

    SELECT release_status INTO vorgaenger
    FROM application_versions WHERE version = '0.44.41';
    IF vorgaenger IS DISTINCT FROM 'superseded' THEN
        RAISE EXCEPTION 'Die Vorgängerfassung 0.44.41 wurde nicht korrekt abgelöst';
    END IF;

    -- Warum dieser Eintrag gebraucht wird: der Produktionsstand in der
    -- Datenbank und die Fassung des Servers müssen zusammenpassen. Der
    -- Integrationstest "Getrennte Plattformverwaltung" vergleicht beide und
    -- ist beim Sprung auf 0.44.40 genau daran gescheitert - die Fassung war
    -- überall angehoben worden, nur in der Datenbankgrundlage nicht. Wer eine
    -- Fassung anhebt, ohne diese Migration nachzuziehen, fällt wieder darauf
    -- herein.
    IF (
        SELECT COUNT(*) FROM application_versions WHERE version = '0.44.42'
    ) <> 1 THEN
        RAISE EXCEPTION 'Die Fassung 0.44.42 steht nicht genau einmal im Verzeichnis';
    END IF;
END;
$$;

\echo 'Migration 153_release_version_0_44_42.sql ist fachlich abgenommen.'
