-- Fassung 0.44.54 als Produktionsstand eintragen.
-- Neuer Speichername des Dienst-Workers (schaefchen-online-v136).
BEGIN;
INSERT INTO application_versions(version,release_status,released_at,changelog,known_issues,database_migrations,rollout_percent,mandatory_update)
VALUES('0.44.54','superseded',CURRENT_TIMESTAMP,
 'Fotos und Dokumente oeffnen jetzt in der App. Bisher hing an jedem "Oeffnen" ein Download: das Geraet reichte die Datei an Galerie oder PDF-Anzeige weiter, und aus einer eingerichteten App gab es von dort keinen Weg zurueck. Ein Betrachter zeigt Bilder und PDF an Ort und Stelle; Speichern bleibt als eigene Handlung erhalten. Dabei fiel auf, dass ein Raster-Reset des Schreibtisch-Layouts allen Dialogen der App die Zentrierung nahm - sie klebten oben links. Reine Oberflaeche, keine Aenderung an Daten.',
 '[]'::JSONB,'["170"]'::JSONB,100,FALSE)
ON CONFLICT(version) DO NOTHING;
UPDATE application_versions SET release_status='superseded' WHERE release_status='production' AND version<>'0.44.54';
UPDATE application_versions SET release_status='production',rollout_percent=100 WHERE version='0.44.54' AND release_status<>'production';
COMMIT;
