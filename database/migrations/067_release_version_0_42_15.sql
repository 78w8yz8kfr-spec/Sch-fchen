-- Fassung 0.42.15 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: die Maengelliste im VDE-Protokoll bleibt zusammen.
--
-- Auf dem Deckblatt ist bei fuenf Zeilen Schluss, damit Ergebnis und
-- Unterschriften darauf Platz behalten. Der Rest stand bisher hinter den
-- Messwerten - wer das Protokoll las, fand mitten zwischen Ohm-Werten eine
-- "Fortsetzung" der Maengel von Seite 1. Bei einem Pruefprotokoll sind die
-- Maengel das, was zaehlt; sie stehen jetzt unmittelbar hinter dem Deckblatt
-- und vor den Messwerten.
--
-- Zu dieser Fassung gehoeren ein neuer Speichername des Dienst-Workers
-- (schaefchen-online-v57) und neue Fassungsangaben an allen Dateien.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.42.15', 'superseded', CURRENT_TIMESTAMP,
    'VDE-Protokoll: eine lange Mängelliste bleibt zusammen und steht vor den Messwerten.',
    '[]'::JSONB,
    '["067"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production'
  AND version <> '0.42.15';

UPDATE application_versions
SET release_status = 'production',
    rollout_percent = 100
WHERE version = '0.42.15'
  AND release_status <> 'production';

COMMIT;
