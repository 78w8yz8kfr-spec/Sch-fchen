-- Bildet ausschliesslich im CI-Lauf eine Datenbank nach, die schon laenger im
-- Betrieb ist. Diese Datei ist keine Migration und wird nie auf Render
-- ausgefuehrt.
--
-- WAS HIER SCHIEFGING
--
-- Migration 141 hat die Lagerverwaltung abgeschafft und dabei die Freigaben
-- der Firmen geloescht. Auf einer frischen Datenbank lief das durch: dort hat
-- nie jemand ein Modul gebucht, also zeigt kein Verlaufseintrag darauf. Im
-- Betrieb zeigte einer darauf - `company_module_entitlement_history` haelt
-- fest, wer wann welches Modul freigeschaltet hat -, und das DELETE lief in
-- diesen Fremdschluessel.
--
-- Weil `render-start.sh` alle Migrationen mit ON_ERROR_STOP anwendet und bei
-- Fehler abbricht, startete der Behaelter danach nicht mehr. Render liess die
-- letzte laufende Fassung stehen: der Betrieb blieb drei Auslieferungen lang
-- auf 0.44.34, waehrend hier alles gruen war.
--
-- WARUM DER ALTE ZUSTAND WIEDERHERGESTELLT WIRD
--
-- Der CI-Lauf wendet die Migrationen zweimal an: einmal auf leer, dann auf den
-- Stand, den diese Dateien herstellen. Wuerde hier nur ein Verlauf zu den
-- heute noch vorhandenen Modulen angelegt, pruefte das nichts - das Lager ist
-- im ersten Durchgang schon verschwunden, und der zweite liefe daran vorbei.
--
-- Deshalb stellt diese Datei den Katalogeintrag des Lagers wieder her, samt
-- Freigabe und Verlauf. Im zweiten Durchgang trifft Migration 141 damit genau
-- die Lage, die im Betrieb herrschte. Kommt jemals wieder ein DELETE auf
-- Katalog oder Freigaben, faellt es hier auf und nicht erst dort.

DO $$
DECLARE
    firma UUID;
    lager UUID;
    modul UUID;
BEGIN
    SELECT id INTO firma FROM companies WHERE company_number = 'F-CI0001';
    IF firma IS NULL THEN
        INSERT INTO companies (company_number, legal_name, display_name)
        VALUES ('F-CI0001', 'Bestandsbetrieb CI GmbH', 'Bestandsbetrieb CI')
        RETURNING id INTO firma;
    END IF;

    -- Der Katalogeintrag, wie ihn Migration 107 angelegt hat. Nur der Eintrag,
    -- nicht die siebzehn Tabellen: Migration 141 ist ueberall sonst mit
    -- IF EXISTS abgesichert, und gescheitert ist sie an dieser Zeile.
    INSERT INTO module_catalog (
        module_key, name, description, category, is_special, requires_platform_approval
    ) VALUES (
        'warehouse', 'Lagerverwaltung',
        'Artikelstamm, Lagerbestand, Barcodes, Wareneingang, Inventur und Bestellwesen.',
        'business', FALSE, TRUE
    )
    ON CONFLICT (module_key) DO UPDATE SET status = 'active';
    SELECT id INTO lager FROM module_catalog WHERE module_key = 'warehouse';

    -- Jedes buchbare Modul wird freigeschaltet und danach geaendert. Erst die
    -- Aenderung erzeugt den Verlaufseintrag, an dem alles haengenblieb - und
    -- weil es alle Module betrifft, gilt der Schutz auch fuer das naechste,
    -- das jemand abschafft.
    FOR modul IN SELECT id FROM module_catalog WHERE status = 'active' LOOP
        INSERT INTO company_module_entitlements (
            company_id, module_id, entitlement_status, included_in_plan, change_reason
        ) VALUES (firma, modul, 'permanent', TRUE, 'Bestandsvertrag')
        ON CONFLICT (company_id, module_id) DO UPDATE
        SET entitlement_status = 'permanent',
            included_in_plan = TRUE,
            change_reason = 'Bestandsvertrag';

        UPDATE company_module_entitlements
        SET included_in_plan = FALSE, change_reason = 'Vertrag umgestellt'
        WHERE company_id = firma AND module_id = modul;
    END LOOP;

    -- Ohne Verlaufszeile auf der Lagerfreigabe prueft dieser Aufbau genau das
    -- nicht, wofuer es ihn gibt.
    IF NOT EXISTS (
        SELECT 1 FROM company_module_entitlement_history AS verlauf
        JOIN company_module_entitlements AS freigabe ON freigabe.id = verlauf.entitlement_id
        WHERE freigabe.company_id = firma AND freigabe.module_id = lager
    ) THEN
        RAISE EXCEPTION 'Die Lagerfreigabe hat keinen Verlauf - der Aufbau prüft nichts.';
    END IF;
END;
$$;
