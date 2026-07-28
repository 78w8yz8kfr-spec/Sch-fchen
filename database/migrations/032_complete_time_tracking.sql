BEGIN;

ALTER TABLE construction_sites
    ADD COLUMN IF NOT EXISTS creation_source VARCHAR(20) NOT NULL DEFAULT 'office',
    ADD COLUMN IF NOT EXISTS field_created_by_user_id UUID,
    ADD COLUMN IF NOT EXISTS field_review_status VARCHAR(20) NOT NULL DEFAULT 'not_required',
    ADD COLUMN IF NOT EXISTS field_reviewed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS field_reviewed_by_user_id UUID;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'construction_sites_field_created_by_fkey'
          AND conrelid = 'construction_sites'::REGCLASS
    ) THEN
        ALTER TABLE construction_sites
            ADD CONSTRAINT construction_sites_field_created_by_fkey
            FOREIGN KEY (company_id, field_created_by_user_id)
            REFERENCES users (company_id, id)
            ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'construction_sites_field_reviewed_by_fkey'
          AND conrelid = 'construction_sites'::REGCLASS
    ) THEN
        ALTER TABLE construction_sites
            ADD CONSTRAINT construction_sites_field_reviewed_by_fkey
            FOREIGN KEY (company_id, field_reviewed_by_user_id)
            REFERENCES users (company_id, id)
            ON DELETE RESTRICT;
    END IF;
END;
$$;

ALTER TABLE construction_sites
    DROP CONSTRAINT IF EXISTS construction_sites_creation_source_check,
    DROP CONSTRAINT IF EXISTS construction_sites_field_review_status_check,
    DROP CONSTRAINT IF EXISTS construction_sites_field_creation_shape_check,
    DROP CONSTRAINT IF EXISTS construction_sites_field_review_shape_check;

ALTER TABLE construction_sites
    ADD CONSTRAINT construction_sites_creation_source_check
        CHECK (creation_source IN ('office', 'field')),
    ADD CONSTRAINT construction_sites_field_review_status_check
        CHECK (field_review_status IN ('not_required', 'pending', 'confirmed')),
    ADD CONSTRAINT construction_sites_field_creation_shape_check CHECK (
        (
            creation_source = 'office'
            AND field_created_by_user_id IS NULL
            AND field_review_status = 'not_required'
        )
        OR
        (
            creation_source = 'field'
            AND field_created_by_user_id IS NOT NULL
            AND field_review_status IN ('pending', 'confirmed')
        )
    ),
    ADD CONSTRAINT construction_sites_field_review_shape_check CHECK (
        (
            field_review_status IN ('not_required', 'pending')
            AND field_reviewed_at IS NULL
            AND field_reviewed_by_user_id IS NULL
        )
        OR
        (
            field_review_status = 'confirmed'
            AND field_reviewed_at IS NOT NULL
            AND field_reviewed_by_user_id IS NOT NULL
        )
    );

CREATE INDEX IF NOT EXISTS construction_sites_pending_field_review_idx
    ON construction_sites (company_id, created_at)
    WHERE creation_source = 'field' AND field_review_status = 'pending';

ALTER TABLE time_entries
    ADD COLUMN IF NOT EXISTS correction_kind VARCHAR(20);

UPDATE time_entries
SET correction_kind = 'replacement'
WHERE original_entry_id IS NOT NULL
  AND correction_kind IS NULL;

ALTER TABLE time_entries
    DROP CONSTRAINT IF EXISTS time_entries_correction_kind_check,
    DROP CONSTRAINT IF EXISTS time_entries_correction_shape_check;

ALTER TABLE time_entries
    ADD CONSTRAINT time_entries_correction_kind_check CHECK (
        correction_kind IS NULL
        OR correction_kind IN ('replacement', 'addition', 'invalidation')
    ),
    ADD CONSTRAINT time_entries_correction_shape_check CHECK (
        (
            correction_kind IS NULL
            AND original_entry_id IS NULL
            AND correction_status IS NULL
            AND correction_reason IS NULL
            AND reviewed_by_user_id IS NULL
            AND reviewed_at IS NULL
        )
        OR
        (
            correction_kind IN ('replacement', 'invalidation')
            AND original_entry_id IS NOT NULL
            AND correction_status IS NOT NULL
            AND correction_reason IS NOT NULL
            AND BTRIM(correction_reason) <> ''
            AND (
                (correction_status = 'pending' AND reviewed_by_user_id IS NULL AND reviewed_at IS NULL)
                OR
                (correction_status IN ('approved', 'rejected') AND reviewed_by_user_id IS NOT NULL AND reviewed_at IS NOT NULL)
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
                (correction_status = 'pending' AND reviewed_by_user_id IS NULL AND reviewed_at IS NULL)
                OR
                (correction_status IN ('approved', 'rejected') AND reviewed_by_user_id IS NOT NULL AND reviewed_at IS NOT NULL)
            )
        )
    );

CREATE OR REPLACE FUNCTION time_entries_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    original_work_day_id UUID;
    original_entry_type VARCHAR(30);
    original_site_id UUID;
    work_day_status VARCHAR(20);
    previous_approval_setting TEXT;
BEGIN
    NEW.correction_reason := NULLIF(BTRIM(NEW.correction_reason), '');

    IF TG_OP = 'INSERT' THEN
        NEW.invalidated_at := NULL;
    END IF;

    SELECT status
    INTO work_day_status
    FROM work_days
    WHERE company_id = NEW.company_id
      AND user_id = NEW.user_id
      AND id = NEW.work_day_id;

    IF work_day_status = 'locked' THEN
        IF TG_OP = 'INSERT' AND NEW.correction_kind IS NULL THEN
            RAISE EXCEPTION 'Für einen gesperrten Arbeitstag sind keine neuen Zeitbuchungen möglich.';
        ELSIF TG_OP = 'UPDATE'
            AND OLD.correction_kind IS NULL
            AND CURRENT_SETTING('app.approving_time_correction', TRUE) IS DISTINCT FROM 'on' THEN
            RAISE EXCEPTION 'Für einen gesperrten Arbeitstag sind keine neuen Zeitbuchungen möglich.';
        END IF;
    END IF;

    IF TG_OP = 'INSERT' AND NEW.original_entry_id IS NOT NULL THEN
        NEW.correction_kind := COALESCE(NEW.correction_kind, 'replacement');
        SELECT work_day_id, entry_type, construction_site_id
        INTO original_work_day_id, original_entry_type, original_site_id
        FROM time_entries
        WHERE company_id = NEW.company_id
          AND user_id = NEW.user_id
          AND id = NEW.original_entry_id;

        IF original_work_day_id IS NULL THEN
            RAISE EXCEPTION 'Der zu korrigierende Zeiteintrag wurde nicht gefunden.';
        END IF;

        IF NEW.work_day_id <> original_work_day_id
            OR NEW.entry_type <> original_entry_type
            OR NEW.construction_site_id IS DISTINCT FROM original_site_id THEN
            RAISE EXCEPTION 'Eine Korrektur muss Arbeitstag, Buchungsart und Baustelle des Originals beibehalten.';
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
            OR NEW.created_at <> OLD.created_at THEN
            RAISE EXCEPTION 'Zeitbuchungen sind unveränderlich; bitte eine Korrektur anlegen.';
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

        IF OLD.correction_status = 'pending'
            AND NEW.correction_status IN ('approved', 'rejected') THEN
            IF NEW.reviewed_by_user_id IS NULL THEN
                RAISE EXCEPTION 'Eine Korrekturentscheidung benötigt einen Prüfer.';
            END IF;

            NEW.reviewed_at := COALESCE(NEW.reviewed_at, CURRENT_TIMESTAMP);

            IF NEW.correction_status = 'approved'
                AND NEW.correction_kind IN ('replacement', 'invalidation') THEN
                previous_approval_setting := CURRENT_SETTING('app.approving_time_correction', TRUE);
                PERFORM set_config('app.approving_time_correction', 'on', TRUE);

                UPDATE time_entries
                SET invalidated_at = CURRENT_TIMESTAMP
                WHERE company_id = NEW.company_id
                  AND user_id = NEW.user_id
                  AND id = NEW.original_entry_id
                  AND invalidated_at IS NULL;

                PERFORM set_config(
                    'app.approving_time_correction',
                    COALESCE(previous_approval_setting, ''),
                    TRUE
                );
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION recalculate_work_day(
    target_company_id UUID,
    target_user_id UUID,
    target_work_day_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    calculated_clock_in TIMESTAMPTZ;
    calculated_clock_out TIMESTAMPTZ;
    calculated_gross INTEGER := 0;
    calculated_break INTEGER := 0;
    calculated_work INTEGER := 0;
    calculated_recorded_work INTEGER := 0;
    calculated_explicit_break INTEGER := 0;
    calculated_required_break INTEGER := 0;
    calculated_travel INTEGER := 0;
    target_minutes INTEGER := 0;
    previous_recalculation_setting TEXT;
BEGIN
    WITH effective_entries AS (
        SELECT entry_type, recorded_at
        FROM time_entries
        WHERE company_id = target_company_id
          AND user_id = target_user_id
          AND work_day_id = target_work_day_id
          AND invalidated_at IS NULL
          AND correction_kind IS DISTINCT FROM 'invalidation'
          AND (
              (original_entry_id IS NULL AND correction_status IS NULL)
              OR correction_status = 'approved'
          )
    )
    SELECT
        MIN(recorded_at) FILTER (WHERE entry_type = 'clock_in'),
        MAX(recorded_at) FILTER (WHERE entry_type = 'clock_out')
    INTO calculated_clock_in, calculated_clock_out
    FROM effective_entries;

    IF calculated_clock_in IS NOT NULL
        AND calculated_clock_out IS NOT NULL
        AND calculated_clock_out >= calculated_clock_in THEN
        calculated_gross := FLOOR(
            EXTRACT(EPOCH FROM (calculated_clock_out - calculated_clock_in)) / 60
        )::INTEGER;
    END IF;

    WITH effective_entries AS (
        SELECT id, entry_type, recorded_at
        FROM time_entries
        WHERE company_id = target_company_id
          AND user_id = target_user_id
          AND work_day_id = target_work_day_id
          AND invalidated_at IS NULL
          AND correction_kind IS DISTINCT FROM 'invalidation'
          AND (
              (original_entry_id IS NULL AND correction_status IS NULL)
              OR correction_status = 'approved'
          )
    ),
    work_segments AS (
        SELECT
            start_entry.recorded_at AS starts_at,
            (
                SELECT MIN(end_entry.recorded_at)
                FROM effective_entries AS end_entry
                WHERE end_entry.recorded_at > start_entry.recorded_at
                  AND end_entry.entry_type = 'clock_out'
                  AND NOT EXISTS (
                      SELECT 1
                      FROM effective_entries AS next_start
                      WHERE next_start.entry_type = 'clock_in'
                        AND next_start.recorded_at > start_entry.recorded_at
                        AND next_start.recorded_at < end_entry.recorded_at
                  )
            ) AS ends_at
        FROM effective_entries AS start_entry
        WHERE start_entry.entry_type = 'clock_in'
    )
    SELECT COALESCE(
        SUM(FLOOR(EXTRACT(EPOCH FROM (ends_at - starts_at)) / 60)),
        0
    )::INTEGER
    INTO calculated_recorded_work
    FROM work_segments
    WHERE ends_at IS NOT NULL
      AND ends_at >= starts_at;

    calculated_explicit_break := GREATEST(calculated_gross - calculated_recorded_work, 0);
    calculated_required_break := CASE
        WHEN calculated_gross >= 360 THEN 60
        WHEN calculated_gross >= 210 THEN 30
        ELSE 0
    END;
    calculated_break := GREATEST(calculated_explicit_break, calculated_required_break);
    calculated_work := GREATEST(calculated_gross - calculated_break, 0);

    WITH effective_entries AS (
        SELECT entry_type, recorded_at
        FROM time_entries
        WHERE company_id = target_company_id
          AND user_id = target_user_id
          AND work_day_id = target_work_day_id
          AND invalidated_at IS NULL
          AND correction_kind IS DISTINCT FROM 'invalidation'
          AND (
              (original_entry_id IS NULL AND correction_status IS NULL)
              OR correction_status = 'approved'
          )
    ),
    travel_segments AS (
        SELECT
            start_entry.recorded_at AS starts_at,
            (
                SELECT MIN(end_entry.recorded_at)
                FROM effective_entries AS end_entry
                WHERE end_entry.recorded_at > start_entry.recorded_at
                  AND end_entry.entry_type IN ('site_arrival', 'clock_out')
            ) AS ends_at
        FROM effective_entries AS start_entry
        WHERE start_entry.entry_type IN ('clock_in', 'site_departure')
    )
    SELECT COALESCE(
        SUM(FLOOR(EXTRACT(EPOCH FROM (ends_at - starts_at)) / 60)),
        0
    )::INTEGER
    INTO calculated_travel
    FROM travel_segments
    WHERE ends_at IS NOT NULL
      AND ends_at >= starts_at;

    SELECT target_work_minutes
    INTO target_minutes
    FROM work_days
    WHERE company_id = target_company_id
      AND user_id = target_user_id
      AND id = target_work_day_id;

    previous_recalculation_setting := CURRENT_SETTING('app.recalculating_work_day', TRUE);
    PERFORM set_config('app.recalculating_work_day', 'on', TRUE);

    UPDATE work_days
    SET first_clock_in_at = calculated_clock_in,
        last_clock_out_at = calculated_clock_out,
        gross_minutes = calculated_gross,
        break_minutes = calculated_break,
        work_minutes = calculated_work,
        travel_minutes = LEAST(calculated_travel, calculated_work),
        overtime_minutes = GREATEST(calculated_work - COALESCE(target_minutes, 0), 0),
        calculation_version = 3
    WHERE company_id = target_company_id
      AND user_id = target_user_id
      AND id = target_work_day_id;

    PERFORM set_config(
        'app.recalculating_work_day',
        COALESCE(previous_recalculation_setting, ''),
        TRUE
    );
END;
$$;

CREATE OR REPLACE VIEW pending_time_entry_corrections
WITH (security_invoker = TRUE)
AS
SELECT
    entry.id,
    entry.company_id,
    entry.user_id,
    entry.work_day_id,
    day.work_date,
    entry.original_entry_id,
    entry.entry_type,
    entry.recorded_at AS requested_recorded_at,
    original.recorded_at AS original_recorded_at,
    entry.correction_reason,
    entry.created_at AS requested_at,
    entry.correction_kind
FROM time_entries AS entry
LEFT JOIN time_entries AS original
  ON original.company_id = entry.company_id
 AND original.user_id = entry.user_id
 AND original.id = entry.original_entry_id
JOIN work_days AS day
  ON day.company_id = entry.company_id
 AND day.user_id = entry.user_id
 AND day.id = entry.work_day_id
WHERE entry.correction_status = 'pending';

GRANT SELECT ON pending_time_entry_corrections TO schaefchen_api;

COMMENT ON COLUMN construction_sites.creation_source IS
    'office für regulär angelegte Baustellen; field für Vorschläge aus der Monteur-Zeiterfassung.';
COMMENT ON COLUMN construction_sites.field_review_status IS
    'Neue Baustellen aus dem Feld bleiben sichtbar als pending, bis das Büro die Stammdaten bestätigt.';
COMMENT ON COLUMN time_entries.correction_kind IS
    'replacement ändert eine Buchungszeit, addition ergänzt eine fehlende Buchung, invalidation entwertet eine Fehlbuchung.';
COMMENT ON FUNCTION recalculate_work_day(UUID, UUID, UUID) IS
    'Berechnet Mehrfach-Arbeitsblöcke, automatische Pause, Fahrtzeit und genehmigte Ergänzungen; Ungültig-Markierungen bleiben historisch.';

COMMIT;
