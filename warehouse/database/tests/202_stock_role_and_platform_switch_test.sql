\echo 'Teste Migration 202_stock_role_and_platform_switch.sql ...'

DO $$
DECLARE
    firma UUID;
    neue UUID;
    lagerist UUID;
    umbenannt_geschuetzt BOOLEAN := FALSE;
BEGIN
    BEGIN
        -- Jede bestehende Firma hat die Rolle.
        IF EXISTS (
            SELECT 1 FROM companies AS betrieb
            WHERE NOT EXISTS (
                SELECT 1 FROM roles
                WHERE company_id = betrieb.id AND role_key = 'warehouse_manager'
            )
        ) THEN
            RAISE EXCEPTION 'Es gibt Firmen ohne Lageristenrolle';
        END IF;

        SELECT id INTO firma FROM companies ORDER BY company_number LIMIT 1;
        SELECT id INTO lagerist FROM roles
        WHERE company_id = firma AND role_key = 'warehouse_manager';

        IF (SELECT name FROM roles WHERE id = lagerist) <> 'Lagerist' THEN
            RAISE EXCEPTION 'Die Rolle heisst nicht Lagerist';
        END IF;
        IF (SELECT is_full_access FROM roles WHERE id = lagerist) THEN
            RAISE EXCEPTION 'Der Lagerist ist kein Vollzugriff';
        END IF;
        IF NOT (SELECT is_system FROM roles WHERE id = lagerist) THEN
            RAISE EXCEPTION 'Der Lagerist ist keine Systemrolle';
        END IF;
        IF (SELECT permissions -> 'materials' ->> 'scope' FROM roles WHERE id = lagerist) <> 'company' THEN
            RAISE EXCEPTION 'Dem Lageristen fehlt das Lagerrecht';
        END IF;
        -- Er fuehrt das Lager, nicht die Firma.
        IF (SELECT permissions ? 'customers' FROM roles WHERE id = lagerist) THEN
            RAISE EXCEPTION 'Der Lagerist bekommt Kundendaten, die er nicht braucht';
        END IF;

        -- Eine Systemrolle laesst sich nicht umschluesseln.
        BEGIN
            UPDATE roles SET role_key = 'lager' WHERE id = lagerist;
        EXCEPTION WHEN OTHERS THEN
            umbenannt_geschuetzt := TRUE;
        END;
        IF NOT umbenannt_geschuetzt THEN
            RAISE EXCEPTION 'Der Rollenschluessel liess sich aendern';
        END IF;

        -- Das Lager gehoert nicht mehr zum Standardumfang.
        IF 'materials' = ANY(platform_default_module_keys()) THEN
            RAISE EXCEPTION 'Die Lagerverwaltung steht noch im Standardumfang';
        END IF;
        IF NOT ('devices' = ANY(platform_default_module_keys())) THEN
            RAISE EXCEPTION 'Die uebrigen Standardmodule wurden mit entfernt';
        END IF;

        -- Keine Firma hat die Lagerverwaltung noch offen.
        IF EXISTS (
            SELECT 1 FROM company_module_entitlements AS recht
            JOIN module_catalog AS katalog ON katalog.id = recht.module_id
            WHERE katalog.module_key = 'materials' AND recht.entitlement_status <> 'inactive'
        ) THEN
            RAISE EXCEPTION 'Eine Firma hat die Lagerverwaltung noch freigeschaltet';
        END IF;

        -- Die Entscheidung bleibt nachvollziehbar: geloescht wurde nichts.
        IF NOT EXISTS (
            SELECT 1 FROM company_module_entitlements AS recht
            JOIN module_catalog AS katalog ON katalog.id = recht.module_id
            WHERE katalog.module_key = 'materials'
        ) THEN
            RAISE EXCEPTION 'Die bisherigen Freigaben wurden geloescht statt stillgelegt';
        END IF;

        -- Eine neue Firma bekommt die Rolle, aber nicht das Modul.
        INSERT INTO companies (company_number, legal_name, display_name)
        VALUES ('F-999202', 'Lagerrollenfirma GmbH', 'Lagerrollenfirma')
        RETURNING id INTO neue;

        IF NOT EXISTS (
            SELECT 1 FROM roles WHERE company_id = neue AND role_key = 'warehouse_manager'
        ) THEN
            RAISE EXCEPTION 'Eine neue Firma bekommt keine Lageristenrolle';
        END IF;
        IF EXISTS (
            SELECT 1 FROM company_module_entitlements AS recht
            JOIN module_catalog AS katalog ON katalog.id = recht.module_id
            WHERE recht.company_id = neue AND katalog.module_key = 'materials'
              AND recht.entitlement_status <> 'inactive'
        ) THEN
            RAISE EXCEPTION 'Eine neue Firma bekommt die Lagerverwaltung von selbst';
        END IF;

        RAISE EXCEPTION 'ABNAHME_ZURUECK';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM <> 'ABNAHME_ZURUECK' THEN RAISE; END IF;
    END;
END;
$$;

\echo 'Migration 202_stock_role_and_platform_switch.sql ist fachlich abgenommen.'
