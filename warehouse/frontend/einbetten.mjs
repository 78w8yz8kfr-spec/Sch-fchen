import { readFileSync } from 'node:fs';

/**
 * Bettet eine ausgelieferte Moduldatei woertlich in eine eigenstaendige Seite
 * ein. Nur die Modulsyntax faellt weg — am Inhalt wird nichts geaendert, damit
 * die Seite genau den Code zeigt, der spaeter auch laeuft.
 */
export function einbetten(pfad) {
  const quelle = readFileSync(pfad, 'utf8')
    .replace(/^import .*?;\n/gms, '')
    .replace(/^export const /gm, 'const ')
    .replace(/^export function /gm, 'function ')
    .replace(/^export async function /gm, 'async function ');

  if (/^\s*(import|export)\b/m.test(quelle)) {
    throw new Error(`In ${pfad} ist noch Modulsyntax übrig.`);
  }
  if (/<\/script>/i.test(quelle)) {
    throw new Error(`${pfad} enthält ein Script-Ende und kann nicht eingebettet werden.`);
  }
  return quelle;
}

export function platzhalterErsetzen(vorlage, teile) {
  let seite = vorlage;
  for (const [name, inhalt] of Object.entries(teile)) {
    const platzhalter = `/*__${name}__*/`;
    if (!seite.includes(platzhalter)) throw new Error(`Platzhalter ${name} fehlt in der Vorlage.`);
    seite = seite.replace(platzhalter, () => inhalt);
  }
  if (/\/\*__[A-Z_]+__\*\//.test(seite)) {
    throw new Error('Es ist ein Platzhalter übrig geblieben.');
  }
  return seite;
}
