import { createHash } from "node:crypto";
import { toString as qrToString } from "qrcode";
import { loadCompanyModules } from "./company-modules.mjs";
import { ensureRcdNotifications } from "./power.mjs";
import { InputError, readJson, validateId } from "./validation.mjs";

export const DEVICE_MODULE_KEY = "devices";

const MANAGER_ROLES = new Set([
  "admin", "managing_director", "dispatch_office", "office", "planner",
  "executive_assistant"
]);
const INVENTORY_ROLES = new Set([...MANAGER_ROLES, "foreman"]);
const BLOCKING_STATUSES = new Set(["repair", "defective", "locked", "lost", "retired"]);
const DEVICE_STATUSES = new Set([
  "available", "fixed_assigned", "loaned", "on_site", "in_storage",
  "repair", "defective", "inspection_due", "locked", "lost", "retired"
]);
const CONDITIONS = new Set(["new", "ok", "worn", "damaged", "defective", "unknown"]);
const BASE_TYPES = new Set([
  "machine", "power_tool", "hand_tool", "measuring_device", "testing_device",
  "battery", "charger", "ladder", "equipment", "other"
]);
const TRANSFER_ACTIONS = new Set([
  "takeover", "handover", "return_fixed_owner", "return_storage",
  "leave_site", "move_location", "administrative_correction"
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function requiredText(value, label, maximum = 200, minimum = 1) {
  if (typeof value !== "string") throw new InputError(`${label} fehlt.`);
  const normalized = value.trim();
  if (normalized.length < minimum || normalized.length > maximum) {
    throw new InputError(`${label} hat eine ungültige Länge.`);
  }
  return normalized;
}

function optionalText(value, label, maximum = 500) {
  if (value === undefined || value === null || value === "") return null;
  return requiredText(value, label, maximum);
}

function optionalId(value, label) {
  if (value === undefined || value === null || value === "") return null;
  return validateId(value, label);
}

function optionalDate(value, label) {
  if (value === undefined || value === null || value === "") return null;
  const normalized = requiredText(value, label, 10, 10);
  const parsed = new Date(`${normalized}T12:00:00Z`);
  if (!DATE.test(normalized) || Number.isNaN(parsed.valueOf())
      || parsed.toISOString().slice(0, 10) !== normalized) {
    throw new InputError(`${label} ist kein gültiges Datum.`);
  }
  return normalized;
}

function optionalTimestamp(value, label) {
  if (value === undefined || value === null || value === "") return null;
  const normalized = requiredText(value, label, 50);
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.valueOf())) throw new InputError(`${label} ist kein gültiger Zeitpunkt.`);
  return parsed.toISOString();
}

function optionalInteger(value, label, minimum, maximum) {
  if (value === undefined || value === null || value === "") return null;
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new InputError(`${label} ist ungültig.`);
  }
  return value;
}

function optionalNumber(value, label, minimum, maximum) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new InputError(`${label} ist ungültig.`);
  }
  return value;
}

function requiredBoolean(value, label) {
  if (typeof value !== "boolean") throw new InputError(`${label} ist ungültig.`);
  return value;
}

function optionalBoolean(value, label) {
  if (value === undefined) return undefined;
  return requiredBoolean(value, label);
}

function rejectServerFields(body) {
  for (const key of ["companyId", "company_id", "createdByUserId", "actorUserId"]) {
    if (Object.hasOwn(body, key)) {
      throw new InputError(`${key} wird ausschließlich vom Server bestimmt.`);
    }
  }
}

export function normalizeDeviceQrToken(value) {
  let candidate = requiredText(value, "QR-Code", 2000);
  try {
    const parsed = new URL(candidate);
    candidate = parsed.searchParams.get("device") || "";
  } catch {
    // Ein reiner Token ist ebenfalls erlaubt.
  }
  candidate = candidate.trim();
  if (!UUID.test(candidate)) {
    throw new InputError("Der QR-Code ist ungültig oder gehört nicht zu Schäfchen.", 400, "device_qr_invalid");
  }
  return candidate.toLowerCase();
}

export function validateDeviceInput(body, { partial = false } = {}) {
  rejectServerFields(body);
  const result = {};
  const assign = (key, parser, required = false) => {
    if (Object.hasOwn(body, key)) result[key] = parser(body[key]);
    else if (required && !partial) throw new InputError(`${key} fehlt.`);
  };
  assign("inventoryNumber", (value) => requiredText(value, "Inventarnummer", 50), true);
  assign("name", (value) => requiredText(value, "Bezeichnung", 180), true);
  assign("categoryId", (value) => validateId(value, "Kategorie-ID"), true);
  assign("manufacturer", (value) => optionalText(value, "Hersteller", 120));
  assign("model", (value) => optionalText(value, "Modell", 120));
  assign("serialNumber", (value) => optionalText(value, "Seriennummer", 160));
  assign("purchaseDate", (value) => optionalDate(value, "Kaufdatum"));
  assign("purchasePriceCents", (value) => optionalInteger(value, "Kaufpreis", 0, 1_000_000_000));
  assign("supplier", (value) => optionalText(value, "Lieferant", 160));
  assign("warrantyUntil", (value) => optionalDate(value, "Garantieende"));
  assign("condition", (value) => {
    const normalized = requiredText(value, "Zustand", 30).toLowerCase();
    if (!CONDITIONS.has(normalized)) throw new InputError("Der Gerätezustand ist ungültig.");
    return normalized;
  });
  assign("note", (value) => optionalText(value, "Notizen", 5000));
  assign("locationId", (value) => optionalId(value, "Standort-ID"));
  assign("constructionSiteId", (value) => optionalId(value, "Baustellen-ID"));
  assign("vehicleId", (value) => optionalId(value, "Fahrzeug-ID"));
  assign("fixedOwnerUserId", (value) => optionalId(value, "Fester Besitzer"));
  assign("currentOwnerUserId", (value) => optionalId(value, "Aktueller Besitzer"));
  assign("inspectionRequired", (value) => requiredBoolean(value, "Prüfpflicht"));
  assign("lastInspectionOn", (value) => optionalDate(value, "Letzte Prüfung"));
  assign("nextInspectionOn", (value) => optionalDate(value, "Nächste Prüfung"));
  assign("maintenanceIntervalDays", (value) => optionalInteger(value, "Wartungsintervall", 1, 3650));
  assign("nextMaintenanceOn", (value) => optionalDate(value, "Nächste Wartung"));
  assign("status", (value) => {
    const normalized = requiredText(value, "Status", 30).toLowerCase();
    if (!DEVICE_STATUSES.has(normalized)) throw new InputError("Der Gerätestatus ist ungültig.");
    return normalized;
  });
  assign("retiredReason", (value) => optionalText(value, "Ausmusterungsgrund", 1000));
  assign("rowVersion", (value) => optionalInteger(value, "Zeilenversion", 1, Number.MAX_SAFE_INTEGER));
  if (Object.hasOwn(body, "battery")) {
    if (body.battery === null) result.battery = null;
    else {
      const battery = body.battery;
      if (!battery || typeof battery !== "object" || Array.isArray(battery)) {
        throw new InputError("Die Akkuangaben sind ungültig.");
      }
      result.battery = {
        batterySystem: requiredText(battery.batterySystem, "Akkusystem", 100),
        voltage: optionalNumber(battery.voltage, "Spannung", 0.01, 1000),
        capacityAh: optionalNumber(battery.capacityAh, "Kapazität", 0.01, 1000),
        cycleCount: optionalInteger(battery.cycleCount, "Ladezyklen", 0, 10_000_000),
        lastCapacityTestOn: optionalDate(battery.lastCapacityTestOn, "Kapazitätstest"),
        remainingCapacityPercent: optionalNumber(
          battery.remainingCapacityPercent, "Restkapazität", 0, 100
        ),
        compatibleSystem: optionalText(battery.compatibleSystem, "Kompatibles System", 160)
      };
    }
  }
  return result;
}

export function validateDeviceSetInput(body, { partial = false } = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new InputError("Die Angaben zum Geräteset sind ungültig.");
  }
  rejectServerFields(body);
  const result = {};
  if (Object.hasOwn(body, "setNumber")) {
    result.setNumber = requiredText(body.setNumber, "Setnummer", 40);
  } else if (!partial) {
    throw new InputError("Die Setnummer fehlt.");
  }
  if (Object.hasOwn(body, "name")) {
    result.name = requiredText(body.name, "Setbezeichnung", 160);
  } else if (!partial) {
    throw new InputError("Die Setbezeichnung fehlt.");
  }
  if (Object.hasOwn(body, "note")) result.note = optionalText(body.note, "Setnotiz", 3000);
  if (Object.hasOwn(body, "rowVersion")) {
    result.rowVersion = optionalInteger(
      body.rowVersion, "Zeilenversion", 1, Number.MAX_SAFE_INTEGER
    );
  }
  if (Object.hasOwn(body, "deviceIds")) {
    if (!Array.isArray(body.deviceIds) || body.deviceIds.length < 1 || body.deviceIds.length > 50) {
      throw new InputError("Ein Geräteset muss 1 bis 50 inventarisierte Teile enthalten.");
    }
    result.deviceIds = [...new Set(body.deviceIds.map((value) => validateId(value, "Geräte-ID")))];
  }
  return result;
}

export function validateDeviceBundleInput(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new InputError("Die Angaben zur Geräteanlage sind ungültig.");
  }
  rejectServerFields(body);
  const device = validateDeviceInput(body.device);
  const rawParts = body.parts ?? [];
  if (!Array.isArray(rawParts) || rawParts.length > 25) {
    throw new InputError("Pro Anlage können höchstens 25 beiliegende Teile erfasst werden.");
  }
  const parts = rawParts.map((part) => validateDeviceInput(part));
  let set = null;
  if (parts.length) {
    set = validateDeviceSetInput(body.set);
  } else if (body.set !== undefined && body.set !== null) {
    throw new InputError("Ein Geräteset benötigt mindestens ein beiliegendes Teil.");
  }
  return { device, parts, set };
}

export function validateTransferInput(body) {
  rejectServerFields(body);
  const action = requiredText(body.action, "Aktion", 40).toLowerCase();
  if (!TRANSFER_ACTIONS.has(action)) throw new InputError("Die Übergabeaktion ist ungültig.");
  const note = optionalText(body.note, "Kommentar", 1000);
  if (action === "administrative_correction" && (!note || note.length < 3)) {
    throw new InputError("Für eine administrative Korrektur ist ein Grund erforderlich.");
  }
  const clientOperationId = validateId(body.clientOperationId, "Offline-ID");
  const expectedRowVersion = optionalInteger(
    body.expectedRowVersion, "Erwartete Zeilenversion", 1, Number.MAX_SAFE_INTEGER
  );
  if (!expectedRowVersion) {
    throw new InputError("Für die Übergabe fehlt der aktuelle Gerätestand.");
  }
  return {
    action,
    toUserId: optionalId(body.toUserId, "Empfänger"),
    locationId: optionalId(body.locationId, "Standort"),
    constructionSiteId: optionalId(body.constructionSiteId, "Baustelle"),
    clientOperationId,
    expectedRowVersion,
    clientCreatedAt: optionalTimestamp(body.clientCreatedAt, "Erfassungszeit"),
    note,
    offline: body.offline === true
  };
}

function validateDefectInput(body) {
  rejectServerFields(body);
  const severity = requiredText(body.severity, "Schweregrad", 20).toLowerCase();
  if (!["low", "medium", "high", "critical"].includes(severity)) {
    throw new InputError("Der Schweregrad ist ungültig.");
  }
  return {
    description: requiredText(body.description, "Fehlerbeschreibung", 2000, 3),
    severity,
    usable: requiredBoolean(body.usable, "Weiter verwendbar"),
    photoDataUrl: optionalText(body.photoDataUrl, "Foto", 4_100_000)
  };
}

function validateInspectionInput(body) {
  rejectServerFields(body);
  const result = requiredText(body.result, "Prüfergebnis", 30).toLowerCase();
  if (!["passed", "passed_with_notes", "failed"].includes(result)) {
    throw new InputError("Das Prüfergebnis ist ungültig.");
  }
  return {
    inspectionType: requiredText(body.inspectionType, "Prüfart", 120),
    inspectedOn: optionalDate(body.inspectedOn, "Prüfdatum") || new Date().toISOString().slice(0, 10),
    inspectorUserId: optionalId(body.inspectorUserId, "Prüfer"),
    inspectorName: optionalText(body.inspectorName, "Prüfername", 160),
    result,
    nextInspectionOn: optionalDate(body.nextInspectionOn, "Nächste Prüfung"),
    intervalDays: optionalInteger(body.intervalDays, "Prüffrist", 1, 3650),
    protocolDocumentId: optionalId(body.protocolDocumentId, "Prüfprotokoll"),
    note: optionalText(body.note, "Prüfnotiz", 3000)
  };
}

async function roleKeys(client, context) {
  const result = await client.query(
    `SELECT role.role_key
     FROM user_roles AS assignment
     JOIN roles AS role ON role.company_id = assignment.company_id AND role.id = assignment.role_id
     WHERE assignment.company_id = $1 AND assignment.user_id = $2
       AND assignment.revoked_at IS NULL AND role.status = 'active'`,
    [context.companyId, context.userId]
  );
  return new Set(result.rows.map((row) => row.role_key));
}

async function requireModule(client, context) {
  const modules = await loadCompanyModules(client, context);
  if (!modules.find((module) => module.key === DEVICE_MODULE_KEY)?.enabled) {
    throw new InputError(
      "Maschinen & Geräte ist für diese Firma nicht freigeschaltet.",
      403,
      "devices_module_disabled"
    );
  }
}

async function requireManager(client, context) {
  const roles = await roleKeys(client, context);
  if (![...roles].some((role) => MANAGER_ROLES.has(role))) {
    throw new InputError("Für die Geräteverwaltung fehlt die Berechtigung.", 403, "device_manage_forbidden");
  }
  return roles;
}

async function requireInventory(client, context) {
  const roles = await roleKeys(client, context);
  if (![...roles].some((role) => INVENTORY_ROLES.has(role))) {
    throw new InputError("Für die Inventur fehlt die Berechtigung.", 403, "device_inventory_forbidden");
  }
  return roles;
}

async function canManage(client, context) {
  const roles = await roleKeys(client, context);
  return [...roles].some((role) => MANAGER_ROLES.has(role));
}

const DEVICE_SELECT = `
  SELECT device.*, category.name AS category_name, category.base_type,
         fixed_assignment.id AS fixed_assignment_id,
         fixed_assignment.user_id AS fixed_owner_user_id,
         fixed_assignment.started_at AS fixed_since,
         fixed_user.first_name || ' ' || fixed_user.last_name AS fixed_owner_name,
         fixed_user.status AS fixed_owner_status,
         custody.id AS custody_assignment_id,
         custody.user_id AS current_owner_user_id,
         custody.started_at AS custody_since,
         custody_user.first_name || ' ' || custody_user.last_name AS current_owner_name,
         custody_user.status AS current_owner_status,
         location.name AS current_location_name,
         location.location_type AS current_location_type,
         previous_location.name AS last_known_location_name,
         site.name AS construction_site_name,
         vehicle.licence_plate AS vehicle_name,
         battery.battery_system, battery.voltage, battery.capacity_ah,
         battery.cycle_count, battery.last_capacity_test_on,
         battery.measured_remaining_capacity_percent, battery.compatible_system,
         latest_defect.id AS open_defect_id,
         latest_defect.description AS open_defect_description,
         latest_defect.severity AS open_defect_severity,
         latest_defect.usable AS open_defect_usable,
         latest_defect.status AS open_defect_status,
         latest_defect.row_version AS open_defect_row_version,
         latest_defect.reported_at AS open_defect_reported_at,
         containing_set.id AS device_set_id,
         containing_set.set_number AS device_set_number,
         containing_set.name AS device_set_name,
         containing_set.item_count AS device_set_item_count,
         EXISTS (
           SELECT 1 FROM device_images AS image
           WHERE image.company_id = device.company_id AND image.device_id = device.id
             AND image.image_kind = 'device'
         ) AS has_photo,
         settings.inspection_warning_days, settings.lock_overdue_inspections
  FROM devices AS device
  JOIN device_categories AS category
    ON category.company_id = device.company_id AND category.id = device.category_id
  LEFT JOIN LATERAL (
    SELECT assignment.id, assignment.user_id, assignment.started_at
    FROM device_assignments AS assignment
    WHERE assignment.company_id = device.company_id AND assignment.device_id = device.id
      AND assignment.assignment_type = 'fixed' AND assignment.ended_at IS NULL
    LIMIT 1
  ) AS fixed_assignment ON TRUE
  LEFT JOIN users AS fixed_user
    ON fixed_user.company_id = device.company_id AND fixed_user.id = fixed_assignment.user_id
  LEFT JOIN LATERAL (
    SELECT assignment.id, assignment.user_id, assignment.started_at
    FROM device_assignments AS assignment
    WHERE assignment.company_id = device.company_id AND assignment.device_id = device.id
      AND assignment.assignment_type = 'custody' AND assignment.ended_at IS NULL
    LIMIT 1
  ) AS custody ON TRUE
  LEFT JOIN users AS custody_user
    ON custody_user.company_id = device.company_id AND custody_user.id = custody.user_id
  LEFT JOIN device_locations AS location
    ON location.company_id = device.company_id AND location.id = device.current_location_id
  LEFT JOIN device_locations AS previous_location
    ON previous_location.company_id = device.company_id AND previous_location.id = device.last_known_location_id
  LEFT JOIN construction_sites AS site
    ON site.company_id = device.company_id AND site.id = device.assigned_construction_site_id
  LEFT JOIN vehicles AS vehicle
    ON vehicle.company_id = device.company_id AND vehicle.id = device.assigned_vehicle_id
  LEFT JOIN device_battery_profiles AS battery
    ON battery.company_id = device.company_id AND battery.device_id = device.id
  LEFT JOIN LATERAL (
    SELECT defect.id, defect.description, defect.severity, defect.usable,
           defect.status, defect.row_version, defect.reported_at
    FROM device_defects AS defect
    WHERE defect.company_id = device.company_id AND defect.device_id = device.id
      AND defect.status <> 'resolved'
    ORDER BY defect.reported_at DESC, defect.id DESC
    LIMIT 1
  ) AS latest_defect ON TRUE
  LEFT JOIN LATERAL (
    SELECT device_set.id, device_set.set_number, device_set.name,
           (SELECT COUNT(*)::INTEGER
            FROM device_set_items AS counted_item
            WHERE counted_item.company_id = device_set.company_id
              AND counted_item.device_set_id = device_set.id
              AND counted_item.removed_at IS NULL) AS item_count
    FROM device_set_items AS set_item
    JOIN device_sets AS device_set
      ON device_set.company_id = set_item.company_id
     AND device_set.id = set_item.device_set_id
    WHERE set_item.company_id = device.company_id
      AND set_item.device_id = device.id
      AND set_item.removed_at IS NULL
      AND device_set.status = 'active'
    LIMIT 1
  ) AS containing_set ON TRUE
  LEFT JOIN device_settings AS settings ON settings.company_id = device.company_id`;

function datePlusDays(date, days) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function databaseDateKey(value) {
  if (value === undefined || value === null || value === "") return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.valueOf())) return null;
    const part = (number) => String(number).padStart(2, "0");
    return `${value.getFullYear()}-${part(value.getMonth() + 1)}-${part(value.getDate())}`;
  }
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(value));
  return match?.[1] || null;
}

export function deviceDto(row, userId, today = new Date().toISOString().slice(0, 10)) {
  const warningUntil = datePlusDays(today, Number(row.inspection_warning_days || 30));
  const nextInspectionOn = databaseDateKey(row.next_inspection_on);
  const overdue = Boolean(row.inspection_required && nextInspectionOn && nextInspectionOn < today);
  const dueSoon = Boolean(row.inspection_required && nextInspectionOn
    && nextInspectionOn >= today && nextInspectionOn <= warningUntil);
  const compliance = overdue ? "overdue" : dueSoon ? "due" : "ok";
  const effectiveStatus = !BLOCKING_STATUSES.has(row.status) && (overdue || dueSoon)
    ? "inspection_due"
    : row.status;
  const blocked = BLOCKING_STATUSES.has(row.status)
    || (overdue && Boolean(row.lock_overdue_inspections));
  const currentIsSelf = row.current_owner_user_id === userId;
  const fixedIsSelf = row.fixed_owner_user_id === userId;
  const actions = row.status === "retired" ? [] : ["report_defect"];
  if (!blocked && row.status !== "retired") {
    if (currentIsSelf) actions.unshift("return", "handover", "leave_site", "return_storage");
    else actions.unshift("takeover");
  }
  return {
    id: row.id,
    inventoryNumber: row.inventory_number,
    name: row.name,
    categoryId: row.category_id,
    categoryName: row.category_name,
    baseType: row.base_type,
    manufacturer: row.manufacturer,
    model: row.model,
    serialNumber: row.serial_number,
    purchaseDate: databaseDateKey(row.purchase_date),
    purchasePriceCents: row.purchase_price_cents,
    supplier: row.supplier,
    warrantyUntil: databaseDateKey(row.warranty_until),
    condition: row.condition_key,
    note: row.note,
    status: row.status,
    effectiveStatus,
    blocked,
    rowVersion: Number(row.row_version),
    fixedOwner: row.fixed_owner_user_id ? {
      id: row.fixed_owner_user_id,
      name: row.fixed_owner_name,
      status: row.fixed_owner_status,
      since: row.fixed_since
    } : null,
    currentOwner: row.current_owner_user_id ? {
      id: row.current_owner_user_id,
      name: row.current_owner_name,
      status: row.current_owner_status,
      since: row.custody_since
    } : null,
    currentLocation: row.current_location_id ? {
      id: row.current_location_id,
      name: row.current_location_name,
      type: row.current_location_type
    } : null,
    lastKnownLocation: row.last_known_location_id ? {
      id: row.last_known_location_id,
      name: row.last_known_location_name
    } : null,
    constructionSite: row.assigned_construction_site_id ? {
      id: row.assigned_construction_site_id,
      name: row.construction_site_name
    } : null,
    vehicle: row.assigned_vehicle_id ? {
      id: row.assigned_vehicle_id,
      name: row.vehicle_name
    } : null,
    inspectionRequired: row.inspection_required,
    lastInspectionOn: databaseDateKey(row.last_inspection_on),
    nextInspectionOn,
    inspectionState: compliance,
    maintenanceIntervalDays: row.maintenance_interval_days,
    nextMaintenanceOn: databaseDateKey(row.next_maintenance_on),
    hasPhoto: Boolean(row.has_photo),
    photoUrl: row.has_photo ? `./api/v1/devices/${row.id}/photo` : null,
    battery: row.base_type === "battery" ? {
      batterySystem: row.battery_system,
      voltage: row.voltage === null ? null : Number(row.voltage),
      capacityAh: row.capacity_ah === null ? null : Number(row.capacity_ah),
      cycleCount: row.cycle_count,
      lastCapacityTestOn: databaseDateKey(row.last_capacity_test_on),
      remainingCapacityPercent: row.measured_remaining_capacity_percent === null
        ? null : Number(row.measured_remaining_capacity_percent),
      compatibleSystem: row.compatible_system
    } : null,
    openDefect: row.open_defect_id ? {
      id: row.open_defect_id,
      description: row.open_defect_description,
      severity: row.open_defect_severity,
      usable: row.open_defect_usable,
      status: row.open_defect_status,
      rowVersion: Number(row.open_defect_row_version),
      reportedAt: row.open_defect_reported_at
    } : null,
    set: row.device_set_id ? {
      id: row.device_set_id,
      number: row.device_set_number,
      name: row.device_set_name,
      itemCount: Number(row.device_set_item_count || 0)
    } : null,
    isFixedOwner: fixedIsSelf,
    isCurrentOwner: currentIsSelf,
    actions,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function loadDevice(client, context, deviceId) {
  const result = await client.query(
    `${DEVICE_SELECT} WHERE device.company_id = $1 AND device.id = $2`,
    [context.companyId, deviceId]
  );
  if (result.rowCount !== 1) {
    throw new InputError("Das Gerät wurde nicht gefunden.", 404, "device_not_found");
  }
  return deviceDto(result.rows[0], context.userId, context.deviceToday);
}

async function lockDevice(client, context, deviceId) {
  const result = await client.query(
    `SELECT device.id, device.row_version, device.status, device.current_location_id,
            device.assigned_construction_site_id, device.assigned_vehicle_id,
            device.condition_key,
            (device.inspection_required AND device.next_inspection_on < $3::DATE
             AND COALESCE(settings.lock_overdue_inspections, FALSE)) AS inspection_blocked
     FROM devices AS device
     LEFT JOIN device_settings AS settings ON settings.company_id=device.company_id
     WHERE device.company_id = $1 AND device.id = $2
     FOR UPDATE OF device`,
    [context.companyId, deviceId, context.deviceToday || new Date().toISOString().slice(0, 10)]
  );
  if (result.rowCount !== 1) {
    throw new InputError("Das Gerät wurde nicht gefunden.", 404, "device_not_found");
  }
  return result.rows[0];
}

async function safetyState(client, context, deviceId) {
  const result = await client.query(
    `SELECT EXISTS (
       SELECT 1 FROM device_defects
       WHERE company_id=$1 AND device_id=$2 AND status <> 'resolved' AND NOT usable
     ) AS unsafe_defect,
     EXISTS (
       SELECT 1 FROM device_defects
       WHERE company_id=$1 AND device_id=$2 AND status <> 'resolved'
     ) AS open_defect,
     COALESCE((
       SELECT inspection.result = 'failed'
       FROM device_inspections AS inspection
       WHERE inspection.company_id=$1 AND inspection.device_id=$2
       ORDER BY inspection.inspected_on DESC,inspection.created_at DESC,inspection.id DESC
       LIMIT 1
     ), FALSE) AS failed_inspection`,
    [context.companyId, deviceId]
  );
  return result.rows[0] || {
    unsafe_defect: false, open_defect: false, failed_inspection: false
  };
}

async function audit(client, context, deviceId, action, oldState, newState, reason, sourceType = "api", sourceId = null) {
  await client.query(
    `INSERT INTO device_history (
       company_id, device_id, action, actor_user_id, old_state, new_state,
       reason, source_type, source_id
     ) VALUES ($1,$2,$3,$4,$5::JSONB,$6::JSONB,$7,$8,$9)`,
    [
      context.companyId, deviceId, action, context.userId,
      oldState ? JSON.stringify(oldState) : null,
      newState ? JSON.stringify(newState) : null,
      reason || null, sourceType, sourceId
    ]
  );
}

async function activeAssignment(client, context, deviceId, type) {
  const result = await client.query(
    `SELECT assignment.id, assignment.user_id, assignment.started_at,
            account.first_name || ' ' || account.last_name AS user_name
     FROM device_assignments AS assignment
     JOIN users AS account ON account.company_id = assignment.company_id AND account.id = assignment.user_id
     WHERE assignment.company_id = $1 AND assignment.device_id = $2
       AND assignment.assignment_type = $3 AND assignment.ended_at IS NULL
     FOR UPDATE OF assignment`,
    [context.companyId, deviceId, type]
  );
  return result.rows[0] || null;
}

async function ensureActiveUser(client, context, userId) {
  const result = await client.query(
    `SELECT id, first_name || ' ' || last_name AS name
     FROM users WHERE company_id = $1 AND id = $2 AND status = 'active'`,
    [context.companyId, userId]
  );
  if (result.rowCount !== 1) {
    throw new InputError("Der Mitarbeiter ist nicht aktiv oder gehört nicht zur Firma.", 409, "device_user_unavailable");
  }
  return result.rows[0];
}

async function ensureCategory(client, context, categoryId) {
  const result = await client.query(
    `SELECT id, base_type FROM device_categories
     WHERE company_id = $1 AND id = $2 AND status = 'active'`,
    [context.companyId, categoryId]
  );
  if (result.rowCount !== 1) {
    throw new InputError("Die Gerätekategorie wurde nicht gefunden.", 404, "device_category_not_found");
  }
  return result.rows[0];
}

async function ensureLocation(client, context, locationId) {
  if (!locationId) return null;
  const result = await client.query(
    `SELECT id, name, location_type, construction_site_id, vehicle_id
     FROM device_locations WHERE company_id = $1 AND id = $2 AND status = 'active'`,
    [context.companyId, locationId]
  );
  if (result.rowCount !== 1) {
    throw new InputError("Der Gerätestandort wurde nicht gefunden.", 404, "device_location_not_found");
  }
  return result.rows[0];
}

async function ensureConstructionSite(client, context, siteId) {
  if (!siteId) return null;
  const result = await client.query(
    `SELECT id,name FROM construction_sites
     WHERE company_id=$1 AND id=$2 AND status IN ('planned','active','on_hold','delayed')`,
    [context.companyId, siteId]
  );
  if (result.rowCount !== 1) {
    throw new InputError("Die Baustelle wurde nicht gefunden.", 404, "device_site_not_found");
  }
  return result.rows[0];
}

async function ensureVehicle(client, context, vehicleId) {
  if (!vehicleId) return null;
  const result = await client.query(
    `SELECT id,licence_plate AS name FROM vehicles
     WHERE company_id=$1 AND id=$2 AND status <> 'retired'`,
    [context.companyId, vehicleId]
  );
  if (result.rowCount !== 1) {
    throw new InputError("Das Fahrzeug wurde nicht gefunden.", 404, "device_vehicle_not_found");
  }
  return result.rows[0];
}

async function defaultStorage(client, context) {
  const result = await client.query(
    `SELECT location.id, location.name, location.location_type
     FROM device_settings AS settings
     JOIN device_locations AS location
       ON location.company_id = settings.company_id AND location.id = settings.default_storage_location_id
     WHERE settings.company_id = $1`,
    [context.companyId]
  );
  return result.rows[0] || null;
}

async function upsertBattery(client, context, deviceId, battery, categoryType) {
  if (battery === undefined) return;
  if (categoryType !== "battery" && battery) {
    throw new InputError("Akkuwerte können nur für die Kategorie Akku gespeichert werden.");
  }
  if (battery === null) return;
  await client.query(
    `INSERT INTO device_battery_profiles (
       company_id, device_id, battery_system, voltage, capacity_ah, cycle_count,
       last_capacity_test_on, measured_remaining_capacity_percent, compatible_system
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (company_id, device_id) DO UPDATE SET
       battery_system = EXCLUDED.battery_system,
       voltage = EXCLUDED.voltage,
       capacity_ah = EXCLUDED.capacity_ah,
       cycle_count = EXCLUDED.cycle_count,
       last_capacity_test_on = EXCLUDED.last_capacity_test_on,
       measured_remaining_capacity_percent = EXCLUDED.measured_remaining_capacity_percent,
       compatible_system = EXCLUDED.compatible_system`,
    [
      context.companyId, deviceId, battery.batterySystem, battery.voltage,
      battery.capacityAh, battery.cycleCount, battery.lastCapacityTestOn,
      battery.remainingCapacityPercent, battery.compatibleSystem
    ]
  );
}

async function addAssignment(client, context, deviceId, type, userId, source, clientOperationId = null) {
  await client.query(
    `INSERT INTO device_assignments (
       company_id, device_id, assignment_type, user_id, source,
       client_operation_id, created_by_user_id
     ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [context.companyId, deviceId, type, userId, source, clientOperationId, context.userId]
  );
}

async function endAssignment(client, context, assignment, reason) {
  if (!assignment) return;
  await client.query(
    `UPDATE device_assignments
     SET ended_at = CURRENT_TIMESTAMP, ended_by_user_id = $3, end_reason = $4
     WHERE company_id = $1 AND id = $2 AND ended_at IS NULL`,
    [context.companyId, assignment.id, context.userId, reason]
  );
}

async function createDevice(client, context, input) {
  await requireManager(client, context);
  const category = await ensureCategory(client, context, input.categoryId);
  if (category.base_type === "battery" && !input.battery) {
    throw new InputError("Für einen Akku sind Akkusystem und Akkuangaben erforderlich.");
  }
  await ensureLocation(client, context, input.locationId);
  await ensureConstructionSite(client, context, input.constructionSiteId);
  await ensureVehicle(client, context, input.vehicleId);
  if (input.fixedOwnerUserId) await ensureActiveUser(client, context, input.fixedOwnerUserId);
  if (input.currentOwnerUserId) await ensureActiveUser(client, context, input.currentOwnerUserId);
  const custodyOwnerUserId = Object.hasOwn(input, "currentOwnerUserId")
    ? input.currentOwnerUserId
    : input.fixedOwnerUserId || null;
  const requestedStatus = input.status || "available";
  const status = BLOCKING_STATUSES.has(requestedStatus)
    ? requestedStatus
    : custodyOwnerUserId
      ? custodyOwnerUserId === input.fixedOwnerUserId ? "fixed_assigned" : "loaned"
      : input.constructionSiteId ? "on_site"
        : input.locationId || input.vehicleId ? "in_storage" : "available";
  if (status === "retired" && !input.retiredReason) {
    throw new InputError("Für die Ausmusterung ist ein Grund erforderlich.");
  }
  let inserted;
  try {
    inserted = await client.query(
      `INSERT INTO devices (
         company_id, inventory_number, name, category_id, manufacturer, model,
         serial_number, purchase_date, purchase_price_cents, supplier, warranty_until,
         condition_key, note, current_location_id, last_known_location_id,
         assigned_construction_site_id, assigned_vehicle_id, inspection_required,
         last_inspection_on, next_inspection_on, maintenance_interval_days,
         next_maintenance_on, status, retired_reason, created_by_user_id
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14,
         $15,$16,$17,$18,$19,$20,$21,$22,$23,$24
       ) RETURNING id`,
      [
        context.companyId, input.inventoryNumber, input.name, input.categoryId,
        input.manufacturer, input.model, input.serialNumber, input.purchaseDate,
        input.purchasePriceCents, input.supplier, input.warrantyUntil,
        input.condition || "ok", input.note, input.locationId,
        input.constructionSiteId, input.vehicleId, input.inspectionRequired || false,
        input.lastInspectionOn, input.nextInspectionOn, input.maintenanceIntervalDays,
        input.nextMaintenanceOn, status, input.retiredReason, context.userId
      ]
    );
  } catch (error) {
    if (error.code === "23505") {
      throw new InputError("Inventarnummer oder Seriennummer ist bereits vergeben.", 409, "device_already_exists");
    }
    throw error;
  }
  const deviceId = inserted.rows[0].id;
  if (input.fixedOwnerUserId) {
    await addAssignment(client, context, deviceId, "fixed", input.fixedOwnerUserId, "administration");
  }
  if (custodyOwnerUserId) {
    await addAssignment(client, context, deviceId, "custody", custodyOwnerUserId, "administration");
  }
  await upsertBattery(client, context, deviceId, input.battery, category.base_type);
  await client.query(
    `INSERT INTO device_qr_tokens (company_id, device_id, created_by_user_id)
     VALUES ($1,$2,$3)`,
    [context.companyId, deviceId, context.userId]
  );
  await audit(client, context, deviceId, "device_qr_created", null, {
    generation: 1
  }, "Ersten QR-Code erzeugt");
  await audit(client, context, deviceId, "device_created", null, {
    inventoryNumber: input.inventoryNumber,
    name: input.name,
    fixedOwnerUserId: input.fixedOwnerUserId || null,
    currentOwnerUserId: custodyOwnerUserId
  }, "Gerät angelegt");
  return loadDevice(client, context, deviceId);
}

function deviceSetDto(row) {
  return {
    id: row.id,
    number: row.set_number,
    name: row.name,
    note: row.note,
    status: row.status,
    itemCount: Number(row.item_count || 0),
    rowVersion: Number(row.row_version),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function lockDeviceSet(client, context, setId, expectedRowVersion = null) {
  const result = await client.query(
    `SELECT id,set_number,name,note,status,row_version,created_at,updated_at
     FROM device_sets WHERE company_id=$1 AND id=$2 FOR UPDATE`,
    [context.companyId, setId]
  );
  if (!result.rowCount) {
    throw new InputError("Das Geräteset wurde nicht gefunden.", 404, "device_set_not_found");
  }
  if (result.rows[0].status !== "active") {
    throw new InputError("Das Geräteset ist archiviert.", 409, "device_set_archived");
  }
  if (expectedRowVersion && Number(result.rows[0].row_version) !== expectedRowVersion) {
    throw new InputError(
      "Das Geräteset wurde zwischenzeitlich geändert. Bitte neu laden.",
      409,
      "device_set_changed"
    );
  }
  return result.rows[0];
}

async function ensureSetDevices(client, context, deviceIds) {
  if (!deviceIds?.length) {
    throw new InputError("Ein Geräteset benötigt mindestens einen inventarisierten Gegenstand.");
  }
  const devices = await client.query(
    `SELECT id,status FROM devices
     WHERE company_id=$1 AND id=ANY($2::UUID[]) FOR UPDATE`,
    [context.companyId, deviceIds]
  );
  if (devices.rowCount !== deviceIds.length) {
    throw new InputError(
      "Mindestens ein Set-Teil wurde nicht gefunden.", 404, "device_set_item_not_found"
    );
  }
  if (devices.rows.some((device) => device.status === "retired")) {
    throw new InputError(
      "Ausgemusterte Geräte können keinem aktiven Set hinzugefügt werden.",
      409,
      "device_set_item_retired"
    );
  }
  const membership = await client.query(
    `SELECT item.device_id,device_set.set_number,device_set.name
     FROM device_set_items AS item
     JOIN device_sets AS device_set
       ON device_set.company_id=item.company_id AND device_set.id=item.device_set_id
     WHERE item.company_id=$1 AND item.device_id=ANY($2::UUID[])
       AND item.removed_at IS NULL`,
    [context.companyId, deviceIds]
  );
  if (membership.rowCount) {
    const occupied = membership.rows[0];
    throw new InputError(
      `Ein ausgewähltes Gerät gehört bereits zu ${occupied.set_number} · ${occupied.name}.`,
      409,
      "device_set_item_assigned"
    );
  }
}

async function loadDeviceSet(client, context, setId) {
  await requireManager(client, context);
  const result = await client.query(
    `SELECT device_set.*,
            COUNT(item.id) FILTER (WHERE item.removed_at IS NULL)::INTEGER AS item_count
     FROM device_sets AS device_set
     LEFT JOIN device_set_items AS item
       ON item.company_id=device_set.company_id AND item.device_set_id=device_set.id
     WHERE device_set.company_id=$1 AND device_set.id=$2
     GROUP BY device_set.id`,
    [context.companyId, setId]
  );
  if (!result.rowCount) {
    throw new InputError("Das Geräteset wurde nicht gefunden.", 404, "device_set_not_found");
  }
  const items = await client.query(
    `${DEVICE_SELECT}
     WHERE device.company_id=$1 AND EXISTS (
       SELECT 1 FROM device_set_items AS set_item
       WHERE set_item.company_id=device.company_id
         AND set_item.device_id=device.id
         AND set_item.device_set_id=$2
         AND set_item.removed_at IS NULL
     )
     ORDER BY category.name,device.name,device.inventory_number`,
    [context.companyId, setId]
  );
  return {
    ...deviceSetDto(result.rows[0]),
    items: items.rows.map((row) => deviceDto(row, context.userId, context.deviceToday))
  };
}

async function listDeviceSets(client, context) {
  await requireManager(client, context);
  const result = await client.query(
    `SELECT device_set.*,
            COUNT(item.id) FILTER (WHERE item.removed_at IS NULL)::INTEGER AS item_count
     FROM device_sets AS device_set
     LEFT JOIN device_set_items AS item
       ON item.company_id=device_set.company_id AND item.device_set_id=device_set.id
     WHERE device_set.company_id=$1
     GROUP BY device_set.id
     ORDER BY device_set.status='archived',device_set.set_number,device_set.name`,
    [context.companyId]
  );
  return result.rows.map(deviceSetDto);
}

async function createDeviceSet(client, context, input) {
  await requireManager(client, context);
  const deviceIds = input.deviceIds || [];
  await ensureSetDevices(client, context, deviceIds);
  let result;
  try {
    result = await client.query(
      `INSERT INTO device_sets (company_id,set_number,name,note)
       VALUES ($1,$2,$3,$4)
       RETURNING id`,
      [context.companyId, input.setNumber, input.name, input.note]
    );
    await client.query(
      `INSERT INTO device_set_items (
         company_id,device_set_id,device_id,added_by_user_id
       )
       SELECT $1,$2,listed.item_id,$4 FROM UNNEST($3::UUID[]) AS listed(item_id)`,
      [context.companyId, result.rows[0].id, deviceIds, context.userId]
    );
  } catch (error) {
    if (error.code === "23505") {
      throw new InputError(
        "Diese Setnummer oder eines der Geräte ist bereits einem Set zugeordnet.",
        409,
        "device_set_exists"
      );
    }
    throw error;
  }
  for (const deviceId of deviceIds) {
    await audit(
      client,
      context,
      deviceId,
      "device_set_added",
      null,
      { setId: result.rows[0].id, setNumber: input.setNumber },
      "Gerät dem Set hinzugefügt"
    );
  }
  return loadDeviceSet(client, context, result.rows[0].id);
}

async function createDeviceBundle(client, context, input) {
  await requireManager(client, context);
  const device = await createDevice(client, context, input.device);
  const parts = [];
  for (const part of input.parts) parts.push(await createDevice(client, context, part));
  const set = parts.length
    ? await createDeviceSet(client, context, {
      ...input.set,
      deviceIds: [device.id, ...parts.map((part) => part.id)]
    })
    : null;
  return {
    device: set?.items.find((item) => item.id === device.id) || device,
    parts: set ? set.items.filter((item) => item.id !== device.id) : parts,
    set
  };
}

async function updateDeviceSet(client, context, setId, input) {
  await requireManager(client, context);
  const current = await lockDeviceSet(client, context, setId, input.rowVersion);
  if (!input.rowVersion) {
    throw new InputError("Für das Geräteset fehlt der aktuelle Stand.");
  }
  try {
    await client.query(
      `UPDATE device_sets SET set_number=$3,name=$4,note=$5
       WHERE company_id=$1 AND id=$2`,
      [
        context.companyId,
        setId,
        input.setNumber ?? current.set_number,
        input.name ?? current.name,
        Object.hasOwn(input, "note") ? input.note : current.note
      ]
    );
  } catch (error) {
    if (error.code === "23505") {
      throw new InputError("Diese Setnummer gibt es bereits.", 409, "device_set_exists");
    }
    throw error;
  }
  return loadDeviceSet(client, context, setId);
}

async function addDeviceSetItems(client, context, setId, input) {
  await requireManager(client, context);
  if (!input.rowVersion) throw new InputError("Für das Geräteset fehlt der aktuelle Stand.");
  await lockDeviceSet(client, context, setId, input.rowVersion);
  await ensureSetDevices(client, context, input.deviceIds);
  await client.query(
    `INSERT INTO device_set_items (company_id,device_set_id,device_id,added_by_user_id)
     SELECT $1,$2,listed.item_id,$4 FROM UNNEST($3::UUID[]) AS listed(item_id)`,
    [context.companyId, setId, input.deviceIds, context.userId]
  );
  await client.query(
    `UPDATE device_sets SET updated_at=CURRENT_TIMESTAMP WHERE company_id=$1 AND id=$2`,
    [context.companyId, setId]
  );
  for (const deviceId of input.deviceIds) {
    await audit(
      client, context, deviceId, "device_set_added", null, { setId },
      "Gerät dem Set hinzugefügt"
    );
  }
  return loadDeviceSet(client, context, setId);
}

async function removeDeviceSetItem(client, context, setId, deviceId, body) {
  await requireManager(client, context);
  const rowVersion = optionalInteger(
    body.rowVersion, "Zeilenversion", 1, Number.MAX_SAFE_INTEGER
  );
  if (!rowVersion) throw new InputError("Für das Geräteset fehlt der aktuelle Stand.");
  await lockDeviceSet(client, context, setId, rowVersion);
  const reason = requiredText(body.reason, "Grund", 1000, 3);
  const count = await client.query(
    `SELECT COUNT(*)::INTEGER AS count FROM device_set_items
     WHERE company_id=$1 AND device_set_id=$2 AND removed_at IS NULL`,
    [context.companyId, setId]
  );
  if (count.rows[0].count <= 1) {
    throw new InputError(
      "Das letzte Teil kann nicht entfernt werden. Das Set muss mindestens einen Gegenstand enthalten.",
      409,
      "device_set_last_item"
    );
  }
  const result = await client.query(
    `UPDATE device_set_items
     SET removed_at=CURRENT_TIMESTAMP,removed_by_user_id=$4,remove_reason=$5
     WHERE company_id=$1 AND device_set_id=$2 AND device_id=$3 AND removed_at IS NULL
     RETURNING id`,
    [context.companyId, setId, deviceId, context.userId, reason]
  );
  if (!result.rowCount) {
    throw new InputError("Das Gerät gehört nicht zu diesem Set.", 404, "device_set_item_not_found");
  }
  await client.query(
    `UPDATE device_sets SET updated_at=CURRENT_TIMESTAMP WHERE company_id=$1 AND id=$2`,
    [context.companyId, setId]
  );
  await audit(
    client, context, deviceId, "device_set_removed", { setId }, null, reason
  );
  return loadDeviceSet(client, context, setId);
}

async function updateFixedOwner(client, context, deviceId, userId, reason) {
  const current = await activeAssignment(client, context, deviceId, "fixed");
  if ((current?.user_id || null) === (userId || null)) return;
  if (userId) await ensureActiveUser(client, context, userId);
  await endAssignment(client, context, current, reason);
  if (userId) {
    await addAssignment(client, context, deviceId, "fixed", userId, "administration");
    const custody = await activeAssignment(client, context, deviceId, "custody");
    if (!custody) {
      await addAssignment(client, context, deviceId, "custody", userId, "administration");
    }
  }
  await audit(client, context, deviceId, "device_fixed_owner_changed",
    { userId: current?.user_id || null }, { userId: userId || null }, reason);
}

async function updateDevice(client, context, deviceId, input) {
  await requireManager(client, context);
  if (Object.hasOwn(input, "currentOwnerUserId")) {
    throw new InputError(
      "Den aktuellen Besitzer bitte über eine protokollierte Geräteübergabe ändern.",
      409,
      "device_custody_requires_transfer"
    );
  }
  const locked = await lockDevice(client, context, deviceId);
  if (!input.rowVersion || Number(locked.row_version) !== input.rowVersion) {
    throw new InputError(
      "Das Gerät wurde zwischenzeitlich geändert. Bitte neu laden.", 409, "device_changed"
    );
  }
  const oldDevice = await loadDevice(client, context, deviceId);
  if (locked.status === "retired" && Object.hasOwn(input, "status") && input.status !== "retired") {
    throw new InputError(
      "Ein ausgemustertes Gerät kann nicht still reaktiviert werden.", 409, "device_retired"
    );
  }
  const categoryId = input.categoryId || oldDevice.categoryId;
  const category = await ensureCategory(client, context, categoryId);
  if (category.base_type === "battery"
      && (input.battery === null || (oldDevice.baseType !== "battery" && !input.battery))) {
    throw new InputError("Für einen Akku sind Akkusystem und Akkuangaben erforderlich.");
  }
  if (Object.hasOwn(input, "locationId")) await ensureLocation(client, context, input.locationId);
  if (Object.hasOwn(input, "constructionSiteId")) {
    await ensureConstructionSite(client, context, input.constructionSiteId);
  }
  if (Object.hasOwn(input, "vehicleId")) await ensureVehicle(client, context, input.vehicleId);
  if (input.status === "retired" && !input.retiredReason) {
    throw new InputError("Für die Ausmusterung ist ein Grund erforderlich.");
  }
  if (Object.hasOwn(input, "fixedOwnerUserId")) {
    await updateFixedOwner(
      client, context, deviceId, input.fixedOwnerUserId,
      input.retiredReason || "Festen Besitzer administrativ geändert"
    );
  }
  const field = (key, fallback) => Object.hasOwn(input, key) ? input[key] : fallback;
  const requestedStatus = field("status", oldDevice.status);
  const fixed = await activeAssignment(client, context, deviceId, "fixed");
  const custody = await activeAssignment(client, context, deviceId, "custody");
  const safety = await safetyState(client, context, deviceId);
  const status = BLOCKING_STATUSES.has(requestedStatus)
    ? requestedStatus
    : safety.unsafe_defect || safety.failed_inspection ? "locked"
      : custody ? (fixed?.user_id === custody.user_id ? "fixed_assigned" : "loaned")
        : field("constructionSiteId", oldDevice.constructionSite?.id || null) ? "on_site"
          : field("locationId", oldDevice.currentLocation?.id || null)
              || field("vehicleId", oldDevice.vehicle?.id || null) ? "in_storage" : "available";
  try {
    await client.query(
      `UPDATE devices SET
       inventory_number=$3, name=$4, category_id=$5, manufacturer=$6, model=$7,
       serial_number=$8, purchase_date=$9, purchase_price_cents=$10, supplier=$11,
       warranty_until=$12, condition_key=$13, note=$14, current_location_id=$15,
       last_known_location_id=CASE WHEN current_location_id IS DISTINCT FROM $15 THEN current_location_id ELSE last_known_location_id END,
       assigned_construction_site_id=$16, assigned_vehicle_id=$17,
       inspection_required=$18, last_inspection_on=$19, next_inspection_on=$20,
       maintenance_interval_days=$21, next_maintenance_on=$22, status=$23,
       retired_reason=$24
       WHERE company_id=$1 AND id=$2`,
      [
        context.companyId, deviceId,
        field("inventoryNumber", oldDevice.inventoryNumber),
        field("name", oldDevice.name), categoryId,
        field("manufacturer", oldDevice.manufacturer), field("model", oldDevice.model),
        field("serialNumber", oldDevice.serialNumber), field("purchaseDate", oldDevice.purchaseDate),
        field("purchasePriceCents", oldDevice.purchasePriceCents), field("supplier", oldDevice.supplier),
        field("warrantyUntil", oldDevice.warrantyUntil), field("condition", oldDevice.condition),
        field("note", oldDevice.note), field("locationId", oldDevice.currentLocation?.id || null),
        field("constructionSiteId", oldDevice.constructionSite?.id || null),
        field("vehicleId", oldDevice.vehicle?.id || null),
        field("inspectionRequired", oldDevice.inspectionRequired),
        field("lastInspectionOn", oldDevice.lastInspectionOn),
        field("nextInspectionOn", oldDevice.nextInspectionOn),
        field("maintenanceIntervalDays", oldDevice.maintenanceIntervalDays),
        field("nextMaintenanceOn", oldDevice.nextMaintenanceOn), status,
        status === "retired" ? input.retiredReason : null
      ]
    );
  } catch (error) {
    if (error.code === "23505") {
      throw new InputError("Inventarnummer oder Seriennummer ist bereits vergeben.", 409, "device_already_exists");
    }
    throw error;
  }
  if (status === "retired") {
    await endAssignment(client, context, await activeAssignment(client, context, deviceId, "custody"), "Gerät ausgemustert");
  }
  await upsertBattery(client, context, deviceId, input.battery, category.base_type);
  const next = await loadDevice(client, context, deviceId);
  await audit(
    client, context, deviceId,
    status === "retired" ? "device_retired" : "device_updated",
    oldDevice, next,
    input.retiredReason || "Gerätestammdaten geändert"
  );
  if (next.status === "lost" && oldDevice.status !== "lost") {
    await notify(
      client, context, next.fixedOwner?.id || context.userId, deviceId, "device_missing",
      `${next.name} wird vermisst`,
      `${next.inventoryNumber} wurde als verloren gemeldet.`,
      `lost:${deviceId}:${next.rowVersion}`
    );
  }
  return next;
}

async function listDevices(client, context, url, administrator = false) {
  if (administrator) await requireManager(client, context);
  const roles = await roleKeys(client, context);
  const manager = administrator || [...roles].some((role) => MANAGER_ROLES.has(role));
  const foreman = roles.has("foreman");
  const scope = url.searchParams.get("scope") || (manager ? "all" : foreman ? "site" : "mine");
  const search = (url.searchParams.get("search") || "").trim().slice(0, 100);
  const baseType = (url.searchParams.get("baseType") || "").trim();
  const status = (url.searchParams.get("status") || "").trim();
  // Bei einer firmenweiten Verwaltungsansicht wird nur company_id benötigt.
  // node-postgres lehnt zusätzliche Bindewerte ab ("bind message supplies 2
  // parameters, but prepared statement requires 1"). Die Benutzer-ID wird
  // deshalb erst ergänzt, wenn die Sicht tatsächlich darauf eingeschränkt
  // werden muss.
  const params = [context.companyId];
  const clauses = ["device.company_id = $1"];
  if (!manager || scope === "mine") {
    params.push(context.userId);
    const userParameter = `$${params.length}`;
    clauses.push(foreman && scope !== "mine"
      ? `(fixed_assignment.user_id = ${userParameter} OR custody.user_id = ${userParameter} OR EXISTS (
          SELECT 1 FROM site_supervisors AS supervisor
          WHERE supervisor.company_id=device.company_id
            AND supervisor.construction_site_id=device.assigned_construction_site_id
            AND supervisor.user_id=${userParameter} AND supervisor.status IN ('planned','active')
            AND supervisor.valid_from <= CURRENT_DATE
            AND (supervisor.valid_until IS NULL OR supervisor.valid_until >= CURRENT_DATE)
        ) OR EXISTS (
          SELECT 1 FROM site_assignments AS site_assignment
          WHERE site_assignment.company_id=device.company_id
            AND site_assignment.construction_site_id=device.assigned_construction_site_id
            AND site_assignment.user_id=${userParameter}
            AND site_assignment.status IN ('released','completed')
            AND site_assignment.work_date BETWEEN CURRENT_DATE - 1 AND CURRENT_DATE + 1
        ))`
      : `(fixed_assignment.user_id = ${userParameter} OR custody.user_id = ${userParameter})`);
  }
  if (search) {
    params.push(`%${search}%`);
    clauses.push(`(
      device.inventory_number ILIKE $${params.length} OR device.name ILIKE $${params.length}
      OR COALESCE(device.serial_number,'') ILIKE $${params.length}
      OR COALESCE(device.manufacturer,'') ILIKE $${params.length}
      OR COALESCE(fixed_user.first_name || ' ' || fixed_user.last_name,'') ILIKE $${params.length}
      OR COALESCE(custody_user.first_name || ' ' || custody_user.last_name,'') ILIKE $${params.length}
      OR COALESCE(site.name,'') ILIKE $${params.length}
      OR COALESCE(vehicle.licence_plate,'') ILIKE $${params.length}
    )`);
  }
  if (baseType && BASE_TYPES.has(baseType)) {
    params.push(baseType);
    clauses.push(`category.base_type = $${params.length}`);
  }
  if (status && DEVICE_STATUSES.has(status)) {
    params.push(status);
    clauses.push(`device.status = $${params.length}`);
  }
  const result = await client.query(
    `${DEVICE_SELECT} WHERE ${clauses.join(" AND ")}
     ORDER BY device.status = 'retired', category.name, device.name, device.inventory_number
     LIMIT 1000`,
    params
  );
  return result.rows.map((row) => deviceDto(row, context.userId, context.deviceToday));
}

async function dashboard(client, context) {
  const manager = await canManage(client, context);
  const all = await client.query(
    `SELECT COUNT(*) FILTER (WHERE device.status <> 'retired')::INTEGER AS total,
            COUNT(*) FILTER (WHERE device.status <> 'retired' AND category.base_type = 'battery')::INTEGER AS batteries,
            COUNT(*) FILTER (WHERE device.status IN ('fixed_assigned','loaned'))::INTEGER AS assigned,
            COUNT(*) FILTER (WHERE device.status = 'loaned')::INTEGER AS loaned,
            COUNT(*) FILTER (WHERE device.inspection_required
              AND device.status <> 'retired'
              AND device.next_inspection_on BETWEEN $2::DATE AND $2::DATE + 30)::INTEGER AS due,
            COUNT(*) FILTER (WHERE device.inspection_required
              AND device.next_inspection_on < $2::DATE AND device.status <> 'retired')::INTEGER AS overdue,
            COUNT(*) FILTER (WHERE device.status IN ('defective','locked','repair'))::INTEGER AS defective
     FROM devices AS device
     JOIN device_categories AS category
       ON category.company_id = device.company_id AND category.id = device.category_id
     WHERE device.company_id = $1`,
    [context.companyId, context.deviceToday || new Date().toISOString().slice(0, 10)]
  );
  const mine = await client.query(
    `SELECT
       COUNT(DISTINCT assignment.device_id) FILTER (WHERE assignment.assignment_type='custody')::INTEGER AS with_me,
       COUNT(DISTINCT assignment.device_id) FILTER (WHERE assignment.assignment_type='fixed')::INTEGER AS fixed,
       COUNT(DISTINCT fixed.device_id) FILTER (
         WHERE fixed.assignment_type='fixed' AND custody.user_id IS NOT NULL
           AND custody.user_id IS DISTINCT FROM $2
       )::INTEGER AS fixed_elsewhere
     FROM device_assignments AS assignment
     LEFT JOIN device_assignments AS fixed
       ON fixed.company_id=assignment.company_id AND fixed.device_id=assignment.device_id
      AND fixed.assignment_type='fixed' AND fixed.ended_at IS NULL AND fixed.user_id=$2
     LEFT JOIN device_assignments AS custody
       ON custody.company_id=assignment.company_id AND custody.device_id=assignment.device_id
      AND custody.assignment_type='custody' AND custody.ended_at IS NULL
     WHERE assignment.company_id=$1 AND assignment.user_id=$2 AND assignment.ended_at IS NULL`,
    [context.companyId, context.userId]
  );
  return {
    canManage: manager,
    canInventory: [...await roleKeys(client, context)].some((role) => INVENTORY_ROLES.has(role)),
    company: manager ? all.rows[0] : null,
    mine: mine.rows[0]
  };
}

async function contexts(client, context) {
  const [employees, categories, locations, sites, vehicles, settings] = await Promise.all([
    client.query(
      `SELECT id, personnel_number, first_name || ' ' || last_name AS name
       FROM users WHERE company_id=$1 AND status='active' ORDER BY last_name, first_name`,
      [context.companyId]
    ),
    client.query(
      `SELECT id, category_key, name, base_type, is_system, status, row_version
       FROM device_categories WHERE company_id=$1 ORDER BY status, name`, [context.companyId]
    ),
    client.query(
      `SELECT id, name, location_type, construction_site_id, vehicle_id, status, row_version
       FROM device_locations WHERE company_id=$1 ORDER BY status, name`, [context.companyId]
    ),
    client.query(
      `SELECT id, name FROM construction_sites
       WHERE company_id=$1 AND status IN ('planned','active','on_hold','delayed') ORDER BY name`,
      [context.companyId]
    ),
    client.query(
      `SELECT id, licence_plate AS name FROM vehicles
       WHERE company_id=$1 AND status <> 'retired' ORDER BY licence_plate`, [context.companyId]
    ),
    client.query(
      `SELECT inspection_warning_days, long_loan_days, lock_overdue_inspections,
              default_storage_location_id, row_version
       FROM device_settings WHERE company_id=$1`, [context.companyId]
    )
  ]);
  return {
    employees: employees.rows.map((row) => ({
      id: row.id, personnelNumber: row.personnel_number, name: row.name
    })),
    categories: categories.rows.map((row) => ({
      id: row.id, key: row.category_key, name: row.name, baseType: row.base_type,
      system: row.is_system, status: row.status, rowVersion: Number(row.row_version)
    })),
    locations: locations.rows.map((row) => ({
      id: row.id, name: row.name, type: row.location_type,
      constructionSiteId: row.construction_site_id, vehicleId: row.vehicle_id,
      status: row.status, rowVersion: Number(row.row_version)
    })),
    sites: sites.rows,
    vehicles: vehicles.rows,
    settings: settings.rows[0] ? {
      inspectionWarningDays: settings.rows[0].inspection_warning_days,
      longLoanDays: settings.rows[0].long_loan_days,
      lockOverdueInspections: settings.rows[0].lock_overdue_inspections,
      defaultStorageLocationId: settings.rows[0].default_storage_location_id,
      rowVersion: Number(settings.rows[0].row_version)
    } : null
  };
}

async function notify(client, context, recipientUserId, deviceId, type, title, message, sourceKey) {
  if (!recipientUserId) return;
  await client.query(
    `INSERT INTO device_notifications (
       company_id, recipient_user_id, device_id, notification_type, title, message, source_key
     ) VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (company_id, recipient_user_id, source_key) DO NOTHING`,
    [context.companyId, recipientUserId, deviceId, type, title, message, sourceKey]
  );
}

async function transferDevice(client, context, deviceId, input, internalAction = null) {
  // Eine Offline-ID wird vor dem Gerätesatz serialisiert. So kann derselbe
  // manipulierte Vorgang auch auf zwei unterschiedlichen Geräten nie doppelt
  // geschrieben werden.
  await client.query(
    `SELECT pg_advisory_xact_lock(hashtextextended($1::TEXT, 0))`,
    [input.clientOperationId]
  );
  const previousOperation = await client.query(
    `SELECT id,device_id FROM device_transfers
     WHERE company_id=$1 AND client_operation_id=$2`,
    [context.companyId, input.clientOperationId]
  );
  if (previousOperation.rowCount) {
    if (previousOperation.rows[0].device_id !== deviceId) {
      throw new InputError("Die Offline-ID wurde bereits für ein anderes Gerät verwendet.", 409, "device_operation_collision");
    }
    return { transferId: previousOperation.rows[0].id, idempotent: true, device: await loadDevice(client, context, deviceId) };
  }
  const locked = await lockDevice(client, context, deviceId);
  // Zwei identische Offline-Wiederholungen können vor demselben Row-Lock
  // beginnen. Nach dem Warten ist die erste Übergabe bereits sichtbar; dann
  // antworten wir idempotent statt mit einem Scheinkonflikt.
  const committedOperation = await client.query(
    `SELECT id,device_id FROM device_transfers
     WHERE company_id=$1 AND client_operation_id=$2`,
    [context.companyId, input.clientOperationId]
  );
  if (committedOperation.rowCount) {
    if (committedOperation.rows[0].device_id !== deviceId) {
      throw new InputError("Die Offline-ID wurde bereits für ein anderes Gerät verwendet.", 409, "device_operation_collision");
    }
    return { transferId: committedOperation.rows[0].id, idempotent: true, device: await loadDevice(client, context, deviceId) };
  }
  const expected = input.expectedRowVersion || Number(locked.row_version);
  if (Number(locked.row_version) !== expected) {
    throw new InputError(
      "Das Gerät wurde bereits von jemand anderem übernommen. Der aktuelle Stand wurde geschützt.",
      409,
      "device_transfer_conflict"
    );
  }
  const manager = await canManage(client, context);
  const fixed = await activeAssignment(client, context, deviceId, "fixed");
  const custody = await activeAssignment(client, context, deviceId, "custody");
  const action = internalAction || input.action;
  if (locked.status === "retired") {
    throw new InputError("Das Gerät ist ausgemustert und darf nicht mehr zugeordnet werden.", 409, "device_retired");
  }
  if ((BLOCKING_STATUSES.has(locked.status) || locked.inspection_blocked)
      && action !== "administrative_correction") {
    throw new InputError("Das Gerät ist gesperrt und darf nicht übernommen werden.", 409, "device_blocked");
  }
  if (["handover", "return_fixed_owner", "return_storage", "leave_site"].includes(action)
      && custody?.user_id !== context.userId && !manager) {
    throw new InputError("Nur der aktuelle Besitzer darf das Gerät weitergeben.", 403, "device_not_holder");
  }
  if (["move_location", "administrative_correction"].includes(action) && !manager) {
    throw new InputError("Diese Änderung ist nur in der Geräteverwaltung erlaubt.", 403, "device_manage_forbidden");
  }
  if (action === "takeover" && custody?.user_id === context.userId) {
    throw new InputError("Das Gerät ist bereits dir zugeordnet.", 409, "device_already_holder");
  }
  let targetUserId = null;
  let targetLocation = null;
  let siteId = input.constructionSiteId || locked.assigned_construction_site_id || null;
  if (["automatic_claim", "takeover"].includes(action)) targetUserId = context.userId;
  if (action === "handover") {
    if (!input.toUserId) throw new InputError("Bitte einen Mitarbeiter auswählen.");
    if (input.toUserId === custody?.user_id) {
      throw new InputError(
        "Das Gerät ist diesem Mitarbeiter bereits zugeordnet.", 409, "device_already_holder"
      );
    }
    targetUserId = input.toUserId;
  }
  if (action === "return_fixed_owner") {
    if (!fixed) throw new InputError("Das Gerät hat keinen festen Besitzer.", 409, "device_without_fixed_owner");
    targetUserId = fixed.user_id;
  }
  if (action === "return_storage") {
    targetLocation = await ensureLocation(client, context, input.locationId)
      || await defaultStorage(client, context);
    if (!targetLocation) throw new InputError("Bitte einen Lagerstandort auswählen.");
  }
  if (action === "leave_site") {
    if (!siteId) throw new InputError("Bitte eine Baustelle auswählen.");
    const site = await client.query(
      `SELECT id, name FROM construction_sites
       WHERE company_id=$1 AND id=$2 AND status IN ('planned','active','on_hold','delayed')`,
      [context.companyId, siteId]
    );
    if (site.rowCount !== 1) throw new InputError("Die Baustelle wurde nicht gefunden.");
    const location = await client.query(
      `INSERT INTO device_locations (company_id,name,location_type,construction_site_id)
       VALUES ($1,$2,'construction_site',$3)
       ON CONFLICT (company_id, construction_site_id) WHERE construction_site_id IS NOT NULL AND status='active'
       DO UPDATE SET name=EXCLUDED.name
       RETURNING id,name,location_type,construction_site_id,vehicle_id`,
      [context.companyId, site.rows[0].name, siteId]
    );
    targetLocation = location.rows[0];
  }
  if (action === "move_location" || action === "administrative_correction") {
    targetLocation = await ensureLocation(client, context, input.locationId);
    targetUserId = input.toUserId || null;
    siteId = targetLocation?.construction_site_id || input.constructionSiteId || null;
  }
  if (targetUserId) await ensureActiveUser(client, context, targetUserId);

  await endAssignment(client, context, custody, `Übergabe: ${action}`);
  if (targetUserId) {
    await addAssignment(
      client, context, deviceId, "custody", targetUserId,
      input.offline ? "offline_sync"
        : action === "administrative_correction" ? "administration"
          : action === "handover" ? "handover" : "qr_scan",
      input.clientOperationId
    );
  }
  const nextStatus = action === "leave_site" ? "on_site"
    : action === "return_storage" || (targetLocation && !targetUserId) ? "in_storage"
      : targetUserId === fixed?.user_id ? "fixed_assigned" : targetUserId ? "loaned" : "available";
  const updated = await client.query(
    `UPDATE devices SET
       last_known_location_id=COALESCE(current_location_id,last_known_location_id),
       current_location_id=$3,
       assigned_construction_site_id=$4,
       assigned_vehicle_id=$5,
       status=$6
     WHERE company_id=$1 AND id=$2 RETURNING row_version`,
    [
      context.companyId, deviceId,
      targetLocation?.id || (targetUserId ? null : locked.current_location_id),
      action === "return_storage" ? null : siteId,
      targetLocation?.vehicle_id || null,
      nextStatus
    ]
  );
  const transfer = await client.query(
    `INSERT INTO device_transfers (
       company_id,device_id,action,from_user_id,to_user_id,from_location_id,
       to_location_id,construction_site_id,actor_user_id,client_operation_id,
       device_row_version_before,device_row_version_after,client_created_at,
       condition_key,note
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING id,occurred_at`,
    [
      context.companyId, deviceId, action, custody?.user_id || null, targetUserId,
      locked.current_location_id, targetLocation?.id || null, siteId, context.userId,
      input.clientOperationId, Number(locked.row_version), Number(updated.rows[0].row_version),
      input.clientCreatedAt || null, locked.condition_key, input.note
    ]
  );
  const next = await loadDevice(client, context, deviceId);
  await audit(
    client, context, deviceId,
    action === "return_fixed_owner" || action === "return_storage"
      ? "device_returned"
      : action === "administrative_correction"
        ? "device_administratively_corrected"
        : "device_transferred",
    { userId: custody?.user_id || null, locationId: locked.current_location_id },
    { userId: targetUserId, locationId: targetLocation?.id || null },
    input.note || action,
    input.offline ? "offline_sync" : action === "administrative_correction" ? "api" : "qr_scan",
    transfer.rows[0].id
  );
  if (fixed?.user_id && targetUserId && targetUserId !== fixed.user_id) {
    await notify(
      client, context, fixed.user_id, deviceId, "fixed_device_taken",
      `${next.name} wurde übernommen`,
      `${next.currentOwner?.name || "Ein Mitarbeiter"} hat dein Gerät ${next.inventoryNumber} übernommen.`,
      `taken:${transfer.rows[0].id}`
    );
  }
  if (fixed?.user_id && custody?.user_id !== fixed.user_id
      && (targetUserId === fixed.user_id || action === "return_storage")) {
    await notify(
      client, context, fixed.user_id, deviceId, "fixed_device_returned",
      `${next.name} wurde zurückgegeben`,
      action === "return_storage"
        ? `Dein Gerät ${next.inventoryNumber} liegt jetzt bei ${targetLocation?.name || "einem Lagerstandort"}.`
        : `Dein Gerät ${next.inventoryNumber} ist wieder dir zugeordnet.`,
      `returned:${transfer.rows[0].id}`
    );
  }
  return { transferId: transfer.rows[0].id, idempotent: false, device: next };
}

async function scanDevice(client, context, input) {
  const token = normalizeDeviceQrToken(input.token);
  const operationId = validateId(input.clientOperationId, "Scan-ID");
  const resolved = await client.query(
    `SELECT token.device_id
     FROM device_qr_tokens AS token
     JOIN devices AS device ON device.company_id=token.company_id AND device.id=token.device_id
     WHERE token.company_id=$1 AND token.public_token=$2 AND token.is_active`,
    [context.companyId, token]
  );
  if (resolved.rowCount !== 1) {
    throw new InputError("Der QR-Code ist unbekannt, widerrufen oder gehört nicht zu dieser Firma.", 404, "device_qr_unknown");
  }
  const deviceId = resolved.rows[0].device_id;
  const locked = await lockDevice(client, context, deviceId);
  const device = await loadDevice(client, context, deviceId);
  if (device.blocked || device.status === "retired") {
    return { outcome: "blocked", automatic: false, device };
  }
  if (device.currentOwner?.id === context.userId) {
    return { outcome: "already_yours", automatic: false, device };
  }
  const belongsToOther = device.fixedOwner && device.fixedOwner.id !== context.userId;
  const heldByOther = Boolean(device.currentOwner && device.currentOwner.id !== context.userId);
  if (belongsToOther || heldByOther) {
    return { outcome: "confirmation_required", automatic: false, device };
  }
  const result = await transferDevice(client, context, deviceId, {
    action: "takeover",
    clientOperationId: operationId,
    expectedRowVersion: Number(locked.row_version),
    clientCreatedAt: optionalTimestamp(input.clientCreatedAt, "Erfassungszeit"),
    note: "Automatische Übernahme durch QR-Scan",
    offline: input.offline === true
  }, "automatic_claim");
  return { outcome: "assigned", automatic: true, ...result };
}

async function qrRecord(client, context, deviceId, rotate = false, reason = null) {
  await requireManager(client, context);
  await lockDevice(client, context, deviceId);
  let current = await client.query(
    `SELECT id,public_token,generation FROM device_qr_tokens
     WHERE company_id=$1 AND device_id=$2 AND is_active FOR UPDATE`,
    [context.companyId, deviceId]
  );
  const previousGeneration = Number(current.rows[0]?.generation || 0);
  if (rotate && current.rowCount) {
    await client.query(
      `UPDATE device_qr_tokens SET is_active=FALSE,revoked_by_user_id=$3,
              revoked_at=CURRENT_TIMESTAMP,revoke_reason=$4
       WHERE company_id=$1 AND id=$2`,
      [context.companyId, current.rows[0].id, context.userId, reason || "QR-Code ersetzt"]
    );
    current = { rowCount: 0, rows: [] };
  }
  if (!current.rowCount) {
    const generation = rotate ? previousGeneration + 1 : 1;
    current = await client.query(
      `INSERT INTO device_qr_tokens (company_id,device_id,generation,created_by_user_id)
       VALUES ($1,$2,$3,$4) RETURNING id,public_token,generation`,
      [context.companyId, deviceId, generation, context.userId]
    );
    await audit(client, context, deviceId, rotate ? "device_qr_rotated" : "device_qr_created",
      null, { generation: current.rows[0].generation }, reason || "QR-Code erzeugt");
  }
  if (rotate) {
    // Ein widerrufener Aufkleber macht auch ältere Offline-Übernahmen
    // ungültig; die Gerätestandsversion ist Teil jeder Übergabe.
    await client.query(
      `UPDATE devices SET updated_at=CURRENT_TIMESTAMP WHERE company_id=$1 AND id=$2`,
      [context.companyId, deviceId]
    );
  }
  return current.rows[0];
}

async function qrDocument(client, context, deviceId, allowedOrigin) {
  const device = await loadDevice(client, context, deviceId);
  const qr = await qrRecord(client, context, deviceId);
  const target = new URL("/", allowedOrigin);
  target.searchParams.set("device", qr.public_token);
  const svg = await qrToString(target.toString(), {
    type: "svg", errorCorrectionLevel: "M", margin: 2, width: 480,
    color: { dark: "#111111ff", light: "#ffffffff" }
  });
  return {
    fileName: `${device.inventoryNumber.replace(/[^A-Za-z0-9._-]+/g, "-") || "Geraet"}-QR.svg`,
    mimeType: "image/svg+xml; charset=utf-8",
    content: Buffer.from(svg, "utf8"),
    target: target.toString(),
    svg,
    label: `${device.name} · ${device.inventoryNumber}`
  };
}

function decodeImage(dataUrl) {
  if (!dataUrl) return null;
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw new InputError("Das Foto muss JPEG, PNG oder WebP sein.");
  const content = Buffer.from(match[2], "base64");
  if (!content.length || content.length > 3_000_000) {
    throw new InputError("Das Foto darf höchstens 3 MB groß sein.", 413, "device_photo_too_large");
  }
  return { mimeType: match[1], content, sha256: createHash("sha256").update(content).digest("hex") };
}

async function storeImage(client, context, deviceId, kind, dataUrl, defectId = null) {
  const image = decodeImage(dataUrl);
  if (!image) return null;
  const result = await client.query(
    `INSERT INTO device_images (
       company_id,device_id,defect_id,image_kind,mime_type,size_bytes,sha256_hex,content,uploaded_by_user_id
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [
      context.companyId, deviceId, defectId, kind, image.mimeType,
      image.content.length, image.sha256, image.content, context.userId
    ]
  );
  return result.rows[0].id;
}

async function deviceImage(client, context, deviceId) {
  await loadDevice(client, context, deviceId);
  const result = await client.query(
    `SELECT mime_type,content FROM device_images
     WHERE company_id=$1 AND device_id=$2 AND image_kind='device'
     ORDER BY created_at DESC,id DESC LIMIT 1`,
    [context.companyId, deviceId]
  );
  if (!result.rowCount) throw new InputError("Für dieses Gerät ist kein Foto hinterlegt.", 404, "device_photo_not_found");
  return {
    fileName: `${deviceId}.bild`, mimeType: result.rows[0].mime_type,
    content: result.rows[0].content, disposition: "inline"
  };
}

async function reportDefect(client, context, deviceId, input) {
  const locked = await lockDevice(client, context, deviceId);
  if (locked.status === "retired") {
    throw new InputError(
      "Ein ausgemustertes Gerät kann nicht mehr geändert werden.", 409, "device_retired"
    );
  }
  const defect = await client.query(
    `INSERT INTO device_defects (
       company_id,device_id,reported_by_user_id,description,severity,usable
     ) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,reported_at`,
    [context.companyId, deviceId, context.userId, input.description, input.severity, input.usable]
  );
  const imageId = await storeImage(client, context, deviceId, "defect", input.photoDataUrl, defect.rows[0].id);
  await client.query(
    `UPDATE devices SET condition_key=$3,status=$4
     WHERE company_id=$1 AND id=$2`,
    [
      context.companyId, deviceId,
      input.usable ? "damaged" : "defective",
      input.usable ? locked.status : "locked"
    ]
  );
  const next = await loadDevice(client, context, deviceId);
  await audit(client, context, deviceId, "device_defect_reported",
    { status: locked.status, condition: locked.condition_key },
    { status: next.status, defectId: defect.rows[0].id, imageId }, input.description,
    "qr_scan", defect.rows[0].id);
  const fixed = await activeAssignment(client, context, deviceId, "fixed");
  if (fixed?.user_id !== context.userId) {
    await notify(client, context, fixed?.user_id, deviceId, "defect_reported",
      `${next.name} als defekt gemeldet`, input.description, `defect:${defect.rows[0].id}`);
  }
  const managers = await client.query(
    `SELECT DISTINCT account.id
     FROM users AS account
     JOIN user_roles AS assignment ON assignment.company_id=account.company_id AND assignment.user_id=account.id
     JOIN roles AS role ON role.company_id=assignment.company_id AND role.id=assignment.role_id
     WHERE account.company_id=$1 AND account.status='active' AND assignment.revoked_at IS NULL
       AND role.role_key = ANY($2::VARCHAR[])`,
    [context.companyId, [...MANAGER_ROLES]]
  );
  for (const manager of managers.rows) {
    if (manager.id !== context.userId && manager.id !== fixed?.user_id) {
      await notify(client, context, manager.id, deviceId, "defect_reported",
        `${next.name} als defekt gemeldet`, input.description, `defect:${defect.rows[0].id}`);
    }
  }
  return { id: defect.rows[0].id, imageId, device: next };
}

async function resolveDefect(client, context, defectId, body) {
  await requireManager(client, context);
  const rowVersion = optionalInteger(body.rowVersion, "Zeilenversion", 1, Number.MAX_SAFE_INTEGER);
  if (!rowVersion) throw new InputError("Für die Reparatur fehlt der aktuelle Meldungsstand.");
  const note = requiredText(body.resolutionNote, "Reparaturvermerk", 2000, 3);
  const current = await client.query(
    `SELECT id,device_id,status,row_version FROM device_defects
     WHERE company_id=$1 AND id=$2 FOR UPDATE`, [context.companyId, defectId]
  );
  if (!current.rowCount) throw new InputError("Die Defektmeldung wurde nicht gefunden.", 404, "device_defect_not_found");
  if (current.rows[0].status === "resolved") {
    throw new InputError("Die Defektmeldung ist bereits abgeschlossen.", 409, "device_defect_resolved");
  }
  if (rowVersion && Number(current.rows[0].row_version) !== rowVersion) {
    throw new InputError("Die Defektmeldung wurde bereits geändert.", 409, "device_defect_changed");
  }
  await client.query(
    `UPDATE device_defects SET status='resolved',resolved_by_user_id=$3,
            resolved_at=CURRENT_TIMESTAMP,resolution_note=$4,row_version=row_version+1
     WHERE company_id=$1 AND id=$2`,
    [context.companyId, defectId, context.userId, note]
  );
  const deviceId = current.rows[0].device_id;
  const custody = await activeAssignment(client, context, deviceId, "custody");
  const fixed = await activeAssignment(client, context, deviceId, "fixed");
  const device = await lockDevice(client, context, deviceId);
  const safety = await safetyState(client, context, deviceId);
  const nextStatus = device.status === "retired" ? "retired"
    : safety.unsafe_defect || safety.failed_inspection ? "locked"
    : fixed && custody?.user_id === fixed.user_id ? "fixed_assigned"
      : custody ? "loaned" : device.current_location_id ? "in_storage" : "available";
  await client.query(
    `UPDATE devices SET condition_key=$3,status=$4 WHERE company_id=$1 AND id=$2`,
    [
      context.companyId, deviceId,
      safety.unsafe_defect ? "defective" : safety.open_defect ? "damaged" : "ok",
      nextStatus
    ]
  );
  await audit(client, context, deviceId, "device_repaired",
    { defectId, status: current.rows[0].status }, { defectId, status: "resolved" }, note,
    "api", defectId);
  return loadDevice(client, context, deviceId);
}

async function recordInspection(client, context, deviceId, input) {
  await requireManager(client, context);
  const locked = await lockDevice(client, context, deviceId);
  if (locked.status === "retired") {
    throw new InputError(
      "Für ein ausgemustertes Gerät kann keine neue Prüfung erfasst werden.", 409, "device_retired"
    );
  }
  if (!input.inspectorUserId && !input.inspectorName) {
    const actor = await ensureActiveUser(client, context, context.userId);
    input.inspectorUserId = actor.id;
  }
  if (input.inspectorUserId) await ensureActiveUser(client, context, input.inspectorUserId);
  const inspection = await client.query(
    `INSERT INTO device_inspections (
       company_id,device_id,inspection_type,inspected_on,inspector_user_id,
       inspector_name,result,next_inspection_on,interval_days,protocol_document_id,
       note,created_by_user_id
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING id`,
    [
      context.companyId, deviceId, input.inspectionType, input.inspectedOn,
      input.inspectorUserId, input.inspectorName, input.result, input.nextInspectionOn,
      input.intervalDays, input.protocolDocumentId, input.note, context.userId
    ]
  );
  const custody = await activeAssignment(client, context, deviceId, "custody");
  const fixed = await activeAssignment(client, context, deviceId, "fixed");
  const safety = await safetyState(client, context, deviceId);
  const status = input.result === "failed" || safety.unsafe_defect ? "locked"
    : ["lost", "repair", "defective"].includes(locked.status) ? locked.status
      : fixed && custody?.user_id === fixed.user_id ? "fixed_assigned"
        : custody ? "loaned" : locked.current_location_id ? "in_storage" : "available";
  await client.query(
    `UPDATE devices SET inspection_required=TRUE,last_inspection_on=$3,
            next_inspection_on=$4,status=$5,
            condition_key=CASE
              WHEN $6='failed' THEN 'defective'
              WHEN NOT $7::BOOLEAN AND condition_key='defective' THEN 'ok'
              ELSE condition_key
            END
     WHERE company_id=$1 AND id=$2`,
    [
      context.companyId, deviceId, input.inspectedOn, input.nextInspectionOn,
      status, input.result, safety.open_defect
    ]
  );
  const next = await loadDevice(client, context, deviceId);
  await audit(client, context, deviceId, "device_inspected",
    { status: locked.status }, { inspectionId: inspection.rows[0].id, result: input.result, status },
    input.note || input.inspectionType, "api", inspection.rows[0].id);
  return { id: inspection.rows[0].id, device: next };
}

async function history(client, context, deviceId) {
  await loadDevice(client, context, deviceId);
  const [events, transfers, inspections, defects] = await Promise.all([
    client.query(
      `SELECT history.id,history.action,history.old_state,history.new_state,history.reason,
              history.source_type,history.source_id,history.occurred_at,
              account.first_name || ' ' || account.last_name AS actor_name
       FROM device_history AS history
       JOIN users AS account ON account.company_id=history.company_id AND account.id=history.actor_user_id
       WHERE history.company_id=$1 AND history.device_id=$2
       ORDER BY history.occurred_at DESC,history.id DESC LIMIT 250`, [context.companyId, deviceId]
    ),
    client.query(
      `SELECT transfer.id,transfer.action,transfer.occurred_at,transfer.condition_key,transfer.note,
              old_user.first_name || ' ' || old_user.last_name AS from_name,
              new_user.first_name || ' ' || new_user.last_name AS to_name,
              old_location.name AS from_location,new_location.name AS to_location,site.name AS site_name
       FROM device_transfers AS transfer
       LEFT JOIN users AS old_user ON old_user.company_id=transfer.company_id AND old_user.id=transfer.from_user_id
       LEFT JOIN users AS new_user ON new_user.company_id=transfer.company_id AND new_user.id=transfer.to_user_id
       LEFT JOIN device_locations AS old_location ON old_location.company_id=transfer.company_id AND old_location.id=transfer.from_location_id
       LEFT JOIN device_locations AS new_location ON new_location.company_id=transfer.company_id AND new_location.id=transfer.to_location_id
       LEFT JOIN construction_sites AS site ON site.company_id=transfer.company_id AND site.id=transfer.construction_site_id
       WHERE transfer.company_id=$1 AND transfer.device_id=$2
       ORDER BY transfer.occurred_at DESC`, [context.companyId, deviceId]
    ),
    client.query(
      `SELECT id,inspection_type,inspected_on,inspector_name,result,next_inspection_on,note,created_at
       FROM device_inspections WHERE company_id=$1 AND device_id=$2 ORDER BY inspected_on DESC,created_at DESC`,
      [context.companyId, deviceId]
    ),
    client.query(
      `SELECT id,description,severity,usable,status,reported_at,resolved_at,resolution_note,row_version
       FROM device_defects WHERE company_id=$1 AND device_id=$2 ORDER BY reported_at DESC`,
      [context.companyId, deviceId]
    )
  ]);
  return { events: events.rows, transfers: transfers.rows, inspections: inspections.rows, defects: defects.rows };
}

async function ensureInspectionNotifications(client, context) {
  const settings = await client.query(
    `SELECT inspection_warning_days,long_loan_days FROM device_settings WHERE company_id=$1`, [context.companyId]
  );
  const manager = await canManage(client, context);
  const days = settings.rows[0]?.inspection_warning_days ?? 30;
  const due = await client.query(
    `SELECT device.id,device.name,device.inventory_number,device.next_inspection_on,
            fixed.user_id AS fixed_owner_user_id
     FROM devices AS device
     LEFT JOIN device_assignments AS fixed
       ON fixed.company_id=device.company_id AND fixed.device_id=device.id
      AND fixed.assignment_type='fixed' AND fixed.ended_at IS NULL
     WHERE device.company_id=$1 AND device.status <> 'retired'
       AND device.inspection_required AND device.next_inspection_on <= $3::DATE + $2::INTEGER`,
    [context.companyId, days, context.deviceToday || new Date().toISOString().slice(0, 10)]
  );
  for (const device of due.rows) {
    if (!device.fixed_owner_user_id && !manager) continue;
    const inspectionDate = databaseDateKey(device.next_inspection_on);
    const overdue = inspectionDate
      < (context.deviceToday || new Date().toISOString().slice(0, 10));
    await notify(
      client, context, device.fixed_owner_user_id || context.userId, device.id,
      overdue ? "inspection_overdue" : "inspection_due",
      `${device.name}: Prüfung ${overdue ? "überfällig" : "bald fällig"}`,
      `${device.inventory_number} · Termin ${inspectionDate}`,
      `inspection:${overdue ? "overdue" : "due"}:${device.id}:${inspectionDate}`
    );
  }
  const longLoanDays = settings.rows[0]?.long_loan_days ?? 14;
  const loans = await client.query(
    `SELECT device.id,device.name,device.inventory_number,custody.started_at,
            custody.user_id AS current_owner_user_id,
            holder.first_name || ' ' || holder.last_name AS current_owner_name,
            fixed.user_id AS fixed_owner_user_id
     FROM devices AS device
     JOIN device_assignments AS custody
       ON custody.company_id=device.company_id AND custody.device_id=device.id
      AND custody.assignment_type='custody' AND custody.ended_at IS NULL
     LEFT JOIN device_assignments AS fixed
       ON fixed.company_id=device.company_id AND fixed.device_id=device.id
      AND fixed.assignment_type='fixed' AND fixed.ended_at IS NULL
     JOIN users AS holder ON holder.company_id=custody.company_id AND holder.id=custody.user_id
     WHERE device.company_id=$1 AND device.status <> 'retired'
       AND custody.started_at < CURRENT_TIMESTAMP - ($2::TEXT || ' days')::INTERVAL
       AND custody.user_id IS DISTINCT FROM fixed.user_id
       AND (fixed.user_id=$3 OR ($4::BOOLEAN AND fixed.user_id IS NULL))`,
    [context.companyId, longLoanDays, context.userId, manager]
  );
  for (const device of loans.rows) {
    await notify(
      client, context, device.fixed_owner_user_id || context.userId, device.id, "long_loan",
      `${device.name} ungewöhnlich lange ausgeliehen`,
      `${device.inventory_number} ist seit mehr als ${longLoanDays} Tagen bei ${device.current_owner_name}.`,
      `long-loan:${device.id}:${String(device.started_at).slice(0, 10)}`
    );
  }
}

async function notifications(client, context) {
  await ensureInspectionNotifications(client, context);
  // Der faellige FI-Test eines Baustromverteilers gehoert in dieselbe Glocke:
  // ein Verteiler ist ein Geraet, und zwei Glocken waeren eine zu viel. Die
  // Frist selbst rechnet der Baustrombereich, weil sie dort hingehoert.
  await ensureRcdNotifications(
    client, context,
    context.deviceToday || new Date().toISOString().slice(0, 10),
    { manager: await canManage(client, context) }
  );
  const result = await client.query(
    `SELECT notification.id,notification.notification_type,notification.title,
            notification.message,notification.created_at,notification.read_at,
            device.id AS device_id,device.inventory_number,device.name AS device_name
     FROM device_notifications AS notification
     JOIN devices AS device ON device.company_id=notification.company_id AND device.id=notification.device_id
     WHERE notification.company_id=$1 AND notification.recipient_user_id=$2
     ORDER BY notification.read_at NULLS FIRST,notification.created_at DESC LIMIT 100`,
    [context.companyId, context.userId]
  );
  return result.rows.map((row) => ({
    id: row.id, type: row.notification_type, title: row.title, message: row.message,
    createdAt: row.created_at, readAt: row.read_at,
    device: { id: row.device_id, inventoryNumber: row.inventory_number, name: row.device_name }
  }));
}

async function readNotification(client, context, notificationId) {
  const result = await client.query(
    `UPDATE device_notifications SET read_at=COALESCE(read_at,CURRENT_TIMESTAMP)
     WHERE company_id=$1 AND id=$2 AND recipient_user_id=$3 RETURNING id,read_at`,
    [context.companyId, notificationId, context.userId]
  );
  if (!result.rowCount) throw new InputError("Die Benachrichtigung wurde nicht gefunden.", 404, "device_notification_not_found");
  return result.rows[0];
}

async function createCategory(client, context, body) {
  await requireManager(client, context);
  const key = requiredText(body.key, "Kategorieschlüssel", 60).toLowerCase();
  if (!/^[a-z][a-z0-9_]*$/.test(key)) throw new InputError("Der Kategorieschlüssel ist ungültig.");
  const baseType = requiredText(body.baseType, "Grundtyp", 30).toLowerCase();
  if (!BASE_TYPES.has(baseType)) throw new InputError("Der Kategorie-Grundtyp ist ungültig.");
  let result;
  try {
    result = await client.query(
      `INSERT INTO device_categories (company_id,category_key,name,base_type)
       VALUES ($1,$2,$3,$4) RETURNING id,category_key,name,base_type,is_system,status,row_version`,
      [context.companyId, key, requiredText(body.name, "Kategoriename", 100), baseType]
    );
  } catch (error) {
    if (error.code === "23505") {
      throw new InputError("Diese Gerätekategorie gibt es bereits.", 409, "device_category_exists");
    }
    throw error;
  }
  const row = result.rows[0];
  return {
    id: row.id, key: row.category_key, name: row.name, baseType: row.base_type,
    system: row.is_system, status: row.status, rowVersion: Number(row.row_version)
  };
}

async function createLocation(client, context, body) {
  await requireManager(client, context);
  const type = requiredText(body.type, "Standorttyp", 30).toLowerCase();
  if (!["warehouse", "workshop", "construction_site", "vehicle", "other"].includes(type)) {
    throw new InputError("Der Standorttyp ist ungültig.");
  }
  const siteId = optionalId(body.constructionSiteId, "Baustelle");
  const vehicleId = optionalId(body.vehicleId, "Fahrzeug");
  if ((type === "construction_site") !== Boolean(siteId)
      || (type === "vehicle") !== Boolean(vehicleId)
      || (siteId && vehicleId)) {
    throw new InputError("Standorttyp und zugeordnetes Ziel passen nicht zusammen.");
  }
  await ensureConstructionSite(client, context, siteId);
  await ensureVehicle(client, context, vehicleId);
  let result;
  try {
    result = await client.query(
      `INSERT INTO device_locations (
         company_id,name,location_type,construction_site_id,vehicle_id,note
       ) VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id,name,location_type,construction_site_id,vehicle_id,status,row_version`,
      [context.companyId, requiredText(body.name, "Standortname", 140), type, siteId, vehicleId,
        optionalText(body.note, "Standortnotiz", 1000)]
    );
  } catch (error) {
    if (error.code === "23505") {
      throw new InputError("Diesen Gerätestandort gibt es bereits.", 409, "device_location_exists");
    }
    if (error.code === "23503") {
      throw new InputError("Baustelle oder Fahrzeug wurde nicht gefunden.", 404, "device_location_target_not_found");
    }
    throw error;
  }
  return result.rows[0];
}

async function uploadProfilePhoto(client, context, deviceId, body) {
  await requireManager(client, context);
  await loadDevice(client, context, deviceId);
  const imageId = await storeImage(
    client, context, deviceId, "device", requiredText(body.dataUrl, "Foto", 4_100_000)
  );
  await audit(client, context, deviceId, "device_photo_added", null, { imageId }, "Gerätefoto aktualisiert");
  return { imageId, photoUrl: `./api/v1/devices/${deviceId}/photo` };
}

async function startInventory(client, context, body) {
  await requireInventory(client, context);
  const locationId = validateId(body.locationId, "Inventurstandort");
  await ensureLocation(client, context, locationId);
  const session = await client.query(
    `INSERT INTO device_inventory_sessions (company_id,location_id,started_by_user_id,note)
     VALUES ($1,$2,$3,$4) RETURNING id,status,started_at,row_version`,
    [context.companyId, locationId, context.userId, optionalText(body.note, "Inventurnotiz", 1000)]
  );
  await client.query(
    `INSERT INTO device_inventory_expected (
       company_id,inventory_session_id,device_id,expected_user_id,expected_location_id
     )
     SELECT device.company_id,$2,device.id,custody.user_id,device.current_location_id
     FROM devices AS device
     LEFT JOIN device_assignments AS custody
       ON custody.company_id=device.company_id AND custody.device_id=device.id
      AND custody.assignment_type='custody' AND custody.ended_at IS NULL
     WHERE device.company_id=$1 AND device.current_location_id=$3 AND device.status <> 'retired'`,
    [context.companyId, session.rows[0].id, locationId]
  );
  return session.rows[0];
}

async function inventoryScan(client, context, sessionId, body) {
  await requireInventory(client, context);
  const token = normalizeDeviceQrToken(body.token);
  const fingerprint = createHash("sha256").update(token).digest("hex");
  const session = await client.query(
    `SELECT id,location_id,status FROM device_inventory_sessions
     WHERE company_id=$1 AND id=$2 FOR UPDATE`, [context.companyId, sessionId]
  );
  if (!session.rowCount || session.rows[0].status !== "running") {
    throw new InputError("Die Inventur ist nicht aktiv.", 409, "device_inventory_inactive");
  }
  const resolved = await client.query(
    `SELECT token.device_id FROM device_qr_tokens AS token
     WHERE token.company_id=$1 AND token.public_token=$2 AND token.is_active`,
    [context.companyId, token]
  );
  if (!resolved.rowCount) {
    const unknown = await client.query(
      `INSERT INTO device_inventory_scans (
         company_id,inventory_session_id,token_fingerprint,scanned_by_user_id,result
       ) VALUES ($1,$2,$3,$4,'unknown')
       ON CONFLICT (company_id,inventory_session_id,token_fingerprint)
         WHERE device_id IS NULL DO NOTHING
       RETURNING id,result,scanned_at`,
      [context.companyId, sessionId, fingerprint, context.userId]
    );
    return unknown.rowCount
      ? { ...unknown.rows[0], duplicate: false, device: null }
      : { duplicate: true, result: "unknown", device: null };
  }
  const deviceId = resolved.rows[0].device_id;
  const device = await loadDevice(client, context, deviceId);
  const expected = await client.query(
    `SELECT expected_user_id,expected_location_id FROM device_inventory_expected
     WHERE company_id=$1 AND inventory_session_id=$2 AND device_id=$3`,
    [context.companyId, sessionId, deviceId]
  );
  let result = expected.rowCount ? "found" : "unexpected";
  if (device.currentLocation?.id !== session.rows[0].location_id) result = "wrong_location";
  else if (expected.rowCount && (device.currentOwner?.id || null) !== (expected.rows[0].expected_user_id || null)) {
    result = "wrong_owner";
  }
  const inserted = await client.query(
    `INSERT INTO device_inventory_scans (
       company_id,inventory_session_id,device_id,token_fingerprint,scanned_by_user_id,
       result,observed_user_id,observed_location_id
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (company_id,inventory_session_id,device_id) WHERE device_id IS NOT NULL DO NOTHING
     RETURNING id,result,scanned_at`,
    [
      context.companyId, sessionId, deviceId, fingerprint, context.userId, result,
      device.currentOwner?.id || null, device.currentLocation?.id || null
    ]
  );
  if (!inserted.rowCount) return { duplicate: true, result, device };
  return { ...inserted.rows[0], duplicate: false, device };
}

async function inventoryReport(client, context, sessionId, complete = false) {
  await requireInventory(client, context);
  const session = await client.query(
    `SELECT inventory.id,inventory.status,inventory.started_at,inventory.completed_at,
            inventory.row_version,location.name AS location_name
     FROM device_inventory_sessions AS inventory
     JOIN device_locations AS location ON location.company_id=inventory.company_id AND location.id=inventory.location_id
     WHERE inventory.company_id=$1 AND inventory.id=$2 FOR UPDATE OF inventory`,
    [context.companyId, sessionId]
  );
  if (!session.rowCount) throw new InputError("Die Inventur wurde nicht gefunden.", 404, "device_inventory_not_found");
  if (complete && session.rows[0].status === "running") {
    await client.query(
      `UPDATE device_inventory_sessions SET status='completed',completed_at=CURRENT_TIMESTAMP,
              row_version=row_version+1
       WHERE company_id=$1 AND id=$2`, [context.companyId, sessionId]
    );
    session.rows[0].status = "completed";
    session.rows[0].completed_at = new Date().toISOString();
  }
  const rows = await client.query(
    `SELECT expected.device_id,device.inventory_number,device.name,
            COALESCE(scan.result,'missing') AS result,scan.scanned_at
     FROM device_inventory_expected AS expected
     JOIN devices AS device ON device.company_id=expected.company_id AND device.id=expected.device_id
     LEFT JOIN device_inventory_scans AS scan
       ON scan.company_id=expected.company_id AND scan.inventory_session_id=expected.inventory_session_id
      AND scan.device_id=expected.device_id
     WHERE expected.company_id=$1 AND expected.inventory_session_id=$2
     UNION ALL
     SELECT scan.device_id,device.inventory_number,device.name,scan.result,scan.scanned_at
     FROM device_inventory_scans AS scan
     LEFT JOIN device_inventory_expected AS expected
       ON expected.company_id=scan.company_id AND expected.inventory_session_id=scan.inventory_session_id
      AND expected.device_id=scan.device_id
     LEFT JOIN devices AS device ON device.company_id=scan.company_id AND device.id=scan.device_id
     WHERE scan.company_id=$1 AND scan.inventory_session_id=$2
       AND (scan.device_id IS NULL OR expected.device_id IS NULL)
     ORDER BY result,inventory_number NULLS LAST`,
    [context.companyId, sessionId]
  );
  const counts = rows.rows.reduce((total, row) => {
    total[row.result] = (total[row.result] || 0) + 1;
    return total;
  }, {});
  if (complete) {
    for (const item of rows.rows.filter((row) => row.result === "missing" && row.device_id)) {
      const fixed = await activeAssignment(client, context, item.device_id, "fixed");
      await notify(
        client, context, fixed?.user_id || context.userId, item.device_id, "device_missing",
        `${item.name} fehlt bei der Inventur`,
        `${item.inventory_number} wurde am Standort ${session.rows[0].location_name} nicht gefunden.`,
        `inventory-missing:${sessionId}:${item.device_id}`
      );
    }
  }
  return { session: session.rows[0], counts, items: rows.rows };
}

async function updateSettings(client, context, body) {
  await requireManager(client, context);
  const rowVersion = optionalInteger(body.rowVersion, "Zeilenversion", 1, Number.MAX_SAFE_INTEGER);
  if (!rowVersion) throw new InputError("Für die Geräteregeln fehlt der aktuelle Stand.");
  const current = await client.query(
    `SELECT row_version FROM device_settings WHERE company_id=$1 FOR UPDATE`, [context.companyId]
  );
  if (!current.rowCount) throw new InputError("Die Geräteeinstellungen fehlen.", 409, "device_settings_missing");
  if (rowVersion && Number(current.rows[0].row_version) !== rowVersion) {
    throw new InputError("Die Geräteeinstellungen wurden bereits geändert.", 409, "device_settings_changed");
  }
  const locationId = optionalId(body.defaultStorageLocationId, "Standardlager");
  if (locationId) await ensureLocation(client, context, locationId);
  const result = await client.query(
    `UPDATE device_settings SET inspection_warning_days=$2,long_loan_days=$3,
            lock_overdue_inspections=$4,default_storage_location_id=$5,
            row_version=row_version+1,updated_by_user_id=$6,updated_at=CURRENT_TIMESTAMP
     WHERE company_id=$1 RETURNING *`,
    [
      context.companyId,
      optionalInteger(body.inspectionWarningDays, "Prüfvorlauf", 0, 365) ?? 30,
      optionalInteger(body.longLoanDays, "Ausleihwarnung", 1, 3650) ?? 14,
      requiredBoolean(body.lockOverdueInspections, "Sperre überfälliger Prüfungen"),
      locationId, context.userId
    ]
  );
  return result.rows[0];
}

export async function handleDeviceRequest({ request, url, client, context, allowedOrigin, today }) {
  const path = url.pathname;
  if (!path.startsWith("/api/v1/devices") && !path.startsWith("/api/v1/admin/devices")) {
    return null;
  }
  context.deviceToday = today || new Date().toISOString().slice(0, 10);
  await requireModule(client, context);

  if (request.method === "GET" && path === "/api/v1/devices/dashboard") {
    return { status: 200, body: { dashboard: await dashboard(client, context) } };
  }
  if (request.method === "GET" && path === "/api/v1/devices/contexts") {
    return { status: 200, body: { context: await contexts(client, context) } };
  }
  if (request.method === "GET" && path === "/api/v1/devices/notifications") {
    return { status: 200, body: { notifications: await notifications(client, context) } };
  }
  const notificationMatch = /^\/api\/v1\/devices\/notifications\/([^/]+)\/read$/.exec(path);
  if (request.method === "POST" && notificationMatch) {
    return {
      status: 200,
      body: { notification: await readNotification(
        client, context, validateId(notificationMatch[1], "Benachrichtigungs-ID")
      ) }
    };
  }
  if (request.method === "POST" && path === "/api/v1/devices/scan") {
    const body = await readJson(request);
    return { status: 200, body: { scan: await scanDevice(client, context, body) } };
  }
  if (request.method === "GET" && path === "/api/v1/devices") {
    return { status: 200, body: { devices: await listDevices(client, context, url) } };
  }
  if (request.method === "GET" && path === "/api/v1/admin/devices") {
    return { status: 200, body: { devices: await listDevices(client, context, url, true) } };
  }
  if (request.method === "POST" && path === "/api/v1/admin/devices") {
    const device = await createDevice(client, context, validateDeviceInput(await readJson(request)));
    return { status: 201, body: { device } };
  }
  if (request.method === "POST" && path === "/api/v1/admin/devices/bundles") {
    const bundle = await createDeviceBundle(
      client,
      context,
      validateDeviceBundleInput(await readJson(request, 250_000))
    );
    return { status: 201, body: { bundle } };
  }
  if (request.method === "GET" && path === "/api/v1/admin/devices/sets") {
    return { status: 200, body: { sets: await listDeviceSets(client, context) } };
  }
  if (request.method === "POST" && path === "/api/v1/admin/devices/sets") {
    const set = await createDeviceSet(
      client,
      context,
      validateDeviceSetInput(await readJson(request))
    );
    return { status: 201, body: { set } };
  }
  if (request.method === "POST" && path === "/api/v1/admin/devices/categories") {
    return { status: 201, body: { category: await createCategory(client, context, await readJson(request)) } };
  }
  if (request.method === "POST" && path === "/api/v1/admin/devices/locations") {
    return { status: 201, body: { location: await createLocation(client, context, await readJson(request)) } };
  }
  if (request.method === "PATCH" && path === "/api/v1/admin/devices/settings") {
    return { status: 200, body: { settings: await updateSettings(client, context, await readJson(request)) } };
  }
  if (request.method === "POST" && path === "/api/v1/admin/devices/qr-sheet") {
    await requireManager(client, context);
    const body = await readJson(request, 100_000);
    if (!Array.isArray(body.deviceIds) || body.deviceIds.length < 1 || body.deviceIds.length > 120) {
      throw new InputError("Bitte 1 bis 120 Geräte für den Druckbogen auswählen.");
    }
    const labels = [];
    for (const rawId of [...new Set(body.deviceIds)]) {
      const document = await qrDocument(client, context, validateId(rawId, "Geräte-ID"), allowedOrigin);
      labels.push({ label: document.label, target: document.target, svg: document.svg });
    }
    return { status: 200, body: { labels } };
  }
  if (request.method === "POST" && path === "/api/v1/devices/inventories") {
    return { status: 201, body: { inventory: await startInventory(client, context, await readJson(request)) } };
  }
  const inventoryScanMatch = /^\/api\/v1\/devices\/inventories\/([^/]+)\/scan$/.exec(path);
  if (request.method === "POST" && inventoryScanMatch) {
    return { status: 201, body: { scan: await inventoryScan(
      client, context, validateId(inventoryScanMatch[1], "Inventur-ID"), await readJson(request)
    ) } };
  }
  const inventoryCompleteMatch = /^\/api\/v1\/devices\/inventories\/([^/]+)\/complete$/.exec(path);
  if (request.method === "POST" && inventoryCompleteMatch) {
    return { status: 200, body: { report: await inventoryReport(
      client, context, validateId(inventoryCompleteMatch[1], "Inventur-ID"), true
    ) } };
  }
  const inventoryMatch = /^\/api\/v1\/devices\/inventories\/([^/]+)$/.exec(path);
  if (request.method === "GET" && inventoryMatch) {
    return { status: 200, body: { report: await inventoryReport(
      client, context, validateId(inventoryMatch[1], "Inventur-ID")
    ) } };
  }

  const adminSetItemMatch = /^\/api\/v1\/admin\/devices\/sets\/([^/]+)\/items\/([^/]+)$/.exec(path);
  if (request.method === "DELETE" && adminSetItemMatch) {
    return { status: 200, body: { set: await removeDeviceSetItem(
      client,
      context,
      validateId(adminSetItemMatch[1], "Set-ID"),
      validateId(adminSetItemMatch[2], "Geräte-ID"),
      await readJson(request)
    ) } };
  }
  const adminSetItemsMatch = /^\/api\/v1\/admin\/devices\/sets\/([^/]+)\/items$/.exec(path);
  if (request.method === "POST" && adminSetItemsMatch) {
    return { status: 200, body: { set: await addDeviceSetItems(
      client,
      context,
      validateId(adminSetItemsMatch[1], "Set-ID"),
      validateDeviceSetInput(await readJson(request), { partial: true })
    ) } };
  }
  const adminSetMatch = /^\/api\/v1\/admin\/devices\/sets\/([^/]+)$/.exec(path);
  if (request.method === "GET" && adminSetMatch) {
    return { status: 200, body: { set: await loadDeviceSet(
      client, context, validateId(adminSetMatch[1], "Set-ID")
    ) } };
  }
  if (request.method === "PATCH" && adminSetMatch) {
    return { status: 200, body: { set: await updateDeviceSet(
      client,
      context,
      validateId(adminSetMatch[1], "Set-ID"),
      validateDeviceSetInput(await readJson(request), { partial: true })
    ) } };
  }

  const adminQrRotateMatch = /^\/api\/v1\/admin\/devices\/([^/]+)\/qr\/rotate$/.exec(path);
  if (request.method === "POST" && adminQrRotateMatch) {
    const body = await readJson(request);
    const deviceId = validateId(adminQrRotateMatch[1], "Geräte-ID");
    await qrRecord(client, context, deviceId, true, requiredText(body.reason, "Grund", 500, 3));
    return { status: 200, body: { rotated: true, device: await loadDevice(client, context, deviceId) } };
  }
  const adminQrMatch = /^\/api\/v1\/admin\/devices\/([^/]+)\/qr$/.exec(path);
  if (request.method === "GET" && adminQrMatch) {
    return { status: 200, document: await qrDocument(
      client, context, validateId(adminQrMatch[1], "Geräte-ID"), allowedOrigin
    ) };
  }
  const adminPhotoMatch = /^\/api\/v1\/admin\/devices\/([^/]+)\/photo$/.exec(path);
  if (request.method === "POST" && adminPhotoMatch) {
    return { status: 201, body: { photo: await uploadProfilePhoto(
      client, context, validateId(adminPhotoMatch[1], "Geräte-ID"), await readJson(request, 4_200_000)
    ) } };
  }
  const adminInspectionMatch = /^\/api\/v1\/admin\/devices\/([^/]+)\/inspections$/.exec(path);
  if (request.method === "POST" && adminInspectionMatch) {
    return { status: 201, body: { inspection: await recordInspection(
      client, context, validateId(adminInspectionMatch[1], "Geräte-ID"),
      validateInspectionInput(await readJson(request))
    ) } };
  }
  const adminDefectMatch = /^\/api\/v1\/admin\/devices\/defects\/([^/]+)\/resolve$/.exec(path);
  if (request.method === "POST" && adminDefectMatch) {
    return { status: 200, body: { device: await resolveDefect(
      client, context, validateId(adminDefectMatch[1], "Defekt-ID"), await readJson(request)
    ) } };
  }
  const adminDeviceMatch = /^\/api\/v1\/admin\/devices\/([^/]+)$/.exec(path);
  if (request.method === "PATCH" && adminDeviceMatch) {
    return { status: 200, body: { device: await updateDevice(
      client, context, validateId(adminDeviceMatch[1], "Geräte-ID"),
      validateDeviceInput(await readJson(request), { partial: true })
    ) } };
  }
  if (request.method === "DELETE" && adminDeviceMatch) {
    const body = await readJson(request);
    return { status: 200, body: { device: await updateDevice(
      client, context, validateId(adminDeviceMatch[1], "Geräte-ID"), {
        rowVersion: optionalInteger(body.rowVersion, "Zeilenversion", 1, Number.MAX_SAFE_INTEGER),
        status: "retired",
        retiredReason: requiredText(body.reason, "Ausmusterungsgrund", 1000, 3)
      }
    ) } };
  }
  const photoMatch = /^\/api\/v1\/devices\/([^/]+)\/photo$/.exec(path);
  if (request.method === "GET" && photoMatch) {
    return { status: 200, document: await deviceImage(
      client, context, validateId(photoMatch[1], "Geräte-ID")
    ) };
  }
  const historyMatch = /^\/api\/v1\/devices\/([^/]+)\/history$/.exec(path);
  if (request.method === "GET" && historyMatch) {
    return { status: 200, body: { history: await history(
      client, context, validateId(historyMatch[1], "Geräte-ID")
    ) } };
  }
  const transferMatch = /^\/api\/v1\/devices\/([^/]+)\/transfers$/.exec(path);
  if (request.method === "POST" && transferMatch) {
    return { status: 200, body: { transfer: await transferDevice(
      client, context, validateId(transferMatch[1], "Geräte-ID"),
      validateTransferInput(await readJson(request))
    ) } };
  }
  const defectMatch = /^\/api\/v1\/devices\/([^/]+)\/defects$/.exec(path);
  if (request.method === "POST" && defectMatch) {
    return { status: 201, body: { defect: await reportDefect(
      client, context, validateId(defectMatch[1], "Geräte-ID"),
      validateDefectInput(await readJson(request, 4_200_000))
    ) } };
  }
  const deviceMatch = /^\/api\/v1\/devices\/([^/]+)$/.exec(path);
  if (request.method === "GET" && deviceMatch) {
    return { status: 200, body: { device: await loadDevice(
      client, context, validateId(deviceMatch[1], "Geräte-ID")
    ) } };
  }
  return null;
}
