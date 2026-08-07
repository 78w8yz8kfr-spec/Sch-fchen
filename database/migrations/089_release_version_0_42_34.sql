-- Fassung 0.42.34 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: die Startseite sagt, woran sie ist.
--
-- Gemeldet wurde "Start laedt ungewoehnlich lange" - mit einem Bild, auf dem
-- unter der Begruessung gar nichts stand.
--
-- Kennzahlen, Tagesuebersicht und Schnellzugriff haengen alle an derselben
-- Betriebsuebersicht. Ist sie nicht da, stehen alle drei auf "versteckt", und
-- die Startseite ist vollstaendig leer. Sie sah waehrend des Ladens genauso
-- aus wie nach einem fehlgeschlagenen Laden - und ein Netzfehler wurde nicht
-- einmal gemeldet, weil die Meldung bei error.network absichtlich unterbleibt.
-- Wer das sieht, wartet: erst eine Weile, dann laenger.
--
-- Die Startseite sagt jetzt, was los ist. Waehrend des Ladens steht dort, dass
-- geladen wird. Dauert es laenger als acht Sekunden, steht dort, dass es
-- laenger dauert als ueblich und der Server vielleicht gerade erst anlaeuft -
-- "wird geladen" stimmt nach einer halben Minute zwar noch, hilft aber
-- niemandem mehr. Ist es gescheitert, steht das da, mit einem Knopf zum
-- erneuten Versuchen.
--
-- Zu dieser Fassung gehoeren ein neuer Speichername des Dienst-Workers
-- (schaefchen-online-v76) und neue Fassungsangaben an allen Dateien.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.42.34', 'superseded', CURRENT_TIMESTAMP,
    'Die Startseite sagt, ob sie laedt, laenger braucht oder gescheitert ist.',
    '[]'::JSONB,
    '["089"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production'
  AND version <> '0.42.34';

UPDATE application_versions
SET release_status = 'production',
    rollout_percent = 100
WHERE version = '0.42.34'
  AND release_status <> 'production';

COMMIT;
