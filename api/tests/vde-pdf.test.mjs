import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { buildVdeInspectionPdf } from "../src/vde-pdf.mjs";

test("VDE-Abschluss beginnt Messwerte auf Seite zwei und setzt das Stromkreisverzeichnis auf eine eigene Folgeseite", async () => {
  const signature = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64"
  );
  const input = {
    inspection: {
      id: "11111111-1111-4111-8111-111111111111",
      number: "SE-VDE-2026-00001",
      name: "Erstprüfung Haupt- und Unterverteilung",
      date: "2026-07-29"
    },
    protocol: {
      schemaVersion: 1,
      networkType: "TN-S",
      nominalVoltage: "230/400 V",
      inspectionKinds: {
        initial: true,
        recurring: false,
        alteration: false
      },
      visualChecks: {
        electric_shock_protection: "ok",
        protective_conductor: "ok",
        equipment_selection: "ok",
        circuit_labelling: "ok",
        rcd_test_button: "ok",
        phase_sequence: "ok",
        polarity: "ok",
        disconnection_conditions: "ok"
      },
      incomingSupply: {
        designation: "Hausanschlusskasten",
        location: "Hausanschlussraum",
        upstreamProtection: "NH00 63 A",
        source: "Netzbetreiber",
        cableType: "NYY-J",
        cores: "5",
        crossSection: "16"
      },
      circuitDirectoryIncluded: true,
      detailedInsulationMeasurement: true,
      distributions: [{
        clientId: "uv-1",
        name: "UV EG",
        source: "HAK",
        feedCableType: "NYY-J",
        feedCores: "5",
        feedCrossSection: "10",
        feedProtection: "35 A",
        location: "Flur",
        rcds: [{
          clientId: "rcd-1",
          name: "FI Bad/Küche",
          type: "A",
          characteristic: "unverzögert",
          ratedCurrent: "40",
          ratedResidualCurrent: "30",
          testButton: true,
          circuits: [{
            clientId: "circuit-1",
            name: "Steckdosen Küche Ω 🔌",
            cableType: "NYM-J",
            cores: "3",
            crossSection: "2.5",
            protectiveDevice: {
              type: "mcb",
              characteristic: "B",
              ratedCurrent: "16",
              designation: null
            },
            measurements: {
              rpe: "0.18",
              riso: "200",
              zi: "0.31",
              zs: "0.54",
              ik: "426",
              rcdTripTime: "24",
              rcdTripCurrent: "22",
              risoL1Pe: "200",
              risoL2Pe: "200",
              risoL3Pe: "200",
              risoNPe: "200"
            },
            note: null
          }]
        }],
        directCircuits: [{
          clientId: "circuit-2",
          name: "Herd",
          cableType: "NYM-J",
          cores: "5",
          crossSection: "2.5",
          protectiveDevice: {
            type: "fuse_nh",
            characteristic: null,
            ratedCurrent: "50",
            designation: "gG Δ"
          },
          measurements: {
            rpe: "0.16",
            riso: "200",
            zi: "0.28",
            zs: "0.45",
            ik: "511",
            rcdTripTime: null,
            rcdTripCurrent: null,
            risoL1Pe: "200",
            risoL2Pe: "200",
            risoL3Pe: "200",
            risoNPe: "200"
          },
          note: "Direkter Stromkreis ohne FI"
        }]
      }],
      testEquipment: {
        manufacturer: "Gossen Metrawatt",
        type: "Profitest",
        serialNumber: "GM-2026-1",
        calibrationValidUntil: "2027-07-29"
      },
      defects: "Keine Mängel festgestellt.",
      result: "ok",
      nextInspectionDate: "2030-07-29"
    },
    company: {
      legalName: "Schaaf Elektro GmbH",
      displayName: "Schaaf Elektro GmbH",
      street: "Dresdner Straße",
      houseNumber: "30b",
      postalCode: "04720",
      city: "Döbeln",
      phone: "03431 717830",
      email: "info@example.test"
    },
    context: {
      customerName: "Musterkunde GmbH",
      projectNumber: "SE-P-2026-00001",
      projectName: "Umbau Verwaltung",
      siteNumber: "SE-B-2026-00001",
      siteName: "Verwaltungsgebäude",
      siteAddress: "Musterstraße 1, 04720 Döbeln",
      inspectorName: "Vera Vorarbeiterin"
    },
    inspectorSignature: signature,
    completedAt: "2026-07-29T16:30:00.000Z",
    companyLogo: await readFile(
      new URL(
        "../../frontend/assets/company-logos/schaaf-elektro.png",
        import.meta.url
      )
    )
  };
  const pdf = await buildVdeInspectionPdf(input);

  assert.equal(pdf.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.ok(pdf.length > 3_000);
  const loaded = await PDFDocument.load(pdf);
  assert.equal(loaded.getTitle(), "VDE-Prüfprotokoll SE-VDE-2026-00001");
  assert.equal(loaded.getPageCount(), 3);
  assert.deepEqual(
    loaded.getPage(0).getSize(),
    { width: 595.28, height: 841.89 }
  );
  assert.deepEqual(
    loaded.getPage(1).getSize(),
    { width: 595.28, height: 841.89 }
  );
  assert.deepEqual(
    loaded.getPage(2).getSize(),
    { width: 595.28, height: 841.89 }
  );

  const withoutDirectory = await buildVdeInspectionPdf({
    ...input,
    protocol: {
      ...input.protocol,
      circuitDirectoryIncluded: false
    }
  });
  const loadedWithoutDirectory = await PDFDocument.load(withoutDirectory);
  assert.equal(loadedWithoutDirectory.getPageCount(), 2);
});
