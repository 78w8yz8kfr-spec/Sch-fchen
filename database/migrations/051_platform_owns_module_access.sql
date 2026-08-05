-- Die Freigabe der Bereiche gehoert allein der Plattformverwaltung.
--
-- Bisher galt: ein regulaerer Bereich stand jeder Firma offen, sobald er im
-- Katalog stand; nur Spezialmodule brauchten eine Freigabe. Die Firma konnte
-- ihn zusaetzlich selbst abschalten. Beides ist falsch herum. Wer die App
-- verkauft, entscheidet ueber den Umfang; der Kunde entscheidet nicht, was er
-- gekauft hat, und schon gar nicht schaltet er sich selbst etwas ab, das er
-- ohne fremde Hilfe nicht zurueckholen kann.
--
-- Ab jetzt entscheidet fuer jeden Bereich ausserhalb des Kerns die Freigabe in
-- company_module_entitlements. Damit sich fuer keine bestehende Firma etwas
-- aendert, bekommt jede von ihnen genau die Bereiche dauerhaft eingetragen,
-- die sie heute tatsaechlich sieht: die gebauten, nicht besonderen Bereiche.
-- Spezialmodule (VDE, DGUV) bleiben unberuehrt, sie waren schon immer
-- freigabepflichtig.
--
-- Neue Firmen bekommen dieselbe Ausstattung ueber einen Trigger. Ohne ihn
-- stuende ein frisch angelegter Kunde vor einer leeren App - genau der Fehler,
-- den die Ersteinrichtung der ersten Administration schon einmal hatte.

BEGIN;

-- Die gebauten, regulaeren Bereiche. Bewusst als Aufzaehlung und nicht als
-- "alles ohne is_special": im Katalog stehen auch Bereiche, die es in der App
-- noch gar nicht gibt (Fuhrpark, Ausbildungsnachweise, erweiterte Exporte,
-- Schnittstellen). Eine Freigabe dafuer wuerde etwas versprechen, was niemand
-- einloesen kann.
CREATE OR REPLACE FUNCTION platform_default_module_keys()
RETURNS VARCHAR[]
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT ARRAY[
        'absences', 'assembly_reports', 'documents', 'materials',
        'scheduling', 'site_daily_reports', 'site_qr'
    ]::VARCHAR[];
$$;

COMMENT ON FUNCTION platform_default_module_keys() IS
    'Bereiche, die jede Firma mit dem Standardumfang erhaelt.';

-- Bestandsfirmen: eintragen, was sie heute schon sehen.
INSERT INTO company_module_entitlements (
    company_id, module_id, entitlement_status, included_in_plan, change_reason
)
SELECT tenant.id, catalog.id, 'permanent', TRUE,
       'Standardumfang bei der Umstellung auf die Freigabe durch die Plattform'
FROM companies AS tenant
CROSS JOIN module_catalog AS catalog
WHERE catalog.status = 'active'
  AND catalog.is_special = FALSE
  AND catalog.category <> 'core'
  AND catalog.module_key = ANY (platform_default_module_keys())
ON CONFLICT (company_id, module_id) DO NOTHING;

-- Neue Firmen: dieselbe Ausstattung, sobald sie angelegt werden.
CREATE OR REPLACE FUNCTION provision_company_modules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    INSERT INTO company_module_entitlements (
        company_id, module_id, entitlement_status, included_in_plan, change_reason
    )
    SELECT NEW.id, catalog.id, 'permanent', TRUE, 'Standardumfang bei der Anlage der Firma'
    FROM module_catalog AS catalog
    WHERE catalog.status = 'active'
      AND catalog.is_special = FALSE
      AND catalog.category <> 'core'
      AND catalog.module_key = ANY (platform_default_module_keys())
    ON CONFLICT (company_id, module_id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS companies_provision_modules_trigger ON companies;
CREATE TRIGGER companies_provision_modules_trigger
    AFTER INSERT ON companies
    FOR EACH ROW
    EXECUTE FUNCTION provision_company_modules();

-- Der firmeneigene Schalter wird nicht mehr gelesen. Die Tabelle bleibt samt
-- Verlauf stehen, aber niemand darf mehr hineinschreiben: sonst entstuende ein
-- zweiter, stiller Stand neben der Freigabe.
REVOKE INSERT, UPDATE ON company_modules FROM schaefchen_api;

COMMENT ON TABLE company_modules IS
    'Verlauf der frueheren firmeneigenen Schalter. Wird nicht mehr ausgewertet; '
    'ueber die Freigabe eines Bereichs entscheidet company_module_entitlements.';

COMMIT;
