-- Fassung 0.44.46 als Produktionsstand eintragen.
--
-- Zu dieser Fassung gehoert ein neuer Speichername des Dienst-Workers
-- (schaefchen-online-v128).

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.44.46', 'superseded', CURRENT_TIMESTAMP,
    'Die DATEV-Personalnummer laesst sich jetzt direkt beim Mitarbeiter eintragen - beim Anlegen wie beim Bearbeiten -, statt nur in der eigenen DATEV-Liste. Wer einen Mitarbeiter anlegt, musste bisher hinterher in einen anderen Bereich wechseln und vergass es. Die DATEV-Liste bleibt fuer das Nachtragen vieler Nummern am Stueck. Beide Wege schreiben dieselbe Spalte, teilen sich dieselbe Pruefung und dieselbe Kollisionsmeldung. Ein Client, der das Feld nicht mitschickt, loescht eine gesetzte Nummer nicht.',
    '[]'::JSONB,
    '["158"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production' AND version <> '0.44.46';

UPDATE application_versions
SET release_status = 'production', rollout_percent = 100
WHERE version = '0.44.46' AND release_status <> 'production';

COMMIT;
