BEGIN;

CREATE TABLE IF NOT EXISTS module_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module_key VARCHAR(60) NOT NULL UNIQUE,
    name VARCHAR(120) NOT NULL,
    description TEXT,
    category VARCHAR(40) NOT NULL DEFAULT 'business',
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    is_special BOOLEAN NOT NULL DEFAULT FALSE,
    requires_platform_approval BOOLEAN NOT NULL DEFAULT TRUE,
    dependencies JSONB NOT NULL DEFAULT '[]'::JSONB,
    default_feature_scope JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    row_version BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT module_catalog_key_check CHECK (module_key ~ '^[a-z][a-z0-9_]*$'),
    CONSTRAINT module_catalog_name_check CHECK (BTRIM(name) <> ''),
    CONSTRAINT module_catalog_category_check
        CHECK (category IN ('core', 'business', 'electrical', 'integration', 'export')),
    CONSTRAINT module_catalog_status_check CHECK (status IN ('active', 'retired')),
    CONSTRAINT module_catalog_dependencies_check CHECK (jsonb_typeof(dependencies) = 'array'),
    CONSTRAINT module_catalog_scope_check CHECK (jsonb_typeof(default_feature_scope) = 'object')
);

CREATE TABLE IF NOT EXISTS company_module_entitlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
    module_id UUID NOT NULL REFERENCES module_catalog (id) ON DELETE RESTRICT,
    entitlement_status VARCHAR(20) NOT NULL DEFAULT 'inactive',
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    included_in_plan BOOLEAN NOT NULL DEFAULT FALSE,
    separately_billed BOOLEAN NOT NULL DEFAULT FALSE,
    user_limit INTEGER,
    feature_scope JSONB NOT NULL DEFAULT '{}'::JSONB,
    changed_by_platform_user_id UUID REFERENCES platform_users (id) ON DELETE RESTRICT,
    change_reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    row_version BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT company_module_entitlements_key UNIQUE (company_id, module_id),
    CONSTRAINT company_module_entitlements_status_check CHECK (
        entitlement_status IN ('inactive', 'permanent', 'trial')
    ),
    CONSTRAINT company_module_entitlements_reason_check CHECK (BTRIM(change_reason) <> ''),
    CONSTRAINT company_module_entitlements_dates_check CHECK (
        ends_at IS NULL OR (starts_at IS NOT NULL AND ends_at > starts_at)
    ),
    CONSTRAINT company_module_entitlements_trial_check CHECK (
        entitlement_status <> 'trial' OR (starts_at IS NOT NULL AND ends_at IS NOT NULL)
    ),
    CONSTRAINT company_module_entitlements_limit_check CHECK (user_limit IS NULL OR user_limit >= 1),
    CONSTRAINT company_module_entitlements_scope_check CHECK (jsonb_typeof(feature_scope) = 'object')
);

CREATE TABLE IF NOT EXISTS company_module_entitlement_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
    entitlement_id UUID NOT NULL REFERENCES company_module_entitlements (id) ON DELETE RESTRICT,
    module_id UUID NOT NULL REFERENCES module_catalog (id) ON DELETE RESTRICT,
    row_version BIGINT NOT NULL,
    old_state JSONB,
    new_state JSONB NOT NULL,
    changed_by_platform_user_id UUID REFERENCES platform_users (id) ON DELETE RESTRICT,
    change_reason TEXT NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT company_module_history_version_key UNIQUE (entitlement_id, row_version),
    CONSTRAINT company_module_history_state_check
        CHECK (jsonb_typeof(new_state) = 'object'),
    CONSTRAINT company_module_history_old_state_check
        CHECK (old_state IS NULL OR jsonb_typeof(old_state) = 'object')
);

CREATE TABLE IF NOT EXISTS license_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_key VARCHAR(60) NOT NULL UNIQUE,
    name VARCHAR(120) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    row_version BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT license_plans_key_check CHECK (plan_key ~ '^[a-z][a-z0-9_]*$'),
    CONSTRAINT license_plans_name_check CHECK (BTRIM(name) <> ''),
    CONSTRAINT license_plans_status_check CHECK (status IN ('draft', 'active', 'retired'))
);

CREATE TABLE IF NOT EXISTS license_plan_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    license_plan_id UUID NOT NULL REFERENCES license_plans (id) ON DELETE RESTRICT,
    version_number INTEGER NOT NULL,
    monthly_price_cents INTEGER NOT NULL,
    annual_price_cents INTEGER NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'EUR',
    employee_tiers JSONB NOT NULL DEFAULT '[]'::JSONB,
    user_limit INTEGER,
    storage_limit_bytes BIGINT,
    included_modules JSONB NOT NULL DEFAULT '[]'::JSONB,
    addon_modules JSONB NOT NULL DEFAULT '[]'::JSONB,
    trial_days INTEGER NOT NULL DEFAULT 14,
    cancellation_notice_days INTEGER NOT NULL DEFAULT 30,
    minimum_term_months INTEGER NOT NULL DEFAULT 1,
    active_from TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    active_until TIMESTAMPTZ,
    created_by_platform_user_id UUID REFERENCES platform_users (id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT license_plan_versions_key UNIQUE (license_plan_id, version_number),
    CONSTRAINT license_plan_versions_prices_check
        CHECK (monthly_price_cents >= 0 AND annual_price_cents >= 0),
    CONSTRAINT license_plan_versions_limits_check CHECK (
        (user_limit IS NULL OR user_limit >= 1)
        AND (storage_limit_bytes IS NULL OR storage_limit_bytes >= 0)
        AND trial_days >= 0
        AND cancellation_notice_days >= 0
        AND minimum_term_months >= 0
    ),
    CONSTRAINT license_plan_versions_dates_check
        CHECK (active_until IS NULL OR active_until > active_from),
    CONSTRAINT license_plan_versions_json_check CHECK (
        jsonb_typeof(employee_tiers) = 'array'
        AND jsonb_typeof(included_modules) = 'array'
        AND jsonb_typeof(addon_modules) = 'array'
    )
);

CREATE TABLE IF NOT EXISTS company_contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
    license_plan_version_id UUID REFERENCES license_plan_versions (id) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL DEFAULT 'trial',
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ,
    trial_ends_at TIMESTAMPTZ,
    billing_cycle VARCHAR(20) NOT NULL DEFAULT 'monthly',
    monthly_price_cents INTEGER NOT NULL DEFAULT 0,
    annual_price_cents INTEGER NOT NULL DEFAULT 0,
    currency CHAR(3) NOT NULL DEFAULT 'EUR',
    user_limit INTEGER,
    storage_limit_bytes BIGINT,
    module_snapshot JSONB NOT NULL DEFAULT '[]'::JSONB,
    special_terms TEXT,
    discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
    goodwill_until TIMESTAMPTZ,
    cancellation_notice_days INTEGER NOT NULL DEFAULT 30,
    minimum_term_months INTEGER NOT NULL DEFAULT 1,
    changed_by_platform_user_id UUID REFERENCES platform_users (id) ON DELETE RESTRICT,
    change_reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    row_version BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT company_contracts_status_check CHECK (
        status IN ('trial', 'active', 'payment_due', 'suspended', 'cancelled', 'expired')
    ),
    CONSTRAINT company_contracts_cycle_check CHECK (billing_cycle IN ('monthly', 'annual', 'custom')),
    CONSTRAINT company_contracts_price_check
        CHECK (monthly_price_cents >= 0 AND annual_price_cents >= 0),
    CONSTRAINT company_contracts_discount_check CHECK (discount_percent BETWEEN 0 AND 100),
    CONSTRAINT company_contracts_limits_check CHECK (
        (user_limit IS NULL OR user_limit >= 1)
        AND (storage_limit_bytes IS NULL OR storage_limit_bytes >= 0)
        AND cancellation_notice_days >= 0
        AND minimum_term_months >= 0
    ),
    CONSTRAINT company_contracts_dates_check CHECK (ends_at IS NULL OR ends_at > starts_at),
    CONSTRAINT company_contracts_modules_check CHECK (jsonb_typeof(module_snapshot) = 'array'),
    CONSTRAINT company_contracts_reason_check CHECK (BTRIM(change_reason) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS company_contracts_current_idx
    ON company_contracts (company_id)
    WHERE status IN ('trial', 'active', 'payment_due', 'suspended');

CREATE TABLE IF NOT EXISTS company_contract_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
    contract_id UUID NOT NULL REFERENCES company_contracts (id) ON DELETE RESTRICT,
    row_version BIGINT NOT NULL,
    old_state JSONB,
    new_state JSONB NOT NULL,
    changed_by_platform_user_id UUID REFERENCES platform_users (id) ON DELETE RESTRICT,
    change_reason TEXT NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT company_contract_history_key UNIQUE (contract_id, row_version),
    CONSTRAINT company_contract_history_new_check CHECK (jsonb_typeof(new_state) = 'object'),
    CONSTRAINT company_contract_history_old_check
        CHECK (old_state IS NULL OR jsonb_typeof(old_state) = 'object')
);

CREATE OR REPLACE FUNCTION platform_catalog_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        NEW.updated_at := CURRENT_TIMESTAMP;
        NEW.row_version := OLD.row_version + 1;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS module_catalog_before_write_trigger ON module_catalog;
CREATE TRIGGER module_catalog_before_write_trigger
    BEFORE INSERT OR UPDATE ON module_catalog
    FOR EACH ROW EXECUTE FUNCTION platform_catalog_before_write();
DROP TRIGGER IF EXISTS license_plans_before_write_trigger ON license_plans;
CREATE TRIGGER license_plans_before_write_trigger
    BEFORE INSERT OR UPDATE ON license_plans
    FOR EACH ROW EXECUTE FUNCTION platform_catalog_before_write();

CREATE OR REPLACE FUNCTION company_module_entitlements_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.change_reason := NULLIF(BTRIM(NEW.change_reason), '');
    IF TG_OP = 'UPDATE' THEN
        IF NEW.company_id <> OLD.company_id OR NEW.module_id <> OLD.module_id THEN
            RAISE EXCEPTION 'Firma und Modul einer Freigabe sind unveränderlich.';
        END IF;
        NEW.updated_at := CURRENT_TIMESTAMP;
        NEW.row_version := OLD.row_version + 1;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION company_module_entitlements_record_history()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO company_module_entitlement_history (
        company_id, entitlement_id, module_id, row_version, old_state, new_state,
        changed_by_platform_user_id, change_reason, changed_at
    ) VALUES (
        NEW.company_id, NEW.id, NEW.module_id, NEW.row_version,
        CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
        to_jsonb(NEW), NEW.changed_by_platform_user_id, NEW.change_reason,
        NEW.updated_at
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS company_module_entitlements_before_write_trigger ON company_module_entitlements;
CREATE TRIGGER company_module_entitlements_before_write_trigger
    BEFORE INSERT OR UPDATE ON company_module_entitlements
    FOR EACH ROW EXECUTE FUNCTION company_module_entitlements_before_write();
DROP TRIGGER IF EXISTS company_module_entitlements_history_trigger ON company_module_entitlements;
CREATE TRIGGER company_module_entitlements_history_trigger
    AFTER INSERT OR UPDATE ON company_module_entitlements
    FOR EACH ROW EXECUTE FUNCTION company_module_entitlements_record_history();

CREATE OR REPLACE FUNCTION company_contracts_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.change_reason := NULLIF(BTRIM(NEW.change_reason), '');
    IF TG_OP = 'UPDATE' THEN
        IF NEW.company_id <> OLD.company_id OR NEW.created_at <> OLD.created_at THEN
            RAISE EXCEPTION 'Firma und Erstellungszeit eines Vertrags sind unveränderlich.';
        END IF;
        NEW.updated_at := CURRENT_TIMESTAMP;
        NEW.row_version := OLD.row_version + 1;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION company_contracts_record_history()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO company_contract_history (
        company_id, contract_id, row_version, old_state, new_state,
        changed_by_platform_user_id, change_reason, changed_at
    ) VALUES (
        NEW.company_id, NEW.id, NEW.row_version,
        CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
        to_jsonb(NEW), NEW.changed_by_platform_user_id, NEW.change_reason,
        NEW.updated_at
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS company_contracts_before_write_trigger ON company_contracts;
CREATE TRIGGER company_contracts_before_write_trigger
    BEFORE INSERT OR UPDATE ON company_contracts
    FOR EACH ROW EXECUTE FUNCTION company_contracts_before_write();
DROP TRIGGER IF EXISTS company_contracts_history_trigger ON company_contracts;
CREATE TRIGGER company_contracts_history_trigger
    AFTER INSERT OR UPDATE ON company_contracts
    FOR EACH ROW EXECUTE FUNCTION company_contracts_record_history();

CREATE OR REPLACE FUNCTION immutable_platform_history()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'Historische Preis-, Vertrags- und Freigabestände sind unveränderlich.';
END;
$$;

DROP TRIGGER IF EXISTS license_plan_versions_immutable_trigger ON license_plan_versions;
CREATE TRIGGER license_plan_versions_immutable_trigger
    BEFORE UPDATE OR DELETE ON license_plan_versions
    FOR EACH ROW EXECUTE FUNCTION immutable_platform_history();
DROP TRIGGER IF EXISTS company_module_history_immutable_trigger ON company_module_entitlement_history;
CREATE TRIGGER company_module_history_immutable_trigger
    BEFORE UPDATE OR DELETE ON company_module_entitlement_history
    FOR EACH ROW EXECUTE FUNCTION immutable_platform_history();
DROP TRIGGER IF EXISTS company_contract_history_immutable_trigger ON company_contract_history;
CREATE TRIGGER company_contract_history_immutable_trigger
    BEFORE UPDATE OR DELETE ON company_contract_history
    FOR EACH ROW EXECUTE FUNCTION immutable_platform_history();

INSERT INTO module_catalog (
    module_key, name, description, category, is_special, requires_platform_approval
) VALUES
    ('time_tracking', 'Zeiterfassung', 'Arbeits-, Pausen- und Fahrzeiten.', 'core', FALSE, TRUE),
    ('scheduling', 'Einsatzplanung', 'Mitarbeiter- und Baustelleneinsätze.', 'business', FALSE, TRUE),
    ('vde', 'VDE-Prüfprotokolle', 'Optionale Elektro-Prüfprotokolle.', 'electrical', TRUE, TRUE),
    ('dguv', 'DGUV-Prüfprotokolle', 'Optionale Elektro-Prüfprotokolle.', 'electrical', TRUE, TRUE),
    ('electrical_special', 'Elektro-Spezialmodule', 'Weitere freigabepflichtige Elektrofunktionen.', 'electrical', TRUE, TRUE),
    ('apprentice_reports', 'Azubi-Berichtsheft', 'Digitales Berichtsheft.', 'business', FALSE, TRUE),
    ('assembly_reports', 'Montageberichte', 'Montageberichte und Unterschriften.', 'business', FALSE, TRUE),
    ('site_daily_reports', 'Bautagesberichte', 'Tagesberichte je Baustelle.', 'business', FALSE, TRUE),
    ('fleet', 'Fuhrpark', 'Fahrzeuge und Fuhrparkprozesse.', 'business', FALSE, TRUE),
    ('materials', 'Materialverwaltung', 'Materialbestand und -verbrauch.', 'business', FALSE, TRUE),
    ('documents', 'Dokumentenverwaltung', 'Firmen- und Baustellendokumente.', 'business', FALSE, TRUE),
    ('integrations', 'Schnittstellen', 'Externe Integrationen.', 'integration', FALSE, TRUE),
    ('advanced_exports', 'Besondere Exportfunktionen', 'Zusätzliche Exporte.', 'export', FALSE, TRUE)
ON CONFLICT (module_key) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    is_special = EXCLUDED.is_special,
    requires_platform_approval = EXCLUDED.requires_platform_approval;

INSERT INTO company_module_entitlements (
    company_id, module_id, entitlement_status, starts_at, included_in_plan,
    feature_scope, change_reason
)
SELECT existing.company_id, catalog.id,
       CASE WHEN existing.is_enabled THEN 'permanent' ELSE 'inactive' END,
       CASE WHEN existing.is_enabled THEN COALESCE(existing.enabled_at, existing.created_at) END,
       FALSE, '{}'::JSONB, 'Übernahme der bisherigen Modulfreigabe'
FROM company_modules AS existing
JOIN module_catalog AS catalog ON catalog.module_key = existing.module_key
ON CONFLICT (company_id, module_id) DO NOTHING;

-- Bestehende Kernfunktionen des Standardtarifs bleiben nach der Einführung
-- des Freigabemodells ohne Unterbrechung verfügbar. Optionale und
-- freigabepflichtige Module werden ausdrücklich nicht automatisch aktiviert.
INSERT INTO company_module_entitlements (
    company_id, module_id, entitlement_status, starts_at, included_in_plan,
    feature_scope, change_reason
)
SELECT company.id, catalog.id, 'permanent', company.created_at, TRUE,
       catalog.default_feature_scope, 'Bestandsübernahme des Standardtarifs'
FROM companies AS company
CROSS JOIN module_catalog AS catalog
WHERE catalog.module_key IN (
    'time_tracking', 'scheduling', 'assembly_reports',
    'site_daily_reports', 'documents'
)
ON CONFLICT (company_id, module_id) DO NOTHING;

CREATE OR REPLACE FUNCTION seed_standard_company_entitlements()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    INSERT INTO company_module_entitlements (
        company_id, module_id, entitlement_status, starts_at, included_in_plan,
        feature_scope, change_reason
    )
    SELECT NEW.id, catalog.id, 'permanent', CURRENT_TIMESTAMP, TRUE,
           catalog.default_feature_scope, 'Standardfreigabe bei Firmenanlage'
    FROM module_catalog AS catalog
    WHERE catalog.module_key IN (
        'time_tracking', 'scheduling', 'assembly_reports',
        'site_daily_reports', 'documents'
    )
    ON CONFLICT (company_id, module_id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS companies_seed_standard_entitlements_trigger ON companies;
CREATE TRIGGER companies_seed_standard_entitlements_trigger
    AFTER INSERT ON companies
    FOR EACH ROW EXECUTE FUNCTION seed_standard_company_entitlements();

INSERT INTO license_plans (plan_key, name, status, description)
VALUES ('standard', 'Standard', 'active', 'Bestehender Standardtarif')
ON CONFLICT (plan_key) DO NOTHING;

INSERT INTO license_plan_versions (
    license_plan_id, version_number, monthly_price_cents, annual_price_cents,
    included_modules
)
SELECT id, 1, 0, 0,
       '["time_tracking","scheduling","assembly_reports","site_daily_reports","documents"]'::JSONB
FROM license_plans
WHERE plan_key = 'standard'
ON CONFLICT (license_plan_id, version_number) DO NOTHING;

-- Firmen dürfen die Freigabetabelle nicht mehr verändern. Das vorhandene
-- company_modules-Modell bleibt nur als rückwärtskompatible Lesequelle bestehen.
REVOKE INSERT, UPDATE ON company_modules FROM schaefchen_api;

ALTER TABLE module_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_module_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_module_entitlement_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE license_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE license_plan_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_contract_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS module_catalog_platform_access ON module_catalog;
CREATE POLICY module_catalog_platform_access ON module_catalog
    USING (CURRENT_USER = 'schaefchen_platform_api')
    WITH CHECK (CURRENT_USER = 'schaefchen_platform_api');
DROP POLICY IF EXISTS module_catalog_tenant_read ON module_catalog;
CREATE POLICY module_catalog_tenant_read ON module_catalog
    FOR SELECT USING (CURRENT_USER = 'schaefchen_api');
DROP POLICY IF EXISTS company_module_entitlements_platform_access ON company_module_entitlements;
CREATE POLICY company_module_entitlements_platform_access ON company_module_entitlements
    USING (CURRENT_USER = 'schaefchen_platform_api')
    WITH CHECK (CURRENT_USER = 'schaefchen_platform_api');
DROP POLICY IF EXISTS company_module_entitlements_tenant_read ON company_module_entitlements;
CREATE POLICY company_module_entitlements_tenant_read ON company_module_entitlements
    FOR SELECT USING (
        CURRENT_USER = 'schaefchen_api'
        AND company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID
    );
DROP POLICY IF EXISTS company_module_history_platform_access ON company_module_entitlement_history;
CREATE POLICY company_module_history_platform_access ON company_module_entitlement_history
    USING (CURRENT_USER = 'schaefchen_platform_api')
    WITH CHECK (CURRENT_USER = 'schaefchen_platform_api');
DROP POLICY IF EXISTS license_plans_platform_access ON license_plans;
CREATE POLICY license_plans_platform_access ON license_plans
    USING (CURRENT_USER = 'schaefchen_platform_api')
    WITH CHECK (CURRENT_USER = 'schaefchen_platform_api');
DROP POLICY IF EXISTS license_plan_versions_platform_access ON license_plan_versions;
CREATE POLICY license_plan_versions_platform_access ON license_plan_versions
    USING (CURRENT_USER = 'schaefchen_platform_api')
    WITH CHECK (CURRENT_USER = 'schaefchen_platform_api');
DROP POLICY IF EXISTS company_contracts_platform_access ON company_contracts;
CREATE POLICY company_contracts_platform_access ON company_contracts
    USING (CURRENT_USER = 'schaefchen_platform_api')
    WITH CHECK (CURRENT_USER = 'schaefchen_platform_api');
DROP POLICY IF EXISTS company_contract_history_platform_access ON company_contract_history;
CREATE POLICY company_contract_history_platform_access ON company_contract_history
    USING (CURRENT_USER = 'schaefchen_platform_api')
    WITH CHECK (CURRENT_USER = 'schaefchen_platform_api');

GRANT SELECT, INSERT, UPDATE ON module_catalog, company_module_entitlements,
    license_plans, company_contracts TO schaefchen_platform_api;
GRANT SELECT, INSERT ON company_module_entitlement_history,
    license_plan_versions, company_contract_history TO schaefchen_platform_api;
GRANT SELECT ON module_catalog, company_module_entitlements TO schaefchen_api;

ALTER TABLE module_catalog NO FORCE ROW LEVEL SECURITY;
ALTER TABLE company_module_entitlements NO FORCE ROW LEVEL SECURITY;
ALTER TABLE company_module_entitlement_history NO FORCE ROW LEVEL SECURITY;
ALTER TABLE license_plans NO FORCE ROW LEVEL SECURITY;
ALTER TABLE license_plan_versions NO FORCE ROW LEVEL SECURITY;
ALTER TABLE company_contracts NO FORCE ROW LEVEL SECURITY;
ALTER TABLE company_contract_history NO FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE company_module_entitlements IS
    'Ausschließlich von Plattformadministratoren verwaltete Modulfreigaben mit Laufzeit, Limit und Umfang.';
COMMENT ON TABLE license_plan_versions IS
    'Unveränderliche Tarifversionen; bestehende Verträge referenzieren einen historischen Stand.';
COMMENT ON TABLE company_contracts IS
    'Firmenvertrag mit vollständigem Preis-, Limit- und Modul-Snapshot.';

COMMIT;
