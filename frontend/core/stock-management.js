// Lagerverwaltung: Ablauf und Zustand der Bedienoberflaeche.
//
// Das Geraetemodul arbeitet mit zehn Reitern. Fuer das Lager waere das falsch:
// ein Monteur steht mit einer Rolle Kabel unterm Arm vor dem Regal und soll
// den naechsten Schritt sehen, nicht eine Auswahl. Deshalb ein linearer
// Ablauf - scannen, Menge, buchen - und Reiter nur fuer das Buero.
//
// Diese Datei enthaelt die Entscheidungen, nicht das DOM-Gefummel: welcher
// Schritt auf welchen folgt, was ein Scan bedeutet, wie viel eine Packung
// bucht, wer was darf und wie eine Buchung aussieht. Alles davon ist ohne
// Browser pruefbar, und genau daran haengt, ob der Bestand stimmt.

export const SCHRITTE = Object.freeze({
  START: 'start',
  BUCHEN: 'buchen',
  UNBEKANNT: 'unbekannt',
  BESTAETIGT: 'bestaetigt',
  // Die drei Bueroansichten. Sie stehen bewusst neben dem Monteursablauf und
  // nicht in ihm: wer Artikel pflegt, sitzt am Schreibtisch und sucht, statt
  // dem naechsten Schritt zu folgen.
  BESTAND: 'bestand',
  ARTIKEL: 'artikel',
  ARTIKEL_NEU: 'artikelNeu',
  NACHBESTELLUNG: 'nachbestellung',
  INVENTUR: 'inventur',
  BESTELLUNGEN: 'bestellungen',
  BESTELLUNG: 'bestellung',
  ARTIKEL_CODES: 'artikelCodes',
  ORTE: 'orte'
});

export const BESTELLSTATUS = Object.freeze({
  draft: 'Entwurf',
  ordered: 'Bestellt',
  partially_received: 'Teilweise geliefert',
  received: 'Vollständig geliefert',
  cancelled: 'Storniert'
});

// Was der Benutzer waehlt, und was daraus in der Datenbank wird. Die
// Oberflaeche spricht die Sprache der Baustelle, das Journal die der
// Buchhaltung.
export const VORGAENGE = Object.freeze({
  entnahme: { movementType: 'issue', ort: 'quelle', name: 'Entnehmen', recht: 'alle' },
  rueckgabe: { movementType: 'return', ort: 'ziel', name: 'Zurückgeben', recht: 'alle' },
  umlagerung: { movementType: 'transfer', ort: 'beides', name: 'Umlagern', recht: 'transfer' },
  wareneingang: { movementType: 'receipt', ort: 'ziel', name: 'Wareneingang', recht: 'verwaltung' },
  anfangsbestand: { movementType: 'opening', ort: 'ziel', name: 'Anfangsbestand', recht: 'verwaltung' },
  verschrottung: { movementType: 'scrap', ort: 'quelle', name: 'Verschrotten', recht: 'verwaltung' }
});

export function offlineLagerQueueKey(session) {
  return `schaefchen-stock-queue-v1:${session?.company?.number || 'unknown'}:${session?.user?.id || 'unknown'}`;
}

export function ortSpeicherKey(session) {
  return `schaefchen-stock-place-v1:${session?.company?.number || 'unknown'}:${session?.user?.id || 'unknown'}`;
}

export function scanSpeicherKey(session) {
  return `schaefchen-stock-scans-v1:${session?.company?.number || 'unknown'}:${session?.user?.id || 'unknown'}`;
}

/**
 * Der Zwischenspeicher der Scans, auf eine tragbare Groesse gestutzt.
 *
 * Ohne ihn scheitert im Keller schon der erste Schritt: der Code laesst sich
 * lesen, aber nicht aufloesen, und der Monteur kommt gar nicht erst zur
 * Buchung. Im Lager wiederholen sich dieselben Artikel staendig — deshalb
 * traegt ein Speicher der zuletzt gesehenen Codes weit.
 *
 * Gestutzt wird nach Zeitpunkt, damit der Speicher des Geraets nicht
 * unbegrenzt waechst; was am laengsten nicht gescannt wurde, faellt zuerst.
 */
export const SCAN_SPEICHER_GROESSE = 300;

export function scanSpeicherStutzen(speicher = {}, groesse = SCAN_SPEICHER_GROESSE) {
  return Object.fromEntries(
    Object.entries(speicher)
      .sort((links, rechts) => String(rechts[1]?.gesehen || '').localeCompare(String(links[1]?.gesehen || '')))
      .slice(0, groesse)
  );
}

export function lagerZustand(vorgabe = {}) {
  return {
    schritt: SCHRITTE.START,
    ort: null,
    artikel: null,
    bestandAmOrt: null,
    gebinde: 1,
    menge: '1',
    baustelleId: null,
    vorgang: 'entnahme',
    zielOrtId: null,
    letzterScan: null,
    // Der Bestand stammt aus dem Zwischenspeicher des Geraets und kann
    // ueberholt sein: ohne Netz weiss niemand, was inzwischen gebucht wurde.
    bestandVeraltet: false,
    bestaetigung: null,
    // Vollstaendig aufgezaehlt, auch wo es null ist: ein Zustand, dessen
    // Schluessel je nach Weg auftauchen und verschwinden, laesst Vergleiche
    // gegen null mal stimmen und mal nicht.
    entwurf: null,
    suche: '',
    inventur: null,
    zaehlArtikel: null,
    bestellung: null,
    eingang: null,
    codes: null,
    codeEntwurf: null,
    hinweis: null,
    fehler: null,
    // Wie viele Buchungen noch aufs Netz warten. Sie stehen nicht im Zustand,
    // sondern im Speicher des Geraets; hier steht nur die Zahl, damit die
    // Ansicht sie zeigen kann, ohne den Speicher zu kennen.
    wartend: 0,
    ...vorgabe
  };
}

/**
 * Eine Menge, wie sie hier eingetippt wird: mit Komma.
 * `Number('3,5')` ergibt NaN, und eine stillschweigend als 0 verbuchte
 * Kabellaenge faellt erst bei der Inventur auf.
 */
export function mengeAusText(text) {
  if (typeof text === 'number') return Number.isFinite(text) ? text : null;
  if (typeof text !== 'string') return null;

  const bereinigt = text.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d*\.?\d*$/.test(bereinigt) || bereinigt === '' || bereinigt === '.') return null;

  const wert = Number(bereinigt);
  if (!Number.isFinite(wert) || wert <= 0) return null;

  // Drei Nachkommastellen, wie die Datenbank.
  return Math.round(wert * 1000) / 1000;
}

export function mengeAlsText(menge) {
  if (typeof menge !== 'number' || !Number.isFinite(menge)) return '';
  const gerundet = Math.round(menge * 1000) / 1000;
  return String(gerundet).replace('.', ',');
}

/**
 * Verarbeitet die Antwort des Scan-Endpunkts.
 *
 * Der Ortskontext ist der Kniff, der die Bedienung kurz macht: einmal das
 * Regal scannen, danach nur noch Artikel. Er bleibt stehen, bis ein anderer
 * Lagerplatz gescannt wird — auch ueber Buchungen hinweg, sonst muesste man
 * vor jeder Entnahme zweimal scannen.
 */
export function scanVerarbeiten(zustand, antwort) {
  if (!antwort) {
    return { ...zustand, fehler: 'Der Code konnte nicht gelesen werden.' };
  }

  if (antwort.found && antwort.kind === 'location') {
    return {
      ...zustand,
      ort: antwort.location,
      schritt: SCHRITTE.START,
      bestandVeraltet: false,
      hinweis: `Lagerplatz gesetzt: ${antwort.location.path || antwort.location.name}`,
      fehler: null
    };
  }

  if (antwort.found && antwort.kind === 'item') {
    // Der Kartoncode bucht die Gebindemenge, nicht eins. Wer die Packung
    // scannt, meint die Packung.
    const gebinde = Number(antwort.packQuantity) > 0 ? Number(antwort.packQuantity) : 1;
    const bestand = (antwort.levels || []).find((zeile) => zeile.locationId === zustand.ort?.id);

    return {
      ...zustand,
      schritt: SCHRITTE.BUCHEN,
      artikel: antwort.item,
      bestandAmOrt: bestand ? bestand.quantity : (zustand.ort ? 0 : null),
      // Aus dem Zwischenspeicher: die Zahl stimmte, als zuletzt Netz da war.
      bestandVeraltet: Boolean(antwort.offline),
      gebinde,
      menge: mengeAlsText(gebinde),
      bestaetigung: null,
      hinweis: null,
      fehler: null
    };
  }

  return {
    ...zustand,
    schritt: SCHRITTE.UNBEKANNT,
    letzterScan: {
      art: antwort.kind || 'text',
      wert: antwort.normalized || antwort.code || '',
      roh: antwort.code || ''
    },
    artikel: null,
    hinweis: null,
    fehler: null
  };
}

/** Welche Vorgaenge darf dieser Mensch ausloesen? Die Oberflaeche darf nichts
 *  anbieten, was die API danach ablehnt. */
export function verfuegbareVorgaenge(rechte = {}) {
  return Object.entries(VORGAENGE)
    .filter(([, vorgang]) => {
      if (vorgang.recht === 'alle') return true;
      if (vorgang.recht === 'transfer') return Boolean(rechte.transfer);
      return Boolean(rechte.manage);
    })
    .map(([schluessel, vorgang]) => ({ schluessel, name: vorgang.name }));
}

export function darfVorgang(rechte, schluessel) {
  return verfuegbareVorgaenge(rechte).some((eintrag) => eintrag.schluessel === schluessel);
}

/**
 * Prueft die Eingabe und baut die Buchung.
 *
 * `clientOperationId` wird hier einmal vergeben und danach nicht mehr
 * geaendert. Genau darin liegt die Offline-Sicherheit: eine Buchung, die
 * zweimal losgeschickt wird — weil das Netz auf der Baustelle wackelt —
 * traegt beide Male dieselbe Nummer und zaehlt nur einmal.
 */
export function buchungBauen(zustand, optionen = {}) {
  const vorgang = VORGAENGE[zustand.vorgang];
  if (!vorgang) return { fehler: 'Diesen Vorgang gibt es nicht.' };
  if (!zustand.artikel) return { fehler: 'Es ist kein Artikel gewählt.' };

  const menge = mengeAusText(zustand.menge);
  if (menge === null) return { fehler: 'Bitte eine Menge größer als null eingeben.' };

  if (!zustand.ort) {
    return { fehler: 'Zuerst den Lagerplatz scannen oder auswählen.' };
  }
  if (vorgang.ort === 'beides' && !zustand.zielOrtId) {
    return { fehler: 'Für eine Umlagerung fehlt der Zielort.' };
  }
  if (vorgang.ort === 'beides' && zustand.zielOrtId === zustand.ort.id) {
    return { fehler: 'Quell- und Zielort müssen verschieden sein.' };
  }
  if (vorgang.movementType === 'issue' && optionen.baustellePflicht && !zustand.baustelleId) {
    return { fehler: 'Diese Firma verlangt bei einer Entnahme die Baustelle.' };
  }

  const buchung = {
    itemId: zustand.artikel.id,
    movementType: vorgang.movementType,
    quantity: menge,
    sourceType: optionen.sourceType || 'qr_scan',
    clientOperationId: optionen.vorgangId || neueVorgangId()
  };

  if (vorgang.ort === 'quelle') buchung.sourceLocationId = zustand.ort.id;
  if (vorgang.ort === 'ziel') buchung.targetLocationId = zustand.ort.id;
  if (vorgang.ort === 'beides') {
    buchung.sourceLocationId = zustand.ort.id;
    buchung.targetLocationId = zustand.zielOrtId;
  }

  if (zustand.baustelleId && vorgang.movementType === 'issue') {
    buchung.constructionSiteId = zustand.baustelleId;
  }
  if (zustand.grund) buchung.reason = zustand.grund;

  return { buchung };
}

/**
 * Was von einer Buchung uebrig bleibt, wenn das Netz fehlt.
 *
 * Die Beschreibung ist kein Beiwerk: faellt die Buchung spaeter aus der
 * Schlange, weil der Server sie ablehnt, ist sie das Einzige, womit sich noch
 * sagen laesst, was da eigentlich gebucht werden sollte.
 */
export function warteschlangeEintrag(zustand, buchung, jetzt = new Date()) {
  const menge = mengeAusText(zustand.menge);
  const teile = [
    menge === null ? null : mengeAlsText(menge),
    zustand.artikel?.unit,
    zustand.artikel?.name
  ].filter(Boolean);

  return {
    buchung,
    beschreibung: teile.join(' ') || 'Buchung ohne Angaben',
    vorgang: VORGAENGE[zustand.vorgang]?.name || '',
    gestellt: jetzt.toISOString()
  };
}

/**
 * Bleibt eine liegen gebliebene Buchung in der Schlange?
 *
 * Nur beim Netz. Eine abgelehnte Buchung - fehlendes Recht, geloeschter
 * Artikel - wuerde bei jedem Netzwechsel erneut scheitern und den Nachtrag der
 * uebrigen aufhalten. Sie faellt heraus und wird gemeldet.
 */
export function buchungBleibtInWarteschlange(fehler) {
  return Boolean(fehler?.network);
}

export function neueVorgangId() {
  const zufall = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `stock-${zufall}`;
}

/**
 * Nach der Buchung: was sieht der Monteur?
 *
 * Der Ort bleibt stehen, der Artikel verschwindet. So ist der naechste Scan
 * sofort moeglich, ohne dass jemand etwas wegklicken muss — im Lager wird
 * selten nur ein Artikel entnommen.
 */
export function buchungVerarbeiten(zustand, antwort) {
  const bestand = (antwort?.levels || []).find((zeile) => zeile.locationId === zustand.ort?.id);

  // Ohne Netz kennt niemand den neuen Bestand: die Buchung liegt im Speicher
  // des Geraets und ist noch nicht gezaehlt worden. Eine Zahl zu zeigen, die
  // nur geraten ist, waere schlimmer als keine - danach richtet sich im Lager
  // jemand.
  const offline = Boolean(antwort?.offline);

  return {
    ...zustand,
    schritt: SCHRITTE.BESTAETIGT,
    bestaetigung: {
      artikelName: zustand.artikel?.name || '',
      menge: mengeAusText(zustand.menge),
      einheit: zustand.artikel?.unit || '',
      vorgang: VORGAENGE[zustand.vorgang]?.name || '',
      neuerBestand: offline ? null : (bestand ? bestand.quantity : null),
      wiederholt: Boolean(antwort?.repeated),
      offline
    },
    artikel: null,
    bestandAmOrt: null,
    gebinde: 1,
    menge: '1',
    fehler: null
  };
}

/**
 * Ein negativer Bestand ist erlaubt, aber er soll auffallen: er heisst, dass
 * jemand mehr entnommen hat, als das System kannte.
 */
export function bestandLage(menge, mindestbestand = 0) {
  if (menge === null || menge === undefined) return 'unbekannt';
  if (menge < 0) return 'unplausibel';
  if (menge === 0) return 'leer';
  if (mindestbestand > 0 && menge < mindestbestand) return 'knapp';
  return 'gut';
}

export function bestandText(menge, einheit) {
  if (menge === null || menge === undefined) return 'unbekannt';
  return `${mengeAlsText(menge)} ${einheit || ''}`.trim();
}

/** Kurzform eines Lagerpfads: im Kopf der Ansicht ist wenig Platz, und
 *  "Materiallager › Regal A › Fach A1" ist auf dem Telefon zu lang. */
export function ortKurz(ort) {
  if (!ort) return null;
  const pfad = ort.path || ort.name || '';
  const teile = pfad.split('›').map((teil) => teil.trim()).filter(Boolean);
  if (teile.length <= 2) return pfad;
  return `… › ${teile.slice(-2).join(' › ')}`;
}

/**
 * Der Nachbestellvorschlag steht dem Buero zu, aber die Zahl dahinter
 * interessiert jeden: wie viele Artikel sind unter dem Mindestbestand?
 */
export function knappeArtikel(artikel = []) {
  return artikel.filter((eintrag) => (
    eintrag.minimumStock > 0 && eintrag.totalQuantity < eintrag.minimumStock
  ));
}

/**
 * Aus einem unbekannten Code einen Artikelentwurf machen. Der gescannte Code
 * wird dabei uebernommen, damit er nach dem Speichern sofort gefunden wird —
 * sonst legt jemand den Artikel an und scannt gleich darauf wieder ins Leere.
 */
export function artikelEntwurfAusScan(scan, gruppen = []) {
  if (!scan) return null;
  const istGtin = scan.art === 'gtin';

  return {
    itemNumber: '',
    name: '',
    unit: 'Stück',
    groupKey: gruppen[0]?.key || 'other',
    barcodes: [{
      code: scan.roh || scan.wert,
      codeType: istGtin ? 'gtin' : 'internal',
      packQuantity: 1,
      isPrimary: true
    }]
  };
}

// ---------------------------------------------------------------------------
// Ansicht
// ---------------------------------------------------------------------------

function sicher(text) {
  return String(text ?? '').replace(/[&<>"']/g, (zeichen) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[zeichen]));
}

export function ortLeiste(ort) {
  if (!ort) {
    return `<button class="button button--secondary stock-place stock-place--leer" type="button">
      Lagerplatz scannen oder wählen
    </button>`;
  }
  return `<button class="button button--secondary stock-place" type="button">
    <span class="stock-place__label">Lagerplatz</span>
    <span class="stock-place__name">${sicher(ortKurz(ort))}</span>
  </button>`;
}

/**
 * Wartende Buchungen gehoeren auf die Startseite und nicht in eine Ecke.
 *
 * Wer ohne Netz gebucht hat, muss beim naechsten Hinsehen erkennen koennen,
 * dass noch etwas offen ist - sonst haelt er den Bestand fuer richtig,
 * waehrend drei Entnahmen noch auf dem Telefon liegen.
 */
export function wartendZeile(wartend = 0) {
  if (!wartend) return '';
  return `<p class="stock-pack" role="status">
    ${wartend === 1 ? 'Eine Buchung wartet' : `${sicher(String(wartend))} Buchungen warten`}
    auf Netz und ${wartend === 1 ? 'wird' : 'werden'} von selbst nachgetragen.
  </p>`;
}

export function startAnsicht(zustand, rechte = {}) {
  const kacheln = [
    `<button class="stock-tile stock-tile--stock" type="button" data-ziel="bestand">
       <span class="stock-tile__name">Bestand</span>
       <span class="stock-tile__hint">Was liegt wo</span>
     </button>`
  ];

  if (rechte.transfer) {
    kacheln.push(`<button class="stock-tile" type="button" data-ziel="inventur">
       <span class="stock-tile__name">Inventur</span>
       <span class="stock-tile__hint">Zählen und richtigstellen</span>
     </button>`);
  }

  if (rechte.manage) {
    kacheln.push(`<button class="stock-tile" type="button" data-ziel="artikel">
       <span class="stock-tile__name">Artikel</span>
       <span class="stock-tile__hint">Stamm und Codes</span>
     </button>`);
    kacheln.push(`<button class="stock-tile" type="button" data-ziel="nachbestellung">
       <span class="stock-tile__name">Nachbestellung</span>
       <span class="stock-tile__hint">Unter Mindestbestand</span>
     </button>`);
    kacheln.push(`<button class="stock-tile" type="button" data-ziel="bestellungen">
       <span class="stock-tile__name">Bestellungen</span>
       <span class="stock-tile__hint">Offen und unterwegs</span>
     </button>`);
  }

  return `
    <div class="stock-start">
      ${ortLeiste(zustand.ort)}
      <button class="button button--action stock-scan" type="button">
        <span aria-hidden="true">▣</span> Scannen
      </button>
      ${zustand.hinweis ? `<p class="stock-note" role="status">${sicher(zustand.hinweis)}</p>` : ''}
      ${wartendZeile(zustand.wartend)}
      <div class="stock-tiles">${kacheln.join('')}</div>
    </div>`;
}

export function buchenAnsicht(zustand, rechte = {}, optionen = {}) {
  const artikel = zustand.artikel;
  if (!artikel) return '';

  const vorgaenge = verfuegbareVorgaenge(rechte);
  const lage = bestandLage(zustand.bestandAmOrt, artikel.minimumStock);

  const gebindeHinweis = zustand.gebinde > 1
    ? `<p class="stock-pack">Gescannt wurde ein Gebinde mit ${sicher(mengeAlsText(zustand.gebinde))} ${sicher(artikel.unit)}.</p>`
    : '';

  return `
    <div class="stock-book">
      ${ortLeiste(zustand.ort)}

      <div class="stock-item">
        <p class="eyebrow">${sicher(artikel.itemNumber)}</p>
        <h2 class="stock-item__name">${sicher(artikel.name)}</h2>
        <p class="stock-item__stock stock-item__stock--${lage}">
          Bestand hier: ${sicher(bestandText(zustand.bestandAmOrt, artikel.unit))}
        </p>
        ${zustand.bestandVeraltet
          ? `<p class="stock-hint">
               Ohne Netz: Artikel und Bestand stammen vom letzten Scan mit
               Verbindung. Buchen kannst du trotzdem.
             </p>`
          : ''}
      </div>

      ${gebindeHinweis}

      <div class="stock-amount">
        <button class="button button--secondary stock-amount__step" type="button" data-schritt="-1" aria-label="Menge verringern">−</button>
        <label class="stock-amount__field">
          <span class="visually-hidden">Menge in ${sicher(artikel.unit)}</span>
          <input class="stock-amount__input" type="text" inputmode="decimal"
                 autocomplete="off" value="${sicher(zustand.menge)}">
        </label>
        <span class="stock-amount__unit">${sicher(artikel.unit)}</span>
        <button class="button button--secondary stock-amount__step" type="button" data-schritt="1" aria-label="Menge erhöhen">+</button>
      </div>

      ${baustellenFeld(zustand, optionen)}

      <div class="stock-actions">
        ${vorgaenge.map((vorgang) => `
          <button class="button ${vorgang.schluessel === 'entnahme' ? 'button--action' : 'button--secondary'} stock-do"
                  type="button" data-vorgang="${sicher(vorgang.schluessel)}">
            ${sicher(vorgang.name)}
          </button>`).join('')}
      </div>

      ${zustand.fehler ? `<p class="stock-error" role="alert">${sicher(zustand.fehler)}</p>` : ''}
      ${rechte.manage
        ? '<button class="button button--quiet stock-codes-open" type="button">Codes und Etikett</button>'
        : ''}
      <button class="button button--quiet stock-cancel" type="button">Abbrechen</button>
    </div>`;
}

function baustellenFeld(zustand, optionen = {}) {
  const baustellen = optionen.baustellen || [];
  if (!baustellen.length) return '';

  const pflicht = optionen.baustellePflicht;
  return `
    <label class="stock-site">
      <span>Baustelle${pflicht ? '' : ' (freiwillig)'}</span>
      <select class="stock-site__select">
        <option value="">${pflicht ? 'Bitte wählen' : 'Ohne Baustelle'}</option>
        ${baustellen.map((baustelle) => `
          <option value="${sicher(baustelle.id)}"${baustelle.id === zustand.baustelleId ? ' selected' : ''}>
            ${sicher(baustelle.name)}
          </option>`).join('')}
      </select>
    </label>`;
}

export function bestaetigungAnsicht(zustand) {
  const b = zustand.bestaetigung;
  if (!b) return '';

  return `
    <div class="stock-done">
      <p class="stock-done__mark" aria-hidden="true">✓</p>
      <h2 class="stock-done__title">${sicher(b.vorgang)}: ${sicher(mengeAlsText(b.menge))} ${sicher(b.einheit)}</h2>
      <p class="stock-done__item">${sicher(b.artikelName)}</p>
      ${b.neuerBestand !== null
        ? `<p class="stock-done__stock">Neuer Bestand hier: ${sicher(bestandText(b.neuerBestand, b.einheit))}</p>`
        : ''}
      ${b.offline
        ? `<p class="stock-pack">
             Ohne Verbindung gebucht. Die Buchung liegt auf diesem Gerät und wird
             nachgetragen, sobald wieder Netz da ist — auch wenn du die App
             zwischendurch schließt.
           </p>`
        : ''}
      ${b.wiederholt
        ? '<p class="stock-note">Diese Buchung lag schon vor und wurde nicht doppelt gezählt.</p>'
        : ''}
      <button class="button button--action stock-scan" type="button">Nächsten Artikel scannen</button>
      <button class="button button--quiet stock-home" type="button">Fertig</button>
    </div>`;
}

export function unbekanntAnsicht(zustand, rechte = {}) {
  const scan = zustand.letzterScan;
  if (!scan) return '';

  const artName = scan.art === 'gtin' ? 'Herstellercode' : 'Code';

  return `
    <div class="stock-unknown">
      <p class="eyebrow">${sicher(artName)} nicht bekannt</p>
      <p class="stock-unknown__code">${sicher(scan.wert)}</p>
      <p class="stock-unknown__text">
        Zu diesem Code gibt es noch keinen Artikel.
        ${rechte.manage
          ? 'Du kannst ihn jetzt anlegen; der gescannte Code wird dabei übernommen.'
          : 'Das Büro kann den Artikel anlegen — melde ihm den Code.'}
      </p>
      ${rechte.manage
        ? '<button class="button button--action stock-create" type="button">Artikel anlegen</button>'
        : ''}
      <button class="button button--quiet stock-home" type="button">Zurück</button>
    </div>`;
}

// ---------------------------------------------------------------------------
// Bueroansichten
// ---------------------------------------------------------------------------

/**
 * Der Bestand wird nach Lagerplatz gebuendelt, nicht nach Artikel. Die Frage
 * im Buero lautet "was liegt im Fach A1", wenn jemand danach sucht; die Frage
 * nach einem einzelnen Artikel beantwortet die Artikelansicht.
 */
export function bestandNachOrt(zeilen = []) {
  const orte = new Map();

  for (const zeile of zeilen) {
    if (!orte.has(zeile.locationId)) {
      orte.set(zeile.locationId, { id: zeile.locationId, name: zeile.locationName, zeilen: [] });
    }
    orte.get(zeile.locationId).zeilen.push(zeile);
  }

  return [...orte.values()]
    .map((ort) => ({
      ...ort,
      zeilen: [...ort.zeilen].sort((a, b) => a.itemName.localeCompare(b.itemName, 'de'))
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

/**
 * Wie weit ist ein Artikel vom Mindestbestand entfernt? Null heisst leer, eins
 * heisst gerade erreicht. Danach wird der Nachbestellvorschlag sortiert: wer
 * am weitesten unten liegt, steht oben.
 */
export function deckungsgrad(artikel) {
  if (!artikel?.minimumStock || artikel.minimumStock <= 0) return null;
  return Math.max(0, artikel.totalQuantity) / artikel.minimumStock;
}

export function nachbestellungZeilen(vorschlaege = []) {
  return [...vorschlaege]
    .map((eintrag) => ({ ...eintrag, deckung: deckungsgrad(eintrag) }))
    .sort((a, b) => (a.deckung ?? 1) - (b.deckung ?? 1));
}

/** Mengen im Artikelstamm duerfen null sein — anders als Buchungsmengen. */
export function bestandsmengeAusText(text) {
  if (text === undefined || text === null || String(text).trim() === '') return null;
  const bereinigt = String(text).trim().replace(',', '.');
  if (!/^\d*\.?\d*$/.test(bereinigt) || bereinigt === '.') return undefined;
  const wert = Number(bereinigt);
  if (!Number.isFinite(wert) || wert < 0) return undefined;
  return Math.round(wert * 1000) / 1000;
}

/**
 * Prueft das Artikelformular, bevor es abgeschickt wird.
 *
 * Dieselben Regeln stehen in der API und in der Datenbank; hier stehen sie ein
 * drittes Mal, damit niemand erst nach dem Absenden erfaehrt, dass die
 * Artikelnummer fehlt. Die Datenbank bleibt die Grenze, das hier ist die
 * Hoeflichkeit.
 */
export function artikelFormularLesen(werte = {}) {
  const text = (wert) => String(wert ?? '').trim();

  const itemNumber = text(werte.itemNumber).toUpperCase();
  if (!itemNumber) return { fehler: 'Die Artikelnummer fehlt.' };
  if (itemNumber.length > 40) return { fehler: 'Die Artikelnummer ist zu lang.' };

  const name = text(werte.name);
  if (!name) return { fehler: 'Die Bezeichnung fehlt.' };
  if (name.length > 180) return { fehler: 'Die Bezeichnung ist zu lang.' };

  const unit = text(werte.unit);
  if (!unit) return { fehler: 'Die Einheit fehlt.' };

  const groupKey = text(werte.groupKey);
  if (!groupKey) return { fehler: 'Die Warengruppe fehlt.' };

  const minimumStock = bestandsmengeAusText(werte.minimumStock);
  if (minimumStock === undefined) return { fehler: 'Der Mindestbestand ist keine gültige Menge.' };

  const targetStock = bestandsmengeAusText(werte.targetStock);
  if (targetStock === undefined) return { fehler: 'Der Zielbestand ist keine gültige Menge.' };
  if (targetStock !== null && minimumStock !== null && targetStock < minimumStock) {
    return { fehler: 'Der Zielbestand liegt unter dem Mindestbestand.' };
  }

  const codes = (werte.barcodes || []).filter((eintrag) => text(eintrag?.code));
  const barcodes = [];
  for (const eintrag of codes) {
    const menge = mengeAusText(eintrag.packQuantity ?? 1);
    if (menge === null) return { fehler: 'Eine Gebindemenge ist keine gültige Menge.' };
    barcodes.push({
      code: text(eintrag.code),
      codeType: eintrag.codeType === 'gtin' ? 'gtin' : 'internal',
      packQuantity: menge,
      isPrimary: eintrag.isPrimary === true
    });
  }
  if (barcodes.filter((eintrag) => eintrag.isPrimary).length > 1) {
    return { fehler: 'Nur ein Code darf der Hauptcode sein.' };
  }

  const entwurf = { itemNumber, name, unit, groupKey, barcodes };
  if (minimumStock !== null) entwurf.minimumStock = minimumStock;
  if (targetStock !== null) entwurf.targetStock = targetStock;
  if (text(werte.manufacturer)) entwurf.manufacturer = text(werte.manufacturer);
  if (text(werte.manufacturerNumber)) entwurf.manufacturerNumber = text(werte.manufacturerNumber);

  return { entwurf };
}

function kopfzeile(titel) {
  return `<div class="stock-head">
    <button class="button button--quiet stock-home stock-back" type="button" aria-label="Zurück">←</button>
    <h2 class="stock-head__title">${sicher(titel)}</h2>
  </div>`;
}

/**
 * Die Auswahl des Lagerplatzes von Hand.
 *
 * Gescannt wird der Platz im Alltag, aber nicht jeder klebt ein Etikett ans
 * Regal, und am Rechner gibt es keine Kamera. Vorher lief das ueber eine
 * Schaltflaeche, die reihum durch die Plaetze schaltete - bei drei Plaetzen
 * ertraeglich, bei dreissig eine Zumutung. Jetzt stehen sie da, mit ihrem
 * vollen Pfad, damit sich "Fach A1" von "Fach A1" im anderen Regal
 * unterscheiden laesst.
 */
export function orteAnsicht(orte = [], aktiv = null) {
  if (!orte.length) {
    return `<div class="stock-list">
      ${kopfzeile('Lagerplatz')}
      <p class="stock-empty">Für diese Firma ist kein Lagerplatz angelegt.</p>
    </div>`;
  }

  return `<div class="stock-list">
    ${kopfzeile('Lagerplatz')}
    <ul class="stock-rows">
      ${orte.map((ort) => `
        <li class="stock-row stock-row--tap${ort.id === aktiv ? ' stock-row--gewaehlt' : ''}"
            data-ort="${sicher(ort.id)}">
          <span class="stock-row__name">${sicher(ort.name)}</span>
          <span class="stock-row__number">${sicher(ort.path || ort.name)}</span>
          ${ort.id === aktiv ? '<span class="stock-row__amount">gewählt</span>' : ''}
        </li>`).join('')}
    </ul>
  </div>`;
}

export function bestandAnsicht(zeilen = []) {
  const orte = bestandNachOrt(zeilen);
  if (!orte.length) {
    return `<div class="stock-list">
      ${kopfzeile('Bestand')}
      <p class="stock-empty">Für dieses Lager ist noch nichts gebucht.</p>
    </div>`;
  }

  return `<div class="stock-list">
    ${kopfzeile('Bestand')}
    ${orte.map((ort) => `
      <section class="stock-group">
        <h3 class="stock-group__name">${sicher(ort.name)}</h3>
        <ul class="stock-rows">
          ${ort.zeilen.map((zeile) => `
            <li class="stock-row">
              <span class="stock-row__name">${sicher(zeile.itemName)}</span>
              <span class="stock-row__number">${sicher(zeile.itemNumber)}</span>
              <span class="stock-row__amount stock-row__amount--${bestandLage(zeile.quantity)}">
                ${sicher(bestandText(zeile.quantity, zeile.unit))}
              </span>
            </li>`).join('')}
        </ul>
      </section>`).join('')}
  </div>`;
}

export function artikelListeAnsicht(artikel = [], rechte = {}, suche = '') {
  return `<div class="stock-list">
    ${kopfzeile('Artikel')}
    ${rechte.manage ? '<button class="button button--action stock-new" type="button">Artikel anlegen</button>' : ''}
    <label class="stock-field stock-search">
      <span>Suchen</span>
      <input class="stock-search__input" type="search" autocomplete="off" maxlength="120"
             value="${sicher(suche)}" placeholder="Name, Artikelnummer oder Herstellernummer">
    </label>
    ${artikel.length
      ? `<ul class="stock-rows">
          ${artikel.map((eintrag) => `
            <li class="stock-row stock-row--tap" data-artikel="${sicher(eintrag.id)}">
              <span class="stock-row__name">${sicher(eintrag.name)}</span>
              <span class="stock-row__number">${sicher(eintrag.itemNumber)}</span>
              <span class="stock-row__amount stock-row__amount--${bestandLage(eintrag.totalQuantity, eintrag.minimumStock)}">
                ${sicher(bestandText(eintrag.totalQuantity, eintrag.unit))}
              </span>
            </li>`).join('')}
        </ul>`
      : `<p class="stock-empty">${suche
          ? 'Kein Artikel passt zu dieser Suche.'
          : 'Noch kein Artikel angelegt.'}</p>`}
  </div>`;
}

export function nachbestellungAnsicht(vorschlaege = []) {
  const zeilen = nachbestellungZeilen(vorschlaege);
  if (!zeilen.length) {
    return `<div class="stock-list">
      ${kopfzeile('Nachbestellung')}
      <p class="stock-empty">Kein Artikel liegt unter seinem Mindestbestand.</p>
    </div>`;
  }

  return `<div class="stock-list">
    ${kopfzeile('Nachbestellung')}
    <ul class="stock-rows">
      ${zeilen.map((eintrag) => `
        <li class="stock-row stock-row--order">
          <span class="stock-row__name">${sicher(eintrag.name)}</span>
          <span class="stock-row__number">
            ${sicher(bestandText(eintrag.totalQuantity, eintrag.unit))} von ${sicher(mengeAlsText(eintrag.minimumStock))}
            ${eintrag.supplierName ? ` · ${sicher(eintrag.supplierName)}` : ''}
          </span>
          <span class="stock-row__amount stock-row__amount--knapp">
            + ${sicher(bestandText(eintrag.suggestedQuantity, eintrag.unit))}
          </span>
        </li>`).join('')}
    </ul>
  </div>`;
}

export function artikelFormularAnsicht(entwurf, gruppen = [], fehler = null) {
  // Ein leerer Entwurf kommt als null aus dem Zustand und als undefined aus
  // einem direkten Aufruf; beide meinen dasselbe leere Formular.
  const daten = entwurf || {};
  const code = daten.barcodes?.[0];

  return `<div class="stock-form">
    ${kopfzeile('Artikel anlegen')}
    ${code
      ? `<p class="stock-note">Der gescannte Code <strong>${sicher(code.code)}</strong> wird übernommen.</p>`
      : ''}
    <label class="stock-field"><span>Artikelnummer</span>
      <input name="itemNumber" value="${sicher(daten.itemNumber || '')}" autocomplete="off" maxlength="40"></label>
    <label class="stock-field"><span>Bezeichnung</span>
      <input name="name" value="${sicher(daten.name || '')}" autocomplete="off" maxlength="180"></label>
    <label class="stock-field"><span>Einheit</span>
      <input name="unit" value="${sicher(daten.unit || 'Stück')}" autocomplete="off" maxlength="20"></label>
    <label class="stock-field"><span>Warengruppe</span>
      <select name="groupKey">
        ${gruppen.map((gruppe) => `
          <option value="${sicher(gruppe.key)}"${gruppe.key === daten.groupKey ? ' selected' : ''}>
            ${sicher(gruppe.name)}
          </option>`).join('')}
      </select></label>
    <label class="stock-field"><span>Herstellernummer (freiwillig)</span>
      <input name="manufacturerNumber" value="${sicher(daten.manufacturerNumber || '')}" autocomplete="off" maxlength="80"></label>
    <div class="stock-field-pair">
      <label class="stock-field"><span>Mindestbestand</span>
        <input name="minimumStock" inputmode="decimal" value="${sicher(daten.minimumStock ?? '')}" autocomplete="off"></label>
      <label class="stock-field"><span>Zielbestand</span>
        <input name="targetStock" inputmode="decimal" value="${sicher(daten.targetStock ?? '')}" autocomplete="off"></label>
    </div>
    ${codeFelder(daten)}
    ${fehler ? `<p class="stock-error" role="alert">${sicher(fehler)}</p>` : ''}
    <button class="button button--action stock-save" type="button">Anlegen</button>
    <button class="button button--quiet stock-home" type="button">Abbrechen</button>
  </div>`;
}

/**
 * Die Codezeilen des Anlegeformulars.
 *
 * Ohne sie kann ein handangelegter Artikel nie einen Code bekommen und ist
 * damit nie scannbar. Leer lassen ist ausdruecklich erlaubt — dann bekommt er
 * spaeter ein eigenes Etikett, und der Hinweis sagt das auch.
 */
function codeFelder(daten) {
  const zeilen = (daten.barcodes || []).length ? daten.barcodes : [leereCodezeile()];

  return `<div class="stock-codes-edit">
    <p class="eyebrow">Codes</p>
    ${zeilen.map((zeile, index) => `
      <div class="stock-code-row" data-code-index="${index}">
        <label class="stock-field"><span>Code ${index + 1}</span>
          <input name="code" data-code-index="${index}" autocomplete="off" maxlength="64"
                 value="${sicher(zeile.code || '')}" placeholder="Barcode oder eigener Code"></label>
        <label class="stock-field"><span>Gebinde</span>
          <input name="packQuantity" data-code-index="${index}" inputmode="decimal" autocomplete="off"
                 value="${sicher(zeile.packQuantity ?? 1)}"></label>
      </div>`).join('')}
    <button class="button button--quiet stock-code-row-add" type="button">Weitere Codezeile</button>
    <p class="stock-hint">
      Kein Barcode auf der Ware? Dann leer lassen — nach dem Anlegen lässt sich
      ein eigenes Etikett drucken.
    </p>
  </div>`;
}

// ---------------------------------------------------------------------------
// Inventur
// ---------------------------------------------------------------------------

/**
 * Beim Zaehlen ist null eine gueltige Antwort: das Fach ist leer. Leer
 * gelassen ist dagegen keine Antwort — sonst wuerde ein versehentliches
 * Tippen einen Bestand ausbuchen.
 */
export function zaehlmengeAusText(text) {
  const menge = bestandsmengeAusText(text);
  if (menge === null || menge === undefined) return null;
  return menge;
}

export function inventurFortschritt(zeilen = []) {
  const gezaehlt = zeilen.filter((zeile) => zeile.countedQuantity !== null).length;
  return {
    gesamt: zeilen.length,
    gezaehlt,
    offen: zeilen.length - gezaehlt,
    abweichungen: zeilen.filter((zeile) => zeile.difference !== null && zeile.difference !== 0).length
  };
}

export function differenzText(differenz, einheit) {
  if (differenz === null || differenz === undefined) return 'noch nicht gezählt';
  if (differenz === 0) return 'stimmt';
  const zeichen = differenz > 0 ? '+' : '−';
  return `${zeichen}${mengeAlsText(Math.abs(differenz))} ${einheit || ''}`.trim();
}

export function differenzLage(differenz) {
  if (differenz === null || differenz === undefined) return 'offen';
  if (differenz === 0) return 'gut';
  return differenz > 0 ? 'mehr' : 'weniger';
}

/** Ein Scan waehrend der Inventur zaehlt, statt zu buchen. */
export function inventurScanVerarbeiten(zustand, antwort) {
  if (!antwort?.found || antwort.kind !== 'item') {
    return {
      ...zustand,
      fehler: antwort?.found === false
        ? 'Dieser Code gehört zu keinem Artikel. Während der Inventur wird nur gezählt.'
        : 'Während der Inventur wird nur gezählt.'
    };
  }

  const zeile = (zustand.inventur?.lines || []).find((eintrag) => eintrag.itemId === antwort.item.id);

  return {
    ...zustand,
    zaehlArtikel: {
      id: antwort.item.id,
      name: antwort.item.name,
      unit: antwort.item.unit,
      erwartet: zeile ? zeile.expectedQuantity : 0,
      bisher: zeile ? zeile.countedQuantity : null
    },
    menge: '',
    fehler: null
  };
}

export function zaehlungBauen(zustand) {
  if (!zustand.zaehlArtikel) return { fehler: 'Zuerst einen Artikel scannen.' };
  const menge = zaehlmengeAusText(zustand.menge);
  if (menge === null) return { fehler: 'Bitte eine gezählte Menge eintragen — null ist erlaubt.' };
  return { zaehlung: { itemId: zustand.zaehlArtikel.id, quantity: menge } };
}

export function inventurAnsicht(zustand, rechte = {}) {
  const inventur = zustand.inventur;
  if (!inventur) {
    return `<div class="stock-list">
      ${kopfzeile('Inventur')}
      <p class="stock-empty">Für diesen Lagerplatz läuft keine Inventur.</p>
      ${rechte.transfer
        ? '<button class="button button--action stock-inventory-start" type="button">Inventur starten</button>'
        : '<p class="stock-empty">Eine Inventur startet der Vorarbeiter.</p>'}
    </div>`;
  }

  const fortschritt = inventurFortschritt(inventur.lines);
  const zaehlung = zustand.zaehlArtikel;

  return `<div class="stock-list stock-inventory">
    ${kopfzeile('Inventur')}
    <p class="stock-inventory__where">${sicher(inventur.session.locationName)}</p>
    <p class="stock-inventory__progress">
      ${fortschritt.gezaehlt} von ${fortschritt.gesamt} gezählt${fortschritt.abweichungen
        ? ` · ${fortschritt.abweichungen} Abweichung${fortschritt.abweichungen === 1 ? '' : 'en'}`
        : ''}
    </p>

    ${zaehlung
      ? `<div class="stock-count">
          <p class="eyebrow">Gezählt wird</p>
          <h3 class="stock-count__name">${sicher(zaehlung.name)}</h3>
          <p class="stock-count__expected">Soll: ${sicher(mengeAlsText(zaehlung.erwartet))} ${sicher(zaehlung.unit)}</p>
          <div class="stock-amount">
            <label class="stock-amount__field">
              <span class="visually-hidden">Gezählte Menge</span>
              <input class="stock-amount__input stock-count__input" type="text"
                     inputmode="decimal" autocomplete="off" value="${sicher(zustand.menge)}"
                     placeholder="0">
            </label>
            <span class="stock-amount__unit">${sicher(zaehlung.unit)}</span>
          </div>
          <button class="button button--action stock-count-save" type="button">Zählung übernehmen</button>
        </div>`
      : '<button class="button button--action stock-scan" type="button">Artikel scannen</button>'}

    ${zustand.fehler ? `<p class="stock-error" role="alert">${sicher(zustand.fehler)}</p>` : ''}

    <ul class="stock-rows">
      ${inventur.lines.map((zeile) => `
        <li class="stock-row">
          <span class="stock-row__name">${sicher(zeile.itemName)}</span>
          <span class="stock-row__number">
            Soll ${sicher(mengeAlsText(zeile.expectedQuantity))}${zeile.countedQuantity !== null
              ? ` · gezählt ${sicher(mengeAlsText(zeile.countedQuantity))}` : ''}
          </span>
          <span class="stock-row__amount stock-row__amount--${differenzLage(zeile.difference)}">
            ${sicher(differenzText(zeile.difference, zeile.unit))}
          </span>
        </li>`).join('')}
    </ul>

    ${rechte.manage
      ? `<button class="button button--action stock-inventory-done" type="button">
           Inventur abschließen${fortschritt.offen ? ` (${fortschritt.offen} ungezählt)` : ''}
         </button>`
      : '<p class="stock-empty">Abschließen kann das Büro.</p>'}
    <button class="button button--quiet stock-inventory-cancel" type="button">Inventur abbrechen</button>
  </div>`;
}

// ---------------------------------------------------------------------------
// Codes und Etiketten
// ---------------------------------------------------------------------------

// Dieselben Masse wie der Geraetebogen: erprobt, passt auf eine A4-Seite und
// bleibt mit 18 mal 18 Millimetern sicher unter zwei Zentimetern.
export const ETIKETT_BOGEN = Object.freeze({
  maxEtiketten: 120,
  spalten: 10,
  reihen: 12,
  seiteBreiteMm: 210,
  seiteHoeheMm: 297,
  seitenrandMm: 5,
  zelleBreiteMm: 19.8,
  zelleHoeheMm: 23.5,
  spaltMm: 0.2,
  qrGroesseMm: 18
});

export function etikettBogenStile() {
  const b = ETIKETT_BOGEN;
  const breite = b.seiteBreiteMm - (2 * b.seitenrandMm);
  const hoehe = b.seiteHoeheMm - (2 * b.seitenrandMm);
  return `
    @page{size:A4 portrait;margin:${b.seitenrandMm}mm}
    *{box-sizing:border-box}
    html,body{margin:0;padding:0}
    body{font-family:system-ui,-apple-system,sans-serif;color:#111}
    .sheet{display:grid;grid-template-columns:repeat(${b.spalten},${b.zelleBreiteMm}mm);grid-auto-rows:${b.zelleHoeheMm}mm;gap:${b.spaltMm}mm;width:${breite}mm;align-content:start}
    .label{display:grid;grid-template-rows:${b.qrGroesseMm}mm 2.2mm 2.2mm;align-items:center;overflow:hidden;border:.15mm solid #aaa;padding:.3mm;text-align:center;break-inside:avoid;page-break-inside:avoid}
    .label__qr{display:grid;place-items:center;width:${b.qrGroesseMm}mm;height:${b.qrGroesseMm}mm;margin:auto}
    .label svg{display:block;width:${b.qrGroesseMm}mm;height:${b.qrGroesseMm}mm;max-width:${b.qrGroesseMm}mm;max-height:${b.qrGroesseMm}mm}
    .label strong,.label span{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:2.2mm}
    .label strong{font-size:4.5pt}
    .label span{font-size:4.2pt}
    @media screen{body{min-width:${b.seiteBreiteMm}mm;padding:${b.seitenrandMm}mm;background:#f4f4f5}.sheet{margin:auto;background:#fff}}
    @media print{html,body{width:${breite}mm;height:${hoehe}mm;overflow:hidden}.label{border-color:#000}}
  `;
}

/**
 * Baut den Druckbogen aus den Bildern, die die API liefert.
 *
 * Das SVG kommt aus der eigenen API und wird deshalb unveraendert eingesetzt;
 * alles andere — Name und Nummer unter dem Code — ist Text aus der Datenbank
 * und wird maskiert.
 */
export function etikettBogenHtml(labels = []) {
  const zellen = labels.slice(0, ETIKETT_BOGEN.maxEtiketten).map((etikett) => `
    <div class="label">
      <div class="label__qr">${etikett.svg || ''}</div>
      <strong>${sicher(etikett.label || '')}</strong>
      <span>${sicher(etikett.sublabel || '')}</span>
    </div>`).join('');

  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8">
<title>Lageretiketten</title>
<style>${etikettBogenStile()}</style>
</head><body><div class="sheet">${zellen}</div></body></html>`;
}

export function codeArtText(codeType) {
  if (codeType === 'gtin') return 'Herstellercode';
  if (codeType === 'code128') return 'Strichcode';
  return 'Eigener Code';
}

/** Eine leere Codezeile fuer das Formular. */
export function leereCodezeile() {
  return { code: '', codeType: 'internal', packQuantity: 1, isPrimary: false };
}

/**
 * Prueft einen einzeln nachgetragenen Code.
 *
 * Ein gescannter Code kommt als GTIN oder als Freitext herein; getippt wird er
 * genauso behandelt, damit derselbe Code auf beiden Wegen dasselbe ergibt.
 */
export function codeNachtragLesen(werte = {}) {
  const code = String(werte.code ?? '').trim();
  if (!code) return { fehler: 'Der Code fehlt.' };
  if (code.length > 64) return { fehler: 'Der Code ist zu lang.' };

  const menge = mengeAusText(werte.packQuantity ?? 1);
  if (menge === null) return { fehler: 'Die Gebindemenge ist keine gültige Menge.' };

  return {
    nachtrag: {
      code,
      codeType: werte.codeType === 'gtin' ? 'gtin' : 'internal',
      packQuantity: menge,
      isPrimary: werte.isPrimary === true
    }
  };
}

export function artikelCodesAnsicht(zustand, rechte = {}) {
  const artikel = zustand.artikel;
  if (!artikel) return '';

  const codes = zustand.codes || [];

  return `<div class="stock-list stock-codes">
    ${kopfzeile('Codes und Etikett')}
    <p class="stock-codes__item">${sicher(artikel.name)} · ${sicher(artikel.itemNumber)}</p>

    ${codes.length
      ? `<ul class="stock-rows">
          ${codes.map((code) => `
            <li class="stock-row">
              <span class="stock-row__name">${sicher(code.code)}</span>
              <span class="stock-row__number">
                ${sicher(codeArtText(code.codeType))}${code.packQuantity > 1
                  ? ` · Gebinde ${sicher(mengeAlsText(code.packQuantity))}` : ''}${code.isPrimary ? ' · Hauptcode' : ''}
              </span>
              ${rechte.manage
                ? `<button class="button button--quiet stock-code-revoke" type="button"
                           data-code="${sicher(code.id)}">Zurücknehmen</button>`
                : ''}
            </li>`).join('')}
        </ul>`
      : `<p class="stock-empty">
           Dieser Artikel hat keinen Code — er lässt sich also nicht scannen.
           ${rechte.manage ? 'Entweder einen Herstellercode hinzufügen oder ein eigenes Etikett drucken.' : ''}
         </p>`}

    ${zustand.fehler ? `<p class="stock-error" role="alert">${sicher(zustand.fehler)}</p>` : ''}

    ${rechte.manage
      ? `<div class="stock-code-add">
           <label class="stock-field"><span>Code hinzufügen</span>
             <input class="stock-code-input" name="code" autocomplete="off" maxlength="64"
                    value="${sicher(zustand.codeEntwurf?.code || '')}" placeholder="Scannen oder eintippen"></label>
           <label class="stock-field"><span>Gebindemenge</span>
             <input class="stock-code-pack" name="packQuantity" inputmode="decimal" autocomplete="off"
                    value="${sicher(zustand.codeEntwurf?.packQuantity ?? 1)}"></label>
           <button class="button button--secondary stock-code-scan" type="button">Code scannen</button>
           <button class="button button--action stock-code-save" type="button">Code hinzufügen</button>
         </div>
         <button class="button button--action stock-label-print" type="button">Eigenes Etikett drucken</button>`
      : ''}
    <button class="button button--quiet stock-home" type="button">Zurück</button>
  </div>`;
}

// ---------------------------------------------------------------------------
// Bestellungen
// ---------------------------------------------------------------------------

export function bestellStatusText(status) {
  return BESTELLSTATUS[status] || status || '';
}

export function bestellungFortschritt(zeilen = []) {
  return {
    positionen: zeilen.length,
    offen: zeilen.filter((zeile) => zeile.quantityOpen > 0).length,
    vollstaendig: zeilen.length > 0 && zeilen.every((zeile) => zeile.quantityOpen === 0)
  };
}

/**
 * Baut den Wareneingang aus den eingetragenen Mengen.
 *
 * Gebucht wird nur, was tatsaechlich eingetragen wurde — eine leere Zeile
 * heisst "nicht geliefert" und nicht "null geliefert". Jede Zeile bekommt eine
 * eigene, aus dem Vorgang abgeleitete Nummer, damit eine wiederholte
 * Uebertragung Zeile fuer Zeile erkannt wird und nicht nur als Ganzes.
 */
export function wareneingangBauen(zustand, optionen = {}) {
  if (!zustand.bestellung) return { fehler: 'Es ist keine Bestellung geöffnet.' };
  if (!zustand.ort) return { fehler: 'Zuerst den Lagerplatz scannen oder auswählen.' };

  const vorgangId = optionen.vorgangId || neueVorgangId();
  const eingaben = zustand.eingang || {};
  const zeilen = [];

  for (const zeile of zustand.bestellung.lines) {
    const eingabe = eingaben[zeile.id];
    if (eingabe === undefined || eingabe === null || String(eingabe).trim() === '') continue;

    const menge = mengeAusText(eingabe);
    if (menge === null) {
      return { fehler: `Die Menge bei „${zeile.itemName}" ist keine gültige Menge.` };
    }
    zeilen.push({
      purchaseOrderItemId: zeile.id,
      quantity: menge,
      clientOperationId: `${vorgangId}-${zeile.linePosition}`
    });
  }

  if (!zeilen.length) return { fehler: 'Bitte für mindestens eine Position eine Menge eintragen.' };

  return {
    vorgangId,
    eingang: { locationId: zustand.ort.id, sourceType: 'api', lines: zeilen }
  };
}

/** Vorbelegung des Wareneingangs: was offen ist, wird als geliefert angeboten. */
export function eingangVorbelegen(bestellung) {
  const werte = {};
  for (const zeile of bestellung?.lines || []) {
    if (zeile.quantityOpen > 0) werte[zeile.id] = mengeAlsText(zeile.quantityOpen);
  }
  return werte;
}

export function bestellungenAnsicht(bestellungen = [], rechte = {}, fehler = null) {
  return `<div class="stock-list">
    ${kopfzeile('Bestellungen')}
    ${fehler ? `<p class="stock-error" role="alert">${sicher(fehler)}</p>` : ''}
    ${bestellungen.length
      ? `<ul class="stock-rows">
          ${bestellungen.map((eintrag) => `
            <li class="stock-row stock-row--tap" data-bestellung="${sicher(eintrag.id)}">
              <span class="stock-row__name">${sicher(eintrag.supplierName || '')}</span>
              <span class="stock-row__number">${sicher(eintrag.orderNumber)}</span>
              <span class="stock-row__amount stock-row__amount--${eintrag.status === 'partially_received' ? 'knapp' : 'offen'}">
                ${sicher(bestellStatusText(eintrag.status))}
              </span>
            </li>`).join('')}
        </ul>`
      : '<p class="stock-empty">Keine offene Bestellung.</p>'}
    ${rechte.manage
      ? '<button class="button button--quiet stock-order-from-reorder" type="button">Aus dem Nachbestellvorschlag erzeugen</button>'
      : ''}
  </div>`;
}

export function bestellungAnsicht(zustand, rechte = {}) {
  const bestellung = zustand.bestellung;
  if (!bestellung) return '';

  const fortschritt = bestellungFortschritt(bestellung.lines);
  const offen = ['ordered', 'partially_received'].includes(bestellung.order.status);
  const eingaben = zustand.eingang || {};

  return `<div class="stock-list stock-order">
    ${kopfzeile(bestellung.order.orderNumber)}
    <p class="stock-order__supplier">${sicher(bestellung.order.supplierName || '')}</p>
    <p class="stock-order__status">
      ${sicher(bestellStatusText(bestellung.order.status))} ·
      ${fortschritt.offen} von ${fortschritt.positionen} Position${fortschritt.positionen === 1 ? '' : 'en'} offen
    </p>

    ${offen && rechte.manage ? ortLeiste(zustand.ort) : ''}

    <ul class="stock-rows">
      ${bestellung.lines.map((zeile) => `
        <li class="stock-row stock-row--order-line">
          <span class="stock-row__name">${sicher(zeile.itemName)}</span>
          <span class="stock-row__number">
            ${sicher(mengeAlsText(zeile.quantityReceived))} von ${sicher(mengeAlsText(zeile.quantityOrdered))} ${sicher(zeile.unit)} geliefert
          </span>
          ${offen && rechte.manage
            ? `<label class="stock-order__field">
                 <span class="visually-hidden">Geliefert für ${sicher(zeile.itemName)}</span>
                 <input class="stock-order__input" type="text" inputmode="decimal" autocomplete="off"
                        data-position="${sicher(zeile.id)}" value="${sicher(eingaben[zeile.id] ?? '')}"
                        placeholder="0">
               </label>`
            : `<span class="stock-row__amount stock-row__amount--${zeile.quantityOpen > 0 ? 'knapp' : 'gut'}">
                 ${zeile.quantityOpen > 0 ? `noch ${sicher(mengeAlsText(zeile.quantityOpen))}` : 'vollständig'}
               </span>`}
        </li>`).join('')}
    </ul>

    ${zustand.fehler ? `<p class="stock-error" role="alert">${sicher(zustand.fehler)}</p>` : ''}

    ${bestellung.order.status === 'draft' && rechte.manage
      ? '<button class="button button--action stock-order-send" type="button">Bestellen</button>'
      : ''}
    ${offen && rechte.manage
      ? '<button class="button button--action stock-order-receive" type="button">Wareneingang buchen</button>'
      : ''}
    ${['draft', 'ordered'].includes(bestellung.order.status) && rechte.manage
      ? '<button class="button button--quiet stock-order-cancel" type="button">Bestellung stornieren</button>'
      : ''}
    <button class="button button--quiet stock-home" type="button">Zurück</button>
  </div>`;
}

export function ansichtFuer(zustand, rechte, optionen = {}) {
  if (zustand.schritt === SCHRITTE.INVENTUR) return inventurAnsicht(zustand, rechte);
  if (zustand.schritt === SCHRITTE.BESTELLUNGEN) {
    return bestellungenAnsicht(optionen.bestellungen, rechte, zustand.fehler);
  }
  if (zustand.schritt === SCHRITTE.BESTELLUNG) return bestellungAnsicht(zustand, rechte);
  if (zustand.schritt === SCHRITTE.ARTIKEL_CODES) return artikelCodesAnsicht(zustand, rechte);
  if (zustand.schritt === SCHRITTE.BUCHEN) return buchenAnsicht(zustand, rechte, optionen);
  if (zustand.schritt === SCHRITTE.BESTAETIGT) return bestaetigungAnsicht(zustand);
  if (zustand.schritt === SCHRITTE.UNBEKANNT) return unbekanntAnsicht(zustand, rechte);
  if (zustand.schritt === SCHRITTE.BESTAND) return bestandAnsicht(optionen.bestand);
  if (zustand.schritt === SCHRITTE.ORTE) return orteAnsicht(optionen.orte, zustand.ort?.id || null);
  if (zustand.schritt === SCHRITTE.ARTIKEL) {
    return artikelListeAnsicht(optionen.artikel, rechte, zustand.suche);
  }
  if (zustand.schritt === SCHRITTE.NACHBESTELLUNG) return nachbestellungAnsicht(optionen.vorschlaege);
  if (zustand.schritt === SCHRITTE.ARTIKEL_NEU) {
    return artikelFormularAnsicht(zustand.entwurf, optionen.gruppen, zustand.fehler);
  }
  return startAnsicht(zustand, rechte);
}
