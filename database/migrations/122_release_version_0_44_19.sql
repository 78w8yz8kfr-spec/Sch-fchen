-- Fassung 0.44.19 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: der Lieferschein wird ein Beleg mit Positionen, aus
-- dem die Materialbewegungen entstehen (Migration 121).
--
-- Bisher landete ein Lieferschein im Dokumentenmodul: ein Foto oder ein PDF,
-- ablegbar und wiederfindbar, aber ohne Positionen. Was tatsaechlich geliefert
-- wurde, tippte jemand danach ein zweites Mal als Wareneingang ab - oder eben
-- nicht. Damit war der Beleg da und der Bestand trotzdem falsch.
--
-- ERFASSEN UND BUCHEN SIND ZWEI SCHRITTE. Ein Schein wird oft im Stehen
-- erfasst, waehrend der Fahrer wartet. Deshalb ist er zuerst ein Entwurf und
-- korrigierbar; erst das Buchen erzeugt die Bewegungen, und danach wird
-- storniert statt geaendert.
--
-- ZWEIMAL BUCHEN GEHT NICHT. Der Statuswechsel steht vor den Bewegungen und
-- ist an 'draft' gebunden: zwei Leute, die gleichzeitig tippen, erzeugen keine
-- zwei Wareneingaenge. Denselben Schein erneut zu erfassen scheitert am
-- eindeutigen Index je Lieferant - auch mit anderer Schreibweise.
--
-- DER ABGLEICH nennt bestellt, bisher geliefert, mit diesem Schein, offen -
-- und die Ueberlieferung als eigene Zahl. Verhindert wird sie nicht: der
-- Lieferant hat nun einmal 110 statt 100 gebracht. Verschwiegen auch nicht,
-- denn daran haengt die Rechnungspruefung.
--
-- DIREKTLIEFERUNG bucht auf den Baustellenort. Ein Umweg ueber das Hauptlager,
-- den es nie gab, waere im Journal eine Luege.
--
-- Das Originaldokument bleibt in `documents`; es entsteht kein zweiter
-- Ablageort, nur ein Verweis. Umgekehrt kennt jede Bewegung ihre
-- Lieferscheinposition - der Rueckweg vom Bestand zum Papier.
--
-- Zu dieser Fassung gehoeren Migration 121, ein neuer Speichername des
-- Dienst-Workers (schaefchen-online-v101) und neue Fassungsangaben.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.44.19', 'superseded', CURRENT_TIMESTAMP,
    'Lieferscheine werden mit Positionen erfasst und gebucht; daraus entstehen die Materialbewegungen, samt Abgleich mit der Bestellung.',
    '[]'::JSONB,
    '["121", "122"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production' AND version <> '0.44.19';

UPDATE application_versions
SET release_status = 'production', rollout_percent = 100
WHERE version = '0.44.19' AND release_status <> 'production';

COMMIT;
