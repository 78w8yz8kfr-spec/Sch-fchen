-- Fassung 0.43.1 als Produktionsstand eintragen.
--
-- Diese Korrektur stellt auf schmalen Bildschirmen den abgenommenen
-- Baustellenmodus wieder her: Start, Zeiten und Mehr; der laufende Arbeitstag
-- erscheint pro Rolle nur einmal. Das kompakte Desktop-Design aus V0.43.0 und
-- alle Zeit-, Einsatz- und Berichtsdaten bleiben unveraendert.
--
-- Zu dieser Fassung gehoeren der neue App-Shell-Speicher
-- (schaefchen-online-v80) und zusammenpassende Fassungsangaben an Server,
-- Frontends und Dienst-Worker.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.43.1', 'superseded', CURRENT_TIMESTAMP,
    'Mobiler Baustellenmodus wie abgenommen; keine doppelte Zeiterfassung.',
    '[]'::JSONB,
    '["093"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production'
  AND version <> '0.43.1';

UPDATE application_versions
SET release_status = 'production',
    rollout_percent = 100
WHERE version = '0.43.1'
  AND release_status <> 'production';

COMMIT;
