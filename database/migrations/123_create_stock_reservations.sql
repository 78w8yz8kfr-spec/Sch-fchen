-- Reservierungen: was da liegt, aber jemandem gehoert.
--
-- Ohne sie beantwortet das Lager nur "wie viel liegt hier". Die Frage, an der
-- der Betrieb haengt, ist eine andere: wie viel davon kann ich mitnehmen? Wer
-- am Montag 100 Steckdosen fuer die Schule zurueckgelegt hat und am Dienstag
-- feststellt, dass ein Kollege sie fuer eine andere Baustelle mitgenommen hat,
-- steht mit einem leeren Karton da - und der Bestand war die ganze Zeit
-- "richtig".
--
-- WAS RESERVIERT IST, GEHT VOM BESTAND AB
--
-- Frei verfuegbar = physischer Bestand minus offene Reservierungen. Der
-- physische Bestand aendert sich dabei nicht: die Ware liegt weiter im Regal,
-- sie ist nur nicht mehr fuer jeden da. Erst die Entnahme bewegt sie.
--
-- Deshalb sind Reservierung und Bewegung zwei verschiedene Dinge und stehen in
-- zwei Tabellen. Eine Reservierung als Bewegung zu buchen waere bequemer
-- gewesen und haette das Journal verdorben: im Bestandsverlauf staende dann
-- eine Entnahme, die nie stattgefunden hat.
--
-- DIE EIGENE RESERVIERUNG BLOCKIERT NICHT SICH SELBST
--
-- Holt jemand Material fuer genau die Baustelle, fuer die reserviert wurde,
-- wird die Reservierung dabei aufgebraucht statt zu blockieren. Sonst haette
-- sich jede Reservierung selbst im Weg gestanden - der haeufigste Grund,
-- warum solche Funktionen im Alltag wieder abgeschaltet werden.
--
-- ZWEI MENGEN, NICHT EINE
--
-- `quantity` ist, was zurueckgelegt wurde, `quantity_fulfilled`, was davon
-- schon geholt ist. Die Differenz ist das, was noch blockiert. Eine
-- Reservierung nach und nach abzubauen ist der Normalfall: der Trupp holt
-- morgens die Haelfte und mittags den Rest.

BEGIN;

CREATE TABLE IF NOT EXISTS stock_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
    item_id UUID NOT NULL,
    location_id UUID NOT NULL,
    construction_site_id UUID,
    project_id UUID,
    quantity NUMERIC(14,3) NOT NULL,
    quantity_fulfilled NUMERIC(14,3) NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'open',
    needed_on DATE,
    note TEXT,
    release_reason TEXT,
    row_version BIGINT NOT NULL DEFAULT 1,
    created_by_user_id UUID NOT NULL,
    changed_by_user_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT stock_reservations_company_id_id_key UNIQUE (company_id, id),
    CONSTRAINT stock_reservations_item_fkey FOREIGN KEY (company_id, item_id)
        REFERENCES stock_items (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT stock_reservations_location_fkey FOREIGN KEY (company_id, location_id)
        REFERENCES storage_locations (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT stock_reservations_site_fkey FOREIGN KEY (company_id, construction_site_id)
        REFERENCES construction_sites (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT stock_reservations_project_fkey FOREIGN KEY (company_id, project_id)
        REFERENCES projects (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT stock_reservations_creator_fkey FOREIGN KEY (company_id, created_by_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT stock_reservations_changer_fkey FOREIGN KEY (company_id, changed_by_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT stock_reservations_quantity_check
        CHECK (quantity > 0 AND quantity <= 999999999),
    -- Mehr abholen als zurueckgelegt wurde ist keine Reservierung mehr.
    CONSTRAINT stock_reservations_fulfilled_check
        CHECK (quantity_fulfilled >= 0 AND quantity_fulfilled <= quantity),
    CONSTRAINT stock_reservations_status_check
        CHECK (status IN ('open', 'fulfilled', 'released')),
    -- Aufgehoben wird mit Grund: eine Reservierung, die kommentarlos
    -- verschwindet, ist genau der Streit, den sie verhindern sollte.
    CONSTRAINT stock_reservations_release_check CHECK (
        status <> 'released' OR (release_reason IS NOT NULL AND BTRIM(release_reason) <> '')
    ),
    CONSTRAINT stock_reservations_fulfilled_status_check CHECK (
        status <> 'fulfilled' OR quantity_fulfilled = quantity
    )
);

-- Die wichtigste Abfrage ist "was ist an diesem Ort fuer diesen Artikel noch
-- offen" - sie laeuft bei jeder Entnahme.
CREATE INDEX IF NOT EXISTS stock_reservations_open_idx
    ON stock_reservations (company_id, item_id, location_id)
    WHERE status = 'open';
CREATE INDEX IF NOT EXISTS stock_reservations_site_idx
    ON stock_reservations (company_id, construction_site_id, status)
    WHERE construction_site_id IS NOT NULL;

ALTER TABLE stock_reservations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stock_reservations_tenant_isolation ON stock_reservations;
CREATE POLICY stock_reservations_tenant_isolation ON stock_reservations
    USING (company_id = NULLIF(current_setting('app.current_company_id', TRUE), '')::UUID)
    WITH CHECK (company_id = NULLIF(current_setting('app.current_company_id', TRUE), '')::UUID);

DROP TRIGGER IF EXISTS stock_master_before_write_trigger ON stock_reservations;
CREATE TRIGGER stock_master_before_write_trigger
    BEFORE INSERT OR UPDATE ON stock_reservations
    FOR EACH ROW EXECUTE FUNCTION stock_master_before_write();

DROP TRIGGER IF EXISTS stock_prevent_hard_delete_trigger ON stock_reservations;
CREATE TRIGGER stock_prevent_hard_delete_trigger
    BEFORE DELETE ON stock_reservations
    FOR EACH ROW EXECUTE FUNCTION stock_prevent_hard_delete();

GRANT SELECT, INSERT, UPDATE ON stock_reservations TO schaefchen_api;

-- ---------------------------------------------------------------------------
-- Frei verfuegbar
-- ---------------------------------------------------------------------------
--
-- Als Sicht und nicht als gespeicherte Zahl: sie folgt aus Bestand und
-- Reservierungen, und eine dritte gepflegte Zahl waere die erste, die nicht
-- mehr stimmt.

CREATE OR REPLACE VIEW stock_availability AS
SELECT bestand.company_id,
       bestand.item_id,
       bestand.location_id,
       bestand.quantity AS physical_quantity,
       COALESCE(reserviert.summe, 0) AS reserved_quantity,
       bestand.quantity - COALESCE(reserviert.summe, 0) AS free_quantity
FROM stock_levels AS bestand
LEFT JOIN (
    SELECT company_id, item_id, location_id,
           SUM(quantity - quantity_fulfilled) AS summe
    FROM stock_reservations
    WHERE status = 'open'
    GROUP BY company_id, item_id, location_id
) AS reserviert
  ON reserviert.company_id = bestand.company_id
 AND reserviert.item_id = bestand.item_id
 AND reserviert.location_id = bestand.location_id;

GRANT SELECT ON stock_availability TO schaefchen_api;

-- ---------------------------------------------------------------------------
-- Meldebestand
-- ---------------------------------------------------------------------------
--
-- Bisher gab es Mindestbestand und Zielbestand. Der Meldebestand liegt
-- dazwischen: bei ihm wird nachbestellt, damit der Mindestbestand gar nicht
-- erst unterschritten wird. Fehlt er, bleibt es beim Mindestbestand - so
-- verhalten sich alle bestehenden Artikel weiter wie bisher.

ALTER TABLE stock_items
    ADD COLUMN IF NOT EXISTS reorder_point NUMERIC(14,3);

ALTER TABLE stock_items DROP CONSTRAINT IF EXISTS stock_items_reorder_point_check;
ALTER TABLE stock_items ADD CONSTRAINT stock_items_reorder_point_check CHECK (
    reorder_point IS NULL
    OR (reorder_point >= minimum_stock AND reorder_point <= 999999999)
);

COMMIT;
