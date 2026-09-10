BEGIN;
DO $$
DECLARE c UUID; a UUID; b UUID; req UUID; saved absence_requests;
BEGIN
 INSERT INTO companies(company_number,legal_name,display_name) VALUES('F-' || nextval('companies_number_seq'),'Ein-Stufen-Test','Ein-Stufen-Test') RETURNING id INTO c;
 INSERT INTO users(company_id,personnel_number,first_name,last_name) VALUES(c,'A','Büro','Test') RETURNING id INTO a;
 INSERT INTO users(company_id,personnel_number,first_name,last_name) VALUES(c,'B','Mitarbeiter','Test') RETURNING id INTO b;
 INSERT INTO user_roles(company_id,user_id,role_id) SELECT c,a,id FROM roles WHERE company_id=c AND role_key='admin';
 PERFORM set_config('app.current_company_id',c::TEXT,TRUE); PERFORM set_config('app.current_user_id',a::TEXT,TRUE);
 INSERT INTO absence_approval_policies(company_id,row_version,reviewer_ids,approver_ids,actor_user_id,reason,approval_steps) VALUES(c,1,ARRAY[]::UUID[],ARRAY[a],a,'Eine Stufe',1);
 INSERT INTO absence_requests(company_id,user_id,absence_type,start_date,end_date,day_part,requested_by_user_id,note,entry_source)
 VALUES(c,b,'other','2027-12-01','2027-12-01','full_day',a,'Direkter Eintrag','office_direct') RETURNING * INTO saved;
 IF saved.status<>'approved' OR saved.approval_steps<>1 OR saved.office_reviewed_by_user_id IS NOT NULL OR saved.management_reviewed_by_user_id<>a THEN RAISE EXCEPTION 'Falsche direkte Freigabe'; END IF;
 IF NOT EXISTS(SELECT 1 FROM absence_request_events WHERE absence_request_id=saved.id AND action='office_recorded' AND actor_user_id=a) THEN RAISE EXCEPTION 'Direkte Historie fehlt'; END IF;
 PERFORM set_config('app.current_user_id',b::TEXT,TRUE);
 BEGIN
  INSERT INTO absence_requests(company_id,user_id,absence_type,start_date,end_date,day_part,requested_by_user_id,note,entry_source) VALUES(c,a,'other','2027-12-02','2027-12-02','full_day',b,'Unberechtigt','office_direct');
  RAISE EXCEPTION 'Unberechtigten Eintrag akzeptiert';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 INSERT INTO absence_requests(company_id,user_id,absence_type,start_date,end_date,day_part,requested_by_user_id,note) VALUES(c,b,'other','2027-12-03','2027-12-03','full_day',b,'Antrag') RETURNING id INTO req;
 UPDATE absence_requests SET status='approved',approval_steps=1,management_reviewed_by_user_id=a,management_reviewed_at=CURRENT_TIMESTAMP WHERE id=req;
 IF NOT EXISTS(SELECT 1 FROM absence_requests WHERE id=req AND status='approved' AND office_reviewed_by_user_id IS NULL) THEN RAISE EXCEPTION 'Einstufige Freigabe fehlt'; END IF;
END $$;
ROLLBACK;
