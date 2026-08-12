-- Fassung 0.44.34 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: der Positionsleser taugt jetzt fuer echte Belege.
--
-- WAS ZU SEHEN WAR
--
-- Seit 0.44.33 laeuft die Erkennung ohne Abbruch. Was sie auf einem echten
-- Grosshaendlerbeleg herausbrachte, war allerdings unbrauchbar:
--
--   "00010 33803088 P-5A0 4 4 ST"          -> Artikelnummer "00010", 4 Stk
--   "Geschaefte ug GUN: 4016708000008 ..."  -> Artikelnummer "4016708000008", 3 t
--   Lieferdatum                             -> 22.06.2026 auf einem Augustbeleg
--
-- Drei Fehler, alle aus demselben Grund: der Leser wurde gegen einen
-- selbstgebauten Musterbeleg geprueft, und der war zu ordentlich.
--
-- 1. DIE POSITIONSNUMMER WURDE ZUR ARTIKELNUMMER
--
-- Grosshaendler drucken die Positionsnummer fuenfstellig - "00010", "00020".
-- Die alte Regel warf am Zeilenanfang nur bis zu drei Stellen weg, also blieb
-- "00010" stehen und wurde als Artikelnummer genommen, waehrend die echte
-- Nummer "33803088" dahinter unbeachtet blieb.
--
-- Jetzt faellt die fuehrende Ziffernfolge in jeder Laenge weg, und eine reine
-- Ziffernfolge zaehlt erst ab sechs Stellen als Artikelnummer. Darunter ist
-- sie fast immer etwas anderes: Positionsnummer, Menge, Jahreszahl. Nummern
-- mit Buchstaben oder Trennzeichen bleiben ab vier Zeichen gueltig
-- ("1055-04", "NYM3X15").
--
-- 2. DAS KLEINGEDRUCKTE WURDE ZUR POSITION
--
-- Unter den Positionen stehen Lieferbedingungen, Gerichtsstand und
-- Verpackungshinweise. Darin kommen lange Nummern und Zahlen vor. Zwei
-- Regeln reichen dagegen:
--
--   - Masse sind keine Liefermengen. "mm", "cm", "km", "g", "t" und "ml"
--     zaehlen nicht mehr als Einheit; aus "3 t" wurden sonst drei Tonnen
--     Kleinmaterial, und "Kabelbinder 200mm" ergab eine Menge von 200.
--   - Eine Positionszeile traegt ihre Nummer vorn, nicht irgendwo im Satz.
--     Steht die erste nummernartige Zeichenfolge erst an dritter Stelle oder
--     spaeter, ist es Fliesstext.
--
-- 3. DAS DATUM KAM VON IRGENDWO
--
-- Auf einem echten Beleg stehen fuenf Datumsangaben: Bestelldatum,
-- Druckdatum, Zahlungsziel, Kunde seit, und irgendwo dazwischen die
-- Lieferung. Der Leser nahm das erste, das wie ein Datum aussah.
--
-- Es ist jetzt an einer Beschriftung verankert - "Lieferdatum", "Datum",
-- "geliefert am" -, aus demselben Grund wie die Lieferscheinnummer seit
-- 0.44.26. Ohne Beschriftung wird nicht mehr geraten.
--
-- 4. UND WENN NICHTS PASST
--
-- Traf keine einzige gelesene Zeile einen Artikel, stand bisher trotzdem eine
-- Liste da, jede Zeile mit "kein Artikel dazu" daneben. Richtig, aber
-- unbrauchbar - und es sah aus, als haette das Programm etwas verstanden.
-- Jetzt steht dort ein Satz: nichts sicher erkannt, bitte von Hand eintragen.
-- Gibt es Treffer, stehen sie oben; die uebrigen Zeilen darunter, damit
-- niemand eine halb gelesene Lieferung fuer eine vollstaendige haelt.
--
-- Keine Datenbankaenderung.
--
-- Zu dieser Fassung gehoeren ein neuer Speichername des Dienst-Workers
-- (schaefchen-online-v116) und neue Fassungsangaben.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.44.34', 'superseded', CURRENT_TIMESTAMP,
    'Der Positionsleser kommt mit echten Großhändlerbelegen zurecht: Positionsnummer und Kleingedrucktes werden nicht mehr für Artikel gehalten, und das Lieferdatum kommt von seiner Beschriftung.',
    '["Zugeordnet wird weiter über die Artikel-, Hersteller- oder Strichcodenummer. Ein Lieferant, der eine Nummer druckt, die im eigenen Stamm nicht steht, bleibt Handarbeit."]'::JSONB,
    '["140"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production' AND version <> '0.44.34';

UPDATE application_versions
SET release_status = 'production', rollout_percent = 100
WHERE version = '0.44.34' AND release_status <> 'production';

COMMIT;
