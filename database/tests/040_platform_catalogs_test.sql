\echo 'Teste Migration 040_create_platform_catalogs.sql ...'

BEGIN;

DO $$
DECLARE
    target_company_id UUID;
    target_entitlement_id UUID;
    plan_id UUID;
    version_id UUID;
    target_contract_id UUID;
    seeded_company_id UUID;
BEGIN
    SELECT id INTO target_company_id FROM companies WHERE company_number = 'F-000001';

    IF (SELECT COUNT(*) FROM module_catalog) < 13
       OR NOT EXISTS (SELECT 1 FROM module_catalog WHERE module_key = 'vde' AND is_special)
       OR EXISTS (SELECT 1 FROM module_catalog WHERE module_key IN ('lwl', 'knx')) THEN
        RAISE EXCEPTION 'Der freigabepflichtige Modulkatalog ist unvollständig oder fachlich erweitert';
    END IF;

    INSERT INTO company_module_entitlements (
        company_id, module_id, entitlement_status, starts_at,
        included_in_plan, separately_billed, feature_scope, change_reason
    )
    SELECT target_company_id, id, 'permanent', CURRENT_TIMESTAMP,
           FALSE, TRUE, '{"protocols":true}'::JSONB, 'SQL-Abnahme Migration 040'
    FROM module_catalog WHERE module_key = 'vde'
    ON CONFLICT (company_id, module_id) DO UPDATE SET
        entitlement_status = EXCLUDED.entitlement_status,
        starts_at = EXCLUDED.starts_at,
        separately_billed = EXCLUDED.separately_billed,
        feature_scope = EXCLUDED.feature_scope,
        change_reason = EXCLUDED.change_reason
    RETURNING id INTO target_entitlement_id;

    IF NOT EXISTS (
        SELECT 1 FROM company_module_entitlement_history
        WHERE company_module_entitlement_history.entitlement_id = target_entitlement_id
          AND new_state ->> 'entitlement_status' = 'permanent'
    ) THEN
        RAISE EXCEPTION 'Modulfreigabe wurde nicht historisiert';
    END IF;

    IF has_table_privilege('schaefchen_api', 'company_module_entitlements', 'UPDATE') THEN
        RAISE EXCEPTION 'Firmenrolle darf Plattform-Modulfreigaben verändern';
    END IF;

    INSERT INTO companies (legal_name, display_name, status)
    VALUES ('SQL Standardmodule 040 GmbH', 'SQL Standardmodule 040', 'trial')
    RETURNING id INTO seeded_company_id;
    IF (
        SELECT COUNT(*) FROM company_module_entitlements AS entitlement
        JOIN module_catalog AS catalog ON catalog.id = entitlement.module_id
        WHERE entitlement.company_id = seeded_company_id
          AND entitlement.entitlement_status = 'permanent'
          AND entitlement.included_in_plan
          AND catalog.module_key IN (
              'time_tracking', 'scheduling', 'assembly_reports',
              'site_daily_reports', 'documents'
          )
    ) <> 5 OR EXISTS (
        SELECT 1 FROM company_module_entitlements AS entitlement
        JOIN module_catalog AS catalog ON catalog.id = entitlement.module_id
        WHERE entitlement.company_id = seeded_company_id
          AND catalog.module_key IN ('vde', 'dguv', 'electrical_special')
          AND entitlement.entitlement_status <> 'inactive'
    ) THEN
        RAISE EXCEPTION 'Neue Firmen erhalten nicht exakt die sicheren Standardmodule';
    END IF;

    INSERT INTO license_plans (plan_key, name, status)
    VALUES ('sql_040', 'SQL Tarif 040', 'active') RETURNING id INTO plan_id;
    INSERT INTO license_plan_versions (
        license_plan_id, version_number, monthly_price_cents, annual_price_cents,
        included_modules, addon_modules
    ) VALUES (
        plan_id, 1, 4900, 49000, '["time_tracking"]', '["vde"]'
    ) RETURNING id INTO version_id;

    BEGIN
        UPDATE license_plan_versions SET monthly_price_cents = 1 WHERE id = version_id;
        RAISE EXCEPTION 'Historischer Preisstand konnte verändert werden';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'Historischer Preisstand konnte verändert werden' THEN RAISE; END IF;
    END;

    INSERT INTO company_contracts (
        company_id, license_plan_version_id, status, starts_at,
        monthly_price_cents, annual_price_cents, module_snapshot, change_reason
    ) VALUES (
        target_company_id, version_id, 'active', CURRENT_TIMESTAMP,
        4900, 49000, '["time_tracking","vde"]', 'SQL-Abnahme Migration 040'
    ) RETURNING id INTO target_contract_id;
    UPDATE company_contracts
    SET status = 'expired', ends_at = CURRENT_TIMESTAMP + INTERVAL '1 second',
        change_reason = 'Historischer Vertragswechsel'
    WHERE id = target_contract_id;

    IF (
        SELECT COUNT(*)
        FROM company_contract_history
        WHERE company_contract_history.contract_id = target_contract_id
    ) <> 2 THEN
        RAISE EXCEPTION 'Vertragssnapshot oder Vertragsänderung fehlt in der Historie';
    END IF;
END;
$$;

SELECT id AS tenant_a_id
FROM companies
WHERE company_number = 'F-000001'
\gset

-- Die Firmenrolle darf den Modulkatalog lesen, aber weder ändern noch die
-- Tarif- und Vertragsverwaltung erreichen.
SET LOCAL ROLE schaefchen_api;
SELECT set_config('app.current_company_id', :'tenant_a_id', TRUE);

DO $$
DECLARE
    tenant_a_id UUID := NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID;
    readable_modules INTEGER;
    foreign_entitlements INTEGER;
    blocked_table TEXT;
    reachable_tables TEXT[] := ARRAY[]::TEXT[];
BEGIN
    SELECT COUNT(*) INTO readable_modules FROM module_catalog;
    IF readable_modules = 0 THEN
        RAISE EXCEPTION 'Firmenrolle kann den Modulkatalog nicht lesen';
    END IF;

    SELECT COUNT(*) INTO foreign_entitlements
    FROM company_module_entitlements
    WHERE company_id <> tenant_a_id;

    IF foreign_entitlements <> 0 THEN
        RAISE EXCEPTION 'Firmenrolle sieht % firmenfremde Modulfreischaltungen', foreign_entitlements;
    END IF;

    FOREACH blocked_table IN ARRAY ARRAY[
        'license_plans', 'license_plan_versions', 'company_contracts',
        'company_contract_history', 'company_module_entitlement_history'
    ] LOOP
        BEGIN
            EXECUTE format('SELECT COUNT(*) FROM %I', blocked_table);
            reachable_tables := reachable_tables || blocked_table;
        EXCEPTION
            WHEN insufficient_privilege THEN NULL;
        END;
    END LOOP;

    IF ARRAY_LENGTH(reachable_tables, 1) IS NOT NULL THEN
        RAISE EXCEPTION 'Firmenrolle erreicht Tarif- und Vertragstabellen: %',
            ARRAY_TO_STRING(reachable_tables, ', ');
    END IF;

    BEGIN
        UPDATE module_catalog SET name = 'Manipuliert';
        RAISE EXCEPTION USING
            ERRCODE = 'ZX401',
            MESSAGE = 'Firmenrolle konnte den Modulkatalog verändern';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;
END;
$$;

RESET ROLE;
ROLLBACK;

\echo 'Migration 040_create_platform_catalogs.sql erfolgreich getestet.'
