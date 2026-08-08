-- Fassung 0.43.1 als Produktionsstand eintragen.
--
-- Diese Fassung ordnet die vorhandene Betriebsoberflaeche neu: fachliche
-- Navigationsgruppen, echte Unterbereiche fuer Woche, Einstellungen und
-- Arbeitszeit-Auswertung sowie eine normale Kunden-/Baustellenbedienung ohne
-- sichtbare zweite Projektebene. Datenmodell, Mandantengrenzen, Rollen,
-- Module und historische Projektverknuepfungen bleiben unveraendert.
--
-- Zu dieser Fassung gehoeren der neue Speichername des Dienst-Workers
-- (schaefchen-online-v80) und neue Fassungsangaben an allen App-Dateien.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.43.1', 'superseded', CURRENT_TIMESTAMP,
    'Fachlich gruppierte Navigation und echte, uebersichtliche Unterbereiche.',
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
