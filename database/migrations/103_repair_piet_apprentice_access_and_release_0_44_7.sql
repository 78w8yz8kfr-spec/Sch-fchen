-- Piets Berichtsheft-Zugriff vollständig absichern und Fassung 0.44.7 als
-- Produktionsstand eintragen.
--
-- Migration 102 stellte eindeutig versehentlich widerrufene Azubi-Rollen
-- wieder her. Eine bereits laufende PWA-Sitzung behielt jedoch ihre alte
-- Rollenliste, weil sie beim Aktualisieren nur Modulfreigaben übernahm. Diese
-- Fassung liest die vollständige Zugriffssicht neu ein.
--
-- Für den gemeldeten Bestandsfall wird zusätzlich beides serverseitig
-- abgesichert: Das Berichtsheft bleibt für den ersten Schaaf-Mandanten
-- freigeschaltet, und ein aktiver Piet mit vorhandenem Berichtsheft oder
-- historischer Azubi-Rolle erhält die aktive Rolle zurück. Die fachliche
-- Evidenz verhindert, dass allein ein Vorname eine Rolle vergibt.
--
-- Zu dieser Fassung gehört der App-Shell-Speicher schaefchen-online-v89.

BEGIN;

-- Das Berichtsheft war für Schaaf bereits sichtbar. Sollte die Freigabe
-- zwischenzeitlich fehlen oder abgelaufen sein, wird der gemeldete Umfang
-- nachvollziehbar wiederhergestellt.
INSERT INTO company_module_entitlements (
    company_id, module_id, entitlement_status, starts_at, ends_at,
    included_in_plan, separately_billed, feature_scope, change_reason
)
SELECT company.id,
       catalog.id,
       'permanent',
       CURRENT_TIMESTAMP,
       NULL,
       TRUE,
       FALSE,
       catalog.default_feature_scope,
       'Berichtsheft-Zugriff der Schaaf Elektro GmbH wiederhergestellt'
FROM companies AS company
JOIN module_catalog AS catalog
  ON catalog.module_key = 'apprentice_reports'
 AND catalog.status = 'active'
WHERE company.company_number = 'F-000001'
ON CONFLICT (company_id, module_id) DO UPDATE
SET entitlement_status = 'permanent',
    starts_at = COALESCE(company_module_entitlements.starts_at, CURRENT_TIMESTAMP),
    ends_at = NULL,
    change_reason = 'Berichtsheft-Zugriff der Schaaf Elektro GmbH wiederhergestellt'
WHERE company_module_entitlements.entitlement_status <> 'permanent'
   OR company_module_entitlements.ends_at IS NOT NULL;

WITH affected_piet AS (
    SELECT person.company_id,
           person.id AS user_id,
           apprentice_role.id AS role_id
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
      AND NOT EXISTS (
          SELECT 1
          FROM user_roles AS active_assignment
          WHERE active_assignment.company_id = person.company_id
            AND active_assignment.user_id = person.id
            AND active_assignment.role_id = apprentice_role.id
            AND active_assignment.revoked_at IS NULL
      )
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
)
INSERT INTO user_roles (
    company_id, user_id, role_id, assigned_by_user_id, reason
)
SELECT company_id,
       user_id,
       role_id,
       NULL,
       'Gezielte Wiederherstellung des gemeldeten Berichtsheft-Zugriffs'
FROM affected_piet
ON CONFLICT (company_id, user_id, role_id) WHERE revoked_at IS NULL DO NOTHING;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.44.7', 'superseded', CURRENT_TIMESTAMP,
    'Laufende Sitzungen übernehmen reparierte Rollen sofort; Piets Azubi-Rolle und die Berichtsheft-Freigabe der Schaaf Elektro GmbH werden zusätzlich abgesichert.',
    '[]'::JSONB,
    '["103"]'::JSONB, 100, TRUE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production'
  AND version <> '0.44.7';

UPDATE application_versions
SET release_status = 'production',
    rollout_percent = 100,
    mandatory_update = TRUE
WHERE version = '0.44.7'
  AND (
      release_status <> 'production'
      OR rollout_percent <> 100
      OR mandatory_update = FALSE
  );

COMMIT;
