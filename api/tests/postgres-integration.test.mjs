import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { APPLICATION_VERSION, createApp } from "../src/app.mjs";
import { createPool } from "../src/database.mjs";
import { hashPassword } from "../src/password.mjs";
import { localDate } from "../src/validation.mjs";

const enabled = process.env.API_INTEGRATION_TEST === "true";
const integrationTest = enabled ? test : test.skip;
const frontendDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../../frontend");

function nextBusinessDate(date) {
  const value = new Date(`${date}T00:00:00Z`);
  do value.setUTCDate(value.getUTCDate() + 1);
  while ([0, 6].includes(value.getUTCDay()));
  return value.toISOString().slice(0, 10);
}

integrationTest("Login, Sitzung und idempotente Offline-Zeitbuchung funktionieren mit PostgreSQL", async (t) => {
  const suffix = Date.now().toString(36).toUpperCase();
  const personnelNumber = `API-${suffix}`;
  const password = "API-Integration-2026!";
  // Eine Fassungsnummer, die es nur in diesem Lauf gibt.
  const entwurfsVersion = `0.43.${Number(String(Date.now()).slice(-6))}`;

  const database = {
    host: process.env.POSTGRES_HOST,
    port: Number(process.env.POSTGRES_PORT || 5432),
    database: process.env.POSTGRES_DB,
    user: process.env.API_DB_USER,
    password: process.env.API_DB_PASSWORD,
    max: 4
  };
  // Getrennter Lesezugang mit Eigentümerrechten. Die API-Rolle greift nur
  // innerhalb ihrer Transaktionen mit Mandantenkontext; für die Prüfung des
  // Protokolls wird dagegen unmittelbar in die Tabellen geschaut.
  const inspectionPool = createPool({
    ...database,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD
  });

  // Der Test bringt seine eigene Firma mit.
  //
  // Vorher richtete er die mitgelieferte F-000001 ein und setzte damit
  // voraus, dass sie noch keinen einzigen Benutzer hat. Das gilt genau einmal
  // je Datenbank: ein zweiter Lauf ohne Neuaufbau scheiterte an
  // "setupRequired: false", und weil alle folgenden Abschnitte auf der
  // Anmeldung des ersten aufbauen, fielen sechzehn Prüfungen auf einmal um.
  // Wer das sah, suchte den Fehler in seiner Änderung statt im Zustand der
  // Datenbank - genau diese Fährte hat schon zweimal Zeit gekostet.
  //
  // Eine frisch angelegte Firma bekommt ihre Rollen und Module von selbst;
  // der geprüfte Weg der Ersteinrichtung bleibt derselbe. Das Logo wird
  // mitgegeben, weil der Einrichtungsbildschirm es anzeigt.
  const eigeneFirma = await inspectionPool.query(
    `INSERT INTO companies (legal_name, display_name, logo_object_key)
     VALUES ($1, $2, 'company-logos/schaaf-elektro.webp')
     RETURNING company_number`,
    [`Integrationstest ${suffix} GmbH`, `Integrationstest ${suffix}`]
  );
  const companyNumber = eigeneFirma.rows[0].company_number;

  const config = {
    port: 0,
    allowedOrigin: "http://localhost:4173",
    timeZone: "Europe/Berlin",
    sessionTtlSeconds: 3600,
    cookieSecure: false,
    initialCompanyNumber: companyNumber,
    initialSetupToken: "CI-SETUP-TOKEN-2026-ONLY-TEST",
    platformSetupToken: "CI-PLATFORM-SETUP-2026-ONLY-TEST",
    staticDirectory: frontendDirectory,
    database
  };
  const apiPool = createPool(config.database);
  const server = createServer(createApp({ pool: apiPool, config, logger: { error() {} } }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await apiPool.end();
    await inspectionPool.end();
  });

  // Bindungen, die spätere Abschnitte weiterverwenden. Die Abschnitte
  // bauen bewusst aufeinander auf: ein Stundenzettel braucht den Einsatz,
  // der Einsatz die Baustelle und die Baustelle den Mitarbeiter.
  let setup, cookie, session, platformCookie;
  let tenantCompany, assignmentDate, employeePersonnelNumber, employeeTemporaryPassword;
  let employeePassword, foremanPersonnelNumber, foremanTemporaryPassword, foremanPassword;
  let plannerCookie, directorCookie, activatedVde, projectManager, director;
  let projectManagerCookie, employee, foreman, updatedEditableEmployee;
  let customer, updatedCustomer, project, updatedProject;
  let structuredSite, foremanCookie, clientReportId, mobileReport;
  let siteTask, completedSiteTask, siteMaterial, adminNote;
  let mobileNote, documentContent, uploadedDocument, hiddenDocument;
  let siteReport, signatureData, site, assignment;
  let installerTask, employeeCookie, assignments, workDate;
  let workDay;

  await t.test("Ersteinrichtung, Anmeldung und Sitzung", async () => {
    const appShell = await fetch(`${baseUrl}/`);
    assert.equal(appShell.status, 200);
    assert.match(appShell.headers.get("content-security-policy"), /default-src 'self'/);
    assert.match(await appShell.text(), /id="setup-form"/);

    const appScript = await fetch(`${baseUrl}/app.js`);
    assert.equal(appScript.status, 200);
    assert.match(appScript.headers.get("content-type"), /text\/javascript/);

    const vdeAppShell = await fetch(`${baseUrl}/vde/index.html`);
    assert.equal(vdeAppShell.status, 200);
    assert.match(await vdeAppShell.text(), /id="inspection-form"/);
    const vdeAppScript = await fetch(`${baseUrl}/vde/app.js`);
    assert.equal(vdeAppScript.status, 200);
    assert.match(vdeAppScript.headers.get("content-type"), /text\/javascript/);

    const siteTemplate = await fetch(`${baseUrl}/assets/baustellen-import-vorlage.xlsx`);
    assert.equal(siteTemplate.status, 200);
    assert.match(siteTemplate.headers.get("content-type"), /spreadsheetml/);
    assert.deepEqual([...new Uint8Array(await siteTemplate.arrayBuffer()).slice(0, 2)], [0x50, 0x4b]);

    const setupStatus = await fetch(`${baseUrl}/api/v1/setup`);
    assert.equal(setupStatus.status, 200);
    const setupStatusBody = await setupStatus.json();
    assert.equal(setupStatusBody.setup.setupRequired, true);
    assert.equal(setupStatusBody.setup.logoUrl, "./assets/company-logos/schaaf-elektro.webp");

    const companyLogo = await fetch(`${baseUrl}/assets/company-logos/schaaf-elektro.webp`);
    assert.equal(companyLogo.status, 200);
    assert.match(companyLogo.headers.get("content-type"), /image\/webp/);
    const companyLogoBytes = new Uint8Array(await companyLogo.arrayBuffer());
    assert.equal(new TextDecoder().decode(companyLogoBytes.slice(0, 4)), "RIFF");
    assert.equal(new TextDecoder().decode(companyLogoBytes.slice(8, 12)), "WEBP");

    setup = await fetch(`${baseUrl}/api/v1/setup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        setupToken: config.initialSetupToken,
        personnelNumber,
        firstName: "API",
        lastName: "Integration",
        password
      })
    });
    assert.equal(setup.status, 201, await setup.text());

    const login = await fetch(`${baseUrl}/api/v1/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: config.allowedOrigin },
      body: JSON.stringify({ companyNumber, personnelNumber, password })
    });
    assert.equal(login.status, 201);
    cookie = login.headers.get("set-cookie").split(";", 1)[0];
    const loginBody = await login.json();
    assert.equal(loginBody.session.company.number, companyNumber);
    assert.equal(loginBody.session.company.logoUrl, "./assets/company-logos/schaaf-elektro.webp");
    assert.deepEqual(loginBody.session.user.roles, ["admin"]);

    session = await fetch(`${baseUrl}/api/v1/session`, { headers: { Cookie: cookie } });
    assert.equal(session.status, 200);
  });

  await t.test("Getrennte Plattformverwaltung", async () => {
    const platformShell = await fetch(`${baseUrl}/platform-admin.html`);
    assert.equal(platformShell.status, 200);
    assert.match(await platformShell.text(), /id="platform-navigation"/);
    // Die Plattformverwaltung wird einmal je Installation eingerichtet, nicht
    // je Firma - anders als der Mandant kann der Test sie sich nicht selbst
    // mitbringen. Beim ersten Lauf gegen eine frische Datenbank geht er den
    // Weg der Ersteinrichtung; danach legt er sein Konto unmittelbar an. In
    // beiden Faellen prueft er, dass ein zweiter Aufruf abgewiesen wird.
    const platformEinrichtung = await fetch(`${baseUrl}/api/v1/platform/setup`);
    assert.equal(platformEinrichtung.status, 200);
    const platformOffen = (await platformEinrichtung.json()).setup.setupRequired;

    if (platformOffen) {
      const platformSetup = await fetch(`${baseUrl}/api/v1/platform/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          setupToken: config.platformSetupToken,
          firstName: "Sina",
          lastName: "System",
          email: `platform-${suffix.toLowerCase()}@example.test`,
          password: "Plattform-Integration-2026!"
        })
      });
      assert.equal(platformSetup.status, 201, await platformSetup.clone().text());
    } else {
      const konto = await inspectionPool.query(
        `INSERT INTO platform_users (first_name, last_name, email, password_hash)
         VALUES ('Sina', 'System', $1, $2) RETURNING id`,
        [`platform-${suffix.toLowerCase()}@example.test`, await hashPassword("Plattform-Integration-2026!")]
      );
      await inspectionPool.query(
        `INSERT INTO platform_user_roles (platform_user_id, platform_role_id, reason)
         SELECT $1, id, 'Aufbau des Integrationstests'
         FROM platform_roles WHERE role_key = 'superadmin'`,
        [konto.rows[0].id]
      );
    }

    // Eingerichtet wird genau einmal. Danach ist der Weg verschlossen, egal
    // wer den Schluessel hat.
    const zweiteEinrichtung = await fetch(`${baseUrl}/api/v1/platform/setup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        setupToken: config.platformSetupToken,
        firstName: "Zweite",
        lastName: "Einrichtung",
        email: `zweite-${suffix.toLowerCase()}@example.test`,
        password: "Plattform-Integration-2026!"
      })
    });
    assert.equal(zweiteEinrichtung.status, 409, await zweiteEinrichtung.clone().text());
    assert.equal((await zweiteEinrichtung.json()).error.code, "setup_completed");

    const platformLogin = await fetch(`${baseUrl}/api/v1/platform/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: `platform-${suffix.toLowerCase()}@example.test`,
        password: "Plattform-Integration-2026!"
      })
    });
    assert.equal(platformLogin.status, 201, await platformLogin.clone().text());
    platformCookie = platformLogin.headers.get("set-cookie").split(";", 1)[0];
    const platformSession = (await platformLogin.json()).session;
    assert.deepEqual(platformSession.platformUser.roles, ["superadmin"]);
    assert.equal(Object.hasOwn(platformSession.platformUser, "company"), false);

    const platformOverviewResponse = await fetch(`${baseUrl}/api/v1/platform/overview`, {
      headers: { Cookie: platformCookie }
    });
    assert.equal(platformOverviewResponse.status, 200);
    const platformOverview = (await platformOverviewResponse.json()).overview;
    assert.ok(platformOverview.companiesTotal >= 1);
    assert.equal(Object.hasOwn(platformOverview, "runningConstructionSites"), false);
    assert.equal(Object.hasOwn(platformOverview, "workMinutes"), false);

    const platformCompaniesResponse = await fetch(
      `${baseUrl}/api/v1/platform/companies?search=${companyNumber}`,
      { headers: { Cookie: platformCookie } }
    );
    assert.equal(platformCompaniesResponse.status, 200);
    tenantCompany = (await platformCompaniesResponse.json()).companies.items
      .find((company) => company.companyNumber === companyNumber);
    assert.ok(tenantCompany);

    const registrationResponse = await fetch(`${baseUrl}/api/v1/platform/registrations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: platformCookie },
      body: JSON.stringify({
        legalName: `Einladung ${suffix} GmbH`,
        displayName: `Einladung ${suffix}`,
        contactName: "Rita Registrierung",
        contactEmail: `registrierung-${suffix.toLowerCase()}@example.test`,
        planKey: "standard",
        expiresInDays: 7,
        reason: "Registrierungseinladung und sichere Token-Ausgabe prüfen"
      })
    });
    assert.equal(registrationResponse.status, 201, await registrationResponse.clone().text());
    const registrationBody = await registrationResponse.json();
    assert.ok(registrationBody.invitationToken);
    assert.equal(Object.hasOwn(registrationBody.registration, "invitationTokenHash"), false);

    const integrationPlanResponse = await fetch(`${baseUrl}/api/v1/platform/plans`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: platformCookie },
      body: JSON.stringify({
        key: `integration_${suffix.toLowerCase()}`,
        name: "Integrationstarif",
        status: "draft",
        description: "Unveränderbarer Tarifstand für den Integrationstest",
        reason: "Tarifverwaltung im PostgreSQL-Integrationstest prüfen"
      })
    });
    assert.equal(integrationPlanResponse.status, 201, await integrationPlanResponse.clone().text());
    const integrationPlan = (await integrationPlanResponse.json()).plan;
    const updatePlanResponse = await fetch(
      `${baseUrl}/api/v1/platform/plans/${integrationPlan.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: platformCookie },
        body: JSON.stringify({
          name: "Integrationstarif aktualisiert",
          status: "active",
          description: "Aktualisierte Stammdaten ohne Änderung bestehender Verträge",
          rowVersion: integrationPlan.rowVersion,
          reason: "Tarif-Stammdaten im Integrationstest ändern"
        })
      }
    );
    assert.equal(updatePlanResponse.status, 200, await updatePlanResponse.clone().text());
    assert.equal((await updatePlanResponse.json()).plan.status, "active");

    const supportTicketResponse = await fetch(
      `${baseUrl}/api/v1/platform/support/tickets`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: platformCookie },
        body: JSON.stringify({
          companyId: tenantCompany.id,
          contactName: "API Integration",
          contactEmail: "integration@example.test",
          category: "technical",
          priority: "high",
          subject: "Supportmodus prüfen",
          description: "Zeitlich begrenzten, protokollierten Supportzugriff testen.",
          reason: "Supportfall im PostgreSQL-Integrationstest anlegen"
        })
      }
    );
    assert.equal(supportTicketResponse.status, 201, await supportTicketResponse.clone().text());
    const supportTicket = (await supportTicketResponse.json()).ticket;
    const supportAccessResponse = await fetch(`${baseUrl}/api/v1/platform/support-access`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: platformCookie },
      body: JSON.stringify({
        companyId: tenantCompany.id,
        supportTicketId: supportTicket.id,
        reasonCode: "technical_analysis",
        reasonDetail: "Technische Fehleranalyse im PostgreSQL-Integrationstest"
      })
    });
    assert.equal(supportAccessResponse.status, 201, await supportAccessResponse.clone().text());
    const supportAccess = (await supportAccessResponse.json()).supportAccess;
    const supportContextResponse = await fetch(
      `${baseUrl}/api/v1/platform/support-access/${supportAccess.id}/context`,
      { headers: { Cookie: platformCookie, "X-Support-Access-Id": supportAccess.id } }
    );
    assert.equal(supportContextResponse.status, 200, await supportContextResponse.clone().text());
    const supportContext = await supportContextResponse.json();
    assert.equal(supportContext.company.id, tenantCompany.id);
    assert.equal(Object.hasOwn(supportContext, "timeEntries"), false);
    const supportEndResponse = await fetch(
      `${baseUrl}/api/v1/platform/support-access/${supportAccess.id}/end`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: platformCookie,
          "X-Support-Access-Id": supportAccess.id
        },
        body: JSON.stringify({ reason: "Supportmodus im Integrationstest bewusst beenden" })
      }
    );
    assert.equal(supportEndResponse.status, 200, await supportEndResponse.clone().text());
    const endedSupportContext = await fetch(
      `${baseUrl}/api/v1/platform/support-access/${supportAccess.id}/context`,
      { headers: { Cookie: platformCookie, "X-Support-Access-Id": supportAccess.id } }
    );
    assert.equal(endedSupportContext.status, 409);
    assert.equal((await endedSupportContext.json()).error.code, "support_access_inactive");

    const versionListResponse = await fetch(`${baseUrl}/api/v1/platform/versions`, {
      headers: { Cookie: platformCookie }
    });
    assert.equal(versionListResponse.status, 200, await versionListResponse.clone().text());
    const productionVersion = (await versionListResponse.json()).versions
      .find((version) => version.releaseStatus === "production");
    // Der Produktionsstand in der Datenbank und die Fassung des Servers muessen
    // zusammenpassen. Ein fester Wert an dieser Stelle waere bei jeder neuen
    // Fassung falsch geworden, ohne dass etwas kaputt gewesen waere.
    assert.equal(productionVersion.version, APPLICATION_VERSION);
    const requireUpdateResponse = await fetch(
      `${baseUrl}/api/v1/platform/versions/${productionVersion.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: platformCookie },
        body: JSON.stringify({
          mandatoryUpdate: true,
          confirmation: productionVersion.version,
          reason: "Pflichtupdate im PostgreSQL-Integrationstest einschalten"
        })
      }
    );
    assert.equal(requireUpdateResponse.status, 200, await requireUpdateResponse.clone().text());
    await new Promise((resolve) => setTimeout(resolve, 2100));
    const outdatedSessionResponse = await fetch(`${baseUrl}/api/v1/session`, {
      headers: { Cookie: cookie, "X-Schaefchen-Version": "0.41.0" }
    });
    assert.equal(outdatedSessionResponse.status, 426);
    assert.equal((await outdatedSessionResponse.json()).error.code, "mandatory_update");
    const currentSessionResponse = await fetch(`${baseUrl}/api/v1/session`, {
      headers: { Cookie: cookie, "X-Schaefchen-Version": APPLICATION_VERSION }
    });
    assert.equal(currentSessionResponse.status, 200);
    const releaseUpdateResponse = await fetch(
      `${baseUrl}/api/v1/platform/versions/${productionVersion.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: platformCookie },
        body: JSON.stringify({
          mandatoryUpdate: false,
          confirmation: productionVersion.version,
          reason: "Pflichtupdate nach dem PostgreSQL-Integrationstest ausschalten"
        })
      }
    );
    assert.equal(releaseUpdateResponse.status, 200, await releaseUpdateResponse.clone().text());
    await new Promise((resolve) => setTimeout(resolve, 2100));

    const maintenanceOnResponse = await fetch(
      `${baseUrl}/api/v1/platform/settings/maintenance.enabled`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: platformCookie },
        body: JSON.stringify({
          value: true,
          reason: "Wartungsmodus im PostgreSQL-Integrationstest einschalten"
        })
      }
    );
    assert.equal(maintenanceOnResponse.status, 200, await maintenanceOnResponse.clone().text());
    await new Promise((resolve) => setTimeout(resolve, 2100));
    const maintenanceBlockedResponse = await fetch(`${baseUrl}/api/v1/session`, {
      headers: { Cookie: cookie, "X-Schaefchen-Version": APPLICATION_VERSION }
    });
    assert.equal(maintenanceBlockedResponse.status, 503);
    assert.equal((await maintenanceBlockedResponse.json()).error.code, "maintenance_mode");
    const platformDuringMaintenanceResponse = await fetch(
      `${baseUrl}/api/v1/platform/overview`,
      { headers: { Cookie: platformCookie } }
    );
    assert.equal(platformDuringMaintenanceResponse.status, 200);
    const maintenanceOffResponse = await fetch(
      `${baseUrl}/api/v1/platform/settings/maintenance.enabled`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: platformCookie },
        body: JSON.stringify({
          value: false,
          reason: "Wartungsmodus nach dem PostgreSQL-Integrationstest ausschalten"
        })
      }
    );
    assert.equal(maintenanceOffResponse.status, 200, await maintenanceOffResponse.clone().text());
    await new Promise((resolve) => setTimeout(resolve, 2100));

    const platformAuditResponse = await fetch(`${baseUrl}/api/v1/platform/audit`, {
      headers: { Cookie: platformCookie }
    });
    assert.equal(platformAuditResponse.status, 200, await platformAuditResponse.clone().text());
    const platformAudit = (await platformAuditResponse.json()).audit;
    assert.ok(platformAudit.some((entry) => entry.action === "support.access_start"));
    assert.ok(platformAudit.some((entry) => entry.action === "support.access_end"));
    assert.ok(platformAudit.some((entry) => entry.action === "setting.update"));
  });

  await t.test("Firmenkonten, Rollen und Berechtigungen", async () => {
    assignmentDate = localDate(new Date().toISOString(), config.timeZone);
    employeePersonnelNumber = `MON-${suffix}`;
    employeeTemporaryPassword = "Montage-Start-2026!";
    employeePassword = "Montage-Eigen-2026!";
    foremanPersonnelNumber = `VA-${suffix}`;
    foremanTemporaryPassword = "Vorarbeiter-Start-2026!";
    foremanPassword = "Vorarbeiter-Eigen-2026!";
    const plannerPersonnelNumber = `PLAN-${suffix}`;
    const plannerTemporaryPassword = "Planung-Start-2026!";
    const plannerPassword = "Planung-Eigen-2026!";
    const directorPersonnelNumber = `GF-${suffix}`;
    const directorTemporaryPassword = "Leitung-Start-2026!";
    const directorPassword = "Leitung-Eigen-2026!";
    const projectManagerPersonnelNumber = `PL-${suffix}`;
    const projectManagerTemporaryPassword = "Projektleitung-Start-2026!";
    const projectManagerPassword = "Projektleitung-Eigen-2026!";

    const initialOverview = await fetch(
      `${baseUrl}/api/v1/admin/overview?date=${assignmentDate}`,
      { headers: { Cookie: cookie } }
    );
    assert.equal(initialOverview.status, 200, await initialOverview.clone().text());
    assert.equal((await initialOverview.json()).overview.canCreateManagementRoles, true);

    const plannerResponse = await fetch(`${baseUrl}/api/v1/admin/employees`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        personnelNumber: plannerPersonnelNumber,
        firstName: "Paula",
        lastName: "Planung",
        role: "dispatch_office",
        temporaryPassword: plannerTemporaryPassword
      })
    });
    assert.equal(plannerResponse.status, 201, await plannerResponse.clone().text());
    assert.deepEqual((await plannerResponse.json()).employee.roles, ["dispatch_office"]);

    const plannerLogin = await fetch(`${baseUrl}/api/v1/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: config.allowedOrigin },
      body: JSON.stringify({
        companyNumber,
        personnelNumber: plannerPersonnelNumber,
        password: plannerTemporaryPassword
      })
    });
    assert.equal(plannerLogin.status, 201);
    plannerCookie = plannerLogin.headers.get("set-cookie").split(";", 1)[0];
    const plannerPasswordChange = await fetch(`${baseUrl}/api/v1/account/initial-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: plannerCookie },
      body: JSON.stringify({ newPassword: plannerPassword })
    });
    assert.equal(plannerPasswordChange.status, 200);

    const plannerOverview = await fetch(
      `${baseUrl}/api/v1/admin/overview?date=${assignmentDate}`,
      { headers: { Cookie: plannerCookie } }
    );
    assert.equal(plannerOverview.status, 200);
    assert.equal((await plannerOverview.json()).overview.canCreateManagementRoles, false);

    const forbiddenManagementRole = await fetch(`${baseUrl}/api/v1/admin/employees`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: plannerCookie },
      body: JSON.stringify({
        personnelNumber: `PL-${suffix}`,
        firstName: "Nicht",
        lastName: "Erlaubt",
        role: "project_manager",
        temporaryPassword: "Nicht-Erlaubt-2026!"
      })
    });
    assert.equal(forbiddenManagementRole.status, 403);

    const directorResponse = await fetch(`${baseUrl}/api/v1/admin/employees`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        personnelNumber: directorPersonnelNumber,
        firstName: "Gesa",
        lastName: "Geschäftsführung",
        role: "managing_director",
        temporaryPassword: directorTemporaryPassword
      })
    });
    assert.equal(directorResponse.status, 201, await directorResponse.clone().text());
    director = (await directorResponse.clone().json()).employee;

    const directorLogin = await fetch(`${baseUrl}/api/v1/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: config.allowedOrigin },
      body: JSON.stringify({
        companyNumber,
        personnelNumber: directorPersonnelNumber,
        password: directorTemporaryPassword
      })
    });
    assert.equal(directorLogin.status, 201);
    directorCookie = directorLogin.headers.get("set-cookie").split(";", 1)[0];
    const directorPasswordChange = await fetch(`${baseUrl}/api/v1/account/initial-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: directorCookie },
      body: JSON.stringify({ newPassword: directorPassword })
    });
    assert.equal(directorPasswordChange.status, 200);

    // Eine Firma schaltet ihre Bereiche nicht selbst. Was sie nutzen darf,
    // gehoert zum verkauften Umfang; darueber entscheidet allein die
    // Plattformverwaltung. Der frueher vorhandene Weg der Firma ist entfallen.
    const moduleView = async (sessionCookie) => {
      const antwort = await fetch(`${baseUrl}/api/v1/session`, {
        headers: { Cookie: sessionCookie }
      });
      assert.equal(antwort.status, 200);
      return (await antwort.json()).session.modules;
    };

    for (const [methode, pfad] of [
      ["GET", "/api/v1/admin/modules"],
      ["PATCH", "/api/v1/admin/modules/vde"],
      ["PATCH", "/api/v1/admin/modules/time_tracking"]
    ]) {
      const versuch = await fetch(`${baseUrl}${pfad}`, {
        method: methode,
        headers: { "Content-Type": "application/json", Cookie: directorCookie },
        body: methode === "GET" ? undefined : JSON.stringify({ enabled: false, rowVersion: 0 })
      });
      assert.equal(versuch.status, 404, `${methode} ${pfad} antwortet noch`);
    }

    const initialModules = await moduleView(cookie);
    // Die Bereiche stammen aus dem Modulkatalog der Plattform. Der Kern und
    // Bereiche, die es noch nicht gibt, stehen nicht darin.
    assert.deepEqual(
      Object.keys(initialModules).sort(),
      [
        "absences", "apprentice_reports", "assembly_reports", "devices",
        "documents", "fleet", "materials", "site_daily_reports", "site_qr", "vde"
      ]
    );
    // Der Standardumfang steht ohne Zutun offen. Das Spezialmodul VDE und das
    // Berichtsheft gehoeren nicht dazu: beide gibt die Plattform je Firma frei,
    // VDE als Spezialmodul, das Berichtsheft als eigener verkaufter Bereich.
    assert.equal(initialModules.vde, false);
    assert.equal(initialModules.apprentice_reports, false);
    assert.ok(
      Object.entries(initialModules)
        .filter(([key]) => !["vde", "apprentice_reports"].includes(key))
        .every(([, enabled]) => enabled === true)
    );

    const platformVdeActivation = await fetch(
      `${baseUrl}/api/v1/platform/companies/${tenantCompany.id}/modules/vde`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: platformCookie },
        body: JSON.stringify({
          status: "permanent",
          includedInPlan: false,
          separatelyBilled: true,
          featureScope: {},
          reason: "VDE für den PostgreSQL-Integrationstest freischalten"
        })
      }
    );
    assert.equal(platformVdeActivation.status, 200, await platformVdeActivation.clone().text());
    activatedVde = (await platformVdeActivation.json()).entitlement;
    assert.equal(activatedVde.entitlementStatus, "permanent");

    assert.equal((await moduleView(cookie)).vde, true);

    const directorOverview = await fetch(
      `${baseUrl}/api/v1/admin/overview?date=${assignmentDate}`,
      { headers: { Cookie: directorCookie } }
    );
    assert.equal(directorOverview.status, 200);
    const directorOverviewBody = (await directorOverview.json()).overview;
    assert.equal(directorOverviewBody.canCreateManagementRoles, true);
    assert.equal(directorOverviewBody.canApproveAbsenceManagement, true);

    const directorCreatesProjectManager = await fetch(`${baseUrl}/api/v1/admin/employees`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: directorCookie },
      body: JSON.stringify({
        personnelNumber: projectManagerPersonnelNumber,
        firstName: "Petra",
        lastName: "Projektleitung",
        role: "project_manager",
        temporaryPassword: projectManagerTemporaryPassword
      })
    });
    assert.equal(directorCreatesProjectManager.status, 201, await directorCreatesProjectManager.clone().text());
    projectManager = (await directorCreatesProjectManager.json()).employee;

    const projectManagerLogin = await fetch(`${baseUrl}/api/v1/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: config.allowedOrigin },
      body: JSON.stringify({
        companyNumber,
        personnelNumber: projectManagerPersonnelNumber,
        password: projectManagerTemporaryPassword
      })
    });
    assert.equal(projectManagerLogin.status, 201);
    projectManagerCookie = projectManagerLogin.headers.get("set-cookie").split(";", 1)[0];
    const projectManagerPasswordChange = await fetch(
      `${baseUrl}/api/v1/account/initial-password`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: projectManagerCookie },
        body: JSON.stringify({ newPassword: projectManagerPassword })
      }
    );
    assert.equal(projectManagerPasswordChange.status, 200);
  });

  await t.test("Mitarbeiter, Baustellen, Einsätze und Berichte", async () => {
    const employeeResponse = await fetch(`${baseUrl}/api/v1/admin/employees`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: plannerCookie },
      body: JSON.stringify({
        personnelNumber: employeePersonnelNumber,
        firstName: "Mara",
        lastName: "Montage",
        email: "mara.montage@example.test",
        phone: "+49 170 1234567",
        role: "installer",
        temporaryPassword: employeeTemporaryPassword
      })
    });
    assert.equal(employeeResponse.status, 201);
    employee = (await employeeResponse.json()).employee;
    assert.equal(employee.mustChangePassword, true);
    assert.equal(employee.email, "mara.montage@example.test");
    assert.equal(employee.phone, "+49 170 1234567");
    assert.deepEqual(employee.roles, ["installer"]);

    const duplicateEmployeeEmailResponse = await fetch(`${baseUrl}/api/v1/admin/employees`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: plannerCookie },
      body: JSON.stringify({
        personnelNumber: `DUP-MAIL-${suffix}`,
        firstName: "Doppelte",
        lastName: "Adresse",
        email: "MARA.MONTAGE@EXAMPLE.TEST",
        role: "installer",
        temporaryPassword: "Doppelte-Adresse-2026!"
      })
    });
    assert.equal(duplicateEmployeeEmailResponse.status, 409);
    assert.equal(
      (await duplicateEmployeeEmailResponse.json()).error.code,
      "employee_email_exists"
    );

    const foremanResponse = await fetch(`${baseUrl}/api/v1/admin/employees`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: plannerCookie },
      body: JSON.stringify({
        personnelNumber: foremanPersonnelNumber,
        firstName: "Vera",
        lastName: "Vorarbeiterin",
        role: "foreman",
        temporaryPassword: foremanTemporaryPassword
      })
    });
    assert.equal(foremanResponse.status, 201, await foremanResponse.clone().text());
    foreman = (await foremanResponse.json()).employee;
    assert.deepEqual(foreman.roles, ["foreman"]);

    const editableEmployeeResponse = await fetch(`${baseUrl}/api/v1/admin/employees`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: plannerCookie },
      body: JSON.stringify({
        personnelNumber: `EDIT-${suffix}`,
        firstName: "Editierbar",
        lastName: "Montage",
        role: "installer",
        temporaryPassword: "Bearbeitung-Start-2026!"
      })
    });
    assert.equal(
      editableEmployeeResponse.status,
      201,
      await editableEmployeeResponse.clone().text()
    );
    const editableEmployee = (await editableEmployeeResponse.json()).employee;
    const employeeUpdateResponse = await fetch(
      `${baseUrl}/api/v1/admin/employees/${editableEmployee.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: plannerCookie },
        body: JSON.stringify({
          personnelNumber: editableEmployee.personnelNumber,
          firstName: "Erika",
          lastName: "Vorarbeiterin",
          email: "erika.vorarbeiterin@example.test",
          phone: "+49 171 7654321",
          role: "foreman",
          rowVersion: editableEmployee.rowVersion
        })
      }
    );
    assert.equal(employeeUpdateResponse.status, 200, await employeeUpdateResponse.clone().text());
    updatedEditableEmployee = (await employeeUpdateResponse.json()).employee;
    assert.equal(updatedEditableEmployee.firstName, "Erika");
    assert.equal(updatedEditableEmployee.email, "erika.vorarbeiterin@example.test");
    assert.equal(updatedEditableEmployee.phone, "+49 171 7654321");
    assert.deepEqual(updatedEditableEmployee.roles, ["foreman"]);
    assert.ok(updatedEditableEmployee.rowVersion > editableEmployee.rowVersion);

    const customerResponse = await fetch(`${baseUrl}/api/v1/admin/customers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: plannerCookie },
      body: JSON.stringify({
        customerType: "company",
        companyName: `Struktur Kunde ${suffix} GmbH`,
        email: "struktur@example.invalid",
        street: "Kundenweg",
        houseNumber: "3",
        postalCode: "12345",
        city: "Teststadt"
      })
    });
    assert.equal(customerResponse.status, 201, await customerResponse.clone().text());
    customer = (await customerResponse.json()).customer;
    assert.match(customer.number, /^SE-K-\d{5}$/);
    assert.equal(customer.status, "active");
    assert.equal(customer.rowVersion, 1);

    const customerUpdateResponse = await fetch(
      `${baseUrl}/api/v1/admin/customers/${customer.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: plannerCookie },
        body: JSON.stringify({
          customerType: customer.type,
          companyName: customer.companyName,
          firstName: customer.firstName,
          lastName: customer.lastName,
          email: "verwaltung@example.invalid",
          phone: "+49 123 456789",
          street: customer.address.street,
          houseNumber: customer.address.houseNumber,
          postalCode: customer.address.postalCode,
          city: customer.address.city,
          status: "active",
          rowVersion: customer.rowVersion
        })
      }
    );
    assert.equal(customerUpdateResponse.status, 200, await customerUpdateResponse.clone().text());
    updatedCustomer = (await customerUpdateResponse.json()).customer;
    assert.equal(updatedCustomer.email, "verwaltung@example.invalid");
    assert.equal(updatedCustomer.rowVersion, 2);

    const projectResponse = await fetch(`${baseUrl}/api/v1/admin/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: plannerCookie },
      body: JSON.stringify({
        customerId: customer.id,
        name: `Struktur Projekt ${suffix}`,
        installerShortText: "Elektroinstallation",
        projectManagerId: projectManager.id
      })
    });
    assert.equal(projectResponse.status, 201, await projectResponse.clone().text());
    project = (await projectResponse.json()).project;
    assert.equal(project.customerId, customer.id);
    assert.match(project.number, /^SE-\d{4}-\d{4}$/);
    assert.equal(project.rowVersion, 1);
    assert.equal(project.projectManagerId, projectManager.id);
    assert.equal(project.projectManagerName, "Petra Projektleitung");

    const projectUpdateResponse = await fetch(
      `${baseUrl}/api/v1/admin/projects/${project.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: plannerCookie },
        body: JSON.stringify({
          name: `${project.name} aktualisiert`,
          installerShortText: "Elektroinstallation und Dokumentation",
          status: "active",
          rowVersion: project.rowVersion
        })
      }
    );
    assert.equal(projectUpdateResponse.status, 200, await projectUpdateResponse.clone().text());
    updatedProject = (await projectUpdateResponse.json()).project;
    assert.equal(updatedProject.shortText, "Elektroinstallation und Dokumentation");
    assert.equal(updatedProject.rowVersion, 2);

    const structuredSiteResponse = await fetch(`${baseUrl}/api/v1/admin/construction-sites`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: plannerCookie },
      body: JSON.stringify({
        projectId: project.id,
        name: `Struktur Baustelle ${suffix}`,
        installerShortText: "Unterverteilung montieren",
        street: "Baustellenweg",
        houseNumber: "8",
        postalCode: "12345",
        city: "Teststadt"
      })
    });
    assert.equal(structuredSiteResponse.status, 201, await structuredSiteResponse.clone().text());
    structuredSite = (await structuredSiteResponse.json()).site;
    assert.equal(structuredSite.projectId, project.id);
    assert.equal(structuredSite.customerId, customer.id);
    assert.deepEqual(structuredSite.projectManagerIds, [projectManager.id]);
    assert.equal(structuredSite.status, "active");
    assert.equal(structuredSite.rowVersion, 1);

    const directSiteResponse = await fetch(`${baseUrl}/api/v1/admin/construction-sites`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: plannerCookie },
      body: JSON.stringify({
        customerId: customer.id,
        name: `Direkte Baustelle ${suffix}`,
        installerShortText: "Ohne sichtbare Projektebene angelegt",
        street: "Direktweg",
        houseNumber: "9",
        postalCode: "12345",
        city: "Teststadt"
      })
    });
    assert.equal(directSiteResponse.status, 201, await directSiteResponse.clone().text());
    const directSite = (await directSiteResponse.json()).site;
    assert.equal(directSite.customerId, customer.id);
    assert.equal(directSite.projectName, "Baustellen");
    assert.notEqual(directSite.projectId, project.id);

    const projectManagerOverviewResponse = await fetch(
      `${baseUrl}/api/v1/admin/overview?date=${assignmentDate}`,
      { headers: { Cookie: projectManagerCookie } }
    );
    assert.equal(
      projectManagerOverviewResponse.status,
      200,
      await projectManagerOverviewResponse.clone().text()
    );
    const projectManagerOverview = (await projectManagerOverviewResponse.json()).overview;
    assert.equal(projectManagerOverview.projectScopeRestricted, true);
    assert.deepEqual(projectManagerOverview.projects.map((entry) => entry.id), [project.id]);
    assert.deepEqual(projectManagerOverview.sites.map((entry) => entry.id), [structuredSite.id]);
    assert.deepEqual(projectManagerOverview.customers.map((entry) => entry.id), [customer.id]);
    assert.equal(projectManagerOverview.canReviewAbsenceOffice, false);
    assert.deepEqual(projectManagerOverview.workDays, []);
    assert.deepEqual(projectManagerOverview.timeCorrections, []);
    assert.deepEqual(projectManagerOverview.absences, []);

    const forbiddenProjectManagerEmployeeCreate = await fetch(
      `${baseUrl}/api/v1/admin/employees`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: projectManagerCookie },
        body: JSON.stringify({
          personnelNumber: `PM-FORBIDDEN-${suffix}`,
          firstName: "Nicht",
          lastName: "Anlegbar",
          role: "installer",
          temporaryPassword: "Nicht-Anlegbar-2026!"
        })
      }
    );
    assert.equal(forbiddenProjectManagerEmployeeCreate.status, 403);
    assert.equal(
      (await forbiddenProjectManagerEmployeeCreate.json()).error.code,
      "global_planning_forbidden"
    );

    const forbiddenProjectManagerQr = await fetch(
      `${baseUrl}/api/v1/admin/construction-sites/${directSite.id}/qr`,
      { headers: { Cookie: projectManagerCookie } }
    );
    assert.equal(forbiddenProjectManagerQr.status, 403);
    assert.equal(
      (await forbiddenProjectManagerQr.json()).error.code,
      "site_project_access_forbidden"
    );

    const assignedProjectManagerQr = await fetch(
      `${baseUrl}/api/v1/admin/construction-sites/${structuredSite.id}/qr`,
      { headers: { Cookie: projectManagerCookie } }
    );
    assert.equal(assignedProjectManagerQr.status, 200);
    assert.match(assignedProjectManagerQr.headers.get("content-type"), /image\/svg\+xml/);

    const editedForemanAssignmentResponse = await fetch(`${baseUrl}/api/v1/admin/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: plannerCookie },
      body: JSON.stringify({
        employeeId: updatedEditableEmployee.id,
        constructionSiteId: structuredSite.id,
        workDate: nextBusinessDate(assignmentDate),
        plannedStartTime: "08:00",
        comment: "Rolle nach Mitarbeiterbearbeitung",
        reportResponsible: true
      })
    });
    assert.equal(
      editedForemanAssignmentResponse.status,
      201,
      await editedForemanAssignmentResponse.clone().text()
    );
    const editedForemanAssignment = (await editedForemanAssignmentResponse.json()).assignment;
    assert.equal(editedForemanAssignment.reportResponsible, true);
    assert.equal(editedForemanAssignment.reportResponsibilitySource, "manual");

    const foremanAssignmentResponse = await fetch(`${baseUrl}/api/v1/admin/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: plannerCookie },
      body: JSON.stringify({
        employeeId: foreman.id,
        constructionSiteId: structuredSite.id,
        workDate: assignmentDate,
        plannedStartTime: "07:00",
        comment: "Berichtspflichtiger Vorarbeitereinsatz",
        reportResponsible: true
      })
    });
    assert.equal(foremanAssignmentResponse.status, 201, await foremanAssignmentResponse.clone().text());
    const foremanAssignment = (await foremanAssignmentResponse.json()).assignment;
    assert.equal(foremanAssignment.reportResponsible, true);
    assert.equal(foremanAssignment.reportResponsibilitySource, "manual");

    // In kleinen Betrieben arbeiten Geschäftsführung und Administration selbst
    // mit. Sie müssen sich einplanen lassen, ohne dafür zusätzlich die Rolle
    // Monteur zu bekommen.
    const directorAssignmentResponse = await fetch(`${baseUrl}/api/v1/admin/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: plannerCookie },
      body: JSON.stringify({
        employeeId: director.id,
        constructionSiteId: structuredSite.id,
        workDate: assignmentDate,
        plannedStartTime: "13:00",
        comment: "Geschäftsführung arbeitet auf der Baustelle mit"
      })
    });
    assert.equal(
      directorAssignmentResponse.status,
      201,
      await directorAssignmentResponse.clone().text()
    );

    // Die Berichtsverantwortung bleibt dem Vorarbeiter vorbehalten.
    const directorReportResponsibility = await fetch(`${baseUrl}/api/v1/admin/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: plannerCookie },
      body: JSON.stringify({
        employeeId: director.id,
        constructionSiteId: structuredSite.id,
        workDate: nextBusinessDate(assignmentDate),
        plannedStartTime: "13:00",
        comment: "Geschäftsführung soll den Bericht übernehmen",
        reportResponsible: true
      })
    });
    assert.equal(directorReportResponsibility.status, 400);
    assert.match(
      (await directorReportResponsibility.json()).error.message,
      /Vorarbeiter/
    );

    const foremanLogin = await fetch(`${baseUrl}/api/v1/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: config.allowedOrigin },
      body: JSON.stringify({
        companyNumber,
        personnelNumber: foremanPersonnelNumber,
        password: foremanTemporaryPassword
      })
    });
    assert.equal(foremanLogin.status, 201);
    foremanCookie = foremanLogin.headers.get("set-cookie").split(";", 1)[0];
    const foremanPasswordChange = await fetch(`${baseUrl}/api/v1/account/initial-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: foremanCookie },
      body: JSON.stringify({ newPassword: foremanPassword })
    });
    assert.equal(foremanPasswordChange.status, 200);

    const foremanAssignmentsResponse = await fetch(
      `${baseUrl}/api/v1/site-assignments/${assignmentDate}`,
      { headers: { Cookie: foremanCookie } }
    );
    assert.equal(foremanAssignmentsResponse.status, 200);
    const foremanAssignments = (await foremanAssignmentsResponse.json()).assignments;
    assert.equal(foremanAssignments[0].reportResponsible, true);
    assert.equal(foremanAssignments[0].mobileReport, null);

    const foremanTimelineStart = Date.now() - 60_000;
    const postForemanEntry = (entryType, offset, constructionSiteId = null) => {
      const recordedAt = new Date(foremanTimelineStart + offset).toISOString();
      return fetch(`${baseUrl}/api/v1/time-entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: foremanCookie },
        body: JSON.stringify({
          clientEntryId: randomUUID(),
          entryType,
          recordedAt,
          clientCreatedAt: recordedAt,
          ...(constructionSiteId ? { constructionSiteId } : {})
        })
      });
    };
    assert.equal((await postForemanEntry("clock_in", 1_000)).status, 201);
    assert.equal((await postForemanEntry("site_arrival", 2_000, structuredSite.id)).status, 201);
    const blockedForemanDeparture = await postForemanEntry("site_departure", 3_000, structuredSite.id);
    assert.equal(blockedForemanDeparture.status, 409);
    assert.equal((await blockedForemanDeparture.json()).error.code, "site_report_required");

    clientReportId = randomUUID();
    const mobileReportPayload = {
      clientReportId,
      constructionSiteId: structuredSite.id,
      reportType: "daily",
      workDate: assignmentDate,
      sourceMode: "digital",
      summary: "Tagesfortschritt aus dem Integrationstest",
      details: "Leitungswege vorbereitet und dokumentiert",
      workPerformed: "Leitungswege vorbereitet und Unterverteilung montiert",
      obstructions: "Material kam 30 Minuten später",
      openItems: "Beschriftung fertigstellen",
      personnel: [{ userId: foreman.id, minutes: 450 }]
    };
    const mobileReportResponse = await fetch(`${baseUrl}/api/v1/site-reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: foremanCookie },
      body: JSON.stringify(mobileReportPayload)
    });
    assert.equal(mobileReportResponse.status, 201, await mobileReportResponse.clone().text());
    mobileReport = (await mobileReportResponse.json()).siteReport;
    assert.equal(mobileReport.siteAssignmentId, foremanAssignment.id);
    assert.equal(mobileReport.clientReportId, clientReportId);
    assert.equal(
      mobileReport.structuredData.workPerformed,
      "Leitungswege vorbereitet und Unterverteilung montiert"
    );
    assert.equal(mobileReport.structuredData.personnel[0].name, "Vera Vorarbeiterin");
    assert.equal(mobileReport.structuredData.personnel[0].minutes, 450);

    const duplicateMobileReportResponse = await fetch(`${baseUrl}/api/v1/site-reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: foremanCookie },
      body: JSON.stringify(mobileReportPayload)
    });
    assert.equal(duplicateMobileReportResponse.status, 200);
    assert.equal((await duplicateMobileReportResponse.json()).siteReport.id, mobileReport.id);

    const reportPreviewResponse = await fetch(
      `${baseUrl}/api/v1/admin/site-reports/${mobileReport.id}/preview`,
      { headers: { Cookie: plannerCookie } }
    );
    assert.equal(reportPreviewResponse.status, 200, await reportPreviewResponse.clone().text());
    assert.match(reportPreviewResponse.headers.get("content-type"), /application\/pdf/);
    assert.equal(
      Buffer.from(await reportPreviewResponse.arrayBuffer()).subarray(0, 5).toString("ascii"),
      "%PDF-"
    );

    const returnedMobileReportResponse = await fetch(
      `${baseUrl}/api/v1/admin/site-reports/${mobileReport.id}/return`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: plannerCookie },
        body: JSON.stringify({
          rowVersion: mobileReport.rowVersion,
          comment: "Bitte offene Punkte und Material genauer ergänzen."
        })
      }
    );
    assert.equal(
      returnedMobileReportResponse.status,
      200,
      await returnedMobileReportResponse.clone().text()
    );
    const returnedMobileReport = (await returnedMobileReportResponse.json()).siteReport;
    assert.equal(returnedMobileReport.status, "returned");
    assert.equal(returnedMobileReport.returnCount, 1);
    assert.equal(
      returnedMobileReport.returnComment,
      "Bitte offene Punkte und Material genauer ergänzen."
    );

    const returnedAssignmentsResponse = await fetch(
      `${baseUrl}/api/v1/site-assignments/${assignmentDate}`,
      { headers: { Cookie: foremanCookie } }
    );
    assert.equal(returnedAssignmentsResponse.status, 200);
    const returnedAssignment = (await returnedAssignmentsResponse.json()).assignments[0];
    assert.equal(returnedAssignment.mobileReport.status, "returned");
    assert.equal(
      returnedAssignment.mobileReport.returnComment,
      "Bitte offene Punkte und Material genauer ergänzen."
    );

    const revisedMobileReportResponse = await fetch(
      `${baseUrl}/api/v1/site-reports/${mobileReport.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: foremanCookie },
        body: JSON.stringify({
          constructionSiteId: structuredSite.id,
          reportType: "daily",
          workDate: assignmentDate,
          sourceMode: "digital",
          summary: "Tagesfortschritt aus dem Integrationstest",
          details: "Leitungswege vorbereitet, Material und offene Punkte ergänzt",
          workPerformed: "Leitungswege vorbereitet und Unterverteilung montiert",
          obstructions: "Material kam 30 Minuten später",
          openItems: "Beschriftung am Folgetag fertigstellen",
          materialsAndEquipment: "NYM-J 3x1,5 und Arbeitsbühne",
          personnel: [{ userId: foreman.id, minutes: 450 }],
          rowVersion: returnedMobileReport.rowVersion
        })
      }
    );
    assert.equal(
      revisedMobileReportResponse.status,
      200,
      await revisedMobileReportResponse.clone().text()
    );
    const revisedMobileReport = (await revisedMobileReportResponse.json()).siteReport;
    assert.equal(revisedMobileReport.status, "submitted");
    assert.equal(revisedMobileReport.returnCount, 1);
    assert.equal(
      revisedMobileReport.structuredData.materialsAndEquipment,
      "NYM-J 3x1,5 und Arbeitsbühne"
    );
    assert.equal((await postForemanEntry("site_departure", 4_000, structuredSite.id)).status, 201);

    const siteTaskResponse = await fetch(`${baseUrl}/api/v1/admin/site-tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: plannerCookie },
      body: JSON.stringify({
        constructionSiteId: structuredSite.id,
        title: "Unterverteilung beschriften",
        details: "Stromkreise eindeutig kennzeichnen",
        assignedUserId: employee.id,
        priority: "high",
        dueDate: assignmentDate
      })
    });
    assert.equal(siteTaskResponse.status, 201, await siteTaskResponse.clone().text());
    siteTask = (await siteTaskResponse.json()).siteTask;
    assert.equal(siteTask.status, "open");
    assert.equal(siteTask.assignedUserId, employee.id);

    const completedSiteTaskResponse = await fetch(
      `${baseUrl}/api/v1/admin/site-tasks/${siteTask.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: plannerCookie },
        body: JSON.stringify({ status: "done", rowVersion: siteTask.rowVersion })
      }
    );
    assert.equal(completedSiteTaskResponse.status, 200, await completedSiteTaskResponse.clone().text());
    completedSiteTask = (await completedSiteTaskResponse.json()).siteTask;
    assert.equal(completedSiteTask.status, "done");
    assert.ok(completedSiteTask.completedAt);

    const siteMaterialResponse = await fetch(`${baseUrl}/api/v1/admin/site-materials`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: plannerCookie },
      body: JSON.stringify({
        constructionSiteId: structuredSite.id,
        itemName: "NYM-J 3x1,5",
        quantity: 100,
        unit: "m",
        status: "planned",
        note: "Eine Rolle"
      })
    });
    assert.equal(siteMaterialResponse.status, 201, await siteMaterialResponse.clone().text());
    siteMaterial = (await siteMaterialResponse.json()).siteMaterial;
    assert.equal(siteMaterial.status, "planned");
    assert.equal(siteMaterial.quantity, 100);

    const availableMaterialResponse = await fetch(
      `${baseUrl}/api/v1/admin/site-materials/${siteMaterial.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: plannerCookie },
        body: JSON.stringify({ status: "available", rowVersion: siteMaterial.rowVersion })
      }
    );
    assert.equal(availableMaterialResponse.status, 200, await availableMaterialResponse.clone().text());
    assert.equal((await availableMaterialResponse.json()).siteMaterial.status, "available");

    const adminNotePayload = {
      constructionSiteId: structuredSite.id,
      clientNoteId: randomUUID(),
      content: "Zugang zum Technikraum beim Hausmeister abholen.",
      isImportant: true
    };
    const adminNoteResponse = await fetch(`${baseUrl}/api/v1/admin/site-notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: plannerCookie },
      body: JSON.stringify(adminNotePayload)
    });
    assert.equal(adminNoteResponse.status, 201, await adminNoteResponse.clone().text());
    adminNote = (await adminNoteResponse.json()).siteNote;
    assert.equal(adminNote.isImportant, true);
    assert.equal(adminNote.content, adminNotePayload.content);

    const mobileNotePayload = {
      clientNoteId: randomUUID(),
      content: "Kabeltrommeln stehen im Lagerraum links.",
      isImportant: false
    };
    const mobileNoteUrl =
      `${baseUrl}/api/v1/construction-sites/${structuredSite.id}/notes?date=${assignmentDate}`;
    const mobileNoteResponse = await fetch(mobileNoteUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: foremanCookie },
      body: JSON.stringify(mobileNotePayload)
    });
    assert.equal(mobileNoteResponse.status, 201, await mobileNoteResponse.clone().text());
    mobileNote = (await mobileNoteResponse.json()).siteNote;
    assert.equal(mobileNote.authorUserId, foreman.id);
    assert.equal(mobileNote.content, mobileNotePayload.content);

    const duplicateMobileNoteResponse = await fetch(mobileNoteUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: foremanCookie },
      body: JSON.stringify(mobileNotePayload)
    });
    assert.equal(
      duplicateMobileNoteResponse.status,
      200,
      await duplicateMobileNoteResponse.clone().text()
    );
    assert.equal((await duplicateMobileNoteResponse.json()).siteNote.id, mobileNote.id);

    documentContent = Buffer.from(`%PDF-1.4\nSchäfchen Dokument ${suffix}`, "utf8");
    const documentUploadResponse = await fetch(`${baseUrl}/api/v1/admin/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: plannerCookie },
      body: JSON.stringify({
        title: `Montageplan ${suffix}`,
        category: "plan",
        fileName: `Montageplan-${suffix}.pdf`,
        mimeType: "application/pdf",
        contentBase64: documentContent.toString("base64"),
        constructionSiteId: structuredSite.id
      })
    });
    assert.equal(documentUploadResponse.status, 201, await documentUploadResponse.clone().text());
    const uploadedDocumentBody = await documentUploadResponse.json();
    uploadedDocument = uploadedDocumentBody.document;
    assert.equal(uploadedDocumentBody.reused, false);
    assert.match(uploadedDocument.number, /^SE-D-\d{4}-\d{5}$/);
    assert.equal(uploadedDocument.links.length, 3);
    assert.ok(uploadedDocument.links.some((link) => link.customerId === customer.id));
    assert.ok(uploadedDocument.links.some((link) => link.projectId === project.id));
    assert.ok(uploadedDocument.links.some((link) => link.constructionSiteId === structuredSite.id));
    assert.equal(uploadedDocument.mobileVisible, true);
    assert.equal(uploadedDocument.offlinePriority, false);

    const offlineDocumentResponse = await fetch(
      `${baseUrl}/api/v1/admin/documents/${uploadedDocument.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: plannerCookie },
        body: JSON.stringify({
          offlinePriority: true,
          rowVersion: uploadedDocument.rowVersion
        })
      }
    );
    assert.equal(offlineDocumentResponse.status, 200, await offlineDocumentResponse.clone().text());
    const offlineDocument = (await offlineDocumentResponse.json()).document;
    assert.equal(offlineDocument.mobileVisible, true);
    assert.equal(offlineDocument.offlinePriority, true);

    const workspaceWithOfflineDocumentResponse = await fetch(
      `${baseUrl}/api/v1/construction-sites/${structuredSite.id}/dashboard?date=${assignmentDate}`,
      { headers: { Cookie: foremanCookie } }
    );
    assert.equal(workspaceWithOfflineDocumentResponse.status, 200);
    const workspaceWithOfflineDocument =
      (await workspaceWithOfflineDocumentResponse.json()).dashboard;
    assert.ok(workspaceWithOfflineDocument.site.qrCode);
    assert.equal(
      workspaceWithOfflineDocument.documents.find(
        (document) => document.id === uploadedDocument.id
      ).offlinePriority,
      true
    );

    const hiddenDocumentResponse = await fetch(
      `${baseUrl}/api/v1/admin/documents/${uploadedDocument.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: plannerCookie },
        body: JSON.stringify({
          mobileVisible: false,
          rowVersion: offlineDocument.rowVersion
        })
      }
    );
    assert.equal(hiddenDocumentResponse.status, 200, await hiddenDocumentResponse.clone().text());
    hiddenDocument = (await hiddenDocumentResponse.json()).document;
    assert.equal(hiddenDocument.mobileVisible, false);
    assert.equal(hiddenDocument.offlinePriority, false);

    const workspaceWithoutHiddenDocumentResponse = await fetch(
      `${baseUrl}/api/v1/construction-sites/${structuredSite.id}/dashboard?date=${assignmentDate}`,
      { headers: { Cookie: foremanCookie } }
    );
    assert.equal(workspaceWithoutHiddenDocumentResponse.status, 200);
    assert.equal(
      (await workspaceWithoutHiddenDocumentResponse.json()).dashboard.documents.some(
        (document) => document.id === uploadedDocument.id
      ),
      false
    );
    const hiddenDocumentContentResponse = await fetch(
      `${baseUrl}/api/v1/construction-sites/${structuredSite.id}/documents/${uploadedDocument.id}/content?date=${assignmentDate}`,
      { headers: { Cookie: foremanCookie } }
    );
    assert.equal(hiddenDocumentContentResponse.status, 404);

    const siteQrResponse = await fetch(
      `${baseUrl}/api/v1/admin/construction-sites/${structuredSite.id}/qr`,
      { headers: { Cookie: plannerCookie } }
    );
    assert.equal(siteQrResponse.status, 200, await siteQrResponse.clone().text());
    assert.match(siteQrResponse.headers.get("content-type"), /image\/svg\+xml/);
    assert.match(await siteQrResponse.text(), /<svg/);

    const reportPhotoResponse = await fetch(`${baseUrl}/api/v1/admin/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: plannerCookie },
      body: JSON.stringify({
        title: `Papierbericht ${suffix}`,
        category: "report",
        fileName: `Papierbericht-${suffix}.jpg`,
        mimeType: "image/jpeg",
        contentBase64: Buffer.from(`JPEG-Test-${suffix}`).toString("base64"),
        constructionSiteId: structuredSite.id
      })
    });
    assert.equal(reportPhotoResponse.status, 201, await reportPhotoResponse.clone().text());
    const reportPhoto = (await reportPhotoResponse.json()).document;

    const sitePhotoResponse = await fetch(`${baseUrl}/api/v1/admin/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: plannerCookie },
      body: JSON.stringify({
        title: `Unterverteilung ${suffix}`,
        category: "photo",
        fileName: `Unterverteilung-${suffix}.png`,
        mimeType: "image/png",
        contentBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        constructionSiteId: structuredSite.id
      })
    });
    assert.equal(sitePhotoResponse.status, 201, await sitePhotoResponse.clone().text());
    const sitePhoto = (await sitePhotoResponse.json()).document;

    const siteReportResponse = await fetch(`${baseUrl}/api/v1/admin/site-reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: plannerCookie },
      body: JSON.stringify({
        constructionSiteId: structuredSite.id,
        reportType: "montage",
        workDate: assignmentDate,
        sourceMode: "photo",
        summary: "Montagefortschritt",
        details: "Unterverteilung gesetzt und beschriftet",
        sourceDocumentId: reportPhoto.id,
        photos: [{
          documentId: sitePhoto.id,
          caption: "Unterverteilung nach Abschluss der Montage"
        }]
      })
    });
    assert.equal(siteReportResponse.status, 201, await siteReportResponse.clone().text());
    siteReport = (await siteReportResponse.json()).siteReport;
    assert.match(siteReport.number, /^SE-R-\d{4}-\d{5}$/);
    assert.equal(siteReport.sourceDocumentId, reportPhoto.id);
    assert.equal(siteReport.structuredData.photos[0].documentId, sitePhoto.id);
    assert.equal(
      siteReport.structuredData.photos[0].caption,
      "Unterverteilung nach Abschluss der Montage"
    );
    assert.equal(siteReport.status, "submitted");

    signatureData = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    const finalizationResponse = await fetch(
      `${baseUrl}/api/v1/admin/site-reports/${siteReport.id}/finalize`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: plannerCookie },
        body: JSON.stringify({
          rowVersion: siteReport.rowVersion,
          employeeSignatureName: "API Integration",
          employeeSignatureData: signatureData,
          customerSignatureName: "Klara Kundin",
          customerSignatureData: signatureData
        })
      }
    );
    assert.equal(finalizationResponse.status, 200, await finalizationResponse.clone().text());
    const finalizedReport = (await finalizationResponse.json()).siteReport;
    assert.equal(finalizedReport.status, "approved");
    assert.equal(finalizedReport.employeeSignatureName, "API Integration");
    assert.ok(finalizedReport.finalDocumentId);
    const finalPdfResponse = await fetch(
      `${baseUrl}/api/v1/admin/documents/${finalizedReport.finalDocumentId}/content`,
      { headers: { Cookie: plannerCookie } }
    );
    assert.equal(finalPdfResponse.status, 200);
    assert.match(finalPdfResponse.headers.get("content-type"), /application\/pdf/);
    assert.equal(Buffer.from(await finalPdfResponse.arrayBuffer()).subarray(0, 5).toString("ascii"), "%PDF-");
  });

  await t.test("VDE-Prüfmodul", async () => {
    const plannerVdeContextResponse = await fetch(
      `${baseUrl}/api/v1/vde/context?constructionSiteId=${structuredSite.id}&date=${assignmentDate}`,
      { headers: { Cookie: plannerCookie } }
    );
    assert.equal(
      plannerVdeContextResponse.status,
      200,
      await plannerVdeContextResponse.clone().text()
    );
    const plannerVdeContext = (await plannerVdeContextResponse.json()).context;
    assert.equal(plannerVdeContext.companySnapshot, undefined);
    assert.equal(plannerVdeContext.customer.id, customer.id);
    assert.equal(plannerVdeContext.customer.name, customer.displayName);
    assert.equal(plannerVdeContext.project.id, project.id);
    assert.equal(plannerVdeContext.site.id, structuredSite.id);
    assert.equal(plannerVdeContext.site.address, "Baustellenweg 8, 12345 Teststadt");
    assert.equal(plannerVdeContext.permissions.create, true);
    assert.equal(plannerVdeContext.permissions.importLegacy, true);
    assert.ok(plannerVdeContext.inspectors.some((inspector) => inspector.id === foreman.id));

    const vdeProtocol = {
      schemaVersion: 1,
      networkType: "TN-S",
      nominalVoltage: "230/400 V",
      inspectionKinds: {
        initial: true,
        recurring: false,
        alteration: false
      },
      visualChecks: {
        electric_shock_protection: "ok",
        protective_conductor: "ok",
        equipment_selection: "ok",
        circuit_labelling: "ok",
        rcd_test_button: "ok",
        phase_sequence: "ok",
        polarity: "ok",
        disconnection_conditions: "ok"
      },
      incomingSupply: {
        designation: "HAK",
        location: "Hausanschlussraum",
        upstreamProtection: "NH 00 63 A",
        source: "Netz",
        cableType: "NYY-J",
        cores: "5",
        crossSection: "16"
      },
      circuitDirectoryIncluded: true,
      detailedInsulationMeasurement: true,
      distributions: [{
        clientId: "uv-hauptverteilung",
        name: "UV EG",
        source: "HAK",
        feedCableType: "NYY-J",
        feedCores: "5",
        feedCrossSection: "16",
        feedProtection: "NH 00 63 A",
        location: "Technikraum",
        rcds: [{
          clientId: "rcd-steckdosen",
          name: "FI Steckdosen",
          type: "A",
          characteristic: "unverzögert",
          ratedCurrent: "63",
          ratedResidualCurrent: "30",
          testButton: true,
          circuits: [{
            clientId: "circuit-steckdosen",
            name: "F1 Steckdosen Küche",
            cableType: "NYM-J",
            cores: "3",
            crossSection: "2.5",
            protectiveDevice: {
              type: "mcb",
              characteristic: "B",
              ratedCurrent: "16",
              designation: null,
              rcdType: null,
              rcdCharacteristic: null,
              ratedResidualCurrent: null,
              testButton: false
            },
            measurements: {
              rpe: "0.18",
              riso: "200",
              zi: "0.29",
              zs: "0.41",
              ik: "560",
              rcdTripTime: "24",
              rcdTripCurrent: "21",
              risoL1Pe: "200",
              risoL2Pe: "200",
              risoL3Pe: "200",
              risoNPe: "200"
            },
            note: "Messung am letzten Verbraucher"
          }]
        }],
        directCircuits: [{
          clientId: "circuit-waermepumpe",
          name: "F2 Wärmepumpe",
          cableType: "NYY-J",
          cores: "5",
          crossSection: "10",
          protectiveDevice: {
            type: "fuse_nh",
            characteristic: null,
            ratedCurrent: "63",
            designation: "NH 00 gG",
            rcdType: null,
            rcdCharacteristic: null,
            ratedResidualCurrent: null,
            testButton: false
          },
          measurements: {
            rpe: "0.12",
            riso: "500",
            zi: "0.22",
            zs: "0.31",
            ik: "740",
            rcdTripTime: null,
            rcdTripCurrent: null,
            risoL1Pe: "500",
            risoL2Pe: "500",
            risoL3Pe: "500",
            risoNPe: "500"
          },
          note: ""
        }]
      }],
      testEquipment: {
        manufacturer: "Benning",
        type: "IT 200",
        serialNumber: `VDE-${suffix}`,
        calibrationValidUntil: assignmentDate
      },
      defects: "",
      result: "ok",
      nextInspectionDate: nextBusinessDate(assignmentDate)
    };
    const vdeClientInspectionId = randomUUID();
    const vdeCreatePayload = {
      constructionSiteId: structuredSite.id,
      clientInspectionId: vdeClientInspectionId,
      inspectorUserId: foreman.id,
      inspectionName: "Erstprüfung Haupt- und Unterverteilung",
      inspectionDate: assignmentDate,
      protocolData: vdeProtocol
    };
    const vdeCreateResponse = await fetch(
      `${baseUrl}/api/v1/vde/inspections?date=${assignmentDate}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: plannerCookie },
        body: JSON.stringify(vdeCreatePayload)
      }
    );
    assert.equal(vdeCreateResponse.status, 201, await vdeCreateResponse.clone().text());
    const vdeInspection = (await vdeCreateResponse.json()).inspection;
    assert.match(vdeInspection.number, /^SE-VDE-\d{4}-\d{5}$/);
    assert.equal(vdeInspection.inspectorUserId, foreman.id);
    assert.equal(vdeInspection.status, "draft");
    assert.equal(vdeInspection.protocolData.distributions[0].directCircuits[0]
      .protectiveDevice.type, "fuse_nh");
    assert.equal(vdeInspection.protocolData.distributions[0].directCircuits[0]
      .protectiveDevice.ratedCurrent, "63");

    const duplicateVdeCreateResponse = await fetch(
      `${baseUrl}/api/v1/vde/inspections?date=${assignmentDate}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: plannerCookie },
        body: JSON.stringify(vdeCreatePayload)
      }
    );
    assert.equal(duplicateVdeCreateResponse.status, 200);
    const duplicateVdeCreate = await duplicateVdeCreateResponse.json();
    assert.equal(duplicateVdeCreate.idempotent, true);
    assert.equal(duplicateVdeCreate.inspection.id, vdeInspection.id);

    const foreignVdeSignatureResponse = await fetch(
      `${baseUrl}/api/v1/vde/inspections/${vdeInspection.id}/complete?date=${assignmentDate}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({
          inspectionName: vdeInspection.name,
          inspectionDate: assignmentDate,
          protocolData: vdeProtocol,
          rowVersion: vdeInspection.rowVersion,
          inspectorSignatureData: signatureData
        })
      }
    );
    assert.equal(foreignVdeSignatureResponse.status, 403);
    assert.equal(
      (await foreignVdeSignatureResponse.json()).error.code,
      "vde_inspector_signature_forbidden"
    );

    const foremanVdeContextResponse = await fetch(
      `${baseUrl}/api/v1/vde/context?constructionSiteId=${structuredSite.id}&date=${assignmentDate}`,
      { headers: { Cookie: foremanCookie } }
    );
    assert.equal(foremanVdeContextResponse.status, 200);
    const foremanVdeContext = (await foremanVdeContextResponse.json()).context;
    assert.equal(foremanVdeContext.permissions.create, true);
    assert.equal(foremanVdeContext.permissions.complete, true);
    assert.equal(foremanVdeContext.permissions.importLegacy, false);
    assert.deepEqual(
      foremanVdeContext.inspectors.map((inspector) => inspector.id),
      [foreman.id]
    );

    const unassignedVdeDateResponse = await fetch(
      `${baseUrl}/api/v1/vde/context?constructionSiteId=${structuredSite.id}&date=${nextBusinessDate(assignmentDate)}`,
      { headers: { Cookie: foremanCookie } }
    );
    assert.equal(unassignedVdeDateResponse.status, 403);
    assert.equal(
      (await unassignedVdeDateResponse.json()).error.code,
      "vde_site_access_forbidden"
    );

    const vdeUpdateProtocol = structuredClone(vdeProtocol);
    vdeUpdateProtocol.defects = "Beschriftung vor Übergabe ergänzen";
    vdeUpdateProtocol.result = "operational_with_defects";
    const vdeUpdateResponse = await fetch(
      `${baseUrl}/api/v1/vde/inspections/${vdeInspection.id}?date=${assignmentDate}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: foremanCookie },
        body: JSON.stringify({
          inspectionName: vdeInspection.name,
          inspectionDate: assignmentDate,
          protocolData: vdeUpdateProtocol,
          rowVersion: vdeInspection.rowVersion
        })
      }
    );
    assert.equal(vdeUpdateResponse.status, 200, await vdeUpdateResponse.clone().text());
    const updatedVdeInspection = (await vdeUpdateResponse.json()).inspection;
    assert.equal(updatedVdeInspection.rowVersion, 2);
    assert.equal(updatedVdeInspection.protocolData.defects, vdeUpdateProtocol.defects);

    const vdeCompletionResponse = await fetch(
      `${baseUrl}/api/v1/vde/inspections/${vdeInspection.id}/complete?date=${assignmentDate}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: foremanCookie },
        body: JSON.stringify({
          inspectionName: updatedVdeInspection.name,
          inspectionDate: assignmentDate,
          protocolData: vdeUpdateProtocol,
          rowVersion: updatedVdeInspection.rowVersion,
          inspectorSignatureData: signatureData
        })
      }
    );
    assert.equal(
      vdeCompletionResponse.status,
      200,
      await vdeCompletionResponse.clone().text()
    );
    const completedVdeInspection = (await vdeCompletionResponse.json()).inspection;
    assert.equal(completedVdeInspection.status, "completed");
    assert.equal(completedVdeInspection.rowVersion, 3);
    assert.ok(completedVdeInspection.finalDocumentId);
    assert.equal(completedVdeInspection.completedByName, "Vera Vorarbeiterin");

    const vdePdfResponse = await fetch(
      `${baseUrl}/api/v1/vde/inspections/${completedVdeInspection.id}/pdf?date=${assignmentDate}`,
      { headers: { Cookie: foremanCookie } }
    );
    assert.equal(vdePdfResponse.status, 200);
    assert.match(vdePdfResponse.headers.get("content-type"), /application\/pdf/);
    assert.match(
      vdePdfResponse.headers.get("content-disposition"),
      new RegExp(completedVdeInspection.number)
    );
    assert.equal(
      Buffer.from(await vdePdfResponse.arrayBuffer()).subarray(0, 5).toString("ascii"),
      "%PDF-"
    );

    const completedVdeUpdateResponse = await fetch(
      `${baseUrl}/api/v1/vde/inspections/${completedVdeInspection.id}?date=${assignmentDate}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: foremanCookie },
        body: JSON.stringify({
          inspectionName: "Unzulässige Änderung",
          inspectionDate: assignmentDate,
          protocolData: vdeUpdateProtocol,
          rowVersion: completedVdeInspection.rowVersion
        })
      }
    );
    assert.equal(completedVdeUpdateResponse.status, 409);
    assert.equal(
      (await completedVdeUpdateResponse.json()).error.code,
      "vde_inspection_completed"
    );

    const legacyOriginal = Buffer.from("%PDF-1.4\nLegacy V15", "utf8");
    const legacyVdeImportResponse = await fetch(
      `${baseUrl}/api/v1/vde/imports?date=${assignmentDate}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: plannerCookie },
        body: JSON.stringify({
          ...vdeCreatePayload,
          clientInspectionId: randomUUID(),
          inspectionName: "Importiertes V15-Protokoll",
          sourceName: `vde-v15-${suffix}.json`,
          originalPdf: {
            fileName: `vde-v15-${suffix}.pdf`,
            contentBase64: legacyOriginal.toString("base64")
          }
        })
      }
    );
    assert.equal(
      legacyVdeImportResponse.status,
      201,
      await legacyVdeImportResponse.clone().text()
    );
    const importedVdeInspection = (await legacyVdeImportResponse.json()).inspection;
    assert.equal(importedVdeInspection.sourceMode, "legacy_v15");
    assert.equal(importedVdeInspection.sourceName, `vde-v15-${suffix}.json`);
    assert.ok(importedVdeInspection.originalDocumentId);
    assert.equal(importedVdeInspection.status, "draft");

    const foremanSiteDashboardResponse = await fetch(
      `${baseUrl}/api/v1/construction-sites/${structuredSite.id}/dashboard?date=${assignmentDate}`,
      { headers: { Cookie: foremanCookie } }
    );
    assert.equal(
      foremanSiteDashboardResponse.status,
      200,
      await foremanSiteDashboardResponse.clone().text()
    );
    const foremanSiteDashboard = (await foremanSiteDashboardResponse.json()).dashboard;
    assert.equal(foremanSiteDashboard.site.id, structuredSite.id);
    assert.equal(foremanSiteDashboard.viewer.canLead, true);
    assert.equal(foremanSiteDashboard.viewer.canManage, false);
    assert.equal(foremanSiteDashboard.viewer.reportResponsible, true);
    assert.ok(foremanSiteDashboard.team.some((member) => (
      member.id === foreman.id && member.reportResponsible
    )));
    assert.ok(foremanSiteDashboard.tasks.some((item) => item.id === completedSiteTask.id));
    assert.ok(foremanSiteDashboard.materials.some((item) => item.id === siteMaterial.id));
    assert.ok(foremanSiteDashboard.notes.some((item) => item.id === adminNote.id));
    assert.ok(foremanSiteDashboard.notes.some((item) => item.id === mobileNote.id));
    assert.equal(foremanSiteDashboard.notes[0].id, adminNote.id);
    assert.ok(foremanSiteDashboard.reports.some((item) => item.id === mobileReport.id));
    assert.equal(
      foremanSiteDashboard.documents.some((item) => item.id === uploadedDocument.id),
      false
    );
    assert.equal(foremanSiteDashboard.electricalModules.vde.enabled, true);
    assert.equal(foremanSiteDashboard.electricalModules.vde.permissions.complete, true);
    assert.ok(foremanSiteDashboard.electricalModules.vde.inspections.some(
      (inspection) => (
        inspection.id === completedVdeInspection.id
        && inspection.status === "completed"
      )
    ));
    assert.ok(foremanSiteDashboard.documents.some(
      (document) => document.id === completedVdeInspection.finalDocumentId
    ));

    const sitePhotoContent = Buffer.from(`JPEG-Baustellenfoto-${suffix}`);
    const sitePhotoUploadResponse = await fetch(
      `${baseUrl}/api/v1/construction-sites/${structuredSite.id}/photos?date=${assignmentDate}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: foremanCookie },
        body: JSON.stringify({
          title: `Baustellenfoto ${suffix}`,
          fileName: `Baustellenfoto-${suffix}.jpg`,
          mimeType: "image/jpeg",
          contentBase64: sitePhotoContent.toString("base64")
        })
      }
    );
    assert.equal(sitePhotoUploadResponse.status, 201, await sitePhotoUploadResponse.clone().text());
    const fieldSitePhoto = (await sitePhotoUploadResponse.json()).document;
    assert.equal(fieldSitePhoto.category, "photo");
    assert.ok(fieldSitePhoto.links.some((link) => link.constructionSiteId === structuredSite.id));

    const sitePhotoDownloadResponse = await fetch(
      `${baseUrl}/api/v1/construction-sites/${structuredSite.id}/documents/${fieldSitePhoto.id}/content?date=${assignmentDate}`,
      { headers: { Cookie: foremanCookie } }
    );
    assert.equal(sitePhotoDownloadResponse.status, 200);
    assert.equal(sitePhotoDownloadResponse.headers.get("content-type"), "image/jpeg");
    assert.deepEqual(Buffer.from(await sitePhotoDownloadResponse.arrayBuffer()), sitePhotoContent);

    const mismatchedDocumentResponse = await fetch(`${baseUrl}/api/v1/admin/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: plannerCookie },
      body: JSON.stringify({
        title: "Falsch zugeordnet",
        category: "general",
        fileName: "Falsch.txt",
        mimeType: "text/plain",
        contentBase64: Buffer.from("Falsch").toString("base64"),
        customerId: randomUUID(),
        constructionSiteId: structuredSite.id
      })
    });
    assert.equal(mismatchedDocumentResponse.status, 409);
    assert.equal((await mismatchedDocumentResponse.json()).error.code, "document_target_conflict");

    const documentDownloadResponse = await fetch(
      `${baseUrl}/api/v1/admin/documents/${uploadedDocument.id}/content`,
      { headers: { Cookie: plannerCookie } }
    );
    assert.equal(documentDownloadResponse.status, 200);
    assert.equal(documentDownloadResponse.headers.get("content-type"), "application/pdf");
    assert.match(documentDownloadResponse.headers.get("content-disposition"), /attachment/);
    assert.deepEqual(Buffer.from(await documentDownloadResponse.arrayBuffer()), documentContent);

    const archiveDocumentResponse = await fetch(
      `${baseUrl}/api/v1/admin/documents/${uploadedDocument.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: plannerCookie },
        body: JSON.stringify({ status: "archived", rowVersion: hiddenDocument.rowVersion })
      }
    );
    assert.equal(archiveDocumentResponse.status, 200, await archiveDocumentResponse.clone().text());
    const archivedDocument = (await archiveDocumentResponse.json()).document;
    assert.equal(archivedDocument.status, "archived");
    assert.equal(archivedDocument.rowVersion, hiddenDocument.rowVersion + 1);

    const duplicateDocumentResponse = await fetch(`${baseUrl}/api/v1/admin/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: plannerCookie },
      body: JSON.stringify({
        title: "Dieselbe Datei ohne Kopie",
        category: "general",
        fileName: `Kopie-${suffix}.pdf`,
        mimeType: "application/pdf",
        contentBase64: documentContent.toString("base64"),
        customerId: customer.id
      })
    });
    assert.equal(duplicateDocumentResponse.status, 201, await duplicateDocumentResponse.clone().text());
    const reusedDocumentBody = await duplicateDocumentResponse.json();
    assert.equal(reusedDocumentBody.reused, true);
    assert.equal(reusedDocumentBody.document.id, uploadedDocument.id);
    assert.equal(reusedDocumentBody.document.status, "active");
    assert.equal(reusedDocumentBody.document.mobileVisible, false);
    assert.equal(reusedDocumentBody.document.offlinePriority, false);

    const blockedProjectCompletion = await fetch(
      `${baseUrl}/api/v1/admin/projects/${project.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: plannerCookie },
        body: JSON.stringify({
          name: updatedProject.name,
          installerShortText: updatedProject.shortText,
          status: "completed",
          rowVersion: updatedProject.rowVersion
        })
      }
    );
    assert.equal(blockedProjectCompletion.status, 409);
    assert.equal((await blockedProjectCompletion.json()).error.code, "project_has_active_sites");

    const blockedCustomerArchive = await fetch(
      `${baseUrl}/api/v1/admin/customers/${customer.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: plannerCookie },
        body: JSON.stringify({
          customerType: updatedCustomer.type,
          companyName: updatedCustomer.companyName,
          firstName: updatedCustomer.firstName,
          lastName: updatedCustomer.lastName,
          email: updatedCustomer.email,
          phone: updatedCustomer.phone,
          street: updatedCustomer.address.street,
          houseNumber: updatedCustomer.address.houseNumber,
          postalCode: updatedCustomer.address.postalCode,
          city: updatedCustomer.address.city,
          status: "archived",
          rowVersion: updatedCustomer.rowVersion
        })
      }
    );
    assert.equal(blockedCustomerArchive.status, 409);
    assert.equal((await blockedCustomerArchive.json()).error.code, "customer_has_active_projects");

    const structuredSiteUpdateResponse = await fetch(
      `${baseUrl}/api/v1/admin/construction-sites/${structuredSite.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: plannerCookie },
        body: JSON.stringify({
          name: `Struktur Baustelle aktualisiert ${suffix}`,
          installerShortText: "Unterverteilung und Dokumentation",
          street: "Neuer Baustellenweg",
          houseNumber: "8a",
          postalCode: "12345",
          city: "Teststadt",
          status: "active",
          rowVersion: structuredSite.rowVersion
        })
      }
    );
    assert.equal(
      structuredSiteUpdateResponse.status,
      200,
      await structuredSiteUpdateResponse.clone().text()
    );
    const updatedStructuredSite = (await structuredSiteUpdateResponse.json()).site;
    assert.equal(updatedStructuredSite.address.street, "Neuer Baustellenweg");
    assert.equal(updatedStructuredSite.rowVersion, 2);

    const structureOverviewResponse = await fetch(
      `${baseUrl}/api/v1/admin/overview?date=2026-07-20`,
      { headers: { Cookie: plannerCookie } }
    );
    assert.equal(structureOverviewResponse.status, 200, await structureOverviewResponse.clone().text());
    const structureOverview = (await structureOverviewResponse.json()).overview;
    assert.ok(structureOverview.customers.some((item) => item.id === customer.id));
    assert.ok(structureOverview.projects.some((item) => item.id === project.id && item.siteCount === 1));
    assert.ok(structureOverview.sites.some((item) => (
      item.id === structuredSite.id
      && item.projectId === project.id
      && item.name === updatedStructuredSite.name
      && item.rowVersion === 2
    )));
    assert.equal(
      structureOverview.documents.filter((item) => item.id === uploadedDocument.id).length,
      1
    );
    assert.ok(structureOverview.siteTasks.some((item) => item.id === completedSiteTask.id && item.status === "done"));
    assert.ok(structureOverview.siteMaterials.some((item) => item.id === siteMaterial.id && item.status === "available"));
    assert.ok(structureOverview.siteNotes.some((item) => item.id === adminNote.id && item.isImportant));
    assert.ok(structureOverview.siteNotes.some((item) => item.id === mobileNote.id));
    assert.ok(structureOverview.siteReports.some((item) => item.id === siteReport.id && item.sourceMode === "photo"));
    // Der Modulstand steht allein in der Sitzung, nicht zusaetzlich in der
    // Verwaltungsuebersicht.
    assert.equal(structureOverview.modules, undefined);
    assert.ok(structureOverview.vdeInspections.some(
      (inspection) => (
        inspection.id === completedVdeInspection.id
        && inspection.status === "completed"
      )
    ));
    assert.ok(structureOverview.vdeInspections.some(
      (inspection) => (
        inspection.id === importedVdeInspection.id
        && inspection.sourceMode === "legacy_v15"
      )
    ));
    const vdeFinalDocument = structureOverview.documents.find(
      (document) => document.id === completedVdeInspection.finalDocumentId
    );
    assert.equal(vdeFinalDocument.category, "inspection");
    assert.ok(vdeFinalDocument.links.some(
      (link) => link.constructionSiteId === structuredSite.id
    ));
    assert.ok(vdeFinalDocument.links.some((link) => link.projectId === project.id));
    assert.ok(vdeFinalDocument.links.some((link) => link.customerId === customer.id));

    const vdeDeactivationResponse = await fetch(
      `${baseUrl}/api/v1/platform/companies/${tenantCompany.id}/modules/vde`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: platformCookie },
        body: JSON.stringify({
          status: "inactive",
          rowVersion: activatedVde.rowVersion,
          reason: "VDE im PostgreSQL-Integrationstest durch die Plattform deaktivieren"
        })
      }
    );
    assert.equal(
      vdeDeactivationResponse.status,
      200,
      await vdeDeactivationResponse.clone().text()
    );
    const deactivatedVde = (await vdeDeactivationResponse.json()).entitlement;
    assert.equal(deactivatedVde.entitlementStatus, "inactive");
    assert.equal(deactivatedVde.rowVersion, 2);

    const disabledVdeContextResponse = await fetch(
      `${baseUrl}/api/v1/vde/context?constructionSiteId=${structuredSite.id}&date=${assignmentDate}`,
      { headers: { Cookie: foremanCookie } }
    );
    assert.equal(disabledVdeContextResponse.status, 404);
    assert.equal(
      (await disabledVdeContextResponse.json()).error.code,
      "vde_module_disabled"
    );

    const coreDashboardWithDisabledVdeResponse = await fetch(
      `${baseUrl}/api/v1/construction-sites/${structuredSite.id}/dashboard?date=${assignmentDate}`,
      { headers: { Cookie: foremanCookie } }
    );
    assert.equal(coreDashboardWithDisabledVdeResponse.status, 200);
    const coreDashboardWithDisabledVde =
      (await coreDashboardWithDisabledVdeResponse.json()).dashboard;
    assert.equal(coreDashboardWithDisabledVde.electricalModules.vde.enabled, false);
    assert.ok(coreDashboardWithDisabledVde.tasks.some(
      (task) => task.id === completedSiteTask.id
    ));
    assert.ok(coreDashboardWithDisabledVde.documents.some(
      (document) => document.id === completedVdeInspection.finalDocumentId
    ));

    const vdeReactivationResponse = await fetch(
      `${baseUrl}/api/v1/platform/companies/${tenantCompany.id}/modules/vde`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: platformCookie },
        body: JSON.stringify({
          status: "permanent",
          rowVersion: deactivatedVde.rowVersion,
          reason: "VDE im PostgreSQL-Integrationstest durch die Plattform reaktivieren"
        })
      }
    );
    assert.equal(vdeReactivationResponse.status, 200);
    assert.equal((await vdeReactivationResponse.json()).entitlement.rowVersion, 3);
  });

  await t.test("Verwaltung von Baustellen, Dokumenten und Planungsteams", async () => {
    const siteResponse = await fetch(`${baseUrl}/api/v1/admin/sites`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: plannerCookie },
      body: JSON.stringify({
        customerName: `API Kunde ${suffix} GmbH`,
        projectName: "API Integration",
        siteName: `API Baustelle ${suffix}`,
        installerShortText: "Verteilung prüfen",
        street: "Testweg",
        houseNumber: "17",
        postalCode: "12345",
        city: "Teststadt"
      })
    });
    assert.equal(siteResponse.status, 201);
    site = (await siteResponse.json()).site;
    assert.match(site.number, /^SE-B-\d{4}-\d{4}$/);

    const excelEmployeeResponse = await fetch(`${baseUrl}/api/v1/admin/employees`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: plannerCookie },
      body: JSON.stringify({
        personnelNumber: `XLSX-${suffix}`,
        firstName: "Excel",
        lastName: "Import",
        role: "installer",
        temporaryPassword: "Excel-Import-Start-2026!"
      })
    });
    assert.equal(excelEmployeeResponse.status, 201, await excelEmployeeResponse.clone().text());

    const excelSiteResponse = await fetch(`${baseUrl}/api/v1/admin/sites`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: plannerCookie },
      body: JSON.stringify({
        customerName: `Excel Kunde ${suffix} GmbH`,
        projectName: "Zugeordnete Excel Baustelle",
        siteName: "Zugeordnete Excel Baustelle",
        installerShortText: "Excel-Import prüfen",
        street: "Tabellenweg",
        houseNumber: "5",
        postalCode: "12345",
        city: "Teststadt"
      })
    });
    assert.equal(excelSiteResponse.status, 201, await excelSiteResponse.clone().text());
    const excelSite = (await excelSiteResponse.json()).site;

    const siteImportWorkbook = await readFile(
      resolve(dirname(fileURLToPath(import.meta.url)), "fixtures/site-import.xlsx")
    );
    const siteImportPayload = {
      fileName: "Baustellenliste Test.xlsx",
      contentBase64: siteImportWorkbook.toString("base64")
    };
    const siteImportPreviewResponse = await fetch(`${baseUrl}/api/v1/admin/site-imports/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: plannerCookie },
      body: JSON.stringify(siteImportPayload)
    });
    assert.equal(siteImportPreviewResponse.status, 200, await siteImportPreviewResponse.clone().text());
    const siteImportPreview = (await siteImportPreviewResponse.json()).importPreview;
    assert.equal(siteImportPreview.readyCount, 1);
    assert.equal(siteImportPreview.conflictCount, 0);

    const siteImportResponse = await fetch(`${baseUrl}/api/v1/admin/site-imports`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: plannerCookie },
      body: JSON.stringify(siteImportPayload)
    });
    assert.equal(siteImportResponse.status, 201, await siteImportResponse.clone().text());
    assert.equal((await siteImportResponse.json()).import.createdCount, 1);

    const siteDuplicatePreviewResponse = await fetch(`${baseUrl}/api/v1/admin/site-imports/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: plannerCookie },
      body: JSON.stringify(siteImportPayload)
    });
    assert.equal(siteDuplicatePreviewResponse.status, 200);
    const siteDuplicatePreview = (await siteDuplicatePreviewResponse.json()).importPreview;
    assert.equal(siteDuplicatePreview.readyCount, 0);
    assert.equal(siteDuplicatePreview.duplicateCount, 1);

    const excelContentBase64 = (await readFile(
      resolve(dirname(fileURLToPath(import.meta.url)), "fixtures/assignment-import.xlsx.base64"),
      "utf8"
    )).trim();
    const unmappedExcelPayload = { fileName: "Baustellenplan Test.xlsx", contentBase64: excelContentBase64 };
    const unmappedImportPreviewResponse = await fetch(`${baseUrl}/api/v1/admin/assignment-imports/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: plannerCookie },
      body: JSON.stringify(unmappedExcelPayload)
    });
    assert.equal(unmappedImportPreviewResponse.status, 200);
    const unmappedImportPreview = (await unmappedImportPreviewResponse.json()).importPreview;
    assert.equal(unmappedImportPreview.readyCount, 0);
    assert.deepEqual(unmappedImportPreview.unmatchedSites, [{ name: "Excel Baustelle", assignments: 2 }]);

    const excelPayload = {
      ...unmappedExcelPayload,
      mappings: {
        employees: [],
        sites: [{ sourceLabel: "Excel Baustelle", targetId: excelSite.id }]
      }
    };
    const importPreviewResponse = await fetch(`${baseUrl}/api/v1/admin/assignment-imports/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: plannerCookie },
      body: JSON.stringify(excelPayload)
    });
    assert.equal(importPreviewResponse.status, 200, await importPreviewResponse.clone().text());
    const importPreview = (await importPreviewResponse.json()).importPreview;
    assert.equal(importPreview.weekStart, "2026-07-20");
    assert.equal(importPreview.readyCount, 2);
    assert.equal(importPreview.ignoredStatusCount, 1);

    const importResponse = await fetch(`${baseUrl}/api/v1/admin/assignment-imports`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: plannerCookie },
      body: JSON.stringify(excelPayload)
    });
    assert.equal(importResponse.status, 201, await importResponse.clone().text());
    assert.equal((await importResponse.json()).import.importedCount, 2);

    const importedOverviewResponse = await fetch(
      `${baseUrl}/api/v1/admin/overview?date=2026-07-20`,
      { headers: { Cookie: plannerCookie } }
    );
    assert.equal(importedOverviewResponse.status, 200);
    const importedOverview = (await importedOverviewResponse.json()).overview;
    assert.equal(
      importedOverview.weekAssignments.filter((item) => item.employeeName === "Excel Import").length,
      2
    );

    const duplicatePreviewResponse = await fetch(`${baseUrl}/api/v1/admin/assignment-imports/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: plannerCookie },
      body: JSON.stringify(excelPayload)
    });
    assert.equal(duplicatePreviewResponse.status, 200);
    const duplicatePreview = (await duplicatePreviewResponse.json()).importPreview;
    assert.equal(duplicatePreview.readyCount, 0);
    assert.equal(duplicatePreview.duplicateCount, 2);

    const assignmentResponse = await fetch(`${baseUrl}/api/v1/admin/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: plannerCookie },
      body: JSON.stringify({
        employeeId: employee.id,
        constructionSiteId: site.id,
        workDate: assignmentDate,
        plannedStartTime: "07:30",
        plannedDurationMinutes: 450,
        comment: "API-Test Arbeitsanweisung"
      })
    });
    assert.equal(assignmentResponse.status, 201, await assignmentResponse.clone().text());
    assignment = (await assignmentResponse.json()).assignment;
    assert.equal(assignment.plannedDurationMinutes, 450);
    assert.equal(assignment.comment, "API-Test Arbeitsanweisung");
    assert.equal(assignment.reportResponsible, true);
    assert.equal(assignment.reportResponsibilitySource, "automatic");

    const planningTeamResponse = await fetch(`${baseUrl}/api/v1/admin/planning-teams`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: plannerCookie },
      body: JSON.stringify({
        name: `Montageteam ${suffix}`,
        memberIds: [employee.id, updatedEditableEmployee.id]
      })
    });
    assert.equal(
      planningTeamResponse.status,
      201,
      await planningTeamResponse.clone().text()
    );
    const planningTeam = (await planningTeamResponse.json()).planningTeam;
    assert.equal(planningTeam.members.length, 2);

    const planningTeamUpdateResponse = await fetch(
      `${baseUrl}/api/v1/admin/planning-teams/${planningTeam.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: plannerCookie },
        body: JSON.stringify({
          name: `Montageteam ${suffix} aktualisiert`,
          memberIds: [employee.id, updatedEditableEmployee.id],
          status: "active",
          changeReason: "Integrationstest der Teamhistorie",
          rowVersion: planningTeam.rowVersion
        })
      }
    );
    assert.equal(
      planningTeamUpdateResponse.status,
      200,
      await planningTeamUpdateResponse.clone().text()
    );
    const updatedPlanningTeam = (
      await planningTeamUpdateResponse.json()
    ).planningTeam;
    assert.equal(updatedPlanningTeam.rowVersion, planningTeam.rowVersion + 1);

    const stalePlanningTeamResponse = await fetch(
      `${baseUrl}/api/v1/admin/planning-teams/${planningTeam.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: plannerCookie },
        body: JSON.stringify({
          name: `Montageteam ${suffix} veraltet`,
          memberIds: [employee.id, updatedEditableEmployee.id],
          status: "active",
          changeReason: "Veraltete Änderung muss scheitern",
          rowVersion: planningTeam.rowVersion
        })
      }
    );
    assert.equal(stalePlanningTeamResponse.status, 409);
    assert.equal(
      (await stalePlanningTeamResponse.json()).error.code,
      "row_version_conflict"
    );

    const planningDate = nextBusinessDate(nextBusinessDate(assignmentDate));
    const assignmentBatchResponse = await fetch(
      `${baseUrl}/api/v1/admin/assignment-batches`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: plannerCookie },
        body: JSON.stringify({
          employeeIds: [employee.id, updatedEditableEmployee.id],
          planningTeamId: planningTeam.id,
          reportResponsibleEmployeeId: updatedEditableEmployee.id,
          constructionSiteId: structuredSite.id,
          workDate: planningDate,
          plannedStartTime: "08:00",
          plannedDurationMinutes: 360,
          comment: "Plantafel-Teamtest"
        })
      }
    );
    assert.equal(
      assignmentBatchResponse.status,
      201,
      await assignmentBatchResponse.clone().text()
    );
    const teamAssignments = (await assignmentBatchResponse.json()).assignments;
    assert.equal(teamAssignments.length, 2);
    assert.ok(teamAssignments.every((item) => item.planningTeamId === planningTeam.id));
    assert.equal(
      teamAssignments.filter((item) => item.reportResponsible).length,
      1
    );

    const reassignedTeamMemberResponse = await fetch(
      `${baseUrl}/api/v1/admin/assignments/${teamAssignments[0].id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: plannerCookie },
        body: JSON.stringify({
          employeeId: foreman.id,
          workDate: planningDate,
          changeReason: "Integrationstest verschiebt die Mitarbeiterzeile",
          rowVersion: teamAssignments[0].rowVersion
        })
      }
    );
    assert.equal(
      reassignedTeamMemberResponse.status,
      200,
      await reassignedTeamMemberResponse.clone().text()
    );
    const reassignedTeamMember = (
      await reassignedTeamMemberResponse.json()
    ).assignment;
    assert.equal(reassignedTeamMember.employeeId, foreman.id);
    assert.equal(reassignedTeamMember.plannedStartTime, "08:00:00");
    assert.equal(reassignedTeamMember.planningTeamId, planningTeam.id);

    const overlappingAssignmentResponse = await fetch(
      `${baseUrl}/api/v1/admin/assignments`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: plannerCookie },
        body: JSON.stringify({
          employeeId: updatedEditableEmployee.id,
          constructionSiteId: site.id,
          workDate: planningDate,
          plannedStartTime: "10:00",
          plannedDurationMinutes: 120,
          comment: "Muss als Überschneidung abgewiesen werden"
        })
      }
    );
    assert.equal(overlappingAssignmentResponse.status, 409);
    assert.equal(
      (await overlappingAssignmentResponse.json()).error.code,
      "assignment_time_overlap"
    );

    const planningOverviewResponse = await fetch(
      `${baseUrl}/api/v1/admin/overview?date=${planningDate}`,
      { headers: { Cookie: plannerCookie } }
    );
    assert.equal(planningOverviewResponse.status, 200);
    const planningOverview = (await planningOverviewResponse.json()).overview;
    assert.ok(planningOverview.planningTeams.some((item) => item.id === planningTeam.id));
    assert.equal(
      planningOverview.planningAssignments.filter(
        (item) => item.planningTeamId === planningTeam.id
      ).length,
      2
    );

    const installerTaskResponse = await fetch(`${baseUrl}/api/v1/admin/site-tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: plannerCookie },
      body: JSON.stringify({
        constructionSiteId: site.id,
        title: "Stromkreise kennzeichnen",
        details: "Beschriftung direkt vor Ort abschließen",
        assignedUserId: employee.id,
        priority: "normal",
        dueDate: assignmentDate
      })
    });
    assert.equal(installerTaskResponse.status, 201, await installerTaskResponse.clone().text());
    installerTask = (await installerTaskResponse.json()).siteTask;
    assert.equal(installerTask.status, "open");

    const blockedArchiveResponse = await fetch(
      `${baseUrl}/api/v1/admin/construction-sites/${site.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: plannerCookie },
        body: JSON.stringify({
          name: site.name,
          installerShortText: site.shortText,
          street: site.address.street,
          houseNumber: site.address.houseNumber,
          postalCode: site.address.postalCode,
          city: site.address.city,
          status: "archived",
          rowVersion: site.rowVersion
        })
      }
    );
    assert.equal(blockedArchiveResponse.status, 409);
    assert.equal((await blockedArchiveResponse.json()).error.code, "site_has_assignments");
  });

  await t.test("Stundenkonten, Abwesenheiten und Feiertage", async () => {
    const employeeLogin = await fetch(`${baseUrl}/api/v1/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: config.allowedOrigin },
      body: JSON.stringify({
        companyNumber,
        personnelNumber: employeePersonnelNumber,
        password: employeeTemporaryPassword
      })
    });
    assert.equal(employeeLogin.status, 201);
    employeeCookie = employeeLogin.headers.get("set-cookie").split(";", 1)[0];
    const employeeSession = (await employeeLogin.json()).session;
    assert.equal(employeeSession.user.mustChangePassword, true);
    assert.deepEqual(employeeSession.user.roles, ["installer"]);

    const blockedBeforePasswordChange = await fetch(
      `${baseUrl}/api/v1/site-assignments/${assignmentDate}`,
      { headers: { Cookie: employeeCookie } }
    );
    assert.equal(blockedBeforePasswordChange.status, 403);

    const changedPassword = await fetch(`${baseUrl}/api/v1/account/initial-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: employeeCookie },
      body: JSON.stringify({ newPassword: employeePassword })
    });
    assert.equal(changedPassword.status, 200);
    assert.equal((await changedPassword.json()).session.user.mustChangePassword, false);

    const timeAccountYear = Number(assignmentDate.slice(0, 4));

    // Den Feiertagskalender richtet der Test selbst ein.
    //
    // Vorher stand er in der mitgelieferten Firma bereits auf Sachsen, und der
    // Test las ihn als gegeben. Eine frisch angelegte Firma hat keinen - was
    // hier geprueft wird, ist aber das Verhalten der Schnittstelle, nicht der
    // Inhalt der Startdaten.
    const kalenderStand = await fetch(
      `${baseUrl}/api/v1/admin/holiday-calendar?year=${timeAccountYear}`,
      { headers: { Cookie: cookie } }
    );
    assert.equal(kalenderStand.status, 200, await kalenderStand.clone().text());
    const vorhandenerKalender = (await kalenderStand.json()).holidayCalendar;
    if (vorhandenerKalender.federalStateCode !== "SN") {
      const kalenderAnlegen = await fetch(`${baseUrl}/api/v1/admin/holiday-calendar`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({
          year: timeAccountYear,
          countryCode: "DE",
          federalStateCode: "SN",
          rowVersion: vorhandenerKalender.rowVersion
        })
      });
      assert.equal(kalenderAnlegen.status, 200, await kalenderAnlegen.clone().text());
      assert.equal((await kalenderAnlegen.json()).holidayCalendar.federalStateCode, "SN");
    }

    const ownTimeAccountResponse = await fetch(
      `${baseUrl}/api/v1/time-account?year=${timeAccountYear}`,
      { headers: { Cookie: employeeCookie } }
    );
    assert.equal(
      ownTimeAccountResponse.status,
      200,
      await ownTimeAccountResponse.clone().text()
    );
    const ownTimeAccount = (await ownTimeAccountResponse.json()).timeAccount;
    assert.equal(ownTimeAccount.employeeId, employee.id);
    assert.equal(ownTimeAccount.enabled, true);
    assert.equal(ownTimeAccount.annualVacationDays, 30);
    assert.equal(ownTimeAccount.months.length, 12);
    assert.equal(ownTimeAccount.holidayCalendar.configured, true);
    assert.equal(ownTimeAccount.holidayCalendar.federalStateCode, "SN");
    assert.ok(
      ownTimeAccount.holidayCalendar.holidays.some(
        (holiday) => holiday.name === "Buß- und Bettag"
      )
    );

    const forbiddenEmployeeTimeAccountOverview = await fetch(
      `${baseUrl}/api/v1/admin/time-accounts?year=${timeAccountYear}`,
      { headers: { Cookie: employeeCookie } }
    );
    assert.equal(forbiddenEmployeeTimeAccountOverview.status, 403);

    const plannerTimeAccountsResponse = await fetch(
      `${baseUrl}/api/v1/admin/time-accounts?year=${timeAccountYear}`,
      { headers: { Cookie: plannerCookie } }
    );
    assert.equal(
      plannerTimeAccountsResponse.status,
      200,
      await plannerTimeAccountsResponse.clone().text()
    );
    const plannerTimeAccounts = (await plannerTimeAccountsResponse.json()).timeAccounts;
    const employeeTimeAccount = plannerTimeAccounts.accounts.find(
      (account) => account.employeeId === employee.id
    );
    assert.ok(employeeTimeAccount);
    assert.equal(plannerTimeAccounts.holidayCalendar.federalStateCode, "SN");

    const plannerHolidayCalendarResponse = await fetch(
      `${baseUrl}/api/v1/admin/holiday-calendar?year=${timeAccountYear}`,
      { headers: { Cookie: plannerCookie } }
    );
    assert.equal(plannerHolidayCalendarResponse.status, 200);
    const initialHolidayCalendar =
      (await plannerHolidayCalendarResponse.json()).holidayCalendar;
    assert.equal(initialHolidayCalendar.federalStateCode, "SN");

    const forbiddenPlannerHolidayCalendarChange = await fetch(
      `${baseUrl}/api/v1/admin/holiday-calendar`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: plannerCookie },
        body: JSON.stringify({
          year: timeAccountYear,
          countryCode: "DE",
          federalStateCode: "BE",
          rowVersion: initialHolidayCalendar.rowVersion
        })
      }
    );
    assert.equal(forbiddenPlannerHolidayCalendarChange.status, 403);
    assert.equal(
      (await forbiddenPlannerHolidayCalendarChange.json()).error.code,
      "time_account_administration_forbidden"
    );

    const holidayCalendarChange = await fetch(
      `${baseUrl}/api/v1/admin/holiday-calendar`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({
          year: timeAccountYear,
          countryCode: "DE",
          federalStateCode: "BE",
          rowVersion: initialHolidayCalendar.rowVersion
        })
      }
    );
    assert.equal(
      holidayCalendarChange.status,
      200,
      await holidayCalendarChange.clone().text()
    );
    const berlinHolidayCalendar = (await holidayCalendarChange.json()).holidayCalendar;
    assert.equal(berlinHolidayCalendar.federalStateCode, "BE");
    assert.ok(berlinHolidayCalendar.rowVersion > initialHolidayCalendar.rowVersion);
    assert.ok(berlinHolidayCalendar.updatedAt);
    assert.ok(berlinHolidayCalendar.updatedByName);

    const staleHolidayCalendarChange = await fetch(
      `${baseUrl}/api/v1/admin/holiday-calendar`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({
          year: timeAccountYear,
          countryCode: "DE",
          federalStateCode: "SN",
          rowVersion: initialHolidayCalendar.rowVersion
        })
      }
    );
    assert.equal(staleHolidayCalendarChange.status, 409);
    assert.equal(
      (await staleHolidayCalendarChange.json()).error.code,
      "row_version_conflict"
    );

    const holidayCalendarRestore = await fetch(
      `${baseUrl}/api/v1/admin/holiday-calendar`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({
          year: timeAccountYear,
          countryCode: "DE",
          federalStateCode: "SN",
          rowVersion: berlinHolidayCalendar.rowVersion
        })
      }
    );
    assert.equal(holidayCalendarRestore.status, 200);
    const restoredHolidayCalendar = (await holidayCalendarRestore.json()).holidayCalendar;
    assert.equal(restoredHolidayCalendar.federalStateCode, "SN");

    const holidayClosurePayload = {
      clientClosureId: randomUUID(),
      holidayDate: `${timeAccountYear}-12-24`,
      name: "Betriebliche Weihnachtsruhe",
      note: "Geprüfte Betriebsvereinbarung"
    };
    const holidayClosureResponse = await fetch(
      `${baseUrl}/api/v1/admin/holiday-calendar/closures`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify(holidayClosurePayload)
      }
    );
    assert.equal(
      holidayClosureResponse.status,
      201,
      await holidayClosureResponse.clone().text()
    );
    const holidayClosure = (await holidayClosureResponse.json()).closure;
    assert.equal(holidayClosure.status, "active");
    assert.equal(holidayClosure.holidayDate, `${timeAccountYear}-12-24`);

    const repeatedHolidayClosureResponse = await fetch(
      `${baseUrl}/api/v1/admin/holiday-calendar/closures`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify(holidayClosurePayload)
      }
    );
    assert.equal(repeatedHolidayClosureResponse.status, 200);
    assert.equal((await repeatedHolidayClosureResponse.json()).idempotent, true);

    const duplicateHolidayClosureResponse = await fetch(
      `${baseUrl}/api/v1/admin/holiday-calendar/closures`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({
          ...holidayClosurePayload,
          clientClosureId: randomUUID(),
          name: "Doppelte Anlage"
        })
      }
    );
    assert.equal(duplicateHolidayClosureResponse.status, 409);
    assert.equal(
      (await duplicateHolidayClosureResponse.json()).error.code,
      "holiday_closure_date_conflict"
    );

    const holidayClosureCancellation = await fetch(
      `${baseUrl}/api/v1/admin/holiday-calendar/closures/${holidayClosure.id}/cancel`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({
          rowVersion: holidayClosure.rowVersion,
          cancellationNote: "Nur für den Integrationstest angelegt"
        })
      }
    );
    assert.equal(holidayClosureCancellation.status, 200);
    assert.equal((await holidayClosureCancellation.json()).closure.status, "cancelled");

    const forbiddenPlannerTimeAccountChange = await fetch(
      `${baseUrl}/api/v1/admin/time-accounts/${employee.id}/profile`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: plannerCookie },
        body: JSON.stringify({
          year: timeAccountYear,
          enabled: true,
          accountStartDate: `${timeAccountYear}-01-01`,
          annualVacationDays: 28.5,
          profileRowVersion: employeeTimeAccount.profileRowVersion,
          vacationRowVersion: employeeTimeAccount.vacationRowVersion
        })
      }
    );
    assert.equal(forbiddenPlannerTimeAccountChange.status, 403);
    assert.equal(
      (await forbiddenPlannerTimeAccountChange.json()).error.code,
      "time_account_administration_forbidden"
    );

    const timeAccountProfileResponse = await fetch(
      `${baseUrl}/api/v1/admin/time-accounts/${employee.id}/profile`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({
          year: timeAccountYear,
          enabled: true,
          accountStartDate: `${timeAccountYear}-01-01`,
          annualVacationDays: 28.5,
          profileRowVersion: employeeTimeAccount.profileRowVersion,
          vacationRowVersion: employeeTimeAccount.vacationRowVersion
        })
      }
    );
    assert.equal(
      timeAccountProfileResponse.status,
      200,
      await timeAccountProfileResponse.clone().text()
    );
    const updatedTimeAccountProfile = (await timeAccountProfileResponse.json()).profile;
    assert.equal(updatedTimeAccountProfile.annualVacationDays, 28.5);
    assert.ok(
      updatedTimeAccountProfile.profileRowVersion > employeeTimeAccount.profileRowVersion
    );
    assert.ok(
      updatedTimeAccountProfile.vacationRowVersion > employeeTimeAccount.vacationRowVersion
    );

    const staleTimeAccountProfileResponse = await fetch(
      `${baseUrl}/api/v1/admin/time-accounts/${employee.id}/profile`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({
          year: timeAccountYear,
          enabled: false,
          accountStartDate: `${timeAccountYear}-01-01`,
          annualVacationDays: 28.5,
          profileRowVersion: employeeTimeAccount.profileRowVersion,
          vacationRowVersion: employeeTimeAccount.vacationRowVersion
        })
      }
    );
    assert.equal(staleTimeAccountProfileResponse.status, 409);
    assert.equal(
      (await staleTimeAccountProfileResponse.json()).error.code,
      "row_version_conflict"
    );

    const adjustmentClientId = randomUUID();
    const timeAccountAdjustmentPayload = {
      employeeId: employee.id,
      clientAdjustmentId: adjustmentClientId,
      adjustmentDate: `${timeAccountYear}-01-02`,
      adjustmentMinutes: 90,
      adjustmentType: "opening_balance",
      note: "Geprüfter Startsaldo"
    };
    const timeAccountAdjustmentResponse = await fetch(
      `${baseUrl}/api/v1/admin/time-account-adjustments`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify(timeAccountAdjustmentPayload)
      }
    );
    assert.equal(
      timeAccountAdjustmentResponse.status,
      201,
      await timeAccountAdjustmentResponse.clone().text()
    );
    assert.equal(
      (await timeAccountAdjustmentResponse.json()).adjustment.adjustmentMinutes,
      90
    );

    const repeatedTimeAccountAdjustmentResponse = await fetch(
      `${baseUrl}/api/v1/admin/time-account-adjustments`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify(timeAccountAdjustmentPayload)
      }
    );
    assert.equal(repeatedTimeAccountAdjustmentResponse.status, 200);
    assert.equal(
      (await repeatedTimeAccountAdjustmentResponse.json()).idempotent,
      true
    );

    const forbiddenEmployeeAdjustment = await fetch(
      `${baseUrl}/api/v1/admin/time-account-adjustments`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: employeeCookie },
        body: JSON.stringify({
          ...timeAccountAdjustmentPayload,
          clientAdjustmentId: randomUUID()
        })
      }
    );
    assert.equal(forbiddenEmployeeAdjustment.status, 403);

    const adjustedOwnTimeAccountResponse = await fetch(
      `${baseUrl}/api/v1/time-account?year=${timeAccountYear}`,
      { headers: { Cookie: employeeCookie } }
    );
    assert.equal(adjustedOwnTimeAccountResponse.status, 200);
    const adjustedOwnTimeAccount = (await adjustedOwnTimeAccountResponse.json()).timeAccount;
    assert.equal(adjustedOwnTimeAccount.annualVacationDays, 28.5);
    assert.equal(adjustedOwnTimeAccount.totals.adjustmentMinutes, 90);
    assert.equal(adjustedOwnTimeAccount.adjustments.length, 1);

    const absenceStart = "2027-08-10";
    const absenceEnd = "2027-08-14";
    const absenceResponse = await fetch(`${baseUrl}/api/v1/absences`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: employeeCookie },
      body: JSON.stringify({
        absenceType: "vacation",
        startDate: absenceStart,
        endDate: absenceEnd,
        dayPart: "full_day",
        note: "Familienurlaub"
      })
    });
    assert.equal(absenceResponse.status, 201, await absenceResponse.clone().text());
    const submittedAbsence = (await absenceResponse.json()).absence;
    assert.equal(submittedAbsence.status, "office_review");
    assert.equal(submittedAbsence.rowVersion, 1);
    assert.equal(submittedAbsence.history.length, 1);

    const ownAbsencesResponse = await fetch(
      `${baseUrl}/api/v1/absences?from=2027-01-01&to=2027-12-31`,
      { headers: { Cookie: employeeCookie } }
    );
    assert.equal(ownAbsencesResponse.status, 200);
    assert.equal((await ownAbsencesResponse.json()).absences[0].id, submittedAbsence.id);

    const absencePlannerOverviewResponse = await fetch(
      `${baseUrl}/api/v1/admin/overview?date=${assignmentDate}`,
      { headers: { Cookie: plannerCookie } }
    );
    assert.equal(absencePlannerOverviewResponse.status, 200);
    const absencePlannerOverview = (await absencePlannerOverviewResponse.json()).overview;
    assert.equal(absencePlannerOverview.canReviewAbsenceOffice, true);
    assert.equal(absencePlannerOverview.canApproveAbsenceManagement, false);
    assert.ok(absencePlannerOverview.absences.some((item) => item.id === submittedAbsence.id));

    const forbiddenDirectorOfficeReview = await fetch(
      `${baseUrl}/api/v1/admin/absence-requests/${submittedAbsence.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: directorCookie },
        body: JSON.stringify({
          action: "approve",
          rowVersion: submittedAbsence.rowVersion
        })
      }
    );
    assert.equal(forbiddenDirectorOfficeReview.status, 403);
    assert.equal(
      (await forbiddenDirectorOfficeReview.json()).error.code,
      "absence_office_review_forbidden"
    );

    const officeApprovedAbsenceResponse = await fetch(
      `${baseUrl}/api/v1/admin/absence-requests/${submittedAbsence.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: plannerCookie },
        body: JSON.stringify({
          action: "approve",
          comment: "Einsatzplanung geprüft",
          rowVersion: submittedAbsence.rowVersion
        })
      }
    );
    assert.equal(
      officeApprovedAbsenceResponse.status,
      200,
      await officeApprovedAbsenceResponse.clone().text()
    );
    const officeApprovedAbsence = (await officeApprovedAbsenceResponse.json()).absence;
    assert.equal(officeApprovedAbsence.status, "management_review");
    assert.equal(officeApprovedAbsence.rowVersion, 2);

    const forbiddenPlannerManagementReview = await fetch(
      `${baseUrl}/api/v1/admin/absence-requests/${submittedAbsence.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: plannerCookie },
        body: JSON.stringify({
          action: "approve",
          rowVersion: officeApprovedAbsence.rowVersion
        })
      }
    );
    assert.equal(forbiddenPlannerManagementReview.status, 403);
    assert.equal(
      (await forbiddenPlannerManagementReview.json()).error.code,
      "absence_management_approval_forbidden"
    );

    const conflictingAbsenceAssignmentResponse = await fetch(
      `${baseUrl}/api/v1/admin/assignments`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: plannerCookie },
        body: JSON.stringify({
          employeeId: employee.id,
          constructionSiteId: site.id,
          workDate: absenceStart,
          plannedStartTime: "07:00",
          reportResponsible: false
        })
      }
    );
    assert.equal(
      conflictingAbsenceAssignmentResponse.status,
      201,
      await conflictingAbsenceAssignmentResponse.clone().text()
    );
    const conflictingAbsenceAssignment = (await conflictingAbsenceAssignmentResponse.json()).assignment;

    const conflictedManagementReviewResponse = await fetch(
      `${baseUrl}/api/v1/admin/absence-requests/${submittedAbsence.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: directorCookie },
        body: JSON.stringify({
          action: "approve",
          rowVersion: officeApprovedAbsence.rowVersion
        })
      }
    );
    assert.equal(conflictedManagementReviewResponse.status, 409);
    assert.equal(
      (await conflictedManagementReviewResponse.json()).error.code,
      "absence_assignment_conflict"
    );

    const resolvedAbsenceAssignmentResponse = await fetch(
      `${baseUrl}/api/v1/admin/assignments/${conflictingAbsenceAssignment.id}/cancel`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: plannerCookie },
        body: JSON.stringify({ changeReason: "Urlaubsfreigabe hat Vorrang" })
      }
    );
    assert.equal(
      resolvedAbsenceAssignmentResponse.status,
      200,
      await resolvedAbsenceAssignmentResponse.clone().text()
    );

    const managementApprovedAbsenceResponse = await fetch(
      `${baseUrl}/api/v1/admin/absence-requests/${submittedAbsence.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: directorCookie },
        body: JSON.stringify({
          action: "approve",
          comment: "Verbindlich freigegeben",
          rowVersion: officeApprovedAbsence.rowVersion
        })
      }
    );
    assert.equal(
      managementApprovedAbsenceResponse.status,
      200,
      await managementApprovedAbsenceResponse.clone().text()
    );
    const approvedAbsence = (await managementApprovedAbsenceResponse.json()).absence;
    assert.equal(approvedAbsence.status, "approved");
    assert.equal(approvedAbsence.rowVersion, 3);
    assert.equal(approvedAbsence.history.length, 3);

    const approvedVacationTimeAccountResponse = await fetch(
      `${baseUrl}/api/v1/time-account?year=2027`,
      { headers: { Cookie: employeeCookie } }
    );
    assert.equal(
      approvedVacationTimeAccountResponse.status,
      200,
      await approvedVacationTimeAccountResponse.clone().text()
    );
    const approvedVacationTimeAccount =
      (await approvedVacationTimeAccountResponse.json()).timeAccount;
    assert.equal(approvedVacationTimeAccount.annualVacationDays, 30);
    assert.equal(approvedVacationTimeAccount.vacation.approvedDays, 4);
    assert.equal(approvedVacationTimeAccount.vacation.pendingDays, 0);
    assert.equal(approvedVacationTimeAccount.vacation.remainingDays, 26);

    const blockedAbsenceAssignmentResponse = await fetch(
      `${baseUrl}/api/v1/admin/assignments`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: plannerCookie },
        body: JSON.stringify({
          employeeId: employee.id,
          constructionSiteId: site.id,
          workDate: absenceStart,
          plannedStartTime: "07:00",
          reportResponsible: false
        })
      }
    );
    assert.equal(blockedAbsenceAssignmentResponse.status, 409);
    assert.equal((await blockedAbsenceAssignmentResponse.json()).error.code, "employee_absent");
  });

  await t.test("Mobile Baustellenarbeit", async () => {
    const employeeAssignments = await fetch(
      `${baseUrl}/api/v1/site-assignments/${assignmentDate}`,
      { headers: { Cookie: employeeCookie } }
    );
    assert.equal(employeeAssignments.status, 200);
    const employeeAssignment = (await employeeAssignments.json()).assignments[0];
    assert.equal(employeeAssignment.constructionSite.id, site.id);
    assert.equal(employeeAssignment.plannedDurationMinutes, 450);
    assert.equal(employeeAssignment.comment, "API-Test Arbeitsanweisung");
    assert.equal(employeeAssignment.reportResponsible, true);
    assert.equal(employeeAssignment.reportResponsibilitySource, "automatic");

    const assignedInstallerDashboardResponse = await fetch(
      `${baseUrl}/api/v1/construction-sites/${site.id}/dashboard?date=${assignmentDate}`,
      { headers: { Cookie: employeeCookie } }
    );
    assert.equal(
      assignedInstallerDashboardResponse.status,
      200,
      await assignedInstallerDashboardResponse.clone().text()
    );
    const assignedInstallerDashboard = (await assignedInstallerDashboardResponse.json()).dashboard;
    assert.equal(assignedInstallerDashboard.site.id, site.id);
    assert.equal(assignedInstallerDashboard.viewer.canLead, true);
    assert.equal(assignedInstallerDashboard.viewer.canManage, false);
    assert.equal(assignedInstallerDashboard.viewer.reportResponsible, true);
    assert.equal(assignedInstallerDashboard.assignment.plannedDurationMinutes, 450);
    assert.equal(assignedInstallerDashboard.assignment.comment, "API-Test Arbeitsanweisung");
    assert.equal(
      assignedInstallerDashboard.team.find((member) => member.id === employee.id).phone,
      "+49 170 1234567"
    );
    assert.ok(assignedInstallerDashboard.tasks.some((item) => item.id === installerTask.id));

    const startedInstallerTaskResponse = await fetch(
      `${baseUrl}/api/v1/construction-sites/${site.id}/tasks/${installerTask.id}?date=${assignmentDate}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: employeeCookie },
        body: JSON.stringify({ status: "in_progress", rowVersion: installerTask.rowVersion })
      }
    );
    assert.equal(
      startedInstallerTaskResponse.status,
      200,
      await startedInstallerTaskResponse.clone().text()
    );
    const startedInstallerTask = (await startedInstallerTaskResponse.json()).siteTask;
    assert.equal(startedInstallerTask.status, "in_progress");

    const finishedInstallerTaskResponse = await fetch(
      `${baseUrl}/api/v1/construction-sites/${site.id}/tasks/${installerTask.id}?date=${assignmentDate}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: employeeCookie },
        body: JSON.stringify({ status: "done", rowVersion: startedInstallerTask.rowVersion })
      }
    );
    assert.equal(
      finishedInstallerTaskResponse.status,
      200,
      await finishedInstallerTaskResponse.clone().text()
    );
    const finishedInstallerTask = (await finishedInstallerTaskResponse.json()).siteTask;
    assert.equal(finishedInstallerTask.status, "done");
    assert.ok(finishedInstallerTask.completedAt);

    const forbiddenMobileArchiveResponse = await fetch(
      `${baseUrl}/api/v1/construction-sites/${site.id}/tasks/${installerTask.id}?date=${assignmentDate}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: employeeCookie },
        body: JSON.stringify({ status: "archived", rowVersion: finishedInstallerTask.rowVersion })
      }
    );
    assert.equal(forbiddenMobileArchiveResponse.status, 403);
    assert.equal(
      (await forbiddenMobileArchiveResponse.json()).error.code,
      "site_task_archive_forbidden"
    );

    const installerPhotoResponse = await fetch(
      `${baseUrl}/api/v1/construction-sites/${site.id}/photos?date=${assignmentDate}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: employeeCookie },
        body: JSON.stringify({
          title: `Monteurfoto ${suffix}`,
          fileName: `Monteurfoto-${suffix}.jpg`,
          mimeType: "image/jpeg",
          contentBase64: Buffer.from(`JPEG-Monteurfoto-${suffix}`).toString("base64")
        })
      }
    );
    assert.equal(installerPhotoResponse.status, 201, await installerPhotoResponse.clone().text());
    assert.equal((await installerPhotoResponse.json()).document.category, "photo");

    const unassignedInstallerDashboardResponse = await fetch(
      `${baseUrl}/api/v1/construction-sites/${structuredSite.id}/dashboard?date=${assignmentDate}`,
      { headers: { Cookie: employeeCookie } }
    );
    assert.equal(unassignedInstallerDashboardResponse.status, 403);
    assert.equal((await unassignedInstallerDashboardResponse.json()).error.code, "site_not_assigned");

    const unassignedInstallerTaskResponse = await fetch(
      `${baseUrl}/api/v1/construction-sites/${structuredSite.id}/tasks/${completedSiteTask.id}?date=${assignmentDate}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: employeeCookie },
        body: JSON.stringify({ status: "in_progress", rowVersion: completedSiteTask.rowVersion })
      }
    );
    assert.equal(unassignedInstallerTaskResponse.status, 403);
    assert.equal((await unassignedInstallerTaskResponse.json()).error.code, "site_not_assigned");

    const unassignedInstallerPhotoResponse = await fetch(
      `${baseUrl}/api/v1/construction-sites/${structuredSite.id}/photos?date=${assignmentDate}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: employeeCookie },
        body: JSON.stringify({
          title: "Unzulässiges Fremdfoto",
          fileName: "Fremdfoto.jpg",
          mimeType: "image/jpeg",
          contentBase64: Buffer.from("JPEG-Fremdfoto").toString("base64")
        })
      }
    );
    assert.equal(unassignedInstallerPhotoResponse.status, 403);
    assert.equal((await unassignedInstallerPhotoResponse.json()).error.code, "site_not_assigned");

    const forbiddenInstallerReport = await fetch(`${baseUrl}/api/v1/site-reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: employeeCookie },
      body: JSON.stringify({
        clientReportId: randomUUID(),
        constructionSiteId: structuredSite.id,
        reportType: "montage",
        workDate: assignmentDate,
        sourceMode: "digital",
        summary: "Monteur darf diesen Bericht nicht erstellen"
      })
    });
    assert.equal(forbiddenInstallerReport.status, 403);
    assert.equal((await forbiddenInstallerReport.json()).error.code, "report_forbidden");

    const secondTeamAssignmentResponse = await fetch(`${baseUrl}/api/v1/admin/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: plannerCookie },
      body: JSON.stringify({
        employeeId: updatedEditableEmployee.id,
        constructionSiteId: site.id,
        workDate: assignmentDate,
        plannedStartTime: "07:30",
        plannedDurationMinutes: 300,
        comment: "Zweiter Mitarbeiter beendet automatische Vorarbeiterfunktion"
      })
    });
    assert.equal(
      secondTeamAssignmentResponse.status,
      201,
      await secondTeamAssignmentResponse.clone().text()
    );
    const secondTeamAssignment = (await secondTeamAssignmentResponse.json()).assignment;
    assert.equal(secondTeamAssignment.reportResponsible, false);

    const reassignedEmployeeAssignments = await fetch(
      `${baseUrl}/api/v1/site-assignments/${assignmentDate}`,
      { headers: { Cookie: employeeCookie } }
    );
    assert.equal(reassignedEmployeeAssignments.status, 200);
    assert.equal(
      (await reassignedEmployeeAssignments.json()).assignments[0].reportResponsible,
      false
    );

    const manualForemanUpdateResponse = await fetch(
      `${baseUrl}/api/v1/admin/assignments/${secondTeamAssignment.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: plannerCookie },
        body: JSON.stringify({
          workDate: assignmentDate,
          plannedStartTime: "07:30",
          plannedDurationMinutes: 360,
          comment: "Vorarbeiter übernimmt Koordination und Bericht",
          reportResponsible: true,
          changeReason: "Vorarbeiter für das Zweierteam festgelegt",
          rowVersion: secondTeamAssignment.rowVersion
        })
      }
    );
    assert.equal(
      manualForemanUpdateResponse.status,
      200,
      await manualForemanUpdateResponse.clone().text()
    );
    const manualForemanAssignment = (await manualForemanUpdateResponse.json()).assignment;
    assert.equal(manualForemanAssignment.plannedDurationMinutes, 360);
    assert.equal(manualForemanAssignment.comment, "Vorarbeiter übernimmt Koordination und Bericht");
    assert.equal(manualForemanAssignment.reportResponsible, true);
    assert.equal(manualForemanAssignment.reportResponsibilitySource, "manual");

    const forbiddenOverview = await fetch(
      `${baseUrl}/api/v1/admin/overview?date=${assignmentDate}`,
      { headers: { Cookie: employeeCookie } }
    );
    assert.equal(forbiddenOverview.status, 403);

    const currentPlanningOverviewResponse = await fetch(
      `${baseUrl}/api/v1/admin/overview?date=${assignmentDate}`,
      { headers: { Cookie: plannerCookie } }
    );
    assert.equal(currentPlanningOverviewResponse.status, 200);
    const currentPlanningAssignment = (
      await currentPlanningOverviewResponse.json()
    ).overview.planningAssignments.find((item) => item.id === assignment.id);
    assert.ok(currentPlanningAssignment);

    const movedDate = nextBusinessDate(assignmentDate);
    const movedAssignment = await fetch(`${baseUrl}/api/v1/admin/assignments/${assignment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: plannerCookie },
      body: JSON.stringify({
        workDate: movedDate,
        changeReason: "Integrationstest verschiebt den Termin",
        rowVersion: currentPlanningAssignment.rowVersion
      })
    });
    assert.equal(movedAssignment.status, 200, await movedAssignment.clone().text());
    const movedAssignmentBody = (await movedAssignment.json()).assignment;
    assert.equal(movedAssignmentBody.workDate, movedDate);
    assert.equal(movedAssignmentBody.plannedStartTime, "07:30:00");
    assert.equal(movedAssignmentBody.plannedDurationMinutes, 450);
    assert.equal(movedAssignmentBody.comment, "API-Test Arbeitsanweisung");

    const originalDayAssignments = await fetch(
      `${baseUrl}/api/v1/site-assignments/${assignmentDate}`,
      { headers: { Cookie: employeeCookie } }
    );
    assert.equal(originalDayAssignments.status, 200);
    assert.deepEqual((await originalDayAssignments.json()).assignments, []);

    const movedDayAssignments = await fetch(
      `${baseUrl}/api/v1/site-assignments/${movedDate}`,
      { headers: { Cookie: employeeCookie } }
    );
    assert.equal(movedDayAssignments.status, 200);
    assert.equal((await movedDayAssignments.json()).assignments[0].constructionSite.id, site.id);

    const movedWeekOverview = await fetch(
      `${baseUrl}/api/v1/admin/overview?date=${movedDate}`,
      { headers: { Cookie: plannerCookie } }
    );
    assert.equal(movedWeekOverview.status, 200);
    assert.ok((await movedWeekOverview.json()).overview.weekAssignments.some((item) => item.id === assignment.id));

    const cancelledAssignment = await fetch(
      `${baseUrl}/api/v1/admin/assignments/${assignment.id}/cancel`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: plannerCookie },
        body: JSON.stringify({ changeReason: "Integrationstest storniert den Termin" })
      }
    );
    assert.equal(cancelledAssignment.status, 200, await cancelledAssignment.clone().text());
    assert.equal((await cancelledAssignment.json()).assignment.status, "cancelled");

    const cancelledDayAssignments = await fetch(
      `${baseUrl}/api/v1/site-assignments/${movedDate}`,
      { headers: { Cookie: employeeCookie } }
    );
    assert.equal(cancelledDayAssignments.status, 200);
    assert.deepEqual((await cancelledDayAssignments.json()).assignments, []);

    assignments = await fetch(`${baseUrl}/api/v1/site-assignments/${assignmentDate}`, {
      headers: { Cookie: cookie }
    });
    assert.equal(assignments.status, 200);
    assert.deepEqual((await assignments.json()).assignments, []);
  });

  await t.test("Zeiterfassung, Korrekturen und Stundenzettel", async () => {
    // Dieser Abschnitt prüft die sofort wirksame Selbstkorrektur. Seit
    // Migration 046 ist das nicht mehr die Voreinstellung, sondern eine von der
    // Firma wählbare Regel; sie wird hier ausdrücklich gesetzt und am Ende
    // wieder auf die geprüfte Voreinstellung zurückgestellt.
    const immediatePolicy = await fetch(`${baseUrl}/api/v1/admin/time-correction-policy`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        policy: "immediate",
        reason: "Sofort wirksame Selbstkorrektur im Integrationstest prüfen"
      })
    });
    assert.equal(immediatePolicy.status, 200, await immediatePolicy.clone().text());

    const siteOptionsResponse = await fetch(
      `${baseUrl}/api/v1/time-tracking/site-options/${assignmentDate}`,
      { headers: { Cookie: cookie } }
    );
    assert.equal(siteOptionsResponse.status, 200, await siteOptionsResponse.clone().text());
    const siteOptions = (await siteOptionsResponse.json()).options;
    assert.ok(siteOptions.sites.some((option) => option.id === structuredSite.id));
    assert.ok(siteOptions.projects.some((option) => option.id === project.id));
    assert.ok(siteOptions.customers.some((option) => option.id === customer.id));

    const spontaneousSelectionResponse = await fetch(
      `${baseUrl}/api/v1/time-tracking/site-selection`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({
          workDate: assignmentDate,
          constructionSiteId: structuredSite.id,
          newOccurrence: false
        })
      }
    );
    assert.equal(
      spontaneousSelectionResponse.status,
      200,
      await spontaneousSelectionResponse.clone().text()
    );
    assert.ok(
      (await spontaneousSelectionResponse.json()).selection.assignments
        .some((item) => item.constructionSite.id === structuredSite.id)
    );

    const repeatedSelectionResponse = await fetch(
      `${baseUrl}/api/v1/time-tracking/site-selection`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({
          workDate: assignmentDate,
          constructionSiteId: structuredSite.id,
          newOccurrence: true
        })
      }
    );
    assert.equal(repeatedSelectionResponse.status, 200);
    assert.equal(
      (await repeatedSelectionResponse.json()).selection.assignments
        .filter((item) => item.constructionSite.id === structuredSite.id).length,
      2
    );

    const fieldSiteResponse = await fetch(`${baseUrl}/api/v1/time-tracking/sites`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        workDate: assignmentDate,
        projectId: project.id,
        name: `Feldbaustelle ${suffix}`,
        installerShortText: "Spontanen Einsatz dokumentieren",
        street: "Feldweg",
        houseNumber: "32",
        postalCode: "09599",
        city: "Freiberg"
      })
    });
    assert.equal(fieldSiteResponse.status, 201, await fieldSiteResponse.clone().text());
    const fieldSite = (await fieldSiteResponse.json()).selection.site;
    assert.equal(fieldSite.creationSource, "field");
    assert.equal(fieldSite.fieldReviewStatus, "pending");

    const confirmFieldSiteResponse = await fetch(
      `${baseUrl}/api/v1/admin/construction-sites/${fieldSite.id}/confirm`,
      { method: "POST", headers: { Cookie: plannerCookie } }
    );
    assert.equal(confirmFieldSiteResponse.status, 200, await confirmFieldSiteResponse.clone().text());
    assert.equal((await confirmFieldSiteResponse.json()).site.fieldReviewStatus, "confirmed");

    const fieldBundleResponse = await fetch(`${baseUrl}/api/v1/time-tracking/sites`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        workDate: assignmentDate,
        customerName: `Feldkunde ${suffix}`,
        name: `Feldneubau ${suffix}`,
        installerShortText: "Kunde und Baustelle spontan anlegen",
        street: "Neuweg",
        houseNumber: "7",
        postalCode: "09599",
        city: "Freiberg"
      })
    });
    assert.equal(fieldBundleResponse.status, 201, await fieldBundleResponse.clone().text());
    const fieldBundle = (await fieldBundleResponse.json()).selection.site;
    assert.equal(fieldBundle.customerName, `Feldkunde ${suffix}`);
    assert.equal(fieldBundle.projectName, "Baustellen");
    assert.equal(fieldBundle.fieldReviewStatus, "pending");

    const clockInAt = new Date(Date.now() - 8000).toISOString();
    const firstSiteArrivalAt = new Date(Date.now() - 7000).toISOString();
    const firstSiteDepartureAt = new Date(Date.now() - 6000).toISOString();
    const clockOutAt = new Date(Date.now() - 5000).toISOString();
    const clockIn = {
      clientEntryId: randomUUID(),
      entryType: "clock_in",
      recordedAt: clockInAt,
      clientCreatedAt: clockInAt
    };
    const first = await fetch(`${baseUrl}/api/v1/time-entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(clockIn)
    });
    assert.equal(first.status, 201, await first.clone().text());
    const firstClockInEntry = (await first.json()).timeEntry;

    const duplicate = await fetch(`${baseUrl}/api/v1/time-entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(clockIn)
    });
    assert.equal(duplicate.status, 200);
    assert.equal((await duplicate.json()).timeEntry.idempotent, true);

    const firstSiteArrivalResponse = await fetch(`${baseUrl}/api/v1/time-entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        clientEntryId: randomUUID(),
        entryType: "site_arrival",
        constructionSiteId: structuredSite.id,
        recordedAt: firstSiteArrivalAt,
        clientCreatedAt: firstSiteArrivalAt
      })
    });
    assert.equal(firstSiteArrivalResponse.status, 201, await firstSiteArrivalResponse.clone().text());
    const firstSiteArrival = (await firstSiteArrivalResponse.json()).timeEntry;

    const firstSiteDepartureResponse = await fetch(`${baseUrl}/api/v1/time-entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        clientEntryId: randomUUID(),
        entryType: "site_departure",
        constructionSiteId: structuredSite.id,
        recordedAt: firstSiteDepartureAt,
        clientCreatedAt: firstSiteDepartureAt
      })
    });
    assert.equal(firstSiteDepartureResponse.status, 201, await firstSiteDepartureResponse.clone().text());

    const clockOut = await fetch(`${baseUrl}/api/v1/time-entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        clientEntryId: randomUUID(),
        entryType: "clock_out",
        recordedAt: clockOutAt,
        clientCreatedAt: clockOutAt
      })
    });
    assert.equal(clockOut.status, 201, await clockOut.clone().text());
    const firstClockOutEntry = (await clockOut.json()).timeEntry;

    const siteMoveResponse = await fetch(
      `${baseUrl}/api/v1/time-entries/${firstSiteArrival.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({
          clientChangeId: randomUUID(),
          expectedRecordedAt: firstSiteArrival.recordedAt,
          recordedAt: firstSiteArrival.recordedAt,
          workDate: localDate(firstSiteArrival.recordedAt, config.timeZone),
          constructionSiteId: fieldSite.id,
          activityNote: "Falsche Baustellenwahl im Integrationstest berichtigt",
          reason: "Versehentlich auf der falschen Baustelle angemeldet"
        })
      }
    );
    assert.equal(siteMoveResponse.status, 200, await siteMoveResponse.clone().text());
    const siteMove = (await siteMoveResponse.json()).operation;
    assert.equal(siteMove.action, "move_site");
    assert.equal(siteMove.status, "applied");
    assert.equal(siteMove.changes.filter((change) => change.action === "replace").length, 2);

    const movedSiteWorkDayResponse = await fetch(
      `${baseUrl}/api/v1/work-days/${localDate(clockInAt, config.timeZone)}`,
      { headers: { Cookie: cookie } }
    );
    assert.equal(movedSiteWorkDayResponse.status, 200);
    const movedSiteEntries = (await movedSiteWorkDayResponse.json()).workDay.entries;
    assert.equal(movedSiteEntries.length, 4);
    assert.equal(movedSiteEntries.filter((entry) => (
      ["site_arrival", "site_departure"].includes(entry.entryType)
        && entry.constructionSiteId === fieldSite.id
    )).length, 2);
    assert.equal(movedSiteEntries.some((entry) => (
      entry.constructionSiteId === structuredSite.id
    )), false);

    const editedFirstClockOutAt = new Date(new Date(clockOutAt).valueOf() + 100).toISOString();
    const editChangeId = randomUUID();
    const firstClockOutEditPayload = {
      clientChangeId: editChangeId,
      expectedRecordedAt: firstClockOutEntry.recordedAt,
      recordedAt: editedFirstClockOutAt,
      workDate: localDate(editedFirstClockOutAt, config.timeZone),
      constructionSiteId: null,
      activityNote: "Integrationstest der direkten Zeitbearbeitung",
      breakMinutes: 0,
      reason: "Ersten Feierabend und Pause im Integrationstest korrigieren"
    };
    const editedFirstClockOutResponse = await fetch(
      `${baseUrl}/api/v1/time-entries/${firstClockOutEntry.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify(firstClockOutEditPayload)
      }
    );
    assert.equal(
      editedFirstClockOutResponse.status,
      200,
      await editedFirstClockOutResponse.clone().text()
    );
    const editedFirstClockOut = (await editedFirstClockOutResponse.json()).operation;
    assert.equal(editedFirstClockOut.status, "applied");
    assert.ok(editedFirstClockOut.changes.some((change) => change.action === "break_override"));

    const idempotentFirstClockOutEdit = await fetch(
      `${baseUrl}/api/v1/time-entries/${firstClockOutEntry.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify(firstClockOutEditPayload)
      }
    );
    assert.equal(idempotentFirstClockOutEdit.status, 200);
    assert.equal((await idempotentFirstClockOutEdit.json()).idempotent, true);

    const secondClockInAt = new Date(Date.now() - 2000).toISOString();
    const secondClockOutAt = new Date(Date.now() - 1000).toISOString();
    workDate = localDate(clockInAt, config.timeZone);
    const secondClockIn = await fetch(`${baseUrl}/api/v1/time-entry-additions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        workDate,
        entryType: "clock_in",
        recordedAt: secondClockInAt,
        reason: "Zweiter Arbeitsbeginn wurde im Integrationstest vergessen"
      })
    });
    assert.equal(secondClockIn.status, 201, await secondClockIn.clone().text());
    const secondClockInAddition = (await secondClockIn.json()).timeCorrection;
    assert.equal(secondClockInAddition.correctionKind, "addition");
    assert.equal(secondClockInAddition.status, "pending");

    const pendingAdditionWorkDayResponse = await fetch(
      `${baseUrl}/api/v1/work-days/${workDate}`,
      { headers: { Cookie: cookie } }
    );
    assert.equal(pendingAdditionWorkDayResponse.status, 200);
    const pendingAdditionWorkDay = (await pendingAdditionWorkDayResponse.json()).workDay;
    assert.equal(pendingAdditionWorkDay.entries.length, 4);
    assert.equal(pendingAdditionWorkDay.hasPendingCorrection, true);

    const approveAdditionResponse = await fetch(
      `${baseUrl}/api/v1/admin/time-entry-corrections/${secondClockInAddition.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: plannerCookie },
        body: JSON.stringify({ decision: "approved" })
      }
    );
    assert.equal(approveAdditionResponse.status, 200, await approveAdditionResponse.clone().text());
    assert.equal((await approveAdditionResponse.json()).timeCorrection.status, "approved");

    const secondClockOut = await fetch(`${baseUrl}/api/v1/time-entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        clientEntryId: randomUUID(),
        entryType: "clock_out",
        recordedAt: secondClockOutAt,
        clientCreatedAt: secondClockOutAt
      })
    });
    assert.equal(secondClockOut.status, 201, await secondClockOut.clone().text());
    const secondClockOutEntry = (await secondClockOut.json()).timeEntry;

    workDay = await fetch(`${baseUrl}/api/v1/work-days/${workDate}`, { headers: { Cookie: cookie } });
    assert.equal(workDay.status, 200);
    assert.equal((await workDay.json()).workDay.entries.length, 6);

    const workDateValue = new Date(`${workDate}T00:00:00Z`);
    const weekday = workDateValue.getUTCDay() || 7;
    workDateValue.setUTCDate(workDateValue.getUTCDate() - weekday + 1);
    const weekStart = workDateValue.toISOString().slice(0, 10);
    const workWeekResponse = await fetch(`${baseUrl}/api/v1/work-weeks/${weekStart}`, {
      headers: { Cookie: cookie }
    });
    assert.equal(workWeekResponse.status, 200);
    const workWeek = (await workWeekResponse.json()).week;
    assert.equal(workWeek.weekStart, weekStart);
    assert.equal(workWeek.days.length, 7);
    assert.ok(workWeek.days.some((day) => day.workDate === workDate && day.workDay.entries.length === 6));
    assert.ok(workWeek.totals.workMinutes >= 0);

    const correctedClockOutAt = new Date(Date.now() - 500).toISOString();
    const correctionResponse = await fetch(`${baseUrl}/api/v1/time-entry-corrections`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        originalEntryId: secondClockOutEntry.id,
        requestedRecordedAt: correctedClockOutAt,
        reason: "Feierabend im Integrationstest versehentlich zu früh gebucht"
      })
    });
    assert.equal(correctionResponse.status, 201, await correctionResponse.clone().text());
    const correction = (await correctionResponse.json()).timeCorrection;
    assert.equal(correction.status, "pending");
    assert.equal(correction.originalEntryId, secondClockOutEntry.id);

    const pendingWorkDayResponse = await fetch(`${baseUrl}/api/v1/work-days/${workDate}`, {
      headers: { Cookie: cookie }
    });
    assert.equal(pendingWorkDayResponse.status, 200);
    const pendingWorkDay = (await pendingWorkDayResponse.json()).workDay;
    const pendingOriginal = pendingWorkDay.entries.find((entry) => entry.id === secondClockOutEntry.id);
    assert.equal(pendingOriginal.recordedAt, secondClockOutAt);
    assert.equal(pendingOriginal.pendingCorrection.id, correction.id);

    const correctionOverviewResponse = await fetch(
      `${baseUrl}/api/v1/admin/overview?date=${workDate}`,
      { headers: { Cookie: plannerCookie } }
    );
    assert.equal(correctionOverviewResponse.status, 200);
    assert.ok(
      (await correctionOverviewResponse.json()).overview.timeCorrections
        .some((item) => item.id === correction.id)
    );

    const approvedCorrectionResponse = await fetch(
      `${baseUrl}/api/v1/admin/time-entry-corrections/${correction.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: plannerCookie },
        body: JSON.stringify({ decision: "approved" })
      }
    );
    assert.equal(
      approvedCorrectionResponse.status,
      200,
      await approvedCorrectionResponse.clone().text()
    );
    assert.equal((await approvedCorrectionResponse.json()).timeCorrection.status, "approved");

    const correctedWorkDayResponse = await fetch(`${baseUrl}/api/v1/work-days/${workDate}`, {
      headers: { Cookie: cookie }
    });
    assert.equal(correctedWorkDayResponse.status, 200);
    const correctedWorkDay = (await correctedWorkDayResponse.json()).workDay;
    assert.equal(correctedWorkDay.entries.length, 6);
    assert.equal(correctedWorkDay.entries.at(-1).recordedAt, correctedClockOutAt);
    assert.equal(correctedWorkDay.entries.at(-1).pendingCorrection, null);

    const completedOverviewResponse = await fetch(
      `${baseUrl}/api/v1/admin/overview?date=${workDate}`,
      { headers: { Cookie: plannerCookie } }
    );
    assert.equal(completedOverviewResponse.status, 200);
    const completedOverview = (await completedOverviewResponse.json()).overview;
    const reviewableWorkDay = completedOverview.workDays.find((day) => (
      day.id === correctedWorkDay.id
    ));
    assert.equal(reviewableWorkDay.status, "open");
    assert.equal(reviewableWorkDay.workflowStatus, "completed");
    assert.equal(reviewableWorkDay.reviewable, true);

    const prematureOwnExport = await fetch(
      `${baseUrl}/api/v1/timesheets.xlsx?from=${workDate}&to=${workDate}`,
      { headers: { Cookie: cookie } }
    );
    assert.equal(prematureOwnExport.status, 404);
    assert.equal((await prematureOwnExport.json()).error.code, "approved_timesheet_not_found");

    const approvedWorkDayResponse = await fetch(
      `${baseUrl}/api/v1/admin/work-days/${reviewableWorkDay.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: plannerCookie },
        body: JSON.stringify({ decision: "approved" })
      }
    );
    assert.equal(approvedWorkDayResponse.status, 200, await approvedWorkDayResponse.clone().text());
    assert.equal((await approvedWorkDayResponse.json()).workDay.status, "approved");

    const unrelatedEmployeeExport = await fetch(
      `${baseUrl}/api/v1/timesheets.xlsx?from=${workDate}&to=${workDate}`,
      { headers: { Cookie: employeeCookie } }
    );
    assert.equal(unrelatedEmployeeExport.status, 404);

    const manipulatedOwnExport = await fetch(
      `${baseUrl}/api/v1/timesheets.xlsx?from=${workDate}&to=${workDate}&employeeId=${employee.id}`,
      { headers: { Cookie: cookie } }
    );
    assert.equal(manipulatedOwnExport.status, 400);

    const ownTimesheetExportResponse = await fetch(
      `${baseUrl}/api/v1/timesheets.xlsx?from=${workDate}&to=${workDate}`,
      { headers: { Cookie: cookie } }
    );
    assert.equal(
      ownTimesheetExportResponse.status,
      200,
      await ownTimesheetExportResponse.clone().text()
    );
    assert.match(ownTimesheetExportResponse.headers.get("content-type"), /spreadsheetml/);
    assert.match(
      ownTimesheetExportResponse.headers.get("content-disposition"),
      /Mein_Stundenzettel_/
    );
    const ownTimesheetExport = Buffer.from(await ownTimesheetExportResponse.arrayBuffer());
    assert.equal(ownTimesheetExport.subarray(0, 2).toString("ascii"), "PK");

    const ownTimesheetPdfResponse = await fetch(
      `${baseUrl}/api/v1/timesheets.pdf?from=${workDate}&to=${workDate}`,
      { headers: { Cookie: cookie } }
    );
    assert.equal(
      ownTimesheetPdfResponse.status,
      200,
      await ownTimesheetPdfResponse.clone().text()
    );
    assert.match(ownTimesheetPdfResponse.headers.get("content-type"), /application\/pdf/);
    assert.match(
      ownTimesheetPdfResponse.headers.get("content-disposition"),
      /Mein_Stundenzettel_/
    );
    const ownTimesheetPdf = Buffer.from(await ownTimesheetPdfResponse.arrayBuffer());
    assert.equal(ownTimesheetPdf.subarray(0, 5).toString("ascii"), "%PDF-");

    const lockedWorkDayResponse = await fetch(
      `${baseUrl}/api/v1/admin/work-days/${reviewableWorkDay.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: plannerCookie },
        body: JSON.stringify({ decision: "locked" })
      }
    );
    assert.equal(lockedWorkDayResponse.status, 200, await lockedWorkDayResponse.clone().text());
    assert.equal((await lockedWorkDayResponse.json()).workDay.status, "locked");

    const timesheetExportResponse = await fetch(
      `${baseUrl}/api/v1/admin/timesheets.xlsx?from=${workDate}&to=${workDate}&status=billed`,
      { headers: { Cookie: plannerCookie } }
    );
    assert.equal(timesheetExportResponse.status, 200, await timesheetExportResponse.clone().text());
    assert.match(timesheetExportResponse.headers.get("content-type"), /spreadsheetml/);
    assert.match(timesheetExportResponse.headers.get("content-disposition"), /Stundenzettel_/);
    const timesheetExport = Buffer.from(await timesheetExportResponse.arrayBuffer());
    assert.equal(timesheetExport.subarray(0, 2).toString("ascii"), "PK");

    const timesheetPdfResponse = await fetch(
      `${baseUrl}/api/v1/admin/timesheets.pdf?from=${workDate}&to=${workDate}&status=billed`,
      { headers: { Cookie: plannerCookie } }
    );
    assert.equal(timesheetPdfResponse.status, 200, await timesheetPdfResponse.clone().text());
    assert.match(timesheetPdfResponse.headers.get("content-type"), /application\/pdf/);
    const timesheetPdf = Buffer.from(await timesheetPdfResponse.arrayBuffer());
    assert.equal(timesheetPdf.subarray(0, 5).toString("ascii"), "%PDF-");

    const blockedNewBlock = await fetch(`${baseUrl}/api/v1/time-entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        clientEntryId: randomUUID(),
        entryType: "clock_in",
        recordedAt: new Date().toISOString(),
        clientCreatedAt: new Date().toISOString()
      })
    });
    assert.equal(blockedNewBlock.status, 409);
    assert.equal((await blockedNewBlock.json()).error.code, "work_day_closed");

    const lockedCorrectionResponse = await fetch(`${baseUrl}/api/v1/time-entry-corrections`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        originalEntryId: correctedWorkDay.entries[0].id,
        requestedRecordedAt: new Date(new Date(clockInAt).valueOf() + 100).toISOString(),
        reason: "Arbeitsbeginn wurde erst nach der Abrechnung als falsch erkannt"
      })
    });
    assert.equal(lockedCorrectionResponse.status, 201, await lockedCorrectionResponse.clone().text());
    const lockedCorrection = (await lockedCorrectionResponse.json()).timeCorrection;
    assert.equal(lockedCorrection.status, "pending");

    const approvedLockedCorrection = await fetch(
      `${baseUrl}/api/v1/admin/time-entry-corrections/${lockedCorrection.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: plannerCookie },
        body: JSON.stringify({ decision: "approved" })
      }
    );
    assert.equal(
      approvedLockedCorrection.status,
      200,
      await approvedLockedCorrection.clone().text()
    );
    const finalLockedWorkDayResponse = await fetch(`${baseUrl}/api/v1/work-days/${workDate}`, {
      headers: { Cookie: cookie }
    });
    const finalLockedWorkDay = (await finalLockedWorkDayResponse.json()).workDay;
    assert.equal(finalLockedWorkDay.status, "locked");
    assert.equal(
      finalLockedWorkDay.entries[0].recordedAt,
      new Date(new Date(clockInAt).valueOf() + 100).toISOString()
    );

    const deleteLockedBlockResponse = await fetch(
      `${baseUrl}/api/v1/time-entries/${finalLockedWorkDay.entries[0].id}`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({
          clientChangeId: randomUUID(),
          expectedRecordedAt: finalLockedWorkDay.entries[0].recordedAt,
          reason: "Ersten Arbeitsblock im Integrationstest kontrolliert vollständig entfernen"
        })
      }
    );
    assert.equal(
      deleteLockedBlockResponse.status,
      200,
      await deleteLockedBlockResponse.clone().text()
    );
    const deleteOperation = (await deleteLockedBlockResponse.json()).operation;
    assert.equal(deleteOperation.status, "pending");
    assert.ok(deleteOperation.changes.length >= 2);

    const approveDeleteOperation = await fetch(
      `${baseUrl}/api/v1/admin/time-change-operations/${deleteOperation.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: plannerCookie },
        body: JSON.stringify({ decision: "approved" })
      }
    );
    assert.equal(
      approveDeleteOperation.status,
      200,
      await approveDeleteOperation.clone().text()
    );
    assert.equal((await approveDeleteOperation.json()).operation.status, "approved");
    const workDayAfterDelete = await fetch(`${baseUrl}/api/v1/work-days/${workDate}`, {
      headers: { Cookie: cookie }
    });
    assert.equal(workDayAfterDelete.status, 200);
    const finalEntries = (await workDayAfterDelete.json()).workDay.entries;
    assert.equal(finalEntries.length, 2);
    assert.equal(finalEntries[0].entryType, "clock_in");
    assert.equal(finalEntries[1].entryType, "clock_out");

    const restoredPolicy = await fetch(`${baseUrl}/api/v1/admin/time-correction-policy`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        policy: "review_required",
        reason: "Geprüfte Voreinstellung nach dem Abschnitt wiederherstellen"
      })
    });
    assert.equal(restoredPolicy.status, 200, await restoredPolicy.clone().text());
  });

  await t.test("Mitarbeiterlebenszyklus", async () => {

    const archiveEmployeeResponse = await fetch(
      `${baseUrl}/api/v1/admin/employees/${updatedEditableEmployee.id}`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({
          rowVersion: updatedEditableEmployee.rowVersion,
          reason: "Historischen Mitarbeiter im Integrationstest archivieren"
        })
      }
    );
    assert.equal(
      archiveEmployeeResponse.status,
      200,
      await archiveEmployeeResponse.clone().text()
    );
    const archivedEmployee = await archiveEmployeeResponse.json();
    assert.equal(archivedEmployee.mode, "archived");
    assert.equal(archivedEmployee.employee.status, "archived");

    const reactivateEmployeeResponse = await fetch(
      `${baseUrl}/api/v1/admin/employees/${updatedEditableEmployee.id}/reactivate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({
          rowVersion: archivedEmployee.employee.rowVersion,
          reason: "Archivierten Mitarbeiter im Integrationstest reaktivieren"
        })
      }
    );
    assert.equal(
      reactivateEmployeeResponse.status,
      200,
      await reactivateEmployeeResponse.clone().text()
    );
    assert.equal((await reactivateEmployeeResponse.json()).employee.status, "active");

    const disposableEmployeeResponse = await fetch(`${baseUrl}/api/v1/admin/employees`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        personnelNumber: `DEL-${suffix}`,
        firstName: "Ohne",
        lastName: "Historie",
        role: "installer",
        temporaryPassword: "Loeschbar-Integration-2026!"
      })
    });
    assert.equal(disposableEmployeeResponse.status, 201);
    const disposableEmployee = (await disposableEmployeeResponse.json()).employee;
    const deleteEmployeeResponse = await fetch(
      `${baseUrl}/api/v1/admin/employees/${disposableEmployee.id}`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({
          rowVersion: disposableEmployee.rowVersion,
          reason: "Mitarbeiter ohne historische Daten im Integrationstest löschen"
        })
      }
    );
    assert.equal(deleteEmployeeResponse.status, 200, await deleteEmployeeResponse.clone().text());
    assert.equal((await deleteEmployeeResponse.json()).mode, "deleted");
  });

  await t.test("Zeitbearbeitung durch Mitarbeiter und Büro", async () => {

    // V0.42: Ungültigkeitserklärung durch den Mitarbeiter sowie Bearbeitung und
    // Löschung fremder Zeitbuchungen durch das Büro. Der Arbeitstag gehört einem
    // eigenen Mitarbeiter, damit die vorher geprüften Stundenzettel unberührt
    // bleiben.
    const timeEmployeePersonnelNumber = `TIME-${suffix}`;
    const timeEmployeeTemporaryPassword = "Zeitkorrektur-Integration-2026!";
    const timeEmployeeResponse = await fetch(`${baseUrl}/api/v1/admin/employees`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        personnelNumber: timeEmployeePersonnelNumber,
        firstName: "Timo",
        lastName: "Zeitkorrektur",
        role: "installer",
        temporaryPassword: timeEmployeeTemporaryPassword
      })
    });
    assert.equal(timeEmployeeResponse.status, 201, await timeEmployeeResponse.clone().text());
    const timeEmployee = (await timeEmployeeResponse.json()).employee;

    const timeEmployeeLogin = await fetch(`${baseUrl}/api/v1/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: config.allowedOrigin },
      body: JSON.stringify({
        companyNumber,
        personnelNumber: timeEmployeePersonnelNumber,
        password: timeEmployeeTemporaryPassword
      })
    });
    assert.equal(timeEmployeeLogin.status, 201);
    const timeCookie = timeEmployeeLogin.headers.get("set-cookie").split(";", 1)[0];
    const timeEmployeePasswordChange = await fetch(`${baseUrl}/api/v1/account/initial-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: timeCookie },
      body: JSON.stringify({ newPassword: "Zeitkorrektur-Integration-2026-Neu!" })
    });
    assert.equal(timeEmployeePasswordChange.status, 200);

    const editableClockInAt = new Date(Date.now() - 4000).toISOString();
    const editableClockOutAt = new Date(Date.now() - 3000).toISOString();
    const editableWorkDate = localDate(editableClockInAt, config.timeZone);
    for (const [entryType, recordedAt] of [
      ["clock_in", editableClockInAt],
      ["clock_out", editableClockOutAt]
    ]) {
      const created = await fetch(`${baseUrl}/api/v1/time-entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: timeCookie },
        body: JSON.stringify({
          clientEntryId: randomUUID(),
          entryType,
          recordedAt,
          clientCreatedAt: recordedAt
        })
      });
      assert.equal(created.status, 201, await created.clone().text());
    }

    const editableDayResponse = await fetch(
      `${baseUrl}/api/v1/work-days/${editableWorkDate}`,
      { headers: { Cookie: timeCookie } }
    );
    assert.equal(editableDayResponse.status, 200);
    const editableDay = (await editableDayResponse.json()).workDay;
    assert.equal(editableDay.entries.length, 2);
    const editableClockIn = editableDay.entries[0];
    const editableClockOut = editableDay.entries[1];
    assert.equal(editableClockOut.entryType, "clock_out");

    const unknownInvalidation = await fetch(`${baseUrl}/api/v1/time-entry-invalidations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: timeCookie },
      body: JSON.stringify({
        originalEntryId: randomUUID(),
        reason: "Unbekannte Buchung darf nicht für ungültig erklärt werden"
      })
    });
    assert.equal(unknownInvalidation.status, 404);
    assert.equal((await unknownInvalidation.json()).error.code, "time_entry_not_found");

    const invalidationResponse = await fetch(`${baseUrl}/api/v1/time-entry-invalidations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: timeCookie },
      body: JSON.stringify({
        originalEntryId: editableClockOut.id,
        reason: "Feierabend wurde im Integrationstest versehentlich gebucht"
      })
    });
    assert.equal(invalidationResponse.status, 201, await invalidationResponse.clone().text());
    const invalidation = (await invalidationResponse.json()).timeCorrection;
    assert.equal(invalidation.correctionKind, "invalidation");
    assert.equal(invalidation.status, "pending");
    assert.equal(invalidation.originalEntryId, editableClockOut.id);

    // Solange die erste Ungültigkeitserklärung auf Prüfung wartet, darf keine
    // zweite für dieselbe Buchung entstehen.
    const repeatedInvalidation = await fetch(`${baseUrl}/api/v1/time-entry-invalidations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: timeCookie },
      body: JSON.stringify({
        originalEntryId: editableClockOut.id,
        reason: "Zweite Ungültigkeitserklärung für dieselbe Buchung"
      })
    });
    assert.equal(repeatedInvalidation.status, 409);
    assert.equal((await repeatedInvalidation.json()).error.code, "time_correction_pending");

    const approveInvalidation = await fetch(
      `${baseUrl}/api/v1/admin/time-entry-corrections/${invalidation.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: plannerCookie },
        body: JSON.stringify({ decision: "approved" })
      }
    );
    assert.equal(approveInvalidation.status, 200, await approveInvalidation.clone().text());
    assert.equal((await approveInvalidation.json()).timeCorrection.status, "approved");

    const dayAfterInvalidation = await fetch(
      `${baseUrl}/api/v1/work-days/${editableWorkDate}`,
      { headers: { Cookie: timeCookie } }
    );
    const remainingEntries = (await dayAfterInvalidation.json()).workDay.entries;
    assert.equal(remainingEntries.length, 1);
    assert.equal(remainingEntries[0].entryType, "clock_in");

    // Das Büro berichtigt die fremde Buchung; der Arbeitstag ist offen, die
    // Änderung wirkt daher sofort und wird als Bürobuchung geführt.
    const officeEditChangeId = randomUUID();
    const officeEditedAt = new Date(new Date(editableClockInAt).valueOf() + 1000).toISOString();
    const officeEditBody = JSON.stringify({
      clientChangeId: officeEditChangeId,
      expectedRecordedAt: editableClockIn.recordedAt,
      recordedAt: officeEditedAt,
      workDate: editableWorkDate,
      reason: "Arbeitsbeginn wurde vom Büro im Integrationstest berichtigt"
    });
    const officeEdit = await fetch(
      `${baseUrl}/api/v1/admin/time-entries/${editableClockIn.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: plannerCookie },
        body: officeEditBody
      }
    );
    assert.equal(officeEdit.status, 200, await officeEdit.clone().text());
    const officeEditResult = await officeEdit.json();
    assert.equal(officeEditResult.idempotent, false);
    assert.equal(officeEditResult.operation.status, "applied");
    assert.equal(officeEditResult.operation.action, "edit_entry");

    // Eine ohne Prüfung wirksame Korrektur trägt keinen Prüfer. Das Protokoll
    // darf keine Freigabe behaupten, die es nicht gegeben hat.
    const unreviewed = await inspectionPool.query(
      `SELECT operation.status, operation.applied_without_review,
              operation.reviewed_by_user_id,
              entry.applied_without_review AS entry_applied_without_review,
              entry.reviewed_by_user_id AS entry_reviewed_by_user_id,
              entry.reviewed_at AS entry_reviewed_at
       FROM time_change_operations AS operation
       JOIN time_change_items AS item ON item.operation_id = operation.id
       JOIN time_entries AS entry ON entry.id = item.replacement_entry_id
       WHERE operation.id = $1`,
      [officeEditResult.operation.id]
    );
    assert.ok(unreviewed.rowCount >= 1);
    for (const row of unreviewed.rows) {
      assert.equal(row.applied_without_review, true);
      assert.equal(row.reviewed_by_user_id, null);
      assert.equal(row.entry_applied_without_review, true);
      assert.equal(row.entry_reviewed_by_user_id, null, "Der Bearbeiter darf nicht als Prüfer erscheinen");
      assert.ok(row.entry_reviewed_at, "Der Zeitpunkt der Wirksamkeit fehlt");
    }

    const repeatedOfficeEdit = await fetch(
      `${baseUrl}/api/v1/admin/time-entries/${editableClockIn.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: plannerCookie },
        body: officeEditBody
      }
    );
    assert.equal(repeatedOfficeEdit.status, 200, await repeatedOfficeEdit.clone().text());
    assert.equal((await repeatedOfficeEdit.json()).idempotent, true);

    const dayAfterOfficeEdit = await fetch(
      `${baseUrl}/api/v1/work-days/${editableWorkDate}`,
      { headers: { Cookie: timeCookie } }
    );
    const editedEntries = (await dayAfterOfficeEdit.json()).workDay.entries;
    assert.equal(editedEntries.length, 1);
    assert.equal(editedEntries[0].recordedAt, officeEditedAt);

    // Eine Bearbeitung gegen einen veralteten Zeitstand wird abgewiesen.
    const staleOfficeEdit = await fetch(
      `${baseUrl}/api/v1/admin/time-entries/${editedEntries[0].id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: plannerCookie },
        body: JSON.stringify({
          clientChangeId: randomUUID(),
          expectedRecordedAt: editableClockIn.recordedAt,
          recordedAt: officeEditedAt,
          workDate: editableWorkDate,
          reason: "Bearbeitung gegen einen veralteten Zeitstand"
        })
      }
    );
    assert.equal(staleOfficeEdit.status, 409);
    assert.equal((await staleOfficeEdit.json()).error.code, "stale_time_entry");

    // Ohne firmenweite Planungsrechte bleibt die Bürobearbeitung gesperrt.
    const forbiddenOfficeEdit = await fetch(
      `${baseUrl}/api/v1/admin/time-entries/${editedEntries[0].id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: timeCookie },
        body: JSON.stringify({
          clientChangeId: randomUUID(),
          expectedRecordedAt: officeEditedAt,
          recordedAt: officeEditedAt,
          workDate: editableWorkDate,
          reason: "Monteur versucht die Bürobearbeitung zu verwenden"
        })
      }
    );
    assert.equal(forbiddenOfficeEdit.status, 403);

    // Eine nachgetragene Baustellenbuchung verlangt einen freigegebenen Einsatz.
    // Eine nachgetragene Baustellenbuchung legt den fehlenden Einsatz selbst an.
    // Der Monteur stand auf einer Baustelle, für die ihn niemand eingeplant
    // hatte; live durfte er sie schon immer selbst wählen, beim Nachtragen
    // wurde die Buchung früher abgewiesen.
    const unassignedArrivalAt = new Date(new Date(officeEditedAt).valueOf() + 1000).toISOString();
    const unassignedAddition = await fetch(`${baseUrl}/api/v1/time-entry-additions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: timeCookie },
      body: JSON.stringify({
        workDate: editableWorkDate,
        entryType: "site_arrival",
        recordedAt: unassignedArrivalAt,
        constructionSiteId: structuredSite.id,
        reason: "Ankunft auf einer nicht zugeordneten Baustelle nachtragen"
      })
    });
    assert.equal(unassignedAddition.status, 201, await unassignedAddition.clone().text());

    const createdAssignment = await inspectionPool.query(
      `SELECT status, last_change_reason, created_by_user_id, comment
       FROM site_assignments
       WHERE company_id = $1 AND user_id = $2 AND construction_site_id = $3
         AND work_date = $4`,
      [tenantCompany.id, timeEmployee.id, structuredSite.id, editableWorkDate]
    );
    assert.equal(createdAssignment.rowCount, 1, "Der fehlende Einsatz wurde nicht angelegt");
    assert.equal(createdAssignment.rows[0].status, "released");
    assert.equal(
      createdAssignment.rows[0].created_by_user_id,
      timeEmployee.id,
      "Der selbst gewählte Einsatz muss dem Mitarbeiter zugeschrieben sein"
    );
    assert.match(
      createdAssignment.rows[0].last_change_reason,
      /Spontane Auswahl durch den Mitarbeiter/,
      "Die Planung muss erkennen, dass der Einsatz nicht von ihr stammt"
    );

    // Eine unbekannte oder abgeschlossene Baustelle bleibt abgewiesen.
    const unknownSiteAddition = await fetch(`${baseUrl}/api/v1/time-entry-additions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: timeCookie },
      body: JSON.stringify({
        workDate: editableWorkDate,
        entryType: "site_arrival",
        recordedAt: unassignedArrivalAt,
        constructionSiteId: randomUUID(),
        reason: "Ankunft auf einer unbekannten Baustelle nachtragen"
      })
    });
    assert.equal(unknownSiteAddition.status, 404);
    assert.equal((await unknownSiteAddition.json()).error.code, "site_not_found");

    // Das Büro liest den Stundenzettel des fremden Mitarbeiters vollständig.
    const officeWorkDayResponse = await fetch(
      `${baseUrl}/api/v1/admin/work-days/${editableDay.id}`,
      { headers: { Cookie: plannerCookie } }
    );
    assert.equal(officeWorkDayResponse.status, 200, await officeWorkDayResponse.clone().text());
    const officeWorkDay = (await officeWorkDayResponse.json()).workDay;
    assert.equal(officeWorkDay.employeeId, timeEmployee.id);
    assert.equal(officeWorkDay.entries.length, 1);
    assert.equal(officeWorkDay.entries[0].recordedAt, officeEditedAt);

    const officeDelete = await fetch(
      `${baseUrl}/api/v1/admin/time-entries/${editedEntries[0].id}`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Cookie: plannerCookie },
        body: JSON.stringify({
          clientChangeId: randomUUID(),
          expectedRecordedAt: officeEditedAt,
          reason: "Restlichen Arbeitsblock im Integrationstest vom Büro entfernen"
        })
      }
    );
    assert.equal(officeDelete.status, 200, await officeDelete.clone().text());
    const officeDeleteResult = await officeDelete.json();
    assert.equal(officeDeleteResult.operation.status, "applied");
    assert.equal(officeDeleteResult.operation.action, "delete_entry");

    const dayAfterOfficeDelete = await fetch(
      `${baseUrl}/api/v1/work-days/${editableWorkDate}`,
      { headers: { Cookie: timeCookie } }
    );
    assert.equal(dayAfterOfficeDelete.status, 200);
    assert.equal((await dayAfterOfficeDelete.json()).workDay.entries.length, 0);
  });

  await t.test("Wählbare Regel für eigene Zeitkorrekturen", async () => {
    // Voreinstellung ist die geprüfte Variante: eine eigene Korrektur wird zum
    // Antrag und wirkt erst nach Freigabe durch das Büro.
    const initial = await fetch(`${baseUrl}/api/v1/admin/time-correction-policy`, {
      headers: { Cookie: cookie }
    });
    assert.equal(initial.status, 200, await initial.clone().text());
    const initialPolicy = (await initial.json()).timeCorrectionPolicy;
    assert.equal(initialPolicy.policy, "review_required");
    assert.deepEqual(initialPolicy.options, ["review_required", "same_day", "immediate"]);

    const setPolicy = async (policy) => {
      const response = await fetch(`${baseUrl}/api/v1/admin/time-correction-policy`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ policy, reason: "Korrekturregel im Integrationstest umstellen" })
      });
      assert.equal(response.status, 200, await response.clone().text());
      return (await response.json()).timeCorrectionPolicy;
    };

    // Für jede Regel ein eigener Mitarbeiter mit eigenem Arbeitstag, damit sich
    // die Fälle nicht gegenseitig beeinflussen.
    const bookOwnDay = async (label) => {
      const personnelNumber = `POL-${label}-${suffix}`;
      const temporary = "Korrekturregel-Integration-2026!";
      const created = await fetch(`${baseUrl}/api/v1/admin/employees`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({
          personnelNumber, firstName: "Rita", lastName: `Regel${label}`,
          role: "foreman", temporaryPassword: temporary
        })
      });
      assert.equal(created.status, 201, await created.clone().text());
      const login = await fetch(`${baseUrl}/api/v1/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: config.allowedOrigin },
        body: JSON.stringify({ companyNumber, personnelNumber, password: temporary })
      });
      assert.equal(login.status, 201);
      const ownCookie = login.headers.get("set-cookie").split(";", 1)[0];
      const change = await fetch(`${baseUrl}/api/v1/account/initial-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: ownCookie },
        body: JSON.stringify({ newPassword: `${temporary}-Neu` })
      });
      assert.equal(change.status, 200);

      const startedAt = new Date(Date.now() - 9000).toISOString();
      const endedAt = new Date(Date.now() - 5000).toISOString();
      for (const [entryType, recordedAt] of [["clock_in", startedAt], ["clock_out", endedAt]]) {
        const booking = await fetch(`${baseUrl}/api/v1/time-entries`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: ownCookie },
          body: JSON.stringify({ clientEntryId: randomUUID(), entryType, recordedAt, clientCreatedAt: recordedAt })
        });
        assert.equal(booking.status, 201, await booking.clone().text());
      }
      const ownWorkDate = localDate(startedAt, config.timeZone);
      const day = await fetch(`${baseUrl}/api/v1/work-days/${ownWorkDate}`, { headers: { Cookie: ownCookie } });
      return { ownCookie, ownWorkDate, entry: (await day.json()).workDay.entries[0] };
    };

    const correctOwnStart = async ({ ownCookie, ownWorkDate, entry }) => {
      const shifted = new Date(new Date(entry.recordedAt).valueOf() - 3_600_000).toISOString();
      const response = await fetch(`${baseUrl}/api/v1/time-entries/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: ownCookie },
        body: JSON.stringify({
          clientChangeId: randomUUID(),
          expectedRecordedAt: entry.recordedAt,
          recordedAt: shifted,
          workDate: ownWorkDate,
          reason: "Arbeitsbeginn war früher als gebucht"
        })
      });
      assert.equal(response.status, 200, await response.clone().text());
      const operation = (await response.json()).operation;
      const day = await fetch(`${baseUrl}/api/v1/work-days/${ownWorkDate}`, { headers: { Cookie: ownCookie } });
      const workDay = (await day.json()).workDay;
      return { operation, workDay, shifted };
    };

    // Geprüfte Variante: nichts ändert sich, bis das Büro entscheidet.
    const reviewed = await bookOwnDay("REV");
    const reviewedResult = await correctOwnStart(reviewed);
    assert.equal(reviewedResult.operation.status, "pending");
    assert.equal(reviewedResult.workDay.hasPendingCorrection, true);
    assert.notEqual(
      reviewedResult.workDay.entries[0].recordedAt,
      reviewedResult.shifted,
      "Die Zeit darf sich vor der Freigabe nicht ändern"
    );

    // Sofort wirksam: die Zeit steht unmittelbar im Stundenzettel.
    await setPolicy("immediate");
    const immediate = await bookOwnDay("SOF");
    const immediateResult = await correctOwnStart(immediate);
    assert.equal(immediateResult.operation.status, "applied");
    assert.equal(immediateResult.workDay.hasPendingCorrection, false);
    assert.equal(immediateResult.workDay.entries[0].recordedAt, immediateResult.shifted);

    // Am selben Tag frei: der laufende Tag bleibt frei korrigierbar.
    const sameDayPolicy = await setPolicy("same_day");
    assert.equal(sameDayPolicy.policy, "same_day");
    assert.equal(sameDayPolicy.previousPolicy, "immediate");
    const sameDay = await bookOwnDay("TAG");
    const sameDayResult = await correctOwnStart(sameDay);
    assert.equal(sameDayResult.operation.status, "applied");
    assert.equal(sameDayResult.workDay.entries[0].recordedAt, sameDayResult.shifted);

    // Derselbe Mitarbeiter, ein zurückliegender Arbeitstag: jetzt greift die
    // Prüfpflicht. Der Tag wird unmittelbar angelegt, weil die App für
    // vergangene Tage keine Buchung anbietet.
    const pastDate = localDate(new Date(Date.now() - 3 * 86_400_000).toISOString(), config.timeZone);
    const pastEmployee = await inspectionPool.query(
      "SELECT id, company_id FROM users WHERE personnel_number = $1",
      [`POL-TAG-${suffix}`]
    );
    const pastDay = await inspectionPool.query(
      `INSERT INTO work_days (company_id, user_id, work_date, target_work_minutes)
       VALUES ($1, $2, $3, 480) RETURNING id`,
      [pastEmployee.rows[0].company_id, pastEmployee.rows[0].id, pastDate]
    );
    const pastEntry = await inspectionPool.query(
      `INSERT INTO time_entries (
         company_id, user_id, work_day_id, entry_type, recorded_at,
         client_entry_id, client_created_at, source, entered_by_user_id
       ) VALUES ($1,$2,$3,'clock_in',$4::DATE + TIME '08:00', gen_random_uuid(),
                 CURRENT_TIMESTAMP, 'employee', $2)
       RETURNING id, recorded_at`,
      [pastEmployee.rows[0].company_id, pastEmployee.rows[0].id, pastDay.rows[0].id, pastDate]
    );
    await inspectionPool.query(
      `INSERT INTO time_entries (
         company_id, user_id, work_day_id, entry_type, recorded_at,
         client_entry_id, client_created_at, source, entered_by_user_id
       ) VALUES ($1,$2,$3,'clock_out',$4::DATE + TIME '16:00', gen_random_uuid(),
                 CURRENT_TIMESTAMP, 'employee', $2)`,
      [pastEmployee.rows[0].company_id, pastEmployee.rows[0].id, pastDay.rows[0].id, pastDate]
    );

    const pastCorrection = await fetch(
      `${baseUrl}/api/v1/time-entries/${pastEntry.rows[0].id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: sameDay.ownCookie },
        body: JSON.stringify({
          clientChangeId: randomUUID(),
          expectedRecordedAt: new Date(pastEntry.rows[0].recorded_at).toISOString(),
          recordedAt: new Date(new Date(pastEntry.rows[0].recorded_at).valueOf() - 3_600_000).toISOString(),
          workDate: pastDate,
          reason: "Nachträgliche Korrektur eines zurückliegenden Arbeitstags"
        })
      }
    );
    assert.equal(pastCorrection.status, 200, await pastCorrection.clone().text());
    assert.equal(
      (await pastCorrection.json()).operation.status,
      "pending",
      "Bei same_day muss ein zurückliegender Tag geprüft werden"
    );

    // Ohne Planungsrechte bleibt die Regel unerreichbar, lesend wie schreibend.
    const foremanRead = await fetch(`${baseUrl}/api/v1/admin/time-correction-policy`, {
      headers: { Cookie: sameDay.ownCookie }
    });
    assert.equal(foremanRead.status, 403);
    const foremanWrite = await fetch(`${baseUrl}/api/v1/admin/time-correction-policy`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: sameDay.ownCookie },
      body: JSON.stringify({ policy: "immediate", reason: "Vorarbeiter stellt sich die Regel selbst um" })
    });
    assert.equal(foremanWrite.status, 403);
    assert.equal((await foremanWrite.json()).error.code, "time_account_administration_forbidden");

    // Auch die Planung ohne Administrationsrechte darf die Regel nur lesen.
    const plannerRead = await fetch(`${baseUrl}/api/v1/admin/time-correction-policy`, {
      headers: { Cookie: plannerCookie }
    });
    assert.equal(plannerRead.status, 200);
    const plannerWrite = await fetch(`${baseUrl}/api/v1/admin/time-correction-policy`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: plannerCookie },
      body: JSON.stringify({ policy: "immediate", reason: "Planung stellt die Regel um" })
    });
    assert.equal(plannerWrite.status, 403);

    const unknownPolicy = await fetch(`${baseUrl}/api/v1/admin/time-correction-policy`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ policy: "niemals", reason: "Unbekannte Regel setzen" })
    });
    assert.equal(unknownPolicy.status, 400);

    await setPolicy("review_required");
  });

  await t.test("Fuhrpark: nur mit Modul, Kennzeichen nur einmal", async () => {
    const schalteFuhrpark = async (status) => {
      const antwort = await fetch(
        `${baseUrl}/api/v1/platform/companies/${tenantCompany.id}/modules/fleet`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json", Cookie: platformCookie },
          body: JSON.stringify({
            status,
            includedInPlan: status !== "inactive",
            separatelyBilled: false,
            featureScope: {},
            reason: `Fuhrpark im Integrationstest auf ${status} setzen`
          })
        }
      );
      assert.equal(antwort.status, 200, await antwort.clone().text());
    };

    // Ohne freigeschaltetes Modul gibt es den Fuhrpark nicht - und zwar mit
    // 404, nicht mit einer leeren Liste: eine leere Liste behauptet, es gebe
    // keine Fahrzeuge.
    await schalteFuhrpark("inactive");
    const gesperrt = await fetch(`${baseUrl}/api/v1/admin/vehicles`, {
      headers: { Cookie: cookie }
    });
    assert.equal(gesperrt.status, 404, await gesperrt.clone().text());
    assert.equal((await gesperrt.json()).error.code, "fleet_module_disabled");

    await schalteFuhrpark("permanent");

    const leer = await fetch(`${baseUrl}/api/v1/admin/vehicles`, { headers: { Cookie: cookie } });
    assert.equal(leer.status, 200, await leer.clone().text());
    assert.deepEqual((await leer.json()).vehicles, []);

    // Das Kennzeichen wird aufgeraeumt: wer " es-se 123 " tippt, meint
    // ES-SE 123.
    const angelegt = await fetch(`${baseUrl}/api/v1/admin/vehicles`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        licencePlate: " es-se 123 ",
        label: "Transporter Werkstatt",
        vehicleType: "van",
        requiredLicenceClass: "B",
        nextInspectionOn: "2027-03-01"
      })
    });
    assert.equal(angelegt.status, 201, await angelegt.clone().text());
    const fahrzeug = (await angelegt.json()).vehicle;
    assert.equal(fahrzeug.licencePlate, "ES-SE 123");
    assert.equal(fahrzeug.nextInspectionOn, "2027-03-01");
    assert.equal(fahrzeug.status, "active");

    // Dasselbe Kennzeichen ein zweites Mal ist ein Tippfehler, kein
    // Serverfehler.
    const doppelt = await fetch(`${baseUrl}/api/v1/admin/vehicles`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ licencePlate: "ES-SE123" })
    });
    assert.equal(doppelt.status, 409, await doppelt.clone().text());
    assert.equal((await doppelt.json()).error.code, "vehicle_plate_taken");

    // Aendern zaehlt die Zeilenversion hoch; die alte Version wird abgewiesen.
    const geaendert = await fetch(`${baseUrl}/api/v1/admin/vehicles/${fahrzeug.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        licencePlate: "ES-SE 123",
        label: "Transporter Werkstatt",
        vehicleType: "van",
        requiredLicenceClass: "B",
        status: "workshop",
        rowVersion: fahrzeug.rowVersion
      })
    });
    assert.equal(geaendert.status, 200, await geaendert.clone().text());
    assert.equal((await geaendert.json()).vehicle.status, "workshop");

    const veraltet = await fetch(`${baseUrl}/api/v1/admin/vehicles/${fahrzeug.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        licencePlate: "ES-SE 123",
        status: "active",
        rowVersion: fahrzeug.rowVersion
      })
    });
    assert.equal(veraltet.status, 409, await veraltet.clone().text());
    assert.equal((await veraltet.json()).error.code, "row_version_conflict");

    // Der Monteur hat im Fuhrpark nichts zu suchen.
    const monteurSicht = await fetch(`${baseUrl}/api/v1/admin/vehicles`, {
      headers: { Cookie: employeeCookie }
    });
    assert.equal(monteurSicht.status, 403, await monteurSicht.clone().text());

  });

  await t.test("Maschinen & Geräte: QR, Übergabe, Akku, Prüfung, Inventur und Mandantentrennung", async () => {
    const request = async (path, {
      method = "GET", sessionCookie = cookie, payload
    } = {}) => {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          Cookie: sessionCookie,
          ...(payload === undefined ? {} : { "Content-Type": "application/json" })
        },
        body: payload === undefined ? undefined : JSON.stringify(payload)
      });
      const body = await response.clone().json().catch(() => null);
      return { response, body };
    };
    const tokenFor = async (deviceId) => {
      const result = await inspectionPool.query(
        `SELECT public_token FROM device_qr_tokens
         WHERE company_id=$1 AND device_id=$2 AND is_active`,
        [tenantCompany.id, deviceId]
      );
      assert.equal(result.rowCount, 1);
      return result.rows[0].public_token;
    };
    const createDevice = async (values) => {
      const result = await request("/api/v1/admin/devices", {
        method: "POST",
        payload: {
          inventoryNumber: values.inventoryNumber,
          name: values.name,
          categoryId: values.categoryId,
          manufacturer: values.manufacturer || null,
          model: values.model || null,
          serialNumber: values.serialNumber || null,
          locationId: values.locationId || null,
          constructionSiteId: values.constructionSiteId || null,
          vehicleId: values.vehicleId || null,
          fixedOwnerUserId: values.fixedOwnerUserId || null,
          inspectionRequired: values.inspectionRequired || false,
          nextInspectionOn: values.nextInspectionOn || null,
          condition: values.condition || "ok",
          status: values.status || "available",
          note: values.note || null,
          ...(values.battery ? { battery: values.battery } : {})
        }
      });
      assert.equal(result.response.status, 201, await result.response.clone().text());
      return result.body.device;
    };

    const dashboard = await request("/api/v1/devices/dashboard", { sessionCookie: employeeCookie });
    assert.equal(dashboard.response.status, 200, await dashboard.response.clone().text());
    assert.equal(dashboard.body.dashboard.canManage, false);
    assert.equal(dashboard.body.dashboard.canInventory, false);

    const contextsResult = await request("/api/v1/devices/contexts");
    assert.equal(contextsResult.response.status, 200, await contextsResult.response.clone().text());
    const deviceContext = contextsResult.body.context;
    const powerTools = deviceContext.categories.find((entry) => entry.baseType === "power_tool");
    const batteries = deviceContext.categories.find((entry) => entry.baseType === "battery");
    const storage = deviceContext.locations.find((entry) => entry.type === "warehouse");
    assert.ok(powerTools);
    assert.ok(batteries);
    assert.ok(storage);

    const customCategory = await request("/api/v1/admin/devices/categories", {
      method: "POST",
      payload: { key: `hydraulic_${suffix.toLowerCase()}`, name: `Hydraulik ${suffix}`, baseType: "machine" }
    });
    assert.equal(customCategory.response.status, 201, await customCategory.response.clone().text());
    assert.equal(customCategory.body.category.baseType, "machine");

    const extraStorage = await request("/api/v1/admin/devices/locations", {
      method: "POST",
      payload: { name: `Nebenlager ${suffix}`, type: "warehouse", note: "Integrationstest" }
    });
    assert.equal(extraStorage.response.status, 201, await extraStorage.response.clone().text());
    assert.equal(extraStorage.body.location.location_type, "warehouse");

    const freeTool = await createDevice({
      inventoryNumber: `M-${suffix}-01`,
      name: "Bosch Bohrhammer GBH 18V-26",
      categoryId: powerTools.id,
      manufacturer: "Bosch",
      model: "GBH 18V-26",
      serialNumber: `BOSCH-${suffix}`
    });
    assert.equal(freeTool.currentOwner, null);
    assert.equal(freeTool.status, "available");

    const qrResponse = await fetch(`${baseUrl}/api/v1/admin/devices/${freeTool.id}/qr`, {
      headers: { Cookie: cookie }
    });
    assert.equal(qrResponse.status, 200, await qrResponse.clone().text());
    assert.match(qrResponse.headers.get("content-type"), /image\/svg\+xml/);
    assert.match(await qrResponse.text(), /<svg/);

    const qrSheet = await request("/api/v1/admin/devices/qr-sheet", {
      method: "POST", payload: { deviceIds: [freeTool.id] }
    });
    assert.equal(qrSheet.response.status, 200, await qrSheet.response.clone().text());
    assert.equal(qrSheet.body.labels.length, 1);
    assert.match(qrSheet.body.labels[0].svg, /<svg/);

    const profilePhoto = await request(`/api/v1/admin/devices/${freeTool.id}/photo`, {
      method: "POST",
      payload: {
        dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
      }
    });
    assert.equal(profilePhoto.response.status, 201, await profilePhoto.response.clone().text());
    const profilePhotoRead = await fetch(`${baseUrl}/api/v1/devices/${freeTool.id}/photo`, {
      headers: { Cookie: employeeCookie }
    });
    assert.equal(profilePhotoRead.status, 200, await profilePhotoRead.clone().text());
    assert.equal(profilePhotoRead.headers.get("content-type"), "image/png");

    const freeToken = await tokenFor(freeTool.id);
    const freeOperation = randomUUID();
    const freeScan = await request("/api/v1/devices/scan", {
      method: "POST", sessionCookie: employeeCookie,
      payload: { token: freeToken, clientOperationId: freeOperation }
    });
    assert.equal(freeScan.response.status, 200, await freeScan.response.clone().text());
    assert.equal(freeScan.body.scan.outcome, "assigned");
    assert.equal(freeScan.body.scan.device.currentOwner.id, employee.id);

    const returnOperation = randomUUID();
    const returnPayload = {
      action: "return_storage",
      locationId: storage.id,
      clientOperationId: returnOperation,
      expectedRowVersion: freeScan.body.scan.device.rowVersion,
      offline: true
    };
    const returned = await request(`/api/v1/devices/${freeTool.id}/transfers`, {
      method: "POST", sessionCookie: employeeCookie, payload: returnPayload
    });
    assert.equal(returned.response.status, 200, await returned.response.clone().text());
    assert.equal(returned.body.transfer.device.currentLocation.id, storage.id);
    assert.equal(returned.body.transfer.idempotent, false);
    const replay = await request(`/api/v1/devices/${freeTool.id}/transfers`, {
      method: "POST", sessionCookie: employeeCookie, payload: returnPayload
    });
    assert.equal(replay.response.status, 200, await replay.response.clone().text());
    assert.equal(replay.body.transfer.idempotent, true);
    assert.equal(replay.body.transfer.transferId, returned.body.transfer.transferId);

    const rescan = await request("/api/v1/devices/scan", {
      method: "POST", sessionCookie: employeeCookie,
      payload: { token: freeToken, clientOperationId: randomUUID() }
    });
    assert.equal(rescan.body.scan.outcome, "assigned");

    const rotated = await request(`/api/v1/admin/devices/${freeTool.id}/qr/rotate`, {
      method: "POST", payload: { reason: "Beschädigtes Etikett im Integrationstest" }
    });
    assert.equal(rotated.response.status, 200, await rotated.response.clone().text());
    const rotatedToken = await tokenFor(freeTool.id);
    assert.notEqual(rotatedToken, freeToken);
    const oldQr = await request("/api/v1/devices/scan", {
      method: "POST", sessionCookie: employeeCookie,
      payload: { token: freeToken, clientOperationId: randomUUID() }
    });
    assert.equal(oldQr.response.status, 404);
    assert.equal(oldQr.body.error.code, "device_qr_unknown");
    const newQr = await request("/api/v1/devices/scan", {
      method: "POST", sessionCookie: employeeCookie,
      payload: { token: rotatedToken, clientOperationId: randomUUID() }
    });
    assert.equal(newQr.body.scan.outcome, "already_yours");

    const fixedDraft = await createDevice({
      inventoryNumber: `M-${suffix}-02`,
      name: "Makita Akkuschrauber",
      categoryId: powerTools.id,
      serialNumber: `MAKITA-${suffix}`
    });
    const fixedAssignment = await request(`/api/v1/admin/devices/${fixedDraft.id}`, {
      method: "PATCH",
      payload: { rowVersion: fixedDraft.rowVersion, fixedOwnerUserId: employee.id }
    });
    assert.equal(fixedAssignment.response.status, 200, await fixedAssignment.response.clone().text());
    const fixedTool = fixedAssignment.body.device;
    assert.equal(fixedTool.fixedOwner.id, employee.id);
    assert.equal(fixedTool.currentOwner.id, employee.id);
    const fixedToken = await tokenFor(fixedTool.id);
    const foreignScan = await request("/api/v1/devices/scan", {
      method: "POST", sessionCookie: foremanCookie,
      payload: { token: fixedToken, clientOperationId: randomUUID() }
    });
    assert.equal(foreignScan.body.scan.outcome, "confirmation_required");
    assert.equal(foreignScan.body.scan.device.fixedOwner.id, employee.id);
    assert.equal(foreignScan.body.scan.device.currentOwner.id, employee.id);

    const takeover = await request(`/api/v1/devices/${fixedTool.id}/transfers`, {
      method: "POST", sessionCookie: foremanCookie,
      payload: {
        action: "takeover", clientOperationId: randomUUID(),
        expectedRowVersion: foreignScan.body.scan.device.rowVersion
      }
    });
    assert.equal(takeover.response.status, 200, await takeover.response.clone().text());
    assert.equal(takeover.body.transfer.device.fixedOwner.id, employee.id);
    assert.equal(takeover.body.transfer.device.currentOwner.id, foreman.id);

    const ownerNotifications = await request("/api/v1/devices/notifications", {
      sessionCookie: employeeCookie
    });
    assert.equal(ownerNotifications.response.status, 200, await ownerNotifications.response.clone().text());
    assert.ok(ownerNotifications.body.notifications.some((entry) => (
      entry.type === "fixed_device_taken" && entry.device.id === fixedTool.id
    )));

    const giveBack = await request(`/api/v1/devices/${fixedTool.id}/transfers`, {
      method: "POST", sessionCookie: foremanCookie,
      payload: {
        action: "return_fixed_owner", clientOperationId: randomUUID(),
        expectedRowVersion: takeover.body.transfer.device.rowVersion
      }
    });
    assert.equal(giveBack.response.status, 200, await giveBack.response.clone().text());
    assert.equal(giveBack.body.transfer.device.currentOwner.id, employee.id);
    const fixedHistory = await request(`/api/v1/devices/${fixedTool.id}/history`, {
      sessionCookie: employeeCookie
    });
    assert.equal(fixedHistory.response.status, 200, await fixedHistory.response.clone().text());
    assert.ok(fixedHistory.body.history.transfers.length >= 2);
    assert.ok(fixedHistory.body.history.events.some((entry) => entry.action === "device_transferred"));
    assert.ok(fixedHistory.body.history.events.some((entry) => entry.action === "device_returned"));
    assert.ok(fixedHistory.body.history.events.some((entry) => entry.action === "device_fixed_owner_changed"));
    const returnedNotifications = await request("/api/v1/devices/notifications", {
      sessionCookie: employeeCookie
    });
    assert.ok(returnedNotifications.body.notifications.some((entry) => (
      entry.type === "fixed_device_returned" && entry.device.id === fixedTool.id
    )));

    const siteTool = await createDevice({
      inventoryNumber: `M-${suffix}-SITE`,
      name: "Messgerät auf Vorarbeiterbaustelle",
      categoryId: powerTools.id,
      constructionSiteId: structuredSite.id,
      status: "on_site"
    });
    const foremanSiteDevices = await request("/api/v1/devices?scope=all", {
      sessionCookie: foremanCookie
    });
    assert.equal(foremanSiteDevices.response.status, 200, await foremanSiteDevices.response.clone().text());
    assert.ok(foremanSiteDevices.body.devices.some((entry) => entry.id === siteTool.id));

    const battery = await createDevice({
      inventoryNumber: `A-${suffix}-01`,
      name: "Milwaukee M18 5,0 Ah",
      categoryId: batteries.id,
      manufacturer: "Milwaukee",
      serialNumber: `AKKU-${suffix}`,
      fixedOwnerUserId: employee.id,
      status: "fixed_assigned",
      battery: {
        batterySystem: "M18", voltage: 18, capacityAh: 5,
        cycleCount: 23, remainingCapacityPercent: 91,
        compatibleSystem: "Milwaukee M18"
      }
    });
    assert.equal(battery.baseType, "battery");
    assert.equal(battery.battery.capacityAh, 5);
    const batteryToken = await tokenFor(battery.id);
    const batteryForeignScan = await request("/api/v1/devices/scan", {
      method: "POST", sessionCookie: foremanCookie,
      payload: { token: batteryToken, clientOperationId: randomUUID() }
    });
    const batteryTakeover = await request(`/api/v1/devices/${battery.id}/transfers`, {
      method: "POST", sessionCookie: foremanCookie,
      payload: {
        action: "takeover", clientOperationId: randomUUID(),
        expectedRowVersion: batteryForeignScan.body.scan.device.rowVersion
      }
    });
    assert.equal(batteryTakeover.body.transfer.device.currentOwner.id, foreman.id);

    const defect = await request(`/api/v1/devices/${battery.id}/defects`, {
      method: "POST", sessionCookie: foremanCookie,
      payload: {
        description: "Gehäuse gerissen und Kontakte lose",
        severity: "critical", usable: false
      }
    });
    assert.equal(defect.response.status, 201, await defect.response.clone().text());
    assert.equal(defect.body.defect.device.status, "locked");
    assert.equal(defect.body.defect.device.blocked, true);
    const inspectionCannotHideDefect = await request(`/api/v1/admin/devices/${battery.id}/inspections`, {
      method: "POST",
      payload: {
        inspectionType: "Sicherheitsprüfung nach Reparaturannahme",
        inspectedOn: new Date().toISOString().slice(0, 10),
        result: "passed",
        nextInspectionOn: "2027-08-09"
      }
    });
    assert.equal(
      inspectionCannotHideDefect.response.status, 201,
      await inspectionCannotHideDefect.response.clone().text()
    );
    assert.equal(inspectionCannotHideDefect.body.inspection.device.status, "locked");
    const blockedBattery = await request("/api/v1/devices/scan", {
      method: "POST", sessionCookie: employeeCookie,
      payload: { token: batteryToken, clientOperationId: randomUUID() }
    });
    assert.equal(blockedBattery.body.scan.outcome, "blocked");
    const repairedBattery = await request(`/api/v1/admin/devices/defects/${defect.body.defect.id}/resolve`, {
      method: "POST",
      payload: {
        rowVersion: defect.body.defect.device.openDefect.rowVersion,
        resolutionNote: "Gehäuse und Kontakte ersetzt, Funktion geprüft"
      }
    });
    assert.equal(repairedBattery.response.status, 200, await repairedBattery.response.clone().text());
    assert.equal(repairedBattery.body.device.status, "loaned");
    assert.equal(repairedBattery.body.device.openDefect, null);
    const targetedBatteryHandover = await request(`/api/v1/devices/${battery.id}/transfers`, {
      method: "POST", sessionCookie: foremanCookie,
      payload: {
        action: "handover",
        toUserId: employee.id,
        clientOperationId: randomUUID(),
        expectedRowVersion: repairedBattery.body.device.rowVersion
      }
    });
    assert.equal(
      targetedBatteryHandover.response.status, 200,
      await targetedBatteryHandover.response.clone().text()
    );
    assert.equal(targetedBatteryHandover.body.transfer.device.currentOwner.id, employee.id);
    assert.equal(targetedBatteryHandover.body.transfer.device.status, "fixed_assigned");

    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const overdueDevice = await createDevice({
      inventoryNumber: `P-${suffix}-01`,
      name: "Prüfpflichtige Kabeltrommel",
      categoryId: powerTools.id,
      inspectionRequired: true,
      nextInspectionOn: yesterday
    });
    const settings = deviceContext.settings;
    const lockInspections = await request("/api/v1/admin/devices/settings", {
      method: "PATCH",
      payload: {
        inspectionWarningDays: settings.inspectionWarningDays,
        longLoanDays: settings.longLoanDays,
        lockOverdueInspections: true,
        defaultStorageLocationId: settings.defaultStorageLocationId,
        rowVersion: settings.rowVersion
      }
    });
    assert.equal(lockInspections.response.status, 200, await lockInspections.response.clone().text());
    const overdueToken = await tokenFor(overdueDevice.id);
    const overdueScan = await request("/api/v1/devices/scan", {
      method: "POST", sessionCookie: employeeCookie,
      payload: { token: overdueToken, clientOperationId: randomUUID() }
    });
    assert.equal(overdueScan.body.scan.outcome, "blocked");
    assert.equal(overdueScan.body.scan.device.inspectionState, "overdue");
    assert.equal(overdueScan.body.scan.device.effectiveStatus, "inspection_due");
    const overdueDirectTransfer = await request(`/api/v1/devices/${overdueDevice.id}/transfers`, {
      method: "POST", sessionCookie: employeeCookie,
      payload: {
        action: "takeover",
        clientOperationId: randomUUID(),
        expectedRowVersion: overdueScan.body.scan.device.rowVersion
      }
    });
    assert.equal(overdueDirectTransfer.response.status, 409);
    assert.equal(overdueDirectTransfer.body.error.code, "device_blocked");

    const passedInspection = await request(`/api/v1/admin/devices/${overdueDevice.id}/inspections`, {
      method: "POST",
      payload: {
        inspectionType: "DGUV Vorschrift 3",
        inspectedOn: new Date().toISOString().slice(0, 10),
        result: "passed",
        nextInspectionOn: "2027-08-09",
        intervalDays: 365,
        note: "Messwerte im zulässigen Bereich"
      }
    });
    assert.equal(passedInspection.response.status, 201, await passedInspection.response.clone().text());
    assert.equal(passedInspection.body.inspection.device.inspectionState, "ok");
    assert.equal(passedInspection.body.inspection.device.blocked, false);

    const stockDevice = await createDevice({
      inventoryNumber: `I-${suffix}-01`,
      name: "Inventurgerät Hauptlager",
      categoryId: powerTools.id,
      locationId: storage.id,
      status: "in_storage"
    });
    await createDevice({
      inventoryNumber: `I-${suffix}-MISS`,
      name: "Fehlendes Inventurgerät",
      categoryId: powerTools.id,
      locationId: storage.id,
      status: "in_storage"
    });
    const stockToken = await tokenFor(stockDevice.id);
    const employeeInventory = await request("/api/v1/devices/inventories", {
      method: "POST", sessionCookie: employeeCookie, payload: { locationId: storage.id }
    });
    assert.equal(employeeInventory.response.status, 403);
    assert.equal(employeeInventory.body.error.code, "device_inventory_forbidden");
    const inventory = await request("/api/v1/devices/inventories", {
      method: "POST", sessionCookie: foremanCookie, payload: { locationId: storage.id }
    });
    assert.equal(inventory.response.status, 201, await inventory.response.clone().text());
    const inventoryScan = await request(`/api/v1/devices/inventories/${inventory.body.inventory.id}/scan`, {
      method: "POST", sessionCookie: foremanCookie, payload: { token: stockToken }
    });
    assert.equal(inventoryScan.response.status, 201, await inventoryScan.response.clone().text());
    assert.equal(inventoryScan.body.scan.result, "found");
    const inventoryWrongLocation = await request(
      `/api/v1/devices/inventories/${inventory.body.inventory.id}/scan`, {
        method: "POST", sessionCookie: foremanCookie, payload: { token: rotatedToken }
      }
    );
    assert.equal(inventoryWrongLocation.response.status, 201, await inventoryWrongLocation.response.clone().text());
    assert.equal(inventoryWrongLocation.body.scan.result, "wrong_location");
    const inventoryUnknown = await request(
      `/api/v1/devices/inventories/${inventory.body.inventory.id}/scan`, {
        method: "POST", sessionCookie: foremanCookie, payload: { token: randomUUID() }
      }
    );
    assert.equal(inventoryUnknown.response.status, 201, await inventoryUnknown.response.clone().text());
    assert.equal(inventoryUnknown.body.scan.result, "unknown");
    const inventoryComplete = await request(`/api/v1/devices/inventories/${inventory.body.inventory.id}/complete`, {
      method: "POST", sessionCookie: foremanCookie, payload: {}
    });
    assert.equal(inventoryComplete.response.status, 200, await inventoryComplete.response.clone().text());
    assert.ok(inventoryComplete.body.report.counts.found >= 1);
    assert.ok(inventoryComplete.body.report.counts.missing >= 1);
    assert.ok(inventoryComplete.body.report.counts.wrong_location >= 1);
    assert.ok(inventoryComplete.body.report.counts.unknown >= 1);

    const raceDevice = await createDevice({
      inventoryNumber: `R-${suffix}-01`, name: "Gleichzeitig gescanntes Gerät",
      categoryId: powerTools.id
    });
    const raceToken = await tokenFor(raceDevice.id);
    const [employeeRace, foremanRace] = await Promise.all([
      request("/api/v1/devices/scan", {
        method: "POST", sessionCookie: employeeCookie,
        payload: { token: raceToken, clientOperationId: randomUUID() }
      }),
      request("/api/v1/devices/scan", {
        method: "POST", sessionCookie: foremanCookie,
        payload: { token: raceToken, clientOperationId: randomUUID() }
      })
    ]);
    assert.equal(employeeRace.response.status, 200, await employeeRace.response.clone().text());
    assert.equal(foremanRace.response.status, 200, await foremanRace.response.clone().text());
    assert.deepEqual(
      [employeeRace.body.scan.outcome, foremanRace.body.scan.outcome].sort(),
      ["assigned", "confirmation_required"]
    );
    const raceAssignments = await inspectionPool.query(
      `SELECT COUNT(*)::INTEGER AS count FROM device_assignments
       WHERE company_id=$1 AND device_id=$2 AND assignment_type='custody' AND ended_at IS NULL`,
      [tenantCompany.id, raceDevice.id]
    );
    assert.equal(raceAssignments.rows[0].count, 1);

    const manipulated = await request("/api/v1/devices/scan", {
      method: "POST", sessionCookie: employeeCookie,
      payload: { token: randomUUID(), clientOperationId: randomUUID() }
    });
    assert.equal(manipulated.response.status, 404);
    assert.equal(manipulated.body.error.code, "device_qr_unknown");

    const otherCompany = await inspectionPool.query(
      `INSERT INTO companies (legal_name,display_name)
       VALUES ($1,$1) RETURNING id,company_number`,
      [`Geräte-Mandantentrennung ${suffix}`]
    );
    const otherPassword = "Anderer-Mandant-2026!";
    const otherUser = await inspectionPool.query(
      `INSERT INTO users (
         company_id,personnel_number,first_name,last_name,password_hash,must_change_password
       ) VALUES ($1,$2,'Tina','Trennung',$3,FALSE) RETURNING id`,
      [otherCompany.rows[0].id, `TEN-${suffix}`, await hashPassword(otherPassword)]
    );
    await inspectionPool.query(
      `INSERT INTO user_roles (company_id,user_id,role_id,assigned_by_user_id,reason)
       SELECT $1,$2,role.id,$2,'Mandantentrennung im Integrationstest'
       FROM roles AS role WHERE role.company_id=$1 AND role.role_key='admin'`,
      [otherCompany.rows[0].id, otherUser.rows[0].id]
    );
    const otherLogin = await fetch(`${baseUrl}/api/v1/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: config.allowedOrigin },
      body: JSON.stringify({
        companyNumber: otherCompany.rows[0].company_number,
        personnelNumber: `TEN-${suffix}`,
        password: otherPassword
      })
    });
    assert.equal(otherLogin.status, 201, await otherLogin.clone().text());
    const otherCookie = otherLogin.headers.get("set-cookie").split(";", 1)[0];
    const crossTenantScan = await request("/api/v1/devices/scan", {
      method: "POST", sessionCookie: otherCookie,
      payload: { token: rotatedToken, clientOperationId: randomUUID() }
    });
    assert.equal(crossTenantScan.response.status, 404);
    assert.equal(crossTenantScan.body.error.code, "device_qr_unknown");
    const crossTenantId = await request(`/api/v1/devices/${freeTool.id}`, {
      sessionCookie: otherCookie
    });
    assert.equal(crossTenantId.response.status, 404);
    assert.equal(crossTenantId.body.error.code, "device_not_found");
    const platformOperationalRead = await request("/api/v1/devices/dashboard", {
      sessionCookie: platformCookie
    });
    assert.equal(platformOperationalRead.response.status, 401);

    const historicalEmployeeResult = await request("/api/v1/admin/employees", {
      method: "POST",
      payload: {
        personnelNumber: `GER-${suffix}`, firstName: "Historisch", lastName: "Gerät",
        role: "installer", temporaryPassword: "Historisches-Geraet-2026!"
      }
    });
    assert.equal(historicalEmployeeResult.response.status, 201, await historicalEmployeeResult.response.clone().text());
    const historicalEmployee = historicalEmployeeResult.body.employee;
    const historicalDevice = await createDevice({
      inventoryNumber: `H-${suffix}-01`, name: "Gerät eines archivierten Mitarbeiters",
      categoryId: powerTools.id, fixedOwnerUserId: historicalEmployee.id,
      status: "fixed_assigned"
    });
    const archiveHistoricalEmployee = await request(`/api/v1/admin/employees/${historicalEmployee.id}`, {
      method: "DELETE",
      payload: {
        rowVersion: historicalEmployee.rowVersion,
        reason: "Mitarbeiter mit Gerätehistorie im Integrationstest archivieren"
      }
    });
    assert.equal(archiveHistoricalEmployee.response.status, 200, await archiveHistoricalEmployee.response.clone().text());
    assert.equal(archiveHistoricalEmployee.body.mode, "archived");
    const archivedOwnerDevice = await request(`/api/v1/devices/${historicalDevice.id}`);
    assert.equal(archivedOwnerDevice.response.status, 200, await archivedOwnerDevice.response.clone().text());
    assert.equal(archivedOwnerDevice.body.device.fixedOwner.status, "archived");
    assert.equal(archivedOwnerDevice.body.device.fixedOwner.name, "Historisch Gerät");

    const retiredDevice = await createDevice({
      inventoryNumber: `X-${suffix}-01`, name: "Ausgemustertes Gerät", categoryId: powerTools.id
    });
    const retiredToken = await tokenFor(retiredDevice.id);
    const retire = await request(`/api/v1/admin/devices/${retiredDevice.id}`, {
      method: "DELETE",
      payload: { rowVersion: retiredDevice.rowVersion, reason: "Verschleiß im Integrationstest" }
    });
    assert.equal(retire.response.status, 200, await retire.response.clone().text());
    assert.equal(retire.body.device.status, "retired");
    const retiredScan = await request("/api/v1/devices/scan", {
      method: "POST", sessionCookie: employeeCookie,
      payload: { token: retiredToken, clientOperationId: randomUUID() }
    });
    assert.equal(retiredScan.response.status, 200, await retiredScan.response.clone().text());
    assert.equal(retiredScan.body.scan.outcome, "blocked");
    assert.equal(retiredScan.body.scan.device.status, "retired");
    const retiredDefect = await request(`/api/v1/devices/${retiredDevice.id}/defects`, {
      method: "POST", sessionCookie: employeeCookie,
      payload: { description: "Darf nicht mehr geändert werden", severity: "low", usable: true }
    });
    assert.equal(retiredDefect.response.status, 409);
    assert.equal(retiredDefect.body.error.code, "device_retired");

    const forbiddenCreate = await request("/api/v1/admin/devices", {
      method: "POST", sessionCookie: employeeCookie,
      payload: {
        inventoryNumber: `NO-${suffix}`, name: "Nicht erlaubt", categoryId: powerTools.id
      }
    });
    assert.equal(forbiddenCreate.response.status, 403);
    assert.equal(forbiddenCreate.body.error.code, "device_manage_forbidden");

    const setModule = async (status) => {
      const response = await fetch(
        `${baseUrl}/api/v1/platform/companies/${tenantCompany.id}/modules/devices`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json", Cookie: platformCookie },
          body: JSON.stringify({
            status,
            includedInPlan: status !== "inactive",
            separatelyBilled: false,
            featureScope: {},
            reason: `Gerätemodul im Integrationstest auf ${status} setzen`
          })
        }
      );
      assert.equal(response.status, 200, await response.clone().text());
    };
    await setModule("inactive");
    const disabled = await request("/api/v1/devices/dashboard", { sessionCookie: employeeCookie });
    assert.equal(disabled.response.status, 403);
    assert.equal(disabled.body.error.code, "devices_module_disabled");
    await setModule("permanent");
  });

  await t.test("Material: der Schalter sperrt auch die Schnittstelle", async () => {
    // Ein abgeschalteter Bereich wird nicht nur ausgeblendet, sondern gesperrt.
    // Sonst bliebe er ueber die Schnittstelle bedienbar und der Schalter waere
    // eine reine Anzeige - genau das war beim Material der Fall, als einzigem
    // Bereich mit eigenem Bildschirm.
    const schalteMaterial = async (status) => {
      const antwort = await fetch(
        `${baseUrl}/api/v1/platform/companies/${tenantCompany.id}/modules/materials`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json", Cookie: platformCookie },
          body: JSON.stringify({
            status,
            includedInPlan: status !== "inactive",
            separatelyBilled: false,
            featureScope: {},
            reason: `Material im Integrationstest auf ${status} setzen`
          })
        }
      );
      assert.equal(antwort.status, 200, await antwort.clone().text());
    };

    const anlegen = () => fetch(`${baseUrl}/api/v1/admin/site-materials`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: plannerCookie },
      body: JSON.stringify({
        constructionSiteId: structuredSite.id,
        itemName: "Kabelkanal 60x40",
        quantity: 12,
        unit: "m",
        status: "planned"
      })
    });

    await schalteMaterial("inactive");
    const gesperrt = await anlegen();
    assert.equal(gesperrt.status, 409, await gesperrt.clone().text());
    assert.equal((await gesperrt.json()).error.code, "module_disabled");

    await schalteMaterial("permanent");
    const erlaubt = await anlegen();
    assert.equal(erlaubt.status, 201, await erlaubt.clone().text());
    const eintrag = (await erlaubt.json()).siteMaterial;

    // Auch das Aendern haengt am Schalter, nicht nur das Anlegen.
    await schalteMaterial("inactive");
    const aenderungGesperrt = await fetch(
      `${baseUrl}/api/v1/admin/site-materials/${eintrag.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: plannerCookie },
        body: JSON.stringify({ status: "available", rowVersion: eintrag.rowVersion })
      }
    );
    assert.equal(aenderungGesperrt.status, 409, await aenderungGesperrt.clone().text());
    assert.equal((await aenderungGesperrt.json()).error.code, "module_disabled");

    await schalteMaterial("permanent");
  });

  await t.test("Nur die Plattform gibt Bereiche frei", async () => {
    // Frueher konnte die Firma ihre Bereiche selbst abschalten. Das ist
    // entfallen: der Umfang gehoert zum Verkauf, und ein selbst abgeschalteter
    // Bereich liess sich ohne fremde Hilfe nicht zurueckholen.
    const modulstand = async () => {
      const antwort = await fetch(`${baseUrl}/api/v1/session`, { headers: { Cookie: cookie } });
      assert.equal(antwort.status, 200, await antwort.clone().text());
      return (await antwort.json()).session.modules;
    };

    const schalteUeberPlattform = async (key, status) => {
      const antwort = await fetch(
        `${baseUrl}/api/v1/platform/companies/${tenantCompany.id}/modules/${key}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json", Cookie: platformCookie },
          body: JSON.stringify({
            status,
            includedInPlan: status !== "inactive",
            separatelyBilled: false,
            featureScope: {},
            reason: `${key} im Integrationstest auf ${status} setzen`
          })
        }
      );
      assert.equal(antwort.status, 200, await antwort.clone().text());
      return (await antwort.json()).entitlement;
    };

    const vorher = await modulstand();
    assert.equal(vorher.absences, true);

    // Die Plattform nimmt der Firma die Urlaubsverwaltung.
    await schalteUeberPlattform("absences", "inactive");
    assert.equal((await modulstand()).absences, false);

    // Ein gesperrter Bereich wird nicht nur ausgeblendet, sondern abgewiesen.
    const gesperrt = await fetch(`${baseUrl}/api/v1/absences`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        absenceType: "vacation",
        startDate: "2027-03-01",
        endDate: "2027-03-02",
        note: "Urlaub im Integrationstest"
      })
    });
    assert.equal(gesperrt.status, 409, await gesperrt.clone().text());
    assert.equal((await gesperrt.json()).error.code, "module_disabled");

    // Die Firma selbst hat keinen Weg mehr, das zurueckzunehmen.
    for (const [methode, pfad] of [
      ["GET", "/api/v1/admin/modules"],
      ["PATCH", "/api/v1/admin/modules/absences"]
    ]) {
      const versuch = await fetch(`${baseUrl}${pfad}`, {
        method: methode,
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: methode === "GET" ? undefined : JSON.stringify({ enabled: true, rowVersion: 0 })
      });
      assert.equal(versuch.status, 404, `${methode} ${pfad} antwortet noch`);
    }

    // Die Plattform gibt ihn wieder frei, danach arbeitet er unveraendert.
    await schalteUeberPlattform("absences", "permanent");
    assert.equal((await modulstand()).absences, true);
    const erlaubt = await fetch(`${baseUrl}/api/v1/absences`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        absenceType: "vacation",
        startDate: "2027-03-05",
        endDate: "2027-03-06",
        note: "Urlaub nach der erneuten Freigabe"
      })
    });
    assert.equal(erlaubt.status, 201, await erlaubt.clone().text());

    // Der Kern und die Einsatzplanung stehen nicht unter den Bereichen: sie
    // tragen die Zeitberechnung und lassen sich nicht wegnehmen.
    const stand = await modulstand();
    for (const fest of ["time_tracking", "scheduling"]) {
      assert.equal(stand[fest], undefined, `${fest} darf kein abschaltbarer Bereich sein`);
    }
  });

  await t.test("Plattformverwaltung: Firmen, Konten, Tarife und Betrieb", async () => {
    const platformSelfResponse = await fetch(`${baseUrl}/api/v1/platform/session`, {
      headers: { Cookie: platformCookie }
    });
    assert.equal(platformSelfResponse.status, 200);
    const platformSelf = (await platformSelfResponse.json()).session.platformUser;

    // Firmenverwaltung: Anlage, Stammdatenänderung, veraltete Datenversion und
    // kritische Statusänderung mit Bestätigungspflicht.
    const newCompanyResponse = await fetch(`${baseUrl}/api/v1/platform/companies`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: platformCookie },
      body: JSON.stringify({
        legalName: `Filiale ${suffix} GmbH`,
        displayName: `Filiale ${suffix}`,
        contactName: "Fiona Filiale",
        contactEmail: `filiale-${suffix.toLowerCase()}@example.test`,
        status: "active",
        reason: "Zweite Firma im PostgreSQL-Integrationstest anlegen"
      })
    });
    assert.equal(newCompanyResponse.status, 201, await newCompanyResponse.clone().text());
    const secondCompany = (await newCompanyResponse.json()).company;
    assert.equal(secondCompany.status, "active");

    // Eine direkt angelegte Firma hatte bisher keinen Benutzer und keinen Weg,
    // einen zu bekommen: die Ersteinrichtung der App gilt nur fuer die im
    // Server hinterlegte erste Firma. Solche Firmen blieben unbenutzbar.
    const ersterAdminResponse = await fetch(
      `${baseUrl}/api/v1/platform/companies/${secondCompany.id}/administrator`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: platformCookie },
        body: JSON.stringify({
          personnelNumber: `FIL-${suffix}`,
          firstName: "Fiona",
          lastName: "Filiale",
          temporaryPassword: "Filiale-Start-2026!",
          reason: "Erster Firmenadministrator nach Vertragsabschluss"
        })
      }
    );
    assert.equal(ersterAdminResponse.status, 201, await ersterAdminResponse.clone().text());
    const ersterAdmin = (await ersterAdminResponse.json()).administrator;
    assert.equal(ersterAdmin.companyNumber, secondCompany.companyNumber);
    assert.equal(ersterAdmin.mustChangePassword, true);

    // Nur solange die Firma keine Administration hat. Danach vergibt sie ihre
    // Konten selbst; die Plattform legt keine Benutzer im laufenden Betrieb an.
    const zweiterVersuch = await fetch(
      `${baseUrl}/api/v1/platform/companies/${secondCompany.id}/administrator`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: platformCookie },
        body: JSON.stringify({
          personnelNumber: `FIL2-${suffix}`,
          firstName: "Zwei",
          lastName: "Zuviel",
          temporaryPassword: "Filiale-Start-2026!",
          reason: "Zweiter Versuch"
        })
      }
    );
    assert.equal(zweiterVersuch.status, 409, await zweiterVersuch.clone().text());
    assert.equal((await zweiterVersuch.json()).error.code, "company_administrator_exists");

    // Die neue Firma laeuft eigenstaendig: eigene Anmeldung, eigene Adminrolle.
    const filialAnmeldung = await fetch(`${baseUrl}/api/v1/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: config.allowedOrigin },
      body: JSON.stringify({
        companyNumber: secondCompany.companyNumber,
        personnelNumber: `FIL-${suffix}`,
        password: "Filiale-Start-2026!"
      })
    });
    assert.equal(filialAnmeldung.status, 201, await filialAnmeldung.clone().text());
    const filialSitzung = (await filialAnmeldung.json()).session;
    assert.deepEqual(filialSitzung.user.roles, ["admin"]);
    assert.equal(filialSitzung.company.number, secondCompany.companyNumber);
    assert.equal(filialSitzung.user.mustChangePassword, true);

    const secondCompanyDetailResponse = await fetch(
      `${baseUrl}/api/v1/platform/companies/${secondCompany.id}`,
      { headers: { Cookie: platformCookie } }
    );
    assert.equal(secondCompanyDetailResponse.status, 200, await secondCompanyDetailResponse.clone().text());
    const secondCompanyDetail = await secondCompanyDetailResponse.json();
    assert.equal(secondCompanyDetail.company.id, secondCompany.id);
    assert.ok(Array.isArray(secondCompanyDetail.modules));

    const staleCompanyUpdate = await fetch(
      `${baseUrl}/api/v1/platform/companies/${secondCompany.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: platformCookie },
        body: JSON.stringify({
          contactName: "Veraltete Version",
          rowVersion: secondCompany.rowVersion + 1,
          reason: "Firmenänderung mit veralteter Datenversion versuchen"
        })
      }
    );
    assert.equal(staleCompanyUpdate.status, 409);
    assert.equal((await staleCompanyUpdate.json()).error.code, "stale_write");

    const updateCompanyResponse = await fetch(
      `${baseUrl}/api/v1/platform/companies/${secondCompany.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: platformCookie },
        body: JSON.stringify({
          contactName: "Fiona Filialleitung",
          rowVersion: secondCompany.rowVersion,
          reason: "Stammdaten der zweiten Firma im Integrationstest ändern"
        })
      }
    );
    assert.equal(updateCompanyResponse.status, 200, await updateCompanyResponse.clone().text());
    let secondCompanyState = (await updateCompanyResponse.json()).company;
    assert.equal(secondCompanyState.contactName, "Fiona Filialleitung");

    const unconfirmedStatusChange = await fetch(
      `${baseUrl}/api/v1/platform/companies/${secondCompany.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: platformCookie },
        body: JSON.stringify({
          status: "suspended",
          rowVersion: secondCompanyState.rowVersion,
          reason: "Kritische Statusänderung ohne Bestätigung versuchen"
        })
      }
    );
    assert.equal(unconfirmedStatusChange.status, 409);
    assert.equal((await unconfirmedStatusChange.json()).error.code, "company_confirmation_required");

    const confirmedStatusChange = await fetch(
      `${baseUrl}/api/v1/platform/companies/${secondCompany.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: platformCookie },
        body: JSON.stringify({
          status: "suspended",
          rowVersion: secondCompanyState.rowVersion,
          confirmation: secondCompany.companyNumber,
          reason: "Firma nach ausbleibender Zahlung im Integrationstest sperren"
        })
      }
    );
    assert.equal(confirmedStatusChange.status, 200, await confirmedStatusChange.clone().text());
    secondCompanyState = (await confirmedStatusChange.json()).company;
    assert.equal(secondCompanyState.status, "suspended");

    const reactivateCompanyResponse = await fetch(
      `${baseUrl}/api/v1/platform/companies/${secondCompany.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: platformCookie },
        body: JSON.stringify({
          status: "active",
          rowVersion: secondCompanyState.rowVersion,
          reason: "Firma nach dem Sperrtest im Integrationstest reaktivieren"
        })
      }
    );
    assert.equal(reactivateCompanyResponse.status, 200, await reactivateCompanyResponse.clone().text());
    secondCompanyState = (await reactivateCompanyResponse.json()).company;
    assert.equal(secondCompanyState.status, "active");

    // Modulkatalog und Modulfreigabe der zweiten Firma.
    const moduleCatalogResponse = await fetch(`${baseUrl}/api/v1/platform/modules`, {
      headers: { Cookie: platformCookie }
    });
    assert.equal(moduleCatalogResponse.status, 200);
    const moduleCatalog = (await moduleCatalogResponse.json()).modules;
    assert.ok(moduleCatalog.some((entry) => entry.moduleKey === "vde"));

    const moduleTrialStart = new Date().toISOString();
    const moduleTrialEnd = new Date(Date.now() + 30 * 86_400_000).toISOString();
    const moduleUpdateResponse = await fetch(
      `${baseUrl}/api/v1/platform/companies/${secondCompany.id}/modules/vde`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: platformCookie },
        body: JSON.stringify({
          status: "trial",
          startsAt: moduleTrialStart,
          endsAt: moduleTrialEnd,
          reason: "VDE-Testfreigabe für die zweite Firma im Integrationstest"
        })
      }
    );
    assert.equal(moduleUpdateResponse.status, 200, await moduleUpdateResponse.clone().text());
    assert.equal((await moduleUpdateResponse.json()).entitlement.entitlementStatus, "trial");

    // Tarif, Tarifversion und Vertragszuweisung mit Bestätigungspflicht.
    const secondPlanResponse = await fetch(`${baseUrl}/api/v1/platform/plans`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: platformCookie },
      body: JSON.stringify({
        key: `filiale_${suffix.toLowerCase()}`,
        name: "Filialtarif",
        status: "active",
        description: "Tarif für Vertragszuweisung im Integrationstest",
        reason: "Filialtarif für Vertragszuweisung anlegen"
      })
    });
    assert.equal(secondPlanResponse.status, 201, await secondPlanResponse.clone().text());
    const secondPlan = (await secondPlanResponse.json()).plan;

    const plansListResponse = await fetch(`${baseUrl}/api/v1/platform/plans`, {
      headers: { Cookie: platformCookie }
    });
    assert.equal(plansListResponse.status, 200);
    assert.ok((await plansListResponse.json()).plans.some((entry) => entry.id === secondPlan.id));

    const planVersionResponse = await fetch(
      `${baseUrl}/api/v1/platform/plans/${secondPlan.id}/versions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: platformCookie },
        body: JSON.stringify({
          monthlyPriceCents: 9900,
          annualPriceCents: 99000,
          userLimit: 25,
          includedModules: ["vde"],
          reason: "Erste Tarifversion für den Filialtarif anlegen"
        })
      }
    );
    assert.equal(planVersionResponse.status, 201, await planVersionResponse.clone().text());
    const planVersion = (await planVersionResponse.json()).version;
    assert.equal(planVersion.versionNumber, 1);

    const missingConfirmationContract = await fetch(
      `${baseUrl}/api/v1/platform/companies/${secondCompany.id}/contracts`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: platformCookie },
        body: JSON.stringify({
          planVersionId: planVersion.id,
          reason: "Vertragszuweisung ohne Bestätigung versuchen"
        })
      }
    );
    assert.equal(missingConfirmationContract.status, 409);
    assert.equal((await missingConfirmationContract.json()).error.code, "contract_confirmation_required");

    const contractResponse = await fetch(
      `${baseUrl}/api/v1/platform/companies/${secondCompany.id}/contracts`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: platformCookie },
        body: JSON.stringify({
          planVersionId: planVersion.id,
          confirmation: secondCompany.companyNumber,
          status: "active",
          reason: "Filialtarif der zweiten Firma im Integrationstest zuweisen"
        })
      }
    );
    assert.equal(contractResponse.status, 201, await contractResponse.clone().text());
    const contract = (await contractResponse.json()).contract;
    assert.equal(contract.monthlyPriceCents, 9900);

    // Plattformadministratoren: Anlage, Rollenrechte und Kontoaktionen.
    const supportAdminTemporaryPassword = "Plattform-Support-2026!";
    const supportAdminEmail = `support-${suffix.toLowerCase()}@example.test`;
    const createSupportAdminResponse = await fetch(`${baseUrl}/api/v1/platform/administrators`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: platformCookie },
      body: JSON.stringify({
        firstName: "Sven",
        lastName: "Support",
        email: supportAdminEmail,
        roleKeys: ["support"],
        temporaryPassword: supportAdminTemporaryPassword,
        reason: "Support-Zugang im Integrationstest anlegen"
      })
    });
    assert.equal(createSupportAdminResponse.status, 201, await createSupportAdminResponse.clone().text());
    const supportAdmin = (await createSupportAdminResponse.json()).administrator;
    assert.deepEqual(supportAdmin.roles, ["support"]);

    const administratorListResponse = await fetch(`${baseUrl}/api/v1/platform/administrators`, {
      headers: { Cookie: platformCookie }
    });
    assert.equal(administratorListResponse.status, 200);
    const administratorList = await administratorListResponse.json();
    assert.ok(administratorList.administrators.some((entry) => entry.id === supportAdmin.id));
    const supportRole = administratorList.roles.find((role) => role.roleKey === "support");
    assert.ok(supportRole);

    const supportLoginResponse = await fetch(`${baseUrl}/api/v1/platform/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: supportAdminEmail, password: supportAdminTemporaryPassword })
    });
    assert.equal(supportLoginResponse.status, 201, await supportLoginResponse.clone().text());
    const supportCookie = supportLoginResponse.headers.get("set-cookie").split(";", 1)[0];
    const supportSession = (await supportLoginResponse.json()).session;
    assert.deepEqual(supportSession.platformUser.roles, ["support"]);

    // Ohne Tarifverwaltung ist der Support-Rolle die Tarifanlage verwehrt.
    const forbiddenPlanCreate = await fetch(`${baseUrl}/api/v1/platform/plans`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: supportCookie },
      body: JSON.stringify({
        key: `verboten_${suffix.toLowerCase()}`,
        name: "Nicht erlaubt",
        reason: "Support darf keine Tarife anlegen"
      })
    });
    assert.equal(forbiddenPlanCreate.status, 403);
    assert.equal((await forbiddenPlanCreate.json()).error.code, "platform_permission_forbidden");

    const rolePermissionsUpdate = await fetch(
      `${baseUrl}/api/v1/platform/roles/${supportRole.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: platformCookie },
        body: JSON.stringify({
          permissions: [...supportRole.permissions, "errors.manage"],
          rowVersion: supportRole.rowVersion,
          confirmation: "support",
          reason: "Support-Rolle im Integrationstest um Fehlerverwaltung erweitern"
        })
      }
    );
    assert.equal(rolePermissionsUpdate.status, 200, await rolePermissionsUpdate.clone().text());
    assert.ok((await rolePermissionsUpdate.json()).role.permissions.includes("errors.manage"));

    const selfDisableForbidden = await fetch(
      `${baseUrl}/api/v1/platform/administrators/${platformSelf.id}/actions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: platformCookie },
        body: JSON.stringify({
          action: "disable",
          confirmation: platformSelf.email,
          reason: "Selbstdeaktivierung im Integrationstest versuchen"
        })
      }
    );
    assert.equal(selfDisableForbidden.status, 409);
    assert.equal((await selfDisableForbidden.json()).error.code, "self_disable_forbidden");

    const disableSupportAdmin = await fetch(
      `${baseUrl}/api/v1/platform/administrators/${supportAdmin.id}/actions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: platformCookie },
        body: JSON.stringify({
          action: "disable",
          confirmation: supportAdminEmail,
          reason: "Support-Zugang im Integrationstest vorübergehend sperren"
        })
      }
    );
    assert.equal(disableSupportAdmin.status, 200, await disableSupportAdmin.clone().text());
    assert.equal((await disableSupportAdmin.json()).administrator.status, "disabled");

    const disabledAdminLoginResponse = await fetch(`${baseUrl}/api/v1/platform/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: supportAdminEmail, password: supportAdminTemporaryPassword })
    });
    assert.equal(disabledAdminLoginResponse.status, 401);

    const enableSupportAdmin = await fetch(
      `${baseUrl}/api/v1/platform/administrators/${supportAdmin.id}/actions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: platformCookie },
        body: JSON.stringify({ action: "enable", reason: "Support-Zugang im Integrationstest wieder freigeben" })
      }
    );
    assert.equal(enableSupportAdmin.status, 200, await enableSupportAdmin.clone().text());
    assert.equal((await enableSupportAdmin.json()).administrator.status, "active");

    const unlockSupportAdmin = await fetch(
      `${baseUrl}/api/v1/platform/administrators/${supportAdmin.id}/actions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: platformCookie },
        body: JSON.stringify({ action: "unlock", reason: "Sperrzähler im Integrationstest zurücksetzen" })
      }
    );
    assert.equal(unlockSupportAdmin.status, 200, await unlockSupportAdmin.clone().text());
    assert.equal((await unlockSupportAdmin.json()).administrator.failedLoginAttempts, 0);

    const supportReLoginResponse = await fetch(`${baseUrl}/api/v1/platform/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: supportAdminEmail, password: supportAdminTemporaryPassword })
    });
    assert.equal(supportReLoginResponse.status, 201, await supportReLoginResponse.clone().text());
    const supportSecondCookie = supportReLoginResponse.headers.get("set-cookie").split(";", 1)[0];

    const endSupportSessions = await fetch(
      `${baseUrl}/api/v1/platform/administrators/${supportAdmin.id}/actions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: platformCookie },
        body: JSON.stringify({ action: "end_sessions", reason: "Sitzungen im Integrationstest beenden" })
      }
    );
    assert.equal(endSupportSessions.status, 200, await endSupportSessions.clone().text());
    const endedSupportSessionResponse = await fetch(`${baseUrl}/api/v1/platform/session`, {
      headers: { Cookie: supportSecondCookie }
    });
    assert.equal(endedSupportSessionResponse.status, 401);

    const assignRolesResponse = await fetch(
      `${baseUrl}/api/v1/platform/administrators/${supportAdmin.id}/actions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: platformCookie },
        body: JSON.stringify({
          action: "assign_roles",
          roleKeys: ["support", "technical"],
          confirmation: supportAdminEmail,
          reason: "Support-Konto im Integrationstest zusätzlich mit der Technik-Rolle ausstatten"
        })
      }
    );
    assert.equal(assignRolesResponse.status, 200, await assignRolesResponse.clone().text());
    assert.deepEqual((await assignRolesResponse.json()).administrator.roles, ["support", "technical"]);

    // Firmenkonten aus Sicht der Plattform: Suche, Korrektur und Kontoaktionen.
    const invitedEmployeeResponse = await fetch(`${baseUrl}/api/v1/admin/employees`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        personnelNumber: `INV-${suffix}`,
        firstName: "Ines",
        lastName: "Einladung",
        role: "installer",
        temporaryPassword: "Einladung-Integration-2026!"
      })
    });
    assert.equal(invitedEmployeeResponse.status, 201, await invitedEmployeeResponse.clone().text());
    const invitedEmployee = (await invitedEmployeeResponse.json()).employee;
    assert.equal(invitedEmployee.mustChangePassword, true);

    const accountsListResponse = await fetch(
      `${baseUrl}/api/v1/platform/accounts?search=Mara&companyId=${tenantCompany.id}`,
      { headers: { Cookie: platformCookie } }
    );
    assert.equal(accountsListResponse.status, 200, await accountsListResponse.clone().text());
    const accountsList = await accountsListResponse.json();
    assert.ok(accountsList.accounts.items.some((entry) => entry.id === employee.id));

    const correctEmailResponse = await fetch(
      `${baseUrl}/api/v1/platform/accounts/${employee.id}/actions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: platformCookie },
        body: JSON.stringify({
          action: "correct_email",
          email: "mara.montage.korrigiert@example.test",
          reason: "Falsch erfasste E-Mail-Adresse im Integrationstest korrigieren"
        })
      }
    );
    assert.equal(correctEmailResponse.status, 200, await correctEmailResponse.clone().text());
    assert.equal((await correctEmailResponse.json()).account.email, "mara.montage.korrigiert@example.test");

    const resendInvitationResponse = await fetch(
      `${baseUrl}/api/v1/platform/accounts/${invitedEmployee.id}/actions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: platformCookie },
        body: JSON.stringify({ action: "resend_invitation", reason: "Einladung im Integrationstest erneut versenden" })
      }
    );
    assert.equal(resendInvitationResponse.status, 200, await resendInvitationResponse.clone().text());

    const revokeInvitationDeniedResponse = await fetch(
      `${baseUrl}/api/v1/platform/accounts/${employee.id}/actions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: platformCookie },
        body: JSON.stringify({ action: "revoke_invitation", reason: "Einladung ohne offenen Status widerrufen versuchen" })
      }
    );
    assert.equal(revokeInvitationDeniedResponse.status, 409);
    assert.equal((await revokeInvitationDeniedResponse.json()).error.code, "invitation_not_pending");

    const revokeInvitationResponse = await fetch(
      `${baseUrl}/api/v1/platform/accounts/${invitedEmployee.id}/actions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: platformCookie },
        body: JSON.stringify({ action: "revoke_invitation", reason: "Ungenutzte Einladung im Integrationstest widerrufen" })
      }
    );
    assert.equal(revokeInvitationResponse.status, 200, await revokeInvitationResponse.clone().text());
    assert.equal((await revokeInvitationResponse.json()).account.status, "inactive");

    const unlockInactiveAccountResponse = await fetch(
      `${baseUrl}/api/v1/platform/accounts/${invitedEmployee.id}/actions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: platformCookie },
        body: JSON.stringify({ action: "unlock", reason: "Deaktiviertes Konto im Integrationstest entsperren versuchen" })
      }
    );
    assert.equal(unlockInactiveAccountResponse.status, 409);
    assert.equal((await unlockInactiveAccountResponse.json()).error.code, "account_not_locked");

    const unlockActiveAccountResponse = await fetch(
      `${baseUrl}/api/v1/platform/accounts/${employee.id}/actions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: platformCookie },
        body: JSON.stringify({ action: "unlock", reason: "Sperrzähler im Integrationstest zurücksetzen" })
      }
    );
    assert.equal(unlockActiveAccountResponse.status, 200, await unlockActiveAccountResponse.clone().text());

    // Ein Konto mit fachlicher Historie darf nicht verschoben werden. Die
    // Datenbankfunktion weist das mit einer rohen Ausnahme zurück, die als
    // gruppierter Plattformfehler protokolliert wird statt als Validierungsfehler.
    const reassignHistoricalEmployeeResponse = await fetch(
      `${baseUrl}/api/v1/platform/accounts/${employee.id}/actions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: platformCookie },
        body: JSON.stringify({
          action: "reassign_company",
          companyId: secondCompany.id,
          reason: "Konto mit historischen Daten versehentlich verschieben"
        })
      }
    );
    assert.equal(reassignHistoricalEmployeeResponse.status, 500);
    assert.equal((await reassignHistoricalEmployeeResponse.json()).error.code, "internal_error");

    const reassignEmployeeResponse = await fetch(
      `${baseUrl}/api/v1/platform/accounts/${invitedEmployee.id}/actions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: platformCookie },
        body: JSON.stringify({
          action: "reassign_company",
          companyId: secondCompany.id,
          reason: "Konto ohne historische Daten im Integrationstest verschieben"
        })
      }
    );
    assert.equal(reassignEmployeeResponse.status, 200, await reassignEmployeeResponse.clone().text());
    assert.equal((await reassignEmployeeResponse.json()).account.companyId, secondCompany.id);

    const reassignSameCompanyResponse = await fetch(
      `${baseUrl}/api/v1/platform/accounts/${invitedEmployee.id}/actions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: platformCookie },
        body: JSON.stringify({
          action: "reassign_company",
          companyId: secondCompany.id,
          reason: "Konto erneut in dieselbe Firma verschieben versuchen"
        })
      }
    );
    assert.equal(reassignSameCompanyResponse.status, 400);

    const endEmployeeSessionsResponse = await fetch(
      `${baseUrl}/api/v1/platform/accounts/${employee.id}/actions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: platformCookie },
        body: JSON.stringify({ action: "end_sessions", reason: "Sitzungen im Integrationstest beenden" })
      }
    );
    assert.equal(endEmployeeSessionsResponse.status, 200, await endEmployeeSessionsResponse.clone().text());
    const employeeSessionAfterEnd = await fetch(`${baseUrl}/api/v1/session`, { headers: { Cookie: employeeCookie } });
    assert.equal(employeeSessionAfterEnd.status, 401);

    // Registrierungseinladungen: erneuter Versand, Freigabe und Ablehnung.
    const secondRegistrationResponse = await fetch(`${baseUrl}/api/v1/platform/registrations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: platformCookie },
      body: JSON.stringify({
        legalName: `Selbstregistrierung ${suffix} GmbH`,
        displayName: `Selbstregistrierung ${suffix}`,
        contactName: "Rico Registrierung",
        contactEmail: `selbst-${suffix.toLowerCase()}@example.test`,
        planKey: "standard",
        isTestCompany: true,
        expiresInDays: 14,
        reason: "Registrierung für Freigabetest im Integrationstest anlegen"
      })
    });
    assert.equal(secondRegistrationResponse.status, 201, await secondRegistrationResponse.clone().text());
    const secondRegistration = (await secondRegistrationResponse.json()).registration;

    const registrationsListResponse = await fetch(`${baseUrl}/api/v1/platform/registrations`, {
      headers: { Cookie: platformCookie }
    });
    assert.equal(registrationsListResponse.status, 200);
    assert.ok(
      (await registrationsListResponse.json()).registrations.some((entry) => entry.id === secondRegistration.id)
    );

    const approveRegistrationResponse = await fetch(
      `${baseUrl}/api/v1/platform/registrations/${secondRegistration.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: platformCookie },
        body: JSON.stringify({
          action: "approve",
          rowVersion: secondRegistration.rowVersion,
          personnelNumber: "REG-0001",
          firstName: "Rico",
          lastName: "Registrierung",
          temporaryPassword: "Registrierung-2026-Start!",
          trialDays: 30,
          reason: "Selbstregistrierung im Integrationstest freigeben"
        })
      }
    );
    assert.equal(approveRegistrationResponse.status, 200, await approveRegistrationResponse.clone().text());
    const approvedRegistration = (await approveRegistrationResponse.json()).registration;
    assert.equal(approvedRegistration.status, "approved");

    const reapproveRegistrationResponse = await fetch(
      `${baseUrl}/api/v1/platform/registrations/${secondRegistration.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: platformCookie },
        body: JSON.stringify({
          action: "approve",
          rowVersion: approvedRegistration.rowVersion,
          personnelNumber: "REG-0002",
          firstName: "Rico",
          lastName: "Registrierung",
          temporaryPassword: "Registrierung-2026-Start!",
          reason: "Bereits freigegebene Registrierung erneut freigeben versuchen"
        })
      }
    );
    assert.equal(reapproveRegistrationResponse.status, 409);
    assert.equal((await reapproveRegistrationResponse.json()).error.code, "registration_not_open");

    const thirdRegistrationResponse = await fetch(`${baseUrl}/api/v1/platform/registrations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: platformCookie },
      body: JSON.stringify({
        legalName: `Abgelehnt ${suffix} GmbH`,
        displayName: `Abgelehnt ${suffix}`,
        contactName: "Rex Reject",
        contactEmail: `abgelehnt-${suffix.toLowerCase()}@example.test`,
        planKey: "standard",
        reason: "Registrierung für Ablehnungstest im Integrationstest anlegen"
      })
    });
    assert.equal(thirdRegistrationResponse.status, 201);
    const thirdRegistration = (await thirdRegistrationResponse.json()).registration;

    const rejectRegistrationResponse = await fetch(
      `${baseUrl}/api/v1/platform/registrations/${thirdRegistration.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: platformCookie },
        body: JSON.stringify({
          action: "reject",
          rowVersion: thirdRegistration.rowVersion,
          reason: "Registrierung im Integrationstest ablehnen"
        })
      }
    );
    assert.equal(rejectRegistrationResponse.status, 200, await rejectRegistrationResponse.clone().text());
    assert.equal((await rejectRegistrationResponse.json()).registration.status, "rejected");

    // Supportfall: Aktualisierung von Status, Priorität und Zuständigkeit.
    const secondTicketResponse = await fetch(`${baseUrl}/api/v1/platform/support/tickets`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: platformCookie },
      body: JSON.stringify({
        companyId: tenantCompany.id,
        contactName: "Zweiter Supportfall",
        contactEmail: "support-zwei@example.test",
        category: "billing",
        priority: "normal",
        subject: "Rechnungsfrage im Integrationstest",
        description: "Supportfall zum Testen der Aktualisierung anlegen.",
        reason: "Supportfall für Aktualisierungstest anlegen"
      })
    });
    assert.equal(secondTicketResponse.status, 201, await secondTicketResponse.clone().text());
    const secondTicket = (await secondTicketResponse.json()).ticket;

    const supportTicketsListResponse = await fetch(`${baseUrl}/api/v1/platform/support/tickets`, {
      headers: { Cookie: platformCookie }
    });
    assert.equal(supportTicketsListResponse.status, 200);
    assert.ok((await supportTicketsListResponse.json()).tickets.some((entry) => entry.id === secondTicket.id));

    const updateTicketResponse = await fetch(
      `${baseUrl}/api/v1/platform/support/tickets/${secondTicket.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: platformCookie },
        body: JSON.stringify({
          status: "in_progress",
          priority: "high",
          assigneeId: platformSelf.id,
          rowVersion: secondTicket.rowVersion,
          reason: "Supportfall im Integrationstest übernehmen"
        })
      }
    );
    assert.equal(updateTicketResponse.status, 200, await updateTicketResponse.clone().text());
    const updatedTicket = (await updateTicketResponse.json()).ticket;
    assert.equal(updatedTicket.status, "in_progress");
    assert.equal(updatedTicket.assignedPlatformUserId, platformSelf.id);

    const closeTicketResponse = await fetch(
      `${baseUrl}/api/v1/platform/support/tickets/${secondTicket.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: platformCookie },
        body: JSON.stringify({
          status: "closed",
          rowVersion: updatedTicket.rowVersion,
          reason: "Supportfall im Integrationstest abschließen"
        })
      }
    );
    assert.equal(closeTicketResponse.status, 200, await closeTicketResponse.clone().text());
    assert.ok((await closeTicketResponse.json()).ticket.closedAt);

    // Systemstatus: Beeinträchtigung melden und wieder aufheben.
    const healthListResponse = await fetch(`${baseUrl}/api/v1/platform/health`, {
      headers: { Cookie: platformCookie }
    });
    assert.equal(healthListResponse.status, 200);
    assert.ok((await healthListResponse.json()).components.some((entry) => entry.componentKey === "pdf"));

    const degradeHealthResponse = await fetch(`${baseUrl}/api/v1/platform/health/pdf`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: platformCookie },
      body: JSON.stringify({
        status: "degraded",
        errorSummary: "PDF-Erstellung im Integrationstest testweise verlangsamt",
        reason: "Systemstatus im Integrationstest auf beeinträchtigt setzen"
      })
    });
    assert.equal(degradeHealthResponse.status, 200, await degradeHealthResponse.clone().text());
    assert.equal((await degradeHealthResponse.json()).component.status, "degraded");

    const recoverHealthResponse = await fetch(`${baseUrl}/api/v1/platform/health/pdf`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: platformCookie },
      body: JSON.stringify({
        status: "available",
        reason: "Systemstatus im Integrationstest wieder auf verfügbar setzen"
      })
    });
    assert.equal(recoverHealthResponse.status, 200, await recoverHealthResponse.clone().text());
    assert.equal((await recoverHealthResponse.json()).component.status, "available");

    const unknownHealthComponentResponse = await fetch(`${baseUrl}/api/v1/platform/health/unbekannt`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: platformCookie },
      body: JSON.stringify({ status: "available", reason: "Unbekannte Komponente testen" })
    });
    assert.equal(unknownHealthComponentResponse.status, 404);
    assert.equal((await unknownHealthComponentResponse.json()).error.code, "health_component_not_found");

    // Der zuvor ausgelöste Plattformfehler wird gruppiert angezeigt und lässt
    // sich untersuchen und beheben.
    const errorsListResponse = await fetch(`${baseUrl}/api/v1/platform/errors`, {
      headers: { Cookie: platformCookie }
    });
    assert.equal(errorsListResponse.status, 200, await errorsListResponse.clone().text());
    const platformErrors = (await errorsListResponse.json()).errors;
    const reassignmentError = platformErrors.find((entry) => (
      entry.sanitizedMessage?.includes("/api/v1/platform/accounts/")
      && entry.module === "platform_administration"
    ));
    assert.ok(reassignmentError, "Der ausgelöste Plattformfehler wurde nicht gruppiert");
    assert.ok(reassignmentError.occurrenceCount >= 1);

    const investigateErrorResponse = await fetch(
      `${baseUrl}/api/v1/platform/errors/${reassignmentError.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: platformCookie },
        body: JSON.stringify({ status: "investigating", reason: "Ausgelösten Fehler im Integrationstest untersuchen" })
      }
    );
    assert.equal(investigateErrorResponse.status, 200, await investigateErrorResponse.clone().text());

    const resolveErrorResponse = await fetch(
      `${baseUrl}/api/v1/platform/errors/${reassignmentError.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: platformCookie },
        body: JSON.stringify({ status: "resolved", reason: "Ausgelösten Fehler im Integrationstest beheben" })
      }
    );
    assert.equal(resolveErrorResponse.status, 200, await resolveErrorResponse.clone().text());
    assert.ok((await resolveErrorResponse.json()).error.resolvedAt);

    // Versionsverwaltung: eine weitere Version als Entwurf anlegen.
    const draftVersionResponse = await fetch(`${baseUrl}/api/v1/platform/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: platformCookie },
      body: JSON.stringify({
        // Die Fassungsnummer traegt den Lauf im Namen. Fest verdrahtet legte
        // der Test sie beim zweiten Mal erneut an und lief in einen
        // Schluesselkonflikt, den die Schnittstelle nur als "internal_error"
        // meldete.
        version: entwurfsVersion,
        status: "draft",
        changelog: "Entwurfsversion für den Integrationstest",
        reason: "Entwurfsversion im Integrationstest anlegen"
      })
    });
    assert.equal(draftVersionResponse.status, 201, await draftVersionResponse.clone().text());
    assert.equal((await draftVersionResponse.json()).version.releaseStatus, "draft");

    // Mitteilungen: Anlage mit Empfängerprüfung und Veröffentlichung.
    const draftAnnouncementResponse = await fetch(`${baseUrl}/api/v1/platform/announcements`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: platformCookie },
      body: JSON.stringify({
        title: "Wartungsfenster im Integrationstest",
        message: "Geplante Wartung zum Testen der Mitteilungsverwaltung.",
        type: "maintenance",
        status: "draft",
        targets: { scope: "companies", values: [tenantCompany.id] },
        reason: "Mitteilung im Integrationstest anlegen"
      })
    });
    assert.equal(draftAnnouncementResponse.status, 201, await draftAnnouncementResponse.clone().text());
    const draftAnnouncement = (await draftAnnouncementResponse.json()).announcement;

    const invalidTargetAnnouncementResponse = await fetch(`${baseUrl}/api/v1/platform/announcements`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: platformCookie },
      body: JSON.stringify({
        title: "Ungültige Empfänger",
        message: "Darf nicht angelegt werden.",
        type: "update",
        targets: { scope: "plans", values: ["kein_bekannter_tarif"] },
        reason: "Unbekannte Empfängerwerte im Integrationstest prüfen"
      })
    });
    assert.equal(invalidTargetAnnouncementResponse.status, 400);
    assert.match((await invalidTargetAnnouncementResponse.json()).error.message, /Unbekannte Empfängerwerte/);

    const publishAnnouncementResponse = await fetch(
      `${baseUrl}/api/v1/platform/announcements/${draftAnnouncement.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: platformCookie },
        body: JSON.stringify({
          status: "published",
          rowVersion: draftAnnouncement.rowVersion,
          reason: "Mitteilung im Integrationstest veröffentlichen"
        })
      }
    );
    assert.equal(publishAnnouncementResponse.status, 200, await publishAnnouncementResponse.clone().text());
    assert.equal((await publishAnnouncementResponse.json()).announcement.status, "published");

    const announcementListResponse = await fetch(`${baseUrl}/api/v1/platform/announcements`, {
      headers: { Cookie: platformCookie }
    });
    assert.equal(announcementListResponse.status, 200);
    assert.ok(
      (await announcementListResponse.json()).announcements.some((entry) => entry.id === draftAnnouncement.id)
    );

    // Backups: Anstoß und Liste; eine Wiederherstellung setzt ein tatsächlich
    // erfolgreiches, geprüftes Backup voraus, das nur die asynchrone
    // Sicherungsverarbeitung liefert, nicht die API selbst.
    const queueBackupResponse = await fetch(`${baseUrl}/api/v1/platform/backups`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: platformCookie },
      body: JSON.stringify({ type: "manual", reason: "Backup im Integrationstest anstoßen" })
    });
    assert.equal(queueBackupResponse.status, 202, await queueBackupResponse.clone().text());
    const queuedBackup = (await queueBackupResponse.json()).backup;
    assert.equal(queuedBackup.status, "queued");

    const backupListResponse = await fetch(`${baseUrl}/api/v1/platform/backups`, {
      headers: { Cookie: platformCookie }
    });
    assert.equal(backupListResponse.status, 200);
    assert.ok((await backupListResponse.json()).backups.some((entry) => entry.id === queuedBackup.id));

    const restoreWithoutSuccessfulBackupResponse = await fetch(`${baseUrl}/api/v1/platform/restores`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: platformCookie },
      body: JSON.stringify({
        type: "test",
        backupId: queuedBackup.id,
        reason: "Wiederherstellung aus einem noch nicht erfolgreichen Backup versuchen"
      })
    });
    assert.equal(restoreWithoutSuccessfulBackupResponse.status, 409);
    assert.equal((await restoreWithoutSuccessfulBackupResponse.json()).error.code, "backup_not_restorable");

    // Datenschutzanfrage: vollständiger Ablauf über alle Phasen bis zum
    // Abschluss, einschließlich der Zwei-Personen-Freigabe bei der
    // endgültigen Bestätigung.
    const privacyRequestResponse = await fetch(`${baseUrl}/api/v1/platform/privacy`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: platformCookie },
      body: JSON.stringify({
        type: "user_export",
        userId: invitedEmployee.id,
        reason: "Auskunftsersuchen im Integrationstest anlegen"
      })
    });
    assert.equal(privacyRequestResponse.status, 201, await privacyRequestResponse.clone().text());
    let privacyRequest = (await privacyRequestResponse.json()).request;
    assert.equal(privacyRequest.status, "recorded");
    assert.equal(privacyRequest.companyId, secondCompany.id);

    const advancePrivacy = async (status, reason) => {
      const response = await fetch(`${baseUrl}/api/v1/platform/privacy/${privacyRequest.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: platformCookie },
        body: JSON.stringify({ status, rowVersion: privacyRequest.rowVersion, reason })
      });
      assert.equal(response.status, 200, await response.clone().text());
      privacyRequest = (await response.json()).request;
      return privacyRequest;
    };

    await advancePrivacy("retention_review", "Aufbewahrungsprüfung im Integrationstest starten");
    assert.equal(privacyRequest.status, "retention_review");
    await advancePrivacy("deactivated", "Konto im Integrationstest deaktivieren");
    await advancePrivacy("archived", "Daten im Integrationstest archivieren");
    await advancePrivacy("recovery_period", "Wiederherstellungsfrist im Integrationstest starten");
    assert.equal(privacyRequest.status, "recovery_period");

    const selfConfirmForbidden = await fetch(`${baseUrl}/api/v1/platform/privacy/${privacyRequest.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: platformCookie },
      body: JSON.stringify({
        status: "confirmed",
        rowVersion: privacyRequest.rowVersion,
        reason: "Endgültige Bestätigung durch dieselbe Person versuchen"
      })
    });
    assert.equal(selfConfirmForbidden.status, 403);
    assert.equal((await selfConfirmForbidden.json()).error.code, "four_eyes_required");

    const privacyAdminTemporaryPassword = "Plattform-Datenschutz-2026!";
    const privacyAdminEmail = `datenschutz-${suffix.toLowerCase()}@example.test`;
    const createPrivacyAdminResponse = await fetch(`${baseUrl}/api/v1/platform/administrators`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: platformCookie },
      body: JSON.stringify({
        firstName: "Petra",
        lastName: "Datenschutz",
        email: privacyAdminEmail,
        roleKeys: ["privacy"],
        temporaryPassword: privacyAdminTemporaryPassword,
        reason: "Zweite berechtigte Person für die Datenschutzbestätigung anlegen"
      })
    });
    assert.equal(createPrivacyAdminResponse.status, 201, await createPrivacyAdminResponse.clone().text());

    const privacyAdminLoginResponse = await fetch(`${baseUrl}/api/v1/platform/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: privacyAdminEmail, password: privacyAdminTemporaryPassword })
    });
    assert.equal(privacyAdminLoginResponse.status, 201, await privacyAdminLoginResponse.clone().text());
    const privacyAdminCookie = privacyAdminLoginResponse.headers.get("set-cookie").split(";", 1)[0];

    const confirmPrivacyResponse = await fetch(`${baseUrl}/api/v1/platform/privacy/${privacyRequest.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: privacyAdminCookie },
      body: JSON.stringify({
        status: "confirmed",
        rowVersion: privacyRequest.rowVersion,
        reason: "Endgültige Bestätigung durch die zweite berechtigte Person"
      })
    });
    assert.equal(confirmPrivacyResponse.status, 200, await confirmPrivacyResponse.clone().text());
    privacyRequest = (await confirmPrivacyResponse.json()).request;
    assert.equal(privacyRequest.status, "confirmed");

    const processingResponse = await fetch(`${baseUrl}/api/v1/platform/privacy/${privacyRequest.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: platformCookie },
      body: JSON.stringify({
        status: "processing",
        rowVersion: privacyRequest.rowVersion,
        reason: "Datenschutzanfrage im Integrationstest in Bearbeitung setzen"
      })
    });
    assert.equal(processingResponse.status, 200, await processingResponse.clone().text());
    privacyRequest = (await processingResponse.json()).request;

    const completedResponse = await fetch(`${baseUrl}/api/v1/platform/privacy/${privacyRequest.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: platformCookie },
      body: JSON.stringify({
        status: "completed",
        deletionLog: { export: "bereitgestellt" },
        rowVersion: privacyRequest.rowVersion,
        reason: "Datenschutzanfrage im Integrationstest abschließen"
      })
    });
    assert.equal(completedResponse.status, 200, await completedResponse.clone().text());
    assert.ok((await completedResponse.json()).request.completedAt);

    const privacyListResponse = await fetch(`${baseUrl}/api/v1/platform/privacy`, {
      headers: { Cookie: platformCookie }
    });
    assert.equal(privacyListResponse.status, 200);
    assert.ok((await privacyListResponse.json()).requests.some((entry) => entry.id === privacyRequest.id));

    // Systemeinstellungen und der abschließende Blick ins Audit-Protokoll.
    const settingsListResponse = await fetch(`${baseUrl}/api/v1/platform/settings`, {
      headers: { Cookie: platformCookie }
    });
    assert.equal(settingsListResponse.status, 200);
    assert.ok(
      (await settingsListResponse.json()).settings.some((entry) => entry.settingKey === "maintenance.enabled")
    );

    const finalAuditResponse = await fetch(`${baseUrl}/api/v1/platform/audit`, {
      headers: { Cookie: platformCookie }
    });
    assert.equal(finalAuditResponse.status, 200);
    const finalAudit = (await finalAuditResponse.json()).audit;
    assert.ok(finalAudit.some((entry) => entry.action === "company.create"));
    assert.ok(finalAudit.some((entry) => entry.action === "privacy.completed"));
  });

  await t.test("Abmeldung und Sitzungsende", async () => {

    const logout = await fetch(`${baseUrl}/api/v1/session`, { method: "DELETE", headers: { Cookie: cookie } });
    assert.equal(logout.status, 200);
    const rejected = await fetch(`${baseUrl}/api/v1/session`, { headers: { Cookie: cookie } });
    assert.equal(rejected.status, 401);
  });
});
