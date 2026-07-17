BEGIN;

CREATE TABLE IF NOT EXISTS site_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    user_id UUID NOT NULL,
    construction_site_id UUID NOT NULL,
    work_date DATE NOT NULL,
    sequence_number INTEGER NOT NULL,
    planned_start_time TIME,
    planned_duration_minutes INTEGER,
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    comment TEXT,
    recurrence_key UUID,
    planning_template_key VARCHAR(100),
    published_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    created_by_user_id UUID,
    changed_by_user_id UUID,
    last_change_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    row_version BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT site_assignments_company_id_fkey
        FOREIGN KEY (company_id)
        REFERENCES companies (id)
        ON DELETE RESTRICT,
    CONSTRAINT site_assignments_user_fkey
        FOREIGN KEY (company_id, user_id)
        REFERENCES users (company_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT site_assignments_site_fkey
        FOREIGN KEY (company_id, construction_site_id)
        REFERENCES construction_sites (company_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT site_assignments_created_by_fkey
        FOREIGN KEY (company_id, created_by_user_id)
        REFERENCES users (company_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT site_assignments_changed_by_fkey
        FOREIGN KEY (company_id, changed_by_user_id)
        REFERENCES users (company_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT site_assignments_company_id_id_key UNIQUE (company_id, id),
    CONSTRAINT site_assignments_sequence_check CHECK (sequence_number >= 1),
    CONSTRAINT site_assignments_duration_check CHECK (
        planned_duration_minutes IS NULL OR planned_duration_minutes BETWEEN 1 AND 1440
    ),
    CONSTRAINT site_assignments_status_check CHECK (
        status IN ('draft', 'released', 'completed', 'cancelled')
    ),
    CONSTRAINT site_assignments_publish_check CHECK (
        (status = 'draft' AND published_at IS NULL AND cancelled_at IS NULL)
        OR
        (status IN ('released', 'completed') AND published_at IS NOT NULL AND cancelled_at IS NULL)
        OR
        (status = 'cancelled' AND cancelled_at IS NOT NULL)
    ),
    CONSTRAINT site_assignments_comment_not_blank CHECK (
        comment IS NULL OR BTRIM(comment) <> ''
    ),
    CONSTRAINT site_assignments_template_not_blank CHECK (
        planning_template_key IS NULL OR BTRIM(planning_template_key) <> ''
    ),
    CONSTRAINT site_assignments_change_reason_not_blank CHECK (
        last_change_reason IS NULL OR BTRIM(last_change_reason) <> ''
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS site_assignments_active_sequence_key
    ON site_assignments (company_id, user_id, work_date, sequence_number)
    WHERE status <> 'cancelled';

CREATE INDEX IF NOT EXISTS site_assignments_user_week_idx
    ON site_assignments (company_id, user_id, work_date, sequence_number)
    WHERE status IN ('draft', 'released');

CREATE INDEX IF NOT EXISTS site_assignments_site_date_idx
    ON site_assignments (company_id, construction_site_id, work_date);

CREATE TABLE IF NOT EXISTS site_assignment_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    site_assignment_id UUID NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    changed_by_user_id UUID,
    change_reason TEXT,
    previous_values JSONB NOT NULL,
    CONSTRAINT site_assignment_history_company_id_fkey
        FOREIGN KEY (company_id)
        REFERENCES companies (id)
        ON DELETE RESTRICT,
    CONSTRAINT site_assignment_history_assignment_fkey
        FOREIGN KEY (company_id, site_assignment_id)
        REFERENCES site_assignments (company_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT site_assignment_history_changed_by_fkey
        FOREIGN KEY (company_id, changed_by_user_id)
        REFERENCES users (company_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT site_assignment_history_values_object_check
        CHECK (jsonb_typeof(previous_values) = 'object'),
    CONSTRAINT site_assignment_history_reason_not_blank CHECK (
        change_reason IS NULL OR BTRIM(change_reason) <> ''
    )
);

CREATE INDEX IF NOT EXISTS site_assignment_history_assignment_idx
    ON site_assignment_history (company_id, site_assignment_id, changed_at DESC);

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
        IF NEW.company_id <> OLD.company_id OR NEW.user_id <> OLD.user_id THEN
            RAISE EXCEPTION 'Firma und Mitarbeiter einer Planung sind unveränderlich.';
        END IF;

        IF OLD.status IN ('released', 'completed')
            AND (
                NEW.construction_site_id IS DISTINCT FROM OLD.construction_site_id
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

DROP TRIGGER IF EXISTS site_assignments_before_write_trigger ON site_assignments;
CREATE TRIGGER site_assignments_before_write_trigger
    BEFORE INSERT OR UPDATE ON site_assignments
    FOR EACH ROW
    EXECUTE FUNCTION site_assignments_before_write();

CREATE OR REPLACE FUNCTION site_assignments_record_history()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO site_assignment_history (
        company_id,
        site_assignment_id,
        changed_by_user_id,
        change_reason,
        previous_values
    )
    VALUES (
        OLD.company_id,
        OLD.id,
        NEW.changed_by_user_id,
        NEW.last_change_reason,
        TO_JSONB(OLD) - 'company_id'
    );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS site_assignments_record_history_trigger ON site_assignments;
CREATE TRIGGER site_assignments_record_history_trigger
    AFTER UPDATE ON site_assignments
    FOR EACH ROW
    EXECUTE FUNCTION site_assignments_record_history();

CREATE OR REPLACE FUNCTION planning_prevent_hard_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF CURRENT_SETTING('app.allow_hard_delete', TRUE) = 'on' THEN
        RETURN OLD;
    END IF;

    RAISE EXCEPTION
        'Planungen und ihre Historie dürfen nicht hart gelöscht werden.';
END;
$$;

DROP TRIGGER IF EXISTS site_assignments_prevent_hard_delete_trigger ON site_assignments;
CREATE TRIGGER site_assignments_prevent_hard_delete_trigger
    BEFORE DELETE ON site_assignments
    FOR EACH ROW
    EXECUTE FUNCTION planning_prevent_hard_delete();

DROP TRIGGER IF EXISTS site_assignment_history_prevent_hard_delete_trigger ON site_assignment_history;
CREATE TRIGGER site_assignment_history_prevent_hard_delete_trigger
    BEFORE DELETE ON site_assignment_history
    FOR EACH ROW
    EXECUTE FUNCTION planning_prevent_hard_delete();

ALTER TABLE site_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_assignment_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS site_assignments_tenant_isolation ON site_assignments;
CREATE POLICY site_assignments_tenant_isolation ON site_assignments
    USING (company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID)
    WITH CHECK (company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID);

DROP POLICY IF EXISTS site_assignment_history_tenant_isolation ON site_assignment_history;
CREATE POLICY site_assignment_history_tenant_isolation ON site_assignment_history
    USING (company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID)
    WITH CHECK (company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID);

GRANT SELECT, INSERT, UPDATE ON site_assignments TO schaefchen_api;
GRANT SELECT, INSERT ON site_assignment_history TO schaefchen_api;
ALTER TABLE site_assignments NO FORCE ROW LEVEL SECURITY;
ALTER TABLE site_assignment_history NO FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE site_assignments IS 'Historisierte Wochen- und Tagesplanung mit mehreren Baustellen je Mitarbeiter und Tag.';
COMMENT ON COLUMN site_assignments.sequence_number IS 'Verpflichtende Tagesreihenfolge; dieselbe Baustelle darf mehrfach vorkommen.';
COMMENT ON COLUMN site_assignments.planned_start_time IS 'Optionale Uhrzeit; die Reihenfolge bleibt führend.';
COMMENT ON COLUMN site_assignments.recurrence_key IS 'Verknüpft wiederkehrende Planungen ohne ihre Einzelhistorie zu verlieren.';
COMMENT ON TABLE site_assignment_history IS 'Unveränderliche Vorher-Stände spontaner und regulärer Planänderungen.';

COMMIT;
