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
    management_permissions CONSTANT JSONB :=
        '{"planning":{"scope":"company","actions":["manage"]},"timesheets":{"scope":"company","actions":["read","correct"]},"users":{"scope":"company","actions":["read","manage"]}}'::JSONB;
    director_permissions CONSTANT JSONB :=
        '{"company":{"scope":"company","actions":["read","manage"]},"customers":{"scope":"company","actions":["manage"]},"projects":{"scope":"company","actions":["manage"]},"construction_sites":{"scope":"company","actions":["manage"]},"planning":{"scope":"company","actions":["manage"]},"timesheets":{"scope":"company","actions":["read","correct"]},"users":{"scope":"company","actions":["read","manage"]},"documents":{"scope":"company","actions":["manage"]},"reports":{"scope":"company","actions":["manage"]}}'::JSONB;
    dispatch_permissions CONSTANT JSONB :=
        '{"customers":{"scope":"company","actions":["read","manage"]},"projects":{"scope":"company","actions":["read","manage"]},"construction_sites":{"scope":"company","actions":["read","manage"]},"planning":{"scope":"company","actions":["manage"]},"timesheets":{"scope":"company","actions":["read","correct"]},"users":{"scope":"company","actions":["read"]},"documents":{"scope":"company","actions":["read","manage"]}}'::JSONB;
    project_permissions CONSTANT JSONB :=
        '{"customers":{"scope":"company","actions":["read"]},"projects":{"scope":"assigned","actions":["read","manage"]},"construction_sites":{"scope":"assigned","actions":["read","manage"]},"planning":{"scope":"assigned","actions":["manage"]},"timesheets":{"scope":"assigned","actions":["read","correct"]},"users":{"scope":"company","actions":["read"]},"documents":{"scope":"assigned","actions":["read","manage"]},"reports":{"scope":"assigned","actions":["read","manage"]},"tasks":{"scope":"assigned","actions":["manage"]},"material":{"scope":"assigned","actions":["manage"]}}'::JSONB;
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
            'Administrator',
            'Technischer Vollzugriff auf die eigene Firma.',
            '{"all":{"scope":"company","actions":["manage"]}}'::JSONB,
            TRUE,
            TRUE
        ),
        (
            target_company_id,
            'managing_director',
            'Geschäftsführer',
            'Vollständige betriebliche Steuerung ohne technische Systemrolle.',
            director_permissions,
            TRUE,
            FALSE
        ),
        (
            target_company_id,
            'dispatch_office',
            'Büro / Disposition',
            'Kunden-, Projekt-, Baustellen- und Einsatzplanung.',
            dispatch_permissions,
            TRUE,
            FALSE
        ),
        (
            target_company_id,
            'project_manager',
            'Projektleiter',
            'Steuerung der zugewiesenen Projekte und Baustellen.',
            project_permissions,
            TRUE,
            FALSE
        ),
        (
            target_company_id,
            'foreman',
            'Vorarbeiter',
            'Erweiterte Rechte ausschließlich auf zugewiesenen Baustellen.',
            '{"construction_sites":{"scope":"assigned","actions":["read","report"]},"tasks":{"scope":"assigned","actions":["read","manage"]},"material":{"scope":"assigned","actions":["read","manage"]},"own_data":{"scope":"self","actions":["read"]},"own_time":{"scope":"self","actions":["read","manage"]}}'::JSONB,
            TRUE,
            FALSE
        ),
        (
            target_company_id,
            'installer',
            'Monteur',
            'Zugriff auf eigene Daten und den nächsten Arbeitsschritt.',
            '{"construction_sites":{"scope":"assigned","actions":["read"]},"own_data":{"scope":"self","actions":["read"]},"own_time":{"scope":"self","actions":["read","manage"]}}'::JSONB,
            TRUE,
            FALSE
        ),
        (
            target_company_id,
            'office',
            'Büro (Bestand)',
            'Alte Organisationsrolle; bleibt für bestehende Konten erhalten.',
            management_permissions,
            TRUE,
            FALSE
        ),
        (
            target_company_id,
            'planner',
            'Planer (Bestand)',
            'Alte Organisationsrolle; bleibt für bestehende Konten erhalten.',
            management_permissions,
            TRUE,
            FALSE
        ),
        (
            target_company_id,
            'executive_assistant',
            'Assistenz der Geschäftsführung (Bestand)',
            'Alte Organisationsrolle; bleibt für bestehende Konten erhalten.',
            management_permissions,
            TRUE,
            FALSE
        )
    ON CONFLICT (company_id, role_key) DO NOTHING;

    UPDATE roles
    SET name = 'Administrator',
        description = 'Technischer Vollzugriff auf die eigene Firma.'
    WHERE company_id = target_company_id
      AND role_key = 'admin'
      AND is_system;

    UPDATE roles
    SET name = 'Projektleiter',
        description = 'Steuerung der zugewiesenen Projekte und Baustellen.',
        permissions = project_permissions
    WHERE company_id = target_company_id
      AND role_key = 'project_manager'
      AND is_system;

    UPDATE roles
    SET name = CASE role_key
            WHEN 'office' THEN 'Büro (Bestand)'
            WHEN 'planner' THEN 'Planer (Bestand)'
            ELSE 'Assistenz der Geschäftsführung (Bestand)'
        END,
        description = 'Alte Organisationsrolle; bleibt für bestehende Konten erhalten.',
        permissions = management_permissions
    WHERE company_id = target_company_id
      AND role_key IN ('office', 'planner', 'executive_assistant')
      AND is_system;
END;
$$;

SELECT create_default_roles_for_company(id)
FROM companies;

COMMIT;
