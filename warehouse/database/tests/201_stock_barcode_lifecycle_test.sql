\echo 'Teste Migration 201_stock_barcode_lifecycle.sql ...'

DO $$
DECLARE
    firma UUID;
    bearbeiter UUID;
    gruppe UUID;
    artikel UUID;
    zweiter UUID;
    code UUID;
    doppelt_geschuetzt BOOLEAN := FALSE;
    aenderung_geschuetzt BOOLEAN := FALSE;
    wiederbelebung_geschuetzt BOOLEAN := FALSE;
    widerruf_geschuetzt BOOLEAN := FALSE;
BEGIN
    BEGIN
        IF NOT has_table_privilege('schaefchen_api', 'stock_item_barcodes', 'UPDATE') THEN
            RAISE EXCEPTION 'Die API kann einen Code nicht widerrufen';
        END IF;

        SELECT id INTO firma FROM companies ORDER BY company_number LIMIT 1;
        SELECT id INTO bearbeiter FROM users
        WHERE company_id = firma AND status = 'active' ORDER BY created_at LIMIT 1;
        IF bearbeiter IS NULL THEN
            INSERT INTO users (company_id, personnel_number, first_name, last_name)
            VALUES (firma, 'ABNAHME-CODE-AKTEUR', 'Cara', 'Code')
            RETURNING id INTO bearbeiter;
        END IF;
        SELECT id INTO gruppe FROM stock_item_groups
        WHERE company_id = firma AND group_key = 'other';

        INSERT INTO stock_items (
            company_id, item_number, name, group_id, unit,
            created_by_user_id, changed_by_user_id
        ) VALUES (firma, 'CODE-0001', 'Codeartikel', gruppe, 'Stück', bearbeiter, bearbeiter)
        RETURNING id INTO artikel;

        INSERT INTO stock_items (
            company_id, item_number, name, group_id, unit,
            created_by_user_id, changed_by_user_id
        ) VALUES (firma, 'CODE-0002', 'Zweiter Codeartikel', gruppe, 'Stück', bearbeiter, bearbeiter)
        RETURNING id INTO zweiter;

        INSERT INTO stock_item_barcodes (
            company_id, item_id, code_raw, code_normalized, code_type, is_primary, created_by_user_id
        ) VALUES (firma, artikel, '4006381333931', '4006381333931', 'gtin', TRUE, bearbeiter)
        RETURNING id INTO code;

        IF (SELECT status FROM stock_item_barcodes WHERE id = code) <> 'active' THEN
            RAISE EXCEPTION 'Ein neuer Code ist nicht aktiv';
        END IF;

        -- Solange der Code aktiv ist, blockiert er denselben Code anderswo.
        BEGIN
            INSERT INTO stock_item_barcodes (
                company_id, item_id, code_raw, code_normalized, code_type, created_by_user_id
            ) VALUES (firma, zweiter, '4006381333931', '4006381333931', 'gtin', bearbeiter);
        EXCEPTION WHEN OTHERS THEN
            doppelt_geschuetzt := TRUE;
        END;
        IF NOT doppelt_geschuetzt THEN
            RAISE EXCEPTION 'Derselbe aktive Code wurde zweimal vergeben';
        END IF;

        -- An einem Code laesst sich nur der Widerruf aendern.
        BEGIN
            UPDATE stock_item_barcodes SET pack_quantity = 100 WHERE id = code;
        EXCEPTION WHEN OTHERS THEN
            aenderung_geschuetzt := TRUE;
        END;
        IF NOT aenderung_geschuetzt THEN
            RAISE EXCEPTION 'Die Gebindemenge eines Codes liess sich nachtraeglich aendern';
        END IF;

        -- Ein Widerruf ohne Grund ist keiner.
        BEGIN
            UPDATE stock_item_barcodes SET status = 'revoked' WHERE id = code;
        EXCEPTION WHEN OTHERS THEN
            widerruf_geschuetzt := TRUE;
        END;
        IF NOT widerruf_geschuetzt THEN
            RAISE EXCEPTION 'Ein Code liess sich ohne Grund widerrufen';
        END IF;

        UPDATE stock_item_barcodes
        SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP,
            revoked_by_user_id = bearbeiter, revoke_reason = 'Vertippt'
        WHERE id = code;

        -- Jetzt ist derselbe Code wieder frei — und zwar fuer einen anderen
        -- Artikel, denn genau das ist der Fall nach einem Vertipper.
        INSERT INTO stock_item_barcodes (
            company_id, item_id, code_raw, code_normalized, code_type, is_primary, created_by_user_id
        ) VALUES (firma, zweiter, '4006381333931', '4006381333931', 'gtin', TRUE, bearbeiter);

        IF (SELECT COUNT(*) FROM stock_item_barcodes
            WHERE company_id = firma AND code_normalized = '04006381333931') <> 2 THEN
            RAISE EXCEPTION 'Der widerrufene Code ist nicht mehr nachvollziehbar';
        END IF;
        IF (SELECT COUNT(*) FROM stock_item_barcodes
            WHERE company_id = firma AND code_normalized = '04006381333931'
              AND status = 'active') <> 1 THEN
            RAISE EXCEPTION 'Es gibt mehr als einen aktiven Code fuer dieselbe Nummer';
        END IF;

        -- Ein widerrufener Code wird nicht wiederbelebt.
        BEGIN
            UPDATE stock_item_barcodes
            SET status = 'active', revoked_at = NULL, revoked_by_user_id = NULL, revoke_reason = NULL
            WHERE id = code;
        EXCEPTION WHEN OTHERS THEN
            wiederbelebung_geschuetzt := TRUE;
        END;
        IF NOT wiederbelebung_geschuetzt THEN
            RAISE EXCEPTION 'Ein widerrufener Code wurde wiederbelebt';
        END IF;

        -- Der Hauptcode ist nur unter den aktiven eindeutig; der widerrufene
        -- war ebenfalls Hauptcode und darf nicht stoeren.
        IF (SELECT COUNT(*) FROM stock_item_barcodes
            WHERE company_id = firma AND item_id = zweiter AND is_primary AND status = 'active') <> 1 THEN
            RAISE EXCEPTION 'Der Hauptcode des zweiten Artikels fehlt';
        END IF;

        RAISE EXCEPTION 'ABNAHME_ZURUECK';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM <> 'ABNAHME_ZURUECK' THEN RAISE; END IF;
    END;
END;
$$;

\echo 'Migration 201_stock_barcode_lifecycle.sql ist fachlich abgenommen.'
