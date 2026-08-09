import assert from "node:assert/strict";
import test from "node:test";
import {
  DEVICE_MODULE_KEY,
  deviceDto,
  normalizeDeviceQrToken,
  validateDeviceBundleInput,
  validateDeviceInput,
  validateDeviceSetInput,
  validateTransferInput
} from "../src/devices.mjs";

const ids = {
  category: "11111111-1111-4111-8111-111111111111",
  operation: "22222222-2222-4222-8222-222222222222",
  employee: "33333333-3333-4333-8333-333333333333",
  device: "44444444-4444-4444-8444-444444444444"
};

const partId = "55555555-5555-4555-8555-555555555555";

test("das Gerätemodul besitzt einen stabilen Katalogschlüssel", () => {
  assert.equal(DEVICE_MODULE_KEY, "devices");
});

test("QR-Codes enthalten nur einen zufälligen Token", () => {
  assert.equal(normalizeDeviceQrToken(ids.operation), ids.operation);
  assert.equal(
    normalizeDeviceQrToken(`https://schaefchen.example/?device=${ids.operation}`),
    ids.operation
  );
  assert.throws(() => normalizeDeviceQrToken("M0042"), /ungültig/);
  assert.throws(() => normalizeDeviceQrToken("https://example.test/?device=Markus"), /ungültig/);
});

test("Gerätestammdaten werden streng normalisiert", () => {
  const result = validateDeviceInput({
    inventoryNumber: " M0042 ",
    name: " Bosch Bohrhammer ",
    categoryId: ids.category,
    manufacturer: " Bosch ",
    purchasePriceCents: 38999,
    purchaseDate: "2026-08-09",
    inspectionRequired: true,
    condition: "OK",
    status: "available"
  });
  assert.deepEqual(result, {
    inventoryNumber: "M0042",
    name: "Bosch Bohrhammer",
    categoryId: ids.category,
    manufacturer: "Bosch",
    purchaseDate: "2026-08-09",
    purchasePriceCents: 38999,
    condition: "ok",
    inspectionRequired: true,
    status: "available"
  });
  assert.throws(() => validateDeviceInput({ name: "Ohne Nummer", categoryId: ids.category }), /inventoryNumber fehlt/);
  assert.throws(() => validateDeviceInput({
    inventoryNumber: "X", name: "X", categoryId: ids.category, companyId: ids.employee
  }), /ausschließlich vom Server/);
  assert.throws(() => validateDeviceInput({
    inventoryNumber: "X", name: "X", categoryId: ids.category, purchaseDate: "09.08.2026"
  }), /kein gültiges Datum/);
});

test("Akkus werden als eigenständige Geräte validiert", () => {
  const result = validateDeviceInput({
    inventoryNumber: "A-0048",
    name: "Milwaukee M18 5,0 Ah",
    categoryId: ids.category,
    battery: {
      batterySystem: " M18 ", voltage: 18, capacityAh: 5,
      cycleCount: 41, remainingCapacityPercent: 92.5,
      compatibleSystem: "Milwaukee M18"
    }
  });
  assert.equal(result.battery.batterySystem, "M18");
  assert.equal(result.battery.capacityAh, 5);
  assert.throws(() => validateDeviceInput({
    inventoryNumber: "A", name: "Akku", categoryId: ids.category,
    battery: { batterySystem: "M18", remainingCapacityPercent: 101 }
  }), /Restkapazität/);
});

test("Gerätesets und beiliegende Teile werden gemeinsam validiert", () => {
  assert.deepEqual(validateDeviceSetInput({
    setNumber: " SET-12 ",
    name: " Makita Koffer ",
    deviceIds: [ids.device, partId, ids.device]
  }), {
    setNumber: "SET-12",
    name: "Makita Koffer",
    deviceIds: [ids.device, partId]
  });
  const bundle = validateDeviceBundleInput({
    device: {
      inventoryNumber: "M-12",
      name: "Makita Akkuschrauber",
      categoryId: ids.category
    },
    parts: [{
      inventoryNumber: "A-12",
      name: "Makita Akku",
      categoryId: ids.category
    }],
    set: { setNumber: "SET-12", name: "Makita Koffer" }
  });
  assert.equal(bundle.parts.length, 1);
  assert.equal(bundle.set.setNumber, "SET-12");
  assert.throws(() => validateDeviceBundleInput({
    device: { inventoryNumber: "M-13", name: "Gerät", categoryId: ids.category },
    parts: [{ inventoryNumber: "A-13", name: "Akku", categoryId: ids.category }]
  }), /Geräteset/);
  assert.throws(() => validateDeviceSetInput({
    setNumber: "SET-X", name: "Fremd", deviceIds: [ids.device], companyId: ids.employee
  }), /ausschließlich vom Server/);
});

test("Übergaben benötigen Aktion, Offline-ID und stabile Relationen", () => {
  assert.deepEqual(validateTransferInput({
    action: "handover",
    toUserId: ids.employee,
    clientOperationId: ids.operation,
    expectedRowVersion: 7,
    offline: true
  }), {
    action: "handover",
    toUserId: ids.employee,
    locationId: null,
    constructionSiteId: null,
    clientOperationId: ids.operation,
    expectedRowVersion: 7,
    clientCreatedAt: null,
    note: null,
    offline: true
  });
  assert.throws(() => validateTransferInput({ action: "steal", clientOperationId: ids.operation }), /ungültig/);
  assert.throws(() => validateTransferInput({
    action: "takeover", clientOperationId: ids.operation
  }), /aktuelle Gerätestand/);
  assert.throws(() => validateTransferInput({
    action: "administrative_correction", clientOperationId: ids.operation,
    expectedRowVersion: 1
  }), /Grund erforderlich/);
  assert.throws(() => validateTransferInput({ action: "takeover", clientOperationId: "offline-1" }), /ungültige Länge/);
});

function row(overrides = {}) {
  return {
    id: ids.device,
    inventory_number: "M0042",
    name: "Bosch Bohrhammer",
    category_id: ids.category,
    category_name: "Elektrowerkzeuge",
    base_type: "power_tool",
    manufacturer: "Bosch",
    model: "GBH 18V-26",
    serial_number: "SN-42",
    purchase_date: "2026-01-02",
    purchase_price_cents: 40000,
    supplier: null,
    warranty_until: null,
    condition_key: "ok",
    note: null,
    status: "available",
    row_version: 3,
    fixed_owner_user_id: null,
    current_owner_user_id: null,
    current_location_id: null,
    last_known_location_id: null,
    assigned_construction_site_id: null,
    assigned_vehicle_id: null,
    inspection_required: false,
    last_inspection_on: null,
    next_inspection_on: null,
    maintenance_interval_days: null,
    next_maintenance_on: null,
    has_photo: false,
    battery_system: null,
    voltage: null,
    capacity_ah: null,
    cycle_count: null,
    last_capacity_test_on: null,
    measured_remaining_capacity_percent: null,
    compatible_system: null,
    open_defect_id: null,
    device_set_id: null,
    inspection_warning_days: 30,
    lock_overdue_inspections: false,
    created_at: "2026-08-09T06:00:00Z",
    updated_at: "2026-08-09T06:00:00Z",
    ...overrides
  };
}

test("DTO trennt festen und aktuellen Besitzer und berechnet Prüfstatus", () => {
  const device = deviceDto(row({
    fixed_owner_user_id: ids.employee,
    fixed_owner_name: "Markus Muster",
    fixed_owner_status: "active",
    current_owner_user_id: "55555555-5555-4555-8555-555555555555",
    current_owner_name: "Max Monteur",
    current_owner_status: "active",
    inspection_required: true,
    next_inspection_on: new Date(2026, 7, 8),
    lock_overdue_inspections: true,
    status: "loaned"
  }), ids.employee, "2026-08-09");
  assert.equal(device.fixedOwner.name, "Markus Muster");
  assert.equal(device.currentOwner.name, "Max Monteur");
  assert.equal(device.isFixedOwner, true);
  assert.equal(device.isCurrentOwner, false);
  assert.equal(device.inspectionState, "overdue");
  assert.equal(device.nextInspectionOn, "2026-08-08");
  assert.equal(device.effectiveStatus, "inspection_due");
  assert.equal(device.blocked, true);
  assert.deepEqual(device.actions, ["report_defect"]);
});

test("DTO bietet dem aktuellen Besitzer die schnellen Rückgabeaktionen", () => {
  const device = deviceDto(row({
    current_owner_user_id: ids.employee,
    current_owner_name: "Max Monteur",
    current_owner_status: "active",
    status: "loaned"
  }), ids.employee, "2026-08-09");
  assert.equal(device.isCurrentOwner, true);
  assert.ok(device.actions.includes("return"));
  assert.ok(device.actions.includes("handover"));
  assert.ok(device.actions.includes("report_defect"));
});

test("DTO zeigt die Setzugehörigkeit ohne Teile zu duplizieren", () => {
  const device = deviceDto(row({
    device_set_id: partId,
    device_set_number: "SET-12",
    device_set_name: "Makita Koffer",
    device_set_item_count: 5
  }), ids.employee, "2026-08-09");
  assert.deepEqual(device.set, {
    id: partId,
    number: "SET-12",
    name: "Makita Koffer",
    itemCount: 5
  });
});

test("ausgemusterte Geräte bieten keine fachlichen Folgeaktionen", () => {
  const device = deviceDto(row({ status: "retired" }), ids.employee, "2026-08-09");
  assert.equal(device.blocked, true);
  assert.deepEqual(device.actions, []);
});
