BEGIN;
CREATE TABLE IF NOT EXISTS absence_approval_policies (
  company_id UUID NOT NULL REFERENCES companies(id),
  row_version INTEGER NOT NULL CHECK(row_version>0),
  reviewer_ids UUID[], approver_ids UUID[],
  actor_user_id UUID NOT NULL,
  reason TEXT NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(company_id,row_version),
  FOREIGN KEY(company_id,actor_user_id) REFERENCES users(company_id,id),
  CHECK ((reviewer_ids IS NULL AND approver_ids IS NULL) OR
    (reviewer_ids IS NOT NULL AND approver_ids IS NOT NULL AND
     cardinality(reviewer_ids) BETWEEN 1 AND 100 AND cardinality(approver_ids) BETWEEN 1 AND 100))
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
    IF (SELECT count(DISTINCT id) FROM unnest(NEW.reviewer_ids || NEW.approver_ids) id) < 2
      OR EXISTS(SELECT 1 FROM unnest(NEW.reviewer_ids || NEW.approver_ids) chosen(id)
        WHERE NOT EXISTS(SELECT 1 FROM users u WHERE u.id=chosen.id AND u.company_id=NEW.company_id AND u.status='active')) THEN
      RAISE EXCEPTION 'Mindestens zwei verschiedene aktive Mitarbeiter derselben Firma auswählen' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS absence_approval_policies_guard_trigger ON absence_approval_policies;
CREATE TRIGGER absence_approval_policies_guard_trigger BEFORE INSERT OR UPDATE OR DELETE ON absence_approval_policies
FOR EACH ROW EXECUTE FUNCTION absence_approval_policies_guard();
ALTER TABLE absence_approval_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE absence_approval_policies FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS absence_approval_policies_tenant ON absence_approval_policies;
CREATE POLICY absence_approval_policies_tenant ON absence_approval_policies
USING(company_id=NULLIF(current_setting('app.current_company_id',TRUE),'')::UUID)
WITH CHECK(company_id=NULLIF(current_setting('app.current_company_id',TRUE),'')::UUID);
GRANT SELECT,INSERT ON absence_approval_policies TO schaefchen_api;
COMMIT;
