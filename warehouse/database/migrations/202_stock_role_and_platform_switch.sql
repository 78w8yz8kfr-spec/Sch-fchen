-- Der Lagerist bekommt eine eigene Rolle, und das Lager wird zuschaltbar.
--
-- Zwei Aenderungen, die zusammengehoeren:
--
-- 1. "Lagerist" ist eine Taetigkeit wie Monteur oder Vorarbeiter und gehoert
--    dorthin, wo die anderen auch stehen. Bisher musste im Lager verwalten,
--    wer ohnehin Bueroroellen hatte - also Disposition oder Projektleitung.
--    Wer das Lager fuehrt, braucht dafuer aber weder Kundendaten noch
--    Projektsteuerung. Die Firma entscheidet ueber die Mitarbeiterverwaltung
--    selbst, wer die Rolle bekommt.
--
-- 2. Die Lagerverwaltung gehoert nicht mehr zum Standardumfang. Migration 200
--    hatte sie jeder Firma erteilt, weil der Modulschluessel seit 040 im
--    Katalog steht und seit 082 zum Umfang gehoerte. Sie ist aber ein eigener,
--    verkaufbarer Bereich: die Plattform schaltet ihn je Firma frei, wie bei
--    jedem anderen freigabepflichtigen Modul auch. Bestehende Freigaben werden
--    deshalb auf 'inactive' gesetzt - nicht geloescht, damit die Entscheidung
--    im Verlauf nachvollziehbar bleibt.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Die Rolle
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION create_warehouse_role_for_company(target_company_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    INSERT INTO roles (
        company_id, role_key, name, description, permissions, is_system, is_full_access
    ) VALUES (
        target_company_id,
        'warehouse_manager',
        'Lagerist',
        'Führt das Lager: Artikel, Bestände, Wareneingang, Inventur und Bestellungen.',
        ('{"materials":{"scope":"company","actions":["read","manage"]},'
         || '"timesheets":{"scope":"self","actions":["read","write"]},'
         || '"construction_sites":{"scope":"company","actions":["read"]},'
         || '"users":{"scope":"company","actions":["read"]}}')::JSONB,
        TRUE,
        FALSE
    )
    ON CONFLICT (company_id, role_key) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION companies_create_warehouse_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    PERFORM create_warehouse_role_for_company(NEW.id);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS companies_create_warehouse_role_trigger ON companies;
CREATE TRIGGER companies_create_warehouse_role_trigger
    AFTER INSERT ON companies
    FOR EACH ROW EXECUTE FUNCTION companies_create_warehouse_role();

SELECT create_warehouse_role_for_company(id) FROM companies;

-- ---------------------------------------------------------------------------
-- 2. Das Lager wird zuschaltbar
-- ---------------------------------------------------------------------------

-- Ohne 'materials' bekommt eine neu angelegte Firma die Lagerverwaltung nicht
-- mehr von selbst. Die uebrigen Schluessel bleiben wie in Migration 095.
CREATE OR REPLACE FUNCTION platform_default_module_keys()
RETURNS VARCHAR[]
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT ARRAY[
        'absences', 'assembly_reports', 'devices', 'documents', 'fleet',
        'scheduling', 'site_daily_reports', 'site_qr'
    ]::VARCHAR[];
$$;

-- Bestehende Freigaben stillegen statt loeschen: wer das Lager spaeter
-- bekommt, soll im Verlauf sehen koennen, dass es einmal offen stand.
UPDATE company_module_entitlements AS recht
SET entitlement_status = 'inactive',
    included_in_plan = FALSE,
    starts_at = NULL,
    ends_at = NULL,
    change_reason = 'Lagerverwaltung wird je Firma von der Plattform freigeschaltet'
FROM module_catalog AS katalog
WHERE katalog.id = recht.module_id
  AND katalog.module_key = 'materials'
  AND recht.entitlement_status <> 'inactive';

COMMENT ON FUNCTION create_warehouse_role_for_company(UUID) IS
    'Legt die Systemrolle Lagerist an; die Firma entscheidet selbst, wer sie bekommt.';

COMMIT;
