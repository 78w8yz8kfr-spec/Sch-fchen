-- Fassung 0.44.9 als Produktionsstand eintragen.
--
-- Das Berichtsheft war am Telefon nicht erreichbar. Der Menüpunkt „Azubi“
-- stand in der unteren Leiste, wurde dort aber von einer allgemeinen Regel des
-- Designsystems mit `display: none !important` verdeckt; die Ausnahme für den
-- Auszubildenden stand ohne `!important` in einer früher geladenen Datei und
-- blieb wirkungslos. Weil die Oberfläche denselben Eintrag aus der Liste unter
-- „Mehr“ herausnimmt, sobald er zur Hauptleiste gehört, führte kein einziger
-- Weg mehr in den Nachweis. Die Rollen und Freigaben aus den Migrationen 102
-- bis 104 waren dabei stets in Ordnung.
--
-- Diese Fassung ist verpflichtend: Eine eingerichtete App hält Stylesheet und
-- Oberfläche im Speicher des Dienst-Workers fest und zeigte die Korrektur
-- sonst tagelang nicht.
--
-- Zu dieser Fassung gehört der App-Shell-Speicher schaefchen-online-v91.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.44.9', 'superseded', CURRENT_TIMESTAMP,
    'Der Menüpunkt „Azubi“ ist am Telefon wieder sichtbar; das Berichtsheft lässt sich dort wieder öffnen und schreiben.',
    '[]'::JSONB,
    '["105"]'::JSONB, 100, TRUE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production'
  AND version <> '0.44.9';

UPDATE application_versions
SET release_status = 'production',
    rollout_percent = 100,
    mandatory_update = TRUE
WHERE version = '0.44.9'
  AND (
      release_status <> 'production'
      OR rollout_percent <> 100
      OR mandatory_update = FALSE
  );

COMMIT;
