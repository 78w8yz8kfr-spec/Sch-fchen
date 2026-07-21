Warning: truncated output (original token count: 37491)
Total output lines: 3437

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
    bottomNav: document.querySelector(".bottom-nav"),
    navStart: document.querySelector("#nav-start"),
    navWeek: document.querySelector("#nav-week"),
    navAssignments: document.querySelector("#nav-assignments"),
    navSites: document.querySelector("#nav-sites"),
    navMore: document.querySelector("#nav-more"),
    infoCard: document.querySelector(".info-card"),
    adminSection: document.querySelector("#admin-section"),
    adminEyebrow: document.querySelector("#admin-eyebrow"),
    adminTitle: document.querySelector("#admin-title"),
    adminIntro: document.querySelector("#admin-intro"),
    adminSummary: document.querySelector("#admin-summary"),
    adminRefresh: document.querySelector("#admin-refresh"),
    assignmentPlanningShell: document.querySelector("#assignment-planning-shell"),
    assignmentPlanningContent: document.querySelector("#assignment-planning-content"),
    sitePlanningShell: document.querySelector("#site-planning-shell"),
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
    siteDashboardStatus: document.querySelector("#site-dashboard-status"),
    siteDashboardCustomer: document.querySelector("#site-dashboard-customer"),
    siteDashboardProject: document.querySelector("#site-dashboard-project"),
    siteDashboardOrder: document.querySelector("#site-dashboard-order"),
    siteDashboardNavigation: document.querySelector("#site-dashboard-navigation"),
    siteDashboardEmployees: document.querySelector("#site-dashboard-employees"),
    siteDashboardReportCount: document.querySelector("#site-dashboard-report-count"),
    siteDashboardReports: document.querySelector("#site-dashboard-reports"),
    siteReportDigital: document.querySelector("#site-report-digital"),
    siteReportPhoto: document.querySelector("#site-report-photo"),
    siteReportSpeech: document.querySelector("#site-report-speech"),
    siteReportPhotoInput: document.querySelector("#site-report-photo-input"),
    siteReportForm: document.querySelector("#site-report-form"),
    siteReportSourceMode: document.querySelector("#site-report-source-mode"),
    siteReportType: document.querySelector("#site-report-type"),
    siteReportDate: document.querySelector("#site-report-date"),
    siteReportSummary: document.querySelector("#site-report-summary"),
    siteReportDetails: document.querySelector("#site-report-details"),
    siteReportSourceNote: document.querySelector("#site-report-source-note"),
    siteReportSubmit: document.querySelector("#site-report-submit"),
    siteReportCancel: document.querySelector("#site-report-cancel"),
    siteReportMessage: document.querySelector("#site-report-message"),
    siteDashboardDocumentsPanel: document.querySelector("#site-dashboard-documents-panel"),
    siteDashboardDocumentCount: document.querySelector("#site-dashboard-document-count"),
    siteDashboardDocuments: document.querySelector("#site-dashboard-documents"),
    siteDashboardCaptureDeliveryNote: document.querySelector("#site-dashboard-capture-delivery-note"),
    siteDashboardDeliveryNoteInput: document.querySelector("#site-dashboard-delivery-note-input"),
    siteDashboardDeliveryNoteForm: document.querySelector("#site-dashboard-delivery-note-form"),
    siteDashboardDeliveryNoteTitle: document.querySelector("#site-dashboard-delivery-note-title"),
    siteDashboardDeliveryNoteFileName: document.querySelector("#site-dashboard-delivery-note-file-name"),
    siteDashboardDeliveryNoteSubmit: document.querySelector("#site-dashboard-delivery-note-submit"),
    siteDashboardDeliveryNoteCancel: document.querySelector("#site-dashboard-delivery-note-cancel"),
    siteDashboardDeliveryNoteMessage: document.querySelector("#site-dashboard-delivery-note-message"),
    siteDashboardAddDocument: document.querySelector("#site-dashboard-add-document"),
    siteDashboardTaskCount: document.querySelector("#site-dashboard-task-count"),
    siteDashboardTasks: document.querySelector("#site-dashboard-tasks"),
    siteTaskAdd: document.querySelector("#site-task-add"),
    siteTaskForm: document.querySelector("#site-task-form"),
    siteTaskTitle: document.querySelector("#site-task-title"),
    siteTaskDetails: document.querySelector("#site-task-details"),
    siteTaskAssignee: document.querySelector("#site-task-assignee"),
    siteTaskPriority: document.querySelector("#site-task-priority"),
    siteTaskDueDate: document.querySelector("#site-task-due-date"),
    siteTaskCancel: document.querySelector("#site-task-cancel"),
    siteTaskMessage: document.querySelector("#site-task-message"),
    siteDashboardMaterialCount: document.querySelector("#site-dashboard-material-count"),
    siteDashboardMaterials: document.querySelector("#site-dashboard-materials"),
    siteMaterialAdd: document.querySelector("#site-material-add"),
    siteMaterialForm: document.querySelector("#site-material-form"),
    siteMaterialName: document.querySelector("#site-material-name"),
    siteMaterialQuantity: document.querySelector("#site-material-quantity"),
    siteMaterialUnit: document.querySelector("#site-material-unit"),
    siteMaterialStatus: document.querySelector("#site-material-status"),
    siteMaterialNote: document.querySelector("#site-material-note"),
    siteMaterialCancel: document.querySelector("#site-material-cancel"),
    siteMaterialMessage: document.querySelector("#site-material-message"),
    siteDashboardEdit: document.querySelector("#site-dashboard-edit"),
    adminWeek: document.querySelector("#admin-week"),
    siteDashboardClose: document.querySelector("#site-dashboard-close"),
    siteEditForm: document.querySelector("#site-edit-form"),
    siteEditNumber: document.querySelector("#site-edit-number"),
    siteEditProject: document.querySelector("#site-edit-project"),
    siteEditName: document.querySelector("#site-edit-name"),
    siteEditShortText: document.querySelector("#site-edit-short-text"),
    siteEditStreet: document.querySelector("#site-edit-street"),
    siteEditHouseNumber: document.querySelector("#site-edit-house-number"),
    siteEditPostalCode: document.querySelector("#site-edit-postal-code"),
    siteEditCity: document.querySelector("#site-edit-city"),
    siteEditStatus: document.querySelector("#site-edit-status"),
    siteEditCancel: document.querySelector("#site-edit-cancel"),
    siteEditMessage: document.querySelector("#site-edit-message"),
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
    assignmentImportFile: document.querySelector("#assignment-import-file"),
    assignmentImportChoose: document.querySelector("#assignment-import-choose"),
    assignmentImportSelection: document.querySelector("#assignment-import-selection"),
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
    siteImportFile: document.querySelector("#site-import-file"),
    siteImportChoose: document.querySelector("#site-import-choose"),
    siteImportSelection: document.querySelector("#site-import-selection"),
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
    employeePanel: document.querySelector("#employee-panel"),
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
    customerManagementPanel: document.querySelector("#customer-management-panel"),
    customerSearch: document.querySelector("#customer-search"),
    customerStatusFilter: document.querySelector("#customer-status-filter"),
    customerListSummary: document.querySelector("#customer-list-summary"),
    customerList: document.querySelector("#customer-list"),
    customerEditForm: document.querySelector("#customer-edit-form"),
    customerEditNumber: document.querySelector("#customer-edit-number"),
    customerEditType: document.querySelector("#customer-edit-type"),
    customerEditCompanyFields: document.querySelector("#customer-edit-company-fields"),
    customerEditPrivateFields: document.querySelector("#customer-edit-private-fields"),
    customerEditCompanyName: document.querySelector("#customer-edit-company-name"),
    customerEditFirstName: document.querySelector("#customer-edit-first-name"),
    customerEditLastName: document.querySelector("#customer-edit-last-name"),
    customerEditEmail: document.querySelector("#customer-edit-email"),
    customerEditPhone: document.querySelector("#customer-edit-phone"),
    customerEditStreet: document.querySelector("#customer-edit-street"),
    customerEditHouseNumber: document.querySelector("#customer-edit-house-number"),
    customerEditPostalCode: document.querySelector("#customer-edit-postal-code"),
    customerEditCity: document.querySelector("#customer-edit-city"),
    customerEditStatus: document.querySelector("#customer-edit-status"),
    customerEditCancel: document.querySelector("#customer-edit-cancel"),
    customerEditMessage: document.querySelector("#customer-edit-message"),
    projectPanel: document.querySelector("#project-panel"),
    projectForm: document.querySelector("#project-form"),
    projectCustomer: document.querySelector("#project-customer"),
    projectName: document.querySelector("#project-name"),
    projectShortText: document.querySelector("#project-short-text"),
    projectMessage: document.querySelector("#project-message"),
    projectManagementPanel: document.querySelector("#project-management-panel"),
    projectSearch: document.querySelector("#project-search"),
    projectStatusFilter: document.querySelector("#project-status-filter"),
    projectListSummary: document.querySelector("#project-list-summary"),
    projectList: document.querySelector("#project-list"),
    projectEditForm: document.querySelector("#project-edit-form"),
    projectEditNumber: document.querySelector("#project-edit-number"),
    projectEditCustomer: document.querySelector("#project-edit-customer"),
    projectEditName: document.querySelector("#project-edit-name"),
    projectEditShortText: document.querySelector("#project-edit-short-text"),
    projectEditStatus: document.querySelector("#project-edit-status"),
    projectEditCancel: document.querySelector("#project-edit-cancel"),
    projectEditMessage: document.querySelector("#project-edit-message"),
    siteFormPanel: document.querySelector("#site-form-panel"),
    siteManagementPanel: document.querySelector("#site-management-panel"),
    siteForm: document.querySelector("#site-form"),
    siteProject: document.querySelector("#site-project"),
    siteName: document.querySelector("#site-name"),
    siteShortText: document.querySelector("#site-short-text"),
    siteStreet: document.querySelector("#site-street"),
    siteHouseNumber: document.querySelector("#site-house-number"),
    sitePostalCode: document.querySelector("#site-postal-code"),
    siteCity: document.querySelector("#site-city"),
    siteMessage: document.querySelector("#site-message"),
    siteSearch: document.querySelector("#site-search"),
    siteStatusFilter: document.querySelector("#site-status-filter"),
    siteListSummary: document.querySelector("#site-list-summary"),
    siteList: document.querySelector("#site-list"),
    documentManagementPanel: document.querySelector("#document-management-panel"),
    documentForm: document.querySelector("#document-form"),
    documentTitle: document.querySelector("#document-title"),
    documentCategory: document.querySelector("#document-category"),
    documentCustomer: document.querySelector("#document-customer"),
    documentProject: document.querySelector("#document-project"),
    documentSite: document.querySelector("#document-site"),
    documentFile: document.querySelector("#document-file"),
    documentFileChoose: document.querySelector("#document-file-choose"),
    documentFileName: document.querySelector("#document-file-name"),
    documentSubmit: document.querySelector("#document-submit"),
    documentMessage: document.querySelector("#document-message"),
    documentSearch: document.querySelector("#document-search"),
    documentStatusFilter: document.querySelector("#document-status-filter"),
    documentListSummary: document.querySelector("#document-list-summary"),
    documentList: document.querySelector("#document-list"),
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
    elements.assignmentPanel
  );
  elements.sitePlanningContent.append(
    elements.businessStructurePanel,
    elements.customerPanel,
    elements.customerManagementPanel,
    elements.projectPanel,
    elements.projectManagementPanel,
    elements.siteFormPanel,
    elements.siteManagementPanel,
    elements.documentManagementPanel,
    elements.siteDashboard
  );
  elements.assignmentForm.querySelector('button[type="submit"]').after(elements.assignmentImportPanel);
  elements.siteForm.querySelector('button[type="submit"]').after(elements.siteImportPanel);

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
  let openedCustomerId = null;
  let openedProjectId = null;
  let openedSiteId = null;
  let assignmentImportFile = null;
  let assignmentImportPayload = null;
  let assignmentImportState = null;
  let siteImportFile = null;
  let siteImportPayload = null;
  let siteImportState = null;
  let documentFile = null;
  let deliveryNoteFile = null;
  let reportPhotoFile = null;
  let speechRecognition = null;
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
    elements.loginFooter.textContent = `Einfach vor komplex · Version 0.19.1 ${demoMode ? "Demo" : "Online"}`;

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

  function setCompanyMark(element, displayName, logoUrl) {
    const fallback = (displayName?.[0] || "F").toUpperCase();
    const logoClass = element === elements.loginCompanyMark
      ? "company-context__mark--logo"
      : "company-brand-line__mark--logo";
    element.classList.remove(logoClass);
    element.replaceChildren();
    if (!logoUrl) {
      element.textContent = fallback;
      return;
    }

    const image = document.createElement("img");
    image.src = logoUrl;
    image.alt = "";
    image.addEventListener("error", () => {
      element.classList.remove(logoClass);
      element.textContent = fallback;
    }, { once: true });
    element.classList.add(logoClass);
    element.append(image);
  }

  function showDashboard() {
    elements.loginView.hidden = true;
    elements.passwordChangeView.hidden = true;
    elements.dashboardView.hidden = false;
    const planner = canPlan();
    elements.navAssignments.hidden = !planner;
    elements.navSites.hidden = !planner;
    elements.bottomNav.classList.toggle("bottom-nav--planner", planner);
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
    openedCustomerId = null;
    openedProjectId = null;
    openedSiteId = null;
    elements.customerEditForm.hidden = true;
    elements.projectEditForm.hidden = true;
    elements.siteDashboard.hidden = true;
    elements.siteEditForm.hidden = true;
    assignmentImportFile = null;
    elements.assignmentImportFile.value = "";
    elements.assignmentImportFileName.textContent = "Keine Datei ausgewählt";
    elements.assignmentImportSelection.hidden = true;
    resetAssignmentImportPreview();
    siteImportFile = null;
    elements.siteImportFile.value = "";
    elements.siteImportFileName.textContent = "Keine Datei ausgewählt";
    elements.siteImportSelection.hidden = true;
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
    setCompanyMark(elements.loginCompanyMark, setup.displayName, setup.logoUrl);
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
    elements.assignmentImportSelection.hidden = !file;
    const valid = Boolean(
      file
      && file.name.toLocaleLowerCase("de-DE").endsWith(".xlsx")
      && file.size > 0
      && file.size <= 1_500_000
    );
    elements.assignmentImportPreviewButton.disabled = !valid;
    if (!file) {
      elements.assignmentImportFileName.textContent = "Keine Datei ausgewählt";
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
    elements.siteImportSelection.hidden = !file;
    const valid = Boolean(
      file
      && file.name.toLocaleLowerCase("de-DE").endsWith(".xlsx")
      && file.size > 0
      && file.size <= 1_500_000
    );
    elements.siteImportPreviewButton.disabled = !valid;
    if (!file) {
      elements.siteImportFileName.textContent = "Keine Datei ausgewählt";
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

  function siteStatusGroup(status) {
    if (["completed"].includes(status)) return "completed";
    if (["archived", "cancelled"].includes(status)) return "archived";
    return "active";
  }

  function customerStatusGroup(status) {
    return status === "archived" ? "archived" : "active";
  }

  function projectStatusGroup(status) {
    if (status === "completed") return "completed";
    if (["archived", "cancelled"].includes(status)) return "archived";
    return "active";
  }

  function documentCategoryLabel(category) {
    return {
      general: "Allgemein",
      order: "Auftrag",
      plan: "Plan",
      report: "Bericht",
      delivery_note: "Lieferschein",
      invoice: "Rechnung",
      photo: "Foto"
    }[category] || category;
  }

  function documentsForEntity(entityType, entityId, includeArchived = false) {
    if (!adminState) return [];
    return adminState.documents.filter((document) => (
      (includeArchived || document.status === "active")
      && document.links.some((link) => (
        link.entityType === entityType
        && (link.customerId || link.projectId || link.constructionSiteId) === entityId
      ))
    ));
  }

  function formatFileSize(sizeBytes) {
    if (sizeBytes < 1024) return `${sizeBytes} B`;
    if (sizeBytes < 1024 * 1024) return `${Math.ceil(sizeBytes / 1024)} KB`;
    return `${(sizeBytes / 1024 / 1024).toLocaleString("de-DE", { maximumFractionDigits: 1 })} MB`;
  }

  function documentMimeType(file) {
    const extension = file?.name.split(".").at(-1)?.toLowerCase();
    return {
      pdf: "application/pdf",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
      txt: "text/plain",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    }[extension] || "";
  }

  function isDeliveryNotePhoto(file) {
    return Boolean(
      file
      && ["image/jpeg", "image/png", "image/webp"].includes(documentMimeType(file))
      && file.size > 0
      && file.size <= 5_000_000
    );
  }

  function updateDocumentFileSelection() {
    elements.documentMessage.textContent = "";
    const supported = Boolean(
      documentFile
      && documentMimeType(documentFile)
      && documentFile.size > 0
      && documentFile.size <= 5_000_000
    );
    const categoryMatches = elements.documentCategory.value !== "delivery_note"
      || isDeliveryNotePhoto(documentFile);
    elements.documentSubmit.disabled = !supported || !categoryMatches;
    if (!documentFile) {
      elements.documentFileName.textContent = "Noch keine Datei gewählt";
      return;
    }
    elements.documentFileName.textContent = `${documentFile.name} · ${formatFileSize(documentFile.size)}`;
    if (!elements.documentTitle.value.trim()) {
      elements.documentTitle.value = documentFile.name.replace(/\.[^.]+$/, "");
    }
    if (!supported) {
      elements.documentMessage.textContent = "Bitte eine unterstützte Datei mit höchstens 5 MB auswählen.";
    } else if (!categoryMatches) {
      elements.documentMessage.textContent = "Lieferscheine werden ausschließlich als JPG-, PNG- oder WebP-Foto gespeichert.";
    }
  }

  function resetDeliveryNoteCapture() {
    deliveryNoteFile = null;
    elements.siteDashboardDeliveryNoteInput.value = "";
    elements.siteDashboardDeliveryNoteForm.reset();
    elements.siteDashboardDeliveryNoteForm.hidden = true;
    elements.siteDashboardDeliveryNoteFileName.textContent = "";
    elements.siteDashboardDeliveryNoteMessage.textContent = "";
    elements.siteDashboardDeliveryNoteSubmit.disabled = false;
    elements.siteDashboardCaptureDeliveryNote.disabled = false;
  }

  function documentSearchText(document) {
    return [
      document.number,
      document.title,
      document.fileName,
      documentCategoryLabel(document.category),
      ...document.links.map((link) => link.targetName)
    ].filter(Boolean).join(" ").toLocaleLowerCase("de-DE");
  }

  function documentDownloadLink(documentItem, compact = false) {
    const link = document.createElement("a");
    link.className = compact ? "text-button document-download" : "download-link document-download";
    link.href = `./api/v1/admin/documents/${encodeURIComponent(documentItem.id)}/content`;
    link.download = documentItem.fileName;
    link.textContent = "Öffnen";
    return link;
  }

  function setDocumentTargets({ customerId = "", projectId = "", constructionSiteId = "" } = {}) {
    elements.documentCustomer.value = customerId;
    elements.documentProject.value = projectId;
    elements.documentSite.value = constructionSiteId;
  }

  function focusDocumentsForEntity(entityType, entity) {
    const targets = {
      customer: { customerId: entity.id },
      project: { customerId: entity.customerId, projectId: entity.id },
      construction_site: {
        customerId: entity.customerId,
        projectId: entity.projectId,
        constructionSiteId: entity.id
      }
    }[entityType];
    setDocumentTargets(targets);
    elements.documentSearch.value = entity.displayName || entity.name;
    renderDocumentList();
    elements.documentManagementPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderDocumentList() {
    if (!adminState) return;
    const query = elements.documentSearch.value.trim().toLocaleLowerCase("de-DE");
    const status = elements.documentStatusFilter.value;
    const documents = adminState.documents.filter((document) => (
      (status === "all" || document.status === status)
      && (!query || documentSearchText(document).includes(query))
    ));
    elements.documentListSummary.textContent = `${documents.length} von ${adminState.documents.length}`;
    elements.documentList.replaceChildren();

    if (documents.length === 0) {
      const empty = document.createElement("li");
      empty.className = "admin-list__empty";
      empty.textContent = query
        ? "Kein Dokument passt zur Suche."
        : "Noch kein Dokument in diesem Status.";
      elements.documentList.append(empty);
      return;
    }

    documents.forEach((documentItem) => {
      const item = document.createElement("li");
      const content = document.createElement("div");
      const heading = document.createElement("div");
      const title = document.createElement("strong");
      const badge = document.createElement("span");
      const meta = document.createElement("span");
      const actions = document.createElement("div");
      const statusButton = document.createElement("button");
      title.textContent = documentItem.title;
      badge.className = `site-status site-status--${documentItem.status === "active" ? "active" : "archived"}`;
      badge.textContent = documentItem.status === "active" ? documentCategoryLabel(documentItem.category) : "Archiviert";
      meta.textContent = [
        documentItem.number,
        documentItem.fileName,
        formatFileSize(documentItem.sizeBytes),
        ...documentItem.links.map((link) => link.targetName)
      ].filter(Boolean).join(" · ");
      heading.append(title, badge);
      content.append(heading, meta);
      actions.className = "document-actions";
      statusButton.type = "button";
      statusButton.className = "text-button";
      statusButton.textContent = documentItem.status === "active" ? "Archivieren" : "Aktivieren";
      statusButton.addEventListener("click", async () => {
        const nextStatus = documentItem.status === "active" ? "archived" : "active";
        if (nextStatus === "archived" && !window.confirm("Dokument archivieren? Die Datei und alle Verknüpfungen bleiben erhalten.")) return;
        statusButton.disabled = true;
        try {
          await requestJson(`./api/v1/admin/documents/${encodeURIComponent(documentItem.id)}`, {
            method: "PATCH",
            body: JSON.stringify({ status: nextStatus, rowVersion: documentItem.rowVersion })
          });
          await refreshAdmin();
          showToast(nextStatus === "active" ? "Dokument wieder aktiviert." : "Dokument archiviert.");
        } catch (error) {
          showToast(error.message);
        } finally {
          statusButton.disabled = false;
        }
      });
      actions.append(documentDownloadLink(documentItem), statusButton);
      item.append(content, actions);
      elements.documentList.append(item);
    });
  }

  function renderSiteDocuments(siteId) {
    const documents = documentsForEntity("construction_site", siteId);
    elements.siteDashboardDocumentCount.textContent = String(documents.length);
    elements.siteDashboardDocuments.replaceChildren();
    if (documents.length === 0) {
      const empty = document.createElement("li");
      empty.className = "admin-list__empty";
      empty.textContent = "Noch kein Dokument mit dieser Baustelle verknüpft.";
      elements.siteDashboardDocuments.append(empty);
      return;
    }
    documents.forEach((documentItem) => {
      const item = document.createElement("li");
      const content = document.createElement("div");
      const title = document.createElement("strong");
      const meta = document.createElement("span");
      title.textContent = documentItem.title;
      meta.textContent = `${documentCategoryLabel(documentItem.category)} · ${formatFileSize(documentItem.sizeBytes)}`;
      content.append(title, meta);
      item.append(content, documentDownloadLink(documentItem, true));
      elements.siteDashboardDocuments.append(item);
    });
  }

  function taskPriorityLabel(priority) {
    return { low: "Niedrig", normal: "Normal", high: "Dringend" }[priority] || priority;
  }

  function taskStatusLabel(status) {
    return { open: "Offen", in_progress: "In Arbeit", done: "Erledigt", archived: "Archiviert" }[status] || status;
  }

  function materialStatusLabel(status) {
    return {
      planned: "Benötigt",
      ordered: "Bestellt",
      available: "Vor Ort",
      used: "Verbraucht",
      archived: "Archiviert"
    }[status] || status;
  }

  function reportTypeLabel(type) {
    return { montage: "Montagebericht", daily: "Bautagesbericht" }[type] || type;
  }

  function reportSourceLabel(source) {
    return { digital: "Digital", photo: "Originalfoto", speech: "Diktiert" }[source] || source;
  }

  function appendSiteModuleEmpty(list, message) {
    const empty = document.createElement("li");
    empty.className = "site-module-list__empty";
    empty.textContent = message;
    list.append(empty);
  }

  function renderSiteTasks(siteId) {
    const tasks = (adminState?.siteTasks || []).filter((task) => (
      task.constructionSiteId === siteId && task.status !== "archived"
    ));
    const activeCount = tasks.filter((task) => task.status !== "done").length;
    elements.siteDashboardTaskCount.textContent = String(activeCount);
    elements.siteDashboardTasks.replaceChildren();
    if (tasks.length === 0) {
      appendSiteModuleEmpty(elements.siteDashboardTasks, "Noch keine Aufgabe für diese Baustelle.");
      return;
    }
    tasks.forEach((task) => {
      const item = document.createElement("li");
      const content = document.createElement("div");
      const heading = document.createElement("div");
      const title = document.createElement("strong");
      const badges = document.createElement("span");
      const meta = document.createElement("span");
      const action = document.createElement("button");
      const next = task.status === "open" ? "in_progress" : task.status === "in_progress" ? "done" : "open";
      title.textContent = task.title;
      badges.className = "site-module-item__badges";
      badges.append(
        Object.assign(document.createElement("small"), {
          className: `module-chip module-chip--${task.status}`,
          textContent: taskStatusLabel(task.status)
        }),
        Object.assign(document.createElement("small"), {
          className: `module-chip module-chip--priority-${task.priority}`,
          textContent: taskPriorityLabel(task.priority)
        })
      );
      heading.append(title, badges);
      meta.textContent = [
        task.assignedUserName || "Noch nicht zugewiesen",
        task.dueDate ? `fällig ${new Intl.DateTimeFormat("de-DE").format(new Date(`${task.dueDate}T12:00:00`))}` : null,
        task.details
      ].filter(Boolean).join(" · ");
      content.append(heading, meta);
      action.type = "button";
      action.className = "text-button site-module-item__action";
      action.textContent = task.status === "open" ? "Beginnen" : task.status === "in_progress" ? "Erledigt" : "Wieder öffnen";
      action.addEventListener("click", async () => {
        action.disabled = true;
        try {
          await requestJson(`./api/v1/admin/site-tasks/${encodeURIComponent(task.id)}`, {
            method: "PATCH",
            body: JSON.stringify({ status: next, rowVersion: task.rowVersion })
          });
          await refreshAdmin();
          showToast(next === "done" ? "Aufgabe erledigt." : "Aufgabenstatus aktualisiert.");
        } catch (error) {
          showToast(error.message);
        } finally {
          action.disabled = false;
        }
      });
      item.className = "site-module-item";
      item.append(content, action);
      elements.siteDashboardTasks.append(item);
    });
  }

  function renderSiteMaterials(siteId) {
    const materials = (adminState?.siteMaterials || []).filter((material) => (
      material.constructionSiteId === siteId && material.status !== "archived"
    ));
    const pendingCount = materials.filter((material) => material.status !== "used").length;
    elements.siteDashboardMaterialCount.textContent = String(pendingCount);
    elements.siteDashboardMaterials.replaceChildren();
    if (materials.length === 0) {
      appendSiteModuleEmpty(elements.siteDashboardMaterials, "Noch kein Material für diese Baustelle erfasst.");
      return;
    }
    const nextStatus = { planned: "ordered", ordered: "available", available: "used" };
    const nextLabel = { planned: "Als bestellt", ordered: "Ist vor Ort", available: "Als verbraucht" };
    materials.forEach((material) => {
      const item = document.createElement("li");
      const content = document.createElement("div");
      const heading = document.createElement("div");
      const title = document.createElement("strong");
      const badge = document.createElement("small");
      const meta = document.createElement("span");
      title.textContent = material.itemName;
      badge.className = `module-chip module-chip--material-${material.status}`;
      badge.textContent = materialStatusLabel(material.status);
      heading.append(title, badge);
      meta.textContent = [`${material.quantity} ${material.unit}`, material.note].filter(Boolean).join(" · ");
      content.append(heading, meta);
      item.className = "site-module-item";
      item.append(content);
      if (nextStatus[material.status]) {
        const action = document.createElement("button");
        action.type = "button";
        action.className = "text-button site-module-item__action";
        action.textContent = nextLabel[material.status];
        action.addEventListener("click", async () => {
          action.disabled = true;
          try {
            await requestJson(`./api/v1/admin/site-materials/${encodeURIComponent(material.id)}`, {
              method: "PATCH",
              body: JSON.stringify({ status: nextStatus[material.status], rowVersion: material.rowVersion })
            });
            await refreshAdmin();
            showToast("Materialstatus aktualisiert.");
          } catch (error) {
            showToast(error.message);
          } finally {
            action.disabled = false;
          }
        });
        item.append(action);
      }
      elements.siteDashboardMaterials.append(item);
    });
  }

  function renderSiteReports(siteId) {
    const reports = (adminState?.siteReports || []).filter((report) => report.constructionSiteId === siteId);
    elements.siteDashboardReportCount.textContent = String(reports.length);
    elements.siteDashboardReports.replaceChildren();
    if (reports.length === 0) {
      appendSiteModuleEmpty(elements.siteDashboardReports, "Noch kein Bericht für diese Baustelle.");
      return;
    }
    reports.forEach((report) => {
      const item = document.createElement("li");
      const content = document.createElement("div");
      co…7491 tokens truncated…s.filter((entry) => entry.type === "next_site").length,
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
    [elements.navStart, elements.navWeek, elements.navAssignments, elements.navSites, elements.navMore].forEach((button) => {
      const active = button === activeButton;
      button.classList.toggle("nav-item--active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
  }

  function showDashboardPane(pane, smooth = true) {
    const adminPanes = new Set(["assignments", "sites", "more"]);
    elements.dashboardPanes.forEach((element) => {
      if (element === elements.adminSection) {
        element.hidden = !canPlan() || !adminPanes.has(pane);
        return;
      }
      element.hidden = element.dataset.dashboardPane !== pane;
    });

    if (canPlan()) {
      elements.assignmentPlanningShell.hidden = pane !== "assignments";
      elements.sitePlanningShell.hidden = pane !== "sites";
      elements.employeePanel.hidden = pane !== "more";
      elements.adminSummary.hidden = pane === "more";
      const copy = {
        assignments: ["Wochen- und Personaleinsatz", "Einsatzplanung", "Einsätze manuell oder aus Excel planen."],
        sites: ["Kunden, Projekte und Baustellen", "Baustellenplanung", "Stammdaten durchsuchen, bearbeiten und eindeutig zuordnen."],
        more: ["Verwaltung", "Mehr", "Mitarbeiter und weitere Einstellungen verwalten."]
      }[pane];
      if (copy) {
        [elements.adminEyebrow.textContent, elements.adminTitle.textContent, elements.adminIntro.textContent] = copy;
      }
    }

    const activeButton = {
      week: elements.navWeek,
      assignments: elements.navAssignments,
      sites: elements.navSites,
      more: elements.navMore
    }[pane] || elements.navStart;
    activateNavigation(activeButton);
    const title = {
      week: "Woche",
      assignments: "Einsätze",
      sites: "Baustellen",
      more: "Mehr"
    }[pane] || "Start";
    document.title = `${title} · Schäfchen`;
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
    setCompanyMark(elements.dashboardCompanyMark, session.company.displayName, session.company.logoUrl);
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
      setCompanyMark(
        elements.loginCompanyMark,
        setupBody.setup.displayName,
        setupBody.setup.logoUrl
      );
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

  function updateCustomerEditTypeFields() {
    const privateCustomer = elements.customerEditType.value === "private";
    elements.customerEditCompanyFields.hidden = privateCustomer;
    elements.customerEditPrivateFields.hidden = !privateCustomer;
    elements.customerEditCompanyName.required = !privateCustomer;
    elements.customerEditFirstName.required = privateCustomer;
    elements.customerEditLastName.required = privateCustomer;
  }

  elements.customerType.addEventListener("change", updateCustomerTypeFields);
  elements.customerEditType.addEventListener("change", updateCustomerEditTypeFields);
  updateCustomerTypeFields();
  updateCustomerEditTypeFields();

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

  elements.customerSearch.addEventListener("input", renderCustomerList);
  elements.customerStatusFilter.addEventListener("change", renderCustomerList);
  elements.customerEditCancel.addEventListener("click", () => {
    openedCustomerId = null;
    elements.customerEditForm.hidden = true;
    elements.customerEditMessage.textContent = "";
  });

  elements.customerEditForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const customer = adminState?.customers.find((candidate) => candidate.id === openedCustomerId);
    if (!customer) return;
    const nextStatus = elements.customerEditStatus.value;
    if (
      customerStatusGroup(customer.status) === "active"
      && nextStatus === "archived"
      && !window.confirm("Kunde wirklich archivieren? Aktive Projekte müssen vorher abgeschlossen sein.")
    ) return;

    const submit = elements.customerEditForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    elements.customerEditMessage.textContent = "Änderungen werden sicher gespeichert …";
    try {
      await requestJson(`./api/v1/admin/customers/${encodeURIComponent(customer.id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          customerType: elements.customerEditType.value,
          companyName: elements.customerEditCompanyName.value,
          firstName: elements.customerEditFirstName.value,
          lastName: elements.customerEditLastName.value,
          email: elements.customerEditEmail.value,
          phone: elements.customerEditPhone.value,
          street: elements.customerEditStreet.value,
          houseNumber: elements.customerEditHouseNumber.value,
          postalCode: elements.customerEditPostalCode.value,
          city: elements.customerEditCity.value,
          status: nextStatus,
          rowVersion: customer.rowVersion
        })
      });
      openedCustomerId = null;
      elements.customerEditForm.hidden = true;
      await refreshAdmin();
      showToast("Kunde aktualisiert.");
    } catch (error) {
      elements.customerEditMessage.textContent = error.message;
    } finally {
      submit.disabled = false;
    }
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

  elements.projectSearch.addEventListener("input", renderProjectList);
  elements.projectStatusFilter.addEventListener("change", renderProjectList);
  elements.projectEditCancel.addEventListener("click", () => {
    openedProjectId = null;
    elements.projectEditForm.hidden = true;
    elements.projectEditMessage.textContent = "";
  });

  elements.projectEditForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const project = adminState?.projects.find((candidate) => candidate.id === openedProjectId);
    if (!project) return;
    const nextStatus = elements.projectEditStatus.value;
    if (
      projectStatusGroup(project.status) === "active"
      && ["completed", "archived"].includes(nextStatus)
      && !window.confirm(
        nextStatus === "completed"
          ? "Projekt wirklich abschließen? Aktive Baustellen müssen vorher abgeschlossen sein."
          : "Projekt wirklich archivieren? Aktive Baustellen müssen vorher abgeschlossen sein."
      )
    ) return;

    const submit = elements.projectEditForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    elements.projectEditMessage.textContent = "Änderungen werden sicher gespeichert …";
    try {
      await requestJson(`./api/v1/admin/projects/${encodeURIComponent(project.id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: elements.projectEditName.value,
          installerShortText: elements.projectEditShortText.value,
          status: nextStatus,
          rowVersion: project.rowVersion
        })
      });
      openedProjectId = null;
      elements.projectEditForm.hidden = true;
      await refreshAdmin();
      showToast("Projekt aktualisiert.");
    } catch (error) {
      elements.projectEditMessage.textContent = error.message;
    } finally {
      submit.disabled = false;
    }
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

  elements.siteEditForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const site = adminState?.sites.find((candidate) => candidate.id === openedSiteId);
    if (!site) return;
    const nextStatus = elements.siteEditStatus.value;
    if (
      nextStatus !== "active"
      && siteStatusGroup(site.status) === "active"
      && !window.confirm(
        nextStatus === "completed"
          ? "Baustelle wirklich als abgeschlossen markieren?"
          : "Baustelle wirklich archivieren? Sie kann später wieder aktiviert werden."
      )
    ) return;

    const submit = elements.siteEditForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    elements.siteEditMessage.textContent = "Änderungen werden sicher gespeichert …";
    try {
      await requestJson(`./api/v1/admin/construction-sites/${encodeURIComponent(site.id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: elements.siteEditName.value,
          installerShortText: elements.siteEditShortText.value,
          street: elements.siteEditStreet.value,
          houseNumber: elements.siteEditHouseNumber.value,
          postalCode: elements.siteEditPostalCode.value,
          city: elements.siteEditCity.value,
          status: nextStatus,
          rowVersion: site.rowVersion
        })
      });
      await refreshAdmin();
      const updated = adminState.sites.find((candidate) => candidate.id === site.id);
      if (updated) openSiteDashboard(updated);
      showToast("Baustelle aktualisiert.");
    } catch (error) {
      elements.siteEditMessage.textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  });

  elements.documentSearch.addEventListener("input", renderDocumentList);
  elements.documentStatusFilter.addEventListener("change", renderDocumentList);
  elements.documentFileChoose.addEventListener("click", () => elements.documentFile.click());
  elements.documentFile.addEventListener("change", () => {
    documentFile = elements.documentFile.files?.[0] || null;
    updateDocumentFileSelection();
  });
  elements.documentCategory.addEventListener("change", updateDocumentFileSelection);

  elements.documentProject.addEventListener("change", () => {
    const project = adminState?.projects.find((candidate) => candidate.id === elements.documentProject.value);
    if (!project) return;
    elements.documentCustomer.value = project.customerId;
    const selectedSite = adminState.sites.find((site) => site.id === elements.documentSite.value);
    if (selectedSite && selectedSite.projectId !== project.id) elements.documentSite.value = "";
  });
  elements.documentSite.addEventListener("change", () => {
    const site = adminState?.sites.find((candidate) => candidate.id === elements.documentSite.value);
    if (!site) return;
    elements.documentProject.value = site.projectId;
    elements.documentCustomer.value = site.customerId;
  });
  elements.documentCustomer.addEventListener("change", () => {
    const project = adminState?.projects.find((candidate) => candidate.id === elements.documentProject.value);
    if (project && project.customerId !== elements.documentCustomer.value) {
      elements.documentProject.value = "";
      elements.documentSite.value = "";
    }
  });

  elements.documentForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!documentFile) {
      elements.documentMessage.textContent = "Bitte zuerst eine Datei auswählen.";
      return;
    }
    if (!elements.documentCustomer.value && !elements.documentProject.value && !elements.documentSite.value) {
      elements.documentMessage.textContent = "Bitte mindestens einen Kunden, ein Projekt oder eine Baustelle auswählen.";
      return;
    }
    elements.documentSubmit.disabled = true;
    elements.documentFileChoose.disabled = true;
    elements.documentMessage.textContent = "Dokument wird einmalig und sicher gespeichert …";
    try {
      const mimeType = documentMimeType(documentFile);
      const body = await requestJson("./api/v1/admin/documents", {
        method: "POST",
        body: JSON.stringify({
          title: elements.documentTitle.value,
          category: elements.documentCategory.value,
          fileName: documentFile.name,
          mimeType,
          contentBase64: arrayBufferToBase64(await documentFile.arrayBuffer()),
          customerId: elements.documentCustomer.value,
          projectId: elements.documentProject.value,
          constructionSiteId: elements.documentSite.value
        })
      });
      const reused = body.reused;
      documentFile = null;
      elements.documentFile.value = "";
      elements.documentForm.reset();
      elements.documentFileName.textContent = "Noch keine Datei gewählt";
      elements.documentSearch.value = "";
      elements.documentStatusFilter.value = "active";
      elements.documentMessage.textContent = "";
      await refreshAdmin();
      showToast(reused
        ? "Datei war bereits vorhanden und wurde ohne Kopie neu verknüpft."
        : "Dokument gespeichert und zentral verknüpft.");
    } catch (error) {
      elements.documentMessage.textContent = error.message;
    } finally {
      elements.documentFileChoose.disabled = false;
      elements.documentSubmit.disabled = !documentFile;
    }
  });

  elements.siteDashboardAddDocument.addEventListener("click", () => {
    const site = adminState?.sites.find((candidate) => candidate.id === openedSiteId);
    if (!site) return;
    elements.documentSearch.value = "";
    setDocumentTargets({ customerId: site.customerId, projectId: site.projectId, constructionSiteId: site.id });
    renderDocumentList();
    elements.documentManagementPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    elements.documentTitle.focus({ preventScroll: true });
  });

  elements.siteDashboardCaptureDeliveryNote.addEventListener("click", () => {
    elements.siteDashboardDeliveryNoteInput.click();
  });

  elements.siteDashboardDeliveryNoteInput.addEventListener("change", () => {
    deliveryNoteFile = elements.siteDashboardDeliveryNoteInput.files?.[0] || null;
    if (!deliveryNoteFile) {
      resetDeliveryNoteCapture();
      return;
    }

    const site = adminState?.sites.find((candidate) => candidate.id === openedSiteId);
    elements.siteDashboardDeliveryNoteForm.hidden = false;
    elements.siteDashboardDeliveryNoteFileName.textContent = `${deliveryNoteFile.name} · ${formatFileSize(deliveryNoteFile.size)}`;
    elements.siteDashboardDeliveryNoteTitle.value = `Lieferschein · ${site?.name || "Baustelle"} · ${new Intl.DateTimeFormat("de-DE").format(new Date())}`;
    const valid = isDeliveryNotePhoto(deliveryNoteFile);
    elements.siteDashboardDeliveryNoteSubmit.disabled = !valid;
    elements.siteDashboardDeliveryNoteMessage.textContent = valid
      ? "Das Foto wird einmal gespeichert und direkt mit dieser Baustelle verknüpft."
      : "Bitte ein JPG-, PNG- oder WebP-Foto mit höchstens 5 MB auswählen.";
    elements.siteDashboardDeliveryNoteTitle.focus({ preventScroll: true });
  });

  elements.siteDashboardDeliveryNoteCancel.addEventListener("click", resetDeliveryNoteCapture);

  elements.siteDashboardDeliveryNoteForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const site = adminState?.sites.find((candidate) => candidate.id === openedSiteId);
    if (!site || !isDeliveryNotePhoto(deliveryNoteFile)) {
      elements.siteDashboardDeliveryNoteMessage.textContent = "Bitte ein gültiges Lieferschein-Foto auswählen.";
      return;
    }

    elements.siteDashboardDeliveryNoteSubmit.disabled = true;
    elements.siteDashboardCaptureDeliveryNote.disabled = true;
    elements.siteDashboardDeliveryNoteMessage.textContent = "Lieferschein wird sicher gespeichert …";
    try {
      const body = await requestJson("./api/v1/admin/documents", {
        method: "POST",
        body: JSON.stringify({
          title: elements.siteDashboardDeliveryNoteTitle.value,
          category: "delivery_note",
          fileName: deliveryNoteFile.name,
          mimeType: documentMimeType(deliveryNoteFile),
          contentBase64: arrayBufferToBase64(await deliveryNoteFile.arrayBuffer()),
          constructionSiteId: site.id
        })
      });
      resetDeliveryNoteCapture();
      await refreshAdmin();
      renderSiteDocuments(site.id);
      showToast(body.reused
        ? "Lieferschein war bereits gespeichert und wurde ohne Kopie verknüpft."
        : "Lieferschein gespeichert und mit der Baustelle verknüpft.");
    } catch (error) {
      elements.siteDashboardDeliveryNoteMessage.textContent = error.message;
      elements.siteDashboardDeliveryNoteSubmit.disabled = false;
      elements.siteDashboardCaptureDeliveryNote.disabled = false;
    }
  });

  elements.siteTaskAdd.addEventListener("click", () => {
    resetSiteTaskForm();
    elements.siteTaskForm.hidden = false;
    elements.siteTaskTitle.focus({ preventScroll: true });
  });
  elements.siteTaskCancel.addEventListener("click", resetSiteTaskForm);
  elements.siteTaskForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const site = adminState?.sites.find((candidate) => candidate.id === openedSiteId);
    if (!site) return;
    const submit = elements.siteTaskForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    elements.siteTaskMessage.textContent = "Aufgabe wird gespeichert …";
    try {
      await requestJson("./api/v1/admin/site-tasks", {
        method: "POST",
        body: JSON.stringify({
          constructionSiteId: site.id,
          title: elements.siteTaskTitle.value,
          details: elements.siteTaskDetails.value,
          assignedUserId: elements.siteTaskAssignee.value,
          priority: elements.siteTaskPriority.value,
          dueDate: elements.siteTaskDueDate.value
        })
      });
      resetSiteTaskForm();
      await refreshAdmin();
      showToast("Aufgabe für die Baustelle gespeichert.");
    } catch (error) {
      elements.siteTaskMessage.textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  });

  elements.siteMaterialAdd.addEventListener("click", () => {
    resetSiteMaterialForm();
    elements.siteMaterialForm.hidden = false;
    elements.siteMaterialName.focus({ preventScroll: true });
  });
  elements.siteMaterialCancel.addEventListener("click", resetSiteMaterialForm);
  elements.siteMaterialForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const site = adminState?.sites.find((candidate) => candidate.id === openedSiteId);
    if (!site) return;
    const submit = elements.siteMaterialForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    elements.siteMaterialMessage.textContent = "Material wird gespeichert …";
    try {
      await requestJson("./api/v1/admin/site-materials", {
        method: "POST",
        body: JSON.stringify({
          constructionSiteId: site.id,
          itemName: elements.siteMaterialName.value,
          quantity: Number(elements.siteMaterialQuantity.value),
          unit: elements.siteMaterialUnit.value,
          status: elements.siteMaterialStatus.value,
          note: elements.siteMaterialNote.value
        })
      });
      resetSiteMaterialForm();
      await refreshAdmin();
      showToast("Material für die Baustelle gespeichert.");
    } catch (error) {
      elements.siteMaterialMessage.textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  });

  elements.siteReportDigital.addEventListener("click", () => openSiteReportForm("digital"));
  elements.siteReportPhoto.addEventListener("click", () => elements.siteReportPhotoInput.click());
  elements.siteReportPhotoInput.addEventListener("change", () => {
    const file = elements.siteReportPhotoInput.files?.[0] || null;
    if (!file) return;
    if (!isDeliveryNotePhoto(file)) {
      openSiteReportForm("photo");
      elements.siteReportMessage.textContent = "Bitte ein JPG-, PNG- oder WebP-Foto mit höchstens 5 MB auswählen.";
      elements.siteReportSubmit.disabled = true;
      return;
    }
    const site = adminState?.sites.find((candidate) => candidate.id === openedSiteId);
    openSiteReportForm("photo", file);
    elements.siteReportSummary.value = `Papierbericht · ${site?.name || "Baustelle"} · ${new Intl.DateTimeFormat("de-DE").format(new Date())}`;
    elements.siteReportSourceNote.textContent = `${file.name} · ${formatFileSize(file.size)} · Das Originalfoto bleibt unverändert erhalten.`;
  });
  elements.siteReportSpeech.addEventListener("click", () => {
    openSiteReportForm("speech");
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      elements.siteReportMessage.textContent = "Dieser Browser unterstützt kein Diktat. Der Bericht kann hier trotzdem direkt eingetippt werden.";
      elements.siteReportDetails.focus({ preventScroll: true });
      return;
    }
    const recognition = new Recognition();
    speechRecognition = recognition;
    recognition.lang = "de-DE";
    recognition.interimResults = false;
    recognition.continuous = true;
    recognition.onresult = (event) => {
      const transcript = [...event.results]
        .slice(event.resultIndex)
        .map((result) => result[0]?.transcript || "")
        .join(" ")
        .trim();
      if (transcript) {
        elements.siteReportDetails.value = `${elements.siteReportDetails.value.trim()} ${transcript}`.trim();
      }
    };
    recognition.onerror = () => {
      elements.siteReportMessage.textContent = "Das Diktat wurde unterbrochen. Der bisherige Text kann geprüft und ergänzt werden.";
    };
    recognition.onend = () => {
      if (speechRecognition === recognition) {
        speechRecognition = null;
        if (!elements.siteReportMessage.textContent) elements.siteReportMessage.textContent = "Diktat beendet. Bitte den Text vor dem Speichern prüfen.";
      }
    };
    elements.siteReportMessage.textContent = "Ich höre zu … zum Beenden erneut „Bericht diktieren“ antippen oder den Bericht speichern.";
    try {
      recognition.start();
    } catch {
      speechRecognition = null;
      elements.siteReportMessage.textContent = "Das Diktat konnte nicht gestartet werden. Der Bericht kann direkt eingetippt werden.";
    }
  });
  elements.siteReportCancel.addEventListener("click", resetSiteReportForm);
  elements.siteReportForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const site = adminState?.sites.find((candidate) => candidate.id === openedSiteId);
    const sourceMode = elements.siteReportSourceMode.value;
    if (!site) return;
    if (sourceMode === "photo" && !isDeliveryNotePhoto(reportPhotoFile)) {
      elements.siteReportMessage.textContent = "Bitte zuerst ein gültiges Originalfoto auswählen.";
      return;
    }
    if (speechRecognition) {
      speechRecognition.stop();
      speechRecognition = null;
    }
    elements.siteReportSubmit.disabled = true;
    elements.siteReportMessage.textContent = sourceMode === "photo"
      ? "Originalfoto und Bericht werden gespeichert …"
      : "Bericht wird gespeichert …";
    try {
      let sourceDocumentId = null;
      if (sourceMode === "photo") {
        const uploaded = await requestJson("./api/v1/admin/documents", {
          method: "POST",
          body: JSON.stringify({
            title: elements.siteReportSummary.value,
            category: "report",
            fileName: reportPhotoFile.name,
            mimeType: documentMimeType(reportPhotoFile),
            contentBase64: arrayBufferToBase64(await reportPhotoFile.arrayBuffer()),
            constructionSiteId: site.id
          })
        });
        sourceDocumentId = uploaded.document.id;
      }
      await requestJson("./api/v1/admin/site-reports", {
        method: "POST",
        body: JSON.stringify({
          constructionSiteId: site.id,
          reportType: elements.siteReportType.value,
          workDate: elements.siteReportDate.value,
          sourceMode,
          summary: elements.siteReportSummary.value,
          details: elements.siteReportDetails.value,
          sourceDocumentId
        })
      });
      resetSiteReportForm();
      await refreshAdmin();
      showToast("Bericht gespeichert und der Baustelle zugeordnet.");
    } catch (error) {
      elements.siteReportMessage.textContent = error.message;
      elements.siteReportSubmit.disabled = false;
    }
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
  elements.assignmentImportChoose.addEventListener("click", () => elements.assignmentImportFile.click());

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
      elements.assignmentImportFileName.textContent = "Keine Datei ausgewählt";
      elements.assignmentImportSelection.hidden = true;
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
  elements.siteImportChoose.addEventListener("click", () => elements.siteImportFile.click());

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
      elements.siteImportFileName.textContent = "Keine Datei ausgewählt";
      elements.siteImportSelection.hidden = true;
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
  elements.navAssignments.addEventListener("click", () => {
    showDashboardPane("assignments");
  });
  elements.navSites.addEventListener("click", () => {
    showDashboardPane("sites");
  });
  elements.navMore.addEventListener("click", () => {
    showDashboardPane("more");
  });
  elements.siteDashboardClose.addEventListener("click", () => {
    resetSiteReportForm();
    resetSiteTaskForm();
    resetSiteMaterialForm();
    openedSiteId = null;
    elements.siteEditForm.hidden = true;
    elements.siteDashboard.hidden = true;
  });
  elements.siteDashboardEdit.addEventListener("click", openSiteEditor);
  elements.siteEditCancel.addEventListener("click", () => {
    elements.siteEditForm.hidden = true;
    elements.siteDashboardEdit.hidden = false;
    elements.siteEditMessage.textContent = "";
  });
  elements.siteSearch.addEventListener("input", renderSiteList);
  elements.siteStatusFilter.addEventListener("change", renderSiteList);

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
