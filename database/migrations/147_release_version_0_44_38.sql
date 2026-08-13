-- Fassung 0.44.38 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: die Bedienelemente am Telefon sind gross genug fuer
-- den Daumen.
--
-- WAS GEMESSEN WURDE
--
-- Der Browser hat bei 420 Pixeln Breite jedes bedienbare Element in allen neun
-- Bereichen vermessen. Zwoelf lagen unter 44 Pixeln - dem Mass, das Apple und
-- Google seit Jahren gleichlautend nennen:
--
--   - die Pfeile der Plantafel bei 34
--   - das Auswahlkaestchen im Geraetebestand bei 19
--   - die Jahresauswahl der Einstellungen bei 36
--   - der Wochenwechsel bei 40, der Verweis "Zur Woche" bei 32
--   - das Schnellmenue der Startseite bei 40, die Listenleisten bei 42
--
-- Alle stammen aus Regeln, die fuer die Maus geschrieben waren und am Telefon
-- einfach mitgalten. Der Zeiger trifft 34 Pixel, der Daumen nicht - erst recht
-- nicht mit Handschuh, im Stehen, auf einer Baustelle. Am Rechner bleibt alles
-- unveraendert: dort ist knapp und ruhig richtig.
--
-- Nach der Aenderung meldet dieselbe Messung null Treffer.
--
-- WAS DABEI AUFFIEL
--
-- In der Einsatzplanung lag "Neuer Einsatz" - die Hauptaktion des Bereichs -
-- am Telefon ausserhalb des Bildes. Die Reihe war seitlich verschiebbar, aber
-- nichts am Bildrand sagte das. Sie bricht jetzt um und zeigt alle drei
-- Knoepfe. Der Fehler bestand vor dieser Fassung und ist beim Nachmessen
-- aufgefallen, nicht durch sie entstanden.
--
-- Ein Abnahmetest im Frontend haelt die Groessen fest. Er prueft nicht, ob
-- jemand absichtlich ein winziges Knoepfchen baut, sondern den Fall, der hier
-- wirklich vorlag: eine Regel fuer den Rechner, die am Telefon mitgilt.
--
-- Zu dieser Fassung gehoert ein neuer Speichername des Dienst-Workers
-- (schaefchen-online-v120). Die Datenbank aendert sich nicht.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.44.38', 'superseded', CURRENT_TIMESTAMP,
    'Bedienelemente am Telefon halten jetzt durchgehend 44 Pixel: Plantafelpfeile, Auswahlkästchen, Wochenwechsel, Jahresauswahl, Schnellmenü und Listenleisten. In der Einsatzplanung steht „Neuer Einsatz" wieder im Bild.',
    '[]'::JSONB,
    '["147"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production' AND version <> '0.44.38';

UPDATE application_versions
SET release_status = 'production', rollout_percent = 100
WHERE version = '0.44.38' AND release_status <> 'production';

COMMIT;
