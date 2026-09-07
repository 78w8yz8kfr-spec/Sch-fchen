\echo 'Teste Migration 149_release_version_0_44_40.sql ...'

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
    FROM application_versions WHERE version = '0.44.40';
    IF stand IS NULL OR stand NOT IN ('production', 'superseded') THEN
        RAISE EXCEPTION 'Die Fassung 0.44.40 fehlt oder besitzt einen ungültigen Status';
    END IF;

    SELECT release_status INTO vorgaenger
    FROM application_versions WHERE version = '0.44.39';
    IF vorgaenger IS DISTINCT FROM 'superseded' THEN
        RAISE EXCEPTION 'Die Vorgängerfassung 0.44.39 wurde nicht korrekt abgelöst';
    END IF;

    -- Warum dieser Eintrag ueberhaupt gebraucht wird: der Produktionsstand in
    -- der Datenbank und die Fassung des Servers muessen zusammenpassen. Der
    -- Integrationstest "Getrennte Plattformverwaltung" vergleicht beide
    -- miteinander und ist beim Sprung auf 0.44.40 genau daran gescheitert -
    -- die Fassung war ueberall angehoben worden, nur hier nicht. Wer eine
    -- Fassung anhebt, ohne diese Migration nachzuziehen, faellt wieder darauf
    -- herein.
    IF (
        SELECT COUNT(*) FROM application_versions WHERE version = '0.44.40'
    ) <> 1 THEN
        RAISE EXCEPTION 'Die Fassung 0.44.40 steht nicht genau einmal im Verzeichnis';
    END IF;
END;
$$;

\echo 'Migration 149_release_version_0_44_40.sql ist fachlich abgenommen.'
