-- Fassung 0.44.31 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: vier Fehler aus dem laufenden Betrieb am
-- fotografierten Lieferschein.
--
-- 1. DAS FOTO WAR ZU GROSS
--
-- Gemeldet wurde: "Die Texterkennung hat nicht funktioniert: Die
-- Texterkennung hat zu lange gebraucht."
--
-- Ein Telefon fotografiert mit zwoelf Megapixeln. Ungekuerzt sind das ueber
-- zwei Megabyte Bild, im Datenteil der Anfrage ein Drittel mehr - hochgeladen
-- ueber Mobilfunk, und danach rechnet der Server darauf.
--
-- Gemessen an einem Beleg mit Bildrauschen und Hintergrund, auf einem Kern:
--
--   4032 Bildpunkte   2,1 s   2112 KB
--   2000 Bildpunkte   0,8 s    423 KB
--   1600 Bildpunkte   0,7 s    291 KB
--   1200 Bildpunkte           <- hier faellt eine Positionszeile aus
--
-- Auf einer geteilten Instanz mit einem Bruchteil eines Kerns wird aus den
-- 2,1 Sekunden schnell das Zwanzigfache - und die Zeitgrenze lag bei zwanzig.
--
-- Das Bild geht deshalb auf 2000 Bildpunkte verkleinert los. Zweitausend ist
-- der Punkt, an dem nichts mehr zu gewinnen und noch nichts verloren ist: bei
-- 1200 laesst die Erkennung die erste Positionszeile fallen. Verkleinert wird
-- im Browser, wo das Bild ohnehin liegt; scheitert das - alter Browser, kein
-- Canvas -, geht das Original los wie bisher.
--
-- Im Browser nachgemessen: 2,06 MB auf der Platte, 0,50 MB in der Anfrage.
--
-- Die Zeitgrenze steigt zusaetzlich von zwanzig auf sechzig Sekunden. Das ist
-- das Netz darunter, kein Ersatz fuer das Verkleinern: ein Abbruch kostet den
-- ganzen Beleg, ein paar Sekunden Warten nur Geduld.
--
-- 2. DER FORTSCHRITT SAH AUS WIE EIN FEHLER
--
-- "Der Beleg wird gelesen ..." stand im roten Fehlerkasten, mit
-- `role="alert"`. Zweimal falsch: es sah aus, als waere etwas
-- schiefgegangen, und Vorleseprogramme meldeten einen Fehler, waehrend alles
-- seinen Gang ging. Jetzt eine ruhige Zeile mit `role="status"`.
--
-- 3. DIE FEHLERMELDUNG STOTTERTE
--
-- "Die Texterkennung hat nicht funktioniert: Die Texterkennung hat zu lange
-- gebraucht." Der Aufrufer setzte seinen Satz vor den Satz der Erkennung, und
-- beide fingen gleich an. Jetzt sagt der innere Teil nur noch die Ursache und
-- der aeussere, was zu tun ist.
--
-- 4. DAS DATUM VOM PAPIER VERLOR GEGEN DIE UHR
--
-- Das Lieferdatum ist mit heute vorbelegt. Die Regel "nur leere Felder
-- fuellen" sah darin ein volles Feld und verwarf das erkannte Datum - wer
-- einen Beleg von vorgestern fotografierte, buchte ihn auf heute.
--
-- Eine Vorbelegung ist aber eine Annahme der App und keine Eingabe eines
-- Menschen. Steht das Feld noch unveraendert auf dem Startwert, gewinnt das
-- Datum vom Papier; was jemand selbst getippt hat, bleibt unangetastet.
--
-- Keine Datenbankaenderung.
--
-- Zu dieser Fassung gehoeren ein neuer Speichername des Dienst-Workers
-- (schaefchen-online-v113) und neue Fassungsangaben.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.44.31', 'superseded', CURRENT_TIMESTAMP,
    'Das Lieferscheinfoto wird vor dem Senden verkleinert und läuft nicht mehr in die Zeitgrenze; das Datum vom Beleg schlägt die Vorbelegung.',
    '[]'::JSONB,
    '["137"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production' AND version <> '0.44.31';

UPDATE application_versions
SET release_status = 'production', rollout_percent = 100
WHERE version = '0.44.31' AND release_status <> 'production';

COMMIT;
