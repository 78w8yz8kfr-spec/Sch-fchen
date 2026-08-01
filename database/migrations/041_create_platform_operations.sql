BEGIN;

CREATE SEQUENCE IF NOT EXISTS support_ticket_number_seq AS BIGINT START WITH 1;

CREATE TABLE IF NOT EXISTS company_registration_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    registration_type VARCHAR(20) NOT NULL DEFAULT 'self_service',
    status VARCHAR(30) NOT NULL DEFAULT 'incomplete',
    legal_name VARCHAR(200) NOT NULL,
    display_name VARCHAR(120) NOT NULL,
    contact_name VARCHAR(200) NOT NULL,
    contact_email VARCHAR(254) NOT NULL,
    requested_plan_key VARCHAR(60),
    is_test_company BOOLEAN NOT NULL DEFAULT FALSE,
    invitation_token_hash CHAR(64),
    invitation_expires_at TIMESTAMPTZ,
    invited_by_platform_user_id UUID REFERENCES platform_users (id) ON DELETE RESTRICT,
    reviewed_by_platform_user_id UUID REFERENCES platform_users (id) ON DELETE RESTRICT,
    review_reason TEXT,
    reviewed_at TIMESTAMPTZ,
    company_id UUID REFERENCES companies (id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    row_version BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT registration_type_check CHECK (registration_type IN ('self_service', 'invitation', 'manual')),
    CONSTRAINT registration_status_check CHECK (
        status IN ('incomplete', 'pending', 'approved', 'rejected', 'expired', 'removed')
    ),
    CONSTRAINT registration_names_check CHECK (
        BTRIM(legal_name) <> '' AND BTRIM(display_name) <> ''
        AND BTRIM(contact_name) <> '' AND BTRIM(contact_email) <> ''
    ),
    CONSTRAINT registration_invitation_check CHECK (
        (invitation_token_hash IS NULL AND invitation_expires_at IS NULL)
        OR (invitation_token_hash ~ '^[0-9a-f]{64}$' AND invitation_expires_at IS NOT NULL)
    ),
    CONSTRAINT registration_review_check CHECK (
        (reviewed_at IS NULL AND reviewed_by_platform_user_id IS NULL)
        OR (reviewed_at IS NOT NULL AND reviewed_by_platform_user_id IS NOT NULL AND BTRIM(review_reason) <> '')
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS company_registration_invite_token_key
    ON company_registration_requests (invitation_token_hash)
    WHERE invitation_token_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS support_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_number VARCHAR(24) NOT NULL DEFAULT (
        'SUP-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(nextval('support_ticket_number_seq')::TEXT, 6, '0')
    ),
    company_id UUID NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
    contact_name VARCHAR(200) NOT NULL,
    contact_email VARCHAR(254),
    category VARCHAR(40) NOT NULL,
    priority VARCHAR(20) NOT NULL DEFAULT 'normal',
    subject VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'new',
    assigned_platform_user_id UUID REFERENCES platform_users (id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMPTZ,
    row_version BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT support_tickets_number_key UNIQUE (ticket_number),
    CONSTRAINT support_tickets_text_check CHECK (
        BTRIM(contact_name) <> '' AND BTRIM(subject) <> '' AND BTRIM(description) <> ''
    ),
    CONSTRAINT support_tickets_priority_check CHECK (priority IN ('low', 'normal', 'high', 'critical')),
    CONSTRAINT support_tickets_status_check CHECK (
        status IN ('new', 'assigned', 'in_progress', 'question', 'waiting_customer', 'resolved', 'closed')
    )
);

CREATE INDEX IF NOT EXISTS support_tickets_queue_idx
    ON support_tickets (status, priority, updated_at DESC);

CREATE TABLE IF NOT EXISTS support_ticket_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    support_ticket_id UUID NOT NULL REFERENCES support_tickets (id) ON DELETE RESTRICT,
    platform_user_id UUID REFERENCES platform_users (id) ON DELETE RESTRICT,
    event_type VARCHAR(40) NOT NULL,
    message TEXT NOT NULL,
    old_state JSONB,
    new_state JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT support_ticket_events_message_check CHECK (BTRIM(message) <> '')
);

CREATE TABLE IF NOT EXISTS support_ticket_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    support_ticket_id UUID NOT NULL REFERENCES support_tickets (id) ON DELETE RESTRICT,
    object_key TEXT NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    content_type VARCHAR(150) NOT NULL,
    size_bytes BIGINT NOT NULL,
    uploaded_by_platform_user_id UUID REFERENCES platform_users (id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT support_attachment_fields_check CHECK (
        BTRIM(object_key) <> '' AND BTRIM(file_name) <> ''
        AND BTRIM(content_type) <> '' AND size_bytes >= 0
    )
);

CREATE TABLE IF NOT EXISTS support_access_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform_user_id UUID NOT NULL REFERENCES platform_users (id) ON DELETE RESTRICT,
    company_id UUID NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
    reason_code VARCHAR(40) NOT NULL,
    reason_detail TEXT NOT NULL,
    support_ticket_id UUID REFERENCES support_tickets (id) ON DELETE RESTRICT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ,
    opened_areas JSONB NOT NULL DEFAULT '[]'::JSONB,
    changes JSONB NOT NULL DEFAULT '[]'::JSONB,
    CONSTRAINT support_access_reason_check CHECK (
        reason_code IN ('support_request', 'technical_analysis', 'setup', 'data_correction', 'migration', 'restore')
        AND BTRIM(reason_detail) <> ''
    ),
    CONSTRAINT support_access_expiry_check CHECK (expires_at > started_at),
    CONSTRAINT support_access_end_check CHECK (ended_at IS NULL OR ended_at >= started_at),
    CONSTRAINT support_access_json_check CHECK (
        jsonb_typeof(opened_areas) = 'array' AND jsonb_typeof(changes) = 'array'
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS support_access_one_active_per_admin
    ON support_access_sessions (platform_user_id)
    WHERE ended_at IS NULL;

CREATE TABLE IF NOT EXISTS support_access_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    support_access_session_id UUID NOT NULL REFERENCES support_access_sessions (id) ON DELETE RESTRICT,
    platform_user_id UUID NOT NULL REFERENCES platform_users (id) ON DELETE RESTRICT,
    event_type VARCHAR(30) NOT NULL,
    area VARCHAR(100),
    details JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT support_access_events_type_check
        CHECK (event_type IN ('started', 'area_opened', 'change_prepared', 'change_confirmed', 'ended', 'expired')),
    CONSTRAINT support_access_events_details_check CHECK (jsonb_typeof(details) = 'object')
);

CREATE TABLE IF NOT EXISTS system_health_components (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    component_key VARCHAR(60) NOT NULL UNIQUE,
    name VARCHAR(120) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'available',
    last_success_at TIMESTAMPTZ,
    last_error_at TIMESTAMPTZ,
    last_error_summary TEXT,
    error_count_24h INTEGER NOT NULL DEFAULT 0,
    checked_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT system_health_key_check CHECK (component_key ~ '^[a-z][a-z0-9_]*$'),
    CONSTRAINT system_health_status_check CHECK (status IN ('available', 'degraded', 'outage')),
    CONSTRAINT system_health_error_count_check CHECK (error_count_24h >= 0),
    CONSTRAINT system_health_metadata_check CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE TABLE IF NOT EXISTS background_process_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    process_key VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    finished_at TIMESTAMPTZ,
    error_code VARCHAR(80),
    error_summary TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    CONSTRAINT background_run_status_check CHECK (status IN ('running', 'success', 'failed', 'cancelled')),
    CONSTRAINT background_run_dates_check CHECK (finished_at IS NULL OR finished_at >= started_at),
    CONSTRAINT background_run_retry_check CHECK (retry_count >= 0),
    CONSTRAINT background_run_metadata_check CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS background_process_failed_idx
    ON background_process_runs (started_at DESC) WHERE status = 'failed';

CREATE TABLE IF NOT EXISTS platform_error_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fingerprint CHAR(64) NOT NULL UNIQUE,
    error_code VARCHAR(80),
    severity VARCHAR(20) NOT NULL DEFAULT 'error',
    module VARCHAR(80),
    application_version VARCHAR(40),
    sanitized_message TEXT NOT NULL,
    sanitized_details JSONB NOT NULL DEFAULT '{}'::JSONB,
    occurrence_count BIGINT NOT NULL DEFAULT 1,
    first_seen_at TIMESTAMPTZ NOT NULL,
    last_seen_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'new',
    resolved_at TIMESTAMPTZ,
    CONSTRAINT platform_error_fingerprint_check CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
    CONSTRAINT platform_error_severity_check CHECK (severity IN ('info', 'warning', 'error', 'critical')),
    CONSTRAINT platform_error_status_check CHECK (status IN ('new', 'investigating', 'resolved', 'reopened')),
    CONSTRAINT platform_error_count_check CHECK (occurrence_count >= 1),
    CONSTRAINT platform_error_dates_check CHECK (last_seen_at >= first_seen_at),
    CONSTRAINT platform_error_details_check CHECK (jsonb_typeof(sanitized_details) = 'object')
);

CREATE TABLE IF NOT EXISTS platform_error_occurrences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    error_group_id UUID NOT NULL REFERENCES platform_error_groups (id) ON DELETE RESTRICT,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    company_id UUID REFERENCES companies (id) ON DELETE RESTRICT,
    user_id UUID,
    device_class VARCHAR(50),
    browser VARCHAR(100),
    operating_system VARCHAR(100),
    request_id VARCHAR(100),
    sanitized_context JSONB NOT NULL DEFAULT '{}'::JSONB,
    CONSTRAINT platform_error_context_check CHECK (jsonb_typeof(sanitized_context) = 'object')
);

CREATE TABLE IF NOT EXISTS application_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version VARCHAR(40) NOT NULL UNIQUE,
    release_status VARCHAR(20) NOT NULL DEFAULT 'draft',
    released_at TIMESTAMPTZ,
    changelog TEXT NOT NULL DEFAULT '',
    known_issues JSONB NOT NULL DEFAULT '[]'::JSONB,
    database_migrations JSONB NOT NULL DEFAULT '[]'::JSONB,
    rollout_percent INTEGER NOT NULL DEFAULT 0,
    mandatory_update BOOLEAN NOT NULL DEFAULT FALSE,
    withdrawn_at TIMESTAMPTZ,
    created_by_platform_user_id UUID REFERENCES platform_users (id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT application_versions_status_check
        CHECK (release_status IN ('draft', 'rolling_out', 'production', 'withdrawn', 'superseded')),
    CONSTRAINT application_versions_rollout_check CHECK (rollout_percent BETWEEN 0 AND 100),
    CONSTRAINT application_versions_json_check CHECK (
        jsonb_typeof(known_issues) = 'array' AND jsonb_typeof(database_migrations) = 'array'
    )
);

CREATE TABLE IF NOT EXISTS platform_announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    announcement_type VARCHAR(30) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    targets JSONB NOT NULL DEFAULT '{"scope":"all"}'::JSONB,
    publish_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_by_platform_user_id UUID NOT NULL REFERENCES platform_users (id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    row_version BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT announcements_text_check CHECK (BTRIM(title) <> '' AND BTRIM(message) <> ''),
    CONSTRAINT announcements_type_check CHECK (
        announcement_type IN ('maintenance', 'outage', 'security', 'feature', 'update', 'terms')
    ),
    CONSTRAINT announcements_status_check CHECK (status IN ('draft', 'scheduled', 'published', 'disabled')),
    CONSTRAINT announcements_targets_check CHECK (jsonb_typeof(targets) = 'object'),
    CONSTRAINT announcements_dates_check CHECK (expires_at IS NULL OR publish_at IS NULL OR expires_at > publish_at)
);

CREATE TABLE IF NOT EXISTS platform_announcement_reads (
    announcement_id UUID NOT NULL REFERENCES platform_announcements (id) ON DELETE RESTRICT,
    company_id UUID NOT NULL,
    user_id UUID NOT NULL,
    read_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (announcement_id, company_id, user_id),
    CONSTRAINT announcement_reads_user_fkey
        FOREIGN KEY (company_id, user_id) REFERENCES users (company_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS platform_backup_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    backup_type VARCHAR(30) NOT NULL DEFAULT 'scheduled',
    status VARCHAR(20) NOT NULL DEFAULT 'queued',
    scope_company_id UUID REFERENCES companies (id) ON DELETE RESTRICT,
    storage_location TEXT,
    retention_until TIMESTAMPTZ,
    integrity_status VARCHAR(20) NOT NULL DEFAULT 'pending',
    requested_by_platform_user_id UUID REFERENCES platform_users (id) ON DELETE RESTRICT,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    error_summary TEXT,
    CONSTRAINT backup_runs_type_check CHECK (backup_type IN ('scheduled', 'manual', 'company', 'test_restore')),
    CONSTRAINT backup_runs_status_check CHECK (status IN ('queued', 'running', 'success', 'failed', 'cancelled')),
    CONSTRAINT backup_runs_integrity_check CHECK (integrity_status IN ('pending', 'valid', 'invalid', 'unknown')),
    CONSTRAINT backup_runs_dates_check CHECK (finished_at IS NULL OR started_at IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS platform_restore_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    backup_run_id UUID NOT NULL REFERENCES platform_backup_runs (id) ON DELETE RESTRICT,
    scope_company_id UUID REFERENCES companies (id) ON DELETE RESTRICT,
    restore_type VARCHAR(30) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'prepared',
    reason TEXT NOT NULL,
    prepared_by_platform_user_id UUID NOT NULL REFERENCES platform_users (id) ON DELETE RESTRICT,
    confirmed_by_platform_user_id UUID REFERENCES platform_users (id) ON DELETE RESTRICT,
    prepared_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    result_summary TEXT,
    CONSTRAINT restore_type_check CHECK (restore_type IN ('test', 'company', 'deleted_data', 'full')),
    CONSTRAINT restore_status_check CHECK (status IN ('prepared', 'confirmed', 'running', 'success', 'failed', 'cancelled')),
    CONSTRAINT restore_reason_check CHECK (BTRIM(reason) <> ''),
    CONSTRAINT restore_confirmation_check CHECK (
        (confirmed_at IS NULL AND confirmed_by_platform_user_id IS NULL)
        OR (confirmed_at IS NOT NULL AND confirmed_by_platform_user_id IS NOT NULL)
    )
);

ALTER TABLE platform_restore_requests
    DROP CONSTRAINT IF EXISTS restore_four_eyes_check;
ALTER TABLE platform_restore_requests
    ADD CONSTRAINT restore_four_eyes_check CHECK (
        confirmed_by_platform_user_id IS NULL
        OR confirmed_by_platform_user_id <> prepared_by_platform_user_id
    );

CREATE TABLE IF NOT EXISTS privacy_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_type VARCHAR(30) NOT NULL,
    company_id UUID REFERENCES companies (id) ON DELETE RESTRICT,
    user_id UUID,
    status VARCHAR(30) NOT NULL DEFAULT 'recorded',
    reason TEXT NOT NULL,
    retention_review JSONB NOT NULL DEFAULT '{}'::JSONB,
    recovery_deadline TIMESTAMPTZ,
    first_confirmed_by_platform_user_id UUID REFERENCES platform_users (id) ON DELETE RESTRICT,
    second_confirmed_by_platform_user_id UUID REFERENCES platform_users (id) ON DELETE RESTRICT,
    result_object_key TEXT,
    deletion_log JSONB,
    created_by_platform_user_id UUID NOT NULL REFERENCES platform_users (id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ,
    row_version BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT privacy_request_type_check CHECK (
        request_type IN ('company_export', 'user_export', 'company_deletion', 'user_deletion', 'anonymization')
    ),
    CONSTRAINT privacy_request_status_check CHECK (
        status IN ('recorded', 'retention_review', 'deactivated', 'archived', 'recovery_period', 'confirmed', 'processing', 'completed', 'rejected')
    ),
    CONSTRAINT privacy_request_reason_check CHECK (BTRIM(reason) <> ''),
    CONSTRAINT privacy_request_target_check CHECK (company_id IS NOT NULL OR user_id IS NOT NULL),
    CONSTRAINT privacy_request_review_check CHECK (jsonb_typeof(retention_review) = 'object'),
    CONSTRAINT privacy_request_log_check CHECK (deletion_log IS NULL OR jsonb_typeof(deletion_log) = 'object')
);

ALTER TABLE privacy_requests
    DROP CONSTRAINT IF EXISTS privacy_four_eyes_check;
ALTER TABLE privacy_requests
    ADD CONSTRAINT privacy_four_eyes_check CHECK (
        second_confirmed_by_platform_user_id IS NULL
        OR (
            first_confirmed_by_platform_user_id IS NOT NULL
            AND second_confirmed_by_platform_user_id <> first_confirmed_by_platform_user_id
        )
    );

CREATE TABLE IF NOT EXISTS platform_settings (
    setting_key VARCHAR(80) PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    is_sensitive BOOLEAN NOT NULL DEFAULT FALSE,
    changed_by_platform_user_id UUID REFERENCES platform_users (id) ON DELETE RESTRICT,
    change_reason TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    row_version BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT platform_settings_key_check CHECK (setting_key ~ '^[a-z][a-z0-9_.]*$'),
    CONSTRAINT platform_settings_reason_check CHECK (BTRIM(change_reason) <> '')
);

CREATE TABLE IF NOT EXISTS platform_setting_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    setting_key VARCHAR(80) NOT NULL,
    row_version BIGINT NOT NULL,
    old_value JSONB,
    new_value JSONB NOT NULL,
    changed_by_platform_user_id UUID REFERENCES platform_users (id) ON DELETE RESTRICT,
    change_reason TEXT NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT platform_setting_history_key UNIQUE (setting_key, row_version)
);

CREATE OR REPLACE FUNCTION platform_versioned_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        NEW.updated_at := CURRENT_TIMESTAMP;
        NEW.row_version := OLD.row_version + 1;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS registration_before_write_trigger ON company_registration_requests;
CREATE TRIGGER registration_before_write_trigger BEFORE UPDATE ON company_registration_requests
    FOR EACH ROW EXECUTE FUNCTION platform_versioned_before_write();
DROP TRIGGER IF EXISTS support_tickets_before_write_trigger ON support_tickets;
CREATE TRIGGER support_tickets_before_write_trigger BEFORE UPDATE ON support_tickets
    FOR EACH ROW EXECUTE FUNCTION platform_versioned_before_write();
DROP TRIGGER IF EXISTS announcements_before_write_trigger ON platform_announcements;
CREATE TRIGGER announcements_before_write_trigger BEFORE UPDATE ON platform_announcements
    FOR EACH ROW EXECUTE FUNCTION platform_versioned_before_write();
DROP TRIGGER IF EXISTS privacy_requests_before_write_trigger ON privacy_requests;
CREATE TRIGGER privacy_requests_before_write_trigger BEFORE UPDATE ON privacy_requests
    FOR EACH ROW EXECUTE FUNCTION platform_versioned_before_write();

CREATE OR REPLACE FUNCTION platform_settings_before_write()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.change_reason := NULLIF(BTRIM(NEW.change_reason), '');
    IF TG_OP = 'UPDATE' THEN
        NEW.updated_at := CURRENT_TIMESTAMP;
        NEW.row_version := OLD.row_version + 1;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION platform_settings_record_history()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO platform_setting_history (
        setting_key, row_version, old_value, new_value,
        changed_by_platform_user_id, change_reason, changed_at
    ) VALUES (
        NEW.setting_key, NEW.row_version,
        CASE WHEN TG_OP = 'UPDATE' THEN OLD.value ELSE NULL END,
        NEW.value, NEW.changed_by_platform_user_id, NEW.change_reason, NEW.updated_at
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS platform_settings_before_write_trigger ON platform_settings;
CREATE TRIGGER platform_settings_before_write_trigger BEFORE INSERT OR UPDATE ON platform_settings
    FOR EACH ROW EXECUTE FUNCTION platform_settings_before_write();
DROP TRIGGER IF EXISTS platform_settings_history_trigger ON platform_settings;
CREATE TRIGGER platform_settings_history_trigger AFTER INSERT OR UPDATE ON platform_settings
    FOR EACH ROW EXECUTE FUNCTION platform_settings_record_history();

CREATE OR REPLACE FUNCTION platform_operations_history_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Plattformverläufe und technische Ereignisse sind unveränderlich.';
END;
$$;

DO $$
DECLARE target_table REGCLASS;
BEGIN
    FOREACH target_table IN ARRAY ARRAY[
        'support_ticket_events'::REGCLASS,
        'support_access_events'::REGCLASS,
        'platform_error_occurrences'::REGCLASS,
        'platform_setting_history'::REGCLASS
    ] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS platform_history_immutable_trigger ON %s', target_table);
        EXECUTE format(
            'CREATE TRIGGER platform_history_immutable_trigger BEFORE UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION platform_operations_history_immutable()',
            target_table
        );
    END LOOP;
END;
$$;

INSERT INTO system_health_components (component_key, name)
VALUES
    ('web_app', 'Webanwendung'), ('api', 'API'), ('database', 'Datenbank'),
    ('file_storage', 'Dateiablage'), ('email', 'E-Mail-Versand'),
    ('pdf', 'PDF-Erstellung'), ('excel', 'Excel-Export'),
    ('background_jobs', 'Hintergrundaufgaben'), ('queues', 'Warteschlangen'),
    ('backups', 'Backups'), ('authentication', 'Authentifizierung'),
    ('storage', 'Speicher'), ('external_integrations', 'Externe Schnittstellen')
ON CONFLICT (component_key) DO NOTHING;

INSERT INTO platform_settings (setting_key, value, description, change_reason)
VALUES
    ('platform.name', '"Schäfchen"'::JSONB, 'Plattformname', 'Systemstandard'),
    ('platform.default_logo', 'null'::JSONB, 'Standardlogo', 'Systemstandard'),
    ('support.contact', '"support@example.invalid"'::JSONB, 'Supportkontakt', 'Systemstandard'),
    ('email.sender', '"noreply@example.invalid"'::JSONB, 'Absender-E-Mail', 'Systemstandard'),
    ('registration.self_service_enabled', 'true'::JSONB, 'Globale Selbstregistrierung', 'Systemstandard'),
    ('trial.default_days', '14'::JSONB, 'Standard-Testzeitraum', 'Systemstandard'),
    ('security.password_policy', '{"minLength":12,"requireUpper":true,"requireLower":true,"requireNumber":true}'::JSONB, 'Passwortregeln', 'Systemstandard'),
    ('security.require_two_factor', 'false'::JSONB, 'Zwei-Faktor-Pflicht', 'Systemstandard'),
    ('security.session_minutes', '480'::JSONB, 'Sitzungsdauer', 'Systemstandard'),
    ('files.max_size_bytes', '26214400'::JSONB, 'Maximale Dateigröße', 'Systemstandard'),
    ('files.allowed_types', '["application/pdf","image/jpeg","image/png"]'::JSONB, 'Erlaubte Formate', 'Systemstandard'),
    ('storage.default_limit_bytes', '10737418240'::JSONB, 'Standardspeicher', 'Systemstandard'),
    ('retention.default_days', '3650'::JSONB, 'Aufbewahrungsfrist', 'Systemstandard'),
    ('companies.default_plan', '"standard"'::JSONB, 'Standardtarif', 'Systemstandard'),
    ('companies.default_modules', '["time_tracking","scheduling","documents"]'::JSONB, 'Standardmodule', 'Systemstandard'),
    ('maintenance.enabled', 'false'::JSONB, 'Wartungsmodus', 'Systemstandard'),
    ('legal.privacy_policy', '""'::JSONB, 'Datenschutzerklärung', 'Systemstandard'),
    ('legal.terms', '""'::JSONB, 'Nutzungsbedingungen', 'Systemstandard'),
    ('legal.imprint', '""'::JSONB, 'Impressum', 'Systemstandard'),
    ('release.notes', '""'::JSONB, 'Versionshinweise', 'Systemstandard')
ON CONFLICT (setting_key) DO NOTHING;

INSERT INTO application_versions (
    version, release_status, released_at, changelog, database_migrations, rollout_percent
) VALUES (
    '0.41.0', 'production', CURRENT_TIMESTAMP,
    'Ausgangsversion vor Einführung der Plattformverwaltung.',
    '["001-038"]'::JSONB, 100
)
ON CONFLICT (version) DO NOTHING;

-- RLS ist für jede Plattformtabelle explizit aktiviert. Firmenkonten erhalten
-- nur veröffentlichte Mitteilungen, niemals Verwaltungs- oder Technikdaten.
DO $$
DECLARE target_table REGCLASS;
BEGIN
    FOREACH target_table IN ARRAY ARRAY[
        'company_registration_requests'::REGCLASS, 'support_tickets'::REGCLASS,
        'support_ticket_events'::REGCLASS, 'support_ticket_attachments'::REGCLASS,
        'support_access_sessions'::REGCLASS, 'support_access_events'::REGCLASS,
        'system_health_components'::REGCLASS, 'background_process_runs'::REGCLASS,
        'platform_error_groups'::REGCLASS, 'platform_error_occurrences'::REGCLASS,
        'application_versions'::REGCLASS, 'platform_announcements'::REGCLASS,
        'platform_announcement_reads'::REGCLASS, 'platform_backup_runs'::REGCLASS,
        'platform_restore_requests'::REGCLASS, 'privacy_requests'::REGCLASS,
        'platform_settings'::REGCLASS, 'platform_setting_history'::REGCLASS
    ] LOOP
        EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', target_table);
        EXECUTE format('DROP POLICY IF EXISTS platform_role_access ON %s', target_table);
        EXECUTE format(
            'CREATE POLICY platform_role_access ON %s USING (CURRENT_USER = %L) WITH CHECK (CURRENT_USER = %L)',
            target_table, 'schaefchen_platform_api', 'schaefchen_platform_api'
        );
        EXECUTE format('ALTER TABLE %s NO FORCE ROW LEVEL SECURITY', target_table);
    END LOOP;
END;
$$;

DROP POLICY IF EXISTS announcements_tenant_read ON platform_announcements;
CREATE POLICY announcements_tenant_read ON platform_announcements
    FOR SELECT USING (
        CURRENT_USER = 'schaefchen_api'
        AND status = 'published'
        AND COALESCE(publish_at, created_at) <= CURRENT_TIMESTAMP
        AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
        AND (
            targets ->> 'scope' = 'all'
            OR targets -> 'companyIds' ? CURRENT_SETTING('app.current_company_id', TRUE)
        )
    );
DROP POLICY IF EXISTS announcement_reads_tenant_access ON platform_announcement_reads;
CREATE POLICY announcement_reads_tenant_access ON platform_announcement_reads
    USING (
        CURRENT_USER = 'schaefchen_api'
        AND company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID
        AND user_id = NULLIF(CURRENT_SETTING('app.current_user_id', TRUE), '')::UUID
    )
    WITH CHECK (
        CURRENT_USER = 'schaefchen_api'
        AND company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID
        AND user_id = NULLIF(CURRENT_SETTING('app.current_user_id', TRUE), '')::UUID
    );

GRANT SELECT, INSERT, UPDATE ON company_registration_requests, support_tickets,
    support_access_sessions, system_health_components, platform_error_groups,
    application_versions, platform_announcements, platform_backup_runs,
    platform_restore_requests, privacy_requests, platform_settings
    TO schaefchen_platform_api;
GRANT SELECT, INSERT ON support_ticket_events, support_ticket_attachments,
    support_access_events, background_process_runs, platform_error_occurrences,
    platform_announcement_reads, platform_setting_history
    TO schaefchen_platform_api;
GRANT USAGE, SELECT ON SEQUENCE support_ticket_number_seq TO schaefchen_platform_api;
GRANT SELECT ON platform_announcements TO schaefchen_api;
GRANT SELECT, INSERT ON platform_announcement_reads TO schaefchen_api;

COMMENT ON TABLE support_access_sessions IS
    'Zeitlich begrenzter, begründeter Supportzugriff ohne Firmenmitgliedschaft; aktive Zugriffe sind stets sichtbar und beendbar.';
COMMENT ON TABLE platform_error_groups IS
    'Nach Fingerprint gruppierte, datensparsam sanitierte Fehlerübersicht.';
COMMENT ON TABLE platform_restore_requests IS
    'Zweistufig bestätigte Wiederherstellung; Vorbereitung allein führt nie eine Wiederherstellung aus.';
COMMENT ON TABLE privacy_requests IS
    'Mehrstufige Exporte, Lösch- und Anonymisierungsprozesse mit Aufbewahrungsprüfung und Wiederherstellungsfrist.';

COMMIT;
