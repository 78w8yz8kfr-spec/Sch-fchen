import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
const renderSource = source.slice(source.indexOf("  function renderReportCenter()"), source.indexOf("  function vdeInspectionStatusLabel("));
const formatterSource = source.match(/  function formatDateTime\([^]*?\n  \}/)?.[0] || "";
function element() {
  return { children: [], value: "", textContent: "", hidden: false,
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    addEventListener() {} };
}
function renderDraft(updatedAt) {
  const elements = Object.fromEntries([...renderSource.matchAll(/elements\.(\w+)/g)].map(([, name]) => [name, element()]));
  for (const name of ["Status", "Type", "Site", "Employee"]) elements[`reportCenter${name}`].value = "all";
  const draft = { number: "ENTWURF-1", summary: "Gespeicherter Montagebericht", reportType: "assembly", status: "draft", localDraft: true, updatedAt, workDate: "2026-09-21", authorName: "Testperson" };
  const context = vm.createContext({ elements, document: { createElement: element },
    adminState: { documents: [], sites: [] },
    populateReportCenterFilters() {}, reportCenterReports: () => [draft],
    reportCenterMissingAssignments: () => [], reportCenterSort: rows => rows,
    reportSite: () => ({ name: "Testbaustelle" }),
    reportTypeLabel: () => "Montagebericht", reportStatusLabel: () => "Entwurf",
    appendSiteModuleEmpty(list, text) { const empty = element(); empty.textContent = text; list.append(empty); }
  });
  vm.runInContext(`${formatterSource}\n${renderSource}\nrenderReportCenter();`, context);
  return elements;
}

test("Lokal gespeicherter Bericht wird mit Speicherzeit und Weiterbearbeiten angezeigt", () => {
  const stamp = "2026-09-21T13:05:00.000Z";
  const elements = renderDraft(stamp);
  assert.equal(elements.reportCenterList.children.length, 1);
  const [content, actions] = elements.reportCenterList.children[0].children;
  const expected = new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" }).format(new Date(stamp));
  assert.ok(content.children[1].textContent.includes(`gesichert ${expected}`));
  assert.equal(actions.children[0].textContent, "Weiterbearbeiten");
  assert.equal(elements.reportCenterDraftCount.textContent, "1");
});

test("Fehlende oder ungültige Speicherzeiten verhindern die Anzeige des Entwurfs nicht", () => {
  for (const stamp of [undefined, null, "", "ungueltig"]) {
    const elements = renderDraft(stamp);
    assert.equal(elements.reportCenterList.children.length, 1);
    const meta = elements.reportCenterList.children[0].children[0].children[1].textContent;
    assert.doesNotMatch(meta, /gesichert|Invalid Date/);
  }
});
