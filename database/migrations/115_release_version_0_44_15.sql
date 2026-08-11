-- Fassung 0.44.15 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: einzelne Lagerplatzetiketten, und Artikel lassen sich
-- endlich aendern.
--
-- Erstens gab es bei den Lagerplaetzen nur "alle auf einmal". Wer nachtraeglich
-- ein Fach beschriftet, druckte damit den ganzen Satz. Die Lagerplaetze
-- bekommen deshalb dieselben Kaestchen wie die Artikel: anhaken, drucken. Der
-- Knopf "alle auswaehlen" bleibt daneben, denn beim ersten Einrichten will man
-- wirklich alle.
--
-- Das Kaestchen und die Zeile bleiben zwei verschiedene Griffe: die Zeile setzt
-- den Lagerplatz fuer die naechste Buchung, das Kaestchen waehlt fuers Etikett.
-- Stuende beides am selben Element, koennte man nichts anhaken, ohne
-- wegzuspringen.
--
-- Zweitens liess sich ein Artikel nach dem Anlegen nicht mehr aendern. Ein
-- Vertipper in der Bezeichnung war dauerhaft, ein Mindestbestand nicht
-- nachtraeglich zu setzen, und das Gebinde aus Fassung 0.44.12 nur beim
-- Anlegen. Der Endpunkt dafuer stand seit derselben Fassung bereit - die
-- Oberflaeche hat ihn nur nie benutzt. Jetzt fuehrt "Artikel aendern" aus der
-- Buchansicht ins bekannte Formular.
--
-- Drei Felder bleiben dort gesperrt: Artikelnummer, Einheit und Warengruppe.
-- Die Nummer steht auf gedruckten Etiketten, und die Einheit zu aendern wuerde
-- jeden gebuchten Bestand still umdeuten - aus 120 Metern wuerden 120 Stueck.
-- Das waere keine Aenderung, sondern ein neuer Artikel. Sie stehen trotzdem da,
-- nur nicht zum Anfassen: wer sie sucht, soll sie sehen und nicht raten, wo sie
-- geblieben sind.
--
-- Zwei Leute im Buero, die denselben Artikel gleichzeitig offen haben,
-- ueberschreiben sich nicht: die Fassungsnummer des Datensatzes geht mit und
-- der zweite bekommt eine Meldung statt eines stillen Verlusts.
--
-- Keine Datenbankaenderung: die Spalten und der Endpunkt stehen seit 0.44.12.
--
-- Zu dieser Fassung gehoeren ein neuer Speichername des Dienst-Workers
-- (schaefchen-online-v97) und neue Fassungsangaben an allen Dateien.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.44.15', 'superseded', CURRENT_TIMESTAMP,
    'Einzelne Lagerplätze lassen sich beschriften, und Artikel lassen sich nachträglich ändern — Bezeichnung, Mindestbestand und Gebinde.',
    '[]'::JSONB,
    '["115"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production'
  AND version <> '0.44.15';

UPDATE application_versions
SET release_status = 'production',
    rollout_percent = 100
WHERE version = '0.44.15'
  AND release_status <> 'production';

COMMIT;
