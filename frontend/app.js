(() => {
  const loginView = document.querySelector("#login-view");
  const dashboardView = document.querySelector("#dashboard-view");
  const loginForm = document.querySelector("#login-form");
  const loginMessage = document.querySelector("#login-message");
  const passwordInput = document.querySelector("#password");
  const togglePassword = document.querySelector("#toggle-password");
  const openPreview = document.querySelector("#open-preview");
  const closePreview = document.querySelector("#close-preview");
  const primaryAction = document.querySelector("#primary-action");
  const primaryActionIcon = document.querySelector("#primary-action-icon");
  const primaryActionLabel = document.querySelector("#primary-action-label");
  const workdayTitle = document.querySelector("#workday-title");
  const startTime = document.querySelector("#start-time");
  const actionHint = document.querySelector("#action-hint");
  const connectionState = document.querySelector("#connection-state");
  const todayLabel = document.querySelector("#today-label");
  const weekStrip = document.querySelector("#week-strip");
  const toast = document.querySelector("#toast");

  let workdayStarted = false;
  let toastTimer;

  const dateFormatter = new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "long"
  });

  const timeFormatter = new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit"
  });

  const showToast = (message) => {
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.hidden = false;
    toastTimer = window.setTimeout(() => {
      toast.hidden = true;
    }, 3200);
  };

  const showDashboard = () => {
    loginView.hidden = true;
    dashboardView.hidden = false;
    document.title = "Start · Schäfchen";
    window.scrollTo({ top: 0, behavior: "instant" });
  };

  const showLogin = () => {
    dashboardView.hidden = true;
    loginView.hidden = false;
    document.title = "Schäfchen";
    workdayStarted = false;
    workdayTitle.textContent = "Noch nicht gestartet";
    startTime.textContent = "– – : – –";
    primaryActionIcon.textContent = "▶";
    primaryActionLabel.textContent = "Arbeitstag starten";
    actionHint.textContent = "Dein nächster logischer Schritt";
    loginForm.reset();
    loginMessage.textContent = "";
  };

  const renderWeek = () => {
    const today = new Date();
    const weekday = today.getDay() || 7;
    const monday = new Date(today);
    monday.setDate(today.getDate() - weekday + 1);

    weekStrip.replaceChildren();

    for (let offset = 0; offset < 5; offset += 1) {
      const date = new Date(monday);
      date.setDate(monday.getDate() + offset);
      const item = document.createElement("div");
      const dayName = new Intl.DateTimeFormat("de-DE", { weekday: "short" })
        .format(date)
        .replace(".", "");
      const isToday = date.toDateString() === today.toDateString();

      item.className = `day-pill${isToday ? " day-pill--today" : ""}`;
      item.setAttribute("aria-label", `${dayName}, ${date.getDate()}.`);
      item.innerHTML = `<span>${dayName}</span><strong>${date.getDate()}</strong>`;
      weekStrip.append(item);
    }
  };

  const updateConnectionState = () => {
    const online = navigator.onLine;
    connectionState.classList.toggle("connection-state--offline", !online);
    connectionState.querySelector("span").textContent = online ? "Online" : "Offline";
  };

  loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    loginMessage.textContent = "Der sichere Server-Login folgt mit der API. Bitte nutze die Vorschau.";
  });

  togglePassword.addEventListener("click", () => {
    const show = passwordInput.type === "password";
    passwordInput.type = show ? "text" : "password";
    togglePassword.setAttribute("aria-label", show ? "Passwort verbergen" : "Passwort anzeigen");
  });

  openPreview.addEventListener("click", showDashboard);
  closePreview.addEventListener("click", showLogin);

  primaryAction.addEventListener("click", () => {
    if (workdayStarted) {
      showToast("Die Baustellenbuchung folgt in der nächsten Phase.");
      return;
    }

    workdayStarted = true;
    workdayTitle.textContent = "Arbeitstag läuft";
    startTime.textContent = timeFormatter.format(new Date());
    primaryActionIcon.textContent = "→";
    primaryActionLabel.textContent = "Zur Baustelle";
    actionHint.textContent = "Nur lokale Vorschau – keine Zeit wurde gespeichert";
    showToast("Vorschaustatus gestartet. Es wurden keine Daten gespeichert.");
  });

  document.querySelectorAll(".planned-feature").forEach((button) => {
    button.addEventListener("click", () => {
      showToast("Diese Funktion wird in ihrer vorgesehenen Phase angeschlossen.");
    });
  });

  todayLabel.textContent = dateFormatter.format(new Date());
  renderWeek();
  updateConnectionState();
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
