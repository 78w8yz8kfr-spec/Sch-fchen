BEGIN;

CREATE TABLE IF NOT EXISTS site_supervisors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    construction_site_id UUID NOT NULL,
    user_id UUID NOT NULL,
    valid_from DATE NOT NULL,
    valid_until DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'planned',
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    report_responsible BOOLEAN NOT NULL DEFAULT FALSE,
    handover_note TEXT,
    assigned_by_user_id UUID,
    changed_by_user_id UUID,
    last_change_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMPTZ,
    row_version BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT site_supervisors_company_id_fkey
        FOREIGN KEY (company_id)
        REFERENCES companies (id)
        ON DELETE RESTRICT,
    CONSTRAINT site_supervisors_site_fkey
        FOREIGN KEY (company_id, construction_site_id)
        REFERENCES construction_sites (company_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT site_supervisors_user_fkey
        FOREIGN KEY (company_id, user_id)
        REFERENCES users (company_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT site_supervisors_assigned_by_fkey
        FOREIGN KEY (company_id, assigned_by_user_id)
        REFERENCES users (company_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT site_supervisors_changed_by_fkey
        FOREIGN KEY (company_id, changed_by_user_id)
        REFERENCES users (company_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT site_supervisors_company_id_id_key UNIQUE (company_id, id),
    CONSTRAINT site_supervisors_status_check CHECK (
        status IN ('planned', 'active', 'ended', 'cancelled')
    ),
    CONSTRAINT site_supervisors_validity_check CHECK (
        valid_until IS NULL OR valid_until >= valid_from
    ),
    CONSTRAINT site_supervisors_active_end_check CHECK (
        (status IN ('planned', 'active') AND ended_at IS NULL)
        OR
        (status IN ('ended', 'cancelled') AND ended_at IS NOT NULL)
    ),
    CONSTRAINT site_supervisors_responsibility_check CHECK (
        NOT report_responsible OR status = 'active'
    ),
    CONSTRAINT site_supervisors_handover_note_not_blank CHECK (
        handover_note IS NULL OR BTRIM(handover_note) <> ''
    ),
    CONSTRAINT site_supervisors_change_reason_not_blank CHECK (
        last_change_reason IS NULL OR BTRIM(last_change_reason) <> ''
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS site_supervisors_active_primary_key
    ON site_supervisors (company_id, construction_site_id)
    WHERE status = 'active' AND is_primary;

CREATE UNIQUE INDEX IF NOT EXISTS site_supervisors_active_report_key
    ON site_supervisors (company_id, construction_site_id)
    WHERE status = 'active' AND report_responsible;

CREATE INDEX IF NOT EXISTS site_supervisors_site_period_idx
    ON site_supervisors (
        company_id,
        construction_site_id,
        valid_from,
        valid_until
    );

CREATE INDEX IF NOT EXISTS site_supervisors_user_active_idx
    ON site_supervisors (company_id, user_id, valid_from)
    WHERE status IN ('planned', 'active');

CREATE TABLE IF NOT EXISTS site_supervisor_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    site_supervisor_id UUID NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    changed_by_user_id UUID,
    change_reason TEXT,
    previous_values JSONB NOT NULL,
    CONSTRAINT site_supervisor_history_company_id_fkey
        FOREIGN KEY (company_id)
        REFERENCES companies (id)
        ON DELETE RESTRICT,
    CONSTRAINT site_supervisor_history_assignment_fkey
        FOREIGN KEY (company_id, site_supervisor_id)
        REFERENCES site_supervisors (company_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT site_supervisor_history_changed_by_fkey
        FOREIGN KEY (company_id, changed_by_user_id)
        REFERENCES users (company_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT site_supervisor_history_values_object_check
        CHECK (jsonb_typeof(previous_values) = 'object'),
    CONSTRAINT site_supervisor_history_reason_not_blank CHECK (
        change_reason IS NULL OR BTRIM(change_reason) <> ''
    )
);

CREATE INDEX IF NOT EXISTS site_supervisor_history_assignment_idx
    ON site_supervisor_history (company_id, site_supervisor_id, changed_at DESC);

CREATE OR REPLACE FUNCTION site_supervisors_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    previous_report_responsible BOOLEAN := FALSE;
BEGIN
    NEW.handover_note := NULLIF(BTRIM(NEW.handover_note), '');
    NEW.last_change_reason := NULLIF(BTRIM(NEW.last_change_reason), '');

    IF NOT EXISTS (
        SELECT 1
        FROM users
        WHERE company_id = NEW.company_id
          AND id = NEW.user_id
          AND is_foreman
          AND status = 'active'
    ) AND NEW.status IN ('planned', 'active') THEN
        RAISE EXCEPTION 'Nur aktive Vorarbeiter dürfen einer Baustelle zugewiesen werden.';
    END IF;

    IF NEW.status IN ('ended', 'cancelled') THEN
        NEW.ended_at := COALESCE(NEW.ended_at, CURRENT_TIMESTAMP);
        NEW.valid_until := COALESCE(NEW.valid_until, CURRENT_DATE);
        NEW.is_primary := FALSE;
        NEW.report_responsible := FALSE;
    ELSE
        NEW.ended_at := NULL;
    END IF;

    IF NEW.status <> 'active' AND NEW.report_responsible THEN
        RAISE EXCEPTION 'Die Berichtspflicht kann nur einem aktiven Vorarbeiter gehören.';
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF NEW.company_id <> OLD.company_id
            OR NEW.construction_site_id <> OLD.construction_site_id
            OR NEW.user_id <> OLD.user_id THEN
            RAISE EXCEPTION 'Firma, Baustelle und Vorarbeiter einer Zuweisung sind unveränderlich.';
        END IF;

        IF (
            NEW.valid_from IS DISTINCT FROM OLD.valid_from
            OR NEW.valid_until IS DISTINCT FROM OLD.valid_until
            OR NEW.status IS DISTINCT FROM OLD.status
            OR NEW.is_primary IS DISTINCT FROM OLD.is_primary
            OR NEW.report_responsible IS DISTINCT FROM OLD.report_responsible
        ) AND NEW.last_change_reason IS NULL THEN
            RAISE EXCEPTION 'Änderungen an der Vorarbeiterplanung benötigen eine Begründung.';
        END IF;

        NEW.updated_at := CURRENT_TIMESTAMP;
        NEW.row_version := OLD.row_version + 1;
    END IF;

    IF NEW.status = 'active' AND NEW.is_primary THEN
        SELECT COALESCE(BOOL_OR(report_responsible), FALSE)
        INTO previous_report_responsible
        FROM site_supervisors
        WHERE company_id = NEW.company_id
          AND construction_site_id = NEW.construction_site_id
          AND status = 'active'
          AND is_primary
          AND (TG_OP = 'INSERT' OR id <> NEW.id);

        UPDATE site_supervisors
        SET status = 'ended',
            valid_until = GREATEST(valid_from, NEW.valid_from),
            changed_by_user_id = NEW.changed_by_user_id,
            last_change_reason = 'Automatische Übergabe an neuen Hauptvorarbeiter'
        WHERE company_id = NEW.company_id
          AND construction_site_id = NEW.construction_site_id
          AND status = 'active'
          AND is_primary
          AND (TG_OP = 'INSERT' OR id <> NEW.id);

        IF previous_report_responsible THEN
            NEW.report_responsible := TRUE;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS site_supervisors_before_write_trigger ON site_supervisors;
CREATE TRIGGER site_supervisors_before_write_trigger
    BEFORE INSERT OR UPDATE ON site_supervisors
    FOR EACH ROW
    EXECUTE FUNCTION site_supervisors_before_write();

CREATE OR REPLACE FUNCTION site_supervisors_record_history()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO site_supervisor_history (
        company_id,
        site_supervisor_id,
        changed_by_user_id,
        change_reason,
        previous_values
    )
    VALUES (
        OLD.company_id,
        OLD.id,
        NEW.changed_by_user_id,
        NEW.last_change_reason,
        TO_JSONB(OLD) - 'company_id'
    );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS site_supervisors_record_history_trigger ON site_supervisors;
CREATE TRIGGER site_supervisors_record_history_trigger
    AFTER UPDATE ON site_supervisors
    FOR EACH ROW
    EXECUTE FUNCTION site_supervisors_record_history();

CREATE OR REPLACE FUNCTION site_supervisors_prevent_hard_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF CURRENT_SETTING('app.allow_hard_delete', TRUE) = 'on' THEN
        RETURN OLD;
    END IF;

    RAISE EXCEPTION 'Vorarbeiterzuweisungen und ihre Historie dürfen nicht hart gelöscht werden.';
END;
$$;

DROP TRIGGER IF EXISTS site_supervisors_prevent_hard_delete_trigger ON site_supervisors;
CREATE TRIGGER site_supervisors_prevent_hard_delete_trigger
    BEFORE DELETE ON site_supervisors
    FOR EACH ROW
    EXECUTE FUNCTION site_supervisors_prevent_hard_delete();

DROP TRIGGER IF EXISTS site_supervisor_history_prevent_hard_delete_trigger ON site_supervisor_history;
CREATE TRIGGER site_supervisor_history_prevent_hard_delete_trigger
    BEFORE DELETE ON site_supervisor_history
    FOR EACH ROW
    EXECUTE FUNCTION site_supervisors_prevent_hard_delete();

ALTER TABLE site_supervisors ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_supervisor_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS site_supervisors_tenant_isolation ON site_supervisors;
CREATE POLICY site_supervisors_tenant_isolation ON site_supervisors
    USING (company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID)
    WITH CHECK (company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID);

DROP POLICY IF EXISTS site_supervisor_history_tenant_isolation ON site_supervisor_history;
CREATE POLICY site_supervisor_history_tenant_isolation ON site_supervisor_history
    USING (company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID)
    WITH CHECK (company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID);

GRANT SELECT, INSERT, UPDATE ON site_supervisors TO schaefchen_api;
GRANT SELECT, INSERT ON site_supervisor_history TO schaefchen_api;
ALTER TABLE site_supervisors FORCE ROW LEVEL SECURITY;
ALTER TABLE site_supervisor_history FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE site_supervisors IS 'Zeitlich geplante Vorarbeiterzuweisungen mit automatischer Hauptverantwortungs-Übergabe.';
COMMENT ON COLUMN site_supervisors.is_primary IS 'Genau ein aktiver Hauptvorarbeiter pro Baustelle.';
COMMENT ON COLUMN site_supervisors.report_responsible IS 'Aktueller Verantwortlicher für den Baustellenbericht; bei Hauptwechsel automatisch übertragen.';
COMMENT ON TABLE site_supervisor_history IS 'Unveränderliche Vorher-Stände jeder Änderung an einer Vorarbeiterzuweisung.';

COMMIT;
