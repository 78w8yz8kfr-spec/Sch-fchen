\echo 'Teste Migration 056_create_apprentice_reports.sql ...'

-- Die Probedaten werden am Ende zurueckgerollt: Berichte fuehren einen
-- unveraenderlichen Verlauf und lassen sich nicht loeschen.
DO $$
DECLARE
    firma UUID;
    azubi UUID;
    ausbilder UUID;
    bericht UUID;
    montag DATE := DATE '2026-03-02';
    stand INTEGER;
BEGIN
    BEGIN
        SELECT id INTO firma FROM companies ORDER BY company_number LIMIT 1;
        IF firma IS NULL THEN
            RAISE EXCEPTION 'Ohne Firma laesst sich das Berichtsheft nicht pruefen';
        END IF;

        -- Seit Migration 058 ist der Auszubildende eine Rolle, kein
        -- Kennzeichen am Mitarbeiter. Fuer diese Abnahme zaehlt nur, dass es
        -- den Menschen gibt; die Rolle prueft die Abnahme zu 058.
        INSERT INTO users (company_id, personnel_number, first_name, last_name)
        VALUES (firma, 'ABNAHME-AZUBI', 'Anna', 'Auszubildende')
        RETURNING id INTO azubi;

        INSERT INTO users (company_id, personnel_number, first_name, last_name)
        VALUES (firma, 'ABNAHME-AUSBILDER', 'Adam', 'Ausbilder')
        RETURNING id INTO ausbilder;

        UPDATE users SET trainer_user_id = ausbilder WHERE id = azubi;

        -- Niemand bildet sich selbst aus.
        BEGIN
            UPDATE users SET trainer_user_id = azubi WHERE id = azubi;
            RAISE EXCEPTION 'Ein Azubi konnte sich selbst als Ausbilder eintragen';
        EXCEPTION WHEN check_violation THEN
            NULL;
        END;

        -- Eine Woche beginnt am Montag. Ein anderer Tag waere ein zweiter,
        -- stiller Wochenschnitt neben dem der Zeiterfassung.
        BEGIN
            INSERT INTO apprentice_reports (company_id, apprentice_user_id, week_start)
            VALUES (firma, azubi, DATE '2026-03-03');
            RAISE EXCEPTION 'Ein Bericht durfte mitten in der Woche beginnen';
        EXCEPTION WHEN check_violation THEN
            NULL;
        END;

        INSERT INTO apprentice_reports (
            company_id, apprentice_user_id, week_start, company_summary, worked_minutes
        ) VALUES (firma, azubi, montag, 'Unterverteilung verdrahtet', 2010)
        RETURNING id INTO bericht;

        -- Je Woche und Mensch nur ein Bericht.
        BEGIN
            INSERT INTO apprentice_reports (company_id, apprentice_user_id, week_start)
            VALUES (firma, azubi, montag);
            RAISE EXCEPTION 'Eine Woche konnte zweimal berichtet werden';
        EXCEPTION WHEN unique_violation THEN
            NULL;
        END;

        -- Einreichen ohne Unterschrift geht nicht.
        BEGIN
            UPDATE apprentice_reports SET status = 'submitted' WHERE id = bericht;
            RAISE EXCEPTION 'Ein Bericht wurde ohne Unterschrift eingereicht';
        EXCEPTION WHEN check_violation THEN
            NULL;
        END;

        UPDATE apprentice_reports
        SET status = 'submitted', apprentice_signature_name = 'Anna Auszubildende'
        WHERE id = bericht;

        -- Zurueckgeben nur mit Begruendung.
        BEGIN
            UPDATE apprentice_reports
            SET status = 'returned', reviewed_by_user_id = ausbilder, reviewed_at = CURRENT_TIMESTAMP
            WHERE id = bericht;
            RAISE EXCEPTION 'Ein Bericht wurde ohne Begruendung zurueckgegeben';
        EXCEPTION WHEN check_violation THEN
            NULL;
        END;

        UPDATE apprentice_reports
        SET status = 'returned', reviewed_by_user_id = ausbilder,
            reviewed_at = CURRENT_TIMESTAMP, return_comment = 'Bitte die Berufsschule ergaenzen'
        WHERE id = bericht;

        UPDATE apprentice_reports
        SET status = 'submitted', apprentice_signature_name = 'Anna Auszubildende',
            school_summary = 'Grundlagen der Messtechnik'
        WHERE id = bericht;

        UPDATE apprentice_reports
        SET status = 'approved', reviewed_by_user_id = ausbilder,
            reviewed_at = CURRENT_TIMESTAMP, trainer_signature_name = 'Adam Ausbilder'
        WHERE id = bericht;

        -- Ein freigegebener Nachweis ist unveraenderlich.
        BEGIN
            UPDATE apprentice_reports SET company_summary = 'Nachtraeglich umgeschrieben'
            WHERE id = bericht;
            RAISE EXCEPTION 'Ein freigegebener Nachweis liess sich aendern';
        EXCEPTION WHEN raise_exception THEN
            IF SQLERRM NOT LIKE '%unveränderlich%' THEN RAISE; END IF;
        END;

        -- Der Verlauf hat jeden Schritt festgehalten: Anlage, Einreichen,
        -- Rueckgabe, erneutes Einreichen und Freigabe.
        SELECT COUNT(*) INTO stand FROM apprentice_report_events WHERE report_id = bericht;
        IF stand <> 5 THEN
            RAISE EXCEPTION 'Der Verlauf hat % statt 5 Schritte', stand;
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM apprentice_report_events
            WHERE report_id = bericht AND status = 'returned'
              AND note = 'Bitte die Berufsschule ergaenzen'
        ) THEN
            RAISE EXCEPTION 'Die Begruendung der Rueckgabe fehlt im Verlauf';
        END IF;

        -- Der Verlauf laesst sich nicht umschreiben.
        BEGIN
            UPDATE apprentice_report_events SET status = 'approved' WHERE report_id = bericht;
            RAISE EXCEPTION 'Der Verlauf liess sich aendern';
        EXCEPTION WHEN raise_exception THEN
            IF SQLERRM NOT LIKE '%unveränderlich%' THEN RAISE; END IF;
        END;

        -- Und nicht loeschen.
        BEGIN
            DELETE FROM apprentice_reports WHERE id = bericht;
            RAISE EXCEPTION 'Ein Nachweis liess sich hart loeschen';
        EXCEPTION WHEN raise_exception THEN
            IF SQLERRM NOT LIKE '%nicht hart gelöscht%' THEN RAISE; END IF;
        END;

        RAISE EXCEPTION 'abnahme_zuruecknehmen';
    EXCEPTION
        WHEN raise_exception THEN
            IF SQLERRM <> 'abnahme_zuruecknehmen' THEN
                RAISE;
            END IF;
    END;
END;
$$;

-- Mandantentrennung und Rechte der Schnittstellenrolle.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'apprentice_reports' AND policyname = 'apprentice_reports_tenant_isolation'
    ) THEN
        RAISE EXCEPTION 'Den Wochenberichten fehlt die Mandantentrennung';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'apprentice_report_events'
          AND policyname = 'apprentice_report_events_tenant_isolation'
    ) THEN
        RAISE EXCEPTION 'Dem Verlauf fehlt die Mandantentrennung';
    END IF;
    IF has_table_privilege('schaefchen_api', 'apprentice_report_events', 'UPDATE')
       OR has_table_privilege('schaefchen_api', 'apprentice_report_events', 'DELETE') THEN
        RAISE EXCEPTION 'Die Schnittstellenrolle darf den Verlauf aendern';
    END IF;
    IF NOT has_table_privilege('schaefchen_api', 'apprentice_reports', 'INSERT') THEN
        RAISE EXCEPTION 'Die Schnittstellenrolle darf keine Berichte anlegen';
    END IF;
END;
$$;

\echo 'Migration 056_create_apprentice_reports.sql ist fachlich abgenommen.'
