-- Fassung 0.44.22 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: die schnelle Rueckgabe von der Baustelle, das Storno
-- als Gegenbuchung (Migration 126) und die Historie mit Filtern.
--
-- 1. RUECKGABE OHNE SCANNER. Was abends zurueckgeht, liegt in einer Kiste im
-- Transporter, oft ohne lesbaren Code - und der Monteur weiss genau, was er
-- dabei hat. Er sieht deshalb, was auf seiner Baustelle gebucht ist, und
-- traegt nur die Rueckgabemenge ein; leere Felder heissen "nichts davon".
-- Vorbelegt wird bewusst nichts: eine vorgeschlagene Menge waere eine
-- Behauptung darueber, was uebrig ist, und die stimmt nie.
--
-- Je Zeile entsteht eine eigene Buchung mit eigener Vorgangsnummer. Faellt
-- eine durch, stehen die anderen trotzdem; was ohne Netz scheitert, geht in
-- die Warteschlange. Eine Sammelbuchung waere bequemer gewesen und haette bei
-- einem einzigen Fehler alles verworfen - im Funkloch der Normalfall.
--
-- 2. STORNO IST EINE GEGENBUCHUNG. Nicht das Loeschen einer Zeile: das
-- Journal bleibt vollstaendig, und wer spaeter fragt, sieht beides - den
-- Fehler und seine Korrektur. Wer entnehmen darf, darf seinen eigenen
-- Vertipper zuruecknehmen; dafuer erst das Buero holen zu muessen waere der
-- sichere Weg zu einer zweiten, falschen Buchung "zum Ausgleich".
--
-- Zweimal stornieren geht nicht. Gesichert nicht durch eine Sperre, sondern
-- durch einen eindeutigen Index (Migration 126): die API-Rolle darf im Journal
-- nur lesen und anfuegen - kein UPDATE, kein DELETE, und damit auch kein
-- SELECT ... FOR UPDATE. Diese Beschraenkung ist der Grund, warum niemand eine
-- gebuchte Zeile still veraendern kann, und der Index haelt ausserdem bei zwei
-- gleichzeitigen Klicks.
--
-- 3. DIE HISTORIE laesst sich nach Artikel, Ort, Baustelle, Mitarbeiter,
-- Buchungsart und Zeitraum filtern und traegt die Belege mit: zu jeder Buchung
-- der Lieferschein und die Bestellung, aus denen sie stammt.
--
-- Zu dieser Fassung gehoeren Migration 126, ein neuer Speichername des
-- Dienst-Workers (schaefchen-online-v104) und neue Fassungsangaben.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.44.22', 'superseded', CURRENT_TIMESTAMP,
    'Restmaterial lässt sich ohne Scanner aus dem Baustellenbestand zurückgeben; Fehlbuchungen werden gegengebucht statt gelöscht, und die Historie lässt sich filtern.',
    '[]'::JSONB,
    '["126", "127"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production' AND version <> '0.44.22';

UPDATE application_versions
SET release_status = 'production', rollout_percent = 100
WHERE version = '0.44.22' AND release_status <> 'production';

COMMIT;
