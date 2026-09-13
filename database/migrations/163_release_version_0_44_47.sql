-- Fassung 0.44.47 als Produktionsstand eintragen.
-- Neuer Speichername des Dienst-Workers (schaefchen-online-v129).
BEGIN;
INSERT INTO application_versions(version,release_status,released_at,changelog,known_issues,database_migrations,rollout_percent,mandatory_update)
VALUES('0.44.47','superseded',CURRENT_TIMESTAMP,
 'Die Seite "Lagerstruktur" nutzt jetzt das Designsystem der App: Karten, Markenrot, einheitliche Felder und Abstaende statt eines nackten Formulars. Damit laden alle eigenstaendigen Seiten dasselbe Design. Reine Oberflaeche, keine Aenderung an Ablauf oder Daten.',
 '[]'::JSONB,'["163"]'::JSONB,100,FALSE)
ON CONFLICT(version) DO NOTHING;
UPDATE application_versions SET release_status='superseded' WHERE release_status='production' AND version<>'0.44.47';
UPDATE application_versions SET release_status='production',rollout_percent=100 WHERE version='0.44.47' AND release_status<>'production';
COMMIT;
