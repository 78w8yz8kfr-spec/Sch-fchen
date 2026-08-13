\echo 'Teste Migration 143_create_power_distributors.sql ...'

DO $$
DECLARE
    fehlend INTEGER;
    rechte TEXT[];
BEGIN
    -- 1. Beide Aufzeichnungen stehen.
    SELECT COUNT(*) INTO fehlend
    FROM (VALUES ('power_rcd_tests'), ('power_meter_readings')) AS soll (name)
    WHERE NOT EXISTS (
        SELECT 1 FROM pg_tables
        WHERE schemaname = 'public' AND tablename = soll.name
    );
    IF fehlend <> 0 THEN
        RAISE EXCEPTION 'Es fehlen % Tabellen für den Baustrom', fehlend;
    END IF;

    -- 2. Jede Firma, die es gibt, hat die Kategorie. Ohne sie ist ein
    --    Verteiler nicht von einem Bohrhammer zu unterscheiden.
    SELECT COUNT(*) INTO fehlend
    FROM companies c
    WHERE NOT EXISTS (
        SELECT 1 FROM device_categories k
        WHERE k.company_id = c.id AND k.category_key = 'power_distributors'
    );
    IF fehlend <> 0 THEN
        RAISE EXCEPTION '% Firmen haben keine Kategorie Baustromverteiler', fehlend;
    END IF;

    -- 3. Und jede Firma, die noch kommt, bekommt sie auch. Geprueft am
    --    Quelltext der Anlagefunktion: eine Probefirma liesse sich hinterher
    --    nicht mehr loeschen.
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc
        WHERE proname = 'seed_device_master_data'
          AND pronamespace = 'public'::regnamespace
          AND prosrc LIKE '%power_distributors%'
    ) THEN
        RAISE EXCEPTION 'Neue Firmen bekommen keine Kategorie Baustromverteiler';
    END IF;

    -- Diese Migration schreibt die Anlagefunktion neu, um eine Kategorie zu
    -- ergaenzen. Dabei muss ihr uebriger Rumpf mitkommen - beim ersten Anlauf
    -- fiel die Voreinstellung des Lagerorts still heraus. Hier steht deshalb
    -- namentlich, was ausser der neuen Kategorie darin bleiben muss.
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc
        WHERE proname = 'seed_device_master_data'
          AND pronamespace = 'public'::regnamespace
          AND prosrc LIKE '%device_settings%'
          AND prosrc LIKE '%device_locations%'
    ) THEN
        RAISE EXCEPTION 'Die Anlagefunktion hat beim Erweitern Teile verloren';
    END IF;

    -- 4. Der FI-Test steht getrennt von der Pruefung. Waere er eine Zeile in
    --    device_inspections, verschoebe der monatliche Tastendruck den
    --    vierteljaehrlichen Termin der Fachkraft - genau das darf er nicht.
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'device_inspections' AND column_name LIKE '%rcd%'
    ) THEN
        RAISE EXCEPTION 'Der FI-Test hängt an den Prüfungen statt daneben';
    END IF;

    -- 5. Aufzeichnungen werden geschrieben und gelesen, nie geaendert. Ein
    --    UPDATE-Recht waere die stille Tuer, durch die eine Ablesung
    --    nachtraeglich passend gemacht wird.
    SELECT ARRAY_AGG(DISTINCT privilege_type ORDER BY privilege_type) INTO rechte
    FROM information_schema.role_table_grants
    WHERE grantee = 'schaefchen_api'
      AND table_name IN ('power_rcd_tests', 'power_meter_readings');
    IF rechte IS DISTINCT FROM ARRAY['INSERT', 'SELECT'] THEN
        RAISE EXCEPTION 'Die API-Rolle hat auf den Baustrom-Tabellen die Rechte %', rechte;
    END IF;

    -- 6. Die Mandantengrenze steht auf beiden Tabellen.
    SELECT COUNT(*) INTO fehlend
    FROM (VALUES ('power_rcd_tests'), ('power_meter_readings')) AS soll (name)
    WHERE NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = soll.name
          AND policyname = soll.name || '_tenant_isolation'
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_tables
        WHERE schemaname = 'public' AND tablename = soll.name AND rowsecurity
    );
    IF fehlend <> 0 THEN
        RAISE EXCEPTION 'Auf % Baustrom-Tabellen fehlt die Mandantengrenze', fehlend;
    END IF;
END;
$$;

-- Die Regeln an den Daten selbst: geprueft wird mit echten Zeilen, weil eine
-- Bedingung, die nur im Katalog steht, noch nichts abgewiesen hat.
DO $$
DECLARE
    firma UUID;
    person UUID;
    verteiler UUID;
BEGIN
    SELECT id INTO firma FROM companies ORDER BY created_at LIMIT 1;
    IF firma IS NULL THEN
        RAISE NOTICE 'Keine Firma vorhanden - die Datenprüfung entfällt.';
        RETURN;
    END IF;

    SELECT id INTO person FROM users WHERE company_id = firma LIMIT 1;
    SELECT id INTO verteiler FROM devices WHERE company_id = firma LIMIT 1;
    IF person IS NULL OR verteiler IS NULL THEN
        RAISE NOTICE 'Keine Beispieldaten vorhanden - die Datenprüfung entfällt.';
        RETURN;
    END IF;

    BEGIN
        INSERT INTO power_rcd_tests (company_id, device_id, tested_on, tested_by_user_id, result)
        VALUES (firma, verteiler, CURRENT_DATE, person, 'vielleicht');
        RAISE EXCEPTION 'Ein FI-Test mit erfundenem Ergebnis wurde angenommen';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO power_rcd_tests (company_id, device_id, tested_on, tested_by_user_id, result)
        VALUES (firma, verteiler, CURRENT_DATE + 30, person, 'passed');
        RAISE EXCEPTION 'Ein FI-Test aus der Zukunft wurde angenommen';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO power_meter_readings (
            company_id, device_id, read_on, reading_kwh, reason, read_by_user_id
        ) VALUES (firma, verteiler, CURRENT_DATE, -1, 'interim', person);
        RAISE EXCEPTION 'Ein negativer Zählerstand wurde angenommen';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO power_meter_readings (
            company_id, device_id, read_on, reading_kwh, reason, read_by_user_id
        ) VALUES (firma, verteiler, CURRENT_DATE, 100, 'irgendwann', person);
        RAISE EXCEPTION 'Eine Ablesung ohne gültigen Anlass wurde angenommen';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
END;
$$;

\echo 'Migration 143_create_power_distributors.sql ist fachlich abgenommen.'
