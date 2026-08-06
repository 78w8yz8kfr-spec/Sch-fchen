-- Fassung 0.42.21 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: die Anmeldeseite.
--
-- Am Rechner steht sie jetzt zweispaltig da, wie im Entwurf: links dunkel mit
-- Name und Anspruch, rechts das Formular. Am Telefon bleibt die einspaltige
-- Karte - dort ist fuer eine zweite Spalte kein Platz, und die Karte ist
-- erprobt.
--
-- Die dunkle Seite steht im Dokument hinter dem Formular und wird nur nach
-- links gesetzt. Wer mit Tastatur oder Vorleser ankommt, landet dadurch
-- zuerst bei der Anmeldung und nicht bei den Werbezeilen.
--
-- Der Name der App steht am Rechner nur noch links. Zweimal "Schaefchen"
-- nebeneinander waere eine Dopplung - dieselbe Ueberlegung wie bei
-- Seitenleiste und Kopfzeile. Die Ueberschrift bleibt im Dokument stehen,
-- weil der Bereich seinen Namen von ihr bekommt.
--
-- Der Passwortwechsel ist ein eigener Bereich und bleibt mittig.
--
-- Zu dieser Fassung gehoeren ein neuer Speichername des Dienst-Workers
-- (schaefchen-online-v63) und neue Fassungsangaben an allen Dateien.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.42.21', 'superseded', CURRENT_TIMESTAMP,
    'Neues Design, vierter Schritt: die Anmeldeseite am Rechner zweispaltig.',
    '[]'::JSONB,
    '["073"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production'
  AND version <> '0.42.21';

UPDATE application_versions
SET release_status = 'production',
    rollout_percent = 100
WHERE version = '0.42.21'
  AND release_status <> 'production';

COMMIT;
