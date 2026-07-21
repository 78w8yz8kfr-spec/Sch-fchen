import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { buildFinalReportPdf } from "../src/report-pdf.mjs";

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
  assert.equal(loaded.getTitle(), "Montagebericht SE-R-2026-00001");
  assert.equal(loaded.getPageCount(), 1);
});
