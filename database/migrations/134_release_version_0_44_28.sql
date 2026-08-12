-- Fassung 0.44.28 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: die Einsatzplanung ist wieder zu ueberblicken.
--
-- WAS DA SCHIEF LAG
--
-- Die Seite war 2863 Bildpunkte hoch, und in dieser Hoehe standen drei Dinge
-- in genau der falschen Reihenfolge:
--
-- 1. Die Plantafel - das Werkzeug, wegen dem man die Seite oeffnet.
-- 2. Das Formular "Einsaetze anlegen", dauerhaft aufgeklappt, mit acht
--    Feldern, einer Mitarbeiterliste zum Ankreuzen und dem Excel-Import.
--    Neunhundert Bildpunkte, auch wenn gar nichts angelegt werden sollte.
-- 3. Ganz unten die "Tageslage im Betrieb": eingeplant, abwesend, ohne
--    Einsatz, laufend, Zeitpruefung.
--
-- Dass heute sieben Mitarbeiter ohne Einsatz sind, ist aber das Erste, was
-- ein Disponent wissen will, und nicht das Letzte. Bis dahin musste er an der
-- ganzen Plantafel und am ganzen Anlegeformular vorbeirollen.
--
-- WAS SICH AENDERT
--
-- Die Tageslage steht jetzt direkt unter der Ueberschrift, vor der
-- Reiterleiste. Vor der Leiste und nicht dahinter, weil "Wochenplan" und
-- "Monatsplan" zur Plantafel darunter gehoeren; ein Kennzahlenblock
-- dazwischen risse den Reiter von dem los, was er schaltet.
--
-- Das Anlegeformular ist zugeklappt. Aufgemacht wird es von dem Knopf, der
-- ohnehin schon in der Leiste stand: "Neuer Einsatz" klappt auf, rollt hin
-- und setzt den Schreibbalken ins erste Feld. Bisher tat derselbe Knopf
-- dasselbe mit einem Formular, das immer offen war.
--
-- Dazu faellt eine doppelte Unterzeile weg. Ueber der Seite stand
-- "Einsaetze manuell oder aus Excel planen." und darunter noch einmal
-- "Wochenuebersicht, einzelne Zuweisung und Excel-Import an einem Ort."
--
-- Gemessen: 2863 auf 1663 Bildpunkte. Die Tageslage von Bildpunkt 1376 auf
-- 196. Kein Bedienschritt kommt hinzu, keiner faellt weg.
--
-- Eine CSS-Regel aus einer frueheren Anordnung stand dem im Weg: die
-- Tageslage trug "order: 3" und wanderte damit ans Ende ihrer Gruppe, egal
-- wo sie im Dokument stand. Sie stammte aus der Zeit, als der Block neben
-- der Planungsschale lag, und ist mit dem Umzug hinfaellig geworden.
--
-- Keine Datenbankaenderung.
--
-- Zu dieser Fassung gehoeren ein neuer Speichername des Dienst-Workers
-- (schaefchen-online-v110) und neue Fassungsangaben.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.44.28', 'superseded', CURRENT_TIMESTAMP,
    'Die Einsatzplanung zeigt die Tageslage zuerst; das Anlegeformular klappt erst auf, wenn es gebraucht wird.',
    '[]'::JSONB,
    '["134"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production' AND version <> '0.44.28';

UPDATE application_versions
SET release_status = 'production', rollout_percent = 100
WHERE version = '0.44.28' AND release_status <> 'production';

COMMIT;
