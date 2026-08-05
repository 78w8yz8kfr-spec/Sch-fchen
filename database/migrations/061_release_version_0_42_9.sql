-- Fassung 0.42.9 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: Das Berichtsheft wird taeglich geschrieben und
-- woechentlich ausgedruckt. Statt eines Wochentextes steht jetzt eine Zeile je
-- Tag im Nachweis - Tag, Datum, Taetigkeiten, Arbeitszeit -, und daraus
-- entsteht auf Knopfdruck eine A4-Seite je Woche, wie sie die Kammer sehen
-- will. Arbeitszeit und Abwesenheit traegt der Server ein.
--
-- Zu dieser Fassung gehoeren ein neuer Speichername des Dienst-Workers
-- (schaefchen-online-v51) und neue Fassungsangaben an allen Dateien.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.42.9', 'superseded', CURRENT_TIMESTAMP,
    'Berichtsheft mit Tageszeilen und Wochenbericht als A4-PDF zum Ausdrucken.',
    '["Keine Erinnerung an fehlende Wochen"]'::JSONB,
    '["060","061"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production'
  AND version <> '0.42.9';

UPDATE application_versions
SET release_status = 'production',
    rollout_percent = 100
WHERE version = '0.42.9'
  AND release_status <> 'production';

COMMIT;
