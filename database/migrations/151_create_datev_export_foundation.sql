-- Grundlage der DATEV-Lohnschnittstelle, Stufe 1.
--
-- WORUM ES GEHT
--
-- Der Betrieb will Stunden an die Steuerkanzlei uebergeben. DATEV kennt dafuer
-- zwei Lohnprodukte, LODAS und Lohn und Gehalt, mit unterschiedlichem
-- Dateikopf, aber praktisch gleichen Bewegungsdatensaetzen. Der Betreiber hat
-- entschieden: beide werden gebaut, je Firma waehlbar.
--
-- Diese Migration erzeugt noch keine Exportdatei - das ist Stufe 2. Sie legt
-- nur die zwei Dinge an, ohne die jede spaetere Datei entweder von DATEV
-- abgelehnt wird oder falsche Zahlen traegt:
--
-- 1. DIE DATEV-STAMMDATEN JE FIRMA
--
-- Beraternummer und Mandantennummer identifizieren die Steuerkanzlei und den
-- Mandanten gegenueber DATEV; ohne beide lehnt der Import die Datei ab. Dazu
-- das gewaehlte Lohnprodukt, weil davon Dateikopf und Feldbelegung der Stufe 2
-- abhaengen.
--
-- 'datev_export_settings' ist eine einzelne Stammdatenzeile je Firma, genauso
-- gefuehrt wie 'device_settings' aus Migration 095: direkt aktualisiert mit
-- Versionspruefung, nicht historisiert. Eine Berater- oder Mandantennummer
-- ist eine Adresse, keine fachliche Buchung - wird sie korrigiert, ist nichts
-- an der Korrektur nachzuvollziehen, das eine eigene Historie rechtfertigt.
-- Fehlt die Zeile, ist die Firma schlicht noch nicht angebunden; es gibt
-- keinen erfundenen Standardwert, den DATEV ohnehin ablehnen wuerde.
--
-- 2. DIE ZUORDNUNG ZEITART ZU LOHNART
--
-- Lohnartennummern sind nicht standardisiert - jede Kanzlei vergibt eigene.
-- Ohne diese Zuordnung ist jede erzeugte Datei wertlos. Erfasst werden die
-- drei Zeitarten, die 'work_days' bereits als Minutenwerte fuehrt (Migration
-- 011: work_minutes, travel_minutes, overtime_minutes), dazu die neun
-- Abwesenheitsarten aus ABSENCE_TYPES (api/src/validation.mjs). Zeitarten
-- brauchen eine Lohnartennummer; Abwesenheitsarten brauchen einen
-- Ausfallschluessel und koennen zusaetzlich eine Lohnartennummer tragen.
--
-- 'datev_wage_type_mappings' ist dagegen eine fachliche Zuordnung, die in
-- eine Lohnabrechnung einfliesst: wird eine Lohnart nachtraeglich auf eine
-- andere Nummer umgestellt, muss nachvollziehbar bleiben, mit welcher Nummer
-- ein bereits abgerechneter Zeitraum tatsaechlich exportiert wurde. Sie folgt
-- deshalb dem Muster aus Migration 010 ('site_supervisors'): eine geaenderte
-- Zuordnung ueberschreibt die alte Zeile nicht, sie loest sie ab. Ein
-- BEFORE-INSERT-Ausloeser schliesst die bisher gueltige Zeile derselben
-- Zeitart automatisch (valid_until = Beginn der neuen Zeile), bevor die neue
-- eingefuegt wird - genau wie dort die Hauptvorarbeiter-Uebergabe die
-- vorherige Zeile schliesst statt sie zu ueberschreiben. Anders als dort
-- braucht es keine separate Vorher-Stand-Tabelle: jede Zeile hier ist von
-- Anfang an vollstaendig und unveraenderlich, die Historie ist der Bestand
-- selbst.
--
-- Genau deshalb bekommt die Anwendungsrolle auf dieser Tabelle kein UPDATE
-- und kein DELETE - nur SELECT und INSERT. Der Ausloeser, der die alte Zeile
-- schliesst, laeuft mit SECURITY DEFINER und damit unabhaengig von den
-- Rechten der Anwendungsrolle; niemand ausserhalb dieser Migration kann eine
-- bestehende Zuordnung nachtraeglich veraendern.
--
-- Eine fehlende Zeile fuer eine Zeitart bedeutet ausdruecklich "nicht
-- gepflegt". Es gibt bewusst keinen Vorgabewert: eine geratene
-- Lohnartennummer waere in einer Lohnabrechnung falscher als eine Datei, die
-- Stufe 2 mangels Zuordnung ablehnt.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. DATEV-Stammdaten je Firma
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS datev_export_settings (
    company_id UUID PRIMARY KEY REFERENCES companies (id) ON DELETE RESTRICT,
    -- DATEV-Beraternummer der Steuerkanzlei. Numerisch, DATEV vergibt hier
    -- bis zu sieben Stellen.
    consultant_number VARCHAR(7) NOT NULL,
    -- DATEV-Mandantennummer dieser Firma bei der Kanzlei. Numerisch, DATEV
    -- vergibt hier bis zu fuenf Stellen.
    client_number VARCHAR(5) NOT NULL,
    -- Welches der beiden Lohnprodukte diese Firma nutzt. Bestimmt in Stufe 2
    -- den Dateikopf des Exports.
    payroll_product VARCHAR(20) NOT NULL,
    updated_by_user_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    row_version BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT datev_export_settings_updater_fkey
        FOREIGN KEY (company_id, updated_by_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT datev_export_settings_consultant_format_check
        CHECK (consultant_number ~ '^[0-9]{1,7}$'),
    CONSTRAINT datev_export_settings_client_format_check
        CHECK (client_number ~ '^[0-9]{1,5}$'),
    CONSTRAINT datev_export_settings_product_check
        CHECK (payroll_product IN ('lodas', 'lug')),
    CONSTRAINT datev_export_settings_version_check CHECK (row_version >= 1)
);

CREATE OR REPLACE FUNCTION datev_export_settings_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW.company_id <> OLD.company_id OR NEW.created_at <> OLD.created_at THEN
            RAISE EXCEPTION 'Firma und Anlagezeit der DATEV-Stammdaten sind unveränderlich.';
        END IF;
        NEW.updated_at := CURRENT_TIMESTAMP;
        NEW.row_version := OLD.row_version + 1;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS datev_export_settings_before_write_trigger ON datev_export_settings;
CREATE TRIGGER datev_export_settings_before_write_trigger
    BEFORE INSERT OR UPDATE ON datev_export_settings
    FOR EACH ROW EXECUTE FUNCTION datev_export_settings_before_write();

CREATE OR REPLACE FUNCTION datev_export_settings_prevent_hard_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF CURRENT_SETTING('app.allow_hard_delete', TRUE) = 'on' THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'DATEV-Stammdaten dürfen nicht hart gelöscht werden.';
END;
$$;

DROP TRIGGER IF EXISTS datev_export_settings_prevent_hard_delete_trigger ON datev_export_settings;
CREATE TRIGGER datev_export_settings_prevent_hard_delete_trigger
    BEFORE DELETE ON datev_export_settings
    FOR EACH ROW EXECUTE FUNCTION datev_export_settings_prevent_hard_delete();

ALTER TABLE datev_export_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS datev_export_settings_tenant_isolation ON datev_export_settings;
CREATE POLICY datev_export_settings_tenant_isolation ON datev_export_settings
    USING (company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID)
    WITH CHECK (company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID);
ALTER TABLE datev_export_settings NO FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON datev_export_settings TO schaefchen_api;

COMMENT ON TABLE datev_export_settings IS
    'DATEV-Stammdaten je Firma (Berater-/Mandantennummer, Lohnprodukt); fehlende Zeile heißt "nicht angebunden".';

-- ---------------------------------------------------------------------------
-- 2. Zuordnung Zeitart/Abwesenheitsart zu Lohnart
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS datev_wage_type_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
    -- 'time_type': Arbeitszeit/Fahrzeit/Ueberstunden aus work_days.
    -- 'absence_type': eine der neun Abwesenheitsarten aus ABSENCE_TYPES.
    category VARCHAR(20) NOT NULL,
    mapping_key VARCHAR(30) NOT NULL,
    -- Lohnartennummer der Kanzlei. Numerisch, DATEV-Lohnarten sind ueblich
    -- bis vier Stellen. Pflicht fuer Zeitarten, bei Abwesenheitsarten
    -- optional zusaetzlich zum Ausfallschluessel.
    wage_type_number VARCHAR(4),
    -- Ausfallschluessel fuer Abwesenheitsarten. Numerisch, ein- bis
    -- zweistellig. Nur bei Abwesenheitsarten gesetzt und dort Pflicht.
    absence_code VARCHAR(2),
    -- clock_timestamp() statt CURRENT_TIMESTAMP: Letzteres ist innerhalb
    -- einer Transaktion eingefroren, und eine Korrektur direkt nach der
    -- Ersteinrichtung liefe damit auf denselben Zeitpunkt wie die
    -- abzuloesende Zeile - der Gueltigkeits-Check unten wuerde die neue
    -- Zeile ablehnen, obwohl sie fachlich richtig ist.
    valid_from TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    -- NULL heißt: aktuell gültig. Eine Ablösung setzt hier den Zeitpunkt der
    -- neuen Zeile, statt diese Zeile inhaltlich zu verändern.
    valid_until TIMESTAMPTZ,
    changed_by_user_id UUID NOT NULL,
    change_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    row_version BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT datev_wage_type_mappings_company_id_id_key UNIQUE (company_id, id),
    CONSTRAINT datev_wage_type_mappings_changer_fkey
        FOREIGN KEY (company_id, changed_by_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT datev_wage_type_mappings_category_check
        CHECK (category IN ('time_type', 'absence_type')),
    -- Bindet den Schluessel an die tatsaechlichen Werte aus work_days
    -- (Migration 011) und ABSENCE_TYPES (api/src/validation.mjs): ein
    -- Tippfehler im Schluessel faellt hier auf, nicht erst beim Export in
    -- Stufe 2.
    CONSTRAINT datev_wage_type_mappings_key_check CHECK (
        (category = 'time_type' AND mapping_key IN ('work', 'travel', 'overtime'))
        OR
        (category = 'absence_type' AND mapping_key IN (
            'vacation', 'unpaid_vacation', 'time_off', 'leave', 'special_leave',
            'sick', 'training', 'vocational_school', 'other'
        ))
    ),
    CONSTRAINT datev_wage_type_mappings_wage_type_format_check
        CHECK (wage_type_number IS NULL OR wage_type_number ~ '^[0-9]{1,4}$'),
    CONSTRAINT datev_wage_type_mappings_absence_code_format_check
        CHECK (absence_code IS NULL OR absence_code ~ '^[0-9]{1,2}$'),
    -- Zeitarten brauchen eine Lohnart und keinen Ausfallschluessel.
    CONSTRAINT datev_wage_type_mappings_time_type_shape_check CHECK (
        category <> 'time_type'
        OR (wage_type_number IS NOT NULL AND absence_code IS NULL)
    ),
    -- Abwesenheitsarten brauchen den Ausfallschluessel; die Lohnart bleibt
    -- optional (manche Kanzleien buchen sie ausschließlich ueber den
    -- Ausfallschluessel).
    CONSTRAINT datev_wage_type_mappings_absence_type_shape_check CHECK (
        category <> 'absence_type' OR absence_code IS NOT NULL
    ),
    -- >= statt >: clock_timestamp() hat zwar Mikrosekunden-Aufloesung, aber
    -- unter virtualisierten Uhren ist ein Gleichstand nicht ausgeschlossen -
    -- eine fachlich korrekte sofortige Ablösung soll daran nicht scheitern.
    CONSTRAINT datev_wage_type_mappings_validity_check
        CHECK (valid_until IS NULL OR valid_until >= valid_from),
    CONSTRAINT datev_wage_type_mappings_reason_not_blank
        CHECK (change_reason IS NULL OR BTRIM(change_reason) <> '')
);

-- Genau eine gueltige Zuordnung je Firma und Schluessel; die abgeloesten
-- Zeilen bleiben mit gesetztem valid_until stehen.
CREATE UNIQUE INDEX IF NOT EXISTS datev_wage_type_mappings_active_key
    ON datev_wage_type_mappings (company_id, mapping_key)
    WHERE valid_until IS NULL;

CREATE INDEX IF NOT EXISTS datev_wage_type_mappings_history_idx
    ON datev_wage_type_mappings (company_id, mapping_key, valid_from DESC);

-- Loest die bisher gueltige Zeile ab, statt sie zu ueberschreiben. Laeuft mit
-- SECURITY DEFINER, weil die Anwendungsrolle auf dieser Tabelle bewusst kein
-- UPDATE besitzt (siehe GRANT unten) - die einzige Aenderung an einer
-- bestehenden Zeile ist diese eine, systemgetriebene Ablösung.
CREATE OR REPLACE FUNCTION datev_wage_type_mappings_before_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.valid_from := COALESCE(NEW.valid_from, clock_timestamp());
    IF NEW.valid_until IS NULL THEN
        UPDATE datev_wage_type_mappings
        SET valid_until = NEW.valid_from
        WHERE company_id = NEW.company_id
          AND mapping_key = NEW.mapping_key
          AND valid_until IS NULL;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS datev_wage_type_mappings_before_insert_trigger ON datev_wage_type_mappings;
CREATE TRIGGER datev_wage_type_mappings_before_insert_trigger
    BEFORE INSERT ON datev_wage_type_mappings
    FOR EACH ROW EXECUTE FUNCTION datev_wage_type_mappings_before_insert();

CREATE OR REPLACE FUNCTION datev_wage_type_mappings_prevent_hard_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF CURRENT_SETTING('app.allow_hard_delete', TRUE) = 'on' THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'Lohnart-Zuordnungen dürfen nicht hart gelöscht werden.';
END;
$$;

DROP TRIGGER IF EXISTS datev_wage_type_mappings_prevent_hard_delete_trigger ON datev_wage_type_mappings;
CREATE TRIGGER datev_wage_type_mappings_prevent_hard_delete_trigger
    BEFORE DELETE ON datev_wage_type_mappings
    FOR EACH ROW EXECUTE FUNCTION datev_wage_type_mappings_prevent_hard_delete();

ALTER TABLE datev_wage_type_mappings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS datev_wage_type_mappings_tenant_isolation ON datev_wage_type_mappings;
CREATE POLICY datev_wage_type_mappings_tenant_isolation ON datev_wage_type_mappings
    USING (company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID)
    WITH CHECK (company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID);
ALTER TABLE datev_wage_type_mappings NO FORCE ROW LEVEL SECURITY;

-- Bewusst ohne UPDATE und ohne DELETE: die Anwendung legt ausschließlich neue
-- Zeilen an, die Ablösung der alten übernimmt der Auslöser oben.
GRANT SELECT, INSERT ON datev_wage_type_mappings TO schaefchen_api;

COMMENT ON TABLE datev_wage_type_mappings IS
    'Zuordnung Zeitart/Abwesenheitsart zu kanzleispezifischer Lohnart und Ausfallschlüssel; eine Änderung löst die bisherige Zeile ab, statt sie zu überschreiben.';

COMMIT;
