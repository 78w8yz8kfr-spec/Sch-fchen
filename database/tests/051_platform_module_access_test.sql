\echo 'Teste Migration 051_platform_owns_module_access.sql ...'

-- Jede bestehende Firma muss den Standardumfang haben. Ohne diesen Nachtrag
-- haetten alle Firmen nach der Umstellung eine leere App gehabt: die Bereiche
-- galten vorher ohne Eintrag als freigegeben.
DO $$
DECLARE
    fehlend INTEGER;
BEGIN
    SELECT COUNT(*) INTO fehlend
    FROM companies AS tenant
    CROSS JOIN module_catalog AS catalog
    LEFT JOIN company_module_entitlements AS freigabe
      ON freigabe.company_id = tenant.id AND freigabe.module_id = catalog.id
    WHERE catalog.module_key = ANY (platform_default_module_keys())
      AND catalog.status = 'active'
      AND freigabe.id IS NULL;

    IF fehlend > 0 THEN
        RAISE EXCEPTION 'Fuer % Firma-Bereich-Paare fehlt die Freigabe', fehlend;
    END IF;
END;
$$;

-- Spezialmodule bleiben freigabepflichtig und duerfen nicht mitgekommen sein.
DO $$
DECLARE
    versehentlich INTEGER;
BEGIN
    SELECT COUNT(*) INTO versehentlich
    FROM company_module_entitlements AS freigabe
    JOIN module_catalog AS catalog ON catalog.id = freigabe.module_id
    WHERE catalog.is_special
      AND freigabe.change_reason LIKE 'Standardumfang%';

    IF versehentlich > 0 THEN
        RAISE EXCEPTION '% Spezialmodule wurden ungefragt freigegeben', versehentlich;
    END IF;
END;
$$;

-- Eine neu angelegte Firma bekommt denselben Umfang. Ohne den Trigger stuende
-- ein frisch verkaufter Kunde vor einer leeren App.
-- Die Probefirma wird in einem eigenen Abschnitt angelegt und wieder
-- zurueckgerollt. Loeschen ginge nicht: die Freigaben fuehren einen
-- unveraenderlichen Verlauf, und der bleibt bewusst bestehen.
DO $$
DECLARE
    neue_firma UUID;
    erhalten INTEGER;
    erwartet INTEGER;
BEGIN
    BEGIN
        INSERT INTO companies (legal_name, display_name)
        VALUES ('Abnahme Module GmbH', 'Abnahme Module')
        RETURNING id INTO neue_firma;

        SELECT COUNT(*) INTO erhalten
        FROM company_module_entitlements AS freigabe
        JOIN module_catalog AS catalog ON catalog.id = freigabe.module_id
        WHERE freigabe.company_id = neue_firma
          AND freigabe.entitlement_status = 'permanent'
          AND catalog.module_key = ANY (platform_default_module_keys());

        SELECT COUNT(*) INTO erwartet
        FROM module_catalog
        WHERE module_key = ANY (platform_default_module_keys()) AND status = 'active';

        IF erhalten <> erwartet THEN
            RAISE EXCEPTION 'Neue Firma erhielt % statt % Bereiche', erhalten, erwartet;
        END IF;

        IF EXISTS (
            SELECT 1 FROM company_module_entitlements AS freigabe
            JOIN module_catalog AS catalog ON catalog.id = freigabe.module_id
            WHERE freigabe.company_id = neue_firma AND catalog.is_special
        ) THEN
            RAISE EXCEPTION 'Eine neue Firma bekam ein Spezialmodul ohne Freigabe';
        END IF;

        RAISE EXCEPTION 'abnahme_zuruecknehmen';
    EXCEPTION
        WHEN raise_exception THEN
            IF SQLERRM <> 'abnahme_zuruecknehmen' THEN
                RAISE;
            END IF;
    END;
END;
$$;

-- Die Firma darf ihren Umfang nicht mehr selbst aendern. Die Tabelle bleibt
-- als Verlauf erhalten, aber die Rolle der Schnittstelle schreibt nicht mehr.
DO $$
BEGIN
    IF has_table_privilege('schaefchen_api', 'company_modules', 'INSERT')
       OR has_table_privilege('schaefchen_api', 'company_modules', 'UPDATE') THEN
        RAISE EXCEPTION 'Die Schnittstellenrolle darf firmeneigene Schalter noch schreiben';
    END IF;
    IF NOT has_table_privilege('schaefchen_api', 'company_modules', 'SELECT') THEN
        RAISE EXCEPTION 'Der Verlauf der firmeneigenen Schalter ist nicht mehr lesbar';
    END IF;
END;
$$;

\echo 'Migration 051_platform_owns_module_access.sql ist fachlich abgenommen.'
