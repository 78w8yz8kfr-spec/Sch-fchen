-- Fassung 0.42.28 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: der Fuhrpark.
--
-- Das Modul "fleet" stand seit Migration 040 im Katalog, dahinter lag nichts.
-- Es war deshalb als "noch nicht angebunden" gefuehrt und liess sich gar nicht
-- einschalten - ein Schalter, der etwas verspricht, was es nicht gibt, ist
-- schlimmer als keiner.
--
-- Jetzt gibt es die Fahrzeuge wirklich: Kennzeichen, Bezeichnung, Art,
-- benoetigte Fuehrerscheinklasse, fester Fahrer, Zustand, naechste
-- Hauptuntersuchung und naechster Service.
--
-- Eine abgelaufene Hauptuntersuchung ist kein Termin mehr, sondern ein
-- Fahrverbot. Sie steht deshalb rot in der Liste.
--
-- Das Kennzeichen ist je Firma nur einmal vergeben, auch anders geschrieben:
-- "ES-SE 123" und "es-se123" sind derselbe Wagen. Gespeichert wird eine
-- Schreibweise.
--
-- Ein ausgemustertes Fahrzeug wird nicht geloescht. Es steht in alten
-- Berichten; ein Loeschen wuerde die Vergangenheit unlesbar machen. Die
-- Schnittstelle darf deshalb gar nicht loeschen.
--
-- Der Fuhrpark gehoert ab dieser Fassung zum Standardumfang - dorthin, wo
-- Dokumente und Material schon stehen. Bestandsfirmen bekommen ihn
-- nachtraeglich (Migration 082).
--
-- Zu dieser Fassung gehoeren die Migrationen 081 (Fahrzeuge) und 082
-- (Standardumfang), ein neuer Speichername des Dienst-Workers
-- (schaefchen-online-v70) und neue Fassungsangaben an allen Dateien.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.42.28', 'superseded', CURRENT_TIMESTAMP,
    'Fuhrpark: Fahrzeuge mit Fahrer, Terminen und Zustand.',
    '[]'::JSONB,
    '["081", "082", "083"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production'
  AND version <> '0.42.28';

UPDATE application_versions
SET release_status = 'production',
    rollout_percent = 100
WHERE version = '0.42.28'
  AND release_status <> 'production';

COMMIT;
