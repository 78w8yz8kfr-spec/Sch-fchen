-- Fassung 0.43.0 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: das gemeinsame Schäfchen-Designsystem für Betriebs-
-- App, Plattformverwaltung und VDE-Editor. Die vorhandenen Rollen, Module,
-- Mandantengrenzen, Berichte, Zeit- und Prüfdaten bleiben unverändert; die
-- echte Oberfläche verwendet nun den kompakten App-Rahmen, Tabellen, Reiter,
-- Statusmarken und Formelemente der verbindlichen Desktop-Referenz.
--
-- Woche und Zeiterfassung sind wieder zwei eindeutige Bereiche. Die Woche hat
-- zusätzlich eine datenbasierte Sieben-Tage-Tabelle. Baustellen, Mitarbeiter,
-- Prüfprotokolle, Dokumente und Einsatzplanung erhalten echte Filter und
-- Aktionen statt zusätzlicher Demo- oder Mockup-Seiten.
--
-- Zu dieser Fassung gehören der neue Speichername des Dienst-Workers
-- (schaefchen-online-v79) und neue Fassungsangaben an allen Dateien.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.43.0', 'superseded', CURRENT_TIMESTAMP,
    'Gemeinsames kompaktes Designsystem und referenznahe Desktop-Oberfläche.',
    '[]'::JSONB,
    '["092"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production'
  AND version <> '0.43.0';

UPDATE application_versions
SET release_status = 'production',
    rollout_percent = 100
WHERE version = '0.43.0'
  AND release_status <> 'production';

COMMIT;
