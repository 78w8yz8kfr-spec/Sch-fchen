-- Produktions-Upgradehilfe fuer den kurzzeitig veroeffentlichten V0.17.0-Stand.
-- Die fehlerhafte Variante erweiterte die bestehende V1-Funktion um eine
-- Ausgabespalte. PostgreSQL kann diesen Rueckgabetyp nicht per
-- CREATE OR REPLACE auf die urspruenglichen vier Spalten zuruecksetzen.
DO $$
DECLARE
    legacy_function REGPROCEDURE := TO_REGPROCEDURE(
        'public.api_get_initial_setup_status(character varying)'
    );
    output_column_count INTEGER;
BEGIN
    IF legacy_function IS NULL THEN
        RETURN;
    END IF;

    SELECT COUNT(*)
    INTO output_column_count
    FROM UNNEST(
        (SELECT procedure_definition.proargmodes
         FROM pg_proc AS procedure_definition
         WHERE procedure_definition.oid = legacy_function)
    ) AS argument_mode
    WHERE argument_mode IN ('o', 'b', 't');

    IF output_column_count <> 4 THEN
        DROP FUNCTION public.api_get_initial_setup_status(VARCHAR);
    END IF;
END;
$$;
