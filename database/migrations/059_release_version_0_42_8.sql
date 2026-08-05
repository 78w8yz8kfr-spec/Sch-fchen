-- Fassung 0.42.8 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: Auszubildender ist eine eigene Rolle, Urlaub und
-- Krankheit fuellen sich im Berichtsheft von selbst, und sehen und
-- unterschreiben darf ausschliesslich der eingetragene Ausbilder.
--
-- Zu dieser Fassung gehoeren ein neuer Speichername des Dienst-Workers
-- (schaefchen-online-v50) und neue Fassungsangaben an allen Dateien.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.42.8', 'superseded', CURRENT_TIMESTAMP,
    'Berichtsheft: eigene Rolle für Auszubildende, Urlaub und Krankheit füllen sich selbst, Einsicht nur für den Ausbilder.',
    '["Kein PDF-Ausdruck für die Kammer", "Keine Erinnerung an fehlende Wochen"]'::JSONB,
    '["058","059"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production'
  AND version <> '0.42.8';

UPDATE application_versions
SET release_status = 'production',
    rollout_percent = 100
WHERE version = '0.42.8'
  AND release_status <> 'production';

COMMIT;
