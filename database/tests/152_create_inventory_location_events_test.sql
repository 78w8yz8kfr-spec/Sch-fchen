\echo 'Prüfe unveränderliche Lagerhistorie'
BEGIN;
DO $$
DECLARE c UUID; u UUID; l UUID;
BEGIN
    SELECT id INTO c FROM companies ORDER BY company_number LIMIT 1;
    INSERT INTO users(company_id,personnel_number,first_name,last_name)
    VALUES(c,'IE-' || substr(gen_random_uuid()::TEXT,1,12),'Lager','Historie') RETURNING id INTO u;
    PERFORM set_config('app.current_company_id',c::TEXT,TRUE);
    PERFORM set_config('app.current_user_id',u::TEXT,TRUE);
    INSERT INTO inventory_locations(company_id,kind,code,name,created_by_user_id)
    VALUES(c,'depot','E-' || upper(substr(gen_random_uuid()::TEXT,1,8)),'Lager Test',u) RETURNING id INTO l;
    UPDATE inventory_locations SET name='Neuer Name' WHERE id=l;
    IF (SELECT count(*) FROM inventory_location_events WHERE location_id=l) <> 2 THEN
        RAISE EXCEPTION 'Änderungshistorie fehlt';
    END IF;
    BEGIN
        UPDATE inventory_location_events SET after_data='{}' WHERE location_id=l;
        RAISE EXCEPTION 'Historie konnte umgeschrieben werden';
    EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
ROLLBACK;
