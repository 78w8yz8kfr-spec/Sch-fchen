BEGIN;
ALTER TABLE absence_approval_policies ADD COLUMN IF NOT EXISTS approval_steps SMALLINT NOT NULL DEFAULT 2 CHECK(approval_steps IN (1,2));
ALTER TABLE absence_approval_policies DROP CONSTRAINT IF EXISTS absence_approval_policies_check;
ALTER TABLE absence_approval_policies ADD CONSTRAINT absence_approval_policies_check CHECK (
  (reviewer_ids IS NULL AND approver_ids IS NULL) OR
  (reviewer_ids IS NOT NULL AND approver_ids IS NOT NULL AND cardinality(approver_ids) BETWEEN 1 AND 100
   AND ((approval_steps=1 AND cardinality(reviewer_ids)=0) OR (approval_steps=2 AND cardinality(reviewer_ids) BETWEEN 1 AND 100)))
);
CREATE OR REPLACE FUNCTION absence_approval_policies_guard() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE previous_version INTEGER;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Zuständigkeitsverlauf bleibt unverändert' USING ERRCODE='23514';
  END IF;
  IF NEW.actor_user_id IS DISTINCT FROM NULLIF(current_setting('app.current_user_id',TRUE),'')::UUID
    OR NEW.company_id IS DISTINCT FROM NULLIF(current_setting('app.current_company_id',TRUE),'')::UUID
    OR NOT EXISTS(SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id AND r.company_id=ur.company_id
      JOIN users u ON u.id=ur.user_id AND u.company_id=ur.company_id
      WHERE ur.company_id=NEW.company_id AND ur.user_id=NEW.actor_user_id AND ur.revoked_at IS NULL
      AND r.status='active' AND u.status='active' AND r.role_key IN ('admin','managing_director')) THEN
    RAISE EXCEPTION 'Nur Firmenadministration oder Geschäftsführung darf Zuständigkeiten ändern' USING ERRCODE='42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('absence-policy:' || NEW.company_id::TEXT,0));
  SELECT COALESCE(max(row_version),0) INTO previous_version FROM absence_approval_policies WHERE company_id=NEW.company_id;
  IF NEW.row_version <> previous_version+1 THEN
    RAISE EXCEPTION 'Veraltete Zuständigkeitsfassung' USING ERRCODE='23514';
  END IF;
  IF NEW.reviewer_ids IS NOT NULL THEN
    IF (NEW.approval_steps = 2 AND (SELECT count(DISTINCT id) FROM unnest(NEW.reviewer_ids || NEW.approver_ids) id) < 2)
      OR EXISTS(SELECT 1 FROM unnest(NEW.reviewer_ids || NEW.approver_ids) chosen(id)
        WHERE NOT EXISTS(SELECT 1 FROM users u WHERE u.id=chosen.id AND u.company_id=NEW.company_id AND u.status='active')) THEN
      RAISE EXCEPTION 'Mindestens zwei verschiedene aktive Mitarbeiter derselben Firma auswählen' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;

ALTER TABLE absence_requests ADD COLUMN IF NOT EXISTS approval_steps SMALLINT NOT NULL DEFAULT 2 CHECK(approval_steps IN (1,2));
ALTER TABLE absence_requests ADD COLUMN IF NOT EXISTS entry_source TEXT NOT NULL DEFAULT 'request' CHECK(entry_source IN ('request','office_direct'));
ALTER TABLE absence_requests DROP CONSTRAINT IF EXISTS absence_requests_review_shape_check;
ALTER TABLE absence_requests ADD CONSTRAINT absence_requests_review_shape_check CHECK (
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
            AND (approval_steps=1 OR (office_reviewed_by_user_id IS NOT NULL AND office_reviewed_at IS NOT NULL))
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
            AND (approval_steps=1 OR (office_reviewed_by_user_id IS NOT NULL AND office_reviewed_at IS NOT NULL))
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
    );
ALTER TABLE absence_requests DROP CONSTRAINT IF EXISTS absence_requests_two_person_check;
ALTER TABLE absence_requests ADD CONSTRAINT absence_requests_two_person_check CHECK (
 approval_steps=1 OR management_reviewed_by_user_id IS NULL OR office_reviewed_by_user_id IS NULL OR management_reviewed_by_user_id<>office_reviewed_by_user_id
);
ALTER TABLE absence_request_events DROP CONSTRAINT IF EXISTS absence_request_events_action_check;
ALTER TABLE absence_request_events ADD CONSTRAINT absence_request_events_action_check CHECK(action IN (
 'submitted','office_recorded','office_approved','office_rejected','management_approved','management_rejected','cancelled'));
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
        IF NEW.entry_source = 'office_direct' THEN
            IF NEW.company_id IS DISTINCT FROM NULLIF(current_setting('app.current_company_id',TRUE),'')::UUID
                OR NEW.requested_by_user_id IS DISTINCT FROM NULLIF(current_setting('app.current_user_id',TRUE),'')::UUID
                OR NEW.user_id = NEW.requested_by_user_id
                OR NOT EXISTS(SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id AND r.company_id=ur.company_id
                  JOIN users u ON u.id=ur.user_id AND u.company_id=ur.company_id
                  WHERE ur.company_id=NEW.company_id AND ur.user_id=NEW.requested_by_user_id AND ur.revoked_at IS NULL
                  AND r.status='active' AND u.status='active' AND r.role_key IN ('admin','managing_director','dispatch_office','office','planner','executive_assistant')) THEN
                RAISE EXCEPTION 'Direkte Abwesenheit nur durch berechtigtes Büro für andere Mitarbeiter' USING ERRCODE='42501';
            END IF;
            NEW.status := 'approved';
            NEW.approval_steps := 1;
            NEW.office_reviewed_by_user_id := NULL; NEW.office_reviewed_at := NULL; NEW.office_comment := NULL;
            NEW.management_reviewed_by_user_id := NEW.requested_by_user_id;
            NEW.management_reviewed_at := CURRENT_TIMESTAMP;
            NEW.management_comment := NEW.note;
            NEW.cancelled_by_user_id := NULL; NEW.cancelled_at := NULL; NEW.cancellation_reason := NULL;
            NEW.created_at := CURRENT_TIMESTAMP; NEW.updated_at := NEW.created_at; NEW.row_version := 1;
            RETURN NEW;
        END IF;
        NEW.approval_steps := 2;
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

    IF NEW.entry_source <> OLD.entry_source
        OR NEW.company_id <> OLD.company_id
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
        (OLD.status = 'office_review' AND NEW.approval_steps = 1 AND NEW.status IN ('approved','management_rejected'))
        OR
        (OLD.status = 'office_review' AND NEW.status IN ('management_review', 'office_rejected', 'cancelled'))
        OR
        (OLD.status = 'management_review' AND NEW.status IN ('approved', 'management_rejected', 'cancelled'))
        OR
        (OLD.status = 'approved' AND NEW.status = 'cancelled')
    ) THEN
        RAISE EXCEPTION 'Dieser Statuswechsel des Abwesenheitsantrags ist nicht zulässig.';
    END IF;

    IF NEW.approval_steps IS DISTINCT FROM OLD.approval_steps AND NOT (
      OLD.status IN ('office_review','management_review') AND NEW.status IN ('approved','management_rejected')) THEN
      RAISE EXCEPTION 'Freigabeverfahren bereits festgeschrieben';
    END IF;
    NEW.updated_at := CURRENT_TIMESTAMP;
    NEW.row_version := OLD.row_version + 1;
    RETURN NEW;
END;
$$;

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
        event_action := CASE WHEN NEW.entry_source='office_direct' THEN 'office_recorded' ELSE 'submitted' END;
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

COMMIT;
