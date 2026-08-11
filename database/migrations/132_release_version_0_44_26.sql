-- Fassung 0.44.26 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: ein fotografierter Lieferschein wird gelesen.
--
-- Erkannt wird mit Tesseract, das ab dieser Fassung im Produktionsimage
-- mitliegt - samt deutschem Sprachpaket, ohne das die Erkennung
-- "Lieferschein-Nr." nicht als Beschriftung erkennt. Kein Dienst im Netz: ein
-- Lieferschein nennt Lieferant, Mengen und Preise und verlaesst das Haus
-- nicht.
--
-- WAS GELESEN WIRD UND WAS NICHT
--
-- Gelesen wird der Kopf des Belegs: Lieferscheinnummer und Datum. Die
-- Positionen tippt weiterhin ein Mensch.
--
-- Das ist keine Sparsamkeit. Ein abfotografierter Lieferschein ist selten ein
-- sauberes Blatt - geknickt, im Thermodruck verblasst, schraeg gehalten. In
-- den Proben las Tesseract auf einem geraden, scharfen Bild Nummer und Datum
-- fehlerfrei, machte in derselben Aufnahme aber aus "NYM-J" ein "NYM-)". Eine
-- falsch erkannte Menge saehe aus wie eine Eingabe, wuerde gebucht und fiele
-- erst bei der Inventur auf. Eine falsch erkannte Nummer faellt sofort auf,
-- weil sie neben dem Papier steht, das der Fahrer dagelassen hat.
--
-- Auf einem schiefen, unscharfen Foto liest die Erkennung die Beschriftung
-- noch richtig und die Nummer daneben schon falsch - aus "LS-2026-004711"
-- wird "15-2026". Deshalb wird eine gelesene Nummer verworfen, wenn sie zu
-- wenige Ziffern hat oder sich als Datum liest, und die Felder werden nur
-- vorgeschlagen, nie gebucht. Der erkannte Text steht vollstaendig daneben:
-- wer sieht, was das Programm gelesen hat, versteht sofort, warum ein Feld
-- leer blieb.
--
-- Uebernommen wird nur, was leer ist. Wer schon getippt hat, bekommt seine
-- Eingabe nicht ueberschrieben.
--
-- Gespeichert wird beim Lesen nichts: das Bild geht durch die Erkennung und
-- ist danach weg. Wer es aufheben will, legt es als Dokument ab - dort, wo
-- alle anderen Belege liegen.
--
-- Faellt Tesseract aus, scheitert diese eine Anfrage und nicht der
-- Wareneingang; erfasst wird dann von Hand wie bisher.
--
-- Keine Datenbankaenderung.
--
-- Zu dieser Fassung gehoeren ein neuer Speichername des Dienst-Workers
-- (schaefchen-online-v108) und neue Fassungsangaben.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.44.26', 'superseded', CURRENT_TIMESTAMP,
    'Ein Foto des Lieferscheins füllt Nummer und Datum aus; die Positionen bleiben Handarbeit.',
    '["Bei schiefen oder unscharfen Fotos bleiben die Felder leer. Der erkannte Text steht daneben, damit sichtbar ist, warum."]'::JSONB,
    '["132"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production' AND version <> '0.44.26';

UPDATE application_versions
SET release_status = 'production', rollout_percent = 100
WHERE version = '0.44.26' AND release_status <> 'production';

COMMIT;
