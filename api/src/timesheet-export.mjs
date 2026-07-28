import { strToU8, zipSync } from "fflate";

const statusLabels = {
  in_progress: "In Arbeit",
  completed: "Abgeschlossen",
  billed: "Abgerechnet",
  approved: "Freigegeben",
  locked: "Abgerechnet"
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

function localTimeText(value, timeZone) {
  if (!value) return "";
  return new Intl.DateTimeFormat("de-DE", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).format(new Date(value));
}

function localTimestampText(value, timeZone) {
  if (!value) return "";
  return new Intl.DateTimeFormat("de-DE", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).format(new Date(value)).replace(",", "");
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

function formulaCell(reference, formula, cachedValue, style = 0) {
  return `<c r="${reference}"${style ? ` s="${style}"` : ""}><f>${xml(formula)}</f><v>${
    Number(cachedValue) || 0
  }</v></c>`;
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

function cell(value, type = "text", style = 0, formula = null) {
  return { value, type, style, formula };
}

function renderCell(cellValue, columnIndex, rowNumber) {
  const reference = `${columnName(columnIndex)}${rowNumber}`;
  if (cellValue.type === "formula") {
    return formulaCell(reference, cellValue.formula, cellValue.value, cellValue.style || 0);
  }
  if (cellValue.type === "number") {
    return numberCell(reference, cellValue.value, cellValue.style || 0);
  }
  return textCell(reference, cellValue.value, cellValue.style || 0);
}

function tableWorksheetXml({
  widths,
  title,
  subtitle,
  headers,
  rows,
  mergeEnd,
  filterEnd,
  orientation = "landscape"
}) {
  const dataRows = rows.map((row, rowIndex) => {
    const rowNumber = rowIndex + 5;
    return rowXml(rowNumber, row.map((value, columnIndex) => renderCell(value, columnIndex, rowNumber)));
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
    ${rowXml(1, [textCell("A1", title, 1)], { height: 34 })}
    ${rowXml(2, [textCell("A2", subtitle, 2)], { height: 24 })}
    ${rowXml(3, [])}
    ${rowXml(4, headers.map((header, index) => textCell(`${columnName(index)}4`, header, 3)), { height: 28 })}
    ${dataRows}
  </sheetData>
  <autoFilter ref="A4:${filterEnd}${lastRow}"/>
  <mergeCells count="2"><mergeCell ref="A1:${mergeEnd}1"/><mergeCell ref="A2:${mergeEnd}2"/></mergeCells>
  <pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>
  <pageSetup orientation="${orientation}" fitToWidth="1" fitToHeight="0" paperSize="9"/>
  <headerFooter><oddFooter>Schäfchen · Seite &amp;P von &amp;N</oddFooter></headerFooter>
</worksheet>`;
}

function employeeWorksheetXml({
  employeeName,
  personnelNumber,
  from,
  to,
  created,
  rows,
  totals
}) {
  const headers = [
    "Datum", "Status", "Erster Start", "Letztes Ende", "Soll", "Brutto",
    "Pause", "Gearbeitet", "Fahrt", "Mehrzeit", "Baustellen", "Plausibilität"
  ];
  const firstDataRow = 6;
  const lastDataRow = firstDataRow + rows.length - 1;
  const totalRow = lastDataRow + 1;
  const renderedRows = rows.map((row, rowIndex) => {
    const rowNumber = firstDataRow + rowIndex;
    return rowXml(rowNumber, row.map((value, columnIndex) => renderCell(value, columnIndex, rowNumber)));
  }).join("");
  const durationTotal = (column, value) => cell(
    Math.max(0, Number(value || 0)) / 1440,
    "formula",
    11,
    `SUM(${column}${firstDataRow}:${column}${lastDataRow})`
  );
  const totalCells = [
    cell("Gesamtsumme", "text", 10),
    cell(""),
    cell(""),
    cell(""),
    durationTotal("E", totals.targetWorkMinutes),
    durationTotal("F", totals.grossMinutes),
    durationTotal("G", totals.breakMinutes),
    durationTotal("H", totals.workMinutes),
    durationTotal("I", totals.travelMinutes),
    durationTotal("J", totals.overtimeMinutes),
    cell(""),
    cell("")
  ];
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
  <dimension ref="A1:L${totalRow}"/>
  <sheetViews>
    <sheetView workbookViewId="0">
      <pane ySplit="5" topLeftCell="A6" activePane="bottomLeft" state="frozen"/>
      <selection pane="bottomLeft" activeCell="A6" sqref="A6"/>
    </sheetView>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  ${columnXml([13, 18, 20, 20, 12, 12, 12, 14, 12, 12, 34, 42])}
  <sheetData>
    ${rowXml(1, [textCell("A1", `${employeeName} · Stundenzettel`, 1)], { height: 34 })}
    ${rowXml(2, [textCell(
      "A2",
      `Personalnummer ${personnelNumber} · Zeitraum ${from} bis ${to} · erstellt ${created}`,
      2
    )], { height: 24 })}
    ${rowXml(3, [
      textCell("A3", "Gearbeitet", 8),
      numberCell("B3", totals.workMinutes / 1440, 9),
      textCell("C3", "Pause", 8),
      numberCell("D3", totals.breakMinutes / 1440, 9),
      textCell("E3", "Fahrt", 8),
      numberCell("F3", totals.travelMinutes / 1440, 9),
      textCell("G3", "Mehrzeit", 8),
      numberCell("H3", totals.overtimeMinutes / 1440, 9)
    ], { height: 27 })}
    ${rowXml(4, [])}
    ${rowXml(5, headers.map((header, index) => textCell(`${columnName(index)}5`, header, 3)), { height: 28 })}
    ${renderedRows}
    ${rowXml(totalRow, totalCells.map((value, columnIndex) => renderCell(value, columnIndex, totalRow)), { height: 26 })}
  </sheetData>
  <autoFilter ref="A5:L${lastDataRow}"/>
  <mergeCells count="3"><mergeCell ref="A1:L1"/><mergeCell ref="A2:L2"/><mergeCell ref="A${totalRow}:D${totalRow}"/></mergeCells>
  <pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>
  <pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0" paperSize="9"/>
  <headerFooter><oddFooter>${xml(employeeName)} · Seite &amp;P von &amp;N</oddFooter></headerFooter>
</worksheet>`;
}

function safeSheetName(value, usedNames) {
  const cleaned = String(value || "Mitarbeiter")
    .replace(/[\\/?*[\]:]/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "Mitarbeiter";
  let name = cleaned.slice(0, 31);
  let suffix = 2;
  while (usedNames.has(name.toLocaleLowerCase("de-DE"))) {
    const ending = ` (${suffix})`;
    name = `${cleaned.slice(0, 31 - ending.length)}${ending}`;
    suffix += 1;
  }
  usedNames.add(name.toLocaleLowerCase("de-DE"));
  return name;
}

function workbookFiles(sheets, companyName) {
  const now = new Date().toISOString();
  const sheetOverrides = sheets.map((_, index) => (
    `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
  )).join("");
  const sheetNodes = sheets.map((sheet, index) => (
    `<sheet name="${xml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`
  )).join("");
  const sheetRelationships = sheets.map((_, index) => (
    `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`
  )).join("");
  const titles = sheets.map((sheet) => `<vt:lpstr>${xml(sheet.name)}</vt:lpstr>`).join("");
  const files = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  ${sheetOverrides}
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
  <TitlesOfParts><vt:vector size="${sheets.length}" baseType="lpstr">${titles}</vt:vector></TitlesOfParts>
</Properties>`),
    "xl/workbook.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <bookViews><workbookView xWindow="0" yWindow="0" windowWidth="28800" windowHeight="16000"/></bookViews>
  <sheets>${sheetNodes}</sheets>
  <calcPr calcId="191029" fullCalcOnLoad="1"/>
</workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheetRelationships}
  <Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`),
    "xl/styles.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="3"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/><numFmt numFmtId="165" formatCode="dd.mm.yyyy hh:mm"/><numFmt numFmtId="166" formatCode="[h]:mm"/></numFmts>
  <fonts count="5">
    <font><sz val="11"/><name val="Aptos"/></font>
    <font><b/><sz val="18"/><color rgb="FFFFFFFF"/><name val="Aptos Display"/></font>
    <font><i/><sz val="10"/><color rgb="FF4B5563"/><name val="Aptos"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font>
    <font><b/><sz val="11"/><color rgb="FF171717"/><name val="Aptos"/></font>
  </fonts>
  <fills count="6">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFBA1A21"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF171717"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFE8A3"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFF3F3"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left/><right/><top style="thin"><color rgb="FFD9D9D9"/></top><bottom/><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="12">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="3" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top"/></xf>
    <xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top"/></xf>
    <xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top"/></xf>
    <xf numFmtId="0" fontId="0" fillId="4" borderId="0" xfId="0" applyFill="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="4" fillId="5" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="166" fontId="4" fillId="5" borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="166" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`)
  };
  sheets.forEach((sheet, index) => {
    files[`xl/worksheets/sheet${index + 1}.xml`] = strToU8(sheet.content);
  });
  return files;
}

function sumEmployeeDays(days) {
  const fields = [
    "targetWorkMinutes",
    "grossMinutes",
    "breakMinutes",
    "workMinutes",
    "travelMinutes",
    "overtimeMinutes"
  ];
  return Object.fromEntries(fields.map((field) => [
    field,
    days.reduce((sum, day) => sum + Math.max(0, Number(day[field] || 0)), 0)
  ]));
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
  const employees = new Map();
  [...workDays]
    .sort((left, right) => (
      left.employeeName.localeCompare(right.employeeName, "de-DE")
      || left.workDate.localeCompare(right.workDate)
    ))
    .forEach((day) => {
      const key = `${day.personnelNumber}\u0000${day.employeeName}`;
      if (!employees.has(key)) {
        employees.set(key, {
          employeeName: day.employeeName,
          personnelNumber: day.personnelNumber,
          days: []
        });
      }
      employees.get(key).days.push(day);
    });

  const employeeGroups = [...employees.values()];
  const overviewRows = employeeGroups.map((employee) => {
    const totals = sumEmployeeDays(employee.days);
    return [
      cell(employee.personnelNumber),
      cell(employee.employeeName),
      cell(employee.days.length, "number"),
      cell(totals.targetWorkMinutes / 1440, "number", 6),
      cell(totals.workMinutes / 1440, "number", 6),
      cell(totals.breakMinutes / 1440, "number", 6),
      cell(totals.travelMinutes / 1440, "number", 6),
      cell(totals.overtimeMinutes / 1440, "number", 6)
    ];
  });
  const sheets = [{
    name: "Übersicht",
    content: tableWorksheetXml({
      widths: [16, 27, 12, 14, 16, 13, 13, 14],
      title: `${companyName} · Stundenzettel`,
      subtitle: `Zeitraum ${from} bis ${to} · erstellt ${created}`,
      headers: ["Personalnr.", "Mitarbeiter", "Arbeitstage", "Soll", "Gearbeitet", "Pause", "Fahrt", "Mehrzeit"],
      rows: overviewRows,
      mergeEnd: "H",
      filterEnd: "H"
    })
  }];

  const usedSheetNames = new Set(["übersicht", "buchungen"]);
  employeeGroups.forEach((employee) => {
    const totals = sumEmployeeDays(employee.days);
    const rows = employee.days.map((day) => {
      const warningText = day.warnings.map((warning) => warning.message).join(" · ");
      return [
        cell(excelDateSerial(day.workDate), "number", 4),
        cell(
          statusLabels[day.approvalStatus]
          || statusLabels[day.workflowStatus]
          || day.workflowStatus
        ),
        cell(localTimeText(day.firstClockInAt, timeZone)),
        cell(localTimeText(day.lastClockOutAt, timeZone)),
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
    sheets.push({
      name: safeSheetName(`${employee.personnelNumber} ${employee.employeeName}`, usedSheetNames),
      content: employeeWorksheetXml({
        employeeName: employee.employeeName,
        personnelNumber: employee.personnelNumber,
        from,
        to,
        created,
        rows,
        totals
      })
    });
  });

  const entryRows = [...entries]
    .sort((left, right) => (
      left.employeeName.localeCompare(right.employeeName, "de-DE")
      || left.workDate.localeCompare(right.workDate)
      || String(left.recordedAt).localeCompare(String(right.recordedAt))
    ))
    .map((entry) => [
      cell(entry.personnelNumber),
      cell(entry.employeeName),
      cell(excelDateSerial(entry.workDate), "number", 4),
      cell(localTimestampText(entry.recordedAt, timeZone)),
      cell(entryLabels[entry.entryType] || entry.entryType),
      cell(entry.siteName || ""),
      cell(entry.source),
      cell(entry.historyStatus || "Wirksam"),
      cell(entry.reason || ""),
      cell(entry.reviewedByName || ""),
      cell(localTimestampText(entry.reviewedAt, timeZone)),
      cell(entry.id || ""),
      cell(entry.originalEntryId || "")
    ]);
  sheets.push({
    name: "Buchungen",
    content: tableWorksheetXml({
      widths: [14, 25, 13, 20, 24, 34, 16, 22, 42, 24, 20, 38, 38],
      title: `${companyName} · Einzelbuchungen`,
      subtitle: `Unveränderliche Zeitleiste für ${from} bis ${to} · nach Mitarbeiter und Datum sortiert`,
      headers: [
        "Personalnr.", "Mitarbeiter", "Arbeitstag", "Zeitpunkt",
        "Buchungsart", "Baustelle", "Quelle", "Historie", "Begründung",
        "Geprüft von", "Geprüft am", "Buchungs-ID", "Original-ID"
      ],
      rows: entryRows,
      mergeEnd: "M",
      filterEnd: "M"
    })
  });

  return Buffer.from(zipSync(workbookFiles(sheets, companyName), { level: 6 }));
}
