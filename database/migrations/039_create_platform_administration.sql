BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_roles WHERE rolname = 'schaefchen_platform_api'
    ) THEN
        CREATE ROLE schaefchen_platform_api
            NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
    END IF;
END;
$$;

GRANT USAGE ON SCHEMA public TO schaefchen_platform_api;

-- Firmen besitzen einen eigenen Lebenszyklus. Ein Plattformkonto bleibt davon
-- vollständig getrennt und wird niemals als users-Zeile angelegt.
ALTER TABLE companies
    DROP CONSTRAINT IF EXISTS companies_status_check,
    DROP CONSTRAINT IF EXISTS companies_deactivation_check,
    DROP CONSTRAINT IF EXISTS companies_user_limit_check,
    DROP CONSTRAINT IF EXISTS companies_storage_limit_check,
    DROP CONSTRAINT IF EXISTS companies_storage_used_check,
    DROP CONSTRAINT IF EXISTS companies_storage_capacity_check;

UPDATE companies
SET status = 'suspended'
WHERE status = 'inactive';

ALTER TABLE companies
    ADD COLUMN IF NOT EXISTS contact_name VARCHAR(200),
    ADD COLUMN IF NOT EXISTS contact_email VARCHAR(254),
    ADD COLUMN IF NOT EXISTS user_limit INTEGER,
    ADD COLUMN IF NOT EXISTS storage_limit_bytes BIGINT,
    ADD COLUMN IF NOT EXISTS storage_used_bytes BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS contract_ends_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cancellation_recorded_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deletion_scheduled_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_active_login_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS registration_completed_at TIMESTAMPTZ;

ALTER TABLE companies
    ADD CONSTRAINT companies_status_check CHECK (
        status IN (
            'trial', 'active', 'payment_due', 'restricted', 'suspended',
            'cancelled', 'archived', 'pending_deletion'
        )
    ),
    ADD CONSTRAINT companies_user_limit_check
        CHECK (user_limit IS NULL OR user_limit >= 1),
    ADD CONSTRAINT companies_storage_limit_check
        CHECK (storage_limit_bytes IS NULL OR storage_limit_bytes >= 0),
    ADD CONSTRAINT companies_storage_used_check
        CHECK (storage_used_bytes >= 0),
    ADD CONSTRAINT companies_storage_capacity_check
        CHECK (
            storage_limit_bytes IS NULL
            OR storage_used_bytes <= storage_limit_bytes
        );

CREATE OR REPLACE FUNCTION companies_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.contact_name := NULLIF(BTRIM(NEW.contact_name), '');
    NEW.contact_email := NULLIF(LOWER(BTRIM(NEW.contact_email)), '');

    IF NEW.status IN ('suspended', 'cancelled', 'archived', 'pending_deletion') THEN
        NEW.deactivated_at := COALESCE(NEW.deactivated_at, CURRENT_TIMESTAMP);
    ELSE
        NEW.deactivated_at := NULL;
    END IF;

    IF NEW.status = 'archived' THEN
        NEW.archived_at := COALESCE(NEW.archived_at, CURRENT_TIMESTAMP);
    ELSIF TG_OP = 'UPDATE' AND OLD.status = 'archived' THEN
        NEW.archived_at := NULL;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        NEW.updated_at := CURRENT_TIMESTAMP;
        NEW.row_version := OLD.row_version + 1;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS platform_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_key VARCHAR(40) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    permissions JSONB NOT NULL DEFAULT '[]'::JSONB,
    is_system BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    row_version BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT platform_roles_key_check
        CHECK (role_key ~ '^[a-z][a-z0-9_]*$'),
    CONSTRAINT platform_roles_name_check CHECK (BTRIM(name) <> ''),
    CONSTRAINT platform_roles_permissions_check
        CHECK (jsonb_typeof(permissions) = 'array')
);

CREATE TABLE IF NOT EXISTS platform_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(254) NOT NULL,
    password_hash TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    failed_login_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    row_version BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT platform_users_name_check
        CHECK (BTRIM(first_name) <> '' AND BTRIM(last_name) <> ''),
    CONSTRAINT platform_users_email_check CHECK (BTRIM(email) <> ''),
    CONSTRAINT platform_users_password_check CHECK (BTRIM(password_hash) <> ''),
    CONSTRAINT platform_users_status_check
        CHECK (status IN ('active', 'disabled', 'locked')),
    CONSTRAINT platform_users_failed_login_check CHECK (failed_login_attempts >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS platform_users_email_lower_key
    ON platform_users (LOWER(email));

CREATE TABLE IF NOT EXISTS platform_user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform_user_id UUID NOT NULL REFERENCES platform_users (id) ON DELETE RESTRICT,
    platform_role_id UUID NOT NULL REFERENCES platform_roles (id) ON DELETE RESTRICT,
    granted_by_platform_user_id UUID REFERENCES platform_users (id) ON DELETE RESTRICT,
    reason TEXT NOT NULL,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMPTZ,
    revoked_by_platform_user_id UUID REFERENCES platform_users (id) ON DELETE RESTRICT,
    CONSTRAINT platform_user_roles_reason_check CHECK (BTRIM(reason) <> ''),
    CONSTRAINT platform_user_roles_revocation_check CHECK (
        (revoked_at IS NULL AND revoked_by_platform_user_id IS NULL)
        OR (revoked_at IS NOT NULL AND revoked_by_platform_user_id IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS platform_user_roles_active_key
    ON platform_user_roles (platform_user_id, platform_role_id)
    WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS platform_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform_user_id UUID NOT NULL REFERENCES platform_users (id) ON DELETE RESTRICT,
    token_hash CHAR(64) NOT NULL UNIQUE,
    authentication_method VARCHAR(20) NOT NULL DEFAULT 'password',
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMPTZ,
    revocation_reason TEXT,
    CONSTRAINT platform_sessions_token_check CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT platform_sessions_method_check
        CHECK (authentication_method IN ('password', 'two_factor', 'setup')),
    CONSTRAINT platform_sessions_expiry_check CHECK (expires_at > created_at),
    CONSTRAINT platform_sessions_revocation_check CHECK (
        (revoked_at IS NULL AND revocation_reason IS NULL)
        OR (revoked_at IS NOT NULL AND revocation_reason IS NOT NULL AND BTRIM(revocation_reason) <> '')
    )
);

CREATE INDEX IF NOT EXISTS platform_sessions_active_user_idx
    ON platform_sessions (platform_user_id, expires_at)
    WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS platform_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform_user_id UUID NOT NULL REFERENCES platform_users (id) ON DELETE RESTRICT,
    platform_session_id UUID REFERENCES platform_sessions (id) ON DELETE RESTRICT,
    action VARCHAR(100) NOT NULL,
    target_type VARCHAR(80) NOT NULL,
    target_id TEXT,
    company_id UUID REFERENCES companies (id) ON DELETE RESTRICT,
    old_state JSONB,
    new_state JSONB,
    reason TEXT NOT NULL,
    ip_address INET,
    session_identifier TEXT,
    result VARCHAR(20) NOT NULL DEFAULT 'success',
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT platform_audit_action_check CHECK (BTRIM(action) <> ''),
    CONSTRAINT platform_audit_target_check CHECK (BTRIM(target_type) <> ''),
    CONSTRAINT platform_audit_reason_check CHECK (BTRIM(reason) <> ''),
    CONSTRAINT platform_audit_result_check
        CHECK (result IN ('success', 'denied', 'failed', 'cancelled')),
    CONSTRAINT platform_audit_old_state_check
        CHECK (old_state IS NULL OR jsonb_typeof(old_state) = 'object'),
    CONSTRAINT platform_audit_new_state_check
        CHECK (new_state IS NULL OR jsonb_typeof(new_state) = 'object')
);

CREATE INDEX IF NOT EXISTS platform_audit_log_time_idx
    ON platform_audit_log (occurred_at DESC);
CREATE INDEX IF NOT EXISTS platform_audit_log_company_idx
    ON platform_audit_log (company_id, occurred_at DESC)
    WHERE company_id IS NOT NULL;

CREATE OR REPLACE FUNCTION platform_users_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.first_name := BTRIM(NEW.first_name);
    NEW.last_name := BTRIM(NEW.last_name);
    NEW.email := LOWER(BTRIM(NEW.email));

    IF TG_OP = 'UPDATE' THEN
        NEW.updated_at := CURRENT_TIMESTAMP;
        NEW.row_version := OLD.row_version + 1;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS platform_users_before_write_trigger ON platform_users;
CREATE TRIGGER platform_users_before_write_trigger
    BEFORE INSERT OR UPDATE ON platform_users
    FOR EACH ROW EXECUTE FUNCTION platform_users_before_write();

CREATE OR REPLACE FUNCTION platform_roles_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.role_key := LOWER(BTRIM(NEW.role_key));
    NEW.name := BTRIM(NEW.name);
    IF TG_OP = 'UPDATE' THEN
        IF OLD.is_system AND NEW.role_key <> OLD.role_key THEN
            RAISE EXCEPTION 'Systemrollenschlüssel sind unveränderlich.';
        END IF;
        NEW.updated_at := CURRENT_TIMESTAMP;
        NEW.row_version := OLD.row_version + 1;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS platform_roles_before_write_trigger ON platform_roles;
CREATE TRIGGER platform_roles_before_write_trigger
    BEFORE INSERT OR UPDATE ON platform_roles
    FOR EACH ROW EXECUTE FUNCTION platform_roles_before_write();

CREATE OR REPLACE FUNCTION platform_audit_log_prevent_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'Plattform-Audit-Einträge sind unveränderlich und dürfen nicht gelöscht werden.';
END;
$$;

DROP TRIGGER IF EXISTS platform_audit_log_prevent_change_trigger ON platform_audit_log;
CREATE TRIGGER platform_audit_log_prevent_change_trigger
    BEFORE UPDATE OR DELETE ON platform_audit_log
    FOR EACH ROW EXECUTE FUNCTION platform_audit_log_prevent_change();

INSERT INTO platform_roles (role_key, name, description, permissions)
VALUES
    ('superadmin', 'Superadministrator', 'Vollständiger Zugriff auf alle Plattformfunktionen.', '["*"]'),
    ('support', 'Support', 'Firmen-, Konto- und Supportzugriff ohne Preisverwaltung.', '["dashboard.read","companies.read","accounts.read","accounts.unlock","support.manage","support.access"]'),
    ('technical', 'Technik', 'Technischer Betrieb ohne Verträge oder Preise.', '["dashboard.read","health.manage","errors.manage","versions.manage","backups.manage"]'),
    ('sales', 'Vertrieb', 'Firmen, Testphasen und Tarifzuweisung.', '["dashboard.read","companies.read","companies.create","companies.trials","contracts.assign"]'),
    ('accounting', 'Buchhaltung', 'Vertrags-, Zahlungs- und Tarifverwaltung.', '["dashboard.read","companies.read","contracts.manage","plans.manage"]'),
    ('privacy', 'Datenschutz', 'Exporte, Löschanfragen und Audit-Prüfung.', '["dashboard.read","privacy.manage","audit.read"]')
ON CONFLICT (role_key) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description;

CREATE OR REPLACE FUNCTION api_lookup_platform_user(target_email VARCHAR)
RETURNS TABLE (
    platform_user_id UUID,
    password_hash TEXT,
    two_factor_enabled BOOLEAN,
    failed_login_attempts INTEGER,
    locked_until TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
    SELECT id, platform_users.password_hash, platform_users.two_factor_enabled,
           platform_users.failed_login_attempts, platform_users.locked_until
    FROM platform_users
    WHERE LOWER(email) = LOWER(BTRIM(target_email))
      AND status = 'active'
      AND (locked_until IS NULL OR locked_until <= CURRENT_TIMESTAMP)
    LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION api_resolve_platform_session(target_token_hash CHAR(64))
RETURNS TABLE (
    session_id UUID,
    platform_user_id UUID,
    expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
BEGIN
    RETURN QUERY
    UPDATE platform_sessions AS session
    SET last_seen_at = CASE
        WHEN session.last_seen_at < CURRENT_TIMESTAMP - INTERVAL '5 minutes'
            THEN LEAST(CURRENT_TIMESTAMP, session.expires_at)
        ELSE session.last_seen_at
    END
    FROM platform_users AS account
    WHERE session.token_hash = LOWER(BTRIM(target_token_hash))
      AND session.revoked_at IS NULL
      AND session.expires_at > CURRENT_TIMESTAMP
      AND account.id = session.platform_user_id
      AND account.status = 'active'
      AND (account.locked_until IS NULL OR account.locked_until <= CURRENT_TIMESTAMP)
    RETURNING session.id, session.platform_user_id, session.expires_at;
END;
$$;

-- Normale Firmenanmeldungen bleiben bei zulässigen eingeschränkten Zuständen
-- möglich; gesperrte, gekündigte oder archivierte Firmen werden serverseitig
-- abgewiesen.
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
    LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION api_resolve_session(target_token_hash CHAR(64))
RETURNS TABLE (
    session_id UUID,
    company_id UUID,
    user_id UUID,
    expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
BEGIN
    RETURN QUERY
    UPDATE user_sessions AS session
    SET last_seen_at = CASE
        WHEN session.last_seen_at < CURRENT_TIMESTAMP - INTERVAL '5 minutes'
            THEN LEAST(CURRENT_TIMESTAMP, session.expires_at)
        ELSE session.last_seen_at
    END
    FROM users AS account, companies AS tenant
    WHERE session.token_hash = LOWER(BTRIM(target_token_hash))
      AND session.revoked_at IS NULL
      AND session.expires_at > CURRENT_TIMESTAMP
      AND account.company_id = session.company_id
      AND account.id = session.user_id
      AND account.status = 'active'
      AND tenant.id = session.company_id
      AND tenant.status IN ('trial', 'active', 'payment_due', 'restricted')
    RETURNING session.id, session.company_id, session.user_id, session.expires_at;
END;
$$;

ALTER TABLE platform_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_roles_platform_access ON platform_roles;
CREATE POLICY platform_roles_platform_access ON platform_roles
    USING (CURRENT_USER = 'schaefchen_platform_api')
    WITH CHECK (CURRENT_USER = 'schaefchen_platform_api');
DROP POLICY IF EXISTS platform_users_platform_access ON platform_users;
CREATE POLICY platform_users_platform_access ON platform_users
    USING (CURRENT_USER = 'schaefchen_platform_api')
    WITH CHECK (CURRENT_USER = 'schaefchen_platform_api');
DROP POLICY IF EXISTS platform_user_roles_platform_access ON platform_user_roles;
CREATE POLICY platform_user_roles_platform_access ON platform_user_roles
    USING (CURRENT_USER = 'schaefchen_platform_api')
    WITH CHECK (CURRENT_USER = 'schaefchen_platform_api');
DROP POLICY IF EXISTS platform_sessions_platform_access ON platform_sessions;
CREATE POLICY platform_sessions_platform_access ON platform_sessions
    USING (CURRENT_USER = 'schaefchen_platform_api')
    WITH CHECK (CURRENT_USER = 'schaefchen_platform_api');
DROP POLICY IF EXISTS platform_audit_platform_access ON platform_audit_log;
CREATE POLICY platform_audit_platform_access ON platform_audit_log
    USING (CURRENT_USER = 'schaefchen_platform_api')
    WITH CHECK (
        CURRENT_USER = 'schaefchen_platform_api'
        AND platform_user_id = NULLIF(CURRENT_SETTING('app.current_platform_user_id', TRUE), '')::UUID
    );

DROP POLICY IF EXISTS companies_platform_access ON companies;
CREATE POLICY companies_platform_access ON companies
    USING (CURRENT_USER = 'schaefchen_platform_api')
    WITH CHECK (CURRENT_USER = 'schaefchen_platform_api');

DROP POLICY IF EXISTS users_platform_access ON users;
CREATE POLICY users_platform_access ON users
    USING (CURRENT_USER = 'schaefchen_platform_api')
    WITH CHECK (CURRENT_USER = 'schaefchen_platform_api');

DROP POLICY IF EXISTS roles_platform_read ON roles;
CREATE POLICY roles_platform_read ON roles
    FOR SELECT USING (CURRENT_USER = 'schaefchen_platform_api');

DROP POLICY IF EXISTS user_roles_platform_read ON user_roles;
CREATE POLICY user_roles_platform_read ON user_roles
    FOR SELECT USING (CURRENT_USER = 'schaefchen_platform_api');

DROP POLICY IF EXISTS user_sessions_platform_access ON user_sessions;
CREATE POLICY user_sessions_platform_access ON user_sessions
    USING (CURRENT_USER = 'schaefchen_platform_api')
    WITH CHECK (CURRENT_USER = 'schaefchen_platform_api');

GRANT SELECT, INSERT, UPDATE ON platform_roles, platform_users,
    platform_user_roles, platform_sessions TO schaefchen_platform_api;
GRANT SELECT, INSERT ON platform_audit_log TO schaefchen_platform_api;
GRANT SELECT, INSERT, UPDATE ON companies TO schaefchen_platform_api;
GRANT SELECT, UPDATE ON users, user_sessions TO schaefchen_platform_api;
GRANT SELECT ON roles, user_roles TO schaefchen_platform_api;
GRANT USAGE, SELECT ON SEQUENCE companies_number_seq TO schaefchen_platform_api;

REVOKE ALL ON FUNCTION api_lookup_platform_user(VARCHAR) FROM PUBLIC;
REVOKE ALL ON FUNCTION api_resolve_platform_session(CHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api_lookup_platform_user(VARCHAR) TO schaefchen_platform_api;
GRANT EXECUTE ON FUNCTION api_resolve_platform_session(CHAR) TO schaefchen_platform_api;
GRANT EXECUTE ON FUNCTION api_lookup_login_user(VARCHAR, VARCHAR) TO schaefchen_api;
GRANT EXECUTE ON FUNCTION api_resolve_session(CHAR) TO schaefchen_api;

ALTER TABLE platform_roles NO FORCE ROW LEVEL SECURITY;
ALTER TABLE platform_users NO FORCE ROW LEVEL SECURITY;
ALTER TABLE platform_user_roles NO FORCE ROW LEVEL SECURITY;
ALTER TABLE platform_sessions NO FORCE ROW LEVEL SECURITY;
ALTER TABLE platform_audit_log NO FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE platform_users IS
    'Firmenunabhängige Plattformkonten; niemals Mitarbeiter oder Firmenmitglied.';
COMMENT ON TABLE platform_roles IS
    'Granular konfigurierbare Rollen ausschließlich für die Plattformverwaltung.';
COMMENT ON TABLE platform_audit_log IS
    'Unveränderbares Protokoll aller sicherheits- und verwaltungsrelevanten Plattformaktionen.';

COMMIT;
