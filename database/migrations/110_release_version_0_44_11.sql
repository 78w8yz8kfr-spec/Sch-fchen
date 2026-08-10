-- Fassung 0.44.11 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: die Lagerverwaltung ist in der App angekommen.
--
-- Bisher lag sie ausserhalb: Datenmodell, Schnittstelle und Bedienung waren
-- fertig und geprueft, aber nichts davon wurde ausgeliefert. Mit dieser
-- Fassung wandern die Migrationen 107 bis 109 in den regulaeren Ablauf, die
-- Endpunkte unter /api/v1/stock haengen in der Anwendung, und der Bereich
-- "Lager & Material" steht in der Navigation.
--
-- Was der Monteur davon hat: er scannt am Regal den Strichcode, tippt die
-- Menge und bucht die Entnahme - drei Schritte, ein Bild je Schritt. Die
-- Baustelle kommt aus seinem Tagesplan und ist freiwillig, solange die Firma
-- sie nicht verlangt. Der Kartoncode bucht die Gebindemenge, nicht eins.
--
-- Was das Buero davon hat: Bestand nach Lagerplatz, Artikelstamm mit eigenen
-- Nummern und Herstellernummern, Nachbestellvorschlaege aus dem
-- Mindestbestand, Bestellungen samt Wareneingang, Inventur mit eingefrorenem
-- Sollbestand und ein A4-Etikettenbogen fuer Artikel ohne Herstellercode.
--
-- Zwei Dinge sind bewusst keine Selbstverstaendlichkeit:
--
-- 1. Das Lager ist ein zuschaltbares Modul. Migration 109 nimmt 'materials'
--    aus dem Standardumfang; die Plattform gibt es je Firma frei.
-- 2. Der Lagerist ist eine eigene Rolle. Wer das Lager fuehrt, braucht dafuer
--    weder Kundendaten noch Projektsteuerung. Welche Mitarbeiter sie bekommen,
--    entscheidet die Firma in ihrer Mitarbeiterverwaltung.
--
-- Nicht verpflichtend: wer die Freigabe nicht hat, merkt von der Fassung
-- nichts, und wer sie hat, bekommt den Bereich beim naechsten Start.
--
-- Zu dieser Fassung gehoeren ein neuer Speichername des Dienst-Workers
-- (schaefchen-online-v93) und neue Fassungsangaben an allen Dateien.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.44.11', 'superseded', CURRENT_TIMESTAMP,
    'Lager und Material: scannen, buchen, Bestand, Inventur, Bestellungen und Etiketten - freigeschaltet je Firma, geführt vom Lageristen.',
    '[]'::JSONB,
    '["107", "108", "109", "110"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production'
  AND version <> '0.44.11';

UPDATE application_versions
SET release_status = 'production',
    rollout_percent = 100
WHERE version = '0.44.11'
  AND release_status <> 'production';

COMMIT;
