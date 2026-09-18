import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Diese drei Seiten sind eigenstaendig (kein SPA-Rahmen, keine styles.css) und
// werden trotzdem aus der Hauptanwendung heraus geoeffnet. Die Tests hier
// pruefen genau die Naht: den Rueckweg, die wiederverwendeten
// Designsystem-Klassen statt eigener Werte, den Fokusring und die
// Feld-Fehlermeldungen, die im Zuge dieser Aenderung entstanden sind.

const frontendDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const lies = (datei) => readFile(resolve(frontendDirectory, datei), "utf8");

// Entfernt CSS-Kommentare, ohne Zeilennummern zu verschieben (wie in
// styles.test.mjs), damit Beispielwerte in Begruendungstexten (z. B. "#d90917")
// keine Regel vortaeuschen.
function ohneKommentare(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, (treffer) => treffer.replace(/[^\n]/g, " "));
}

test("Von inventory.html und absence-approvals.html führt ein Verweis zurück in die Arbeitsapp", async () => {
  // Vorher gab es diesen Verweis zwar schon als eigene ".inv-back"/".aa-back"-
  // Klasse; die Absicherung hier bindet ihn bewusst an die wiederverwendete
  // Designsystem-Klasse ".text-button", damit er nicht wieder in eine eigene,
  // abweichend gestaltete Klasse zurückrutscht.
  for (const [datei, ziel] of [["inventory.html", "./"], ["absence-approvals.html", "./#week"]]) {
    const html = await lies(datei);
    assert.match(
      html,
      new RegExp(`<a class="text-button" href="${ziel.replace(".", "\\.")}"[^>]*>[^<]*Arbeitsapp`),
      `${datei}: kein Rückweg über .text-button zur Arbeitsapp`
    );
  }
});

test("Lagerstruktur und Abwesenheiten zeigen Titel, Erklärung und Aktionen im selben Seitenkopf wie die Hauptanwendung", async () => {
  // ".page-heading" ist die Komponente, mit der die Hauptanwendung ihre
  // eigenen Seiten überschreibt (siehe #time-page-heading in index.html) -
  // Titel/Erklärung links, Aktionen rechts. Vorher hatten beide Seiten dafür
  // eigene, nur ähnliche Bausteine (".inv-intro"/".aa-intro" plus eine
  // getrennte Werkzeugleiste).
  for (const datei of ["inventory.html", "absence-approvals.html"]) {
    const html = await lies(datei);
    const start = html.indexOf('<div class="page-heading');
    assert.ok(start >= 0, `${datei}: kein .page-heading`);
    const ende = html.indexOf('<div class="card', start);
    assert.ok(ende > start, `${datei}: .page-heading endet nicht vor der nächsten Karte`);
    const block = html.slice(start, ende);
    assert.match(block, /<h1>/, `${datei}: .page-heading hat keinen Titel`);
    assert.match(block, /<button[^>]*>[^<]*<\/button>/, `${datei}: .page-heading hat keine Aktion (Knopf)`);
  }
});

test("Jedes Pflichtfeld mit eigener Formatprüfung zeigt seine Meldung am Feld, nicht nur oben in der Sammelzeile", async () => {
  // Mechanisch aus der Quelle abgeleitet statt einer Namensliste: jedes
  // Eingabefeld mit "aria-describedby" muss auf ein tatsächlich vorhandenes
  // Element verweisen, und dieses Element muss eine Feld-Fehlerklasse tragen
  // (".inv-field-error"/".aa-field-error"), keine allgemeine Sammelzeile.
  //
  // Geprueft wird jetzt in index.html: Lagerstruktur und Abwesenheitsfreigabe
  // sind Bereiche der Arbeitsapp geworden, die alten Dateien nur noch
  // Weiterleitungen fuer gesetzte Lesezeichen. Die Regel bleibt dieselbe, sie
  // steht nur an einem anderen Ort - deshalb wird auf die beiden
  // Bereichsabschnitte eingegrenzt: index.html verweist anderswo auch auf
  // reine Hinweistexte, die keine Fehlermeldungen sind und es nicht werden
  // sollen.
  const html = await lies("index.html");
  for (const bereich of ["inventory", "absences"]) {
    const start = html.indexOf(`data-dashboard-pane="${bereich}"`);
    assert.ok(start >= 0, `index.html: kein Bereich data-dashboard-pane="${bereich}"`);
    const ende = html.indexOf("</section>", html.indexOf("</dialog>", start) >= 0
      ? html.indexOf("</dialog>", start)
      : start);
    const block = html.slice(start, ende > start ? ende : html.length);
    const verweise = [...block.matchAll(/aria-describedby="([a-z0-9-]+)"/g)].map((m) => m[1]);
    assert.ok(verweise.length > 0, `Bereich ${bereich}: keine Feld-Verknüpfung über aria-describedby gefunden`);
    for (const id of verweise) {
      const ziel = new RegExp(`id="${id}"[^>]*class="[^"]*field-error[^"]*"|class="[^"]*field-error[^"]*"[^>]*id="${id}"`);
      assert.match(html, ziel, `Bereich ${bereich}: #${id} (per aria-describedby verlinkt) ist keine Feld-Fehlermeldung`);
    }
  }
});

test("Absence-approvals.js prüft Begründung und Direkteintrag am Feld, bevor eine Anfrage rausgeht", async () => {
  const js = await lies("absence-approvals.js");
  assert.match(js, /function validateReason\(\)/);
  assert.match(js, /function validateDirectEntry\(\)/);
  // Beide Prüfungen müssen tatsächlich vor dem Netzwerkaufruf im jeweiligen
  // Absende-Handler stehen, nicht nur irgendwo in der Datei existieren.
  const policySubmit = /\$\('policy-form'\)\.addEventListener\('submit',async event=>\{[\s\S]*?\}\);/.exec(js)[0];
  assert.match(policySubmit, /if\(!validateReason\(\)\)return;/);
  assert.ok(
    policySubmit.indexOf("if(!validateReason()") < policySubmit.indexOf("await request("),
    "Die Feldprüfung der Begründung muss vor der Anfrage laufen"
  );
  const directSubmit = /\$\('direct-form'\)\.addEventListener\('submit',async event=>\{[\s\S]*?\}\);/.exec(js)[0];
  assert.match(directSubmit, /if\(!validateDirectEntry\(\)\)return;/);
  assert.ok(
    directSubmit.indexOf("if(!validateDirectEntry()") < directSubmit.indexOf("await request("),
    "Die Feldprüfung des Direkteintrags muss vor der Anfrage laufen"
  );
});

test("Die Bestätigung vor Freigabe/Ablehnung/Aufhebung nennt Zeitraum und Abwesenheitsart, nicht nur den Namen", async () => {
  // Vorher: "Freigabe aufheben: Antrag von ...?" - das sagt nicht, welcher
  // Zeitraum und welche Art betroffen sind. Mechanisch geprüft: das
  // Textbaustein-Literal vor window.confirm(...) muss beide Platzhalter
  // enthalten.
  const js = await lies("absence-approvals.js");
  const confirmTreffer = /if\(!window\.confirm\(`([^`]*)`\)\)return;\s*busy=true;setRequestsBusy/.exec(js);
  assert.ok(confirmTreffer, "Keine Bestätigung vor der Antragsentscheidung gefunden");
  assert.match(confirmTreffer[1], /\$\{kindLabel\}/, "Die Bestätigung nennt nicht die Abwesenheitsart");
  assert.match(confirmTreffer[1], /\$\{period\}/, "Die Bestätigung nennt nicht den Zeitraum");
});

test("Während eine Antragsentscheidung läuft, sperrt busy auch die Knöpfe der übrigen offenen Anträge", async () => {
  // Der Fehler, den das hier fängt: busy=true blockte zwar zuverlässig eine
  // zweite Anfrage (early return), aber nur der angeklickte Knopf wurde
  // sichtbar deaktiviert - alle anderen Knöpfe blieben anklickbar und
  // reagierten dann kommentarlos nicht.
  const js = await lies("absence-approvals.js");
  // Die Kennung selbst ist bewusst offen ("#...requests"): der Bereich wurde
  // beim Einfalten in die Arbeitsapp auf das Praefix "aa-" umbenannt, weil
  // inventory.js in derselben Seite dieselben kurzen Namen benutzt. Der Test
  // soll die Sperre pruefen, nicht den Namen festnageln.
  assert.match(js, /function setRequestsBusy\(locked\)\s*\{\s*for \(const button of document\.querySelectorAll\('#[a-z-]*requests button'\)\) button\.disabled = locked/);
  const handler = /button\.addEventListener\('click',async\(\)=>\{[\s\S]*?\}\);card\.append\(button\);/.exec(js)[0];
  assert.match(handler, /busy=true;setRequestsBusy\(true\);/, "Beim Start der Entscheidung werden nicht alle Antragsknöpfe gesperrt");
  assert.match(handler, /catch\(error\)\{[^}]*setRequestsBusy\(false\)/, "Nach einem Fehler werden die übrigen Antragsknöpfe nicht wieder freigegeben");
});

test("Platform-admin.js sperrt Anmelde- und Einrichtungsknopf während der Anfrage", async () => {
  // Fehlte bisher, obwohl app.js das für die Hauptanmeldung schon lange tut
  // (elements.loginSubmit.disabled). Ein zweiter Klick während der ersten
  // Anfrage schickte sonst eine zweite Anmeldung los.
  const js = await lies("platform-admin.js");
  // Zwischen dem Beginn eines Handlers und dem Beginn des naechsten
  // ausschneiden - eine nicht-gierige Suche nach "});" bricht vorher ab, weil
  // dieselbe Zeichenfolge schon im JSON.stringify(...)-Aufruf mitten im
  // try-Block vorkommt.
  const abschnitt = (start, endeMarke) => js.slice(js.indexOf(start), js.indexOf(endeMarke, js.indexOf(start)));
  const loginHandler = abschnitt('elements.loginForm.addEventListener', 'elements.setupForm.addEventListener');
  assert.match(loginHandler, /if \(elements\.loginSubmit\.disabled\) return;/);
  assert.match(loginHandler, /elements\.loginSubmit\.disabled = true;/);
  assert.match(loginHandler, /finally \{ elements\.loginSubmit\.disabled = false; \}/);

  const setupHandler = abschnitt('elements.setupForm.addEventListener', 'elements.navigation.addEventListener');
  assert.match(setupHandler, /if \(elements\.setupSubmit\.disabled\) return;/);
  assert.match(setupHandler, /elements\.setupSubmit\.disabled = true;/);
  assert.match(setupHandler, /finally \{ elements\.setupSubmit\.disabled = false; \}/);
});

test("Formularfelder in platform-admin.css behalten einen sichtbaren Fokusring statt ihn zu unterdrücken", async () => {
  // "outline: none" auf .platform-form-Feldern hat den ":focus-visible"-Ring
  // aus design-system.css vollständig unterdrückt, weil design-system.css ihn
  // ueber :where(...) mit Spezifitaet 0 setzt und jede unbedingte Regel dort
  // gewinnt - unabhaengig von der Ladereihenfolge der Dateien.
  const css = ohneKommentare(await lies("platform-admin.css"));
  assert.doesNotMatch(css, /outline\s*:\s*none/, "platform-admin.css unterdrückt den Fokusring wieder");
});

test("Platform-admin.css legt außer dem bereits im Designsystem verwendeten Weiß keine eigenen Hex-Farbwerte mehr fest", async () => {
  // Mechanisch statt als Liste: jeder Hex-Farbwert in platform-admin.css
  // (außerhalb von Kommentaren) muss auch in design-system.css vorkommen -
  // das schließt eine neue, nur hier definierte Tönung aus, ohne jeden
  // einzelnen früheren Wert von Hand aufzuzählen.
  const platformCss = ohneKommentare(await lies("platform-admin.css"));
  const designSystemCss = await lies("design-system.css");
  const eigeneHexWerte = [...new Set(platformCss.match(/#[0-9a-fA-F]{3,8}\b/g) || [])];
  assert.ok(eigeneHexWerte.length > 0, "Test greift nicht mehr - es gibt gar keine Hex-Farbwerte mehr zu prüfen");
  const unbekannt = eigeneHexWerte.filter((wert) => !designSystemCss.includes(wert));
  assert.deepEqual(unbekannt, [], `Neue, nur hier definierte Farbwerte: ${unbekannt.join(", ")}`);
});

test("Der Editor-Dialog in inventory.html bleibt bei niedriger Fensterhöhe innerhalb des sichtbaren Bereichs", async () => {
  // Ohne eine an die Fensterhöhe gebundene Obergrenze kann der Dialog bei
  // 720px Fensterhöhe höher werden als der Bildschirm - die Speichern-Schaltfläche
  // liegt dann unterhalb des sichtbaren Bereichs und ist nicht erreichbar.
  const css = ohneKommentare(await lies("inventory.css"));
  const dialogRegel = /\.inv-dialog\s*\{[^}]*\}/.exec(css);
  assert.ok(dialogRegel, ".inv-dialog hat keine eigene Regel mehr");
  assert.match(dialogRegel[0], /max-height:\s*min\([^)]*vh[^)]*\)/, ".inv-dialog begrenzt seine Höhe nicht an der Fensterhöhe");
  const formRegel = /\.inv-form\s*\{[^}]*\}/.exec(css);
  assert.ok(formRegel, ".inv-form hat keine eigene Regel mehr");
  assert.match(formRegel[0], /overflow-y:\s*auto/, ".inv-form kann bei zu wenig Höhe nicht selbst scrollen");
});
