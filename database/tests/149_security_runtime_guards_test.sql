\echo 'Teste Migration 149_security_runtime_guards.sql ...'

DO $$
BEGIN
    IF to_regclass('public.security_rate_limits') IS NULL THEN
        RAISE EXCEPTION 'security_rate_limits fehlt';
    END IF;
    IF has_table_privilege('schaefchen_api', 'security_rate_limits', 'SELECT')
       OR has_table_privilege('schaefchen_platform_api', 'security_rate_limits', 'SELECT') THEN
        RAISE EXCEPTION 'API-Rollen dürfen Rate-Limit-Rohdaten nicht direkt lesen';
    END IF;
    IF NOT has_function_privilege(
        'schaefchen_api',
        'api_consume_security_rate_limit(character varying,character,integer,integer)',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'Der Firmen-API fehlt die Rate-Limit-Funktion';
    END IF;
    IF NOT has_function_privilege(
        'schaefchen_platform_api',
        'api_consume_security_rate_limit(character varying,character,integer,integer)',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'Der Plattform-API fehlt die Rate-Limit-Funktion';
    END IF;
END;
$$;

SET ROLE schaefchen_api;

DO $$
DECLARE
    first_result RECORD;
    second_result RECORD;
    third_result RECORD;
BEGIN
    PERFORM api_clear_security_rate_limit('migration_test', repeat('a', 64)::CHAR(64));
    SELECT * INTO first_result
    FROM api_consume_security_rate_limit('migration_test', repeat('a', 64)::CHAR(64), 2, 60);
    SELECT * INTO second_result
    FROM api_consume_security_rate_limit('migration_test', repeat('a', 64)::CHAR(64), 2, 60);
    SELECT * INTO third_result
    FROM api_consume_security_rate_limit('migration_test', repeat('a', 64)::CHAR(64), 2, 60);

    IF first_result.allowed IS DISTINCT FROM TRUE OR first_result.attempt_count <> 1 THEN
        RAISE EXCEPTION 'Der erste Versuch wurde nicht korrekt gezählt';
    END IF;
    IF second_result.allowed IS DISTINCT FROM TRUE OR second_result.attempt_count <> 2 THEN
        RAISE EXCEPTION 'Der zweite Versuch wurde nicht korrekt gezählt';
    END IF;
    IF third_result.allowed IS DISTINCT FROM FALSE OR third_result.attempt_count <> 3
       OR third_result.retry_after_seconds < 1 THEN
        RAISE EXCEPTION 'Die Schranke greift nicht atomar nach dem Grenzwert';
    END IF;

    PERFORM api_clear_security_rate_limit('migration_test', repeat('a', 64)::CHAR(64));
END;
$$;

RESET ROLE;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM security_rate_limits
        WHERE scope = 'migration_test' AND subject_hash = repeat('a', 64)::CHAR(64)
    ) THEN
        RAISE EXCEPTION 'Ein freigegebener Bucket blieb trotz Löschung erhalten';
    END IF;
END;
$$;

\echo 'Migration 149_security_runtime_guards.sql ist fachlich abgenommen.'
