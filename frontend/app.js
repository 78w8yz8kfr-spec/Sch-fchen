(() => {
  const STORAGE_KEY = "schaefchen.sprint2.demo.v1";
  const assignments = [
    {
      title: "Demo · Musterstraße 12",
      meta: "07:30 Uhr · Verteilung erneuern"
    },
    {
      title: "Demo · Hafenweg 4",
      meta: "Danach · Beleuchtung prüfen"
    }
  ];

  const elements = {
    loginView: document.querySelector("#login-view"),
    dashboardView: document.querySelector("#dashboard-view"),
    loginForm: document.querySelector("#login-form"),
    loginMessage: document.querySelector("#login-message"),
    passwordInput: document.querySelector("#password"),
    togglePassword: document.querySelector("#toggle-password"),
    openPreview: document.querySelector("#open-preview"),
    closePreview: document.querySelector("#close-preview"),
    primaryAction: document.querySelector("#primary-action"),
    primaryActionIcon: document.querySelector("#primary-action-icon"),
    primaryActionLabel: document.querySelector("#primary-action-label"),
    secondaryAction: document.querySelector("#secondary-action"),
    workdayTitle: document.querySelector("#workday-title"),
    startTime: document.querySelector("#start-time"),
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
    toast: document.querySelector("#toast")
  };

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
    try {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
      if (saved?.version === 1 && saved.workDate === localDateKey() && Array.isArray(saved.events)) {
        return saved;
      }
    } catch {
      // Ein blockierter Speicher darf die Demo nicht unbenutzbar machen.
    }
    return initialState();
  }

  function saveState() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      showToast("Lokaler Speicher ist in diesem Browser blockiert.");
    }
  }

  function createClientEntryId() {
    if (window.crypto?.randomUUID) {
      return window.crypto.randomUUID();
    }
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
    }, 3200);
  }

  function showDashboard() {
    elements.loginView.hidden = true;
    elements.dashboardView.hidden = false;
    document.title = "Start · Schäfchen";
    render();
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function showLogin() {
    elements.dashboardView.hidden = true;
    elements.loginView.hidden = false;
    document.title = "Schäfchen";
    elements.loginForm.reset();
    elements.loginMessage.textContent = "";
  }

  function currentSiteIndex() {
    return Math.min(
      state.events.filter((entry) => entry.type === "next_site").length,
      assignments.length - 1
    );
  }

  function lastEvent() {
    return state.events.at(-1);
  }

  function addEntry(type, siteIndex = null) {
    const recordedAt = new Date().toISOString();
    state.events.push({
      id: createClientEntryId(),
      clientEntryId: createClientEntryId(),
      clientCreatedAt: recordedAt,
      type,
      recordedAt,
      siteIndex,
      source: navigator.onLine ? "employee" : "offline",
      pendingSync: true
    });
    saveState();
    render();
    showToast("Lokal gespeichert · eindeutige Offline-ID angelegt.");
  }

  function handlePrimaryAction() {
    const latest = lastEvent();
    const siteIndex = currentSiteIndex();

    if (!latest) {
      addEntry("clock_in");
    } else if (latest.type === "clock_in" || latest.type === "next_site") {
      addEntry("site_arrival", siteIndex);
    } else if (latest.type === "site_arrival") {
      addEntry("site_departure", siteIndex);
    } else if (latest.type === "site_departure" && siteIndex < assignments.length - 1) {
      addEntry("next_site", siteIndex + 1);
    } else if (latest.type === "site_departure") {
      addEntry("clock_out");
    }
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

    if (latest.type === "clock_in") {
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
      ? "Der lokale Stundenzettel ist vollständig"
      : "Jede Buchung erhält eine eindeutige Offline-ID";
  }

  function renderAssignment() {
    const siteIndex = currentSiteIndex();
    const assignment = assignments[siteIndex];
    const latest = lastEvent();
    let status = assignment.meta;

    if (latest?.type === "clock_in" && siteIndex === 0) {
      status = "Anfahrt läuft · " + assignment.meta;
    } else if (latest?.type === "site_arrival") {
      status = "Vor Ort · " + assignment.meta;
    } else if (latest?.type === "site_departure") {
      status = "Einsatz beendet · " + assignment.meta;
    } else if (latest?.type === "next_site") {
      status = "Nächster Einsatz · " + assignment.meta;
    } else if (latest?.type === "clock_out") {
      status = "Alle Einsätze für heute abgeschlossen";
    }

    elements.assignmentOrder.textContent = `${siteIndex + 1} von ${assignments.length}`;
    elements.assignmentTitle.textContent = assignment.title;
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
      if (!["clock_in", "site_departure"].includes(entry.type)) {
        return;
      }
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

    const clockIn = state.events.find((entry) => entry.type === "clock_in");
    elements.startTime.textContent = clockIn ? timeFormatter.format(new Date(clockIn.recordedAt)) : "– – : – –";
  }

  function entryLabel(entry) {
    const labels = {
      clock_in: "Arbeitstag gestartet",
      site_arrival: "Auf Baustelle angekommen",
      site_departure: "Baustelle verlassen",
      next_site: "Nächste Baustelle gewählt",
      clock_out: "Feierabend"
    };
    const site = entry.siteIndex === null || entry.siteIndex === undefined
      ? ""
      : ` · ${assignments[entry.siteIndex].title.replace("Demo · ", "")}`;
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
      meta.textContent = `${timeFormatter.format(new Date(entry.recordedAt))} · lokal vorgemerkt`;
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
  }

  function updateConnectionState() {
    const online = navigator.onLine;
    elements.connectionState.classList.toggle("connection-state--offline", !online);
    elements.connectionState.querySelector("span").textContent = online ? "Online" : "Offline";
  }

  function activateNavigation(activeButton) {
    [elements.navStart, elements.navWeek, elements.navMore].forEach((button) => {
      const active = button === activeButton;
      button.classList.toggle("nav-item--active", active);
      if (active) {
        button.setAttribute("aria-current", "page");
      } else {
        button.removeAttribute("aria-current");
      }
    });
  }

  elements.loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    elements.loginMessage.textContent = "Der sichere Server-Login folgt mit der API. Bitte nutze die Demo.";
  });

  elements.togglePassword.addEventListener("click", () => {
    const show = elements.passwordInput.type === "password";
    elements.passwordInput.type = show ? "text" : "password";
    elements.togglePassword.setAttribute("aria-label", show ? "Passwort verbergen" : "Passwort anzeigen");
  });

  elements.openPreview.addEventListener("click", showDashboard);
  elements.closePreview.addEventListener("click", showLogin);
  elements.primaryAction.addEventListener("click", handlePrimaryAction);
  elements.secondaryAction.addEventListener("click", () => addEntry("clock_out"));
  elements.assignmentDetails.addEventListener("click", () => {
    showToast("Zwei Demo-Einsätze · Reihenfolge ist verbindlich, Uhrzeiten sind optional.");
  });
  elements.showWeek.addEventListener("click", () => {
    document.querySelector("#week-title").scrollIntoView({ behavior: "smooth", block: "center" });
  });
  elements.resetDemo.addEventListener("click", () => {
    if (!window.confirm("Alle lokalen Demo-Buchungen auf diesem Gerät zurücksetzen?")) {
      return;
    }
    state = initialState();
    saveState();
    render();
    showToast("Lokale Demo wurde zurückgesetzt.");
  });

  elements.navStart.addEventListener("click", () => {
    activateNavigation(elements.navStart);
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  elements.navWeek.addEventListener("click", () => {
    activateNavigation(elements.navWeek);
    document.querySelector("#week-title").scrollIntoView({ behavior: "smooth", block: "center" });
  });
  elements.navMore.addEventListener("click", () => {
    activateNavigation(elements.navMore);
    elements.infoCard.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  elements.todayLabel.textContent = dateFormatter.format(new Date());
  updateConnectionState();
  render();
  window.setInterval(renderTimes, 15000);
  window.addEventListener("online", updateConnectionState);
  window.addEventListener("offline", updateConnectionState);

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {
        // Die App bleibt auch ohne Service Worker als normale Website nutzbar.
      });
    });
  }
})();
