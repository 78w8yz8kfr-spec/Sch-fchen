-- Fassung 0.45.0: technischer Sicherheits- und Wiederanlauf-Unterbau.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.45.0', 'superseded', CURRENT_TIMESTAMP,
    'Neustartfeste gestufte Rate-Limits, vertrauenswürdige Proxy-Auswertung, echte Datei- und Malwareprüfung, sicherer administrativer Passwortreset, Produktionskonfigurations-Gates sowie verschlüsselter Backup- und Restore-Drill.',
    '["Produktionsprovider, bezahltes PITR, externe Backup-Ablage, Monitoring, Penetrationstest und rechtliche Freigabe bleiben vor echten Firmendaten verbindliche externe Gates.", "Dokumentinhalte liegen bis zur freigegebenen Objektspeicher-Migration weiterhin in PostgreSQL."]'::JSONB,
    '["149","150"]'::JSONB,
    100,
    FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production' AND version <> '0.45.0';

UPDATE application_versions
SET release_status = 'production', rollout_percent = 100
WHERE version = '0.45.0' AND release_status <> 'production';

COMMIT;
