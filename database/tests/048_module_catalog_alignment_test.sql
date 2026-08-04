\echo 'Teste Migration 048_align_module_switches_with_catalog.sql ...'

BEGIN;

DO $$
DECLARE
    firma_id UUID;
    benutzer_id UUID;
    fehlend INTEGER;
BEGIN
    -- Eigene Firma: der Test darf nicht daran scheitern, dass ein frueherer
    -- Lauf oder die Anwendung selbst schon Schalter gesetzt hat.
    INSERT INTO companies (legal_name, display_name)
    VALUES ('Modultest 048 GmbH', 'Modultest 048')
    RETURNING id INTO firma_id;

    INSERT INTO users (company_id, personnel_number, first_name, last_name)
    VALUES (firma_id, 'MODUL-048', 'Momo', 'Katalog')
    RETURNING id INTO benutzer_id;

    -- Die beiden fehlenden Bereiche stehen jetzt im Katalog.
    SELECT COUNT(*) INTO fehlend
    FROM (VALUES ('absences'), ('site_qr')) AS erwartet(schluessel)
    WHERE NOT EXISTS (
        SELECT 1 FROM module_catalog WHERE module_key = erwartet.schluessel
    );
    IF fehlend <> 0 THEN
        RAISE EXCEPTION '% erwartete Bereiche fehlen im Katalog', fehlend;
    END IF;

    -- Jeder aktive Bereich ausserhalb des Kerns laesst sich schalten. Die
    -- Pruefung haengt am Katalog, nicht an einer zweiten Liste.
    INSERT INTO company_modules (company_id, module_key, is_enabled, changed_by_user_id)
    SELECT firma_id, module_key, TRUE, benutzer_id
    FROM module_catalog
    WHERE category <> 'core' AND status = 'active';

    -- Der Kern bleibt gesperrt.
    BEGIN
        INSERT INTO company_modules (company_id, module_key, is_enabled, changed_by_user_id)
        VALUES (firma_id, 'time_tracking', FALSE, benutzer_id);
        RAISE EXCEPTION USING
            ERRCODE = 'ZX481',
            MESSAGE = 'Die Zeiterfassung wurde als abschaltbarer Bereich akzeptiert';
    EXCEPTION
        WHEN raise_exception THEN
            IF SQLSTATE = 'ZX481' THEN RAISE; END IF;
    END;

    -- Ein Bereich ausserhalb des Katalogs wird abgewiesen.
    BEGIN
        INSERT INTO company_modules (company_id, module_key, is_enabled, changed_by_user_id)
        VALUES (firma_id, 'erfundener_bereich', TRUE, benutzer_id);
        RAISE EXCEPTION USING
            ERRCODE = 'ZX482',
            MESSAGE = 'Ein Bereich ausserhalb des Katalogs wurde akzeptiert';
    EXCEPTION
        WHEN raise_exception THEN
            IF SQLSTATE = 'ZX482' THEN RAISE; END IF;
    END;
END;
$$;

ROLLBACK;

-- Der Kern ist im Katalog als solcher gekennzeichnet. Ohne diese Markierung
-- waere die Zeiterfassung abschaltbar.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM module_catalog WHERE module_key = 'time_tracking' AND category = 'core'
    ) THEN
        RAISE EXCEPTION 'Die Zeiterfassung ist im Katalog nicht als Kern gekennzeichnet';
    END IF;
END;
$$;

\echo 'Migration 048_align_module_switches_with_catalog.sql ist fachlich abgenommen.'
