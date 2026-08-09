import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const frontendDirectory = resolve(testDirectory, "..");
const repositoryDirectory = resolve(frontendDirectory, "..");

const readFrontendFile = (path) => readFile(resolve(frontendDirectory, path), "utf8");

const [html, styles, designSystem, app, worker, refreshHtml, refreshScript, manifestSource, mark, companyLogo, uiSpecification, siteTemplate, vdeHtml, vdeStyles, vdeApp, platformHtml, platformStyles, platformApp, workTimeCore] = await Promise.all([
  readFrontendFile("index.html"),
  readFrontendFile("styles.css"),
  readFrontendFile("design-system.css"),
  readFrontendFile("app.js"),
  readFrontendFile("sw.js"),
  readFrontendFile("refresh.html"),
  readFrontendFile("refresh.js"),
  readFrontendFile("manifest.webmanifest"),
  readFrontendFile("assets/mark.svg"),
  readFile(resolve(frontendDirectory, "assets/company-logos/schaaf-elektro.webp")),
  readFile(resolve(repositoryDirectory, "docs/PHASE1_UI_SPEC.md"), "utf8"),
  readFile(resolve(frontendDirectory, "assets/baustellen-import-vorlage.xlsx")),
  readFrontendFile("vde/index.html"),
  readFrontendFile("vde/styles.css"),
  readFrontendFile("vde/app.js"),
  readFrontendFile("platform-admin.html"),
  readFrontendFile("platform-admin.css"),
  readFrontendFile("platform-admin.js"),
  readFrontendFile("core/work-time.js")
]);

const manifest = JSON.parse(manifestSource);
const [deviceManagement, qrScannerVendor, qrScannerWorker] = await Promise.all([
  readFrontendFile("core/device-management.js"),
  readFrontendFile("vendor/qr-scanner.min.js"),
  readFrontendFile("vendor/qr-scanner-worker.min.js")
]);

assert.match(html, /lang="de"/);
assert.match(html, /id="login-view"/);
assert.match(html, /id="dashboard-view"/);
assert.match(html, /id="open-preview"/);
assert.match(html, /id="timesheet-section"/);
assert.match(html, /id="week-timesheet-list"/);
assert.match(html, /id="week-total-work"/);
assert.match(html, /id="week-total-overtime"/);
assert.match(html, /id="week-previous"/);
assert.match(html, /id="week-current"/);
assert.match(html, /id="week-next"/);
assert.match(html, /id="week-overview-table-body"/);
assert.match(app, /elements\.weekOverviewTableBody\.append\(tableRow\)/);
// Die Woche ist keine lange Sammelseite mehr. Jeder Reiter schaltet genau
// einen Container, waehrend die vorhandenen Fachkarten nur umsortiert werden.
for (const bereich of ["overview", "days", "account", "requests"]) {
  assert.match(html, new RegExp(`data-week-view-button="${bereich}"`));
  assert.match(html, new RegExp(`data-week-subarea="${bereich}"`));
}
assert.match(app, /function showWeekSubarea\(requested\)/);
assert.match(app, /elements\.weekOverviewSubarea\.append\([\s\S]{0,120}elements\.weekNextAssignment/);
assert.match(app, /elements\.weekRequestsSubarea\.append\([\s\S]{0,180}elements\.absenceReviewPanel/);
assert.match(html, /id="nav-time"/);
assert.match(html, /id="time-page-heading"[^>]*data-dashboard-pane="time"/);
assert.match(html, /id="employee-search-field"/);
assert.match(html, /id="employee-role-filter"/);
assert.match(html, /id="inspection-site-filter"/);
assert.match(html, /id="inspection-status-filter"/);
assert.match(html, /id="nav-analytics"/);
assert.match(html, /id="hours-overview-body"/);
assert.match(html, /id="hours-overview-year"/);
assert.match(html, /id="hours-overview-employee"/);
assert.match(app, /function renderHoursOverview\(\)/);
assert.match(app, /elements\.analyticsExportContent\.append\(elements\.timesheetExportPanel\)/);
assert.match(app, /function showAnalyticsSubarea\(requested\)/);
assert.match(html, /data-analytics-view="hours"/);
assert.match(html, /data-analytics-view="export"/);
assert.match(app, /elements\.settingsTabs\.hidden = accountOnly/);
assert.match(app, /elements\.navAnalytics\.hidden = !planner \|\| isProjectScopedSession\(\);/);
assert.match(app, /elements\.analyticsShell\.hidden = pane !== "analytics" \|\| isProjectScopedSession\(\);/);
assert.match(html, /id="planning-week-tab"/);
assert.match(html, /id="planning-month-tab"/);
assert.match(html, /class="page-tabs report-editor-tabs"/);
assert.match(html, /href="#site-report-personnel-list">Mitarbeiter/);
assert.match(html, /id="site-report-finalize-submit"[^>]*>Bericht abschließen</);
assert.match(designSystem, /--ui-brand: #e30613/);
assert.match(designSystem, /--ui-sidebar: #17191d/);
assert.match(designSystem, /--ui-sidebar-width: 216px/);
assert.match(designSystem, /--ui-header-height: 58px/);
assert.match(designSystem, /\.week-overview-table/);
assert.match(designSystem, /\.platform-sidebar/);
// Der Wochenwechsel nutzt dieselbe Schaltflaeche wie die Plantafel. Vorher war
// er als kleiner Textknopf ausgefuehrt und mit dem Finger schwer zu treffen.
assert.match(html, /id="week-previous" class="week-button"/);
assert.match(html, /id="week-next" class="week-button"/);
assert.match(html, /id="week-current" class="week-navigation__today"/);
// Die Plantafel heisst auf jedem Geraet gleich. "Desktop-Plantafel" stand auch
// dann ueber der Ansicht, wenn sie auf dem Handy geoeffnet wurde.
assert.doesNotMatch(html, /Desktop-Plantafel/);
// Ueber die Bereiche der App entscheidet allein die Plattformverwaltung. Die
// Firma hatte einen eigenen Schalter: sie konnte sich damit einen Bereich
// abschalten, den sie ohne fremde Hilfe nicht zurueckholen konnte, und der
// verkaufte Umfang lag in der Hand des Kunden.
assert.doesNotMatch(html, /electrical-module/);
assert.doesNotMatch(html, /Bereiche der App/);
assert.doesNotMatch(html, /Elektro-Spezialmodule/);
assert.doesNotMatch(app, /admin\/modules/);
assert.doesNotMatch(app, /canAdministerModules/);
assert.match(html, /id="absence-area"/);

// Berichtsheft: ohne vollstaendigen Ausbildungsnachweis laesst die Kammer den
// Auszubildenden nicht zur Pruefung zu. Der Wochenbericht haengt an derselben
// Woche wie der Stundenzettel; die geleistete Zeit wird nicht abgeschrieben,
// sondern aus der Zeiterfassung uebernommen.
assert.match(html, /id="apprentice-panel"/);
// Geschrieben wird taeglich, ausgedruckt woechentlich: eine Zeile je Tag,
// dazu die Bemerkungen zur Woche.
assert.match(html, /id="apprentice-days"/);
assert.match(html, /id="apprentice-week-remark"/);
assert.match(app, /function renderApprenticeDays\(/);
assert.match(app, /function collectApprenticeDays\(/);
// Der Wochentext ist fort; er sagte nicht, an welchem Tag was war.
assert.doesNotMatch(html, /apprentice-company-summary/);
assert.doesNotMatch(html, /apprentice-school-summary/);
// Urlaub, Krankheit und Arbeitszeit werden nicht getippt: sie stehen bereits
// in den genehmigten Abwesenheiten und in der Zeiterfassung. Abgeschrieben
// stuende im Berichtsheft irgendwann etwas anderes als im Urlaubskonto.
assert.doesNotMatch(html, /<input id="apprentice-absence-note"/);
assert.doesNotMatch(html, /<textarea id="apprentice-absence-note"/);
// Der Nachweis muss auf Papier: die Kammer will ein Blatt je Woche.
assert.match(html, /id="apprentice-print"/);
assert.match(app, /function printApprenticeReport\(/);
assert.match(app, /apprentice\/reports\/\$\{weekStart\}\/pdf/);
// Auszubildender ist eine Rolle wie Monteur oder Vorarbeiter.
assert.match(html, /<option value="apprentice">Auszubildender<\/option>/);
assert.match(app, /sessionRoles\(session\)\.includes\("apprentice"\)/);
assert.doesNotMatch(app, /employeeEditApprentice\b/);
assert.match(html, /id="apprentice-review-panel"/);
assert.match(html, /id="apprentice-approve-all"/);
assert.match(app, /function isApprentice\(\)/);
// Sehen und unterschreiben darf ausschliesslich der eingetragene Ausbilder.
// Ein Berichtsheft ist persoenlich: es geht weder das Buero noch die
// Geschaeftsfuehrung etwas an, solange sie nicht selbst ausbilden.
assert.match(app, /return apprenticeModuleReady\(\) && Boolean\(session\?\.user\.isTrainer\);/);
assert.doesNotMatch(app, /canPlan\(\) \|\| Boolean\(session\?\.user\.isTrainer\)/);
assert.match(app, /moduleEnabled\("apprentice_reports"\)/);
assert.match(styles, /\.apprentice-review-list/);

// Ausbildungsberuf und Ausbildungszeitraum stehen im Kopf jedes gedruckten
// Wochenblatts. Die Spalten lagen seit Migration 056 und 060 in der Datenbank,
// und es gab keinen einzigen Weg, sie zu fuellen: im Nachweis stand ein Strich,
// wo die Kammer den Ausbildungsberuf erwartet. Sie gehoeren in den
// Personalbogen, neben den Ausbilder.
assert.match(html, /id="employee-edit-occupation"/);
assert.match(html, /id="employee-edit-apprenticeship-start"/);
assert.match(html, /id="employee-edit-apprenticeship-end"/);
assert.match(html, /id="apprenticeship-occupations"/);
assert.match(app, /apprenticeshipOccupation: elements\.employeeEditOccupation\.value/);
assert.match(app, /apprenticeshipStartedOn: elements\.employeeEditApprenticeshipStart\.value/);
assert.match(app, /elements\.employeeEditOccupation\.value = employee\.apprenticeshipOccupation \|\| ""/);
// Das Lehrjahr wird gerechnet, nicht gepflegt - von Hand gepflegt waere es
// spaetestens im zweiten Jahr falsch. Ein Feld dafuer darf es deshalb nicht
// geben; im Personalbogen steht nur, was sich daraus ergibt.
assert.match(app, /function renderEmployeeTrainingYear\(\)/);
assert.doesNotMatch(html, /id="employee-edit-training-year"\s+type=|<input id="employee-edit-training-year"/);

// Das Berichtsheft lag allein im Wochenbereich - dort sucht am Feierabend
// niemand danach. Es kommt jetzt von selbst, wenn der Tag zu Ende geht. Auf
// der Startseite steht nur ein kompakter Hinweis, solange wirklich eine
// Handlung offen ist; freigegebene Wochen verdraengen den Arbeitstag nicht.
assert.match(html, /id="apprentice-today-dialog"/);
assert.match(html, /id="apprentice-today-section"/);
assert.match(html, /id="apprentice-today-section"[\s\S]{0,160}data-dashboard-pane="start"/);
assert.match(app, /function endWorkday\(\)/);
assert.match(app, /elements\.secondaryAction\.addEventListener\("click", \(\) => endWorkday\(\)\)/);
assert.match(app, /openApprenticeToday\(\{ feierabend: true \}\)/);
// Die Zeitbuchung wartet auf nichts: ein spaeter gestempelter Feierabend waere
// eine falsche Arbeitszeit.
assert.match(app, /function endWorkday\(\) \{\n\s+addEntry\("clock_out"\);/);
// Der Tageseintrag haengt an der laufenden Woche, nicht an der angezeigten.
assert.match(app, /apprentice\/reports\/\$\{currentWeekStart\(\)\}/);
assert.match(app, /apprenticeTodayPrompt\(\{/);
assert.match(app, /elements\.apprenticeTodaySection\.hidden = !prompt\.visible/);
assert.match(styles, /\.apprentice-today-section__action/);
assert.doesNotMatch(html, /id="apprentice-week-open"/);

// Eine Sperre, die sich nicht erklaert, ist ein Fehler: nach dem Einreichen
// waren die Felder stumm, die Schaltflaechen fort, und das Berichtsheft sah
// schlicht kaputt aus.
// Das Berichtsheft ist ein eigener Bereich, kein Anhaengsel der Wochenansicht.
// Fuer den Auszubildenden ist es die Arbeit, die er taeglich neben der
// Zeiterfassung hat, fuer den Ausbilder die, die er woechentlich abzeichnet.
assert.match(html, /id="nav-apprentice"/);
assert.match(html, /id="nav-apprentice"[\s\S]{0,140}data-kurz="Azubi"/);
assert.match(html, /id="apprentice-section"[\s\S]{0,200}data-dashboard-pane="apprentice"/);
// Beide Karten liegen jetzt in diesem Bereich, nicht mehr in der Woche.
// Geprueft wird die Reihenfolge, nicht der Abstand in Zeichen: eine Grenze
// wie "innerhalb von 6000 Zeichen" reisst beim naechsten Absatz, ohne dass
// etwas kaputt ist.
const reihenfolge = (...kennungen) => kennungen
  .map((kennung) => html.indexOf(`id="${kennung}"`));
const [bereich, eigenes, pruefliste, wocheAnfang] =
  reihenfolge("apprentice-section", "apprentice-panel", "apprentice-review-panel", "week-section");
assert.ok(bereich > 0 && eigenes > bereich, "Das eigene Heft liegt nicht im Berichtsheft-Bereich");
assert.ok(pruefliste > bereich, "Die Prüfliste liegt nicht im Berichtsheft-Bereich");
assert.ok(bereich > wocheAnfang, "Der Berichtsheft-Bereich liegt noch in der Wochenansicht");
assert.match(app, /navApprentice\.hidden = !\(isApprentice\(\) \|\| mayReviewApprentices\(\)\)/);
// Der Azubi hat das Heft mobil unten. Der uebliche Ausbilder ist der
// Vorarbeiter: er plant nicht, sieht den Verwaltungsbereich mit „Mehr“ also gar
// nicht - ohne eigenen Eintrag war seine Pruefliste am Telefon durch nichts zu
// erreichen. Planende Ausbilder behalten den Weg ueber „Mehr“.
assert.match(
  app,
  /classList\.toggle\(\s*"nav-item--apprentice-mobile",\s*isApprentice\(\) \|\| \(mayReviewApprentices\(\) && !canPlan\(\)\)/
);
assert.match(styles, /\.nav-item--desktop\.nav-item--apprentice-mobile/);
// Die Ausnahme muss auch gegen die spaetere !important-Regel des Designsystems
// stehen, sonst fehlt der Eintrag mobil vollstaendig.
assert.match(
  designSystem,
  /\.nav-item--desktop\.nav-item--apprentice-mobile \{\s*display: grid !important;/
);
// Alles, was der Browser selbst holt - Vorschau im Rahmen, neuer Reiter,
// Dokumente, Baustellenfotos, VDE-Protokoll -, gibt keine Kopfzeile mit. Ohne
// die Fassung im Adressteil kam dort waehrend eines Pflichtupdates dessen
// Meldung als JSON an: 203 Byte, abgelegt als "SE-R-….pdf.json".
assert.match(app, /function browserFileUrl\(path\) \{\s*return `\$\{path\}\$\{path\.includes\("\?"\) \? "&" : "\?"\}appVersion=0\.44\.11`;/);
for (const stelle of [
  /apprentice\/reports\/\$\{selectedWeekStart\}\/pdf\?preview=true/,
  /admin\/documents\/\$\{encodeURIComponent\(documentItem\.id\)\}\/content/,
  /vde\/inspections\/\$\{encodeURIComponent\(inspectionId\)\}\/pdf/
]) {
  const treffer = stelle.exec(app);
  assert.ok(treffer, `Die Adresse ${stelle} steht nicht mehr in app.js`);
  // Die Adresse steht unmittelbar in einem browserFileUrl(...) - dazwischen
  // liegen hoechstens Zeilenumbruch, Einrueckung, der oeffnende Akzent und der
  // gemeinsame Anfang der Schnittstelle.
  const davor = app.slice(Math.max(0, treffer.index - 60), treffer.index);
  assert.match(davor, /browserFileUrl\(\s*`?\.\/api\/v1\/$/,
    `Die Adresse ${stelle} laeuft nicht ueber browserFileUrl`);
}
// Der Verweis darf die Ansicht nicht mehr ersetzen: in einer eingerichteten
// App gibt es dort kein Zurueck, sie musste beendet werden.
assert.match(app, /function openDocumentFile\(/);
assert.match(app, /link\.addEventListener\("click", \(event\) => \{\s*event\.preventDefault\(\);\s*void openDocumentFile\(/);
assert.doesNotMatch(app, /link\.target = "_blank";\s*link\.rel = "noopener";\s*link\.textContent = "Öffnen";/);
// Offline gesicherte Dokumente behalten ihren Schluessel ohne die Fassung.
assert.match(app, /function employeeSiteContentKey\(/);
assert.match(worker, /cacheUrl\.searchParams\.delete\("appVersion"\)/);
assert.match(vdeApp, /appVersion=0\.44\.11/);
assert.match(app, /element === elements\.apprenticeSection[\s\S]{0,160}mayReviewApprentices\(\)/);
// Seine bisherigen Berichte fuehren in ihre Woche zurueck und lassen sich von
// dort drucken. Vorher war die Liste eine tote Aufzaehlung.
assert.match(app, /function renderApprenticeHistory\(/);
assert.match(styles, /\.apprentice-history__open/);
// Die Navigationsleiste richtet sich nach den sichtbaren Schaltflaechen: fest
// verdrahtete Spaltenzahlen waeren mit jedem neuen Bereich falsch.
assert.match(styles, /grid-auto-columns: 1fr/);
assert.match(styles, /\.bottom-nav--compact/);
assert.doesNotMatch(styles, /grid-template-columns: repeat\(3, 1fr\);\n  padding: 8px max\(18px/);

assert.match(html, /id="apprentice-lock"/);
assert.match(app, /function renderApprenticeLock\(/);
// Solange der Ausbilder nicht unterschrieben hat, gehoert der Bericht dem
// Auszubildenden. Ohne diesen Weg war eine zu frueh eingereichte Woche eine
// Sackgasse: schreiben ging nicht mehr, und er musste warten, bis jemand
// anders sie zurueckgibt.
assert.match(html, /id="apprentice-withdraw"/);
assert.match(app, /function withdrawApprenticeReport\(/);
assert.match(app, /apprenticeWithdraw\.hidden = status !== "submitted"/);
assert.match(app, /reports\/\$\{selectedWeekStart\}\/withdraw/);
// Ein Arbeitstag ohne Zeile faellt beim Schreiben auf, nicht erst an der
// Fehlermeldung nach dem Einreichen.
assert.match(html, /id="apprentice-open"/);
assert.match(app, /function renderApprenticeOpenDays\(/);
assert.match(styles, /\.apprentice-day--offen/);
// Gedruckt wird nur, was unterschrieben ist: ein Entwurf sieht auf Papier
// fertig aus und ist es nicht.
assert.match(app, /const APPRENTICE_PRINTABLE = \["submitted", "approved"\]/);
assert.match(app, /apprenticePrint\.hidden = !APPRENTICE_PRINTABLE\.includes\(status\)/);
assert.doesNotMatch(app, /apprenticePrint\.hidden = !bericht/);

// Der Berichtsheft-Bildschirm nach der Vorlage: Kopfdaten wie im gedruckten
// Blatt, Tagestabelle mit denselben vier Spalten, Zeichenzaehler, die Regeln
// dort, wo geschrieben wird - und die Vorschau daneben.
assert.match(html, /id="apprentice-fact-name"/);
assert.match(html, /id="apprentice-fact-occupation"/);
assert.match(html, /id="apprentice-progress"/);
assert.match(html, /id="apprentice-remark-count"/);
assert.match(html, /class="apprentice-note/);
assert.match(app, /function renderApprenticeFacts\(/);
assert.match(app, /function renderApprenticePreview\(/);
assert.match(styles, /\.apprentice-day__weekday/);
assert.match(styles, /grid-template-areas: "tag datum text zeit"/);
// Die Vorschau steht nur am Rechner; am Handy fuehrt die Schaltflaeche in ein
// eigenes Fenster.
assert.match(html, /id="apprentice-preview-frame"/);
assert.match(app, /pdf\?preview=true/);
assert.match(styles, /#apprentice-preview-panel \{\n\s+display: none;/);

// Fehlende Wochen: am Ende der Ausbildung ist eine Luecke teuer, und bis dahin
// faellt sie niemandem auf. Der Azubi sieht sie mit einem Weg direkt in die
// Woche, der Ausbilder ueber alle seine Auszubildenden.
assert.match(html, /id="apprentice-missing"/);
assert.match(html, /id="apprentice-people"/);
assert.match(app, /function renderApprenticeMissing\(/);
assert.match(app, /function renderApprenticePeople\(/);
// Der Ausbilder kommt von hier aus an das gedruckte Heft eines ganzen Jahres.
// Die Schnittstelle dafuer gab es bereits, nur keinen Weg dorthin.
assert.match(app, /printApprenticeYear\(jahr, userId\)/);
assert.match(app, /apprenticeUserId \? `&apprenticeUserId=\$\{apprenticeUserId\}`/);
// Der Wochenwechsler gehoert zum eigenen Heft; ein Ausbilder hat keines.
assert.match(app, /apprenticeWeekControls\.hidden = !isApprentice\(\)/);
assert.match(app, /body\.missingWeeks \|\| \[\]/);
assert.match(app, /body\.gaps \|\| \[\]/);
assert.match(styles, /\.apprentice-missing__week/);
// Der Ausdruck ueber ein ganzes Jahr in einer Datei.
assert.match(html, /id="apprentice-print-book"/);
assert.match(app, /function printApprenticeYear\(/);
assert.match(app, /apprentice\/reports\/pdf\?from=\$\{jahr\}-01-01&to=\$\{jahr\}-12-31/);

// Karten, die nur die Planung sehen darf, liegen in der Wochenansicht - also
// in einem Bereich, den jeder sieht. Ihre Sichtbarkeit wurde ausschliesslich
// in renderAdmin() gesetzt, und renderAdmin() laeuft fuer einen Monteur nie:
// meldete sich auf einem Geraet nach dem Buero ein Monteur an, blieben
// Stundenzettel-Export, Stundenzettel pruefen, offene Korrekturen und
// Abwesenheiten pruefen stehen - mit den Namen und Zeiten der vorherigen
// Sitzung. Deshalb wird die Sichtbarkeit bei jedem Zeichnen erzwungen und der
// Inhalt beim Abmelden geleert.
assert.match(app, /function applyPlannerOnlyVisibility\(\)/);
assert.match(app, /function clearPlannerData\(\)/);
const renderRumpf = app.slice(app.indexOf("function render() {"), app.indexOf("function renderPlatformAnnouncements"));
assert.match(renderRumpf, /applyPlannerOnlyVisibility\(\);/);
const anmeldeRumpf = app.slice(app.indexOf("function showLogin() {"), app.indexOf("function showSetup("));
assert.match(anmeldeRumpf, /clearPlannerData\(\);/);

// Urlaub beantragen ist fuer einen Monteur eine der wenigen Handlungen der
// App. Sie steckte hinter einem zugeklappten Aufklapper weit unten, hinter
// Arbeitskonto, Wochentagen und Feiertagskarte.
assert.match(html, /<details id="absence-area" class="week-advanced-panel" open>/);
assert.ok(
  html.indexOf('id="absence-area"') < html.indexOf('id="week-days-section"'),
  "Die Abwesenheit steht vor den erfassten Arbeitstagen"
);

// Die Bueroverwaltung gehoert unter "Mehr". Sie lag im gemeinsamen
// Verwaltungsbereich ohne eigene Zuordnung und stand deshalb in allen drei
// Verwaltungsansichten: Einsaetze, Baustellen und Mehr zeigten dieselben drei
// Karten - Jahreskonten, Feiertagskalender und die Regel fuer Zeitkorrekturen.
assert.match(app, /function isOfficeAdminPane\(\)/);
assert.match(app, /const visible = canPlan\(\) && !isProjectScopedSession\(\) && isOfficeAdminPane\(\);/);
assert.match(app, /elements\.timeCorrectionPolicyAdmin\.hidden = !canPlan\(\)[\s\S]{0,120}currentSettingsSubarea !== "time-rules";/);

// Alle Zellen einer Zeile der Plantafel liegen in derselben Rasterzeile: die
// hoechste bestimmt die Hoehe aller. Ein Mitarbeiter mit vier Einsaetzen an
// einem Tag machte seine Zeile ueber 500 Pixel hoch, und in den uebrigen
// Tagesspalten stand ebenso viel Leere - auf dem Handy sieht man ohnehin nur
// eine Spalte auf einmal.
assert.match(app, /const PLANNING_CARDS_PER_CELL = \d+;/);
assert.match(app, /assignments\.slice\(0, PLANNING_CARDS_PER_CELL\)/);
assert.match(app, /weitere`;/);
assert.match(app, /"Weniger zeigen"/);
// Gezaehlt wird, was es gibt, nicht was gerade zu sehen ist. Sonst meldete die
// Zusammenfassung weniger Einsaetze, als eingeplant sind.
assert.match(app, /visibleAssignments \+= assignments\.length;/);
assert.match(styles, /\.planning-board-more/);

// Eine Schaltflaeche, die nichts ausloest, ist keine: bei abgeschlossenem
// Arbeitstag stand auf ihr derselbe Satz wie in der Ueberschrift darueber.
assert.match(app, /elements\.primaryAction\.hidden = disabled;/);

// Ueber den erfassten Arbeitstagen stand fest "Diese Woche", auch wenn eine
// frueher liegende Woche geblaettert war.
assert.match(app, /elements\.weekDaysTitle\.textContent = weekStart === currentWeekStart\(today\)/);

// Ohne gueltiges Datum darf nirgends "Invalid Date" stehen. In der
// Wochenansicht stand es ueber dem naechsten Einsatz: die Schnittstelle
// liefert die Einsaetze je Tag und traegt kein workDate in den Einsatz ein.
assert.match(app, /if \(Number\.isNaN\(wert\.valueOf\(\)\)\) return "";/);
assert.doesNotMatch(app, /assignment\.workDate >= localDateKey\(\)/);

// Unter "Mehr" stand fuer einen Monteur nur ein Hinweistext. Personalnummer,
// Firma und der Weg hinaus waren nirgends zu finden.
assert.match(html, /id="account-card"/);
assert.match(html, /id="account-personnel-number"/);
assert.match(html, /id="account-logout"/);
assert.match(app, /function renderAccountCard\(\)/);
assert.match(app, /function moduleEnabled\(key\)/);
assert.match(app, /function applyModuleVisibility\(\)/);
// Die Bereiche tragen die Schluessel des Plattformkatalogs, nicht eigene.
for (const bereich of ["absences", "assembly_reports", "site_daily_reports", "documents", "materials", "site_qr"]) {
  assert.ok(app.includes(`"${bereich}"`), `Der Bereich ${bereich} fehlt in der Oberflaeche`);
}
for (const erfunden of ["site_reports", "site_documents"]) {
  assert.ok(!app.includes(`"${erfunden}"`), `${erfunden} steht nicht im Modulkatalog`);
}
// Der Kern ist kein abschaltbarer Bereich.
assert.doesNotMatch(app, /moduleEnabled\("time_tracking"\)/);
// Ein direkt uebergebener Handler bekommt das Ereignis als ersten Wert. Nimmt
// die Funktion dort etwas anderes entgegen, arbeitet sie mit dem Ereignis
// weiter. So brach die Baustellenakte ab: openEmployeeSiteWorkspace hielt den
// PointerEvent fuer den angeforderten Einsatz und meldete, es sei keine
// Baustelle freigegeben.
for (const [datei, quelle] of [["app.js", app], ["vde/app.js", vdeApp], ["platform-admin.js", platformApp]]) {
  const handlerBezuege = [...quelle.matchAll(/addEventListener\(\s*"[a-z]+",\s*([A-Za-z_$][\w$]*)\s*\)/g)];
  for (const [, name] of handlerBezuege) {
    const deklaration = new RegExp(`(?:async\\s+)?function ${name}\\(([^),]*)`).exec(quelle);
    if (!deklaration) continue;
    const ersterWert = deklaration[1].trim().split(/\s*=/)[0].trim();
    // Ein Parameter ist in Ordnung, solange er das Ereignis meint. Erwartet die
    // Funktion dort fachliche Daten, arbeitet sie mit dem Klickereignis weiter.
    assert.ok(
      ersterWert === "" || /^(event|e|ereignis)$/.test(ersterWert),
      `${datei}: ${name} wird direkt als Handler uebergeben, erwartet als ersten Wert aber "${ersterWert}"`
    );
  }
}

// Eine direkt angelegte Firma braucht sofort ihre erste Administration.
// Ohne sie kommt niemand hinein: die Ersteinrichtung der App gilt nur fuer die
// im Server hinterlegte erste Firma, und einen zweiten Weg gab es nicht.
for (const feld of [
  "adminPersonnelNumber", "adminFirstName", "adminLastName", "adminTemporaryPassword"
]) {
  assert.ok(
    platformApp.includes(`"${feld}"`),
    `Der Anlegedialog fuer Firmen fragt ${feld} nicht ab`
  );
}
assert.match(platformApp, /companies\/\$\{encodeURIComponent\(firma\.id\)\}\/administrator/);
// Nach dem Anlegen braucht der neue Kunde seine Firmennummer: ohne sie kommt er
// nicht an die Anmeldung. Der Dialog schloss sich vorher wortlos.
assert.match(platformApp, /function showCompanyHandover\(administrator\)/);
assert.match(platformApp, /result\?\.administrator\?\.companyNumber/);

// Jedes Formular braucht einen Absende-Empfaenger. Ohne ihn laedt der Browser
// die Seite neu und die Eingabe ist fort, ohne dass jemand etwas bemerkt.
const formularKennungen = [...html.matchAll(/<form[^>]*id="([a-z0-9-]+)"/g)].map((treffer) => treffer[1]);
assert.ok(formularKennungen.length > 20, "Die Formulare der App werden gefunden");
for (const kennung of formularKennungen) {
  const name = kennung.replace(/-([a-z0-9])/g, (_, zeichen) => zeichen.toUpperCase());
  const ueberElement = new RegExp(`\\b${name}\\.addEventListener\\(\\s*["']submit["']`);
  const ueberAuswahl = new RegExp(`#${kennung}["']\\)\\s*\\.addEventListener\\(\\s*["']submit["']`);
  assert.ok(
    ueberElement.test(app) || ueberAuswahl.test(app),
    `Das Formular ${kennung} hat keinen Absende-Empfaenger`
  );
}
assert.match(html, /id="time-account-panel"/);
assert.match(html, /id="time-account-balance"/);
assert.match(html, /id="time-account-months"/);
assert.match(html, /id="time-account-admin-panel"/);
assert.match(html, /id="time-account-admin-list"/);
assert.match(html, /id="time-account-profile-form"/);
assert.match(html, /id="time-account-adjustment-submit"/);
assert.match(html, /id="time-account-holiday-list"/);
// Die Bueroverwaltung liegt vollstaendig im Verwaltungsbereich und nicht mehr
// hinter einem Aufklapper in der Wochenansicht.
assert.match(html, /id="admin-year"/);
assert.doesNotMatch(html, /week-advanced-panel--admin/);
const weekSection = html.slice(
  html.indexOf('id="week-section"'),
  html.indexOf('id="admin-section"')
);
for (const buried of ["time-account-admin-panel", "holiday-calendar-admin", "time-correction-policy-admin"]) {
  assert.ok(
    !weekSection.includes(`id="${buried}"`),
    `${buried} gehoert in die Verwaltung, nicht in die Wochenansicht`
  );
}
// Die drei Verwaltungsbereiche stehen gleichrangig nebeneinander. Frueher steckte
// der Feiertagskalender in der Karte der Jahreskonten und war dort schwer zu finden.
const kontenPanel = html.slice(
  html.indexOf('id="time-account-admin-panel"'),
  html.indexOf('id="holiday-calendar-admin"')
);
assert.ok(
  kontenPanel.includes("</section>"),
  "Der Feiertagskalender steht neben den Jahreskonten und nicht in ihnen"
);
// Das frueher genutzte Jahres-Element gibt es nicht mehr. Solange app.js noch
// darauf schreibt, bricht die Darstellung der Verwaltung ab.
assert.doesNotMatch(html, /id="time-account-admin-year"/);
assert.doesNotMatch(app, /timeAccountAdminYear/);
// Als eigener Bereich braucht der Feiertagskalender eine eigene Sichtbarkeit.
assert.match(app, /elements\.holidayCalendarAdmin\.hidden = !visible/);
assert.match(app, /let adminYear = new Date\(\)\.getFullYear\(\)/);
assert.doesNotMatch(
  app,
  /function renderAdminTimeAccounts\(\)[\s\S]{0,400}selectedWeekStart/,
  "Die Jahreskonten folgen nicht mehr der gewaehlten Woche"
);
assert.match(styles, /\.admin-year-select/);
assert.match(html, /id="time-correction-policy-admin"/);
assert.match(html, /id="time-correction-policy-form"/);
assert.match(html, /id="time-correction-policy-reason"/);
// Die Regel gehört in die Verwaltung, nicht in die Wochenansicht: sie steht
// innerhalb des Verwaltungsbereichs und nicht im Wochenabschnitt.
const adminSection = html.slice(html.indexOf('id="admin-section"'));
assert.ok(
  adminSection.includes('id="time-correction-policy-admin"'),
  "Die Korrekturregel muss im Verwaltungsbereich stehen"
);
assert.equal(
  [...html.matchAll(/name="time-correction-policy"/g)].length,
  3,
  "Genau die drei vorgesehenen Regeln stehen zur Auswahl"
);
for (const value of ["review_required", "same_day", "immediate"]) {
  assert.ok(html.includes(`value="${value}"`), `Die Regel ${value} fehlt in der Auswahl`);
}
assert.match(app, /\.\/api\/v1\/admin\/time-correction-policy/);
assert.match(styles, /\.time-correction-policy-option/);
assert.match(styles, /\.visually-hidden/);
assert.match(html, /id="holiday-calendar-form"/);
assert.match(html, /id="holiday-calendar-state"/);
assert.match(html, /id="holiday-calendar-list"/);
assert.match(html, /id="holiday-closure-form"/);
assert.match(html, /id="holiday-closure-list"/);
assert.match(html, /id="employee-timesheet-export-panel"/);
assert.match(html, /id="employee-timesheet-export-form"/);
assert.match(html, /id="time-correction-dialog"/);
assert.match(html, /id="time-correction-form"/);
assert.match(html, /id="time-correction-review-panel"/);
assert.match(html, /id="time-correction-review-list"/);
assert.match(html, /id="absence-panel"/);
assert.match(html, /id="absence-form"/);
assert.match(html, /id="absence-type"/);
assert.match(html, /id="absence-day-part"/);
assert.match(html, /id="absence-list"/);
assert.match(html, /id="absence-review-panel"/);
assert.match(html, /id="absence-review-list"/);
assert.match(html, /id="work-day-review-panel"/);
assert.match(html, /id="work-day-review-list"/);
assert.match(html, /id="secondary-action"/);
assert.match(html, /id="reset-demo"/);
assert.match(html, /id="setup-form"/);
assert.match(html, /id="password-change-form"/);
assert.match(html, /id="admin-section"/);
assert.match(html, /id="assignment-planning-shell"/);
assert.match(html, /id="assignment-planning-content"/);
assert.match(html, /id="site-planning-shell"/);
assert.match(html, /id="site-planning-content"/);
assert.match(html, /id="nav-assignments"/);
assert.match(html, /id="nav-sites"/);
assert.match(html, /id="employee-form"/);
assert.match(html, /id="employee-edit-form"/);
assert.match(html, /id="employee-edit-role"/);
assert.match(html, /id="employee-phone"/);
assert.match(html, /id="employee-email"/);
assert.match(html, /id="employee-edit-phone"/);
assert.match(html, /id="employee-edit-email"/);
assert.match(html, /id="customer-form"/);
assert.match(html, /id="customer-management-panel"/);
assert.match(html, /id="customer-edit-form"/);
assert.match(html, /id="project-form"/);
assert.match(html, /id="project-management-panel"/);
assert.match(html, /id="project-edit-form"/);
assert.match(html, /id="site-form"/);
assert.match(html, /id="site-dashboard-edit"/);
assert.match(html, /id="site-dashboard-status"/);
assert.match(html, /id="site-edit-form"/);
assert.match(html, /id="site-edit-status"/);
assert.equal(
  [...html.matchAll(/data-employee-site-section-button=/g)].length,
  8,
  "Die Monteur-Baustellenakte bietet acht getrennte Bereiche"
);
assert.equal(
  [...html.matchAll(/data-site-dashboard-section-button=/g)].length,
  9,
  "Das Büro-Dashboard bietet neun getrennte Baustellenbereiche"
);
assert.match(html, /data-employee-site-section="reports"[^>]*hidden/);
assert.match(html, /data-site-dashboard-section="documents"[^>]*hidden/);
assert.match(app, /function showEmployeeSiteSection/);
assert.match(app, /function showSiteDashboardSection/);
assert.match(app, /showSiteDashboardSection\("reports"\)/);
assert.match(app, /showSiteDashboardSection\("tasks"\)/);
assert.match(styles, /\.workspace-section-nav/);
assert.match(styles, /\.workspace-section-tab--active/);
assert.match(styles, /\.workspace-section-search/);
assert.match(styles, /\.report-center/);
assert.match(styles, /\.site-qr-image/);
assert.match(styles, /\.document-access-options/);
assert.match(styles, /\.site-report-photos/);
assert.match(styles, /\.site-report-photo-list/);
assert.match(html, /id="document-management-panel"/);
assert.match(html, /id="document-form"/);
assert.match(html, /id="document-file-choose"/);
assert.match(html, /id="document-customer"/);
assert.match(html, /id="document-project"/);
assert.match(html, /id="document-site"/);
assert.match(html, /id="document-list"/);
assert.match(html, /id="site-dashboard-documents"/);
assert.match(html, /id="site-dashboard-capture-delivery-note"/);
assert.match(html, /id="site-dashboard-delivery-note-input"[\s\S]*capture="environment"/);
assert.match(html, /id="site-dashboard-delivery-note-form"/);
assert.match(html, /id="site-dashboard-reports-panel"/);
assert.match(html, /id="site-dashboard-photos-panel"/);
assert.match(html, /id="site-dashboard-report-search"/);
assert.match(html, /id="site-dashboard-document-search"/);
assert.match(html, /id="site-dashboard-photo-search"/);
assert.match(html, /id="site-report-photo-list"/);
assert.match(html, /id="report-center"/);
assert.match(html, /id="report-center-draft-count"/);
assert.match(html, /id="report-center-missing-list"/);
assert.match(html, /id="report-return-dialog"/);
assert.match(html, /id="document-mobile-visible"/);
assert.match(html, /id="document-offline-priority"/);
assert.match(html, /id="site-qr-dialog"/);
assert.match(html, /id="site-qr-image"/);
assert.match(html, /Digital erstellen/);
assert.match(html, /Papierbericht fotografieren/);
assert.match(html, /Bericht diktieren/);
assert.match(html, /id="site-task-form"/);
assert.match(html, /id="site-material-form"/);
assert.doesNotMatch(html, /Dieses Modul ist noch nicht aktiviert/);
assert.match(html, /Einmal speichern · überall verwenden/);
assert.match(html, /id="business-hierarchy"/);
assert.match(html, /id="assignment-form"/);
assert.match(html, /id="assignment-duration"/);
assert.match(html, /id="assignment-edit-duration"/);
assert.match(html, /id="assignment-edit-comment"/);
assert.match(html, /id="admin-week-board"/);
assert.match(html, /id="planning-board-view"/);
assert.match(html, /id="planning-board-team"/);
assert.match(html, /id="planning-board-project-manager"/);
assert.match(html, /id="project-manager"/);
assert.match(html, /id="project-edit-manager"/);
assert.match(html, /id="site-project-field" hidden/);
assert.match(html, /id="site-project-manager"/);
assert.match(html, /id="site-edit-project-manager"/);
assert.match(html, /id="assignment-edit-employee"/);
assert.match(html, /id="assignment-team"/);
assert.match(html, /id="assignment-member-list"/);
assert.match(html, /id="planning-team-form"/);
assert.match(html, /id="planning-team-member-list"/);
assert.match(html, /id="assignment-edit-form"/);
assert.match(html, /id="assignment-import-panel"/);
assert.match(html, /id="assignment-import-file"/);
assert.match(html, /id="assignment-import-choose"/);
assert.match(html, /id="assignment-import-selection"/);
assert.match(html, /id="assignment-import-preview"/);
assert.match(html, /id="assignment-import-confirm"/);
assert.match(html, /id="assignment-import-mappings"/);
assert.match(html, /id="assignment-import-apply-mappings"/);
assert.match(html, /id="site-import-panel"/);
assert.match(html, /id="site-import-file"/);
assert.match(html, /id="site-import-choose"/);
assert.match(html, /id="site-import-selection"/);
assert.match(html, /id="site-import-preview"/);
assert.match(html, /baustellen-import-vorlage\.xlsx/);
assert.match(html, /value="managing_director">Geschäftsführer/);
assert.match(html, /value="dispatch_office">Büro \/ Disposition/);
assert.match(html, /value="project_manager">Projektleiter/);
assert.doesNotMatch(html, /value="planner">Planer/);
assert.doesNotMatch(html, /value="executive_assistant">Assistenz der Geschäftsführung/);
assert.doesNotMatch(html, /value="office"/);
// Die Firmennummer entscheidet, bei welcher Firma die Anmeldung landet. Sie
// war fest auf die Firma der Ersteinrichtung verdrahtet und das Feld dauerhaft
// verborgen: Mitarbeiter jeder weiteren Firma kamen damit gar nicht erst an
// die Anmeldung, obwohl die Schnittstelle sie laengst kannte.
assert.match(html, /id="company-number"/);
assert.doesNotMatch(html, /id="company-number"[\s\S]*?value="F-\d+"/);
assert.match(html, /id="company-number-hint"/);
assert.doesNotMatch(app, /elements\.companyNumberField\.hidden = true;/);
// Nach der ersten Anmeldung steht die Firma fest und das Feld verschwindet.
// Ein Monteur soll seine Firmennummer nicht bei jeder Anmeldung wiedersehen.
assert.match(app, /function applyCompanyFieldVisibility\(\)/);
assert.match(app, /elements\.companyNumberField\.hidden = demoMode \|\| bekannt;/);
// Ohne Weg zurueck kaeme ein einmal falsch eingerichtetes Geraet nie wieder
// zu einer anderen Firma.
assert.match(html, /id="change-company"/);
assert.match(app, /elements\.changeCompany\.addEventListener\("click"/);
// Ohne Nummer geht die Anmeldung gar nicht erst zum Server.
assert.match(app, /Bitte die Firmennummer eingeben\./);
// Die zuletzt benutzte Firma bleibt auf dem Geraet, sonst muesste sie jeder
// Monteur bei jeder Anmeldung heraussuchen.
assert.match(app, /rememberCompany\(session\.company\.number, session\.company\.displayName\)/);
assert.match(html, /assets\/company-logos\/schaaf-elektro\.webp/);
assert.doesNotMatch(html, /class="live-overview"/);
assert.match(html, /id="status-since"/);
assert.match(html, /id="status-work-time"/);
assert.match(html, /id="foreman-badge"/);
assert.doesNotMatch(html, /<details id="assignment-import-panel"/);
assert.doesNotMatch(html, /<details id="site-import-panel"/);
assert.match(html, /<section id="assignment-import-panel" class="inline-import inline-import--assignment">/);
assert.match(html, /<section id="site-import-panel" class="inline-import inline-import--site">/);
assert.match(html, /<button id="assignment-import-choose"/);
assert.match(html, /Wochenplan aus Excel/);
assert.match(html, /<button id="site-import-choose"/);
assert.match(html, /Baustellen aus Excel/);
assert.doesNotMatch(html, /<section id="assignment-import-panel"[^>]*hidden>/);
assert.doesNotMatch(html, /<section id="site-import-panel"[^>]*hidden>/);
assert.doesNotMatch(html, /id="assignment-import-body" class="inline-import__body" hidden/);
assert.doesNotMatch(html, /id="site-import-body" class="inline-import__body" hidden/);
assert.match(html, /styles\.css\?v=0\.44\.11/);
assert.match(html, /design-system\.css\?v=0\.44\.11/);
assert.match(html, /app\.js\?v=0\.44\.11/);
assert.match(html, /version\.js\?v=0\.44\.11/);
assert.match(html, /id="devices-section"[^>]*data-dashboard-pane="devices"/);
assert.match(html, /id="device-module"/);
assert.match(html, /id="nav-devices"/);
assert.match(app, /createDeviceModule/);
assert.match(app, /deviceModule\.handleDeepLink\(\)/);
assert.match(styles, /\.device-scanner__camera/);
assert.match(deviceManagement, /import\(QR_SCANNER_MODULE_URL\)/);
assert.match(deviceManagement, /preferredCamera: "environment"/);
assert.match(deviceManagement, /QrScanner\.scanImage\(file/);
assert.doesNotMatch(deviceManagement, /if \(!\("BarcodeDetector" in window\)\)/);
assert.match(deviceManagement, /Promise\.allSettled/);
assert.match(deviceManagement, /Gerät & QR anlegen/);
assert.match(deviceManagement, /Beiliegende Teile \/ Koffer/);
assert.match(deviceManagement, /admin\/devices\/bundles/);
assert.match(deviceManagement, /device-editor-form" novalidate/);
assert.match(deviceManagement, /prepareEditorSubmission/);
assert.match(deviceManagement, /Bitte das markierte Feld prüfen/);
assert.ok(deviceManagement.includes('querySelector("input:invalid, select:invalid, textarea:invalid")'));
assert.match(deviceManagement, /showToast\(message\)/);
assert.match(deviceManagement, /Aktuellen Besitzer zuordnen/);
assert.match(deviceManagement, /QR-Druckbogen für dieses Set/);
assert.match(qrScannerVendor, /qr-scanner-worker\.min\.js/);
assert.match(qrScannerWorker, /export const createWorker/);
assert.match(styles, /\.device-settings__form/);
assert.match(html, /id="site-dashboard-vde-panel"/);
assert.match(html, /id="employee-site-vde-module"/);
assert.match(html, /id="site-choice-open"/);
assert.match(html, /id="site-choice-dialog"/);
assert.match(html, /id="field-site-form"/);
assert.match(html, /id="field-site-customer"/);
assert.match(html, /id="field-site-customer-name"/);
assert.match(html, /id="field-site-project-name"/);
assert.match(html, /id="field-site-customer-error"[^>]*aria-live="polite"/);
assert.match(html, /id="field-site-name-error"[^>]*aria-live="polite"/);
assert.match(html, /id="field-site-street-error"[^>]*aria-live="polite"/);
assert.match(html, /id="field-site-city-error"[^>]*aria-live="polite"/);
assert.match(html, /id="time-addition-dialog"/);
assert.match(html, /id="timesheet-export-form"/);
assert.match(html, /id="employee-timesheet-export-pdf-submit"/);
assert.match(html, /id="timesheet-export-pdf-submit"/);
assert.match(html, /Stundenzettel exportieren/);
// Die technische Projektebene bleibt fuer bestehende Verknuepfungen erhalten,
// wird in der normalen Bedienung aber nicht als zweite Auftragswelt gezeigt.
assert.match(html, /<summary hidden>Baustellenübersicht<\/summary>/);
assert.match(html, /id="site-customer"/);
assert.match(html, /id="project-panel" class="admin-panel" hidden/);
assert.match(html, /id="mobile-report-card"/);
assert.match(html, /id="mobile-report-form"/);
assert.match(html, /id="mobile-report-personnel-list"/);
assert.match(html, /id="mobile-report-personnel-total"/);
assert.match(html, /id="mobile-report-obstructions"/);
assert.match(html, /id="mobile-report-open-items"/);
assert.match(html, /id="mobile-report-materials"/);
assert.match(html, /id="mobile-report-agreements"/);
assert.match(html, /id="mobile-report-incidents"/);
assert.match(html, /id="assignment-quick-actions"/);
assert.match(html, /id="assignment-instruction"/);
assert.match(html, /id="assignment-navigation"/);
assert.match(html, /id="assignment-details-label"/);
assert.match(html, /id="assignment-report"/);
assert.match(html, /id="hierarchy-search"/);
assert.match(html, /id="site-master-data-tools"/);
assert.match(html, /id="employee-site-workspace"/);
assert.match(html, /id="employee-site-team"/);
assert.match(html, /id="employee-site-tasks"/);
assert.match(html, /id="employee-site-notes"/);
assert.match(html, /id="employee-site-note-form"/);
assert.match(html, /id="employee-site-reports"/);
assert.match(html, /id="employee-site-documents"/);
assert.match(html, /id="employee-site-photos"/);
assert.match(html, /id="employee-site-photo-input"[\s\S]*capture="environment"/);
assert.match(html, /id="employee-site-materials"/);
assert.match(html, /id="site-dashboard-notes"/);
assert.match(html, /id="site-note-form"/);
assert.match(html, /id="assignment-report-responsible"/);
assert.match(html, /id="assignment-edit-report-responsible"/);
assert.match(html, /id="dispatch-summary-date"/);
assert.match(html, /id="dispatch-summary"/);
assert.match(html, /id="dispatch-unassigned-count"/);
assert.match(html, /id="dispatch-absent-count"/);
assert.match(html, /id="dispatch-active-count"/);
assert.match(html, /id="dispatch-review-count"/);
assert.match(html, /id="site-report-finalize-form"/);
assert.match(html, /id="site-report-employee-signature"/);
assert.match(html, /id="site-report-customer-signature"/);
assert.match(html, /id="site-dashboard"/);
assert.match(html, /id="site-dashboard-plan-assignment"/);
assert.match(html, /id="site-dashboard-create-report"/);
assert.match(html, /id="site-dashboard-add-document-shortcut"/);
assert.match(html, /id="site-dashboard-create-task"/);
assert.match(html, /aria-live="polite"/);
assert.match(html, /Öffentliche Demo/);
assert.match(html, /keine GPS-Daten/i);
assert.doesNotMatch(html, /https?:\/\//, "Die PWA darf keine externen Laufzeitressourcen laden");

assert.match(styles, /env\(safe-area-inset-bottom\)/);
assert.match(styles, /:focus-visible/);
assert.match(styles, /min-width: 320px/);
assert.match(styles, /\.time-summary/);
assert.match(styles, /\.status-timer/);
assert.doesNotMatch(styles, /\.live-overview/);
assert.match(styles, /\.entry-list/);
assert.match(styles, /\.entry-list__correction/);
assert.match(styles, /\.week-time-entry__action/);
assert.match(styles, /\.week-timesheet-day/);
assert.match(styles, /\.time-correction-dialog/);
assert.match(styles, /\.time-correction-form/);
assert.match(styles, /\.time-correction-review-actions/);
assert.match(styles, /\.absence-form/);
assert.match(styles, /\.absence-status--approved/);
assert.match(styles, /\.absence-review-actions/);
assert.match(styles, /\.week-absence/);
assert.match(styles, /\.week-day-absence/);
assert.match(styles, /\.timesheet-export-form/);
assert.match(styles, /\.site-choice-dialog/);
assert.match(styles, /\.time-addition-site-field/);
assert.match(styles, /\.work-day-review-status/);
assert.match(styles, /\.work-day-review-action/);
assert.match(styles, /\.import-preview/);
assert.match(styles, /\.import-mappings/);
assert.match(styles, /\.planning-group/);
assert.match(styles, /\.planning-board-row/);
assert.match(styles, /\.planning-month-board/);
assert.match(styles, /\.planning-board-cell--drop-target/);
assert.match(styles, /\.planning-member-picker/);
assert.match(styles, /\.excel-import-bar/);
assert.match(styles, /\.excel-import-choose/);
assert.match(styles, /\.selected-file-row/);
assert.match(styles, /\.site-list-toolbar/);
assert.match(styles, /\.site-status--active/);
assert.match(styles, /\.site-status--completed/);
assert.match(styles, /\.site-status--archived/);
assert.match(styles, /\.site-edit-form/);
assert.match(styles, /\.entity-edit-form/);
assert.match(styles, /\.bottom-nav--planner/);

// Der Rahmen des neuen Entwurfs: dunkle Seitenleiste mit rotem aktivem
// Eintrag, Name der App darueber, Benutzername und Rolle in der Kopfzeile.
// Auf dem Telefon bleibt alles, wie es ist - dort ist die helle Leiste unten
// am Rand richtig und erprobt.
assert.match(styles, /--sidebar: #1b1b1d/);
assert.match(styles, /\.dashboard-view > \.bottom-nav \{[^}]*background: var\(--sidebar\)/);
assert.match(styles, /\.nav-item--active[\s\S]{0,120}background: var\(--brand\)/);
assert.match(html, /id="topbar-user-name"/);
assert.match(app, /function renderTopbarUser\(/);
// Die Beschriftungen folgen dem Entwurf. Woche und Zeiterfassung bleiben
// getrennt: die erste ist Auswertung und Korrektur, die zweite der laufende
// Arbeitstag. Ein Eintrag ohne echten Zielbereich wird nicht ergänzt.
const leisteReihenfolge = [
  "Übersicht", "Zeiterfassung", "Meine Woche", "Azubi-Berichtsheft",
  "Planung", "Einsatzplanung", "Baustellen", "Dokumentation",
  "Berichtszentrale", "Dokumentablage", "Prüfprotokolle", "Betrieb",
  "Kunden", "Mitarbeiter", "Fahrzeuge", "Maschinen &amp; Geräte",
  "Arbeitszeit-Auswertung", "Einstellungen"
];
const leiste = html.slice(
  html.indexOf('<nav class="bottom-nav"'),
  html.indexOf("</nav>", html.indexOf('<nav class="bottom-nav"'))
);
assert.deepEqual(
  [...leiste.matchAll(/<span>([^<]+)<\/span>/g)].map((treffer) => treffer[1]).slice(1),
  leisteReihenfolge
);
// Zeichen und Wortmarke stehen ueber der Leiste, aber nur am Rechner.
assert.match(html, /class="nav-brand"/);
assert.match(styles, /\.bottom-nav > \.nav-brand,\s*\n\.bottom-nav > \.nav-item--desktop \{\s*\n\s*display: none;/);
assert.match(styles, /\.nav-brand \{[\s\S]{0,260}text-transform: uppercase;/);

// Listen als Tabelle: am Rechner Kopfzeile und Spalten, am Telefon dieselben
// Angaben gestapelt. Kopfzeile und Datenzeilen lesen dieselbe Spaltenangabe,
// damit sie nicht auseinanderlaufen; die letzte Spalte ist fest breit, sonst
// waere sie in Zeilen ohne Schaltflaeche null Pixel breit.
assert.match(app, /function appendAdminListHead\(/);
assert.match(app, /function adminListCells\(/);
assert.match(app, /\["Name", "E-Mail", "Rolle", "Telefon", "Status"\]/);
assert.match(app, /appendAdminListHead\(list, \["Baustelle", "Aufgabe", "Kunde", "Adresse", "Dokumente", "Status"\]\)/);
assert.match(app, /\["Nr\.", "Baustelle", "Prüfungsart", "Datum", "Status", "Prüfer"\]/);
assert.match(styles, /grid-template-columns: var\(--tabellen-spalten/);
assert.match(styles, /#employee-list \{\s*\n\s*--tabellen-spalten:[^;]*92px;/);
assert.match(styles, /\.hierarchy-site-table \{\s*\n\s*--tabellen-spalten:[^;]*70px;/);
assert.match(styles, /\.admin-list--table \.admin-list__cells \{\s*\n\s*display: contents;/);
// Am Telefon bleibt es eine Zeile unter dem Namen: keine Kopfzeile, leere
// Angaben fallen weg, die Statusmarke bekommt eine eigene Zeile.
assert.match(styles, /\.admin-list \.admin-list__head \{\s*\n\s*display: none;/);
assert.match(styles, /\.admin-list__cells > span\[data-leer\] \{\s*\n\s*display: none;/);
assert.match(styles, /\.admin-list__cells > span\[data-marke\] \{\s*\n\s*display: block;/);
assert.match(styles, /\.site-status--pending/);

// Die Uebersicht: Arbeitskonto, offene Hinweise und der naechste Feiertag
// standen im Wochenbereich. Wer morgens die App aufmacht, will genau diese
// drei Angaben sehen, ohne den Bereich zu wechseln - sie sind umgezogen, nicht
// verdoppelt. Nur der Stand des Kontos steht zweimal da: hier als eine Zahl,
// im Wochenbereich mit den Monatswerten darunter.
assert.match(html, /id="overview-cards"[^>]*data-dashboard-pane="start"/);
assert.match(html, /id="overview-account-balance"/);
// Stunden und Resturlaub stehen nebeneinander in einer Reihe: es sind die
// beiden Zahlen, wegen derer man die Karte ueberhaupt ansieht. Der Urlaub lag
// vorher nur im Wochenbereich, einen Bereichswechsel entfernt.
assert.match(
  html,
  /<div class="overview-account-values">[\s\S]*?id="overview-account-balance"[\s\S]*?id="overview-account-vacation"[\s\S]*?<\/div>\s*<\/div>/,
  "Stunden und Resturlaub gehoeren in dieselbe Reihe"
);
assert.match(styles, /\.overview-account-values \{[\s\S]{0,240}grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
assert.match(app, /overviewAccountVacation\.textContent =\s*\n?\s*formatDayCount\(account\.vacation\.remainingDays\)/);
// Ein deaktiviertes Stundenkonto darf den Resturlaub nicht mitverstecken - er
// laeuft unabhaengig weiter, und der Wochenbereich sagt das ausdruecklich.
assert.match(app, /elements\.overviewAccountCard\.hidden = !account;/);
assert.match(app, /elements\.overviewAccountBalance\.textContent = "Deaktiviert";/);
assert.match(app, /function renderOverviewCards\(/);
assert.match(app, /function renderOverviewAccount\(/);
assert.match(styles, /\.overview-cards \{/);
assert.match(styles, /\.overview-cards \{[\s\S]{0,200}grid-auto-flow: column;/);
// Die drei Karten stehen genau einmal im Dokument.
for (const kennung of ["overview-account-card", "week-open-actions", "next-holiday-card"]) {
  assert.equal(
    [...html.matchAll(new RegExp(`id="${kennung}"`, "g"))].length,
    1,
    `${kennung} darf nur einmal vorkommen`
  );
}
// Und sie stehen auf der Startseite, nicht mehr im Wochenbereich.
assert.ok(
  html.indexOf('id="overview-cards"') < html.indexOf('id="week-section"'),
  "Die Uebersichtskarten stehen vor dem Wochenbereich"
);

// Ein Telefon mit eingerichteter App kann tagelang eine alte Oberflaeche
// zeigen: der Dienst-Worker taeuscht eine funktionierende Welt vor, und
// niemand erfaehrt, dass es eine neuere gibt. Jede Antwort des Servers nennt
// deshalb seine Fassung, und die App vergleicht sie mit ihrer eigenen.
assert.match(html, /id="update-banner"/);
assert.match(app, /function pruefeServerfassung\(/);
assert.match(app, /X-Schaefchen-Server-Version/);
assert.match(app, /import \{ serverIsNewer \} from "\.\/core\/versions\.js\?v=/);
assert.match(styles, /\.update-banner \{/);
// Der Balken liegt fest oben; ohne diesen Schalter verdeckt er die Kopfzeile.
assert.match(app, /classList\.add\("hat-fassungshinweis"\)/);
assert.match(styles, /body\.hat-fassungshinweis \{/);
// Das Neuladen wirft die alten Dateien weg. Ein blosses reload holte bei einer
// eingerichteten App wieder dieselben aus dem Speicher.
assert.match(app, /caches\.delete\(name\)/);

// Am Telefon zeigt eine Baustellenrolle Start, Zeiten und Mehr. Planende Rollen
// erhalten Planung, Dokumentation und Betrieb als echte Gruppenschalter -
// keine unbedienbaren Gruppenueberschriften zwischen den Knoepfen.
for (const [kennung, kurz] of [
  ["nav-start", "Start"], ["nav-week", "Zeiten"],
  ["nav-mobile-planning", "Planung"],
  ["nav-mobile-documentation", "Doku"],
  ["nav-mobile-business", "Betrieb"], ["nav-more", "Mehr"]
]) {
  assert.match(html, new RegExp(`id="${kennung}"[^>]*data-kurz="${kurz}"`), `${kennung} ohne kurze Beschriftung`);
}
assert.match(styles, /\.bottom-nav > \.nav-item\[data-kurz\]::after \{\s*\n\s*content: attr\(data-kurz\);/);
assert.match(html, /id="nav-time" class="nav-item nav-item--desktop"/);
for (const kennung of ["nav-assignments", "nav-sites", "nav-apprentice"]) {
  assert.match(html, new RegExp(`id="${kennung}" class="nav-item nav-item--desktop"`));
}
assert.match(html, /id="nav-week"[\s\S]{0,360}class="nav-icon--mobile"/);
assert.match(app, /elements\.navTime\.hidden = !planner;/);
assert.match(app, /elements\.navWeek\.dataset\.kurz = "Zeiten";/);
assert.match(app, /function openNavigationGroup\(group\)/);
for (const gruppe of ["planning", "documentation", "business"]) {
  assert.match(app, new RegExp(`openNavigationGroup\\("${gruppe}"\\)`));
}
assert.match(designSystem, /@media \(max-width: 1079px\)[\s\S]*?\.dashboard-view > \.bottom-nav > \.nav-group-label,[\s\S]*?display: none !important;/);
assert.match(designSystem, /\.dashboard-view > \.bottom-nav > \.nav-item \{\s*\n\s*min-width: 0;\s*\n\s*flex: 1 1 0;/);

// Am Rechner ist die Navigation nach Aufgabe statt nach Entstehungszeit
// sortiert. Verborgene Modul- oder Rollenpunkte lassen ihre Gruppenueberschrift
// nicht alleine stehen.
for (const gruppe of ["work", "planning", "documentation", "business", "control"]) {
  assert.match(html, new RegExp(`data-nav-group-label="${gruppe}"`));
}
assert.match(app, /function updateNavigationGroups\(\)/);
const erwarteteNavigation = [
  "nav-start", "nav-time", "nav-week", "nav-apprentice", "nav-assignments",
  "nav-sites", "nav-reports", "nav-documents", "nav-inspections",
  "nav-customers", "nav-employees", "nav-vehicles", "nav-analytics", "nav-more"
];
for (let index = 1; index < erwarteteNavigation.length; index += 1) {
  assert.ok(
    html.indexOf(`id="${erwarteteNavigation[index - 1]}"`)
      < html.indexOf(`id="${erwarteteNavigation[index]}"`),
    `${erwarteteNavigation[index]} steht in der falschen Navigationsgruppe`
  );
}
assert.match(styles, /\.nav-group-label \{/);

// Der Fuhrpark. Das Modul stand seit Migration 040 im Katalog, dahinter lag
// nichts; jetzt gibt es die Fahrzeuge samt Bildschirm.
assert.match(html, /id="vehicles-shell"/);
assert.match(html, /id="vehicle-list"/);
assert.match(html, /id="vehicle-form"/);
assert.match(html, /<span>Fahrzeuge<\/span>/);
assert.match(app, /function renderVehicleList\(/);
assert.match(app, /function openVehicleEditor\(/);
assert.match(app, /async function refreshVehicles\(/);
assert.match(app, /elements\.vehiclesShell\.hidden = pane !== "vehicles"/);
// Der Eintrag steht nur da, wenn die Firma den Fuhrpark hat.
assert.match(app, /elements\.navVehicles\.hidden = !planner \|\| !moduleEnabled\("fleet"\)/);
// Eine abgelaufene Hauptuntersuchung ist kein Termin mehr, sondern ein
// Fahrverbot.
assert.match(app, /vehicle-overdue/);
assert.match(styles, /\.vehicle-overdue \{/);

// Suche und Glocke in der Kopfzeile. Beide arbeiten mit dem, was ohnehin
// geladen ist: eine Suche, die etwas findet, was der Bildschirm daneben nicht
// kennt, ist schlimmer als keine.
assert.match(html, /id="global-search"/);
assert.match(html, /id="notification-bell"/);
assert.match(html, /id="notification-count"/);
assert.match(app, /function searchMatches\(/);
assert.match(app, /function renderSearchResults\(/);
assert.match(app, /function pendingItems\(/);
assert.match(app, /function renderNotifications\(/);
assert.match(styles, /\.topbar-search \{/);
assert.match(styles, /\.notification-bell__count \{/);
// Die Glocke zaehlt nur, was jemand tun muss. Eine Meldung, die niemanden zu
// etwas auffordert, ist eine Ablenkung.
for (const stichwort of ["zur Freigabe", "Zeitkorrektur", "Abwesenheitsantrag", "Berichtsheft-Woche", "zu bestätigen"]) {
  assert.ok(app.includes(stichwort), `Die Glocke kennt "${stichwort}" nicht`);
}
// Am Telefon ist in der Kopfzeile kein Platz; die Bereiche haben dort jeweils
// ihr eigenes Suchfeld.
assert.match(styles, /@media \(max-width: 1079px\) \{[\s\S]{0,220}\.notification-bell \{\s*\n\s*display: none;/);

// Fuehrerscheinklassen am Mitarbeiter, und die Disposition warnt, wenn auf
// einer Baustelle des Tages niemand mit Schein eingeteilt ist. Ohne
// Fuehrerschein kommt niemand mit dem Fahrzeug hin - das faellt heute erst am
// Morgen auf.
assert.match(html, /id="employee-licences"/);
assert.match(html, /id="employee-edit-licences"/);
assert.match(html, /id="employee-detail-licences"/);
assert.match(html, /id="dispatch-licence-warning"/);
assert.match(app, /function renderLicenceWarning\(/);
assert.match(app, /function fillLicenceField\(/);
assert.match(app, /function readLicenceField\(/);
assert.match(app, /drivingLicenceClasses: readLicenceField\(elements\.employeeLicences\)/);
assert.match(app, /drivingLicenceClasses: readLicenceField\(elements\.employeeEditLicences\)/);
assert.match(styles, /\.licence-field \{/);
assert.match(styles, /\.dispatch-warning \{/);
// Die Klassen sind eine feste Liste, kein freier Text: "Klasse 3" und "B"
// waeren sonst zwei verschiedene Dinge.
for (const klasse of ["AM", "B", "B96", "BE", "C1E", "CE", "D1E", "T"]) {
  assert.match(app, new RegExp(`\\["${klasse}", "`), `Die Klasse ${klasse} fehlt`);
}

// Der Wochenstreifen traegt seine Zahlen selbst, wie im Entwurf: Wochentag,
// Datum, Haken, Kommen, Gehen und die Stunden. Der heutige Tag ist rot
// umrandet, nicht rot gefuellt - gefuellt waeren die Zahlen darin schlechter
// zu lesen.
assert.match(app, /kommenZeile\.className = "day-pill__in";/);
assert.match(app, /gehenZeile\.className = "day-pill__out";/);
assert.match(app, /stunden\.className = "day-pill__hours";/);
assert.match(styles, /\.day-pill--today \{[\s\S]{0,160}border-color: var\(--brand\);/);
assert.doesNotMatch(styles, /\.day-pill--today \{[\s\S]{0,160}background: var\(--brand\);/);
// Am Telefon muessen alle sieben Tage nebeneinander passen: ein halb
// abgeschnittener Sonntag sieht aus wie ein Fehler.
assert.match(styles, /@media \(max-width: 1079px\) \{\s*\n(?:\s*\/\*[\s\S]*?\*\/\s*\n)?\s*\.week-strip \{[\s\S]{0,140}grid-template-columns: repeat\(7, minmax\(0, 1fr\)\);/);
// Kalenderwoche zwischen den Pfeilen, daneben der Zeitraum und "Heute".
assert.match(html, /id="week-number"/);
assert.match(app, /elements\.weekNumber\.textContent = isoWeekLabel\(/);

// Die Mitarbeiterliste nach dem Entwurf: Kuerzel vor dem Namen, Saldo als
// eigene Spalte, Statusmarke und rechts die Spalte des Ausgewaehlten.
assert.match(html, /id="employee-detail"/);
assert.match(html, /id="employee-detail-balance"/);
assert.match(app, /function renderEmployeeList\(/);
assert.match(app, /function renderEmployeeDetail\(/);
assert.match(app, /function employeeBalanceText\(/);
assert.match(styles, /\.employee-split \{/);
assert.match(styles, /\.employee-avatar \{/);
// Der Saldo kommt aus dem Jahreskonto, nicht aus einer zweiten Rechnung.
assert.match(app, /timeAccountsState\?\.accounts \|\| \[\]/);

// Die Baustellenakte nach dem Entwurf: "Baustelle ausgewaehlt", darunter die
// Reiterleiste und vier Felder - Adresse, Vorarbeiter, wer heute vor Ort ist
// und wann es weitergeht.
assert.match(html, /<p class="eyebrow">Baustelle ausgewählt<\/p>/);
assert.match(html, /id="site-overview-address"/);
assert.match(html, /id="site-overview-foreman"/);
assert.match(html, /id="site-overview-today"/);
assert.match(html, /id="site-overview-next"/);
assert.match(app, /function renderSiteOverviewCards\(/);
assert.match(styles, /\.site-overview-cards \{/);
assert.match(styles, /\.site-overview-avatar--rest \{[\s\S]{0,120}background: var\(--brand\);/);
// Am Rechner ist die Reiterleiste ein Strich, am Telefon bleiben es Pillen:
// dort scrollt die Leiste waagerecht und eine Pille trifft der Daumen besser.
assert.match(styles, /\.workspace-section-nav--site-dashboard \.workspace-section-tab--active \{[\s\S]{0,160}border-bottom-color: var\(--brand\);/);

// Der Arbeitstag steht pro Rolle genau einmal: fuer planende Rollen in der
// Zeiterfassung, fuer Monteur, Vorarbeiter und Azubi auf der Startseite.
assert.match(app, /function showsPersonalWorkday\(pane\) \{/);
assert.match(app, /return canPlan\(\) \? pane === "time" : pane === "start";/);
assert.match(app, /element\.hidden = !showsPersonalWorkday\(pane\);/);
assert.match(app, /elements\.overviewCards\.hidden = currentDashboardPane !== "start"/);
assert.match(app, /dashboardTitle\.textContent = `\$\{greetingForHour\(\)\}, \$\{session\.user\.firstName\} \\u\{1F44B\}`;/);
assert.match(designSystem, /@media \(max-width: 759px\)[\s\S]*?\.status-card \{[\s\S]*?border-radius: 23px;[\s\S]*?--mobile-status-card-background/);
assert.match(designSystem, /@media \(max-width: 759px\)[\s\S]*?\.welcome-subtitle \{\s*display: none;/);
assert.match(designSystem, /@media \(max-width: 759px\)[\s\S]*?\.welcome-badges \.welcome-date \{[\s\S]*?position: absolute;/);
// Der Kopf der Zeiterfassung und die drei vorhandenen Funktionsbereiche stehen
// als gemeinsamer Block direkt hinter der Woche.
assert.match(app, /elements\.weekSection\.after\(\s*\n\s*elements\.timePageHeading,\s*\n\s*elements\.workdayCard,/);

// Das Dashboard nach dem Entwurf: Begruessung mit Namen, darunter das volle
// Datum, rechts der Schnellzugriff. Dann vier Kennzahlen und "Heute im
// Ueberblick" mit zwei Feldern.
assert.match(html, /id="dashboard-metrics"[^>]*data-dashboard-pane="start"/);
for (const kennung of ["metric-sites", "metric-employees", "metric-reports", "metric-overtime"]) {
  assert.match(html, new RegExp(`id="${kennung}"`), `${kennung} fehlt`);
}
assert.match(html, /id="today-overview"/);
assert.match(html, /id="today-sites"/);
assert.match(html, /id="today-activity"/);
assert.match(html, /class="welcome-date"/);
assert.match(app, /function renderDashboardMetrics\(/);
assert.match(app, /function renderTodayOverview\(/);
assert.match(app, /function latestActivity\(/);
assert.match(app, /function renderQuickAccess\(/);
// Die Kennzahlen gelten nur fuer die Planung: ein Monteur sieht auf seinem
// Dashboard den Arbeitstag, nicht die Zahlen des ganzen Betriebs.
assert.match(app, /const zeigen = Boolean\(adminState\) && canPlan\(\) && !demoMode;/);
// Die Ueberstunden kommen aus der Wochenansicht selbst - dieselbe Rechnung
// zweimal aufzuschreiben waere die sicherste Art, zwei Zahlen zu bekommen.
assert.match(app, /const differenz = wochenDifferenzMinuten;/);
assert.match(app, /wochenDifferenzMinuten = differenceMinutes;/);
assert.match(styles, /\.dashboard-metrics \{/);
assert.match(styles, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/);
assert.match(styles, /\.today-overview__panels \{/);
// Der Schnellzugriff fuehrt nur zu Dingen, die es wirklich gibt.
assert.match(html, /id="quick-access"/);
// Was es noch nicht gibt, steht auch nicht im Schnellzugriff.
assert.doesNotMatch(app, /"Material anlegen"|"Rechnung schreiben"/);

// Jeder Eintrag der Leiste hat einen eigenen Bereich mit eigener Huelle.
for (const huelle of [
  "reports-shell", "employees-shell", "customers-shell", "documents-shell", "inspections-shell"
]) {
  assert.match(html, new RegExp(`id="${huelle}"`), `${huelle} fehlt`);
  assert.match(app, new RegExp(`elements\\.${huelle.replace(/-(.)/g, (_, z) => z.toUpperCase())}\\.hidden = pane !==`));
}
assert.match(app, /function renderCustomerOverview\(/);
assert.match(app, /function renderInspectionOverview\(/);
assert.match(app, /function renderPaneMenu\(/);
// Am Telefon entstehen die Ziele eines Bereichs aus derselben Navigation. So
// oeffnen Planung, Dokumentation und Betrieb jeweils ihre echten Unterziele;
// „Mehr“ sammelt Meine Arbeit und Steuerung.
assert.match(html, /id="pane-menu"/);
assert.match(app, /querySelectorAll\("\.nav-item--desktop"\)/);
assert.match(app, /const gruppennamen = \{/);
assert.match(app, /planning: "Planung"/);
assert.match(app, /documentation: "Dokumentation"/);
assert.match(app, /business: "Betrieb"/);
assert.match(styles, /\.pane-menu \{/);
assert.match(styles, /\.pane-menu__group \{/);
assert.match(styles, /\.pane-menu__item--active \{/);
assert.match(styles, /@media \(min-width: 1080px\) \{\s*\n\s*\.pane-menu \{\s*\n\s*display: none;/);
// Auch die Einstellungen und Auswertungen sind echte Unterbereiche. Anklicken
// markiert nicht nur einen Anker, sondern blendet die anderen Inhalte aus.
for (const bereich of ["time-accounts", "holidays", "time-rules", "account"]) {
  assert.match(html, new RegExp(`data-settings-view="${bereich}"`));
}
assert.match(app, /function showSettingsSubarea\(requested\)/);
// Der aktive Eintrag wird aus der Leiste selbst bestimmt, nicht aus einer
// festen Liste - sonst bliebe ein neuer Bereich unmarkiert.
assert.match(app, /function activateNavigation\([\s\S]{0,220}bottomNav\.querySelectorAll\("\.nav-item"\)/);

// Die Anmeldeseite: am Rechner zweispaltig, links dunkel mit Name und
// Anspruch, rechts das Formular. Am Telefon bleibt die einspaltige Karte.
assert.match(html, /class="login-stage"/);
assert.match(styles, /\.login-stage \{\s*\n\s*display: none;/);
assert.match(styles, /#login-view \{[\s\S]{0,220}grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\);/);
assert.match(styles, /\.login-stage \{[\s\S]{0,220}background: var\(--sidebar\);/);
// Die dunkle Seite steht im Dokument hinter dem Formular: mit Tastatur oder
// Vorleser landet man zuerst bei der Anmeldung, nicht bei den Werbezeilen.
assert.ok(
  html.indexOf('id="login-submit"') < html.indexOf('class="login-stage"'),
  "Das Anmeldeformular steht vor der dunklen Seite"
);
// Der Passwortwechsel ist ein eigener Bereich und bleibt mittig.
assert.doesNotMatch(styles, /#password-change-view \{[^}]*grid-template-columns/);

// Desktop: dieselbe Seite, zweite Gestalt. Am Rechner sitzt das Buero, und
// dort war von 1440 Pixeln Breite die Haelfte genutzt - die Plantafel zeigte
// drei von fuenf Wochentagen. Ab 1080 Pixeln wandert die Leiste nach links,
// der Inhalt nutzt die Breite, und die Karten ordnen sich nebeneinander.
assert.match(styles, /@media \(min-width: 1080px\)/);
assert.match(styles, /grid-template-areas:\s*\n\s*"seitenleiste kopf"/);
assert.match(styles, /grid-area: seitenleiste/);
// Am Aufbau der Seite aendert sich nichts: die Handy-Ansicht bleibt, wie sie
// ist, und die Leiste steht dort weiterhin unten fest.
assert.match(styles, /\.bottom-nav \{[^}]*position: fixed/);
assert.doesNotMatch(html, /desktop-view|data-desktop/);
assert.match(styles, /\.download-link/);
assert.match(styles, /\.document-management-panel/);
assert.match(styles, /\.document-file-choose/);
assert.match(styles, /\.document-compact-list/);
assert.match(styles, /\.site-work-module/);
assert.match(styles, /\.module-action--primary/);
assert.match(styles, /\.site-module-list/);
assert.match(styles, /\.employee-site-workspace/);
assert.match(styles, /\.employee-site-module/);
assert.match(styles, /\.employee-site-photo-grid/);
assert.match(styles, /\.employee-site-task-actions/);
assert.match(styles, /\.mobile-report-personnel/);
assert.match(styles, /\.mobile-report-check/);
assert.match(styles, /\.assignment-quick-actions/);
assert.match(styles, /\.assignment-instruction/);
assert.match(styles, /\.dispatch-summary/);
assert.match(styles, /\.employee-site-item-actions/);
assert.match(styles, /\.site-dashboard-shortcuts/);
assert.match(styles, /\.hierarchy-toolbar/);
assert.match(styles, /\.hierarchy-node-actions/);
assert.match(styles, /\.company-context__mark--logo/);
assert.match(styles, /\.company-brand-line__mark--logo/);
assert.match(styles, /--brand: #e30613/);
assert.match(styles, /--ink: #111111/);
assert.doesNotMatch(styles, /#173c34|#b9e65a|#7da82a/i, "Alte grüne Markenfarben dürfen nicht verbleiben");

assert.match(app, /navigator\.serviceWorker\.register/);
assert.match(app, /window\.localStorage\.setItem/);
assert.match(app, /window\.crypto\?\.randomUUID/);
assert.match(app, /clientEntryId/);
assert.match(app, /pendingSync: !demoMode/);
assert.match(app, /\.\/api\/v1\/session/);
assert.match(app, /\.\/api\/v1\/setup/);
assert.match(app, /\.\/api\/v1\/account\/initial-password/);
assert.match(app, /\.\/api\/v1\/admin\/employees/);
assert.match(app, /openEmployeeEditor/);
assert.match(app, /renderDispatchSummary/);
assert.match(workTimeCore, /export function durationHoursToMinutes/);
assert.match(app, /plannedDurationMinutes/);
assert.match(app, /collectMobileReportPersonnel/);
assert.match(app, /saveMobileReportDraft/);
assert.match(app, /updateFieldSiteHierarchy/);
assert.match(app, /\.\/api\/v1\/timesheets\.\$\{format\}/);
assert.match(app, /downloadFile/);
assert.match(app, /selectWeek/);
assert.match(app, /reportResponsibilitySource/);
assert.match(app, /\.\/api\/v1\/admin\/customers/);
assert.match(app, /\.\/api\/v1\/admin\/projects/);
assert.match(app, /\.\/api\/v1\/admin\/construction-sites/);
assert.match(app, /\.\/api\/v1\/admin\/documents/);
assert.match(app, /contentBase64: arrayBufferToBase64/);
assert.match(app, /renderDocumentList/);
assert.match(app, /renderSiteDocuments/);
assert.match(app, /renderSiteTasks/);
assert.match(app, /renderSiteMaterials/);
assert.match(app, /renderSiteReports/);
assert.match(app, /renderReportCenter/);
assert.match(app, /localReportCenterDrafts/);
assert.match(app, /localDraft: true/);
assert.match(app, /openReportReturnDialog/);
assert.match(app, /collectSiteReportPhotos/);
assert.match(app, /saveSiteReportDraft/);
assert.match(app, /readSiteReportDraft/);
assert.match(app, /cacheImportantSiteDocuments/);
assert.match(app, /preferredWorkspaceSection/);
assert.match(app, /maybeOpenDeepLinkedSite/);
assert.match(app, /mobileVisible: elements\.documentMobileVisible\.checked/);
assert.match(app, /offlinePriority: elements\.documentOfflinePriority\.checked/);
assert.match(app, /\/preview`/);
assert.match(app, /\/return`/);
assert.match(app, /\.\/api\/v1\/admin\/site-tasks/);
assert.match(app, /\.\/api\/v1\/admin\/site-materials/);
assert.match(app, /\.\/api\/v1\/admin\/site-notes/);
assert.match(app, /construction-sites\/\$\{encodeURIComponent\(employeeSiteState\.site\.id\)\}\/notes/);
assert.match(app, /\.\/api\/v1\/admin\/site-reports/);
assert.match(app, /\.\/api\/v1\/site-reports/);
assert.match(app, /\.\/api\/v1\/construction-sites\//);
assert.match(app, /openEmployeeSiteWorkspace/);
assert.match(app, /openMobileReportForm\(assignment, \{ leaveAfterSave: false \}\)/);
assert.match(app, /updateEmployeeSiteTask/);
assert.match(app, /construction-sites\/\$\{encodeURIComponent\(employeeSiteState\.site\.id\)\}\/tasks/);
assert.match(app, /openAssignmentPlanningForSite/);
assert.match(app, /openDocumentUploadForSite/);
assert.match(app, /uploadEmployeeSitePhoto/);
assert.match(app, /reportResponsible/);
assert.match(app, /window\.SpeechRecognition \|\| window\.webkitSpeechRecognition/);
assert.match(app, /function setCompanyMark/);
assert.match(app, /session\.company\.logoUrl/);
assert.match(app, /method: "PATCH"/);
// Die sichtbaren Listen fuer Baustellen und Kunden. Die technische
// Projektverknuepfung bleibt bearbeitbar, bildet aber keine zweite sichtbare
// Auftragsliste mehr.
assert.match(app, /function renderBusinessHierarchy\(/);
assert.match(app, /function renderCustomerOverview\(/);
assert.match(app, /function openProjectEditor\(project\)/);
assert.match(app, /siteStatusGroup/);
assert.match(app, /rowVersion: customer\.rowVersion/);
assert.match(app, /rowVersion: project\.rowVersion/);
assert.match(app, /rowVersion: site\.rowVersion/);
assert.match(app, /assignmentPlanningContent\.append/);
assert.match(app, /sitePlanningContent\.append/);
assert.match(app, /after\(elements\.assignmentImportPanel\)/);
assert.match(app, /after\(elements\.siteImportPanel\)/);
assert.match(app, /assignmentImportChoose\.addEventListener/);
assert.match(app, /siteImportChoose\.addEventListener/);
assert.match(app, /siteImportFile\.click\(\)/);
assert.match(app, /showDashboardPane\("assignments"\)/);
assert.match(app, /showDashboardPane\("sites"\)/);
assert.match(app, /\.\/api\/v1\/admin\/assignments/);
assert.match(app, /\.\/api\/v1\/admin\/assignment-imports\/preview/);
assert.match(app, /assignmentImportFile\.arrayBuffer/);
assert.match(app, /assignmentImportApplyMappings/);
assert.match(app, /\.\/api\/v1\/admin\/site-imports\/preview/);
assert.match(app, /siteImportFile\.arrayBuffer/);
assert.match(app, /window\.confirm/);
assert.match(app, /method: "PATCH"/);
assert.match(app, /\/cancel`/);
assert.match(app, /renderAdminWeek/);
assert.match(app, /createPlanningAssignmentCard/);
assert.match(app, /makePlanningDropTarget/);
assert.match(app, /assignmentConflictMessages/);
assert.match(app, /\.\/api\/v1\/admin\/assignment-batches/);
assert.match(app, /\.\/api\/v1\/admin\/planning-teams/);
assert.match(app, /canCreateManagementRoles/);
assert.match(app, /user\.roles/);
assert.match(app, /window\.location\.hostname\.endsWith\("github\.io"\)/);
assert.match(app, /window\.localStorage\.removeItem\(ONLINE_STORAGE_KEY\)/);
assert.match(workTimeCore, /gross >= 360 \? 60 : gross >= 210 \? 30/);
assert.match(app, /Arbeitstag erneut starten/);
assert.match(app, /latest\.type === "clock_out"\) addEntry\("clock_in"\)/);
assert.match(app, /Nächste Baustelle wählen/);
assert.match(app, /newOccurrence/);
assert.match(workTimeCore, /const explicitPause = Math\.max\(gross - recordedWork, 0\)/);
assert.match(app, /liveDuration\.textContent = formatMinutes\(times\.work\)/);
assert.match(app, /\.\/api\/v1\/work-weeks\//);
assert.doesNotMatch(app, /work-days\/\$\{encodeURIComponent\(workDate\)\}\/submit/);
assert.match(app, /\.\/api\/v1\/admin\/work-days\//);
assert.match(app, /\.\/api\/v1\/time-entry-additions/);
assert.match(app, /method: "DELETE"/);
assert.match(app, /\.\/api\/v1\/time-tracking\/site-selection/);
assert.match(app, /\.\/api\/v1\/time-tracking\/sites/);
assert.match(app, /\.\/api\/v1\/admin\/timesheets\.\$\{format\}/);
assert.match(app, /\.\/api\/v1\/admin\/time-entry-corrections\//);
assert.match(app, /Änderung wird geprüft/);
assert.match(app, /Prüfung offen/);
assert.match(app, /entry-list__correction/);
assert.match(app, /Korrigieren/);
assert.match(app, /renderTimeCorrections/);
assert.match(app, /renderAbsences/);
assert.match(app, /renderAbsenceReviews/);
assert.match(app, /\.\/api\/v1\/absences/);
assert.match(app, /\.\/api\/v1\/admin\/absence-requests\//);
assert.match(app, /canApproveAbsenceManagement/);
assert.match(app, /renderWorkDayReviews/);
assert.doesNotMatch(app, /Stundenzettel einreichen/);
assert.match(app, /Automatisch im Büro sichtbar/);
assert.match(app, /Fehlende Buchung ergänzen/);
assert.match(app, /Abgerechnet · im persönlichen Export enthalten/);
assert.doesNotMatch(app, /liveDuration\.textContent = formatMinutes\(times\.gross\)/);
assert.doesNotMatch(app, /geolocation/i, "Die Demo darf keine GPS- oder Standortabfrage enthalten");

assert.equal(manifest.name, "Schäfchen");
assert.equal(manifest.display, "standalone");
assert.equal(manifest.start_url, "./");
assert.equal(manifest.theme_color, "#e30613");
assert.ok(manifest.icons.length > 0);

assert.match(mark, /fill="#111111"/);
assert.match(mark, /fill="#e30613"/);
assert.doesNotMatch(mark, /#173c34|#b9e65a/i);
assert.equal(companyLogo.subarray(0, 4).toString("ascii"), "RIFF");
assert.equal(companyLogo.subarray(8, 12).toString("ascii"), "WEBP");
assert.equal(siteTemplate[0], 0x50);
assert.equal(siteTemplate[1], 0x4b);

for (const asset of [
  "./index.html",
  "./manifest.webmanifest",
  "./assets/mark.svg",
  "./assets/company-logos/schaaf-elektro.webp"
]) {
  assert.ok(worker.includes(`"${asset}"`), `${asset} fehlt im App-Shell-Cache`);
}
assert.ok(worker.includes('"./styles.css?v=0.44.11"'));
assert.ok(worker.includes('"./design-system.css?v=0.44.11"'));
assert.ok(worker.includes('"./app.js?v=0.44.11"'));
assert.ok(worker.includes('"./core/work-time.js?v=0.44.11"'));
assert.ok(worker.includes('"./core/device-management.js?v=0.44.11"'));
assert.ok(worker.includes('"./core/apprentice-view.js?v=0.44.11"'));
assert.ok(worker.includes('"./vendor/qr-scanner.min.js?v=0.44.11"'));
assert.ok(worker.includes('"./vendor/qr-scanner-worker.min.js"'));
assert.ok(worker.includes('"./version.js?v=0.44.11"'));

// app.js wird als Modul geladen und holt sich die Zeitberechnung aus dem
// gemeinsamen Kern. Beide Angaben müssen zusammenpassen, sonst fehlt der
// Import im App-Shell-Cache und die PWA bricht offline.
assert.match(html, /<script type="module" src="\.\/app\.js\?v=0\.44\.11"><\/script>/);
assert.match(app, /import \{[\s\S]*?\} from "\.\/core\/work-time\.js\?v=0\.44\.11";/);
assert.match(workTimeCore, /export function calculateTimes\(events, now = new Date\(\)\)/);
// Jedes Kernmodul, das app.js einbindet, muss der Service Worker vorhalten.
// Fehlt eines, laedt die App offline gar nicht mehr, weil der Import ins Leere
// greift. Die Pruefung gilt fuer alle Kernmodule, nicht nur die bekannten.
// Der Zustandsspeicher liegt im Kernmodul. Die Schluessel und die Regel fuer
// den Tageswechsel duerfen nicht zusaetzlich in app.js stehen.
assert.doesNotMatch(app, /const DEMO_STORAGE_KEY = "/);
assert.doesNotMatch(app, /const ONLINE_STORAGE_KEY = "/);
assert.doesNotMatch(app, /saved\.workDate === localDateKey\(\)/);
assert.match(app, /restoreState\(saved, \{ today: localDateKey\(\), demoMode \}\)/);
// Die Rollenlisten stehen nur noch im Kernmodul. Vorher lagen zwei fast
// gleiche Fassungen in app.js, die sich beim Ergaenzen einer Rolle
// auseinanderentwickeln konnten.
assert.doesNotMatch(app, /const planningRoles = new Set/);
assert.doesNotMatch(app, /const fullPlanningRoles = new Set/);
assert.doesNotMatch(app, /function employeeRoleLabel/);
assert.match(app, /editableEmployeeRole\(employee\.roles\)/);
assert.match(app, /roleChangeConfirmed:/);
assert.doesNotMatch(
  app,
  /employee\.roles\.find\(\(role\) => \([\s\S]*?\["installer", "foreman"/,
  "Das Formular darf einen Auszubildenden nicht still als Monteur vorauswaehlen"
);
// Die Plantafel bietet jeden aktiven Mitarbeiter an. Sie war auf Monteure und
// Vorarbeiter gefiltert, obwohl die Schnittstelle alle Rollen einplant.
assert.doesNotMatch(app, /\["installer", "foreman"\]\.includes/);
assert.match(app, /return plannableEmployees\(adminState\?\.employees\)/);
const eingebundeneKerne = [...app.matchAll(/from "(\.\/core\/[^"]+)"/g)].map((treffer) => treffer[1]);
assert.ok(eingebundeneKerne.length >= 2, "app.js bindet die Kernmodule ein");
for (const modul of eingebundeneKerne) {
  assert.ok(
    worker.includes(`"${modul}"`),
    `${modul} fehlt im App-Shell-Cache des Service Workers`
  );
  assert.match(modul, /\?v=0\.44\.11$/, `${modul} braucht dieselbe Fassungsnummer`);
}
assert.doesNotMatch(
  app,
  /^\s{2}function (calculateTimes|formatMinutes|durationMinutes|localDateKey)\(/m,
  "Die Zeitberechnung darf nur im gemeinsamen Kern stehen"
);
assert.ok(worker.includes('"./platform-admin.html"'));
assert.ok(worker.includes('"./platform-admin.css?v=0.44.11"'));
assert.ok(worker.includes('"./platform-admin.js?v=0.44.11"'));
assert.ok(worker.includes('"./vde/index.html"'));
assert.ok(worker.includes('"./vde/styles.css?v=0.44.11"'));
assert.ok(worker.includes('"./vde/app.js?v=0.44.11"'));
assert.match(worker, /DOCUMENT_CACHE_PREFIX/);
assert.match(worker, /siteDocumentContent/);
// Gesucht wird unter der abgelegten Adresse - ohne die App-Fassung, die nur an
// der Anfrage steht. Sonst waere jedes zuvor gesicherte Dokument nach einer
// neuen Fassung offline verschwunden.
assert.match(worker, /caches\.open\(scopedCacheName\)\)\.match\(cacheUrl\.href\)/);
assert.doesNotMatch(
  worker.match(/if \(siteDocumentContent\) \{[\s\S]*?\n  \}/)?.[0] || "",
  /caches\.match\(event\.request\)/,
  "Offline-Dokumente dürfen nicht kontenübergreifend gesucht werden"
);
assert.match(app, /removeOfflineDocumentCachesExcept\(sessionView\.user\.id\)/);
assert.match(app, /await removeOfflineDocumentCachesExcept\(\);/);
assert.match(worker, /requestUrl\.pathname\.includes\("\/vde\/"\)/);
assert.match(
  styles,
  /\.login-form input,\s*\.admin-form input,\s*\.admin-form select\s*\{\s*height: 52px;/,
  "Loginfelder behalten ihre mobile Feldhöhe"
);
assert.ok(worker.includes('"./assets/baustellen-import-vorlage.xlsx"'));
assert.match(app, /\/api\/v1\/time-account\?year=/);
assert.match(app, /\/api\/v1\/admin\/time-accounts\?year=/);
assert.match(app, /\/api\/v1\/admin\/time-account-adjustments/);
assert.match(app, /\/api\/v1\/admin\/holiday-calendar/);
assert.match(app, /function isProjectScopedSession\(\)/);
assert.match(app, /projectManagerId: elements\.projectManager\.value \|\| null/);
assert.match(app, /projectId: projectScoped \? elements\.siteProject\.value : null/);
assert.match(app, /\/closures\/\$\{encodeURIComponent\(closure\.id\)\}\/cancel/);
assert.match(styles, /\.time-account-table/);
assert.match(styles, /\.time-account-admin-item/);
assert.match(styles, /\.holiday-calendar-form/);
assert.match(styles, /\.holiday-closure-list/);
assert.match(vdeHtml, /lang="de"/);
assert.match(vdeHtml, /id="inspection-form"/);
assert.match(vdeHtml, /id="distribution-list"/);
assert.match(vdeHtml, /id="signature-pad"/);
assert.match(vdeHtml, /RCD-Auslösezeit und -strom werden am jeweiligen Stromkreis/);
assert.match(vdeHtml, /V15-Bestand importieren/);
assert.match(vdeHtml, /id="legacy-local-import"/);
// Ohne die Fassungsangabe gilt ein Aufrufer als veraltet, sobald die Plattform
// ein Pflichtupdate setzt: der Server kann eine fehlende Fassung nicht von
// einer zu alten unterscheiden. Das VDE-Modul waere als einziges vollstaendig
// ausgefallen - und zwar erst dann, wenn es niemand mehr erwartet.
for (const [datei, quelle] of [["app.js", app], ["vde/app.js", vdeApp], ["platform-admin.js", platformApp]]) {
  assert.ok(
    quelle.includes('"X-Schaefchen-Version"'),
    `${datei} nennt dem Server seine Fassung nicht`
  );
}
assert.match(vdeHtml, /styles\.css\?v=0\.44\.11/);
assert.match(vdeHtml, /design-system\.css\?v=0\.44\.11/);
assert.match(vdeHtml, /app\.js\?v=0\.44\.11/);
assert.match(vdeStyles, /\.distribution-card/);
assert.match(vdeStyles, /\.circuit-evaluation--bad/);
assert.match(vdeApp, /fuse_nh/);
assert.match(vdeApp, /fuse_diazed/);
assert.match(vdeApp, /fuse_neozed/);
assert.match(vdeApp, /measurements\.rcdTripTime/);
assert.match(vdeApp, /measurements\.rcdTripCurrent/);
assert.match(vdeApp, /measurements\.zi/);
assert.match(vdeApp, /measurements\.zs/);
assert.match(vdeApp, /measurements\.ik/);
assert.match(vdeApp, /moveItem\(protocol\.distributions/);
assert.match(vdeApp, /mapLegacyV15/);
assert.match(vdeApp, /vde-protokoll-v15-sichtbarkeit-reihenfolge/);
assert.match(vdeApp, /originalPdf/);
assert.match(platformHtml, /id="platform-navigation"/);
assert.match(platformHtml, /design-system\.css\?v=0\.44\.11/);
assert.equal(
  [...platformHtml.matchAll(/data-platform-view=/g)].length,
  14,
  "Die Plattformverwaltung besitzt genau ihre vierzehn getrennten Hauptbereiche"
);
for (const gruppe of ["tenants", "operations", "governance"]) {
  assert.match(platformHtml, new RegExp(`data-platform-group-label="${gruppe}"`));
  assert.match(platformHtml, new RegExp(`data-platform-group="${gruppe}"`));
}
assert.match(platformApp, /function updateNavigationGroups\(\)/);
assert.match(platformApp, /label\.hidden = !hasVisibleEntry/);
assert.match(platformStyles, /\.platform-navigation__group \{/);
assert.match(platformHtml, /data-platform-view="overview"/);
assert.match(platformHtml, /data-platform-view="settings"/);
assert.doesNotMatch(platformHtml, />Woche</);
assert.doesNotMatch(platformHtml, />Einsätze</);
assert.match(platformHtml, /id="support-mode-banner"/);
assert.match(platformStyles, /env\(safe-area-inset-bottom\)/);
assert.match(styles, /\.site-choice-dialog[\s\S]*var\(--site-choice-viewport-height, 100dvh\)/);
assert.match(styles, /\.time-correction-form[\s\S]*overflow-y: auto/);
assert.match(styles, /\.site-choice-new-form > \.button[\s\S]*position: sticky/);
assert.match(styles, /scroll-padding-block: 92px calc\(110px \+ env\(safe-area-inset-bottom\)\)/);
assert.match(platformApp, /\/api\/v1\/platform\//);
assert.doesNotMatch(
  platformApp,
  /Laufende Baustellen|Arbeitszeiten|Bautagesberichte|Montageberichte|Einsatzpläne|Urlaubsstände|Projektkennzahlen/,
  "Das Plattformdashboard darf keine operativen Firmenkennzahlen definieren"
);
assert.match(platformApp, /X-Support-Access-Id/);
assert.match(platformApp, /Administratoransicht – Firma:/);
assert.match(platformApp, /platform_module_administration_required|modules\/\$\{encodeURIComponent/);
assert.match(html, /id="next-holiday-card"/);
assert.match(html, /Alle Feiertage anzeigen/);
assert.match(html, /id="archived-employee-panel"/);
assert.match(app, /breakMinutesOverride/);
assert.match(app, /window\.visualViewport/);
assert.match(app, /Deine Eingaben bleiben erhalten/);
assert.match(app, /firstInvalid\.scrollIntoView/);
assert.match(app, /siteChoiceDialog\.addEventListener\("focusin"/);
assert.match(app, /correctingTimeEntryAdministrator \? "admin\/" : ""/);
assert.match(app, /\/api\/v1\/admin\/work-days\/\$\{encodeURIComponent\(day\.id\)\}/);
assert.match(worker, /requestUrl\.pathname\.startsWith\("\/api\/"\)/);
assert.match(worker, /event\.request\.mode === "navigate"/);
assert.match(worker, /cache: "no-store"/);
assert.match(refreshHtml, /Schäfchen wird erneuert/);
assert.match(refreshScript, /serviceWorker\.getRegistrations/);
assert.match(refreshScript, /key\.startsWith\("schaefchen-"\)/);
assert.doesNotMatch(refreshScript, /localStorage|indexedDB/,
  "Die Cache-Aktualisierung darf lokale Offline-Fachdaten nicht löschen");

// Die Baustellenakte liegt im Bereich "Baustellen". Wird sie von woanders
// geoeffnet - aus der Berichtszentrale, aus der Suche, vom Dashboard -, muss
// der Bereich mitwechseln, sonst geht die Akte in einem unsichtbaren Bereich
// auf und der Knopf scheint nichts zu tun. Der Wechsel gehoert deshalb in
// openSiteDashboard selbst und nicht zu jedem einzelnen Aufrufer.
assert.match(
  app,
  /function openSiteDashboard\(site\) \{\s*if \(currentDashboardPane !== "sites"\) showDashboardPane\("sites", false\);/,
  "openSiteDashboard muss selbst in den Bereich \"Baustellen\" wechseln"
);
assert.match(styles, /\.site-dashboard \{[\s\S]*?scroll-margin-top: 88px/);

// Freigegebene Bereiche muessen waehrend einer laufenden Sitzung nachgezogen
// werden. Ohne das sah eine Firma einen in der Plattformverwaltung
// freigeschalteten Bereich erst nach einem vollstaendigen Neuladen - auf einem
// Telefon mit eingerichteter App also praktisch nie. Genau so ist der Fuhrpark
// gemeldet worden: eingeschaltet, und trotzdem nicht da.
assert.match(app, /async function refreshModuleAccess\(\)/);
assert.match(app, /neueSitzung = \(await requestJson\("\.\/api\/v1\/session"\)\)\.session/);
assert.match(app, /sessionAccessSignature\(neueSitzung\) === sessionAccessSignature\(session\)/);
assert.match(app, /session = neueSitzung/);
assert.doesNotMatch(
  app,
  /session = \{ \.\.\.session, modules: neue \}/,
  "Eine laufende Sitzung darf Rollenänderungen nicht verwerfen"
);
assert.match(app, /document\.addEventListener\("visibilitychange"[\s\S]{0,140}refreshModuleAccess\(\)/);
assert.match(app, /setInterval\(\(\) => void refreshModuleAccess\(\), 300000\)/);
// Der Stand der Bereiche haengt nicht mehr an showDashboard: die Leiste muss
// sich auch dann neu ausrichten koennen, wenn die Anmeldung laengst vorbei ist.
assert.match(
  app,
  /function applyNavigationAccess\(\)[\s\S]*?navVehicles\.hidden = !planner \|\| !moduleEnabled\("fleet"\)[\s\S]*?function setSidebarCollapsed\(/
);
assert.match(app, /function showDashboard\(\)[\s\S]{0,240}applyNavigationAccess\(\);/);
// Wer in einem Bereich steht, der gerade abgeschaltet wurde, darf dort nicht
// bleiben - der Bildschirm waere noch da, die Schnittstelle schon gesperrt.
assert.match(app, /if \(aktuellerKnopf\?\.hidden\) showDashboardPane\("start", false\);/);

// Das Dokument fordert eine bestimmte Fassung von app.js an. Der Dienst-Worker
// darf im Notfall eine aeltere derselben Datei liefern - dann laeuft neues
// Geruest mit alter Anwendung oder umgekehrt. Das sieht nicht kaputt aus, es
// fehlt nur etwas, und man sucht den Fehler in der Fachlichkeit, wo keiner ist.
assert.match(app, /new URL\(import\.meta\.url\)\.searchParams\.get\("v"\)/);
assert.match(app, /async function pruefeEigeneFassung\(\)/);
assert.match(app, /if \(!ANGEFORDERTE_FASSUNG \|\| ANGEFORDERTE_FASSUNG === EIGENE_FASSUNG\) return false;/);
// Einmal aufraeumen und neu laden - nicht endlos. Liefert der Server selbst
// noch die alte Datei aus, waere ein zweiter Versuch eine Schleife.
assert.match(app, /schaefchen-fassungsbruch/);
assert.match(app, /if \(schonVersucht === ANGEFORDERTE_FASSUNG\)/);
assert.match(app, /if \(await pruefeEigeneFassung\(\)\) return;/);
// Solange die Zahl nicht geladen ist, darf dort keine stehen: jede waere eine
// Behauptung ueber den Urlaubsanspruch eines Menschen.
assert.match(html, /id="overview-account-vacation"[^>]*>–</);

// Kennzahlen, Tagesuebersicht und Schnellzugriff haengen alle an der
// Betriebsuebersicht. Ist sie nicht da, stehen alle drei auf "versteckt" - die
// Startseite ist dann vollstaendig leer und sieht beim Laden genauso aus wie
// nach einem Fehler. Ein Netzfehler blieb dabei sogar stumm.
assert.match(html, /id="dashboard-loading"[^>]*data-dashboard-pane="start"/);
assert.match(html, /id="dashboard-loading-retry"/);
assert.match(app, /function renderDashboardLoading\(\)/);
assert.match(app, /Die Betriebsübersicht konnte nicht geladen werden\./);
assert.match(app, /Die Betriebsübersicht dauert länger als üblich\./);
assert.match(app, /adminOverviewStatus = "failed";\s*\n\s*renderDashboardLoading\(\);/);
assert.match(app, /dashboardLoadingRetry\.addEventListener\("click"/);
assert.match(styles, /\.dashboard-loading \{/);

// Kunden und Baustellen fuehren nicht noch einmal eine sichtbare Projektliste.
// Formulare und Schnittstellen fuer vorhandene technische Verknuepfungen
// bleiben bestehen, damit keine Daten oder Altvertraege verloren gehen.
assert.doesNotMatch(html, /id="project-overview-list"/);
assert.doesNotMatch(app, /function renderProjectOverview\(/);
assert.match(html, /id="project-form"/);
assert.match(html, /id="project-edit-form"/);
assert.match(app, /function openProjectEditor\(project\)/);

// Nie sichtbare Verwaltungslisten. Sie wurden bei jedem Aktualisieren und bei
// jedem Tastendruck neu gebaut, ohne dass sie jemand zu sehen bekam - an der
// laufenden App ueber alle Bereiche nachgemessen.
for (const tot of ["site-management-panel", "site-list", "customer-list", "project-list"]) {
  assert.doesNotMatch(
    html,
    new RegExp(`id="${tot}"`),
    `${tot} war nie sichtbar und darf nicht zurueckkommen`
  );
}
assert.doesNotMatch(app, /renderSiteList|renderCustomerList|renderProjectList\b/);

// Jeder abschaltbare Bereich mit eigenem Bildschirm braucht einen Waechter in
// der Schnittstelle - sonst versteckt die App nur etwas, das der Server weiter
// bedient. Dass die Waechter greifen, prueft der Integrationstest gegen die
// laufende Schnittstelle; hier steht nur der Anspruch, damit der naechste
// Eintrag in MODULBEREICHE nicht ohne ihn dazukommt.
assert.match(app, /jeden Eintrag hier muss es einen Waechter in der Schnittstelle geben/);

// Montageberichte und Bautagesberichte sind zwei getrennte Bereiche im
// Katalog: ein Betrieb kann den einen fuehren und den anderen nicht. Die
// Auswahl bot bisher immer beide an. Wer den falschen nahm, merkte es erst
// nach dem Speichern - und hatte Titel, Leistungen, Stunden und Fotos umsonst
// eingetragen.
assert.match(app, /const BERICHTSARTEN = \[/);
assert.match(app, /\["montage", "Montageschein", "assembly_reports"\]/);
assert.match(app, /\["daily", "Bautagesbericht", "site_daily_reports"\]/);
assert.match(app, /function verfuegbareBerichtsarten\(\)/);
assert.match(app, /select\.disabled = arten\.length < 2;/);
assert.match(app, /fuelleBerichtsarten\(elements\.mobileReportType/);
// Die Witterung gehoert zum Bautagesbericht. Der Server verwirft sie beim
// Montageschein - sichtbar blieb das Feld trotzdem, und der Eintrag
// verschwand beim Speichern ohne ein Wort.
assert.match(html, /id="site-report-weather-field"/);
assert.match(app, /function updateSiteReportTypeFields\(\)/);
assert.match(app, /siteReportType\.addEventListener\("change", updateSiteReportTypeFields\)/);

// Die Baustellenakte des Vorarbeiters war fast ganz zum Ansehen: nur Fotos und
// Notizen liessen sich anlegen. Material konnte er sehen, aber nicht
// eintragen - dabei sieht er als Erster, was fehlt. Und einen Bericht schreiben
// ging nur ueber die Startseite, obwohl er auf der Baustelle steht, um die es
// geht.
assert.match(html, /id="employee-site-material-add"/);
assert.match(html, /id="employee-site-material-form"/);
assert.match(html, /id="employee-site-report-write"/);
assert.match(app, /async function createEmployeeSiteMaterial\(\)/);
assert.match(app, /async function updateEmployeeSiteMaterial\(material, status, button\)/);
assert.match(app, /function employeeSiteMaterialAction\(material\)/);
assert.match(app, /construction-sites\/\$\{encodeURIComponent\(employeeSiteState\.site\.id\)\}\/materials/);
// Die Staende, die es wirklich gibt - die Auswahl darf keinen erfinden, den
// die Schnittstelle nicht kennt.
for (const stand of ["planned", "ordered", "available", "used"]) {
  assert.match(
    html,
    new RegExp(`<option value="${stand}">`),
    `Der Materialstand ${stand} fehlt in der Auswahl`
  );
}

assert.match(uiSpecification, /keine echte\s+Serveranmeldung/i);
assert.match(uiSpecification, /keine GPS-Abfrage/i);

console.log("PWA-Smoke-Test erfolgreich.");
