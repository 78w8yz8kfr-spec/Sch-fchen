-- Erweitert das Mitarbeiter-Lebenszyklus-Protokoll um "password_reset".
--
-- WORUM ES GEHT
--
-- Der Betreiber hatte sein Passwort vergessen und keinen Weg zurück:
-- changeInitialPassword (api/src/app.mjs) greift nur einmalig, solange
-- must_change_password steht. Migration 043 (add_employee_lifecycle) legte
-- employee_lifecycle_events mit einem CHECK an, der ausschließlich
-- 'archived', 'reactivated', 'hard_deleted' und 'deactivated' erlaubt - ein
-- Zurücksetzen des Passworts durch das Büro passt in keine dieser Kategorien
-- und wäre ohne diese Erweiterung vom CHECK abgewiesen worden.
--
-- Das neue Startpasswort selbst gehört nicht in dieses Protokoll: new_state
-- trägt für 'password_reset' ausschließlich {"mustChangePassword": true} -
-- nie das Passwort oder seinen Hash. Das erzwingt api/src/app.mjs
-- (resetEmployeePassword), nicht diese Migration; der bestehende CHECK
-- employee_lifecycle_new_check verlangt nur ein JSON-Objekt, keine
-- bestimmten Schlüssel.
--
-- Der Plattform-Notausgang (administrator-password-reset in
-- platform-admin.mjs) schreibt bewusst NICHT hierher: sein Auslöser ist ein
-- Plattform-Administrator ohne Zeile in 'users', und
-- employee_lifecycle_actor_fkey verlangt genau das. Er landet stattdessen im
-- bereits vorhandenen platform_audit_log über die audit()-Funktion.

BEGIN;

ALTER TABLE employee_lifecycle_events DROP CONSTRAINT IF EXISTS employee_lifecycle_action_check;
ALTER TABLE employee_lifecycle_events ADD CONSTRAINT employee_lifecycle_action_check
    CHECK (action IN ('archived', 'reactivated', 'hard_deleted', 'deactivated', 'password_reset'));

COMMENT ON CONSTRAINT employee_lifecycle_action_check ON employee_lifecycle_events IS
    'Erlaubte Lebenszyklusaktionen; password_reset seit Migration 152 für das Zurücksetzen durch das Büro.';

COMMIT;
