import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const A4 = [595.28, 841.89];
const RED = rgb(0.75, 0.05, 0.08);
const INK = rgb(0.08, 0.08, 0.08);
const MUTED = rgb(0.38, 0.38, 0.38);
const LINE = rgb(0.84, 0.84, 0.84);
const PALE = rgb(0.97, 0.97, 0.97);
const PDF_TEXT_REPLACEMENTS = new Map([
  ["€", "EUR"],
  ["Ω", "Ohm"],
  ["Δ", "Delta"],
  ["µ", "u"],
  ["–", "-"],
  ["—", "-"],
  ["„", "\""],
  ["“", "\""],
  ["”", "\""],
  ["’", "'"],
  ["→", "->"],
  ["←", "<-"],
  ["≤", "<="],
  ["≥", ">="],
  ["×", "x"]
]);

const VISUAL_CHECK_LABELS = {
  electric_shock_protection: "Schutz gegen elektrischen Schlag",
  protective_conductor: "Schutzleiter und Potentialausgleich",
  equipment_selection: "Leitungen und Betriebsmittel richtig ausgewählt",
  circuit_labelling: "Stromkreise eindeutig beschriftet",
  rcd_test_button: "RCD-Prüftaste betätigt",
  phase_sequence: "Drehfeld geprüft",
  polarity: "Polung geprüft",
  disconnection_conditions: "Abschaltbedingungen geprüft"
};

function germanDate(value) {
  if (!value) return "-";
  const [year, month, day] = String(value).slice(0, 10).split("-");
  return `${day}.${month}.${year}`;
}

function germanTimestamp(value) {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Berlin"
  }).format(new Date(value));
}

function value(value, suffix = "") {
  return value === null || value === undefined || value === ""
    ? "-"
    : `${value}${suffix}`;
}

function pdfSafeText(value) {
  let safe = "";
  for (const character of String(value ?? "")) {
    const codePoint = character.codePointAt(0);
    if (
      character === "\n"
      || (codePoint >= 32 && codePoint <= 126)
      || (codePoint >= 160 && codePoint <= 255)
    ) {
      safe += character;
    } else {
      safe += PDF_TEXT_REPLACEMENTS.get(character) || "?";
    }
  }
  return safe;
}

function splitPdfWord(word, font, size, width) {
  const chunks = [];
  let chunk = "";
  for (const character of word) {
    const candidate = `${chunk}${character}`;
    if (chunk && font.widthOfTextAtSize(candidate, size) > width) {
      chunks.push(chunk);
      chunk = character;
    } else {
      chunk = candidate;
    }
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}

function wrapText(text, font, size, width) {
  const lines = [];
  for (const paragraph of pdfSafeText(text || "-").replace(/\r/g, "").split("\n")) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean).flatMap(
      (word) => splitPdfWord(word, font, size, width)
    );
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let line = words.shift();
    for (const word of words) {
      const candidate = `${line} ${word}`;
      if (font.widthOfTextAtSize(candidate, size) <= width) line = candidate;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

function inspectionKindLabel(kinds) {
  return [
    kinds?.initial ? "Erstprüfung" : null,
    kinds?.recurring ? "Wiederholungsprüfung" : null,
    kinds?.alteration ? "Änderung / Erweiterung" : null
  ].filter(Boolean).join(", ") || "-";
}

function resultLabel(result) {
  return {
    ok: "Anlage ist in Ordnung",
    operational_with_defects: "Anlage ist mit Mängeln betriebsbereit",
    not_operational: "Anlage ist nicht betriebsbereit"
  }[result] || "-";
}

function checkLabel(result) {
  return {
    ok: "i.O.",
    not_ok: "n.i.O.",
    not_checked: "offen"
  }[result] || "offen";
}

function protectionLabel(device) {
  const current = device?.ratedCurrent ? ` ${device.ratedCurrent} A` : "";
  const characteristic = device?.characteristic || "";
  switch (device?.type) {
    case "mcb":
      return `LS ${characteristic}${current}`.trim();
    case "rcbo":
      return `FI/LS ${characteristic}${current}, Typ ${device.rcdType || "-"}, Idn ${value(device.ratedResidualCurrent, " mA")}`;
    case "fuse_nh":
      return `NH-Sicherung${current}${device.designation ? `, ${device.designation}` : ""}`;
    case "fuse_diazed":
      return `Diazed${current}${device.designation ? `, ${device.designation}` : ""}`;
    case "fuse_neozed":
      return `Neozed${current}${device.designation ? `, ${device.designation}` : ""}`;
    default:
      return device?.designation || `Sonstiges Schutzorgan${current}`;
  }
}

function circuitEvaluation(circuit, upstreamRcd = null) {
  const measurements = circuit.measurements || {};
  const device = circuit.protectiveDevice || {};
  const warnings = [];
  let failed = false;
  const riso = Number(measurements.riso);
  if (!measurements.riso) warnings.push("RISO fehlt");
  else if (Number.isFinite(riso) && riso < 1) {
    warnings.push("RISO < 1 MOhm");
    failed = true;
  }
  if (!measurements.rpe) warnings.push("RPE fehlt");

  const hasRcd = Boolean(upstreamRcd) || device.type === "rcbo";
  if (hasRcd) {
    if (!measurements.rcdTripTime) warnings.push("RCD-Zeit fehlt");
    if (!measurements.rcdTripCurrent) warnings.push("RCD-Strom fehlt");
    const idn = Number(
      device.type === "rcbo"
        ? device.ratedResidualCurrent
        : upstreamRcd?.ratedResidualCurrent
    );
    const tripCurrent = Number(measurements.rcdTripCurrent);
    if (
      Number.isFinite(idn)
      && Number.isFinite(tripCurrent)
      && tripCurrent > idn
    ) {
      warnings.push("RCD-Auslösestrom > Idn");
      failed = true;
    }
  } else if (!measurements.zs && !measurements.ik) {
    warnings.push("Zs oder Ik fehlt");
  }

  return {
    state: failed ? "n.i.O." : warnings.length > 0 ? "prüfen" : "i.O.",
    warnings
  };
}

function allCircuits(protocol) {
  const rows = [];
  for (const distribution of protocol.distributions || []) {
    for (const rcd of distribution.rcds || []) {
      for (const circuit of rcd.circuits || []) {
        rows.push({ distribution, rcd, circuit });
      }
    }
    for (const circuit of distribution.directCircuits || []) {
      rows.push({ distribution, rcd: null, circuit });
    }
  }
  return rows;
}

export async function buildVdeInspectionPdf({
  inspection,
  protocol,
  company,
  context,
  inspectorSignature,
  completedAt,
  companyLogo = null
}) {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  document.setTitle(`VDE-Prüfprotokoll ${inspection.number}`);
  document.setAuthor(company.legalName || company.displayName);
  document.setSubject("Unveränderliches VDE-Prüfprotokoll");
  document.setCreator("Schäfchen");
  document.setProducer("Schäfchen");
  document.setCreationDate(new Date(completedAt));
  document.setModificationDate(new Date(completedAt));

  let logoImage = null;
  if (companyLogo) {
    try {
      logoImage = await document.embedPng(companyLogo);
    } catch {
      logoImage = null;
    }
  }
  const signatureImage = await document.embedPng(inspectorSignature);

  const margin = 38;
  const contentWidth = A4[0] - margin * 2;
  let page;
  let y;

  function drawText(text, options) {
    page.drawText(pdfSafeText(text), options);
  }

  function footer() {
    const pageNumber = document.getPageCount();
    page.drawLine({
      start: { x: margin, y: 34 },
      end: { x: A4[0] - margin, y: 34 },
      thickness: 0.6,
      color: LINE
    });
    const companyLine = [
      company.legalName || company.displayName,
      [company.street, company.houseNumber].filter(Boolean).join(" "),
      [company.postalCode, company.city].filter(Boolean).join(" "),
      company.phone,
      company.email
    ].filter(Boolean).join(" · ");
    drawText(companyLine.slice(0, 130), {
      x: margin,
      y: 20,
      size: 6.5,
      font: regular,
      color: MUTED
    });
    drawText(`${inspection.number} · Seite ${pageNumber}`, {
      x: A4[0] - margin - 118,
      y: 10,
      size: 6.5,
      font: regular,
      color: MUTED
    });
  }

  function addPage(continuationTitle = null) {
    page = document.addPage(A4);
    y = A4[1] - margin;
    if (continuationTitle) {
      drawText(continuationTitle, {
        x: margin,
        y,
        size: 12,
        font: bold,
        color: INK
      });
      drawText(inspection.number, {
        x: A4[0] - margin - 115,
        y,
        size: 8,
        font: regular,
        color: MUTED
      });
      y -= 26;
    }
    footer();
  }

  function ensureSpace(height, continuationTitle = "VDE-Prüfprotokoll · Fortsetzung") {
    if (y - height < 50) addPage(continuationTitle);
  }

  function section(label) {
    ensureSpace(30);
    y -= 5;
    drawText(label.toUpperCase(), {
      x: margin,
      y,
      size: 8,
      font: bold,
      color: RED
    });
    y -= 10;
    page.drawLine({
      start: { x: margin, y },
      end: { x: A4[0] - margin, y },
      thickness: 0.7,
      color: LINE
    });
    y -= 16;
  }

  function keyValue(label, textValue, x, width, labelWidth = 82) {
    drawText(label, {
      x,
      y,
      size: 7.5,
      font: bold,
      color: MUTED
    });
    const lines = wrapText(textValue || "-", regular, 9, width - labelWidth);
    drawText(lines[0] || "-", {
      x: x + labelWidth,
      y,
      size: 9,
      font: regular,
      color: INK
    });
  }

  function paragraph(
    textValue,
    maximumLines = Number.POSITIVE_INFINITY,
    paragraphFont = regular,
    color = INK
  ) {
    const lines = wrapText(textValue || "-", paragraphFont, 9, contentWidth);
    const visibleLines = lines.slice(0, maximumLines);
    for (const line of visibleLines) {
      ensureSpace(14);
      drawText(line || " ", {
        x: margin,
        y,
        size: 9,
        font: paragraphFont,
        color
      });
      y -= 12;
    }
    return lines.slice(visibleLines.length);
  }

  addPage();
  if (logoImage) {
    const boxWidth = 120;
    const boxHeight = 54;
    const scale = Math.min(
      boxWidth / logoImage.width,
      boxHeight / logoImage.height
    );
    page.drawImage(logoImage, {
      x: margin,
      y: y - logoImage.height * scale + 3,
      width: logoImage.width * scale,
      height: logoImage.height * scale
    });
  } else {
    drawText(company.displayName, {
      x: margin,
      y: y - 20,
      size: 14,
      font: bold,
      color: INK
    });
  }
  drawText("VDE-Prüfprotokoll", {
    x: 260,
    y: y - 4,
    size: 19,
    font: bold,
    color: INK
  });
  drawText("DIN VDE 0100-600 / DIN VDE 0105-100", {
    x: 260,
    y: y - 23,
    size: 8,
    font: regular,
    color: MUTED
  });
  drawText(inspection.number, {
    x: 260,
    y: y - 40,
    size: 9,
    font: bold,
    color: RED
  });
  y -= 72;

  section("Prüfung und Auftrag");
  keyValue("Prüfungsname", inspection.name, margin, contentWidth);
  y -= 17;
  keyValue("Auftraggeber", context.customerName, margin, 260);
  keyValue("Prüfdatum", germanDate(inspection.date), 340, 215, 70);
  y -= 17;
  keyValue("Baustelle", `${context.siteNumber} · ${context.siteName}`, margin, 300);
  keyValue("Prüfer", context.inspectorName, 340, 215, 70);
  y -= 17;
  keyValue("Anschrift", context.siteAddress, margin, contentWidth);
  y -= 17;
  keyValue("Prüfungsart", inspectionKindLabel(protocol.inspectionKinds), margin, 300);
  keyValue(
    "Netz",
    `${protocol.networkType} · ${protocol.nominalVoltage}`,
    340,
    215,
    70
  );
  y -= 20;

  section("Besichtigen und Erproben");
  const checks = Object.entries(VISUAL_CHECK_LABELS);
  for (let index = 0; index < checks.length; index += 2) {
    const [leftKey, leftLabel] = checks[index];
    const right = checks[index + 1];
    drawText(leftLabel, {
      x: margin,
      y,
      size: 7.5,
      font: regular,
      color: INK
    });
    drawText(checkLabel(protocol.visualChecks?.[leftKey]), {
      x: 260,
      y,
      size: 7.5,
      font: bold,
      color: protocol.visualChecks?.[leftKey] === "not_ok" ? RED : INK
    });
    if (right) {
      drawText(right[1], {
        x: 310,
        y,
        size: 7.5,
        font: regular,
        color: INK
      });
      drawText(checkLabel(protocol.visualChecks?.[right[0]]), {
        x: 535,
        y,
        size: 7.5,
        font: bold,
        color: protocol.visualChecks?.[right[0]] === "not_ok" ? RED : INK
      });
    }
    y -= 14;
  }
  y -= 5;

  section("Einspeisung und Prüfgerät");
  const incoming = protocol.incomingSupply || {};
  keyValue("Einspeisung", incoming.designation, margin, 260);
  keyValue("Ort", incoming.location, 340, 215, 50);
  y -= 17;
  keyValue("Quelle", incoming.source, margin, 260);
  keyValue("Vorsicherung", incoming.upstreamProtection, 340, 215, 70);
  y -= 17;
  const incomingCable = [
    incoming.cableType,
    incoming.cores ? `${incoming.cores}-adrig` : null,
    incoming.crossSection ? `${incoming.crossSection} mm²` : null
  ].filter(Boolean).join(" ");
  keyValue("Zuleitung", incomingCable, margin, 260);
  const equipment = protocol.testEquipment || {};
  keyValue(
    "Prüfgerät",
    [equipment.manufacturer, equipment.type, equipment.serialNumber]
      .filter(Boolean)
      .join(" · "),
    340,
    215,
    70
  );
  y -= 20;

  section("Ergebnis");
  drawText(resultLabel(protocol.result), {
    x: margin,
    y,
    size: 10,
    font: bold,
    color: protocol.result === "not_operational" ? RED : INK
  });
  y -= 18;
  keyValue(
    "Nächste Prüfung",
    germanDate(protocol.nextInspectionDate),
    margin,
    260
  );
  keyValue(
    "Abgeschlossen",
    germanTimestamp(completedAt),
    340,
    215,
    74
  );
  y -= 19;
  const remainingDefectLines = paragraph(
    protocol.defects || "Keine Mängel oder Hinweise erfasst.",
    5
  );
  y -= 4;

  section("Unterschriften");
  ensureSpace(94);
  const signatureWidth = 190;
  const signatureHeight = 50;
  page.drawRectangle({
    x: margin,
    y: y - signatureHeight,
    width: signatureWidth,
    height: signatureHeight,
    borderColor: LINE,
    borderWidth: 0.7
  });
  const signatureScale = Math.min(
    (signatureWidth - 12) / signatureImage.width,
    (signatureHeight - 8) / signatureImage.height
  );
  page.drawImage(signatureImage, {
    x: margin + 6,
    y: y - signatureHeight + 4,
    width: signatureImage.width * signatureScale,
    height: signatureImage.height * signatureScale
  });
  page.drawLine({
    start: { x: 320, y: y - signatureHeight },
    end: { x: A4[0] - margin, y: y - signatureHeight },
    thickness: 0.7,
    color: LINE
  });
  y -= signatureHeight + 12;
  drawText(`${context.inspectorName} · Prüfer`, {
    x: margin,
    y,
    size: 8,
    font: bold,
    color: INK
  });
  drawText("Auftraggeber / Betreiber · Datum und Unterschrift", {
    x: 320,
    y,
    size: 8,
    font: regular,
    color: MUTED
  });

  addPage("Messwerte und Plausibilität");
  const circuitRows = allCircuits(protocol);

  drawText("Verteilungen, Schutzorgane und zugehörige Messwerte", {
    x: margin,
    y,
    size: 8,
    font: regular,
    color: MUTED
  });
  y -= 22;
  let circuitNumber = 0;
  for (const distribution of protocol.distributions || []) {
    ensureSpace(46, "Messwerte · Fortsetzung");
    page.drawRectangle({
      x: margin,
      y: y - 22,
      width: contentWidth,
      height: 28,
      color: PALE
    });
    drawText(distribution.name || "Verteilung", {
      x: margin + 6,
      y: y - 5,
      size: 9,
      font: bold,
      color: INK
    });
    const feed = [
      distribution.source ? `aus ${distribution.source}` : null,
      distribution.feedCableType,
      distribution.feedCores ? `${distribution.feedCores}-adrig` : null,
      distribution.feedCrossSection
        ? `${distribution.feedCrossSection} mm²`
        : null,
      distribution.feedProtection
        ? `Vorsicherung ${distribution.feedProtection}`
        : null
    ].filter(Boolean).join(" · ");
    drawText(feed.slice(0, 105), {
      x: margin + 6,
      y: y - 17,
      size: 6.8,
      font: regular,
      color: MUTED
    });
    y -= 34;

    const grouped = [
      ...(distribution.rcds || []).map((rcd) => ({
        label: `FI/RCD ${rcd.name || "-"} · Typ ${rcd.type || "-"} · ${value(rcd.ratedCurrent, " A")} · Idn ${value(rcd.ratedResidualCurrent, " mA")}`,
        rcd,
        circuits: rcd.circuits || []
      })),
      {
        label: "Stromkreise ohne vorgeschalteten FI/RCD",
        rcd: null,
        circuits: distribution.directCircuits || []
      }
    ].filter((group) => group.circuits.length > 0);

    for (const group of grouped) {
      ensureSpace(28, "Messwerte · Fortsetzung");
      drawText(group.label.slice(0, 105), {
        x: margin + 4,
        y,
        size: 7.3,
        font: bold,
        color: MUTED
      });
      y -= 13;
      for (const circuit of group.circuits) {
        ensureSpace(
          protocol.detailedInsulationMeasurement ? 58 : 46,
          "Messwerte · Fortsetzung"
        );
        circuitNumber += 1;
        const evaluation = circuitEvaluation(circuit, group.rcd);
        page.drawRectangle({
          x: margin,
          y: y - (protocol.detailedInsulationMeasurement ? 46 : 34),
          width: contentWidth,
          height: protocol.detailedInsulationMeasurement ? 50 : 38,
          borderColor: LINE,
          borderWidth: 0.5
        });
        drawText(`${circuitNumber}. ${circuit.name || "-"}`.slice(0, 75), {
          x: margin + 5,
          y: y - 9,
          size: 8,
          font: bold,
          color: INK
        });
        drawText(protectionLabel(circuit.protectiveDevice).slice(0, 60), {
          x: 310,
          y: y - 9,
          size: 7.3,
          font: regular,
          color: INK
        });
        drawText(
          [
            `RPE ${value(circuit.measurements?.rpe, " Ohm")}`,
            `RISO ${value(circuit.measurements?.riso, " MOhm")}`,
            `Zi ${value(circuit.measurements?.zi, " Ohm")}`,
            `Zs ${value(circuit.measurements?.zs, " Ohm")}`,
            `Ik ${value(circuit.measurements?.ik, " A")}`,
            group.rcd || circuit.protectiveDevice?.type === "rcbo"
              ? `RCD ${value(circuit.measurements?.rcdTripTime, " ms")} / ${value(circuit.measurements?.rcdTripCurrent, " mA")}`
              : null
          ].filter(Boolean).join(" · "),
          {
            x: margin + 5,
            y: y - 21,
            size: 6.8,
            font: regular,
            color: INK
          }
        );
        if (protocol.detailedInsulationMeasurement) {
          drawText(
            [
              `RISO L1-PE ${value(circuit.measurements?.risoL1Pe, " MOhm")}`,
              `L2-PE ${value(circuit.measurements?.risoL2Pe, " MOhm")}`,
              `L3-PE ${value(circuit.measurements?.risoL3Pe, " MOhm")}`,
              `N-PE ${value(circuit.measurements?.risoNPe, " MOhm")}`
            ].join(" · "),
            {
              x: margin + 5,
              y: y - 33,
              size: 6.5,
              font: regular,
              color: MUTED
            }
          );
        }
        drawText(
          `${evaluation.state}${evaluation.warnings.length ? ` · ${evaluation.warnings.join("; ")}` : ""}`.slice(0, 105),
          {
            x: margin + 5,
            y: y - (protocol.detailedInsulationMeasurement ? 44 : 32),
            size: 6.5,
            font: evaluation.state === "i.O." ? regular : bold,
            color: evaluation.state === "n.i.O." ? RED : MUTED
          }
        );
        y -= protocol.detailedInsulationMeasurement ? 54 : 42;
      }
    }
    y -= 4;
  }

  if (circuitRows.length === 0) {
    drawText("Keine Stromkreise erfasst.", {
      x: margin,
      y,
      size: 9,
      font: regular,
      color: MUTED
    });
  }

  if (remainingDefectLines.length > 0) {
    section("Mängel und Hinweise · Fortsetzung");
    paragraph(remainingDefectLines.join("\n"));
  }

  const circuitAppendix = circuitRows.filter(({ circuit, distribution }) => (
    Boolean(circuit.note)
    || `${distribution.name || ""} · ${circuit.name || ""}`.length > 68
    || protectionLabel(circuit.protectiveDevice).length > 55
  ));
  if (circuitAppendix.length > 0) {
    section("Vollständige Stromkreisangaben");
    for (const { distribution, circuit } of circuitAppendix) {
      ensureSpace(34, "Vollständige Stromkreisangaben · Fortsetzung");
      paragraph(
        `${distribution.name || "Verteilung"} · ${circuit.name || "Stromkreis"}`,
        Number.POSITIVE_INFINITY,
        bold
      );
      paragraph(
        `Schutzorgan: ${protectionLabel(circuit.protectiveDevice)}`
      );
      if (circuit.note) {
        paragraph(`Bemerkung: ${circuit.note}`);
      }
      y -= 5;
    }
  }

  if (protocol.circuitDirectoryIncluded) {
    addPage("Stromkreisverzeichnis");
    drawText("Übersicht aller im Prüfprotokoll erfassten Stromkreise", {
      x: margin,
      y,
      size: 8,
      font: regular,
      color: MUTED
    });
    y -= 20;
    drawText("Nr.", {
      x: margin + 4,
      y,
      size: 6.8,
      font: bold,
      color: MUTED
    });
    drawText("Verteilung · Stromkreis", {
      x: margin + 24,
      y,
      size: 6.8,
      font: bold,
      color: MUTED
    });
    drawText("Schutzorgan", {
      x: 315,
      y,
      size: 6.8,
      font: bold,
      color: MUTED
    });
    drawText("Leitung", {
      x: 465,
      y,
      size: 6.8,
      font: bold,
      color: MUTED
    });
    y -= 9;
    page.drawLine({
      start: { x: margin, y },
      end: { x: A4[0] - margin, y },
      thickness: 0.7,
      color: LINE
    });
    y -= 13;

    if (circuitRows.length === 0) {
      drawText("Keine Stromkreise erfasst.", {
        x: margin,
        y,
        size: 9,
        font: regular,
        color: MUTED
      });
    }

    let number = 0;
    for (const row of circuitRows) {
      ensureSpace(26, "Stromkreisverzeichnis · Fortsetzung");
      number += 1;
      page.drawRectangle({
        x: margin,
        y: y - 16,
        width: contentWidth,
        height: 22,
        color: number % 2 === 0 ? PALE : rgb(1, 1, 1)
      });
      drawText(String(number), {
        x: margin + 4,
        y: y - 8,
        size: 7.5,
        font: bold,
        color: INK
      });
      drawText(`${row.distribution.name || "-"} · ${row.circuit.name || "-"}`.slice(0, 62), {
        x: margin + 24,
        y: y - 8,
        size: 7.5,
        font: regular,
        color: INK
      });
      drawText(protectionLabel(row.circuit.protectiveDevice).slice(0, 45), {
        x: 315,
        y: y - 8,
        size: 7.5,
        font: regular,
        color: INK
      });
      drawText([
        row.circuit.cableType,
        row.circuit.cores ? `${row.circuit.cores}x` : null,
        row.circuit.crossSection ? `${row.circuit.crossSection} mm²` : null
      ].filter(Boolean).join(" ").slice(0, 35), {
        x: 465,
        y: y - 8,
        size: 7.5,
        font: regular,
        color: INK
      });
      y -= 22;
    }
  }

  return Buffer.from(await document.save({ useObjectStreams: false }));
}
