-- Fassung 0.44.45 als Produktionsstand eintragen.
--
-- Zu dieser Fassung gehoert ein neuer Speichername des Dienst-Workers
-- (schaefchen-online-v127).

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.44.45', 'superseded', CURRENT_TIMESTAMP,
    'Jeder Mitarbeiter kann jetzt eine rein numerische DATEV-Personalnummer bekommen. Die bisherige Personalnummer ist freier Text (etwa "M-17"); DATEV verlangt eine Zahl, und ohne sie waere jede spaetere Exportdatei wertlos - unabhaengig davon, welche Nummern die Steuerkanzlei liefert. Die neue Nummer steht daneben, die gewohnte bleibt unveraendert. Fuehrende Nullen sind verboten, weil DATEV die Nummer als Zahl liest: 123 und 0123 waeren dort dieselbe Person, bei uns zwei verschiedene. Die Vorschau meldet jetzt getrennt, welche Mitarbeiter keine Nummer haben und welche Zeitarten keine Lohnart - zwei verschiedene Luecken brauchen zwei verschiedene Wege. Nebenbei behoben: fuenf Schaltflaechen blieben nach einem Speicherversuch ohne Netz bis zum Neuladen der Seite tot.',
    '[]'::JSONB,
    '["156", "157"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production' AND version <> '0.44.45';

UPDATE application_versions
SET release_status = 'production', rollout_percent = 100
WHERE version = '0.44.45' AND release_status <> 'production';

COMMIT;
