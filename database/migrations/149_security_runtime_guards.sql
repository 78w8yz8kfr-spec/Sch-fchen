-- Neustartfeste, instanzübergreifende Schranken für sicherheitskritische
-- Endpunkte. Gespeichert werden ausschließlich HMAC-Schlüssel; IP-Adressen,
-- Personalnummern, E-Mail-Adressen und Sitzungstoken gelangen nicht in diese
-- Betriebstabelle.

BEGIN;

CREATE TABLE IF NOT EXISTS security_rate_limits (
    scope VARCHAR(40) NOT NULL,
    subject_hash CHAR(64) NOT NULL,
    attempt_count INTEGER NOT NULL,
    window_ends_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (scope, subject_hash),
    CONSTRAINT security_rate_limits_scope_check
        CHECK (scope ~ '^[a-z][a-z0-9_]{1,39}$'),
    CONSTRAINT security_rate_limits_subject_hash_check
        CHECK (subject_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT security_rate_limits_attempt_count_check
        CHECK (attempt_count >= 1)
);

CREATE INDEX IF NOT EXISTS security_rate_limits_expiry_idx
    ON security_rate_limits (window_ends_at);

REVOKE ALL ON TABLE security_rate_limits FROM PUBLIC;
REVOKE ALL ON TABLE security_rate_limits FROM schaefchen_api;
REVOKE ALL ON TABLE security_rate_limits FROM schaefchen_platform_api;

CREATE OR REPLACE FUNCTION api_consume_security_rate_limit(
    target_scope VARCHAR,
    target_subject_hash CHAR(64),
    maximum_attempts INTEGER,
    window_seconds INTEGER
)
RETURNS TABLE (
    allowed BOOLEAN,
    attempt_count INTEGER,
    retry_after_seconds INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
    bucket security_rate_limits%ROWTYPE;
    current_time TIMESTAMPTZ := CURRENT_TIMESTAMP;
BEGIN
    IF target_scope IS NULL OR target_scope !~ '^[a-z][a-z0-9_]{1,39}$' THEN
        RAISE EXCEPTION 'Ungültiger Rate-Limit-Bereich' USING ERRCODE = '22023';
    END IF;
    IF target_subject_hash IS NULL OR target_subject_hash !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'Ungültiger Rate-Limit-Schlüssel' USING ERRCODE = '22023';
    END IF;
    IF maximum_attempts < 1 OR maximum_attempts > 10000
       OR window_seconds < 1 OR window_seconds > 86400 THEN
        RAISE EXCEPTION 'Ungültige Rate-Limit-Grenzen' USING ERRCODE = '22023';
    END IF;

    INSERT INTO security_rate_limits AS limits (
        scope, subject_hash, attempt_count, window_ends_at
    ) VALUES (
        target_scope,
        target_subject_hash,
        1,
        current_time + make_interval(secs => window_seconds)
    )
    ON CONFLICT (scope, subject_hash) DO UPDATE
    SET attempt_count = CASE
            WHEN limits.window_ends_at <= current_time THEN 1
            ELSE limits.attempt_count + 1
        END,
        window_ends_at = CASE
            WHEN limits.window_ends_at <= current_time
                THEN current_time + make_interval(secs => window_seconds)
            ELSE limits.window_ends_at
        END,
        updated_at = current_time
    RETURNING limits.* INTO bucket;

    -- Alte, nicht erneut verwendete HMAC-Buckets werden ohne eigenen
    -- Wartungsdienst schrittweise abgeräumt. Der begrenzte Teilscan hält den
    -- Anmeldeweg unabhängig von der Tabellengröße kurz.
    IF bucket.attempt_count = 1 THEN
        DELETE FROM security_rate_limits
        WHERE ctid IN (
            SELECT ctid
            FROM security_rate_limits
            WHERE window_ends_at < current_time - INTERVAL '1 day'
            ORDER BY window_ends_at
            LIMIT 100
        );
    END IF;

    RETURN QUERY SELECT
        bucket.attempt_count <= maximum_attempts,
        bucket.attempt_count,
        GREATEST(
            1,
            CEIL(EXTRACT(EPOCH FROM (bucket.window_ends_at - current_time)))::INTEGER
        );
END;
$$;

CREATE OR REPLACE FUNCTION api_clear_security_rate_limit(
    target_scope VARCHAR,
    target_subject_hash CHAR(64)
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
    DELETE FROM security_rate_limits
    WHERE scope = target_scope AND subject_hash = target_subject_hash;
$$;

REVOKE ALL ON FUNCTION api_consume_security_rate_limit(VARCHAR, CHAR, INTEGER, INTEGER)
    FROM PUBLIC;
REVOKE ALL ON FUNCTION api_clear_security_rate_limit(VARCHAR, CHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api_consume_security_rate_limit(VARCHAR, CHAR, INTEGER, INTEGER)
    TO schaefchen_api, schaefchen_platform_api;
GRANT EXECUTE ON FUNCTION api_clear_security_rate_limit(VARCHAR, CHAR)
    TO schaefchen_api, schaefchen_platform_api;

COMMENT ON TABLE security_rate_limits IS
    'Neustartfeste Rate-Limit-Buckets; subject_hash ist ein serverseitig erzeugter HMAC und enthält keine Klartextkennung.';
COMMENT ON FUNCTION api_consume_security_rate_limit(VARCHAR, CHAR, INTEGER, INTEGER) IS
    'Verbraucht atomar einen Versuch und liefert Freigabe sowie Wartezeit; ausschließlich über die eingeschränkten API-Rollen aufrufbar.';

COMMIT;
