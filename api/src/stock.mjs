// Lagerverwaltung: Endpunkte unter /api/v1/stock/*.
//
// Die Signatur von `handleStockRequest` ist absichtlich dieselbe wie die von
// `handleDeviceRequest`. Beim Einpflegen wandert diese Datei nach
// `api/src/stock.mjs`, die beiden Importe verkuerzen sich auf `./`, und in
// `app.mjs` kommt derselbe Block hinzu, den Maschinen & Geraete schon hat.
//
// company_id und user_id kommen ausschliesslich aus dem serverseitig
// aufgeloesten Sitzungscookie. Ein gescannter Code wird immer erst innerhalb
// dieses Mandanten aufgeloest; ein unbekannter, widerrufener oder fremder Code
// bekommt dieselbe Antwort, damit niemand ueber die Fehlermeldung erfaehrt, ob
// es den Artikel anderswo gibt.

import { toString as qrToString } from "qrcode";
import { InputError, readJson, validateId } from "../../api/src/validation.mjs";
import { loadCompanyModules } from "../../api/src/company-modules.mjs";

export const STOCK_MODULE_KEY = "warehouse";

// Der Lagerist fuehrt das Lager, ohne sonst Buerorechte zu haben. Er steht
// deshalb hier und nicht in einer allgemeinen Verwaltungsliste: wer das Lager
// fuehrt, braucht dafuer weder Kundendaten noch Projektsteuerung.
const MANAGER_ROLES = new Set([
  "admin", "managing_director", "dispatch_office", "office", "planner",
  "executive_assistant", "warehouse_manager"
]);
const TRANSFER_ROLES = new Set([...MANAGER_ROLES, "foreman"]);

// Wer welche Buchung ausloesen darf. Entnahme und Rueckgabe kann jeder, der
// das Modul sieht - das ist der Alltag des Monteurs. Umlagern setzt den
// Ueberblick des Vorarbeiters voraus. Anfangsbestand, Wareneingang, Korrektur
// und Verschrottung gehoeren ins Buero, weil sie den Bestand aus dem Nichts
// veraendern.
const MOVEMENT_TYPES = new Map([
  ["issue", "alle"],
  ["return", "alle"],
  // Verbaut meldet, wer verbaut hat. Das ist der Monteur auf der Baustelle,
  // nicht das Buero - und niemand sonst weiss es frueher.
  ["consumed", "alle"],
  ["transfer", "vorarbeiter"],
  ["opening", "verwaltung"],
  ["receipt", "verwaltung"],
  ["correction", "verwaltung"],
  ["scrap", "verwaltung"]
]);

const SOURCE_TYPES = new Set(["api", "qr_scan", "offline_sync", "import"]);
// Ein Fahrzeug ist der haeufigste Lagerort im Betrieb, und Retoure und
// Sperrbestand sind fachlich eigene Orte: was zum Lieferanten zurueck soll
// oder beschaedigt ist, darf im normalen Bestand nicht mitgezaehlt werden.
const LOCATION_TYPES = new Set([
  "warehouse", "workshop", "construction_site", "vehicle",
  "returns", "blocked", "other"
]);
// Diese beiden Arten haengen an einem anderen Datensatz und tragen ihren
// Namen nicht selbst.
const LOCATION_TARGET_FIELD = new Map([
  ["construction_site", "constructionSiteId"],
  ["vehicle", "vehicleId"]
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requiredText(value, label, maximum = 200, minimum = 1) {
  if (typeof value !== "string") throw new InputError(`${label} fehlt.`);
  const normalized = value.trim();
  if (normalized.length < minimum || normalized.length > maximum) {
    throw new InputError(`${label} hat eine ungültige Länge.`);
  }
  return normalized;
}

function optionalText(value, label, maximum = 500) {
  if (value === undefined || value === null || value === "") return null;
  return requiredText(value, label, maximum);
}

function optionalId(value, label) {
  if (value === undefined || value === null || value === "") return null;
  return validateId(value, label);
}

/**
 * Mengen werden als Zeichenkette an PostgreSQL uebergeben. Eine Gleitkommazahl
 * wuerde beim Weg durch JSON und Treiber stellenweise abweichen, und beim
 * Bestand faellt das irgendwann als unerklaerliche Differenz auf.
 */
function quantity(value, label = "Menge") {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new InputError(`${label} fehlt.`);
  }
  if (value <= 0 || value > 999999999) {
    throw new InputError(`${label} ist ungültig.`);
  }
  const rounded = Math.round(value * 1000) / 1000;
  if (Math.abs(rounded - value) > 1e-9) {
    throw new InputError(`${label} hat höchstens drei Nachkommastellen.`);
  }
  return rounded.toFixed(3);
}

function optionalQuantity(value, label) {
  if (value === undefined || value === null || value === "") return null;
  if (value === 0) return "0.000";
  return quantity(value, label);
}

function number(value) {
  return value === null || value === undefined ? null : Number(value);
}

async function roleKeys(client, context) {
  const result = await client.query(
    `SELECT role.role_key
     FROM user_roles AS assignment
     JOIN roles AS role ON role.company_id = assignment.company_id AND role.id = assignment.role_id
     WHERE assignment.company_id = $1 AND assignment.user_id = $2
       AND assignment.revoked_at IS NULL AND role.status = 'active'`,
    [context.companyId, context.userId]
  );
  return new Set(result.rows.map((row) => row.role_key));
}

async function requireModule(client, context) {
  const modules = await loadCompanyModules(client, context);
  if (!modules.find((module) => module.key === STOCK_MODULE_KEY)?.enabled) {
    throw new InputError(
      "Die Lagerverwaltung ist für diese Firma nicht freigeschaltet.",
      403,
      "stock_module_disabled"
    );
  }
}

async function requireManager(client, context) {
  const roles = await roleKeys(client, context);
  if (![...roles].some((role) => MANAGER_ROLES.has(role))) {
    throw new InputError("Für die Lagerverwaltung fehlt die Berechtigung.", 403, "stock_manage_forbidden");
  }
  return roles;
}

async function permissions(client, context) {
  const roles = await roleKeys(client, context);
  return {
    manage: [...roles].some((role) => MANAGER_ROLES.has(role)),
    transfer: [...roles].some((role) => TRANSFER_ROLES.has(role))
  };
}

async function requireMovementPermission(client, context, movementType) {
  const level = MOVEMENT_TYPES.get(movementType);
  if (!level) throw new InputError("Diese Buchungsart gibt es nicht.", 400, "stock_movement_type_unknown");
  if (level === "alle") return;

  const allowed = await permissions(client, context);
  if (level === "vorarbeiter" && allowed.transfer) return;
  if (level === "verwaltung" && allowed.manage) return;

  throw new InputError("Für diese Buchung fehlt die Berechtigung.", 403, "stock_movement_forbidden");
}

function itemDto(row) {
  return {
    id: row.id,
    itemNumber: row.item_number,
    name: row.name,
    unit: row.unit,
    groupId: row.group_id,
    groupName: row.group_name || null,
    manufacturer: row.manufacturer || null,
    manufacturerNumber: row.manufacturer_number || null,
    minimumStock: number(row.minimum_stock),
    targetStock: number(row.target_stock),
    // Das Gebinde ist eine Art, ueber die Menge zu sprechen, kein zweiter
    // Bestand: `totalQuantity` steht immer in `unit`.
    packSize: number(row.pack_size),
    packName: row.pack_name || null,
    totalQuantity: number(row.total_quantity ?? 0),
    note: row.note || null,
    status: row.status,
    rowVersion: Number(row.row_version || 1)
  };
}

function locationDto(row) {
  return {
    id: row.id,
    name: row.name,
    locationType: row.location_type,
    parentLocationId: row.parent_location_id || null,
    constructionSiteId: row.construction_site_id || null,
    vehicleId: row.vehicle_id || null,
    depth: Number(row.depth || 1),
    path: row.path || row.name,
    status: row.status
  };
}

function movementDto(row) {
  return {
    id: row.id,
    itemId: row.item_id,
    movementType: row.movement_type,
    quantity: number(row.quantity),
    sourceLocationId: row.source_location_id || null,
    targetLocationId: row.target_location_id || null,
    constructionSiteId: row.construction_site_id || null,
    reason: row.reason || null,
    sourceType: row.source_type,
    clientOperationId: row.client_operation_id || null,
    occurredAt: new Date(row.occurred_at).toISOString()
  };
}

async function loadGroups(client, context) {
  const result = await client.query(
    `SELECT id, group_key, name, status FROM stock_item_groups
     WHERE company_id = $1 AND status = 'active' ORDER BY name`,
    [context.companyId]
  );
  return result.rows.map((row) => ({
    id: row.id, key: row.group_key, name: row.name
  }));
}

async function loadLocations(client, context) {
  // Der lesbare Pfad "Materiallager › Regal A › Fach A1" entsteht in der
  // Abfrage, damit die Oberflaeche den Baum nicht selbst zusammensetzen muss.
  const result = await client.query(
    `WITH RECURSIVE baum AS (
       SELECT ort.*, ort.name::TEXT AS path
       FROM storage_locations AS ort
       WHERE ort.company_id = $1 AND ort.parent_location_id IS NULL
       UNION ALL
       SELECT kind.*, (baum.path || ' › ' || kind.name)::TEXT
       FROM storage_locations AS kind
       JOIN baum ON baum.company_id = kind.company_id AND baum.id = kind.parent_location_id
     )
     SELECT * FROM baum WHERE status = 'active' ORDER BY path`,
    [context.companyId]
  );
  return result.rows.map(locationDto);
}

/**
 * Die Baustellen, auf die gebucht werden darf.
 *
 * Bisher kannte das Lager nur die Baustellen aus dem eigenen Tagesplan. Fuer
 * einen Monteur reicht das, fuer den Lageristen nicht: der gibt Material fuer
 * eine Baustelle heraus, auf der er selbst nie steht, und sah deshalb gar kein
 * Auswahlfeld. Deshalb kommen hier die laufenden Baustellen des Betriebs
 * dazu; die eigenen sortiert die App danach nach oben.
 *
 * Abgeschlossene, abgebrochene und archivierte Baustellen fehlen bewusst: auf
 * sie soll nichts mehr gebucht werden. Rueckgaben von dort sind trotzdem
 * moeglich, weil eine Rueckgabe ohne Baustelle gebucht werden kann.
 */
async function loadSites(client, context) {
  const result = await client.query(
    `SELECT id, site_number, name
     FROM construction_sites
     WHERE company_id = $1
       AND status IN ('planned', 'active', 'on_hold', 'delayed')
     ORDER BY name, site_number
     LIMIT 500`,
    [context.companyId]
  );
  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    siteNumber: row.site_number
  }));
}

async function loadSettings(client, context) {
  const result = await client.query(
    `SELECT default_location_id, require_site_on_issue, block_negative_stock,
            low_stock_warning, row_version
     FROM stock_settings WHERE company_id = $1`,
    [context.companyId]
  );
  const row = result.rows[0];
  if (!row) {
    return {
      defaultLocationId: null,
      requireSiteOnIssue: false,
      blockNegativeStock: false,
      lowStockWarning: true,
      rowVersion: 1
    };
  }
  return {
    defaultLocationId: row.default_location_id || null,
    requireSiteOnIssue: row.require_site_on_issue,
    blockNegativeStock: row.block_negative_stock,
    lowStockWarning: row.low_stock_warning,
    rowVersion: Number(row.row_version || 1)
  };
}

async function contexts(client, context) {
  const [groups, locations, sites, settings, allowed] = await Promise.all([
    loadGroups(client, context),
    loadLocations(client, context),
    loadSites(client, context),
    loadSettings(client, context),
    permissions(client, context)
  ]);
  return { groups, locations, sites, settings, permissions: allowed };
}

const ITEM_COLUMNS = `
  item.id, item.item_number, item.name, item.unit, item.group_id,
  item.manufacturer, item.manufacturer_number, item.minimum_stock,
  item.target_stock, item.pack_size, item.pack_name,
  item.note, item.status, item.row_version,
  gruppe.name AS group_name,
  COALESCE(bestand.summe, 0) AS total_quantity`;

const ITEM_FROM = `
  FROM stock_items AS item
  JOIN stock_item_groups AS gruppe
    ON gruppe.company_id = item.company_id AND gruppe.id = item.group_id
  LEFT JOIN (
    SELECT company_id, item_id, SUM(quantity) AS summe
    FROM stock_levels GROUP BY company_id, item_id
  ) AS bestand ON bestand.company_id = item.company_id AND bestand.item_id = item.id`;

async function listItems(client, context, url) {
  const search = optionalText(url.searchParams.get("suche"), "Suchbegriff", 120);
  const groupId = optionalId(url.searchParams.get("gruppe"), "Warengruppe");
  const includeArchived = url.searchParams.get("archivierte") === "ja";

  const result = await client.query(
    `SELECT ${ITEM_COLUMNS} ${ITEM_FROM}
     WHERE item.company_id = $1
       AND ($2::BOOLEAN OR item.status = 'active')
       AND ($3::UUID IS NULL OR item.group_id = $3::UUID)
       AND (
         $4::TEXT IS NULL
         OR item.name ILIKE '%' || $4 || '%'
         OR item.item_number ILIKE '%' || $4 || '%'
         OR item.manufacturer_number ILIKE '%' || $4 || '%'
       )
     ORDER BY item.name
     LIMIT 200`,
    [context.companyId, includeArchived, groupId, search]
  );
  return result.rows.map(itemDto);
}

async function itemDetail(client, context, itemId) {
  const item = await client.query(
    `SELECT ${ITEM_COLUMNS} ${ITEM_FROM}
     WHERE item.company_id = $1 AND item.id = $2`,
    [context.companyId, itemId]
  );
  if (item.rowCount !== 1) {
    throw new InputError("Dieser Artikel wurde nicht gefunden.", 404, "stock_item_unknown");
  }

  const [levels, barcodes, movements] = await Promise.all([
    client.query(
      `SELECT bestand.location_id, bestand.quantity, ort.name AS location_name
       FROM stock_levels AS bestand
       JOIN storage_locations AS ort
         ON ort.company_id = bestand.company_id AND ort.id = bestand.location_id
       WHERE bestand.company_id = $1 AND bestand.item_id = $2 AND bestand.quantity <> 0
       ORDER BY ort.name`,
      [context.companyId, itemId]
    ),
    client.query(
      `SELECT id, code_raw, code_normalized, code_type, pack_quantity, is_primary
       FROM stock_item_barcodes
       WHERE company_id = $1 AND item_id = $2 AND status = 'active'
       ORDER BY is_primary DESC, created_at`,
      [context.companyId, itemId]
    ),
    client.query(
      `SELECT * FROM stock_movements
       WHERE company_id = $1 AND item_id = $2
       ORDER BY occurred_at DESC LIMIT 50`,
      [context.companyId, itemId]
    )
  ]);

  return {
    item: itemDto(item.rows[0]),
    levels: levels.rows.map((row) => ({
      locationId: row.location_id,
      locationName: row.location_name,
      quantity: number(row.quantity)
    })),
    barcodes: barcodes.rows.map((row) => ({
      id: row.id,
      code: row.code_raw,
      normalized: row.code_normalized,
      codeType: row.code_type,
      packQuantity: number(row.pack_quantity),
      isPrimary: row.is_primary
    })),
    movements: movements.rows.map(movementDto)
  };
}

async function resolveGroup(client, context, body) {
  const groupId = optionalId(body.groupId, "Warengruppe");
  if (groupId) return groupId;

  const groupKey = optionalText(body.groupKey, "Warengruppe", 60);
  if (!groupKey) throw new InputError("Eine Warengruppe ist erforderlich.");

  const result = await client.query(
    `SELECT id FROM stock_item_groups
     WHERE company_id = $1 AND group_key = LOWER($2) AND status = 'active'`,
    [context.companyId, groupKey]
  );
  if (result.rowCount !== 1) throw new InputError("Diese Warengruppe gibt es nicht.");
  return result.rows[0].id;
}

function readBarcodes(body) {
  if (body.barcodes === undefined || body.barcodes === null) return [];
  if (!Array.isArray(body.barcodes)) throw new InputError("Die Codeliste ist ungültig.");
  if (body.barcodes.length > 20) throw new InputError("Ein Artikel trägt höchstens zwanzig Codes.");

  return body.barcodes.map((entry, index) => {
    const label = `Code ${index + 1}`;
    const code = requiredText(entry?.code, label, 64);
    const codeType = optionalText(entry?.codeType, `${label} Art`, 20) || "internal";
    if (!["gtin", "code128", "internal"].includes(codeType)) {
      throw new InputError(`${label} hat eine unbekannte Art.`);
    }
    return {
      code,
      codeType,
      packQuantity: optionalQuantity(entry?.packQuantity, `${label} Gebindemenge`) || "1.000",
      isPrimary: entry?.isPrimary === true
    };
  });
}

/**
 * Liest das Gebinde eines Artikels: wie viele Einheiten stecken drin, und wie
 * heisst es im Betrieb.
 *
 * Beides gehoert zusammen. Eine Stueckzahl ohne Namen waere ein Gebinde, das
 * niemand ansprechen kann ("100 was?"), ein Name ohne Stueckzahl sagt nichts
 * darueber, wie viel drin ist. Ein Gebinde mit einem Stueck ist kein Gebinde,
 * sondern das Stueck - es anzubieten hiesse, eine Wahl zu stellen, die keine
 * ist. Die Datenbank erzwingt dieselben drei Regeln; hier entsteht daraus eine
 * verstaendliche Meldung statt einer Bedingungsverletzung.
 */
function readPack(body) {
  const size = optionalQuantity(body.packSize, "Stückzahl im Gebinde");
  const name = optionalText(body.packName, "Gebinde", 40);

  if (size === null && !name) return { size: null, name: null };
  if (size === null) {
    throw new InputError("Zum Gebinde fehlt die Stückzahl.", 400, "stock_pack_size_missing");
  }
  if (!name) {
    throw new InputError(
      "Das Gebinde braucht einen Namen — Karton, Rolle, Bund.",
      400,
      "stock_pack_name_missing"
    );
  }
  if (Number(size) <= 1) {
    throw new InputError(
      "Ein Gebinde enthält mehr als ein Stück; sonst ist es das Stück selbst.",
      400,
      "stock_pack_size_too_small"
    );
  }
  return { size, name };
}

async function createItem(client, context, body) {
  await requireManager(client, context);

  const itemNumber = requiredText(body.itemNumber, "Artikelnummer", 40);
  const name = requiredText(body.name, "Bezeichnung", 180);
  const unit = requiredText(body.unit, "Einheit", 20);
  const groupId = await resolveGroup(client, context, body);
  const pack = readPack(body);
  const barcodes = readBarcodes(body);

  if (barcodes.filter((entry) => entry.isPrimary).length > 1) {
    throw new InputError("Nur ein Code darf der Hauptcode sein.");
  }

  const inserted = await client.query(
    `INSERT INTO stock_items (
       company_id, item_number, name, group_id, unit, manufacturer,
       manufacturer_number, default_supplier_id, default_location_id,
       minimum_stock, target_stock, pack_size, pack_name, note,
       created_by_user_id, changed_by_user_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
               COALESCE($10::NUMERIC, 0), $11::NUMERIC, $12::NUMERIC, $13, $14, $15, $15)
     RETURNING id`,
    [
      context.companyId, itemNumber, name, groupId, unit,
      optionalText(body.manufacturer, "Hersteller", 120),
      optionalText(body.manufacturerNumber, "Herstellernummer", 80),
      optionalId(body.defaultSupplierId, "Lieferant"),
      optionalId(body.defaultLocationId, "Standardlagerplatz"),
      optionalQuantity(body.minimumStock, "Mindestbestand"),
      optionalQuantity(body.targetStock, "Zielbestand"),
      pack.size,
      pack.name,
      optionalText(body.note, "Notiz", 2000),
      context.userId
    ]
  ).catch(mapDatabaseError);

  const itemId = inserted.rows[0].id;

  for (const entry of barcodes) {
    await client.query(
      `INSERT INTO stock_item_barcodes (
         company_id, item_id, code_raw, code_normalized, code_type,
         pack_quantity, is_primary, created_by_user_id
       ) VALUES ($1, $2, $3, $3, $4, $5, $6, $7)`,
      [
        context.companyId, itemId, entry.code, entry.codeType,
        entry.packQuantity, entry.isPrimary, context.userId
      ]
    ).catch(mapDatabaseError);
  }

  await client.query(
    `INSERT INTO stock_history (company_id, entity_type, entity_id, action, actor_user_id, new_state)
     VALUES ($1, 'stock_item', $2, 'created', $3, $4::JSONB)`,
    [context.companyId, itemId, context.userId, JSON.stringify({ itemNumber, name, unit })]
  );

  return itemDetail(client, context, itemId);
}

/**
 * Aendert einen Artikel.
 *
 * Gebraucht wird das vor allem fuer das Gebinde: Artikel, die es vor dieser
 * Fassung schon gab, sollen eines bekommen koennen, ohne neu angelegt zu
 * werden. Geaendert wird nur, was mitgeschickt wird - wer bloss das Gebinde
 * eintraegt, soll dabei nicht den Mindestbestand verlieren.
 *
 * `rowVersion` ist Pflicht: zwei Leute im Buero, die denselben Artikel
 * gleichzeitig offen haben, duerfen sich nicht gegenseitig ueberschreiben.
 * Die Einheit bleibt aussen vor - sie zu aendern wuerde jeden gebuchten
 * Bestand still umdeuten, aus 120 Metern wuerden 120 Stueck.
 */
async function updateItem(client, context, itemId, body) {
  await requireManager(client, context);

  const rowVersion = Number(body?.rowVersion);
  if (!Number.isSafeInteger(rowVersion) || rowVersion < 1) {
    throw new InputError("Die Artikelversion ist ungültig.");
  }

  const vorhanden = await client.query(
    `SELECT item_number, name, minimum_stock, target_stock, pack_size, pack_name, note
     FROM stock_items WHERE company_id = $1 AND id = $2 AND status = 'active' FOR UPDATE`,
    [context.companyId, itemId]
  );
  if (vorhanden.rowCount !== 1) {
    throw new InputError("Diesen Artikel gibt es nicht.", 404, "stock_item_unknown");
  }
  const alt = vorhanden.rows[0];

  const gesetzt = (feld) => Object.prototype.hasOwnProperty.call(body, feld);
  const pack = gesetzt("packSize") || gesetzt("packName")
    ? readPack(body)
    : { size: alt.pack_size, name: alt.pack_name };

  const aktualisiert = await client.query(
    `UPDATE stock_items
     SET name = $3, minimum_stock = COALESCE($4::NUMERIC, 0), target_stock = $5::NUMERIC,
         pack_size = $6::NUMERIC, pack_name = $7, note = $8,
         changed_by_user_id = $9, row_version = row_version + 1,
         updated_at = CURRENT_TIMESTAMP
     WHERE company_id = $1 AND id = $2 AND row_version = $10
     RETURNING id`,
    [
      context.companyId, itemId,
      gesetzt("name") ? requiredText(body.name, "Bezeichnung", 180) : alt.name,
      gesetzt("minimumStock") ? optionalQuantity(body.minimumStock, "Mindestbestand") : alt.minimum_stock,
      gesetzt("targetStock") ? optionalQuantity(body.targetStock, "Zielbestand") : alt.target_stock,
      pack.size,
      pack.name,
      gesetzt("note") ? optionalText(body.note, "Notiz", 2000) : alt.note,
      context.userId,
      rowVersion
    ]
  ).catch(mapDatabaseError);

  if (aktualisiert.rowCount !== 1) {
    throw new InputError(
      "Der Artikel wurde zwischenzeitlich geändert. Bitte die Liste neu laden.",
      409,
      "stock_item_row_version_conflict"
    );
  }

  await client.query(
    `INSERT INTO stock_history (
       company_id, entity_type, entity_id, action, actor_user_id, old_state, new_state
     ) VALUES ($1, 'stock_item', $2, 'updated', $3, $4::JSONB, $5::JSONB)`,
    [
      context.companyId, itemId, context.userId,
      JSON.stringify({ packSize: number(alt.pack_size), packName: alt.pack_name || null }),
      JSON.stringify({ packSize: number(pack.size), packName: pack.name || null })
    ]
  );

  return itemDetail(client, context, itemId);
}

async function createLocation(client, context, body) {
  await requireManager(client, context);

  const name = requiredText(body.name, "Bezeichnung", 140);
  const locationType = requiredText(body.locationType, "Art", 30);
  if (!LOCATION_TYPES.has(locationType)) {
    throw new InputError("Diese Lagerplatzart gibt es nicht.");
  }

  const constructionSiteId = optionalId(body.constructionSiteId, "Baustelle");
  const vehicleId = optionalId(body.vehicleId, "Fahrzeug");

  // Die Datenbank faengt das ebenfalls ab, aber als Constraint. Wer einen Ort
  // anlegt, soll lesen, was fehlt.
  const pflichtfeld = LOCATION_TARGET_FIELD.get(locationType);
  if (pflichtfeld === "constructionSiteId" && !constructionSiteId) {
    throw new InputError("Ein Baustellenlager braucht die Baustelle.");
  }
  if (pflichtfeld === "vehicleId" && !vehicleId) {
    throw new InputError("Ein Fahrzeuglager braucht das Fahrzeug.");
  }
  if (!pflichtfeld && (constructionSiteId || vehicleId)) {
    throw new InputError("Nur ein Baustellen- oder Fahrzeuglager zeigt auf Baustelle oder Fahrzeug.");
  }

  const inserted = await client.query(
    `INSERT INTO storage_locations (
       company_id, name, location_type, parent_location_id,
       construction_site_id, vehicle_id, note
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      context.companyId, name, locationType,
      optionalId(body.parentLocationId, "Übergeordneter Lagerplatz"),
      constructionSiteId, vehicleId,
      optionalText(body.note, "Notiz", 2000)
    ]
  ).catch(mapDatabaseError);

  await client.query(
    `INSERT INTO stock_history (company_id, entity_type, entity_id, action, actor_user_id, new_state)
     VALUES ($1, 'storage_location', $2, 'created', $3, $4::JSONB)`,
    [context.companyId, inserted.rows[0].id, context.userId, JSON.stringify({ name, locationType })]
  );

  const locations = await loadLocations(client, context);
  return locations.find((entry) => entry.id === inserted.rows[0].id) || null;
}

/**
 * Traegt einem vorhandenen Artikel einen weiteren Code nach.
 *
 * Der Fall ist der Alltag und nicht die Ausnahme: die Einzelpackung ist beim
 * Anlegen dabei, der Kartoncode mit Gebindemenge kommt erst, wenn die erste
 * Palette geliefert wird.
 */
async function addBarcode(client, context, itemId, body) {
  await requireManager(client, context);

  const item = await client.query(
    "SELECT id FROM stock_items WHERE company_id = $1 AND id = $2",
    [context.companyId, itemId]
  );
  if (item.rowCount !== 1) {
    throw new InputError("Dieser Artikel wurde nicht gefunden.", 404, "stock_item_unknown");
  }

  const [code] = readBarcodes({ barcodes: [body] });
  if (!code) throw new InputError("Der Code fehlt.");

  if (code.isPrimary) {
    // Es gibt hoechstens einen Hauptcode; der bisherige tritt zurueck, statt
    // dass der neue am eindeutigen Index scheitert.
    await client.query(
      `UPDATE stock_item_barcodes SET is_primary = FALSE
       WHERE company_id = $1 AND item_id = $2 AND is_primary AND status = 'active'`,
      [context.companyId, itemId]
    );
  }

  await client.query(
    `INSERT INTO stock_item_barcodes (
       company_id, item_id, code_raw, code_normalized, code_type,
       pack_quantity, is_primary, created_by_user_id
     ) VALUES ($1, $2, $3, $3, $4, $5, $6, $7)`,
    [
      context.companyId, itemId, code.code, code.codeType,
      code.packQuantity, code.isPrimary, context.userId
    ]
  ).catch(mapDatabaseError);

  await client.query(
    `INSERT INTO stock_history (company_id, entity_type, entity_id, action, actor_user_id, new_state)
     VALUES ($1, 'stock_item_barcode', $2, 'added', $3, $4::JSONB)`,
    [context.companyId, itemId, context.userId, JSON.stringify({ code: code.code })]
  );

  return itemDetail(client, context, itemId);
}

/** Nimmt einen Code zurueck. Geloescht wird nichts; er findet nur nichts mehr. */
async function revokeBarcode(client, context, itemId, codeId, body) {
  await requireManager(client, context);

  const reason = optionalText(body?.reason, "Grund", 2000);
  if (!reason) throw new InputError("Ein Code wird nur mit Begründung zurückgenommen.");

  const updated = await client.query(
    `UPDATE stock_item_barcodes
     SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP,
         revoked_by_user_id = $4, revoke_reason = $5
     WHERE company_id = $1 AND id = $2 AND item_id = $3 AND status = 'active'
     RETURNING code_raw`,
    [context.companyId, codeId, itemId, context.userId, reason]
  ).catch(mapDatabaseError);

  if (updated.rowCount !== 1) {
    throw new InputError("Dieser Code gehört nicht zu diesem Artikel.", 404, "stock_barcode_unknown");
  }

  await client.query(
    `INSERT INTO stock_history (company_id, entity_type, entity_id, action, actor_user_id, reason, old_state)
     VALUES ($1, 'stock_item_barcode', $2, 'revoked', $3, $4, $5::JSONB)`,
    [
      context.companyId, itemId, context.userId, reason,
      JSON.stringify({ code: updated.rows[0].code_raw })
    ]
  );

  return itemDetail(client, context, itemId);
}

/**
 * Baut die QR-Bilder fuer einen Etikettenbogen.
 *
 * Wer keinen Herstellercode hat, braucht ein eigenes Etikett — sonst ist der
 * Artikel nie scannbar, und das ganze Modul haengt am Scannen. Fehlt der Token
 * noch, entsteht er hier; ein vorhandener wird wiederverwendet, damit ein
 * Nachdruck nicht die schon geklebten Aufkleber entwertet.
 *
 * Geliefert werden nur die Bilder. Den Bogen setzt das Frontend zusammen, wie
 * beim Geraetemodul: A4, zehn Spalten, zwoelf Reihen, 18 mal 18 Millimeter.
 */
async function labelSheet(client, context, body, allowedOrigin) {
  await requireManager(client, context);

  const ziele = Array.isArray(body?.targets) ? body.targets : [];
  if (!ziele.length || ziele.length > 120) {
    throw new InputError("Bitte 1 bis 120 Etiketten für den Druckbogen wählen.");
  }

  // Der Pfad eines Lagerplatzes entsteht aus seinen Eltern; einmal geladen
  // reicht fuer den ganzen Bogen.
  const orte = ziele.some((ziel) => ziel?.targetType === "location")
    ? await loadLocations(client, context)
    : [];

  const labels = [];
  for (const ziel of ziele) {
    const targetType = ziel?.targetType === "location" ? "location" : "item";
    const id = validateId(ziel?.id, targetType === "item" ? "Artikel" : "Lagerplatz");

    const etikett = await issueLabel(client, context, {
      targetType,
      itemId: targetType === "item" ? id : undefined,
      locationId: targetType === "location" ? id : undefined
    });

    // Was auf dem Etikett steht: Bezeichnung, Nummer und eine dritte Zeile,
    // die im Regal weiterhilft. Beim Artikel ist das die Herstellernummer -
    // danach sucht, wer nachbestellt. Beim Lagerplatz der Pfad, damit sich
    // "Fach A1" im Materiallager von "Fach A1" in der Werkstatt unterscheidet.
    const beschriftung = targetType === "item"
      ? await client.query(
        `SELECT name, item_number AS nummer,
                NULLIF(TRIM(CONCAT_WS(' ', manufacturer, manufacturer_number)), '') AS zusatz
         FROM stock_items WHERE company_id = $1 AND id = $2`,
        [context.companyId, id]
      )
      : await client.query(
        "SELECT name, '' AS nummer, NULL AS zusatz FROM storage_locations WHERE company_id = $1 AND id = $2",
        [context.companyId, id]
      );
    if (beschriftung.rowCount !== 1) {
      throw new InputError("Dieses Etikettenziel wurde nicht gefunden.", 404, "stock_label_target_unknown");
    }

    // Grossbuchstaben: darin packt ein QR-Code die Adresse dichter, weil er in
    // den alphanumerischen Modus wechseln kann. Aus 37 werden 33 Module, und
    // derselbe Code passt bei gleicher Lesbarkeit auf weniger Flaeche.
    //
    // Erlaubt ist das, weil Schema und Host ohnehin gleichgueltig gegenueber
    // der Schreibweise sind und den Abfrageteil nur unsere eigene App liest -
    // sie nimmt `lager` wie `LAGER`. Die Kennung ist hexadezimal, also
    // unveraendert gueltig; PostgreSQL vergleicht UUIDs ohne Ruecksicht auf
    // Gross- und Kleinschreibung.
    const adresse = new URL("/", allowedOrigin || "https://example.invalid/");
    adresse.searchParams.set("lager", etikett.token);
    const gedruckt = adresse.toString().toUpperCase();

    labels.push({
      targetType,
      id,
      label: beschriftung.rows[0].name,
      sublabel: targetType === "location"
        ? (orte.find((ort) => ort.id === id)?.path || "")
        : (beschriftung.rows[0].nummer || ""),
      extra: beschriftung.rows[0].zusatz || null,
      target: gedruckt,
      generation: etikett.generation,
      svg: await qrToString(gedruckt, {
        type: "svg",
        errorCorrectionLevel: "M",
        margin: 2,
        width: 480,
        color: { dark: "#111111ff", light: "#ffffffff" }
      })
    });
  }

  return labels;
}

/**
 * Gibt ein eigenes Etikett aus.
 *
 * Ein erneuter Druck liest denselben Token wieder; nur `replace` widerruft ihn
 * und erzeugt die naechste Generation. Sonst entstuenden bei jedem Druck neue
 * Codes, und die schon geklebten waeren still ungueltig. Derselbe Vertrag wie
 * beim Geraetemodul.
 */
async function issueLabel(client, context, body) {
  await requireManager(client, context);

  const targetType = requiredText(body.targetType, "Art des Etiketts", 20);
  if (!["item", "location"].includes(targetType)) {
    throw new InputError("Ein Etikett gehört an einen Artikel oder einen Lagerplatz.");
  }
  const itemId = targetType === "item" ? validateId(body.itemId, "Artikel") : null;
  const locationId = targetType === "location" ? validateId(body.locationId, "Lagerplatz") : null;
  const replace = body.replace === true;

  const existing = await client.query(
    `SELECT id, public_token, generation FROM stock_labels
     WHERE company_id = $1 AND is_active
       AND ($2::UUID IS NULL OR item_id = $2::UUID)
       AND ($3::UUID IS NULL OR location_id = $3::UUID)
       AND target_type = $4`,
    [context.companyId, itemId, locationId, targetType]
  );

  if (existing.rowCount === 1 && !replace) {
    const row = existing.rows[0];
    return { token: row.public_token, generation: Number(row.generation), replaced: false };
  }

  let generation = 1;
  if (existing.rowCount === 1) {
    const reason = optionalText(body.reason, "Grund", 2000);
    if (!reason) throw new InputError("Ein Code wird nur mit Begründung ersetzt.");

    await client.query(
      `UPDATE stock_labels
       SET is_active = FALSE, revoked_at = CURRENT_TIMESTAMP,
           revoked_by_user_id = $2, revoke_reason = $3
       WHERE company_id = $1 AND id = $4`,
      [context.companyId, context.userId, reason, existing.rows[0].id]
    );
    generation = Number(existing.rows[0].generation) + 1;
  }

  const created = await client.query(
    `INSERT INTO stock_labels (
       company_id, target_type, item_id, location_id, generation, created_by_user_id
     ) VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING public_token, generation`,
    [context.companyId, targetType, itemId, locationId, generation, context.userId]
  ).catch(mapDatabaseError);

  await client.query(
    `INSERT INTO stock_history (company_id, entity_type, entity_id, action, actor_user_id, reason)
     VALUES ($1, 'stock_label', $2, $3, $4, $5)`,
    [
      context.companyId, itemId || locationId,
      existing.rowCount === 1 ? "replaced" : "issued",
      context.userId, optionalText(body.reason, "Grund", 2000)
    ]
  );

  return {
    token: created.rows[0].public_token,
    generation: Number(created.rows[0].generation),
    replaced: existing.rowCount === 1
  };
}

/**
 * Loest einen gescannten Code auf.
 *
 * Die GTIN-Normalisierung uebernimmt bewusst die Datenbankfunktion und nicht
 * eine zweite Rechnung hier: waeren beide je verschieden, entstuende derselbe
 * Artikel zweimal.
 */
async function scan(client, context, body) {
  const raw = requiredText(body.code, "Code", 512);

  let token = raw;
  try {
    const fromUrl = new URL(raw, "https://example.invalid/").searchParams.get("lager");
    if (fromUrl) token = fromUrl;
  } catch {
    // Kein Verweis, also ein reiner Wert.
  }

  if (UUID.test(token)) {
    const label = await client.query(
      `SELECT etikett.target_type, etikett.item_id, etikett.location_id
       FROM stock_labels AS etikett
       WHERE etikett.company_id = $1 AND etikett.public_token = $2::UUID AND etikett.is_active`,
      [context.companyId, token.toLowerCase()]
    );
    // Unbekannt, widerrufen und fremdmandantig sehen von aussen gleich aus.
    if (label.rowCount !== 1) return { found: false, kind: "label", code: raw };

    const row = label.rows[0];
    if (row.target_type === "location") {
      const locations = await loadLocations(client, context);
      const location = locations.find((entry) => entry.id === row.location_id);
      return location
        ? { found: true, kind: "location", location }
        : { found: false, kind: "label", code: raw };
    }
    return { found: true, kind: "item", packQuantity: 1, ...(await itemDetail(client, context, row.item_id)) };
  }

  const normalized = await client.query("SELECT stock_normalize_gtin($1) AS gtin", [raw]);
  const gtin = normalized.rows[0].gtin;
  const lookup = gtin || raw.trim().toUpperCase();

  const barcode = await client.query(
    `SELECT item_id, pack_quantity, code_type
     FROM stock_item_barcodes
     WHERE company_id = $1 AND code_normalized = $2 AND status = 'active'`,
    [context.companyId, lookup]
  );

  if (barcode.rowCount !== 1) {
    // Nicht gefunden ist kein Fehler, sondern der Einstieg in die Neuanlage.
    return { found: false, kind: gtin ? "gtin" : "text", code: raw, normalized: lookup };
  }

  return {
    found: true,
    kind: "item",
    packQuantity: number(barcode.rows[0].pack_quantity),
    ...(await itemDetail(client, context, barcode.rows[0].item_id))
  };
}

function mapDatabaseError(error) {
  const message = String(error?.message || "");

  if (message.includes("Der Bestand am Quellort reicht nicht aus")) {
    throw new InputError(
      "Am Quellort liegt nicht genug Material. Bestand prüfen oder Firmenregel anpassen.",
      409,
      "stock_insufficient"
    );
  }
  if (message.includes("ist keine gueltige GTIN")) {
    throw new InputError("Dieser Code ist keine gültige GTIN.", 400, "stock_invalid_gtin");
  }
  if (message.includes("hoechstens drei Ebenen")) {
    throw new InputError("Lagerplätze dürfen höchstens drei Ebenen tief sein.", 400, "stock_location_too_deep");
  }
  if (message.includes("Einheit eines bereits gebuchten Artikels")) {
    throw new InputError(
      "Die Einheit eines bereits gebuchten Artikels lässt sich nicht ändern. Bitte einen neuen Artikel anlegen.",
      409,
      "stock_unit_locked"
    );
  }
  if (error?.code === "23505") {
    throw new InputError("Diesen Eintrag gibt es bereits.", 409, "stock_duplicate");
  }
  if (error?.code === "23503") {
    throw new InputError("Ein verwendeter Datensatz gehört nicht zu dieser Firma.", 400, "stock_reference_unknown");
  }
  throw error;
}

/**
 * Reicht das, was frei verfuegbar ist?
 *
 * Frei ist der physische Bestand minus dem, was fuer *andere* zurueckgelegt
 * wurde. Die eigene Reservierung zaehlt nicht dagegen, sondern wird durch die
 * Entnahme abgebaut - erst der Rest muss frei sein.
 *
 * Der physische Bestand selbst wird hier nicht geprueft: darum kuemmert sich
 * die Datenbank je nach Firmenregel. Hier geht es nur um die Frage, wem das
 * Material gehoert.
 */
async function verfuegbarkeitPruefen(client, context, { itemId, sourceLocationId, amount, constructionSiteId }) {
  const offene = await client.query(
    `SELECT reservierung.id, reservierung.construction_site_id,
            reservierung.quantity - reservierung.quantity_fulfilled AS offen,
            baustelle.name AS site_name
     FROM stock_reservations AS reservierung
     LEFT JOIN construction_sites AS baustelle
       ON baustelle.company_id = reservierung.company_id
      AND baustelle.id = reservierung.construction_site_id
     WHERE reservierung.company_id = $1
       AND reservierung.item_id = $2
       AND reservierung.location_id = $3
       AND reservierung.status = 'open'
     ORDER BY reservierung.needed_on NULLS LAST, reservierung.created_at
     FOR UPDATE OF reservierung`,
    [context.companyId, itemId, sourceLocationId]
  );
  if (!offene.rowCount) return;

  const eigene = offene.rows.filter(
    (zeile) => constructionSiteId && zeile.construction_site_id === constructionSiteId
  );
  const fremde = offene.rows.filter(
    (zeile) => !constructionSiteId || zeile.construction_site_id !== constructionSiteId
  );

  const bestand = await client.query(
    "SELECT quantity FROM stock_levels WHERE company_id = $1 AND item_id = $2 AND location_id = $3",
    [context.companyId, itemId, sourceLocationId]
  );
  const physisch = number(bestand.rows[0]?.quantity ?? 0);
  const fuerAndere = fremde.reduce((summe, zeile) => summe + number(zeile.offen), 0);
  const frei = Math.round((physisch - fuerAndere) * 1000) / 1000;

  if (frei < amount) {
    const namen = [...new Set(fremde.map((zeile) => zeile.site_name).filter(Boolean))];
    throw new InputError(
      namen.length
        ? `Frei verfügbar sind nur ${frei}. Der Rest ist reserviert für ${namen.join(", ")}.`
        : `Frei verfügbar sind nur ${frei}; der Rest ist reserviert.`,
      409,
      "stock_reserved_for_others"
    );
  }

  // Die eigene Reservierung abbauen, aelteste zuerst. Was darueber hinausgeht,
  // war ohnehin frei und braucht keine Reservierung.
  let rest = amount;
  for (const zeile of eigene) {
    if (rest <= 0) break;
    const abbau = Math.min(rest, number(zeile.offen));
    if (abbau <= 0) continue;
    await client.query(
      `UPDATE stock_reservations
       SET quantity_fulfilled = quantity_fulfilled + $3,
           status = CASE WHEN quantity_fulfilled + $3 >= quantity THEN 'fulfilled' ELSE status END,
           changed_by_user_id = $4
       WHERE company_id = $1 AND id = $2`,
      [context.companyId, zeile.id, abbau, context.userId]
    );
    rest = Math.round((rest - abbau) * 1000) / 1000;
  }
}

async function bookMovement(client, context, body) {
  const movementType = requiredText(body.movementType, "Buchungsart", 20);
  await requireMovementPermission(client, context, movementType);

  const clientOperationId = optionalText(body.clientOperationId, "Vorgangsnummer", 80);

  // Dieselbe Offline-Buchung darf nicht zweimal zaehlen. Der eindeutige Index
  // in der Datenbank ist die eigentliche Sicherung; diese Abfrage erspart der
  // App nur den Umweg ueber einen Fehler.
  if (clientOperationId) {
    const existing = await client.query(
      "SELECT * FROM stock_movements WHERE company_id = $1 AND client_operation_id = $2",
      [context.companyId, clientOperationId]
    );
    if (existing.rowCount === 1) {
      return { movement: movementDto(existing.rows[0]), repeated: true };
    }
  }

  const itemId = validateId(body.itemId, "Artikel");
  const amount = quantity(body.quantity);
  const sourceLocationId = optionalId(body.sourceLocationId, "Quellort");
  const targetLocationId = optionalId(body.targetLocationId, "Zielort");
  const constructionSiteId = optionalId(body.constructionSiteId, "Baustelle");
  const reason = optionalText(body.reason, "Grund", 2000);
  const sourceType = optionalText(body.sourceType, "Herkunft", 30) || "api";

  if (!SOURCE_TYPES.has(sourceType)) throw new InputError("Diese Herkunft gibt es nicht.");
  if (["scrap", "correction"].includes(movementType) && !reason) {
    throw new InputError("Verschrottung und Korrektur brauchen einen Grund.");
  }

  const settings = await loadSettings(client, context);
  if (movementType === "issue" && settings.requireSiteOnIssue && !constructionSiteId) {
    throw new InputError(
      "Diese Firma verlangt bei einer Entnahme die Baustelle.",
      400,
      "stock_site_required"
    );
  }

  // Der Rest der Ortslogik steht als CHECK in der Datenbank. Hier wird nur
  // uebersetzt, damit der Monteur einen Satz statt einer Constraint sieht.
  const needsTarget = ["opening", "receipt", "return"].includes(movementType);
  const needsSource = ["issue", "scrap", "consumed"].includes(movementType);

  // Verbaut wird auf einer Baustelle, nirgends sonst. Ohne diese Angabe
  // liesse sich Material verbrauchen, ohne dass jemand sagen koennte, wofuer.
  if (movementType === "consumed" && !constructionSiteId) {
    throw new InputError(
      "Verbautes Material gehört zu einer Baustelle.",
      400,
      "stock_site_required"
    );
  }
  if (needsTarget && (!targetLocationId || sourceLocationId)) {
    throw new InputError("Ein Zugang braucht genau einen Zielort.");
  }
  if (needsSource && (!sourceLocationId || targetLocationId)) {
    throw new InputError("Eine Entnahme braucht genau einen Quellort.");
  }
  if (movementType === "transfer") {
    if (!sourceLocationId || !targetLocationId) {
      throw new InputError("Eine Umlagerung braucht Quell- und Zielort.");
    }
    if (sourceLocationId === targetLocationId) {
      throw new InputError("Quell- und Zielort einer Umlagerung müssen verschieden sein.");
    }
  }
  if (movementType === "correction" && Boolean(sourceLocationId) === Boolean(targetLocationId)) {
    throw new InputError("Eine Korrektur bucht in genau eine Richtung.");
  }

  // Reservierungen gehen vom Bestand ab: was fuer eine Baustelle zurueckgelegt
  // ist, kann kein anderer mitnehmen. Wer fuer genau diese Baustelle holt,
  // baut seine eigene Reservierung ab, statt an ihr zu scheitern - sonst
  // stuende jede Reservierung sich selbst im Weg.
  if (sourceLocationId && ["issue", "transfer", "scrap", "consumed"].includes(movementType)) {
    await verfuegbarkeitPruefen(client, context, {
      itemId, sourceLocationId, amount, constructionSiteId
    });
  }

  await client.query("SAVEPOINT lagerbuchung");
  let inserted;
  try {
    inserted = await client.query(
      `INSERT INTO stock_movements (
         company_id, item_id, movement_type, quantity, source_location_id,
         target_location_id, construction_site_id, purchase_order_item_id,
         reverses_movement_id, actor_user_id, reason, source_type, client_operation_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        context.companyId, itemId, movementType, amount, sourceLocationId,
        targetLocationId, constructionSiteId,
        optionalId(body.purchaseOrderItemId, "Bestellposition"),
        optionalId(body.reversesMovementId, "Ursprungsbuchung"),
        context.userId, reason, sourceType, clientOperationId
      ]
    );
  } catch (error) {
    await client.query("ROLLBACK TO SAVEPOINT lagerbuchung");

    // Zwei Verbindungen mit derselben Offline-Buchung: die zweite bekommt das
    // bereits gespeicherte Ergebnis, nicht einen Fehler.
    if (error?.code === "23505" && clientOperationId) {
      const existing = await client.query(
        "SELECT * FROM stock_movements WHERE company_id = $1 AND client_operation_id = $2",
        [context.companyId, clientOperationId]
      );
      if (existing.rowCount === 1) {
        return { movement: movementDto(existing.rows[0]), repeated: true };
      }
    }
    mapDatabaseError(error);
  }
  await client.query("RELEASE SAVEPOINT lagerbuchung");

  const levels = await client.query(
    `SELECT bestand.location_id, bestand.quantity, ort.name AS location_name
     FROM stock_levels AS bestand
     JOIN storage_locations AS ort
       ON ort.company_id = bestand.company_id AND ort.id = bestand.location_id
     WHERE bestand.company_id = $1 AND bestand.item_id = $2
       AND bestand.location_id = ANY($3::UUID[])`,
    [context.companyId, itemId, [sourceLocationId, targetLocationId].filter(Boolean)]
  );

  return {
    movement: movementDto(inserted.rows[0]),
    repeated: false,
    levels: levels.rows.map((row) => ({
      locationId: row.location_id,
      locationName: row.location_name,
      quantity: number(row.quantity)
    }))
  };
}

async function listLevels(client, context, url) {
  const locationId = optionalId(url.searchParams.get("ort"), "Lagerplatz");

  const result = await client.query(
    `SELECT sicht.item_id, sicht.location_id,
            sicht.physical_quantity, sicht.reserved_quantity, sicht.free_quantity,
            item.item_number, item.name AS item_name, item.unit,
            ort.name AS location_name, ort.location_type
     FROM stock_availability AS sicht
     JOIN stock_items AS item
       ON item.company_id = sicht.company_id AND item.id = sicht.item_id
     JOIN storage_locations AS ort
       ON ort.company_id = sicht.company_id AND ort.id = sicht.location_id
     WHERE sicht.company_id = $1
       AND ($2::UUID IS NULL OR sicht.location_id = $2::UUID)
       AND sicht.physical_quantity <> 0
     ORDER BY ort.name, item.name
     LIMIT 500`,
    [context.companyId, locationId]
  );

  return result.rows.map((row) => ({
    itemId: row.item_id,
    itemNumber: row.item_number,
    itemName: row.item_name,
    unit: row.unit,
    locationId: row.location_id,
    locationName: row.location_name,
    locationType: row.location_type,
    // `quantity` bleibt der physische Bestand und heisst weiter so: an ihm
    // haengen Ansichten, die es schon gab. Frei und reserviert kommen daneben.
    quantity: number(row.physical_quantity),
    reservedQuantity: number(row.reserved_quantity),
    freeQuantity: number(row.free_quantity)
  }));
}

/**
 * Der Nachbestellvorschlag ist eine Rechnung und kein gespeicherter Zustand.
 * Ein Artikel, dessen Gesamtbestand unter den Mindestbestand faellt, steht
 * darin; die vorgeschlagene Menge fuellt bis zum Zielbestand auf.
 */
async function reorderSuggestions(client, context) {
  // Gerechnet wird mit dem *frei verfuegbaren* Bestand, nicht mit dem
  // physischen: was fuer eine Baustelle zurueckliegt, steht dem Lager nicht
  // mehr zur Verfuegung. Ohne diese Unterscheidung meldet das System volle
  // Regale, waehrend die naechste Entnahme schon nicht mehr geht.
  //
  // Ausgeloest wird beim Meldebestand, wenn es einen gibt. Er liegt ueber dem
  // Mindestbestand, damit bestellt wird, bevor es knapp ist - und nicht erst,
  // wenn es zu spaet ist.
  const result = await client.query(
    `SELECT ${ITEM_COLUMNS},
            COALESCE(reserviert.summe, 0) AS reserved_total,
            COALESCE(bestand.summe, 0) - COALESCE(reserviert.summe, 0) AS free_total,
            COALESCE(item.reorder_point, item.minimum_stock) AS trigger_point,
            GREATEST(COALESCE(item.target_stock, COALESCE(item.reorder_point, item.minimum_stock))
                     - (COALESCE(bestand.summe, 0) - COALESCE(reserviert.summe, 0)), 0)
              AS suggested_quantity,
            lieferant.name AS supplier_name, lieferant.id AS supplier_id
     ${ITEM_FROM}
     LEFT JOIN (
       SELECT company_id, item_id, SUM(quantity - quantity_fulfilled) AS summe
       FROM stock_reservations WHERE status = 'open'
       GROUP BY company_id, item_id
     ) AS reserviert
       ON reserviert.company_id = item.company_id AND reserviert.item_id = item.id
     LEFT JOIN suppliers AS lieferant
       ON lieferant.company_id = item.company_id AND lieferant.id = item.default_supplier_id
     WHERE item.company_id = $1 AND item.status = 'active'
       AND COALESCE(item.reorder_point, item.minimum_stock) > 0
       AND COALESCE(bestand.summe, 0) - COALESCE(reserviert.summe, 0)
           < COALESCE(item.reorder_point, item.minimum_stock)
     ORDER BY ((COALESCE(bestand.summe, 0) - COALESCE(reserviert.summe, 0))
               / NULLIF(COALESCE(item.reorder_point, item.minimum_stock), 0)), item.name
     LIMIT 200`,
    [context.companyId]
  );

  return result.rows.map((row) => ({
    ...itemDto(row),
    reservedQuantity: number(row.reserved_total),
    freeQuantity: number(row.free_total),
    reorderPoint: number(row.trigger_point),
    suggestedQuantity: number(row.suggested_quantity),
    supplierId: row.supplier_id || null,
    supplierName: row.supplier_name || null
  }));
}

// ---------------------------------------------------------------------------
// Lieferanten und Bestellungen
// ---------------------------------------------------------------------------

const ORDER_OPEN = ["ordered", "partially_received"];

function supplierDto(row) {
  return {
    id: row.id,
    supplierNumber: row.supplier_number,
    name: row.name,
    customerNumber: row.customer_number || null,
    contactName: row.contact_name || null,
    email: row.email || null,
    phone: row.phone || null,
    status: row.status,
    rowVersion: Number(row.row_version || 1)
  };
}

function orderDto(row) {
  return {
    id: row.id,
    orderNumber: row.order_number,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name || null,
    status: row.status,
    orderedAt: row.ordered_at ? new Date(row.ordered_at).toISOString() : null,
    expectedAt: row.expected_at ? new Date(row.expected_at).toISOString().slice(0, 10) : null,
    note: row.note || null,
    rowVersion: Number(row.row_version || 1)
  };
}

async function listSuppliers(client, context) {
  const result = await client.query(
    `SELECT * FROM suppliers WHERE company_id = $1 AND status = 'active' ORDER BY name`,
    [context.companyId]
  );
  return result.rows.map(supplierDto);
}

async function createSupplier(client, context, body) {
  await requireManager(client, context);

  const inserted = await client.query(
    `INSERT INTO suppliers (
       company_id, supplier_number, name, customer_number, contact_name,
       email, phone, note, created_by_user_id, changed_by_user_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
     RETURNING *`,
    [
      context.companyId,
      requiredText(body.supplierNumber, "Lieferantennummer", 40),
      requiredText(body.name, "Name", 160),
      optionalText(body.customerNumber, "Unsere Kundennummer", 60),
      optionalText(body.contactName, "Ansprechpartner", 120),
      optionalText(body.email, "E-Mail", 180),
      optionalText(body.phone, "Telefon", 40),
      optionalText(body.note, "Notiz", 2000),
      context.userId
    ]
  ).catch(mapDatabaseError);

  await client.query(
    `INSERT INTO stock_history (company_id, entity_type, entity_id, action, actor_user_id)
     VALUES ($1, 'supplier', $2, 'created', $3)`,
    [context.companyId, inserted.rows[0].id, context.userId]
  );

  return supplierDto(inserted.rows[0]);
}

async function orderDetail(client, context, orderId) {
  const order = await client.query(
    `SELECT bestellung.*, lieferant.name AS supplier_name
     FROM purchase_orders AS bestellung
     JOIN suppliers AS lieferant
       ON lieferant.company_id = bestellung.company_id AND lieferant.id = bestellung.supplier_id
     WHERE bestellung.company_id = $1 AND bestellung.id = $2`,
    [context.companyId, orderId]
  );
  if (order.rowCount !== 1) {
    throw new InputError("Diese Bestellung wurde nicht gefunden.", 404, "stock_order_unknown");
  }

  const lines = await client.query(
    `SELECT position.*, item.name, item.item_number, item.unit
     FROM purchase_order_items AS position
     JOIN stock_items AS item
       ON item.company_id = position.company_id AND item.id = position.item_id
     WHERE position.company_id = $1 AND position.purchase_order_id = $2
     ORDER BY position.line_position`,
    [context.companyId, orderId]
  );

  return {
    order: orderDto(order.rows[0]),
    lines: lines.rows.map((row) => {
      const ordered = number(row.quantity_ordered);
      const received = number(row.quantity_received);
      return {
        id: row.id,
        itemId: row.item_id,
        itemName: row.name,
        itemNumber: row.item_number,
        unit: row.unit,
        linePosition: Number(row.line_position),
        quantityOrdered: ordered,
        quantityReceived: received,
        quantityOpen: Math.max(0, Math.round((ordered - received) * 1000) / 1000),
        supplierItemNumber: row.supplier_item_number || null,
        unitPrice: number(row.unit_price)
      };
    })
  };
}

function readOrderLines(body) {
  if (!Array.isArray(body.lines) || !body.lines.length) {
    throw new InputError("Eine Bestellung braucht mindestens eine Position.");
  }
  if (body.lines.length > 200) throw new InputError("Eine Bestellung fasst höchstens 200 Positionen.");

  return body.lines.map((eintrag, index) => ({
    itemId: validateId(eintrag?.itemId, `Artikel in Position ${index + 1}`),
    quantity: quantity(eintrag?.quantity, `Menge in Position ${index + 1}`),
    supplierItemNumber: optionalText(eintrag?.supplierItemNumber, "Lieferanten-Artikelnummer", 80),
    unitPrice: eintrag?.unitPrice === undefined || eintrag?.unitPrice === null
      ? null
      : Number(eintrag.unitPrice).toFixed(4)
  }));
}

/**
 * Legt eine Bestellung an — entweder mit uebergebenen Positionen oder direkt
 * aus dem Nachbestellvorschlag des Lieferanten. Der Vorschlag ist eine
 * Rechnung; hier wird er zum ersten Mal zu etwas Festem.
 */
async function createOrder(client, context, body) {
  await requireManager(client, context);

  const supplierId = validateId(body.supplierId, "Lieferant");
  const supplier = await client.query(
    "SELECT id FROM suppliers WHERE company_id = $1 AND id = $2 AND status = 'active'",
    [context.companyId, supplierId]
  );
  if (supplier.rowCount !== 1) {
    throw new InputError("Diesen Lieferanten gibt es nicht.", 404, "stock_supplier_unknown");
  }

  let lines;
  if (body.fromReorder === true) {
    const vorschlaege = await reorderSuggestions(client, context);
    lines = vorschlaege
      .filter((eintrag) => eintrag.supplierId === supplierId && eintrag.suggestedQuantity > 0)
      .map((eintrag) => ({
        itemId: eintrag.id,
        quantity: eintrag.suggestedQuantity.toFixed(3),
        supplierItemNumber: null,
        unitPrice: null
      }));
    if (!lines.length) {
      throw new InputError(
        "Für diesen Lieferanten liegt nichts unter dem Mindestbestand.",
        409,
        "stock_reorder_empty"
      );
    }
  } else {
    lines = readOrderLines(body);
  }

  const jahr = new Date().getFullYear();
  const orderNumber = optionalText(body.orderNumber, "Bestellnummer", 40)
    || `B-${jahr}-${String(Date.now()).slice(-6)}`;

  const inserted = await client.query(
    `INSERT INTO purchase_orders (
       company_id, order_number, supplier_id, expected_at, note,
       created_by_user_id, changed_by_user_id
     ) VALUES ($1, $2, $3, $4::DATE, $5, $6, $6)
     RETURNING id`,
    [
      context.companyId, orderNumber, supplierId,
      optionalText(body.expectedAt, "Liefertermin", 10),
      optionalText(body.note, "Notiz", 2000),
      context.userId
    ]
  ).catch(mapDatabaseError);

  const orderId = inserted.rows[0].id;

  let position = 0;
  for (const zeile of lines) {
    position += 1;
    await client.query(
      `INSERT INTO purchase_order_items (
         company_id, purchase_order_id, item_id, line_position,
         quantity_ordered, supplier_item_number, unit_price
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        context.companyId, orderId, zeile.itemId, position,
        zeile.quantity, zeile.supplierItemNumber, zeile.unitPrice
      ]
    ).catch(mapDatabaseError);
  }

  await client.query(
    `INSERT INTO stock_history (company_id, entity_type, entity_id, action, actor_user_id)
     VALUES ($1, 'purchase_order', $2, 'created', $3)`,
    [context.companyId, orderId, context.userId]
  );

  return orderDetail(client, context, orderId);
}

async function sendOrder(client, context, orderId) {
  await requireManager(client, context);

  const updated = await client.query(
    `UPDATE purchase_orders
     SET status = 'ordered', ordered_at = CURRENT_TIMESTAMP, changed_by_user_id = $3,
         row_version = row_version + 1, updated_at = CURRENT_TIMESTAMP
     WHERE company_id = $1 AND id = $2 AND status = 'draft'
     RETURNING id`,
    [context.companyId, orderId, context.userId]
  );
  if (updated.rowCount !== 1) {
    throw new InputError("Nur ein Entwurf lässt sich bestellen.", 409, "stock_order_not_draft");
  }

  await client.query(
    `INSERT INTO stock_history (company_id, entity_type, entity_id, action, actor_user_id)
     VALUES ($1, 'purchase_order', $2, 'ordered', $3)`,
    [context.companyId, orderId, context.userId]
  );

  return orderDetail(client, context, orderId);
}

/**
 * Bucht einen Wareneingang gegen die Bestellung.
 *
 * Die Buchung laeuft ueber dasselbe Journal wie jeder andere Zugang; die
 * Bestellposition bekommt lediglich ihre gelieferte Menge fortgeschrieben.
 * Eine Ueberlieferung ist erlaubt und kein Fehler — sie kommt vor, und der
 * Bestand soll die Wirklichkeit zeigen, nicht die Bestellung.
 */
async function receiveOrder(client, context, orderId, body) {
  await requireManager(client, context);

  const order = await client.query(
    "SELECT status FROM purchase_orders WHERE company_id = $1 AND id = $2 FOR UPDATE",
    [context.companyId, orderId]
  );
  if (order.rowCount !== 1) {
    throw new InputError("Diese Bestellung wurde nicht gefunden.", 404, "stock_order_unknown");
  }
  if (!ORDER_OPEN.includes(order.rows[0].status)) {
    throw new InputError(
      "Diese Bestellung nimmt keinen Wareneingang mehr an.",
      409,
      "stock_order_closed"
    );
  }

  const locationId = validateId(body.locationId, "Lagerplatz");
  if (!Array.isArray(body.lines) || !body.lines.length) {
    throw new InputError("Ein Wareneingang braucht mindestens eine Position.");
  }

  const gebucht = [];
  for (const [index, eintrag] of body.lines.entries()) {
    const positionId = validateId(eintrag?.purchaseOrderItemId, `Position ${index + 1}`);
    const menge = quantity(eintrag?.quantity, `Menge in Position ${index + 1}`);

    const position = await client.query(
      `SELECT item_id FROM purchase_order_items
       WHERE company_id = $1 AND id = $2 AND purchase_order_id = $3`,
      [context.companyId, positionId, orderId]
    );
    if (position.rowCount !== 1) {
      throw new InputError("Diese Bestellposition gehört nicht zu dieser Bestellung.", 400, "stock_order_line_unknown");
    }

    const buchung = await bookMovement(client, context, {
      itemId: position.rows[0].item_id,
      movementType: "receipt",
      quantity: Number(menge),
      targetLocationId: locationId,
      purchaseOrderItemId: positionId,
      sourceType: optionalText(body.sourceType, "Herkunft", 30) || "api",
      clientOperationId: eintrag?.clientOperationId
    });

    if (!buchung.repeated) {
      await client.query(
        `UPDATE purchase_order_items
         SET quantity_received = quantity_received + $3,
             row_version = row_version + 1, updated_at = CURRENT_TIMESTAMP
         WHERE company_id = $1 AND id = $2`,
        [context.companyId, positionId, menge]
      );
    }
    gebucht.push({ purchaseOrderItemId: positionId, repeated: buchung.repeated });
  }

  // Vollstaendig ist eine Bestellung, wenn keine Position mehr offen ist.
  const offen = await client.query(
    `SELECT COUNT(*)::INT AS anzahl FROM purchase_order_items
     WHERE company_id = $1 AND purchase_order_id = $2 AND quantity_received < quantity_ordered`,
    [context.companyId, orderId]
  );
  const neuerStatus = offen.rows[0].anzahl === 0 ? "received" : "partially_received";

  await client.query(
    `UPDATE purchase_orders
     SET status = $3, changed_by_user_id = $4, row_version = row_version + 1,
         updated_at = CURRENT_TIMESTAMP
     WHERE company_id = $1 AND id = $2`,
    [context.companyId, orderId, neuerStatus, context.userId]
  );

  await client.query(
    `INSERT INTO stock_history (company_id, entity_type, entity_id, action, actor_user_id)
     VALUES ($1, 'purchase_order', $2, $3, $4)`,
    [context.companyId, orderId, `received_${neuerStatus}`, context.userId]
  );

  return { ...(await orderDetail(client, context, orderId)), booked: gebucht };
}

async function cancelOrder(client, context, orderId, body) {
  await requireManager(client, context);

  const reason = optionalText(body?.reason, "Grund", 2000);
  if (!reason) throw new InputError("Eine Stornierung braucht einen Grund.");

  const updated = await client.query(
    `UPDATE purchase_orders
     SET status = 'cancelled', changed_by_user_id = $3, row_version = row_version + 1,
         updated_at = CURRENT_TIMESTAMP
     WHERE company_id = $1 AND id = $2 AND status IN ('draft', 'ordered')
     RETURNING id`,
    [context.companyId, orderId, context.userId]
  );
  if (updated.rowCount !== 1) {
    throw new InputError(
      "Eine schon teilweise gelieferte Bestellung lässt sich nicht stornieren.",
      409,
      "stock_order_not_cancellable"
    );
  }

  await client.query(
    `INSERT INTO stock_history (company_id, entity_type, entity_id, action, actor_user_id, reason)
     VALUES ($1, 'purchase_order', $2, 'cancelled', $3, $4)`,
    [context.companyId, orderId, context.userId, reason]
  );

  return orderDetail(client, context, orderId);
}

async function listOrders(client, context, url) {
  const nurOffene = url.searchParams.get("offen") === "ja";

  const result = await client.query(
    `SELECT bestellung.*, lieferant.name AS supplier_name
     FROM purchase_orders AS bestellung
     JOIN suppliers AS lieferant
       ON lieferant.company_id = bestellung.company_id AND lieferant.id = bestellung.supplier_id
     WHERE bestellung.company_id = $1
       AND (NOT $2::BOOLEAN OR bestellung.status = ANY($3::VARCHAR[]))
     ORDER BY bestellung.created_at DESC
     LIMIT 200`,
    [context.companyId, nurOffene, ORDER_OPEN]
  );
  return result.rows.map(orderDto);
}

// ---------------------------------------------------------------------------
// Inventur
// ---------------------------------------------------------------------------

async function requireTransfer(client, context) {
  const allowed = await permissions(client, context);
  if (!allowed.transfer) {
    throw new InputError("Für die Inventur fehlt die Berechtigung.", 403, "stock_inventory_forbidden");
  }
}

function inventoryDto(row) {
  return {
    id: row.id,
    locationId: row.location_id,
    locationName: row.location_name || null,
    status: row.status,
    note: row.note || null,
    startedAt: new Date(row.started_at).toISOString(),
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    rowVersion: Number(row.row_version || 1)
  };
}

async function inventoryDetail(client, context, sessionId) {
  const session = await client.query(
    `SELECT sitzung.*, ort.name AS location_name
     FROM stock_inventory_sessions AS sitzung
     JOIN storage_locations AS ort
       ON ort.company_id = sitzung.company_id AND ort.id = sitzung.location_id
     WHERE sitzung.company_id = $1 AND sitzung.id = $2`,
    [context.companyId, sessionId]
  );
  if (session.rowCount !== 1) {
    throw new InputError("Diese Inventur wurde nicht gefunden.", 404, "stock_inventory_unknown");
  }

  const counts = await client.query(
    `SELECT zaehlung.item_id, zaehlung.expected_quantity, zaehlung.counted_quantity,
            zaehlung.counted_at, item.item_number, item.name, item.unit
     FROM stock_inventory_counts AS zaehlung
     JOIN stock_items AS item
       ON item.company_id = zaehlung.company_id AND item.id = zaehlung.item_id
     WHERE zaehlung.company_id = $1 AND zaehlung.session_id = $2
     ORDER BY item.name`,
    [context.companyId, sessionId]
  );

  const lines = counts.rows.map((row) => {
    const expected = number(row.expected_quantity);
    const counted = row.counted_quantity === null ? null : number(row.counted_quantity);
    return {
      itemId: row.item_id,
      itemNumber: row.item_number,
      itemName: row.name,
      unit: row.unit,
      expectedQuantity: expected,
      countedQuantity: counted,
      difference: counted === null ? null : Math.round((counted - expected) * 1000) / 1000,
      countedAt: row.counted_at ? new Date(row.counted_at).toISOString() : null
    };
  });

  return {
    session: inventoryDto(session.rows[0]),
    lines,
    open: lines.filter((line) => line.countedQuantity === null).length,
    differences: lines.filter((line) => line.difference !== null && line.difference !== 0).length
  };
}

/**
 * Startet eine Inventur und friert den Sollbestand des Lagerplatzes ein.
 *
 * Eingefroren wird bewusst beim Start und nicht beim Abschluss: die Zaehlerin
 * stellt einen Unterschied zu genau diesem Stand fest. Buchungen, die waehrend
 * der Zaehlung entstehen, sind echte Bewegungen und bleiben deshalb beim
 * Abschluss erhalten, statt von der Korrektur ueberschrieben zu werden.
 */
async function startInventory(client, context, body) {
  await requireTransfer(client, context);
  const locationId = validateId(body.locationId, "Lagerplatz");

  const location = await client.query(
    "SELECT id FROM storage_locations WHERE company_id = $1 AND id = $2 AND status = 'active'",
    [context.companyId, locationId]
  );
  if (location.rowCount !== 1) {
    throw new InputError("Diesen Lagerplatz gibt es nicht.", 404, "stock_location_unknown");
  }

  await client.query("SAVEPOINT inventur");
  let session;
  try {
    session = await client.query(
      `INSERT INTO stock_inventory_sessions (company_id, location_id, note, started_by_user_id)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [context.companyId, locationId, optionalText(body.note, "Notiz", 2000), context.userId]
    );
  } catch (error) {
    await client.query("ROLLBACK TO SAVEPOINT inventur");
    if (error?.code === "23505") {
      throw new InputError(
        "Für diesen Lagerplatz läuft bereits eine Inventur.",
        409,
        "stock_inventory_running"
      );
    }
    mapDatabaseError(error);
  }
  await client.query("RELEASE SAVEPOINT inventur");

  const sessionId = session.rows[0].id;

  await client.query(
    `INSERT INTO stock_inventory_counts (company_id, session_id, item_id, expected_quantity)
     SELECT bestand.company_id, $2, bestand.item_id, bestand.quantity
     FROM stock_levels AS bestand
     WHERE bestand.company_id = $1 AND bestand.location_id = $3 AND bestand.quantity <> 0`,
    [context.companyId, sessionId, locationId]
  );

  await client.query(
    `INSERT INTO stock_history (company_id, entity_type, entity_id, action, actor_user_id)
     VALUES ($1, 'inventory_session', $2, 'started', $3)`,
    [context.companyId, sessionId, context.userId]
  );

  return inventoryDetail(client, context, sessionId);
}

async function recordCount(client, context, sessionId, body) {
  await requireTransfer(client, context);

  const session = await client.query(
    "SELECT status, location_id FROM stock_inventory_sessions WHERE company_id = $1 AND id = $2",
    [context.companyId, sessionId]
  );
  if (session.rowCount !== 1) {
    throw new InputError("Diese Inventur wurde nicht gefunden.", 404, "stock_inventory_unknown");
  }
  if (session.rows[0].status !== "running") {
    throw new InputError("Diese Inventur ist bereits abgeschlossen.", 409, "stock_inventory_closed");
  }

  const itemId = validateId(body.itemId, "Artikel");
  // Null ist beim Zaehlen eine gueltige Antwort: das Fach ist leer.
  const counted = body.quantity === 0 ? "0.000" : quantity(body.quantity, "Gezählte Menge");

  // Ein Artikel, der beim Start nicht am Platz lag, aber jetzt dort liegt,
  // gehoert mit Sollbestand null in die Zaehlung — sonst faellt genau der
  // Fund unter den Tisch, den eine Inventur finden soll.
  await client.query(
    `INSERT INTO stock_inventory_counts (
       company_id, session_id, item_id, expected_quantity,
       counted_quantity, counted_by_user_id, counted_at
     ) VALUES ($1, $2, $3, 0, $4, $5, CURRENT_TIMESTAMP)
     ON CONFLICT (company_id, session_id, item_id) DO UPDATE
     SET counted_quantity = EXCLUDED.counted_quantity,
         counted_by_user_id = EXCLUDED.counted_by_user_id,
         counted_at = EXCLUDED.counted_at,
         row_version = stock_inventory_counts.row_version + 1`,
    [context.companyId, sessionId, itemId, counted, context.userId]
  ).catch(mapDatabaseError);

  return inventoryDetail(client, context, sessionId);
}

/**
 * Schliesst die Inventur ab und schreibt die Unterschiede als Korrekturen.
 *
 * Nicht gezaehlte Zeilen bleiben unangetastet. Sie auf null zu setzen waere
 * die gefaehrlichere Annahme: eine abgebrochene Zaehlung wuerde dann ein
 * halbes Lager ausbuchen.
 */
async function completeInventory(client, context, sessionId, body) {
  await requireManager(client, context);

  const session = await client.query(
    `SELECT status, location_id FROM stock_inventory_sessions
     WHERE company_id = $1 AND id = $2 FOR UPDATE`,
    [context.companyId, sessionId]
  );
  if (session.rowCount !== 1) {
    throw new InputError("Diese Inventur wurde nicht gefunden.", 404, "stock_inventory_unknown");
  }
  if (session.rows[0].status !== "running") {
    throw new InputError("Diese Inventur ist bereits abgeschlossen.", 409, "stock_inventory_closed");
  }
  const locationId = session.rows[0].location_id;

  const differences = await client.query(
    `SELECT item_id, expected_quantity, counted_quantity
     FROM stock_inventory_counts
     WHERE company_id = $1 AND session_id = $2
       AND counted_quantity IS NOT NULL
       AND counted_quantity <> expected_quantity`,
    [context.companyId, sessionId]
  );

  const reason = optionalText(body?.reason, "Grund", 2000)
    || `Inventur vom ${new Date().toISOString().slice(0, 10)}`;

  let booked = 0;
  for (const row of differences.rows) {
    const difference = Number(row.counted_quantity) - Number(row.expected_quantity);
    const amount = Math.abs(Math.round(difference * 1000) / 1000).toFixed(3);

    await client.query(
      `INSERT INTO stock_movements (
         company_id, item_id, movement_type, quantity,
         source_location_id, target_location_id, inventory_session_id,
         actor_user_id, reason, source_type
       ) VALUES ($1, $2, 'correction', $3, $4, $5, $6, $7, $8, 'inventory')`,
      [
        context.companyId, row.item_id, amount,
        difference < 0 ? locationId : null,
        difference > 0 ? locationId : null,
        sessionId, context.userId, reason
      ]
    ).catch(mapDatabaseError);
    booked += 1;
  }

  await client.query(
    `UPDATE stock_inventory_sessions
     SET status = 'completed', completed_by_user_id = $3, completed_at = CURRENT_TIMESTAMP,
         row_version = row_version + 1
     WHERE company_id = $1 AND id = $2`,
    [context.companyId, sessionId, context.userId]
  );

  await client.query(
    `INSERT INTO stock_history (company_id, entity_type, entity_id, action, actor_user_id, reason)
     VALUES ($1, 'inventory_session', $2, 'completed', $3, $4)`,
    [context.companyId, sessionId, context.userId, reason]
  );

  return { ...(await inventoryDetail(client, context, sessionId)), corrections: booked };
}

async function cancelInventory(client, context, sessionId, body) {
  await requireTransfer(client, context);

  const reason = optionalText(body?.reason, "Grund", 2000);
  if (!reason) throw new InputError("Ein Abbruch braucht einen Grund.");

  const updated = await client.query(
    `UPDATE stock_inventory_sessions
     SET status = 'cancelled', completed_by_user_id = $3, completed_at = CURRENT_TIMESTAMP,
         row_version = row_version + 1
     WHERE company_id = $1 AND id = $2 AND status = 'running'
     RETURNING id`,
    [context.companyId, sessionId, context.userId]
  );
  if (updated.rowCount !== 1) {
    throw new InputError("Diese Inventur läuft nicht mehr.", 409, "stock_inventory_closed");
  }

  await client.query(
    `INSERT INTO stock_history (company_id, entity_type, entity_id, action, actor_user_id, reason)
     VALUES ($1, 'inventory_session', $2, 'cancelled', $3, $4)`,
    [context.companyId, sessionId, context.userId, reason]
  );

  return inventoryDetail(client, context, sessionId);
}

async function listInventories(client, context) {
  const result = await client.query(
    `SELECT sitzung.*, ort.name AS location_name
     FROM stock_inventory_sessions AS sitzung
     JOIN storage_locations AS ort
       ON ort.company_id = sitzung.company_id AND ort.id = sitzung.location_id
     WHERE sitzung.company_id = $1 AND sitzung.status = 'running'
     ORDER BY sitzung.started_at`,
    [context.companyId]
  );
  return result.rows.map(inventoryDto);
}

// ---------------------------------------------------------------------------
// Lieferscheine
//
// Ein Lieferschein ist hier ein Beleg mit Positionen und nicht nur ein Foto.
// Erfasst wird er als Entwurf - oft im Stehen, waehrend der Fahrer wartet -
// und erst das Buchen erzeugt die Materialbewegungen. Danach wird er
// storniert und nicht mehr geaendert.
// ---------------------------------------------------------------------------

const DELIVERY_OPEN = ["draft"];

function deliveryNoteDto(row) {
  return {
    id: row.id,
    deliveryNoteNumber: row.delivery_note_number,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name || null,
    deliveredOn: row.delivered_on
      ? new Date(row.delivered_on).toISOString().slice(0, 10)
      : null,
    purchaseOrderId: row.purchase_order_id || null,
    purchaseOrderNumber: row.order_number || null,
    targetLocationId: row.target_location_id,
    targetLocationName: row.target_location_name || null,
    constructionSiteId: row.construction_site_id || null,
    constructionSiteName: row.site_name || null,
    projectId: row.project_id || null,
    documentId: row.document_id || null,
    status: row.status,
    note: row.note || null,
    bookedAt: row.booked_at ? new Date(row.booked_at).toISOString() : null,
    cancelReason: row.cancel_reason || null,
    rowVersion: Number(row.row_version || 1)
  };
}

const DELIVERY_NOTE_SELECT = `
  SELECT schein.*,
         lieferant.name AS supplier_name,
         bestellung.order_number,
         ziel.name AS target_location_name,
         baustelle.name AS site_name
  FROM delivery_notes AS schein
  JOIN suppliers AS lieferant
    ON lieferant.company_id = schein.company_id AND lieferant.id = schein.supplier_id
  JOIN storage_locations AS ziel
    ON ziel.company_id = schein.company_id AND ziel.id = schein.target_location_id
  LEFT JOIN purchase_orders AS bestellung
    ON bestellung.company_id = schein.company_id AND bestellung.id = schein.purchase_order_id
  LEFT JOIN construction_sites AS baustelle
    ON baustelle.company_id = schein.company_id AND baustelle.id = schein.construction_site_id`;

async function listDeliveryNotes(client, context, url) {
  // Auf einem Lieferschein stehen Preise. Wer sie nicht sehen darf, sieht auch
  // den Schein nicht - das ist dieselbe Grenze wie bei Bestellungen.
  await requireManager(client, context);

  const status = optionalText(url.searchParams.get("status"), "Status", 20);
  const result = await client.query(
    `${DELIVERY_NOTE_SELECT}
     WHERE schein.company_id = $1
       AND ($2::TEXT IS NULL OR schein.status = $2)
     ORDER BY schein.delivered_on DESC, schein.created_at DESC
     LIMIT 200`,
    [context.companyId, status]
  );
  return result.rows.map(deliveryNoteDto);
}

/**
 * Der Abgleich mit der Bestellung.
 *
 * Bestellt, bisher geliefert, mit diesem Schein, noch offen - und die
 * Ueberlieferung als eigene Zahl. Sie wird nicht verhindert: geliefert ist
 * geliefert, und der Lieferant hat nun einmal 520 statt 500 Meter gebracht.
 * Verschwiegen wird sie aber auch nicht, denn genau daran haengt spaeter die
 * Rechnungspruefung.
 */
function abgleichZeile(row, scheinGebucht) {
  const runde = (wert) => Math.round(wert * 1000) / 1000;
  const bestellt = number(row.quantity_ordered);
  const jetzt = number(row.quantity_now || 0);

  // `quantity_received` an der Bestellposition ist die Wahrheit ueber alles
  // Gelieferte. Ist dieser Schein bereits gebucht, steckt seine Menge darin -
  // sie ein zweites Mal zu addieren, haette aus einer Teillieferung eine
  // Ueberlieferung gemacht.
  const geliefert = scheinGebucht
    ? number(row.quantity_received)
    : runde(number(row.quantity_received) + jetzt);

  return {
    purchaseOrderItemId: row.id,
    itemId: row.item_id,
    itemNumber: row.item_number,
    itemName: row.name,
    unit: row.unit,
    quantityOrdered: bestellt,
    quantityReceivedBefore: runde(geliefert - jetzt),
    quantityOnThisNote: jetzt,
    quantityDeliveredTotal: geliefert,
    quantityOpen: Math.max(runde(bestellt - geliefert), 0),
    quantityOver: Math.max(runde(geliefert - bestellt), 0)
  };
}

async function deliveryNoteDetail(client, context, noteId) {
  await requireManager(client, context);

  const schein = await client.query(
    `${DELIVERY_NOTE_SELECT} WHERE schein.company_id = $1 AND schein.id = $2`,
    [context.companyId, noteId]
  );
  if (schein.rowCount !== 1) {
    throw new InputError("Dieser Lieferschein wurde nicht gefunden.", 404, "stock_delivery_note_unknown");
  }

  const positionen = await client.query(
    `SELECT zeile.*, artikel.item_number, artikel.name AS item_name, artikel.unit
     FROM delivery_note_items AS zeile
     JOIN stock_items AS artikel
       ON artikel.company_id = zeile.company_id AND artikel.id = zeile.item_id
     WHERE zeile.company_id = $1 AND zeile.delivery_note_id = $2
     ORDER BY zeile.line_position`,
    [context.companyId, noteId]
  );

  const bestellung = schein.rows[0].purchase_order_id;
  const abgleich = bestellung
    ? (await client.query(
      `SELECT position.id, position.item_id, position.quantity_ordered,
              position.quantity_received,
              artikel.item_number, artikel.name, artikel.unit,
              COALESCE((
                SELECT SUM(zeile.quantity) FROM delivery_note_items AS zeile
                WHERE zeile.company_id = position.company_id
                  AND zeile.purchase_order_item_id = position.id
                  AND zeile.delivery_note_id = $3
              ), 0) AS quantity_now
       FROM purchase_order_items AS position
       JOIN stock_items AS artikel
         ON artikel.company_id = position.company_id AND artikel.id = position.item_id
       WHERE position.company_id = $1 AND position.purchase_order_id = $2
       ORDER BY position.line_position`,
      [context.companyId, bestellung, noteId]
    )).rows.map((row) => abgleichZeile(row, schein.rows[0].status === "booked"))
    : [];

  const bewegungen = await client.query(
    `SELECT bewegung.* FROM stock_movements AS bewegung
     JOIN delivery_note_items AS zeile
       ON zeile.company_id = bewegung.company_id AND zeile.id = bewegung.delivery_note_item_id
     WHERE bewegung.company_id = $1 AND zeile.delivery_note_id = $2
     ORDER BY bewegung.occurred_at`,
    [context.companyId, noteId]
  );

  return {
    deliveryNote: deliveryNoteDto(schein.rows[0]),
    items: positionen.rows.map((row) => ({
      id: row.id,
      itemId: row.item_id,
      itemNumber: row.item_number,
      itemName: row.item_name,
      unit: row.unit,
      linePosition: Number(row.line_position),
      quantity: number(row.quantity),
      purchaseOrderItemId: row.purchase_order_item_id || null,
      supplierItemNumber: row.supplier_item_number || null,
      unitPrice: row.unit_price === null ? null : Number(row.unit_price),
      note: row.note || null
    })),
    orderComparison: abgleich,
    movements: bewegungen.rows.map(movementDto)
  };
}

function readDeliveryLines(body) {
  if (!Array.isArray(body?.items) || !body.items.length) {
    throw new InputError("Ein Lieferschein braucht mindestens eine Position.");
  }
  if (body.items.length > 200) {
    throw new InputError("Ein Lieferschein fasst höchstens 200 Positionen.");
  }
  return body.items.map((eintrag, index) => ({
    itemId: validateId(eintrag?.itemId, `Artikel in Position ${index + 1}`),
    quantity: quantity(eintrag?.quantity, `Menge in Position ${index + 1}`),
    purchaseOrderItemId: optionalId(eintrag?.purchaseOrderItemId, "Bestellposition"),
    supplierItemNumber: optionalText(eintrag?.supplierItemNumber, "Lieferantenartikelnummer", 60),
    unitPrice: eintrag?.unitPrice === undefined || eintrag?.unitPrice === null
      ? null
      : Number(eintrag.unitPrice),
    note: optionalText(eintrag?.note, "Hinweis", 2000)
  }));
}

async function createDeliveryNote(client, context, body) {
  await requireManager(client, context);

  const supplierId = validateId(body.supplierId, "Lieferant");
  const targetLocationId = validateId(body.targetLocationId, "Lieferziel");
  const lines = readDeliveryLines(body);

  const ziel = await client.query(
    "SELECT construction_site_id FROM storage_locations WHERE company_id = $1 AND id = $2 AND status = 'active'",
    [context.companyId, targetLocationId]
  );
  if (ziel.rowCount !== 1) {
    throw new InputError("Dieses Lieferziel gibt es nicht.", 404, "stock_location_unknown");
  }

  // Die Baustelle steht am Lieferziel und wird nicht getrennt gepflegt: sonst
  // koennte ein Schein auf Baustelle A zeigen und die Ware auf Baustelle B
  // landen.
  const constructionSiteId = ziel.rows[0].construction_site_id
    || optionalId(body.constructionSiteId, "Baustelle");

  const inserted = await client.query(
    `INSERT INTO delivery_notes (
       company_id, supplier_id, delivery_note_number, delivered_on,
       purchase_order_id, target_location_id, construction_site_id, project_id,
       document_id, note, created_by_user_id, changed_by_user_id
     ) VALUES ($1, $2, $3, $4::DATE, $5, $6, $7, $8, $9, $10, $11, $11)
     RETURNING id`,
    [
      context.companyId, supplierId,
      requiredText(body.deliveryNoteNumber, "Lieferscheinnummer", 60),
      requiredText(body.deliveredOn, "Lieferdatum", 10),
      optionalId(body.purchaseOrderId, "Bestellung"),
      targetLocationId, constructionSiteId,
      optionalId(body.projectId, "Projekt"),
      optionalId(body.documentId, "Dokument"),
      optionalText(body.note, "Notiz", 2000),
      context.userId
    ]
  ).catch(mapDatabaseError);

  const noteId = inserted.rows[0].id;
  let position = 0;
  for (const zeile of lines) {
    position += 1;
    await client.query(
      `INSERT INTO delivery_note_items (
         company_id, delivery_note_id, item_id, line_position, quantity,
         purchase_order_item_id, supplier_item_number, unit_price, note
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        context.companyId, noteId, zeile.itemId, position, zeile.quantity,
        zeile.purchaseOrderItemId, zeile.supplierItemNumber, zeile.unitPrice, zeile.note
      ]
    ).catch(mapDatabaseError);
  }

  await client.query(
    `INSERT INTO stock_history (company_id, entity_type, entity_id, action, actor_user_id, new_state)
     VALUES ($1, 'delivery_note', $2, 'created', $3, $4::JSONB)`,
    [context.companyId, noteId, context.userId,
      JSON.stringify({ number: body.deliveryNoteNumber, positions: lines.length })]
  );

  return deliveryNoteDetail(client, context, noteId);
}

/**
 * Aus dem Beleg werden Bewegungen.
 *
 * Der Statuswechsel steht bewusst am Anfang und ist an `status = 'draft'`
 * gebunden. Zwei Leute, die gleichzeitig auf "Buchen" tippen, erzeugen so
 * nicht zwei Wareneingaenge: der zweite findet keinen Entwurf mehr. Danach
 * erst entstehen die Bewegungen - in derselben Transaktion, sodass entweder
 * alle stehen oder keine.
 */
async function bookDeliveryNote(client, context, noteId, body) {
  await requireManager(client, context);

  const schein = await client.query(
    `SELECT * FROM delivery_notes
     WHERE company_id = $1 AND id = $2 FOR UPDATE`,
    [context.companyId, noteId]
  );
  if (schein.rowCount !== 1) {
    throw new InputError("Dieser Lieferschein wurde nicht gefunden.", 404, "stock_delivery_note_unknown");
  }
  if (!DELIVERY_OPEN.includes(schein.rows[0].status)) {
    throw new InputError(
      "Dieser Lieferschein ist bereits gebucht oder storniert.",
      409,
      "stock_delivery_note_closed"
    );
  }

  const gebucht = await client.query(
    `UPDATE delivery_notes
     SET status = 'booked', booked_at = CURRENT_TIMESTAMP, booked_by_user_id = $3,
         changed_by_user_id = $3
     WHERE company_id = $1 AND id = $2 AND status = 'draft'
     RETURNING id`,
    [context.companyId, noteId, context.userId]
  );
  if (gebucht.rowCount !== 1) {
    throw new InputError(
      "Dieser Lieferschein wurde zwischenzeitlich gebucht.",
      409,
      "stock_delivery_note_closed"
    );
  }

  const positionen = await client.query(
    `SELECT * FROM delivery_note_items
     WHERE company_id = $1 AND delivery_note_id = $2 ORDER BY line_position`,
    [context.companyId, noteId]
  );
  if (!positionen.rowCount) {
    throw new InputError("Dieser Lieferschein hat keine Positionen.", 409, "stock_delivery_note_empty");
  }

  const kopf = schein.rows[0];
  const sourceType = optionalText(body?.sourceType, "Herkunft", 30) || "api";
  const bestellungen = new Set();

  for (const zeile of positionen.rows) {
    const buchung = await client.query(
      `INSERT INTO stock_movements (
         company_id, item_id, movement_type, quantity, target_location_id,
         construction_site_id, purchase_order_item_id, delivery_note_item_id,
         actor_user_id, source_type, reason
       ) VALUES ($1, $2, 'receipt', $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        context.companyId, zeile.item_id, zeile.quantity, kopf.target_location_id,
        kopf.construction_site_id, zeile.purchase_order_item_id, zeile.id,
        context.userId, sourceType,
        `Lieferschein ${kopf.delivery_note_number}`
      ]
    ).catch(mapDatabaseError);

    if (zeile.purchase_order_item_id) {
      const position = await client.query(
        `UPDATE purchase_order_items
         SET quantity_received = quantity_received + $3,
             row_version = row_version + 1, updated_at = CURRENT_TIMESTAMP
         WHERE company_id = $1 AND id = $2
         RETURNING purchase_order_id`,
        [context.companyId, zeile.purchase_order_item_id, zeile.quantity]
      );
      if (position.rowCount === 1) bestellungen.add(position.rows[0].purchase_order_id);
    }
    void buchung;
  }

  // Der Stand jeder beruehrten Bestellung folgt aus ihren Positionen und wird
  // nicht getrennt gepflegt. Eine Ueberlieferung schliesst sie ebenfalls: es
  // kommt nichts mehr.
  for (const bestellungId of bestellungen) {
    const offen = await client.query(
      `SELECT COUNT(*)::INT AS anzahl FROM purchase_order_items
       WHERE company_id = $1 AND purchase_order_id = $2
         AND quantity_received < quantity_ordered`,
      [context.companyId, bestellungId]
    );
    await client.query(
      `UPDATE purchase_orders
       SET status = $3, changed_by_user_id = $4, row_version = row_version + 1,
           updated_at = CURRENT_TIMESTAMP
       WHERE company_id = $1 AND id = $2 AND status IN ('ordered', 'partially_received')`,
      [
        context.companyId, bestellungId,
        offen.rows[0].anzahl === 0 ? "received" : "partially_received",
        context.userId
      ]
    );
  }

  await client.query(
    `INSERT INTO stock_history (company_id, entity_type, entity_id, action, actor_user_id)
     VALUES ($1, 'delivery_note', $2, 'booked', $3)`,
    [context.companyId, noteId, context.userId]
  );

  return deliveryNoteDetail(client, context, noteId);
}

async function cancelDeliveryNote(client, context, noteId, body) {
  await requireManager(client, context);

  const reason = optionalText(body?.reason, "Grund", 2000);
  if (!reason) throw new InputError("Eine Stornierung braucht einen Grund.");

  // Nur ein Entwurf laesst sich einfach zuruecknehmen. Ist gebucht, haengen
  // Bewegungen daran, und die werden gegengebucht statt geloescht - das kommt
  // mit dem Storno der Bewegung.
  const updated = await client.query(
    `UPDATE delivery_notes
     SET status = 'cancelled', cancel_reason = $3, changed_by_user_id = $4
     WHERE company_id = $1 AND id = $2 AND status = 'draft'
     RETURNING id`,
    [context.companyId, noteId, reason, context.userId]
  );
  if (updated.rowCount !== 1) {
    throw new InputError(
      "Nur ein noch nicht gebuchter Lieferschein lässt sich stornieren.",
      409,
      "stock_delivery_note_closed"
    );
  }

  await client.query(
    `INSERT INTO stock_history (company_id, entity_type, entity_id, action, actor_user_id, reason)
     VALUES ($1, 'delivery_note', $2, 'cancelled', $3, $4)`,
    [context.companyId, noteId, context.userId, reason]
  );

  return deliveryNoteDetail(client, context, noteId);
}

// ---------------------------------------------------------------------------
// Reservierungen
// ---------------------------------------------------------------------------

function reservierungDto(row) {
  const menge = number(row.quantity);
  const geholt = number(row.quantity_fulfilled);
  return {
    id: row.id,
    itemId: row.item_id,
    itemNumber: row.item_number || null,
    itemName: row.item_name || null,
    unit: row.unit || null,
    locationId: row.location_id,
    locationName: row.location_name || null,
    constructionSiteId: row.construction_site_id || null,
    constructionSiteName: row.site_name || null,
    quantity: menge,
    quantityFulfilled: geholt,
    quantityOpen: Math.round((menge - geholt) * 1000) / 1000,
    neededOn: row.needed_on ? new Date(row.needed_on).toISOString().slice(0, 10) : null,
    status: row.status,
    note: row.note || null,
    releaseReason: row.release_reason || null,
    rowVersion: Number(row.row_version || 1)
  };
}

async function listReservations(client, context, url) {
  const siteId = optionalId(url.searchParams.get("baustelle"), "Baustelle");
  const itemId = optionalId(url.searchParams.get("artikel"), "Artikel");
  const nurOffene = url.searchParams.get("offen") !== "nein";

  const result = await client.query(
    `SELECT reservierung.*, artikel.item_number, artikel.name AS item_name, artikel.unit,
            ort.name AS location_name, baustelle.name AS site_name
     FROM stock_reservations AS reservierung
     JOIN stock_items AS artikel
       ON artikel.company_id = reservierung.company_id AND artikel.id = reservierung.item_id
     JOIN storage_locations AS ort
       ON ort.company_id = reservierung.company_id AND ort.id = reservierung.location_id
     LEFT JOIN construction_sites AS baustelle
       ON baustelle.company_id = reservierung.company_id
      AND baustelle.id = reservierung.construction_site_id
     WHERE reservierung.company_id = $1
       AND (NOT $2::BOOLEAN OR reservierung.status = 'open')
       AND ($3::UUID IS NULL OR reservierung.construction_site_id = $3::UUID)
       AND ($4::UUID IS NULL OR reservierung.item_id = $4::UUID)
     ORDER BY reservierung.needed_on NULLS LAST, reservierung.created_at DESC
     LIMIT 300`,
    [context.companyId, nurOffene, siteId, itemId]
  );
  return result.rows.map(reservierungDto);
}

/**
 * Zurueckgelegt wird nur, was auch da ist.
 *
 * Mehr zu reservieren, als frei verfuegbar ist, waere ein Versprechen auf
 * Material, das ein anderer schon hat - und es faellt erst auf, wenn beide
 * davorstehen.
 */
async function createReservation(client, context, body) {
  await requireMovementPermission(client, context, "transfer");

  const itemId = validateId(body.itemId, "Artikel");
  const locationId = validateId(body.locationId, "Lagerplatz");
  const amount = quantity(body.quantity);

  const verfuegbar = await client.query(
    `SELECT COALESCE(sicht.free_quantity, 0) AS frei
     FROM (SELECT 1) AS eins
     LEFT JOIN stock_availability AS sicht
       ON sicht.company_id = $1 AND sicht.item_id = $2 AND sicht.location_id = $3`,
    [context.companyId, itemId, locationId]
  );
  const frei = number(verfuegbar.rows[0]?.frei ?? 0);
  if (frei < amount) {
    throw new InputError(
      `Frei verfügbar sind nur ${frei}. Mehr lässt sich nicht zurücklegen.`,
      409,
      "stock_reservation_exceeds_free"
    );
  }

  const inserted = await client.query(
    `INSERT INTO stock_reservations (
       company_id, item_id, location_id, construction_site_id, project_id,
       quantity, needed_on, note, created_by_user_id, changed_by_user_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7::DATE, $8, $9, $9)
     RETURNING id`,
    [
      context.companyId, itemId, locationId,
      optionalId(body.constructionSiteId, "Baustelle"),
      optionalId(body.projectId, "Projekt"),
      amount,
      optionalText(body.neededOn, "Benötigt am", 10),
      optionalText(body.note, "Notiz", 2000),
      context.userId
    ]
  ).catch(mapDatabaseError);

  await client.query(
    `INSERT INTO stock_history (company_id, entity_type, entity_id, action, actor_user_id, new_state)
     VALUES ($1, 'stock_reservation', $2, 'created', $3, $4::JSONB)`,
    [context.companyId, inserted.rows[0].id, context.userId, JSON.stringify({ quantity: amount })]
  );

  const alle = await listReservations(client, context, new URL("http://intern/?offen=nein"));
  return { reservation: alle.find((eintrag) => eintrag.id === inserted.rows[0].id) || null };
}

async function releaseReservation(client, context, reservationId, body) {
  await requireMovementPermission(client, context, "transfer");

  const reason = optionalText(body?.reason, "Grund", 2000);
  if (!reason) throw new InputError("Eine Reservierung wird nur mit Grund aufgehoben.");

  const updated = await client.query(
    `UPDATE stock_reservations
     SET status = 'released', release_reason = $3, changed_by_user_id = $4
     WHERE company_id = $1 AND id = $2 AND status = 'open'
     RETURNING id`,
    [context.companyId, reservationId, reason, context.userId]
  );
  if (updated.rowCount !== 1) {
    throw new InputError(
      "Nur eine offene Reservierung lässt sich aufheben.",
      409,
      "stock_reservation_closed"
    );
  }

  await client.query(
    `INSERT INTO stock_history (company_id, entity_type, entity_id, action, actor_user_id, reason)
     VALUES ($1, 'stock_reservation', $2, 'released', $3, $4)`,
    [context.companyId, reservationId, context.userId, reason]
  );

  const alle = await listReservations(client, context, new URL("http://intern/?offen=nein"));
  return { reservation: alle.find((eintrag) => eintrag.id === reservationId) || null };
}

/**
 * Das Material einer Baustelle auf einen Blick.
 *
 * Die vier Zahlen, die im Betrieb regelmaessig durcheinandergehen, stehen hier
 * bewusst nebeneinander und werden nicht zu einer verrechnet:
 *
 *   * `onSite` - was jetzt dort liegt. Kommt aus dem Bestand am
 *     Baustellenlagerort und ist damit dieselbe Zahl wie ueberall sonst.
 *   * `consumed` - was ausdruecklich als verbaut gemeldet wurde.
 *   * `returned` - was zurueckging.
 *   * `ordered` - was bestellt, aber noch nicht geliefert ist.
 *
 * Nicht gerechnet wird "Verbrauch = geliefert minus zurueck". Sobald eine
 * Umbuchung auf eine zweite Baustelle dazwischenliegt, ist die Formel falsch,
 * und auf einer laufenden Baustelle ist sie immer zu frueh: was heute im
 * Container steht, ist nicht verbraucht.
 */
async function siteMaterialOverview(client, context, siteId) {
  const baustelle = await client.query(
    "SELECT id, name FROM construction_sites WHERE company_id = $1 AND id = $2",
    [context.companyId, siteId]
  );
  if (baustelle.rowCount !== 1) {
    throw new InputError("Diese Baustelle wurde nicht gefunden.", 404, "stock_site_unknown");
  }

  const [bestand, bewegungen, reservierungen, bestellt, scheine] = await Promise.all([
    client.query(
      `SELECT sicht.item_id, sicht.physical_quantity, sicht.reserved_quantity,
              artikel.item_number, artikel.name, artikel.unit
       FROM stock_availability AS sicht
       JOIN storage_locations AS ort
         ON ort.company_id = sicht.company_id AND ort.id = sicht.location_id
       JOIN stock_items AS artikel
         ON artikel.company_id = sicht.company_id AND artikel.id = sicht.item_id
       WHERE sicht.company_id = $1 AND ort.construction_site_id = $2
         AND sicht.physical_quantity <> 0
       ORDER BY artikel.name`,
      [context.companyId, siteId]
    ),
    client.query(
      `SELECT bewegung.item_id, bewegung.movement_type,
              SUM(bewegung.quantity) AS menge,
              artikel.item_number, artikel.name, artikel.unit
       FROM stock_movements AS bewegung
       JOIN stock_items AS artikel
         ON artikel.company_id = bewegung.company_id AND artikel.id = bewegung.item_id
       WHERE bewegung.company_id = $1 AND bewegung.construction_site_id = $2
       GROUP BY bewegung.item_id, bewegung.movement_type,
                artikel.item_number, artikel.name, artikel.unit`,
      [context.companyId, siteId]
    ),
    client.query(
      `SELECT reservierung.item_id,
              SUM(reservierung.quantity - reservierung.quantity_fulfilled) AS menge,
              artikel.item_number, artikel.name, artikel.unit
       FROM stock_reservations AS reservierung
       JOIN stock_items AS artikel
         ON artikel.company_id = reservierung.company_id AND artikel.id = reservierung.item_id
       WHERE reservierung.company_id = $1 AND reservierung.construction_site_id = $2
         AND reservierung.status = 'open'
       GROUP BY reservierung.item_id, artikel.item_number, artikel.name, artikel.unit`,
      [context.companyId, siteId]
    ),
    client.query(
      `SELECT position.item_id,
              SUM(position.quantity_ordered - position.quantity_received) AS menge,
              artikel.item_number, artikel.name, artikel.unit
       FROM purchase_order_items AS position
       JOIN purchase_orders AS bestellung
         ON bestellung.company_id = position.company_id
        AND bestellung.id = position.purchase_order_id
       JOIN stock_items AS artikel
         ON artikel.company_id = position.company_id AND artikel.id = position.item_id
       WHERE position.company_id = $1 AND bestellung.construction_site_id = $2
         AND bestellung.status IN ('ordered', 'partially_received')
         AND position.quantity_received < position.quantity_ordered
       GROUP BY position.item_id, artikel.item_number, artikel.name, artikel.unit`,
      [context.companyId, siteId]
    ),
    client.query(
      `${DELIVERY_NOTE_SELECT}
       WHERE schein.company_id = $1 AND schein.construction_site_id = $2
       ORDER BY schein.delivered_on DESC LIMIT 50`,
      [context.companyId, siteId]
    )
  ]);

  // Je Artikel eine Zeile, in die alle Zahlen einlaufen. Fuenf getrennte
  // Listen waeren fuer den Bauleiter unlesbar - er will je Ware wissen, wie
  // sie steht.
  const zeilen = new Map();
  const zeile = (row) => {
    if (!zeilen.has(row.item_id)) {
      zeilen.set(row.item_id, {
        itemId: row.item_id,
        itemNumber: row.item_number,
        itemName: row.name,
        unit: row.unit,
        onSite: 0,
        reservedForSite: 0,
        consumed: 0,
        returned: 0,
        deliveredToSite: 0,
        orderedOpen: 0
      });
    }
    return zeilen.get(row.item_id);
  };

  for (const row of bestand.rows) {
    const eintrag = zeile({ ...row, name: row.name });
    eintrag.onSite = number(row.physical_quantity);
  }
  for (const row of bewegungen.rows) {
    const eintrag = zeile(row);
    const menge = number(row.menge);
    if (row.movement_type === "consumed") eintrag.consumed += menge;
    if (row.movement_type === "return") eintrag.returned += menge;
    if (row.movement_type === "receipt") eintrag.deliveredToSite += menge;
  }
  for (const row of reservierungen.rows) zeile(row).reservedForSite = number(row.menge);
  for (const row of bestellt.rows) zeile(row).orderedOpen = number(row.menge);

  return {
    constructionSite: { id: baustelle.rows[0].id, name: baustelle.rows[0].name },
    items: [...zeilen.values()].sort((links, rechts) => links.itemName.localeCompare(rechts.itemName, "de")),
    deliveryNotes: scheine.rows.map(deliveryNoteDto)
  };
}

export async function handleStockRequest({ request, url, client, context, allowedOrigin }) {
  const path = url.pathname;
  if (!path.startsWith("/api/v1/stock")) return null;

  await requireModule(client, context);

  if (request.method === "GET" && path === "/api/v1/stock/contexts") {
    return { status: 200, body: { context: await contexts(client, context) } };
  }

  if (request.method === "GET" && path === "/api/v1/stock/items") {
    return { status: 200, body: { items: await listItems(client, context, url) } };
  }

  if (request.method === "POST" && path === "/api/v1/stock/items") {
    const body = await readJson(request);
    return { status: 201, body: await createItem(client, context, body) };
  }

  const itemMatch = /^\/api\/v1\/stock\/items\/([^/]+)$/.exec(path);
  if (request.method === "GET" && itemMatch) {
    const itemId = validateId(itemMatch[1], "Artikel-ID");
    return { status: 200, body: await itemDetail(client, context, itemId) };
  }
  if (request.method === "PATCH" && itemMatch) {
    const itemId = validateId(itemMatch[1], "Artikel-ID");
    const body = await readJson(request);
    return { status: 200, body: await updateItem(client, context, itemId, body) };
  }

  if (request.method === "POST" && path === "/api/v1/stock/locations") {
    const body = await readJson(request);
    return { status: 201, body: { location: await createLocation(client, context, body) } };
  }

  const barcodeMatch = /^\/api\/v1\/stock\/items\/([^/]+)\/barcodes(?:\/([^/]+)\/revoke)?$/.exec(path);
  if (request.method === "POST" && barcodeMatch) {
    const itemId = validateId(barcodeMatch[1], "Artikel-ID");
    const body = await readJson(request);

    if (barcodeMatch[2]) {
      const codeId = validateId(barcodeMatch[2], "Code-ID");
      return { status: 200, body: await revokeBarcode(client, context, itemId, codeId, body) };
    }
    return { status: 201, body: await addBarcode(client, context, itemId, body) };
  }

  if (request.method === "POST" && path === "/api/v1/stock/labels/sheet") {
    const body = await readJson(request, 100_000);
    return { status: 200, body: { labels: await labelSheet(client, context, body, allowedOrigin) } };
  }

  if (request.method === "POST" && path === "/api/v1/stock/labels") {
    const body = await readJson(request);
    return { status: 201, body: { label: await issueLabel(client, context, body) } };
  }

  if (request.method === "POST" && path === "/api/v1/stock/scan") {
    const body = await readJson(request);
    return { status: 200, body: { scan: await scan(client, context, body) } };
  }

  if (request.method === "POST" && path === "/api/v1/stock/movements") {
    const body = await readJson(request);
    return { status: 201, body: await bookMovement(client, context, body) };
  }

  const siteMaterialMatch = /^\/api\/v1\/stock\/sites\/([^/]+)$/.exec(path);
  if (request.method === "GET" && siteMaterialMatch) {
    const siteId = validateId(siteMaterialMatch[1], "Baustellen-ID");
    return { status: 200, body: await siteMaterialOverview(client, context, siteId) };
  }

  if (request.method === "GET" && path === "/api/v1/stock/reservations") {
    return { status: 200, body: { reservations: await listReservations(client, context, url) } };
  }

  if (request.method === "POST" && path === "/api/v1/stock/reservations") {
    const body = await readJson(request);
    return { status: 201, body: await createReservation(client, context, body) };
  }

  const reservationMatch = /^\/api\/v1\/stock\/reservations\/([^/]+)\/release$/.exec(path);
  if (request.method === "POST" && reservationMatch) {
    const reservationId = validateId(reservationMatch[1], "Reservierungs-ID");
    return {
      status: 200,
      body: await releaseReservation(client, context, reservationId, await readJson(request))
    };
  }

  if (request.method === "GET" && path === "/api/v1/stock/delivery-notes") {
    return { status: 200, body: { deliveryNotes: await listDeliveryNotes(client, context, url) } };
  }

  if (request.method === "POST" && path === "/api/v1/stock/delivery-notes") {
    const body = await readJson(request, 200_000);
    return { status: 201, body: await createDeliveryNote(client, context, body) };
  }

  const deliveryMatch = /^\/api\/v1\/stock\/delivery-notes\/([^/]+)(?:\/(book|cancel))?$/.exec(path);
  if (deliveryMatch) {
    const noteId = validateId(deliveryMatch[1], "Lieferschein-ID");
    if (request.method === "GET" && !deliveryMatch[2]) {
      return { status: 200, body: await deliveryNoteDetail(client, context, noteId) };
    }
    if (request.method === "POST" && deliveryMatch[2] === "book") {
      return { status: 200, body: await bookDeliveryNote(client, context, noteId, await readJson(request)) };
    }
    if (request.method === "POST" && deliveryMatch[2] === "cancel") {
      return { status: 200, body: await cancelDeliveryNote(client, context, noteId, await readJson(request)) };
    }
  }

  if (request.method === "GET" && path === "/api/v1/stock/levels") {
    return { status: 200, body: { levels: await listLevels(client, context, url) } };
  }

  if (request.method === "GET" && path === "/api/v1/stock/reorder") {
    return { status: 200, body: { suggestions: await reorderSuggestions(client, context) } };
  }

  if (request.method === "GET" && path === "/api/v1/stock/suppliers") {
    return { status: 200, body: { suppliers: await listSuppliers(client, context) } };
  }

  if (request.method === "POST" && path === "/api/v1/stock/suppliers") {
    const body = await readJson(request);
    return { status: 201, body: { supplier: await createSupplier(client, context, body) } };
  }

  if (request.method === "GET" && path === "/api/v1/stock/orders") {
    return { status: 200, body: { orders: await listOrders(client, context, url) } };
  }

  if (request.method === "POST" && path === "/api/v1/stock/orders") {
    const body = await readJson(request);
    return { status: 201, body: await createOrder(client, context, body) };
  }

  const orderMatch = /^\/api\/v1\/stock\/orders\/([^/]+)(?:\/(send|receive|cancel))?$/.exec(path);
  if (orderMatch) {
    const orderId = validateId(orderMatch[1], "Bestell-ID");
    const aktion = orderMatch[2];

    if (request.method === "GET" && !aktion) {
      return { status: 200, body: await orderDetail(client, context, orderId) };
    }
    if (request.method === "POST" && aktion === "send") {
      return { status: 200, body: await sendOrder(client, context, orderId) };
    }
    if (request.method === "POST" && aktion === "receive") {
      const body = await readJson(request);
      return { status: 200, body: await receiveOrder(client, context, orderId, body) };
    }
    if (request.method === "POST" && aktion === "cancel") {
      const body = await readJson(request);
      return { status: 200, body: await cancelOrder(client, context, orderId, body) };
    }
  }

  if (request.method === "GET" && path === "/api/v1/stock/inventory") {
    return { status: 200, body: { sessions: await listInventories(client, context) } };
  }

  if (request.method === "POST" && path === "/api/v1/stock/inventory") {
    const body = await readJson(request);
    return { status: 201, body: await startInventory(client, context, body) };
  }

  const inventoryMatch = /^\/api\/v1\/stock\/inventory\/([^/]+)(?:\/(count|complete|cancel))?$/.exec(path);
  if (inventoryMatch) {
    const sessionId = validateId(inventoryMatch[1], "Inventur-ID");
    const aktion = inventoryMatch[2];

    if (request.method === "GET" && !aktion) {
      return { status: 200, body: await inventoryDetail(client, context, sessionId) };
    }
    if (request.method === "POST" && aktion === "count") {
      const body = await readJson(request);
      return { status: 200, body: await recordCount(client, context, sessionId, body) };
    }
    if (request.method === "POST" && aktion === "complete") {
      const body = await readJson(request);
      return { status: 200, body: await completeInventory(client, context, sessionId, body) };
    }
    if (request.method === "POST" && aktion === "cancel") {
      const body = await readJson(request);
      return { status: 200, body: await cancelInventory(client, context, sessionId, body) };
    }
  }

  return { status: 404, body: { error: "Diesen Lagerendpunkt gibt es nicht." } };
}
