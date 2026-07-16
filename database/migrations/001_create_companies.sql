BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SEQUENCE IF NOT EXISTS companies_number_seq
    AS BIGINT
    START WITH 1
    INCREMENT BY 1
    MINVALUE 1
    NO MAXVALUE
    CACHE 1;

CREATE TABLE IF NOT EXISTS companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_number VARCHAR(20) NOT NULL DEFAULT (
        'F-' || LPAD(nextval('companies_number_seq')::TEXT, 6, '0')
    ),
    legal_name VARCHAR(200) NOT NULL,
    display_name VARCHAR(120) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    logo_object_key TEXT,
    street VARCHAR(150),
    house_number VARCHAR(20),
    postal_code VARCHAR(12),
    city VARCHAR(100),
    country_code CHAR(2) NOT NULL DEFAULT 'DE',
    phone VARCHAR(50),
    email VARCHAR(254),
    website TEXT,
    tax_number VARCHAR(50),
    vat_id VARCHAR(32),
    license_plan VARCHAR(50) NOT NULL DEFAULT 'standard',
    license_seats INTEGER,
    license_valid_until DATE,
    settings JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deactivated_at TIMESTAMPTZ,
    row_version BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT companies_company_number_key UNIQUE (company_number),
    CONSTRAINT companies_legal_name_not_blank CHECK (BTRIM(legal_name) <> ''),
    CONSTRAINT companies_display_name_not_blank CHECK (BTRIM(display_name) <> ''),
    CONSTRAINT companies_status_check CHECK (status IN ('active', 'inactive')),
    CONSTRAINT companies_country_code_check CHECK (country_code ~ '^[A-Z]{2}$'),
    CONSTRAINT companies_license_seats_check CHECK (
        license_seats IS NULL OR license_seats >= 1
    ),
    CONSTRAINT companies_settings_object_check CHECK (jsonb_typeof(settings) = 'object'),
    CONSTRAINT companies_deactivation_check CHECK (
        (status = 'active' AND deactivated_at IS NULL)
        OR
        (status = 'inactive' AND deactivated_at IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS companies_status_idx
    ON companies (status);

CREATE INDEX IF NOT EXISTS companies_legal_name_lower_idx
    ON companies (LOWER(legal_name));

CREATE OR REPLACE FUNCTION companies_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
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

DROP TRIGGER IF EXISTS companies_before_write_trigger ON companies;
CREATE TRIGGER companies_before_write_trigger
    BEFORE INSERT OR UPDATE ON companies
    FOR EACH ROW
    EXECUTE FUNCTION companies_before_write();

CREATE OR REPLACE FUNCTION companies_prevent_hard_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF CURRENT_SETTING('app.allow_hard_delete', TRUE) = 'on' THEN
        RETURN OLD;
    END IF;

    RAISE EXCEPTION
        'Firmen dürfen nicht hart gelöscht werden. Status stattdessen auf inactive setzen.';
END;
$$;

DROP TRIGGER IF EXISTS companies_prevent_hard_delete_trigger ON companies;
CREATE TRIGGER companies_prevent_hard_delete_trigger
    BEFORE DELETE ON companies
    FOR EACH ROW
    EXECUTE FUNCTION companies_prevent_hard_delete();

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS companies_tenant_isolation ON companies;
CREATE POLICY companies_tenant_isolation
    ON companies
    USING (
        id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID
    )
    WITH CHECK (
        id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID
    );

COMMENT ON TABLE companies IS 'Firma und Wurzel eines SaaS-Mandanten.';
COMMENT ON COLUMN companies.company_number IS 'Automatisch erzeugte, unveränderliche Firmennummer.';
COMMENT ON COLUMN companies.logo_object_key IS 'Objektschlüssel im S3-kompatiblen Speicher; keine Binärdaten in PostgreSQL.';
COMMENT ON COLUMN companies.settings IS 'Mandantenspezifische, noch nicht eigenständig modellierte Einstellungen.';
COMMENT ON COLUMN companies.row_version IS 'Monoton steigende Version für konkurrierende Änderungen und Historisierung.';

COMMIT;
