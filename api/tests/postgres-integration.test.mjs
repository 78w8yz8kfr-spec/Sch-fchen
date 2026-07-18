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

  const directorOverview = await fetch(
    `${baseUrl}/api/v1/admin/overview?date=${assignmentDate}`,
    { headers: { Cookie: directorCookie } }
  );
  assert.equal(directorOverview.status, 200);
  assert.equal((await directorOverview.json()).overview.canCreateManagementRoles, true);

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
      role: "installer",
      temporaryPassword: employeeTemporaryPassword
    })
  });
  assert.equal(employeeResponse.status, 201);
  const employee = (await employeeResponse.json()).employee;
  assert.equal(employee.mustChangePassword, true);
  assert.deepEqual(employee.roles, ["installer"]);

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
      comment: "API-Test"
    })
  });
  assert.equal(assignmentResponse.status, 201, await assignmentResponse.clone().text());
  const assignment = (await assignmentResponse.json()).assignment;

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

  const employeeAssignments = await fetch(
    `${baseUrl}/api/v1/site-assignments/${assignmentDate}`,
    { headers: { Cookie: employeeCookie } }
  );
  assert.equal(employeeAssignments.status, 200);
  assert.equal((await employeeAssignments.json()).assignments[0].constructionSite.id, site.id);

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
  assert.equal((await movedAssignment.json()).assignment.workDate, movedDate);

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

  const clockInAt = new Date(Date.now() - 2000).toISOString();
  const clockOutAt = new Date(Date.now() - 1000).toISOString();
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

  const workDate = localDate(clockInAt, config.timeZone);
  const workDay = await fetch(`${baseUrl}/api/v1/work-days/${workDate}`, { headers: { Cookie: cookie } });
  assert.equal(workDay.status, 200);
  assert.equal((await workDay.json()).workDay.entries.length, 2);

  const logout = await fetch(`${baseUrl}/api/v1/session`, { method: "DELETE", headers: { Cookie: cookie } });
  assert.equal(logout.status, 200);
  const rejected = await fetch(`${baseUrl}/api/v1/session`, { headers: { Cookie: cookie } });
  assert.equal(rejected.status, 401);
});
