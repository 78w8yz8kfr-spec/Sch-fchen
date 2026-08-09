-- Fassung 0.44.2 als Produktionsstand eintragen.
--
-- Die Geräteverwaltung bleibt bei Teilausfällen bedienbar und stellt die
-- Anlage jetzt als klaren Ablauf bereit: Stammdaten und Seriennummer,
-- fester/aktueller Besitzer, beiliegende Einzelteile und direkt anschließend
-- die QR-Etiketten. Die bereits in Migration 095 angelegten Setrelationen
-- werden dabei erstmals vollständig über API und Oberfläche genutzt.
--
-- Zu dieser Fassung gehört der App-Shell-Speicher schaefchen-online-v84.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.44.2', 'superseded', CURRENT_TIMESTAMP,
    'Geräte lassen sich mit Seriennummer, festem und aktuellem Besitzer sowie einzeln inventarisierten Set-Teilen anlegen; alle QR-Etiketten stehen unmittelbar danach zum Druck bereit.',
    '[]'::JSONB,
    '["098"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production'
  AND version <> '0.44.2';

UPDATE application_versions
SET release_status = 'production',
    rollout_percent = 100
WHERE version = '0.44.2'
  AND release_status <> 'production';

COMMIT;
