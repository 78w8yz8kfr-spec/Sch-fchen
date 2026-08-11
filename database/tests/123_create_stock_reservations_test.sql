\echo 'Teste Migration 123_create_stock_reservations.sql ...'

DO $$
DECLARE
    firma UUID;
    nutzer UUID;
    kunde UUID;
    projekt UUID;
    baustelleA UUID;
    baustelleB UUID;
    lager UUID;
    gruppe UUID;
    artikel UUID;
    reservierungA UUID;
    frei NUMERIC;
    reserviert NUMERIC;
    physisch NUMERIC;
BEGIN
    INSERT INTO companies (company_number, legal_name, display_name)
    VALUES ('F-123TST', 'Reservierung Test GmbH', 'Reservierung')
    RETURNING id INTO firma;
    INSERT INTO users (company_id, personnel_number, first_name, last_name)
    VALUES (firma, 'L-123', 'Test', 'Lagerist') RETURNING id INTO nutzer;
    INSERT INTO customers (company_id, customer_type, company_name, status)
    VALUES (firma, 'company', 'Testkunde', 'active') RETURNING id INTO kunde;
    INSERT INTO projects (company_id, customer_id, name, status)
    VALUES (firma, kunde, 'Testprojekt', 'active') RETURNING id INTO projekt;
    INSERT INTO construction_sites (company_id, project_id, name, status)
    VALUES (firma, projekt, 'Baustelle A', 'active') RETURNING id INTO baustelleA;
    INSERT INTO construction_sites (company_id, project_id, name, status)
    VALUES (firma, projekt, 'Baustelle B', 'active') RETURNING id INTO baustelleB;

    SELECT id INTO lager FROM storage_locations
    WHERE company_id = firma AND location_type = 'warehouse' LIMIT 1;
    SELECT id INTO gruppe FROM stock_item_groups
    WHERE company_id = firma AND group_key = 'switches';
    INSERT INTO stock_items (
        company_id, item_number, name, group_id, unit, created_by_user_id, changed_by_user_id
    )
    VALUES (firma, 'TST-123', 'Jung Steckdose 1520 WW', gruppe, 'Stück', nutzer, nutzer)
    RETURNING id INTO artikel;

    -- 100 Stück ins Lager. Ohne Reservierung ist alles frei.
    INSERT INTO stock_movements (
        company_id, item_id, movement_type, quantity, target_location_id, actor_user_id
    ) VALUES (firma, artikel, 'receipt', 100, lager, nutzer);

    SELECT physical_quantity, reserved_quantity, free_quantity
      INTO physisch, reserviert, frei
    FROM stock_availability
    WHERE company_id = firma AND item_id = artikel AND location_id = lager;
    IF (physisch, reserviert, frei) IS DISTINCT FROM (100::NUMERIC, 0::NUMERIC, 100::NUMERIC) THEN
        RAISE EXCEPTION 'Ohne Reservierung müsste alles frei sein, ist: % / % / %',
            physisch, reserviert, frei;
    END IF;

    -- Der Fall aus der Aufgabenstellung: 40 für A, 20 für B.
    INSERT INTO stock_reservations (
        company_id, item_id, location_id, construction_site_id, quantity,
        created_by_user_id, changed_by_user_id
    )
    VALUES (firma, artikel, lager, baustelleA, 40, nutzer, nutzer)
    RETURNING id INTO reservierungA;
    INSERT INTO stock_reservations (
        company_id, item_id, location_id, construction_site_id, quantity,
        created_by_user_id, changed_by_user_id
    )
    VALUES (firma, artikel, lager, baustelleB, 20, nutzer, nutzer);

    SELECT physical_quantity, reserved_quantity, free_quantity
      INTO physisch, reserviert, frei
    FROM stock_availability
    WHERE company_id = firma AND item_id = artikel AND location_id = lager;
    IF (physisch, reserviert, frei) IS DISTINCT FROM (100::NUMERIC, 60::NUMERIC, 40::NUMERIC) THEN
        RAISE EXCEPTION 'Erwartet 100 / 60 / 40, bekommen % / % / %', physisch, reserviert, frei;
    END IF;

    -- Die Reservierung verändert den physischen Bestand nicht: die Ware liegt
    -- weiter im Regal, sie ist nur nicht mehr für jeden da.
    IF (SELECT quantity FROM stock_levels
        WHERE company_id = firma AND item_id = artikel AND location_id = lager) <> 100 THEN
        RAISE EXCEPTION 'Eine Reservierung darf den physischen Bestand nicht verändern';
    END IF;

    -- Teilweise abgeholt: 25 von 40 für Baustelle A.
    UPDATE stock_reservations
    SET quantity_fulfilled = 25, changed_by_user_id = nutzer
    WHERE id = reservierungA;
    INSERT INTO stock_movements (
        company_id, item_id, movement_type, quantity, source_location_id,
        construction_site_id, actor_user_id
    ) VALUES (firma, artikel, 'issue', 25, lager, baustelleA, nutzer);

    SELECT physical_quantity, reserved_quantity, free_quantity
      INTO physisch, reserviert, frei
    FROM stock_availability
    WHERE company_id = firma AND item_id = artikel AND location_id = lager;
    -- 75 liegen noch da, 15 für A und 20 für B sind weiter zurückgelegt.
    IF (physisch, reserviert, frei) IS DISTINCT FROM (75::NUMERIC, 35::NUMERIC, 40::NUMERIC) THEN
        RAISE EXCEPTION 'Nach der Teilabholung erwartet 75 / 35 / 40, bekommen % / % / %',
            physisch, reserviert, frei;
    END IF;

    -- Mehr abholen als zurückgelegt wurde ist keine Reservierung mehr.
    BEGIN
        UPDATE stock_reservations
        SET quantity_fulfilled = 60, changed_by_user_id = nutzer
        WHERE id = reservierungA;
        RAISE EXCEPTION 'Mehr abgeholt als reserviert wurde angenommen';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;

    -- Vollständig abgeholt schließt die Reservierung, und sie blockiert nichts
    -- mehr.
    UPDATE stock_reservations
    SET quantity_fulfilled = 40, status = 'fulfilled', changed_by_user_id = nutzer
    WHERE id = reservierungA;

    SELECT reserved_quantity INTO reserviert FROM stock_availability
    WHERE company_id = firma AND item_id = artikel AND location_id = lager;
    IF reserviert <> 20 THEN
        RAISE EXCEPTION 'Eine erledigte Reservierung darf nichts mehr blockieren, blockiert: %',
            reserviert;
    END IF;

    -- Aufheben braucht einen Grund: eine Reservierung, die kommentarlos
    -- verschwindet, ist genau der Streit, den sie verhindern sollte.
    BEGIN
        UPDATE stock_reservations
        SET status = 'released', changed_by_user_id = nutzer
        WHERE company_id = firma AND construction_site_id = baustelleB;
        RAISE EXCEPTION 'Aufheben ohne Grund wurde angenommen';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;

    UPDATE stock_reservations
    SET status = 'released', release_reason = 'Baustelle verschoben', changed_by_user_id = nutzer
    WHERE company_id = firma AND construction_site_id = baustelleB;

    SELECT reserved_quantity, free_quantity INTO reserviert, frei
    FROM stock_availability
    WHERE company_id = firma AND item_id = artikel AND location_id = lager;
    IF (reserviert, frei) IS DISTINCT FROM (0::NUMERIC, 75::NUMERIC) THEN
        RAISE EXCEPTION 'Nach dem Aufheben erwartet 0 / 75, bekommen % / %', reserviert, frei;
    END IF;

    -- Der Meldebestand liegt zwischen Mindest- und Zielbestand.
    UPDATE stock_items SET minimum_stock = 20, reorder_point = 50, target_stock = 200
    WHERE id = artikel;
    BEGIN
        UPDATE stock_items SET reorder_point = 10 WHERE id = artikel;
        RAISE EXCEPTION 'Ein Meldebestand unter dem Mindestbestand wurde angenommen';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;

    -- Gelöscht wird eine Reservierung nicht; sie wird aufgehoben.
    BEGIN
        DELETE FROM stock_reservations WHERE id = reservierungA;
        RAISE EXCEPTION 'Eine Reservierung wurde gelöscht';
    EXCEPTION
        WHEN raise_exception THEN
            IF SQLERRM NOT LIKE '%archiviert%' THEN RAISE; END IF;
    END;

    RAISE EXCEPTION 'ABNAHME-123-ZURUECKGEROLLT';
EXCEPTION
    WHEN OTHERS THEN
        IF SQLERRM <> 'ABNAHME-123-ZURUECKGEROLLT' THEN
            RAISE;
        END IF;
END;
$$;

\echo 'Migration 123_create_stock_reservations.sql ist fachlich abgenommen.'
