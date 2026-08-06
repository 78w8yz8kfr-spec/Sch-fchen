import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import {
  buildVdeInspectionPdf,
  checkLabel,
  circuitEvaluation,
  protectionLabel,
  splitPdfWord,
  wrapText
} from "../src/vde-pdf.mjs";
import { ausserhalbDesBlattes, lesbarerText, seitenStroeme } from "./helpers/pdf-messen.mjs";

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

// Die folgenden Prüfungen schreiben die fachliche Bewertung eines Stromkreises
// fest. Sie entscheidet, ob ein Prüfprotokoll "i.O.", "prüfen" oder "n.i.O."
// ausweist, und war bisher nur mittelbar über das fertige PDF abgedeckt.

test("Ein vollständig gemessener Stromkreis ohne RCD gilt als in Ordnung", () => {
  const bewertung = circuitEvaluation({
    measurements: { riso: "500", rpe: "0.3", zs: "0.8" },
    protectiveDevice: { type: "mcb", ratedCurrent: 16, characteristic: "B" }
  });
  assert.equal(bewertung.state, "i.O.");
  assert.deepEqual(bewertung.warnings, []);
});

test("Ein Isolationswiderstand unter 1 MOhm macht den Stromkreis nicht in Ordnung", () => {
  const bewertung = circuitEvaluation({
    measurements: { riso: "0.4", rpe: "0.3", zs: "0.8" },
    protectiveDevice: { type: "mcb" }
  });
  assert.equal(bewertung.state, "n.i.O.");
  assert.ok(bewertung.warnings.includes("RISO < 1 MOhm"));
});

test("Fehlende Messwerte fuehren zu pruefen, nicht zu nicht in Ordnung", () => {
  const bewertung = circuitEvaluation({ measurements: {}, protectiveDevice: { type: "mcb" } });
  assert.equal(bewertung.state, "prüfen");
  assert.ok(bewertung.warnings.includes("RISO fehlt"));
  assert.ok(bewertung.warnings.includes("RPE fehlt"));
  // Ohne RCD zaehlt die Schleifenimpedanz oder der Kurzschlussstrom.
  assert.ok(bewertung.warnings.includes("Zs oder Ik fehlt"));
});

test("Der Kurzschlussstrom ersetzt die Schleifenimpedanz", () => {
  const bewertung = circuitEvaluation({
    measurements: { riso: "500", rpe: "0.3", ik: "240" },
    protectiveDevice: { type: "mcb" }
  });
  assert.ok(!bewertung.warnings.includes("Zs oder Ik fehlt"));
});

test("Ein Ausloesestrom oberhalb des Bemessungswerts macht den Stromkreis nicht in Ordnung", () => {
  const bewertung = circuitEvaluation({
    measurements: { riso: "500", rpe: "0.3", rcdTripTime: "18", rcdTripCurrent: "42" },
    protectiveDevice: { type: "rcbo", ratedResidualCurrent: 30 }
  });
  assert.equal(bewertung.state, "n.i.O.");
  assert.ok(bewertung.warnings.includes("RCD-Auslösestrom > Idn"));
});

test("Ein Ausloesestrom innerhalb des Bemessungswerts ist in Ordnung", () => {
  const bewertung = circuitEvaluation({
    measurements: { riso: "500", rpe: "0.3", rcdTripTime: "18", rcdTripCurrent: "22" },
    protectiveDevice: { type: "rcbo", ratedResidualCurrent: 30 }
  });
  assert.equal(bewertung.state, "i.O.");
});

test("Ein vorgelagerter Fehlerstromschutz verlangt eigene Messwerte", () => {
  const bewertung = circuitEvaluation(
    { measurements: { riso: "500", rpe: "0.3" }, protectiveDevice: { type: "mcb" } },
    { ratedResidualCurrent: 30 }
  );
  assert.equal(bewertung.state, "prüfen");
  assert.ok(bewertung.warnings.includes("RCD-Zeit fehlt"));
  assert.ok(bewertung.warnings.includes("RCD-Strom fehlt"));
  // Mit vorgelagertem RCD wird die Schleifenimpedanz nicht zusaetzlich verlangt.
  assert.ok(!bewertung.warnings.includes("Zs oder Ik fehlt"));
});

test("Jede Bauart des Schutzorgans bekommt eine lesbare Bezeichnung", () => {
  assert.equal(protectionLabel({ type: "mcb", characteristic: "B", ratedCurrent: 16 }), "LS B 16 A");
  assert.equal(protectionLabel({ type: "mcb" }), "LS");
  assert.match(protectionLabel({ type: "rcbo", ratedResidualCurrent: 30, rcdType: "A" }), /FI\/LS.*Typ A.*30 mA/);
  assert.equal(protectionLabel({ type: "fuse_nh", ratedCurrent: 63 }), "NH-Sicherung 63 A");
  assert.equal(protectionLabel({ type: "fuse_nh", ratedCurrent: 63, designation: "gG" }), "NH-Sicherung 63 A, gG");
  assert.equal(protectionLabel({ type: "fuse_diazed", ratedCurrent: 25 }), "Diazed 25 A");
  assert.equal(protectionLabel({ type: "fuse_neozed", ratedCurrent: 35 }), "Neozed 35 A");
  assert.equal(protectionLabel({ type: "unbekannt", designation: "Sonderbauform" }), "Sonderbauform");
  assert.equal(protectionLabel(undefined), "Sonstiges Schutzorgan");
});

test("Das Prüfergebnis wird in die Kurzform des Protokolls uebersetzt", () => {
  assert.equal(checkLabel("ok"), "i.O.");
  assert.equal(checkLabel("not_ok"), "n.i.O.");
  assert.equal(checkLabel("not_checked"), "offen");
  assert.equal(checkLabel(undefined), "offen");
  assert.equal(checkLabel("etwas anderes"), "offen");
});

test("Ein ueberlanges Wort wird umbrochen statt aus dem Feld zu laufen", () => {
  // Der Umbruch arbeitet mit einer Schriftbreite; eine feste Breite je Zeichen
  // genuegt fuer die Pruefung der Regel.
  const font = { widthOfTextAtSize: (text) => text.length * 10 };
  assert.deepEqual(splitPdfWord("Hauptverteilung", font, 10, 50), ["Haupt", "verte", "ilung"]);
  assert.deepEqual(splitPdfWord("kurz", font, 10, 100), ["kurz"]);
  const zeilen = wrapText("ein sehr langer Satz", font, 10, 90);
  assert.ok(zeilen.length > 1);
  assert.ok(zeilen.every((zeile) => zeile.length <= 9));
});

test("Ein leerer Text wird zu einem Strich statt zu einer leeren Zeile", () => {
  const font = { widthOfTextAtSize: (text) => text.length * 10 };
  assert.deepEqual(wrapText("", font, 10, 100), ["-"]);
  assert.deepEqual(wrapText(null, font, 10, 100), ["-"]);
  // Absaetze bleiben erhalten.
  assert.deepEqual(wrapText("eins\n\nzwei", font, 10, 100), ["eins", "", "zwei"]);
});

// Nachmessen statt Seiten zaehlen. Ein Pruefprotokoll waechst mit der Anlage:
// eine Gewerbeanlage hat mehrere Verteilungen mit vielen Stromkreisen, und die
// Bezeichnungen kommen aus dem Feld, nicht aus einer Liste. Wenn dabei etwas
// neben das Blatt rutscht, faellt es erst beim Ausdruck fuer den Kunden auf.
test("Auch eine große Anlage bleibt vollständig auf den Blättern", async () => {
  const signature = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64"
  );
  const messwerte = {
    rpe: "0.18", riso: "200", zi: "0.31", zs: "0.54", ik: "426",
    rcdTripTime: "24", rcdTripCurrent: "22",
    risoL1Pe: "200", risoL2Pe: "200", risoL3Pe: "200", risoNPe: "200"
  };
  const stromkreis = (index, name) => ({
    clientId: `circuit-${index}`,
    name: name || `Stromkreis ${index + 1}`,
    cableType: "NYM-J", cores: "3", crossSection: "2.5",
    protectiveDevice: { type: "mcb", characteristic: "B", ratedCurrent: "16", designation: null },
    measurements: messwerte,
    note: null
  });

  const anlage = ({ verteilungen, fiJeVerteilung, kreiseJeFi, langeNamen = false, defects }) => ({
    inspection: {
      id: "11111111-1111-4111-8111-111111111111",
      number: "SE-VDE-2026-00001",
      name: "Erstprüfung Haupt- und Unterverteilung",
      date: "2026-07-29"
    },
    protocol: {
      schemaVersion: 1, networkType: "TN-S", nominalVoltage: "230/400 V",
      inspectionKinds: { initial: true, recurring: false, alteration: false },
      visualChecks: {
        electric_shock_protection: "ok", protective_conductor: "ok",
        equipment_selection: "ok", circuit_labelling: "ok", rcd_test_button: "ok",
        phase_sequence: "ok", polarity: "ok", disconnection_conditions: "ok"
      },
      incomingSupply: {
        designation: "Hausanschlusskasten", location: "Hausanschlussraum",
        upstreamProtection: "NH00 63 A", source: "Netzbetreiber",
        cableType: "NYY-J", cores: "5", crossSection: "16"
      },
      circuitDirectoryIncluded: true,
      detailedInsulationMeasurement: true,
      distributions: Array.from({ length: verteilungen }, (_, v) => ({
        clientId: `uv-${v}`,
        name: langeNamen
          ? `Unterverteilung im zweiten Obergeschoss, Flur rechts hinten, Nummer ${v + 1}`
          : `UV ${v + 1}`,
        source: "HAK", feedCableType: "NYY-J", feedCores: "5", feedCrossSection: "10",
        feedProtection: "35 A", location: "Flur",
        rcds: Array.from({ length: fiJeVerteilung }, (_, f) => ({
          clientId: `rcd-${v}-${f}`,
          name: langeNamen
            ? `Fehlerstromschutzschalter für Bad, Küche und Hauswirtschaftsraum ${f + 1}`
            : `FI ${f + 1}`,
          type: "A", characteristic: "unverzögert", ratedCurrent: "40",
          ratedResidualCurrent: "30", testButton: true,
          circuits: Array.from({ length: kreiseJeFi }, (_, c) => stromkreis(
            c,
            langeNamen ? `Steckdosen Küche, Arbeitsplatte links und rechts ${c + 1}` : null
          ))
        })),
        directCircuits: [stromkreis(99, "Herd")]
      })),
      testEquipment: {
        manufacturer: "Gossen Metrawatt", type: "Profitest",
        serialNumber: "GM-2026-1", calibrationValidUntil: "2027-07-29"
      },
      defects: defects || "Keine Mängel festgestellt.",
      result: "ok",
      nextInspectionDate: "2030-07-29"
    },
    company: {
      legalName: "Schaaf Elektro GmbH", displayName: "Schaaf Elektro GmbH",
      street: "Dresdner Straße", houseNumber: "30b", postalCode: "04720",
      city: "Döbeln", phone: "03431 717830", email: "info@example.test"
    },
    context: {
      customerName: "Musterkunde GmbH", projectNumber: "SE-P-2026-00001",
      projectName: "Umbau Verwaltung", siteNumber: "SE-B-2026-00001",
      siteName: "Verwaltungsgebäude", siteAddress: "Musterstraße 1, 04720 Döbeln",
      inspectorName: "Vera Vorarbeiterin"
    },
    inspectorSignature: signature,
    completedAt: "2026-07-29T16:30:00.000Z"
  });

  const langeMaengel = Array.from({ length: 60 }, (_, index) =>
    `Mangel ${index + 1}: Die Klemmstelle war lose und wurde nachgezogen.`
  ).join(" ");

  for (const [name, form] of Object.entries({
    "kleine Anlage": { verteilungen: 1, fiJeVerteilung: 1, kreiseJeFi: 1 },
    "Wohnhaus": { verteilungen: 2, fiJeVerteilung: 4, kreiseJeFi: 6 },
    "Gewerbeanlage": { verteilungen: 4, fiJeVerteilung: 6, kreiseJeFi: 8 },
    "lange Bezeichnungen aus dem Feld": {
      verteilungen: 2, fiJeVerteilung: 3, kreiseJeFi: 4, langeNamen: true
    },
    "sehr lange Mängelliste": {
      verteilungen: 1, fiJeVerteilung: 1, kreiseJeFi: 1, defects: langeMaengel
    }
  })) {
    const pdf = await buildVdeInspectionPdf(anlage(form));
    const { seiten } = await seitenStroeme(pdf);
    const daneben = ausserhalbDesBlattes(seiten);
    assert.deepEqual(daneben, [], `${name}: gezeichnet bei ${daneben.slice(0, 3).join(", ")}`);
  }

  // Ein langer Mangeltext wird nicht stillschweigend gekuerzt: was der Pruefer
  // festgehalten hat, steht auch im Protokoll.
  const mitMaengeln = await buildVdeInspectionPdf(anlage({
    verteilungen: 1, fiJeVerteilung: 1, kreiseJeFi: 1, defects: langeMaengel
  }));
  const { seiten: maengelSeiten } = await seitenStroeme(mitMaengeln);
  const text = maengelSeiten.map(lesbarerText).join(" ");
  assert.ok(text.includes("Mangel 1:"), "Der erste Mangel fehlt");
  assert.ok(text.includes("Mangel 60:"), "Der letzte Mangel fehlt");
});
