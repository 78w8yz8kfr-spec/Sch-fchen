BEGIN;

DO $$
DECLARE
    company_a_id UUID;
    company_b_id UUID;
    expected_permissions JSONB :=
        '{"planning":{"scope":"company","actions":["manage"]},"timesheets":{"scope":"company","actions":["read","correct"]},"users":{"scope":"company","actions":["read","manage"]}}'::JSONB;
BEGIN
    SELECT id
    INTO company_a_id
    FROM companies
    WHERE company_number = 'F-000001';

    IF (
        SELECT COUNT(*)
        FROM roles
        WHERE company_id = company_a_id
          AND role_key IN ('planner', 'project_manager', 'executive_assistant')
          AND permissions = expected_permissions
          AND is_system
          AND status = 'active'
    ) <> 3 THEN
        RAISE EXCEPTION 'Die drei gleichberechtigten Organisationsrollen fehlen';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM roles
        WHERE company_id = company_a_id
          AND role_key = 'office'
          AND status = 'active'
    ) THEN
        RAISE EXCEPTION 'Die bisherige Bürorolle muss für bestehende Konten erhalten bleiben';
    END IF;

    INSERT INTO companies (legal_name, display_name)
    VALUES ('Organisationstest GmbH', 'Organisationstest')
    RETURNING id INTO company_b_id;

    IF (
        SELECT COUNT(*)
        FROM roles
        WHERE company_id = company_b_id
          AND role_key IN ('planner', 'project_manager', 'executive_assistant')
          AND permissions = expected_permissions
          AND status = 'active'
    ) <> 3 THEN
        RAISE EXCEPTION 'Neue Firmen erhalten die Organisationsrollen nicht automatisch';
    END IF;
END;
$$;

ROLLBACK;
