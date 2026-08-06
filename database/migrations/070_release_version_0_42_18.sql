-- Fassung 0.42.18 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: der Rahmen des neuen Entwurfs.
--
-- Dunkle Seitenleiste mit rotem aktivem Eintrag, der Name der App darueber,
-- Benutzername und Rolle in der Kopfzeile. Das ist der erste Schritt einer
-- groesseren Umgestaltung: jeder Bildschirm erbt diesen Rahmen, deshalb kommt
-- er zuerst.
--
-- Auf dem Telefon bleibt alles, wie es ist. Dort ist die helle Leiste unten am
-- Rand richtig und erprobt.
--
-- Zu dieser Fassung gehoeren ein neuer Speichername des Dienst-Workers
-- (schaefchen-online-v60) und neue Fassungsangaben an allen Dateien.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.42.18', 'superseded', CURRENT_TIMESTAMP,
    'Neues Design, erster Schritt: dunkle Seitenleiste und Kopfzeile mit Benutzer.',
    '[]'::JSONB,
    '["070"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production'
  AND version <> '0.42.18';

UPDATE application_versions
SET release_status = 'production',
    rollout_percent = 100
WHERE version = '0.42.18'
  AND release_status <> 'production';

COMMIT;
