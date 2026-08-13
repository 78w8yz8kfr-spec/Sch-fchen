\echo 'Teste Migration 145_rcd_test_notifications.sql ...'

DO $$
DECLARE
    firma UUID;
    person UUID;
    geraet UUID;
    hinweis UUID;
BEGIN
    -- 1. Die neuen Arten sind erlaubt, die alten weiterhin auch. Geprueft mit
    --    echten Zeilen: eine Bedingung, die nur im Katalog steht, hat noch
    --    nichts durchgelassen und nichts abgewiesen.
    SELECT id INTO firma FROM companies ORDER BY created_at LIMIT 1;
    SELECT id INTO person FROM users WHERE company_id = firma LIMIT 1;
    SELECT id INTO geraet FROM devices WHERE company_id = firma LIMIT 1;
    IF firma IS NULL OR person IS NULL OR geraet IS NULL THEN
        RAISE NOTICE 'Keine Beispieldaten vorhanden - die Prüfung entfällt.';
        RETURN;
    END IF;

    INSERT INTO device_notifications (
        company_id, recipient_user_id, device_id, notification_type,
        title, message, source_key
    ) VALUES
        (firma, person, geraet, 'rcd_test_due', 'FI-Test heute fällig', 'Prüftaste drücken', 'test:rcd:due'),
        (firma, person, geraet, 'rcd_test_overdue', 'FI-Test überfällig', 'Prüftaste drücken', 'test:rcd:overdue'),
        (firma, person, geraet, 'inspection_due', 'Prüfung bald fällig', 'Termin', 'test:inspection:due')
    RETURNING id INTO hinweis;

    BEGIN
        INSERT INTO device_notifications (
            company_id, recipient_user_id, device_id, notification_type,
            title, message, source_key
        ) VALUES (firma, person, geraet, 'rcd_test_maybe', 'Erfunden', 'Erfunden', 'test:rcd:erfunden');
        RAISE EXCEPTION 'Eine erfundene Hinweisart wurde angenommen';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    -- 2. Derselbe Termin meldet sich nur einmal. Ohne diese Eindeutigkeit
    --    entstuende bei jedem Blick in die Glocke ein neuer Hinweis.
    BEGIN
        INSERT INTO device_notifications (
            company_id, recipient_user_id, device_id, notification_type,
            title, message, source_key
        ) VALUES (firma, person, geraet, 'rcd_test_due', 'Nochmal', 'Nochmal', 'test:rcd:due');
        RAISE EXCEPTION 'Derselbe Hinweis wurde ein zweites Mal angelegt';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;

    DELETE FROM device_notifications
    WHERE company_id = firma AND source_key LIKE 'test:%';
END;
$$;

\echo 'Migration 145_rcd_test_notifications.sql ist fachlich abgenommen.'
