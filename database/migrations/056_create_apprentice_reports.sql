-- Digitales Berichtsheft (Ausbildungsnachweis).
--
-- Ein Auszubildender muss seine Ausbildung schriftlich nachweisen; ohne
-- vollstaendiges Berichtsheft laesst die Kammer ihn nicht zur Pruefung zu.
-- Ueblich ist ein Bericht je Woche: was im Betrieb getan wurde, was die
-- Berufsschule behandelt hat, dazu Urlaub und Krankheit. Der Ausbilder gibt
-- den Bericht frei oder gibt ihn mit einer Bemerkung zurueck.
--
-- Grundsaetze dieser Migration:
--   * Ein Bericht gehoert immer genau einer Woche und einem Menschen. Der
--     Wochenbeginn ist deshalb ein Montag und je Person nur einmal vergeben.
--   * Ein freigegebener Bericht ist unveraenderlich. Er ist ein Nachweis; wer
--     ihn nachtraeglich aendern koennte, koennte die Ausbildung umschreiben.
--   * Jeder Schritt bleibt als Ereignis stehen, auch die Rueckgabe. Der
--     Verlauf laesst sich nicht loeschen und nicht ueberschreiben.
--   * Die Unterschrift ist eine festgehaltene Bestaetigung mit Namen und
--     Zeitpunkt, keine gemalte Unterschrift. Der Name wird mitgeschrieben:
--     er muss auch dann noch lesbar sein, wenn der Mensch die Firma laengst
--     verlassen hat.

BEGIN;

-- Wer ist Auszubildender, und wer bildet ihn aus?
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_apprentice BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS apprenticeship_started_on DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS apprenticeship_ends_on DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS trainer_user_id UUID;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_trainer_fkey;
ALTER TABLE users ADD CONSTRAINT users_trainer_fkey
    FOREIGN KEY (company_id, trainer_user_id)
    REFERENCES users (company_id, id) ON DELETE RESTRICT;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_apprenticeship_period_check;
ALTER TABLE users ADD CONSTRAINT users_apprenticeship_period_check
    CHECK (
        apprenticeship_ends_on IS NULL
        OR apprenticeship_started_on IS NULL
        OR apprenticeship_ends_on > apprenticeship_started_on
    );

-- Niemand bildet sich selbst aus.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_trainer_not_self_check;
ALTER TABLE users ADD CONSTRAINT users_trainer_not_self_check
    CHECK (trainer_user_id IS NULL OR trainer_user_id <> id);

COMMENT ON COLUMN users.is_apprentice IS 'Fuehrt ein Berichtsheft.';
COMMENT ON COLUMN users.trainer_user_id IS 'Ausbilder, darf die Wochenberichte freigeben.';

CREATE TABLE IF NOT EXISTS apprentice_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    apprentice_user_id UUID NOT NULL,
    week_start DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    company_summary TEXT NOT NULL DEFAULT '',
    school_summary TEXT,
    absence_note TEXT,
    -- Aus der Zeiterfassung uebernommen. Der Azubi soll die Stunden nicht
    -- abschreiben muessen, und die Kammer sieht dieselbe Zahl wie das Buero.
    worked_minutes INTEGER NOT NULL DEFAULT 0,
    submitted_at TIMESTAMPTZ,
    apprentice_signature_name VARCHAR(201),
    reviewed_by_user_id UUID,
    reviewed_at TIMESTAMPTZ,
    trainer_signature_name VARCHAR(201),
    return_comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    row_version BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT apprentice_reports_company_fkey
        FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE RESTRICT,
    CONSTRAINT apprentice_reports_apprentice_fkey
        FOREIGN KEY (company_id, apprentice_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT apprentice_reports_reviewer_fkey
        FOREIGN KEY (company_id, reviewed_by_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT apprentice_reports_company_id_id_key UNIQUE (company_id, id),
    CONSTRAINT apprentice_reports_week_key UNIQUE (company_id, apprentice_user_id, week_start),
    CONSTRAINT apprentice_reports_week_start_check CHECK (EXTRACT(ISODOW FROM week_start) = 1),
    CONSTRAINT apprentice_reports_status_check
        CHECK (status IN ('draft', 'submitted', 'approved', 'returned')),
    CONSTRAINT apprentice_reports_minutes_check
        CHECK (worked_minutes >= 0 AND worked_minutes <= 10080),
    -- Eingereicht wird nur mit Inhalt und Unterschrift.
    CONSTRAINT apprentice_reports_submitted_check CHECK (
        status = 'draft'
        OR (
            BTRIM(company_summary) <> ''
            AND submitted_at IS NOT NULL
            AND apprentice_signature_name IS NOT NULL
        )
    ),
    -- Freigegeben wird nur mit Pruefer, Zeitpunkt und Unterschrift.
    CONSTRAINT apprentice_reports_approved_check CHECK (
        status <> 'approved'
        OR (reviewed_by_user_id IS NOT NULL AND reviewed_at IS NOT NULL
            AND trainer_signature_name IS NOT NULL)
    ),
    -- Zurueckgegeben wird nur mit Begruendung. Ohne sie weiss der Azubi nicht,
    -- was er nachbessern soll.
    CONSTRAINT apprentice_reports_returned_check CHECK (
        status <> 'returned'
        OR (reviewed_by_user_id IS NOT NULL AND reviewed_at IS NOT NULL
            AND return_comment IS NOT NULL AND BTRIM(return_comment) <> '')
    )
);

CREATE INDEX IF NOT EXISTS apprentice_reports_person_week_idx
    ON apprentice_reports (company_id, apprentice_user_id, week_start DESC);

CREATE INDEX IF NOT EXISTS apprentice_reports_open_idx
    ON apprentice_reports (company_id, status, week_start)
    WHERE status = 'submitted';

CREATE TABLE IF NOT EXISTS apprentice_report_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    report_id UUID NOT NULL,
    status VARCHAR(20) NOT NULL,
    report_row_version BIGINT NOT NULL,
    changed_by_user_id UUID,
    note TEXT,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT apprentice_report_events_report_fkey
        FOREIGN KEY (company_id, report_id)
        REFERENCES apprentice_reports (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT apprentice_report_events_changer_fkey
        FOREIGN KEY (company_id, changed_by_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT apprentice_report_events_version_check CHECK (report_row_version >= 1)
);

CREATE INDEX IF NOT EXISTS apprentice_report_events_history_idx
    ON apprentice_report_events (company_id, report_id, report_row_version DESC);

CREATE OR REPLACE FUNCTION apprentice_reports_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.status := LOWER(BTRIM(NEW.status));
    NEW.company_summary := BTRIM(COALESCE(NEW.company_summary, ''));
    NEW.school_summary := NULLIF(BTRIM(NEW.school_summary), '');
    NEW.absence_note := NULLIF(BTRIM(NEW.absence_note), '');
    NEW.return_comment := NULLIF(BTRIM(NEW.return_comment), '');

    IF NEW.status = 'draft' THEN
        NEW.submitted_at := NULL;
        NEW.apprentice_signature_name := NULL;
    ELSE
        NEW.submitted_at := COALESCE(NEW.submitted_at, CURRENT_TIMESTAMP);
    END IF;

    IF NEW.status NOT IN ('approved', 'returned') THEN
        NEW.reviewed_by_user_id := NULL;
        NEW.reviewed_at := NULL;
        NEW.trainer_signature_name := NULL;
    END IF;

    IF NEW.status <> 'returned' THEN
        NEW.return_comment := NULL;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF NEW.company_id <> OLD.company_id
           OR NEW.apprentice_user_id <> OLD.apprentice_user_id
           OR NEW.week_start <> OLD.week_start THEN
            RAISE EXCEPTION 'Mandant, Auszubildender und Woche eines Berichts sind unveränderlich.';
        END IF;
        IF OLD.status = 'approved' THEN
            RAISE EXCEPTION 'Ein freigegebener Ausbildungsnachweis ist unveränderlich.';
        END IF;
        NEW.updated_at := CURRENT_TIMESTAMP;
        NEW.row_version := OLD.row_version + 1;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS apprentice_reports_before_write_trigger ON apprentice_reports;
CREATE TRIGGER apprentice_reports_before_write_trigger
    BEFORE INSERT OR UPDATE ON apprentice_reports
    FOR EACH ROW EXECUTE FUNCTION apprentice_reports_before_write();

-- Jeder Schritt bleibt stehen. Der Verlauf entsteht ohne Zutun der
-- Schnittstelle: er darf nicht davon abhaengen, dass jemand daran denkt.
CREATE OR REPLACE FUNCTION apprentice_reports_after_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.status = OLD.status THEN
        RETURN NEW;
    END IF;
    INSERT INTO apprentice_report_events (
        company_id, report_id, status, report_row_version, changed_by_user_id, note
    ) VALUES (
        NEW.company_id, NEW.id, NEW.status, NEW.row_version,
        CASE WHEN NEW.status IN ('approved', 'returned')
             THEN NEW.reviewed_by_user_id ELSE NEW.apprentice_user_id END,
        NEW.return_comment
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS apprentice_reports_after_write_trigger ON apprentice_reports;
CREATE TRIGGER apprentice_reports_after_write_trigger
    AFTER INSERT OR UPDATE ON apprentice_reports
    FOR EACH ROW EXECUTE FUNCTION apprentice_reports_after_write();

CREATE OR REPLACE FUNCTION apprentice_reports_prevent_hard_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF CURRENT_SETTING('app.allow_hard_delete', TRUE) = 'on' THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'Ausbildungsnachweise dürfen nicht hart gelöscht werden.';
END;
$$;

DROP TRIGGER IF EXISTS apprentice_reports_prevent_hard_delete_trigger ON apprentice_reports;
CREATE TRIGGER apprentice_reports_prevent_hard_delete_trigger
    BEFORE DELETE ON apprentice_reports
    FOR EACH ROW EXECUTE FUNCTION apprentice_reports_prevent_hard_delete();

CREATE OR REPLACE FUNCTION apprentice_report_events_prevent_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Der Verlauf eines Ausbildungsnachweises ist unveränderlich.';
END;
$$;

DROP TRIGGER IF EXISTS apprentice_report_events_prevent_change_trigger ON apprentice_report_events;
CREATE TRIGGER apprentice_report_events_prevent_change_trigger
    BEFORE UPDATE OR DELETE ON apprentice_report_events
    FOR EACH ROW EXECUTE FUNCTION apprentice_report_events_prevent_change();

ALTER TABLE apprentice_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS apprentice_reports_tenant_isolation ON apprentice_reports;
CREATE POLICY apprentice_reports_tenant_isolation ON apprentice_reports
    USING (company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID)
    WITH CHECK (company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID);
ALTER TABLE apprentice_reports NO FORCE ROW LEVEL SECURITY;

ALTER TABLE apprentice_report_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS apprentice_report_events_tenant_isolation ON apprentice_report_events;
CREATE POLICY apprentice_report_events_tenant_isolation ON apprentice_report_events
    USING (company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID)
    WITH CHECK (company_id = NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID);
ALTER TABLE apprentice_report_events NO FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON apprentice_reports TO schaefchen_api;
GRANT SELECT, INSERT ON apprentice_report_events TO schaefchen_api;

COMMENT ON TABLE apprentice_reports IS 'Wochenberichte des Berichtshefts je Auszubildendem.';
COMMENT ON TABLE apprentice_report_events IS 'Unveränderlicher Verlauf der Wochenberichte.';

COMMIT;
