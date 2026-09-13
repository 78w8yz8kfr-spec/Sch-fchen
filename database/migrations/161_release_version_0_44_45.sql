-- Fassung 0.44.45 als Produktionsstand eintragen.
--
-- Sammelt die auf main portierte Arbeit: DATEV-Lohnschnittstelle (Fenster,
-- Personalnummern, Mitarbeiterformular), Passwort-Zuruecksetzen auf drei
-- Wegen, Prozessabsicherung. Zu dieser Fassung gehoert ein neuer
-- Speichername des Dienst-Workers (schaefchen-online-v127).
BEGIN;
INSERT INTO application_versions(version,release_status,released_at,changelog,known_issues,database_migrations,rollout_percent,mandatory_update)
VALUES('0.44.45','superseded',CURRENT_TIMESTAMP,
 'DATEV-Lohnschnittstelle in der App: Stammdaten, Lohnartenzuordnung, Vorschau, sowie eine rein numerische DATEV-Personalnummer je Mitarbeiter - direkt im Mitarbeiterformular und in einer eigenen Liste pflegbar. Passwort-Zuruecksetzen auf drei Wegen (eigenes Passwort, Buero setzt zurueck, Plattform-Notausgang) samt Notfallskript. Prozessabsicherung mit Zeitgrenzen fuer haengende Datenbankabfragen.',
 '[]'::JSONB,'["158","159","160","161"]'::JSONB,100,FALSE)
ON CONFLICT(version) DO NOTHING;
UPDATE application_versions SET release_status='superseded' WHERE release_status='production' AND version<>'0.44.45';
UPDATE application_versions SET release_status='production',rollout_percent=100 WHERE version='0.44.45' AND release_status<>'production';
COMMIT;
