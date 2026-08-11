-- Lieferscheine als Beleg, nicht als Bild.
--
-- Bisher landete ein Lieferschein im Dokumentenmodul: ein Foto oder ein PDF,
-- ablegbar und wiederfindbar, aber ohne Positionen. Was tatsaechlich geliefert
-- wurde, tippte jemand danach ein zweites Mal als Wareneingang ab - oder eben
-- nicht. Damit war der Beleg da und der Bestand trotzdem falsch.
--
-- Der Lieferschein wird deshalb ein eigener Datensatz mit Positionen, aus dem
-- die Materialbewegungen entstehen. Das Originaldokument bleibt, wo es
-- hingehoert: in `documents`. Es entsteht kein zweiter Ablageort, nur ein
-- Verweis.
--
-- ERFASSEN UND BUCHEN SIND ZWEI SCHRITTE
--
-- Ein Lieferschein wird oft im Stehen erfasst, waehrend der Fahrer wartet.
-- Deshalb ist er zuerst ein Entwurf: Positionen lassen sich korrigieren, ohne
-- dass am Bestand etwas passiert. Erst das Buchen erzeugt die Bewegungen, und
-- danach ist der Schein unveraenderlich - eine gebuchte Lieferung wird
-- storniert, nicht editiert.
--
-- Genau einmal buchen: `status` geht nur von 'draft' nach 'booked', und die
-- Nummer des Lieferanten darf es je Lieferant nur einmal geben. Beides
-- zusammen faengt den haeufigsten Fehler ab - denselben Schein zweimal
-- abzutippen, weil zwei Leute im Buero sitzen.
--
-- DIREKTLIEFERUNG
--
-- `target_location_id` ist der Ort, an dem die Ware wirklich ankommt. Bei
-- einer Direktlieferung ist das der Baustellenort, und die Ware laeuft nicht
-- kuenstlich ueber das Hauptlager. Ein Umweg, den es nie gab, waere im
-- Journal eine Luege.
--
-- ZUR BESTELLUNG
--
-- Die Zuordnung ist freiwillig, sowohl am Schein als auch an der Position:
-- geliefert wird auch ohne Bestellung, und auf einem Schein stehen manchmal
-- Positionen, die niemand bestellt hat. Wo sie da ist, wird sie beim Buchen
-- fortgeschrieben, und die Bestellung weiss, was offen bleibt.

BEGIN;

CREATE TABLE IF NOT EXISTS delivery_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
    supplier_id UUID NOT NULL,
    delivery_note_number VARCHAR(60) NOT NULL,
    delivered_on DATE NOT NULL,
    purchase_order_id UUID,
    target_location_id UUID NOT NULL,
    construction_site_id UUID,
    project_id UUID,
    document_id UUID,
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    note TEXT,
    booked_at TIMESTAMPTZ,
    booked_by_user_id UUID,
    cancel_reason TEXT,
    row_version BIGINT NOT NULL DEFAULT 1,
    created_by_user_id UUID NOT NULL,
    changed_by_user_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT delivery_notes_company_id_id_key UNIQUE (company_id, id),
    CONSTRAINT delivery_notes_supplier_fkey FOREIGN KEY (company_id, supplier_id)
        REFERENCES suppliers (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT delivery_notes_order_fkey FOREIGN KEY (company_id, purchase_order_id)
        REFERENCES purchase_orders (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT delivery_notes_target_fkey FOREIGN KEY (company_id, target_location_id)
        REFERENCES storage_locations (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT delivery_notes_site_fkey FOREIGN KEY (company_id, construction_site_id)
        REFERENCES construction_sites (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT delivery_notes_project_fkey FOREIGN KEY (company_id, project_id)
        REFERENCES projects (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT delivery_notes_document_fkey FOREIGN KEY (company_id, document_id)
        REFERENCES documents (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT delivery_notes_creator_fkey FOREIGN KEY (company_id, created_by_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT delivery_notes_changer_fkey FOREIGN KEY (company_id, changed_by_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT delivery_notes_booker_fkey FOREIGN KEY (company_id, booked_by_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT delivery_notes_number_check CHECK (BTRIM(delivery_note_number) <> ''),
    CONSTRAINT delivery_notes_status_check CHECK (status IN ('draft', 'booked', 'cancelled')),
    -- Gebucht heisst: es gibt Bewegungen, und dann steht auch fest, wer sie
    -- ausgeloest hat und wann.
    CONSTRAINT delivery_notes_booked_check CHECK (
        (status = 'booked' AND booked_at IS NOT NULL AND booked_by_user_id IS NOT NULL)
        OR (status <> 'booked' AND booked_at IS NULL AND booked_by_user_id IS NULL)
    ),
    CONSTRAINT delivery_notes_cancel_check CHECK (
        status <> 'cancelled' OR (cancel_reason IS NOT NULL AND BTRIM(cancel_reason) <> '')
    )
);

-- Denselben Schein zweimal abzutippen ist der haeufigste Fehler im Buero.
-- Stornierte zaehlen nicht mit: eine falsch erfasste Nummer soll erneut
-- vergeben werden koennen.
CREATE UNIQUE INDEX IF NOT EXISTS delivery_notes_number_unique
    ON delivery_notes (company_id, supplier_id, UPPER(BTRIM(delivery_note_number)))
    WHERE status <> 'cancelled';
CREATE INDEX IF NOT EXISTS delivery_notes_order_idx
    ON delivery_notes (company_id, purchase_order_id)
    WHERE purchase_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS delivery_notes_site_idx
    ON delivery_notes (company_id, construction_site_id, delivered_on DESC)
    WHERE construction_site_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS delivery_notes_open_idx
    ON delivery_notes (company_id, status, delivered_on DESC);

CREATE TABLE IF NOT EXISTS delivery_note_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    delivery_note_id UUID NOT NULL,
    item_id UUID NOT NULL,
    line_position INTEGER NOT NULL,
    quantity NUMERIC(14,3) NOT NULL,
    purchase_order_item_id UUID,
    supplier_item_number VARCHAR(60),
    unit_price NUMERIC(12,4),
    note TEXT,
    row_version BIGINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT delivery_note_items_company_id_id_key UNIQUE (company_id, id),
    CONSTRAINT delivery_note_items_note_fkey FOREIGN KEY (company_id, delivery_note_id)
        REFERENCES delivery_notes (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT delivery_note_items_item_fkey FOREIGN KEY (company_id, item_id)
        REFERENCES stock_items (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT delivery_note_items_order_item_fkey
        FOREIGN KEY (company_id, purchase_order_item_id)
        REFERENCES purchase_order_items (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT delivery_note_items_position_unique
        UNIQUE (company_id, delivery_note_id, line_position),
    CONSTRAINT delivery_note_items_position_check CHECK (line_position >= 1),
    CONSTRAINT delivery_note_items_quantity_check
        CHECK (quantity > 0 AND quantity <= 999999999),
    CONSTRAINT delivery_note_items_price_check CHECK (unit_price IS NULL OR unit_price >= 0)
);

CREATE INDEX IF NOT EXISTS delivery_note_items_note_idx
    ON delivery_note_items (company_id, delivery_note_id, line_position);
CREATE INDEX IF NOT EXISTS delivery_note_items_order_item_idx
    ON delivery_note_items (company_id, purchase_order_item_id)
    WHERE purchase_order_item_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Die Bewegung weiss, aus welchem Lieferschein sie stammt
-- ---------------------------------------------------------------------------
--
-- Ohne diesen Verweis waere die Belegkette an der wichtigsten Stelle
-- unterbrochen: vom Bestand zurueck zum Papier, das der Fahrer dagelassen hat.

ALTER TABLE stock_movements
    ADD COLUMN IF NOT EXISTS delivery_note_item_id UUID;

ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_delivery_item_fkey;
ALTER TABLE stock_movements
    ADD CONSTRAINT stock_movements_delivery_item_fkey
    FOREIGN KEY (company_id, delivery_note_item_id)
    REFERENCES delivery_note_items (company_id, id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS stock_movements_delivery_idx
    ON stock_movements (company_id, delivery_note_item_id)
    WHERE delivery_note_item_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Mandantentrennung und Schutz vor Loeschen
-- ---------------------------------------------------------------------------

ALTER TABLE delivery_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_note_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS delivery_notes_tenant_isolation ON delivery_notes;
CREATE POLICY delivery_notes_tenant_isolation ON delivery_notes
    USING (company_id = NULLIF(current_setting('app.current_company_id', TRUE), '')::UUID)
    WITH CHECK (company_id = NULLIF(current_setting('app.current_company_id', TRUE), '')::UUID);

DROP POLICY IF EXISTS delivery_note_items_tenant_isolation ON delivery_note_items;
CREATE POLICY delivery_note_items_tenant_isolation ON delivery_note_items
    USING (company_id = NULLIF(current_setting('app.current_company_id', TRUE), '')::UUID)
    WITH CHECK (company_id = NULLIF(current_setting('app.current_company_id', TRUE), '')::UUID);

DROP TRIGGER IF EXISTS stock_master_before_write_trigger ON delivery_notes;
CREATE TRIGGER stock_master_before_write_trigger
    BEFORE INSERT OR UPDATE ON delivery_notes
    FOR EACH ROW EXECUTE FUNCTION stock_master_before_write();

DROP TRIGGER IF EXISTS stock_master_before_write_trigger ON delivery_note_items;
CREATE TRIGGER stock_master_before_write_trigger
    BEFORE INSERT OR UPDATE ON delivery_note_items
    FOR EACH ROW EXECUTE FUNCTION stock_master_before_write();

DROP TRIGGER IF EXISTS stock_prevent_hard_delete_trigger ON delivery_notes;
CREATE TRIGGER stock_prevent_hard_delete_trigger
    BEFORE DELETE ON delivery_notes
    FOR EACH ROW EXECUTE FUNCTION stock_prevent_hard_delete();

-- Positionen eines Entwurfs duerfen verschwinden: solange nichts gebucht ist,
-- ist eine geloeschte Zeile ein Tippfehler und keine Geschichtsfaelschung.
-- Sobald der Schein gebucht ist, haengt an ihr eine Bewegung, und der
-- Fremdschluessel laesst sie ohnehin nicht mehr los.

GRANT SELECT, INSERT, UPDATE, DELETE ON delivery_notes TO schaefchen_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON delivery_note_items TO schaefchen_api;

COMMIT;
