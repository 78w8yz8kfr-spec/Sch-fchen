-- Fassung 0.44.0 als Produktionsstand eintragen.
--
-- Maschinen & Geräte ist ein vollständiger, mandantengetrennter Fachbereich:
-- sichere QR-Tokens, feste und aktuelle Besitzer, idempotente Übergaben,
-- Akkus als Einzelinventar, Defekte, Prüfungen, Inventur, Benachrichtigungen
-- und unveränderliche Historien. Die PWA erhält dazu Kamera-Scan und eine
-- konfliktgeschützte Offline-Warteschlange.
--
-- Zu dieser Fassung gehören Migration 095 und der neue Speichername des
-- Dienst-Workers schaefchen-online-v82.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.44.0', 'superseded', CURRENT_TIMESTAMP,
    'Maschinen & Geräte mit sicheren QR-Codes, Übergaben, Akkus, Prüfungen, Inventur, Offline-Synchronisierung und Historie.',
    '[]'::JSONB,
    '["095","096"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production'
  AND version <> '0.44.0';

UPDATE application_versions
SET release_status = 'production',
    rollout_percent = 100
WHERE version = '0.44.0'
  AND release_status <> 'production';

COMMIT;
