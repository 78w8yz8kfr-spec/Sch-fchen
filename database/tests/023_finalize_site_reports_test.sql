\echo 'Teste Migration 023_finalize_site_reports.sql ...'
BEGIN;

DO $$
DECLARE
    tenant_id UUID;
    actor_id UUID;
    customer_id UUID;
    project_id UUID;
    location_id UUID;
    site_id UUID;
    report_id UUID;
    document_id UUID;
    signature BYTEA := decode('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63606060f80f0001040100a50df2850000000049454e44ae426082', 'hex');
BEGIN
    SELECT id INTO tenant_id FROM companies WHERE company_number = 'F-000001';
    INSERT INTO users (company_id, personnel_number, first_name, last_name)
    VALUES (tenant_id, 'FINAL-REPORT', 'Frieda', 'Freigabe') RETURNING id INTO actor_id;
    INSERT INTO customers (company_id, customer_number, customer_type, company_name)
    VALUES (tenant_id, NULL, 'company', 'Freigabekunde') RETURNING id INTO customer_id;
    INSERT INTO projects (company_id, customer_id, project_number, name, status)
    VALUES (tenant_id, customer_id, NULL, 'Freigabeprojekt', 'active') RETURNING id INTO project_id;
    INSERT INTO customer_locations (company_id, customer_id, location_number, name, street, house_number, postal_code, city)
    VALUES (tenant_id, customer_id, NULL, 'Freigabeort', 'Prüfweg', '23', '09111', 'Chemnitz') RETURNING id INTO location_id;
    INSERT INTO construction_sites (company_id, project_id, customer_location_id, site_number, name, status)
    VALUES (tenant_id, project_id, location_id, NULL, 'Freigabebaustelle', 'active') RETURNING id INTO site_id;
    INSERT INTO documents (
        company_id, document_number, title, category, original_file_name, mime_type,
        size_bytes, sha256_hex, uploaded_by_user_id
    ) VALUES (
        tenant_id, NULL, 'Freigegebener Bericht', 'report', 'bericht.pdf', 'application/pdf',
        10, repeat('a', 64), actor_id
    ) RETURNING id INTO document_id;
    INSERT INTO document_contents (company_id, document_id, content)
    VALUES (tenant_id, document_id, decode('255044462d312e340a', 'hex'));
    INSERT INTO site_reports (
        company_id, construction_site_id, report_number, report_type, work_date,
        source_mode, summary, status, author_user_id
    ) VALUES (
        tenant_id, site_id, NULL, 'montage', CURRENT_DATE,
        'digital', 'Freigabetest', 'submitted', actor_id
    ) RETURNING id INTO report_id;

    UPDATE site_reports SET
        status = 'approved', approved_by_user_id = actor_id,
        employee_signature_name = 'Frieda Freigabe', employee_signature_data = signature,
        customer_signature_name = 'Kunde Beispiel', customer_signature_data = signature,
        final_document_id = document_id,
        company_snapshot = jsonb_build_object('legalName', 'Schaaf Elektro GmbH'),
        report_snapshot = jsonb_build_object('siteName', 'Freigabebaustelle')
    WHERE id = report_id;

    IF NOT EXISTS (
        SELECT 1 FROM site_reports
        WHERE id = report_id AND status = 'approved' AND approved_at IS NOT NULL
          AND employee_signed_at IS NOT NULL AND customer_signed_at IS NOT NULL
          AND row_version = 2
    ) THEN RAISE EXCEPTION 'Bericht wurde nicht vollständig freigegeben'; END IF;

    BEGIN
        UPDATE site_reports SET summary = 'Nachträglich geändert' WHERE id = report_id;
        RAISE EXCEPTION USING ERRCODE = 'ZX231', MESSAGE = 'Freigegebener Bericht blieb änderbar';
    EXCEPTION WHEN SQLSTATE 'P0001' THEN NULL;
    END;
END;
$$;

ROLLBACK;
\echo 'Migration 023_finalize_site_reports.sql erfolgreich getestet.'
