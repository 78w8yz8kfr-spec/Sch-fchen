import {
  addIsoDays,
  addIsoMonths,
  assignmentDurationLabel,
  assignmentStartMinutes,
  calculateTimes,
  currentWeekStart,
  durationHoursToMinutes,
  durationMinutes,
  formatMinutes,
  formatSignedMinutes,
  greetingForHour,
  localDateKey
} from "./core/work-time.js?v=0.44.18";
import { serverIsNewer } from "./core/versions.js?v=0.44.18";
import {
  buildReportPayload,
  buildTimeEntryPayload,
  classifySyncError,
  selectPendingWork,
  syncErrorMessage,
  timeEntriesMayFollow
} from "./core/sync-queue.js?v=0.44.18";
import {
  canPlan as canPlanFor,
  editableEmployeeRole,
  employeeRoleLabel,
  isProjectScopedSession as isProjectScopedSessionFor,
  plannableEmployees,
  sessionAccessSignature,
  sessionRoles
} from "./core/permissions.js?v=0.44.18";
import {
  COMPANY_STORAGE_KEY,
  ONLINE_STORAGE_KEY,
  carriedOverMessage,
  initialState as freshState,
  normalizeCompanyNumber,
  rememberedCompany,
  restoreState,
  serializeState,
  storageKey
} from "./core/state-store.js?v=0.44.18";
import { createDeviceModule } from "./core/device-management.js?v=0.44.18";
import { baustellenAusEinsaetzen, createStockModule } from "./core/stock-module.js?v=0.44.18";
import { materialBestand, materialBestandText } from "./core/stock-management.js?v=0.44.18";
import { apprenticeTodayPrompt } from "./core/apprentice-view.js?v=0.44.18";

(() => {
  const DOCUMENT_CACHE_VERSION = "v42";
  // Karten je Zelle der Plantafel, bevor der Rest zusammengefaltet wird.
  const PLANNING_CARDS_PER_CELL = 2;
  const DOCUMENT_CACHE_PREFIX = `schaefchen-documents-${DOCUMENT_CACHE_VERSION}-`;
  const queryMode = new URLSearchParams(window.location.search).get("mode");
  const demoMode = queryMode === "demo" || (
    queryMode !== "live"
    && (window.location.hostname.endsWith("github.io") || window.location.port === "4173")
  );

  const demoAssignments = [
    {
      sequenceNumber: 1,
      plannedStartTime: "07:30:00",
      plannedDurationMinutes: 420,
      comment: "Unterverteilung fertigstellen und Beschriftung fotografieren.",
      constructionSite: {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Demo · Musterstraße 12",
        shortText: "Verteilung erneuern"
      }
    },
    {
      sequenceNumber: 2,
      plannedStartTime: null,
      plannedDurationMinutes: 120,
      comment: "Leuchten prüfen und offene Punkte als Notiz erfassen.",
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
    changeCompany: document.querySelector("#change-company"),
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
    sidebarToggle: document.querySelector("#sidebar-toggle"),
    timePageHeading: document.querySelector("#time-page-heading"),
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
    employeeSiteSectionButtons: [...document.querySelectorAll("[data-employee-site-section-button]")],
    employeeSiteSections: [...document.querySelectorAll("[data-employee-site-section]")],
    employeeSiteVdeTab: document.querySelector("#employee-site-vde-tab"),
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
    employeeSiteReportSearch: document.querySelector("#employee-site-report-search"),
    employeeSiteDocumentCount: document.querySelector("#employee-site-document-count"),
    employeeSiteDocuments: document.querySelector("#employee-site-documents"),
    employeeSiteDocumentSearch: document.querySelector("#employee-site-document-search"),
    employeeSitePhotoCount: document.querySelector("#employee-site-photo-count"),
    employeeSitePhotoAdd: document.querySelector("#employee-site-photo-add"),
    employeeSitePhotoInput: document.querySelector("#employee-site-photo-input"),
    employeeSitePhotoMessage: document.querySelector("#employee-site-photo-message"),
    employeeSitePhotos: document.querySelector("#employee-site-photos"),
    employeeSitePhotoSearch: document.querySelector("#employee-site-photo-search"),
    employeeSiteMaterialCount: document.querySelector("#employee-site-material-count"),
    employeeSiteMaterials: document.querySelector("#employee-site-materials"),
    employeeSiteMaterialAdd: document.querySelector("#employee-site-material-add"),
    employeeSiteMaterialForm: document.querySelector("#employee-site-material-form"),
    employeeSiteMaterialItem: document.querySelector("#employee-site-material-item"),
    employeeSiteMaterialItemLabel: document.querySelector("#employee-site-material-item-label"),
    employeeSiteMaterialName: document.querySelector("#employee-site-material-name"),
    employeeSiteMaterialQuantity: document.querySelector("#employee-site-material-quantity"),
    employeeSiteMaterialUnit: document.querySelector("#employee-site-material-unit"),
    employeeSiteMaterialStatus: document.querySelector("#employee-site-material-status"),
    employeeSiteMaterialNote: document.querySelector("#employee-site-material-note"),
    employeeSiteMaterialCancel: document.querySelector("#employee-site-material-cancel"),
    employeeSiteMaterialMessage: document.querySelector("#employee-site-material-message"),
    employeeSiteReportWrite: document.querySelector("#employee-site-report-write"),
    employeeSiteVdeModule: document.querySelector("#employee-site-vde-module"),
    employeeSiteVdeCount: document.querySelector("#employee-site-vde-count"),
    employeeSiteVdeStart: document.querySelector("#employee-site-vde-start"),
    employeeSiteVdeInspections: document.querySelector("#employee-site-vde-inspections"),
    connectionState: document.querySelector("#connection-state"),
    platformAnnouncements: document.querySelector("#platform-announcements"),
    platformAnnouncementList: document.querySelector("#platform-announcement-list"),
    todayLabel: document.querySelector("#today-label"),
    weekStrip: document.querySelector("#week-strip"),
    weekPeriod: document.querySelector("#week-period"),
    weekNumber: document.querySelector("#week-number"),
    weekDaysTitle: document.querySelector("#week-days-title"),
    apprenticePanel: document.querySelector("#apprentice-panel"),
    apprenticeStatus: document.querySelector("#apprentice-status"),
    apprenticeWeek: document.querySelector("#apprentice-week"),
    apprenticeReturn: document.querySelector("#apprentice-return"),
    apprenticeLock: document.querySelector("#apprentice-lock"),
    apprenticeFactName: document.querySelector("#apprentice-fact-name"),
    apprenticeFactYear: document.querySelector("#apprentice-fact-year"),
    apprenticeFactOccupation: document.querySelector("#apprentice-fact-occupation"),
    apprenticeProgress: document.querySelector("#apprentice-progress"),
    apprenticeRemarkCount: document.querySelector("#apprentice-remark-count"),
    apprenticePreview: document.querySelector("#apprentice-preview"),
    apprenticePreviewPanel: document.querySelector("#apprentice-preview-panel"),
    apprenticePreviewFrame: document.querySelector("#apprentice-preview-frame"),
    apprenticePreviewState: document.querySelector("#apprentice-preview-state"),
    apprenticeOpen: document.querySelector("#apprentice-open"),
    apprenticeForm: document.querySelector("#apprentice-form"),
    apprenticeDays: document.querySelector("#apprentice-days"),
    apprenticeWeekRemark: document.querySelector("#apprentice-week-remark"),
    apprenticeSave: document.querySelector("#apprentice-save"),
    apprenticeWithdraw: document.querySelector("#apprentice-withdraw"),
    apprenticePrint: document.querySelector("#apprentice-print"),
    apprenticePrintBook: document.querySelector("#apprentice-print-book"),
    apprenticeMissing: document.querySelector("#apprentice-missing"),
    apprenticeMissingText: document.querySelector("#apprentice-missing-text"),
    apprenticeMissingWeeks: document.querySelector("#apprentice-missing-weeks"),
    apprenticePeople: document.querySelector("#apprentice-people"),
    apprenticeSubmit: document.querySelector("#apprentice-submit"),
    apprenticeMessage: document.querySelector("#apprentice-message"),
    apprenticeHistory: document.querySelector("#apprentice-history"),
    apprenticeTodaySection: document.querySelector("#apprentice-today-section"),
    apprenticeTodayState: document.querySelector("#apprentice-today-state"),
    apprenticeTodaySummary: document.querySelector("#apprentice-today-summary"),
    apprenticeTodayOpen: document.querySelector("#apprentice-today-open"),
    apprenticeTodayOpenLabel: document.querySelector("#apprentice-today-open-label"),
    apprenticeTodayDialog: document.querySelector("#apprentice-today-dialog"),
    apprenticeTodayForm: document.querySelector("#apprentice-today-form"),
    apprenticeTodayEyebrow: document.querySelector("#apprentice-today-eyebrow"),
    apprenticeTodayMeta: document.querySelector("#apprentice-today-meta"),
    apprenticeTodayText: document.querySelector("#apprentice-today-text"),
    apprenticeTodayClose: document.querySelector("#apprentice-today-close"),
    apprenticeTodayLater: document.querySelector("#apprentice-today-later"),
    apprenticeTodayMessage: document.querySelector("#apprentice-today-message"),
    apprenticeReviewPanel: document.querySelector("#apprentice-review-panel"),
    apprenticeReviewList: document.querySelector("#apprentice-review-list"),
    apprenticeReviewCount: document.querySelector("#apprentice-review-count"),
    apprenticeApproveAll: document.querySelector("#apprentice-approve-all"),
    apprenticeReviewMessage: document.querySelector("#apprentice-review-message"),
    topbarUserName: document.querySelector("#topbar-user-name"),
    topbarUserRole: document.querySelector("#topbar-user-role"),
    accountCard: document.querySelector("#account-card"),
    accountName: document.querySelector("#account-name"),
    accountPersonnelNumber: document.querySelector("#account-personnel-number"),
    accountCompany: document.querySelector("#account-company"),
    accountRoles: document.querySelector("#account-roles"),
    accountLogout: document.querySelector("#account-logout"),
    weekPrevious: document.querySelector("#week-previous"),
    weekCurrent: document.querySelector("#week-current"),
    weekNext: document.querySelector("#week-next"),
    weekTotalWork: document.querySelector("#week-total-work"),
    weekTotalTarget: document.querySelector("#week-total-target"),
    weekTotalDifference: document.querySelector("#week-total-difference"),
    weekTotalBreak: document.querySelector("#week-total-break"),
    weekTotalTravel: document.querySelector("#week-total-travel"),
    weekTotalOvertime: document.querySelector("#week-total-overtime"),
    weekViewButtons: [...document.querySelectorAll("[data-week-view-button]")],
    weekSubareas: [...document.querySelectorAll("[data-week-subarea]")],
    weekOverviewSubarea: document.querySelector("#week-overview-subarea"),
    weekDaysSubarea: document.querySelector("#week-days-subarea"),
    weekAccountSubarea: document.querySelector("#week-account-subarea"),
    weekRequestsSubarea: document.querySelector("#week-requests-subarea"),
    weekOverviewTableCard: document.querySelector("#week-overview-table-card"),
    weekDaysSection: document.querySelector("#week-days-section"),
    weekOverviewTableBody: document.querySelector("#week-overview-table-body"),
    weekMessage: document.querySelector("#week-message"),
    weekTimesheetList: document.querySelector("#week-timesheet-list"),
    timeAccountPanel: document.querySelector("#time-account-panel"),
    timeAccountBalance: document.querySelector("#time-account-balance"),
    timeAccountWeekBreak: document.querySelector("#time-account-week-break"),
    timeAccountWeekTravel: document.querySelector("#time-account-week-travel"),
    timeAccountWeekOvertime: document.querySelector("#time-account-week-overtime"),
    timeAccountStatus: document.querySelector("#time-account-status"),
    timeAccountTargetWork: document.querySelector("#time-account-target-work"),
    timeAccountVacationRemaining: document.querySelector("#time-account-vacation-remaining"),
    timeAccountVacationPending: document.querySelector("#time-account-vacation-pending"),
    timeAccountTimeOff: document.querySelector("#time-account-time-off"),
    timeAccountHolidayCount: document.querySelector("#time-account-holiday-count"),
    timeAccountHolidayStatus: document.querySelector("#time-account-holiday-status"),
    timeAccountHolidayList: document.querySelector("#time-account-holiday-list"),
    timeAccountMonths: document.querySelector("#time-account-months"),
    timeAccountMessage: document.querySelector("#time-account-message"),
    nextHolidayCard: document.querySelector("#next-holiday-card"),
    nextHolidaySummary: document.querySelector("#next-holiday-summary"),
    weekNextAssignment: document.querySelector("#week-next-assignment"),
    weekNextAssignmentName: document.querySelector("#week-next-assignment-name"),
    weekNextAssignmentMeta: document.querySelector("#week-next-assignment-meta"),
    weekOpenActions: document.querySelector("#week-open-actions"),
    weekOpenActionsList: document.querySelector("#week-open-actions-list"),
    overviewCards: document.querySelector("#overview-cards"),
    overviewAccountCard: document.querySelector("#overview-account-card"),
    overviewAccountBalance: document.querySelector("#overview-account-balance"),
    overviewAccountVacation: document.querySelector("#overview-account-vacation"),
    overviewAccountNote: document.querySelector("#overview-account-note"),
    overviewAccountLink: document.querySelector("#overview-account-link"),
    timeAccountAdminPanel: document.querySelector("#time-account-admin-panel"),
    adminYear: document.querySelector("#admin-year"),
    hoursOverviewYear: document.querySelector("#hours-overview-year"),
    hoursOverviewEmployee: document.querySelector("#hours-overview-employee"),
    hoursOverviewBody: document.querySelector("#hours-overview-body"),
    hoursOverviewMessage: document.querySelector("#hours-overview-message"),
    hoursOverviewExport: document.querySelector("#hours-overview-export"),
    timeAccountAdminList: document.querySelector("#time-account-admin-list"),
    timeAccountAdminMessage: document.querySelector("#time-account-admin-message"),
    timeAccountProfileForm: document.querySelector("#time-account-profile-form"),
    timeAccountProfileTitle: document.querySelector("#time-account-profile-title"),
    timeAccountProfileEnabled: document.querySelector("#time-account-profile-enabled"),
    timeAccountProfileStart: document.querySelector("#time-account-profile-start"),
    timeAccountProfileVacation: document.querySelector("#time-account-profile-vacation"),
    timeAccountProfileSave: document.querySelector("#time-account-profile-save"),
    timeAccountProfileCancel: document.querySelector("#time-account-profile-cancel"),
    timeAccountProfileMessage: document.querySelector("#time-account-profile-message"),
    timeAccountAdjustmentDate: document.querySelector("#time-account-adjustment-date"),
    timeAccountAdjustmentHours: document.querySelector("#time-account-adjustment-hours"),
    timeAccountAdjustmentType: document.querySelector("#time-account-adjustment-type"),
    timeAccountAdjustmentNote: document.querySelector("#time-account-adjustment-note"),
    timeAccountAdjustmentSubmit: document.querySelector("#time-account-adjustment-submit"),
    timeCorrectionPolicyAdmin: document.querySelector("#time-correction-policy-admin"),
    timeCorrectionPolicyState: document.querySelector("#time-correction-policy-state"),
    timeCorrectionPolicyStatus: document.querySelector("#time-correction-policy-status"),
    timeCorrectionPolicyForm: document.querySelector("#time-correction-policy-form"),
    timeCorrectionPolicyReason: document.querySelector("#time-correction-policy-reason"),
    timeCorrectionPolicySave: document.querySelector("#time-correction-policy-save"),
    timeCorrectionPolicyMessage: document.querySelector("#time-correction-policy-message"),
    holidayCalendarAdmin: document.querySelector("#holiday-calendar-admin"),
    holidayCalendarYear: document.querySelector("#holiday-calendar-year"),
    holidayCalendarStatus: document.querySelector("#holiday-calendar-status"),
    holidayCalendarForm: document.querySelector("#holiday-calendar-form"),
    holidayCalendarCountry: document.querySelector("#holiday-calendar-country"),
    holidayCalendarState: document.querySelector("#holiday-calendar-state"),
    holidayCalendarSave: document.querySelector("#holiday-calendar-save"),
    holidayCalendarList: document.querySelector("#holiday-calendar-list"),
    holidayClosurePanel: document.querySelector("#holiday-closure-panel"),
    holidayClosureForm: document.querySelector("#holiday-closure-form"),
    holidayClosureDate: document.querySelector("#holiday-closure-date"),
    holidayClosureName: document.querySelector("#holiday-closure-name"),
    holidayClosureNote: document.querySelector("#holiday-closure-note"),
    holidayClosureSubmit: document.querySelector("#holiday-closure-submit"),
    holidayClosureList: document.querySelector("#holiday-closure-list"),
    holidayCalendarMessage: document.querySelector("#holiday-calendar-message"),
    absenceArea: document.querySelector("#absence-area"),
    absencePanel: document.querySelector("#absence-panel"),
    absenceForm: document.querySelector("#absence-form"),
    absenceType: document.querySelector("#absence-type"),
    absenceDayPart: document.querySelector("#absence-day-part"),
    absenceStartDate: document.querySelector("#absence-start-date"),
    absenceEndDate: document.querySelector("#absence-end-date"),
    absenceNote: document.querySelector("#absence-note"),
    absenceSubmit: document.querySelector("#absence-submit"),
    absenceMessage: document.querySelector("#absence-message"),
    absenceOpenCount: document.querySelector("#absence-open-count"),
    absenceList: document.querySelector("#absence-list"),
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
    assignmentInstruction: document.querySelector("#assignment-instruction"),
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
    timeCorrectionDate: document.querySelector("#time-correction-date"),
    timeCorrectionAt: document.querySelector("#time-correction-at"),
    timeCorrectionSiteField: document.querySelector("#time-correction-site-field"),
    timeCorrectionSite: document.querySelector("#time-correction-site"),
    timeCorrectionActivity: document.querySelector("#time-correction-activity"),
    timeCorrectionTravelField: document.querySelector("#time-correction-travel-field"),
    timeCorrectionTravel: document.querySelector("#time-correction-travel"),
    timeCorrectionBreak: document.querySelector("#time-correction-break"),
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
    fieldSiteCustomerError: document.querySelector("#field-site-customer-error"),
    fieldSiteNewCustomer: document.querySelector("#field-site-new-customer"),
    fieldSiteCustomerName: document.querySelector("#field-site-customer-name"),
    fieldSiteCustomerNameError: document.querySelector("#field-site-customer-name-error"),
    fieldSiteProject: document.querySelector("#field-site-project"),
    fieldSiteNewProject: document.querySelector("#field-site-new-project"),
    fieldSiteProjectName: document.querySelector("#field-site-project-name"),
    fieldSiteName: document.querySelector("#field-site-name"),
    fieldSiteNameError: document.querySelector("#field-site-name-error"),
    fieldSiteShortText: document.querySelector("#field-site-short-text"),
    fieldSiteStreet: document.querySelector("#field-site-street"),
    fieldSiteStreetError: document.querySelector("#field-site-street-error"),
    fieldSiteHouseNumber: document.querySelector("#field-site-house-number"),
    fieldSiteHouseNumberError: document.querySelector("#field-site-house-number-error"),
    fieldSitePostalCode: document.querySelector("#field-site-postal-code"),
    fieldSitePostalCodeError: document.querySelector("#field-site-postal-code-error"),
    fieldSiteCity: document.querySelector("#field-site-city"),
    fieldSiteCityError: document.querySelector("#field-site-city-error"),
    fieldSiteSubmit: document.querySelector("#field-site-submit"),
    siteChoiceMessage: document.querySelector("#site-choice-message"),
    timesheetSection: document.querySelector("#timesheet-section"),
    workdayCard: document.querySelector("#workday-card"),
    todayAssignmentSection: document.querySelector("#today-assignment-section"),
    weekSection: document.querySelector("#week-section"),
    siteOverviewAddress: document.querySelector("#site-overview-address"),
    siteOverviewForeman: document.querySelector("#site-overview-foreman"),
    siteOverviewToday: document.querySelector("#site-overview-today"),
    siteOverviewNext: document.querySelector("#site-overview-next"),
    resetDemo: document.querySelector("#reset-demo"),
    bottomNav: document.querySelector(".bottom-nav"),
    navStart: document.querySelector("#nav-start"),
    navWeek: document.querySelector("#nav-week"),
    navTime: document.querySelector("#nav-time"),
    navApprentice: document.querySelector("#nav-apprentice"),
    navMobilePlanning: document.querySelector("#nav-mobile-planning"),
    navMobileDocumentation: document.querySelector("#nav-mobile-documentation"),
    navMobileBusiness: document.querySelector("#nav-mobile-business"),
    apprenticeSection: document.querySelector("#apprentice-section"),
    apprenticeWeekControls: document.querySelector("#apprentice-week-controls"),
    apprenticePeriod: document.querySelector("#apprentice-period"),
    apprenticePrevious: document.querySelector("#apprentice-previous"),
    apprenticeCurrent: document.querySelector("#apprentice-current"),
    apprenticeNext: document.querySelector("#apprentice-next"),
    navAssignments: document.querySelector("#nav-assignments"),
    navSites: document.querySelector("#nav-sites"),
    navReports: document.querySelector("#nav-reports"),
    navInspections: document.querySelector("#nav-inspections"),
    navEmployees: document.querySelector("#nav-employees"),
    navCustomers: document.querySelector("#nav-customers"),
    navVehicles: document.querySelector("#nav-vehicles"),
    navDevices: document.querySelector("#nav-devices"),
    navStock: document.querySelector("#nav-stock"),
    navDocuments: document.querySelector("#nav-documents"),
    navAnalytics: document.querySelector("#nav-analytics"),
    navMore: document.querySelector("#nav-more"),
    infoCard: document.querySelector(".info-card"),
    adminSection: document.querySelector("#admin-section"),
    adminEyebrow: document.querySelector("#admin-eyebrow"),
    adminTitle: document.querySelector("#admin-title"),
    adminIntro: document.querySelector("#admin-intro"),
    settingsTabs: document.querySelector("#settings-tabs"),
    settingsViewButtons: [...document.querySelectorAll("[data-settings-view]")],
    adminSummary: document.querySelector("#admin-summary"),
    dispatchSummary: document.querySelector("#dispatch-summary"),
    dispatchSummaryDate: document.querySelector("#dispatch-summary-date"),
    dispatchPlannedCount: document.querySelector("#dispatch-planned-count"),
    dispatchAbsentCount: document.querySelector("#dispatch-absent-count"),
    dispatchUnassignedCount: document.querySelector("#dispatch-unassigned-count"),
    dispatchActiveCount: document.querySelector("#dispatch-active-count"),
    dispatchReviewCount: document.querySelector("#dispatch-review-count"),
    dispatchSummaryNote: document.querySelector("#dispatch-summary-note"),
    reportCenter: document.querySelector("#report-center"),
    reportCenterSearch: document.querySelector("#report-center-search"),
    reportCenterStatus: document.querySelector("#report-center-status"),
    reportCenterType: document.querySelector("#report-center-type"),
    reportCenterSite: document.querySelector("#report-center-site"),
    reportCenterEmployee: document.querySelector("#report-center-employee"),
    reportCenterFrom: document.querySelector("#report-center-from"),
    reportCenterTo: document.querySelector("#report-center-to"),
    reportCenterSort: document.querySelector("#report-center-sort"),
    reportCenterDraftCount: document.querySelector("#report-center-draft-count"),
    reportCenterOpenCount: document.querySelector("#report-center-open-count"),
    reportCenterReturnedCount: document.querySelector("#report-center-returned-count"),
    reportCenterApprovedCount: document.querySelector("#report-center-approved-count"),
    reportCenterMissingCount: document.querySelector("#report-center-missing-count"),
    reportCenterMissingPanel: document.querySelector("#report-center-missing-panel"),
    reportCenterMissingBadge: document.querySelector("#report-center-missing-badge"),
    reportCenterMissingList: document.querySelector("#report-center-missing-list"),
    reportCenterResultCount: document.querySelector("#report-center-result-count"),
    reportCenterList: document.querySelector("#report-center-list"),
    adminRefresh: document.querySelector("#admin-refresh"),
    assignmentPlanningShell: document.querySelector("#assignment-planning-shell"),
    assignmentPlanningContent: document.querySelector("#assignment-planning-content"),
    sitePlanningShell: document.querySelector("#site-planning-shell"),
    sitePlanningContent: document.querySelector("#site-planning-content"),
    reportsShell: document.querySelector("#reports-shell"),
    reportsContent: document.querySelector("#reports-content"),
    employeesShell: document.querySelector("#employees-shell"),
    employeesContent: document.querySelector("#employees-content"),
    customersShell: document.querySelector("#customers-shell"),
    customersContent: document.querySelector("#customers-content"),
    customerSearchField: document.querySelector("#customer-search-field"),
    customerNew: document.querySelector("#customer-new"),
    customerOverviewList: document.querySelector("#customer-overview-list"),
    documentsShell: document.querySelector("#documents-shell"),
    documentsContent: document.querySelector("#documents-content"),
    vehiclesShell: document.querySelector("#vehicles-shell"),
    deviceModuleRoot: document.querySelector("#device-module"),
    stockModuleRoot: document.querySelector("#stock-module"),
    vehicleSearchField: document.querySelector("#vehicle-search-field"),
    vehicleNew: document.querySelector("#vehicle-new"),
    vehicleList: document.querySelector("#vehicle-list"),
    vehicleForm: document.querySelector("#vehicle-form"),
    vehicleFormTitle: document.querySelector("#vehicle-form-title"),
    vehiclePlate: document.querySelector("#vehicle-plate"),
    vehicleLabel: document.querySelector("#vehicle-label"),
    vehicleType: document.querySelector("#vehicle-type"),
    vehicleLicenceClass: document.querySelector("#vehicle-licence-class"),
    vehicleDriver: document.querySelector("#vehicle-driver"),
    vehicleInspection: document.querySelector("#vehicle-inspection"),
    vehicleService: document.querySelector("#vehicle-service"),
    vehicleStatus: document.querySelector("#vehicle-status"),
    vehicleNote: document.querySelector("#vehicle-note"),
    vehicleSave: document.querySelector("#vehicle-save"),
    vehicleCancel: document.querySelector("#vehicle-cancel"),
    vehicleMessage: document.querySelector("#vehicle-message"),
    inspectionsShell: document.querySelector("#inspections-shell"),
    analyticsShell: document.querySelector("#analytics-shell"),
    analyticsViewButtons: [...document.querySelectorAll("[data-analytics-view]")],
    hoursOverviewCard: document.querySelector("#hours-overview-card"),
    analyticsExportContent: document.querySelector("#analytics-export-content"),
    inspectionSearchField: document.querySelector("#inspection-search-field"),
    inspectionSiteFilter: document.querySelector("#inspection-site-filter"),
    inspectionStatusFilter: document.querySelector("#inspection-status-filter"),
    inspectionActiveTab: document.querySelector("#inspection-active-tab"),
    inspectionArchiveTab: document.querySelector("#inspection-archive-tab"),
    inspectionNew: document.querySelector("#inspection-new"),
    inspectionOverviewList: document.querySelector("#inspection-overview-list"),
    paneMenu: document.querySelector("#pane-menu"),
    dispatchLicenceWarning: document.querySelector("#dispatch-licence-warning"),
    dispatchLicenceTitle: document.querySelector("#dispatch-licence-title"),
    dispatchLicenceList: document.querySelector("#dispatch-licence-list"),
    updateBanner: document.querySelector("#update-banner"),
    updateBannerText: document.querySelector("#update-banner-text"),
    updateBannerReload: document.querySelector("#update-banner-reload"),
    topbarSearch: document.querySelector("#topbar-search"),
    globalSearch: document.querySelector("#global-search"),
    globalSearchResults: document.querySelector("#global-search-results"),
    notificationBell: document.querySelector("#notification-bell"),
    notificationCount: document.querySelector("#notification-count"),
    notificationList: document.querySelector("#notification-list"),
    employeeLicences: document.querySelector("#employee-licences"),
    employeeEditLicences: document.querySelector("#employee-edit-licences"),
    employeeDetail: document.querySelector("#employee-detail"),
    employeeDetailName: document.querySelector("#employee-detail-name"),
    employeeDetailRole: document.querySelector("#employee-detail-role"),
    employeeDetailNumber: document.querySelector("#employee-detail-number"),
    employeeDetailMail: document.querySelector("#employee-detail-mail"),
    employeeDetailPhone: document.querySelector("#employee-detail-phone"),
    employeeDetailBalance: document.querySelector("#employee-detail-balance"),
    employeeDetailLicences: document.querySelector("#employee-detail-licences"),
    employeeDetailEdit: document.querySelector("#employee-detail-edit"),
    quickAccess: document.querySelector("#quick-access"),
    quickAccessMenu: document.querySelector("#quick-access-menu"),
    dashboardLoading: document.querySelector("#dashboard-loading"),
    dashboardLoadingText: document.querySelector("#dashboard-loading-text"),
    dashboardLoadingRetry: document.querySelector("#dashboard-loading-retry"),
    dashboardMetrics: document.querySelector("#dashboard-metrics"),
    metricSites: document.querySelector("#metric-sites"),
    metricEmployees: document.querySelector("#metric-employees"),
    metricEmployeesTotal: document.querySelector("#metric-employees-total"),
    metricEmployeesNote: document.querySelector("#metric-employees-note"),
    metricReports: document.querySelector("#metric-reports"),
    metricOvertime: document.querySelector("#metric-overtime"),
    metricOvertimeLabel: document.querySelector("#metric-overtime-label"),
    todayOverview: document.querySelector("#today-overview"),
    todaySites: document.querySelector("#today-sites"),
    todayActivity: document.querySelector("#today-activity"),
    businessStructurePanel: document.querySelector("#business-structure-panel"),
    adminEmployeeCount: document.querySelector("#admin-employee-count"),
    adminCustomerCount: document.querySelector("#admin-customer-count"),
    adminProjectCount: document.querySelector("#admin-project-count"),
    adminSiteCount: document.querySelector("#admin-site-count"),
    businessHierarchy: document.querySelector("#business-hierarchy"),
    hierarchySearch: document.querySelector("#hierarchy-search"),
    hierarchyStatusFilter: document.querySelector("#hierarchy-status-filter"),
    siteActiveTab: document.querySelector("#site-active-tab"),
    siteArchivedTab: document.querySelector("#site-archived-tab"),
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
    siteDashboardCopyLink: document.querySelector("#site-dashboard-copy-link"),
    siteDashboardEmployees: document.querySelector("#site-dashboard-employees"),
    siteDashboardPlanAssignment: document.querySelector("#site-dashboard-plan-assignment"),
    siteDashboardCreateReport: document.querySelector("#site-dashboard-create-report"),
    siteDashboardAddDocumentShortcut: document.querySelector("#site-dashboard-add-document-shortcut"),
    siteDashboardCreateTask: document.querySelector("#site-dashboard-create-task"),
    siteDashboardReportsPanel: document.querySelector("#site-dashboard-reports-panel"),
    siteDashboardReportCount: document.querySelector("#site-dashboard-report-count"),
    siteDashboardReports: document.querySelector("#site-dashboard-reports"),
    siteDashboardReportSearch: document.querySelector("#site-dashboard-report-search"),
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
    siteReportPhotoList: document.querySelector("#site-report-photo-list"),
    siteReportSummary: document.querySelector("#site-report-summary"),
    siteReportDetails: document.querySelector("#site-report-details"),
    siteReportObstructions: document.querySelector("#site-report-obstructions"),
    siteReportOpenItems: document.querySelector("#site-report-open-items"),
    siteReportWeatherField: document.querySelector("#site-report-weather-field"),
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
    siteDashboardDocumentSearch: document.querySelector("#site-dashboard-document-search"),
    siteDashboardPhotosPanel: document.querySelector("#site-dashboard-photos-panel"),
    siteDashboardPhotoCount: document.querySelector("#site-dashboard-photo-count"),
    siteDashboardPhotos: document.querySelector("#site-dashboard-photos"),
    siteDashboardPhotoSearch: document.querySelector("#site-dashboard-photo-search"),
    siteDashboardAddPhoto: document.querySelector("#site-dashboard-add-photo"),
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
    siteMaterialItem: document.querySelector("#site-material-item"),
    siteMaterialItemLabel: document.querySelector("#site-material-item-label"),
    siteMaterialName: document.querySelector("#site-material-name"),
    siteMaterialQuantity: document.querySelector("#site-material-quantity"),
    siteMaterialUnit: document.querySelector("#site-material-unit"),
    siteMaterialStatus: document.querySelector("#site-material-status"),
    siteMaterialNote: document.querySelector("#site-material-note"),
    siteMaterialCancel: document.querySelector("#site-material-cancel"),
    siteMaterialMessage: document.querySelector("#site-material-message"),
    siteDashboardVdePanel: document.querySelector("#site-dashboard-vde-panel"),
    siteDashboardSectionButtons: [...document.querySelectorAll("[data-site-dashboard-section-button]")],
    siteDashboardSections: [...document.querySelectorAll("[data-site-dashboard-section]")],
    siteDashboardVdeTab: document.querySelector("#site-dashboard-vde-tab"),
    siteDashboardVdeCount: document.querySelector("#site-dashboard-vde-count"),
    siteDashboardVdeStart: document.querySelector("#site-dashboard-vde-start"),
    siteDashboardVdeInspections: document.querySelector("#site-dashboard-vde-inspections"),
    siteDashboardEdit: document.querySelector("#site-dashboard-edit"),
    adminWeek: document.querySelector("#admin-week"),
    siteDashboardClose: document.querySelector("#site-dashboard-close"),
    siteEditForm: document.querySelector("#site-edit-form"),
    siteEditNumber: document.querySelector("#site-edit-number"),
    siteEditProject: document.querySelector("#site-edit-project"),
    siteEditName: document.querySelector("#site-edit-name"),
    siteEditShortText: document.querySelector("#site-edit-short-text"),
    siteEditProjectManager: document.querySelector("#site-edit-project-manager"),
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
    planningBoardView: document.querySelector("#planning-board-view"),
    planningWeekTab: document.querySelector("#planning-week-tab"),
    planningMonthTab: document.querySelector("#planning-month-tab"),
    planningCurrent: document.querySelector("#planning-current"),
    planningPrint: document.querySelector("#planning-print"),
    planningNewAssignment: document.querySelector("#planning-new-assignment"),
    planningBoardEmployee: document.querySelector("#planning-board-employee"),
    planningBoardTeam: document.querySelector("#planning-board-team"),
    planningBoardSite: document.querySelector("#planning-board-site"),
    planningBoardProjectManager: document.querySelector("#planning-board-project-manager"),
    planningBoardStatus: document.querySelector("#planning-board-status"),
    planningBoardSummary: document.querySelector("#planning-board-summary"),
    assignmentEditForm: document.querySelector("#assignment-edit-form"),
    assignmentEditTitle: document.querySelector("#assignment-edit-title"),
    assignmentEditEmployee: document.querySelector("#assignment-edit-employee"),
    assignmentEditDate: document.querySelector("#assignment-edit-date"),
    assignmentEditTime: document.querySelector("#assignment-edit-time"),
    assignmentEditDuration: document.querySelector("#assignment-edit-duration"),
    assignmentEditComment: document.querySelector("#assignment-edit-comment"),
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
    employeePhone: document.querySelector("#employee-phone"),
    employeeEmail: document.querySelector("#employee-email"),
    employeeRole: document.querySelector("#employee-role"),
    employeeWarehouse: document.querySelector("#employee-warehouse"),
    employeeWarehouseField: document.querySelector("#employee-warehouse-field"),
    employeeEditWarehouse: document.querySelector("#employee-edit-warehouse"),
    employeeEditWarehouseField: document.querySelector("#employee-edit-warehouse-field"),
    employeeManagementRoles: [...document.querySelectorAll("[data-management-role]")],
    employeeTemporaryPassword: document.querySelector("#employee-temporary-password"),
    employeeMessage: document.querySelector("#employee-message"),
    employeeList: document.querySelector("#employee-list"),
    employeeSearchField: document.querySelector("#employee-search-field"),
    employeeRoleFilter: document.querySelector("#employee-role-filter"),
    employeeToolbar: document.querySelector("#employee-toolbar"),
    employeeNew: document.querySelector("#employee-new"),
    employeeActiveTab: document.querySelector("#employee-active-tab"),
    employeeArchivedTab: document.querySelector("#employee-archived-tab"),
    employeeActiveContent: document.querySelector("#employee-active-content"),
    archivedEmployeePanel: document.querySelector("#archived-employee-panel"),
    archivedEmployeeCount: document.querySelector("#archived-employee-count"),
    archivedEmployeeList: document.querySelector("#archived-employee-list"),
    employeePanel: document.querySelector("#employee-panel"),
    employeeEditForm: document.querySelector("#employee-edit-form"),
    employeeEditTitle: document.querySelector("#employee-edit-title"),
    employeeEditFirstName: document.querySelector("#employee-edit-first-name"),
    employeeEditLastName: document.querySelector("#employee-edit-last-name"),
    employeeEditPersonnelNumber: document.querySelector("#employee-edit-personnel-number"),
    employeeEditPhone: document.querySelector("#employee-edit-phone"),
    employeeEditEmail: document.querySelector("#employee-edit-email"),
    employeeEditRole: document.querySelector("#employee-edit-role"),
    employeeEditApprenticeship: document.querySelector("#employee-edit-apprenticeship"),
    employeeEditTrainer: document.querySelector("#employee-edit-trainer"),
    employeeEditSave: document.querySelector("#employee-edit-save"),
    employeeEditCancel: document.querySelector("#employee-edit-cancel"),
    employeeEditRemove: document.querySelector("#employee-edit-remove"),
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
    projectManager: document.querySelector("#project-manager"),
    projectMessage: document.querySelector("#project-message"),
    projectManagementPanel: document.querySelector("#project-management-panel"),
    projectEditForm: document.querySelector("#project-edit-form"),
    projectEditNumber: document.querySelector("#project-edit-number"),
    projectEditCustomer: document.querySelector("#project-edit-customer"),
    projectEditName: document.querySelector("#project-edit-name"),
    projectEditShortText: document.querySelector("#project-edit-short-text"),
    projectEditManager: document.querySelector("#project-edit-manager"),
    projectEditStatus: document.querySelector("#project-edit-status"),
    projectEditCancel: document.querySelector("#project-edit-cancel"),
    projectEditMessage: document.querySelector("#project-edit-message"),
    siteFormPanel: document.querySelector("#site-form-panel"),
    siteForm: document.querySelector("#site-form"),
    siteCustomer: document.querySelector("#site-customer"),
    siteNewCustomer: document.querySelector("#site-new-customer"),
    siteCustomerName: document.querySelector("#site-customer-name"),
    siteProjectField: document.querySelector("#site-project-field"),
    siteProject: document.querySelector("#site-project"),
    siteName: document.querySelector("#site-name"),
    siteShortText: document.querySelector("#site-short-text"),
    siteProjectManager: document.querySelector("#site-project-manager"),
    siteStreet: document.querySelector("#site-street"),
    siteHouseNumber: document.querySelector("#site-house-number"),
    sitePostalCode: document.querySelector("#site-postal-code"),
    siteCity: document.querySelector("#site-city"),
    siteMessage: document.querySelector("#site-message"),
    documentManagementPanel: document.querySelector("#document-management-panel"),
    documentForm: document.querySelector("#document-form"),
    documentNew: document.querySelector("#document-new"),
    documentTitle: document.querySelector("#document-title"),
    documentCategory: document.querySelector("#document-category"),
    documentCustomer: document.querySelector("#document-customer"),
    documentProject: document.querySelector("#document-project"),
    documentSite: document.querySelector("#document-site"),
    documentFile: document.querySelector("#document-file"),
    documentFileChoose: document.querySelector("#document-file-choose"),
    documentFileName: document.querySelector("#document-file-name"),
    documentMobileVisible: document.querySelector("#document-mobile-visible"),
    documentOfflinePriority: document.querySelector("#document-offline-priority"),
    documentSubmit: document.querySelector("#document-submit"),
    documentMessage: document.querySelector("#document-message"),
    documentSearch: document.querySelector("#document-search"),
    documentStatusFilter: document.querySelector("#document-status-filter"),
    documentListSummary: document.querySelector("#document-list-summary"),
    documentList: document.querySelector("#document-list"),
    assignmentPanel: document.querySelector("#assignment-panel"),
    assignmentForm: document.querySelector("#assignment-form"),
    assignmentEmployee: document.querySelector("#assignment-employee"),
    assignmentTeam: document.querySelector("#assignment-team"),
    assignmentMemberList: document.querySelector("#assignment-member-list"),
    assignmentSite: document.querySelector("#assignment-site"),
    assignmentDate: document.querySelector("#assignment-date"),
    assignmentTime: document.querySelector("#assignment-time"),
    assignmentDuration: document.querySelector("#assignment-duration"),
    assignmentComment: document.querySelector("#assignment-comment"),
    assignmentReportResponsible: document.querySelector("#assignment-report-responsible"),
    assignmentMessage: document.querySelector("#assignment-message"),
    planningTeamPanel: document.querySelector("#planning-team-panel"),
    planningTeamForm: document.querySelector("#planning-team-form"),
    planningTeamId: document.querySelector("#planning-team-id"),
    planningTeamName: document.querySelector("#planning-team-name"),
    planningTeamMemberList: document.querySelector("#planning-team-member-list"),
    planningTeamReason: document.querySelector("#planning-team-reason"),
    planningTeamSubmit: document.querySelector("#planning-team-submit"),
    planningTeamReset: document.querySelector("#planning-team-reset"),
    planningTeamMessage: document.querySelector("#planning-team-message"),
    planningTeamList: document.querySelector("#planning-team-list"),
    adminAssignmentList: document.querySelector("#admin-assignment-list"),
    timeCorrectionReviewPanel: document.querySelector("#time-correction-review-panel"),
    timeCorrectionReviewCount: document.querySelector("#time-correction-review-count"),
    timeCorrectionReviewList: document.querySelector("#time-correction-review-list"),
    absenceReviewPanel: document.querySelector("#absence-review-panel"),
    absenceReviewCount: document.querySelector("#absence-review-count"),
    absenceReviewList: document.querySelector("#absence-review-list"),
    reportReturnDialog: document.querySelector("#report-return-dialog"),
    reportReturnForm: document.querySelector("#report-return-form"),
    reportReturnNumber: document.querySelector("#report-return-number"),
    reportReturnComment: document.querySelector("#report-return-comment"),
    reportReturnSubmit: document.querySelector("#report-return-submit"),
    reportReturnClose: document.querySelector("#report-return-close"),
    reportReturnMessage: document.querySelector("#report-return-message"),
    siteQrDialog: document.querySelector("#site-qr-dialog"),
    siteQrName: document.querySelector("#site-qr-name"),
    siteQrImage: document.querySelector("#site-qr-image"),
    siteQrLink: document.querySelector("#site-qr-link"),
    siteQrCopy: document.querySelector("#site-qr-copy"),
    siteQrClose: document.querySelector("#site-qr-close"),
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
    elements.siteDashboard
  );
  // Der eigene Arbeitstag steht hinter der Wochenansicht, nicht davor. Wer im
  // Buero sitzt, sieht ihn dort - sein Dashboard zeigt den Betrieb. Fuer alle
  // anderen bleibt er auf dem Dashboard, und die Reihenfolge untereinander
  // aendert sich dabei nicht, weil die Wochenansicht dort verborgen ist.
  elements.weekSection.after(
    elements.timePageHeading,
    elements.workdayCard,
    elements.todayAssignmentSection,
    elements.overviewCards,
    elements.timesheetSection
  );

  // Die Woche war fachlich vollstaendig, aber als eine lange Sammelseite kaum
  // noch zu ueberblicken. Dieselben Karten leben jetzt in vier eindeutigen
  // Unterbereichen; sie werden nur umsortiert, nicht kopiert.
  elements.weekOverviewSubarea.append(
    elements.weekOverviewTableCard,
    elements.weekNextAssignment
  );
  elements.weekDaysSubarea.append(
    elements.weekDaysSection,
    elements.employeeTimesheetExportPanel
  );
  elements.weekAccountSubarea.append(elements.timeAccountPanel);
  elements.weekRequestsSubarea.append(
    elements.absenceArea,
    elements.workDayReviewPanel,
    elements.timeCorrectionReviewPanel,
    elements.absenceReviewPanel
  );

  // Jeder Eintrag der Seitenleiste hat einen eigenen Bereich. Die Tafeln dafuer
  // liegen im Dokument dort, wo sie fachlich hingehoeren, und ziehen hier an
  // ihren Platz - so wie es die Einsatz- und Baustellenplanung schon macht.
  elements.reportsContent.append(elements.reportCenter);
  elements.employeesContent.append(elements.employeePanel);
  elements.documentsContent.append(elements.documentManagementPanel);
  elements.analyticsExportContent.append(elements.timesheetExportPanel);
  elements.customersContent.append(
    elements.customerPanel,
    elements.customerManagementPanel,
    elements.projectPanel,
    elements.projectManagementPanel
  );
  elements.assignmentForm.querySelector('button[type="submit"]').after(elements.assignmentImportPanel);
  elements.siteForm.querySelector('button[type="submit"]').after(elements.siteImportPanel);

  // Auf dem Dashboard steht das volle Datum unter der Begruessung, mit Jahr:
  // dort ist es die Angabe, auf die sich alles darunter bezieht.
  const dashboardDateFormatter = new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
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
  // Angaben des Servers zur Firma der Ersteinrichtung und die zuletzt auf
  // diesem Geraet benutzte Firma. Beide zusammen fuellen das Anmeldeformular.
  let loginSetup = null;
  let currentDashboardPane = "start";
  let currentWeekSubarea = "overview";
  let currentSettingsSubarea = "time-accounts";
  let currentAnalyticsSubarea = "hours";
  // Zu welchem Tag gehoeren die geladenen Einsaetze? Die Schnittstelle liefert
  // sie je Tag und traegt das Datum nicht in den einzelnen Einsatz ein.
  let assignmentsDate = null;
  let apprenticeState = null;
  let apprenticeMissingState = [];
  let apprenticeProfileState = null;
  let apprenticeReviewState = null;
  // Die Differenz der angezeigten Woche. Die Wochenansicht rechnet sie aus,
  // das Dashboard zeigt sie noch einmal als Kennzahl.
  let wochenDifferenzMinuten = 0;
  // Der Mitarbeiter, dessen Spalte rechts neben der Liste steht.
  let selectedEmployeeId = null;
  // Die Fahrzeuge des Fuhrparks und das gerade bearbeitete.
  let vehicleState = [];
  let editingVehicleId = null;
  let editingVehicleRowVersion = null;
  let apprenticeGapState = [];
  // Aufgeklappte Zellen der Plantafel, als "mitarbeiter|datum".
  const expandedPlanningCells = new Set();
  let deviceCompany = null;
  let companyChangeRequested = false;
  let adminState = null;
  // Laeuft die Betriebsuebersicht gerade, oder ist sie gescheitert? Ohne diese
  // Unterscheidung sieht die leere Startseite beim Laden genauso aus wie nach
  // einem Fehler.
  let adminOverviewStatus = "idle";
  // Dauert es laenger als ueblich? Dann sagen wir das auch. "Wird geladen"
  // stimmt nach einer halben Minute zwar noch, hilft aber niemandem mehr.
  let adminOverviewDauert = false;
  let adminOverviewUhr = null;
  let weekState = null;
  let absenceState = [];
  let timeAccountState = null;
  let timeAccountsState = null;
  let timeCorrectionPolicyState = null;
  // Die Verwaltung wertet ein Kalenderjahr aus. Frueher folgte sie der
  // gewaehlten Woche des Monteurs; seit die Bereiche getrennt sind, waere das
  // nicht mehr nachvollziehbar.
  let adminYear = new Date().getFullYear();
  let announcementsState = [];
  let selectedWeekStart = currentWeekStart();
  let editingAssignmentId = null;
  let draggedAssignmentId = null;
  let correctingTimeEntryId = null;
  let correctingTimeEntry = null;
  let correctingTimeEntryAdministrator = false;
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
  let returningReportId = null;
  let deepLinkedSiteHandled = false;
  let editingEmployeeId = null;
  let editingTimeAccountId = null;
  let speechRecognition = null;
  let cachedUserId = null;
  // Hinweis auf Arbeit, die aus einem frueheren Tag mitgenommen wurde. Er wird
  // erst gezeigt, wenn die Oberflaeche steht.
  let pendingCarryOverNotice = null;
  let employeeSiteState = null;
  let employeeSiteSection = "overview";
  let siteDashboardSection = "overview";
  let mobileReportLeavesSite = true;
  let assignments = demoMode ? demoAssignments : [];
  let state = loadState();
  employeeSiteState = state.siteWorkspace || null;

  const deviceModule = createDeviceModule({
    root: elements.deviceModuleRoot,
    requestJson,
    showToast,
    createClientId: createClientEntryId,
    getSession: () => session,
    navigate: (pane) => showDashboardPane(pane),
    onNotificationsChanged: () => renderNotifications()
  });

  // Das Lager bucht auf die Baustelle, auf der der Monteur heute steht. Die
  // Liste kommt deshalb aus seinem Tagesplan und nicht aus dem Baustellenstamm:
  // wer auf der Grundschule arbeitet, soll dort nicht das Rathaus suchen.
  const stockModule = createStockModule({
    root: elements.stockModuleRoot,
    requestJson,
    showToast,
    getSession: () => session,
    navigate: (pane) => showDashboardPane(pane),
    getSites: () => baustellenAusEinsaetzen(assignments)
  });

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

  function initialState() {
    return freshState(localDateKey());
  }

  function loadState() {
    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey(demoMode)));
      const wiederhergestellt = restoreState(saved, { today: localDateKey(), demoMode });
      if (wiederhergestellt.assignments) assignments = wiederhergestellt.assignments;
      if (wiederhergestellt.userId) cachedUserId = wiederhergestellt.userId;
      // Arbeit aus einem frueheren Tag kam mit. Der Mitarbeiter muss erfahren,
      // dass sie noch aussteht, sonst haelt er sie fuer laengst uebertragen.
      if (wiederhergestellt.carriedOver) {
        pendingCarryOverNotice = carriedOverMessage(wiederhergestellt.carriedOver);
      }
      return wiederhergestellt.state;
    } catch {
      // Ein blockierter Speicher darf die App nicht unbenutzbar machen.
    }
    return initialState();
  }

  function saveState() {
    try {
      window.localStorage.setItem(storageKey(demoMode), JSON.stringify(serializeState(state, {
        assignments,
        userId: session?.user.id || cachedUserId,
        demoMode
      })));
    } catch {
      showToast("Lokaler Speicher ist in diesem Browser blockiert.");
    }
  }

  // Die zuletzt benutzte Firma bleibt auf dem Geraet. Ein Monteur soll seine
  // Firmennummer nicht bei jeder Anmeldung heraussuchen muessen, und ein
  // abgemeldetes Geraet gehoert weiterhin zu derselben Firma.
  function loadRememberedCompany() {
    try {
      return JSON.parse(window.localStorage.getItem(COMPANY_STORAGE_KEY));
    } catch {
      return null;
    }
  }

  function rememberCompany(number, displayName) {
    const nummer = normalizeCompanyNumber(number);
    if (!nummer) return;
    deviceCompany = { number: nummer, displayName: displayName || nummer };
    companyChangeRequested = false;
    try {
      window.localStorage.setItem(COMPANY_STORAGE_KEY, JSON.stringify(deviceCompany));
    } catch {
      // Ohne lokalen Speicher wird die Nummer eben wieder eingetippt.
    }
  }

  // Nach welcher Firma wird gefragt?
  //
  // Beim ersten Mal nach jeder: das Geraet weiss noch nicht, zu wem es gehoert.
  // Danach steht die Firma fest und das Feld verschwindet - ein Monteur soll
  // seine Firmennummer nicht bei jeder Anmeldung wiedersehen. Ein stiller Weg
  // zurueck bleibt, sonst kaeme ein einmal falsch eingerichtetes Geraet nie
  // wieder heraus.
  function applyCompanyFieldVisibility() {
    const bekannt = Boolean(deviceCompany?.number) && !companyChangeRequested;
    elements.companyNumberField.hidden = demoMode || bekannt;
    elements.changeCompany.hidden = demoMode || !bekannt;
  }

  // Zeigt ueber dem Anmeldeformular, zu welcher Firma die eingetippte Nummer
  // gehoert. Vor der Anmeldung kennt die App den Namen nur aus dem letzten
  // Besuch; fuer eine fremde Nummer nennt sie deshalb ehrlich nur die Nummer.
  function applyLoginCompanyIdentity() {
    // In der Vorfuehrung gibt es keine Anmeldung und damit keine Firmenwahl.
    if (demoMode) return;
    const eingetippt = normalizeCompanyNumber(elements.companyNumber.value);
    const bekannt = deviceCompany && normalizeCompanyNumber(deviceCompany.number) === eingetippt
      ? deviceCompany
      : { number: eingetippt };
    const firma = rememberedCompany(bekannt, loginSetup);
    elements.loginCompanyName.textContent = firma.displayName || firma.number || "Bitte Firmennummer eingeben";
    setCompanyMark(elements.loginCompanyMark, firma.displayName || firma.number, firma.logoUrl);
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
          "X-Schaefchen-Version": "0.44.18",
          ...options.headers
        }
      });
    } catch {
      const error = new Error("Der Server ist momentan nicht erreichbar.");
      error.network = true;
      throw error;
    }

    pruefeServerfassung(response.headers.get("X-Schaefchen-Server-Version"));

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(body.error?.message || "Die Anfrage ist fehlgeschlagen.");
      error.status = response.status;
      error.code = body.error?.code;
      error.requestId = body.requestId;
      if (error.code === "mandatory_update" && !demoMode) {
        window.location.assign("./refresh.html");
      }
      throw error;
    }
    return body;
  }

  // Eine Adresse, die der Browser selbst holt.
  //
  // Alles, was an einem Verweis haengt oder in einem Rahmen steht, laedt der
  // Browser ohne die Kopfzeile mit der App-Fassung - er kennt sie nicht.
  // Waehrend eines Pflichtupdates antwortete der Server darauf mit der
  // Update-Meldung, und das Telefon legte diese 203 Byte JSON unter dem Namen
  // des Dokuments ab: "SE-R-2026-00001-2026-07-27.pdf.json". Deshalb darf die
  // Fassung ersatzweise im Adressteil stehen.
  function browserFileUrl(path) {
    return `${path}${path.includes("?") ? "&" : "?"}appVersion=0.44.18`;
  }

  // Eine Datei holen, ohne die App zu verlassen.
  //
  // Der Verweis selbst darf das Blatt nicht mehr oeffnen: in einer
  // eingerichteten App ersetzt der Browser damit die ganze Ansicht, und dort
  // gibt es kein Zurueck - die App musste beendet werden. Geholt wird die
  // Datei deshalb hier, und weitergereicht wird sie als fertiger Inhalt.
  async function openDocumentFile(path, fileName) {
    try {
      await downloadFile(path, fileName);
    } catch (error) {
      showToast(error.message);
    }
  }

  async function downloadFile(path, fallbackName) {
    let response;
    try {
      response = await fetch(path, {
        credentials: "include",
        headers: { "X-Schaefchen-Version": "0.44.18" }
      });
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
      if (error.code === "mandatory_update" && !demoMode) {
        window.location.assign("./refresh.html");
      }
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
    elements.companyNumber.readOnly = false;
    applyCompanyFieldVisibility();
    elements.modeBadge.textContent = demoMode ? "Vorschau" : "Live";
    elements.timesheetEyebrow.textContent = demoMode ? "Live und lokal" : "Live synchronisiert";
    elements.resetDemo.hidden = !demoMode;
    elements.closePreview.setAttribute("aria-label", demoMode ? "Vorschau beenden" : "Abmelden");
    elements.passwordState.textContent = demoMode ? "In der Demo inaktiv" : "Sicher verschlüsselt";
    elements.loginSubmit.classList.toggle("button--secondary", demoMode);
    elements.loginSubmit.classList.toggle("button--primary", !demoMode);
    elements.loginFooter.textContent = `Einfach vor komplex · Version 0.44.18 ${demoMode ? "Demo" : "Online"}`;

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

  // Welche Eintraege stehen in der Leiste?
  //
  // Das haengt an zwei Dingen: was jemand darf, und welche Bereiche seine
  // Firma hat. Das Zweite kann sich waehrend einer laufenden Sitzung aendern -
  // die Plattformverwaltung schaltet einen Bereich frei oder ab. Deshalb steht
  // das hier fuer sich und nicht mehr mitten in showDashboard: es muss auch
  // dann laufen, wenn die Anmeldung laengst vorbei ist.
  function updateNavigationGroups() {
    const labels = elements.bottomNav.querySelectorAll("[data-nav-group-label]");
    labels.forEach((label) => {
      const group = label.dataset.navGroupLabel;
      const hasVisibleEntry = [...elements.bottomNav.querySelectorAll(
        `.nav-item[data-nav-group="${group}"]`
      )].some((button) => !button.hidden);
      label.hidden = !hasVisibleEntry;
    });
  }

  function applyNavigationAccess() {
    const planner = canPlan();
    elements.navAssignments.hidden = !planner;
    elements.navSites.hidden = !planner;
    // Auf der Baustelle ist der Arbeitstag bereits der erste Schritt auf
    // „Start“. Dort fuehrt „Zeiten“ in die Woche mit Eintraegen, Arbeitskonto
    // und Korrekturen. Nur planende Rollen brauchen zusaetzlich die getrennte
    // persoenliche Zeiterfassungsseite.
    elements.navTime.hidden = !planner;
    // Mobil bleibt der persoenliche Bereich immer „Zeiten“. Planende Rollen
    // bekommen ihre Verwaltungsbereiche daneben als echte Gruppenschalter;
    // die Woche muss deshalb nicht mehr zu „Woche“ umbeschriftet werden.
    elements.navWeek.dataset.kurz = "Zeiten";
    // Das Berichtsheft ist ein eigener Bereich, kein Anhaengsel der
    // Wochenansicht: fuer den Auszubildenden ist es die Arbeit, die er neben
    // der Zeiterfassung taeglich hat, und fuer den Ausbilder die, die er
    // woechentlich abzeichnet.
    elements.navApprentice.hidden = !(isApprentice() || mayReviewApprentices());
    // Derselbe Navigationspunkt steht beim Azubi auch mobil direkt unten.
    // Planende Ausbilder finden die Pruefliste weiterhin unter „Mehr“, damit
    // die mobile Leiste bei ihnen nicht mit Verwaltungszielen ueberlaeuft.
    //
    // Der uebliche Ausbilder ist aber der Vorarbeiter, und der plant nicht:
    // fuer ihn liegt „Mehr“ im Verwaltungsbereich, den er gar nicht sieht.
    // Die Pruefliste war damit am Telefon durch nichts zu erreichen - und
    // ohne die Unterschrift des Ausbilders ist der Nachweis wertlos. Seine
    // Leiste hat den Platz; die Sorge um eine ueberlaufende Leiste gilt nur
    // den planenden Rollen.
    elements.navApprentice.classList.toggle(
      "nav-item--apprentice-mobile",
      isApprentice() || (mayReviewApprentices() && !canPlan())
    );
    // Die Eintraege, die es nur am Rechner gibt. Sie haengen an derselben
    // Berechtigung wie Baustellen und Einsatzplanung: wer nicht planen darf,
    // hat dort auch nichts zu suchen.
    elements.navEmployees.hidden = !planner || isProjectScopedSession();
    elements.navCustomers.hidden = !planner;
    elements.navDocuments.hidden = !planner;
    elements.navAnalytics.hidden = !planner || isProjectScopedSession();
    elements.navVehicles.hidden = !planner || !moduleEnabled("fleet");
    elements.navDevices.hidden = demoMode || !moduleEnabled("devices");
    deviceModule.setEnabled(!elements.navDevices.hidden);
    // Das Lager ist kein Bueroeintrag: der Monteur bucht dort seine Entnahme.
    // Ob er darin mehr darf als buchen, entscheidet seine Rolle - das sagt die
    // Schnittstelle, nicht die Navigation.
    elements.navStock.hidden = demoMode || !moduleEnabled("warehouse");
    stockModule.setEnabled(!elements.navStock.hidden);
    elements.navReports.hidden = !planner
      || !(moduleEnabled("assembly_reports") || moduleEnabled("site_daily_reports"));
    elements.navInspections.hidden = !planner || !vdeModuleEnabled();
    const hasVisibleDesktopEntry = (group) => [...elements.bottomNav.querySelectorAll(
      `.nav-item--desktop[data-nav-group="${group}"]`
    )].some((button) => !button.hidden);
    elements.navMobilePlanning.hidden = !hasVisibleDesktopEntry("planning");
    elements.navMobileDocumentation.hidden = !hasVisibleDesktopEntry("documentation");
    elements.navMobileBusiness.hidden = !hasVisibleDesktopEntry("business");
    updateNavigationGroups();
    // Ab fuenf Schaltflaechen werden Schrift und Symbole etwas kompakter.
    // Gezaehlt wird ausschliesslich die echte mobile Bereichsleiste; die
    // einzelnen Desktopziele und Gruppenueberschriften nehmen dort nie Platz.
    const sichtbare = [...elements.bottomNav.querySelectorAll(".nav-item")].filter(
      (knopf) => !knopf.hidden && (
        !knopf.classList.contains("nav-item--desktop")
        || knopf.classList.contains("nav-item--apprentice-mobile")
      )
    ).length;
    elements.bottomNav.classList.toggle("bottom-nav--compact", sichtbare >= 5);
  }

  function setSidebarCollapsed(collapsed, persist = false) {
    const desktop = window.matchMedia("(min-width: 1080px)").matches;
    const active = desktop && Boolean(collapsed);
    elements.dashboardView.classList.toggle("sidebar-collapsed", active);
    elements.sidebarToggle.setAttribute("aria-expanded", String(!active));
    elements.sidebarToggle.setAttribute(
      "aria-label",
      active ? "Navigation ausklappen" : "Navigation einklappen"
    );
    if (persist) {
      window.localStorage.setItem("schaefchen-sidebar-collapsed", active ? "1" : "0");
    }
  }

  function restoreSidebarPreference() {
    setSidebarCollapsed(
      window.localStorage.getItem("schaefchen-sidebar-collapsed") === "1"
    );
  }

  function showDashboard() {
    elements.loginView.hidden = true;
    elements.passwordChangeView.hidden = true;
    elements.dashboardView.hidden = false;
    applyNavigationAccess();
    restoreSidebarPreference();
    document.title = "Übersicht · Schäfchen";
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
    clearPlannerData();
    deviceModule.clear();
    stockModule.clear();
    configureModeCopy();
    applyLoginCompanyIdentity();
    document.title = "Schäfchen";
    elements.passwordInput.value = "";
    elements.loginMessage.textContent = "";
    openedCustomerId = null;
    openedProjectId = null;
    openedSiteId = null;
    deepLinkedSiteHandled = false;
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
    return canPlanFor(session, { demoMode });
  }

  function isProjectScopedSession() {
    return isProjectScopedSessionFor(session);
  }

  function dateFromIso(date) {
    return new Date(`${date}T12:00:00`);
  }

  // Ohne gueltiges Datum lieber nichts anzeigen als "Invalid Date". Der Text
  // stand in der Wochenansicht ueber dem naechsten Einsatz und sah aus, als sei
  // der Einsatz kaputt.
  function shortDate(date) {
    const wert = dateFromIso(date);
    if (Number.isNaN(wert.valueOf())) return "";
    return wert.toLocaleDateString("de-DE", {
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

  // Die Zellen stecken in einer eigenen Huelle. Am Handy stehen sie damit als
  // eine umbrechende Zeile unter dem Namen, am Rechner loest die Huelle sich
  // auf (display: contents) und die Zellen reihen sich in die Spalten der
  // Tabelle ein - ohne dass die Liste zweimal gebaut werden muss.
  // Leere Angaben stehen am Rechner als Gedankenstrich in ihrer Spalte, damit
  // die Tabelle nicht verrutscht. Am Handy faellt der Strich weg - dort waere
  // er nur Rauschen. Deshalb merkt sich jede Zelle hier, ob sie leer ist und
  // ob vor ihr ein Mittelpunkt gehoert; das kann nur, wer die Werte kennt.
  function adminListCells(werte) {
    const huelle = document.createElement("div");
    huelle.className = "admin-list__cells";
    let ersteGefuellteSteht = false;
    for (const wert of werte) {
      const span = document.createElement("span");
      const marke = wert instanceof Node;
      const gefuellt = marke || Boolean(wert);
      if (marke) span.append(wert);
      else span.textContent = gefuellt ? wert : "–";
      // Eine Statusmarke ist kein Satzteil: sie bekommt am Handy eine eigene
      // Zeile statt eines Mittelpunkts davor.
      if (marke) span.dataset.marke = "true";
      else if (!gefuellt) span.dataset.leer = "true";
      else if (ersteGefuellteSteht) span.dataset.trenner = "true";
      if (gefuellt && !marke) ersteGefuellteSteht = true;
      huelle.append(span);
    }
    return huelle;
  }

  // Die Kopfzeile gehoert zur Liste und wird deshalb hier gebaut: der
  // Rendervorgang leert die Liste bei jedem Durchlauf, eine fest im HTML
  // stehende Kopfzeile waere sofort weg.
  function appendAdminListHead(list, labels) {
    const [erste, ...rest] = labels;
    const head = document.createElement("li");
    head.className = "admin-list__head";
    head.setAttribute("aria-hidden", "true");
    const strong = document.createElement("strong");
    strong.textContent = erste;
    head.append(strong, adminListCells(rest));
    list.append(head);
  }

  // meta darf eine Zeichenkette sein oder eine Liste von Zellen.
  //
  // Als Liste stehen die Angaben am Rechner in Spalten unter einer Kopfzeile -
  // so, wie eine Mitarbeiterliste aussehen soll, wenn man sie ueberfliegt. Am
  // Handy bleiben sie eine Zeile unter dem Namen: dort ist fuer Spalten kein
  // Platz, und die Reihenfolge sagt schon genug.
  function appendAdminListItem(list, title, meta, action = null) {
    const item = document.createElement("li");
    const strong = document.createElement("strong");
    strong.textContent = title;
    item.append(strong);

    if (Array.isArray(meta)) {
      item.classList.add("admin-list__row");
      item.append(adminListCells(meta));
    } else {
      const content = document.createElement("div");
      const span = document.createElement("span");
      span.textContent = meta;
      content.append(span);
      item.append(content);
      content.prepend(strong);
    }
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
      photo: "Foto",
      inspection: "Prüfprotokoll"
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

  // „Öffnen“ neben einem Dokument - und „PDF“ neben einem fertigen Bericht.
  //
  // Angetippt holt die App die Datei selbst. Vorher folgte das Telefon dem
  // Verweis: der Browser fragte ohne die Kopfzeile mit der App-Fassung, bekam
  // waehrend eines Pflichtupdates die Update-Meldung als JSON und legte sie
  // als „SE-R-….pdf.json“ ab. Und die Ansicht verliess dabei die App, ohne
  // einen Weg zurueck.
  //
  // Die Adresse bleibt am Verweis stehen: wer ihn bewusst in einem eigenen
  // Reiter oeffnet, soll dort das Dokument bekommen und nicht die Meldung.
  function documentDownloadLink(documentItem, compact = false) {
    const link = document.createElement("a");
    const adresse = browserFileUrl(
      `./api/v1/admin/documents/${encodeURIComponent(documentItem.id)}/content`
    );
    link.className = compact ? "text-button document-download" : "download-link document-download";
    link.href = adresse;
    link.download = documentItem.fileName;
    link.textContent = "Öffnen";
    link.addEventListener("click", (event) => {
      event.preventDefault();
      void openDocumentFile(adresse, documentItem.fileName);
    });
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
        documentItem.mobileVisible ? "Mobil freigegeben" : "Nur Büro",
        documentItem.offlinePriority ? "Offline vorgemerkt" : null,
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
      const mobileButton = document.createElement("button");
      mobileButton.type = "button";
      mobileButton.className = "text-button";
      mobileButton.textContent = documentItem.mobileVisible
        ? "Mobil ausblenden"
        : "Mobil freigeben";
      mobileButton.addEventListener("click", async () => {
        mobileButton.disabled = true;
        try {
          await requestJson(`./api/v1/admin/documents/${encodeURIComponent(documentItem.id)}`, {
            method: "PATCH",
            body: JSON.stringify({
              mobileVisible: !documentItem.mobileVisible,
              rowVersion: documentItem.rowVersion
            })
          });
          await refreshAdmin();
          showToast(documentItem.mobileVisible
            ? "Dokument ist mobil nicht mehr sichtbar."
            : "Dokument ist für zugewiesene Mitarbeiter mobil freigegeben.");
        } catch (error) {
          showToast(error.message);
        } finally {
          mobileButton.disabled = false;
        }
      });
      const offlineButton = document.createElement("button");
      offlineButton.type = "button";
      offlineButton.className = "text-button";
      offlineButton.textContent = documentItem.offlinePriority
        ? "Offline-Markierung entfernen"
        : "Für Offline vormerken";
      offlineButton.disabled = !documentItem.mobileVisible;
      offlineButton.addEventListener("click", async () => {
        offlineButton.disabled = true;
        try {
          await requestJson(`./api/v1/admin/documents/${encodeURIComponent(documentItem.id)}`, {
            method: "PATCH",
            body: JSON.stringify({
              offlinePriority: !documentItem.offlinePriority,
              rowVersion: documentItem.rowVersion
            })
          });
          await refreshAdmin();
          showToast(documentItem.offlinePriority
            ? "Offline-Markierung entfernt."
            : "Dokument wird beim Öffnen der Baustelle für Offline vorgemerkt.");
        } catch (error) {
          showToast(error.message);
        } finally {
          offlineButton.disabled = false;
        }
      });
      actions.append(
        documentDownloadLink(documentItem),
        mobileButton,
        offlineButton,
        statusButton
      );
      item.append(content, actions);
      elements.documentList.append(item);
    });
  }

  function renderSiteDocuments(siteId) {
    const query = elements.siteDashboardDocumentSearch.value
      .trim()
      .toLocaleLowerCase("de-DE");
    const allDocuments = documentsForEntity("construction_site", siteId)
      .filter((documentItem) => documentItem.category !== "photo");
    const documents = allDocuments.filter((documentItem) => (
      !query || documentSearchText(documentItem).includes(query)
    ));
    elements.siteDashboardDocumentCount.textContent = String(allDocuments.length);
    elements.siteDashboardDocuments.replaceChildren();
    if (documents.length === 0) {
      const empty = document.createElement("li");
      empty.className = "admin-list__empty";
      empty.textContent = query
        ? "Kein Dokument passt zur Suche."
        : "Noch kein Dokument mit dieser Baustelle verknüpft.";
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

  function renderSitePhotos(siteId) {
    const query = elements.siteDashboardPhotoSearch.value
      .trim()
      .toLocaleLowerCase("de-DE");
    const allPhotos = documentsForEntity("construction_site", siteId)
      .filter((documentItem) => documentItem.category === "photo");
    const photos = allPhotos.filter((photo) => (
      !query || documentSearchText(photo).includes(query)
    ));
    elements.siteDashboardPhotoCount.textContent = String(allPhotos.length);
    elements.siteDashboardPhotos.replaceChildren();
    if (photos.length === 0) {
      appendSiteModuleEmpty(
        elements.siteDashboardPhotos,
        query ? "Kein Foto passt zur Suche." : "Noch kein Baustellenfoto gespeichert."
      );
      return;
    }
    photos.forEach((photo) => {
      const item = document.createElement("li");
      const link = documentDownloadLink(photo, true);
      const image = document.createElement("img");
      const caption = document.createElement("span");
      link.className = "employee-site-photo";
      image.src = link.href;
      image.alt = photo.title;
      image.loading = "lazy";
      caption.textContent = photo.title;
      link.replaceChildren(image, caption);
      item.append(link);
      elements.siteDashboardPhotos.append(item);
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
      submitted: "Vollständig · Unterschrift offen",
      approved: "Abgeschlossen",
      returned: "Zur Überarbeitung",
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

  // Die Lagerzeile unter einem Materialeintrag. Sie steht in beiden Ansichten
  // gleich - im Buero und auf dem Telefon -, weil beide dieselbe Frage haben:
  // reicht das, was wir haben? Ohne verknuepften Artikel bleibt sie weg; eine
  // Zeile "kein Bestand" waere an einer Kernbohrung schlicht falsch.
  function appendMaterialStockLine(parent, material) {
    const satz = materialBestandText(material);
    if (!satz) return;
    const lage = materialBestand(material);
    const zeile = document.createElement("span");
    zeile.className = `site-material-stock site-material-stock--${lage.lage}`;
    zeile.textContent = lage.artikelnummer ? `${satz} (${lage.artikelnummer})` : satz;
    parent.append(zeile);
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
      appendMaterialStockLine(content, material);
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
    const query = elements.siteDashboardReportSearch.value
      .trim()
      .toLocaleLowerCase("de-DE");
    const reports = (adminState?.siteReports || []).filter((report) => (
      report.constructionSiteId === siteId
      && (
        !query
        || [
          report.number,
          report.summary,
          report.authorName,
          report.details,
          reportStatusLabel(report.status),
          reportTypeLabel(report.reportType)
        ].filter(Boolean).join(" ").toLocaleLowerCase("de-DE").includes(query)
      )
    ));
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
        report.structuredData?.photos?.length
          ? `${report.structuredData.photos.length} Berichtsfoto${
            report.structuredData.photos.length === 1 ? "" : "s"
          }`
          : null,
        report.status === "approved" ? `signiert von ${report.employeeSignatureName} und ${report.customerSignatureName}` : null,
        report.status === "returned" ? `Überarbeitung: ${report.returnComment}` : null,
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
        const preview = document.createElement("button");
        preview.type = "button";
        preview.className = "text-button site-module-item__action";
        preview.textContent = "PDF-Vorschau";
        preview.addEventListener("click", () => previewReportPdf(report));
        actions.append(preview);
        const finalize = document.createElement("button");
        finalize.type = "button";
        finalize.className = "text-button site-module-item__action";
        finalize.textContent = "Unterschreiben";
        finalize.addEventListener("click", () => openSiteReportFinalization(report));
        actions.append(finalize);
        const returnButton = document.createElement("button");
        returnButton.type = "button";
        returnButton.className = "text-button site-module-item__action";
        returnButton.textContent = "Überarbeiten lassen";
        returnButton.addEventListener("click", () => openReportReturnDialog(report));
        actions.append(returnButton);
      } else if (report.status === "returned") {
        const preview = document.createElement("button");
        preview.type = "button";
        preview.className = "text-button site-module-item__action";
        preview.textContent = "PDF-Vorschau";
        preview.addEventListener("click", () => previewReportPdf(report));
        actions.append(preview);
      }
      if (actions.childElementCount > 0) item.append(actions);
      elements.siteDashboardReports.append(item);
    });
  }

  function reportSite(report) {
    return adminState?.sites.find((site) => site.id === report.constructionSiteId) || null;
  }

  function reportCenterMissingAssignments() {
    const reports = adminState?.siteReports || [];
    return (adminState?.weekAssignments || []).filter((assignment) => (
      assignment.reportResponsible
      && !reports.some((report) => (
        report.constructionSiteId === assignment.constructionSiteId
        && report.workDate === assignment.workDate
        && !["archived", "draft"].includes(report.status)
      ))
    ));
  }

  function localReportCenterDrafts() {
    if (!adminState || !session?.user) return [];
    const authorName = [session.user.firstName, session.user.lastName]
      .filter(Boolean)
      .join(" ");
    return adminState.sites.flatMap((site) => (
      ["digital", "speech"].flatMap((sourceMode) => {
        const draft = readSiteReportDraft(site.id, sourceMode);
        if (!draft) return [];
        return [{
          id: `local-draft:${site.id}:${sourceMode}`,
          number: "Lokaler Entwurf",
          constructionSiteId: site.id,
          reportType: draft.reportType || "montage",
          workDate: draft.workDate || adminState.date,
          sourceMode,
          summary: draft.summary?.trim() || "Noch ohne Kurzbeschreibung",
          details: draft.details?.trim() || "",
          authorName,
          status: "draft",
          updatedAt: draft.updatedAt || null,
          localDraft: true
        }];
      })
    ));
  }

  function reportCenterReports() {
    return [
      ...(adminState?.siteReports || []).filter((report) => report.status !== "archived"),
      ...localReportCenterDrafts()
    ];
  }

  function populateReportCenterFilters() {
    const selectedSite = elements.reportCenterSite.value || "all";
    const selectedEmployee = elements.reportCenterEmployee.value || "all";
    const sites = [...(adminState?.sites || [])]
      .sort((left, right) => left.name.localeCompare(right.name, "de-DE"));
    const authors = [...new Set(
      reportCenterReports().map((report) => report.authorName).filter(Boolean)
    )].sort((left, right) => left.localeCompare(right, "de-DE"));
    elements.reportCenterSite.replaceChildren(new Option("Alle Baustellen", "all"));
    sites.forEach((site) => elements.reportCenterSite.add(new Option(site.name, site.id)));
    elements.reportCenterSite.value = sites.some((site) => site.id === selectedSite)
      ? selectedSite
      : "all";
    elements.reportCenterEmployee.replaceChildren(new Option("Alle Monteure", "all"));
    authors.forEach((author) => elements.reportCenterEmployee.add(new Option(author, author)));
    elements.reportCenterEmployee.value = authors.includes(selectedEmployee)
      ? selectedEmployee
      : "all";
  }

  function reportCenterSort(reports) {
    const statusRank = { returned: 1, submitted: 2, draft: 3, approved: 4, archived: 5 };
    const sort = elements.reportCenterSort.value;
    return [...reports].sort((left, right) => {
      if (sort === "date-asc") return left.workDate.localeCompare(right.workDate);
      if (sort === "employee") {
        return left.authorName.localeCompare(right.authorName, "de-DE")
          || right.workDate.localeCompare(left.workDate);
      }
      if (sort === "site") {
        return (reportSite(left)?.name || "").localeCompare(
          reportSite(right)?.name || "",
          "de-DE"
        ) || right.workDate.localeCompare(left.workDate);
      }
      if (sort === "status") {
        return (statusRank[left.status] || 99) - (statusRank[right.status] || 99)
          || right.workDate.localeCompare(left.workDate);
      }
      return right.workDate.localeCompare(left.workDate);
    });
  }

  function openReportSite(report, { finalize = false } = {}) {
    const site = reportSite(report);
    if (!site) return;
    openSiteDashboard(site);
    showSiteDashboardSection("reports", true);
    if (report.localDraft) {
      openSiteReportForm(report.sourceMode);
      return;
    }
    if (finalize) openSiteReportFinalization(report);
  }

  async function previewReportPdf(report) {
    try {
      await downloadFile(
        `./api/v1/admin/site-reports/${encodeURIComponent(report.id)}/preview`,
        `${report.number}-Vorschau.pdf`
      );
      showToast("PDF-Vorschau erstellt · noch nicht freigegeben.");
    } catch (error) {
      showToast(error.message);
    }
  }

  function closeReportReturnDialog() {
    returningReportId = null;
    elements.reportReturnForm.reset();
    elements.reportReturnMessage.textContent = "";
    elements.reportReturnSubmit.disabled = false;
    if (elements.reportReturnDialog.open) elements.reportReturnDialog.close();
  }

  function openReportReturnDialog(report) {
    if (report.status !== "submitted") {
      showToast("Nur ein Bericht mit offener Unterschrift kann zurückgegeben werden.");
      return;
    }
    returningReportId = report.id;
    elements.reportReturnNumber.textContent = [
      report.number,
      report.summary,
      reportSite(report)?.name
    ].filter(Boolean).join(" · ");
    elements.reportReturnComment.value = "";
    elements.reportReturnMessage.textContent = "";
    elements.reportReturnSubmit.disabled = false;
    elements.reportReturnDialog.showModal();
    window.setTimeout(() => elements.reportReturnComment.focus(), 100);
  }

  // Die Fassung dieser Seite. Sie steht auch an den Dateinamen und im Fusstext
  // der Anmeldung; hier ist sie das, womit die Antwort des Servers verglichen
  // wird.
  const EIGENE_FASSUNG = "0.44.18";

  // Haengt diese Seite hinter dem Server her? Dann sagen wir es - und zwingen
  // niemanden: mitten in einer Eingabe neu zu laden waere schlimmer als eine
  // alte Oberflaeche.
  function pruefeServerfassung(serverFassung) {
    if (!serverFassung || demoMode) return;
    if (!serverIsNewer(EIGENE_FASSUNG, serverFassung)) return;
    elements.updateBannerText.textContent =
      `Schäfchen ${serverFassung} ist verfügbar. Diese Ansicht ist noch ${EIGENE_FASSUNG}.`;
    elements.updateBanner.hidden = false;
    // Der Balken liegt fest oben. Ohne diesen Schalter verdeckt er die
    // Kopfzeile - im Browser genau so gesehen.
    document.body.classList.add("hat-fassungshinweis");
  }

  // Die abgelegten Dateien wegwerfen. Ein blosses Neuladen holte bei einer
  // eingerichteten App wieder dieselben aus dem Speicher.
  async function verwerfeAbgelegteDateien() {
    try {
      if ("caches" in window) {
        const namen = await caches.keys();
        await Promise.all(
          namen
            .filter((name) => name.startsWith("schaefchen-online-"))
            .map((name) => caches.delete(name))
        );
      }
      if (navigator.serviceWorker?.getRegistrations) {
        const eintraege = await navigator.serviceWorker.getRegistrations();
        await Promise.all(eintraege.map((eintrag) => eintrag.update()));
      }
    } catch {
      // Wenn das Aufraeumen nicht geht, hilft das Neuladen vielleicht trotzdem.
    }
  }

  // Laeuft hier die Datei, die die Seite angefordert hat?
  //
  // Das Dokument laedt "app.js?v=0.44.18". Der Dienst-Worker darf im Notfall
  // eine aeltere Fassung derselben Datei zurueckgeben - waehrend einer
  // Veroeffentlichung ist eine Fassung zu alt besser als eine weisse Seite.
  // Nur geht dieser Notfall vorbei, ohne dass es jemand merkt: dann laeuft
  // neues Geruest mit alter Anwendung oder umgekehrt. Beides sieht nicht
  // kaputt aus, es fehlt nur etwas - eine Schaltflaeche, eine Zahl neben einer
  // anderen. Man sucht den Fehler dann in der Fachlichkeit, wo keiner ist.
  //
  // Die angeforderte Fassung steht in der eigenen Adresse, die eingebaute in
  // EIGENE_FASSUNG. Gehen sie auseinander, raeumt die App einmal auf und laedt
  // neu. Einmal: liefert der Server selbst noch die alte Datei aus, waere ein
  // zweiter Versuch eine Schleife. Dann bleibt der Hinweisbalken.
  const ANGEFORDERTE_FASSUNG = (() => {
    try {
      return new URL(import.meta.url).searchParams.get("v");
    } catch {
      return null;
    }
  })();

  async function pruefeEigeneFassung() {
    if (!ANGEFORDERTE_FASSUNG || ANGEFORDERTE_FASSUNG === EIGENE_FASSUNG) return false;
    const merker = "schaefchen-fassungsbruch";
    let schonVersucht = null;
    try {
      schonVersucht = window.sessionStorage.getItem(merker);
    } catch {
      // Ohne Sitzungsspeicher gibt es keinen Schutz vor der Schleife. Dann
      // lieber gar nicht neu laden als endlos.
      schonVersucht = ANGEFORDERTE_FASSUNG;
    }
    if (schonVersucht === ANGEFORDERTE_FASSUNG) {
      elements.updateBannerText.textContent =
        `Diese Ansicht ist gemischt: angefordert war ${ANGEFORDERTE_FASSUNG}, geladen wurde ${EIGENE_FASSUNG}.`;
      elements.updateBanner.hidden = false;
      document.body.classList.add("hat-fassungshinweis");
      return false;
    }
    try {
      window.sessionStorage.setItem(merker, ANGEFORDERTE_FASSUNG);
    } catch {
      return false;
    }
    await verwerfeAbgelegteDateien();
    window.location.reload();
    return true;
  }

  // ---------------------------------------------------------------------
  // Suche und Glocke
  // ---------------------------------------------------------------------
  //
  // Beide arbeiten mit dem, was ohnehin geladen ist. Eine eigene Abfrage waere
  // eine zweite Quelle fuer dieselben Angaben - und eine Suche, die etwas
  // findet, was der Bildschirm daneben nicht kennt, ist schlimmer als keine.

  function searchMatches(begriff) {
    const suche = begriff.trim().toLocaleLowerCase("de-DE");
    if (suche.length < 2 || !adminState) return [];
    const treffer = [];
    const passt = (...teile) => teile
      .filter(Boolean).join(" ").toLocaleLowerCase("de-DE").includes(suche);

    for (const site of adminState.sites || []) {
      if (!passt(site.name, site.number, site.customerName, siteAddressText(site))) continue;
      treffer.push({
        art: "Baustelle",
        titel: site.name,
        unter: [site.customerName, siteAddressText(site)].filter(Boolean).join(" · "),
        handler: () => openSiteDashboard(site)
      });
    }
    for (const customer of adminState.customers || []) {
      if (!passt(customer.displayName, customer.number, customer.email, customer.phone)) continue;
      treffer.push({
        art: "Kunde",
        titel: customer.displayName,
        unter: [customer.number, customer.email].filter(Boolean).join(" · "),
        handler: () => {
          showDashboardPane("customers");
          elements.customerSearchField.value = customer.displayName;
          renderCustomerOverview();
        }
      });
    }
    for (const employee of adminState.employees || []) {
      const name = `${employee.firstName} ${employee.lastName}`;
      if (!passt(name, employee.personnelNumber, employee.email, employee.phone)) continue;
      treffer.push({
        art: "Mitarbeiter",
        titel: name,
        unter: [employee.personnelNumber, employeeRoleLabel(employee.roles)].join(" · "),
        handler: () => {
          showDashboardPane("employees");
          elements.employeePanel.open = true;
          selectEmployee(employee);
        }
      });
    }
    for (const report of adminState.siteReports || []) {
      if (!passt(report.number, report.summary, report.authorName)) continue;
      treffer.push({
        art: "Bericht",
        titel: report.summary || report.number,
        unter: [reportTypeLabel(report.reportType), reportStatusLabel(report.status)].join(" · "),
        handler: () => showDashboardPane("reports")
      });
    }
    return treffer.slice(0, 8);
  }

  function renderSearchResults() {
    const treffer = searchMatches(elements.globalSearch.value);
    elements.globalSearchResults.replaceChildren();
    const offen = treffer.length > 0 || elements.globalSearch.value.trim().length >= 2;
    elements.globalSearchResults.hidden = !offen;
    elements.globalSearch.setAttribute("aria-expanded", offen ? "true" : "false");
    if (!offen) return;
    if (treffer.length === 0) {
      const leer = document.createElement("p");
      leer.className = "topbar-search__empty";
      leer.textContent = "Nichts gefunden.";
      elements.globalSearchResults.append(leer);
      return;
    }
    for (const eintrag of treffer) {
      const knopf = document.createElement("button");
      const art = document.createElement("small");
      const titel = document.createElement("strong");
      const unter = document.createElement("span");
      knopf.type = "button";
      knopf.className = "topbar-search__hit";
      knopf.setAttribute("role", "option");
      art.textContent = eintrag.art;
      titel.textContent = eintrag.titel;
      unter.textContent = eintrag.unter;
      knopf.append(art, titel, unter);
      knopf.addEventListener("click", () => {
        closeSearch();
        eintrag.handler();
      });
      elements.globalSearchResults.append(knopf);
    }
  }

  function closeSearch() {
    elements.globalSearch.value = "";
    elements.globalSearchResults.hidden = true;
    elements.globalSearch.setAttribute("aria-expanded", "false");
  }

  // Die Glocke zaehlt, was jemand tun muss - nicht, was passiert ist. Eine
  // Meldung, die niemanden zu etwas auffordert, ist eine Ablenkung.
  function pendingItems() {
    const offen = [];

    const berichte = (adminState?.siteReports || [])
      .filter((report) => report.status === "submitted");
    if (berichte.length) {
      offen.push({
        text: `${berichte.length} Bericht${berichte.length === 1 ? "" : "e"} zur Freigabe`,
        handler: () => showDashboardPane("reports")
      });
    }

    // Zusammenhaengende Aenderungen zaehlen einmal, nicht je Buchung -
    // dieselbe Regel wie in der Pruefliste selbst.
    const gesehen = new Set();
    const korrekturen = (adminState?.timeCorrections || []).filter((korrektur) => {
      if (!korrektur.operationId) return true;
      if (gesehen.has(korrektur.operationId)) return false;
      gesehen.add(korrektur.operationId);
      return true;
    });
    if (korrekturen.length) {
      offen.push({
        text: korrekturen.length === 1
          ? "1 Zeitkorrektur wartet auf Prüfung"
          : `${korrekturen.length} Zeitkorrekturen warten auf Prüfung`,
        handler: () => {
          currentWeekSubarea = "requests";
          showDashboardPane("week");
        }
      });
    }

    // Buero und Geschaeftsfuehrung pruefen nacheinander; beides ist offen.
    const abwesenheiten = (adminState?.absences || [])
      .filter((absence) => ["office_review", "management_review"].includes(absence.status));
    if (abwesenheiten.length) {
      offen.push({
        text: abwesenheiten.length === 1
          ? "1 Abwesenheitsantrag wartet auf Freigabe"
          : `${abwesenheiten.length} Abwesenheitsanträge warten auf Freigabe`,
        handler: () => {
          currentWeekSubarea = "requests";
          showDashboardPane("week");
        }
      });
    }

    const berichtshefte = (apprenticeReviewState || [])
      .filter((bericht) => bericht.status === "submitted");
    if (berichtshefte.length) {
      offen.push({
        text: `${berichtshefte.length} Berichtsheft-Woche${berichtshefte.length === 1 ? "" : "n"} zum Abzeichnen`,
        handler: () => showDashboardPane("apprentice")
      });
    }

    const pruefungen = (adminState?.sites || [])
      .filter((site) => site.fieldReviewStatus === "pending");
    if (pruefungen.length) {
      offen.push({
        text: `${pruefungen.length} Baustelle${pruefungen.length === 1 ? "" : "n"} vom Monteur zu bestätigen`,
        handler: () => showDashboardPane("sites")
      });
    }

    const geraete = deviceModule.notificationSummary();
    if (geraete) offen.push(geraete);
    return offen;
  }

  function renderNotifications() {
    const zeigen = Boolean(session) && !demoMode && (canPlan() || moduleEnabled("devices"));
    elements.notificationBell.hidden = !zeigen;
    elements.topbarSearch.hidden = !(Boolean(adminState) && canPlan() && !demoMode);
    if (!zeigen) return;
    const offen = pendingItems();
    elements.notificationCount.textContent = String(offen.length);
    elements.notificationCount.hidden = offen.length === 0;
    elements.notificationList.replaceChildren();
    if (offen.length === 0) {
      const leer = document.createElement("li");
      leer.className = "notification-bell__empty";
      leer.textContent = "Nichts offen. Alles abgearbeitet.";
      elements.notificationList.append(leer);
      return;
    }
    for (const eintrag of offen) {
      const zeile = document.createElement("li");
      const knopf = document.createElement("button");
      knopf.type = "button";
      knopf.textContent = eintrag.text;
      knopf.addEventListener("click", () => {
        elements.notificationBell.open = false;
        eintrag.handler();
      });
      zeile.append(knopf);
      elements.notificationList.append(zeile);
    }
  }

  // Der Schnellzugriff aus dem Entwurf. Er fuehrt nur zu Dingen, die es
  // wirklich gibt - jeder Eintrag oeffnet den Bereich und klappt dort das
  // Formular auf, in das man sonst erst hineinklicken muesste.
  function renderQuickAccess() {
    const wege = [];
    if (canPlan()) {
      wege.push(["Baustelle anlegen", () => {
        showDashboardPane("sites");
        elements.siteMasterDataTools.hidden = false;
        elements.siteMasterDataTools.open = true;
        elements.siteFormPanel.open = true;
      }]);
      wege.push(["Einsatz planen", () => {
        showDashboardPane("assignments");
        elements.assignmentPanel.open = true;
      }]);
      if (!isProjectScopedSession()) {
        wege.push(["Mitarbeiter anlegen", () => {
          showDashboardPane("employees");
          elements.employeePanel.open = true;
        }]);
      }
      wege.push(["Kunde anlegen", () => {
        showDashboardPane("customers");
        elements.customerPanel.hidden = false;
        elements.customerPanel.open = true;
      }]);
      if (moduleEnabled("fleet")) {
        wege.push(["Fahrzeug anlegen", () => {
          showDashboardPane("vehicles");
          void refreshVehicles();
          openVehicleEditor(null);
        }]);
      }
    }
    elements.quickAccess.hidden = wege.length === 0 || currentDashboardPane !== "start";
    elements.quickAccessMenu.replaceChildren();
    for (const [beschriftung, handler] of wege) {
      const knopf = document.createElement("button");
      knopf.type = "button";
      knopf.textContent = beschriftung;
      knopf.addEventListener("click", () => {
        elements.quickAccess.open = false;
        handler();
      });
      elements.quickAccessMenu.append(knopf);
    }
  }

  // Die vier Kennzahlen des Betriebs auf dem Dashboard. Sie zaehlen nur, was
  // ohnehin schon geladen ist - eine eigene Abfrage waere eine zweite Quelle
  // fuer dieselben Zahlen.
  //
  // Fuer einen Monteur stehen sie nicht da: er hat mit den Zahlen des ganzen
  // Betriebs nichts zu tun, und sein Dashboard zeigt stattdessen seinen
  // Arbeitstag.
  // Was ist mit der Betriebsuebersicht?
  //
  // Kennzahlen, Tagesuebersicht und Schnellzugriff haengen alle daran. Ist sie
  // nicht da, stehen alle drei auf "versteckt" - und die Startseite ist
  // vollstaendig leer. Sie sah dann beim Laden genauso aus wie nach einem
  // fehlgeschlagenen Laden, und ein Netzfehler wurde nicht einmal gemeldet
  // (showToast unterbleibt bei error.network). Wer das sieht, wartet - erst
  // eine Weile, dann laenger.
  //
  // Deshalb sagt die Seite jetzt, woran sie ist.
  function renderDashboardLoading() {
    const zustaendig = canPlan() && !demoMode;
    const zeigen = zustaendig
      && !adminState
      && currentDashboardPane === "start";
    elements.dashboardLoading.hidden = !zeigen;
    if (!zeigen) return;
    const gescheitert = adminOverviewStatus === "failed";
    elements.dashboardLoadingText.textContent = gescheitert
      ? "Die Betriebsübersicht konnte nicht geladen werden."
      : adminOverviewDauert
        ? "Die Betriebsübersicht dauert länger als üblich. Der Server läuft vielleicht gerade erst an."
        : "Betriebsübersicht wird geladen …";
    elements.dashboardLoadingRetry.hidden = !gescheitert && !adminOverviewDauert;
  }

  function renderDashboardMetrics() {
    const zeigen = Boolean(adminState) && canPlan() && !demoMode;
    elements.dashboardMetrics.hidden = !zeigen || currentDashboardPane !== "start";
    renderDashboardLoading();
    if (!zeigen) return;

    const laufende = adminState.sites.filter(
      (site) => siteStatusGroup(site.status) === "active"
    );
    elements.metricSites.textContent = String(laufende.length);

    const eingeplant = new Set(
      (adminState.assignments || []).map((assignment) => assignment.employeeId)
    );
    const mannschaft = plannableEmployees(adminState.employees);
    elements.metricEmployees.textContent = String(eingeplant.size);
    elements.metricEmployeesTotal.textContent = `/ ${mannschaft.length}`;
    elements.metricEmployeesNote.textContent = adminState.date === localDateKey()
      ? "heute eingeplant"
      : `eingeplant am ${shortDate(adminState.date)}`;

    const berichte = reportCenterReports();
    elements.metricReports.textContent = String(
      berichte.filter((report) => report.status === "submitted").length
    );

    // Das eigene Zeitkonto, nicht das des Betriebs: eine Summe ueber alle
    // Mitarbeiter waere eine Zahl, mit der niemand etwas anfangen kann.
    //
    // Die Zahl kommt aus der Wochenansicht selbst - dieselbe Rechnung zweimal
    // aufzuschreiben ist die sicherste Art, zwei verschiedene Zahlen zu
    // bekommen.
    elements.metricOvertimeLabel.textContent = `Überstunden (${isoWeekLabel(selectedWeekStart)})`;
    const differenz = wochenDifferenzMinuten;
    elements.metricOvertime.textContent = formatSignedMinutes(differenz);
    elements.metricOvertime.className = `metric-card__value${
      differenz < 0 ? "" : " metric-card__value--brand"
    }`;
  }

  function isoWeekLabel(montag) {
    const datum = dateFromIso(montag);
    const donnerstag = new Date(datum);
    donnerstag.setDate(datum.getDate() + 3);
    const jahresbeginn = new Date(donnerstag.getFullYear(), 0, 1);
    const tage = Math.floor((donnerstag - jahresbeginn) / 86400000);
    return `KW ${Math.floor(tage / 7) + 1}`;
  }

  // "Heute im Ueberblick": links die Baustellen, auf denen heute jemand steht,
  // rechts das, was zuletzt im Betrieb passiert ist.
  function renderTodayOverview() {
    const zeigen = Boolean(adminState) && canPlan() && !demoMode;
    elements.todayOverview.hidden = !zeigen || currentDashboardPane !== "start";
    if (!zeigen) return;

    const proBaustelle = new Map();
    for (const assignment of adminState.assignments || []) {
      const eintrag = proBaustelle.get(assignment.constructionSiteId) || {
        name: assignment.siteName || "Ohne Baustelle",
        leute: 0,
        von: null,
        bis: null
      };
      eintrag.leute += 1;
      const start = assignment.plannedStartTime?.slice(0, 5) || null;
      // Die Endzeit steht nicht im Einsatz; sie ergibt sich aus Start und
      // geplanter Dauer - dieselbe Rechnung wie auf der Plantafel.
      const startMinuten = assignmentStartMinutes(assignment.plannedStartTime);
      const ende = startMinuten !== null && assignment.plannedDurationMinutes
        ? uhrzeitAusMinuten(startMinuten + assignment.plannedDurationMinutes)
        : null;
      if (start && (!eintrag.von || start < eintrag.von)) eintrag.von = start;
      if (ende && (!eintrag.bis || ende > eintrag.bis)) eintrag.bis = ende;
      proBaustelle.set(assignment.constructionSiteId, eintrag);
    }
    const baustellen = [...proBaustelle.entries()]
      .sort(([, links], [, rechts]) => (links.von || "99:99").localeCompare(rechts.von || "99:99"));

    elements.todaySites.replaceChildren();
    if (baustellen.length === 0) {
      appendTodayEmpty(elements.todaySites, "Für heute ist noch kein Einsatz freigegeben.");
    }
    for (const [siteId, eintrag] of baustellen.slice(0, 3)) {
      const zeit = eintrag.von && eintrag.bis
        ? `${eintrag.von} – ${eintrag.bis}`
        : eintrag.von ? `ab ${eintrag.von}` : "ohne Startzeit";
      appendTodayRow(elements.todaySites, {
        titel: eintrag.name,
        unter: `${eintrag.leute} Mitarbeiter`,
        rechts: zeit,
        handler: () => {
          const site = adminState.sites.find((eintrag2) => eintrag2.id === siteId);
          if (site) openSiteDashboard(site);
        }
      });
    }
    if (baustellen.length > 3) {
      const weitere = baustellen.length - 3;
      appendTodayMore(
        elements.todaySites,
        `${weitere} weitere Baustelle${weitere === 1 ? "" : "n"}`,
        () => showDashboardPane("assignments")
      );
    }

    elements.todayActivity.replaceChildren();
    const aktivitaeten = latestActivity();
    if (aktivitaeten.length === 0) {
      appendTodayEmpty(elements.todayActivity, "Noch keine Aktivität im Betrieb.");
    }
    for (const eintrag of aktivitaeten) {
      appendTodayRow(elements.todayActivity, eintrag);
    }
  }

  // Was zuletzt passiert ist - aus dem, was ohnehin geladen ist: Berichte,
  // Pruefprotokolle und eingereichte Wochen des Berichtshefts.
  function latestActivity() {
    const eintraege = [];
    const baustellenname = (id) => adminState.sites.find((site) => site.id === id)?.name;
    for (const report of adminState.siteReports || []) {
      eintraege.push({
        zeit: report.updatedAt || report.createdAt,
        titel: `${reportTypeLabel(report.reportType)} – ${
          baustellenname(report.constructionSiteId) || "Baustelle"
        }`,
        unter: `${reportStatusLabel(report.status)} · ${report.authorName || ""}`.trim(),
        handler: () => showDashboardPane("reports")
      });
    }
    for (const inspection of adminState.vdeInspections || []) {
      const site = adminState.sites.find(
        (eintrag) => eintrag.id === inspection.constructionSiteId
      );
      eintraege.push({
        zeit: inspection.updatedAt || inspection.createdAt,
        titel: `Prüfprotokoll – ${site?.name || inspection.name}`,
        unter: inspection.status === "completed"
          ? `abgeschlossen von ${inspection.completedByName || inspection.inspectorName}`
          : `in Arbeit · ${inspection.inspectorName}`,
        handler: () => showDashboardPane("inspections")
      });
    }
    for (const bericht of apprenticeReviewState || []) {
      eintraege.push({
        zeit: bericht.submittedAt || bericht.updatedAt,
        titel: `Azubi-Berichtsheft – Woche ab ${shortDate(bericht.weekStart)}`,
        unter: `eingereicht von ${bericht.apprenticeName}`,
        handler: () => showDashboardPane("apprentice")
      });
    }
    return eintraege
      .filter((eintrag) => eintrag.zeit)
      .sort((links, rechts) => String(rechts.zeit).localeCompare(String(links.zeit)))
      .slice(0, 3);
  }

  // Minuten seit Mitternacht als Uhrzeit. Ueber 24 Uhr hinaus rechnet die
  // Einsatzpruefung ohnehin nicht - dort ist bei 1440 Minuten Schluss.
  function uhrzeitAusMinuten(minuten) {
    const stunde = String(Math.floor(minuten / 60) % 24).padStart(2, "0");
    const minute = String(minuten % 60).padStart(2, "0");
    return `${stunde}:${minute}`;
  }

  function appendTodayRow(list, { titel, unter, rechts = null, handler }) {
    const zeile = document.createElement("li");
    const knopf = document.createElement("button");
    const text = document.createElement("span");
    const name = document.createElement("strong");
    const meta = document.createElement("small");
    knopf.type = "button";
    knopf.className = "today-list__item";
    name.textContent = titel;
    meta.textContent = unter;
    text.className = "today-list__text";
    text.append(name, meta);
    knopf.append(text);
    if (rechts) {
      const zeit = document.createElement("span");
      zeit.className = "today-list__aside";
      zeit.textContent = rechts;
      knopf.append(zeit);
    }
    knopf.addEventListener("click", handler);
    zeile.append(knopf);
    list.append(zeile);
  }

  function appendTodayEmpty(list, text) {
    const zeile = document.createElement("li");
    zeile.className = "today-list__empty";
    zeile.textContent = text;
    list.append(zeile);
  }

  function appendTodayMore(list, text, handler) {
    const zeile = document.createElement("li");
    const knopf = document.createElement("button");
    knopf.type = "button";
    knopf.className = "today-list__more";
    knopf.textContent = `→ ${text}`;
    knopf.addEventListener("click", handler);
    zeile.append(knopf);
    list.append(zeile);
  }

  function renderReportCenter() {
    if (!adminState) return;
    populateReportCenterFilters();
    const allReports = reportCenterReports();
    const missing = reportCenterMissingAssignments();
    elements.reportCenterDraftCount.textContent = String(
      allReports.filter((report) => report.status === "draft").length
    );
    elements.reportCenterOpenCount.textContent = String(
      allReports.filter((report) => report.status === "submitted").length
    );
    elements.reportCenterReturnedCount.textContent = String(
      allReports.filter((report) => report.status === "returned").length
    );
    elements.reportCenterApprovedCount.textContent = String(
      allReports.filter((report) => report.status === "approved").length
    );
    elements.reportCenterMissingCount.textContent = String(missing.length);
    elements.reportCenterMissingBadge.textContent = String(missing.length);
    elements.reportCenterMissingPanel.open = missing.length > 0;
    elements.reportCenterMissingList.replaceChildren();
    if (missing.length === 0) {
      appendSiteModuleEmpty(
        elements.reportCenterMissingList,
        "In der angezeigten Woche fehlt kein Pflichtbericht."
      );
    } else {
      missing.forEach((assignment) => {
        const item = document.createElement("li");
        const content = document.createElement("div");
        const title = document.createElement("strong");
        const meta = document.createElement("span");
        const open = document.createElement("button");
        const site = adminState.sites.find(
          (candidate) => candidate.id === assignment.constructionSiteId
        );
        title.textContent = assignment.siteName;
        meta.textContent = `${assignment.workDate} · ${assignment.employeeName}`;
        content.append(title, meta);
        open.type = "button";
        open.className = "text-button";
        open.textContent = "Baustelle öffnen";
        open.addEventListener("click", () => {
          if (site) openSiteDashboard(site);
        });
        item.className = "site-module-item";
        item.append(content, open);
        elements.reportCenterMissingList.append(item);
      });
    }

    const query = elements.reportCenterSearch.value.trim().toLocaleLowerCase("de-DE");
    const filtered = reportCenterSort(allReports.filter((report) => {
      const site = reportSite(report);
      return (
        (elements.reportCenterStatus.value === "all"
          || report.status === elements.reportCenterStatus.value)
        && (elements.reportCenterType.value === "all"
          || report.reportType === elements.reportCenterType.value)
        && (elements.reportCenterSite.value === "all"
          || report.constructionSiteId === elements.reportCenterSite.value)
        && (elements.reportCenterEmployee.value === "all"
          || report.authorName === elements.reportCenterEmployee.value)
        && (!elements.reportCenterFrom.value
          || report.workDate >= elements.reportCenterFrom.value)
        && (!elements.reportCenterTo.value
          || report.workDate <= elements.reportCenterTo.value)
        && (
          !query
          || [
            report.number,
            report.summary,
            report.authorName,
            report.details,
            report.returnComment,
            site?.name,
            site?.customerName,
            reportStatusLabel(report.status),
            reportTypeLabel(report.reportType)
          ].filter(Boolean).join(" ").toLocaleLowerCase("de-DE").includes(query)
        )
      );
    }));

    elements.reportCenterResultCount.textContent =
      `${filtered.length} Bericht${filtered.length === 1 ? "" : "e"}`;
    elements.reportCenterList.replaceChildren();
    if (filtered.length === 0) {
      appendSiteModuleEmpty(elements.reportCenterList, "Keine Berichte für diese Auswahl.");
      return;
    }
    filtered.forEach((report) => {
      const site = reportSite(report);
      const item = document.createElement("li");
      const content = document.createElement("div");
      const heading = document.createElement("div");
      const title = document.createElement("strong");
      const type = document.createElement("small");
      const status = document.createElement("small");
      const meta = document.createElement("span");
      const detail = document.createElement("span");
      const actions = document.createElement("div");
      title.textContent = report.summary;
      type.className = "module-chip";
      type.textContent = reportTypeLabel(report.reportType);
      status.className = `module-chip module-chip--${report.status}`;
      status.textContent = reportStatusLabel(report.status);
      heading.append(title, type, status);
      meta.textContent = [
        report.number,
        report.workDate,
        site?.name,
        report.authorName,
        report.localDraft && report.updatedAt
          ? `gesichert ${formatDateTime(report.updatedAt)}`
          : null
      ].filter(Boolean).join(" · ");
      detail.textContent = report.status === "returned"
        ? `Überarbeitung: ${report.returnComment}`
        : report.details || "";
      detail.hidden = !detail.textContent;
      content.append(heading, meta, detail);
      actions.className = "site-module-item__actions";
      const open = document.createElement("button");
      open.type = "button";
      open.className = "text-button";
      open.textContent = report.localDraft ? "Weiterbearbeiten" : "Baustelle";
      open.addEventListener("click", () => openReportSite(report));
      actions.append(open);
      if (report.status === "submitted" || report.status === "returned") {
        const preview = document.createElement("button");
        preview.type = "button";
        preview.className = "text-button";
        preview.textContent = "PDF-Vorschau";
        preview.addEventListener("click", () => previewReportPdf(report));
        actions.append(preview);
      }
      if (report.status === "submitted") {
        const finalize = document.createElement("button");
        finalize.type = "button";
        finalize.className = "text-button";
        finalize.textContent = "Unterschreiben";
        finalize.addEventListener("click", () => openReportSite(report, { finalize: true }));
        const returnButton = document.createElement("button");
        returnButton.type = "button";
        returnButton.className = "text-button";
        returnButton.textContent = "Zurückgeben";
        returnButton.addEventListener("click", () => openReportReturnDialog(report));
        actions.append(finalize, returnButton);
      }
      const finalDocument = adminState.documents.find(
        (documentItem) => documentItem.id === report.finalDocumentId
      );
      if (finalDocument) {
        const pdf = documentDownloadLink(finalDocument, true);
        pdf.textContent = "Abschluss-PDF";
        actions.append(pdf);
      }
      item.className = "site-module-item report-center__item";
      item.append(content, actions);
      elements.reportCenterList.append(item);
    });
  }

  function vdeInspectionStatusLabel(status) {
    return status === "completed" ? "Abgeschlossen" : "Entwurf";
  }

  // Ist ein Bereich für diese Firma freigegeben?
  //
  // Darüber entscheidet ausschließlich die Plattformverwaltung. Die Sitzung
  // führt den Stand für jeden Angemeldeten mit, damit auch ein Monteur einen
  // gesperrten Bereich gar nicht erst angeboten bekommt. Ohne Angabe gilt ein
  // Bereich als freigegeben, sonst verschwände er beim ersten Start, bevor die
  // Sitzung steht.
  function moduleEnabled(key) {
    const ausDerSitzung = session?.modules?.[key];
    return ausDerSitzung === undefined ? true : Boolean(ausDerSitzung);
  }

  // Den Stand der Zugriffe nachholen.
  //
  // Die Liste kam bisher nur beim Anmelden. Schaltet die Plattformverwaltung
  // danach einen Bereich frei, merkt die App davon nichts: der Server laesst
  // ihn sofort zu, aber der Eintrag in der Leiste bleibt weg, bis die Seite
  // vollstaendig neu geladen wird. Auf einem Telefon mit eingerichteter App
  // passiert das tagelang nicht - dort heisst "erst nach dem Neuladen" in der
  // Praxis "gar nicht". Genau so ist der Fuhrpark gemeldet worden:
  // eingeschaltet, und trotzdem nicht da.
  //
  // Dasselbe gilt fuer Rollen. Eine Datenbankreparatur hatte Piets Azubi-Rolle
  // bereits wiederhergestellt; diese Funktion uebernahm aus der frischen
  // Serverantwort aber nur `modules`. Die laufende iPhone-Sitzung behielt
  // deshalb `installer` und versteckte das Berichtsheft weiter. Nun wird die
  // ganze serverseitige Zugriffssicht übernommen.
  //
  // Gefragt wird beim Zurueckkommen in die App und in ruhigem Abstand. Ein
  // haeufigeres Nachfragen brauchte es nicht: eine Freigabe oder Rollenänderung
  // ist nichts, was sekundengenau ankommen muss.
  async function refreshModuleAccess() {
    if (demoMode || !session || elements.dashboardView.hidden) return;
    let neueSitzung;
    try {
      neueSitzung = (await requestJson("./api/v1/session")).session;
    } catch (error) {
      // Offline oder ein Serverfehler: der bekannte Stand bleibt stehen.
      // Bereiche wegzunehmen, nur weil gerade niemand antwortet, waere
      // schlimmer als eine Liste, die eine Weile alt ist.
      if (error.status === 401) showLogin();
      return;
    }
    if (!neueSitzung) return;
    if (sessionAccessSignature(neueSitzung) === sessionAccessSignature(session)) return;
    session = neueSitzung;
    saveState();
    applyNavigationAccess();
    // Wer gerade in einem Bereich steht, der eben abgeschaltet wurde, kann
    // dort nicht bleiben - der Bildschirm waere noch da, die Schnittstelle
    // dahinter aber schon gesperrt.
    // Die Bereiche heissen wie ihre Schaltflaechen: "vehicles" gehoert zu
    // #nav-vehicles. Deshalb genuegt der Name, um zu sehen, ob es den Bereich
    // fuer diesen Angemeldeten noch gibt.
    const aktuellerKnopf = document.querySelector(`#nav-${currentDashboardPane}`);
    if (aktuellerKnopf?.hidden) showDashboardPane("start", false);
    render();
    renderTopbarUser();
    await Promise.all([
      refreshVehicles(),
      deviceModule.refresh(),
      refreshApprenticeData(),
      refreshApprenticeReviews()
    ]);
  }

  function vdeModuleEnabled() {
    return moduleEnabled("vde");
  }

  function vdeEditorUrl(siteId, inspectionId = null, date = null) {
    const search = new URLSearchParams({
      constructionSiteId: siteId,
      date: date || adminState?.date || localDateKey()
    });
    if (inspectionId) search.set("inspectionId", inspectionId);
    return `./vde/index.html?${search.toString()}`;
  }

  // Das fertige Pruefprotokoll haengt an einem Verweis, den der Browser selbst
  // verfolgt - die Fassung gehoert deshalb in den Adressteil.
  function vdePdfUrl(inspectionId, date = null) {
    const search = new URLSearchParams({
      date: date || adminState?.date || localDateKey()
    });
    return browserFileUrl(
      `./api/v1/vde/inspections/${encodeURIComponent(inspectionId)}/pdf?${search.toString()}`
    );
  }

  function selectWorkspaceSection({
    requestedSection,
    buttons,
    sections,
    buttonAttribute,
    sectionAttribute,
    scroll = false
  }) {
    const requestedButton = buttons.find(
      (button) => button.dataset[buttonAttribute] === requestedSection && !button.hidden
    );
    const section = requestedButton ? requestedSection : "overview";

    buttons.forEach((button) => {
      const active = button.dataset[buttonAttribute] === section;
      button.classList.toggle("workspace-section-tab--active", active);
      button.setAttribute("aria-pressed", String(active));
    });

    let selectedPanel = null;
    sections.forEach((panel) => {
      const active = panel.dataset[sectionAttribute] === section;
      panel.hidden = !active;
      if (active) {
        selectedPanel = panel;
        if (panel instanceof HTMLDetailsElement) panel.open = true;
      }
    });

    if (scroll && selectedPanel) {
      selectedPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    return section;
  }

  function showEmployeeSiteSection(section, scroll = false) {
    employeeSiteSection = selectWorkspaceSection({
      requestedSection: section,
      buttons: elements.employeeSiteSectionButtons,
      sections: elements.employeeSiteSections,
      buttonAttribute: "employeeSiteSectionButton",
      sectionAttribute: "employeeSiteSection",
      scroll
    });
    rememberWorkspaceSection("employee", employeeSiteState?.site?.id, employeeSiteSection);
  }

  function showSiteDashboardSection(section, scroll = false) {
    siteDashboardSection = selectWorkspaceSection({
      requestedSection: section,
      buttons: elements.siteDashboardSectionButtons,
      sections: elements.siteDashboardSections,
      buttonAttribute: "siteDashboardSectionButton",
      sectionAttribute: "siteDashboardSection",
      scroll
    });
    rememberWorkspaceSection("office", openedSiteId, siteDashboardSection);
  }

  function workspaceSectionStorageKey(scope, siteId) {
    const userId = session?.user?.id || cachedUserId || "demo";
    return `schaefchen:workspace-section:${scope}:${userId}:${siteId}`;
  }

  function rememberWorkspaceSection(scope, siteId, section) {
    if (!siteId || !section) return;
    try {
      window.localStorage.setItem(workspaceSectionStorageKey(scope, siteId), section);
    } catch {
      // Die Bereichswahl ist Komfortzustand und darf den Arbeitsablauf nie blockieren.
    }
  }

  function preferredWorkspaceSection(scope, siteId) {
    try {
      const saved = window.localStorage.getItem(workspaceSectionStorageKey(scope, siteId));
      if (saved) return saved;
    } catch {
      // Ohne lokalen Speicher wird die rollenabhängige Standardansicht verwendet.
    }
    const roles = session?.user?.roles || [];
    if (scope === "employee" && roles.includes("foreman")) return "reports";
    if (scope === "employee" && roles.includes("installer")) return "tasks";
    return "overview";
  }

  function appendVdeInspection(list, inspection, siteId, date) {
    const item = document.createElement("li");
    const content = document.createElement("div");
    const heading = document.createElement("div");
    const title = document.createElement("strong");
    const badge = document.createElement("small");
    const meta = document.createElement("span");
    const action = document.createElement("a");
    title.textContent = inspection.name;
    badge.className = inspection.status === "completed"
      ? "module-chip module-chip--approved"
      : "module-chip";
    badge.textContent = vdeInspectionStatusLabel(inspection.status);
    heading.append(title, badge);
    meta.textContent = [
      inspection.number,
      new Intl.DateTimeFormat("de-DE").format(
        new Date(`${inspection.inspectionDate}T12:00:00`)
      ),
      inspection.inspectorName,
      inspection.sourceMode === "legacy_v15" ? "V15-Import" : null
    ].filter(Boolean).join(" · ");
    content.append(heading, meta);
    action.className = "text-button site-module-item__action";
    action.href = inspection.status === "completed"
      ? vdePdfUrl(inspection.id, date)
      : vdeEditorUrl(siteId, inspection.id, date);
    action.textContent = inspection.status === "completed" ? "PDF" : "Weiter";
    if (inspection.status === "completed") {
      action.target = "_blank";
      action.rel = "noopener";
    }
    item.className = "site-module-item";
    item.append(content, action);
    list.append(item);
  }

  function renderSiteVdeInspections(siteId) {
    const enabled = vdeModuleEnabled();
    elements.siteDashboardVdeTab.hidden = !enabled;
    elements.siteDashboardVdeInspections.replaceChildren();
    if (!enabled) {
      elements.siteDashboardVdeCount.textContent = "0";
      showSiteDashboardSection(siteDashboardSection);
      return;
    }
    const inspections = (adminState?.vdeInspections || []).filter(
      (inspection) => inspection.constructionSiteId === siteId
    );
    elements.siteDashboardVdeCount.textContent = String(inspections.length);
    if (inspections.length === 0) {
      appendSiteModuleEmpty(
        elements.siteDashboardVdeInspections,
        "Noch keine VDE-Prüfung für diese Baustelle."
      );
      showSiteDashboardSection(siteDashboardSection);
      return;
    }
    inspections.forEach((inspection) => {
      appendVdeInspection(
        elements.siteDashboardVdeInspections,
        inspection,
        siteId,
        adminState.date
      );
    });
    showSiteDashboardSection(siteDashboardSection);
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

  // Die Artikelliste fuers Verknuepfen.
  //
  // Sie kommt aus dem Lager und wird einmal je Sitzung geholt, wenn zum ersten
  // Mal ein Materialformular aufgeht. Frueher zu laden waere Arbeit fuer alle,
  // die nie Material eintragen; jedesmal neu zu laden waere Arbeit auf einem
  // Telefon, das ohnehin am Netz haengt.
  let lagerartikelListe = null;

  async function lagerartikelLaden() {
    if (!moduleEnabled("warehouse")) return [];
    if (lagerartikelListe) return lagerartikelListe;
    try {
      const antwort = await requestJson("./api/v1/stock/items");
      lagerartikelListe = antwort.items || [];
    } catch {
      // Ohne Liste bleibt das Feld weg. Material laesst sich weiterhin als
      // freie Zeile eintragen - das ist der Weg, den es seit jeher gibt.
      lagerartikelListe = [];
    }
    return lagerartikelListe;
  }

  /**
   * Fuellt einen Artikelwaehler und blendet ihn ein.
   *
   * Ohne Lagermodul und ohne Artikel bleibt er verborgen: ein leeres
   * Auswahlfeld ist eine Frage, auf die es keine Antwort gibt.
   */
  async function artikelwahlVorbereiten(select, label, nameFeld, einheitFeld) {
    select.hidden = true;
    label.hidden = true;
    const artikel = await lagerartikelLaden();
    if (!artikel.length) return;

    select.replaceChildren();
    const leer = document.createElement("option");
    leer.value = "";
    leer.textContent = "Ohne Lagerartikel";
    select.append(leer);
    artikel.forEach((eintrag) => {
      const option = document.createElement("option");
      option.value = eintrag.id;
      option.textContent = `${eintrag.name} (${eintrag.itemNumber})`;
      option.dataset.name = eintrag.name;
      option.dataset.unit = eintrag.unit;
      select.append(option);
    });
    select.hidden = false;
    label.hidden = false;

    // Bezeichnung und Einheit uebernehmen. Die Einheit ist der eigentliche
    // Grund: nur wenn sie mit der des Artikels uebereinstimmt, laesst sich der
    // Bestand ueberhaupt gegen die gebrauchte Menge rechnen. Beide bleiben
    // aenderbar - die Zeile der Baustelle darf genauer sein als der Stammsatz.
    select.onchange = () => {
      const gewaehlt = select.selectedOptions[0];
      if (!gewaehlt?.value) return;
      nameFeld.value = gewaehlt.dataset.name || "";
      const einheit = gewaehlt.dataset.unit || "";
      if (einheitFeld.tagName !== "SELECT") {
        einheitFeld.value = einheit;
        return;
      }

      // Die Auswahl im Buero kennt fuenf feste Einheiten. Ein Artikel darf
      // aber jede tragen, und "Meter" ist nicht "m": stand sie nicht in der
      // Liste, blieb stillschweigend die alte stehen - und weil sich zwei
      // verschiedene Einheiten nicht verrechnen lassen, sagte die Zeile
      // danach nur noch "bitte selbst pruefen". Fehlt sie, kommt sie dazu.
      let passend = [...einheitFeld.options]
        .find((option) => option.value.toLowerCase() === einheit.toLowerCase());
      if (!passend && einheit) {
        passend = document.createElement("option");
        passend.value = einheit;
        passend.textContent = einheit;
        einheitFeld.append(passend);
      }
      if (passend) einheitFeld.value = passend.value;
    };
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

  function collectSiteReportPhotos() {
    return [...elements.siteReportPhotoList.querySelectorAll("[data-report-photo-id]")]
      .filter((row) => row.querySelector('input[type="checkbox"]').checked)
      .map((row) => ({
        documentId: row.dataset.reportPhotoId,
        caption: row.querySelector('input[type="text"]').value.trim() || null
      }));
  }

  function renderSiteReportPhotoChoices() {
    const photos = documentsForEntity("construction_site", openedSiteId)
      .filter((documentItem) => (
        documentItem.category === "photo"
        && ["image/jpeg", "image/png"].includes(documentItem.mimeType)
      ));
    elements.siteReportPhotoList.replaceChildren();
    if (photos.length === 0) {
      const empty = document.createElement("p");
      empty.className = "site-module-form__note";
      empty.textContent = "Noch kein geeignetes JPG- oder PNG-Baustellenfoto vorhanden.";
      elements.siteReportPhotoList.append(empty);
      return;
    }
    photos.forEach((photo) => {
      const row = document.createElement("div");
      const select = document.createElement("label");
      const checkbox = document.createElement("input");
      const title = document.createElement("span");
      const caption = document.createElement("input");
      row.dataset.reportPhotoId = photo.id;
      checkbox.type = "checkbox";
      title.textContent = photo.title;
      select.append(checkbox, title);
      caption.type = "text";
      caption.maxLength = 300;
      caption.placeholder = "Bildunterschrift";
      caption.disabled = true;
      caption.setAttribute("aria-label", `Bildunterschrift für ${photo.title}`);
      checkbox.addEventListener("change", () => {
        caption.disabled = !checkbox.checked;
        if (checkbox.checked) caption.focus();
        saveSiteReportDraft();
      });
      caption.addEventListener("input", saveSiteReportDraft);
      row.append(select, caption);
      elements.siteReportPhotoList.append(row);
    });
  }

  function updateSiteReportPersonnelTotal() {
    const total = collectSiteReportPersonnel().reduce((sum, entry) => sum + entry.minutes, 0);
    elements.siteReportPersonnelTotal.textContent = `Gesamt: ${formatMinutes(total)} h`;
  }

  function siteReportDraftStorageKey(siteId, sourceMode) {
    const userId = session?.user?.id || cachedUserId || "demo";
    return `schaefchen:site-report-draft:${userId}:${siteId}:${sourceMode}`;
  }

  function readSiteReportDraft(siteId, sourceMode) {
    if (!siteId || !["digital", "speech"].includes(sourceMode)) return null;
    try {
      return JSON.parse(
        window.localStorage.getItem(siteReportDraftStorageKey(siteId, sourceMode))
      );
    } catch {
      return null;
    }
  }

  function clearSiteReportDraft(siteId, sourceMode) {
    if (!siteId || !sourceMode) return;
    try {
      window.localStorage.removeItem(siteReportDraftStorageKey(siteId, sourceMode));
      if (adminState) renderReportCenter();
    } catch {
      // Ein blockierter Komfortspeicher darf den Bericht nicht blockieren.
    }
  }

  function saveSiteReportDraft() {
    const sourceMode = elements.siteReportSourceMode.value;
    if (
      !openedSiteId
      || elements.siteReportForm.hidden
      || !["digital", "speech"].includes(sourceMode)
    ) return;
    try {
      window.localStorage.setItem(
        siteReportDraftStorageKey(openedSiteId, sourceMode),
        JSON.stringify({
          reportType: elements.siteReportType.value,
          workDate: elements.siteReportDate.value,
          summary: elements.siteReportSummary.value,
          details: elements.siteReportDetails.value,
          obstructions: elements.siteReportObstructions.value,
          openItems: elements.siteReportOpenItems.value,
          weather: elements.siteReportWeather.value,
          materialsAndEquipment: elements.siteReportMaterials.value,
          agreements: elements.siteReportAgreements.value,
          incidents: elements.siteReportIncidents.value,
          personnel: collectSiteReportPersonnel(),
          photos: collectSiteReportPhotos(),
          updatedAt: new Date().toISOString()
        })
      );
      if (adminState) renderReportCenter();
    } catch {
      // Der Bericht bleibt vollständig manuell speicherbar.
    }
  }

  function renderSiteReportPersonnel() {
    const members = new Map();
    (adminState?.planningAssignments || adminState?.weekAssignments || [])
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
      input.addEventListener("input", () => {
        updateSiteReportPersonnelTotal();
        saveSiteReportDraft();
      });
      unit.textContent = "Std.";
      inputWrap.append(input, unit);
      row.append(name, inputWrap);
      elements.siteReportPersonnelList.append(row);
    });
    updateSiteReportPersonnelTotal();
  }

  function resetSiteReportForm({ clearDraft = false } = {}) {
    if (clearDraft) {
      clearSiteReportDraft(openedSiteId, elements.siteReportSourceMode.value);
    }
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
    elements.siteReportPhotoList.replaceChildren();
    updateSiteReportPersonnelTotal();
    elements.siteReportForm.hidden = true;
    elements.siteReportSubmit.disabled = false;
  }

  // Welche Berichtsarten hat diese Firma?
  //
  // Montageberichte und Bautagesberichte sind zwei getrennte Bereiche im
  // Katalog: ein Betrieb kann den einen fuehren und den anderen nicht. Die
  // Auswahl hat das bisher nicht gewusst und immer beide angeboten. Wer den
  // falschen nahm, merkte es erst nach dem Speichern - und hatte Titel,
  // Leistungen, Stunden und Fotos umsonst eingetragen.
  const BERICHTSARTEN = [
    ["montage", "Montageschein", "assembly_reports"],
    ["daily", "Bautagesbericht", "site_daily_reports"]
  ];

  function verfuegbareBerichtsarten() {
    return BERICHTSARTEN.filter(([, , modul]) => moduleEnabled(modul));
  }

  // Fuellt eine Auswahl mit genau den Arten, die es gibt. Bleibt nur eine
  // uebrig, gibt es nichts zu waehlen: dann steht sie fest da, statt eine
  // Entscheidung vorzutaeuschen.
  // Die Witterung gehoert zum Bautagesbericht, nicht zum Montageschein - der
  // Server verwirft sie dort. Sichtbar blieb das Feld trotzdem: man konnte es
  // ausfuellen und der Eintrag verschwand beim Speichern, ohne ein Wort. Die
  // mobile Karte hat das schon immer richtig gemacht; die Akte jetzt auch.
  function updateSiteReportTypeFields() {
    const istTagesbericht = elements.siteReportType.value === "daily";
    elements.siteReportWeatherField.hidden = !istTagesbericht;
    elements.siteReportWeather.hidden = !istTagesbericht;
    if (!istTagesbericht) elements.siteReportWeather.value = "";
  }

  function fuelleBerichtsarten(select, wunsch = null) {
    const arten = verfuegbareBerichtsarten();
    const vorher = wunsch || select.value;
    select.replaceChildren();
    arten.forEach(([wert, beschriftung]) => {
      const option = document.createElement("option");
      option.value = wert;
      option.textContent = beschriftung;
      select.append(option);
    });
    select.value = arten.some(([wert]) => wert === vorher) ? vorher : (arten[0]?.[0] || "");
    select.disabled = arten.length < 2;
  }

  function openSiteReportForm(sourceMode, photoFile = null) {
    resetSiteReportForm();
    reportPhotoFile = photoFile;
    elements.siteReportSourceMode.value = sourceMode;
    fuelleBerichtsarten(elements.siteReportType);
    updateSiteReportTypeFields();
    elements.siteReportDate.value = localDateKey();
    renderSiteReportPersonnel();
    renderSiteReportPhotoChoices();
    elements.siteReportSourceNote.textContent = {
      digital: "Der Bericht wird direkt digital erfasst.",
      photo: reportPhotoFile ? `${reportPhotoFile.name} · ${formatFileSize(reportPhotoFile.size)}` : "Originalfoto auswählen.",
      speech: "Das Diktat wird als bearbeitbarer Text übernommen."
    }[sourceMode];
    elements.siteReportForm.hidden = false;
    const draft = readSiteReportDraft(openedSiteId, sourceMode);
    if (draft) {
      // Der Entwurf darf keine Art zurueckholen, die es nicht mehr gibt: sonst
      // steht sie wieder in der Auswahl und scheitert beim Speichern.
      fuelleBerichtsarten(elements.siteReportType, draft.reportType);
      updateSiteReportTypeFields();
      elements.siteReportDate.value = draft.workDate || localDateKey();
      renderSiteReportPersonnel();
      elements.siteReportSummary.value = draft.summary || "";
      elements.siteReportDetails.value = draft.details || "";
      elements.siteReportObstructions.value = draft.obstructions || "";
      elements.siteReportOpenItems.value = draft.openItems || "";
      elements.siteReportWeather.value = draft.weather || "";
      elements.siteReportMaterials.value = draft.materialsAndEquipment || "";
      elements.siteReportAgreements.value = draft.agreements || "";
      elements.siteReportIncidents.value = draft.incidents || "";
      (draft.personnel || []).forEach((entry) => {
        const input = elements.siteReportPersonnelList.querySelector(
          `input[data-user-id="${entry.userId}"]`
        );
        if (input) input.value = String(Math.round(entry.minutes / 15) / 4);
      });
      (draft.photos || []).forEach((entry) => {
        const row = elements.siteReportPhotoList.querySelector(
          `[data-report-photo-id="${entry.documentId}"]`
        );
        if (!row) return;
        const checkbox = row.querySelector('input[type="checkbox"]');
        const caption = row.querySelector('input[type="text"]');
        checkbox.checked = true;
        caption.disabled = false;
        caption.value = entry.caption || "";
      });
      updateSiteReportPersonnelTotal();
      elements.siteReportSourceNote.textContent += " · Entwurf automatisch wiederhergestellt.";
    }
    elements.siteReportSummary.focus({ preventScroll: true });
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

  // Die Kundenliste des eigenen Bereichs. Sie zeigt, was ein Kunde im Betrieb
  // bedeutet: wer dort ansprechbar ist und wie viel gerade fuer ihn laeuft.
  //
  // Die Spalte "Offene Rechnungen" aus dem Entwurf fehlt mit Absicht. Es gibt
  // in Schaefchen keine Rechnungsstellung - eine Spalte mit erfundenen
  // Betraegen waere schlimmer als keine.
  function renderCustomerOverview() {
    if (!adminState) return;
    const query = elements.customerSearchField.value.trim().toLocaleLowerCase("de-DE");
    const kunden = adminState.customers
      .filter((customer) => customerStatusGroup(customer.status) === "active")
      .filter((customer) => !query || customerSearchText(customer).includes(query))
      .sort((links, rechts) => links.displayName.localeCompare(rechts.displayName, "de-DE"));

    elements.customerOverviewList.replaceChildren();
    if (kunden.length === 0) {
      const leer = document.createElement("li");
      leer.className = "admin-list__empty";
      leer.textContent = query ? "Kein Kunde passt zur Suche." : "Noch kein Kunde angelegt.";
      elements.customerOverviewList.append(leer);
      return;
    }

    appendAdminListHead(
      elements.customerOverviewList,
      ["Kunde", "Nummer", "Ansprechpartner", "Baustellen"]
    );
    kunden.forEach((customer) => {
      const baustellen = adminState.sites.filter(
        (site) => site.customerName === customer.displayName
          && siteStatusGroup(site.status) === "active"
      );
      const zeile = document.createElement("li");
      const name = document.createElement("strong");
      const knopf = document.createElement("button");
      name.textContent = customer.displayName;
      zeile.className = "admin-list__row";
      knopf.type = "button";
      knopf.className = "text-button";
      knopf.textContent = "Bearbeiten";
      knopf.addEventListener("click", () => openCustomerEditor(customer));
      zeile.append(
        name,
        adminListCells([
          customer.number,
          [customer.email, customer.phone].filter(Boolean).join(" · "),
          `${baustellen.length} laufend`
        ]),
        knopf
      );
      elements.customerOverviewList.append(zeile);
    });
  }

  // ---------------------------------------------------------------------
  // Fuhrpark
  // ---------------------------------------------------------------------

  const FAHRZEUGARTEN = {
    van: "Transporter",
    car: "Pkw",
    truck: "Lkw",
    trailer: "Anhänger",
    machine: "Maschine"
  };

  const FAHRZEUGZUSTAND = {
    active: ["Im Einsatz", "active"],
    workshop: ["Werkstatt", "pending"],
    retired: ["Ausgemustert", "archived"]
  };

  function renderVehicleList() {
    if (!elements.vehicleList) return;
    const query = elements.vehicleSearchField.value.trim().toLocaleLowerCase("de-DE");
    const fahrzeuge = (vehicleState || []).filter((fahrzeug) => !query || [
      fahrzeug.licencePlate, fahrzeug.label, fahrzeug.assignedUserName,
      FAHRZEUGARTEN[fahrzeug.vehicleType]
    ].filter(Boolean).join(" ").toLocaleLowerCase("de-DE").includes(query));

    elements.vehicleList.replaceChildren();
    if (fahrzeuge.length === 0) {
      const leer = document.createElement("li");
      leer.className = "admin-list__empty";
      leer.textContent = query
        ? "Kein Fahrzeug passt zur Suche."
        : "Noch kein Fahrzeug eingetragen.";
      elements.vehicleList.append(leer);
      return;
    }

    appendAdminListHead(
      elements.vehicleList,
      ["Kennzeichen", "Bezeichnung", "Art", "Fahrer", "Nächste HU", "Zustand"]
    );
    const heute = localDateKey();
    for (const fahrzeug of fahrzeuge) {
      const zeile = document.createElement("li");
      const kennzeichen = document.createElement("strong");
      const marke = document.createElement("span");
      const knopf = document.createElement("button");
      const [zustandText, zustandGruppe] = FAHRZEUGZUSTAND[fahrzeug.status]
        || [fahrzeug.status, "active"];
      zeile.className = "admin-list__row";
      kennzeichen.textContent = fahrzeug.licencePlate;
      marke.className = `site-status site-status--${zustandGruppe}`;
      marke.textContent = zustandText;

      // Eine abgelaufene Hauptuntersuchung ist kein Termin mehr, sondern ein
      // Fahrverbot. Sie steht deshalb rot da.
      const hu = document.createElement("span");
      if (!fahrzeug.nextInspectionOn) {
        hu.textContent = "–";
      } else {
        hu.textContent = shortDate(fahrzeug.nextInspectionOn);
        if (fahrzeug.nextInspectionOn < heute) {
          hu.className = "vehicle-overdue";
          hu.textContent = `${shortDate(fahrzeug.nextInspectionOn)} · überfällig`;
        }
      }

      knopf.type = "button";
      knopf.className = "text-button";
      knopf.textContent = "Bearbeiten";
      knopf.addEventListener("click", () => openVehicleEditor(fahrzeug));
      zeile.append(
        kennzeichen,
        adminListCells([
          fahrzeug.label,
          `${FAHRZEUGARTEN[fahrzeug.vehicleType] || fahrzeug.vehicleType} · ${fahrzeug.requiredLicenceClass}`,
          fahrzeug.assignedUserName,
          hu,
          marke
        ]),
        knopf
      );
      elements.vehicleList.append(zeile);
    }
  }

  function fillVehicleDrivers(selected) {
    elements.vehicleDriver.replaceChildren();
    const leer = document.createElement("option");
    leer.value = "";
    leer.textContent = "Steht im Hof";
    elements.vehicleDriver.append(leer);
    for (const employee of plannableEmployees(adminState?.employees)) {
      const eintrag = document.createElement("option");
      eintrag.value = employee.id;
      eintrag.textContent = `${employee.firstName} ${employee.lastName} · ${employee.personnelNumber}`;
      elements.vehicleDriver.append(eintrag);
    }
    elements.vehicleDriver.value = selected || "";
  }

  function openVehicleEditor(fahrzeug = null) {
    editingVehicleId = fahrzeug?.id || null;
    editingVehicleRowVersion = fahrzeug?.rowVersion || null;
    elements.vehicleFormTitle.textContent = fahrzeug
      ? `${fahrzeug.licencePlate} bearbeiten`
      : "Fahrzeug anlegen";
    elements.vehiclePlate.value = fahrzeug?.licencePlate || "";
    elements.vehicleLabel.value = fahrzeug?.label || "";
    elements.vehicleType.value = fahrzeug?.vehicleType || "van";
    elements.vehicleLicenceClass.value = fahrzeug?.requiredLicenceClass || "B";
    fillVehicleDrivers(fahrzeug?.assignedUserId);
    elements.vehicleInspection.value = fahrzeug?.nextInspectionOn || "";
    elements.vehicleService.value = fahrzeug?.nextServiceOn || "";
    elements.vehicleStatus.value = fahrzeug?.status || "active";
    elements.vehicleNote.value = fahrzeug?.note || "";
    elements.vehicleMessage.textContent = "";
    elements.vehicleForm.hidden = false;
    elements.vehicleForm.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function closeVehicleEditor() {
    editingVehicleId = null;
    editingVehicleRowVersion = null;
    elements.vehicleForm.hidden = true;
    elements.vehicleMessage.textContent = "";
  }

  async function refreshVehicles() {
    if (!canPlan() || demoMode || !moduleEnabled("fleet")) {
      vehicleState = [];
      renderVehicleList();
      return;
    }
    try {
      const body = await requestJson("./api/v1/admin/vehicles");
      vehicleState = body.vehicles;
      renderVehicleList();
    } catch (error) {
      if (error.status === 401) showLogin();
      // Ein abgeschaltetes Modul ist kein Fehler, den man melden muesste: der
      // Eintrag in der Leiste steht dann ohnehin nicht da.
      else if (error.status !== 404) showToast(error.message);
    }
  }

  // Alle VDE-Pruefungen des Betriebs an einer Stelle. Bisher waren sie nur in
  // der Akte der einzelnen Baustelle zu finden - wer wissen wollte, was noch
  // offen ist, musste jede Baustelle einzeln aufmachen.
  function renderInspectionOverview() {
    if (!adminState) return;
    const query = elements.inspectionSearchField.value.trim().toLocaleLowerCase("de-DE");
    const selectedSiteId = elements.inspectionSiteFilter.value || "all";
    const selectedStatus = elements.inspectionStatusFilter.value || "draft";
    populatePlanningFilter(
      elements.inspectionSiteFilter,
      adminState.sites,
      "Alle Baustellen",
      (site) => site.name
    );
    if (selectedSiteId === "all" || adminState.sites.some((site) => site.id === selectedSiteId)) {
      elements.inspectionSiteFilter.value = selectedSiteId;
    }
    elements.inspectionActiveTab.classList.toggle("page-tab--active", selectedStatus === "draft");
    elements.inspectionArchiveTab.classList.toggle("page-tab--active", selectedStatus === "completed");
    elements.inspectionNew.disabled = !adminState.sites.some(
      (site) => siteStatusGroup(site.status) === "active"
    );
    const baustelle = (id) => adminState.sites.find((site) => site.id === id);
    const pruefungen = (adminState.vdeInspections || [])
      .map((inspection) => ({ inspection, site: baustelle(inspection.constructionSiteId) }))
      .filter(({ inspection, site }) => (
        (selectedStatus === "all" || inspection.status === selectedStatus)
        && (elements.inspectionSiteFilter.value === "all"
          || inspection.constructionSiteId === elements.inspectionSiteFilter.value)
        && (!query || [
          inspection.name, inspection.number, inspection.inspectorName, site?.name
        ].filter(Boolean).join(" ").toLocaleLowerCase("de-DE").includes(query))
      ))
      .sort((links, rechts) => (
        rechts.inspection.inspectionDate.localeCompare(links.inspection.inspectionDate)
      ));

    elements.inspectionOverviewList.replaceChildren();
    if (pruefungen.length === 0) {
      const leer = document.createElement("li");
      leer.className = "admin-list__empty";
      leer.textContent = query
        ? "Kein Prüfprotokoll passt zur Suche."
        : "Noch kein Prüfprotokoll angelegt.";
      elements.inspectionOverviewList.append(leer);
      return;
    }

    appendAdminListHead(
      elements.inspectionOverviewList,
      ["Nr.", "Baustelle", "Prüfungsart", "Datum", "Status", "Prüfer"]
    );
    pruefungen.forEach(({ inspection, site }) => {
      const zeile = document.createElement("li");
      const name = document.createElement("strong");
      const marke = document.createElement("span");
      const ziel = document.createElement("a");
      zeile.className = "admin-list__row";
      name.textContent = inspection.number;
      marke.className = `site-status site-status--${
        inspection.status === "completed" ? "completed" : "active"
      }`;
      marke.textContent = vdeInspectionStatusLabel(inspection.status);
      ziel.className = "text-button";
      ziel.href = inspection.status === "completed"
        ? vdePdfUrl(inspection.id, adminState.date)
        : vdeEditorUrl(inspection.constructionSiteId, inspection.id, adminState.date);
      ziel.textContent = inspection.status === "completed" ? "PDF" : "Weiter";
      if (inspection.status === "completed") {
        ziel.target = "_blank";
        ziel.rel = "noopener";
      }
      zeile.append(
        name,
        adminListCells([
          site?.name,
          inspection.name,
          shortDate(inspection.inspectionDate),
          marke,
          inspection.inspectorName
        ]),
        ziel
      );
      elements.inspectionOverviewList.append(zeile);
    });
  }

  function openCustomerEditor(customer) {
    openedCustomerId = customer.id;
    // Kunde und Projekt haben einen eigenen Bereich; das Baustellenformular
    // ist dort nicht mehr in Reichweite und wird deshalb auch nicht mehr
    // zugeklappt.
    [elements.customerPanel, elements.projectPanel]
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
    [elements.customerPanel, elements.projectPanel]
      .forEach((panel) => { panel.open = false; });
    elements.customerEditForm.hidden = true;
    elements.customerManagementPanel.hidden = true;
    elements.projectManagementPanel.hidden = false;
    elements.projectEditNumber.textContent = project.number;
    elements.projectEditCustomer.textContent = project.customerName;
    elements.projectEditName.value = project.name;
    elements.projectEditShortText.value = project.shortText || "";
    elements.projectEditManager.value = project.projectManagerId || "";
    elements.projectEditManager.disabled = Boolean(adminState.projectScopeRestricted);
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

  // Die vier Felder der Uebersicht aus dem Entwurf: wo, wer fuehrt, wer steht
  // heute dort und wann geht es weiter. Alles vier steht schon in den Daten -
  // es stand nur nirgends beieinander.
  function renderSiteOverviewCards(site) {
    elements.siteOverviewAddress.textContent = siteAddressText(site) || "Keine Adresse hinterlegt";

    const einsaetze = planningAssignments()
      .filter((assignment) => assignment.constructionSiteId === site.id);
    const verantwortlich = einsaetze.find((assignment) => assignment.reportResponsible);
    elements.siteOverviewForeman.textContent = verantwortlich
      ? verantwortlich.employeeName
      : "Noch niemand eingeteilt";

    const heute = localDateKey();
    const heuteVorOrt = einsaetze.filter((assignment) => assignment.workDate === heute);
    elements.siteOverviewToday.replaceChildren();
    if (heuteVorOrt.length === 0) {
      const leer = document.createElement("span");
      leer.className = "site-overview-card__value site-overview-card__value--leer";
      leer.textContent = "Heute niemand";
      elements.siteOverviewToday.append(leer);
    } else {
      // Hoechstens drei Zeichen, danach eine rote Marke mit der Restzahl -
      // vier Namen nebeneinander liest ohnehin niemand.
      for (const assignment of heuteVorOrt.slice(0, 3)) {
        const zeichen = document.createElement("span");
        zeichen.className = "site-overview-avatar";
        zeichen.title = assignment.employeeName;
        zeichen.textContent = initialen(assignment.employeeName);
        elements.siteOverviewToday.append(zeichen);
      }
      if (heuteVorOrt.length > 3) {
        const rest = document.createElement("span");
        rest.className = "site-overview-avatar site-overview-avatar--rest";
        rest.textContent = `+${heuteVorOrt.length - 3}`;
        rest.title = heuteVorOrt.slice(3).map((eintrag) => eintrag.employeeName).join(", ");
        elements.siteOverviewToday.append(rest);
      }
    }

    const naechster = einsaetze
      .filter((assignment) => assignment.workDate >= heute)
      .sort((links, rechts) => (
        links.workDate.localeCompare(rechts.workDate)
        || String(links.plannedStartTime || "").localeCompare(String(rechts.plannedStartTime || ""))
      ))[0];
    elements.siteOverviewNext.textContent = naechster
      ? `${terminTag(naechster.workDate)}${
        naechster.plannedStartTime ? `, ${naechster.plannedStartTime.slice(0, 5)}` : ""
      }`
      : "Kein Einsatz geplant";
  }

  function initialen(name) {
    return String(name || "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((teil) => teil[0].toLocaleUpperCase("de-DE"))
      .join("");
  }

  // "Heute" und "Morgen" liest sich schneller als ein Datum, das man erst mit
  // dem Kalender im Kopf abgleichen muss.
  function terminTag(datum) {
    const heute = localDateKey();
    if (datum === heute) return "Heute";
    if (datum === addIsoDays(heute, 1)) return "Morgen";
    return shortDate(datum);
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

  // Die Akte einer Baustelle liegt im Bereich "Baustellen". Wer sie von
  // woanders aus oeffnet - aus der Berichtszentrale, aus der Suche, vom
  // Dashboard -, muss deshalb zuerst dorthin.
  //
  // Der Wechsel steht hier und nicht bei jedem Aufrufer: solange jeder es
  // selbst tun musste, hat es einer vergessen. In der Berichtszentrale tat
  // "Baustelle oeffnen" deshalb nichts Sichtbares - die Akte ging auf, aber in
  // einem Bereich, den man gerade nicht ansieht.
  function openSiteDashboard(site) {
    if (currentDashboardPane !== "sites") showDashboardPane("sites", false);
    const address = siteAddressText(site);
    const assignedEmployees = new Map();
    planningAssignments()
      .filter((assignment) => assignment.constructionSiteId === site.id)
      .forEach((assignment) => {
        assignedEmployees.set(assignment.employeeId, assignment.employeeName);
      });

    openedSiteId = site.id;
    siteDashboardSection = preferredWorkspaceSection("office", site.id);
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
    renderSiteOverviewCards(site);
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
    renderSitePhotos(site.id);
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
    renderSiteVdeInspections(site.id);
    showSiteDashboardSection(siteDashboardSection);
    elements.siteEditForm.hidden = true;
    elements.siteEditMessage.textContent = "";
    elements.siteDashboardEdit.hidden = false;
    elements.siteDashboard.hidden = false;
    showSiteDashboardSection(siteDashboardSection);
    elements.siteDashboard.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function siteDirectUrl(site) {
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    url.searchParams.set("site", site.qrCode || site.id);
    return url.toString();
  }

  function closeSiteQrDialog() {
    elements.siteQrImage.removeAttribute("src");
    if (elements.siteQrDialog.open) elements.siteQrDialog.close();
  }

  function openSiteQrDialog() {
    const site = adminState?.sites.find((candidate) => candidate.id === openedSiteId);
    if (!site) return;
    elements.siteQrName.textContent = [site.number, site.name].filter(Boolean).join(" · ");
    elements.siteQrLink.value = siteDirectUrl(site);
    elements.siteQrImage.src =
      `./api/v1/admin/construction-sites/${encodeURIComponent(site.id)}/qr?v=${site.rowVersion}`;
    elements.siteQrDialog.showModal();
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
    showDashboardPane("documents");
    elements.documentSearch.value = "";
    setDocumentTargets({ customerId: site.customerId, projectId: site.projectId, constructionSiteId: site.id });
    renderDocumentList();
    elements.documentManagementPanel.open = true;
    elements.documentForm.hidden = false;
    elements.documentNew.textContent = "Formular schließen";
    elements.documentManagementPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    elements.documentTitle.focus({ preventScroll: true });
  }

  function openReportForSite() {
    if (!openedSiteId) return;
    showSiteDashboardSection("reports");
    openSiteReportForm("digital");
    elements.siteReportForm.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function openTaskForSite() {
    if (!openedSiteId) return;
    showSiteDashboardSection("tasks");
    resetSiteTaskForm();
    elements.siteTaskForm.hidden = false;
    elements.siteTaskForm.scrollIntoView({ behavior: "smooth", block: "nearest" });
    elements.siteTaskTitle.focus({ preventScroll: true });
  }

  function openDocumentsForSite() {
    if (!openedSiteId) return;
    showSiteDashboardSection("documents", true);
  }

  function openSiteEditor() {
    const site = adminState?.sites.find((candidate) => candidate.id === openedSiteId);
    if (!site) return;
    elements.siteEditNumber.textContent = site.number;
    elements.siteEditProject.textContent = site.customerName;
    elements.siteEditName.value = site.name;
    elements.siteEditShortText.value = site.shortText || "";
    elements.siteEditProjectManager.value = site.projectManagerIds?.[0] || "";
    elements.siteEditProjectManager.disabled = Boolean(adminState.projectScopeRestricted);
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
    elements.siteActiveTab.classList.toggle(
      "page-tab--active",
      elements.hierarchyStatusFilter.value === "active"
    );
    elements.siteArchivedTab.classList.toggle(
      "page-tab--active",
      elements.hierarchyStatusFilter.value === "archived"
    );
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

    // Am Rechner ist das eine Tabelle mit Kopfzeile, am Handy bleibt es eine
    // gestapelte Liste. Beides entsteht aus denselben Zellen.
    const list = document.createElement("ul");
    list.className = "admin-list admin-list--table hierarchy-site-table";
    list.id = "hierarchy-site-table";
    appendAdminListHead(list, ["Baustelle", "Aufgabe", "Kunde", "Adresse", "Dokumente", "Status"]);
    sites.forEach((site) => {
      const item = document.createElement("li");
      const title = document.createElement("strong");
      const badge = document.createElement("span");
      const button = document.createElement("button");
      const address = [
        `${site.address.street || ""} ${site.address.houseNumber || ""}`.trim(),
        `${site.address.postalCode || ""} ${site.address.city || ""}`.trim()
      ].filter(Boolean).join(", ");
      const documents = documentsForEntity("construction_site", site.id).length;
      item.className = "admin-list__row";
      title.textContent = site.name;
      badge.className = `site-status site-status--${
        site.fieldReviewStatus === "pending" ? "pending" : siteStatusGroup(site.status)
      }`;
      badge.textContent = site.fieldReviewStatus === "pending"
        ? "Büroprüfung"
        : siteStatusLabel(site.status);
      button.type = "button";
      button.className = "text-button";
      button.textContent = "Öffnen";
      button.addEventListener("click", () => openSiteDashboard(site));
      item.append(
        title,
        adminListCells([
          site.shortText,
          site.customerName,
          address,
          `${documents} Dokument${documents === 1 ? "" : "e"}`,
          badge
        ]),
        button
      );
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

  function fieldPlanningEmployees() {
    return plannableEmployees(adminState?.employees);
  }

  function populatePlanningFilter(select, items, allLabel, label) {
    const selected = select.value || "all";
    select.replaceChildren();
    const all = document.createElement("option");
    all.value = "all";
    all.textContent = allLabel;
    select.append(all);
    items.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = label(item);
      select.append(option);
    });
    select.value = items.some((item) => item.id === selected) ? selected : "all";
  }

  function renderPlanningMemberPicker(container, selectedIds = new Set()) {
    container.replaceChildren();
    const employees = fieldPlanningEmployees();
    if (employees.length === 0) {
      const empty = document.createElement("p");
      empty.textContent = "Noch keine Mitarbeiter angelegt.";
      container.append(empty);
      return;
    }
    employees.forEach((employee) => {
      const label = document.createElement("label");
      const input = document.createElement("input");
      const name = document.createElement("span");
      input.type = "checkbox";
      input.value = employee.id;
      input.checked = selectedIds.has(employee.id);
      name.textContent = `${employee.firstName} ${employee.lastName}`;
      label.append(input, name);
      container.append(label);
    });
  }

  function selectedPlanningMemberIds(container) {
    return [...container.querySelectorAll('input[type="checkbox"]:checked')]
      .map((input) => input.value);
  }

  function resetPlanningTeamForm() {
    elements.planningTeamForm.reset();
    elements.planningTeamId.value = "";
    elements.planningTeamMessage.textContent = "";
    elements.planningTeamSubmit.textContent = "Teamvorlage speichern";
    renderPlanningMemberPicker(elements.planningTeamMemberList);
  }

  function editPlanningTeam(team) {
    elements.planningTeamId.value = team.id;
    elements.planningTeamName.value = team.name;
    elements.planningTeamReason.value = "";
    elements.planningTeamMessage.textContent = "";
    elements.planningTeamSubmit.textContent = "Teamvorlage aktualisieren";
    renderPlanningMemberPicker(
      elements.planningTeamMemberList,
      new Set(team.members.map((member) => member.userId))
    );
    elements.planningTeamPanel.open = true;
    elements.planningTeamName.focus({ preventScroll: true });
  }

  function renderPlanningTeamList() {
    elements.planningTeamList.replaceChildren();
    const teams = adminState?.planningTeams || [];
    if (teams.length === 0) {
      const empty = document.createElement("li");
      empty.className = "admin-list__empty";
      empty.textContent = "Noch keine Teamvorlage gespeichert.";
      elements.planningTeamList.append(empty);
      return;
    }
    teams.forEach((team) => {
      const item = document.createElement("li");
      const content = document.createElement("div");
      const title = document.createElement("strong");
      const meta = document.createElement("span");
      const actions = document.createElement("div");
      const edit = document.createElement("button");
      title.textContent = team.name;
      meta.textContent = [
        team.members.map((member) => member.employeeName).join(", "),
        team.status === "archived" ? "Archiviert" : "Aktiv"
      ].filter(Boolean).join(" · ");
      edit.type = "button";
      edit.className = "text-button";
      edit.textContent = "Bearbeiten";
      edit.addEventListener("click", () => editPlanningTeam(team));
      actions.append(edit);
      if (team.status === "active") {
        const archive = document.createElement("button");
        archive.type = "button";
        archive.className = "text-button text-button--danger";
        archive.textContent = "Archivieren";
        archive.addEventListener("click", async () => {
          const changeReason = window.prompt(
            "Warum wird diese Teamvorlage archiviert?",
            "Teamvorlage nicht mehr benötigt"
          )?.trim();
          if (!changeReason || changeReason.length < 3) return;
          try {
            await requestJson(
              `./api/v1/admin/planning-teams/${encodeURIComponent(team.id)}`,
              {
                method: "PATCH",
                body: JSON.stringify({
                  name: team.name,
                  memberIds: team.members.map((member) => member.userId),
                  status: "archived",
                  changeReason,
                  rowVersion: team.rowVersion
                })
              }
            );
            await refreshAdmin(adminState.date);
            showToast("Teamvorlage archiviert · bestehende Einsätze bleiben erhalten.");
          } catch (error) {
            showToast(error.message);
          }
        });
        actions.append(archive);
      }
      content.append(title, meta);
      item.append(content, actions);
      elements.planningTeamList.append(item);
    });
  }

  function renderPlanningControls() {
    const fieldEmployees = fieldPlanningEmployees();
    renderAdminSelect(
      elements.assignmentEmployee,
      fieldEmployees,
      "Mitarbeiter auswählen",
      (employee) => `${employee.firstName} ${employee.lastName} · ${employee.personnelNumber}`
    );
    renderAdminSelect(
      elements.assignmentEditEmployee,
      fieldEmployees,
      "Mitarbeiter auswählen",
      (employee) => `${employee.firstName} ${employee.lastName}`
    );
    const selectedAdditional = new Set(
      selectedPlanningMemberIds(elements.assignmentMemberList)
    );
    renderPlanningMemberPicker(elements.assignmentMemberList, selectedAdditional);
    const teams = (adminState?.planningTeams || []).filter((team) => team.status === "active");
    const selectedTeam = elements.assignmentTeam.value;
    elements.assignmentTeam.replaceChildren();
    const noTeam = document.createElement("option");
    noTeam.value = "";
    noTeam.textContent = "Keine Teamvorlage";
    elements.assignmentTeam.append(noTeam);
    teams.forEach((team) => {
      const option = document.createElement("option");
      option.value = team.id;
      option.textContent = `${team.name} · ${team.members.length} Mitglieder`;
      elements.assignmentTeam.append(option);
    });
    if (teams.some((team) => team.id === selectedTeam)) {
      elements.assignmentTeam.value = selectedTeam;
    }
    populatePlanningFilter(
      elements.planningBoardEmployee,
      fieldEmployees,
      "Alle Mitarbeiter",
      (employee) => `${employee.firstName} ${employee.lastName}`
    );
    populatePlanningFilter(
      elements.planningBoardTeam,
      teams,
      "Alle Teams",
      (team) => team.name
    );
    populatePlanningFilter(
      elements.planningBoardSite,
      adminState.sites.filter((site) => siteStatusGroup(site.status) === "active"),
      "Alle Baustellen",
      (site) => site.name
    );
    populatePlanningFilter(
      elements.planningBoardProjectManager,
      adminState.employees.filter((employee) => employee.roles.includes("project_manager")),
      "Alle Projektleiter",
      (employee) => `${employee.firstName} ${employee.lastName}`
    );
    renderPlanningMemberPicker(elements.planningTeamMemberList);
    renderPlanningTeamList();
    updateAssignmentResponsibilityControl();
  }

  function openAssignmentEditor(assignment, destination = {}) {
    editingAssignmentId = assignment.id;
    elements.assignmentEditTitle.textContent = `${assignment.employeeName} · ${assignment.siteName}`;
    elements.assignmentEditEmployee.value = destination.employeeId || assignment.employeeId;
    elements.assignmentEditDate.value = destination.workDate || assignment.workDate;
    elements.assignmentEditTime.value = assignment.plannedStartTime?.slice(0, 5) || "";
    elements.assignmentEditDuration.value = assignment.plannedDurationMinutes
      ? String(assignment.plannedDurationMinutes / 60)
      : "";
    elements.assignmentEditComment.value = assignment.comment || "";
    elements.assignmentEditReportResponsible.checked = Boolean(assignment.reportResponsible);
    updateAssignmentEditResponsibilityControl();
    elements.assignmentEditReason.value = "";
    elements.assignmentEditMessage.textContent = "";
    if (destination.employeeId || destination.workDate) {
      elements.assignmentEditMessage.textContent =
        "Ziel aus der Plantafel übernommen. Bitte Änderung prüfen und begründen.";
    }
    elements.assignmentEditForm.hidden = false;
    elements.assignmentEditForm.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function planningAssignments() {
    return adminState?.planningAssignments || adminState?.weekAssignments || [];
  }

  function planningMonthBounds(date) {
    const value = dateFromIso(date);
    const start = new Date(value.getFullYear(), value.getMonth(), 1);
    const end = new Date(value.getFullYear(), value.getMonth() + 1, 0);
    return {
      start: localDateKey(start),
      end: localDateKey(end)
    };
  }

  function assignmentConflictMessages(assignment, assignments = planningAssignments()) {
    const messages = [];
    const absence = (adminState?.absences || []).find((item) => (
      item.status === "approved"
      && item.employeeId === assignment.employeeId
      && item.startDate <= assignment.workDate
      && item.endDate >= assignment.workDate
    ));
    if (absence) messages.push(`${absenceTypeLabel(absence.absenceType)} eingetragen`);
    const start = assignmentStartMinutes(assignment.plannedStartTime);
    const end = start === null || !assignment.plannedDurationMinutes
      ? null
      : start + assignment.plannedDurationMinutes;
    if (start !== null && end !== null && assignments.some((candidate) => {
      if (
        candidate.id === assignment.id
        || candidate.employeeId !== assignment.employeeId
        || candidate.workDate !== assignment.workDate
      ) return false;
      const candidateStart = assignmentStartMinutes(candidate.plannedStartTime);
      const candidateEnd = candidateStart === null || !candidate.plannedDurationMinutes
        ? null
        : candidateStart + candidate.plannedDurationMinutes;
      return candidateStart !== null && candidateEnd !== null
        && candidateStart < end && candidateEnd > start;
    })) {
      messages.push("Zeitüberschneidung");
    }
    const siteAssignments = assignments.filter((candidate) => (
      candidate.constructionSiteId === assignment.constructionSiteId
      && candidate.workDate === assignment.workDate
    ));
    if (
      siteAssignments.length > 1
      && !siteAssignments.some((candidate) => candidate.reportResponsible)
    ) {
      messages.push("Vorarbeiter fehlt");
    }
    return messages;
  }

  function planningFilters() {
    const team = (adminState?.planningTeams || []).find(
      (item) => item.id === elements.planningBoardTeam.value
    );
    return {
      employeeId: elements.planningBoardEmployee.value,
      teamMemberIds: team
        ? new Set(team.members.map((member) => member.userId))
        : null,
      siteId: elements.planningBoardSite.value,
      projectManagerId: elements.planningBoardProjectManager.value,
      status: elements.planningBoardStatus.value
    };
  }

  function assignmentMatchesPlanningFilters(assignment, filters) {
    if (filters.employeeId !== "all" && assignment.employeeId !== filters.employeeId) return false;
    if (filters.teamMemberIds && !filters.teamMemberIds.has(assignment.employeeId)) return false;
    if (filters.siteId !== "all" && assignment.constructionSiteId !== filters.siteId) return false;
    if (filters.projectManagerId !== "all") {
      const site = adminState.sites.find(
        (candidate) => candidate.id === assignment.constructionSiteId
      );
      if (!site?.projectManagerIds?.includes(filters.projectManagerId)) return false;
    }
    if (
      filters.status === "conflict"
      && assignmentConflictMessages(assignment).length === 0
    ) return false;
    if (filters.status === "unassigned") return false;
    return true;
  }

  function copyAssignmentToForm(assignment) {
    elements.assignmentEmployee.value = assignment.employeeId;
    elements.assignmentTeam.value = "";
    renderPlanningMemberPicker(elements.assignmentMemberList);
    elements.assignmentSite.value = assignment.constructionSiteId;
    elements.assignmentDate.value = assignment.workDate;
    elements.assignmentTime.value = assignment.plannedStartTime?.slice(0, 5) || "";
    elements.assignmentDuration.value = assignment.plannedDurationMinutes
      ? String(assignment.plannedDurationMinutes / 60)
      : "";
    elements.assignmentComment.value = assignment.comment || "";
    updateAssignmentResponsibilityControl();
    elements.assignmentReportResponsible.checked = Boolean(
      assignment.reportResponsible
      && !elements.assignmentReportResponsible.disabled
    );
    elements.assignmentMessage.textContent =
      "Einsatzdaten kopiert. Datum und weitere Mitarbeiter können jetzt angepasst werden.";
    elements.assignmentPanel.open = true;
    elements.assignmentForm.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function createPlanningAssignmentCard(assignment, compact = false) {
    const card = document.createElement("article");
    const content = document.createElement("div");
    const title = document.createElement("strong");
    const meta = document.createElement("span");
    const instruction = document.createElement("span");
    const actions = document.createElement("div");
    const edit = document.createElement("button");
    const copy = document.createElement("button");
    const duty = document.createElement("span");
    const conflicts = assignmentConflictMessages(assignment);
    const startTime = assignment.plannedStartTime
      ? `${assignment.plannedStartTime.slice(0, 5)} Uhr`
      : "ohne Startzeit";
    card.className = `week-assignment${conflicts.length ? " week-assignment--conflict" : ""}`;
    card.draggable = true;
    card.dataset.assignmentId = assignment.id;
    title.textContent = compact
      ? `${assignment.employeeName} · ${assignment.siteName}`
      : assignment.siteName;
    meta.textContent = [
      startTime,
      assignmentDurationLabel(assignment.plannedDurationMinutes),
      compact ? null : assignment.employeeName
    ].filter(Boolean).join(" · ");
    instruction.className = "week-assignment__instruction";
    instruction.textContent = assignment.comment || "";
    instruction.hidden = compact || !assignment.comment;
    duty.className = "foreman-duty";
    duty.textContent = assignment.reportResponsibilitySource === "automatic"
      ? "Automatisch Vorarbeiter"
      : "Vorarbeiter · Bericht";
    duty.hidden = !assignment.reportResponsible;
    if (conflicts.length) {
      const warning = document.createElement("span");
      warning.className = "planning-conflict";
      warning.textContent = conflicts.join(" · ");
      content.append(warning);
    }
    edit.type = "button";
    edit.textContent = "Ändern";
    edit.addEventListener("click", () => openAssignmentEditor(assignment));
    copy.type = "button";
    copy.textContent = "Kopieren";
    copy.addEventListener("click", () => copyAssignmentToForm(assignment));
    actions.className = "week-assignment__actions";
    actions.append(edit, copy);
    content.prepend(title, meta, instruction, duty);
    card.append(content, actions);
    card.addEventListener("dragstart", (event) => {
      draggedAssignmentId = assignment.id;
      card.classList.add("week-assignment--dragging");
      event.dataTransfer?.setData("text/plain", assignment.id);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    });
    card.addEventListener("dragend", () => {
      draggedAssignmentId = null;
      card.classList.remove("week-assignment--dragging");
      document.querySelectorAll(".planning-board-cell--drop-target").forEach(
        (cell) => cell.classList.remove("planning-board-cell--drop-target")
      );
    });
    return card;
  }

  function makePlanningDropTarget(cell, employeeId, workDate) {
    cell.addEventListener("dragover", (event) => {
      if (!draggedAssignmentId) return;
      event.preventDefault();
      cell.classList.add("planning-board-cell--drop-target");
    });
    cell.addEventListener("dragleave", () => {
      cell.classList.remove("planning-board-cell--drop-target");
    });
    cell.addEventListener("drop", (event) => {
      event.preventDefault();
      cell.classList.remove("planning-board-cell--drop-target");
      const assignmentId = event.dataTransfer?.getData("text/plain")
        || draggedAssignmentId;
      const assignment = planningAssignments().find(
        (candidate) => candidate.id === assignmentId
      );
      if (!assignment) return;
      openAssignmentEditor(assignment, { employeeId, workDate });
    });
  }

  // Eine Tagesspalte rastet nur ein, wenn sie neben die klebende
  // Mitarbeiterspalte passt. Ist sie breiter als der Platz daneben, laesst der
  // Browser das Einrasten fallen - auf dem Handy blieb deshalb fast immer eine
  // Spalte halb unter der Mitarbeiterspalte stehen und die Karte darunter war
  // zur Haelfte verdeckt. Auf schmalen Geraeten ist eine Tagesspalte deshalb
  // genau so breit wie der verbleibende Platz.
  function applyPlanningBoardWidths() {
    const brett = elements.adminWeekBoard;
    const platz = brett.clientWidth;
    if (!platz) return;
    const schmal = platz < 620;
    const mitarbeiter = schmal ? 110 : 170;
    brett.style.setProperty("--plan-employee", `${mitarbeiter}px`);
    brett.style.setProperty(
      "--plan-day",
      `${schmal ? Math.max(150, platz - mitarbeiter) : 180}px`
    );
  }

  function renderAdminWeek() {
    const view = elements.planningBoardView.value;
    elements.planningWeekTab.classList.toggle("page-tab--active", view === "week");
    elements.planningMonthTab.classList.toggle("page-tab--active", view === "month");
    const filters = planningFilters();
    const allAssignments = planningAssignments();
    elements.adminWeekBoard.replaceChildren();
    elements.adminWeekBoard.className = view === "month"
      ? "admin-week-board planning-month-board"
      : "admin-week-board planning-week-board";

    if (view === "month") {
      const bounds = planningMonthBounds(adminState.date);
      const monthDate = dateFromIso(bounds.start);
      elements.adminWeekTitle.textContent = monthDate.toLocaleDateString("de-DE", {
        month: "long",
        year: "numeric"
      });
      let visibleCount = 0;
      for (let workDate = bounds.start; workDate <= bounds.end; workDate = addIsoDays(workDate, 1)) {
        const day = document.createElement("section");
        const heading = document.createElement("strong");
        const items = document.createElement("div");
        const date = dateFromIso(workDate);
        const assignments = allAssignments.filter((assignment) => (
          assignment.workDate === workDate
          && assignmentMatchesPlanningFilters(assignment, filters)
        ));
        day.className = `planning-month-day${
          [0, 6].includes(date.getDay()) ? " planning-month-day--weekend" : ""
        }`;
        heading.textContent = date.toLocaleDateString("de-DE", {
          weekday: "short",
          day: "2-digit"
        }).replace(".", "");
        items.className = "planning-month-day__items";
        assignments.forEach((assignment) => {
          items.append(createPlanningAssignmentCard(assignment, true));
          visibleCount += 1;
        });
        if (assignments.length === 0) {
          const empty = document.createElement("span");
          empty.className = "admin-week-empty";
          empty.textContent = "frei";
          items.append(empty);
        }
        day.append(heading, items);
        elements.adminWeekBoard.append(day);
      }
      elements.planningBoardSummary.textContent =
        `${visibleCount} sichtbare Einsätze im Monat · zum Ändern Karte öffnen`;
      return;
    }

    const weekStart = adminState.weekStart;
    const weekEnd = addIsoDays(weekStart, 4);
    const start = dateFromIso(weekStart);
    const end = dateFromIso(weekEnd);
    elements.adminWeekTitle.textContent = `${
      start.toLocaleDateString("de-DE", { day: "numeric", month: "short" })
    } – ${
      end.toLocaleDateString("de-DE", { day: "numeric", month: "short", year: "numeric" })
    }`;

    const dates = Array.from({ length: 5 }, (_, index) => addIsoDays(weekStart, index));
    const header = document.createElement("div");
    header.className = "planning-board-row planning-board-row--header";
    const employeeHeading = document.createElement("strong");
    employeeHeading.textContent = "Mitarbeiter";
    header.append(employeeHeading);
    dates.forEach((workDate) => {
      const date = dateFromIso(workDate);
      const label = document.createElement("strong");
      label.textContent = date.toLocaleDateString("de-DE", {
        weekday: "short",
        day: "2-digit",
        month: "2-digit"
      }).replace(".", "");
      header.append(label);
    });
    elements.adminWeekBoard.append(header);

    let visibleAssignments = 0;
    let unassignedEmployees = 0;
    const availabilityFilters = filters.status === "unassigned"
      ? { ...filters, status: "all" }
      : filters;
    const employees = fieldPlanningEmployees().filter((employee) => {
      if (filters.employeeId !== "all" && employee.id !== filters.employeeId) return false;
      if (filters.teamMemberIds && !filters.teamMemberIds.has(employee.id)) return false;
      const employeeAssignments = allAssignments.filter((assignment) => (
        assignment.employeeId === employee.id
        && assignment.workDate >= weekStart
        && assignment.workDate <= weekEnd
        && assignmentMatchesPlanningFilters(assignment, availabilityFilters)
      ));
      if (filters.status === "unassigned") return employeeAssignments.length === 0;
      if (filters.status === "conflict") return employeeAssignments.length > 0;
      if (
        (filters.siteId !== "all" || filters.projectManagerId !== "all")
        && employeeAssignments.length === 0
      ) return false;
      return true;
    });

    employees.forEach((employee) => {
      const row = document.createElement("section");
      const identity = document.createElement("div");
      const name = document.createElement("strong");
      const role = document.createElement("span");
      row.className = "planning-board-row";
      identity.className = "planning-board-employee";
      name.textContent = `${employee.firstName} ${employee.lastName}`;
      role.textContent = employeeRoleLabel(employee.roles);
      identity.append(name, role);
      row.append(identity);
      let employeeCount = 0;
      dates.forEach((workDate) => {
        const cell = document.createElement("div");
        const assignments = allAssignments.filter((assignment) => (
          assignment.employeeId === employee.id
          && assignment.workDate === workDate
          && assignmentMatchesPlanningFilters(assignment, filters)
        ));
        const absences = (adminState.absences || []).filter((absence) => (
          absence.status === "approved"
          && absence.employeeId === employee.id
          && absence.startDate <= workDate
          && absence.endDate >= workDate
        ));
        cell.className = "planning-board-cell";
        cell.dataset.employeeId = employee.id;
        cell.dataset.workDate = workDate;
        cell.setAttribute(
          "aria-label",
          `${employee.firstName} ${employee.lastName}, ${shortDate(workDate)}`
        );
        absences.forEach((absence) => {
          const absenceCard = document.createElement("div");
          absenceCard.className = `week-absence${
            assignments.length ? " week-absence--conflict" : ""
          }`;
          absenceCard.textContent = `${absenceTypeLabel(absence.absenceType)} · ${
            absenceDayPartLabel(absence.dayPart)
          }`;
          cell.append(absenceCard);
        });
        // Alle Zellen einer Zeile liegen in derselben Rasterzeile: die hoechste
        // bestimmt die Hoehe aller. Ein Mitarbeiter mit vier Einsaetzen an
        // einem Tag machte seine Zeile ueber 500 Pixel hoch, und in den
        // uebrigen Tagesspalten stand ebenso viel Leere - auf dem Handy sieht
        // man ohnehin nur eine Spalte auf einmal. Deshalb zeigt eine Zelle
        // hoechstens zwei Karten und den Rest auf Wunsch.
        const zellenSchluessel = `${employee.id}|${workDate}`;
        const aufgeklappt = expandedPlanningCells.has(zellenSchluessel);
        const sichtbare = aufgeklappt
          ? assignments
          : assignments.slice(0, PLANNING_CARDS_PER_CELL);
        sichtbare.forEach((assignment) => {
          cell.append(createPlanningAssignmentCard(assignment));
        });
        employeeCount += assignments.length;
        visibleAssignments += assignments.length;
        if (assignments.length > sichtbare.length) {
          const mehr = document.createElement("button");
          mehr.type = "button";
          mehr.className = "planning-board-more";
          mehr.textContent = `+${assignments.length - sichtbare.length} weitere`;
          mehr.addEventListener("click", () => {
            expandedPlanningCells.add(zellenSchluessel);
            renderAdminWeek();
          });
          cell.append(mehr);
        } else if (aufgeklappt && assignments.length > PLANNING_CARDS_PER_CELL) {
          const weniger = document.createElement("button");
          weniger.type = "button";
          weniger.className = "planning-board-more";
          weniger.textContent = "Weniger zeigen";
          weniger.addEventListener("click", () => {
            expandedPlanningCells.delete(zellenSchluessel);
            renderAdminWeek();
          });
          cell.append(weniger);
        }
        if (assignments.length === 0 && absences.length === 0) {
          const empty = document.createElement("span");
          empty.className = "admin-week-empty";
          empty.textContent = "frei";
          cell.append(empty);
        }
        makePlanningDropTarget(cell, employee.id, workDate);
        row.append(cell);
      });
      if (employeeCount === 0) {
        row.classList.add("planning-board-row--unassigned");
        unassignedEmployees += 1;
      }
      elements.adminWeekBoard.append(row);
    });
    applyPlanningBoardWidths();
    elements.planningBoardSummary.textContent =
      `${visibleAssignments} sichtbare Einsätze · ${unassignedEmployees} nicht eingeplante Mitarbeiter · Karten lassen sich per Drag-and-drop verschieben`;
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
        const actions = document.createElement("div");
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
        actions.className = "work-day-review-actions";
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

        const entriesAction = document.createElement("button");
        entriesAction.type = "button";
        entriesAction.className = "text-button work-day-review-action";
        entriesAction.textContent = "Buchungen";
        entriesAction.addEventListener("click", async () => {
          const existing = dayRow.querySelector(".work-day-review-entries");
          if (existing) {
            existing.hidden = !existing.hidden;
            entriesAction.textContent = existing.hidden ? "Buchungen" : "Schließen";
            return;
          }
          entriesAction.disabled = true;
          try {
            const body = await requestJson(
              `./api/v1/admin/work-days/${encodeURIComponent(day.id)}`
            );
            const details = document.createElement("div");
            details.className = "work-day-review-entries";
            body.workDay.entries.forEach((entry) => {
              const row = document.createElement("button");
              const copy = document.createElement("span");
              const label = document.createElement("strong");
              const meta = document.createElement("small");
              row.type = "button";
              row.className = "work-day-review-entry";
              label.textContent = timeEntryTypeLabel(entry.entryType);
              meta.textContent = `${timeFormatter.format(new Date(entry.recordedAt))}${
                entry.constructionSiteName ? ` · ${entry.constructionSiteName}` : ""
              }`;
              copy.append(label, meta);
              const action = document.createElement("span");
              action.textContent = entry.pendingCorrection ? "Prüfung offen" : "Ändern";
              row.append(copy, action);
              row.disabled = Boolean(entry.pendingCorrection);
              if (!row.disabled) row.addEventListener("click", () => openTimeCorrectionForm({
                id: entry.id,
                type: entry.entryType,
                recordedAt: entry.recordedAt,
                workDate: body.workDay.workDate,
                constructionSiteId: entry.constructionSiteId,
                activityNote: entry.activityNote,
                travelMinutes: entry.travelMinutes,
                breakMinutes: body.workDay.breakMinutesOverride ?? body.workDay.breakMinutes,
                breakMinutesOverride: body.workDay.breakMinutesOverride,
                pendingCorrection: entry.pendingCorrection,
                pendingSync: false,
                syncError: null
              }, true));
              details.append(row);
            });
            if (!body.workDay.entries.length) {
              const empty = document.createElement("p");
              empty.textContent = "Keine Buchungen vorhanden.";
              details.append(empty);
            }
            dayRow.append(details);
            entriesAction.textContent = "Schließen";
          } catch (error) {
            showToast(error.message);
          } finally {
            entriesAction.disabled = false;
          }
        });
        actions.append(entriesAction);

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
          actions.append(action);
        }
        dayRow.append(actions);
        dayList.append(dayRow);
      });

      group.append(heading, dayList);
      elements.workDayReviewList.append(group);
    });
  }

  function renderTimeCorrections() {
    const seenOperations = new Set();
    const corrections = (adminState?.timeCorrections || []).filter((correction) => {
      if (!correction.operationId) return true;
      if (seenOperations.has(correction.operationId)) return false;
      seenOperations.add(correction.operationId);
      return true;
    });
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
      const operationLabel = correction.operationAction === "delete_entry"
        ? "Vollständige Löschung"
        : correction.operationId ? "Zusammenhängende Zeitänderung" : kindLabel;
      title.textContent = `${correction.employeeName} · ${operationLabel} · ${
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
            correction.operationId
              ? `./api/v1/admin/time-change-operations/${encodeURIComponent(correction.operationId)}`
              : `./api/v1/admin/time-entry-corrections/${encodeURIComponent(correction.id)}`,
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

  function renderAbsenceReviews() {
    const absences = adminState?.absences || [];
    const pending = absences.filter((absence) => (
      ["office_review", "management_review"].includes(absence.status)
    ));
    const approved = absences.filter((absence) => absence.status === "approved");
    const visible = [...pending, ...approved];
    elements.absenceReviewPanel.hidden = !canPlan() || !moduleEnabled("absences");
    elements.absenceReviewCount.textContent = String(pending.length);
    elements.absenceReviewList.replaceChildren();

    if (visible.length === 0) {
      const empty = document.createElement("li");
      empty.className = "absence-list__empty";
      empty.textContent = "Keine Abwesenheit wartet auf Prüfung.";
      elements.absenceReviewList.append(empty);
      return;
    }

    visible.forEach((absence) => {
      const item = document.createElement("li");
      const heading = document.createElement("div");
      const copy = document.createElement("div");
      const title = document.createElement("strong");
      const status = document.createElement("span");
      const period = document.createElement("span");
      const detail = document.createElement("small");
      item.className = `absence-review-item absence-review-item--${absence.status}`;
      heading.className = "absence-review-item__heading";
      title.textContent = `${absence.employeeName} · ${absenceTypeLabel(absence.absenceType)}`;
      status.className = `absence-status absence-status--${absence.status}`;
      status.textContent = absenceStatusLabel(absence.status);
      period.textContent = absencePeriodLabel(absence);
      const details = [];
      if (absence.note) details.push(absence.note);
      if (absence.officeReviewedByName) {
        details.push(`Büro: ${absence.officeReviewedByName}`);
      }
      if (absence.managementReviewedByName) {
        details.push(`Freigabe: ${absence.managementReviewedByName}`);
      }
      if (absence.assignmentConflictCount > 0) {
        details.push(`${absence.assignmentConflictCount} Einsatz${
          absence.assignmentConflictCount === 1 ? "" : "e"
        } im Zeitraum`);
      }
      detail.textContent = details.join(" · ");
      copy.append(title, period, detail);
      heading.append(copy, status);
      item.append(heading);

      const canOfficeReview = absence.status === "office_review"
        && adminState.canReviewAbsenceOffice;
      const canManagementReview = absence.status === "management_review"
        && adminState.canApproveAbsenceManagement;
      const canCancelApproval = absence.status === "approved"
        && adminState.canApproveAbsenceManagement;
      if (canOfficeReview || canManagementReview || canCancelApproval) {
        const controls = document.createElement("div");
        const comment = document.createElement("input");
        const actions = document.createElement("div");
        controls.className = "absence-review-controls";
        comment.type = "text";
        comment.maxLength = 500;
        comment.placeholder = canCancelApproval
          ? "Begründung zum Aufheben der Freigabe"
          : "Kommentar (bei Ablehnung erforderlich)";
        actions.className = "absence-review-actions";

        const submitDecision = async (action) => {
          const commentValue = comment.value.trim();
          if (["reject", "cancel"].includes(action) && commentValue.length < 3) {
            showToast("Bitte eine kurze Begründung eingeben.");
            comment.focus();
            return;
          }
          if (
            action === "approve"
            && canManagementReview
            && !window.confirm("Abwesenheit verbindlich freigeben und in der Planung sperren?")
          ) return;
          if (
            action === "cancel"
            && !window.confirm("Verbindliche Freigabe wirklich aufheben?")
          ) return;
          actions.querySelectorAll("button").forEach((button) => { button.disabled = true; });
          try {
            await requestJson(
              `./api/v1/admin/absence-requests/${encodeURIComponent(absence.id)}`,
              {
                method: "PATCH",
                body: JSON.stringify({
                  action,
                  comment: commentValue,
                  rowVersion: absence.rowVersion
                })
              }
            );
            showToast(action === "approve"
              ? (canOfficeReview
                ? "Büroprüfung abgeschlossen · Geschäftsführung ist als Nächstes dran."
                : "Abwesenheit verbindlich freigegeben.")
              : action === "reject"
                ? "Abwesenheitsantrag abgelehnt · Begründung ist gespeichert."
                : "Freigabe aufgehoben · Historie bleibt erhalten.");
            await Promise.all([
              refreshAdmin(adminState.date),
              refreshAbsenceData(),
              refreshTimeAccountData(),
              refreshAdminTimeAccounts()
            ]);
          } catch (error) {
            showToast(error.message);
            actions.querySelectorAll("button").forEach((button) => { button.disabled = false; });
          }
        };

        if (canCancelApproval) {
          const cancel = document.createElement("button");
          cancel.type = "button";
          cancel.className = "text-button text-button--muted";
          cancel.textContent = "Freigabe aufheben";
          cancel.addEventListener("click", () => void submitDecision("cancel"));
          actions.append(cancel);
        } else {
          const approve = document.createElement("button");
          const reject = document.createElement("button");
          approve.type = "button";
          approve.className = "text-button";
          approve.textContent = canOfficeReview ? "Bürofreigabe" : "Verbindlich freigeben";
          reject.type = "button";
          reject.className = "text-button text-button--muted";
          reject.textContent = "Ablehnen";
          approve.addEventListener("click", () => void submitDecision("approve"));
          reject.addEventListener("click", () => void submitDecision("reject"));
          actions.append(approve, reject);
        }
        controls.append(comment, actions);
        item.append(controls);
      }
      elements.absenceReviewList.append(item);
    });
  }

  // Die Mitarbeiterliste zeigt die Angaben, nach denen das Büro tatsächlich
  // sucht. Personalnummer und Arbeitskonto bleiben in der rechten Detailakte;
  // E-Mail und Telefon müssen dagegen schon beim Überfliegen erreichbar sein.
  function renderEmployeeList() {
    if (!adminState) return;
    const projectScoped = Boolean(adminState.projectScopeRestricted);
    const search = elements.employeeSearchField.value.trim().toLocaleLowerCase("de-DE");
    const roleFilter = elements.employeeRoleFilter.value;
    const activeEmployees = adminState.employees.filter((employee) => {
      const matchesRole = roleFilter === "all" || employee.roles.includes(roleFilter);
      const searchText = [
        employee.firstName,
        employee.lastName,
        employee.personnelNumber,
        employee.email,
        employee.phone
      ].filter(Boolean).join(" ").toLocaleLowerCase("de-DE");
      return matchesRole && (!search || searchText.includes(search));
    });
    elements.employeeList.replaceChildren();
    if (activeEmployees.length > 0) {
      appendAdminListHead(
        elements.employeeList,
        ["Name", "E-Mail", "Rolle", "Telefon", "Status"]
      );
    }
    elements.archivedEmployeeList.replaceChildren();
    const archivedEmployees = adminState.archivedEmployees || [];
    elements.archivedEmployeeCount.textContent = String(archivedEmployees.length);
    elements.archivedEmployeePanel.hidden = projectScoped
      || !elements.employeeArchivedTab.classList.contains("page-tab--active");
    activeEmployees.forEach((employee) => {
      const roleLabels = {
        admin: "Administrator",
        managing_director: "Geschäftsführer",
        dispatch_office: "Büro / Disposition",
        office: "Planung (Bestand)",
        planner: "Planer (Bestand)",
        project_manager: "Projektleiter",
        executive_assistant: "Assistenz der Geschäftsführung (Bestand)",
        foreman: "Vorarbeiter",
        installer: "Monteur",
        apprentice: "Auszubildender",
        warehouse_manager: "Lagerist"
      };
      const marke = document.createElement("span");
      marke.className = "site-status site-status--active";
      marke.textContent = "Aktiv";
      const zeile = document.createElement("li");
      const name = document.createElement("strong");
      zeile.className = "admin-list__row";
      // Das Kuerzel vor dem Namen, wie im Entwurf. Ein echtes Bild gibt es
      // nicht; ein erfundener Kopf waere schlimmer als zwei Buchstaben.
      const zeichen = document.createElement("span");
      zeichen.className = "employee-avatar";
      zeichen.setAttribute("aria-hidden", "true");
      zeichen.textContent = initialen(`${employee.firstName} ${employee.lastName}`);
      name.className = "employee-name";
      name.append(zeichen, document.createTextNode(`${employee.firstName} ${employee.lastName}`));
      zeile.append(
        name,
        adminListCells([
          employee.email,
          employee.roles.map((role) => roleLabels[role] || role).join(", "),
          employee.phone,
          marke
        ])
      );
      if (!employee.roles.includes("admin") && !projectScoped) {
        const knopf = document.createElement("button");
        knopf.type = "button";
        knopf.className = "text-button";
        knopf.textContent = "Bearbeiten";
        knopf.addEventListener("click", (ereignis) => {
          ereignis.stopPropagation();
          openEmployeeEditor(employee);
        });
        zeile.append(knopf);
      }
      zeile.addEventListener("click", () => selectEmployee(employee));
      elements.employeeList.append(zeile);
    });
    if (activeEmployees.length === 0) {
      const empty = document.createElement("li");
      empty.className = "admin-list__empty";
      empty.textContent = adminState.employees.length === 0
        ? "Noch keine aktiven Mitarbeiter angelegt."
        : "Kein Mitarbeiter passt zu Suche und Rollenfilter.";
      elements.employeeList.append(empty);
    }
    renderEmployeeDetail();
    archivedEmployees.forEach((employee) => {
      const item = document.createElement("li");
      const copy = document.createElement("div");
      const title = document.createElement("strong");
      const meta = document.createElement("span");
      const reactivate = document.createElement("button");
      title.textContent = `${employee.firstName} ${employee.lastName}`;
      meta.textContent = [
        employee.personnelNumber,
        employee.archivedAt ? `archiviert ${shortDate(localDateKey(new Date(employee.archivedAt)))}` : null,
        employee.archivedReason
      ].filter(Boolean).join(" · ");
      reactivate.type = "button";
      reactivate.className = "text-button";
      reactivate.textContent = "Reaktivieren";
      reactivate.hidden = !adminState.canCreateManagementRoles;
      reactivate.addEventListener("click", async () => {
        const reason = window.prompt("Warum wird dieser Mitarbeiter reaktiviert?");
        if (!reason || reason.trim().length < 3) return;
        if (!window.confirm(`${employee.firstName} ${employee.lastName} wieder für Anmeldung und Planung freigeben?`)) return;
        reactivate.disabled = true;
        try {
          await requestJson(
            `./api/v1/admin/employees/${encodeURIComponent(employee.id)}/reactivate`,
            {
              method: "POST",
              body: JSON.stringify({ reason, rowVersion: employee.rowVersion })
            }
          );
          showToast("Mitarbeiter reaktiviert · Anmeldung und Planung sind wieder möglich.");
          await Promise.all([refreshAdmin(), refreshAdminTimeAccounts()]);
        } catch (error) {
          showToast(error.message);
          reactivate.disabled = false;
        }
      });
      copy.append(title, meta);
      item.append(copy, reactivate);
      elements.archivedEmployeeList.append(item);
    });
    if (archivedEmployees.length === 0) {
      const empty = document.createElement("li");
      empty.className = "admin-list__empty";
      empty.textContent = "Keine archivierten Mitarbeiter.";
      elements.archivedEmployeeList.append(empty);
    }
  }

  function showArchivedEmployeeView(archived) {
    const projectScoped = Boolean(adminState?.projectScopeRestricted);
    elements.employeeActiveTab.classList.toggle("page-tab--active", !archived);
    elements.employeeArchivedTab.classList.toggle("page-tab--active", archived);
    elements.employeeActiveContent.hidden = archived;
    elements.employeeToolbar.hidden = archived;
    if (archived) {
      elements.employeeForm.hidden = true;
      elements.employeeNew.textContent = "＋ Neuer Mitarbeiter";
    }
    elements.archivedEmployeePanel.hidden = projectScoped || !archived;
    elements.archivedEmployeePanel.open = archived && !projectScoped;
  }

  // Der Saldo steht im Jahreskonto - dieselbe Zahl, die die Bueroverwaltung
  // unter "Jahreskonten" auffuehrt. Sie hier noch einmal auszurechnen waere
  // die sicherste Art, zwei verschiedene Zahlen zu bekommen.
  function employeeBalanceText(employeeId) {
    const konto = (timeAccountsState?.accounts || []).find(
      (eintrag) => eintrag.employeeId === employeeId
    );
    if (!konto) return null;
    return konto.enabled ? formatSignedMinutes(konto.totals.balanceMinutes) : "Deaktiviert";
  }

  function selectEmployee(employee) {
    selectedEmployeeId = employee.id;
    renderEmployeeDetail();
  }

  // Die Spalte rechts neben der Liste, wie im Entwurf: wer ist das, wie
  // erreicht man ihn, wie steht sein Konto.
  function renderEmployeeDetail() {
    const employee = (adminState?.employees || []).find(
      (eintrag) => eintrag.id === selectedEmployeeId
    );
    elements.employeeDetail.hidden = !employee;
    if (!employee) return;
    elements.employeeDetailName.textContent = `${employee.firstName} ${employee.lastName}`;
    elements.employeeDetailRole.textContent = employeeRoleLabel(employee.roles);
    elements.employeeDetailNumber.textContent = employee.personnelNumber;
    elements.employeeDetailMail.textContent = employee.email || "–";
    elements.employeeDetailPhone.textContent = employee.phone || "–";
    elements.employeeDetailBalance.textContent = employeeBalanceText(employee.id) || "–";
    elements.employeeDetailLicences.textContent = (employee.drivingLicenceClasses || []).length
      ? employee.drivingLicenceClasses.join(", ")
      : "kein Führerschein hinterlegt";
    elements.employeeDetailEdit.hidden = employee.roles.includes("admin")
      || Boolean(adminState?.projectScopeRestricted);
    elements.employeeDetailEdit.onclick = () => openEmployeeEditor(employee);
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
    const projectScoped = Boolean(adminState?.projectScopeRestricted);
    const createsCustomer = !projectScoped && elements.siteCustomer.value === "__new__";
    elements.siteNewCustomer.hidden = !createsCustomer;
    elements.siteCustomerName.required = createsCustomer;
    if (!createsCustomer) elements.siteCustomerName.value = "";
    elements.siteProjectField.hidden = !projectScoped;
    elements.siteProject.required = projectScoped;
    if (projectScoped) {
      renderAdminSelect(
        elements.siteProject,
        adminState.projects.filter((project) => (
          projectStatusGroup(project.status) === "active"
          && project.customerId === elements.siteCustomer.value
        )),
        "Projekt auswählen",
        (project) => `${project.name} · ${project.number}`
      );
      syncSiteProjectManager();
    } else {
      elements.siteProject.value = "";
    }
  }

  function syncSiteProjectManager() {
    if (!adminState?.projectScopeRestricted) return;
    const project = adminState.projects.find((candidate) => (
      candidate.id === elements.siteProject.value
    ));
    elements.siteProjectManager.value = project?.projectManagerId || "";
  }

  function closeEmployeeEditor() {
    editingEmployeeId = null;
    elements.employeeEditForm.hidden = true;
    elements.employeeEditForm.reset();
    elements.employeeEditMessage.textContent = "";
  }

  // Der Ausbilder wird nur bei einem Auszubildenden abgefragt.
  function applyApprenticeFieldVisibility() {
    elements.employeeEditApprenticeship.hidden =
      !moduleEnabled("apprentice_reports")
      || elements.employeeEditRole.value !== "apprentice";
  }

  // Die Klassen des deutschen Fuehrerscheins. Dieselbe Liste steht in der
  // Schnittstelle und als Pruefung am Bestand: hier ist sie das, was man
  // ankreuzen kann.
  const FUEHRERSCHEINKLASSEN = [
    ["AM", "Kleinkraftrad"],
    ["A1", "Leichtkraftrad"],
    ["A2", "Motorrad bis 35 kW"],
    ["A", "Motorrad"],
    ["B", "Pkw bis 3,5 t"],
    ["B96", "Pkw mit Anhänger bis 4,25 t"],
    ["BE", "Pkw mit Anhänger"],
    ["C1", "Lkw bis 7,5 t"],
    ["C1E", "Lkw bis 7,5 t mit Anhänger"],
    ["C", "Lkw"],
    ["CE", "Lkw mit Anhänger"],
    ["D1", "Kleinbus"],
    ["D1E", "Kleinbus mit Anhänger"],
    ["D", "Bus"],
    ["DE", "Bus mit Anhänger"],
    ["L", "Zugmaschine bis 40 km/h"],
    ["T", "Zugmaschine"]
  ];

  function fillLicenceField(feldsatz, klassen) {
    const gesetzt = new Set(klassen || []);
    const behaelter = feldsatz.querySelector(".licence-field__classes");
    behaelter.replaceChildren();
    for (const [klasse, beschreibung] of FUEHRERSCHEINKLASSEN) {
      const beschriftung = document.createElement("label");
      const kaestchen = document.createElement("input");
      const name = document.createElement("strong");
      const erklaerung = document.createElement("span");
      kaestchen.type = "checkbox";
      kaestchen.value = klasse;
      kaestchen.checked = gesetzt.has(klasse);
      name.textContent = klasse;
      erklaerung.textContent = beschreibung;
      beschriftung.className = "licence-field__class";
      beschriftung.title = beschreibung;
      beschriftung.append(kaestchen, name, erklaerung);
      behaelter.append(beschriftung);
    }
  }

  function readLicenceField(feldsatz) {
    return [...feldsatz.querySelectorAll("input:checked")].map((kaestchen) => kaestchen.value);
  }

  function openEmployeeEditor(employee) {
    editingEmployeeId = employee.id;
    fillLicenceField(elements.employeeEditLicences, employee.drivingLicenceClasses);
    elements.employeeEditTitle.textContent = `${employee.firstName} ${employee.lastName}`;
    elements.employeeEditFirstName.value = employee.firstName;
    elements.employeeEditLastName.value = employee.lastName;
    elements.employeeEditPersonnelNumber.value = employee.personnelNumber;
    elements.employeeEditPhone.value = employee.phone || "";
    elements.employeeEditEmail.value = employee.email || "";
    elements.employeeEditRole.value = editableEmployeeRole(employee.roles);
    // Der Schalter erscheint nur, wenn die Firma das Lager ueberhaupt hat.
    elements.employeeEditWarehouseField.hidden = !moduleEnabled("warehouse");
    elements.employeeEditWarehouse.checked = employee.roles.includes("warehouse_manager");
    // Der Ausbilder gehoert nur zu einem Auszubildenden, und nur, wenn die
    // Firma das Berichtsheft hat. Ein Feld fuer einen Bereich, den es nicht
    // gibt, verspricht mehr, als die App halten kann.
    const berichtsheft = moduleEnabled("apprentice_reports");
    applyApprenticeFieldVisibility();
    if (berichtsheft) {
      elements.employeeEditTrainer.replaceChildren();
      const leer = document.createElement("option");
      leer.value = "";
      leer.textContent = "Noch niemand";
      elements.employeeEditTrainer.append(leer);
      for (const person of plannableEmployees(adminState?.employees)) {
        if (person.id === employee.id) continue;
        const eintrag = document.createElement("option");
        eintrag.value = person.id;
        eintrag.textContent = `${person.firstName} ${person.lastName}`;
        elements.employeeEditTrainer.append(eintrag);
      }
      elements.employeeEditTrainer.value = employee.trainerUserId || "";
    }
    elements.employeeEditMessage.textContent = "";
    elements.employeeEditForm.hidden = false;
    elements.employeeEditForm.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function renderDispatchSummary() {
    const date = adminState.date;
    const fieldEmployees = fieldPlanningEmployees();
    const dayAssignments = adminState.assignments.filter((assignment) => assignment.workDate === date);
    const plannedEmployeeIds = new Set(dayAssignments.map((assignment) => assignment.employeeId));
    const dayAbsences = (adminState.absences || []).filter((absence) => (
      absence.status === "approved"
      && absence.startDate <= date
      && absence.endDate >= date
    ));
    const fullDayAbsentIds = new Set(
      dayAbsences
        .filter((absence) => absence.dayPart === "full_day")
        .map((absence) => absence.employeeId)
    );
    const unassigned = fieldEmployees.filter((employee) => (
      !plannedEmployeeIds.has(employee.id) && !fullDayAbsentIds.has(employee.id)
    ));
    const dayWorkDays = adminState.workDays.filter((day) => day.workDate === date);
    const active = dayWorkDays.filter((day) => day.workflowStatus === "in_progress");
    const reviews = dayWorkDays.filter((day) => (
      day.reviewable || (
        day.workflowStatus !== "in_progress"
        && Array.isArray(day.warnings)
        && day.warnings.length > 0
      )
    ));
    const plannedFieldCount = fieldEmployees.filter((employee) => plannedEmployeeIds.has(employee.id)).length;
    const dateLabel = shortDate(date);

    elements.dispatchSummaryDate.textContent = date === localDateKey()
      ? `Heute · ${dateLabel}`
      : dateLabel;
    elements.dispatchPlannedCount.textContent = String(plannedFieldCount);
    elements.dispatchAbsentCount.textContent = String(dayAbsences.length);
    elements.dispatchUnassignedCount.textContent = String(unassigned.length);
    elements.dispatchActiveCount.textContent = String(active.length);
    elements.dispatchReviewCount.textContent = String(reviews.length);

    const notes = [];
    if (dayAbsences.length) {
      notes.push(`Abwesend: ${dayAbsences.map(
        (absence) => `${absence.employeeName} (${absenceTypeLabel(absence.absenceType)})`
      ).join(", ")}`);
    }
    if (unassigned.length) {
      notes.push(`Ohne Einsatz: ${unassigned.map(
        (employee) => `${employee.firstName} ${employee.lastName}`
      ).join(", ")}`);
    } else if (fieldEmployees.length) {
      notes.push("Alle Mitarbeiter sind eingeplant");
    } else {
      notes.push("Noch keine Mitarbeiter angelegt");
    }
    if (reviews.length) {
      notes.push(`Zeit prüfen: ${reviews.map((day) => day.employeeName).join(", ")}`);
    } else {
      notes.push("keine offene Zeitprüfung");
    }
    elements.dispatchSummaryNote.textContent = `${notes.join(" · ")}.`;
    renderLicenceWarning(dayAssignments);
  }

  // Wer auf eine Baustelle faehrt, braucht jemanden mit Fuehrerschein dabei.
  // Steht auf einer Baustelle des Tages niemand mit Schein, steht am Morgen
  // das Fahrzeug in der Halle und die Mannschaft am Betriebshof - und das
  // faellt heute erst auf, wenn es zu spaet ist.
  //
  // Gewarnt wird auch, wenn bei niemandem ein Schein hinterlegt ist: dann ist
  // nicht die Planung falsch, sondern die Stammdaten sind unvollstaendig. Der
  // Hinweis sagt beides getrennt, damit niemand das eine fuer das andere
  // haelt.
  function renderLicenceWarning(dayAssignments) {
    const fahrer = new Map(
      (adminState.employees || []).map((employee) => [
        employee.id,
        (employee.drivingLicenceClasses || []).length > 0
      ])
    );
    const irgendwerHatSchein = [...fahrer.values()].some(Boolean);

    const proBaustelle = new Map();
    for (const assignment of dayAssignments) {
      const eintrag = proBaustelle.get(assignment.constructionSiteId) || {
        name: assignment.siteName || "Ohne Baustelle",
        mitSchein: 0,
        leute: 0
      };
      eintrag.leute += 1;
      if (fahrer.get(assignment.employeeId)) eintrag.mitSchein += 1;
      proBaustelle.set(assignment.constructionSiteId, eintrag);
    }
    const ohneFahrer = [...proBaustelle.values()]
      .filter((eintrag) => eintrag.mitSchein === 0)
      .sort((links, rechts) => links.name.localeCompare(rechts.name, "de-DE"));

    elements.dispatchLicenceWarning.hidden = ohneFahrer.length === 0;
    elements.dispatchLicenceList.replaceChildren();
    if (ohneFahrer.length === 0) return;

    elements.dispatchLicenceTitle.textContent = irgendwerHatSchein
      ? `${ohneFahrer.length} Baustelle${ohneFahrer.length === 1 ? "" : "n"} ohne Fahrer`
      : "Noch kein Führerschein hinterlegt";
    if (!irgendwerHatSchein) {
      const hinweis = document.createElement("li");
      hinweis.textContent = "Bei keinem Mitarbeiter ist eine Führerscheinklasse eingetragen. "
        + "Solange das so ist, kann die Planung nicht prüfen, wer fahren darf.";
      elements.dispatchLicenceList.append(hinweis);
      return;
    }
    for (const eintrag of ohneFahrer) {
      const zeile = document.createElement("li");
      zeile.textContent = `${eintrag.name} · ${eintrag.leute} Mitarbeiter, keiner mit Führerschein`;
      elements.dispatchLicenceList.append(zeile);
    }
  }

  function renderAdmin() {
    if (!adminState) return;
    // Die Verwaltung kennt den Modulstand genauer als die Sitzung. Nach dem
    // Umschalten muss die Oberflaeche sofort folgen, nicht erst beim naechsten
    // vollstaendigen Durchlauf.
    applyModuleVisibility();
    const projectScoped = Boolean(adminState.projectScopeRestricted);
    elements.assignmentImportPanel.hidden = projectScoped;
    elements.siteImportPanel.hidden = projectScoped;
    elements.planningTeamPanel.hidden = projectScoped;
    elements.hierarchyNewCustomer.hidden = true;
    elements.hierarchyNewProject.hidden = true;
    if (projectScoped) elements.employeePanel.hidden = true;
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
    renderDispatchSummary();
    // Der Lageristenschalter steht nur dort, wo es ein Lager gibt.
    elements.employeeWarehouseField.hidden = !moduleEnabled("warehouse");
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
    const projectManagers = adminState.employees.filter((employee) => (
      employee.roles.includes("project_manager")
    ));
    renderAdminSelect(
      elements.projectManager,
      projectManagers,
      "Noch nicht zuweisen",
      (employee) => `${employee.firstName} ${employee.lastName}`
    );
    renderAdminSelect(
      elements.projectEditManager,
      projectManagers,
      "Noch nicht zuweisen",
      (employee) => `${employee.firstName} ${employee.lastName}`
    );
    renderAdminSelect(
      elements.siteProjectManager,
      projectManagers,
      "Noch nicht zuweisen",
      (employee) => `${employee.firstName} ${employee.lastName}`
    );
    renderAdminSelect(
      elements.siteEditProjectManager,
      projectManagers,
      "Noch nicht zuweisen",
      (employee) => `${employee.firstName} ${employee.lastName}`
    );
    elements.siteProjectManager.disabled = Boolean(adminState.projectScopeRestricted);
    elements.siteEditProjectManager.disabled = Boolean(adminState.projectScopeRestricted);
    renderAdminSelect(
      elements.siteCustomer,
      adminState.customers.filter((customer) => customerStatusGroup(customer.status) === "active"),
      "Kunde auswählen",
      (customer) => `${customer.displayName} · ${customer.number}`
    );
    if (!adminState.projectScopeRestricted) {
      const createCustomer = document.createElement("option");
      createCustomer.value = "__new__";
      createCustomer.textContent = "＋ Neuen Kunden anlegen";
      elements.siteCustomer.append(createCustomer);
      if (!adminState.customers.some((customer) => customerStatusGroup(customer.status) === "active")) {
        elements.siteCustomer.value = "__new__";
      }
    }
    updateSiteCustomerMode();
    renderAdminSelect(
      elements.assignmentSite,
      adminState.sites.filter((site) => siteStatusGroup(site.status) === "active"),
      "Baustelle auswählen",
      (site) => `${site.name} · ${site.address.city}`
    );
    renderPlanningControls();
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

    renderEmployeeList();

    renderCustomerOverview();
    renderInspectionOverview();
    renderDashboardMetrics();
    renderTodayOverview();
    renderNotifications();
    renderDocumentList();
    renderReportCenter();
    renderWorkDayReviews();
    renderTimeCorrections();
    renderAbsenceReviews();
    renderTimesheetExport();
    renderAdminTimeAccounts();
    if (openedSiteId && !elements.siteDashboard.hidden) {
      renderSiteDocuments(openedSiteId);
      renderSitePhotos(openedSiteId);
      renderSiteTasks(openedSiteId);
      renderSiteNotes(openedSiteId);
      renderSiteMaterials(openedSiteId);
      renderSiteReports(openedSiteId);
      renderSiteVdeInspections(openedSiteId);
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
          [
            start,
            assignmentDurationLabel(assignment.plannedDurationMinutes),
            assignment.siteName,
            assignment.comment ? `Auftrag: ${assignment.comment}` : "",
            assignment.reportResponsible
              ? (assignment.reportResponsibilitySource === "automatic"
                ? "automatisch Vorarbeiter"
                : "Vorarbeiter / Bericht")
              : ""
          ].filter(Boolean).join(" · ")
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

  function updateAssignmentEditResponsibilityControl() {
    const assignment = planningAssignments().find(
      (candidate) => candidate.id === editingAssignmentId
    );
    const employee = adminState?.employees.find(
      (item) => item.id === elements.assignmentEditEmployee.value
    );
    const lockedAutomatic = assignment?.reportResponsibilitySource === "automatic";
    elements.assignmentEditReportResponsible.disabled =
      lockedAutomatic || !employee?.roles?.includes("foreman");
    if (!employee?.roles?.includes("foreman")) {
      elements.assignmentEditReportResponsible.checked = false;
    }
  }

  async function refreshAdmin(date = elements.assignmentDate.value || localDateKey()) {
    if (!canPlan()) return;
    elements.adminRefresh.disabled = true;
    adminOverviewStatus = "loading";
    adminOverviewDauert = false;
    window.clearTimeout(adminOverviewUhr);
    adminOverviewUhr = window.setTimeout(() => {
      if (adminOverviewStatus !== "loading") return;
      adminOverviewDauert = true;
      renderDashboardLoading();
    }, 8000);
    renderDashboardLoading();
    try {
      const body = await requestJson(`./api/v1/admin/overview?date=${encodeURIComponent(date)}`);
      adminState = body.overview;
      adminOverviewStatus = "ready";
      elements.assignmentDate.value = adminState.date;
      renderAdmin();
      await refreshTimeCorrectionPolicy();
    } catch (error) {
      // Auch ein Netzfehler muss sichtbar werden. Er blieb bisher stumm - und
      // die Startseite, die ohne diese Uebersicht leer ist, sah dann aus, als
      // laede sie noch. Ohne Ende.
      adminOverviewStatus = "failed";
      renderDashboardLoading();
      if (error.status === 401) showLogin();
      else if (!error.network) showToast(error.message);
    } finally {
      window.clearTimeout(adminOverviewUhr);
      adminOverviewDauert = false;
      elements.adminRefresh.disabled = false;
    }
  }

  async function maybeOpenDeepLinkedSite() {
    if (deepLinkedSiteHandled) return;
    const siteId = new URLSearchParams(window.location.search).get("site");
    if (!siteId) return;
    deepLinkedSiteHandled = true;
    if (canPlan()) {
      const site = adminState?.sites.find((candidate) => (
        candidate.id === siteId || candidate.qrCode === siteId
      ));
      if (!site) {
        showToast("Die verlinkte Baustelle ist nicht vorhanden oder nicht zugänglich.");
        return;
      }
      openSiteDashboard(site);
      return;
    }
    const assignment = assignments.find(
      (candidate) => (
        candidate.constructionSite.id === siteId
        || candidate.constructionSite.qrCode === siteId
      )
    );
    if (!assignment) {
      // Wer vor Ort den Baustellenlink oeffnet, steht auf dieser Baustelle.
      // Frueher endete der Weg hier mit einer Absage, obwohl ein Mitarbeiter
      // seine Baustelle selbst waehlen darf. Die Wahl wird uebernommen und der
      // Einsatz als eigene Auswahl vermerkt.
      let uebernommeneId = null;
      try {
        uebernommeneId = await applySelectedSite(siteId);
      } catch (error) {
        showToast(error.network
          ? "Ohne Verbindung lässt sich die Baustelle nicht übernehmen."
          : "Diese Baustelle ist dir heute nicht zugewiesen.");
        return;
      }
      const uebernommen = assignments.find(
        (candidate) => candidate.constructionSite.id === uebernommeneId
          || candidate.constructionSite.qrCode === siteId
      );
      if (!uebernommen) return;
      await openEmployeeSiteWorkspace(uebernommen);
      return;
    }
    await openEmployeeSiteWorkspace(assignment);
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

  function appendEmployeeSiteEmpty(list, message) {
    const item = document.createElement("li");
    item.className = "employee-site-list__empty";
    item.textContent = message;
    list.append(item);
  }

  function appendEmployeeSiteItem(list, titleText, metaText, badgeText = "", action = null) {
    const item = document.createElement("li");
    const content = document.createElement("div");
    const title = document.createElement("strong");
    const meta = document.createElement("span");
    title.textContent = titleText;
    meta.textContent = metaText;
    content.append(title, meta);
    item.append(content);
    if (action) {
      const actions = document.createElement("div");
      const link = document.createElement("a");
      actions.className = "employee-site-item-actions";
      if (badgeText) {
        const badge = document.createElement("small");
        badge.textContent = badgeText;
        actions.append(badge);
      }
      link.className = "text-button";
      link.href = action.href;
      link.textContent = action.label;
      actions.append(link);
      item.append(actions);
    } else if (badgeText) {
      const badge = document.createElement("small");
      badge.textContent = badgeText;
      item.append(badge);
    }
    list.append(item);
  }

  // Die Adresse eines Baustellendokuments.
  //
  // Sie kommt in zwei Fassungen vor: die abgelegte, unter der das Dokument im
  // Offline-Speicher steht, und die abgerufene mit der App-Fassung im
  // Adressteil. Ohne diese Trennung waere entweder das Bild waehrend eines
  // Pflichtupdates leer - der Browser holt es selbst und kennt die Kopfzeile
  // nicht - oder jedes bereits offline gesicherte Dokument mit einem Schlag
  // nicht mehr auffindbar, weil sich sein Schluessel geaendert haette.
  function employeeSiteContentKey(documentItem) {
    if (!employeeSiteState) return "#";
    const siteId = encodeURIComponent(employeeSiteState.site.id);
    const documentId = encodeURIComponent(documentItem.id);
    const date = encodeURIComponent(employeeSiteState.date);
    const offlineScope = encodeURIComponent(session?.user?.id || cachedUserId || "anonymous");
    return `./api/v1/construction-sites/${siteId}/documents/${documentId}/content?date=${date}&offlineScope=${offlineScope}`;
  }

  function employeeSiteContentUrl(documentItem) {
    const schluessel = employeeSiteContentKey(documentItem);
    return schluessel === "#" ? schluessel : browserFileUrl(schluessel);
  }

  function documentCacheName(userId) {
    return `${DOCUMENT_CACHE_PREFIX}${userId}`;
  }

  async function removeOfflineDocumentCachesExcept(userId = null) {
    if (!("caches" in window)) return;
    const retainedCache = userId ? documentCacheName(userId) : null;
    try {
      const cacheNames = await window.caches.keys();
      await Promise.all(cacheNames
        .filter((cacheName) => (
          cacheName.startsWith(DOCUMENT_CACHE_PREFIX)
          && cacheName !== retainedCache
        ))
        .map((cacheName) => window.caches.delete(cacheName)));
    } catch {
      // Ein blockierter Cache-Speicher darf Anmeldung und Abmeldung nicht verhindern.
    }
  }

  async function cacheImportantSiteDocuments(dashboard) {
    if (
      !navigator.onLine
      || !("caches" in window)
      || !session?.user?.id
      || !Array.isArray(dashboard?.documents)
    ) return;
    const important = dashboard.documents.filter((documentItem) => documentItem.offlinePriority);
    if (important.length === 0) return;
    const cache = await window.caches.open(documentCacheName(session.user.id));
    await Promise.allSettled(important.map(async (documentItem) => {
      // Abgelegt wird unter dem Schluessel ohne Fassung, geholt mit ihr.
      // Sonst laege dasselbe Dokument nach jeder Fassung erneut im Speicher -
      // und das zuvor gesicherte waere fort.
      const response = await fetch(employeeSiteContentUrl(documentItem), {
        credentials: "same-origin",
        headers: { "X-Schaefchen-Version": "0.44.18" }
      });
      if (response.ok) {
        await cache.put(
          new Request(employeeSiteContentKey(documentItem), { credentials: "same-origin" }),
          response
        );
      }
    }));
  }

  // Auch hier holt die App die Datei selbst: ein „_blank“ ersetzt in einer
  // eingerichteten App die ganze Ansicht, und dort gibt es kein Zurueck.
  function employeeSiteDocumentLink(documentItem) {
    const link = document.createElement("a");
    const adresse = employeeSiteContentUrl(documentItem);
    link.className = "text-button";
    link.href = adresse;
    link.download = documentItem.fileName || "Dokument";
    link.textContent = "Öffnen";
    link.addEventListener("click", (event) => {
      event.preventDefault();
      void openDocumentFile(adresse, documentItem.fileName || "Dokument");
    });
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

  // Der naechste sinnvolle Schritt eines Materialeintrags. Es ist immer genau
  // einer: benoetigt wird bestellt, bestelltes kommt an, angekommenes wird
  // verbaut. Eine Liste aller Staende waere hier auf dem Telefon zu viel - und
  // rueckwaerts geht es nicht, weil der Eintrag den Verlauf abbildet.
  function employeeSiteMaterialAction(material) {
    return {
      planned: { status: "ordered", label: "Bestellt" },
      ordered: { status: "available", label: "Ist da" },
      available: { status: "used", label: "Verbraucht" }
    }[material.status] || null;
  }

  function appendEmployeeSiteMaterial(material) {
    const item = document.createElement("li");
    const content = document.createElement("div");
    const title = document.createElement("strong");
    const meta = document.createElement("span");
    const actions = document.createElement("div");
    const badge = document.createElement("small");
    const action = employeeSiteMaterialAction(material);

    title.textContent = material.itemName;
    meta.textContent = [
      `${material.quantity.toLocaleString("de-DE")} ${material.unit}`,
      material.note
    ].filter(Boolean).join(" \u00b7 ");
    content.append(title, meta);
    appendMaterialStockLine(content, material);
    actions.className = "employee-site-task-actions";
    badge.textContent = materialStatusLabel(material.status);
    actions.append(badge);
    if (action) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "text-button";
      button.textContent = action.label;
      button.disabled = !navigator.onLine;
      button.addEventListener("click", () => {
        void updateEmployeeSiteMaterial(material, action.status, button);
      });
      actions.append(button);
    }
    item.append(content, actions);
    elements.employeeSiteMaterials.append(item);
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

  function includesWorkspaceSearch(query, values) {
    return !query || values
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("de-DE")
      .includes(query);
  }

  function assignmentForReturnedReport(report) {
    return assignments.find((assignment) => (
      assignment.constructionSite.id === report.constructionSiteId
      && assignment.reportResponsible
      && (
        assignment.mobileReport?.id === report.id
        || (
          report.workDate === state.workDate
          && assignment.mobileReport?.status === "returned"
        )
      )
    )) || null;
  }

  function appendEmployeeSiteReport(report) {
    const item = document.createElement("li");
    const content = document.createElement("div");
    const title = document.createElement("strong");
    const meta = document.createElement("span");
    const badge = document.createElement("small");
    title.textContent = report.summary;
    meta.textContent = [
      report.number,
      report.workDate,
      report.authorName,
      report.status === "returned" ? `Hinweis: ${report.returnComment}` : null
    ].filter(Boolean).join(" · ");
    badge.textContent = `${reportTypeLabel(report.reportType)} · ${reportStatusLabel(report.status)}`;
    content.append(title, meta);
    item.append(content, badge);
    if (report.status === "returned") {
      const assignment = assignmentForReturnedReport(report);
      if (assignment) {
        const edit = document.createElement("button");
        edit.type = "button";
        edit.className = "text-button";
        edit.textContent = "Bericht überarbeiten";
        edit.disabled = !navigator.onLine;
        edit.addEventListener("click", () => {
          showDashboardPane("start");
          void openMobileReportForm(assignment, { leaveAfterSave: false });
        });
        item.append(edit);
      }
    }
    elements.employeeSiteReports.append(item);
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
    elements.employeeSiteOrder.textContent = dashboard.assignment?.comment
      || site.shortText
      || "Noch kein Arbeitsauftrag hinterlegt";
    elements.employeeSiteContext.textContent = [
      dashboard.assignment?.plannedStartTime
        ? `Start ${dashboard.assignment.plannedStartTime.slice(0, 5)} Uhr`
        : "",
      assignmentDurationLabel(dashboard.assignment?.plannedDurationMinutes),
      site.customerName || address
    ].filter(Boolean).join(" · ");
    elements.employeeSiteNavigation.href = siteNavigationUrl(site);

    elements.employeeSiteTeamCount.textContent = String(dashboard.team.length);
    elements.employeeSiteTeam.replaceChildren();
    if (dashboard.team.length === 0) {
      appendEmployeeSiteEmpty(elements.employeeSiteTeam, "Für heute ist noch kein Team eingetragen.");
    } else {
      dashboard.team.forEach((member) => {
        const contact = [member.phone, member.email].filter(Boolean).join(" · ");
        const action = member.phone
          ? {
              href: `tel:${member.phone.replace(/[^\d+*#]/g, "")}`,
              label: "Anrufen"
            }
          : member.email
            ? {
                href: `mailto:${member.email}`,
                label: "E-Mail"
              }
            : null;
        appendEmployeeSiteItem(
          elements.employeeSiteTeam,
          member.name,
          [
            member.reportResponsible ? "Erstellt heute den Baustellenbericht" : "Heute eingeplant",
            assignmentDurationLabel(member.plannedDurationMinutes),
            contact
          ].filter(Boolean).join(" · "),
          member.reportResponsible ? "Vorarbeiter" : employeeRoleLabel(member.roles),
          action
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

    const reportQuery = elements.employeeSiteReportSearch.value
      .trim()
      .toLocaleLowerCase("de-DE");
    const visibleReports = dashboard.reports.filter((report) => includesWorkspaceSearch(
      reportQuery,
      [
        report.number,
        report.summary,
        report.authorName,
        report.returnComment,
        reportTypeLabel(report.reportType),
        reportStatusLabel(report.status)
      ]
    ));
    elements.employeeSiteReportCount.textContent = String(dashboard.reports.length);
    elements.employeeSiteReports.replaceChildren();
    if (visibleReports.length === 0) {
      appendEmployeeSiteEmpty(
        elements.employeeSiteReports,
        reportQuery
          ? "Kein Bericht passt zur Suche."
          : "Noch kein Bericht für diese Baustelle."
      );
    } else {
      visibleReports.forEach(appendEmployeeSiteReport);
    }

    const allPhotos = dashboard.documents.filter((documentItem) => documentItem.category === "photo");
    const allDocuments = dashboard.documents.filter((documentItem) => documentItem.category !== "photo");
    const documentQuery = elements.employeeSiteDocumentSearch.value
      .trim()
      .toLocaleLowerCase("de-DE");
    const photoQuery = elements.employeeSitePhotoSearch.value
      .trim()
      .toLocaleLowerCase("de-DE");
    const documents = allDocuments.filter((documentItem) => includesWorkspaceSearch(
      documentQuery,
      [
        documentItem.number,
        documentItem.title,
        documentItem.fileName,
        documentCategoryLabel(documentItem.category)
      ]
    ));
    const photos = allPhotos.filter((photo) => includesWorkspaceSearch(
      photoQuery,
      [photo.number, photo.title, photo.fileName]
    ));
    elements.employeeSiteDocumentCount.textContent = String(allDocuments.length);
    elements.employeeSiteDocuments.replaceChildren();
    if (documents.length === 0) {
      appendEmployeeSiteEmpty(
        elements.employeeSiteDocuments,
        documentQuery
          ? "Kein Dokument passt zur Suche."
          : "Noch kein Dokument für diese Baustelle."
      );
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

    elements.employeeSitePhotoCount.textContent = String(allPhotos.length);
    elements.employeeSitePhotos.replaceChildren();
    if (photos.length === 0) {
      appendEmployeeSiteEmpty(
        elements.employeeSitePhotos,
        photoQuery
          ? "Kein Foto passt zur Suche."
          : "Noch kein Baustellenfoto gespeichert."
      );
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
    elements.employeeSiteMaterialAdd.disabled = !navigator.onLine;
    elements.employeeSiteMaterials.replaceChildren();
    if (dashboard.materials.length === 0) {
      appendEmployeeSiteEmpty(elements.employeeSiteMaterials, "Noch kein Material eingetragen.");
    } else {
      dashboard.materials.forEach((material) => {
        appendEmployeeSiteMaterial(material);
      });
    }

    const vdeModule = dashboard.electricalModules?.vde;
    const vdeEnabled = Boolean(vdeModule?.enabled);
    elements.employeeSiteVdeTab.hidden = !vdeEnabled;
    elements.employeeSiteVdeInspections.replaceChildren();
    if (vdeEnabled) {
      const inspections = vdeModule.inspections || [];
      elements.employeeSiteVdeCount.textContent = String(inspections.length);
      elements.employeeSiteVdeStart.hidden = !vdeModule.permissions?.create;
      elements.employeeSiteVdeStart.disabled = !navigator.onLine;
      if (inspections.length === 0) {
        appendEmployeeSiteEmpty(
          elements.employeeSiteVdeInspections,
          "Noch keine VDE-Prüfung für diese Baustelle."
        );
      } else {
        inspections.forEach((inspection) => {
          appendEmployeeSiteItem(
            elements.employeeSiteVdeInspections,
            inspection.name,
            [
              inspection.number,
              new Intl.DateTimeFormat("de-DE").format(
                new Date(`${inspection.inspectionDate}T12:00:00`)
              ),
              inspection.inspectorName
            ].filter(Boolean).join(" · "),
            vdeInspectionStatusLabel(inspection.status),
            {
              href: inspection.status === "completed"
                ? vdePdfUrl(inspection.id, dashboard.date)
                : vdeEditorUrl(
                  dashboard.site.id,
                  inspection.id,
                  dashboard.date
                ),
              label: inspection.status === "completed" ? "PDF" : "Weiter"
            }
          );
        });
      }
    } else {
      elements.employeeSiteVdeCount.textContent = "0";
      elements.employeeSiteVdeStart.hidden = true;
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
    showEmployeeSiteSection(employeeSiteSection);
  }

  async function openEmployeeSiteWorkspace(requestedAssignment = null) {
    const assignment = requestedAssignment || assignments[currentSiteIndex()];
    if (!assignment?.constructionSite?.id || demoMode) {
      showToast(demoMode
        ? "Die Baustellenakte ist in der Online-Version mit einem echten Einsatz verfügbar."
        : "Für heute ist keine Baustelle freigegeben.");
      return;
    }

    resetEmployeeSiteNoteForm();
    employeeSiteSection = preferredWorkspaceSection(
      "employee",
      assignment.constructionSite.id
    );
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
      void cacheImportantSiteDocuments(body.dashboard);
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

  function resetEmployeeSiteMaterialForm() {
    elements.employeeSiteMaterialForm.reset();
    elements.employeeSiteMaterialForm.hidden = true;
    elements.employeeSiteMaterialMessage.textContent = "";
  }

  // Material von der Baustelle aus eintragen.
  //
  // Wer es verbaut, sieht zuerst, was fehlt: der Vorarbeiter weiss abends, was
  // von der Rolle runter ist und was am naechsten Morgen dabei sein muss. Er
  // konnte es hier bisher nur ansehen. Der einzige Weg, es dem Buero zu sagen,
  // war eine Notiz - dort hat es keine Menge, keine Einheit und keinen Stand,
  // und niemand kann danach suchen.
  async function createEmployeeSiteMaterial() {
    if (!employeeSiteState || !navigator.onLine) {
      elements.employeeSiteMaterialMessage.textContent =
        "F\u00fcr einen neuen Materialeintrag ist momentan eine Verbindung erforderlich.";
      return;
    }
    const submit = elements.employeeSiteMaterialForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    elements.employeeSiteMaterialMessage.textContent = "Material wird gespeichert \u2026";
    try {
      await requestJson(
        `./api/v1/construction-sites/${encodeURIComponent(employeeSiteState.site.id)}/materials?date=${encodeURIComponent(employeeSiteState.date)}`,
        {
          method: "POST",
          body: JSON.stringify({
            itemName: elements.employeeSiteMaterialName.value,
            quantity: Number(elements.employeeSiteMaterialQuantity.value),
            unit: elements.employeeSiteMaterialUnit.value,
            status: elements.employeeSiteMaterialStatus.value,
            note: elements.employeeSiteMaterialNote.value,
            stockItemId: elements.employeeSiteMaterialItem.value || null
          })
        }
      );
      resetEmployeeSiteMaterialForm();
      await refreshEmployeeSiteWorkspace();
      showToast("Material eingetragen.");
    } catch (error) {
      if (error.status === 401) showLogin();
      else elements.employeeSiteMaterialMessage.textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  }

  // Den Stand eines Eintrags weiterschalten - geplant, bestellt, da, verbaut.
  // Das ist die Angabe, wegen der die Liste ueberhaupt gefuehrt wird.
  async function updateEmployeeSiteMaterial(material, status, button) {
    if (!employeeSiteState) return;
    button.disabled = true;
    try {
      await requestJson(
        `./api/v1/construction-sites/${encodeURIComponent(employeeSiteState.site.id)}/materials/${encodeURIComponent(material.id)}?date=${encodeURIComponent(employeeSiteState.date)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ status, rowVersion: material.rowVersion })
        }
      );
      await refreshEmployeeSiteWorkspace();
      showToast("Materialstand aktualisiert.");
    } catch (error) {
      if (error.status === 401) showLogin();
      else showToast(error.message);
      button.disabled = false;
    }
  }

  async function refreshEmployeeSiteWorkspace() {
    const body = await requestJson(
      `./api/v1/construction-sites/${encodeURIComponent(employeeSiteState.site.id)}/dashboard?date=${encodeURIComponent(employeeSiteState.date)}`
    );
    renderEmployeeSiteWorkspace(body.dashboard);
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

  // Nimmt die Baustellen-ID oder die QR-Kennung entgegen. Der Server loest die
  // Kennung auf und meldet die tatsaechliche Baustelle zurueck; ohne diese
  // Aufloesung fand die Umsortierung den Einsatz nicht wieder.
  async function applySelectedSite(gewaehlteKennung) {
    if (!gewaehlteKennung) return null;
    let selectedSiteId = gewaehlteKennung;
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
      selectedSiteId = body.selection.selectedSiteId || selectedSiteId;
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
    return selectedSiteId;
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

  function reportNeedsAction(assignment) {
    const report = reportForAssignment(assignment);
    return !report || report.status === "returned";
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
    const existing = reportForAssignment(assignment);
    let returnedReport = existing?.status === "returned"
      ? employeeSiteState?.reports?.find((report) => report.id === existing.id) || null
      : null;
    elements.mobileReportEyebrow.textContent = existing?.status === "returned"
      ? "Vorarbeiter · Überarbeitung"
      : leaveAfterSave
        ? "Vorarbeiter · Tagesabschluss"
        : "Vorarbeiter · Baustellenbericht";
    elements.mobileReportBadge.textContent = existing?.status === "returned"
      ? "Rückgabe"
      : leaveAfterSave
        ? "Pflicht"
        : "Zwischenspeichern";
    elements.mobileReportSubmit.textContent = existing?.status === "returned"
      ? (leaveAfterSave
        ? "Überarbeitet einreichen & Baustelle verlassen"
        : "Überarbeitet erneut einreichen")
      : leaveAfterSave
        ? "Bericht speichern & Baustelle verlassen"
        : "Bericht speichern";
    const draft = mobileReportDraftFor(assignment);
    elements.mobileReportSite.textContent = assignment.constructionSite.name;
    elements.mobileReportPersonnelList.replaceChildren();
    elements.mobileReportMessage.textContent = existing?.status === "returned"
      ? `Bitte überarbeiten: ${existing.returnComment || "Hinweis des Büros beachten."}`
      : "";
    elements.mobileReportCard.hidden = false;
    elements.mobileReportCard.scrollIntoView({ behavior: "smooth", block: "center" });
    let team = employeeSiteState?.site?.id === assignment.constructionSite.id
      && employeeSiteState.date === state.workDate
      ? employeeSiteState.team
      : [];
    if (
      navigator.onLine
      && (team.length === 0 || (existing?.status === "returned" && !returnedReport))
    ) {
      elements.mobileReportMessage.textContent = "Heutiges Baustellenteam wird geladen …";
      try {
        const body = await requestJson(
          `./api/v1/construction-sites/${encodeURIComponent(assignment.constructionSite.id)}/dashboard?date=${encodeURIComponent(state.workDate)}`
        );
        employeeSiteState = body.dashboard;
        state.siteWorkspace = body.dashboard;
        saveState();
        team = body.dashboard.team;
        returnedReport = existing?.status === "returned"
          ? body.dashboard.reports.find((report) => report.id === existing.id) || null
          : null;
        elements.mobileReportMessage.textContent = existing?.status === "returned"
          ? `Bitte überarbeiten: ${
            returnedReport?.returnComment
            || existing.returnComment
            || "Hinweis des Büros beachten."
          }`
          : "";
      } catch (error) {
        if (!error.network) elements.mobileReportMessage.textContent =
          "Team konnte nicht geladen werden. Die eigenen Stunden können trotzdem erfasst werden.";
      }
    }
    const returnedData = returnedReport?.structuredData || null;
    const returnedSource = returnedReport
      ? {
          reportType: returnedReport.reportType,
          summary: returnedReport.summary,
          workPerformed: returnedData?.workPerformed || returnedReport.details,
          obstructions: returnedData?.obstructions,
          openItems: returnedData?.openItems,
          weather: returnedData?.weather,
          materialsAndEquipment: returnedData?.materialsAndEquipment,
          agreements: returnedData?.agreements,
          incidents: returnedData?.incidents,
          personnel: returnedData?.personnel || []
        }
      : null;
    const source = draft || returnedSource;
    // Auch am Feierabend nur die Arten anbieten, die es gibt. Ein Monteur, der
    // abends auf der Baustelle steht, soll den Bericht abschicken koennen und
    // nicht erfahren, dass es diese Art hier gar nicht gibt.
    fuelleBerichtsarten(elements.mobileReportType, source?.reportType || "daily");
    elements.mobileReportSummary.value = source?.summary || "";
    elements.mobileReportDetails.value = source?.workPerformed || "";
    elements.mobileReportObstructions.value = source?.obstructions || "";
    elements.mobileReportOpenItems.value = source?.openItems || "";
    elements.mobileReportWeather.value = source?.weather || "";
    elements.mobileReportMaterials.value = source?.materialsAndEquipment || "";
    elements.mobileReportAgreements.value = source?.agreements || "";
    elements.mobileReportIncidents.value = source?.incidents || "";
    renderMobileReportPersonnel(assignment, team);
    (source?.personnel || []).forEach((entry) => {
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
    const { reports: pendingReports, entries: pending } = selectPendingWork(state);
    if (pendingReports.length === 0 && pending.length === 0) return;
    syncing = true;
    updateConnectionState();

    let reportSyncFailed = false;
    for (const report of pendingReports) {
      try {
        const body = await requestJson("./api/v1/site-reports", {
          method: "POST",
          body: JSON.stringify(buildReportPayload(report))
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
        const behandlung = classifySyncError(error);
        if (behandlung.vermerken) report.syncError = error.message;
        if (behandlung.anmeldenNoetig) showLogin();
        showToast(syncErrorMessage(behandlung.grund, error.message));
        reportSyncFailed = true;
        break;
      }
      saveState();
      render();
    }

    const zeitenDuerfenFolgen = !reportSyncFailed && timeEntriesMayFollow(state.reports);
    for (const entry of zeitenDuerfenFolgen ? pending : []) {
      try {
        const body = await requestJson("./api/v1/time-entries", {
          method: "POST",
          body: JSON.stringify(buildTimeEntryPayload(entry))
        });
        entry.id = body.timeEntry.id;
        entry.pendingSync = false;
      } catch (error) {
        const behandlung = classifySyncError(error);
        if (behandlung.vermerken) entry.syncError = error.message;
        if (behandlung.anmeldenNoetig) showLogin();
        showToast(syncErrorMessage(behandlung.grund, error.message));
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
      if (assignment?.reportResponsible && reportNeedsAction(assignment)) {
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
    // Eine Schaltflaeche, die nichts ausloest, ist keine. Bei abgeschlossenem
    // Arbeitstag stand auf ihr Wort fuer Wort derselbe Satz wie in der
    // Ueberschrift zwei Zeilen darueber.
    elements.primaryAction.hidden = disabled;
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
    return [
      start,
      assignmentDurationLabel(assignment.plannedDurationMinutes),
      assignment.constructionSite.shortText
    ].filter(Boolean).join(" · ");
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
      elements.assignmentInstruction.hidden = true;
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
    elements.assignmentInstruction.textContent = assignment.comment
      ? `Arbeitsauftrag: ${assignment.comment}`
      : "";
    elements.assignmentInstruction.hidden = !assignment.comment;
    elements.assignmentNavigation.href = siteNavigationUrl(assignment.constructionSite);
    const showReportAction = latest?.type === "site_arrival"
      && assignment.reportResponsible
      && reportNeedsAction(assignment);
    elements.assignmentReport.hidden = !showReportAction;
    elements.assignmentReport.querySelector("strong").textContent =
      reportForAssignment(assignment)?.status === "returned"
        ? "Bericht überarbeiten"
        : "Bericht";
    elements.assignmentQuickActions.classList.toggle(
      "assignment-quick-actions--report",
      showReportAction
    );
    elements.assignmentCard.classList.toggle("assignment-card--active", Boolean(latest) && latest.type !== "clock_out");
  }

  function calculatedTimes() {
    return calculateTimes(state.events, new Date());
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
    correctingTimeEntry = null;
    correctingTimeEntryAdministrator = false;
    elements.timeCorrectionForm.reset();
    elements.timeCorrectionMessage.textContent = "";
    if (elements.timeCorrectionDialog.open) elements.timeCorrectionDialog.close();
  }

  async function populateTimeCorrectionSites(workDate, selectedSiteId) {
    elements.timeCorrectionSite.replaceChildren();
    if (!elements.timeCorrectionSiteField.hidden) {
      const loading = document.createElement("option");
      loading.textContent = "Baustellen werden geladen …";
      loading.value = selectedSiteId || "";
      elements.timeCorrectionSite.append(loading);
      try {
        const sites = correctingTimeEntryAdministrator
          ? (adminState?.sites || []).filter((site) => (
              ["planned", "active", "on_hold"].includes(site.status)
            ))
          : (await requestJson(
              `./api/v1/time-tracking/site-options/${encodeURIComponent(workDate)}`
            )).options?.sites || [];
        elements.timeCorrectionSite.replaceChildren();
        sites.forEach((site) => {
          const option = document.createElement("option");
          option.value = site.id;
          option.textContent = `${site.name}${site.customerName ? ` · ${site.customerName}` : ""}`;
          option.selected = site.id === selectedSiteId;
          elements.timeCorrectionSite.append(option);
        });
        if (
          selectedSiteId
          && ![...elements.timeCorrectionSite.options].some((option) => option.value === selectedSiteId)
        ) {
          const current = document.createElement("option");
          current.value = selectedSiteId;
          current.textContent = "Bisherige Baustelle";
          current.selected = true;
          elements.timeCorrectionSite.prepend(current);
        }
      } catch (error) {
        elements.timeCorrectionMessage.textContent = error.message;
      }
    }
  }

  function openTimeCorrectionForm(entry, administrator = false) {
    if (demoMode || entry.pendingSync || entry.syncError || entry.pendingCorrection) return;
    correctingTimeEntryId = entry.id;
    correctingTimeEntry = entry;
    correctingTimeEntryAdministrator = administrator;
    elements.timeCorrectionTitle.textContent =
      `${timeEntryTypeLabel(entry.type)} bearbeiten`;
    elements.timeCorrectionOriginal.textContent =
      `Bisher: ${shortDate(localDateKey(new Date(entry.recordedAt)))} · ${
        timeFormatter.format(new Date(entry.recordedAt))
      } Uhr`;
    const localValue = localDateTimeInputValue(entry.recordedAt);
    elements.timeCorrectionDate.value = entry.workDate || localValue.slice(0, 10);
    elements.timeCorrectionAt.value = localValue.slice(11, 16);
    const needsSite = ["site_arrival", "site_departure", "next_site"].includes(entry.type);
    elements.timeCorrectionSiteField.hidden = !needsSite;
    elements.timeCorrectionSite.required = needsSite;
    elements.timeCorrectionActivity.value = entry.activityNote || "";
    const supportsTravel = ["clock_in", "site_departure"].includes(entry.type);
    elements.timeCorrectionTravelField.hidden = !supportsTravel;
    elements.timeCorrectionTravel.value = supportsTravel && entry.travelMinutes !== null
      && entry.travelMinutes !== undefined ? String(entry.travelMinutes) : "";
    elements.timeCorrectionBreak.value = entry.breakMinutes !== null
      && entry.breakMinutes !== undefined ? String(entry.breakMinutes) : "";
    elements.timeCorrectionReason.value = "";
    elements.timeCorrectionMessage.textContent = "";
    elements.timeCorrectionDialog.showModal();
    void populateTimeCorrectionSites(elements.timeCorrectionDate.value, entry.constructionSiteId);
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

  function absenceTypeLabel(type) {
    return {
      vacation: "Urlaub",
      unpaid_vacation: "Unbezahlter Urlaub",
      time_off: "Überstundenabbau",
      leave: "Freistellung",
      special_leave: "Sonderurlaub",
      sick: "Krank",
      training: "Lehrgang / Weiterbildung",
      vocational_school: "Berufsschule",
      other: "Sonstiges"
    }[type] || type;
  }

  function absenceDayPartLabel(dayPart) {
    return {
      full_day: "ganztägig",
      first_half: "erste Tageshälfte",
      second_half: "zweite Tageshälfte"
    }[dayPart] || dayPart;
  }

  function absenceStatusLabel(status) {
    return {
      office_review: "Büroprüfung",
      management_review: "Geschäftsführung prüft",
      approved: "Freigegeben",
      office_rejected: "Vom Büro abgelehnt",
      management_rejected: "Von der Geschäftsführung abgelehnt",
      cancelled: "Zurückgezogen"
    }[status] || status;
  }

  function absencePeriodLabel(absence) {
    const period = absence.startDate === absence.endDate
      ? shortDate(absence.startDate)
      : `${shortDate(absence.startDate)} bis ${shortDate(absence.endDate)}`;
    return `${period} · ${absenceDayPartLabel(absence.dayPart)}`;
  }

  function approvedAbsenceForDate(workDate, employeeId = session?.user?.id) {
    const source = employeeId === session?.user?.id
      ? absenceState
      : (adminState?.absences || []).filter((absence) => absence.employeeId === employeeId);
    return source.find((absence) => (
      absence.status === "approved"
      && absence.startDate <= workDate
      && absence.endDate >= workDate
    )) || null;
  }

  function renderAbsences() {
    elements.absenceForm.hidden = demoMode;
    elements.absenceOpenCount.textContent = `${
      absenceState.filter((absence) => ["office_review", "management_review"].includes(absence.status)).length
    } offen`;
    elements.absenceList.replaceChildren();
    if (demoMode) {
      const item = document.createElement("li");
      item.className = "absence-list__empty";
      item.textContent = "Abwesenheitsanträge stehen nach der Online-Anmeldung zur Verfügung.";
      elements.absenceList.append(item);
      return;
    }
    if (absenceState.length === 0) {
      const item = document.createElement("li");
      item.className = "absence-list__empty";
      item.textContent = "Für dieses Jahr liegt noch kein Abwesenheitsantrag vor.";
      elements.absenceList.append(item);
      return;
    }

    absenceState.forEach((absence) => {
      const item = document.createElement("li");
      const heading = document.createElement("div");
      const title = document.createElement("strong");
      const badge = document.createElement("span");
      const period = document.createElement("span");
      const note = document.createElement("span");
      const history = document.createElement("small");
      item.className = `absence-item absence-item--${absence.status}`;
      heading.className = "absence-item__heading";
      title.textContent = absenceTypeLabel(absence.absenceType);
      badge.className = `absence-status absence-status--${absence.status}`;
      badge.textContent = absenceStatusLabel(absence.status);
      period.textContent = absencePeriodLabel(absence);
      note.textContent = absence.note || "";
      note.hidden = !absence.note;
      const latest = absence.history?.at(-1);
      history.textContent = latest
        ? `Letzter Schritt: ${absenceStatusLabel(latest.status)}${
          latest.actorName ? ` · ${latest.actorName}` : ""
        }`
        : "";
      heading.append(title, badge);
      item.append(heading, period, note, history);

      if (["office_review", "management_review"].includes(absence.status)) {
        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.className = "text-button text-button--muted absence-item__cancel";
        cancel.textContent = "Antrag zurückziehen";
        cancel.disabled = !navigator.onLine;
        cancel.addEventListener("click", async () => {
          const reason = window.prompt("Warum möchtest du den Antrag zurückziehen?");
          if (!reason || reason.trim().length < 3) return;
          cancel.disabled = true;
          try {
            await requestJson(`./api/v1/absences/${encodeURIComponent(absence.id)}/cancel`, {
              method: "PATCH",
              body: JSON.stringify({
                action: "cancel",
                comment: reason,
                rowVersion: absence.rowVersion
              })
            });
            showToast("Abwesenheitsantrag zurückgezogen · Historie bleibt erhalten.");
            await Promise.all([
              refreshAbsenceData(),
              refreshAdmin(),
              refreshTimeAccountData(),
              refreshAdminTimeAccounts()
            ]);
          } catch (error) {
            showToast(error.message);
            cancel.disabled = !navigator.onLine;
          }
        });
        item.append(cancel);
      }
      elements.absenceList.append(item);
    });
  }

  function formatDayCount(days) {
    const value = Number(days || 0);
    return `${new Intl.NumberFormat("de-DE", {
      minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
      maximumFractionDigits: 1
    }).format(value)} ${value === 1 ? "Tag" : "Tage"}`;
  }

  function renderHolidayItems(container, holidays, emptyText) {
    container.replaceChildren();
    if (!holidays?.length) {
      const empty = document.createElement("li");
      empty.className = "holiday-list__empty";
      empty.textContent = emptyText;
      container.append(empty);
      return;
    }
    holidays.forEach((holiday) => {
      const item = document.createElement("li");
      const copy = document.createElement("div");
      const title = document.createElement("strong");
      const date = document.createElement("span");
      const source = document.createElement("span");
      title.textContent = holiday.name;
      date.textContent = shortDate(holiday.date);
      source.className = `holiday-list__source${
        holiday.source === "company" ? " holiday-list__source--company" : ""
      }`;
      source.textContent = holiday.source === "company" ? "Betrieblich" : "Gesetzlich";
      copy.append(title, date);
      item.append(copy, source);
      container.append(item);
    });
  }

  // Der Stand des Arbeitskontos in zwei Zahlen - denselben, die im
  // Wochenbereich ausfuehrlich aufgeschluesselt werden. Auf der Uebersicht
  // will man sie sehen, ohne den Bereich zu wechseln; wer es genauer wissen
  // will, kommt mit einem Klick dorthin.
  //
  // Der Resturlaub steht neben den Stunden, weil beides dieselbe Frage
  // beantwortet: was steht mir noch zu. Ihn im Wochenbereich zu verstecken
  // hiess, fuer eine Zahl den Bereich zu wechseln.
  //
  // Die Karte steht auch dann da, wenn das Stundenkonto deaktiviert ist. Der
  // Urlaub laeuft davon unabhaengig weiter - der Wochenbereich sagt das schon
  // ausdruecklich ("Urlaubsstaende bleiben sichtbar"), und die Uebersicht darf
  // ihm nicht widersprechen.
  function renderOverviewAccount(account) {
    elements.overviewAccountCard.hidden = !account;
    if (!account) return;
    if (account.enabled) {
      elements.overviewAccountBalance.textContent =
        formatSignedMinutes(account.totals.balanceMinutes);
      elements.overviewAccountBalance.className = `time-account-balance${
        account.totals.balanceMinutes > 0
          ? " time-account-balance--positive"
          : account.totals.balanceMinutes < 0
            ? " time-account-balance--negative"
            : ""
      }`;
    } else {
      elements.overviewAccountBalance.textContent = "Deaktiviert";
      elements.overviewAccountBalance.className = "time-account-balance";
    }
    elements.overviewAccountVacation.textContent =
      formatDayCount(account.vacation.remainingDays);
    elements.overviewAccountNote.textContent =
      `${account.year} · Stand ${shortDate(account.asOfDate)}`;
  }

  // Die Uebersichtskarten stehen nur da, wenn wenigstens eine etwas zu sagen
  // hat. Eine leere Reihe waere nur eine Luecke ueber dem Stundenzettel.
  function renderOverviewCards() {
    const karten = [
      elements.overviewAccountCard,
      elements.weekOpenActions,
      elements.nextHolidayCard
    ];
    elements.overviewCards.hidden = currentDashboardPane !== "start"
      || karten.every((karte) => karte.hidden);
  }

  function renderTimeAccount() {
    elements.timeAccountPanel.hidden = demoMode;
    if (demoMode) {
      renderOverviewAccount(null);
      renderOverviewCards();
      return;
    }
    const requestedYear = Number(selectedWeekStart.slice(0, 4));
    const account = timeAccountState?.year === requestedYear ? timeAccountState : null;
    elements.timeAccountMonths.replaceChildren();
    elements.timeAccountHolidayList.replaceChildren();
    if (!account) {
      elements.nextHolidayCard.hidden = true;
      elements.timeAccountBalance.textContent = "±00:00";
      elements.timeAccountBalance.className = "time-account-balance";
      elements.timeAccountStatus.textContent = navigator.onLine
        ? "Jahreskonto wird geladen …"
        : "Das Jahreskonto ist offline gerade nicht verfügbar.";
      elements.timeAccountTargetWork.textContent = "00:00 / 00:00";
      elements.timeAccountVacationRemaining.textContent = "0 Tage";
      elements.timeAccountVacationPending.textContent = "0 Tage";
      elements.timeAccountTimeOff.textContent = "0 Tage";
      elements.timeAccountHolidayCount.textContent = "0 berücksichtigt";
      elements.timeAccountHolidayStatus.textContent = navigator.onLine
        ? "Feiertagskalender wird geladen …"
        : "Der Feiertagskalender ist offline gerade nicht verfügbar.";
      renderOverviewAccount(null);
      renderOverviewCards();
      return;
    }
    const holidayCalendar = account.holidayCalendar || {
      configured: false,
      holidays: []
    };
    if (!account.enabled) {
      elements.timeAccountBalance.textContent = "Deaktiviert";
      elements.timeAccountBalance.className = "time-account-balance";
      elements.timeAccountStatus.textContent =
        `Das Stundenkonto ist deaktiviert. Hinterlegter Start: ${shortDate(account.accountStartDate)}. Urlaubsstände bleiben sichtbar.`;
    } else {
      elements.timeAccountBalance.textContent = formatSignedMinutes(account.totals.balanceMinutes);
      elements.timeAccountBalance.className = `time-account-balance${
        account.totals.balanceMinutes > 0
          ? " time-account-balance--positive"
          : account.totals.balanceMinutes < 0
            ? " time-account-balance--negative"
            : ""
      }`;
      elements.timeAccountStatus.textContent =
        `${account.year} · Arbeitszeit bis ${shortDate(addIsoDays(account.asOfDate, -1))} · Buchungen bis ${shortDate(account.asOfDate)} · Start ${shortDate(account.accountStartDate)}`;
    }
    elements.timeAccountTargetWork.textContent =
      `${formatMinutes(account.totals.targetMinutes)} / ${formatMinutes(account.totals.workedMinutes)}`;
    elements.timeAccountVacationRemaining.textContent =
      formatDayCount(account.vacation.remainingDays);
    elements.timeAccountVacationPending.textContent =
      formatDayCount(account.vacation.pendingDays);
    elements.timeAccountTimeOff.textContent =
      formatDayCount(account.timeOff.approvedDays);
    elements.timeAccountHolidayCount.textContent =
      `${holidayCalendar.holidays.length} berücksichtigt`;
    elements.timeAccountHolidayStatus.textContent = holidayCalendar.configured
      ? `${holidayCalendar.year} · ${holidayCalendar.federalStateName} · Feiertage setzen das Tagessoll automatisch auf null.`
      : "Bundesweite Feiertage sind aktiv. Das Büro muss für die regionalen Feiertage noch das Bundesland festlegen.";
    const futureHolidays = [...holidayCalendar.holidays]
      .filter((holiday) => holiday.date >= localDateKey())
      .sort((left, right) => left.date.localeCompare(right.date));
    elements.nextHolidaySummary.replaceChildren();
    futureHolidays.slice(0, 2).forEach((holiday, index) => {
      const row = document.createElement("div");
      const title = document.createElement("strong");
      const date = document.createElement("span");
      title.textContent = holiday.name;
      date.textContent = `${index === 0 ? "Nächster · " : "Danach · "}${shortDate(holiday.date)}`;
      row.append(title, date);
      elements.nextHolidaySummary.append(row);
    });
    elements.nextHolidayCard.hidden = futureHolidays.length === 0;
    elements.timeAccountHolidayStatus.textContent = futureHolidays.length
      ? "An diesen Tagen wird die persönliche Sollarbeitszeit automatisch auf 00:00 gesetzt."
      : "Für den restlichen Zeitraum ist kein weiterer Feiertag hinterlegt.";
    renderHolidayItems(
      elements.timeAccountHolidayList,
      [
        ...futureHolidays,
        ...holidayCalendar.holidays.filter((holiday) => holiday.date < localDateKey())
      ],
      "Für dieses Jahr sind keine Feiertage hinterlegt."
    );

    const monthNames = [
      "Januar", "Februar", "März", "April", "Mai", "Juni",
      "Juli", "August", "September", "Oktober", "November", "Dezember"
    ];
    account.months.forEach((month) => {
      const row = document.createElement("tr");
      [
        monthNames[month.month - 1],
        formatMinutes(month.targetMinutes),
        formatMinutes(month.workedMinutes),
        formatMinutes(month.absenceCreditMinutes),
        formatSignedMinutes(month.changeMinutes),
        formatSignedMinutes(month.closingBalanceMinutes)
      ].forEach((value) => {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.append(cell);
      });
      elements.timeAccountMonths.append(row);
    });

    renderOverviewAccount(account);
    renderOverviewCards();
  }

  const TIME_CORRECTION_POLICY_LABELS = {
    review_required: "Immer prüfen",
    same_day: "Am selben Tag frei",
    immediate: "Sofort wirksam"
  };

  function renderTimeCorrectionPolicy() {
    // Lesen darf die Planung, ändern nur Administration und Geschäftsführung.
    // Die Oberfläche bildet genau das ab, damit niemand auf eine Schaltfläche
    // trifft, die der Server anschließend verweigert.
    const canManage = Boolean(adminState?.canCreateManagementRoles);
    elements.timeCorrectionPolicyAdmin.hidden = !canPlan()
      || !isOfficeAdminPane()
      || currentSettingsSubarea !== "time-rules";
    elements.timeCorrectionPolicyForm.hidden = !canManage;
    if (!timeCorrectionPolicyState) {
      elements.timeCorrectionPolicyState.textContent = navigator.onLine
        ? "wird geladen …"
        : "offline nicht verfügbar";
      return;
    }
    const active = timeCorrectionPolicyState.policy;
    elements.timeCorrectionPolicyState.textContent =
      TIME_CORRECTION_POLICY_LABELS[active] || active;
    for (const option of elements.timeCorrectionPolicyForm.querySelectorAll(
      "input[name='time-correction-policy']"
    )) {
      option.checked = option.value === active;
      option.disabled = !navigator.onLine;
    }
    elements.timeCorrectionPolicySave.disabled = !navigator.onLine;
  }

  async function refreshTimeCorrectionPolicy() {
    if (demoMode || !canPlan()) return;
    try {
      const body = await requestJson("./api/v1/admin/time-correction-policy");
      timeCorrectionPolicyState = body.timeCorrectionPolicy;
    } catch (error) {
      if (!error.network) timeCorrectionPolicyState = null;
    }
    renderTimeCorrectionPolicy();
  }

  function renderHolidayCalendarAdmin(calendar, requestedYear) {
    elements.holidayCalendarYear.textContent = String(requestedYear);
    elements.holidayCalendarList.replaceChildren();
    elements.holidayClosureList.replaceChildren();
    const canManage = Boolean(adminState?.canCreateManagementRoles);
    elements.holidayCalendarForm.hidden = !canManage;
    elements.holidayClosurePanel.hidden = !canManage;
    if (!calendar) {
      elements.holidayCalendarStatus.textContent = navigator.onLine
        ? "Feiertagskalender wird geladen …"
        : "Der Feiertagskalender ist offline gerade nicht verfügbar.";
      renderHolidayItems(
        elements.holidayCalendarList,
        [],
        "Feiertage werden geladen …"
      );
      return;
    }
    const updateDetails = calendar.updatedByName
      ? ` Zuletzt geändert durch ${calendar.updatedByName}.`
      : "";
    elements.holidayCalendarStatus.textContent = calendar.configured
      ? `${calendar.federalStateName} · ${calendar.holidays.length} gesetzliche und betriebliche freie Tage werden im Jahr ${requestedYear} berücksichtigt.${updateDetails}`
      : "Nur die bundesweiten Feiertage sind aktiv. Für eine verbindliche regionale Berechnung muss das Bundesland gespeichert werden.";
    if (canManage) {
      elements.holidayCalendarCountry.value = calendar.countryCode || "DE";
      elements.holidayCalendarState.value = calendar.federalStateCode || "SN";
      const initialClosureDate = localDateKey().startsWith(`${requestedYear}-`)
        ? localDateKey()
        : `${requestedYear}-01-01`;
      if (!elements.holidayClosureDate.value.startsWith(`${requestedYear}-`)) {
        elements.holidayClosureDate.value = initialClosureDate;
      }
      elements.holidayClosureDate.min = `${requestedYear}-01-01`;
      elements.holidayClosureDate.max = `${requestedYear}-12-31`;
    }
    renderHolidayItems(
      elements.holidayCalendarList,
      calendar.holidays,
      "Für dieses Jahr sind keine Feiertage hinterlegt."
    );
    (calendar.closures || []).forEach((closure) => {
      const item = document.createElement("li");
      const copy = document.createElement("div");
      const title = document.createElement("strong");
      const meta = document.createElement("span");
      const actions = document.createElement("div");
      item.dataset.status = closure.status;
      title.textContent = closure.name;
      meta.textContent = closure.status === "cancelled"
        ? `${shortDate(closure.holidayDate)} · aufgehoben durch ${closure.cancelledByName} · ${closure.cancellationNote}`
        : `${shortDate(closure.holidayDate)} · angelegt durch ${closure.createdByName}${
          closure.note ? ` · ${closure.note}` : ""
        }`;
      actions.className = "holiday-closure-list__actions";
      if (closure.status === "cancelled") {
        const status = document.createElement("span");
        status.textContent = "Aufgehoben";
        actions.append(status);
      } else if (canManage) {
        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.className = "text-button text-button--muted";
        cancel.textContent = "Aufheben";
        cancel.disabled = !navigator.onLine;
        cancel.addEventListener("click", async () => {
          const reason = window.prompt(
            "Warum soll dieser betriebliche freie Tag aufgehoben werden?"
          );
          if (!reason || reason.trim().length < 3) return;
          cancel.disabled = true;
          try {
            await requestJson(
              `./api/v1/admin/holiday-calendar/closures/${encodeURIComponent(closure.id)}/cancel`,
              {
                method: "PATCH",
                body: JSON.stringify({
                  rowVersion: closure.rowVersion,
                  cancellationNote: reason
                })
              }
            );
            showToast("Freier Tag aufgehoben · Historie bleibt erhalten.");
            await Promise.all([refreshAdminTimeAccounts(), refreshTimeAccountData()]);
          } catch (error) {
            elements.holidayCalendarMessage.textContent = error.message;
            cancel.disabled = !navigator.onLine;
          }
        });
        actions.append(cancel);
      }
      copy.append(title, meta);
      item.append(copy, actions);
      elements.holidayClosureList.append(item);
    });
    if (!(calendar.closures || []).length) {
      const empty = document.createElement("li");
      empty.className = "holiday-list__empty";
      empty.textContent = "Noch keine zusätzlichen freien Tage angelegt.";
      elements.holidayClosureList.append(empty);
    }
  }

  function closeTimeAccountEditor() {
    editingTimeAccountId = null;
    elements.timeAccountProfileForm.hidden = true;
    elements.timeAccountProfileForm.reset();
    elements.timeAccountProfileMessage.textContent = "";
  }

  function openTimeAccountEditor(account) {
    if (!adminState?.canCreateManagementRoles) return;
    editingTimeAccountId = account.employeeId;
    elements.timeAccountProfileTitle.textContent = account.employeeName;
    elements.timeAccountProfileEnabled.checked = account.enabled;
    elements.timeAccountProfileStart.value = account.accountStartDate;
    elements.timeAccountProfileVacation.value = String(account.annualVacationDays);
    elements.timeAccountAdjustmentDate.value = localDateKey();
    elements.timeAccountAdjustmentHours.value = "";
    elements.timeAccountAdjustmentType.value = "correction";
    elements.timeAccountAdjustmentNote.value = "";
    elements.timeAccountProfileMessage.textContent = "";
    elements.timeAccountProfileForm.hidden = false;
    elements.timeAccountProfileForm.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function renderAdminYearOptions() {
    const current = new Date().getFullYear();
    const years = [current + 1, current, current - 1, current - 2];
    [elements.adminYear, elements.hoursOverviewYear].forEach((picker) => {
      if (picker.options.length !== years.length) {
        picker.replaceChildren(...years.map((year) => {
          const option = document.createElement("option");
          option.value = String(year);
          option.textContent = String(year);
          return option;
        }));
      }
      picker.value = String(adminYear);
    });
  }

  function hoursValueClass(minutes) {
    if (minutes > 0) return "hours-value hours-value--positive";
    if (minutes < 0) return "hours-value hours-value--negative";
    return "hours-value hours-value--neutral";
  }

  function appendHoursOverviewCell(row, value, className = "") {
    const cell = document.createElement("td");
    cell.textContent = value;
    if (className) cell.className = className;
    row.append(cell);
  }

  function renderHoursOverview() {
    renderAdminYearOptions();
    const allowed = canPlan() && !isProjectScopedSession();
    elements.hoursOverviewBody.replaceChildren();
    if (!allowed) {
      elements.hoursOverviewMessage.textContent = "";
      return;
    }

    const overview = timeAccountsState?.year === adminYear ? timeAccountsState : null;
    const previousEmployee = elements.hoursOverviewEmployee.value || "all";
    elements.hoursOverviewEmployee.replaceChildren(new Option("Alle Mitarbeiter", "all"));
    (overview?.accounts || []).forEach((account) => {
      elements.hoursOverviewEmployee.append(
        new Option(`${account.employeeName} · ${account.personnelNumber}`, account.employeeId)
      );
    });
    elements.hoursOverviewEmployee.value = [...elements.hoursOverviewEmployee.options]
      .some((option) => option.value === previousEmployee)
      ? previousEmployee
      : "all";

    if (!overview) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 6;
      cell.className = "hours-overview-empty";
      cell.textContent = navigator.onLine
        ? "Stundenübersicht wird geladen …"
        : "Die Stundenübersicht ist offline gerade nicht verfügbar.";
      row.append(cell);
      elements.hoursOverviewBody.append(row);
      elements.hoursOverviewMessage.textContent = "";
      return;
    }

    const selectedEmployee = elements.hoursOverviewEmployee.value;
    const accounts = overview.accounts.filter((account) => (
      selectedEmployee === "all" || account.employeeId === selectedEmployee
    ));
    if (accounts.length === 0) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 6;
      cell.className = "hours-overview-empty";
      cell.textContent = "Für diese Auswahl sind keine aktiven Mitarbeiter vorhanden.";
      row.append(cell);
      elements.hoursOverviewBody.append(row);
    } else {
      accounts.forEach((account) => {
        const row = document.createElement("tr");
        const employeeCell = document.createElement("td");
        const employeeName = document.createElement("strong");
        const employeeMeta = document.createElement("span");
        employeeCell.className = "hours-overview-employee";
        employeeName.textContent = account.employeeName;
        employeeMeta.textContent = account.enabled
          ? account.personnelNumber
          : `${account.personnelNumber} · Stundenkonto deaktiviert`;
        employeeCell.append(employeeName, employeeMeta);
        row.append(employeeCell);

        if (!account.enabled) {
          ["–", "–", "–", "–"].forEach((value) => appendHoursOverviewCell(row, value));
          appendHoursOverviewCell(row, "Deaktiviert", "hours-value hours-value--neutral");
        } else {
          const difference = Number(account.totals.yearBalanceChangeMinutes || 0);
          const balance = Number(account.totals.balanceMinutes || 0);
          appendHoursOverviewCell(row, `${formatMinutes(account.totals.targetMinutes)} h`);
          appendHoursOverviewCell(row, `${formatMinutes(account.totals.workedMinutes)} h`);
          appendHoursOverviewCell(row, `${formatSignedMinutes(difference)} h`, hoursValueClass(difference));
          appendHoursOverviewCell(
            row,
            difference > 0 ? `${formatMinutes(difference)} h` : "–",
            hoursValueClass(Math.max(0, difference))
          );
          appendHoursOverviewCell(row, `${formatSignedMinutes(balance)} h`, hoursValueClass(balance));
        }
        elements.hoursOverviewBody.append(row);
      });
    }
    elements.hoursOverviewMessage.textContent = `Stand ${new Intl.DateTimeFormat("de-DE").format(
      new Date(`${overview.asOfDate}T12:00:00`)
    )} · genehmigte Abwesenheiten und nachvollziehbare Korrekturen sind im Kontostand berücksichtigt.`;
  }

  function renderAdminTimeAccounts() {
    renderAdminYearOptions();
    renderHoursOverview();
    const visible = canPlan() && !isProjectScopedSession() && isOfficeAdminPane();
    elements.timeAccountAdminPanel.hidden = !visible
      || currentSettingsSubarea !== "time-accounts";
    elements.holidayCalendarAdmin.hidden = !visible
      || currentSettingsSubarea !== "holidays";
    if (!visible) return;
    const requestedYear = adminYear;
    const overview = timeAccountsState?.year === requestedYear ? timeAccountsState : null;
    elements.timeAccountAdminList.replaceChildren();
    renderHolidayCalendarAdmin(overview?.holidayCalendar || null, requestedYear);
    if (!overview) {
      const empty = document.createElement("li");
      empty.className = "absence-list__empty";
      empty.textContent = navigator.onLine
        ? "Jahreskonten werden geladen …"
        : "Die Jahreskonten sind offline gerade nicht verfügbar.";
      elements.timeAccountAdminList.append(empty);
      return;
    }
    if (overview.accounts.length === 0) {
      const empty = document.createElement("li");
      empty.className = "absence-list__empty";
      empty.textContent = "Noch keine aktiven Mitarbeiter vorhanden.";
      elements.timeAccountAdminList.append(empty);
    } else {
      overview.accounts.forEach((account) => {
        const item = document.createElement("li");
        const copy = document.createElement("div");
        const title = document.createElement("strong");
        const meta = document.createElement("span");
        const actions = document.createElement("div");
        const balance = document.createElement("strong");
        item.className = "time-account-admin-item";
        title.textContent = account.employeeName;
        meta.textContent = account.enabled
          ? `${account.personnelNumber} · Urlaub ${formatDayCount(account.vacation.remainingDays)} übrig · Abbau ${formatDayCount(account.timeOff.approvedDays)}`
          : `${account.personnelNumber} · Stundenkonto deaktiviert · Urlaub ${formatDayCount(account.vacation.remainingDays)} übrig`;
        balance.className = "time-account-admin-item__balance";
        balance.textContent = account.enabled
          ? formatSignedMinutes(account.totals.balanceMinutes)
          : "Deaktiviert";
        actions.className = "time-account-admin-item__actions";
        actions.append(balance);
        if (adminState?.canCreateManagementRoles) {
          const manage = document.createElement("button");
          manage.type = "button";
          manage.className = "text-button";
          manage.textContent = "Verwalten";
          manage.addEventListener("click", () => openTimeAccountEditor(account));
          actions.append(manage);
        }
        copy.append(title, meta);
        item.append(copy, actions);
        elements.timeAccountAdminList.append(item);
      });
    }
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
          constructionSiteId: entry.constructionSiteId,
          activityNote: entry.activityNote || null,
          travelMinutes: entry.travelMinutes ?? null,
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
    // Der Zeitraum ohne das Jahr am Anfang: es steht am Ende, und zweimal
    // dieselbe Jahreszahl in einer Zeile liest niemand.
    elements.weekPeriod.textContent = `${
      periodStart.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })
    } – ${periodEnd.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}`;
    elements.weekNumber.textContent = isoWeekLabel(visibleWeek.weekStart);
    // Ueber den erfassten Arbeitstagen stand fest "Diese Woche", auch wenn
    // gerade eine frueher liegende Woche geblaettert war. Wer den Kopf der
    // Ansicht nicht mitlas, hielt fremde Zahlen fuer die eigenen dieser Woche.
    elements.weekDaysTitle.textContent = weekStart === currentWeekStart(today)
      ? "Diese Woche"
      : `Woche ab ${shortDate(weekStart)}`;
    elements.weekCurrent.disabled = weekStart === currentWeekStart(today);
    elements.weekNext.disabled = weekStart >= currentWeekStart(today);
    // Der Berichtsheft-Bereich blaettert dieselbe Woche.
    elements.apprenticePeriod.textContent = elements.weekPeriod.textContent;
    elements.apprenticeCurrent.disabled = elements.weekCurrent.disabled;
    elements.apprenticeNext.disabled = elements.weekNext.disabled;
    const targetMinutes = visibleWeek.days.reduce(
      (sum, { workDay }) => sum + Number(workDay?.targetWorkMinutes || 0),
      0
    );
    const workMinutes = Number(visibleWeek.totals.workMinutes || 0);
    const differenceMinutes = workMinutes - targetMinutes;
    elements.weekTotalWork.textContent = formatMinutes(workMinutes);
    elements.weekTotalTarget.textContent = formatMinutes(targetMinutes);
    wochenDifferenzMinuten = differenceMinutes;
    elements.weekTotalDifference.textContent = formatSignedMinutes(differenceMinutes);
    elements.weekTotalDifference.className = differenceMinutes > 0
      ? "time-account-balance--positive"
      : differenceMinutes < 0 ? "time-account-balance--negative" : "";
    elements.weekTotalBreak.textContent = formatMinutes(visibleWeek.totals.breakMinutes || 0);
    elements.weekTotalTravel.textContent = formatMinutes(visibleWeek.totals.travelMinutes || 0);
    elements.weekTotalOvertime.textContent = formatMinutes(visibleWeek.totals.overtimeMinutes || 0);
    elements.timeAccountWeekBreak.textContent = formatMinutes(visibleWeek.totals.breakMinutes || 0);
    elements.timeAccountWeekTravel.textContent = formatMinutes(visibleWeek.totals.travelMinutes || 0);
    elements.timeAccountWeekOvertime.textContent = formatSignedMinutes(visibleWeek.totals.overtimeMinutes || 0);
    elements.weekStrip.replaceChildren();
    elements.weekOverviewTableBody.replaceChildren();
    elements.weekTimesheetList.replaceChildren();
    renderEmployeeTimesheetExport(visibleWeek);
    renderApprenticePanel();
    renderApprenticeReviews();
    renderAbsences();
    renderTimeAccount();
    renderAdminTimeAccounts();

    const selectedIsCurrentWeek = weekStart === currentWeekStart(today);
    // Die Einsaetze werden immer fuer den heutigen Tag geladen. Frueher wurde
    // hier nach assignment.workDate gesucht - das Feld gibt es im Einsatz gar
    // nicht, und in der Karte stand deshalb "Invalid Date".
    const nextAssignment = selectedIsCurrentWeek ? assignments[0] : null;
    elements.weekNextAssignment.hidden = !nextAssignment;
    if (nextAssignment) {
      elements.weekNextAssignmentName.textContent = nextAssignment.constructionSite.name;
      elements.weekNextAssignmentMeta.textContent = [
        shortDate(assignmentsDate || localDateKey()),
        nextAssignment.plannedStartTime ? `${nextAssignment.plannedStartTime.slice(0, 5)} Uhr` : null,
        nextAssignment.comment || nextAssignment.constructionSite.shortText
      ].filter(Boolean).join(" · ");
    }

    const openActions = [];
    visibleWeek.days.forEach(({ workDate, workDay }) => {
      (workDay?.warnings || []).forEach((warning) => {
        openActions.push(`${shortDate(workDate)} · ${warning.message}`);
      });
      if (workDay?.hasPendingCorrection) {
        openActions.push(`${shortDate(workDate)} · Zeitkorrektur wartet auf Freigabe`);
      }
    });
    elements.weekOpenActionsList.replaceChildren();
    [...new Set(openActions)].slice(0, 5).forEach((message) => {
      const item = document.createElement("li");
      item.textContent = message;
      elements.weekOpenActionsList.append(item);
    });
    elements.weekOpenActions.hidden = openActions.length === 0;
    renderOverviewCards();
    renderDashboardMetrics();

    visibleWeek.days.forEach(({ workDate, workDay }) => {
      const date = dateFromIso(workDate);
      const approvedAbsence = approvedAbsenceForDate(workDate);
      const item = document.createElement("button");
      const dayName = shortDayFormatter.format(date).replace(".", "");
      const isToday = workDate === localDateKey(today);
      const assignmentForDay = selectedIsCurrentWeek
        && workDate === (assignmentsDate || localDateKey())
        ? assignments[0]
        : null;
      const tableRow = document.createElement("tr");
      const siteFromEntry = workDay?.entries?.find((entry) => entry.constructionSiteName)
        ?.constructionSiteName;
      const actualMinutes = Number(workDay?.workMinutes || 0);
      const dayTargetMinutes = Number(workDay?.targetWorkMinutes || 0);
      const dayDifferenceMinutes = actualMinutes - dayTargetMinutes;
      const weekend = [0, 6].includes(date.getDay());
      const tableStatus = approvedAbsence
        ? absenceTypeLabel(approvedAbsence.absenceType)
        : workDay?.status === "approved"
          ? "Freigegeben"
          : workDay?.status === "locked"
            ? "Abgerechnet"
            : workDay?.entries?.at(-1)?.entryType === "clock_out"
              ? "Erfasst"
              : workDay?.entries?.length
                ? "In Arbeit"
                : assignmentForDay
                  ? "Geplant"
                  : weekend ? "Frei" : "Offen";
      const tableStatusKind = approvedAbsence
        ? "absence"
        : ["Freigegeben", "Abgerechnet", "Erfasst"].includes(tableStatus)
          ? "success"
          : tableStatus === "In Arbeit"
            ? "active"
            : tableStatus === "Geplant"
              ? "planned"
              : "neutral";
      const tableValues = [
        dayName,
        date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }),
        assignmentForDay?.constructionSite?.name || siteFromEntry || "–",
        dayTargetMinutes ? formatMinutes(dayTargetMinutes) : "–",
        workDay ? formatMinutes(actualMinutes) : "–",
        workDay ? formatSignedMinutes(dayDifferenceMinutes) : "–"
      ];
      tableValues.forEach((value, index) => {
        const cell = document.createElement("td");
        cell.textContent = value;
        if (index === 0) cell.className = "week-overview-table__day";
        if (index === 5 && workDay && dayDifferenceMinutes !== 0) {
          cell.classList.add(dayDifferenceMinutes > 0 ? "is-positive" : "is-negative");
        }
        tableRow.append(cell);
      });
      const statusCell = document.createElement("td");
      const statusBadge = document.createElement("span");
      statusBadge.className = `week-status week-status--${tableStatusKind}`;
      statusBadge.textContent = tableStatus;
      statusCell.append(statusBadge);
      tableRow.append(statusCell);
      if (isToday) tableRow.classList.add("is-today");
      elements.weekOverviewTableBody.append(tableRow);
      item.className = `day-pill${isToday ? " day-pill--today" : ""}${
        approvedAbsence ? " day-pill--absent" : ""
      }`;
      item.type = "button";
      // Der Tag traegt seine Zahlen selbst, wie im Entwurf: Wochentag, Datum,
      // Haken, Kommen, Gehen und die Stunden. Wer den Streifen ueberfliegt,
      // sieht damit ohne Klick, wo etwas fehlt.
      const buchungen = workDay?.entries || [];
      const kommen = buchungen.find((eintrag) => eintrag.entryType === "clock_in");
      const gehen = [...buchungen].reverse().find((eintrag) => eintrag.entryType === "clock_out");
      const uhrzeit = (eintrag) => (
        eintrag ? timeFormatter.format(new Date(eintrag.recordedAt)) : null
      );
      const name = document.createElement("span");
      const number = document.createElement("strong");
      const status = document.createElement("i");
      const kommenZeile = document.createElement("span");
      const gehenZeile = document.createElement("span");
      const stunden = document.createElement("strong");
      name.className = "day-pill__weekday";
      number.className = "day-pill__date";
      kommenZeile.className = "day-pill__in";
      gehenZeile.className = "day-pill__out";
      stunden.className = "day-pill__hours";
      name.textContent = dayName;
      number.textContent = `${String(date.getDate()).padStart(2, "0")}.${
        String(date.getMonth() + 1).padStart(2, "0")}.`;
      status.textContent = approvedAbsence ? "◆" : buchungen.length ? "✓" : "";
      status.className = `day-pill__status${
        approvedAbsence ? " day-pill__status--absent" : buchungen.length ? " day-pill__status--done" : ""
      }`;
      status.setAttribute("aria-hidden", "true");
      kommenZeile.textContent = uhrzeit(kommen) || "–";
      gehenZeile.textContent = uhrzeit(gehen) || "läuft";
      // Ein Tag ohne jede Buchung braucht keine zweite Zeile: dort steht ein
      // Strich, und zwei Striche untereinander sagen nichts mehr dazu.
      gehenZeile.hidden = !kommen;
      stunden.textContent = workDay?.workMinutes
        ? formatMinutes(workDay.workMinutes)
        : approvedAbsence ? absenceTypeLabel(approvedAbsence.absenceType) : "–";
      item.setAttribute("aria-label", [
        `${dayName}, ${number.textContent}`,
        kommen ? `Kommen ${uhrzeit(kommen)}` : "keine Buchung",
        gehen ? `Gehen ${uhrzeit(gehen)}` : null,
        workDay?.workMinutes ? `${formatMinutes(workDay.workMinutes)} Stunden` : null
      ].filter(Boolean).join(", "));
      item.append(name, number, status, kommenZeile, gehenZeile, stunden);
      item.addEventListener("click", () => {
        document.querySelector(`#week-day-${workDate}`)?.scrollIntoView({
          behavior: "smooth",
          block: "center"
        });
      });
      elements.weekStrip.append(item);

      if (!workDay && !approvedAbsence) return;

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
      dayStatus.textContent = approvedAbsence && !workDay
        ? "Abwesend"
        : !workDay
          ? "Keine Buchung"
        : workDay.status === "approved"
          ? "Freigegeben"
          : statusLabels[workflowStatus] || "Erfasst";
      total.textContent = formatMinutes(workDay?.workMinutes || 0);
      headingCopy.append(dateLabel, dayStatus);
      heading.append(headingCopy, total);
      dayCard.append(heading);

      if (approvedAbsence) {
        const absenceBanner = document.createElement("p");
        absenceBanner.className = "week-day-absence";
        absenceBanner.textContent = `${absenceTypeLabel(approvedAbsence.absenceType)} · ${
          absenceDayPartLabel(approvedAbsence.dayPart)
        } · verbindlich freigegeben`;
        dayCard.append(absenceBanner);
      }

      if (!workDay?.entries?.length) {
        const empty = document.createElement("p");
        empty.className = "week-timesheet-day__empty";
        empty.textContent = approvedAbsence
          ? "Für die freigegebene Abwesenheit sind keine Arbeitszeiten erforderlich."
          : "Für diesen Tag sind keine Zeiten erfasst.";
        dayCard.append(empty);
      } else {
        const metrics = document.createElement("div");
        metrics.className = "week-day-metrics";
        [
          ["Soll", workDay.targetWorkMinutes],
          ["Pause", workDay.breakMinutes],
          ["Fahrt", workDay.travelMinutes],
          Number(workDay.overtimeMinutes || 0) !== 0
            ? ["Differenz", workDay.overtimeMinutes]
            : null
        ].filter(Boolean).forEach(([labelText, minutes]) => {
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
              workDate,
              constructionSiteId: entry.constructionSiteId,
              activityNote: entry.activityNote,
              travelMinutes: entry.travelMinutes,
              breakMinutes: workDay.breakMinutesOverride ?? workDay.breakMinutes,
              breakMinutesOverride: workDay.breakMinutesOverride,
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
    if (elements.weekTimesheetList.childElementCount === 0) {
      const empty = document.createElement("p");
      empty.className = "week-timesheet-day__empty week-timesheet-list__empty";
      empty.textContent = "In dieser Woche sind noch keine Arbeitstage erfasst.";
      elements.weekTimesheetList.append(empty);
    }
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

  // Abgeschaltete Bereiche werden aus der Oberflaeche genommen. Der Server
  // weist sie ohnehin ab; eine Schaltflaeche, die nur einen Fehler erzeugt,
  // waere schlechter als gar keine.
  //
  // "Ohnehin" ist dabei das Entscheidende und nicht selbstverstaendlich: fuer
  // jeden Eintrag hier muss es einen Waechter in der Schnittstelle geben. Ohne
  // ihn versteckt die App nur einen Bereich, den der Server weiter bedient -
  // dann ist der Schalter der Plattformverwaltung eine reine Anzeige.
  const MODULBEREICHE = [
    { key: "absences", knoten: ["#absence-area", "#absence-review-panel"] },
    { key: "documents", knoten: [], reiter: ["tasks", "photos", "documents", "notes"] },
    { key: "materials", knoten: [], reiter: ["materials"] },
    // Der Baustellenlink ist die einzige Ausnahme, und zwar zu Recht: er wird
    // aus Daten gebaut, die der Angemeldete ohnehin sehen darf. Es gibt keine
    // eigene Route, die zu sperren waere.
    { key: "site_qr", knoten: ["#site-dashboard-copy-link"] },
    // Montage- und Tagesberichte sind getrennte Bereiche. Die Berichtsansicht
    // faellt erst weg, wenn beide abgeschaltet sind.
    {
      key: "site_daily_reports",
      knoten: ["#report-center"],
      reiter: ["reports"],
      zusammen: ["assembly_reports"]
    }
  ];

  // Merkt sich, dass dieser Knoten wegen eines abgeschalteten Bereichs
  // verborgen wurde. Nur dann darf er beim Wiedereinschalten zurueckkommen:
  // ob er dann wirklich sichtbar wird, entscheidet weiterhin die jeweilige
  // Ansicht anhand von Rolle, Reiter und Auswahl.
  function verstecke(knoten, eingeschaltet) {
    if (!knoten) return;
    if (!eingeschaltet) {
      knoten.dataset.moduleHidden = "true";
      knoten.hidden = true;
      return;
    }
    if (knoten.dataset.moduleHidden === "true") {
      delete knoten.dataset.moduleHidden;
      knoten.hidden = false;
    }
  }

  function applyModuleVisibility() {
    for (const bereich of MODULBEREICHE) {
      const an = moduleEnabled(bereich.key);
      const wirksam = bereich.zusammen
        ? an || bereich.zusammen.some((weitere) => moduleEnabled(weitere))
        : an;
      for (const auswahl of bereich.knoten) verstecke(document.querySelector(auswahl), wirksam);
      for (const reiter of bereich.reiter || []) {
        verstecke(document.querySelector(`[data-site-dashboard-section-button="${reiter}"]`), wirksam);
        verstecke(document.querySelector(`[data-site-dashboard-section="${reiter}"]`), wirksam);
      }
    }
  }

  // Karten, die nur die Planung sehen darf: Stundenzettel-Export fuer alle,
  // Stundenzettel pruefen, offene Korrekturen und Abwesenheiten pruefen.
  //
  // Sie liegen in der Wochenansicht, also in einem Bereich, den jeder sieht.
  // Ihre Sichtbarkeit wurde bisher ausschliesslich in renderAdmin() gesetzt -
  // und renderAdmin() laeuft fuer einen Monteur nie. Meldete sich auf einem
  // Geraet nach dem Buero ein Monteur an, blieben die Karten stehen: mit den
  // Namen, Arbeitszeiten und Antraegen der vorherigen Sitzung. Deshalb wird
  // die Sichtbarkeit jetzt bei jedem Zeichnen erzwungen und der Inhalt beim
  // Abmelden geleert.
  const PLANNER_ONLY_PANELS = () => [
    elements.timesheetExportPanel,
    elements.workDayReviewPanel,
    elements.timeCorrectionReviewPanel,
    elements.absenceReviewPanel
  ];

  function applyPlannerOnlyVisibility() {
    if (canPlan()) return;
    PLANNER_ONLY_PANELS().forEach((panel) => {
      panel.hidden = true;
    });
  }

  function clearPlannerData() {
    PLANNER_ONLY_PANELS().forEach((panel) => {
      panel.hidden = true;
    });
    [
      elements.workDayReviewList,
      elements.timeCorrectionReviewList,
      elements.absenceReviewList
    ].forEach((liste) => liste.replaceChildren());
  }

  function render() {
    applyModuleVisibility();
    applyPlannerOnlyVisibility();
    renderAction();
    renderAssignment();
    renderTimes();
    renderEntries();
    renderWeek();
    renderAccountCard();
    renderPlatformAnnouncements();
    updateConnectionState();
  }

  function renderPlatformAnnouncements() {
    if (!elements.platformAnnouncements) return;
    const unread = announcementsState.filter((announcement) => !announcement.readAt);
    elements.platformAnnouncements.hidden = unread.length === 0;
    elements.platformAnnouncementList.replaceChildren();
    unread.forEach((announcement) => {
      const article = document.createElement("article");
      article.className = "platform-announcement";
      article.dataset.type = announcement.type;
      const copy = document.createElement("div");
      const title = document.createElement("strong");
      const message = document.createElement("p");
      title.textContent = announcement.title;
      message.textContent = announcement.message;
      copy.append(title, message);
      const dismiss = document.createElement("button");
      dismiss.type = "button";
      dismiss.className = "platform-announcement__dismiss";
      dismiss.textContent = "Gelesen";
      dismiss.setAttribute("aria-label", `${announcement.title} als gelesen markieren`);
      dismiss.addEventListener("click", async () => {
        dismiss.disabled = true;
        try {
          await requestJson(`./api/v1/announcements/${encodeURIComponent(announcement.id)}/read`, {
            method: "POST"
          });
          announcement.readAt = new Date().toISOString();
          renderPlatformAnnouncements();
        } catch (error) {
          dismiss.disabled = false;
          showToast(error.message);
        }
      });
      article.append(copy, dismiss);
      elements.platformAnnouncementList.append(article);
    });
  }

  async function refreshPlatformAnnouncements() {
    if (demoMode || !navigator.onLine) return;
    try {
      const body = await requestJson("./api/v1/announcements");
      announcementsState = body.announcements || [];
      renderPlatformAnnouncements();
    } catch (error) {
      if (error.status === 401) showLogin();
      else if (!error.network) showToast(error.message);
    }
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
    elements.absenceSubmit.disabled = !online || demoMode;
    elements.absenceList
      .querySelectorAll(".absence-item__cancel")
      .forEach((button) => { button.disabled = !online; });
    elements.timeAccountProfileSave.disabled = !online;
    elements.timeAccountAdjustmentSubmit.disabled = !online;
    elements.holidayCalendarSave.disabled = !online;
    elements.holidayClosureSubmit.disabled = !online;
    elements.holidayClosureList
      .querySelectorAll("button")
      .forEach((button) => { button.disabled = !online; });
    if (!elements.employeeSiteWorkspace.hidden) {
      elements.employeeSitePhotoAdd.disabled = !online;
      elements.employeeSiteNoteAdd.disabled = !online;
      elements.employeeSiteMaterialAdd.disabled = !online;
      elements.employeeSiteReportWrite.disabled = !online;
      elements.employeeSiteVdeStart.disabled = !online;
      [elements.employeeSiteTasks, elements.employeeSiteMaterials].forEach((liste) => {
        liste
          .querySelectorAll(".employee-site-task-actions button")
          .forEach((button) => { button.disabled = !online; });
      });
      if (!online) {
        elements.employeeSitePhotoMessage.textContent =
          "Fotos können wieder hinzugefügt werden, sobald eine Verbindung besteht.";
        elements.employeeSiteNoteMessage.textContent =
          "Neue Notizen können wieder gespeichert werden, sobald eine Verbindung besteht.";
      }
    }
  }

  // Die mobile Leiste waehlt fachliche Bereiche, diese Liste die Ziele darin.
  // Sie entsteht aus der echten Desktopnavigation, damit Rolle und
  // Modulfreigabe nie zwischen zwei getrennten Listen auseinanderlaufen.
  function renderPaneMenu() {
    const paneGroup = {
      assignments: "planning",
      sites: "planning",
      reports: "documentation",
      documents: "documentation",
      inspections: "documentation",
      customers: "business",
      employees: "business",
      vehicles: "business",
      devices: "business",
      stock: "business"
    }[currentDashboardPane];
    const selectedGroups = currentDashboardPane === "more"
      ? new Set(["work", "control"])
      : new Set(paneGroup ? [paneGroup] : []);
    const eintraege = [...elements.bottomNav.querySelectorAll(".nav-item--desktop")]
      .filter((knopf) => !knopf.hidden
        && !knopf.classList.contains("nav-item--apprentice-mobile")
        && selectedGroups.has(knopf.dataset.navGroup));
    elements.paneMenu.replaceChildren();
    elements.paneMenu.hidden = eintraege.length === 0;
    if (elements.paneMenu.hidden) return;

    const gruppennamen = {
      work: "Meine Arbeit",
      planning: "Planung",
      documentation: "Dokumentation",
      business: "Betrieb",
      control: "Steuerung"
    };
    const gruppen = new Map();
    for (const eintrag of eintraege) {
      const gruppe = eintrag.dataset.navGroup || "other";
      if (!gruppen.has(gruppe)) gruppen.set(gruppe, []);
      gruppen.get(gruppe).push(eintrag);
    }

    for (const [gruppe, gruppeneintraege] of gruppen) {
      const bereich = document.createElement("section");
      const ueberschrift = document.createElement("p");
      const raster = document.createElement("div");
      bereich.className = "pane-menu__group";
      ueberschrift.className = "pane-menu__heading";
      ueberschrift.textContent = gruppennamen[gruppe] || "Weitere Bereiche";
      raster.className = "pane-menu__grid";

      for (const eintrag of gruppeneintraege) {
        const knopf = document.createElement("button");
        knopf.type = "button";
        knopf.className = "pane-menu__item";
        const active = eintrag.id === `nav-${currentDashboardPane}`;
        knopf.classList.toggle("pane-menu__item--active", active);
        knopf.setAttribute("aria-pressed", String(active));
        knopf.innerHTML = eintrag.querySelector("svg").outerHTML;
        const beschriftung = document.createElement("span");
        beschriftung.textContent = eintrag.querySelector("span").textContent;
        knopf.append(beschriftung);
        knopf.addEventListener("click", () => eintrag.click());
        raster.append(knopf);
      }
      bereich.append(ueberschrift, raster);
      elements.paneMenu.append(bereich);
    }
  }

  function openNavigationGroup(group) {
    const firstVisibleEntry = [...elements.bottomNav.querySelectorAll(
      `.nav-item--desktop[data-nav-group="${group}"]`
    )].find((button) => !button.hidden);
    firstVisibleEntry?.click();
  }

  // Alle Eintraege der Leiste, nicht nur die alten fuenf: eine feste Liste war
  // mit jedem neuen Bereich eine Zeile, die man vergessen kann - dann blieb
  // der aktive Eintrag unmarkiert.
  function activateNavigation(activeButton, mobileActiveButton = null) {
    [...elements.bottomNav.querySelectorAll(".nav-item")].forEach((button) => {
      const active = button === activeButton || button === mobileActiveButton;
      button.classList.toggle("nav-item--active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
  }

  function showWeekSubarea(requested) {
    const allowed = new Set(["overview", "days", "account", "requests"]);
    currentWeekSubarea = allowed.has(requested) ? requested : "overview";
    elements.weekViewButtons.forEach((button) => {
      const active = button.dataset.weekViewButton === currentWeekSubarea;
      button.classList.toggle("page-tab--active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    elements.weekSubareas.forEach((subarea) => {
      subarea.hidden = subarea.dataset.weekSubarea !== currentWeekSubarea;
    });
  }

  function showAnalyticsSubarea(requested) {
    currentAnalyticsSubarea = requested === "export" ? "export" : "hours";
    elements.analyticsViewButtons.forEach((button) => {
      const active = button.dataset.analyticsView === currentAnalyticsSubarea;
      button.classList.toggle("page-tab--active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    elements.hoursOverviewCard.hidden = currentAnalyticsSubarea !== "hours";
    elements.analyticsExportContent.hidden = currentAnalyticsSubarea !== "export";
  }

  function showSettingsSubarea(requested) {
    const allowed = new Set(["time-accounts", "holidays", "time-rules", "account"]);
    const accountOnly = !canPlan() || isProjectScopedSession();
    currentSettingsSubarea = accountOnly
      ? "account"
      : allowed.has(requested) ? requested : "time-accounts";
    // Projektbeschraenkte Konten besitzen keine Firmen-Einstellungen. Eine
    // einzelne, nicht waehlerische Reiterleiste waere dort nur visuelles
    // Rauschen; der Kontobereich steht direkt unter der Ueberschrift.
    elements.settingsTabs.hidden = accountOnly;
    if (accountOnly) {
      elements.adminIntro.textContent = "Deine Zugangsdaten und Rolle im Überblick.";
    }
    elements.settingsViewButtons.forEach((button) => {
      const active = button.dataset.settingsView === currentSettingsSubarea;
      button.classList.toggle("page-tab--active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    renderAdminTimeAccounts();
    renderTimeCorrectionPolicy();
    renderAccountCard();
    elements.infoCard.hidden = currentDashboardPane !== "more"
      || (!demoMode && canPlan() && currentSettingsSubarea !== "account");
  }

  // Die Bueroverwaltung - Jahreskonten, Feiertagskalender und die Regel fuer
  // Zeitkorrekturen - gehoert unter "Mehr". Ohne diese Pruefung stand sie in
  // allen drei Verwaltungsansichten: Einsaetze, Baustellen und Mehr zeigten
  // dieselben drei Karten, weil sie im gemeinsamen Verwaltungsbereich liegen
  // und keine eigene Zuordnung hatten.
  // Der eigene Arbeitstag hat pro Rolle genau einen Bereich. Baustellenrollen
  // brauchen den naechsten logischen Schritt direkt auf "Start". Planende
  // Rollen finden ihn in der getrennten Zeiterfassung. Damit erscheint
  // dieselbe Funktion niemals zugleich auf Start und einer zweiten Seite.
  function showsPersonalWorkday(pane) {
    return canPlan() ? pane === "time" : pane === "start";
  }

  function isOfficeAdminPane() {
    return currentDashboardPane === "more";
  }

  function showDashboardPane(pane, smooth = true) {
    currentDashboardPane = pane;
    if (pane !== "start") closeMobileReportForm();
    if (pane !== "week") closeTimeCorrectionForm();
    const adminPanes = new Set([
      "assignments", "sites", "reports", "employees", "customers", "vehicles",
      "documents", "inspections", "analytics", "more"
    ]);
    elements.dashboardPanes.forEach((element) => {
      if (element === elements.adminSection) {
        element.hidden = !canPlan() || !adminPanes.has(pane);
        return;
      }
      // Die Berichtsheft-Karte gehoert zur Startseite, aber nur fuer
      // Auszubildende. Ohne diese Ausnahme zeigte der Wechsel auf "Start" sie
      // jedem - der Bereichswechsel kennt die Rolle sonst nicht.
      // Die Uebersichtskarten gehoeren zur Startseite, aber nur, wenn eine von
      // ihnen etwas zu sagen hat - sonst waere dort eine leere Reihe.
      if (element === elements.overviewCards) return;
      // Arbeitstag, heutiger Einsatz und Stundenzettel gehoeren dorthin, wo
      // man sie sucht: im Buero in die Zeiterfassung, auf der Baustelle auf
      // das Dashboard.
      if ([elements.workdayCard, elements.todayAssignmentSection, elements.timesheetSection]
        .includes(element)) {
        element.hidden = !showsPersonalWorkday(pane);
        return;
      }
      if (element === elements.apprenticeTodaySection) {
        renderApprenticeToday();
        return;
      }
      if (element === elements.apprenticeSection) {
        element.hidden = pane !== "apprentice"
          || !(isApprentice() || mayReviewApprentices());
        return;
      }
      element.hidden = element.dataset.dashboardPane !== pane;
    });

    if (canPlan()) {
      elements.assignmentPlanningShell.hidden = pane !== "assignments";
      elements.sitePlanningShell.hidden = pane !== "sites";
      elements.reportsShell.hidden = pane !== "reports";
      elements.employeesShell.hidden = pane !== "employees";
      elements.customersShell.hidden = pane !== "customers";
      elements.vehiclesShell.hidden = pane !== "vehicles";
      elements.documentsShell.hidden = pane !== "documents";
      elements.inspectionsShell.hidden = pane !== "inspections";
      elements.analyticsShell.hidden = pane !== "analytics" || isProjectScopedSession();
      elements.reportCenter.hidden = pane !== "reports"
        || !(moduleEnabled("assembly_reports") || moduleEnabled("site_daily_reports"));
      elements.employeePanel.hidden = pane !== "employees" || isProjectScopedSession();
      if (pane === "employees" && !elements.employeePanel.hidden) {
        elements.employeePanel.open = true;
      }
      elements.documentManagementPanel.hidden = pane !== "documents";
      if (pane === "documents" && !elements.documentManagementPanel.hidden) {
        elements.documentManagementPanel.open = true;
      }
      elements.adminSummary.hidden = true;
      elements.dispatchSummary.hidden = pane !== "assignments";
      const copy = {
        assignments: ["Planung", "Einsatzplanung", "Einsätze manuell oder aus Excel planen."],
        sites: ["Planung", "Baustellen", "Aktive und archivierte Baustellen durchsuchen und bearbeiten."],
        reports: ["Dokumentation", "Berichte", "Offene, zurückgegebene und abgeschlossene Berichte an einer Stelle."],
        documents: ["Dokumentation", "Dokumentablage", "Pläne, Protokolle und Rechnungen zentral ablegen."],
        inspections: ["Dokumentation", "Prüfprotokolle", "Alle VDE-Prüfungen des Betriebs auf einen Blick."],
        customers: ["Betrieb", "Kunden", "Kundenstammdaten und zugehörige Baustellen an einer Stelle."],
        employees: ["Betrieb", "Mitarbeiter", "Konten anlegen, Rollen vergeben und Stammdaten pflegen."],
        vehicles: ["Betrieb", "Fahrzeuge", "Transporter, Anhänger und Maschinen mit Fahrer und Terminen."],
        analytics: ["Steuerung", "Arbeitszeit-Auswertung", "Soll, Ist und Zeitkonten vergleichen oder als Nachweis exportieren."],
        more: ["Steuerung", "Einstellungen", "Immer nur den gewählten Einstellungsbereich bearbeiten."]
      }[pane];
      if (copy) {
        [elements.adminEyebrow.textContent, elements.adminTitle.textContent, elements.adminIntro.textContent] = copy;
      }
      renderAdminTimeAccounts();
      renderTimeCorrectionPolicy();
      // Erst jetzt hat die Plantafel eine Breite: gezeichnet wird sie, waehrend
      // ihr Bereich noch verborgen ist, und dort misst sie null.
      applyPlanningBoardWidths();
    }

    const activeButton = {
      time: elements.navTime,
      week: elements.navWeek,
      apprentice: elements.navApprentice,
      assignments: elements.navAssignments,
      sites: elements.navSites,
      reports: elements.navReports,
      employees: elements.navEmployees,
      customers: elements.navCustomers,
      vehicles: elements.navVehicles,
      devices: elements.navDevices,
      stock: elements.navStock,
      documents: elements.navDocuments,
      inspections: elements.navInspections,
      analytics: elements.navAnalytics,
      more: elements.navMore
    }[pane] || elements.navStart;
    const mobileActiveButton = {
      time: elements.navWeek,
      apprentice: elements.navApprentice,
      assignments: elements.navMobilePlanning,
      sites: elements.navMobilePlanning,
      reports: elements.navMobileDocumentation,
      documents: elements.navMobileDocumentation,
      inspections: elements.navMobileDocumentation,
      customers: elements.navMobileBusiness,
      employees: elements.navMobileBusiness,
      vehicles: elements.navMobileBusiness,
      devices: elements.navDevices,
      stock: elements.navStock,
      analytics: elements.navMore
    }[pane] || null;
    activateNavigation(activeButton, mobileActiveButton);
    renderPaneMenu();
    renderDashboardMetrics();
    renderTodayOverview();
    renderQuickAccess();
    renderNotifications();
    // Die Konto-Karte haengt am Bereich, nicht am Zeichnen der Startseite.
    renderAccountCard();
    if (pane === "week") showWeekSubarea(currentWeekSubarea);
    if (pane === "analytics") showAnalyticsSubarea(currentAnalyticsSubarea);
    if (pane === "more") showSettingsSubarea(currentSettingsSubarea);
    renderOverviewCards();
    renderTopbarUser();
    const title = {
      week: "Woche",
      time: "Zeiterfassung",
      apprentice: "Berichtsheft",
      reports: "Berichte",
      employees: "Mitarbeiter",
      customers: "Kunden",
      vehicles: "Fahrzeuge",
      devices: "Maschinen & Geräte",
      stock: "Lager & Material",
      documents: "Dokumentablage",
      inspections: "Prüfprotokolle",
      analytics: "Arbeitszeit-Auswertung",
      site: "Baustelle",
      assignments: "Einsätze",
      sites: "Baustellen",
      more: "Einstellungen"
    }[pane] || "Übersicht";
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
      constructionSiteName: entry.constructionSiteName || null,
      activityNote: entry.activityNote || null,
      travelMinutes: entry.travelMinutes ?? null,
      breakMinutes: workDay?.breakMinutesOverride ?? workDay?.breakMinutes ?? null,
      breakMinutesOverride: workDay?.breakMinutesOverride ?? null,
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

  // Berichtsheft
  //
  // Der Wochenbericht haengt an derselben Woche wie der Stundenzettel: wer
  // zurueckblaettert, sieht den Bericht dieser Woche. Die geleistete Zeit
  // schreibt der Azubi nicht ab, sie kommt aus der Zeiterfassung.
  function apprenticeModuleReady() {
    return !demoMode && moduleEnabled("apprentice_reports");
  }

  // Auszubildender ist eine Rolle wie Monteur oder Vorarbeiter.
  function isApprentice() {
    return apprenticeModuleReady() && sessionRoles(session).includes("apprentice");
  }

  // Sehen und unterschreiben darf ausschliesslich der eingetragene Ausbilder.
  // Ein Berichtsheft ist persoenlich: es geht weder das Buero noch die
  // Geschaeftsfuehrung etwas an, solange sie nicht selbst ausbilden.
  function mayReviewApprentices() {
    return apprenticeModuleReady() && Boolean(session?.user.isTrainer);
  }

  async function refreshApprenticeData() {
    if (!isApprentice() || !navigator.onLine) {
      renderApprenticePanel();
      return;
    }
    const jahr = selectedWeekStart.slice(0, 4);
    try {
      const body = await requestJson(
        `./api/v1/apprentice/reports?from=${jahr}-01-01&to=${jahr}-12-31`
      );
      apprenticeState = body.reports;
      apprenticeMissingState = body.missingWeeks || [];
      apprenticeProfileState = body.profile || null;
    } catch (error) {
      if (error.status === 401) return showLogin();
      apprenticeState = apprenticeState || [];
    }
    renderApprenticePanel();
  }

  async function refreshApprenticeReviews() {
    if (!mayReviewApprentices() || !navigator.onLine) {
      renderApprenticeReviews();
      return;
    }
    try {
      const body = await requestJson("./api/v1/admin/apprentice-reports");
      apprenticeReviewState = body.reports;
      apprenticeGapState = body.gaps || [];
    } catch (error) {
      if (error.status === 401) return showLogin();
      apprenticeReviewState = apprenticeReviewState || [];
    }
    renderApprenticeReviews();
  }

  // Gedruckt wird nur, was der Auszubildende unterschrieben hat.
  const APPRENTICE_PRINTABLE = ["submitted", "approved"];

  const APPRENTICE_STATUS_LABEL = {
    draft: "Entwurf",
    submitted: "Eingereicht",
    approved: "Freigegeben",
    returned: "Zur Überarbeitung"
  };

  function currentApprenticeReport() {
    return (apprenticeState || []).find((report) => report.weekStart === selectedWeekStart) || null;
  }

  function renderApprenticePanel() {
    renderApprenticeToday();
    // Der Wochenwechsler gehoert zum eigenen Heft. Ein Ausbilder hat keines -
    // bei ihm stand er nur da und tat nichts.
    elements.apprenticeWeekControls.hidden = !isApprentice();
    elements.apprenticePanel.hidden = !isApprentice();
    if (elements.apprenticePanel.hidden) return;
    const bericht = currentApprenticeReport();
    const status = bericht?.status || "draft";
    const offen = ["draft", "returned"].includes(status);
    elements.apprenticeStatus.textContent = APPRENTICE_STATUS_LABEL[status];
    elements.apprenticeWeek.textContent = `Woche ab ${shortDate(selectedWeekStart)} · ${
      formatMinutes(bericht?.workedMinutes ?? weekState?.totals?.workMinutes ?? 0)
    } h gearbeitet`;
    elements.apprenticeReturn.hidden = status !== "returned";
    elements.apprenticeReturn.textContent = bericht?.returnComment
      ? `Zurückgegeben: ${bericht.returnComment}`
      : "";

    // Der Schluessel enthaelt die Fassung des Berichts, nicht nur die Woche.
    // Sonst fuellte sich das Formular einmal beim Zeichnen - da lagen die
    // Daten aber noch gar nicht vor - und danach nie wieder: der Azubi sah
    // leere Felder und ueberschrieb damit beim Speichern seinen Bericht.
    const formularSchluessel = `${selectedWeekStart}|${bericht?.rowVersion ?? 0}|${offen}`;
    if (elements.apprenticeForm.dataset.reportKey !== formularSchluessel) {
      renderApprenticeDays(bericht, offen);
      elements.apprenticeWeekRemark.value = bericht?.weekRemark || "";
      elements.apprenticeForm.dataset.reportKey = formularSchluessel;
      elements.apprenticeMessage.textContent = "";
    }
    elements.apprenticeWeekRemark.readOnly = !offen;
    elements.apprenticeSave.hidden = !offen;
    elements.apprenticeSubmit.hidden = !offen;
    // Solange der Ausbilder nicht unterschrieben hat, gehoert der Bericht dem
    // Auszubildenden. Ohne diesen Weg war eine zu frueh eingereichte Woche
    // eine Sackgasse.
    elements.apprenticeWithdraw.hidden = status !== "submitted";
    // Gedruckt wird nur, was eingereicht ist. Ein Entwurf auf Papier sieht
    // fertig aus und ist es nicht.
    elements.apprenticePrint.hidden = !APPRENTICE_PRINTABLE.includes(status);
    elements.apprenticePrintBook.hidden = !(apprenticeState || [])
      .some((eintrag) => APPRENTICE_PRINTABLE.includes(eintrag.status));
    elements.apprenticePrintBook.textContent = `Jahr ${selectedWeekStart.slice(0, 4)} drucken`;
    renderApprenticeFacts();
    renderApprenticeLock(status, bericht);
    renderApprenticeOpenDays();
    renderApprenticeMissing();
    renderApprenticeRemarkCount();
    renderApprenticePreview(status, bericht);

    renderApprenticeHistory();
  }

  // Seine bisherigen Berichte. Fruher war das eine tote Aufzaehlung; im
  // eigenen Bereich ist sie der Weg zurueck in jede Woche - und zu ihrem
  // Ausdruck.
  function renderApprenticeHistory() {
    const berichte = apprenticeState || [];
    elements.apprenticeHistory.replaceChildren();

    if (berichte.length === 0) {
      const leer = document.createElement("li");
      leer.className = "admin-list__empty";
      leer.textContent = "Noch kein Wochenbericht geschrieben.";
      elements.apprenticeHistory.append(leer);
      return;
    }

    for (const eintrag of berichte.slice(0, 26)) {
      const zeile = document.createElement("li");
      zeile.classList.toggle("apprentice-history__current", eintrag.weekStart === selectedWeekStart);

      const oeffnen = document.createElement("button");
      oeffnen.type = "button";
      oeffnen.className = "apprentice-history__open";
      const woche = document.createElement("strong");
      const zustand = document.createElement("span");
      woche.textContent = `Woche ab ${shortDate(eintrag.weekStart)}`;
      zustand.textContent = `${APPRENTICE_STATUS_LABEL[eintrag.status]} · ${
        formatMinutes(eintrag.workedMinutes)
      } h`;
      zustand.className = `apprentice-history__status apprentice-history__status--${eintrag.status}`;
      oeffnen.append(woche, zustand);
      oeffnen.addEventListener("click", () => void selectWeek(eintrag.weekStart));
      zeile.append(oeffnen);

      if (APPRENTICE_PRINTABLE.includes(eintrag.status)) {
        const drucken = document.createElement("button");
        drucken.type = "button";
        drucken.className = "text-button";
        drucken.textContent = "Drucken";
        drucken.addEventListener("click", () => printApprenticeReport(eintrag.weekStart));
        zeile.append(drucken);
      }
      elements.apprenticeHistory.append(zeile);
    }
  }

  // Die Kopfdaten stehen genauso im gedruckten Blatt. Wer sie am Bildschirm
  // sieht, merkt sofort, wenn der Ausbildungsberuf im Personalbogen fehlt -
  // spaeter faellt es erst der Kammer auf.
  function renderApprenticeFacts() {
    const person = apprenticeProfileState;
    const jahr = apprenticeTrainingYear(person?.startedOn, selectedWeekStart);
    elements.apprenticeFactName.textContent = person?.name || "–";
    elements.apprenticeFactYear.textContent = jahr ? `${jahr}. Lehrjahr` : "–";
    elements.apprenticeFactOccupation.textContent = person?.occupation || "– (im Personalbogen ergänzen)";
  }

  // Dieselbe Rechnung wie im PDF: das Lehrjahr ergibt sich aus dem Beginn.
  // Von Hand gepflegt waere es spaetestens im zweiten Jahr falsch.
  function apprenticeTrainingYear(startedOn, weekStart) {
    if (!startedOn || weekStart < startedOn) return null;
    const beginn = dateFromIso(startedOn);
    const woche = dateFromIso(weekStart);
    return Math.min(4, Math.floor((woche - beginn) / (365.25 * 86_400_000)) + 1);
  }

  function renderApprenticeRemarkCount() {
    const laenge = elements.apprenticeWeekRemark.value.length;
    elements.apprenticeRemarkCount.textContent = `${laenge} / 1000 Zeichen`;
  }

  // Die Vorschau zeigt beim Schreiben, wie das Blatt wird. Sie traegt quer
  // darueber "VORSCHAU", solange die Woche nicht eingereicht ist - ein halb
  // ausgefuellter Nachweis sieht auf Papier sonst fertig aus.
  function renderApprenticePreview(status, bericht) {
    const moeglich = Boolean(bericht) && isApprentice();
    elements.apprenticePreviewPanel.hidden = !moeglich;
    elements.apprenticePreview.hidden = !moeglich;
    if (!moeglich) {
      elements.apprenticePreviewFrame.removeAttribute("src");
      elements.apprenticePreviewFrame.dataset.week = "";
      return;
    }
    elements.apprenticePreviewState.textContent = APPRENTICE_PRINTABLE.includes(status)
      ? "Eingereicht"
      : "Noch nicht eingereicht";
    // Neu geladen wird nur, wenn sich wirklich etwas geaendert hat: sonst
    // flackert das Blatt bei jedem Zeichnen.
    const schluessel = `${selectedWeekStart}|${bericht.rowVersion}`;
    if (elements.apprenticePreviewFrame.dataset.week === schluessel) return;
    elements.apprenticePreviewFrame.dataset.week = schluessel;
    // Auch hier holt der Browser das Blatt selbst: die Fassung gehoert in den
    // Adressteil, sonst zeigte der Rahmen die Meldung ueber das notwendige
    // Update statt des Wochenblatts.
    elements.apprenticePreviewFrame.src = `${browserFileUrl(
      `./api/v1/apprentice/reports/${selectedWeekStart}/pdf?preview=true`
    )}#toolbar=0`;
  }

  // Warum lassen sich die Felder nicht mehr beschreiben?
  //
  // Nach dem Einreichen sind sie gesperrt - das ist der Sinn der Unterschrift.
  // Auf dem Bildschirm stand dazu aber nichts: die Felder waren stumm, die
  // Schaltflaechen fort, und das Berichtsheft sah schlicht kaputt aus. Eine
  // Sperre, die sich nicht erklaert, ist ein Fehler.
  function renderApprenticeLock(status, bericht) {
    const texte = {
      // Das kurze Datum endet bereits auf einen Punkt ("05.08."); ein
      // Satzpunkt dahinter ergaebe zwei.
      submitted: bericht?.submittedAt
        ? `Eingereicht am ${shortDate(bericht.submittedAt.slice(0, 10))} — dein Ausbilder muss noch unterschreiben. Bis dahin kannst du die Woche mit „Wieder bearbeiten“ zurückholen.`
        : "Eingereicht — dein Ausbilder muss noch unterschreiben. Bis dahin kannst du die Woche mit „Wieder bearbeiten“ zurückholen.",
      approved: bericht?.reviewedAt
        ? `Freigegeben am ${shortDate(bericht.reviewedAt.slice(0, 10))} von ${bericht.trainerSignatureName || "deinem Ausbilder"}. Ein freigegebener Nachweis bleibt, wie er ist.`
        : "Freigegeben. Ein freigegebener Nachweis bleibt, wie er ist."
    };
    elements.apprenticeLock.hidden = !texte[status];
    elements.apprenticeLock.textContent = texte[status] || "";
  }

  // Welche Arbeitstage sind noch unbeschrieben? Der Server nimmt eine
  // unvollstaendige Woche nicht an - das soll man beim Schreiben sehen und
  // nicht erst an einer Fehlermeldung nach dem Einreichen.
  //
  // Ein Tag mit Abwesenheit ist durch die Abwesenheit erklaert: wer krank war,
  // hat nichts zu berichten.
  function renderApprenticeOpenDays() {
    const bloecke = [...elements.apprenticeDays.querySelectorAll(".apprentice-day")];
    const schreibbar = !elements.apprenticeSubmit.hidden;
    const offeneTage = [];
    for (const block of bloecke) {
      const fehlt = block.dataset.worked === "true"
        && block.dataset.absence !== "true"
        && !block.querySelector("textarea").value.trim();
      block.classList.toggle("apprentice-day--offen", schreibbar && fehlt);
      if (fehlt) offeneTage.push(block.dataset.dayLabel);
    }
    // "3 von 5 Tagen ausgefüllt" - der Stand der Woche auf einen Blick.
    const arbeitstage = bloecke.filter((block) => block.dataset.worked === "true"
      || block.dataset.absence === "true").length;
    const erledigt = arbeitstage - offeneTage.length;
    elements.apprenticeProgress.hidden = arbeitstage === 0;
    elements.apprenticeProgress.textContent = offeneTage.length === 0
      ? `Alle ${arbeitstage} Tage ausgefüllt · Woche komplett`
      : `${erledigt} von ${arbeitstage} Tagen ausgefüllt`;
    elements.apprenticeProgress.classList.toggle("apprentice-progress--fertig", offeneTage.length === 0);

    elements.apprenticeOpen.hidden = !schreibbar || offeneTage.length === 0;
    elements.apprenticeOpen.textContent = elements.apprenticeOpen.hidden
      ? ""
      // Die Kurzform des Wochentags endet bereits auf einen Punkt ("Di.").
      // Mit einem Satzpunkt dahinter stuenden dort zwei.
      : `Noch ohne Eintrag: ${offeneTage.join(" · ")} — ein Arbeitstag ohne Zeile ist kein Nachweis.`;
    elements.apprenticeSubmit.disabled = schreibbar && offeneTage.length > 0;
  }

  // Fehlende Wochen. Am Ende der Ausbildung ist eine Luecke teuer, und bis
  // dahin faellt sie niemandem auf - deshalb steht sie hier, mit einem Weg
  // direkt in die betreffende Woche.
  function renderApprenticeMissing() {
    const wochen = (apprenticeMissingState || []).filter((montag) => montag !== selectedWeekStart);
    elements.apprenticeMissing.hidden = wochen.length === 0;
    if (elements.apprenticeMissing.hidden) return;
    elements.apprenticeMissingText.textContent = wochen.length === 1
      ? "Eine Woche fehlt noch:"
      : `${wochen.length} Wochen fehlen noch:`;
    elements.apprenticeMissingWeeks.replaceChildren();
    // Hoechstens acht Schaltflaechen: eine laengere Reihe liest niemand, und
    // die aelteste Luecke steht ohnehin zuletzt.
    for (const montag of wochen.slice(0, 8)) {
      const knopf = document.createElement("button");
      knopf.type = "button";
      knopf.className = "button button--secondary apprentice-missing__week";
      knopf.textContent = `ab ${shortDate(montag)}`;
      knopf.addEventListener("click", () => {
        selectedWeekStart = montag;
        void refreshWeekData();
      });
      elements.apprenticeMissingWeeks.append(knopf);
    }
  }

  // Eine Zeile je Tag - so, wie der Nachweis am Ende ausgedruckt wird.
  //
  // Montag bis Freitag stehen immer da, damit kein Tag stillschweigend fehlt.
  // Samstag und Sonntag erscheinen nur, wenn an ihnen etwas war: gearbeitet,
  // krank oder aufgeschrieben. Ein leeres Wochenende jede Woche mitzuschleppen
  // waere auf dem Handy nur Scrollweg.
  function renderApprenticeDays(bericht, offen) {
    const geschrieben = new Map(
      (bericht?.dailyEntries || []).map((zeile) => [zeile.workDate, zeile])
    );
    const tageDerWoche = weekState?.weekStart === selectedWeekStart
      ? new Map(weekState.days.map(({ workDate, workDay }) => [workDate, workDay]))
      : new Map();

    elements.apprenticeDays.replaceChildren();
    for (let abstand = 0; abstand < 7; abstand += 1) {
      const datum = addIsoDays(selectedWeekStart, abstand);
      const zeile = geschrieben.get(datum);
      const arbeitstag = tageDerWoche.get(datum);
      const minuten = zeile?.workedMinutes ?? Number(arbeitstag?.workMinutes || 0);
      const genehmigt = approvedAbsenceForDate(datum);
      const abwesenheit = zeile?.absence
        || (genehmigt ? absenceTypeLabel(genehmigt.absenceType) : null);
      const taetigkeiten = zeile?.activities || [];
      if (abstand > 4 && minuten === 0 && !abwesenheit && taetigkeiten.length === 0) continue;

      const block = document.createElement("div");
      block.className = "apprentice-day";
      block.dataset.workDate = datum;
      // Ein Arbeitstag ohne Abwesenheit braucht eine Zeile. Woran das haengt,
      // steht am Block selbst, damit es beim Tippen ohne neue Abfrage zu
      // pruefen ist.
      block.dataset.worked = String(minuten > 0);
      block.dataset.absence = String(Boolean(abwesenheit));

      // Vier Zellen wie im gedruckten Blatt: Tag, Datum, Taetigkeiten,
      // Arbeitszeit. Am Handy stehen sie untereinander, am Rechner
      // nebeneinander - dieselben Bausteine, eine andere Anordnung.
      const name = document.createElement("strong");
      name.className = "apprentice-day__weekday";
      name.textContent = dateFromIso(datum).toLocaleDateString("de-DE", { weekday: "long" });
      const datumsfeld = document.createElement("span");
      datumsfeld.className = "apprentice-day__date";
      datumsfeld.textContent = dateFromIso(datum).toLocaleDateString("de-DE", {
        day: "2-digit", month: "2-digit", year: "numeric"
      });
      block.dataset.dayLabel = dateFromIso(datum).toLocaleDateString("de-DE", {
        weekday: "short", day: "2-digit", month: "2-digit"
      });
      const zusatz = document.createElement("span");
      zusatz.className = "apprentice-day__time";
      // Arbeitszeit und Abwesenheit werden nicht getippt: sie stehen bereits in
      // der Zeiterfassung und in den genehmigten Abwesenheiten. Abgeschrieben
      // wuerden sie irgendwann falsch abgeschrieben.
      zusatz.textContent = [
        abwesenheit,
        minuten > 0 ? `${formatMinutes(minuten)} h` : null
      ].filter(Boolean).join(" · ") || "–";

      const feld = document.createElement("textarea");
      feld.rows = 2;
      feld.maxLength = 3600;
      feld.placeholder = "Was hast du heute gemacht? Eine Zeile je Tätigkeit.";
      feld.value = taetigkeiten.join("\n");
      feld.readOnly = !offen;
      feld.setAttribute("aria-label", `Tätigkeiten am ${name.textContent}, ${datumsfeld.textContent}`);
      feld.addEventListener("input", renderApprenticeOpenDays);

      block.append(name, datumsfeld, feld, zusatz);
      elements.apprenticeDays.append(block);
    }
  }

  // Was in den Tagesfeldern steht, als Tageszeilen fuer den Server. Leere Tage
  // fallen weg; der Server ergaenzt sie ohnehin, wenn an ihnen etwas war.
  function collectApprenticeDays() {
    return [...elements.apprenticeDays.querySelectorAll(".apprentice-day")]
      .map((block) => ({
        workDate: block.dataset.workDate,
        activities: block.querySelector("textarea").value
      }))
      .filter((zeile) => zeile.activities.trim());
  }

  // Die Auszubildenden dieses Ausbilders, jeder mit seinem Stand.
  //
  // Zwei Dinge sieht er hier, die eine Liste eingereichter Berichte nicht
  // zeigt: Wochen, in denen gearbeitet wurde, zu denen aber nichts eingereicht
  // ist - ein Bericht, den niemand abgibt, faellt sonst nirgends auf -, und
  // den Weg zum gedruckten Heft eines ganzen Jahres, das am Ende der
  // Ausbildung bei der Kammer liegt.
  function renderApprenticePeople() {
    const leute = new Map();
    const merken = (userId, name) => {
      if (!userId) return null;
      if (!leute.has(userId)) leute.set(userId, { name, weeks: [] });
      return leute.get(userId);
    };
    for (const bericht of apprenticeReviewState || []) {
      merken(bericht.apprenticeUserId, bericht.apprenticeName);
    }
    for (const luecke of apprenticeGapState || []) {
      const eintrag = merken(luecke.apprenticeUserId, luecke.apprenticeName);
      if (eintrag) eintrag.weeks = luecke.weeks;
    }

    const jahr = currentWeekStart().slice(0, 4);
    elements.apprenticePeople.replaceChildren();
    for (const [userId, person] of leute) {
      const zeile = document.createElement("li");
      const name = document.createElement("strong");
      const stand = document.createElement("span");
      name.textContent = person.name;
      stand.textContent = person.weeks.length === 0
        ? "Alle Wochen abgegeben"
        : person.weeks.length === 1
          ? `Eine Woche offen: ab ${shortDate(person.weeks[0])}`
          : `${person.weeks.length} Wochen offen, älteste ab ${shortDate(person.weeks.at(-1))}`;
      zeile.classList.toggle("apprentice-gap-list__offen", person.weeks.length > 0);

      const drucken = document.createElement("button");
      drucken.type = "button";
      drucken.className = "text-button";
      drucken.textContent = `Jahr ${jahr} drucken`;
      drucken.addEventListener("click", () => printApprenticeYear(jahr, userId));

      zeile.append(name, stand, drucken);
      elements.apprenticePeople.append(zeile);
    }
  }

  function renderApprenticeReviews() {
    elements.apprenticeReviewPanel.hidden = !mayReviewApprentices();
    if (elements.apprenticeReviewPanel.hidden) return;
    const berichte = apprenticeReviewState || [];
    const offene = berichte.filter((bericht) => bericht.status === "submitted");
    elements.apprenticeReviewCount.textContent = `${offene.length} offen`;
    elements.apprenticeApproveAll.hidden = offene.length === 0;
    elements.apprenticeReviewList.replaceChildren();
    renderApprenticePeople();

    if (berichte.length === 0) {
      const leer = document.createElement("li");
      leer.className = "admin-list__empty";
      // In dieser Liste stehen nur eingereichte Wochen. "Keine Wochenberichte
      // vorhanden" widersprach der Zeile darueber, die offene Wochen nannte.
      leer.textContent = "Zurzeit ist kein Wochenbericht eingereicht.";
      elements.apprenticeReviewList.append(leer);
      return;
    }

    for (const bericht of berichte.slice(0, 40)) {
      const zeile = document.createElement("li");
      const kopf = document.createElement("div");
      const name = document.createElement("strong");
      const zusatz = document.createElement("span");
      name.textContent = `${bericht.apprenticeName} · Woche ab ${shortDate(bericht.weekStart)}`;
      zusatz.textContent = `${APPRENTICE_STATUS_LABEL[bericht.status]} · ${
        formatMinutes(bericht.workedMinutes)
      } h`;
      kopf.append(name, zusatz);
      // Der Ausbilder soll sehen, was an welchem Tag war, bevor er
      // unterschreibt. Ein Wochentext sagte ihm das nicht.
      for (const tag of bericht.dailyEntries || []) {
        const inhalt = document.createElement("p");
        inhalt.className = "apprentice-review-summary";
        const eintraege = [
          ...(tag.absence ? [tag.absence] : []),
          ...(tag.activities || [])
        ];
        inhalt.textContent = `${shortDate(tag.workDate)}: ${eintraege.join(" · ") || "–"}`;
        kopf.append(inhalt);
      }
      if (bericht.weekRemark) {
        const bemerkung = document.createElement("p");
        bemerkung.className = "apprentice-review-summary";
        bemerkung.textContent = `Bemerkung: ${bericht.weekRemark}`;
        kopf.append(bemerkung);
      }
      zeile.append(kopf);

      const knoepfe = document.createElement("div");
      knoepfe.className = "apprentice-actions";
      const drucken = document.createElement("button");
      drucken.type = "button";
      drucken.className = "button button--secondary";
      drucken.textContent = "Drucken";
      drucken.addEventListener("click", () => printApprenticeReport(
        bericht.weekStart, bericht.apprenticeUserId
      ));
      knoepfe.append(drucken);
      zeile.append(knoepfe);

      if (bericht.status === "submitted") {
        const freigeben = document.createElement("button");
        freigeben.type = "button";
        freigeben.className = "button button--primary";
        freigeben.textContent = "Freigeben";
        freigeben.addEventListener("click", () => decideApprentice([bericht.id], "approved"));
        const zurueck = document.createElement("button");
        zurueck.type = "button";
        zurueck.className = "button button--secondary";
        zurueck.textContent = "Zurückgeben";
        zurueck.addEventListener("click", () => {
          const bemerkung = window.prompt("Was soll nachgebessert werden?");
          if (bemerkung?.trim()) decideApprentice([bericht.id], "returned", bemerkung.trim());
        });
        knoepfe.append(freigeben, zurueck);
      }
      elements.apprenticeReviewList.append(zeile);
    }
  }

  // Der Wochenbericht als A4-Blatt. Die Kammer will Papier, kein Konto in
  // einer App - und im Ordner steht am Ende genau eine Seite je Woche.
  async function printApprenticeReport(weekStart, apprenticeUserId = null) {
    const feld = apprenticeUserId ? elements.apprenticeReviewMessage : elements.apprenticeMessage;
    feld.textContent = "Der Wochenbericht wird erstellt …";
    try {
      await downloadFile(
        `./api/v1/apprentice/reports/${weekStart}/pdf${
          apprenticeUserId ? `?apprenticeUserId=${apprenticeUserId}` : ""
        }`,
        `Berichtsheft-${weekStart}.pdf`
      );
      feld.textContent = "";
    } catch (error) {
      feld.textContent = error.message;
    }
  }

  // Das ganze Jahr in einer Datei. Am Ende der Ausbildung sind das gut
  // hundertfuenfzig Blaetter - Woche fuer Woche einzeln zu laden und von Hand
  // zu heften ist genau die Arbeit, die diese App abnehmen soll.
  async function printApprenticeYear(jahr, apprenticeUserId = null) {
    const feld = apprenticeUserId ? elements.apprenticeReviewMessage : elements.apprenticeMessage;
    feld.textContent = "Das Berichtsheft wird erstellt …";
    try {
      await downloadFile(
        `./api/v1/apprentice/reports/pdf?from=${jahr}-01-01&to=${jahr}-12-31${
          apprenticeUserId ? `&apprenticeUserId=${apprenticeUserId}` : ""
        }`,
        `Berichtsheft-${jahr}.pdf`
      );
      feld.textContent = "";
    } catch (error) {
      feld.textContent = error.message;
    }
  }

  async function decideApprentice(reportIds, decision, comment = null) {
    elements.apprenticeReviewMessage.textContent = decision === "approved"
      ? "Freigabe wird gespeichert …"
      : "Rückgabe wird gespeichert …";
    try {
      await requestJson("./api/v1/admin/apprentice-reports/review", {
        method: "POST",
        body: JSON.stringify({ reportIds, decision, comment })
      });
      elements.apprenticeReviewMessage.textContent = "";
      await refreshApprenticeReviews();
      showToast(decision === "approved"
        ? `${reportIds.length === 1 ? "Wochenbericht" : "Wochenberichte"} freigegeben.`
        : "Wochenbericht zurückgegeben.");
    } catch (error) {
      elements.apprenticeReviewMessage.textContent = error.message;
    }
  }

  // Zurueckholen, solange der Ausbilder nicht unterschrieben hat.
  async function withdrawApprenticeReport() {
    elements.apprenticeMessage.textContent = "Die Woche wird zurückgeholt …";
    try {
      await requestJson(`./api/v1/apprentice/reports/${selectedWeekStart}/withdraw`, {
        method: "POST"
      });
      elements.apprenticeMessage.textContent = "";
      await refreshApprenticeData();
      showToast("Die Woche liegt wieder bei dir.");
    } catch (error) {
      elements.apprenticeMessage.textContent = error.message;
    }
  }

  async function saveApprenticeReport(submit) {
    elements.apprenticeMessage.textContent = "Wochenbericht wird gespeichert …";
    try {
      await requestJson(`./api/v1/apprentice/reports/${selectedWeekStart}`, {
        method: "PUT",
        body: JSON.stringify({
          dailyEntries: collectApprenticeDays(),
          weekRemark: elements.apprenticeWeekRemark.value
        })
      });
      if (submit) {
        await requestJson(`./api/v1/apprentice/reports/${selectedWeekStart}/submit`, {
          method: "POST"
        });
      }
      elements.apprenticeMessage.textContent = "";
      await refreshApprenticeData();
      showToast(submit ? "Wochenbericht eingereicht." : "Wochenbericht gespeichert.");
    } catch (error) {
      elements.apprenticeMessage.textContent = error.message;
    }
  }

  // Das Berichtsheft ist Tagesarbeit, kein Wochenrueckblick. Wer erst am
  // Freitag anfaengt, weiss den Montag nicht mehr - und im Wochenbereich, wo
  // das Heft bisher allein stand, sucht am Feierabend niemand danach. Darum
  // fragt Schaefchen genau dann, wenn der Tag zu Ende geht.
  //
  // Der Tageseintrag haengt immer an der laufenden Woche, nicht an der Woche,
  // die gerade angezeigt wird: wer im Stundenzettel zurueckblaettert und dann
  // Feierabend macht, traegt sonst in die falsche Woche ein.
  function apprenticeTodayReport() {
    return (apprenticeState || []).find((bericht) => bericht.weekStart === currentWeekStart())
      || null;
  }

  function apprenticeTodayEntry() {
    const heute = localDateKey();
    return (apprenticeTodayReport()?.dailyEntries || [])
      .find((zeile) => zeile.workDate === heute) || null;
  }

  function apprenticeTodayEditable() {
    return isApprentice()
      && ["draft", "returned"].includes(apprenticeTodayReport()?.status || "draft");
  }

  function renderApprenticeToday() {
    if (!isApprentice()) {
      elements.apprenticeTodaySection.hidden = true;
      return;
    }
    const bericht = apprenticeTodayReport();
    const taetigkeiten = apprenticeTodayEntry()?.activities || [];
    const arbeitstagBegonnen = Boolean(lastEvent())
      || (apprenticeTodayEntry()?.workedMinutes ?? calculatedTimes().work) > 0;
    const prompt = apprenticeTodayPrompt({
      apprentice: true,
      pane: currentDashboardPane,
      status: bericht?.status || "draft",
      activities: taetigkeiten,
      workdayStarted: arbeitstagBegonnen,
      returnComment: bericht?.returnComment || ""
    });
    elements.apprenticeTodaySection.hidden = !prompt.visible;
    if (!prompt.visible) return;

    elements.apprenticeTodayState.textContent = prompt.state;
    elements.apprenticeTodaySummary.textContent = prompt.summary;
    elements.apprenticeTodayOpen.dataset.action = prompt.action;
    elements.apprenticeTodayOpenLabel.textContent = prompt.actionLabel;
  }

  function openApprenticeToday({ feierabend = false } = {}) {
    if (!apprenticeTodayEditable()) return;
    const heute = localDateKey();
    const eintrag = apprenticeTodayEntry();
    const genehmigt = approvedAbsenceForDate(heute);
    const abwesenheit = eintrag?.absence
      || (genehmigt ? absenceTypeLabel(genehmigt.absenceType) : null);
    const minuten = eintrag?.workedMinutes ?? calculatedTimes().work;
    elements.apprenticeTodayEyebrow.textContent = feierabend
      ? "Ausbildungsnachweis · Feierabend"
      : "Ausbildungsnachweis · Heute";
    elements.apprenticeTodayMeta.textContent = [
      dateFromIso(heute).toLocaleDateString("de-DE", {
        weekday: "long", day: "2-digit", month: "2-digit"
      }),
      abwesenheit,
      minuten > 0 ? `${formatMinutes(minuten)} h` : null
    ].filter(Boolean).join(" · ");
    elements.apprenticeTodayText.value = (eintrag?.activities || []).join("\n");
    elements.apprenticeTodayMessage.textContent = "";
    if (!elements.apprenticeTodayDialog.open) elements.apprenticeTodayDialog.showModal();
    elements.apprenticeTodayText.focus();
  }

  // Die Schnittstelle nimmt immer die ganze Woche entgegen. Die uebrigen Tage
  // gehen darum unveraendert mit - haetten sie gefehlt, waeren sie geloescht.
  async function saveApprenticeToday() {
    const heute = localDateKey();
    const bericht = apprenticeTodayReport();
    const text = elements.apprenticeTodayText.value;
    const zeilen = (bericht?.dailyEntries || [])
      .filter((zeile) => zeile.workDate !== heute)
      .map((zeile) => ({ workDate: zeile.workDate, activities: zeile.activities }));
    if (text.trim()) zeilen.push({ workDate: heute, activities: text });

    elements.apprenticeTodayMessage.textContent = "Der Eintrag wird gespeichert …";
    try {
      await requestJson(`./api/v1/apprentice/reports/${currentWeekStart()}`, {
        method: "PUT",
        body: JSON.stringify({ dailyEntries: zeilen, weekRemark: bericht?.weekRemark || "" })
      });
      elements.apprenticeTodayMessage.textContent = "";
      elements.apprenticeTodayDialog.close();
      await refreshApprenticeData();
      showToast("Im Berichtsheft eingetragen.");
    } catch (error) {
      elements.apprenticeTodayMessage.textContent = error.message;
    }
  }

  // Feierabend: erst die Zeitbuchung, dann die Frage nach dem Tag. Die Buchung
  // wartet auf nichts - ein spaeter gestempelter Feierabend waere eine falsche
  // Arbeitszeit, und die faellt schwerer ins Gewicht als ein fehlender Satz.
  function endWorkday() {
    addEntry("clock_out");
    if (!navigator.onLine) return;
    if (apprenticeTodayEntry()?.activities?.length) return;
    openApprenticeToday({ feierabend: true });
  }

  async function refreshAbsenceData() {
    if (demoMode) {
      absenceState = [];
      renderAbsences();
      return;
    }
    if (!navigator.onLine) {
      renderAbsences();
      return;
    }
    const requestedYear = selectedWeekStart.slice(0, 4);
    const from = `${requestedYear}-01-01`;
    const to = `${requestedYear}-12-31`;
    try {
      const body = await requestJson(`./api/v1/absences?from=${from}&to=${to}`);
      if (requestedYear !== selectedWeekStart.slice(0, 4)) return;
      absenceState = body.absences || [];
      elements.absenceMessage.textContent = "";
      renderWeek();
    } catch (error) {
      if (error.status === 401) showLogin();
      else {
        elements.absenceMessage.textContent = error.network
          ? "Die Abwesenheiten konnten gerade nicht aktualisiert werden."
          : error.message;
      }
    }
  }

  async function refreshTimeAccountData() {
    if (demoMode) {
      timeAccountState = null;
      renderTimeAccount();
      return;
    }
    if (!navigator.onLine) {
      renderTimeAccount();
      return;
    }
    const requestedYear = Number(selectedWeekStart.slice(0, 4));
    try {
      const body = await requestJson(`./api/v1/time-account?year=${requestedYear}`);
      if (requestedYear !== Number(selectedWeekStart.slice(0, 4))) return;
      timeAccountState = body.timeAccount;
      elements.timeAccountMessage.textContent = "";
      renderTimeAccount();
    } catch (error) {
      if (error.status === 401) showLogin();
      else {
        elements.timeAccountMessage.textContent = error.network
          ? "Das Stundenkonto konnte gerade nicht aktualisiert werden."
          : error.message;
      }
    }
  }

  async function refreshAdminTimeAccounts() {
    if (!canPlan() || isProjectScopedSession()) {
      timeAccountsState = null;
      renderAdminTimeAccounts();
      return;
    }
    if (!navigator.onLine) {
      renderAdminTimeAccounts();
      return;
    }
    const requestedYear = adminYear;
    try {
      const body = await requestJson(`./api/v1/admin/time-accounts?year=${requestedYear}`);
      if (requestedYear !== adminYear) return;
      timeAccountsState = body.timeAccounts;
      elements.timeAccountAdminMessage.textContent = "";
      renderAdminTimeAccounts();
      // Der Saldo steht auch in der Mitarbeiterliste. Ohne diesen Aufruf stand
      // dort ein Strich, bis die Liste aus einem anderen Grund neu gezeichnet
      // wurde - im Browser zuerst am Rechner aufgefallen, am Telefon nicht,
      // weil dort die Reihenfolge zufaellig anders war.
      renderEmployeeList();
    } catch (error) {
      if (error.status === 401) showLogin();
      else {
        const message = error.network
          ? "Die Jahreskonten konnten gerade nicht aktualisiert werden."
          : error.message;
        elements.timeAccountAdminMessage.textContent = message;
        renderHoursOverview();
        elements.hoursOverviewMessage.textContent = message;
      }
    }
  }

  async function selectWeek(weekStart) {
    selectedWeekStart = weekStart;
    weekState = null;
    timeAccountState = null;
    timeAccountsState = null;
    closeTimeAccountEditor();
    renderWeek();
    await Promise.all([
      refreshWeekData(),
      refreshAbsenceData(),
      refreshApprenticeData(),
      refreshApprenticeReviews(),
      refreshTimeAccountData(),
      refreshAdminTimeAccounts()
    ]);
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
      assignmentsDate = date;
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
    await removeOfflineDocumentCachesExcept(sessionView.user.id);
    if (cachedUserId && cachedUserId !== sessionView.user.id) {
      state = initialState();
      assignments = [];
      adminState = null;
      weekState = null;
      absenceState = [];
      timeAccountState = null;
      timeAccountsState = null;
      announcementsState = [];
      employeeSiteState = null;
      deviceModule.clear();
    }
    session = sessionView;
    cachedUserId = session.user.id;
    // Die Firma steht jetzt fest. Sie bleibt auf dem Geraet, auch wenn gleich
    // noch das erste Passwort gesetzt werden muss.
    rememberCompany(session.company.number, session.company.displayName);
    saveState();
    if (session.user.mustChangePassword) {
      showPasswordChange();
      return;
    }
    elements.dashboardCompany.textContent = session.company.displayName;
    setCompanyMark(elements.dashboardCompanyMark, session.company.displayName, session.company.logoUrl);
    elements.companyNumber.value = session.company.number;
    elements.dashboardTitle.textContent = `${greetingForHour()}, ${session.user.firstName} \u{1F44B}`;
    elements.closePreview.textContent = (session.user.firstName[0] || "A").toUpperCase();
    if (!elements.assignmentDate.value) elements.assignmentDate.value = localDateKey();
    showDashboard();
    await Promise.all([
      refreshLiveData(),
      refreshWeekData(),
      refreshAbsenceData(),
      refreshApprenticeData(),
      refreshApprenticeReviews(),
      refreshTimeAccountData(),
      refreshAdminTimeAccounts(),
      refreshAdmin(),
      refreshPlatformAnnouncements(),
      refreshVehicles(),
      deviceModule.refresh(),
      // Nicht der ganze Lagerkontext, nur das Liegengebliebene: wer gestern im
      // Keller ohne Netz gebucht hat, soll seine Buchungen loswerden, sobald er
      // die App wieder oeffnet - ohne dafuer ins Lager tippen zu muessen.
      stockModule.syncQueue()
    ]);
    await maybeOpenDeepLinkedSite();
    await deviceModule.handleDeepLink();
    await stockModule.handleDeepLink();
    await syncPendingEntries();
  }

  async function initialiseOnline() {
    try {
      const setupBody = await requestJson("./api/v1/setup");
      loginSetup = setupBody.setup;
      elements.companyNumber.value = rememberedCompany(deviceCompany, loginSetup).number;
      applyLoginCompanyIdentity();
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

  elements.changeCompany.addEventListener("click", () => {
    companyChangeRequested = true;
    applyCompanyFieldVisibility();
    elements.companyNumber.value = "";
    elements.companyNumber.focus();
    applyLoginCompanyIdentity();
  });

  elements.companyNumber.addEventListener("input", applyLoginCompanyIdentity);
  elements.companyNumber.addEventListener("change", () => {
    elements.companyNumber.value = normalizeCompanyNumber(elements.companyNumber.value);
    applyLoginCompanyIdentity();
  });

  elements.loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (demoMode) {
      elements.loginMessage.textContent = "Diese Adresse ist die öffentliche Demo. Bitte nutze „Vorschau öffnen“.";
      return;
    }

    const companyNumber = normalizeCompanyNumber(elements.companyNumber.value);
    if (!companyNumber) {
      elements.loginMessage.textContent = "Bitte die Firmennummer eingeben.";
      elements.companyNumber.focus();
      return;
    }
    elements.companyNumber.value = companyNumber;

    elements.loginSubmit.disabled = true;
    elements.loginMessage.textContent = "Anmeldung wird geprüft …";
    try {
      const body = await requestJson("./api/v1/session", {
        method: "POST",
        body: JSON.stringify({
          companyNumber,
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
        phone: elements.employeePhone.value,
        email: elements.employeeEmail.value,
        role: elements.employeeRole.value,
        warehouseManager: moduleEnabled("warehouse") && elements.employeeWarehouse.checked,
        drivingLicenceClasses: readLicenceField(elements.employeeLicences),
        temporaryPassword: elements.employeeTemporaryPassword.value
      },
      "Mitarbeiter angelegt · Startpasswort sicher übergeben."
    );
    if (!saved) return;
    elements.employeeForm.reset();
    elements.employeeForm.hidden = true;
    elements.employeeNew.textContent = "＋ Neuer Mitarbeiter";
    fillLicenceField(elements.employeeLicences, []);
    await Promise.all([refreshAdmin(), refreshAdminTimeAccounts()]);
  });

  elements.employeeSearchField.addEventListener("input", renderEmployeeList);
  elements.employeeRoleFilter.addEventListener("change", renderEmployeeList);
  elements.employeeActiveTab.addEventListener("click", () => {
    showArchivedEmployeeView(false);
  });
  elements.employeeArchivedTab.addEventListener("click", () => {
    showArchivedEmployeeView(true);
  });
  elements.employeeNew.addEventListener("click", () => {
    showArchivedEmployeeView(false);
    const opening = elements.employeeForm.hidden;
    elements.employeeForm.hidden = !opening;
    elements.employeeNew.textContent = opening ? "Formular schließen" : "＋ Neuer Mitarbeiter";
    if (opening) {
      elements.employeeFirstName.focus({ preventScroll: true });
      elements.employeeForm.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
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
          phone: elements.employeeEditPhone.value,
          email: elements.employeeEditEmail.value,
          role: elements.employeeEditRole.value,
          // Eine echte Rollenänderung wird ausdrücklich gekennzeichnet. Alte
          // App-Fassungen kannten den Azubi in dieser Auswahl nicht und
          // schickten deshalb unbemerkt "installer"; der Server kann diesen
          // alten Fehler damit sicher von einer bewussten Änderung trennen.
          roleChangeConfirmed:
            editableEmployeeRole(employee.roles) !== elements.employeeEditRole.value,
          // Ohne Freigabe des Lagers steht der Schalter nicht zur Verfuegung;
          // dann bleibt die Rolle so, wie sie ist, statt still zu verschwinden.
          warehouseManager: moduleEnabled("warehouse")
            ? elements.employeeEditWarehouse.checked
            : employee.roles.includes("warehouse_manager"),
          // Ohne diese Angabe wuerde jede Namensaenderung den Ausbilder eines
          // Auszubildenden stillschweigend entfernen.
          trainerUserId: elements.employeeEditRole.value === "apprentice"
            ? elements.employeeEditTrainer.value || null
            : null,
          drivingLicenceClasses: readLicenceField(elements.employeeEditLicences),
          rowVersion: employee.rowVersion
        })
      });
      closeEmployeeEditor();
      showToast("Mitarbeiter und Rolle wurden aktualisiert.");
      await Promise.all([
        refreshAdmin(),
        refreshLiveData(),
        refreshAdminTimeAccounts()
      ]);
    } catch (error) {
      elements.employeeEditMessage.textContent = error.message;
    } finally {
      elements.employeeEditSave.disabled = false;
      elements.employeeEditCancel.disabled = false;
    }
  });
  elements.employeeEditCancel.addEventListener("click", closeEmployeeEditor);
  elements.employeeEditRemove.addEventListener("click", async () => {
    const employee = adminState?.employees.find((item) => item.id === editingEmployeeId);
    if (!employee) return;
    const reason = window.prompt(
      "Grund für Entfernung oder Archivierung (wird unveränderbar protokolliert):"
    );
    if (!reason || reason.trim().length < 3) return;
    if (!window.confirm(
      `${employee.firstName} ${employee.lastName} aus dem aktiven Betrieb entfernen? `
      + "Ohne historische Daten wird das Konto gelöscht, andernfalls sicher archiviert."
    )) return;
    elements.employeeEditRemove.disabled = true;
    elements.employeeEditSave.disabled = true;
    elements.employeeEditCancel.disabled = true;
    elements.employeeEditMessage.textContent = "Historische Verknüpfungen werden sicher geprüft …";
    try {
      const result = await requestJson(
        `./api/v1/admin/employees/${encodeURIComponent(employee.id)}`,
        {
          method: "DELETE",
          body: JSON.stringify({ reason, rowVersion: employee.rowVersion })
        }
      );
      closeEmployeeEditor();
      showToast(result.mode === "deleted"
        ? "Mitarbeiter ohne historische Daten vollständig gelöscht."
        : "Mitarbeiter archiviert · historische Nachweise bleiben erhalten.");
      await Promise.all([refreshAdmin(), refreshLiveData(), refreshAdminTimeAccounts()]);
    } catch (error) {
      elements.employeeEditMessage.textContent = error.message;
    } finally {
      elements.employeeEditRemove.disabled = false;
      elements.employeeEditSave.disabled = false;
      elements.employeeEditCancel.disabled = false;
    }
  });

  elements.timeAccountProfileForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const account = timeAccountsState?.accounts.find(
      (item) => item.employeeId === editingTimeAccountId
    );
    if (!account) {
      elements.timeAccountProfileMessage.textContent =
        "Das Stundenkonto wurde nicht gefunden. Bitte neu laden.";
      return;
    }
    elements.timeAccountProfileSave.disabled = true;
    elements.timeAccountProfileCancel.disabled = true;
    elements.timeAccountAdjustmentSubmit.disabled = true;
    elements.timeAccountProfileMessage.textContent =
      "Einstellungen werden sicher gespeichert …";
    try {
      await requestJson(
        `./api/v1/admin/time-accounts/${encodeURIComponent(account.employeeId)}/profile`,
        {
          method: "PATCH",
          body: JSON.stringify({
            year: account.year,
            enabled: elements.timeAccountProfileEnabled.checked,
            accountStartDate: elements.timeAccountProfileStart.value,
            annualVacationDays: Number(elements.timeAccountProfileVacation.value),
            profileRowVersion: account.profileRowVersion,
            vacationRowVersion: account.vacationRowVersion
          })
        }
      );
      closeTimeAccountEditor();
      showToast("Stundenkonto-Einstellungen gespeichert.");
      await Promise.all([refreshAdminTimeAccounts(), refreshTimeAccountData()]);
    } catch (error) {
      elements.timeAccountProfileMessage.textContent = error.message;
    } finally {
      elements.timeAccountProfileSave.disabled = false;
      elements.timeAccountProfileCancel.disabled = false;
      elements.timeAccountAdjustmentSubmit.disabled = !navigator.onLine;
    }
  });
  elements.timeAccountProfileCancel.addEventListener("click", closeTimeAccountEditor);
  elements.timeAccountAdjustmentSubmit.addEventListener("click", async () => {
    const account = timeAccountsState?.accounts.find(
      (item) => item.employeeId === editingTimeAccountId
    );
    const hours = Number(elements.timeAccountAdjustmentHours.value);
    const adjustmentMinutes = hours * 60;
    if (!account) {
      elements.timeAccountProfileMessage.textContent =
        "Das Stundenkonto wurde nicht gefunden. Bitte neu laden.";
      return;
    }
    if (
      !Number.isFinite(hours)
      || hours === 0
      || !Number.isSafeInteger(adjustmentMinutes)
      || !Number.isInteger(hours * 4)
    ) {
      elements.timeAccountProfileMessage.textContent =
        "Bitte Stunden in Viertelstunden eingeben, zum Beispiel 1,5 oder −0,75.";
      return;
    }
    if (
      !elements.timeAccountAdjustmentDate.value
      || elements.timeAccountAdjustmentDate.value > localDateKey()
    ) {
      elements.timeAccountProfileMessage.textContent =
        "Bitte ein heutiges oder vergangenes Buchungsdatum wählen.";
      return;
    }
    if (elements.timeAccountAdjustmentNote.value.trim().length < 3) {
      elements.timeAccountProfileMessage.textContent =
        "Bitte einen kurzen, nachvollziehbaren Korrekturgrund eingeben.";
      return;
    }
    elements.timeAccountAdjustmentSubmit.disabled = true;
    elements.timeAccountProfileSave.disabled = true;
    elements.timeAccountProfileMessage.textContent =
      "Korrektur wird unveränderlich gebucht …";
    try {
      await requestJson("./api/v1/admin/time-account-adjustments", {
        method: "POST",
        body: JSON.stringify({
          employeeId: account.employeeId,
          clientAdjustmentId: crypto.randomUUID(),
          adjustmentDate: elements.timeAccountAdjustmentDate.value,
          adjustmentMinutes,
          adjustmentType: elements.timeAccountAdjustmentType.value,
          note: elements.timeAccountAdjustmentNote.value
        })
      });
      elements.timeAccountAdjustmentHours.value = "";
      elements.timeAccountAdjustmentNote.value = "";
      elements.timeAccountProfileMessage.textContent = "";
      showToast("Korrektur gebucht · die Historie bleibt unverändert erhalten.");
      await Promise.all([refreshAdminTimeAccounts(), refreshTimeAccountData()]);
    } catch (error) {
      elements.timeAccountProfileMessage.textContent = error.message;
    } finally {
      elements.timeAccountAdjustmentSubmit.disabled = !navigator.onLine;
      elements.timeAccountProfileSave.disabled = false;
    }
  });

  elements.timeCorrectionPolicyForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const chosen = elements.timeCorrectionPolicyForm.querySelector(
      "input[name='time-correction-policy']:checked"
    );
    const reason = elements.timeCorrectionPolicyReason.value.trim();
    if (!chosen) {
      elements.timeCorrectionPolicyMessage.textContent = "Bitte eine Regel auswählen.";
      return;
    }
    if (reason.length < 3) {
      elements.timeCorrectionPolicyMessage.textContent =
        "Bitte kurz begründen, warum die Regel geändert wird.";
      return;
    }
    elements.timeCorrectionPolicySave.disabled = true;
    elements.timeCorrectionPolicyMessage.textContent = "Regel wird gespeichert …";
    try {
      const body = await requestJson("./api/v1/admin/time-correction-policy", {
        method: "PATCH",
        body: JSON.stringify({ policy: chosen.value, reason })
      });
      timeCorrectionPolicyState = body.timeCorrectionPolicy;
      elements.timeCorrectionPolicyMessage.textContent = "";
      elements.timeCorrectionPolicyReason.value = "";
      showToast(`Regel gespeichert · ${TIME_CORRECTION_POLICY_LABELS[body.timeCorrectionPolicy.policy]}`);
      renderTimeCorrectionPolicy();
    } catch (error) {
      elements.timeCorrectionPolicyMessage.textContent = error.message;
    } finally {
      elements.timeCorrectionPolicySave.disabled = !navigator.onLine;
    }
  });

  elements.adminYear.addEventListener("change", async () => {
    const chosen = Number(elements.adminYear.value);
    if (!Number.isInteger(chosen) || chosen === adminYear) return;
    adminYear = chosen;
    renderAdminTimeAccounts();
    await refreshAdminTimeAccounts();
  });

  elements.hoursOverviewYear.addEventListener("change", async () => {
    const chosen = Number(elements.hoursOverviewYear.value);
    if (!Number.isInteger(chosen) || chosen === adminYear) return;
    adminYear = chosen;
    renderAdminTimeAccounts();
    await refreshAdminTimeAccounts();
  });

  elements.hoursOverviewEmployee.addEventListener("change", renderHoursOverview);
  elements.hoursOverviewExport.addEventListener("click", () => {
    renderTimesheetExport();
    const employeeId = elements.hoursOverviewEmployee.value;
    if (employeeId !== "all" && [...elements.timesheetExportEmployee.options]
      .some((option) => option.value === employeeId)) {
      elements.timesheetExportEmployee.value = employeeId;
    }
    showAnalyticsSubarea("export");
    elements.timesheetExportPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    elements.timesheetExportFrom.focus({ preventScroll: true });
  });

  elements.holidayCalendarForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const requestedYear = adminYear;
    const calendar = timeAccountsState?.year === requestedYear
      ? timeAccountsState.holidayCalendar
      : null;
    if (!calendar) {
      elements.holidayCalendarMessage.textContent =
        "Der Feiertagskalender wurde nicht gefunden. Bitte neu laden.";
      return;
    }
    elements.holidayCalendarSave.disabled = true;
    elements.holidayClosureSubmit.disabled = true;
    elements.holidayCalendarMessage.textContent =
      "Feiertagskalender wird sicher gespeichert …";
    try {
      await requestJson("./api/v1/admin/holiday-calendar", {
        method: "PATCH",
        body: JSON.stringify({
          year: requestedYear,
          countryCode: elements.holidayCalendarCountry.value,
          federalStateCode: elements.holidayCalendarState.value,
          rowVersion: calendar.rowVersion
        })
      });
      elements.holidayCalendarMessage.textContent = "";
      showToast("Bundesland gespeichert · Jahreskonten wurden neu berechnet.");
      await Promise.all([refreshAdminTimeAccounts(), refreshTimeAccountData()]);
    } catch (error) {
      elements.holidayCalendarMessage.textContent = error.message;
    } finally {
      elements.holidayCalendarSave.disabled = !navigator.onLine;
      elements.holidayClosureSubmit.disabled = !navigator.onLine;
    }
  });

  elements.holidayClosureForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const requestedYear = String(adminYear);
    const holidayDate = elements.holidayClosureDate.value;
    const name = elements.holidayClosureName.value.trim();
    const note = elements.holidayClosureNote.value.trim();
    if (!holidayDate || !holidayDate.startsWith(`${requestedYear}-`)) {
      elements.holidayCalendarMessage.textContent =
        `Bitte ein Datum im angezeigten Jahr ${requestedYear} wählen.`;
      return;
    }
    if (name.length < 2) {
      elements.holidayCalendarMessage.textContent =
        "Bitte eine eindeutige Bezeichnung für den freien Tag eingeben.";
      return;
    }
    if (note.length < 3) {
      elements.holidayCalendarMessage.textContent =
        "Bitte die örtliche Regelung oder Betriebsvereinbarung als Grund angeben.";
      return;
    }
    elements.holidayClosureSubmit.disabled = true;
    elements.holidayCalendarSave.disabled = true;
    elements.holidayCalendarMessage.textContent =
      "Betrieblicher freier Tag wird nachvollziehbar gespeichert …";
    try {
      await requestJson("./api/v1/admin/holiday-calendar/closures", {
        method: "POST",
        body: JSON.stringify({
          clientClosureId: crypto.randomUUID(),
          holidayDate,
          name,
          note
        })
      });
      elements.holidayClosureName.value = "";
      elements.holidayClosureNote.value = "";
      elements.holidayCalendarMessage.textContent = "";
      showToast("Freier Tag ergänzt · das Tagessoll wird automatisch neu berechnet.");
      await Promise.all([refreshAdminTimeAccounts(), refreshTimeAccountData()]);
    } catch (error) {
      elements.holidayCalendarMessage.textContent = error.message;
    } finally {
      elements.holidayClosureSubmit.disabled = !navigator.onLine;
      elements.holidayCalendarSave.disabled = !navigator.onLine;
    }
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
        installerShortText: elements.projectShortText.value,
        projectManagerId: elements.projectManager.value || null
      },
      "Projekt angelegt · jetzt kann eine Baustelle hinzugefügt werden."
    );
    if (!saved) return;
    elements.projectForm.reset();
    await refreshAdmin();
  });

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
          projectManagerId: elements.projectEditManager.value || null,
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
  elements.siteProject.addEventListener("change", syncSiteProjectManager);
  elements.siteForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const projectScoped = Boolean(adminState?.projectScopeRestricted);
    const createsCustomer = !projectScoped && elements.siteCustomer.value === "__new__";
    const saved = await submitAdminForm(
      elements.siteForm,
      elements.siteMessage,
      "./api/v1/admin/construction-sites",
      {
        projectId: projectScoped ? elements.siteProject.value : null,
        customerId: createsCustomer || projectScoped ? null : elements.siteCustomer.value,
        customerName: createsCustomer ? elements.siteCustomerName.value : null,
        name: elements.siteName.value,
        installerShortText: elements.siteShortText.value,
        projectManagerId: projectScoped
          ? undefined
          : elements.siteProjectManager.value || null,
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
          projectManagerId: adminState.projectScopeRestricted
            ? undefined
            : elements.siteEditProjectManager.value || null,
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
  elements.documentNew.addEventListener("click", () => {
    const opening = elements.documentForm.hidden;
    elements.documentForm.hidden = !opening;
    elements.documentNew.textContent = opening ? "Formular schließen" : "＋ Hochladen";
    if (opening) {
      elements.documentTitle.focus({ preventScroll: true });
      elements.documentForm.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  });
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
          constructionSiteId: elements.documentSite.value,
          mobileVisible: elements.documentMobileVisible.checked,
          offlinePriority: elements.documentOfflinePriority.checked
        })
      });
      const reused = body.reused;
      documentFile = null;
      elements.documentFile.value = "";
      elements.documentForm.reset();
      elements.documentForm.hidden = true;
      elements.documentNew.textContent = "＋ Hochladen";
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
  elements.siteDashboardAddPhoto.addEventListener("click", () => {
    openDocumentUploadForSite();
    elements.documentCategory.value = "photo";
    elements.documentMobileVisible.checked = true;
    elements.documentOfflinePriority.checked = false;
    updateDocumentFileSelection();
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
    void artikelwahlVorbereiten(
      elements.siteMaterialItem, elements.siteMaterialItemLabel,
      elements.siteMaterialName, elements.siteMaterialUnit
    );
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
          note: elements.siteMaterialNote.value,
          stockItemId: elements.siteMaterialItem.value || null
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
  elements.siteReportDate.addEventListener("change", () => {
    renderSiteReportPersonnel();
    saveSiteReportDraft();
  });
  elements.siteReportForm.addEventListener("input", (event) => {
    if (event.target.matches("input[data-user-id]")) return;
    saveSiteReportDraft();
  });
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
        saveSiteReportDraft();
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
  elements.siteReportCancel.addEventListener("click", () => {
    resetSiteReportForm({ clearDraft: true });
  });
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
          photos: collectSiteReportPhotos(),
          sourceDocumentId
        })
      });
      clearSiteReportDraft(site.id, sourceMode);
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

  elements.reportReturnClose.addEventListener("click", closeReportReturnDialog);
  elements.reportReturnDialog.addEventListener("click", (event) => {
    if (event.target === elements.reportReturnDialog) closeReportReturnDialog();
  });
  elements.reportReturnDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeReportReturnDialog();
  });
  elements.reportReturnForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const report = adminState?.siteReports.find(
      (candidate) => candidate.id === returningReportId
    );
    const comment = elements.reportReturnComment.value.trim();
    if (!report) {
      elements.reportReturnMessage.textContent =
        "Der Bericht wurde nicht gefunden. Bitte die Ansicht aktualisieren.";
      return;
    }
    if (comment.length < 2) {
      elements.reportReturnMessage.textContent =
        "Bitte einen konkreten Hinweis für die Überarbeitung eingeben.";
      elements.reportReturnComment.focus();
      return;
    }
    elements.reportReturnSubmit.disabled = true;
    elements.reportReturnMessage.textContent =
      "Bericht wird mit nachvollziehbarer Historie zurückgegeben …";
    try {
      await requestJson(
        `./api/v1/admin/site-reports/${encodeURIComponent(report.id)}/return`,
        {
          method: "POST",
          body: JSON.stringify({ comment, rowVersion: report.rowVersion })
        }
      );
      closeReportReturnDialog();
      await refreshAdmin();
      showToast("Bericht zur Überarbeitung zurückgegeben.");
    } catch (error) {
      elements.reportReturnMessage.textContent = error.message;
      elements.reportReturnSubmit.disabled = false;
    }
  });

  elements.mobileReportType.addEventListener("change", () => {
    updateMobileReportTypeFields();
    saveMobileReportDraft();
  });
  elements.siteReportType.addEventListener("change", updateSiteReportTypeFields);
  elements.mobileReportForm.addEventListener("input", (event) => {
    if (event.target.matches("input[data-user-id]")) return;
    updateMobileReportCheck();
    saveMobileReportDraft();
  });
  elements.mobileReportForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const latest = lastEvent();
    const siteIndex = currentSiteIndex();
    const assignment = assignments[siteIndex];
    if (latest?.type !== "site_arrival" || !assignment?.reportResponsible) {
      elements.mobileReportMessage.textContent = "Der aktuelle Einsatz benötigt keinen Baustellenbericht.";
      return;
    }
    const leaveAfterSave = mobileReportLeavesSite;
    const existingReport = reportForAssignment(assignment);
    if (existingReport && existingReport.status !== "returned") {
      closeMobileReportForm();
      if (leaveAfterSave) addEntry("site_departure", siteIndex);
      else showToast("Der Bericht für diese Baustelle ist bereits gespeichert.");
      return;
    }
    if (existingReport?.status === "returned" && !navigator.onLine) {
      elements.mobileReportMessage.textContent =
        "Die Überarbeitung kann nach dem Wiederverbinden erneut eingereicht werden.";
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
    const reportPayload = {
      constructionSiteId: assignment.constructionSite.id,
      workDate: state.workDate,
      reportType: elements.mobileReportType.value,
      sourceMode: "digital",
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
      personnel
    };
    if (existingReport?.status === "returned") {
      elements.mobileReportSubmit.disabled = true;
      elements.mobileReportMessage.textContent =
        "Überarbeiteter Bericht wird erneut eingereicht …";
      try {
        const body = await requestJson(
          `./api/v1/site-reports/${encodeURIComponent(existingReport.id)}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              ...reportPayload,
              rowVersion: existingReport.rowVersion
            })
          }
        );
        assignment.mobileReport = {
          id: body.siteReport.id,
          number: body.siteReport.number,
          status: body.siteReport.status,
          rowVersion: body.siteReport.rowVersion,
          returnComment: body.siteReport.returnComment
        };
        if (employeeSiteState?.reports) {
          employeeSiteState.reports = employeeSiteState.reports.map((report) => (
            report.id === body.siteReport.id ? body.siteReport : report
          ));
        }
        state.reports = (state.reports || []).filter(
          (report) => report.id !== body.siteReport.id
        );
        state.reportDraft = null;
        saveState();
        closeMobileReportForm();
        if (leaveAfterSave) {
          addEntry("site_departure", siteIndex);
          showToast("Bericht erneut eingereicht · Baustelle wird abgeschlossen.");
        } else {
          render();
          showToast("Überarbeiteter Bericht erneut eingereicht.");
        }
      } catch (error) {
        if (error.status === 401) showLogin();
        else elements.mobileReportMessage.textContent = error.message;
      } finally {
        elements.mobileReportSubmit.disabled = false;
      }
      return;
    }
    const report = {
      clientReportId: createClientEntryId(),
      assignmentId: assignment.id,
      ...reportPayload,
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
    const employeeIds = [...new Set([
      elements.assignmentEmployee.value,
      ...selectedPlanningMemberIds(elements.assignmentMemberList)
    ].filter(Boolean))];
    const usesBatch = employeeIds.length > 1 || Boolean(elements.assignmentTeam.value);
    const common = {
      constructionSiteId: elements.assignmentSite.value,
      workDate: elements.assignmentDate.value,
      plannedStartTime: elements.assignmentTime.value,
      plannedDurationMinutes: durationHoursToMinutes(elements.assignmentDuration.value),
      comment: elements.assignmentComment.value
    };
    const saved = await submitAdminForm(
      elements.assignmentForm,
      elements.assignmentMessage,
      usesBatch
        ? "./api/v1/admin/assignment-batches"
        : "./api/v1/admin/assignments",
      usesBatch
        ? {
          ...common,
          employeeIds,
          planningTeamId: elements.assignmentTeam.value || null,
          reportResponsibleEmployeeId: elements.assignmentReportResponsible.checked
            ? elements.assignmentEmployee.value
            : null
        }
        : {
          ...common,
          employeeId: elements.assignmentEmployee.value,
          reportResponsible: elements.assignmentReportResponsible.checked
        },
      usesBatch
        ? `${employeeIds.length} individuelle Einsätze freigegeben.`
        : "Einsatz freigegeben · auf dem Mitarbeiter-Handy sichtbar."
    );
    if (!saved) return;
    elements.assignmentTeam.value = "";
    renderPlanningMemberPicker(elements.assignmentMemberList);
    elements.assignmentTime.value = "";
    elements.assignmentDuration.value = "";
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
      const assignment = planningAssignments().find(
        (candidate) => candidate.id === editingAssignmentId
      );
      if (!assignment) {
        throw new Error("Der Einsatz wurde nicht gefunden. Bitte neu laden.");
      }
      await requestJson(`./api/v1/admin/assignments/${encodeURIComponent(editingAssignmentId)}`, {
        method: "PATCH",
        body: JSON.stringify({
          employeeId: elements.assignmentEditEmployee.value,
          workDate: destinationDate,
          plannedStartTime: elements.assignmentEditTime.value,
          plannedDurationMinutes: durationHoursToMinutes(elements.assignmentEditDuration.value),
          comment: elements.assignmentEditComment.value,
          ...(assignment.reportResponsibilitySource === "automatic"
            ? {}
            : { reportResponsible: elements.assignmentEditReportResponsible.checked }),
          changeReason,
          rowVersion: assignment.rowVersion
        })
      });
      closeAssignmentEditor();
      showToast("Einsatz aktualisiert · Änderung ist historisch gespeichert.");
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
  elements.assignmentEditEmployee.addEventListener(
    "change",
    updateAssignmentEditResponsibilityControl
  );
  elements.assignmentEmployee.addEventListener("change", () => {
    updateAssignmentResponsibilityControl();
  });
  elements.assignmentTeam.addEventListener("change", () => {
    const team = (adminState?.planningTeams || []).find(
      (candidate) => candidate.id === elements.assignmentTeam.value
    );
    if (!team) {
      renderPlanningMemberPicker(elements.assignmentMemberList);
      return;
    }
    const memberIds = new Set(team.members.map((member) => member.userId));
    if (!memberIds.has(elements.assignmentEmployee.value)) {
      const foreman = fieldPlanningEmployees().find((employee) => (
        memberIds.has(employee.id) && employee.roles.includes("foreman")
      ));
      elements.assignmentEmployee.value = foreman?.id || team.members[0]?.userId || "";
    }
    renderPlanningMemberPicker(elements.assignmentMemberList, memberIds);
    updateAssignmentResponsibilityControl();
  });
  elements.planningTeamReset.addEventListener("click", resetPlanningTeamForm);
  elements.planningTeamForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const memberIds = selectedPlanningMemberIds(elements.planningTeamMemberList);
    if (memberIds.length === 0) {
      elements.planningTeamMessage.textContent =
        "Bitte mindestens ein Teammitglied auswählen.";
      return;
    }
    const team = (adminState?.planningTeams || []).find(
      (candidate) => candidate.id === elements.planningTeamId.value
    );
    const changeReason = elements.planningTeamReason.value.trim();
    if (team && changeReason.length < 3) {
      elements.planningTeamMessage.textContent =
        "Bitte die Änderung der Teamvorlage kurz begründen.";
      return;
    }
    elements.planningTeamSubmit.disabled = true;
    elements.planningTeamMessage.textContent = "Teamvorlage wird gespeichert …";
    try {
      await requestJson(
        team
          ? `./api/v1/admin/planning-teams/${encodeURIComponent(team.id)}`
          : "./api/v1/admin/planning-teams",
        {
          method: team ? "PATCH" : "POST",
          body: JSON.stringify(team
            ? {
              name: elements.planningTeamName.value,
              memberIds,
              status: "active",
              changeReason,
              rowVersion: team.rowVersion
            }
            : {
              name: elements.planningTeamName.value,
              memberIds
            })
        }
      );
      resetPlanningTeamForm();
      await refreshAdmin(adminState.date);
      showToast(team ? "Teamvorlage aktualisiert." : "Teamvorlage gespeichert.");
    } catch (error) {
      elements.planningTeamMessage.textContent = error.message;
    } finally {
      elements.planningTeamSubmit.disabled = false;
    }
  });
  [
    elements.planningBoardView,
    elements.planningBoardEmployee,
    elements.planningBoardTeam,
    elements.planningBoardSite,
    elements.planningBoardProjectManager,
    elements.planningBoardStatus
  ].forEach((control) => control.addEventListener("change", renderAdminWeek));
  elements.planningWeekTab.addEventListener("click", () => {
    elements.planningBoardView.value = "week";
    renderAdminWeek();
  });
  elements.planningMonthTab.addEventListener("click", () => {
    elements.planningBoardView.value = "month";
    renderAdminWeek();
  });
  elements.planningCurrent.addEventListener("click", () => {
    void refreshAdmin(localDateKey());
  });
  elements.planningPrint.addEventListener("click", () => window.print());
  elements.planningNewAssignment.addEventListener("click", () => {
    elements.assignmentPanel.open = true;
    elements.assignmentPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => elements.assignmentEmployee.focus({ preventScroll: true }), 250);
  });
  elements.adminWeekPrevious.addEventListener("click", () => {
    const date = adminState?.date || localDateKey();
    void refreshAdmin(elements.planningBoardView.value === "month"
      ? addIsoMonths(date, -1)
      : addIsoDays(adminState?.weekStart || date, -7));
  });
  elements.adminWeekNext.addEventListener("click", () => {
    const date = adminState?.date || localDateKey();
    void refreshAdmin(elements.planningBoardView.value === "month"
      ? addIsoMonths(date, 1)
      : addIsoDays(adminState?.weekStart || date, 7));
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

  function syncAbsenceDateFields() {
    const halfDay = elements.absenceDayPart.value !== "full_day";
    if (halfDay && elements.absenceStartDate.value) {
      elements.absenceEndDate.value = elements.absenceStartDate.value;
    } else if (
      elements.absenceStartDate.value
      && (!elements.absenceEndDate.value || elements.absenceEndDate.value < elements.absenceStartDate.value)
    ) {
      elements.absenceEndDate.value = elements.absenceStartDate.value;
    }
    elements.absenceEndDate.disabled = halfDay;
  }

  elements.absenceDayPart.addEventListener("change", syncAbsenceDateFields);
  elements.absenceStartDate.addEventListener("change", syncAbsenceDateFields);
  elements.absenceForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (demoMode) return;
    const startDate = elements.absenceStartDate.value;
    const endDate = elements.absenceDayPart.value === "full_day"
      ? elements.absenceEndDate.value
      : startDate;
    if (!startDate || !endDate || endDate < startDate) {
      elements.absenceMessage.textContent = "Bitte einen gültigen Zeitraum auswählen.";
      return;
    }
    elements.absenceSubmit.disabled = true;
    elements.absenceMessage.textContent = "Antrag wird sicher eingereicht …";
    try {
      await requestJson("./api/v1/absences", {
        method: "POST",
        body: JSON.stringify({
          absenceType: elements.absenceType.value,
          startDate,
          endDate,
          dayPart: elements.absenceDayPart.value,
          note: elements.absenceNote.value
        })
      });
      elements.absenceNote.value = "";
      elements.absenceMessage.textContent = "";
      showToast("Abwesenheit eingereicht · das Büro prüft zuerst.");
      await Promise.all([
        refreshAbsenceData(),
        refreshAdmin(),
        refreshTimeAccountData(),
        refreshAdminTimeAccounts()
      ]);
    } catch (error) {
      if (error.status === 401) showLogin();
      else elements.absenceMessage.textContent = error.message;
    } finally {
      elements.absenceSubmit.disabled = !navigator.onLine;
    }
  });

  elements.togglePassword.addEventListener("click", () => {
    const show = elements.passwordInput.type === "password";
    elements.passwordInput.type = show ? "text" : "password";
    elements.togglePassword.setAttribute("aria-label", show ? "Passwort verbergen" : "Passwort anzeigen");
  });

  elements.openPreview.addEventListener("click", showDashboard);
  // Unter "Mehr" stand fuer einen Monteur bisher nur ein Hinweistext. Wer
  // seine Personalnummer oder die Firma nachsehen wollte, fand sie nirgends,
  // und abmelden ging nur ueber das kleine Zeichen oben rechts.
  //
  // Sie gehoert unter "Mehr" und nirgendwo sonst. Ohne den Bereich in dieser
  // Bedingung stand sie nach jeder Anmeldung auch auf der Startseite: der
  // Bereichswechsel hatte sie richtig verborgen, das spaetere Zeichnen holte
  // sie wieder hervor.
  // Name und Rolle stehen am Rechner in der Kopfzeile - wie im Entwurf, und
  // nuetzlich auf einem Geraet, an dem mehrere Leute arbeiten.
  function renderTopbarUser() {
    const angemeldet = Boolean(session) && !demoMode;
    elements.topbarUserName.textContent = angemeldet
      ? `${session.user.firstName} ${session.user.lastName}`
      : "";
    elements.topbarUserRole.textContent = angemeldet
      ? employeeRoleLabel(session.user.roles)
      : "";
  }

  function renderAccountCard() {
    elements.accountCard.hidden = demoMode
      || !session
      || currentDashboardPane !== "more"
      || (canPlan() && currentSettingsSubarea !== "account");
    // Beschriftet wird sie trotzdem: der Bereichswechsel blendet sie ein, ohne
    // sie zu fuellen - sonst stuenden dort vier Striche.
    if (demoMode || !session) return;
    elements.accountName.textContent = `${session.user.firstName} ${session.user.lastName}`;
    elements.accountPersonnelNumber.textContent = session.user.personnelNumber;
    elements.accountCompany.textContent = `${session.company.displayName} · ${session.company.number}`;
    elements.accountRoles.textContent = employeeRoleLabel(session.user.roles);
  }

  elements.closePreview.addEventListener("click", async () => {
    if (demoMode) return showLogin();
    try {
      await requestJson("./api/v1/session", { method: "DELETE" });
      session = null;
      adminState = null;
      absenceState = [];
      timeAccountState = null;
      timeAccountsState = null;
      closeTimeAccountEditor();
      employeeSiteState = null;
      await removeOfflineDocumentCachesExcept();
      cachedUserId = null;
      assignments = [];
      state = initialState();
      window.localStorage.removeItem(ONLINE_STORAGE_KEY);
      showLogin();
    } catch (error) {
      showToast(error.message);
    }
  });
  elements.employeeEditRole.addEventListener("change", applyApprenticeFieldVisibility);
  elements.apprenticeSave.addEventListener("click", () => saveApprenticeReport(false));
  elements.apprenticeWithdraw.addEventListener("click", () => withdrawApprenticeReport());
  elements.apprenticeWeekRemark.addEventListener("input", renderApprenticeRemarkCount);
  // Die Vorschau in einem eigenen Fenster - am Handy gibt es keinen Platz
  // daneben, und manche wollen sie auch am Rechner gross sehen.
  elements.apprenticePreview.addEventListener("click", () => {
    // Die Fassung steht im Adressteil: dieses Blatt holt der Browser, nicht
    // die App - eine Kopfzeile kann sie ihm nicht mitgeben. Ohne die Angabe
    // stand im neuen Reiter die Meldung ueber das notwendige Update statt der
    // Vorschau.
    window.open(
      browserFileUrl(`./api/v1/apprentice/reports/${selectedWeekStart}/pdf?preview=true`),
      "_blank",
      "noopener"
    );
  });
  elements.apprenticePrint.addEventListener("click", () => printApprenticeReport(selectedWeekStart));
  elements.apprenticePrintBook.addEventListener(
    "click", () => printApprenticeYear(selectedWeekStart.slice(0, 4))
  );
  elements.apprenticeForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void saveApprenticeReport(true);
  });
  elements.apprenticeTodayOpen.addEventListener("click", () => {
    if (elements.apprenticeTodayOpen.dataset.action !== "week") {
      openApprenticeToday();
      return;
    }
    selectedWeekStart = currentWeekStart();
    elements.navApprentice.click();
  });
  elements.apprenticeTodayForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void saveApprenticeToday();
  });
  elements.apprenticeTodayClose.addEventListener("click", () => elements.apprenticeTodayDialog.close());
  elements.apprenticeTodayLater.addEventListener("click", () => elements.apprenticeTodayDialog.close());
  elements.apprenticeApproveAll.addEventListener("click", () => {
    const offene = (apprenticeReviewState || [])
      .filter((bericht) => bericht.status === "submitted")
      .map((bericht) => bericht.id);
    if (offene.length) void decideApprentice(offene, "approved");
  });
  elements.accountLogout.addEventListener("click", () => elements.closePreview.click());
  elements.primaryAction.addEventListener("click", handlePrimaryAction);
  elements.secondaryAction.addEventListener("click", () => endWorkday());
  // Ohne die eigene Funktion bekaeme openEmployeeSiteWorkspace das Klickereignis
  // als angeforderten Einsatz. Es ist wahr, hat aber keine Baustelle: die Akte
  // brach dann mit "Für heute ist keine Baustelle freigegeben" ab, obwohl ein
  // Einsatz vorlag.
  elements.assignmentDetails.addEventListener("click", () => openEmployeeSiteWorkspace());
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
  const fieldSiteValidation = [
    [elements.fieldSiteCustomer, elements.fieldSiteCustomerError, "Bitte einen Kunden auswählen."],
    [elements.fieldSiteCustomerName, elements.fieldSiteCustomerNameError, "Bitte den Namen des neuen Kunden eingeben."],
    [elements.fieldSiteName, elements.fieldSiteNameError, "Bitte einen Baustellennamen eingeben."],
    [elements.fieldSiteStreet, elements.fieldSiteStreetError, "Bitte die Straße eingeben."],
    [elements.fieldSiteHouseNumber, elements.fieldSiteHouseNumberError, "Bitte die Hausnummer eingeben."],
    [elements.fieldSitePostalCode, elements.fieldSitePostalCodeError, "Bitte die Postleitzahl eingeben."],
    [elements.fieldSiteCity, elements.fieldSiteCityError, "Bitte den Ort eingeben."]
  ];
  function validateFieldSiteForm() {
    const createsCustomer = elements.fieldSiteCustomer.value === "__new__";
    elements.fieldSiteCustomerName.required = createsCustomer;
    let firstInvalid = null;
    fieldSiteValidation.forEach(([control, error, message]) => {
      const isRelevant = control !== elements.fieldSiteCustomerName || createsCustomer;
      const invalid = isRelevant && !control.checkValidity();
      error.textContent = invalid ? message : "";
      control.setAttribute("aria-invalid", invalid ? "true" : "false");
      if (invalid && !firstInvalid) firstInvalid = control;
    });
    if (firstInvalid) {
      firstInvalid.focus({ preventScroll: true });
      firstInvalid.scrollIntoView({ behavior: "smooth", block: "center" });
      return false;
    }
    return true;
  }
  fieldSiteValidation.forEach(([control, error]) => {
    control.addEventListener("input", () => {
      error.textContent = "";
      control.setAttribute("aria-invalid", "false");
    });
  });
  elements.siteChoiceDialog.addEventListener("focusin", (event) => {
    if (!event.target.matches("input, select, textarea")) return;
    window.setTimeout(() => event.target.scrollIntoView({
      behavior: "smooth",
      block: "center"
    }), 120);
  });
  if (window.visualViewport) {
    const updateSiteChoiceViewport = () => {
      elements.siteChoiceDialog.style.setProperty(
        "--site-choice-viewport-height",
        `${Math.round(window.visualViewport.height)}px`
      );
    };
    window.visualViewport.addEventListener("resize", updateSiteChoiceViewport);
    window.visualViewport.addEventListener("scroll", updateSiteChoiceViewport);
    updateSiteChoiceViewport();
  }
  elements.fieldSiteForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (demoMode) {
      elements.siteChoiceMessage.textContent = "Neue Baustellen werden nur in der Online-App gespeichert.";
      return;
    }
    if (!validateFieldSiteForm()) {
      elements.siteChoiceMessage.textContent =
        "Bitte die markierten Felder prüfen. Deine Eingaben bleiben erhalten.";
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
  elements.employeeSiteSectionButtons.forEach((button) => {
    button.addEventListener("click", () => {
      showEmployeeSiteSection(button.dataset.employeeSiteSectionButton, true);
    });
  });
  [
    elements.employeeSiteReportSearch,
    elements.employeeSiteDocumentSearch,
    elements.employeeSitePhotoSearch
  ].forEach((control) => {
    control.addEventListener("input", () => {
      if (employeeSiteState) renderEmployeeSiteWorkspace(employeeSiteState);
    });
  });
  elements.employeeSiteVdeStart.addEventListener("click", () => {
    if (!employeeSiteState?.site?.id || !navigator.onLine) {
      showToast("Die VDE-Prüfung kann mit Verbindung gestartet werden.");
      return;
    }
    window.location.assign(
      vdeEditorUrl(
        employeeSiteState.site.id,
        null,
        employeeSiteState.date
      )
    );
  });
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
  elements.employeeSiteMaterialAdd.addEventListener("click", () => {
    if (!navigator.onLine) {
      showToast("F\u00fcr einen neuen Materialeintrag ist momentan eine Verbindung erforderlich.");
      return;
    }
    resetEmployeeSiteMaterialForm();
    elements.employeeSiteMaterialForm.hidden = false;
    elements.employeeSiteMaterialName.focus({ preventScroll: true });
    void artikelwahlVorbereiten(
      elements.employeeSiteMaterialItem, elements.employeeSiteMaterialItemLabel,
      elements.employeeSiteMaterialName, elements.employeeSiteMaterialUnit
    );
  });
  elements.employeeSiteMaterialCancel.addEventListener("click", resetEmployeeSiteMaterialForm);
  elements.employeeSiteMaterialForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void createEmployeeSiteMaterial();
  });
  // Der Bericht wird dort geschrieben, wo er schon immer geschrieben wurde -
  // auf der Feierabendkarte mit ihrer Pruefung und ihrem Entwurfsspeicher. Neu
  // ist nur der Weg dorthin: von der Baustelle aus, um die es geht. Bisher
  // musste man die Akte verlassen und sich erinnern, wo das Formular steckt.
  elements.employeeSiteReportWrite.addEventListener("click", () => {
    if (!navigator.onLine) {
      showToast("Ein Bericht kann geschrieben werden, sobald wieder eine Verbindung besteht.");
      return;
    }
    const assignment = assignments.find(
      (eintrag) => eintrag.constructionSite?.id === employeeSiteState?.site.id
    );
    if (!assignment) {
      showToast("F\u00fcr diese Baustelle ist heute kein Einsatz f\u00fcr dich eingeteilt.");
      return;
    }
    showDashboardPane("start");
    void openMobileReportForm(assignment, { leaveAfterSave: false });
  });
  elements.timeCorrectionForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!correctingTimeEntryId || !correctingTimeEntry) return;
    if (!navigator.onLine) {
      elements.timeCorrectionMessage.textContent =
        "Eine Korrektur kann gesendet werden, sobald wieder eine Verbindung besteht.";
      return;
    }
    const requestedRecordedAt = new Date(
      `${elements.timeCorrectionDate.value}T${elements.timeCorrectionAt.value}`
    );
    const reason = elements.timeCorrectionReason.value.trim();
    if (Number.isNaN(requestedRecordedAt.valueOf())) {
      elements.timeCorrectionMessage.textContent = "Bitte Datum und Uhrzeit vollständig eingeben.";
      return;
    }
    if (reason.length < 3) {
      elements.timeCorrectionMessage.textContent = "Bitte einen kurzen Korrekturgrund eingeben.";
      return;
    }
    const breakValue = elements.timeCorrectionBreak.value;
    const displayedBreak = correctingTimeEntry.breakMinutes;
    let breakMinutes;
    if (breakValue === "") {
      breakMinutes = correctingTimeEntry.breakMinutesOverride === null
        || correctingTimeEntry.breakMinutesOverride === undefined
        ? undefined
        : null;
    } else if (Number(breakValue) !== Number(displayedBreak)) {
      breakMinutes = Number(breakValue);
    }
    elements.timeCorrectionSubmit.disabled = true;
    elements.timeCorrectionCancel.disabled = true;
    elements.timeCorrectionMessage.textContent = "Änderung wird geprüft und neu berechnet …";
    try {
      const result = await requestJson(
        `./api/v1/${correctingTimeEntryAdministrator ? "admin/" : ""}time-entries/${
          encodeURIComponent(correctingTimeEntryId)
        }`,
        {
        method: "PATCH",
        body: JSON.stringify({
          clientChangeId: createClientEntryId(),
          expectedRecordedAt: correctingTimeEntry.recordedAt,
          recordedAt: requestedRecordedAt.toISOString(),
          workDate: elements.timeCorrectionDate.value,
          constructionSiteId: elements.timeCorrectionSiteField.hidden
            ? null
            : elements.timeCorrectionSite.value,
          activityNote: elements.timeCorrectionActivity.value.trim() || null,
          travelMinutes: elements.timeCorrectionTravelField.hidden
            ? undefined
            : elements.timeCorrectionTravel.value === ""
              ? null
              : Number(elements.timeCorrectionTravel.value),
          breakMinutes,
          reason
        })
      });
      closeTimeCorrectionForm();
      await Promise.all([refreshLiveData(), refreshWeekData(), refreshAdmin()]);
      showToast(
        result.operation?.status === "pending"
          ? "Kontrollierte Korrektur eingereicht · der bisherige Stand bleibt bis zur Freigabe erhalten."
          : "Zeiteintrag gespeichert · Arbeitszeit und Zeitkonto wurden neu berechnet."
      );
    } catch (error) {
      if (error.status === 401) showLogin();
      else elements.timeCorrectionMessage.textContent = error.message;
    } finally {
      elements.timeCorrectionSubmit.disabled = false;
      elements.timeCorrectionCancel.disabled = false;
    }
  });
  elements.timeInvalidationSubmit.addEventListener("click", async () => {
    if (!correctingTimeEntryId || !correctingTimeEntry) return;
    const reason = elements.timeCorrectionReason.value.trim();
    if (reason.length < 3) {
      elements.timeCorrectionMessage.textContent =
        "Bitte zuerst einen kurzen Löschgrund eingeben.";
      return;
    }
    if (!window.confirm(
      "Vollständigen Arbeitsblock löschen? Die Buchungen verschwinden aus der Arbeitszeit, bleiben aber unveränderbar im Audit erhalten."
    )) return;
    elements.timeCorrectionSubmit.disabled = true;
    elements.timeInvalidationSubmit.disabled = true;
    elements.timeCorrectionCancel.disabled = true;
    elements.timeCorrectionMessage.textContent = "Arbeitsblock wird sicher entfernt …";
    try {
      const result = await requestJson(
        `./api/v1/${correctingTimeEntryAdministrator ? "admin/" : ""}time-entries/${
          encodeURIComponent(correctingTimeEntryId)
        }`,
        {
        method: "DELETE",
        body: JSON.stringify({
          clientChangeId: createClientEntryId(),
          expectedRecordedAt: correctingTimeEntry.recordedAt,
          reason
        })
      });
      closeTimeCorrectionForm();
      await Promise.all([refreshLiveData(), refreshWeekData(), refreshAdmin()]);
      showToast(
        result.operation?.status === "pending"
          ? "Löschung zur kontrollierten Freigabe eingereicht."
          : "Arbeitsblock gelöscht · alle Summen wurden neu berechnet."
      );
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
  elements.timeCorrectionDate.addEventListener("change", () => {
    if (correctingTimeEntry && !elements.timeCorrectionSiteField.hidden) {
      void populateTimeCorrectionSites(
        elements.timeCorrectionDate.value,
        correctingTimeEntry.constructionSiteId
      );
    }
  });
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
  elements.navTime.addEventListener("click", () => {
    showDashboardPane("time");
    void refreshLiveData();
  });
  elements.navWeek.addEventListener("click", () => {
    showDashboardPane("week");
    void Promise.all([refreshWeekData(), refreshAbsenceData()]);
  });
  elements.navMobilePlanning.addEventListener("click", () => {
    openNavigationGroup("planning");
  });
  elements.navMobileDocumentation.addEventListener("click", () => {
    openNavigationGroup("documentation");
  });
  elements.navMobileBusiness.addEventListener("click", () => {
    openNavigationGroup("business");
  });
  elements.sidebarToggle.addEventListener("click", () => {
    setSidebarCollapsed(
      !elements.dashboardView.classList.contains("sidebar-collapsed"),
      true
    );
  });
  document.querySelectorAll("[data-open-week-view]").forEach((button) => {
    button.addEventListener("click", () => {
      currentWeekSubarea = button.dataset.openWeekView;
      elements.navWeek.click();
    });
  });
  elements.weekViewButtons.forEach((button) => {
    button.addEventListener("click", () => showWeekSubarea(button.dataset.weekViewButton));
  });
  elements.settingsViewButtons.forEach((button) => {
    button.addEventListener("click", () => showSettingsSubarea(button.dataset.settingsView));
  });
  elements.analyticsViewButtons.forEach((button) => {
    button.addEventListener("click", () => showAnalyticsSubarea(button.dataset.analyticsView));
  });
  document.querySelectorAll("a.page-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      tab.closest(".page-tabs")?.querySelectorAll(".page-tab").forEach((candidate) => {
        candidate.classList.toggle("page-tab--active", candidate === tab);
      });
      if (tab.hasAttribute("data-open-report-more")) {
        const more = tab.closest("form")?.querySelector(".mobile-report-more");
        if (more) more.open = true;
      }
    });
  });
  // Derselbe Weg wie ueber die Leiste - die Uebersicht zeigt die Zahl, der
  // Wochenbereich schluesselt sie auf.
  elements.overviewAccountLink.addEventListener("click", () => {
    currentWeekSubarea = "account";
    elements.navWeek.click();
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
  // Der Berichtsheft-Bereich teilt sich die angezeigte Woche mit dem
  // Stundenzettel: zwei getrennte Wochen in einer App waeren fuer niemanden
  // nachvollziehbar.
  elements.navApprentice.addEventListener("click", () => {
    showDashboardPane("apprentice");
    void Promise.all([refreshWeekData(), refreshApprenticeReviews()]);
  });
  elements.apprenticePrevious.addEventListener("click", () => {
    void selectWeek(addIsoDays(selectedWeekStart, -7));
  });
  elements.apprenticeCurrent.addEventListener("click", () => {
    void selectWeek(currentWeekStart());
  });
  elements.apprenticeNext.addEventListener("click", () => {
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
  elements.navReports.addEventListener("click", () => showDashboardPane("reports"));
  elements.navEmployees.addEventListener("click", () => showDashboardPane("employees"));
  elements.navCustomers.addEventListener("click", () => showDashboardPane("customers"));
  elements.navDocuments.addEventListener("click", () => showDashboardPane("documents"));
  elements.navAnalytics.addEventListener("click", () => {
    showDashboardPane("analytics");
    void refreshAdminTimeAccounts();
  });
  elements.navVehicles.addEventListener("click", () => {
    showDashboardPane("vehicles");
    void refreshVehicles();
  });
  elements.navDevices.addEventListener("click", () => {
    showDashboardPane("devices");
    void deviceModule.refresh();
  });
  elements.navStock.addEventListener("click", () => {
    showDashboardPane("stock");
    void stockModule.refresh();
  });
  elements.vehicleSearchField.addEventListener("input", renderVehicleList);
  elements.vehicleNew.addEventListener("click", () => openVehicleEditor(null));
  elements.vehicleCancel.addEventListener("click", closeVehicleEditor);
  elements.vehicleForm.addEventListener("submit", async (ereignis) => {
    ereignis.preventDefault();
    const koerper = {
      licencePlate: elements.vehiclePlate.value,
      label: elements.vehicleLabel.value,
      vehicleType: elements.vehicleType.value,
      requiredLicenceClass: elements.vehicleLicenceClass.value,
      assignedUserId: elements.vehicleDriver.value || null,
      status: elements.vehicleStatus.value,
      nextInspectionOn: elements.vehicleInspection.value || null,
      nextServiceOn: elements.vehicleService.value || null,
      note: elements.vehicleNote.value
    };
    elements.vehicleSave.disabled = true;
    elements.vehicleMessage.textContent = "Wird gespeichert …";
    try {
      if (editingVehicleId) {
        await requestJson(`./api/v1/admin/vehicles/${encodeURIComponent(editingVehicleId)}`, {
          method: "PATCH",
          body: JSON.stringify({ ...koerper, rowVersion: editingVehicleRowVersion })
        });
        showToast("Fahrzeug aktualisiert.");
      } else {
        await requestJson("./api/v1/admin/vehicles", {
          method: "POST",
          body: JSON.stringify(koerper)
        });
        showToast("Fahrzeug angelegt.");
      }
      closeVehicleEditor();
      await refreshVehicles();
    } catch (error) {
      elements.vehicleMessage.textContent = error.message;
    } finally {
      elements.vehicleSave.disabled = false;
    }
  });
  elements.navInspections.addEventListener("click", () => showDashboardPane("inspections"));
  elements.navMore.addEventListener("click", () => {
    showDashboardPane("more");
  });
  // Neu laden heisst hier: die alten Dateien wegwerfen und den Dienst-Worker
  // erneuern. Ein blosses location.reload() holte bei einer eingerichteten App
  // wieder dieselben Dateien aus dem Speicher.
  elements.updateBannerReload.addEventListener("click", async () => {
    elements.updateBannerReload.disabled = true;
    await verwerfeAbgelegteDateien();
    window.location.reload();
  });

  elements.dashboardLoadingRetry.addEventListener("click", () => {
    elements.dashboardLoadingRetry.hidden = true;
    void refreshAdmin();
  });

  elements.globalSearch.addEventListener("input", renderSearchResults);
  elements.globalSearch.addEventListener("keydown", (ereignis) => {
    if (ereignis.key === "Escape") closeSearch();
  });
  // Ein Klick daneben schliesst die Trefferliste. Ohne das bliebe sie stehen,
  // bis jemand etwas anderes tippt.
  document.addEventListener("click", (ereignis) => {
    if (!elements.topbarSearch.contains(ereignis.target)) {
      elements.globalSearchResults.hidden = true;
      elements.globalSearch.setAttribute("aria-expanded", "false");
    }
  });
  elements.customerSearchField.addEventListener("input", renderCustomerOverview);
  elements.inspectionSearchField.addEventListener("input", renderInspectionOverview);
  elements.inspectionSiteFilter.addEventListener("change", renderInspectionOverview);
  elements.inspectionStatusFilter.addEventListener("change", renderInspectionOverview);
  elements.inspectionActiveTab.addEventListener("click", () => {
    elements.inspectionStatusFilter.value = "draft";
    renderInspectionOverview();
  });
  elements.inspectionArchiveTab.addEventListener("click", () => {
    elements.inspectionStatusFilter.value = "completed";
    renderInspectionOverview();
  });
  elements.inspectionNew.addEventListener("click", () => {
    const siteId = elements.inspectionSiteFilter.value;
    const site = adminState?.sites.find((item) => item.id === siteId);
    if (!site || siteStatusGroup(site.status) !== "active") {
      elements.inspectionSiteFilter.focus();
      try {
        elements.inspectionSiteFilter.showPicker?.();
      } catch {
        // Einige Browser erlauben showPicker nur bei unmittelbar sichtbaren
        // Selects. Der Fokus und der Hinweis bleiben dann der sichere Fallback.
      }
      showToast("Bitte zuerst die Baustelle für das neue Prüfprotokoll wählen.");
      return;
    }
    window.location.assign(vdeEditorUrl(site.id, null, adminState?.date));
  });
  elements.customerNew.addEventListener("click", () => {
    elements.customerPanel.hidden = false;
    elements.customerPanel.open = true;
    elements.customerPanel.scrollIntoView({ behavior: "smooth", block: "start" });
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
  elements.siteDashboardSectionButtons.forEach((button) => {
    button.addEventListener("click", () => {
      showSiteDashboardSection(button.dataset.siteDashboardSectionButton, true);
    });
  });
  elements.siteDashboardCopyLink.addEventListener("click", openSiteQrDialog);
  elements.siteQrCopy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(elements.siteQrLink.value);
      showToast("Berechtigungsgeprüfter Baustellenlink kopiert.");
    } catch {
      elements.siteQrLink.select();
      window.prompt("Baustellenlink kopieren:", elements.siteQrLink.value);
    }
  });
  elements.siteQrClose.addEventListener("click", closeSiteQrDialog);
  elements.siteQrDialog.addEventListener("click", (event) => {
    if (event.target === elements.siteQrDialog) closeSiteQrDialog();
  });
  elements.siteQrDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeSiteQrDialog();
  });
  elements.siteDashboardReportSearch.addEventListener("input", () => {
    if (openedSiteId) renderSiteReports(openedSiteId);
  });
  elements.siteDashboardDocumentSearch.addEventListener("input", () => {
    if (openedSiteId) renderSiteDocuments(openedSiteId);
  });
  elements.siteDashboardPhotoSearch.addEventListener("input", () => {
    if (openedSiteId) renderSitePhotos(openedSiteId);
  });
  elements.siteDashboardPlanAssignment.addEventListener("click", openAssignmentPlanningForSite);
  elements.siteDashboardCreateReport.addEventListener("click", openReportForSite);
  elements.siteDashboardAddDocumentShortcut.addEventListener("click", openDocumentsForSite);
  elements.siteDashboardCreateTask.addEventListener("click", openTaskForSite);
  elements.siteDashboardVdeStart.addEventListener("click", () => {
    if (!openedSiteId) return;
    window.location.assign(
      vdeEditorUrl(openedSiteId, null, adminState?.date)
    );
  });
  elements.siteDashboardEdit.addEventListener("click", openSiteEditor);
  elements.siteEditCancel.addEventListener("click", () => {
    elements.siteEditForm.hidden = true;
    elements.siteDashboardEdit.hidden = false;
    elements.siteEditMessage.textContent = "";
  });
  elements.hierarchySearch.addEventListener("input", renderBusinessHierarchy);
  elements.hierarchyStatusFilter.addEventListener("change", renderBusinessHierarchy);
  elements.siteActiveTab.addEventListener("click", () => {
    elements.hierarchyStatusFilter.value = "active";
    renderBusinessHierarchy();
  });
  elements.siteArchivedTab.addEventListener("click", () => {
    elements.hierarchyStatusFilter.value = "archived";
    renderBusinessHierarchy();
  });
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

  [
    elements.reportCenterStatus,
    elements.reportCenterType,
    elements.reportCenterSite,
    elements.reportCenterEmployee,
    elements.reportCenterFrom,
    elements.reportCenterTo,
    elements.reportCenterSort
  ].forEach((control) => control.addEventListener("change", renderReportCenter));
  elements.reportCenterSearch.addEventListener("input", renderReportCenter);

  elements.absenceStartDate.value = localDateKey();
  elements.absenceEndDate.value = localDateKey();
  syncAbsenceDateFields();
  elements.todayLabel.textContent = dashboardDateFormatter.format(new Date());
  fillLicenceField(elements.employeeLicences, []);
  fillLicenceField(elements.employeeEditLicences, []);
  deviceCompany = loadRememberedCompany();
  if (deviceCompany?.number) {
    elements.companyNumber.value = normalizeCompanyNumber(deviceCompany.number);
    applyLoginCompanyIdentity();
  }
  configureModeCopy();
  updateConnectionState();
  render();
  if (pendingCarryOverNotice) {
    showToast(pendingCarryOverNotice);
    pendingCarryOverNotice = null;
  }
  window.setInterval(renderTimes, 15000);
  // Freigegebene Bereiche nachholen: beim Zurueckkommen in die App, beim
  // Wiederfinden der Verbindung und alle fuenf Minuten. Wer in der
  // Plattformverwaltung etwas freischaltet, sieht es sonst erst nach einem
  // vollstaendigen Neuladen - auf dem Telefon also praktisch nie.
  window.setInterval(() => void refreshModuleAccess(), 300000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void refreshModuleAccess();
  });
  window.addEventListener("online", () => {
    updateConnectionState();
    void syncPendingEntries();
    void refreshLiveData();
    void refreshAbsenceData();
    void refreshModuleAccess();
  });
  window.addEventListener("offline", updateConnectionState);
  window.addEventListener("resize", applyPlanningBoardWidths);

  // Zuerst die eigene Fassung pruefen. Steht hier eine andere Datei als die
  // angeforderte, ist alles Weitere Rateraten: die App raeumt auf und laedt
  // neu, statt halb zu laufen.
  void (async () => {
    if (await pruefeEigeneFassung()) return;
    if (!demoMode) void initialiseOnline();
  })();

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
