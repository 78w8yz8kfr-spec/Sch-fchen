-- Fassung 0.44.42 als Produktionsstand eintragen.
--
-- Warum diese Migration zu jeder Fassungsanhebung gehoert: Der
-- Integrationstest "Getrennte Plattformverwaltung" vergleicht den
-- Produktionsstand in der Datenbank mit der Fassung des Servers. Wer die
-- Nummer ueberall anhebt, aber hier nicht, faellt genau darueber - beim
-- Sprung auf 0.44.40 ist das bereits einmal passiert.
--
-- Zu dieser Fassung gehoert ein neuer Speichername des Dienst-Workers
-- (schaefchen-online-v124).

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.44.42', 'superseded', CURRENT_TIMESTAMP,
    'Passwort vergessen ist kein Sackgassenweg mehr. Bisher liess sich ein Passwort nur ein einziges Mal setzen - beim ersten Anmelden; danach half niemand mehr. Jetzt gibt es drei Wege: jeder aendert sein bekanntes Passwort selbst, das Buero setzt einen Mitarbeiter zurueck und gibt ein einmalig angezeigtes Startpasswort durch, und fuer den Fall, dass niemand mehr hineinkommt, oeffnet der Plattformbetreiber den zeitbegrenzten, protokollierten Supportzugang. Das Zuruecksetzen hebt die Sperre nach zehn Fehlversuchen mit auf - sonst waere das Passwort neu und das Konto trotzdem zu.',
    '[]'::JSONB,
    '["152", "153"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production' AND version <> '0.44.42';

UPDATE application_versions
SET release_status = 'production', rollout_percent = 100
WHERE version = '0.44.42' AND release_status <> 'production';

COMMIT;
