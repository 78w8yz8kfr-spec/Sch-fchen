\echo 'Teste Migration 200_create_warehouse.sql ...'

DO $$
DECLARE
    firma UUID;
    bearbeiter UUID;
    gruppe UUID;
    lager UUID;
    regal UUID;
    fach UUID;
    baustelle UUID;
    artikel UUID;
    artikel_meter UUID;
    bestand NUMERIC(14,3);
    journal NUMERIC(14,3);
    tiefe_geschuetzt BOOLEAN := FALSE;
    richtung_geschuetzt BOOLEAN := FALSE;
    umlagerung_geschuetzt BOOLEAN := FALSE;
    grund_geschuetzt BOOLEAN := FALSE;
    idempotenz_geschuetzt BOOLEAN := FALSE;
    journal_geschuetzt BOOLEAN := FALSE;
    loeschung_geschuetzt BOOLEAN := FALSE;
    einheit_geschuetzt BOOLEAN := FALSE;
    unterdeckung_geschuetzt BOOLEAN := FALSE;
    mandant_geschuetzt BOOLEAN := FALSE;
    gtin_geschuetzt BOOLEAN := FALSE;
BEGIN
    BEGIN
        -- Die Bestandstabelle darf von der API nicht beschrieben werden; sie
        -- entsteht ausschliesslich aus dem Journal.
        IF has_table_privilege('schaefchen_api', 'stock_levels', 'INSERT')
           OR has_table_privilege('schaefchen_api', 'stock_levels', 'UPDATE') THEN
            RAISE EXCEPTION 'Die API darf den Bestand nicht direkt schreiben';
        END IF;
        IF NOT has_table_privilege('schaefchen_api', 'stock_movements', 'INSERT') THEN
            RAISE EXCEPTION 'Die API kann keine Lagerbuchung schreiben';
        END IF;
        IF has_table_privilege('schaefchen_api', 'stock_movements', 'UPDATE') THEN
            RAISE EXCEPTION 'Die API darf eine Lagerbuchung nicht aendern';
        END IF;

        -- GTIN-Normalisierung: EAN-8, UPC-A und EAN-13 derselben Laenge
        -- landen auf 14 Stellen, eine falsche Pruefziffer wird abgewiesen.
        IF stock_normalize_gtin('4006381333931') <> '04006381333931' THEN
            RAISE EXCEPTION 'EAN-13 wurde nicht auf GTIN-14 normalisiert';
        END IF;
        IF stock_normalize_gtin('96385074') <> '00000096385074' THEN
            RAISE EXCEPTION 'EAN-8 wurde nicht auf GTIN-14 normalisiert';
        END IF;
        IF stock_normalize_gtin('036000291452') <> '00036000291452' THEN
            RAISE EXCEPTION 'UPC-A wurde nicht auf GTIN-14 normalisiert';
        END IF;
        IF stock_normalize_gtin('4006381333930') IS NOT NULL THEN
            RAISE EXCEPTION 'Eine falsche GTIN-Pruefziffer wurde akzeptiert';
        END IF;
        IF stock_normalize_gtin('ABC-123') IS NOT NULL THEN
            RAISE EXCEPTION 'Ein Freitextcode wurde als GTIN gewertet';
        END IF;

        SELECT id INTO firma FROM companies ORDER BY company_number LIMIT 1;
        IF firma IS NULL THEN
            RAISE EXCEPTION 'Für die Lagerabnahme fehlt eine Firma';
        END IF;

        SELECT id INTO bearbeiter FROM users
        WHERE company_id = firma AND status = 'active' ORDER BY created_at LIMIT 1;
        IF bearbeiter IS NULL THEN
            INSERT INTO users (company_id, personnel_number, first_name, last_name)
            VALUES (firma, 'ABNAHME-LAG-AKTEUR', 'Lara', 'Lager')
            RETURNING id INTO bearbeiter;
        END IF;

        SELECT id INTO gruppe FROM stock_item_groups
        WHERE company_id = firma AND group_key = 'installation';
        SELECT id INTO lager FROM storage_locations
        WHERE company_id = firma AND LOWER(name) = 'materiallager';
        IF gruppe IS NULL OR lager IS NULL THEN
            RAISE EXCEPTION 'Warengruppen oder Materiallager wurden nicht angelegt';
        END IF;

        -- Drei Ebenen sind erlaubt, die vierte nicht.
        INSERT INTO storage_locations (company_id, name, location_type, parent_location_id)
        VALUES (firma, 'Regal A', 'other', lager) RETURNING id INTO regal;
        INSERT INTO storage_locations (company_id, name, location_type, parent_location_id)
        VALUES (firma, 'Fach A1', 'other', regal) RETURNING id INTO fach;
        IF (SELECT depth FROM storage_locations WHERE id = fach) <> 3 THEN
            RAISE EXCEPTION 'Die Ebenentiefe eines Lagerplatzes wird nicht berechnet';
        END IF;

        BEGIN
            INSERT INTO storage_locations (company_id, name, location_type, parent_location_id)
            VALUES (firma, 'Kiste A1a', 'other', fach);
        EXCEPTION WHEN OTHERS THEN
            tiefe_geschuetzt := TRUE;
        END;
        IF NOT tiefe_geschuetzt THEN
            RAISE EXCEPTION 'Eine vierte Lagerebene wurde zugelassen';
        END IF;

        -- Derselbe Fachname darf in einem anderen Regal erneut vorkommen.
        INSERT INTO storage_locations (company_id, name, location_type, parent_location_id)
        VALUES (firma, 'Regal B', 'other', lager);
        INSERT INTO storage_locations (company_id, name, location_type, parent_location_id)
        SELECT firma, 'Fach A1', 'other', id FROM storage_locations
        WHERE company_id = firma AND name = 'Regal B';

        INSERT INTO stock_items (
            company_id, item_number, name, group_id, unit, manufacturer,
            manufacturer_number, minimum_stock, created_by_user_id, changed_by_user_id
        ) VALUES (
            firma, ' lag-0001 ', 'Schalterdose tief', gruppe, 'Stück', 'Kaiser',
            '1055-04', 50, bearbeiter, bearbeiter
        ) RETURNING id INTO artikel;

        IF (SELECT item_number FROM stock_items WHERE id = artikel) <> 'LAG-0001' THEN
            RAISE EXCEPTION 'Die Artikelnummer wurde nicht normalisiert';
        END IF;

        -- Eigene Artikelnummer und Herstellernummer stehen nebeneinander.
        IF (SELECT manufacturer_number FROM stock_items WHERE id = artikel) <> '1055-04' THEN
            RAISE EXCEPTION 'Die Herstellernummer wurde nicht uebernommen';
        END IF;

        -- Einzelpackung und Karton sind verschiedene Codes derselben Ware.
        INSERT INTO stock_item_barcodes (
            company_id, item_id, code_raw, code_normalized, code_type,
            pack_quantity, is_primary, created_by_user_id
        ) VALUES (firma, artikel, '4006381333931', 'wird-ersetzt', 'gtin', 1, TRUE, bearbeiter);
        INSERT INTO stock_item_barcodes (
            company_id, item_id, code_raw, code_normalized, code_type,
            pack_quantity, created_by_user_id
        ) VALUES (firma, artikel, '96385074', 'wird-ersetzt', 'gtin', 100, bearbeiter);

        IF (SELECT code_normalized FROM stock_item_barcodes
            WHERE company_id = firma AND code_raw = '4006381333931') <> '04006381333931' THEN
            RAISE EXCEPTION 'Der Herstellercode wurde nicht normalisiert gespeichert';
        END IF;
        IF (SELECT pack_quantity FROM stock_item_barcodes
            WHERE company_id = firma AND code_raw = '96385074') <> 100 THEN
            RAISE EXCEPTION 'Die Gebindemenge des Kartoncodes fehlt';
        END IF;

        BEGIN
            INSERT INTO stock_item_barcodes (
                company_id, item_id, code_raw, code_normalized, code_type, created_by_user_id
            ) VALUES (firma, artikel, '4006381333930', 'wird-ersetzt', 'gtin', bearbeiter);
        EXCEPTION WHEN OTHERS THEN
            gtin_geschuetzt := TRUE;
        END;
        IF NOT gtin_geschuetzt THEN
            RAISE EXCEPTION 'Eine GTIN mit falscher Pruefziffer wurde gespeichert';
        END IF;

        -- Ein eigener Code bleibt Freitext, wird aber als GTIN gefuehrt, wenn
        -- er zufaellig eine gueltige ist.
        INSERT INTO stock_item_barcodes (
            company_id, item_id, code_raw, code_normalized, code_type, created_by_user_id
        ) VALUES (firma, artikel, 'kabel-trommel-01', 'wird-ersetzt', 'internal', bearbeiter);
        IF (SELECT code_normalized FROM stock_item_barcodes
            WHERE company_id = firma AND code_raw = 'kabel-trommel-01') <> 'KABEL-TROMMEL-01' THEN
            RAISE EXCEPTION 'Ein eigener Code wurde nicht vereinheitlicht';
        END IF;

        -- Startbestand, Zugang, Entnahme, Umlagerung.
        INSERT INTO stock_movements (
            company_id, item_id, movement_type, quantity, target_location_id,
            actor_user_id, source_type
        ) VALUES (firma, artikel, 'opening', 200, lager, bearbeiter, 'import');

        INSERT INTO stock_movements (
            company_id, item_id, movement_type, quantity, target_location_id,
            actor_user_id, client_operation_id
        ) VALUES (firma, artikel, 'receipt', 100, lager, bearbeiter, 'ABNAHME-LAG-OP-1');

        SELECT quantity INTO bestand FROM stock_levels
        WHERE company_id = firma AND item_id = artikel AND location_id = lager;
        IF bestand <> 300 THEN
            RAISE EXCEPTION 'Der Bestand nach Zugang ist % statt 300', bestand;
        END IF;

        SELECT id INTO baustelle FROM construction_sites
        WHERE company_id = firma ORDER BY created_at LIMIT 1;

        -- Die Baustelle bleibt in Fassung 1 optional: erst eine Entnahme ohne,
        -- dann eine mit Baustelle.
        INSERT INTO stock_movements (
            company_id, item_id, movement_type, quantity, source_location_id,
            actor_user_id, source_type
        ) VALUES (firma, artikel, 'issue', 30, lager, bearbeiter, 'qr_scan');

        IF baustelle IS NOT NULL THEN
            INSERT INTO stock_movements (
                company_id, item_id, movement_type, quantity, source_location_id,
                construction_site_id, actor_user_id, source_type
            ) VALUES (firma, artikel, 'issue', 20, lager, baustelle, bearbeiter, 'qr_scan');
        ELSE
            INSERT INTO stock_movements (
                company_id, item_id, movement_type, quantity, source_location_id,
                actor_user_id, source_type
            ) VALUES (firma, artikel, 'issue', 20, lager, bearbeiter, 'qr_scan');
        END IF;

        INSERT INTO stock_movements (
            company_id, item_id, movement_type, quantity,
            source_location_id, target_location_id, actor_user_id
        ) VALUES (firma, artikel, 'transfer', 50, lager, fach, bearbeiter);

        SELECT quantity INTO bestand FROM stock_levels
        WHERE company_id = firma AND item_id = artikel AND location_id = lager;
        IF bestand <> 200 THEN
            RAISE EXCEPTION 'Der Bestand im Lager ist nach Umlagerung % statt 200', bestand;
        END IF;
        SELECT quantity INTO bestand FROM stock_levels
        WHERE company_id = firma AND item_id = artikel AND location_id = fach;
        IF bestand <> 50 THEN
            RAISE EXCEPTION 'Der Bestand im Fach ist % statt 50', bestand;
        END IF;

        -- Journal und Bestand duerfen nicht auseinanderlaufen.
        SELECT COALESCE(SUM(
            CASE WHEN target_location_id IS NOT NULL THEN quantity ELSE 0 END
            - CASE WHEN source_location_id IS NOT NULL THEN quantity ELSE 0 END
        ), 0) INTO journal
        FROM stock_movements WHERE company_id = firma AND item_id = artikel;
        SELECT COALESCE(SUM(quantity), 0) INTO bestand
        FROM stock_levels WHERE company_id = firma AND item_id = artikel;
        IF journal <> bestand THEN
            RAISE EXCEPTION 'Journal (%) und Bestand (%) laufen auseinander', journal, bestand;
        END IF;

        -- Eine Entnahme darf kein Ziel haben, eine Umlagerung nicht auf sich
        -- selbst zeigen, Verschrottung und Korrektur brauchen einen Grund.
        BEGIN
            INSERT INTO stock_movements (
                company_id, item_id, movement_type, quantity,
                source_location_id, target_location_id, actor_user_id
            ) VALUES (firma, artikel, 'issue', 1, lager, fach, bearbeiter);
        EXCEPTION WHEN OTHERS THEN
            richtung_geschuetzt := TRUE;
        END;
        IF NOT richtung_geschuetzt THEN
            RAISE EXCEPTION 'Eine Entnahme mit Zielort wurde zugelassen';
        END IF;

        BEGIN
            INSERT INTO stock_movements (
                company_id, item_id, movement_type, quantity,
                source_location_id, target_location_id, actor_user_id
            ) VALUES (firma, artikel, 'transfer', 1, lager, lager, bearbeiter);
        EXCEPTION WHEN OTHERS THEN
            umlagerung_geschuetzt := TRUE;
        END;
        IF NOT umlagerung_geschuetzt THEN
            RAISE EXCEPTION 'Eine Umlagerung auf denselben Ort wurde zugelassen';
        END IF;

        BEGIN
            INSERT INTO stock_movements (
                company_id, item_id, movement_type, quantity,
                source_location_id, actor_user_id
            ) VALUES (firma, artikel, 'scrap', 1, lager, bearbeiter);
        EXCEPTION WHEN OTHERS THEN
            grund_geschuetzt := TRUE;
        END;
        IF NOT grund_geschuetzt THEN
            RAISE EXCEPTION 'Eine Verschrottung ohne Grund wurde zugelassen';
        END IF;

        -- Dieselbe Offline-Operation zaehlt nur einmal.
        BEGIN
            INSERT INTO stock_movements (
                company_id, item_id, movement_type, quantity, target_location_id,
                actor_user_id, source_type, client_operation_id
            ) VALUES (firma, artikel, 'receipt', 100, lager, bearbeiter,
                      'offline_sync', 'ABNAHME-LAG-OP-1');
        EXCEPTION WHEN OTHERS THEN
            idempotenz_geschuetzt := TRUE;
        END;
        IF NOT idempotenz_geschuetzt THEN
            RAISE EXCEPTION 'Dieselbe client_operation_id wurde zweimal gebucht';
        END IF;

        -- Buchungen sind unveraenderlich.
        BEGIN
            UPDATE stock_movements SET quantity = 1
            WHERE company_id = firma AND item_id = artikel;
        EXCEPTION WHEN OTHERS THEN
            journal_geschuetzt := TRUE;
        END;
        IF NOT journal_geschuetzt THEN
            RAISE EXCEPTION 'Eine Lagerbuchung liess sich aendern';
        END IF;

        -- Unterdeckung ist ohne Firmenregel erlaubt und wird sichtbar.
        INSERT INTO stock_movements (
            company_id, item_id, movement_type, quantity, source_location_id,
            actor_user_id, source_type
        ) VALUES (firma, artikel, 'issue', 500, fach, bearbeiter, 'qr_scan');
        SELECT quantity INTO bestand FROM stock_levels
        WHERE company_id = firma AND item_id = artikel AND location_id = fach;
        IF bestand >= 0 THEN
            RAISE EXCEPTION 'Eine Entnahme ueber den Bestand hinaus wurde nicht gebucht';
        END IF;

        -- Mit Firmenregel wird dieselbe Buchung abgewiesen.
        UPDATE stock_settings SET block_negative_stock = TRUE WHERE company_id = firma;
        BEGIN
            INSERT INTO stock_movements (
                company_id, item_id, movement_type, quantity, source_location_id,
                actor_user_id, source_type
            ) VALUES (firma, artikel, 'issue', 500, fach, bearbeiter, 'qr_scan');
        EXCEPTION WHEN OTHERS THEN
            unterdeckung_geschuetzt := TRUE;
        END;
        IF NOT unterdeckung_geschuetzt THEN
            RAISE EXCEPTION 'Die Sperre gegen negative Bestaende wirkt nicht';
        END IF;
        UPDATE stock_settings SET block_negative_stock = FALSE WHERE company_id = firma;

        -- Die Einheit eines gebuchten Artikels ist unveraenderlich.
        BEGIN
            UPDATE stock_items SET unit = 'Meter', changed_by_user_id = bearbeiter
            WHERE id = artikel;
        EXCEPTION WHEN OTHERS THEN
            einheit_geschuetzt := TRUE;
        END;
        IF NOT einheit_geschuetzt THEN
            RAISE EXCEPTION 'Die Einheit eines gebuchten Artikels liess sich wechseln';
        END IF;

        -- Ein noch nicht gebuchter Artikel darf seine Einheit dagegen aendern.
        INSERT INTO stock_items (
            company_id, item_number, name, group_id, unit,
            created_by_user_id, changed_by_user_id
        ) VALUES (firma, 'LAG-0002', 'NYM-J 3x1,5', gruppe, 'Rolle', bearbeiter, bearbeiter)
        RETURNING id INTO artikel_meter;
        UPDATE stock_items SET unit = 'Meter', changed_by_user_id = bearbeiter
        WHERE id = artikel_meter;
        IF (SELECT row_version FROM stock_items WHERE id = artikel_meter) <> 2 THEN
            RAISE EXCEPTION 'Die Zeilenversion des Artikels wurde nicht erhoeht';
        END IF;

        -- Stammdaten werden nicht hart geloescht.
        BEGIN
            DELETE FROM stock_items WHERE id = artikel_meter;
        EXCEPTION WHEN OTHERS THEN
            loeschung_geschuetzt := TRUE;
        END;
        IF NOT loeschung_geschuetzt THEN
            RAISE EXCEPTION 'Ein Artikel liess sich hart loeschen';
        END IF;

        RAISE EXCEPTION 'ABNAHME_ZURUECK';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM <> 'ABNAHME_ZURUECK' THEN RAISE; END IF;
    END;

    -- Ein fremder Mandant kann weder Ort noch Artikel des anderen verwenden.
    BEGIN
        DECLARE
            fremde UUID;
            fremder_nutzer UUID;
            fremde_gruppe UUID;
            eigene UUID;
            eigenes_lager UUID;
            eigener_nutzer UUID;
        BEGIN
            SELECT id INTO eigene FROM companies ORDER BY company_number LIMIT 1;
            SELECT id INTO eigenes_lager FROM storage_locations
            WHERE company_id = eigene AND LOWER(name) = 'materiallager';

            INSERT INTO companies (company_number, legal_name, display_name)
            VALUES ('F-999200', 'Fremde Lagerfirma GmbH', 'Fremde Lagerfirma')
            RETURNING id INTO fremde;

            -- Die neue Firma bekommt Warengruppen, Lager und Einstellungen
            -- ohne Zutun. Das Modul selbst bekommt sie seit Migration 202
            -- nicht mehr von allein: die Plattform schaltet es je Firma frei.
            IF (SELECT COUNT(*) FROM stock_item_groups WHERE company_id = fremde) < 9 THEN
                RAISE EXCEPTION 'Eine neue Firma bekommt nicht alle Warengruppen';
            END IF;
            IF NOT EXISTS (
                SELECT 1 FROM storage_locations
                WHERE company_id = fremde AND LOWER(name) = 'materiallager'
            ) THEN
                RAISE EXCEPTION 'Eine neue Firma bekommt kein Materiallager';
            END IF;
            IF NOT EXISTS (
                SELECT 1 FROM stock_settings
                WHERE company_id = fremde AND default_location_id IS NOT NULL
            ) THEN
                RAISE EXCEPTION 'Eine neue Firma bekommt keine Lagereinstellungen';
            END IF;
            IF EXISTS (
                SELECT 1 FROM company_module_entitlements AS recht
                JOIN module_catalog AS modul ON modul.id = recht.module_id
                WHERE recht.company_id = fremde AND modul.module_key = 'materials'
                  AND recht.entitlement_status <> 'inactive'
            ) THEN
                RAISE EXCEPTION 'Eine neue Firma bekommt die Lagerverwaltung von selbst';
            END IF;
            -- Die Grundausstattung steht trotzdem bereit, damit die Freigabe
            -- spaeter nur ein Schalter ist und keine Einrichtung.
            IF NOT EXISTS (
                SELECT 1 FROM module_catalog WHERE module_key = 'materials'
            ) THEN
                RAISE EXCEPTION 'Der Modulschluessel materials fehlt im Katalog';
            END IF;

            INSERT INTO users (company_id, personnel_number, first_name, last_name)
            VALUES (fremde, 'ABNAHME-LAG-FREMD', 'Frida', 'Fremd')
            RETURNING id INTO fremder_nutzer;
            SELECT id INTO fremde_gruppe FROM stock_item_groups
            WHERE company_id = fremde AND group_key = 'other';

            BEGIN
                INSERT INTO stock_items (
                    company_id, item_number, name, group_id, unit,
                    default_location_id, created_by_user_id, changed_by_user_id
                ) VALUES (
                    fremde, 'LAG-FREMD', 'Fremder Artikel', fremde_gruppe, 'Stück',
                    eigenes_lager, fremder_nutzer, fremder_nutzer
                );
            EXCEPTION WHEN OTHERS THEN
                mandant_geschuetzt := TRUE;
            END;
            IF NOT mandant_geschuetzt THEN
                RAISE EXCEPTION 'Ein fremder Mandant konnte einen Lagerplatz mitbenutzen';
            END IF;

            SELECT id INTO eigener_nutzer FROM users
            WHERE company_id = eigene ORDER BY created_at LIMIT 1;
            IF eigener_nutzer IS NOT NULL THEN
                mandant_geschuetzt := FALSE;
                BEGIN
                    INSERT INTO stock_items (
                        company_id, item_number, name, group_id, unit,
                        created_by_user_id, changed_by_user_id
                    ) VALUES (
                        fremde, 'LAG-FREMD-2', 'Fremder Artikel', fremde_gruppe, 'Stück',
                        eigener_nutzer, eigener_nutzer
                    );
                EXCEPTION WHEN OTHERS THEN
                    mandant_geschuetzt := TRUE;
                END;
                IF NOT mandant_geschuetzt THEN
                    RAISE EXCEPTION 'Ein fremder Mitarbeiter konnte einen Artikel anlegen';
                END IF;
            END IF;

            RAISE EXCEPTION 'ABNAHME_ZURUECK';
        END;
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM <> 'ABNAHME_ZURUECK' THEN RAISE; END IF;
    END;
END;
$$;

\echo 'Migration 200_create_warehouse.sql ist fachlich abgenommen.'
