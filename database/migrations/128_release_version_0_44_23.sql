-- Fassung 0.44.23 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: die Rueckgabe von der Baustelle darf der Monteur
-- selbst buchen.
--
-- Die Funktion aus 0.44.22 war fuer ihn gebaut und fuer ihn gesperrt. Eine
-- Rueckgabe ist technisch eine Umlagerung, und Umlagern ist Vorarbeitersache;
-- der Monteur bekam beim Buchen "Fuer diese Buchung fehlt die Berechtigung".
-- Aufgefallen ist das erst in der Probe mit einem echten Monteurszugang -
-- kein Testlauf haette es gezeigt, weil alle Abnahmen bis dahin aus dem Buero
-- gebucht haben.
--
-- Erlaubt ist genau ein Fall: von einem Baustellenlagerplatz auf einen Platz,
-- der keine Baustelle ist. Das ist keine Aufweichung, sondern die Beseitigung
-- einer Inkonsequenz - entnehmen und zurueckgeben darf der Monteur ohnehin
-- einzeln, und die eine Buchung zu verbieten, die beides zusammenfasst, waere
-- nur unbequem und nicht sicherer gewesen. Waere sie geblieben, waere das
-- Restmaterial abends im Transporter geblieben und der Bestand still falsch
-- geworden.
--
-- Von Baustelle zu Baustelle bleibt gesperrt: das ist eine Umdisposition und
-- gehoert dem, der plant. Vom Lager auf die Baustelle ebenfalls - das ist eine
-- Ausgabe.
--
-- Keine Datenbankaenderung.
--
-- Zu dieser Fassung gehoeren ein neuer Speichername des Dienst-Workers
-- (schaefchen-online-v105) und neue Fassungsangaben.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.44.23', 'superseded', CURRENT_TIMESTAMP,
    'Die Rückgabe von der Baustelle ins Lager darf der Monteur selbst buchen; von Baustelle zu Baustelle bleibt Vorarbeitersache.',
    '[]'::JSONB,
    '["128"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production' AND version <> '0.44.23';

UPDATE application_versions
SET release_status = 'production', rollout_percent = 100
WHERE version = '0.44.23' AND release_status <> 'production';

COMMIT;
