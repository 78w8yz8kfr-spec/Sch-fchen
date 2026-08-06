-- Fassung 0.42.19 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: Listen werden am Rechner zu Tabellen.
--
-- Mitarbeiter und Baustellen standen bisher auch auf 1440 Pixeln so da wie auf
-- dem Telefon: Name fett, darunter alle Angaben in einer Zeile mit
-- Mittelpunkten dazwischen. Wer zwoelf Mitarbeiter nach einer Telefonnummer
-- durchsucht, muss dabei jede Zeile lesen. Ab dieser Fassung steht am Rechner
-- eine Kopfzeile darueber und jede Angabe in ihrer Spalte - man faehrt die
-- Spalte mit den Augen ab und ist fertig.
--
-- Kopfzeile und Datenzeilen lesen dieselbe Spaltenangabe, damit sie nicht
-- auseinanderlaufen koennen. Die Spalte fuer "Bearbeiten" beziehungsweise
-- "Oeffnen" ist fest breit: waere sie automatisch breit, haetten Zeilen ohne
-- Schaltflaeche dort null Pixel und alle uebrigen Spalten wuerden gegenueber
-- der Kopfzeile verrutschen.
--
-- Auf dem Telefon bleibt alles, wie es war: dieselben Angaben gestapelt unter
-- dem Namen, leere Angaben fallen weg, die Statusmarke bekommt eine eigene
-- Zeile. Fuer Spalten ist dort kein Platz, und die Reihenfolge sagt genug.
--
-- Die Baustellenliste bekommt dafuer die volle Breite des Bildschirms; sie
-- stand bisher in einer 511 Pixel schmalen Spalte neben der Berichtszentrale,
-- in der eine Tabelle nur abgeschnitten haette werden koennen.
--
-- Zu dieser Fassung gehoeren ein neuer Speichername des Dienst-Workers
-- (schaefchen-online-v61) und neue Fassungsangaben an allen Dateien.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.42.19', 'superseded', CURRENT_TIMESTAMP,
    'Neues Design, zweiter Schritt: Mitarbeiter- und Baustellenliste als Tabelle am Rechner.',
    '[]'::JSONB,
    '["071"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production'
  AND version <> '0.42.19';

UPDATE application_versions
SET release_status = 'production',
    rollout_percent = 100
WHERE version = '0.42.19'
  AND release_status <> 'production';

COMMIT;
