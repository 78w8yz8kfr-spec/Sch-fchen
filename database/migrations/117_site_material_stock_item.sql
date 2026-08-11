-- Der Materialeintrag einer Baustelle zeigt auf einen Lagerartikel.
--
-- `site_material_entries` ist seit Migration 021 eine Freitextzeile: "Mantel-
-- leitung 5x1,5", 300, "Meter". Sie beantwortet die Frage der Baustelle - was
-- brauchen wir hier - und weiss nichts vom Lager. Damit stand dieselbe Ware
-- zweimal im System, einmal als Text an der Baustelle und einmal als Artikel
-- im Regal, und niemand konnte sagen, ob das eine das andere deckt.
--
-- Die neue Spalte stellt genau diese eine Verbindung her. Sie ist bewusst
-- freiwillig:
--
--   * Der Betrieb kann die Materialliste ohne das Lagermodul benutzen, so wie
--     bisher. Dann bleibt sie leer.
--   * Nicht jede Zeile hat einen Artikel. "Kernbohrung 82 mm durch Betondecke"
--     gehoert auf die Liste und in keinen Lagerbestand.
--   * Bestehende Zeilen bleiben, wie sie sind. Eine Pflichtspalte haette jede
--     davon ungueltig gemacht.
--
-- Name und Einheit bleiben trotz Verknuepfung am Eintrag stehen und werden
-- nicht durch die des Artikels ersetzt. Das ist Absicht: die Zeile ist ein
-- Beleg dafuer, was an diesem Tag geplant wurde. Wird der Artikel spaeter
-- umbenannt, soll die alte Baustellenakte nicht ruecklings mitgeaendert
-- werden.
--
-- Der Fremdschluessel geht ueber (company_id, id) und nicht ueber die Kennung
-- allein: sonst koennte eine Baustelle auf den Artikel einer fremden Firma
-- zeigen. RESTRICT statt CASCADE, weil ein Artikel ohnehin nicht geloescht,
-- sondern archiviert wird.

BEGIN;

ALTER TABLE site_material_entries
    ADD COLUMN IF NOT EXISTS stock_item_id UUID;

ALTER TABLE site_material_entries
    DROP CONSTRAINT IF EXISTS site_material_entries_stock_item_fkey;
ALTER TABLE site_material_entries
    ADD CONSTRAINT site_material_entries_stock_item_fkey
    FOREIGN KEY (company_id, stock_item_id)
    REFERENCES stock_items (company_id, id) ON DELETE RESTRICT;

-- Gesucht wird von der Baustelle aus ("was steht hier auf der Liste") und vom
-- Artikel aus ("welche Baustellen warten darauf").
CREATE INDEX IF NOT EXISTS site_material_entries_stock_item_idx
    ON site_material_entries (company_id, stock_item_id)
    WHERE stock_item_id IS NOT NULL;

COMMIT;
