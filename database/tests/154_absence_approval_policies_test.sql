BEGIN;
DO $$
DECLARE c UUID; a UUID; b UUID;
BEGIN
  INSERT INTO companies(company_number,legal_name,display_name)
    VALUES('F-' || nextval('companies_number_seq'),'Freigabetest','Freigabetest') RETURNING id INTO c;
  INSERT INTO users(company_id,personnel_number,first_name,last_name) VALUES(c,'A','Admin','Test') RETURNING id INTO a;
  INSERT INTO users(company_id,personnel_number,first_name,last_name) VALUES(c,'B','Prüfer','Test') RETURNING id INTO b;
  INSERT INTO user_roles(company_id,user_id,role_id) SELECT c,a,id FROM roles WHERE company_id=c AND role_key='admin';
  PERFORM set_config('app.current_company_id',c::TEXT,TRUE);
  PERFORM set_config('app.current_user_id',a::TEXT,TRUE);
  INSERT INTO absence_approval_policies(company_id,row_version,reviewer_ids,approver_ids,actor_user_id,reason)
    VALUES(c,1,ARRAY[a],ARRAY[b],a,'Testauswahl');
  BEGIN
    UPDATE absence_approval_policies SET reason='Umschreiben' WHERE company_id=c;
    RAISE EXCEPTION 'Verlauf veränderbar';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO absence_approval_policies(company_id,row_version,reviewer_ids,approver_ids,actor_user_id,reason)
      VALUES(c,2,ARRAY[a],ARRAY[a],a,'Nur eine Person');
    RAISE EXCEPTION 'Nur eine Person akzeptiert';
  EXCEPTION WHEN check_violation THEN NULL; END;
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='absence_approval_policies'::regclass AND relrowsecurity AND relforcerowsecurity) THEN
    RAISE EXCEPTION 'RLS fehlt';
  END IF;
END $$;
ROLLBACK;
