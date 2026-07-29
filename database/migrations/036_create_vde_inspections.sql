BEGIN;

ALTER TABLE documents
    DROP CONSTRAINT IF EXISTS documents_category_check;
ALTER TABLE documents
    ADD CONSTRAINT documents_category_check CHECK (
        category IN (
            'general',
            'order',
            'plan',
            'report',
            'delivery_note',
            'invoice',
            'photo',
            'inspection'
        )
    );

CREATE TABLE IF NOT EXISTS vde_inspections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    construction_site_id UUID NOT NULL,
    client_inspection_id UUID NOT NULL,
    inspection_number VARCHAR(24) NOT NULL,
    inspection_name VARCHAR(200) NOT NULL,
    inspection_date DATE NOT NULL,
    source_mode VARCHAR(20) NOT NULL DEFAULT 'integrated',
    source_name VARCHAR(255),
    protocol_data JSONB NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    inspector_user_id UUID NOT NULL,
    created_by_user_id UUID NOT NULL,
    updated_by_user_id UUID NOT NULL,
    original_document_id UUID,
    final_document_id UUID,
    completed_by_user_id UUID,
    completed_at TIMESTAMPTZ,
    inspector_signature_data BYTEA,
    inspector_signed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    row_version BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT vde_inspections_company_fkey
        FOREIGN KEY (company_id)
        REFERENCES companies (id) ON DELETE RESTRICT,
    CONSTRAINT vde_inspections_site_fkey
        FOREIGN KEY (company_id, construction_site_id)
        REFERENCES construction_sites (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT vde_inspections_inspector_fkey
        FOREIGN KEY (company_id, inspector_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT vde_inspections_creator_fkey
        FOREIGN KEY (company_id, created_by_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT vde_inspections_updater_fkey
        FOREIGN KEY (company_id, updated_by_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT vde_inspections_completer_fkey
        FOREIGN KEY (company_id, completed_by_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT vde_inspections_original_document_fkey
        FOREIGN KEY (company_id, original_document_id)
        REFERENCES documents (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT vde_inspections_final_document_fkey
        FOREIGN KEY (company_id, final_document_id)
        REFERENCES documents (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT vde_inspections_company_id_id_key UNIQUE (company_id, id),
    CONSTRAINT vde_inspections_company_client_key
        UNIQUE (company_id, client_inspection_id),
    CONSTRAINT vde_inspections_company_number_key
        UNIQUE (company_id, inspection_number),
    CONSTRAINT vde_inspections_number_check
        CHECK (inspection_number ~ '^SE-VDE-[0-9]{4}-[0-9]{5}$'),
    CONSTRAINT vde_inspections_name_check
        CHECK (BTRIM(inspection_name) <> ''),
    CONSTRAINT vde_inspections_source_check CHECK (
        (source_mode = 'integrated' AND source_name IS NULL)
        OR
        (
            source_mode = 'legacy_v15'
            AND source_name IS NOT NULL
            AND BTRIM(source_name) <> ''
        )
    ),
    CONSTRAINT vde_inspections_protocol_check CHECK (
        jsonb_typeof(protocol_data) = 'object'
        AND protocol_data ? 'schemaVersion'
        AND jsonb_typeof(protocol_data -> 'schemaVersion') = 'number'
    ),
    CONSTRAINT vde_inspections_status_check
        CHECK (status IN ('draft', 'completed')),
    CONSTRAINT vde_inspections_completion_check CHECK (
        (
            status = 'draft'
            AND final_document_id IS NULL
            AND completed_by_user_id IS NULL
            AND completed_at IS NULL
            AND inspector_signature_data IS NULL
            AND inspector_signed_at IS NULL
        )
        OR
        (
            status = 'completed'
            AND final_document_id IS NOT NULL
            AND completed_by_user_id IS NOT NULL
            AND completed_at IS NOT NULL
            AND inspector_signature_data IS NOT NULL
            AND inspector_signed_at IS NOT NULL
        )
    ),
    CONSTRAINT vde_inspections_signature_size_check CHECK (
        inspector_signature_data IS NULL
        OR OCTET_LENGTH(inspector_signature_data) BETWEEN 50 AND 500000
    ),
    CONSTRAINT vde_inspections_distinct_documents_check CHECK (
        original_document_id IS NULL
        OR final_document_id IS NULL
        OR original_document_id <> final_document_id
    ),
    CONSTRAINT vde_inspections_row_version_check CHECK (row_version >= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS vde_inspections_final_document_key
    ON vde_inspections (company_id, final_document_id)
    WHERE final_document_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS vde_inspections_site_date_idx
    ON vde_inspections (
        company_id,
        construction_site_id,
        inspection_date DESC,
        created_at DESC
    );

CREATE OR REPLACE FUNCTION next_vde_inspection_number(
    target_company_id UUID,
    target_year INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER
)
RETURNS VARCHAR(24)
LANGUAGE plpgsql
AS $$
DECLARE
    next_number INTEGER;
BEGIN
    PERFORM pg_advisory_xact_lock(
        hashtextextended(
            'vde_inspections:' || target_company_id::TEXT || ':' || target_year::TEXT,
            0
        )
    );

    SELECT COALESCE(MAX(RIGHT(inspection_number, 5)::INTEGER), 0) + 1
    INTO next_number
    FROM vde_inspections
    WHERE company_id = target_company_id
      AND inspection_number LIKE 'SE-VDE-' || target_year::TEXT || '-%';

    IF next_number > 99999 THEN
        RAISE EXCEPTION
            'VDE-Prüfnummernkreis % für Firma % ist ausgeschöpft',
            target_year,
            target_company_id;
    END IF;

    RETURN
        'SE-VDE-'
        || target_year::TEXT
        || '-'
        || LPAD(next_number::TEXT, 5, '0');
END;
$$;

CREATE OR REPLACE FUNCTION vde_inspections_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NULLIF(BTRIM(NEW.inspection_number), '') IS NULL THEN
        NEW.inspection_number := next_vde_inspection_number(NEW.company_id);
    END IF;

    NEW.inspection_number := UPPER(BTRIM(NEW.inspection_number));
    NEW.inspection_name := BTRIM(NEW.inspection_name);
    NEW.source_mode := LOWER(BTRIM(NEW.source_mode));
    NEW.source_name := NULLIF(BTRIM(NEW.source_name), '');
    NEW.status := LOWER(BTRIM(NEW.status));

    IF TG_OP = 'UPDATE' THEN
        IF OLD.status = 'completed' THEN
            RAISE EXCEPTION 'Eine abgeschlossene VDE-Prüfung ist unveränderlich.';
        END IF;
        IF NEW.company_id <> OLD.company_id
            OR NEW.construction_site_id <> OLD.construction_site_id
            OR NEW.client_inspection_id <> OLD.client_inspection_id
            OR NEW.inspection_number <> OLD.inspection_number
            OR NEW.source_mode <> OLD.source_mode
            OR NEW.source_name IS DISTINCT FROM OLD.source_name
            OR NEW.inspector_user_id <> OLD.inspector_user_id
            OR NEW.created_by_user_id <> OLD.created_by_user_id
            OR NEW.original_document_id IS DISTINCT FROM OLD.original_document_id THEN
            RAISE EXCEPTION
                'Mandant, Baustelle, Quelle, Nummer, Prüfer und Original einer VDE-Prüfung sind unveränderlich.';
        END IF;
        IF NEW.status = 'completed' AND OLD.status <> 'draft' THEN
            RAISE EXCEPTION 'Nur ein VDE-Entwurf darf abgeschlossen werden.';
        END IF;
        NEW.updated_at := CURRENT_TIMESTAMP;
        NEW.row_version := OLD.row_version + 1;
    END IF;

    IF NEW.status = 'completed' THEN
        NEW.completed_at := COALESCE(NEW.completed_at, CURRENT_TIMESTAMP);
        NEW.inspector_signed_at := COALESCE(
            NEW.inspector_signed_at,
            NEW.completed_at
        );
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vde_inspections_before_write_trigger ON vde_inspections;
CREATE TRIGGER vde_inspections_before_write_trigger
    BEFORE INSERT OR UPDATE ON vde_inspections
    FOR EACH ROW EXECUTE FUNCTION vde_inspections_before_write();

CREATE TABLE IF NOT EXISTS vde_inspection_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    inspection_id UUID NOT NULL,
    inspection_row_version BIGINT NOT NULL,
    inspection_name VARCHAR(200) NOT NULL,
    inspection_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL,
    protocol_data JSONB NOT NULL,
    changed_by_user_id UUID NOT NULL,
    original_document_id UUID,
    final_document_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT vde_inspection_versions_inspection_fkey
        FOREIGN KEY (company_id, inspection_id)
        REFERENCES vde_inspections (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT vde_inspection_versions_changer_fkey
        FOREIGN KEY (company_id, changed_by_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT vde_inspection_versions_original_document_fkey
        FOREIGN KEY (company_id, original_document_id)
        REFERENCES documents (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT vde_inspection_versions_final_document_fkey
        FOREIGN KEY (company_id, final_document_id)
        REFERENCES documents (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT vde_inspection_versions_company_version_key
        UNIQUE (company_id, inspection_id, inspection_row_version),
    CONSTRAINT vde_inspection_versions_version_check
        CHECK (inspection_row_version >= 1),
    CONSTRAINT vde_inspection_versions_protocol_check
        CHECK (jsonb_typeof(protocol_data) = 'object')
);

CREATE INDEX IF NOT EXISTS vde_inspection_versions_history_idx
    ON vde_inspection_versions (
        company_id,
        inspection_id,
        inspection_row_version DESC
    );

CREATE OR REPLACE FUNCTION vde_inspections_record_version()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO vde_inspection_versions (
        company_id,
        inspection_id,
        inspection_row_version,
        inspection_name,
        inspection_date,
        status,
        protocol_data,
        changed_by_user_id,
        original_document_id,
        final_document_id,
        created_at
    ) VALUES (
        NEW.company_id,
        NEW.id,
        NEW.row_version,
        NEW.inspection_name,
        NEW.inspection_date,
        NEW.status,
        NEW.protocol_data,
        NEW.updated_by_user_id,
        NEW.original_document_id,
        NEW.final_document_id,
        NEW.updated_at
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vde_inspections_record_version_trigger ON vde_inspections;
CREATE TRIGGER vde_inspections_record_version_trigger
    AFTER INSERT OR UPDATE ON vde_inspections
    FOR EACH ROW EXECUTE FUNCTION vde_inspections_record_version();

CREATE OR REPLACE FUNCTION vde_inspections_prevent_hard_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF CURRENT_SETTING('app.allow_hard_delete', TRUE) = 'on' THEN
        RETURN OLD;
    END IF;
    RAISE EXCEPTION
        'VDE-Prüfungen dürfen nicht hart gelöscht werden; ihre Historie bleibt erhalten.';
END;
$$;

DROP TRIGGER IF EXISTS vde_inspections_prevent_hard_delete_trigger ON vde_inspections;
CREATE TRIGGER vde_inspections_prevent_hard_delete_trigger
    BEFORE DELETE ON vde_inspections
    FOR EACH ROW EXECUTE FUNCTION vde_inspections_prevent_hard_delete();

CREATE OR REPLACE FUNCTION vde_inspection_versions_prevent_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF CURRENT_SETTING('app.allow_hard_delete', TRUE) = 'on' THEN
        RETURN OLD;
    END IF;
    RAISE EXCEPTION 'Die Versionshistorie einer VDE-Prüfung ist unveränderlich.';
END;
$$;

DROP TRIGGER IF EXISTS vde_inspection_versions_prevent_change_trigger
    ON vde_inspection_versions;
CREATE TRIGGER vde_inspection_versions_prevent_change_trigger
    BEFORE UPDATE OR DELETE ON vde_inspection_versions
    FOR EACH ROW EXECUTE FUNCTION vde_inspection_versions_prevent_change();

ALTER TABLE vde_inspections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vde_inspections_tenant_isolation ON vde_inspections;
CREATE POLICY vde_inspections_tenant_isolation ON vde_inspections
    USING (
        company_id
        = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID
    )
    WITH CHECK (
        company_id
        = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID
    );

ALTER TABLE vde_inspection_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vde_inspection_versions_tenant_isolation
    ON vde_inspection_versions;
CREATE POLICY vde_inspection_versions_tenant_isolation
    ON vde_inspection_versions
    USING (
        company_id
        = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID
    )
    WITH CHECK (
        company_id
        = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID
    );

GRANT SELECT, INSERT, UPDATE ON vde_inspections TO schaefchen_api;
GRANT SELECT, INSERT ON vde_inspection_versions TO schaefchen_api;

ALTER TABLE vde_inspections NO FORCE ROW LEVEL SECURITY;
ALTER TABLE vde_inspection_versions NO FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE vde_inspections IS
    'Aktivierbares VDE-Fachmodul: strukturierte Prüfungen referenzieren den gemeinsamen Schäfchen-Baustellenbestand.';
COMMENT ON TABLE vde_inspection_versions IS
    'Unveränderliche vollständige Versionshistorie jedes VDE-Entwurfs und Abschlusses.';
COMMENT ON COLUMN vde_inspections.protocol_data IS
    'Technische VDE-Fachdaten ohne kopierte Firmen-, Kunden-, Projekt-, Baustellen- oder Prüferstammdaten.';
COMMENT ON COLUMN vde_inspections.original_document_id IS
    'Optional unverändert bewahrtes Original-PDF einer importierten V15-Prüfung.';
COMMENT ON COLUMN vde_inspections.final_document_id IS
    'Unveränderliche Abschluss-PDF in der zentralen Schäfchen-Dokumentablage.';

COMMIT;
