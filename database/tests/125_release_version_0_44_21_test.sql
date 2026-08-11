\echo 'Teste Migration 125_release_version_0_44_21.sql ...'

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
    FROM application_versions WHERE version = '0.44.21';
    IF stand IS NULL OR stand NOT IN ('production', 'superseded') THEN
        RAISE EXCEPTION 'Die Fassung 0.44.21 fehlt oder besitzt einen ungültigen Status';
    END IF;

    SELECT release_status INTO vorgaenger
    FROM application_versions WHERE version = '0.44.20';
    IF vorgaenger IS DISTINCT FROM 'superseded' THEN
        RAISE EXCEPTION 'Die Vorgängerfassung 0.44.20 wurde nicht korrekt abgelöst';
    END IF;

    -- Nur der Fassungseintrag: die drei Auswertungen rechnen aus dem, was seit
    -- 119, 121 und 123 in der Datenbank steht.
    IF (SELECT jsonb_array_length(database_migrations)
        FROM application_versions WHERE version = '0.44.21') <> 1 THEN
        RAISE EXCEPTION 'Die Fassung 0.44.21 nennt mehr Migrationen, als sie mitbringt';
    END IF;
END;
$$;

\echo 'Migration 125_release_version_0_44_21.sql ist fachlich abgenommen.'
