-- Berichtsheft: taeglich schreiben, woechentlich ausdrucken.
--
-- Ein Ausbildungsnachweis besteht aus Tageszeilen - Tag, Datum, was an diesem
-- Tag getan wurde, und die Arbeitszeit. Ausgedruckt wird daraus eine A4-Seite
-- je Woche. Der bisherige Wochentext hat das nicht abgebildet: er sagte nicht,
-- an welchem Tag was war, und genau das will die Kammer sehen.
--
-- Die Tageszeilen stehen als JSONB am Bericht und nicht in einer eigenen
-- Tabelle. Sie gehoeren immer genau zu einer Woche, werden immer zusammen
-- gelesen und zusammen geschrieben; eine eigene Tabelle brachte hier nur
-- Verbindungen ohne eigenen Nutzen. Dieselbe Entscheidung liegt schon bei den
-- VDE-Pruefdaten und den Rollenrechten zugrunde.
--
-- Was wegfaellt:
--   company_summary  Der Wochentext geht in die Tageszeilen auf.
--   school_summary   Berufsschule ist ein Tag wie jeder andere und steht in
--                    der Zeile dieses Tages.
--   absence_note     Urlaub und Krankheit stehen ebenfalls in der Tageszeile;
--                    der Server traegt sie aus den genehmigten Abwesenheiten
--                    ein. Ein Feld daneben waere eine zweite Wahrheit.
-- Neu dazu:
--   week_remark      "Bemerkungen zur Woche" der Vorlage.

BEGIN;

ALTER TABLE apprentice_reports
    ADD COLUMN IF NOT EXISTS daily_entries JSONB NOT NULL DEFAULT '[]'::JSONB;
ALTER TABLE apprentice_reports
    ADD COLUMN IF NOT EXISTS week_remark TEXT;

-- Bestehende Woechentexte in die Tageszeile des Montags heben, damit kein
-- geschriebener Satz verloren geht.
--
-- Der Nachtrag laeuft nur, solange es die alte Spalte noch gibt: die
-- Migrationen laufen bei jedem Start des Dienstes erneut, und beim zweiten Mal
-- ist sie bereits entfernt.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'apprentice_reports' AND column_name = 'company_summary'
    ) THEN
        EXECUTE $sql$
            UPDATE apprentice_reports
            SET daily_entries = JSONB_BUILD_ARRAY(JSONB_BUILD_OBJECT(
                    'workDate', TO_CHAR(week_start, 'YYYY-MM-DD'),
                    'activities', JSONB_BUILD_ARRAY(company_summary),
                    'workedMinutes', worked_minutes
                ))
            WHERE daily_entries = '[]'::JSONB
              AND BTRIM(COALESCE(company_summary, '')) <> ''
        $sql$;
    END IF;
END;
$$;

ALTER TABLE apprentice_reports DROP CONSTRAINT IF EXISTS apprentice_reports_submitted_check;
ALTER TABLE apprentice_reports DROP COLUMN IF EXISTS company_summary;
ALTER TABLE apprentice_reports DROP COLUMN IF EXISTS school_summary;
ALTER TABLE apprentice_reports DROP COLUMN IF EXISTS absence_note;

ALTER TABLE apprentice_reports DROP CONSTRAINT IF EXISTS apprentice_reports_entries_shape_check;
ALTER TABLE apprentice_reports ADD CONSTRAINT apprentice_reports_entries_shape_check
    CHECK (JSONB_TYPEOF(daily_entries) = 'array' AND JSONB_ARRAY_LENGTH(daily_entries) <= 7);

-- Eingereicht wird nur, was an mindestens einem Tag etwas zu berichten hat.
-- Eine leere Woche ist kein Nachweis.
ALTER TABLE apprentice_reports ADD CONSTRAINT apprentice_reports_submitted_check CHECK (
    status = 'draft'
    OR (
        JSONB_ARRAY_LENGTH(daily_entries) > 0
        AND submitted_at IS NOT NULL
        AND apprentice_signature_name IS NOT NULL
    )
);

COMMENT ON COLUMN apprentice_reports.daily_entries IS
    'Tageszeilen: [{"workDate","activities":[…],"workedMinutes"}]. Eine Woche je Bericht.';
COMMENT ON COLUMN apprentice_reports.week_remark IS
    'Bemerkungen zur Woche, wie im gedruckten Nachweis.';

-- Der Ausbildungsberuf steht im Kopf des Ausdrucks. Er gehoert zum Menschen,
-- nicht zur Woche: er aendert sich waehrend der Ausbildung nicht.
ALTER TABLE users ADD COLUMN IF NOT EXISTS apprenticeship_occupation VARCHAR(150);

COMMENT ON COLUMN users.apprenticeship_occupation IS
    'Ausbildungsberuf, erscheint im Kopf des gedruckten Berichtshefts.';

-- Der Trigger aus Migration 056 raeumte die entfallenen Textfelder auf. Ohne
-- diese Neufassung liefe er ins Leere, sobald jemand einen Bericht schreibt.
CREATE OR REPLACE FUNCTION apprentice_reports_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.status := LOWER(BTRIM(NEW.status));
    NEW.week_remark := NULLIF(BTRIM(NEW.week_remark), '');
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

COMMIT;
