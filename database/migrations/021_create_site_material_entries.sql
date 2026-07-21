BEGIN;

CREATE TABLE IF NOT EXISTS site_material_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    construction_site_id UUID NOT NULL,
    item_name VARCHAR(180) NOT NULL,
    quantity NUMERIC(12,3) NOT NULL,
    unit VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'planned',
    note TEXT,
    created_by_user_id UUID NOT NULL,
    changed_by_user_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    row_version BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT site_material_entries_company_fkey
        FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE RESTRICT,
    CONSTRAINT site_material_entries_site_fkey
        FOREIGN KEY (company_id, construction_site_id)
        REFERENCES construction_sites (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT site_material_entries_creator_fkey
        FOREIGN KEY (company_id, created_by_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT site_material_entries_changer_fkey
        FOREIGN KEY (company_id, changed_by_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT site_material_entries_company_id_id_key UNIQUE (company_id, id),
    CONSTRAINT site_material_entries_name_check CHECK (BTRIM(item_name) <> ''),
    CONSTRAINT site_material_entries_quantity_check CHECK (quantity > 0 AND quantity <= 999999999),
    CONSTRAINT site_material_entries_unit_check CHECK (BTRIM(unit) <> ''),
    CONSTRAINT site_material_entries_status_check CHECK (status IN ('planned', 'ordered', 'available', 'used', 'archived')),
    CONSTRAINT site_material_entries_note_check CHECK (note IS NULL OR BTRIM(note) <> '')
);

CREATE INDEX IF NOT EXISTS site_material_entries_site_status_idx
    ON site_material_entries (company_id, construction_site_id, status, created_at DESC);

CREATE OR REPLACE FUNCTION site_material_entries_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.item_name := BTRIM(NEW.item_name);
    NEW.unit := BTRIM(NEW.unit);
    NEW.note := NULLIF(BTRIM(NEW.note), '');
    NEW.status := LOWER(BTRIM(NEW.status));
    IF TG_OP = 'UPDATE' THEN
        IF NEW.company_id <> OLD.company_id OR NEW.construction_site_id <> OLD.construction_site_id
           OR NEW.created_by_user_id <> OLD.created_by_user_id THEN
            RAISE EXCEPTION 'Firma, Baustelle und Ersteller eines Materialeintrags sind unveränderlich.';
        END IF;
        NEW.updated_at := CURRENT_TIMESTAMP;
        NEW.row_version := OLD.row_version + 1;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS site_material_entries_before_write_trigger ON site_material_entries;
CREATE TRIGGER site_material_entries_before_write_trigger
    BEFORE INSERT OR UPDATE ON site_material_entries
    FOR EACH ROW EXECUTE FUNCTION site_material_entries_before_write();

CREATE OR REPLACE FUNCTION site_material_entries_prevent_hard_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF CURRENT_SETTING('app.allow_hard_delete', TRUE) = 'on' THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'Baustellenmaterial darf nicht hart gelöscht werden.';
END;
$$;

DROP TRIGGER IF EXISTS site_material_entries_prevent_hard_delete_trigger ON site_material_entries;
CREATE TRIGGER site_material_entries_prevent_hard_delete_trigger
    BEFORE DELETE ON site_material_entries
    FOR EACH ROW EXECUTE FUNCTION site_material_entries_prevent_hard_delete();

ALTER TABLE site_material_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS site_material_entries_tenant_isolation ON site_material_entries;
CREATE POLICY site_material_entries_tenant_isolation ON site_material_entries
    USING (company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID)
    WITH CHECK (company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID);

GRANT SELECT, INSERT, UPDATE ON site_material_entries TO schaefchen_api;
ALTER TABLE site_material_entries NO FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE site_material_entries IS 'Einfache Materialplanung und -verwendung direkt an der Baustelle.';

COMMIT;
