import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import { createPool } from "../src/database.mjs";
import { handleInventoryRequest, validateLocation } from "../src/inventory.mjs";

test("Lagerstruktur validiert Eingaben und lehnt serverseitige Felder ab", () => {
  assert.deepEqual(validateLocation({ code: " l1 ", name: " Lager ", kind: "depot" }),
    { code: "L1", name: "Lager", kind: "depot", parentId: null });
  for (const body of [null, [], {}, { companyId: randomUUID() }, { code: "!", name: "X" },
    { code: "A", name: "x".repeat(121), kind: "depot" }, { code: "A", name: "X", kind: "wrong" },
    { code: "A", name: "X", kind: "bin" }, { code: "A", name: "X", kind: "depot", parentId: randomUUID() }]) {
    assert.throws(() => validateLocation(body));
  }
  for (const body of [{ code: "A", name: "X", status: "deleted", rowVersion: 1 },
    { code: "A", name: "X", status: "active", rowVersion: 0 }]) assert.throws(() => validateLocation(body, true));
  assert.equal(validateLocation({ code: "A", name: "X", status: "active", rowVersion: 2 }, true).rowVersion, 2);
});

function req(method, body) {
  const request = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  request.method = method; request.headers = { "content-type": "application/json" }; return request;
}
test("Unbekannte Lagerpfade werden nicht übernommen", async () => {
  assert.equal(await handleInventoryRequest({ request: req("GET"), url: new URL("http://local/api/v1/inventory/unknown") }), null);
});

const integration = process.env.API_INTEGRATION_TEST === "true" ? test : test.skip;
integration("Lagerstruktur: CRUD, Hierarchie, Rollen, Mandanten und unveränderlicher Verlauf", async () => {
  const pool = createPool({ host: process.env.POSTGRES_HOST, port: Number(process.env.POSTGRES_PORT || 5432),
    database: process.env.POSTGRES_DB, user: process.env.POSTGRES_USER, password: process.env.POSTGRES_PASSWORD });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const company = async () => (await client.query(
      "INSERT INTO companies(company_number,legal_name,display_name) VALUES ('F-' || nextval('companies_number_seq'),'Inventartest','Inventartest') RETURNING id"
    )).rows[0].id;
    const companyId = await company(), foreignCompany = await company();
    const user = async (id) => (await client.query("INSERT INTO users(company_id,personnel_number,first_name,last_name) VALUES($1,$2,'Test','Inventar') RETURNING id", [id, randomUUID().slice(0, 12)])).rows[0].id;
    const userId = await user(companyId), readerId = await user(companyId), foreignUser = await user(foreignCompany);
    await client.query("INSERT INTO user_roles(company_id,user_id,role_id) SELECT $1,$2,id FROM roles WHERE company_id=$1 AND role_key='admin'", [companyId, userId]);
    for (const id of [companyId, foreignCompany]) await client.query(
      "INSERT INTO company_module_entitlements(company_id,module_id,entitlement_status,change_reason) SELECT $1,id,'permanent','Test' FROM module_catalog WHERE module_key='inventory_structure'", [id]);
    await client.query("SELECT set_config('app.current_company_id',$1,true),set_config('app.current_user_id',$2,true)", [foreignCompany, foreignUser]);
    const foreignId = (await client.query("INSERT INTO inventory_locations(company_id,kind,code,name,created_by_user_id) VALUES($1,'depot','F','Fremd',$2) RETURNING id", [foreignCompany, foreignUser])).rows[0].id;
    await client.query("SET LOCAL ROLE schaefchen_api");
    const context = { companyId, userId };
    const call = async (method, suffix = "", body, actor = userId) => {
      await client.query("SELECT set_config('app.current_company_id',$1,true),set_config('app.current_user_id',$2,true)", [companyId, actor]);
      return handleInventoryRequest({ request: req(method, body), url: new URL(`http://local/api/v1/inventory/locations${suffix}`), client, context: { ...context, userId: actor } });
    };
    const fails = async (operation, code) => {
      await client.query("SAVEPOINT expected_error");
      await assert.rejects(operation, (error) => error.code === code);
      await client.query("ROLLBACK TO SAVEPOINT expected_error");
    };
    let parentId = null, depot;
    const rows = [];
    for (const kind of ["depot", "area", "rack", "bin"]) {
      const result = await call("POST", "", { code: kind.toUpperCase(), name: kind, kind, parentId });
      assert.equal(result.status, 201); rows.push(result.body.location); parentId = result.body.location.id;
      if (kind === "depot") depot = result.body.location;
    }
    const list = await call("GET"); assert.equal(list.body.locations.length, 4); assert.equal(list.body.canManage, true);
    assert.equal((await call("GET", "", undefined, readerId)).body.canManage, false);
    await fails(() => call("POST", "", { code: "X", name: "X", kind: "depot" }, readerId), "forbidden");
    await fails(() => call("POST", "", { code: "DEPOT", name: "X", kind: "depot" }), "duplicate_code");
    await fails(() => call("POST", "", { code: "X", name: "X", kind: "area", parentId: foreignId }), "invalid_hierarchy");
    await fails(() => call("POST", "", { code: "X", name: "X", kind: "rack", parentId: depot.id }), "invalid_hierarchy");
    const patch = (row, status = "active", rowVersion = row.rowVersion) => ({ code: row.code, name: row.name, status, rowVersion });
    await fails(() => call("PATCH", `/${depot.id}`, patch(depot, "archived")), "invalid_hierarchy");
    await fails(() => call("PATCH", `/${depot.id}`, patch(depot, "active", 999)), "conflict");
    await fails(() => call("PATCH", `/${foreignId}`, patch(depot)), "conflict");
    assert.equal((await call("GET", `/${foreignId}/history`)).body.events.length, 0);
    for (const row of [...rows].reverse()) assert.equal((await call("PATCH", `/${row.id}`, patch(row, "archived"))).body.location.status, "archived");
    await fails(() => call("PATCH", `/${rows[3].id}`, patch(rows[3], "active", 2)), "invalid_hierarchy");
    const restored = await call("PATCH", `/${depot.id}`, patch(depot, "active", 2));
    assert.equal(restored.body.location.rowVersion, 3);
    const events = (await call("GET", `/${depot.id}/history`)).body.events;
    assert.equal(events.length, 3);
    assert.equal(await call("DELETE", `/${depot.id}`), null);
    await fails(() => client.query("UPDATE inventory_location_events SET after_data='{}'"), "42501");
    await fails(() => client.query("DELETE FROM inventory_locations WHERE id=$1", [depot.id]), "42501");
    await client.query("RESET ROLE");
    await client.query("UPDATE company_module_entitlements SET entitlement_status='inactive',change_reason='Test beendet' WHERE company_id=$1 AND module_id=(SELECT id FROM module_catalog WHERE module_key='inventory_structure')", [companyId]);
    await client.query("SET LOCAL ROLE schaefchen_api");
    await fails(() => call("GET"), "module_disabled");
  } finally { await client.query("ROLLBACK"); client.release(); await pool.end(); }
});
