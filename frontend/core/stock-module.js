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
  artikelAlsEntwurf,
  artikelEntwurfAusScan,
  artikelFormularLesen,
  buchungBauen,
  buchungBleibtInWarteschlange,
  buchungVerarbeiten,
  codeNachtragLesen,
  eingangVorbelegen,
  etikettBogenHtml,
  inventurScanVerarbeiten,
  lagerZustand,
  leereCodezeile,
  offlineLagerQueueKey,
  ortSpeicherKey,
  scanSpeicherKey,
  scanSpeicherStutzen,
  warteschlangeEintrag,
  mengeAlsText,
  mengeAusText,
  scanVerarbeiten,
  wareneingangBauen,
  zaehlungBauen
} from "./stock-management.js?v=0.44.15";
import {
  erkennungWaehlen,
  etikettAusAdresse,
  gtinNormalisieren,
  scanDeuten,
  scanSchleifeStarten
} from "./barcode-scanner.mjs?v=0.44.15";

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
  navigate = () => {},
  getSession = () => null,
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
  let tiefenlinkErledigt = false;
  let sucheGeplant = null;
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
    orte: kontext.locations || [],
    gruppen: kontext.groups || []
  });

  // -------------------------------------------------------------------------
  // Ohne Netz
  //
  // Ein Lager liegt im Keller, und auf der Baustelle steht der Monteur hinterm
  // Rohbau. Eine Buchung, die dort am Netz scheitert, waere verloren - und mit
  // ihr der Bestand. Sie geht deshalb in den Speicher des Geraets und wird
  // nachgetragen, sobald wieder Verbindung besteht.
  //
  // Das ist nur deshalb gefahrlos, weil jede Buchung ihre `clientOperationId`
  // schon beim Tippen bekommt und die Datenbank sie zweimal geschickt als
  // dieselbe erkennt. Mengen sind ausserdem vertauschbar: zwei Entnahmen in
  // anderer Reihenfolge ergeben denselben Bestand - anders als die Uebergabe
  // eines Geraets, die deshalb im Geraetemodul Konflikte kennt und hier nicht.
  // -------------------------------------------------------------------------

  function lesen(schluessel, ersatz) {
    try {
      return JSON.parse(fenster.localStorage.getItem(schluessel)) ?? ersatz;
    } catch {
      return ersatz;
    }
  }

  function schreiben(schluessel, wert) {
    try {
      fenster.localStorage.setItem(schluessel, JSON.stringify(wert));
    } catch {
      // Voller oder gesperrter Speicher darf die App nicht anhalten; online
      // bleibt sie in jedem Fall benutzbar.
    }
  }

  function warteschlange() {
    return lesen(offlineLagerQueueKey(getSession()), []);
  }

  function warteschlangeSpeichern(eintraege) {
    schreiben(offlineLagerQueueKey(getSession()), eintraege);
    zustand = { ...zustand, wartend: eintraege.length };
  }

  function ortMerken(ort) {
    schreiben(ortSpeicherKey(getSession()), ort ? { id: ort.id, name: ort.name, path: ort.path } : null);
  }

  function gemerkterOrt() {
    return lesen(ortSpeicherKey(getSession()), null);
  }

  function scanMerken(code, scan) {
    if (!scan?.found) return;
    const speicher = lesen(scanSpeicherKey(getSession()), {});
    speicher[code] = { scan, gesehen: new Date().toISOString() };
    schreiben(scanSpeicherKey(getSession()), scanSpeicherStutzen(speicher));
  }

  function gemerkterScan(code) {
    return lesen(scanSpeicherKey(getSession()), {})[code]?.scan || null;
  }

  /**
   * Traegt nach, was liegen geblieben ist.
   *
   * Eine abgelehnte Buchung bleibt nicht ewig in der Schlange: sie wuerde bei
   * jedem Netzwechsel erneut scheitern und den Nachtrag der uebrigen aufhalten.
   * Sie faellt heraus und wird gemeldet - mit Artikel und Menge, damit sie sich
   * von Hand nachholen laesst.
   */
  async function abgleichen() {
    // Bewusst nicht an `enabled` gebunden: die Warteschlange gehoert dem
    // Mitarbeiter, nicht dem geoeffneten Bereich. Nach einem Neustart ohne Netz
    // steht der Monteur auf der Startseite, und die Buchungen sollen trotzdem
    // rausgehen, sobald das Telefon wieder Empfang hat - ohne dass er dafuer
    // erst ins Lager tippen muss.
    if (!fenster.navigator.onLine || !getSession()) return;
    const offen = warteschlange();
    if (!offen.length) return;

    const rest = [];
    const abgelehnt = [];
    for (const eintrag of offen) {
      try {
        await senden("/movements", eintrag.buchung);
      } catch (fehler) {
        if (buchungBleibtInWarteschlange(fehler)) rest.push(eintrag);
        else abgelehnt.push({ ...eintrag, grund: fehler.message });
      }
    }

    warteschlangeSpeichern(rest);
    const nachgetragen = offen.length - rest.length - abgelehnt.length;
    if (nachgetragen > 0) {
      showToast(nachgetragen === 1
        ? "Eine wartende Buchung wurde nachgetragen."
        : `${nachgetragen} wartende Buchungen wurden nachgetragen.`);
    }
    for (const eintrag of abgelehnt) {
      showToast(`Nicht gebucht: ${eintrag.beschreibung} — ${eintrag.grund}`);
    }
    if (nachgetragen > 0 || abgelehnt.length) render();
  }

  /**
   * Der Anfang von vorn - mit dem, was ihn ueberdauert.
   *
   * Lagerplatz und wartende Buchungen gehoeren nicht zum Vorgang, sondern zum
   * Menschen davor: der steht nach dem Buchen am selben Regal, und was ohne
   * Netz gebucht wurde, wartet weiter. Ein blosses `lagerZustand()` hat beides
   * vergessen und die Zeile "zwei Buchungen warten" nach dem ersten "Fertig"
   * verschwinden lassen.
   */
  function neuerVorgang(zusatz = {}) {
    return lagerZustand({ ort: zustand.ort, wartend: warteschlange().length, ...zusatz });
  }

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
    zustand = { ...zustand, wartend: warteschlange().length };
    try {
      const antwort = await laden("/contexts");
      kontext = antwort.context;
      geladen = true;
      if (!zustand.ort) {
        // Der zuletzt gescannte Platz ueberlebt das Schliessen der App: wer
        // morgens im Fach A1 weitermacht, soll das Regal nicht erneut suchen.
        // Er muss aber noch existieren - ein geloeschter Platz waere sonst ein
        // Ort, an dem gebucht wird und den es nicht gibt.
        const gemerkt = gemerkterOrt();
        const bekannt = gemerkt && (kontext.locations || []).find((ort) => ort.id === gemerkt.id);
        zustand = { ...zustand, ort: bekannt || vorgabeOrt(kontext) };
      }
      render();
      await abgleichen();
    } catch (fehler) {
      geladen = false;
      melden(fehler);
    }
  }

  async function listeLaden(schritt) {
    if (schritt === SCHRITTE.BESTAND) {
      bestand = (await laden("/levels")).levels;
    } else if (schritt === SCHRITTE.ARTIKEL) {
      const suche = zustand.suche
        ? `?suche=${encodeURIComponent(zustand.suche)}`
        : "";
      artikel = (await laden(`/items${suche}`)).items;
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
    // Ein Suchbegriff, der eine Ansicht ueberlebt, laesst die Liste beim
    // naechsten Aufruf leer wirken, ohne dass jemand sieht, warum.
    if (schritt !== SCHRITTE.ARTIKEL) zustand = { ...zustand, suche: '', druckwahl: [] };
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

    let scan;
    try {
      scan = (await senden("/scan", { code })).scan;
      scanMerken(code, scan);
    } catch (fehler) {
      if (!fehler.network) {
        elements.scanMessage.textContent = fehler.message;
        return;
      }
      // Ohne Netz aus dem Zwischenspeicher. Wer diesen Code hier schon einmal
      // gescannt hat, kommt weiter; wer nicht, erfaehrt genau das - und nicht
      // "Der Server ist nicht erreichbar", was im Keller ohnehin klar ist.
      const gemerkt = gemerkterScan(code);
      if (!gemerkt) {
        elements.scanMessage.textContent =
          "Ohne Verbindung, und dieser Code wurde auf diesem Gerät noch nie gescannt."
          + " Sobald wieder Netz da ist, lässt er sich auflösen.";
        return;
      }
      scan = { ...gemerkt, offline: true };
    }

    if (scanZiel === "inventur") {
      // Eine Inventur ohne Netz waere gefaehrlich: der Sollbestand kommt vom
      // Server, und gegen einen veralteten zu zaehlen erzeugt Korrekturen,
      // die nichts richtigstellen, sondern etwas kaputtmachen.
      if (scan.offline) {
        elements.scanMessage.textContent = "Für die Inventur wird eine Verbindung gebraucht.";
        return;
      }
      zustand = inventurScanVerarbeiten(zustand, scan);
    } else if (scanZiel === "code") {
      zustand = { ...zustand, codeEntwurf: { code, packQuantity: "1" }, fehler: null };
    } else {
      zustand = scanVerarbeiten(zustand, scan);
      if (scan.found && scan.kind === "location") ortMerken(zustand.ort);
    }
    scannerSchliessen();
    render();
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
    if (!ziele.length) return melden(new Error("Für den Bogen ist nichts ausgewählt."));
    try {
      const { labels } = await senden("/labels/sheet", { targets: ziele });
      const blatt = fenster.open("", "_blank");
      if (!blatt) {
        melden(new Error("Der Browser hat das Druckfenster blockiert."));
        return;
      }
      blatt.document.write(etikettBogenHtml(labels, fenster.location.origin));
      blatt.document.close();
    } catch (fehler) {
      melden(fehler);
    }
    return undefined;
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
    auf(".stock-place", "click", ortWaehlen);
    auf(".stock-cancel, .stock-home", "click", () => {
      zustand = neuerVorgang();
      render();
    });

    const feld = wurzel.querySelector(".stock-amount__input");
    feld?.addEventListener("input", () => { zustand.menge = feld.value; });
    // Ein Schritt ist eins in der gewaehlten Einheit: ein Stueck oder ein
    // Karton. Frueher sprang die Menge in Hunderterschritten, weil sie immer in
    // Stueck gezaehlt wurde - und eine einzelne Dose war nur durch Tippen zu
    // bekommen.
    auf(".stock-amount__step", "click", (ereignis) => {
      const jetzt = mengeAusText(zustand.menge) ?? 0;
      const schritt = Number(ereignis.currentTarget.dataset.schritt);
      const neu = Math.max(0, Math.round((jetzt + schritt) * 1000) / 1000);
      zustand.menge = neu > 0 ? mengeAlsText(neu) : "";
      if (feld) feld.value = zustand.menge;
      render();
    });

    // Umschalten zwischen Gebinde und Einzelstueck. Die Menge bleibt stehen:
    // wer "2" getippt hat und auf Einzeln wechselt, meint zwei Stueck - nicht
    // zweihundert. Umrechnen waere hier die falsche Freundlichkeit.
    auf(".stock-unit", "click", (ereignis) => {
      zustand = { ...zustand, einheit: ereignis.currentTarget.dataset.einheit, fehler: null };
      render();
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
    auf(".stock-item-edit", "click", () => {
      zustand = {
        ...zustand,
        schritt: SCHRITTE.ARTIKEL_AENDERN,
        entwurf: artikelAlsEntwurf(zustand.artikel, kontext.groups),
        fehler: null
      };
      render();
    });
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

    // Das Kaestchen waehlt fuers Etikett, der Rest der Zeile oeffnet den
    // Artikel. Ohne diese Trennung koennte man nichts anhaken, ohne
    // wegzuspringen.
    auf(".stock-pick__box", "click", (ereignis) => {
      ereignis.stopPropagation();
      const id = ereignis.currentTarget.dataset.wahl;
      const wahl = new Set(zustand.druckwahl);
      if (wahl.has(id)) wahl.delete(id);
      else wahl.add(id);
      zustand = { ...zustand, druckwahl: [...wahl] };
      render();
    });

    // Dieselben zwei Knoepfe fuer beide Listen; woraus gewaehlt wird, sagt der
    // Schritt. Ein zweiter Satz Knoepfe waere derselbe Code mit anderem Namen.
    const druckliste = () => (zustand.schritt === SCHRITTE.ORTE
      ? { art: "location", eintraege: kontext.locations || [] }
      : { art: "item", eintraege: artikel });

    auf(".stock-sheet-all", "click", () => {
      const alle = druckliste().eintraege.map((eintrag) => eintrag.id);
      zustand = {
        ...zustand,
        druckwahl: zustand.druckwahl.length === alle.length ? [] : alle
      };
      render();
    });

    auf(".stock-sheet-print", "click", () => {
      const { art } = druckliste();
      void etikettenDrucken(zustand.druckwahl.map((id) => ({ targetType: art, id })));
    });

    auf(".stock-row--tap", "click", (ereignis) => {
      const zeile = ereignis.currentTarget;
      if (zeile.dataset.ort) return ortUebernehmen(zeile.dataset.ort);
      if (zeile.dataset.bestellung) return void bestellungOeffnen(zeile.dataset.bestellung);
      if (zeile.dataset.artikel) return void artikelOeffnen(zeile.dataset.artikel);
      return undefined;
    });

    // Gesucht wird erst, wenn das Tippen aufhoert: ein Aufruf je Buchstabe
    // waere im Buero ein Dutzend Anfragen fuer ein Wort.
    const suchfeld = wurzel.querySelector(".stock-search__input");
    suchfeld?.addEventListener("input", () => {
      zustand.suche = suchfeld.value;
      clearTimeout(sucheGeplant);
      sucheGeplant = setTimeout(() => void artikelSuchen(), 300);
    });
  }

  // -------------------------------------------------------------------------
  // Vorgaenge
  // -------------------------------------------------------------------------

  function ortWaehlen() {
    zustand = { ...zustand, schritt: SCHRITTE.ORTE, druckwahl: [], fehler: null };
    render();
  }

  function ortUebernehmen(locationId) {
    const ort = (kontext.locations || []).find((eintrag) => eintrag.id === locationId);
    if (!ort) return;
    ortMerken(ort);
    zustand = {
      ...zustand,
      ort,
      schritt: SCHRITTE.START,
      hinweis: `Lagerplatz gesetzt: ${ort.path || ort.name}`,
      fehler: null
    };
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
      // Nur das Netz wird aufgehoben. Eine abgelehnte Buchung - fehlendes
      // Recht, unbekannter Artikel - waere spaeter genauso abgelehnt und
      // gehoert dem Monteur sofort gesagt.
      if (!weg.network) {
        melden(weg);
        return undefined;
      }
      warteschlangeSpeichern([...warteschlange(), warteschlangeEintrag(zustand, buchung)]);
      zustand = buchungVerarbeiten(zustand, { offline: true });
      render();
    }
    return undefined;
  }

  /**
   * Laedt die Artikelliste zum Suchbegriff nach.
   *
   * Der Cursor muss danach dort stehen, wo er war: die Ansicht wird als Ganzes
   * neu gezeichnet, und ein Suchfeld, das nach jedem Buchstaben den Fokus
   * verliert, ist unbenutzbar.
   */
  async function artikelSuchen() {
    const begriff = zustand.suche;
    try {
      await listeLaden(SCHRITTE.ARTIKEL);
    } catch (fehler) {
      return melden(fehler);
    }
    render();
    const feld = elements.view.querySelector(".stock-search__input");
    if (feld) {
      feld.value = begriff;
      feld.focus();
      feld.setSelectionRange(begriff.length, begriff.length);
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

    // Beim Aendern sind Nummer, Einheit und Warengruppe gesperrt und kommen
    // deshalb nicht aus dem Formular. Die Pruefung braucht sie trotzdem, sonst
    // meldet sie eine fehlende Artikelnummer, die nur niemand tippen konnte.
    const aendern = zustand.schritt === SCHRITTE.ARTIKEL_AENDERN;
    const vollstaendig = aendern
      ? {
        ...werte,
        itemNumber: zustand.entwurf?.itemNumber,
        unit: zustand.entwurf?.unit,
        groupKey: zustand.entwurf?.groupKey
      }
      : werte;

    const { entwurf, fehler } = artikelFormularLesen(vollstaendig);
    if (fehler) {
      zustand = { ...zustand, entwurf: { ...zustand.entwurf, ...werte }, fehler };
      render();
      return;
    }

    try {
      if (aendern) {
        await requestJson(
          `./api/v1/stock/items/${encodeURIComponent(zustand.artikel.id)}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              name: entwurf.name,
              minimumStock: entwurf.minimumStock ?? "",
              targetStock: entwurf.targetStock ?? "",
              packName: entwurf.packName ?? "",
              packSize: entwurf.packSize ?? "",
              rowVersion: zustand.entwurf.rowVersion
            })
          }
        );
        showToast("Artikel geändert.");
      } else {
        await senden("/items", entwurf);
        showToast("Artikel angelegt.");
      }
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
      zustand = neuerVorgang({
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
      zustand = neuerVorgang({ hinweis: "Inventur abgebrochen." });
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
      zustand = neuerVorgang({ hinweis: "Bestellung storniert." });
      render();
    } catch (fehler) {
      melden(fehler);
    }
  }

  // -------------------------------------------------------------------------
  // Aussen
  // -------------------------------------------------------------------------

  // Sobald das Telefon wieder Netz hat, geht das Liegengebliebene raus - ohne
  // dass jemand die App dafuer oeffnen oder etwas antippen muss.
  fenster.addEventListener("online", () => void abgleichen());

  elements.scanClose.addEventListener("click", scannerSchliessen);
  elements.scanDialog.addEventListener("close", scannerSchliessen);
  elements.scanForm.addEventListener("submit", (ereignis) => {
    ereignis.preventDefault();
    void scanAufloesen(elements.scanValue.value);
  });
  elements.scanImage.addEventListener("change", (ereignis) => {
    void fotoLesen(ereignis.target.files?.[0]);
  });

  /**
   * Ein gedrucktes Etikett, mit der Kamera des Telefons gescannt.
   *
   * Der Code enthaelt die Adresse der App mit `?lager=<Kennung>`. Ohne diesen
   * Weg oeffnet sich Schaefchen und tut nichts - das Etikett waere ein Bild
   * ohne Wirkung. Mit ihm landet der Monteur unmittelbar beim Artikel oder auf
   * dem Lagerplatz, ohne den Bereich erst zu suchen.
   *
   * Die Kennung wird danach aus der Adresse entfernt: ein Neuladen soll nicht
   * zum zweiten Mal irgendwo hinspringen.
   */
  async function handleDeepLink() {
    if (tiefenlinkErledigt || !enabled) return;
    const kennung = etikettAusAdresse(new URL(fenster.location.href));
    if (!kennung) return;
    tiefenlinkErledigt = true;

    navigate("stock");
    if (!geladen) await refresh();
    await scanAufloesen(kennung);

    const adresse = new URL(fenster.location.href);
    for (const schluessel of [...adresse.searchParams.keys()]) {
      if (schluessel.toLowerCase() === "lager") adresse.searchParams.delete(schluessel);
    }
    fenster.history.replaceState({}, "", adresse);
  }

  function setEnabled(wert) {
    enabled = Boolean(wert);
    if (!enabled) clear();
  }

  function clear() {
    scannerSchliessen();
    geladen = false;
    kontext = { groups: [], locations: [], settings: {}, permissions: {} };
    // Die Warteschlange wird bewusst nicht geleert: sie gehoert dem Mitarbeiter
    // und nicht der Sitzung. Wer sich abmeldet, waehrend drei Entnahmen warten,
    // findet sie beim naechsten Anmelden wieder vor.
    zustand = lagerZustand({ wartend: warteschlange().length });
    bestand = [];
    artikel = [];
    vorschlaege = [];
    bestellungen = [];
    elements.view.innerHTML = "";
  }

  return {
    setEnabled, refresh, render, clear,
    openScanner: scannerOeffnen,
    syncQueue: abgleichen,
    handleDeepLink
  };
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
