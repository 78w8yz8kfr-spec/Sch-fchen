import { readSheet } from "read-excel-file/node";
import { normalizeImportText } from "./assignment-import.mjs";
import { InputError, validateSiteBundle } from "./validation.mjs";

const MAX_ROWS = 500;
const MAX_COLUMNS = 50;
const MAX_SITES = 200;

const HEADERS = Object.freeze({
  customerName: ["kunde", "kundenname", "kunde firma", "firma", "auftraggeber"],
  siteName: ["baustelle", "baustellenname", "bauvorhaben", "einsatzort"],
  projectName: ["projekt", "projektname"],
  installerShortText: ["aufgabe", "kurztext", "monteurtext", "beschreibung"],
  street: ["strasse", "straße"],
  houseNumber: ["hausnummer", "haus nr", "nr", "hnr"],
  postalCode: ["plz", "postleitzahl"],
  city: ["ort", "stadt"]
});

const REQUIRED_HEADERS = ["customerName", "siteName", "street", "houseNumber", "postalCode", "city"];

function displayText(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

function headerKey(value) {
  const normalized = normalizeImportText(value);
  return Object.entries(HEADERS).find(([, aliases]) => aliases.some(
    (alias) => normalizeImportText(alias) === normalized
  ))?.[0] || null;
}

function findHeader(rows) {
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 20); rowIndex += 1) {
    const columns = new Map();
    rows[rowIndex].forEach((value, columnIndex) => {
      const key = headerKey(value);
      if (key && !columns.has(key)) columns.set(key, columnIndex);
    });
    if (REQUIRED_HEADERS.every((key) => columns.has(key))) return { rowIndex, columns };
  }
  throw new InputError(
    "Die Kopfzeile benötigt Kunde, Baustelle, Straße, Hausnummer, PLZ und Ort."
  );
}

export async function parseSiteWorkbook(workbook) {
  let rows;
  try {
    rows = await readSheet(workbook);
  } catch {
    throw new InputError("Die Excel-Datei konnte nicht gelesen werden.");
  }
  return parseSiteWorkbookRows(rows);
}

export function parseSiteWorkbookRows(rows) {
  if (!Array.isArray(rows) || rows.length < 2 || rows.length > MAX_ROWS) {
    throw new InputError("Die Baustellenliste hat eine unerwartete Zeilenanzahl.");
  }
  const maximumColumns = Math.max(...rows.map((row) => Array.isArray(row) ? row.length : 0));
  if (maximumColumns < REQUIRED_HEADERS.length || maximumColumns > MAX_COLUMNS) {
    throw new InputError("Die Baustellenliste hat eine unerwartete Spaltenanzahl.");
  }

  const { rowIndex: headerRowIndex, columns } = findHeader(rows);
  const parsedRows = [];
  const invalidRows = [];
  let sourceRowCount = 0;
  const fileSiteNames = new Set();

  for (let rowIndex = headerRowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const values = Object.fromEntries([...columns].map(([key, column]) => [key, displayText(rows[rowIndex][column])]));
    if (Object.values(values).every((value) => !value)) continue;
    sourceRowCount += 1;
    try {
      const site = validateSiteBundle(values);
      const normalizedSite = normalizeImportText(site.siteName);
      if (fileSiteNames.has(normalizedSite)) {
        throw new InputError("Baustellenname kommt in der Datei mehrfach vor.");
      }
      fileSiteNames.add(normalizedSite);
      parsedRows.push({ ...site, sourceRow: rowIndex + 1 });
    } catch (error) {
      invalidRows.push({ sourceRow: rowIndex + 1, message: error.message });
    }
  }

  if (sourceRowCount === 0) throw new InputError("Die Excel-Datei enthält keine Baustellenzeilen.");
  if (sourceRowCount > MAX_SITES) {
    throw new InputError(`Pro Import sind höchstens ${MAX_SITES} Baustellen erlaubt.`);
  }
  return { sourceRowCount, rows: parsedRows, invalidRows };
}

function uniqueMatch(items, label, value) {
  const matches = items.filter((item) => normalizeImportText(item[value]) === normalizeImportText(label));
  return matches.length === 1 ? matches[0] : matches.length > 1 ? false : null;
}

export function buildSiteImportPreview(plan, existingSites, existingCustomers) {
  const readyRows = [];
  const duplicates = [];
  const conflicts = [...plan.invalidRows];
  for (const row of plan.rows) {
    const existingSite = uniqueMatch(existingSites, row.siteName, "name");
    if (existingSite) {
      duplicates.push({ sourceRow: row.sourceRow, siteName: row.siteName, existingNumber: existingSite.number });
      continue;
    }
    if (existingSite === false) {
      conflicts.push({ sourceRow: row.sourceRow, message: "Baustellenname ist im Bestand nicht eindeutig." });
      continue;
    }
    const customer = uniqueMatch(existingCustomers, row.customerName, "name");
    if (customer === false) {
      conflicts.push({ sourceRow: row.sourceRow, message: "Kundenname ist im Bestand nicht eindeutig." });
      continue;
    }
    readyRows.push({ ...row, customerId: customer?.id || null, customerAction: customer ? "existing" : "new" });
  }
  return {
    sourceRowCount: plan.sourceRowCount,
    readyCount: readyRows.length,
    duplicateCount: duplicates.length,
    conflictCount: conflicts.length,
    duplicates,
    conflicts,
    rows: readyRows.map((row) => ({
      sourceRow: row.sourceRow,
      customerName: row.customerName,
      customerAction: row.customerAction,
      siteName: row.siteName,
      projectName: row.projectName,
      address: `${row.street} ${row.houseNumber}, ${row.postalCode} ${row.city}`
    })),
    readyRows
  };
}
