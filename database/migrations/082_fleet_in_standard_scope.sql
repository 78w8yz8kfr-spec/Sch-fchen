-- Der Fuhrpark gehoert zum Standardumfang.
--
-- Migration 051 hat ihn bewusst ausgelassen: es gab ihn noch nicht, und eine
-- Freigabe fuer etwas Ungebautes verspricht mehr, als jemand einloesen kann.
-- Seit Migration 081 gibt es die Fahrzeuge wirklich, samt Bildschirm - also
-- gehoert er dorthin, wo Dokumente und Material schon stehen.
--
-- Bestandsfirmen bekommen ihn nachtraeglich: sie haben denselben Vertrag wie
-- eine Firma, die morgen angelegt wird.

BEGIN;

CREATE OR REPLACE FUNCTION platform_default_module_keys()
RETURNS VARCHAR[]
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT ARRAY[
        'absences', 'assembly_reports', 'documents', 'fleet', 'materials',
        'scheduling', 'site_daily_reports', 'site_qr'
    ]::VARCHAR[];
$$;

COMMENT ON FUNCTION platform_default_module_keys() IS
    'Bereiche, die jede Firma mit dem Standardumfang erhaelt.';

INSERT INTO company_module_entitlements (
    company_id, module_id, entitlement_status, included_in_plan, change_reason
)
SELECT tenant.id, catalog.id, 'permanent', TRUE,
       'Fuhrpark gehoert seit Fassung 0.42.28 zum Standardumfang'
FROM companies AS tenant
CROSS JOIN module_catalog AS catalog
WHERE catalog.status = 'active'
  AND catalog.module_key = 'fleet'
ON CONFLICT (company_id, module_id) DO NOTHING;

COMMIT;
