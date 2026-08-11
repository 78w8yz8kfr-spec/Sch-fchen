-- Fassung 0.44.17 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: die Materialliste der Baustelle zeigt auf einen
-- Lagerartikel und sagt, ob der Bestand reicht.
--
-- Bisher standen dieselben Dinge zweimal im System. An der Baustelle eine
-- Freitextzeile - "Mantelleitung 5x1,5", 300, Meter -, im Lager ein Artikel
-- mit Bestand. Beide wussten nichts voneinander. Wer die Liste ansah, konnte
-- nicht sagen, ob das Zeug im Regal liegt; wer ins Lager ging, wusste nicht,
-- wofuer es gebraucht wird.
--
-- Die Zeile bekommt deshalb einen freiwilligen Verweis auf den Artikel
-- (Migration 117) und darunter einen Satz aus dem Lager: "Auf Lager: 420
-- Meter" oder "Auf Lager: 120 Meter - es fehlen 180 Meter". Der Bestand wird
-- nicht gespeichert, sondern beim Lesen aus dem Journal gerechnet; es gibt
-- weiterhin genau einen Materialbestand.
--
-- Drei Faelle, die bewusst unterschiedlich ausgehen:
--
--   * Ohne Artikel steht dort nichts. Nicht "kein Bestand" - eine Kernbohrung
--     hat keinen und braucht keinen.
--   * Sind die Einheiten verschieden, wird der Bestand gezeigt, aber nicht
--     verrechnet. 120 Rollen sind nicht 120 Meter, und eine falsche Rechnung
--     waere schlimmer als keine: danach bestellt jemand nicht, was fehlt.
--     Beim Waehlen eines Artikels uebernimmt das Formular deshalb dessen
--     Einheit, notfalls als neuen Eintrag in der Auswahl.
--   * Sonst wird verglichen und die Fehlmenge genannt.
--
-- Die Bezeichnung am Eintrag bleibt stehen und wird nicht durch die des
-- Artikels ersetzt: die Zeile ist ein Beleg dafuer, was an diesem Tag geplant
-- wurde, und eine spaetere Umbenennung im Lager soll alte Baustellenakten
-- nicht ruecklings aendern.
--
-- Die Materialliste laeuft weiterhin ohne das Lagermodul. Dann bleibt der
-- Verweis leer, das Auswahlfeld weg und alles wie bisher.
--
-- Zu dieser Fassung gehoeren Migration 117, ein neuer Speichername des
-- Dienst-Workers (schaefchen-online-v99) und neue Fassungsangaben an allen
-- Dateien.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.44.17', 'superseded', CURRENT_TIMESTAMP,
    'Das Material einer Baustelle zeigt auf einen Lagerartikel und sagt, ob der Bestand reicht oder wie viel fehlt.',
    '[]'::JSONB,
    '["117", "118"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production'
  AND version <> '0.44.17';

UPDATE application_versions
SET release_status = 'production',
    rollout_percent = 100
WHERE version = '0.44.17'
  AND release_status <> 'production';

COMMIT;
