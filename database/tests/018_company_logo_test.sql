\echo 'Teste Migration 018_configure_company_logo.sql ...'

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM companies
        WHERE company_number = 'F-000001'
          AND logo_object_key = 'company-logos/schaaf-elektro.png'
    ) THEN
        RAISE EXCEPTION 'Das Firmenlogo der Startfirma ist nicht konfiguriert';
    END IF;
END;
$$;

SET LOCAL ROLE schaefchen_api;

DO $$
DECLARE
    returned_logo_key TEXT;
BEGIN
    SELECT logo_object_key
    INTO returned_logo_key
    FROM api_get_initial_setup_status('F-000001');

    IF returned_logo_key IS DISTINCT FROM 'company-logos/schaaf-elektro.png' THEN
        RAISE EXCEPTION 'Der Einrichtungsstatus liefert nicht das konfigurierte Firmenlogo';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM api_get_initial_setup_status('NICHT-VORHANDEN')
    ) THEN
        RAISE EXCEPTION 'Eine unbekannte Firma wurde durch die Logoabfrage offengelegt';
    END IF;
END;
$$;

RESET ROLE;
ROLLBACK;

\echo 'Migration 018_configure_company_logo.sql erfolgreich getestet.'
