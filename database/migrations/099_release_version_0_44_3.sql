-- Fassung 0.44.3 als Produktionsstand eintragen.
--
-- Die firmenweite Geräteübersicht bindet nur noch die tatsächlich in der
-- SQL-Abfrage verwendeten Parameter. Die mobile Teileanlage benennt fehlende
-- Pflichtfelder verständlich und verwirft versehentlich vollständig leere
-- Zusatzzeilen vor dem Speichern.
--
-- Zu dieser Fassung gehört der App-Shell-Speicher schaefchen-online-v85.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.44.3', 'superseded', CURRENT_TIMESTAMP,
    'Gerätebestand lädt für Büro und Administration wieder zuverlässig; mobile Set-Teile zeigen konkrete Pflichtfeldhinweise und leere Zusatzzeilen blockieren die Anlage nicht.',
    '[]'::JSONB,
    '["099"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production'
  AND version <> '0.44.3';

UPDATE application_versions
SET release_status = 'production',
    rollout_percent = 100
WHERE version = '0.44.3'
  AND release_status <> 'production';

COMMIT;
