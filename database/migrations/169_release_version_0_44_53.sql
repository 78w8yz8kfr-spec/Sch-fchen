-- Fassung 0.44.53 als Produktionsstand eintragen.
-- Neuer Speichername des Dienst-Workers (schaefchen-online-v135).
BEGIN;
INSERT INTO application_versions(version,release_status,released_at,changelog,known_issues,database_migrations,rollout_percent,mandatory_update)
VALUES('0.44.53','superseded',CURRENT_TIMESTAMP,
 'Das Diktat fuer Baustellenberichte laesst sich jetzt beenden und ueberlebt Sprechpausen. Der zweite Tipp auf den Knopf legte bisher das Formular neu an und startete eine zweite Erkennung, statt zu beenden; die Meldung "Ich hoere zu" blieb dabei fuer immer stehen. Beendete der Browser nach einer Sprechpause von selbst, lief nichts mehr mit, waehrend der Monteur weitersprach - der Text war verloren. Der Knopf schaltet nun um und zeigt die Aufnahme sichtbar an, nach einer Pause wird weitergehoert, Zwischenergebnisse geben Rueckmeldung ohne in den Bericht zu geraten, und jeder Abbruchgrund bekommt einen eigenen Hinweis. Reine Oberflaeche, keine Aenderung an Daten.',
 '[]'::JSONB,'["169"]'::JSONB,100,FALSE)
ON CONFLICT(version) DO NOTHING;
UPDATE application_versions SET release_status='superseded' WHERE release_status='production' AND version<>'0.44.53';
UPDATE application_versions SET release_status='production',rollout_percent=100 WHERE version='0.44.53' AND release_status<>'production';
COMMIT;
