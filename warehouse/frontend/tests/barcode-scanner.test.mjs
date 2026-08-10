import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SCAN_ARTEN,
  NATIVE_FORMATE,
  gtinNormalisieren,
  scanDeuten,
  nativeErkennungErzeugen,
  erkennungWaehlen,
  scanSchleifeStarten
} from '../barcode-scanner.mjs';

// Die Werte stammen aus dem SQL-Abnahmetest der Migration 200. Frontend und
// Datenbank muessen denselben Code auf dieselbe GTIN abbilden, sonst entsteht
// derselbe Artikel je nach Weg zweimal.
const GLEICHE_ERWARTUNG_WIE_DATENBANK = [
  ['4006381333931', '04006381333931'],
  ['96385074', '00000096385074'],
  ['036000291452', '00036000291452'],
  ['4006381333930', null],
  ['ABC-123', null]
];

test('die GTIN-Normalisierung stimmt mit der Datenbank ueberein', () => {
  for (const [eingabe, erwartet] of GLEICHE_ERWARTUNG_WIE_DATENBANK) {
    assert.equal(gtinNormalisieren(eingabe), erwartet, `${eingabe} wurde anders normalisiert`);
  }
});

test('Trennzeichen im Code stoeren die GTIN nicht', () => {
  assert.equal(gtinNormalisieren(' 4006381 333931 '), '04006381333931');
  assert.equal(gtinNormalisieren('4-006381-333931'), '04006381333931');
});

test('zu kurze und zu lange Ziffernfolgen sind keine GTIN', () => {
  assert.equal(gtinNormalisieren('1234567'), null);
  assert.equal(gtinNormalisieren('123456789012345'), null);
  assert.equal(gtinNormalisieren(''), null);
  assert.equal(gtinNormalisieren(null), null);
});

test('ein eigenes Etikett wird als Etikett erkannt', () => {
  const token = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

  assert.deepEqual(scanDeuten(`https://app.example/lager?lager=${token}`), {
    art: SCAN_ARTEN.ETIKETT,
    wert: token
  });
  assert.deepEqual(scanDeuten(token.toUpperCase()), {
    art: SCAN_ARTEN.ETIKETT,
    wert: token
  });
});

test('ein Herstellercode wird als GTIN gedeutet', () => {
  assert.deepEqual(scanDeuten('4006381333931'), {
    art: SCAN_ARTEN.GTIN,
    wert: '04006381333931'
  });
});

test('alles uebrige bleibt Freitext, wie in der Datenbank', () => {
  assert.deepEqual(scanDeuten('kabel-trommel-01'), {
    art: SCAN_ARTEN.FREITEXT,
    wert: 'KABEL-TROMMEL-01'
  });
  // Eine Ziffernfolge mit falscher Pruefziffer ist keine GTIN und darf
  // trotzdem nicht verloren gehen.
  assert.deepEqual(scanDeuten('4006381333930'), {
    art: SCAN_ARTEN.FREITEXT,
    wert: '4006381333930'
  });
  assert.equal(scanDeuten('   '), null);
  assert.equal(scanDeuten(null), null);
});

test('der eingebaute Leser wird nur genommen, wenn er Strichcodes kann', async () => {
  assert.equal(await nativeErkennungErzeugen({}), null);

  // Safari auf iOS: die Schnittstelle fehlt ganz.
  assert.equal(await nativeErkennungErzeugen({ BarcodeDetector: undefined }), null);

  // Ein Browser, der ausschliesslich QR kann, bringt uns nichts: das kann der
  // mitgelieferte Decoder auch.
  const nurQr = {
    BarcodeDetector: Object.assign(function () {}, {
      getSupportedFormats: async () => ['qr_code']
    })
  };
  assert.equal(await nativeErkennungErzeugen(nurQr), null);

  let uebergebeneFormate = null;
  const kannAlles = {
    BarcodeDetector: Object.assign(
      function (optionen) { uebergebeneFormate = optionen.formats; },
      { getSupportedFormats: async () => [...NATIVE_FORMATE] }
    )
  };
  assert.ok(await nativeErkennungErzeugen(kannAlles));
  assert.deepEqual(uebergebeneFormate, [...NATIVE_FORMATE]);
});

test('eine kaputte Schnittstelle faellt auf den lokalen Decoder zurueck', async () => {
  const wirftBeimFragen = {
    BarcodeDetector: Object.assign(function () {}, {
      getSupportedFormats: async () => { throw new Error('kaputt'); }
    })
  };
  assert.equal(await nativeErkennungErzeugen(wirftBeimFragen), null);

  const wirftBeimBauen = {
    BarcodeDetector: Object.assign(
      function () { throw new Error('kaputt'); },
      { getSupportedFormats: async () => [...NATIVE_FORMATE] }
    )
  };
  assert.equal(await nativeErkennungErzeugen(wirftBeimBauen), null);

  const gewaehlt = await erkennungWaehlen({ fenster: wirftBeimBauen });
  assert.equal(gewaehlt.art, 'lokal');
});

test('der eingebaute Leser liefert denselben Rohwert wie der lokale', async () => {
  const fenster = {
    BarcodeDetector: Object.assign(
      function () {
        this.detect = async () => [{ rawValue: '4006381333931', format: 'ean_13' }];
      },
      { getSupportedFormats: async () => [...NATIVE_FORMATE] }
    )
  };

  const leser = await erkennungWaehlen({ fenster });
  assert.equal(leser.art, 'nativ');
  assert.equal(await leser.lesen({ bild: {} }), '4006381333931');

  const leerErgebnis = await erkennungWaehlen({
    fenster: {
      BarcodeDetector: Object.assign(
        function () { this.detect = async () => []; },
        { getSupportedFormats: async () => [...NATIVE_FORMATE] }
      )
    }
  });
  assert.equal(await leerErgebnis.lesen({ bild: {} }), null);
});

function schleifeLaufenLassen(schritte, aufbau) {
  const warteschlange = [];
  const planen = (fn) => warteschlange.push(fn);
  const steuerung = aufbau(planen);

  return (async () => {
    for (let i = 0; i < schritte && warteschlange.length; i += 1) {
      const naechster = warteschlange.shift();
      await naechster();
    }
    return steuerung;
  })();
}

test('derselbe Code loest nicht bei jedem Kamerabild eine Buchung aus', async () => {
  const treffer = [];
  let zeit = 0;

  await schleifeLaufenLassen(6, (planen) => scanSchleifeStarten({
    rahmenHolen: () => ({}),
    leser: { lesen: async () => '4006381333931' },
    onTreffer: (gedeutet) => treffer.push(gedeutet.wert),
    planen,
    jetzt: () => { zeit += 100; return zeit; },
    sperrzeit: 2000
  }));

  assert.deepEqual(treffer, ['04006381333931'], 'Ein Hinhalten darf genau einmal buchen');
});

test('nach der Sperrzeit zaehlt dasselbe Etikett wieder', async () => {
  const treffer = [];
  let zeit = 0;

  await schleifeLaufenLassen(4, (planen) => scanSchleifeStarten({
    rahmenHolen: () => ({}),
    leser: { lesen: async () => '4006381333931' },
    onTreffer: (gedeutet) => treffer.push(gedeutet.wert),
    planen,
    jetzt: () => { zeit += 3000; return zeit; },
    sperrzeit: 2000
  }));

  assert.equal(treffer.length, 4, 'Ein erneutes Hinhalten muss buchen koennen');
});

test('ein anderer Code kommt sofort durch', async () => {
  const treffer = [];
  const werte = ['4006381333931', '4006381333931', '96385074', '96385074'];
  let i = 0;

  await schleifeLaufenLassen(4, (planen) => scanSchleifeStarten({
    rahmenHolen: () => ({}),
    leser: { lesen: async () => werte[i++] ?? null },
    onTreffer: (gedeutet) => treffer.push(gedeutet.wert),
    planen,
    jetzt: () => 1000,
    sperrzeit: 2000
  }));

  assert.deepEqual(treffer, ['04006381333931', '00000096385074']);
});

test('ein Fehler beim Lesen beendet die Schleife nicht', async () => {
  const fehler = [];
  const treffer = [];
  let aufruf = 0;

  await schleifeLaufenLassen(4, (planen) => scanSchleifeStarten({
    rahmenHolen: () => ({}),
    leser: {
      lesen: async () => {
        aufruf += 1;
        if (aufruf === 1) throw new Error('Kamerabild unbrauchbar');
        return '4006381333931';
      }
    },
    onTreffer: (gedeutet) => treffer.push(gedeutet.wert),
    onFehler: (f) => fehler.push(f.message),
    planen,
    jetzt: () => 1000,
    sperrzeit: 2000
  }));

  assert.deepEqual(fehler, ['Kamerabild unbrauchbar']);
  assert.deepEqual(treffer, ['04006381333931']);
});

test('gestoppt wird gestoppt', async () => {
  const treffer = [];
  const warteschlange = [];
  const steuerung = scanSchleifeStarten({
    rahmenHolen: () => ({}),
    leser: { lesen: async () => '4006381333931' },
    onTreffer: (gedeutet) => treffer.push(gedeutet.wert),
    planen: (fn) => warteschlange.push(fn),
    jetzt: () => 1000
  });

  steuerung.stoppen();
  assert.equal(steuerung.laeuft(), false);

  while (warteschlange.length) await warteschlange.shift()();
  assert.deepEqual(treffer, [], 'Nach dem Stoppen darf nichts mehr gebucht werden');
});
