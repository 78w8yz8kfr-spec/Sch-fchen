-- Fassung 0.44.36 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: die Baustromverteiler bekommen einen eigenen Bereich.
--
-- WAS ER BEANTWORTET
--
-- Nicht "welche Verteiler haben wir" - das steht in der Geraeteliste. Sondern
-- die vier Fragen, die auf der Baustelle taeglich gestellt werden:
--
--   1. Welche Pruefung ist abgelaufen? (DGUV V3, vierteljaehrlich)
--   2. Wo muss diesen Monat die Prueftaste gedrueckt werden?
--   3. Was steht auf dem Zaehler - und was hat die Baustelle verbraucht?
--   4. Wo steht welcher Verteiler?
--
-- Die Liste sortiert deshalb nach Dringlichkeit und nicht nach Nummer, und
-- jede Zeile traegt die Farbe ihrer schlimmeren Frist.
--
-- WARUM ZWEI FRISTEN UND NICHT EINE
--
-- Der monatliche Druck auf die Prueftaste ist keine Pruefung im Sinne der
-- DGUV V3. Er ersetzt die vierteljaehrliche Pruefung durch die Elektrofachkraft
-- nicht und darf ihren Termin nicht verschieben. Migration 143 fuehrt ihn
-- deshalb in einer eigenen Tabelle und nicht in `device_inspections`.
--
-- WO ER STEHT
--
-- Am Telefon unter "Maschinen & Geraete" als Karte - dort sucht ihn der
-- Monteur, und die Leiste unten hat keinen Platz fuer einen weiteren Eintrag.
-- Am Rechner als eigener Punkt in der Seitenleiste, weil dort Platz ist und
-- der Bereich fuer den Buerodienst eine eigene Aufgabe ist.
--
-- Stammdaten bleiben, wo sie sind: angelegt wird ein Verteiler in der
-- Geraeteverwaltung mit der Kategorie "Baustromverteiler". Dieser Bereich legt
-- nichts an - er zeigt Fristen und nimmt Aufzeichnungen entgegen.
--
-- Zu dieser Fassung gehoeren Migration 143, ein neuer Speichername des
-- Dienst-Workers (schaefchen-online-v118) und neue Fassungsangaben.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.44.36', 'superseded', CURRENT_TIMESTAMP,
    'Neuer Bereich Baustrom: Prüffristen mit Ampel, monatlicher FI-Test, Zählerstände mit Anlass und Baustelle sowie der Standort jedes Verteilers.',
    '["Zählerstände und FI-Tests werden nur online gespeichert; ohne Verbindung meldet die Ansicht einen Fehler, statt den Eintrag nachzureichen."]'::JSONB,
    '["143", "144"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production' AND version <> '0.44.36';

UPDATE application_versions
SET release_status = 'production', rollout_percent = 100
WHERE version = '0.44.36' AND release_status <> 'production';

COMMIT;
