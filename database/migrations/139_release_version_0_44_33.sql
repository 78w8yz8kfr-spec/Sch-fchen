-- Fassung 0.44.33 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: die Texterkennung bekommt so viele Rechenfaeden, wie
-- ihr wirklich zustehen.
--
-- WAS DIE MELDUNG VERRIET
--
-- Nach zwei Fassungen, die am Bild ansetzten, kam im Betrieb wieder ein
-- Abbruch - aber diesmal mit den Zahlen, die 0.44.32 mitgeliefert hat:
--
--   [996 KB verkleinert auf 518 KB]
--
-- Damit war die bisherige Erklaerung erledigt. Das Bild kam klein an, der
-- Server verkleinerte es noch einmal, und Tesseract brauchte auf einem halben
-- Megabyte trotzdem laenger als sechzig Sekunden. Auf dem Pruefrechner sind
-- das vier Zehntelsekunden. Nicht das Bild war das Problem.
--
-- DIE URSACHE
--
-- Tesseract verteilt seine Arbeit ueber OpenMP auf so viele Faeden, wie der
-- Rechner Kerne meldet. In einem Behaelter ist das die Zahl des Wirts -
-- oft acht oder sechzehn -, waehrend der Behaelter davon nur einen Bruchteil
-- eines Kerns zugeteilt bekommt. Sechzehn Faeden draengeln sich dann um ein
-- Zehntel Kern und verbringen mehr Zeit damit, aufeinander zu warten, als mit
-- Rechnen. Das ist ein bekanntes Verhalten und passt genau zu dem, was hier
-- zu sehen war.
--
-- WARUM NICHT EINFACH EIN FADEN
--
-- Weil das andersherum genauso falsch ist. Gemessen an einem Beleg mit 48
-- Megapixeln:
--
--   vier freie Kerne, ohne Begrenzung          1,5 s
--   vier freie Kerne, fest auf einen Faden     8,8 s
--   ein Kern bei vier gemeldeten, ohne         0,75 s
--   ein Kern bei vier gemeldeten, auf einen    0,40 s
--
-- Eine feste Zahl waere in einem der beiden Faelle immer verkehrt. Deshalb
-- wird nicht geraten, sondern nachgesehen: die Zuteilung steht im
-- Dateisystem der Steuergruppe, und danach richtet sich die Fadenzahl. Steht
-- dort keine Grenze, bleibt es bei den gemeldeten Kernen.
--
-- Nachgemessen am ganzen Weg mit einem unverkleinerten 5,9-MB-Foto: 0,8
-- Sekunden von der Anfrage bis zu den zugeordneten Positionen.
--
-- WENN ES TROTZDEM NICHT REICHT
--
-- Dann folgt ein zweiter Anlauf mit einem deutlich kleineren Bild. Bei 800
-- Bildpunkten kommen Nummer und Datum noch durch, von den Positionen nur ein
-- Teil - gemessen. Der halbe Beleg ist mehr wert als gar keiner: wer die
-- Nummer hat, tippt den Rest in einer Minute nach.
--
-- Die Arbeitskante sinkt ausserdem von 2000 auf 1600 Bildpunkte. Beide lesen
-- Nummer, Datum und beide Positionen; erst bei 1000 faellt eine Zeile aus.
-- Sechzehnhundert nimmt den Sicherheitsabstand mit, den zweitausend nicht
-- gebraucht haette.
--
-- Scheitern beide Anlaeufe, nennt die Meldung jetzt auch die Laufzeiten
-- beider Schritte, die Zahl der Kerne und die Groesse des Sprachmodells. Nach
-- drei Anlaeufen im Betrieb ist Raten keine Arbeitsweise mehr.
--
-- Keine Datenbankaenderung.
--
-- Zu dieser Fassung gehoeren ein neuer Speichername des Dienst-Workers
-- (schaefchen-online-v115) und neue Fassungsangaben.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.44.33', 'superseded', CURRENT_TIMESTAMP,
    'Die Texterkennung richtet ihre Rechenfäden nach der tatsächlichen Zuteilung statt nach den gemeldeten Kernen; ein zweiter Anlauf mit kleinerem Bild rettet zumindest den Kopf des Belegs.',
    '["Der zweite Anlauf mit 800 Bildpunkten liest Nummer und Datum, aber nicht jede Positionszeile."]'::JSONB,
    '["139"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production' AND version <> '0.44.33';

UPDATE application_versions
SET release_status = 'production', rollout_percent = 100
WHERE version = '0.44.33' AND release_status <> 'production';

COMMIT;
