BEGIN;

ALTER TABLE users
    DROP CONSTRAINT IF EXISTS users_status_check,
    DROP CONSTRAINT IF EXISTS users_deactivation_check;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS archived_reason TEXT,
    ADD COLUMN IF NOT EXISTS archived_by_user_id UUID;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'users_archived_by_fkey' AND conrelid = 'users'::REGCLASS
    ) THEN
        ALTER TABLE users ADD CONSTRAINT users_archived_by_fkey
            FOREIGN KEY (company_id, archived_by_user_id)
            REFERENCES users (company_id, id) ON DELETE RESTRICT;
    END IF;
END;
$$;

ALTER TABLE users
    ADD CONSTRAINT users_status_check CHECK (status IN ('active', 'inactive', 'archived')),
    ADD CONSTRAINT users_deactivation_check CHECK (
        (status = 'active' AND deactivated_at IS NULL AND archived_at IS NULL
            AND archived_reason IS NULL AND archived_by_user_id IS NULL)
        OR (status = 'inactive' AND deactivated_at IS NOT NULL AND archived_at IS NULL
            AND archived_reason IS NULL AND archived_by_user_id IS NULL)
        OR (status = 'archived' AND deactivated_at IS NOT NULL AND archived_at IS NOT NULL
            AND BTRIM(archived_reason) <> '' AND archived_by_user_id IS NOT NULL)
    );

CREATE TABLE IF NOT EXISTS employee_lifecycle_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
    employee_id UUID NOT NULL,
    actor_user_id UUID NOT NULL,
    action VARCHAR(30) NOT NULL,
    reason TEXT NOT NULL,
    previous_state JSONB,
    new_state JSONB,
    result VARCHAR(20) NOT NULL DEFAULT 'success',
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT employee_lifecycle_actor_fkey
        FOREIGN KEY (company_id, actor_user_id) REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT employee_lifecycle_action_check
        CHECK (action IN ('archived', 'reactivated', 'hard_deleted', 'deactivated')),
    CONSTRAINT employee_lifecycle_reason_check CHECK (BTRIM(reason) <> ''),
    CONSTRAINT employee_lifecycle_result_check CHECK (result IN ('success', 'denied', 'failed')),
    CONSTRAINT employee_lifecycle_previous_check
        CHECK (previous_state IS NULL OR jsonb_typeof(previous_state) = 'object'),
    CONSTRAINT employee_lifecycle_new_check
        CHECK (new_state IS NULL OR jsonb_typeof(new_state) = 'object')
);

CREATE INDEX IF NOT EXISTS employee_lifecycle_events_employee_idx
    ON employee_lifecycle_events (company_id, employee_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION employee_has_historical_data(
    target_company_id UUID,
    target_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
    reference RECORD;
    condition_sql TEXT;
    has_reference BOOLEAN;
BEGIN
    IF EXISTS (
        SELECT 1 FROM user_roles
        WHERE company_id = target_company_id
          AND user_id <> target_user_id
          AND (assigned_by_user_id = target_user_id OR revoked_by_user_id = target_user_id)
    ) THEN
        RETURN TRUE;
    END IF;

    FOR reference IN
        SELECT constraint_row.oid, constraint_row.conrelid,
               constraint_row.conkey, constraint_row.confkey
        FROM pg_constraint AS constraint_row
        WHERE constraint_row.contype = 'f'
          AND constraint_row.confrelid = 'users'::REGCLASS
          AND constraint_row.conrelid NOT IN (
              'user_sessions'::REGCLASS,
              'user_roles'::REGCLASS,
              'time_account_profiles'::REGCLASS,
              'time_account_vacation_entitlements'::REGCLASS,
              'platform_announcement_reads'::REGCLASS
          )
    LOOP
        SELECT string_agg(
            format(
                '%I = %L',
                child_attribute.attname,
                CASE parent_attribute.attname
                    WHEN 'company_id' THEN target_company_id::TEXT
                    WHEN 'id' THEN target_user_id::TEXT
                    ELSE NULL
                END
            ),
            ' AND ' ORDER BY key_part.ordinality
        )
        INTO condition_sql
        FROM unnest(reference.conkey) WITH ORDINALITY AS key_part(attnum, ordinality)
        JOIN pg_attribute AS child_attribute
          ON child_attribute.attrelid = reference.conrelid
         AND child_attribute.attnum = key_part.attnum
        JOIN pg_attribute AS parent_attribute
          ON parent_attribute.attrelid = 'users'::REGCLASS
         AND parent_attribute.attnum = reference.confkey[key_part.ordinality];

        IF condition_sql IS NOT NULL THEN
            EXECUTE format(
                'SELECT EXISTS (SELECT 1 FROM %s WHERE %s)',
                (reference.conrelid)::REGCLASS, condition_sql
            ) INTO has_reference;
            IF has_reference THEN RETURN TRUE; END IF;
        END IF;
    END LOOP;
    RETURN FALSE;
END;
$$;

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
    NEW.archived_reason := NULLIF(BTRIM(NEW.archived_reason), '');

    IF NEW.status = 'active' THEN
        NEW.deactivated_at := NULL;
        NEW.archived_at := NULL;
        NEW.archived_reason := NULL;
        NEW.archived_by_user_id := NULL;
    ELSIF NEW.status = 'inactive' THEN
        NEW.deactivated_at := COALESCE(NEW.deactivated_at, CURRENT_TIMESTAMP);
        NEW.archived_at := NULL;
        NEW.archived_reason := NULL;
        NEW.archived_by_user_id := NULL;
    ELSIF NEW.status = 'archived' THEN
        NEW.deactivated_at := COALESCE(NEW.deactivated_at, CURRENT_TIMESTAMP);
        NEW.archived_at := COALESCE(NEW.archived_at, CURRENT_TIMESTAMP);
        IF NEW.archived_reason IS NULL OR NEW.archived_by_user_id IS NULL THEN
            RAISE EXCEPTION 'Archivieren benötigt einen Bearbeiter und eine Begründung.';
        END IF;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        NEW.updated_at := CURRENT_TIMESTAMP;
        NEW.row_version := OLD.row_version + 1;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION users_record_lifecycle_event()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    actor_id UUID;
    event_reason TEXT;
    event_action VARCHAR(30);
BEGIN
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
    -- Plattformaktionen besitzen einen eigenen, unveränderbaren Audit-Akteur.
    -- Es wird bewusst kein fiktiver Firmenmitarbeiter dafür angelegt.
    IF CURRENT_USER = 'schaefchen_platform_api' THEN RETURN NEW; END IF;
    IF NEW.status = 'archived' THEN
        actor_id := NEW.archived_by_user_id;
        event_reason := NEW.archived_reason;
        event_action := 'archived';
    ELSIF OLD.status = 'archived' AND NEW.status = 'active' THEN
        actor_id := NULLIF(CURRENT_SETTING('app.current_user_id', TRUE), '')::UUID;
        event_reason := NULLIF(CURRENT_SETTING('app.employee_lifecycle_reason', TRUE), '');
        event_action := 'reactivated';
    ELSIF NEW.status = 'inactive' THEN
        actor_id := NULLIF(CURRENT_SETTING('app.current_user_id', TRUE), '')::UUID;
        event_reason := COALESCE(NULLIF(CURRENT_SETTING('app.employee_lifecycle_reason', TRUE), ''), 'Konto deaktiviert');
        event_action := 'deactivated';
    ELSE
        RETURN NEW;
    END IF;

    IF actor_id IS NULL OR event_reason IS NULL THEN
        RAISE EXCEPTION 'Die Mitarbeiteränderung benötigt Bearbeiter und Begründung.';
    END IF;
    INSERT INTO employee_lifecycle_events (
        company_id, employee_id, actor_user_id, action, reason,
        previous_state, new_state
    ) VALUES (
        NEW.company_id, NEW.id, actor_id, event_action, event_reason,
        jsonb_build_object('status', OLD.status, 'rowVersion', OLD.row_version),
        jsonb_build_object('status', NEW.status, 'rowVersion', NEW.row_version)
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_lifecycle_event_trigger ON users;
CREATE TRIGGER users_lifecycle_event_trigger
    AFTER UPDATE OF status ON users
    FOR EACH ROW EXECUTE FUNCTION users_record_lifecycle_event();

CREATE OR REPLACE FUNCTION users_prevent_hard_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    actor_id UUID;
    event_reason TEXT;
BEGIN
    IF CURRENT_SETTING('app.allow_hard_delete', TRUE) IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION 'Benutzer dürfen nur über den geprüften Lösch- oder Archivierungsprozess entfernt werden.';
    END IF;
    IF employee_has_historical_data(OLD.company_id, OLD.id) THEN
        RAISE EXCEPTION 'Der Mitarbeiter besitzt historische Daten und muss archiviert werden.';
    END IF;
    actor_id := NULLIF(CURRENT_SETTING('app.current_user_id', TRUE), '')::UUID;
    event_reason := NULLIF(CURRENT_SETTING('app.employee_lifecycle_reason', TRUE), '');
    IF actor_id IS NULL OR event_reason IS NULL OR actor_id = OLD.id THEN
        RAISE EXCEPTION 'Die Löschung benötigt einen anderen Bearbeiter und eine Begründung.';
    END IF;
    INSERT INTO employee_lifecycle_events (
        company_id, employee_id, actor_user_id, action, reason,
        previous_state, new_state
    ) VALUES (
        OLD.company_id, OLD.id, actor_id, 'hard_deleted', event_reason,
        jsonb_build_object(
            'personnelNumber', OLD.personnel_number,
            'firstName', OLD.first_name,
            'lastName', OLD.last_name,
            'status', OLD.status,
            'createdAt', OLD.created_at
        ),
        jsonb_build_object('deleted', TRUE)
    );
    RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION employee_lifecycle_events_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Mitarbeiter-Lifecycle-Ereignisse sind unveränderlich.';
END;
$$;

DROP TRIGGER IF EXISTS employee_lifecycle_events_immutable_trigger ON employee_lifecycle_events;
CREATE TRIGGER employee_lifecycle_events_immutable_trigger
    BEFORE UPDATE OR DELETE ON employee_lifecycle_events
    FOR EACH ROW EXECUTE FUNCTION employee_lifecycle_events_immutable();

CREATE OR REPLACE FUNCTION ensure_active_planned_employee()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status IN ('draft', 'released')
       AND NOT EXISTS (
           SELECT 1 FROM users
           WHERE company_id = NEW.company_id AND id = NEW.user_id AND status = 'active'
       ) THEN
        RAISE EXCEPTION 'Archivierte oder deaktivierte Mitarbeiter dürfen nicht eingeplant werden.';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS site_assignments_active_employee_trigger ON site_assignments;
CREATE TRIGGER site_assignments_active_employee_trigger
    BEFORE INSERT OR UPDATE OF user_id, status ON site_assignments
    FOR EACH ROW EXECUTE FUNCTION ensure_active_planned_employee();

CREATE OR REPLACE FUNCTION ensure_active_team_member()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.ended_at IS NULL
       AND NOT EXISTS (
           SELECT 1 FROM users
           WHERE company_id = NEW.company_id AND id = NEW.user_id AND status = 'active'
       ) THEN
        RAISE EXCEPTION 'Archivierte oder deaktivierte Mitarbeiter dürfen keinem aktiven Planungsteam angehören.';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS planning_team_members_active_employee_trigger ON planning_team_members;
CREATE TRIGGER planning_team_members_active_employee_trigger
    BEFORE INSERT OR UPDATE OF user_id, ended_at ON planning_team_members
    FOR EACH ROW EXECUTE FUNCTION ensure_active_team_member();

CREATE OR REPLACE FUNCTION api_remove_or_archive_employee(
    target_employee_id UUID,
    target_actor_user_id UUID,
    target_reason TEXT
)
RETURNS TABLE (removal_mode VARCHAR)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
    target_company_id UUID;
    has_history BOOLEAN;
BEGIN
    target_company_id := NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID;
    IF target_company_id IS NULL OR NULLIF(BTRIM(target_reason), '') IS NULL THEN
        RAISE EXCEPTION 'Firma und Begründung sind erforderlich.';
    END IF;
    IF target_employee_id = target_actor_user_id OR NOT EXISTS (
        SELECT 1 FROM users WHERE company_id = target_company_id
          AND id = target_actor_user_id AND status = 'active'
    ) THEN
        RAISE EXCEPTION 'Ein berechtigter anderer Bearbeiter ist erforderlich.';
    END IF;
    PERFORM 1 FROM users
    WHERE company_id = target_company_id AND id = target_employee_id
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Der Mitarbeiter wurde nicht gefunden.'; END IF;

    has_history := employee_has_historical_data(target_company_id, target_employee_id);
    PERFORM set_config('app.employee_lifecycle_reason', BTRIM(target_reason), TRUE);

    UPDATE user_sessions
    SET revoked_at = CURRENT_TIMESTAMP, revocation_reason = 'employee_removed'
    WHERE company_id = target_company_id AND user_id = target_employee_id
      AND revoked_at IS NULL;

    IF has_history THEN
        UPDATE site_assignments
        SET status = 'cancelled', changed_by_user_id = target_actor_user_id,
            last_change_reason = BTRIM(target_reason)
        WHERE company_id = target_company_id AND user_id = target_employee_id
          AND work_date >= CURRENT_DATE AND status IN ('draft', 'released');

        UPDATE planning_team_members
        SET ended_at = CURRENT_TIMESTAMP, ended_by_user_id = target_actor_user_id
        WHERE company_id = target_company_id AND user_id = target_employee_id
          AND ended_at IS NULL;

        UPDATE users
        SET status = 'archived', archived_at = CURRENT_TIMESTAMP,
            archived_reason = BTRIM(target_reason),
            archived_by_user_id = target_actor_user_id
        WHERE company_id = target_company_id AND id = target_employee_id;
        removal_mode := 'archived';
        RETURN NEXT;
        RETURN;
    END IF;

    PERFORM set_config('app.allow_hard_delete', 'on', TRUE);
    DELETE FROM platform_announcement_reads
    WHERE company_id = target_company_id AND user_id = target_employee_id;
    DELETE FROM user_sessions
    WHERE company_id = target_company_id AND user_id = target_employee_id;
    DELETE FROM user_roles
    WHERE company_id = target_company_id AND user_id = target_employee_id;
    DELETE FROM time_account_vacation_entitlements
    WHERE company_id = target_company_id AND user_id = target_employee_id;
    DELETE FROM time_account_profiles
    WHERE company_id = target_company_id AND user_id = target_employee_id;
    DELETE FROM users
    WHERE company_id = target_company_id AND id = target_employee_id;
    removal_mode := 'deleted';
    RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION platform_reassign_unhistorical_user(
    target_user_id UUID,
    target_company_id UUID,
    target_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE source_company_id UUID;
BEGIN
    IF NULLIF(CURRENT_SETTING('app.current_platform_user_id', TRUE), '') IS NULL THEN
        RAISE EXCEPTION 'Nur die authentifizierte Plattformverwaltung darf Konten verschieben.';
    END IF;
    IF NULLIF(BTRIM(target_reason), '') IS NULL THEN
        RAISE EXCEPTION 'Eine Begründung ist erforderlich.';
    END IF;
    SELECT company_id INTO source_company_id FROM users WHERE id = target_user_id FOR UPDATE;
    IF source_company_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM companies WHERE id = target_company_id
          AND status IN ('trial','active','payment_due','restricted')
    ) THEN
        RAISE EXCEPTION 'Quellkonto oder Zielfirma wurde nicht gefunden.';
    END IF;
    IF employee_has_historical_data(source_company_id, target_user_id) THEN
        RAISE EXCEPTION 'Konten mit fachlichen historischen Daten können nicht verschoben werden.';
    END IF;
    PERFORM set_config('app.allow_hard_delete', 'on', TRUE);
    DELETE FROM platform_announcement_reads WHERE company_id = source_company_id AND user_id = target_user_id;
    DELETE FROM user_sessions WHERE company_id = source_company_id AND user_id = target_user_id;
    DELETE FROM user_roles WHERE company_id = source_company_id AND user_id = target_user_id;
    DELETE FROM time_account_vacation_entitlements WHERE company_id = source_company_id AND user_id = target_user_id;
    DELETE FROM time_account_profiles WHERE company_id = source_company_id AND user_id = target_user_id;
    UPDATE users SET company_id = target_company_id, must_change_password = TRUE WHERE id = target_user_id;
    INSERT INTO user_roles (company_id,user_id,role_id,reason)
    SELECT target_company_id,target_user_id,id,BTRIM(target_reason)
    FROM roles WHERE company_id = target_company_id AND role_key = 'installer' AND status = 'active'
    LIMIT 1;
    INSERT INTO time_account_profiles (company_id,user_id,account_start_date)
    VALUES (target_company_id,target_user_id,CURRENT_DATE);
    INSERT INTO time_account_vacation_entitlements (company_id,user_id,calendar_year)
    VALUES (target_company_id,target_user_id,EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER);
END;
$$;

ALTER TABLE employee_lifecycle_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS employee_lifecycle_events_tenant_isolation ON employee_lifecycle_events;
CREATE POLICY employee_lifecycle_events_tenant_isolation ON employee_lifecycle_events
    USING (company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID)
    WITH CHECK (company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID);
GRANT SELECT, INSERT ON employee_lifecycle_events TO schaefchen_api;
REVOKE ALL ON FUNCTION employee_has_historical_data(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION api_remove_or_archive_employee(UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform_reassign_unhistorical_user(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION employee_has_historical_data(UUID, UUID) TO schaefchen_api;
GRANT EXECUTE ON FUNCTION api_remove_or_archive_employee(UUID, UUID, TEXT) TO schaefchen_api;
GRANT EXECUTE ON FUNCTION platform_reassign_unhistorical_user(UUID, UUID, TEXT)
    TO schaefchen_platform_api;
ALTER TABLE employee_lifecycle_events NO FORCE ROW LEVEL SECURITY;

COMMENT ON FUNCTION employee_has_historical_data(UUID, UUID) IS
    'Prüft zukunftssicher alle fachlichen Fremdschlüssel auf historische Mitarbeiterdaten; rein technische Sitzungen und Initialwerte zählen nicht.';
COMMENT ON TABLE employee_lifecycle_events IS
    'Unveränderbares Audit für Archivierung, Reaktivierung, Deaktivierung und zulässige Hartlöschung.';

COMMIT;
