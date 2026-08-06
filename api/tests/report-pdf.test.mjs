import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { buildFinalReportPdf } from "../src/report-pdf.mjs";
import { ausserhalbDesBlattes, lesbarerText, seitenStroeme } from "./helpers/pdf-messen.mjs";

test("freigegebener Bericht wird als unveränderliche PDF-Ausgabe erzeugt", async () => {
  const signature = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64"
  );
  const pdf = await buildFinalReportPdf({
    report: {
      id: "22222222-2222-4222-8222-222222222222",
      number: "SE-R-2026-00001",
      reportType: "montage",
      workDate: "2026-07-21",
      summary: "Unterverteilung montiert",
      details: "Leitungen aufgelegt und Stromkreise beschriftet.",
      structuredData: {
        workPerformed: "Leitungen aufgelegt und Stromkreise beschriftet.",
        obstructions: "Keine",
        openItems: "Messung abschließen",
        materialsAndEquipment: "NYM-J 3x1,5 und Prüfgerät",
        agreements: "Messung am Folgetag",
        incidents: "Keine Schäden",
        personnel: [{
          userId: "33333333-3333-4333-8333-333333333333",
          name: "Max Monteur",
          minutes: 480
        }]
      },
      authorName: "Max Monteur"
    },
    company: {
      legalName: "Schaaf Elektro GmbH",
      displayName: "Schaaf Elektro GmbH",
      street: "Dresdner Straße",
      houseNumber: "30b",
      postalCode: "04720",
      city: "Döbeln"
    },
    context: {
      customerName: "Musterkunde GmbH",
      projectNumber: "SE-2026-0001",
      projectName: "Umbau Verwaltung",
      siteNumber: "SE-B-2026-0001",
      siteName: "Verwaltungsgebäude",
      siteAddress: "Musterstraße 1, 04720 Döbeln"
    },
    signatures: {
      employee: { name: "Max Monteur", data: signature },
      customer: { name: "Klara Kundin", data: signature }
    },
    finalizedAt: "2026-07-21T18:30:00.000Z",
    companyLogo: await readFile(new URL("../../frontend/assets/company-logos/schaaf-elektro.png", import.meta.url))
  });

  assert.ok(pdf.length > 1500);
  assert.equal(pdf.subarray(0, 5).toString("ascii"), "%PDF-");
  const loaded = await PDFDocument.load(pdf);
  assert.equal(loaded.getTitle(), "Montageschein SE-R-2026-00001");
  assert.equal(loaded.getPageCount(), 2);
});

test("Berichtsvorschau ist klar als offen markiert und benötigt keine Unterschriften", async () => {
  const photo = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64"
  );
  const pdf = await buildFinalReportPdf({
    report: {
      id: "22222222-2222-4222-8222-222222222222",
      number: "SE-R-2026-00002",
      reportType: "daily",
      workDate: "2026-07-29",
      summary: "Vorschau des Bautagesberichts",
      details: "Leitungen geprüft.",
      structuredData: {
        workPerformed: "Leitungen geprüft.",
        personnel: []
      },
      authorName: "Max Monteur"
    },
    company: {
      legalName: "Schaaf Elektro GmbH",
      displayName: "Schaaf Elektro GmbH",
      street: "Dresdner Straße",
      houseNumber: "30b",
      postalCode: "04720",
      city: "Döbeln"
    },
    context: {
      customerName: "Musterkunde GmbH",
      siteNumber: "SE-B-2026-0001",
      siteName: "Verwaltungsgebäude",
      siteAddress: "Musterstraße 1, 04720 Döbeln"
    },
    finalizedAt: "2026-07-29T18:30:00.000Z",
    photos: [{
      documentId: "55555555-5555-4555-8555-555555555555",
      title: "Unterverteilung",
      caption: "Unterverteilung nach Abschluss der Montage",
      mimeType: "image/png",
      content: photo
    }],
    preview: true
  });

  assert.ok(pdf.length > 1200);
  const loaded = await PDFDocument.load(pdf);
  assert.equal(loaded.getTitle(), "Bautagesbericht SE-R-2026-00002");
  assert.equal(loaded.getSubject(), "Berichtsvorschau vor der Unterschrift");
  assert.equal(loaded.getPageCount(), 2);
});

// Nachmessen statt Seiten zaehlen: ein PDF sieht auch dann heil aus, wenn die
// Haelfte davon neben dem Blatt liegt. Der Montageschein waechst mit dem, was
// der Monteur schreibt, und mit der Zahl der Leute auf der Baustelle - beides
// hat nach oben keine natuerliche Grenze.
test("Auch ein sehr langer Bericht bleibt vollständig auf den Blättern", async () => {
  const signature = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64"
  );
  const langerText = (zeilen) => Array.from({ length: zeilen }, (_, index) =>
    `Zeile ${index + 1}: Leitungen aufgelegt, Stromkreise beschriftet und die Funktion geprüft.`
  ).join("\n");

  for (const [name, { zeilen, leute }] of Object.entries({
    "kurzer Bericht": { zeilen: 1, leute: 1 },
    "ausführlicher Bericht": { zeilen: 25, leute: 1 },
    "sehr ausführlicher Bericht": { zeilen: 120, leute: 1 },
    "große Kolonne": { zeilen: 3, leute: 40 },
    "beides zusammen": { zeilen: 120, leute: 40 }
  })) {
    const pdf = await buildFinalReportPdf({
      report: {
        id: "22222222-2222-4222-8222-222222222222",
        number: "SE-R-2026-00001",
        reportType: "montage",
        workDate: "2026-07-21",
        summary: langerText(zeilen).slice(0, 400),
        details: langerText(zeilen),
        structuredData: {
          workPerformed: langerText(zeilen),
          obstructions: langerText(zeilen),
          openItems: langerText(zeilen),
          materialsAndEquipment: langerText(zeilen),
          agreements: langerText(zeilen),
          incidents: langerText(zeilen),
          personnel: Array.from({ length: leute }, (_, index) => ({
            userId: `33333333-3333-4333-8333-3333333333${String(index).padStart(2, "0")}`,
            name: `Mitarbeiterin mit einem sehr langen Namen Nummer ${index + 1}`,
            minutes: 480 + index
          }))
        },
        authorName: "Max Monteur"
      },
      company: {
        legalName: "Schaaf Elektro GmbH",
        displayName: "Schaaf Elektro GmbH",
        street: "Dresdner Straße",
        houseNumber: "30b",
        postalCode: "04720",
        city: "Döbeln"
      },
      context: {
        customerName: "Musterkunde GmbH",
        projectNumber: "SE-2026-0001",
        projectName: "Umbau Verwaltung",
        siteNumber: "SE-B-2026-0001",
        siteName: "Verwaltungsgebäude",
        siteAddress: "Musterstraße 1, 04720 Döbeln"
      },
      signatures: {
        employee: { name: "Max Monteur", data: signature },
        customer: { name: "Klara Kundin", data: signature }
      },
      finalizedAt: "2026-07-21T18:30:00.000Z"
    });

    const { document, seiten } = await seitenStroeme(pdf);
    const daneben = ausserhalbDesBlattes(seiten);
    assert.deepEqual(daneben, [], `${name}: gezeichnet bei ${daneben.slice(0, 3).join(", ")}`);
    // Was der Monteur geschrieben hat, steht auch auf dem Papier.
    const text = seiten.map(lesbarerText).join(" ");
    assert.ok(text.includes(`Zeile ${zeilen}:`), `${name}: die letzte Zeile fehlt`);
    assert.ok(
      text.includes(`Namen Nummer ${leute}`),
      `${name}: die letzte Mitarbeiterin fehlt`
    );
    assert.ok(document.getPageCount() >= 2);
  }
});
