BEGIN;

ALTER TABLE documents
    ADD COLUMN IF NOT EXISTS mobile_visible BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS offline_priority BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'documents_offline_requires_mobile_check'
    ) THEN
        ALTER TABLE documents
            ADD CONSTRAINT documents_offline_requires_mobile_check
            CHECK (NOT offline_priority OR mobile_visible);
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS documents_mobile_workspace_idx
    ON documents (company_id, mobile_visible, offline_priority, status, created_at DESC);

UPDATE construction_sites
SET qr_code = gen_random_uuid()::TEXT
WHERE qr_code IS NULL;

CREATE OR REPLACE FUNCTION construction_sites_ensure_qr_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NULLIF(BTRIM(NEW.qr_code), '') IS NULL THEN
        NEW.qr_code := gen_random_uuid()::TEXT;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS construction_sites_zz_ensure_qr_code_trigger
    ON construction_sites;
CREATE TRIGGER construction_sites_zz_ensure_qr_code_trigger
    BEFORE INSERT OR UPDATE ON construction_sites
    FOR EACH ROW EXECUTE FUNCTION construction_sites_ensure_qr_code();

ALTER TABLE site_reports
    ADD COLUMN IF NOT EXISTS returned_by_user_id UUID,
    ADD COLUMN IF NOT EXISTS returned_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS return_comment TEXT,
    ADD COLUMN IF NOT EXISTS return_count INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'site_reports_returned_by_fkey'
    ) THEN
        ALTER TABLE site_reports
            ADD CONSTRAINT site_reports_returned_by_fkey
            FOREIGN KEY (company_id, returned_by_user_id)
            REFERENCES users (company_id, id) ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'site_reports_return_count_check'
    ) THEN
        ALTER TABLE site_reports
            ADD CONSTRAINT site_reports_return_count_check
            CHECK (return_count >= 0);
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'site_reports_return_comment_check'
    ) THEN
        ALTER TABLE site_reports
            ADD CONSTRAINT site_reports_return_comment_check
            CHECK (
                return_comment IS NULL
                OR CHAR_LENGTH(BTRIM(return_comment)) BETWEEN 2 AND 1000
            );
    END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS site_report_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    site_report_id UUID NOT NULL,
    event_type VARCHAR(30) NOT NULL,
    actor_user_id UUID NOT NULL,
    comment TEXT,
    report_snapshot JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT site_report_events_report_fkey
        FOREIGN KEY (company_id, site_report_id)
        REFERENCES site_reports (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT site_report_events_actor_fkey
        FOREIGN KEY (company_id, actor_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT site_report_events_company_fkey
        FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE RESTRICT,
    CONSTRAINT site_report_events_type_check
        CHECK (event_type IN ('draft', 'submitted', 'returned', 'resubmitted', 'approved', 'archived')),
    CONSTRAINT site_report_events_comment_check
        CHECK (comment IS NULL OR CHAR_LENGTH(BTRIM(comment)) BETWEEN 2 AND 1000),
    CONSTRAINT site_report_events_snapshot_check
        CHECK (jsonb_typeof(report_snapshot) = 'object')
);

CREATE INDEX IF NOT EXISTS site_report_events_report_idx
    ON site_report_events (company_id, site_report_id, created_at, id);

INSERT INTO site_report_events (
    company_id,
    site_report_id,
    event_type,
    actor_user_id,
    comment,
    report_snapshot,
    created_at
)
SELECT
    report.company_id,
    report.id,
    CASE report.status
        WHEN 'draft' THEN 'draft'
        WHEN 'returned' THEN 'returned'
        WHEN 'approved' THEN 'approved'
        WHEN 'archived' THEN 'archived'
        ELSE 'submitted'
    END,
    COALESCE(
        report.returned_by_user_id,
        report.approved_by_user_id,
        report.author_user_id
    ),
    CASE WHEN report.status = 'returned' THEN report.return_comment ELSE NULL END,
    jsonb_build_object(
        'status', report.status,
        'rowVersion', report.row_version,
        'summary', report.summary,
        'workDate', report.work_date,
        'reportType', report.report_type
    ),
    COALESCE(report.approved_at, report.submitted_at, report.created_at)
FROM site_reports AS report
WHERE NOT EXISTS (
    SELECT 1
    FROM site_report_events AS event
    WHERE event.company_id = report.company_id
      AND event.site_report_id = report.id
);

CREATE OR REPLACE FUNCTION site_report_events_after_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    event_name VARCHAR(30);
    actor_id UUID;
    event_comment TEXT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        event_name := CASE NEW.status
            WHEN 'draft' THEN 'draft'
            WHEN 'approved' THEN 'approved'
            WHEN 'archived' THEN 'archived'
            WHEN 'returned' THEN 'returned'
            ELSE 'submitted'
        END;
    ELSIF NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RETURN NEW;
    ELSIF NEW.status = 'submitted' AND OLD.status = 'returned' THEN
        event_name := 'resubmitted';
    ELSE
        event_name := NEW.status;
    END IF;

    actor_id := CASE event_name
        WHEN 'returned' THEN COALESCE(NEW.returned_by_user_id, NEW.author_user_id)
        WHEN 'approved' THEN COALESCE(NEW.approved_by_user_id, NEW.author_user_id)
        ELSE NEW.author_user_id
    END;
    event_comment := CASE event_name
        WHEN 'returned' THEN NEW.return_comment
        ELSE NULL
    END;

    INSERT INTO site_report_events (
        company_id,
        site_report_id,
        event_type,
        actor_user_id,
        comment,
        report_snapshot
    ) VALUES (
        NEW.company_id,
        NEW.id,
        event_name,
        actor_id,
        event_comment,
        jsonb_build_object(
            'status', NEW.status,
            'rowVersion', NEW.row_version,
            'summary', NEW.summary,
            'workDate', NEW.work_date,
            'reportType', NEW.report_type,
            'structuredData', NEW.structured_data
        )
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS site_report_events_after_write_trigger ON site_reports;
CREATE TRIGGER site_report_events_after_write_trigger
    AFTER INSERT OR UPDATE ON site_reports
    FOR EACH ROW EXECUTE FUNCTION site_report_events_after_write();

CREATE OR REPLACE FUNCTION site_report_events_prevent_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF CURRENT_SETTING('app.allow_hard_delete', TRUE) = 'on' THEN
        RETURN OLD;
    END IF;
    RAISE EXCEPTION 'Die Berichtshistorie ist unveränderlich.';
END;
$$;

DROP TRIGGER IF EXISTS site_report_events_prevent_change_trigger ON site_report_events;
CREATE TRIGGER site_report_events_prevent_change_trigger
    BEFORE UPDATE OR DELETE ON site_report_events
    FOR EACH ROW EXECUTE FUNCTION site_report_events_prevent_change();

ALTER TABLE site_report_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS site_report_events_tenant_isolation ON site_report_events;
CREATE POLICY site_report_events_tenant_isolation ON site_report_events
    USING (company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID)
    WITH CHECK (company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID);

GRANT SELECT, INSERT ON site_report_events TO schaefchen_api;
ALTER TABLE site_report_events NO FORCE ROW LEVEL SECURITY;

COMMENT ON COLUMN documents.mobile_visible IS
    'Bürofreigabe für die tagesbezogene mobile Baustellenakte.';
COMMENT ON COLUMN documents.offline_priority IS
    'Kennzeichnet freigegebene Pläne und Dokumente für die gerätebezogene Offline-Ablage.';
COMMENT ON TABLE site_report_events IS
    'Unveränderliche Status- und Rückgabehistorie eines Baustellenberichts.';

COMMIT;
