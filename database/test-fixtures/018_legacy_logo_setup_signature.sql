-- Bildet ausschliesslich im CI-Lauf den kurzzeitig veroeffentlichten
-- fuenfspaltigen V1-Vertrag nach, damit der Produktions-Upgradepfad getestet
-- wird. Diese Datei ist keine Migration und wird nie auf Render ausgefuehrt.
DROP FUNCTION api_get_initial_setup_status(VARCHAR);

CREATE FUNCTION api_get_initial_setup_status(
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
