-- Fassung 0.42.26 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: Fuehrerscheinklassen am Mitarbeiter und die Warnung
-- der Einsatzplanung.
--
-- Auf einer Baustelle, auf der niemand mit Fuehrerschein eingeteilt ist, steht
-- am Morgen das Fahrzeug in der Halle und die Mannschaft am Betriebshof. Das
-- fiel bisher erst auf, wenn es zu spaet war. Die Disposition sagt es jetzt
-- beim Planen: welche Baustellen des Tages ohne Fahrer dastehen und wie viele
-- Leute dort sind.
--
-- Ist bei niemandem ein Schein hinterlegt, sagt der Hinweis das getrennt -
-- dann ist nicht die Planung falsch, sondern die Stammdaten sind
-- unvollstaendig, und niemand soll das eine fuer das andere halten.
--
-- Die Klassen sind die des deutschen Fuehrerscheins, als feste Liste: "Klasse
-- 3" und "B" waeren sonst zwei verschiedene Dinge, und keine Auswertung wuerde
-- beide finden. Kleinschreibung, Leerzeichen und Dopplungen raeumt der
-- Bestand selbst auf, damit {B,BE} und {BE,B} nicht zwei Werte sind.
--
-- Zu dieser Fassung gehoert die Migration 078 (Spalte, Aufraeum-Trigger und
-- Pruefung der bekannten Klassen), ein neuer Speichername des Dienst-Workers
-- (schaefchen-online-v68) und neue Fassungsangaben an allen Dateien.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.42.26', 'superseded', CURRENT_TIMESTAMP,
    'Fuehrerscheinklassen am Mitarbeiter und Warnung der Einsatzplanung ohne Fahrer.',
    '[]'::JSONB,
    '["078", "079"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production'
  AND version <> '0.42.26';

UPDATE application_versions
SET release_status = 'production',
    rollout_percent = 100
WHERE version = '0.42.26'
  AND release_status <> 'production';

COMMIT;
