import { loadCompanyModules } from "./company-modules.mjs";
import { InputError, readJson, validateId } from "./validation.mjs";

const MANAGERS = ["admin", "managing_director", "dispatch_office", "office", "planner", "executive_assistant"];
const BASE = "/api/v1/inventory/locations";

export function validateLocation(body, editing = false) {
  const allowed = editing ? ["code", "name", "status", "rowVersion"] : ["code", "name", "kind", "parentId"];
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => !allowed.includes(key))) {
    throw new InputError("Ungültige Lagerplatzfelder; Firmenzuordnung und Herkunft bestimmt der Server.");
  }
  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!/^[A-Z0-9][A-Z0-9_-]{0,29}$/.test(code) || !name || name.length > 120) {
    throw new InputError("Bitte einen Code (A–Z, 0–9, - oder _) und einen Namen mit höchstens 120 Zeichen eingeben.");
  }
  if (editing) {
    if (!["active", "archived"].includes(body.status) || !Number.isSafeInteger(body.rowVersion) || body.rowVersion < 1) {
      throw new InputError("Status oder Zeilenversion ist ungültig.");
    }
    return { code, name, status: body.status, rowVersion: body.rowVersion };
  }
  if (!["depot", "area", "rack", "bin"].includes(body.kind)) throw new InputError("Ungültige Lagerebene.");
  const parentId = body.parentId ? validateId(body.parentId, "Übergeordneter Lagerplatz") : null;
  if ((body.kind === "depot") !== (parentId === null)) throw new InputError("Bitte die passende übergeordnete Ebene wählen.");
  return { code, name, kind: body.kind, parentId };
}

function dto(row) {
  return { id: row.id, parentId: row.parent_id, kind: row.kind, code: row.code, name: row.name,
    status: row.status, rowVersion: Number(row.row_version) };
}

export async function handleInventoryRequest({ request, url, client, context }) {
  const match = /^\/api\/v1\/inventory\/locations\/([^/]+)(\/history)?$/.exec(url.pathname);
  if (url.pathname !== BASE && !match) return null;
  if (!(await loadCompanyModules(client, context)).some((module) => module.key === "inventory_structure" && module.enabled)) {
    throw new InputError("Die Lagerstruktur ist für diese Firma nicht freigeschaltet.", 403, "module_disabled");
  }
  const roles = await client.query(
    `SELECT r.role_key FROM user_roles u JOIN roles r ON r.company_id=u.company_id AND r.id=u.role_id
     WHERE u.company_id=$1 AND u.user_id=$2 AND u.revoked_at IS NULL AND r.status='active'`,
    [context.companyId, context.userId]
  );
  const canManage = roles.rows.some((row) => MANAGERS.includes(row.role_key));
  if (request.method === "GET" && url.pathname === BASE) {
    const result = await client.query("SELECT * FROM inventory_locations WHERE company_id=$1 ORDER BY code, id", [context.companyId]);
    return { status: 200, body: { locations: result.rows.map(dto), canManage } };
  }
  if (request.method === "GET" && match?.[2]) {
    const result = await client.query(
      `SELECT happened_at, before_data, after_data FROM inventory_location_events
       WHERE company_id=$1 AND location_id=$2 ORDER BY happened_at DESC, id DESC LIMIT 100`,
      [context.companyId, validateId(match[1], "Lagerplatz")]
    );
    return { status: 200, body: { events: result.rows } };
  }
  if (!["POST", "PATCH"].includes(request.method) || (request.method === "POST") !== !match || match?.[2]) return null;
  if (!canManage) throw new InputError("Nur die Firmenverwaltung darf Lagerplätze ändern.", 403, "forbidden");
  const input = validateLocation(await readJson(request), request.method === "PATCH");
  // Ein Lock je Firma hält Prüfen und Schreiben auch bei gleichzeitigen Anfragen zusammen.
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended('inventory:' || $1::text, 0))", [context.companyId]);
  try {
    const result = request.method === "POST"
      ? await client.query(
        `INSERT INTO inventory_locations(company_id,parent_id,kind,code,name,created_by_user_id)
         VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
        [context.companyId, input.parentId, input.kind, input.code, input.name, context.userId])
      : await client.query(
        `UPDATE inventory_locations SET code=$3,name=$4,status=$5
         WHERE company_id=$1 AND id=$2 AND row_version=$6 RETURNING *`,
        [context.companyId, validateId(match[1], "Lagerplatz"), input.code, input.name, input.status, input.rowVersion]);
    if (!result.rowCount) throw new InputError("Lagerplatz wurde geändert oder nicht gefunden. Bitte neu laden.", 409, "conflict");
    return { status: request.method === "POST" ? 201 : 200, body: { location: dto(result.rows[0]) } };
  } catch (error) {
    if (error.code === "23505") throw new InputError("Diesen Code gibt es auf dieser Ebene bereits.", 409, "duplicate_code");
    if (["23503", "23514"].includes(error.code)) throw new InputError("Ungültige Lagerzuordnung. Elternplätze müssen aktiv sein; vor dem Archivieren zuerst Unterplätze archivieren.", 409, "invalid_hierarchy");
    throw error;
  }
}
