\echo 'Teste Migration 147_release_version_0_44_38.sql ...'

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
    FROM application_versions WHERE version = '0.44.38';
    IF stand IS NULL OR stand NOT IN ('production', 'superseded') THEN
        RAISE EXCEPTION 'Die Fassung 0.44.38 fehlt oder besitzt einen ungültigen Status';
    END IF;

    SELECT release_status INTO vorgaenger
    FROM application_versions WHERE version = '0.44.37';
    IF vorgaenger IS DISTINCT FROM 'superseded' THEN
        RAISE EXCEPTION 'Die Vorgängerfassung 0.44.37 wurde nicht korrekt abgelöst';
    END IF;

    -- Diese Fassung ändert nur die Oberfläche und nimmt nichts weg. Weder eine
    -- bekannte Einschränkung noch ein Pflicht-Update gehören dazu; ein
    -- erzwungenes Update wäre hier nur eine Unterbrechung ohne Anlass.
    IF NOT EXISTS (
        SELECT 1 FROM application_versions
        WHERE version = '0.44.38'
          AND jsonb_array_length(known_issues) = 0
          AND mandatory_update = FALSE
    ) THEN
        RAISE EXCEPTION 'Die Fassung 0.44.38 ist falsch eingetragen';
    END IF;

    -- Sie fasst die Datenbank nicht an: außer diesem Eintrag gehört keine
    -- Migration dazu.
    IF NOT EXISTS (
        SELECT 1 FROM application_versions
        WHERE version = '0.44.38' AND database_migrations = '["147"]'::JSONB
    ) THEN
        RAISE EXCEPTION 'Die Fassung 0.44.38 nennt fremde Migrationen';
    END IF;
END;
$$;

\echo 'Migration 147_release_version_0_44_38.sql ist fachlich abgenommen.'
