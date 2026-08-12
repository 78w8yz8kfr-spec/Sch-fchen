\echo 'Teste Migration 136_release_version_0_44_30.sql ...'

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
    FROM application_versions WHERE version = '0.44.30';
    IF stand IS NULL OR stand NOT IN ('production', 'superseded') THEN
        RAISE EXCEPTION 'Die Fassung 0.44.30 fehlt oder besitzt einen ungültigen Status';
    END IF;

    SELECT release_status INTO vorgaenger
    FROM application_versions WHERE version = '0.44.29';
    IF vorgaenger IS DISTINCT FROM 'superseded' THEN
        RAISE EXCEPTION 'Die Vorgängerfassung 0.44.29 wurde nicht korrekt abgelöst';
    END IF;

    -- Zwei Breitenkorrekturen ohne Rest: keine bekannte Einschränkung, und das
    -- steht ausdrücklich da statt zufällig leer zu bleiben.
    IF NOT EXISTS (
        SELECT 1 FROM application_versions
        WHERE version = '0.44.30' AND jsonb_array_length(known_issues) = 0
    ) THEN
        RAISE EXCEPTION 'Diese Fassung soll keine bekannten Einschränkungen führen';
    END IF;
END;
$$;

\echo 'Migration 136_release_version_0_44_30.sql ist fachlich abgenommen.'
