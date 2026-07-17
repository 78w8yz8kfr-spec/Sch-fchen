BEGIN;

CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    user_id UUID NOT NULL,
    token_hash CHAR(64) NOT NULL,
    authentication_method VARCHAR(20) NOT NULL DEFAULT 'password',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMPTZ,
    revocation_reason TEXT,
    CONSTRAINT user_sessions_company_id_fkey
        FOREIGN KEY (company_id)
        REFERENCES companies (id)
        ON DELETE RESTRICT,
    CONSTRAINT user_sessions_user_fkey
        FOREIGN KEY (company_id, user_id)
        REFERENCES users (company_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT user_sessions_company_id_id_key UNIQUE (company_id, id),
    CONSTRAINT user_sessions_token_hash_key UNIQUE (token_hash),
    CONSTRAINT user_sessions_token_hash_check CHECK (
        token_hash ~ '^[0-9a-f]{64}$'
    ),
    CONSTRAINT user_sessions_authentication_method_check CHECK (
        authentication_method IN ('password')
    ),
    CONSTRAINT user_sessions_expiry_check CHECK (expires_at > created_at),
    CONSTRAINT user_sessions_last_seen_check CHECK (
        last_seen_at >= created_at AND last_seen_at <= expires_at
    ),
    CONSTRAINT user_sessions_revocation_check CHECK (
        (revoked_at IS NULL AND revocation_reason IS NULL)
        OR
        (revoked_at IS NOT NULL AND revoked_at >= created_at
            AND revocation_reason IS NOT NULL AND BTRIM(revocation_reason) <> '')
    )
);

CREATE INDEX IF NOT EXISTS user_sessions_active_user_idx
    ON user_sessions (company_id, user_id, expires_at)
    WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS user_sessions_expiry_idx
    ON user_sessions (expires_at)
    WHERE revoked_at IS NULL;

CREATE OR REPLACE FUNCTION user_sessions_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.token_hash := LOWER(BTRIM(NEW.token_hash));
    NEW.revocation_reason := NULLIF(BTRIM(NEW.revocation_reason), '');

    IF TG_OP = 'UPDATE' THEN
        IF NEW.company_id <> OLD.company_id
            OR NEW.user_id <> OLD.user_id
            OR NEW.token_hash <> OLD.token_hash
            OR NEW.authentication_method <> OLD.authentication_method
            OR NEW.created_at <> OLD.created_at
            OR NEW.expires_at <> OLD.expires_at THEN
            RAISE EXCEPTION 'Identität und Gültigkeit einer Sitzung sind unveränderlich.';
        END IF;

        IF OLD.revoked_at IS NOT NULL
            AND (
                NEW.revoked_at IS DISTINCT FROM OLD.revoked_at
                OR NEW.revocation_reason IS DISTINCT FROM OLD.revocation_reason
            ) THEN
            RAISE EXCEPTION 'Eine widerrufene Sitzung kann nicht reaktiviert oder umgeschrieben werden.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_sessions_before_write_trigger ON user_sessions;
CREATE TRIGGER user_sessions_before_write_trigger
    BEFORE INSERT OR UPDATE ON user_sessions
    FOR EACH ROW
    EXECUTE FUNCTION user_sessions_before_write();

CREATE OR REPLACE FUNCTION user_sessions_prevent_hard_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF CURRENT_SETTING('app.allow_hard_delete', TRUE) = 'on' THEN
        RETURN OLD;
    END IF;

    RAISE EXCEPTION 'Sitzungen dürfen nicht hart gelöscht werden; bitte widerrufen.';
END;
$$;

DROP TRIGGER IF EXISTS user_sessions_prevent_hard_delete_trigger ON user_sessions;
CREATE TRIGGER user_sessions_prevent_hard_delete_trigger
    BEFORE DELETE ON user_sessions
    FOR EACH ROW
    EXECUTE FUNCTION user_sessions_prevent_hard_delete();

ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_sessions_tenant_isolation ON user_sessions;
CREATE POLICY user_sessions_tenant_isolation ON user_sessions
    USING (
        company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID
    )
    WITH CHECK (
        company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID
    );

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
    SELECT
        account.company_id,
        account.id,
        account.password_hash,
        account.must_change_password
    FROM users AS account
    INNER JOIN companies AS tenant
        ON tenant.id = account.company_id
    WHERE tenant.company_number = BTRIM(target_company_number)
      AND tenant.status = 'active'
      AND account.personnel_number = BTRIM(target_personnel_number)
      AND account.status = 'active'
    LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION api_resolve_session(
    target_token_hash CHAR(64)
)
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
      AND tenant.status = 'active'
    RETURNING session.id, session.company_id, session.user_id, session.expires_at;
END;
$$;

REVOKE ALL ON FUNCTION api_lookup_login_user(VARCHAR, VARCHAR) FROM PUBLIC;
REVOKE ALL ON FUNCTION api_resolve_session(CHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api_lookup_login_user(VARCHAR, VARCHAR) TO schaefchen_api;
GRANT EXECUTE ON FUNCTION api_resolve_session(CHAR) TO schaefchen_api;
GRANT SELECT, INSERT, UPDATE ON user_sessions TO schaefchen_api;
ALTER TABLE user_sessions FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE user_sessions IS 'Kurzlebige, widerrufbare API-Sitzungen; gespeichert wird ausschließlich der SHA-256-Hash des Tokens.';
COMMENT ON COLUMN user_sessions.token_hash IS 'Hexadezimaler SHA-256-Hash; das rohe Sitzungstoken verlässt den API-Prozess nur als HttpOnly-Cookie.';
COMMENT ON FUNCTION api_lookup_login_user(VARCHAR, VARCHAR) IS 'Eng begrenzte serverseitige Login-Suche vor Festlegung des Mandantenkontexts.';
COMMENT ON FUNCTION api_resolve_session(CHAR) IS 'Löst einen gültigen Token-Hash in Sitzung, Firma und Benutzer auf und aktualisiert last_seen_at gedrosselt.';

COMMIT;
