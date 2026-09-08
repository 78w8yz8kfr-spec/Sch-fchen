-- Ausschließlich CI: Daten vor dem zweiten Durchlauf ALLER Migrationen anlegen.
-- Der anschließende SQL-Test beweist, dass 141 und 151/152 nichts davon entfernen.
DO $$
DECLARE c UUID; u UUID;
BEGIN
    INSERT INTO companies(company_number,legal_name,display_name)
    VALUES('F-CIINV1','Lager-Neustarttest','Lager-Neustarttest') ON CONFLICT(company_number) DO NOTHING;
    SELECT id INTO c FROM companies WHERE company_number='F-CIINV1';
    INSERT INTO users(company_id,personnel_number,first_name,last_name)
    VALUES(c,'CI-INVENTORY','CI','Lager') ON CONFLICT(company_id,personnel_number) DO NOTHING;
    SELECT id INTO u FROM users WHERE company_id=c AND personnel_number='CI-INVENTORY';
    PERFORM set_config('app.current_company_id',c::TEXT,TRUE);
    PERFORM set_config('app.current_user_id',u::TEXT,TRUE);
    INSERT INTO inventory_locations(company_id,kind,code,name,created_by_user_id,row_version)
    VALUES(c,'depot','CI-RESTART','Dieser Lagerplatz muss jeden Neustart überstehen',u,17)
    ON CONFLICT(company_id,parent_id,code) DO NOTHING;
    INSERT INTO company_module_entitlements(company_id,module_id,entitlement_status,change_reason)
    SELECT c,id,'permanent','CI Neustarttest' FROM module_catalog WHERE module_key='inventory_structure'
    ON CONFLICT(company_id,module_id) DO NOTHING;
END $$;
