BEGIN;

UPDATE companies
SET logo_object_key = 'company-logos/schaaf-elektro.png'
WHERE company_number = 'F-000001'
  AND NULLIF(BTRIM(logo_object_key), '') IS NULL;

CREATE OR REPLACE FUNCTION api_get_initial_setup_status_v2(
    target_company_number VARCHAR
)
RETURNS TABLE (
    company_id UUID,
    company_number VARCHAR,
    display_name VARCHAR,
    logo_object_key TEXT,
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
        tenant.logo_object_key,
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

REVOKE ALL ON FUNCTION api_get_initial_setup_status_v2(VARCHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api_get_initial_setup_status_v2(VARCHAR) TO schaefchen_api;

COMMENT ON FUNCTION api_get_initial_setup_status_v2(VARCHAR) IS
    'Liefert ausschließlich Firma, Firmenlogo und einmaligen Einrichtungsstatus, keine Benutzerinformationen.';

COMMIT;
