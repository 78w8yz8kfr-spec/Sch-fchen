// Scan-Anbindung der Lagerverwaltung.
//
// Getrennt vom Decoder, weil hier etwas anderes entschieden wird: welcher
// Leser verwendet wird, was ein gelesener Code fachlich bedeutet und wann ein
// Treffer als neuer Treffer gilt. Diese Datei enthaelt bewusst kein DOM. Was
// sie braucht — Bildquelle, Zeitgeber, Ablaufplaner — wird hereingereicht,
// damit dieselbe Logik im Test ohne Kamera laeuft.

import { barcodeAusBild } from './barcode-decoder.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const SCAN_ARTEN = Object.freeze({
  GTIN: 'gtin',
  FREITEXT: 'freitext',
  ETIKETT: 'etikett'
});

// Formate, die `BarcodeDetector` fuer uns lesen soll. QR ist dabei, weil im
// Lager beide Codearten nebeneinander vorkommen: der Herstellercode auf der
// Packung und das eigene Etikett am Fach.
export const NATIVE_FORMATE = Object.freeze([
  'ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'qr_code'
]);

/**
 * Normalisiert einen Herstellercode auf GTIN-14 und prueft die Pruefziffer.
 *
 * Die Rechnung ist absichtlich dieselbe wie in `stock_normalize_gtin` in
 * Migration 200. Kaeme das Frontend zu einem anderen Ergebnis als die
 * Datenbank, wuerde derselbe Artikel je nach Weg zweimal entstehen.
 */
export function gtinNormalisieren(rohcode) {
  const ziffern = String(rohcode ?? '').replace(/[^0-9]/g, '');
  if (![8, 12, 13, 14].includes(ziffern.length)) return null;

  const gefuellt = ziffern.padStart(14, '0');

  let summe = 0;
  for (let stelle = 1; stelle <= 13; stelle += 1) {
    summe += Number(gefuellt[stelle - 1]) * (stelle % 2 === 1 ? 3 : 1);
  }
  const pruefziffer = (10 - (summe % 10)) % 10;
  if (pruefziffer !== Number(gefuellt[13])) return null;

  return gefuellt;
}

/**
 * Deutet einen gelesenen Code fachlich.
 *
 * Drei Faelle, die im Lager nebeneinander vorkommen:
 * - ein eigenes Etikett, das nur eine zufaellige UUID in einer
 *   Schäfchen-Adresse traegt,
 * - ein Herstellercode, der sich als GTIN erweist,
 * - alles uebrige, das als Freitextcode gefuehrt wird.
 *
 * Die Zuordnung entspricht dem, was der Trigger
 * `stock_item_barcodes_before_write` beim Speichern tut.
 */
export function scanDeuten(rohwert, { basis = 'https://example.invalid/' } = {}) {
  const text = String(rohwert ?? '').trim();
  if (!text) return null;

  let etikett = text;
  try {
    const ausAdresse = new URL(text, basis).searchParams.get('lager');
    if (ausAdresse) etikett = ausAdresse;
  } catch {
    // Kein gueltiger Verweis, also ein reiner Wert.
  }
  if (UUID.test(etikett)) {
    return { art: SCAN_ARTEN.ETIKETT, wert: etikett.toLowerCase() };
  }

  const gtin = gtinNormalisieren(text);
  if (gtin) return { art: SCAN_ARTEN.GTIN, wert: gtin };

  return { art: SCAN_ARTEN.FREITEXT, wert: text.toUpperCase() };
}

/**
 * Baut den eingebauten Leser des Browsers, sofern es ihn gibt und er die
 * gebrauchten Formate kann. Auf iOS gibt es ihn nicht; dort bleibt der
 * lokale Decoder.
 */
export async function nativeErkennungErzeugen(fenster = globalThis) {
  const Erkenner = fenster?.BarcodeDetector;
  if (typeof Erkenner !== 'function') return null;

  let unterstuetzt;
  try {
    unterstuetzt = await Erkenner.getSupportedFormats();
  } catch {
    return null;
  }
  if (!Array.isArray(unterstuetzt)) return null;

  const formate = NATIVE_FORMATE.filter((format) => unterstuetzt.includes(format));
  // Ohne die eindimensionalen Formate bringt der eingebaute Leser hier
  // nichts: QR allein kann der mitgelieferte Decoder auch.
  if (!formate.includes('ean_13') && !formate.includes('code_128')) return null;

  try {
    return new Erkenner({ formats: formate });
  } catch {
    return null;
  }
}

function nativesErgebnisDeuten(treffer) {
  if (!Array.isArray(treffer) || !treffer.length) return null;
  const erster = treffer[0];
  const rohwert = typeof erster === 'string' ? erster : erster?.rawValue;
  if (!rohwert) return null;
  return String(rohwert);
}

/**
 * Waehlt den Leser: erst der eingebaute, sonst der mitgelieferte.
 * Beide liefern denselben Rohwert, damit die Deutung dahinter gleich bleibt.
 */
export async function erkennungWaehlen({ fenster = globalThis, decoderOptionen } = {}) {
  const nativ = await nativeErkennungErzeugen(fenster);

  if (nativ) {
    return {
      art: 'nativ',
      formate: NATIVE_FORMATE,
      async lesen(quelle) {
        const treffer = await nativ.detect(quelle.bild ?? quelle);
        return nativesErgebnisDeuten(treffer);
      }
    };
  }

  return {
    art: 'lokal',
    formate: ['ean_13', 'ean_8', 'upc_a', 'code_128'],
    async lesen(quelle) {
      const bildDaten = quelle.bildDaten ?? quelle;
      const gefunden = barcodeAusBild(bildDaten, decoderOptionen);
      return gefunden ? gefunden.wert : null;
    }
  };
}

/**
 * Laesst den Leser wiederholt auf die Bildquelle los.
 *
 * Ein Scanner sieht denselben Code viele Male je Sekunde. Ohne Sperre wuerde
 * ein einziges Hinhalten des Etiketts ein Dutzend Buchungen ausloesen, und
 * genau das darf im Lager nicht passieren. `sperrzeit` haelt denselben Wert
 * so lange zurueck; ein anderer Code kommt jederzeit sofort durch.
 */
export function scanSchleifeStarten({
  rahmenHolen,
  leser,
  onTreffer,
  onFehler,
  planen = (fn) => setTimeout(fn, 0),
  jetzt = () => Date.now(),
  sperrzeit = 2000
}) {
  let laeuft = true;
  let letzterWert = null;
  let letzteZeit = 0;

  const schritt = async () => {
    if (!laeuft) return;

    try {
      const rahmen = await rahmenHolen();
      if (rahmen) {
        const rohwert = await leser.lesen(rahmen);
        if (rohwert) {
          const zeitpunkt = jetzt();
          const gesperrt = rohwert === letzterWert && zeitpunkt - letzteZeit < sperrzeit;
          if (!gesperrt) {
            letzterWert = rohwert;
            letzteZeit = zeitpunkt;
            const gedeutet = scanDeuten(rohwert);
            if (gedeutet) onTreffer(gedeutet, rohwert);
          }
        }
      }
    } catch (fehler) {
      if (onFehler) onFehler(fehler);
    }

    if (laeuft) planen(schritt);
  };

  planen(schritt);

  return {
    stoppen() {
      laeuft = false;
    },
    laeuft() {
      return laeuft;
    }
  };
}
