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
  LIEFERSCHEINE: 'lieferscheine',
  LIEFERSCHEIN: 'lieferschein',
  RUECKGABE: 'rueckgabe',
  ARTIKEL_CODES: 'artikelCodes',
  ARTIKEL_AENDERN: 'artikelAendern',
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
  // "Auf der Baustelle" und "verbaut" sind zwei verschiedene Dinge, und die
  // Verwechslung ist der haeufigste Fehler in der Materialabrechnung. Wer
  // verbaut hat, weiss es zuerst - deshalb darf er es auch buchen.
  verbaut: { movementType: 'consumed', ort: 'quelle', name: 'Verbaut', recht: 'alle' },
  umlagerung: { movementType: 'transfer', ort: 'beides', name: 'Umlagern', recht: 'transfer' },
  wareneingang: { movementType: 'receipt', ort: 'ziel', name: 'Wareneingang', recht: 'verwaltung' },
  anfangsbestand: { movementType: 'opening', ort: 'ziel', name: 'Anfangsbestand', recht: 'verwaltung' },
  verschrottung: { movementType: 'scrap', ort: 'quelle', name: 'Verschrotten', recht: 'verwaltung' }
});

// Nur diese beiden Vorgaenge tragen eine Baustelle. Eine Umlagerung geht von
// Lager zu Lager, ein Wareneingang kommt vom Lieferanten, und Verschrottung
// und Anfangsbestand gehen keine Baustelle etwas an.
export const BAUSTELLE_BUCHBAR = new Set(['issue', 'return', 'consumed']);

export function offlineLagerQueueKey(session) {
  return `schaefchen-stock-queue-v1:${session?.company?.number || 'unknown'}:${session?.user?.id || 'unknown'}`;
}

export function ortSpeicherKey(session) {
  return `schaefchen-stock-place-v1:${session?.company?.number || 'unknown'}:${session?.user?.id || 'unknown'}`;
}

export function scanSpeicherKey(session) {
  return `schaefchen-stock-scans-v1:${session?.company?.number || 'unknown'}:${session?.user?.id || 'unknown'}`;
}

export function baustellenSpeicherKey(session) {
  return `schaefchen-stock-sites-v1:${session?.company?.number || 'unknown'}:${session?.user?.id || 'unknown'}`;
}

/**
 * Die Auswahlliste der Baustellen, in zwei Gruppen.
 *
 * Oben stehen die aus dem eigenen Tagesplan: wer den ganzen Tag in derselben
 * Wohnung arbeitet, soll seine Baustelle nicht in einer Liste mit achtzig
 * Eintraegen suchen. Darunter der Rest des Betriebs, denn der Lagerist gibt
 * Material fuer Baustellen heraus, auf denen er selbst nie steht.
 *
 * Doppelte fallen heraus - eine Baustelle steht in genau einer Gruppe.
 */
export function baustellenListe(eigene = [], alle = []) {
  const sauber = (liste) => (Array.isArray(liste) ? liste : [])
    .filter((baustelle) => baustelle?.id)
    .map((baustelle) => ({
      id: baustelle.id,
      name: baustelle.name || 'Ohne Namen',
      siteNumber: baustelle.siteNumber || null
    }));

  const meine = [];
  const gesehen = new Set();
  for (const baustelle of sauber(eigene)) {
    if (gesehen.has(baustelle.id)) continue;
    gesehen.add(baustelle.id);
    meine.push(baustelle);
  }

  const weitere = [];
  for (const baustelle of sauber(alle)) {
    if (gesehen.has(baustelle.id)) continue;
    gesehen.add(baustelle.id);
    weitere.push(baustelle);
  }

  return { meine, weitere };
}

/**
 * Steht die gewaehlte Baustelle ueberhaupt noch zur Wahl?
 *
 * Wird sie abgeschlossen, waehrend die App offen ist, faellt sie aus der
 * Liste - die Kennung im Zustand bliebe aber stehen und wuerde stumm
 * mitgebucht, ohne dass jemand sie noch im Feld sieht.
 */
export function baustelleNochWaehlbar(baustelleId, liste) {
  if (!baustelleId) return true;
  return [...(liste?.meine || []), ...(liste?.weitere || [])]
    .some((baustelle) => baustelle.id === baustelleId);
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
    // In welcher Einheit gerade getippt wird: 'einzeln' oder 'gebinde'.
    // Gebucht wird immer in der Einheit des Artikels; die Umrechnung passiert
    // erst in `buchungBauen`, damit im Journal genau eine Wahrheit steht.
    einheit: 'einzeln',
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
    // Welche Artikel oder Lagerplaetze fuer den Etikettenbogen angehakt sind.
    // Eine Liste von Kennungen, keine Menge: der Zustand wird kopiert, und ein
    // Set haette das nicht ueberlebt.
    druckwahl: [],
    inventur: null,
    // Der geoeffnete Lieferschein samt Positionen und Bestellabgleich.
    lieferschein: null,
    // Die Baustellenübersicht für die schnelle Rückgabe.
    rueckgabe: null,
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
 * Welche Einheiten stehen fuer diesen Artikel zur Wahl?
 *
 * Immer das Einzelstueck - eine einzelne Dose aus dem Karton zu nehmen ist der
 * Alltag und darf nie versperrt sein. Dazu das Gebinde, wenn es eines gibt.
 *
 * Woher das Gebinde kommt, hat eine Rangfolge: Wer gerade einen Kartoncode
 * gescannt hat, haelt diesen Karton in der Hand - dessen Menge zaehlt, auch
 * wenn am Artikel ein anderes Gebinde steht. Sonst gilt das Gebinde des
 * Artikels. Angeboten werden bewusst hoechstens zwei Einheiten; drei Knoepfe
 * vor dem Regal sind einer zu viel.
 */
export function einheitenFuer(artikel, gebindeAusScan = 1) {
  const einzeln = {
    schluessel: 'einzeln',
    name: artikel?.unit || 'Stück',
    faktor: 1
  };

  const ausScan = Number(gebindeAusScan) > 1 ? Number(gebindeAusScan) : null;
  const ausArtikel = Number(artikel?.packSize) > 1 ? Number(artikel.packSize) : null;
  const faktor = ausScan || ausArtikel;
  if (!faktor) return [einzeln];

  // Der Name gehoert nur dann zum Gebinde des Artikels, wenn auch dessen
  // Stueckzahl gilt. Ein gescannter Zehnerpack heisst nicht "Karton", nur
  // weil am Artikel ein Karton steht.
  const name = faktor === ausArtikel && artikel?.packName ? artikel.packName : 'Gebinde';

  return [einzeln, { schluessel: 'gebinde', name, faktor }];
}

/** Der Umrechnungsfaktor der gerade gewaehlten Einheit. */
export function faktorFuer(zustand) {
  const einheiten = einheitenFuer(zustand.artikel, zustand.gebinde);
  const gewaehlt = einheiten.find((eintrag) => eintrag.schluessel === zustand.einheit);
  return gewaehlt ? gewaehlt.faktor : 1;
}

/**
 * Was gerade getippt wurde, in den Worten des Monteurs: "2 Karton".
 *
 * Leer, solange in Einzelstuecken gebucht wird — dort sagt die Menge mit ihrer
 * Einheit schon alles, und "5 Stück (5 Stück)" waere Geschwaetz.
 */
export function gebindeText(zustand) {
  const faktor = faktorFuer(zustand);
  if (faktor <= 1) return null;

  const einheiten = einheitenFuer(zustand.artikel, zustand.gebinde);
  const gewaehlt = einheiten.find((eintrag) => eintrag.schluessel === zustand.einheit);
  const menge = mengeAusText(zustand.menge);
  if (menge === null) return null;

  return `${mengeAlsText(menge)} ${gewaehlt.name}`;
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

    // Wer den Kartoncode scannt, meint den Karton: dann steht die Einheit auf
    // Gebinde und die Menge auf eins. Ein Griff auf "Einzeln" holt trotzdem
    // die einzelne Dose heraus - der Karton in der Hand ist kein Zwang.
    const einheiten = einheitenFuer(antwort.item, gebinde);
    const gebindeGewaehlt = gebinde > 1 && einheiten.length > 1;

    return {
      ...zustand,
      schritt: SCHRITTE.BUCHEN,
      artikel: antwort.item,
      bestandAmOrt: bestand ? bestand.quantity : (zustand.ort ? 0 : null),
      // Aus dem Zwischenspeicher: die Zahl stimmte, als zuletzt Netz da war.
      bestandVeraltet: Boolean(antwort.offline),
      einheit: gebindeGewaehlt ? 'gebinde' : 'einzeln',
      gebinde,
      menge: '1',
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

  const getippt = mengeAusText(zustand.menge);
  if (getippt === null) return { fehler: 'Bitte eine Menge größer als null eingeben.' };

  // Hier und nur hier wird aus "zwei Kartons" die Zahl, die ins Journal geht.
  // Der Bestand kennt ausschliesslich die Einheit des Artikels; ein zweiter
  // Bestand in Gebinden koennte davon abweichen, und niemand wuesste, welcher
  // stimmt.
  const menge = Math.round(getippt * faktorFuer(zustand) * 1000) / 1000;

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
  // Verbaut ohne Baustelle waere keine Aussage: verbraucht wurde es dann
  // zwar, aber niemand koennte sagen, wofuer.
  if (vorgang.movementType === 'consumed' && !zustand.baustelleId) {
    return { fehler: 'Verbautes Material gehört zu einer Baustelle. Bitte die Baustelle wählen.' };
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

  // Die Baustelle haengt an beiden Richtungen: bei der Entnahme sagt sie,
  // wohin das Material geht, bei der Rueckgabe, woher es kommt. Vorher trug
  // nur die Entnahme sie mit — die Rueckgabe verlor damit genau die Angabe,
  // an der spaeter haengt, was eine Baustelle wirklich verbraucht hat.
  if (zustand.baustelleId && BAUSTELLE_BUCHBAR.has(vorgang.movementType)) {
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
export function buchungVerarbeiten(zustand, antwort, optionen = {}) {
  const bestand = (antwort?.levels || []).find((zeile) => zeile.locationId === zustand.ort?.id);

  // Die Baustelle steht in der Bestaetigung, weil sie sonst nirgends mehr
  // auftaucht: die Auswahl bleibt fuer die naechste Buchung stehen, und eine
  // falsche waere ohne diesen Satz erst im Journal aufgefallen.
  const liste = baustellenListe(optionen.eigeneBaustellen, optionen.baustellen);
  const baustelle = BAUSTELLE_BUCHBAR.has(VORGAENGE[zustand.vorgang]?.movementType)
    ? [...liste.meine, ...liste.weitere].find((eintrag) => eintrag.id === zustand.baustelleId)
    : null;

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
      menge: Math.round((mengeAusText(zustand.menge) ?? 0) * faktorFuer(zustand) * 1000) / 1000,
      einheit: zustand.artikel?.unit || '',
      // Was der Monteur getippt hat, in seinen Worten: "2 Karton". Steht
      // neben der gebuchten Menge, damit beides zusammenpasst.
      gewaehlt: gebindeText(zustand),
      vorgang: VORGAENGE[zustand.vorgang]?.name || '',
      baustelle: baustelle?.name || null,
      // Bei der Entnahme geht das Material hin, bei der Rueckgabe kommt es
      // her. Ein Satz, den auch jemand versteht, der nur kurz hinschaut.
      baustelleRichtung: VORGAENGE[zustand.vorgang]?.movementType === 'return' ? 'von' : 'auf',
      neuerBestand: offline ? null : (bestand ? bestand.quantity : null),
      wiederholt: Boolean(antwort?.repeated),
      offline
    },
    artikel: null,
    bestandAmOrt: null,
    einheit: 'einzeln',
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

/**
 * Was das Lager zu einer Zeile der Baustellen-Materialliste sagt.
 *
 * Die Liste der Baustelle beantwortet "was brauchen wir hier", das Lager "wie
 * viel liegt wo". Erst die Verknuepfung beider erlaubt die Frage, die auf der
 * Baustelle wirklich gestellt wird: reicht das, was wir haben?
 *
 * Drei Faelle, und der erste ist der wichtigste:
 *
 *   * Ohne Artikel gibt es keine Aussage. Nicht "nichts da" - das waere
 *     gelogen. Eine Kernbohrung hat keinen Lagerbestand und braucht keinen.
 *   * Passen die Einheiten nicht zusammen ("Meter" am Eintrag, "Rolle" am
 *     Artikel), wird der Bestand gezeigt, aber nicht verrechnet. 120 Rollen
 *     sind nicht 120 Meter, und eine falsche Rechnung waere schlimmer als
 *     keine: danach bestellt jemand nicht, was fehlt.
 *   * Sonst wird verglichen und die Fehlmenge genannt.
 */
export function materialBestand(eintrag) {
  if (!eintrag?.stockItemId) return { lage: 'ohne-artikel' };

  const bestand = Number(eintrag.stockQuantity ?? 0);
  const gebraucht = Number(eintrag.quantity ?? 0);
  const einheit = eintrag.stockUnit || eintrag.unit || '';
  const vergleichbar = String(eintrag.stockUnit || '').trim().toLowerCase()
    === String(eintrag.unit || '').trim().toLowerCase();

  const grund = {
    artikelnummer: eintrag.stockItemNumber || null,
    bestand,
    einheit
  };

  if (!vergleichbar) {
    return { ...grund, lage: 'einheiten-verschieden' };
  }
  if (bestand >= gebraucht) {
    return { ...grund, lage: 'reicht', fehlt: 0 };
  }

  const fehlt = Math.round((gebraucht - bestand) * 1000) / 1000;

  // Was zurueckgelegt oder bestellt ist, fehlt nicht mehr - es ist nur noch
  // nicht da. Ohne diese Unterscheidung staende an einer laengst bestellten
  // Zeile weiter "es fehlen 180 Meter", und jemand bestellt ein zweites Mal.
  const veranlasst = Math.round(
    (Number(eintrag.reservedQuantity || 0) + Number(eintrag.orderedQuantity || 0)) * 1000
  ) / 1000;
  const offen = Math.max(Math.round((gebraucht - Math.max(bestand, veranlasst)) * 1000) / 1000, 0);
  if (veranlasst > 0 && offen <= 0) {
    return { ...grund, lage: 'veranlasst', fehlt, offen: 0 };
  }

  return {
    ...grund,
    lage: bestand <= 0 ? 'nichts-da' : 'reicht-nicht',
    fehlt,
    offen: veranlasst > 0 ? offen : fehlt
  };
}

/** Ein Satz aus `materialBestand`, so wie er an der Baustellenzeile steht. */
export function materialBestandText(eintrag) {
  const lage = materialBestand(eintrag);
  const menge = (wert) => `${mengeAlsText(wert)} ${lage.einheit}`.trim();

  switch (lage.lage) {
    case 'ohne-artikel':
      return null;
    case 'einheiten-verschieden':
      return `Lager: ${menge(lage.bestand)} — andere Einheit, bitte selbst prüfen`;
    case 'reicht':
      return `Auf Lager: ${menge(lage.bestand)}`;
    case 'veranlasst':
      return `Auf Lager: ${menge(lage.bestand)} — der Rest ist veranlasst`;
    case 'nichts-da':
      return `Nicht auf Lager — es fehlen ${menge(lage.offen)}`;
    default:
      return `Auf Lager: ${menge(lage.bestand)} — es fehlen ${menge(lage.offen)}`;
  }
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
/**
 * Macht aus einem gespeicherten Artikel den Entwurf fuers Aendern.
 *
 * Die Warengruppe kommt als Schluessel zurueck und nicht als Kennung: das
 * Formular waehlt danach aus, und die Schnittstelle nimmt beides.
 */
export function artikelAlsEntwurf(artikel, gruppen = []) {
  if (!artikel) return null;
  const gruppe = gruppen.find((eintrag) => eintrag.id === artikel.groupId);

  return {
    itemNumber: artikel.itemNumber || '',
    name: artikel.name || '',
    unit: artikel.unit || '',
    groupKey: gruppe?.key || '',
    manufacturerNumber: artikel.manufacturerNumber || '',
    minimumStock: artikel.minimumStock ?? '',
    targetStock: artikel.targetStock ?? '',
    packName: artikel.packName || '',
    packSize: artikel.packSize ?? '',
    rowVersion: artikel.rowVersion
  };
}

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

export function startAnsicht(zustand, rechte = {}, optionen = {}) {
  const kacheln = [
    `<button class="stock-tile stock-tile--stock" type="button" data-ziel="bestand">
       <span class="stock-tile__name">Bestand</span>
       <span class="stock-tile__hint">Was liegt wo</span>
     </button>`
  ];

  // Die Rueckgabe steht ganz oben und nicht im Buerobereich: sie ist der Weg,
  // den der Monteur abends geht, und sie erscheint nur, wenn er heute
  // ueberhaupt auf einer Baustelle ist. Eine Kachel, die zu nichts fuehrt,
  // waere schlimmer als keine.
  if (optionen.eigeneBaustelleId) {
    kacheln.push(`<button class="stock-tile stock-tile--return" type="button" data-ziel="rueckgabe">
       <span class="stock-tile__name">Zurückgeben</span>
       <span class="stock-tile__hint">Restmaterial von der Baustelle</span>
     </button>`);
  }

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
    kacheln.push(`<button class="stock-tile" type="button" data-ziel="lieferscheine">
       <span class="stock-tile__name">Lieferscheine</span>
       <span class="stock-tile__hint">Erfassen und buchen</span>
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

/** Was aus der getippten Menge im Bestand wird — in der Einheit des Artikels. */
export function gebuchteMengeText(zustand) {
  const getippt = mengeAusText(zustand.menge);
  if (getippt === null) return bestandText(0, zustand.artikel?.unit);
  const menge = Math.round(getippt * faktorFuer(zustand) * 1000) / 1000;
  return bestandText(menge, zustand.artikel?.unit);
}

export function buchenAnsicht(zustand, rechte = {}, optionen = {}) {
  const artikel = zustand.artikel;
  if (!artikel) return '';

  const vorgaenge = verfuegbareVorgaenge(rechte);
  const lage = bestandLage(zustand.bestandAmOrt, artikel.minimumStock);

  const einheiten = einheitenFuer(artikel, zustand.gebinde);
  const faktor = faktorFuer(zustand);

  // Die Wahl steht ueber der Menge, nicht darunter: erst entscheidet man, wovon
  // man spricht, dann wie viel davon.
  const einheitenWahl = einheiten.length > 1
    ? `<div class="stock-units" role="group" aria-label="Einheit">
        ${einheiten.map((eintrag) => `
          <button class="stock-unit${eintrag.schluessel === zustand.einheit ? ' stock-unit--aktiv' : ''}"
                  type="button" data-einheit="${sicher(eintrag.schluessel)}"
                  aria-pressed="${eintrag.schluessel === zustand.einheit ? 'true' : 'false'}">
            <span class="stock-unit__name">${sicher(eintrag.name)}</span>
            ${eintrag.faktor > 1
              ? `<span class="stock-unit__hint">${sicher(mengeAlsText(eintrag.faktor))} ${sicher(artikel.unit)}</span>`
              : '<span class="stock-unit__hint">einzeln</span>'}
          </button>`).join('')}
      </div>`
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

      ${einheitenWahl}

      <div class="stock-amount">
        <button class="button button--secondary stock-amount__step" type="button" data-schritt="-1" aria-label="Menge verringern">−</button>
        <label class="stock-amount__field">
          <span class="visually-hidden">Menge in ${sicher(artikel.unit)}</span>
          <input class="stock-amount__input" type="text" inputmode="decimal"
                 autocomplete="off" value="${sicher(zustand.menge)}">
        </label>
        <span class="stock-amount__unit">${sicher(einheiten.find((eintrag) => eintrag.schluessel === zustand.einheit)?.name || artikel.unit)}</span>
        <button class="button button--secondary stock-amount__step" type="button" data-schritt="1" aria-label="Menge erhöhen">+</button>
      </div>
      ${faktor > 1 ? `<p class="stock-pack-sum">Das sind ${sicher(gebuchteMengeText(zustand))}.</p>` : ''}

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
        ? `<button class="button button--quiet stock-codes-open" type="button">Codes und Etikett</button>
           <button class="button button--quiet stock-item-edit" type="button">Artikel ändern</button>`
        : ''}
      <button class="button button--quiet stock-cancel" type="button">Abbrechen</button>
    </div>`;
}

function baustellenFeld(zustand, optionen = {}) {
  const liste = baustellenListe(optionen.eigeneBaustellen, optionen.baustellen);
  if (!liste.meine.length && !liste.weitere.length) return '';

  const pflicht = optionen.baustellePflicht;
  const eintrag = (baustelle) => `
    <option value="${sicher(baustelle.id)}"${baustelle.id === zustand.baustelleId ? ' selected' : ''}>
      ${sicher(baustelle.siteNumber ? `${baustelle.name} (${baustelle.siteNumber})` : baustelle.name)}
    </option>`;

  // Zwei Gruppen nur, wenn es beide gibt: eine einzelne Gruppe mit
  // Ueberschrift ist eine Ueberschrift ohne Aussage.
  const felder = liste.meine.length && liste.weitere.length
    ? `<optgroup label="Meine Baustellen">${liste.meine.map(eintrag).join('')}</optgroup>
       <optgroup label="Weitere Baustellen">${liste.weitere.map(eintrag).join('')}</optgroup>`
    : [...liste.meine, ...liste.weitere].map(eintrag).join('');

  return `
    <label class="stock-site">
      <span>Baustelle${pflicht ? '' : ' (freiwillig)'}</span>
      <select class="stock-site__select">
        <option value="">${pflicht ? 'Bitte wählen' : 'Ohne Baustelle'}</option>
        ${felder}
      </select>
      <span class="stock-site__hint">
        Beim Entnehmen geht das Material auf diese Baustelle, beim Zurückgeben
        kommt es von dort ins Lager zurück.
      </span>
    </label>`;
}

export function bestaetigungAnsicht(zustand) {
  const b = zustand.bestaetigung;
  if (!b) return '';

  return `
    <div class="stock-done">
      <p class="stock-done__mark" aria-hidden="true">✓</p>
      <h2 class="stock-done__title">${sicher(b.vorgang)}: ${sicher(mengeAlsText(b.menge))} ${sicher(b.einheit)}</h2>
      ${b.gewaehlt ? `<p class="stock-done__pack">${sicher(b.gewaehlt)}</p>` : ''}
      <p class="stock-done__item">${sicher(b.artikelName)}</p>
      ${b.baustelle
        ? `<p class="stock-done__site">${sicher(b.baustelleRichtung === 'von' ? 'Zurück von' : 'Für')} Baustelle ${sicher(b.baustelle)}</p>`
        : ''}
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
function gebindeAusFormular(werte) {
  const name = String(werte.packName ?? '').trim();
  const groesse = bestandsmengeAusText(werte.packSize);

  if (groesse === undefined) {
    return { pack: {}, packFehler: 'Die Stückzahl im Gebinde ist keine gültige Menge.' };
  }
  if (groesse === null && !name) return { pack: { size: null, name: null } };
  if (groesse === null) {
    return { pack: {}, packFehler: 'Zum Gebinde fehlt die Stückzahl.' };
  }
  if (!name) {
    return { pack: {}, packFehler: 'Das Gebinde braucht einen Namen — Karton, Rolle, Bund.' };
  }
  if (groesse <= 1) {
    return {
      pack: {},
      packFehler: 'Ein Gebinde enthält mehr als ein Stück; sonst ist es das Stück selbst.'
    };
  }
  return { pack: { size: groesse, name } };
}

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

  // Dieselben drei Regeln wie in der Schnittstelle und in der Datenbank. Sie
  // hier zu wiederholen ist kein Zufall: der Monteur soll den Fehler sehen,
  // bevor das Formular weggeschickt wird.
  const { pack, packFehler } = gebindeAusFormular(werte);

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
  if (packFehler) return { fehler: packFehler };
  if (pack.size !== null) {
    entwurf.packSize = pack.size;
    entwurf.packName = pack.name;
  }
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
export function orteAnsicht(orte = [], aktiv = null, rechte = {}, wahl = []) {
  if (!orte.length) {
    return `<div class="stock-list">
      ${kopfzeile('Lagerplatz')}
      <p class="stock-empty">Für diese Firma ist kein Lagerplatz angelegt.</p>
    </div>`;
  }

  const gewaehlt = new Set(wahl);

  return `<div class="stock-list">
    ${kopfzeile('Lagerplatz')}
    <ul class="stock-rows">
      ${orte.map((ort) => `
        <li class="stock-row stock-row--tap${ort.id === aktiv ? ' stock-row--gewaehlt' : ''}"
            data-ort="${sicher(ort.id)}">
          ${rechte.manage
            ? `<label class="stock-pick" title="Für den Etikettenbogen">
                 <input type="checkbox" class="stock-pick__box" data-wahl="${sicher(ort.id)}"
                        ${gewaehlt.has(ort.id) ? 'checked' : ''}>
               </label>`
            : ''}
          <span class="stock-row__name">${sicher(ort.name)}</span>
          <span class="stock-row__number">${sicher(ort.path || ort.name)}</span>
          ${ort.id === aktiv ? '<span class="stock-row__amount">gewählt</span>' : ''}
        </li>`).join('')}
    </ul>
    ${rechte.manage
      ? `<div class="stock-sheet">
           <button class="button button--quiet stock-sheet-all" type="button">
             ${gewaehlt.size === orte.length ? 'Auswahl aufheben' : 'Alle auswählen'}
           </button>
           ${druckKnopf(gewaehlt.size)}
         </div>`
      : ''}
  </div>`;
}

/**
 * Was von einer Bestandszeile reserviert ist.
 *
 * Nur wenn es etwas zu sagen gibt: "reserviert 0" an jeder Zeile waere Laerm.
 * Der physische Bestand steht weiter rechts wie bisher - er ist die Zahl, die
 * jemand im Regal nachzaehlen kann. Frei verfuegbar ist die Zahl, nach der
 * gehandelt wird, und sie gehoert deshalb daneben und nicht anstelle.
 */
function reservierungsZusatz(zeile) {
  const reserviert = Number(zeile.reservedQuantity || 0);
  if (!reserviert) return '';
  return ` · ${mengeAlsText(reserviert)} reserviert, frei ${mengeAlsText(Number(zeile.freeQuantity || 0))}`;
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
              <span class="stock-row__number">
                ${sicher(zeile.itemNumber)}${reservierungsZusatz(zeile)}
              </span>
              <span class="stock-row__amount stock-row__amount--${bestandLage(zeile.quantity)}">
                ${sicher(bestandText(zeile.quantity, zeile.unit))}
              </span>
            </li>`).join('')}
        </ul>
      </section>`).join('')}
  </div>`;
}

/**
 * Die Schaltflaeche fuer den Etikettenbogen.
 *
 * Sie sagt, wie viele gedruckt werden, und ist ohne Auswahl abgeschaltet - ein
 * Knopf, der einen leeren Bogen erzeugt, waere eine Falle. Ueber 120 Etiketten
 * nimmt die Schnittstelle nicht an; das steht dran, bevor jemand 300 anhakt
 * und eine Fehlermeldung bekommt.
 */
export function druckKnopf(anzahl, was = 'Etiketten') {
  if (!anzahl) {
    return `<button class="button button--secondary stock-sheet-print" type="button" disabled>
      ${sicher(was)} drucken
    </button>`;
  }
  if (anzahl > ETIKETT_BOGEN.maxEtiketten) {
    return `<button class="button button--secondary stock-sheet-print" type="button" disabled>
      ${sicher(String(anzahl))} ausgewählt — höchstens ${ETIKETT_BOGEN.maxEtiketten} je Bogen
    </button>`;
  }
  return `<button class="button button--action stock-sheet-print" type="button">
    ${sicher(String(anzahl))} ${anzahl === 1 ? 'Etikett' : 'Etiketten'} drucken
  </button>`;
}

export function artikelListeAnsicht(artikel = [], rechte = {}, suche = '', wahl = []) {
  const gewaehlt = new Set(wahl);

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
            <li class="stock-row stock-row--tap${gewaehlt.has(eintrag.id) ? ' stock-row--gewaehlt' : ''}"
                data-artikel="${sicher(eintrag.id)}">
              ${rechte.manage
                ? `<label class="stock-pick" title="Für den Etikettenbogen">
                     <input type="checkbox" class="stock-pick__box" data-wahl="${sicher(eintrag.id)}"
                            ${gewaehlt.has(eintrag.id) ? 'checked' : ''}>
                   </label>`
                : ''}
              <span class="stock-row__name">${sicher(eintrag.name)}</span>
              <span class="stock-row__number">${sicher(eintrag.itemNumber)}</span>
              <span class="stock-row__amount stock-row__amount--${bestandLage(eintrag.totalQuantity, eintrag.minimumStock)}">
                ${sicher(bestandText(eintrag.totalQuantity, eintrag.unit))}
              </span>
            </li>`).join('')}
        </ul>
        ${rechte.manage
          ? `<div class="stock-sheet">
               <button class="button button--quiet stock-sheet-all" type="button">
                 ${gewaehlt.size === artikel.length ? 'Auswahl aufheben' : 'Alle auswählen'}
               </button>
               ${druckKnopf(gewaehlt.size)}
             </div>`
          : ''}`
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

/**
 * Das Artikelformular - zum Anlegen und zum Aendern.
 *
 * Beim Aendern bleiben drei Felder gesperrt: Artikelnummer, Einheit und
 * Warengruppe. Die Nummer steht auf gedruckten Etiketten, und die Einheit zu
 * aendern wuerde jeden gebuchten Bestand still umdeuten - aus 120 Metern
 * wuerden 120 Stueck. Beides waere keine Aenderung, sondern ein neuer Artikel.
 * Sie stehen trotzdem da, nur nicht zum Anfassen: wer sie sucht, soll sie
 * sehen und nicht raten, wo sie geblieben sind.
 */
export function artikelFormularAnsicht(entwurf, gruppen = [], fehler = null, aendern = false) {
  // Ein leerer Entwurf kommt als null aus dem Zustand und als undefined aus
  // einem direkten Aufruf; beide meinen dasselbe leere Formular.
  const daten = entwurf || {};
  const code = daten.barcodes?.[0];
  const fest = aendern ? ' disabled' : '';

  return `<div class="stock-form">
    ${kopfzeile(aendern ? 'Artikel ändern' : 'Artikel anlegen')}
    ${code && !aendern
      ? `<p class="stock-note">Der gescannte Code <strong>${sicher(code.code)}</strong> wird übernommen.</p>`
      : ''}
    <label class="stock-field"><span>Artikelnummer${aendern ? ' (steht auf Etiketten)' : ''}</span>
      <input name="itemNumber" value="${sicher(daten.itemNumber || '')}" autocomplete="off" maxlength="40"${fest}></label>
    <label class="stock-field"><span>Bezeichnung</span>
      <input name="name" value="${sicher(daten.name || '')}" autocomplete="off" maxlength="180"></label>
    <label class="stock-field"><span>Einheit${aendern ? ' (der Bestand zählt darin)' : ''}</span>
      <input name="unit" value="${sicher(daten.unit || 'Stück')}" autocomplete="off" maxlength="20"${fest}></label>
    <label class="stock-field"><span>Warengruppe</span>
      <select name="groupKey"${fest}>
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
    <div class="stock-field-pair">
      <label class="stock-field"><span>Gebinde heißt (freiwillig)</span>
        <input name="packName" value="${sicher(daten.packName || '')}" autocomplete="off" maxlength="40"
               placeholder="Karton, Rolle, Bund"></label>
      <label class="stock-field"><span>Stück im Gebinde</span>
        <input name="packSize" inputmode="decimal" value="${sicher(daten.packSize ?? '')}" autocomplete="off"
               placeholder="z. B. 100"></label>
    </div>
    <p class="stock-hint">
      Mit Gebinde lässt sich beim Buchen zwischen ganzen Gebinden und einzelnen
      Stücken umschalten. Der Bestand zählt immer in ${sicher(daten.unit || 'Stück')}.
    </p>
    ${aendern
      ? '<p class="stock-hint">Codes werden über „Codes und Etikett" gepflegt.</p>'
      : codeFelder(daten)}
    ${fehler ? `<p class="stock-error" role="alert">${sicher(fehler)}</p>` : ''}
    <button class="button button--action stock-save" type="button">
      ${aendern ? 'Änderungen speichern' : 'Anlegen'}
    </button>
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

// Das Lageretikett steht in einer Zeile: links der Code, rechts daneben alles,
// was man lesen soll - Bezeichnung, Artikelnummer, Herstellernummer. Ein
// Etikett, das man lesen kann, ohne es zu scannen, hilft genau dann, wenn die
// Kamera nicht mitspielt.
//
// Die Bezeichnung stand zuerst quer darueber. Das kostete eine ganze Zeile Hoehe
// fuer etwas, das neben dem Code Platz hat: "NYM-J 5x1,5mm2" braucht keine
// eigene Etage. Nebeneinander wird das Etikett ein Drittel flacher, und aus elf
// Reihen auf A4 werden sechzehn.
//
// Der Geraetebogen bleibt bei seinen 120 kleinen Quadraten - dort steht nur eine
// Inventarnummer.
export const ETIKETT_BOGEN = Object.freeze({
  maxEtiketten: 120,
  spalten: 4,
  reihen: 16,
  seiteBreiteMm: 210,
  seiteHoeheMm: 297,
  seitenrandMm: 5,
  zelleBreiteMm: 48,
  zelleHoeheMm: 17,
  spaltMm: 0.5,
  // Zwoelf Millimeter, nicht mehr.
  //
  // Die Grenze setzt nicht der Geschmack, sondern die Kamera: der gedruckte
  // Code ist 33 mal 33 Module gross (Ruhezone eingerechnet 37), macht bei
  // 12 mm rund 0,32 Millimeter je Modul. Darunter wird das Lesen aus der Hand
  // unzuverlaessig. Moeglich sind die 12 mm ueberhaupt nur, weil die Adresse
  // im Code in Grossbuchstaben steht und dadurch vier Module weniger braucht.
  qrGroesseMm: 12
});

/** Wie viele Etiketten auf eine Seite gehen; darueber hinaus wird geblaettert. */
export const ETIKETTEN_JE_SEITE = ETIKETT_BOGEN.spalten * ETIKETT_BOGEN.reihen;

export function etikettBogenStile() {
  const b = ETIKETT_BOGEN;
  const breite = b.seiteBreiteMm - (2 * b.seitenrandMm);
  return `
    @page{size:A4 portrait;margin:${b.seitenrandMm}mm}
    *{box-sizing:border-box}
    html,body{margin:0;padding:0}
    body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#000}
    .sheet{display:grid;grid-template-columns:repeat(${b.spalten},${b.zelleBreiteMm}mm);grid-auto-rows:${b.zelleHoeheMm}mm;gap:${b.spaltMm}mm;width:${breite}mm;align-content:start}
    .label{
      display:grid;grid-template-columns:${b.qrGroesseMm}mm 1fr;gap:1.8mm;align-items:center;
      overflow:hidden;border:.15mm solid #999;border-radius:1.5mm;
      padding:1.2mm 1.5mm;break-inside:avoid;page-break-inside:avoid;background:#fff;
    }
    .label__qr{display:grid;place-items:center;width:${b.qrGroesseMm}mm;height:${b.qrGroesseMm}mm}
    .label svg{display:block;width:${b.qrGroesseMm}mm;height:${b.qrGroesseMm}mm}
    .label__text{display:grid;gap:.4mm;min-width:0}
    /* Die Bezeichnung bekommt genau zwei Zeilen mit fester Hoehe. Ein langer
       Name darf die Nummern nicht aus dem Etikett schieben, und eine dritte,
       halb abgeschnittene Zeile sieht nach Fehler aus. */
    .label__name{
      margin:0;max-height:5.3mm;font-size:6.5pt;line-height:2.65mm;font-weight:700;
      display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;
      overflow:hidden;word-break:break-word;
    }
    .label__text span{
      display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
      font-size:5.5pt;line-height:1.25;font-variant-numeric:tabular-nums;
    }
    .label__text .label__number{font-size:6pt;font-weight:600}
    .label__text .label__extra{color:#333}
    @media screen{body{min-width:${b.seiteBreiteMm}mm;padding:${b.seitenrandMm}mm;background:#f4f4f5}.sheet{margin:auto;background:#fff}}
    @media print{html,body{width:${breite}mm}.label{border-color:#000}}
  `;
}

/**
 * Baut den Druckbogen aus den Bildern, die die API liefert.
 *
 * Das SVG kommt aus der eigenen API und wird deshalb unveraendert eingesetzt;
 * alles andere — Name und Nummer unter dem Code — ist Text aus der Datenbank
 * und wird maskiert.
 */
/**
 * Ein einzelnes Etikett: links der Code, rechts alles zum Lesen.
 *
 * Die Artikelnummer traegt ihr "Art.-Nr." mit, damit die Zahl auf dem Karton
 * nicht ratlos macht; Lagerplaetze bekommen stattdessen ihren Pfad.
 */
export function etikettZelle(etikett = {}) {
  // Beim obersten Lagerplatz ist der Pfad der Name. Ihn ein zweites Mal
  // hinzuschreiben fuellt nur Platz, ohne etwas zu sagen.
  const nummer = etikett.sublabel && etikett.sublabel !== etikett.label
    ? `<span class="label__number">${etikett.targetType === 'location' ? '' : 'Art.-Nr.: '}${sicher(etikett.sublabel)}</span>`
    : '';
  const zusatz = etikett.extra
    ? `<span class="label__extra">${sicher(etikett.extra)}</span>`
    : '';

  return `
    <div class="label">
      <div class="label__qr">${etikett.svg || ''}</div>
      <div class="label__text">
        <p class="label__name">${sicher(etikett.label || '')}</p>
        ${nummer}${zusatz}
      </div>
    </div>`;
}

/**
 * Der Druckbogen als eigenstaendige Seite.
 *
 * Die Stile kommen als verlinkte Datei und nicht als <style> im Dokument. Die
 * App laeuft unter `style-src 'self'`, und das Druckfenster erbt diese Regel:
 * ein eingebetteter Block kam ohne eine einzige Regel an, und der Bogen druckte
 * als Liste riesiger Codes ueber ganze Seiten - ohne Fehlermeldung, nur mit
 * einer Notiz in der Browserkonsole. Eine Datei von der eigenen Herkunft ist
 * erlaubt.
 *
 * `herkunft` muss deshalb absolut sein: das Druckfenster hat keine eigene
 * Adresse, an der sich ein relativer Verweis aufloesen liesse.
 */
export function etikettBogenHtml(labels = [], herkunft = '') {
  const zellen = labels.slice(0, ETIKETT_BOGEN.maxEtiketten).map(etikettZelle).join('');
  const stile = `${String(herkunft).replace(/\/$/, '')}/print-labels.css?v=0.44.31`;

  // Die feste Fensterbreite entspricht der A4-Seite. Ohne sie zeigt ein Telefon
  // eine vergroesserte Ecke des Bogens; so passt das ganze Blatt auf den
  // Bildschirm und man sieht, was gedruckt wird. Auf den Druck hat es keinen
  // Einfluss - dafuer gilt @page.
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=794">
<title>Lageretiketten</title>
<link rel="stylesheet" href="${sicher(stile)}">
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
  if (zustand.schritt === SCHRITTE.RUECKGABE) {
    return rueckgabeAnsicht(
      zustand.rueckgabe, zustand.entwurf || {},
      (optionen.orte || []).filter((ort) => ort.locationType !== 'construction_site'),
      zustand.fehler
    );
  }
  if (zustand.schritt === SCHRITTE.LIEFERSCHEINE) {
    return lieferscheineAnsicht(optionen.lieferscheine, zustand.fehler);
  }
  if (zustand.schritt === SCHRITTE.LIEFERSCHEIN) {
    return zustand.entwurf
      ? lieferscheinFormularAnsicht(zustand.entwurf, optionen, zustand.fehler)
      : lieferscheinAnsicht(zustand);
  }
  if (zustand.schritt === SCHRITTE.ARTIKEL_CODES) return artikelCodesAnsicht(zustand, rechte);
  if (zustand.schritt === SCHRITTE.BUCHEN) return buchenAnsicht(zustand, rechte, optionen);
  if (zustand.schritt === SCHRITTE.BESTAETIGT) return bestaetigungAnsicht(zustand);
  if (zustand.schritt === SCHRITTE.UNBEKANNT) return unbekanntAnsicht(zustand, rechte);
  if (zustand.schritt === SCHRITTE.BESTAND) return bestandAnsicht(optionen.bestand);
  if (zustand.schritt === SCHRITTE.ORTE) {
    return orteAnsicht(optionen.orte, zustand.ort?.id || null, rechte, zustand.druckwahl);
  }
  if (zustand.schritt === SCHRITTE.ARTIKEL) {
    return artikelListeAnsicht(optionen.artikel, rechte, zustand.suche, zustand.druckwahl);
  }
  if (zustand.schritt === SCHRITTE.NACHBESTELLUNG) return nachbestellungAnsicht(optionen.vorschlaege);
  if (zustand.schritt === SCHRITTE.ARTIKEL_NEU) {
    return artikelFormularAnsicht(zustand.entwurf, optionen.gruppen, zustand.fehler);
  }
  if (zustand.schritt === SCHRITTE.ARTIKEL_AENDERN) {
    return artikelFormularAnsicht(zustand.entwurf, optionen.gruppen, zustand.fehler, true);
  }
  return startAnsicht(zustand, rechte, optionen);
}


export const LIEFERSCHEINSTATUS = Object.freeze({
  draft: 'Entwurf',
  booked: 'Gebucht',
  cancelled: 'Storniert'
});

export function lieferscheinStatusText(status) {
  return LIEFERSCHEINSTATUS[status] || status;
}

export function lieferscheineAnsicht(scheine = [], fehler = null) {
  return `<div class="stock-list">
    ${kopfzeile('Lieferscheine')}
    ${fehler ? `<p class="stock-error" role="alert">${sicher(fehler)}</p>` : ''}
    ${scheine.length
      ? `<ul class="stock-rows">
          ${scheine.map((schein) => `
            <li class="stock-row stock-row--tap" data-lieferschein="${sicher(schein.id)}">
              <span class="stock-row__name">${sicher(schein.supplierName || '')}</span>
              <span class="stock-row__number">
                ${sicher(schein.deliveryNoteNumber)}${schein.constructionSiteName
                  ? ` · ${sicher(schein.constructionSiteName)}`
                  : ''}
              </span>
              <span class="stock-row__amount stock-row__amount--${schein.status === 'draft' ? 'knapp' : 'offen'}">
                ${sicher(lieferscheinStatusText(schein.status))}
              </span>
            </li>`).join('')}
        </ul>`
      : '<p class="stock-empty">Noch kein Lieferschein erfasst.</p>'}
    <button class="button button--action stock-delivery-new" type="button">Lieferschein erfassen</button>
  </div>`;
}

/**
 * Eine Zeile des Bestellabgleichs.
 *
 * Vier Zahlen, die im Betrieb regelmaessig durcheinandergehen: was bestellt
 * wurde, was frueher kam, was auf diesem Schein steht und was noch aussteht.
 * Die fuenfte - zu viel geliefert - steht nur da, wenn es sie gibt, und dann
 * auffaellig: an ihr haengt die Rechnungspruefung.
 */
function abgleichZeileAnsicht(zeile) {
  return `<li class="stock-row stock-row--order-line">
    <span class="stock-row__name">${sicher(zeile.itemName)}</span>
    <span class="stock-row__number">
      ${sicher(mengeAlsText(zeile.quantityOnThisNote))} von ${sicher(mengeAlsText(zeile.quantityOrdered))}
      ${sicher(zeile.unit)} · vorher ${sicher(mengeAlsText(zeile.quantityReceivedBefore))}
    </span>
    <span class="stock-row__amount stock-row__amount--${zeile.quantityOver > 0 ? 'unplausibel' : (zeile.quantityOpen > 0 ? 'knapp' : 'gut')}">
      ${zeile.quantityOver > 0
        ? `${sicher(mengeAlsText(zeile.quantityOver))} zu viel`
        : (zeile.quantityOpen > 0
          ? `${sicher(mengeAlsText(zeile.quantityOpen))} offen`
          : 'vollständig')}
    </span>
  </li>`;
}

export function lieferscheinAnsicht(zustand) {
  const beleg = zustand.lieferschein;
  if (!beleg) return '';
  const schein = beleg.deliveryNote;
  const entwurf = schein.status === 'draft';

  return `<div class="stock-list stock-delivery">
    ${kopfzeile(schein.deliveryNoteNumber)}
    <p class="stock-order__supplier">${sicher(schein.supplierName || '')}</p>
    <p class="stock-order__status">
      ${sicher(lieferscheinStatusText(schein.status))} · geliefert am ${sicher(schein.deliveredOn || '')}
    </p>
    <p class="stock-delivery__target">
      Ziel: ${sicher(schein.targetLocationName || '')}${schein.constructionSiteName
        ? ` (Baustelle ${sicher(schein.constructionSiteName)})`
        : ''}
    </p>
    ${schein.purchaseOrderNumber
      ? `<p class="stock-delivery__order">Zur Bestellung ${sicher(schein.purchaseOrderNumber)}</p>`
      : '<p class="stock-delivery__order">Ohne Bestellung</p>'}

    <h3 class="stock-subhead">Positionen</h3>
    <ul class="stock-rows">
      ${beleg.items.map((zeile) => `
        <li class="stock-row stock-row--order-line">
          <span class="stock-row__name">${sicher(zeile.itemName)}</span>
          <span class="stock-row__number">${sicher(zeile.itemNumber)}</span>
          <span class="stock-row__amount">
            ${sicher(mengeAlsText(zeile.quantity))} ${sicher(zeile.unit)}
          </span>
        </li>`).join('')}
    </ul>

    ${beleg.orderComparison?.length
      ? `<h3 class="stock-subhead">Abgleich mit der Bestellung</h3>
         <ul class="stock-rows">${beleg.orderComparison.map(abgleichZeileAnsicht).join('')}</ul>`
      : ''}

    ${entwurf
      ? `<p class="stock-hint">
           Noch nichts gebucht: erst das Buchen legt den Bestand an. Danach wird
           der Schein storniert und nicht mehr geändert.
         </p>
         <button class="button button--action stock-delivery-book" type="button">Buchen</button>
         <button class="button button--quiet stock-delivery-cancel" type="button">Stornieren</button>`
      : `<p class="stock-note">
           ${sicher(beleg.movements.length)} Buchung${beleg.movements.length === 1 ? '' : 'en'}
           aus diesem Lieferschein.
         </p>`}
    ${zustand.fehler ? `<p class="stock-error" role="alert">${sicher(zustand.fehler)}</p>` : ''}
    <button class="button button--quiet stock-home" type="button">Fertig</button>
  </div>`;
}

/**
 * Das Erfassungsformular.
 *
 * Bewusst kurz: Lieferant, Nummer, Datum, Ziel - und darunter Positionen, die
 * sich wie im Artikelformular nachlegen lassen. Alles Weitere (Preise,
 * Lieferantenartikelnummern) steht am Beleg und laesst sich spaeter ergaenzen;
 * wer im Stehen erfasst, waehrend der Fahrer wartet, tippt es ohnehin nicht.
 */
/** Die laengste Kante, mit der ein Beleg zur Erkennung geht. */
export const BELEGKANTE = 2000;

/**
 * Auf welches Mass ein Foto verkleinert wird.
 *
 * Ein Telefon fotografiert mit zwoelf Megapixeln. Fuer die Texterkennung ist
 * das Verschwendung an beiden Enden: das Bild wird gross hochgeladen, und der
 * Server rechnet lange darauf.
 *
 * Gemessen an einem Beleg mit Bildrauschen und Hintergrund, auf einem Kern:
 *
 *   4032 Bildpunkte   2,1 s   2112 KB
 *   2000 Bildpunkte   0,8 s    423 KB
 *   1600 Bildpunkte   0,7 s    291 KB
 *   1200 Bildpunkte   1,0 s    ---   <- hier faellt eine Positionszeile aus
 *
 * Zweitausend ist der Punkt, an dem nichts mehr zu gewinnen und noch nichts
 * verloren ist. Bei 1200 laesst die Erkennung die erste Positionszeile fallen
 * - deshalb wird nicht weiter verkleinert, obwohl es schneller waere.
 *
 * Kleinere Bilder bleiben unangetastet: ein Scan mit 1200 Bildpunkten wird
 * nicht kuenstlich aufgeblasen.
 */
export function belegMass(breite, hoehe, kante = BELEGKANTE) {
  const laengste = Math.max(breite, hoehe);
  if (!laengste || laengste <= kante) return { breite, hoehe, verkleinert: false };
  const faktor = kante / laengste;
  return {
    breite: Math.max(1, Math.round(breite * faktor)),
    hoehe: Math.max(1, Math.round(hoehe * faktor)),
    verkleinert: true
  };
}

/**
 * Welches Lieferdatum gilt: das vom Papier oder das im Formular?
 *
 * Das Feld startet auf heute. Das ist als Vorbelegung richtig - die meisten
 * Lieferungen werden am selben Tag erfasst -, aber es ist eine Annahme der
 * App und keine Eingabe eines Menschen. Bis hierher hat sie trotzdem gegen
 * das Papier gewonnen, weil "nur leere Felder fuellen" ein volles Feld sah:
 * wer einen Beleg von vorgestern fotografierte, buchte ihn auf heute.
 *
 * Deshalb drei Faelle statt zwei:
 *
 *   Feld leer                     -> das erkannte Datum
 *   Feld noch auf der Vorbelegung -> das erkannte Datum (das Papier weiss es
 *                                    besser als die Uhr)
 *   Feld von Hand geaendert       -> bleibt, wie es steht
 */
export function datumUebernehmen(entwurf = {}, erkannt = null) {
  const jetzt = entwurf.deliveredOn || '';
  if (!erkannt) return jetzt;
  if (!jetzt) return erkannt;
  return jetzt === entwurf.vorbelegtesDatum ? erkannt : jetzt;
}

/**
 * Erkannte Positionen in das Formular uebernehmen.
 *
 * Nur Zeilen mit zugeordnetem Artikel werden uebernommen - alles andere waere
 * ein leeres Feld mit einer Behauptung daneben. Getipptes bleibt stehen: eine
 * bereits gefuellte Zeile wird nie ueberschrieben, die Vorschlaege fuellen die
 * leeren und haengen sich sonst hinten an.
 *
 * Ein Vorschlag, der schon im Formular steht, kommt nicht ein zweites Mal
 * dazu. Wer zweimal fotografiert, weil das erste Bild verwackelt war, soll
 * nicht die doppelte Menge buchen.
 */
export function positionenUebernehmen(zeilen = [], vorschlaege = []) {
  const brauchbar = vorschlaege.filter((zeile) => zeile.stockItemId && zeile.quantity > 0);
  const bestehend = zeilen.filter((zeile) => zeile.itemId || String(zeile.quantity || '').trim());
  const schonDa = new Set(bestehend.map((zeile) => zeile.itemId).filter(Boolean));

  const neue = brauchbar
    .filter((zeile) => !schonDa.has(zeile.stockItemId))
    .map((zeile) => ({ itemId: zeile.stockItemId, quantity: mengeAlsText(zeile.quantity) }));

  const zusammen = [...bestehend, ...neue];
  return zusammen.length ? zusammen : [{ itemId: '', quantity: '' }];
}

/**
 * Was auf dem Bild an Positionen stand.
 *
 * Auch die nicht zugeordneten Zeilen stehen hier - und gerade sie sind
 * wichtig. Wer nur die Treffer sieht, haelt eine halb gelesene Lieferung fuer
 * eine vollstaendige. Wer die Luecke sieht, tippt sie nach.
 */
export function erkanntePositionenAnsicht(positionen = []) {
  if (!positionen.length) return '';

  return `<div class="stock-ocr-lines">
    <h3 class="stock-subhead">Vom Bild gelesen</h3>
    <ul class="stock-rows">
      ${positionen.map((zeile) => {
        const zustand = !zeile.stockItemId
          ? 'unbekannt'
          : (zeile.unitMatches ? 'gut' : 'knapp');
        const hinweis = !zeile.stockItemId
          ? 'kein Artikel dazu'
          : (zeile.unitMatches
            ? 'übernommen'
            : `Einheit prüfen: ${sicher(zeile.stockUnit || '')}`);
        return `<li class="stock-row stock-row--ocr">
          <span class="stock-row__name">${sicher(zeile.stockItemName || zeile.text)}</span>
          <span class="stock-row__number">
            ${sicher(zeile.code)} · ${sicher(mengeAlsText(zeile.quantity))} ${sicher(zeile.unit || '')}
          </span>
          <span class="stock-row__amount stock-row__amount--${zustand}">${hinweis}</span>
        </li>`;
      }).join('')}
    </ul>
    <p class="stock-field__hint">
      Vorgeschlagen, nicht gebucht. Die Mengen stehen unten im Formular und
      gehen erst mit dem Buchen in den Bestand.
    </p>
  </div>`;
}

export function lieferscheinFormularAnsicht(entwurf = {}, optionen = {}, fehler = null) {
  const lieferanten = optionen.lieferanten || [];
  const orte = optionen.orte || [];
  const artikel = optionen.artikel || [];
  const zeilen = entwurf.zeilen?.length ? entwurf.zeilen : [{ itemId: '', quantity: '' }];

  return `<form class="stock-form stock-delivery-form">
    ${kopfzeile('Lieferschein erfassen')}
    ${fehler ? `<p class="stock-error" role="alert">${sicher(fehler)}</p>` : ''}
    ${entwurf.hinweis
      // "Der Beleg wird gelesen" stand bis hierher im roten Fehlerkasten und
      // mit `role="alert"`. Das war zweimal falsch: es sah aus, als waere
      // etwas schiefgegangen, und Vorleseprogramme meldeten einen Fehler,
      // wenn gerade alles seinen Gang ging.
      ? `<p class="stock-progress" role="status">${sicher(entwurf.hinweis)}</p>`
      : ''}

    <label class="stock-field">
      <span>Lieferant</span>
      <select name="supplierId" required>
        <option value="">Bitte wählen</option>
        ${lieferanten.map((eintrag) => `
          <option value="${sicher(eintrag.id)}"${eintrag.id === entwurf.supplierId ? ' selected' : ''}>
            ${sicher(eintrag.name)}
          </option>`).join('')}
      </select>
    </label>

    <label class="stock-field stock-field--photo">
      <span>Foto des Lieferscheins</span>
      <input class="stock-delivery-photo" type="file" accept="image/*" capture="environment">
      <span class="stock-field__hint">
        Liest Nummer, Datum und die Positionen aus dem Bild. Vorgeschlagen wird
        nur, was im Artikelstamm wirklich steht — den Rest tragen Sie nach.
      </span>
    </label>
    ${erkanntePositionenAnsicht(entwurf.erkanntePositionen || [])}
    ${entwurf.erkannt
      ? `<details class="stock-ocr">
           <summary>Erkannter Text</summary>
           <pre class="stock-ocr__text">${sicher(entwurf.erkannt)}</pre>
         </details>`
      : ''}

    <label class="stock-field">
      <span>Lieferscheinnummer</span>
      <input name="deliveryNoteNumber" type="text" maxlength="60" required
             value="${sicher(entwurf.deliveryNoteNumber || '')}" placeholder="LS-4711">
    </label>

    <label class="stock-field">
      <span>Lieferdatum</span>
      <input name="deliveredOn" type="date" required value="${sicher(entwurf.deliveredOn || '')}">
    </label>

    <label class="stock-field">
      <span>Lieferziel</span>
      <select name="targetLocationId" required>
        <option value="">Bitte wählen</option>
        ${orte.map((ort) => `
          <option value="${sicher(ort.id)}"${ort.id === entwurf.targetLocationId ? ' selected' : ''}>
            ${sicher(ort.path || ort.name)}
          </option>`).join('')}
      </select>
      <span class="stock-field__hint">
        Bei einer Direktlieferung der Baustellenplatz — die Ware läuft dann
        nicht über das Hauptlager.
      </span>
    </label>

    <h3 class="stock-subhead">Positionen</h3>
    <div class="stock-delivery-lines">
      ${zeilen.map((zeile, index) => `
        <div class="stock-delivery-line" data-zeile="${index}">
          <label class="stock-field">
            <span>Artikel</span>
            <select name="itemId" required>
              <option value="">Bitte wählen</option>
              ${artikel.map((eintrag) => `
                <option value="${sicher(eintrag.id)}"${eintrag.id === zeile.itemId ? ' selected' : ''}>
                  ${sicher(eintrag.name)} (${sicher(eintrag.itemNumber)})
                </option>`).join('')}
            </select>
          </label>
          <label class="stock-field">
            <span>Menge</span>
            <input name="quantity" type="text" inputmode="decimal"
                   value="${sicher(zeile.quantity || '')}">
          </label>
        </div>`).join('')}
    </div>
    <button class="button button--quiet stock-delivery-add-line" type="button">Weitere Position</button>

    <button class="button button--action" type="submit">Als Entwurf speichern</button>
    <button class="button button--quiet stock-cancel" type="button">Abbrechen</button>
  </form>`;
}


/**
 * Die schnelle Rueckgabe von der Baustelle.
 *
 * Der Weg ueber den Scanner ist hier der falsche: was zurueckgeht, liegt in
 * einer Kiste im Transporter, oft ohne lesbaren Code, und der Monteur weiss
 * genau, was er dabei hat. Deshalb zeigt Schaefchen, was auf der Baustelle
 * gebucht ist, und er traegt nur die Rueckgabemenge ein - leere Felder heissen
 * "nichts davon".
 *
 * Vorbelegt wird bewusst nichts. Eine vorgeschlagene Menge waere eine
 * Behauptung darueber, was uebrig ist, und die stimmt nie.
 */
export function rueckgabeAnsicht(uebersicht, entwurf = {}, ziele = [], fehler = null) {
  const zeilen = (uebersicht?.items || []).filter((zeile) => zeile.onSite > 0);

  return `<div class="stock-list stock-return">
    ${kopfzeile('Material zurückgeben')}
    <p class="stock-order__supplier">${sicher(uebersicht?.constructionSite?.name || '')}</p>
    ${fehler ? `<p class="stock-error" role="alert">${sicher(fehler)}</p>` : ''}

    ${zeilen.length
      ? `<ul class="stock-rows">
          ${zeilen.map((zeile) => `
            <li class="stock-row stock-row--return" data-artikel="${sicher(zeile.itemId)}">
              <span class="stock-row__name">${sicher(zeile.itemName)}</span>
              <span class="stock-row__number">
                auf der Baustelle: ${sicher(mengeAlsText(zeile.onSite))} ${sicher(zeile.unit)}
              </span>
              <input class="stock-return__input" type="text" inputmode="decimal"
                     data-artikel="${sicher(zeile.itemId)}"
                     aria-label="Rückgabemenge ${sicher(zeile.itemName)}"
                     value="${sicher(entwurf[zeile.itemId] || '')}" placeholder="0">
            </li>`).join('')}
        </ul>

        <label class="stock-field">
          <span>Wohin</span>
          <select class="stock-return__target">
            ${ziele.map((ort) => `
              <option value="${sicher(ort.id)}"${ort.id === entwurf.zielOrtId ? ' selected' : ''}>
                ${sicher(ort.path || ort.name)}
              </option>`).join('')}
          </select>
        </label>

        <button class="button button--action stock-return-book" type="button">Zurückbuchen</button>`
      : '<p class="stock-empty">Auf dieser Baustelle ist nichts gebucht.</p>'}

    <button class="button button--quiet stock-home" type="button">Abbrechen</button>
  </div>`;
}

/**
 * Aus den eingetippten Mengen werden Buchungen.
 *
 * Je Artikel eine eigene Umlagerung mit eigener Vorgangsnummer: faellt eine
 * durch, stehen die anderen trotzdem. Eine Sammelbuchung waere bequemer und
 * haette bei einem einzigen Fehler alles verworfen - im Funkloch der
 * Normalfall.
 */
export function rueckgabeBuchungen(uebersicht, entwurf = {}, zielOrtId) {
  const quelle = uebersicht?.constructionSite?.locationId;
  if (!quelle) return { fehler: 'Für diese Baustelle gibt es keinen Lagerplatz.' };
  if (!zielOrtId) return { fehler: 'Bitte wählen, wohin das Material zurückgeht.' };
  if (zielOrtId === quelle) return { fehler: 'Quelle und Ziel müssen verschieden sein.' };

  const buchungen = [];
  for (const zeile of uebersicht.items || []) {
    const menge = mengeAusText(entwurf[zeile.itemId]);
    if (menge === null) continue;
    if (menge > zeile.onSite) {
      return {
        fehler: `Von ${zeile.itemName} sind nur ${mengeAlsText(zeile.onSite)} ${zeile.unit} auf der Baustelle.`
      };
    }
    buchungen.push({
      itemId: zeile.itemId,
      movementType: 'transfer',
      quantity: menge,
      sourceLocationId: quelle,
      targetLocationId: zielOrtId,
      constructionSiteId: uebersicht.constructionSite.id,
      sourceType: 'qr_scan',
      clientOperationId: neueVorgangId()
    });
  }

  if (!buchungen.length) {
    return { fehler: 'Bitte mindestens eine Menge eintragen.' };
  }
  return { buchungen };
}
