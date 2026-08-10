import { readFileSync, writeFileSync } from 'node:fs';
import { einbetten, platzhalterErsetzen } from '../einbetten.mjs';

const frontend = new URL('../', import.meta.url);

const seite = platzhalterErsetzen(
  readFileSync(new URL('vorlage.html', import.meta.url), 'utf8'),
  {
    DECODER: einbetten(new URL('barcode-decoder.mjs', frontend)),
    SCANNER: einbetten(new URL('barcode-scanner.mjs', frontend)),
    LAGER: einbetten(new URL('stock-management.js', frontend))
  }
);

writeFileSync(new URL('../oberflaeche-demo.html', import.meta.url), seite);
console.log('Demo gebaut:', seite.length, 'Zeichen');
