-- Auszubildender als eigene Rolle, und das Berichtsheft wird privat.
--
-- Drei Aenderungen am gestern gebauten Berichtsheft:
--
-- 1. Der Auszubildende bekommt eine eigene Rolle statt eines Kennzeichens am
--    Mitarbeiter. "Auszubildender" ist eine Taetigkeit wie Monteur oder
--    Vorarbeiter und gehoert dorthin, wo die anderen auch stehen. Zwei Quellen
--    fuer dieselbe Aussage - Rolle und Kennzeichen - waeren ausserdem eine
--    Einladung, dass sie auseinanderlaufen. Deshalb faellt das Kennzeichen weg.
--
-- 2. Sehen und unterschreiben darf nur der eingetragene Ausbilder. Ein
--    Berichtsheft ist persoenlich; es geht das Buero nichts an, solange es
--    nicht selbst ausbildet. Wer den Ausbilder wechselt, aendert damit auch,
--    wer den Nachweis sehen darf - das ist gewollt und bleibt im Verlauf des
--    Mitarbeiters nachvollziehbar.
--
-- 3. Urlaub und Krankheit werden nicht mehr eingetippt. Sie stehen bereits in
--    den genehmigten Abwesenheiten; abgeschrieben wuerden sie irgendwann
--    falsch abgeschrieben. Das Feld bleibt in der Tabelle, wird aber vom
--    Server gefuellt.

BEGIN;

-- 1. Die Rolle.
CREATE OR REPLACE FUNCTION create_apprentice_role_for_company(
    target_company_id UUID
)
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
        'apprentice',
        'Auszubildender',
        'Arbeitet wie ein Monteur und führt zusätzlich ein Berichtsheft.',
        '{"timesheets":{"scope":"self","actions":["read","write"]},"construction_sites":{"scope":"assigned","actions":["read"]},"apprentice_reports":{"scope":"self","actions":["read","write"]}}'::JSONB,
        TRUE,
        FALSE
    )
    ON CONFLICT (company_id, role_key) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION companies_create_apprentice_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    PERFORM create_apprentice_role_for_company(NEW.id);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS companies_create_apprentice_role_trigger ON companies;
CREATE TRIGGER companies_create_apprentice_role_trigger
    AFTER INSERT ON companies
    FOR EACH ROW
    EXECUTE FUNCTION companies_create_apprentice_role();

SELECT create_apprentice_role_for_company(id) FROM companies;

-- Wer bereits als Auszubildender gekennzeichnet war, bekommt die Rolle. Ohne
-- diesen Schritt verloere er sein Berichtsheft beim Wechsel auf die Rolle.
INSERT INTO user_roles (company_id, user_id, role_id, assigned_by_user_id, reason)
SELECT person.company_id, person.id, rolle.id, person.id,
       'Umstellung des Berichtshefts auf die Rolle Auszubildender'
FROM users AS person
JOIN roles AS rolle
  ON rolle.company_id = person.company_id AND rolle.role_key = 'apprentice'
WHERE person.is_apprentice
  AND NOT EXISTS (
      SELECT 1 FROM user_roles AS vorhanden
      WHERE vorhanden.company_id = person.company_id
        AND vorhanden.user_id = person.id
        AND vorhanden.role_id = rolle.id
        AND vorhanden.revoked_at IS NULL
  );

-- Das Kennzeichen hat ausgedient. Die Rolle ist ab hier die einzige Quelle.
ALTER TABLE users DROP COLUMN IF EXISTS is_apprentice;

-- 2. Ohne Ausbilder gibt es kein Berichtsheft, das jemand sehen koennte.
--    Die Zuordnung ist damit nicht mehr nur eine Angabe, sondern die
--    Zugriffsregel selbst.
COMMENT ON COLUMN users.trainer_user_id IS
    'Ausbilder. Sieht und unterschreibt die Wochenberichte dieses Menschen - sonst niemand.';

COMMIT;
