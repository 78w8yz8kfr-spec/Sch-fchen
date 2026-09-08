const $ = (id) => document.getElementById(id);
const labels = { depot: "Lager", area: "Bereich", rack: "Regal", bin: "Fach" };
const next = { depot: "area", area: "rack", rack: "bin" };
const base = "./api/v1/inventory/locations";
let locations = [], canManage = false, editing = null, parent = null, busy = false;

async function request(path = "", options = {}) {
  const response = await fetch(base + path, { credentials: "same-origin", cache: "no-store", ...options,
    headers: { "Content-Type": "application/json", "X-Schaefchen-Version": "0.44.42" } });
  const data = await response.json();
  if (!response.ok) throw new Error(response.status === 401
    ? "Bitte zuerst in der Arbeitsapp anmelden und diese Seite erneut öffnen."
    : data.error?.message || "Die Anfrage konnte nicht verarbeitet werden.");
  return data;
}
function button(text, action) {
  const node = document.createElement("button"); node.type = "button"; node.textContent = text;
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
        if (next[row.kind] && row.status === "active") card.append(button(`+ ${labels[next[row.kind]]}`, () => openEditor(null, row)));
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
  $("code").value = row?.code || ""; $("name").value = row?.name || ""; $("form-message").textContent = "";
  $("editor").showModal(); $("code").focus();
}
async function changeStatus(row) {
  if (busy || !window.confirm(`${row.code} ${row.status === "active" ? "archivieren" : "reaktivieren"}? Die Historie bleibt erhalten.`)) return;
  busy = true;
  try {
    await request(`/${row.id}`, { method: "PATCH", body: JSON.stringify({ code: row.code, name: row.name,
      status: row.status === "active" ? "archived" : "active", rowVersion: row.rowVersion }) });
    await reload();
  } catch (error) { $("message").textContent = error.message; }
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
  event.preventDefault(); if (busy) return; busy = true; $("save").disabled = true;
  const body = { code: $("code").value, name: $("name").value, ...(editing
    ? { status: editing.status, rowVersion: editing.rowVersion }
    : { kind: parent ? next[parent.kind] : "depot", parentId: parent?.id || null }) };
  try {
    await request(editing ? `/${editing.id}` : "", { method: editing ? "PATCH" : "POST", body: JSON.stringify(body) });
    $("editor").close(); await reload();
  } catch (error) { $("form-message").textContent = error.message; }
  finally { busy = false; $("save").disabled = false; }
});
$("cancel").addEventListener("click", () => $("editor").close());
$("add").addEventListener("click", () => openEditor(null, null));
$("reload").addEventListener("click", reload);
$("search").addEventListener("input", render); $("archived").addEventListener("change", render);
void reload();
