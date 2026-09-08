\echo 'Prüfe neue Lagerstruktur und Mandantenschutz'
BEGIN;
DO $$
DECLARE c UUID; u UUID; l UUID;
BEGIN
    SELECT id INTO c FROM companies ORDER BY company_number LIMIT 1;
    INSERT INTO users(company_id,personnel_number,first_name,last_name)
    VALUES(c,'IL-' || substr(gen_random_uuid()::TEXT,1,12),'Lager','Test') RETURNING id INTO u;
    PERFORM set_config('app.current_company_id',c::TEXT,TRUE);
    PERFORM set_config('app.current_user_id',u::TEXT,TRUE);
    INSERT INTO inventory_locations(company_id,kind,code,name,created_by_user_id)
    VALUES(c,'depot','T-' || upper(substr(gen_random_uuid()::TEXT,1,8)),'Lager Test',u) RETURNING id INTO l;
    BEGIN
        UPDATE inventory_locations SET parent_id=l WHERE id=l;
        RAISE EXCEPTION 'Zyklus wurde zugelassen';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN
        DELETE FROM inventory_locations WHERE id=l;
        RAISE EXCEPTION 'Hartes Löschen wurde zugelassen';
    EXCEPTION WHEN check_violation THEN NULL; END;
    IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='inventory_locations'::regclass) THEN
        RAISE EXCEPTION 'RLS fehlt';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM module_catalog WHERE module_key='inventory_structure' AND status='active') THEN
        RAISE EXCEPTION 'Modul fehlt';
    END IF;
END $$;
ROLLBACK;
