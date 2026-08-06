\echo 'Teste Migration 082_fleet_in_standard_scope.sql ...'

DO $$
BEGIN
    -- Der Fuhrpark steht im Standardumfang, seit es ihn wirklich gibt.
    IF NOT ('fleet' = ANY (platform_default_module_keys())) THEN
        RAISE EXCEPTION 'Der Fuhrpark fehlt im Standardumfang';
    END IF;

    -- Und jede bestehende Firma hat ihn: sie hat denselben Vertrag wie eine,
    -- die morgen angelegt wird.
    IF EXISTS (
        SELECT 1
        FROM companies AS tenant
        WHERE NOT EXISTS (
            SELECT 1
            FROM company_module_entitlements AS entitlement
            JOIN module_catalog AS catalog ON catalog.id = entitlement.module_id
            WHERE entitlement.company_id = tenant.id
              AND catalog.module_key = 'fleet'
              AND entitlement.entitlement_status = 'permanent'
        )
    ) THEN
        RAISE EXCEPTION 'Eine Firma hat den Fuhrpark nicht bekommen';
    END IF;
END;
$$;

-- Eine neu angelegte Firma bekommt ihn ohne Zutun.
DO $$
DECLARE
    neue UUID;
BEGIN
    BEGIN
        INSERT INTO companies (company_number, legal_name, display_name)
        VALUES ('F-999082', 'Abnahme Fuhrpark GmbH', 'Abnahme Fuhrpark')
        RETURNING id INTO neue;

        IF NOT EXISTS (
            SELECT 1
            FROM company_module_entitlements AS entitlement
            JOIN module_catalog AS catalog ON catalog.id = entitlement.module_id
            WHERE entitlement.company_id = neue
              AND catalog.module_key = 'fleet'
        ) THEN
            RAISE EXCEPTION 'Eine neue Firma bekommt den Fuhrpark nicht';
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

\echo 'Migration 082_fleet_in_standard_scope.sql ist fachlich abgenommen.'
