-- Fassung 0.42.6 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung:
--   * Karten, die nur die Planung sehen darf, blieben nach einem
--     Benutzerwechsel auf demselben Geraet stehen - samt der Namen und Zeiten
--     der vorherigen Sitzung.
--   * Die Abwesenheitserfassung steht weiter oben und ist aufgeklappt.
--   * Die Tagesspalten der Plantafel rasten ein und passen neben die klebende
--     Mitarbeiterspalte.
--
-- Zu dieser Fassung gehoeren ein neuer Speichername des Dienst-Workers
-- (schaefchen-online-v48) und neue Fassungsangaben an allen Dateien.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.42.6', 'superseded', CURRENT_TIMESTAMP,
    'Bürokarten bleiben nach einem Benutzerwechsel nicht mehr stehen, Abwesenheit ist leichter erreichbar, Plantafel rastet spaltenweise ein.',
    '[]'::JSONB, '["055"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production'
  AND version <> '0.42.6';

UPDATE application_versions
SET release_status = 'production',
    rollout_percent = 100
WHERE version = '0.42.6'
  AND release_status <> 'production';

COMMIT;
