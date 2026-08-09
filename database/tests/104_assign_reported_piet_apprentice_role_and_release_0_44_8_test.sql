\echo 'Teste Migration 104_assign_reported_piet_apprentice_role_and_release_0_44_8.sql ...'

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
    FROM application_versions WHERE version = '0.44.8';
    IF release_state IS NULL OR release_state NOT IN ('production', 'superseded') THEN
        RAISE EXCEPTION 'Die Fassung 0.44.8 fehlt oder besitzt einen ungültigen Status';
    END IF;
    IF NOT migrations @> '["104"]'::JSONB THEN
        RAISE EXCEPTION 'Die Fassung 0.44.8 nennt Migration 104 nicht';
    END IF;

    SELECT release_status INTO previous_state
    FROM application_versions WHERE version = '0.44.7';
    IF previous_state IS DISTINCT FROM 'superseded' THEN
        RAISE EXCEPTION 'Die Vorgängerfassung 0.44.7 wurde nicht korrekt abgelöst';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM application_versions
        WHERE version = '0.44.8'
          AND rollout_percent = 100
          AND mandatory_update = TRUE
    ) THEN
        RAISE EXCEPTION 'Fassung 0.44.8 ist nicht vollständig als notwendige Reparatur ausgerollt';
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

    -- Falls der Produktionsbestand einen nach den Regeln eindeutig
    -- identifizierbaren Piet enthält, muss genau dessen aktive Azubi-Rolle nun
    -- vorhanden sein. Auf einer frischen Testdatenbank darf die Kandidatenliste
    -- leer sein; die Abfrage bleibt dadurch mandanten- und bestandsneutral.
    IF EXISTS (
        WITH active_piets AS (
            SELECT person.company_id,
                   person.id AS user_id,
                   person.last_name,
                   apprentice_role.id AS role_id,
                   COUNT(*) OVER () AS active_piet_count
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
        ), reported_candidates AS (
            SELECT company_id, user_id, role_id
            FROM active_piets
            WHERE active_piet_count = 1
               OR LOWER(BTRIM(last_name)) IN ('kästner', 'kaestner')
        ), unique_reported_candidate AS (
            SELECT company_id,
                   user_id,
                   role_id,
                   COUNT(*) OVER () AS candidate_count
            FROM reported_candidates
        )
        SELECT 1
        FROM unique_reported_candidate AS target
        WHERE target.candidate_count = 1
          AND NOT EXISTS (
              SELECT 1
              FROM user_roles AS assignment
              WHERE assignment.company_id = target.company_id
                AND assignment.user_id = target.user_id
                AND assignment.role_id = target.role_id
                AND assignment.revoked_at IS NULL
          )
    ) THEN
        RAISE EXCEPTION 'Das eindeutig gemeldete Piet-Konto besitzt weiterhin keine aktive Azubi-Rolle';
    END IF;
END;
$$;

\echo 'Migration 104_assign_reported_piet_apprentice_role_and_release_0_44_8.sql ist fachlich abgenommen.'
