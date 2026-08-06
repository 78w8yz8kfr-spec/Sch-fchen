-- Fassung 0.42.17 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: der Berichtsheft-Bildschirm nach der Vorlage.
--
-- Kopfdaten wie im gedruckten Blatt, eine Tagestabelle mit denselben vier
-- Spalten, ein Zeichenzaehler an den Bemerkungen und die Regeln dort, wo
-- geschrieben wird - nicht in einer Anleitung, die niemand aufschlaegt.
--
-- Dazu die Vorschau des Wochenblatts neben dem Formular. Sie ist etwas
-- anderes als ein Ausdruck: sie ist auch fuer einen Entwurf erlaubt, traegt
-- dafuer quer ueber dem Blatt "VORSCHAU" und wird im Browser angezeigt statt
-- in den Downloadordner gelegt. Eingerahmt werden darf sie nur von der
-- eigenen Seite; fuer alle uebrigen Antworten bleibt das Einrahmen verboten.
--
-- Zu dieser Fassung gehoeren ein neuer Speichername des Dienst-Workers
-- (schaefchen-online-v59) und neue Fassungsangaben an allen Dateien.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.42.17', 'superseded', CURRENT_TIMESTAMP,
    'Berichtsheft am Rechner: Kopfdaten, Tagestabelle und die Vorschau des Wochenblatts daneben.',
    '[]'::JSONB,
    '["069"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production'
  AND version <> '0.42.17';

UPDATE application_versions
SET release_status = 'production',
    rollout_percent = 100
WHERE version = '0.42.17'
  AND release_status <> 'production';

COMMIT;
