-- Fassung 0.42.10 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: das Berichtsheft mahnt fehlende Wochen an und laesst
-- sich ueber einen ganzen Zeitraum auf einmal ausdrucken. Eine Woche gilt als
-- faellig, sobald in ihr gearbeitet wurde oder eine genehmigte Abwesenheit
-- lag; offen bleibt sie, bis ein Bericht eingereicht ist. Der Auszubildende
-- sieht seine Luecken mit einem Weg direkt in die Woche, sein Ausbilder sieht
-- sie ueber alle seine Auszubildenden.
--
-- Zu dieser Fassung gehoeren ein neuer Speichername des Dienst-Workers
-- (schaefchen-online-v52) und neue Fassungsangaben an allen Dateien.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.42.10', 'superseded', CURRENT_TIMESTAMP,
    'Berichtsheft: fehlende Wochen werden angemahnt, ganze Zeiträume lassen sich am Stück ausdrucken.',
    '[]'::JSONB,
    '["062"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production'
  AND version <> '0.42.10';

UPDATE application_versions
SET release_status = 'production',
    rollout_percent = 100
WHERE version = '0.42.10'
  AND release_status <> 'production';

COMMIT;
