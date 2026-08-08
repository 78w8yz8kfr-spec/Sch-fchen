\echo 'Teste Migration 092_release_version_0_43_0.sql ...'

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
    FROM application_versions WHERE version = '0.43.0';

    IF eigene IS NULL THEN
        RAISE EXCEPTION 'Die Fassung 0.43.0 fehlt';
    END IF;
    IF eigene NOT IN ('production', 'superseded') THEN
        RAISE EXCEPTION 'Die Fassung 0.43.0 steht auf %', eigene;
    END IF;

    SELECT release_status INTO vorgaenger
    FROM application_versions WHERE version = '0.42.36';

    IF vorgaenger IS NULL THEN
        RAISE EXCEPTION 'Die Vorgaengerfassung 0.42.36 fehlt';
    END IF;
    IF vorgaenger = 'production' THEN
        RAISE EXCEPTION 'Die Vorgaengerfassung wurde nicht abgeloest';
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM application_versions
        WHERE version = '0.43.0' AND rollout_percent = 100
    ) THEN
        RAISE EXCEPTION 'Die Fassung 0.43.0 wird nicht vollstaendig ausgerollt';
    END IF;
END;
$$;

\echo 'Migration 092_release_version_0_43_0.sql ist fachlich abgenommen.'
