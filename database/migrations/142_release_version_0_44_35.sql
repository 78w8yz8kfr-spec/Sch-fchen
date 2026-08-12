-- Fassung 0.44.35 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: die Lagerverwaltung ist abgeschafft.
--
-- Sie kam mit Fassung 0.44.11 und Migration 107 und wuchs bis 0.44.34 ueber
-- vierundzwanzig Fassungen: Artikelstamm, Lagerplaetze, Bewegungsjournal mit
-- Bestandsfortschreibung, Strichcodes und Etiketten, Inventur, Bestellwesen,
-- Lieferscheine, Reservierungen, Fahrzeug- und Retourenlager, die Verknuepfung
-- mit der Baustellenliste und zuletzt die Texterkennung auf fotografierten
-- Belegen.
--
-- Der Betrieb hat entschieden, sie wieder abzuschaffen. Migration 141 nimmt
-- die Datenbank zurueck, diese Fassung traegt es ins Verzeichnis ein.
--
-- WAS VERSCHWINDET
--
--   - Der Bereich "Lager & Material" samt Navigationseintrag
--   - Alle Endpunkte unter /api/v1/stock
--   - Der Modulschluessel 'warehouse' im Katalog der Plattform
--   - Die Rolle "Lagerist" (stillgelegt, nicht geloescht: widerrufene
--     Zuweisungen zeigen darauf, und wer wann welche Berechtigung hatte,
--     ist Personalgeschichte und nicht Teil des Lagers)
--   - Vierzehn Tabellen mit allem, was darin gebucht war
--   - Der Strichcodeleser, die Etikettenbogen und die Werkbank
--   - Tesseract und ImageMagick aus dem Auslieferungsimage
--
-- WAS BLEIBT
--
-- Die Materialliste der Baustelle. Sie gab es vor dem Lager, sie haengt am
-- eigenen Modulschluessel 'materials' und sie fuehrt ihre Zeilen mit Menge
-- und Stand weiter. Nur die Bestandsanzeige darunter faellt weg - es gibt
-- keinen Bestand mehr, auf den sie zeigen koennte.
--
-- Ebenfalls unberuehrt: die Geraeteverwaltung. Ein Geraet ist ein Einzelstueck
-- mit einem Besitzer, Lagermaterial waren Mengen an einem Ort - zwei
-- verschiedene Dinge, die sich nur den Namen "Inventar" teilen.
--
-- Zu dieser Fassung gehoeren Migration 141, ein neuer Speichername des
-- Dienst-Workers (schaefchen-online-v117) und neue Fassungsangaben.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.44.35', 'superseded', CURRENT_TIMESTAMP,
    'Die Lagerverwaltung ist abgeschafft: Bereich, Endpunkte, Rolle und Daten sind entfernt. Die Materialliste der Baustelle bleibt.',
    '["Gebuchte Bestände, Bewegungen, Lieferscheine und Bestellungen sind mit Migration 141 gelöscht und nur aus einer älteren Sicherung wiederherstellbar."]'::JSONB,
    '["141", "142"]'::JSONB, 100, TRUE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production' AND version <> '0.44.35';

UPDATE application_versions
SET release_status = 'production', rollout_percent = 100
WHERE version = '0.44.35' AND release_status <> 'production';

COMMIT;
