BEGIN;

CREATE TABLE IF NOT EXISTS planning_teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    name VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_by_user_id UUID NOT NULL,
    changed_by_user_id UUID NOT NULL,
    last_change_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    row_version BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT planning_teams_company_id_fkey
        FOREIGN KEY (company_id)
        REFERENCES companies (id)
        ON DELETE RESTRICT,
    CONSTRAINT planning_teams_created_by_fkey
        FOREIGN KEY (company_id, created_by_user_id)
        REFERENCES users (company_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT planning_teams_changed_by_fkey
        FOREIGN KEY (company_id, changed_by_user_id)
        REFERENCES users (company_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT planning_teams_company_id_id_key UNIQUE (company_id, id),
    CONSTRAINT planning_teams_name_not_blank CHECK (BTRIM(name) <> ''),
    CONSTRAINT planning_teams_status_check CHECK (status IN ('active', 'archived')),
    CONSTRAINT planning_teams_reason_not_blank CHECK (
        last_change_reason IS NULL OR BTRIM(last_change_reason) <> ''
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS planning_teams_active_name_key
    ON planning_teams (company_id, LOWER(name))
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS planning_teams_company_status_idx
    ON planning_teams (company_id, status, LOWER(name));

CREATE TABLE IF NOT EXISTS planning_team_members (
    company_id UUID NOT NULL,
    planning_team_id UUID NOT NULL,
    user_id UUID NOT NULL,
    added_by_user_id UUID NOT NULL,
    added_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ended_by_user_id UUID,
    ended_at TIMESTAMPTZ,
    row_version BIGINT NOT NULL DEFAULT 1,
    PRIMARY KEY (company_id, planning_team_id, user_id),
    CONSTRAINT planning_team_members_company_id_fkey
        FOREIGN KEY (company_id)
        REFERENCES companies (id)
        ON DELETE RESTRICT,
    CONSTRAINT planning_team_members_team_fkey
        FOREIGN KEY (company_id, planning_team_id)
        REFERENCES planning_teams (company_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT planning_team_members_user_fkey
        FOREIGN KEY (company_id, user_id)
        REFERENCES users (company_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT planning_team_members_added_by_fkey
        FOREIGN KEY (company_id, added_by_user_id)
        REFERENCES users (company_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT planning_team_members_ended_by_fkey
        FOREIGN KEY (company_id, ended_by_user_id)
        REFERENCES users (company_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT planning_team_members_period_check CHECK (
        (ended_at IS NULL AND ended_by_user_id IS NULL)
        OR
        (ended_at IS NOT NULL AND ended_by_user_id IS NOT NULL AND ended_at >= added_at)
    )
);

CREATE INDEX IF NOT EXISTS planning_team_members_active_team_idx
    ON planning_team_members (company_id, planning_team_id, user_id)
    WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS planning_team_members_active_user_idx
    ON planning_team_members (company_id, user_id, planning_team_id)
    WHERE ended_at IS NULL;

CREATE TABLE IF NOT EXISTS planning_team_member_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    planning_team_id UUID NOT NULL,
    user_id UUID NOT NULL,
    event_type VARCHAR(20) NOT NULL,
    actor_user_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT planning_team_member_events_company_id_fkey
        FOREIGN KEY (company_id)
        REFERENCES companies (id)
        ON DELETE RESTRICT,
    CONSTRAINT planning_team_member_events_team_fkey
        FOREIGN KEY (company_id, planning_team_id)
        REFERENCES planning_teams (company_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT planning_team_member_events_user_fkey
        FOREIGN KEY (company_id, user_id)
        REFERENCES users (company_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT planning_team_member_events_actor_fkey
        FOREIGN KEY (company_id, actor_user_id)
        REFERENCES users (company_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT planning_team_member_events_type_check
        CHECK (event_type IN ('added', 'removed', 'reactivated'))
);

CREATE INDEX IF NOT EXISTS planning_team_member_events_team_idx
    ON planning_team_member_events (
        company_id,
        planning_team_id,
        created_at DESC,
        id
    );

CREATE TABLE IF NOT EXISTS planning_team_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    planning_team_id UUID NOT NULL,
    changed_by_user_id UUID NOT NULL,
    change_reason TEXT NOT NULL,
    previous_values JSONB NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT planning_team_history_company_id_fkey
        FOREIGN KEY (company_id)
        REFERENCES companies (id)
        ON DELETE RESTRICT,
    CONSTRAINT planning_team_history_team_fkey
        FOREIGN KEY (company_id, planning_team_id)
        REFERENCES planning_teams (company_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT planning_team_history_changed_by_fkey
        FOREIGN KEY (company_id, changed_by_user_id)
        REFERENCES users (company_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT planning_team_history_reason_not_blank CHECK (BTRIM(change_reason) <> ''),
    CONSTRAINT planning_team_history_values_object_check
        CHECK (jsonb_typeof(previous_values) = 'object')
);

CREATE INDEX IF NOT EXISTS planning_team_history_team_idx
    ON planning_team_history (company_id, planning_team_id, changed_at DESC);

CREATE OR REPLACE FUNCTION site_assignments_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.comment := NULLIF(BTRIM(NEW.comment), '');
    NEW.planning_template_key := NULLIF(BTRIM(NEW.planning_template_key), '');
    NEW.last_change_reason := NULLIF(BTRIM(NEW.last_change_reason), '');

    IF NEW.status IN ('released', 'completed') AND NEW.published_at IS NULL THEN
        NEW.published_at := CURRENT_TIMESTAMP;
    ELSIF NEW.status = 'draft' THEN
        NEW.published_at := NULL;
        NEW.cancelled_at := NULL;
    END IF;

    IF NEW.status = 'cancelled' AND NEW.cancelled_at IS NULL THEN
        NEW.cancelled_at := CURRENT_TIMESTAMP;
    ELSIF NEW.status <> 'cancelled' THEN
        NEW.cancelled_at := NULL;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF NEW.company_id <> OLD.company_id THEN
            RAISE EXCEPTION 'Die Firma einer Planung ist unveränderlich.';
        END IF;

        IF OLD.status IN ('released', 'completed')
            AND (
                NEW.user_id IS DISTINCT FROM OLD.user_id
                OR NEW.construction_site_id IS DISTINCT FROM OLD.construction_site_id
                OR NEW.work_date IS DISTINCT FROM OLD.work_date
                OR NEW.sequence_number IS DISTINCT FROM OLD.sequence_number
                OR NEW.planned_start_time IS DISTINCT FROM OLD.planned_start_time
                OR NEW.planned_duration_minutes IS DISTINCT FROM OLD.planned_duration_minutes
                OR (NEW.status = 'cancelled' AND OLD.status <> 'cancelled')
            )
            AND NEW.last_change_reason IS NULL THEN
            RAISE EXCEPTION
                'Änderungen an einer freigegebenen Planung benötigen eine Begründung.';
        END IF;

        NEW.updated_at := CURRENT_TIMESTAMP;
        NEW.row_version := OLD.row_version + 1;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION site_assignments_validate_report_responsibility()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.report_responsible AND NEW.report_responsibility_source IS NULL THEN
        NEW.report_responsibility_source := 'manual';
    ELSIF NOT NEW.report_responsible THEN
        NEW.report_responsibility_source := NULL;
    END IF;

    IF TG_OP = 'UPDATE'
        AND (
            NEW.report_responsible IS DISTINCT FROM OLD.report_responsible
            OR NEW.report_responsibility_source IS DISTINCT FROM OLD.report_responsibility_source
        )
        AND NULLIF(BTRIM(NEW.last_change_reason), '') IS NULL THEN
        RAISE EXCEPTION 'Änderungen an der Berichtsverantwortung benötigen eine Begründung.';
    END IF;

    IF TG_OP = 'UPDATE' AND EXISTS (
        SELECT 1 FROM site_reports
        WHERE company_id = OLD.company_id AND site_assignment_id = OLD.id
    ) AND (
        NEW.user_id IS DISTINCT FROM OLD.user_id
        OR NEW.work_date IS DISTINCT FROM OLD.work_date
        OR NEW.status IS DISTINCT FROM OLD.status
        OR NEW.report_responsible IS DISTINCT FROM OLD.report_responsible
        OR NEW.report_responsibility_source IS DISTINCT FROM OLD.report_responsibility_source
    ) THEN
        RAISE EXCEPTION 'Ein Einsatz mit bereits erfasstem Baustellenbericht ist gesperrt.';
    END IF;

    IF NEW.report_responsible
        AND NEW.status <> 'cancelled'
        AND NEW.report_responsibility_source = 'manual'
        AND NOT EXISTS (
            SELECT 1
            FROM users
            WHERE company_id = NEW.company_id
              AND id = NEW.user_id
              AND status = 'active'
              AND is_foreman
        ) THEN
        RAISE EXCEPTION 'Nur aktive Vorarbeiter dürfen manuell für den Tagesbericht verantwortlich sein.';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION planning_teams_before_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := CURRENT_TIMESTAMP;
    NEW.row_version := OLD.row_version + 1;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS planning_teams_before_update_trigger ON planning_teams;
CREATE TRIGGER planning_teams_before_update_trigger
    BEFORE UPDATE ON planning_teams
    FOR EACH ROW
    EXECUTE FUNCTION planning_teams_before_update();

CREATE OR REPLACE FUNCTION planning_teams_record_history()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF ROW(OLD.name, OLD.status) IS DISTINCT FROM ROW(NEW.name, NEW.status) THEN
        INSERT INTO planning_team_history (
            company_id,
            planning_team_id,
            changed_by_user_id,
            change_reason,
            previous_values
        )
        VALUES (
            OLD.company_id,
            OLD.id,
            NEW.changed_by_user_id,
            COALESCE(NEW.last_change_reason, 'Teamvorlage geändert'),
            jsonb_build_object(
                'name', OLD.name,
                'status', OLD.status,
                'rowVersion', OLD.row_version
            )
        );
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS planning_teams_record_history_trigger ON planning_teams;
CREATE TRIGGER planning_teams_record_history_trigger
    AFTER UPDATE ON planning_teams
    FOR EACH ROW
    EXECUTE FUNCTION planning_teams_record_history();

CREATE OR REPLACE FUNCTION planning_team_members_before_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.row_version := OLD.row_version + 1;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS planning_team_members_before_update_trigger ON planning_team_members;
CREATE TRIGGER planning_team_members_before_update_trigger
    BEFORE UPDATE ON planning_team_members
    FOR EACH ROW
    EXECUTE FUNCTION planning_team_members_before_update();

CREATE OR REPLACE FUNCTION planning_data_prevent_hard_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'Planungsdaten dürfen nicht hart gelöscht werden.';
END;
$$;

DROP TRIGGER IF EXISTS planning_teams_prevent_hard_delete_trigger ON planning_teams;
CREATE TRIGGER planning_teams_prevent_hard_delete_trigger
    BEFORE DELETE ON planning_teams
    FOR EACH ROW
    EXECUTE FUNCTION planning_data_prevent_hard_delete();

DROP TRIGGER IF EXISTS planning_team_members_prevent_hard_delete_trigger ON planning_team_members;
CREATE TRIGGER planning_team_members_prevent_hard_delete_trigger
    BEFORE DELETE ON planning_team_members
    FOR EACH ROW
    EXECUTE FUNCTION planning_data_prevent_hard_delete();

DROP TRIGGER IF EXISTS planning_team_history_prevent_hard_delete_trigger ON planning_team_history;
CREATE TRIGGER planning_team_history_prevent_hard_delete_trigger
    BEFORE DELETE ON planning_team_history
    FOR EACH ROW
    EXECUTE FUNCTION planning_data_prevent_hard_delete();

DROP TRIGGER IF EXISTS planning_team_member_events_prevent_hard_delete_trigger
    ON planning_team_member_events;
CREATE TRIGGER planning_team_member_events_prevent_hard_delete_trigger
    BEFORE DELETE ON planning_team_member_events
    FOR EACH ROW
    EXECUTE FUNCTION planning_data_prevent_hard_delete();

ALTER TABLE planning_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE planning_team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE planning_team_member_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE planning_team_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS planning_teams_tenant_isolation ON planning_teams;
CREATE POLICY planning_teams_tenant_isolation ON planning_teams
    USING (company_id = current_company_id())
    WITH CHECK (company_id = current_company_id());

DROP POLICY IF EXISTS planning_team_members_tenant_isolation ON planning_team_members;
CREATE POLICY planning_team_members_tenant_isolation ON planning_team_members
    USING (company_id = current_company_id())
    WITH CHECK (company_id = current_company_id());

DROP POLICY IF EXISTS planning_team_history_tenant_isolation ON planning_team_history;
CREATE POLICY planning_team_history_tenant_isolation ON planning_team_history
    USING (company_id = current_company_id())
    WITH CHECK (company_id = current_company_id());

DROP POLICY IF EXISTS planning_team_member_events_tenant_isolation
    ON planning_team_member_events;
CREATE POLICY planning_team_member_events_tenant_isolation
    ON planning_team_member_events
    USING (company_id = current_company_id())
    WITH CHECK (company_id = current_company_id());

GRANT SELECT, INSERT, UPDATE ON planning_teams TO schaefchen_api;
GRANT SELECT, INSERT, UPDATE ON planning_team_members TO schaefchen_api;
GRANT SELECT, INSERT ON planning_team_member_events TO schaefchen_api;
GRANT SELECT, INSERT ON planning_team_history TO schaefchen_api;

ALTER TABLE planning_teams NO FORCE ROW LEVEL SECURITY;
ALTER TABLE planning_team_members NO FORCE ROW LEVEL SECURITY;
ALTER TABLE planning_team_member_events NO FORCE ROW LEVEL SECURITY;
ALTER TABLE planning_team_history NO FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE planning_teams IS
    'Mandantengetrennte, historisierte Teamvorlagen für die Desktop-Plantafel.';
COMMENT ON TABLE planning_team_members IS
    'Zeitlich nachvollziehbare Mitglieder einer Teamvorlage; Einsätze bleiben individuelle Mitarbeiterzuweisungen.';
COMMENT ON COLUMN site_assignments.planning_template_key IS
    'Optionale UUID der beim Anlegen verwendeten Teamvorlage; die individuelle Mitarbeiterzuweisung bleibt führend.';

COMMIT;
