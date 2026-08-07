-- Fassung 0.42.36 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: die Berichtsarten stimmen mit dem ueberein, was die
-- Firma hat.
--
-- Montageberichte und Bautagesberichte sind zwei getrennte Bereiche im
-- Katalog. Ein Betrieb kann den einen fuehren und den anderen nicht - genau
-- dafuer stehen sie getrennt dort. Die Auswahl im Bericht hat das nie gewusst
-- und immer beide angeboten.
--
-- Wer den falschen nahm, merkte es erst nach dem Speichern: "Der Bereich
-- Montageberichte ist fuer diese Firma abgeschaltet." Titel, ausgefuehrte
-- Leistungen, Stunden je Mitarbeiter und ausgewaehlte Fotos waren dann umsonst
-- eingetragen. Am schlimmsten trifft es den Monteur, der abends auf der
-- Baustelle steht und den Bericht loswerden will.
--
-- Die Auswahl kennt jetzt die Bereiche der Firma. Bleibt nur eine Art uebrig,
-- steht sie fest da, statt eine Entscheidung vorzutaeuschen. Das gilt in der
-- Baustellenakte wie auf der Feierabendkarte, und auch ein wiederhergestellter
-- Entwurf kann keine Art zurueckholen, die es nicht mehr gibt.
--
-- Dazu ein zweites, kleineres: die Witterung gehoert zum Bautagesbericht, und
-- der Server verwirft sie beim Montageschein. Sichtbar blieb das Feld in der
-- Baustellenakte trotzdem - man konnte es ausfuellen, und der Eintrag
-- verschwand beim Speichern, ohne ein Wort. Die Feierabendkarte hat das schon
-- immer richtig gemacht; die Akte jetzt auch.
--
-- Nachgemessen wurde der ganze Weg: anlegen in beiden Arten, PDF-Vorschau,
-- Rueckgabe mit Kommentar und Unterschrift mit Abschluss-PDF. Diese Schritte
-- waren in Ordnung und sind es geblieben.
--
-- Zu dieser Fassung gehoeren ein neuer Speichername des Dienst-Workers
-- (schaefchen-online-v78) und neue Fassungsangaben an allen Dateien.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.42.36', 'superseded', CURRENT_TIMESTAMP,
    'Berichtsarten richten sich nach den Bereichen der Firma.',
    '[]'::JSONB,
    '["091"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production'
  AND version <> '0.42.36';

UPDATE application_versions
SET release_status = 'production',
    rollout_percent = 100
WHERE version = '0.42.36'
  AND release_status <> 'production';

COMMIT;
