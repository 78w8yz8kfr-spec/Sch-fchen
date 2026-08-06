-- Fassung 0.42.32 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: freigegebene Bereiche kommen ohne Neuladen an.
--
-- Gemeldet wurde es am Fuhrpark: in der Plattformverwaltung eingeschaltet, in
-- der App trotzdem nicht da. Der Fehler lag nicht am Fuhrpark. Die Liste der
-- freigegebenen Bereiche kam bisher nur beim Anmelden mit. Wird danach etwas
-- freigeschaltet, laesst der Server es sofort zu - die App aber weiss nichts
-- davon und blendet den Eintrag weiter aus. Erst ein vollstaendiges Neuladen
-- brachte ihn. Auf einem Telefon mit eingerichteter App passiert das tagelang
-- nicht; dort heisst "erst nach dem Neuladen" in der Praxis "gar nicht".
--
-- Die App fragt den Stand jetzt nach: beim Zurueckkommen aus dem Hintergrund,
-- beim Wiederfinden der Verbindung und alle fuenf Minuten. Haeufiger braucht
-- es nicht - eine Freigabe muss nicht sekundengenau ankommen.
--
-- Es gilt in beide Richtungen. Wird ein Bereich abgeschaltet, waehrend jemand
-- darin steht, wird er auf die Startseite gesetzt: der Bildschirm waere sonst
-- noch da, die Schnittstelle dahinter aber schon gesperrt.
--
-- Bleibt die Antwort aus - offline, Serverfehler -, bleibt der bekannte Stand
-- stehen. Bereiche wegzunehmen, nur weil gerade niemand antwortet, waere
-- schlimmer als eine Liste, die eine Weile alt ist.
--
-- Zu dieser Fassung gehoeren ein neuer Speichername des Dienst-Workers
-- (schaefchen-online-v74) und neue Fassungsangaben an allen Dateien.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.42.32', 'superseded', CURRENT_TIMESTAMP,
    'Freigegebene Bereiche kommen ohne vollstaendiges Neuladen in der App an.',
    '[]'::JSONB,
    '["087"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production'
  AND version <> '0.42.32';

UPDATE application_versions
SET release_status = 'production',
    rollout_percent = 100
WHERE version = '0.42.32'
  AND release_status <> 'production';

COMMIT;
