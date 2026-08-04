\echo 'Teste Migration 046_configure_time_correction_policy.sql ...'

BEGIN;

DO $$
DECLARE
    seeded_policy VARCHAR(20);
    fresh_policy VARCHAR(20);
    fresh_company_id UUID;
BEGIN
    SELECT time_correction_policy INTO seeded_policy
    FROM companies WHERE company_number = 'F-000001';

    IF seeded_policy <> 'review_required' THEN
        RAISE EXCEPTION 'Bestandsfirmen wechseln nicht auf die geprüfte Korrekturregel: %', seeded_policy;
    END IF;

    INSERT INTO companies (legal_name, display_name)
    VALUES ('Korrekturregel Testfirma GmbH', 'Korrekturregel Testfirma')
    RETURNING id, time_correction_policy INTO fresh_company_id, fresh_policy;

    IF fresh_policy <> 'review_required' THEN
        RAISE EXCEPTION 'Neue Firmen starten nicht mit der geprüften Korrekturregel: %', fresh_policy;
    END IF;

    -- Die drei vorgesehenen Regeln lassen sich setzen.
    FOR fresh_policy IN SELECT unnest(ARRAY['same_day', 'immediate', 'review_required']) LOOP
        UPDATE companies SET time_correction_policy = fresh_policy WHERE id = fresh_company_id;
    END LOOP;

    BEGIN
        UPDATE companies SET time_correction_policy = 'niemals' WHERE id = fresh_company_id;
        RAISE EXCEPTION USING
            ERRCODE = 'ZX461',
            MESSAGE = 'Eine unbekannte Korrekturregel wurde akzeptiert';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;
END;
$$;

SELECT id AS tenant_a_id
FROM companies
WHERE company_number = 'F-000001'
\gset

-- Die Firmenrolle setzt die Regel für die eigene Firma; wer das darf, entscheidet
-- die API. Die Datenbank stellt sicher, dass die Regel einer fremden Firma dabei
-- unerreichbar bleibt.
SET LOCAL ROLE schaefchen_api;
SELECT set_config('app.current_company_id', :'tenant_a_id', TRUE);

DO $$
DECLARE
    tenant_a_id UUID := NULLIF(CURRENT_SETTING('app.current_company_id', TRUE), '')::UUID;
    readable VARCHAR(20);
    foreign_rows INTEGER;
BEGIN
    SELECT time_correction_policy INTO readable FROM companies;
    IF readable IS NULL THEN
        RAISE EXCEPTION 'Die API-Rolle kann die Korrekturregel nicht lesen';
    END IF;

    UPDATE companies SET time_correction_policy = 'same_day' WHERE id = tenant_a_id;
    IF NOT EXISTS (
        SELECT 1 FROM companies WHERE id = tenant_a_id AND time_correction_policy = 'same_day'
    ) THEN
        RAISE EXCEPTION 'Die eigene Korrekturregel ließ sich nicht setzen';
    END IF;

    -- Die zuvor angelegte Zweitfirma ist unter der Mandanten-Policy unsichtbar;
    -- ein Schreibversuch darf keine einzige fremde Zeile treffen.
    UPDATE companies SET time_correction_policy = 'immediate' WHERE id <> tenant_a_id;
    GET DIAGNOSTICS foreign_rows = ROW_COUNT;
    IF foreign_rows <> 0 THEN
        RAISE EXCEPTION 'Die API-Rolle hat die Korrekturregel von % fremden Firmen geändert', foreign_rows;
    END IF;
END;
$$;

RESET ROLE;
ROLLBACK;

\echo 'Migration 046_configure_time_correction_policy.sql erfolgreich getestet.'
