-- Fassung 0.42.14 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: Nachlese zum eigenen Berichtsheft-Bereich.
--
-- Die App wurde als Ganzes durchgemessen - alle Rollen, alle Bereiche. Dabei
-- fielen im Bereich des Ausbilders zwei Dinge auf: der Wochenwechsler stand da
-- und tat nichts, denn ein Ausbilder hat kein eigenes Heft, und "Keine
-- Wochenberichte vorhanden" widersprach der Zeile darueber, die offene Wochen
-- nannte.
--
-- Ausserdem war der Weg zum gedruckten Heft eines ganzen Jahres fuer den
-- Ausbilder nicht erreichbar: die Schnittstelle dafuer gab es bereits samt
-- Test, nur keine Schaltflaeche. Er sieht jetzt seine Auszubildenden mit ihrem
-- Stand und kann das Jahr je Person drucken.
--
-- Zu dieser Fassung gehoeren ein neuer Speichername des Dienst-Workers
-- (schaefchen-online-v56) und neue Fassungsangaben an allen Dateien.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.42.14', 'superseded', CURRENT_TIMESTAMP,
    'Der Ausbilder sieht seine Auszubildenden mit ihrem Stand und druckt das Heft eines ganzen Jahres.',
    '[]'::JSONB,
    '["066"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production'
  AND version <> '0.42.14';

UPDATE application_versions
SET release_status = 'production',
    rollout_percent = 100
WHERE version = '0.42.14'
  AND release_status <> 'production';

COMMIT;
