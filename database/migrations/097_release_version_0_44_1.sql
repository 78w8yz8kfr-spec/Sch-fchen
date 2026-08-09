-- Fassung 0.44.1 als Produktionsstand eintragen.
--
-- Der QR-Scanner verwendet auf iPhone und iPad einen lokalen Decoder, wenn
-- die experimentelle BarcodeDetector-API nicht bereitsteht. Die Browser-
-- Sicherheitsregeln erlauben die Kamera ausschließlich der eigenen
-- Schäfchen-Herkunft; Mikrofon und Standort bleiben gesperrt.
--
-- Zu dieser Fassung gehören der neue Speichername des Dienst-Workers
-- schaefchen-online-v83 und die lokal ausgelieferten Scannerdateien.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.44.1', 'superseded', CURRENT_TIMESTAMP,
    'QR-Livekamera und QR-Fotoerkennung funktionieren jetzt auch in Safari auf iPhone und iPad.',
    '[]'::JSONB,
    '["097"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production'
  AND version <> '0.44.1';

UPDATE application_versions
SET release_status = 'production',
    rollout_percent = 100
WHERE version = '0.44.1'
  AND release_status <> 'production';

COMMIT;
