import { strToU8, zipSync } from "fflate";

const statusLabels = {
  in_progress: "In Arbeit",
  completed: "Abgeschlossen",
  billed: "Abgerechnet"
};

const entryLabels = {
  clock_in: "Arbeitsbeginn",
  site_arrival: "Ankunft Baustelle",
  site_departure: "Abfahrt Baustelle",
  next_site: "Nächste Baustelle",
  clock_out: "Feierabend"
};

function xml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function columnName(index) {
  let value = index + 1;
  let name = "";
  while (value > 0) {
    value -= 1;
    name = String.fromCharCode(65 + (value % 26)) + name;
    value = Math.floor(value / 26);
  }
  return name;
}

function excelDateSerial(value) {
  const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000 + 25569;
}

function excelDateTimeSerial(value, timeZone) {
  if (!value) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date(value));
  const part = (type) => Number(parts.find((item) => item.type === type)?.value);
  return Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour"),
    part("minute"),
    part("second")
  ) / 86_400_000 + 25569;
}

function textCell(reference, value, style = 0) {
  const text = String(value ?? "");
  const preserve = /^\s|\s$|\n/.test(text) ? ' xml:space="preserve"' : "";
  return `<c r="${reference}" t="inlineStr"${style ? ` s="${style}"` : ""}><is><t${preserve}>${xml(text)}</t></is></c>`;
}

function numberCell(reference, value, style = 0) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return `<c r="${reference}"${style ? ` s="${style}"` : ""}/>`;
  }
  return `<c r="${reference}"${style ? ` s="${style}"` : ""}><v>${Number(value)}</v></c>`;
}

function rowXml(rowNumber, cells, options = {}) {
  const attributes = [
    `r="${rowNumber}"`,
    options.height ? `ht="${options.height}" customHeight="1"` : null
  ].filter(Boolean).join(" ");
  return `<row ${attributes}>${cells.join("")}</row>`;
}

function columnXml(widths) {
  return `<cols>${widths.map((width, index) => (
    `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`
  )).join("")}</cols>`;
}

function worksheetXml({
  widths,
  title,
  subtitle,
  headers,
  rows,
  mergeEnd,
  filterEnd,
  orientation = "landscape"
}) {
  const titleCells = [textCell("A1", title, 1)];
  const subtitleCells = [textCell("A2", subtitle, 2)];
  const headerCells = headers.map((header, index) => textCell(`${columnName(index)}4`, header, 3));
  const dataRows = rows.map((row, rowIndex) => {
    const rowNumber = rowIndex + 5;
    return rowXml(
      rowNumber,
      row.map((cell, columnIndex) => {
        const reference = `${columnName(columnIndex)}${rowNumber}`;
        if (cell.type === "number") return numberCell(reference, cell.value, cell.style || 0);
        return textCell(reference, cell.value, cell.style || 0);
      })
    );
  }).join("");
  const lastRow = Math.max(4, rows.length + 4);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
  <dimension ref="A1:${filterEnd}${lastRow}"/>
  <sheetViews>
    <sheetView workbookViewId="0">
      <pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/>
      <selection pane="bottomLeft" activeCell="A5" sqref="A5"/>
    </sheetView>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  ${columnXml(widths)}
  <sheetData>
    ${rowXml(1, titleCells, { height: 34 })}
    ${rowXml(2, subtitleCells, { height: 24 })}
    ${rowXml(3, [])}
    ${rowXml(4, headerCells, { height: 28 })}
    ${dataRows}
  </sheetData>
  <autoFilter ref="A4:${filterEnd}${lastRow}"/>
  <mergeCells count="2"><mergeCell ref="A1:${mergeEnd}1"/><mergeCell ref="A2:${mergeEnd}2"/></mergeCells>
  <pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>
  <pageSetup orientation="${orientation}" fitToWidth="1" fitToHeight="0" paperSize="9"/>
  <headerFooter><oddFooter>Schäfchen · Seite &amp;P von &amp;N</oddFooter></headerFooter>
</worksheet>`;
}

function workbookFiles(sheetOne, sheetTwo, companyName) {
  const now = new Date().toISOString();
  return {
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`),
    "docProps/core.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:creator>Schäfchen</dc:creator>
  <cp:lastModifiedBy>Schäfchen</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`),
    "docProps/app.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Schäfchen</Application>
  <Company>${xml(companyName)}</Company>
  <TitlesOfParts><vt:vector size="2" baseType="lpstr"><vt:lpstr>Stundenzettel</vt:lpstr><vt:lpstr>Buchungen</vt:lpstr></vt:vector></TitlesOfParts>
</Properties>`),
    "xl/workbook.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <bookViews><workbookView xWindow="0" yWindow="0" windowWidth="28800" windowHeight="16000"/></bookViews>
  <sheets><sheet name="Stundenzettel" sheetId="1" r:id="rId1"/><sheet name="Buchungen" sheetId="2" r:id="rId2"/></sheets>
  <calcPr calcId="191029" fullCalcOnLoad="1"/>
</workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`),
    "xl/styles.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="3"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/><numFmt numFmtId="165" formatCode="dd.mm.yyyy hh:mm"/><numFmt numFmtId="166" formatCode="[h]:mm"/></numFmts>
  <fonts count="4">
    <font><sz val="11"/><name val="Aptos"/></font>
    <font><b/><sz val="18"/><color rgb="FFFFFFFF"/><name val="Aptos Display"/></font>
    <font><i/><sz val="10"/><color rgb="FF4B5563"/><name val="Aptos"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font>
  </fonts>
  <fills count="5">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFBA1A21"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF171717"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFE8A3"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="8">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="3" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top"/></xf>
    <xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top"/></xf>
    <xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top"/></xf>
    <xf numFmtId="0" fontId="0" fillId="4" borderId="0" xfId="0" applyFill="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`),
    "xl/worksheets/sheet1.xml": strToU8(sheetOne),
    "xl/worksheets/sheet2.xml": strToU8(sheetTwo)
  };
}

function cell(value, type = "text", style = 0) {
  return { value, type, style };
}

export async function buildTimesheetWorkbook({
  companyName,
  from,
  to,
  workDays,
  entries,
  timeZone = "Europe/Berlin"
}) {
  const created = new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date());
  const overviewRows = workDays.map((day) => {
    const warningText = day.warnings.map((warning) => warning.message).join(" · ");
    return [
      cell(day.personnelNumber),
      cell(day.employeeName),
      cell(excelDateSerial(day.workDate), "number", 4),
      cell(statusLabels[day.workflowStatus] || day.workflowStatus),
      cell(excelDateTimeSerial(day.firstClockInAt, timeZone), "number", 5),
      cell(excelDateTimeSerial(day.lastClockOutAt, timeZone), "number", 5),
      cell(Math.max(0, Number(day.targetWorkMinutes || 0)) / 1440, "number", 6),
      cell(Math.max(0, Number(day.grossMinutes || 0)) / 1440, "number", 6),
      cell(Math.max(0, Number(day.breakMinutes || 0)) / 1440, "number", 6),
      cell(Math.max(0, Number(day.workMinutes || 0)) / 1440, "number", 6),
      cell(Math.max(0, Number(day.travelMinutes || 0)) / 1440, "number", 6),
      cell(Math.max(0, Number(day.overtimeMinutes || 0)) / 1440, "number", 6),
      cell(day.siteNames.join(", ")),
      cell(warningText, "text", warningText ? 7 : 0)
    ];
  });
  const entryRows = entries.map((entry) => [
    cell(entry.personnelNumber),
    cell(entry.employeeName),
    cell(excelDateSerial(entry.workDate), "number", 4),
    cell(excelDateTimeSerial(entry.recordedAt, timeZone), "number", 5),
    cell(entryLabels[entry.entryType] || entry.entryType),
    cell(entry.siteName || ""),
    cell(entry.source),
    cell(entry.historyStatus || "Wirksam"),
    cell(entry.reason || ""),
    cell(entry.reviewedByName || ""),
    cell(excelDateTimeSerial(entry.reviewedAt, timeZone), "number", 5),
    cell(entry.id || ""),
    cell(entry.originalEntryId || "")
  ]);

  const sheetOne = worksheetXml({
    widths: [14, 25, 13, 18, 20, 20, 12, 12, 12, 12, 12, 12, 34, 42],
    title: `${companyName} · Stundenzettel`,
    subtitle: `Zeitraum ${from} bis ${to} · erstellt ${created}`,
    headers: [
      "Personalnr.", "Mitarbeiter", "Datum", "Status", "Erster Start",
      "Letztes Ende", "Soll", "Brutto", "Pause", "Arbeit", "Fahrt",
      "Mehrzeit", "Baustellen", "Plausibilität"
    ],
    rows: overviewRows,
    mergeEnd: "N",
    filterEnd: "N"
  });
  const sheetTwo = worksheetXml({
    widths: [14, 25, 13, 20, 24, 34, 16, 22, 42, 24, 20, 38, 38],
    title: `${companyName} · Einzelbuchungen`,
    subtitle: `Unveränderliche Zeitleiste für ${from} bis ${to}`,
    headers: [
      "Personalnr.", "Mitarbeiter", "Arbeitstag", "Zeitpunkt",
      "Buchungsart", "Baustelle", "Quelle", "Historie", "Begründung",
      "Geprüft von", "Geprüft am", "Buchungs-ID", "Original-ID"
    ],
    rows: entryRows,
    mergeEnd: "M",
    filterEnd: "M"
  });

  return Buffer.from(zipSync(workbookFiles(sheetOne, sheetTwo, companyName), { level: 6 }));
}
