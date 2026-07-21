BEGIN;

ALTER TABLE site_reports
    ADD COLUMN IF NOT EXISTS approved_by_user_id UUID,
    ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS employee_signature_name VARCHAR(200),
    ADD COLUMN IF NOT EXISTS employee_signature_data BYTEA,
    ADD COLUMN IF NOT EXISTS employee_signed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS customer_signature_name VARCHAR(200),
    ADD COLUMN IF NOT EXISTS customer_signature_data BYTEA,
    ADD COLUMN IF NOT EXISTS customer_signed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS final_document_id UUID,
    ADD COLUMN IF NOT EXISTS company_snapshot JSONB,
    ADD COLUMN IF NOT EXISTS report_snapshot JSONB;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'site_reports_approver_fkey') THEN
        ALTER TABLE site_reports ADD CONSTRAINT site_reports_approver_fkey
            FOREIGN KEY (company_id, approved_by_user_id)
            REFERENCES users (company_id, id) ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'site_reports_final_document_fkey') THEN
        ALTER TABLE site_reports ADD CONSTRAINT site_reports_final_document_fkey
            FOREIGN KEY (company_id, final_document_id)
            REFERENCES documents (company_id, id) ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'site_reports_employee_signature_size_check') THEN
        ALTER TABLE site_reports ADD CONSTRAINT site_reports_employee_signature_size_check
            CHECK (employee_signature_data IS NULL OR OCTET_LENGTH(employee_signature_data) BETWEEN 50 AND 500000);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'site_reports_customer_signature_size_check') THEN
        ALTER TABLE site_reports ADD CONSTRAINT site_reports_customer_signature_size_check
            CHECK (customer_signature_data IS NULL OR OCTET_LENGTH(customer_signature_data) BETWEEN 50 AND 500000);
    END IF;
END;
$$;

ALTER TABLE site_reports DROP CONSTRAINT IF EXISTS site_reports_approved_check;
ALTER TABLE site_reports ADD CONSTRAINT site_reports_approved_check CHECK (
    status <> 'approved'
    OR (
        approved_by_user_id IS NOT NULL
        AND approved_at IS NOT NULL
        AND NULLIF(BTRIM(employee_signature_name), '') IS NOT NULL
        AND employee_signature_data IS NOT NULL
        AND employee_signed_at IS NOT NULL
        AND NULLIF(BTRIM(customer_signature_name), '') IS NOT NULL
        AND customer_signature_data IS NOT NULL
        AND customer_signed_at IS NOT NULL
        AND final_document_id IS NOT NULL
        AND company_snapshot IS NOT NULL
        AND report_snapshot IS NOT NULL
        AND jsonb_typeof(company_snapshot) = 'object'
        AND jsonb_typeof(report_snapshot) = 'object'
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS site_reports_final_document_key
    ON site_reports (company_id, final_document_id)
    WHERE final_document_id IS NOT NULL;

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
    NEW.employee_signature_name := NULLIF(BTRIM(NEW.employee_signature_name), '');
    NEW.customer_signature_name := NULLIF(BTRIM(NEW.customer_signature_name), '');

    IF NEW.status IN ('submitted', 'approved') THEN
        NEW.submitted_at := COALESCE(NEW.submitted_at, CURRENT_TIMESTAMP);
    ELSE
        NEW.submitted_at := NULL;
    END IF;
    IF NEW.status = 'approved' THEN
        NEW.approved_at := COALESCE(NEW.approved_at, CURRENT_TIMESTAMP);
        NEW.employee_signed_at := COALESCE(NEW.employee_signed_at, NEW.approved_at);
        NEW.customer_signed_at := COALESCE(NEW.customer_signed_at, NEW.approved_at);
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
        IF NEW.status = 'approved' AND OLD.status <> 'submitted' THEN
            RAISE EXCEPTION 'Nur ein eingereichter Bericht darf freigegeben werden.';
        END IF;
        NEW.updated_at := CURRENT_TIMESTAMP;
        NEW.row_version := OLD.row_version + 1;
    END IF;
    RETURN NEW;
END;
$$;

GRANT SELECT, INSERT, UPDATE ON site_reports TO schaefchen_api;

COMMENT ON COLUMN site_reports.company_snapshot IS 'Historische Firmendaten der unveränderlichen PDF-Ausgabe.';
COMMENT ON COLUMN site_reports.report_snapshot IS 'Historischer Kunde-, Projekt- und Baustellenbezug der PDF-Ausgabe.';
COMMENT ON COLUMN site_reports.final_document_id IS 'Zentral gespeicherte unveränderliche PDF-Version nach beiden Unterschriften.';

COMMIT;
