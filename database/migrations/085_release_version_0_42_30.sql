-- Fassung 0.42.30 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: "Baustelle oeffnen" funktioniert wieder von ueberall.
--
-- Die Akte einer Baustelle liegt im Bereich "Baustellen". Solange es nur einen
-- Bereich gab, war das keine Frage. Seit die Berichtszentrale, die Suche und
-- das Dashboard eigene Bereiche sind, muss beim Oeffnen der Akte der Bereich
-- mitwechseln - sonst geht die Akte auf, aber in einem Bereich, den man
-- gerade nicht ansieht. Fuer den Bedienenden tut der Knopf dann nichts.
--
-- Genau das ist in der Berichtszentrale passiert: unter "Fehlende
-- Pflichtberichte" fuehrte "Baustelle oeffnen" ins Leere. Der Wechsel stand
-- bei den Aufrufern, und dieser eine hatte ihn nicht.
--
-- Der Wechsel steht deshalb jetzt in der Funktion, die die Akte oeffnet, und
-- nicht mehr bei jedem Aufrufer. Ein Aufrufer kann ihn dann nicht mehr
-- vergessen. Alle fuenf Wege in die Akte - Baustellenliste, Suche, Dashboard,
-- fehlender Pflichtbericht, Bericht - sind nachgemessen.
--
-- Dazu kommt eine Kleinigkeit derselben Art: die Akte scrollte so weit hoch,
-- dass ihr eigener Name unter der klebenden Kopfzeile verschwand. Man sah die
-- geoeffnete Baustelle, aber nicht, welche es ist. Ein Scrollabstand haelt den
-- Namen sichtbar.
--
-- Zu dieser Fassung gehoeren ein neuer Speichername des Dienst-Workers
-- (schaefchen-online-v72) und neue Fassungsangaben an allen Dateien.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.42.30', 'superseded', CURRENT_TIMESTAMP,
    'Baustellenakte oeffnet sich wieder von ueberall, auch aus der Berichtszentrale.',
    '[]'::JSONB,
    '["085"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production'
  AND version <> '0.42.30';

UPDATE application_versions
SET release_status = 'production',
    rollout_percent = 100
WHERE version = '0.42.30'
  AND release_status <> 'production';

COMMIT;
