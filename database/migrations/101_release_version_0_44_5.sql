-- Fassung 0.44.5 als Produktionsstand eintragen.
--
-- Der Geräte-QR-Druckbogen ordnet bis zu 120 Etiketten auf genau einer
-- A4-Seite an. Jeder QR-Code misst 18 x 18 mm und bleibt damit kleiner als
-- 2 x 2 cm; Gerätename und Inventarnummer bleiben direkt zugeordnet.
--
-- Zu dieser Fassung gehört der App-Shell-Speicher schaefchen-online-v87.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.44.5', 'superseded', CURRENT_TIMESTAMP,
    'Der Geräte-QR-Druckbogen fasst bis zu 120 kompakte Etiketten mit höchstens 2 x 2 cm großen QR-Codes auf einer A4-Seite.',
    '[]'::JSONB,
    '["101"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production'
  AND version <> '0.44.5';

UPDATE application_versions
SET release_status = 'production',
    rollout_percent = 100
WHERE version = '0.44.5'
  AND release_status <> 'production';

COMMIT;
