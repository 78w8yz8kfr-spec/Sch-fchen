\echo 'Teste Migration 095_create_devices.sql ...'

DO $$
DECLARE
    firma UUID;
    andere UUID;
    bearbeiter UUID;
    fremder UUID;
    kategorie UUID;
    lager UUID;
    geraet UUID;
    zuordnung UUID;
    token UUID;
    version_vorher BIGINT;
    zuordnung_geschuetzt BOOLEAN := FALSE;
    historie_geschuetzt BOOLEAN := FALSE;
    loeschung_geschuetzt BOOLEAN := FALSE;
BEGIN
    BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_index AS idx
            JOIN pg_class AS relation ON relation.oid = idx.indrelid
            JOIN pg_attribute AS company_column
              ON company_column.attrelid = relation.oid
             AND company_column.attname = 'company_id'
             AND company_column.attnum = ANY(idx.indkey)
            JOIN pg_attribute AS id_column
              ON id_column.attrelid = relation.oid
             AND id_column.attname = 'id'
             AND id_column.attnum = ANY(idx.indkey)
            WHERE relation.relname = 'vehicles'
              AND idx.indisunique
              AND idx.indpred IS NULL
        ) THEN
            RAISE EXCEPTION 'Fahrzeuge besitzen keinen mandantensicheren eindeutigen Schluessel';
        END IF;

        SELECT id INTO firma FROM companies ORDER BY company_number LIMIT 1;
        IF firma IS NULL THEN
            RAISE EXCEPTION 'Für die Geräteabnahme fehlt eine Firma';
        END IF;

        SELECT id INTO bearbeiter FROM users
        WHERE company_id = firma AND status = 'active' ORDER BY created_at LIMIT 1;
        IF bearbeiter IS NULL THEN
            INSERT INTO users (company_id, personnel_number, first_name, last_name)
            VALUES (firma, 'ABNAHME-GER-AKTEUR', 'Gerda', 'Gerät')
            RETURNING id INTO bearbeiter;
        END IF;

        SELECT id INTO kategorie FROM device_categories
        WHERE company_id = firma AND category_key = 'power_tools';
        SELECT id INTO lager FROM device_locations
        WHERE company_id = firma AND LOWER(name) = 'hauptlager';
        IF kategorie IS NULL OR lager IS NULL THEN
            RAISE EXCEPTION 'Kategorien oder Hauptlager wurden nicht angelegt';
        END IF;

        INSERT INTO devices (
            company_id, inventory_number, name, category_id, serial_number,
            current_location_id, last_known_location_id, created_by_user_id
        ) VALUES (
            firma, ' m-0042 ', 'Bosch Bohrhammer', kategorie, 'ABNAHME-SN-0042',
            lager, lager, bearbeiter
        ) RETURNING id, row_version INTO geraet, version_vorher;

        IF (SELECT inventory_number FROM devices WHERE id = geraet) <> 'M-0042' THEN
            RAISE EXCEPTION 'Die Inventarnummer wurde nicht normalisiert';
        END IF;

        INSERT INTO device_qr_tokens (company_id, device_id, created_by_user_id)
        VALUES (firma, geraet, bearbeiter)
        RETURNING public_token INTO token;
        IF token::TEXT = 'M-0042' OR token IS NULL THEN
            RAISE EXCEPTION 'Der QR-Code enthält keine sichere zufällige Kennung';
        END IF;

        -- Ein Neudruck liest denselben aktiven Token. Erst eine ausdrückliche
        -- Rotation widerruft ihn; dabei entsteht kein zweites Gerät.
        IF (SELECT COUNT(*) FROM device_qr_tokens
            WHERE company_id = firma AND device_id = geraet AND is_active) <> 1 THEN
            RAISE EXCEPTION 'Ein Gerät hat nicht genau einen aktiven QR-Code';
        END IF;
        UPDATE device_qr_tokens
        SET is_active = FALSE, revoked_by_user_id = bearbeiter,
            revoked_at = CURRENT_TIMESTAMP, revoke_reason = 'Etikett beschädigt'
        WHERE company_id = firma AND device_id = geraet AND is_active;
        INSERT INTO device_qr_tokens (
            company_id, device_id, generation, created_by_user_id
        ) VALUES (firma, geraet, 2, bearbeiter);
        IF (SELECT COUNT(*) FROM devices WHERE id = geraet) <> 1 THEN
            RAISE EXCEPTION 'Die QR-Neuausgabe hat den Gerätestammsatz vervielfacht';
        END IF;

        INSERT INTO device_assignments (
            company_id, device_id, assignment_type, user_id, source, created_by_user_id
        ) VALUES (firma, geraet, 'fixed', bearbeiter, 'administration', bearbeiter);
        INSERT INTO device_assignments (
            company_id, device_id, assignment_type, user_id, source, created_by_user_id
        ) VALUES (firma, geraet, 'custody', bearbeiter, 'administration', bearbeiter)
        RETURNING id INTO zuordnung;

        BEGIN
            INSERT INTO device_assignments (
                company_id, device_id, assignment_type, user_id, source, created_by_user_id
            ) VALUES (firma, geraet, 'custody', bearbeiter, 'qr_scan', bearbeiter);
            RAISE EXCEPTION 'Zwei aktive Besitzer wurden gleichzeitig angenommen';
        EXCEPTION WHEN unique_violation THEN
            NULL;
        END;

        UPDATE device_assignments
        SET ended_at = CURRENT_TIMESTAMP, ended_by_user_id = bearbeiter,
            end_reason = 'Rückgabe in der Abnahme'
        WHERE id = zuordnung;
        BEGIN
            UPDATE device_assignments SET end_reason = 'nachträglich manipuliert'
            WHERE id = zuordnung;
        EXCEPTION WHEN raise_exception THEN
            zuordnung_geschuetzt := TRUE;
        END;
        IF NOT zuordnung_geschuetzt THEN
            RAISE EXCEPTION 'Eine beendete Zuordnung ließ sich manipulieren';
        END IF;

        SELECT id INTO andere FROM companies WHERE id <> firma ORDER BY company_number LIMIT 1;
        IF andere IS NULL THEN
            INSERT INTO companies (company_number, legal_name, display_name)
            VALUES ('F-999095', 'Fremdgeräte Abnahme GmbH', 'Fremdgeräte Abnahme')
            RETURNING id INTO andere;
        END IF;
        SELECT id INTO fremder FROM users
        WHERE company_id = andere AND status = 'active' ORDER BY created_at LIMIT 1;
        IF fremder IS NULL THEN
            INSERT INTO users (company_id, personnel_number, first_name, last_name)
            VALUES (andere, 'ABNAHME-GER-FREMD', 'Fremder', 'Mitarbeiter')
            RETURNING id INTO fremder;
        END IF;
        BEGIN
            INSERT INTO device_assignments (
                company_id, device_id, assignment_type, user_id, source, created_by_user_id
            ) VALUES (firma, geraet, 'custody', fremder, 'qr_scan', bearbeiter);
            RAISE EXCEPTION 'Ein Mitarbeiter eines anderen Mandanten wurde zugeordnet';
        EXCEPTION WHEN foreign_key_violation THEN
            NULL;
        END;

        -- Stammdaten besitzen eine optimistische Zeilenversion.
        SELECT row_version INTO version_vorher FROM devices WHERE id = geraet;
        UPDATE devices SET note = 'Abnahme geändert' WHERE id = geraet;
        IF (SELECT row_version FROM devices WHERE id = geraet) <> version_vorher + 1 THEN
            RAISE EXCEPTION 'Die Geräte-Zeilenversion zählt nicht hoch';
        END IF;

        INSERT INTO device_history (
            company_id, device_id, action, actor_user_id, old_state, new_state, reason
        ) VALUES (
            firma, geraet, 'device_tested', bearbeiter,
            '{"status":"available"}', '{"status":"available"}', 'Abnahme'
        );
        BEGIN
            UPDATE device_history SET reason = 'manipuliert'
            WHERE company_id = firma AND device_id = geraet;
        EXCEPTION WHEN raise_exception THEN
            historie_geschuetzt := TRUE;
        END;
        IF NOT historie_geschuetzt THEN
            RAISE EXCEPTION 'Die Gerätehistorie ließ sich verändern';
        END IF;

        UPDATE devices
        SET status = 'retired', retired_reason = 'Verschleiß in der Abnahme'
        WHERE id = geraet;
        IF (SELECT retired_at IS NULL FROM devices WHERE id = geraet) THEN
            RAISE EXCEPTION 'Die Ausmusterung besitzt keinen Zeitpunkt';
        END IF;
        BEGIN
            DELETE FROM devices WHERE id = geraet;
        EXCEPTION WHEN raise_exception THEN
            loeschung_geschuetzt := TRUE;
        END;
        IF NOT loeschung_geschuetzt THEN
            RAISE EXCEPTION 'Ein Gerät wurde hart gelöscht';
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

DO $$
DECLARE
    tabelle TEXT;
BEGIN
    IF NOT ('devices' = ANY(platform_default_module_keys())) THEN
        RAISE EXCEPTION 'Maschinen & Geräte fehlt im Standardumfang';
    END IF;
    IF EXISTS (
        SELECT 1 FROM companies AS firma
        WHERE NOT EXISTS (
            SELECT 1 FROM company_module_entitlements AS recht
            JOIN module_catalog AS modul ON modul.id = recht.module_id
            WHERE recht.company_id = firma.id AND modul.module_key = 'devices'
              AND recht.entitlement_status = 'permanent'
        )
    ) THEN
        RAISE EXCEPTION 'Eine bestehende Firma hat das Gerätemodul nicht erhalten';
    END IF;

    FOREACH tabelle IN ARRAY ARRAY[
        'device_categories', 'device_locations', 'device_sets', 'devices',
        'device_battery_profiles', 'device_set_items', 'device_assignments',
        'device_qr_tokens', 'device_transfers', 'device_defects',
        'device_inspections', 'device_images', 'device_notifications',
        'device_inventory_sessions', 'device_inventory_expected',
        'device_inventory_scans', 'device_settings', 'device_history'
    ] LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_class WHERE oid = tabelle::REGCLASS AND relrowsecurity
        ) THEN
            RAISE EXCEPTION 'Für % fehlt Row-Level-Security', tabelle;
        END IF;
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE tablename = tabelle AND policyname = tabelle || '_tenant_isolation'
        ) THEN
            RAISE EXCEPTION 'Für % fehlt die Mandantenrichtlinie', tabelle;
        END IF;
    END LOOP;

    IF EXISTS (
        SELECT 1 FROM information_schema.role_table_grants
        WHERE table_name LIKE 'device%'
          AND grantee = 'schaefchen_api' AND privilege_type = 'DELETE'
    ) THEN
        RAISE EXCEPTION 'Die API darf Gerätedaten hart löschen';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.role_table_grants
        WHERE table_name = 'devices' AND grantee = 'schaefchen_api'
          AND privilege_type = 'SELECT'
    ) THEN
        RAISE EXCEPTION 'Die API darf den Gerätebestand nicht lesen';
    END IF;
END;
$$;

-- Auch eine künftig angelegte Firma bekommt Modul, Kategorien, Lager und
-- Einstellungen in derselben Transaktion.
DO $$
DECLARE
    neue UUID;
BEGIN
    BEGIN
        INSERT INTO companies (company_number, legal_name, display_name)
        VALUES ('F-999096', 'Neue Gerätefirma GmbH', 'Neue Gerätefirma')
        RETURNING id INTO neue;
        IF (SELECT COUNT(*) FROM device_categories WHERE company_id = neue) < 10 THEN
            RAISE EXCEPTION 'Eine neue Firma bekommt nicht alle Gerätekategorien';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM device_settings WHERE company_id = neue) THEN
            RAISE EXCEPTION 'Eine neue Firma bekommt keine Geräteeinstellungen';
        END IF;
        IF NOT EXISTS (
            SELECT 1 FROM company_module_entitlements AS recht
            JOIN module_catalog AS modul ON modul.id = recht.module_id
            WHERE recht.company_id = neue AND modul.module_key = 'devices'
        ) THEN
            RAISE EXCEPTION 'Eine neue Firma bekommt das Gerätemodul nicht';
        END IF;
        RAISE EXCEPTION 'ABNAHME_ZURUECK';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM <> 'ABNAHME_ZURUECK' THEN RAISE; END IF;
    END;
END;
$$;

\echo 'Migration 095_create_devices.sql ist fachlich abgenommen.'
