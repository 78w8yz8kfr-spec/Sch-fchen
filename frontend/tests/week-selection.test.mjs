import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

// Die echten Ansichts-Funktionen mit kleinen DOM-Doubles ausführen. Damit
// prüfen wir Auswahl und Karten-Erhalt unabhängig von CSS und Browsergröße.
const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
const functions = source.slice(source.indexOf("  function updateSelectedWeekDay()"), source.indexOf("  function showAnalyticsSubarea("));
function node(date) {
  return {
    dataset: date ? { workDate: date } : {}, children: [], hidden: false, attributes: {},
    classList: { toggle() {} },
    setAttribute(key, value) { this.attributes[key] = value; },
    append(...children) {
      for (const child of children) {
        child.remove?.();
        child.parent = this;
        this.children.push(child);
      }
    },
    prepend(...children) {
      this.append(...children);
      this.children = [...children, ...this.children.filter(child => !children.includes(child))];
    },
    insertBefore(child, reference) {
      this.append(child);
      this.children.pop();
      this.children.splice(this.children.indexOf(reference), 0, child);
    },
    remove() {
      if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this);
    },
    querySelector() { return this.children.find(child => child.className?.includes("week-selected-empty")); },
    querySelectorAll() { return this.children; }
  };
}
function setup() {
  const elements = Object.fromEntries([
    "weekStrip", "weekTimesheetList", "weekOverviewSubarea", "weekDaysSubarea",
    "weekDaysSection", "timeAccountPanel", "weekAccountSubarea", "employeeTimesheetExportPanel"
  ].map(key => [key, node()]));
  elements.weekViewButtons = ["overview", "days", "account", "requests"].map(value => {
    const button = node(); button.dataset.weekViewButton = value; return button;
  });
  elements.weekSubareas = elements.weekViewButtons.map(button => {
    const area = node(); area.dataset.weekSubarea = button.dataset.weekViewButton; return area;
  });
  elements.weekStrip.append(node("2026-09-21"), node("2026-09-22"));
  elements.weekTimesheetList.append(node("2026-09-21"), node("2026-09-22"));
  elements.weekDaysSubarea.append(elements.employeeTimesheetExportPanel);
  const context = vm.createContext({ elements, currentWeekSubarea: "overview", selectedWeekDate: "2026-09-21", document: { createElement: () => node() }, shortDate: date => date });
  vm.runInContext(functions, context);
  return { elements, context };
}

test("Tagesauswahl zeigt nur den gewählten Tag; Arbeitstage stellt alle Buchungen wieder her", () => {
  const { elements, context } = setup();
  const cards = [...elements.weekTimesheetList.children];
  context.showWeekSubarea("overview");
  assert.deepEqual(cards.map(card => card.hidden), [false, true]);
  assert.equal(elements.weekStrip.children[0].attributes["aria-pressed"], "true");
  context.selectedWeekDate = "2026-09-22";
  context.updateSelectedWeekDay();
  assert.deepEqual(cards.map(card => card.hidden), [true, false]);
  context.showWeekSubarea("days");
  assert.deepEqual(cards.map(card => card.hidden), [false, false]);
  assert.equal(elements.weekDaysSection.parent, elements.weekDaysSubarea);
  assert.deepEqual(elements.weekTimesheetList.children, cards);
});

test("Arbeitskonto wechselt ohne Kopie zwischen Überblick und Kontoreiter", () => {
  const { elements, context } = setup();
  const account = elements.timeAccountPanel;
  context.showWeekSubarea("overview");
  assert.equal(account.parent, elements.weekOverviewSubarea);
  context.showWeekSubarea("account");
  assert.equal(account.parent, elements.weekAccountSubarea);
  context.showWeekSubarea("overview");
  assert.equal(account.parent, elements.weekOverviewSubarea);
  assert.equal(elements.weekAccountSubarea.children.length, 0);
});

test("Ein künftiger leerer Tag zeigt einen Hinweis und erhält bestehende Buchungen", () => {
  const { elements, context } = setup();
  context.selectedWeekDate = "2026-09-27";
  context.updateSelectedWeekDay();
  assert.equal(elements.weekTimesheetList.children.length, 3);
  assert.match(elements.weekTimesheetList.children[2].textContent, /2026-09-27.*keine Buchungen/);
  context.updateSelectedWeekDay();
  assert.equal(elements.weekTimesheetList.children.length, 3);
  context.showWeekSubarea("days");
  assert.equal(elements.weekTimesheetList.children.length, 2);
  assert.ok(elements.weekTimesheetList.children.every(card => !card.hidden));
});
