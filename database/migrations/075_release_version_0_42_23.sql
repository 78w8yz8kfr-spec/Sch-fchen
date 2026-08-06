-- Fassung 0.42.23 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: das Dashboard nach dem Entwurf.
--
-- Begruessung mit Namen und Winkhand, darunter das volle Datum, rechts der
-- Schnellzugriff. Dann vier Kennzahlen nebeneinander und darunter "Heute im
-- Ueberblick" mit zwei Feldern: die Baustellen, auf denen heute jemand steht,
-- und das, was zuletzt im Betrieb passiert ist.
--
-- Die Kennzahlen gelten nur fuer die Planung. Ein Monteur oder Vorarbeiter
-- sieht auf seinem Dashboard weiterhin den Arbeitstag - mit der Zahl der
-- laufenden Baustellen des ganzen Betriebs kann er nichts anfangen.
--
-- Gezaehlt wird nur, was ohnehin schon geladen ist. Eine eigene Abfrage waere
-- eine zweite Quelle fuer dieselben Zahlen. Die Ueberstunden kommen aus der
-- Wochenansicht selbst: dieselbe Rechnung zweimal aufzuschreiben ist die
-- sicherste Art, zwei verschiedene Zahlen zu bekommen.
--
-- Der Schnellzugriff fuehrt nur zu Dingen, die es wirklich gibt - Baustelle,
-- Einsatz, Mitarbeiter, Kunde. Jeder Eintrag oeffnet den Bereich und klappt
-- dort das Formular auf.
--
-- Nicht enthalten: die Glocke und die Suche aus dem Entwurf. Ein Bedienelement,
-- das nichts tut, ist schlechter als keines.
--
-- Zu dieser Fassung gehoeren ein neuer Speichername des Dienst-Workers
-- (schaefchen-online-v65) und neue Fassungsangaben an allen Dateien.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.42.23', 'superseded', CURRENT_TIMESTAMP,
    'Neues Design, sechster Schritt: Dashboard mit Kennzahlen und Heute im Ueberblick.',
    '[]'::JSONB,
    '["075"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production'
  AND version <> '0.42.23';

UPDATE application_versions
SET release_status = 'production',
    rollout_percent = 100
WHERE version = '0.42.23'
  AND release_status <> 'production';

COMMIT;
