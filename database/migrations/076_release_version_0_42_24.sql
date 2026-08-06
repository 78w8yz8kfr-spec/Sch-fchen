-- Fassung 0.42.24 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: das Dashboard fuer das Buero genau wie im Entwurf,
-- und die Baustellenakte mit den vier Feldern der Uebersicht.
--
-- Wer plant, sitzt im Buero. Sein Dashboard endet jetzt nach "Heute im
-- Ueberblick" - genau da, wo es im Entwurf endet. Der eigene Arbeitstag,
-- der heutige Einsatz, die Uebersichtskarten und der Stundenzettel stehen
-- bei ihm in der Zeiterfassung; dort sucht er sie ohnehin.
--
-- Monteur, Vorarbeiter und Auszubildender behalten ihr Dashboard
-- unveraendert: sie haben keine Kennzahlen und brauchen den Startknopf beim
-- Aufmachen der App.
--
-- Die Tafeln stehen im Dokument hinter der Wochenansicht, damit die
-- Zeiterfassung mit der Woche beginnt. Auf dem Dashboard aendert das nichts,
-- weil die Wochenansicht dort verborgen ist.
--
-- Die Baustellenakte traegt jetzt "Baustelle ausgewaehlt" ueber dem Namen,
-- die Reiterleiste ist am Rechner ein Strich statt Pillen, und die Uebersicht
-- zeigt die vier Felder des Entwurfs: Adresse, Vorarbeiter, wer heute vor Ort
-- ist und wann es weitergeht. Alle vier Angaben standen schon in den Daten -
-- sie standen nur nirgends beieinander.
--
-- Am Telefon bleiben die Reiter Pillen: dort scrollt die Leiste waagerecht,
-- und eine Pille trifft der Daumen besser als eine Beschriftung.
--
-- Zu dieser Fassung gehoeren ein neuer Speichername des Dienst-Workers
-- (schaefchen-online-v66) und neue Fassungsangaben an allen Dateien.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.42.24', 'superseded', CURRENT_TIMESTAMP,
    'Neues Design, siebter Schritt: Buero-Dashboard genau wie im Entwurf, Baustellenakte mit Uebersichtsfeldern.',
    '[]'::JSONB,
    '["076"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production'
  AND version <> '0.42.24';

UPDATE application_versions
SET release_status = 'production',
    rollout_percent = 100
WHERE version = '0.42.24'
  AND release_status <> 'production';

COMMIT;
