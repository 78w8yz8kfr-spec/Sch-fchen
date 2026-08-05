-- Fassung 0.42.12 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: eine eingereichte Woche laesst sich zurueckholen.
--
-- Zu erklaeren, warum die Felder gesperrt sind, war nur die halbe Antwort. Wer
-- zu frueh eingereicht hatte, sass fest: schreiben ging nicht mehr, und der
-- einzige Weg zurueck fuehrte ueber den Ausbilder. Solange der nicht
-- unterschrieben hat, gehoert der Bericht aber dem Auszubildenden - im
-- Papierheft streicht man vor seiner Unterschrift ebenso einfach durch.
--
-- Die eigene Unterschrift darf er zuruecknehmen, die des Ausbilders nicht: ein
-- freigegebener Nachweis bleibt, wie er ist. Der Verlauf behaelt beide
-- Schritte.
--
-- Zu dieser Fassung gehoeren ein neuer Speichername des Dienst-Workers
-- (schaefchen-online-v54) und neue Fassungsangaben an allen Dateien.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.42.12', 'superseded', CURRENT_TIMESTAMP,
    'Berichtsheft: eine eingereichte Woche lässt sich zurückholen, solange der Ausbilder nicht unterschrieben hat.',
    '[]'::JSONB,
    '["064"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production'
  AND version <> '0.42.12';

UPDATE application_versions
SET release_status = 'production',
    rollout_percent = 100
WHERE version = '0.42.12'
  AND release_status <> 'production';

COMMIT;
