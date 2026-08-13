import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";

import { createPool, withTenantTransaction } from "../src/database.mjs";
import {
  FI_FRIST_TAGE,
  PRUEFFRIST_TAGE,
  ampel,
  handlePowerRequest,
  naechsterTermin,
  tageBis
} from "../src/power.mjs";

// Die reine Rechnerei braucht keine Datenbank und laeuft deshalb immer.

test("die Ampel unterscheidet „nie geprüft“ von „überfällig“", () => {
  // Drei Zustände wären zu wenig. Ein Verteiler, der noch nie geprüft wurde,
  // ist kein vergessener Termin, sondern ein fehlender Anfang — und die
  // Abhilfe ist eine andere.
  assert.deepEqual(ampel(null, "2026-08-12"), { lage: "nie", tage: null });
  assert.equal(ampel("2026-08-01", "2026-08-12").lage, "ueberfaellig");
  assert.equal(ampel("2026-08-20", "2026-08-12").lage, "bald");
  assert.equal(ampel("2026-10-01", "2026-08-12").lage, "gut");
});

test("die beiden Fristen sind verschieden lang", () => {
  // Vierteljährlich die Fachkraft, monatlich der Tastendruck. Wären es
  // dieselben Tage, hätte das Trennen der beiden keinen Zweck.
  assert.equal(PRUEFFRIST_TAGE, 90);
  assert.equal(FI_FRIST_TAGE, 30);
  assert.equal(naechsterTermin("2026-08-12", FI_FRIST_TAGE), "2026-09-11");
  assert.equal(naechsterTermin("2026-08-12", PRUEFFRIST_TAGE), "2026-11-10");
  assert.equal(naechsterTermin(null, FI_FRIST_TAGE), null);
});

test("Tage werden über Monatsgrenzen richtig gezählt", () => {
  assert.equal(tageBis("2026-08-12", "2026-09-11"), 30);
  assert.equal(tageBis("2026-02-27", "2026-03-02"), 3);
  assert.equal(tageBis("2026-08-12", "2026-08-01"), -11);
});

// ---------------------------------------------------------------------------
// Der Rest braucht eine Datenbank.
// ---------------------------------------------------------------------------

const enabled = process.env.API_INTEGRATION_TEST === "true";
const integrationTest = enabled ? test : test.skip;

const datenbank = {
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT || 5432),
  database: process.env.POSTGRES_DB,
  user: process.env.API_DB_USER,
  password: process.env.API_DB_PASSWORD,
  max: 4
};

function anfrage(method, body) {
  const request = body === undefined
    ? Readable.from([])
    : Readable.from([Buffer.from(JSON.stringify(body), "utf8")]);
  request.method = method;
  request.headers = body === undefined ? {} : { "content-type": "application/json" };
  return request;
}

function aufrufen(pool, context, method, pfad, body, today) {
  return withTenantTransaction(pool, context, (client) => handlePowerRequest({
    request: anfrage(method, body),
    url: new URL(`http://intern${pfad}`),
    client,
    context,
    today
  }));
}

async function erwarteFehler(pool, context, method, pfad, body, code, today) {
  await assert.rejects(
    () => aufrufen(pool, context, method, pfad, body, today),
    (fehler) => {
      assert.equal(fehler.code, code, `Erwartet ${code}, bekommen ${fehler.code}: ${fehler.message}`);
      return true;
    }
  );
}

integrationTest("Baustromverteiler: Fristen, FI-Test und Zählerstände", async (t) => {
  const apiPool = createPool(datenbank);
  const ownerPool = createPool({
    ...datenbank,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD
  });
  t.after(async () => {
    await apiPool.end();
    await ownerPool.end();
  });

  const kennung = String(Date.now()).slice(-5);
  const firma = (await ownerPool.query(
    `INSERT INTO companies (company_number, legal_name, display_name)
     VALUES ($1, $2, $3) RETURNING id`,
    [`F-5${kennung}`, `Baustrom ${kennung} GmbH`, `Baustrom ${kennung}`]
  )).rows[0].id;

  const nutzer = (await ownerPool.query(
    `INSERT INTO users (company_id, personnel_number, first_name, last_name)
     VALUES ($1, $2, 'Mika', 'Monteur') RETURNING id`,
    [firma, `BS-${kennung}`]
  )).rows[0].id;
  await ownerPool.query(
    `INSERT INTO user_roles (company_id, user_id, role_id)
     SELECT $1, $2, id FROM roles WHERE company_id = $1 AND role_key = 'installer'`,
    [firma, nutzer]
  );
  const context = { companyId: firma, userId: nutzer };

  const kategorie = (await ownerPool.query(
    "SELECT id FROM device_categories WHERE company_id = $1 AND category_key = 'power_distributors'",
    [firma]
  )).rows[0];
  assert.ok(kategorie, "Jede Firma bekommt die Kategorie Baustromverteiler");

  const heute = "2026-08-12";
  const verteiler = (await ownerPool.query(
    `INSERT INTO devices (
       company_id, inventory_number, name, category_id, inspection_required,
       last_inspection_on, next_inspection_on, created_by_user_id
     ) VALUES ($1, 'BV-001', 'Baustromverteiler 63A', $2, TRUE, '2026-05-01', '2026-07-30', $3)
     RETURNING id`,
    [firma, kategorie.id, nutzer]
  )).rows[0].id;

  // Ein zweites Gerät, das keiner ist: es darf in dieser Liste nicht auftauchen.
  const andereKategorie = (await ownerPool.query(
    "SELECT id FROM device_categories WHERE company_id = $1 AND category_key = 'power_tools'",
    [firma]
  )).rows[0].id;
  const bohrmaschine = (await ownerPool.query(
    `INSERT INTO devices (company_id, inventory_number, name, category_id, created_by_user_id)
     VALUES ($1, 'EW-001', 'Bohrhammer', $2, $3) RETURNING id`,
    [firma, andereKategorie, nutzer]
  )).rows[0].id;

  await t.test("die Liste zeigt nur Verteiler und rechnet beide Fristen", async () => {
    const { body } = await aufrufen(apiPool, context, "GET", "/api/v1/power/distributors", undefined, heute);
    assert.equal(body.distributors.length, 1, "Der Bohrhammer gehört nicht in diese Liste");

    const [eintrag] = body.distributors;
    assert.equal(eintrag.inventoryNumber, "BV-001");
    // Fällig war der 30.07., heute ist der 12.08.
    assert.equal(eintrag.inspection.lage, "ueberfaellig");
    assert.equal(eintrag.inspection.tage, -13);
    // Noch nie eine Taste gedrückt: das ist etwas anderes als überfällig.
    assert.equal(eintrag.rcdTest.lage, "nie");
    assert.equal(eintrag.rcdTest.lastOn, null);
    assert.equal(eintrag.meter, null);
  });

  await t.test("der FI-Test verschiebt die Prüffrist nicht", async () => {
    // Der eigentliche Grund für die zwei getrennten Aufzeichnungen: ein
    // Tastendruck darf den Termin nicht verschieben, an dem die Fachkraft
    // anrücken muss.
    const vorher = (await aufrufen(apiPool, context, "GET", "/api/v1/power/distributors", undefined, heute))
      .body.distributors[0];

    const { status, body } = await aufrufen(
      apiPool, context, "POST", `/api/v1/power/distributors/${verteiler}/rcd-test`,
      { result: "passed", testedOn: heute }, heute
    );
    assert.equal(status, 201);
    assert.equal(body.dueOn, "2026-09-11", "Der nächste Tastendruck ist in dreißig Tagen fällig");

    const nachher = (await aufrufen(apiPool, context, "GET", "/api/v1/power/distributors", undefined, heute))
      .body.distributors[0];
    assert.equal(nachher.rcdTest.lage, "gut");
    assert.deepEqual(
      { lage: nachher.inspection.lage, faellig: nachher.inspection.dueOn },
      { lage: vorher.inspection.lage, faellig: vorher.inspection.dueOn },
      "Die Prüffrist nach DGUV V3 bleibt unangetastet"
    );
  });

  await t.test("ein Ergebnis muss angegeben werden", async () => {
    // „Bestanden“ vorzubelegen wäre ein Klick, der immer dasselbe sagt — und
    // ein durchgefallener RCD ist der eigentliche Grund für diesen Vorgang.
    await assert.rejects(
      () => aufrufen(apiPool, context, "POST", `/api/v1/power/distributors/${verteiler}/rcd-test`, {}, heute),
      /bestanden/
    );
  });

  await t.test("Zählerstände laufen vorwärts", async () => {
    const ersteAblesung = await aufrufen(
      apiPool, context, "POST", `/api/v1/power/distributors/${verteiler}/readings`,
      { readingKwh: 1200.5, reason: "installation", readOn: "2026-06-01" }, heute
    );
    assert.equal(ersteAblesung.status, 201);
    assert.equal(ersteAblesung.body.consumedKwh, null, "Ohne Vorgänger gibt es keinen Verbrauch");

    const zweite = await aufrufen(
      apiPool, context, "POST", `/api/v1/power/distributors/${verteiler}/readings`,
      { readingKwh: 1850, reason: "interim", readOn: "2026-08-01" }, heute
    );
    assert.equal(zweite.body.consumedKwh, 649.5, "Der Verbrauch steht gleich dabei");

    // Ein Stand unter dem vorigen ist ein Tippfehler oder ein Zählerwechsel.
    // Beides gehört geprüft und nicht stillschweigend gebucht — eine negative
    // Menge auf einer Rechnung fällt sonst erst dem Kunden auf.
    await erwarteFehler(
      apiPool, context, "POST", `/api/v1/power/distributors/${verteiler}/readings`,
      { readingKwh: 900, reason: "interim" }, "power_meter_reading_backwards", heute
    );
  });

  await t.test("ein Bohrhammer ist kein Baustromverteiler", async () => {
    // Die Mandantengrenze fängt Fremdes ab, aber ein Zählerstand an einem
    // Bohrhammer wäre kein Sicherheits-, sondern ein Sinnfehler — und der
    // fällt später niemandem mehr auf.
    await erwarteFehler(
      apiPool, context, "POST", `/api/v1/power/distributors/${bohrmaschine}/readings`,
      { readingKwh: 5 }, "power_distributor_unknown", heute
    );
  });

  await t.test("der Verteiler einer fremden Firma bleibt unsichtbar", async () => {
    const fremdeFirma = (await ownerPool.query(
      `INSERT INTO companies (company_number, legal_name, display_name)
       VALUES ($1, $2, $3) RETURNING id`,
      [`F-4${kennung}`, `Fremd ${kennung} GmbH`, `Fremd ${kennung}`]
    )).rows[0].id;
    const fremderNutzer = (await ownerPool.query(
      `INSERT INTO users (company_id, personnel_number, first_name, last_name)
       VALUES ($1, $2, 'Fremd', 'Fremd') RETURNING id`,
      [fremdeFirma, `FR-${kennung}`]
    )).rows[0].id;
    await ownerPool.query(
      `INSERT INTO user_roles (company_id, user_id, role_id)
       SELECT $1, $2, id FROM roles WHERE company_id = $1 AND role_key = 'installer'`,
      [fremdeFirma, fremderNutzer]
    );
    const fremd = { companyId: fremdeFirma, userId: fremderNutzer };

    const { body } = await aufrufen(apiPool, fremd, "GET", "/api/v1/power/distributors", undefined, heute);
    assert.equal(body.distributors.length, 0);
    await erwarteFehler(
      apiPool, fremd, "GET", `/api/v1/power/distributors/${verteiler}`,
      undefined, "power_distributor_unknown", heute
    );
  });

  await t.test("die Akte zeigt beide Aufzeichnungen, neueste zuerst", async () => {
    const { body } = await aufrufen(
      apiPool, context, "GET", `/api/v1/power/distributors/${verteiler}`, undefined, heute
    );
    assert.equal(body.distributor.inventoryNumber, "BV-001");
    assert.equal(body.rcdTests.length, 1);
    assert.equal(body.rcdTests[0].testedBy, "Mika Monteur");
    assert.equal(body.readings.length, 2);
    assert.equal(body.readings[0].readOn, "2026-08-01", "Die jüngste Ablesung steht oben");
    assert.equal(body.readings[0].readingKwh, 1850);
  });

  await t.test("die Ablesung bleibt bei der Baustelle, auf der sie entstand", async () => {
    // Der Grund für die eigene Spalte an der Aufzeichnung: ein Verteiler
    // wandert im Lauf eines Jahres über mehrere Baustellen, und die Rechnung
    // von Baustelle eins darf sich nicht ändern, weil er inzwischen woanders
    // steht. Beim ersten Durchgang blieb die Spalte leer — die Ablesung stand
    // dann ohne Baustelle in der Akte.
    const kunde = (await ownerPool.query(
      `INSERT INTO customers (company_id, customer_type, company_name, status)
       VALUES ($1, 'company', 'Stadtwerke', 'active') RETURNING id`,
      [firma]
    )).rows[0].id;
    const projekt = (await ownerPool.query(
      `INSERT INTO projects (company_id, customer_id, name, status)
       VALUES ($1, $2, 'Sanierung', 'active') RETURNING id`,
      [firma, kunde]
    )).rows[0].id;
    const baustelle = async (name) => (await ownerPool.query(
      `INSERT INTO construction_sites (company_id, project_id, name, status)
       VALUES ($1, $2, $3, 'active') RETURNING id`,
      [firma, projekt, name]
    )).rows[0].id;
    const erste = await baustelle("Neubau Ost");
    const zweite = await baustelle("Neubau West");

    const wanderer = (await ownerPool.query(
      `INSERT INTO devices (
         company_id, inventory_number, name, category_id,
         assigned_construction_site_id, created_by_user_id
       ) VALUES ($1, 'BV-002', 'Baustromverteiler 32A', $2, $3, $4) RETURNING id`,
      [firma, kategorie.id, erste, nutzer]
    )).rows[0].id;

    await aufrufen(
      apiPool, context, "POST", `/api/v1/power/distributors/${wanderer}/readings`,
      { readingKwh: 40, reason: "installation", readOn: "2026-06-01" }, heute
    );

    // Der Verteiler zieht um.
    await ownerPool.query(
      "UPDATE devices SET assigned_construction_site_id = $1 WHERE company_id = $2 AND id = $3",
      [zweite, firma, wanderer]
    );
    await aufrufen(
      apiPool, context, "POST", `/api/v1/power/distributors/${wanderer}/readings`,
      { readingKwh: 310, reason: "interim", readOn: "2026-08-01" }, heute
    );

    const { body } = await aufrufen(
      apiPool, context, "GET", `/api/v1/power/distributors/${wanderer}`, undefined, heute
    );
    assert.deepEqual(
      body.readings.map((zeile) => zeile.constructionSiteName),
      ["Neubau West", "Neubau Ost"],
      "Jede Ablesung behält die Baustelle, auf der abgelesen wurde"
    );
  });
});
