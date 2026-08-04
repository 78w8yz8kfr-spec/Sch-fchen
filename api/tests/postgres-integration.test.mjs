import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createApp } from "../src/app.mjs";
import { createPool } from "../src/database.mjs";
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

  const config = {
    port: 0,
    allowedOrigin: "http://localhost:4173",
    timeZone: "Europe/Berlin",
    sessionTtlSeconds: 3600,
    cookieSecure: false,
    initialCompanyNumber: "F-000001",
    initialSetupToken: "CI-SETUP-TOKEN-2026-ONLY-TEST",
    platformSetupToken: "CI-PLATFORM-SETUP-2026-ONLY-TEST",
    staticDirectory: frontendDirectory,
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
  const server = createServer(createApp({ pool: apiPool, config, logger: { error() {} } }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await apiPool.end();
  });

  // Bindungen, die spätere Abschnitte weiterverwenden. Die Abschnitte
  // bauen bewusst aufeinander auf: ein Stundenzettel braucht den Einsatz,
  // der Einsatz die Baustelle und die Baustelle den Mitarbeiter.
  let setup, cookie, session, platformCookie;
  let tenantCompany, assignmentDate, employeePersonnelNumber, employeeTemporaryPassword;
  let employeePassword, foremanPersonnelNumber, foremanTemporaryPassword, foremanPassword;
  let plannerCookie, directorCookie, activatedVde, projectManager;
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
      body: JSON.stringify({ companyNumber: "F-000001", personnelNumber, password })
    });
    assert.equal(login.status, 201);
    cookie = login.headers.get("set-cookie").split(";", 1)[0];
    const loginBody = await login.json();
    assert.equal(loginBody.session.company.number, "F-000001");
    assert.equal(loginBody.session.company.logoUrl, "./assets/company-logos/schaaf-elektro.webp");
    assert.deepEqual(loginBody.session.user.roles, ["admin"]);

    session = await fetch(`${baseUrl}/api/v1/session`, { headers: { Cookie: cookie } });
    assert.equal(session.status, 200);
  });

  await t.test("Getrennte Plattformverwaltung", async () => {
    const platformShell = await fetch(`${baseUrl}/platform-admin.html`);
    assert.equal(platformShell.status, 200);
    assert.match(await platformShell.text(), /id="platform-navigation"/);
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
      `${baseUrl}/api/v1/platform/companies?search=F-000001`,
      { headers: { Cookie: platformCookie } }
    );
    assert.equal(platformCompaniesResponse.status, 200);
    tenantCompany = (await platformCompaniesResponse.json()).companies.items
      .find((company) => company.companyNumber === "F-000001");
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
    assert.equal(productionVersion.version, "0.42.0");
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
      headers: { Cookie: cookie, "X-Schaefchen-Version": "0.42.0" }
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
      headers: { Cookie: cookie, "X-Schaefchen-Version": "0.42.0" }
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
    assert.equal(initialOverview.status, 200);
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
        companyNumber: "F-000001",
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

    const directorLogin = await fetch(`${baseUrl}/api/v1/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: config.allowedOrigin },
      body: JSON.stringify({
        companyNumber: "F-000001",
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

    const initialModulesResponse = await fetch(`${baseUrl}/api/v1/admin/modules`, {
      headers: { Cookie: cookie }
    });
    assert.equal(initialModulesResponse.status, 200);
    const initialModules = (await initialModulesResponse.json()).modules;
    assert.deepEqual(initialModules.map((module) => module.key), ["vde", "dguv"]);
    assert.ok(initialModules.every((module) => !module.enabled));
    assert.equal(initialModules.find((module) => module.key === "vde").available, true);
    assert.equal(initialModules.find((module) => module.key === "dguv").available, false);

    const forbiddenDguvActivationResponse = await fetch(
      `${baseUrl}/api/v1/admin/modules/dguv`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ enabled: true, rowVersion: 0 })
      }
    );
    assert.equal(forbiddenDguvActivationResponse.status, 403);
    assert.equal(
      (await forbiddenDguvActivationResponse.json()).error.code,
      "platform_module_administration_required"
    );

    const forbiddenModuleAdministration = await fetch(`${baseUrl}/api/v1/admin/modules`, {
      headers: { Cookie: plannerCookie }
    });
    assert.equal(forbiddenModuleAdministration.status, 403);
    assert.equal(
      (await forbiddenModuleAdministration.json()).error.code,
      "module_administration_forbidden"
    );

    const vdeActivationResponse = await fetch(`${baseUrl}/api/v1/admin/modules/vde`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: directorCookie },
      body: JSON.stringify({ enabled: true, rowVersion: 0 })
    });
    assert.equal(vdeActivationResponse.status, 403, await vdeActivationResponse.clone().text());
    assert.equal(
      (await vdeActivationResponse.json()).error.code,
      "platform_module_administration_required"
    );

    const staleVdeActivationResponse = await fetch(`${baseUrl}/api/v1/admin/modules/vde`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ enabled: false, rowVersion: 0 })
    });
    assert.equal(staleVdeActivationResponse.status, 403);
    assert.equal(
      (await staleVdeActivationResponse.json()).error.code,
      "platform_module_administration_required"
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

    const activatedModulesResponse = await fetch(`${baseUrl}/api/v1/admin/modules`, {
      headers: { Cookie: cookie }
    });
    assert.equal(activatedModulesResponse.status, 200);
    assert.equal(
      (await activatedModulesResponse.json()).modules.find((module) => module.key === "vde").enabled,
      true
    );

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
        companyNumber: "F-000001",
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

    const foremanLogin = await fetch(`${baseUrl}/api/v1/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: config.allowedOrigin },
      body: JSON.stringify({
        companyNumber: "F-000001",
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
    assert.ok(structureOverview.modules.some(
      (module) => module.key === "vde" && module.enabled
    ));
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
        companyNumber: "F-000001",
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
        companyNumber: "F-000001",
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
    const unassignedAddition = await fetch(`${baseUrl}/api/v1/time-entry-additions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: timeCookie },
      body: JSON.stringify({
        workDate: editableWorkDate,
        entryType: "site_arrival",
        recordedAt: officeEditedAt,
        constructionSiteId: structuredSite.id,
        reason: "Ankunft auf einer nicht zugeordneten Baustelle nachtragen"
      })
    });
    assert.equal(unassignedAddition.status, 403);
    assert.equal((await unassignedAddition.json()).error.code, "site_not_assigned");

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

  await t.test("Abmeldung und Sitzungsende", async () => {

    const logout = await fetch(`${baseUrl}/api/v1/session`, { method: "DELETE", headers: { Cookie: cookie } });
    assert.equal(logout.status, 200);
    const rejected = await fetch(`${baseUrl}/api/v1/session`, { headers: { Cookie: cookie } });
    assert.equal(rejected.status, 401);
  });
});
