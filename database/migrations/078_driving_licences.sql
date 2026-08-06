-- Fuehrerscheinklassen am Mitarbeiter.
--
-- Warum das im Datenbestand steht und nicht in einer Notiz: die Einsatzplanung
-- muss damit rechnen koennen. Auf einer Baustelle, auf der niemand mit
-- Fuehrerschein eingeteilt ist, steht am Morgen das Fahrzeug in der Halle und
-- die Mannschaft am Betriebshof. Das faellt heute erst auf, wenn es zu spaet
-- ist.
--
-- Gespeichert wird eine Menge von Klassen, keine einzelne: wer C hat, hat
-- meistens auch B, und die Planung fragt je nach Fahrzeug nach der einen oder
-- der anderen.
--
-- Die Klassen sind die des deutschen Fuehrerscheins. Eine feste Liste statt
-- freiem Text: "Klasse 3" und "B" waeren sonst zwei verschiedene Dinge, und
-- keine Auswertung wuerde beide finden.

BEGIN;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS driving_licence_classes TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN users.driving_licence_classes IS
    'Fuehrerscheinklassen des Mitarbeiters, z. B. {B,BE,C1}. Leer heisst: keiner hinterlegt.';

-- Die Klassen werden vor dem Schreiben aufgeraeumt: Grossbuchstaben, ohne
-- Leerzeichen, ohne Dopplung und immer in derselben Reihenfolge. Sonst waeren
-- {B,BE} und {BE,B} zwei verschiedene Werte, und "b " ein dritter.
CREATE OR REPLACE FUNCTION users_normalise_driving_licences()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.driving_licence_classes IS NULL THEN
        NEW.driving_licence_classes := '{}'::TEXT[];
        RETURN NEW;
    END IF;

    SELECT COALESCE(ARRAY_AGG(klasse ORDER BY klasse), '{}'::TEXT[])
    INTO NEW.driving_licence_classes
    FROM (
        SELECT DISTINCT UPPER(BTRIM(eintrag)) AS klasse
        FROM UNNEST(NEW.driving_licence_classes) AS eintrag
        WHERE BTRIM(eintrag) <> ''
    ) AS aufgeraeumt;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_normalise_driving_licences ON users;
CREATE TRIGGER users_normalise_driving_licences
    BEFORE INSERT OR UPDATE OF driving_licence_classes ON users
    FOR EACH ROW
    EXECUTE FUNCTION users_normalise_driving_licences();

-- Nur bekannte Klassen. Ohne diese Pruefung landete jeder Tippfehler als
-- eigene Klasse im Bestand, und die Warnung der Einsatzplanung haette
-- irgendwann Luecken, die niemand erklaeren kann.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_driving_licence_classes_known;
ALTER TABLE users ADD CONSTRAINT users_driving_licence_classes_known CHECK (
    driving_licence_classes <@ ARRAY[
        'AM', 'A1', 'A2', 'A',
        'B', 'B96', 'BE',
        'C1', 'C1E', 'C', 'CE',
        'D1', 'D1E', 'D', 'DE',
        'L', 'T'
    ]::TEXT[]
);

COMMIT;
