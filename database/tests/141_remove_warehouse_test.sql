\echo 'Teste Migration 141_remove_warehouse.sql ...'

DO $$
DECLARE
    uebrig INTEGER;
BEGIN
    -- 1. Keine Lagertabelle darf uebrig sein. Namentlich aufgezaehlt und nicht
    --    per Muster: ein Muster haette 'storage_locations' erwischt und
    --    'suppliers' uebersehen.
    SELECT COUNT(*) INTO uebrig
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename IN (
        'stock_item_groups', 'suppliers', 'storage_locations', 'stock_items',
        'stock_item_barcodes', 'stock_labels', 'purchase_orders',
        'purchase_order_items', 'stock_levels', 'stock_movements',
        'stock_inventory_sessions', 'stock_inventory_counts', 'stock_settings',
        'stock_history', 'delivery_notes', 'delivery_note_items',
        'stock_reservations'
      );
    IF uebrig <> 0 THEN
        RAISE EXCEPTION 'Es stehen noch % Lagertabellen', uebrig;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'stock_availability') THEN
        RAISE EXCEPTION 'Die Sicht stock_availability steht noch';
    END IF;

    -- 2. Keine Funktion des Lagers darf uebrig sein. Eine Funktion, die auf
    --    gedroppte Tabellen zeigt, faellt sonst erst beim naechsten Aufruf auf.
    SELECT COUNT(*) INTO uebrig
    FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND (proname LIKE '%stock%' OR proname LIKE '%warehouse%');
    IF uebrig <> 0 THEN
        RAISE EXCEPTION 'Es stehen noch % Lagerfunktionen', uebrig;
    END IF;

    -- 3. Das Modul ist aus dem Katalog verschwunden.
    IF EXISTS (SELECT 1 FROM module_catalog WHERE module_key = 'warehouse') THEN
        RAISE EXCEPTION 'Der Modulschlüssel warehouse steht noch im Katalog';
    END IF;

    -- 4. Keine aktive Lageristenrolle mehr. Die Rolle selbst bleibt
    --    stillgelegt stehen, weil widerrufene Zuweisungen auf sie zeigen -
    --    Personalgeschichte wird nicht geloescht.
    IF EXISTS (SELECT 1 FROM roles WHERE role_key = 'warehouse_manager' AND status = 'active') THEN
        RAISE EXCEPTION 'Es gibt noch eine aktive Rolle Lagerist';
    END IF;

    -- 5. Und die naechste Firma bekommt auch keine mehr. Geprueft wird an den
    --    Ausloesern und nicht durch eine Probeanlage: eine Firma laesst sich
    --    nicht wieder loeschen, und eine Karteileiche als Nebenwirkung eines
    --    Abnahmetests waere ein schlechter Tausch. Ohne diesen Schritt hatte
    --    jede Neuanlage wieder ein Lager - beim Pruefen genau so passiert.
    SELECT COUNT(*) INTO uebrig
    FROM pg_trigger
    WHERE tgrelid = 'companies'::regclass
      AND NOT tgisinternal
      AND (tgname LIKE '%stock%' OR tgname LIKE '%warehouse%');
    IF uebrig <> 0 THEN
        RAISE EXCEPTION 'An companies haengen noch % Lager-Ausloeser', uebrig;
    END IF;

    -- 6. Die Materialliste der Baustelle bleibt - ohne die drei Spalten, mit
    --    denen sie am Lager hing.
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_name = 'site_material_entries'
    ) THEN
        RAISE EXCEPTION 'Die Materialliste der Baustelle ist mitgegangen';
    END IF;

    SELECT COUNT(*) INTO uebrig
    FROM information_schema.columns
    WHERE table_name = 'site_material_entries'
      AND column_name IN ('stock_item_id', 'stock_reservation_id', 'purchase_order_item_id');
    IF uebrig <> 0 THEN
        RAISE EXCEPTION 'Die Materialliste traegt noch % Lagerspalten', uebrig;
    END IF;
END;
$$;

\echo 'Migration 141_remove_warehouse.sql ist fachlich abgenommen.'
