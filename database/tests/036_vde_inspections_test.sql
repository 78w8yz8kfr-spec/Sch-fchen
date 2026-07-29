\echo 'Teste Migration 036_create_vde_inspections.sql ...'

BEGIN;

DO $$
DECLARE
    target_company_id UUID;
    target_site_id UUID;
    inspector_id UUID;
    target_inspection_id UUID;
    target_final_document_id UUID;
    current_version BIGINT;
BEGIN
    SELECT id
    INTO target_company_id
    FROM companies
    WHERE company_number = 'F-000001';

    SELECT id
    INTO target_site_id
    FROM construction_sites
    WHERE company_id = target_company_id
    ORDER BY created_at, id
    LIMIT 1;

    INSERT INTO users (
        company_id,
        personnel_number,
        first_name,
        last_name
    ) VALUES (
        target_company_id,
        'VDE-SQL-TEST',
        'Viola',
        'VDE-Prüferin'
    )
    RETURNING id INTO inspector_id;

    INSERT INTO vde_inspections (
        company_id,
        construction_site_id,
        client_inspection_id,
        inspection_number,
        inspection_name,
        inspection_date,
        protocol_data,
        inspector_user_id,
        created_by_user_id,
        updated_by_user_id
    ) VALUES (
        target_company_id,
        target_site_id,
        gen_random_uuid(),
        NULL,
        '  Erstprüfung Hauptverteilung  ',
        DATE '2026-07-29',
        '{
          "schemaVersion": 1,
          "networkType": "TN-S",
          "distributions": []
        }'::JSONB,
        inspector_id,
        inspector_id,
        inspector_id
    )
    RETURNING id, row_version
    INTO target_inspection_id, current_version;

    IF current_version <> 1 OR NOT EXISTS (
        SELECT 1
        FROM vde_inspections
        WHERE id = target_inspection_id
          AND inspection_name = 'Erstprüfung Hauptverteilung'
          AND inspection_number ~ (
              '^SE-VDE-'
              || EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER::TEXT
              || '-[0-9]{5}$'
          )
          AND status = 'draft'
    ) THEN
        RAISE EXCEPTION 'VDE-Entwurf wurde nicht korrekt angelegt';
    END IF;

    IF (
        SELECT COUNT(*)
        FROM vde_inspection_versions
        WHERE company_id = target_company_id
          AND inspection_id = target_inspection_id
          AND inspection_row_version = 1
    ) <> 1 THEN
        RAISE EXCEPTION 'Erste VDE-Version wurde nicht historisiert';
    END IF;

    UPDATE vde_inspections
    SET inspection_name = 'Erstprüfung Haupt- und Unterverteilung',
        protocol_data = '{
          "schemaVersion": 1,
          "networkType": "TN-S",
          "distributions": [{"clientId": "uv-1", "name": "UV EG"}]
        }'::JSONB,
        updated_by_user_id = inspector_id
    WHERE company_id = target_company_id
      AND id = target_inspection_id
      AND row_version = 1
    RETURNING row_version INTO current_version;

    IF current_version <> 2 OR (
        SELECT COUNT(*)
        FROM vde_inspection_versions
        WHERE company_id = target_company_id
          AND inspection_id = target_inspection_id
    ) <> 2 THEN
        RAISE EXCEPTION 'VDE-Änderung wurde nicht versioniert';
    END IF;

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
        'VDE-Abschlussprüfung',
        'inspection',
        'SE-VDE-2026-00001.pdf',
        'application/pdf',
        12,
        encode(digest('%PDF-1.4 VDE', 'sha256'), 'hex'),
        inspector_id
    )
    RETURNING id INTO target_final_document_id;

    INSERT INTO document_contents (
        company_id,
        document_id,
        content
    ) VALUES (
        target_company_id,
        target_final_document_id,
        convert_to('%PDF-1.4 VDE', 'UTF8')
    );

    INSERT INTO document_links (
        company_id,
        document_id,
        entity_type,
        construction_site_id,
        created_by_user_id
    ) VALUES (
        target_company_id,
        target_final_document_id,
        'construction_site',
        target_site_id,
        inspector_id
    );

    UPDATE vde_inspections
    SET status = 'completed',
        completed_by_user_id = inspector_id,
        final_document_id = target_final_document_id,
        inspector_signature_data = decode(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
            'base64'
        ),
        updated_by_user_id = inspector_id
    WHERE company_id = target_company_id
      AND id = target_inspection_id
      AND row_version = 2
    RETURNING row_version INTO current_version;

    IF current_version <> 3 OR NOT EXISTS (
        SELECT 1
        FROM vde_inspections
        WHERE id = target_inspection_id
          AND status = 'completed'
          AND completed_at IS NOT NULL
          AND final_document_id = target_final_document_id
    ) OR (
        SELECT COUNT(*)
        FROM vde_inspection_versions
        WHERE company_id = target_company_id
          AND inspection_id = target_inspection_id
    ) <> 3 THEN
        RAISE EXCEPTION 'VDE-Abschluss wurde nicht unveränderlich historisiert';
    END IF;

    BEGIN
        UPDATE vde_inspections
        SET inspection_name = 'Unzulässige Änderung',
            updated_by_user_id = inspector_id
        WHERE company_id = target_company_id
          AND id = target_inspection_id;
        RAISE EXCEPTION 'Abgeschlossene VDE-Prüfung konnte verändert werden';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM = 'Abgeschlossene VDE-Prüfung konnte verändert werden' THEN
                RAISE;
            END IF;
    END;

    BEGIN
        DELETE FROM vde_inspections
        WHERE company_id = target_company_id
          AND id = target_inspection_id;
        RAISE EXCEPTION 'VDE-Prüfung konnte hart gelöscht werden';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM = 'VDE-Prüfung konnte hart gelöscht werden' THEN
                RAISE;
            END IF;
    END;

    BEGIN
        UPDATE vde_inspection_versions
        SET inspection_name = 'Manipulierte Historie'
        WHERE company_id = target_company_id
          AND inspection_id = target_inspection_id
          AND inspection_row_version = 1;
        RAISE EXCEPTION 'VDE-Versionshistorie konnte verändert werden';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM = 'VDE-Versionshistorie konnte verändert werden' THEN
                RAISE;
            END IF;
    END;

    IF NOT EXISTS (
        SELECT 1
        FROM documents
        WHERE company_id = target_company_id
          AND id = target_final_document_id
          AND category = 'inspection'
    ) THEN
        RAISE EXCEPTION 'VDE-PDF ist nicht Teil der zentralen Dokumentablage';
    END IF;
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
    IF (SELECT COUNT(*) FROM vde_inspections) <> 1 THEN
        RAISE EXCEPTION 'API-Rolle sieht die eigene VDE-Prüfung nicht';
    END IF;
    IF (SELECT COUNT(*) FROM vde_inspection_versions) <> 3 THEN
        RAISE EXCEPTION 'API-Rolle sieht die eigene VDE-Versionshistorie nicht';
    END IF;

    PERFORM set_config('app.current_company_id', gen_random_uuid()::TEXT, TRUE);
    IF EXISTS (SELECT 1 FROM vde_inspections)
        OR EXISTS (SELECT 1 FROM vde_inspection_versions) THEN
        RAISE EXCEPTION
            'API-Rolle sieht VDE-Prüfungen eines anderen Mandanten';
    END IF;
END;
$$;

RESET ROLE;
ROLLBACK;

\echo 'Migration 036_create_vde_inspections.sql erfolgreich getestet.'
