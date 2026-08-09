-- Das vom Nutzer gemeldete Piet-Konto eindeutig dem Berichtsheft zuordnen und
-- Fassung 0.44.8 als Produktionsstand eintragen.
--
-- Migration 103 verlangte für die Wiederherstellung einen vorhandenen Bericht
-- oder eine historische Azubi-Rolle. Die Live-Beobachtung – „Azubi“ erscheint
-- kurz und verschwindet nach dem Laden der Sitzung – belegt, dass das richtige
-- Konto und das freigeschaltete Modul vorhanden sind, die Rollen-Evidenz im
-- Bestand aber fehlt. Deshalb wird das gemeldete Konto nun über Mandant und
-- Namen eindeutig aufgelöst: Gibt es nur einen aktiven Piet, ist er das Ziel;
-- bei mehreren Piets wird ausschließlich ein eindeutiger Piet Kästner gewählt.
-- Eine mehrdeutige Auswahl vergibt aus Sicherheitsgründen keine Rolle.
--
-- Zu dieser Fassung gehört der App-Shell-Speicher schaefchen-online-v90.

BEGIN;

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
       'Berichtsheft-Zugriff der Schaaf Elektro GmbH bestätigt'
FROM companies AS company
JOIN module_catalog AS catalog
  ON catalog.module_key = 'apprentice_reports'
 AND catalog.status = 'active'
WHERE company.company_number = 'F-000001'
ON CONFLICT (company_id, module_id) DO UPDATE
SET entitlement_status = 'permanent',
    starts_at = COALESCE(company_module_entitlements.starts_at, CURRENT_TIMESTAMP),
    ends_at = NULL,
    change_reason = 'Berichtsheft-Zugriff der Schaaf Elektro GmbH bestätigt'
WHERE company_module_entitlements.entitlement_status <> 'permanent'
   OR company_module_entitlements.ends_at IS NOT NULL;

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
INSERT INTO user_roles (
    company_id, user_id, role_id, assigned_by_user_id, reason
)
SELECT company_id,
       user_id,
       role_id,
       NULL,
       'Vom Nutzer bestätigte Zuordnung zum Azubi-Berichtsheft'
FROM unique_reported_candidate
WHERE candidate_count = 1
ON CONFLICT (company_id, user_id, role_id) WHERE revoked_at IS NULL DO NOTHING;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.44.8', 'superseded', CURRENT_TIMESTAMP,
    'Das eindeutig gemeldete Piet-Konto erhält die fehlende Azubi-Rolle auch ohne unvollständige historische Rollendaten; das Berichtsheft bleibt dauerhaft freigeschaltet.',
    '[]'::JSONB,
    '["104"]'::JSONB, 100, TRUE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production'
  AND version <> '0.44.8';

UPDATE application_versions
SET release_status = 'production',
    rollout_percent = 100,
    mandatory_update = TRUE
WHERE version = '0.44.8'
  AND (
      release_status <> 'production'
      OR rollout_percent <> 100
      OR mandatory_update = FALSE
  );

COMMIT;
