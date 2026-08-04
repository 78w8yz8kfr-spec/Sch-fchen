\echo 'Teste Migration 042_enable_complete_time_editing.sql ...'

BEGIN;

DO $$
DECLARE
    target_company_id UUID;
    target_employee_id UUID;
    target_customer_id UUID;
    target_project_id UUID;
    first_site_id UUID;
    second_site_id UUID;
    target_work_day_id UUID;
    original_arrival_id UUID;
    replacement_arrival_id UUID;
    target_operation_id UUID;
    target_item_id UUID;
    foreign_company_id UUID;
    foreign_employee_id UUID;
    foreign_operation_id UUID;
BEGIN
    SELECT id INTO target_company_id
    FROM companies WHERE company_number = 'F-000001';

    INSERT INTO users (company_id, personnel_number, first_name, last_name)
    VALUES (target_company_id, 'TIME-EDIT-042', 'Zeit', 'Korrektur')
    RETURNING id INTO target_employee_id;

    INSERT INTO customers (company_id, customer_number, customer_type, company_name)
    VALUES (target_company_id, NULL, 'company', 'SQL Zeitkunde 042 GmbH')
    RETURNING id INTO target_customer_id;

    INSERT INTO projects (company_id, customer_id, project_number, name, status)
    VALUES (target_company_id, target_customer_id, NULL, 'SQL Zeitprojekt 042', 'active')
    RETURNING id INTO target_project_id;

    INSERT INTO construction_sites (company_id, project_id, name, status)
    VALUES (target_company_id, target_project_id, 'SQL Ausgangsbaustelle 042', 'active')
    RETURNING id INTO first_site_id;

    INSERT INTO construction_sites (company_id, project_id, name, status)
    VALUES (target_company_id, target_project_id, 'SQL Ersatzbaustelle 042', 'active')
    RETURNING id INTO second_site_id;

    INSERT INTO work_days (
        company_id, user_id, work_date, target_work_minutes
    ) VALUES (
        target_company_id, target_employee_id, DATE '2026-07-27', 480
    ) RETURNING id INTO target_work_day_id;

    INSERT INTO time_entries (
        company_id,user_id,work_day_id,construction_site_id,entry_type,
        recorded_at,client_entry_id,client_created_at,source,entered_by_user_id
    ) VALUES
        (target_company_id,target_employee_id,target_work_day_id,NULL,'clock_in',
         TIMESTAMPTZ '2026-07-27 08:00:00+02',gen_random_uuid(),CURRENT_TIMESTAMP,'employee',target_employee_id),
        (target_company_id,target_employee_id,target_work_day_id,first_site_id,'site_arrival',
         TIMESTAMPTZ '2026-07-27 09:00:00+02',gen_random_uuid(),CURRENT_TIMESTAMP,'employee',target_employee_id),
        (target_company_id,target_employee_id,target_work_day_id,first_site_id,'site_departure',
         TIMESTAMPTZ '2026-07-27 16:00:00+02',gen_random_uuid(),CURRENT_TIMESTAMP,'employee',target_employee_id),
        (target_company_id,target_employee_id,target_work_day_id,NULL,'clock_out',
         TIMESTAMPTZ '2026-07-27 17:00:00+02',gen_random_uuid(),CURRENT_TIMESTAMP,'employee',target_employee_id);

    SELECT id INTO original_arrival_id
    FROM time_entries
    WHERE company_id = target_company_id
      AND user_id = target_employee_id
      AND work_day_id = target_work_day_id
      AND entry_type = 'site_arrival';

    IF NOT EXISTS (
        SELECT 1 FROM work_days
        WHERE id = target_work_day_id
          AND gross_minutes = 540
          AND break_minutes = 60
          AND work_minutes = 480
          AND travel_minutes = 120
          AND overtime_minutes = 0
          AND calculation_version = 4
    ) THEN
        RAISE EXCEPTION 'Brutto-, Pausen-, Netto-, Fahrt- oder Überstundenberechnung ist falsch';
    END IF;

    INSERT INTO time_change_operations (
        company_id,user_id,client_change_id,action,reason,status,requested_by_user_id
    ) VALUES (
        target_company_id,target_employee_id,gen_random_uuid(),'move_site',
        'Falsche Baustelle beim Arbeitsbeginn', 'applied',target_employee_id
    ) RETURNING id INTO target_operation_id;

    INSERT INTO time_entries (
        company_id,user_id,work_day_id,construction_site_id,entry_type,
        recorded_at,client_entry_id,client_created_at,source,entered_by_user_id,
        original_entry_id,correction_kind,correction_reason,activity_note,
        edit_operation_id
    )
    SELECT company_id,user_id,work_day_id,second_site_id,entry_type,
           recorded_at,gen_random_uuid(),CURRENT_TIMESTAMP,'employee',target_employee_id,
           id,'replacement','Falsche Baustelle beim Arbeitsbeginn','Kundendienst',
           target_operation_id
    FROM time_entries WHERE id = original_arrival_id
    RETURNING id INTO replacement_arrival_id;

    UPDATE time_entries
    SET correction_status = 'approved', reviewed_by_user_id = target_employee_id
    WHERE id = replacement_arrival_id;

    INSERT INTO time_change_items (
        company_id,operation_id,original_entry_id,replacement_entry_id,
        item_action,old_value,new_value
    ) VALUES (
        target_company_id,target_operation_id,original_arrival_id,replacement_arrival_id,
        'replace',jsonb_build_object('constructionSiteId',first_site_id),
        jsonb_build_object('constructionSiteId',second_site_id,'activityNote','Kundendienst')
    ) RETURNING id INTO target_item_id;

    IF NOT EXISTS (
        SELECT 1 FROM time_entries
        WHERE id = original_arrival_id AND invalidated_at IS NOT NULL
    ) OR NOT EXISTS (
        SELECT 1 FROM time_entries
        WHERE id = replacement_arrival_id
          AND construction_site_id = second_site_id
          AND correction_status = 'approved'
          AND activity_note = 'Kundendienst'
    ) OR (
        SELECT COUNT(*) FROM time_entries
        WHERE company_id = target_company_id
          AND user_id = target_employee_id
          AND work_day_id = target_work_day_id
          AND entry_type = 'site_arrival'
          AND invalidated_at IS NULL
          AND correction_kind IS DISTINCT FROM 'invalidation'
          AND ((original_entry_id IS NULL AND correction_status IS NULL) OR correction_status = 'approved')
    ) <> 1 THEN
        RAISE EXCEPTION 'Baustellenwechsel hat Original, Ersetzung oder Eindeutigkeit beschädigt';
    END IF;

    BEGIN
        INSERT INTO time_entries (
            company_id,user_id,work_day_id,construction_site_id,entry_type,
            recorded_at,client_entry_id,client_created_at,source,entered_by_user_id
        ) VALUES (
            target_company_id,target_employee_id,target_work_day_id,second_site_id,'site_arrival',
            TIMESTAMPTZ '2026-07-27 09:00:00+02',gen_random_uuid(),CURRENT_TIMESTAMP,'employee',target_employee_id
        );
        RAISE EXCEPTION 'Doppelte effektive Zeitbuchung wurde zugelassen';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'Doppelte effektive Zeitbuchung wurde zugelassen' THEN RAISE; END IF;
    END;

    UPDATE work_days
    SET break_minutes_override = 30,
        break_override_reason = 'Tatsächliche Pause laut Nachweis',
        break_override_by_user_id = target_employee_id
    WHERE id = target_work_day_id;
    PERFORM recalculate_work_day(target_company_id,target_employee_id,target_work_day_id);

    IF NOT EXISTS (
        SELECT 1 FROM work_days
        WHERE id = target_work_day_id
          AND break_minutes = 30
          AND work_minutes = 510
          AND overtime_minutes = 30
          AND travel_minutes = 120
    ) THEN
        RAISE EXCEPTION 'Begründete Pausenkorrektur wurde nicht vollständig neu berechnet';
    END IF;

    BEGIN
        UPDATE time_change_items SET new_value = '{}'::JSONB WHERE id = target_item_id;
        RAISE EXCEPTION 'Zeitkorrektur-Audit konnte verändert werden';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'Zeitkorrektur-Audit konnte verändert werden' THEN RAISE; END IF;
    END;
    BEGIN
        DELETE FROM time_change_operations WHERE id = target_operation_id;
        RAISE EXCEPTION 'Zeitkorrekturvorgang konnte gelöscht werden';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'Zeitkorrekturvorgang konnte gelöscht werden' THEN RAISE; END IF;
    END;

    INSERT INTO companies (legal_name, display_name)
    VALUES ('Zeitkorrektur Zweitfirma GmbH', 'Zeitkorrektur Zweitfirma')
    RETURNING id INTO foreign_company_id;

    INSERT INTO users (company_id, personnel_number, first_name, last_name)
    VALUES (foreign_company_id, 'TIME-EDIT-042-B', 'Fremd', 'Korrektur')
    RETURNING id INTO foreign_employee_id;

    INSERT INTO time_change_operations (
        company_id, user_id, client_change_id, action, reason, status, requested_by_user_id
    ) VALUES (
        foreign_company_id, foreign_employee_id, gen_random_uuid(), 'edit_entry',
        'Fremder Korrekturvorgang', 'applied', foreign_employee_id
    ) RETURNING id INTO foreign_operation_id;

    INSERT INTO time_change_items (
        company_id, operation_id, item_action, new_value
    ) VALUES (
        foreign_company_id, foreign_operation_id, 'replace', '{"quelle": "fremd"}'::JSONB
    );

    PERFORM set_config('app.test_foreign_company_id', foreign_company_id::TEXT, TRUE);
    PERFORM set_config('app.test_foreign_user_id', foreign_employee_id::TEXT, TRUE);
END;
$$;

SELECT id AS tenant_a_id
FROM companies
WHERE company_number = 'F-000001'
\gset

SET LOCAL ROLE schaefchen_api;
SELECT set_config('app.current_company_id', :'tenant_a_id', TRUE);

DO $$
DECLARE
    tenant_a_id UUID := NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID;
    foreign_company_id UUID := CURRENT_SETTING('app.test_foreign_company_id', TRUE)::UUID;
    foreign_user_id UUID := CURRENT_SETTING('app.test_foreign_user_id', TRUE)::UUID;
    own_operations INTEGER;
    foreign_operations INTEGER;
    foreign_items INTEGER;
BEGIN
    SELECT COUNT(*) INTO own_operations
    FROM time_change_operations
    WHERE company_id = tenant_a_id;

    SELECT COUNT(*) INTO foreign_operations
    FROM time_change_operations
    WHERE company_id <> tenant_a_id;

    SELECT COUNT(*) INTO foreign_items
    FROM time_change_items
    WHERE company_id <> tenant_a_id;

    IF own_operations = 0 THEN
        RAISE EXCEPTION 'API-Rolle sieht die eigenen Zeitkorrekturvorgänge nicht';
    END IF;

    IF foreign_operations <> 0 THEN
        RAISE EXCEPTION 'API-Rolle sieht % firmenfremde Zeitkorrekturvorgänge', foreign_operations;
    END IF;

    IF foreign_items <> 0 THEN
        RAISE EXCEPTION 'API-Rolle sieht % firmenfremde Zeitkorrekturpositionen', foreign_items;
    END IF;

    BEGIN
        INSERT INTO time_change_operations (
            company_id, user_id, client_change_id, action, reason, status, requested_by_user_id
        ) VALUES (
            foreign_company_id, foreign_user_id, gen_random_uuid(), 'edit_entry',
            'Eingeschleuster Korrekturvorgang', 'applied', foreign_user_id
        );
        RAISE EXCEPTION USING
            ERRCODE = 'ZX421',
            MESSAGE = 'API-Rolle konnte einen Zeitkorrekturvorgang für eine fremde Firma anlegen';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;
END;
$$;

RESET ROLE;
ROLLBACK;

\echo 'Migration 042_enable_complete_time_editing.sql erfolgreich getestet.'
