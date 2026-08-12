-- Fassung 0.44.29 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: zwei Stellen, an denen das Raster nicht mitwuchs.
--
-- DREI FILTER DER PLANTAFEL WAREN AM TELEFON NICHT ZU ERREICHEN
--
-- Die Filterleiste der Plantafel stand auf `repeat(5, minmax(112px, 1fr))` -
-- fuenf Spalten zu je mindestens 112 Bildpunkten, also 560 Bildpunkte, in
-- einer Leiste, die auf dem Telefon 328 breit ist. Mitarbeiter und Team
-- passten, Baustelle, Projektleiter und Planstatus lagen ausserhalb.
--
-- Das waere allein schon haesslich gewesen. Schlimmer ist, dass `.admin-week`
-- seitlich abschneidet: die drei Felder waren nicht bloss verschoben, sie
-- waren weg. Ein Vorarbeiter konnte den Plan am Telefon nach Baustelle,
-- Projektleiter und Planstatus ueberhaupt nicht filtern - und sah auch nicht,
-- dass es die Filter gibt.
--
-- Jetzt legt `repeat(auto-fit, minmax(112px, 1fr))` so viele Filter
-- nebeneinander, wie hineinpassen, und bricht den Rest um: am Telefon zwei je
-- Zeile in drei Zeilen, am Schreibtisch weiterhin alle fuenf nebeneinander.
--
-- BESCHRIFTUNG UND FELD IM STUNDENEXPORT
--
-- Das Formular "Stundenzettel exportieren" stand auf zwei gleich breiten
-- Spalten: links die Beschriftung, rechts das Feld. In der schmalen
-- Auswertung fiel das nicht auf. Seit dieselbe Tafel im Bereich
-- "Arbeitszeiten" steht, ist sie tausend Bildpunkte breit - und "Von" stand
-- rund fuenfhundert Bildpunkte von seinem Datumsfeld entfernt.
--
-- Die Beschriftungsspalte bekommt jetzt die Breite ihres Wortes statt der
-- halben Tafel, und sobald Platz ist, stehen zwei Paare nebeneinander. Aus
-- rund fuenfhundert Bildpunkten Abstand werden zehn.
--
-- Die dafuer noetige Regel gab es schon, aber nur fuer die Auswertung. Sie
-- gilt jetzt fuer die Tafel selbst - dieselbe Tafel soll nicht an zwei Orten
-- verschieden aussehen.
--
-- Nachgemessen wurde im Browser, nicht im Stylesheet: eine Regel kann richtig
-- aussehen und trotzdem nicht greifen, weil eine zweite sie ueberschreibt.
--
-- Keine Datenbankaenderung.
--
-- Zu dieser Fassung gehoeren ein neuer Speichername des Dienst-Workers
-- (schaefchen-online-v111) und neue Fassungsangaben.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.44.29', 'superseded', CURRENT_TIMESTAMP,
    'Die Filter der Plantafel sind am Telefon wieder erreichbar; im Stundenexport steht die Beschriftung neben ihrem Feld.',
    '[]'::JSONB,
    '["135"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production' AND version <> '0.44.29';

UPDATE application_versions
SET release_status = 'production', rollout_percent = 100
WHERE version = '0.44.29' AND release_status <> 'production';

COMMIT;
