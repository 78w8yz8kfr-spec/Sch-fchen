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

  const appShell = await fetch(`${baseUrl}/`);
  assert.equal(appShell.status, 200);
  assert.match(appShell.headers.get("content-security-policy"), /default-src 'self'/);
  assert.match(await appShell.text(), /id="setup-form"/);

  const appScript = await fetch(`${baseUrl}/app.js`);
  assert.equal(appScript.status, 200);
  assert.match(appScript.headers.get("content-type"), /text\/javascript/);

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

  const setup = await fetch(`${baseUrl}/api/v1/setup`, {
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
  const cookie = login.headers.get("set-cookie").split(";", 1)[0];
  const loginBody = await login.json();
  assert.equal(loginBody.session.company.number, "F-000001");
  assert.equal(loginBody.session.company.logoUrl, "./assets/company-logos/schaaf-elektro.webp");
  assert.deepEqual(loginBody.session.user.roles, ["admin"]);

  const session = await fetch(`${baseUrl}/api/v1/session`, { headers: { Cookie: cookie } });
  assert.equal(session.status, 200);

  const assignmentDate = localDate(new Date().toISOString(), config.timeZone);
  const employeePersonnelNumber = `MON-${suffix}`;
  const employeeTemporaryPassword = "Montage-Start-2026!";
  const employeePassword = "Montage-Eigen-2026!";
  const foremanPersonnelNumber = `VA-${suffix}`;
  const foremanTemporaryPassword = "Vorarbeiter-Start-2026!";
  const foremanPassword = "Vorarbeiter-Eigen-2026!";
  const plannerPersonnelNumber = `PLAN-${suffix}`;
  const plannerTemporaryPassword = "Planung-Start-2026!";
  const plannerPassword = "Planung-Eigen-2026!";
  const directorPersonnelNumber = `GF-${suffix}`;
  const directorTemporaryPassword = "Leitung-Start-2026!";
  const directorPassword = "Leitung-Eigen-2026!";

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
  const plannerCookie = plannerLogin.headers.get("set-cookie").split(";", 1)[0];
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
  const directorCookie = directorLogin.headers.get("set-cookie").split(";", 1)[0];
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
  assert.ok(initialModules.every((module) => !module.enabled && module.rowVersion === 0));

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
  assert.equal(vdeActivationResponse.status, 200, await vdeActivationResponse.clone().text());
  const activatedVde = (await vdeActivationResponse.json()).module;
  assert.equal(activatedVde.key, "vde");
  assert.equal(activatedVde.enabled, true);
  assert.equal(activatedVde.rowVersion, 1);
  assert.equal(activatedVde.changedByName, "Gesa Geschäftsführung");

  const staleVdeActivationResponse = await fetch(`${baseUrl}/api/v1/admin/modules/vde`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ enabled: false, rowVersion: 0 })
  });
  assert.equal(staleVdeActivationResponse.status, 409);
  assert.equal((await staleVdeActivationResponse.json()).error.code, "row_version_conflict");

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
      personnelNumber: `PL-${suffix}`,
      firstName: "Petra",
      lastName: "Projektleitung",
      role: "project_manager",
      temporaryPassword: "Projektleitung-2026!"
    })
  });
  assert.equal(directorCreatesProjectManager.status, 201, await directorCreatesProjectManager.clone().text());

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
  const employee = (await employeeResponse.json()).employee;
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
  const foreman = (await foremanResponse.json()).employee;
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
  const updatedEditableEmployee = (await employeeUpdateResponse.json()).employee;
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
  const customer = (await customerResponse.json()).customer;
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
  const updatedCustomer = (await customerUpdateResponse.json()).customer;
  assert.equal(updatedCustomer.email, "verwaltung@example.invalid");
  assert.equal(updatedCustomer.rowVersion, 2);

  const projectResponse = await fetch(`${baseUrl}/api/v1/admin/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: plannerCookie },
    body: JSON.stringify({
      customerId: customer.id,
      name: `Struktur Projekt ${suffix}`,
      installerShortText: "Elektroinstallation"
    })
  });
  assert.equal(projectResponse.status, 201, await projectResponse.clone().text());
  const project = (await projectResponse.json()).project;
  assert.equal(project.customerId, customer.id);
  assert.match(project.number, /^SE-\d{4}-\d{4}$/);
  assert.equal(project.rowVersion, 1);

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
  const updatedProject = (await projectUpdateResponse.json()).project;
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
  const structuredSite = (await structuredSiteResponse.json()).site;
  assert.equal(structuredSite.projectId, project.id);
  assert.equal(structuredSite.customerId, customer.id);
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
  const foremanCookie = foremanLogin.headers.get("set-cookie").split(";", 1)[0];
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

  const clientReportId = randomUUID();
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
  const mobileReport = (await mobileReportResponse.json()).siteReport;
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
  const siteTask = (await siteTaskResponse.json()).siteTask;
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
  const completedSiteTask = (await completedSiteTaskResponse.json()).siteTask;
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
  const siteMaterial = (await siteMaterialResponse.json()).siteMaterial;
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
  const adminNote = (await adminNoteResponse.json()).siteNote;
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
  const mobileNote = (await mobileNoteResponse.json()).siteNote;
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

  const documentContent = Buffer.from(`%PDF-1.4\nSchäfchen Dokument ${suffix}`, "utf8");
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
  const uploadedDocument = uploadedDocumentBody.document;
  assert.equal(uploadedDocumentBody.reused, false);
  assert.match(uploadedDocument.number, /^SE-D-\d{4}-\d{5}$/);
  assert.equal(uploadedDocument.links.length, 3);
  assert.ok(uploadedDocument.links.some((link) => link.customerId === customer.id));
  assert.ok(uploadedDocument.links.some((link) => link.projectId === project.id));
  assert.ok(uploadedDocument.links.some((link) => link.constructionSiteId === structuredSite.id));

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
      sourceDocumentId: reportPhoto.id
    })
  });
  assert.equal(siteReportResponse.status, 201, await siteReportResponse.clone().text());
  const siteReport = (await siteReportResponse.json()).siteReport;
  assert.match(siteReport.number, /^SE-R-\d{4}-\d{5}$/);
  assert.equal(siteReport.sourceDocumentId, reportPhoto.id);
  assert.equal(siteReport.status, "submitted");

  const signatureData = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
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
  assert.ok(foremanSiteDashboard.documents.some((item) => item.id === uploadedDocument.id));

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
  const sitePhoto = (await sitePhotoUploadResponse.json()).document;
  assert.equal(sitePhoto.category, "photo");
  assert.ok(sitePhoto.links.some((link) => link.constructionSiteId === structuredSite.id));

  const sitePhotoDownloadResponse = await fetch(
    `${baseUrl}/api/v1/construction-sites/${structuredSite.id}/documents/${sitePhoto.id}/content?date=${assignmentDate}`,
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
      body: JSON.stringify({ status: "archived", rowVersion: uploadedDocument.rowVersion })
    }
  );
  assert.equal(archiveDocumentResponse.status, 200, await archiveDocumentResponse.clone().text());
  const archivedDocument = (await archiveDocumentResponse.json()).document;
  assert.equal(archivedDocument.status, "archived");
  assert.equal(archivedDocument.rowVersion, uploadedDocument.rowVersion + 1);

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
  const site = (await siteResponse.json()).site;
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
  const assignment = (await assignmentResponse.json()).assignment;
  assert.equal(assignment.plannedDurationMinutes, 450);
  assert.equal(assignment.comment, "API-Test Arbeitsanweisung");
  assert.equal(assignment.reportResponsible, true);
  assert.equal(assignment.reportResponsibilitySource, "automatic");

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
  const installerTask = (await installerTaskResponse.json()).siteTask;
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
  const employeeCookie = employeeLogin.headers.get("set-cookie").split(";", 1)[0];
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
        changeReason: "Vorarbeiter für das Zweierteam festgelegt"
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

  const movedDate = nextBusinessDate(assignmentDate);
  const movedAssignment = await fetch(`${baseUrl}/api/v1/admin/assignments/${assignment.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: plannerCookie },
    body: JSON.stringify({
      workDate: movedDate,
      plannedStartTime: "08:00",
      changeReason: "Integrationstest verschiebt den Termin"
    })
  });
  assert.equal(movedAssignment.status, 200, await movedAssignment.clone().text());
  const movedAssignmentBody = (await movedAssignment.json()).assignment;
  assert.equal(movedAssignmentBody.workDate, movedDate);
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

  const assignments = await fetch(`${baseUrl}/api/v1/site-assignments/${assignmentDate}`, {
    headers: { Cookie: cookie }
  });
  assert.equal(assignments.status, 200);
  assert.deepEqual((await assignments.json()).assignments, []);

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

  const clockInAt = new Date(Date.now() - 5000).toISOString();
  const clockOutAt = new Date(Date.now() - 4000).toISOString();
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
  assert.equal(first.status, 201, await first.text());

  const duplicate = await fetch(`${baseUrl}/api/v1/time-entries`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(clockIn)
  });
  assert.equal(duplicate.status, 200);
  assert.equal((await duplicate.json()).timeEntry.idempotent, true);

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
  assert.equal(clockOut.status, 201, await clockOut.text());

  const secondClockInAt = new Date(Date.now() - 2000).toISOString();
  const secondClockOutAt = new Date(Date.now() - 1000).toISOString();
  const workDate = localDate(clockInAt, config.timeZone);
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
  assert.equal(pendingAdditionWorkDay.entries.length, 2);
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

  const workDay = await fetch(`${baseUrl}/api/v1/work-days/${workDate}`, { headers: { Cookie: cookie } });
  assert.equal(workDay.status, 200);
  assert.equal((await workDay.json()).workDay.entries.length, 4);

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
  assert.ok(workWeek.days.some((day) => day.workDate === workDate && day.workDay.entries.length === 4));
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
  assert.equal(correctedWorkDay.entries.length, 4);
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

  const logout = await fetch(`${baseUrl}/api/v1/session`, { method: "DELETE", headers: { Cookie: cookie } });
  assert.equal(logout.status, 200);
  const rejected = await fetch(`${baseUrl}/api/v1/session`, { headers: { Cookie: cookie } });
  assert.equal(rejected.status, 401);
});
