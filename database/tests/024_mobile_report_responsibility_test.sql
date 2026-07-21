\echo 'Teste Migration 024_assign_mobile_report_responsibility.sql ...'

BEGIN;

DO $$
<<mobile_report_test>>
DECLARE
    tenant_id UUID;
    foreman_id UUID;
    installer_id UUID;
    foreman_role_id UUID;
    customer_id UUID;
    location_id UUID;
    project_id UUID;
    site_id UUID;
    assignment_id UUID;
    second_assignment_id UUID;
    report_id UUID;
BEGIN
    SELECT id INTO tenant_id FROM companies WHERE company_number = 'F-000001';
    SELECT id INTO foreman_role_id FROM roles
    WHERE company_id = tenant_id AND role_key = 'foreman';

    INSERT INTO customers (company_id, customer_type, company_name)
    VALUES (tenant_id, 'company', 'Mobiler Bericht Testkunde GmbH')
    RETURNING id INTO customer_id;
    INSERT INTO customer_locations (
        company_id, customer_id, name, street, house_number, postal_code, city
    ) VALUES (
        tenant_id, customer_id, 'Mobiler Bericht Testort', 'Testweg', '24', '12345', 'Teststadt'
    ) RETURNING id INTO location_id;
    INSERT INTO projects (company_id, customer_id, name)
    VALUES (tenant_id, customer_id, 'Mobiler Bericht Testprojekt')
    RETURNING id INTO project_id;
    INSERT INTO construction_sites (
        company_id, project_id, customer_location_id, name
    ) VALUES (
        tenant_id, project_id, location_id, 'Mobiler Bericht Testbaustelle'
    ) RETURNING id INTO site_id;

    INSERT INTO users (company_id, personnel_number, first_name, last_name)
    VALUES (tenant_id, 'MOBILE-FOREMAN', 'Mobile', 'Vorarbeiter')
    RETURNING id INTO foreman_id;
    INSERT INTO user_roles (company_id, user_id, role_id)
    VALUES (tenant_id, foreman_id, foreman_role_id);

    INSERT INTO users (company_id, personnel_number, first_name, last_name)
    VALUES (tenant_id, 'MOBILE-INSTALLER', 'Mobile', 'Monteur')
    RETURNING id INTO installer_id;

    INSERT INTO site_assignments (
        company_id, user_id, construction_site_id, work_date, sequence_number,
        status, report_responsible
    ) VALUES (
        tenant_id, foreman_id, site_id, DATE '2026-08-03', 1,
        'released', TRUE
    ) RETURNING id INTO assignment_id;

    INSERT INTO site_reports (
        company_id, construction_site_id, report_number, report_type, work_date,
        source_mode, summary, status, author_user_id, site_assignment_id, client_report_id
    ) VALUES (
        tenant_id, site_id, NULL, 'daily', DATE '2026-08-03',
        'digital', 'Mobiler Bautagesbericht', 'submitted', foreman_id,
        assignment_id, gen_random_uuid()
    ) RETURNING id INTO report_id;

    IF NOT EXISTS (
        SELECT 1 FROM site_reports
        WHERE id = report_id AND site_assignment_id = assignment_id
    ) THEN
        RAISE EXCEPTION 'Mobiler Bericht wurde nicht mit seinem Einsatz verbunden';
    END IF;

    BEGIN
        INSERT INTO site_assignments (
            company_id, user_id, construction_site_id, work_date, sequence_number,
            status, report_responsible
        ) VALUES (
            tenant_id, installer_id, site_id, DATE '2026-08-04', 1,
            'released', TRUE
        );
        RAISE EXCEPTION USING ERRCODE = 'ZXA01', MESSAGE = 'Monteur wurde als Berichtsverantwortlicher akzeptiert';
    EXCEPTION WHEN SQLSTATE 'P0001' THEN NULL;
    END;

    BEGIN
        INSERT INTO site_assignments (
            company_id, user_id, construction_site_id, work_date, sequence_number,
            status, report_responsible
        ) VALUES (
            tenant_id, foreman_id, site_id, DATE '2026-08-03', 2,
            'released', TRUE
        ) RETURNING id INTO second_assignment_id;
        RAISE EXCEPTION USING ERRCODE = 'ZXA02', MESSAGE = 'Zweiter Berichtsverantwortlicher wurde akzeptiert';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO site_reports (
            company_id, construction_site_id, report_number, report_type, work_date,
            source_mode, summary, status, author_user_id, site_assignment_id, client_report_id
        ) VALUES (
            tenant_id, site_id, NULL, 'montage', DATE '2026-08-04',
            'digital', 'Falsches Datum', 'submitted', foreman_id,
            assignment_id, gen_random_uuid()
        );
        RAISE EXCEPTION USING ERRCODE = 'ZXA03', MESSAGE = 'Bericht mit falschem Datum wurde akzeptiert';
    EXCEPTION WHEN SQLSTATE 'P0001' THEN NULL;
    END;
END;
$$;

ROLLBACK;

\echo 'Migration 024_assign_mobile_report_responsibility.sql erfolgreich getestet.'
