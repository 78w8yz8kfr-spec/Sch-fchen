-- Fassung 0.44.50 als Produktionsstand eintragen.
-- Neuer Speichername des Dienst-Workers (schaefchen-online-v132).
BEGIN;
INSERT INTO application_versions(version,release_status,released_at,changelog,known_issues,database_migrations,rollout_percent,mandatory_update)
VALUES('0.44.50','superseded',CURRENT_TIMESTAMP,
 'Knoepfe in Ueberschriftenzeilen haben wieder ihre natuerliche Breite. Die Handy-Regel fuer volle Knopfbreite schlug am Rechner durch: "Excel Export" in der Arbeitszeit-Auswertung war 951 Pixel breit, "+ Hochladen" in der Dokumentablage 868 - und quetschte dabei Ueberschrift und Zaehler in je zwei Zeilen. Am Telefon darf die Ueberschriftenzeile jetzt umbrechen, statt jedes Element zu stauchen. Reine Oberflaeche, keine Aenderung an Ablauf oder Daten.',
 '[]'::JSONB,'["166"]'::JSONB,100,FALSE)
ON CONFLICT(version) DO NOTHING;
UPDATE application_versions SET release_status='superseded' WHERE release_status='production' AND version<>'0.44.50';
UPDATE application_versions SET release_status='production',rollout_percent=100 WHERE version='0.44.50' AND release_status<>'production';
COMMIT;
