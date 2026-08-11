\echo 'Teste Migration 126_movement_reversal_guard.sql ...'

DO $$
DECLARE
    firma UUID;
    nutzer UUID;
    lager UUID;
    gruppe UUID;
    artikel UUID;
    buchung UUID;
BEGIN
    INSERT INTO companies (company_number, legal_name, display_name)
    VALUES ('F-126TST', 'Storno Test GmbH', 'Storno') RETURNING id INTO firma;
    INSERT INTO users (company_id, personnel_number, first_name, last_name)
    VALUES (firma, 'M-126', 'Test', 'Monteur') RETURNING id INTO nutzer;

    SELECT id INTO lager FROM storage_locations
    WHERE company_id = firma AND location_type = 'warehouse' LIMIT 1;
    SELECT id INTO gruppe FROM stock_item_groups
    WHERE company_id = firma AND group_key = 'cable';
    INSERT INTO stock_items (
        company_id, item_number, name, group_id, unit, created_by_user_id, changed_by_user_id
    )
    VALUES (firma, 'TST-126', 'Kabeltrommel', gruppe, 'Meter', nutzer, nutzer)
    RETURNING id INTO artikel;

    INSERT INTO stock_movements (
        company_id, item_id, movement_type, quantity, target_location_id, actor_user_id
    ) VALUES (firma, artikel, 'receipt', 300, lager, nutzer);

    INSERT INTO stock_movements (
        company_id, item_id, movement_type, quantity, source_location_id, actor_user_id
    ) VALUES (firma, artikel, 'issue', 100, lager, nutzer) RETURNING id INTO buchung;

    -- Die Gegenbuchung stellt den Bestand wieder her, ohne die Fehlbuchung zu
    -- löschen: beide stehen im Journal.
    INSERT INTO stock_movements (
        company_id, item_id, movement_type, quantity, target_location_id,
        reverses_movement_id, actor_user_id, reason
    ) VALUES (firma, artikel, 'correction', 100, lager, buchung, nutzer, 'Vertippt');

    IF (SELECT quantity FROM stock_levels
        WHERE company_id = firma AND item_id = artikel AND location_id = lager) <> 300 THEN
        RAISE EXCEPTION 'Die Gegenbuchung hat den Bestand nicht wiederhergestellt';
    END IF;
    IF (SELECT COUNT(*) FROM stock_movements
        WHERE company_id = firma AND item_id = artikel) <> 3 THEN
        RAISE EXCEPTION 'Es müssen alle drei Buchungen im Journal stehen';
    END IF;

    -- Und ein zweites Mal geht nicht: aus einem Vertipper würde sonst eine
    -- Buchungsschleife.
    BEGIN
        INSERT INTO stock_movements (
            company_id, item_id, movement_type, quantity, target_location_id,
            reverses_movement_id, actor_user_id, reason
        ) VALUES (firma, artikel, 'correction', 100, lager, buchung, nutzer, 'Nochmal');
        RAISE EXCEPTION 'Dieselbe Buchung wurde zweimal storniert';
    EXCEPTION
        WHEN unique_violation THEN NULL;
    END;

    RAISE EXCEPTION 'ABNAHME-126-ZURUECKGEROLLT';
EXCEPTION
    WHEN OTHERS THEN
        IF SQLERRM <> 'ABNAHME-126-ZURUECKGEROLLT' THEN
            RAISE;
        END IF;
END;
$$;

\echo 'Migration 126_movement_reversal_guard.sql ist fachlich abgenommen.'
