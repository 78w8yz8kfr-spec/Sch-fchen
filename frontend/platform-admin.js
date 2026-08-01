(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const elements = {
    auth: $("#platform-auth"), shell: $("#platform-shell"), authMessage: $("#platform-auth-message"),
    loginForm: $("#platform-login-form"), loginEmail: $("#platform-login-email"), loginPassword: $("#platform-login-password"),
    setupForm: $("#platform-setup-form"), setupFirstName: $("#platform-setup-first-name"), setupLastName: $("#platform-setup-last-name"),
    setupEmail: $("#platform-setup-email"), setupPassword: $("#platform-setup-password"), setupToken: $("#platform-setup-token"),
    navigation: $("#platform-navigation"), userName: $("#platform-user-name"), userRoles: $("#platform-user-roles"), logout: $("#platform-logout"),
    menuToggle: $("#platform-menu-toggle"), title: $("#platform-view-title"), refresh: $("#platform-refresh"),
    overview: $("#platform-overview"), metrics: $("#platform-metrics"), resource: $("#platform-resource"),
    toolbar: $("#platform-toolbar"), search: $("#platform-search"), filter: $("#platform-filter"), create: $("#platform-create"),
    resourceSummary: $("#platform-resource-summary"), tableWrap: $("#platform-table-wrap"), pagination: $("#platform-pagination"),
    pagePrevious: $("#platform-page-previous"), pageNext: $("#platform-page-next"), pageLabel: $("#platform-page-label"),
    message: $("#platform-message"), supportBanner: $("#support-mode-banner"), supportCompany: $("#support-mode-company"),
    supportReason: $("#support-mode-reason"), supportEnd: $("#support-mode-end"),
    companyDialog: $("#company-dialog"), companyForm: $("#company-form"), companyDialogTitle: $("#company-dialog-title"),
    companyActivity: $("#company-activity"),
    companyDialogClose: $("#company-dialog-close"), companyId: $("#company-id"), companyRowVersion: $("#company-row-version"),
    companyLegalName: $("#company-legal-name"), companyDisplayName: $("#company-display-name"), companyContactName: $("#company-contact-name"),
    companyContactEmail: $("#company-contact-email"), companyStatus: $("#company-status"), companyLicensePlan: $("#company-license-plan"),
    companyPhone: $("#company-phone"), companyStreet: $("#company-street"), companyHouseNumber: $("#company-house-number"),
    companyPostalCode: $("#company-postal-code"), companyCity: $("#company-city"),
    companyUserLimit: $("#company-user-limit"), companyStorageLimit: $("#company-storage-limit"), companyTrialEnds: $("#company-trial-ends"),
    companyLicenseValidUntil: $("#company-license-valid-until"), companyContractEnds: $("#company-contract-ends"),
    companyCancellationRecorded: $("#company-cancellation-recorded"), companyDeletionScheduled: $("#company-deletion-scheduled"),
    companyReason: $("#company-reason"), companyModules: $("#company-modules"),
    companyModuleList: $("#company-module-list"), companySupportAccess: $("#company-support-access"), supportAccessReason: $("#support-access-reason"),
    companyContract: $("#company-contract"), companyContractVersion: $("#company-contract-version"),
    companyContractStatus: $("#company-contract-status"), companyContractCycle: $("#company-contract-cycle"),
    companyContractDiscount: $("#company-contract-discount"), companyContractTerms: $("#company-contract-terms"),
    companyContractStarts: $("#company-contract-starts"), companyContractNewEnds: $("#company-contract-new-ends"),
    companyContractTrialEnds: $("#company-contract-trial-ends"), companyContractGoodwill: $("#company-contract-goodwill"),
    companyContractMonthlyPrice: $("#company-contract-monthly-price"), companyContractAnnualPrice: $("#company-contract-annual-price"),
    companyContractUserLimit: $("#company-contract-user-limit"), companyContractStorageLimit: $("#company-contract-storage-limit"),
    companyContractNoticeDays: $("#company-contract-notice-days"), companyContractMinimumTerm: $("#company-contract-minimum-term"),
    companyContractModules: $("#company-contract-modules"),
    companyContractAssign: $("#company-contract-assign"),
    supportAccessTicket: $("#support-access-ticket"), supportAccessDetail: $("#support-access-detail"), supportAccessStart: $("#support-access-start"),
    companySupportCases: $("#company-support-cases"), companyDialogMessage: $("#company-dialog-message"), actionDialog: $("#platform-action-dialog"), actionForm: $("#platform-action-form"),
    actionTitle: $("#platform-action-title"), actionClose: $("#platform-action-close"), actionFields: $("#platform-action-fields"),
    actionReason: $("#platform-action-reason"), actionMessage: $("#platform-action-message")
  };

  const companyStatuses = [
    ["trial", "Testphase"], ["active", "Aktiv"], ["payment_due", "Zahlung offen"],
    ["restricted", "Eingeschränkt"], ["suspended", "Gesperrt"], ["cancelled", "Gekündigt"],
    ["archived", "Archiviert"], ["pending_deletion", "Zur Löschung vorgemerkt"]
  ];
  const statusLabel = new Map(companyStatuses);
  const supportReasons = [
    ["support_request", "Supportanfrage"], ["technical_analysis", "Technische Fehleranalyse"],
    ["setup", "Einrichtung"], ["data_correction", "Datenkorrektur"], ["migration", "Migration"], ["restore", "Wiederherstellung"]
  ];
  const viewTitles = {
    overview: "Übersicht", companies: "Firmen", accounts: "Benutzer", plans: "Lizenzen und Tarife",
    modules: "Module", support: "Support", health: "Systemstatus", errors: "Fehler", versions: "Versionen",
    announcements: "Mitteilungen", backups: "Backups", privacy: "Datenschutz", audit: "Audit-Log", settings: "Einstellungen"
  };
  const permissionByView = {
    overview: "dashboard.read", companies: "companies.read", accounts: "accounts.read", plans: "companies.read",
    modules: "companies.read", support: "support.manage", health: "health.manage", errors: "errors.manage",
    versions: "versions.manage", announcements: "announcements.manage", backups: "backups.manage",
    privacy: "privacy.manage", audit: "audit.read", settings: "settings.manage"
  };
  const resources = {
    accounts: {
      endpoint: "accounts", root: "accounts", paginated: true,
      columns: [["Name", "name"], ["Firma", "companyName"], ["Rolle", "companyRoles"], ["Status", "status"], ["Einladung offen", "invitationPending"], ["2FA", "twoFactorEnabled"], ["Duplikate", "duplicateAccountCount"], ["Fehlversuche", "failedLoginAttempts"], ["Gesperrt bis", "lockedUntil"], ["Letzter Login", "lastLoginAt"], ["Sitzungen", "activeSessionCount"]],
      create: "platform_account", filters: [["", "Alle Status"], ["active", "Aktiv"], ["inactive", "Deaktiviert"], ["archived", "Archiviert"]]
    },
    plans: { endpoint: "plans", root: "plans", columns: [["Tarif", "name"], ["Schlüssel", "planKey"], ["Status", "status"], ["Preisstände", "versions"]], create: "plan", action: "plan_manage" },
    modules: { endpoint: "modules", root: "modules", columns: [["Modul", "name"], ["Schlüssel", "moduleKey"], ["Kategorie", "category"], ["Spezialmodul", "isSpecial"], ["Status", "status"]] },
    support: { endpoint: "support/tickets", root: "tickets", columns: [["Ticket", "ticketNumber"], ["Betreff", "subject"], ["Firma", "companyName"], ["Kontakt", "contactName"], ["Priorität", "priority"], ["Zuständig", "assigneeName"], ["Status", "status"], ["Aktualisiert", "updatedAt"]], create: "support", action: "support_edit", filters: [["", "Alle Status"], ["new", "Neu"], ["assigned", "Zugewiesen"], ["in_progress", "In Bearbeitung"], ["question", "Rückfrage"], ["waiting_customer", "Wartet auf Kunde"], ["resolved", "Gelöst"], ["closed", "Geschlossen"]] },
    health: { endpoint: "health", root: "components", columns: [["Komponente", "name"], ["Status", "status"], ["Letzter Erfolg", "lastSuccessAt"], ["Letzter Fehler", "lastErrorAt"], ["Fehlerhäufigkeit", "errorCount24h"]], action: "health_edit", filters: [["", "Alle Status"], ["available", "Verfügbar"], ["degraded", "Eingeschränkt"], ["outage", "Gestört"]] },
    errors: {
      endpoint: "errors", root: "errors",
      columns: [["Fehlercode", "errorCode"], ["Modul", "module"], ["Version", "applicationVersion"], ["Schwere", "severity"], ["Häufigkeit", "occurrenceCount"], ["Erster Auftritt", "firstSeenAt"], ["Letzter Auftritt", "lastSeenAt"], ["Firma", "latestCompanyId"], ["Gerät", "latestDeviceClass"], ["Browser", "latestBrowser"], ["Betriebssystem", "latestOperatingSystem"], ["Status", "status"]],
      action: "error_edit",
      filters: [["", "Alle Fehler"], ["critical", "Kritisch"], ["new", "Neu"], ["frequent", "Häufig"], ["reopened", "Wieder aufgetreten"], ["resolved", "Gelöst"]],
      filter: (item, value) => value === "critical" ? item.severity === "critical"
        : value === "frequent" ? Number(item.occurrenceCount) >= 5 : item.status === value
    },
    versions: { endpoint: "versions", root: "versions", columns: [["Version", "version"], ["Status", "releaseStatus"], ["Veröffentlicht", "releasedAt"], ["Rollout", "rolloutPercent"], ["Pflichtupdate", "mandatoryUpdate"], ["Bekannte Fehler", "knownIssues"]], create: "version", action: "version_edit", filterKey: "releaseStatus", filters: [["", "Alle Status"], ["draft", "Entwurf"], ["rolling_out", "Rollout"], ["production", "Produktion"], ["withdrawn", "Zurückgezogen"], ["superseded", "Abgelöst"]] },
    announcements: { endpoint: "announcements", root: "announcements", columns: [["Titel", "title"], ["Art", "announcementType"], ["Status", "status"], ["Veröffentlichung", "publishAt"], ["Ablauf", "expiresAt"]], create: "announcement", action: "announcement_edit", filters: [["", "Alle Status"], ["draft", "Entwurf"], ["scheduled", "Geplant"], ["published", "Veröffentlicht"], ["disabled", "Deaktiviert"]] },
    backups: { endpoint: "backups", root: "backups", columns: [["Art", "backupType"], ["Status", "status"], ["Angefordert", "requestedAt"], ["Abgeschlossen", "completedAt"], ["Integrität", "integrityStatus"], ["Speicherort", "storageLocation"]], create: "backup", action: "backup_restore", filters: [["", "Alle Status"], ["queued", "Wartet"], ["running", "Läuft"], ["success", "Erfolgreich"], ["failed", "Fehlgeschlagen"]] },
    privacy: { endpoint: "privacy", root: "requests", columns: [["Anfrage", "requestType"], ["Firma", "companyId"], ["Benutzer", "userId"], ["Status", "status"], ["Wiederherstellungsfrist", "recoveryDeadline"], ["Erstellt", "createdAt"]], create: "privacy", action: "privacy_advance", filters: [["", "Alle Status"], ["recorded", "Erfasst"], ["retention_review", "Aufbewahrung prüfen"], ["deactivated", "Deaktiviert"], ["archived", "Archiviert"], ["recovery_period", "Wiederherstellungsfrist"], ["confirmed", "Bestätigt"], ["processing", "In Bearbeitung"], ["completed", "Abgeschlossen"], ["rejected", "Abgelehnt"]] },
    audit: { endpoint: "audit", root: "audit", columns: [["Zeitpunkt", "occurredAt"], ["Aktion", "action"], ["Ziel", "targetType"], ["Firma", "companyId"], ["Begründung", "reason"], ["Ergebnis", "result"]], filters: [["", "Alle Ergebnisse"], ["success", "Erfolgreich"], ["denied", "Abgewiesen"], ["failed", "Fehlgeschlagen"], ["cancelled", "Abgebrochen"]], filterKey: "result" },
    settings: { endpoint: "settings", root: "settings", columns: [["Einstellung", "settingKey"], ["Wert", "value"], ["Beschreibung", "description"], ["Geändert", "updatedAt"]] }
  };

  let session = null;
  let currentView = "overview";
  let currentPage = 1;
  let currentCompany = null;
  let actionContext = null;
  let searchTimer = null;
  let supportMode = null;
  let supportExpiryTimer = null;
  let companySort = "name";
  let companyDirection = "asc";
  let platformRoles = [];

  function can(permission) {
    const permissions = session?.platformUser?.permissions || [];
    return permissions.includes("*") || permissions.includes(permission);
  }

  async function request(path, options = {}) {
    const headers = {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      "X-Schaefchen-Version": "0.42.0",
      ...(supportMode?.id ? { "X-Support-Access-Id": supportMode.id } : {}),
      ...(options.headers || {})
    };
    const response = await fetch(`./api/v1/platform/${path}`, {
      credentials: "same-origin",
      ...options,
      headers
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(body.error?.message || "Die Plattformaktion ist fehlgeschlagen.");
      error.status = response.status;
      error.code = body.error?.code;
      if (error.code === "support_access_inactive") clearSupportMode();
      throw error;
    }
    return body;
  }

  function formatDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? String(value) : date.toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
  }

  function formatBytes(value) {
    const bytes = Number(value || 0);
    if (!Number.isFinite(bytes)) return "—";
    return new Intl.NumberFormat("de-DE", { style: "unit", unit: bytes >= 1_000_000_000 ? "gigabyte" : "megabyte", maximumFractionDigits: 1 })
      .format(bytes / (bytes >= 1_000_000_000 ? 1_000_000_000 : 1_000_000));
  }

  function localDateTime(value) {
    if (!value) return "";
    const date = new Date(value);
    const offset = date.getTimezoneOffset() * 60_000;
    return new Date(date.valueOf() - offset).toISOString().slice(0, 16);
  }

  function statusBadge(value) {
    const span = document.createElement("span");
    const status = String(value || "unbekannt");
    span.className = `platform-status platform-status--${status.replaceAll("_", "-")}`;
    span.textContent = statusLabel.get(status) || ({ available: "Verfügbar", degraded: "Eingeschränkt", outage: "Gestört" }[status]) || status.replaceAll("_", " ");
    return span;
  }

  function displayValue(item, key) {
    if (key === "name" && item.firstName) return `${item.firstName} ${item.lastName}`;
    const value = item[key];
    if (key === "status" || key === "severity" || key === "releaseStatus" || key === "priority" || key === "integrityStatus") return statusBadge(value);
    if (/At$|Date$|Deadline$/.test(key)) return formatDate(value);
    if (key === "versions") return `${value?.length || 0} unveränderbare Versionen`;
    if (key === "companyRoles") return (value || []).join(", ") || "—";
    if (key === "knownIssues") return Array.isArray(value) ? `${value.length} Einträge` : "—";
    if (["isSpecial", "isTestCompany", "mandatoryUpdate", "invitationPending", "twoFactorEnabled"].includes(key)) return value ? "Ja" : "Nein";
    if (key === "value") {
      const encoded = JSON.stringify(value);
      return encoded.length > 90 ? `${encoded.slice(0, 87)}…` : encoded;
    }
    if (Array.isArray(value)) return value.join(", ") || "—";
    if (value && typeof value === "object") return JSON.stringify(value);
    return value ?? "—";
  }

  function cellValue(cell, value) {
    cell.replaceChildren();
    if (value instanceof Node) cell.append(value);
    else cell.textContent = String(value);
  }

  function createTable(items, columns, {
    companyRows = false,
    accountActions = false,
    settingActions = false,
    rowAction = null
  } = {}) {
    const table = document.createElement("table");
    table.className = "platform-table";
    const thead = document.createElement("thead");
    const head = document.createElement("tr");
    columns.forEach(([label, , sortKey]) => {
      const th = document.createElement("th");
      if (companyRows && sortKey) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "platform-table__sort";
        button.textContent = `${label}${companySort === sortKey ? (companyDirection === "asc" ? " ↑" : " ↓") : ""}`;
        button.addEventListener("click", () => {
          companyDirection = companySort === sortKey && companyDirection === "asc" ? "desc" : "asc";
          companySort = sortKey;
          void loadCompanies();
        });
        th.append(button);
      } else th.textContent = label;
      head.append(th);
    });
    if (accountActions || settingActions || rowAction) { const th = document.createElement("th"); th.textContent = "Aktionen"; head.append(th); }
    thead.append(head);
    const tbody = document.createElement("tbody");
    if (!items.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = columns.length + (accountActions || settingActions || rowAction ? 1 : 0);
      cell.className = "platform-table__empty";
      cell.textContent = "Für diesen Filter liegen keine Einträge vor.";
      row.append(cell); tbody.append(row);
    }
    items.forEach((item) => {
      const row = document.createElement("tr");
      if (companyRows) {
        row.dataset.companyId = item.id;
        row.addEventListener("click", () => void openCompany(item.id));
      }
      columns.forEach(([, key]) => { const cell = document.createElement("td"); cellValue(cell, displayValue(item, key)); row.append(cell); });
      if (accountActions || settingActions || rowAction) {
        const cell = document.createElement("td");
        const button = document.createElement("button");
        button.className = "platform-row-action";
        button.type = "button";
        button.textContent = rowAction?.label || (settingActions ? "Bearbeiten" : "Konto verwalten");
        button.disabled = Boolean(rowAction?.disabled?.(item));
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          if (rowAction) rowAction.open(item);
          else if (settingActions) openSettingAction(item);
          else openAccountAction(item);
        });
        cell.append(button); row.append(cell);
      }
      tbody.append(row);
    });
    table.append(thead, tbody);
    return table;
  }

  function renderTable(items, columns, options = {}) {
    elements.tableWrap.replaceChildren(createTable(items, columns, options));
  }

  async function loadOverview() {
    elements.message.textContent = "Plattformkennzahlen werden geladen …";
    const { overview } = await request("overview");
    const metrics = [
      ["Registrierte Firmen", overview.companiesTotal, "companies"], ["Aktive Firmen", overview.companiesActive, "companies", "active"],
      ["Firmen in Testphase", overview.companiesTrial, "companies", "trial"], ["Deaktivierte Firmen", overview.companiesDisabled, "companies", "disabled"],
      ["Gekündigte Firmen", overview.companiesCancelled, "companies", "cancelled"], ["Aktive Benutzerkonten", overview.accountsActive, "accounts", "active"],
      ["Gesperrte Konten", overview.accountsBlocked, "accounts", "inactive"], ["Aktive Lizenzen", overview.licensesActive, "plans"],
      ["Auslaufende Testphasen", overview.trialsExpiring, "companies", "trial"], ["Auslaufende Verträge", overview.contractsExpiring, "companies"],
      ["Gesamter Speicher", formatBytes(overview.storageUsedBytes), "companies"], ["Gestörte Komponenten", overview.componentsOutage, "health", null, true],
      ["Backup-Status", overview.backupStatus || "Noch keines", "backups"], ["Anwendungsversion", overview.applicationVersion || "—", "versions"],
      ["Kritische Fehler", overview.criticalErrors, "errors", null, true], ["Offene Supportanfragen", overview.supportOpen, "support"],
      ["Fehlgeschlagene Prozesse", overview.failedJobs, "health", null, true]
    ];
    elements.metrics.replaceChildren();
    metrics.forEach(([label, value, view, filter, alert]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "platform-metric";
      button.dataset.alert = alert && Number(value) > 0 ? "true" : "false";
      const copy = document.createElement("span"); const strong = document.createElement("strong");
      copy.textContent = label; strong.textContent = String(value ?? "—"); button.append(copy, strong);
      button.addEventListener("click", () => { void selectView(view, filter || ""); });
      elements.metrics.append(button);
    });
    elements.message.textContent = "";
  }

  function setFilterOptions(options = [["", "Alle Einträge"]], selected = "") {
    elements.filter.replaceChildren();
    options.forEach(([value, label]) => { const option = document.createElement("option"); option.value = value; option.textContent = label; option.selected = value === selected; elements.filter.append(option); });
    elements.filter.hidden = options.length <= 1;
  }

  async function loadCompanies(initialFilter = elements.filter.value) {
    setFilterOptions([
      ["", "Alle Status"], ["disabled", "Deaktiviert oder eingeschränkt"], ...companyStatuses
    ], initialFilter);
    elements.create.hidden = !can("companies.create");
    elements.create.textContent = "Firma oder Einladung anlegen";
    const query = new URLSearchParams({
      page: String(currentPage), pageSize: "25", search: elements.search.value,
      sort: companySort, direction: companyDirection
    });
    if (elements.filter.value) query.set("status", elements.filter.value);
    const [{ companies }, registrationBody] = await Promise.all([
      request(`companies?${query}`),
      request("registrations").catch(() => ({ registrations: [] }))
    ]);
    const items = companies.items.map((company) => ({
      ...company,
      display: company.displayName,
      users: `${company.activeUserCount}/${company.userLimit ?? "∞"}`,
      storage: `${formatBytes(company.storageUsedBytes)} / ${company.storageLimitBytes ? formatBytes(company.storageLimitBytes) : "∞"}`,
      modules: (company.activeModules || []).join(", ") || "—"
    }));
    renderTable(items, [["Firma", "display", "name"], ["Kundennummer", "companyNumber", "number"], ["Ansprechpartner", "contactName"], ["E-Mail", "contactEmail"], ["Tarif", "licensePlan"], ["Module", "modules"], ["Benutzer", "users"], ["Speicher", "storage"], ["Registriert", "createdAt", "registered"], ["Letzter Login", "lastActiveLoginAt", "lastLogin"], ["Status", "status", "status"]], { companyRows: true });
    const registrations = registrationBody.registrations || [];
    if (registrations.length || can("companies.create")) {
      const heading = document.createElement("div");
      heading.className = "platform-subsection-heading";
      const title = document.createElement("h2");
      const copy = document.createElement("p");
      title.textContent = "Registrierungen und Einladungen";
      copy.textContent = `${registrations.length} Vorgänge · unvollständige Registrierungen bleiben prüfbar`;
      heading.append(title, copy);
      elements.tableWrap.append(heading, createTable(
        registrations,
        [["Firma", "displayName"], ["Kontakt", "contactName"], ["E-Mail", "contactEmail"], ["Tarif", "requestedPlanKey"], ["Testfirma", "isTestCompany"], ["Status", "status"], ["Einladung bis", "invitationExpiresAt"]],
        can("companies.create") ? { rowAction: { label: "Prüfen", open: openRegistrationAction } } : {}
      ));
    }
    elements.resourceSummary.textContent = `${companies.pagination.total} Firmen · Seite ${companies.pagination.page} · ${registrations.length} Registrierungen`;
    renderPagination(companies.pagination);
  }

  function renderPagination(pagination) {
    const pages = Math.max(1, Math.ceil(pagination.total / pagination.pageSize));
    elements.pagination.hidden = pages <= 1;
    elements.pageLabel.textContent = `Seite ${pagination.page} von ${pages}`;
    elements.pagePrevious.disabled = pagination.page <= 1;
    elements.pageNext.disabled = pagination.page >= pages;
  }

  async function loadResource(view) {
    const config = resources[view];
    const createPermission = {
      platform_account: "platform_users.manage", plan: "plans.manage", version: "versions.manage", support: "support.manage",
      announcement: "announcements.manage", backup: "backups.manage", privacy: "privacy.manage"
    }[config.create];
    elements.create.hidden = !config.create || (createPermission && !can(createPermission));
    elements.create.textContent = ({ platform_account: "Plattformadministrator anlegen", plan: "Tarif anlegen", version: "Version anlegen", support: "Supportfall anlegen", announcement: "Mitteilung erstellen", backup: "Backup auslösen", privacy: "Datenschutzanfrage erfassen" })[config.create] || "Neu anlegen";
    setFilterOptions(config.filters || [["", "Alle Einträge"]], elements.filter.value);
    const query = config.paginated ? `?${new URLSearchParams({ page: String(currentPage), pageSize: "25", search: elements.search.value, ...(elements.filter.value ? { status: elements.filter.value } : {}) })}` : "";
    const body = await request(`${config.endpoint}${query}`);
    const resource = body[config.root] || (config.paginated ? { items: [], pagination: { page: 1, pageSize: 25, total: 0 } } : []);
    const source = config.paginated ? resource.items : resource;
    const filterKey = config.filterKey || "status";
    const search = elements.search.value.trim().toLocaleLowerCase("de-DE");
    const collection = config.paginated ? source : source.filter((item) => (
      (!elements.filter.value || (config.filter
        ? config.filter(item, elements.filter.value)
        : item[filterKey] === elements.filter.value))
      && (!search || JSON.stringify(item).toLocaleLowerCase("de-DE").includes(search))
    ));
    const rowAction = config.action ? {
      label: config.action === "plan_version" ? "Neue Version" : "Bearbeiten",
      disabled: config.action === "backup_restore"
        ? (item) => item.status !== "success" || item.integrityStatus !== "valid"
        : null,
      open: (item) => openResourceAction(config.action, item)
    } : null;
    renderTable(collection, config.columns, {
      accountActions: view === "accounts" && (can("accounts.manage") || can("accounts.unlock")),
      settingActions: view === "settings" && can("settings.manage"),
      rowAction
    });
    elements.resourceSummary.textContent = config.paginated
      ? `${resource.pagination.total} Konten ohne fachliche Arbeitszeitdaten`
      : `${collection.length} Einträge`;
    if (config.paginated) renderPagination(resource.pagination);
    else elements.pagination.hidden = true;
    if (view === "accounts" && can("platform_users.manage")) {
      const administratorBody = await request("administrators");
      platformRoles = administratorBody.roles || [];
      const heading = document.createElement("div");
      heading.className = "platform-subsection-heading";
      const title = document.createElement("h2");
      const copy = document.createElement("p");
      title.textContent = "Plattformadministratoren";
      copy.textContent = "Vollständig von Firmenkonten und Mitarbeiterdaten getrennt.";
      heading.append(title, copy);
      elements.tableWrap.append(heading, createTable(
        administratorBody.administrators || [],
        [["Name", "name"], ["E-Mail", "email"], ["Rollen", "roles"], ["Status", "status"], ["2FA", "twoFactorEnabled"], ["Fehlversuche", "failedLoginAttempts"], ["Letzter Login", "lastLoginAt"], ["Sitzungen", "activeSessionCount"]],
        { rowAction: { label: "Verwalten", open: (item) => openResourceAction("platform_admin", item) } }
      ));
      const roleHeading = document.createElement("div");
      roleHeading.className = "platform-subsection-heading";
      const roleTitle = document.createElement("h2");
      const roleCopy = document.createElement("p");
      roleTitle.textContent = "Granulare Plattformrollen";
      roleCopy.textContent = "Rechteänderungen sind versionsgeschützt, bestätigt und im Audit-Log nachvollziehbar.";
      roleHeading.append(roleTitle, roleCopy);
      elements.tableWrap.append(roleHeading, createTable(
        platformRoles,
        [["Rolle", "name"], ["Schlüssel", "roleKey"], ["Berechtigungen", "permissions"], ["Version", "rowVersion"]],
        can("platform_roles.manage")
          ? { rowAction: { label: "Rechte bearbeiten", open: (item) => openResourceAction("platform_role", item) } }
          : {}
      ));
    }
    if (view === "backups" && body.restores?.length) {
      const heading = document.createElement("div");
      heading.className = "platform-subsection-heading";
      const title = document.createElement("h2");
      const copy = document.createElement("p");
      title.textContent = "Vorbereitete Wiederherstellungen";
      copy.textContent = "Eine zweite berechtigte Person muss jede Wiederherstellung bestätigen.";
      heading.append(title, copy);
      elements.tableWrap.append(heading, createTable(
        body.restores,
        [["Art", "restoreType"], ["Firma", "scopeCompanyId"], ["Status", "status"], ["Vorbereitet", "preparedAt"], ["Bestätigt", "confirmedAt"]],
        { rowAction: {
          label: "Bestätigen",
          disabled: (item) => item.status !== "prepared",
          open: (item) => openResourceAction("restore_confirm", item)
        } }
      ));
    }
    if (view === "versions") {
      const heading = document.createElement("div");
      heading.className = "platform-subsection-heading";
      const title = document.createElement("h2");
      const copy = document.createElement("p");
      title.textContent = "Aktive Sitzungen mit veralteter App-Version";
      copy.textContent = `${body.outdatedUsers?.length || 0} Benutzer · ohne Arbeitszeit- oder Mitarbeiterfachdaten`;
      heading.append(title, copy);
      elements.tableWrap.append(heading, createTable(
        body.outdatedUsers || [],
        [["Name", "name"], ["Firma", "companyName"], ["E-Mail", "email"], ["App-Version", "appVersion"], ["Zuletzt aktiv", "lastSeenAt"], ["Sitzungen", "activeSessionCount"]]
      ));
    }
  }

  async function loadCurrentView(initialFilter = "") {
    elements.message.textContent = "Daten werden geladen …";
    try {
      if (currentView === "overview") await loadOverview();
      else if (currentView === "companies") await loadCompanies(initialFilter);
      else await loadResource(currentView);
      elements.message.textContent = "";
    } catch (error) {
      if (error.status === 401) return showAuth();
      elements.message.textContent = error.message;
    }
  }

  async function selectView(view, filter = "") {
    if (!viewTitles[view] || !can(permissionByView[view])) return;
    currentView = view; currentPage = 1; elements.search.value = ""; elements.filter.value = filter;
    elements.title.textContent = viewTitles[view];
    elements.overview.hidden = view !== "overview";
    elements.resource.hidden = view === "overview";
    elements.toolbar.hidden = view === "overview";
    elements.navigation.querySelectorAll("button").forEach((button) => button.classList.toggle("is-active", button.dataset.platformView === view));
    elements.shell.classList.remove("is-menu-open");
    await loadCurrentView(filter);
  }

  function renderCompanyModules(modules) {
    elements.companyModuleList.replaceChildren();
    modules.forEach((module) => {
      const row = document.createElement("div"); row.className = "company-module";
      const copy = document.createElement("div"); const title = document.createElement("strong"); const meta = document.createElement("small");
      title.textContent = module.name;
      meta.textContent = `${module.category}${module.isSpecial ? " · Spezialmodul" : ""}${module.dependencies?.length ? ` · benötigt ${module.dependencies.join(", ")}` : ""}`;
      copy.append(title, meta);
      const config = document.createElement("details");
      const summary = document.createElement("summary");
      const fields = document.createElement("div");
      summary.textContent = `${statusLabel.get(module.entitlementStatus) || module.entitlementStatus} · konfigurieren`;
      fields.className = "company-module__fields";
      const select = document.createElement("select"); select.setAttribute("aria-label", "Modulstatus");
      [["inactive", "Inaktiv"], ["permanent", "Dauerhaft"], ["trial", "Testfreigabe"]].forEach(([value, label]) => { const option = document.createElement("option"); option.value = value; option.textContent = label; option.selected = module.entitlementStatus === value; select.append(option); });
      const startsAt = document.createElement("input"); startsAt.type = "datetime-local"; startsAt.value = localDateTime(module.startsAt);
      const endsAt = document.createElement("input"); endsAt.type = "datetime-local"; endsAt.value = localDateTime(module.endsAt);
      const included = document.createElement("select"); [["false", "Separat"], ["true", "Im Tarif enthalten"]].forEach(([value, label]) => { const option = document.createElement("option"); option.value = value; option.textContent = label; option.selected = String(Boolean(module.includedInPlan)) === value; included.append(option); });
      const billed = document.createElement("select"); [["false", "Ohne Aufpreis"], ["true", "Separat kostenpflichtig"]].forEach(([value, label]) => { const option = document.createElement("option"); option.value = value; option.textContent = label; option.selected = String(Boolean(module.separatelyBilled)) === value; billed.append(option); });
      const userLimit = document.createElement("input"); userLimit.type = "number"; userLimit.min = "1"; userLimit.placeholder = "kein eigenes Limit"; userLimit.value = module.userLimit ?? "";
      const scope = document.createElement("textarea"); scope.rows = 2; scope.value = JSON.stringify(module.featureScope || {}, null, 2);
      [[select, "Status"], [startsAt, "Startdatum"], [endsAt, "Ablaufdatum"], [included, "Tarifzuordnung"], [billed, "Abrechnung"], [userLimit, "Benutzerlimit"], [scope, "Funktionsumfang (JSON)"]].forEach(([control, labelText]) => {
        const label = document.createElement("label"); label.textContent = labelText; label.append(control); fields.append(label);
      });
      const save = document.createElement("button"); save.type = "button"; save.className = "platform-row-action"; save.textContent = "Speichern";
      save.disabled = !can("modules.manage");
      save.addEventListener("click", async () => {
        const reason = elements.companyReason.value.trim();
        if (reason.length < 3) { elements.companyDialogMessage.textContent = "Bitte zuerst die Begründung im Firmenformular eintragen."; return; }
        const status = select.value;
        let featureScope;
        try { featureScope = JSON.parse(scope.value || "{}"); }
        catch { elements.companyDialogMessage.textContent = "Der Funktionsumfang ist kein gültiges JSON."; return; }
        const startValue = status === "inactive" || !startsAt.value ? null : new Date(startsAt.value).toISOString();
        const endValue = status === "inactive" || !endsAt.value ? null : new Date(endsAt.value).toISOString();
        if (status === "trial" && (!startValue || !endValue)) {
          elements.companyDialogMessage.textContent = "Eine Testfreigabe benötigt Start- und Ablaufdatum.";
          return;
        }
        save.disabled = true;
        try {
          await request(`companies/${encodeURIComponent(currentCompany.company.id)}/modules/${encodeURIComponent(module.moduleKey)}`, {
            method: "PUT", body: JSON.stringify({ status, startsAt: startValue, endsAt: endValue, includedInPlan: included.value === "true", separatelyBilled: billed.value === "true", userLimit: userLimit.value ? Number(userLimit.value) : null, featureScope, rowVersion: module.rowVersion, reason })
          });
          elements.companyDialogMessage.textContent = `${module.name} wurde nachvollziehbar aktualisiert.`;
          await openCompany(currentCompany.company.id, false);
        } catch (error) { elements.companyDialogMessage.textContent = error.message; save.disabled = false; }
      });
      fields.append(save); config.append(summary, fields);
      row.append(copy, config); elements.companyModuleList.append(row);
    });
  }

  async function openCompany(companyId, show = true) {
    elements.companyDialogMessage.textContent = "Firmendaten werden geladen …";
    if (show) elements.companyDialog.showModal();
    try {
      currentCompany = await request(`companies/${encodeURIComponent(companyId)}`);
      const company = currentCompany.company;
      elements.companyDialogTitle.textContent = `${company.displayName} · ${company.companyNumber}`;
      elements.companyActivity.textContent = `Letzter aktiver Firmenlogin: ${formatDate(company.lastActiveLoginAt)} · letzte Plattformaktivität: ${formatDate(company.lastPlatformActivityAt)} · ${company.openSupportCount || 0} offene Supportfälle · ${company.activeUserCount || 0} aktive Konten`;
      elements.companyId.value = company.id; elements.companyRowVersion.value = company.rowVersion;
      elements.companyLegalName.value = company.legalName || ""; elements.companyDisplayName.value = company.displayName || "";
      elements.companyContactName.value = company.contactName || ""; elements.companyContactEmail.value = company.contactEmail || company.email || "";
      elements.companyPhone.value = company.phone || ""; elements.companyStreet.value = company.street || "";
      elements.companyHouseNumber.value = company.houseNumber || ""; elements.companyPostalCode.value = company.postalCode || "";
      elements.companyCity.value = company.city || "";
      elements.companyStatus.value = company.status; elements.companyLicensePlan.value = company.licensePlan || "";
      elements.companyUserLimit.value = company.userLimit ?? ""; elements.companyStorageLimit.value = company.storageLimitBytes ?? "";
      elements.companyTrialEnds.value = localDateTime(company.trialEndsAt);
      elements.companyLicenseValidUntil.value = localDateTime(company.licenseValidUntil);
      elements.companyContractEnds.value = localDateTime(company.contractEndsAt);
      elements.companyCancellationRecorded.value = localDateTime(company.cancellationRecordedAt);
      elements.companyDeletionScheduled.value = localDateTime(company.deletionScheduledAt);
      elements.companyReason.value = "";
      const canManageCompany = can("companies.manage");
      const canManageTrials = canManageCompany || can("companies.trials");
      const canManageContracts = canManageCompany || can("contracts.assign") || can("contracts.manage");
      [elements.companyLegalName, elements.companyDisplayName, elements.companyContactName,
        elements.companyContactEmail, elements.companyPhone, elements.companyStreet,
        elements.companyHouseNumber, elements.companyPostalCode, elements.companyCity,
        elements.companyUserLimit, elements.companyStorageLimit, elements.companyDeletionScheduled]
        .forEach((control) => { control.disabled = !canManageCompany; });
      elements.companyTrialEnds.disabled = !canManageTrials;
      elements.companyLicensePlan.disabled = !canManageContracts;
      elements.companyLicenseValidUntil.disabled = !canManageContracts;
      elements.companyContractEnds.disabled = !canManageContracts;
      elements.companyCancellationRecorded.disabled = !canManageContracts;
      elements.companyStatus.disabled = !(canManageCompany || canManageTrials || canManageContracts);
      elements.companyForm.querySelector('button[type="submit"]').hidden =
        !(canManageCompany || canManageTrials || canManageContracts);
      elements.companyModules.hidden = !can("companies.read"); elements.companySupportAccess.hidden = !can("support.access") || Boolean(supportMode);
      renderCompanyModules(currentCompany.modules || []);
      const supportCases = currentCompany.supportCases || [];
      elements.companySupportCases.replaceChildren();
      if (!supportCases.length) {
        const empty = document.createElement("p");
        empty.className = "platform-muted";
        empty.textContent = "Für diese Firma liegen keine Supportfälle vor.";
        elements.companySupportCases.append(empty);
      } else {
        supportCases.forEach((supportCase) => {
          const row = document.createElement("div");
          row.className = "company-support-case";
          const title = document.createElement("strong");
          const meta = document.createElement("span");
          title.textContent = `${supportCase.ticketNumber} · ${supportCase.subject}`;
          meta.textContent = `${supportCase.priority} · ${supportCase.status} · ${formatDate(supportCase.updatedAt)}`;
          row.append(title, meta); elements.companySupportCases.append(row);
        });
      }
      const canAssignContract = can("contracts.assign") || can("contracts.manage");
      elements.companyContract.hidden = !canAssignContract;
      if (canAssignContract) {
        const { plans } = await request("plans");
        elements.companyContractVersion.replaceChildren();
        [elements.companyContractStarts, elements.companyContractNewEnds,
          elements.companyContractTrialEnds, elements.companyContractGoodwill,
          elements.companyContractMonthlyPrice, elements.companyContractAnnualPrice,
          elements.companyContractUserLimit, elements.companyContractStorageLimit,
          elements.companyContractNoticeDays, elements.companyContractMinimumTerm,
          elements.companyContractModules, elements.companyContractTerms]
          .forEach((control) => { control.value = ""; });
        elements.companyContractDiscount.value = "0";
        plans.flatMap((plan) => (plan.versions || []).map((version) => ({ plan, version })))
          .forEach(({ plan, version }) => {
            const option = document.createElement("option");
            option.value = version.id;
            option.textContent = `${plan.name} · Version ${version.version_number || version.versionNumber} · ${((version.monthly_price_cents ?? version.monthlyPriceCents) / 100).toLocaleString("de-DE", { style: "currency", currency: version.currency || "EUR" })}/Monat`;
            elements.companyContractVersion.append(option);
          });
      }
      elements.companyDialogMessage.textContent = "";
    } catch (error) { elements.companyDialogMessage.textContent = error.message; }
  }

  function field(name, label, type = "text", options = null, value = "") {
    const wrapper = document.createElement("label"); wrapper.textContent = label;
    let input;
    if (options) { input = document.createElement("select"); options.forEach(([optionValue, optionLabel]) => { const option = document.createElement("option"); option.value = optionValue; option.textContent = optionLabel; input.append(option); }); }
    else if (type === "textarea") { input = document.createElement("textarea"); input.rows = 4; }
    else { input = document.createElement("input"); input.type = type; }
    input.name = name; input.value = value ?? ""; wrapper.append(input); return wrapper;
  }

  function readonlyField(name, label, value, type = "textarea") {
    const wrapper = field(name, label, type, null, value);
    const control = wrapper.querySelector("input, textarea");
    control.readOnly = true;
    return wrapper;
  }

  function targetFields(targets = { scope: "all" }) {
    const scope = targets.scope || Object.keys(targets)[0] || "all";
    const values = targets.values || targets[scope] || [];
    return [
      field("targetScope", "Empfänger", "text", [
        ["all", "Alle Firmen"], ["companies", "Einzelne Firmen"],
        ["plans", "Bestimmte Tarife"], ["modules", "Bestimmte Module"],
        ["company_roles", "Firmenrollen"], ["user_groups", "Benutzergruppen"]
      ], scope),
      field("targetValues", "Empfänger-IDs oder Schlüssel (kommagetrennt)", "text", null, Array.isArray(values) ? values.join(", ") : "")
    ];
  }

  function openCreateAction(kind) {
    actionContext = { kind };
    const definitions = {
      platform_account: ["Plattformadministrator anlegen", [field("firstName", "Vorname"), field("lastName", "Nachname"), field("email", "E-Mail", "email"), field("temporaryPassword", "Temporäres Passwort", "password"), field("roleKeys", "Rollen (kommagetrennt)", "text", null, "support")]],
      company: ["Firma oder Einladung anlegen", [field("mode", "Vorgang", "text", [["company", "Firma direkt anlegen"], ["invitation", "Einladung erzeugen"]]), field("legalName", "Firmenname"), field("displayName", "Anzeigename"), field("contactName", "Ansprechpartner"), field("contactEmail", "E-Mail", "email"), field("isTestCompany", "Testfirma", "text", [["false", "Nein"], ["true", "Ja"]]), field("licensePlan", "Tarif", "text", null, "standard")]],
      plan: ["Tarif anlegen", [field("key", "Tarifschlüssel"), field("name", "Name"), field("status", "Status", "text", [["draft", "Entwurf"], ["active", "Aktiv"]]), field("description", "Beschreibung", "textarea")]],
      support: ["Supportfall anlegen", [field("companyId", "Firmen-ID"), field("contactName", "Ansprechpartner"), field("contactEmail", "E-Mail", "email"), field("category", "Kategorie", "text", [["support", "Support"], ["technical", "Technik"], ["setup", "Einrichtung"], ["billing", "Abrechnung"]]), field("priority", "Priorität", "text", [["low", "Niedrig"], ["normal", "Normal"], ["high", "Hoch"], ["critical", "Kritisch"]]), field("subject", "Betreff"), field("description", "Beschreibung")]],
      announcement: ["Mitteilung erstellen", [field("title", "Titel"), field("message", "Nachricht", "textarea"), field("type", "Art", "text", [["maintenance", "Wartung"], ["outage", "Störung"], ["security", "Sicherheit"], ["feature", "Neue Funktion"], ["update", "Update"], ["terms", "Bedingungen"]]), field("status", "Status", "text", [["draft", "Entwurf"], ["scheduled", "Geplant"], ["published", "Sofort veröffentlichen"]]), ...targetFields(), field("publishAt", "Veröffentlichung", "datetime-local"), field("expiresAt", "Ablauf", "datetime-local")]],
      version: ["Anwendungsversion anlegen", [field("version", "Version"), field("status", "Status", "text", [["draft", "Entwurf"], ["rolling_out", "Schrittweiser Rollout"], ["production", "Produktion"]]), field("rolloutPercent", "Rollout in Prozent", "number", null, "0"), field("mandatoryUpdate", "Pflichtupdate", "text", [["false", "Nein"], ["true", "Ja"]]), field("changelog", "Changelog", "textarea"), field("knownIssues", "Bekannte Fehler (eine Zeile je Eintrag)", "textarea"), field("databaseMigrations", "Migrationen (kommagetrennt)"), field("confirmation", "Kritische Bestätigung (bei Produktion: Version)")]],
      backup: ["Manuelles Backup auslösen", [field("type", "Art", "text", [["manual", "Vollständiges Backup"], ["company", "Einzelne Firma"]]), field("companyId", "Firmen-ID (bei Firmenbackup)")]],
      privacy: ["Datenschutzanfrage erfassen", [field("type", "Anfrage", "text", [["company_export", "Firmenexport"], ["user_export", "Benutzerexport"], ["company_deletion", "Firmenlöschung"], ["user_deletion", "Benutzerlöschung"], ["anonymization", "Anonymisierung"]]), field("companyId", "Firmen-ID"), field("userId", "Benutzer-ID"), field("recoveryDeadline", "Wiederherstellungsfrist", "datetime-local")]]
    };
    const [title, fields] = definitions[kind]; elements.actionTitle.textContent = title;
    elements.actionForm.querySelector('button[type="submit"]').hidden = false;
    elements.actionFields.replaceChildren(...fields); elements.actionReason.value = ""; elements.actionMessage.textContent = ""; elements.actionDialog.showModal();
  }

  function openAccountAction(account) {
    actionContext = { kind: "account", account };
    elements.actionForm.querySelector('button[type="submit"]').hidden = false;
    elements.actionTitle.textContent = `${account.firstName} ${account.lastName} verwalten`;
    const actions = can("accounts.manage")
      ? [["unlock", "Konto entsperren"], ["disable", "Benutzer deaktivieren"], ["end_sessions", "Alle Sitzungen beenden"], ["reset_password", "Passwortzurücksetzung auslösen"], ["revoke_invitation", "Offene Einladung widerrufen"], ["resend_invitation", "Einladung erneut senden"], ["correct_email", "E-Mail korrigieren"], ["reassign_company", "Anderer Firma zuordnen"]]
      : [["unlock", "Konto entsperren"]];
    elements.actionFields.replaceChildren(
      field("action", "Aktion", "text", actions),
      field("email", "Neue E-Mail (nur bei Korrektur)", "email"), field("companyId", "Ziel-Firmen-ID (nur bei Zuordnung)")
    );
    elements.actionReason.value = ""; elements.actionMessage.textContent = ""; elements.actionDialog.showModal();
  }

  function openSettingAction(setting) {
    actionContext = { kind: "setting", setting };
    elements.actionForm.querySelector('button[type="submit"]').hidden = false;
    elements.actionTitle.textContent = `Einstellung: ${setting.settingKey}`;
    const wrapper = document.createElement("label"); wrapper.textContent = "JSON-Wert";
    const textarea = document.createElement("textarea"); textarea.name = "value"; textarea.rows = 5; textarea.value = JSON.stringify(setting.value, null, 2); wrapper.append(textarea);
    elements.actionFields.replaceChildren(wrapper); elements.actionReason.value = ""; elements.actionMessage.textContent = ""; elements.actionDialog.showModal();
  }

  function openRegistrationAction(registration) {
    actionContext = { kind: "registration", registration };
    elements.actionForm.querySelector('button[type="submit"]').hidden = false;
    elements.actionTitle.textContent = `Registrierung: ${registration.displayName}`;
    elements.actionFields.replaceChildren(
      field("action", "Aktion", "text", [["approve", "Freigeben"], ["reject", "Ablehnen"], ["resend", "Einladung erneut senden"], ["remove", "Entfernen"]]),
      field("firstName", "Vorname des ersten Firmenadministrators"),
      field("lastName", "Nachname des ersten Firmenadministrators"),
      field("personnelNumber", "Personalnummer", "text", null, "ADMIN-001"),
      field("temporaryPassword", "Temporäres Startpasswort", "password"),
      field("trialDays", "Testtage", "number", null, "14"),
      field("expiresInDays", "Neue Einladungsfrist", "number", null, "7")
    );
    elements.actionReason.value = ""; elements.actionMessage.textContent = ""; elements.actionDialog.showModal();
  }

  function openResourceAction(kind, item) {
    actionContext = { kind, item };
    elements.actionForm.querySelector('button[type="submit"]').hidden = false;
    const definitions = {
      platform_admin: ["Plattformkonto verwalten", [field("action", "Aktion", "text", [["assign_roles", "Rollen zuweisen"], ["unlock", "Entsperren"], ["enable", "Aktivieren"], ["disable", "Deaktivieren"], ["end_sessions", "Alle Sitzungen beenden"]]), field("roleKeys", `Rollen (${platformRoles.map((role) => role.roleKey).join(", ")})`, "text", null, (item.roles || []).join(", ")), field("confirmation", `Kritische Bestätigung (E-Mail: ${item.email})`)]],
      platform_role: ["Plattformrechte bearbeiten", [field("permissions", "Berechtigungen (kommagetrennt)", "textarea", null, (item.permissions || []).join(", ")), field("confirmation", `Zur Bestätigung Rollenschlüssel eingeben: ${item.roleKey}`)]],
      plan_manage: ["Tarif verwalten", [
        field("operation", "Vorgang", "text", [["metadata", "Tarif-Stammdaten bearbeiten"], ["version", "Neuen unveränderbaren Preisstand anlegen"]]),
        field("name", "Tarifname (bei Stammdaten)", "text", null, item.name),
        field("status", "Tarifstatus (bei Stammdaten)", "text", [["draft", "Entwurf"], ["active", "Aktiv"], ["retired", "Eingestellt"]], item.status),
        field("description", "Beschreibung (bei Stammdaten)", "textarea", null, item.description || ""),
        field("monthlyPriceCents", "Monatspreis in Cent", "number", null, "0"),
        field("annualPriceCents", "Jahrespreis in Cent", "number", null, "0"),
        field("currency", "Währung", "text", null, "EUR"),
        field("employeeTiers", "Mitarbeiterstaffeln (JSON)", "textarea", null, "[]"),
        field("userLimit", "Benutzerlimit", "number"), field("storageLimitBytes", "Speicherlimit (Bytes)", "number"),
        field("includedModules", "Enthaltene Module (kommagetrennt)"), field("addonModules", "Zusatzmodule (kommagetrennt)"),
        field("trialDays", "Testtage", "number", null, "14"), field("cancellationNoticeDays", "Kündigungsfrist in Tagen", "number", null, "30"),
        field("minimumTermMonths", "Mindestlaufzeit in Monaten", "number", null, "1"), field("activeFrom", "Gültig ab", "datetime-local")
      ]],
      support_edit: ["Supportfall bearbeiten", [
        readonlyField("description", "Beschreibung", item.description || ""),
        readonlyField("history", "Verlauf", (item.history || []).map((event) => `${formatDate(event.createdAt)} · ${event.eventType}: ${event.message}`).join("\n") || "Noch kein Verlauf"),
        readonlyField("attachments", "Anhänge", (item.attachments || []).map((attachment) => `${attachment.fileName} · ${formatBytes(attachment.sizeBytes)}`).join("\n") || "Keine Anhänge"),
        field("status", "Status", "text", [["new", "Neu"], ["assigned", "Zugewiesen"], ["in_progress", "In Bearbeitung"], ["question", "Rückfrage"], ["waiting_customer", "Wartet auf Kunde"], ["resolved", "Gelöst"], ["closed", "Geschlossen"]], item.status),
        field("priority", "Priorität", "text", [["low", "Niedrig"], ["normal", "Normal"], ["high", "Hoch"], ["critical", "Kritisch"]], item.priority),
        field("assigneeId", "Zuständiger Admin (UUID)", "text", null, item.assignedPlatformUserId || "")
      ]],
      health_edit: ["Systemkomponente aktualisieren", [field("status", "Status", "text", [["available", "Verfügbar"], ["degraded", "Eingeschränkt"], ["outage", "Gestört"]], item.status), field("errorSummary", "Letzter Fehler", "textarea", null, item.lastErrorSummary || "")]],
      error_edit: ["Fehlerstatus aktualisieren", [field("status", "Status", "text", [["new", "Neu"], ["investigating", "In Bearbeitung"], ["reopened", "Wieder aufgetreten"], ["resolved", "Gelöst"]], item.status)]],
      version_edit: ["Version steuern", [field("status", "Status", "text", [["draft", "Entwurf"], ["rolling_out", "Rollout"], ["production", "Produktion"], ["withdrawn", "Zurückziehen"], ["superseded", "Abgelöst"]], item.releaseStatus), field("rolloutPercent", "Rollout in Prozent", "number", null, String(item.rolloutPercent)), field("mandatoryUpdate", "Pflichtupdate", "text", [["false", "Nein"], ["true", "Ja"]], String(item.mandatoryUpdate)), field("changelog", "Changelog", "textarea", null, item.changelog || ""), field("knownIssues", "Bekannte Fehler (eine Zeile je Eintrag)", "textarea", null, (item.knownIssues || []).join("\n")), field("confirmation", `Kritische Bestätigung (Version: ${item.version})`)]],
      announcement_edit: ["Mitteilung bearbeiten", [field("title", "Titel", "text", null, item.title), field("message", "Nachricht", "textarea", null, item.message), field("type", "Art", "text", [["maintenance", "Wartung"], ["outage", "Störung"], ["security", "Sicherheit"], ["feature", "Neue Funktion"], ["update", "Update"], ["terms", "Bedingungen"]], item.announcementType), field("status", "Status", "text", [["draft", "Entwurf"], ["scheduled", "Geplant"], ["published", "Veröffentlicht"], ["disabled", "Deaktiviert"]], item.status), ...targetFields(item.targets), field("publishAt", "Veröffentlichung", "datetime-local", null, localDateTime(item.publishAt)), field("expiresAt", "Ablauf", "datetime-local", null, localDateTime(item.expiresAt))]],
      backup_restore: ["Wiederherstellung vorbereiten", [field("type", "Art", "text", [["test", "Testwiederherstellung"], ["company", "Einzelne Firma"], ["deleted_data", "Gelöschte Daten"], ["full", "Vollständig"]], item.scopeCompanyId ? "company" : "test"), field("companyId", "Firma (UUID)", "text", null, item.scopeCompanyId || "")]],
      restore_confirm: ["Wiederherstellung im Vier-Augen-Prinzip bestätigen", [field("confirmation", `Zur Bestätigung exakt eingeben: RESTORE ${item.id}`)]],
      privacy_advance: ["Datenschutzprozess fortsetzen", [field("status", "Nächster Schritt", "text", [["retention_review", "Aufbewahrung prüfen"], ["deactivated", "Deaktivieren"], ["archived", "Archivieren"], ["recovery_period", "Wiederherstellungsfrist"], ["confirmed", "Zweite Bestätigung"], ["processing", "Verarbeiten"], ["completed", "Abschließen"], ["rejected", "Ablehnen"]]), field("retentionReview", "Aufbewahrungsprüfung (JSON)", "textarea", null, JSON.stringify(item.retentionReview || {}, null, 2)), field("deletionLog", "Löschprotokoll (JSON)", "textarea", null, JSON.stringify(item.deletionLog || {}, null, 2))]]
    };
    const [title, fields] = definitions[kind];
    elements.actionTitle.textContent = title; elements.actionFields.replaceChildren(...fields);
    elements.actionReason.value = ""; elements.actionMessage.textContent = ""; elements.actionDialog.showModal();
  }

  function formObject(form) { return Object.fromEntries(new FormData(form).entries()); }

  function textList(value) {
    return String(value || "").split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
  }

  function parsedJson(value, label) {
    try { return JSON.parse(value || "{}"); }
    catch { throw new Error(`${label} ist kein gültiges JSON.`); }
  }

  function announcementTargets(data) {
    return data.targetScope === "all"
      ? { scope: "all" }
      : { scope: data.targetScope, values: textList(data.targetValues) };
  }

  function optionalNumber(value) {
    return value === "" || value == null ? null : Number(value);
  }

  async function submitAction() {
    const data = formObject(elements.actionForm); data.reason = elements.actionReason.value;
    if (data.reason.trim().length < 3) throw new Error("Bitte eine nachvollziehbare Begründung eingeben.");
    const kind = actionContext.kind;
    if (kind === "platform_account") await request("administrators", { method: "POST", body: JSON.stringify({ ...data, roleKeys: textList(data.roleKeys) }) });
    else if (kind === "company") {
      const isInvitation = data.mode === "invitation";
      return request(isInvitation ? "registrations" : "companies", { method: "POST", body: JSON.stringify({ ...data, isTestCompany: data.isTestCompany === "true", expiresInDays: 7 }) });
    } else if (kind === "plan") await request("plans", { method: "POST", body: JSON.stringify(data) });
    else if (kind === "platform_admin") await request(`administrators/${encodeURIComponent(actionContext.item.id)}/actions`, { method: "POST", body: JSON.stringify({ ...data, roleKeys: textList(data.roleKeys) }) });
    else if (kind === "plan_manage") {
      if (data.operation === "metadata") {
        await request(`plans/${encodeURIComponent(actionContext.item.id)}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: data.name,
            status: data.status,
            description: data.description,
            rowVersion: actionContext.item.rowVersion,
            reason: data.reason
          })
        });
      } else {
        await request(`plans/${encodeURIComponent(actionContext.item.id)}/versions`, {
          method: "POST",
          body: JSON.stringify({
            ...data,
            monthlyPriceCents: Number(data.monthlyPriceCents), annualPriceCents: Number(data.annualPriceCents),
            employeeTiers: parsedJson(data.employeeTiers, "Mitarbeiterstaffeln"),
            userLimit: optionalNumber(data.userLimit), storageLimitBytes: optionalNumber(data.storageLimitBytes),
            includedModules: textList(data.includedModules), addonModules: textList(data.addonModules),
            trialDays: Number(data.trialDays), cancellationNoticeDays: Number(data.cancellationNoticeDays),
            minimumTermMonths: Number(data.minimumTermMonths), activeFrom: data.activeFrom || null
          })
        });
      }
    }
    else if (kind === "support") await request("support/tickets", { method: "POST", body: JSON.stringify(data) });
    else if (kind === "announcement") await request("announcements", { method: "POST", body: JSON.stringify({ ...data, targets: announcementTargets(data), publishAt: data.publishAt || null, expiresAt: data.expiresAt || null }) });
    else if (kind === "version") await request("versions", { method: "POST", body: JSON.stringify({ ...data, rolloutPercent: Number(data.rolloutPercent), mandatoryUpdate: data.mandatoryUpdate === "true", knownIssues: textList(data.knownIssues), databaseMigrations: textList(data.databaseMigrations) }) });
    else if (kind === "backup") await request("backups", { method: "POST", body: JSON.stringify({ ...data, companyId: data.companyId || null }) });
    else if (kind === "privacy") await request("privacy", { method: "POST", body: JSON.stringify({ ...data, companyId: data.companyId || null, userId: data.userId || null, recoveryDeadline: data.recoveryDeadline || null }) });
    else if (kind === "account") await request(`accounts/${encodeURIComponent(actionContext.account.id)}/actions`, { method: "POST", body: JSON.stringify({ ...data, email: data.email || null, companyId: data.companyId || null }) });
    else if (kind === "platform_role") await request(`roles/${encodeURIComponent(actionContext.item.id)}`, { method: "PATCH", body: JSON.stringify({ permissions: textList(data.permissions), confirmation: data.confirmation, rowVersion: actionContext.item.rowVersion, reason: data.reason }) });
    else if (kind === "registration") return request(`registrations/${encodeURIComponent(actionContext.registration.id)}`, { method: "PATCH", body: JSON.stringify({ ...data, rowVersion: actionContext.registration.rowVersion, trialDays: Number(data.trialDays), expiresInDays: Number(data.expiresInDays) }) });
    else if (kind === "support_edit") await request(`support/tickets/${encodeURIComponent(actionContext.item.id)}`, { method: "PATCH", body: JSON.stringify({ ...data, rowVersion: actionContext.item.rowVersion, assigneeId: data.assigneeId || null }) });
    else if (kind === "health_edit") await request(`health/${encodeURIComponent(actionContext.item.componentKey)}`, { method: "PATCH", body: JSON.stringify(data) });
    else if (kind === "error_edit") await request(`errors/${encodeURIComponent(actionContext.item.id)}`, { method: "PATCH", body: JSON.stringify(data) });
    else if (kind === "version_edit") await request(`versions/${encodeURIComponent(actionContext.item.id)}`, { method: "PATCH", body: JSON.stringify({ ...data, rolloutPercent: Number(data.rolloutPercent), mandatoryUpdate: data.mandatoryUpdate === "true", knownIssues: textList(data.knownIssues) }) });
    else if (kind === "announcement_edit") await request(`announcements/${encodeURIComponent(actionContext.item.id)}`, { method: "PATCH", body: JSON.stringify({ ...data, rowVersion: actionContext.item.rowVersion, targets: announcementTargets(data), publishAt: data.publishAt || null, expiresAt: data.expiresAt || null }) });
    else if (kind === "backup_restore") await request("restores", { method: "POST", body: JSON.stringify({ backupId: actionContext.item.id, type: data.type, companyId: data.companyId || null, reason: data.reason }) });
    else if (kind === "restore_confirm") await request(`restores/${encodeURIComponent(actionContext.item.id)}/confirm`, { method: "POST", body: JSON.stringify(data) });
    else if (kind === "privacy_advance") await request(`privacy/${encodeURIComponent(actionContext.item.id)}`, { method: "PATCH", body: JSON.stringify({ status: data.status, rowVersion: actionContext.item.rowVersion, retentionReview: parsedJson(data.retentionReview, "Aufbewahrungsprüfung"), deletionLog: parsedJson(data.deletionLog, "Löschprotokoll"), reason: data.reason }) });
    else if (kind === "setting") {
      let value; try { value = JSON.parse(data.value); } catch { throw new Error("Der Einstellungswert ist kein gültiges JSON."); }
      await request(`settings/${encodeURIComponent(actionContext.setting.settingKey)}`, { method: "PUT", body: JSON.stringify({ value, description: actionContext.setting.description, isSensitive: actionContext.setting.isSensitive, reason: data.reason }) });
    }
  }

  function showInvitationToken(token) {
    const wrapper = field("invitationToken", "Einmaliger Einladungsschlüssel", "text", null, token);
    const input = wrapper.querySelector("input");
    input.readOnly = true;
    input.autocomplete = "off";
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "platform-button platform-button--quiet";
    copy.textContent = "Schlüssel kopieren";
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(token);
        elements.actionMessage.textContent = "Einladungsschlüssel kopiert. Er wird serverseitig nur als Hash gespeichert.";
      } catch {
        input.select();
        elements.actionMessage.textContent = "Bitte den markierten Schlüssel jetzt kopieren.";
      }
    });
    elements.actionFields.replaceChildren(wrapper, copy);
    elements.actionForm.querySelector('button[type="submit"]').hidden = true;
    elements.actionMessage.textContent = "Die Einladung wurde erzeugt. Dieser Schlüssel wird nur jetzt vollständig angezeigt.";
  }

  async function restoreSupportMode() {
    const saved = sessionStorage.getItem("schaefchen.platform.support");
    if (!saved) return;
    try {
      supportMode = JSON.parse(saved);
      const context = await request(`support-access/${encodeURIComponent(supportMode.id)}/context`);
      supportMode.companyName = context.supportAccess.companyName || context.company.displayName || supportMode.companyName;
      supportMode.expiresAt = context.supportAccess.expiresAt;
      sessionStorage.setItem("schaefchen.platform.support", JSON.stringify(supportMode));
      showSupportBanner();
    } catch { clearSupportMode(); }
  }

  function clearSupportMode() {
    window.clearTimeout(supportExpiryTimer);
    supportExpiryTimer = null;
    supportMode = null;
    sessionStorage.removeItem("schaefchen.platform.support");
    showSupportBanner();
  }

  function scheduleSupportExpiry() {
    window.clearTimeout(supportExpiryTimer);
    supportExpiryTimer = null;
    if (!supportMode?.expiresAt) return;
    const remaining = new Date(supportMode.expiresAt).valueOf() - Date.now();
    if (!Number.isFinite(remaining) || remaining <= 0) {
      clearSupportMode();
      elements.message.textContent = "Der zeitlich begrenzte Supportmodus ist abgelaufen.";
      return;
    }
    supportExpiryTimer = window.setTimeout(() => {
      clearSupportMode();
      elements.message.textContent = "Der zeitlich begrenzte Supportmodus ist abgelaufen.";
    }, Math.min(remaining + 250, 2_147_000_000));
  }

  function showSupportBanner() {
    elements.supportBanner.hidden = !supportMode;
    if (!supportMode) return;
    elements.supportCompany.textContent = `Administratoransicht – Firma: ${supportMode.companyName}`;
    elements.supportReason.textContent = supportMode.expiresAt
      ? `${supportMode.reason} · automatisch bis ${formatDate(supportMode.expiresAt)}`
      : supportMode.reason;
    scheduleSupportExpiry();
  }

  function showAuth() {
    session = null; elements.shell.hidden = true; elements.auth.hidden = false;
  }

  async function enterPlatform(nextSession) {
    session = nextSession; elements.auth.hidden = true; elements.shell.hidden = false;
    elements.userName.textContent = `${session.platformUser.firstName} ${session.platformUser.lastName}`;
    elements.userRoles.textContent = session.platformUser.roles.join(", ");
    elements.navigation.querySelectorAll("[data-platform-view]").forEach((button) => { button.hidden = !can(permissionByView[button.dataset.platformView]); });
    await restoreSupportMode();
    const firstView = can("dashboard.read") ? "overview" : Object.keys(viewTitles).find((view) => can(permissionByView[view]));
    await selectView(firstView || "overview");
  }

  elements.companyStatus.replaceChildren(...companyStatuses.map(([value, label]) => { const option = document.createElement("option"); option.value = value; option.textContent = label; return option; }));
  elements.supportAccessReason.replaceChildren(...supportReasons.map(([value, label]) => { const option = document.createElement("option"); option.value = value; option.textContent = label; return option; }));

  elements.loginForm.addEventListener("submit", async (event) => {
    event.preventDefault(); elements.authMessage.textContent = "Anmeldung wird geprüft …";
    try { const body = await request("session", { method: "POST", body: JSON.stringify({ email: elements.loginEmail.value, password: elements.loginPassword.value }) }); elements.loginPassword.value = ""; await enterPlatform(body.session); }
    catch (error) { elements.authMessage.textContent = error.message; }
  });
  elements.setupForm.addEventListener("submit", async (event) => {
    event.preventDefault(); elements.authMessage.textContent = "Plattformkonto wird angelegt …";
    try { await request("setup", { method: "POST", body: JSON.stringify({ firstName: elements.setupFirstName.value, lastName: elements.setupLastName.value, email: elements.setupEmail.value, password: elements.setupPassword.value, setupToken: elements.setupToken.value }) }); elements.setupForm.hidden = true; elements.loginForm.hidden = false; elements.loginEmail.value = elements.setupEmail.value; elements.authMessage.textContent = "Superadministrator angelegt. Jetzt sicher anmelden."; }
    catch (error) { elements.authMessage.textContent = error.message; }
  });
  elements.navigation.addEventListener("click", (event) => { const button = event.target.closest("[data-platform-view]"); if (button) void selectView(button.dataset.platformView); });
  elements.menuToggle.addEventListener("click", () => elements.shell.classList.toggle("is-menu-open"));
  elements.refresh.addEventListener("click", () => void loadCurrentView());
  elements.search.addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { currentPage = 1; void loadCurrentView(); }, 250); });
  elements.filter.addEventListener("change", () => { currentPage = 1; void loadCurrentView(); });
  elements.pagePrevious.addEventListener("click", () => { currentPage -= 1; void loadCurrentView(); });
  elements.pageNext.addEventListener("click", () => { currentPage += 1; void loadCurrentView(); });
  elements.create.addEventListener("click", () => openCreateAction(currentView === "companies" ? "company" : resources[currentView].create));
  elements.logout.addEventListener("click", async () => { try { await request("session", { method: "DELETE" }); } finally { showAuth(); } });
  elements.companyDialogClose.addEventListener("click", () => elements.companyDialog.close());
  elements.companyDialog.addEventListener("cancel", (event) => { event.preventDefault(); elements.companyDialog.close(); });
  elements.companyForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const reason = elements.companyReason.value.trim();
    if (reason.length < 3) { elements.companyDialogMessage.textContent = "Bitte eine nachvollziehbare Begründung eingeben."; return; }
    let criticalConfirmation = null;
    const criticalStatusChanged = ["suspended", "cancelled", "archived", "pending_deletion"].includes(elements.companyStatus.value)
      && elements.companyStatus.value !== currentCompany.company.status;
    const criticalDateChanged = elements.companyCancellationRecorded.value !== localDateTime(currentCompany.company.cancellationRecordedAt)
      || elements.companyDeletionScheduled.value !== localDateTime(currentCompany.company.deletionScheduledAt);
    if (criticalStatusChanged || criticalDateChanged) {
      criticalConfirmation = window.prompt(
        `Diese kritische Statusänderung wird unveränderbar protokolliert. Zur Bestätigung Kundennummer ${currentCompany.company.companyNumber} eingeben:`
      );
      if (criticalConfirmation !== currentCompany.company.companyNumber) {
        elements.companyDialogMessage.textContent = "Die Kundennummer stimmt nicht. Es wurde nichts geändert.";
        return;
      }
    }
    try {
      const payload = { rowVersion: Number(elements.companyRowVersion.value), reason, confirmation: criticalConfirmation };
      if (can("companies.manage")) Object.assign(payload, {
        legalName: elements.companyLegalName.value,
        displayName: elements.companyDisplayName.value,
        contactName: elements.companyContactName.value || null,
        contactEmail: elements.companyContactEmail.value || null,
        phone: elements.companyPhone.value || null,
        street: elements.companyStreet.value || null,
        houseNumber: elements.companyHouseNumber.value || null,
        postalCode: elements.companyPostalCode.value || null,
        city: elements.companyCity.value || null,
        userLimit: elements.companyUserLimit.value ? Number(elements.companyUserLimit.value) : null,
        storageLimitBytes: elements.companyStorageLimit.value ? Number(elements.companyStorageLimit.value) : null,
        deletionScheduledAt: elements.companyDeletionScheduled.value
          ? new Date(elements.companyDeletionScheduled.value).toISOString() : null
      });
      if (can("companies.manage") || can("companies.trials")) {
        payload.trialEndsAt = elements.companyTrialEnds.value
          ? new Date(elements.companyTrialEnds.value).toISOString() : null;
      }
      if (can("companies.manage") || can("contracts.assign") || can("contracts.manage")) {
        payload.licensePlan = elements.companyLicensePlan.value;
        payload.licenseValidUntil = elements.companyLicenseValidUntil.value
          ? new Date(elements.companyLicenseValidUntil.value).toISOString() : null;
        payload.contractEndsAt = elements.companyContractEnds.value
          ? new Date(elements.companyContractEnds.value).toISOString() : null;
        payload.cancellationRecordedAt = elements.companyCancellationRecorded.value
          ? new Date(elements.companyCancellationRecorded.value).toISOString() : null;
      }
      if (
        can("companies.manage") || can("contracts.manage") || can("contracts.assign")
        || (can("companies.trials") && ["trial", "active"].includes(elements.companyStatus.value))
      ) payload.status = elements.companyStatus.value;
      await request(`companies/${encodeURIComponent(elements.companyId.value)}`, { method: "PATCH", body: JSON.stringify(payload) });
      elements.companyDialogMessage.textContent = "Firmendaten sicher gespeichert."; await openCompany(elements.companyId.value, false); await loadCompanies();
    } catch (error) { elements.companyDialogMessage.textContent = error.message; }
  });
  elements.companyContractAssign.addEventListener("click", async () => {
    const reason = elements.companyReason.value.trim();
    if (reason.length < 3) { elements.companyDialogMessage.textContent = "Bitte zuerst eine Begründung im Firmenformular eintragen."; return; }
    if (!elements.companyContractVersion.value) { elements.companyDialogMessage.textContent = "Bitte zuerst eine Tarifversion anlegen und auswählen."; return; }
    const confirmation = window.prompt(
      `Neue Vertragsversion zuweisen? Der bisherige Preisstand bleibt erhalten. Zur Bestätigung Kundennummer ${currentCompany.company.companyNumber} eingeben:`
    );
    if (confirmation !== currentCompany.company.companyNumber) {
      elements.companyDialogMessage.textContent = "Die Kundennummer stimmt nicht. Der Vertrag wurde nicht geändert.";
      return;
    }
    elements.companyContractAssign.disabled = true;
    try {
      await request(`companies/${encodeURIComponent(currentCompany.company.id)}/contracts`, {
        method: "POST",
        body: JSON.stringify({
          planVersionId: elements.companyContractVersion.value,
          status: elements.companyContractStatus.value,
          billingCycle: elements.companyContractCycle.value,
          discountPercent: Number(elements.companyContractDiscount.value || 0),
          startsAt: elements.companyContractStarts.value
            ? new Date(elements.companyContractStarts.value).toISOString() : null,
          endsAt: elements.companyContractNewEnds.value
            ? new Date(elements.companyContractNewEnds.value).toISOString() : null,
          trialEndsAt: elements.companyContractTrialEnds.value
            ? new Date(elements.companyContractTrialEnds.value).toISOString() : null,
          goodwillUntil: elements.companyContractGoodwill.value
            ? new Date(elements.companyContractGoodwill.value).toISOString() : null,
          monthlyPriceCents: optionalNumber(elements.companyContractMonthlyPrice.value),
          annualPriceCents: optionalNumber(elements.companyContractAnnualPrice.value),
          userLimit: optionalNumber(elements.companyContractUserLimit.value),
          storageLimitBytes: optionalNumber(elements.companyContractStorageLimit.value),
          cancellationNoticeDays: optionalNumber(elements.companyContractNoticeDays.value),
          minimumTermMonths: optionalNumber(elements.companyContractMinimumTerm.value),
          modules: elements.companyContractModules.value
            ? textList(elements.companyContractModules.value) : null,
          specialTerms: elements.companyContractTerms.value || null,
          confirmation,
          reason
        })
      });
      elements.companyDialogMessage.textContent = "Tarifversion zugewiesen · der historische Vertrag bleibt erhalten.";
      await openCompany(currentCompany.company.id, false);
    } catch (error) { elements.companyDialogMessage.textContent = error.message; }
    finally { elements.companyContractAssign.disabled = false; }
  });
  elements.supportAccessStart.addEventListener("click", async () => {
    const reasonDetail = elements.supportAccessDetail.value.trim();
    if (reasonDetail.length < 3 || !window.confirm("Protokollierten, auf 60 Minuten begrenzten Supportmodus starten?")) return;
    try {
      const body = await request("support-access", { method: "POST", body: JSON.stringify({ companyId: currentCompany.company.id, reasonCode: elements.supportAccessReason.value, reasonDetail, supportTicketId: elements.supportAccessTicket.value || null }) });
      supportMode = {
        id: body.supportAccess.id,
        companyName: currentCompany.company.displayName,
        reason: reasonDetail,
        expiresAt: body.supportAccess.expiresAt
      };
      sessionStorage.setItem("schaefchen.platform.support", JSON.stringify(supportMode)); showSupportBanner(); elements.companySupportAccess.hidden = true; elements.companyDialog.close();
    } catch (error) { elements.companyDialogMessage.textContent = error.message; }
  });
  elements.supportEnd.addEventListener("click", async () => {
    if (!supportMode || !window.confirm("Supportmodus jetzt vollständig beenden?")) return;
    try { await request(`support-access/${encodeURIComponent(supportMode.id)}/end`, { method: "POST", body: JSON.stringify({ reason: "Supportmodus bewusst beendet" }) }); }
    catch (error) { elements.message.textContent = error.message; return; }
    clearSupportMode();
  });
  elements.actionClose.addEventListener("click", () => elements.actionDialog.close());
  elements.actionDialog.addEventListener("cancel", (event) => { event.preventDefault(); elements.actionDialog.close(); });
  elements.actionForm.addEventListener("submit", async (event) => {
    event.preventDefault(); elements.actionMessage.textContent = "Aktion wird validiert und protokolliert …";
    try {
      const result = await submitAction();
      if (result?.invitationToken) {
        showInvitationToken(result.invitationToken);
        await loadCurrentView();
        return;
      }
      elements.actionDialog.close(); await loadCurrentView();
    }
    catch (error) { elements.actionMessage.textContent = error.message; }
  });

  (async () => {
    try {
      const body = await request("session");
      await enterPlatform(body.session);
    } catch (error) {
      showAuth();
      try { const { setup } = await request("setup"); elements.setupForm.hidden = !setup.required; elements.loginForm.hidden = setup.required; }
      catch (setupError) { elements.authMessage.textContent = setupError.message; }
    }
  })();
})();
