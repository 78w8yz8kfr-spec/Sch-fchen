BEGIN;

INSERT INTO companies (
    company_number,
    legal_name,
    display_name,
    status,
    country_code,
    license_plan,
    settings
)
VALUES (
    'F-000001',
    'Schaaf Elektro GmbH',
    'Schaaf Elektro GmbH',
    'active',
    'DE',
    'development',
    '{"is_initial_tenant": true}'::JSONB
)
ON CONFLICT (company_number) DO NOTHING;

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
