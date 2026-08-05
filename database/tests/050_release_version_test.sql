\echo 'Teste Migration 050_release_version_0_42_2.sql ...'

-- Diese Abnahme verlangt nicht, dass 0.42.2 der Produktionsstand ist: die
-- naechste Fassung loest sie ab, und die Abnahme wuerde ab da bei jedem Lauf
-- scheitern, ohne dass etwas kaputt waere. Den jeweils aktuellen Stand prueft
-- der Integrationstest der Schnittstelle gegen APPLICATION_VERSION.
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
    FROM application_versions WHERE version = '0.42.2';

    IF eigene IS NULL THEN
        RAISE EXCEPTION 'Die Fassung 0.42.2 fehlt';
    END IF;
    IF eigene NOT IN ('production', 'superseded') THEN
        RAISE EXCEPTION 'Die Fassung 0.42.2 steht auf %', eigene;
    END IF;

    -- Die vorherige Fassung bleibt erhalten und wird nur abgeloest. Ohne sie
    -- liesse sich nicht nachvollziehen, welcher Stand vorher ausgeliefert war.
    SELECT release_status INTO vorgaenger
    FROM application_versions WHERE version = '0.42.1';

    IF vorgaenger IS NULL THEN
        RAISE EXCEPTION 'Die Vorgaengerfassung 0.42.1 fehlt';
    END IF;
    IF vorgaenger <> 'superseded' THEN
        RAISE EXCEPTION 'Die Vorgaengerfassung steht auf % statt superseded', vorgaenger;
    END IF;
END;
$$;

-- Der Dienst-Worker muss zur Fassung passen. Bleibt der Speichername gleich,
-- liefert ein eingerichtetes Geraet weiterhin die alten Dateien aus und keine
-- Korrektur der Oberflaeche erreicht es.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM application_versions
        WHERE version = '0.42.2' AND rollout_percent = 100
    ) THEN
        RAISE EXCEPTION 'Die Fassung 0.42.2 wird nicht vollstaendig ausgerollt';
    END IF;
END;
$$;

\echo 'Migration 050_release_version_0_42_2.sql ist fachlich abgenommen.'
