BEGIN;

-- Eine Zeitkorrektur, die ohne Beteiligung des Büros sofort wirksam wird, trug
-- bisher den Mitarbeiter selbst als Prüfer ein. Das Protokoll behauptete damit
-- eine Freigabe, die es nie gegeben hat. Ab hier wird dieser Fall als eigener
-- Zustand geführt: wirksam, aber ausdrücklich ungeprüft und ohne Prüfer.
--
-- Bereits vorhandene Einträge bleiben unverändert. Zeitbuchungen sind
-- unveränderlich; eine nachträgliche Umschrift wäre selbst eine Verfälschung
-- der Historie.

ALTER TABLE time_entries
    ADD COLUMN IF NOT EXISTS applied_without_review BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE time_change_operations
    ADD COLUMN IF NOT EXISTS applied_without_review BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN time_entries.applied_without_review IS
    'Wahr, wenn die Korrektur ohne Prüfung durch das Büro wirksam wurde. Dann bleibt reviewed_by_user_id leer.';
COMMENT ON COLUMN time_change_operations.applied_without_review IS
    'Wahr, wenn der Zeitänderungsvorgang ohne Prüfung durch das Büro wirksam wurde.';

-- Die Formprüfung stammt aus Migration 032 und verlangte für jede wirksame
-- Korrektur einen Prüfer. Neu ist die ungeprüft wirksame Korrektur: ohne
-- Prüfer, mit Zeitpunkt der Wirksamkeit und ausdrücklich gekennzeichnet.
ALTER TABLE time_entries
    DROP CONSTRAINT IF EXISTS time_entries_correction_shape_check;

ALTER TABLE time_entries
    ADD CONSTRAINT time_entries_correction_shape_check CHECK (
        (
            correction_kind IS NULL
            AND original_entry_id IS NULL
            AND correction_status IS NULL
            AND correction_reason IS NULL
            AND reviewed_by_user_id IS NULL
            AND reviewed_at IS NULL
            AND NOT applied_without_review
        )
        OR
        (
            correction_kind IN ('replacement', 'invalidation')
            AND original_entry_id IS NOT NULL
            AND correction_status IS NOT NULL
            AND correction_reason IS NOT NULL
            AND BTRIM(correction_reason) <> ''
            AND (
                (
                    correction_status = 'pending'
                    AND reviewed_by_user_id IS NULL AND reviewed_at IS NULL
                    AND NOT applied_without_review
                )
                OR
                (
                    correction_status IN ('approved', 'rejected')
                    AND reviewed_by_user_id IS NOT NULL AND reviewed_at IS NOT NULL
                    AND NOT applied_without_review
                )
                OR
                (
                    correction_status = 'approved'
                    AND applied_without_review
                    AND reviewed_by_user_id IS NULL AND reviewed_at IS NOT NULL
                )
            )
        )
        OR
        (
            correction_kind = 'addition'
            AND original_entry_id IS NULL
            AND correction_status IS NOT NULL
            AND correction_reason IS NOT NULL
            AND BTRIM(correction_reason) <> ''
            AND (
                (
                    correction_status = 'pending'
                    AND reviewed_by_user_id IS NULL AND reviewed_at IS NULL
                    AND NOT applied_without_review
                )
                OR
                (
                    correction_status IN ('approved', 'rejected')
                    AND reviewed_by_user_id IS NOT NULL AND reviewed_at IS NOT NULL
                    AND NOT applied_without_review
                )
                OR
                (
                    correction_status = 'approved'
                    AND applied_without_review
                    AND reviewed_by_user_id IS NULL AND reviewed_at IS NOT NULL
                )
            )
        )
    );

-- Der Trigger stammt aus Migration 042 und bestand auf einem Prüfer, sobald
-- eine wartende Korrektur wirksam wurde. Ungeprüft wirksame Korrekturen sind
-- davon ausgenommen; jede echte Entscheidung braucht weiterhin einen Prüfer,
-- und der ungeprüfte Zustand lässt sich nachträglich nicht mehr abstreifen.
CREATE OR REPLACE FUNCTION time_entries_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    original_entry_type VARCHAR(30);
    work_day_status VARCHAR(20);
    previous_approval_setting TEXT;
BEGIN
    NEW.correction_reason := NULLIF(BTRIM(NEW.correction_reason), '');
    NEW.activity_note := NULLIF(BTRIM(NEW.activity_note), '');

    IF TG_OP = 'INSERT' THEN
        NEW.invalidated_at := NULL;
        IF NEW.original_entry_id IS NOT NULL THEN
            NEW.correction_kind := COALESCE(NEW.correction_kind, 'replacement');
        END IF;
    END IF;

    SELECT status INTO work_day_status
    FROM work_days
    WHERE company_id = NEW.company_id AND user_id = NEW.user_id AND id = NEW.work_day_id;

    IF work_day_status IS NULL THEN
        RAISE EXCEPTION 'Der Ziel-Arbeitstag wurde nicht gefunden.';
    END IF;

    IF work_day_status = 'locked' THEN
        IF TG_OP = 'INSERT' AND NEW.correction_kind IS NULL THEN
            RAISE EXCEPTION 'Für einen abgerechneten Arbeitstag sind nur kontrollierte Korrekturen möglich.';
        ELSIF TG_OP = 'UPDATE'
            AND OLD.correction_kind IS NULL
            AND CURRENT_SETTING('app.approving_time_correction', TRUE) IS DISTINCT FROM 'on' THEN
            RAISE EXCEPTION 'Für einen abgerechneten Arbeitstag sind nur kontrollierte Korrekturen möglich.';
        END IF;
    END IF;

    IF TG_OP = 'INSERT' AND NEW.original_entry_id IS NOT NULL THEN
        SELECT entry_type INTO original_entry_type
        FROM time_entries
        WHERE company_id = NEW.company_id AND user_id = NEW.user_id AND id = NEW.original_entry_id;

        IF original_entry_type IS NULL THEN
            RAISE EXCEPTION 'Der zu korrigierende Zeiteintrag wurde nicht gefunden.';
        END IF;
        IF NEW.entry_type <> original_entry_type THEN
            RAISE EXCEPTION 'Die Buchungsart einer Ersetzung muss dem Original entsprechen.';
        END IF;
    END IF;

    IF TG_OP = 'INSERT' AND NEW.correction_kind IS NOT NULL THEN
        IF NEW.correction_kind = 'addition' AND NEW.original_entry_id IS NOT NULL THEN
            RAISE EXCEPTION 'Eine ergänzte Buchung darf kein Original referenzieren.';
        END IF;
        IF NEW.correction_kind IN ('replacement', 'invalidation') AND NEW.original_entry_id IS NULL THEN
            RAISE EXCEPTION 'Diese Korrektur benötigt eine Originalbuchung.';
        END IF;
        NEW.correction_status := 'pending';
        NEW.reviewed_by_user_id := NULL;
        NEW.reviewed_at := NULL;
        NEW.applied_without_review := FALSE;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF NEW.company_id <> OLD.company_id
            OR NEW.user_id <> OLD.user_id
            OR NEW.work_day_id <> OLD.work_day_id
            OR NEW.construction_site_id IS DISTINCT FROM OLD.construction_site_id
            OR NEW.entry_type <> OLD.entry_type
            OR NEW.recorded_at <> OLD.recorded_at
            OR NEW.client_entry_id <> OLD.client_entry_id
            OR NEW.client_created_at <> OLD.client_created_at
            OR NEW.source <> OLD.source
            OR NEW.entered_by_user_id IS DISTINCT FROM OLD.entered_by_user_id
            OR NEW.original_entry_id IS DISTINCT FROM OLD.original_entry_id
            OR NEW.correction_kind IS DISTINCT FROM OLD.correction_kind
            OR NEW.correction_reason IS DISTINCT FROM OLD.correction_reason
            OR NEW.activity_note IS DISTINCT FROM OLD.activity_note
            OR NEW.travel_minutes_override IS DISTINCT FROM OLD.travel_minutes_override
            OR NEW.edit_operation_id IS DISTINCT FROM OLD.edit_operation_id
            OR NEW.created_at <> OLD.created_at THEN
            RAISE EXCEPTION 'Zeitbuchungen sind unveränderlich; bitte eine protokollierte Korrektur anlegen.';
        END IF;

        IF OLD.correction_kind IS NULL
            AND NEW.correction_status IS DISTINCT FROM OLD.correction_status THEN
            RAISE EXCEPTION 'Nur Korrektureinträge besitzen einen Prüfstatus.';
        END IF;
        IF NEW.invalidated_at IS DISTINCT FROM OLD.invalidated_at
            AND CURRENT_SETTING('app.approving_time_correction', TRUE) IS DISTINCT FROM 'on' THEN
            RAISE EXCEPTION 'Ein Original darf nur durch eine genehmigte Korrektur entwertet werden.';
        END IF;
        IF OLD.correction_status IN ('approved', 'rejected')
            AND NEW.correction_status IS DISTINCT FROM OLD.correction_status THEN
            RAISE EXCEPTION 'Eine entschiedene Korrektur kann nicht erneut bewertet werden.';
        END IF;
        IF OLD.applied_without_review AND NOT NEW.applied_without_review THEN
            RAISE EXCEPTION 'Eine ohne Prüfung wirksam gewordene Korrektur bleibt als solche erhalten.';
        END IF;
        IF NEW.applied_without_review AND NOT OLD.applied_without_review
            AND NEW.correction_status IS DISTINCT FROM 'approved' THEN
            RAISE EXCEPTION 'Ohne Prüfung wirksame Korrekturen gelten immer als genehmigt.';
        END IF;

        IF OLD.correction_status = 'pending'
            AND NEW.correction_status IN ('approved', 'rejected') THEN
            IF NEW.reviewed_by_user_id IS NULL AND NOT NEW.applied_without_review THEN
                RAISE EXCEPTION 'Eine Korrekturentscheidung benötigt einen Prüfer.';
            END IF;
            NEW.reviewed_at := COALESCE(NEW.reviewed_at, CURRENT_TIMESTAMP);

            IF NEW.correction_status = 'approved'
                AND NEW.correction_kind IN ('replacement', 'invalidation') THEN
                previous_approval_setting := CURRENT_SETTING('app.approving_time_correction', TRUE);
                PERFORM set_config('app.approving_time_correction', 'on', TRUE);
                UPDATE time_entries
                SET invalidated_at = CURRENT_TIMESTAMP
                WHERE company_id = NEW.company_id AND user_id = NEW.user_id
                  AND id = NEW.original_entry_id AND invalidated_at IS NULL;
                PERFORM set_config('app.approving_time_correction', COALESCE(previous_approval_setting, ''), TRUE);
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

COMMIT;
