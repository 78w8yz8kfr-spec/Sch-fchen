-- Der Artikel bekommt sein Gebinde.
--
-- Bisher stand die Gebindemenge nur am Code: wer den Karton scannte, buchte
-- hundert Stueck, und das war es. Damit fehlte zweierlei.
--
-- Erstens gab es das Gebinde nur, wenn der Hersteller einen eigenen Code auf
-- den Karton gedruckt hat. Eine Rolle Kabel, ein Bund Klemmen, eine
-- Palette Leerrohr - alles, was der Betrieb selbst zu Gebinden macht, liess
-- sich nicht abbilden. Deshalb steht die Stueckzahl jetzt am Artikel:
-- `pack_size` sagt, wie viele Einheiten in einem Gebinde stecken, `pack_name`
-- wie das Gebinde heisst - Karton, Rolle, Bund, Palette.
--
-- Zweitens liess sich aus einem gescannten Karton keine einzelne Dose
-- entnehmen, ohne die Menge von Hand zu ueberschreiben. Das ist eine Frage der
-- Bedienung und wird dort geloest; die Datenbank liefert nur die Zahl, mit der
-- die Oberflaeche zwischen "ein Karton" und "ein Stueck" umrechnen kann.
--
-- Der Bestand bleibt in der Einheit des Artikels. Das ist die wichtigste
-- Festlegung dieser Migration: es gibt genau eine Wahrheit im Journal, naemlich
-- Stueck, Meter, Kilogramm. Ein Gebinde ist eine Art, davon zu sprechen - kein
-- zweiter Bestand daneben. Sonst haette ein Lager zwei Zahlen, die
-- auseinanderlaufen koennen, und niemand wuesste, welche stimmt.
--
-- `pack_size > 1`: ein Gebinde mit einem Stueck ist kein Gebinde, sondern das
-- Stueck. Es anzubieten hiesse, dem Monteur eine Wahl zu stellen, die keine
-- ist.

BEGIN;

ALTER TABLE stock_items
    ADD COLUMN IF NOT EXISTS pack_size NUMERIC(14,3),
    ADD COLUMN IF NOT EXISTS pack_name VARCHAR(40);

-- Beide Zweige nennen ausdruecklich, was nicht NULL sein darf.
--
-- `pack_size > 1` allein reicht nicht: bei `pack_size IS NULL` ergibt der
-- Vergleich NULL, die ganze Bedingung wird NULL, und eine CHECK-Bedingung mit
-- NULL gilt in PostgreSQL als erfuellt. Ein Gebindename ohne Stueckzahl waere
-- damit durchgerutscht - genau das hat die Abnahme abgefangen.
ALTER TABLE stock_items DROP CONSTRAINT IF EXISTS stock_items_pack_check;
ALTER TABLE stock_items ADD CONSTRAINT stock_items_pack_check CHECK (
    (pack_size IS NULL AND pack_name IS NULL)
    OR (
        pack_size IS NOT NULL AND pack_name IS NOT NULL
        AND pack_size > 1 AND pack_size <= 999999
    )
);

COMMENT ON COLUMN stock_items.pack_size IS
    'Wie viele Einheiten in einem Gebinde stecken; NULL heisst: dieser Artikel hat kein Gebinde.';
COMMENT ON COLUMN stock_items.pack_name IS
    'Wie das Gebinde im Betrieb heisst - Karton, Rolle, Bund. Nur zusammen mit pack_size.';

COMMIT;
