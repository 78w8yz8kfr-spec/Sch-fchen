import assert from "node:assert/strict";
import test from "node:test";
import {
  cameraScanErrorMessage,
  deviceStatusLabel,
  normalizeDeviceQrValue,
  offlineDeviceQueueKey,
  partitionMyDevices,
  qrScanResultValue
} from "../core/device-management.js";

const userId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const token = "33333333-3333-4333-8333-333333333333";

test("QR-Adresse und reiner Token werden gleich aufgelöst", () => {
  assert.equal(normalizeDeviceQrValue(token), token);
  assert.equal(normalizeDeviceQrValue(`https://schaefchen.example/?device=${token}`), token);
  assert.throws(() => normalizeDeviceQrValue("M0042"), /gehört nicht/);
});

test("QR-Scanner verarbeitet native und browserunabhängige Decodergebnisse", () => {
  assert.equal(qrScanResultValue({ data: `https://schaefchen.example/?device=${token}` }), `https://schaefchen.example/?device=${token}`);
  assert.equal(qrScanResultValue(token), token);
  assert.equal(qrScanResultValue(null), "");
});

test("Kamerafehler erklären Berechtigung, fehlende und belegte Kamera", () => {
  assert.match(cameraScanErrorMessage({ name: "NotAllowedError" }), /Browser-Einstellungen/);
  assert.match(cameraScanErrorMessage({ name: "NotFoundError" }), /keine verwendbare Kamera/);
  assert.match(cameraScanErrorMessage({ name: "NotReadableError" }), /anderen App/);
  assert.match(cameraScanErrorMessage(new Error("unbekannt")), /QR-Foto/);
});

test("Meine Geräte trennt Besitz, feste Zuordnung und Fremdbesitz", () => {
  const devices = [
    { id: "a", currentOwner: { id: userId }, fixedOwner: null },
    { id: "b", currentOwner: { id: userId }, fixedOwner: { id: userId } },
    { id: "c", currentOwner: { id: otherId }, fixedOwner: { id: userId } },
    { id: "d", currentOwner: null, fixedOwner: { id: userId } }
  ];
  const groups = partitionMyDevices(devices, userId);
  assert.deepEqual(groups.withMe.map((item) => item.id), ["a", "b"]);
  assert.deepEqual(groups.fixed.map((item) => item.id), ["b", "c", "d"]);
  assert.deepEqual(groups.elsewhere.map((item) => item.id), ["c"]);
});

test("Offline-Warteschlange ist pro Firma und Mitarbeiter getrennt", () => {
  const session = { company: { number: "1001" }, user: { id: userId } };
  assert.equal(offlineDeviceQueueKey(session), `schaefchen-device-queue-v1:1001:${userId}`);
  assert.notEqual(
    offlineDeviceQueueKey(session),
    offlineDeviceQueueKey({ company: { number: "1002" }, user: { id: userId } })
  );
});

test("Gerätestatus erhält verständliche deutsche Bezeichnungen", () => {
  assert.equal(deviceStatusLabel("available"), "Verfügbar");
  assert.equal(deviceStatusLabel("inspection_due"), "Prüfung fällig");
  assert.equal(deviceStatusLabel("retired"), "Ausgemustert");
});
