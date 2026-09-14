-- Fassung 0.44.52 als Produktionsstand eintragen.
-- Neuer Speichername des Dienst-Workers (schaefchen-online-v134).
BEGIN;
INSERT INTO application_versions(version,release_status,released_at,changelog,known_issues,database_migrations,rollout_percent,mandatory_update)
VALUES('0.44.52','superseded',CURRENT_TIMESTAMP,
 'Migration 032 ist wieder wiederholbar. Sie setzte die Formpruefung fuer Zeitkorrekturen in einer strengen Fassung, die Migration 045 spaeter bewusst gelockert hat (ohne Buero wirksame Korrektur: freigegeben, aber ohne Pruefer). Weil beim Deploy alle Migrationen erneut eingespielt werden, schrieb 032 die strenge Fassung zurueck und scheiterte an genau den Zeilen, die 045 erlaubt - jeder Deploy eines Betriebs mit einer solchen Korrektur waere abgebrochen. Ein Waechter in 032 ueberspringt die Regel, sobald die Spalte aus 045 vorhanden ist. Keine Aenderung an Daten oder Ablauf.',
 '[]'::JSONB,'["168"]'::JSONB,100,FALSE)
ON CONFLICT(version) DO NOTHING;
UPDATE application_versions SET release_status='superseded' WHERE release_status='production' AND version<>'0.44.52';
UPDATE application_versions SET release_status='production',rollout_percent=100 WHERE version='0.44.52' AND release_status<>'production';
COMMIT;
