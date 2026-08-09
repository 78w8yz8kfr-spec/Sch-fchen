\echo 'Teste Migration 103_repair_piet_apprentice_access_and_release_0_44_7.sql ...'

DO $$
DECLARE
    production_count INTEGER;
    release_state VARCHAR(30);
    previous_state VARCHAR(30);
    migrations JSONB;
BEGIN
    SELECT COUNT(*) INTO production_count
    FROM application_versions
    WHERE release_status = 'production';
    IF production_count <> 1 THEN
        RAISE EXCEPTION 'Es muss genau eine Produktionsfassung geben, gefunden: %', production_count;
    END IF;

    SELECT release_status, database_migrations
      INTO release_state, migrations
    FROM application_versions WHERE version = '0.44.7';
    IF release_state IS DISTINCT FROM 'production' THEN
        RAISE EXCEPTION 'Die Fassung 0.44.7 fehlt oder besitzt einen ungültigen Status';
    END IF;
    IF NOT migrations @> '["103"]'::JSONB THEN
        RAISE EXCEPTION 'Die Fassung 0.44.7 nennt Migration 103 nicht';
    END IF;

    SELECT release_status INTO previous_state
    FROM application_versions WHERE version = '0.44.6';
    IF previous_state IS DISTINCT FROM 'superseded' THEN
        RAISE EXCEPTION 'Die Vorgängerfassung 0.44.6 wurde nicht korrekt abgelöst';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM application_versions
        WHERE version = '0.44.7'
          AND rollout_percent = 100
          AND mandatory_update = TRUE
    ) THEN
        RAISE EXCEPTION 'Fassung 0.44.7 ist nicht vollständig als notwendige Reparatur ausgerollt';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM company_module_entitlements AS entitlement
        JOIN companies AS company ON company.id = entitlement.company_id
        JOIN module_catalog AS catalog ON catalog.id = entitlement.module_id
        WHERE company.company_number = 'F-000001'
          AND catalog.module_key = 'apprentice_reports'
          AND entitlement.entitlement_status = 'permanent'
          AND entitlement.ends_at IS NULL
    ) THEN
        RAISE EXCEPTION 'Das Berichtsheft ist für die Schaaf Elektro GmbH nicht dauerhaft freigegeben';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM users AS person
        JOIN companies AS company
          ON company.id = person.company_id
         AND company.company_number = 'F-000001'
        JOIN roles AS apprentice_role
          ON apprentice_role.company_id = person.company_id
         AND apprentice_role.role_key = 'apprentice'
         AND apprentice_role.status = 'active'
        WHERE person.status = 'active'
          AND LOWER(BTRIM(person.first_name)) = 'piet'
          AND (
              EXISTS (
                  SELECT 1
                  FROM apprentice_reports AS report
                  WHERE report.company_id = person.company_id
                    AND report.apprentice_user_id = person.id
              )
              OR EXISTS (
                  SELECT 1
                  FROM user_roles AS historical_assignment
                  WHERE historical_assignment.company_id = person.company_id
                    AND historical_assignment.user_id = person.id
                    AND historical_assignment.role_id = apprentice_role.id
              )
          )
          AND NOT EXISTS (
              SELECT 1
              FROM user_roles AS active_assignment
              WHERE active_assignment.company_id = person.company_id
                AND active_assignment.user_id = person.id
                AND active_assignment.role_id = apprentice_role.id
                AND active_assignment.revoked_at IS NULL
          )
    ) THEN
        RAISE EXCEPTION 'Piets belegter Azubi-Zugriff wurde nicht wiederhergestellt';
    END IF;
END;
$$;

\echo 'Migration 103_repair_piet_apprentice_access_and_release_0_44_7.sql ist fachlich abgenommen.'
