-- Fassung 0.44.48 als Produktionsstand eintragen.
-- Neuer Speichername des Dienst-Workers (schaefchen-online-v130).
BEGIN;
INSERT INTO application_versions(version,release_status,released_at,changelog,known_issues,database_migrations,rollout_percent,mandatory_update)
VALUES('0.44.48','superseded',CURRENT_TIMESTAMP,
 'Verweise in der App tragen jetzt durchgaengig die Markenfarbe statt des blauen Browser-Standards. Die Links "Antraege pruefen / Zustaendigkeiten" und "Zustaendigkeiten fuer Abwesenheitsantraege" erschienen bisher als blau unterstrichener Fremdkoerper; eine Grundregel fuer alle Verweise beseitigt das. Reine Oberflaeche, keine Aenderung an Ablauf oder Daten.',
 '[]'::JSONB,'["164"]'::JSONB,100,FALSE)
ON CONFLICT(version) DO NOTHING;
UPDATE application_versions SET release_status='superseded' WHERE release_status='production' AND version<>'0.44.48';
UPDATE application_versions SET release_status='production',rollout_percent=100 WHERE version='0.44.48' AND release_status<>'production';
COMMIT;
