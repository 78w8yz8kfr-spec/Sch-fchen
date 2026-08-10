import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  barcodeAusBild,
  gtinPruefzifferStimmt,
  musterAbweichung,
  bitsZuLaeufen,
  NUR_FUER_TESTS
} from '../core/barcode-decoder.mjs';

const hier = dirname(fileURLToPath(import.meta.url));
const referenz = JSON.parse(readFileSync(join(hier, 'fixtures', 'barcodes.json'), 'utf8'));

const RUHEZONE = 12;

/**
 * Zeichnet eine Modulfolge als Bild. `senkrecht` dreht den Code um 90 Grad,
 * `spiegeln` haelt ihn andersherum vor die Kamera.
 */
function bildAusModulen(module, {
  modulbreite = 3,
  hoehe = 60,
  senkrecht = false,
  spiegeln = false,
  rauschen = 0,
  verlauf = 0,
  streuen = 0
} = {}) {
  const folge = spiegeln ? [...module].reverse().join('') : module;
  const breite = (folge.length + 2 * RUHEZONE) * modulbreite;

  const spalten = new Uint8Array(breite).fill(255);
  for (let i = 0; i < folge.length; i += 1) {
    if (folge[i] !== '1') continue;
    const von = (i + RUHEZONE) * modulbreite;
    for (let x = von; x < von + modulbreite; x += 1) spalten[x] = 0;
  }

  const bildbreite = senkrecht ? hoehe : breite;
  const bildhoehe = senkrecht ? breite : hoehe;
  const data = new Uint8ClampedArray(bildbreite * bildhoehe * 4);

  // Ein einfacher, wiederholbarer Zufall: ein Test darf nicht mal gruen und
  // mal rot sein.
  let saat = 20260810;
  const zufall = () => {
    saat = (saat * 1103515245 + 12345) & 0x7fffffff;
    return saat / 0x7fffffff;
  };

  for (let y = 0; y < bildhoehe; y += 1) {
    for (let x = 0; x < bildbreite; x += 1) {
      const laengs = senkrecht ? y : x;
      let wert = spalten[laengs];

      // Ungleichmaessiges Licht, wie es auf einem Etikett im Regal die Regel
      // ist: eine Seite ist dunkler als die andere.
      if (verlauf) {
        const anteil = laengs / (senkrecht ? bildhoehe : bildbreite);
        wert = Math.max(0, Math.min(255, wert - verlauf * anteil));
      }
      if (streuen) wert = Math.max(0, Math.min(255, wert + streuen));
      if (rauschen) wert = Math.max(0, Math.min(255, wert + (zufall() - 0.5) * 2 * rauschen));

      const p = (y * bildbreite + x) * 4;
      data[p] = wert;
      data[p + 1] = wert;
      data[p + 2] = wert;
      data[p + 3] = 255;
    }
  }

  return { data, width: bildbreite, height: bildhoehe };
}

/** Weichzeichnen ueber drei Pixel: ein unscharfes Kamerabild. */
function weichzeichnen(bild) {
  const { data, width, height } = bild;
  const kopie = new Uint8ClampedArray(data);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let summe = 0;
      let anzahl = 0;
      for (let dx = -1; dx <= 1; dx += 1) {
        const nx = x + dx;
        if (nx < 0 || nx >= width) continue;
        summe += data[(y * width + nx) * 4];
        anzahl += 1;
      }
      const mittel = Math.round(summe / anzahl);
      const p = (y * width + x) * 4;
      kopie[p] = mittel;
      kopie[p + 1] = mittel;
      kopie[p + 2] = mittel;
      kopie[p + 3] = 255;
    }
  }
  return { data: kopie, width, height };
}

function erwarteterWert(eintrag) {
  // UPC-A ist physikalisch ein EAN-13 mit fuehrender Null. Genau so wird er
  // zurueckgegeben, denn genau so wird daraus spaeter eine GTIN-14.
  return eintrag.symbologie === 'upca' ? `0${eintrag.wert}` : eintrag.wert;
}

function erwartetesFormat(eintrag) {
  if (eintrag.symbologie === 'ean8') return 'ean8';
  if (eintrag.symbologie.startsWith('code128')) return 'code128';
  return 'ean13';
}

test('die Referenzmuster stammen aus einer unabhaengigen Implementierung', () => {
  assert.ok(referenz.quelle.includes('JsBarcode'));
  assert.ok(referenz.codes.length >= 16);
  for (const eintrag of referenz.codes) {
    assert.match(eintrag.module, /^[01]+$/);
  }
});

test('die Code-128-Tabelle erfuellt die Bauregeln der Norm', () => {
  const muster = NUR_FUER_TESTS.CODE128_MUSTER;
  assert.equal(muster.length, 107);

  muster.forEach((zeichen, wert) => {
    const istStopp = wert === 106;
    assert.equal(zeichen.length, istStopp ? 7 : 6, `Zeichen ${wert} hat falsch viele Laeufe`);

    const module = zeichen.reduce((a, b) => a + b, 0);
    assert.equal(module, istStopp ? 13 : 11, `Zeichen ${wert} hat ${module} Module`);

    // Code 128 ist selbstpruefend: die Balken eines Zeichens ergeben immer
    // eine gerade Modulzahl. Ein Tippfehler in der Tabelle faellt hier auf.
    const balken = zeichen.filter((_, i) => i % 2 === 0).reduce((a, b) => a + b, 0);
    assert.equal(balken % 2, 0, `Zeichen ${wert} hat ${balken} Balkenmodule`);
  });
});

test('die EAN-Zeichentabelle hat sieben Module je Ziffer', () => {
  for (const laeufe of NUR_FUER_TESTS.EAN_LINKS_LAEUFE) {
    assert.equal(laeufe.length, 4);
    assert.equal(laeufe.reduce((a, b) => a + b, 0), 7);
  }
  assert.equal(NUR_FUER_TESTS.EAN13_ERSTE_ZIFFER.length, 10);
  assert.equal(new Set(NUR_FUER_TESTS.EAN13_ERSTE_ZIFFER).size, 10);
});

test('jedes Referenzmuster wird richtig gelesen', () => {
  for (const eintrag of referenz.codes) {
    for (const modulbreite of [2, 3, 5]) {
      const bild = bildAusModulen(eintrag.module, { modulbreite });
      const treffer = barcodeAusBild(bild);
      assert.ok(treffer, `${eintrag.symbologie} ${eintrag.wert} bei Modulbreite ${modulbreite} nicht erkannt`);
      assert.equal(treffer.wert, erwarteterWert(eintrag), `${eintrag.symbologie} ${eintrag.wert} falsch gelesen`);
      assert.equal(treffer.format, erwartetesFormat(eintrag));
    }
  }
});

test('ein andersherum gehaltenes Etikett wird ebenfalls gelesen', () => {
  for (const eintrag of referenz.codes) {
    const bild = bildAusModulen(eintrag.module, { spiegeln: true });
    const treffer = barcodeAusBild(bild);
    assert.ok(treffer, `${eintrag.wert} gespiegelt nicht erkannt`);
    assert.equal(treffer.wert, erwarteterWert(eintrag));
  }
});

test('ein hochkant gehaltenes Telefon findet denselben Code', () => {
  for (const eintrag of referenz.codes) {
    const bild = bildAusModulen(eintrag.module, { senkrecht: true });
    const treffer = barcodeAusBild(bild);
    assert.ok(treffer, `${eintrag.wert} senkrecht nicht erkannt`);
    assert.equal(treffer.wert, erwarteterWert(eintrag));
  }
});

test('Rauschen, Unschaerfe und ungleichmaessiges Licht kosten keinen Code', () => {
  for (const eintrag of referenz.codes) {
    const verrauscht = bildAusModulen(eintrag.module, { modulbreite: 4, rauschen: 40 });
    const a = barcodeAusBild(verrauscht);
    assert.ok(a, `${eintrag.wert} mit Rauschen nicht erkannt`);
    assert.equal(a.wert, erwarteterWert(eintrag));

    const unscharf = weichzeichnen(bildAusModulen(eintrag.module, { modulbreite: 4 }));
    const b = barcodeAusBild(unscharf);
    assert.ok(b, `${eintrag.wert} unscharf nicht erkannt`);
    assert.equal(b.wert, erwarteterWert(eintrag));

    // Ein globaler Schwellwert wuerde hier scheitern: die eine Seite des
    // Bildes ist dunkler als die weissen Stellen der anderen.
    const schattig = bildAusModulen(eintrag.module, { modulbreite: 4, verlauf: 150 });
    const c = barcodeAusBild(schattig);
    assert.ok(c, `${eintrag.wert} mit Lichtverlauf nicht erkannt`);
    assert.equal(c.wert, erwarteterWert(eintrag));
  }
});

test('ein sehr helles und ein sehr dunkles Bild bleiben lesbar', () => {
  const eintrag = referenz.codes.find((c) => c.symbologie === 'ean13');
  for (const streuen of [-60, 60]) {
    const bild = bildAusModulen(eintrag.module, { modulbreite: 4, streuen });
    const treffer = barcodeAusBild(bild);
    assert.ok(treffer, `Verschiebung ${streuen} nicht erkannt`);
    assert.equal(treffer.wert, eintrag.wert);
  }
});

test('ohne Code kommt nichts zurueck', () => {
  const weiss = {
    data: new Uint8ClampedArray(200 * 40 * 4).fill(255),
    width: 200,
    height: 40
  };
  assert.equal(barcodeAusBild(weiss), null);

  // Zufaellige Streifen duerfen keinen Code erfinden.
  let saat = 7;
  const zufall = () => {
    saat = (saat * 1103515245 + 12345) & 0x7fffffff;
    return saat / 0x7fffffff;
  };
  const rauschen = new Uint8ClampedArray(400 * 60 * 4);
  for (let i = 0; i < 400 * 60; i += 1) {
    const wert = zufall() < 0.5 ? 0 : 255;
    rauschen[i * 4] = wert;
    rauschen[i * 4 + 1] = wert;
    rauschen[i * 4 + 2] = wert;
    rauschen[i * 4 + 3] = 255;
  }
  assert.equal(barcodeAusBild({ data: rauschen, width: 400, height: 60 }), null);

  assert.equal(barcodeAusBild(null), null);
  assert.equal(barcodeAusBild({ data: new Uint8ClampedArray(4), width: 0, height: 0 }), null);
});

test('ein beschaedigter Code wird fast immer abgewiesen', () => {
  // Jede einzelne Modulstelle im Datenbereich wird umgedreht. Erwartet wird
  // nicht Unfehlbarkeit: eine einzelne Pruefziffer kann eine verlesene Nummer
  // rechnerisch nicht immer entlarven, das ist eine Eigenschaft der
  // Symbologie und keine der Umsetzung. Der Test haelt fest, wie selten das
  // passiert, damit eine Verschlechterung auffaellt.
  let gesamt = 0;
  let fehllesungen = 0;

  for (const eintrag of referenz.codes) {
    const erwartet = erwarteterWert(eintrag);

    for (let stelle = 3; stelle < eintrag.module.length - 3; stelle += 1) {
      const module = eintrag.module.split('');
      module[stelle] = module[stelle] === '1' ? '0' : '1';
      const treffer = barcodeAusBild(bildAusModulen(module.join(''), { modulbreite: 3 }));

      gesamt += 1;
      if (!treffer) continue;
      if (treffer.wert === erwartet) continue;

      fehllesungen += 1;
      // Was trotzdem herauskommt, muss wenigstens formal gueltig sein: eine
      // Zahlenfolge mit richtiger Pruefziffer beziehungsweise ein Code 128.
      if (treffer.format !== 'code128') {
        assert.ok(
          gtinPruefzifferStimmt(treffer.wert),
          `Stelle ${stelle}: ${treffer.wert} hat keine gueltige Pruefziffer`
        );
      }
    }
  }

  const anteil = fehllesungen / gesamt;
  assert.ok(gesamt > 1000, `Zu wenige Faelle geprueft: ${gesamt}`);
  // Gemessen liegt der Anteil bei 0,1 Prozent: von 1768 Einzelfehlern kommt
  // genau einer als andere, fuer sich gueltige EAN-13-Nummer zurueck. Die
  // Schranke laesst dafuer Luft, wuerde aber jede Rueckkehr zu den frueheren
  // fuenf Prozent bemerken.
  assert.ok(
    anteil < 0.01,
    `${(anteil * 100).toFixed(1)} Prozent Fehllesungen bei ${gesamt} Einzelfehlern`
  );
});

test('erst zwei uebereinstimmende Zeilen gelten als Treffer', () => {
  const eintrag = referenz.codes.find((c) => c.symbologie === 'ean13');
  const bild = bildAusModulen(eintrag.module, { modulbreite: 3 });

  assert.equal(barcodeAusBild(bild, { bestaetigungen: 1 }).wert, eintrag.wert);
  assert.equal(barcodeAusBild(bild, { bestaetigungen: 5 }).wert, eintrag.wert);
  // Mehr Bestaetigungen als gescannte Zeilen kann niemand liefern.
  assert.equal(barcodeAusBild(bild, { zeilen: 3, bestaetigungen: 99 }), null);
});

test('die GTIN-Pruefziffer entscheidet wie in der Datenbank', () => {
  assert.ok(gtinPruefzifferStimmt('4006381333931'));
  assert.ok(gtinPruefzifferStimmt('96385074'));
  assert.ok(gtinPruefzifferStimmt('04006381333931'));
  assert.ok(!gtinPruefzifferStimmt('4006381333930'));
  assert.ok(!gtinPruefzifferStimmt('123'));
  assert.ok(!gtinPruefzifferStimmt('ABC12345'));
});

test('die Musterabweichung weist zu grosse Einzelfehler ab', () => {
  assert.equal(musterAbweichung([2, 2, 2, 2], [1, 1, 1, 1]), 0);
  assert.equal(musterAbweichung([1, 1, 1], [1, 1, 1, 1]), Infinity);
  assert.equal(musterAbweichung([1, 1, 1, 1], [3, 2, 1, 1]), Infinity);
  assert.ok(musterAbweichung([3, 2, 1, 1], [3, 2, 1, 1]) === 0);
});

test('Lauflaengen geben die Farbe des ersten Laufs mit an', () => {
  const hell = bitsZuLaeufen(Uint8Array.from([0, 0, 1, 1, 1, 0]));
  assert.deepEqual(hell.laeufe, [2, 3, 1]);
  assert.equal(hell.beginntMitBalken, false);

  const dunkel = bitsZuLaeufen(Uint8Array.from([1, 0, 0]));
  assert.deepEqual(dunkel.laeufe, [1, 2]);
  assert.equal(dunkel.beginntMitBalken, true);
});
