// Lagerverwaltung: die Verdrahtung zwischen Ablauflogik und Browser.
//
// Die Entscheidungen stehen in `stock-management.js` und sind ohne Browser
// pruefbar. Hier steht nur, was ohne DOM nicht geht: Ereignisse abgreifen,
// die API fragen, Kamera aufmachen, Etikettenbogen drucken. Wer eine Regel
// sucht - wie viel eine Packung bucht, wer was darf, was nach einer Buchung
// zu sehen ist -, findet sie nicht hier, sondern dort.
//
// Das Geraetemodul ist das Vorbild fuer den Zuschnitt: `setEnabled`,
// `refresh`, `clear` und `render` nach aussen, alles andere innen.

import {
  SCHRITTE,
  ansichtFuer,
  artikelEntwurfAusScan,
  artikelFormularLesen,
  buchungBauen,
  buchungVerarbeiten,
  codeNachtragLesen,
  eingangVorbelegen,
  etikettBogenHtml,
  inventurScanVerarbeiten,
  lagerZustand,
  leereCodezeile,
  mengeAlsText,
  mengeAusText,
  scanVerarbeiten,
  wareneingangBauen,
  zaehlungBauen
} from "./stock-management.js?v=0.44.11";
import {
  erkennungWaehlen,
  gtinNormalisieren,
  scanDeuten,
  scanSchleifeStarten
} from "./barcode-scanner.mjs?v=0.44.11";

const html = `
  <div class="stock-module">
    <div class="stock-view"></div>

    <dialog class="stock-scan-dialog" aria-label="Code scannen">
      <div class="stock-scan-shell">
        <video class="stock-scan-video" playsinline muted></video>
        <p class="stock-scan-message" aria-live="polite"></p>
        <form class="stock-scan-manual">
          <label class="stock-field">
            <span>Code von Hand eingeben</span>
            <input class="stock-scan-value" type="text" inputmode="text" autocomplete="off"
                   placeholder="Strichcode oder Lagerplatz">
          </label>
          <button class="button button--action" type="submit">Übernehmen</button>
        </form>
        <label class="stock-field">
          <span>Oder ein Foto des Codes</span>
          <input class="stock-scan-image" type="file" accept="image/*" capture="environment">
        </label>
        <button class="button button--quiet stock-scan-close" type="button">Schließen</button>
      </div>
    </dialog>
  </div>`;

/**
 * Ein Lagerplatz muss gesetzt sein, bevor gebucht wird - sonst weiss niemand,
 * wo die Ware liegt. Wer keinen Platz gescannt hat, bekommt den Vorgabeplatz
 * der Firma; das ist in den allermeisten Betrieben das Materiallager.
 */
export function vorgabeOrt(kontext) {
  const orte = kontext?.locations || [];
  if (!orte.length) return null;
  const vorgabe = kontext?.settings?.defaultLocationId;
  return orte.find((ort) => ort.id === vorgabe) || orte[0];
}

/** Aus dem Tagesplan des Monteurs werden die Baustellen der Auswahlliste. */
export function baustellenAusEinsaetzen(einsaetze = []) {
  const gesehen = new Set();
  const baustellen = [];
  for (const einsatz of einsaetze) {
    const baustelle = einsatz?.constructionSite;
    if (!baustelle?.id || gesehen.has(baustelle.id)) continue;
    gesehen.add(baustelle.id);
    baustellen.push({ id: baustelle.id, name: baustelle.name || "Ohne Namen" });
  }
  return baustellen;
}

export function createStockModule({
  root,
  requestJson,
  showToast,
  getSites = () => [],
  fenster = window
}) {
  root.innerHTML = html;
  const q = (selector) => root.querySelector(selector);
  const elements = {
    view: q(".stock-view"),
    scanDialog: q(".stock-scan-dialog"),
    scanVideo: q(".stock-scan-video"),
    scanMessage: q(".stock-scan-message"),
    scanForm: q(".stock-scan-manual"),
    scanValue: q(".stock-scan-value"),
    scanImage: q(".stock-scan-image"),
    scanClose: q(".stock-scan-close")
  };

  let enabled = false;
  let geladen = false;
  let kontext = { groups: [], locations: [], settings: {}, permissions: {} };
  let zustand = lagerZustand();
  let bestand = [];
  let artikel = [];
  let vorschlaege = [];
  let bestellungen = [];
  let scanZiel = "buchen";
  let strom = null;
  let schleife = null;

  const rechte = () => kontext.permissions || {};
  const optionen = () => ({
    baustellen: getSites(),
    baustellePflicht: Boolean(kontext.settings?.requireSiteOnIssue),
    bestand,
    artikel,
    vorschlaege,
    bestellungen,
    gruppen: kontext.groups || []
  });

  function melden(fehler) {
    // Ein Fehler gehoert in die Ansicht und nicht nur in eine Kurzmeldung:
    // wer im Lager steht, sieht den Toast vielleicht nicht mehr.
    zustand = { ...zustand, fehler: fehler?.message || String(fehler) };
    render();
  }

  async function laden(pfad) {
    return requestJson(`./api/v1/stock${pfad}`);
  }

  async function senden(pfad, koerper) {
    return requestJson(`./api/v1/stock${pfad}`, {
      method: "POST",
      body: JSON.stringify(koerper || {})
    });
  }

  async function refresh() {
    if (!enabled) return;
    try {
      const antwort = await laden("/contexts");
      kontext = antwort.context;
      geladen = true;
      if (!zustand.ort) zustand = { ...zustand, ort: vorgabeOrt(kontext) };
      render();
    } catch (fehler) {
      geladen = false;
      melden(fehler);
    }
  }

  async function listeLaden(schritt) {
    if (schritt === SCHRITTE.BESTAND) {
      bestand = (await laden("/levels")).levels;
    } else if (schritt === SCHRITTE.ARTIKEL) {
      artikel = (await laden("/items")).items;
    } else if (schritt === SCHRITTE.NACHBESTELLUNG) {
      vorschlaege = (await laden("/reorder")).suggestions;
    } else if (schritt === SCHRITTE.BESTELLUNGEN) {
      bestellungen = (await laden("/orders")).orders;
    } else if (schritt === SCHRITTE.INVENTUR) {
      const offen = (await laden("/inventory")).sessions
        .find((sitzung) => sitzung.status === "open" && sitzung.locationId === zustand.ort?.id);
      zustand = {
        ...zustand,
        inventur: offen ? await laden(`/inventory/${encodeURIComponent(offen.id)}`) : null,
        zaehlArtikel: null
      };
    }
  }

  async function zeigen(schritt) {
    try {
      await listeLaden(schritt);
      zustand = { ...zustand, schritt, fehler: null };
      render();
    } catch (fehler) {
      melden(fehler);
    }
  }

  function render() {
    if (!geladen) {
      elements.view.innerHTML = zustand.fehler
        ? `<p class="stock-error" role="alert">${zustand.fehler}</p>`
        : '<p class="stock-empty">Das Lager wird geladen …</p>';
      return;
    }
    elements.view.innerHTML = ansichtFuer(zustand, rechte(), optionen());
    verdrahten();
  }

  // -------------------------------------------------------------------------
  // Scannen
  // -------------------------------------------------------------------------

  async function scanAufloesen(rohwert) {
    const gedeutet = scanDeuten(rohwert);
    const code = gedeutet?.wert || String(rohwert || "").trim();
    if (!code) return;

    try {
      const { scan } = await senden("/scan", { code });
      if (scanZiel === "inventur") {
        zustand = inventurScanVerarbeiten(zustand, scan);
      } else if (scanZiel === "code") {
        zustand = { ...zustand, codeEntwurf: { code, packQuantity: "1" }, fehler: null };
      } else {
        zustand = scanVerarbeiten(zustand, scan);
      }
      scannerSchliessen();
      render();
    } catch (fehler) {
      elements.scanMessage.textContent = fehler.message;
    }
  }

  async function kameraStarten() {
    if (!fenster.navigator?.mediaDevices?.getUserMedia) {
      elements.scanMessage.textContent =
        "Dieser Browser gibt keine Kamera frei. Der Code lässt sich als Foto oder von Hand eingeben.";
      return;
    }
    try {
      strom = await fenster.navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } }, audio: false
      });
      elements.scanVideo.srcObject = strom;
      await elements.scanVideo.play();
      elements.scanMessage.textContent = "Code vor die Kamera halten.";

      const leser = await erkennungWaehlen({ fenster });
      const leinwand = fenster.document.createElement("canvas");
      const stift = leinwand.getContext("2d", { willReadFrequently: true });

      schleife = scanSchleifeStarten({
        rahmenHolen: () => {
          const video = elements.scanVideo;
          if (!video.videoWidth) return null;
          leinwand.width = video.videoWidth;
          leinwand.height = video.videoHeight;
          stift.drawImage(video, 0, 0, leinwand.width, leinwand.height);
          return {
            bild: video,
            bildDaten: stift.getImageData(0, 0, leinwand.width, leinwand.height)
          };
        },
        leser,
        onTreffer: (gedeutet, rohwert) => void scanAufloesen(rohwert),
        planen: (fn) => fenster.requestAnimationFrame
          ? fenster.requestAnimationFrame(() => fn())
          : setTimeout(fn, 60)
      });
    } catch (fehler) {
      elements.scanMessage.textContent = kameraFehlerText(fehler);
    }
  }

  function scannerOeffnen(ziel = "buchen") {
    scanZiel = ziel;
    elements.scanValue.value = "";
    elements.scanMessage.textContent = "";
    elements.scanDialog.showModal();
    void kameraStarten();
  }

  function scannerSchliessen() {
    schleife?.stoppen();
    schleife = null;
    if (strom) {
      strom.getTracks().forEach((spur) => spur.stop());
      strom = null;
    }
    elements.scanVideo.srcObject = null;
    if (elements.scanDialog.open) elements.scanDialog.close();
  }

  async function fotoLesen(datei) {
    if (!datei) return;
    elements.scanMessage.textContent = "Das Foto wird gelesen …";
    try {
      const bild = await fenster.createImageBitmap(datei);
      const leinwand = fenster.document.createElement("canvas");
      leinwand.width = bild.width;
      leinwand.height = bild.height;
      const stift = leinwand.getContext("2d", { willReadFrequently: true });
      stift.drawImage(bild, 0, 0);
      const leser = await erkennungWaehlen({ fenster });
      const rohwert = await leser.lesen({
        bild,
        bildDaten: stift.getImageData(0, 0, leinwand.width, leinwand.height)
      });
      if (!rohwert) {
        elements.scanMessage.textContent =
          "Auf dem Foto war kein Code zu erkennen. Näher heran und gerade halten.";
        return;
      }
      await scanAufloesen(rohwert);
    } catch (fehler) {
      elements.scanMessage.textContent = fehler.message;
    }
  }

  // -------------------------------------------------------------------------
  // Etiketten
  // -------------------------------------------------------------------------

  async function etikettenDrucken(ziele) {
    try {
      const { labels } = await senden("/labels/sheet", { targets: ziele });
      const blatt = fenster.open("", "_blank");
      if (!blatt) {
        melden(new Error("Der Browser hat das Druckfenster blockiert."));
        return;
      }
      blatt.document.write(etikettBogenHtml(labels));
      blatt.document.close();
    } catch (fehler) {
      melden(fehler);
    }
  }

  // -------------------------------------------------------------------------
  // Ereignisse
  // -------------------------------------------------------------------------

  function verdrahten() {
    const wurzel = elements.view;
    const auf = (auswahl, ereignis, fn) => {
      wurzel.querySelectorAll(auswahl).forEach((knoten) => knoten.addEventListener(ereignis, fn));
    };

    auf(".stock-scan", "click", () => scannerOeffnen(
      zustand.schritt === SCHRITTE.INVENTUR ? "inventur" : "buchen"
    ));
    auf(".stock-code-scan", "click", () => scannerOeffnen("code"));
    auf(".stock-place", "click", () => void ortWaehlen());
    auf(".stock-cancel, .stock-home", "click", () => {
      zustand = lagerZustand({ ort: zustand.ort });
      render();
    });

    const feld = wurzel.querySelector(".stock-amount__input");
    feld?.addEventListener("input", () => { zustand.menge = feld.value; });
    auf(".stock-amount__step", "click", (ereignis) => {
      const jetzt = mengeAusText(zustand.menge) ?? 0;
      const schritt = Number(ereignis.currentTarget.dataset.schritt)
        * (zustand.gebinde > 1 ? zustand.gebinde : 1);
      const neu = Math.max(0, Math.round((jetzt + schritt) * 1000) / 1000);
      zustand.menge = neu > 0 ? mengeAlsText(neu) : "";
      if (feld) feld.value = zustand.menge;
    });

    auf(".stock-site__select", "change", (ereignis) => {
      zustand.baustelleId = ereignis.target.value || null;
    });

    auf(".stock-do", "click", (ereignis) => void buchen(ereignis.currentTarget.dataset.vorgang));

    auf(".stock-tile", "click", (ereignis) => {
      const ziele = {
        bestand: SCHRITTE.BESTAND,
        artikel: SCHRITTE.ARTIKEL,
        nachbestellung: SCHRITTE.NACHBESTELLUNG,
        inventur: SCHRITTE.INVENTUR,
        bestellungen: SCHRITTE.BESTELLUNGEN
      };
      void zeigen(ziele[ereignis.currentTarget.dataset.ziel] || SCHRITTE.START);
    });

    auf(".stock-create", "click", () => {
      zustand = {
        ...zustand,
        schritt: SCHRITTE.ARTIKEL_NEU,
        entwurf: artikelEntwurfAusScan(zustand.letzterScan, kontext.groups),
        fehler: null
      };
      render();
    });
    auf(".stock-new", "click", () => {
      zustand = { ...zustand, schritt: SCHRITTE.ARTIKEL_NEU, entwurf: { unit: "Stück" }, fehler: null };
      render();
    });
    auf(".stock-save", "click", () => void artikelSpeichern());
    auf(".stock-code-row-add", "click", () => {
      const codes = [...wurzel.querySelectorAll('[name="code"]')].map((eingabe, index) => ({
        code: eingabe.value,
        packQuantity: wurzel.querySelectorAll('[name="packQuantity"]')[index]?.value ?? 1,
        codeType: "internal",
        isPrimary: index === 0
      }));
      zustand = { ...zustand, entwurf: { ...zustand.entwurf, barcodes: [...codes, leereCodezeile()] } };
      render();
    });

    auf(".stock-codes-open", "click", () => void codesOeffnen());
    auf(".stock-code-save", "click", () => void codeSpeichern());
    auf(".stock-code-revoke", "click", (ereignis) => void codeZuruecknehmen(
      ereignis.currentTarget.dataset.code
    ));
    auf(".stock-label-print", "click", () => void etikettenDrucken([
      { targetType: "item", id: zustand.artikel.id }
    ]));

    auf(".stock-inventory-start", "click", () => void inventurStarten());
    auf(".stock-count__input", "input", (ereignis) => { zustand.menge = ereignis.target.value; });
    auf(".stock-count-save", "click", () => void zaehlungSpeichern());
    auf(".stock-inventory-done", "click", () => void inventurAbschliessen());
    auf(".stock-inventory-cancel", "click", () => void inventurAbbrechen());

    auf(".stock-order-from-reorder", "click", () => void bestellungAusVorschlag());
    auf(".stock-order-send", "click", () => void bestellungSenden());
    auf(".stock-order__input", "input", (ereignis) => {
      zustand.eingang = {
        ...(zustand.eingang || {}),
        [ereignis.currentTarget.dataset.position]: ereignis.currentTarget.value
      };
    });
    auf(".stock-order-receive", "click", () => void wareneingangBuchen());
    auf(".stock-order-cancel", "click", () => void bestellungStornieren());

    auf(".stock-row--tap", "click", (ereignis) => {
      const zeile = ereignis.currentTarget;
      if (zeile.dataset.bestellung) return void bestellungOeffnen(zeile.dataset.bestellung);
      if (zeile.dataset.artikel) return void artikelOeffnen(zeile.dataset.artikel);
      return undefined;
    });
  }

  // -------------------------------------------------------------------------
  // Vorgaenge
  // -------------------------------------------------------------------------

  async function ortWaehlen() {
    // Ohne Scanner: der Reihe nach durch die Lagerplaetze der Firma. Das ist
    // am Rechner der schnellste Weg und auf dem Telefon der Notnagel.
    const orte = kontext.locations || [];
    if (orte.length < 2) return;
    const jetzt = orte.findIndex((ort) => ort.id === zustand.ort?.id);
    const naechster = orte[(jetzt + 1) % orte.length];
    zustand = { ...zustand, ort: naechster, hinweis: `Lagerplatz gesetzt: ${naechster.path || naechster.name}` };
    render();
  }

  async function buchen(vorgang) {
    zustand = { ...zustand, vorgang };
    if (vorgang === "umlagerung" && !zustand.zielOrtId) {
      zustand.zielOrtId = (kontext.locations || [])
        .find((ort) => ort.id !== zustand.ort?.id)?.id || null;
    }
    const { buchung, fehler } = buchungBauen(zustand, optionen());
    if (fehler) return melden(new Error(fehler));

    try {
      const antwort = await senden("/movements", buchung);
      zustand = buchungVerarbeiten(zustand, antwort);
      render();
    } catch (weg) {
      melden(weg);
    }
    return undefined;
  }

  async function artikelSpeichern() {
    const wurzel = elements.view;
    const werte = {};
    wurzel.querySelectorAll("[name]:not([data-code-index])").forEach((eingabe) => {
      werte[eingabe.name] = eingabe.value;
    });

    const codeFelder = [...wurzel.querySelectorAll('[name="code"][data-code-index]')];
    const packFelder = [...wurzel.querySelectorAll('[name="packQuantity"][data-code-index]')];
    werte.barcodes = codeFelder.map((eingabe, index) => ({
      code: eingabe.value,
      packQuantity: packFelder[index]?.value ?? 1,
      codeType: gtinNormalisieren(eingabe.value) ? "gtin" : "internal",
      isPrimary: index === 0
    })).filter((zeile) => zeile.code.trim());

    const { entwurf, fehler } = artikelFormularLesen(werte);
    if (fehler) {
      zustand = { ...zustand, entwurf: { ...zustand.entwurf, ...werte }, fehler };
      render();
      return;
    }

    try {
      await senden("/items", entwurf);
      showToast("Artikel angelegt.");
      await zeigen(SCHRITTE.ARTIKEL);
    } catch (weg) {
      zustand = { ...zustand, entwurf: { ...zustand.entwurf, ...werte } };
      melden(weg);
    }
  }

  async function artikelOeffnen(itemId) {
    try {
      const antwort = await laden(`/items/${encodeURIComponent(itemId)}`);
      zustand = scanVerarbeiten(zustand, {
        found: true, kind: "item", packQuantity: 1, item: antwort.item, levels: antwort.levels
      });
      render();
    } catch (fehler) {
      melden(fehler);
    }
  }

  async function codesOeffnen() {
    try {
      const antwort = await laden(`/items/${encodeURIComponent(zustand.artikel.id)}`);
      zustand = {
        ...zustand,
        schritt: SCHRITTE.ARTIKEL_CODES,
        codes: antwort.barcodes || [],
        codeEntwurf: null,
        fehler: null
      };
      render();
    } catch (fehler) {
      melden(fehler);
    }
  }

  async function codeSpeichern() {
    const wurzel = elements.view;
    const eingabe = wurzel.querySelector(".stock-code-input")?.value || "";
    const { nachtrag, fehler } = codeNachtragLesen({
      code: eingabe,
      packQuantity: wurzel.querySelector(".stock-code-pack")?.value,
      codeType: gtinNormalisieren(eingabe) ? "gtin" : "internal"
    });
    if (fehler) return melden(new Error(fehler));

    try {
      await senden(`/items/${encodeURIComponent(zustand.artikel.id)}/barcodes`, nachtrag);
      await codesOeffnen();
    } catch (weg) {
      melden(weg);
    }
    return undefined;
  }

  async function codeZuruecknehmen(codeId) {
    if (!fenster.confirm("Diesen Code zurücknehmen? Er lässt sich danach nicht mehr scannen.")) return;
    try {
      await senden(
        `/items/${encodeURIComponent(zustand.artikel.id)}/barcodes/${encodeURIComponent(codeId)}/revoke`,
        { reason: "In der App zurückgenommen" }
      );
      await codesOeffnen();
    } catch (fehler) {
      melden(fehler);
    }
  }

  async function inventurStarten() {
    try {
      zustand = {
        ...zustand,
        inventur: await senden("/inventory", { locationId: zustand.ort?.id }),
        zaehlArtikel: null,
        fehler: null
      };
      render();
    } catch (fehler) {
      melden(fehler);
    }
  }

  async function zaehlungSpeichern() {
    const { zaehlung, fehler } = zaehlungBauen(zustand);
    if (fehler) return melden(new Error(fehler));

    try {
      const sitzung = zustand.inventur.session.id;
      await senden(`/inventory/${encodeURIComponent(sitzung)}/count`, zaehlung);
      zustand = {
        ...zustand,
        inventur: await laden(`/inventory/${encodeURIComponent(sitzung)}`),
        zaehlArtikel: null,
        menge: "",
        fehler: null
      };
      render();
    } catch (weg) {
      melden(weg);
    }
    return undefined;
  }

  async function inventurAbschliessen() {
    try {
      const antwort = await senden(
        `/inventory/${encodeURIComponent(zustand.inventur.session.id)}/complete`, {}
      );
      const korrekturen = antwort.corrections ?? 0;
      zustand = lagerZustand({
        ort: zustand.ort,
        hinweis: `Inventur abgeschlossen: ${korrekturen} Korrektur${korrekturen === 1 ? "" : "en"} gebucht.`
      });
      render();
    } catch (fehler) {
      melden(fehler);
    }
  }

  async function inventurAbbrechen() {
    try {
      await senden(`/inventory/${encodeURIComponent(zustand.inventur.session.id)}/cancel`, {
        reason: "In der App abgebrochen"
      });
      zustand = lagerZustand({ ort: zustand.ort, hinweis: "Inventur abgebrochen." });
      render();
    } catch (fehler) {
      melden(fehler);
    }
  }

  async function bestellungAusVorschlag() {
    try {
      const { suggestions } = await laden("/reorder");
      if (!suggestions.length) {
        return melden(new Error("Kein Artikel liegt unter seinem Mindestbestand."));
      }
      // Bestellt wird je Lieferant, nicht quer ueber alle: ein Lieferschein
      // kommt von einem Haus. Den ersten Lieferanten mit Bedarf nimmt die
      // Oberflaeche, den Rest holt der naechste Durchgang.
      const lieferant = suggestions.find((eintrag) => eintrag.supplierId)?.supplierId;
      if (!lieferant) {
        return melden(new Error(
          "Diesen Artikeln ist kein Lieferant hinterlegt. Bitte zuerst einen Stammlieferanten eintragen."
        ));
      }
      const bestellung = await senden("/orders", { supplierId: lieferant, fromReorder: true });
      zustand = { ...zustand, schritt: SCHRITTE.BESTELLUNG, bestellung, eingang: {}, fehler: null };
      render();
    } catch (fehler) {
      melden(fehler);
    }
    return undefined;
  }

  async function bestellungOeffnen(orderId) {
    try {
      const bestellung = await laden(`/orders/${encodeURIComponent(orderId)}`);
      zustand = {
        ...zustand,
        schritt: SCHRITTE.BESTELLUNG,
        bestellung,
        eingang: eingangVorbelegen(bestellung),
        fehler: null
      };
      render();
    } catch (fehler) {
      melden(fehler);
    }
  }

  async function bestellungSenden() {
    try {
      const bestellung = await senden(
        `/orders/${encodeURIComponent(zustand.bestellung.order.id)}/send`, {}
      );
      zustand = { ...zustand, bestellung, eingang: eingangVorbelegen(bestellung), fehler: null };
      render();
    } catch (fehler) {
      melden(fehler);
    }
  }

  async function wareneingangBuchen() {
    const { eingang, fehler } = wareneingangBauen(zustand, {});
    if (fehler) return melden(new Error(fehler));

    try {
      const bestellung = await senden(
        `/orders/${encodeURIComponent(zustand.bestellung.order.id)}/receive`, eingang
      );
      zustand = { ...zustand, bestellung, eingang: eingangVorbelegen(bestellung), fehler: null };
      render();
    } catch (weg) {
      melden(weg);
    }
    return undefined;
  }

  async function bestellungStornieren() {
    try {
      await senden(`/orders/${encodeURIComponent(zustand.bestellung.order.id)}/cancel`, {
        reason: "In der App storniert"
      });
      zustand = lagerZustand({ ort: zustand.ort, hinweis: "Bestellung storniert." });
      render();
    } catch (fehler) {
      melden(fehler);
    }
  }

  // -------------------------------------------------------------------------
  // Aussen
  // -------------------------------------------------------------------------

  elements.scanClose.addEventListener("click", scannerSchliessen);
  elements.scanDialog.addEventListener("close", scannerSchliessen);
  elements.scanForm.addEventListener("submit", (ereignis) => {
    ereignis.preventDefault();
    void scanAufloesen(elements.scanValue.value);
  });
  elements.scanImage.addEventListener("change", (ereignis) => {
    void fotoLesen(ereignis.target.files?.[0]);
  });

  function setEnabled(wert) {
    enabled = Boolean(wert);
    if (!enabled) clear();
  }

  function clear() {
    scannerSchliessen();
    geladen = false;
    kontext = { groups: [], locations: [], settings: {}, permissions: {} };
    zustand = lagerZustand();
    bestand = [];
    artikel = [];
    vorschlaege = [];
    bestellungen = [];
    elements.view.innerHTML = "";
  }

  return { setEnabled, refresh, render, clear, openScanner: scannerOeffnen };
}

/** Dieselben Meldungen wie beim Geraete-QR: der Fehler sagt, was zu tun ist. */
export function kameraFehlerText(fehler) {
  const name = String(fehler?.name || "");
  const text = String(fehler?.message || fehler || "").toLocaleLowerCase("de-DE");
  if (["NotAllowedError", "SecurityError"].includes(name)
      || /permission|not allowed|denied|berechtigung/.test(text)) {
    return "Kamerazugriff wurde nicht erlaubt. Der Code lässt sich als Foto oder von Hand eingeben.";
  }
  if (["NotFoundError", "OverconstrainedError"].includes(name)) {
    return "Dieses Gerät hat keine nutzbare Kamera. Bitte den Code als Foto oder von Hand eingeben.";
  }
  return "Die Kamera ließ sich nicht öffnen. Der Code lässt sich als Foto oder von Hand eingeben.";
}
