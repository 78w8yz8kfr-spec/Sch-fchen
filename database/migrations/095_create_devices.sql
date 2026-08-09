-- Maschinen & Geräte: mandantenfaehiges Inventar mit sicheren QR-Codes.
--
-- Ein Gegenstand hat genau einen Stammdatensatz. Feste Zuordnung und
-- tatsaechlicher Besitz sind getrennte, zeitlich gueltige Relationen. Jede
-- Bewegung wird unveraenderlich protokolliert; eine client_operation_id macht
-- Offline-Wiederholungen idempotent. QR-Codes enthalten nur einen zufaelligen
-- oeffentlichen Token und niemals Namen oder Firmendaten.

BEGIN;

INSERT INTO module_catalog (
    module_key, name, description, category, is_special, requires_platform_approval
) VALUES (
    'devices', 'Maschinen & Geräte',
    'Maschinen, Werkzeuge, Messgeräte und Akkus mit QR-Ausgabe, Prüfungen und Inventur.',
    'business', FALSE, TRUE
)
ON CONFLICT (module_key) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    is_special = EXCLUDED.is_special,
    requires_platform_approval = EXCLUDED.requires_platform_approval;

CREATE OR REPLACE FUNCTION platform_default_module_keys()
RETURNS VARCHAR[]
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT ARRAY[
        'absences', 'assembly_reports', 'devices', 'documents', 'fleet',
        'materials', 'scheduling', 'site_daily_reports', 'site_qr'
    ]::VARCHAR[];
$$;

INSERT INTO company_module_entitlements (
    company_id, module_id, entitlement_status, included_in_plan, change_reason
)
SELECT tenant.id, catalog.id, 'permanent', TRUE,
       'Maschinen & Geräte gehoert seit Fassung 0.44.0 zum Standardumfang'
FROM companies AS tenant
JOIN module_catalog AS catalog ON catalog.module_key = 'devices'
ON CONFLICT (company_id, module_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS device_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
    category_key VARCHAR(60) NOT NULL,
    name VARCHAR(100) NOT NULL,
    base_type VARCHAR(30) NOT NULL,
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    row_version BIGINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT device_categories_company_id_id_key UNIQUE (company_id, id),
    CONSTRAINT device_categories_key_unique UNIQUE (company_id, category_key),
    CONSTRAINT device_categories_key_check CHECK (category_key ~ '^[a-z][a-z0-9_]*$'),
    CONSTRAINT device_categories_name_check CHECK (BTRIM(name) <> ''),
    CONSTRAINT device_categories_type_check CHECK (base_type IN (
        'machine', 'power_tool', 'hand_tool', 'measuring_device', 'testing_device',
        'battery', 'charger', 'ladder', 'equipment', 'other'
    )),
    CONSTRAINT device_categories_status_check CHECK (status IN ('active', 'archived'))
);

CREATE UNIQUE INDEX IF NOT EXISTS device_categories_name_unique
    ON device_categories (company_id, LOWER(name));

CREATE TABLE IF NOT EXISTS device_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
    name VARCHAR(140) NOT NULL,
    location_type VARCHAR(30) NOT NULL,
    construction_site_id UUID,
    vehicle_id UUID,
    note TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    row_version BIGINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT device_locations_company_id_id_key UNIQUE (company_id, id),
    CONSTRAINT device_locations_site_fkey FOREIGN KEY (company_id, construction_site_id)
        REFERENCES construction_sites (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT device_locations_vehicle_fkey FOREIGN KEY (company_id, vehicle_id)
        REFERENCES vehicles (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT device_locations_name_check CHECK (BTRIM(name) <> ''),
    CONSTRAINT device_locations_type_check CHECK (
        location_type IN ('warehouse', 'workshop', 'construction_site', 'vehicle', 'other')
    ),
    CONSTRAINT device_locations_target_check CHECK (
        (location_type = 'construction_site' AND construction_site_id IS NOT NULL AND vehicle_id IS NULL)
        OR (location_type = 'vehicle' AND vehicle_id IS NOT NULL AND construction_site_id IS NULL)
        OR (location_type IN ('warehouse', 'workshop', 'other')
            AND construction_site_id IS NULL AND vehicle_id IS NULL)
    ),
    CONSTRAINT device_locations_status_check CHECK (status IN ('active', 'archived'))
);

CREATE UNIQUE INDEX IF NOT EXISTS device_locations_name_unique
    ON device_locations (company_id, LOWER(name));
CREATE UNIQUE INDEX IF NOT EXISTS device_locations_site_unique
    ON device_locations (company_id, construction_site_id)
    WHERE construction_site_id IS NOT NULL AND status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS device_locations_vehicle_unique
    ON device_locations (company_id, vehicle_id)
    WHERE vehicle_id IS NOT NULL AND status = 'active';

CREATE TABLE IF NOT EXISTS device_sets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
    set_number VARCHAR(40) NOT NULL,
    name VARCHAR(160) NOT NULL,
    note TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    row_version BIGINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT device_sets_company_id_id_key UNIQUE (company_id, id),
    CONSTRAINT device_sets_number_unique UNIQUE (company_id, set_number),
    CONSTRAINT device_sets_number_check CHECK (BTRIM(set_number) <> ''),
    CONSTRAINT device_sets_name_check CHECK (BTRIM(name) <> ''),
    CONSTRAINT device_sets_status_check CHECK (status IN ('active', 'archived'))
);

CREATE TABLE IF NOT EXISTS devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
    inventory_number VARCHAR(50) NOT NULL,
    name VARCHAR(180) NOT NULL,
    category_id UUID NOT NULL,
    manufacturer VARCHAR(120),
    model VARCHAR(120),
    serial_number VARCHAR(160),
    purchase_date DATE,
    purchase_price_cents INTEGER,
    supplier VARCHAR(160),
    warranty_until DATE,
    condition_key VARCHAR(30) NOT NULL DEFAULT 'ok',
    note TEXT,
    current_location_id UUID,
    last_known_location_id UUID,
    assigned_construction_site_id UUID,
    assigned_vehicle_id UUID,
    inspection_required BOOLEAN NOT NULL DEFAULT FALSE,
    last_inspection_on DATE,
    next_inspection_on DATE,
    maintenance_interval_days INTEGER,
    next_maintenance_on DATE,
    status VARCHAR(30) NOT NULL DEFAULT 'available',
    retired_at TIMESTAMPTZ,
    retired_reason TEXT,
    row_version BIGINT NOT NULL DEFAULT 1,
    created_by_user_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT devices_company_id_id_key UNIQUE (company_id, id),
    CONSTRAINT devices_inventory_unique UNIQUE (company_id, inventory_number),
    CONSTRAINT devices_category_fkey FOREIGN KEY (company_id, category_id)
        REFERENCES device_categories (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT devices_current_location_fkey FOREIGN KEY (company_id, current_location_id)
        REFERENCES device_locations (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT devices_last_location_fkey FOREIGN KEY (company_id, last_known_location_id)
        REFERENCES device_locations (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT devices_site_fkey FOREIGN KEY (company_id, assigned_construction_site_id)
        REFERENCES construction_sites (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT devices_vehicle_fkey FOREIGN KEY (company_id, assigned_vehicle_id)
        REFERENCES vehicles (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT devices_creator_fkey FOREIGN KEY (company_id, created_by_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT devices_inventory_check CHECK (BTRIM(inventory_number) <> ''),
    CONSTRAINT devices_name_check CHECK (BTRIM(name) <> ''),
    CONSTRAINT devices_price_check CHECK (purchase_price_cents IS NULL OR purchase_price_cents >= 0),
    CONSTRAINT devices_condition_check CHECK (condition_key IN (
        'new', 'ok', 'worn', 'damaged', 'defective', 'unknown'
    )),
    CONSTRAINT devices_status_check CHECK (status IN (
        'available', 'fixed_assigned', 'loaned', 'on_site', 'in_storage',
        'repair', 'defective', 'inspection_due', 'locked', 'lost', 'retired'
    )),
    CONSTRAINT devices_interval_check CHECK (
        maintenance_interval_days IS NULL OR maintenance_interval_days BETWEEN 1 AND 3650
    ),
    CONSTRAINT devices_retired_check CHECK (
        (status = 'retired' AND retired_at IS NOT NULL
            AND retired_reason IS NOT NULL AND BTRIM(retired_reason) <> '')
        OR (status <> 'retired' AND retired_at IS NULL AND retired_reason IS NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS devices_serial_unique
    ON devices (company_id, LOWER(serial_number))
    WHERE serial_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS devices_search_idx
    ON devices (company_id, status, inventory_number, name);
CREATE INDEX IF NOT EXISTS devices_site_idx
    ON devices (company_id, assigned_construction_site_id)
    WHERE assigned_construction_site_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS devices_vehicle_idx
    ON devices (company_id, assigned_vehicle_id)
    WHERE assigned_vehicle_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS devices_inspection_idx
    ON devices (company_id, next_inspection_on)
    WHERE inspection_required AND status <> 'retired';

CREATE TABLE IF NOT EXISTS device_battery_profiles (
    company_id UUID NOT NULL,
    device_id UUID NOT NULL,
    battery_system VARCHAR(100) NOT NULL,
    voltage NUMERIC(7,2),
    capacity_ah NUMERIC(7,2),
    cycle_count INTEGER,
    last_capacity_test_on DATE,
    measured_remaining_capacity_percent NUMERIC(5,2),
    compatible_system VARCHAR(160),
    row_version BIGINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (company_id, device_id),
    CONSTRAINT device_battery_profiles_device_fkey FOREIGN KEY (company_id, device_id)
        REFERENCES devices (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT device_battery_profiles_system_check CHECK (BTRIM(battery_system) <> ''),
    CONSTRAINT device_battery_profiles_values_check CHECK (
        (voltage IS NULL OR voltage > 0)
        AND (capacity_ah IS NULL OR capacity_ah > 0)
        AND (cycle_count IS NULL OR cycle_count >= 0)
        AND (measured_remaining_capacity_percent IS NULL
             OR measured_remaining_capacity_percent BETWEEN 0 AND 100)
    )
);

CREATE TABLE IF NOT EXISTS device_set_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    device_set_id UUID NOT NULL,
    device_id UUID NOT NULL,
    added_by_user_id UUID NOT NULL,
    added_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    removed_by_user_id UUID,
    removed_at TIMESTAMPTZ,
    remove_reason TEXT,
    CONSTRAINT device_set_items_set_fkey FOREIGN KEY (company_id, device_set_id)
        REFERENCES device_sets (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT device_set_items_device_fkey FOREIGN KEY (company_id, device_id)
        REFERENCES devices (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT device_set_items_adder_fkey FOREIGN KEY (company_id, added_by_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT device_set_items_remover_fkey FOREIGN KEY (company_id, removed_by_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT device_set_items_removed_check CHECK (
        (removed_at IS NULL AND removed_by_user_id IS NULL AND remove_reason IS NULL)
        OR (removed_at IS NOT NULL AND removed_by_user_id IS NOT NULL
            AND remove_reason IS NOT NULL AND BTRIM(remove_reason) <> '')
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS device_set_items_current_unique
    ON device_set_items (company_id, device_id) WHERE removed_at IS NULL;

CREATE TABLE IF NOT EXISTS device_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    device_id UUID NOT NULL,
    assignment_type VARCHAR(20) NOT NULL,
    user_id UUID NOT NULL,
    source VARCHAR(30) NOT NULL,
    client_operation_id UUID,
    started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMPTZ,
    ended_by_user_id UUID,
    end_reason TEXT,
    created_by_user_id UUID NOT NULL,
    row_version BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT device_assignments_company_id_id_key UNIQUE (company_id, id),
    CONSTRAINT device_assignments_device_fkey FOREIGN KEY (company_id, device_id)
        REFERENCES devices (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT device_assignments_user_fkey FOREIGN KEY (company_id, user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT device_assignments_creator_fkey FOREIGN KEY (company_id, created_by_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT device_assignments_ender_fkey FOREIGN KEY (company_id, ended_by_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT device_assignments_type_check CHECK (assignment_type IN ('fixed', 'custody')),
    CONSTRAINT device_assignments_source_check CHECK (source IN (
        'administration', 'qr_scan', 'handover', 'return', 'inventory', 'offline_sync'
    )),
    CONSTRAINT device_assignments_end_check CHECK (
        (ended_at IS NULL AND ended_by_user_id IS NULL AND end_reason IS NULL)
        OR (ended_at IS NOT NULL AND ended_by_user_id IS NOT NULL
            AND end_reason IS NOT NULL AND BTRIM(end_reason) <> '')
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS device_assignments_current_unique
    ON device_assignments (company_id, device_id, assignment_type)
    WHERE ended_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS device_assignments_operation_unique
    ON device_assignments (company_id, client_operation_id, assignment_type)
    WHERE client_operation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS device_assignments_user_idx
    ON device_assignments (company_id, user_id, assignment_type, started_at DESC);

CREATE TABLE IF NOT EXISTS device_qr_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    device_id UUID NOT NULL,
    public_token UUID NOT NULL DEFAULT gen_random_uuid(),
    generation INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by_user_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_by_user_id UUID,
    revoked_at TIMESTAMPTZ,
    revoke_reason TEXT,
    CONSTRAINT device_qr_tokens_company_id_id_key UNIQUE (company_id, id),
    CONSTRAINT device_qr_tokens_token_unique UNIQUE (public_token),
    CONSTRAINT device_qr_tokens_device_fkey FOREIGN KEY (company_id, device_id)
        REFERENCES devices (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT device_qr_tokens_creator_fkey FOREIGN KEY (company_id, created_by_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT device_qr_tokens_revoker_fkey FOREIGN KEY (company_id, revoked_by_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT device_qr_tokens_generation_check CHECK (generation >= 1),
    CONSTRAINT device_qr_tokens_revoke_check CHECK (
        (is_active AND revoked_at IS NULL AND revoked_by_user_id IS NULL AND revoke_reason IS NULL)
        OR (NOT is_active AND revoked_at IS NOT NULL AND revoked_by_user_id IS NOT NULL
            AND revoke_reason IS NOT NULL AND BTRIM(revoke_reason) <> '')
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS device_qr_tokens_active_unique
    ON device_qr_tokens (company_id, device_id) WHERE is_active;

CREATE TABLE IF NOT EXISTS device_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    device_id UUID NOT NULL,
    action VARCHAR(40) NOT NULL,
    from_user_id UUID,
    to_user_id UUID,
    from_location_id UUID,
    to_location_id UUID,
    construction_site_id UUID,
    actor_user_id UUID NOT NULL,
    client_operation_id UUID NOT NULL,
    device_row_version_before BIGINT NOT NULL,
    device_row_version_after BIGINT NOT NULL,
    client_created_at TIMESTAMPTZ,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    condition_key VARCHAR(30) NOT NULL,
    note TEXT,
    CONSTRAINT device_transfers_company_id_id_key UNIQUE (company_id, id),
    CONSTRAINT device_transfers_operation_unique UNIQUE (company_id, client_operation_id),
    CONSTRAINT device_transfers_device_fkey FOREIGN KEY (company_id, device_id)
        REFERENCES devices (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT device_transfers_from_user_fkey FOREIGN KEY (company_id, from_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT device_transfers_to_user_fkey FOREIGN KEY (company_id, to_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT device_transfers_actor_fkey FOREIGN KEY (company_id, actor_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT device_transfers_from_location_fkey FOREIGN KEY (company_id, from_location_id)
        REFERENCES device_locations (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT device_transfers_to_location_fkey FOREIGN KEY (company_id, to_location_id)
        REFERENCES device_locations (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT device_transfers_site_fkey FOREIGN KEY (company_id, construction_site_id)
        REFERENCES construction_sites (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT device_transfers_action_check CHECK (action IN (
        'automatic_claim', 'takeover', 'handover', 'return_fixed_owner',
        'return_storage', 'leave_site', 'move_location', 'administrative_correction'
    )),
    CONSTRAINT device_transfers_versions_check CHECK (
        device_row_version_before >= 1 AND device_row_version_after > device_row_version_before
    ),
    CONSTRAINT device_transfers_condition_check CHECK (
        condition_key IN ('new', 'ok', 'worn', 'damaged', 'defective', 'unknown')
    )
);

CREATE INDEX IF NOT EXISTS device_transfers_device_idx
    ON device_transfers (company_id, device_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS device_defects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    device_id UUID NOT NULL,
    reported_by_user_id UUID NOT NULL,
    description TEXT NOT NULL,
    severity VARCHAR(20) NOT NULL,
    usable BOOLEAN NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'open',
    reported_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_by_user_id UUID,
    resolved_at TIMESTAMPTZ,
    resolution_note TEXT,
    row_version BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT device_defects_company_id_id_key UNIQUE (company_id, id),
    CONSTRAINT device_defects_device_fkey FOREIGN KEY (company_id, device_id)
        REFERENCES devices (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT device_defects_reporter_fkey FOREIGN KEY (company_id, reported_by_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT device_defects_resolver_fkey FOREIGN KEY (company_id, resolved_by_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT device_defects_description_check CHECK (CHAR_LENGTH(BTRIM(description)) BETWEEN 3 AND 2000),
    CONSTRAINT device_defects_severity_check CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    CONSTRAINT device_defects_status_check CHECK (status IN ('open', 'in_repair', 'resolved')),
    CONSTRAINT device_defects_resolution_check CHECK (
        (status <> 'resolved' AND resolved_by_user_id IS NULL AND resolved_at IS NULL)
        OR (status = 'resolved' AND resolved_by_user_id IS NOT NULL AND resolved_at IS NOT NULL
            AND resolution_note IS NOT NULL AND BTRIM(resolution_note) <> '')
    )
);

CREATE INDEX IF NOT EXISTS device_defects_open_idx
    ON device_defects (company_id, device_id, reported_at DESC) WHERE status <> 'resolved';

CREATE TABLE IF NOT EXISTS device_inspections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    device_id UUID NOT NULL,
    inspection_type VARCHAR(120) NOT NULL,
    inspected_on DATE NOT NULL,
    inspector_user_id UUID,
    inspector_name VARCHAR(160),
    result VARCHAR(30) NOT NULL,
    next_inspection_on DATE,
    interval_days INTEGER,
    protocol_document_id UUID,
    note TEXT,
    created_by_user_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT device_inspections_company_id_id_key UNIQUE (company_id, id),
    CONSTRAINT device_inspections_device_fkey FOREIGN KEY (company_id, device_id)
        REFERENCES devices (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT device_inspections_inspector_fkey FOREIGN KEY (company_id, inspector_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT device_inspections_document_fkey FOREIGN KEY (company_id, protocol_document_id)
        REFERENCES documents (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT device_inspections_creator_fkey FOREIGN KEY (company_id, created_by_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT device_inspections_type_check CHECK (BTRIM(inspection_type) <> ''),
    CONSTRAINT device_inspections_inspector_check CHECK (
        inspector_user_id IS NOT NULL OR (inspector_name IS NOT NULL AND BTRIM(inspector_name) <> '')
    ),
    CONSTRAINT device_inspections_result_check CHECK (
        result IN ('passed', 'passed_with_notes', 'failed')
    ),
    CONSTRAINT device_inspections_interval_check CHECK (
        interval_days IS NULL OR interval_days BETWEEN 1 AND 3650
    )
);

CREATE INDEX IF NOT EXISTS device_inspections_device_idx
    ON device_inspections (company_id, device_id, inspected_on DESC);

CREATE TABLE IF NOT EXISTS device_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    device_id UUID NOT NULL,
    defect_id UUID,
    image_kind VARCHAR(20) NOT NULL,
    mime_type VARCHAR(40) NOT NULL,
    size_bytes INTEGER NOT NULL,
    sha256_hex CHAR(64) NOT NULL,
    content BYTEA NOT NULL,
    uploaded_by_user_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT device_images_company_id_id_key UNIQUE (company_id, id),
    CONSTRAINT device_images_device_fkey FOREIGN KEY (company_id, device_id)
        REFERENCES devices (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT device_images_defect_fkey FOREIGN KEY (company_id, defect_id)
        REFERENCES device_defects (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT device_images_uploader_fkey FOREIGN KEY (company_id, uploaded_by_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT device_images_kind_check CHECK (image_kind IN ('device', 'defect')),
    CONSTRAINT device_images_mime_check CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
    CONSTRAINT device_images_size_check CHECK (size_bytes BETWEEN 1 AND 3000000),
    CONSTRAINT device_images_content_check CHECK (OCTET_LENGTH(content) = size_bytes),
    CONSTRAINT device_images_sha_check CHECK (sha256_hex ~ '^[0-9a-f]{64}$'),
    CONSTRAINT device_images_defect_check CHECK (
        (image_kind = 'device' AND defect_id IS NULL)
        OR (image_kind = 'defect' AND defect_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS device_images_profile_idx
    ON device_images (company_id, device_id, created_at DESC) WHERE image_kind = 'device';

CREATE TABLE IF NOT EXISTS device_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    recipient_user_id UUID NOT NULL,
    device_id UUID NOT NULL,
    notification_type VARCHAR(40) NOT NULL,
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    source_key VARCHAR(180) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    read_at TIMESTAMPTZ,
    CONSTRAINT device_notifications_recipient_fkey FOREIGN KEY (company_id, recipient_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT device_notifications_device_fkey FOREIGN KEY (company_id, device_id)
        REFERENCES devices (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT device_notifications_source_unique UNIQUE (company_id, recipient_user_id, source_key),
    CONSTRAINT device_notifications_type_check CHECK (notification_type IN (
        'fixed_device_taken', 'fixed_device_returned', 'inspection_due',
        'inspection_overdue', 'defect_reported', 'device_missing', 'long_loan'
    )),
    CONSTRAINT device_notifications_text_check CHECK (
        BTRIM(title) <> '' AND BTRIM(message) <> '' AND BTRIM(source_key) <> ''
    )
);

CREATE INDEX IF NOT EXISTS device_notifications_unread_idx
    ON device_notifications (company_id, recipient_user_id, created_at DESC)
    WHERE read_at IS NULL;

CREATE TABLE IF NOT EXISTS device_inventory_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    location_id UUID NOT NULL,
    started_by_user_id UUID NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'running',
    started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ,
    note TEXT,
    row_version BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT device_inventory_sessions_company_id_id_key UNIQUE (company_id, id),
    CONSTRAINT device_inventory_sessions_location_fkey FOREIGN KEY (company_id, location_id)
        REFERENCES device_locations (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT device_inventory_sessions_starter_fkey FOREIGN KEY (company_id, started_by_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT device_inventory_sessions_status_check CHECK (status IN ('running', 'completed', 'cancelled')),
    CONSTRAINT device_inventory_sessions_completed_check CHECK (
        (status = 'running' AND completed_at IS NULL)
        OR (status <> 'running' AND completed_at IS NOT NULL)
    )
);

CREATE TABLE IF NOT EXISTS device_inventory_expected (
    company_id UUID NOT NULL,
    inventory_session_id UUID NOT NULL,
    device_id UUID NOT NULL,
    expected_user_id UUID,
    expected_location_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (company_id, inventory_session_id, device_id),
    CONSTRAINT device_inventory_expected_session_fkey FOREIGN KEY (company_id, inventory_session_id)
        REFERENCES device_inventory_sessions (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT device_inventory_expected_device_fkey FOREIGN KEY (company_id, device_id)
        REFERENCES devices (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT device_inventory_expected_user_fkey FOREIGN KEY (company_id, expected_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT device_inventory_expected_location_fkey FOREIGN KEY (company_id, expected_location_id)
        REFERENCES device_locations (company_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS device_inventory_scans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    inventory_session_id UUID NOT NULL,
    device_id UUID,
    token_fingerprint CHAR(64) NOT NULL,
    scanned_by_user_id UUID NOT NULL,
    result VARCHAR(30) NOT NULL,
    observed_user_id UUID,
    observed_location_id UUID,
    scanned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT device_inventory_scans_session_fkey FOREIGN KEY (company_id, inventory_session_id)
        REFERENCES device_inventory_sessions (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT device_inventory_scans_device_fkey FOREIGN KEY (company_id, device_id)
        REFERENCES devices (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT device_inventory_scans_scanner_fkey FOREIGN KEY (company_id, scanned_by_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT device_inventory_scans_user_fkey FOREIGN KEY (company_id, observed_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT device_inventory_scans_location_fkey FOREIGN KEY (company_id, observed_location_id)
        REFERENCES device_locations (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT device_inventory_scans_result_check CHECK (
        result IN ('found', 'wrong_location', 'wrong_owner', 'unexpected', 'unknown')
    ),
    CONSTRAINT device_inventory_scans_fingerprint_check CHECK (token_fingerprint ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS device_inventory_scans_device_unique
    ON device_inventory_scans (company_id, inventory_session_id, device_id)
    WHERE device_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS device_inventory_scans_unknown_unique
    ON device_inventory_scans (company_id, inventory_session_id, token_fingerprint)
    WHERE device_id IS NULL;

CREATE TABLE IF NOT EXISTS device_settings (
    company_id UUID PRIMARY KEY REFERENCES companies (id) ON DELETE RESTRICT,
    inspection_warning_days INTEGER NOT NULL DEFAULT 30,
    long_loan_days INTEGER NOT NULL DEFAULT 14,
    lock_overdue_inspections BOOLEAN NOT NULL DEFAULT FALSE,
    default_storage_location_id UUID,
    row_version BIGINT NOT NULL DEFAULT 1,
    updated_by_user_id UUID,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT device_settings_location_fkey FOREIGN KEY (company_id, default_storage_location_id)
        REFERENCES device_locations (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT device_settings_updater_fkey FOREIGN KEY (company_id, updated_by_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT device_settings_days_check CHECK (
        inspection_warning_days BETWEEN 0 AND 365 AND long_loan_days BETWEEN 1 AND 3650
    )
);

CREATE TABLE IF NOT EXISTS device_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    device_id UUID NOT NULL,
    action VARCHAR(60) NOT NULL,
    actor_user_id UUID NOT NULL,
    old_state JSONB,
    new_state JSONB,
    reason TEXT,
    source_type VARCHAR(30) NOT NULL DEFAULT 'api',
    source_id UUID,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT device_history_device_fkey FOREIGN KEY (company_id, device_id)
        REFERENCES devices (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT device_history_actor_fkey FOREIGN KEY (company_id, actor_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT device_history_action_check CHECK (BTRIM(action) <> ''),
    CONSTRAINT device_history_old_check CHECK (old_state IS NULL OR jsonb_typeof(old_state) = 'object'),
    CONSTRAINT device_history_new_check CHECK (new_state IS NULL OR jsonb_typeof(new_state) = 'object'),
    CONSTRAINT device_history_source_check CHECK (
        source_type IN ('api', 'qr_scan', 'offline_sync', 'inventory', 'system')
    )
);

CREATE INDEX IF NOT EXISTS device_history_device_idx
    ON device_history (company_id, device_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION device_master_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_TABLE_NAME = 'device_categories' THEN
        NEW.category_key := LOWER(BTRIM(NEW.category_key));
        NEW.name := BTRIM(NEW.name);
    ELSIF TG_TABLE_NAME = 'device_locations' THEN
        NEW.name := BTRIM(NEW.name);
        NEW.note := NULLIF(BTRIM(NEW.note), '');
    ELSIF TG_TABLE_NAME = 'device_sets' THEN
        NEW.set_number := UPPER(BTRIM(NEW.set_number));
        NEW.name := BTRIM(NEW.name);
        NEW.note := NULLIF(BTRIM(NEW.note), '');
    ELSIF TG_TABLE_NAME = 'devices' THEN
        NEW.inventory_number := UPPER(BTRIM(NEW.inventory_number));
        NEW.name := BTRIM(NEW.name);
        NEW.manufacturer := NULLIF(BTRIM(NEW.manufacturer), '');
        NEW.model := NULLIF(BTRIM(NEW.model), '');
        NEW.serial_number := NULLIF(BTRIM(NEW.serial_number), '');
        NEW.supplier := NULLIF(BTRIM(NEW.supplier), '');
        NEW.note := NULLIF(BTRIM(NEW.note), '');
        IF NEW.status = 'retired' THEN
            NEW.retired_at := COALESCE(NEW.retired_at, CURRENT_TIMESTAMP);
            NEW.retired_reason := NULLIF(BTRIM(NEW.retired_reason), '');
        ELSE
            NEW.retired_at := NULL;
            NEW.retired_reason := NULL;
        END IF;
    END IF;
    IF TG_OP = 'UPDATE' THEN
        IF NEW.company_id <> OLD.company_id OR NEW.created_at <> OLD.created_at THEN
            RAISE EXCEPTION 'Mandant und Erstellungszeit sind unveränderlich.';
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
        'device_categories'::REGCLASS, 'device_locations'::REGCLASS,
        'device_sets'::REGCLASS, 'devices'::REGCLASS
    ] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS device_master_before_write_trigger ON %s', target);
        EXECUTE format(
            'CREATE TRIGGER device_master_before_write_trigger BEFORE INSERT OR UPDATE ON %s '
            'FOR EACH ROW EXECUTE FUNCTION device_master_before_write()', target
        );
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION device_simple_version_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        NEW.row_version := OLD.row_version + 1;
        NEW.updated_at := CURRENT_TIMESTAMP;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS device_battery_version_trigger ON device_battery_profiles;
CREATE TRIGGER device_battery_version_trigger
    BEFORE UPDATE ON device_battery_profiles
    FOR EACH ROW EXECUTE FUNCTION device_simple_version_before_write();

CREATE OR REPLACE FUNCTION device_assignment_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF OLD.ended_at IS NOT NULL OR NEW.company_id <> OLD.company_id
           OR NEW.device_id <> OLD.device_id OR NEW.assignment_type <> OLD.assignment_type
           OR NEW.user_id <> OLD.user_id OR NEW.started_at <> OLD.started_at
           OR NEW.created_by_user_id <> OLD.created_by_user_id THEN
            RAISE EXCEPTION 'Eine Gerätezuordnung kann nur einmal beendet werden.';
        END IF;
        NEW.row_version := OLD.row_version + 1;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS device_assignment_before_write_trigger ON device_assignments;
CREATE TRIGGER device_assignment_before_write_trigger
    BEFORE UPDATE ON device_assignments
    FOR EACH ROW EXECUTE FUNCTION device_assignment_before_write();

CREATE OR REPLACE FUNCTION device_qr_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND (
        OLD.is_active = FALSE OR NEW.company_id <> OLD.company_id
        OR NEW.device_id <> OLD.device_id OR NEW.public_token <> OLD.public_token
        OR NEW.generation <> OLD.generation OR NEW.created_at <> OLD.created_at
        OR NEW.created_by_user_id <> OLD.created_by_user_id OR NEW.is_active
    ) THEN
        RAISE EXCEPTION 'Ein QR-Token kann nur einmal widerrufen werden.';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS device_qr_before_write_trigger ON device_qr_tokens;
CREATE TRIGGER device_qr_before_write_trigger
    BEFORE UPDATE ON device_qr_tokens
    FOR EACH ROW EXECUTE FUNCTION device_qr_before_write();

CREATE OR REPLACE FUNCTION device_event_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'Gerätehistorien und abgeschlossene Vorgänge sind unveränderlich.';
END;
$$;

DO $$
DECLARE target REGCLASS;
BEGIN
    FOREACH target IN ARRAY ARRAY[
        'device_transfers'::REGCLASS, 'device_inspections'::REGCLASS,
        'device_images'::REGCLASS, 'device_inventory_expected'::REGCLASS,
        'device_inventory_scans'::REGCLASS, 'device_history'::REGCLASS
    ] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS device_event_immutable_trigger ON %s', target);
        EXECUTE format(
            'CREATE TRIGGER device_event_immutable_trigger BEFORE UPDATE OR DELETE ON %s '
            'FOR EACH ROW EXECUTE FUNCTION device_event_immutable()', target
        );
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION device_prevent_hard_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF CURRENT_SETTING('app.allow_hard_delete', TRUE) = 'on' THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'Gerätedaten werden archiviert und nicht hart gelöscht.';
END;
$$;

DO $$
DECLARE target REGCLASS;
BEGIN
    FOREACH target IN ARRAY ARRAY[
        'device_categories'::REGCLASS, 'device_locations'::REGCLASS,
        'device_sets'::REGCLASS, 'devices'::REGCLASS,
        'device_battery_profiles'::REGCLASS, 'device_set_items'::REGCLASS,
        'device_assignments'::REGCLASS, 'device_qr_tokens'::REGCLASS,
        'device_defects'::REGCLASS, 'device_notifications'::REGCLASS,
        'device_inventory_sessions'::REGCLASS, 'device_settings'::REGCLASS
    ] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS device_prevent_hard_delete_trigger ON %s', target);
        EXECUTE format(
            'CREATE TRIGGER device_prevent_hard_delete_trigger BEFORE DELETE ON %s '
            'FOR EACH ROW EXECUTE FUNCTION device_prevent_hard_delete()', target
        );
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION seed_device_master_data(target_company_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE lager UUID;
BEGIN
    INSERT INTO device_categories (company_id, category_key, name, base_type, is_system)
    VALUES
        (target_company_id, 'machines', 'Maschinen', 'machine', TRUE),
        (target_company_id, 'power_tools', 'Elektrowerkzeuge', 'power_tool', TRUE),
        (target_company_id, 'hand_tools', 'Handwerkzeuge', 'hand_tool', TRUE),
        (target_company_id, 'measuring_devices', 'Messgeräte', 'measuring_device', TRUE),
        (target_company_id, 'testing_devices', 'Prüfgeräte', 'testing_device', TRUE),
        (target_company_id, 'batteries', 'Akkus', 'battery', TRUE),
        (target_company_id, 'chargers', 'Ladegeräte', 'charger', TRUE),
        (target_company_id, 'ladders', 'Leitern', 'ladder', TRUE),
        (target_company_id, 'equipment', 'Betriebsmittel', 'equipment', TRUE),
        (target_company_id, 'other', 'Sonstige Geräte', 'other', TRUE)
    ON CONFLICT (company_id, category_key) DO NOTHING;

    INSERT INTO device_locations (company_id, name, location_type)
    VALUES (target_company_id, 'Hauptlager', 'warehouse')
    ON CONFLICT (company_id, (LOWER(name))) DO NOTHING;
    INSERT INTO device_locations (company_id, name, location_type)
    VALUES (target_company_id, 'Werkstatt', 'workshop')
    ON CONFLICT (company_id, (LOWER(name))) DO NOTHING;

    SELECT id INTO lager FROM device_locations
    WHERE company_id = target_company_id AND LOWER(name) = 'hauptlager';
    INSERT INTO device_settings (company_id, default_storage_location_id)
    VALUES (target_company_id, lager)
    ON CONFLICT (company_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION companies_seed_device_master_data()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    PERFORM seed_device_master_data(NEW.id);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS companies_seed_device_master_data_trigger ON companies;
CREATE TRIGGER companies_seed_device_master_data_trigger
    AFTER INSERT ON companies
    FOR EACH ROW EXECUTE FUNCTION companies_seed_device_master_data();

DO $$
DECLARE tenant RECORD;
BEGIN
    FOR tenant IN SELECT id FROM companies LOOP
        PERFORM seed_device_master_data(tenant.id);
    END LOOP;
END;
$$;

-- Jede fachliche Tabelle wird auf der Datenbankebene nach Firma getrennt.
DO $$
DECLARE target TEXT;
BEGIN
    FOREACH target IN ARRAY ARRAY[
        'device_categories', 'device_locations', 'device_sets', 'devices',
        'device_battery_profiles', 'device_set_items', 'device_assignments',
        'device_qr_tokens', 'device_transfers', 'device_defects',
        'device_inspections', 'device_images', 'device_notifications',
        'device_inventory_sessions', 'device_inventory_expected',
        'device_inventory_scans', 'device_settings', 'device_history'
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
    device_categories, device_locations, device_sets, devices,
    device_battery_profiles, device_set_items, device_assignments,
    device_qr_tokens, device_defects, device_notifications,
    device_inventory_sessions, device_settings
TO schaefchen_api;

GRANT SELECT, INSERT ON
    device_transfers, device_inspections, device_images,
    device_inventory_expected, device_inventory_scans, device_history
TO schaefchen_api;

COMMENT ON TABLE devices IS
    'Mandantenbezogener Stammdatensatz fuer Maschinen, Werkzeuge, Messgeraete, Akkus und Betriebsmittel.';
COMMENT ON TABLE device_assignments IS
    'Zeitlich gueltige feste Zuordnung und tatsaechlicher Besitz; je Art hoechstens eine aktive Zeile.';
COMMENT ON TABLE device_qr_tokens IS
    'Nicht erratbarer QR-Token ohne Namen, Inventarnummer oder Firmendaten.';
COMMENT ON TABLE device_transfers IS
    'Idempotente, unveraenderliche Uebergaben mit Zeilenversion gegen gleichzeitige Scans.';
COMMENT ON TABLE device_history IS
    'Unveraenderliches fachliches Audit-Log aller kritischen Geraeteaenderungen.';

COMMIT;
