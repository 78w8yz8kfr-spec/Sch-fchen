\echo 'Teste Migration 151_create_datev_export_foundation.sql ...'

BEGIN;

DO $$
DECLARE
    rechte TEXT[];
BEGIN
    -- 1. Beide Tabellen stehen mit Mandantengrenze.
    IF NOT EXISTS (
        SELECT 1 FROM pg_tables
        WHERE schemaname = 'public' AND tablename = 'datev_export_settings' AND rowsecurity
    ) THEN
        RAISE EXCEPTION 'datev_export_settings fehlt oder hat keine Mandantengrenze';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_tables
        WHERE schemaname = 'public' AND tablename = 'datev_wage_type_mappings' AND rowsecurity
    ) THEN
        RAISE EXCEPTION 'datev_wage_type_mappings fehlt oder hat keine Mandantengrenze';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'datev_export_settings'
          AND policyname = 'datev_export_settings_tenant_isolation'
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'datev_wage_type_mappings'
          AND policyname = 'datev_wage_type_mappings_tenant_isolation'
    ) THEN
        RAISE EXCEPTION 'Die Mandantengrenze fehlt auf einer der DATEV-Tabellen';
    END IF;

    -- 2. Die Stammdaten duerfen aktualisiert, aber nicht geloescht werden.
    SELECT ARRAY_AGG(DISTINCT privilege_type ORDER BY privilege_type) INTO rechte
    FROM information_schema.role_table_grants
    WHERE grantee = 'schaefchen_api' AND table_name = 'datev_export_settings';
    IF rechte IS DISTINCT FROM ARRAY['INSERT', 'SELECT', 'UPDATE'] THEN
        RAISE EXCEPTION 'Die API-Rolle hat auf datev_export_settings die Rechte %', rechte;
    END IF;

    -- 3. Die Zuordnung ist reine Anfuegung: kein UPDATE, kein DELETE. Die
    --    einzige Aenderung an einer bestehenden Zeile - das Schliessen bei
    --    Abloesung - laeuft ueber den SECURITY-DEFINER-Ausloeser, nicht ueber
    --    ein Recht der Anwendungsrolle.
    SELECT ARRAY_AGG(DISTINCT privilege_type ORDER BY privilege_type) INTO rechte
    FROM information_schema.role_table_grants
    WHERE grantee = 'schaefchen_api' AND table_name = 'datev_wage_type_mappings';
    IF rechte IS DISTINCT FROM ARRAY['INSERT', 'SELECT'] THEN
        RAISE EXCEPTION 'Die API-Rolle hat auf datev_wage_type_mappings die Rechte %', rechte;
    END IF;
END;
$$;

-- Die Regeln an den Daten selbst: geprueft wird mit echten Zeilen unter der
-- Firma aus der Seed-Datei, in einer Transaktion, die am Ende zurueckgerollt
-- wird - kein Testlauf hinterlaesst Spuren fuer den naechsten.
DO $$
<<datev_test>>
DECLARE
    firma UUID;
    buero UUID;
    erste_zuordnung UUID;
    zweite_zuordnung UUID;
BEGIN
    SELECT id INTO firma FROM companies WHERE company_number = 'F-000001';
    IF firma IS NULL THEN
        RAISE NOTICE 'Keine Firma F-000001 vorhanden - die Datenprüfung entfällt.';
        RETURN;
    END IF;

    INSERT INTO users (company_id, personnel_number, first_name, last_name)
    VALUES (firma, 'DATEV-TEST-1', 'Büro', 'DATEV-Test')
    RETURNING id INTO buero;

    -- 4. Stammdaten: anlegen, aktualisieren, unveraenderliche Felder pruefen.
    INSERT INTO datev_export_settings (
        company_id, consultant_number, client_number, payroll_product, updated_by_user_id
    ) VALUES (firma, '1234567', '12345', 'lodas', buero);

    UPDATE datev_export_settings
    SET payroll_product = 'lug', updated_by_user_id = buero
    WHERE company_id = firma;

    IF NOT EXISTS (
        SELECT 1 FROM datev_export_settings
        WHERE company_id = firma AND payroll_product = 'lug' AND row_version = 2
    ) THEN
        RAISE EXCEPTION 'Die DATEV-Stammdaten wurden nicht korrekt aktualisiert oder die Version nicht erhöht';
    END IF;

    BEGIN
        INSERT INTO datev_export_settings (
            company_id, consultant_number, client_number, payroll_product
        ) VALUES (firma, 'ABCDEFG', '12345', 'lodas');
        RAISE EXCEPTION USING ERRCODE = 'ZXA01', MESSAGE = 'Eine nicht-numerische Beraternummer wurde angenommen';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO datev_export_settings (
            company_id, consultant_number, client_number, payroll_product
        ) VALUES (firma, '1234567', '12345', 'sonstwas');
        RAISE EXCEPTION USING ERRCODE = 'ZXA02', MESSAGE = 'Ein unbekanntes Lohnprodukt wurde angenommen';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;

    BEGIN
        DELETE FROM datev_export_settings WHERE company_id = firma;
        RAISE EXCEPTION USING ERRCODE = 'ZXA03', MESSAGE = 'Hartes Löschen der DATEV-Stammdaten wurde angenommen';
    EXCEPTION
        WHEN SQLSTATE 'P0001' THEN NULL;
    END;

    -- 5. Zuordnung: eine Zeitart bekommt eine Lohnart.
    INSERT INTO datev_wage_type_mappings (
        company_id, category, mapping_key, wage_type_number, changed_by_user_id, change_reason
    ) VALUES (
        firma, 'time_type', 'work', '1000', buero, 'Ersteinrichtung'
    ) RETURNING id INTO erste_zuordnung;

    IF (SELECT valid_until FROM datev_wage_type_mappings WHERE id = erste_zuordnung) IS NOT NULL THEN
        RAISE EXCEPTION 'Die neu angelegte Zuordnung ist nicht als gültig markiert';
    END IF;

    -- Die Kanzlei korrigiert die Nummer: eine neue Zeile loest die alte ab,
    -- statt sie zu ueberschreiben.
    INSERT INTO datev_wage_type_mappings (
        company_id, category, mapping_key, wage_type_number, changed_by_user_id, change_reason
    ) VALUES (
        firma, 'time_type', 'work', '1100', buero, 'Kanzlei hat Lohnart korrigiert'
    ) RETURNING id INTO zweite_zuordnung;

    IF NOT EXISTS (
        SELECT 1 FROM datev_wage_type_mappings
        WHERE id = erste_zuordnung
          AND wage_type_number = '1000'
          AND valid_until IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'Die bisherige Zuordnung wurde verändert statt abgelöst';
    END IF;
    IF (
        SELECT COUNT(*) FROM datev_wage_type_mappings
        WHERE company_id = firma AND mapping_key = 'work' AND valid_until IS NULL
    ) <> 1 THEN
        RAISE EXCEPTION 'Es gibt nicht genau eine gültige Zuordnung für "work"';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM datev_wage_type_mappings
        WHERE id = zweite_zuordnung AND wage_type_number = '1100' AND valid_until IS NULL
    ) THEN
        RAISE EXCEPTION 'Die neue Zuordnung wurde nicht als gültig übernommen';
    END IF;

    -- 6. Eine Abwesenheitsart bekommt einen Ausfallschlüssel.
    INSERT INTO datev_wage_type_mappings (
        company_id, category, mapping_key, absence_code, changed_by_user_id
    ) VALUES (firma, 'absence_type', 'sick', '03', buero);

    -- 7. Fehlerhafte Kombinationen werden abgewiesen.
    BEGIN
        INSERT INTO datev_wage_type_mappings (
            company_id, category, mapping_key, wage_type_number, changed_by_user_id
        ) VALUES (firma, 'time_type', 'vacation', '1000', buero);
        RAISE EXCEPTION USING ERRCODE = 'ZXA04',
            MESSAGE = 'Eine Zeitart mit dem Schlüssel einer Abwesenheitsart wurde angenommen';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO datev_wage_type_mappings (
            company_id, category, mapping_key, changed_by_user_id
        ) VALUES (firma, 'time_type', 'travel', buero);
        RAISE EXCEPTION USING ERRCODE = 'ZXA05',
            MESSAGE = 'Eine Zeitart ohne Lohnartennummer wurde angenommen';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO datev_wage_type_mappings (
            company_id, category, mapping_key, changed_by_user_id
        ) VALUES (firma, 'absence_type', 'vacation', buero);
        RAISE EXCEPTION USING ERRCODE = 'ZXA06',
            MESSAGE = 'Eine Abwesenheitsart ohne Ausfallschlüssel wurde angenommen';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO datev_wage_type_mappings (
            company_id, category, mapping_key, wage_type_number, changed_by_user_id
        ) VALUES (firma, 'time_type', 'overtime', 'AB12', buero);
        RAISE EXCEPTION USING ERRCODE = 'ZXA07',
            MESSAGE = 'Eine nicht-numerische Lohnartennummer wurde angenommen';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;

    -- Die Kennungen werden hier zwischengespeichert (Konfiguration lebt nur
    -- in dieser Sitzung), damit der folgende Block unter der eingeschränkten
    -- API-Rolle dieselbe Zeile anfassen kann.
    PERFORM set_config('datev_test.zweite_zuordnung', zweite_zuordnung::TEXT, FALSE);
END;
$$;

-- 8. Weder UPDATE noch DELETE gelingen unter der eingeschränkten Rolle, die
--    die Anwendung tatsächlich verwendet - nur so beweist der Test, dass die
--    fehlenden Rechte auch dort ankommen, wo es zählt, nicht nur im Katalog.
SELECT id AS tenant_id
FROM companies
WHERE company_number = 'F-000001'
\gset

SET LOCAL ROLE schaefchen_api;
SELECT set_config('app.current_company_id', :'tenant_id', TRUE);

DO $$
DECLARE
    zweite_zuordnung UUID := CURRENT_SETTING('datev_test.zweite_zuordnung')::UUID;
BEGIN
    BEGIN
        UPDATE datev_wage_type_mappings SET wage_type_number = '9999' WHERE id = zweite_zuordnung;
        RAISE EXCEPTION USING ERRCODE = 'ZXA08',
            MESSAGE = 'Eine bestehende Zuordnung liess sich direkt verändern';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;

    BEGIN
        DELETE FROM datev_wage_type_mappings WHERE id = zweite_zuordnung;
        RAISE EXCEPTION USING ERRCODE = 'ZXA09',
            MESSAGE = 'Eine Lohnart-Zuordnung liess sich löschen';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;

    IF (SELECT COUNT(*) FROM datev_wage_type_mappings) < 2 THEN
        RAISE EXCEPTION 'API-Rolle sieht nicht die eigenen Lohnart-Zuordnungen';
    END IF;

    PERFORM set_config('app.current_company_id', gen_random_uuid()::TEXT, TRUE);

    IF EXISTS (SELECT 1 FROM datev_wage_type_mappings) THEN
        RAISE EXCEPTION 'API-Rolle sieht Lohnart-Zuordnungen eines anderen Mandanten';
    END IF;
    IF EXISTS (SELECT 1 FROM datev_export_settings) THEN
        RAISE EXCEPTION 'API-Rolle sieht DATEV-Stammdaten eines anderen Mandanten';
    END IF;
END;
$$;

RESET ROLE;
ROLLBACK;

\echo 'Migration 151_create_datev_export_foundation.sql ist fachlich abgenommen.'
