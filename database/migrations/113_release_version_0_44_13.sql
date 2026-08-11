-- Fassung 0.44.13 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: das eigene Lageretikett sieht aus wie ein
-- Herstelleraufkleber.
--
-- Bisher war es ein Quadrat aus dem Geraetemodul: 18 mal 18 Millimeter Code
-- und darunter zwei winzige Zeilen. Fuer eine Inventarnummer reicht das, fuer
-- einen Artikel nicht. Wer im Regal steht, will die Bezeichnung lesen koennen,
-- ohne das Etikett zu scannen - und genau dann, wenn die Kamera einmal nicht
-- mitspielt, ist das der Unterschied zwischen "Schalterdose tief" und einem
-- schwarzen Quadrat.
--
-- Das neue Etikett folgt dem, was im Betrieb ohnehin auf den Kartons klebt:
-- oben die Bezeichnung ueber zwei Zeilen, darunter links der Code und rechts
-- daneben die Nummern. Beim Artikel "Art.-Nr." und darunter der Hersteller
-- samt seiner Nummer - danach sucht, wer nachbestellt. Beim Lagerplatz steht
-- statt der Artikelnummer der ganze Pfad, denn "Fach A1" gibt es im
-- Materiallager und in der Werkstatt.
--
-- Daraus folgt das Format: 48 mal 25 Millimeter quer, vier Spalten und elf
-- Reihen auf A4, 15 Millimeter je Code. Ueber 44 Etiketten hinaus wird
-- geblaettert statt abgeschnitten. Der Geraetebogen bleibt unveraendert bei
-- seinen 120 kleinen Quadraten.
--
-- Die Bezeichnung bekommt genau zwei Zeilen mit fester Hoehe. Ein langer Name
-- darf den Code nicht aus dem Etikett schieben, und eine dritte, halb
-- abgeschnittene Zeile sieht nach Fehler aus.
--
-- Dabei kam ein Fehler ans Licht, den es schon vorher gab und den niemand
-- bemerkt hatte: der Druckbogen kam voellig unformatiert an. Schaefchen laeuft
-- unter `style-src 'self'`, das Druckfenster erbt diese Regel, und ein
-- eingebetteter <style>-Block wird davon verworfen - ohne Fehlermeldung, nur
-- mit einer Notiz in der Browserkonsole. Gedruckt wurde eine Liste riesiger
-- Codes ueber ganze Seiten. Dasselbe traf den Geraetebogen und das
-- Geraeteeinzeletikett; dort lief zusaetzlich das eingebettete Skript nicht,
-- sodass Name und Inventarnummer fehlten. Die Stile liegen jetzt als eigene
-- Dateien von der eigenen Herkunft bei, und die Beschriftung setzt das
-- Hauptfenster. Beide Bogen sind dadurch auch offline druckbar.
--
-- Keine Datenbankaenderung: der Etikettendruck setzt den Bogen im Browser
-- zusammen, die Schnittstelle liefert nur die Bilder und die Beschriftung.
-- Neu ist dort allein die dritte Zeile.
--
-- Ausserdem bestaetigt: das Kamera-Livebild des Lagerscanners laeuft am
-- echten Geraet. Im In-App-Browser mancher Anwendungen liefert getUserMedia
-- weiterhin kein Bild; dort fangen Foto und Handeingabe es ab.
--
-- Zu dieser Fassung gehoeren ein neuer Speichername des Dienst-Workers
-- (schaefchen-online-v95) und neue Fassungsangaben an allen Dateien.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.44.13', 'superseded', CURRENT_TIMESTAMP,
    'Selbst gedruckte Lageretiketten tragen Bezeichnung, Artikelnummer und Herstellernummer neben dem Code — lesbar, ohne zu scannen. Druckbogen kommen wieder formatiert an.',
    '[]'::JSONB,
    '["113"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production'
  AND version <> '0.44.13';

UPDATE application_versions
SET release_status = 'production',
    rollout_percent = 100
WHERE version = '0.44.13'
  AND release_status <> 'production';

COMMIT;
