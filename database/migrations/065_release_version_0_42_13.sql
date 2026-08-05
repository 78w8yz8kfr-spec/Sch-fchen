-- Fassung 0.42.13 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: das Berichtsheft bekommt einen eigenen Bereich.
--
-- Bisher lag es unten in der Wochenansicht, zwischen Stundenzettel und
-- Abwesenheiten. Fuer den Auszubildenden ist es aber die Arbeit, die er
-- taeglich neben der Zeiterfassung hat, und fuer den Ausbilder die, die er
-- woechentlich abzeichnet - kein Anhaengsel.
--
-- Der Bereich heisst "Nachweis" und erscheint nur bei diesen beiden. Er
-- enthaelt die Woche mit ihren Tageszeilen, die fehlenden Wochen und die
-- bisherigen Berichte; jede Zeile dort fuehrt in ihre Woche zurueck und laesst
-- sich von dort drucken.
--
-- Zu dieser Fassung gehoeren ein neuer Speichername des Dienst-Workers
-- (schaefchen-online-v55) und neue Fassungsangaben an allen Dateien.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.42.13', 'superseded', CURRENT_TIMESTAMP,
    'Das Berichtsheft bekommt einen eigenen Bereich mit allen bisherigen Wochenberichten.',
    '[]'::JSONB,
    '["065"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production'
  AND version <> '0.42.13';

UPDATE application_versions
SET release_status = 'production',
    rollout_percent = 100
WHERE version = '0.42.13'
  AND release_status <> 'production';

COMMIT;
