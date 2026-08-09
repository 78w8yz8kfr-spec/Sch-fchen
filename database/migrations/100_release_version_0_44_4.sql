-- Fassung 0.44.4 als Produktionsstand eintragen.
--
-- Das Azubi-Berichtsheft ist mobil ein eigener Hauptbereich. Auf der
-- Startseite erscheint nur noch ein kompakter, handlungsbezogener Hinweis,
-- wenn der heutige Eintrag fehlt oder eine Woche zur Überarbeitung
-- zurückgegeben wurde. Eingereichte und freigegebene Wochen verdrängen den
-- Arbeitstag nicht mehr.
--
-- Zu dieser Fassung gehört der App-Shell-Speicher schaefchen-online-v86.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.44.4', 'superseded', CURRENT_TIMESTAMP,
    'Azubis erreichen ihr Berichtsheft mobil als eigenen Bereich; die Startseite zeigt den Nachweis nur bei einer tatsächlich offenen Handlung.',
    '[]'::JSONB,
    '["100"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production'
  AND version <> '0.44.4';

UPDATE application_versions
SET release_status = 'production',
    rollout_percent = 100
WHERE version = '0.44.4'
  AND release_status <> 'production';

COMMIT;
