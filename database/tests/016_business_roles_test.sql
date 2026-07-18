\echo 'Teste Migration 016_add_business_roles.sql ...'

BEGIN;

DO $$
DECLARE
    company_a_id UUID;
    company_b_id UUID;
BEGIN
    SELECT id INTO company_a_id
    FROM companies
    WHERE company_number = 'F-000001';

    IF (
        SELECT COUNT(*)
        FROM roles
        WHERE company_id = company_a_id
          AND role_key IN (
              'admin', 'managing_director', 'dispatch_office', 'project_manager',
              'foreman', 'installer'
          )
          AND is_system
          AND status = 'active'
    ) <> 6 THEN
        RAISE EXCEPTION 'Die sechs sichtbaren Betriebsrollen fehlen';
    END IF;

    IF (
        SELECT COUNT(*)
        FROM roles
        WHERE company_id = company_a_id
          AND role_key IN ('office', 'planner', 'executive_assistant')
          AND status = 'active'
    ) <> 3 THEN
        RAISE EXCEPTION 'Bestehende Organisationsrollen wurden nicht kompatibel erhalten';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM roles
        WHERE company_id = company_a_id
          AND role_key = 'managing_director'
          AND is_full_access
    ) THEN
        RAISE EXCEPTION 'Geschäftsführer darf nicht mit dem technischen Administrator gleichgesetzt werden';
    END IF;

    INSERT INTO companies (legal_name, display_name)
    VALUES ('Betriebsrollentest GmbH', 'Betriebsrollentest')
    RETURNING id INTO company_b_id;

    IF (
        SELECT COUNT(*)
        FROM roles
        WHERE company_id = company_b_id
          AND role_key IN (
              'admin', 'managing_director', 'dispatch_office', 'project_manager',
              'foreman', 'installer', 'office', 'planner', 'executive_assistant'
          )
          AND status = 'active'
    ) <> 9 THEN
        RAISE EXCEPTION 'Neue Firmen erhalten nicht alle sichtbaren und kompatiblen Rollen';
    END IF;
END;
$$;

ROLLBACK;
