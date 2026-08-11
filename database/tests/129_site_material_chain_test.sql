\echo 'Teste Migration 129_site_material_chain.sql ...'

DO $$
DECLARE
    firma UUID;
    nutzer UUID;
    kunde UUID;
    projekt UUID;
    baustelle UUID;
    lager UUID;
    gruppe UUID;
    artikel UUID;
    lieferant UUID;
    bestellung UUID;
    position UUID;
    reservierung UUID;
    eintrag UUID;
BEGIN
    INSERT INTO companies (company_number, legal_name, display_name)
    VALUES ('F-129TST', 'Belegkette Test GmbH', 'Belegkette') RETURNING id INTO firma;
    INSERT INTO users (company_id, personnel_number, first_name, last_name)
    VALUES (firma, 'B-129', 'Test', 'Büro') RETURNING id INTO nutzer;
    INSERT INTO customers (company_id, customer_type, company_name, status)
    VALUES (firma, 'company', 'Testkunde', 'active') RETURNING id INTO kunde;
    INSERT INTO projects (company_id, customer_id, name, status)
    VALUES (firma, kunde, 'Testprojekt', 'active') RETURNING id INTO projekt;
    INSERT INTO construction_sites (company_id, project_id, name, status)
    VALUES (firma, projekt, 'Baustelle A', 'active') RETURNING id INTO baustelle;

    SELECT id INTO lager FROM storage_locations
    WHERE company_id = firma AND location_type = 'warehouse' LIMIT 1;
    SELECT id INTO gruppe FROM stock_item_groups
    WHERE company_id = firma AND group_key = 'cable';
    INSERT INTO stock_items (
        company_id, item_number, name, group_id, unit, created_by_user_id, changed_by_user_id
    )
    VALUES (firma, 'TST-129', 'NYM-J 3x1,5', gruppe, 'Meter', nutzer, nutzer)
    RETURNING id INTO artikel;

    INSERT INTO stock_movements (
        company_id, item_id, movement_type, quantity, target_location_id, actor_user_id
    ) VALUES (firma, artikel, 'receipt', 120, lager, nutzer);

    INSERT INTO stock_reservations (
        company_id, item_id, location_id, construction_site_id, quantity,
        created_by_user_id, changed_by_user_id
    )
    VALUES (firma, artikel, lager, baustelle, 120, nutzer, nutzer)
    RETURNING id INTO reservierung;

    INSERT INTO suppliers (company_id, supplier_number, name, created_by_user_id, changed_by_user_id)
    VALUES (firma, 'L-129', 'Großhandel', nutzer, nutzer) RETURNING id INTO lieferant;
    INSERT INTO purchase_orders (
        company_id, order_number, supplier_id, created_by_user_id, changed_by_user_id
    )
    VALUES (firma, 'B-129-0001', lieferant, nutzer, nutzer) RETURNING id INTO bestellung;
    INSERT INTO purchase_order_items (
        company_id, purchase_order_id, item_id, line_position, quantity_ordered
    )
    VALUES (firma, bestellung, artikel, 1, 180) RETURNING id INTO position;

    -- Die Bedarfszeile hängt an beidem: 120 liegen zurück, 180 sind bestellt.
    INSERT INTO site_material_entries (
        company_id, construction_site_id, item_name, quantity, unit, stock_item_id,
        stock_reservation_id, purchase_order_item_id, created_by_user_id, changed_by_user_id
    )
    VALUES (firma, baustelle, 'NYM-J 3x1,5', 300, 'Meter', artikel,
            reservierung, position, nutzer, nutzer)
    RETURNING id INTO eintrag;

    IF (SELECT stock_reservation_id FROM site_material_entries WHERE id = eintrag)
       IS DISTINCT FROM reservierung THEN
        RAISE EXCEPTION 'Die Reservierung hängt nicht an der Bedarfszeile';
    END IF;
    IF (SELECT purchase_order_item_id FROM site_material_entries WHERE id = eintrag)
       IS DISTINCT FROM position THEN
        RAISE EXCEPTION 'Die Bestellposition hängt nicht an der Bedarfszeile';
    END IF;

    -- Ohne Artikel gibt es weder Reservierung noch Bestellung: eine
    -- Reservierung für eine Freitextzeile wäre eine Menge ohne Ware.
    BEGIN
        INSERT INTO site_material_entries (
            company_id, construction_site_id, item_name, quantity, unit,
            stock_reservation_id, created_by_user_id, changed_by_user_id
        )
        VALUES (firma, baustelle, 'Kernbohrung', 3, 'Stück', reservierung, nutzer, nutzer);
        RAISE EXCEPTION 'Eine Freitextzeile bekam eine Reservierung';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;

    -- Die Kette ist von der Bedarfszeile aus vollständig begehbar.
    IF NOT EXISTS (
        SELECT 1
        FROM site_material_entries AS bedarf
        JOIN purchase_order_items AS pos
          ON pos.company_id = bedarf.company_id AND pos.id = bedarf.purchase_order_item_id
        JOIN purchase_orders AS best
          ON best.company_id = pos.company_id AND best.id = pos.purchase_order_id
        JOIN suppliers AS lief
          ON lief.company_id = best.company_id AND lief.id = best.supplier_id
        WHERE bedarf.id = eintrag AND lief.name = 'Großhandel'
    ) THEN
        RAISE EXCEPTION 'Von der Bedarfszeile führt kein Weg zum Lieferanten';
    END IF;

    RAISE EXCEPTION 'ABNAHME-129-ZURUECKGEROLLT';
EXCEPTION
    WHEN OTHERS THEN
        IF SQLERRM <> 'ABNAHME-129-ZURUECKGEROLLT' THEN
            RAISE;
        END IF;
END;
$$;

\echo 'Migration 129_site_material_chain.sql ist fachlich abgenommen.'
