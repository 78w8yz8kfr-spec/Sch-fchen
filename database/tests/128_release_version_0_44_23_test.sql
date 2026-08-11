\echo 'Teste Migration 128_release_version_0_44_23.sql ...'

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
    FROM application_versions WHERE version = '0.44.23';
    IF stand IS NULL OR stand NOT IN ('production', 'superseded') THEN
        RAISE EXCEPTION 'Die Fassung 0.44.23 fehlt oder besitzt einen ungültigen Status';
    END IF;

    SELECT release_status INTO vorgaenger
    FROM application_versions WHERE version = '0.44.22';
    IF vorgaenger IS DISTINCT FROM 'superseded' THEN
        RAISE EXCEPTION 'Die Vorgängerfassung 0.44.22 wurde nicht korrekt abgelöst';
    END IF;

    -- Nur der Fassungseintrag: die Regel steht im Server, nicht in der
    -- Datenbank.
    IF (SELECT jsonb_array_length(database_migrations)
        FROM application_versions WHERE version = '0.44.23') <> 1 THEN
        RAISE EXCEPTION 'Die Fassung 0.44.23 nennt mehr Migrationen, als sie mitbringt';
    END IF;
END;
$$;

\echo 'Migration 128_release_version_0_44_23.sql ist fachlich abgenommen.'
