-- Fassung 0.44.44 als Produktionsstand eintragen.
--
-- Zu dieser Fassung gehoert ein neuer Speichername des Dienst-Workers
-- (schaefchen-online-v126). Die Fassungsnummer muss angehoben werden, weil
-- app.js, index.html und styles.css im Dienst-Worker an "?v="-Parametern
-- haengen - ohne neue Nummer bekaeme kein Telefon das DATEV-Fenster zu sehen.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.44.44', 'superseded', CURRENT_TIMESTAMP,
    'Das DATEV-Fenster ist da. Bisher gab es die Lohnschnittstelle nur auf dem Server; in der App war nichts davon zu sehen. Jetzt pflegt das Buero unter Einstellungen einen eigenen DATEV-Bereich: Berater- und Mandantennummer, das Lohnprodukt (LODAS oder Lohn und Gehalt), die Zuordnung aller zwoelf Zeit- und Abwesenheitsarten auf Lohnarten und Ausfallschluessel, sowie eine Vorschau, die fuer einen Zeitraum zeigt, was uebermittelt wuerde. Fehlende Zuordnungen werden ausdruecklich angezeigt statt verschwiegen. Eine Exportdatei erzeugt diese Stufe bewusst noch nicht.',
    '[]'::JSONB,
    '["155"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production' AND version <> '0.44.44';

UPDATE application_versions
SET release_status = 'production', rollout_percent = 100
WHERE version = '0.44.44' AND release_status <> 'production';

COMMIT;
