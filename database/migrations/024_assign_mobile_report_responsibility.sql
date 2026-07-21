BEGIN;

ALTER TABLE site_assignments
    ADD COLUMN IF NOT EXISTS report_responsible BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS site_assignments_report_responsible_day_key
    ON site_assignments (company_id, construction_site_id, work_date)
    WHERE status <> 'cancelled' AND report_responsible;

CREATE OR REPLACE FUNCTION site_assignments_validate_report_responsibility()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'UPDATE'
        AND NEW.report_responsible IS DISTINCT FROM OLD.report_responsible
        AND NULLIF(BTRIM(NEW.last_change_reason), '') IS NULL THEN
        RAISE EXCEPTION 'Änderungen an der Berichtsverantwortung benötigen eine Begründung.';
    END IF;

    IF TG_OP = 'UPDATE' AND EXISTS (
        SELECT 1 FROM site_reports
        WHERE company_id = OLD.company_id AND site_assignment_id = OLD.id
    ) AND (
        NEW.work_date IS DISTINCT FROM OLD.work_date
        OR NEW.status IS DISTINCT FROM OLD.status
        OR NEW.report_responsible IS DISTINCT FROM OLD.report_responsible
    ) THEN
        RAISE EXCEPTION 'Ein Einsatz mit bereits erfasstem Baustellenbericht ist gesperrt.';
    END IF;

    IF NEW.report_responsible AND NEW.status <> 'cancelled' AND NOT EXISTS (
        SELECT 1
        FROM users
        WHERE company_id = NEW.company_id
          AND id = NEW.user_id
          AND status = 'active'
          AND is_foreman
    ) THEN
        RAISE EXCEPTION 'Nur aktive Vorarbeiter dürfen für den Tagesbericht verantwortlich sein.';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS site_assignments_validate_report_responsibility_trigger ON site_assignments;
CREATE TRIGGER site_assignments_validate_report_responsibility_trigger
    BEFORE INSERT OR UPDATE OF user_id, work_date, status, report_responsible ON site_assignments
    FOR EACH ROW
    EXECUTE FUNCTION site_assignments_validate_report_responsibility();

ALTER TABLE site_reports
    ADD COLUMN IF NOT EXISTS site_assignment_id UUID,
    ADD COLUMN IF NOT EXISTS client_report_id UUID;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'site_reports_assignment_fkey'
    ) THEN
        ALTER TABLE site_reports
            ADD CONSTRAINT site_reports_assignment_fkey
            FOREIGN KEY (company_id, site_assignment_id)
            REFERENCES site_assignments (company_id, id)
            ON DELETE RESTRICT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'site_reports_mobile_origin_check'
    ) THEN
        ALTER TABLE site_reports
            ADD CONSTRAINT site_reports_mobile_origin_check CHECK (
                (site_assignment_id IS NULL AND client_report_id IS NULL)
                OR (site_assignment_id IS NOT NULL AND client_report_id IS NOT NULL)
            );
    END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS site_reports_assignment_key
    ON site_reports (company_id, site_assignment_id)
    WHERE site_assignment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS site_reports_client_report_key
    ON site_reports (company_id, client_report_id)
    WHERE client_report_id IS NOT NULL;

CREATE OR REPLACE FUNCTION site_reports_validate_mobile_origin()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND (
        NEW.site_assignment_id IS DISTINCT FROM OLD.site_assignment_id
        OR NEW.client_report_id IS DISTINCT FROM OLD.client_report_id
    ) THEN
        RAISE EXCEPTION 'Einsatz und Offline-ID eines Berichts sind unveränderlich.';
    END IF;

    IF NEW.site_assignment_id IS NOT NULL AND NOT EXISTS (
        SELECT 1
        FROM site_assignments AS assignment
        WHERE assignment.company_id = NEW.company_id
          AND assignment.id = NEW.site_assignment_id
          AND assignment.user_id = NEW.author_user_id
          AND assignment.construction_site_id = NEW.construction_site_id
          AND assignment.work_date = NEW.work_date
          AND assignment.status IN ('released', 'completed')
          AND assignment.report_responsible
    ) THEN
        RAISE EXCEPTION 'Der mobile Bericht passt nicht zu einem berichtspflichtigen Vorarbeitereinsatz.';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS site_reports_validate_mobile_origin_trigger ON site_reports;
CREATE TRIGGER site_reports_validate_mobile_origin_trigger
    BEFORE INSERT OR UPDATE OF company_id, construction_site_id, work_date,
        author_user_id, site_assignment_id, client_report_id ON site_reports
    FOR EACH ROW
    EXECUTE FUNCTION site_reports_validate_mobile_origin();

COMMENT ON COLUMN site_assignments.report_responsible IS
    'Genau dieser Vorarbeitereinsatz muss beim Verlassen der Baustelle einen Tages- oder Montagebericht erfassen.';
COMMENT ON COLUMN site_reports.site_assignment_id IS
    'Verbindlicher Ursprung eines vom Vorarbeiter mobil erfassten Berichts; bei Büroberichten leer.';
COMMENT ON COLUMN site_reports.client_report_id IS
    'Vom Mobilgerät erzeugte Idempotenz-ID für offline erfasste Berichte.';

COMMIT;
