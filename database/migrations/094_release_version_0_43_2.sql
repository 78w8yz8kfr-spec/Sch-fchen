-- Fassung 0.43.2 als Produktionsstand eintragen.
--
-- Diese Fassung repariert die mobile Bereichsleiste. Planende Rollen erhalten
-- Planung, Dokumentation und Betrieb als echte Schaltflaechen; Desktop-
-- Gruppenueberschriften und einzelne Desktopziele belegen auf dem Telefon
-- keinen Platz mehr. Datenmodell, Mandantengrenzen, Rollen und Module bleiben
-- unveraendert.
--
-- Zu dieser Fassung gehoeren der neue Speichername des Dienst-Workers
-- (schaefchen-online-v81) und neue Fassungsangaben an allen App-Dateien.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.43.2', 'superseded', CURRENT_TIMESTAMP,
    'Mobile Bereichsleiste mit bedienbaren Schaltflaechen fuer Planung, Dokumentation und Betrieb.',
    '[]'::JSONB,
    '["094"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production'
  AND version <> '0.43.2';

UPDATE application_versions
SET release_status = 'production',
    rollout_percent = 100
WHERE version = '0.43.2'
  AND release_status <> 'production';

COMMIT;
