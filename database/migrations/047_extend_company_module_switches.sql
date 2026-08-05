-- Firmeneigene Modulschalter fuer weitere Bereiche oeffnen.
--
-- Bisher liessen sich nur die Elektro-Spezialmodule VDE und DGUV eintragen.
-- Die Tabelle traegt aber alles, was ein Betrieb selbst an- und abschalten
-- koennen soll: Berichte, Baustellenakte, Abwesenheiten und den
-- Baustellenlink. Der Kern bleibt bewusst aussen vor. Zeiterfassung,
-- Mitarbeiter, Baustellen und Anmeldung sind keine Module; ohne sie ist
-- Schaefchen kein Arbeitszeitnachweis mehr.
--
-- Einsatzplanung und Stundenkonten bleiben ebenfalls unschaltbar: die
-- Sollzeit haengt am Feiertagskalender und die Zeiterfassung an der
-- Baustellenzuordnung. Ein Schalter dort wuerde die Zeitberechnung
-- veraendern, nicht nur eine Ansicht ausblenden.

BEGIN;

ALTER TABLE company_modules
    DROP CONSTRAINT IF EXISTS company_modules_key_check;
ALTER TABLE company_modules
    ADD CONSTRAINT company_modules_key_check
    CHECK (module_key IN (
        'vde', 'dguv', 'site_reports', 'site_documents', 'absences', 'site_qr'
    ));

ALTER TABLE company_module_events
    DROP CONSTRAINT IF EXISTS company_module_events_key_check;
ALTER TABLE company_module_events
    ADD CONSTRAINT company_module_events_key_check
    CHECK (module_key IN (
        'vde', 'dguv', 'site_reports', 'site_documents', 'absences', 'site_qr'
    ));

CREATE OR REPLACE FUNCTION company_modules_require_supported_key()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF LOWER(BTRIM(NEW.module_key)) NOT IN (
        'vde', 'dguv', 'site_reports', 'site_documents', 'absences', 'site_qr'
    ) THEN
        RAISE EXCEPTION 'Dieses Modul ist nicht zum Abschalten vorgesehen.';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS company_modules_supported_keys_trigger ON company_modules;
CREATE TRIGGER company_modules_supported_keys_trigger
    BEFORE INSERT OR UPDATE ON company_modules
    FOR EACH ROW EXECUTE FUNCTION company_modules_require_supported_key();

-- Migration 040 hatte der API-Rolle die Schreibrechte entzogen, weil damals
-- ausschliesslich die Plattform ueber Module entschied. Die Firma schaltet
-- ihre Bereiche nun selbst; die Mandantengrenze bleibt ueber die bestehende
-- Zeilenschutzregel gewahrt.
GRANT INSERT, UPDATE ON company_modules TO schaefchen_api;

COMMENT ON TABLE company_modules IS
    'Firmeneigene Freigabe abschaltbarer Bereiche; fehlende Einträge gelten als aktiv, sofern die Plattform den Bereich freigegeben hat.';
COMMENT ON TABLE company_module_events IS
    'Unveränderliche Historie jeder Aktivierung und Deaktivierung eines Bereichs durch die Firma.';

COMMIT;
