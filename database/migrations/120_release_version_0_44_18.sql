-- Fassung 0.44.18 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: das Fundament der durchgaengigen Materialkette.
-- Fahrzeuge sind Lagerorte, verbautes Material wird ausgebucht, und eine
-- Bestellung kennt ihr Lieferziel.
--
-- 1. FAHRZEUGE SIND LAGERORTE. Der Transporter ist der haeufigste Lagerort im
-- Betrieb: morgens beladen, abends halb leer, und niemand wusste, was drin
-- liegt. Er ist jetzt ein Ort wie das Regal, haengt aber am Fuhrpark und
-- traegt kein zweites Kennzeichen. Dazu kommen Retouren- und Sperrlager: was
-- zum Lieferanten zurueck soll oder beschaedigt ist, darf im normalen Bestand
-- nicht mitgezaehlt werden, sonst greift jemand danach.
--
-- 2. VERBAUT. "Auf der Baustelle" und "verbaut" sind zwei verschiedene Dinge,
-- und die Verwechslung ist der haeufigste Fehler in der Materialabrechnung.
-- Bisher verschwand Material von der Baustelle nur durch Rueckgabe oder
-- Umbuchung; was verbaut war, stand weiter im Baustellenbestand. Die neue
-- Buchung "Verbaut" bucht es aus - mit Quelle, ohne Ziel, denn verbaut ist
-- verbaut. Buchen darf sie der Monteur: er weiss es zuerst.
--
-- Bewusst nicht gerechnet wird "Verbrauch = geliefert minus zurueck". Sobald
-- eine Umbuchung auf eine zweite Baustelle dazwischen liegt, ist die Formel
-- falsch, und auf einer laufenden Baustelle ist sie immer zu frueh: was heute
-- im Container steht, ist nicht verbraucht.
--
-- 3. LIEFERZIEL. Eine Bestellung ging bisher an einen Lieferanten und sonst
-- nirgendwohin. Die Direktlieferung auf die Baustelle - bei groesseren Mengen
-- der Normalfall - liess sich nicht planen. Sie traegt jetzt Lieferziel,
-- Projekt und Baustelle, alle drei freiwillig.
--
-- Der Verlauf darf ausserdem von einer Bewegung sprechen und kennt die Belege
-- der naechsten Stufen (Lieferschein, Reservierung) bereits als Gegenstand.
--
-- Bestehende Daten bleiben unberuehrt: alle Spalten sind neu und freiwillig,
-- keine Bewegung und kein Ort wird umgeschrieben.
--
-- Zu dieser Fassung gehoeren Migration 119, ein neuer Speichername des
-- Dienst-Workers (schaefchen-online-v100) und neue Fassungsangaben.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.44.18', 'superseded', CURRENT_TIMESTAMP,
    'Fahrzeuge sind Lagerorte, verbautes Material wird von der Baustelle ausgebucht, und eine Bestellung kennt ihr Lieferziel.',
    '[]'::JSONB,
    '["119", "120"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production'
  AND version <> '0.44.18';

UPDATE application_versions
SET release_status = 'production',
    rollout_percent = 100
WHERE version = '0.44.18'
  AND release_status <> 'production';

COMMIT;
