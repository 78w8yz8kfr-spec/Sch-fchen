-- Neue Lagerstruktur, getrennt vom in 141 entfernten Altsystem.
-- Keine stock_*/warehouse-Namen: 141 läuft bei jedem Render-Neustart erneut.
BEGIN;

INSERT INTO module_catalog (module_key, name, description, category, is_special, requires_platform_approval)
VALUES ('inventory_structure', 'Lagerstruktur', 'Lager, Bereiche, Regale und Fächer mit Änderungshistorie. Noch keine Bestandsbuchungen.', 'business', FALSE, TRUE)
ON CONFLICT (module_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS inventory_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    parent_id UUID,
    kind VARCHAR(20) NOT NULL CHECK (kind IN ('depot', 'area', 'rack', 'bin')),
    code VARCHAR(30) NOT NULL CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]{0,29}$'),
    name VARCHAR(120) NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_by_user_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    row_version BIGINT NOT NULL DEFAULT 1,
    UNIQUE (company_id, id),
    UNIQUE NULLS NOT DISTINCT (company_id, parent_id, code),
    FOREIGN KEY (company_id, parent_id) REFERENCES inventory_locations(company_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (company_id, created_by_user_id) REFERENCES users(company_id, id) ON DELETE RESTRICT,
    CHECK ((kind = 'depot') = (parent_id IS NULL))
);

CREATE OR REPLACE FUNCTION inventory_locations_guard() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE parent_kind TEXT; parent_status TEXT;
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Lagerplätze archivieren statt löschen' USING ERRCODE = '23514';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('inventory:' || NEW.company_id::TEXT, 0));
    IF TG_OP = 'UPDATE' THEN
        IF (NEW.id, NEW.company_id, NEW.parent_id, NEW.kind, NEW.created_by_user_id, NEW.created_at)
           IS DISTINCT FROM (OLD.id, OLD.company_id, OLD.parent_id, OLD.kind, OLD.created_by_user_id, OLD.created_at) THEN
            RAISE EXCEPTION 'Zuordnung und Herkunft eines Lagerplatzes bleiben unverändert' USING ERRCODE = '23514';
        END IF;
        NEW.row_version := OLD.row_version + 1;
        NEW.updated_at := CURRENT_TIMESTAMP;
    END IF;
    IF NEW.parent_id IS NOT NULL THEN
        SELECT kind, status INTO parent_kind, parent_status
        FROM inventory_locations WHERE company_id = NEW.company_id AND id = NEW.parent_id;
        IF parent_kind IS DISTINCT FROM (CASE NEW.kind WHEN 'area' THEN 'depot' WHEN 'rack' THEN 'area' WHEN 'bin' THEN 'rack' END)
           OR (NEW.status = 'active' AND parent_status IS DISTINCT FROM 'active') THEN
            RAISE EXCEPTION 'Übergeordneter Lagerplatz fehlt, ist archiviert oder hat die falsche Ebene' USING ERRCODE = '23514';
        END IF;
    END IF;
    IF NEW.status = 'archived' AND EXISTS (
        SELECT 1 FROM inventory_locations WHERE company_id = NEW.company_id AND parent_id = NEW.id AND status = 'active'
    ) THEN
        RAISE EXCEPTION 'Zuerst die untergeordneten Lagerplätze archivieren' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS inventory_locations_guard_trigger ON inventory_locations;
CREATE TRIGGER inventory_locations_guard_trigger BEFORE INSERT OR UPDATE OR DELETE ON inventory_locations
FOR EACH ROW EXECUTE FUNCTION inventory_locations_guard();

ALTER TABLE inventory_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_locations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inventory_locations_tenant ON inventory_locations;
CREATE POLICY inventory_locations_tenant ON inventory_locations
USING (company_id = NULLIF(current_setting('app.current_company_id', TRUE), '')::UUID)
WITH CHECK (company_id = NULLIF(current_setting('app.current_company_id', TRUE), '')::UUID);
GRANT SELECT, INSERT, UPDATE ON inventory_locations TO schaefchen_api;
COMMIT;
