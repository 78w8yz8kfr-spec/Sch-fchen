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
      constructionSite: {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Demo · Musterstraße 12",
        shortText: "Verteilung erneuern"
      }
    },
    {
      sequenceNumber: 2,
      plannedStartTime: null,
      constructionSite: {
        id: "22222222-2222-4222-8222-222222222222",
        name: "Demo · Hafenweg 4",
        shortText: "Beleuchtung prüfen"
      }
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
    mobileReportCard: document.querySelector("#mobile-report-card"),
    mobileReportForm: document.querySelector("#mobile-report-form"),
    mobileReportEyebrow: document.querySelector("#mobile-report-eyebrow"),
    mobileReportBadge: document.querySelector("#mobile-report-badge"),
    mobileReportSite: document.querySelector("#mobile-report-site"),
    mobileReportType: document.querySelector("#mobile-report-type"),
    mobileReportPersonnelList: document.querySelector("#mobile-report-personnel-list"),
    mobileReportPersonnelTotal: document.querySelector("#mobile-report-personnel-total"),
    mobileReportSummary: document.querySelector("#mobile-report-summary"),
    mobileReportDetails: document.querySelector("#mobile-report-details"),
    mobileReportObstructions: document.querySelector("#mobile-report-obstructions"),
    mobileReportOpenItems: document.querySelector("#mobile-report-open-items"),
    mobileReportWeatherField: document.querySelector("#mobile-report-weather-field"),
    mobileReportWeather: document.querySelector("#mobile-report-weather"),
    mobileReportMaterials: document.querySelector("#mobile-report-materials"),
    mobileReportAgreements: document.querySelector("#mobile-report-agreements"),
    mobileReportIncidents: document.querySelector("#mobile-report-incidents"),
    mobileReportCheck: document.querySelector("#mobile-report-check"),
    mobileReportSubmit: document.querySelector("#mobile-report-submit"),
    mobileReportMessage: document.querySelector("#mobile-report-message"),
    employeeSiteWorkspace: document.querySelector("#employee-site-workspace"),
    employeeSiteBack: document.querySelector("#employee-site-back"),
    employeeSiteTitle: document.querySelector("#employee-site-title"),
    employeeSiteMeta: document.querySelector("#employee-site-meta"),
    employeeSiteStatus: document.querySelector("#employee-site-status"),
    employeeSiteOrder: document.querySelector("#employee-site-order"),
    employeeSiteContext: document.querySelector("#employee-site-context"),
    employeeSiteNavigation: document.querySelector("#employee-site-navigation"),
    employeeSiteTeamCount: document.querySelector("#employee-site-team-count"),
    employeeSiteTeam: document.querySelector("#employee-site-team"),
    employeeSiteTaskCount: document.querySelector("#employee-site-task-count"),
    employeeSiteTasks: document.querySelector("#employee-site-tasks"),
    employeeSiteNoteCount: document.querySelector("#employee-site-note-count"),
    employeeSiteNotes: document.querySelector("#employee-site-notes"),
    employeeSiteNoteAdd: document.querySelector("#employee-site-note-add"),
    employeeSiteNoteForm: document.querySelector("#employee-site-note-form"),
    employeeSiteNoteContent: document.querySelector("#employee-site-note-content"),
    employeeSiteNoteImportant: document.querySelector("#employee-site-note-important"),
    employeeSiteNoteCancel: document.querySelector("#employee-site-note-cancel"),
    employeeSiteNoteMessage: document.querySelector("#employee-site-note-message"),
    employeeSiteReportCount: document.querySelector("#employee-site-report-count"),
    employeeSiteReports: document.querySelector("#employee-site-reports"),
    employeeSiteDocumentCount: document.querySelector("#employee-site-document-count"),
    employeeSiteDocuments: document.querySelector("#employee-site-documents"),
    employeeSitePhotoCount: document.querySelector("#employee-site-photo-count"),
    employeeSitePhotoAdd: document.querySelector("#employee-site-photo-add"),
    employeeSitePhotoInput: document.querySelector("#employee-site-photo-input"),
    employeeSitePhotoMessage: document.querySelector("#employee-site-photo-message"),
    employeeSitePhotos: document.querySelector("#employee-site-photos"),
    employeeSiteMaterialCount: document.querySelector("#employee-site-material-count"),
    employeeSiteMaterials: document.querySelector("#employee-site-materials"),
    connectionState: document.querySelector("#connection-state"),
    todayLabel: document.querySelector("#today-label"),
    weekStrip: document.querySelector("#week-strip"),
    weekPeriod: document.querySelector("#week-period"),
    weekPrevious: document.querySelector("#week-previous"),
    weekCurrent: document.querySelector("#week-current"),
    weekNext: document.querySelector("#week-next"),
    weekTotalWork: document.querySelector("#week-total-work"),
    weekTotalBreak: document.querySelector("#week-total-break"),
    weekTotalTravel: document.querySelector("#week-total-travel"),
    weekTotalOvertime: document.querySelector("#week-total-overtime"),
    weekMessage: document.querySelector("#week-message"),
    weekTimesheetList: document.querySelector("#week-timesheet-list"),
    employeeTimesheetExportPanel: document.querySelector("#employee-timesheet-export-panel"),
    employeeTimesheetExportSummary: document.querySelector("#employee-timesheet-export-summary"),
    employeeTimesheetExportForm: document.querySelector("#employee-timesheet-export-form"),
    employeeTimesheetExportFrom: document.querySelector("#employee-timesheet-export-from"),
    employeeTimesheetExportTo: document.querySelector("#employee-timesheet-export-to"),
    employeeTimesheetExportPdfSubmit: document.querySelector("#employee-timesheet-export-pdf-submit"),
    employeeTimesheetExportSubmit: document.querySelector("#employee-timesheet-export-submit"),
    employeeTimesheetExportMessage: document.querySelector("#employee-timesheet-export-message"),
    workDayReviewPanel: document.querySelector("#work-day-review-panel"),
    workDayReviewCount: document.querySelector("#work-day-review-count"),
    workDayReviewList: document.querySelector("#work-day-review-list"),
    timesheetExportPanel: document.querySelector("#timesheet-export-panel"),
    timesheetExportForm: document.querySelector("#timesheet-export-form"),
    timesheetExportFrom: document.querySelector("#timesheet-export-from"),
    timesheetExportTo: document.querySelector("#timesheet-export-to"),
    timesheetExportEmployee: document.querySelector("#timesheet-export-employee"),
    timesheetExportStatus: document.querySelector("#timesheet-export-status"),
    timesheetExportPdfSubmit: document.querySelector("#timesheet-export-pdf-submit"),
    timesheetExportSubmit: document.querySelector("#timesheet-export-submit"),
    timesheetExportMessage: document.querySelector("#timesheet-export-message"),
    assignmentCard: document.querySelector("#assignment-card"),
    assignmentOrder: document.querySelector("#assignment-order"),
    assignmentTitle: document.querySelector("#assignment-title"),
    assignmentMeta: document.querySelector("#assignment-meta"),
    assignmentQuickActions: document.querySelector("#assignment-quick-actions"),
    assignmentNavigation: document.querySelector("#assignment-navigation"),
    assignmentDetails: document.querySelector("#assignment-details"),
    assignmentDetailsLabel: document.querySelector("#assignment-details-label"),
    assignmentReport: document.querySelector("#assignment-report"),
    siteChoiceOpen: document.querySelector("#site-choice-open"),
    liveDuration: document.querySelector("#live-duration"),
    grossTime: document.querySelector("#gross-time"),
    breakTime: document.querySelector("#break-time"),
    workTime: document.querySelector("#work-time"),
    travelTime: document.querySelector("#travel-time"),
    entryList: document.querySelector("#entry-list"),
    timeCorrectionDialog: document.querySelector("#time-correction-dialog"),
    timeCorrectionForm: document.querySelector("#time-correction-form"),
    timeCorrectionTitle: document.querySelector("#time-correction-title"),
    timeCorrectionOriginal: document.querySelector("#time-correction-original"),
    timeCorrectionAt: document.querySelector("#time-correction-at"),
    timeCorrectionReason: document.querySelector("#time-correction-reason"),
    timeCorrectionSubmit: document.querySelector("#time-correction-submit"),
    timeInvalidationSubmit: document.querySelector("#time-invalidation-submit"),
    timeCorrectionCancel: document.querySelector("#time-correction-cancel"),
    timeCorrectionMessage: document.querySelector("#time-correction-message"),
    timeAdditionDialog: document.querySelector("#time-addition-dialog"),
    timeAdditionForm: document.querySelector("#time-addition-form"),
    timeAdditionDate: document.querySelector("#time-addition-date"),
    timeAdditionType: document.querySelector("#time-addition-type"),
    timeAdditionAt: document.querySelector("#time-addition-at"),
    timeAdditionSiteField: document.querySelector("#time-addition-site-field"),
    timeAdditionSite: document.querySelector("#time-addition-site"),
    timeAdditionReason: document.querySelector("#time-addition-reason"),
    timeAdditionSubmit: document.querySelector("#time-addition-submit"),
    timeAdditionCancel: document.querySelector("#time-addition-cancel"),
    timeAdditionMessage: document.querySelector("#time-addition-message"),
    siteChoiceDialog: document.querySelector("#site-choice-dialog"),
    siteChoiceCancel: document.querySelector("#site-choice-cancel"),
    siteChoiceSuggestion: document.querySelector("#site-choice-suggestion"),
    siteChoiceForm: document.querySelector("#site-choice-form"),
    siteChoiceSelect: document.querySelector("#site-choice-select"),
    siteChoiceSubmit: document.querySelector("#site-choice-submit"),
    fieldSiteForm: document.querySelector("#field-site-form"),
    fieldSiteCustomer: document.querySelector("#field-site-customer"),
    fieldSiteNewCustomer: document.querySelector("#field-site-new-customer"),
    fieldSiteCustomerName: document.querySelector("#field-site-customer-name"),
    fieldSiteProject: document.querySelector("#field-site-project"),
    fieldSiteNewProject: document.querySelector("#field-site-new-project"),
    fieldSiteProjectName: document.querySelector("#field-site-project-name"),
    fieldSiteName: document.querySelector("#field-site-name"),
    fieldSiteShortText: document.querySelector("#field-site-short-text"),
    fieldSiteStreet: document.querySelector("#field-site-street"),
    fieldSiteHouseNumber: document.querySelector("#field-site-house-number"),
    fieldSitePostalCode: document.querySelector("#field-site-postal-code"),
    fieldSiteCity: document.querySelector("#field-site-city"),
    fieldSiteSubmit: document.querySelector("#field-site-submit"),
    siteChoiceMessage: document.querySelector("#site-choice-message"),
    timesheetSection: document.querySelector("#timesheet-section"),
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
    hierarchySearch: document.querySelector("#hierarchy-search"),
    hierarchyStatusFilter: document.querySelector("#hierarchy-status-filter"),
    hierarchyNewCustomer: document.querySelector("#hierarchy-new-customer"),
    hierarchyNewProject: document.querySelector("#hierarchy-new-project"),
    hierarchyNewSite: document.querySelector("#hierarchy-new-site"),
    siteMasterDataTools: document.querySelector("#site-master-data-tools"),
    siteDashboard: document.querySelector("#site-dashboard"),
    siteDashboardTitle: document.querySelector("#site-dashboard-title"),
    siteDashboardMeta: document.querySelector("#site-dashboard-meta"),
    siteDashboardStatus: document.querySelector("#site-dashboard-status"),
    siteDashboardCustomer: document.querySelector("#site-dashboard-customer"),
    siteDashboardProject: document.querySelector("#site-dashboard-project"),
    siteDashboardOrder: document.querySelector("#site-dashboard-order"),
    siteDashboardNavigation: document.querySelector("#site-dashboard-navigation"),
    siteDashboardEmployees: document.querySelector("#site-dashboard-employees"),
    siteDashboardPlanAssignment: document.querySelector("#site-dashboard-plan-assignment"),
    siteDashboardCreateReport: document.querySelector("#site-dashboard-create-report"),
    siteDashboardAddDocumentShortcut: document.querySelector("#site-dashboard-add-document-shortcut"),
    siteDashboardCreateTask: document.querySelector("#site-dashboard-create-task"),
    siteDashboardReportsPanel: document.querySelector("#site-dashboard-reports-panel"),
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
    siteReportPersonnelList: document.querySelector("#site-report-personnel-list"),
    siteReportPersonnelTotal: document.querySelector("#site-report-personnel-total"),
    siteReportSummary: document.querySelector("#site-report-summary"),
    siteReportDetails: document.querySelector("#site-report-details"),
    siteReportObstructions: document.querySelector("#site-report-obstructions"),
    siteReportOpenItems: document.querySelector("#site-report-open-items"),
    siteReportWeather: document.querySelector("#site-report-weather"),
    siteReportMaterials: document.querySelector("#site-report-materials"),
    siteReportAgreements: document.querySelector("#site-report-agreements"),
    siteReportIncidents: document.querySelector("#site-report-incidents"),
    siteReportSourceNote: document.querySelector("#site-report-source-note"),
    siteReportSubmit: document.querySelector("#site-report-submit"),
    siteReportCancel: document.querySelector("#site-report-cancel"),
    siteReportMessage: document.querySelector("#site-report-message"),
    siteReportFinalizeForm: document.querySelector("#site-report-finalize-form"),
    siteReportFinalizeNumber: document.querySelector("#site-report-finalize-number"),
    siteReportEmployeeSignatureName: document.querySelector("#site-report-employee-signature-name"),
    siteReportEmployeeSignature: document.querySelector("#site-report-employee-signature"),
    siteReportEmployeeSignatureClear: document.querySelector("#site-report-employee-signature-clear"),
    siteReportCustomerSignatureName: document.querySelector("#site-report-customer-signature-name"),
    siteReportCustomerSignature: document.querySelector("#site-report-customer-signature"),
    siteReportCustomerSignatureClear: document.querySelector("#site-report-customer-signature-clear"),
    siteReportFinalizeSubmit: document.querySelector("#site-report-finalize-submit"),
    siteReportFinalizeCancel: document.querySelector("#site-report-finalize-cancel"),
    siteReportFinalizeMessage: document.querySelector("#site-report-finalize-message"),
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
    siteDashboardTasksPanel: document.querySelector("#site-dashboard-tasks-panel"),
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
    siteDashboardNoteCount: document.querySelector("#site-dashboard-note-count"),
    siteDashboardNotes: document.querySelector("#site-dashboard-notes"),
    siteNoteAdd: document.querySelector("#site-note-add"),
    siteNoteForm: document.querySelector("#site-note-form"),
    siteNoteContent: document.querySelector("#site-note-content"),
    siteNoteImportant: document.querySelector("#site-note-important"),
    siteNoteCancel: document.querySelector("#site-note-cancel"),
    siteNoteMessage: document.querySelector("#site-note-message"),
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
    assignmentEditReportResponsible: document.querySelector("#assignment-edit-report-responsible"),
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
    employeeEditForm: document.querySelector("#employee-edit-form"),
    employeeEditTitle: document.querySelector("#employee-edit-title"),
    employeeEditFirstName: document.querySelector("#employee-edit-first-name"),
    employeeEditLastName: document.querySelector("#employee-edit-last-name"),
    employeeEditPersonnelNumber: document.querySelector("#employee-edit-personnel-number"),
    employeeEditRole: document.querySelector("#employee-edit-role"),
    employeeEditSave: document.querySelector("#employee-edit-save"),
    employeeEditCancel: document.querySelector("#employee-edit-cancel"),
    employeeEditMessage: document.querySelector("#employee-edit-message"),
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
    siteCustomer: document.querySelector("#site-customer"),
    siteNewCustomer: document.querySelector("#site-new-customer"),
    siteCustomerName: document.querySelector("#site-customer-name"),
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
    assignmentReportResponsible: document.querySelector("#assignment-report-responsible"),
    assignmentMessage: document.querySelector("#assignment-message"),
    adminAssignmentList: document.querySelector("#admin-assignment-list"),
    timeCorrectionReviewPanel: document.querySelector("#time-correction-review-panel"),
    timeCorrectionReviewCount: document.querySelector("#time-correction-review-count"),
    timeCorrectionReviewList: document.querySelector("#time-correction-review-list"),
    toast: document.querySelector("#toast")
  };

  elements.assignmentPlanningContent.append(
    elements.adminWeek,
    elements.assignmentEditForm,
    elements.assignmentPanel
  );
  elements.sitePlanningContent.append(
    elements.businessStructurePanel,
    elements.siteMasterDataTools,
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
  let syncRequested = false;
  let session = null;
  let adminState = null;
  let weekState = null;
  let selectedWeekStart = currentWeekStart();
  let editingAssignmentId = null;
  let correctingTimeEntryId = null;
  let addingTimeEntryDate = null;
  let siteOptionsState = null;
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
  let finalizingReportId = null;
  let editingEmployeeId = null;
  let speechRecognition = null;
  let cachedUserId = null;
  let employeeSiteState = null;
  let mobileReportLeavesSite = true;
  let assignments = demoMode ? demoAssignments : [];
  let state = loadState();
  employeeSiteState = state.siteWorkspace || null;

  function createSignaturePad(canvas, clearButton) {
    const context = canvas.getContext("2d");
    let drawing = false;
    let hasInk = false;

    function clear() {
      context.save();
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.restore();
      hasInk = false;
    }

    function point(event) {
      const bounds = canvas.getBoundingClientRect();
      return {
        x: (event.clientX - bounds.left) * canvas.width / bounds.width,
        y: (event.clientY - bounds.top) * canvas.height / bounds.height
      };
    }

    canvas.addEventListener("pointerdown", (event) => {
      drawing = true;
      hasInk = true;
      canvas.setPointerCapture(event.pointerId);
      const current = point(event);
      context.beginPath();
      context.moveTo(current.x, current.y);
      event.preventDefault();
    });
    canvas.addEventListener("pointermove", (event) => {
      if (!drawing) return;
      const current = point(event);
      context.lineWidth = 4;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.strokeStyle = "#111111";
      context.lineTo(current.x, current.y);
      context.stroke();
      event.preventDefault();
    });
    const stop = (event) => {
      if (!drawing) return;
      drawing = false;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      event.preventDefault();
    };
    canvas.addEventListener("pointerup", stop);
    canvas.addEventListener("pointercancel", stop);
    clearButton.addEventListener("click", clear);
    clear();
    return {
      clear,
      hasInk: () => hasInk,
      dataUrl: () => canvas.toDataURL("image/png")
    };
  }

  const employeeSignaturePad = createSignaturePad(
    elements.siteReportEmployeeSignature,
    elements.siteReportEmployeeSignatureClear
  );
  const customerSignaturePad = createSignaturePad(
    elements.siteReportCustomerSignature,
    elements.siteReportCustomerSignatureClear
  );

  function localDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function currentWeekStart(date = new Date()) {
    const weekday = date.getDay() || 7;
    const monday = new Date(date);
    monday.setHours(12, 0, 0, 0);
    monday.setDate(date.getDate() - weekday + 1);
    return localDateKey(monday);
  }

  function initialState() {
    return {
      version: 1,
      workDate: localDateKey(),
      workDayStatus: null,
      events: [],
      reports: [],
      reportDraft: null,
      siteWorkspace: null
    };
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
        return {
          version: 1,
          workDate: saved.workDate,
          workDayStatus: saved.workDayStatus || null,
          events: saved.events,
          reports: Array.isArray(saved.reports) ? saved.reports : [],
          reportDraft: saved.reportDraft && typeof saved.reportDraft === "object"
            ? saved.reportDraft
            : null,
          siteWorkspace: saved.siteWorkspace || null
        };
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

  async function downloadFile(path, fallbackName) {
    let response;
    try {
      response = await fetch(path, { credentials: "include" });
    } catch {
      const error = new Error("Der Server ist momentan nicht erreichbar.");
      error.network = true;
      throw error;
    }
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const error = new Error(body.error?.message || "Die Datei konnte nicht erstellt werden.");
      error.status = response.status;
      error.code = body.error?.code;
      throw error;
    }
    const disposition = response.headers.get("content-disposition") || "";
    const encodedName = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
    const plainName = /filename="([^"]+)"/i.exec(disposition)?.[1];
    const fileName = encodedName
      ? decodeURIComponent(encodedName)
      : plainName || fallbackName;
    const objectUrl = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    return fileName;
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
    elements.loginFooter.textContent = `Einfach vor komplex · Version 0.34.0 ${demoMode ? "Demo" : "Online"}`;

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
    selectedWeekStart = currentWeekStart();
    weekState = null;
    elements.customerEditForm.hidden = true;
    elements.projectEditForm.hidden = true;
    elements.customerManagementPanel.hidden = true;
    elements.projectManagementPanel.hidden = true;
    elements.siteDashboard.hidden = true;
    elements.siteEditForm.hidden = true;
    closeTimeCorrectionForm();
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
    elements.documentManagementPanel.open = true;
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
    return { montage: "Montageschein", daily: "Bautagesbericht" }[type] || type;
  }

  function reportSourceLabel(source) {
    return { digital: "Digital", photo: "Originalfoto", speech: "Diktiert" }[source] || source;
  }

  function reportStatusLabel(status) {
    return {
      draft: "Entwurf",
      submitted: "Zur Unterschrift",
      approved: "Abgeschlossen",
      returned: "Zurückgegeben",
      archived: "Archiviert"
    }[status] || status;
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

  function renderSiteNotes(siteId) {
    const notes = (adminState?.siteNotes || []).filter((note) => (
      note.constructionSiteId === siteId && note.status === "active"
    ));
    elements.siteDashboardNoteCount.textContent = String(notes.length);
    elements.siteDashboardNotes.replaceChildren();
    if (notes.length === 0) {
      appendSiteModuleEmpty(elements.siteDashboardNotes, "Noch keine Notiz für diese Baustelle.");
      return;
    }
    notes.forEach((note) => {
      const item = document.createElement("li");
      const content = document.createElement("div");
      const heading = document.createElement("div");
      const text = document.createElement("strong");
      const meta = document.createElement("span");
      text.textContent = note.content;
      heading.append(text);
      if (note.isImportant) {
        const badge = document.createElement("small");
        badge.className = "module-chip module-chip--important";
        badge.textContent = "Wichtig";
        heading.append(badge);
      }
      meta.textContent = [
        note.authorName,
        new Intl.DateTimeFormat("de-DE", {
          dateStyle: "short",
          timeStyle: "short"
        }).format(new Date(note.createdAt))
      ].filter(Boolean).join(" · ");
      content.append(heading, meta);
      item.className = "site-module-item";
      item.append(content);
      elements.siteDashboardNotes.append(item);
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
      const heading = document.createElement("div");
      const title = document.createElement("strong");
      const badge = document.createElement("small");
      const statusBadge = document.createElement("small");
      const meta = document.createElement("span");
      const actions = document.createElement("div");
      title.textContent = report.summary;
      badge.className = "module-chip";
      badge.textContent = reportTypeLabel(report.reportType);
      statusBadge.className = `module-chip module-chip--${report.status}`;
      statusBadge.textContent = reportStatusLabel(report.status);
      heading.append(title, badge, statusBadge);
      meta.textContent = [
        report.number,
        new Intl.DateTimeFormat("de-DE").format(new Date(`${report.workDate}T12:00:00`)),
        reportSourceLabel(report.sourceMode),
        report.authorName,
        report.status === "approved" ? `signiert von ${report.employeeSignatureName} und ${report.customerSignatureName}` : null,
        report.details
      ].filter(Boolean).join(" · ");
      content.append(heading, meta);
      item.className = "site-module-item";
      item.append(content);
      actions.className = "site-module-item__actions";
      const sourceDocument = adminState.documents.find((documentItem) => documentItem.id === report.sourceDocumentId);
      if (sourceDocument) {
        const originalLink = documentDownloadLink(sourceDocument, true);
        originalLink.textContent = "Original";
        actions.append(originalLink);
      }
      const finalDocument = adminState.documents.find((documentItem) => documentItem.id === report.finalDocumentId);
      if (finalDocument) {
        const pdfLink = documentDownloadLink(finalDocument, true);
        pdfLink.textContent = "PDF";
        actions.append(pdfLink);
      }
      if (report.status === "submitted") {
        const finalize = document.createElement("button");
        finalize.type = "button";
        finalize.className = "text-button site-module-item__action";
        finalize.textContent = "Unterschreiben";
        finalize.addEventListener("click", () => openSiteReportFinalization(report));
        actions.append(finalize);
      }
      if (actions.childElementCount > 0) item.append(actions);
      elements.siteDashboardReports.append(item);
    });
  }

  function resetSiteReportFinalization() {
    finalizingReportId = null;
    elements.siteReportFinalizeForm.reset();
    elements.siteReportFinalizeForm.hidden = true;
    elements.siteReportFinalizeMessage.textContent = "";
    elements.siteReportFinalizeSubmit.disabled = false;
    employeeSignaturePad.clear();
    customerSignaturePad.clear();
  }

  function openSiteReportFinalization(report) {
    finalizingReportId = report.id;
    elements.siteReportFinalizeForm.reset();
    elements.siteReportFinalizeNumber.textContent = report.number;
    elements.siteReportEmployeeSignatureName.value = report.authorName || "";
    elements.siteReportFinalizeMessage.textContent = "";
    employeeSignaturePad.clear();
    customerSignaturePad.clear();
    elements.siteReportFinalizeForm.hidden = false;
    elements.siteReportFinalizeForm.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function resetSiteTaskForm() {
    elements.siteTaskForm.reset();
    elements.siteTaskForm.hidden = true;
    elements.siteTaskMessage.textContent = "";
  }

  function resetSiteNoteForm() {
    elements.siteNoteForm.reset();
    delete elements.siteNoteForm.dataset.clientNoteId;
    elements.siteNoteForm.hidden = true;
    elements.siteNoteMessage.textContent = "";
  }

  function resetSiteMaterialForm() {
    elements.siteMaterialForm.reset();
    elements.siteMaterialForm.hidden = true;
    elements.siteMaterialMessage.textContent = "";
  }

  function collectSiteReportPersonnel() {
    return [...elements.siteReportPersonnelList.querySelectorAll("input[data-user-id]")]
      .map((input) => ({
        userId: input.dataset.userId,
        minutes: Math.round(Number(input.value) * 60)
      }))
      .filter((entry) => Number.isSafeInteger(entry.minutes) && entry.minutes > 0);
  }

  function updateSiteReportPersonnelTotal() {
    const total = collectSiteReportPersonnel().reduce((sum, entry) => sum + entry.minutes, 0);
    elements.siteReportPersonnelTotal.textContent = `Gesamt: ${formatMinutes(total)} h`;
  }

  function renderSiteReportPersonnel() {
    const members = new Map();
    (adminState?.weekAssignments || [])
      .filter((assignment) => (
        assignment.constructionSiteId === openedSiteId
        && assignment.workDate === elements.siteReportDate.value
      ))
      .forEach((assignment) => {
        if (!members.has(assignment.employeeId)) members.set(assignment.employeeId, assignment);
      });
    elements.siteReportPersonnelList.replaceChildren();
    if (members.size === 0) {
      const empty = document.createElement("p");
      empty.className = "site-module-form__note";
      empty.textContent = "Für diesen Tag ist noch kein Mitarbeiter eingeplant.";
      elements.siteReportPersonnelList.append(empty);
      updateSiteReportPersonnelTotal();
      return;
    }
    members.forEach((member) => {
      const row = document.createElement("label");
      const name = document.createElement("span");
      const inputWrap = document.createElement("span");
      const input = document.createElement("input");
      const unit = document.createElement("small");
      row.className = "mobile-report-personnel__row";
      name.textContent = member.employeeName;
      input.type = "number";
      input.min = "0";
      input.max = "24";
      input.step = "0.25";
      input.inputMode = "decimal";
      input.dataset.userId = member.employeeId;
      input.setAttribute("aria-label", `Stunden für ${member.employeeName}`);
      input.value = member.plannedDurationMinutes
        ? String(Math.round(member.plannedDurationMinutes / 15) / 4)
        : "";
      input.addEventListener("input", updateSiteReportPersonnelTotal);
      unit.textContent = "Std.";
      inputWrap.append(input, unit);
      row.append(name, inputWrap);
      elements.siteReportPersonnelList.append(row);
    });
    updateSiteReportPersonnelTotal();
  }

  function resetSiteReportForm() {
    if (speechRecognition) {
      speechRecognition.stop();
      speechRecognition = null;
    }
    reportPhotoFile = null;
    elements.siteReportPhotoInput.value = "";
    elements.siteReportForm.reset();
    elements.siteReportSourceMode.value = "digital";
    elements.siteReportDate.value = localDateKey();
    elements.siteReportSourceNote.textContent = "";
    elements.siteReportMessage.textContent = "";
    elements.siteReportPersonnelList.replaceChildren();
    updateSiteReportPersonnelTotal();
    elements.siteReportForm.hidden = true;
    elements.siteReportSubmit.disabled = false;
  }

  function openSiteReportForm(sourceMode, photoFile = null) {
    resetSiteReportForm();
    reportPhotoFile = photoFile;
    elements.siteReportSourceMode.value = sourceMode;
    elements.siteReportDate.value = localDateKey();
    renderSiteReportPersonnel();
    elements.siteReportSourceNote.textContent = {
      digital: "Der Bericht wird direkt digital erfasst.",
      photo: reportPhotoFile ? `${reportPhotoFile.name} · ${formatFileSize(reportPhotoFile.size)}` : "Originalfoto auswählen.",
      speech: "Das Diktat wird als bearbeitbarer Text übernommen."
    }[sourceMode];
    elements.siteReportForm.hidden = false;
    elements.siteReportSummary.focus({ preventScroll: true });
  }

  function projectStatusLabel(status) {
    return {
      planned: "Geplant",
      active: "Aktiv",
      on_hold: "Pausiert",
      completed: "Abgeschlossen",
      archived: "Archiviert",
      cancelled: "Storniert"
    }[status] || status;
  }

  function customerSearchText(customer) {
    return [
      customer.number,
      customer.displayName,
      customer.email,
      customer.phone,
      customer.address?.street,
      customer.address?.houseNumber,
      customer.address?.postalCode,
      customer.address?.city
    ].filter(Boolean).join(" ").toLocaleLowerCase("de-DE");
  }

  function projectSearchText(project) {
    return [project.number, project.name, project.shortText, project.customerName]
      .filter(Boolean).join(" ").toLocaleLowerCase("de-DE");
  }

  function renderCustomerList() {
    if (!adminState) return;
    const query = elements.customerSearch.value.trim().toLocaleLowerCase("de-DE");
    const statusFilter = elements.customerStatusFilter.value;
    const customers = adminState.customers.filter((customer) => (
      (statusFilter === "all" || customerStatusGroup(customer.status) === statusFilter)
      && (!query || customerSearchText(customer).includes(query))
    ));

    elements.customerList.replaceChildren();
    elements.customerListSummary.textContent = `${customers.length} von ${adminState.customers.length} Kunde${adminState.customers.length === 1 ? "" : "n"}`;
    if (customers.length === 0) {
      const empty = document.createElement("li");
      empty.className = "admin-list__empty";
      empty.textContent = query ? "Kein Kunde passt zur Suche." : "In diesem Status gibt es noch keinen Kunden.";
      elements.customerList.append(empty);
      return;
    }

    customers.forEach((customer) => {
      const item = document.createElement("li");
      const content = document.createElement("div");
      const heading = document.createElement("div");
      const title = document.createElement("strong");
      const badge = document.createElement("span");
      const meta = document.createElement("span");
      const button = document.createElement("button");
      const actions = document.createElement("div");
      const documentsButton = document.createElement("button");
      const documentCount = documentsForEntity("customer", customer.id).length;
      const location = [customer.address?.postalCode, customer.address?.city].filter(Boolean).join(" ");
      title.textContent = customer.displayName;
      badge.className = `site-status site-status--${customerStatusGroup(customer.status)}`;
      badge.textContent = customer.status === "archived" ? "Archiviert" : "Aktiv";
      meta.textContent = [
        customer.number,
        `${customer.projectCount} Projekt${customer.projectCount === 1 ? "" : "e"}`,
        `${documentCount} Dokument${documentCount === 1 ? "" : "e"}`,
        location,
        customer.email || customer.phone
      ].filter(Boolean).join(" · ");
      heading.append(title, badge);
      content.append(heading, meta);
      button.type = "button";
      button.className = "text-button";
      button.textContent = "Bearbeiten";
      button.addEventListener("click", () => openCustomerEditor(customer));
      documentsButton.type = "button";
      documentsButton.className = "text-button";
      documentsButton.textContent = "Dokumente";
      documentsButton.addEventListener("click", () => focusDocumentsForEntity("customer", customer));
      actions.className = "list-actions";
      actions.append(documentsButton, button);
      item.append(content, actions);
      elements.customerList.append(item);
    });
  }

  function renderProjectList() {
    if (!adminState) return;
    const query = elements.projectSearch.value.trim().toLocaleLowerCase("de-DE");
    const statusFilter = elements.projectStatusFilter.value;
    const projects = adminState.projects.filter((project) => (
      (statusFilter === "all" || projectStatusGroup(project.status) === statusFilter)
      && (!query || projectSearchText(project).includes(query))
    ));

    elements.projectList.replaceChildren();
    elements.projectListSummary.textContent = `${projects.length} von ${adminState.projects.length} Projekt${adminState.projects.length === 1 ? "" : "en"}`;
    if (projects.length === 0) {
      const empty = document.createElement("li");
      empty.className = "admin-list__empty";
      empty.textContent = query ? "Kein Projekt passt zur Suche." : "In diesem Status gibt es noch kein Projekt.";
      elements.projectList.append(empty);
      return;
    }

    projects.forEach((project) => {
      const item = document.createElement("li");
      const content = document.createElement("div");
      const heading = document.createElement("div");
      const title = document.createElement("strong");
      const badge = document.createElement("span");
      const meta = document.createElement("span");
      const button = document.createElement("button");
      const actions = document.createElement("div");
      const documentsButton = document.createElement("button");
      const documentCount = documentsForEntity("project", project.id).length;
      title.textContent = project.name;
      badge.className = `site-status site-status--${projectStatusGroup(project.status)}`;
      badge.textContent = projectStatusLabel(project.status);
      meta.textContent = `${project.customerName} · ${project.number} · ${project.siteCount} Baustelle${project.siteCount === 1 ? "" : "n"} · ${documentCount} Dokument${documentCount === 1 ? "" : "e"}`;
      heading.append(title, badge);
      content.append(heading, meta);
      button.type = "button";
      button.className = "text-button";
      button.textContent = "Bearbeiten";
      button.addEventListener("click", () => openProjectEditor(project));
      documentsButton.type = "button";
      documentsButton.className = "text-button";
      documentsButton.textContent = "Dokumente";
      documentsButton.addEventListener("click", () => focusDocumentsForEntity("project", project));
      actions.className = "list-actions";
      actions.append(documentsButton, button);
      item.append(content, actions);
      elements.projectList.append(item);
    });
  }

  function openCustomerEditor(customer) {
    openedCustomerId = customer.id;
    elements.siteMasterDataTools.open = true;
    [elements.customerPanel, elements.projectPanel, elements.siteFormPanel]
      .forEach((panel) => { panel.open = false; });
    elements.projectEditForm.hidden = true;
    elements.projectManagementPanel.hidden = true;
    elements.customerManagementPanel.hidden = false;
    elements.customerEditNumber.textContent = customer.number;
    elements.customerEditType.value = customer.type;
    elements.customerEditCompanyName.value = customer.companyName || "";
    elements.customerEditFirstName.value = customer.firstName || "";
    elements.customerEditLastName.value = customer.lastName || "";
    elements.customerEditEmail.value = customer.email || "";
    elements.customerEditPhone.value = customer.phone || "";
    elements.customerEditStreet.value = customer.address?.street || "";
    elements.customerEditHouseNumber.value = customer.address?.houseNumber || "";
    elements.customerEditPostalCode.value = customer.address?.postalCode || "";
    elements.customerEditCity.value = customer.address?.city || "";
    elements.customerEditStatus.value = customer.status;
    elements.customerEditMessage.textContent = "";
    updateCustomerEditTypeFields();
    elements.customerEditForm.hidden = false;
    elements.customerEditForm.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function openProjectEditor(project) {
    openedProjectId = project.id;
    elements.siteMasterDataTools.open = true;
    [elements.customerPanel, elements.projectPanel, elements.siteFormPanel]
      .forEach((panel) => { panel.open = false; });
    elements.customerEditForm.hidden = true;
    elements.customerManagementPanel.hidden = true;
    elements.projectManagementPanel.hidden = false;
    elements.projectEditNumber.textContent = project.number;
    elements.projectEditCustomer.textContent = project.customerName;
    elements.projectEditName.value = project.name;
    elements.projectEditShortText.value = project.shortText || "";
    elements.projectEditStatus.value = project.status;
    elements.projectEditMessage.textContent = "";
    elements.projectEditForm.hidden = false;
    elements.projectEditForm.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function siteStatusLabel(status) {
    return {
      active: "Aktiv",
      planned: "Geplant",
      on_hold: "Pausiert",
      delayed: "Verzögert",
      completed: "Abgeschlossen",
      archived: "Archiviert",
      cancelled: "Storniert"
    }[status] || status;
  }

  function siteAddressText(site) {
    return [
      `${site.address?.street || ""} ${site.address?.houseNumber || ""}`.trim(),
      `${site.address?.postalCode || ""} ${site.address?.city || ""}`.trim()
    ].filter(Boolean).join(", ");
  }

  function siteNavigationUrl(site) {
    const destination = siteAddressText(site) || site.name || "";
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}`;
  }

  function siteSearchText(site) {
    return [
      site.number,
      site.name,
      site.customerName,
      site.shortText,
      site.address?.street,
      site.address?.houseNumber,
      site.address?.postalCode,
      site.address?.city
    ].filter(Boolean).join(" ").toLocaleLowerCase("de-DE");
  }

  function renderSiteList() {
    if (!adminState) return;
    const query = elements.siteSearch.value.trim().toLocaleLowerCase("de-DE");
    const statusFilter = elements.siteStatusFilter.value;
    const sites = adminState.sites.filter((site) => {
      const statusMatches = statusFilter === "all" || siteStatusGroup(site.status) === statusFilter;
      return statusMatches && (!query || siteSearchText(site).includes(query));
    });

    elements.siteList.replaceChildren();
    elements.siteListSummary.textContent = `${sites.length} von ${adminState.sites.length} Baustelle${adminState.sites.length === 1 ? "" : "n"}`;
    if (sites.length === 0) {
      const empty = document.createElement("li");
      empty.className = "admin-list__empty";
      empty.textContent = query
        ? "Keine Baustelle passt zur Suche."
        : "In diesem Status gibt es noch keine Baustelle.";
      elements.siteList.append(empty);
      return;
    }

    sites.forEach((site) => {
      const item = document.createElement("li");
      const content = document.createElement("div");
      const heading = document.createElement("div");
      const title = document.createElement("strong");
      const badge = document.createElement("span");
      const meta = document.createElement("span");
      const button = document.createElement("button");
      const actions = document.createElement("div");
      title.textContent = site.name;
      badge.className = `site-status site-status--${siteStatusGroup(site.status)}`;
      badge.textContent = siteStatusLabel(site.status);
      meta.textContent = [
        site.customerName,
        site.fieldReviewStatus === "pending"
          ? `Vom Monteur ${site.fieldCreatedByName ? `(${site.fieldCreatedByName}) ` : ""}angelegt · Büroprüfung offen`
          : null,
        `${documentsForEntity("construction_site", site.id).length} Dokumente`,
        `${site.address.street || ""} ${site.address.houseNumber || ""}`.trim(),
        `${site.address.postalCode || ""} ${site.address.city || ""}`.trim()
      ].filter(Boolean).join(" · ");
      heading.append(title, badge);
      content.append(heading, meta);
      button.type = "button";
      button.className = "text-button";
      button.textContent = "Öffnen";
      button.addEventListener("click", () => openSiteDashboard(site));
      actions.className = "site-list-actions";
      if (site.fieldReviewStatus === "pending") {
        const confirm = document.createElement("button");
        confirm.type = "button";
        confirm.className = "text-button";
        confirm.textContent = "Bestätigen";
        confirm.addEventListener("click", async () => {
          confirm.disabled = true;
          try {
            await requestJson(
              `./api/v1/admin/construction-sites/${encodeURIComponent(site.id)}/confirm`,
              { method: "POST" }
            );
            await refreshAdmin(adminState.date);
            showToast("Neue Baustelle durch das Büro bestätigt.");
          } catch (error) {
            confirm.disabled = false;
            showToast(error.message);
          }
        });
        actions.append(confirm);
      }
      actions.append(button);
      item.append(content, actions);
      elements.siteList.append(item);
    });
  }

  function openSiteDashboard(site) {
    const address = siteAddressText(site);
    const assignedEmployees = new Map();
    adminState.weekAssignments
      .filter((assignment) => assignment.constructionSiteId === site.id)
      .forEach((assignment) => {
        assignedEmployees.set(assignment.employeeId, assignment.employeeName);
      });

    openedSiteId = site.id;
    resetDeliveryNoteCapture();
    resetSiteTaskForm();
    resetSiteNoteForm();
    resetSiteMaterialForm();
    resetSiteReportForm();
    elements.siteDashboardTitle.textContent = site.name;
    elements.siteDashboardMeta.textContent = [site.number, address].filter(Boolean).join(" · ");
    elements.siteDashboardStatus.textContent = siteStatusLabel(site.status);
    elements.siteDashboardStatus.className = `site-status site-status--${siteStatusGroup(site.status)}`;
    elements.siteDashboardCustomer.textContent = site.customerName;
    elements.siteDashboardProject.textContent = site.customerName;
    elements.siteDashboardOrder.textContent = site.shortText || "Noch kein Arbeitsauftrag hinterlegt";
    elements.siteDashboardNavigation.href = siteNavigationUrl(site);
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
    renderSiteDocuments(site.id);
    renderAdminSelect(
      elements.siteTaskAssignee,
      adminState.employees,
      "Noch nicht zuweisen",
      (employee) => `${employee.firstName} ${employee.lastName} · ${employee.personnelNumber}`
    );
    renderSiteTasks(site.id);
    renderSiteNotes(site.id);
    renderSiteMaterials(site.id);
    renderSiteReports(site.id);
    elements.siteEditForm.hidden = true;
    elements.siteEditMessage.textContent = "";
    elements.siteDashboardEdit.hidden = false;
    elements.siteDashboard.hidden = false;
    elements.siteDashboard.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function openAssignmentPlanningForSite() {
    const site = adminState?.sites.find((candidate) => candidate.id === openedSiteId);
    if (!site) return;
    showDashboardPane("assignments");
    elements.assignmentPanel.open = true;
    elements.assignmentSite.value = site.id;
    elements.assignmentDate.value = adminState.date;
    window.setTimeout(() => {
      elements.assignmentForm.scrollIntoView({ behavior: "smooth", block: "start" });
      elements.assignmentEmployee.focus({ preventScroll: true });
    }, 100);
  }

  function openDocumentUploadForSite() {
    const site = adminState?.sites.find((candidate) => candidate.id === openedSiteId);
    if (!site) return;
    elements.documentSearch.value = "";
    setDocumentTargets({ customerId: site.customerId, projectId: site.projectId, constructionSiteId: site.id });
    renderDocumentList();
    elements.documentManagementPanel.open = true;
    elements.documentManagementPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    elements.documentTitle.focus({ preventScroll: true });
  }

  function openReportForSite() {
    if (!openedSiteId) return;
    elements.siteDashboardReportsPanel.open = true;
    openSiteReportForm("digital");
    elements.siteReportForm.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function openTaskForSite() {
    if (!openedSiteId) return;
    elements.siteDashboardTasksPanel.open = true;
    resetSiteTaskForm();
    elements.siteTaskForm.hidden = false;
    elements.siteTaskForm.scrollIntoView({ behavior: "smooth", block: "nearest" });
    elements.siteTaskTitle.focus({ preventScroll: true });
  }

  function openSiteEditor() {
    const site = adminState?.sites.find((candidate) => candidate.id === openedSiteId);
    if (!site) return;
    elements.siteEditNumber.textContent = site.number;
    elements.siteEditProject.textContent = site.customerName;
    elements.siteEditName.value = site.name;
    elements.siteEditShortText.value = site.shortText || "";
    elements.siteEditStreet.value = site.address.street || "";
    elements.siteEditHouseNumber.value = site.address.houseNumber || "";
    elements.siteEditPostalCode.value = site.address.postalCode || "";
    elements.siteEditCity.value = site.address.city || "";
    elements.siteEditStatus.value = siteStatusGroup(site.status);
    elements.siteEditMessage.textContent = "";
    elements.siteEditForm.hidden = false;
    elements.siteDashboardEdit.hidden = true;
    elements.siteEditForm.scrollIntoView({ behavior: "smooth", block: "start" });
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

  function hierarchySummary(title, meta, kind, status = null) {
    const summary = document.createElement("summary");
    const icon = document.createElement("span");
    const content = document.createElement("span");
    const strong = document.createElement("strong");
    const small = document.createElement("small");
    icon.className = `hierarchy-icon hierarchy-icon--${kind}`;
    icon.textContent = kind === "customer" ? "K" : "P";
    strong.textContent = title;
    small.textContent = meta;
    content.append(strong, small);
    summary.append(icon, content);
    if (status) {
      const badge = document.createElement("small");
      badge.className = `site-status site-status--${status.group}`;
      badge.textContent = status.label;
      summary.append(badge);
    }
    return summary;
  }

  function hierarchyActions(actions) {
    const bar = document.createElement("div");
    bar.className = "hierarchy-node-actions";
    actions.forEach(({ label, handler }) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "text-button";
      button.textContent = label;
      button.addEventListener("click", handler);
      bar.append(button);
    });
    return bar;
  }

  function openMasterDataForm(panel, focusElement = null) {
    elements.siteMasterDataTools.hidden = false;
    elements.siteMasterDataTools.open = true;
    elements.customerEditForm.hidden = true;
    elements.projectEditForm.hidden = true;
    elements.customerManagementPanel.hidden = true;
    elements.projectManagementPanel.hidden = true;
    [elements.customerPanel, elements.projectPanel, elements.siteFormPanel]
      .forEach((candidate) => { candidate.open = candidate === panel; });
    window.setTimeout(() => {
      panel.scrollIntoView({ behavior: "smooth", block: "start" });
      focusElement?.focus({ preventScroll: true });
    }, 50);
  }

  function renderBusinessHierarchy() {
    elements.businessHierarchy.replaceChildren();
    const query = elements.hierarchySearch.value.trim().toLocaleLowerCase("de-DE");
    const statusFilter = elements.hierarchyStatusFilter.value;
    const sites = adminState.sites
      .filter((site) => (
        (statusFilter === "all" || siteStatusGroup(site.status) === statusFilter)
        && (!query || siteSearchText(site).includes(query))
      ))
      .sort((left, right) => (
        Number(right.fieldReviewStatus === "pending") - Number(left.fieldReviewStatus === "pending")
        || left.name.localeCompare(right.name, "de-DE")
      ));

    const summary = document.createElement("p");
    summary.className = "site-list-summary site-list-summary--standalone";
    summary.textContent = `${sites.length} von ${adminState.sites.length} Baustelle${
      adminState.sites.length === 1 ? "" : "n"
    }`;
    elements.businessHierarchy.append(summary);

    if (sites.length === 0) {
      const empty = document.createElement("p");
      empty.className = "hierarchy-empty";
      empty.textContent = adminState.sites.length === 0
        ? "Noch keine Baustelle angelegt."
        : "Keine Baustelle passt zu Suche und Status.";
      elements.businessHierarchy.append(empty);
      return;
    }

    const list = document.createElement("ul");
    list.className = "hierarchy-sites hierarchy-sites--flat";
    sites.forEach((site) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      const content = document.createElement("span");
      const title = document.createElement("strong");
      const meta = document.createElement("span");
      const badge = document.createElement("small");
      const address = [
        `${site.address.street || ""} ${site.address.houseNumber || ""}`.trim(),
        `${site.address.postalCode || ""} ${site.address.city || ""}`.trim()
      ].filter(Boolean).join(", ");
      button.type = "button";
      title.textContent = site.name;
      meta.textContent = [
        site.customerName,
        address,
        site.shortText,
        `${documentsForEntity("construction_site", site.id).length} Dokumente`
      ].filter(Boolean).join(" · ");
      badge.className = `site-status site-status--${siteStatusGroup(site.status)}`;
      badge.textContent = site.fieldReviewStatus === "pending"
        ? "Büroprüfung"
        : siteStatusLabel(site.status);
      content.append(title, meta);
      button.append(content, badge);
      button.addEventListener("click", () => openSiteDashboard(site));
      item.append(button);
      list.append(item);
    });
    elements.businessHierarchy.append(list);
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
    const employee = adminState?.employees.find((item) => item.id === assignment.employeeId);
    elements.assignmentEditReportResponsible.disabled =
      assignment.reportResponsibilitySource === "automatic"
      || !employee?.roles?.includes("foreman");
    elements.assignmentEditReportResponsible.checked = Boolean(assignment.reportResponsible);
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
          const duty = document.createElement("span");
          const startTime = assignment.plannedStartTime
            ? `${assignment.plannedStartTime.slice(0, 5)} Uhr`
            : "ohne Startzeit";
          card.className = "week-assignment";
          title.textContent = assignment.employeeName;
          meta.textContent = `${startTime} · ${assignment.siteName}`;
          duty.className = "foreman-duty";
          duty.textContent = assignment.reportResponsibilitySource === "automatic"
            ? "Automatisch Vorarbeiter · allein vor Ort"
            : "Vorarbeiter · Bericht";
          duty.hidden = !assignment.reportResponsible;
          edit.type = "button";
          edit.textContent = "Ändern";
          edit.addEventListener("click", () => openAssignmentEditor(assignment));
          content.append(title, meta, duty);
          card.append(content, edit);
          items.append(card);
        });
      }
      day.append(dateBlock, items);
      elements.adminWeekBoard.append(day);
    }
  }

  function renderWorkDayReviews() {
    const workDays = adminState?.workDays || [];
    const actionable = workDays.filter((day) => day.reviewable || day.status === "approved");
    elements.workDayReviewPanel.hidden = !canPlan();
    elements.workDayReviewCount.textContent = String(actionable.length);
    elements.workDayReviewList.replaceChildren();
    if (workDays.length === 0) {
      const empty = document.createElement("li");
      empty.className = "admin-list__empty";
      empty.textContent = "In dieser Woche wurden noch keine Zeiten erfasst.";
      elements.workDayReviewList.append(empty);
      return;
    }

    const employees = new Map();
    [...workDays]
      .sort((left, right) => (
        left.employeeName.localeCompare(right.employeeName, "de-DE")
        || left.workDate.localeCompare(right.workDate)
      ))
      .forEach((day) => {
        if (!employees.has(day.employeeName)) employees.set(day.employeeName, []);
        employees.get(day.employeeName).push(day);
      });

    employees.forEach((days, employeeName) => {
      const group = document.createElement("li");
      const heading = document.createElement("div");
      const headingText = document.createElement("div");
      const name = document.createElement("strong");
      const summary = document.createElement("span");
      const dayList = document.createElement("div");
      const totalWorkMinutes = days.reduce((sum, day) => sum + Number(day.workMinutes || 0), 0);
      const openCount = days.filter((day) => day.reviewable || day.status === "approved").length;
      group.className = "work-day-review-employee";
      heading.className = "work-day-review-employee__heading";
      name.textContent = employeeName;
      summary.textContent = `${days.length} Tag${days.length === 1 ? "" : "e"} · ${
        formatMinutes(totalWorkMinutes)
      } h gearbeitet${openCount ? ` · ${openCount} offen` : ""}`;
      headingText.append(name, summary);
      heading.append(headingText);
      dayList.className = "work-day-review-days";

      days.forEach((day) => {
        const dayRow = document.createElement("article");
        const content = document.createElement("div");
        const rowHeading = document.createElement("div");
        const date = document.createElement("strong");
        const status = document.createElement("span");
        const meta = document.createElement("span");
        const statusKey = day.workflowStatus === "billed"
          ? "locked"
          : day.status === "approved"
            ? "approved"
            : day.workflowStatus;
        dayRow.className = "work-day-review-day";
        date.textContent = shortDate(day.workDate);
        status.className = `work-day-review-status work-day-review-status--${statusKey}`;
        status.textContent = {
          in_progress: "In Arbeit",
          completed: day.status === "approved" ? "Freigegeben" : "Abgeschlossen",
          billed: "Abgerechnet"
        }[day.workflowStatus] || day.workflowStatus;
        meta.textContent = `Arbeit ${formatMinutes(day.workMinutes)} · Pause ${
          formatMinutes(day.breakMinutes)
        } · Fahrt ${formatMinutes(day.travelMinutes)}`;
        rowHeading.append(date, status);
        content.append(rowHeading, meta);
        if (day.warnings?.length) {
          const warning = document.createElement("small");
          warning.className = "work-day-review-warning";
          warning.textContent = day.warnings.map((item) => item.message).join(" · ");
          content.append(warning);
        }
        dayRow.append(content);

        if (day.reviewable || day.status === "approved") {
          const action = document.createElement("button");
          const decision = day.status === "approved" ? "locked" : "approved";
          action.type = "button";
          action.className = "text-button work-day-review-action";
          action.textContent = decision === "approved" ? "Freigeben" : "Abrechnen";
          action.addEventListener("click", async () => {
            if (
              decision === "locked"
              && !window.confirm(
                `${day.employeeName}: Stundenzettel als abgerechnet sperren?`
              )
            ) return;
            action.disabled = true;
            try {
              await requestJson(`./api/v1/admin/work-days/${encodeURIComponent(day.id)}`, {
                method: "PATCH",
                body: JSON.stringify({ decision })
              });
              await Promise.all([refreshAdmin(adminState.date), refreshWeekData()]);
              showToast(
                decision === "approved"
                  ? "Stundenzettel freigegeben."
                  : "Stundenzettel als abgerechnet gesperrt."
              );
            } catch (error) {
              action.disabled = false;
              showToast(error.message);
            }
          });
          dayRow.append(action);
        }
        dayList.append(dayRow);
      });

      group.append(heading, dayList);
      elements.workDayReviewList.append(group);
    });
  }

  function renderTimeCorrections() {
    const corrections = adminState?.timeCorrections || [];
    elements.timeCorrectionReviewPanel.hidden = !canPlan();
    elements.timeCorrectionReviewCount.textContent = String(corrections.length);
    elements.timeCorrectionReviewList.replaceChildren();
    if (corrections.length === 0) {
      const empty = document.createElement("li");
      empty.className = "admin-list__empty";
      empty.textContent = "Keine Korrektur wartet auf Prüfung.";
      elements.timeCorrectionReviewList.append(empty);
      return;
    }

    corrections.forEach((correction) => {
      const item = document.createElement("li");
      const content = document.createElement("div");
      const title = document.createElement("strong");
      const meta = document.createElement("span");
      const reason = document.createElement("span");
      const actions = document.createElement("div");
      const approve = document.createElement("button");
      const reject = document.createElement("button");
      const kindLabel = {
        addition: "Fehlende Buchung",
        invalidation: "Ungültig-Markierung",
        replacement: "Zeitkorrektur"
      }[correction.correctionKind] || "Zeitkorrektur";
      title.textContent = `${correction.employeeName} · ${kindLabel} · ${
        timeEntryTypeLabel(correction.entryType)
      }`;
      meta.textContent = correction.correctionKind === "addition"
        ? `${shortDate(correction.workDate)} · ergänzen um ${
          timeFormatter.format(new Date(correction.requestedRecordedAt))
        } Uhr`
        : correction.correctionKind === "invalidation"
          ? `${shortDate(correction.workDate)} · ${
            timeFormatter.format(new Date(correction.originalRecordedAt))
          } Uhr als ungültig markieren`
          : `${shortDate(correction.workDate)} · ${
            timeFormatter.format(new Date(correction.originalRecordedAt))
          } → ${timeFormatter.format(new Date(correction.requestedRecordedAt))} Uhr`;
      reason.textContent = correction.reason;
      reason.className = "time-correction-review-reason";
      content.append(title, meta, reason);
      actions.className = "time-correction-review-actions";
      approve.type = "button";
      approve.className = "text-button";
      approve.textContent = "Genehmigen";
      reject.type = "button";
      reject.className = "text-button text-button--muted";
      reject.textContent = "Ablehnen";

      const review = async (decision) => {
        if (
          decision === "approved"
          && !window.confirm("Änderung genehmigen und den Stundenzettel neu berechnen?")
        ) return;
        approve.disabled = true;
        reject.disabled = true;
        try {
          await requestJson(
            `./api/v1/admin/time-entry-corrections/${encodeURIComponent(correction.id)}`,
            {
              method: "PATCH",
              body: JSON.stringify({ decision })
            }
          );
          showToast(decision === "approved"
            ? "Zeitkorrektur genehmigt · Stundenzettel neu berechnet."
            : "Zeitkorrektur abgelehnt · Originalzeit bleibt bestehen.");
          await Promise.all([refreshAdmin(), refreshLiveData(), refreshWeekData()]);
        } catch (error) {
          showToast(error.message);
          approve.disabled = false;
          reject.disabled = false;
        }
      };
      approve.addEventListener("click", () => void review("approved"));
      reject.addEventListener("click", () => void review("rejected"));
      actions.append(approve, reject);
      item.append(content, actions);
      elements.timeCorrectionReviewList.append(item);
    });
  }

  function renderTimesheetExport() {
    elements.timesheetExportPanel.hidden = !canPlan();
    if (!canPlan() || !adminState) return;
    if (!elements.timesheetExportFrom.value) {
      elements.timesheetExportFrom.value = adminState.weekStart;
    }
    if (!elements.timesheetExportTo.value) {
      elements.timesheetExportTo.value = addIsoDays(adminState.weekStart, 6);
    }
    const selectedEmployee = elements.timesheetExportEmployee.value;
    elements.timesheetExportEmployee.replaceChildren();
    const all = document.createElement("option");
    all.value = "";
    all.textContent = "Alle Mitarbeiter";
    elements.timesheetExportEmployee.append(all);
    adminState.employees.forEach((employee) => {
      const option = document.createElement("option");
      option.value = employee.id;
      option.textContent = `${employee.firstName} ${employee.lastName} · ${employee.personnelNumber}`;
      option.selected = employee.id === selectedEmployee;
      elements.timesheetExportEmployee.append(option);
    });
  }

  function updateSiteCustomerMode() {
    const createsCustomer = elements.siteCustomer.value === "__new__";
    elements.siteNewCustomer.hidden = !createsCustomer;
    elements.siteCustomerName.required = createsCustomer;
    if (!createsCustomer) elements.siteCustomerName.value = "";
  }

  function closeEmployeeEditor() {
    editingEmployeeId = null;
    elements.employeeEditForm.hidden = true;
    elements.employeeEditForm.reset();
    elements.employeeEditMessage.textContent = "";
  }

  function openEmployeeEditor(employee) {
    editingEmployeeId = employee.id;
    elements.employeeEditTitle.textContent = `${employee.firstName} ${employee.lastName}`;
    elements.employeeEditFirstName.value = employee.firstName;
    elements.employeeEditLastName.value = employee.lastName;
    elements.employeeEditPersonnelNumber.value = employee.personnelNumber;
    elements.employeeEditRole.value = employee.roles.find((role) => (
      ["installer", "foreman", "managing_director", "dispatch_office", "project_manager"].includes(role)
    )) || "installer";
    elements.employeeEditMessage.textContent = "";
    elements.employeeEditForm.hidden = false;
    elements.employeeEditForm.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function renderAdmin() {
    if (!adminState) return;
    elements.adminEmployeeCount.textContent = String(adminState.employees.length);
    elements.adminCustomerCount.textContent = String(
      adminState.customers.filter((customer) => customerStatusGroup(customer.status) === "active").length
    );
    elements.adminProjectCount.textContent = String(
      adminState.projects.filter((project) => projectStatusGroup(project.status) === "active").length
    );
    elements.adminSiteCount.textContent = String(
      adminState.sites.filter((site) => siteStatusGroup(site.status) === "active").length
    );
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
    if (
      !adminState.canCreateManagementRoles
      && elements.employeeManagementRoles.some((option) => option.value === elements.employeeEditRole.value)
    ) {
      elements.employeeEditRole.value = "installer";
    }

    renderAdminSelect(
      elements.projectCustomer,
      adminState.customers.filter((customer) => customerStatusGroup(customer.status) === "active"),
      "Kunde auswählen",
      (customer) => `${customer.displayName} · ${customer.number}`
    );
    renderAdminSelect(
      elements.siteCustomer,
      adminState.customers.filter((customer) => customerStatusGroup(customer.status) === "active"),
      "Kunde auswählen",
      (customer) => `${customer.displayName} · ${customer.number}`
    );
    const createCustomer = document.createElement("option");
    createCustomer.value = "__new__";
    createCustomer.textContent = "＋ Neuen Kunden anlegen";
    elements.siteCustomer.append(createCustomer);
    if (!adminState.customers.some((customer) => customerStatusGroup(customer.status) === "active")) {
      elements.siteCustomer.value = "__new__";
    }
    elements.siteProject.value = "";
    updateSiteCustomerMode();
    renderAdminSelect(
      elements.assignmentEmployee,
      adminState.employees,
      "Mitarbeiter auswählen",
      (employee) => `${employee.firstName} ${employee.lastName} · ${employee.personnelNumber}`
    );
    updateAssignmentResponsibilityControl();
    renderAdminSelect(
      elements.assignmentSite,
      adminState.sites.filter((site) => siteStatusGroup(site.status) === "active"),
      "Baustelle auswählen",
      (site) => `${site.name} · ${site.address.city}`
    );
    renderAdminSelect(
      elements.documentCustomer,
      adminState.customers.filter((customer) => customerStatusGroup(customer.status) === "active"),
      "Kunde auswählen",
      (customer) => `${customer.displayName} · ${customer.number}`
    );
    renderAdminSelect(
      elements.documentProject,
      adminState.projects.filter((project) => projectStatusGroup(project.status) === "active"),
      "Projekt auswählen (optional)",
      (project) => `${project.customerName} · ${project.name}`
    );
    renderAdminSelect(
      elements.documentSite,
      adminState.sites.filter((site) => siteStatusGroup(site.status) === "active"),
      "Baustelle auswählen (optional)",
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
        `${employee.personnelNumber} · ${employee.roles.map((role) => roleLabels[role] || role).join(", ")}`,
        employee.roles.includes("admin")
          ? null
          : { label: "Bearbeiten", handler: () => openEmployeeEditor(employee) }
      );
    });

    renderCustomerList();
    renderProjectList();
    renderSiteList();
    renderDocumentList();
    renderWorkDayReviews();
    renderTimeCorrections();
    renderTimesheetExport();
    if (openedSiteId && !elements.siteDashboard.hidden) {
      renderSiteDocuments(openedSiteId);
      renderSiteTasks(openedSiteId);
      renderSiteNotes(openedSiteId);
      renderSiteMaterials(openedSiteId);
      renderSiteReports(openedSiteId);
    }

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
          `${start} · ${assignment.siteName}${
            assignment.reportResponsible
              ? (assignment.reportResponsibilitySource === "automatic"
                ? " · automatisch Vorarbeiter"
                : " · Vorarbeiter / Bericht")
              : ""
          }`
        );
      });
    }
    renderBusinessHierarchy();
    renderAdminWeek();
  }

  function updateAssignmentResponsibilityControl() {
    const employee = adminState?.employees.find((item) => item.id === elements.assignmentEmployee.value);
    const isForeman = Boolean(employee?.roles?.includes("foreman"));
    elements.assignmentReportResponsible.disabled = !isForeman;
    if (!isForeman) elements.assignmentReportResponsible.checked = false;
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

  function employeeRoleLabel(roles = []) {
    if (roles.includes("foreman")) return "Vorarbeiter";
    if (roles.some((role) => ["admin", "managing_director", "dispatch_office", "project_manager"].includes(role))) {
      return "Planung";
    }
    return "Monteur";
  }

  function appendEmployeeSiteEmpty(list, message) {
    const item = document.createElement("li");
    item.className = "employee-site-list__empty";
    item.textContent = message;
    list.append(item);
  }

  function appendEmployeeSiteItem(list, titleText, metaText, badgeText = "") {
    const item = document.createElement("li");
    const content = document.createElement("div");
    const title = document.createElement("strong");
    const meta = document.createElement("span");
    title.textContent = titleText;
    meta.textContent = metaText;
    content.append(title, meta);
    item.append(content);
    if (badgeText) {
      const badge = document.createElement("small");
      badge.textContent = badgeText;
      item.append(badge);
    }
    list.append(item);
  }

  function employeeSiteContentUrl(documentItem) {
    if (!employeeSiteState) return "#";
    const siteId = encodeURIComponent(employeeSiteState.site.id);
    const documentId = encodeURIComponent(documentItem.id);
    const date = encodeURIComponent(employeeSiteState.date);
    return `./api/v1/construction-sites/${siteId}/documents/${documentId}/content?date=${date}`;
  }

  function employeeSiteDocumentLink(documentItem) {
    const link = document.createElement("a");
    link.className = "text-button";
    link.href = employeeSiteContentUrl(documentItem);
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "Öffnen";
    return link;
  }

  function employeeSiteTaskAction(task) {
    return {
      open: { label: "Beginnen", status: "in_progress" },
      in_progress: { label: "Erledigt", status: "done" },
      done: { label: "Wieder öffnen", status: "in_progress" }
    }[task.status] || null;
  }

  async function updateEmployeeSiteTask(task, nextStatus, button) {
    if (!employeeSiteState || !navigator.onLine) {
      showToast("Der Aufgabenstatus kann wieder mit Verbindung geändert werden.");
      return;
    }
    button.disabled = true;
    try {
      const body = await requestJson(
        `./api/v1/construction-sites/${encodeURIComponent(employeeSiteState.site.id)}/tasks/${encodeURIComponent(task.id)}?date=${encodeURIComponent(employeeSiteState.date)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ status: nextStatus, rowVersion: task.rowVersion })
        }
      );
      employeeSiteState.tasks = employeeSiteState.tasks.map((item) => (
        item.id === body.siteTask.id ? body.siteTask : item
      ));
      renderEmployeeSiteWorkspace(employeeSiteState);
      showToast(nextStatus === "done" ? "Aufgabe erledigt." : "Aufgabenstatus aktualisiert.");
    } catch (error) {
      if (error.status === 401) showLogin();
      else showToast(error.message);
      button.disabled = false;
    }
  }

  function appendEmployeeSiteTask(task) {
    const item = document.createElement("li");
    const content = document.createElement("div");
    const title = document.createElement("strong");
    const meta = document.createElement("span");
    const actions = document.createElement("div");
    const badge = document.createElement("small");
    const due = task.dueDate
      ? `Fällig ${new Intl.DateTimeFormat("de-DE").format(new Date(`${task.dueDate}T00:00:00`))}`
      : "Ohne Fälligkeit";
    const action = employeeSiteTaskAction(task);

    title.textContent = task.title;
    meta.textContent = [task.details, task.assignedUserName, due].filter(Boolean).join(" · ");
    content.append(title, meta);
    actions.className = "employee-site-task-actions";
    badge.textContent = `${taskPriorityLabel(task.priority)} · ${taskStatusLabel(task.status)}`;
    actions.append(badge);
    if (action) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "text-button";
      button.textContent = action.label;
      button.disabled = !navigator.onLine;
      button.addEventListener("click", () => {
        void updateEmployeeSiteTask(task, action.status, button);
      });
      actions.append(button);
    }
    item.append(content, actions);
    elements.employeeSiteTasks.append(item);
  }

  function renderEmployeeSiteWorkspace(dashboard) {
    employeeSiteState = dashboard;
    state.siteWorkspace = dashboard;
    saveState();

    const { site } = dashboard;
    const address = siteAddressText(site);
    elements.employeeSiteTitle.textContent = site.name;
    elements.employeeSiteMeta.textContent = [site.number, address].filter(Boolean).join(" · ");
    elements.employeeSiteStatus.textContent = siteStatusLabel(site.status);
    elements.employeeSiteStatus.className = `site-status site-status--${siteStatusGroup(site.status)}`;
    elements.employeeSiteOrder.textContent = site.shortText || "Noch kein Arbeitsauftrag hinterlegt";
    elements.employeeSiteContext.textContent = site.customerName || address;
    elements.employeeSiteNavigation.href = siteNavigationUrl(site);

    elements.employeeSiteTeamCount.textContent = String(dashboard.team.length);
    elements.employeeSiteTeam.replaceChildren();
    if (dashboard.team.length === 0) {
      appendEmployeeSiteEmpty(elements.employeeSiteTeam, "Für heute ist noch kein Team eingetragen.");
    } else {
      dashboard.team.forEach((member) => {
        appendEmployeeSiteItem(
          elements.employeeSiteTeam,
          member.name,
          member.reportResponsible ? "Erstellt heute den Baustellenbericht" : "Heute eingeplant",
          member.reportResponsible ? "Vorarbeiter" : employeeRoleLabel(member.roles)
        );
      });
    }

    elements.employeeSiteTaskCount.textContent = String(dashboard.tasks.length);
    elements.employeeSiteTasks.replaceChildren();
    if (dashboard.tasks.length === 0) {
      appendEmployeeSiteEmpty(elements.employeeSiteTasks, "Keine offene Aufgabe für dich.");
    } else {
      dashboard.tasks.forEach(appendEmployeeSiteTask);
    }

    const notes = dashboard.notes || [];
    elements.employeeSiteNoteCount.textContent = String(notes.length);
    elements.employeeSiteNotes.replaceChildren();
    if (notes.length === 0) {
      appendEmployeeSiteEmpty(elements.employeeSiteNotes, "Noch keine Notiz für diese Baustelle.");
    } else {
      notes.forEach((note) => {
        appendEmployeeSiteItem(
          elements.employeeSiteNotes,
          note.content,
          [
            note.authorName,
            new Intl.DateTimeFormat("de-DE", {
              dateStyle: "short",
              timeStyle: "short"
            }).format(new Date(note.createdAt))
          ].filter(Boolean).join(" · "),
          note.isImportant ? "Wichtig" : "Notiz"
        );
      });
    }

    elements.employeeSiteReportCount.textContent = String(dashboard.reports.length);
    elements.employeeSiteReports.replaceChildren();
    if (dashboard.reports.length === 0) {
      appendEmployeeSiteEmpty(elements.employeeSiteReports, "Noch kein Bericht für diese Baustelle.");
    } else {
      dashboard.reports.forEach((report) => {
        appendEmployeeSiteItem(
          elements.employeeSiteReports,
          report.summary,
          [report.number, report.workDate, report.authorName].filter(Boolean).join(" · "),
          `${reportTypeLabel(report.reportType)} · ${reportStatusLabel(report.status)}`
        );
      });
    }

    const photos = dashboard.documents.filter((documentItem) => documentItem.category === "photo");
    const documents = dashboard.documents.filter((documentItem) => documentItem.category !== "photo");
    elements.employeeSiteDocumentCount.textContent = String(documents.length);
    elements.employeeSiteDocuments.replaceChildren();
    if (documents.length === 0) {
      appendEmployeeSiteEmpty(elements.employeeSiteDocuments, "Noch kein Dokument für diese Baustelle.");
    } else {
      documents.forEach((documentItem) => {
        const item = document.createElement("li");
        const content = document.createElement("div");
        const title = document.createElement("strong");
        const meta = document.createElement("span");
        title.textContent = documentItem.title;
        meta.textContent = `${documentCategoryLabel(documentItem.category)} · ${formatFileSize(documentItem.sizeBytes)}`;
        content.append(title, meta);
        item.append(content, employeeSiteDocumentLink(documentItem));
        elements.employeeSiteDocuments.append(item);
      });
    }

    elements.employeeSitePhotoCount.textContent = String(photos.length);
    elements.employeeSitePhotos.replaceChildren();
    if (photos.length === 0) {
      appendEmployeeSiteEmpty(elements.employeeSitePhotos, "Noch kein Baustellenfoto gespeichert.");
    } else {
      photos.forEach((photo) => {
        const item = document.createElement("li");
        const link = employeeSiteDocumentLink(photo);
        const image = document.createElement("img");
        const caption = document.createElement("span");
        link.className = "employee-site-photo";
        image.src = employeeSiteContentUrl(photo);
        image.alt = photo.title;
        image.loading = "lazy";
        caption.textContent = photo.title;
        link.replaceChildren(image, caption);
        item.append(link);
        elements.employeeSitePhotos.append(item);
      });
    }

    elements.employeeSiteMaterialCount.textContent = String(dashboard.materials.length);
    elements.employeeSiteMaterials.replaceChildren();
    if (dashboard.materials.length === 0) {
      appendEmployeeSiteEmpty(elements.employeeSiteMaterials, "Noch kein Material eingetragen.");
    } else {
      dashboard.materials.forEach((material) => {
        appendEmployeeSiteItem(
          elements.employeeSiteMaterials,
          material.itemName,
          [material.note, `${material.quantity.toLocaleString("de-DE")} ${material.unit}`]
            .filter(Boolean)
            .join(" · "),
          materialStatusLabel(material.status)
        );
      });
    }

    elements.employeeSitePhotoAdd.disabled = !navigator.onLine;
    elements.employeeSiteNoteAdd.disabled = !navigator.onLine;
    elements.employeeSitePhotoMessage.textContent = navigator.onLine
      ? ""
      : "Fotos können wieder hinzugefügt werden, sobald eine Verbindung besteht.";
    if (!navigator.onLine) {
      elements.employeeSiteNoteMessage.textContent =
        "Neue Notizen können wieder gespeichert werden, sobald eine Verbindung besteht.";
    }
  }

  async function openEmployeeSiteWorkspace() {
    const assignment = assignments[currentSiteIndex()];
    if (!assignment?.constructionSite?.id || demoMode) {
      showToast(demoMode
        ? "Die Baustellenakte ist in der Online-Version mit einem echten Einsatz verfügbar."
        : "Für heute ist keine Baustelle freigegeben.");
      return;
    }

    resetEmployeeSiteNoteForm();
    const cached = employeeSiteState
      && employeeSiteState.site?.id === assignment.constructionSite.id
      && employeeSiteState.date === state.workDate;
    if (!navigator.onLine) {
      if (!cached) {
        showToast("Die Baustellenakte wurde auf diesem Gerät noch nicht geladen.");
        return;
      }
      renderEmployeeSiteWorkspace(employeeSiteState);
      showDashboardPane("site");
      return;
    }

    elements.assignmentDetails.disabled = true;
    elements.assignmentDetailsLabel.textContent = "Lädt …";
    try {
      const body = await requestJson(
        `./api/v1/construction-sites/${encodeURIComponent(assignment.constructionSite.id)}/dashboard?date=${encodeURIComponent(state.workDate)}`
      );
      renderEmployeeSiteWorkspace(body.dashboard);
      showDashboardPane("site");
    } catch (error) {
      if (error.status === 401) showLogin();
      else showToast(error.message);
    } finally {
      elements.assignmentDetails.disabled = false;
      elements.assignmentDetailsLabel.textContent = "Baustellenakte";
    }
  }

  async function uploadEmployeeSitePhoto(file) {
    if (!employeeSiteState || !isDeliveryNotePhoto(file)) {
      elements.employeeSitePhotoMessage.textContent =
        "Bitte ein JPG-, PNG- oder WebP-Foto mit höchstens 5 MB auswählen.";
      return;
    }
    elements.employeeSitePhotoAdd.disabled = true;
    elements.employeeSitePhotoMessage.textContent = "Foto wird sicher gespeichert …";
    try {
      await requestJson(
        `./api/v1/construction-sites/${encodeURIComponent(employeeSiteState.site.id)}/photos?date=${encodeURIComponent(employeeSiteState.date)}`,
        {
          method: "POST",
          body: JSON.stringify({
            title: `Baustellenfoto · ${new Intl.DateTimeFormat("de-DE", {
              dateStyle: "short",
              timeStyle: "short"
            }).format(new Date())}`,
            fileName: file.name,
            mimeType: documentMimeType(file),
            contentBase64: arrayBufferToBase64(await file.arrayBuffer())
          })
        }
      );
      const body = await requestJson(
        `./api/v1/construction-sites/${encodeURIComponent(employeeSiteState.site.id)}/dashboard?date=${encodeURIComponent(employeeSiteState.date)}`
      );
      renderEmployeeSiteWorkspace(body.dashboard);
      showToast("Baustellenfoto gespeichert.");
    } catch (error) {
      if (error.status === 401) showLogin();
      else elements.employeeSitePhotoMessage.textContent = error.message;
    } finally {
      elements.employeeSitePhotoAdd.disabled = !navigator.onLine;
      elements.employeeSitePhotoInput.value = "";
    }
  }

  function resetEmployeeSiteNoteForm() {
    elements.employeeSiteNoteForm.reset();
    delete elements.employeeSiteNoteForm.dataset.clientNoteId;
    elements.employeeSiteNoteForm.hidden = true;
    elements.employeeSiteNoteMessage.textContent = "";
  }

  async function createEmployeeSiteNote() {
    if (!employeeSiteState || !navigator.onLine) {
      elements.employeeSiteNoteMessage.textContent =
        "Für eine neue Notiz ist momentan eine Verbindung erforderlich.";
      return;
    }
    const submit = elements.employeeSiteNoteForm.querySelector('button[type="submit"]');
    const clientNoteId = elements.employeeSiteNoteForm.dataset.clientNoteId || createClientEntryId();
    elements.employeeSiteNoteForm.dataset.clientNoteId = clientNoteId;
    submit.disabled = true;
    elements.employeeSiteNoteMessage.textContent = "Notiz wird gespeichert …";
    try {
      await requestJson(
        `./api/v1/construction-sites/${encodeURIComponent(employeeSiteState.site.id)}/notes?date=${encodeURIComponent(employeeSiteState.date)}`,
        {
          method: "POST",
          body: JSON.stringify({
            clientNoteId,
            content: elements.employeeSiteNoteContent.value,
            isImportant: elements.employeeSiteNoteImportant.checked
          })
        }
      );
      resetEmployeeSiteNoteForm();
      const body = await requestJson(
        `./api/v1/construction-sites/${encodeURIComponent(employeeSiteState.site.id)}/dashboard?date=${encodeURIComponent(employeeSiteState.date)}`
      );
      renderEmployeeSiteWorkspace(body.dashboard);
      showToast("Baustellennotiz gespeichert.");
    } catch (error) {
      if (error.status === 401) showLogin();
      else elements.employeeSiteNoteMessage.textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  }

  function currentSiteIndex() {
    if (assignments.length === 0) return 0;
    let latestSiteEventIndex = -1;
    state.events.forEach((entry, index) => {
      if (
        ["site_arrival", "site_departure", "next_site"].includes(entry.type)
        && entry.constructionSiteId
      ) {
        latestSiteEventIndex = index;
      }
    });
    if (latestSiteEventIndex < 0) return 0;
    const latestSiteEvent = state.events[latestSiteEventIndex];
    const candidates = assignments
      .map((assignment, index) => (
        assignment.constructionSite.id === latestSiteEvent.constructionSiteId ? index : -1
      ))
      .filter((index) => index >= 0);
    if (candidates.length === 0) return 0;
    const occurrence = state.events
      .slice(0, latestSiteEventIndex + 1)
      .filter((entry) => (
        entry.type === "next_site"
        && entry.constructionSiteId === latestSiteEvent.constructionSiteId
      )).length;
    return candidates[Math.min(occurrence, candidates.length - 1)];
  }

  function siteChoiceTargetIndex() {
    const current = currentSiteIndex();
    return lastEvent()?.type === "site_departure"
      ? Math.min(current + 1, assignments.length)
      : current;
  }

  function reorderSelectedAssignment(nextAssignments, selectedSiteId, preferLast = false) {
    const ordered = [...nextAssignments];
    let selectedIndex = -1;
    ordered.forEach((assignment, index) => {
      if (
        assignment.constructionSite.id === selectedSiteId
        && (selectedIndex < 0 || preferLast)
      ) {
        selectedIndex = index;
      }
    });
    if (selectedIndex < 0) return;
    const [selected] = ordered.splice(selectedIndex, 1);
    const targetIndex = Math.min(siteChoiceTargetIndex(), ordered.length);
    ordered.splice(targetIndex, 0, selected);
    assignments = ordered;
    saveState();
    render();
  }

  function closeSiteChoice() {
    elements.siteChoiceMessage.textContent = "";
    if (elements.siteChoiceDialog.open) elements.siteChoiceDialog.close();
  }

  function updateFieldSiteHierarchy() {
    const customerId = elements.fieldSiteCustomer.value;
    const createsCustomer = customerId === "__new__";
    elements.fieldSiteNewCustomer.hidden = !createsCustomer;
    elements.fieldSiteCustomerName.required = createsCustomer;
    elements.fieldSiteProject.replaceChildren();
    const automatic = document.createElement("option");
    automatic.value = "";
    automatic.textContent = "Automatisch";
    elements.fieldSiteProject.append(automatic);
    updateFieldSiteProjectMode();
  }

  function updateFieldSiteProjectMode() {
    elements.fieldSiteNewProject.hidden = true;
    elements.fieldSiteProjectName.required = false;
  }

  function renderSiteChoiceOptions(options) {
    siteOptionsState = options;
    const targetIndex = siteChoiceTargetIndex();
    const suggested = assignments[targetIndex] || assignments[0] || null;
    elements.siteChoiceSuggestion.textContent = suggested
      ? `Vorgeschlagen laut Baustellenplan: ${suggested.constructionSite.name}`
      : "Für heute ist keine Baustelle vorgeschlagen. Du kannst eine vorhandene wählen oder eine neue anlegen.";

    const suggestedIds = new Set(
      (options.suggestedAssignments || []).map(
        (assignment) => assignment.constructionSite.id
      )
    );
    elements.siteChoiceSelect.replaceChildren();
    (options.sites || []).forEach((site) => {
      const option = document.createElement("option");
      option.value = site.id;
      option.textContent = `${
        suggestedIds.has(site.id) ? "Vorschlag · " : ""
      }${site.name}${site.customerName ? ` · ${site.customerName}` : ""}`;
      option.selected = site.id === suggested?.constructionSite.id;
      elements.siteChoiceSelect.append(option);
    });

    elements.fieldSiteCustomer.replaceChildren();
    (options.customers || []).forEach((customer) => {
      const option = document.createElement("option");
      option.value = customer.id;
      option.textContent = `${customer.displayName} · ${customer.number}`;
      elements.fieldSiteCustomer.append(option);
    });
    const createCustomer = document.createElement("option");
    createCustomer.value = "__new__";
    createCustomer.textContent = "＋ Neuen Kunden anlegen";
    elements.fieldSiteCustomer.append(createCustomer);
    if (!(options.customers || []).length) elements.fieldSiteCustomer.value = "__new__";
    updateFieldSiteHierarchy();
    const hasSites = elements.siteChoiceSelect.options.length > 0;
    elements.siteChoiceSelect.disabled = !hasSites;
    elements.siteChoiceSubmit.disabled = !hasSites;
    elements.fieldSiteSubmit.disabled = false;
  }

  async function openSiteChoice() {
    if (demoMode) {
      renderSiteChoiceOptions({
        suggestedAssignments: assignments,
        sites: assignments.map((assignment) => ({
          id: assignment.constructionSite.id,
          name: assignment.constructionSite.name,
          projectName: "Demo"
        })),
        projects: []
      });
      elements.siteChoiceDialog.showModal();
      return;
    }
    if (!navigator.onLine) {
      showToast("Andere oder neue Baustellen können gewählt werden, sobald wieder eine Verbindung besteht.");
      return;
    }
    elements.siteChoiceMessage.textContent = "Baustellen werden geladen …";
    elements.siteChoiceDialog.showModal();
    try {
      const body = await requestJson(
        `./api/v1/time-tracking/site-options/${encodeURIComponent(state.workDate)}`
      );
      renderSiteChoiceOptions(body.options);
      elements.siteChoiceMessage.textContent = "";
    } catch (error) {
      if (error.status === 401) showLogin();
      else elements.siteChoiceMessage.textContent = error.message;
    }
  }

  async function applySelectedSite(selectedSiteId) {
    if (!selectedSiteId) return;
    const targetIndex = siteChoiceTargetIndex();
    const existingIndex = assignments.findIndex(
      (assignment) => assignment.constructionSite.id === selectedSiteId
    );
    const newOccurrence = lastEvent()?.type === "site_departure"
      && existingIndex >= 0
      && existingIndex < targetIndex;
    let nextAssignments = assignments;
    if (!demoMode) {
      const body = await requestJson("./api/v1/time-tracking/site-selection", {
        method: "POST",
        body: JSON.stringify({
          workDate: state.workDate,
          constructionSiteId: selectedSiteId,
          newOccurrence
        })
      });
      nextAssignments = body.selection.assignments;
    } else if (newOccurrence) {
      const previous = assignments[existingIndex];
      nextAssignments = [
        ...assignments,
        {
          ...previous,
          id: `demo-return-${Date.now()}`,
          sequenceNumber: assignments.length + 1
        }
      ];
    }
    reorderSelectedAssignment(nextAssignments, selectedSiteId, newOccurrence);
    closeSiteChoice();
    if (lastEvent()?.type === "site_departure") {
      addEntry("next_site", targetIndex);
    }
    showToast("Baustelle gewählt · der Baustellenplan bleibt als Vorschlag erhalten.");
  }

  function lastEvent() {
    return state.events.at(-1);
  }

  function siteIndexForId(siteId) {
    const index = assignments.findIndex((assignment) => assignment.constructionSite.id === siteId);
    return index >= 0 ? index : null;
  }

  function reportForAssignment(assignment) {
    if (!assignment) return null;
    if (assignment.mobileReport) return assignment.mobileReport;
    return (state.reports || []).find((report) => (
      report.assignmentId === assignment.id
      || (
        report.constructionSiteId === assignment.constructionSite.id
        && report.workDate === state.workDate
      )
    )) || null;
  }

  function closeMobileReportForm() {
    elements.mobileReportCard.hidden = true;
    elements.mobileReportMessage.textContent = "";
    mobileReportLeavesSite = true;
  }

  function mobileReportDraftFor(assignment) {
    return state.reportDraft?.assignmentId === assignment?.id
      && state.reportDraft?.workDate === state.workDate
      ? state.reportDraft
      : null;
  }

  function updateMobileReportPersonnelTotal() {
    const total = collectMobileReportPersonnel()
      .reduce((sum, entry) => sum + entry.minutes, 0);
    elements.mobileReportPersonnelTotal.textContent = `Gesamt: ${formatMinutes(total)} h`;
  }

  function updateMobileReportTypeFields() {
    const isDaily = elements.mobileReportType.value === "daily";
    elements.mobileReportWeatherField.hidden = !isDaily;
    elements.mobileReportWeather.hidden = !isDaily;
    if (!isDaily) elements.mobileReportWeather.value = "";
    updateMobileReportCheck();
  }

  function updateMobileReportCheck() {
    const missing = [];
    if (elements.mobileReportSummary.value.trim().length < 2) missing.push("Kurzbeschreibung");
    if (elements.mobileReportDetails.value.trim().length < 2) missing.push("Leistungen");
    if (
      session?.user?.id
      && !collectMobileReportPersonnel().some((entry) => entry.userId === session.user.id)
    ) {
      missing.push("eigene Stunden");
    }
    elements.mobileReportCheck.classList.toggle("mobile-report-check--warning", missing.length > 0);
    elements.mobileReportCheck.querySelector("strong").textContent = missing.length
      ? `${missing.length} Pflichtangabe${missing.length === 1 ? "" : "n"} fehlt`
      : "Bericht ist vollständig";
    elements.mobileReportCheck.querySelector("span").textContent = missing.length
      ? missing.join(" · ")
      : "Alle Pflichtangaben sind vorhanden. Weitere Angaben bleiben optional.";
  }

  function saveMobileReportDraft() {
    const assignment = assignments[currentSiteIndex()];
    if (!assignment || elements.mobileReportCard.hidden) return;
    state.reportDraft = {
      assignmentId: assignment.id,
      workDate: state.workDate,
      reportType: elements.mobileReportType.value,
      summary: elements.mobileReportSummary.value,
      workPerformed: elements.mobileReportDetails.value,
      obstructions: elements.mobileReportObstructions.value,
      openItems: elements.mobileReportOpenItems.value,
      weather: elements.mobileReportWeather.value,
      materialsAndEquipment: elements.mobileReportMaterials.value,
      agreements: elements.mobileReportAgreements.value,
      incidents: elements.mobileReportIncidents.value,
      personnel: collectMobileReportPersonnel()
    };
    saveState();
  }

  function currentSiteMinutes(assignment) {
    const arrival = [...state.events].reverse().find((entry) => (
      entry.type === "site_arrival"
      && entry.constructionSiteId === assignment.constructionSite.id
    ));
    if (!arrival) return null;
    const minutes = Math.max(15, Math.round((Date.now() - new Date(arrival.recordedAt).valueOf()) / 900000) * 15);
    return Math.min(minutes, 1440);
  }

  function renderMobileReportPersonnel(assignment, team) {
    elements.mobileReportPersonnelList.replaceChildren();
    const members = team.length > 0
      ? team
      : [{
        id: session.user.id,
        name: `${session.user.firstName} ${session.user.lastName}`,
        plannedDurationMinutes: null,
        reportResponsible: true
      }];
    members.forEach((member) => {
      const row = document.createElement("label");
      const name = document.createElement("span");
      const inputWrap = document.createElement("span");
      const input = document.createElement("input");
      const unit = document.createElement("small");
      const isCurrentUser = member.id === session.user.id;
      const minutes = isCurrentUser
        ? currentSiteMinutes(assignment)
        : member.plannedDurationMinutes;
      row.className = "mobile-report-personnel__row";
      name.textContent = member.name;
      input.type = "number";
      input.min = "0";
      input.max = "24";
      input.step = "0.25";
      input.inputMode = "decimal";
      input.dataset.userId = member.id;
      input.setAttribute("aria-label", `Stunden für ${member.name}`);
      input.value = minutes ? String(Math.round(minutes / 15) / 4) : "";
      input.addEventListener("input", () => {
        updateMobileReportPersonnelTotal();
        updateMobileReportCheck();
        saveMobileReportDraft();
      });
      unit.textContent = "Std.";
      inputWrap.append(input, unit);
      row.append(name, inputWrap);
      elements.mobileReportPersonnelList.append(row);
    });
    updateMobileReportPersonnelTotal();
  }

  function collectMobileReportPersonnel() {
    return [...elements.mobileReportPersonnelList.querySelectorAll("input[data-user-id]")]
      .map((input) => ({
        userId: input.dataset.userId,
        minutes: Math.round(Number(input.value) * 60)
      }))
      .filter((entry) => Number.isSafeInteger(entry.minutes) && entry.minutes > 0);
  }

  async function openMobileReportForm(assignment, { leaveAfterSave = true } = {}) {
    mobileReportLeavesSite = leaveAfterSave;
    elements.mobileReportEyebrow.textContent = leaveAfterSave
      ? "Vorarbeiter · Tagesabschluss"
      : "Vorarbeiter · Baustellenbericht";
    elements.mobileReportBadge.textContent = leaveAfterSave ? "Pflicht" : "Zwischenspeichern";
    elements.mobileReportSubmit.textContent = leaveAfterSave
      ? "Bericht speichern & Baustelle verlassen"
      : "Bericht speichern";
    const draft = mobileReportDraftFor(assignment);
    elements.mobileReportSite.textContent = assignment.constructionSite.name;
    elements.mobileReportType.value = draft?.reportType || "daily";
    elements.mobileReportSummary.value = draft?.summary || "";
    elements.mobileReportDetails.value = draft?.workPerformed || "";
    elements.mobileReportObstructions.value = draft?.obstructions || "";
    elements.mobileReportOpenItems.value = draft?.openItems || "";
    elements.mobileReportWeather.value = draft?.weather || "";
    elements.mobileReportMaterials.value = draft?.materialsAndEquipment || "";
    elements.mobileReportAgreements.value = draft?.agreements || "";
    elements.mobileReportIncidents.value = draft?.incidents || "";
    elements.mobileReportPersonnelList.replaceChildren();
    elements.mobileReportMessage.textContent = "";
    elements.mobileReportCard.hidden = false;
    elements.mobileReportCard.scrollIntoView({ behavior: "smooth", block: "center" });
    let team = employeeSiteState?.site?.id === assignment.constructionSite.id
      && employeeSiteState.date === state.workDate
      ? employeeSiteState.team
      : [];
    if (navigator.onLine && team.length === 0) {
      elements.mobileReportMessage.textContent = "Heutiges Baustellenteam wird geladen …";
      try {
        const body = await requestJson(
          `./api/v1/construction-sites/${encodeURIComponent(assignment.constructionSite.id)}/dashboard?date=${encodeURIComponent(state.workDate)}`
        );
        employeeSiteState = body.dashboard;
        state.siteWorkspace = body.dashboard;
        saveState();
        team = body.dashboard.team;
        elements.mobileReportMessage.textContent = "";
      } catch (error) {
        if (!error.network) elements.mobileReportMessage.textContent =
          "Team konnte nicht geladen werden. Die eigenen Stunden können trotzdem erfasst werden.";
      }
    }
    renderMobileReportPersonnel(assignment, team);
    (draft?.personnel || []).forEach((entry) => {
      const input = elements.mobileReportPersonnelList.querySelector(
        `input[data-user-id="${entry.userId}"]`
      );
      if (input) input.value = String(Math.round(entry.minutes / 15) / 4);
    });
    updateMobileReportPersonnelTotal();
    updateMobileReportTypeFields();
    updateMobileReportCheck();
    window.setTimeout(() => elements.mobileReportSummary.focus(), 250);
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
    if (demoMode || !navigator.onLine) return;
    if (syncing) {
      syncRequested = true;
      return;
    }
    const pendingReports = (state.reports || []).filter((report) => report.pendingSync && !report.syncError);
    const pending = state.events.filter((entry) => entry.pendingSync && !entry.syncError);
    if (pendingReports.length === 0 && pending.length === 0) return;
    syncing = true;
    updateConnectionState();

    let reportSyncFailed = false;
    for (const report of pendingReports) {
      try {
        const body = await requestJson("./api/v1/site-reports", {
          method: "POST",
          body: JSON.stringify({
            clientReportId: report.clientReportId,
            constructionSiteId: report.constructionSiteId,
            reportType: report.reportType,
            workDate: report.workDate,
            sourceMode: "digital",
            summary: report.summary,
            details: report.details,
            workPerformed: report.workPerformed || report.details || report.summary,
            obstructions: report.obstructions || null,
            openItems: report.openItems || null,
            weather: report.weather || null,
            materialsAndEquipment: report.materialsAndEquipment || null,
            agreements: report.agreements || null,
            incidents: report.incidents || null,
            personnel: report.personnel
          })
        });
        report.id = body.siteReport.id;
        report.number = body.siteReport.number;
        report.status = body.siteReport.status;
        report.pendingSync = false;
        const assignment = assignments.find((item) => item.id === report.assignmentId);
        if (assignment) assignment.mobileReport = {
          id: report.id,
          number: report.number,
          status: report.status
        };
      } catch (error) {
        if (!error.network) report.syncError = error.message;
        if (error.status === 401) showLogin();
        showToast(error.network ? "Bericht wartet auf Verbindung." : error.message);
        reportSyncFailed = true;
        break;
      }
      saveState();
      render();
    }

    const reportStillPending = (state.reports || []).some((report) => report.pendingSync);
    for (const entry of reportSyncFailed || reportStillPending ? [] : pending) {
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

    const runAgain = syncRequested;
    syncRequested = false;
    syncing = false;
    updateConnectionState();
    await refreshWeekData();
    if (runAgain && navigator.onLine) void syncPendingEntries();
  }

  function handlePrimaryAction() {
    const latest = lastEvent();
    const siteIndex = currentSiteIndex();

    if (!demoMode && state.workDayStatus && state.workDayStatus !== "open") {
      showToast("Dieser Stundenzettel ist nicht mehr für neue Buchungen geöffnet.");
      return;
    }
    if (!latest || latest.type === "clock_out") addEntry("clock_in");
    else if (latest.type === "clock_in" && assignments.length === 0) void openSiteChoice();
    else if (latest.type === "clock_in" || latest.type === "next_site") addEntry("site_arrival", siteIndex);
    else if (latest.type === "site_arrival") {
      const assignment = assignments[siteIndex];
      if (assignment?.reportResponsible && !reportForAssignment(assignment)) {
        openMobileReportForm(assignment);
      } else {
        addEntry("site_departure", siteIndex);
      }
    }
    else if (latest.type === "site_departure" && siteIndex < assignments.length - 1) addEntry("next_site", siteIndex + 1);
    else if (latest.type === "site_departure") void openSiteChoice();
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

    if (!demoMode && state.workDayStatus && state.workDayStatus !== "open") {
      const labels = {
        submitted: ["Stundenzettel abgeschlossen", "Automatisch im Büro sichtbar"],
        approved: ["Stundenzettel abgeschlossen", "Vom Büro geprüft"],
        locked: ["Stundenzettel abgerechnet", "Für neue Buchungen gesperrt"]
      };
      const [title, hint] = labels[state.workDayStatus] || labels.submitted;
      setPrimaryAction(title, "✓", true);
      elements.workdayTitle.textContent = title;
      elements.actionHint.textContent = hint;
      return;
    }

    if (!latest) {
      setPrimaryAction("Arbeitstag starten", "▶");
      elements.workdayTitle.textContent = "Noch nicht gestartet";
      elements.actionHint.textContent = "Dein nächster logischer Schritt";
      return;
    }

    if (latest.type === "clock_in" && assignments.length === 0) {
      setPrimaryAction("Baustelle wählen", "⌖");
      elements.secondaryAction.hidden = false;
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
      setPrimaryAction("Nächste Baustelle wählen", "→");
      elements.secondaryAction.hidden = false;
      elements.workdayTitle.textContent = "Letzte Baustelle verlassen";
    } else if (latest.type === "next_site") {
      setPrimaryAction("Auf Baustelle angekommen", "✓");
      elements.workdayTitle.textContent = "Zur nächsten Baustelle";
    } else {
      setPrimaryAction("Arbeitstag erneut starten", "▶");
      elements.workdayTitle.textContent = "Arbeitstag beendet";
    }

    elements.actionHint.textContent = latest.type === "clock_out"
      ? (demoMode ? "Du kannst später einen weiteren Arbeitsblock starten" : "Gespeichert · ein weiterer Start ist jederzeit möglich")
      : (demoMode ? "Jede Buchung erhält eine eindeutige Demo-ID" : "Offline-fähig mit eindeutiger Client-ID");
  }

  function assignmentMeta(assignment) {
    const start = assignment.plannedStartTime
      ? `${assignment.plannedStartTime.slice(0, 5)} Uhr`
      : "Danach";
    return [start, assignment.constructionSite.shortText].filter(Boolean).join(" · ");
  }

  function renderAssignment() {
    const latest = lastEvent();
    elements.siteChoiceOpen.hidden = latest?.type === "site_arrival";
    elements.siteChoiceOpen.textContent = latest?.type === "site_departure"
      ? "Nächste wählen"
      : "Baustelle wählen";
    if (assignments.length === 0) {
      elements.assignmentOrder.textContent = "Heute";
      elements.assignmentTitle.textContent = "Kein Einsatz freigegeben";
      elements.assignmentMeta.textContent = "Die Zeiterfassung kann trotzdem gestartet werden.";
      elements.assignmentCard.classList.remove("assignment-card--active");
      elements.assignmentQuickActions.hidden = true;
      elements.assignmentReport.hidden = true;
      elements.assignmentDetails.disabled = true;
      return;
    }

    elements.assignmentQuickActions.hidden = false;
    elements.assignmentDetails.disabled = false;
    const siteIndex = currentSiteIndex();
    const assignment = assignments[siteIndex];
    let status = assignmentMeta(assignment);

    if (latest?.type === "clock_in" && siteIndex === 0) status = `Anfahrt läuft · ${status}`;
    else if (latest?.type === "site_arrival") status = `Vor Ort · ${status}`;
    else if (latest?.type === "site_departure") status = `Einsatz beendet · ${status}`;
    else if (latest?.type === "next_site") status = `Nächster Einsatz · ${status}`;
    else if (latest?.type === "clock_out") status = "Arbeitsblock beendet";

    elements.assignmentOrder.textContent = `${siteIndex + 1} von ${assignments.length}`;
    elements.assignmentTitle.textContent = assignment.constructionSite.name;
    elements.assignmentMeta.textContent = status;
    elements.assignmentNavigation.href = siteNavigationUrl(assignment.constructionSite);
    const showReportAction = latest?.type === "site_arrival"
      && assignment.reportResponsible
      && !reportForAssignment(assignment);
    elements.assignmentReport.hidden = !showReportAction;
    elements.assignmentQuickActions.classList.toggle(
      "assignment-quick-actions--report",
      showReportAction
    );
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
    const now = new Date();
    const clockIn = state.events.find((entry) => entry.type === "clock_in");
    const latest = lastEvent();
    const endTime = latest?.type === "clock_out" ? new Date(latest.recordedAt) : now;
    const gross = clockIn ? durationMinutes(endTime - new Date(clockIn.recordedAt)) : 0;
    let recordedWork = 0;
    let activeStart = null;

    state.events.forEach((entry) => {
      if (entry.type === "clock_in") {
        activeStart = new Date(entry.recordedAt);
      } else if (entry.type === "clock_out" && activeStart) {
        recordedWork += durationMinutes(new Date(entry.recordedAt) - activeStart);
        activeStart = null;
      }
    });
    if (activeStart) recordedWork += durationMinutes(now - activeStart);

    const explicitPause = Math.max(gross - recordedWork, 0);
    const requiredPause = gross >= 360 ? 60 : gross >= 210 ? 30 : 0;
    const pause = Math.max(explicitPause, requiredPause);
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
    elements.liveDuration.textContent = formatMinutes(times.work);
    elements.grossTime.textContent = formatMinutes(times.gross);
    elements.breakTime.textContent = formatMinutes(times.pause);
    elements.workTime.textContent = formatMinutes(times.work);
    elements.travelTime.textContent = formatMinutes(times.travel);
    const latest = lastEvent();
    elements.statusWorkTime.textContent = formatMinutes(times.work);
    elements.statusSince.textContent = !latest
      ? "Bereit zum Start"
      : `${latest.type === "clock_out" ? "Beendet um" : "Seit"} ${timeFormatter.format(new Date(latest.recordedAt))} Uhr`;
    const currentAssignment = assignments[currentSiteIndex()];
    elements.foremanBadge.hidden = !(
      session?.user.roles?.includes("foreman")
      || currentAssignment?.reportResponsible
    );
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

  function timeEntryTypeLabel(type) {
    return {
      clock_in: "Arbeitsbeginn",
      site_arrival: "Ankunft Baustelle",
      site_departure: "Abfahrt Baustelle",
      next_site: "Wechsel zur nächsten Baustelle",
      clock_out: "Feierabend"
    }[type] || type;
  }

  function localDateTimeInputValue(instant) {
    const date = new Date(instant);
    const offset = date.getTimezoneOffset() * 60_000;
    return new Date(date.valueOf() - offset).toISOString().slice(0, 16);
  }

  function closeTimeCorrectionForm() {
    correctingTimeEntryId = null;
    elements.timeCorrectionForm.reset();
    elements.timeCorrectionMessage.textContent = "";
    if (elements.timeCorrectionDialog.open) elements.timeCorrectionDialog.close();
  }

  function openTimeCorrectionForm(entry) {
    if (demoMode || entry.pendingSync || entry.syncError || entry.pendingCorrection) return;
    correctingTimeEntryId = entry.id;
    elements.timeCorrectionTitle.textContent =
      `${timeEntryTypeLabel(entry.type)} korrigieren`;
    elements.timeCorrectionOriginal.textContent =
      `Bisher: ${shortDate(localDateKey(new Date(entry.recordedAt)))} · ${
        timeFormatter.format(new Date(entry.recordedAt))
      } Uhr`;
    elements.timeCorrectionAt.value = localDateTimeInputValue(entry.recordedAt);
    elements.timeCorrectionReason.value = "";
    elements.timeCorrectionMessage.textContent = "";
    elements.timeCorrectionDialog.showModal();
    window.setTimeout(() => elements.timeCorrectionAt.focus(), 250);
  }

  function timeAdditionNeedsSite() {
    return ["site_arrival", "site_departure", "next_site"].includes(
      elements.timeAdditionType.value
    );
  }

  function updateTimeAdditionSiteField() {
    const needsSite = timeAdditionNeedsSite();
    elements.timeAdditionSiteField.hidden = !needsSite;
    elements.timeAdditionSite.required = needsSite;
  }

  function closeTimeAdditionForm() {
    addingTimeEntryDate = null;
    elements.timeAdditionForm.reset();
    elements.timeAdditionMessage.textContent = "";
    updateTimeAdditionSiteField();
    if (elements.timeAdditionDialog.open) elements.timeAdditionDialog.close();
  }

  async function openTimeAdditionForm(workDate) {
    addingTimeEntryDate = workDate;
    elements.timeAdditionForm.reset();
    elements.timeAdditionDate.textContent = shortDate(workDate);
    const initial = workDate === localDateKey()
      ? new Date()
      : new Date(`${workDate}T12:00:00`);
    elements.timeAdditionAt.value = localDateTimeInputValue(initial.toISOString());
    elements.timeAdditionMessage.textContent = "Baustellen werden geladen …";
    updateTimeAdditionSiteField();
    elements.timeAdditionDialog.showModal();
    try {
      const body = await requestJson(
        `./api/v1/time-tracking/site-options/${encodeURIComponent(workDate)}`
      );
      elements.timeAdditionSite.replaceChildren();
      body.options.sites.forEach((site) => {
        const option = document.createElement("option");
        option.value = site.id;
        option.textContent = `${site.name}${site.customerName ? ` · ${site.customerName}` : ""}`;
        elements.timeAdditionSite.append(option);
      });
      elements.timeAdditionMessage.textContent = "";
    } catch (error) {
      if (error.status === 401) showLogin();
      else elements.timeAdditionMessage.textContent = error.message;
    }
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
      const correction = document.createElement("button");
      marker.setAttribute("aria-hidden", "true");
      label.textContent = entryLabel(entry);
      const status = demoMode
        ? "lokal vorgemerkt"
        : entry.syncError ? "Synchronisation prüfen" : entry.pendingSync ? "wartet auf Synchronisation" : "synchronisiert";
      meta.textContent = `${timeFormatter.format(new Date(entry.recordedAt))} · ${
        entry.pendingCorrection ? "Änderung wird geprüft" : status
      }`;
      content.append(label, meta);
      correction.type = "button";
      correction.className = entry.pendingCorrection
        ? "entry-list__correction entry-list__correction--pending"
        : "entry-list__correction";
      correction.textContent = entry.pendingCorrection ? "Prüfung offen" : "Korrigieren";
      correction.setAttribute(
        "aria-label",
        entry.pendingCorrection
          ? `${entryLabel(entry)}: Korrektur wird geprüft`
          : `${entryLabel(entry)} korrigieren`
      );
      correction.disabled = demoMode
        || Boolean(entry.pendingSync)
        || Boolean(entry.syncError)
        || Boolean(entry.pendingCorrection);
      if (!correction.disabled) {
        correction.addEventListener("click", () => openTimeCorrectionForm(entry));
      }
      item.append(marker, content, correction);
      elements.entryList.append(item);
    });
  }

  function renderWeek() {
    const today = new Date();
    const weekStart = selectedWeekStart;
    const fallbackTimes = calculatedTimes();
    const fallbackDay = {
      workDate: localDateKey(today),
      workDay: {
        status: state.workDayStatus
          || (lastEvent()?.type === "clock_out" ? "open" : state.events.length ? "open" : null),
        grossMinutes: fallbackTimes.gross,
        breakMinutes: fallbackTimes.pause,
        workMinutes: fallbackTimes.work,
        travelMinutes: fallbackTimes.travel,
        entries: state.events.map((entry) => ({
          id: entry.id,
          entryType: entry.type,
          recordedAt: entry.recordedAt,
          pendingCorrection: entry.pendingCorrection
        }))
      }
    };
    const visibleWeek = weekState?.weekStart === weekStart
      ? weekState
      : {
          weekStart,
          weekEnd: addIsoDays(weekStart, 6),
          days: Array.from({ length: 7 }, (_, offset) => {
            const workDate = addIsoDays(weekStart, offset);
            return workDate === fallbackDay.workDate ? fallbackDay : { workDate, workDay: null };
          }),
          totals: {
            workMinutes: fallbackTimes.work,
            breakMinutes: fallbackTimes.pause,
            travelMinutes: fallbackTimes.travel,
            overtimeMinutes: 0
          }
        };
    const periodStart = dateFromIso(visibleWeek.weekStart);
    const periodEnd = dateFromIso(visibleWeek.weekEnd);
    elements.weekPeriod.textContent = `${
      periodStart.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })
    } – ${periodEnd.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}`;
    elements.weekCurrent.disabled = weekStart === currentWeekStart(today);
    elements.weekNext.disabled = weekStart >= currentWeekStart(today);
    elements.weekTotalWork.textContent = formatMinutes(visibleWeek.totals.workMinutes || 0);
    elements.weekTotalBreak.textContent = formatMinutes(visibleWeek.totals.breakMinutes || 0);
    elements.weekTotalTravel.textContent = formatMinutes(visibleWeek.totals.travelMinutes || 0);
    elements.weekTotalOvertime.textContent = formatMinutes(visibleWeek.totals.overtimeMinutes || 0);
    elements.weekStrip.replaceChildren();
    elements.weekTimesheetList.replaceChildren();
    renderEmployeeTimesheetExport(visibleWeek);

    visibleWeek.days.forEach(({ workDate, workDay }) => {
      const date = dateFromIso(workDate);
      const item = document.createElement("button");
      const dayName = shortDayFormatter.format(date).replace(".", "");
      const isToday = workDate === localDateKey(today);
      item.className = `day-pill${isToday ? " day-pill--today" : ""}`;
      item.type = "button";
      item.setAttribute("aria-label", `${dayName}, ${date.getDate()}.`);
      const name = document.createElement("span");
      const number = document.createElement("strong");
      const status = document.createElement("i");
      name.textContent = dayName;
      number.textContent = String(date.getDate());
      status.textContent = workDay?.entries?.length ? "●" : "";
      status.setAttribute("aria-hidden", "true");
      item.append(name, number, status);
      item.addEventListener("click", () => {
        document.querySelector(`#week-day-${workDate}`)?.scrollIntoView({
          behavior: "smooth",
          block: "center"
        });
      });
      elements.weekStrip.append(item);

      const dayCard = document.createElement("section");
      const heading = document.createElement("div");
      const headingCopy = document.createElement("div");
      const dateLabel = document.createElement("strong");
      const dayStatus = document.createElement("span");
      const total = document.createElement("strong");
      dayCard.id = `week-day-${workDate}`;
      dayCard.className = `week-timesheet-day${isToday ? " week-timesheet-day--today" : ""}`;
      heading.className = "week-timesheet-day__heading";
      dateLabel.textContent = date.toLocaleDateString("de-DE", {
        weekday: "long",
        day: "2-digit",
        month: "2-digit"
      });
      const statusLabels = {
        in_progress: "In Arbeit",
        completed: "Abgeschlossen",
        billed: "Abgerechnet"
      };
      const workflowStatus = workDay?.workflowStatus || (
        workDay?.status === "locked"
          ? "billed"
          : workDay?.entries?.at(-1)?.entryType === "clock_out"
            ? "completed"
            : "in_progress"
      );
      dayStatus.textContent = !workDay
        ? "Keine Buchung"
        : workDay.status === "approved"
          ? "Freigegeben"
          : statusLabels[workflowStatus] || "Erfasst";
      total.textContent = formatMinutes(workDay?.workMinutes || 0);
      headingCopy.append(dateLabel, dayStatus);
      heading.append(headingCopy, total);
      dayCard.append(heading);

      if (!workDay?.entries?.length) {
        const empty = document.createElement("p");
        empty.className = "week-timesheet-day__empty";
        empty.textContent = "Für diesen Tag sind keine Zeiten erfasst.";
        dayCard.append(empty);
      } else {
        const metrics = document.createElement("div");
        metrics.className = "week-day-metrics";
        [
          ["Soll", workDay.targetWorkMinutes],
          ["Brutto", workDay.grossMinutes],
          ["Pause", workDay.breakMinutes],
          ["Fahrt", workDay.travelMinutes],
          ["Mehrzeit", workDay.overtimeMinutes]
        ].forEach(([labelText, minutes]) => {
          const metric = document.createElement("span");
          metric.textContent = `${labelText} ${formatMinutes(minutes || 0)}`;
          metrics.append(metric);
        });
        const entries = document.createElement("div");
        entries.className = "week-day-entries";
        workDay.entries.forEach((entry) => {
          const row = document.createElement("button");
          const copy = document.createElement("span");
          const label = document.createElement("strong");
          const meta = document.createElement("small");
          const action = document.createElement("span");
          row.type = "button";
          row.className = "week-time-entry";
          label.textContent = timeEntryTypeLabel(entry.entryType);
          meta.textContent = timeFormatter.format(new Date(entry.recordedAt));
          action.textContent = entry.pendingCorrection ? "Prüfung offen" : "Ändern";
          action.className = entry.pendingCorrection
            ? "week-time-entry__pending"
            : "week-time-entry__action";
          copy.append(label, meta);
          row.append(copy, action);
          row.disabled = demoMode || Boolean(entry.pendingCorrection);
          if (!row.disabled) {
            row.addEventListener("click", () => openTimeCorrectionForm({
              id: entry.id,
              type: entry.entryType,
              recordedAt: entry.recordedAt,
              pendingCorrection: entry.pendingCorrection,
              pendingSync: false,
              syncError: null
            }));
          }
          entries.append(row);
        });
        dayCard.append(metrics, entries);

        if (workDay.warnings?.length) {
          const warnings = document.createElement("ul");
          warnings.className = "week-day-warnings";
          workDay.warnings.forEach((warning) => {
            const item = document.createElement("li");
            item.textContent = warning.message;
            warnings.append(item);
          });
          dayCard.append(warnings);
        }

        if (!demoMode) {
          const addMissing = document.createElement("button");
          addMissing.type = "button";
          addMissing.className = "button button--quiet week-day-addition";
          addMissing.textContent = "Fehlende Buchung ergänzen";
          addMissing.addEventListener("click", () => void openTimeAdditionForm(workDate));
          dayCard.append(addMissing);
        }

        if (workflowStatus === "completed") {
          const stateNote = document.createElement("p");
          stateNote.className = "week-day-state week-day-state--approved";
          stateNote.textContent = workDay.status === "approved"
            ? "Vom Büro freigegeben · im persönlichen Export enthalten"
            : "Arbeitsblock beendet · automatisch im Büro sichtbar";
          dayCard.append(stateNote);
        } else if (workflowStatus === "billed") {
          const stateNote = document.createElement("p");
          stateNote.className = "week-day-state week-day-state--locked";
          stateNote.textContent = "Abgerechnet · im persönlichen Export enthalten";
          dayCard.append(stateNote);
        }
      }
      elements.weekTimesheetList.append(dayCard);
    });
  }

  function renderEmployeeTimesheetExport(visibleWeek) {
    const available = !demoMode && !canPlan();
    elements.employeeTimesheetExportPanel.hidden = !available;
    if (!available) return;
    if (elements.employeeTimesheetExportForm.dataset.weekStart !== visibleWeek.weekStart) {
      elements.employeeTimesheetExportFrom.value = visibleWeek.weekStart;
      elements.employeeTimesheetExportTo.value = visibleWeek.weekEnd;
      elements.employeeTimesheetExportForm.dataset.weekStart = visibleWeek.weekStart;
      elements.employeeTimesheetExportMessage.textContent = "";
    }
    const approvedDays = visibleWeek.days.filter(({ workDay }) => (
      workDay && ["approved", "locked"].includes(workDay.status)
    ));
    const approvedMinutes = approvedDays.reduce(
      (sum, { workDay }) => sum + Number(workDay.workMinutes || 0),
      0
    );
    elements.employeeTimesheetExportSummary.textContent = approvedDays.length
      ? `Diese Woche: ${approvedDays.length} freigegebene${
        approvedDays.length === 1 ? "r Tag" : " Tage"
      } · ${formatMinutes(approvedMinutes)} h. Exportiert werden nur freigegebene oder abgerechnete Tage.`
      : "Diese Woche ist noch kein Tag freigegeben. Du kannst auch einen älteren Zeitraum auswählen.";
    elements.employeeTimesheetExportSubmit.disabled = !navigator.onLine;
    elements.employeeTimesheetExportPdfSubmit.disabled = !navigator.onLine;
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
    const pendingCount = state.events.filter((entry) => entry.pendingSync).length
      + (state.reports || []).filter((report) => report.pendingSync).length;
    elements.connectionState.classList.toggle("connection-state--offline", !online || pendingCount > 0);
    const label = !online ? "Offline" : syncing ? "Sync …" : pendingCount > 0 ? `${pendingCount} offen` : "Online";
    elements.connectionState.querySelector("span").textContent = label;
    elements.employeeTimesheetExportSubmit.disabled = !online;
    elements.employeeTimesheetExportPdfSubmit.disabled = !online;
    if (!elements.employeeSiteWorkspace.hidden) {
      elements.employeeSitePhotoAdd.disabled = !online;
      elements.employeeSiteNoteAdd.disabled = !online;
      elements.employeeSiteTasks
        .querySelectorAll(".employee-site-task-actions button")
        .forEach((button) => { button.disabled = !online; });
      if (!online) {
        elements.employeeSitePhotoMessage.textContent =
          "Fotos können wieder hinzugefügt werden, sobald eine Verbindung besteht.";
        elements.employeeSiteNoteMessage.textContent =
          "Neue Notizen können wieder gespeichert werden, sobald eine Verbindung besteht.";
      }
    }
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
    if (pane !== "start") closeMobileReportForm();
    if (pane !== "week") closeTimeCorrectionForm();
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
        sites: ["Baustellen", "Baustellenplanung", "Baustellen anlegen, durchsuchen und direkt bearbeiten."],
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
      site: "Baustelle",
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
      pendingCorrection: entry.pendingCorrection || null,
      pendingSync: false,
      syncError: null
    }));
  }

  async function refreshWeekData() {
    if (demoMode) {
      weekState = null;
      elements.weekMessage.textContent = "";
      renderWeek();
      return;
    }
    if (!navigator.onLine) {
      elements.weekMessage.textContent = "Die zuletzt geladenen Wochenzeiten werden angezeigt.";
      renderWeek();
      return;
    }
    elements.weekMessage.textContent = "Stundenzettel wird geladen …";
    const requestedWeekStart = selectedWeekStart;
    try {
      const body = await requestJson(`./api/v1/work-weeks/${requestedWeekStart}`);
      if (requestedWeekStart !== selectedWeekStart) return;
      weekState = body.week;
      elements.weekMessage.textContent = "";
      renderWeek();
    } catch (error) {
      if (requestedWeekStart !== selectedWeekStart) return;
      if (error.status === 401) showLogin();
      else {
        elements.weekMessage.textContent = error.network
          ? "Die Wochenzeiten konnten gerade nicht aktualisiert werden."
          : error.message;
      }
    }
  }

  async function selectWeek(weekStart) {
    selectedWeekStart = weekStart;
    weekState = null;
    renderWeek();
    await refreshWeekData();
  }

  async function refreshLiveData() {
    if (demoMode || !navigator.onLine) return;
    const date = localDateKey();
    const pending = state.events.filter((entry) => entry.pendingSync);
    const localReports = (state.reports || []).filter((report) => report.workDate === date);
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
        workDayStatus: workDayBody.workDay?.status || null,
        events: [...persisted, ...pending.filter((entry) => !knownIds.has(entry.clientEntryId))]
          .sort((left, right) => new Date(left.recordedAt) - new Date(right.recordedAt)),
        reports: localReports,
        siteWorkspace: employeeSiteState
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
      weekState = null;
      employeeSiteState = null;
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
    await Promise.all([refreshLiveData(), refreshWeekData(), refreshAdmin()]);
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

  elements.employeeEditForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const employee = adminState?.employees.find((item) => item.id === editingEmployeeId);
    if (!employee) {
      elements.employeeEditMessage.textContent = "Der Mitarbeiter wurde nicht gefunden. Bitte neu laden.";
      return;
    }
    elements.employeeEditSave.disabled = true;
    elements.employeeEditCancel.disabled = true;
    elements.employeeEditMessage.textContent = "Änderungen werden sicher gespeichert …";
    try {
      await requestJson(`./api/v1/admin/employees/${encodeURIComponent(employee.id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          firstName: elements.employeeEditFirstName.value,
          lastName: elements.employeeEditLastName.value,
          personnelNumber: elements.employeeEditPersonnelNumber.value,
          role: elements.employeeEditRole.value,
          rowVersion: employee.rowVersion
        })
      });
      closeEmployeeEditor();
      showToast("Mitarbeiter und Rolle wurden aktualisiert.");
      await Promise.all([refreshAdmin(), refreshLiveData()]);
    } catch (error) {
      elements.employeeEditMessage.textContent = error.message;
    } finally {
      elements.employeeEditSave.disabled = false;
      elements.employeeEditCancel.disabled = false;
    }
  });
  elements.employeeEditCancel.addEventListener("click", closeEmployeeEditor);

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
    elements.customerManagementPanel.hidden = true;
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
      elements.customerManagementPanel.hidden = true;
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
    elements.projectManagementPanel.hidden = true;
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
      elements.projectManagementPanel.hidden = true;
      await refreshAdmin();
      showToast("Projekt aktualisiert.");
    } catch (error) {
      elements.projectEditMessage.textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  });

  elements.siteCustomer.addEventListener("change", updateSiteCustomerMode);
  elements.siteForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const createsCustomer = elements.siteCustomer.value === "__new__";
    const saved = await submitAdminForm(
      elements.siteForm,
      elements.siteMessage,
      "./api/v1/admin/construction-sites",
      {
        customerId: createsCustomer ? null : elements.siteCustomer.value,
        customerName: createsCustomer ? elements.siteCustomerName.value : null,
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
    updateSiteCustomerMode();
    elements.siteMasterDataTools.open = false;
    elements.siteMasterDataTools.hidden = true;
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
      elements.documentMessage.textContent = "Bitte mindestens einen Kunden oder eine Baustelle auswählen.";
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

  elements.siteDashboardAddDocument.addEventListener("click", openDocumentUploadForSite);

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

  elements.siteTaskAdd.addEventListener("click", openTaskForSite);
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

  elements.siteNoteAdd.addEventListener("click", () => {
    resetSiteNoteForm();
    elements.siteNoteForm.dataset.clientNoteId = createClientEntryId();
    elements.siteNoteForm.hidden = false;
    elements.siteNoteContent.focus({ preventScroll: true });
  });
  elements.siteNoteCancel.addEventListener("click", resetSiteNoteForm);
  elements.siteNoteForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const site = adminState?.sites.find((candidate) => candidate.id === openedSiteId);
    if (!site) return;
    const submit = elements.siteNoteForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    elements.siteNoteMessage.textContent = "Notiz wird gespeichert …";
    try {
      await requestJson("./api/v1/admin/site-notes", {
        method: "POST",
        body: JSON.stringify({
          constructionSiteId: site.id,
          clientNoteId: elements.siteNoteForm.dataset.clientNoteId || createClientEntryId(),
          content: elements.siteNoteContent.value,
          isImportant: elements.siteNoteImportant.checked
        })
      });
      resetSiteNoteForm();
      await refreshAdmin();
      showToast("Notiz für die Baustelle gespeichert.");
    } catch (error) {
      elements.siteNoteMessage.textContent = error.message;
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
  elements.siteReportDate.addEventListener("change", renderSiteReportPersonnel);
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
          workPerformed: elements.siteReportDetails.value,
          obstructions: elements.siteReportObstructions.value,
          openItems: elements.siteReportOpenItems.value,
          weather: elements.siteReportType.value === "daily"
            ? elements.siteReportWeather.value
            : null,
          materialsAndEquipment: elements.siteReportMaterials.value,
          agreements: elements.siteReportAgreements.value,
          incidents: elements.siteReportIncidents.value,
          personnel: collectSiteReportPersonnel(),
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
  elements.siteReportFinalizeCancel.addEventListener("click", resetSiteReportFinalization);
  elements.siteReportFinalizeForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const report = adminState?.siteReports.find((candidate) => candidate.id === finalizingReportId);
    if (!report) {
      elements.siteReportFinalizeMessage.textContent = "Der Bericht wurde nicht gefunden. Bitte neu laden.";
      return;
    }
    if (!elements.siteReportEmployeeSignatureName.value.trim() || !elements.siteReportCustomerSignatureName.value.trim()) {
      elements.siteReportFinalizeMessage.textContent = "Bitte beide Namen vollständig eintragen.";
      return;
    }
    if (!employeeSignaturePad.hasInk() || !customerSignaturePad.hasInk()) {
      elements.siteReportFinalizeMessage.textContent = "Bitte beide Unterschriften direkt in den Feldern leisten.";
      return;
    }
    elements.siteReportFinalizeSubmit.disabled = true;
    elements.siteReportFinalizeMessage.textContent = "Unterschriften und unveränderliche PDF-Version werden gespeichert …";
    try {
      await requestJson(`./api/v1/admin/site-reports/${encodeURIComponent(report.id)}/finalize`, {
        method: "POST",
        body: JSON.stringify({
          rowVersion: report.rowVersion,
          employeeSignatureName: elements.siteReportEmployeeSignatureName.value,
          employeeSignatureData: employeeSignaturePad.dataUrl(),
          customerSignatureName: elements.siteReportCustomerSignatureName.value,
          customerSignatureData: customerSignaturePad.dataUrl()
        })
      });
      resetSiteReportFinalization();
      await refreshAdmin();
      showToast("Bericht abgeschlossen. Die unveränderliche PDF ist jetzt verfügbar.");
    } catch (error) {
      elements.siteReportFinalizeMessage.textContent = error.message;
      elements.siteReportFinalizeSubmit.disabled = false;
    }
  });

  elements.mobileReportType.addEventListener("change", () => {
    updateMobileReportTypeFields();
    saveMobileReportDraft();
  });
  elements.mobileReportForm.addEventListener("input", (event) => {
    if (event.target.matches("input[data-user-id]")) return;
    updateMobileReportCheck();
    saveMobileReportDraft();
  });
  elements.mobileReportForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const latest = lastEvent();
    const siteIndex = currentSiteIndex();
    const assignment = assignments[siteIndex];
    if (latest?.type !== "site_arrival" || !assignment?.reportResponsible) {
      elements.mobileReportMessage.textContent = "Der aktuelle Einsatz benötigt keinen Baustellenbericht.";
      return;
    }
    const leaveAfterSave = mobileReportLeavesSite;
    if (reportForAssignment(assignment)) {
      closeMobileReportForm();
      if (leaveAfterSave) addEntry("site_departure", siteIndex);
      else showToast("Der Bericht für diese Baustelle ist bereits gespeichert.");
      return;
    }
    const summary = elements.mobileReportSummary.value.trim();
    if (summary.length < 2) {
      elements.mobileReportMessage.textContent = "Bitte kurz beschreiben, was heute ausgeführt wurde.";
      elements.mobileReportSummary.focus();
      return;
    }
    const workPerformed = elements.mobileReportDetails.value.trim();
    if (workPerformed.length < 2) {
      elements.mobileReportMessage.textContent = "Bitte die ausgeführten Leistungen eintragen.";
      elements.mobileReportDetails.focus();
      return;
    }
    const personnel = collectMobileReportPersonnel();
    if (!personnel.some((entry) => entry.userId === session.user.id)) {
      elements.mobileReportMessage.textContent = "Bitte die eigenen Stunden für diesen Baustellentag eintragen.";
      elements.mobileReportPersonnelList.querySelector(`input[data-user-id="${session.user.id}"]`)?.focus();
      return;
    }
    const report = {
      clientReportId: createClientEntryId(),
      assignmentId: assignment.id,
      constructionSiteId: assignment.constructionSite.id,
      workDate: state.workDate,
      reportType: elements.mobileReportType.value,
      summary,
      details: workPerformed,
      workPerformed,
      obstructions: elements.mobileReportObstructions.value.trim() || null,
      openItems: elements.mobileReportOpenItems.value.trim() || null,
      weather: elements.mobileReportType.value === "daily"
        ? elements.mobileReportWeather.value.trim() || null
        : null,
      materialsAndEquipment: elements.mobileReportMaterials.value.trim() || null,
      agreements: elements.mobileReportAgreements.value.trim() || null,
      incidents: elements.mobileReportIncidents.value.trim() || null,
      personnel,
      pendingSync: !demoMode,
      syncError: null
    };
    if (!Array.isArray(state.reports)) state.reports = [];
    state.reports.push(report);
    state.reportDraft = null;
    saveState();
    closeMobileReportForm();
    if (leaveAfterSave) {
      addEntry("site_departure", siteIndex);
      showToast(navigator.onLine
        ? "Bericht gespeichert · Baustelle wird abgeschlossen."
        : "Bericht offline gespeichert · Synchronisation folgt automatisch.");
    } else {
      render();
      showToast(navigator.onLine
        ? "Bericht gespeichert · du bleibst auf der Baustelle."
        : "Bericht offline gespeichert · du bleibst auf der Baustelle.");
      if (!demoMode && navigator.onLine) void syncPendingEntries();
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
        comment: elements.assignmentComment.value,
        reportResponsible: elements.assignmentReportResponsible.checked
      },
      "Einsatz freigegeben · auf dem Mitarbeiter-Handy sichtbar."
    );
    if (!saved) return;
    elements.assignmentTime.value = "";
    elements.assignmentComment.value = "";
    elements.assignmentReportResponsible.checked = false;
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
          ...(elements.assignmentEditReportResponsible.disabled
            ? {}
            : { reportResponsible: elements.assignmentEditReportResponsible.checked }),
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
  elements.assignmentEmployee.addEventListener("change", updateAssignmentResponsibilityControl);
  elements.adminWeekPrevious.addEventListener("click", () => {
    void refreshAdmin(addIsoDays(adminState?.weekStart || localDateKey(), -7));
  });
  elements.adminWeekNext.addEventListener("click", () => {
    void refreshAdmin(addIsoDays(adminState?.weekStart || localDateKey(), 7));
  });

  elements.adminRefresh.addEventListener("click", () => void refreshAdmin());
  elements.assignmentDate.addEventListener("change", () => void refreshAdmin(elements.assignmentDate.value));
  async function downloadAdminTimesheet(format) {
    const from = elements.timesheetExportFrom.value;
    const to = elements.timesheetExportTo.value;
    if (!from || !to || to < from) {
      elements.timesheetExportMessage.textContent =
        "Bitte einen gültigen Zeitraum auswählen.";
      return;
    }
    const parameters = new URLSearchParams({ from, to });
    if (elements.timesheetExportEmployee.value) {
      parameters.set("employeeId", elements.timesheetExportEmployee.value);
    }
    if (elements.timesheetExportStatus.value) {
      parameters.set("status", elements.timesheetExportStatus.value);
    }
    elements.timesheetExportSubmit.disabled = true;
    elements.timesheetExportPdfSubmit.disabled = true;
    elements.timesheetExportMessage.textContent =
      `${format === "pdf" ? "PDF" : "Excel-Datei"} wird erstellt …`;
    try {
      await downloadFile(
        `./api/v1/admin/timesheets.${format}?${parameters}`,
        `Stundenzettel_${from}_${to}.${format}`
      );
      elements.timesheetExportMessage.textContent =
        `${format === "pdf" ? "PDF" : "Excel-Datei"} wurde heruntergeladen.`;
    } catch (error) {
      if (error.status === 401) showLogin();
      else elements.timesheetExportMessage.textContent = error.message;
    } finally {
      elements.timesheetExportSubmit.disabled = false;
      elements.timesheetExportPdfSubmit.disabled = false;
    }
  }

  elements.timesheetExportForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await downloadAdminTimesheet("xlsx");
  });
  elements.timesheetExportPdfSubmit.addEventListener("click", () => {
    void downloadAdminTimesheet("pdf");
  });

  async function downloadOwnTimesheet(format) {
    const from = elements.employeeTimesheetExportFrom.value;
    const to = elements.employeeTimesheetExportTo.value;
    if (!from || !to || to < from) {
      elements.employeeTimesheetExportMessage.textContent =
        "Bitte einen gültigen Zeitraum auswählen.";
      return;
    }
    if (!navigator.onLine) {
      elements.employeeTimesheetExportMessage.textContent =
        "Der Export ist wieder verfügbar, sobald eine Verbindung besteht.";
      return;
    }
    const parameters = new URLSearchParams({ from, to });
    elements.employeeTimesheetExportSubmit.disabled = true;
    elements.employeeTimesheetExportPdfSubmit.disabled = true;
    elements.employeeTimesheetExportMessage.textContent =
      `Dein freigegebener ${format === "pdf" ? "PDF-Stundenzettel" : "Excel-Stundenzettel"} wird erstellt …`;
    try {
      await downloadFile(
        `./api/v1/timesheets.${format}?${parameters}`,
        `Mein_Stundenzettel_${from}_${to}.${format}`
      );
      elements.employeeTimesheetExportMessage.textContent =
        `Deine ${format === "pdf" ? "PDF-Datei" : "Excel-Datei"} wurde heruntergeladen.`;
    } catch (error) {
      if (error.status === 401) showLogin();
      else elements.employeeTimesheetExportMessage.textContent = error.message;
    } finally {
      elements.employeeTimesheetExportSubmit.disabled = !navigator.onLine;
      elements.employeeTimesheetExportPdfSubmit.disabled = !navigator.onLine;
    }
  }

  elements.employeeTimesheetExportForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await downloadOwnTimesheet("xlsx");
  });
  elements.employeeTimesheetExportPdfSubmit.addEventListener("click", () => {
    void downloadOwnTimesheet("pdf");
  });

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
      employeeSiteState = null;
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
  elements.assignmentDetails.addEventListener("click", openEmployeeSiteWorkspace);
  elements.assignmentReport.addEventListener("click", () => {
    const assignment = assignments[currentSiteIndex()];
    if (assignment) void openMobileReportForm(assignment, { leaveAfterSave: false });
  });
  elements.siteChoiceOpen.addEventListener("click", () => void openSiteChoice());
  elements.siteChoiceCancel.addEventListener("click", closeSiteChoice);
  elements.siteChoiceDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeSiteChoice();
  });
  elements.siteChoiceDialog.addEventListener("click", (event) => {
    if (event.target === elements.siteChoiceDialog) closeSiteChoice();
  });
  elements.siteChoiceForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const siteId = elements.siteChoiceSelect.value;
    if (!siteId) {
      elements.siteChoiceMessage.textContent = "Bitte eine Baustelle auswählen.";
      return;
    }
    elements.siteChoiceSubmit.disabled = true;
    elements.siteChoiceMessage.textContent = "Baustelle wird übernommen …";
    try {
      await applySelectedSite(siteId);
    } catch (error) {
      if (error.status === 401) showLogin();
      else elements.siteChoiceMessage.textContent = error.message;
    } finally {
      elements.siteChoiceSubmit.disabled = false;
    }
  });
  elements.fieldSiteCustomer.addEventListener("change", updateFieldSiteHierarchy);
  elements.fieldSiteProject.addEventListener("change", updateFieldSiteProjectMode);
  elements.fieldSiteForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (demoMode) {
      elements.siteChoiceMessage.textContent = "Neue Baustellen werden nur in der Online-App gespeichert.";
      return;
    }
    const targetIndex = siteChoiceTargetIndex();
    elements.fieldSiteSubmit.disabled = true;
    elements.siteChoiceMessage.textContent = "Neue Baustelle wird angelegt …";
    try {
      const createsCustomer = elements.fieldSiteCustomer.value === "__new__";
      const body = await requestJson("./api/v1/time-tracking/sites", {
        method: "POST",
        body: JSON.stringify({
          workDate: state.workDate,
          customerId: createsCustomer ? null : elements.fieldSiteCustomer.value,
          customerName: createsCustomer ? elements.fieldSiteCustomerName.value : null,
          name: elements.fieldSiteName.value,
          installerShortText: elements.fieldSiteShortText.value,
          street: elements.fieldSiteStreet.value,
          houseNumber: elements.fieldSiteHouseNumber.value,
          postalCode: elements.fieldSitePostalCode.value,
          city: elements.fieldSiteCity.value
        })
      });
      const { assignments: nextAssignments, selectedSiteId } = body.selection;
      reorderSelectedAssignment(nextAssignments, selectedSiteId);
      closeSiteChoice();
      if (lastEvent()?.type === "site_departure") addEntry("next_site", targetIndex);
      elements.fieldSiteForm.reset();
      showToast(
        createsCustomer
          ? "Kunde und Baustelle angelegt · das Büro sieht sie zur Prüfung."
          : "Baustelle angelegt und gewählt · das Büro sieht sie zur Prüfung."
      );
    } catch (error) {
      if (error.status === 401) showLogin();
      else elements.siteChoiceMessage.textContent = error.message;
    } finally {
      elements.fieldSiteSubmit.disabled = false;
    }
  });
  elements.employeeSiteBack.addEventListener("click", () => showDashboardPane("start"));
  elements.employeeSitePhotoAdd.addEventListener("click", () => {
    if (!navigator.onLine) {
      showToast("Für das Foto ist momentan eine Verbindung erforderlich.");
      return;
    }
    elements.employeeSitePhotoInput.click();
  });
  elements.employeeSitePhotoInput.addEventListener("change", () => {
    const [file] = elements.employeeSitePhotoInput.files || [];
    if (file) void uploadEmployeeSitePhoto(file);
  });
  elements.employeeSiteNoteAdd.addEventListener("click", () => {
    if (!navigator.onLine) {
      showToast("Für eine neue Notiz ist momentan eine Verbindung erforderlich.");
      return;
    }
    resetEmployeeSiteNoteForm();
    elements.employeeSiteNoteForm.dataset.clientNoteId = createClientEntryId();
    elements.employeeSiteNoteForm.hidden = false;
    elements.employeeSiteNoteContent.focus({ preventScroll: true });
  });
  elements.employeeSiteNoteCancel.addEventListener("click", resetEmployeeSiteNoteForm);
  elements.employeeSiteNoteForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void createEmployeeSiteNote();
  });
  elements.timeCorrectionForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!correctingTimeEntryId) return;
    if (!navigator.onLine) {
      elements.timeCorrectionMessage.textContent =
        "Eine Korrektur kann gesendet werden, sobald wieder eine Verbindung besteht.";
      return;
    }
    const requestedRecordedAt = new Date(elements.timeCorrectionAt.value);
    const reason = elements.timeCorrectionReason.value.trim();
    if (Number.isNaN(requestedRecordedAt.valueOf())) {
      elements.timeCorrectionMessage.textContent = "Bitte Datum und Uhrzeit vollständig eingeben.";
      return;
    }
    if (reason.length < 5) {
      elements.timeCorrectionMessage.textContent = "Bitte einen kurzen Korrekturgrund eingeben.";
      return;
    }
    elements.timeCorrectionSubmit.disabled = true;
    elements.timeCorrectionCancel.disabled = true;
    elements.timeCorrectionMessage.textContent = "Korrektur wird sicher eingereicht …";
    try {
      await requestJson("./api/v1/time-entry-corrections", {
        method: "POST",
        body: JSON.stringify({
          originalEntryId: correctingTimeEntryId,
          requestedRecordedAt: requestedRecordedAt.toISOString(),
          reason
        })
      });
      closeTimeCorrectionForm();
      await Promise.all([refreshLiveData(), refreshWeekData(), refreshAdmin()]);
      showToast("Änderung eingereicht · die bisherige Zeit bleibt bis zur Prüfung erhalten.");
    } catch (error) {
      if (error.status === 401) showLogin();
      else elements.timeCorrectionMessage.textContent = error.message;
    } finally {
      elements.timeCorrectionSubmit.disabled = false;
      elements.timeCorrectionCancel.disabled = false;
    }
  });
  elements.timeInvalidationSubmit.addEventListener("click", async () => {
    if (!correctingTimeEntryId) return;
    const reason = elements.timeCorrectionReason.value.trim();
    if (reason.length < 5) {
      elements.timeCorrectionMessage.textContent =
        "Bitte zuerst einen kurzen Grund für die Ungültig-Markierung eingeben.";
      return;
    }
    if (!window.confirm("Buchung als ungültig markieren? Sie bleibt in der Historie erhalten.")) return;
    elements.timeCorrectionSubmit.disabled = true;
    elements.timeInvalidationSubmit.disabled = true;
    elements.timeCorrectionCancel.disabled = true;
    elements.timeCorrectionMessage.textContent = "Ungültig-Markierung wird eingereicht …";
    try {
      await requestJson("./api/v1/time-entry-invalidations", {
        method: "POST",
        body: JSON.stringify({
          originalEntryId: correctingTimeEntryId,
          reason
        })
      });
      closeTimeCorrectionForm();
      await Promise.all([refreshLiveData(), refreshWeekData(), refreshAdmin()]);
      showToast("Ungültig-Markierung eingereicht · die Buchung bleibt bis zur Prüfung wirksam.");
    } catch (error) {
      if (error.status === 401) showLogin();
      else elements.timeCorrectionMessage.textContent = error.message;
    } finally {
      elements.timeCorrectionSubmit.disabled = false;
      elements.timeInvalidationSubmit.disabled = false;
      elements.timeCorrectionCancel.disabled = false;
    }
  });
  elements.timeCorrectionCancel.addEventListener("click", closeTimeCorrectionForm);
  elements.timeCorrectionDialog.addEventListener("click", (event) => {
    if (event.target === elements.timeCorrectionDialog) closeTimeCorrectionForm();
  });
  elements.timeCorrectionDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeTimeCorrectionForm();
  });
  elements.timeAdditionType.addEventListener("change", updateTimeAdditionSiteField);
  elements.timeAdditionForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!addingTimeEntryDate) return;
    const recordedAt = new Date(elements.timeAdditionAt.value);
    const reason = elements.timeAdditionReason.value.trim();
    if (Number.isNaN(recordedAt.valueOf())) {
      elements.timeAdditionMessage.textContent = "Bitte Datum und Uhrzeit vollständig eingeben.";
      return;
    }
    if (reason.length < 5) {
      elements.timeAdditionMessage.textContent = "Bitte einen kurzen Ergänzungsgrund eingeben.";
      return;
    }
    if (timeAdditionNeedsSite() && !elements.timeAdditionSite.value) {
      elements.timeAdditionMessage.textContent = "Bitte die zugehörige Baustelle auswählen.";
      return;
    }
    elements.timeAdditionSubmit.disabled = true;
    elements.timeAdditionCancel.disabled = true;
    elements.timeAdditionMessage.textContent = "Ergänzung wird zur Prüfung gesendet …";
    try {
      await requestJson("./api/v1/time-entry-additions", {
        method: "POST",
        body: JSON.stringify({
          workDate: addingTimeEntryDate,
          entryType: elements.timeAdditionType.value,
          recordedAt: recordedAt.toISOString(),
          reason,
          ...(timeAdditionNeedsSite()
            ? { constructionSiteId: elements.timeAdditionSite.value }
            : {})
        })
      });
      closeTimeAdditionForm();
      await Promise.all([refreshLiveData(), refreshWeekData(), refreshAdmin()]);
      showToast("Fehlende Buchung eingereicht · sie wird nach Bürofreigabe wirksam.");
    } catch (error) {
      if (error.status === 401) showLogin();
      else elements.timeAdditionMessage.textContent = error.message;
    } finally {
      elements.timeAdditionSubmit.disabled = false;
      elements.timeAdditionCancel.disabled = false;
    }
  });
  elements.timeAdditionCancel.addEventListener("click", closeTimeAdditionForm);
  elements.timeAdditionDialog.addEventListener("click", (event) => {
    if (event.target === elements.timeAdditionDialog) closeTimeAdditionForm();
  });
  elements.timeAdditionDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeTimeAdditionForm();
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
    void refreshWeekData();
  });
  elements.weekPrevious.addEventListener("click", () => {
    void selectWeek(addIsoDays(selectedWeekStart, -7));
  });
  elements.weekCurrent.addEventListener("click", () => {
    void selectWeek(currentWeekStart());
  });
  elements.weekNext.addEventListener("click", () => {
    if (selectedWeekStart < currentWeekStart()) {
      void selectWeek(addIsoDays(selectedWeekStart, 7));
    }
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
    resetSiteReportFinalization();
    resetSiteTaskForm();
    resetSiteNoteForm();
    resetSiteMaterialForm();
    openedSiteId = null;
    elements.siteEditForm.hidden = true;
    elements.siteDashboard.hidden = true;
  });
  elements.siteDashboardPlanAssignment.addEventListener("click", openAssignmentPlanningForSite);
  elements.siteDashboardCreateReport.addEventListener("click", openReportForSite);
  elements.siteDashboardAddDocumentShortcut.addEventListener("click", openDocumentUploadForSite);
  elements.siteDashboardCreateTask.addEventListener("click", openTaskForSite);
  elements.siteDashboardEdit.addEventListener("click", openSiteEditor);
  elements.siteEditCancel.addEventListener("click", () => {
    elements.siteEditForm.hidden = true;
    elements.siteDashboardEdit.hidden = false;
    elements.siteEditMessage.textContent = "";
  });
  elements.siteSearch.addEventListener("input", renderSiteList);
  elements.hierarchySearch.addEventListener("input", renderBusinessHierarchy);
  elements.hierarchyStatusFilter.addEventListener("change", renderBusinessHierarchy);
  elements.hierarchyNewCustomer.addEventListener("click", () => {
    openMasterDataForm(
      elements.customerPanel,
      elements.customerType.value === "company"
        ? elements.customerCompanyName
        : elements.customerFirstName
    );
  });
  elements.hierarchyNewProject.addEventListener("click", () => {
    openMasterDataForm(elements.projectPanel, elements.projectName);
  });
  elements.hierarchyNewSite.addEventListener("click", () => {
    openMasterDataForm(elements.siteFormPanel, elements.siteName);
  });
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
