-- Die Bedarfsliste der Baustelle haengt in der Belegkette.
--
-- Seit Migration 117 zeigt eine Zeile auf einen Lagerartikel und sagt, ob der
-- Bestand reicht. Damit endet sie aber auch: was zu tun ist, wenn er nicht
-- reicht, stand nirgends, und wer es tat, tat es woanders - im Lager oder beim
-- Lieferanten - ohne dass die Baustelle davon erfuhr. Die Liste sagte "es
-- fehlen 180 Meter" und sagte das auch noch, nachdem laengst bestellt war.
--
-- Zwei Verweise schliessen die Luecke:
--
--   * `stock_reservation_id` - fuer diese Zeile wurde im Lager zurueckgelegt.
--     Die Baustelle sieht damit, dass die Ware ihr gehoert, und das Lager
--     weiss, warum sie blockiert ist.
--   * `purchase_order_item_id` - fuer diese Zeile wurde bestellt. Die
--     Baustelle sieht die Bestellung, und wenn der Lieferschein kommt, laeuft
--     die Menge ueber dieselbe Position zurueck.
--
-- Damit ist die Kette aus der Aufgabenstellung durchgehend begehbar:
-- Bedarf -> Reservierung -> Bestellung -> Lieferung -> Lieferschein ->
-- Lager/Baustelle -> Ausgabe -> Rueckgabe -> Verbrauch.
--
-- Beide sind freiwillig. Nicht jede Zeile braucht eine Reservierung, nicht
-- jede eine Bestellung, und eine Zeile ohne Artikel hat weder das eine noch
-- das andere. Bestehende Zeilen bleiben unveraendert.
--
-- Verwiesen wird auf die Bestell*position* und nicht auf die Bestellung: eine
-- Bestellung fasst die Bedarfe mehrerer Baustellen zusammen, und nur die
-- Position sagt, wie viel davon dieser Zeile gehoert.

BEGIN;

ALTER TABLE site_material_entries
    ADD COLUMN IF NOT EXISTS stock_reservation_id UUID,
    ADD COLUMN IF NOT EXISTS purchase_order_item_id UUID;

ALTER TABLE site_material_entries
    DROP CONSTRAINT IF EXISTS site_material_entries_reservation_fkey;
ALTER TABLE site_material_entries
    ADD CONSTRAINT site_material_entries_reservation_fkey
    FOREIGN KEY (company_id, stock_reservation_id)
    REFERENCES stock_reservations (company_id, id) ON DELETE RESTRICT;

ALTER TABLE site_material_entries
    DROP CONSTRAINT IF EXISTS site_material_entries_order_item_fkey;
ALTER TABLE site_material_entries
    ADD CONSTRAINT site_material_entries_order_item_fkey
    FOREIGN KEY (company_id, purchase_order_item_id)
    REFERENCES purchase_order_items (company_id, id) ON DELETE RESTRICT;

-- Reserviert oder bestellt wird nur, was auch auf einen Artikel zeigt. Sonst
-- haetten wir eine Reservierung fuer eine Freitextzeile, und niemand koennte
-- sagen, wofuer.
ALTER TABLE site_material_entries
    DROP CONSTRAINT IF EXISTS site_material_entries_chain_needs_item_check;
ALTER TABLE site_material_entries
    ADD CONSTRAINT site_material_entries_chain_needs_item_check CHECK (
        stock_item_id IS NOT NULL
        OR (stock_reservation_id IS NULL AND purchase_order_item_id IS NULL)
    );

CREATE INDEX IF NOT EXISTS site_material_entries_order_item_idx
    ON site_material_entries (company_id, purchase_order_item_id)
    WHERE purchase_order_item_id IS NOT NULL;

COMMIT;
