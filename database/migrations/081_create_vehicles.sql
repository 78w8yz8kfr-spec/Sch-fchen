-- Fuhrpark: die Fahrzeuge des Betriebs.
--
-- Das Modul "fleet" steht seit Migration 040 im Katalog, dahinter lag bisher
-- nichts. Ein Elektrobetrieb faehrt mit Transportern zur Baustelle; wer wissen
-- will, welcher Wagen frei ist und wann der naechste zur Hauptuntersuchung
-- muss, hat das bisher auf einem Zettel im Buero stehen.
--
-- Grundsaetze dieser Migration:
--   * Das Kennzeichen ist die Kennung, die im Betrieb benutzt wird. Es ist je
--     Firma nur einmal vergeben - zwei Wagen mit demselben Kennzeichen gibt es
--     nicht, und wer eines doppelt eintraegt, hat sich vertippt.
--   * Ein Fahrzeug kann einem Menschen fest zugeordnet sein ("der Wagen von
--     Markus") oder frei im Hof stehen. Beides ist normal.
--   * Termine, die ablaufen koennen - Hauptuntersuchung, naechster Service -
--     stehen als Datum da, nicht als Text. Nur so kann die App warnen.
--   * Ein ausgemustertes Fahrzeug wird nicht geloescht. Es steht in alten
--     Fahrtenbuechern und Berichten; ein Loeschen wuerde die Vergangenheit
--     unlesbar machen.

BEGIN;

CREATE TABLE IF NOT EXISTS vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
    licence_plate VARCHAR(15) NOT NULL,
    label VARCHAR(120),
    vehicle_type VARCHAR(20) NOT NULL DEFAULT 'van',
    -- Welche Fuehrerscheinklasse man braucht, um ihn zu fahren. Damit kann die
    -- Planung spaeter pruefen, ob der eingeteilte Fahrer den Wagen ueberhaupt
    -- bewegen darf.
    required_licence_class VARCHAR(4) NOT NULL DEFAULT 'B',
    assigned_user_id UUID,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    next_inspection_on DATE,
    next_service_on DATE,
    note TEXT,
    row_version BIGINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT vehicles_type_check CHECK (
        vehicle_type IN ('van', 'truck', 'car', 'trailer', 'machine')
    ),
    CONSTRAINT vehicles_status_check CHECK (
        status IN ('active', 'workshop', 'retired')
    ),
    CONSTRAINT vehicles_licence_class_check CHECK (
        required_licence_class IN ('B', 'B96', 'BE', 'C1', 'C1E', 'C', 'CE', 'T', 'L')
    )
);

-- Der Fahrer gehoert derselben Firma an. Ohne den zusammengesetzten Schluessel
-- koennte ein Fahrzeug einem Menschen aus einem anderen Betrieb gehoeren.
ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS vehicles_assigned_user_fkey;
ALTER TABLE vehicles ADD CONSTRAINT vehicles_assigned_user_fkey
    FOREIGN KEY (company_id, assigned_user_id)
    REFERENCES users (company_id, id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS vehicles_plate_unique
    ON vehicles (company_id, UPPER(REPLACE(licence_plate, ' ', '')));

CREATE INDEX IF NOT EXISTS vehicles_company_status_idx
    ON vehicles (company_id, status, licence_plate);

-- Kennzeichen werden im Betrieb mal mit, mal ohne Leerzeichen geschrieben.
-- Gespeichert wird eine Schreibweise, damit die Suche und die Eindeutigkeit
-- verlaesslich sind.
CREATE OR REPLACE FUNCTION vehicles_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.licence_plate := UPPER(BTRIM(REGEXP_REPLACE(NEW.licence_plate, '\s+', ' ', 'g')));
    NEW.label := NULLIF(BTRIM(NEW.label), '');
    NEW.note := NULLIF(BTRIM(NEW.note), '');
    IF TG_OP = 'UPDATE' THEN
        NEW.row_version := OLD.row_version + 1;
        NEW.updated_at := CURRENT_TIMESTAMP;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vehicles_before_write ON vehicles;
CREATE TRIGGER vehicles_before_write
    BEFORE INSERT OR UPDATE ON vehicles
    FOR EACH ROW EXECUTE FUNCTION vehicles_before_write();

ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vehicles_tenant_isolation ON vehicles;
CREATE POLICY vehicles_tenant_isolation ON vehicles
    USING (company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID)
    WITH CHECK (company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID);
ALTER TABLE vehicles NO FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON vehicles TO schaefchen_api;

COMMENT ON TABLE vehicles IS 'Fahrzeuge des Betriebs mit Fahrer, Terminen und Zustand.';
COMMENT ON COLUMN vehicles.required_licence_class IS
    'Fuehrerscheinklasse, die man zum Fahren braucht. Grundlage fuer die Warnung der Planung.';
COMMENT ON COLUMN vehicles.status IS
    'active = im Einsatz, workshop = in der Werkstatt, retired = ausgemustert.';

COMMIT;
