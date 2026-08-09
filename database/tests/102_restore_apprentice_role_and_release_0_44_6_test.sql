\echo 'Teste Migration 102_restore_apprentice_role_and_release_0_44_6.sql ...'

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
    FROM application_versions WHERE version = '0.44.6';
    IF release_state IS DISTINCT FROM 'production' THEN
        RAISE EXCEPTION 'Die Fassung 0.44.6 fehlt oder besitzt einen ungültigen Status';
    END IF;
    IF NOT migrations @> '["102"]'::JSONB THEN
        RAISE EXCEPTION 'Die Fassung 0.44.6 nennt Migration 102 nicht';
    END IF;

    SELECT release_status INTO previous_state
    FROM application_versions WHERE version = '0.44.5';
    IF previous_state IS DISTINCT FROM 'superseded' THEN
        RAISE EXCEPTION 'Die Vorgängerfassung 0.44.5 wurde nicht korrekt abgelöst';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM application_versions
        WHERE version = '0.44.6' AND rollout_percent = 100
          AND mandatory_update = FALSE
    ) THEN
        RAISE EXCEPTION 'Fassung 0.44.6 ist nicht vollständig und freiwillig ausgerollt';
    END IF;

    -- Nach der Migration darf kein eindeutig noch aktiver Auszubildender
    -- uebrig sein, dessen Rolle das alte Formular widerrufen hat.
    IF EXISTS (
        SELECT 1
        FROM users AS person
        JOIN roles AS apprentice_role
          ON apprentice_role.company_id = person.company_id
         AND apprentice_role.role_key = 'apprentice'
         AND apprentice_role.status = 'active'
        WHERE person.status = 'active'
          AND NOT EXISTS (
              SELECT 1
              FROM user_roles AS active_assignment
              WHERE active_assignment.company_id = person.company_id
                AND active_assignment.user_id = person.id
                AND active_assignment.role_id = apprentice_role.id
                AND active_assignment.revoked_at IS NULL
          )
          AND EXISTS (
              SELECT 1
              FROM user_roles AS revoked_assignment
              WHERE revoked_assignment.company_id = person.company_id
                AND revoked_assignment.user_id = person.id
                AND revoked_assignment.role_id = apprentice_role.id
                AND revoked_assignment.revoked_at IS NOT NULL
                AND revoked_assignment.reason = 'Rollenänderung in der Mitarbeiterverwaltung'
          )
          AND (
              (
                  person.apprenticeship_started_on IS NOT NULL
                  AND person.apprenticeship_started_on <= CURRENT_DATE
                  AND (
                      person.apprenticeship_ends_on IS NULL
                      OR person.apprenticeship_ends_on >= CURRENT_DATE
                  )
              )
              OR EXISTS (
                  SELECT 1
                  FROM apprentice_reports AS report
                  WHERE report.company_id = person.company_id
                    AND report.apprentice_user_id = person.id
                    AND report.week_start >= DATE_TRUNC('week', CURRENT_DATE)::DATE - 7
                    AND report.week_start <= DATE_TRUNC('week', CURRENT_DATE)::DATE
              )
          )
    ) THEN
        RAISE EXCEPTION 'Eine eindeutig aktive, versehentlich entfernte Azubi-Rolle wurde nicht repariert';
    END IF;
END;
$$;

\echo 'Migration 102_restore_apprentice_role_and_release_0_44_6.sql ist fachlich abgenommen.'
