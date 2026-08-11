-- Fassung 0.44.27 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: das Foto des Lieferscheins liest jetzt auch die
-- Positionen.
--
-- WARUM DAS JETZT GEHT UND IN 0.44.26 NOCH NICHT
--
-- Die vorige Fassung liess die Positionen bewusst weg, mit der Begruendung,
-- Tesseract lese Artikelnummern und Mengen unzuverlaessig. Diese Begruendung
-- war zu kurz gegriffen, und die Messung dazu war unfair: das Pruefbild war
-- 1000 auf 700 Bildpunkte gross und absichtlich unscharf gerechnet - kein
-- Handyfoto, sondern ein schlechtes Fax.
--
-- Auf einem Handyfoto in voller Aufloesung, schief gehalten und mit
-- Lichtverlauf, kamen Artikelnummer und Menge fehlerfrei durch - "1055-04",
-- "100 Stk", "NYM3X15", "500m" -, waehrend die Klartext-Bezeichnung danebenlag
-- ("NYM-J" wurde "NYM-)"). Genau diese Verteilung macht den Unterschied: die
-- Zuordnung laeuft ueber die Nummer und nie ueber den Namen.
--
-- WAS DIE ZUORDNUNG SICHER MACHT
--
-- Nicht die Erkennung entscheidet, sondern der Abgleich. Eine gelesene Zeile
-- wird nur dann zu einem Vorschlag, wenn ihre Nummer im eigenen Artikelstamm
-- wirklich existiert - als eigene Artikelnummer, als Herstellernummer oder als
-- hinterlegter Strichcode, wahlweise mit oder ohne Trennzeichen. Aus einem
-- verlesenen "NYM-)" wird deshalb kein Artikel, weil es diesen Artikel nicht
-- gibt. Trifft eine Nummer auf zwei Artikel, wird sie gar nicht zugeordnet:
-- ein Vorschlag, der zwischen zweien raet, sieht genauso aus wie ein
-- richtiger.
--
-- Eine Zeile zaehlt ausserdem nur, wenn sie eine Menge mit Einheit traegt.
-- Das wirft Briefkopf, Kunden- und Bestellnummer von allein hinaus, ohne dass
-- irgendwo eine Liste verbotener Woerter gepflegt werden muesste.
--
-- Genommen wird die LETZTE Menge der Zeile. In "NYM-J 3x1,5 Ring 500m" ist die
-- erste Zahl ein Querschnitt und die letzte die Lieferung; andersherum
-- gerechnet stuenden drei Meter Kabel im Lager.
--
-- Die Einheit wird verglichen und nicht umgerechnet. "Stk" auf dem Papier und
-- "Stueck" im Stamm sind dasselbe; "Ring" und "Meter" sind es nicht, und dann
-- steht es als Hinweis an der Zeile. Ein automatischer Faktor waere geraten -
-- 500 Meter koennen ein Ring sein oder fuenfhundert.
--
-- GEBUCHT WIRD DAVON NICHTS
--
-- Der Vorschlag landet in denselben Feldern, die sonst getippt werden, und
-- geht denselben Weg: speichern, pruefen, buchen. Nicht zugeordnete Zeilen
-- stehen sichtbar daneben, ohne Artikel - wer nur die Treffer saehe, hielte
-- eine halb gelesene Lieferung fuer eine vollstaendige.
--
-- Ein zweites Foto verdoppelt die Mengen nicht: was schon im Formular steht,
-- kommt kein zweites Mal dazu. Wer verwackelt fotografiert hat und es noch
-- einmal versucht, soll nicht die doppelte Lieferung im Bestand haben.
--
-- Auf dem absichtlich schlechten Pruefbild liefert die Erkennung weiterhin
-- nichts - keine Nummer, kein Datum, keine Position. Das ist der gewollte
-- Ausgang: nichts ist besser als falsch.
--
-- Keine Datenbankaenderung.
--
-- Zu dieser Fassung gehoeren ein neuer Speichername des Dienst-Workers
-- (schaefchen-online-v109) und neue Fassungsangaben.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.44.27', 'superseded', CURRENT_TIMESTAMP,
    'Das Foto des Lieferscheins schlägt jetzt auch die Positionen vor: erkannte Artikelnummern werden mit dem eigenen Artikelstamm abgeglichen.',
    '["Zugeordnet wird über die Artikel-, Hersteller- oder Strichcodenummer. Ein Artikel, dessen Nummer der Lieferant nicht druckt, bleibt Handarbeit."]'::JSONB,
    '["133"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production' AND version <> '0.44.27';

UPDATE application_versions
SET release_status = 'production', rollout_percent = 100
WHERE version = '0.44.27' AND release_status <> 'production';

COMMIT;
