\echo 'Teste Migration 014_create_initial_setup_functions.sql ...'

BEGIN;

DO $$
DECLARE
    protected_tables TEXT[] := ARRAY[
        'companies', 'users', 'roles', 'user_roles', 'customers',
        'customer_contacts', 'customer_locations', 'projects',
        'project_locations', 'project_responsibles', 'construction_sites',
        'site_assignments', 'site_assignment_history', 'site_supervisors',
        'site_supervisor_history', 'work_days', 'time_entries', 'user_sessions'
    ];
    correctly_configured INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO correctly_configured
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = ANY(protected_tables)
      AND relation.relrowsecurity
      AND NOT relation.relforcerowsecurity;

    IF correctly_configured <> CARDINALITY(protected_tables) THEN
        RAISE EXCEPTION 'RLS-Eigentümergrenze ist nicht auf allen Fachtabellen korrekt konfiguriert';
    END IF;
END;
$$;

SET LOCAL ROLE schaefchen_api;

DO $$
DECLARE
    tenant_id UUID;
    created_user_id UUID;
    setup_required_before BOOLEAN;
    setup_required_after BOOLEAN;
BEGIN
    SELECT company_id, setup_required
    INTO tenant_id, setup_required_before
    FROM api_get_initial_setup_status('F-000001');

    IF tenant_id IS NULL OR setup_required_before IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'Leere Firma wurde nicht als einrichtungsbereit erkannt';
    END IF;

    SELECT api_create_initial_admin(
        'F-000001',
        'ADMIN-1',
        'Erste',
        'Administration',
        'scrypt$16384$8$1$MDEyMzQ1Njc4OWFiY2RlZg$MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY'
    ) INTO created_user_id;

    IF created_user_id IS NULL THEN
        RAISE EXCEPTION 'Erster Admin wurde nicht angelegt';
    END IF;

    SELECT setup_required
    INTO setup_required_after
    FROM api_get_initial_setup_status('F-000001');

    IF setup_required_after IS DISTINCT FROM FALSE THEN
        RAISE EXCEPTION 'Einrichtung blieb nach Admin-Anlage offen';
    END IF;

    BEGIN
        PERFORM api_create_initial_admin(
            'F-000001',
            'ADMIN-2',
            'Zweite',
            'Administration',
            'scrypt$16384$8$1$MDEyMzQ1Njc4OWFiY2RlZg$MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY'
        );
        RAISE EXCEPTION USING ERRCODE = 'ZXD01', MESSAGE = 'Zweiter Initial-Admin wurde akzeptiert';
    EXCEPTION
        WHEN SQLSTATE 'P0001' THEN NULL;
    END;

    PERFORM set_config('app.current_company_id', tenant_id::TEXT, TRUE);

    IF NOT EXISTS (
        SELECT 1
        FROM user_roles AS assignment
        JOIN roles AS role
          ON role.company_id = assignment.company_id
         AND role.id = assignment.role_id
        WHERE assignment.user_id = created_user_id
          AND assignment.revoked_at IS NULL
          AND role.role_key = 'admin'
    ) THEN
        RAISE EXCEPTION 'Initialer Benutzer besitzt keine aktive Adminrolle';
    END IF;
END;
$$;

RESET ROLE;
ROLLBACK;

\echo 'Migration 014_create_initial_setup_functions.sql erfolgreich getestet.'
