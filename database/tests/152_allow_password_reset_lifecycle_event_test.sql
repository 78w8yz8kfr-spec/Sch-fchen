\echo 'Teste Migration 152_allow_password_reset_lifecycle_event.sql ...'

BEGIN;

DO $$
DECLARE
    firma UUID;
    buero UUID;
    mitarbeiter UUID;
    ereignis_id UUID;
    gespeicherter_zustand JSONB;
BEGIN
    SELECT id INTO firma FROM companies WHERE company_number = 'F-000001';

    INSERT INTO users (company_id, personnel_number, first_name, last_name)
    VALUES (firma, 'BUERO-152', 'Büro', 'Zurücksetzung')
    RETURNING id INTO buero;
    INSERT INTO users (company_id, personnel_number, first_name, last_name)
    VALUES (firma, 'MA-152', 'Vergesslich', 'Mitarbeiter')
    RETURNING id INTO mitarbeiter;

    -- 1. Die neue Aktion ist erlaubt und trägt niemals das Passwort - nur die
    --    Wirkung (mustChangePassword).
    INSERT INTO employee_lifecycle_events (
        company_id, employee_id, actor_user_id, action, reason, new_state
    ) VALUES (
        firma, mitarbeiter, buero, 'password_reset',
        'Mitarbeiter hat sein Passwort vergessen',
        '{"mustChangePassword": true}'::JSONB
    ) RETURNING id INTO ereignis_id;

    SELECT new_state INTO gespeicherter_zustand
    FROM employee_lifecycle_events WHERE id = ereignis_id;
    IF gespeicherter_zustand ? 'password' OR gespeicherter_zustand ? 'passwordHash'
       OR gespeicherter_zustand ? 'temporaryPassword' THEN
        RAISE EXCEPTION 'Das Lebenszyklusereignis enthält ein Passwort - das darf nie passieren';
    END IF;
    IF NOT (gespeicherter_zustand ->> 'mustChangePassword')::BOOLEAN THEN
        RAISE EXCEPTION 'Das Lebenszyklusereignis hat die Wirkung nicht festgehalten';
    END IF;

    -- 2. Die bereits erlaubten Aktionen funktionieren unverändert weiter.
    INSERT INTO employee_lifecycle_events (
        company_id, employee_id, actor_user_id, action, reason
    ) VALUES (firma, mitarbeiter, buero, 'deactivated', 'Regressionsprüfung Migration 152');

    -- 3. Eine erfundene Aktion bleibt abgewiesen - der CHECK wurde erweitert,
    --    nicht abgeschafft.
    BEGIN
        INSERT INTO employee_lifecycle_events (
            company_id, employee_id, actor_user_id, action, reason
        ) VALUES (firma, mitarbeiter, buero, 'erfunden', 'Darf nicht durchgehen');
        RAISE EXCEPTION 'Eine erfundene Lebenszyklusaktion wurde angenommen';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
END;
$$;

ROLLBACK;

\echo 'Migration 152_allow_password_reset_lifecycle_event.sql erfolgreich getestet.'
