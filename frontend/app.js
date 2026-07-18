(() => {
  const DEMO_STORAGE_KEY = "schaefchen.sprint2.demo.v1";
  const ONLINE_STORAGE_KEY = "schaefchen.online.cache.v1";
  const queryMode = new URLSearchParams(window.location.search).get("mode");
  const demoMode = queryMode === "demo" || (
    queryMode !== "live"
    && (window.location.hostname.endsWith("github.io") || window.location.port === "4173")
  );

  const demoAssignments = [
    {
      sequenceNumber: 1,
      plannedStartTime: "07:30:00",
      constructionSite: { id: null, name: "Demo · Musterstraße 12", shortText: "Verteilung erneuern" }
    },
    {
      sequenceNumber: 2,
      plannedStartTime: null,
      constructionSite: { id: null, name: "Demo · Hafenweg 4", shortText: "Beleuchtung prüfen" }
    }
  ];

  const elements = {
    loginView: document.querySelector("#login-view"),
    passwordChangeView: document.querySelector("#password-change-view"),
    dashboardView: document.querySelector("#dashboard-view"),
    loginForm: document.querySelector("#login-form"),
    loginMessage: document.querySelector("#login-message"),
    loginSubmit: document.querySelector("#login-submit"),
    companyNumberField: document.querySelector("#company-number-field"),
    companyNumber: document.querySelector("#company-number"),
    personnelNumber: document.querySelector("#personnel-number"),
    passwordInput: document.querySelector("#password"),
    passwordState: document.querySelector("#password-state"),
    togglePassword: document.querySelector("#toggle-password"),
    setupForm: document.querySelector("#setup-form"),
    setupFirstName: document.querySelector("#setup-first-name"),
    setupLastName: document.querySelector("#setup-last-name"),
    setupPersonnelNumber: document.querySelector("#setup-personnel-number"),
    setupPassword: document.querySelector("#setup-password"),
    setupToken: document.querySelector("#setup-token"),
    setupSubmit: document.querySelector("#setup-submit"),
    setupMessage: document.querySelector("#setup-message"),
    passwordChangeForm: document.querySelector("#password-change-form"),
    newPassword: document.querySelector("#new-password"),
    confirmPassword: document.querySelector("#confirm-password"),
    passwordChangeSubmit: document.querySelector("#password-change-submit"),
    passwordChangeMessage: document.querySelector("#password-change-message"),
    modeNote: document.querySelector("#mode-note"),
    modeNoteText: document.querySelector("#mode-note-text"),
    openPreview: document.querySelector("#open-preview"),
    previewDivider: document.querySelector("#preview-divider"),
    loginFooter: document.querySelector("#login-footer"),
    loginCompanyMark: document.querySelector("#login-company-mark"),
    loginCompanyName: document.querySelector("#login-company-name"),
    closePreview: document.querySelector("#close-preview"),
    dashboardCompanyMark: document.querySelector("#dashboard-company-mark"),
    dashboardCompany: document.querySelector("#dashboard-company"),
    dashboardTitle: document.querySelector("#dashboard-title"),
    modeBadge: document.querySelector("#mode-badge"),
    foremanBadge: document.querySelector("#foreman-badge"),
    dashboardPanes: [...document.querySelectorAll("[data-dashboard-pane]")],
    timesheetEyebrow: document.querySelector("#timesheet-eyebrow"),
    storageTitle: document.querySelector("#storage-title"),
    storageText: document.querySelector("#storage-text"),
    primaryAction: document.querySelector("#primary-action"),
    primaryActionIcon: document.querySelector("#primary-action-icon"),
    primaryActionLabel: document.querySelector("#primary-action-label"),
    secondaryAction: document.querySelector("#secondary-action"),
    workdayTitle: document.querySelector("#workday-title"),
    statusSince: document.querySelector("#status-since"),
    statusWorkTime: document.querySelector("#status-work-time"),
    actionHint: document.querySelector("#action-hint"),
    connectionState: document.querySelector("#connection-state"),
    todayLabel: document.querySelector("#today-label"),
    weekStrip: document.querySelector("#week-strip"),
    assignmentCard: document.querySelector("#assignment-card"),
    assignmentOrder: document.querySelector("#assignment-order"),
    assignmentTitle: document.querySelector("#assignment-title"),
    assignmentMeta: document.querySelector("#assignment-meta"),
    assignmentDetails: document.querySelector("#assignment-details"),
    liveDuration: document.querySelector("#live-duration"),
    grossTime: document.querySelector("#gross-time"),
    breakTime: document.querySelector("#break-time"),
    workTime: document.querySelector("#work-time"),
    travelTime: document.querySelector("#travel-time"),
    entryList: document.querySelector("#entry-list"),
    timesheetSection: document.querySelector("#timesheet-section"),
    showWeek: document.querySelector("#show-week"),
    resetDemo: document.querySelector("#reset-demo"),
    navStart: document.querySelector("#nav-start"),
    navWeek: document.querySelector("#nav-week"),
    navMore: document.querySelector("#nav-more"),
    infoCard: document.querySelector(".info-card"),
    adminSection: document.querySelector("#admin-section"),
    adminRefresh: document.querySelector("#admin-refresh"),
    assignmentPlanningContent: document.querySelector("#assignment-planning-content"),
    sitePlanningContent: document.querySelector("#site-planning-content"),
    businessStructurePanel: document.querySelector("#business-structure-panel"),
    adminEmployeeCount: document.querySelector("#admin-employee-count"),
    adminCustomerCount: document.querySelector("#admin-customer-count"),
    adminProjectCount: document.querySelector("#admin-project-count"),
    adminSiteCount: document.querySelector("#admin-site-count"),
    businessHierarchy: document.querySelector("#business-hierarchy"),
    siteDashboard: document.querySelector("#site-dashboard"),
    siteDashboardTitle: document.querySelector("#site-dashboard-title"),
    siteDashboardMeta: document.querySelector("#site-dashboard-meta"),
    siteDashboardCustomer: document.querySelector("#site-dashboard-customer"),
    siteDashboardProject: document.querySelector("#site-dashboard-project"),
    siteDashboardOrder: document.querySelector("#site-dashboard-order"),
    siteDashboardNavigation: document.querySelector("#site-dashboard-navigation"),
    siteDashboardEmployees: document.querySelector("#site-dashboard-employees"),
    adminWeek: document.querySelector("#admin-week"),
    siteDashboardClose: document.querySelector("#site-dashboard-close"),
    adminWeekPrevious: document.querySelector("#admin-week-previous"),
    adminWeekNext: document.querySelector("#admin-week-next"),
    adminWeekTitle: document.querySelector("#admin-week-title"),
    adminWeekBoard: document.querySelector("#admin-week-board"),
    assignmentEditForm: document.querySelector("#assignment-edit-form"),
    assignmentEditTitle: document.querySelector("#assignment-edit-title"),
    assignmentEditDate: document.querySelector("#assignment-edit-date"),
    assignmentEditTime: document.querySelector("#assignment-edit-time"),
    assignmentEditReason: document.querySelector("#assignment-edit-reason"),
    assignmentEditSave: document.querySelector("#assignment-edit-save"),
    assignmentEditCancel: document.querySelector("#assignment-edit-cancel"),
    assignmentEditClose: document.querySelector("#assignment-edit-close"),
    assignmentEditMessage: document.querySelector("#assignment-edit-message"),
    assignmentImportPanel: document.querySelector("#assignment-import-panel"),
    assignmentImportDropzone: document.querySelector("#assignment-import-dropzone"),
    assignmentImportFile: document.querySelector("#assignment-import-file"),
    assignmentImportFileName: document.querySelector("#assignment-import-file-name"),
    assignmentImportPreviewButton: document.querySelector("#assignment-import-preview-button"),
    assignmentImportMessage: document.querySelector("#assignment-import-message"),
    assignmentImportPreview: document.querySelector("#assignment-import-preview"),
    assignmentImportTitle: document.querySelector("#assignment-import-title"),
    assignmentImportStats: document.querySelector("#assignment-import-stats"),
    assignmentImportWarnings: document.querySelector("#assignment-import-warnings"),
    assignmentImportMappings: document.querySelector("#assignment-import-mappings"),
    assignmentImportMappingFields: document.querySelector("#assignment-import-mapping-fields"),
    assignmentImportApplyMappings: document.querySelector("#assignment-import-apply-mappings"),
    assignmentImportList: document.querySelector("#assignment-import-list"),
    assignmentImportConfirm: document.querySelector("#assignment-import-confirm"),
    siteImportPanel: document.querySelector("#site-import-panel"),
    siteImportDropzone: document.querySelector("#site-import-dropzone"),
    siteImportFile: document.querySelector("#site-import-file"),
    siteImportFileName: document.querySelector("#site-import-file-name"),
    siteImportPreviewButton: document.querySelector("#site-import-preview-button"),
    siteImportMessage: document.querySelector("#site-import-message"),
    siteImportPreview: document.querySelector("#site-import-preview"),
    siteImportTitle: document.querySelector("#site-import-title"),
    siteImportStats: document.querySelector("#site-import-stats"),
    siteImportWarnings: document.querySelector("#site-import-warnings"),
    siteImportList: document.querySelector("#site-import-list"),
    siteImportConfirm: document.querySelector("#site-import-confirm"),
    employeeForm: document.querySelector("#employee-form"),
    employeeFirstName: document.querySelector("#employee-first-name"),
    employeeLastName: document.querySelector("#employee-last-name"),
    employeePersonnelNumber: document.querySelector("#employee-personnel-number"),
    employeeRole: document.querySelector("#employee-role"),
    employeeManagementRoles: [...document.querySelectorAll("[data-management-role]")],
    employeeTemporaryPassword: document.querySelector("#employee-temporary-password"),
    employeeMessage: document.querySelector("#employee-message"),
    employeeList: document.querySelector("#employee-list"),
    customerPanel: document.querySelector("#customer-panel"),
    customerForm: document.querySelector("#customer-form"),
    customerType: document.querySelector("#customer-type"),
    customerCompanyFields: document.querySelector("#customer-company-fields"),
    customerPrivateFields: document.querySelector("#customer-private-fields"),
    customerCompanyName: document.querySelector("#customer-company-name"),
    customerFirstName: document.querySelector("#customer-first-name"),
    customerLastName: document.querySelector("#customer-last-name"),
    customerEmail: document.querySelector("#customer-email"),
    customerPhone: document.querySelector("#customer-phone"),
    customerStreet: document.querySelector("#customer-street"),
    customerHouseNumber: document.querySelector("#customer-house-number"),
    customerPostalCode: document.querySelector("#customer-postal-code"),
    customerCity: document.querySelector("#customer-city"),
    customerMessage: document.querySelector("#customer-message"),
    customerList: document.querySelector("#customer-list"),
    projectPanel: document.querySelector("#project-panel"),
    projectForm: document.querySelector("#project-form"),
    projectCustomer: document.querySelector("#project-customer"),
    projectName: document.querySelector("#project-name"),
    projectShortText: document.querySelector("#project-short-text"),
    projectMessage: document.querySelector("#project-message"),
    projectList: document.querySelector("#project-list"),
    siteFormPanel: document.querySelector("#site-form-panel"),
    siteForm: document.querySelector("#site-form"),
    siteProject: document.querySelector("#site-project"),
    siteName: document.querySelector("#site-name"),
    siteShortText: document.querySelector("#site-short-text"),
    siteStreet: document.querySelector("#site-street"),
    siteHouseNumber: document.querySelector("#site-house-number"),
    sitePostalCode: document.querySelector("#site-postal-code"),
    siteCity: document.querySelector("#site-city"),
    siteMessage: document.querySelector("#site-message"),
    siteList: document.querySelector("#site-list"),
    assignmentPanel: document.querySelector("#assignment-panel"),
    assignmentForm: document.querySelector("#assignment-form"),
    assignmentEmployee: document.querySelector("#assignment-employee"),
    assignmentSite: document.querySelector("#assignment-site"),
    assignmentDate: document.querySelector("#assignment-date"),
    assignmentTime: document.querySelector("#assignment-time"),
    assignmentComment: document.querySelector("#assignment-comment"),
    assignmentMessage: document.querySelector("#assignment-message"),
    adminAssignmentList: document.querySelector("#admin-assignment-list"),
    toast: document.querySelector("#toast")
  };

  elements.assignmentPlanningContent.append(
    elements.adminWeek,
    elements.assignmentEditForm,
    elements.assignmentPanel,
    elements.assignmentImportPanel
  );
  elements.sitePlanningContent.append(
    elements.businessStructurePanel,
    elements.siteDashboard,
    elements.customerPanel,
    elements.projectPanel,
    elements.siteFormPanel,
    elements.siteImportPanel
  );

  const dateFormatter = new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "long"
  });
  const timeFormatter = new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit"
  });
  const shortDayFormatter = new Intl.DateTimeFormat("de-DE", { weekday: "short" });

  let toastTimer;
  let syncing = false;
  let session = null;
  let adminState = null;
  let editingAssignmentId = null;
  let assignmentImportFile = null;
  let assignmentImportPayload = null;
  let assignmentImportState = null;
  let siteImportFile = null;
  let siteImportPayload = null;
  let siteImportState = null;
  let cachedUserId = null;
  let assignments = demoMode ? demoAssignments : [];
  let state = loadState();

  function localDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function initialState() {
    return { version: 1, workDate: localDateKey(), events: [] };
  }

  function loadState() {
    const key = demoMode ? DEMO_STORAGE_KEY : ONLINE_STORAGE_KEY;
    try {
      const saved = JSON.parse(window.localStorage.getItem(key));
      if (saved?.version === 1 && saved.workDate === localDateKey() && Array.isArray(saved.events)) {
        if (!demoMode) {
          if (Array.isArray(saved.assignments)) assignments = saved.assignments;
          cachedUserId = typeof saved.userId === "string" ? saved.userId : null;
        }
        return { version: 1, workDate: saved.workDate, events: saved.events };
      }
    } catch {
      // Ein blockierter Speicher darf die App nicht unbenutzbar machen.
    }
    return initialState();
  }

  function saveState() {
    const key = demoMode ? DEMO_STORAGE_KEY : ONLINE_STORAGE_KEY;
    try {
      window.localStorage.setItem(key, JSON.stringify({
        ...state,
        assignments: demoMode ? undefined : assignments,
        userId: demoMode ? undefined : (session?.user.id || cachedUserId)
      }));
    } catch {
      showToast("Lokaler Speicher ist in diesem Browser blockiert.");
    }
  }

  function createClientEntryId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
      const random = Math.floor(Math.random() * 16);
      const value = character === "x" ? random : (random & 0x3) | 0x8;
      return value.toString(16);
    });
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.hidden = false;
    toastTimer = window.setTimeout(() => {
      elements.toast.hidden = true;
    }, 3600);
  }

  async function requestJson(path, options = {}) {
    let response;
    try {
      response = await fetch(path, {
        credentials: "include",
        ...options,
        headers: {
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          ...options.headers
        }
      });
    } catch {
      const error = new Error("Der Server ist momentan nicht erreichbar.");
      error.network = true;
      throw error;
    }

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(body.error?.message || "Die Anfrage ist fehlgeschlagen.");
      error.status = response.status;
      error.code = body.error?.code;
      throw error;
    }
    return body;
  }

  function configureModeCopy() {
    elements.openPreview.hidden = !demoMode;
    elements.previewDivider.hidden = !demoMode;
    elements.modeNote.hidden = !demoMode;
    elements.companyNumberField.hidden = true;
    elements.modeBadge.textContent = demoMode ? "Vorschau" : "Live";
    elements.timesheetEyebrow.textContent = demoMode ? "Live und lokal" : "Live synchronisiert";
    elements.resetDemo.hidden = !demoMode;
    elements.closePreview.setAttribute("aria-label", demoMode ? "Vorschau beenden" : "Abmelden");
    elements.passwordState.textContent = demoMode ? "In der Demo inaktiv" : "Sicher verschlüsselt";
    elements.loginSubmit.classList.toggle("button--secondary", demoMode);
    elements.loginSubmit.classList.toggle("button--primary", !demoMode);
    elements.loginFooter.textContent = `Einfach vor komplex · Version 0.12.1 ${demoMode ? "Demo" : "Online"}`;

    if (demoMode) {
      elements.modeNoteText.replaceChildren();
      const strong = document.createElement("strong");
      strong.textContent = "Öffentliche Demo";
      elements.modeNoteText.append(strong, document.createElement("br"), "Keine Serveranmeldung. Zeiten bleiben nur auf diesem Gerät.");
      elements.storageTitle.textContent = "Lokale, sichere Demo.";
      elements.storageText.textContent = "Die Buchungen bleiben auf diesem Gerät, werden an keinen Server gesendet und enthalten keine GPS-Daten.";
    } else {
      elements.modeNoteText.replaceChildren();
      const strong = document.createElement("strong");
      strong.textContent = "Sichere Online-Anmeldung";
      elements.modeNoteText.append(strong, document.createElement("br"), "Firma und Rollen werden ausschließlich vom Server bestimmt.");
      elements.storageTitle.textContent = "Sicher synchronisiert.";
      elements.storageText.textContent = "Buchungen werden verschlüsselt übertragen. Ohne Verbindung warten sie mit eindeutiger Offline-ID auf diesem Gerät. GPS wird nicht erfasst.";
    }
  }

  function showDashboard() {
    elements.loginView.hidden = true;
    elements.passwordChangeView.hidden = true;
    elements.dashboardView.hidden = false;
    document.title = "Start · Schäfchen";
    render();
    showDashboardPane("start", false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function showLogin() {
    elements.dashboardView.hidden = true;
    elements.passwordChangeView.hidden = true;
    elements.loginView.hidden = false;
    elements.setupForm.hidden = true;
    elements.loginForm.hidden = false;
    configureModeCopy();
    document.title = "Schäfchen";
    elements.passwordInput.value = "";
    elements.loginMessage.textContent = "";
    assignmentImportFile = null;
    elements.assignmentImportFile.value = "";
    elements.assignmentImportFileName.textContent = "oder hier ablegen · maximal 1,5 MB";
    resetAssignmentImportPreview();
    siteImportFile = null;
    elements.siteImportFile.value = "";
    elements.siteImportFileName.textContent = "oder hier ablegen · maximal 1,5 MB";
    resetSiteImportPreview();
  }

  function showSetup(setup) {
    elements.passwordChangeView.hidden = true;
    elements.companyNumber.value = setup.companyNumber;
    elements.companyNumber.readOnly = true;
    elements.loginForm.hidden = true;
    elements.setupForm.hidden = false;
    elements.modeNote.hidden = false;
    elements.loginCompanyName.textContent = setup.displayName;
    elements.loginCompanyMark.textContent = (setup.displayName[0] || "F").toUpperCase();
    elements.modeNoteText.replaceChildren();
    const strong = document.createElement("strong");
    strong.textContent = setup.displayName;
    elements.modeNoteText.append(strong, document.createElement("br"), "Die Online-App benötigt einmalig ihren ersten Administrator.");
  }

  function showPasswordChange() {
    elements.loginView.hidden = true;
    elements.dashboardView.hidden = true;
    elements.passwordChangeView.hidden = false;
    elements.newPassword.value = "";
    elements.confirmPassword.value = "";
    elements.passwordChangeMessage.textContent = "";
    document.title = "Passwort ändern · Schäfchen";
  }

  function canPlan() {
    const planningRoles = new Set([
      "admin",
      "managing_director",
      "dispatch_office",
      "office",
      "planner",
      "project_manager",
      "executive_assistant"
    ]);
    return !demoMode && Boolean(session?.user.roles?.some((role) => planningRoles.has(role)));
  }

  function addIsoDays(date, days) {
    const value = new Date(`${date}T00:00:00Z`);
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
  }

  function dateFromIso(date) {
    return new Date(`${date}T12:00:00`);
  }

  function shortDate(date) {
    return dateFromIso(date).toLocaleDateString("de-DE", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit"
    });
  }

  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 32768) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
    }
    return window.btoa(binary);
  }

  function resetAssignmentImportPreview() {
    assignmentImportPayload = null;
    assignmentImportState = null;
    elements.assignmentImportPreview.hidden = true;
    elements.assignmentImportStats.replaceChildren();
    elements.assignmentImportWarnings.replaceChildren();
    elements.assignmentImportMappings.hidden = true;
    elements.assignmentImportMappingFields.replaceChildren();
    elements.assignmentImportList.replaceChildren();
  }

  function selectAssignmentImportFile(file) {
    resetAssignmentImportPreview();
    assignmentImportFile = file || null;
    elements.assignmentImportMessage.textContent = "";
    const valid = Boolean(
      file
      && file.name.toLocaleLowerCase("de-DE").endsWith(".xlsx")
      && file.size > 0
      && file.size <= 1_500_000
    );
    elements.assignmentImportPreviewButton.disabled = !valid;
    if (!file) {
      elements.assignmentImportFileName.textContent = "oder hier ablegen · maximal 1,5 MB";
      return;
    }
    elements.assignmentImportFileName.textContent = `${file.name} · ${Math.ceil(file.size / 1024)} KB`;
    if (!valid) {
      elements.assignmentImportMessage.textContent = "Bitte eine .xlsx-Datei mit höchstens 1,5 MB auswählen.";
    }
  }

  function addImportStat(container, value, label) {
    const item = document.createElement("div");
    const strong = document.createElement("strong");
    const span = document.createElement("span");
    strong.textContent = String(value);
    span.textContent = label;
    item.append(strong, span);
    container.append(item);
  }

  function addImportWarning(message) {
    const warning = document.createElement("p");
    warning.className = "import-warning";
    warning.textContent = message;
    elements.assignmentImportWarnings.append(warning);
  }

  function importLabelList(items) {
    return items.slice(0, 8).map((item) => `${item.name} (${item.assignments})`).join(", ")
      + (items.length > 8 ? ` und ${items.length - 8} weitere` : "");
  }

  function addAssignmentMapping(kind, item, targets, targetLabel) {
    const wrapper = document.createElement("div");
    const label = document.createElement("label");
    const select = document.createElement("select");
    const empty = document.createElement("option");
    wrapper.className = "import-mapping-field";
    label.textContent = `Excel: ${item.name} (${item.assignments}×)`;
    empty.value = "";
    empty.textContent = "Bitte zuordnen oder nicht übernehmen";
    select.dataset.mappingKind = kind;
    select.dataset.sourceLabel = item.name;
    select.append(empty);
    targets.forEach((target) => {
      const option = document.createElement("option");
      option.value = target.id;
      option.textContent = targetLabel(target);
      select.append(option);
    });
    wrapper.append(label, select);
    elements.assignmentImportMappingFields.append(wrapper);
  }

  function renderAssignmentMappings(preview) {
    elements.assignmentImportMappingFields.replaceChildren();
    preview.unmatchedEmployees.forEach((item) => addAssignmentMapping(
      "employees",
      item,
      adminState?.employees || [],
      (employee) => `${employee.firstName} ${employee.lastName} · ${employee.personnelNumber}`
    ));
    preview.unmatchedSites.forEach((item) => addAssignmentMapping(
      "sites",
      item,
      adminState?.sites || [],
      (site) => `${site.name} · ${site.address.city}`
    ));
    elements.assignmentImportMappings.hidden = elements.assignmentImportMappingFields.children.length === 0;
  }

  function renderAssignmentImportPreview(preview) {
    assignmentImportState = preview;
    elements.assignmentImportPreview.hidden = false;
    elements.assignmentImportTitle.textContent = `${shortDate(preview.weekStart)} bis ${shortDate(preview.weekEnd)}`;
    elements.assignmentImportStats.replaceChildren();
    addImportStat(elements.assignmentImportStats, preview.sourceAssignmentCount, "X gelesen");
    addImportStat(elements.assignmentImportStats, preview.readyCount, "bereit");
    addImportStat(elements.assignmentImportStats, preview.sourceAssignmentCount - preview.readyCount, "übersprungen");
    elements.assignmentImportWarnings.replaceChildren();

    if (preview.unmatchedEmployees.length) {
      addImportWarning(`Mitarbeiter nicht eindeutig gefunden: ${importLabelList(preview.unmatchedEmployees)}.`);
    }
    if (preview.unmatchedSites.length) {
      addImportWarning(`Baustellen nicht eindeutig gefunden: ${importLabelList(preview.unmatchedSites)}.`);
    }
    if (preview.conflicts.length) {
      const examples = preview.conflicts.slice(0, 5)
        .map((conflict) => `${conflict.employeeName} am ${shortDate(conflict.workDate)}`)
        .join(", ");
      addImportWarning(`${preview.conflicts.length} bereits anders geplanter Tag wird geschützt: ${examples}.`);
    }
    if (preview.duplicateCount) {
      addImportWarning(`${preview.duplicateCount} bereits identische oder doppelte Zuweisung wird nicht erneut angelegt.`);
    }
    if (preview.ignoredStatusCount) {
      const status = Object.entries(preview.statusCounts)
        .map(([marker, count]) => `${marker}: ${count}`)
        .join(", ");
      addImportWarning(`Abwesenheits- und Sonderkürzel werden in dieser Version nur erkannt, nicht importiert (${status}).`);
    }
    renderAssignmentMappings(preview);

    elements.assignmentImportList.replaceChildren();
    preview.rows.forEach((row) => {
      const item = document.createElement("li");
      const title = document.createElement("strong");
      const meta = document.createElement("span");
      title.textContent = `${shortDate(row.workDate)} · ${row.employeeName}`;
      meta.textContent = row.siteName;
      item.append(title, meta);
      elements.assignmentImportList.append(item);
    });
    if (preview.rowsTruncated) {
      const item = document.createElement("li");
      item.textContent = "Weitere sichere Zuweisungen sind in der Summe enthalten.";
      elements.assignmentImportList.append(item);
    }
    elements.assignmentImportConfirm.disabled = preview.readyCount === 0;
    elements.assignmentImportConfirm.textContent = preview.readyCount === 1
      ? "1 Einsatz importieren"
      : `${preview.readyCount} Einsätze importieren`;
  }

  function resetSiteImportPreview() {
    siteImportPayload = null;
    siteImportState = null;
    elements.siteImportPreview.hidden = true;
    elements.siteImportStats.replaceChildren();
    elements.siteImportWarnings.replaceChildren();
    elements.siteImportList.replaceChildren();
  }

  function selectSiteImportFile(file) {
    resetSiteImportPreview();
    siteImportFile = file || null;
    elements.siteImportMessage.textContent = "";
    const valid = Boolean(
      file
      && file.name.toLocaleLowerCase("de-DE").endsWith(".xlsx")
      && file.size > 0
      && file.size <= 1_500_000
    );
    elements.siteImportPreviewButton.disabled = !valid;
    if (!file) {
      elements.siteImportFileName.textContent = "oder hier ablegen · maximal 1,5 MB";
      return;
    }
    elements.siteImportFileName.textContent = `${file.name} · ${Math.ceil(file.size / 1024)} KB`;
    if (!valid) elements.siteImportMessage.textContent = "Bitte eine .xlsx-Datei mit höchstens 1,5 MB auswählen.";
  }

  function renderSiteImportPreview(preview) {
    siteImportState = preview;
    elements.siteImportPreview.hidden = false;
    elements.siteImportTitle.textContent = `${preview.sourceRowCount} gelesene Zeilen`;
    elements.siteImportStats.replaceChildren();
    addImportStat(elements.siteImportStats, preview.sourceRowCount, "gelesen");
    addImportStat(elements.siteImportStats, preview.readyCount, "bereit");
    addImportStat(elements.siteImportStats, preview.duplicateCount + preview.conflictCount, "übersprungen");
    elements.siteImportWarnings.replaceChildren();
    if (preview.duplicates.length) {
      addImportWarningTo(
        elements.siteImportWarnings,
        `${preview.duplicates.length} vorhandene Baustelle wird nicht doppelt angelegt: ${preview.duplicates.slice(0, 5).map((item) => item.siteName).join(", ")}.`
      );
    }
    if (preview.conflicts.length) {
      addImportWarningTo(
        elements.siteImportWarnings,
        `${preview.conflicts.length} fehlerhafte oder nicht eindeutige Zeile: ${preview.conflicts.slice(0, 5).map((item) => `Zeile ${item.sourceRow}: ${item.message}`).join(" · ")}.`
      );
    }
    elements.siteImportList.replaceChildren();
    preview.rows.forEach((row) => {
      const item = document.createElement("li");
      const title = document.createElement("strong");
      const meta = document.createElement("span");
      title.textContent = `${row.siteName} · ${row.customerName}`;
      meta.textContent = `${row.address} · Kunde ${row.customerAction === "existing" ? "vorhanden" : "wird neu angelegt"}`;
      item.append(title, meta);
      elements.siteImportList.append(item);
    });
    elements.siteImportConfirm.disabled = preview.readyCount === 0;
    elements.siteImportConfirm.textContent = preview.readyCount === 1
      ? "1 Baustelle importieren"
      : `${preview.readyCount} Baustellen importieren`;
  }

  function addImportWarningTo(container, message) {
    const warning = document.createElement("p");
    warning.className = "import-warning";
    warning.textContent = message;
    container.append(warning);
  }

  function appendAdminListItem(list, title, meta, action = null) {
    const item = document.createElement("li");
    const content = document.createElement("div");
    const strong = document.createElement("strong");
    const span = document.createElement("span");
    strong.textContent = title;
    span.textContent = meta;
    content.append(strong, span);
    item.append(content);
    if (action) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "text-button";
      button.textContent = action.label;
      button.addEventListener("click", action.handler);
      item.append(button);
    }
    list.append(item);
  }

  function openSiteDashboard(site) {
    const address = [
      `${site.address.street || ""} ${site.address.houseNumber || ""}`.trim(),
      `${site.address.postalCode || ""} ${site.address.city || ""}`.trim()
    ].filter(Boolean).join(", ");
    const assignedEmployees = new Map();
    adminState.weekAssignments
      .filter((assignment) => assignment.constructionSiteId === site.id)
      .forEach((assignment) => {
        assignedEmployees.set(assignment.employeeId, assignment.employeeName);
      });

    elements.siteDashboardTitle.textContent = site.name;
    elements.siteDashboardMeta.textContent = [site.number, address].filter(Boolean).join(" · ");
    elements.siteDashboardCustomer.textContent = site.customerName;
    elements.siteDashboardProject.textContent = site.projectName || site.name;
    elements.siteDashboardOrder.textContent = site.shortText || "Noch kein Arbeitsauftrag hinterlegt";
    elements.siteDashboardNavigation.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
    elements.siteDashboardEmployees.replaceChildren();
    if (assignedEmployees.size === 0) {
      const empty = document.createElement("li");
      empty.className = "admin-list__empty";
      empty.textContent = "In der gewählten Woche ist noch niemand zugewiesen.";
      elements.siteDashboardEmployees.append(empty);
    } else {
      assignedEmployees.forEach((name) => {
        appendAdminListItem(elements.siteDashboardEmployees, name, "In dieser Woche eingeplant");
      });
    }
    elements.siteDashboard.hidden = false;
    elements.siteDashboard.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderAdminSelect(select, items, placeholder, label) {
    const selected = select.value;
    select.replaceChildren();
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = placeholder;
    select.append(empty);
    items.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = label(item);
      select.append(option);
    });
    if (items.some((item) => item.id === selected)) select.value = selected;
  }

  function hierarchySummary(title, meta) {
    const summary = document.createElement("summary");
    const content = document.createElement("span");
    const strong = document.createElement("strong");
    const small = document.createElement("small");
    strong.textContent = title;
    small.textContent = meta;
    content.append(strong, small);
    summary.append(content);
    return summary;
  }

  function renderBusinessHierarchy() {
    elements.businessHierarchy.replaceChildren();
    if (adminState.customers.length === 0) {
      const empty = document.createElement("p");
      empty.className = "hierarchy-empty";
      empty.textContent = "Noch kein Kunde angelegt. Beginne mit dem ersten Kunden.";
      elements.businessHierarchy.append(empty);
      return;
    }

    adminState.customers.forEach((customer) => {
      const customerNode = document.createElement("details");
      customerNode.className = "hierarchy-customer";
      customerNode.append(hierarchySummary(customer.displayName, customer.number));
      const projects = adminState.projects.filter((project) => project.customerId === customer.id);
      if (projects.length === 0) {
        const empty = document.createElement("p");
        empty.className = "hierarchy-empty";
        empty.textContent = "Noch kein Projekt für diesen Kunden.";
        customerNode.append(empty);
      } else {
        projects.forEach((project) => {
          const projectNode = document.createElement("details");
          projectNode.className = "hierarchy-project";
          projectNode.append(hierarchySummary(project.name, `${project.number} · ${project.siteCount} Baustelle${project.siteCount === 1 ? "" : "n"}`));
          const sites = adminState.sites.filter((site) => site.projectId === project.id);
          if (sites.length === 0) {
            const empty = document.createElement("p");
            empty.className = "hierarchy-empty";
            empty.textContent = "Noch keine Baustelle in diesem Projekt.";
            projectNode.append(empty);
          } else {
            const list = document.createElement("ul");
            list.className = "hierarchy-sites";
            sites.forEach((site) => {
              const item = document.createElement("li");
              const button = document.createElement("button");
              const title = document.createElement("strong");
              const meta = document.createElement("span");
              button.type = "button";
              title.textContent = site.name;
              meta.textContent = `${site.number} · ${site.address.city}`;
              button.append(title, meta);
              button.addEventListener("click", () => openSiteDashboard(site));
              item.append(button);
              list.append(item);
            });
            projectNode.append(list);
          }
          customerNode.append(projectNode);
        });
      }
      elements.businessHierarchy.append(customerNode);
    });
  }

  function closeAssignmentEditor() {
    editingAssignmentId = null;
    elements.assignmentEditForm.hidden = true;
    elements.assignmentEditMessage.textContent = "";
    elements.assignmentEditReason.value = "";
  }

  function openAssignmentEditor(assignment) {
    editingAssignmentId = assignment.id;
    elements.assignmentEditTitle.textContent = `${assignment.employeeName} · ${assignment.siteName}`;
    elements.assignmentEditDate.value = assignment.workDate;
    elements.assignmentEditTime.value = assignment.plannedStartTime?.slice(0, 5) || "";
    elements.assignmentEditReason.value = "";
    elements.assignmentEditMessage.textContent = "";
    elements.assignmentEditForm.hidden = false;
    elements.assignmentEditForm.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function renderAdminWeek() {
    const weekStart = adminState.weekStart;
    const weekEnd = addIsoDays(weekStart, 4);
    const start = dateFromIso(weekStart);
    const end = dateFromIso(weekEnd);
    const startLabel = start.toLocaleDateString("de-DE", { day: "numeric", month: "short" });
    const endLabel = end.toLocaleDateString("de-DE", { day: "numeric", month: "short", year: "numeric" });
    elements.adminWeekTitle.textContent = `${startLabel} – ${endLabel}`;
    elements.adminWeekBoard.replaceChildren();

    for (let offset = 0; offset < 5; offset += 1) {
      const workDate = addIsoDays(weekStart, offset);
      const date = dateFromIso(workDate);
      const day = document.createElement("section");
      const dateBlock = document.createElement("div");
      const dayName = document.createElement("span");
      const dayNumber = document.createElement("strong");
      const items = document.createElement("div");
      day.className = "admin-week-day";
      dateBlock.className = "admin-week-day__date";
      items.className = "admin-week-day__items";
      dayName.textContent = shortDayFormatter.format(date).replace(".", "");
      dayNumber.textContent = String(date.getDate());
      dateBlock.append(dayName, dayNumber);

      const dayAssignments = adminState.weekAssignments.filter(
        (assignment) => assignment.workDate === workDate
      );
      if (dayAssignments.length === 0) {
        const empty = document.createElement("span");
        empty.className = "admin-week-empty";
        empty.textContent = "Noch kein Einsatz";
        items.append(empty);
      } else {
        dayAssignments.forEach((assignment) => {
          const card = document.createElement("article");
          const content = document.createElement("div");
          const title = document.createElement("strong");
          const meta = document.createElement("span");
          const edit = document.createElement("button");
          const startTime = assignment.plannedStartTime
            ? `${assignment.plannedStartTime.slice(0, 5)} Uhr`
            : "ohne Startzeit";
          card.className = "week-assignment";
          title.textContent = assignment.employeeName;
          meta.textContent = `${startTime} · ${assignment.siteName}`;
          edit.type = "button";
          edit.textContent = "Ändern";
          edit.addEventListener("click", () => openAssignmentEditor(assignment));
          content.append(title, meta);
          card.append(content, edit);
          items.append(card);
        });
      }
      day.append(dateBlock, items);
      elements.adminWeekBoard.append(day);
    }
  }

  function renderAdmin() {
    if (!adminState) return;
    elements.adminEmployeeCount.textContent = String(adminState.employees.length);
    elements.adminCustomerCount.textContent = String(adminState.customers.length);
    elements.adminProjectCount.textContent = String(adminState.projects.length);
    elements.adminSiteCount.textContent = String(adminState.sites.length);
    elements.employeeManagementRoles.forEach((option) => {
      option.hidden = !adminState.canCreateManagementRoles;
      option.disabled = !adminState.canCreateManagementRoles;
    });
    if (
      !adminState.canCreateManagementRoles
      && elements.employeeManagementRoles.some((option) => option.value === elements.employeeRole.value)
    ) {
      elements.employeeRole.value = "installer";
    }

    renderAdminSelect(
      elements.projectCustomer,
      adminState.customers,
      "Kunde auswählen",
      (customer) => `${customer.displayName} · ${customer.number}`
    );
    renderAdminSelect(
      elements.siteProject,
      adminState.projects,
      "Projekt auswählen",
      (project) => `${project.customerName} · ${project.name}`
    );
    renderAdminSelect(
      elements.assignmentEmployee,
      adminState.employees,
      "Mitarbeiter auswählen",
      (employee) => `${employee.firstName} ${employee.lastName} · ${employee.personnelNumber}`
    );
    renderAdminSelect(
      elements.assignmentSite,
      adminState.sites,
      "Baustelle auswählen",
      (site) => `${site.name} · ${site.address.city}`
    );

    elements.employeeList.replaceChildren();
    adminState.employees.forEach((employee) => {
      const roleLabels = {
        admin: "Administrator",
        managing_director: "Geschäftsführer",
        dispatch_office: "Büro / Disposition",
        office: "Planung (Bestand)",
        planner: "Planer (Bestand)",
        project_manager: "Projektleiter",
        executive_assistant: "Assistenz der Geschäftsführung (Bestand)",
        foreman: "Vorarbeiter",
        installer: "Monteur"
      };
      appendAdminListItem(
        elements.employeeList,
        `${employee.firstName} ${employee.lastName}`,
        `${employee.personnelNumber} · ${employee.roles.map((role) => roleLabels[role] || role).join(", ")}`
      );
    });

    elements.customerList.replaceChildren();
    adminState.customers.forEach((customer) => {
      const contact = [customer.email, customer.phone].filter(Boolean).join(" · ");
      appendAdminListItem(
        elements.customerList,
        customer.displayName,
        [customer.number, contact].filter(Boolean).join(" · ")
      );
    });

    elements.projectList.replaceChildren();
    adminState.projects.forEach((project) => {
      appendAdminListItem(
        elements.projectList,
        project.name,
        `${project.customerName} · ${project.number} · ${project.siteCount} Baustelle${project.siteCount === 1 ? "" : "n"}`
      );
    });

    elements.siteList.replaceChildren();
    adminState.sites.forEach((site) => {
      appendAdminListItem(
        elements.siteList,
        site.name,
        `${site.customerName} · ${site.address.street} ${site.address.houseNumber}, ${site.address.postalCode} ${site.address.city}`,
        { label: "Öffnen", handler: () => openSiteDashboard(site) }
      );
    });

    elements.adminAssignmentList.replaceChildren();
    if (adminState.assignments.length === 0) {
      const empty = document.createElement("li");
      empty.className = "admin-list__empty";
      empty.textContent = `Für ${adminState.date} ist noch kein Einsatz freigegeben.`;
      elements.adminAssignmentList.append(empty);
    } else {
      adminState.assignments.forEach((assignment) => {
        const start = assignment.plannedStartTime ? `${assignment.plannedStartTime.slice(0, 5)} Uhr` : "ohne Startzeit";
        appendAdminListItem(
          elements.adminAssignmentList,
          `${assignment.sequenceNumber}. ${assignment.employeeName}`,
          `${start} · ${assignment.siteName}`
        );
      });
    }
    renderBusinessHierarchy();
    renderAdminWeek();
  }

  async function refreshAdmin(date = elements.assignmentDate.value || localDateKey()) {
    if (!canPlan()) return;
    elements.adminRefresh.disabled = true;
    try {
      const body = await requestJson(`./api/v1/admin/overview?date=${encodeURIComponent(date)}`);
      adminState = body.overview;
      elements.assignmentDate.value = adminState.date;
      renderAdmin();
    } catch (error) {
      if (error.status === 401) showLogin();
      else if (!error.network) showToast(error.message);
    } finally {
      elements.adminRefresh.disabled = false;
    }
  }

  async function submitAdminForm(form, messageElement, requestPath, payload, successMessage) {
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    messageElement.textContent = "Wird sicher gespeichert …";
    try {
      await requestJson(requestPath, { method: "POST", body: JSON.stringify(payload) });
      messageElement.textContent = "";
      showToast(successMessage);
      return true;
    } catch (error) {
      messageElement.textContent = error.message;
      return false;
    } finally {
      submit.disabled = false;
    }
  }

  function currentSiteIndex() {
    if (assignments.length === 0) return 0;
    return Math.min(
      state.events.filter((entry) => entry.type === "next_site").length,
      assignments.length - 1
    );
  }

  function lastEvent() {
    return state.events.at(-1);
  }

  function siteIndexForId(siteId) {
    const index = assignments.findIndex((assignment) => assignment.constructionSite.id === siteId);
    return index >= 0 ? index : null;
  }

  function addEntry(type, siteIndex = null) {
    const siteEvent = ["site_arrival", "site_departure", "next_site"].includes(type);
    const assignment = siteIndex === null ? null : assignments[siteIndex];
    if (siteEvent && !assignment) {
      showToast("Für diesen Schritt fehlt ein freigegebener Einsatz.");
      return;
    }

    const recordedAt = new Date().toISOString();
    const clientEntryId = createClientEntryId();
    state.events.push({
      id: clientEntryId,
      clientEntryId,
      clientCreatedAt: recordedAt,
      type,
      recordedAt,
      siteIndex,
      constructionSiteId: assignment?.constructionSite.id || null,
      pendingSync: !demoMode,
      syncError: null
    });
    saveState();
    render();

    if (demoMode) {
      showToast("Lokal gespeichert · eindeutige Demo-ID angelegt.");
    } else if (navigator.onLine) {
      showToast("Gespeichert · wird sicher synchronisiert.");
      void syncPendingEntries();
    } else {
      showToast("Offline gespeichert · Synchronisation folgt automatisch.");
    }
  }

  async function syncPendingEntries() {
    if (demoMode || syncing || !navigator.onLine) return;
    const pending = state.events.filter((entry) => entry.pendingSync && !entry.syncError);
    if (pending.length === 0) return;
    syncing = true;
    updateConnectionState();

    for (const entry of pending) {
      try {
        const body = await requestJson("./api/v1/time-entries", {
          method: "POST",
          body: JSON.stringify({
            clientEntryId: entry.clientEntryId,
            entryType: entry.type,
            recordedAt: entry.recordedAt,
            clientCreatedAt: entry.clientCreatedAt,
            ...(entry.constructionSiteId ? { constructionSiteId: entry.constructionSiteId } : {})
          })
        });
        entry.id = body.timeEntry.id;
        entry.pendingSync = false;
      } catch (error) {
        if (error.network) break;
        if (error.status === 401) {
          showLogin();
          showToast("Bitte erneut anmelden.");
          break;
        }
        entry.syncError = error.message;
        showToast(error.message);
        break;
      }
      saveState();
      render();
    }

    syncing = false;
    updateConnectionState();
  }

  function handlePrimaryAction() {
    const latest = lastEvent();
    const siteIndex = currentSiteIndex();

    if (!latest) addEntry("clock_in");
    else if (latest.type === "clock_in" && assignments.length === 0) addEntry("clock_out");
    else if (latest.type === "clock_in" || latest.type === "next_site") addEntry("site_arrival", siteIndex);
    else if (latest.type === "site_arrival") addEntry("site_departure", siteIndex);
    else if (latest.type === "site_departure" && siteIndex < assignments.length - 1) addEntry("next_site", siteIndex + 1);
    else if (latest.type === "site_departure") addEntry("clock_out");
  }

  function setPrimaryAction(label, icon, disabled = false) {
    elements.primaryActionLabel.textContent = label;
    elements.primaryActionIcon.textContent = icon;
    elements.primaryAction.disabled = disabled;
  }

  function renderAction() {
    const latest = lastEvent();
    const siteIndex = currentSiteIndex();
    elements.secondaryAction.hidden = true;

    if (!latest) {
      setPrimaryAction("Arbeitstag starten", "▶");
      elements.workdayTitle.textContent = "Noch nicht gestartet";
      elements.actionHint.textContent = "Dein nächster logischer Schritt";
      return;
    }

    if (latest.type === "clock_in" && assignments.length === 0) {
      setPrimaryAction("Feierabend", "■");
      elements.workdayTitle.textContent = "Keine Baustelle eingeplant";
    } else if (latest.type === "clock_in") {
      setPrimaryAction("Auf Baustelle angekommen", "✓");
      elements.workdayTitle.textContent = "Anfahrt läuft";
    } else if (latest.type === "site_arrival") {
      setPrimaryAction("Baustelle verlassen", "→");
      elements.workdayTitle.textContent = "Auf der Baustelle";
    } else if (latest.type === "site_departure" && siteIndex < assignments.length - 1) {
      setPrimaryAction("Nächste Baustelle", "→");
      elements.secondaryAction.hidden = false;
      elements.workdayTitle.textContent = "Baustelle verlassen";
    } else if (latest.type === "site_departure") {
      setPrimaryAction("Feierabend", "■");
      elements.workdayTitle.textContent = "Letzte Baustelle verlassen";
    } else if (latest.type === "next_site") {
      setPrimaryAction("Auf Baustelle angekommen", "✓");
      elements.workdayTitle.textContent = "Zur nächsten Baustelle";
    } else {
      setPrimaryAction("Arbeitstag abgeschlossen", "✓", true);
      elements.workdayTitle.textContent = "Arbeitstag abgeschlossen";
    }

    elements.actionHint.textContent = latest.type === "clock_out"
      ? (demoMode ? "Der lokale Stundenzettel ist vollständig" : "Der Stundenzettel ist sicher gespeichert")
      : (demoMode ? "Jede Buchung erhält eine eindeutige Demo-ID" : "Offline-fähig mit eindeutiger Client-ID");
  }

  function assignmentMeta(assignment) {
    const start = assignment.plannedStartTime
      ? `${assignment.plannedStartTime.slice(0, 5)} Uhr`
      : "Danach";
    return [start, assignment.constructionSite.shortText].filter(Boolean).join(" · ");
  }

  function renderAssignment() {
    if (assignments.length === 0) {
      elements.assignmentOrder.textContent = "Heute";
      elements.assignmentTitle.textContent = "Kein Einsatz freigegeben";
      elements.assignmentMeta.textContent = "Die Zeiterfassung kann trotzdem gestartet werden.";
      elements.assignmentCard.classList.remove("assignment-card--active");
      return;
    }

    const siteIndex = currentSiteIndex();
    const assignment = assignments[siteIndex];
    const latest = lastEvent();
    let status = assignmentMeta(assignment);

    if (latest?.type === "clock_in" && siteIndex === 0) status = `Anfahrt läuft · ${status}`;
    else if (latest?.type === "site_arrival") status = `Vor Ort · ${status}`;
    else if (latest?.type === "site_departure") status = `Einsatz beendet · ${status}`;
    else if (latest?.type === "next_site") status = `Nächster Einsatz · ${status}`;
    else if (latest?.type === "clock_out") status = "Alle Einsätze für heute abgeschlossen";

    elements.assignmentOrder.textContent = `${siteIndex + 1} von ${assignments.length}`;
    elements.assignmentTitle.textContent = assignment.constructionSite.name;
    elements.assignmentMeta.textContent = status;
    elements.assignmentCard.classList.toggle("assignment-card--active", Boolean(latest) && latest.type !== "clock_out");
  }

  function durationMinutes(milliseconds) {
    return Math.max(0, Math.floor(milliseconds / 60000));
  }

  function formatMinutes(minutes) {
    const safeMinutes = Math.max(0, Math.floor(minutes));
    return `${String(Math.floor(safeMinutes / 60)).padStart(2, "0")}:${String(safeMinutes % 60).padStart(2, "0")}`;
  }

  function calculatedTimes() {
    const clockIn = state.events.find((entry) => entry.type === "clock_in");
    const clockOut = state.events.find((entry) => entry.type === "clock_out");
    const endTime = clockOut ? new Date(clockOut.recordedAt) : new Date();
    const gross = clockIn ? durationMinutes(endTime - new Date(clockIn.recordedAt)) : 0;
    const pause = gross >= 360 ? 60 : gross >= 210 ? 30 : 0;
    const work = Math.max(gross - pause, 0);
    let travel = 0;

    state.events.forEach((entry, index) => {
      if (!["clock_in", "site_departure"].includes(entry.type)) return;
      const destination = state.events
        .slice(index + 1)
        .find((candidate) => ["site_arrival", "clock_out"].includes(candidate.type));
      const segmentEnd = destination ? new Date(destination.recordedAt) : endTime;
      travel += durationMinutes(segmentEnd - new Date(entry.recordedAt));
    });

    return { gross, pause, work, travel: Math.min(travel, work) };
  }

  function renderTimes() {
    const times = calculatedTimes();
    elements.liveDuration.textContent = formatMinutes(times.gross);
    elements.grossTime.textContent = formatMinutes(times.gross);
    elements.breakTime.textContent = formatMinutes(times.pause);
    elements.workTime.textContent = formatMinutes(times.work);
    elements.travelTime.textContent = formatMinutes(times.travel);
    const latest = lastEvent();
    elements.statusWorkTime.textContent = formatMinutes(times.work);
    elements.statusSince.textContent = !latest
      ? "Bereit zum Start"
      : `${latest.type === "clock_out" ? "Beendet um" : "Seit"} ${timeFormatter.format(new Date(latest.recordedAt))} Uhr`;
    elements.foremanBadge.hidden = !session?.user.roles?.includes("foreman");
  }

  function entryLabel(entry) {
    const labels = {
      clock_in: "Arbeitstag gestartet",
      site_arrival: "Auf Baustelle angekommen",
      site_departure: "Baustelle verlassen",
      next_site: "Nächste Baustelle gewählt",
      clock_out: "Feierabend"
    };
    const siteIndex = entry.siteIndex ?? siteIndexForId(entry.constructionSiteId);
    const site = siteIndex === null || !assignments[siteIndex]
      ? ""
      : ` · ${assignments[siteIndex].constructionSite.name.replace("Demo · ", "")}`;
    return `${labels[entry.type]}${site}`;
  }

  function renderEntries() {
    elements.entryList.replaceChildren();
    if (state.events.length === 0) {
      const empty = document.createElement("li");
      empty.className = "entry-list__empty";
      empty.textContent = "Noch keine Buchung.";
      elements.entryList.append(empty);
      return;
    }

    state.events.forEach((entry) => {
      const item = document.createElement("li");
      const marker = document.createElement("i");
      const content = document.createElement("div");
      const label = document.createElement("strong");
      const meta = document.createElement("span");
      marker.setAttribute("aria-hidden", "true");
      label.textContent = entryLabel(entry);
      const status = demoMode
        ? "lokal vorgemerkt"
        : entry.syncError ? "Synchronisation prüfen" : entry.pendingSync ? "wartet auf Synchronisation" : "synchronisiert";
      meta.textContent = `${timeFormatter.format(new Date(entry.recordedAt))} · ${status}`;
      content.append(label, meta);
      item.append(marker, content);
      elements.entryList.append(item);
    });
  }

  function renderWeek() {
    const today = new Date();
    const weekday = today.getDay() || 7;
    const monday = new Date(today);
    monday.setDate(today.getDate() - weekday + 1);
    elements.weekStrip.replaceChildren();

    for (let offset = 0; offset < 5; offset += 1) {
      const date = new Date(monday);
      date.setDate(monday.getDate() + offset);
      const item = document.createElement("div");
      const dayName = shortDayFormatter.format(date).replace(".", "");
      const isToday = localDateKey(date) === localDateKey(today);
      item.className = `day-pill${isToday ? " day-pill--today" : ""}`;
      item.setAttribute("aria-label", `${dayName}, ${date.getDate()}.`);
      const name = document.createElement("span");
      const number = document.createElement("strong");
      const status = document.createElement("i");
      name.textContent = dayName;
      number.textContent = String(date.getDate());
      status.textContent = isToday && state.events.length ? "●" : "";
      status.setAttribute("aria-hidden", "true");
      item.append(name, number, status);
      elements.weekStrip.append(item);
    }
  }

  function render() {
    renderAction();
    renderAssignment();
    renderTimes();
    renderEntries();
    renderWeek();
    updateConnectionState();
  }

  function updateConnectionState() {
    const online = navigator.onLine;
    const pendingCount = state.events.filter((entry) => entry.pendingSync).length;
    elements.connectionState.classList.toggle("connection-state--offline", !online || pendingCount > 0);
    const label = !online ? "Offline" : syncing ? "Sync …" : pendingCount > 0 ? `${pendingCount} offen` : "Online";
    elements.connectionState.querySelector("span").textContent = label;
  }

  function activateNavigation(activeButton) {
    [elements.navStart, elements.navWeek, elements.navMore].forEach((button) => {
      const active = button === activeButton;
      button.classList.toggle("nav-item--active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
  }

  function showDashboardPane(pane, smooth = true) {
    elements.dashboardPanes.forEach((element) => {
      const allowed = element !== elements.adminSection || canPlan();
      element.hidden = element.dataset.dashboardPane !== pane || !allowed;
    });
    const activeButton = pane === "week"
      ? elements.navWeek
      : pane === "more" ? elements.navMore : elements.navStart;
    activateNavigation(activeButton);
    document.title = `${pane === "week" ? "Woche" : pane === "more" ? "Mehr" : "Start"} · Schäfchen`;
    window.scrollTo({ top: 0, behavior: smooth ? "smooth" : "instant" });
  }

  function serverEntries(workDay) {
    return (workDay?.entries || []).map((entry) => ({
      id: entry.id,
      clientEntryId: entry.clientEntryId,
      clientCreatedAt: entry.clientCreatedAt,
      type: entry.entryType,
      recordedAt: entry.recordedAt,
      constructionSiteId: entry.constructionSiteId,
      siteIndex: siteIndexForId(entry.constructionSiteId),
      pendingSync: false,
      syncError: null
    }));
  }

  async function refreshLiveData() {
    if (demoMode || !navigator.onLine) return;
    const date = localDateKey();
    const pending = state.events.filter((entry) => entry.pendingSync);
    try {
      const [assignmentBody, workDayBody] = await Promise.all([
        requestJson(`./api/v1/site-assignments/${date}`),
        requestJson(`./api/v1/work-days/${date}`)
      ]);
      assignments = assignmentBody.assignments;
      const persisted = serverEntries(workDayBody.workDay);
      const knownIds = new Set(persisted.map((entry) => entry.clientEntryId));
      state = {
        version: 1,
        workDate: date,
        events: [...persisted, ...pending.filter((entry) => !knownIds.has(entry.clientEntryId))]
          .sort((left, right) => new Date(left.recordedAt) - new Date(right.recordedAt))
      };
      saveState();
      render();
    } catch (error) {
      if (error.status === 401) showLogin();
      else if (!error.network) showToast(error.message);
    }
  }

  async function enterLiveDashboard(sessionView) {
    if (cachedUserId && cachedUserId !== sessionView.user.id) {
      state = initialState();
      assignments = [];
      adminState = null;
    }
    session = sessionView;
    cachedUserId = session.user.id;
    saveState();
    if (session.user.mustChangePassword) {
      showPasswordChange();
      return;
    }
    elements.dashboardCompany.textContent = session.company.displayName;
    elements.dashboardCompanyMark.textContent = (session.company.displayName[0] || "F").toUpperCase();
    elements.companyNumber.value = session.company.number;
    elements.dashboardTitle.textContent = `Guten Morgen, ${session.user.firstName}`;
    elements.closePreview.textContent = (session.user.firstName[0] || "A").toUpperCase();
    if (!elements.assignmentDate.value) elements.assignmentDate.value = localDateKey();
    showDashboard();
    await Promise.all([refreshLiveData(), refreshAdmin()]);
    await syncPendingEntries();
  }

  async function initialiseOnline() {
    try {
      const setupBody = await requestJson("./api/v1/setup");
      elements.companyNumber.value = setupBody.setup.companyNumber;
      elements.loginCompanyName.textContent = setupBody.setup.displayName;
      elements.loginCompanyMark.textContent = (setupBody.setup.displayName[0] || "F").toUpperCase();
      if (setupBody.setup.setupRequired) {
        showSetup(setupBody.setup);
        return;
      }

      try {
        const sessionBody = await requestJson("./api/v1/session");
        await enterLiveDashboard(sessionBody.session);
      } catch (error) {
        if (error.status !== 401) elements.loginMessage.textContent = error.message;
      }
    } catch (error) {
      elements.loginMessage.textContent = error.message;
    }
  }

  elements.loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (demoMode) {
      elements.loginMessage.textContent = "Diese Adresse ist die öffentliche Demo. Bitte nutze „Vorschau öffnen“.";
      return;
    }

    elements.loginSubmit.disabled = true;
    elements.loginMessage.textContent = "Anmeldung wird geprüft …";
    try {
      const body = await requestJson("./api/v1/session", {
        method: "POST",
        body: JSON.stringify({
          companyNumber: elements.companyNumber.value,
          personnelNumber: elements.personnelNumber.value,
          password: elements.passwordInput.value
        })
      });
      elements.loginMessage.textContent = "";
      await enterLiveDashboard(body.session);
    } catch (error) {
      elements.loginMessage.textContent = error.message;
    } finally {
      elements.loginSubmit.disabled = false;
    }
  });

  elements.setupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    elements.setupSubmit.disabled = true;
    elements.setupMessage.textContent = "Admin wird sicher angelegt …";
    try {
      await requestJson("./api/v1/setup", {
        method: "POST",
        body: JSON.stringify({
          firstName: elements.setupFirstName.value,
          lastName: elements.setupLastName.value,
          personnelNumber: elements.setupPersonnelNumber.value,
          password: elements.setupPassword.value,
          setupToken: elements.setupToken.value
        })
      });
      elements.personnelNumber.value = elements.setupPersonnelNumber.value;
      elements.setupForm.reset();
      showLogin();
      elements.companyNumber.readOnly = false;
      elements.loginMessage.textContent = "Admin angelegt. Du kannst dich jetzt anmelden.";
    } catch (error) {
      elements.setupMessage.textContent = error.message;
    } finally {
      elements.setupSubmit.disabled = false;
    }
  });

  elements.passwordChangeForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (elements.newPassword.value !== elements.confirmPassword.value) {
      elements.passwordChangeMessage.textContent = "Die beiden Passwörter stimmen nicht überein.";
      return;
    }
    elements.passwordChangeSubmit.disabled = true;
    elements.passwordChangeMessage.textContent = "Passwort wird sicher gespeichert …";
    try {
      const body = await requestJson("./api/v1/account/initial-password", {
        method: "POST",
        body: JSON.stringify({ newPassword: elements.newPassword.value })
      });
      await enterLiveDashboard(body.session);
      showToast("Dein persönliches Passwort ist gespeichert.");
    } catch (error) {
      elements.passwordChangeMessage.textContent = error.message;
    } finally {
      elements.passwordChangeSubmit.disabled = false;
    }
  });

  elements.employeeForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const saved = await submitAdminForm(
      elements.employeeForm,
      elements.employeeMessage,
      "./api/v1/admin/employees",
      {
        firstName: elements.employeeFirstName.value,
        lastName: elements.employeeLastName.value,
        personnelNumber: elements.employeePersonnelNumber.value,
        role: elements.employeeRole.value,
        temporaryPassword: elements.employeeTemporaryPassword.value
      },
      "Mitarbeiter angelegt · Startpasswort sicher übergeben."
    );
    if (!saved) return;
    elements.employeeForm.reset();
    await refreshAdmin();
  });

  function updateCustomerTypeFields() {
    const privateCustomer = elements.customerType.value === "private";
    elements.customerCompanyFields.hidden = privateCustomer;
    elements.customerPrivateFields.hidden = !privateCustomer;
    elements.customerCompanyName.required = !privateCustomer;
    elements.customerFirstName.required = privateCustomer;
    elements.customerLastName.required = privateCustomer;
  }

  elements.customerType.addEventListener("change", updateCustomerTypeFields);
  updateCustomerTypeFields();

  elements.customerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const saved = await submitAdminForm(
      elements.customerForm,
      elements.customerMessage,
      "./api/v1/admin/customers",
      {
        customerType: elements.customerType.value,
        companyName: elements.customerCompanyName.value,
        firstName: elements.customerFirstName.value,
        lastName: elements.customerLastName.value,
        email: elements.customerEmail.value,
        phone: elements.customerPhone.value,
        street: elements.customerStreet.value,
        houseNumber: elements.customerHouseNumber.value,
        postalCode: elements.customerPostalCode.value,
        city: elements.customerCity.value
      },
      "Kunde angelegt · jetzt kann ein Projekt zugeordnet werden."
    );
    if (!saved) return;
    elements.customerForm.reset();
    updateCustomerTypeFields();
    await refreshAdmin();
  });

  elements.projectForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const saved = await submitAdminForm(
      elements.projectForm,
      elements.projectMessage,
      "./api/v1/admin/projects",
      {
        customerId: elements.projectCustomer.value,
        name: elements.projectName.value,
        installerShortText: elements.projectShortText.value
      },
      "Projekt angelegt · jetzt kann eine Baustelle hinzugefügt werden."
    );
    if (!saved) return;
    elements.projectForm.reset();
    await refreshAdmin();
  });

  elements.siteForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const saved = await submitAdminForm(
      elements.siteForm,
      elements.siteMessage,
      "./api/v1/admin/construction-sites",
      {
        projectId: elements.siteProject.value,
        name: elements.siteName.value,
        installerShortText: elements.siteShortText.value,
        street: elements.siteStreet.value,
        houseNumber: elements.siteHouseNumber.value,
        postalCode: elements.sitePostalCode.value,
        city: elements.siteCity.value
      },
      "Baustelle angelegt · sie kann jetzt Mitarbeitern zugewiesen werden."
    );
    if (!saved) return;
    elements.siteForm.reset();
    await refreshAdmin();
  });

  elements.assignmentForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const saved = await submitAdminForm(
      elements.assignmentForm,
      elements.assignmentMessage,
      "./api/v1/admin/assignments",
      {
        employeeId: elements.assignmentEmployee.value,
        constructionSiteId: elements.assignmentSite.value,
        workDate: elements.assignmentDate.value,
        plannedStartTime: elements.assignmentTime.value,
        comment: elements.assignmentComment.value
      },
      "Einsatz freigegeben · auf dem Mitarbeiter-Handy sichtbar."
    );
    if (!saved) return;
    elements.assignmentTime.value = "";
    elements.assignmentComment.value = "";
    await Promise.all([refreshAdmin(), refreshLiveData()]);
  });

  elements.assignmentImportFile.addEventListener("change", () => {
    selectAssignmentImportFile(elements.assignmentImportFile.files?.[0] || null);
  });

  for (const eventName of ["dragenter", "dragover"]) {
    elements.assignmentImportDropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      elements.assignmentImportDropzone.classList.add("file-drop--active");
    });
  }
  for (const eventName of ["dragleave", "drop"]) {
    elements.assignmentImportDropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      elements.assignmentImportDropzone.classList.remove("file-drop--active");
    });
  }
  elements.assignmentImportDropzone.addEventListener("drop", (event) => {
    selectAssignmentImportFile(event.dataTransfer?.files?.[0] || null);
  });

  elements.assignmentImportPreviewButton.addEventListener("click", async () => {
    if (!assignmentImportFile) return;
    elements.assignmentImportPreviewButton.disabled = true;
    elements.assignmentImportMessage.textContent = "Excel-Datei wird sicher geprüft …";
    resetAssignmentImportPreview();
    try {
      const contentBase64 = arrayBufferToBase64(await assignmentImportFile.arrayBuffer());
      assignmentImportPayload = {
        fileName: assignmentImportFile.name,
        contentBase64,
        mappings: { employees: [], sites: [] }
      };
      const body = await requestJson("./api/v1/admin/assignment-imports/preview", {
        method: "POST",
        body: JSON.stringify(assignmentImportPayload)
      });
      elements.assignmentImportMessage.textContent = "";
      renderAssignmentImportPreview(body.importPreview);
    } catch (error) {
      assignmentImportPayload = null;
      elements.assignmentImportMessage.textContent = error.message;
    } finally {
      elements.assignmentImportPreviewButton.disabled = false;
    }
  });

  elements.assignmentImportApplyMappings.addEventListener("click", async () => {
    if (!assignmentImportPayload) return;
    const mappings = {
      employees: [...(assignmentImportPayload.mappings?.employees || [])],
      sites: [...(assignmentImportPayload.mappings?.sites || [])]
    };
    let selectedCount = 0;
    elements.assignmentImportMappingFields.querySelectorAll("select").forEach((select) => {
      if (!select.value) return;
      const list = mappings[select.dataset.mappingKind];
      const sourceLabel = select.dataset.sourceLabel;
      const existingIndex = list.findIndex((mapping) => mapping.sourceLabel === sourceLabel);
      const mapping = { sourceLabel, targetId: select.value };
      if (existingIndex >= 0) list[existingIndex] = mapping;
      else list.push(mapping);
      selectedCount += 1;
    });
    if (selectedCount === 0) {
      elements.assignmentImportMessage.textContent = "Bitte mindestens eine Zuordnung auswählen.";
      return;
    }
    assignmentImportPayload = { ...assignmentImportPayload, mappings };
    elements.assignmentImportApplyMappings.disabled = true;
    elements.assignmentImportMessage.textContent = "Zuordnung wird sicher geprüft …";
    try {
      const body = await requestJson("./api/v1/admin/assignment-imports/preview", {
        method: "POST",
        body: JSON.stringify(assignmentImportPayload)
      });
      elements.assignmentImportMessage.textContent = "Zuordnung übernommen.";
      renderAssignmentImportPreview(body.importPreview);
    } catch (error) {
      elements.assignmentImportMessage.textContent = error.message;
    } finally {
      elements.assignmentImportApplyMappings.disabled = false;
    }
  });

  elements.assignmentImportConfirm.addEventListener("click", async () => {
    if (!assignmentImportPayload || !assignmentImportState?.readyCount) return;
    if (!window.confirm(
      `${assignmentImportState.readyCount} Einsätze aus Excel freigeben? Bestehende Tage bleiben unverändert.`
    )) return;
    elements.assignmentImportConfirm.disabled = true;
    elements.assignmentImportPreviewButton.disabled = true;
    elements.assignmentImportMessage.textContent = "Wochenplanung wird sicher gespeichert …";
    try {
      const body = await requestJson("./api/v1/admin/assignment-imports", {
        method: "POST",
        body: JSON.stringify(assignmentImportPayload)
      });
      const importedWeek = body.import.weekStart;
      const importedCount = body.import.importedCount;
      assignmentImportFile = null;
      elements.assignmentImportFile.value = "";
      elements.assignmentImportFileName.textContent = "oder hier ablegen · maximal 1,5 MB";
      resetAssignmentImportPreview();
      elements.assignmentImportMessage.textContent = `${importedCount} Einsätze wurden sicher importiert.`;
      showToast(`${importedCount} Excel-Einsätze sind jetzt in der Wochenplanung.`);
      await Promise.all([refreshAdmin(importedWeek), refreshLiveData()]);
    } catch (error) {
      elements.assignmentImportMessage.textContent = error.message;
      elements.assignmentImportConfirm.disabled = false;
    } finally {
      elements.assignmentImportPreviewButton.disabled = !assignmentImportFile;
    }
  });

  elements.siteImportFile.addEventListener("change", () => {
    selectSiteImportFile(elements.siteImportFile.files?.[0] || null);
  });

  for (const eventName of ["dragenter", "dragover"]) {
    elements.siteImportDropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      elements.siteImportDropzone.classList.add("file-drop--active");
    });
  }
  for (const eventName of ["dragleave", "drop"]) {
    elements.siteImportDropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      elements.siteImportDropzone.classList.remove("file-drop--active");
    });
  }
  elements.siteImportDropzone.addEventListener("drop", (event) => {
    selectSiteImportFile(event.dataTransfer?.files?.[0] || null);
  });

  elements.siteImportPreviewButton.addEventListener("click", async () => {
    if (!siteImportFile) return;
    elements.siteImportPreviewButton.disabled = true;
    elements.siteImportMessage.textContent = "Baustellenliste wird sicher geprüft …";
    resetSiteImportPreview();
    try {
      const contentBase64 = arrayBufferToBase64(await siteImportFile.arrayBuffer());
      siteImportPayload = { fileName: siteImportFile.name, contentBase64 };
      const body = await requestJson("./api/v1/admin/site-imports/preview", {
        method: "POST",
        body: JSON.stringify(siteImportPayload)
      });
      elements.siteImportMessage.textContent = "";
      renderSiteImportPreview(body.importPreview);
    } catch (error) {
      siteImportPayload = null;
      elements.siteImportMessage.textContent = error.message;
    } finally {
      elements.siteImportPreviewButton.disabled = false;
    }
  });

  elements.siteImportConfirm.addEventListener("click", async () => {
    if (!siteImportPayload || !siteImportState?.readyCount) return;
    if (!window.confirm(
      `${siteImportState.readyCount} Baustellen aus Excel anlegen? Vorhandene Namen bleiben unverändert.`
    )) return;
    elements.siteImportConfirm.disabled = true;
    elements.siteImportPreviewButton.disabled = true;
    elements.siteImportMessage.textContent = "Baustellen werden sicher angelegt …";
    try {
      const body = await requestJson("./api/v1/admin/site-imports", {
        method: "POST",
        body: JSON.stringify(siteImportPayload)
      });
      const createdCount = body.import.createdCount;
      siteImportFile = null;
      elements.siteImportFile.value = "";
      elements.siteImportFileName.textContent = "oder hier ablegen · maximal 1,5 MB";
      resetSiteImportPreview();
      elements.siteImportMessage.textContent = `${createdCount} Baustellen wurden sicher angelegt.`;
      showToast(`${createdCount} Excel-Baustellen sind jetzt verfügbar.`);
      await refreshAdmin();
    } catch (error) {
      elements.siteImportMessage.textContent = error.message;
      elements.siteImportConfirm.disabled = false;
    } finally {
      elements.siteImportPreviewButton.disabled = !siteImportFile;
    }
  });

  elements.assignmentEditForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!editingAssignmentId) return;
    const changeReason = elements.assignmentEditReason.value.trim();
    if (changeReason.length < 3) {
      elements.assignmentEditMessage.textContent = "Bitte einen kurzen Änderungsgrund eingeben.";
      return;
    }
    elements.assignmentEditSave.disabled = true;
    elements.assignmentEditCancel.disabled = true;
    elements.assignmentEditMessage.textContent = "Änderung wird sicher gespeichert …";
    try {
      const destinationDate = elements.assignmentEditDate.value;
      await requestJson(`./api/v1/admin/assignments/${encodeURIComponent(editingAssignmentId)}`, {
        method: "PATCH",
        body: JSON.stringify({
          workDate: destinationDate,
          plannedStartTime: elements.assignmentEditTime.value,
          changeReason
        })
      });
      closeAssignmentEditor();
      showToast("Einsatz verschoben · Änderung ist historisch gespeichert.");
      await Promise.all([refreshAdmin(destinationDate), refreshLiveData()]);
    } catch (error) {
      elements.assignmentEditMessage.textContent = error.message;
    } finally {
      elements.assignmentEditSave.disabled = false;
      elements.assignmentEditCancel.disabled = false;
    }
  });

  elements.assignmentEditCancel.addEventListener("click", async () => {
    if (!editingAssignmentId) return;
    const changeReason = elements.assignmentEditReason.value.trim();
    if (changeReason.length < 3) {
      elements.assignmentEditMessage.textContent = "Bitte zuerst einen Stornogrund eingeben.";
      return;
    }
    if (!window.confirm("Diesen Einsatz wirklich stornieren? Die Historie bleibt erhalten.")) return;
    elements.assignmentEditSave.disabled = true;
    elements.assignmentEditCancel.disabled = true;
    elements.assignmentEditMessage.textContent = "Einsatz wird storniert …";
    try {
      await requestJson(`./api/v1/admin/assignments/${encodeURIComponent(editingAssignmentId)}/cancel`, {
        method: "POST",
        body: JSON.stringify({ changeReason })
      });
      const selectedWeek = adminState?.weekStart || localDateKey();
      closeAssignmentEditor();
      showToast("Einsatz storniert · Historie bleibt erhalten.");
      await Promise.all([refreshAdmin(selectedWeek), refreshLiveData()]);
    } catch (error) {
      elements.assignmentEditMessage.textContent = error.message;
    } finally {
      elements.assignmentEditSave.disabled = false;
      elements.assignmentEditCancel.disabled = false;
    }
  });

  elements.assignmentEditClose.addEventListener("click", closeAssignmentEditor);
  elements.adminWeekPrevious.addEventListener("click", () => {
    void refreshAdmin(addIsoDays(adminState?.weekStart || localDateKey(), -7));
  });
  elements.adminWeekNext.addEventListener("click", () => {
    void refreshAdmin(addIsoDays(adminState?.weekStart || localDateKey(), 7));
  });

  elements.adminRefresh.addEventListener("click", () => void refreshAdmin());
  elements.assignmentDate.addEventListener("change", () => void refreshAdmin(elements.assignmentDate.value));

  elements.togglePassword.addEventListener("click", () => {
    const show = elements.passwordInput.type === "password";
    elements.passwordInput.type = show ? "text" : "password";
    elements.togglePassword.setAttribute("aria-label", show ? "Passwort verbergen" : "Passwort anzeigen");
  });

  elements.openPreview.addEventListener("click", showDashboard);
  elements.closePreview.addEventListener("click", async () => {
    if (demoMode) return showLogin();
    try {
      await requestJson("./api/v1/session", { method: "DELETE" });
      session = null;
      adminState = null;
      cachedUserId = null;
      assignments = [];
      state = initialState();
      window.localStorage.removeItem(ONLINE_STORAGE_KEY);
      showLogin();
    } catch (error) {
      showToast(error.message);
    }
  });
  elements.primaryAction.addEventListener("click", handlePrimaryAction);
  elements.secondaryAction.addEventListener("click", () => addEntry("clock_out"));
  elements.assignmentDetails.addEventListener("click", () => {
    showToast(assignments.length
      ? `${assignments.length} Einsatz${assignments.length === 1 ? "" : "e"} · Reihenfolge ist verbindlich.`
      : "Für heute ist noch keine Baustelle freigegeben.");
  });
  elements.showWeek.addEventListener("click", () => {
    showDashboardPane("week");
  });
  elements.resetDemo.addEventListener("click", () => {
    if (!demoMode || !window.confirm("Alle lokalen Demo-Buchungen auf diesem Gerät zurücksetzen?")) return;
    state = initialState();
    saveState();
    render();
    showToast("Lokale Demo wurde zurückgesetzt.");
  });

  elements.navStart.addEventListener("click", () => {
    showDashboardPane("start");
  });
  elements.navWeek.addEventListener("click", () => {
    showDashboardPane("week");
  });
  elements.navMore.addEventListener("click", () => {
    showDashboardPane("more");
  });
  elements.siteDashboardClose.addEventListener("click", () => {
    elements.siteDashboard.hidden = true;
  });

  elements.todayLabel.textContent = dateFormatter.format(new Date());
  configureModeCopy();
  updateConnectionState();
  render();
  window.setInterval(renderTimes, 15000);
  window.addEventListener("online", () => {
    updateConnectionState();
    void syncPendingEntries();
    void refreshLiveData();
  });
  window.addEventListener("offline", updateConnectionState);

  if (!demoMode) void initialiseOnline();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" })
        .then((registration) => registration.update())
        .catch(() => {
          // Die App bleibt auch ohne Service Worker als normale Website nutzbar.
        });
    });
  }
})();
