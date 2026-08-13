-- Baustromverteiler bekommen eine eigene Verwaltung.
--
-- WARUM AUF DEN GERAETEN UND NICHT DANEBEN
--
-- Ein Baustromverteiler ist ein Geraet: er hat eine Inventarnummer, steht an
-- einem Ort, ist einer Baustelle zugeordnet, wird geprueft, geht kaputt und
-- traegt einen QR-Code. Das alles fuehrt die Geraeteverwaltung seit Migration
-- 095, und es ein zweites Mal zu bauen hiesse, Standorte, Pruefungen und
-- Maengel doppelt zu pflegen. Genau diese Doppelung steht im Produktkonzept
-- als Fehler: neue Module fuehren keine parallelen Stammdaten ein.
--
-- Diese Migration legt deshalb nur an, was es bei Geraeten wirklich nicht
-- gibt.
--
-- 1. EINE EIGENE KATEGORIE
--
-- 'power_distributors' mit dem Grundtyp 'equipment'. Daran haengt die eigene
-- Ansicht: was in dieser Kategorie steht, ist ein Baustromverteiler.
--
-- 2. DER MONATLICHE FI-TEST
--
-- Eine eigene Tabelle und nicht `device_inspections`, obwohl es auf den
-- ersten Blick dort hingehoert. Der Grund ist praktisch: eine Zeile in
-- `device_inspections` setzt die Faelligkeit des Geraets neu. Der monatliche
-- Druck auf die Prueftaste ist aber keine Pruefung im Sinne der DGUV V3 -
-- er ersetzt die vierteljaehrliche Pruefung nicht und darf ihren Termin
-- nicht verschieben. Zwei verschiedene Fristen brauchen zwei getrennte
-- Aufzeichnungen; sonst verschiebt der Monteur mit einem Tastendruck den
-- Termin, an dem die Fachkraft anrücken muss.
--
-- Unveraenderlich wie jede andere Aufzeichnung im Haus: wer heute bestaetigt
-- und morgen zurueckziehen will, traegt einen neuen Eintrag nach.
--
-- 3. ZAEHLERSTAENDE
--
-- Baustrom wird dem Kunden weiterberechnet, und dafuer braucht es den Stand
-- beim Aufstellen, zwischendurch und beim Abbau. Der Anlass steht dabei, weil
-- die Rechnung ihn braucht: zwischen zwei Ablesungen liegt der Verbrauch, aber
-- nur die Abbau-Ablesung schliesst die Baustelle ab.
--
-- Die Baustelle steht an der Ablesung und nicht nur am Geraet: ein Verteiler
-- wandert im Lauf eines Jahres ueber fuenf Baustellen, und die Rechnung von
-- Baustelle drei darf sich nicht aendern, weil er inzwischen woanders steht.
--
-- Ein Zaehler laeuft vorwaerts. Eine Ablesung, die unter der vorigen liegt,
-- ist entweder ein Tippfehler oder ein Zaehlerwechsel; beides gehoert
-- geprueft und nicht stillschweigend gebucht. Die Regel dafuer steht in der
-- Anwendung, weil sie den Vorgaenger kennen muss - hier steht nur, dass ein
-- Stand nicht negativ sein kann.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Die Kategorie
-- ---------------------------------------------------------------------------

-- Fuer alle Firmen, die es schon gibt.
INSERT INTO device_categories (company_id, category_key, name, base_type, is_system)
SELECT id, 'power_distributors', 'Baustromverteiler', 'equipment', TRUE
FROM companies
ON CONFLICT (company_id, category_key) DO NOTHING;

-- Und fuer jede, die noch kommt. Die Funktion aus Migration 095 wird ergaenzt,
-- nicht ersetzt: alles andere darin steht Wort fuer Wort wieder da. Wer sie
-- spaeter erneut anfasst, kopiert wieder den ganzen Rumpf - ein
-- CREATE OR REPLACE kennt kein "nur diese eine Zeile dazu", und was beim
-- Kopieren fehlt, faellt still weg. Beim Schreiben dieser Migration ist genau
-- das passiert: die Voreinstellung des Lagerorts blieb liegen, und die
-- Abnahme von 095 hat es gemeldet.
CREATE OR REPLACE FUNCTION seed_device_master_data(target_company_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE lager UUID;
BEGIN
    INSERT INTO device_categories (company_id, category_key, name, base_type, is_system)
    VALUES
        (target_company_id, 'machines', 'Maschinen', 'machine', TRUE),
        (target_company_id, 'power_tools', 'Elektrowerkzeuge', 'power_tool', TRUE),
        (target_company_id, 'hand_tools', 'Handwerkzeuge', 'hand_tool', TRUE),
        (target_company_id, 'measuring_devices', 'Messgeräte', 'measuring_device', TRUE),
        (target_company_id, 'testing_devices', 'Prüfgeräte', 'testing_device', TRUE),
        (target_company_id, 'batteries', 'Akkus', 'battery', TRUE),
        (target_company_id, 'chargers', 'Ladegeräte', 'charger', TRUE),
        (target_company_id, 'ladders', 'Leitern', 'ladder', TRUE),
        (target_company_id, 'equipment', 'Betriebsmittel', 'equipment', TRUE),
        (target_company_id, 'power_distributors', 'Baustromverteiler', 'equipment', TRUE),
        (target_company_id, 'other', 'Sonstige Geräte', 'other', TRUE)
    ON CONFLICT (company_id, category_key) DO NOTHING;

    INSERT INTO device_locations (company_id, name, location_type)
    VALUES (target_company_id, 'Hauptlager', 'warehouse')
    ON CONFLICT (company_id, (LOWER(name))) DO NOTHING;
    INSERT INTO device_locations (company_id, name, location_type)
    VALUES (target_company_id, 'Werkstatt', 'workshop')
    ON CONFLICT (company_id, (LOWER(name))) DO NOTHING;

    SELECT id INTO lager FROM device_locations
    WHERE company_id = target_company_id AND LOWER(name) = 'hauptlager';
    INSERT INTO device_settings (company_id, default_storage_location_id)
    VALUES (target_company_id, lager)
    ON CONFLICT (company_id) DO NOTHING;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Der monatliche FI-Test
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS power_rcd_tests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
    device_id UUID NOT NULL,
    construction_site_id UUID,
    tested_on DATE NOT NULL,
    tested_by_user_id UUID NOT NULL,
    result VARCHAR(20) NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT power_rcd_tests_company_id_id_key UNIQUE (company_id, id),
    CONSTRAINT power_rcd_tests_device_fkey FOREIGN KEY (company_id, device_id)
        REFERENCES devices (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT power_rcd_tests_site_fkey FOREIGN KEY (company_id, construction_site_id)
        REFERENCES construction_sites (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT power_rcd_tests_tester_fkey FOREIGN KEY (company_id, tested_by_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    -- Bestanden oder nicht - ein Drittes gibt es beim Pruefknopf nicht. Faellt
    -- er durch, ist der Verteiler bis zur Reparatur nicht zu benutzen, und
    -- genau das soll die Ansicht auch sagen.
    CONSTRAINT power_rcd_tests_result_check CHECK (result IN ('passed', 'failed')),
    -- Ein Test in der Zukunft ist keiner.
    CONSTRAINT power_rcd_tests_date_check CHECK (tested_on <= CURRENT_DATE + 1)
);

CREATE INDEX IF NOT EXISTS power_rcd_tests_device_idx
    ON power_rcd_tests (company_id, device_id, tested_on DESC);

-- ---------------------------------------------------------------------------
-- 3. Zaehlerstaende
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS power_meter_readings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
    device_id UUID NOT NULL,
    construction_site_id UUID,
    read_on DATE NOT NULL,
    reading_kwh NUMERIC(12,1) NOT NULL,
    reason VARCHAR(20) NOT NULL,
    read_by_user_id UUID NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT power_meter_readings_company_id_id_key UNIQUE (company_id, id),
    CONSTRAINT power_meter_readings_device_fkey FOREIGN KEY (company_id, device_id)
        REFERENCES devices (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT power_meter_readings_site_fkey FOREIGN KEY (company_id, construction_site_id)
        REFERENCES construction_sites (company_id, id) ON DELETE RESTRICT,
    CONSTRAINT power_meter_readings_reader_fkey FOREIGN KEY (company_id, read_by_user_id)
        REFERENCES users (company_id, id) ON DELETE RESTRICT,
    -- Aufstellen, zwischendurch, Abbau. Der Anlass steht dabei, weil die
    -- Rechnung ihn braucht.
    CONSTRAINT power_meter_readings_reason_check
        CHECK (reason IN ('installation', 'interim', 'removal')),
    CONSTRAINT power_meter_readings_value_check
        CHECK (reading_kwh >= 0 AND reading_kwh <= 99999999),
    CONSTRAINT power_meter_readings_date_check CHECK (read_on <= CURRENT_DATE + 1)
);

CREATE INDEX IF NOT EXISTS power_meter_readings_device_idx
    ON power_meter_readings (company_id, device_id, read_on DESC, created_at DESC);

-- ---------------------------------------------------------------------------
-- 4. Mandantengrenze und Rechte
--
-- Beide Tabellen sind Aufzeichnungen: geschrieben und gelesen, nie geaendert.
-- Die API-Rolle bekommt deshalb kein UPDATE - eine Korrektur ist ein neuer
-- Eintrag, so wie bei Uebergaben und Pruefungen der Geraeteverwaltung auch.
-- ---------------------------------------------------------------------------

DO $$
DECLARE target TEXT;
BEGIN
    FOREACH target IN ARRAY ARRAY['power_rcd_tests', 'power_meter_readings'] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', target);
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', target || '_tenant_isolation', target);
        EXECUTE format(
            'CREATE POLICY %I ON %I USING '
            '(company_id = NULLIF(CURRENT_SETTING(''app.current_company_id'', TRUE), '''')::UUID) '
            'WITH CHECK (company_id = NULLIF(CURRENT_SETTING(''app.current_company_id'', TRUE), '''')::UUID)',
            target || '_tenant_isolation', target
        );
        EXECUTE format('ALTER TABLE %I NO FORCE ROW LEVEL SECURITY', target);
    END LOOP;
END;
$$;

GRANT SELECT, INSERT ON power_rcd_tests, power_meter_readings TO schaefchen_api;

COMMENT ON TABLE power_rcd_tests IS
    'Monatlicher Druck auf die Pruueftaste des RCD; ersetzt die vierteljaehrliche Pruefung nach DGUV V3 nicht und verschiebt deren Termin nicht.';
COMMENT ON TABLE power_meter_readings IS
    'Zaehlerstaende eines Baustromverteilers mit Anlass und Baustelle - Grundlage der Weiterberechnung.';

COMMIT;
