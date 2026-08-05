\echo 'Teste Migration 057_release_version_0_42_7.sql ...'

-- Diese Abnahme prueft nur, was dauerhaft gilt. Dass genau diese Fassung der
-- Produktionsstand ist, prueft der Integrationstest der Schnittstelle gegen
-- APPLICATION_VERSION: dort wandert die Angabe mit dem Quelltext mit und kann
-- nicht veralten. Eine feste Fassungsnummer an dieser Stelle waere mit der
-- naechsten Veroeffentlichung falsch geworden, ohne dass etwas kaputt waere -
-- genau daran ist die Abnahme 044 schon einmal haengengeblieben.
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
    FROM application_versions WHERE version = '0.42.7';

    IF eigene IS NULL THEN
        RAISE EXCEPTION 'Die Fassung 0.42.7 fehlt';
    END IF;
    IF eigene NOT IN ('production', 'superseded') THEN
        RAISE EXCEPTION 'Die Fassung 0.42.7 steht auf %', eigene;
    END IF;

    SELECT release_status INTO vorgaenger
    FROM application_versions WHERE version = '0.42.6';

    IF vorgaenger IS NULL THEN
        RAISE EXCEPTION 'Die Vorgaengerfassung 0.42.6 fehlt';
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
        WHERE version = '0.42.7' AND rollout_percent = 100
    ) THEN
        RAISE EXCEPTION 'Die Fassung 0.42.7 wird nicht vollstaendig ausgerollt';
    END IF;
END;
$$;

\echo 'Migration 057_release_version_0_42_7.sql ist fachlich abgenommen.'
