-- Fassung 0.44.39 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: die Auslieferung laeuft wieder.
--
-- WAS PASSIERT IST
--
-- Der Betrieb blieb auf 0.44.34 stehen, waehrend hier 0.44.35 bis 0.44.38
-- gruen durchliefen und gemergt wurden. Aufgefallen ist es nicht durch eine
-- Pruefung, sondern weil jemand hingesehen hat.
--
-- Migration 141 hat die Lagerverwaltung abgeschafft und dabei die
-- Modulfreigaben der Firmen geloescht. Auf einer frischen Datenbank lief das
-- durch: dort hat nie eine Firma ein Modul gebucht, also zeigt auch kein
-- Verlaufseintrag darauf. Im Betrieb zeigte einer darauf -
-- `company_module_entitlement_history` haelt fest, wer wann welches Modul
-- freigeschaltet hat, mit einem Fremdschluessel auf die Freigabe selbst.
-- Das DELETE lief in genau diesen Schluessel und brach ab.
--
-- `render-start.sh` wendet alle Migrationen mit ON_ERROR_STOP an und bricht
-- bei Fehler ab. Der Behaelter startete danach nicht mehr, die Pruefung des
-- Dienstes schlug fehl, und Render liess die letzte laufende Fassung stehen -
-- 0.44.34. Jede weitere Auslieferung lief in dieselbe Wand.
--
-- WAS GEAENDERT WURDE
--
-- Migration 141 loescht die Freigaben nicht mehr, sondern schaltet sie ab und
-- legt den Katalogeintrag stumm (`status = 'retired'`). Fuer die App ist das
-- dasselbe: `isSwitchable()` fuehrt nur Module mit `status = 'active'`. Wer
-- wann welches Modul hatte, bleibt stehen - Firmengeschichte, wie schon bei
-- der Rolle "Lagerist" nebenan.
--
-- WARUM ES NIEMAND GEMERKT HAT
--
-- Weil hier nie eine Datenbank stand, die laenger als einen Testlauf gelebt
-- hat. Der CI-Lauf wendet die Migrationen zweimal an - einmal auf leer, dann
-- auf den Stand der Vorbelegungen -, aber unter den Vorbelegungen war keine
-- mit gebuchten Modulen. Jetzt gibt es eine: sie stellt den Katalogeintrag
-- des Lagers samt Freigabe und Verlauf wieder her. Mit der alten Fassung von
-- 141 bricht der zweite Durchgang genau so ab wie damals der Betrieb.
--
-- Zu dieser Fassung gehoert ein neuer Speichername des Dienst-Workers
-- (schaefchen-online-v121).

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.44.39', 'superseded', CURRENT_TIMESTAMP,
    'Die Auslieferung läuft wieder: Migration 141 brach auf jeder Datenbank ab, auf der eine Firma jemals ein Modul gebucht hatte, und hat damit die Fassungen 0.44.35 bis 0.44.38 aufgehalten. Modulfreigaben werden jetzt stillgelegt statt gelöscht.',
    '[]'::JSONB,
    '["148"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production' AND version <> '0.44.39';

UPDATE application_versions
SET release_status = 'production', rollout_percent = 100
WHERE version = '0.44.39' AND release_status <> 'production';

COMMIT;
