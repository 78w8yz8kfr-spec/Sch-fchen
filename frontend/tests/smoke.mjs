import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const frontendDirectory = resolve(testDirectory, "..");
const repositoryDirectory = resolve(frontendDirectory, "..");

const readFrontendFile = (path) => readFile(resolve(frontendDirectory, path), "utf8");

const [html, styles, app, worker, refreshHtml, refreshScript, manifestSource, mark, uiSpecification, siteTemplate] = await Promise.all([
  readFrontendFile("index.html"),
  readFrontendFile("styles.css"),
  readFrontendFile("app.js"),
  readFrontendFile("sw.js"),
  readFrontendFile("refresh.html"),
  readFrontendFile("refresh.js"),
  readFrontendFile("manifest.webmanifest"),
  readFrontendFile("assets/mark.svg"),
  readFile(resolve(repositoryDirectory, "docs/PHASE1_UI_SPEC.md"), "utf8"),
  readFile(resolve(frontendDirectory, "assets/baustellen-import-vorlage.xlsx"))
]);

const manifest = JSON.parse(manifestSource);

assert.match(html, /lang="de"/);
assert.match(html, /id="login-view"/);
assert.match(html, /id="dashboard-view"/);
assert.match(html, /id="open-preview"/);
assert.match(html, /id="timesheet-section"/);
assert.match(html, /id="secondary-action"/);
assert.match(html, /id="reset-demo"/);
assert.match(html, /id="setup-form"/);
assert.match(html, /id="password-change-form"/);
assert.match(html, /id="admin-section"/);
assert.match(html, /id="assignment-planning-shell"/);
assert.match(html, /id="assignment-planning-content"/);
assert.match(html, /id="site-planning-shell"/);
assert.match(html, /id="site-planning-content"/);
assert.match(html, /id="nav-assignments"/);
assert.match(html, /id="nav-sites"/);
assert.match(html, /id="employee-form"/);
assert.match(html, /id="customer-form"/);
assert.match(html, /id="project-form"/);
assert.match(html, /id="site-form"/);
assert.match(html, /id="business-hierarchy"/);
assert.match(html, /id="assignment-form"/);
assert.match(html, /id="admin-week-board"/);
assert.match(html, /id="assignment-edit-form"/);
assert.match(html, /id="assignment-import-panel"/);
assert.match(html, /id="assignment-import-file"/);
assert.match(html, /id="assignment-import-preview"/);
assert.match(html, /id="assignment-import-confirm"/);
assert.match(html, /id="assignment-import-mappings"/);
assert.match(html, /id="assignment-import-apply-mappings"/);
assert.match(html, /id="site-import-panel"/);
assert.match(html, /id="site-import-file"/);
assert.match(html, /id="site-import-preview"/);
assert.match(html, /baustellen-import-vorlage\.xlsx/);
assert.match(html, /value="managing_director">Geschäftsführer/);
assert.match(html, /value="dispatch_office">Büro \/ Disposition/);
assert.match(html, /value="project_manager">Projektleiter/);
assert.doesNotMatch(html, /value="planner">Planer/);
assert.doesNotMatch(html, /value="executive_assistant">Assistenz der Geschäftsführung/);
assert.doesNotMatch(html, /value="office"/);
assert.match(html, /id="company-number"/);
assert.match(html, /id="company-number-field" hidden/);
assert.doesNotMatch(html, /class="live-overview"/);
assert.match(html, /id="status-since"/);
assert.match(html, /id="status-work-time"/);
assert.match(html, /id="foreman-badge"/);
assert.match(html, /styles\.css\?v=0\.13\.0/);
assert.match(html, /app\.js\?v=0\.13\.0/);
assert.match(html, /id="site-dashboard"/);
assert.match(html, /aria-live="polite"/);
assert.match(html, /Öffentliche Demo/);
assert.match(html, /keine GPS-Daten/i);
assert.doesNotMatch(html, /https?:\/\//, "Die PWA darf keine externen Laufzeitressourcen laden");

assert.match(styles, /env\(safe-area-inset-bottom\)/);
assert.match(styles, /:focus-visible/);
assert.match(styles, /min-width: 320px/);
assert.match(styles, /\.time-summary/);
assert.match(styles, /\.status-timer/);
assert.doesNotMatch(styles, /\.live-overview/);
assert.match(styles, /\.entry-list/);
assert.match(styles, /\.file-drop/);
assert.match(styles, /\.import-preview/);
assert.match(styles, /\.import-mappings/);
assert.match(styles, /\.planning-group/);
assert.match(styles, /\.bottom-nav--planner/);
assert.match(styles, /\.download-link/);
assert.match(styles, /--brand: #e30613/);
assert.match(styles, /--ink: #111111/);
assert.doesNotMatch(styles, /#173c34|#b9e65a|#7da82a/i, "Alte grüne Markenfarben dürfen nicht verbleiben");

assert.match(app, /navigator\.serviceWorker\.register/);
assert.match(app, /window\.localStorage\.setItem/);
assert.match(app, /window\.crypto\?\.randomUUID/);
assert.match(app, /clientEntryId/);
assert.match(app, /pendingSync: !demoMode/);
assert.match(app, /\.\/api\/v1\/session/);
assert.match(app, /\.\/api\/v1\/setup/);
assert.match(app, /\.\/api\/v1\/account\/initial-password/);
assert.match(app, /\.\/api\/v1\/admin\/employees/);
assert.match(app, /\.\/api\/v1\/admin\/customers/);
assert.match(app, /\.\/api\/v1\/admin\/projects/);
assert.match(app, /\.\/api\/v1\/admin\/construction-sites/);
assert.match(app, /assignmentPlanningContent\.append/);
assert.match(app, /sitePlanningContent\.append/);
assert.match(app, /showDashboardPane\("assignments"\)/);
assert.match(app, /showDashboardPane\("sites"\)/);
assert.match(app, /\.\/api\/v1\/admin\/assignments/);
assert.match(app, /\.\/api\/v1\/admin\/assignment-imports\/preview/);
assert.match(app, /assignmentImportFile\.arrayBuffer/);
assert.match(app, /assignmentImportApplyMappings/);
assert.match(app, /\.\/api\/v1\/admin\/site-imports\/preview/);
assert.match(app, /siteImportFile\.arrayBuffer/);
assert.match(app, /window\.confirm/);
assert.match(app, /method: "PATCH"/);
assert.match(app, /\/cancel`/);
assert.match(app, /renderAdminWeek/);
assert.match(app, /canCreateManagementRoles/);
assert.match(app, /user\.roles/);
assert.match(app, /window\.location\.hostname\.endsWith\("github\.io"\)/);
assert.match(app, /window\.localStorage\.removeItem\(ONLINE_STORAGE_KEY\)/);
assert.match(app, /gross >= 360 \? 60 : gross >= 210 \? 30/);
assert.doesNotMatch(app, /geolocation/i, "Die Demo darf keine GPS- oder Standortabfrage enthalten");

assert.equal(manifest.name, "Schäfchen");
assert.equal(manifest.display, "standalone");
assert.equal(manifest.start_url, "./");
assert.equal(manifest.theme_color, "#e30613");
assert.ok(manifest.icons.length > 0);

assert.match(mark, /fill="#111111"/);
assert.match(mark, /fill="#e30613"/);
assert.doesNotMatch(mark, /#173c34|#b9e65a/i);
assert.equal(siteTemplate[0], 0x50);
assert.equal(siteTemplate[1], 0x4b);

for (const asset of ["./index.html", "./manifest.webmanifest", "./assets/mark.svg"]) {
  assert.ok(worker.includes(`"${asset}"`), `${asset} fehlt im App-Shell-Cache`);
}
assert.ok(worker.includes('"./styles.css?v=0.13.0"'));
assert.ok(worker.includes('"./app.js?v=0.13.0"'));
assert.ok(worker.includes('"./assets/baustellen-import-vorlage.xlsx"'));
assert.match(worker, /requestUrl\.pathname\.startsWith\("\/api\/"\)/);
assert.match(worker, /event\.request\.mode === "navigate"/);
assert.match(worker, /cache: "no-store"/);
assert.match(refreshHtml, /Schäfchen wird erneuert/);
assert.match(refreshScript, /serviceWorker\.getRegistrations/);
assert.match(refreshScript, /key\.startsWith\("schaefchen-"\)/);
assert.doesNotMatch(refreshScript, /localStorage|indexedDB/,
  "Die Cache-Aktualisierung darf lokale Offline-Fachdaten nicht löschen");

assert.match(uiSpecification, /keine echte\s+Serveranmeldung/i);
assert.match(uiSpecification, /keine GPS-Abfrage/i);

console.log("PWA-Smoke-Test erfolgreich.");
