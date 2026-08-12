-- Fassung 0.44.32 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: der Server verkleinert das Belegfoto selbst.
--
-- WARUM NOCH EINMAL
--
-- Fassung 0.44.31 liess den Browser verkleinern. Im Betrieb kam trotzdem
-- wieder "das Bild war zu gross oder der Server zu langsam" - dieselbe Stelle,
-- eine Fassung spaeter. Die Annahme, der Browser koenne das zuverlaessig, war
-- falsch: ein Telefon liefert HEIC statt JPEG, ein aelterer Browser kennt kein
-- Canvas, und bei sehr grossen Bildern misslingt das Zeichnen still. In allen
-- drei Faellen ging das Original los, genau wie vorher.
--
-- Deshalb steht die Verkleinerung jetzt dort, wo sie nicht ausweichen kann:
-- vor der Erkennung, auf dem Server. Der Browser verkleinert weiterhin, aber
-- nur noch, um Daten auf dem Weg zu sparen - nicht mehr als einzige Sicherung.
--
-- DER JPEG-HINWEIS IST DER GANZE TRICK
--
-- Gemessen an einem Beleg mit 48 Megapixeln (was ein neueres iPhone liefert),
-- auf einem Kern:
--
--   direkt an die Texterkennung                   6,5 s
--   verkleinern, dann erkennen                    5,4 s
--   verkleinern MIT `jpeg:size`, dann erkennen    1,6 s
--
-- Ohne den Hinweis dekodiert die Bibliothek erst das ganze Bild und wirft dann
-- neun Zehntel weg. Mit ihm springt libjpeg beim Dekodieren gleich auf die
-- naechstkleinere Stufe. Viermal schneller als der Stand vor dieser Fassung -
-- und auf einer geteilten Instanz ist das der Unterschied zwischen einer
-- Erkennung und einem Abbruch.
--
-- Nachgemessen mit einem unverkleinerten 5,9-MB-Foto direkt am Endpunkt,
-- also genau in dem Fall, der im Betrieb scheiterte: 1,5 Sekunden, Nummer,
-- Datum und beide Positionen richtig.
--
-- NEBENBEI: HEIC
--
-- Tesseract liest HEIC ueberhaupt nicht. ImageMagick oeffnet es und gibt ein
-- JPEG weiter. Ein Foto, das bis hierher gar nicht zu lesen war, wird damit
-- lesbar - ohne dass jemand am Telefon eine Einstellung aendern muss.
--
-- WENN DAS WERKZEUG FEHLT
--
-- Dann geht der Beleg unverkleinert weiter wie bisher, und der Grund steht in
-- der Fehlermeldung, falls es doch zu lange dauert. Ein grosses Bild ist
-- langsam, ein fehlendes ist nutzlos.
--
-- Die Groessengrenze steigt von acht auf zwanzig Megabyte. Sie stammte aus der
-- Zeit, als der Server ein grosses Bild nicht verarbeiten konnte; seit er
-- verkleinert, kostet ein grosses Foto rund eine Sekunde mehr statt eines
-- Abbruchs.
--
-- Keine Datenbankaenderung.
--
-- Zu dieser Fassung gehoeren ImageMagick im Auslieferungsimage, ein neuer
-- Speichername des Dienst-Workers (schaefchen-online-v114) und neue
-- Fassungsangaben.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.44.32', 'superseded', CURRENT_TIMESTAMP,
    'Der Server bringt das Belegfoto selbst auf Arbeitsmaß, bevor er es liest — viermal schneller und unabhängig davon, was das Telefon schickt.',
    '["Ohne ImageMagick im Image geht der Beleg unverkleinert in die Erkennung; der Grund steht dann in der Fehlermeldung."]'::JSONB,
    '["138"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production' AND version <> '0.44.32';

UPDATE application_versions
SET release_status = 'production', rollout_percent = 100
WHERE version = '0.44.32' AND release_status <> 'production';

COMMIT;
