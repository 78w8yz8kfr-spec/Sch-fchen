import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { APPLICATION_VERSION, createApp } from "../src/app.mjs";
import { createPool } from "../src/database.mjs";
import { hashPassword } from "../src/password.mjs";

// Wer allein auf einer Baustelle arbeitet, ist automatisch
// berichtsverantwortlich. Der Fall braucht eine Baustelle, auf der sonst
// niemand eingeteilt ist, deshalb bringt dieser Test seine eigenen Daten mit
// und laeuft getrennt vom grossen Integrationstest.

const enabled = process.env.API_INTEGRATION_TEST === "true";
const integrationTest = enabled ? test : test.skip;

integrationTest("Alleiniger Mitarbeiter bleibt bei Rückkehr berichtsverantwortlich", async (t) => {
  const config = {
    port: 0,
    allowedOrigin: "http://localhost:4173",
    timeZone: "Europe/Berlin",
    sessionTtlSeconds: 3600,
    cookieSecure: false,
    initialCompanyNumber: "F-000001",
    initialSetupToken: "CI-SETUP-TOKEN-2026-ONLY-TEST",
    platformSetupToken: "CI-PLATFORM-SETUP-2026-ONLY-TEST",
    rateLimitSecret: `site-foreman-rate-limit-secret-${process.pid}-${Date.now()}`,
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
  const personalnummer = `SOLO-${kennung}`;
  const passwort = "Allein-Auf-Baustelle-2026!";

  // Eigene Firma: die Testdateien laufen nebenlaeufig, und die Ersteinrichtung
  // des grossen Integrationstests verlangt eine unberuehrte Bestandsfirma.
  const firma = await ownerPool.query(
    `INSERT INTO companies (legal_name, display_name)
     VALUES ($1, $2)
     RETURNING id, company_number`,
    [`Alleinbetrieb ${kennung} GmbH`, `Alleinbetrieb ${kennung}`]
  );
  const companyId = firma.rows[0].id;
  const companyNumber = firma.rows[0].company_number;

  const benutzer = await ownerPool.query(
    `INSERT INTO users (company_id, personnel_number, first_name, last_name,
                        password_hash, must_change_password, status)
     VALUES ($1, $2, 'Solveig', 'Solo', $3, FALSE, 'active')
     RETURNING id`,
    [companyId, personalnummer, await hashPassword(passwort)]
  );
  const userId = benutzer.rows[0].id;

  const rolle = await ownerPool.query(
    "SELECT id FROM roles WHERE company_id = $1 AND role_key = 'installer' AND status = 'active'",
    [companyId]
  );
  assert.equal(rolle.rowCount, 1, "Die Rolle des Monteurs muss vorhanden sein");
  await ownerPool.query(
    `INSERT INTO user_roles (company_id, user_id, role_id, assigned_by_user_id, reason)
     VALUES ($1, $2, $3, $2, 'Testaufbau: alleiniger Mitarbeiter auf der Baustelle')`,
    [companyId, userId, rolle.rows[0].id]
  );

  // Eigener Kunde, eigenes Projekt, eigene Baustelle: entscheidend ist, dass
  // fuer den heutigen Tag niemand sonst dort eingeteilt ist.
  const kunde = await ownerPool.query(
    `INSERT INTO customers (company_id, customer_type, company_name, status)
     VALUES ($1, 'company', $2, 'active')
     RETURNING id`,
    [companyId, `Alleinkunde ${kennung} GmbH`]
  );
  const projekt = await ownerPool.query(
    `INSERT INTO projects (company_id, customer_id, name, status)
     VALUES ($1, $2, $3, 'active')
     RETURNING id`,
    [companyId, kunde.rows[0].id, `Alleinprojekt ${kennung}`]
  );
  const baustelle = await ownerPool.query(
    `INSERT INTO construction_sites (company_id, project_id, name, status)
     VALUES ($1, $2, $3, 'active')
     RETURNING id`,
    [companyId, projekt.rows[0].id, `Alleinbaustelle ${kennung}`]
  );
  const constructionSiteId = baustelle.rows[0].id;

  const anmeldung = await fetch(`${baseUrl}/api/v1/session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: config.allowedOrigin,
      // Der grosse Integrationstest schaltet zeitweise ein Pflichtupdate. Ohne
      // die eigene Fassung wiese der Server jede Anfrage mit 426 ab.
      "X-Schaefchen-Version": APPLICATION_VERSION
    },
    body: JSON.stringify({
      companyNumber,
      personnelNumber: personalnummer,
      password: passwort
    })
  });
  assert.equal(anmeldung.status, 201, await anmeldung.clone().text());
  const cookie = anmeldung.headers.get("set-cookie").split(";", 1)[0];

  const heute = new Intl.DateTimeFormat("en-CA", {
    timeZone: config.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());

  const waehleBaustelle = async (newOccurrence) => {
    const antwort = await fetch(`${baseUrl}/api/v1/time-tracking/site-selection`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
        "X-Schaefchen-Version": APPLICATION_VERSION
      },
      body: JSON.stringify({ constructionSiteId, workDate: heute, newOccurrence })
    });
    assert.equal(antwort.status, 200, await antwort.clone().text());
    return (await antwort.json()).selection.assignments
      .filter((eintrag) => eintrag.constructionSite.id === constructionSiteId);
  };

  const erste = await waehleBaustelle(false);
  assert.equal(erste.length, 1);
  assert.equal(erste[0].reportResponsible, true, "Allein auf der Baustelle heisst berichtsverantwortlich");
  assert.equal(erste[0].reportResponsibilitySource, "automatic");

  // Nach einer Unterbrechung zurueck: ein zweiter Eintrag, aber derselbe
  // Mensch. Frueher zaehlte die Pruefung Einsatzzeilen statt Menschen und
  // wertete die Rueckkehr als geaenderte Teambelegung; die automatische
  // Vorarbeiterfunktion wurde dabei wieder entzogen.
  const zweite = await waehleBaustelle(true);
  assert.equal(zweite.length, 2, "Die Rueckkehr legt einen zweiten Eintrag an");
  assert.ok(
    zweite.every((eintrag) => eintrag.reportResponsible),
    "Jeder Einsatz derselben Baustelle traegt die Berichtsverantwortung"
  );

  // In der Datenbank traegt weiterhin nur ein Eintrag das Kennzeichen. Die
  // Verantwortung gilt fuer den Menschen an diesem Tag, nicht fuer die Zeile.
  const zeilen = await ownerPool.query(
    `SELECT report_responsible FROM site_assignments
     WHERE company_id = $1 AND user_id = $2 AND construction_site_id = $3
       AND work_date = $4 AND status <> 'cancelled'
     ORDER BY sequence_number`,
    [companyId, userId, constructionSiteId, heute]
  );
  assert.equal(zeilen.rowCount, 2);
  assert.equal(
    zeilen.rows.filter((zeile) => zeile.report_responsible).length,
    1,
    "Das Kennzeichen bleibt an einem Eintrag; die Schnittstelle fasst es zusammen"
  );
});
