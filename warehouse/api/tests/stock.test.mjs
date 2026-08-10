import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";

import { createPool, withTenantTransaction } from "../../../api/src/database.mjs";
import { handleStockRequest } from "../stock.mjs";

// Der Test spricht den Endpunktbaum direkt an und nicht ueber HTTP: die
// Verdrahtung in `app.mjs` ist der Einpflegeschritt und existiert noch nicht.
// Sitzungsaufloesung, Mandantengrenze und Rollen laufen trotzdem echt, weil
// `withTenantTransaction` dieselbe Datenbankrolle und dieselben
// Sitzungsvariablen setzt wie die laufende API.

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
  // Buffer und nicht Zeichenkette: `readJson` setzt die Teile mit
  // `Buffer.concat` zusammen, genau wie bei einer echten HTTP-Anfrage.
  const request = body === undefined
    ? Readable.from([])
    : Readable.from([Buffer.from(JSON.stringify(body), "utf8")]);
  request.method = method;
  request.headers = body === undefined ? {} : { "content-type": "application/json" };
  return request;
}

function aufrufen(pool, context, method, pfad, body) {
  const url = new URL(`http://intern${pfad}`);
  return withTenantTransaction(pool, context, (client) => handleStockRequest({
    request: anfrage(method, body),
    url,
    client,
    context
  }));
}

async function erwarteFehler(pool, context, method, pfad, body, code) {
  await assert.rejects(
    () => aufrufen(pool, context, method, pfad, body),
    (fehler) => {
      assert.equal(fehler.code, code, `Erwartet ${code}, bekommen ${fehler.code}: ${fehler.message}`);
      return true;
    }
  );
}

/**
 * Schaltet die Lagerverwaltung fuer eine Firma frei — genau das, was die
 * Plattformverwaltung tut. Seit Migration 202 bekommt sie keine Firma mehr
 * von selbst.
 */
async function lagerFreischalten(ownerPool, companyId) {
  await ownerPool.query(
    `INSERT INTO company_module_entitlements (
       company_id, module_id, entitlement_status, included_in_plan, change_reason
     )
     SELECT $1, katalog.id, 'permanent', TRUE, 'Abnahmetest'
     FROM module_catalog AS katalog WHERE katalog.module_key = 'materials'
     ON CONFLICT (company_id, module_id) DO UPDATE
     SET entitlement_status = 'permanent', included_in_plan = TRUE,
         change_reason = 'Abnahmetest'`,
    [companyId]
  );
}

/** Eine eigene Firma je Lauf: der Test darf nicht an Altdaten haengen. */
async function firmaAnlegen(ownerPool, kennung, mitLager = true) {
  const firma = await ownerPool.query(
    `INSERT INTO companies (company_number, legal_name, display_name)
     VALUES ($1, $2, $3) RETURNING id`,
    [`F-9${kennung}`, `Lagerabnahme ${kennung} GmbH`, `Lagerabnahme ${kennung}`]
  );
  if (mitLager) await lagerFreischalten(ownerPool, firma.rows[0].id);
  return firma.rows[0].id;
}

async function mitarbeiterAnlegen(ownerPool, companyId, personalnummer, rollenschluessel) {
  const nutzer = await ownerPool.query(
    `INSERT INTO users (company_id, personnel_number, first_name, last_name)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [companyId, personalnummer, "Lager", personalnummer]
  );
  const userId = nutzer.rows[0].id;

  const rolle = await ownerPool.query(
    "SELECT id FROM roles WHERE company_id = $1 AND role_key = $2",
    [companyId, rollenschluessel]
  );
  assert.equal(rolle.rowCount, 1, `Rolle ${rollenschluessel} fehlt in der Firma`);

  await ownerPool.query(
    "INSERT INTO user_roles (company_id, user_id, role_id) VALUES ($1, $2, $3)",
    [companyId, userId, rolle.rows[0].id]
  );
  return { companyId, userId };
}

integrationTest("Lager: Artikel, Etikett, Scan und Buchung von Anfang bis Ende", async (t) => {
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
  const companyId = await firmaAnlegen(ownerPool, kennung);
  const buero = await mitarbeiterAnlegen(ownerPool, companyId, `LAG-B-${kennung}`, "office");
  const monteur = await mitarbeiterAnlegen(ownerPool, companyId, `LAG-M-${kennung}`, "installer");
  const vorarbeiter = await mitarbeiterAnlegen(ownerPool, companyId, `LAG-V-${kennung}`, "foreman");

  await t.test("ohne Freigabe der Plattform bleibt das Lager zu", async () => {
    const ohneLager = await firmaAnlegen(ownerPool, `${kennung}Z`, false);
    const chef = await mitarbeiterAnlegen(ownerPool, ohneLager, `LAG-Z-${kennung}`, "admin");

    // Auch der Administrator der Firma kommt nicht hinein: ueber den Umfang
    // entscheidet die Plattform, nicht der Kunde.
    await erwarteFehler(apiPool, chef, "GET", "/api/v1/stock/contexts",
      undefined, "stock_module_disabled");

    await lagerFreischalten(ownerPool, ohneLager);
    const danach = await aufrufen(apiPool, chef, "GET", "/api/v1/stock/contexts");
    assert.equal(danach.status, 200, "Nach der Freigabe steht das Lager offen");
  });

  await t.test("der Lagerist führt das Lager, ohne Büromensch zu sein", async () => {
    const lagerist = await mitarbeiterAnlegen(
      ownerPool, companyId, `LAG-L-${kennung}`, "warehouse_manager"
    );

    const sicht = await aufrufen(apiPool, lagerist, "GET", "/api/v1/stock/contexts");
    assert.equal(sicht.body.context.permissions.manage, true, "Er verwaltet das Lager");
    assert.equal(sicht.body.context.permissions.transfer, true);

    // Und er kann auch wirklich anlegen, nicht nur die Schaltfläche sehen.
    const artikel = await aufrufen(apiPool, lagerist, "POST", "/api/v1/stock/items", {
      itemNumber: `LAGERIST-${kennung}`, name: "Vom Lageristen angelegt",
      groupKey: "other", unit: "Stück"
    });
    assert.equal(artikel.status, 201);
  });

  await t.test("die Firma bekommt Warengruppen, Lager und Rechte ohne Zutun", async () => {
    const { status, body } = await aufrufen(apiPool, buero, "GET", "/api/v1/stock/contexts");
    assert.equal(status, 200);
    assert.equal(body.context.groups.length, 9);
    assert.ok(body.context.locations.some((ort) => ort.name === "Materiallager"));
    assert.equal(body.context.permissions.manage, true);
    assert.equal(body.context.settings.requireSiteOnIssue, false);
    assert.equal(body.context.settings.blockNegativeStock, false);

    const monteursicht = await aufrufen(apiPool, monteur, "GET", "/api/v1/stock/contexts");
    assert.equal(monteursicht.body.context.permissions.manage, false);
    assert.equal(monteursicht.body.context.permissions.transfer, false);

    const vorarbeitersicht = await aufrufen(apiPool, vorarbeiter, "GET", "/api/v1/stock/contexts");
    assert.equal(vorarbeitersicht.body.context.permissions.manage, false);
    assert.equal(vorarbeitersicht.body.context.permissions.transfer, true);
  });

  const kontext = await aufrufen(apiPool, buero, "GET", "/api/v1/stock/contexts");
  const lager = kontext.body.context.locations.find((ort) => ort.name === "Materiallager");

  let artikelId = null;
  let fachId = null;

  await t.test("das Büro legt einen Artikel mit Einzel- und Kartoncode an", async () => {
    const { status, body } = await aufrufen(apiPool, buero, "POST", "/api/v1/stock/items", {
      itemNumber: " lag-0001 ",
      name: "Schalterdose tief",
      groupKey: "installation",
      unit: "Stück",
      manufacturer: "Kaiser",
      manufacturerNumber: "1055-04",
      minimumStock: 50,
      targetStock: 200,
      barcodes: [
        { code: "4006381333931", codeType: "gtin", isPrimary: true },
        { code: "96385074", codeType: "gtin", packQuantity: 100 }
      ]
    });

    assert.equal(status, 201);
    assert.equal(body.item.itemNumber, "LAG-0001");
    assert.equal(body.item.manufacturerNumber, "1055-04");
    assert.equal(body.item.totalQuantity, 0);
    assert.equal(body.barcodes.length, 2);
    assert.equal(
      body.barcodes.find((code) => code.code === "4006381333931").normalized,
      "04006381333931"
    );
    artikelId = body.item.id;
  });

  await t.test("der Monteur darf keinen Artikel anlegen", async () => {
    await erwarteFehler(apiPool, monteur, "POST", "/api/v1/stock/items", {
      itemNumber: `LAG-VERBOTEN-${kennung}`,
      name: "Unerlaubt",
      groupKey: "other",
      unit: "Stück"
    }, "stock_manage_forbidden");
  });

  await t.test("eine ungültige GTIN wird beim Anlegen abgewiesen", async () => {
    await erwarteFehler(apiPool, buero, "POST", "/api/v1/stock/items", {
      itemNumber: `LAG-KAPUTT-${kennung}`,
      name: "Falsche Prüfziffer",
      groupKey: "other",
      unit: "Stück",
      barcodes: [{ code: "4006381333930", codeType: "gtin" }]
    }, "stock_invalid_gtin");
  });

  await t.test("ein Regal mit Fach entsteht, die vierte Ebene nicht", async () => {
    const regal = await aufrufen(apiPool, buero, "POST", "/api/v1/stock/locations", {
      name: "Regal A", locationType: "other", parentLocationId: lager.id
    });
    assert.equal(regal.status, 201);
    assert.equal(regal.body.location.depth, 2);

    const fach = await aufrufen(apiPool, buero, "POST", "/api/v1/stock/locations", {
      name: "Fach A1", locationType: "other", parentLocationId: regal.body.location.id
    });
    assert.equal(fach.body.location.depth, 3);
    assert.equal(fach.body.location.path, "Materiallager › Regal A › Fach A1");
    fachId = fach.body.location.id;

    await erwarteFehler(apiPool, buero, "POST", "/api/v1/stock/locations", {
      name: "Kiste", locationType: "other", parentLocationId: fachId
    }, "stock_location_too_deep");
  });

  await t.test("ein Etikett wird ausgegeben und beim Nachdruck wiederverwendet", async () => {
    const erst = await aufrufen(apiPool, buero, "POST", "/api/v1/stock/labels", {
      targetType: "location", locationId: fachId
    });
    assert.equal(erst.status, 201);
    assert.equal(erst.body.label.generation, 1);
    assert.equal(erst.body.label.replaced, false);

    const nachdruck = await aufrufen(apiPool, buero, "POST", "/api/v1/stock/labels", {
      targetType: "location", locationId: fachId
    });
    assert.equal(nachdruck.body.label.token, erst.body.label.token, "Ein Nachdruck darf keinen neuen Code erfinden");

    await erwarteFehler(apiPool, buero, "POST", "/api/v1/stock/labels", {
      targetType: "location", locationId: fachId, replace: true
    }, "invalid_request");

    const ersetzt = await aufrufen(apiPool, buero, "POST", "/api/v1/stock/labels", {
      targetType: "location", locationId: fachId, replace: true, reason: "Etikett abgerissen"
    });
    assert.equal(ersetzt.body.label.generation, 2);
    assert.notEqual(ersetzt.body.label.token, erst.body.label.token);

    // Der widerrufene Code darf sich nicht mehr auflösen lassen.
    const alt = await aufrufen(apiPool, monteur, "POST", "/api/v1/stock/scan", {
      code: erst.body.label.token
    });
    assert.equal(alt.body.scan.found, false);

    const neu = await aufrufen(apiPool, monteur, "POST", "/api/v1/stock/scan", {
      code: `https://app.example/lager?lager=${ersetzt.body.label.token}`
    });
    assert.equal(neu.body.scan.found, true);
    assert.equal(neu.body.scan.kind, "location");
    assert.equal(neu.body.scan.location.id, fachId);
  });

  await t.test("der Kartoncode bucht hundert, der Einzelcode eines", async () => {
    const einzeln = await aufrufen(apiPool, monteur, "POST", "/api/v1/stock/scan", {
      code: "4006381333931"
    });
    assert.equal(einzeln.body.scan.found, true);
    assert.equal(einzeln.body.scan.kind, "item");
    assert.equal(einzeln.body.scan.packQuantity, 1);
    assert.equal(einzeln.body.scan.item.id, artikelId);

    // Getrennt geschriebene Ziffern sind derselbe Code.
    const mitTrennern = await aufrufen(apiPool, monteur, "POST", "/api/v1/stock/scan", {
      code: "4-006381-333931"
    });
    assert.equal(mitTrennern.body.scan.item.id, artikelId);

    const karton = await aufrufen(apiPool, monteur, "POST", "/api/v1/stock/scan", {
      code: "96385074"
    });
    assert.equal(karton.body.scan.packQuantity, 100);
  });

  await t.test("ein unbekannter Code ist kein Fehler, sondern der Weg zur Neuanlage", async () => {
    const unbekannt = await aufrufen(apiPool, monteur, "POST", "/api/v1/stock/scan", {
      code: "5901234123457"
    });
    assert.equal(unbekannt.body.scan.found, false);
    assert.equal(unbekannt.body.scan.kind, "gtin");
    assert.equal(unbekannt.body.scan.normalized, "05901234123457");

    const freitext = await aufrufen(apiPool, monteur, "POST", "/api/v1/stock/scan", {
      code: "kabel-trommel-99"
    });
    assert.equal(freitext.body.scan.found, false);
    assert.equal(freitext.body.scan.kind, "text");
    assert.equal(freitext.body.scan.normalized, "KABEL-TROMMEL-99");

    // Ein erfundener Token sieht genauso aus wie ein fremder.
    const erfunden = await aufrufen(apiPool, monteur, "POST", "/api/v1/stock/scan", {
      code: randomUUID()
    });
    assert.equal(erfunden.body.scan.found, false);
  });

  await t.test("Anfangsbestand, Entnahme und Umlagerung schreiben den Bestand fort", async () => {
    const anfang = await aufrufen(apiPool, buero, "POST", "/api/v1/stock/movements", {
      itemId: artikelId, movementType: "opening", quantity: 200,
      targetLocationId: lager.id, sourceType: "import"
    });
    assert.equal(anfang.status, 201);
    assert.equal(anfang.body.levels.find((e) => e.locationId === lager.id).quantity, 200);

    // Der Monteur darf entnehmen, ohne dass jemand etwas freischaltet.
    const entnahme = await aufrufen(apiPool, monteur, "POST", "/api/v1/stock/movements", {
      itemId: artikelId, movementType: "issue", quantity: 30,
      sourceLocationId: lager.id, sourceType: "qr_scan"
    });
    assert.equal(entnahme.body.levels.find((e) => e.locationId === lager.id).quantity, 170);

    await erwarteFehler(apiPool, monteur, "POST", "/api/v1/stock/movements", {
      itemId: artikelId, movementType: "transfer", quantity: 10,
      sourceLocationId: lager.id, targetLocationId: fachId
    }, "stock_movement_forbidden");

    const umlagerung = await aufrufen(apiPool, vorarbeiter, "POST", "/api/v1/stock/movements", {
      itemId: artikelId, movementType: "transfer", quantity: 50,
      sourceLocationId: lager.id, targetLocationId: fachId
    });
    assert.equal(umlagerung.body.levels.find((e) => e.locationId === lager.id).quantity, 120);
    assert.equal(umlagerung.body.levels.find((e) => e.locationId === fachId).quantity, 50);

    await erwarteFehler(apiPool, vorarbeiter, "POST", "/api/v1/stock/movements", {
      itemId: artikelId, movementType: "transfer", quantity: 5,
      sourceLocationId: lager.id, targetLocationId: lager.id
    }, "invalid_request");

    await erwarteFehler(apiPool, buero, "POST", "/api/v1/stock/movements", {
      itemId: artikelId, movementType: "scrap", quantity: 1, sourceLocationId: lager.id
    }, "invalid_request");
  });

  await t.test("dieselbe Offline-Buchung zählt nur einmal", async () => {
    const vorgang = `ABNAHME-${kennung}-${randomUUID()}`;
    const erste = await aufrufen(apiPool, monteur, "POST", "/api/v1/stock/movements", {
      itemId: artikelId, movementType: "issue", quantity: 7,
      sourceLocationId: lager.id, sourceType: "offline_sync", clientOperationId: vorgang
    });
    assert.equal(erste.body.repeated, false);

    const zweite = await aufrufen(apiPool, monteur, "POST", "/api/v1/stock/movements", {
      itemId: artikelId, movementType: "issue", quantity: 7,
      sourceLocationId: lager.id, sourceType: "offline_sync", clientOperationId: vorgang
    });
    assert.equal(zweite.body.repeated, true);
    assert.equal(zweite.body.movement.id, erste.body.movement.id);

    const stand = await aufrufen(apiPool, buero, "GET", `/api/v1/stock/items/${artikelId}`);
    assert.equal(stand.body.levels.find((e) => e.locationId === lager.id).quantity, 113);
  });

  await t.test("Unterdeckung buchen ist erlaubt, bis die Firma es verbietet", async () => {
    const zuviel = await aufrufen(apiPool, monteur, "POST", "/api/v1/stock/movements", {
      itemId: artikelId, movementType: "issue", quantity: 500, sourceLocationId: fachId
    });
    assert.ok(zuviel.body.levels.find((e) => e.locationId === fachId).quantity < 0);

    await ownerPool.query(
      "UPDATE stock_settings SET block_negative_stock = TRUE WHERE company_id = $1",
      [companyId]
    );
    await erwarteFehler(apiPool, monteur, "POST", "/api/v1/stock/movements", {
      itemId: artikelId, movementType: "issue", quantity: 500, sourceLocationId: fachId
    }, "stock_insufficient");
    await ownerPool.query(
      "UPDATE stock_settings SET block_negative_stock = FALSE WHERE company_id = $1",
      [companyId]
    );
  });

  await t.test("die Firmenregel kann die Baustelle zur Pflicht machen", async () => {
    await ownerPool.query(
      "UPDATE stock_settings SET require_site_on_issue = TRUE WHERE company_id = $1",
      [companyId]
    );
    await erwarteFehler(apiPool, monteur, "POST", "/api/v1/stock/movements", {
      itemId: artikelId, movementType: "issue", quantity: 1, sourceLocationId: lager.id
    }, "stock_site_required");
    await ownerPool.query(
      "UPDATE stock_settings SET require_site_on_issue = FALSE WHERE company_id = $1",
      [companyId]
    );
  });

  await t.test("Bestandsliste und Nachbestellvorschlag rechnen aus dem Journal", async () => {
    const bestand = await aufrufen(apiPool, buero, "GET", `/api/v1/stock/levels?ort=${lager.id}`);
    assert.equal(bestand.status, 200);
    const zeile = bestand.body.levels.find((e) => e.itemId === artikelId);
    assert.equal(zeile.quantity, 113);
    assert.equal(zeile.unit, "Stück");

    // 113 im Lager minus 450 im Fach liegt unter dem Mindestbestand von 50.
    const vorschlag = await aufrufen(apiPool, buero, "GET", "/api/v1/stock/reorder");
    const eintrag = vorschlag.body.suggestions.find((e) => e.id === artikelId);
    assert.ok(eintrag, "Der unterdeckte Artikel fehlt im Nachbestellvorschlag");
    assert.equal(eintrag.suggestedQuantity, 200 - eintrag.totalQuantity);
  });

  await t.test("eine fremde Firma sieht nichts davon", async () => {
    const fremdeFirma = await firmaAnlegen(ownerPool, `${kennung}X`);
    const fremder = await mitarbeiterAnlegen(ownerPool, fremdeFirma, `LAG-F-${kennung}`, "office");

    const artikel = await aufrufen(apiPool, fremder, "GET", "/api/v1/stock/items");
    assert.deepEqual(artikel.body.items, [], "Die fremde Firma sieht fremde Artikel");

    const scan = await aufrufen(apiPool, fremder, "POST", "/api/v1/stock/scan", {
      code: "4006381333931"
    });
    assert.equal(scan.body.scan.found, false, "Ein fremder Herstellercode wurde aufgelöst");

    await erwarteFehler(apiPool, fremder, "GET", `/api/v1/stock/items/${artikelId}`,
      undefined, "stock_item_unknown");

    // Auch mit gültiger Artikel-ID darf keine Buchung entstehen.
    await erwarteFehler(apiPool, fremder, "POST", "/api/v1/stock/movements", {
      itemId: artikelId, movementType: "opening", quantity: 1,
      targetLocationId: lager.id
    }, "stock_reference_unknown");
  });

  await t.test("einen unbekannten Lagerendpunkt gibt es nicht", async () => {
    const { status } = await aufrufen(apiPool, buero, "GET", "/api/v1/stock/erfunden");
    assert.equal(status, 404);
  });
});

integrationTest("Lager: Inventur von der Zählung bis zur Korrektur", async (t) => {
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
  const companyId = await firmaAnlegen(ownerPool, `${kennung}I`);
  const buero = await mitarbeiterAnlegen(ownerPool, companyId, `INV-B-${kennung}`, "office");
  const vorarbeiter = await mitarbeiterAnlegen(ownerPool, companyId, `INV-V-${kennung}`, "foreman");
  const monteur = await mitarbeiterAnlegen(ownerPool, companyId, `INV-M-${kennung}`, "installer");

  const kontext = await aufrufen(apiPool, buero, "GET", "/api/v1/stock/contexts");
  const lager = kontext.body.context.locations.find((ort) => ort.name === "Materiallager");

  // Zwei Artikel mit Anfangsbestand, damit es etwas zu zählen gibt.
  const angelegt = [];
  for (const [nummer, name, menge] of [["INV-1", "Zählartikel A", 100], ["INV-2", "Zählartikel B", 40]]) {
    const artikel = await aufrufen(apiPool, buero, "POST", "/api/v1/stock/items", {
      itemNumber: `${nummer}-${kennung}`, name, groupKey: "other", unit: "Stück"
    });
    await aufrufen(apiPool, buero, "POST", "/api/v1/stock/movements", {
      itemId: artikel.body.item.id, movementType: "opening", quantity: menge,
      targetLocationId: lager.id, sourceType: "import"
    });
    angelegt.push(artikel.body.item.id);
  }
  const [artikelA, artikelB] = angelegt;

  let inventurId = null;

  await t.test("der Monteur darf keine Inventur starten", async () => {
    await erwarteFehler(apiPool, monteur, "POST", "/api/v1/stock/inventory",
      { locationId: lager.id }, "stock_inventory_forbidden");
  });

  await t.test("der Vorarbeiter startet und bekommt den eingefrorenen Sollbestand", async () => {
    const { status, body } = await aufrufen(apiPool, vorarbeiter, "POST", "/api/v1/stock/inventory", {
      locationId: lager.id
    });

    assert.equal(status, 201);
    assert.equal(body.session.status, "running");
    assert.equal(body.lines.length, 2);
    assert.equal(body.open, 2, "Vor der Zählung ist alles offen");
    assert.equal(body.differences, 0);
    assert.equal(body.lines.find((zeile) => zeile.itemId === artikelA).expectedQuantity, 100);
    inventurId = body.session.id;
  });

  await t.test("für denselben Lagerplatz läuft nur eine Inventur", async () => {
    await erwarteFehler(apiPool, vorarbeiter, "POST", "/api/v1/stock/inventory",
      { locationId: lager.id }, "stock_inventory_running");
  });

  await t.test("gezählt wird auch, was gar nicht dort liegen sollte", async () => {
    // A: 3 Stück weniger als gedacht.
    const nachA = await aufrufen(apiPool, vorarbeiter, "POST",
      `/api/v1/stock/inventory/${inventurId}/count`, { itemId: artikelA, quantity: 97 });
    assert.equal(nachA.body.lines.find((z) => z.itemId === artikelA).difference, -3);
    assert.equal(nachA.body.open, 1);

    // B: genau so viele wie gedacht.
    const nachB = await aufrufen(apiPool, vorarbeiter, "POST",
      `/api/v1/stock/inventory/${inventurId}/count`, { itemId: artikelB, quantity: 40 });
    assert.equal(nachB.body.lines.find((z) => z.itemId === artikelB).difference, 0);
    assert.equal(nachB.body.open, 0);
    assert.equal(nachB.body.differences, 1, "Nur A weicht ab");

    // Ein dritter Artikel taucht überraschend am Platz auf.
    const fund = await aufrufen(apiPool, buero, "POST", "/api/v1/stock/items", {
      itemNumber: `INV-3-${kennung}`, name: "Überraschungsfund", groupKey: "other", unit: "Stück"
    });
    const nachFund = await aufrufen(apiPool, vorarbeiter, "POST",
      `/api/v1/stock/inventory/${inventurId}/count`, { itemId: fund.body.item.id, quantity: 12 });

    const zeile = nachFund.body.lines.find((z) => z.itemId === fund.body.item.id);
    assert.equal(zeile.expectedQuantity, 0, "Was nicht dort sein sollte, hat Soll null");
    assert.equal(zeile.difference, 12);
  });

  await t.test("eine Zählung lässt sich berichtigen, solange die Inventur läuft", async () => {
    const berichtigt = await aufrufen(apiPool, vorarbeiter, "POST",
      `/api/v1/stock/inventory/${inventurId}/count`, { itemId: artikelA, quantity: 98 });
    assert.equal(berichtigt.body.lines.find((z) => z.itemId === artikelA).difference, -2);
  });

  await t.test("der Vorarbeiter darf nicht abschließen", async () => {
    await erwarteFehler(apiPool, vorarbeiter, "POST",
      `/api/v1/stock/inventory/${inventurId}/complete`, {}, "stock_manage_forbidden");
  });

  await t.test("der Abschluss schreibt genau die Unterschiede als Korrektur", async () => {
    const { body } = await aufrufen(apiPool, buero, "POST",
      `/api/v1/stock/inventory/${inventurId}/complete`, { reason: "Jahresinventur" });

    assert.equal(body.session.status, "completed");
    assert.equal(body.corrections, 2, "A um zwei zu wenig, der Fund um zwölf zu viel");

    const bestand = await aufrufen(apiPool, buero, "GET", `/api/v1/stock/items/${artikelA}`);
    assert.equal(
      bestand.body.levels.find((zeile) => zeile.locationId === lager.id).quantity,
      98,
      "Nach der Korrektur steht der gezählte Bestand"
    );

    const unveraendert = await aufrufen(apiPool, buero, "GET", `/api/v1/stock/items/${artikelB}`);
    assert.equal(
      unveraendert.body.levels.find((zeile) => zeile.locationId === lager.id).quantity,
      40,
      "Ohne Abweichung entsteht keine Buchung"
    );

    const korrektur = bestand.body.movements.find((zug) => zug.movementType === "correction");
    assert.equal(korrektur.sourceType, "inventory");
    assert.equal(korrektur.reason, "Jahresinventur");
  });

  await t.test("eine abgeschlossene Inventur nimmt nichts mehr an", async () => {
    await erwarteFehler(apiPool, vorarbeiter, "POST",
      `/api/v1/stock/inventory/${inventurId}/count`,
      { itemId: artikelA, quantity: 5 }, "stock_inventory_closed");
    await erwarteFehler(apiPool, buero, "POST",
      `/api/v1/stock/inventory/${inventurId}/complete`, {}, "stock_inventory_closed");
  });

  await t.test("nicht gezählte Zeilen werden nicht ausgebucht", async () => {
    const neu = await aufrufen(apiPool, vorarbeiter, "POST", "/api/v1/stock/inventory", {
      locationId: lager.id
    });
    const zweite = neu.body.session.id;

    // Nichts zählen und trotzdem abschließen.
    const abschluss = await aufrufen(apiPool, buero, "POST",
      `/api/v1/stock/inventory/${zweite}/complete`, {});
    assert.equal(abschluss.body.corrections, 0);

    const bestand = await aufrufen(apiPool, buero, "GET", `/api/v1/stock/items/${artikelA}`);
    assert.equal(
      bestand.body.levels.find((zeile) => zeile.locationId === lager.id).quantity,
      98,
      "Eine abgebrochene Zählung darf kein Lager leeren"
    );
  });

  await t.test("ein Abbruch braucht einen Grund und beendet die Inventur", async () => {
    const neu = await aufrufen(apiPool, vorarbeiter, "POST", "/api/v1/stock/inventory", {
      locationId: lager.id
    });
    const dritte = neu.body.session.id;

    await erwarteFehler(apiPool, vorarbeiter, "POST",
      `/api/v1/stock/inventory/${dritte}/cancel`, {}, "invalid_request");

    const abgebrochen = await aufrufen(apiPool, vorarbeiter, "POST",
      `/api/v1/stock/inventory/${dritte}/cancel`, { reason: "Regal nicht zugänglich" });
    assert.equal(abgebrochen.body.session.status, "cancelled");

    const laufende = await aufrufen(apiPool, buero, "GET", "/api/v1/stock/inventory");
    assert.equal(
      laufende.body.sessions.filter((sitzung) => sitzung.id === dritte).length,
      0,
      "Eine abgebrochene Inventur läuft nicht mehr"
    );
  });

  await t.test("eine fremde Firma sieht die Inventur nicht", async () => {
    const fremdeFirma = await firmaAnlegen(ownerPool, `${kennung}J`);
    const fremder = await mitarbeiterAnlegen(ownerPool, fremdeFirma, `INV-F-${kennung}`, "office");

    await erwarteFehler(apiPool, fremder, "GET", `/api/v1/stock/inventory/${inventurId}`,
      undefined, "stock_inventory_unknown");
  });
});

integrationTest("Lager: Bestellung vom Vorschlag bis zur Teillieferung", async (t) => {
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
  const companyId = await firmaAnlegen(ownerPool, `${kennung}B`);
  const buero = await mitarbeiterAnlegen(ownerPool, companyId, `BST-B-${kennung}`, "office");
  const monteur = await mitarbeiterAnlegen(ownerPool, companyId, `BST-M-${kennung}`, "installer");

  const kontext = await aufrufen(apiPool, buero, "GET", "/api/v1/stock/contexts");
  const lager = kontext.body.context.locations.find((ort) => ort.name === "Materiallager");

  let lieferantId = null;
  let artikelKnapp = null;
  let artikelVoll = null;
  let bestellId = null;

  await t.test("der Monteur darf keinen Lieferanten anlegen", async () => {
    await erwarteFehler(apiPool, monteur, "POST", "/api/v1/stock/suppliers",
      { supplierNumber: "L-1", name: "Verboten" }, "stock_manage_forbidden");
  });

  await t.test("das Büro legt einen Lieferanten an", async () => {
    const { status, body } = await aufrufen(apiPool, buero, "POST", "/api/v1/stock/suppliers", {
      supplierNumber: ` l-${kennung} `, name: "Sonepar Deutschland", customerNumber: "K-4711",
      email: "Bestellung@Sonepar.example"
    });

    assert.equal(status, 201);
    assert.equal(body.supplier.supplierNumber, `L-${kennung}`);
    assert.equal(body.supplier.email, "bestellung@sonepar.example", "Die Adresse wird vereinheitlicht");
    lieferantId = body.supplier.id;

    const liste = await aufrufen(apiPool, buero, "GET", "/api/v1/stock/suppliers");
    assert.equal(liste.body.suppliers.filter((eintrag) => eintrag.id === lieferantId).length, 1);
  });

  await t.test("dieselbe Lieferantennummer gibt es nur einmal", async () => {
    await erwarteFehler(apiPool, buero, "POST", "/api/v1/stock/suppliers",
      { supplierNumber: `L-${kennung}`, name: "Noch einmal" }, "stock_duplicate");
  });

  await t.test("zwei Artikel, einer davon unter dem Mindestbestand", async () => {
    const knapp = await aufrufen(apiPool, buero, "POST", "/api/v1/stock/items", {
      itemNumber: `BST-1-${kennung}`, name: "Knapper Artikel", groupKey: "other", unit: "Stück",
      minimumStock: 100, targetStock: 400, defaultSupplierId: lieferantId
    });
    artikelKnapp = knapp.body.item.id;
    await aufrufen(apiPool, buero, "POST", "/api/v1/stock/movements", {
      itemId: artikelKnapp, movementType: "opening", quantity: 40,
      targetLocationId: lager.id, sourceType: "import"
    });

    const voll = await aufrufen(apiPool, buero, "POST", "/api/v1/stock/items", {
      itemNumber: `BST-2-${kennung}`, name: "Voller Artikel", groupKey: "other", unit: "Stück",
      minimumStock: 10, targetStock: 50, defaultSupplierId: lieferantId
    });
    artikelVoll = voll.body.item.id;
    await aufrufen(apiPool, buero, "POST", "/api/v1/stock/movements", {
      itemId: artikelVoll, movementType: "opening", quantity: 40,
      targetLocationId: lager.id, sourceType: "import"
    });

    const vorschlag = await aufrufen(apiPool, buero, "GET", "/api/v1/stock/reorder");
    const eintrag = vorschlag.body.suggestions.find((zeile) => zeile.id === artikelKnapp);
    assert.ok(eintrag, "Der knappe Artikel fehlt im Vorschlag");
    assert.equal(eintrag.suggestedQuantity, 360, "Aufgefüllt wird bis zum Zielbestand");
    assert.equal(eintrag.supplierName, "Sonepar Deutschland");
    assert.equal(
      vorschlag.body.suggestions.filter((zeile) => zeile.id === artikelVoll).length,
      0,
      "Der volle Artikel gehört nicht in den Vorschlag"
    );
  });

  await t.test("aus dem Vorschlag entsteht eine Bestellung", async () => {
    const { status, body } = await aufrufen(apiPool, buero, "POST", "/api/v1/stock/orders", {
      supplierId: lieferantId, fromReorder: true
    });

    assert.equal(status, 201);
    assert.equal(body.order.status, "draft");
    assert.equal(body.order.supplierName, "Sonepar Deutschland");
    assert.match(body.order.orderNumber, /^B-\d{4}-/);
    assert.equal(body.lines.length, 1, "Nur der knappe Artikel gehört hinein");
    assert.equal(body.lines[0].itemId, artikelKnapp);
    assert.equal(body.lines[0].quantityOrdered, 360);
    assert.equal(body.lines[0].quantityOpen, 360);
    bestellId = body.order.id;
  });

  await t.test("ein Entwurf nimmt noch keine Ware an", async () => {
    await erwarteFehler(apiPool, buero, "POST", `/api/v1/stock/orders/${bestellId}/receive`,
      { locationId: lager.id, lines: [{ purchaseOrderItemId: bestellId, quantity: 1 }] },
      "stock_order_closed");
  });

  await t.test("bestellt wird einmal", async () => {
    const { body } = await aufrufen(apiPool, buero, "POST", `/api/v1/stock/orders/${bestellId}/send`);
    assert.equal(body.order.status, "ordered");
    assert.ok(body.order.orderedAt);

    await erwarteFehler(apiPool, buero, "POST", `/api/v1/stock/orders/${bestellId}/send`,
      undefined, "stock_order_not_draft");
  });

  await t.test("eine Teillieferung lässt die Bestellung offen", async () => {
    const detail = await aufrufen(apiPool, buero, "GET", `/api/v1/stock/orders/${bestellId}`);
    const position = detail.body.lines[0].id;

    const { body } = await aufrufen(apiPool, buero, "POST", `/api/v1/stock/orders/${bestellId}/receive`, {
      locationId: lager.id,
      lines: [{ purchaseOrderItemId: position, quantity: 100, clientOperationId: `WE-${kennung}-1` }]
    });

    assert.equal(body.order.status, "partially_received");
    assert.equal(body.lines[0].quantityReceived, 100);
    assert.equal(body.lines[0].quantityOpen, 260);

    const bestand = await aufrufen(apiPool, buero, "GET", `/api/v1/stock/items/${artikelKnapp}`);
    assert.equal(
      bestand.body.levels.find((zeile) => zeile.locationId === lager.id).quantity,
      140,
      "Der Wareneingang landet im Bestand"
    );
    const zugang = bestand.body.movements.find((zug) => zug.movementType === "receipt");
    assert.ok(zugang, "Der Wareneingang steht im Journal");
  });

  await t.test("derselbe Wareneingang zählt nur einmal", async () => {
    const detail = await aufrufen(apiPool, buero, "GET", `/api/v1/stock/orders/${bestellId}`);
    const position = detail.body.lines[0].id;

    const { body } = await aufrufen(apiPool, buero, "POST", `/api/v1/stock/orders/${bestellId}/receive`, {
      locationId: lager.id,
      lines: [{ purchaseOrderItemId: position, quantity: 100, clientOperationId: `WE-${kennung}-1` }]
    });

    assert.equal(body.booked[0].repeated, true);
    assert.equal(body.lines[0].quantityReceived, 100, "Die gelieferte Menge darf sich nicht verdoppeln");

    const bestand = await aufrufen(apiPool, buero, "GET", `/api/v1/stock/items/${artikelKnapp}`);
    assert.equal(bestand.body.levels.find((zeile) => zeile.locationId === lager.id).quantity, 140);
  });

  await t.test("eine angefangene Lieferung lässt sich nicht mehr stornieren", async () => {
    await erwarteFehler(apiPool, buero, "POST", `/api/v1/stock/orders/${bestellId}/cancel`,
      { reason: "Doch nicht" }, "stock_order_not_cancellable");
  });

  await t.test("Überlieferung ist erlaubt und schließt die Bestellung", async () => {
    const detail = await aufrufen(apiPool, buero, "GET", `/api/v1/stock/orders/${bestellId}`);
    const position = detail.body.lines[0].id;

    const { body } = await aufrufen(apiPool, buero, "POST", `/api/v1/stock/orders/${bestellId}/receive`, {
      locationId: lager.id,
      lines: [{ purchaseOrderItemId: position, quantity: 300, clientOperationId: `WE-${kennung}-2` }]
    });

    assert.equal(body.order.status, "received");
    assert.equal(body.lines[0].quantityReceived, 400, "Vierhundert geliefert bei dreihundertsechzig bestellt");
    assert.equal(body.lines[0].quantityOpen, 0);

    await erwarteFehler(apiPool, buero, "POST", `/api/v1/stock/orders/${bestellId}/receive`,
      { locationId: lager.id, lines: [{ purchaseOrderItemId: position, quantity: 1 }] },
      "stock_order_closed");
  });

  await t.test("eine Bestellung ohne Bedarf wird nicht erfunden", async () => {
    await erwarteFehler(apiPool, buero, "POST", "/api/v1/stock/orders",
      { supplierId: lieferantId, fromReorder: true }, "stock_reorder_empty");
  });

  await t.test("ein Entwurf lässt sich mit Grund stornieren", async () => {
    const entwurf = await aufrufen(apiPool, buero, "POST", "/api/v1/stock/orders", {
      supplierId: lieferantId,
      lines: [{ itemId: artikelVoll, quantity: 25, unitPrice: 1.5, supplierItemNumber: "SON-123" }]
    });
    const id = entwurf.body.order.id;
    assert.equal(entwurf.body.lines[0].unitPrice, 1.5);
    assert.equal(entwurf.body.lines[0].supplierItemNumber, "SON-123");

    await erwarteFehler(apiPool, buero, "POST", `/api/v1/stock/orders/${id}/cancel`,
      {}, "invalid_request");

    const storniert = await aufrufen(apiPool, buero, "POST", `/api/v1/stock/orders/${id}/cancel`,
      { reason: "Falscher Lieferant" });
    assert.equal(storniert.body.order.status, "cancelled");

    const offene = await aufrufen(apiPool, buero, "GET", "/api/v1/stock/orders?offen=ja");
    assert.equal(offene.body.orders.filter((eintrag) => eintrag.id === id).length, 0);
  });

  await t.test("eine fremde Firma sieht die Bestellung nicht", async () => {
    const fremdeFirma = await firmaAnlegen(ownerPool, `${kennung}C`);
    const fremder = await mitarbeiterAnlegen(ownerPool, fremdeFirma, `BST-F-${kennung}`, "office");

    await erwarteFehler(apiPool, fremder, "GET", `/api/v1/stock/orders/${bestellId}`,
      undefined, "stock_order_unknown");
    await erwarteFehler(apiPool, fremder, "POST", "/api/v1/stock/orders",
      { supplierId: lieferantId, fromReorder: true }, "stock_supplier_unknown");
  });
});

integrationTest("Lager: Codes nachtragen, zurücknehmen und Etiketten drucken", async (t) => {
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
  const companyId = await firmaAnlegen(ownerPool, `${kennung}D`);
  const buero = await mitarbeiterAnlegen(ownerPool, companyId, `COD-B-${kennung}`, "office");
  const monteur = await mitarbeiterAnlegen(ownerPool, companyId, `COD-M-${kennung}`, "installer");

  // Ein Artikel ganz ohne Code — der Fall, den es vorher nicht gab.
  const ohneCode = await aufrufen(apiPool, buero, "POST", "/api/v1/stock/items", {
    itemNumber: `COD-1-${kennung}`, name: "Handangelegt ohne Code", groupKey: "other", unit: "Stück"
  });
  const artikelId = ohneCode.body.item.id;
  const zweiter = await aufrufen(apiPool, buero, "POST", "/api/v1/stock/items", {
    itemNumber: `COD-2-${kennung}`, name: "Zweiter Artikel", groupKey: "other", unit: "Stück"
  });
  const zweiterId = zweiter.body.item.id;

  await t.test("ein handangelegter Artikel darf ohne Code entstehen", async () => {
    assert.equal(ohneCode.status, 201);
    assert.deepEqual(ohneCode.body.barcodes, [], "Ohne Herstellercode gibt es eben keinen");
  });

  await t.test("der Monteur trägt keine Codes nach", async () => {
    await erwarteFehler(apiPool, monteur, "POST", `/api/v1/stock/items/${artikelId}/barcodes`,
      { code: "4006381333931", codeType: "gtin" }, "stock_manage_forbidden");
  });

  await t.test("das Büro trägt Einzel- und Kartoncode nach", async () => {
    const einzeln = await aufrufen(apiPool, buero, "POST", `/api/v1/stock/items/${artikelId}/barcodes`, {
      code: "4006381333931", codeType: "gtin", isPrimary: true
    });
    assert.equal(einzeln.status, 201);
    assert.equal(einzeln.body.barcodes.length, 1);
    assert.equal(einzeln.body.barcodes[0].normalized, "04006381333931");

    const karton = await aufrufen(apiPool, buero, "POST", `/api/v1/stock/items/${artikelId}/barcodes`, {
      code: "96385074", codeType: "gtin", packQuantity: 100
    });
    assert.equal(karton.body.barcodes.length, 2);

    const scan = await aufrufen(apiPool, monteur, "POST", "/api/v1/stock/scan", { code: "96385074" });
    assert.equal(scan.body.scan.found, true);
    assert.equal(scan.body.scan.packQuantity, 100, "Der nachgetragene Kartoncode bucht hundert");
    assert.equal(scan.body.scan.item.id, artikelId);
  });

  await t.test("ein neuer Hauptcode löst den bisherigen ab", async () => {
    const vorher = await aufrufen(apiPool, buero, "GET", `/api/v1/stock/items/${artikelId}`);
    assert.equal(vorher.body.barcodes.filter((code) => code.isPrimary).length, 1);

    const nachher = await aufrufen(apiPool, buero, "POST", `/api/v1/stock/items/${artikelId}/barcodes`, {
      code: `EIGEN-${kennung}`, isPrimary: true
    });
    const haupt = nachher.body.barcodes.filter((code) => code.isPrimary);
    assert.equal(haupt.length, 1, "Es gibt genau einen Hauptcode");
    assert.equal(haupt[0].code, `EIGEN-${kennung}`);
  });

  await t.test("eine ungültige GTIN wird auch beim Nachtragen abgewiesen", async () => {
    await erwarteFehler(apiPool, buero, "POST", `/api/v1/stock/items/${artikelId}/barcodes`,
      { code: "4006381333930", codeType: "gtin" }, "stock_invalid_gtin");
  });

  await t.test("derselbe Code gehört nur zu einem Artikel", async () => {
    await erwarteFehler(apiPool, buero, "POST", `/api/v1/stock/items/${zweiterId}/barcodes`,
      { code: "4006381333931", codeType: "gtin" }, "stock_duplicate");
  });

  await t.test("ein vertippter Code wird mit Grund zurückgenommen", async () => {
    const detail = await aufrufen(apiPool, buero, "GET", `/api/v1/stock/items/${artikelId}`);
    const falsch = detail.body.barcodes.find((code) => code.code === "4006381333931");

    await erwarteFehler(apiPool, buero, "POST",
      `/api/v1/stock/items/${artikelId}/barcodes/${falsch.id}/revoke`, {}, "invalid_request");

    const { body } = await aufrufen(apiPool, buero, "POST",
      `/api/v1/stock/items/${artikelId}/barcodes/${falsch.id}/revoke`, { reason: "Vertippt" });
    assert.equal(body.barcodes.filter((code) => code.code === "4006381333931").length, 0);

    const scan = await aufrufen(apiPool, monteur, "POST", "/api/v1/stock/scan", { code: "4006381333931" });
    assert.equal(scan.body.scan.found, false, "Ein zurückgenommener Code findet nichts mehr");
  });

  await t.test("nach der Rücknahme gehört der Code dem richtigen Artikel", async () => {
    const { body } = await aufrufen(apiPool, buero, "POST", `/api/v1/stock/items/${zweiterId}/barcodes`, {
      code: "4006381333931", codeType: "gtin"
    });
    assert.equal(body.barcodes.length, 1);

    const scan = await aufrufen(apiPool, monteur, "POST", "/api/v1/stock/scan", { code: "4006381333931" });
    assert.equal(scan.body.scan.item.id, zweiterId);
  });

  await t.test("ein fremder Code lässt sich nicht zurücknehmen", async () => {
    const detail = await aufrufen(apiPool, buero, "GET", `/api/v1/stock/items/${zweiterId}`);
    await erwarteFehler(apiPool, buero, "POST",
      `/api/v1/stock/items/${artikelId}/barcodes/${detail.body.barcodes[0].id}/revoke`,
      { reason: "Versuch" }, "stock_barcode_unknown");
  });

  await t.test("für einen Artikel ohne Herstellercode entsteht ein eigenes Etikett", async () => {
    const nackt = await aufrufen(apiPool, buero, "POST", "/api/v1/stock/items", {
      itemNumber: `COD-3-${kennung}`, name: "Kabeltrommel ohne Aufdruck", groupKey: "other", unit: "Meter"
    });

    const { status, body } = await aufrufen(apiPool, buero, "POST", "/api/v1/stock/labels/sheet", {
      targets: [{ targetType: "item", id: nackt.body.item.id }]
    });

    assert.equal(status, 200);
    assert.equal(body.labels.length, 1);
    assert.equal(body.labels[0].label, "Kabeltrommel ohne Aufdruck");
    assert.equal(body.labels[0].sublabel, `COD-3-${kennung}`);
    assert.match(body.labels[0].svg, /^<svg/, "Es kommt ein Bild und keine Beschreibung");
    assert.match(body.labels[0].target, /lager=[0-9a-f-]{36}/);
    assert.equal(body.labels[0].generation, 1);

    // Der Nachdruck darf die schon geklebten Aufkleber nicht entwerten.
    const nachdruck = await aufrufen(apiPool, buero, "POST", "/api/v1/stock/labels/sheet", {
      targets: [{ targetType: "item", id: nackt.body.item.id }]
    });
    assert.equal(nachdruck.body.labels[0].target, body.labels[0].target);

    // Und der gedruckte Code findet den Artikel.
    const token = new URL(body.labels[0].target).searchParams.get("lager");
    const scan = await aufrufen(apiPool, monteur, "POST", "/api/v1/stock/scan", { code: token });
    assert.equal(scan.body.scan.found, true);
    assert.equal(scan.body.scan.item.id, nackt.body.item.id);
  });

  await t.test("ein Bogen nimmt Artikel und Lagerplätze gemischt auf", async () => {
    const kontext = await aufrufen(apiPool, buero, "GET", "/api/v1/stock/contexts");
    const lager = kontext.body.context.locations.find((ort) => ort.name === "Materiallager");

    const { body } = await aufrufen(apiPool, buero, "POST", "/api/v1/stock/labels/sheet", {
      targets: [
        { targetType: "item", id: artikelId },
        { targetType: "location", id: lager.id }
      ]
    });

    assert.equal(body.labels.length, 2);
    assert.equal(body.labels[1].label, "Materiallager");
    assert.equal(body.labels[1].targetType, "location");
  });

  await t.test("ein leerer oder überlanger Bogen wird abgewiesen", async () => {
    await erwarteFehler(apiPool, buero, "POST", "/api/v1/stock/labels/sheet",
      { targets: [] }, "invalid_request");
    await erwarteFehler(apiPool, buero, "POST", "/api/v1/stock/labels/sheet",
      { targets: Array.from({ length: 121 }, () => ({ targetType: "item", id: artikelId })) },
      "invalid_request");
    await erwarteFehler(apiPool, monteur, "POST", "/api/v1/stock/labels/sheet",
      { targets: [{ targetType: "item", id: artikelId }] }, "stock_manage_forbidden");
  });
});
