// Fassungen vergleichen.
//
// Warum das eine eigene Datei ist: die App muss merken, wenn der Server eine
// neuere Fassung hat als die Seite, die gerade im Browser liegt. Ein Telefon
// mit eingerichteter App kann sonst tagelang eine alte Oberflaeche zeigen -
// der Dienst-Worker taeuscht eine funktionierende Welt vor, und niemand
// erfaehrt, dass es eine neuere gibt.
//
// Der Vergleich muss zahlenweise geschehen. Als Zeichenketten waere "0.42.9"
// groesser als "0.42.28", und die Warnung bliebe genau dann aus, wenn sie
// gebraucht wird.

export function compareVersions(left, right) {
  // Jede Stelle muss eine Zahl sein. Ohne diese Pruefung wuerde die leere
  // Zeichenkette zu null werden - und eine fehlende Angabe saehe aus wie die
  // aelteste Fassung, die es je gab.
  const teile = (fassung) => {
    const stuecke = String(fassung ?? "").trim().split(".");
    if (stuecke.some((stueck) => !/^\d+$/.test(stueck))) return null;
    return stuecke.map(Number);
  };
  const links = teile(left);
  const rechts = teile(right);
  if (!links || !rechts) return null;

  for (let stelle = 0; stelle < Math.max(links.length, rechts.length); stelle += 1) {
    const a = links[stelle] ?? 0;
    const b = rechts[stelle] ?? 0;
    if (a !== b) return a < b ? -1 : 1;
  }
  return 0;
}

// Haengt die Seite hinter dem Server her?
//
// Nur dann wird gewarnt. Ist die Seite neuer als der Server - waehrend einer
// Veroeffentlichung moeglich, wenn die Dateien schon liegen und der Dienst
// noch startet -, hilft Neuladen nicht, und ein Hinweis waere nur Unruhe.
export function serverIsNewer(pageVersion, serverVersion) {
  return compareVersions(pageVersion, serverVersion) === -1;
}
