\echo 'Teste Migration 078_driving_licences.sql ...'

DO $$
DECLARE
    firma UUID;
    fahrer UUID;
BEGIN
    BEGIN
        SELECT id INTO firma FROM companies ORDER BY company_number LIMIT 1;

        -- Ohne Angabe steht die Menge leer da, nicht auf NULL: eine leere Menge
        -- laesst sich durchsuchen, NULL muss man ueberall abfangen.
        INSERT INTO users (company_id, personnel_number, first_name, last_name)
        VALUES (firma, 'ABNAHME-FS-LEER', 'Ohne', 'Schein')
        RETURNING id INTO fahrer;

        IF (SELECT driving_licence_classes FROM users WHERE id = fahrer) IS DISTINCT FROM '{}'::TEXT[] THEN
            RAISE EXCEPTION 'Ohne Angabe steht keine leere Menge da';
        END IF;

        -- Mehrere Klassen nebeneinander sind der Normalfall: wer C hat, hat
        -- meistens auch B.
        UPDATE users SET driving_licence_classes = ARRAY['B', 'BE', 'C1']
        WHERE id = fahrer;

        IF NOT (
            SELECT driving_licence_classes @> ARRAY['B']::TEXT[]
            FROM users WHERE id = fahrer
        ) THEN
            RAISE EXCEPTION 'Die Klasse B wurde nicht gespeichert';
        END IF;

        -- Eine erfundene Klasse darf nicht in den Bestand.
        BEGIN
            UPDATE users SET driving_licence_classes = ARRAY['Klasse 3']
            WHERE id = fahrer;
            RAISE EXCEPTION 'Eine unbekannte Fuehrerscheinklasse wurde angenommen';
        EXCEPTION WHEN check_violation THEN
            NULL;
        END;

        -- Dieselbe Klasse zweimal ist keine zweite Berechtigung: sie wird
        -- aufgeraeumt, nicht abgelehnt. Kleinschreibung und Leerzeichen
        -- ebenso - sonst waere "b " eine eigene Klasse.
        UPDATE users SET driving_licence_classes = ARRAY['B', 'b', ' be ']
        WHERE id = fahrer;

        IF (SELECT driving_licence_classes FROM users WHERE id = fahrer)
            IS DISTINCT FROM ARRAY['B', 'BE']::TEXT[] THEN
            RAISE EXCEPTION 'Die Klassen wurden nicht aufgeraeumt: %',
                (SELECT driving_licence_classes FROM users WHERE id = fahrer);
        END IF;

        -- Die Reihenfolge ist immer dieselbe, egal wie eingetragen wird.
        UPDATE users SET driving_licence_classes = ARRAY['C1', 'B']
        WHERE id = fahrer;

        IF (SELECT driving_licence_classes FROM users WHERE id = fahrer)
            IS DISTINCT FROM ARRAY['B', 'C1']::TEXT[] THEN
            RAISE EXCEPTION 'Die Klassen stehen nicht in fester Reihenfolge';
        END IF;

        RAISE EXCEPTION 'ABNAHME_ZURUECK';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM <> 'ABNAHME_ZURUECK' THEN
                RAISE;
            END IF;
    END;
END;
$$;

-- Die Spalte selbst bleibt bestehen, auch wenn die Abnahme ihre Daten
-- zuruecknimmt.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'driving_licence_classes'
    ) THEN
        RAISE EXCEPTION 'Die Fuehrerscheinklassen fehlen';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'users' AND constraint_name = 'users_driving_licence_classes_known'
    ) THEN
        RAISE EXCEPTION 'Die Pruefung der bekannten Klassen fehlt';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'users_normalise_driving_licences' AND NOT tgisinternal
    ) THEN
        RAISE EXCEPTION 'Das Aufraeumen der Klassen fehlt';
    END IF;
END;
$$;

\echo 'Migration 078_driving_licences.sql ist fachlich abgenommen.'
