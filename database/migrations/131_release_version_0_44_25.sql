-- Fassung 0.44.25 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: die Zeiten der Mitarbeiter bekommen einen eigenen
-- Bereich.
--
-- Sie lagen bisher in "Meine Woche" unter dem Reiter "Antraege & Pruefung" -
-- drei Ebenen tief, in einer Ansicht, die ihrem Namen nach die eigene Woche
-- zeigt. Wer Stundenzettel freigeben soll, scrollte an seiner eigenen Woche
-- vorbei, um die Zeiten anderer zu finden, und traf dort auf fuenf Tafeln
-- nebeneinander: die eigenen Antraege, die Pruefung der Stundenzettel, die
-- offenen Korrekturen, die Abwesenheiten und zwei Exportkarten.
--
-- Getrennt wird jetzt nach dem, wem die Zeit gehoert:
--
--   * "Meine Woche" behaelt, was mir gehoert - Ueberblick, Arbeitstage,
--     Arbeitskonto und meine eigenen Antraege. Der Reiter heisst deshalb nicht
--     mehr "Antraege & Pruefung", sondern "Meine Antraege".
--   * "Arbeitszeiten" ist neu und traegt die Arbeit an fremden Zeiten:
--     Stundenzettel pruefen, offene Korrekturen, Abwesenheiten und der
--     Stundenzettel-Export.
--
-- Der Eintrag erscheint nur fuer die, die freigeben duerfen. Fuer alle anderen
-- waere er eine Tuer, hinter der drei leere Listen stehen.
--
-- Im Kopf des Bereichs steht, wie viel offen ist. Gezaehlt wird dabei aus den
-- drei Listen selbst und nicht noch einmal gerechnet: so kann die Zahl im Kopf
-- nicht von dem abweichen, was darunter steht.
--
-- Verschoben wird ausserdem der Stundenzettel-Export: er stand in der
-- Auswertung, gehoert aber dorthin, wo die Stunden gepruefet werden.
--
-- Keine Datenbankaenderung, keine geaenderte Berechtigung: dieselben Tafeln,
-- dieselben Rechte, ein anderer Ort.
--
-- Zu dieser Fassung gehoeren ein neuer Speichername des Dienst-Workers
-- (schaefchen-online-v107) und neue Fassungsangaben.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.44.25', 'superseded', CURRENT_TIMESTAMP,
    'Die Zeiten der Mitarbeiter haben einen eigenen Bereich: prüfen, freigeben und auswerten an einer Stelle statt drei Ebenen tief in der eigenen Woche.',
    '[]'::JSONB,
    '["131"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production' AND version <> '0.44.25';

UPDATE application_versions
SET release_status = 'production', rollout_percent = 100
WHERE version = '0.44.25' AND release_status <> 'production';

COMMIT;
