BEGIN;
INSERT INTO application_versions(version,release_status,released_at,changelog,known_issues,database_migrations,rollout_percent,mandatory_update)
VALUES('0.44.42','superseded',CURRENT_TIMESTAMP,
 'Neon-Testbetrieb und neue Lagerstruktur: Lager, Bereiche, Regale und Fächer mit Mandantenschutz, Archivierung und Änderungshistorie. Keine Bestandsbuchungen. Geheimnisdateien werden nicht statisch ausgeliefert.',
 '[]'::JSONB,'["151","152","153"]'::JSONB,100,FALSE)
ON CONFLICT(version) DO NOTHING;
UPDATE application_versions SET release_status='superseded' WHERE release_status='production' AND version<>'0.44.42';
UPDATE application_versions SET release_status='production',rollout_percent=100 WHERE version='0.44.42' AND release_status<>'production';
COMMIT;
