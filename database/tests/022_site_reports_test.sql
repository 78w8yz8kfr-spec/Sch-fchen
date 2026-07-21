\echo 'Teste Migration 022_create_site_reports.sql ...'
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
    generated_number VARCHAR(24);
BEGIN
    SELECT id INTO tenant_id FROM companies WHERE company_number = 'F-000001';
    INSERT INTO users (company_id, personnel_number, first_name, last_name)
    VALUES (tenant_id, 'REPORT-TEST', 'Berta', 'Bericht') RETURNING id INTO actor_id;
    INSERT INTO customers (company_id, customer_number, customer_type, company_name)
    VALUES (tenant_id, NULL, 'company', 'Berichtskunde') RETURNING id INTO customer_id;
    INSERT INTO projects (company_id, customer_id, project_number, name, status)
    VALUES (tenant_id, customer_id, NULL, 'Berichtsprojekt', 'active') RETURNING id INTO project_id;
    INSERT INTO customer_locations (company_id, customer_id, location_number, name, street, house_number, postal_code, city)
    VALUES (tenant_id, customer_id, NULL, 'Berichtsort', 'Montageweg', '22', '09111', 'Chemnitz') RETURNING id INTO location_id;
    INSERT INTO construction_sites (company_id, project_id, customer_location_id, site_number, name, status)
    VALUES (tenant_id, project_id, location_id, NULL, 'Berichtsbaustelle', 'active') RETURNING id INTO site_id;

    INSERT INTO site_reports (
        company_id, construction_site_id, report_number, report_type, work_date,
        source_mode, summary, details, status, author_user_id
    ) VALUES (
        tenant_id, site_id, NULL, 'MONTAGE', CURRENT_DATE,
        'DIGITAL', '  Unterverteilung montiert  ', '  Leitungen aufgelegt  ', 'draft', actor_id
    ) RETURNING id, report_number INTO report_id, generated_number;

    IF generated_number !~ '^SE-R-[0-9]{4}-[0-9]{5}$' OR NOT EXISTS (
        SELECT 1 FROM site_reports WHERE id = report_id AND report_type = 'montage' AND summary = 'Unterverteilung montiert'
    ) THEN RAISE EXCEPTION 'Bericht wurde nicht korrekt erzeugt'; END IF;

    UPDATE site_reports SET status = 'submitted' WHERE id = report_id;
    IF NOT EXISTS (SELECT 1 FROM site_reports WHERE id = report_id AND submitted_at IS NOT NULL AND row_version = 2) THEN
        RAISE EXCEPTION 'Berichtsabgabe ist ungültig';
    END IF;

    BEGIN
        DELETE FROM site_reports WHERE id = report_id;
        RAISE EXCEPTION USING ERRCODE = 'ZX221', MESSAGE = 'Hartes Löschen wurde akzeptiert';
    EXCEPTION WHEN SQLSTATE 'P0001' THEN NULL;
    END;
END;
$$;

SELECT id AS tenant_id FROM companies WHERE company_number = 'F-000001' \gset
SET LOCAL ROLE schaefchen_api;
SELECT set_config('app.current_company_id', :'tenant_id', TRUE);
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM site_reports WHERE company_id <> NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID) THEN
        RAISE EXCEPTION 'API-Rolle sieht firmenfremde Berichte';
    END IF;
END $$;
RESET ROLE;
ROLLBACK;
\echo 'Migration 022_create_site_reports.sql erfolgreich getestet.'
