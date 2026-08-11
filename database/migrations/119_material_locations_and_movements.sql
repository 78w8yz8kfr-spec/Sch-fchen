-- Fundament der Materialwirtschaft: Orte, Bewegungsarten, Bestellziel.
--
-- Die Lagerverwaltung rechnet Bestaende seit Migration 107 ausschliesslich aus
-- Bewegungen; ein Bestand laesst sich nicht setzen, nur buchen. Das bleibt so.
-- Was fehlte, waren die Orte und die Bewegungsarten, ohne die eine Handwerks-
-- Materialkette nicht abbildbar ist. Diese Migration ergaenzt genau das und
-- fasst keine bestehende Zeile an.
--
-- 1. FAHRZEUGE SIND LAGERORTE
--
-- Ein Transporter ist der haeufigste Lagerort im Betrieb: morgens beladen,
-- abends halb leer, und niemand weiss, was drin liegt. Bisher kannte
-- `storage_locations` nur Lager, Werkstatt, Baustelle und "sonstiges" - ein
-- Fahrzeug war bestenfalls ein "sonstiger Ort" ohne Verbindung zum Fuhrpark.
-- Es bekommt deshalb dieselbe Behandlung wie die Baustelle: eine eigene Art
-- und einen Verweis auf den Datensatz, um den es geht. Der Fuhrpark bleibt
-- fuehrend; der Lagerort haengt daran und traegt keinen zweiten Namen fuers
-- Kennzeichen.
--
-- 2. RETOURE UND SPERRLAGER
--
-- Beides sind fachlich eigene Orte, keine Regale. Was zum Lieferanten zurueck
-- soll, darf nicht im normalen Bestand mitgezaehlt werden - sonst greift
-- jemand danach. Dasselbe gilt fuer Beschaedigtes. Sie sind trotzdem Orte und
-- keine Zustaende am Artikel: eine Palette Sperrbestand steht irgendwo.
--
-- 3. VERBAUT
--
-- "Auf der Baustelle" und "verbaut" sind zwei verschiedene Dinge, und die
-- Verwechslung ist der haeufigste Fehler in der Materialabrechnung. Bisher
-- verschwand Material von der Baustelle nur durch Rueckgabe oder Umbuchung;
-- was verbaut wurde, blieb im Baustellenbestand stehen. Die neue Bewegungsart
-- `consumed` bucht es aus - mit Quelle und ohne Ziel, wie eine Entnahme, denn
-- verbaut ist verbaut.
--
-- Bewusst NICHT gerechnet wird "Verbrauch = geliefert minus zurueck". Sobald
-- eine Umbuchung auf eine zweite Baustelle dazwischen liegt, ist diese Formel
-- falsch, und sie ist auf laufenden Baustellen immer zu frueh: was heute noch
-- im Container steht, ist nicht verbraucht.
--
-- 4. LIEFERZIEL DER BESTELLUNG
--
-- Eine Bestellung ging bisher an einen Lieferanten und sonst nirgendwohin.
-- Die Direktlieferung auf die Baustelle - der Normalfall bei groesseren
-- Mengen - liess sich damit nicht planen. Die Bestellung bekommt deshalb
-- Lieferziel, Projekt und Baustelle. Alle drei freiwillig: eine Bestellung
-- ins Hauptlager braucht keine Baustelle.
--
-- 5. VERLAUF
--
-- `stock_history` kannte die Stammdaten, aber nicht die Bewegung selbst. Eine
-- stornierte Buchung liess sich damit nicht begruenden. Die Liste der
-- erlaubten Gegenstaende waechst um die Bewegung und um die Belege, die in den
-- naechsten Stufen dazukommen.

BEGIN;

-- ---------------------------------------------------------------------------
-- Lagerorte: Fahrzeug, Retoure, Sperrlager
-- ---------------------------------------------------------------------------

ALTER TABLE storage_locations
    ADD COLUMN IF NOT EXISTS vehicle_id UUID;

ALTER TABLE storage_locations
    DROP CONSTRAINT IF EXISTS storage_locations_vehicle_fkey;
ALTER TABLE storage_locations
    ADD CONSTRAINT storage_locations_vehicle_fkey
    FOREIGN KEY (company_id, vehicle_id)
    REFERENCES vehicles (company_id, id) ON DELETE RESTRICT;

ALTER TABLE storage_locations DROP CONSTRAINT IF EXISTS storage_locations_type_check;
ALTER TABLE storage_locations ADD CONSTRAINT storage_locations_type_check CHECK (
    location_type IN (
        'warehouse', 'workshop', 'construction_site', 'vehicle',
        'returns', 'blocked', 'other'
    )
);

-- Genau die Orte, die auf einen anderen Datensatz zeigen, duerfen ihn haben -
-- und muessen ihn haben. Ein Fahrzeugort ohne Fahrzeug waere ein Ort, dessen
-- Name niemand pflegt; ein Regal mit Fahrzeug waere ein Fehler.
ALTER TABLE storage_locations DROP CONSTRAINT IF EXISTS storage_locations_site_target_check;
ALTER TABLE storage_locations ADD CONSTRAINT storage_locations_site_target_check CHECK (
    (location_type = 'construction_site' AND construction_site_id IS NOT NULL AND vehicle_id IS NULL)
    OR (location_type = 'vehicle' AND vehicle_id IS NOT NULL AND construction_site_id IS NULL)
    OR (location_type NOT IN ('construction_site', 'vehicle')
        AND construction_site_id IS NULL AND vehicle_id IS NULL)
);

-- Ein Fahrzeug hat genau einen aktiven Lagerort, wie eine Baustelle.
CREATE UNIQUE INDEX IF NOT EXISTS storage_locations_vehicle_unique
    ON storage_locations (company_id, vehicle_id)
    WHERE vehicle_id IS NOT NULL AND status = 'active';

-- ---------------------------------------------------------------------------
-- Bewegungsart "verbaut"
-- ---------------------------------------------------------------------------

ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_type_check;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_type_check CHECK (
    movement_type IN (
        'opening', 'receipt', 'issue', 'transfer', 'return',
        'consumed', 'correction', 'scrap'
    )
);

ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_direction_check;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_direction_check CHECK (
    (movement_type IN ('opening', 'receipt', 'return')
        AND target_location_id IS NOT NULL AND source_location_id IS NULL)
    OR (movement_type IN ('issue', 'scrap', 'consumed')
        AND source_location_id IS NOT NULL AND target_location_id IS NULL)
    OR (movement_type = 'transfer'
        AND source_location_id IS NOT NULL AND target_location_id IS NOT NULL
        AND source_location_id <> target_location_id)
    OR (movement_type = 'correction'
        AND (source_location_id IS NULL) <> (target_location_id IS NULL))
);

-- Verbaut wird auf einer Baustelle, nirgends sonst. Ohne diese Bedingung
-- liesse sich Material "verbauen", ohne dass jemand sagen koennte, wo - und
-- genau daran haengt spaeter die Nachkalkulation.
ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_consumed_site_check;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_consumed_site_check CHECK (
    movement_type <> 'consumed' OR construction_site_id IS NOT NULL
);

-- ---------------------------------------------------------------------------
-- Lieferziel der Bestellung
-- ---------------------------------------------------------------------------

ALTER TABLE purchase_orders
    ADD COLUMN IF NOT EXISTS target_location_id UUID,
    ADD COLUMN IF NOT EXISTS construction_site_id UUID,
    ADD COLUMN IF NOT EXISTS project_id UUID;

ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_target_fkey;
ALTER TABLE purchase_orders
    ADD CONSTRAINT purchase_orders_target_fkey
    FOREIGN KEY (company_id, target_location_id)
    REFERENCES storage_locations (company_id, id) ON DELETE RESTRICT;

ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_site_fkey;
ALTER TABLE purchase_orders
    ADD CONSTRAINT purchase_orders_site_fkey
    FOREIGN KEY (company_id, construction_site_id)
    REFERENCES construction_sites (company_id, id) ON DELETE RESTRICT;

ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_project_fkey;
ALTER TABLE purchase_orders
    ADD CONSTRAINT purchase_orders_project_fkey
    FOREIGN KEY (company_id, project_id)
    REFERENCES projects (company_id, id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS purchase_orders_site_idx
    ON purchase_orders (company_id, construction_site_id)
    WHERE construction_site_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Verlauf: die Bewegung und die Belege der naechsten Stufen
-- ---------------------------------------------------------------------------

ALTER TABLE stock_history DROP CONSTRAINT IF EXISTS stock_history_entity_check;
ALTER TABLE stock_history ADD CONSTRAINT stock_history_entity_check CHECK (
    entity_type IN (
        'stock_item', 'stock_item_barcode', 'storage_location', 'stock_label',
        'supplier', 'purchase_order', 'stock_settings', 'inventory_session',
        'stock_movement', 'delivery_note', 'stock_reservation'
    )
);

COMMIT;
