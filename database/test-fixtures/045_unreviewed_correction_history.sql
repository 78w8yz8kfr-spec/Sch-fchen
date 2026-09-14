-- Bildet ausschliesslich im CI-Lauf eine Datenbank nach, die schon laenger im
-- Betrieb ist. Diese Datei ist keine Migration und wird nie auf Render
-- ausgefuehrt.
--
-- WAS HIER SCHIEFGING
--
-- Migration 032 setzt die Formpruefung fuer Zeitkorrekturen streng: jede
-- freigegebene Korrektur braucht einen Pruefer. Migration 045 hat das spaeter
-- bewusst gelockert - eine ohne Buero wirksame Korrektur gilt als freigegeben
-- und hat trotzdem keinen Pruefer (applied_without_review).
--
-- Weil beim Deploy alle Migrationen erneut eingespielt werden, schrieb 032 die
-- strenge Fassung zurueck und scheiterte an genau den Zeilen, die 045 erlaubt.
-- Auf einer frischen Datenbank lief das durch: dort hat nie jemand eine
-- Korrektur ohne Buero wirksam werden lassen. Im Betrieb haette schon eine
-- einzige solche Buchung gereicht, und jeder weitere Deploy waere abgebrochen
-- - so wie es bei Migration 141 schon einmal geschehen ist.
--
-- WARUM DER ALTE ZUSTAND WIEDERHERGESTELLT WIRD
--
-- Diese Datei legt genau eine solche Korrektur an. Im zweiten Durchgang trifft
-- Migration 032 damit die Lage, die im Betrieb herrscht. Schreibt jemals wieder
-- eine fruehe Migration eine spaeter gelockerte Regel zurueck, faellt es hier
-- auf und nicht erst dort.
--
-- Die Schreibtrigger werden dafuer kurz abgeschaltet: sie setzen eine frisch
-- eingefuegte Korrektur auf "pending" zurueck. Hier wird kein Ablauf geprueft,
-- sondern ein historischer Zustand nachgestellt, den die App ueber ihren
-- eigenen Weg laengst erzeugt hat.

DO $$
DECLARE
    firma UUID;
    monteur UUID;
    tag UUID;
    urbuchung UUID;
BEGIN
    SELECT id INTO firma FROM companies WHERE company_number = 'F-CI0045';
    IF firma IS NULL THEN
        INSERT INTO companies (company_number, legal_name, display_name)
        VALUES ('F-CI0045', 'Zeitkorrektur CI GmbH', 'Zeitkorrektur CI')
        RETURNING id INTO firma;
    END IF;

    SELECT id INTO monteur FROM users
    WHERE company_id = firma AND personnel_number = 'CI-045';
    IF monteur IS NULL THEN
        INSERT INTO users (company_id, personnel_number, first_name, last_name, password_hash, status)
        VALUES (firma, 'CI-045', 'Bestand', 'Monteur', 'nicht-anmeldbar', 'active')
        RETURNING id INTO monteur;
    END IF;

    SELECT id INTO tag FROM work_days
    WHERE company_id = firma AND user_id = monteur AND work_date = DATE '2026-01-15';
    IF tag IS NULL THEN
        INSERT INTO work_days (company_id, user_id, work_date, status)
        VALUES (firma, monteur, DATE '2026-01-15', 'open')
        RETURNING id INTO tag;
    END IF;

    -- Schon vorhanden? Dann nichts tun - die Vorbelegung bleibt wiederholbar.
    IF EXISTS (
        SELECT 1 FROM time_entries
        WHERE company_id = firma AND applied_without_review
    ) THEN
        RETURN;
    END IF;

    ALTER TABLE time_entries DISABLE TRIGGER time_entries_before_write_trigger;
    ALTER TABLE time_entries DISABLE TRIGGER time_entries_after_write_trigger;

    INSERT INTO time_entries (
        company_id, user_id, work_day_id, entry_type, recorded_at,
        client_entry_id, client_created_at, source, entered_by_user_id
    ) VALUES (
        firma, monteur, tag, 'clock_in', TIMESTAMPTZ '2026-01-15 07:00:00+01',
        gen_random_uuid(), TIMESTAMPTZ '2026-01-15 07:00:00+01', 'employee', monteur
    )
    RETURNING id INTO urbuchung;

    -- Die Korrektur, um die es geht: wirksam, ausdruecklich ungeprueft, ohne
    -- Pruefer - genau der Zustand, den Migration 045 erlaubt und 032 verbot.
    INSERT INTO time_entries (
        company_id, user_id, work_day_id, entry_type, recorded_at,
        client_entry_id, client_created_at, source, entered_by_user_id,
        correction_kind, original_entry_id, correction_status, correction_reason,
        reviewed_at, reviewed_by_user_id, applied_without_review
    ) VALUES (
        firma, monteur, tag, 'clock_in', TIMESTAMPTZ '2026-01-15 06:45:00+01',
        gen_random_uuid(), TIMESTAMPTZ '2026-01-15 08:00:00+01', 'employee', monteur,
        'replacement', urbuchung, 'approved', 'Arbeitsbeginn war frueher',
        TIMESTAMPTZ '2026-01-15 08:00:00+01', NULL, TRUE
    );

    ALTER TABLE time_entries ENABLE TRIGGER time_entries_before_write_trigger;
    ALTER TABLE time_entries ENABLE TRIGGER time_entries_after_write_trigger;
END;
$$;
