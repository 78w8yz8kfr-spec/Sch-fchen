\echo 'Teste Migration 116_release_version_0_44_16.sql ...'

DO $$
DECLARE
    stand VARCHAR(30);
BEGIN
    -- Von dieser Fassung bleibt nur der Eintrag im Verzeichnis pruefbar. Die
    -- Buchung auf eine Baustelle, die sie brachte, ist mit Migration 141
    -- entfallen - die Lagerverwaltung wurde abgeschafft. Der Eintrag selbst
    -- bleibt: er beschreibt, was damals ausgeliefert wurde.
    SELECT release_status INTO stand
    FROM application_versions WHERE version = '0.44.16';
    IF stand IS NULL THEN
        RAISE EXCEPTION 'Die Fassung 0.44.16 fehlt im Verzeichnis';
    END IF;
END;
$$;

\echo 'Migration 116_release_version_0_44_16.sql ist fachlich abgenommen.'
