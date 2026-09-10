import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { APPLICATION_VERSION, createApp } from "../src/app.mjs";
import { createPool } from "../src/database.mjs";
import { hashPassword } from "../src/password.mjs";

// Die DATEV-Personalnummer wird seit dieser Aenderung direkt im
// Mitarbeiterformular gepflegt (siehe api/src/app.mjs, createEmployee und
// updateEmployee), nicht mehr nur in der eigenstaendigen DATEV-Liste. Dieser
// Test bringt seine eigene Firma mit und laeuft getrennt vom grossen
// Integrationstest.

const enabled = process.env.API_INTEGRATION_TEST === "true";
const integrationTest = enabled ? test : test.skip;

integrationTest("Die DATEV-Personalnummer laesst sich im Mitarbeiterformular pflegen", async (t) => {
  const config = {
    port: 0,
    allowedOrigin: "http://localhost:4173",
    timeZone: "Europe/Berlin",
    sessionTtlSeconds: 3600,
    cookieSecure: false,
    initialCompanyNumber: "F-000001",
    initialSetupToken: "CI-SETUP-TOKEN-2026-ONLY-TEST",
    platformSetupToken: "CI-PLATFORM-SETUP-2026-ONLY-TEST",
    staticDirectory: process.cwd(),
    database: {
      host: process.env.POSTGRES_HOST,
      port: Number(process.env.POSTGRES_PORT || 5432),
      database: process.env.POSTGRES_DB,
      user: process.env.API_DB_USER,
      password: process.env.API_DB_PASSWORD,
      max: 4
    }
  };
  const apiPool = createPool(config.database);
  // Eigentuemerzugang zum Anlegen der Ausgangslage: die API-Rolle darf
  // Stammdaten nur innerhalb ihrer Mandantentransaktionen schreiben.
  const ownerPool = createPool({
    ...config.database,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD
  });
  const server = createServer(createApp({ pool: apiPool, config, logger: { error() {} } }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await apiPool.end();
    await ownerPool.end();
  });

  const kennung = Date.now().toString(36).toUpperCase();
  const buerokennung = `BUERO-${kennung}`;
  const bueroPasswort = "Buero-Verwaltung-2026!";

  // Eigene Firma: die Testdateien laufen nebenlaeufig, und die Ersteinrichtung
  // des grossen Integrationstests verlangt eine unberuehrte Bestandsfirma.
  const firma = await ownerPool.query(
    `INSERT INTO companies (legal_name, display_name)
     VALUES ($1, $2)
     RETURNING id, company_number`,
    [`DATEV-Formular ${kennung} GmbH`, `DATEV-Formular ${kennung}`]
  );
  const companyId = firma.rows[0].id;
  const companyNumber = firma.rows[0].company_number;

  const buero = await ownerPool.query(
    `INSERT INTO users (company_id, personnel_number, first_name, last_name,
                        password_hash, must_change_password, status)
     VALUES ($1, $2, 'Björn', 'Büro', $3, FALSE, 'active')
     RETURNING id`,
    [companyId, buerokennung, await hashPassword(bueroPasswort)]
  );
  const bueroUserId = buero.rows[0].id;
  const bueroRolle = await ownerPool.query(
    "SELECT id FROM roles WHERE company_id = $1 AND role_key = 'office' AND status = 'active'",
    [companyId]
  );
  assert.equal(bueroRolle.rowCount, 1, "Die Buero-Rolle muss vorhanden sein");
  await ownerPool.query(
    `INSERT INTO user_roles (company_id, user_id, role_id, assigned_by_user_id, reason)
     VALUES ($1, $2, $3, $2, 'Testaufbau: Büro')`,
    [companyId, bueroUserId, bueroRolle.rows[0].id]
  );

  const monteurkennung = `MONT-${kennung}`;
  const monteurPasswort = "Monteur-Anmeldung-2026!";
  const monteur = await ownerPool.query(
    `INSERT INTO users (company_id, personnel_number, first_name, last_name,
                        password_hash, must_change_password, status)
     VALUES ($1, $2, 'Mika', 'Monteurin', $3, FALSE, 'active')
     RETURNING id`,
    [companyId, monteurkennung, await hashPassword(monteurPasswort)]
  );
  const monteurUserId = monteur.rows[0].id;
  const monteurRolle = await ownerPool.query(
    "SELECT id FROM roles WHERE company_id = $1 AND role_key = 'installer' AND status = 'active'",
    [companyId]
  );
  await ownerPool.query(
    `INSERT INTO user_roles (company_id, user_id, role_id, assigned_by_user_id, reason)
     VALUES ($1, $2, $3, $2, 'Testaufbau: Monteurin')`,
    [companyId, monteurUserId, monteurRolle.rows[0].id]
  );

  async function login(personnelNumber, password) {
    const antwort = await fetch(`${baseUrl}/api/v1/session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: config.allowedOrigin,
        // Der grosse Integrationstest schaltet zeitweise ein Pflichtupdate.
        // Ohne die eigene Fassung wiese der Server jede Anfrage mit 426 ab.
        "X-Schaefchen-Version": APPLICATION_VERSION
      },
      body: JSON.stringify({ companyNumber, personnelNumber, password })
    });
    assert.equal(antwort.status, 201, await antwort.clone().text());
    return antwort.headers.get("set-cookie").split(";", 1)[0];
  }

  const bueroCookie = await login(buerokennung, bueroPasswort);
  const monteurCookie = await login(monteurkennung, monteurPasswort);

  function alsBuero(pfad, init = {}) {
    return fetch(`${baseUrl}${pfad}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Cookie: bueroCookie,
        "X-Schaefchen-Version": APPLICATION_VERSION,
        ...(init.headers || {})
      }
    });
  }

  function alsMonteur(pfad, init = {}) {
    return fetch(`${baseUrl}${pfad}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Cookie: monteurCookie,
        "X-Schaefchen-Version": APPLICATION_VERSION,
        ...(init.headers || {})
      }
    });
  }

  await t.test("Anlegen mit und ohne DATEV-Personalnummer", async () => {
    const mitNummer = await alsBuero("/api/v1/admin/employees", {
      method: "POST",
      body: JSON.stringify({
        personnelNumber: `EMP-MIT-${kennung}`,
        firstName: "Nora",
        lastName: "Nummer",
        role: "installer",
        datevPersonnelNumber: "101",
        temporaryPassword: "Nora-Nummer-Start-2026!"
      })
    });
    assert.equal(mitNummer.status, 201, await mitNummer.clone().text());
    const mitNummerEmployee = (await mitNummer.json()).employee;
    assert.equal(mitNummerEmployee.datevPersonnelNumber, "101");

    const ohneNummer = await alsBuero("/api/v1/admin/employees", {
      method: "POST",
      body: JSON.stringify({
        personnelNumber: `EMP-OHNE-${kennung}`,
        firstName: "Otto",
        lastName: "Ohnenummer",
        role: "installer",
        temporaryPassword: "Otto-Ohnenummer-Start-2026!"
      })
    });
    assert.equal(ohneNummer.status, 201, await ohneNummer.clone().text());
    const ohneNummerEmployee = (await ohneNummer.json()).employee;
    assert.equal(ohneNummerEmployee.datevPersonnelNumber, null);

    // Der Mitarbeiterdatensatz selbst liefert die Nummer ebenfalls.
    const geladen = await alsBuero(`/api/v1/admin/overview?date=2026-09-10`);
    assert.equal(geladen.status, 200, await geladen.clone().text());
    const uebersicht = (await geladen.json()).overview;
    const eintragMitNummer = uebersicht.employees.find((zeile) => zeile.id === mitNummerEmployee.id);
    assert.equal(eintragMitNummer.datevPersonnelNumber, "101", "Die Mitarbeiterliste liefert die Nummer");
    const eintragOhneNummer = uebersicht.employees.find((zeile) => zeile.id === ohneNummerEmployee.id);
    assert.equal(eintragOhneNummer.datevPersonnelNumber, null);
  });

  await t.test("ungueltige Nummern werden abgelehnt", async () => {
    for (const ungueltig of ["0123", "123456", "M-1"]) {
      const antwort = await alsBuero("/api/v1/admin/employees", {
        method: "POST",
        body: JSON.stringify({
          personnelNumber: `EMP-BAD-${kennung}-${ungueltig}`,
          firstName: "Ungültig",
          lastName: "Nummer",
          role: "installer",
          datevPersonnelNumber: ungueltig,
          temporaryPassword: "Ungueltige-Nummer-2026!"
        })
      });
      assert.equal(antwort.status, 400, `${ungueltig} sollte abgelehnt werden`);
      const body = await antwort.json();
      assert.match(body.error.message, /DATEV-Personalnummer/);
    }
  });

  let bearbeitbar;
  await t.test("Bearbeiten: setzen, aendern, ausdruecklich loeschen", async () => {
    const angelegt = await alsBuero("/api/v1/admin/employees", {
      method: "POST",
      body: JSON.stringify({
        personnelNumber: `EMP-EDIT-${kennung}`,
        firstName: "Erika",
        lastName: "Editierbar",
        role: "installer",
        temporaryPassword: "Erika-Editierbar-2026!"
      })
    });
    assert.equal(angelegt.status, 201, await angelegt.clone().text());
    bearbeitbar = (await angelegt.json()).employee;
    assert.equal(bearbeitbar.datevPersonnelNumber, null);

    function patchInput(rowVersion, extra = {}) {
      return {
        personnelNumber: bearbeitbar.personnelNumber,
        firstName: bearbeitbar.firstName,
        lastName: bearbeitbar.lastName,
        role: "installer",
        rowVersion,
        ...extra
      };
    }

    // Setzen.
    const gesetzt = await alsBuero(`/api/v1/admin/employees/${bearbeitbar.id}`, {
      method: "PATCH",
      body: JSON.stringify(patchInput(bearbeitbar.rowVersion, { datevPersonnelNumber: "202" }))
    });
    assert.equal(gesetzt.status, 200, await gesetzt.clone().text());
    bearbeitbar = (await gesetzt.json()).employee;
    assert.equal(bearbeitbar.datevPersonnelNumber, "202");

    // Aendern.
    const geaendert = await alsBuero(`/api/v1/admin/employees/${bearbeitbar.id}`, {
      method: "PATCH",
      body: JSON.stringify(patchInput(bearbeitbar.rowVersion, { datevPersonnelNumber: "303" }))
    });
    assert.equal(geaendert.status, 200, await geaendert.clone().text());
    bearbeitbar = (await geaendert.json()).employee;
    assert.equal(bearbeitbar.datevPersonnelNumber, "303");

    // WICHTIG: Feld nicht mitgeschickt heisst "unveraendert lassen" - ein
    // alter Client, der das Feld nicht kennt, darf die Nummer nicht
    // versehentlich loeschen.
    const unveraendert = await alsBuero(`/api/v1/admin/employees/${bearbeitbar.id}`, {
      method: "PATCH",
      body: JSON.stringify(patchInput(bearbeitbar.rowVersion))
    });
    assert.equal(unveraendert.status, 200, await unveraendert.clone().text());
    bearbeitbar = (await unveraendert.json()).employee;
    assert.equal(
      bearbeitbar.datevPersonnelNumber, "303",
      "Ohne das Feld im Request bleibt die gepflegte Nummer erhalten"
    );

    // Ausdruecklich leeren (null) loescht die Nummer.
    const geloescht = await alsBuero(`/api/v1/admin/employees/${bearbeitbar.id}`, {
      method: "PATCH",
      body: JSON.stringify(patchInput(bearbeitbar.rowVersion, { datevPersonnelNumber: null }))
    });
    assert.equal(geloescht.status, 200, await geloescht.clone().text());
    bearbeitbar = (await geloescht.json()).employee;
    assert.equal(bearbeitbar.datevPersonnelNumber, null);

    // Ungueltiges Format beim Bearbeiten.
    const ungueltig = await alsBuero(`/api/v1/admin/employees/${bearbeitbar.id}`, {
      method: "PATCH",
      body: JSON.stringify(patchInput(bearbeitbar.rowVersion, { datevPersonnelNumber: "007" }))
    });
    assert.equal(ungueltig.status, 400);
    assert.match((await ungueltig.json()).error.message, /DATEV-Personalnummer/);
  });

  await t.test("Doppelvergabe ueber das Mitarbeiterformular nennt den bisherigen Inhaber", async () => {
    // Der bisherige Inhaber der Nummer "404".
    const inhaber = await alsBuero("/api/v1/admin/employees", {
      method: "POST",
      body: JSON.stringify({
        personnelNumber: `EMP-INHABER-${kennung}`,
        firstName: "Ines",
        lastName: "Inhaberin",
        role: "installer",
        datevPersonnelNumber: "404",
        temporaryPassword: "Ines-Inhaberin-Start-2026!"
      })
    });
    assert.equal(inhaber.status, 201, await inhaber.clone().text());

    // Doppelvergabe beim Anlegen.
    const doppeltBeiAnlage = await alsBuero("/api/v1/admin/employees", {
      method: "POST",
      body: JSON.stringify({
        personnelNumber: `EMP-DOPPELT-${kennung}`,
        firstName: "Dennis",
        lastName: "Doppelt",
        role: "installer",
        datevPersonnelNumber: "404",
        temporaryPassword: "Dennis-Doppelt-Start-2026!"
      })
    });
    assert.equal(doppeltBeiAnlage.status, 409, await doppeltBeiAnlage.clone().text());
    const anlageFehler = (await doppeltBeiAnlage.json()).error;
    assert.equal(anlageFehler.code, "datev_personnel_number_taken");
    assert.match(anlageFehler.message, /Ines/);
    assert.match(anlageFehler.message, new RegExp(`EMP-INHABER-${kennung}`));

    // Doppelvergabe beim Bearbeiten - derselbe Text wie ueber den
    // DATEV-Endpunkt (assertDatevPersonnelNumberFree in datev.mjs, hier
    // wiederverwendet statt nachgebaut).
    const doppeltBeimBearbeiten = await alsBuero(`/api/v1/admin/employees/${bearbeitbar.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        personnelNumber: bearbeitbar.personnelNumber,
        firstName: bearbeitbar.firstName,
        lastName: bearbeitbar.lastName,
        role: "installer",
        rowVersion: bearbeitbar.rowVersion,
        datevPersonnelNumber: "404"
      })
    });
    assert.equal(doppeltBeimBearbeiten.status, 409, await doppeltBeimBearbeiten.clone().text());
    const bearbeitenFehler = (await doppeltBeimBearbeiten.json()).error;
    assert.equal(bearbeitenFehler.code, "datev_personnel_number_taken");
    assert.match(bearbeitenFehler.message, /Ines/);
    assert.match(bearbeitenFehler.message, new RegExp(`EMP-INHABER-${kennung}`));

    // Die Nummer des bearbeiteten Mitarbeiters wurde durch den fehlgeschlagenen
    // Versuch nicht veraendert.
    const geladen = await alsBuero(`/api/v1/admin/overview?date=2026-09-10`);
    const aktuellerEintrag = (await geladen.json()).overview.employees
      .find((zeile) => zeile.id === bearbeitbar.id);
    assert.equal(aktuellerEintrag.datevPersonnelNumber, null);
  });

  await t.test("Ein Monteur darf die DATEV-Personalnummer nicht ueber das Mitarbeiterformular pflegen", async () => {
    const versuchAnlage = await alsMonteur("/api/v1/admin/employees", {
      method: "POST",
      body: JSON.stringify({
        personnelNumber: `EMP-VERBOTEN-${kennung}`,
        firstName: "Verboten",
        lastName: "Für Monteure",
        role: "installer",
        datevPersonnelNumber: "505",
        temporaryPassword: "Verboten-Start-2026!"
      })
    });
    assert.equal(versuchAnlage.status, 403);

    const versuchBearbeiten = await alsMonteur(`/api/v1/admin/employees/${bearbeitbar.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        personnelNumber: bearbeitbar.personnelNumber,
        firstName: bearbeitbar.firstName,
        lastName: bearbeitbar.lastName,
        role: "installer",
        rowVersion: bearbeitbar.rowVersion,
        datevPersonnelNumber: "505"
      })
    });
    assert.equal(versuchBearbeiten.status, 403);
  });
});
