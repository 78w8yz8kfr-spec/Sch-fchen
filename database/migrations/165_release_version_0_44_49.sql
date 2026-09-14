-- Fassung 0.44.49 als Produktionsstand eintragen.
-- Neuer Speichername des Dienst-Workers (schaefchen-online-v131).
BEGIN;
INSERT INTO application_versions(version,release_status,released_at,changelog,known_issues,database_migrations,rollout_percent,mandatory_update)
VALUES('0.44.49','superseded',CURRENT_TIMESTAMP,
 'Die eigenstaendigen Seiten "Abwesenheiten freigeben" und "Lagerstruktur" zeigen bei einem Serverfehler jetzt eine verstaendliche Meldung statt der rohen Entwicklermeldung "Unexpected token < ... is not valid JSON". Ursache war, dass die Antwort als JSON gelesen wurde, bevor der Erfolg geprueft war; eine HTML-Fehlerseite lief so ungefiltert bis vor die Augen des Nutzers. Reine Oberflaeche, keine Aenderung an Ablauf oder Daten.',
 '[]'::JSONB,'["165"]'::JSONB,100,FALSE)
ON CONFLICT(version) DO NOTHING;
UPDATE application_versions SET release_status='superseded' WHERE release_status='production' AND version<>'0.44.49';
UPDATE application_versions SET release_status='production',rollout_percent=100 WHERE version='0.44.49' AND release_status<>'production';
COMMIT;
