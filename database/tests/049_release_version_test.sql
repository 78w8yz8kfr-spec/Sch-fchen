\echo 'Teste Migration 049_release_version_0_42_1.sql ...'

-- Diese Abnahme darf nicht verlangen, dass 0.42.1 der Produktionsstand ist:
-- die naechste Fassung loest sie ab, und die Abnahme wuerde ab da bei jedem
-- Lauf scheitern, ohne dass etwas kaputt waere. Geprueft wird deshalb, was
-- dauerhaft gilt: die Fassung ist eingetragen, vollstaendig ausgerollt und hat
-- ihre Vorgaengerin abgeloest. Den jeweils aktuellen Stand prueft die Abnahme
-- der zugehoerigen Fassung.
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
    FROM application_versions WHERE version = '0.42.1';

    IF eigene IS NULL THEN
        RAISE EXCEPTION 'Die Fassung 0.42.1 fehlt';
    END IF;
    IF eigene NOT IN ('production', 'superseded') THEN
        RAISE EXCEPTION 'Die Fassung 0.42.1 steht auf %', eigene;
    END IF;

    -- Die vorherige Fassung bleibt erhalten und wird nur abgeloest. Ohne sie
    -- liesse sich nicht nachvollziehen, welcher Stand vorher ausgeliefert war.
    SELECT release_status INTO vorgaenger
    FROM application_versions WHERE version = '0.42.0';

    IF vorgaenger IS NULL THEN
        RAISE EXCEPTION 'Die Vorgaengerfassung 0.42.0 fehlt';
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
        WHERE version = '0.42.1' AND rollout_percent = 100
    ) THEN
        RAISE EXCEPTION 'Die Fassung 0.42.1 wird nicht vollstaendig ausgerollt';
    END IF;
END;
$$;

\echo 'Migration 049_release_version_0_42_1.sql ist fachlich abgenommen.'
