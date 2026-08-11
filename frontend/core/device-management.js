const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const QR_SCANNER_MODULE_URL = "../vendor/qr-scanner.min.js?v=0.44.26";
let qrScannerLibraryPromise = null;

export const DEVICE_QR_SHEET_LAYOUT = Object.freeze({
  maxLabels: 120,
  columns: 10,
  rows: 12,
  pageWidthMm: 210,
  pageHeightMm: 297,
  pageMarginMm: 5,
  cellWidthMm: 19.8,
  cellHeightMm: 23.5,
  gapMm: 0.2,
  qrSizeMm: 18
});

export function deviceQrSheetStyles() {
  const layout = DEVICE_QR_SHEET_LAYOUT;
  const printableWidth = layout.pageWidthMm - (2 * layout.pageMarginMm);
  const printableHeight = layout.pageHeightMm - (2 * layout.pageMarginMm);
  return `
    @page{size:A4 portrait;margin:${layout.pageMarginMm}mm}
    *{box-sizing:border-box}
    html,body{margin:0;padding:0}
    body{font-family:system-ui,-apple-system,sans-serif;color:#111}
    .sheet{display:grid;grid-template-columns:repeat(${layout.columns},${layout.cellWidthMm}mm);grid-auto-rows:${layout.cellHeightMm}mm;gap:${layout.gapMm}mm;width:${printableWidth}mm;align-content:start}
    .label{display:grid;grid-template-rows:${layout.qrSizeMm}mm 2.2mm 2.2mm;align-items:center;overflow:hidden;border:.15mm solid #aaa;padding:.3mm;text-align:center;break-inside:avoid;page-break-inside:avoid}
    .label__qr{display:grid;place-items:center;width:${layout.qrSizeMm}mm;height:${layout.qrSizeMm}mm;margin:auto}
    .label svg{display:block;width:${layout.qrSizeMm}mm;height:${layout.qrSizeMm}mm;max-width:${layout.qrSizeMm}mm;max-height:${layout.qrSizeMm}mm}
    .label strong,.label span{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:2.2mm}
    .label strong{font-size:4.5pt}
    .label span{font-size:4.2pt}
    @media screen{body{min-width:${layout.pageWidthMm}mm;padding:${layout.pageMarginMm}mm;background:#f4f4f5}.sheet{margin:auto;background:#fff}}
    @media print{html,body{width:${printableWidth}mm;height:${printableHeight}mm;overflow:hidden}.label{border-color:#000}}
  `;
}

function loadQrScannerLibrary() {
  if (!qrScannerLibraryPromise) {
    qrScannerLibraryPromise = import(QR_SCANNER_MODULE_URL)
      .then((module) => module.default)
      .catch((error) => {
        qrScannerLibraryPromise = null;
        throw error;
      });
  }
  return qrScannerLibraryPromise;
}

export function qrScanResultValue(result) {
  return typeof result === "string" ? result : result?.data || "";
}

export function cameraScanErrorMessage(error) {
  const name = String(error?.name || "");
  const detail = String(error?.message || error || "").toLocaleLowerCase("de-DE");
  if (["NotAllowedError", "SecurityError"].includes(name)
      || /permission|not allowed|denied|berechtigung/.test(detail)) {
    return "Kamerazugriff wurde nicht erlaubt. Bitte in den Browser-Einstellungen die Kamera für Schäfchen freigeben.";
  }
  if (name === "NotFoundError" || /camera not found|keine kamera/.test(detail)) {
    return "Auf diesem Gerät wurde keine verwendbare Kamera gefunden. QR-Foto wählen oder Adresse einfügen.";
  }
  if (["NotReadableError", "AbortError"].includes(name) || /could not start video source/.test(detail)) {
    return "Die Kamera wird bereits von einer anderen App verwendet. Andere Kamera-App schließen und erneut versuchen.";
  }
  return "Kamera konnte nicht gestartet werden. QR-Foto wählen oder Adresse einfügen.";
}

export function normalizeDeviceQrValue(value) {
  let token = String(value || "").trim();
  try {
    const basis = typeof window === "undefined" ? "https://example.invalid/" : window.location.href;
    const encoded = new URL(token, basis).searchParams.get("device");
    if (encoded) token = encoded;
  } catch {
    // Reiner Token.
  }
  if (!UUID.test(token)) throw new Error("Dieser QR-Code gehört nicht zu Schäfchen.");
  return token.toLowerCase();
}

export function partitionMyDevices(devices, userId) {
  return {
    withMe: devices.filter((device) => device.currentOwner?.id === userId),
    fixed: devices.filter((device) => device.fixedOwner?.id === userId),
    elsewhere: devices.filter((device) => (
      device.fixedOwner?.id === userId && device.currentOwner
        && device.currentOwner.id !== userId
    ))
  };
}

const DEVICE_MANAGER_ROLES = new Set([
  "admin", "managing_director", "dispatch_office", "office", "planner",
  "executive_assistant"
]);

export function canManageDevicesFromSession(session) {
  return (session?.user?.roles || []).some((role) => DEVICE_MANAGER_ROLES.has(role));
}

export function includedPartIsEmpty(part = {}) {
  const meaningful = [
    part.name, part.categoryId, part.serialNumber, part.model,
    part.batterySystem, part.voltage, part.capacityAh
  ];
  return meaningful.every((value) => String(value ?? "").trim() === "")
    && part.inspectionRequired !== true;
}

export function deviceStatusLabel(status) {
  return ({
    available: "Verfügbar",
    fixed_assigned: "Fest zugeordnet",
    loaned: "Ausgeliehen",
    on_site: "Auf Baustelle",
    in_storage: "Im Lager",
    repair: "In Reparatur",
    defective: "Defekt",
    inspection_due: "Prüfung fällig",
    locked: "Gesperrt",
    lost: "Verloren",
    retired: "Ausgemustert"
  })[status] || status || "Unbekannt";
}

function inventoryResultLabel(result) {
  return ({
    found: "gefunden",
    missing: "fehlt",
    wrong_location: "falscher Standort",
    wrong_owner: "falscher Besitzer",
    unexpected: "nicht im Sollbestand",
    unknown: "unbekanntes Gerät"
  })[result] || result;
}

export function offlineDeviceQueueKey(session) {
  return `schaefchen-device-queue-v1:${session?.company?.number || "unknown"}:${session?.user?.id || "unknown"}`;
}

const VIEW_LABELS = new Map([
  ["overview", "Übersicht"],
  ["mine", "Meine Geräte"],
  ["tools", "Maschinen & Werkzeuge"],
  ["batteries", "Akkus"],
  ["sets", "Sets & Teile"],
  ["loans", "Ausgabe & Rückgabe"],
  ["scanner", "QR-Scanner"],
  ["inspections", "Prüfungen & Wartung"],
  ["inventory", "Inventur"],
  ["history", "Historie"]
]);

const html = `
  <div class="device-module">
    <header class="device-module__heading">
      <div>
        <p class="eyebrow">Betriebsmittelverwaltung</p>
        <h1>Maschinen & Geräte</h1>
        <p class="device-module__intro">Werkzeug finden, übernehmen und zurückgeben – direkt per QR-Code.</p>
      </div>
      <div class="device-module__heading-actions">
        <button class="button button--action device-scan-now" type="button">
          <span aria-hidden="true">▣</span> QR-Code scannen
        </button>
        <button class="button button--secondary device-new" type="button" hidden>Gerät anlegen</button>
      </div>
    </header>

    <div class="device-sync-state" role="status" hidden></div>
    <nav class="device-tabs" aria-label="Bereiche von Maschinen und Geräten"></nav>

    <section class="device-metrics" aria-label="Gerätekennzahlen"></section>

    <div class="device-toolbar">
      <label class="device-search">
        <span class="visually-hidden">Geräte durchsuchen</span>
        <input type="search" maxlength="100" placeholder="Inventarnummer, Seriennummer, Gerät, Mitarbeiter, Baustelle …">
      </label>
      <select class="device-status-filter" aria-label="Status filtern">
        <option value="">Alle Status</option>
        <option value="available">Verfügbar</option>
        <option value="fixed_assigned">Fest zugeordnet</option>
        <option value="loaned">Ausgeliehen</option>
        <option value="on_site">Auf Baustelle</option>
        <option value="in_storage">Im Lager</option>
        <option value="inspection_due">Prüfung fällig</option>
        <option value="locked">Gesperrt / defekt</option>
        <option value="retired">Ausgemustert</option>
      </select>
      <button class="button button--secondary device-print-sheet" type="button" hidden>QR-Druckbogen</button>
    </div>

    <p class="device-message" role="status"></p>
    <section class="device-content" aria-live="polite"></section>

    <dialog class="device-dialog device-detail-dialog" aria-labelledby="device-detail-title">
      <form method="dialog" class="device-dialog__frame">
        <button class="device-dialog__close" value="close" aria-label="Gerät schließen">×</button>
        <div class="device-detail"></div>
      </form>
    </dialog>

    <dialog class="device-dialog device-scan-dialog" aria-labelledby="device-scan-title">
      <div class="device-dialog__frame device-scanner">
        <button class="device-dialog__close device-scan-close" type="button" aria-label="Scanner schließen">×</button>
        <p class="eyebrow">Schnelle Übernahme</p>
        <h2 id="device-scan-title">QR-Code scannen</h2>
        <p>Kamera auf das Schäfchen-Etikett halten. Ein freies Gerät wird sofort dir zugeordnet.</p>
        <div class="device-scanner__camera">
          <video class="device-scanner-video" playsinline muted></video>
          <span class="device-scanner__frame" aria-hidden="true"></span>
        </div>
        <p class="device-scan-message" role="status">Kamera wird vorbereitet …</p>
        <form class="device-scan-manual">
          <label>QR-Adresse oder Token
            <input class="device-scan-value" autocomplete="off" inputmode="url" placeholder="Hier einfügen">
          </label>
          <button class="button button--secondary" type="submit">Code prüfen</button>
        </form>
        <label class="button button--secondary device-scan-image">
          QR-Foto auswählen
          <input class="device-scan-image-input" type="file" accept="image/*" capture="environment" hidden>
        </label>
      </div>
    </dialog>

    <dialog class="device-dialog device-editor-dialog" aria-labelledby="device-editor-title">
      <form class="device-dialog__frame device-editor-form" novalidate>
        <button class="device-dialog__close device-editor-close" type="button" aria-label="Bearbeitung schließen">×</button>
        <p class="eyebrow">Inventarstammdaten</p>
        <h2 id="device-editor-title">Gerät anlegen</h2>
        <p class="device-editor-intro">Nach dem Speichern erzeugt Schäfchen automatisch das sichere QR-Etikett. Seriennummer, Besitzer und beiliegende Teile bleiben am jeweiligen Gegenstand nachvollziehbar.</p>
        <section class="device-editor-section">
          <h3>1 · Gerät erkennen</h3>
          <div class="device-editor-grid">
            <label>Inventarnummer *<input name="inventoryNumber" maxlength="50" required placeholder="z. B. M0042"></label>
            <label>Bezeichnung *<input name="name" maxlength="180" required placeholder="z. B. Bosch Bohrhammer"></label>
            <label>Kategorie *<select name="categoryId" required></select></label>
            <button class="button button--secondary device-category-new" type="button">Kategorie ergänzen</button>
            <label>Hersteller<input name="manufacturer" maxlength="120"></label>
            <label>Modell<input name="model" maxlength="120"></label>
            <label>Seriennummer<input name="serialNumber" maxlength="160" placeholder="Vom Typenschild ablesen"></label>
            <label>Gerätefoto<input name="photo" type="file" accept="image/jpeg,image/png,image/webp" capture="environment"></label>
          </div>
        </section>
        <details class="device-editor-section" open>
          <summary>2 · Besitzer & Standort</summary>
          <div class="device-editor-grid">
            <label>Fester Besitzer<select name="fixedOwnerUserId"><option value="">Niemand</option></select></label>
            <label>Aktueller Besitzer<select name="currentOwnerUserId"><option value="">Niemand / verfügbar</option></select></label>
            <label>Standort<select name="locationId"><option value="">Kein Standort</option></select></label>
            <button class="button button--secondary device-location-new" type="button">Standort ergänzen</button>
            <label>Baustelle<select name="constructionSiteId"><option value="">Keine Baustelle</option></select></label>
            <label>Fahrzeug<select name="vehicleId"><option value="">Kein Fahrzeug</option></select></label>
            <label>Zustand<select name="condition">
              <option value="new">Neu</option><option value="ok" selected>OK</option>
              <option value="worn">Gebraucht</option><option value="damaged">Beschädigt</option>
              <option value="defective">Defekt</option><option value="unknown">Unbekannt</option>
            </select></label>
            <label>Status<select name="status">
              <option value="available">Verfügbar</option><option value="fixed_assigned">Fest zugeordnet</option>
              <option value="loaned">Ausgeliehen</option><option value="on_site">Auf Baustelle</option>
              <option value="in_storage">Im Lager</option><option value="repair">In Reparatur</option>
              <option value="defective">Defekt</option><option value="locked">Gesperrt</option>
              <option value="lost">Verloren</option>
            </select></label>
          </div>
        </details>
        <details class="device-editor-section">
          <summary>3 · Kauf, Prüfung & Wartung</summary>
          <div class="device-editor-grid">
            <label>Kaufdatum<input name="purchaseDate" type="date"></label>
            <label>Kaufpreis brutto (€)<input name="purchasePrice" type="number" min="0" step="0.01"></label>
            <label>Lieferant<input name="supplier" maxlength="160"></label>
            <label>Garantie bis<input name="warrantyUntil" type="date"></label>
            <label class="device-check"><input name="inspectionRequired" type="checkbox"> Wiederkehrende Prüfung erforderlich</label>
            <label>Nächster Prüftermin<input name="nextInspectionOn" type="date"></label>
            <label>Wartungsintervall (Tage)<input name="maintenanceIntervalDays" type="number" min="1" max="3650"></label>
            <label>Nächste Wartung<input name="nextMaintenanceOn" type="date"></label>
          </div>
        </details>
        <fieldset class="device-battery-fields" hidden>
          <legend>Akkuangaben</legend>
          <div class="device-editor-grid">
            <label>Akkusystem *<input name="batterySystem" maxlength="100"></label>
            <label>Spannung (V)<input name="voltage" type="number" min="0.01" step="0.01"></label>
            <label>Kapazität (Ah)<input name="capacityAh" type="number" min="0.01" step="0.01"></label>
            <label>Ladezyklen<input name="cycleCount" type="number" min="0" step="1"></label>
            <label>Letzter Kapazitätstest<input name="lastCapacityTestOn" type="date"></label>
            <label>Gemessene Restkapazität (%)<input name="remainingCapacityPercent" type="number" min="0" max="100" step="0.1"></label>
            <label>Kompatibles System<input name="compatibleSystem" maxlength="160"></label>
          </div>
        </fieldset>
        <fieldset class="device-included-parts" hidden>
          <legend>4 · Beiliegende Teile / Koffer</legend>
          <p>Akku, Ladegerät, Messgerät oder Koffer werden als eigene Gegenstände erfasst. Jedes Teil erhält eine Inventarnummer, optional eine Seriennummer und einen eigenen QR-Code.</p>
          <div class="device-part-list"></div>
          <button class="button button--secondary device-part-add" type="button">+ Beiliegendes Teil hinzufügen</button>
          <div class="device-set-fields" hidden>
            <label>Setnummer *<input name="setNumber" maxlength="40" placeholder="z. B. SET-12"></label>
            <label>Setbezeichnung *<input name="setName" maxlength="160" placeholder="z. B. Makita Koffer"></label>
          </div>
        </fieldset>
        <button class="button button--secondary device-included-parts-enable" type="button">+ Gerät hat beiliegende Teile</button>
        <label>Notizen<textarea name="note" maxlength="5000" rows="4"></textarea></label>
        <p class="device-editor-message" role="status"></p>
        <div class="device-dialog__actions">
          <button class="button button--action device-editor-save" type="submit">Gerät & QR anlegen</button>
          <button class="button button--secondary device-editor-retire" type="button" hidden>Ausmustern</button>
          <button class="button button--secondary device-editor-cancel" type="button">Abbrechen</button>
        </div>
      </form>
    </dialog>

    <dialog class="device-dialog device-created-dialog" aria-labelledby="device-created-title">
      <div class="device-dialog__frame device-created">
        <button class="device-dialog__close device-created-close" type="button" aria-label="Abschluss schließen">×</button>
        <p class="eyebrow">Inventar angelegt</p>
        <h2 id="device-created-title">QR-Etiketten sind bereit</h2>
        <p class="device-created-message"></p>
        <div class="device-created-list"></div>
        <div class="device-dialog__actions">
          <button class="button button--action device-created-print" type="button">Alle QR-Etiketten drucken</button>
          <button class="button button--secondary device-created-done" type="button">Fertig</button>
        </div>
      </div>
    </dialog>

    <dialog class="device-dialog device-set-dialog" aria-labelledby="device-set-title">
      <div class="device-dialog__frame">
        <button class="device-dialog__close device-set-close" type="button" aria-label="Set schließen">×</button>
        <p class="eyebrow">Geräteset</p>
        <div class="device-set-content"></div>
      </div>
    </dialog>

    <dialog class="device-dialog device-defect-dialog" aria-labelledby="device-defect-title">
      <form class="device-dialog__frame device-defect-form">
        <button class="device-dialog__close device-defect-close" type="button" aria-label="Meldung schließen">×</button>
        <p class="eyebrow">Sicherheit zuerst</p>
        <h2 id="device-defect-title">Defekt melden</h2>
        <label>Fehlerbeschreibung *<textarea name="description" minlength="3" maxlength="2000" rows="5" required></textarea></label>
        <label>Schweregrad<select name="severity"><option value="low">Niedrig</option><option value="medium" selected>Mittel</option><option value="high">Hoch</option><option value="critical">Kritisch</option></select></label>
        <label class="device-check"><input name="usable" type="checkbox"> Gerät kann sicher weiterverwendet werden</label>
        <label>Foto (optional)<input name="photo" type="file" accept="image/jpeg,image/png,image/webp" capture="environment"></label>
        <p class="device-defect-message" role="status"></p>
        <div class="device-dialog__actions"><button class="button button--action" type="submit">Defekt melden</button><button class="button button--secondary device-defect-cancel" type="button">Abbrechen</button></div>
      </form>
    </dialog>

    <dialog class="device-dialog device-inspection-dialog" aria-labelledby="device-inspection-title">
      <form class="device-dialog__frame device-inspection-form">
        <button class="device-dialog__close device-inspection-close" type="button" aria-label="Prüfung schließen">×</button>
        <p class="eyebrow">Prüfung & Wartung</p>
        <h2 id="device-inspection-title">Prüfung erfassen</h2>
        <div class="device-editor-grid">
          <label>Prüfart *<input name="inspectionType" value="Wiederkehrende Prüfung" maxlength="120" required></label>
          <label>Prüfdatum *<input name="inspectedOn" type="date" required></label>
          <label>Prüfer<select name="inspectorUserId"><option value="">Externer Prüfer</option></select></label>
          <label>Externer Prüfer<input name="inspectorName" maxlength="160"></label>
          <label>Ergebnis<select name="result"><option value="passed">Bestanden</option><option value="passed_with_notes">Bestanden mit Hinweis</option><option value="failed">Nicht bestanden – sperren</option></select></label>
          <label>Nächste Prüfung<input name="nextInspectionOn" type="date"></label>
          <label>Prüffrist (Tage)<input name="intervalDays" type="number" min="1" max="3650"></label>
        </div>
        <label>Notiz<textarea name="note" maxlength="3000" rows="3"></textarea></label>
        <p class="device-inspection-message" role="status"></p>
        <div class="device-dialog__actions"><button class="button button--action" type="submit">Prüfung speichern</button><button class="button button--secondary device-inspection-cancel" type="button">Abbrechen</button></div>
      </form>
    </dialog>

    <dialog class="device-dialog device-qr-dialog" aria-labelledby="device-qr-title">
      <div class="device-dialog__frame device-qr-label">
        <button class="device-dialog__close device-qr-close" type="button" aria-label="QR-Code schließen">×</button>
        <p class="eyebrow">Schäfchen Geräteetikett</p><h2 id="device-qr-title">QR-Code</h2>
        <img class="device-qr-image" alt="QR-Code des Geräts">
        <strong class="device-qr-name"></strong><span class="device-qr-number"></span>
        <div class="device-dialog__actions"><a class="button button--secondary device-qr-download" download>SVG herunterladen</a><button class="button button--action device-qr-print" type="button">Etikett drucken</button><button class="button button--secondary device-qr-rotate" type="button">Code ersetzen</button></div>
      </div>
    </dialog>
  </div>`;

function localDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDate(value, withTime = false) {
  if (!value) return "–";
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return new Intl.DateTimeFormat("de-DE", withTime
    ? { dateStyle: "short", timeStyle: "short" }
    : { dateStyle: "short" }).format(date);
}

function ageFromPurchaseDate(value) {
  if (!value) return null;
  const purchase = new Date(`${value}T12:00:00`);
  const now = new Date();
  let months = (now.getFullYear() - purchase.getFullYear()) * 12
    + now.getMonth() - purchase.getMonth();
  if (now.getDate() < purchase.getDate()) months -= 1;
  months = Math.max(0, months);
  if (months < 24) return `${months} Monate`;
  const years = Math.floor(months / 12);
  return `${years} Jahre, ${months % 12} Monate`;
}

function option(select, value, label) {
  const item = document.createElement("option");
  item.value = value;
  item.textContent = label;
  select.append(item);
}

function fileDataUrl(file) {
  if (!file) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result), { once: true });
    reader.addEventListener("error", () => reject(new Error("Das Foto konnte nicht gelesen werden.")), { once: true });
    reader.readAsDataURL(file);
  });
}

export function createDeviceModule({
  root,
  requestJson,
  showToast,
  createClientId,
  getSession,
  navigate,
  onNotificationsChanged = () => {}
}) {
  root.innerHTML = html;
  const q = (selector) => root.querySelector(selector);
  const elements = {
    tabs: q(".device-tabs"), metrics: q(".device-metrics"), content: q(".device-content"),
    search: q(".device-search input"), status: q(".device-status-filter"),
    message: q(".device-message"), sync: q(".device-sync-state"),
    scanNow: q(".device-scan-now"), add: q(".device-new"), printSheet: q(".device-print-sheet"),
    detailDialog: q(".device-detail-dialog"), detail: q(".device-detail"),
    scanDialog: q(".device-scan-dialog"), scanClose: q(".device-scan-close"),
    scanVideo: q(".device-scanner-video"), scanMessage: q(".device-scan-message"),
    scanForm: q(".device-scan-manual"), scanValue: q(".device-scan-value"),
    scanImage: q(".device-scan-image-input"),
    editorDialog: q(".device-editor-dialog"), editor: q(".device-editor-form"),
    editorTitle: q("#device-editor-title"), editorClose: q(".device-editor-close"),
    editorCancel: q(".device-editor-cancel"), editorRetire: q(".device-editor-retire"),
    categoryNew: q(".device-category-new"), locationNew: q(".device-location-new"),
    editorMessage: q(".device-editor-message"), batteryFields: q(".device-battery-fields"),
    includedParts: q(".device-included-parts"), includedPartsEnable: q(".device-included-parts-enable"),
    partList: q(".device-part-list"), partAdd: q(".device-part-add"),
    setFields: q(".device-set-fields"),
    createdDialog: q(".device-created-dialog"), createdClose: q(".device-created-close"),
    createdDone: q(".device-created-done"), createdPrint: q(".device-created-print"),
    createdMessage: q(".device-created-message"), createdList: q(".device-created-list"),
    setDialog: q(".device-set-dialog"), setClose: q(".device-set-close"),
    setContent: q(".device-set-content"),
    defectDialog: q(".device-defect-dialog"), defectForm: q(".device-defect-form"),
    defectClose: q(".device-defect-close"), defectCancel: q(".device-defect-cancel"),
    defectMessage: q(".device-defect-message"),
    inspectionDialog: q(".device-inspection-dialog"), inspectionForm: q(".device-inspection-form"),
    inspectionClose: q(".device-inspection-close"), inspectionCancel: q(".device-inspection-cancel"),
    inspectionMessage: q(".device-inspection-message"),
    qrDialog: q(".device-qr-dialog"), qrClose: q(".device-qr-close"),
    qrImage: q(".device-qr-image"), qrName: q(".device-qr-name"), qrNumber: q(".device-qr-number"),
    qrDownload: q(".device-qr-download"), qrPrint: q(".device-qr-print"), qrRotate: q(".device-qr-rotate")
  };

  let enabled = false;
  let activeView = "overview";
  let dashboard = null;
  let context = null;
  let devices = [];
  let sets = [];
  let notifications = [];
  let loadProblems = [];
  let selected = null;
  let editing = null;
  let currentInventory = null;
  let currentInventoryReport = null;
  let qrScanner = null;
  let scanResumeTimer = null;
  let scanning = false;
  let lastScanToken = null;
  let deepLinkHandled = false;
  let createdDevices = [];
  const printSelection = new Set();

  const manager = () => dashboard
    ? Boolean(dashboard.canManage)
    : canManageDevicesFromSession(getSession());
  const inventoryAllowed = () => dashboard
    ? Boolean(dashboard.canInventory)
    : manager() || (getSession()?.user?.roles || []).includes("foreman");

  function cacheKey() {
    const session = getSession();
    return `schaefchen-device-cache-v1:${session?.company?.number || "unknown"}:${session?.user?.id || "unknown"}`;
  }

  function readStorage(key, fallback) {
    try { return JSON.parse(window.localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  }

  function writeStorage(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* App bleibt online nutzbar. */ }
  }

  function queue() {
    return readStorage(offlineDeviceQueueKey(getSession()), []);
  }

  function saveQueue(items) {
    writeStorage(offlineDeviceQueueKey(getSession()), items);
    renderSyncState();
  }

  function cacheScan(token, device) {
    const cache = readStorage(cacheKey(), {});
    cache[token] = { ...device, cachedAt: new Date().toISOString() };
    const entries = Object.entries(cache).sort((left, right) => (
      String(right[1].cachedAt).localeCompare(String(left[1].cachedAt))
    )).slice(0, 250);
    writeStorage(cacheKey(), Object.fromEntries(entries));
  }

  function renderSyncState() {
    const items = queue();
    const conflicts = items.filter((item) => item.status === "conflict");
    elements.sync.hidden = items.length === 0;
    if (!items.length) return;
    elements.sync.className = `device-sync-state${conflicts.length ? " device-sync-state--conflict" : ""}`;
    elements.sync.textContent = conflicts.length
      ? `${conflicts.length} Offline-Übergabe konnte wegen eines neueren Gerätestands nicht übernommen werden. Bitte erneut scannen.`
      : `${items.length} Übernahme vorgemerkt – wird synchronisiert.`;
  }

  async function syncQueue() {
    if (!navigator.onLine || !enabled) return;
    const items = queue();
    if (!items.length) return;
    const remaining = [];
    for (const item of items) {
      if (item.status === "conflict") {
        remaining.push(item);
        continue;
      }
      try {
        await requestJson(item.endpoint, {
          method: "POST",
          body: JSON.stringify({ ...item.body, offline: true })
        });
      } catch (error) {
        if (["device_transfer_conflict", "device_blocked", "device_not_holder"].includes(error.code)) {
          remaining.push({ ...item, status: "conflict", error: error.message });
        } else if (error.network) {
          remaining.push(item);
        } else {
          remaining.push({ ...item, status: "conflict", error: error.message });
        }
      }
    }
    saveQueue(remaining);
    if (remaining.length !== items.length) await refresh();
  }

  function queueTransfer(device, action, extra = {}) {
    const endpoint = `./api/v1/devices/${encodeURIComponent(device.id)}/transfers`;
    if (queue().some((item) => item.endpoint === endpoint && item.status === "pending")) {
      showToast("Für dieses Gerät ist bereits eine Übergabe vorgemerkt.");
      return;
    }
    const item = {
      endpoint,
      body: {
        action,
        clientOperationId: createClientId(),
        expectedRowVersion: device.rowVersion,
        clientCreatedAt: new Date().toISOString(),
        ...extra
      },
      deviceName: device.name,
      createdAt: new Date().toISOString(),
      status: "pending"
    };
    saveQueue([...queue(), item]);
    showToast("Übernahme vorgemerkt – wird synchronisiert.");
  }

  function visibleViews() {
    return [...VIEW_LABELS].filter(([key]) => {
      if (["inventory"].includes(key)) return inventoryAllowed();
      if (["tools", "batteries", "loans", "history"].includes(key)) {
        return manager() || inventoryAllowed();
      }
      if (["sets", "inspections"].includes(key)) return manager();
      return true;
    });
  }

  function renderTabs() {
    elements.tabs.replaceChildren();
    for (const [key, label] of visibleViews()) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `page-tab${activeView === key ? " page-tab--active" : ""}`;
      button.textContent = label;
      button.setAttribute("aria-pressed", String(activeView === key));
      button.addEventListener("click", () => {
        activeView = key;
        render();
        if (key === "scanner") openScanner();
      });
      elements.tabs.append(button);
    }
  }

  function metric(label, value, note, attention = false) {
    const card = document.createElement("article");
    card.className = `metric-card${attention ? " device-metric--attention" : ""}`;
    const title = document.createElement("p");
    title.className = "metric-card__label";
    title.textContent = label;
    const number = document.createElement("strong");
    number.className = "metric-card__value";
    number.textContent = String(value ?? 0);
    const detail = document.createElement("p");
    detail.className = "metric-card__note";
    detail.textContent = note;
    card.append(title, number, detail);
    return card;
  }

  function renderMetrics() {
    elements.metrics.replaceChildren();
    if (!dashboard) return;
    const mine = dashboard?.mine || {};
    if (!manager()) {
      elements.metrics.append(
        metric("Bei mir", mine.with_me, "aktuell in deinem Besitz"),
        metric("Meine festen Geräte", mine.fixed, "dauerhaft zugeordnet"),
        metric("Bei anderen", mine.fixed_elsewhere, "deine Geräte unterwegs", Number(mine.fixed_elsewhere) > 0)
      );
      return;
    }
    const all = dashboard?.company || {};
    elements.metrics.append(
      metric("Geräte", all.total, "aktiver Bestand"),
      metric("Akkus", all.batteries, "einzeln erfasst"),
      metric("Zugeordnet", all.assigned, "fest oder vorübergehend"),
      metric("Verliehen", all.loaned, "bei anderem Besitzer"),
      metric("Prüfung bald", all.due, "innerhalb 30 Tagen", Number(all.due) > 0),
      metric("Überfällig", all.overdue, "Prüftermin überschritten", Number(all.overdue) > 0),
      metric("Defekt / gesperrt", all.defective, "nicht regulär verfügbar", Number(all.defective) > 0)
    );
  }

  function statusClass(device) {
    if (device.blocked || ["locked", "defective", "repair", "retired"].includes(device.effectiveStatus)) return "danger";
    if (device.inspectionState !== "ok" || device.status === "loaned") return "warning";
    return "ok";
  }

  function ownerText(device) {
    if (device.currentOwner) {
      const since = device.currentOwner.since
        ? ` · seit ${formatDate(device.currentOwner.since, true)}` : "";
      const archived = device.currentOwner.status === "active" ? "" : " · archiviert";
      return `Aktuell bei: ${device.currentOwner.name}${since}${archived}`;
    }
    if (device.currentLocation) return `Standort: ${device.currentLocation.name}`;
    return "Aktuell verfügbar";
  }

  function deviceCard(device) {
    const card = document.createElement("article");
    card.className = "device-card";
    card.dataset.status = statusClass(device);
    const main = document.createElement("button");
    main.type = "button";
    main.className = "device-card__main";
    const icon = document.createElement("span");
    icon.className = "device-card__icon";
    icon.textContent = device.baseType === "battery" ? "▰" : "⚙";
    const copy = document.createElement("span");
    copy.className = "device-card__copy";
    const title = document.createElement("strong");
    title.textContent = device.name;
    const number = document.createElement("small");
    number.textContent = [device.inventoryNumber, device.manufacturer, device.model].filter(Boolean).join(" · ");
    const owner = document.createElement("span");
    owner.textContent = ownerText(device);
    copy.append(title, number, owner);
    const badge = document.createElement("span");
    badge.className = `device-badge device-badge--${statusClass(device)}`;
    badge.textContent = deviceStatusLabel(device.effectiveStatus);
    main.append(icon, copy, badge);
    main.addEventListener("click", () => void openDetail(device));
    card.append(main);
    if (manager()) {
      const select = document.createElement("label");
      select.className = "device-card__select";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = printSelection.has(device.id);
      checkbox.setAttribute("aria-label", `${device.name} für QR-Druckbogen auswählen`);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) printSelection.add(device.id); else printSelection.delete(device.id);
        updatePrintButton();
      });
      select.append(checkbox);
      card.append(select);
    }
    return card;
  }

  function filtered(source) {
    const search = elements.search.value.trim().toLocaleLowerCase("de-DE");
    const status = elements.status.value;
    return source.filter((device) => {
      const haystack = [
        device.inventoryNumber, device.serialNumber, device.name, device.manufacturer,
        device.model, device.currentOwner?.name, device.fixedOwner?.name,
        device.currentLocation?.name, device.constructionSite?.name, device.vehicle?.name
      ].filter(Boolean).join(" ").toLocaleLowerCase("de-DE");
      const statusMatches = !status || device.status === status || device.effectiveStatus === status
        || (status === "locked" && device.blocked);
      return (!search || haystack.includes(search)) && statusMatches;
    });
  }

  function group(title, subtitle, source) {
    const section = document.createElement("section");
    section.className = "device-group";
    const heading = document.createElement("div");
    heading.className = "device-group__heading";
    const h2 = document.createElement("h2");
    h2.textContent = title;
    const note = document.createElement("p");
    note.textContent = subtitle;
    heading.append(h2, note);
    const list = document.createElement("div");
    list.className = "device-list";
    const shown = filtered(source);
    if (!shown.length) {
      const empty = document.createElement("p");
      empty.className = "device-empty";
      empty.textContent = "Hier gibt es momentan keine Geräte.";
      list.append(empty);
    } else shown.forEach((device) => list.append(deviceCard(device)));
    section.append(heading, list);
    return section;
  }

  function renderNotificationsPanel() {
    const unread = notifications.filter((item) => !item.readAt);
    const section = document.createElement("section");
    section.className = "device-notifications-panel";
    const heading = document.createElement("div");
    const title = document.createElement("h2");
    title.textContent = "Hinweise zu deinen Geräten";
    const note = document.createElement("p");
    note.textContent = unread.length ? `${unread.length} ungelesen` : "Alles erledigt";
    heading.append(title, note);
    const list = document.createElement("div");
    list.className = "device-notification-list";
    for (const item of notifications.slice(0, 12)) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `device-notification${item.readAt ? " device-notification--read" : ""}`;
      const strong = document.createElement("strong");
      strong.textContent = item.title;
      const message = document.createElement("span");
      message.textContent = item.message;
      const time = document.createElement("small");
      time.textContent = formatDate(item.createdAt, true);
      button.append(strong, message, time);
      button.addEventListener("click", async () => {
        if (!item.readAt) {
          await requestJson(`./api/v1/devices/notifications/${encodeURIComponent(item.id)}/read`, { method: "POST" });
          item.readAt = new Date().toISOString();
          onNotificationsChanged();
        }
        const device = devices.find((candidate) => candidate.id === item.device.id);
        if (device) void openDetail(device);
        render();
      });
      list.append(button);
    }
    if (!notifications.length) {
      const empty = document.createElement("p");
      empty.className = "device-empty";
      empty.textContent = "Keine Gerätehinweise.";
      list.append(empty);
    }
    section.append(heading, list);
    return section;
  }

  function renderInventory() {
    const section = document.createElement("section");
    section.className = "device-inventory";
    const heading = document.createElement("div");
    heading.className = "device-group__heading";
    const title = document.createElement("h2");
    title.textContent = currentInventory ? "Laufende Inventur" : "Inventur starten";
    const note = document.createElement("p");
    note.textContent = currentInventory
      ? "QR-Codes nacheinander scannen. Abweichungen werden automatisch erkannt."
      : "Standort wählen und anschließend jedes Etikett scannen.";
    heading.append(title, note);
    section.append(heading);
    if (!currentInventory) {
      const form = document.createElement("form");
      form.className = "device-inventory__start";
      const select = document.createElement("select");
      option(select, "", "Standort auswählen");
      (context?.locations || []).filter((location) => location.status === "active")
        .forEach((location) => option(select, location.id, location.name));
      select.required = true;
      const button = document.createElement("button");
      button.className = "button button--action";
      button.type = "submit";
      button.textContent = "Inventur starten";
      form.append(select, button);
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const body = await requestJson("./api/v1/devices/inventories", {
          method: "POST", body: JSON.stringify({ locationId: select.value })
        });
        currentInventory = body.inventory;
        activeView = "inventory";
        render();
        openScanner();
      });
      section.append(form);
    } else {
      const actions = document.createElement("div");
      actions.className = "device-dialog__actions";
      const scan = document.createElement("button");
      scan.type = "button"; scan.className = "button button--action"; scan.textContent = "Weiter scannen";
      scan.addEventListener("click", openScanner);
      const complete = document.createElement("button");
      complete.type = "button"; complete.className = "button button--secondary"; complete.textContent = "Inventur abschließen";
      complete.addEventListener("click", async () => {
        const body = await requestJson(`./api/v1/devices/inventories/${encodeURIComponent(currentInventory.id)}/complete`, { method: "POST" });
        currentInventoryReport = body.report;
        currentInventory = null;
        render();
      });
      actions.append(scan, complete);
      section.append(actions);
    }
    if (currentInventoryReport) {
      const report = document.createElement("div");
      report.className = "device-inventory-report";
      const h3 = document.createElement("h3");
      h3.textContent = `Inventurbericht · ${currentInventoryReport.session.location_name}`;
      const stats = document.createElement("p");
      stats.textContent = [
        `${currentInventoryReport.counts.found || 0} gefunden`,
        `${currentInventoryReport.counts.missing || 0} fehlt`,
        `${(currentInventoryReport.counts.wrong_location || 0) + (currentInventoryReport.counts.wrong_owner || 0)} Abweichungen`,
        `${currentInventoryReport.counts.unexpected || 0} nicht im Sollbestand`,
        `${currentInventoryReport.counts.unknown || 0} unbekannt`
      ].join(" · ");
      const list = document.createElement("ul");
      currentInventoryReport.items.forEach((item) => {
        const row = document.createElement("li");
        row.textContent = `${item.inventory_number || "Unbekannter QR-Code"} · ${item.name || ""} · ${inventoryResultLabel(item.result)}`;
        list.append(row);
      });
      report.append(h3, stats, list);
      section.append(report);
    }
    return section;
  }

  function renderSettings() {
    const section = document.createElement("section");
    section.className = "device-settings";
    const heading = document.createElement("div");
    heading.className = "device-group__heading";
    const title = document.createElement("h2");
    title.textContent = "Prüf- und Ausgaberegeln";
    const note = document.createElement("p");
    note.textContent = "Firmenweite Fristen, Standardlager und optionale Prüfsperre.";
    heading.append(title, note);
    const form = document.createElement("form");
    form.className = "device-settings__form";
    const warningLabel = document.createElement("label");
    warningLabel.textContent = "Prüfung vorwarnen (Tage)";
    const warning = document.createElement("input");
    warning.type = "number"; warning.min = "0"; warning.max = "365";
    warning.value = String(context?.settings?.inspectionWarningDays ?? 30);
    warningLabel.append(warning);
    const loanLabel = document.createElement("label");
    loanLabel.textContent = "Lange Ausleihe ab (Tage)";
    const loan = document.createElement("input");
    loan.type = "number"; loan.min = "1"; loan.max = "3650";
    loan.value = String(context?.settings?.longLoanDays ?? 14);
    loanLabel.append(loan);
    const storageLabel = document.createElement("label");
    storageLabel.textContent = "Standardlager";
    const storage = document.createElement("select");
    fillSelect(
      storage,
      (context?.locations || []).filter((location) => location.status === "active"),
      "Kein Standardlager",
      context?.settings?.defaultStorageLocationId
    );
    storageLabel.append(storage);
    const lockLabel = document.createElement("label");
    lockLabel.className = "device-check";
    const lock = document.createElement("input");
    lock.type = "checkbox";
    lock.checked = Boolean(context?.settings?.lockOverdueInspections);
    lockLabel.append(lock, document.createTextNode(" Überfällige Prüfungen automatisch sperren"));
    const save = document.createElement("button");
    save.type = "submit"; save.className = "button button--secondary";
    save.textContent = "Regeln speichern";
    const message = document.createElement("p");
    message.className = "device-message"; message.setAttribute("role", "status");
    form.append(warningLabel, loanLabel, storageLabel, lockLabel, save, message);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      save.disabled = true; message.textContent = "Regeln werden gespeichert …";
      try {
        await requestJson("./api/v1/admin/devices/settings", {
          method: "PATCH",
          body: JSON.stringify({
            inspectionWarningDays: Number(warning.value),
            longLoanDays: Number(loan.value),
            lockOverdueInspections: lock.checked,
            defaultStorageLocationId: storage.value || null,
            rowVersion: context?.settings?.rowVersion
          })
        });
        showToast("Geräteregeln gespeichert.");
        await refresh();
      } catch (error) {
        message.textContent = error.message;
      } finally {
        save.disabled = false;
      }
    });
    section.append(heading, form);
    return section;
  }

  function renderLoadProblems() {
    const section = document.createElement("section");
    section.className = "device-load-problem";
    const copy = document.createElement("div");
    const title = document.createElement("h2");
    title.textContent = "Noch nicht alles geladen";
    const note = document.createElement("p");
    note.textContent = `${loadProblems.map((problem) => problem.area).join(", ")} konnten nicht aktualisiert werden. Bereits geladene Funktionen bleiben erhalten.`;
    copy.append(title, note);
    const references = loadProblems.map((problem) => problem.error?.requestId).filter(Boolean);
    if (references.length) {
      const reference = document.createElement("small");
      reference.textContent = `Fehlerreferenz: ${references.join(", ")}`;
      copy.append(reference);
    }
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "button button--secondary";
    retry.textContent = "Erneut laden";
    retry.addEventListener("click", () => void refresh());
    section.append(copy, retry);
    return section;
  }

  function renderManagementActions() {
    const section = document.createElement("section");
    section.className = "device-management-actions";
    const copy = document.createElement("div");
    const title = document.createElement("h2");
    title.textContent = "Inventar verwalten";
    const note = document.createElement("p");
    note.textContent = "Gerät mit Seriennummer und Besitzer anlegen, beiliegende Teile erfassen und anschließend QR-Etiketten drucken.";
    copy.append(title, note);
    const actions = document.createElement("div");
    actions.className = "device-dialog__actions";
    const add = document.createElement("button");
    add.type = "button";
    add.className = "button button--action";
    add.textContent = "+ Gerät anlegen";
    add.addEventListener("click", () => openEditor());
    const setButton = document.createElement("button");
    setButton.type = "button";
    setButton.className = "button button--secondary";
    setButton.textContent = "Sets & beiliegende Teile";
    setButton.addEventListener("click", () => { activeView = "sets"; render(); });
    actions.append(add, setButton);
    section.append(copy, actions);
    return section;
  }

  function renderSets() {
    const section = document.createElement("section");
    section.className = "device-group";
    const heading = document.createElement("div");
    heading.className = "device-group__heading";
    const copy = document.createElement("div");
    const title = document.createElement("h2");
    title.textContent = "Gerätesets & Koffer";
    const note = document.createElement("p");
    note.textContent = "Jedes enthaltene Teil bleibt einzeln inventarisiert und besitzt einen eigenen QR-Code.";
    copy.append(title, note);
    const add = document.createElement("button");
    add.type = "button";
    add.className = "button button--secondary";
    add.textContent = "+ Gerät mit Teilen anlegen";
    add.addEventListener("click", () => { openEditor(); enableIncludedParts(); });
    heading.append(copy, add);
    const list = document.createElement("div");
    list.className = "device-set-list";
    if (!sets.length) {
      const empty = document.createElement("p");
      empty.className = "device-empty";
      empty.textContent = "Noch kein Set angelegt. Lege ein Gerät an und füge im letzten Schritt Akku, Ladegerät oder Koffer hinzu.";
      list.append(empty);
    } else {
      sets.forEach((set) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "device-set-card";
        const strong = document.createElement("strong");
        strong.textContent = `${set.number} · ${set.name}`;
        const meta = document.createElement("span");
        meta.textContent = `${set.itemCount} inventarisierte Teile`;
        button.append(strong, meta);
        button.addEventListener("click", () => void openSet(set.id));
        list.append(button);
      });
    }
    section.append(heading, list);
    return section;
  }

  function render() {
    if (!enabled) return;
    if (!visibleViews().some(([key]) => key === activeView)) activeView = "overview";
    renderTabs();
    renderMetrics();
    elements.add.hidden = !manager();
    elements.search.closest("label").hidden = activeView === "scanner" || activeView === "inventory";
    elements.status.hidden = activeView === "scanner" || activeView === "inventory";
    elements.printSheet.hidden = !manager() || activeView === "scanner" || activeView === "inventory";
    elements.content.replaceChildren();
    if (loadProblems.length) elements.content.append(renderLoadProblems());
    const userId = getSession()?.user?.id;
    const mine = partitionMyDevices(devices, userId);
    if (activeView === "overview") {
      if (manager()) elements.content.append(renderManagementActions());
      elements.content.append(renderNotificationsPanel());
      elements.content.append(group(
        manager() ? "Gesamter Gerätebestand" : inventoryAllowed() ? "Geräte meiner Baustellen" : "Bei mir",
        manager()
          ? "Alle aktiven Maschinen, Werkzeuge, Messgeräte und Akkus."
          : inventoryAllowed()
            ? "Eigene Geräte und Bestand der von dir betreuten Baustellen."
            : "Geräte, für die du gerade verantwortlich bist.",
        manager() || inventoryAllowed()
          ? devices.filter((device) => device.status !== "retired") : mine.withMe
      ));
    } else if (activeView === "mine") {
      elements.content.append(
        group("Bei mir", "Geräte, die du aktuell besitzt.", mine.withMe),
        group("Meine festen Geräte", "Dauerhaft dir zugeordnete Geräte.", mine.fixed),
        group("Meine Geräte bei anderen", "Du bleibst fester Besitzer und siehst sofort, wer sie hat.", mine.elsewhere)
      );
    } else if (activeView === "tools") {
      elements.content.append(group("Maschinen & Werkzeuge", "Inventar ohne Akkus.", devices.filter((device) => device.baseType !== "battery")));
    } else if (activeView === "batteries") {
      elements.content.append(group("Akkus", "Jeder Akku besitzt eine eigene ID, einen eigenen QR-Code und eine eigene Historie.", devices.filter((device) => device.baseType === "battery")));
    } else if (activeView === "sets") {
      elements.content.append(renderSets());
    } else if (activeView === "loans") {
      elements.content.append(group("Aktuelle Ausgaben", "Fester und aktueller Besitzer unterscheiden sich.", devices.filter((device) => (
        device.currentOwner && device.currentOwner.id !== device.fixedOwner?.id
      ))));
    } else if (activeView === "scanner") {
      const card = document.createElement("section");
      card.className = "device-scanner-card";
      const title = document.createElement("h2"); title.textContent = "Scannen statt suchen";
      const note = document.createElement("p"); note.textContent = "Kamera öffnen, Etikett erfassen, fertig. Nur bei fremden oder gesperrten Geräten fragt Schäfchen nach.";
      const button = document.createElement("button"); button.type = "button"; button.className = "button button--action"; button.textContent = "Kamera öffnen";
      button.addEventListener("click", openScanner);
      card.append(title, note, button); elements.content.append(card);
    } else if (activeView === "inspections") {
      elements.content.append(renderSettings(), group("Prüfungen & Wartung", "Fällige, überfällige und prüfpflichtige Betriebsmittel.", devices.filter((device) => (
        device.inspectionRequired || device.nextMaintenanceOn || device.blocked
      ))));
    } else if (activeView === "inventory") {
      elements.content.append(renderInventory());
    } else if (activeView === "history") {
      const card = document.createElement("section");
      card.className = "device-scanner-card";
      const title = document.createElement("h2"); title.textContent = "Unveränderliche Gerätehistorie";
      const note = document.createElement("p"); note.textContent = "Öffne ein Gerät, um Übergaben, Rückgaben, Defekte, Prüfungen und administrative Änderungen lückenlos zu sehen.";
      card.append(title, note); elements.content.append(card, group("Geräte auswählen", "Die Historie liegt immer am Gegenstand.", devices));
    }
    updatePrintButton();
  }

  function updatePrintButton() {
    elements.printSheet.textContent = printSelection.size
      ? `QR-Druckbogen (${printSelection.size})` : "QR-Druckbogen";
    elements.printSheet.disabled = printSelection.size === 0;
  }

  async function refresh() {
    if (!enabled || !navigator.onLine) {
      renderSyncState();
      render();
      return;
    }
    elements.message.textContent = "Geräte werden geladen …";
    const requests = [
      ["Kennzahlen", requestJson("./api/v1/devices/dashboard")],
      ["Auswahldaten", requestJson("./api/v1/devices/contexts")],
      ["Gerätebestand", requestJson("./api/v1/devices?scope=all")],
      ["Hinweise", requestJson("./api/v1/devices/notifications")],
      ...(manager() ? [["Gerätesets", requestJson("./api/v1/admin/devices/sets")]] : [])
    ];
    const results = await Promise.allSettled(requests.map(([, promise]) => promise));
    loadProblems = [];
    results.forEach((result, index) => {
      const area = requests[index][0];
      if (result.status === "rejected") {
        loadProblems.push({ area, error: result.reason });
        return;
      }
      if (area === "Kennzahlen") dashboard = result.value.dashboard;
      if (area === "Auswahldaten") context = result.value.context;
      if (area === "Gerätebestand") devices = result.value.devices || [];
      if (area === "Hinweise") notifications = result.value.notifications || [];
      if (area === "Gerätesets") sets = result.value.sets || [];
    });
    elements.message.textContent = "";
    fillEditorOptions();
    render();
    onNotificationsChanged();
    if (!loadProblems.some((problem) => problem.area === "Gerätebestand")) {
      await syncQueue();
    }
  }

  function fillSelect(select, items, label, selectedValue = "") {
    select.replaceChildren();
    option(select, "", label);
    items.forEach((item) => option(select, item.id, item.name));
    select.value = selectedValue || "";
  }

  function fillEditorOptions() {
    if (!context) return;
    const categorySelect = elements.editor.elements.categoryId;
    categorySelect.replaceChildren();
    context.categories.filter((category) => category.status === "active")
      .forEach((category) => option(categorySelect, category.id, category.name));
    fillSelect(elements.editor.elements.fixedOwnerUserId, context.employees, "Niemand");
    fillSelect(elements.editor.elements.currentOwnerUserId, context.employees, "Niemand / verfügbar");
    fillSelect(
      elements.editor.elements.locationId,
      context.locations.filter((location) => location.status === "active"),
      "Kein Standort"
    );
    fillSelect(elements.editor.elements.constructionSiteId, context.sites, "Keine Baustelle");
    fillSelect(elements.editor.elements.vehicleId, context.vehicles, "Kein Fahrzeug");
    fillSelect(elements.inspectionForm.elements.inspectorUserId, context.employees, "Externer Prüfer");
  }

  function updateBatteryFields() {
    const category = context?.categories.find((item) => item.id === elements.editor.elements.categoryId.value);
    const battery = category?.baseType === "battery";
    elements.batteryFields.hidden = !battery;
    elements.editor.elements.batterySystem.required = battery;
  }

  function activeCategories() {
    return (context?.categories || []).filter((category) => category.status === "active");
  }

  function updatePartBatteryFields(row) {
    const categoryId = row.querySelector(".device-part-category").value;
    const category = activeCategories().find((item) => item.id === categoryId);
    const fields = row.querySelector(".device-part-battery");
    const system = row.querySelector(".device-part-battery-system");
    const battery = category?.baseType === "battery";
    fields.hidden = !battery;
    system.required = battery;
  }

  function renumberPartRows() {
    [...elements.partList.children].forEach((row, index) => {
      row.querySelector(".device-part-title").textContent = `Teil ${index + 1}`;
    });
  }

  function addPartRow(values = {}) {
    const row = document.createElement("article");
    row.className = "device-part-row";
    row.innerHTML = `
      <header><strong class="device-part-title"></strong><button type="button" class="device-part-remove" aria-label="Beiliegendes Teil entfernen">×</button></header>
      <div class="device-editor-grid">
        <label>Inventarnummer *<input class="device-part-inventory" maxlength="50" required></label>
        <label>Bezeichnung *<input class="device-part-name" maxlength="180" required></label>
        <label>Kategorie *<select class="device-part-category" required></select></label>
        <label>Seriennummer<input class="device-part-serial" maxlength="160"></label>
        <label>Hersteller<input class="device-part-manufacturer" maxlength="120"></label>
        <label>Modell<input class="device-part-model" maxlength="120"></label>
        <label class="device-check"><input class="device-part-inspection" type="checkbox"> Eigene Prüfung erforderlich</label>
      </div>
      <div class="device-part-battery" hidden>
        <label>Akkusystem *<input class="device-part-battery-system" maxlength="100" placeholder="z. B. M18"></label>
        <label>Spannung (V)<input class="device-part-voltage" type="number" min="0.01" step="0.01"></label>
        <label>Kapazität (Ah)<input class="device-part-capacity" type="number" min="0.01" step="0.01"></label>
      </div>`;
    const category = row.querySelector(".device-part-category");
    option(category, "", "Kategorie wählen");
    activeCategories().forEach((item) => option(category, item.id, item.name));
    const number = elements.partList.children.length + 1;
    const mainNumber = elements.editor.elements.inventoryNumber.value.trim();
    row.querySelector(".device-part-inventory").value = values.inventoryNumber
      || (mainNumber ? `${mainNumber}-${String(number).padStart(2, "0")}` : "");
    row.querySelector(".device-part-name").value = values.name || "";
    row.querySelector(".device-part-serial").value = values.serialNumber || "";
    row.querySelector(".device-part-manufacturer").value = values.manufacturer
      || elements.editor.elements.manufacturer.value;
    row.querySelector(".device-part-model").value = values.model || "";
    category.value = values.categoryId || "";
    category.addEventListener("change", () => updatePartBatteryFields(row));
    row.querySelector(".device-part-remove").addEventListener("click", () => {
      row.remove();
      renumberPartRows();
      if (!elements.partList.children.length) disableIncludedParts();
    });
    elements.partList.append(row);
    renumberPartRows();
    updatePartBatteryFields(row);
  }

  function enableIncludedParts() {
    if (editing || !context) return;
    elements.includedParts.hidden = false;
    elements.includedPartsEnable.hidden = true;
    elements.setFields.hidden = false;
    elements.editor.elements.setNumber.required = true;
    elements.editor.elements.setName.required = true;
    if (!elements.editor.elements.setNumber.value) {
      const inventoryNumber = elements.editor.elements.inventoryNumber.value.trim();
      elements.editor.elements.setNumber.value = inventoryNumber
        ? `SET-${inventoryNumber}`.slice(0, 40) : "";
    }
    if (!elements.editor.elements.setName.value) {
      const name = elements.editor.elements.name.value.trim();
      elements.editor.elements.setName.value = name ? `${name} · Set` : "";
    }
    if (!elements.partList.children.length) addPartRow();
  }

  function disableIncludedParts() {
    elements.partList.replaceChildren();
    elements.includedParts.hidden = true;
    elements.includedPartsEnable.hidden = Boolean(editing);
    elements.setFields.hidden = true;
    elements.editor.elements.setNumber.required = false;
    elements.editor.elements.setName.required = false;
  }

  function partFieldLabel(field) {
    const label = field.closest("label");
    const text = label?.childNodes?.[0]?.textContent || field.getAttribute("aria-label") || "Pflichtfeld";
    return text.trim().replace(/\s*\*$/, "");
  }

  function focusEditorProblem(field, prefix = "") {
    const details = field.closest("details");
    if (details) details.open = true;
    const label = partFieldLabel(field);
    const reason = field.validity?.valueMissing ? "fehlt" : "ist ungültig";
    const message = `${prefix}${label} ${reason}. Bitte das markierte Feld prüfen.`;
    elements.editorMessage.textContent = message;
    showToast(message);
    field.setAttribute("aria-invalid", "true");
    field.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => field.focus({ preventScroll: true }), 180);
  }

  function unusedPartRow(row) {
    // Inventarnummer und Hersteller werden beim Hinzufügen vorbefüllt. Sie
    // allein bedeuten deshalb noch nicht, dass wirklich ein weiteres Teil
    // angelegt werden soll.
    return includedPartIsEmpty({
      name: row.querySelector(".device-part-name").value,
      categoryId: row.querySelector(".device-part-category").value,
      serialNumber: row.querySelector(".device-part-serial").value,
      model: row.querySelector(".device-part-model").value,
      batterySystem: row.querySelector(".device-part-battery-system").value,
      voltage: row.querySelector(".device-part-voltage").value,
      capacityAh: row.querySelector(".device-part-capacity").value,
      inspectionRequired: row.querySelector(".device-part-inspection").checked
    });
  }

  function prepareEditorSubmission() {
    const rows = [...elements.partList.querySelectorAll(".device-part-row")];
    rows.filter(unusedPartRow).forEach((row) => row.remove());
    if (rows.length && !elements.partList.children.length) disableIncludedParts();
    else renumberPartRows();
    elements.editor.querySelectorAll("[aria-invalid='true']").forEach((field) => {
      field.removeAttribute("aria-invalid");
    });
    const invalid = elements.editor.querySelector("input:invalid, select:invalid, textarea:invalid");
    if (!invalid) return true;
    const row = invalid.closest(".device-part-row");
    const prefix = row
      ? `Teil ${[...elements.partList.children].indexOf(row) + 1}: `
      : "";
    focusEditorProblem(invalid, prefix);
    return false;
  }

  function addIncludedPart() {
    const last = elements.partList.lastElementChild;
    const invalid = last?.querySelector("input:invalid, select:invalid, textarea:invalid");
    if (invalid) {
      focusEditorProblem(invalid, `Teil ${elements.partList.children.length}: `);
      return;
    }
    addPartRow();
  }

  function partPayload(row, mainPayload) {
    const numberOrNull = (value) => value === "" ? null : Number(value);
    const categoryId = row.querySelector(".device-part-category").value;
    const category = activeCategories().find((item) => item.id === categoryId);
    return {
      inventoryNumber: row.querySelector(".device-part-inventory").value,
      name: row.querySelector(".device-part-name").value,
      categoryId,
      manufacturer: row.querySelector(".device-part-manufacturer").value || null,
      model: row.querySelector(".device-part-model").value || null,
      serialNumber: row.querySelector(".device-part-serial").value || null,
      purchaseDate: mainPayload.purchaseDate,
      purchasePriceCents: null,
      supplier: mainPayload.supplier,
      warrantyUntil: mainPayload.warrantyUntil,
      condition: mainPayload.condition,
      status: mainPayload.status,
      fixedOwnerUserId: mainPayload.fixedOwnerUserId,
      currentOwnerUserId: mainPayload.currentOwnerUserId,
      locationId: mainPayload.locationId,
      constructionSiteId: mainPayload.constructionSiteId,
      vehicleId: mainPayload.vehicleId,
      inspectionRequired: row.querySelector(".device-part-inspection").checked,
      nextInspectionOn: null,
      maintenanceIntervalDays: null,
      nextMaintenanceOn: null,
      note: `Bestandteil von ${elements.editor.elements.setName.value.trim()}`,
      ...(category?.baseType === "battery" ? { battery: {
        batterySystem: row.querySelector(".device-part-battery-system").value,
        voltage: numberOrNull(row.querySelector(".device-part-voltage").value),
        capacityAh: numberOrNull(row.querySelector(".device-part-capacity").value),
        cycleCount: null,
        lastCapacityTestOn: null,
        remainingCapacityPercent: null,
        compatibleSystem: row.querySelector(".device-part-battery-system").value || null
      } } : {})
    };
  }

  function openEditor(device = null) {
    if (!context) {
      showToast("Die Gerätestammdaten werden noch geladen. Bitte erneut versuchen.");
      void refresh();
      return;
    }
    editing = device;
    elements.editor.reset();
    disableIncludedParts();
    fillEditorOptions();
    elements.editorTitle.textContent = device ? "Gerät bearbeiten" : "Gerät anlegen";
    elements.editor.querySelector(".device-editor-save").textContent = device
      ? "Änderungen speichern" : "Gerät & QR anlegen";
    elements.editorRetire.hidden = !device || device.status === "retired";
    elements.editorMessage.textContent = "";
    if (device) {
      const values = {
        inventoryNumber: device.inventoryNumber, name: device.name, categoryId: device.categoryId,
        manufacturer: device.manufacturer, model: device.model, serialNumber: device.serialNumber,
        purchaseDate: device.purchaseDate,
        purchasePrice: device.purchasePriceCents == null ? "" : (device.purchasePriceCents / 100).toFixed(2),
        supplier: device.supplier, warrantyUntil: device.warrantyUntil, condition: device.condition,
        status: device.status === "retired" ? "available" : device.status,
        fixedOwnerUserId: device.fixedOwner?.id, currentOwnerUserId: device.currentOwner?.id,
        locationId: device.currentLocation?.id,
        constructionSiteId: device.constructionSite?.id, vehicleId: device.vehicle?.id,
        nextInspectionOn: device.nextInspectionOn,
        maintenanceIntervalDays: device.maintenanceIntervalDays,
        nextMaintenanceOn: device.nextMaintenanceOn, note: device.note,
        batterySystem: device.battery?.batterySystem, voltage: device.battery?.voltage,
        capacityAh: device.battery?.capacityAh, cycleCount: device.battery?.cycleCount,
        lastCapacityTestOn: device.battery?.lastCapacityTestOn,
        remainingCapacityPercent: device.battery?.remainingCapacityPercent,
        compatibleSystem: device.battery?.compatibleSystem
      };
      Object.entries(values).forEach(([name, value]) => {
        if (elements.editor.elements[name] && value !== null && value !== undefined) {
          elements.editor.elements[name].value = value;
        }
      });
      elements.editor.elements.inspectionRequired.checked = device.inspectionRequired;
    } else {
      elements.editor.elements.status.value = "available";
      elements.editor.elements.condition.value = "ok";
    }
    elements.editor.elements.currentOwnerUserId.disabled = Boolean(device);
    elements.editor.elements.currentOwnerUserId.title = device
      ? "Den aktuellen Besitzer über die Geräteübergabe ändern." : "";
    updateBatteryFields();
    elements.editorDialog.showModal();
  }

  async function saveEditor(event) {
    event.preventDefault();
    if (!prepareEditorSubmission()) return;
    const form = elements.editor.elements;
    const category = context.categories.find((item) => item.id === form.categoryId.value);
    const numberOrNull = (value) => value === "" ? null : Number(value);
    const payload = {
      inventoryNumber: form.inventoryNumber.value,
      name: form.name.value,
      categoryId: form.categoryId.value,
      manufacturer: form.manufacturer.value || null,
      model: form.model.value || null,
      serialNumber: form.serialNumber.value || null,
      purchaseDate: form.purchaseDate.value || null,
      purchasePriceCents: form.purchasePrice.value === "" ? null : Math.round(Number(form.purchasePrice.value) * 100),
      supplier: form.supplier.value || null,
      warrantyUntil: form.warrantyUntil.value || null,
      condition: form.condition.value,
      status: form.status.value,
      fixedOwnerUserId: form.fixedOwnerUserId.value || null,
      ...(!editing ? { currentOwnerUserId: form.currentOwnerUserId.value || null } : {}),
      locationId: form.locationId.value || null,
      constructionSiteId: form.constructionSiteId.value || null,
      vehicleId: form.vehicleId.value || null,
      inspectionRequired: form.inspectionRequired.checked,
      nextInspectionOn: form.nextInspectionOn.value || null,
      maintenanceIntervalDays: numberOrNull(form.maintenanceIntervalDays.value),
      nextMaintenanceOn: form.nextMaintenanceOn.value || null,
      note: form.note.value || null,
      ...(category?.baseType === "battery" ? { battery: {
        batterySystem: form.batterySystem.value,
        voltage: numberOrNull(form.voltage.value),
        capacityAh: numberOrNull(form.capacityAh.value),
        cycleCount: numberOrNull(form.cycleCount.value),
        lastCapacityTestOn: form.lastCapacityTestOn.value || null,
        remainingCapacityPercent: numberOrNull(form.remainingCapacityPercent.value),
        compatibleSystem: form.compatibleSystem.value || null
      } } : {}),
      ...(editing ? { rowVersion: editing.rowVersion } : {})
    };
    const save = elements.editor.querySelector(".device-editor-save");
    save.disabled = true;
    elements.editorMessage.textContent = "Wird gespeichert …";
    try {
      const partRows = editing ? [] : [...elements.partList.querySelectorAll(".device-part-row")];
      const parts = partRows.map((row) => partPayload(row, payload));
      const createBundle = !editing && parts.length > 0;
      const body = await requestJson(
        editing
          ? `./api/v1/admin/devices/${encodeURIComponent(editing.id)}`
          : createBundle ? "./api/v1/admin/devices/bundles" : "./api/v1/admin/devices",
        {
          method: editing ? "PATCH" : "POST",
          body: JSON.stringify(createBundle ? {
            device: payload,
            parts,
            set: {
              setNumber: form.setNumber.value,
              name: form.setName.value,
              note: `Gemeinsam mit ${payload.inventoryNumber} angelegt`
            }
          } : payload)
        }
      );
      const saved = createBundle ? body.bundle.device : body.device;
      const photo = form.photo.files?.[0];
      if (photo) {
        try {
          await requestJson(`./api/v1/admin/devices/${encodeURIComponent(saved.id)}/photo`, {
            method: "POST", body: JSON.stringify({ dataUrl: await fileDataUrl(photo) })
          });
        } catch (error) {
          showToast(`Gerät gespeichert; Foto konnte nicht übernommen werden: ${error.message}`);
        }
      }
      elements.editorDialog.close();
      await refresh();
      const fresh = devices.find((item) => item.id === saved.id) || saved;
      if (editing) {
        showToast("Gerät aktualisiert.");
        void openDetail(fresh);
      } else {
        const added = [fresh, ...(createBundle ? body.bundle.parts : [])].map((item) => (
          devices.find((candidate) => candidate.id === item.id) || item
        ));
        showCreatedDevices(added, body.bundle?.set || null);
      }
    } catch (error) {
      elements.editorMessage.textContent = error.message;
    } finally {
      save.disabled = false;
    }
  }

  function showCreatedDevices(items, set = null) {
    createdDevices = items;
    printSelection.clear();
    items.forEach((item) => printSelection.add(item.id));
    updatePrintButton();
    elements.createdMessage.textContent = set
      ? `${set.number} · ${set.name} enthält ${items.length} einzeln inventarisierte Gegenstände. Jeder QR-Code verweist auf genau einen Datensatz.`
      : `${items[0].name} wurde angelegt und fest mit seinem QR-Code verknüpft.`;
    elements.createdList.replaceChildren();
    items.forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "device-created-item";
      const copy = document.createElement("span");
      const strong = document.createElement("strong");
      strong.textContent = item.name;
      const meta = document.createElement("small");
      meta.textContent = [item.inventoryNumber, item.serialNumber && `SN ${item.serialNumber}`]
        .filter(Boolean).join(" · ");
      copy.append(strong, meta);
      const action = document.createElement("span");
      action.textContent = "QR anzeigen";
      button.append(copy, action);
      button.addEventListener("click", () => {
        elements.createdDialog.close();
        openQr(item);
      });
      elements.createdList.append(button);
    });
    elements.createdPrint.textContent = items.length === 1
      ? "QR-Etikett drucken" : `Alle ${items.length} QR-Etiketten drucken`;
    showToast(items.length === 1
      ? "Gerät angelegt · QR-Code ist bereit."
      : `${items.length} Gegenstände angelegt · QR-Codes sind bereit.`);
    elements.createdDialog.showModal();
  }

  function renderSetDetail(set) {
    elements.setContent.replaceChildren();
    const title = document.createElement("h2");
    title.id = "device-set-title";
    title.textContent = `${set.number} · ${set.name}`;
    const note = document.createElement("p");
    note.textContent = set.note || `${set.items.length} einzeln inventarisierte Gegenstände`;
    const list = document.createElement("div");
    list.className = "device-set-items";
    set.items.forEach((item) => {
      const row = document.createElement("article");
      const open = document.createElement("button");
      open.type = "button";
      open.className = "device-set-item-main";
      const strong = document.createElement("strong");
      strong.textContent = item.name;
      const meta = document.createElement("span");
      meta.textContent = [item.inventoryNumber, item.serialNumber && `SN ${item.serialNumber}`]
        .filter(Boolean).join(" · ");
      open.append(strong, meta);
      open.addEventListener("click", () => {
        elements.setDialog.close();
        void openDetail(devices.find((device) => device.id === item.id) || item);
      });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "device-set-item-remove";
      remove.textContent = "Entfernen";
      remove.disabled = set.items.length <= 1;
      remove.addEventListener("click", async () => {
        const reason = window.prompt("Warum wird das Teil aus dem Set entfernt?");
        if (!reason || reason.trim().length < 3) return;
        try {
          const body = await requestJson(
            `./api/v1/admin/devices/sets/${encodeURIComponent(set.id)}/items/${encodeURIComponent(item.id)}`,
            { method: "DELETE", body: JSON.stringify({ rowVersion: set.rowVersion, reason }) }
          );
          renderSetDetail(body.set);
          await refresh();
        } catch (error) { showToast(error.message); }
      });
      row.append(open, remove);
      list.append(row);
    });
    const addForm = document.createElement("form");
    addForm.className = "device-set-add";
    const select = document.createElement("select");
    option(select, "", "Vorhandenes Gerät hinzufügen");
    devices.filter((device) => device.status !== "retired" && !device.set)
      .forEach((device) => option(select, device.id, `${device.inventoryNumber} · ${device.name}`));
    select.required = true;
    const add = document.createElement("button");
    add.type = "submit";
    add.className = "button button--secondary";
    add.textContent = "Zum Set hinzufügen";
    addForm.append(select, add);
    addForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        const body = await requestJson(
          `./api/v1/admin/devices/sets/${encodeURIComponent(set.id)}/items`,
          {
            method: "POST",
            body: JSON.stringify({ rowVersion: set.rowVersion, deviceIds: [select.value] })
          }
        );
        renderSetDetail(body.set);
        await refresh();
      } catch (error) { showToast(error.message); }
    });
    const actions = document.createElement("div");
    actions.className = "device-dialog__actions";
    const print = document.createElement("button");
    print.type = "button";
    print.className = "button button--action";
    print.textContent = "QR-Druckbogen für dieses Set";
    print.addEventListener("click", () => {
      printSelection.clear();
      set.items.forEach((item) => printSelection.add(item.id));
      updatePrintButton();
      void printSheet();
    });
    actions.append(print);
    elements.setContent.append(title, note, list, addForm, actions);
  }

  async function openSet(setId) {
    elements.setContent.replaceChildren();
    const waiting = document.createElement("p");
    waiting.textContent = "Set wird geladen …";
    elements.setContent.append(waiting);
    if (!elements.setDialog.open) elements.setDialog.showModal();
    try {
      const body = await requestJson(`./api/v1/admin/devices/sets/${encodeURIComponent(setId)}`);
      renderSetDetail(body.set);
    } catch (error) {
      waiting.textContent = error.message;
    }
  }

  function detailRow(label, value) {
    const row = document.createElement("div");
    const term = document.createElement("dt"); term.textContent = label;
    const description = document.createElement("dd"); description.textContent = value || "–";
    row.append(term, description); return row;
  }

  async function openDetail(device) {
    selected = device;
    elements.detail.replaceChildren();
    const top = document.createElement("div"); top.className = "device-detail__top";
    if (device.photoUrl) {
      const image = document.createElement("img"); image.src = device.photoUrl; image.alt = device.name; top.append(image);
    }
    const heading = document.createElement("div");
    const eyebrow = document.createElement("p"); eyebrow.className = "eyebrow"; eyebrow.textContent = `${device.categoryName} · ${device.inventoryNumber}`;
    const title = document.createElement("h2"); title.id = "device-detail-title"; title.textContent = device.name;
    const badge = document.createElement("span"); badge.className = `device-badge device-badge--${statusClass(device)}`; badge.textContent = deviceStatusLabel(device.effectiveStatus);
    heading.append(eyebrow, title, badge); top.append(heading);
    const facts = document.createElement("dl"); facts.className = "device-detail__facts";
    facts.append(
      detailRow("Fester Besitzer", device.fixedOwner
        ? `${device.fixedOwner.name}${device.fixedOwner.since ? ` · seit ${formatDate(device.fixedOwner.since, true)}` : ""}${device.fixedOwner.status === "active" ? "" : " · archiviert"}`
        : "Nicht fest zugeordnet"),
      detailRow("Aktueller Besitzer", device.currentOwner
        ? `${device.currentOwner.name}${device.currentOwner.since ? ` · seit ${formatDate(device.currentOwner.since, true)}` : ""}${device.currentOwner.status === "active" ? "" : " · archiviert"}`
        : "Niemand"),
      detailRow("Standort", device.currentLocation?.name || device.constructionSite?.name || "Nicht angegeben"),
      detailRow("Letzter bekannter Standort", device.lastKnownLocation?.name),
      detailRow("Baustelle", device.constructionSite?.name),
      detailRow("Fahrzeug", device.vehicle?.name),
      detailRow("Hersteller / Modell", [device.manufacturer, device.model].filter(Boolean).join(" ")),
      detailRow("Seriennummer", device.serialNumber),
      detailRow("Kaufdatum / Alter", device.purchaseDate
        ? `${formatDate(device.purchaseDate)} · ${ageFromPurchaseDate(device.purchaseDate)}` : null),
      detailRow("Letzte Prüfung", device.lastInspectionOn ? formatDate(device.lastInspectionOn) : null),
      detailRow("Nächste Prüfung", device.nextInspectionOn ? `${formatDate(device.nextInspectionOn)} · ${device.inspectionState === "overdue" ? "überfällig" : device.inspectionState === "due" ? "bald fällig" : "im Plan"}` : "Keine Frist"),
      detailRow("Nächste Wartung", device.nextMaintenanceOn ? formatDate(device.nextMaintenanceOn) : null)
    );
    if (device.set) {
      facts.append(detailRow(
        "Geräteset / beiliegende Teile",
        `${device.set.number} · ${device.set.name} · ${device.set.itemCount} Teile`
      ));
    }
    if (device.battery) {
      facts.append(
        detailRow("Akkusystem", device.battery.batterySystem),
        detailRow("Spannung / Kapazität", [device.battery.voltage && `${device.battery.voltage} V`, device.battery.capacityAh && `${device.battery.capacityAh} Ah`].filter(Boolean).join(" · ")),
        detailRow("Ladezyklen", device.battery.cycleCount == null ? null : String(device.battery.cycleCount)),
        detailRow("Letzter Kapazitätstest", device.battery.lastCapacityTestOn ? formatDate(device.battery.lastCapacityTestOn) : null),
        detailRow("Restkapazität", device.battery.remainingCapacityPercent == null ? null : `${device.battery.remainingCapacityPercent} %`),
        detailRow("Kompatibles System", device.battery.compatibleSystem)
      );
    }
    const warning = document.createElement("div");
    warning.className = `device-detail__warning${device.blocked ? " device-detail__warning--danger" : ""}`;
    const ownUserId = getSession()?.user?.id;
    if (device.blocked) {
      warning.textContent = `ACHTUNG – GERÄT GESPERRT${device.openDefect ? `: ${device.openDefect.description}` : ""}`;
    } else if (device.openDefect) {
      warning.textContent = `Defekt gemeldet: ${device.openDefect.description}${device.openDefect.usable ? " · laut Meldung weiter verwendbar" : ""}`;
    } else if (device.fixedOwner && device.fixedOwner.id !== ownUserId) {
      warning.textContent = `Dieses Gerät ist ${device.fixedOwner.name} fest zugeordnet.${device.currentOwner ? ` Aktuell bei ${device.currentOwner.name}.` : ""}`;
    } else if (device.fixedOwner?.id === ownUserId
        && device.currentOwner && device.currentOwner.id !== ownUserId) {
      warning.textContent = `Dein Gerät ist aktuell bei ${device.currentOwner.name}.`;
    } else if (device.currentOwner && device.currentOwner.id !== ownUserId) {
      warning.textContent = `Dieses Gerät ist aktuell bei ${device.currentOwner.name}.`;
    }
    warning.hidden = !warning.textContent;
    const controls = document.createElement("div"); controls.className = "device-detail__controls";
    const employee = document.createElement("select"); fillSelect(employee, context?.employees || [], "Mitarbeiter wählen");
    const location = document.createElement("select"); fillSelect(location, (context?.locations || []).filter((item) => item.status === "active"), "Lager / Standort wählen", context?.settings?.defaultStorageLocationId);
    const site = document.createElement("select"); fillSelect(site, context?.sites || [], "Baustelle wählen");
    employee.setAttribute("aria-label", "Empfänger auswählen");
    location.setAttribute("aria-label", "Lager oder Standort auswählen");
    site.setAttribute("aria-label", "Baustelle auswählen");
    if (device.actions.includes("handover") || (manager() && device.status !== "retired")) {
      controls.append(employee);
    }
    if (device.actions.includes("return")) controls.append(location);
    if (device.actions.includes("leave_site")) controls.append(site);
    controls.hidden = !controls.children.length;
    const actions = document.createElement("div"); actions.className = "device-detail__actions";
    const actionButton = (label, handler, kind = "secondary") => {
      const button = document.createElement("button"); button.type = "button"; button.className = `button button--${kind}`; button.textContent = label; button.addEventListener("click", handler); actions.append(button); return button;
    };
    if (device.actions.includes("takeover")) actionButton("Gerät übernehmen", () => void transfer("takeover"), "action");
    if (device.actions.includes("return")) {
      if (device.fixedOwner && !device.isFixedOwner) {
        actionButton("An festen Besitzer zurückgeben", () => void transfer("return_fixed_owner"), "action");
      }
      actionButton(device.fixedOwner && !device.isFixedOwner ? "Ins Lager zurückgeben" : "Zurückgeben", () => void transfer("return_storage", {
        locationId: location.value || context?.settings?.defaultStorageLocationId
      }), device.fixedOwner && !device.isFixedOwner ? "secondary" : "action");
    }
    if (device.actions.includes("handover")) actionButton("An Mitarbeiter übergeben", () => {
      if (!employee.value) return showToast("Bitte zuerst einen Mitarbeiter auswählen.");
      void transfer("handover", { toUserId: employee.value });
    });
    if (device.actions.includes("leave_site")) actionButton("Auf Baustelle lassen", () => {
      if (!site.value) return showToast("Bitte zuerst eine Baustelle auswählen.");
      void transfer("leave_site", { constructionSiteId: site.value });
    });
    if (device.actions.includes("report_defect")) actionButton("Defekt melden", openDefect);
    if (manager()) {
      if (device.status !== "retired") {
        actionButton("Aktuellen Besitzer zuordnen", () => {
          if (!employee.value) return showToast("Bitte zuerst einen Mitarbeiter auswählen.");
          const note = window.prompt("Grund für die administrative Zuordnung:");
          if (!note || note.trim().length < 3) return;
          void transfer("administrative_correction", { toUserId: employee.value, note });
        });
        actionButton("Bearbeiten", () => { elements.detailDialog.close(); openEditor(device); });
      }
      actionButton("QR-Etikett", () => openQr(device));
      if (device.set) {
        actionButton("Set & beiliegende Teile", () => {
          elements.detailDialog.close();
          void openSet(device.set.id);
        });
      }
      if (device.status !== "retired") actionButton("Prüfung erfassen", openInspection);
      if (device.openDefect) actionButton("Reparatur abschließen", async () => {
        const note = window.prompt("Was wurde repariert bzw. geprüft?");
        if (!note || note.trim().length < 3) return;
        try {
          await requestJson(`./api/v1/admin/devices/defects/${encodeURIComponent(device.openDefect.id)}/resolve`, {
            method: "POST",
            body: JSON.stringify({
              rowVersion: device.openDefect.rowVersion,
              resolutionNote: note
            })
          });
          elements.detailDialog.close();
          showToast("Reparatur abgeschlossen · Gerät wieder bewertet.");
          await refresh();
        } catch (error) { showToast(error.message); }
      });
    }
    const historySection = document.createElement("section"); historySection.className = "device-detail__history";
    const historyTitle = document.createElement("h3"); historyTitle.textContent = "Historie";
    const historyList = document.createElement("ol"); const waiting = document.createElement("li"); waiting.textContent = "Historie wird geladen …"; historyList.append(waiting);
    historySection.append(historyTitle, historyList);
    elements.detail.append(top, warning, facts, controls, actions, historySection);
    if (!elements.detailDialog.open) elements.detailDialog.showModal();
    try {
      const body = await requestJson(`./api/v1/devices/${encodeURIComponent(device.id)}/history`);
      historyList.replaceChildren();
      const transfers = (body.history.transfers || []).map((item) => ({
        type: "transfer", at: item.occurred_at, item
      }));
      const events = (body.history.events || [])
        .filter((item) => ![
          "device_transferred", "device_returned", "device_administratively_corrected"
        ].includes(item.action))
        .map((item) => ({ type: "event", at: item.occurred_at, item }));
      [...transfers, ...events]
        .sort((left, right) => String(right.at).localeCompare(String(left.at)))
        .forEach((entry) => {
        const item = entry.item;
        const row = document.createElement("li");
        const title = document.createElement("strong");
        title.textContent = entry.type === "transfer"
          ? [item.from_name || item.from_location || "Verfügbar", "→", item.to_name || item.to_location || item.site_name || "Verfügbar"].join(" ")
          : item.reason || item.action;
        const meta = document.createElement("span");
        meta.textContent = entry.type === "transfer"
          ? `${formatDate(item.occurred_at, true)} · ${item.action} · Zustand ${item.condition_key || "unbekannt"}`
          : `${formatDate(item.occurred_at, true)} · ${item.actor_name}`;
        row.append(title, meta); historyList.append(row);
      });
      if (!historyList.children.length) { const empty = document.createElement("li"); empty.textContent = "Noch keine Bewegung protokolliert."; historyList.append(empty); }
    } catch (error) {
      historyList.replaceChildren(); const row = document.createElement("li"); row.textContent = error.message; historyList.append(row);
    }
  }

  async function transfer(action, extra = {}) {
    if (!selected) return;
    if (action === "takeover" && selected.fixedOwner?.id !== getSession()?.user?.id) {
      const owner = selected.fixedOwner?.name || selected.currentOwner?.name;
      if (owner && !window.confirm(`Dieses Gerät gehört bzw. ist aktuell bei ${owner}. Wirklich übernehmen?`)) return;
    }
    const payload = {
      action,
      clientOperationId: createClientId(),
      expectedRowVersion: selected.rowVersion,
      clientCreatedAt: new Date().toISOString(),
      ...extra
    };
    if (!navigator.onLine) {
      queueTransfer(selected, action, extra);
      elements.detailDialog.close();
      return;
    }
    try {
      const body = await requestJson(`./api/v1/devices/${encodeURIComponent(selected.id)}/transfers`, {
        method: "POST", body: JSON.stringify(payload)
      });
      selected = body.transfer.device;
      showToast(action === "return_fixed_owner" || action === "return_storage" ? "Gerät zurückgegeben." : "Gerät übergeben.");
      elements.detailDialog.close();
      await refresh();
      void openDetail(devices.find((item) => item.id === selected.id) || selected);
    } catch (error) {
      showToast(error.message);
      if (error.code === "device_transfer_conflict") await refresh();
    }
  }

  function openDefect() {
    if (!selected) return;
    elements.defectForm.reset(); elements.defectMessage.textContent = "";
    elements.defectDialog.showModal();
  }

  async function submitDefect(event) {
    event.preventDefault();
    const form = elements.defectForm.elements;
    elements.defectMessage.textContent = "Defekt wird gespeichert …";
    try {
      await requestJson(`./api/v1/devices/${encodeURIComponent(selected.id)}/defects`, {
        method: "POST", body: JSON.stringify({
          description: form.description.value, severity: form.severity.value,
          usable: form.usable.checked, photoDataUrl: await fileDataUrl(form.photo.files?.[0])
        })
      });
      elements.defectDialog.close(); elements.detailDialog.close();
      showToast(form.usable.checked ? "Defekt gemeldet · Hinweis ist am Gerät sichtbar." : "Gerät gesperrt · Defekt ist gemeldet.");
      await refresh();
    } catch (error) { elements.defectMessage.textContent = error.message; }
  }

  function openInspection() {
    elements.inspectionForm.reset();
    fillSelect(elements.inspectionForm.elements.inspectorUserId, context?.employees || [], "Externer Prüfer", getSession()?.user?.id);
    elements.inspectionForm.elements.inspectedOn.value = localDate();
    elements.inspectionForm.elements.nextInspectionOn.value = selected?.nextInspectionOn || "";
    elements.inspectionMessage.textContent = "";
    elements.inspectionDialog.showModal();
  }

  async function submitInspection(event) {
    event.preventDefault(); const form = elements.inspectionForm.elements;
    elements.inspectionMessage.textContent = "Prüfung wird gespeichert …";
    try {
      await requestJson(`./api/v1/admin/devices/${encodeURIComponent(selected.id)}/inspections`, {
        method: "POST", body: JSON.stringify({
          inspectionType: form.inspectionType.value, inspectedOn: form.inspectedOn.value,
          inspectorUserId: form.inspectorUserId.value || null,
          inspectorName: form.inspectorName.value || null, result: form.result.value,
          nextInspectionOn: form.nextInspectionOn.value || null,
          intervalDays: form.intervalDays.value ? Number(form.intervalDays.value) : null,
          note: form.note.value || null
        })
      });
      elements.inspectionDialog.close(); elements.detailDialog.close();
      showToast("Prüfung gespeichert."); await refresh();
    } catch (error) { elements.inspectionMessage.textContent = error.message; }
  }

  function openQr(device) {
    selected = device;
    const url = `./api/v1/admin/devices/${encodeURIComponent(device.id)}/qr`;
    elements.qrImage.src = url; elements.qrDownload.href = url;
    elements.qrName.textContent = device.name; elements.qrNumber.textContent = device.inventoryNumber;
    elements.qrDialog.showModal();
  }

  // Stile und Beschriftung kommen nicht mehr aus dem Dokument selbst: die App
  // laeuft unter `style-src 'self'` und `script-src 'self'`, und das
  // Druckfenster erbt beides. Eingebettete Stile kamen ohne eine einzige Regel
  // an, das eingebettete Skript lief nie - gedruckt wurde ein riesiges Bild
  // ohne Namen und ohne Nummer. Die Datei von der eigenen Herkunft ist erlaubt,
  // und der Text wird vom Opener aus gesetzt.
  function druckseite(popup, titel, stildatei) {
    popup.document.write(`<!doctype html><html lang="de"><head><meta charset="utf-8">`
      + `<title>${titel}</title>`
      + `<link rel="stylesheet" href="${window.location.origin}/${stildatei}?v=0.44.26">`
      + `</head><body></body></html>`);
  }

  function printQr(device) {
    const popup = window.open("", "_blank");
    if (!popup) return showToast("Bitte Pop-ups für den Etikettendruck erlauben.");
    druckseite(popup, "Schäfchen Geräteetikett", "print-devices.css");
    popup.document.body.className = "single";

    const label = popup.document.createElement("div");
    label.className = "label";
    const bild = popup.document.createElement("img");
    bild.src = `${window.location.origin}/api/v1/admin/devices/${encodeURIComponent(device.id)}/qr`;
    const name = popup.document.createElement("strong");
    name.textContent = device.name;
    const nummer = popup.document.createElement("span");
    nummer.textContent = device.inventoryNumber;
    label.append(bild, name, nummer);
    popup.document.body.append(label);

    popup.document.close();
    // Erst drucken, wenn das Bild da ist - sonst bleibt das Etikett leer.
    bild.addEventListener("load", () => popup.print());
    return undefined;
  }

  async function printSheet() {
    if (!printSelection.size) return;
    const popup = window.open("", "_blank");
    if (popup) popup.opener = null;
    try {
      const body = await requestJson("./api/v1/admin/devices/qr-sheet", {
        method: "POST", body: JSON.stringify({ deviceIds: [...printSelection] })
      });
      if (!popup) return showToast("Bitte Pop-ups für den Druckbogen erlauben.");
      druckseite(popup, "Schäfchen QR-Druckbogen", "print-devices.css");
      const sheet = popup.document.createElement("main");
      sheet.className = "sheet";
      popup.document.body.append(sheet);
      body.labels.forEach((label) => {
        const article = popup.document.createElement("article"); article.className = "label";
        const qr = popup.document.createElement("div"); qr.className = "label__qr"; qr.innerHTML = label.svg;
        const strong = popup.document.createElement("strong"); strong.textContent = label.label.split(" · ")[0];
        const number = popup.document.createElement("span"); number.textContent = label.label.split(" · ").slice(1).join(" · ");
        article.append(qr, strong, number); sheet.append(article);
      });
      popup.document.close(); popup.focus(); popup.print();
    } catch (error) { popup?.close(); showToast(error.message); }
  }

  function stopCamera() {
    scanning = false;
    if (scanResumeTimer) window.clearTimeout(scanResumeTimer);
    scanResumeTimer = null;
    qrScanner?.destroy();
    qrScanner = null;
    elements.scanVideo.srcObject = null;
  }

  function resumeCamera(delay = 0) {
    if (scanResumeTimer) window.clearTimeout(scanResumeTimer);
    scanResumeTimer = window.setTimeout(async () => {
      scanResumeTimer = null;
      if (!elements.scanDialog.open || !qrScanner) return;
      try {
        scanning = true;
        await qrScanner.start();
      } catch (error) {
        scanning = false;
        elements.scanMessage.textContent = cameraScanErrorMessage(error);
      }
    }, delay);
  }

  async function handleCameraResult(result) {
    const rawValue = qrScanResultValue(result);
    if (!scanning || !rawValue) return;
    scanning = false;
    try { await qrScanner?.pause(true); } catch { /* Der Scanwert bleibt verwertbar. */ }
    await scanValue(rawValue);
  }

  async function startCamera() {
    stopCamera();
    elements.scanMessage.textContent = "Kamera wird vorbereitet …";
    if (!navigator.mediaDevices?.getUserMedia) {
      elements.scanMessage.textContent = "Dieser Browser kann die Kamera nicht direkt öffnen. QR-Adresse unten einfügen.";
      return;
    }
    try {
      const QrScanner = await loadQrScannerLibrary();
      if (!elements.scanDialog.open) return;
      qrScanner = new QrScanner(elements.scanVideo, (result) => void handleCameraResult(result), {
        preferredCamera: "environment",
        maxScansPerSecond: 10,
        returnDetailedScanResult: true,
        onDecodeError: () => {}
      });
      scanning = true;
      await qrScanner.start();
      if (!elements.scanDialog.open) return stopCamera();
      elements.scanMessage.textContent = "QR-Code in den Rahmen halten …";
    } catch (error) {
      stopCamera();
      elements.scanMessage.textContent = cameraScanErrorMessage(error);
    }
  }

  function openScanner() {
    if (!elements.scanDialog.open) elements.scanDialog.showModal();
    elements.scanValue.value = "";
    void startCamera();
  }

  function closeScanner() {
    stopCamera();
    if (elements.scanDialog.open) elements.scanDialog.close();
  }

  async function scanValue(rawValue) {
    let token;
    try { token = normalizeDeviceQrValue(rawValue); }
    catch (error) { elements.scanMessage.textContent = error.message; resumeCamera(900); return; }
    lastScanToken = token;
    if (currentInventory) {
      if (!navigator.onLine) {
        elements.scanMessage.textContent = "Die Inventur benötigt zum Abgleichen momentan eine Verbindung.";
        return;
      }
      try {
        const body = await requestJson(`./api/v1/devices/inventories/${encodeURIComponent(currentInventory.id)}/scan`, {
          method: "POST", body: JSON.stringify({ token })
        });
        elements.scanMessage.textContent = body.scan.device
          ? `${body.scan.device.name}: ${inventoryResultLabel(body.scan.result)}`
          : "Unbekannter QR-Code erfasst.";
        resumeCamera(900);
      } catch (error) { elements.scanMessage.textContent = error.message; resumeCamera(1200); }
      return;
    }
    if (!navigator.onLine) {
      const cached = readStorage(cacheKey(), {})[token];
      if (!cached) {
        elements.scanMessage.textContent = "Dieser Code ist auf diesem Gerät noch nicht bekannt. Mit Verbindung einmal scannen.";
        resumeCamera(1500);
        return;
      }
      cacheScan(token, cached);
      selected = cached;
      if (!cached.blocked && !cached.currentOwner && (!cached.fixedOwner || cached.fixedOwner.id === getSession()?.user?.id)) {
        queueTransfer(cached, "takeover");
        closeScanner();
      } else {
        closeScanner();
        void openDetail(cached);
      }
      return;
    }
    elements.scanMessage.textContent = "Gerät wird erkannt …";
    try {
      const body = await requestJson("./api/v1/devices/scan", {
        method: "POST",
        body: JSON.stringify({ token, clientOperationId: createClientId(), clientCreatedAt: new Date().toISOString() })
      });
      const result = body.scan;
      cacheScan(token, result.device);
      // Nach einem erneuten Online-Scan gilt der Serverstand als eindeutige
      // Konfliktauflösung. Der alte Offline-Versuch darf die App danach nicht
      // dauerhaft als offen markieren.
      const endpoint = `./api/v1/devices/${encodeURIComponent(result.device.id)}/transfers`;
      saveQueue(queue().filter((item) => item.status !== "conflict" || item.endpoint !== endpoint));
      closeScanner();
      selected = result.device;
      await refresh();
      selected = devices.find((item) => item.id === result.device.id) || result.device;
      if (result.outcome === "assigned") showToast(`${selected.name} · jetzt dir zugeordnet.`);
      if (result.outcome === "already_yours") showToast(`${selected.name} ist bereits dir zugeordnet.`);
      if (result.outcome === "confirmation_required") showToast("Fremde Zuordnung erkannt · bitte Übernahme bestätigen.");
      if (result.outcome === "blocked") showToast("ACHTUNG – Gerät ist gesperrt.");
      void openDetail(selected);
    } catch (error) {
      elements.scanMessage.textContent = error.message;
      if (!elements.scanDialog.open) elements.scanDialog.showModal();
      resumeCamera(1200);
    }
  }

  async function scanImage(file) {
    if (!file) return;
    try {
      scanning = false;
      try { await qrScanner?.pause(true); } catch { /* Das Foto kann trotzdem gelesen werden. */ }
      elements.scanMessage.textContent = "QR-Foto wird erkannt …";
      const QrScanner = await loadQrScannerLibrary();
      const result = await QrScanner.scanImage(file, { returnDetailedScanResult: true });
      const rawValue = qrScanResultValue(result);
      if (!rawValue) throw new Error("Kein QR-Code erkannt.");
      await scanValue(rawValue);
    } catch (error) {
      elements.scanMessage.textContent = /no qr code/i.test(String(error?.message || error || ""))
        ? "Auf dem Foto wurde kein QR-Code erkannt."
        : error?.message || "Kein QR-Code erkannt.";
      resumeCamera(1200);
    } finally {
      elements.scanImage.value = "";
    }
  }

  async function scanEnteredValue(rawValue) {
    if (qrScanner && scanning) {
      scanning = false;
      try { await qrScanner.pause(true); } catch { /* Der eingegebene Wert bleibt nutzbar. */ }
    }
    await scanValue(rawValue);
  }

  async function handleDeepLink() {
    if (deepLinkHandled || !enabled || !getSession()) return;
    const value = new URLSearchParams(window.location.search).get("device");
    if (!value) return;
    deepLinkHandled = true;
    navigate("devices");
    await scanValue(value);
    const url = new URL(window.location.href);
    url.searchParams.delete("device");
    window.history.replaceState({}, "", url);
  }

  function setEnabled(value) {
    enabled = Boolean(value);
    root.hidden = !enabled;
    if (enabled) {
      renderSyncState();
      render();
    }
  }

  function unreadCount() {
    return notifications.filter((item) => !item.readAt).length;
  }

  function notificationSummary() {
    const count = unreadCount();
    if (!count) return null;
    return {
      text: count === 1 ? "1 Gerätehinweis ist offen" : `${count} Gerätehinweise sind offen`,
      handler: () => { activeView = "overview"; navigate("devices"); render(); }
    };
  }

  function clear() {
    stopCamera();
    dashboard = null; context = null; devices = []; sets = []; notifications = [];
    loadProblems = []; selected = null; createdDevices = [];
    currentInventory = null; currentInventoryReport = null; deepLinkHandled = false;
    renderSyncState();
  }

  elements.scanNow.addEventListener("click", openScanner);
  elements.scanClose.addEventListener("click", closeScanner);
  elements.scanDialog.addEventListener("cancel", (event) => { event.preventDefault(); closeScanner(); });
  elements.scanDialog.addEventListener("click", (event) => { if (event.target === elements.scanDialog) closeScanner(); });
  elements.scanForm.addEventListener("submit", (event) => { event.preventDefault(); void scanEnteredValue(elements.scanValue.value); });
  elements.scanImage.addEventListener("change", () => void scanImage(elements.scanImage.files?.[0]));
  elements.search.addEventListener("input", render);
  elements.status.addEventListener("change", render);
  elements.add.addEventListener("click", () => openEditor());
  elements.printSheet.addEventListener("click", () => void printSheet());
  elements.editor.elements.categoryId.addEventListener("change", updateBatteryFields);
  elements.editor.elements.fixedOwnerUserId.addEventListener("change", () => {
    if (!editing && !elements.editor.elements.currentOwnerUserId.value) {
      elements.editor.elements.currentOwnerUserId.value = elements.editor.elements.fixedOwnerUserId.value;
    }
  });
  elements.includedPartsEnable.addEventListener("click", enableIncludedParts);
  elements.partAdd.addEventListener("click", addIncludedPart);
  elements.categoryNew.addEventListener("click", async () => {
    const name = window.prompt("Name der neuen Gerätekategorie:");
    if (!name?.trim()) return;
    const baseType = window.prompt(
      "Grundtyp: machine, power_tool, hand_tool, measuring_device, testing_device, battery, charger, ladder, equipment oder other",
      "other"
    );
    if (!baseType?.trim()) return;
    const key = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    try {
      const body = await requestJson("./api/v1/admin/devices/categories", {
        method: "POST", body: JSON.stringify({ key: key || `category_${Date.now()}`, name, baseType })
      });
      context.categories.push(body.category);
      option(elements.editor.elements.categoryId, body.category.id, body.category.name);
      elements.editor.elements.categoryId.value = body.category.id;
      updateBatteryFields();
      showToast("Gerätekategorie ergänzt.");
    } catch (error) {
      elements.editorMessage.textContent = error.message;
    }
  });
  elements.locationNew.addEventListener("click", async () => {
    const name = window.prompt("Name des neuen Lager- oder Werkstattstandorts:");
    if (!name?.trim()) return;
    const type = window.prompt("Standorttyp: warehouse, workshop oder other", "warehouse");
    if (!type?.trim()) return;
    try {
      const body = await requestJson("./api/v1/admin/devices/locations", {
        method: "POST", body: JSON.stringify({ name, type })
      });
      const location = {
        id: body.location.id,
        name: body.location.name,
        type: body.location.location_type,
        status: body.location.status,
        rowVersion: Number(body.location.row_version)
      };
      context.locations.push(location);
      option(elements.editor.elements.locationId, location.id, location.name);
      elements.editor.elements.locationId.value = location.id;
      showToast("Gerätestandort ergänzt.");
    } catch (error) {
      elements.editorMessage.textContent = error.message;
    }
  });
  elements.editor.addEventListener("submit", (event) => void saveEditor(event));
  elements.editorClose.addEventListener("click", () => elements.editorDialog.close());
  elements.editorCancel.addEventListener("click", () => elements.editorDialog.close());
  elements.createdClose.addEventListener("click", () => elements.createdDialog.close());
  elements.createdDone.addEventListener("click", () => elements.createdDialog.close());
  elements.createdPrint.addEventListener("click", () => void printSheet());
  elements.setClose.addEventListener("click", () => elements.setDialog.close());
  elements.editorRetire.addEventListener("click", async () => {
    if (!editing) return;
    const reason = window.prompt("Warum wird das Gerät ausgemustert?");
    if (!reason || reason.trim().length < 3) return;
    try {
      await requestJson(`./api/v1/admin/devices/${encodeURIComponent(editing.id)}`, {
        method: "DELETE", body: JSON.stringify({ rowVersion: editing.rowVersion, reason })
      });
      elements.editorDialog.close(); showToast("Gerät ausgemustert · Historie bleibt erhalten."); await refresh();
    } catch (error) { elements.editorMessage.textContent = error.message; }
  });
  elements.defectForm.addEventListener("submit", (event) => void submitDefect(event));
  elements.defectClose.addEventListener("click", () => elements.defectDialog.close());
  elements.defectCancel.addEventListener("click", () => elements.defectDialog.close());
  elements.inspectionForm.addEventListener("submit", (event) => void submitInspection(event));
  elements.inspectionClose.addEventListener("click", () => elements.inspectionDialog.close());
  elements.inspectionCancel.addEventListener("click", () => elements.inspectionDialog.close());
  elements.qrClose.addEventListener("click", () => elements.qrDialog.close());
  elements.qrPrint.addEventListener("click", () => selected && printQr(selected));
  elements.qrRotate.addEventListener("click", async () => {
    if (!selected || !window.confirm("Alten QR-Code sperren und einen neuen erzeugen?")) return;
    try {
      const body = await requestJson(`./api/v1/admin/devices/${encodeURIComponent(selected.id)}/qr/rotate`, {
        method: "POST", body: JSON.stringify({ reason: "QR-Etikett ersetzt" })
      });
      selected = body.device;
      elements.qrImage.src = `${elements.qrImage.src.split("?")[0]}?t=${Date.now()}`;
      showToast("Alter QR-Code gesperrt · neuer Code erzeugt.");
      await refresh();
      if (elements.detailDialog.open) {
        void openDetail(devices.find((item) => item.id === selected.id) || selected);
      }
    } catch (error) { showToast(error.message); }
  });
  window.addEventListener("online", () => void syncQueue());
  window.addEventListener("offline", renderSyncState);

  return {
    setEnabled,
    refresh,
    render,
    clear,
    openScanner,
    handleDeepLink,
    syncQueue,
    unreadCount,
    notificationSummary,
    setView(view) { if (VIEW_LABELS.has(view)) activeView = view; render(); }
  };
}
