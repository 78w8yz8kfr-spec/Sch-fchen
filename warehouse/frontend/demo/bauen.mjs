import { readFileSync, writeFileSync } from 'node:fs';
import { toString as qrToString } from 'qrcode';
import { einbetten, platzhalterErsetzen } from '../einbetten.mjs';

const frontend = new URL('../../../frontend/core/', import.meta.url);

// Die Vorschau hat keine API, die QR-Bilder erzeugen koennte. Fuer die festen
// Demo-Gegenstaende entstehen sie deshalb hier beim Bauen — mit demselben
// Erzeuger und denselben Einstellungen wie in der echten API, damit der
// Druckbogen zeigt, wie er wirklich aussieht.
const ZIELE = [
  ['art-1', '3f2504e0-4f89-41d3-9a0c-0305e82c3301'],
  ['art-2', '3f2504e0-4f89-41d3-9a0c-0305e82c3302'],
  ['art-3', '3f2504e0-4f89-41d3-9a0c-0305e82c3303'],
  ['ort-0', '3f2504e0-4f89-41d3-9a0c-0305e82c3310'],
  ['ort-1', '3f2504e0-4f89-41d3-9a0c-0305e82c3311'],
  ['ort-2', '3f2504e0-4f89-41d3-9a0c-0305e82c3312'],
  ['ort-3', '3f2504e0-4f89-41d3-9a0c-0305e82c3313']
];

const bilder = {};
for (const [id, token] of ZIELE) {
  const adresse = `https://app.example/?lager=${token}`;
  bilder[id] = {
    token,
    target: adresse,
    svg: await qrToString(adresse, {
      type: 'svg', errorCorrectionLevel: 'M', margin: 2, width: 480,
      color: { dark: '#111111ff', light: '#ffffffff' }
    })
  };
}

const seite = platzhalterErsetzen(
  readFileSync(new URL('vorlage.html', import.meta.url), 'utf8'),
  {
    DECODER: einbetten(new URL('barcode-decoder.mjs', frontend)),
    SCANNER: einbetten(new URL('barcode-scanner.mjs', frontend)),
    LAGER: einbetten(new URL('stock-management.js', frontend)),
    DEMO_QR: `const DEMO_QR = ${JSON.stringify(bilder)};`
  }
);

writeFileSync(new URL('../oberflaeche-demo.html', import.meta.url), seite);
console.log('Demo gebaut:', seite.length, 'Zeichen,', ZIELE.length, 'QR-Bilder');
