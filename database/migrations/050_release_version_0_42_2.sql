-- Fassung 0.42.2 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: die Firmennummer ist auf dem Anmeldebildschirm
-- wieder eingebbar. Sie war fest verdrahtet auf die Firma der
-- Ersteinrichtung; Mitarbeiter jeder weiteren Firma kamen deshalb gar nicht
-- erst an die Anmeldung, obwohl die Schnittstelle sie laengst kannte.
--
-- Der Dienst-Worker liefert die Dateien der App aus einem Zwischenspeicher aus,
-- ohne beim Server nachzufragen. Zu dieser Fassung gehoeren deshalb ein neuer
-- Speichername (schaefchen-online-v44) und neue Fassungsangaben an allen
-- Dateien.
--
-- Die Reihenfolge ist wichtig: ein eindeutiger Index laesst nur eine
-- Produktionsfassung zu. Erst wird die neue Fassung abgeloest eingetragen,
-- dann werden alle anderen abgeloest, dann wird die neue gesetzt. So bleibt
-- die Migration auch bei mehrfachem Lauf richtig.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.42.2', 'superseded', CURRENT_TIMESTAMP,
    'Anmeldung bei jeder Firma: die Firmennummer ist wieder eingebbar und bleibt auf dem Gerät gemerkt.',
    '[]'::JSONB, '["050"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production'
  AND version <> '0.42.2';

UPDATE application_versions
SET release_status = 'production',
    rollout_percent = 100
WHERE version = '0.42.2'
  AND release_status <> 'production';

COMMIT;
