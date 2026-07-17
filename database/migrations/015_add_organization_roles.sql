BEGIN;

CREATE OR REPLACE FUNCTION create_default_roles_for_company(
    target_company_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    organization_permissions CONSTANT JSONB :=
        '{"planning":{"scope":"company","actions":["manage"]},"timesheets":{"scope":"company","actions":["read","correct"]},"users":{"scope":"company","actions":["read","manage"]}}'::JSONB;
BEGIN
    INSERT INTO roles (
        company_id,
        role_key,
        name,
        description,
        permissions,
        is_system,
        is_full_access
    )
    VALUES
        (
            target_company_id,
            'admin',
            'Admin',
            'Vollzugriff auf die eigene Firma.',
            '{"all":{"scope":"company","actions":["manage"]}}'::JSONB,
            TRUE,
            TRUE
        ),
        (
            target_company_id,
            'office',
            'Büro (Bestand)',
            'Bestehende Organisationsrolle; bleibt aus Kompatibilitätsgründen erhalten.',
            organization_permissions,
            TRUE,
            FALSE
        ),
        (
            target_company_id,
            'planner',
            'Planer',
            'Organisation, Planung und freigegebene Korrekturen.',
            organization_permissions,
            TRUE,
            FALSE
        ),
        (
            target_company_id,
            'project_manager',
            'Projektleiter',
            'Organisation, Planung und freigegebene Korrekturen.',
            organization_permissions,
            TRUE,
            FALSE
        ),
        (
            target_company_id,
            'executive_assistant',
            'Assistenz der Geschäftsführung',
            'Organisation, Planung und freigegebene Korrekturen.',
            organization_permissions,
            TRUE,
            FALSE
        ),
        (
            target_company_id,
            'foreman',
            'Vorarbeiter',
            'Erweiterte Rechte ausschließlich auf zugewiesenen Baustellen.',
            '{"construction_sites":{"scope":"assigned","actions":["read","report"]},"own_data":{"scope":"self","actions":["read"]}}'::JSONB,
            TRUE,
            FALSE
        ),
        (
            target_company_id,
            'installer',
            'Monteur',
            'Zugriff auf eigene Daten und den nächsten Arbeitsschritt.',
            '{"own_data":{"scope":"self","actions":["read"]},"own_time":{"scope":"self","actions":["read","manage"]}}'::JSONB,
            TRUE,
            FALSE
        )
    ON CONFLICT (company_id, role_key) DO NOTHING;
END;
$$;

SELECT create_default_roles_for_company(id)
FROM companies;

COMMIT;
