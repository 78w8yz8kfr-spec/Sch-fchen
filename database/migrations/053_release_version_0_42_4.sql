-- Fassung 0.42.4 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: auf der Karte der Plantafel liegen Text und
-- Schaltflaechen nicht mehr uebereinander. Nebeneinander blieben auf dem Handy
-- 20 Pixel fuer den Baustellennamen; er lag unter den Schaltflaechen.
--
-- Zu dieser Fassung gehoeren ein neuer Speichername des Dienst-Workers
-- (schaefchen-online-v46) und neue Fassungsangaben an allen Dateien.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.42.4', 'superseded', CURRENT_TIMESTAMP,
    'Einsatzkarten der Plantafel überlagern sich nicht mehr: Text oben, Schaltflächen darunter.',
    '[]'::JSONB, '["053"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production'
  AND version <> '0.42.4';

UPDATE application_versions
SET release_status = 'production',
    rollout_percent = 100
WHERE version = '0.42.4'
  AND release_status <> 'production';

COMMIT;
