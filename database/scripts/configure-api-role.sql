\getenv api_db_user API_DB_USER
\getenv api_db_password API_DB_PASSWORD

SELECT format(
    'CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD %L',
    :'api_db_user',
    :'api_db_password'
)
WHERE NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = :'api_db_user'
) \gexec

SELECT format(
    'ALTER ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD %L',
    :'api_db_user',
    :'api_db_password'
) \gexec

SELECT format('GRANT schaefchen_api TO %I', :'api_db_user') \gexec
