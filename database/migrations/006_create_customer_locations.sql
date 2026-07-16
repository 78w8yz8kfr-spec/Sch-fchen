BEGIN;

CREATE TABLE IF NOT EXISTS customer_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    customer_id UUID NOT NULL,
    location_number VARCHAR(20) NOT NULL,
    name VARCHAR(150) NOT NULL,
    location_type VARCHAR(30) NOT NULL DEFAULT 'other',
    street VARCHAR(150) NOT NULL,
    house_number VARCHAR(20) NOT NULL,
    postal_code VARCHAR(12) NOT NULL,
    city VARCHAR(100) NOT NULL,
    country_code CHAR(2) NOT NULL DEFAULT 'DE',
    latitude NUMERIC(9, 6),
    longitude NUMERIC(9, 6),
    geocoded_at TIMESTAMPTZ,
    opening_hours JSONB NOT NULL DEFAULT '{}'::JSONB,
    parking_notes TEXT,
    access_notes TEXT,
    phone VARCHAR(50),
    email VARCHAR(254),
    is_billing_location BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    archived_at TIMESTAMPTZ,
    row_version BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT customer_locations_company_id_fkey
        FOREIGN KEY (company_id)
        REFERENCES companies (id)
        ON DELETE RESTRICT,
    CONSTRAINT customer_locations_customer_fkey
        FOREIGN KEY (company_id, customer_id)
        REFERENCES customers (company_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT customer_locations_company_id_id_key UNIQUE (company_id, id),
    CONSTRAINT customer_locations_company_number_key
        UNIQUE (company_id, location_number),
    CONSTRAINT customer_locations_number_check
        CHECK (location_number ~ '^SE-S-[0-9]{5}$'),
    CONSTRAINT customer_locations_name_not_blank CHECK (BTRIM(name) <> ''),
    CONSTRAINT customer_locations_type_check CHECK (
        location_type IN (
            'office',
            'residential',
            'commercial',
            'warehouse',
            'construction',
            'billing',
            'other'
        )
    ),
    CONSTRAINT customer_locations_address_check CHECK (
        BTRIM(street) <> ''
        AND BTRIM(house_number) <> ''
        AND BTRIM(postal_code) <> ''
        AND BTRIM(city) <> ''
    ),
    CONSTRAINT customer_locations_country_code_check
        CHECK (country_code ~ '^[A-Z]{2}$'),
    CONSTRAINT customer_locations_latitude_check
        CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
    CONSTRAINT customer_locations_longitude_check
        CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
    CONSTRAINT customer_locations_geocoding_check CHECK (
        (latitude IS NULL AND longitude IS NULL AND geocoded_at IS NULL)
        OR
        (latitude IS NOT NULL AND longitude IS NOT NULL AND geocoded_at IS NOT NULL)
    ),
    CONSTRAINT customer_locations_opening_hours_object_check
        CHECK (jsonb_typeof(opening_hours) = 'object'),
    CONSTRAINT customer_locations_status_check
        CHECK (status IN ('active', 'archived')),
    CONSTRAINT customer_locations_archive_check CHECK (
        (status = 'active' AND archived_at IS NULL)
        OR
        (status = 'archived' AND archived_at IS NOT NULL)
    ),
    CONSTRAINT customer_locations_billing_active_check CHECK (
        NOT is_billing_location OR status = 'active'
    )
);

CREATE INDEX IF NOT EXISTS customer_locations_customer_status_idx
    ON customer_locations (company_id, customer_id, status);

CREATE INDEX IF NOT EXISTS customer_locations_company_city_idx
    ON customer_locations (company_id, LOWER(city), LOWER(street));

CREATE UNIQUE INDEX IF NOT EXISTS customer_locations_billing_key
    ON customer_locations (company_id, customer_id)
    WHERE is_billing_location AND status = 'active';

CREATE OR REPLACE FUNCTION next_customer_location_number(target_company_id UUID)
RETURNS VARCHAR(20)
LANGUAGE plpgsql
AS $$
DECLARE
    next_number INTEGER;
BEGIN
    PERFORM pg_advisory_xact_lock(
        hashtextextended('customer_locations:' || target_company_id::TEXT, 0)
    );

    SELECT COALESCE(MAX(SUBSTRING(location_number FROM 6)::INTEGER), 0) + 1
    INTO next_number
    FROM customer_locations
    WHERE company_id = target_company_id;

    IF next_number > 99999 THEN
        RAISE EXCEPTION 'Standortnummernkreis für Firma % ist ausgeschöpft', target_company_id;
    END IF;

    RETURN 'SE-S-' || LPAD(next_number::TEXT, 5, '0');
END;
$$;

CREATE OR REPLACE FUNCTION customer_locations_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NULLIF(BTRIM(NEW.location_number), '') IS NULL THEN
        NEW.location_number := next_customer_location_number(NEW.company_id);
    END IF;

    NEW.location_number := UPPER(BTRIM(NEW.location_number));
    NEW.name := BTRIM(NEW.name);
    NEW.street := BTRIM(NEW.street);
    NEW.house_number := BTRIM(NEW.house_number);
    NEW.postal_code := BTRIM(NEW.postal_code);
    NEW.city := BTRIM(NEW.city);
    NEW.country_code := UPPER(BTRIM(NEW.country_code));
    NEW.parking_notes := NULLIF(BTRIM(NEW.parking_notes), '');
    NEW.access_notes := NULLIF(BTRIM(NEW.access_notes), '');
    NEW.phone := NULLIF(BTRIM(NEW.phone), '');
    NEW.email := NULLIF(BTRIM(NEW.email), '');

    IF NEW.status = 'archived' AND NEW.archived_at IS NULL THEN
        NEW.archived_at := CURRENT_TIMESTAMP;
        NEW.is_billing_location := FALSE;
    ELSIF NEW.status = 'active' THEN
        NEW.archived_at := NULL;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF NEW.company_id <> OLD.company_id
            OR NEW.customer_id <> OLD.customer_id
            OR NEW.location_number <> OLD.location_number THEN
            RAISE EXCEPTION 'Firma, Kunde und Standortnummer sind unveränderlich.';
        END IF;

        NEW.updated_at := CURRENT_TIMESTAMP;
        NEW.row_version := OLD.row_version + 1;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS customer_locations_before_write_trigger ON customer_locations;
CREATE TRIGGER customer_locations_before_write_trigger
    BEFORE INSERT OR UPDATE ON customer_locations
    FOR EACH ROW
    EXECUTE FUNCTION customer_locations_before_write();

CREATE OR REPLACE FUNCTION customer_locations_prevent_hard_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF CURRENT_SETTING('app.allow_hard_delete', TRUE) = 'on' THEN
        RETURN OLD;
    END IF;

    RAISE EXCEPTION
        'Kundenstandorte dürfen nicht hart gelöscht werden. Status stattdessen auf archived setzen.';
END;
$$;

DROP TRIGGER IF EXISTS customer_locations_prevent_hard_delete_trigger ON customer_locations;
CREATE TRIGGER customer_locations_prevent_hard_delete_trigger
    BEFORE DELETE ON customer_locations
    FOR EACH ROW
    EXECUTE FUNCTION customer_locations_prevent_hard_delete();

ALTER TABLE customer_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_locations_tenant_isolation ON customer_locations;
CREATE POLICY customer_locations_tenant_isolation
    ON customer_locations
    USING (
        company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID
    )
    WITH CHECK (
        company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID
    );

GRANT SELECT, INSERT, UPDATE ON customer_locations TO schaefchen_api;
ALTER TABLE customer_locations FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE customer_locations IS 'Adressierte Kundenstandorte mit Zugangshinweisen und optionalem Geocoding.';
COMMENT ON COLUMN customer_locations.location_number IS 'Automatische Standortnummer im Format SE-S-00001.';
COMMENT ON COLUMN customer_locations.opening_hours IS 'Strukturierte Öffnungszeiten ohne vorzeitige starre Fachlogik.';
COMMENT ON COLUMN customer_locations.is_billing_location IS 'Aktiver abweichender Rechnungsstandort des Kunden.';

COMMIT;
