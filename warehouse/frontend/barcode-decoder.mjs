// Lokaler Decoder für eindimensionale Barcodes: EAN-13, EAN-8, UPC-A und
// Code 128.
//
// Der vorhandene QR-Decoder in `frontend/vendor/` liest ausschliesslich QR.
// Herstellercodes auf Verpackungen sind aber fast immer EAN oder Code 128, und
// `BarcodeDetector` gibt es auf iOS nicht. Dieser Decoder schliesst genau diese
// Luecke und laeuft wie der QR-Decoder ausschliesslich im Browser: es wird kein
// Kamerabild an einen Fremddienst uebertragen.
//
// Der Weg ist der klassische: Bildzeile lesen, oertlich schwellen, in
// Lauflaengen zerlegen und die Laufmuster gegen die Zeichentabellen der
// jeweiligen Symbologie matchen. Gescannt werden mehrere Zeilen ueber das Bild
// verteilt, in beiden Richtungen und auf Wunsch auch spaltenweise, damit ein
// hochkant gehaltenes Telefon denselben Code findet.

// Ein Balken darf um diesen Anteil einer Modulbreite von seiner Sollbreite
// abweichen, bevor das Zeichen verworfen wird. Die Werte stammen aus der
// bewaehrten Auslegung von ZXing und sind hier bewusst nicht schaerfer:
// gedruckte Etiketten sind selten exakt.
const MAX_EINZELABWEICHUNG = 0.7;
const MAX_MITTLERE_ABWEICHUNG_EAN = 0.48;
const MAX_MITTLERE_ABWEICHUNG_128 = 0.25;

// Unterhalb dieses Unterschieds zwischen hellster und dunkelster Stelle
// enthaelt eine Zeile keinen Code, sondern Rauschen.
const MIN_KONTRAST = 24;

// Die linken Ziffern eines EAN-Codes im ungeraden Zeichensatz. Aus diesen
// Modulmustern werden alle uebrigen Tabellen abgeleitet: der gerade Zeichensatz
// ist dasselbe Muster rueckwaerts, der rechte Zeichensatz ist das Komplement
// und hat deshalb dieselben Lauflaengen.
const EAN_LINKS_MODULE = [
  '0001101', '0011001', '0010011', '0111101', '0100011',
  '0110001', '0101111', '0111011', '0110111', '0001011'
];

// Aus welcher Abfolge von ungeraden und geraden linken Ziffern sich die erste
// Ziffer eines EAN-13 ergibt. 0 steht fuer ungerade, 1 fuer gerade.
const EAN13_ERSTE_ZIFFER = [
  '000000', '001011', '001101', '001110', '010011',
  '011001', '011100', '010101', '010110', '011010'
];

// Die 107 Zeichen von Code 128 als Lauflaengen, beginnend mit einem Balken.
// Zeichen 106 ist das Stoppzeichen und traegt als einziges sieben Laeufe.
const CODE128_MUSTER = [
  [2, 1, 2, 2, 2, 2], [2, 2, 2, 1, 2, 2], [2, 2, 2, 2, 2, 1], [1, 2, 1, 2, 2, 3],
  [1, 2, 1, 3, 2, 2], [1, 3, 1, 2, 2, 2], [1, 2, 2, 2, 1, 3], [1, 2, 2, 3, 1, 2],
  [1, 3, 2, 2, 1, 2], [2, 2, 1, 2, 1, 3], [2, 2, 1, 3, 1, 2], [2, 3, 1, 2, 1, 2],
  [1, 1, 2, 2, 3, 2], [1, 2, 2, 1, 3, 2], [1, 2, 2, 2, 3, 1], [1, 1, 3, 2, 2, 2],
  [1, 2, 3, 1, 2, 2], [1, 2, 3, 2, 2, 1], [2, 2, 3, 2, 1, 1], [2, 2, 1, 1, 3, 2],
  [2, 2, 1, 2, 3, 1], [2, 1, 3, 2, 1, 2], [2, 2, 3, 1, 1, 2], [3, 1, 2, 1, 3, 1],
  [3, 1, 1, 2, 2, 2], [3, 2, 1, 1, 2, 2], [3, 2, 1, 2, 2, 1], [3, 1, 2, 2, 1, 2],
  [3, 2, 2, 1, 1, 2], [3, 2, 2, 2, 1, 1], [2, 1, 2, 1, 2, 3], [2, 1, 2, 3, 2, 1],
  [2, 3, 2, 1, 2, 1], [1, 1, 1, 3, 2, 3], [1, 3, 1, 1, 2, 3], [1, 3, 1, 3, 2, 1],
  [1, 1, 2, 3, 1, 3], [1, 3, 2, 1, 1, 3], [1, 3, 2, 3, 1, 1], [2, 1, 1, 3, 1, 3],
  [2, 3, 1, 1, 1, 3], [2, 3, 1, 3, 1, 1], [1, 1, 2, 1, 3, 3], [1, 1, 2, 3, 3, 1],
  [1, 3, 2, 1, 3, 1], [1, 1, 3, 1, 2, 3], [1, 1, 3, 3, 2, 1], [1, 3, 3, 1, 2, 1],
  [3, 1, 3, 1, 2, 1], [2, 1, 1, 3, 3, 1], [2, 3, 1, 1, 3, 1], [2, 1, 3, 1, 1, 3],
  [2, 1, 3, 3, 1, 1], [2, 1, 3, 1, 3, 1], [3, 1, 1, 1, 2, 3], [3, 1, 1, 3, 2, 1],
  [3, 3, 1, 1, 2, 1], [3, 1, 2, 1, 1, 3], [3, 1, 2, 3, 1, 1], [3, 3, 2, 1, 1, 1],
  [3, 1, 4, 1, 1, 1], [2, 2, 1, 4, 1, 1], [4, 3, 1, 1, 1, 1], [1, 1, 1, 2, 2, 4],
  [1, 1, 1, 4, 2, 2], [1, 2, 1, 1, 2, 4], [1, 2, 1, 4, 2, 1], [1, 4, 1, 1, 2, 2],
  [1, 4, 1, 2, 2, 1], [1, 1, 2, 2, 1, 4], [1, 1, 2, 4, 1, 2], [1, 2, 2, 1, 1, 4],
  [1, 2, 2, 4, 1, 1], [1, 4, 2, 1, 1, 2], [1, 4, 2, 2, 1, 1], [2, 4, 1, 2, 1, 1],
  [2, 2, 1, 1, 1, 4], [4, 1, 3, 1, 1, 1], [2, 4, 1, 1, 1, 2], [1, 3, 4, 1, 1, 1],
  [1, 1, 1, 2, 4, 2], [1, 2, 1, 1, 4, 2], [1, 2, 1, 2, 4, 1], [1, 1, 4, 2, 1, 2],
  [1, 2, 4, 1, 1, 2], [1, 2, 4, 2, 1, 1], [4, 1, 1, 2, 1, 2], [4, 2, 1, 1, 1, 2],
  [4, 2, 1, 2, 1, 1], [2, 1, 2, 1, 4, 1], [2, 1, 4, 1, 2, 1], [4, 1, 2, 1, 2, 1],
  [1, 1, 1, 1, 4, 3], [1, 1, 1, 3, 4, 1], [1, 3, 1, 1, 4, 1], [1, 1, 4, 1, 1, 3],
  [1, 1, 4, 3, 1, 1], [4, 1, 1, 1, 1, 3], [4, 1, 1, 3, 1, 1], [1, 1, 3, 1, 4, 1],
  [1, 1, 4, 1, 3, 1], [3, 1, 1, 1, 4, 1], [4, 1, 1, 1, 3, 1], [2, 1, 1, 4, 1, 2],
  [2, 1, 1, 2, 1, 4], [2, 1, 1, 2, 3, 2], [2, 3, 3, 1, 1, 1, 2]
];

const CODE128_START_A = 103;
const CODE128_START_B = 104;
const CODE128_START_C = 105;
const CODE128_STOPP = 106;

// GS1-128 trennt seine Datenbezeichner mit FNC1. Der Trenner wird als ASCII 29
// (Group Separator) uebernommen, wie es beim Auslesen von GS1-Daten ueblich
// ist. Fassung 1 wertet die Bezeichner nicht aus, verliert aber ihre Grenzen
// nicht.
const GRUPPENTRENNER = String.fromCharCode(29);

function modulmusterZuLaeufen(muster) {
  const laeufe = [];
  let aktuell = muster[0];
  let laenge = 0;
  for (const zeichen of muster) {
    if (zeichen === aktuell) {
      laenge += 1;
    } else {
      laeufe.push(laenge);
      aktuell = zeichen;
      laenge = 1;
    }
  }
  laeufe.push(laenge);
  return laeufe;
}

const EAN_LINKS_LAEUFE = EAN_LINKS_MODULE.map(modulmusterZuLaeufen);
const EAN_GERADE_LAEUFE = EAN_LINKS_LAEUFE.map((laeufe) => [...laeufe].reverse());

/**
 * Wie stark weichen gemessene Lauflaengen von einem Sollmuster ab?
 * Der Rueckgabewert ist die mittlere Abweichung je Modul; `Infinity` heisst,
 * dass mindestens ein Lauf zu weit daneben liegt.
 */
export function musterAbweichung(gemessen, soll, maxEinzel = MAX_EINZELABWEICHUNG) {
  if (gemessen.length !== soll.length) return Infinity;

  let gemessenGesamt = 0;
  let sollGesamt = 0;
  for (let i = 0; i < gemessen.length; i += 1) {
    gemessenGesamt += gemessen[i];
    sollGesamt += soll[i];
  }
  if (gemessenGesamt < sollGesamt) return Infinity;

  const modulbreite = gemessenGesamt / sollGesamt;
  const grenze = maxEinzel * modulbreite;

  let abweichung = 0;
  for (let i = 0; i < gemessen.length; i += 1) {
    const einzeln = Math.abs(gemessen[i] - soll[i] * modulbreite);
    if (einzeln > grenze) return Infinity;
    abweichung += einzeln;
  }
  return abweichung / gemessenGesamt;
}

// Wie viele Modulbreiten hell es vor und hinter einem Code mindestens sein
// muessen. Die Norm verlangt neun bis elf; hier wird bewusst weniger
// gefordert, damit ein knapp angeschnittenes Foto noch funktioniert. Fuenf
// liegt aber sicher ueber dem breitesten Lauf, der innerhalb eines Codes
// vorkommen kann, und genau darauf kommt es an: ohne diese Bedingung liest
// sich ein beschaedigter EAN-13 als kuerzerer EAN-8 aus seinen eigenen
// mittleren Ziffern.
const MIN_RUHEZONE_MODULE = 5;

function ruhezoneDavor(laeufe, start, modulbreite) {
  if (start === 0) return true;
  return laeufe[start - 1] >= MIN_RUHEZONE_MODULE * modulbreite;
}

function ruhezoneDanach(laeufe, endeBei, modulbreite) {
  if (endeBei >= laeufe.length) return true;
  return laeufe[endeBei] >= MIN_RUHEZONE_MODULE * modulbreite;
}

function passtAufMuster(laeufe, start, soll, maxMittel) {
  if (start + soll.length > laeufe.length) return false;
  const ausschnitt = laeufe.slice(start, start + soll.length);
  return musterAbweichung(ausschnitt, soll) <= maxMittel;
}

function ziffernErkennen(laeufe, start, tabellen) {
  if (start + 4 > laeufe.length) return null;
  const ausschnitt = laeufe.slice(start, start + 4);

  let beste = null;
  for (const [name, tabelle] of tabellen) {
    for (let ziffer = 0; ziffer < tabelle.length; ziffer += 1) {
      const abweichung = musterAbweichung(ausschnitt, tabelle[ziffer]);
      if (abweichung <= MAX_MITTLERE_ABWEICHUNG_EAN && (!beste || abweichung < beste.abweichung)) {
        beste = { ziffer, satz: name, abweichung };
      }
    }
  }
  return beste;
}

export function gtinPruefzifferStimmt(ziffern) {
  if (!/^[0-9]+$/.test(ziffern) || ziffern.length < 8) return false;
  let summe = 0;
  // Von rechts nach links, die Pruefziffer selbst ausgenommen: abwechselnd
  // dreifach und einfach.
  for (let i = ziffern.length - 2; i >= 0; i -= 1) {
    const abstand = ziffern.length - 2 - i;
    summe += Number(ziffern[i]) * (abstand % 2 === 0 ? 3 : 1);
  }
  const erwartet = (10 - (summe % 10)) % 10;
  return erwartet === Number(ziffern[ziffern.length - 1]);
}

/**
 * Versucht, ab `start` einen EAN-Code mit `stellen` Ziffern zu lesen.
 * `laeufe[start]` muss der erste Balken des Startzeichens sein.
 */
function eanLesen(laeufe, start, stellen) {
  const haelfte = stellen === 13 ? 6 : 4;
  const benoetigt = 3 + 4 * haelfte + 5 + 4 * haelfte + 3;
  if (start + benoetigt > laeufe.length) return null;

  if (!passtAufMuster(laeufe, start, [1, 1, 1], MAX_MITTLERE_ABWEICHUNG_EAN)) return null;

  const modulbreite = (laeufe[start] + laeufe[start + 1] + laeufe[start + 2]) / 3;
  if (!ruhezoneDavor(laeufe, start, modulbreite)) return null;

  let zeiger = start + 3;
  const linkeZiffern = [];
  let paritaet = '';

  // EAN-8 verwendet links ausschliesslich den ungeraden Zeichensatz. Den
  // geraden ueberhaupt erst zur Auswahl zu stellen, waere kein zusaetzlicher
  // Schutz, sondern ein zusaetzliches Risiko: bei leicht verschobenen
  // Laufgrenzen gewinnt sonst ein falsches Zeichen knapp gegen das richtige.
  const linkeTabellen = stellen === 13
    ? [['ungerade', EAN_LINKS_LAEUFE], ['gerade', EAN_GERADE_LAEUFE]]
    : [['ungerade', EAN_LINKS_LAEUFE]];

  for (let i = 0; i < haelfte; i += 1) {
    const treffer = ziffernErkennen(laeufe, zeiger, linkeTabellen);
    if (!treffer) return null;
    linkeZiffern.push(treffer.ziffer);
    paritaet += treffer.satz === 'gerade' ? '1' : '0';
    zeiger += 4;
  }

  if (!passtAufMuster(laeufe, zeiger, [1, 1, 1, 1, 1], MAX_MITTLERE_ABWEICHUNG_EAN)) return null;
  zeiger += 5;

  const rechteZiffern = [];
  for (let i = 0; i < haelfte; i += 1) {
    const treffer = ziffernErkennen(laeufe, zeiger, [['rechts', EAN_LINKS_LAEUFE]]);
    if (!treffer) return null;
    rechteZiffern.push(treffer.ziffer);
    zeiger += 4;
  }

  if (!passtAufMuster(laeufe, zeiger, [1, 1, 1], MAX_MITTLERE_ABWEICHUNG_EAN)) return null;
  if (!ruhezoneDanach(laeufe, zeiger + 3, modulbreite)) return null;

  let wert;
  if (stellen === 13) {
    const ersteZiffer = EAN13_ERSTE_ZIFFER.indexOf(paritaet);
    if (ersteZiffer < 0) return null;
    wert = String(ersteZiffer) + linkeZiffern.join('') + rechteZiffern.join('');
  } else {
    wert = linkeZiffern.join('') + rechteZiffern.join('');
  }

  if (!gtinPruefzifferStimmt(wert)) return null;
  return { wert, format: stellen === 13 ? 'ean13' : 'ean8', endeBei: zeiger + 3 };
}

function code128ZeichenLesen(laeufe, start) {
  if (start + 6 > laeufe.length) return null;

  let bestesZeichen = -1;
  let besteAbweichung = MAX_MITTLERE_ABWEICHUNG_128;
  let besteLaenge = 6;

  for (let zeichen = 0; zeichen < CODE128_MUSTER.length; zeichen += 1) {
    const soll = CODE128_MUSTER[zeichen];
    if (start + soll.length > laeufe.length) continue;
    const ausschnitt = laeufe.slice(start, start + soll.length);
    const abweichung = musterAbweichung(ausschnitt, soll);
    if (abweichung < besteAbweichung) {
      besteAbweichung = abweichung;
      bestesZeichen = zeichen;
      besteLaenge = soll.length;
    }
  }

  if (bestesZeichen < 0) return null;
  return { zeichen: bestesZeichen, laenge: besteLaenge };
}

function code128WertAnwenden(wert, satz, einmaligerSatz) {
  const wirksam = einmaligerSatz || satz;

  if (wert === 102) return { text: GRUPPENTRENNER, satz, einmaligerSatz: null };
  if (wert === 98 && satz !== 'C') {
    return { text: '', satz, einmaligerSatz: satz === 'A' ? 'B' : 'A' };
  }
  if (wert === 99) return { text: '', satz: 'C', einmaligerSatz: null };
  if (wert === 100 && satz !== 'B') return { text: '', satz: 'B', einmaligerSatz: null };
  if (wert === 101 && satz !== 'A') return { text: '', satz: 'A', einmaligerSatz: null };
  if (wert === 96 || wert === 97) return { text: '', satz, einmaligerSatz: null };
  if ((wert === 100 && satz === 'B') || (wert === 101 && satz === 'A')) {
    // FNC4 schaltet auf den erweiterten Zeichenvorrat. Fassung 1 verwendet ihn
    // nicht und ueberspringt ihn, statt Unsinn zu liefern.
    return { text: '', satz, einmaligerSatz: null };
  }

  if (wirksam === 'C') {
    if (wert > 99) return null;
    return { text: String(wert).padStart(2, '0'), satz, einmaligerSatz: null };
  }

  if (wirksam === 'B') {
    if (wert > 95) return null;
    return { text: String.fromCharCode(wert + 32), satz, einmaligerSatz: null };
  }

  if (wert > 95) return null;
  const code = wert < 64 ? wert + 32 : wert - 64;
  return { text: String.fromCharCode(code), satz, einmaligerSatz: null };
}

/**
 * Liest einen Code 128 ab `start`. Die Pruefsumme steht als vorletztes
 * Zeichen vor dem Stoppzeichen und wird geprueft.
 */
function code128Lesen(laeufe, start) {
  const startZeichen = code128ZeichenLesen(laeufe, start);
  if (!startZeichen) return null;
  if (![CODE128_START_A, CODE128_START_B, CODE128_START_C].includes(startZeichen.zeichen)) {
    return null;
  }

  // Das Startzeichen ist elf Module breit und liefert damit den Massstab.
  const modulbreite = CODE128_MUSTER[startZeichen.zeichen]
    .reduce((summe, _, i) => summe + laeufe[start + i], 0) / 11;
  if (!ruhezoneDavor(laeufe, start, modulbreite)) return null;

  let satz = startZeichen.zeichen === CODE128_START_A
    ? 'A'
    : startZeichen.zeichen === CODE128_START_B ? 'B' : 'C';
  let einmaligerSatz = null;

  let pruefsumme = startZeichen.zeichen;
  let stelle = 0;
  let zeiger = start + startZeichen.laenge;
  let text = '';
  let vorheriger = null;

  for (let schutz = 0; schutz < 512; schutz += 1) {
    const gelesen = code128ZeichenLesen(laeufe, zeiger);
    if (!gelesen) return null;

    if (gelesen.zeichen === CODE128_STOPP) {
      if (vorheriger === null) return null;
      if (vorheriger !== pruefsumme % 103) return null;
      if (!text.length) return null;
      const endeBei = zeiger + gelesen.laenge;
      if (!ruhezoneDanach(laeufe, endeBei, modulbreite)) return null;
      return { wert: text, format: 'code128', endeBei };
    }

    if (vorheriger !== null) {
      const angewandt = code128WertAnwenden(vorheriger, satz, einmaligerSatz);
      if (angewandt === null) return null;
      text += angewandt.text;
      satz = angewandt.satz;
      einmaligerSatz = angewandt.einmaligerSatz;
      stelle += 1;
      pruefsumme += vorheriger * stelle;
    }

    vorheriger = gelesen.zeichen;
    zeiger += gelesen.laenge;
  }

  return null;
}

/**
 * Erkennt einen Code in einer bereits in Lauflaengen zerlegten Zeile.
 * `beginntMitBalken` sagt, ob `laeufe[0]` ein dunkler Lauf ist.
 */
export function codeAusLaeufen(laeufe, beginntMitBalken) {
  for (let start = beginntMitBalken ? 0 : 1; start + 6 < laeufe.length; start += 2) {
    const ean13 = eanLesen(laeufe, start, 13);
    if (ean13) return ean13;
    const ean8 = eanLesen(laeufe, start, 8);
    if (ean8) return ean8;
    const code128 = code128Lesen(laeufe, start);
    if (code128) return code128;
  }
  return null;
}

function helligkeitszeile(bild, index, senkrecht) {
  const { data, width, height } = bild;
  const laenge = senkrecht ? height : width;
  const zeile = new Uint8Array(laenge);

  for (let i = 0; i < laenge; i += 1) {
    const x = senkrecht ? index : i;
    const y = senkrecht ? i : index;
    const p = (y * width + x) * 4;
    // Ganzzahlige Graustufe, wie sie auch der QR-Decoder verwendet.
    zeile[i] = (data[p] * 77 + data[p + 1] * 151 + data[p + 2] * 28) >> 8;
  }
  return zeile;
}

// Breite eines Blocks, ueber den oertlich hellster und dunkelster Wert
// gesucht werden.
const BLOCKBREITE = 16;

/**
 * Schwellt eine Zeile oertlich. Ein globaler Schwellwert scheitert an
 * ungleichmaessigem Licht, das auf einem Etikett im Regal die Regel ist.
 *
 * Der Schwellwert ist bewusst die Mitte zwischen hellstem und dunkelstem Wert
 * der Umgebung und nicht deren Durchschnitt. Ein Durchschnitt verschiebt jede
 * Kante in dieselbe Richtung, sobald das Bild unscharf wird — Balken werden
 * dann durchgaengig schmaler und Luecken breiter. Genau diese gleichgerichtete
 * Verzerrung bringt die Zeichenerkennung zum Kippen, weil ein falsches
 * Zeichen dem verzerrten Muster knapp besser entspricht als das richtige.
 *
 * Wo die Umgebung zu wenig Kontrast hat — in der Ruhezone oder mitten in
 * einem breiten Balken — bleibt der zuletzt belastbare Schwellwert stehen,
 * statt Rauschen zu Balken zu erklaeren.
 */
export function zeileSchwellen(zeile) {
  const n = zeile.length;
  if (n < 16) return null;

  let min = 255;
  let max = 0;
  for (let i = 0; i < n; i += 1) {
    if (zeile[i] < min) min = zeile[i];
    if (zeile[i] > max) max = zeile[i];
  }
  if (max - min < MIN_KONTRAST) return null;

  const bloecke = Math.ceil(n / BLOCKBREITE);
  const blockMin = new Uint8Array(bloecke).fill(255);
  const blockMax = new Uint8Array(bloecke);
  for (let i = 0; i < n; i += 1) {
    const b = (i / BLOCKBREITE) | 0;
    if (zeile[i] < blockMin[b]) blockMin[b] = zeile[i];
    if (zeile[i] > blockMax[b]) blockMax[b] = zeile[i];
  }

  const bits = new Uint8Array(n);
  let schwelle = (min + max) / 2;

  for (let i = 0; i < n; i += 1) {
    const b = (i / BLOCKBREITE) | 0;
    let lokalMin = 255;
    let lokalMax = 0;
    for (let d = -1; d <= 1; d += 1) {
      const nachbar = b + d;
      if (nachbar < 0 || nachbar >= bloecke) continue;
      if (blockMin[nachbar] < lokalMin) lokalMin = blockMin[nachbar];
      if (blockMax[nachbar] > lokalMax) lokalMax = blockMax[nachbar];
    }
    if (lokalMax - lokalMin >= MIN_KONTRAST) schwelle = (lokalMin + lokalMax) / 2;
    bits[i] = zeile[i] < schwelle ? 1 : 0;
  }

  return bits;
}

export function bitsZuLaeufen(bits) {
  const laeufe = [];
  let aktuell = bits[0];
  let laenge = 0;
  for (let i = 0; i < bits.length; i += 1) {
    if (bits[i] === aktuell) {
      laenge += 1;
    } else {
      laeufe.push(laenge);
      aktuell = bits[i];
      laenge = 1;
    }
  }
  laeufe.push(laenge);
  return { laeufe, beginntMitBalken: bits[0] === 1 };
}

function zeileAuswerten(zeile) {
  const bits = zeileSchwellen(zeile);
  if (!bits) return null;

  const { laeufe, beginntMitBalken } = bitsZuLaeufen(bits);
  if (laeufe.length < 10) return null;

  const vorwaerts = codeAusLaeufen(laeufe, beginntMitBalken);
  if (vorwaerts) return vorwaerts;

  // Ein von der anderen Seite gehaltenes Etikett liest sich rueckwaerts.
  const rueckwaerts = [...laeufe].reverse();
  const endetMitBalken = (laeufe.length % 2 === 1) === beginntMitBalken;
  return codeAusLaeufen(rueckwaerts, endetMitBalken);
}

/**
 * Sucht einen Barcode in einem Bild.
 *
 * Ein Ergebnis gilt erst als erkannt, wenn `bestaetigungen` verschiedene
 * Bildzeilen denselben Wert liefern. Die Pruefziffer allein reicht nicht:
 * ein beschaedigter oder halb verdeckter EAN kann sich zu einer anderen,
 * fuer sich gueltigen Nummer verlesen. Verschiedene Zeilen verlesen sich
 * dabei praktisch nie gleich, weil sie unterschiedliches Rauschen sehen.
 *
 * @param {{data: Uint8ClampedArray, width: number, height: number}} bild
 * @param {{zeilen?: number, spalten?: boolean, bestaetigungen?: number}} optionen
 * @returns {{wert: string, format: string}|null}
 */
export function barcodeAusBild(bild, optionen = {}) {
  if (!bild || !bild.data || !bild.width || !bild.height) return null;

  const zeilen = Math.max(3, optionen.zeilen ?? 21);
  const spaltenAuch = optionen.spalten !== false;
  const noetig = Math.max(1, optionen.bestaetigungen ?? 2);

  const gesehen = new Map();

  const pruefen = (treffer) => {
    if (!treffer) return null;
    const schluessel = `${treffer.format} ${treffer.wert}`;
    const anzahl = (gesehen.get(schluessel) ?? 0) + 1;
    gesehen.set(schluessel, anzahl);
    return anzahl >= noetig ? { wert: treffer.wert, format: treffer.format } : null;
  };

  for (let i = 1; i <= zeilen; i += 1) {
    const y = Math.floor((bild.height * i) / (zeilen + 1));
    const bestaetigt = pruefen(zeileAuswerten(helligkeitszeile(bild, y, false)));
    if (bestaetigt) return bestaetigt;
  }

  if (!spaltenAuch) return null;

  // Spaltenweise beginnt die Zaehlung von vorn: ein waagerecht wie ein
  // senkrecht gelesener Wert soll fuer sich bestaetigt sein.
  gesehen.clear();

  for (let i = 1; i <= zeilen; i += 1) {
    const x = Math.floor((bild.width * i) / (zeilen + 1));
    const bestaetigt = pruefen(zeileAuswerten(helligkeitszeile(bild, x, true)));
    if (bestaetigt) return bestaetigt;
  }

  return null;
}

export const BARCODE_FORMATE = Object.freeze(['ean13', 'ean8', 'code128']);

export const NUR_FUER_TESTS = Object.freeze({
  CODE128_MUSTER,
  EAN_LINKS_LAEUFE,
  EAN_GERADE_LAEUFE,
  EAN13_ERSTE_ZIFFER,
  GRUPPENTRENNER
});
