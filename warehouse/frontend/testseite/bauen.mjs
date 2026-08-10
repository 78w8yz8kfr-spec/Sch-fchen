import { readFileSync, writeFileSync } from 'node:fs';
import { einbetten, platzhalterErsetzen } from '../einbetten.mjs';

const frontend = new URL('../../../frontend/core/', import.meta.url);

const seite = platzhalterErsetzen(
  readFileSync(new URL('vorlage.html', import.meta.url), 'utf8'),
  {
    DECODER: einbetten(new URL('barcode-decoder.mjs', frontend)),
    SCANNER: einbetten(new URL('barcode-scanner.mjs', frontend))
  }
);

writeFileSync(new URL('../barcode-testseite.html', import.meta.url), seite);
console.log('Prüfstand gebaut:', seite.length, 'Zeichen');
