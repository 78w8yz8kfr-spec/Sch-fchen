BEGIN;

CREATE OR REPLACE FUNCTION api_get_initial_setup_status(
    target_company_number VARCHAR
)
RETURNS TABLE (
    company_id UUID,
    company_number VARCHAR,
    display_name VARCHAR,
    setup_required BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
    SELECT
        tenant.id,
        tenant.company_number,
        tenant.display_name,
        NOT EXISTS (
            SELECT 1
            FROM users AS account
            WHERE account.company_id = tenant.id
        )
    FROM companies AS tenant
    WHERE tenant.company_number = BTRIM(target_company_number)
      AND tenant.status = 'active'
    LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION api_create_initial_admin(
    target_company_number VARCHAR,
    target_personnel_number VARCHAR,
    target_first_name VARCHAR,
    target_last_name VARCHAR,
    target_password_hash TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
    target_company_id UUID;
    target_role_id UUID;
    created_user_id UUID;
BEGIN
    SELECT id
    INTO target_company_id
    FROM companies
    WHERE company_number = BTRIM(target_company_number)
      AND status = 'active'
    FOR UPDATE;

    IF target_company_id IS NULL THEN
        RAISE EXCEPTION 'Die Firma für die Ersteinrichtung wurde nicht gefunden.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM users WHERE company_id = target_company_id
    ) THEN
        RAISE EXCEPTION 'Die Ersteinrichtung ist bereits abgeschlossen.';
    END IF;

    IF target_password_hash !~ '^scrypt\$[0-9]+\$[0-9]+\$[0-9]+\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$' THEN
        RAISE EXCEPTION 'Der Passwort-Hash besitzt ein ungültiges Format.';
    END IF;

    SELECT id
    INTO target_role_id
    FROM roles
    WHERE company_id = target_company_id
      AND role_key = 'admin'
      AND status = 'active';

    IF target_role_id IS NULL THEN
        RAISE EXCEPTION 'Die Admin-Systemrolle fehlt.';
    END IF;

    INSERT INTO users (
        company_id,
        personnel_number,
        first_name,
        last_name,
        password_hash,
        must_change_password
    )
    VALUES (
        target_company_id,
        BTRIM(target_personnel_number),
        BTRIM(target_first_name),
        BTRIM(target_last_name),
        target_password_hash,
        FALSE
    )
    RETURNING id INTO created_user_id;

    INSERT INTO user_roles (
        company_id,
        user_id,
        role_id,
        assigned_by_user_id,
        reason
    )
    VALUES (
        target_company_id,
        created_user_id,
        target_role_id,
        created_user_id,
        'Ersteinrichtung'
    );

    RETURN created_user_id;
END;
$$;

REVOKE ALL ON FUNCTION api_get_initial_setup_status(VARCHAR) FROM PUBLIC;
REVOKE ALL ON FUNCTION api_create_initial_admin(VARCHAR, VARCHAR, VARCHAR, VARCHAR, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api_get_initial_setup_status(VARCHAR) TO schaefchen_api;
GRANT EXECUTE ON FUNCTION api_create_initial_admin(VARCHAR, VARCHAR, VARCHAR, VARCHAR, TEXT) TO schaefchen_api;

COMMENT ON FUNCTION api_get_initial_setup_status(VARCHAR) IS 'Liefert ausschließlich Firma und einmaligen Einrichtungsstatus, keine Benutzerinformationen.';
COMMENT ON FUNCTION api_create_initial_admin(VARCHAR, VARCHAR, VARCHAR, VARCHAR, TEXT) IS 'Legt genau den ersten Firmenbenutzer mit aktiver Admin-Systemrolle an; spätere Aufrufe werden abgewiesen.';

COMMIT;
