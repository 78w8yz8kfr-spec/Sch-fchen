-- Fassung 0.42.3 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: die Bereiche der App gehoeren der
-- Plattformverwaltung, die Firmennummer wird nur bei der ersten Anmeldung
-- abgefragt, die Bueroverwaltung steht nur noch unter "Mehr", und mehrere
-- Anzeigefehler sind behoben.
--
-- Der Dienst-Worker liefert die Dateien der App aus einem Zwischenspeicher aus.
-- Zu dieser Fassung gehoeren deshalb ein neuer Speichername
-- (schaefchen-online-v45) und neue Fassungsangaben an allen Dateien.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.42.3', 'superseded', CURRENT_TIMESTAMP,
    'Freigabe der Bereiche allein durch die Plattform, Firmennummer nur bei der ersten Anmeldung, Büroverwaltung nur noch unter „Mehr“, behobene Anzeigefehler.',
    '[]'::JSONB, '["051","052"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production'
  AND version <> '0.42.3';

UPDATE application_versions
SET release_status = 'production',
    rollout_percent = 100
WHERE version = '0.42.3'
  AND release_status <> 'production';

COMMIT;
