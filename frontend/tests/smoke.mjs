import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const frontendDirectory = resolve(testDirectory, "..");
const repositoryDirectory = resolve(frontendDirectory, "..");

const readFrontendFile = (path) => readFile(resolve(frontendDirectory, path), "utf8");

const [html, styles, app, worker, refreshHtml, refreshScript, manifestSource, mark, companyLogo, uiSpecification, siteTemplate, vdeHtml, vdeStyles, vdeApp, platformHtml, platformStyles, platformApp, workTimeCore] = await Promise.all([
  readFrontendFile("index.html"),
  readFrontendFile("styles.css"),
  readFrontendFile("app.js"),
  readFrontendFile("sw.js"),
  readFrontendFile("refresh.html"),
  readFrontendFile("refresh.js"),
  readFrontendFile("manifest.webmanifest"),
  readFrontendFile("assets/mark.svg"),
  readFile(resolve(frontendDirectory, "assets/company-logos/schaaf-elektro.webp")),
  readFile(resolve(repositoryDirectory, "docs/PHASE1_UI_SPEC.md"), "utf8"),
  readFile(resolve(frontendDirectory, "assets/baustellen-import-vorlage.xlsx")),
  readFrontendFile("vde/index.html"),
  readFrontendFile("vde/styles.css"),
  readFrontendFile("vde/app.js"),
  readFrontendFile("platform-admin.html"),
  readFrontendFile("platform-admin.css"),
  readFrontendFile("platform-admin.js"),
  readFrontendFile("core/work-time.js")
]);

const manifest = JSON.parse(manifestSource);

assert.match(html, /lang="de"/);
assert.match(html, /id="login-view"/);
assert.match(html, /id="dashboard-view"/);
assert.match(html, /id="open-preview"/);
assert.match(html, /id="timesheet-section"/);
assert.match(html, /id="week-timesheet-list"/);
assert.match(html, /id="week-total-work"/);
assert.match(html, /id="week-total-overtime"/);
assert.match(html, /id="week-previous"/);
assert.match(html, /id="week-current"/);
assert.match(html, /id="week-next"/);
// Der Wochenwechsel nutzt dieselbe Schaltflaeche wie die Plantafel. Vorher war
// er als kleiner Textknopf ausgefuehrt und mit dem Finger schwer zu treffen.
assert.match(html, /id="week-previous" class="week-button"/);
assert.match(html, /id="week-next" class="week-button"/);
assert.match(html, /id="week-current" class="week-navigation__today"/);
// Die Plantafel heisst auf jedem Geraet gleich. "Desktop-Plantafel" stand auch
// dann ueber der Ansicht, wenn sie auf dem Handy geoeffnet wurde.
assert.doesNotMatch(html, /Desktop-Plantafel/);
assert.match(html, /id="time-account-panel"/);
assert.match(html, /id="time-account-balance"/);
assert.match(html, /id="time-account-months"/);
assert.match(html, /id="time-account-admin-panel"/);
assert.match(html, /id="time-account-admin-list"/);
assert.match(html, /id="time-account-profile-form"/);
assert.match(html, /id="time-account-adjustment-submit"/);
assert.match(html, /id="time-account-holiday-list"/);
// Die Bueroverwaltung liegt vollstaendig im Verwaltungsbereich und nicht mehr
// hinter einem Aufklapper in der Wochenansicht.
assert.match(html, /id="admin-year"/);
assert.doesNotMatch(html, /week-advanced-panel--admin/);
const weekSection = html.slice(
  html.indexOf('id="week-section"'),
  html.indexOf('id="admin-section"')
);
for (const buried of ["time-account-admin-panel", "holiday-calendar-admin", "time-correction-policy-admin"]) {
  assert.ok(
    !weekSection.includes(`id="${buried}"`),
    `${buried} gehoert in die Verwaltung, nicht in die Wochenansicht`
  );
}
// Die drei Verwaltungsbereiche stehen gleichrangig nebeneinander. Frueher steckte
// der Feiertagskalender in der Karte der Jahreskonten und war dort schwer zu finden.
const kontenPanel = html.slice(
  html.indexOf('id="time-account-admin-panel"'),
  html.indexOf('id="holiday-calendar-admin"')
);
assert.ok(
  kontenPanel.includes("</section>"),
  "Der Feiertagskalender steht neben den Jahreskonten und nicht in ihnen"
);
// Das frueher genutzte Jahres-Element gibt es nicht mehr. Solange app.js noch
// darauf schreibt, bricht die Darstellung der Verwaltung ab.
assert.doesNotMatch(html, /id="time-account-admin-year"/);
assert.doesNotMatch(app, /timeAccountAdminYear/);
// Als eigener Bereich braucht der Feiertagskalender eine eigene Sichtbarkeit.
assert.match(app, /elements\.holidayCalendarAdmin\.hidden = !visible/);
assert.match(app, /let adminYear = new Date\(\)\.getFullYear\(\)/);
assert.doesNotMatch(
  app,
  /function renderAdminTimeAccounts\(\)[\s\S]{0,400}selectedWeekStart/,
  "Die Jahreskonten folgen nicht mehr der gewaehlten Woche"
);
assert.match(styles, /\.admin-year-select/);
assert.match(html, /id="time-correction-policy-admin"/);
assert.match(html, /id="time-correction-policy-form"/);
assert.match(html, /id="time-correction-policy-reason"/);
// Die Regel gehört in die Verwaltung, nicht in die Wochenansicht: sie steht
// innerhalb des Verwaltungsbereichs und nicht im Wochenabschnitt.
const adminSection = html.slice(html.indexOf('id="admin-section"'));
assert.ok(
  adminSection.includes('id="time-correction-policy-admin"'),
  "Die Korrekturregel muss im Verwaltungsbereich stehen"
);
assert.equal(
  [...html.matchAll(/name="time-correction-policy"/g)].length,
  3,
  "Genau die drei vorgesehenen Regeln stehen zur Auswahl"
);
for (const value of ["review_required", "same_day", "immediate"]) {
  assert.ok(html.includes(`value="${value}"`), `Die Regel ${value} fehlt in der Auswahl`);
}
assert.match(app, /\.\/api\/v1\/admin\/time-correction-policy/);
assert.match(styles, /\.time-correction-policy-option/);
assert.match(styles, /\.visually-hidden/);
assert.match(html, /id="holiday-calendar-form"/);
assert.match(html, /id="holiday-calendar-state"/);
assert.match(html, /id="holiday-calendar-list"/);
assert.match(html, /id="holiday-closure-form"/);
assert.match(html, /id="holiday-closure-list"/);
assert.match(html, /id="employee-timesheet-export-panel"/);
assert.match(html, /id="employee-timesheet-export-form"/);
assert.match(html, /id="time-correction-dialog"/);
assert.match(html, /id="time-correction-form"/);
assert.match(html, /id="time-correction-review-panel"/);
assert.match(html, /id="time-correction-review-list"/);
assert.match(html, /id="absence-panel"/);
assert.match(html, /id="absence-form"/);
assert.match(html, /id="absence-type"/);
assert.match(html, /id="absence-day-part"/);
assert.match(html, /id="absence-list"/);
assert.match(html, /id="absence-review-panel"/);
assert.match(html, /id="absence-review-list"/);
assert.match(html, /id="work-day-review-panel"/);
assert.match(html, /id="work-day-review-list"/);
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
assert.match(html, /id="employee-edit-form"/);
assert.match(html, /id="employee-edit-role"/);
assert.match(html, /id="employee-phone"/);
assert.match(html, /id="employee-email"/);
assert.match(html, /id="employee-edit-phone"/);
assert.match(html, /id="employee-edit-email"/);
assert.match(html, /id="customer-form"/);
assert.match(html, /id="customer-management-panel"/);
assert.match(html, /id="customer-search"/);
assert.match(html, /id="customer-status-filter"/);
assert.match(html, /id="customer-edit-form"/);
assert.match(html, /id="project-form"/);
assert.match(html, /id="project-management-panel"/);
assert.match(html, /id="project-search"/);
assert.match(html, /id="project-status-filter"/);
assert.match(html, /id="project-edit-form"/);
assert.match(html, /id="site-form"/);
assert.match(html, /id="site-search"/);
assert.match(html, /id="site-status-filter"/);
assert.match(html, /id="site-list-summary"/);
assert.match(html, /id="site-dashboard-edit"/);
assert.match(html, /id="site-dashboard-status"/);
assert.match(html, /id="site-edit-form"/);
assert.match(html, /id="site-edit-status"/);
assert.equal(
  [...html.matchAll(/data-employee-site-section-button=/g)].length,
  8,
  "Die Monteur-Baustellenakte bietet acht getrennte Bereiche"
);
assert.equal(
  [...html.matchAll(/data-site-dashboard-section-button=/g)].length,
  9,
  "Das Büro-Dashboard bietet neun getrennte Baustellenbereiche"
);
assert.match(html, /data-employee-site-section="reports"[^>]*hidden/);
assert.match(html, /data-site-dashboard-section="documents"[^>]*hidden/);
assert.match(app, /function showEmployeeSiteSection/);
assert.match(app, /function showSiteDashboardSection/);
assert.match(app, /showSiteDashboardSection\("reports"\)/);
assert.match(app, /showSiteDashboardSection\("tasks"\)/);
assert.match(styles, /\.workspace-section-nav/);
assert.match(styles, /\.workspace-section-tab--active/);
assert.match(styles, /\.workspace-section-search/);
assert.match(styles, /\.report-center/);
assert.match(styles, /\.site-qr-image/);
assert.match(styles, /\.document-access-options/);
assert.match(styles, /\.site-report-photos/);
assert.match(styles, /\.site-report-photo-list/);
assert.match(html, /id="document-management-panel"/);
assert.match(html, /id="document-form"/);
assert.match(html, /id="document-file-choose"/);
assert.match(html, /id="document-customer"/);
assert.match(html, /id="document-project"/);
assert.match(html, /id="document-site"/);
assert.match(html, /id="document-list"/);
assert.match(html, /id="site-dashboard-documents"/);
assert.match(html, /id="site-dashboard-capture-delivery-note"/);
assert.match(html, /id="site-dashboard-delivery-note-input"[\s\S]*capture="environment"/);
assert.match(html, /id="site-dashboard-delivery-note-form"/);
assert.match(html, /id="site-dashboard-reports-panel"/);
assert.match(html, /id="site-dashboard-photos-panel"/);
assert.match(html, /id="site-dashboard-report-search"/);
assert.match(html, /id="site-dashboard-document-search"/);
assert.match(html, /id="site-dashboard-photo-search"/);
assert.match(html, /id="site-report-photo-list"/);
assert.match(html, /id="report-center"/);
assert.match(html, /id="report-center-draft-count"/);
assert.match(html, /id="report-center-missing-list"/);
assert.match(html, /id="report-return-dialog"/);
assert.match(html, /id="document-mobile-visible"/);
assert.match(html, /id="document-offline-priority"/);
assert.match(html, /id="site-qr-dialog"/);
assert.match(html, /id="site-qr-image"/);
assert.match(html, /Digital erstellen/);
assert.match(html, /Papierbericht fotografieren/);
assert.match(html, /Bericht diktieren/);
assert.match(html, /id="site-task-form"/);
assert.match(html, /id="site-material-form"/);
assert.doesNotMatch(html, /Dieses Modul ist noch nicht aktiviert/);
assert.match(html, /Einmal speichern · überall verwenden/);
assert.match(html, /id="business-hierarchy"/);
assert.match(html, /id="assignment-form"/);
assert.match(html, /id="assignment-duration"/);
assert.match(html, /id="assignment-edit-duration"/);
assert.match(html, /id="assignment-edit-comment"/);
assert.match(html, /id="admin-week-board"/);
assert.match(html, /id="planning-board-view"/);
assert.match(html, /id="planning-board-team"/);
assert.match(html, /id="planning-board-project-manager"/);
assert.match(html, /id="project-manager"/);
assert.match(html, /id="project-edit-manager"/);
assert.match(html, /id="site-project-field" hidden/);
assert.match(html, /id="site-project-manager"/);
assert.match(html, /id="site-edit-project-manager"/);
assert.match(html, /id="assignment-edit-employee"/);
assert.match(html, /id="assignment-team"/);
assert.match(html, /id="assignment-member-list"/);
assert.match(html, /id="planning-team-form"/);
assert.match(html, /id="planning-team-member-list"/);
assert.match(html, /id="assignment-edit-form"/);
assert.match(html, /id="assignment-import-panel"/);
assert.match(html, /id="assignment-import-file"/);
assert.match(html, /id="assignment-import-choose"/);
assert.match(html, /id="assignment-import-selection"/);
assert.match(html, /id="assignment-import-preview"/);
assert.match(html, /id="assignment-import-confirm"/);
assert.match(html, /id="assignment-import-mappings"/);
assert.match(html, /id="assignment-import-apply-mappings"/);
assert.match(html, /id="site-import-panel"/);
assert.match(html, /id="site-import-file"/);
assert.match(html, /id="site-import-choose"/);
assert.match(html, /id="site-import-selection"/);
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
assert.match(html, /assets\/company-logos\/schaaf-elektro\.webp/);
assert.doesNotMatch(html, /class="live-overview"/);
assert.match(html, /id="status-since"/);
assert.match(html, /id="status-work-time"/);
assert.match(html, /id="foreman-badge"/);
assert.doesNotMatch(html, /<details id="assignment-import-panel"/);
assert.doesNotMatch(html, /<details id="site-import-panel"/);
assert.match(html, /<section id="assignment-import-panel" class="inline-import inline-import--assignment">/);
assert.match(html, /<section id="site-import-panel" class="inline-import inline-import--site">/);
assert.match(html, /<button id="assignment-import-choose"/);
assert.match(html, /Wochenplan aus Excel/);
assert.match(html, /<button id="site-import-choose"/);
assert.match(html, /Baustellen aus Excel/);
assert.doesNotMatch(html, /<section id="assignment-import-panel"[^>]*hidden>/);
assert.doesNotMatch(html, /<section id="site-import-panel"[^>]*hidden>/);
assert.doesNotMatch(html, /id="assignment-import-body" class="inline-import__body" hidden/);
assert.doesNotMatch(html, /id="site-import-body" class="inline-import__body" hidden/);
assert.match(html, /styles\.css\?v=0\.42\.0/);
assert.match(html, /app\.js\?v=0\.42\.0/);
assert.match(html, /version\.js\?v=0\.42\.0/);
assert.match(html, /id="electrical-module-admin"/);
assert.match(html, /id="site-dashboard-vde-panel"/);
assert.match(html, /id="employee-site-vde-module"/);
assert.match(html, /id="site-choice-open"/);
assert.match(html, /id="site-choice-dialog"/);
assert.match(html, /id="field-site-form"/);
assert.match(html, /id="field-site-customer"/);
assert.match(html, /id="field-site-customer-name"/);
assert.match(html, /id="field-site-project-name"/);
assert.match(html, /id="field-site-customer-error"[^>]*aria-live="polite"/);
assert.match(html, /id="field-site-name-error"[^>]*aria-live="polite"/);
assert.match(html, /id="field-site-street-error"[^>]*aria-live="polite"/);
assert.match(html, /id="field-site-city-error"[^>]*aria-live="polite"/);
assert.match(html, /id="time-addition-dialog"/);
assert.match(html, /id="timesheet-export-form"/);
assert.match(html, /id="employee-timesheet-export-pdf-submit"/);
assert.match(html, /id="timesheet-export-pdf-submit"/);
assert.match(html, /Stundenzettel exportieren/);
assert.match(html, /<summary>Baustellen<\/summary>/);
assert.match(html, /id="site-customer"/);
assert.match(html, /id="project-panel" class="admin-panel" hidden/);
assert.match(html, /id="mobile-report-card"/);
assert.match(html, /id="mobile-report-form"/);
assert.match(html, /id="mobile-report-personnel-list"/);
assert.match(html, /id="mobile-report-personnel-total"/);
assert.match(html, /id="mobile-report-obstructions"/);
assert.match(html, /id="mobile-report-open-items"/);
assert.match(html, /id="mobile-report-materials"/);
assert.match(html, /id="mobile-report-agreements"/);
assert.match(html, /id="mobile-report-incidents"/);
assert.match(html, /id="assignment-quick-actions"/);
assert.match(html, /id="assignment-instruction"/);
assert.match(html, /id="assignment-navigation"/);
assert.match(html, /id="assignment-details-label"/);
assert.match(html, /id="assignment-report"/);
assert.match(html, /id="hierarchy-search"/);
assert.match(html, /id="site-master-data-tools"/);
assert.match(html, /id="employee-site-workspace"/);
assert.match(html, /id="employee-site-team"/);
assert.match(html, /id="employee-site-tasks"/);
assert.match(html, /id="employee-site-notes"/);
assert.match(html, /id="employee-site-note-form"/);
assert.match(html, /id="employee-site-reports"/);
assert.match(html, /id="employee-site-documents"/);
assert.match(html, /id="employee-site-photos"/);
assert.match(html, /id="employee-site-photo-input"[\s\S]*capture="environment"/);
assert.match(html, /id="employee-site-materials"/);
assert.match(html, /id="site-dashboard-notes"/);
assert.match(html, /id="site-note-form"/);
assert.match(html, /id="assignment-report-responsible"/);
assert.match(html, /id="assignment-edit-report-responsible"/);
assert.match(html, /id="dispatch-summary-date"/);
assert.match(html, /id="dispatch-summary"/);
assert.match(html, /id="dispatch-unassigned-count"/);
assert.match(html, /id="dispatch-absent-count"/);
assert.match(html, /id="dispatch-active-count"/);
assert.match(html, /id="dispatch-review-count"/);
assert.match(html, /id="site-report-finalize-form"/);
assert.match(html, /id="site-report-employee-signature"/);
assert.match(html, /id="site-report-customer-signature"/);
assert.match(html, /id="site-dashboard"/);
assert.match(html, /id="site-dashboard-plan-assignment"/);
assert.match(html, /id="site-dashboard-create-report"/);
assert.match(html, /id="site-dashboard-add-document-shortcut"/);
assert.match(html, /id="site-dashboard-create-task"/);
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
assert.match(styles, /\.entry-list__correction/);
assert.match(styles, /\.week-time-entry__action/);
assert.match(styles, /\.week-timesheet-day/);
assert.match(styles, /\.time-correction-dialog/);
assert.match(styles, /\.time-correction-form/);
assert.match(styles, /\.time-correction-review-actions/);
assert.match(styles, /\.absence-form/);
assert.match(styles, /\.absence-status--approved/);
assert.match(styles, /\.absence-review-actions/);
assert.match(styles, /\.week-absence/);
assert.match(styles, /\.week-day-absence/);
assert.match(styles, /\.timesheet-export-form/);
assert.match(styles, /\.site-choice-dialog/);
assert.match(styles, /\.time-addition-site-field/);
assert.match(styles, /\.work-day-review-status/);
assert.match(styles, /\.work-day-review-action/);
assert.match(styles, /\.import-preview/);
assert.match(styles, /\.import-mappings/);
assert.match(styles, /\.planning-group/);
assert.match(styles, /\.planning-board-row/);
assert.match(styles, /\.planning-month-board/);
assert.match(styles, /\.planning-board-cell--drop-target/);
assert.match(styles, /\.planning-member-picker/);
assert.match(styles, /\.excel-import-bar/);
assert.match(styles, /\.excel-import-choose/);
assert.match(styles, /\.selected-file-row/);
assert.match(styles, /\.site-list-toolbar/);
assert.match(styles, /\.site-status--active/);
assert.match(styles, /\.site-status--completed/);
assert.match(styles, /\.site-status--archived/);
assert.match(styles, /\.site-edit-form/);
assert.match(styles, /\.entity-edit-form/);
assert.match(styles, /\.bottom-nav--planner/);
assert.match(styles, /\.download-link/);
assert.match(styles, /\.document-management-panel/);
assert.match(styles, /\.document-file-choose/);
assert.match(styles, /\.document-compact-list/);
assert.match(styles, /\.site-work-module/);
assert.match(styles, /\.module-action--primary/);
assert.match(styles, /\.site-module-list/);
assert.match(styles, /\.employee-site-workspace/);
assert.match(styles, /\.employee-site-module/);
assert.match(styles, /\.employee-site-photo-grid/);
assert.match(styles, /\.employee-site-task-actions/);
assert.match(styles, /\.mobile-report-personnel/);
assert.match(styles, /\.mobile-report-check/);
assert.match(styles, /\.assignment-quick-actions/);
assert.match(styles, /\.assignment-instruction/);
assert.match(styles, /\.dispatch-summary/);
assert.match(styles, /\.employee-site-item-actions/);
assert.match(styles, /\.site-dashboard-shortcuts/);
assert.match(styles, /\.hierarchy-toolbar/);
assert.match(styles, /\.hierarchy-node-actions/);
assert.match(styles, /\.company-context__mark--logo/);
assert.match(styles, /\.company-brand-line__mark--logo/);
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
assert.match(app, /openEmployeeEditor/);
assert.match(app, /renderDispatchSummary/);
assert.match(workTimeCore, /export function durationHoursToMinutes/);
assert.match(app, /plannedDurationMinutes/);
assert.match(app, /collectMobileReportPersonnel/);
assert.match(app, /saveMobileReportDraft/);
assert.match(app, /updateFieldSiteHierarchy/);
assert.match(app, /\.\/api\/v1\/timesheets\.\$\{format\}/);
assert.match(app, /downloadFile/);
assert.match(app, /selectWeek/);
assert.match(app, /reportResponsibilitySource/);
assert.match(app, /\.\/api\/v1\/admin\/customers/);
assert.match(app, /\.\/api\/v1\/admin\/projects/);
assert.match(app, /\.\/api\/v1\/admin\/construction-sites/);
assert.match(app, /\.\/api\/v1\/admin\/documents/);
assert.match(app, /contentBase64: arrayBufferToBase64/);
assert.match(app, /renderDocumentList/);
assert.match(app, /renderSiteDocuments/);
assert.match(app, /renderSiteTasks/);
assert.match(app, /renderSiteMaterials/);
assert.match(app, /renderSiteReports/);
assert.match(app, /renderReportCenter/);
assert.match(app, /localReportCenterDrafts/);
assert.match(app, /localDraft: true/);
assert.match(app, /openReportReturnDialog/);
assert.match(app, /collectSiteReportPhotos/);
assert.match(app, /saveSiteReportDraft/);
assert.match(app, /readSiteReportDraft/);
assert.match(app, /cacheImportantSiteDocuments/);
assert.match(app, /preferredWorkspaceSection/);
assert.match(app, /maybeOpenDeepLinkedSite/);
assert.match(app, /mobileVisible: elements\.documentMobileVisible\.checked/);
assert.match(app, /offlinePriority: elements\.documentOfflinePriority\.checked/);
assert.match(app, /\/preview`/);
assert.match(app, /\/return`/);
assert.match(app, /\.\/api\/v1\/admin\/site-tasks/);
assert.match(app, /\.\/api\/v1\/admin\/site-materials/);
assert.match(app, /\.\/api\/v1\/admin\/site-notes/);
assert.match(app, /construction-sites\/\$\{encodeURIComponent\(employeeSiteState\.site\.id\)\}\/notes/);
assert.match(app, /\.\/api\/v1\/admin\/site-reports/);
assert.match(app, /\.\/api\/v1\/site-reports/);
assert.match(app, /\.\/api\/v1\/construction-sites\//);
assert.match(app, /openEmployeeSiteWorkspace/);
assert.match(app, /openMobileReportForm\(assignment, \{ leaveAfterSave: false \}\)/);
assert.match(app, /updateEmployeeSiteTask/);
assert.match(app, /construction-sites\/\$\{encodeURIComponent\(employeeSiteState\.site\.id\)\}\/tasks/);
assert.match(app, /openAssignmentPlanningForSite/);
assert.match(app, /openDocumentUploadForSite/);
assert.match(app, /uploadEmployeeSitePhoto/);
assert.match(app, /reportResponsible/);
assert.match(app, /window\.SpeechRecognition \|\| window\.webkitSpeechRecognition/);
assert.match(app, /function setCompanyMark/);
assert.match(app, /session\.company\.logoUrl/);
assert.match(app, /method: "PATCH"/);
assert.match(app, /renderSiteList/);
assert.match(app, /renderCustomerList/);
assert.match(app, /renderProjectList/);
assert.match(app, /siteStatusGroup/);
assert.match(app, /rowVersion: customer\.rowVersion/);
assert.match(app, /rowVersion: project\.rowVersion/);
assert.match(app, /rowVersion: site\.rowVersion/);
assert.match(app, /assignmentPlanningContent\.append/);
assert.match(app, /sitePlanningContent\.append/);
assert.match(app, /after\(elements\.assignmentImportPanel\)/);
assert.match(app, /after\(elements\.siteImportPanel\)/);
assert.match(app, /assignmentImportChoose\.addEventListener/);
assert.match(app, /siteImportChoose\.addEventListener/);
assert.match(app, /siteImportFile\.click\(\)/);
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
assert.match(app, /createPlanningAssignmentCard/);
assert.match(app, /makePlanningDropTarget/);
assert.match(app, /assignmentConflictMessages/);
assert.match(app, /\.\/api\/v1\/admin\/assignment-batches/);
assert.match(app, /\.\/api\/v1\/admin\/planning-teams/);
assert.match(app, /canCreateManagementRoles/);
assert.match(app, /user\.roles/);
assert.match(app, /window\.location\.hostname\.endsWith\("github\.io"\)/);
assert.match(app, /window\.localStorage\.removeItem\(ONLINE_STORAGE_KEY\)/);
assert.match(workTimeCore, /gross >= 360 \? 60 : gross >= 210 \? 30/);
assert.match(app, /Arbeitstag erneut starten/);
assert.match(app, /latest\.type === "clock_out"\) addEntry\("clock_in"\)/);
assert.match(app, /Nächste Baustelle wählen/);
assert.match(app, /newOccurrence/);
assert.match(workTimeCore, /const explicitPause = Math\.max\(gross - recordedWork, 0\)/);
assert.match(app, /liveDuration\.textContent = formatMinutes\(times\.work\)/);
assert.match(app, /\.\/api\/v1\/work-weeks\//);
assert.doesNotMatch(app, /work-days\/\$\{encodeURIComponent\(workDate\)\}\/submit/);
assert.match(app, /\.\/api\/v1\/admin\/work-days\//);
assert.match(app, /\.\/api\/v1\/time-entry-additions/);
assert.match(app, /method: "DELETE"/);
assert.match(app, /\.\/api\/v1\/time-tracking\/site-selection/);
assert.match(app, /\.\/api\/v1\/time-tracking\/sites/);
assert.match(app, /\.\/api\/v1\/admin\/timesheets\.\$\{format\}/);
assert.match(app, /\.\/api\/v1\/admin\/time-entry-corrections\//);
assert.match(app, /Änderung wird geprüft/);
assert.match(app, /Prüfung offen/);
assert.match(app, /entry-list__correction/);
assert.match(app, /Korrigieren/);
assert.match(app, /renderTimeCorrections/);
assert.match(app, /renderAbsences/);
assert.match(app, /renderAbsenceReviews/);
assert.match(app, /\.\/api\/v1\/absences/);
assert.match(app, /\.\/api\/v1\/admin\/absence-requests\//);
assert.match(app, /canApproveAbsenceManagement/);
assert.match(app, /renderWorkDayReviews/);
assert.doesNotMatch(app, /Stundenzettel einreichen/);
assert.match(app, /Automatisch im Büro sichtbar/);
assert.match(app, /Fehlende Buchung ergänzen/);
assert.match(app, /Abgerechnet · im persönlichen Export enthalten/);
assert.doesNotMatch(app, /liveDuration\.textContent = formatMinutes\(times\.gross\)/);
assert.doesNotMatch(app, /geolocation/i, "Die Demo darf keine GPS- oder Standortabfrage enthalten");

assert.equal(manifest.name, "Schäfchen");
assert.equal(manifest.display, "standalone");
assert.equal(manifest.start_url, "./");
assert.equal(manifest.theme_color, "#e30613");
assert.ok(manifest.icons.length > 0);

assert.match(mark, /fill="#111111"/);
assert.match(mark, /fill="#e30613"/);
assert.doesNotMatch(mark, /#173c34|#b9e65a/i);
assert.equal(companyLogo.subarray(0, 4).toString("ascii"), "RIFF");
assert.equal(companyLogo.subarray(8, 12).toString("ascii"), "WEBP");
assert.equal(siteTemplate[0], 0x50);
assert.equal(siteTemplate[1], 0x4b);

for (const asset of [
  "./index.html",
  "./manifest.webmanifest",
  "./assets/mark.svg",
  "./assets/company-logos/schaaf-elektro.webp"
]) {
  assert.ok(worker.includes(`"${asset}"`), `${asset} fehlt im App-Shell-Cache`);
}
assert.ok(worker.includes('"./styles.css?v=0.42.0"'));
assert.ok(worker.includes('"./app.js?v=0.42.0"'));
assert.ok(worker.includes('"./core/work-time.js?v=0.42.0"'));
assert.ok(worker.includes('"./version.js?v=0.42.0"'));

// app.js wird als Modul geladen und holt sich die Zeitberechnung aus dem
// gemeinsamen Kern. Beide Angaben müssen zusammenpassen, sonst fehlt der
// Import im App-Shell-Cache und die PWA bricht offline.
assert.match(html, /<script type="module" src="\.\/app\.js\?v=0\.42\.0"><\/script>/);
assert.match(app, /import \{[\s\S]*?\} from "\.\/core\/work-time\.js\?v=0\.42\.0";/);
assert.match(workTimeCore, /export function calculateTimes\(events, now = new Date\(\)\)/);
// Jedes Kernmodul, das app.js einbindet, muss der Service Worker vorhalten.
// Fehlt eines, laedt die App offline gar nicht mehr, weil der Import ins Leere
// greift. Die Pruefung gilt fuer alle Kernmodule, nicht nur die bekannten.
// Die Rollenlisten stehen nur noch im Kernmodul. Vorher lagen zwei fast
// gleiche Fassungen in app.js, die sich beim Ergaenzen einer Rolle
// auseinanderentwickeln konnten.
assert.doesNotMatch(app, /const planningRoles = new Set/);
assert.doesNotMatch(app, /const fullPlanningRoles = new Set/);
assert.doesNotMatch(app, /function employeeRoleLabel/);
// Die Plantafel bietet jeden aktiven Mitarbeiter an. Sie war auf Monteure und
// Vorarbeiter gefiltert, obwohl die Schnittstelle alle Rollen einplant.
assert.doesNotMatch(app, /\["installer", "foreman"\]\.includes/);
assert.match(app, /return plannableEmployees\(adminState\?\.employees\)/);
const eingebundeneKerne = [...app.matchAll(/from "(\.\/core\/[^"]+)"/g)].map((treffer) => treffer[1]);
assert.ok(eingebundeneKerne.length >= 2, "app.js bindet die Kernmodule ein");
for (const modul of eingebundeneKerne) {
  assert.ok(
    worker.includes(`"${modul}"`),
    `${modul} fehlt im App-Shell-Cache des Service Workers`
  );
  assert.match(modul, /\?v=0\.42\.0$/, `${modul} braucht dieselbe Fassungsnummer`);
}
assert.doesNotMatch(
  app,
  /^\s{2}function (calculateTimes|formatMinutes|durationMinutes|localDateKey)\(/m,
  "Die Zeitberechnung darf nur im gemeinsamen Kern stehen"
);
assert.ok(worker.includes('"./platform-admin.html"'));
assert.ok(worker.includes('"./platform-admin.css?v=0.42.0"'));
assert.ok(worker.includes('"./platform-admin.js?v=0.42.0"'));
assert.ok(worker.includes('"./vde/index.html"'));
assert.ok(worker.includes('"./vde/styles.css?v=0.42.0"'));
assert.ok(worker.includes('"./vde/app.js?v=0.42.0"'));
assert.match(worker, /DOCUMENT_CACHE_PREFIX/);
assert.match(worker, /siteDocumentContent/);
assert.match(worker, /caches\.open\(scopedCacheName\)\)\.match\(event\.request\)/);
assert.doesNotMatch(
  worker.match(/if \(siteDocumentContent\) \{[\s\S]*?\n  \}/)?.[0] || "",
  /caches\.match\(event\.request\)/,
  "Offline-Dokumente dürfen nicht kontenübergreifend gesucht werden"
);
assert.match(app, /removeOfflineDocumentCachesExcept\(sessionView\.user\.id\)/);
assert.match(app, /await removeOfflineDocumentCachesExcept\(\);/);
assert.match(worker, /requestUrl\.pathname\.includes\("\/vde\/"\)/);
assert.match(
  styles,
  /\.login-form input,\s*\.admin-form input,\s*\.admin-form select\s*\{\s*height: 52px;/,
  "Loginfelder behalten ihre mobile Feldhöhe"
);
assert.ok(worker.includes('"./assets/baustellen-import-vorlage.xlsx"'));
assert.match(app, /\/api\/v1\/time-account\?year=/);
assert.match(app, /\/api\/v1\/admin\/time-accounts\?year=/);
assert.match(app, /\/api\/v1\/admin\/time-account-adjustments/);
assert.match(app, /\/api\/v1\/admin\/holiday-calendar/);
assert.match(app, /function isProjectScopedSession\(\)/);
assert.match(app, /projectManagerId: elements\.projectManager\.value \|\| null/);
assert.match(app, /projectId: projectScoped \? elements\.siteProject\.value : null/);
assert.match(app, /\/closures\/\$\{encodeURIComponent\(closure\.id\)\}\/cancel/);
assert.match(styles, /\.time-account-table/);
assert.match(styles, /\.time-account-admin-item/);
assert.match(styles, /\.holiday-calendar-form/);
assert.match(styles, /\.holiday-closure-list/);
assert.match(styles, /\.electrical-module-admin/);
assert.match(vdeHtml, /lang="de"/);
assert.match(vdeHtml, /id="inspection-form"/);
assert.match(vdeHtml, /id="distribution-list"/);
assert.match(vdeHtml, /id="signature-pad"/);
assert.match(vdeHtml, /RCD-Auslösezeit und -strom werden am jeweiligen Stromkreis/);
assert.match(vdeHtml, /V15-Bestand importieren/);
assert.match(vdeHtml, /id="legacy-local-import"/);
assert.match(vdeHtml, /styles\.css\?v=0\.42\.0/);
assert.match(vdeHtml, /app\.js\?v=0\.42\.0/);
assert.match(vdeStyles, /\.distribution-card/);
assert.match(vdeStyles, /\.circuit-evaluation--bad/);
assert.match(vdeApp, /fuse_nh/);
assert.match(vdeApp, /fuse_diazed/);
assert.match(vdeApp, /fuse_neozed/);
assert.match(vdeApp, /measurements\.rcdTripTime/);
assert.match(vdeApp, /measurements\.rcdTripCurrent/);
assert.match(vdeApp, /measurements\.zi/);
assert.match(vdeApp, /measurements\.zs/);
assert.match(vdeApp, /measurements\.ik/);
assert.match(vdeApp, /moveItem\(protocol\.distributions/);
assert.match(vdeApp, /mapLegacyV15/);
assert.match(vdeApp, /vde-protokoll-v15-sichtbarkeit-reihenfolge/);
assert.match(vdeApp, /originalPdf/);
assert.match(platformHtml, /id="platform-navigation"/);
assert.equal(
  [...platformHtml.matchAll(/data-platform-view=/g)].length,
  14,
  "Die Plattformverwaltung besitzt genau ihre vierzehn getrennten Hauptbereiche"
);
assert.match(platformHtml, /data-platform-view="overview"/);
assert.match(platformHtml, /data-platform-view="settings"/);
assert.doesNotMatch(platformHtml, />Woche</);
assert.doesNotMatch(platformHtml, />Einsätze</);
assert.match(platformHtml, /id="support-mode-banner"/);
assert.match(platformStyles, /env\(safe-area-inset-bottom\)/);
assert.match(styles, /\.site-choice-dialog[\s\S]*var\(--site-choice-viewport-height, 100dvh\)/);
assert.match(styles, /\.time-correction-form[\s\S]*overflow-y: auto/);
assert.match(styles, /\.site-choice-new-form > \.button[\s\S]*position: sticky/);
assert.match(styles, /scroll-padding-block: 92px calc\(110px \+ env\(safe-area-inset-bottom\)\)/);
assert.match(platformApp, /\/api\/v1\/platform\//);
assert.doesNotMatch(
  platformApp,
  /Laufende Baustellen|Arbeitszeiten|Bautagesberichte|Montageberichte|Einsatzpläne|Urlaubsstände|Projektkennzahlen/,
  "Das Plattformdashboard darf keine operativen Firmenkennzahlen definieren"
);
assert.match(platformApp, /X-Support-Access-Id/);
assert.match(platformApp, /Administratoransicht – Firma:/);
assert.match(platformApp, /platform_module_administration_required|modules\/\$\{encodeURIComponent/);
assert.match(html, /id="next-holiday-card"/);
assert.match(html, /Alle Feiertage anzeigen/);
assert.match(html, /id="archived-employee-panel"/);
assert.match(app, /breakMinutesOverride/);
assert.match(app, /window\.visualViewport/);
assert.match(app, /Deine Eingaben bleiben erhalten/);
assert.match(app, /firstInvalid\.scrollIntoView/);
assert.match(app, /siteChoiceDialog\.addEventListener\("focusin"/);
assert.match(app, /correctingTimeEntryAdministrator \? "admin\/" : ""/);
assert.match(app, /\/api\/v1\/admin\/work-days\/\$\{encodeURIComponent\(day\.id\)\}/);
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
