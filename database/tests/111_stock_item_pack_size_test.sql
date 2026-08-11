\echo 'Teste Migration 111_stock_item_pack_size.sql ...'

DO $$
DECLARE
    firma UUID;
    gruppe UUID;
    bearbeiter UUID;
    artikel UUID;
    abgewiesen BOOLEAN;
BEGIN
    BEGIN
        SELECT id INTO firma FROM companies ORDER BY company_number LIMIT 1;
        SELECT id INTO gruppe FROM stock_item_groups
        WHERE company_id = firma AND group_key = 'other';

        INSERT INTO users (company_id, personnel_number, first_name, last_name)
        VALUES (firma, 'ABNAHME-GEBINDE', 'Gerda', 'Gebinde')
        RETURNING id INTO bearbeiter;

        -- Ein Artikel ohne Gebinde bleibt moeglich: die meisten Artikel haben
        -- keines, und ein Pflichtfeld dafuer waere eine Zumutung.
        INSERT INTO stock_items (
            company_id, item_number, name, group_id, unit,
            created_by_user_id, changed_by_user_id
        ) VALUES (firma, 'ABN-GEB-1', 'Ohne Gebinde', gruppe, 'Stück', bearbeiter, bearbeiter)
        RETURNING id INTO artikel;

        IF (SELECT pack_size FROM stock_items WHERE id = artikel) IS NOT NULL THEN
            RAISE EXCEPTION 'Ein Artikel bekommt ungefragt ein Gebinde';
        END IF;

        -- Mit Gebinde: Stueckzahl und Name gehoeren zusammen.
        INSERT INTO stock_items (
            company_id, item_number, name, group_id, unit, pack_size, pack_name,
            created_by_user_id, changed_by_user_id
        ) VALUES (firma, 'ABN-GEB-2', 'Karton mit hundert', gruppe, 'Stück', 100, 'Karton',
                  bearbeiter, bearbeiter)
        RETURNING id INTO artikel;

        IF (SELECT pack_size FROM stock_items WHERE id = artikel) <> 100 THEN
            RAISE EXCEPTION 'Die Gebindegroesse wurde nicht uebernommen';
        END IF;
        IF (SELECT pack_name FROM stock_items WHERE id = artikel) <> 'Karton' THEN
            RAISE EXCEPTION 'Der Gebindename wurde nicht uebernommen';
        END IF;

        -- Eine Stueckzahl ohne Namen waere ein Gebinde, das niemand ansprechen
        -- kann: "100 was?"
        abgewiesen := FALSE;
        BEGIN
            INSERT INTO stock_items (
                company_id, item_number, name, group_id, unit, pack_size,
                created_by_user_id, changed_by_user_id
            ) VALUES (firma, 'ABN-GEB-3', 'Namenlos', gruppe, 'Stück', 50,
                      bearbeiter, bearbeiter);
        EXCEPTION WHEN check_violation THEN
            abgewiesen := TRUE;
        END;
        IF NOT abgewiesen THEN
            RAISE EXCEPTION 'Eine Gebindegroesse ohne Namen wurde angenommen';
        END IF;

        -- Ein Name ohne Stueckzahl sagt nichts darueber, wie viel drin ist.
        abgewiesen := FALSE;
        BEGIN
            INSERT INTO stock_items (
                company_id, item_number, name, group_id, unit, pack_name,
                created_by_user_id, changed_by_user_id
            ) VALUES (firma, 'ABN-GEB-4', 'Leerer Karton', gruppe, 'Stück', 'Karton',
                      bearbeiter, bearbeiter);
        EXCEPTION WHEN check_violation THEN
            abgewiesen := TRUE;
        END;
        IF NOT abgewiesen THEN
            RAISE EXCEPTION 'Ein Gebindename ohne Stueckzahl wurde angenommen';
        END IF;

        -- Ein Gebinde mit einem Stueck ist kein Gebinde, sondern das Stueck.
        abgewiesen := FALSE;
        BEGIN
            INSERT INTO stock_items (
                company_id, item_number, name, group_id, unit, pack_size, pack_name,
                created_by_user_id, changed_by_user_id
            ) VALUES (firma, 'ABN-GEB-5', 'Einzelkarton', gruppe, 'Stück', 1, 'Karton',
                      bearbeiter, bearbeiter);
        EXCEPTION WHEN check_violation THEN
            abgewiesen := TRUE;
        END;
        IF NOT abgewiesen THEN
            RAISE EXCEPTION 'Ein Gebinde mit genau einem Stueck wurde angenommen';
        END IF;

        RAISE EXCEPTION 'ABNAHME_ZURUECK';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM <> 'ABNAHME_ZURUECK' THEN RAISE; END IF;
    END;
END;
$$;

\echo 'Migration 111_stock_item_pack_size.sql ist fachlich abgenommen.'
