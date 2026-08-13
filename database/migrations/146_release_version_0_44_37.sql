-- Fassung 0.44.37 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: der faellige FI-Test meldet sich von selbst.
--
-- WER DEN HINWEIS BEKOMMT
--
-- Der zustaendige Vorarbeiter der Baustelle, auf der der Verteiler steht -
-- der als hauptverantwortlich gefuehrte Bauleiter zuerst. Nicht das Buero:
-- der Vorarbeiter steht auf dem Platz und kann die Taste druecken, ein
-- Hinweis im Buero waere eine Nachricht an jemanden, der daraufhin
-- telefonieren muesste.
--
-- Steht ein Verteiler auf keiner Baustelle - im Hof, auf dem Wagen -, gibt es
-- keinen Vorarbeiter, und der Hinweis faellt der Geraeteverwaltung zu. Ein
-- Hinweis, den niemand bekommt, waere keiner, und die Frist laeuft trotzdem.
--
-- WANN ER KOMMT
--
-- Am Tag der Faelligkeit, nicht vier Wochen vorher: ein Hinweis mit Vorlauf
-- waere bis zum Termin laengst weggeklickt. Danach einmal als "ueberfaellig".
-- Ein Verteiler, der noch nie geprueft wurde, hat keinen Termin, den man
-- fortschreiben koennte - er meldet sich einmal im Monat, dem Takt der
-- Pflicht.
--
-- Der Eindeutigkeitsschluessel traegt den Termin, deshalb entsteht ein
-- Hinweis pro Termin genau einmal, egal wie oft jemand nachsieht.
--
-- WO ER STEHT
--
-- In derselben Glocke wie die Prueftermine der Geraete. Ein Verteiler ist ein
-- Geraet, und zwei Glocken waeren eine zu viel; Migration 145 erweitert
-- deshalb nur die Liste erlaubter Arten in `device_notifications`. Angetippt
-- fuehrt der Hinweis in den Baustrombereich und nicht ins Geraeteblatt - dort
-- steht der Knopf, mit dem er sich erledigen laesst.
--
-- Zu dieser Fassung gehoeren Migration 145, ein neuer Speichername des
-- Dienst-Workers (schaefchen-online-v119) und neue Fassungsangaben.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.44.37', 'superseded', CURRENT_TIMESTAMP,
    'Der fällige FI-Test eines Baustromverteilers meldet sich beim zuständigen Vorarbeiter der Baustelle — am Tag der Fälligkeit, in der Glocke der Geräteverwaltung, mit einem Weg direkt zum Bestätigen.',
    '["Der Hinweis entsteht, sobald jemand die App öffnet, und nicht nachts von selbst: Schäfchen hat keinen Hintergrunddienst. Wer die App an einem Tag gar nicht öffnet, sieht den Hinweis beim nächsten Start."]'::JSONB,
    '["145", "146"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production' AND version <> '0.44.37';

UPDATE application_versions
SET release_status = 'production', rollout_percent = 100
WHERE version = '0.44.37' AND release_status <> 'production';

COMMIT;
