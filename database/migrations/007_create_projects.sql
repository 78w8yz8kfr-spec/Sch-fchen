BEGIN;

CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    customer_id UUID NOT NULL,
    project_number VARCHAR(20) NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    priority VARCHAR(20) NOT NULL DEFAULT 'normal',
    status VARCHAR(20) NOT NULL DEFAULT 'planned',
    internal_notes TEXT,
    installer_short_text VARCHAR(300),
    budget_amount NUMERIC(14, 2),
    budget_currency CHAR(3) NOT NULL DEFAULT 'EUR',
    copied_from_project_id UUID,
    start_date DATE,
    target_end_date DATE,
    completed_at TIMESTAMPTZ,
    reopened_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    archived_at TIMESTAMPTZ,
    row_version BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT projects_company_id_fkey
        FOREIGN KEY (company_id)
        REFERENCES companies (id)
        ON DELETE RESTRICT,
    CONSTRAINT projects_customer_fkey
        FOREIGN KEY (company_id, customer_id)
        REFERENCES customers (company_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT projects_company_id_id_key UNIQUE (company_id, id),
    CONSTRAINT projects_company_number_key UNIQUE (company_id, project_number),
    CONSTRAINT projects_copied_from_fkey
        FOREIGN KEY (company_id, copied_from_project_id)
        REFERENCES projects (company_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT projects_number_check
        CHECK (project_number ~ '^SE-[0-9]{4}-[0-9]{4}$'),
    CONSTRAINT projects_name_not_blank CHECK (BTRIM(name) <> ''),
    CONSTRAINT projects_priority_check
        CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    CONSTRAINT projects_status_check CHECK (
        status IN ('planned', 'active', 'on_hold', 'completed', 'cancelled', 'archived')
    ),
    CONSTRAINT projects_budget_check
        CHECK (budget_amount IS NULL OR budget_amount >= 0),
    CONSTRAINT projects_currency_check
        CHECK (budget_currency ~ '^[A-Z]{3}$'),
    CONSTRAINT projects_date_check CHECK (
        target_end_date IS NULL OR start_date IS NULL OR target_end_date >= start_date
    ),
    CONSTRAINT projects_completion_check CHECK (
        (status = 'completed' AND completed_at IS NOT NULL AND archived_at IS NULL)
        OR
        (status = 'archived' AND archived_at IS NOT NULL)
        OR
        (status NOT IN ('completed', 'archived') AND completed_at IS NULL AND archived_at IS NULL)
    ),
    CONSTRAINT projects_not_copied_from_self_check CHECK (
        copied_from_project_id IS NULL OR copied_from_project_id <> id
    )
);

CREATE INDEX IF NOT EXISTS projects_company_status_idx
    ON projects (company_id, status, priority);

CREATE INDEX IF NOT EXISTS projects_customer_idx
    ON projects (company_id, customer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS project_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    project_id UUID NOT NULL,
    customer_location_id UUID NOT NULL,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    removed_at TIMESTAMPTZ,
    CONSTRAINT project_locations_company_id_fkey
        FOREIGN KEY (company_id)
        REFERENCES companies (id)
        ON DELETE RESTRICT,
    CONSTRAINT project_locations_project_fkey
        FOREIGN KEY (company_id, project_id)
        REFERENCES projects (company_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT project_locations_location_fkey
        FOREIGN KEY (company_id, customer_location_id)
        REFERENCES customer_locations (company_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT project_locations_period_check CHECK (
        removed_at IS NULL OR removed_at >= assigned_at
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS project_locations_active_key
    ON project_locations (company_id, project_id, customer_location_id)
    WHERE removed_at IS NULL;

CREATE TABLE IF NOT EXISTS project_responsibles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    project_id UUID NOT NULL,
    user_id UUID NOT NULL,
    responsibility VARCHAR(30) NOT NULL DEFAULT 'project_management',
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    removed_at TIMESTAMPTZ,
    CONSTRAINT project_responsibles_company_id_fkey
        FOREIGN KEY (company_id)
        REFERENCES companies (id)
        ON DELETE RESTRICT,
    CONSTRAINT project_responsibles_project_fkey
        FOREIGN KEY (company_id, project_id)
        REFERENCES projects (company_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT project_responsibles_user_fkey
        FOREIGN KEY (company_id, user_id)
        REFERENCES users (company_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT project_responsibles_type_check CHECK (
        responsibility IN ('project_management', 'commercial', 'technical', 'other')
    ),
    CONSTRAINT project_responsibles_period_check CHECK (
        removed_at IS NULL OR removed_at >= assigned_at
    ),
    CONSTRAINT project_responsibles_primary_active_check CHECK (
        NOT is_primary OR removed_at IS NULL
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS project_responsibles_active_key
    ON project_responsibles (company_id, project_id, user_id, responsibility)
    WHERE removed_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS project_responsibles_primary_key
    ON project_responsibles (company_id, project_id, responsibility)
    WHERE is_primary AND removed_at IS NULL;

CREATE OR REPLACE FUNCTION next_project_number(
    target_company_id UUID,
    target_year INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER
)
RETURNS VARCHAR(20)
LANGUAGE plpgsql
AS $$
DECLARE
    next_number INTEGER;
BEGIN
    PERFORM pg_advisory_xact_lock(
        hashtextextended(
            'projects:' || target_company_id::TEXT || ':' || target_year::TEXT,
            0
        )
    );

    SELECT COALESCE(MAX(RIGHT(project_number, 4)::INTEGER), 0) + 1
    INTO next_number
    FROM projects
    WHERE company_id = target_company_id
      AND project_number LIKE 'SE-' || target_year::TEXT || '-%';

    IF next_number > 9999 THEN
        RAISE EXCEPTION 'Projektnummernkreis % für Firma % ist ausgeschöpft', target_year, target_company_id;
    END IF;

    RETURN 'SE-' || target_year::TEXT || '-' || LPAD(next_number::TEXT, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION projects_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NULLIF(BTRIM(NEW.project_number), '') IS NULL THEN
        NEW.project_number := next_project_number(NEW.company_id);
    END IF;

    NEW.project_number := UPPER(BTRIM(NEW.project_number));
    NEW.name := BTRIM(NEW.name);
    NEW.description := NULLIF(BTRIM(NEW.description), '');
    NEW.internal_notes := NULLIF(BTRIM(NEW.internal_notes), '');
    NEW.installer_short_text := NULLIF(BTRIM(NEW.installer_short_text), '');
    NEW.budget_currency := UPPER(BTRIM(NEW.budget_currency));

    IF NEW.status = 'completed' AND NEW.completed_at IS NULL THEN
        NEW.completed_at := CURRENT_TIMESTAMP;
        NEW.archived_at := NULL;
    ELSIF NEW.status = 'archived' AND NEW.archived_at IS NULL THEN
        NEW.archived_at := CURRENT_TIMESTAMP;
    ELSIF NEW.status NOT IN ('completed', 'archived') THEN
        IF TG_OP = 'UPDATE' AND OLD.status IN ('completed', 'archived') THEN
            NEW.reopened_at := CURRENT_TIMESTAMP;
        END IF;
        NEW.completed_at := NULL;
        NEW.archived_at := NULL;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF NEW.company_id <> OLD.company_id
            OR NEW.customer_id <> OLD.customer_id
            OR NEW.project_number <> OLD.project_number THEN
            RAISE EXCEPTION 'Firma, Kunde und Projektnummer sind unveränderlich.';
        END IF;

        NEW.updated_at := CURRENT_TIMESTAMP;
        NEW.row_version := OLD.row_version + 1;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS projects_before_write_trigger ON projects;
CREATE TRIGGER projects_before_write_trigger
    BEFORE INSERT OR UPDATE ON projects
    FOR EACH ROW
    EXECUTE FUNCTION projects_before_write();

CREATE OR REPLACE FUNCTION projects_prevent_hard_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF CURRENT_SETTING('app.allow_hard_delete', TRUE) = 'on' THEN
        RETURN OLD;
    END IF;

    RAISE EXCEPTION
        'Projekte dürfen nicht hart gelöscht werden. Status stattdessen auf archived setzen.';
END;
$$;

DROP TRIGGER IF EXISTS projects_prevent_hard_delete_trigger ON projects;
CREATE TRIGGER projects_prevent_hard_delete_trigger
    BEFORE DELETE ON projects
    FOR EACH ROW
    EXECUTE FUNCTION projects_prevent_hard_delete();

CREATE OR REPLACE FUNCTION project_locations_validate_customer()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    project_customer_id UUID;
    location_customer_id UUID;
BEGIN
    SELECT customer_id INTO project_customer_id
    FROM projects
    WHERE company_id = NEW.company_id
      AND id = NEW.project_id;

    SELECT customer_id INTO location_customer_id
    FROM customer_locations
    WHERE company_id = NEW.company_id
      AND id = NEW.customer_location_id;

    IF project_customer_id IS NULL OR location_customer_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF project_customer_id IS DISTINCT FROM location_customer_id THEN
        RAISE EXCEPTION
            'Projekt und Kundenstandort müssen zum selben Kunden gehören.';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS project_locations_validate_customer_trigger ON project_locations;
CREATE TRIGGER project_locations_validate_customer_trigger
    BEFORE INSERT OR UPDATE OF company_id, project_id, customer_location_id
    ON project_locations
    FOR EACH ROW
    EXECUTE FUNCTION project_locations_validate_customer();

CREATE OR REPLACE FUNCTION project_links_prevent_hard_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF CURRENT_SETTING('app.allow_hard_delete', TRUE) = 'on' THEN
        RETURN OLD;
    END IF;

    RAISE EXCEPTION
        'Projektzuordnungen dürfen nicht gelöscht werden. Zuordnung stattdessen historisch beenden.';
END;
$$;

DROP TRIGGER IF EXISTS project_locations_prevent_hard_delete_trigger ON project_locations;
CREATE TRIGGER project_locations_prevent_hard_delete_trigger
    BEFORE DELETE ON project_locations
    FOR EACH ROW
    EXECUTE FUNCTION project_links_prevent_hard_delete();

DROP TRIGGER IF EXISTS project_responsibles_prevent_hard_delete_trigger ON project_responsibles;
CREATE TRIGGER project_responsibles_prevent_hard_delete_trigger
    BEFORE DELETE ON project_responsibles
    FOR EACH ROW
    EXECUTE FUNCTION project_links_prevent_hard_delete();

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_responsibles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS projects_tenant_isolation ON projects;
CREATE POLICY projects_tenant_isolation ON projects
    USING (company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID)
    WITH CHECK (company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID);

DROP POLICY IF EXISTS project_locations_tenant_isolation ON project_locations;
CREATE POLICY project_locations_tenant_isolation ON project_locations
    USING (company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID)
    WITH CHECK (company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID);

DROP POLICY IF EXISTS project_responsibles_tenant_isolation ON project_responsibles;
CREATE POLICY project_responsibles_tenant_isolation ON project_responsibles
    USING (company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID)
    WITH CHECK (company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID);

GRANT SELECT, INSERT, UPDATE ON projects, project_locations, project_responsibles TO schaefchen_api;
ALTER TABLE projects FORCE ROW LEVEL SECURITY;
ALTER TABLE project_locations FORCE ROW LEVEL SECURITY;
ALTER TABLE project_responsibles FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE projects IS 'Projekte eines Kunden mit Nummernkreis, Status, Priorität und Büro-Budget.';
COMMENT ON COLUMN projects.project_number IS 'Automatische Jahresnummer im Format SE-2026-0001.';
COMMENT ON COLUMN projects.installer_short_text IS 'Kurze, für Monteure freigegebene Einsatzinformation.';
COMMENT ON COLUMN projects.budget_amount IS 'Ausschließlich über die API für Büro und Admin sichtbar.';
COMMENT ON TABLE project_locations IS 'Historisierte Zuordnung mehrerer Kundenstandorte zu einem Projekt.';
COMMENT ON TABLE project_responsibles IS 'Historisierte Mehrfachverantwortung eines Projekts.';

COMMIT;
