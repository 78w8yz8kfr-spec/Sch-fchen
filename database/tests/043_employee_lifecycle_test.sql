\echo 'Teste Migration 043_add_employee_lifecycle.sql ...'

BEGIN;

DO $$
DECLARE
    target_company_id UUID;
    actor_user_id UUID;
    target_customer_id UUID;
    target_project_id UUID;
    historical_employee_id UUID;
    disposable_employee_id UUID;
    target_site_id UUID;
    removal_result VARCHAR;
BEGIN
    SELECT id INTO target_company_id
    FROM companies WHERE company_number = 'F-000001';
    INSERT INTO users (company_id,personnel_number,first_name,last_name)
    VALUES (target_company_id,'ACTOR-043','Lebenszyklus','Prüfung')
    RETURNING id INTO actor_user_id;

    INSERT INTO customers (company_id,customer_number,customer_type,company_name)
    VALUES (target_company_id,NULL,'company','SQL Lebenszykluskunde 043 GmbH')
    RETURNING id INTO target_customer_id;
    INSERT INTO projects (company_id,customer_id,project_number,name,status)
    VALUES (target_company_id,target_customer_id,NULL,'SQL Lebenszyklusprojekt 043','active')
    RETURNING id INTO target_project_id;
    INSERT INTO construction_sites (company_id,project_id,name,status)
    VALUES (target_company_id,target_project_id,'SQL Lebenszyklusbaustelle 043','active')
    RETURNING id INTO target_site_id;

    PERFORM set_config('app.current_company_id',target_company_id::TEXT,TRUE);
    PERFORM set_config('app.current_user_id',actor_user_id::TEXT,TRUE);

    INSERT INTO users (company_id,personnel_number,first_name,last_name)
    VALUES (target_company_id,'ARCHIVE-043','Historie','Bewahren')
    RETURNING id INTO historical_employee_id;
    INSERT INTO work_days (company_id,user_id,work_date,target_work_minutes)
    VALUES (target_company_id,historical_employee_id,DATE '2026-07-25',0);

    SELECT removal_mode INTO removal_result
    FROM api_remove_or_archive_employee(
        historical_employee_id,actor_user_id,'Austritt mit vorhandener Zeithistorie'
    );
    IF removal_result <> 'archived' OR NOT EXISTS (
        SELECT 1 FROM users
        WHERE id = historical_employee_id
          AND status = 'archived'
          AND archived_at IS NOT NULL
          AND archived_by_user_id = actor_user_id
    ) OR NOT EXISTS (
        SELECT 1 FROM employee_lifecycle_events
        WHERE employee_id = historical_employee_id AND action = 'archived'
    ) THEN
        RAISE EXCEPTION 'Mitarbeiter mit Historie wurde nicht nachvollziehbar archiviert';
    END IF;

    BEGIN
        INSERT INTO site_assignments (
            company_id,user_id,construction_site_id,work_date,sequence_number,status,
            created_by_user_id
        ) VALUES (
            target_company_id,historical_employee_id,target_site_id,DATE '2099-01-05',1,'draft',actor_user_id
        );
        RAISE EXCEPTION 'Archivierter Mitarbeiter konnte eingeplant werden';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'Archivierter Mitarbeiter konnte eingeplant werden' THEN RAISE; END IF;
    END;

    PERFORM set_config('app.employee_lifecycle_reason','Fehlarchivierung korrigiert',TRUE);
    UPDATE users SET status = 'active' WHERE id = historical_employee_id;
    IF NOT EXISTS (
        SELECT 1 FROM users
        WHERE id = historical_employee_id
          AND status = 'active'
          AND archived_at IS NULL
          AND deactivated_at IS NULL
    ) OR NOT EXISTS (
        SELECT 1 FROM employee_lifecycle_events
        WHERE employee_id = historical_employee_id AND action = 'reactivated'
    ) THEN
        RAISE EXCEPTION 'Archivierter Mitarbeiter wurde nicht sauber reaktiviert';
    END IF;

    INSERT INTO users (company_id,personnel_number,first_name,last_name)
    VALUES (target_company_id,'DELETE-043','Ohne','Historie')
    RETURNING id INTO disposable_employee_id;
    SELECT removal_mode INTO removal_result
    FROM api_remove_or_archive_employee(
        disposable_employee_id,actor_user_id,'Fehlerhaft angelegtes leeres Konto'
    );
    IF removal_result <> 'deleted'
       OR EXISTS (SELECT 1 FROM users WHERE id = disposable_employee_id)
       OR NOT EXISTS (
            SELECT 1 FROM employee_lifecycle_events
            WHERE employee_id = disposable_employee_id AND action = 'hard_deleted'
       ) THEN
        RAISE EXCEPTION 'Mitarbeiter ohne Historie wurde nicht sicher hart gelöscht';
    END IF;
END;
$$;

ROLLBACK;

\echo 'Migration 043_add_employee_lifecycle.sql erfolgreich getestet.'
