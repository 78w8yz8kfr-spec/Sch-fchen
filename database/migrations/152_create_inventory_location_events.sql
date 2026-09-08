BEGIN;
CREATE TABLE IF NOT EXISTS inventory_location_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    location_id UUID NOT NULL,
    actor_user_id UUID NOT NULL,
    happened_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    before_data JSONB,
    after_data JSONB NOT NULL,
    FOREIGN KEY (company_id, location_id) REFERENCES inventory_locations(company_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (company_id, actor_user_id) REFERENCES users(company_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS inventory_location_events_location_idx ON inventory_location_events(company_id, location_id, happened_at);

CREATE OR REPLACE FUNCTION inventory_locations_record_event() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
    INSERT INTO public.inventory_location_events(company_id, location_id, actor_user_id, before_data, after_data)
    VALUES (NEW.company_id, NEW.id,
      COALESCE(NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID, NEW.created_by_user_id),
      CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END, to_jsonb(NEW));
    RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION inventory_locations_record_event() FROM PUBLIC;
DROP TRIGGER IF EXISTS inventory_locations_record_event_trigger ON inventory_locations;
CREATE TRIGGER inventory_locations_record_event_trigger AFTER INSERT OR UPDATE ON inventory_locations
FOR EACH ROW EXECUTE FUNCTION inventory_locations_record_event();

CREATE OR REPLACE FUNCTION inventory_location_events_immutable() RETURNS TRIGGER
LANGUAGE plpgsql AS $$ BEGIN
    RAISE EXCEPTION 'Lagerhistorie bleibt unverändert' USING ERRCODE = '23514';
END $$;
DROP TRIGGER IF EXISTS inventory_location_events_immutable_trigger ON inventory_location_events;
CREATE TRIGGER inventory_location_events_immutable_trigger BEFORE UPDATE OR DELETE ON inventory_location_events
FOR EACH ROW EXECUTE FUNCTION inventory_location_events_immutable();

ALTER TABLE inventory_location_events ENABLE ROW LEVEL SECURITY;
-- Kein FORCE: ausschließlich der tabelleneigene SECURITY-DEFINER-Trigger schreibt.
DROP POLICY IF EXISTS inventory_location_events_tenant ON inventory_location_events;
CREATE POLICY inventory_location_events_tenant ON inventory_location_events
USING (company_id = NULLIF(current_setting('app.current_company_id', TRUE), '')::UUID);
GRANT SELECT ON inventory_location_events TO schaefchen_api;
COMMIT;
