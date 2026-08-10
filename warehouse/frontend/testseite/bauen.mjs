import { readFileSync, writeFileSync } from 'node:fs';

const wurzel = new URL('../', import.meta.url).pathname;

// Die geprueften Dateien werden woertlich uebernommen, nur die Modulsyntax
// faellt weg. Haende weg vom Inhalt: die Seite soll genau den Code testen,
// der auch ausgeliefert wird.
function einbetten(datei) {
  return readFileSync(wurzel + datei, 'utf8')
    .replace(/^import .*?;\n/gms, '')
    .replace(/^export const /gm, 'const ')
    .replace(/^export function /gm, 'function ')
    .replace(/^export async function /gm, 'async function ');
}

const decoder = einbetten('barcode-decoder.mjs');
const scanner = einbetten('barcode-scanner.mjs');

for (const [name, quelle] of [['decoder', decoder], ['scanner', scanner]]) {
  if (/^\s*(import|export)\b/m.test(quelle)) {
    throw new Error(`In ${name} ist noch Modulsyntax übrig.`);
  }
}

const vorlage = readFileSync(
  new URL('vorlage.html', import.meta.url),
  'utf8'
);

const seite = vorlage
  .replace('/*__DECODER__*/', () => decoder)
  .replace('/*__SCANNER__*/', () => scanner);

if (seite.includes('__DECODER__') || seite.includes('__SCANNER__')) {
  throw new Error('Ein Platzhalter wurde nicht ersetzt.');
}
if (/<\/script>/i.test(decoder + scanner)) {
  throw new Error('Der eingebettete Code enthält ein Script-Ende.');
}

writeFileSync(new URL('../barcode-testseite.html', import.meta.url), seite);
console.log('Seite gebaut:', seite.length, 'Zeichen');
console.log('Decoder:', decoder.split('\n').length, 'Zeilen, Scanner:', scanner.split('\n').length, 'Zeilen');
