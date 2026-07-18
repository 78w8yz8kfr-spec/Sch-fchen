BEGIN;

CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    document_number VARCHAR(24) NOT NULL,
    title VARCHAR(200) NOT NULL,
    category VARCHAR(30) NOT NULL DEFAULT 'general',
    original_file_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(120) NOT NULL,
    size_bytes INTEGER NOT NULL,
    sha256_hex CHAR(64) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    uploaded_by_user_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    archived_at TIMESTAMPTZ,
    row_version BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT documents_company_id_fkey
        FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE RESTRICT,
    CONSTRAINT documents_uploader_fkey
        FOREIGN KEY (company_id, uploaded_by_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT documents_company_id_id_key UNIQUE (company_id, id),
    CONSTRAINT documents_company_number_key UNIQUE (company_id, document_number),
    CONSTRAINT documents_company_sha256_key UNIQUE (company_id, sha256_hex),
    CONSTRAINT documents_number_check
        CHECK (document_number ~ '^SE-D-[0-9]{4}-[0-9]{5}$'),
    CONSTRAINT documents_title_check CHECK (BTRIM(title) <> ''),
    CONSTRAINT documents_category_check CHECK (
        category IN ('general', 'order', 'plan', 'report', 'delivery_note', 'invoice', 'photo')
    ),
    CONSTRAINT documents_file_name_check CHECK (
        BTRIM(original_file_name) <> ''
        AND original_file_name !~ '[\\/]'
    ),
    CONSTRAINT documents_mime_type_check CHECK (BTRIM(mime_type) <> ''),
    CONSTRAINT documents_size_check CHECK (size_bytes BETWEEN 1 AND 5000000),
    CONSTRAINT documents_sha256_check CHECK (sha256_hex ~ '^[0-9a-f]{64}$'),
    CONSTRAINT documents_status_check CHECK (status IN ('active', 'archived')),
    CONSTRAINT documents_archive_check CHECK (
        (status = 'active' AND archived_at IS NULL)
        OR (status = 'archived' AND archived_at IS NOT NULL)
    )
);

CREATE TABLE IF NOT EXISTS document_contents (
    company_id UUID NOT NULL,
    document_id UUID NOT NULL,
    content BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (company_id, document_id),
    CONSTRAINT document_contents_document_fkey
        FOREIGN KEY (company_id, document_id)
        REFERENCES documents (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT document_contents_size_check
        CHECK (OCTET_LENGTH(content) BETWEEN 1 AND 5000000)
);

CREATE TABLE IF NOT EXISTS document_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    document_id UUID NOT NULL,
    entity_type VARCHAR(30) NOT NULL,
    customer_id UUID,
    project_id UUID,
    construction_site_id UUID,
    created_by_user_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT document_links_document_fkey
        FOREIGN KEY (company_id, document_id)
        REFERENCES documents (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT document_links_customer_fkey
        FOREIGN KEY (company_id, customer_id)
        REFERENCES customers (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT document_links_project_fkey
        FOREIGN KEY (company_id, project_id)
        REFERENCES projects (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT document_links_site_fkey
        FOREIGN KEY (company_id, construction_site_id)
        REFERENCES construction_sites (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT document_links_creator_fkey
        FOREIGN KEY (company_id, created_by_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT document_links_target_check CHECK (
        (entity_type = 'customer' AND customer_id IS NOT NULL AND project_id IS NULL AND construction_site_id IS NULL)
        OR
        (entity_type = 'project' AND customer_id IS NULL AND project_id IS NOT NULL AND construction_site_id IS NULL)
        OR
        (entity_type = 'construction_site' AND customer_id IS NULL AND project_id IS NULL AND construction_site_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS documents_company_status_idx
    ON documents (company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS document_links_customer_idx
    ON document_links (company_id, customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS document_links_project_idx
    ON document_links (company_id, project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS document_links_site_idx
    ON document_links (company_id, construction_site_id) WHERE construction_site_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS document_links_customer_key
    ON document_links (company_id, document_id, customer_id) WHERE customer_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS document_links_project_key
    ON document_links (company_id, document_id, project_id) WHERE project_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS document_links_site_key
    ON document_links (company_id, document_id, construction_site_id) WHERE construction_site_id IS NOT NULL;

CREATE OR REPLACE FUNCTION next_document_number(
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
        hashtextextended('documents:' || target_company_id::TEXT || ':' || target_year::TEXT, 0)
    );

    SELECT COALESCE(MAX(RIGHT(document_number, 5)::INTEGER), 0) + 1
    INTO next_number
    FROM documents
    WHERE company_id = target_company_id
      AND document_number LIKE 'SE-D-' || target_year::TEXT || '-%';

    IF next_number > 99999 THEN
        RAISE EXCEPTION 'Dokumentnummernkreis % für Firma % ist ausgeschöpft', target_year, target_company_id;
    END IF;

    RETURN 'SE-D-' || target_year::TEXT || '-' || LPAD(next_number::TEXT, 5, '0');
END;
$$;

CREATE OR REPLACE FUNCTION documents_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NULLIF(BTRIM(NEW.document_number), '') IS NULL THEN
        NEW.document_number := next_document_number(NEW.company_id);
    END IF;

    NEW.document_number := UPPER(BTRIM(NEW.document_number));
    NEW.title := BTRIM(NEW.title);
    NEW.category := LOWER(BTRIM(NEW.category));
    NEW.original_file_name := BTRIM(NEW.original_file_name);
    NEW.mime_type := LOWER(BTRIM(NEW.mime_type));
    NEW.sha256_hex := LOWER(BTRIM(NEW.sha256_hex));

    IF NEW.status = 'archived' THEN
        NEW.archived_at := COALESCE(NEW.archived_at, CURRENT_TIMESTAMP);
    ELSE
        NEW.archived_at := NULL;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF NEW.company_id <> OLD.company_id
            OR NEW.document_number <> OLD.document_number
            OR NEW.original_file_name <> OLD.original_file_name
            OR NEW.mime_type <> OLD.mime_type
            OR NEW.size_bytes <> OLD.size_bytes
            OR NEW.sha256_hex <> OLD.sha256_hex
            OR NEW.uploaded_by_user_id <> OLD.uploaded_by_user_id THEN
            RAISE EXCEPTION 'Mandant, Nummer und Dateiinhalt eines Dokuments sind unveränderlich.';
        END IF;
        NEW.updated_at := CURRENT_TIMESTAMP;
        NEW.row_version := OLD.row_version + 1;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS documents_before_write_trigger ON documents;
CREATE TRIGGER documents_before_write_trigger
    BEFORE INSERT OR UPDATE ON documents
    FOR EACH ROW EXECUTE FUNCTION documents_before_write();

CREATE OR REPLACE FUNCTION documents_prevent_hard_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF CURRENT_SETTING('app.allow_hard_delete', TRUE) = 'on' THEN
        RETURN OLD;
    END IF;
    RAISE EXCEPTION 'Dokumente und Dokumentverknüpfungen dürfen nicht hart gelöscht werden.';
END;
$$;

DROP TRIGGER IF EXISTS documents_prevent_hard_delete_trigger ON documents;
CREATE TRIGGER documents_prevent_hard_delete_trigger
    BEFORE DELETE ON documents
    FOR EACH ROW EXECUTE FUNCTION documents_prevent_hard_delete();
DROP TRIGGER IF EXISTS document_contents_prevent_change_trigger ON document_contents;
CREATE TRIGGER document_contents_prevent_change_trigger
    BEFORE UPDATE OR DELETE ON document_contents
    FOR EACH ROW EXECUTE FUNCTION documents_prevent_hard_delete();
DROP TRIGGER IF EXISTS document_links_prevent_change_trigger ON document_links;
CREATE TRIGGER document_links_prevent_change_trigger
    BEFORE UPDATE OR DELETE ON document_links
    FOR EACH ROW EXECUTE FUNCTION documents_prevent_hard_delete();

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_contents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS documents_tenant_isolation ON documents;
CREATE POLICY documents_tenant_isolation ON documents
    USING (company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID)
    WITH CHECK (company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID);
DROP POLICY IF EXISTS document_contents_tenant_isolation ON document_contents;
CREATE POLICY document_contents_tenant_isolation ON document_contents
    USING (company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID)
    WITH CHECK (company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID);
DROP POLICY IF EXISTS document_links_tenant_isolation ON document_links;
CREATE POLICY document_links_tenant_isolation ON document_links
    USING (company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID)
    WITH CHECK (company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID);

GRANT SELECT, INSERT, UPDATE ON documents TO schaefchen_api;
GRANT SELECT, INSERT ON document_contents TO schaefchen_api;
GRANT SELECT, INSERT ON document_links TO schaefchen_api;

ALTER TABLE documents NO FORCE ROW LEVEL SECURITY;
ALTER TABLE document_contents NO FORCE ROW LEVEL SECURITY;
ALTER TABLE document_links NO FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE documents IS 'Zentrale Dokumentmetadaten; ein Dokument wird einmal gespeichert und mehrfach verknüpft.';
COMMENT ON TABLE document_contents IS 'Größenbegrenzter Dateiinhalt für den ersten Online-Stand; getrennt für späteren Objektspeicher-Umzug.';
COMMENT ON TABLE document_links IS 'Verknüpfungen desselben Dokuments mit Kunde, Projekt und Baustelle ohne Dateikopien.';

COMMIT;
