-- Fassung 0.42.20 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: die Uebersicht.
--
-- Arbeitskonto, offene Hinweise und der naechste Feiertag standen bisher im
-- Wochenbereich. Wer morgens die App aufmacht, will genau diese drei Angaben
-- sehen, ohne den Bereich zu wechseln - deshalb stehen sie jetzt auf der
-- Startseite, unter dem Arbeitstag und dem heutigen Einsatz.
--
-- Sie sind nicht doppelt: die Karten sind dieselben, sie sind umgezogen. Nur
-- der Stand des Arbeitskontos steht zweimal da - auf der Uebersicht als eine
-- Zahl, im Wochenbereich mit den Monatswerten darunter. Eine Zahl ist keine
-- Aufschluesselung.
--
-- Die Reihe steht nur da, wenn wenigstens eine Karte etwas zu sagen hat.
--
-- Ausserdem folgt die Begruessung jetzt der Uhrzeit. "Guten Morgen" stand
-- bisher zu jeder Uhrzeit da; auf einer Baustelle wird auch nachmittags und
-- nachts gearbeitet.
--
-- Zu dieser Fassung gehoeren ein neuer Speichername des Dienst-Workers
-- (schaefchen-online-v62) und neue Fassungsangaben an allen Dateien.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.42.20', 'superseded', CURRENT_TIMESTAMP,
    'Neues Design, dritter Schritt: die Uebersicht mit Arbeitskonto, offenen Hinweisen und Feiertag.',
    '[]'::JSONB,
    '["072"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production'
  AND version <> '0.42.20';

UPDATE application_versions
SET release_status = 'production',
    rollout_percent = 100
WHERE version = '0.42.20'
  AND release_status <> 'production';

COMMIT;
