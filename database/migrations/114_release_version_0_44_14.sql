-- Fassung 0.44.14 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: die Bezeichnung steht neben dem Code, nicht darueber.
--
-- Auf dem Etikett stand die Bezeichnung bisher quer ueber dem Code. Das kostete
-- eine ganze Zeile Hoehe fuer etwas, das daneben Platz hat: "NYM-J 5x1,5mm2"
-- braucht keine eigene Etage. Jetzt steht links der Code und rechts daneben
-- alles zum Lesen - Bezeichnung, Artikelnummer, Herstellernummer.
--
-- Das Etikett wird dadurch ein Drittel flacher: 48 mal 17 statt 48 mal 25
-- Millimeter. Auf eine A4-Seite passen sechzehn Reihen statt elf, also 64
-- Etiketten statt 44. Der Code bleibt bei zwoelf Millimetern - an seiner
-- Groesse haengt, ob die Kamera ihn liest, und die Grenze war schon erreicht.
--
-- Ausserdem gab es keinen Weg zum Etikettenbogen. Drucken liess sich nur ein
-- einzelnes Etikett, und dafuer musste man drei Ebenen tief: Artikel, Artikel
-- antippen, "Codes und Etikett". Ein Bogen fuer 64 Etiketten, den niemand
-- fuellen kann, ist kein Bogen. Die Artikelliste bekommt deshalb ein Kaestchen
-- je Zeile, "Alle auswaehlen" und einen Knopf, der sagt, wie viele gedruckt
-- werden. Ohne Auswahl ist er abgeschaltet - ein Knopf, der einen leeren Bogen
-- erzeugt, waere eine Falle. Ueber 120 sagt er es, bevor die Schnittstelle
-- ablehnt. Die Lagerplaetze gehen in einem Rutsch: die beschriftet man
-- ohnehin alle auf einmal.
--
-- Dazu eine Kleinigkeit fuer die Ansicht am Telefon: der Druckbogen bekommt
-- eine feste Fensterbreite in Hoehe der A4-Seite. Ohne sie zeigte ein Telefon
-- eine vergroesserte Ecke des Bogens, und niemand konnte beurteilen, was da
-- gleich aus dem Drucker kommt. Auf den Druck selbst hat es keinen Einfluss;
-- dafuer gilt @page.
--
-- Keine Datenbankaenderung: der Bogen entsteht im Browser.
--
-- Zu dieser Fassung gehoeren ein neuer Speichername des Dienst-Workers
-- (schaefchen-online-v96) und neue Fassungsangaben an allen Dateien.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.44.14', 'superseded', CURRENT_TIMESTAMP,
    'Auf dem Lageretikett steht die Bezeichnung neben dem Code statt darüber; es passen 64 statt 44 auf eine Seite. Aus der Artikelliste lassen sich mehrere Etiketten auf einmal drucken, Lagerplätze in einem Rutsch.',
    '[]'::JSONB,
    '["114"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production'
  AND version <> '0.44.14';

UPDATE application_versions
SET release_status = 'production',
    rollout_percent = 100
WHERE version = '0.44.14'
  AND release_status <> 'production';

COMMIT;
