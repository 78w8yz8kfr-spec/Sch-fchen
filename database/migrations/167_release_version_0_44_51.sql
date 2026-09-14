-- Fassung 0.44.51 als Produktionsstand eintragen.
-- Neuer Speichername des Dienst-Workers (schaefchen-online-v133).
BEGIN;
INSERT INTO application_versions(version,release_status,released_at,changelog,known_issues,database_migrations,rollout_percent,mandatory_update)
VALUES('0.44.51','superseded',CURRENT_TIMESTAMP,
 'Zaehltexte treffen jetzt den Numerus. Bei einem einzelnen Eintrag stand bisher "1 sichtbare Einsaetze", "1 gelesene Zeilen" und "1 Mitglieder"; bei mehreren umgekehrt "3 vorhandene Baustelle wird nicht doppelt angelegt". Acht Stellen in Plantafel, Monatsplan, Teamvorlagen und Excel-Import folgen jetzt der im Projekt ueblichen Loesung mit vollem Ternaer. Reine Oberflaeche, keine Aenderung an Ablauf oder Daten.',
 '[]'::JSONB,'["167"]'::JSONB,100,FALSE)
ON CONFLICT(version) DO NOTHING;
UPDATE application_versions SET release_status='superseded' WHERE release_status='production' AND version<>'0.44.51';
UPDATE application_versions SET release_status='production',rollout_percent=100 WHERE version='0.44.51' AND release_status<>'production';
COMMIT;
