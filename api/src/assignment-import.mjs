import { readSheet } from "read-excel-file/node";
import { InputError } from "./validation.mjs";

const MAX_WORKBOOK_BYTES = 1_500_000;
const MAX_UNCOMPRESSED_BYTES = 20_000_000;
const MAX_ZIP_ENTRIES = 200;
const MAX_ROWS = 200;
const MAX_COLUMNS = 200;
const MAX_ASSIGNMENTS = 1_000;
const STATUS_HEADER = /urlaub|schule|krank|ü-?std|ülu/i;

function displayText(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

export function normalizeImportText(value) {
  return displayText(value)
    .toLocaleLowerCase("de-DE")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/&/g, " und ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function cleanEmployeeLabel(value) {
  const label = displayText(value).replace(/\s+\d+\s*\.\s*LJ$/i, "").trim();
  if (!label.includes(",")) return label;
  const [lastName, ...firstNameParts] = label.split(",");
  const firstName = firstNameParts.join(" ").trim();
  return firstName ? `${firstName} ${lastName.trim()}` : lastName.trim();
}

function dateKey(value) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return value.toISOString().slice(0, 10);
  }
  const text = displayText(value);
  let match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (match) return text;
  return null;
}

function addDays(date, days) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function columnName(index) {
  let result = "";
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) {
    result = String.fromCharCode(65 + ((value - 1) % 26)) + result;
  }
  return result;
}

function countLabel(values) {
  const result = new Map();
  for (const value of values) result.set(value, (result.get(value) || 0) + 1);
  return [...result.entries()]
    .map(([name, assignments]) => ({ name, assignments }))
    .sort((left, right) => left.name.localeCompare(right.name, "de"));
}

function validateWorkbookArchive(workbook) {
  const minimumEocdOffset = Math.max(0, workbook.length - 65_557);
  let eocdOffset = -1;
  for (let offset = workbook.length - 22; offset >= minimumEocdOffset; offset -= 1) {
    if (workbook.readUInt32LE(offset) === 0x06054b50) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0 || eocdOffset + 22 > workbook.length) {
    throw new InputError("Die ausgewählte Datei ist keine gültige .xlsx-Datei.");
  }

  const diskNumber = workbook.readUInt16LE(eocdOffset + 4);
  const directoryDisk = workbook.readUInt16LE(eocdOffset + 6);
  const entriesOnDisk = workbook.readUInt16LE(eocdOffset + 8);
  const entryCount = workbook.readUInt16LE(eocdOffset + 10);
  const directorySize = workbook.readUInt32LE(eocdOffset + 12);
  const directoryOffset = workbook.readUInt32LE(eocdOffset + 16);
  const commentLength = workbook.readUInt16LE(eocdOffset + 20);
  if (
    diskNumber !== 0
    || directoryDisk !== 0
    || entriesOnDisk !== entryCount
    || entryCount === 0
    || entryCount > MAX_ZIP_ENTRIES
    || directoryOffset + directorySize > eocdOffset
    || eocdOffset + 22 + commentLength !== workbook.length
  ) {
    throw new InputError("Die Excel-Datei hat eine nicht unterstützte Archivstruktur.");
  }

  let offset = directoryOffset;
  let uncompressedBytes = 0;
  const names = new Set();
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > eocdOffset || workbook.readUInt32LE(offset) !== 0x02014b50) {
      throw new InputError("Die Excel-Datei hat ein beschädigtes Dateiverzeichnis.");
    }
    const flags = workbook.readUInt16LE(offset + 8);
    const compression = workbook.readUInt16LE(offset + 10);
    const compressedSize = workbook.readUInt32LE(offset + 20);
    const uncompressedSize = workbook.readUInt32LE(offset + 24);
    const nameLength = workbook.readUInt16LE(offset + 28);
    const extraLength = workbook.readUInt16LE(offset + 30);
    const entryCommentLength = workbook.readUInt16LE(offset + 32);
    const nextOffset = offset + 46 + nameLength + extraLength + entryCommentLength;
    if (
      nextOffset > eocdOffset
      || flags & 0x0001
      || ![0, 8].includes(compression)
      || compressedSize === 0xffffffff
      || uncompressedSize === 0xffffffff
    ) {
      throw new InputError("Die Excel-Datei enthält nicht unterstützte Archivdaten.");
    }
    const name = workbook.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    if (!name || name.includes("\\") || name.split("/").includes("..")) {
      throw new InputError("Die Excel-Datei enthält einen ungültigen Dateipfad.");
    }
    names.add(name);
    uncompressedBytes += uncompressedSize;
    if (uncompressedBytes > MAX_UNCOMPRESSED_BYTES) {
      throw new InputError("Die Excel-Datei ist entpackt zu groß.");
    }
    offset = nextOffset;
  }
  if (offset !== directoryOffset + directorySize) {
    throw new InputError("Die Excel-Datei hat ein beschädigtes Dateiverzeichnis.");
  }
  if (!names.has("[Content_Types].xml") || !names.has("xl/workbook.xml")) {
    throw new InputError("Die ausgewählte Datei ist keine gültige Excel-Arbeitsmappe.");
  }
}

export function validateAssignmentImportPayload(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new InputError("Die Excel-Anfrage ist ungültig.");
  }
  for (const field of ["companyId", "company_id", "userId", "user_id"]) {
    if (Object.hasOwn(body, field)) {
      throw new InputError(`${field} wird ausschließlich vom Server bestimmt.`);
    }
  }
  const rawName = typeof body.fileName === "string" ? body.fileName.trim() : "";
  const fileName = rawName.split(/[\\/]/).at(-1);
  if (!fileName || fileName.length > 200 || !/\.xlsx$/i.test(fileName)) {
    throw new InputError("Bitte eine Excel-Datei im Format .xlsx auswählen.");
  }
  if (
    typeof body.contentBase64 !== "string"
    || body.contentBase64.length < 4
    || body.contentBase64.length > Math.ceil(MAX_WORKBOOK_BYTES * 4 / 3) + 8
    || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.contentBase64)
  ) {
    throw new InputError("Die Excel-Datei ist ungültig oder zu groß.");
  }
  const workbook = Buffer.from(body.contentBase64, "base64");
  if (workbook.length === 0 || workbook.length > MAX_WORKBOOK_BYTES) {
    throw new InputError("Die Excel-Datei darf höchstens 1,5 MB groß sein.");
  }
  if (workbook[0] !== 0x50 || workbook[1] !== 0x4b) {
    throw new InputError("Die ausgewählte Datei ist keine gültige .xlsx-Datei.");
  }
  validateWorkbookArchive(workbook);
  return { fileName, workbook };
}

export async function parseAssignmentWorkbook(workbook) {
  let rows;
  try {
    rows = await readSheet(workbook);
  } catch {
    throw new InputError("Die Excel-Datei konnte nicht gelesen werden.");
  }
  return parseAssignmentWorkbookRows(rows);
}

export function parseAssignmentWorkbookRows(rows) {
  if (!Array.isArray(rows) || rows.length < 4 || rows.length > MAX_ROWS) {
    throw new InputError("Der Excel-Plan hat eine unerwartete Zeilenanzahl.");
  }
  const maximumColumns = Math.max(...rows.map((row) => Array.isArray(row) ? row.length : 0));
  if (maximumColumns < 6 || maximumColumns > MAX_COLUMNS) {
    throw new InputError("Der Excel-Plan hat eine unerwartete Spaltenanzahl.");
  }

  const weekHeaderIndex = rows.findIndex((row) => row.some(
    (cell) => normalizeImportText(cell) === "woche vom"
  ));
  if (weekHeaderIndex < 0 || weekHeaderIndex + 3 >= rows.length) {
    throw new InputError("Die Zeile „Woche vom“ wurde nicht gefunden.");
  }
  const dateValues = rows[weekHeaderIndex].map(dateKey).filter(Boolean);
  if (dateValues.length < 2) {
    throw new InputError("Start- und Enddatum der Woche wurden nicht gefunden.");
  }
  const [weekStart, suppliedWeekEnd] = dateValues;
  const weekEnd = addDays(weekStart, 4);
  if (new Date(`${weekStart}T00:00:00Z`).getUTCDay() !== 1 || suppliedWeekEnd !== weekEnd) {
    throw new InputError("Der Excel-Plan muss eine Woche von Montag bis Freitag enthalten.");
  }

  const siteHeader = rows[weekHeaderIndex + 1];
  const dayHeader = rows[weekHeaderIndex + 2];
  const blocks = [];
  for (let column = 1; column + 4 < maximumColumns; column += 1) {
    const days = dayHeader.slice(column, column + 5).map(normalizeImportText);
    if (days.join("|") !== "mo|die|mi|do|fr") continue;
    const label = displayText(siteHeader[column]);
    if (!label) continue;
    blocks.push({
      column,
      label,
      status: STATUS_HEADER.test(label),
      order: blocks.length + 1
    });
    column += 4;
  }
  if (blocks.length === 0 || blocks.every((block) => block.status)) {
    throw new InputError("Im Excel-Plan wurden keine Baustellenspalten gefunden.");
  }

  const marks = [];
  const statusCounts = new Map();
  for (let rowIndex = weekHeaderIndex + 3; rowIndex < rows.length; rowIndex += 1) {
    const rawEmployee = displayText(rows[rowIndex][0]);
    if (normalizeImportText(rawEmployee) === "vorarbeiter") break;
    if (!rawEmployee) continue;
    const employeeLabel = cleanEmployeeLabel(rawEmployee);
    for (const block of blocks) {
      for (let dayOffset = 0; dayOffset < 5; dayOffset += 1) {
        const marker = displayText(rows[rowIndex][block.column + dayOffset]).toLocaleUpperCase("de-DE");
        if (!marker) continue;
        if (block.status) {
          statusCounts.set(marker, (statusCounts.get(marker) || 0) + 1);
        } else if (marker === "X") {
          marks.push({
            employeeLabel,
            siteLabel: block.label,
            workDate: addDays(weekStart, dayOffset),
            siteOrder: block.order,
            sourceCell: `${columnName(block.column + dayOffset)}${rowIndex + 1}`
          });
        }
      }
    }
  }
  if (marks.length === 0) throw new InputError("Der Excel-Plan enthält keine X-Zuweisungen.");
  if (marks.length > MAX_ASSIGNMENTS) {
    throw new InputError(`Der Excel-Plan enthält mehr als ${MAX_ASSIGNMENTS} Zuweisungen.`);
  }
  return {
    weekStart,
    weekEnd,
    marks,
    statusCounts: Object.fromEntries([...statusCounts.entries()].sort())
  };
}

function aliasIndex(items, aliases) {
  const index = new Map();
  for (const item of items) {
    for (const value of aliases(item)) {
      const key = normalizeImportText(value);
      if (!key) continue;
      if (!index.has(key)) index.set(key, new Map());
      index.get(key).set(item.id, item);
    }
  }
  return index;
}

function oneMatch(index, value) {
  const matches = [...(index.get(normalizeImportText(value))?.values() || [])];
  return matches.length === 1 ? matches[0] : null;
}

function sameSet(left, right) {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

export function buildAssignmentImportPreview(plan, employees, sites, existingAssignments = []) {
  const employeeIndex = aliasIndex(employees, (employee) => [
    `${employee.firstName} ${employee.lastName}`,
    `${employee.lastName}, ${employee.firstName}`,
    employee.personnelNumber
  ]);
  const siteIndex = aliasIndex(sites, (site) => [site.name, site.projectName, site.shortText]);
  const unknownEmployees = [];
  const unknownSites = [];
  const mapped = [];
  const rawGroups = new Map();

  for (const mark of plan.marks) {
    const rawGroupKey = `${normalizeImportText(mark.employeeLabel)}:${mark.workDate}`;
    if (!rawGroups.has(rawGroupKey)) rawGroups.set(rawGroupKey, { marks: [], incomplete: false });
    const group = rawGroups.get(rawGroupKey);
    group.marks.push(mark);
    const employee = oneMatch(employeeIndex, mark.employeeLabel);
    const site = oneMatch(siteIndex, mark.siteLabel);
    if (!employee) {
      unknownEmployees.push(mark.employeeLabel);
      group.incomplete = true;
    }
    if (!site) {
      unknownSites.push(mark.siteLabel);
      group.incomplete = true;
    }
    if (employee && site) mapped.push({ ...mark, employee, site, rawGroupKey });
  }

  const existingGroups = new Map();
  for (const assignment of existingAssignments) {
    const key = `${assignment.employeeId}:${assignment.workDate}`;
    if (!existingGroups.has(key)) existingGroups.set(key, []);
    existingGroups.get(key).push(assignment);
  }

  const completeGroups = new Map();
  for (const row of mapped) {
    if (rawGroups.get(row.rawGroupKey).incomplete) continue;
    const key = `${row.employee.id}:${row.workDate}`;
    if (!completeGroups.has(key)) completeGroups.set(key, []);
    completeGroups.get(key).push(row);
  }

  const readyRows = [];
  const conflicts = [];
  let duplicateCount = 0;
  for (const rows of completeGroups.values()) {
    const uniqueRows = [...new Map(
      rows.sort((left, right) => left.siteOrder - right.siteOrder)
        .map((row) => [row.site.id, row])
    ).values()];
    duplicateCount += rows.length - uniqueRows.length;
    const key = `${uniqueRows[0].employee.id}:${uniqueRows[0].workDate}`;
    const existing = existingGroups.get(key) || [];
    if (existing.length === 0) {
      readyRows.push(...uniqueRows);
      continue;
    }
    const plannedSiteIds = new Set(uniqueRows.map((row) => row.site.id));
    const existingSiteIds = new Set(existing.map((row) => row.siteId));
    if (sameSet(plannedSiteIds, existingSiteIds)) {
      duplicateCount += uniqueRows.length;
    } else {
      conflicts.push({
        employeeName: `${uniqueRows[0].employee.firstName} ${uniqueRows[0].employee.lastName}`,
        workDate: uniqueRows[0].workDate,
        plannedSites: uniqueRows.map((row) => row.site.name),
        existingSites: existing.map((row) => row.siteName)
      });
    }
  }

  const incompleteDayCount = [...rawGroups.values()].filter((group) => group.incomplete).length;
  const publicRows = readyRows.map((row) => ({
    employeeName: `${row.employee.firstName} ${row.employee.lastName}`,
    personnelNumber: row.employee.personnelNumber,
    siteName: row.site.name,
    workDate: row.workDate
  }));
  return {
    weekStart: plan.weekStart,
    weekEnd: plan.weekEnd,
    sourceAssignmentCount: plan.marks.length,
    readyCount: readyRows.length,
    duplicateCount,
    incompleteDayCount,
    ignoredStatusCount: Object.values(plan.statusCounts).reduce((sum, count) => sum + count, 0),
    statusCounts: plan.statusCounts,
    unmatchedEmployees: countLabel(unknownEmployees),
    unmatchedSites: countLabel(unknownSites),
    conflicts,
    rows: publicRows,
    readyRows
  };
}
