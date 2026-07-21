BEGIN;

CREATE TABLE IF NOT EXISTS site_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    construction_site_id UUID NOT NULL,
    report_number VARCHAR(24) NOT NULL,
    report_type VARCHAR(20) NOT NULL,
    work_date DATE NOT NULL,
    source_mode VARCHAR(20) NOT NULL DEFAULT 'digital',
    summary VARCHAR(200) NOT NULL,
    details TEXT,
    source_document_id UUID,
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    author_user_id UUID NOT NULL,
    submitted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    row_version BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT site_reports_company_fkey
        FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE RESTRICT,
    CONSTRAINT site_reports_site_fkey
        FOREIGN KEY (company_id, construction_site_id)
        REFERENCES construction_sites (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT site_reports_author_fkey
        FOREIGN KEY (company_id, author_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT site_reports_document_fkey
        FOREIGN KEY (company_id, source_document_id)
        REFERENCES documents (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT site_reports_company_id_id_key UNIQUE (company_id, id),
    CONSTRAINT site_reports_company_number_key UNIQUE (company_id, report_number),
    CONSTRAINT site_reports_number_check CHECK (report_number ~ '^SE-R-[0-9]{4}-[0-9]{5}$'),
    CONSTRAINT site_reports_type_check CHECK (report_type IN ('montage', 'daily')),
    CONSTRAINT site_reports_source_check CHECK (source_mode IN ('digital', 'photo', 'speech')),
    CONSTRAINT site_reports_summary_check CHECK (BTRIM(summary) <> ''),
    CONSTRAINT site_reports_details_check CHECK (details IS NULL OR BTRIM(details) <> ''),
    CONSTRAINT site_reports_photo_document_check CHECK (source_mode <> 'photo' OR source_document_id IS NOT NULL),
    CONSTRAINT site_reports_status_check CHECK (status IN ('draft', 'submitted', 'approved', 'returned', 'archived')),
    CONSTRAINT site_reports_submitted_check CHECK (
        (status IN ('submitted', 'approved') AND submitted_at IS NOT NULL)
        OR (status NOT IN ('submitted', 'approved') AND submitted_at IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS site_reports_site_date_idx
    ON site_reports (company_id, construction_site_id, work_date DESC, created_at DESC);

CREATE OR REPLACE FUNCTION next_site_report_number(
    target_company_id UUID,
    target_year INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER
)
RETURNS VARCHAR(24)
LANGUAGE plpgsql
AS $$
DECLARE next_number INTEGER;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended('site_reports:' || target_company_id::TEXT || ':' || target_year::TEXT, 0));
    SELECT COALESCE(MAX(RIGHT(report_number, 5)::INTEGER), 0) + 1 INTO next_number
    FROM site_reports
    WHERE company_id = target_company_id AND report_number LIKE 'SE-R-' || target_year::TEXT || '-%';
    IF next_number > 99999 THEN RAISE EXCEPTION 'Berichtsnummernkreis ist ausgeschöpft'; END IF;
    RETURN 'SE-R-' || target_year::TEXT || '-' || LPAD(next_number::TEXT, 5, '0');
END;
$$;

CREATE OR REPLACE FUNCTION site_reports_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NULLIF(BTRIM(NEW.report_number), '') IS NULL THEN
        NEW.report_number := next_site_report_number(NEW.company_id, EXTRACT(YEAR FROM NEW.work_date)::INTEGER);
    END IF;
    NEW.report_number := UPPER(BTRIM(NEW.report_number));
    NEW.report_type := LOWER(BTRIM(NEW.report_type));
    NEW.source_mode := LOWER(BTRIM(NEW.source_mode));
    NEW.summary := BTRIM(NEW.summary);
    NEW.details := NULLIF(BTRIM(NEW.details), '');
    NEW.status := LOWER(BTRIM(NEW.status));
    IF NEW.status IN ('submitted', 'approved') THEN
        NEW.submitted_at := COALESCE(NEW.submitted_at, CURRENT_TIMESTAMP);
    ELSE
        NEW.submitted_at := NULL;
    END IF;
    IF TG_OP = 'UPDATE' THEN
        IF NEW.company_id <> OLD.company_id OR NEW.construction_site_id <> OLD.construction_site_id
           OR NEW.report_number <> OLD.report_number OR NEW.author_user_id <> OLD.author_user_id
           OR NEW.source_document_id IS DISTINCT FROM OLD.source_document_id THEN
            RAISE EXCEPTION 'Mandant, Baustelle, Nummer, Autor und Originaldokument eines Berichts sind unveränderlich.';
        END IF;
        IF OLD.status = 'approved' THEN
            RAISE EXCEPTION 'Ein freigegebener Bericht ist unveränderlich.';
        END IF;
        NEW.updated_at := CURRENT_TIMESTAMP;
        NEW.row_version := OLD.row_version + 1;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS site_reports_before_write_trigger ON site_reports;
CREATE TRIGGER site_reports_before_write_trigger
    BEFORE INSERT OR UPDATE ON site_reports
    FOR EACH ROW EXECUTE FUNCTION site_reports_before_write();

CREATE OR REPLACE FUNCTION site_reports_prevent_hard_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF CURRENT_SETTING('app.allow_hard_delete', TRUE) = 'on' THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'Baustellenberichte dürfen nicht hart gelöscht werden.';
END;
$$;

DROP TRIGGER IF EXISTS site_reports_prevent_hard_delete_trigger ON site_reports;
CREATE TRIGGER site_reports_prevent_hard_delete_trigger
    BEFORE DELETE ON site_reports
    FOR EACH ROW EXECUTE FUNCTION site_reports_prevent_hard_delete();

ALTER TABLE site_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS site_reports_tenant_isolation ON site_reports;
CREATE POLICY site_reports_tenant_isolation ON site_reports
    USING (company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID)
    WITH CHECK (company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID);

GRANT SELECT, INSERT, UPDATE ON site_reports TO schaefchen_api;
ALTER TABLE site_reports NO FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE site_reports IS 'Montage- und Bautagesberichte aus digitaler Eingabe, Foto oder Sprache.';

COMMIT;
