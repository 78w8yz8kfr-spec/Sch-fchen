\echo 'Teste Migration 017_create_documents.sql ...'

BEGIN;

DO $$
DECLARE
    company_a_id UUID;
    company_b_id UUID;
    user_a_id UUID;
    user_b_id UUID;
    customer_a_id UUID;
    customer_b_id UUID;
    project_a_id UUID;
    location_a_id UUID;
    site_a_id UUID;
    document_a_id UUID;
    document_b_id UUID;
    generated_number VARCHAR(24);
    version_before BIGINT;
    version_after BIGINT;
BEGIN
    SELECT id INTO company_a_id
    FROM companies
    WHERE company_number = 'F-000001';

    INSERT INTO companies (legal_name, display_name)
    VALUES ('Dokumententest Zweitfirma GmbH', 'Dokumententest Zweitfirma')
    RETURNING id INTO company_b_id;

    INSERT INTO users (company_id, personnel_number, first_name, last_name)
    VALUES (company_a_id, 'DOC-A', 'Dora', 'Dokument')
    RETURNING id INTO user_a_id;

    INSERT INTO users (company_id, personnel_number, first_name, last_name)
    VALUES (company_b_id, 'DOC-B', 'Fremde', 'Datei')
    RETURNING id INTO user_b_id;

    INSERT INTO customers (company_id, customer_number, customer_type, company_name)
    VALUES (company_a_id, NULL, 'company', 'Dokumentenkunde GmbH')
    RETURNING id INTO customer_a_id;

    INSERT INTO customers (company_id, customer_number, customer_type, company_name)
    VALUES (company_b_id, NULL, 'company', 'Fremder Dokumentenkunde GmbH')
    RETURNING id INTO customer_b_id;

    INSERT INTO projects (company_id, customer_id, project_number, name, status)
    VALUES (company_a_id, customer_a_id, NULL, 'Dokumentenprojekt', 'active')
    RETURNING id INTO project_a_id;

    INSERT INTO customer_locations (
        company_id, customer_id, location_number, name,
        street, house_number, postal_code, city
    )
    VALUES (
        company_a_id, customer_a_id, NULL, 'Dokumentenbaustelle',
        'Planstraße', '17', '12345', 'Teststadt'
    )
    RETURNING id INTO location_a_id;

    INSERT INTO construction_sites (
        company_id, project_id, customer_location_id, site_number, name, status
    )
    VALUES (
        company_a_id, project_a_id, location_a_id, NULL, 'Dokumentenbaustelle', 'active'
    )
    RETURNING id INTO site_a_id;

    INSERT INTO documents (
        company_id, document_number, title, category, original_file_name,
        mime_type, size_bytes, sha256_hex, uploaded_by_user_id
    )
    VALUES (
        company_a_id, NULL, '  Montageplan Erdgeschoss  ', 'PLAN', 'Montageplan.pdf',
        'APPLICATION/PDF', 8, repeat('a', 64), user_a_id
    )
    RETURNING id, document_number, row_version
    INTO document_a_id, generated_number, version_before;

    IF generated_number !~ '^SE-D-[0-9]{4}-[0-9]{5}$' THEN
        RAISE EXCEPTION 'Dokumentnummer wurde nicht korrekt erzeugt: %', generated_number;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM documents
        WHERE id = document_a_id
          AND title = 'Montageplan Erdgeschoss'
          AND category = 'plan'
          AND mime_type = 'application/pdf'
    ) THEN
        RAISE EXCEPTION 'Dokumentmetadaten wurden nicht normalisiert';
    END IF;

    INSERT INTO document_contents (company_id, document_id, content)
    VALUES (company_a_id, document_a_id, decode('255044462d312e34', 'hex'));

    INSERT INTO document_links (
        company_id, document_id, entity_type, customer_id, created_by_user_id
    ) VALUES (company_a_id, document_a_id, 'customer', customer_a_id, user_a_id);
    INSERT INTO document_links (
        company_id, document_id, entity_type, project_id, created_by_user_id
    ) VALUES (company_a_id, document_a_id, 'project', project_a_id, user_a_id);
    INSERT INTO document_links (
        company_id, document_id, entity_type, construction_site_id, created_by_user_id
    ) VALUES (company_a_id, document_a_id, 'construction_site', site_a_id, user_a_id);

    IF (SELECT COUNT(*) FROM document_links WHERE document_id = document_a_id) <> 3 THEN
        RAISE EXCEPTION 'Ein Dokument wurde nicht mit allen drei Ebenen verknüpft';
    END IF;
    IF (SELECT COUNT(*) FROM document_contents WHERE document_id = document_a_id) <> 1 THEN
        RAISE EXCEPTION 'Der Dateiinhalt wurde nicht genau einmal gespeichert';
    END IF;

    UPDATE documents SET status = 'archived' WHERE id = document_a_id
    RETURNING row_version INTO version_after;
    IF version_after <> version_before + 1 OR NOT EXISTS (
        SELECT 1 FROM documents
        WHERE id = document_a_id AND status = 'archived' AND archived_at IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'Dokumentarchivierung oder row_version ist ungültig';
    END IF;

    BEGIN
        INSERT INTO documents (
            company_id, document_number, title, category, original_file_name,
            mime_type, size_bytes, sha256_hex, uploaded_by_user_id
        )
        VALUES (
            company_a_id, NULL, 'Doppelte Datei', 'general', 'Kopie.pdf',
            'application/pdf', 8, repeat('a', 64), user_a_id
        );
        RAISE EXCEPTION USING ERRCODE = 'ZX171', MESSAGE = 'Doppelter Dateiinhalt wurde akzeptiert';
    EXCEPTION
        WHEN unique_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO document_links (
            company_id, document_id, entity_type, customer_id, created_by_user_id
        ) VALUES (company_a_id, document_a_id, 'customer', customer_b_id, user_a_id);
        RAISE EXCEPTION USING ERRCODE = 'ZX172', MESSAGE = 'Firmenfremde Verknüpfung wurde akzeptiert';
    EXCEPTION
        WHEN foreign_key_violation THEN NULL;
    END;

    BEGIN
        DELETE FROM documents WHERE id = document_a_id;
        RAISE EXCEPTION USING ERRCODE = 'ZX173', MESSAGE = 'Hartes Löschen wurde akzeptiert';
    EXCEPTION
        WHEN SQLSTATE 'P0001' THEN NULL;
    END;

    INSERT INTO documents (
        company_id, document_number, title, category, original_file_name,
        mime_type, size_bytes, sha256_hex, uploaded_by_user_id
    )
    VALUES (
        company_b_id, NULL, 'Fremdes Dokument', 'general', 'Fremd.txt',
        'text/plain', 4, repeat('b', 64), user_b_id
    )
    RETURNING id INTO document_b_id;
    INSERT INTO document_contents (company_id, document_id, content)
    VALUES (company_b_id, document_b_id, convert_to('Test', 'UTF8'));
END;
$$;

SELECT id AS tenant_a_id
FROM companies
WHERE company_number = 'F-000001'
\gset

SET LOCAL ROLE schaefchen_api;
SELECT set_config('app.current_company_id', :'tenant_a_id', TRUE);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM documents
        WHERE company_id <> NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID
    ) OR EXISTS (
        SELECT 1 FROM document_contents
        WHERE company_id <> NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID
    ) THEN
        RAISE EXCEPTION 'API-Rolle sieht firmenfremde Dokumente oder Inhalte';
    END IF;
END;
$$;

RESET ROLE;
ROLLBACK;

\echo 'Migration 017_create_documents.sql erfolgreich getestet.'
