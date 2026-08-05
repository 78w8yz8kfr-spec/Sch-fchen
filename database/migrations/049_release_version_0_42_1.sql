-- Fassung 0.42.1 als Produktionsstand eintragen.
--
-- Der Dienst-Worker liefert die Dateien der App aus einem Zwischenspeicher aus,
-- ohne beim Server nachzufragen. Solange Fassungsnummer und Speichername
-- gleich bleiben, erreicht keine Korrektur ein bereits eingerichtetes Geraet.
-- Zu dieser Fassung gehoeren deshalb ein neuer Speichername
-- (schaefchen-online-v43) und neue Fassungsangaben an allen Dateien.
--
-- Die Reihenfolge ist wichtig: ein eindeutiger Index laesst nur eine
-- Produktionsfassung zu. Erst werden alle anderen abgeloest, dann wird die
-- neue gesetzt. So bleibt die Migration auch bei mehrfachem Lauf richtig.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.42.1', 'superseded', CURRENT_TIMESTAMP,
    'Zugriff auf die Baustellenakte, Erhalt offline erfasster Arbeit beim Tageswechsel, firmeneigene Schalter für abschaltbare Bereiche und eine ausgefüllte Import-Vorlage.',
    '[]'::JSONB, '["045","046","047","048","049"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production'
  AND version <> '0.42.1';

UPDATE application_versions
SET release_status = 'production',
    rollout_percent = 100
WHERE version = '0.42.1'
  AND release_status <> 'production';

COMMIT;
