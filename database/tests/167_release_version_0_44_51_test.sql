\echo 'Teste Migration 167_release_version_0_44_51.sql ...'
DO $$
DECLARE
    produktionsstaende INTEGER;
    stand VARCHAR(30);
    vorgaenger VARCHAR(30);
BEGIN
    SELECT COUNT(*) INTO produktionsstaende FROM application_versions WHERE release_status = 'production';
    IF produktionsstaende <> 1 THEN
        RAISE EXCEPTION 'Es muss genau eine Produktionsfassung geben, gefunden: %', produktionsstaende;
    END IF;
    SELECT release_status INTO stand FROM application_versions WHERE version = '0.44.51';
    IF stand IS NULL OR stand NOT IN ('production', 'superseded') THEN
        RAISE EXCEPTION 'Die Fassung 0.44.51 fehlt oder besitzt einen ungueltigen Status';
    END IF;
    SELECT release_status INTO vorgaenger FROM application_versions WHERE version = '0.44.50';
    IF vorgaenger IS DISTINCT FROM 'superseded' THEN
        RAISE EXCEPTION 'Die Vorgaengerfassung 0.44.50 wurde nicht korrekt abgeloest';
    END IF;
END;
$$;
\echo 'Migration 167_release_version_0_44_51.sql ist fachlich abgenommen.'
