\echo 'Teste Migration 038_create_planning_teams.sql ...'

BEGIN;

DO $$
DECLARE
    target_company_id UUID;
    planner_id UUID;
    installer_id UUID;
    foreman_id UUID;
    target_customer_id UUID;
    target_location_id UUID;
    target_project_id UUID;
    target_team_id UUID;
    target_site_id UUID;
    target_assignment_id UUID;
BEGIN
    SELECT id
    INTO target_company_id
    FROM companies
    WHERE company_number = 'F-000001';

    INSERT INTO users (
        company_id,
        personnel_number,
        first_name,
        last_name
    ) VALUES (
        target_company_id,
        'PLAN-TEAM-38',
        'Paula',
        'Planung'
    )
    RETURNING id INTO planner_id;

    INSERT INTO users (
        company_id,
        personnel_number,
        first_name,
        last_name
    ) VALUES (
        target_company_id,
        'MON-TEAM-38',
        'Mona',
        'Montage'
    )
    RETURNING id INTO installer_id;

    INSERT INTO users (
        company_id,
        personnel_number,
        first_name,
        last_name,
        is_foreman
    ) VALUES (
        target_company_id,
        'VOR-TEAM-38',
        'Vera',
        'Vorarbeiterin',
        TRUE
    )
    RETURNING id INTO foreman_id;

    INSERT INTO planning_teams (
        company_id,
        name,
        created_by_user_id,
        changed_by_user_id
    ) VALUES (
        target_company_id,
        'Team Migration 038',
        planner_id,
        planner_id
    )
    RETURNING id INTO target_team_id;

    INSERT INTO planning_team_members (
        company_id,
        planning_team_id,
        user_id,
        added_by_user_id
    ) VALUES
        (target_company_id, target_team_id, installer_id, planner_id),
        (target_company_id, target_team_id, foreman_id, planner_id);

    INSERT INTO planning_team_member_events (
        company_id,
        planning_team_id,
        user_id,
        event_type,
        actor_user_id
    ) VALUES
        (target_company_id, target_team_id, installer_id, 'added', planner_id),
        (target_company_id, target_team_id, foreman_id, 'added', planner_id);

    INSERT INTO customers (
        company_id,
        customer_type,
        company_name
    ) VALUES (
        target_company_id,
        'company',
        'Planungsteam-Testkunde 038'
    )
    RETURNING id INTO target_customer_id;

    INSERT INTO customer_locations (
        company_id,
        customer_id,
        name,
        location_type,
        street,
        house_number,
        postal_code,
        city
    ) VALUES (
        target_company_id,
        target_customer_id,
        'Planungsteam-Testort 038',
        'construction',
        'Testweg',
        '38',
        '12345',
        'Teststadt'
    )
    RETURNING id INTO target_location_id;

    INSERT INTO projects (
        company_id,
        customer_id,
        name,
        status
    ) VALUES (
        target_company_id,
        target_customer_id,
        'Planungsteam-Testprojekt 038',
        'active'
    )
    RETURNING id INTO target_project_id;

    INSERT INTO project_locations (
        company_id,
        project_id,
        customer_location_id
    ) VALUES (
        target_company_id,
        target_project_id,
        target_location_id
    );

    INSERT INTO construction_sites (
        company_id,
        project_id,
        customer_location_id,
        name,
        status
    ) VALUES (
        target_company_id,
        target_project_id,
        target_location_id,
        'Planungsteam-Testbaustelle 038',
        'active'
    )
    RETURNING id INTO target_site_id;

    INSERT INTO site_assignments (
        company_id,
        user_id,
        construction_site_id,
        work_date,
        sequence_number,
        status,
        created_by_user_id,
        changed_by_user_id
    ) VALUES (
        target_company_id,
        installer_id,
        target_site_id,
        DATE '2099-03-08',
        1,
        'released',
        planner_id,
        planner_id
    )
    RETURNING id INTO target_assignment_id;

    UPDATE site_assignments
    SET user_id = foreman_id,
        changed_by_user_id = planner_id,
        last_change_reason = 'SQL-Abnahme der Mitarbeiterzeile'
    WHERE company_id = target_company_id
      AND id = target_assignment_id
      AND row_version = 1;

    IF NOT EXISTS (
        SELECT 1
        FROM site_assignments
        WHERE id = target_assignment_id
          AND user_id = foreman_id
          AND row_version = 2
    ) OR NOT EXISTS (
        SELECT 1
        FROM site_assignment_history
        WHERE site_assignment_id = target_assignment_id
          AND change_reason = 'SQL-Abnahme der Mitarbeiterzeile'
          AND previous_values ->> 'user_id' = installer_id::TEXT
    ) THEN
        RAISE EXCEPTION 'Mitarbeiterwechsel wurde nicht versionsgeschützt historisiert';
    END IF;

    UPDATE planning_teams
    SET name = 'Team Migration 038 aktualisiert',
        changed_by_user_id = planner_id,
        last_change_reason = 'SQL-Abnahme'
    WHERE company_id = target_company_id
      AND id = target_team_id
      AND row_version = 1;

    UPDATE planning_team_members
    SET ended_at = CURRENT_TIMESTAMP,
        ended_by_user_id = planner_id
    WHERE company_id = target_company_id
      AND planning_team_id = target_team_id
      AND user_id = installer_id;

    INSERT INTO planning_team_member_events (
        company_id,
        planning_team_id,
        user_id,
        event_type,
        actor_user_id
    ) VALUES (
        target_company_id,
        target_team_id,
        installer_id,
        'removed',
        planner_id
    );

    IF NOT EXISTS (
        SELECT 1
        FROM planning_teams
        WHERE id = target_team_id
          AND name = 'Team Migration 038 aktualisiert'
          AND row_version = 2
    ) THEN
        RAISE EXCEPTION 'Teamvorlage wurde nicht versionsgeschützt aktualisiert';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM planning_team_history
        WHERE planning_team_id = target_team_id
          AND change_reason = 'SQL-Abnahme'
          AND previous_values ->> 'name' = 'Team Migration 038'
    ) THEN
        RAISE EXCEPTION 'Änderung der Teamvorlage wurde nicht historisiert';
    END IF;

    IF (
        SELECT COUNT(*)
        FROM planning_team_member_events
        WHERE planning_team_id = target_team_id
    ) <> 3 THEN
        RAISE EXCEPTION 'Mitgliedsänderungen wurden nicht vollständig protokolliert';
    END IF;

    BEGIN
        DELETE FROM planning_teams WHERE id = target_team_id;
        RAISE EXCEPTION 'Teamvorlage konnte hart gelöscht werden';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM = 'Teamvorlage konnte hart gelöscht werden' THEN
                RAISE;
            END IF;
    END;
END;
$$;

SELECT id AS tenant_id
FROM companies
WHERE company_number = 'F-000001'
\gset

SET LOCAL ROLE schaefchen_api;
SELECT set_config('app.current_company_id', :'tenant_id', TRUE);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM planning_teams) THEN
        RAISE EXCEPTION 'API-Rolle sieht die eigene Teamvorlage nicht';
    END IF;

    PERFORM set_config('app.current_company_id', gen_random_uuid()::TEXT, TRUE);
    IF EXISTS (
        SELECT 1 FROM planning_teams
        UNION ALL
        SELECT 1 FROM planning_team_members
        UNION ALL
        SELECT 1 FROM planning_team_member_events
        UNION ALL
        SELECT 1 FROM planning_team_history
    ) THEN
        RAISE EXCEPTION 'API-Rolle sieht Planungsdaten eines anderen Mandanten';
    END IF;
END;
$$;

RESET ROLE;
ROLLBACK;

\echo 'Migration 038_create_planning_teams.sql erfolgreich getestet.'
