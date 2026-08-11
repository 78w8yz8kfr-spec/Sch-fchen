\echo 'Teste Migration 119_material_locations_and_movements.sql ...'

DO $$
DECLARE
    firma UUID;
    nutzer UUID;
    kunde UUID;
    projekt UUID;
    baustelle UUID;
    fahrzeug UUID;
    lager UUID;
    fahrzeugort UUID;
    baustellenort UUID;
    retoure UUID;
    gruppe UUID;
    artikel UUID;
    bestand NUMERIC;
BEGIN
    INSERT INTO companies (company_number, legal_name, display_name)
    VALUES ('F-119TST', 'Materialkette Test GmbH', 'Materialkette')
    RETURNING id INTO firma;
    INSERT INTO users (company_id, personnel_number, first_name, last_name)
    VALUES (firma, 'M-119', 'Test', 'Monteur') RETURNING id INTO nutzer;
    INSERT INTO customers (company_id, customer_type, company_name, status)
    VALUES (firma, 'company', 'Testkunde', 'active') RETURNING id INTO kunde;
    INSERT INTO projects (company_id, customer_id, name, status)
    VALUES (firma, kunde, 'Testprojekt', 'active') RETURNING id INTO projekt;
    INSERT INTO construction_sites (company_id, project_id, name, status)
    VALUES (firma, projekt, 'Baustelle A', 'active') RETURNING id INTO baustelle;
    INSERT INTO vehicles (company_id, licence_plate, label, vehicle_type, required_licence_class)
    VALUES (firma, 'TST-MW 119', 'Transporter Max', 'van', 'B') RETURNING id INTO fahrzeug;

    SELECT id INTO lager FROM storage_locations
    WHERE company_id = firma AND location_type = 'warehouse' LIMIT 1;

    -- 1. Das Fahrzeug ist ein Lagerort und hängt am Fuhrpark.
    INSERT INTO storage_locations (company_id, name, location_type, vehicle_id)
    VALUES (firma, 'Transporter Max', 'vehicle', fahrzeug) RETURNING id INTO fahrzeugort;

    BEGIN
        INSERT INTO storage_locations (company_id, name, location_type)
        VALUES (firma, 'Fahrzeug ohne Fahrzeug', 'vehicle');
        RAISE EXCEPTION 'Ein Fahrzeugort ohne Fahrzeug wurde angenommen';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO storage_locations (company_id, name, location_type, vehicle_id)
        VALUES (firma, 'Regal mit Fahrzeug', 'warehouse', fahrzeug);
        RAISE EXCEPTION 'Ein Regal mit Fahrzeug wurde angenommen';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO storage_locations (company_id, name, location_type, vehicle_id)
        VALUES (firma, 'Zweiter Ort desselben Fahrzeugs', 'vehicle', fahrzeug);
        RAISE EXCEPTION 'Ein Fahrzeug bekam einen zweiten aktiven Lagerort';
    EXCEPTION
        WHEN unique_violation THEN NULL;
    END;

    -- Retourenlager: eigener Ort, damit es nicht im normalen Bestand mitzählt.
    INSERT INTO storage_locations (company_id, name, location_type)
    VALUES (firma, 'Retouren', 'returns') RETURNING id INTO retoure;

    INSERT INTO storage_locations (company_id, name, location_type, construction_site_id)
    VALUES (firma, 'Baustelle A', 'construction_site', baustelle) RETURNING id INTO baustellenort;

    SELECT id INTO gruppe FROM stock_item_groups
    WHERE company_id = firma AND group_key = 'cable';
    INSERT INTO stock_items (
        company_id, item_number, name, group_id, unit, created_by_user_id, changed_by_user_id
    )
    VALUES (firma, 'TST-119', 'NYM-J 3x1,5', gruppe, 'Meter', nutzer, nutzer)
    RETURNING id INTO artikel;

    -- 2. Die Kette aus der Aufgabenstellung, Abschnitt 32.
    --    1000 m ins Hauptlager, 200 m auf die Baustelle, 35 m zurück.
    INSERT INTO stock_movements (company_id, item_id, movement_type, quantity, target_location_id, actor_user_id)
    VALUES (firma, artikel, 'receipt', 1000, lager, nutzer);
    INSERT INTO stock_movements (company_id, item_id, movement_type, quantity, source_location_id, target_location_id, construction_site_id, actor_user_id)
    VALUES (firma, artikel, 'transfer', 200, lager, baustellenort, baustelle, nutzer);
    INSERT INTO stock_movements (company_id, item_id, movement_type, quantity, source_location_id, target_location_id, construction_site_id, actor_user_id)
    VALUES (firma, artikel, 'transfer', 35, baustellenort, lager, baustelle, nutzer);

    SELECT quantity INTO bestand FROM stock_levels
    WHERE company_id = firma AND item_id = artikel AND location_id = baustellenort;
    IF bestand <> 165 THEN
        RAISE EXCEPTION 'Auf der Baustelle müssten 165 Meter liegen, gerechnet: %', bestand;
    END IF;
    SELECT quantity INTO bestand FROM stock_levels
    WHERE company_id = firma AND item_id = artikel AND location_id = lager;
    IF bestand <> 835 THEN
        RAISE EXCEPTION 'Im Hauptlager müssten 835 Meter liegen, gerechnet: %', bestand;
    END IF;

    -- 3. Verbaut bucht aus dem Baustellenbestand aus.
    INSERT INTO stock_movements (
        company_id, item_id, movement_type, quantity,
        source_location_id, construction_site_id, actor_user_id
    )
    VALUES (firma, artikel, 'consumed', 120, baustellenort, baustelle, nutzer);

    SELECT quantity INTO bestand FROM stock_levels
    WHERE company_id = firma AND item_id = artikel AND location_id = baustellenort;
    IF bestand <> 45 THEN
        RAISE EXCEPTION 'Nach dem Verbauen müssten 45 Meter auf der Baustelle liegen, gerechnet: %', bestand;
    END IF;

    -- Verbaut ohne Baustelle ist keine Aussage.
    BEGIN
        INSERT INTO stock_movements (
            company_id, item_id, movement_type, quantity, source_location_id, actor_user_id
        )
        VALUES (firma, artikel, 'consumed', 1, lager, nutzer);
        RAISE EXCEPTION 'Verbaut ohne Baustelle wurde angenommen';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;

    -- Und verbaut hat kein Ziel: es kommt nirgends an.
    BEGIN
        INSERT INTO stock_movements (
            company_id, item_id, movement_type, quantity,
            source_location_id, target_location_id, construction_site_id, actor_user_id
        )
        VALUES (firma, artikel, 'consumed', 1, baustellenort, lager, baustelle, nutzer);
        RAISE EXCEPTION 'Verbaut mit Zielort wurde angenommen';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;

    -- 4. Das Fahrzeug trägt Bestand: Lager -> Fahrzeug -> Baustelle.
    INSERT INTO stock_movements (company_id, item_id, movement_type, quantity, source_location_id, target_location_id, actor_user_id)
    VALUES (firma, artikel, 'transfer', 100, lager, fahrzeugort, nutzer);
    INSERT INTO stock_movements (company_id, item_id, movement_type, quantity, source_location_id, target_location_id, construction_site_id, actor_user_id)
    VALUES (firma, artikel, 'transfer', 60, fahrzeugort, baustellenort, baustelle, nutzer);

    SELECT quantity INTO bestand FROM stock_levels
    WHERE company_id = firma AND item_id = artikel AND location_id = fahrzeugort;
    IF bestand <> 40 THEN
        RAISE EXCEPTION 'Im Fahrzeug müssten 40 Meter liegen, gerechnet: %', bestand;
    END IF;

    -- 5. Die Bestellung kennt ihr Lieferziel - hier die Direktlieferung.
    DECLARE
        lieferant UUID;
        bestellung UUID;
    BEGIN
        INSERT INTO suppliers (company_id, supplier_number, name, created_by_user_id, changed_by_user_id)
        VALUES (firma, 'L-119', 'Großhandel Test', nutzer, nutzer) RETURNING id INTO lieferant;
        INSERT INTO purchase_orders (
            company_id, order_number, supplier_id, status, ordered_at,
            target_location_id, construction_site_id, project_id,
            created_by_user_id, changed_by_user_id
        )
        VALUES (
            firma, 'B-119-0001', lieferant, 'ordered', CURRENT_TIMESTAMP,
            baustellenort, baustelle, projekt, nutzer, nutzer
        ) RETURNING id INTO bestellung;

        IF (SELECT construction_site_id FROM purchase_orders WHERE id = bestellung) IS DISTINCT FROM baustelle THEN
            RAISE EXCEPTION 'Die Bestellung hat ihr Lieferziel nicht behalten';
        END IF;
    END;

    -- 6. Der Verlauf darf jetzt auch von einer Bewegung sprechen.
    INSERT INTO stock_history (company_id, entity_type, entity_id, action, actor_user_id, reason)
    VALUES (firma, 'stock_movement', artikel, 'reversed', nutzer, 'Abnahmetest');

    RAISE EXCEPTION 'ABNAHME-119-ZURUECKGEROLLT';
EXCEPTION
    WHEN OTHERS THEN
        IF SQLERRM <> 'ABNAHME-119-ZURUECKGEROLLT' THEN
            RAISE;
        END IF;
END;
$$;

\echo 'Migration 119_material_locations_and_movements.sql ist fachlich abgenommen.'
