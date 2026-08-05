\echo 'Teste Migration 060_apprentice_daily_entries.sql ...'

DO $$
DECLARE
    firma UUID;
    azubi UUID;
    ausbilder UUID;
    bericht UUID;
    montag DATE := DATE '2026-04-06';
BEGIN
    BEGIN
        SELECT id INTO firma FROM companies ORDER BY company_number LIMIT 1;

        INSERT INTO users (company_id, personnel_number, first_name, last_name,
                           apprenticeship_occupation, apprenticeship_started_on)
        VALUES (firma, 'ABNAHME-TAG-AZUBI', 'Tina', 'Tagwerk',
                'Elektronikerin für Energie- und Gebäudetechnik', DATE '2024-08-01')
        RETURNING id INTO azubi;

        INSERT INTO users (company_id, personnel_number, first_name, last_name)
        VALUES (firma, 'ABNAHME-TAG-AUSB', 'Adam', 'Ausbilder')
        RETURNING id INTO ausbilder;

        UPDATE users SET trainer_user_id = ausbilder WHERE id = azubi;

        INSERT INTO apprentice_reports (company_id, apprentice_user_id, week_start)
        VALUES (firma, azubi, montag)
        RETURNING id INTO bericht;

        -- Eine leere Woche ist kein Nachweis.
        BEGIN
            UPDATE apprentice_reports
            SET status = 'submitted', apprentice_signature_name = 'Tina Tagwerk'
            WHERE id = bericht;
            RAISE EXCEPTION 'Eine Woche ohne Tageszeile wurde eingereicht';
        EXCEPTION WHEN check_violation THEN
            NULL;
        END;

        -- Hoechstens sieben Tage: mehr hat eine Woche nicht.
        BEGIN
            UPDATE apprentice_reports
            SET daily_entries = (
                SELECT JSONB_AGG(JSONB_BUILD_OBJECT(
                    'workDate', TO_CHAR(montag + tag, 'YYYY-MM-DD'),
                    'activities', JSONB_BUILD_ARRAY('Zu viel'),
                    'workedMinutes', 0))
                FROM GENERATE_SERIES(0, 7) AS tag
            )
            WHERE id = bericht;
            RAISE EXCEPTION 'Eine Woche durfte acht Tage haben';
        EXCEPTION WHEN check_violation THEN
            NULL;
        END;

        UPDATE apprentice_reports
        SET daily_entries = JSONB_BUILD_ARRAY(
                JSONB_BUILD_OBJECT('workDate', TO_CHAR(montag, 'YYYY-MM-DD'),
                                   'activities', JSONB_BUILD_ARRAY('Steckdosen gesetzt', 'Leitungen verlegt'),
                                   'workedMinutes', 465),
                JSONB_BUILD_OBJECT('workDate', TO_CHAR(montag + 1, 'YYYY-MM-DD'),
                                   'activities', JSONB_BUILD_ARRAY('Berufsschule: Messtechnik'),
                                   'workedMinutes', 0)),
            week_remark = 'Ruhige Woche',
            status = 'submitted',
            apprentice_signature_name = 'Tina Tagwerk'
        WHERE id = bericht;

        IF (SELECT JSONB_ARRAY_LENGTH(daily_entries) FROM apprentice_reports WHERE id = bericht) <> 2 THEN
            RAISE EXCEPTION 'Die Tageszeilen wurden nicht gespeichert';
        END IF;

        IF (SELECT daily_entries -> 0 ->> 'workDate' FROM apprentice_reports WHERE id = bericht)
           <> TO_CHAR(montag, 'YYYY-MM-DD') THEN
            RAISE EXCEPTION 'Die erste Tageszeile steht nicht auf dem Montag';
        END IF;

        RAISE EXCEPTION 'abnahme_zuruecknehmen';
    EXCEPTION
        WHEN raise_exception THEN
            IF SQLERRM <> 'abnahme_zuruecknehmen' THEN RAISE; END IF;
    END;
END;
$$;

-- Der Wochentext ist fort; er waere eine zweite Wahrheit neben den Tageszeilen.
DO $$
BEGIN
    FOR i IN 1..1 LOOP
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'apprentice_reports'
              AND column_name IN ('company_summary', 'school_summary', 'absence_note')
        ) THEN
            RAISE EXCEPTION 'Neben den Tageszeilen steht noch ein Wochentext';
        END IF;
    END LOOP;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'apprentice_reports' AND column_name = 'week_remark'
    ) THEN
        RAISE EXCEPTION 'Die Bemerkungen zur Woche fehlen';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'apprenticeship_occupation'
    ) THEN
        RAISE EXCEPTION 'Der Ausbildungsberuf fehlt';
    END IF;
END;
$$;

\echo 'Migration 060_apprentice_daily_entries.sql ist fachlich abgenommen.'
