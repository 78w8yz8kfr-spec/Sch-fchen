\echo 'Teste Migration 098_release_version_0_44_2.sql ...'

DO $$
DECLARE
    produktion INTEGER;
    eigene VARCHAR(20);
    vorgaenger VARCHAR(20);
BEGIN
    SELECT COUNT(*) INTO produktion
    FROM application_versions WHERE release_status = 'production';
    IF produktion <> 1 THEN
        RAISE EXCEPTION 'Es gibt % Produktionsfassungen statt genau einer', produktion;
    END IF;

    SELECT release_status INTO eigene
    FROM application_versions WHERE version = '0.44.2';
    IF eigene IS NULL OR eigene NOT IN ('production', 'superseded') THEN
        RAISE EXCEPTION 'Die Fassung 0.44.2 fehlt oder besitzt einen ungültigen Status';
    END IF;

    SELECT release_status INTO vorgaenger
    FROM application_versions WHERE version = '0.44.1';
    IF vorgaenger IS NULL OR vorgaenger = 'production' THEN
        RAISE EXCEPTION 'Die Vorgängerfassung 0.44.1 wurde nicht korrekt abgelöst';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM application_versions
        WHERE version = '0.44.2' AND rollout_percent = 100
          AND database_migrations @> '["098"]'::JSONB
    ) THEN
        RAISE EXCEPTION 'Fassung 0.44.2 ist nicht vollständig ausgerollt oder nennt ihre Migration nicht';
    END IF;
END;
$$;

\echo 'Migration 098_release_version_0_44_2.sql ist fachlich abgenommen.'
