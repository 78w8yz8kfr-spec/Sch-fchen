BEGIN;

INSERT INTO companies (
    company_number,
    legal_name,
    display_name,
    status,
    logo_object_key,
    country_code,
    license_plan,
    settings
)
VALUES (
    'F-000001',
    'Schaaf Elektro GmbH',
    'Schaaf Elektro GmbH',
    'active',
    'company-logos/schaaf-elektro.webp',
    'DE',
    'development',
    '{"is_initial_tenant": true}'::JSONB
)
ON CONFLICT (company_number) DO NOTHING;

-- Der erste Schaaf-Mandant nutzt das digitale Berichtsheft bereits. Auf einer
-- frischen Installation entsteht die Firma erst nach den Migrationen; deshalb
-- muss dieselbe Freigabe, die Migration 103 im Bestand absichert, auch im
-- idempotenten Seed stehen.
INSERT INTO company_module_entitlements (
    company_id, module_id, entitlement_status, starts_at,
    included_in_plan, separately_billed, feature_scope, change_reason
)
SELECT company.id,
       catalog.id,
       'permanent',
       CURRENT_TIMESTAMP,
       TRUE,
       FALSE,
       catalog.default_feature_scope,
       'Berichtsheft für den ersten Schaaf-Mandanten freigegeben'
FROM companies AS company
JOIN module_catalog AS catalog
  ON catalog.module_key = 'apprentice_reports'
 AND catalog.status = 'active'
WHERE company.company_number = 'F-000001'
ON CONFLICT (company_id, module_id) DO NOTHING;

SELECT setval(
    'companies_number_seq',
    GREATEST(
        COALESCE(
            (
                SELECT MAX(SUBSTRING(company_number FROM '[0-9]+$')::BIGINT)
                FROM companies
                WHERE company_number ~ '^F-[0-9]+$'
            ),
            1
        ),
        1
    ),
    TRUE
);

COMMIT;
