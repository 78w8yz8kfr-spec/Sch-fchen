import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const A4 = [595.28, 841.89];
const RED = rgb(0.89, 0.02, 0.08);
const INK = rgb(0.08, 0.08, 0.08);
const MUTED = rgb(0.38, 0.38, 0.38);
const LINE = rgb(0.86, 0.86, 0.86);

function reportTypeLabel(value) {
  return value === "daily" ? "Bautagesbericht" : "Montagebericht";
}

function germanDate(value) {
  if (!value) return "-";
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}.${month}.${year}`;
}

function germanTimestamp(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Berlin"
  }).format(new Date(value));
}

function wrapText(text, font, size, width) {
  const paragraphs = String(text || "-").replace(/\r/g, "").split("\n");
  const lines = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
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

export async function buildFinalReportPdf({
  report,
  company,
  context,
  signatures,
  finalizedAt,
  companyLogo = null
}) {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const title = `${reportTypeLabel(report.reportType)} ${report.number}`;
  document.setTitle(title);
  document.setAuthor(company.legalName || company.displayName);
  document.setSubject("Unveränderliche freigegebene Berichtsausgabe");
  document.setCreator("Schäfchen");
  document.setProducer("Schäfchen");
  document.setCreationDate(new Date(finalizedAt));
  document.setModificationDate(new Date(finalizedAt));

  let logoImage = null;
  if (companyLogo) {
    try {
      logoImage = await document.embedPng(companyLogo);
    } catch {
      logoImage = null;
    }
  }
  const employeeSignature = await document.embedPng(signatures.employee.data);
  const customerSignature = await document.embedPng(signatures.customer.data);

  let page;
  let y;
  const margin = 46;
  const contentWidth = A4[0] - margin * 2;

  function footer() {
    page.drawLine({ start: { x: margin, y: 35 }, end: { x: A4[0] - margin, y: 35 }, thickness: 0.6, color: LINE });
    page.drawText(`Unveränderliche PDF-Ausgabe - Bericht-ID ${report.id}`, {
      x: margin,
      y: 20,
      size: 7.5,
      font: regular,
      color: MUTED
    });
  }

  function addPage(continuation = false) {
    page = document.addPage(A4);
    y = A4[1] - margin;
    if (continuation) {
      page.drawText(`${title} - Fortsetzung`, { x: margin, y, size: 11, font: bold, color: INK });
      y -= 24;
    }
    footer();
  }

  function ensureSpace(height) {
    if (y - height < 55) addPage(true);
  }

  function section(label) {
    ensureSpace(34);
    y -= 8;
    page.drawText(label.toUpperCase(), { x: margin, y, size: 8.5, font: bold, color: RED });
    y -= 10;
    page.drawLine({ start: { x: margin, y }, end: { x: A4[0] - margin, y }, thickness: 0.8, color: LINE });
    y -= 18;
  }

  function keyValue(label, value, x, width) {
    page.drawText(label, { x, y, size: 8, font: bold, color: MUTED });
    const lines = wrapText(value || "-", regular, 10, width);
    lines.slice(0, 3).forEach((line, index) => {
      page.drawText(line, { x, y: y - 14 - index * 12, size: 10, font: regular, color: INK });
    });
  }

  function paragraph(text) {
    const lines = wrapText(text || "-", regular, 10, contentWidth);
    for (const line of lines) {
      ensureSpace(16);
      page.drawText(line || " ", { x: margin, y, size: 10, font: regular, color: INK });
      y -= 14;
    }
  }

  addPage();
  if (logoImage) {
    const boxWidth = 118;
    const boxHeight = 58;
    const scale = Math.min(boxWidth / logoImage.width, boxHeight / logoImage.height);
    page.drawImage(logoImage, {
      x: margin,
      y: y - logoImage.height * scale + 4,
      width: logoImage.width * scale,
      height: logoImage.height * scale
    });
  } else {
    page.drawText(company.displayName, { x: margin, y: y - 22, size: 15, font: bold, color: INK });
  }
  page.drawText(reportTypeLabel(report.reportType), { x: 330, y: y - 4, size: 20, font: bold, color: INK });
  page.drawText(report.number, { x: 330, y: y - 24, size: 10, font: regular, color: MUTED });
  page.drawText("FREIGEGEBEN", { x: 452, y: y - 45, size: 8, font: bold, color: RED });
  y -= 82;

  section("Bericht");
  keyValue("Arbeitstag", germanDate(report.workDate), margin, 145);
  keyValue("Erstellt von", report.authorName, 220, 150);
  keyValue("Freigegeben am", germanTimestamp(finalizedAt), 405, 140);
  y -= 46;
  keyValue("Titel", report.summary, margin, contentWidth);
  y -= 48;

  section("Auftrag");
  keyValue("Kunde", context.customerName, margin, 230);
  keyValue("Projekt", `${context.projectNumber} - ${context.projectName}`, 310, 240);
  y -= 45;
  keyValue("Baustelle", `${context.siteNumber} - ${context.siteName}`, margin, 230);
  keyValue("Anschrift", context.siteAddress, 310, 240);
  y -= 48;

  section("Ausgeführte Arbeiten und Hinweise");
  paragraph(report.details || "Keine zusätzlichen Angaben.");
  y -= 8;

  section("Unterschriften");
  ensureSpace(150);
  const signatureWidth = 210;
  const signatureHeight = 74;
  page.drawRectangle({ x: margin, y: y - signatureHeight, width: signatureWidth, height: signatureHeight, borderColor: LINE, borderWidth: 0.8 });
  page.drawRectangle({ x: 335, y: y - signatureHeight, width: signatureWidth, height: signatureHeight, borderColor: LINE, borderWidth: 0.8 });
  const employeeScale = Math.min((signatureWidth - 16) / employeeSignature.width, (signatureHeight - 12) / employeeSignature.height);
  const customerScale = Math.min((signatureWidth - 16) / customerSignature.width, (signatureHeight - 12) / customerSignature.height);
  page.drawImage(employeeSignature, {
    x: margin + 8,
    y: y - signatureHeight + 6,
    width: employeeSignature.width * employeeScale,
    height: employeeSignature.height * employeeScale
  });
  page.drawImage(customerSignature, {
    x: 343,
    y: y - signatureHeight + 6,
    width: customerSignature.width * customerScale,
    height: customerSignature.height * customerScale
  });
  y -= signatureHeight + 14;
  page.drawText(signatures.employee.name, { x: margin, y, size: 9.5, font: bold, color: INK });
  page.drawText(signatures.customer.name, { x: 335, y, size: 9.5, font: bold, color: INK });
  y -= 13;
  page.drawText("Mitarbeiter / Vorarbeiter", { x: margin, y, size: 8, font: regular, color: MUTED });
  page.drawText("Auftraggeber / Kunde", { x: 335, y, size: 8, font: regular, color: MUTED });
  y -= 13;
  page.drawText(`Signiert: ${germanTimestamp(finalizedAt)}`, { x: margin, y, size: 7.5, font: regular, color: MUTED });
  page.drawText(`Signiert: ${germanTimestamp(finalizedAt)}`, { x: 335, y, size: 7.5, font: regular, color: MUTED });

  const companyLine = [
    company.legalName,
    [company.street, company.houseNumber].filter(Boolean).join(" "),
    [company.postalCode, company.city].filter(Boolean).join(" "),
    company.phone,
    company.email
  ].filter(Boolean).join(" - ");
  ensureSpace(38);
  y -= 28;
  page.drawText(companyLine, { x: margin, y, size: 7.5, font: regular, color: MUTED, maxWidth: contentWidth });

  return Buffer.from(await document.save({ useObjectStreams: false }));
}
