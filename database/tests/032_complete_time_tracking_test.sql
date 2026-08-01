\echo 'Teste Migration 032_complete_time_tracking.sql ...'

BEGIN;

DO $$
DECLARE
    target_company_id UUID;
    employee_id UUID;
    customer_id UUID;
    project_id UUID;
    location_id UUID;
    field_site_id UUID;
    work_day_id UUID;
    original_clock_out_id UUID;
    addition_id UUID;
    invalidation_id UUID;
BEGIN
    SELECT id INTO target_company_id
    FROM companies
    WHERE company_number = 'F-000001';

    INSERT INTO users (company_id, personnel_number, first_name, last_name)
    VALUES (target_company_id, 'TIME-COMPLETE-1', 'Komplett', 'Erfasst')
    RETURNING id INTO employee_id;

    INSERT INTO customers (company_id, customer_type, company_name)
    VALUES (target_company_id, 'company', 'Feldkunde Zeiterfassung')
    RETURNING id INTO customer_id;

    INSERT INTO customer_locations (
        company_id, customer_id, name, location_type,
        street, house_number, postal_code, city
    ) VALUES (
        target_company_id, customer_id, 'Feldbaustelle', 'construction',
        'Teststraße', '32', '09599', 'Freiberg'
    ) RETURNING id INTO location_id;

    INSERT INTO projects (company_id, customer_id, name, status)
    VALUES (target_company_id, customer_id, 'Projekt Feldbaustelle', 'active')
    RETURNING id INTO project_id;

    INSERT INTO construction_sites (
        company_id, project_id, customer_location_id, name, status,
        creation_source, field_created_by_user_id, field_review_status
    ) VALUES (
        target_company_id, project_id, location_id, 'Neue Baustelle vom Monteur', 'active',
        'field', employee_id, 'pending'
    ) RETURNING id INTO field_site_id;

    IF NOT EXISTS (
        SELECT 1 FROM construction_sites
        WHERE id = field_site_id
          AND creation_source = 'field'
          AND field_review_status = 'pending'
          AND field_created_by_user_id = employee_id
    ) THEN
        RAISE EXCEPTION 'Baustellenvorschlag aus dem Feld wurde nicht nachvollziehbar gespeichert';
    END IF;

    UPDATE construction_sites
    SET field_review_status = 'confirmed',
        field_reviewed_at = CURRENT_TIMESTAMP,
        field_reviewed_by_user_id = employee_id
    WHERE id = field_site_id;

    INSERT INTO work_days (company_id, user_id, work_date)
    VALUES (target_company_id, employee_id, DATE '2026-07-28')
    RETURNING id INTO work_day_id;

    INSERT INTO time_entries (
        company_id, user_id, work_day_id, entry_type, recorded_at,
        client_entry_id, client_created_at, source, entered_by_user_id
    ) VALUES (
        target_company_id, employee_id, work_day_id, 'clock_in',
        TIMESTAMPTZ '2026-07-28 08:00:00+02', gen_random_uuid(),
        CURRENT_TIMESTAMP, 'employee', employee_id
    );

    INSERT INTO time_entries (
        company_id, user_id, work_day_id, entry_type, recorded_at,
        client_entry_id, client_created_at, source, entered_by_user_id
    ) VALUES (
        target_company_id, employee_id, work_day_id, 'clock_out',
        TIMESTAMPTZ '2026-07-28 12:00:00+02', gen_random_uuid(),
        CURRENT_TIMESTAMP, 'employee', employee_id
    ) RETURNING id INTO original_clock_out_id;

    INSERT INTO time_entries (
        company_id, user_id, work_day_id, entry_type, recorded_at,
        client_entry_id, client_created_at, source, entered_by_user_id,
        correction_kind, correction_reason
    ) VALUES (
        target_company_id, employee_id, work_day_id, 'clock_in',
        TIMESTAMPTZ '2026-07-28 13:00:00+02', gen_random_uuid(),
        CURRENT_TIMESTAMP, 'employee', employee_id,
        'addition', 'Zweiter Arbeitsbeginn wurde vergessen'
    ) RETURNING id INTO addition_id;

    IF NOT EXISTS (
        SELECT 1 FROM pending_time_entry_corrections_v2
        WHERE id = addition_id
          AND correction_kind = 'addition'
          AND original_entry_id IS NULL
          AND original_recorded_at IS NULL
    ) THEN
        RAISE EXCEPTION 'Fehlende Buchung wurde nicht als offene Ergänzung geführt';
    END IF;

    UPDATE time_entries
    SET correction_status = 'approved', reviewed_by_user_id = employee_id
    WHERE id = addition_id;

    INSERT INTO time_entries (
        company_id, user_id, work_day_id, entry_type, recorded_at,
        client_entry_id, client_created_at, source, entered_by_user_id,
        original_entry_id, correction_kind, correction_reason
    )
    SELECT
        original.company_id, original.user_id, original.work_day_id,
        original.entry_type, original.recorded_at,
        gen_random_uuid(), CURRENT_TIMESTAMP, 'employee', employee_id,
        original.id, 'invalidation', 'Feierabendbuchung war versehentlich gesetzt'
    FROM time_entries AS original
    WHERE original.id = original_clock_out_id
    RETURNING id INTO invalidation_id;

    UPDATE time_entries
    SET correction_status = 'approved', reviewed_by_user_id = employee_id
    WHERE id = invalidation_id;

    IF NOT EXISTS (
        SELECT 1 FROM time_entries
        WHERE id = original_clock_out_id AND invalidated_at IS NOT NULL
    ) OR EXISTS (
        SELECT 1 FROM time_entries
        WHERE id = invalidation_id
          AND correction_status = 'approved'
          AND correction_kind <> 'invalidation'
    ) THEN
        RAISE EXCEPTION 'Ungültig-Markierung hat die Historie nicht korrekt erhalten';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM work_days
        WHERE id = work_day_id AND calculation_version = 4
    ) THEN
        RAISE EXCEPTION 'Neue Zeitberechnung wurde nicht angewendet';
    END IF;
END;
$$;

ROLLBACK;

\echo 'Migration 032_complete_time_tracking.sql erfolgreich getestet.'
