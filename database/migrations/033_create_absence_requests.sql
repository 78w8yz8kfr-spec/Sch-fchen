BEGIN;

CREATE TABLE IF NOT EXISTS absence_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    user_id UUID NOT NULL,
    absence_type VARCHAR(30) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    day_part VARCHAR(20) NOT NULL DEFAULT 'full_day',
    note TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'office_review',
    requested_by_user_id UUID NOT NULL,
    office_reviewed_by_user_id UUID,
    office_reviewed_at TIMESTAMPTZ,
    office_comment TEXT,
    management_reviewed_by_user_id UUID,
    management_reviewed_at TIMESTAMPTZ,
    management_comment TEXT,
    cancelled_by_user_id UUID,
    cancelled_at TIMESTAMPTZ,
    cancellation_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    row_version BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT absence_requests_company_fkey
        FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE RESTRICT,
    CONSTRAINT absence_requests_user_fkey
        FOREIGN KEY (company_id, user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT absence_requests_requester_fkey
        FOREIGN KEY (company_id, requested_by_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT absence_requests_office_reviewer_fkey
        FOREIGN KEY (company_id, office_reviewed_by_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT absence_requests_management_reviewer_fkey
        FOREIGN KEY (company_id, management_reviewed_by_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT absence_requests_canceller_fkey
        FOREIGN KEY (company_id, cancelled_by_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT absence_requests_company_id_id_key UNIQUE (company_id, id),
    CONSTRAINT absence_requests_type_check CHECK (
        absence_type IN (
            'vacation',
            'unpaid_vacation',
            'time_off',
            'leave',
            'special_leave',
            'sick',
            'training',
            'vocational_school',
            'other'
        )
    ),
    CONSTRAINT absence_requests_date_check CHECK (
        start_date <= end_date
        AND end_date <= start_date + 366
    ),
    CONSTRAINT absence_requests_day_part_check CHECK (
        day_part IN ('full_day', 'first_half', 'second_half')
        AND (day_part = 'full_day' OR start_date = end_date)
    ),
    CONSTRAINT absence_requests_note_check CHECK (
        note IS NULL OR (BTRIM(note) <> '' AND CHAR_LENGTH(note) <= 500)
    ),
    CONSTRAINT absence_requests_status_check CHECK (
        status IN (
            'office_review',
            'management_review',
            'approved',
            'office_rejected',
            'management_rejected',
            'cancelled'
        )
    ),
    CONSTRAINT absence_requests_comment_check CHECK (
        (office_comment IS NULL OR (BTRIM(office_comment) <> '' AND CHAR_LENGTH(office_comment) <= 500))
        AND
        (management_comment IS NULL OR (BTRIM(management_comment) <> '' AND CHAR_LENGTH(management_comment) <= 500))
        AND
        (cancellation_reason IS NULL OR (
            BTRIM(cancellation_reason) <> '' AND CHAR_LENGTH(cancellation_reason) <= 500
        ))
    ),
    CONSTRAINT absence_requests_two_person_check CHECK (
        management_reviewed_by_user_id IS NULL
        OR office_reviewed_by_user_id IS NULL
        OR management_reviewed_by_user_id <> office_reviewed_by_user_id
    ),
    CONSTRAINT absence_requests_review_shape_check CHECK (
        (
            status = 'office_review'
            AND office_reviewed_by_user_id IS NULL
            AND office_reviewed_at IS NULL
            AND management_reviewed_by_user_id IS NULL
            AND management_reviewed_at IS NULL
            AND cancelled_by_user_id IS NULL
            AND cancelled_at IS NULL
        )
        OR
        (
            status = 'management_review'
            AND office_reviewed_by_user_id IS NOT NULL
            AND office_reviewed_at IS NOT NULL
            AND management_reviewed_by_user_id IS NULL
            AND management_reviewed_at IS NULL
            AND cancelled_by_user_id IS NULL
            AND cancelled_at IS NULL
        )
        OR
        (
            status = 'approved'
            AND office_reviewed_by_user_id IS NOT NULL
            AND office_reviewed_at IS NOT NULL
            AND management_reviewed_by_user_id IS NOT NULL
            AND management_reviewed_at IS NOT NULL
            AND cancelled_by_user_id IS NULL
            AND cancelled_at IS NULL
        )
        OR
        (
            status = 'office_rejected'
            AND office_reviewed_by_user_id IS NOT NULL
            AND office_reviewed_at IS NOT NULL
            AND office_comment IS NOT NULL
            AND management_reviewed_by_user_id IS NULL
            AND management_reviewed_at IS NULL
            AND cancelled_by_user_id IS NULL
            AND cancelled_at IS NULL
        )
        OR
        (
            status = 'management_rejected'
            AND office_reviewed_by_user_id IS NOT NULL
            AND office_reviewed_at IS NOT NULL
            AND management_reviewed_by_user_id IS NOT NULL
            AND management_reviewed_at IS NOT NULL
            AND management_comment IS NOT NULL
            AND cancelled_by_user_id IS NULL
            AND cancelled_at IS NULL
        )
        OR
        (
            status = 'cancelled'
            AND cancelled_by_user_id IS NOT NULL
            AND cancelled_at IS NOT NULL
            AND cancellation_reason IS NOT NULL
        )
    )
);

CREATE INDEX IF NOT EXISTS absence_requests_user_period_idx
    ON absence_requests (company_id, user_id, start_date, end_date);

CREATE INDEX IF NOT EXISTS absence_requests_open_review_idx
    ON absence_requests (company_id, status, created_at)
    WHERE status IN ('office_review', 'management_review');

CREATE INDEX IF NOT EXISTS absence_requests_approved_period_idx
    ON absence_requests (company_id, start_date, end_date)
    WHERE status = 'approved';

CREATE TABLE IF NOT EXISTS absence_request_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    absence_request_id UUID NOT NULL,
    action VARCHAR(30) NOT NULL,
    status VARCHAR(30) NOT NULL,
    actor_user_id UUID NOT NULL,
    comment TEXT,
    request_row_version BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT absence_request_events_request_fkey
        FOREIGN KEY (company_id, absence_request_id)
        REFERENCES absence_requests (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT absence_request_events_actor_fkey
        FOREIGN KEY (company_id, actor_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT absence_request_events_company_id_id_key UNIQUE (company_id, id),
    CONSTRAINT absence_request_events_action_check CHECK (
        action IN (
            'submitted',
            'office_approved',
            'office_rejected',
            'management_approved',
            'management_rejected',
            'cancelled'
        )
    ),
    CONSTRAINT absence_request_events_status_check CHECK (
        status IN (
            'office_review',
            'management_review',
            'approved',
            'office_rejected',
            'management_rejected',
            'cancelled'
        )
    ),
    CONSTRAINT absence_request_events_comment_check CHECK (
        comment IS NULL OR (BTRIM(comment) <> '' AND CHAR_LENGTH(comment) <= 500)
    ),
    CONSTRAINT absence_request_events_version_check CHECK (request_row_version >= 1)
);

CREATE INDEX IF NOT EXISTS absence_request_events_history_idx
    ON absence_request_events (
        company_id,
        absence_request_id,
        request_row_version,
        created_at
    );

CREATE OR REPLACE FUNCTION absence_requests_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.absence_type := LOWER(BTRIM(NEW.absence_type));
    NEW.day_part := LOWER(BTRIM(NEW.day_part));
    NEW.status := LOWER(BTRIM(NEW.status));
    NEW.note := NULLIF(BTRIM(NEW.note), '');
    NEW.office_comment := NULLIF(BTRIM(NEW.office_comment), '');
    NEW.management_comment := NULLIF(BTRIM(NEW.management_comment), '');
    NEW.cancellation_reason := NULLIF(BTRIM(NEW.cancellation_reason), '');

    IF TG_OP = 'INSERT' THEN
        NEW.status := 'office_review';
        NEW.office_reviewed_by_user_id := NULL;
        NEW.office_reviewed_at := NULL;
        NEW.office_comment := NULL;
        NEW.management_reviewed_by_user_id := NULL;
        NEW.management_reviewed_at := NULL;
        NEW.management_comment := NULL;
        NEW.cancelled_by_user_id := NULL;
        NEW.cancelled_at := NULL;
        NEW.cancellation_reason := NULL;
        NEW.created_at := COALESCE(NEW.created_at, CURRENT_TIMESTAMP);
        NEW.updated_at := NEW.created_at;
        NEW.row_version := 1;
        RETURN NEW;
    END IF;

    IF NEW.company_id <> OLD.company_id
        OR NEW.user_id <> OLD.user_id
        OR NEW.absence_type <> OLD.absence_type
        OR NEW.start_date <> OLD.start_date
        OR NEW.end_date <> OLD.end_date
        OR NEW.day_part <> OLD.day_part
        OR NEW.note IS DISTINCT FROM OLD.note
        OR NEW.requested_by_user_id <> OLD.requested_by_user_id
        OR NEW.created_at <> OLD.created_at THEN
        RAISE EXCEPTION 'Ein Abwesenheitsantrag ist inhaltlich unveränderlich; bitte neu beantragen.';
    END IF;

    IF NEW.status = OLD.status THEN
        RAISE EXCEPTION 'Der Status des Abwesenheitsantrags wurde nicht verändert.';
    END IF;

    IF NOT (
        (OLD.status = 'office_review' AND NEW.status IN ('management_review', 'office_rejected', 'cancelled'))
        OR
        (OLD.status = 'management_review' AND NEW.status IN ('approved', 'management_rejected', 'cancelled'))
        OR
        (OLD.status = 'approved' AND NEW.status = 'cancelled')
    ) THEN
        RAISE EXCEPTION 'Dieser Statuswechsel des Abwesenheitsantrags ist nicht zulässig.';
    END IF;

    NEW.updated_at := CURRENT_TIMESTAMP;
    NEW.row_version := OLD.row_version + 1;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS absence_requests_before_write_trigger ON absence_requests;
CREATE TRIGGER absence_requests_before_write_trigger
    BEFORE INSERT OR UPDATE ON absence_requests
    FOR EACH ROW EXECUTE FUNCTION absence_requests_before_write();

CREATE OR REPLACE FUNCTION absence_requests_record_event()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    event_action VARCHAR(30);
    event_actor UUID;
    event_comment TEXT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        event_action := 'submitted';
        event_actor := NEW.requested_by_user_id;
        event_comment := NEW.note;
    ELSIF NEW.status = 'management_review' THEN
        event_action := 'office_approved';
        event_actor := NEW.office_reviewed_by_user_id;
        event_comment := NEW.office_comment;
    ELSIF NEW.status = 'office_rejected' THEN
        event_action := 'office_rejected';
        event_actor := NEW.office_reviewed_by_user_id;
        event_comment := NEW.office_comment;
    ELSIF NEW.status = 'approved' THEN
        event_action := 'management_approved';
        event_actor := NEW.management_reviewed_by_user_id;
        event_comment := NEW.management_comment;
    ELSIF NEW.status = 'management_rejected' THEN
        event_action := 'management_rejected';
        event_actor := NEW.management_reviewed_by_user_id;
        event_comment := NEW.management_comment;
    ELSE
        event_action := 'cancelled';
        event_actor := NEW.cancelled_by_user_id;
        event_comment := NEW.cancellation_reason;
    END IF;

    INSERT INTO absence_request_events (
        company_id,
        absence_request_id,
        action,
        status,
        actor_user_id,
        comment,
        request_row_version,
        created_at
    ) VALUES (
        NEW.company_id,
        NEW.id,
        event_action,
        NEW.status,
        event_actor,
        event_comment,
        NEW.row_version,
        NEW.updated_at
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS absence_requests_record_event_trigger ON absence_requests;
CREATE TRIGGER absence_requests_record_event_trigger
    AFTER INSERT OR UPDATE ON absence_requests
    FOR EACH ROW EXECUTE FUNCTION absence_requests_record_event();

CREATE OR REPLACE FUNCTION absence_requests_prevent_hard_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF CURRENT_SETTING('app.allow_hard_delete', TRUE) = 'on' THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'Abwesenheitsanträge dürfen nicht hart gelöscht werden.';
END;
$$;

DROP TRIGGER IF EXISTS absence_requests_prevent_hard_delete_trigger ON absence_requests;
CREATE TRIGGER absence_requests_prevent_hard_delete_trigger
    BEFORE DELETE ON absence_requests
    FOR EACH ROW EXECUTE FUNCTION absence_requests_prevent_hard_delete();

CREATE OR REPLACE FUNCTION absence_request_events_prevent_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' AND CURRENT_SETTING('app.allow_hard_delete', TRUE) = 'on' THEN
        RETURN OLD;
    END IF;
    RAISE EXCEPTION 'Die Abwesenheitshistorie ist unveränderlich.';
END;
$$;

DROP TRIGGER IF EXISTS absence_request_events_prevent_change_trigger ON absence_request_events;
CREATE TRIGGER absence_request_events_prevent_change_trigger
    BEFORE UPDATE OR DELETE ON absence_request_events
    FOR EACH ROW EXECUTE FUNCTION absence_request_events_prevent_change();

ALTER TABLE absence_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS absence_requests_tenant_isolation ON absence_requests;
CREATE POLICY absence_requests_tenant_isolation ON absence_requests
    USING (company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID)
    WITH CHECK (company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID);

ALTER TABLE absence_request_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS absence_request_events_tenant_isolation ON absence_request_events;
CREATE POLICY absence_request_events_tenant_isolation ON absence_request_events
    USING (company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID)
    WITH CHECK (company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID);

GRANT SELECT, INSERT, UPDATE ON absence_requests TO schaefchen_api;
GRANT SELECT, INSERT ON absence_request_events TO schaefchen_api;
ALTER TABLE absence_requests NO FORCE ROW LEVEL SECURITY;
ALTER TABLE absence_request_events NO FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE absence_requests IS
    'Zweistufig geprüfte Abwesenheiten: Büroprüfung vor verbindlicher Freigabe durch die Geschäftsführung.';
COMMENT ON TABLE absence_request_events IS
    'Unveränderliche Historie jeder Einreichung, Prüfung, Freigabe, Ablehnung und Stornierung.';

COMMIT;
