\echo 'Teste Migration 020_create_site_tasks.sql ...'
BEGIN;

DO $$
DECLARE
    tenant_id UUID;
    actor_id UUID;
    customer_id UUID;
    project_id UUID;
    location_id UUID;
    site_id UUID;
    task_id UUID;
    next_version BIGINT;
BEGIN
    SELECT id INTO tenant_id FROM companies WHERE company_number = 'F-000001';
    INSERT INTO users (company_id, personnel_number, first_name, last_name)
    VALUES (tenant_id, 'TASK-TEST', 'Tina', 'Aufgabe') RETURNING id INTO actor_id;
    INSERT INTO customers (company_id, customer_number, customer_type, company_name)
    VALUES (tenant_id, NULL, 'company', 'Aufgabenkunde') RETURNING id INTO customer_id;
    INSERT INTO projects (company_id, customer_id, project_number, name, status)
    VALUES (tenant_id, customer_id, NULL, 'Aufgabenprojekt', 'active') RETURNING id INTO project_id;
    INSERT INTO customer_locations (company_id, customer_id, location_number, name, street, house_number, postal_code, city)
    VALUES (tenant_id, customer_id, NULL, 'Aufgabenort', 'Testweg', '20', '09111', 'Chemnitz') RETURNING id INTO location_id;
    INSERT INTO construction_sites (company_id, project_id, customer_location_id, site_number, name, status)
    VALUES (tenant_id, project_id, location_id, NULL, 'Aufgabenbaustelle', 'active') RETURNING id INTO site_id;

    INSERT INTO site_tasks (
        company_id, construction_site_id, title, details, priority,
        assigned_user_id, created_by_user_id, changed_by_user_id
    ) VALUES (
        tenant_id, site_id, '  Verteiler beschriften  ', '  Stromkreise eindeutig markieren  ',
        'HIGH', actor_id, actor_id, actor_id
    ) RETURNING id INTO task_id;

    IF NOT EXISTS (SELECT 1 FROM site_tasks WHERE id = task_id AND title = 'Verteiler beschriften' AND priority = 'high') THEN
        RAISE EXCEPTION 'Aufgabe wurde nicht normalisiert';
    END IF;

    UPDATE site_tasks SET status = 'done', changed_by_user_id = actor_id WHERE id = task_id
    RETURNING row_version INTO next_version;
    IF next_version <> 2 OR NOT EXISTS (SELECT 1 FROM site_tasks WHERE id = task_id AND completed_at IS NOT NULL) THEN
        RAISE EXCEPTION 'Aufgabenabschluss ist ungültig';
    END IF;

    BEGIN
        DELETE FROM site_tasks WHERE id = task_id;
        RAISE EXCEPTION USING ERRCODE = 'ZX201', MESSAGE = 'Hartes Löschen wurde akzeptiert';
    EXCEPTION WHEN SQLSTATE 'P0001' THEN NULL;
    END;
END;
$$;

SELECT id AS tenant_id FROM companies WHERE company_number = 'F-000001' \gset
SET LOCAL ROLE schaefchen_api;
SELECT set_config('app.current_company_id', :'tenant_id', TRUE);
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM site_tasks WHERE company_id <> NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID) THEN
        RAISE EXCEPTION 'API-Rolle sieht firmenfremde Aufgaben';
    END IF;
END $$;
RESET ROLE;
ROLLBACK;
\echo 'Migration 020_create_site_tasks.sql erfolgreich getestet.'
