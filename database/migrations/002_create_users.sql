BEGIN;

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    personnel_number VARCHAR(30) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(254),
    phone VARCHAR(50),
    profile_image_object_key TEXT,
    password_hash TEXT,
    must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
    is_foreman BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    last_login_at TIMESTAMPTZ,
    password_changed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deactivated_at TIMESTAMPTZ,
    row_version BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT users_company_id_fkey
        FOREIGN KEY (company_id)
        REFERENCES companies (id)
        ON DELETE RESTRICT,
    CONSTRAINT users_company_id_id_key UNIQUE (company_id, id),
    CONSTRAINT users_company_personnel_number_key
        UNIQUE (company_id, personnel_number),
    CONSTRAINT users_personnel_number_not_blank
        CHECK (BTRIM(personnel_number) <> ''),
    CONSTRAINT users_first_name_not_blank CHECK (BTRIM(first_name) <> ''),
    CONSTRAINT users_last_name_not_blank CHECK (BTRIM(last_name) <> ''),
    CONSTRAINT users_email_not_blank
        CHECK (email IS NULL OR BTRIM(email) <> ''),
    CONSTRAINT users_phone_not_blank
        CHECK (phone IS NULL OR BTRIM(phone) <> ''),
    CONSTRAINT users_password_hash_not_blank
        CHECK (password_hash IS NULL OR BTRIM(password_hash) <> ''),
    CONSTRAINT users_status_check CHECK (status IN ('active', 'inactive')),
    CONSTRAINT users_deactivation_check CHECK (
        (status = 'active' AND deactivated_at IS NULL)
        OR
        (status = 'inactive' AND deactivated_at IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS users_company_status_idx
    ON users (company_id, status);

CREATE INDEX IF NOT EXISTS users_company_name_idx
    ON users (company_id, LOWER(last_name), LOWER(first_name));

CREATE UNIQUE INDEX IF NOT EXISTS users_company_email_lower_key
    ON users (company_id, LOWER(email))
    WHERE email IS NOT NULL;

CREATE OR REPLACE FUNCTION users_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.personnel_number := BTRIM(NEW.personnel_number);
    NEW.first_name := BTRIM(NEW.first_name);
    NEW.last_name := BTRIM(NEW.last_name);
    NEW.email := NULLIF(BTRIM(NEW.email), '');
    NEW.phone := NULLIF(BTRIM(NEW.phone), '');

    IF NEW.status = 'inactive' AND NEW.deactivated_at IS NULL THEN
        NEW.deactivated_at := CURRENT_TIMESTAMP;
    ELSIF NEW.status = 'active' THEN
        NEW.deactivated_at := NULL;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        NEW.updated_at := CURRENT_TIMESTAMP;
        NEW.row_version := OLD.row_version + 1;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_before_write_trigger ON users;
CREATE TRIGGER users_before_write_trigger
    BEFORE INSERT OR UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION users_before_write();

CREATE OR REPLACE FUNCTION users_prevent_hard_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF CURRENT_SETTING('app.allow_hard_delete', TRUE) = 'on' THEN
        RETURN OLD;
    END IF;

    RAISE EXCEPTION
        'Benutzer dürfen nicht hart gelöscht werden. Status stattdessen auf inactive setzen.';
END;
$$;

DROP TRIGGER IF EXISTS users_prevent_hard_delete_trigger ON users;
CREATE TRIGGER users_prevent_hard_delete_trigger
    BEFORE DELETE ON users
    FOR EACH ROW
    EXECUTE FUNCTION users_prevent_hard_delete();

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_tenant_isolation ON users;
CREATE POLICY users_tenant_isolation
    ON users
    USING (
        company_id = NULLIF(
            CURRENT_SETTING('app.current_company_id', TRUE),
            ''
        )::UUID
    )
    WITH CHECK (
        company_id = NULLIF(
            CURRENT_SETTING('app.current_company_id', TRUE),
            ''
        )::UUID
    );

COMMENT ON TABLE users IS 'Benutzer und Mitarbeiter eines Mandanten.';
COMMENT ON COLUMN users.personnel_number IS 'Primärer Loginname; nur innerhalb der Firma eindeutig.';
COMMENT ON COLUMN users.password_hash IS 'Ausschließlich serverseitig erzeugter Passwort-Hash; niemals an das Frontend ausgeben.';
COMMENT ON COLUMN users.profile_image_object_key IS 'Objektschlüssel im S3-kompatiblen Speicher.';
COMMENT ON COLUMN users.is_foreman IS 'Von Migration 003 anhand aktiver Vorarbeiterrollen gepflegter Lesewert.';
COMMENT ON COLUMN users.row_version IS 'Monoton steigende Version für konkurrierende Änderungen.';

COMMIT;
