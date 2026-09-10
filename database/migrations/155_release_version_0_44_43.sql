BEGIN;
INSERT INTO application_versions(version,release_status,released_at,changelog,known_issues,database_migrations,rollout_percent,mandatory_update)
VALUES('0.44.43','superseded',CURRENT_TIMESTAMP,
 'Zuständige Mitarbeiter für erste Abwesenheitsprüfung und verbindliche Freigabe je Firma auswählbar. Getrennte Berechtigungen, Versionsschutz und unveränderlicher Änderungsverlauf.',
 '[]'::JSONB,'["154","155"]'::JSONB,100,FALSE)
ON CONFLICT(version) DO NOTHING;
UPDATE application_versions SET release_status='superseded' WHERE release_status='production' AND version<>'0.44.43';
UPDATE application_versions SET release_status='production',rollout_percent=100 WHERE version='0.44.43' AND release_status<>'production';
COMMIT;
