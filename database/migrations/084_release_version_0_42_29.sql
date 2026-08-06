-- Fassung 0.42.29 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: die untere Leiste am Telefon und ein Hinweis, wenn
-- die Seite hinter dem Server herhaengt.
--
-- Mit den Namen aus dem Entwurf fasst die untere Leiste bis zu sechs
-- Eintraege - Dashboard, Baustellen, Einsatzplanung, Zeiterfassung, Azubi und
-- Einstellungen. Die langen Namen passen dort nicht: "Einsatzplanung" ist
-- dreimal so breit wie "Azubi", und die Leiste wird ungleichmaessig und eng.
-- Unten steht deshalb die kurze Beschriftung: Start, Baustellen, Planung,
-- Zeiten, Azubi, Mehr. Der lange Name bleibt im Dokument stehen - er ist der
-- Name des Bereichs, den ein Vorleser nennt, und er steht am Rechner in der
-- Seitenleiste.
--
-- Das zweite ist schwerer wiegend: ein Telefon mit eingerichteter App konnte
-- tagelang eine alte Oberflaeche zeigen. Der Dienst-Worker taeuscht dabei eine
-- funktionierende Welt vor, und niemand erfaehrt, dass es eine neuere gibt.
--
-- Jede Antwort des Servers nennt jetzt seine Fassung. Die App vergleicht sie
-- mit ihrer eigenen und bietet das Neuladen an. Sie zwingt niemanden: mitten
-- in einer Eingabe neu zu laden waere schlimmer als eine alte Oberflaeche.
--
-- Der Vergleich geschieht zahlenweise. Als Zeichenketten waere "0.42.9"
-- groesser als "0.42.29", und der Hinweis bliebe genau dann aus, wenn er
-- gebraucht wird.
--
-- Zu dieser Fassung gehoeren ein neuer Speichername des Dienst-Workers
-- (schaefchen-online-v71) und neue Fassungsangaben an allen Dateien.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.42.29', 'superseded', CURRENT_TIMESTAMP,
    'Untere Leiste am Telefon und Hinweis auf eine neuere Fassung.',
    '[]'::JSONB,
    '["084"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production'
  AND version <> '0.42.29';

UPDATE application_versions
SET release_status = 'production',
    rollout_percent = 100
WHERE version = '0.42.29'
  AND release_status <> 'production';

COMMIT;
