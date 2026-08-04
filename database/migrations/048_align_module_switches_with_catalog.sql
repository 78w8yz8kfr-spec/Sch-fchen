-- Firmeneigene Modulschalter am Plattformkatalog ausrichten.
--
-- Migration 047 zaehlte die abschaltbaren Bereiche als eigene Liste auf. Damit
-- gab es zwei Vokabulare: den Katalog der Plattform und eine zweite Liste in
-- der Datenbank und in der Schnittstelle. Wer der Plattform ein Modul
-- hinzufuegt, haette die zweite Liste von Hand nachziehen muessen.
--
-- Der Katalog ist die Quelle der Wahrheit. `category = 'core'` markiert, was
-- zum unverzichtbaren Kern gehoert und niemals abschaltbar ist. Alles andere
-- kann eine Firma selbst abschalten, sofern die Plattform es ihr freigegeben
-- hat.

BEGIN;

-- Zwei Bereiche fehlten im Katalog, obwohl es sie in der App gibt.
INSERT INTO module_catalog (module_key, name, description, category, is_special)
VALUES
    ('absences', 'Abwesenheiten', 'Urlaub und Abwesenheit beantragen und freigeben.', 'business', FALSE),
    ('site_qr', 'Baustellenlink und QR', 'Zugang zu einer Baustelle über Link oder QR-Code.', 'business', FALSE)
ON CONFLICT (module_key) DO NOTHING;

-- Die feste Schluesselliste weicht einer Pruefung gegen den Katalog.
ALTER TABLE company_modules
    DROP CONSTRAINT IF EXISTS company_modules_key_check;
ALTER TABLE company_module_events
    DROP CONSTRAINT IF EXISTS company_module_events_key_check;

CREATE OR REPLACE FUNCTION company_modules_require_supported_key()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    bereich RECORD;
BEGIN
    SELECT category, status INTO bereich
    FROM module_catalog
    WHERE module_key = LOWER(BTRIM(NEW.module_key));

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Der Bereich % steht nicht im Modulkatalog.', NEW.module_key;
    END IF;
    IF bereich.category = 'core' THEN
        RAISE EXCEPTION 'Der Bereich % gehört zum Kern und ist nicht abschaltbar.', NEW.module_key;
    END IF;
    IF bereich.status <> 'active' THEN
        RAISE EXCEPTION 'Der Bereich % wird nicht mehr angeboten.', NEW.module_key;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS company_modules_supported_keys_trigger ON company_modules;
CREATE TRIGGER company_modules_supported_keys_trigger
    BEFORE INSERT OR UPDATE ON company_modules
    FOR EACH ROW EXECUTE FUNCTION company_modules_require_supported_key();

-- Der Schluessel darf bis zu 60 Zeichen lang sein wie im Katalog.
ALTER TABLE company_modules ALTER COLUMN module_key TYPE VARCHAR(60);
ALTER TABLE company_module_events ALTER COLUMN module_key TYPE VARCHAR(60);

COMMENT ON FUNCTION company_modules_require_supported_key() IS
    'Lässt nur Bereiche zu, die im Modulkatalog stehen, aktiv sind und nicht zum Kern gehören.';

COMMIT;
