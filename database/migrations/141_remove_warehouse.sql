-- Die Lagerverwaltung wird vollstaendig zurueckgenommen.
--
-- Sie kam mit Migration 107 und wuchs bis 140 ueber vierzehn Fassungen. Der
-- Betrieb hat entschieden, sie wieder abzuschaffen; diese Migration nimmt zu
-- Ende, was 107 begonnen hat.
--
-- WAS HIER VERLOREN GEHT
--
-- Alles: gebuchte Bestaende, das Bewegungsjournal, Lieferscheine mit ihren
-- Positionen, Bestellungen, Inventuren, angelegte Artikel, Lagerplaetze,
-- Strichcodes und Etiketten. Das ist ausdruecklich gewollt und ausdruecklich
-- nicht umkehrbar. Wer die Daten spaeter doch noch braucht, findet sie nur
-- in einer Sicherung, die vor dieser Migration entstanden ist.
--
-- WAS BLEIBT
--
-- Die Materialliste der Baustelle. Sie gab es vor dem Lager, sie haengt am
-- eigenen Modulschluessel 'materials' und sie behaelt ihre Zeilen mit Menge
-- und Status. Nur die drei Spalten, mit denen sie ans Lager gebunden war,
-- fallen weg - danach zeigt sie wieder das, was jemand eingetragen hat, und
-- nicht mehr, was davon im Regal liegt.
--
-- Die Lieferanten (`suppliers`) fallen mit. Sie kamen mit dem Lager und
-- werden ausserhalb davon nirgends verwendet.
--
-- REIHENFOLGE
--
-- Zuerst die Spalten an fremden Tabellen, dann die eigenen Tabellen in der
-- umgekehrten Reihenfolge ihrer Abhaengigkeiten. `CASCADE` steht bewusst
-- dabei: die vierzehn Tabellen verweisen kreuz und quer aufeinander, und ein
-- vergessener Fremdschluessel soll die Migration nicht auf halbem Weg
-- steckenlassen. Ausserhalb des Lagers zeigt nichts auf diese Tabellen -
-- deshalb reisst `CASCADE` hier auch nichts mit, was bleiben sollte.
--
-- Idempotent: `IF EXISTS` ueberall, damit ein zweiter Lauf nichts anderes
-- tut als der erste.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Die Materialliste der Baustelle vom Lager loesen
-- ---------------------------------------------------------------------------

ALTER TABLE site_material_entries
    DROP CONSTRAINT IF EXISTS site_material_entries_stock_item_fkey,
    DROP CONSTRAINT IF EXISTS site_material_entries_reservation_fkey,
    DROP CONSTRAINT IF EXISTS site_material_entries_order_item_fkey,
    DROP CONSTRAINT IF EXISTS site_material_entries_chain_needs_item_check;

ALTER TABLE site_material_entries
    DROP COLUMN IF EXISTS stock_item_id,
    DROP COLUMN IF EXISTS stock_reservation_id,
    DROP COLUMN IF EXISTS purchase_order_item_id;

-- ---------------------------------------------------------------------------
-- 2. Sichten und Tabellen
-- ---------------------------------------------------------------------------

DROP VIEW IF EXISTS stock_availability CASCADE;

DROP TABLE IF EXISTS stock_reservations CASCADE;
DROP TABLE IF EXISTS delivery_note_items CASCADE;
DROP TABLE IF EXISTS delivery_notes CASCADE;
DROP TABLE IF EXISTS stock_inventory_counts CASCADE;
DROP TABLE IF EXISTS stock_inventory_sessions CASCADE;
DROP TABLE IF EXISTS stock_history CASCADE;
DROP TABLE IF EXISTS stock_movements CASCADE;
DROP TABLE IF EXISTS stock_levels CASCADE;
DROP TABLE IF EXISTS purchase_order_items CASCADE;
DROP TABLE IF EXISTS purchase_orders CASCADE;
DROP TABLE IF EXISTS stock_labels CASCADE;
DROP TABLE IF EXISTS stock_item_barcodes CASCADE;
DROP TABLE IF EXISTS stock_items CASCADE;
DROP TABLE IF EXISTS storage_locations CASCADE;
DROP TABLE IF EXISTS stock_item_groups CASCADE;
DROP TABLE IF EXISTS stock_settings CASCADE;
DROP TABLE IF EXISTS suppliers CASCADE;

-- ---------------------------------------------------------------------------
-- 3. Funktionen
--
-- Die Trigger sind mit ihren Tabellen gefallen; die Funktionen dahinter
-- bleiben sonst als Leichen stehen. `companies_seed_stock_master_data` haengt
-- an `companies` und muss zuerst als Trigger weg, sonst scheitert jede
-- Neuanlage einer Firma an einer Funktion, die auf gedroppte Tabellen zeigt.
-- ---------------------------------------------------------------------------

-- Zwei Ausloeser haengen an `companies` und wuerden jede neu angelegte Firma
-- wieder mit Lager ausstatten: der eine saet die Stammdaten, der andere die
-- Rolle. Ohne diesen Schritt hat die naechste Firma wieder einen Lageristen -
-- beim Pruefen genau so passiert.
DROP TRIGGER IF EXISTS companies_seed_stock_master_data_trigger ON companies;
DROP TRIGGER IF EXISTS companies_create_warehouse_role_trigger ON companies;

DROP FUNCTION IF EXISTS companies_create_warehouse_role() CASCADE;
DROP FUNCTION IF EXISTS create_warehouse_role_for_company(UUID) CASCADE;
DROP FUNCTION IF EXISTS companies_seed_stock_master_data() CASCADE;
DROP FUNCTION IF EXISTS seed_stock_master_data(UUID) CASCADE;
DROP FUNCTION IF EXISTS stock_event_immutable() CASCADE;
DROP FUNCTION IF EXISTS stock_item_barcodes_before_update() CASCADE;
DROP FUNCTION IF EXISTS stock_item_barcodes_before_write() CASCADE;
DROP FUNCTION IF EXISTS stock_items_protect_unit() CASCADE;
DROP FUNCTION IF EXISTS stock_master_before_write() CASCADE;
DROP FUNCTION IF EXISTS stock_movements_apply_level() CASCADE;
DROP FUNCTION IF EXISTS stock_normalize_gtin(TEXT) CASCADE;
DROP FUNCTION IF EXISTS stock_prevent_hard_delete() CASCADE;
DROP FUNCTION IF EXISTS storage_locations_set_depth() CASCADE;

-- ---------------------------------------------------------------------------
-- 4. Rolle und Modul
--
-- Hier wird widerrufen und stillgelegt, nicht geloescht - und zwar bewusst
-- anders als bei den Lagerdaten oben.
--
-- Die Datenbank verbietet das Loeschen von Rollenzuweisungen ausdruecklich
-- ("Zuweisung stattdessen widerrufen"). Diese Regel ist aelter als das Lager
-- und gilt aus einem eigenen Grund: wer wann welche Berechtigung hatte, ist
-- Personalgeschichte des Betriebs und nicht Teil der Lagerverwaltung. Sie
-- bleibt lesbar, auch wenn das Lager verschwindet.
--
-- Die Rolle selbst wird stillgelegt statt entfernt, weil die widerrufenen
-- Zuweisungen weiter auf sie zeigen. Stillgelegt taucht sie in keiner
-- Auswahl mehr auf - genau das ist gemeint, wenn das Lager weg soll.
-- ---------------------------------------------------------------------------

UPDATE user_roles
SET revoked_at = CURRENT_TIMESTAMP,
    reason = 'Lagerverwaltung abgeschafft'
WHERE revoked_at IS NULL
  AND role_id IN (SELECT id FROM roles WHERE role_key = 'warehouse_manager');

UPDATE roles
SET status = 'inactive', deactivated_at = CURRENT_TIMESTAMP
WHERE role_key = 'warehouse_manager' AND status = 'active';

-- Die Freigaben der Firmen dagegen verschwinden ganz: ein Modul, das es
-- nicht mehr gibt, kann niemand mehr gebucht haben.
DELETE FROM company_module_entitlements
WHERE module_id IN (SELECT id FROM module_catalog WHERE module_key = 'warehouse');

DELETE FROM module_catalog WHERE module_key = 'warehouse';

COMMIT;
