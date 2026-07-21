\echo 'Teste Migration 021_create_site_material_entries.sql ...'
BEGIN;

DO $$
DECLARE
    tenant_id UUID;
    actor_id UUID;
    customer_id UUID;
    project_id UUID;
    location_id UUID;
    site_id UUID;
    material_id UUID;
BEGIN
    SELECT id INTO tenant_id FROM companies WHERE company_number = 'F-000001';
    INSERT INTO users (company_id, personnel_number, first_name, last_name)
    VALUES (tenant_id, 'MAT-TEST', 'Mara', 'Material') RETURNING id INTO actor_id;
    INSERT INTO customers (company_id, customer_number, customer_type, company_name)
    VALUES (tenant_id, NULL, 'company', 'Materialkunde') RETURNING id INTO customer_id;
    INSERT INTO projects (company_id, customer_id, project_number, name, status)
    VALUES (tenant_id, customer_id, NULL, 'Materialprojekt', 'active') RETURNING id INTO project_id;
    INSERT INTO customer_locations (company_id, customer_id, location_number, name, street, house_number, postal_code, city)
    VALUES (tenant_id, customer_id, NULL, 'Materialort', 'Kabelweg', '21', '09111', 'Chemnitz') RETURNING id INTO location_id;
    INSERT INTO construction_sites (company_id, project_id, customer_location_id, site_number, name, status)
    VALUES (tenant_id, project_id, location_id, NULL, 'Materialbaustelle', 'active') RETURNING id INTO site_id;

    INSERT INTO site_material_entries (
        company_id, construction_site_id, item_name, quantity, unit, note,
        created_by_user_id, changed_by_user_id
    ) VALUES (
        tenant_id, site_id, '  NYM-J 3x1,5  ', 50, ' m ', '  Erdgeschoss  ', actor_id, actor_id
    ) RETURNING id INTO material_id;

    IF NOT EXISTS (
        SELECT 1 FROM site_material_entries
        WHERE id = material_id AND item_name = 'NYM-J 3x1,5' AND unit = 'm' AND status = 'planned'
    ) THEN RAISE EXCEPTION 'Materialeintrag wurde nicht normalisiert'; END IF;

    UPDATE site_material_entries SET status = 'used', changed_by_user_id = actor_id WHERE id = material_id;
    IF NOT EXISTS (SELECT 1 FROM site_material_entries WHERE id = material_id AND status = 'used' AND row_version = 2) THEN
        RAISE EXCEPTION 'Materialstatus oder Version wurde nicht aktualisiert';
    END IF;

    BEGIN
        DELETE FROM site_material_entries WHERE id = material_id;
        RAISE EXCEPTION USING ERRCODE = 'ZX211', MESSAGE = 'Hartes Löschen wurde akzeptiert';
    EXCEPTION WHEN SQLSTATE 'P0001' THEN NULL;
    END;
END;
$$;

SELECT id AS tenant_id FROM companies WHERE company_number = 'F-000001' \gset
SET LOCAL ROLE schaefchen_api;
SELECT set_config('app.current_company_id', :'tenant_id', TRUE);
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM site_material_entries WHERE company_id <> NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID) THEN
        RAISE EXCEPTION 'API-Rolle sieht firmenfremdes Material';
    END IF;
END $$;
RESET ROLE;
ROLLBACK;
\echo 'Migration 021_create_site_material_entries.sql erfolgreich getestet.'
