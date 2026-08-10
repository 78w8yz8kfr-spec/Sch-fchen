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

import { InputError, readJson, validateId } from "../../api/src/validation.mjs";
import { loadCompanyModules } from "../../api/src/company-modules.mjs";

export const STOCK_MODULE_KEY = "materials";

const MANAGER_ROLES = new Set([
  "admin", "managing_director", "dispatch_office", "office", "planner",
  "executive_assistant"
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
  ["transfer", "vorarbeiter"],
  ["opening", "verwaltung"],
  ["receipt", "verwaltung"],
  ["correction", "verwaltung"],
  ["scrap", "verwaltung"]
]);

const SOURCE_TYPES = new Set(["api", "qr_scan", "offline_sync", "import"]);
const LOCATION_TYPES = new Set(["warehouse", "workshop", "construction_site", "other"]);
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
  const [groups, locations, settings, allowed] = await Promise.all([
    loadGroups(client, context),
    loadLocations(client, context),
    loadSettings(client, context),
    permissions(client, context)
  ]);
  return { groups, locations, settings, permissions: allowed };
}

const ITEM_COLUMNS = `
  item.id, item.item_number, item.name, item.unit, item.group_id,
  item.manufacturer, item.manufacturer_number, item.minimum_stock,
  item.target_stock, item.note, item.status, item.row_version,
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
       WHERE company_id = $1 AND item_id = $2
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

async function createItem(client, context, body) {
  await requireManager(client, context);

  const itemNumber = requiredText(body.itemNumber, "Artikelnummer", 40);
  const name = requiredText(body.name, "Bezeichnung", 180);
  const unit = requiredText(body.unit, "Einheit", 20);
  const groupId = await resolveGroup(client, context, body);
  const barcodes = readBarcodes(body);

  if (barcodes.filter((entry) => entry.isPrimary).length > 1) {
    throw new InputError("Nur ein Code darf der Hauptcode sein.");
  }

  const inserted = await client.query(
    `INSERT INTO stock_items (
       company_id, item_number, name, group_id, unit, manufacturer,
       manufacturer_number, default_supplier_id, default_location_id,
       minimum_stock, target_stock, note, created_by_user_id, changed_by_user_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
               COALESCE($10::NUMERIC, 0), $11::NUMERIC, $12, $13, $13)
     RETURNING id`,
    [
      context.companyId, itemNumber, name, groupId, unit,
      optionalText(body.manufacturer, "Hersteller", 120),
      optionalText(body.manufacturerNumber, "Herstellernummer", 80),
      optionalId(body.defaultSupplierId, "Lieferant"),
      optionalId(body.defaultLocationId, "Standardlagerplatz"),
      optionalQuantity(body.minimumStock, "Mindestbestand"),
      optionalQuantity(body.targetStock, "Zielbestand"),
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

async function createLocation(client, context, body) {
  await requireManager(client, context);

  const name = requiredText(body.name, "Bezeichnung", 140);
  const locationType = requiredText(body.locationType, "Art", 30);
  if (!LOCATION_TYPES.has(locationType)) {
    throw new InputError("Diese Lagerplatzart gibt es nicht.");
  }

  const inserted = await client.query(
    `INSERT INTO storage_locations (
       company_id, name, location_type, parent_location_id, construction_site_id, note
     ) VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      context.companyId, name, locationType,
      optionalId(body.parentLocationId, "Übergeordneter Lagerplatz"),
      optionalId(body.constructionSiteId, "Baustelle"),
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
     WHERE company_id = $1 AND code_normalized = $2`,
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
  const needsSource = ["issue", "scrap"].includes(movementType);
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
    `SELECT bestand.item_id, bestand.location_id, bestand.quantity,
            item.item_number, item.name AS item_name, item.unit,
            ort.name AS location_name
     FROM stock_levels AS bestand
     JOIN stock_items AS item
       ON item.company_id = bestand.company_id AND item.id = bestand.item_id
     JOIN storage_locations AS ort
       ON ort.company_id = bestand.company_id AND ort.id = bestand.location_id
     WHERE bestand.company_id = $1
       AND ($2::UUID IS NULL OR bestand.location_id = $2::UUID)
       AND bestand.quantity <> 0
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
    quantity: number(row.quantity)
  }));
}

/**
 * Der Nachbestellvorschlag ist eine Rechnung und kein gespeicherter Zustand.
 * Ein Artikel, dessen Gesamtbestand unter den Mindestbestand faellt, steht
 * darin; die vorgeschlagene Menge fuellt bis zum Zielbestand auf.
 */
async function reorderSuggestions(client, context) {
  const result = await client.query(
    `SELECT ${ITEM_COLUMNS},
            GREATEST(COALESCE(item.target_stock, item.minimum_stock)
                     - COALESCE(bestand.summe, 0), 0) AS suggested_quantity,
            lieferant.name AS supplier_name, lieferant.id AS supplier_id
     ${ITEM_FROM}
     LEFT JOIN suppliers AS lieferant
       ON lieferant.company_id = item.company_id AND lieferant.id = item.default_supplier_id
     WHERE item.company_id = $1 AND item.status = 'active'
       AND item.minimum_stock > 0
       AND COALESCE(bestand.summe, 0) < item.minimum_stock
     ORDER BY (COALESCE(bestand.summe, 0) / NULLIF(item.minimum_stock, 0)), item.name
     LIMIT 200`,
    [context.companyId]
  );

  return result.rows.map((row) => ({
    ...itemDto(row),
    suggestedQuantity: number(row.suggested_quantity),
    supplierId: row.supplier_id || null,
    supplierName: row.supplier_name || null
  }));
}

export async function handleStockRequest({ request, url, client, context }) {
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

  if (request.method === "POST" && path === "/api/v1/stock/locations") {
    const body = await readJson(request);
    return { status: 201, body: { location: await createLocation(client, context, body) } };
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

  if (request.method === "GET" && path === "/api/v1/stock/levels") {
    return { status: 200, body: { levels: await listLevels(client, context, url) } };
  }

  if (request.method === "GET" && path === "/api/v1/stock/reorder") {
    return { status: 200, body: { suggestions: await reorderSuggestions(client, context) } };
  }

  return { status: 404, body: { error: "Diesen Lagerendpunkt gibt es nicht." } };
}
