BEGIN;

CREATE TABLE IF NOT EXISTS site_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    construction_site_id UUID NOT NULL,
    title VARCHAR(180) NOT NULL,
    details TEXT,
    priority VARCHAR(20) NOT NULL DEFAULT 'normal',
    status VARCHAR(20) NOT NULL DEFAULT 'open',
    assigned_user_id UUID,
    due_date DATE,
    completed_at TIMESTAMPTZ,
    created_by_user_id UUID NOT NULL,
    changed_by_user_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    row_version BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT site_tasks_company_fkey
        FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE RESTRICT,
    CONSTRAINT site_tasks_site_fkey
        FOREIGN KEY (company_id, construction_site_id)
        REFERENCES construction_sites (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT site_tasks_assignee_fkey
        FOREIGN KEY (company_id, assigned_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT site_tasks_creator_fkey
        FOREIGN KEY (company_id, created_by_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT site_tasks_changer_fkey
        FOREIGN KEY (company_id, changed_by_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT site_tasks_company_id_id_key UNIQUE (company_id, id),
    CONSTRAINT site_tasks_title_check CHECK (BTRIM(title) <> ''),
    CONSTRAINT site_tasks_details_check CHECK (details IS NULL OR BTRIM(details) <> ''),
    CONSTRAINT site_tasks_priority_check CHECK (priority IN ('low', 'normal', 'high')),
    CONSTRAINT site_tasks_status_check CHECK (status IN ('open', 'in_progress', 'done', 'archived')),
    CONSTRAINT site_tasks_completed_check CHECK (
        (status = 'done' AND completed_at IS NOT NULL)
        OR (status <> 'done' AND completed_at IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS site_tasks_site_status_idx
    ON site_tasks (company_id, construction_site_id, status, due_date, created_at DESC);

CREATE OR REPLACE FUNCTION site_tasks_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.title := BTRIM(NEW.title);
    NEW.details := NULLIF(BTRIM(NEW.details), '');
    NEW.priority := LOWER(BTRIM(NEW.priority));
    NEW.status := LOWER(BTRIM(NEW.status));

    IF NEW.status = 'done' THEN
        NEW.completed_at := COALESCE(NEW.completed_at, CURRENT_TIMESTAMP);
    ELSE
        NEW.completed_at := NULL;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF NEW.company_id <> OLD.company_id OR NEW.construction_site_id <> OLD.construction_site_id
           OR NEW.created_by_user_id <> OLD.created_by_user_id THEN
            RAISE EXCEPTION 'Firma, Baustelle und Ersteller einer Aufgabe sind unveränderlich.';
        END IF;
        NEW.updated_at := CURRENT_TIMESTAMP;
        NEW.row_version := OLD.row_version + 1;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS site_tasks_before_write_trigger ON site_tasks;
CREATE TRIGGER site_tasks_before_write_trigger
    BEFORE INSERT OR UPDATE ON site_tasks
    FOR EACH ROW EXECUTE FUNCTION site_tasks_before_write();

CREATE OR REPLACE FUNCTION site_tasks_prevent_hard_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF CURRENT_SETTING('app.allow_hard_delete', TRUE) = 'on' THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'Baustellenaufgaben dürfen nicht hart gelöscht werden.';
END;
$$;

DROP TRIGGER IF EXISTS site_tasks_prevent_hard_delete_trigger ON site_tasks;
CREATE TRIGGER site_tasks_prevent_hard_delete_trigger
    BEFORE DELETE ON site_tasks
    FOR EACH ROW EXECUTE FUNCTION site_tasks_prevent_hard_delete();

ALTER TABLE site_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS site_tasks_tenant_isolation ON site_tasks;
CREATE POLICY site_tasks_tenant_isolation ON site_tasks
    USING (company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID)
    WITH CHECK (company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID);

GRANT SELECT, INSERT, UPDATE ON site_tasks TO schaefchen_api;
ALTER TABLE site_tasks NO FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE site_tasks IS 'Thematisch zur Baustelle gehörende Aufgaben mit Statushistorie im Datensatz und ohne Hartlöschen.';

COMMIT;
