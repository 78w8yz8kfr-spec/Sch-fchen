BEGIN;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

ALTER TABLE user_sessions
    ADD COLUMN IF NOT EXISTS app_version VARCHAR(40);
ALTER TABLE platform_sessions
    ADD COLUMN IF NOT EXISTS app_version VARCHAR(40);

ALTER TABLE user_sessions DROP CONSTRAINT IF EXISTS user_sessions_app_version_check;
ALTER TABLE user_sessions ADD CONSTRAINT user_sessions_app_version_check
    CHECK (app_version IS NULL OR app_version ~ '^[0-9A-Za-z.+_-]{1,40}$');
ALTER TABLE platform_sessions DROP CONSTRAINT IF EXISTS platform_sessions_app_version_check;
ALTER TABLE platform_sessions ADD CONSTRAINT platform_sessions_app_version_check
    CHECK (app_version IS NULL OR app_version ~ '^[0-9A-Za-z.+_-]{1,40}$');

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_failed_login_attempts_check;
ALTER TABLE users ADD CONSTRAINT users_failed_login_attempts_check
    CHECK (failed_login_attempts >= 0);

CREATE OR REPLACE FUNCTION api_lookup_login_user(
    target_company_number VARCHAR,
    target_personnel_number VARCHAR
)
RETURNS TABLE (
    company_id UUID,
    user_id UUID,
    password_hash TEXT,
    must_change_password BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
    SELECT account.company_id, account.id, account.password_hash, account.must_change_password
    FROM users AS account
    INNER JOIN companies AS tenant ON tenant.id = account.company_id
    WHERE tenant.company_number = BTRIM(target_company_number)
      AND tenant.status IN ('trial', 'active', 'payment_due', 'restricted')
      AND account.personnel_number = BTRIM(target_personnel_number)
      AND account.status = 'active'
      AND (account.locked_until IS NULL OR account.locked_until <= CURRENT_TIMESTAMP)
    LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION api_record_login_failure(
    target_company_id UUID,
    target_user_id UUID
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
    UPDATE users
    SET failed_login_attempts = failed_login_attempts + 1,
        locked_until = CASE
            WHEN failed_login_attempts + 1 >= 10
                THEN CURRENT_TIMESTAMP + INTERVAL '30 minutes'
            ELSE locked_until
        END
    WHERE company_id = target_company_id AND id = target_user_id;
$$;

CREATE OR REPLACE FUNCTION api_record_login_success(
    target_company_id UUID,
    target_user_id UUID
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
    UPDATE users
    SET failed_login_attempts = 0,
        locked_until = NULL,
        last_login_at = CURRENT_TIMESTAMP
    WHERE company_id = target_company_id AND id = target_user_id;
$$;

REVOKE ALL ON FUNCTION api_record_login_failure(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION api_record_login_success(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api_record_login_failure(UUID, UUID) TO schaefchen_api;
GRANT EXECUTE ON FUNCTION api_record_login_success(UUID, UUID) TO schaefchen_api;

DROP POLICY IF EXISTS user_roles_platform_write ON user_roles;
CREATE POLICY user_roles_platform_write ON user_roles
    FOR INSERT
    WITH CHECK (CURRENT_USER = 'schaefchen_platform_api');

GRANT INSERT ON users, user_roles TO schaefchen_platform_api;

-- Empfänger systemweiter Mitteilungen werden bereits auf Datenbankebene nach
-- Firma, Tarif, freigeschaltetem Modul oder Firmenrolle eingegrenzt. Damit ist
-- eine direkte URL oder ein manipuliertes Frontend kein Weg an fremde
-- Mitteilungen.
DROP POLICY IF EXISTS announcements_tenant_read ON platform_announcements;
CREATE POLICY announcements_tenant_read ON platform_announcements
    FOR SELECT USING (
        CURRENT_USER = 'schaefchen_api'
        AND status = 'published'
        AND COALESCE(publish_at, created_at) <= CURRENT_TIMESTAMP
        AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
        AND (
            targets ->> 'scope' = 'all'
            OR (
                targets ->> 'scope' = 'companies'
                AND targets -> 'values' ? CURRENT_SETTING('app.current_company_id', TRUE)
            )
            OR (
                targets ->> 'scope' = 'plans'
                AND EXISTS (
                    SELECT 1 FROM companies AS target_company
                    WHERE target_company.id = NULLIF(
                        CURRENT_SETTING('app.current_company_id', TRUE), ''
                    )::UUID
                      AND targets -> 'values' ? target_company.license_plan
                )
            )
            OR (
                targets ->> 'scope' = 'modules'
                AND EXISTS (
                    SELECT 1
                    FROM company_module_entitlements AS entitlement
                    JOIN module_catalog AS catalog ON catalog.id = entitlement.module_id
                    WHERE entitlement.company_id = NULLIF(
                        CURRENT_SETTING('app.current_company_id', TRUE), ''
                    )::UUID
                      AND entitlement.entitlement_status IN ('permanent', 'trial')
                      AND (entitlement.starts_at IS NULL OR entitlement.starts_at <= CURRENT_TIMESTAMP)
                      AND (entitlement.ends_at IS NULL OR entitlement.ends_at > CURRENT_TIMESTAMP)
                      AND targets -> 'values' ? catalog.module_key
                )
            )
            OR (
                targets ->> 'scope' IN ('company_roles', 'user_groups')
                AND EXISTS (
                    SELECT 1
                    FROM user_roles AS assignment
                    JOIN roles AS tenant_role
                      ON tenant_role.company_id = assignment.company_id
                     AND tenant_role.id = assignment.role_id
                    WHERE assignment.company_id = NULLIF(
                        CURRENT_SETTING('app.current_company_id', TRUE), ''
                    )::UUID
                      AND assignment.user_id = NULLIF(
                        CURRENT_SETTING('app.current_user_id', TRUE), ''
                    )::UUID
                      AND assignment.revoked_at IS NULL
                      AND targets -> 'values' ? tenant_role.role_key
                )
            )
        )
    );

UPDATE application_versions
SET release_status = 'superseded'
WHERE version = '0.41.0'
  AND release_status = 'production'
  AND NOT EXISTS (
      SELECT 1 FROM application_versions AS seeded
      WHERE seeded.version = '0.42.0'
  );

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.42.0', 'production', CURRENT_TIMESTAMP,
    'Zeitkorrekturen, Mitarbeiter-Lebenszyklus, ruhige Wochenansicht und getrennte Plattformverwaltung.',
    '[]'::JSONB, '["039","040","041","042","043","044"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS application_versions_one_production_idx
    ON application_versions ((release_status))
    WHERE release_status = 'production';

COMMENT ON COLUMN users.two_factor_enabled IS
    'Plattformweit sichtbarer 2FA-Status des Firmenkontos; enthält keine fachlichen Mitarbeiterdaten.';
COMMENT ON FUNCTION api_record_login_failure(UUID, UUID) IS
    'RLS-sichere Zählung fehlgeschlagener Firmenanmeldungen mit temporärer Kontosperre.';

COMMIT;
