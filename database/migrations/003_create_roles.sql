BEGIN;

CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    role_key VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    permissions JSONB NOT NULL DEFAULT '{}'::JSONB,
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    is_full_access BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deactivated_at TIMESTAMPTZ,
    row_version BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT roles_company_id_fkey
        FOREIGN KEY (company_id)
        REFERENCES companies (id)
        ON DELETE RESTRICT,
    CONSTRAINT roles_company_id_id_key UNIQUE (company_id, id),
    CONSTRAINT roles_company_role_key_key UNIQUE (company_id, role_key),
    CONSTRAINT roles_role_key_check
        CHECK (role_key ~ '^[a-z][a-z0-9_]{1,49}$'),
    CONSTRAINT roles_name_not_blank CHECK (BTRIM(name) <> ''),
    CONSTRAINT roles_permissions_object_check
        CHECK (jsonb_typeof(permissions) = 'object'),
    CONSTRAINT roles_status_check CHECK (status IN ('active', 'inactive')),
    CONSTRAINT roles_admin_invariant_check CHECK (
        role_key <> 'admin'
        OR (is_full_access = TRUE AND status = 'active')
    ),
    CONSTRAINT roles_deactivation_check CHECK (
        (status = 'active' AND deactivated_at IS NULL)
        OR
        (status = 'inactive' AND deactivated_at IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS roles_company_status_idx
    ON roles (company_id, status);

CREATE TABLE IF NOT EXISTS user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    user_id UUID NOT NULL,
    role_id UUID NOT NULL,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    assigned_by_user_id UUID,
    revoked_at TIMESTAMPTZ,
    revoked_by_user_id UUID,
    reason TEXT,
    CONSTRAINT user_roles_company_id_fkey
        FOREIGN KEY (company_id)
        REFERENCES companies (id)
        ON DELETE RESTRICT,
    CONSTRAINT user_roles_user_fkey
        FOREIGN KEY (company_id, user_id)
        REFERENCES users (company_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT user_roles_role_fkey
        FOREIGN KEY (company_id, role_id)
        REFERENCES roles (company_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT user_roles_assigned_by_fkey
        FOREIGN KEY (company_id, assigned_by_user_id)
        REFERENCES users (company_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT user_roles_revoked_by_fkey
        FOREIGN KEY (company_id, revoked_by_user_id)
        REFERENCES users (company_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT user_roles_reason_not_blank
        CHECK (reason IS NULL OR BTRIM(reason) <> ''),
    CONSTRAINT user_roles_revocation_check CHECK (
        (revoked_at IS NULL AND revoked_by_user_id IS NULL)
        OR
        (revoked_at IS NOT NULL AND revoked_at >= assigned_at)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS user_roles_active_assignment_key
    ON user_roles (company_id, user_id, role_id)
    WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS user_roles_company_user_idx
    ON user_roles (company_id, user_id, assigned_at DESC);

CREATE INDEX IF NOT EXISTS user_roles_company_role_idx
    ON user_roles (company_id, role_id)
    WHERE revoked_at IS NULL;

CREATE OR REPLACE FUNCTION roles_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.role_key := LOWER(BTRIM(NEW.role_key));
    NEW.name := BTRIM(NEW.name);

    IF TG_OP = 'UPDATE' AND OLD.is_system THEN
        IF NEW.role_key <> OLD.role_key OR NOT NEW.is_system THEN
            RAISE EXCEPTION
                'Systemrollenschlüssel und Systemstatus dürfen nicht geändert werden.';
        END IF;
    END IF;

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

DROP TRIGGER IF EXISTS roles_before_write_trigger ON roles;
CREATE TRIGGER roles_before_write_trigger
    BEFORE INSERT OR UPDATE ON roles
    FOR EACH ROW
    EXECUTE FUNCTION roles_before_write();

CREATE OR REPLACE FUNCTION roles_prevent_hard_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF CURRENT_SETTING('app.allow_hard_delete', TRUE) = 'on' THEN
        RETURN OLD;
    END IF;

    RAISE EXCEPTION
        'Rollen dürfen nicht hart gelöscht werden. Status stattdessen auf inactive setzen.';
END;
$$;

DROP TRIGGER IF EXISTS roles_prevent_hard_delete_trigger ON roles;
CREATE TRIGGER roles_prevent_hard_delete_trigger
    BEFORE DELETE ON roles
    FOR EACH ROW
    EXECUTE FUNCTION roles_prevent_hard_delete();

CREATE OR REPLACE FUNCTION user_roles_prevent_hard_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF CURRENT_SETTING('app.allow_hard_delete', TRUE) = 'on' THEN
        RETURN OLD;
    END IF;

    RAISE EXCEPTION
        'Rollenzuweisungen dürfen nicht gelöscht werden. Zuweisung stattdessen widerrufen.';
END;
$$;

DROP TRIGGER IF EXISTS user_roles_prevent_hard_delete_trigger ON user_roles;
CREATE TRIGGER user_roles_prevent_hard_delete_trigger
    BEFORE DELETE ON user_roles
    FOR EACH ROW
    EXECUTE FUNCTION user_roles_prevent_hard_delete();

CREATE OR REPLACE FUNCTION create_default_roles_for_company(
    target_company_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    INSERT INTO roles (
        company_id,
        role_key,
        name,
        description,
        permissions,
        is_system,
        is_full_access
    )
    VALUES
        (
            target_company_id,
            'admin',
            'Admin',
            'Vollzugriff auf die eigene Firma.',
            '{"all":{"scope":"company","actions":["manage"]}}'::JSONB,
            TRUE,
            TRUE
        ),
        (
            target_company_id,
            'office',
            'Büro',
            'Organisation, Planung und freigegebene Korrekturen.',
            '{"planning":{"scope":"company","actions":["manage"]},"timesheets":{"scope":"company","actions":["read","correct"]},"users":{"scope":"company","actions":["read","manage"]}}'::JSONB,
            TRUE,
            FALSE
        ),
        (
            target_company_id,
            'foreman',
            'Vorarbeiter',
            'Erweiterte Rechte ausschließlich auf zugewiesenen Baustellen.',
            '{"construction_sites":{"scope":"assigned","actions":["read","report"]},"own_data":{"scope":"self","actions":["read"]}}'::JSONB,
            TRUE,
            FALSE
        ),
        (
            target_company_id,
            'installer',
            'Monteur',
            'Zugriff auf eigene Daten und den nächsten Arbeitsschritt.',
            '{"own_data":{"scope":"self","actions":["read"]},"own_time":{"scope":"self","actions":["read","manage"]}}'::JSONB,
            TRUE,
            FALSE
        )
    ON CONFLICT (company_id, role_key) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION companies_create_default_roles()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    PERFORM create_default_roles_for_company(NEW.id);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS companies_create_default_roles_trigger ON companies;
CREATE TRIGGER companies_create_default_roles_trigger
    AFTER INSERT ON companies
    FOR EACH ROW
    EXECUTE FUNCTION companies_create_default_roles();

SELECT create_default_roles_for_company(id)
FROM companies;

CREATE OR REPLACE FUNCTION users_guard_foreman_flag()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF (
        (TG_OP = 'INSERT' AND NEW.is_foreman)
        OR
        (
            TG_OP = 'UPDATE'
            AND NEW.is_foreman IS DISTINCT FROM OLD.is_foreman
        )
    ) AND CURRENT_SETTING('app.syncing_foreman_flag', TRUE) IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION
            'is_foreman wird ausschließlich über aktive Vorarbeiterrollen gepflegt.';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_guard_foreman_flag_trigger ON users;
CREATE TRIGGER users_guard_foreman_flag_trigger
    BEFORE INSERT OR UPDATE OF is_foreman ON users
    FOR EACH ROW
    EXECUTE FUNCTION users_guard_foreman_flag();

CREATE OR REPLACE FUNCTION sync_user_foreman_flag(
    target_company_id UUID,
    target_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    PERFORM set_config('app.syncing_foreman_flag', 'on', TRUE);

    UPDATE users
    SET is_foreman = EXISTS (
        SELECT 1
        FROM user_roles
        INNER JOIN roles
            ON roles.company_id = user_roles.company_id
           AND roles.id = user_roles.role_id
        WHERE user_roles.company_id = target_company_id
          AND user_roles.user_id = target_user_id
          AND user_roles.revoked_at IS NULL
          AND roles.role_key = 'foreman'
          AND roles.status = 'active'
    )
    WHERE company_id = target_company_id
      AND id = target_user_id;

    PERFORM set_config('app.syncing_foreman_flag', 'off', TRUE);
END;
$$;

CREATE OR REPLACE FUNCTION user_roles_sync_foreman_flag()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM sync_user_foreman_flag(OLD.company_id, OLD.user_id);
        RETURN OLD;
    END IF;

    PERFORM sync_user_foreman_flag(NEW.company_id, NEW.user_id);

    IF TG_OP = 'UPDATE' AND (
        OLD.company_id IS DISTINCT FROM NEW.company_id
        OR OLD.user_id IS DISTINCT FROM NEW.user_id
    ) THEN
        PERFORM sync_user_foreman_flag(OLD.company_id, OLD.user_id);
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_roles_sync_foreman_flag_trigger ON user_roles;
CREATE TRIGGER user_roles_sync_foreman_flag_trigger
    AFTER INSERT OR UPDATE OR DELETE ON user_roles
    FOR EACH ROW
    EXECUTE FUNCTION user_roles_sync_foreman_flag();

CREATE OR REPLACE FUNCTION roles_sync_foreman_users()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    affected_user RECORD;
BEGIN
    IF OLD.role_key = 'foreman' OR NEW.role_key = 'foreman' THEN
        FOR affected_user IN
            SELECT DISTINCT company_id, user_id
            FROM user_roles
            WHERE role_id = NEW.id
        LOOP
            PERFORM sync_user_foreman_flag(
                affected_user.company_id,
                affected_user.user_id
            );
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS roles_sync_foreman_users_trigger ON roles;
CREATE TRIGGER roles_sync_foreman_users_trigger
    AFTER UPDATE OF role_key, status ON roles
    FOR EACH ROW
    EXECUTE FUNCTION roles_sync_foreman_users();

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS roles_tenant_isolation ON roles;
CREATE POLICY roles_tenant_isolation
    ON roles
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

DROP POLICY IF EXISTS user_roles_tenant_isolation ON user_roles;
CREATE POLICY user_roles_tenant_isolation
    ON user_roles
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

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_roles
        WHERE rolname = 'schaefchen_api'
    ) THEN
        CREATE ROLE schaefchen_api
            NOLOGIN
            NOSUPERUSER
            NOCREATEDB
            NOCREATEROLE
            NOINHERIT;
    END IF;
END;
$$;

GRANT USAGE ON SCHEMA public TO schaefchen_api;
GRANT SELECT, UPDATE ON companies TO schaefchen_api;
GRANT SELECT, INSERT, UPDATE ON users, roles, user_roles TO schaefchen_api;

-- Der technische API-Login ist kein Tabelleneigentümer und bleibt damit immer
-- an RLS gebunden. Der Datenbankeigentümer muss RLS dagegen für Migrationen,
-- Seeds und SECURITY-DEFINER-Funktionen sicher umgehen können. Render stellt
-- bewusst keinen Superuser bereit; FORCE würde dort bereits die nächste
-- Migration blockieren.
ALTER TABLE companies NO FORCE ROW LEVEL SECURITY;
ALTER TABLE users NO FORCE ROW LEVEL SECURITY;
ALTER TABLE roles NO FORCE ROW LEVEL SECURITY;
ALTER TABLE user_roles NO FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE roles IS 'Mandantenspezifische Rollen und anpassbare Berechtigungen.';
COMMENT ON COLUMN roles.role_key IS 'Stabiler technischer Schlüssel; Systemrollenschlüssel sind unveränderlich.';
COMMENT ON COLUMN roles.permissions IS 'Serverseitig ausgewertete Rechte einschließlich Datenbereich.';
COMMENT ON TABLE user_roles IS 'Historisierte n:m-Zuordnung mehrerer Rollen zu Benutzern.';
COMMENT ON COLUMN user_roles.revoked_at IS 'Widerrufszeitpunkt; NULL kennzeichnet eine aktive Zuweisung.';

COMMIT;
