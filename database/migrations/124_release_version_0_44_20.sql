-- Fassung 0.44.20 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: Reservierungen (Migration 123). Was zurueckgelegt
-- ist, geht vom Bestand ab.
--
-- Ohne sie beantwortet das Lager nur "wie viel liegt hier". Die Frage, an der
-- der Betrieb haengt, ist eine andere: wie viel davon kann ich mitnehmen? Wer
-- am Montag 100 Steckdosen fuer die Schule zurueckgelegt hat und am Dienstag
-- feststellt, dass ein Kollege sie fuer eine andere Baustelle geholt hat,
-- steht mit einem leeren Karton da - und der Bestand war die ganze Zeit
-- "richtig".
--
-- FREI VERFUEGBAR = PHYSISCH MINUS RESERVIERT. Der physische Bestand aendert
-- sich durch eine Reservierung nicht: die Ware liegt weiter im Regal, sie ist
-- nur nicht mehr fuer jeden da. Erst die Entnahme bewegt sie. Deshalb stehen
-- Reservierung und Bewegung in zwei Tabellen - eine Reservierung als Bewegung
-- zu buchen haette im Journal eine Entnahme erzeugt, die nie stattfand.
--
-- WER FUER SEINE BAUSTELLE HOLT, BAUT SEINE RESERVIERUNG AB, statt an ihr zu
-- scheitern. Sonst stuende jede Reservierung sich selbst im Weg - der
-- haeufigste Grund, warum solche Funktionen im Alltag wieder abgeschaltet
-- werden. Ein Dritter dagegen kommt nur an das Freie und erfaehrt im Klartext,
-- fuer welche Baustelle der Rest liegt.
--
-- Dazu der Meldebestand: er liegt zwischen Mindest- und Zielbestand, damit
-- nachbestellt wird, bevor der Mindestbestand unterschritten ist. Fehlt er,
-- bleibt es beim Mindestbestand, und alle bestehenden Artikel verhalten sich
-- wie bisher.
--
-- Zu dieser Fassung gehoeren Migration 123, ein neuer Speichername des
-- Dienst-Workers (schaefchen-online-v102) und neue Fassungsangaben.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.44.20', 'superseded', CURRENT_TIMESTAMP,
    'Reservierungen: was für eine Baustelle zurückgelegt ist, geht vom frei verfügbaren Bestand ab und kann von niemand anderem geholt werden.',
    '[]'::JSONB,
    '["123", "124"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production' AND version <> '0.44.20';

UPDATE application_versions
SET release_status = 'production', rollout_percent = 100
WHERE version = '0.44.20' AND release_status <> 'production';

COMMIT;
