BEGIN;

CREATE TABLE IF NOT EXISTS customer_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    customer_id UUID NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    function_title VARCHAR(120),
    responsibilities TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
    phone VARCHAR(50),
    mobile VARCHAR(50),
    email VARCHAR(254),
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deactivated_at TIMESTAMPTZ,
    row_version BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT customer_contacts_company_id_fkey
        FOREIGN KEY (company_id)
        REFERENCES companies (id)
        ON DELETE RESTRICT,
    CONSTRAINT customer_contacts_customer_fkey
        FOREIGN KEY (company_id, customer_id)
        REFERENCES customers (company_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT customer_contacts_company_id_id_key UNIQUE (company_id, id),
    CONSTRAINT customer_contacts_first_name_not_blank
        CHECK (BTRIM(first_name) <> ''),
    CONSTRAINT customer_contacts_last_name_not_blank
        CHECK (BTRIM(last_name) <> ''),
    CONSTRAINT customer_contacts_responsibilities_check CHECK (
        responsibilities <@ ARRAY[
            'technical',
            'purchasing',
            'billing',
            'site_management',
            'other'
        ]::TEXT[]
    ),
    CONSTRAINT customer_contacts_contact_channel_check CHECK (
        phone IS NOT NULL OR mobile IS NOT NULL OR email IS NOT NULL
    ),
    CONSTRAINT customer_contacts_status_check
        CHECK (status IN ('active', 'inactive')),
    CONSTRAINT customer_contacts_deactivation_check CHECK (
        (status = 'active' AND deactivated_at IS NULL)
        OR
        (status = 'inactive' AND deactivated_at IS NOT NULL)
    ),
    CONSTRAINT customer_contacts_primary_active_check CHECK (
        NOT is_primary OR status = 'active'
    )
);

CREATE INDEX IF NOT EXISTS customer_contacts_customer_status_idx
    ON customer_contacts (company_id, customer_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS customer_contacts_primary_key
    ON customer_contacts (company_id, customer_id)
    WHERE is_primary AND status = 'active';

CREATE OR REPLACE FUNCTION customer_contacts_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.first_name := BTRIM(NEW.first_name);
    NEW.last_name := BTRIM(NEW.last_name);
    NEW.function_title := NULLIF(BTRIM(NEW.function_title), '');
    NEW.phone := NULLIF(BTRIM(NEW.phone), '');
    NEW.mobile := NULLIF(BTRIM(NEW.mobile), '');
    NEW.email := NULLIF(BTRIM(NEW.email), '');
    NEW.responsibilities := ARRAY(
        SELECT DISTINCT LOWER(BTRIM(value))
        FROM UNNEST(NEW.responsibilities) AS value
        WHERE BTRIM(value) <> ''
        ORDER BY LOWER(BTRIM(value))
    );

    IF NEW.status = 'inactive' AND NEW.deactivated_at IS NULL THEN
        NEW.deactivated_at := CURRENT_TIMESTAMP;
        NEW.is_primary := FALSE;
    ELSIF NEW.status = 'active' THEN
        NEW.deactivated_at := NULL;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF NEW.company_id <> OLD.company_id OR NEW.customer_id <> OLD.customer_id THEN
            RAISE EXCEPTION 'Firma und Kunde eines Ansprechpartners sind unveränderlich.';
        END IF;

        NEW.updated_at := CURRENT_TIMESTAMP;
        NEW.row_version := OLD.row_version + 1;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS customer_contacts_before_write_trigger ON customer_contacts;
CREATE TRIGGER customer_contacts_before_write_trigger
    BEFORE INSERT OR UPDATE ON customer_contacts
    FOR EACH ROW
    EXECUTE FUNCTION customer_contacts_before_write();

CREATE OR REPLACE FUNCTION customer_contacts_prevent_hard_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF CURRENT_SETTING('app.allow_hard_delete', TRUE) = 'on' THEN
        RETURN OLD;
    END IF;

    RAISE EXCEPTION
        'Ansprechpartner dürfen nicht hart gelöscht werden. Status stattdessen auf inactive setzen.';
END;
$$;

DROP TRIGGER IF EXISTS customer_contacts_prevent_hard_delete_trigger ON customer_contacts;
CREATE TRIGGER customer_contacts_prevent_hard_delete_trigger
    BEFORE DELETE ON customer_contacts
    FOR EACH ROW
    EXECUTE FUNCTION customer_contacts_prevent_hard_delete();

ALTER TABLE customer_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_contacts_tenant_isolation ON customer_contacts;
CREATE POLICY customer_contacts_tenant_isolation
    ON customer_contacts
    USING (
        company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID
    )
    WITH CHECK (
        company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID
    );

GRANT SELECT, INSERT, UPDATE ON customer_contacts TO schaefchen_api;
ALTER TABLE customer_contacts NO FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE customer_contacts IS 'Ansprechpartner eines Kunden mit festen Zuständigkeitsbereichen.';
COMMENT ON COLUMN customer_contacts.responsibilities IS 'Technik, Einkauf, Rechnung, Bauleitung oder Sonstiges.';
COMMENT ON COLUMN customer_contacts.is_primary IS 'Pro aktivem Kunden höchstens ein Hauptkontakt.';

COMMIT;
