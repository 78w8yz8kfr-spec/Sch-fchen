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

  const labels = [];
  for (const ziel of ziele) {
    const targetType = ziel?.targetType === "location" ? "location" : "item";
    const id = validateId(ziel?.id, targetType === "item" ? "Artikel" : "Lagerplatz");

    const etikett = await issueLabel(client, context, {
      targetType,
      itemId: targetType === "item" ? id : undefined,
      locationId: targetType === "location" ? id : undefined
    });

    const beschriftung = targetType === "item"
      ? await client.query(
        "SELECT name, item_number AS nummer FROM stock_items WHERE company_id = $1 AND id = $2",
        [context.companyId, id]
      )
      : await client.query(
        "SELECT name, '' AS nummer FROM storage_locations WHERE company_id = $1 AND id = $2",
        [context.companyId, id]
      );
    if (beschriftung.rowCount !== 1) {
      throw new InputError("Dieses Etikettenziel wurde nicht gefunden.", 404, "stock_label_target_unknown");
    }

    const adresse = new URL("/", allowedOrigin || "https://example.invalid/");
    adresse.searchParams.set("lager", etikett.token);

    labels.push({
      targetType,
      id,
      label: beschriftung.rows[0].name,
      sublabel: beschriftung.rows[0].nummer || "",
      target: adresse.toString(),
      generation: etikett.generation,
      svg: await qrToString(adresse.toString(), {
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
