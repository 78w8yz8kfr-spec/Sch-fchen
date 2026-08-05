-- Fassung 0.42.7 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: das Berichtsheft (Ausbildungsnachweis) in erster
-- Ausbaustufe - Wochenberichte, Berufsschule, Urlaub und Krankheit,
-- Unterschriften, Sammelfreigabe, Rueckgabe und unveraenderlicher Verlauf.
--
-- Zu dieser Fassung gehoeren ein neuer Speichername des Dienst-Workers
-- (schaefchen-online-v49) und neue Fassungsangaben an allen Dateien.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.42.7', 'superseded', CURRENT_TIMESTAMP,
    'Berichtsheft für Auszubildende: Wochenberichte schreiben, einreichen, zurückgeben und freigeben.',
    '["Kein PDF-Ausdruck für die Kammer", "Keine Erinnerung an fehlende Wochen"]'::JSONB,
    '["056","057"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production'
  AND version <> '0.42.7';

UPDATE application_versions
SET release_status = 'production',
    rollout_percent = 100
WHERE version = '0.42.7'
  AND release_status <> 'production';

COMMIT;
