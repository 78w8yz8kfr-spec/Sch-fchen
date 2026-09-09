\echo 'Teste Migration 156_add_datev_personnel_number.sql ...'

BEGIN;

DO $$
DECLARE
    firma UUID;
    andere_firma UUID;
    anna UUID;
    ben UUID;
    fremd UUID;
BEGIN
    SELECT id INTO firma FROM companies WHERE company_number = 'F-000001';
    IF firma IS NULL THEN
        RAISE NOTICE 'Keine Firma F-000001 vorhanden - die Datenprüfung entfällt.';
        RETURN;
    END IF;

    -- Eine zweite Firma, um die Mandantengrenze der Eindeutigkeit zu prüfen.
    INSERT INTO companies (company_number, legal_name, display_name)
    VALUES ('F-900156', 'DATEV-Personalnummer-Test GmbH', 'DATEV-Test 156')
    RETURNING id INTO andere_firma;

    INSERT INTO users (company_id, personnel_number, first_name, last_name)
    VALUES (firma, 'DATEV156-ANNA', 'Anna', 'Beispiel')
    RETURNING id INTO anna;
    INSERT INTO users (company_id, personnel_number, first_name, last_name)
    VALUES (firma, 'DATEV156-BEN', 'Ben', 'Beispiel')
    RETURNING id INTO ben;
    INSERT INTO users (company_id, personnel_number, first_name, last_name)
    VALUES (andere_firma, 'DATEV156-FREMD', 'Fremde', 'Firma')
    RETURNING id INTO fremd;

    -- 1. Ohne Angabe bleibt die Spalte NULL - "nicht gepflegt" ist der
    --    unveraenderte Ausgangszustand.
    IF (SELECT datev_personnel_number FROM users WHERE id = anna) IS NOT NULL THEN
        RAISE EXCEPTION 'Neue Mitarbeiter tragen ohne Angabe bereits eine DATEV-Personalnummer';
    END IF;

    -- 2. Eine gueltige Nummer (ein bis fuenf Ziffern, keine fuehrende Null)
    --    geht durch.
    UPDATE users SET datev_personnel_number = '1001' WHERE id = anna;
    IF (SELECT datev_personnel_number FROM users WHERE id = anna) <> '1001' THEN
        RAISE EXCEPTION 'Eine gültige DATEV-Personalnummer wurde nicht übernommen';
    END IF;

    UPDATE users SET datev_personnel_number = '9' WHERE id = ben;
    IF (SELECT datev_personnel_number FROM users WHERE id = ben) <> '9' THEN
        RAISE EXCEPTION 'Eine einstellige DATEV-Personalnummer wurde nicht übernommen';
    END IF;

    -- 3. Fuehrende Null wird abgewiesen - das ist der eigentliche Zweck der
    --    Migration: DATEV liest die Nummer als Zahl, "0123" und "123" waeren
    --    dort dieselbe Person.
    BEGIN
        UPDATE users SET datev_personnel_number = '0123' WHERE id = ben;
        RAISE EXCEPTION USING ERRCODE = 'ZXB01',
            MESSAGE = 'Eine DATEV-Personalnummer mit führender Null wurde angenommen';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;

    -- 4. Sechs Stellen sind zu lang - das weist schon die Spaltenbreite
    --    VARCHAR(5) ab (string_data_right_truncation), nicht erst der CHECK.
    BEGIN
        UPDATE users SET datev_personnel_number = '123456' WHERE id = ben;
        RAISE EXCEPTION USING ERRCODE = 'ZXB02',
            MESSAGE = 'Eine sechsstellige DATEV-Personalnummer wurde angenommen';
    EXCEPTION
        WHEN string_data_right_truncation THEN NULL;
    END;

    -- 5. Buchstaben sind keine DATEV-Personalnummer.
    BEGIN
        UPDATE users SET datev_personnel_number = 'M-1' WHERE id = ben;
        RAISE EXCEPTION USING ERRCODE = 'ZXB03',
            MESSAGE = 'Eine nicht-numerische DATEV-Personalnummer wurde angenommen';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;

    -- 6. Dieselbe Nummer zweimal in derselben Firma wird abgewiesen - genau
    --    die Eindeutigkeit, die den DATEV-Export vor einer Doppelbuchung
    --    schützt.
    BEGIN
        UPDATE users SET datev_personnel_number = '1001' WHERE id = ben;
        RAISE EXCEPTION USING ERRCODE = 'ZXB04',
            MESSAGE = 'Eine doppelt vergebene DATEV-Personalnummer wurde angenommen';
    EXCEPTION
        WHEN unique_violation THEN NULL;
    END;

    -- 7. Dieselbe Nummer in einer anderen Firma ist dagegen unproblematisch -
    --    die Eindeutigkeit gilt je Mandant, nicht global.
    UPDATE users SET datev_personnel_number = '1001' WHERE id = fremd;
    IF (SELECT datev_personnel_number FROM users WHERE id = fremd) <> '1001' THEN
        RAISE EXCEPTION 'Dieselbe DATEV-Personalnummer in einer anderen Firma wurde fälschlich abgewiesen';
    END IF;

    -- 8. Mehrere Mitarbeiter ohne Nummer stehen nebeneinander - der Index ist
    --    partiell und schränkt "nicht gepflegt" nicht gegenseitig ein.
    UPDATE users SET datev_personnel_number = NULL WHERE id IN (anna, ben);
    IF EXISTS (
        SELECT 1 FROM users WHERE id = anna AND datev_personnel_number IS NOT NULL
    ) OR EXISTS (
        SELECT 1 FROM users WHERE id = ben AND datev_personnel_number IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'Das Löschen einer DATEV-Personalnummer (Rückgängigmachen) ist fehlgeschlagen';
    END IF;

    -- 9. Die API-Rolle darf die neue Spalte tatsächlich schreiben - ein
    --    spaltenbezogenes GRANT auf 'users' würde das sonst zur Laufzeit
    --    verweigern, obwohl das tabellenweite GRANT aus Migration 003 im
    --    Katalog steht.
    IF NOT has_column_privilege('schaefchen_api', 'users', 'datev_personnel_number', 'UPDATE') THEN
        RAISE EXCEPTION 'Die API-Rolle darf die Spalte datev_personnel_number nicht beschreiben';
    END IF;
    IF NOT has_column_privilege('schaefchen_api', 'users', 'datev_personnel_number', 'SELECT') THEN
        RAISE EXCEPTION 'Die API-Rolle darf die Spalte datev_personnel_number nicht lesen';
    END IF;
END;
$$;

ROLLBACK;

\echo 'Migration 156_add_datev_personnel_number.sql ist fachlich abgenommen.'
