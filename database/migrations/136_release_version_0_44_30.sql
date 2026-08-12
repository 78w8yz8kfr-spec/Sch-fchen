-- Fassung 0.44.30 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: die Einstellungen nutzen die ganze Breite, und eine
-- zweite Unterzeile auf der Baustellenseite verschwindet.
--
-- DREI VON VIER REITERN WAREN HALB SO BREIT WIE DER VIERTE
--
-- Der Einstellungsbereich ist auf breiten Schirmen ein zweispaltiges Raster.
-- Alle Kinder laufen ueber beide Spalten - bis auf drei, die ausdruecklich
-- `grid-column: auto` trugen und damit eine Spalte belegten. Der Kommentar
-- daneben nannte den Grund: "Die drei Verwaltungsbereiche liegen
-- gleichrangig nebeneinander."
--
-- Das stimmte einmal. Seit die Einstellungen Reiter haben, ist immer genau
-- einer davon zu sehen, und eine einzelne Tafel in einem zweispaltigen Raster
-- nimmt die halbe Breite und laesst die andere Haelfte leer.
--
-- Gemessen bei 1280 Bildpunkten Fensterbreite:
--
--   Arbeitskonten   500 Bildpunkte
--   Feiertage       500
--   Zeitregeln      500
--   Mein Konto     1016   <- hat die Regel nie getragen
--
-- Vier Reiter derselben Leiste, drei davon halb so breit wie der vierte. Das
-- sah nach einem Fehler aus, weil es einer war. Jetzt sind es vier mal 1016,
-- und die Jahreskonten haben wieder Platz fuer Name, Personalnummer, Urlaub,
-- Abbau und Stand in einer Zeile.
--
-- EINE UNTERZEILE ZU VIEL AUF DER BAUSTELLENSEITE
--
-- Ueber der Seite stand "Aktive und archivierte Baustellen durchsuchen und
-- bearbeiten." und direkt darunter "Baustellen direkt anlegen oder gesammelt
-- aus Excel uebernehmen." - zwei graue Zeilen uebereinander, von denen die
-- zweite etwas ankuendigte, das erst hinter einem Knopf beginnt.
--
-- Der Hinweis auf den Excel-Import ist nicht verlorengegangen, sondern
-- dorthin gezogen, wo der Import auch steht: in das Formular "Baustelle
-- anlegen". Wer es oeffnet, liest ihn dort - und nicht mehr weit weg von der
-- Stelle, die er meint.
--
-- Keine Datenbankaenderung.
--
-- Zu dieser Fassung gehoeren ein neuer Speichername des Dienst-Workers
-- (schaefchen-online-v112) und neue Fassungsangaben.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.44.30', 'superseded', CURRENT_TIMESTAMP,
    'Die Einstellungen nutzen in allen Reitern die volle Breite; die Baustellenseite trägt nur noch eine Unterzeile.',
    '[]'::JSONB,
    '["136"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production' AND version <> '0.44.30';

UPDATE application_versions
SET release_status = 'production', rollout_percent = 100
WHERE version = '0.44.30' AND release_status <> 'production';

COMMIT;
