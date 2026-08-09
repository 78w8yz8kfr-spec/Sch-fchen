-- Versehentlich verlorene Azubi-Rollen wiederherstellen und Fassung 0.44.6
-- als Produktionsstand eintragen.
--
-- Das Mitarbeiterformular kannte die Rolle "apprentice" beim Vorauswaehlen
-- nicht. Wurde ein Auszubildender auch nur wegen Telefonnummer, Name oder
-- Ausbilder geoeffnet und gespeichert, schickte die Oberflaeche stattdessen
-- "installer". Der Server widerrief daraufhin die Azubi-Rolle und damit das
-- Berichtsheft.
--
-- Eine automatische Reparatur darf keine ehemalige Ausbildung rueckgaengig
-- machen. Deshalb werden nur aktive Konten repariert, deren Azubi-Rolle genau
-- durch die Mitarbeiterverwaltung widerrufen wurde und deren laufender
-- Ausbildungszeitraum oder ein Bericht der laufenden/vorigen Woche die
-- weiterhin bestehende Ausbildung belegt. Ein verlorener Ausbilder wird nicht
-- geraten: diese Zuordnung ist eine Zugriffsregel und darf nur sicher gesetzt
-- werden.
--
-- Zu dieser Fassung gehoert der App-Shell-Speicher schaefchen-online-v88.

BEGIN;

WITH affected_apprentices AS (
    SELECT person.company_id,
           person.id AS user_id,
           apprentice_role.id AS role_id
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
)
INSERT INTO user_roles (
    company_id, user_id, role_id, assigned_by_user_id, reason
)
SELECT company_id,
       user_id,
       role_id,
       NULL,
       'Automatische Reparatur der unbeabsichtigt entfernten Azubi-Rolle'
FROM affected_apprentices
ON CONFLICT (company_id, user_id, role_id) WHERE revoked_at IS NULL DO NOTHING;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.44.6', 'superseded', CURRENT_TIMESTAMP,
    'Das Berichtsheft bleibt beim Bearbeiten eines Auszubildenden erhalten; versehentlich entfernte Azubi-Rollen mit aktuellem Ausbildungsnachweis werden wiederhergestellt.',
    '[]'::JSONB,
    '["102"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production'
  AND version <> '0.44.6';

UPDATE application_versions
SET release_status = 'production',
    rollout_percent = 100
WHERE version = '0.44.6'
  AND release_status <> 'production';

COMMIT;
