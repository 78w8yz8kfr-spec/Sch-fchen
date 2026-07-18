DO $$
DECLARE
    legacy_function REGPROCEDURE := TO_REGPROCEDURE(
        'public.api_get_initial_setup_status(character varying)'
    );
    logo_function REGPROCEDURE := TO_REGPROCEDURE(
        'public.api_get_initial_setup_status_v2(character varying)'
    );
    legacy_output_count INTEGER;
    logo_output_count INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO legacy_output_count
    FROM UNNEST(
        (SELECT procedure_definition.proargmodes
         FROM pg_proc AS procedure_definition
         WHERE procedure_definition.oid = legacy_function)
    ) AS argument_mode
    WHERE argument_mode IN ('o', 'b', 't');

    SELECT COUNT(*)
    INTO logo_output_count
    FROM UNNEST(
        (SELECT procedure_definition.proargmodes
         FROM pg_proc AS procedure_definition
         WHERE procedure_definition.oid = logo_function)
    ) AS argument_mode
    WHERE argument_mode IN ('o', 'b', 't');

    IF legacy_function IS NULL
       OR logo_function IS NULL
       OR legacy_output_count <> 4
       OR logo_output_count <> 5 THEN
        RAISE EXCEPTION
            'Setup-Funktionsvertraege nicht stabil: V1=%, V2=%',
            legacy_output_count,
            logo_output_count;
    END IF;
END;
$$;
