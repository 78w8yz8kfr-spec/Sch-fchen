\echo 'Teste Migration 117_site_material_stock_item.sql ...'

DO $$
DECLARE
    firma UUID;
    fremdfirma UUID;
    nutzer UUID;
    kunde UUID;
    projekt UUID;
    baustelle UUID;
    gruppe UUID;
    artikel UUID;
    fremdartikel UUID;
    eintrag UUID;
    gelesen UUID;
BEGIN
    INSERT INTO companies (company_number, legal_name, display_name)
    VALUES ('F-117TST', 'Materialverknüpfung Test GmbH', 'Materialverknüpfung')
    RETURNING id INTO firma;
    INSERT INTO companies (company_number, legal_name, display_name)
    VALUES ('F-117FRD', 'Fremde Firma GmbH', 'Fremde Firma')
    RETURNING id INTO fremdfirma;

    INSERT INTO users (company_id, personnel_number, first_name, last_name)
    VALUES (firma, 'P-117', 'Test', 'Planer') RETURNING id INTO nutzer;

    INSERT INTO customers (company_id, customer_type, company_name, status)
    VALUES (firma, 'company', 'Testkunde', 'active') RETURNING id INTO kunde;
    INSERT INTO projects (company_id, customer_id, name, status)
    VALUES (firma, kunde, 'Testprojekt', 'active') RETURNING id INTO projekt;
    INSERT INTO construction_sites (company_id, project_id, name, status)
    VALUES (firma, projekt, 'Testbaustelle', 'active') RETURNING id INTO baustelle;

    SELECT id INTO gruppe FROM stock_item_groups
    WHERE company_id = firma AND group_key = 'cable';
    INSERT INTO stock_items (
        company_id, item_number, name, group_id, unit,
        created_by_user_id, changed_by_user_id
    )
    VALUES (firma, 'TST-117', 'Mantelleitung 5x1,5', gruppe, 'Meter', nutzer, nutzer)
    RETURNING id INTO artikel;

    -- Eine Zeile ohne Artikel bleibt möglich: nicht alles, was auf der
    -- Baustellenliste steht, hat einen Lagerbestand.
    INSERT INTO site_material_entries (
        company_id, construction_site_id, item_name, quantity, unit,
        created_by_user_id, changed_by_user_id
    )
    VALUES (firma, baustelle, 'Kernbohrung 82 mm', 3, 'Stück', nutzer, nutzer)
    RETURNING id INTO eintrag;
    IF (SELECT stock_item_id FROM site_material_entries WHERE id = eintrag) IS NOT NULL THEN
        RAISE EXCEPTION 'Ein Eintrag ohne Artikel darf keinen bekommen';
    END IF;

    -- Und eine Zeile mit Artikel.
    INSERT INTO site_material_entries (
        company_id, construction_site_id, item_name, quantity, unit,
        stock_item_id, created_by_user_id, changed_by_user_id
    )
    VALUES (firma, baustelle, 'Mantelleitung 5x1,5', 300, 'Meter', artikel, nutzer, nutzer)
    RETURNING id INTO eintrag;

    SELECT stock_item_id INTO gelesen FROM site_material_entries WHERE id = eintrag;
    IF gelesen IS DISTINCT FROM artikel THEN
        RAISE EXCEPTION 'Die Verknüpfung zum Artikel wurde nicht gespeichert';
    END IF;

    -- Der Artikel einer fremden Firma ist nicht erreichbar. Ohne den
    -- zusammengesetzten Fremdschlüssel über (company_id, id) ginge das durch.
    INSERT INTO users (company_id, personnel_number, first_name, last_name)
    VALUES (fremdfirma, 'P-117F', 'Fremd', 'Planer') RETURNING id INTO nutzer;
    SELECT id INTO gruppe FROM stock_item_groups
    WHERE company_id = fremdfirma AND group_key = 'cable';
    INSERT INTO stock_items (
        company_id, item_number, name, group_id, unit,
        created_by_user_id, changed_by_user_id
    )
    VALUES (fremdfirma, 'FRD-117', 'Fremde Leitung', gruppe, 'Meter', nutzer, nutzer)
    RETURNING id INTO fremdartikel;

    BEGIN
        UPDATE site_material_entries
        SET stock_item_id = fremdartikel, changed_by_user_id = created_by_user_id
        WHERE id = eintrag;
        RAISE EXCEPTION 'Ein fremder Artikel wurde angenommen';
    EXCEPTION
        WHEN foreign_key_violation THEN
            NULL;
    END;

    -- Gelöscht wird ein Artikel ohnehin nie: dafür sorgt der Wächter aus
    -- Migration 107 für alle Lagertabellen. Der Fremdschlüssel steht hier
    -- trotzdem auf RESTRICT und nicht auf CASCADE, damit die Baustellenakte
    -- auch dann nicht still ausgeräumt würde, wenn jemand diesen Wächter
    -- eines Tages abschaltet.
    IF (
        SELECT confdeltype FROM pg_constraint
        WHERE conname = 'site_material_entries_stock_item_fkey'
    ) <> 'r' THEN
        RAISE EXCEPTION 'Der Fremdschlüssel zum Artikel steht nicht auf RESTRICT';
    END IF;

    RAISE EXCEPTION 'ABNAHME-117-ZURUECKGEROLLT';
EXCEPTION
    WHEN OTHERS THEN
        IF SQLERRM <> 'ABNAHME-117-ZURUECKGEROLLT' THEN
            RAISE;
        END IF;
END;
$$;

\echo 'Migration 117_site_material_stock_item.sql ist fachlich abgenommen.'
