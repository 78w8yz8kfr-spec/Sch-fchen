-- Fassung 0.42.11 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: zwei gemeldete Fehler im Berichtsheft.
--
-- Erstens liess sich nach dem Einreichen nichts mehr schreiben, ohne dass
-- irgendwo stand, warum - das Heft sah kaputt aus. Der Grund steht jetzt auf
-- dem Bildschirm.
--
-- Zweitens nahm der Server eine halb ausgefuellte Woche an und druckte sie
-- auch. Ein Arbeitstag ohne Zeile ist kein Nachweis: eingereicht wird nur eine
-- vollstaendige Woche, gedruckt nur, was eingereicht oder freigegeben ist.
--
-- Zu dieser Fassung gehoeren ein neuer Speichername des Dienst-Workers
-- (schaefchen-online-v53) und neue Fassungsangaben an allen Dateien.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.42.11', 'superseded', CURRENT_TIMESTAMP,
    'Berichtsheft: unvollständige Wochen werden nicht mehr eingereicht oder gedruckt, und die Sperre nach dem Einreichen erklärt sich.',
    '[]'::JSONB,
    '["063"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production'
  AND version <> '0.42.11';

UPDATE application_versions
SET release_status = 'production',
    rollout_percent = 100
WHERE version = '0.42.11'
  AND release_status <> 'production';

COMMIT;
