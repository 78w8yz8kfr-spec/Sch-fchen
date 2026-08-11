\echo 'Teste Migration 121_create_delivery_notes.sql ...'

DO $$
DECLARE
    firma UUID;
    nutzer UUID;
    kunde UUID;
    projekt UUID;
    baustelle UUID;
    baustellenort UUID;
    lager UUID;
    gruppe UUID;
    artikel UUID;
    lieferant UUID;
    bestellung UUID;
    bestellposition UUID;
    schein UUID;
    zweiter UUID;
    position UUID;
    bewegung UUID;
BEGIN
    INSERT INTO companies (company_number, legal_name, display_name)
    VALUES ('F-121TST', 'Lieferschein Test GmbH', 'Lieferschein')
    RETURNING id INTO firma;
    INSERT INTO users (company_id, personnel_number, first_name, last_name)
    VALUES (firma, 'B-121', 'Test', 'Büro') RETURNING id INTO nutzer;
    INSERT INTO customers (company_id, customer_type, company_name, status)
    VALUES (firma, 'company', 'Testkunde', 'active') RETURNING id INTO kunde;
    INSERT INTO projects (company_id, customer_id, name, status)
    VALUES (firma, kunde, 'Testprojekt', 'active') RETURNING id INTO projekt;
    INSERT INTO construction_sites (company_id, project_id, name, status)
    VALUES (firma, projekt, 'Baustelle Müller', 'active') RETURNING id INTO baustelle;

    SELECT id INTO lager FROM storage_locations
    WHERE company_id = firma AND location_type = 'warehouse' LIMIT 1;
    INSERT INTO storage_locations (company_id, name, location_type, construction_site_id)
    VALUES (firma, 'Baustelle Müller', 'construction_site', baustelle)
    RETURNING id INTO baustellenort;

    SELECT id INTO gruppe FROM stock_item_groups
    WHERE company_id = firma AND group_key = 'switches';
    INSERT INTO stock_items (
        company_id, item_number, name, group_id, unit, created_by_user_id, changed_by_user_id
    )
    VALUES (firma, 'TST-121', 'Jung Steckdose 1520 WW', gruppe, 'Stück', nutzer, nutzer)
    RETURNING id INTO artikel;

    INSERT INTO suppliers (company_id, supplier_number, name, created_by_user_id, changed_by_user_id)
    VALUES (firma, 'L-121', 'Großhandel Test', nutzer, nutzer) RETURNING id INTO lieferant;

    INSERT INTO purchase_orders (
        company_id, order_number, supplier_id, status, ordered_at,
        target_location_id, construction_site_id, created_by_user_id, changed_by_user_id
    )
    VALUES (firma, 'B-815', lieferant, 'ordered', CURRENT_TIMESTAMP,
            baustellenort, baustelle, nutzer, nutzer)
    RETURNING id INTO bestellung;
    INSERT INTO purchase_order_items (
        company_id, purchase_order_id, item_id, line_position, quantity_ordered
    )
    VALUES (firma, bestellung, artikel, 1, 100) RETURNING id INTO bestellposition;

    -- 1. Ein Entwurf ist noch keine Buchung: kein Zeitpunkt, kein Bucher.
    INSERT INTO delivery_notes (
        company_id, supplier_id, delivery_note_number, delivered_on,
        purchase_order_id, target_location_id, construction_site_id, project_id,
        created_by_user_id, changed_by_user_id
    )
    VALUES (firma, lieferant, 'LS-4711', CURRENT_DATE, bestellung,
            baustellenort, baustelle, projekt, nutzer, nutzer)
    RETURNING id INTO schein;
    IF (SELECT status FROM delivery_notes WHERE id = schein) <> 'draft' THEN
        RAISE EXCEPTION 'Ein neuer Lieferschein muss ein Entwurf sein';
    END IF;

    -- Gebucht ohne Zeitpunkt und Bucher darf es nicht geben: sonst stünden
    -- Bewegungen im Journal, die niemand ausgelöst hat.
    BEGIN
        UPDATE delivery_notes SET status = 'booked' WHERE id = schein;
        RAISE EXCEPTION 'Gebucht ohne Zeitpunkt und Bucher wurde angenommen';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;

    -- 2. Positionen, davon eine mit Bezug zur Bestellposition.
    INSERT INTO delivery_note_items (
        company_id, delivery_note_id, item_id, line_position, quantity,
        purchase_order_item_id, supplier_item_number, unit_price
    )
    VALUES (firma, schein, artikel, 1, 92, bestellposition, 'JUNG-1520WW', 2.4500)
    RETURNING id INTO position;

    BEGIN
        INSERT INTO delivery_note_items (
            company_id, delivery_note_id, item_id, line_position, quantity
        )
        VALUES (firma, schein, artikel, 1, 5);
        RAISE EXCEPTION 'Zwei Positionen mit derselben Nummer wurden angenommen';
    EXCEPTION
        WHEN unique_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO delivery_note_items (
            company_id, delivery_note_id, item_id, line_position, quantity
        )
        VALUES (firma, schein, artikel, 2, 0);
        RAISE EXCEPTION 'Eine Position ohne Menge wurde angenommen';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;

    -- 3. Buchen: die Bewegung geht direkt auf die Baustelle und kennt ihren
    --    Beleg. Der Umweg über das Hauptlager, den es nie gab, wäre im
    --    Journal eine Lüge.
    UPDATE delivery_notes
    SET status = 'booked', booked_at = CURRENT_TIMESTAMP, booked_by_user_id = nutzer
    WHERE id = schein;

    INSERT INTO stock_movements (
        company_id, item_id, movement_type, quantity, target_location_id,
        construction_site_id, purchase_order_item_id, delivery_note_item_id,
        actor_user_id, source_type
    )
    VALUES (firma, artikel, 'receipt', 92, baustellenort, baustelle,
            bestellposition, position, nutzer, 'api')
    RETURNING id INTO bewegung;

    IF (SELECT quantity FROM stock_levels
        WHERE company_id = firma AND item_id = artikel AND location_id = baustellenort) <> 92 THEN
        RAISE EXCEPTION 'Die Direktlieferung ist nicht auf der Baustelle angekommen';
    END IF;
    IF EXISTS (
        SELECT 1 FROM stock_levels
        WHERE company_id = firma AND item_id = artikel AND location_id = lager AND quantity <> 0
    ) THEN
        RAISE EXCEPTION 'Die Direktlieferung lief über das Hauptlager';
    END IF;

    -- Der Rückweg vom Bestand zum Papier ist da.
    IF (SELECT delivery_note_item_id FROM stock_movements WHERE id = bewegung)
       IS DISTINCT FROM position THEN
        RAISE EXCEPTION 'Die Bewegung kennt ihren Lieferschein nicht';
    END IF;

    -- 4. Dieselbe Lieferscheinnummer beim selben Lieferanten gibt es nur
    --    einmal. Das ist der häufigste Fehler im Büro: zwei Leute tippen
    --    denselben Schein ab, und der Bestand ist doppelt.
    BEGIN
        INSERT INTO delivery_notes (
            company_id, supplier_id, delivery_note_number, delivered_on,
            target_location_id, created_by_user_id, changed_by_user_id
        )
        VALUES (firma, lieferant, '  ls-4711 ', CURRENT_DATE, lager, nutzer, nutzer);
        RAISE EXCEPTION 'Derselbe Lieferschein wurde zweimal angenommen';
    EXCEPTION
        WHEN unique_violation THEN NULL;
    END;

    -- Beim selben Betrieb, aber anderem Lieferanten, ist dieselbe Nummer in
    -- Ordnung: Lieferscheinnummern gehören dem Lieferanten.
    DECLARE
        zweiterLieferant UUID;
    BEGIN
        INSERT INTO suppliers (company_id, supplier_number, name, created_by_user_id, changed_by_user_id)
        VALUES (firma, 'L-121-B', 'Zweiter Großhandel', nutzer, nutzer)
        RETURNING id INTO zweiterLieferant;
        INSERT INTO delivery_notes (
            company_id, supplier_id, delivery_note_number, delivered_on,
            target_location_id, created_by_user_id, changed_by_user_id
        )
        VALUES (firma, zweiterLieferant, 'LS-4711', CURRENT_DATE, lager, nutzer, nutzer)
        RETURNING id INTO zweiter;
    END;

    -- 5. Ein Storno braucht einen Grund und gibt die Nummer wieder frei:
    --    eine falsch erfasste Nummer soll erneut vergeben werden können.
    BEGIN
        UPDATE delivery_notes SET status = 'cancelled' WHERE id = zweiter;
        RAISE EXCEPTION 'Ein Storno ohne Grund wurde angenommen';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;

    UPDATE delivery_notes
    SET status = 'cancelled', cancel_reason = 'Falsch erfasst'
    WHERE id = zweiter;

    INSERT INTO delivery_notes (
        company_id, supplier_id, delivery_note_number, delivered_on,
        target_location_id, created_by_user_id, changed_by_user_id
    )
    SELECT firma, supplier_id, 'LS-4711', CURRENT_DATE, lager, nutzer, nutzer
    FROM delivery_notes WHERE id = zweiter;

    -- 6. Gelöscht wird ein Lieferschein nicht.
    BEGIN
        DELETE FROM delivery_notes WHERE id = schein;
        RAISE EXCEPTION 'Ein Lieferschein wurde gelöscht';
    EXCEPTION
        WHEN raise_exception THEN
            IF SQLERRM NOT LIKE '%archiviert%' THEN RAISE; END IF;
    END;

    -- 7. Der Mandantenschutz steht.
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'delivery_notes' AND policyname = 'delivery_notes_tenant_isolation'
    ) THEN
        RAISE EXCEPTION 'Dem Lieferschein fehlt die Mandantentrennung';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'delivery_note_items'
          AND policyname = 'delivery_note_items_tenant_isolation'
    ) THEN
        RAISE EXCEPTION 'Den Lieferscheinpositionen fehlt die Mandantentrennung';
    END IF;

    RAISE EXCEPTION 'ABNAHME-121-ZURUECKGEROLLT';
EXCEPTION
    WHEN OTHERS THEN
        IF SQLERRM <> 'ABNAHME-121-ZURUECKGEROLLT' THEN
            RAISE;
        END IF;
END;
$$;

\echo 'Migration 121_create_delivery_notes.sql ist fachlich abgenommen.'
