// Gemeinsamer Zeichenschutz für alle PDF-Erzeuger.
//
// Alle vier Erzeuger zeichnen mit StandardFonts.Helvetica, also mit der
// WinAnsi-Kodierung. Die deckt Latin-1 vollständig ab - Halbgeviertstrich,
// typografische Anführungszeichen, Auslassungszeichen und ß funktionieren
// darin einwandfrei und brauchen keine Ersetzung. Was WinAnsi nicht kennt,
// ist alles außerhalb von Latin-1: griechische Buchstaben (Ω, Δ, µ), Emoji
// und Namen mit osteuropäischen Sonderzeichen (Łukasz, Şahin, Đorđe). Ohne
// dieses Sieb wirft pdf-lib dort eine Ausnahme ("WinAnsi cannot encode ...")
// - und reißt damit die Freigabe eines Montage- oder Bautagesberichts, den
// Stundenzettel-Export oder den Azubi-Bericht in einen 500er. Bei Montage-
// und Bautagesberichten ist die Freigabe laut Dokumentenmodell unveränderlich
// und rechtlich relevant; sie darf nicht an einem einzelnen Buchstaben
// scheitern, sondern bekommt hier eine lesbare Ersatzdarstellung.
const PDF_TEXT_REPLACEMENTS = new Map([
  ["€", "EUR"],
  ["Ω", "Ohm"],
  ["Δ", "Delta"],
  ["µ", "u"],
  ["–", "-"],
  ["—", "-"],
  ["„", "\""],
  ["“", "\""],
  ["”", "\""],
  ["’", "'"],
  ["→", "->"],
  ["←", "<-"],
  ["≤", "<="],
  ["≥", ">="],
  ["×", "x"]
]);

// Zeichenweise statt per Ersetzungs-Regex, damit auch unbekannte Zeichen
// (z.B. Emoji, die aus zwei UTF-16-Einheiten bestehen) sauber durch ein
// einzelnes "?" ersetzt werden, statt die PDF-Erzeugung abzubrechen.
export function pdfSafeText(value) {
  let safe = "";
  for (const character of String(value ?? "")) {
    const codePoint = character.codePointAt(0);
    if (
      character === "\n"
      || (codePoint >= 32 && codePoint <= 126)
      || (codePoint >= 160 && codePoint <= 255)
    ) {
      safe += character;
    } else {
      safe += PDF_TEXT_REPLACEMENTS.get(character) || "?";
    }
  }
  return safe;
}
