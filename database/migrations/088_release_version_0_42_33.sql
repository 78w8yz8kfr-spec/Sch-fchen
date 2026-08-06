-- Fassung 0.42.33 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: die App merkt, wenn sie halb alt laeuft.
--
-- Das Dokument fordert eine bestimmte Fassung an - "app.js?v=0.42.33". Der
-- Dienst-Worker darf im Notfall eine aeltere Fassung derselben Datei
-- zurueckgeben; waehrend einer Veroeffentlichung ist eine Fassung zu alt
-- besser als eine weisse Seite. Nur geht dieser Notfall vorbei, ohne dass es
-- jemand merkt. Dann laeuft neues Geruest mit alter Anwendung oder umgekehrt.
--
-- Das sieht nicht kaputt aus. Es fehlt nur etwas: eine Schaltflaeche, eine
-- Zahl neben einer anderen. Man sucht den Fehler dann in der Fachlichkeit, wo
-- keiner ist - gemeldet worden ist es zweimal so, beim Fuhrpark und beim
-- Resturlaub.
--
-- Die angeforderte Fassung steht in der eigenen Adresse, die eingebaute im
-- Quelltext. Gehen sie auseinander, raeumt die App die abgelegten Dateien weg
-- und laedt neu. Genau einmal: liefert der Server selbst noch die alte Datei
-- aus, waere ein zweiter Versuch eine Schleife. Dann bleibt der Hinweisbalken
-- stehen und sagt, was auseinandergeht.
--
-- Dazu eine Kleinigkeit: neben "Resturlaub" stand als Platzhalter "0 Tage".
-- Solange die Zahl nicht geladen ist, waere jede Zahl eine Behauptung ueber
-- den Urlaubsanspruch eines Menschen. Dort steht jetzt ein Strich.
--
-- Zu dieser Fassung gehoeren ein neuer Speichername des Dienst-Workers
-- (schaefchen-online-v75) und neue Fassungsangaben an allen Dateien.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.42.33', 'superseded', CURRENT_TIMESTAMP,
    'Die App erkennt und repariert eine halb veraltete Ansicht.',
    '[]'::JSONB,
    '["088"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production'
  AND version <> '0.42.33';

UPDATE application_versions
SET release_status = 'production',
    rollout_percent = 100
WHERE version = '0.42.33'
  AND release_status <> 'production';

COMMIT;
