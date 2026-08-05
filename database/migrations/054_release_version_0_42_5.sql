-- Fassung 0.42.5 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: eine Zelle der Plantafel zeigt hoechstens zwei Karten
-- und den Rest auf Wunsch. Alle Zellen einer Zeile liegen in derselben
-- Rasterzeile; ein Mitarbeiter mit vier Einsaetzen an einem Tag machte damit
-- die ganze Zeile hoch, und in den uebrigen Tagesspalten stand ebenso viel
-- Leere.
--
-- Zu dieser Fassung gehoeren ein neuer Speichername des Dienst-Workers
-- (schaefchen-online-v47) und neue Fassungsangaben an allen Dateien.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.42.5', 'superseded', CURRENT_TIMESTAMP,
    'Plantafel: eine Zelle zeigt höchstens zwei Karten, der Rest lässt sich aufklappen.',
    '[]'::JSONB, '["054"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production'
  AND version <> '0.42.5';

UPDATE application_versions
SET release_status = 'production',
    rollout_percent = 100
WHERE version = '0.42.5'
  AND release_status <> 'production';

COMMIT;
