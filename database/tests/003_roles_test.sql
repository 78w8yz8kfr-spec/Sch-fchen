\echo 'Teste Migration 003_create_roles.sql ...'

BEGIN;

DO $$
DECLARE
    company_a_id UUID;
    company_b_id UUID;
    user_a_id UUID;
    user_b_id UUID;
    installer_role_id UUID;
    foreman_role_id UUID;
    foreign_role_id UUID;
    foreman_assignment_id UUID;
BEGIN
    SELECT id
    INTO company_a_id
    FROM companies
    WHERE company_number = 'F-000001';

    INSERT INTO companies (legal_name, display_name)
    VALUES ('Rollentest Zweitfirma GmbH', 'Rollentest Zweitfirma')
    RETURNING id INTO company_b_id;

    IF (
        SELECT COUNT(*)
        FROM roles
        WHERE company_id = company_a_id
          AND role_key IN ('admin', 'office', 'foreman', 'installer')
          AND is_system
          AND status = 'active'
    ) <> 4 THEN
        RAISE EXCEPTION 'Vier Standardrollen der Seed-Firma fehlen';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM roles
        WHERE company_id = company_a_id
          AND role_key = 'admin'
          AND is_full_access
    ) THEN
        RAISE EXCEPTION 'Adminrolle besitzt keinen erzwungenen Vollzugriff';
    END IF;

    IF (
        SELECT COUNT(*)
        FROM roles
        WHERE company_id = company_b_id
          AND role_key IN ('admin', 'office', 'foreman', 'installer')
    ) <> 4 THEN
        RAISE EXCEPTION 'Standardrollen wurden für neue Firma nicht erzeugt';
    END IF;

    INSERT INTO users (
        company_id,
        personnel_number,
        first_name,
        last_name
    )
    VALUES (company_a_id, 'ROLE-A', 'Rollen', 'Test A')
    RETURNING id INTO user_a_id;

    INSERT INTO users (
        company_id,
        personnel_number,
        first_name,
        last_name
    )
    VALUES (company_b_id, 'ROLE-B', 'Rollen', 'Test B')
    RETURNING id INTO user_b_id;

    SELECT id
    INTO installer_role_id
    FROM roles
    WHERE company_id = company_a_id
      AND role_key = 'installer';

    SELECT id
    INTO foreman_role_id
    FROM roles
    WHERE company_id = company_a_id
      AND role_key = 'foreman';

    SELECT id
    INTO foreign_role_id
    FROM roles
    WHERE company_id = company_b_id
      AND role_key = 'installer';

    INSERT INTO user_roles (company_id, user_id, role_id, reason)
    VALUES (company_a_id, user_a_id, installer_role_id, 'Grundrolle');

    INSERT INTO user_roles (company_id, user_id, role_id, reason)
    VALUES (company_a_id, user_a_id, foreman_role_id, 'Testzuweisung')
    RETURNING id INTO foreman_assignment_id;

    IF NOT EXISTS (
        SELECT 1
        FROM users
        WHERE id = user_a_id
          AND is_foreman
    ) THEN
        RAISE EXCEPTION 'Aktive Vorarbeiterrolle setzt is_foreman nicht';
    END IF;

    BEGIN
        INSERT INTO user_roles (company_id, user_id, role_id)
        VALUES (company_a_id, user_a_id, foreman_role_id);
        RAISE EXCEPTION USING
            ERRCODE = 'ZX201',
            MESSAGE = 'Doppelte aktive Rollenzuweisung wurde akzeptiert';
    EXCEPTION
        WHEN unique_violation THEN
            NULL;
    END;

    BEGIN
        INSERT INTO user_roles (company_id, user_id, role_id)
        VALUES (company_a_id, user_a_id, foreign_role_id);
        RAISE EXCEPTION USING
            ERRCODE = 'ZX202',
            MESSAGE = 'Firmenfremde Rollenzuweisung wurde akzeptiert';
    EXCEPTION
        WHEN foreign_key_violation THEN
            NULL;
    END;

    UPDATE user_roles
    SET revoked_at = CURRENT_TIMESTAMP,
        reason = 'Testwiderruf'
    WHERE id = foreman_assignment_id;

    IF EXISTS (
        SELECT 1
        FROM users
        WHERE id = user_a_id
          AND is_foreman
    ) THEN
        RAISE EXCEPTION 'Widerruf der Vorarbeiterrolle setzt is_foreman nicht zurück';
    END IF;

    BEGIN
        UPDATE users
        SET is_foreman = TRUE
        WHERE id = user_a_id;
        RAISE EXCEPTION USING
            ERRCODE = 'ZX203',
            MESSAGE = 'Direkte Änderung von is_foreman wurde akzeptiert';
    EXCEPTION
        WHEN SQLSTATE 'P0001' THEN
            NULL;
    END;

    BEGIN
        UPDATE roles
        SET is_full_access = FALSE
        WHERE company_id = company_a_id
          AND role_key = 'admin';
        RAISE EXCEPTION USING
            ERRCODE = 'ZX204',
            MESSAGE = 'Admin-Vollzugriff konnte entfernt werden';
    EXCEPTION
        WHEN check_violation THEN
            NULL;
    END;

    BEGIN
        DELETE FROM user_roles
        WHERE company_id = company_a_id
          AND user_id = user_a_id
          AND role_id = installer_role_id;
        RAISE EXCEPTION USING
            ERRCODE = 'ZX205',
            MESSAGE = 'Rollenzuweisung konnte hart gelöscht werden';
    EXCEPTION
        WHEN SQLSTATE 'P0001' THEN
            NULL;
    END;
END;
$$;

SELECT id AS tenant_a_id
FROM companies
WHERE company_number = 'F-000001'
\gset

SET LOCAL ROLE schaefchen_api;
SELECT set_config('app.current_company_id', :'tenant_a_id', TRUE);

DO $$
DECLARE
    visible_companies INTEGER;
    foreign_users INTEGER;
    visible_roles INTEGER;
BEGIN
    SELECT COUNT(*) INTO visible_companies FROM companies;
    SELECT COUNT(*)
    INTO foreign_users
    FROM users
    WHERE company_id <> NULLIF(
        CURRENT_SETTING('app.current_company_id', TRUE),
        ''
    )::UUID;
    SELECT COUNT(*) INTO visible_roles FROM roles;

    IF visible_companies <> 1 THEN
        RAISE EXCEPTION 'API-Rolle sieht % Firmen statt genau einer', visible_companies;
    END IF;

    IF foreign_users <> 0 THEN
        RAISE EXCEPTION 'API-Rolle sieht firmenfremde Benutzer';
    END IF;

    IF visible_roles <> 7 THEN
        RAISE EXCEPTION 'API-Rolle sieht % Rollen statt der sieben eigenen', visible_roles;
    END IF;
END;
$$;

RESET ROLE;
ROLLBACK;

\echo 'Migration 003_create_roles.sql erfolgreich getestet.'
