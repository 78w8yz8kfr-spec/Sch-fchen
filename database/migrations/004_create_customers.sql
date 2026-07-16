BEGIN;

CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    customer_number VARCHAR(20) NOT NULL,
    customer_type VARCHAR(20) NOT NULL,
    company_name VARCHAR(200),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    debtor_number VARCHAR(50),
    vat_id VARCHAR(32),
    email VARCHAR(254),
    phone VARCHAR(50),
    billing_street VARCHAR(150),
    billing_house_number VARCHAR(20),
    billing_postal_code VARCHAR(12),
    billing_city VARCHAR(100),
    billing_country_code CHAR(2) NOT NULL DEFAULT 'DE',
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    merged_into_customer_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    archived_at TIMESTAMPTZ,
    row_version BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT customers_company_id_fkey
        FOREIGN KEY (company_id)
        REFERENCES companies (id)
        ON DELETE RESTRICT,
    CONSTRAINT customers_company_id_id_key UNIQUE (company_id, id),
    CONSTRAINT customers_company_number_key
        UNIQUE (company_id, customer_number),
    CONSTRAINT customers_merged_into_fkey
        FOREIGN KEY (company_id, merged_into_customer_id)
        REFERENCES customers (company_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT customers_number_check
        CHECK (customer_number ~ '^SE-K-[0-9]{5}$'),
    CONSTRAINT customers_type_check
        CHECK (customer_type IN ('private', 'company')),
    CONSTRAINT customers_name_check CHECK (
        (
            customer_type = 'company'
            AND company_name IS NOT NULL
            AND BTRIM(company_name) <> ''
        )
        OR
        (
            customer_type = 'private'
            AND first_name IS NOT NULL
            AND BTRIM(first_name) <> ''
            AND last_name IS NOT NULL
            AND BTRIM(last_name) <> ''
        )
    ),
    CONSTRAINT customers_vat_id_check CHECK (
        vat_id IS NULL OR customer_type = 'company'
    ),
    CONSTRAINT customers_status_check
        CHECK (status IN ('active', 'archived', 'merged')),
    CONSTRAINT customers_archive_check CHECK (
        (status = 'active' AND archived_at IS NULL AND merged_into_customer_id IS NULL)
        OR
        (status = 'archived' AND archived_at IS NOT NULL AND merged_into_customer_id IS NULL)
        OR
        (status = 'merged' AND archived_at IS NOT NULL AND merged_into_customer_id IS NOT NULL)
    ),
    CONSTRAINT customers_not_merged_into_self_check CHECK (
        merged_into_customer_id IS NULL OR merged_into_customer_id <> id
    ),
    CONSTRAINT customers_country_code_check
        CHECK (billing_country_code ~ '^[A-Z]{2}$')
);

CREATE INDEX IF NOT EXISTS customers_company_status_idx
    ON customers (company_id, status);

CREATE INDEX IF NOT EXISTS customers_company_name_idx
    ON customers (
        company_id,
        LOWER(COALESCE(company_name, last_name, '')),
        LOWER(COALESCE(first_name, ''))
    );

CREATE UNIQUE INDEX IF NOT EXISTS customers_company_debtor_number_key
    ON customers (company_id, debtor_number)
    WHERE debtor_number IS NOT NULL;

CREATE OR REPLACE FUNCTION next_customer_number(target_company_id UUID)
RETURNS VARCHAR(20)
LANGUAGE plpgsql
AS $$
DECLARE
    next_number INTEGER;
BEGIN
    PERFORM pg_advisory_xact_lock(
        hashtextextended('customers:' || target_company_id::TEXT, 0)
    );

    SELECT COALESCE(MAX(SUBSTRING(customer_number FROM 6)::INTEGER), 0) + 1
    INTO next_number
    FROM customers
    WHERE company_id = target_company_id;

    IF next_number > 99999 THEN
        RAISE EXCEPTION 'Kundennummernkreis für Firma % ist ausgeschöpft', target_company_id;
    END IF;

    RETURN 'SE-K-' || LPAD(next_number::TEXT, 5, '0');
END;
$$;

CREATE OR REPLACE FUNCTION customers_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NULLIF(BTRIM(NEW.customer_number), '') IS NULL THEN
        NEW.customer_number := next_customer_number(NEW.company_id);
    END IF;

    NEW.customer_number := UPPER(BTRIM(NEW.customer_number));
    NEW.company_name := NULLIF(BTRIM(NEW.company_name), '');
    NEW.first_name := NULLIF(BTRIM(NEW.first_name), '');
    NEW.last_name := NULLIF(BTRIM(NEW.last_name), '');
    NEW.debtor_number := NULLIF(BTRIM(NEW.debtor_number), '');
    NEW.vat_id := NULLIF(UPPER(BTRIM(NEW.vat_id)), '');
    NEW.email := NULLIF(BTRIM(NEW.email), '');
    NEW.phone := NULLIF(BTRIM(NEW.phone), '');

    IF NEW.status IN ('archived', 'merged') AND NEW.archived_at IS NULL THEN
        NEW.archived_at := CURRENT_TIMESTAMP;
    ELSIF NEW.status = 'active' THEN
        NEW.archived_at := NULL;
        NEW.merged_into_customer_id := NULL;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF NEW.company_id <> OLD.company_id OR NEW.customer_number <> OLD.customer_number THEN
            RAISE EXCEPTION 'Firma und Kundennummer eines Kunden sind unveränderlich.';
        END IF;

        NEW.updated_at := CURRENT_TIMESTAMP;
        NEW.row_version := OLD.row_version + 1;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS customers_before_write_trigger ON customers;
CREATE TRIGGER customers_before_write_trigger
    BEFORE INSERT OR UPDATE ON customers
    FOR EACH ROW
    EXECUTE FUNCTION customers_before_write();

CREATE OR REPLACE FUNCTION customers_prevent_hard_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF CURRENT_SETTING('app.allow_hard_delete', TRUE) = 'on' THEN
        RETURN OLD;
    END IF;

    RAISE EXCEPTION
        'Kunden dürfen nicht hart gelöscht werden. Archivieren oder zusammenführen verwenden.';
END;
$$;

DROP TRIGGER IF EXISTS customers_prevent_hard_delete_trigger ON customers;
CREATE TRIGGER customers_prevent_hard_delete_trigger
    BEFORE DELETE ON customers
    FOR EACH ROW
    EXECUTE FUNCTION customers_prevent_hard_delete();

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customers_tenant_isolation ON customers;
CREATE POLICY customers_tenant_isolation
    ON customers
    USING (
        company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID
    )
    WITH CHECK (
        company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID
    );

GRANT SELECT, INSERT, UPDATE ON customers TO schaefchen_api;
ALTER TABLE customers FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE customers IS 'Mandantenspezifischer Kundenstamm mit Historie und Dubletten-Zusammenführung.';
COMMENT ON COLUMN customers.customer_number IS 'Automatische Kundennummer im Format SE-K-00001.';
COMMENT ON COLUMN customers.debtor_number IS 'Optional manuell gepflegte Debitorennummer.';
COMMENT ON COLUMN customers.merged_into_customer_id IS 'Zielkunde bei historisch nachvollziehbarer Dubletten-Zusammenführung.';

COMMIT;
