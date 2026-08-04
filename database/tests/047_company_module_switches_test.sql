\echo 'Teste Migration 047_extend_company_module_switches.sql ...'

BEGIN;

DO $$
DECLARE
    firma_id UUID;
    benutzer_id UUID;
    stand BOOLEAN;
    fassung BIGINT;
    ereignisse INTEGER;
BEGIN
    -- Eigene Firma: der Test darf nicht daran scheitern, dass ein frueherer
    -- Lauf oder die Anwendung selbst schon Schalter gesetzt hat.
    INSERT INTO companies (legal_name, display_name)
    VALUES ('Modultest 047 GmbH', 'Modultest 047')
    RETURNING id INTO firma_id;

    -- Der Test bringt seinen eigenen Benutzer mit und haengt nicht an Daten,
    -- die zufaellig aus einem frueheren Lauf stammen.
    INSERT INTO users (company_id, personnel_number, first_name, last_name)
    VALUES (firma_id, 'MODUL-047', 'Mira', 'Modul')
    RETURNING id INTO benutzer_id;

    -- Die neuen abschaltbaren Bereiche lassen sich eintragen.
    INSERT INTO company_modules (company_id, module_key, is_enabled, changed_by_user_id)
    VALUES (firma_id, 'assembly_reports', TRUE, benutzer_id);
    INSERT INTO company_modules (company_id, module_key, is_enabled, changed_by_user_id)
    VALUES (firma_id, 'documents', TRUE, benutzer_id);
    INSERT INTO company_modules (company_id, module_key, is_enabled, changed_by_user_id)
    VALUES (firma_id, 'absences', TRUE, benutzer_id);
    INSERT INTO company_modules (company_id, module_key, is_enabled, changed_by_user_id)
    VALUES (firma_id, 'site_qr', TRUE, benutzer_id);

    -- Der Kern bleibt aussen vor: Zeiterfassung ist kein abschaltbarer Bereich.
    BEGIN
        INSERT INTO company_modules (company_id, module_key, is_enabled, changed_by_user_id)
        VALUES (firma_id, 'time_tracking', TRUE, benutzer_id);
        RAISE EXCEPTION USING
            ERRCODE = 'ZX471',
            MESSAGE = 'Die Zeiterfassung wurde als abschaltbarer Bereich akzeptiert';
    EXCEPTION
        WHEN check_violation OR raise_exception THEN
            IF SQLSTATE = 'ZX471' THEN RAISE; END IF;
    END;

    -- Abschalten schreibt Zeitpunkt und Fassung fort.
    UPDATE company_modules
    SET is_enabled = FALSE, changed_by_user_id = benutzer_id
    WHERE company_id = firma_id AND module_key = 'assembly_reports';

    SELECT is_enabled, row_version INTO stand, fassung
    FROM company_modules
    WHERE company_id = firma_id AND module_key = 'assembly_reports';

    IF stand THEN
        RAISE EXCEPTION 'Der Bereich wurde nicht abgeschaltet';
    END IF;
    IF fassung <> 2 THEN
        RAISE EXCEPTION 'Die Fassung wurde nicht fortgeschrieben: %', fassung;
    END IF;

    -- Jede Umstellung steht in der Historie.
    SELECT COUNT(*) INTO ereignisse
    FROM company_module_events
    WHERE company_id = firma_id AND module_key = 'assembly_reports';

    IF ereignisse <> 2 THEN
        RAISE EXCEPTION 'Die Historie zählt % statt 2 Umstellungen', ereignisse;
    END IF;

    -- Eine Umstellung ohne Aenderung wird abgelehnt, damit die Historie
    -- keine leeren Eintraege sammelt.
    BEGIN
        UPDATE company_modules
        SET is_enabled = FALSE, changed_by_user_id = benutzer_id
        WHERE company_id = firma_id AND module_key = 'assembly_reports';
        RAISE EXCEPTION USING
            ERRCODE = 'ZX472',
            MESSAGE = 'Eine Umstellung ohne Änderung wurde akzeptiert';
    EXCEPTION
        WHEN raise_exception THEN
            IF SQLSTATE = 'ZX472' THEN RAISE; END IF;
    END;
END;
$$;

ROLLBACK;

-- Die Mandantengrenze gilt auch unter der eingeschränkten API-Rolle.
BEGIN;

SELECT id AS tenant_a_id
FROM companies
WHERE company_number = 'F-000001'
\gset

SET LOCAL ROLE schaefchen_api;
SELECT set_config('app.current_company_id', :'tenant_a_id', TRUE);

DO $$
DECLARE
    fremde INTEGER;
BEGIN
    SELECT COUNT(*) INTO fremde
    FROM company_modules
    WHERE company_id <> current_setting('app.current_company_id')::UUID;

    IF fremde <> 0 THEN
        RAISE EXCEPTION 'API-Rolle sieht Modulschalter fremder Mandanten: %', fremde;
    END IF;
END;
$$;

RESET ROLE;

ROLLBACK;

\echo 'Migration 047_extend_company_module_switches.sql ist fachlich abgenommen.'
