\echo 'Teste Migration 116_release_version_0_44_16.sql ...'

DO $$
DECLARE
    produktionsstaende INTEGER;
    stand VARCHAR(30);
    vorgaenger VARCHAR(30);
    migrationen JSONB;
BEGIN
    SELECT COUNT(*) INTO produktionsstaende
    FROM application_versions
    WHERE release_status = 'production';
    IF produktionsstaende <> 1 THEN
        RAISE EXCEPTION 'Es muss genau eine Produktionsfassung geben, gefunden: %', produktionsstaende;
    END IF;

    SELECT release_status, database_migrations
      INTO stand, migrationen
    FROM application_versions WHERE version = '0.44.16';
    IF stand IS NULL OR stand NOT IN ('production', 'superseded') THEN
        RAISE EXCEPTION 'Die Fassung 0.44.16 fehlt oder besitzt einen ungültigen Status';
    END IF;
    IF NOT migrationen @> '["116"]'::JSONB THEN
        RAISE EXCEPTION 'Die Fassung 0.44.16 nennt Migration 116 nicht';
    END IF;

    SELECT release_status INTO vorgaenger
    FROM application_versions WHERE version = '0.44.15';
    IF vorgaenger IS DISTINCT FROM 'superseded' THEN
        RAISE EXCEPTION 'Die Vorgängerfassung 0.44.15 wurde nicht korrekt abgelöst';
    END IF;

    -- Nicht verpflichtend: wer noch die alte Fassung hat, bucht weiterhin
    -- Entnahmen mit Baustelle und Rückgaben ohne. Falsch wird davon nichts,
    -- es fehlt nur die Angabe.
    IF EXISTS (
        SELECT 1 FROM application_versions
        WHERE version = '0.44.16' AND mandatory_update = TRUE
    ) THEN
        RAISE EXCEPTION 'Die Fassung 0.44.16 ist als Pflichtupdate eingetragen';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM application_versions
        WHERE version = '0.44.16' AND rollout_percent = 100
    ) THEN
        RAISE EXCEPTION 'Die Fassung 0.44.16 ist nicht vollständig ausgerollt';
    END IF;

    -- Nur der Fassungseintrag: die Spalte für die Baustelle steht seit 107.
    IF (SELECT jsonb_array_length(migrationen)) <> 1 THEN
        RAISE EXCEPTION 'Die Fassung 0.44.16 nennt mehr Migrationen, als sie mitbringt';
    END IF;
END;
$$;

-- Die Buchung in beide Richtungen ist keine Absichtserklärung, sondern muss
-- durch die Bedingungen der Tabelle passen: eine Entnahme mit Baustelle hat
-- nur eine Quelle, eine Rückgabe mit derselben Baustelle nur ein Ziel.
DO $$
DECLARE
    firma UUID;
    projekt UUID;
    kunde UUID;
    baustelle UUID;
    ort UUID;
    gruppe UUID;
    artikel UUID;
    nutzer UUID;
    verbraucht NUMERIC;
BEGIN
    INSERT INTO companies (company_number, legal_name, display_name)
    VALUES ('F-116TST', 'Baustellenbuchung Test GmbH', 'Baustellenbuchung')
    RETURNING id INTO firma;

    INSERT INTO users (company_id, personnel_number, first_name, last_name)
    VALUES (firma, 'M-116', 'Test', 'Monteur') RETURNING id INTO nutzer;

    INSERT INTO customers (company_id, customer_type, company_name, status)
    VALUES (firma, 'company', 'Testkunde', 'active') RETURNING id INTO kunde;
    INSERT INTO projects (company_id, customer_id, name, status)
    VALUES (firma, kunde, 'Testprojekt', 'active') RETURNING id INTO projekt;
    INSERT INTO construction_sites (company_id, project_id, name, status)
    VALUES (firma, projekt, 'Testbaustelle', 'active') RETURNING id INTO baustelle;

    SELECT id INTO ort FROM storage_locations
    WHERE company_id = firma AND location_type = 'warehouse' LIMIT 1;
    SELECT id INTO gruppe FROM stock_item_groups
    WHERE company_id = firma AND group_key = 'cable';

    INSERT INTO stock_items (
        company_id, item_number, name, group_id, unit,
        created_by_user_id, changed_by_user_id
    )
    VALUES (firma, 'TST-116', 'Mantelleitung', gruppe, 'Meter', nutzer, nutzer)
    RETURNING id INTO artikel;

    INSERT INTO stock_movements (
        company_id, item_id, movement_type, quantity, target_location_id, actor_user_id
    ) VALUES (firma, artikel, 'opening', 100, ort, nutzer);

    INSERT INTO stock_movements (
        company_id, item_id, movement_type, quantity,
        source_location_id, construction_site_id, actor_user_id
    ) VALUES (firma, artikel, 'issue', 12, ort, baustelle, nutzer);

    INSERT INTO stock_movements (
        company_id, item_id, movement_type, quantity,
        target_location_id, construction_site_id, actor_user_id
    ) VALUES (firma, artikel, 'return', 8, ort, baustelle, nutzer);

    SELECT SUM(CASE WHEN movement_type = 'issue' THEN quantity ELSE -quantity END)
      INTO verbraucht
    FROM stock_movements
    WHERE company_id = firma AND construction_site_id = baustelle;
    IF verbraucht <> 4 THEN
        RAISE EXCEPTION 'Auf der Baustelle müssten vier Meter geblieben sein, gerechnet: %', verbraucht;
    END IF;

    IF (SELECT quantity FROM stock_levels
        WHERE company_id = firma AND item_id = artikel AND location_id = ort) <> 96 THEN
        RAISE EXCEPTION 'Der Lagerbestand nach Entnahme und Rückgabe stimmt nicht';
    END IF;

    RAISE EXCEPTION 'ABNAHME-116-ZURUECKGEROLLT';
EXCEPTION
    WHEN OTHERS THEN
        IF SQLERRM <> 'ABNAHME-116-ZURUECKGEROLLT' THEN
            RAISE;
        END IF;
END;
$$;

\echo 'Migration 116_release_version_0_44_16.sql ist fachlich abgenommen.'
