-- Fassung 0.42.25 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: der Wochenstreifen und die Mitarbeiterliste nach dem
-- Entwurf.
--
-- Der Wochenstreifen zeigte bisher nur Wochentag und Tageszahl. Wer wissen
-- wollte, wann er am Dienstag angefangen hat, musste den Tag anklicken. Jetzt
-- traegt jeder Tag seine Zahlen selbst: Wochentag, Datum, ein gruener Haken
-- fuer gebuchte Tage, Kommen, Gehen und die Stunden. Wer den Streifen
-- ueberfliegt, sieht ohne Klick, wo etwas fehlt.
--
-- Der heutige Tag ist rot umrandet, nicht mehr rot gefuellt. Gefuellt zog er
-- alle Aufmerksamkeit auf sich, und die Zahlen darin waeren gegen Rot
-- schlechter zu lesen.
--
-- Am Telefon passen alle sieben Tage nebeneinander; vorher scrollte der
-- Streifen und der Sonntag war halb abgeschnitten, was aussieht wie ein
-- Fehler.
--
-- Ueber dem Streifen steht die Kalenderwoche zwischen den Pfeilen, daneben der
-- Zeitraum und der Sprung auf "Heute" - genau die Reihenfolge des Entwurfs.
--
-- Die Mitarbeiterliste traegt das Kuerzel vor dem Namen, den Saldo des Monats
-- als eigene Spalte und eine Statusmarke. Rechts daneben steht die Spalte des
-- ausgewaehlten Mitarbeiters mit Rolle, Personalnummer, Mail, Telefon und
-- Saldo. Der Saldo kommt aus dem Jahreskonto - dieselbe Zahl, die die
-- Bueroverwaltung unter "Jahreskonten" auffuehrt.
--
-- Ein echtes Bild gibt es nicht; ein erfundener Kopf waere schlimmer als zwei
-- Buchstaben. Die Qualifikationen aus dem Entwurf fehlen noch: dafuer gibt es
-- im Datenbestand kein Feld.
--
-- Zu dieser Fassung gehoeren ein neuer Speichername des Dienst-Workers
-- (schaefchen-online-v67) und neue Fassungsangaben an allen Dateien.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.42.25', 'superseded', CURRENT_TIMESTAMP,
    'Neues Design, achter Schritt: Wochenstreifen mit Zeiten und Mitarbeiterliste mit Detailspalte.',
    '[]'::JSONB,
    '["077"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production'
  AND version <> '0.42.25';

UPDATE application_versions
SET release_status = 'production',
    rollout_percent = 100
WHERE version = '0.42.25'
  AND release_status <> 'production';

COMMIT;
