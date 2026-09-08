DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM application_versions WHERE version='0.44.42' AND release_status IN ('production','superseded')) THEN
    RAISE EXCEPTION 'Fassung 0.44.42 fehlt';
  END IF;
  IF (SELECT count(*) FROM application_versions WHERE release_status='production') <> 1 THEN
    RAISE EXCEPTION 'Produktionsfassung nicht eindeutig';
  END IF;
END $$;
