const $ = (id) => document.getElementById(id);
const labels = { depot: "Lager", area: "Bereich", rack: "Regal", bin: "Fach" };
const next = { depot: "area", area: "rack", rack: "bin" };
const base = "./api/v1/inventory/locations";
let locations = [], canManage = false, editing = null, parent = null, busy = false;

async function request(path = "", options = {}) {
  const response = await fetch(base + path, { credentials: "same-origin", cache: "no-store", ...options,
    headers: { "Content-Type": "application/json", "X-Schaefchen-Version": "0.44.54" } });
  // Eine Fehlerseite des Servers (etwa 404 oder 502) kommt als HTML, nicht als
  // JSON. Ohne diesen Fang landete die rohe Meldung "Unexpected token '<' ..."
  // vor den Augen des Nutzers. Bei unlesbarer Antwort bleibt data leer, und die
  // verstaendliche Meldung unten greift.
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(response.status === 401
      ? "Bitte zuerst in der Arbeitsapp anmelden und diese Seite erneut öffnen."
      : data.error?.message || "Die Anfrage konnte nicht verarbeitet werden. Bitte später erneut versuchen.");
    // Der Fehlercode des Servers (z. B. "duplicate_code") wandert mit, damit
    // die aufrufende Stelle die Meldung am betroffenen Feld zeigen kann statt
    // nur in der Sammelzeile oben im Formular.
    error.code = data.error?.code;
    throw error;
  }
  return data;
}
function button(text, action, variant = "secondary") {
  const node = document.createElement("button"); node.type = "button"; node.textContent = text;
  node.className = `button button--${variant}`;
  node.addEventListener("click", action); return node;
}
function render() {
  const query = $("search").value.trim().toLocaleLowerCase("de");
  const visible = locations.filter((row) => $("archived").checked || row.status === "active");
  const matches = new Set(visible.filter((row) => `${row.code} ${row.name}`.toLocaleLowerCase("de").includes(query)).map((row) => row.id));
  // Bei der Suche bleiben die Eltern sichtbar, damit die Fundstelle eindeutig ist.
  for (const id of [...matches]) {
    let row = locations.find((item) => item.id === id);
    while (row?.parentId) { matches.add(row.parentId); row = locations.find((item) => item.id === row.parentId); }
  }
  const tree = (parentId) => {
    const group = document.createElement("div");
    if (parentId) group.className = "children";
    for (const row of visible.filter((item) => item.parentId === parentId && matches.has(item.id))) {
      const card = document.createElement("article"); card.className = `location ${row.status === "archived" ? "archived" : ""}`;
      const title = document.createElement("div"); title.className = "location-title";
      const name = document.createElement("strong"); name.textContent = `${row.code} · ${row.name}`;
      const hint = document.createElement("small"); hint.textContent = labels[row.kind] + (row.status === "archived" ? " · archiviert" : "");
      title.append(name, hint); card.append(title);
      if (canManage) {
        if (next[row.kind] && row.status === "active") card.append(button(`+ ${labels[next[row.kind]]}`, () => openEditor(null, row), "primary"));
        card.append(button("Bearbeiten", () => openEditor(row, null)), button(row.status === "active" ? "Archivieren" : "Reaktivieren", () => changeStatus(row)));
      }
      card.append(button("Verlauf", () => showHistory(row))); group.append(card, tree(row.id));
    }
    return group;
  };
  $("locations").replaceChildren(tree(null));
  if (!matches.size) $("locations").textContent = locations.length ? "Keine passenden Lagerplätze." : "Noch keine Lagerplätze angelegt.";
}
async function reload() {
  try {
    const data = await request(); locations = data.locations; canManage = data.canManage;
    $("workspace").hidden = false; $("add").hidden = !canManage;
    $("message").textContent = `${locations.filter((row) => row.status === "active").length} aktive Lagerplätze${canManage ? "" : " · Lesezugriff"}`;
    render();
  } catch (error) { $("workspace").hidden = true; $("message").textContent = error.message; }
}
function openEditor(row, parentRow) {
  editing = row; parent = parentRow;
  $("editor-title").textContent = row ? "Lagerplatz bearbeiten" : `${labels[parentRow ? next[parentRow.kind] : "depot"]} anlegen`;
  $("parent-label").textContent = parentRow ? `Unter ${parentRow.code} · ${parentRow.name}` : "";
  $("code").value = row?.code || ""; $("name").value = row?.name || "";
  $("form-message").textContent = ""; $("code-error").textContent = ""; $("name-error").textContent = "";
  $("code").setAttribute("aria-invalid", "false"); $("name").setAttribute("aria-invalid", "false");
  $("editor").showModal(); $("code").focus();
}
// Prueft Code und Name am Feld, bevor ueberhaupt eine Anfrage rausgeht -
// konkrete Meldung direkt unter dem betroffenen Feld statt nur oben in der
// Sammelzeile. Serverseitig bleibt validateLocation() in api/src/inventory.mjs
// die massgebliche Pruefung; das hier ist nur schnelleres, konkreteres
// Feedback fuer denselben Fall.
function validateForm() {
  let valid = true;
  const code = $("code"), name = $("name");
  const codeOk = code.value.trim() !== "" && new RegExp(`^${code.pattern}$`).test(code.value.trim());
  $("code-error").textContent = codeOk ? "" : "Bitte einen Code aus Buchstaben, Ziffern, „-“ oder „_“ eingeben (max. 30 Zeichen).";
  code.setAttribute("aria-invalid", String(!codeOk));
  if (!codeOk) valid = false;
  const nameOk = name.value.trim() !== "";
  $("name-error").textContent = nameOk ? "" : "Bitte einen Namen eingeben.";
  name.setAttribute("aria-invalid", String(!nameOk));
  if (!nameOk) valid = false;
  if (!valid) (codeOk ? name : code).focus();
  return valid;
}
// Waehrend eine Statusaenderung laeuft, blockt "busy" zwar jede zweite
// Anfrage zuverlaessig ab (siehe Pruefung unten) - ohne diese Sperre sah man
// das einer Nachbarzeile aber nicht an: ihre Knoepfe blieben anklickbar und
// reagierten dann kommentarlos nicht. Waehrend einer Aenderung stehen deshalb
// alle Knoepfe der Liste kurz still.
function setLocationsBusy(state) {
  for (const button of document.querySelectorAll("#locations button")) button.disabled = state;
}
async function changeStatus(row) {
  if (busy) return;
  const toArchive = row.status === "active";
  if (!window.confirm(`${labels[row.kind]} ${row.code} · ${row.name} ${toArchive ? "archivieren" : "reaktivieren"}? Die Historie bleibt erhalten.`)) return;
  busy = true; setLocationsBusy(true);
  try {
    await request(`/${row.id}`, { method: "PATCH", body: JSON.stringify({ code: row.code, name: row.name,
      status: toArchive ? "archived" : "active", rowVersion: row.rowVersion }) });
    await reload();
    // Sichtbare Bestaetigung: reload() ueberschreibt die Nachricht mit der
    // Zaehlzeile, deshalb haengt die Bestaetigung dahinter an statt sie zu
    // ersetzen.
    $("message").textContent += toArchive ? " · Archiviert." : " · Reaktiviert.";
  } catch (error) { $("message").textContent = error.message; setLocationsBusy(false); }
  finally { busy = false; }
}
async function showHistory(row) {
  try {
    const data = await request(`/${row.id}/history`); $("events").replaceChildren();
    for (const event of data.events) {
      const li = document.createElement("li");
      li.textContent = `${new Date(event.happened_at).toLocaleString("de-DE")} · ${event.before_data ? "Geändert" : "Angelegt"}: ${event.after_data.code} · ${event.after_data.name} · ${event.after_data.status === "active" ? "aktiv" : "archiviert"}`;
      $("events").append(li);
    }
    $("history").hidden = false; $("history").scrollIntoView({ block: "nearest" });
  } catch (error) { $("message").textContent = error.message; }
}
$("form").addEventListener("submit", async (event) => {
  event.preventDefault(); if (busy) return;
  $("form-message").textContent = "";
  if (!validateForm()) return;
  busy = true; $("save").disabled = true;
  const body = { code: $("code").value, name: $("name").value, ...(editing
    ? { status: editing.status, rowVersion: editing.rowVersion }
    : { kind: parent ? next[parent.kind] : "depot", parentId: parent?.id || null }) };
  try {
    await request(editing ? `/${editing.id}` : "", { method: editing ? "PATCH" : "POST", body: JSON.stringify(body) });
    $("editor").close(); await reload();
    $("message").textContent += " · Gespeichert.";
  } catch (error) {
    // "Diesen Code gibt es auf dieser Ebene bereits" betrifft konkret das
    // Codefeld - dort zeigen statt nur oben in der Sammelzeile.
    if (error.code === "duplicate_code") { $("code-error").textContent = error.message; $("code").setAttribute("aria-invalid", "true"); $("code").focus(); }
    else $("form-message").textContent = error.message;
  }
  finally { busy = false; $("save").disabled = false; }
});
$("cancel").addEventListener("click", () => $("editor").close());
$("add").addEventListener("click", () => openEditor(null, null));
$("reload").addEventListener("click", () => { if (!busy) void reload(); });
$("search").addEventListener("input", render); $("archived").addEventListener("change", render);
// Fehlermeldung am Feld verschwindet, sobald sie behoben ist, statt erst beim
// naechsten Absenden. Bewusst kein erneuter Aufruf von validateForm(): der
// wuerde bei weiterhin ungueltigem Namensfeld den Fokus mitten im Tippen dort
// hinschieben.
$("code").addEventListener("input", () => {
  const code = $("code");
  if ($("code-error").textContent && code.value.trim() !== "" && new RegExp(`^${code.pattern}$`).test(code.value.trim())) {
    $("code-error").textContent = ""; code.setAttribute("aria-invalid", "false");
  }
});
$("name").addEventListener("input", () => { if ($("name-error").textContent && $("name").value.trim() !== "") { $("name-error").textContent = ""; $("name").setAttribute("aria-invalid", "false"); } });
void reload();
