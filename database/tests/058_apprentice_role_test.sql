\echo 'Teste Migration 058_apprentice_role_and_privacy.sql ...'

-- Jede Firma hat die Rolle, auch die zuletzt angelegte.
DO $$
DECLARE
    ohne INTEGER;
BEGIN
    SELECT COUNT(*) INTO ohne
    FROM companies AS firma
    WHERE NOT EXISTS (
        SELECT 1 FROM roles
        WHERE company_id = firma.id AND role_key = 'apprentice' AND status = 'active'
    );
    IF ohne > 0 THEN
        RAISE EXCEPTION 'In % Firmen fehlt die Rolle Auszubildender', ohne;
    END IF;
END;
$$;

-- Eine neu angelegte Firma bekommt sie ebenfalls. Ohne den Trigger stuende ein
-- frisch verkaufter Lehrbetrieb ohne die Rolle da.
DO $$
DECLARE
    neue_firma UUID;
BEGIN
    BEGIN
        INSERT INTO companies (legal_name, display_name)
        VALUES ('Abnahme Lehrbetrieb GmbH', 'Abnahme Lehrbetrieb')
        RETURNING id INTO neue_firma;

        IF NOT EXISTS (
            SELECT 1 FROM roles
            WHERE company_id = neue_firma AND role_key = 'apprentice' AND is_system
        ) THEN
            RAISE EXCEPTION 'Eine neue Firma bekam die Rolle Auszubildender nicht';
        END IF;

        RAISE EXCEPTION 'abnahme_zuruecknehmen';
    EXCEPTION
        WHEN raise_exception THEN
            IF SQLERRM <> 'abnahme_zuruecknehmen' THEN RAISE; END IF;
    END;
END;
$$;

-- Das alte Kennzeichen ist fort: zwei Quellen fuer dieselbe Aussage waeren
-- eine Einladung, dass sie auseinanderlaufen.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'is_apprentice'
    ) THEN
        RAISE EXCEPTION 'Das Kennzeichen is_apprentice steht noch neben der Rolle';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'trainer_user_id'
    ) THEN
        RAISE EXCEPTION 'Ohne Ausbilder gibt es kein Berichtsheft';
    END IF;
END;
$$;

\echo 'Migration 058_apprentice_role_and_privacy.sql ist fachlich abgenommen.'
