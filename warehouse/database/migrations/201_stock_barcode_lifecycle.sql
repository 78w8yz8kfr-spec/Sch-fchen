-- Codes eines Artikels bekommen einen Lebenslauf.
--
-- Migration 200 legt Codes an und laesst sie nie wieder los: die Tabelle hat
-- kein UPDATE-Recht, keinen Status und einen unbedingt eindeutigen Index. Ein
-- vertippter Code blockiert damit dauerhaft den richtigen, denn derselbe Code
-- laesst sich kein zweites Mal speichern und der falsche nicht entfernen.
--
-- Widerrufen statt loeschen: der Code bleibt in der Historie lesbar, findet
-- aber nichts mehr. Der eindeutige Index gilt nur noch fuer aktive Codes,
-- damit ein zurueckgenommener Code spaeter erneut vergeben werden kann.

BEGIN;

ALTER TABLE stock_item_barcodes
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS revoked_by_user_id UUID,
    ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS revoke_reason TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'stock_item_barcodes_status_check'
    ) THEN
        ALTER TABLE stock_item_barcodes
            ADD CONSTRAINT stock_item_barcodes_status_check
            CHECK (status IN ('active', 'revoked'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'stock_item_barcodes_revoke_check'
    ) THEN
        ALTER TABLE stock_item_barcodes
            ADD CONSTRAINT stock_item_barcodes_revoke_check
            CHECK (
                (status = 'active' AND revoked_at IS NULL AND revoked_by_user_id IS NULL
                 AND revoke_reason IS NULL)
                OR (status = 'revoked' AND revoked_at IS NOT NULL AND revoked_by_user_id IS NOT NULL
                    AND revoke_reason IS NOT NULL AND BTRIM(revoke_reason) <> '')
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'stock_item_barcodes_revoker_fkey'
    ) THEN
        ALTER TABLE stock_item_barcodes
            ADD CONSTRAINT stock_item_barcodes_revoker_fkey
            FOREIGN KEY (company_id, revoked_by_user_id)
            REFERENCES users (company_id, id) ON DELETE RESTRICT;
    END IF;
END;
$$;

-- Der unbedingte Index weicht dem bedingten: nur aktive Codes muessen
-- eindeutig sein.
ALTER TABLE stock_item_barcodes
    DROP CONSTRAINT IF EXISTS stock_item_barcodes_code_unique;

CREATE UNIQUE INDEX IF NOT EXISTS stock_item_barcodes_active_code_unique
    ON stock_item_barcodes (company_id, code_normalized) WHERE status = 'active';

DROP INDEX IF EXISTS stock_item_barcodes_primary_unique;
CREATE UNIQUE INDEX IF NOT EXISTS stock_item_barcodes_primary_unique
    ON stock_item_barcodes (company_id, item_id) WHERE is_primary AND status = 'active';

CREATE INDEX IF NOT EXISTS stock_item_barcodes_item_idx
    ON stock_item_barcodes (company_id, item_id) WHERE status = 'active';

-- Widerrufen ist eine Aenderung, kein Loeschen. Mehr als den Widerruf soll
-- die API aber nicht koennen: Code, Art und Gebindemenge bleiben fest, weil
-- sonst eine Zuordnung nachtraeglich umgedeutet werden koennte.
CREATE OR REPLACE FUNCTION stock_item_barcodes_before_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.company_id <> OLD.company_id OR NEW.item_id <> OLD.item_id
       OR NEW.code_raw <> OLD.code_raw OR NEW.code_normalized <> OLD.code_normalized
       OR NEW.code_type <> OLD.code_type OR NEW.pack_quantity <> OLD.pack_quantity THEN
        RAISE EXCEPTION 'An einem Code lässt sich nur der Widerruf ändern.';
    END IF;
    IF OLD.status = 'revoked' AND NEW.status = 'active' THEN
        RAISE EXCEPTION 'Ein widerrufener Code wird nicht wiederbelebt; bitte neu anlegen.';
    END IF;
    NEW.revoke_reason := NULLIF(BTRIM(NEW.revoke_reason), '');
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stock_item_barcodes_before_update_trigger ON stock_item_barcodes;
CREATE TRIGGER stock_item_barcodes_before_update_trigger
    BEFORE UPDATE ON stock_item_barcodes
    FOR EACH ROW EXECUTE FUNCTION stock_item_barcodes_before_update();

GRANT UPDATE ON stock_item_barcodes TO schaefchen_api;

COMMENT ON COLUMN stock_item_barcodes.status IS
    'Aktiv oder widerrufen; nur aktive Codes sind eindeutig und werden gefunden.';

COMMIT;
