-- Fassung 0.42.16 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: Schaefchen bekommt eine Desktop-Gestalt.
--
-- Gebaut ist die App fuer die Baustelle: eine Spalte, Daumenbedienung, die
-- Navigation unten. Am Rechner sitzt aber das Buero, und dort war von 1440
-- Pixeln Breite die Haelfte genutzt. Die Plantafel zeigte drei von fuenf
-- Wochentagen, den Rest hinter einem Schiebebalken - obwohl die ganze Woche
-- zweimal hingepasst haette.
--
-- Ab 1080 Pixeln wandert die Leiste nach links und bleibt stehen, der Inhalt
-- nutzt die Breite, und die Karten ordnen sich nebeneinander. Am Aufbau der
-- Seite aendert sich nichts: es gibt keine zweite Fassung und keinen
-- Umschalter, dieselben Bausteine ordnen sich anders an.
--
-- Zu dieser Fassung gehoeren ein neuer Speichername des Dienst-Workers
-- (schaefchen-online-v58) und neue Fassungsangaben an allen Dateien.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.42.16', 'superseded', CURRENT_TIMESTAMP,
    'Desktop-Ansicht: Navigation links, volle Breite, Karten nebeneinander.',
    '[]'::JSONB,
    '["068"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production'
  AND version <> '0.42.16';

UPDATE application_versions
SET release_status = 'production',
    rollout_percent = 100
WHERE version = '0.42.16'
  AND release_status <> 'production';

COMMIT;
