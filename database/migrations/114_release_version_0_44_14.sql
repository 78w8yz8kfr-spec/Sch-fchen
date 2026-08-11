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
    'Auf dem Lageretikett steht die Bezeichnung neben dem Code statt darüber; das Etikett wird dadurch ein Drittel flacher und es passen 64 statt 44 auf eine Seite.',
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
