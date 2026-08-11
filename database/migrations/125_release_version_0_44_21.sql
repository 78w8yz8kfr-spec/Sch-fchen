-- Fassung 0.44.21 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: das Material einer Baustelle auf einen Blick, der
-- frei verfuegbare Bestand in der Liste und ein Bestellvorschlag, der rechnet,
-- was wirklich zur Verfuegung steht.
--
-- 1. DIE BAUSTELLE. Vier Zahlen, die im Betrieb regelmaessig durcheinander-
-- gehen, stehen jetzt nebeneinander: was dort liegt, was ausdruecklich als
-- verbaut gemeldet wurde, was zurueckging und was bestellt, aber noch nicht
-- geliefert ist. Bewusst nicht zu einer Zahl verrechnet - "Verbrauch =
-- geliefert minus zurueck" ist falsch, sobald eine Umbuchung auf eine zweite
-- Baustelle dazwischenliegt, und auf einer laufenden Baustelle immer zu frueh.
--
-- 2. FREI VERFUEGBAR IN DER LISTE. Der physische Bestand bleibt die Zahl
-- rechts - die kann jemand im Regal nachzaehlen. Daneben steht, was davon
-- reserviert und was frei ist, und nur dann, wenn es etwas zu sagen gibt:
-- "0 reserviert" an jeder Zeile waere Laerm.
--
-- 3. DER BESTELLVORSCHLAG rechnet ab jetzt mit dem frei verfuegbaren Bestand
-- und loest beim Meldebestand aus. Vorher meldete er volle Regale, waehrend
-- die naechste Entnahme schon nicht mehr ging, weil alles fuer eine Baustelle
-- zurueckgelegt war.
--
-- Keine Datenbankaenderung: alle drei rechnen aus dem, was seit den
-- Migrationen 119, 121 und 123 da ist.
--
-- Zu dieser Fassung gehoeren ein neuer Speichername des Dienst-Workers
-- (schaefchen-online-v103) und neue Fassungsangaben.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.44.21', 'superseded', CURRENT_TIMESTAMP,
    'Das Material einer Baustelle steht in der Baustellenakte, die Bestandsliste nennt frei verfügbar, und der Bestellvorschlag rechnet mit dem Meldebestand.',
    '[]'::JSONB,
    '["125"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production' AND version <> '0.44.21';

UPDATE application_versions
SET release_status = 'production', rollout_percent = 100
WHERE version = '0.44.21' AND release_status <> 'production';

COMMIT;
