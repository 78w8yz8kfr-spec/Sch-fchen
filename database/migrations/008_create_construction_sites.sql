BEGIN;

CREATE TABLE IF NOT EXISTS construction_sites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    project_id UUID NOT NULL,
    customer_location_id UUID,
    site_number VARCHAR(24) NOT NULL,
    name VARCHAR(200) NOT NULL,
    area_label VARCHAR(120),
    installer_short_text VARCHAR(300),
    status VARCHAR(20) NOT NULL DEFAULT 'planned',
    priority VARCHAR(20) NOT NULL DEFAULT 'normal',
    latitude NUMERIC(9, 6),
    longitude NUMERIC(9, 6),
    qr_code VARCHAR(120),
    access_notes TEXT,
    pinboard_notes TEXT,
    planned_start_date DATE,
    planned_end_date DATE,
    actual_start_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    archived_at TIMESTAMPTZ,
    row_version BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT construction_sites_company_id_fkey
        FOREIGN KEY (company_id)
        REFERENCES companies (id)
        ON DELETE RESTRICT,
    CONSTRAINT construction_sites_project_fkey
        FOREIGN KEY (company_id, project_id)
        REFERENCES projects (company_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT construction_sites_location_fkey
        FOREIGN KEY (company_id, customer_location_id)
        REFERENCES customer_locations (company_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT construction_sites_company_id_id_key UNIQUE (company_id, id),
    CONSTRAINT construction_sites_company_number_key UNIQUE (company_id, site_number),
    CONSTRAINT construction_sites_number_check
        CHECK (site_number ~ '^SE-B-[0-9]{4}-[0-9]{4}$'),
    CONSTRAINT construction_sites_name_not_blank CHECK (BTRIM(name) <> ''),
    CONSTRAINT construction_sites_area_label_check CHECK (
        area_label IS NULL OR BTRIM(area_label) <> ''
    ),
    CONSTRAINT construction_sites_status_check CHECK (
        status IN ('planned', 'active', 'on_hold', 'delayed', 'completed', 'cancelled', 'archived')
    ),
    CONSTRAINT construction_sites_priority_check
        CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    CONSTRAINT construction_sites_latitude_check
        CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
    CONSTRAINT construction_sites_longitude_check
        CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
    CONSTRAINT construction_sites_coordinates_check CHECK (
        (latitude IS NULL AND longitude IS NULL)
        OR
        (latitude IS NOT NULL AND longitude IS NOT NULL)
    ),
    CONSTRAINT construction_sites_dates_check CHECK (
        planned_end_date IS NULL
        OR planned_start_date IS NULL
        OR planned_end_date >= planned_start_date
    ),
    CONSTRAINT construction_sites_status_timestamps_check CHECK (
        (status = 'completed' AND completed_at IS NOT NULL AND cancelled_at IS NULL AND archived_at IS NULL)
        OR
        (status = 'cancelled' AND cancelled_at IS NOT NULL AND completed_at IS NULL AND archived_at IS NULL)
        OR
        (status = 'archived' AND archived_at IS NOT NULL)
        OR
        (
            status NOT IN ('completed', 'cancelled', 'archived')
            AND completed_at IS NULL
            AND cancelled_at IS NULL
            AND archived_at IS NULL
        )
    )
);

CREATE INDEX IF NOT EXISTS construction_sites_project_status_idx
    ON construction_sites (company_id, project_id, status);

CREATE INDEX IF NOT EXISTS construction_sites_location_idx
    ON construction_sites (company_id, customer_location_id)
    WHERE customer_location_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS construction_sites_company_qr_code_key
    ON construction_sites (company_id, qr_code)
    WHERE qr_code IS NOT NULL;

CREATE OR REPLACE FUNCTION next_construction_site_number(
    target_company_id UUID,
    target_year INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER
)
RETURNS VARCHAR(24)
LANGUAGE plpgsql
AS $$
DECLARE
    next_number INTEGER;
BEGIN
    PERFORM pg_advisory_xact_lock(
        hashtextextended(
            'construction_sites:' || target_company_id::TEXT || ':' || target_year::TEXT,
            0
        )
    );

    SELECT COALESCE(MAX(RIGHT(site_number, 4)::INTEGER), 0) + 1
    INTO next_number
    FROM construction_sites
    WHERE company_id = target_company_id
      AND site_number LIKE 'SE-B-' || target_year::TEXT || '-%';

    IF next_number > 9999 THEN
        RAISE EXCEPTION 'Baustellennummernkreis % für Firma % ist ausgeschöpft', target_year, target_company_id;
    END IF;

    RETURN 'SE-B-' || target_year::TEXT || '-' || LPAD(next_number::TEXT, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION construction_sites_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NULLIF(BTRIM(NEW.site_number), '') IS NULL THEN
        NEW.site_number := next_construction_site_number(NEW.company_id);
    END IF;

    NEW.site_number := UPPER(BTRIM(NEW.site_number));
    NEW.name := BTRIM(NEW.name);
    NEW.area_label := NULLIF(BTRIM(NEW.area_label), '');
    NEW.installer_short_text := NULLIF(BTRIM(NEW.installer_short_text), '');
    NEW.qr_code := NULLIF(BTRIM(NEW.qr_code), '');
    NEW.access_notes := NULLIF(BTRIM(NEW.access_notes), '');
    NEW.pinboard_notes := NULLIF(BTRIM(NEW.pinboard_notes), '');

    IF NEW.status = 'active' AND NEW.actual_start_at IS NULL THEN
        NEW.actual_start_at := CURRENT_TIMESTAMP;
    END IF;

    IF NEW.status = 'completed' AND NEW.completed_at IS NULL THEN
        NEW.completed_at := CURRENT_TIMESTAMP;
        NEW.cancelled_at := NULL;
        NEW.archived_at := NULL;
    ELSIF NEW.status = 'cancelled' AND NEW.cancelled_at IS NULL THEN
        NEW.cancelled_at := CURRENT_TIMESTAMP;
        NEW.completed_at := NULL;
        NEW.archived_at := NULL;
    ELSIF NEW.status = 'archived' AND NEW.archived_at IS NULL THEN
        NEW.archived_at := CURRENT_TIMESTAMP;
    ELSIF NEW.status NOT IN ('completed', 'cancelled', 'archived') THEN
        NEW.completed_at := NULL;
        NEW.cancelled_at := NULL;
        NEW.archived_at := NULL;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF NEW.company_id <> OLD.company_id
            OR NEW.project_id <> OLD.project_id
            OR NEW.site_number <> OLD.site_number THEN
            RAISE EXCEPTION 'Firma, Projekt und Baustellennummer sind unveränderlich.';
        END IF;

        NEW.updated_at := CURRENT_TIMESTAMP;
        NEW.row_version := OLD.row_version + 1;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS construction_sites_before_write_trigger ON construction_sites;
CREATE TRIGGER construction_sites_before_write_trigger
    BEFORE INSERT OR UPDATE ON construction_sites
    FOR EACH ROW
    EXECUTE FUNCTION construction_sites_before_write();

CREATE OR REPLACE FUNCTION construction_sites_validate_location_customer()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    project_customer_id UUID;
    location_customer_id UUID;
BEGIN
    IF NEW.customer_location_id IS NULL THEN
        RETURN NEW;
    END IF;

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
            'Baustellenstandort und Projekt müssen zum selben Kunden gehören.';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS construction_sites_validate_location_customer_trigger ON construction_sites;
CREATE TRIGGER construction_sites_validate_location_customer_trigger
    BEFORE INSERT OR UPDATE OF company_id, project_id, customer_location_id
    ON construction_sites
    FOR EACH ROW
    EXECUTE FUNCTION construction_sites_validate_location_customer();

CREATE OR REPLACE FUNCTION construction_sites_prevent_hard_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF CURRENT_SETTING('app.allow_hard_delete', TRUE) = 'on' THEN
        RETURN OLD;
    END IF;

    RAISE EXCEPTION
        'Baustellen dürfen nicht hart gelöscht werden. Status stattdessen auf archived setzen.';
END;
$$;

DROP TRIGGER IF EXISTS construction_sites_prevent_hard_delete_trigger ON construction_sites;
CREATE TRIGGER construction_sites_prevent_hard_delete_trigger
    BEFORE DELETE ON construction_sites
    FOR EACH ROW
    EXECUTE FUNCTION construction_sites_prevent_hard_delete();

ALTER TABLE construction_sites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS construction_sites_tenant_isolation ON construction_sites;
CREATE POLICY construction_sites_tenant_isolation
    ON construction_sites
    USING (
        company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID
    )
    WITH CHECK (
        company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID
    );

GRANT SELECT, INSERT, UPDATE ON construction_sites TO schaefchen_api;
ALTER TABLE construction_sites NO FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE construction_sites IS 'Beliebig viele Baustellen eines Projekts mit flachen optionalen Bereichen.';
COMMENT ON COLUMN construction_sites.site_number IS 'Automatische Jahresnummer im Format SE-B-2026-0001.';
COMMENT ON COLUMN construction_sites.area_label IS 'Optionaler einfacher Bereich; keine tiefe Baumstruktur.';
COMMENT ON COLUMN construction_sites.qr_code IS 'Stabiler QR-Inhalt zum späteren Öffnen der Baustelle.';
COMMENT ON COLUMN construction_sites.pinboard_notes IS 'Einfache Baustellen-Pinnwand für freigegebene Hinweise.';

COMMIT;
