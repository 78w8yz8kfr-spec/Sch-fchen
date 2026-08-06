\echo 'Teste Migration 081_create_vehicles.sql ...'

DO $$
DECLARE
    firma UUID;
    andere UUID;
    fahrer UUID;
    fremder UUID;
    wagen UUID;
    vorher BIGINT;
BEGIN
    BEGIN
        SELECT id INTO firma FROM companies ORDER BY company_number LIMIT 1;

        INSERT INTO users (company_id, personnel_number, first_name, last_name)
        VALUES (firma, 'ABNAHME-FZ-FAHRER', 'Frank', 'Fahrer')
        RETURNING id INTO fahrer;

        INSERT INTO vehicles (company_id, licence_plate, label, vehicle_type,
                              required_licence_class, assigned_user_id, next_inspection_on)
        VALUES (firma, ' es-se 123 ', 'Transporter Werkstatt', 'van', 'B', fahrer, DATE '2027-03-01')
        RETURNING id INTO wagen;

        -- Kennzeichen werden in einer Schreibweise gespeichert, sonst waeren
        -- "ES-SE 123" und "es-se123" zwei Fahrzeuge.
        IF (SELECT licence_plate FROM vehicles WHERE id = wagen) <> 'ES-SE 123' THEN
            RAISE EXCEPTION 'Das Kennzeichen wurde nicht aufgeraeumt: %',
                (SELECT licence_plate FROM vehicles WHERE id = wagen);
        END IF;

        -- Dasselbe Kennzeichen gibt es im Betrieb nur einmal, auch anders
        -- geschrieben.
        BEGIN
            INSERT INTO vehicles (company_id, licence_plate)
            VALUES (firma, 'ES-SE123');
            RAISE EXCEPTION 'Dasselbe Kennzeichen wurde zweimal angenommen';
        EXCEPTION WHEN unique_violation THEN
            NULL;
        END;

        -- Eine erfundene Art oder Klasse darf nicht in den Bestand.
        BEGIN
            INSERT INTO vehicles (company_id, licence_plate, vehicle_type)
            VALUES (firma, 'ES-XX 1', 'ufo');
            RAISE EXCEPTION 'Eine unbekannte Fahrzeugart wurde angenommen';
        EXCEPTION WHEN check_violation THEN
            NULL;
        END;
        BEGIN
            INSERT INTO vehicles (company_id, licence_plate, required_licence_class)
            VALUES (firma, 'ES-XX 2', 'A');
            RAISE EXCEPTION 'Eine unpassende Fuehrerscheinklasse wurde angenommen';
        EXCEPTION WHEN check_violation THEN
            NULL;
        END;

        -- Die Zeilenversion zaehlt bei jeder Aenderung hoch: sonst koennten
        -- zwei Bearbeiter einander stillschweigend ueberschreiben.
        SELECT row_version INTO vorher FROM vehicles WHERE id = wagen;
        UPDATE vehicles SET status = 'workshop' WHERE id = wagen;
        IF (SELECT row_version FROM vehicles WHERE id = wagen) <> vorher + 1 THEN
            RAISE EXCEPTION 'Die Zeilenversion zaehlt nicht hoch';
        END IF;

        -- Ein Fahrzeug gehoert niemandem aus einem anderen Betrieb.
        SELECT id INTO andere FROM companies
        WHERE id <> firma ORDER BY company_number LIMIT 1;
        IF andere IS NOT NULL THEN
            INSERT INTO users (company_id, personnel_number, first_name, last_name)
            VALUES (andere, 'ABNAHME-FZ-FREMD', 'Fremd', 'Fahrer')
            RETURNING id INTO fremder;

            BEGIN
                UPDATE vehicles SET assigned_user_id = fremder WHERE id = wagen;
                RAISE EXCEPTION 'Ein Fahrer aus einem anderen Betrieb wurde angenommen';
            EXCEPTION WHEN foreign_key_violation THEN
                NULL;
            END;
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

-- Die Mandantentrennung gilt auch fuer den Fuhrpark.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'vehicles' AND policyname = 'vehicles_tenant_isolation'
    ) THEN
        RAISE EXCEPTION 'Die Mandantentrennung des Fuhrparks fehlt';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_class
        WHERE relname = 'vehicles' AND relrowsecurity
    ) THEN
        RAISE EXCEPTION 'Der Fuhrpark hat keine Zeilensicherheit';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.role_table_grants
        WHERE table_name = 'vehicles'
          AND grantee = 'schaefchen_api'
          AND privilege_type = 'SELECT'
    ) THEN
        RAISE EXCEPTION 'Die Schnittstelle darf den Fuhrpark nicht lesen';
    END IF;
    -- Geloescht wird nicht: ein ausgemustertes Fahrzeug steht in alten
    -- Berichten.
    IF EXISTS (
        SELECT 1 FROM information_schema.role_table_grants
        WHERE table_name = 'vehicles'
          AND grantee = 'schaefchen_api'
          AND privilege_type = 'DELETE'
    ) THEN
        RAISE EXCEPTION 'Die Schnittstelle darf Fahrzeuge loeschen';
    END IF;
END;
$$;

\echo 'Migration 081_create_vehicles.sql ist fachlich abgenommen.'
