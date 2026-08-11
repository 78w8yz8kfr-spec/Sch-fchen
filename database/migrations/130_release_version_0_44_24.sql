-- Fassung 0.44.24 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: die Bedarfsliste der Baustelle haengt in der
-- Belegkette (Migration 129).
--
-- Seit 0.44.17 zeigt eine Zeile auf einen Lagerartikel und sagt, ob der
-- Bestand reicht. Damit endete sie aber auch. Was zu tun ist, wenn er nicht
-- reicht, stand nirgends; wer es tat, tat es woanders - im Lager oder beim
-- Lieferanten -, ohne dass die Baustelle davon erfuhr. Die Liste sagte "es
-- fehlen 180 Meter" und sagte das auch noch, nachdem laengst bestellt war.
--
-- Aus der Zeile fuehren jetzt zwei Wege:
--
--   * ZURUECKLEGEN. Reserviert wird hoechstens, was noch offen und frei
--     verfuegbar ist - meist weniger als der Bedarf. Genau diese Differenz ist
--     die Menge, die anschliessend bestellt werden muss, und sie steht in der
--     Antwort.
--   * BESTELLEN. Bestellt wird genau das, was nach der Reservierung offen
--     bleibt, und nicht die volle Menge. Die Position geht auf einen offenen
--     Entwurf desselben Lieferanten, wenn es einen gibt - so sammelt sich der
--     Bedarf mehrerer Baustellen auf einer Bestellung, statt beim Lieferanten
--     als Dutzend Einzelbestellungen anzukommen.
--
-- Beides genau einmal: eine zweite Reservierung liesse dieselbe Ware doppelt
-- zurueckliegen, eine zweite Bestellung ergaebe eine doppelte Lieferung.
--
-- Die Zeile traegt danach beide Verweise und zeigt, was veranlasst ist - und
-- die Fehlmenge rechnet es mit: was zurueckgelegt oder bestellt ist, fehlt
-- nicht mehr, es ist nur noch nicht da. Aus "es fehlen 180 Meter" wird "der
-- Rest ist veranlasst". Ohne das staende an einer laengst bestellten Position
-- weiter eine rote Fehlmenge, und jemand bestellt ein zweites Mal.
--
-- Damit ist die Kette der Aufgabenstellung durchgehend begehbar:
-- Bedarf -> Reservierung -> Bestellung -> Lieferung -> Lieferschein ->
-- Lager/Baustelle -> Ausgabe -> Rueckgabe -> Verbrauch.
--
-- Zu dieser Fassung gehoeren Migration 129, ein neuer Speichername des
-- Dienst-Workers (schaefchen-online-v106) und neue Fassungsangaben.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.44.24', 'superseded', CURRENT_TIMESTAMP,
    'Aus der Materialliste der Baustelle lässt sich zurücklegen und der Rest bestellen; beides hängt danach an der Zeile.',
    '[]'::JSONB,
    '["129", "130"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production' AND version <> '0.44.24';

UPDATE application_versions
SET release_status = 'production', rollout_percent = 100
WHERE version = '0.44.24' AND release_status <> 'production';

COMMIT;
