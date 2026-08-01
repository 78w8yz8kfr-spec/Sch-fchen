\echo 'Teste Migration 041_create_platform_operations.sql ...'

BEGIN;

DO $$
DECLARE
    target_company_id UUID;
    first_admin_id UUID;
    second_admin_id UUID;
    backup_id UUID;
    restore_id UUID;
    privacy_id UUID;
    history_id UUID;
BEGIN
    SELECT id INTO target_company_id FROM companies WHERE company_number = 'F-000001';
    INSERT INTO platform_users (first_name,last_name,email,password_hash)
    VALUES ('Erste','Technik','sql-ops-first@example.test','test-hash') RETURNING id INTO first_admin_id;
    INSERT INTO platform_users (first_name,last_name,email,password_hash)
    VALUES ('Zweite','Technik','sql-ops-second@example.test','test-hash') RETURNING id INTO second_admin_id;

    IF (SELECT COUNT(*) FROM system_health_components) <> 13 THEN
        RAISE EXCEPTION 'Technische Plattformkomponenten sind unvollständig';
    END IF;

    INSERT INTO support_tickets (
        company_id,contact_name,category,priority,subject,description
    ) VALUES (
        target_company_id,'SQL Kontakt','technical','critical','SQL-Abnahme','Fehleranalyse Migration 041'
    );

    INSERT INTO platform_backup_runs (
        backup_type,status,scope_company_id,integrity_status,requested_by_platform_user_id,
        started_at,finished_at
    ) VALUES (
        'company','success',target_company_id,'valid',first_admin_id,
        CURRENT_TIMESTAMP - INTERVAL '1 minute',CURRENT_TIMESTAMP
    ) RETURNING id INTO backup_id;
    INSERT INTO platform_restore_requests (
        backup_run_id,scope_company_id,restore_type,reason,prepared_by_platform_user_id
    ) VALUES (
        backup_id,target_company_id,'company','SQL-Abnahme Wiederherstellung',first_admin_id
    ) RETURNING id INTO restore_id;

    BEGIN
        UPDATE platform_restore_requests
        SET status = 'confirmed', confirmed_by_platform_user_id = first_admin_id,
            confirmed_at = CURRENT_TIMESTAMP
        WHERE id = restore_id;
        RAISE EXCEPTION 'Wiederherstellung konnte von derselben Person bestätigt werden';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'Wiederherstellung konnte von derselben Person bestätigt werden' THEN RAISE; END IF;
    END;
    UPDATE platform_restore_requests
    SET status = 'confirmed', confirmed_by_platform_user_id = second_admin_id,
        confirmed_at = CURRENT_TIMESTAMP
    WHERE id = restore_id;

    INSERT INTO privacy_requests (
        request_type,company_id,status,reason,created_by_platform_user_id,
        first_confirmed_by_platform_user_id
    ) VALUES (
        'company_deletion',target_company_id,'recovery_period','SQL-Datenschutzprozess',
        first_admin_id,first_admin_id
    ) RETURNING id INTO privacy_id;
    BEGIN
        UPDATE privacy_requests SET status = 'confirmed',
            second_confirmed_by_platform_user_id = first_admin_id WHERE id = privacy_id;
        RAISE EXCEPTION 'Datenschutzlöschung konnte ohne Vier-Augen-Prinzip bestätigt werden';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'Datenschutzlöschung konnte ohne Vier-Augen-Prinzip bestätigt werden' THEN RAISE; END IF;
    END;

    UPDATE platform_settings
    SET value = '15'::JSONB, changed_by_platform_user_id = first_admin_id,
        change_reason = 'SQL-Abnahme Migration 041'
    WHERE setting_key = 'trial.default_days';
    SELECT id INTO history_id FROM platform_setting_history
    WHERE setting_key = 'trial.default_days' ORDER BY changed_at DESC LIMIT 1;
    BEGIN
        DELETE FROM platform_setting_history WHERE id = history_id;
        RAISE EXCEPTION 'Einstellungshistorie konnte gelöscht werden';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'Einstellungshistorie konnte gelöscht werden' THEN RAISE; END IF;
    END;
END;
$$;

ROLLBACK;

\echo 'Migration 041_create_platform_operations.sql erfolgreich getestet.'
