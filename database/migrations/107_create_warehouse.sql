-- Lagerverwaltung: mandantenfaehiger Materialbestand mit Barcodes und QR-Codes.
--
-- Ein Artikel ist eine Sorte, kein Exemplar. Deshalb gibt es Mengen an Orten
-- statt Besitzer je Gegenstand. Das Journal stock_movements ist die Wahrheit;
-- stock_levels wird ausschliesslich durch einen Trigger daraus fortgeschrieben
-- und ist fuer die API nicht schreibbar. Herstellercodes werden auf GTIN-14
-- normalisiert, damit derselbe Artikel auch nach einem EAN-8- oder
-- UPC-A-Scan wiedergefunden wird. Selbst gedruckte Etiketten enthalten nur
-- eine zufaellige UUID ohne Namen, Artikelnummer oder Firmendaten.
--
-- Fassung 1 kennt bewusst keine Fahrzeuge als Lagerort und verlangt die
-- Baustelle bei einer Entnahme nicht. Beides ist als Firmenregel
-- beziehungsweise spaetere Migration vorgesehen.

BEGIN;

-- Das Lager bekommt einen eigenen Modulschluessel.
--
-- Nicht 'materials': das ist die Materialverwaltung der Baustelle - was der
-- Vorarbeiter braucht, bestellt und verbaut hat. Sie gehoert seit jeher zum
-- Standardumfang und bleibt dort. Das Lager ist etwas anderes: Artikelstamm,
-- Bestand je Lagerplatz, Wareneingang, Inventur, Bestellwesen. Ein eigener,
-- verkaufbarer Bereich - deshalb ein eigener Schluessel.
--
-- Freigeschaltet wird hier niemand. 'warehouse' steht nicht im Standardumfang
-- von platform_default_module_keys(); die Plattform erteilt ihn je Firma.
INSERT INTO module_catalog (
    module_key, name, description, category, is_special, requires_platform_approval
) VALUES (
    'warehouse', 'Lagerverwaltung',
    'Artikelstamm, Lagerbestand, Barcodes, Wareneingang, Inventur und Bestellwesen.',
    'business', FALSE, TRUE
)
ON CONFLICT (module_key) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    is_special = EXCLUDED.is_special,
    requires_platform_approval = EXCLUDED.requires_platform_approval;

-- ---------------------------------------------------------------------------
-- Stammdaten
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS stock_item_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
    group_key VARCHAR(60) NOT NULL,
    name VARCHAR(100) NOT NULL,
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    row_version BIGINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT stock_item_groups_company_id_id_key UNIQUE (company_id, id),
    CONSTRAINT stock_item_groups_key_unique UNIQUE (company_id, group_key),
    CONSTRAINT stock_item_groups_key_check CHECK (group_key ~ '^[a-z][a-z0-9_]*$'),
    CONSTRAINT stock_item_groups_name_check CHECK (BTRIM(name) <> ''),
    CONSTRAINT stock_item_groups_status_check CHECK (status IN ('active', 'archived'))
);

CREATE UNIQUE INDEX IF NOT EXISTS stock_item_groups_name_unique
    ON stock_item_groups (company_id, LOWER(name));

CREATE TABLE IF NOT EXISTS suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
    supplier_number VARCHAR(40) NOT NULL,
    name VARCHAR(160) NOT NULL,
    customer_number VARCHAR(60),
    contact_name VARCHAR(120),
    email VARCHAR(180),
    phone VARCHAR(40),
    note TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    row_version BIGINT NOT NULL DEFAULT 1,
    created_by_user_id UUID NOT NULL,
    changed_by_user_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT suppliers_company_id_id_key UNIQUE (company_id, id),
    CONSTRAINT suppliers_number_unique UNIQUE (company_id, supplier_number),
    CONSTRAINT suppliers_creator_fkey FOREIGN KEY (company_id, created_by_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT suppliers_changer_fkey FOREIGN KEY (company_id, changed_by_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT suppliers_number_check CHECK (BTRIM(supplier_number) <> ''),
    CONSTRAINT suppliers_name_check CHECK (BTRIM(name) <> ''),
    CONSTRAINT suppliers_email_check CHECK (email IS NULL OR email LIKE '%_@_%'),
    CONSTRAINT suppliers_status_check CHECK (status IN ('active', 'archived'))
);

CREATE UNIQUE INDEX IF NOT EXISTS suppliers_name_unique
    ON suppliers (company_id, LOWER(name)) WHERE status = 'active';

-- Lagerplaetze bilden hoechstens drei Ebenen ab: Lager, Regal, Fach. Fahrzeuge
-- sind in Fassung 1 ausdruecklich kein Lagerort; die Spalte dafuer wird erst
-- ergaenzt, wenn der Fuhrpark tatsaechlich Material fuehren soll.
CREATE TABLE IF NOT EXISTS storage_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
    name VARCHAR(140) NOT NULL,
    location_type VARCHAR(30) NOT NULL,
    parent_location_id UUID,
    construction_site_id UUID,
    depth INTEGER NOT NULL DEFAULT 1,
    note TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    row_version BIGINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT storage_locations_company_id_id_key UNIQUE (company_id, id),
    CONSTRAINT storage_locations_parent_fkey FOREIGN KEY (company_id, parent_location_id)
        REFERENCES storage_locations (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT storage_locations_site_fkey FOREIGN KEY (company_id, construction_site_id)
        REFERENCES construction_sites (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT storage_locations_name_check CHECK (BTRIM(name) <> ''),
    CONSTRAINT storage_locations_type_check CHECK (
        location_type IN ('warehouse', 'workshop', 'construction_site', 'other')
    ),
    CONSTRAINT storage_locations_site_target_check CHECK (
        (location_type = 'construction_site' AND construction_site_id IS NOT NULL)
        OR (location_type <> 'construction_site' AND construction_site_id IS NULL)
    ),
    CONSTRAINT storage_locations_depth_check CHECK (depth BETWEEN 1 AND 3),
    CONSTRAINT storage_locations_self_check CHECK (parent_location_id IS NULL OR parent_location_id <> id),
    CONSTRAINT storage_locations_status_check CHECK (status IN ('active', 'archived'))
);

-- Ein Fachname wie "A1" darf in jedem Regal einmal vorkommen, aber nicht
-- zweimal im selben.
CREATE UNIQUE INDEX IF NOT EXISTS storage_locations_name_unique
    ON storage_locations (
        company_id,
        COALESCE(parent_location_id, '00000000-0000-0000-0000-000000000000'::UUID),
        LOWER(name)
    ) WHERE status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS storage_locations_site_unique
    ON storage_locations (company_id, construction_site_id)
    WHERE construction_site_id IS NOT NULL AND status = 'active';
CREATE INDEX IF NOT EXISTS storage_locations_parent_idx
    ON storage_locations (company_id, parent_location_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS stock_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
    item_number VARCHAR(40) NOT NULL,
    name VARCHAR(180) NOT NULL,
    group_id UUID NOT NULL,
    unit VARCHAR(20) NOT NULL,
    manufacturer VARCHAR(120),
    manufacturer_number VARCHAR(80),
    default_supplier_id UUID,
    default_location_id UUID,
    minimum_stock NUMERIC(14,3) NOT NULL DEFAULT 0,
    target_stock NUMERIC(14,3),
    note TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    row_version BIGINT NOT NULL DEFAULT 1,
    created_by_user_id UUID NOT NULL,
    changed_by_user_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT stock_items_company_id_id_key UNIQUE (company_id, id),
    CONSTRAINT stock_items_number_unique UNIQUE (company_id, item_number),
    CONSTRAINT stock_items_group_fkey FOREIGN KEY (company_id, group_id)
        REFERENCES stock_item_groups (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT stock_items_supplier_fkey FOREIGN KEY (company_id, default_supplier_id)
        REFERENCES suppliers (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT stock_items_location_fkey FOREIGN KEY (company_id, default_location_id)
        REFERENCES storage_locations (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT stock_items_creator_fkey FOREIGN KEY (company_id, created_by_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT stock_items_changer_fkey FOREIGN KEY (company_id, changed_by_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT stock_items_number_check CHECK (BTRIM(item_number) <> ''),
    CONSTRAINT stock_items_name_check CHECK (BTRIM(name) <> ''),
    CONSTRAINT stock_items_unit_check CHECK (BTRIM(unit) <> ''),
    CONSTRAINT stock_items_minimum_check CHECK (minimum_stock >= 0 AND minimum_stock <= 999999999),
    CONSTRAINT stock_items_target_check CHECK (
        target_stock IS NULL OR (target_stock >= minimum_stock AND target_stock <= 999999999)
    ),
    CONSTRAINT stock_items_status_check CHECK (status IN ('active', 'archived'))
);

CREATE INDEX IF NOT EXISTS stock_items_search_idx
    ON stock_items (company_id, status, LOWER(name));
CREATE INDEX IF NOT EXISTS stock_items_manufacturer_idx
    ON stock_items (company_id, UPPER(manufacturer_number))
    WHERE manufacturer_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS stock_items_reorder_idx
    ON stock_items (company_id, group_id) WHERE status = 'active' AND minimum_stock > 0;

-- Ein Artikel darf mehrere Codes tragen: Einzelpackung, Karton und Palette
-- sind verschiedene GTINs derselben Ware. pack_quantity sagt, wie viel ein
-- Scan dieses Codes bucht.
CREATE TABLE IF NOT EXISTS stock_item_barcodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    item_id UUID NOT NULL,
    code_raw VARCHAR(64) NOT NULL,
    code_normalized VARCHAR(64) NOT NULL,
    code_type VARCHAR(20) NOT NULL,
    pack_quantity NUMERIC(14,3) NOT NULL DEFAULT 1,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    created_by_user_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT stock_item_barcodes_company_id_id_key UNIQUE (company_id, id),
    CONSTRAINT stock_item_barcodes_code_unique UNIQUE (company_id, code_normalized),
    CONSTRAINT stock_item_barcodes_item_fkey FOREIGN KEY (company_id, item_id)
        REFERENCES stock_items (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT stock_item_barcodes_creator_fkey FOREIGN KEY (company_id, created_by_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT stock_item_barcodes_raw_check CHECK (BTRIM(code_raw) <> ''),
    CONSTRAINT stock_item_barcodes_normalized_check CHECK (BTRIM(code_normalized) <> ''),
    CONSTRAINT stock_item_barcodes_type_check CHECK (code_type IN ('gtin', 'code128', 'internal')),
    CONSTRAINT stock_item_barcodes_gtin_check CHECK (
        code_type <> 'gtin' OR code_normalized ~ '^[0-9]{14}$'
    ),
    CONSTRAINT stock_item_barcodes_pack_check CHECK (pack_quantity > 0 AND pack_quantity <= 999999)
);

CREATE UNIQUE INDEX IF NOT EXISTS stock_item_barcodes_primary_unique
    ON stock_item_barcodes (company_id, item_id) WHERE is_primary;

-- Selbst gedruckte Etiketten fuer Artikel ohne brauchbaren Aufdruck und fuer
-- Lagerplaetze. Beide brauchen dieselbe Ausgabe, Rotation und denselben
-- Widerruf; zwei fast gleiche Tabellen waeren doppelter Code ohne Gewinn.
CREATE TABLE IF NOT EXISTS stock_labels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    target_type VARCHAR(20) NOT NULL,
    item_id UUID,
    location_id UUID,
    public_token UUID NOT NULL DEFAULT gen_random_uuid(),
    generation INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by_user_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_by_user_id UUID,
    revoked_at TIMESTAMPTZ,
    revoke_reason TEXT,
    CONSTRAINT stock_labels_company_id_id_key UNIQUE (company_id, id),
    CONSTRAINT stock_labels_token_unique UNIQUE (public_token),
    CONSTRAINT stock_labels_item_fkey FOREIGN KEY (company_id, item_id)
        REFERENCES stock_items (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT stock_labels_location_fkey FOREIGN KEY (company_id, location_id)
        REFERENCES storage_locations (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT stock_labels_creator_fkey FOREIGN KEY (company_id, created_by_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT stock_labels_revoker_fkey FOREIGN KEY (company_id, revoked_by_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT stock_labels_target_check CHECK (
        (target_type = 'item' AND item_id IS NOT NULL AND location_id IS NULL)
        OR (target_type = 'location' AND location_id IS NOT NULL AND item_id IS NULL)
    ),
    CONSTRAINT stock_labels_generation_check CHECK (generation >= 1),
    CONSTRAINT stock_labels_revoke_check CHECK (
        (is_active AND revoked_at IS NULL AND revoked_by_user_id IS NULL AND revoke_reason IS NULL)
        OR (NOT is_active AND revoked_at IS NOT NULL AND revoked_by_user_id IS NOT NULL
            AND revoke_reason IS NOT NULL AND BTRIM(revoke_reason) <> '')
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS stock_labels_active_item_unique
    ON stock_labels (company_id, item_id) WHERE is_active AND item_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS stock_labels_active_location_unique
    ON stock_labels (company_id, location_id) WHERE is_active AND location_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Beschaffung
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
    order_number VARCHAR(40) NOT NULL,
    supplier_id UUID NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'draft',
    ordered_at TIMESTAMPTZ,
    expected_at DATE,
    note TEXT,
    row_version BIGINT NOT NULL DEFAULT 1,
    created_by_user_id UUID NOT NULL,
    changed_by_user_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT purchase_orders_company_id_id_key UNIQUE (company_id, id),
    CONSTRAINT purchase_orders_number_unique UNIQUE (company_id, order_number),
    CONSTRAINT purchase_orders_supplier_fkey FOREIGN KEY (company_id, supplier_id)
        REFERENCES suppliers (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT purchase_orders_creator_fkey FOREIGN KEY (company_id, created_by_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT purchase_orders_changer_fkey FOREIGN KEY (company_id, changed_by_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT purchase_orders_number_check CHECK (BTRIM(order_number) <> ''),
    CONSTRAINT purchase_orders_status_check CHECK (
        status IN ('draft', 'ordered', 'partially_received', 'received', 'cancelled')
    ),
    CONSTRAINT purchase_orders_ordered_check CHECK (
        status = 'draft' OR status = 'cancelled' OR ordered_at IS NOT NULL
    )
);

CREATE INDEX IF NOT EXISTS purchase_orders_open_idx
    ON purchase_orders (company_id, status, expected_at)
    WHERE status IN ('ordered', 'partially_received');

CREATE TABLE IF NOT EXISTS purchase_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    purchase_order_id UUID NOT NULL,
    item_id UUID NOT NULL,
    line_position INTEGER NOT NULL,
    quantity_ordered NUMERIC(14,3) NOT NULL,
    quantity_received NUMERIC(14,3) NOT NULL DEFAULT 0,
    supplier_item_number VARCHAR(80),
    unit_price NUMERIC(12,4),
    row_version BIGINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT purchase_order_items_company_id_id_key UNIQUE (company_id, id),
    CONSTRAINT purchase_order_items_position_unique UNIQUE (company_id, purchase_order_id, line_position),
    CONSTRAINT purchase_order_items_order_fkey FOREIGN KEY (company_id, purchase_order_id)
        REFERENCES purchase_orders (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT purchase_order_items_item_fkey FOREIGN KEY (company_id, item_id)
        REFERENCES stock_items (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT purchase_order_items_position_check CHECK (line_position >= 1),
    CONSTRAINT purchase_order_items_ordered_check CHECK (quantity_ordered > 0 AND quantity_ordered <= 999999999),
    -- Ueberlieferung kommt vor und ist kein Fehler; nur negative Mengen sind einer.
    CONSTRAINT purchase_order_items_received_check CHECK (quantity_received >= 0),
    CONSTRAINT purchase_order_items_price_check CHECK (unit_price IS NULL OR unit_price >= 0)
);

-- ---------------------------------------------------------------------------
-- Bestand und Bewegung
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS stock_levels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    item_id UUID NOT NULL,
    location_id UUID NOT NULL,
    quantity NUMERIC(14,3) NOT NULL DEFAULT 0,
    row_version BIGINT NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT stock_levels_company_id_id_key UNIQUE (company_id, id),
    CONSTRAINT stock_levels_position_unique UNIQUE (company_id, item_id, location_id),
    CONSTRAINT stock_levels_item_fkey FOREIGN KEY (company_id, item_id)
        REFERENCES stock_items (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT stock_levels_location_fkey FOREIGN KEY (company_id, location_id)
        REFERENCES storage_locations (company_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS stock_levels_location_idx
    ON stock_levels (company_id, location_id) WHERE quantity <> 0;
CREATE INDEX IF NOT EXISTS stock_levels_negative_idx
    ON stock_levels (company_id, location_id) WHERE quantity < 0;

-- Das unveraenderliche Journal. Eine Fehlbuchung wird durch eine Gegenbuchung
-- mit Pflichtgrund aufgehoben, nie durch Aendern oder Loeschen.
CREATE TABLE IF NOT EXISTS stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
    item_id UUID NOT NULL,
    movement_type VARCHAR(20) NOT NULL,
    quantity NUMERIC(14,3) NOT NULL,
    source_location_id UUID,
    target_location_id UUID,
    construction_site_id UUID,
    purchase_order_item_id UUID,
    reverses_movement_id UUID,
    inventory_session_id UUID,
    actor_user_id UUID NOT NULL,
    reason TEXT,
    source_type VARCHAR(30) NOT NULL DEFAULT 'api',
    client_operation_id VARCHAR(80),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT stock_movements_company_id_id_key UNIQUE (company_id, id),
    CONSTRAINT stock_movements_item_fkey FOREIGN KEY (company_id, item_id)
        REFERENCES stock_items (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT stock_movements_source_fkey FOREIGN KEY (company_id, source_location_id)
        REFERENCES storage_locations (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT stock_movements_target_fkey FOREIGN KEY (company_id, target_location_id)
        REFERENCES storage_locations (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT stock_movements_site_fkey FOREIGN KEY (company_id, construction_site_id)
        REFERENCES construction_sites (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT stock_movements_order_item_fkey FOREIGN KEY (company_id, purchase_order_item_id)
        REFERENCES purchase_order_items (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT stock_movements_reverses_fkey FOREIGN KEY (company_id, reverses_movement_id)
        REFERENCES stock_movements (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT stock_movements_actor_fkey FOREIGN KEY (company_id, actor_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT stock_movements_quantity_check CHECK (quantity > 0 AND quantity <= 999999999),
    CONSTRAINT stock_movements_type_check CHECK (movement_type IN (
        'opening', 'receipt', 'issue', 'transfer', 'return', 'correction', 'scrap'
    )),
    CONSTRAINT stock_movements_source_type_check CHECK (
        source_type IN ('api', 'qr_scan', 'offline_sync', 'inventory', 'import')
    ),
    -- Zugang hat nur ein Ziel, Entnahme nur eine Quelle, Umlagerung beides und
    -- beide verschieden. Eine Korrektur bucht in genau eine Richtung.
    CONSTRAINT stock_movements_direction_check CHECK (
        (movement_type IN ('opening', 'receipt', 'return')
            AND target_location_id IS NOT NULL AND source_location_id IS NULL)
        OR (movement_type IN ('issue', 'scrap')
            AND source_location_id IS NOT NULL AND target_location_id IS NULL)
        OR (movement_type = 'transfer'
            AND source_location_id IS NOT NULL AND target_location_id IS NOT NULL
            AND source_location_id <> target_location_id)
        OR (movement_type = 'correction'
            AND (source_location_id IS NULL) <> (target_location_id IS NULL))
    ),
    CONSTRAINT stock_movements_reason_check CHECK (
        movement_type NOT IN ('scrap', 'correction')
        OR (reason IS NOT NULL AND BTRIM(reason) <> '')
    ),
    CONSTRAINT stock_movements_client_check CHECK (
        client_operation_id IS NULL OR BTRIM(client_operation_id) <> ''
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS stock_movements_client_operation_unique
    ON stock_movements (company_id, client_operation_id)
    WHERE client_operation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS stock_movements_item_idx
    ON stock_movements (company_id, item_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS stock_movements_site_idx
    ON stock_movements (company_id, construction_site_id, occurred_at DESC)
    WHERE construction_site_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS stock_movements_order_idx
    ON stock_movements (company_id, purchase_order_item_id)
    WHERE purchase_order_item_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Inventur, Einstellungen, Verlauf
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS stock_inventory_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
    location_id UUID NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'running',
    note TEXT,
    started_by_user_id UUID NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_by_user_id UUID,
    completed_at TIMESTAMPTZ,
    row_version BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT stock_inventory_sessions_company_id_id_key UNIQUE (company_id, id),
    CONSTRAINT stock_inventory_sessions_location_fkey FOREIGN KEY (company_id, location_id)
        REFERENCES storage_locations (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT stock_inventory_sessions_starter_fkey FOREIGN KEY (company_id, started_by_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT stock_inventory_sessions_completer_fkey FOREIGN KEY (company_id, completed_by_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT stock_inventory_sessions_status_check CHECK (status IN ('running', 'completed', 'cancelled')),
    CONSTRAINT stock_inventory_sessions_completion_check CHECK (
        (status = 'running' AND completed_at IS NULL AND completed_by_user_id IS NULL)
        OR (status <> 'running' AND completed_at IS NOT NULL AND completed_by_user_id IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS stock_inventory_sessions_running_unique
    ON stock_inventory_sessions (company_id, location_id) WHERE status = 'running';

CREATE TABLE IF NOT EXISTS stock_inventory_counts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    session_id UUID NOT NULL,
    item_id UUID NOT NULL,
    expected_quantity NUMERIC(14,3) NOT NULL,
    counted_quantity NUMERIC(14,3),
    counted_by_user_id UUID,
    counted_at TIMESTAMPTZ,
    row_version BIGINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT stock_inventory_counts_company_id_id_key UNIQUE (company_id, id),
    CONSTRAINT stock_inventory_counts_position_unique UNIQUE (company_id, session_id, item_id),
    CONSTRAINT stock_inventory_counts_session_fkey FOREIGN KEY (company_id, session_id)
        REFERENCES stock_inventory_sessions (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT stock_inventory_counts_item_fkey FOREIGN KEY (company_id, item_id)
        REFERENCES stock_items (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT stock_inventory_counts_counter_fkey FOREIGN KEY (company_id, counted_by_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT stock_inventory_counts_counted_check CHECK (
        (counted_quantity IS NULL AND counted_by_user_id IS NULL AND counted_at IS NULL)
        OR (counted_quantity IS NOT NULL AND counted_by_user_id IS NOT NULL AND counted_at IS NOT NULL)
    )
);

CREATE TABLE IF NOT EXISTS stock_settings (
    company_id UUID PRIMARY KEY REFERENCES companies (id) ON DELETE RESTRICT,
    default_location_id UUID,
    require_site_on_issue BOOLEAN NOT NULL DEFAULT FALSE,
    block_negative_stock BOOLEAN NOT NULL DEFAULT FALSE,
    low_stock_warning BOOLEAN NOT NULL DEFAULT TRUE,
    row_version BIGINT NOT NULL DEFAULT 1,
    updated_by_user_id UUID,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT stock_settings_location_fkey FOREIGN KEY (company_id, default_location_id)
        REFERENCES storage_locations (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT stock_settings_updater_fkey FOREIGN KEY (company_id, updated_by_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS stock_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
    entity_type VARCHAR(40) NOT NULL,
    entity_id UUID NOT NULL,
    action VARCHAR(60) NOT NULL,
    actor_user_id UUID NOT NULL,
    old_state JSONB,
    new_state JSONB,
    reason TEXT,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT stock_history_actor_fkey FOREIGN KEY (company_id, actor_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT stock_history_entity_check CHECK (entity_type IN (
        'stock_item', 'stock_item_barcode', 'storage_location', 'stock_label',
        'supplier', 'purchase_order', 'stock_settings', 'inventory_session'
    )),
    CONSTRAINT stock_history_action_check CHECK (BTRIM(action) <> ''),
    CONSTRAINT stock_history_old_check CHECK (old_state IS NULL OR jsonb_typeof(old_state) = 'object'),
    CONSTRAINT stock_history_new_check CHECK (new_state IS NULL OR jsonb_typeof(new_state) = 'object')
);

CREATE INDEX IF NOT EXISTS stock_history_entity_idx
    ON stock_history (company_id, entity_type, entity_id, occurred_at DESC);

-- ---------------------------------------------------------------------------
-- Normalisierung
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION stock_master_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_TABLE_NAME = 'stock_item_groups' THEN
        NEW.group_key := LOWER(BTRIM(NEW.group_key));
        NEW.name := BTRIM(NEW.name);
    ELSIF TG_TABLE_NAME = 'suppliers' THEN
        NEW.supplier_number := UPPER(BTRIM(NEW.supplier_number));
        NEW.name := BTRIM(NEW.name);
        NEW.customer_number := NULLIF(BTRIM(NEW.customer_number), '');
        NEW.contact_name := NULLIF(BTRIM(NEW.contact_name), '');
        NEW.email := NULLIF(LOWER(BTRIM(NEW.email)), '');
        NEW.phone := NULLIF(BTRIM(NEW.phone), '');
        NEW.note := NULLIF(BTRIM(NEW.note), '');
    ELSIF TG_TABLE_NAME = 'storage_locations' THEN
        NEW.name := BTRIM(NEW.name);
        NEW.note := NULLIF(BTRIM(NEW.note), '');
    ELSIF TG_TABLE_NAME = 'stock_items' THEN
        NEW.item_number := UPPER(BTRIM(NEW.item_number));
        NEW.name := BTRIM(NEW.name);
        NEW.unit := BTRIM(NEW.unit);
        NEW.manufacturer := NULLIF(BTRIM(NEW.manufacturer), '');
        NEW.manufacturer_number := NULLIF(BTRIM(NEW.manufacturer_number), '');
        NEW.note := NULLIF(BTRIM(NEW.note), '');
    ELSIF TG_TABLE_NAME = 'purchase_orders' THEN
        NEW.order_number := UPPER(BTRIM(NEW.order_number));
        NEW.note := NULLIF(BTRIM(NEW.note), '');
    ELSIF TG_TABLE_NAME = 'purchase_order_items' THEN
        NEW.supplier_item_number := NULLIF(BTRIM(NEW.supplier_item_number), '');
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF NEW.company_id <> OLD.company_id THEN
            RAISE EXCEPTION 'Die Firmenzuordnung eines Lagerdatensatzes ist unveraenderlich.';
        END IF;
        NEW.row_version := OLD.row_version + 1;
        NEW.updated_at := CURRENT_TIMESTAMP;
    END IF;

    RETURN NEW;
END;
$$;

DO $$
DECLARE target REGCLASS;
BEGIN
    FOREACH target IN ARRAY ARRAY[
        'stock_item_groups'::REGCLASS, 'suppliers'::REGCLASS,
        'storage_locations'::REGCLASS, 'stock_items'::REGCLASS,
        'purchase_orders'::REGCLASS, 'purchase_order_items'::REGCLASS
    ] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS stock_master_before_write_trigger ON %s', target);
        EXECUTE format(
            'CREATE TRIGGER stock_master_before_write_trigger BEFORE INSERT OR UPDATE ON %s '
            'FOR EACH ROW EXECUTE FUNCTION stock_master_before_write()', target
        );
    END LOOP;
END;
$$;

-- Die Einheit eines Artikels darf nach der ersten Buchung nicht mehr wechseln.
-- Sonst wird jede historische Menge stillschweigend falsch.
CREATE OR REPLACE FUNCTION stock_items_protect_unit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.unit <> OLD.unit AND EXISTS (
        SELECT 1 FROM stock_movements
        WHERE company_id = OLD.company_id AND item_id = OLD.id
    ) THEN
        RAISE EXCEPTION 'Die Einheit eines bereits gebuchten Artikels ist unveraenderlich.';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stock_items_protect_unit_trigger ON stock_items;
CREATE TRIGGER stock_items_protect_unit_trigger
    BEFORE UPDATE ON stock_items
    FOR EACH ROW EXECUTE FUNCTION stock_items_protect_unit();

CREATE OR REPLACE FUNCTION storage_locations_set_depth()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE eltern INTEGER;
BEGIN
    IF NEW.parent_location_id IS NULL THEN
        NEW.depth := 1;
        RETURN NEW;
    END IF;

    SELECT depth INTO eltern FROM storage_locations
    WHERE company_id = NEW.company_id AND id = NEW.parent_location_id;

    IF eltern IS NULL THEN
        RAISE EXCEPTION 'Der uebergeordnete Lagerplatz gehoert nicht zu dieser Firma.';
    END IF;
    IF eltern >= 3 THEN
        RAISE EXCEPTION 'Lagerplaetze duerfen hoechstens drei Ebenen tief sein.';
    END IF;

    NEW.depth := eltern + 1;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS storage_locations_set_depth_trigger ON storage_locations;
CREATE TRIGGER storage_locations_set_depth_trigger
    BEFORE INSERT OR UPDATE ON storage_locations
    FOR EACH ROW EXECUTE FUNCTION storage_locations_set_depth();

-- GTIN-14-Normalisierung samt Pruefziffer. Ein EAN-8-, EAN-13- oder
-- UPC-A-Scan derselben Ware muss denselben Artikel finden; ein Code, der keine
-- gueltige GTIN ist, wird als code128 oder internal gefuehrt statt
-- stillschweigend verfaelscht.
CREATE OR REPLACE FUNCTION stock_normalize_gtin(candidate TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    ziffern TEXT;
    gefuellt TEXT;
    summe INTEGER := 0;
    stelle INTEGER;
    pruefziffer INTEGER;
BEGIN
    ziffern := REGEXP_REPLACE(COALESCE(candidate, ''), '[^0-9]', '', 'g');
    IF LENGTH(ziffern) NOT IN (8, 12, 13, 14) THEN
        RETURN NULL;
    END IF;

    gefuellt := LPAD(ziffern, 14, '0');

    FOR stelle IN 1..13 LOOP
        summe := summe + SUBSTRING(gefuellt FROM stelle FOR 1)::INTEGER
                 * CASE WHEN stelle % 2 = 1 THEN 3 ELSE 1 END;
    END LOOP;

    pruefziffer := (10 - (summe % 10)) % 10;
    IF pruefziffer <> SUBSTRING(gefuellt FROM 14 FOR 1)::INTEGER THEN
        RETURN NULL;
    END IF;

    RETURN gefuellt;
END;
$$;

CREATE OR REPLACE FUNCTION stock_item_barcodes_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE gtin TEXT;
BEGIN
    NEW.code_raw := BTRIM(NEW.code_raw);
    NEW.code_type := LOWER(BTRIM(NEW.code_type));

    gtin := stock_normalize_gtin(NEW.code_raw);

    IF NEW.code_type = 'gtin' THEN
        IF gtin IS NULL THEN
            RAISE EXCEPTION 'Der Code % ist keine gueltige GTIN.', NEW.code_raw;
        END IF;
        NEW.code_normalized := gtin;
    ELSE
        -- Ein Code, der zufaellig eine gueltige GTIN ist, wird auch dann
        -- normalisiert, damit derselbe Artikel nicht zweimal entsteht.
        NEW.code_normalized := COALESCE(gtin, UPPER(NEW.code_raw));
        IF gtin IS NOT NULL THEN
            NEW.code_type := 'gtin';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stock_item_barcodes_before_write_trigger ON stock_item_barcodes;
CREATE TRIGGER stock_item_barcodes_before_write_trigger
    BEFORE INSERT ON stock_item_barcodes
    FOR EACH ROW EXECUTE FUNCTION stock_item_barcodes_before_write();

-- ---------------------------------------------------------------------------
-- Bestandsfortschreibung
-- ---------------------------------------------------------------------------

-- stock_levels wird ausschliesslich hier geschrieben. Die API besitzt darauf
-- kein INSERT- und kein UPDATE-Recht; Journal und Bestand koennen deshalb
-- nicht auseinanderlaufen. Der Upsert nimmt selbst die Zeilensperre, zwei
-- gleichzeitige Entnahmen addieren sich also korrekt.
CREATE OR REPLACE FUNCTION stock_movements_apply_level()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    blockieren BOOLEAN;
    bestand NUMERIC(14,3);
BEGIN
    SELECT block_negative_stock INTO blockieren
    FROM stock_settings WHERE company_id = NEW.company_id;
    blockieren := COALESCE(blockieren, FALSE);

    IF NEW.source_location_id IS NOT NULL THEN
        INSERT INTO stock_levels (company_id, item_id, location_id, quantity)
        VALUES (NEW.company_id, NEW.item_id, NEW.source_location_id, -NEW.quantity)
        ON CONFLICT (company_id, item_id, location_id) DO UPDATE
        SET quantity = stock_levels.quantity - NEW.quantity,
            row_version = stock_levels.row_version + 1,
            updated_at = CURRENT_TIMESTAMP
        RETURNING quantity INTO bestand;

        IF blockieren AND bestand < 0 THEN
            RAISE EXCEPTION 'Der Bestand am Quellort reicht nicht aus.'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    IF NEW.target_location_id IS NOT NULL THEN
        INSERT INTO stock_levels (company_id, item_id, location_id, quantity)
        VALUES (NEW.company_id, NEW.item_id, NEW.target_location_id, NEW.quantity)
        ON CONFLICT (company_id, item_id, location_id) DO UPDATE
        SET quantity = stock_levels.quantity + NEW.quantity,
            row_version = stock_levels.row_version + 1,
            updated_at = CURRENT_TIMESTAMP;
    END IF;

    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS stock_movements_apply_level_trigger ON stock_movements;
CREATE TRIGGER stock_movements_apply_level_trigger
    AFTER INSERT ON stock_movements
    FOR EACH ROW EXECUTE FUNCTION stock_movements_apply_level();

-- ---------------------------------------------------------------------------
-- Unveraenderlichkeit und Loeschschutz
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION stock_event_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'Lagerbuchungen und der Lagerverlauf sind unveraenderlich.';
END;
$$;

DO $$
DECLARE target REGCLASS;
BEGIN
    FOREACH target IN ARRAY ARRAY[
        'stock_movements'::REGCLASS, 'stock_history'::REGCLASS
    ] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS stock_event_immutable_trigger ON %s', target);
        EXECUTE format(
            'CREATE TRIGGER stock_event_immutable_trigger BEFORE UPDATE OR DELETE ON %s '
            'FOR EACH ROW EXECUTE FUNCTION stock_event_immutable()', target
        );
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION stock_prevent_hard_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF CURRENT_SETTING('app.allow_hard_delete', TRUE) = 'on' THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'Lagerdaten werden archiviert und nicht hart geloescht.';
END;
$$;

DO $$
DECLARE target REGCLASS;
BEGIN
    FOREACH target IN ARRAY ARRAY[
        'stock_item_groups'::REGCLASS, 'suppliers'::REGCLASS,
        'storage_locations'::REGCLASS, 'stock_items'::REGCLASS,
        'stock_item_barcodes'::REGCLASS, 'stock_labels'::REGCLASS,
        'stock_levels'::REGCLASS, 'purchase_orders'::REGCLASS,
        'purchase_order_items'::REGCLASS, 'stock_inventory_sessions'::REGCLASS,
        'stock_inventory_counts'::REGCLASS, 'stock_settings'::REGCLASS
    ] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS stock_prevent_hard_delete_trigger ON %s', target);
        EXECUTE format(
            'CREATE TRIGGER stock_prevent_hard_delete_trigger BEFORE DELETE ON %s '
            'FOR EACH ROW EXECUTE FUNCTION stock_prevent_hard_delete()', target
        );
    END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- Grunddaten je Firma
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION seed_stock_master_data(target_company_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE lager UUID;
BEGIN
    INSERT INTO stock_item_groups (company_id, group_key, name, is_system)
    VALUES
        (target_company_id, 'cable', 'Kabel und Leitungen', TRUE),
        (target_company_id, 'installation', 'Installationsmaterial', TRUE),
        (target_company_id, 'switches', 'Schalter und Steckdosen', TRUE),
        (target_company_id, 'distribution', 'Verteiler und Sicherungen', TRUE),
        (target_company_id, 'lighting', 'Leuchten und Leuchtmittel', TRUE),
        (target_company_id, 'data_network', 'Daten und Netzwerk', TRUE),
        (target_company_id, 'fastening', 'Befestigung', TRUE),
        (target_company_id, 'consumables', 'Verbrauchsmaterial', TRUE),
        (target_company_id, 'other', 'Sonstiges Material', TRUE)
    ON CONFLICT (company_id, group_key) DO NOTHING;

    INSERT INTO storage_locations (company_id, name, location_type)
    SELECT target_company_id, 'Materiallager', 'warehouse'
    WHERE NOT EXISTS (
        SELECT 1 FROM storage_locations
        WHERE company_id = target_company_id AND LOWER(name) = 'materiallager'
    );

    SELECT id INTO lager FROM storage_locations
    WHERE company_id = target_company_id AND LOWER(name) = 'materiallager';

    INSERT INTO stock_settings (company_id, default_location_id)
    VALUES (target_company_id, lager)
    ON CONFLICT (company_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION companies_seed_stock_master_data()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    PERFORM seed_stock_master_data(NEW.id);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS companies_seed_stock_master_data_trigger ON companies;
CREATE TRIGGER companies_seed_stock_master_data_trigger
    AFTER INSERT ON companies
    FOR EACH ROW EXECUTE FUNCTION companies_seed_stock_master_data();

DO $$
DECLARE tenant RECORD;
BEGIN
    FOR tenant IN SELECT id FROM companies LOOP
        PERFORM seed_stock_master_data(tenant.id);
    END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- Mandantentrennung und Rechte
-- ---------------------------------------------------------------------------

DO $$
DECLARE target TEXT;
BEGIN
    FOREACH target IN ARRAY ARRAY[
        'stock_item_groups', 'suppliers', 'storage_locations', 'stock_items',
        'stock_item_barcodes', 'stock_labels', 'stock_levels',
        'purchase_orders', 'purchase_order_items', 'stock_movements',
        'stock_inventory_sessions', 'stock_inventory_counts',
        'stock_settings', 'stock_history'
    ] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', target);
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', target || '_tenant_isolation', target);
        EXECUTE format(
            'CREATE POLICY %I ON %I USING '
            '(company_id = NULLIF(CURRENT_SETTING(''app.current_company_id'', TRUE), '''')::UUID) '
            'WITH CHECK (company_id = NULLIF(CURRENT_SETTING(''app.current_company_id'', TRUE), '''')::UUID)',
            target || '_tenant_isolation', target
        );
        EXECUTE format('ALTER TABLE %I NO FORCE ROW LEVEL SECURITY', target);
    END LOOP;
END;
$$;

GRANT SELECT, INSERT, UPDATE ON
    stock_item_groups, suppliers, storage_locations, stock_items,
    stock_labels, purchase_orders, purchase_order_items,
    stock_inventory_sessions, stock_inventory_counts, stock_settings
TO schaefchen_api;

GRANT SELECT, INSERT ON stock_item_barcodes, stock_movements, stock_history
TO schaefchen_api;

-- Bewusst nur lesend: der Bestand entsteht ausschliesslich aus dem Journal.
GRANT SELECT ON stock_levels TO schaefchen_api;

COMMENT ON TABLE stock_items IS
    'Artikelstamm einer Sorte mit eigener Artikelnummer und optionaler Herstellernummer.';
COMMENT ON TABLE stock_item_barcodes IS
    'Hersteller- und Eigencodes je Artikel, auf GTIN-14 normalisiert, mit Gebindemenge.';
COMMENT ON TABLE stock_labels IS
    'Selbst gedruckte QR-Token fuer Artikel und Lagerplaetze ohne Namen oder Firmendaten.';
COMMENT ON TABLE stock_levels IS
    'Aus dem Journal fortgeschriebener Bestand je Artikel und Ort; fuer die API nur lesbar.';
COMMENT ON TABLE stock_movements IS
    'Unveraenderliches Journal aller Lagerbewegungen mit idempotenter client_operation_id.';

COMMIT;
