-- Der Lagerist bekommt eine eigene Rolle.
--
-- "Lagerist" ist eine Taetigkeit wie Monteur oder Vorarbeiter und gehoert
-- dorthin, wo die anderen auch stehen. Bisher musste im Lager verwalten, wer
-- ohnehin Bueroroellen hatte - also Disposition oder Projektleitung. Wer das
-- Lager fuehrt, braucht dafuer aber weder Kundendaten noch Projektsteuerung.
--
-- Die Rolle entsteht in jeder Firma, aber sie traegt zunaechst niemand: wer
-- sie bekommt, entscheidet die Firma selbst in ihrer Mitarbeiterverwaltung.
-- Ob der Bereich ueberhaupt sichtbar ist, entscheidet davon unabhaengig die
-- Plattform ueber die Freigabe des Moduls 'warehouse'. Beides zusammen ergibt
-- den Zugang: die Plattform verkauft den Bereich, die Firma besetzt ihn.

BEGIN;

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
        ('{"warehouse":{"scope":"company","actions":["read","manage"]},'
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

COMMENT ON FUNCTION create_warehouse_role_for_company(UUID) IS
    'Legt die Systemrolle Lagerist an; die Firma entscheidet selbst, wer sie bekommt.';

COMMIT;
