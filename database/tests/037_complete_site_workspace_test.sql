\echo 'Teste Migration 037_complete_site_workspace.sql ...'

BEGIN;

DO $$
DECLARE
    target_company_id UUID;
    target_customer_id UUID;
    target_location_id UUID;
    target_project_id UUID;
    target_site_id UUID;
    author_id UUID;
    reviewer_id UUID;
    target_report_id UUID;
    target_document_id UUID;
BEGIN
    SELECT id
    INTO target_company_id
    FROM companies
    WHERE company_number = 'F-000001';

    INSERT INTO customers (company_id, customer_type, company_name)
    VALUES (target_company_id, 'company', 'Arbeitsbereich-Testkunde GmbH')
    RETURNING id INTO target_customer_id;

    INSERT INTO customer_locations (
        company_id,
        customer_id,
        name,
        street,
        house_number,
        postal_code,
        city
    ) VALUES (
        target_company_id,
        target_customer_id,
        'Arbeitsbereich-Testort',
        'Prüfstraße',
        '37',
        '12345',
        'Teststadt'
    )
    RETURNING id INTO target_location_id;

    INSERT INTO projects (company_id, customer_id, name)
    VALUES (target_company_id, target_customer_id, 'Arbeitsbereich-Testprojekt')
    RETURNING id INTO target_project_id;

    INSERT INTO construction_sites (
        company_id,
        project_id,
        customer_location_id,
        name
    ) VALUES (
        target_company_id,
        target_project_id,
        target_location_id,
        'Arbeitsbereich-Testbaustelle'
    )
    RETURNING id INTO target_site_id;

    IF NOT EXISTS (
        SELECT 1
        FROM construction_sites
        WHERE id = target_site_id
          AND qr_code IS NOT NULL
          AND CHAR_LENGTH(qr_code) >= 32
    ) THEN
        RAISE EXCEPTION 'Stabiler QR-Schlüssel wurde nicht automatisch angelegt';
    END IF;

    INSERT INTO users (
        company_id,
        personnel_number,
        first_name,
        last_name
    ) VALUES (
        target_company_id,
        'WS-AUTOR-37',
        'Anton',
        'Autor'
    )
    RETURNING id INTO author_id;

    INSERT INTO users (
        company_id,
        personnel_number,
        first_name,
        last_name
    ) VALUES (
        target_company_id,
        'WS-PRUEFER-37',
        'Rita',
        'Prüferin'
    )
    RETURNING id INTO reviewer_id;

    INSERT INTO documents (
        company_id,
        document_number,
        title,
        category,
        original_file_name,
        mime_type,
        size_bytes,
        sha256_hex,
        uploaded_by_user_id
    ) VALUES (
        target_company_id,
        NULL,
        'Offline-Schaltplan',
        'plan',
        'offline-schaltplan.pdf',
        'application/pdf',
        12,
        encode(digest('%PDF-1.4 37', 'sha256'), 'hex'),
        reviewer_id
    )
    RETURNING id INTO target_document_id;

    UPDATE documents
    SET mobile_visible = FALSE,
        offline_priority = FALSE
    WHERE company_id = target_company_id
      AND id = target_document_id;

    IF NOT EXISTS (
        SELECT 1
        FROM documents
        WHERE id = target_document_id
          AND mobile_visible = FALSE
          AND offline_priority = FALSE
          AND row_version = 2
    ) THEN
        RAISE EXCEPTION 'Mobile Dokumentfreigabe wurde nicht versionsgeschützt gespeichert';
    END IF;

    UPDATE documents
    SET mobile_visible = TRUE,
        offline_priority = TRUE
    WHERE company_id = target_company_id
      AND id = target_document_id;

    BEGIN
        UPDATE documents
        SET mobile_visible = FALSE,
            offline_priority = TRUE
        WHERE company_id = target_company_id
          AND id = target_document_id;
        RAISE EXCEPTION 'Offline-Dokument konnte ohne mobile Freigabe gespeichert werden';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;

    INSERT INTO site_reports (
        company_id,
        construction_site_id,
        report_number,
        report_type,
        work_date,
        source_mode,
        summary,
        details,
        structured_data,
        status,
        author_user_id
    ) VALUES (
        target_company_id,
        target_site_id,
        NULL,
        'daily',
        DATE '2026-07-29',
        'digital',
        'Arbeitsbereich prüfen',
        'Erster Inhalt',
        jsonb_build_object(
            'workPerformed', 'Erster Inhalt',
            'obstructions', NULL,
            'openItems', NULL,
            'personnel', '[]'::JSONB
        ),
        'submitted',
        author_id
    )
    RETURNING id INTO target_report_id;

    UPDATE site_reports
    SET status = 'returned',
        returned_by_user_id = reviewer_id,
        returned_at = CURRENT_TIMESTAMP,
        return_comment = 'Bitte die ausgeführten Leistungen genauer beschreiben.',
        return_count = return_count + 1
    WHERE company_id = target_company_id
      AND id = target_report_id
      AND row_version = 1;

    UPDATE site_reports
    SET status = 'submitted',
        summary = 'Arbeitsbereich vollständig geprüft',
        details = 'Ergänzter und nachvollziehbarer Inhalt',
        structured_data = jsonb_build_object(
            'workPerformed', 'Ergänzter und nachvollziehbarer Inhalt',
            'obstructions', NULL,
            'openItems', NULL,
            'personnel', '[]'::JSONB
        )
    WHERE company_id = target_company_id
      AND id = target_report_id
      AND row_version = 2;

    IF (
        SELECT COUNT(*)
        FROM site_report_events
        WHERE company_id = target_company_id
          AND site_report_id = target_report_id
    ) <> 3 OR NOT EXISTS (
        SELECT 1
        FROM site_report_events
        WHERE company_id = target_company_id
          AND site_report_id = target_report_id
          AND event_type = 'returned'
          AND comment = 'Bitte die ausgeführten Leistungen genauer beschreiben.'
    ) OR NOT EXISTS (
        SELECT 1
        FROM site_report_events
        WHERE company_id = target_company_id
          AND site_report_id = target_report_id
          AND event_type = 'resubmitted'
    ) THEN
        RAISE EXCEPTION 'Rückgabe und erneute Einreichung wurden nicht vollständig historisiert';
    END IF;

    BEGIN
        UPDATE site_report_events
        SET comment = 'Manipuliert'
        WHERE company_id = target_company_id
          AND site_report_id = target_report_id
          AND event_type = 'returned';
        RAISE EXCEPTION 'Berichtshistorie konnte verändert werden';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM = 'Berichtshistorie konnte verändert werden' THEN
                RAISE;
            END IF;
    END;
END;
$$;

SELECT id AS tenant_id
FROM companies
WHERE company_number = 'F-000001'
\gset

SET LOCAL ROLE schaefchen_api;
SELECT set_config('app.current_company_id', :'tenant_id', TRUE);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM site_report_events) THEN
        RAISE EXCEPTION 'API-Rolle sieht die eigene Berichtshistorie nicht';
    END IF;

    PERFORM set_config('app.current_company_id', gen_random_uuid()::TEXT, TRUE);
    IF EXISTS (SELECT 1 FROM site_report_events) THEN
        RAISE EXCEPTION 'API-Rolle sieht die Berichtshistorie eines anderen Mandanten';
    END IF;
END;
$$;

RESET ROLE;
ROLLBACK;

\echo 'Migration 037_complete_site_workspace.sql erfolgreich getestet.'
