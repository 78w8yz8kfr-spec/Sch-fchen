import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// Der gedruckte Ausbildungsnachweis: eine A4-Seite je Woche.
//
// Genau so verlangt es die Kammer, und genau so haengt es am Ende im Ordner:
// Kopfdaten des Auszubildenden, eine Zeile je Tag mit Taetigkeiten und
// Arbeitszeit, Bemerkungen zur Woche und zwei Unterschriften. Die Seite muss
// ohne Bildschirm lesbar sein - sie wird abgeheftet, nicht angeklickt.
//
// Der Fussbereich steht fest: Unterschriften und Hinweis liegen immer an
// derselben Stelle, damit jede Woche im Ordner gleich aussieht. Die
// Tagestabelle bekommt den Platz, der darueber uebrig bleibt, und verkleinert
// ihre Schrift so weit, bis sie hineinpasst. Erst wenn selbst die kleinste
// noch lesbare Schrift nicht reicht, laeuft die Woche auf ein zweites Blatt.
// Geschriebene Zeilen abzuschneiden waere der schlechtere Handel: der
// Nachweis waere dann unvollstaendig.

const A4 = [595.28, 841.89];
const INK = rgb(0.08, 0.08, 0.08);
const MUTED = rgb(0.38, 0.38, 0.38);
const LINE = rgb(0.72, 0.72, 0.72);
const SOFT = rgb(0.97, 0.97, 0.97);

const MARGIN = 48;
const RIGHT = A4[0] - MARGIN;
const WIDTH = RIGHT - MARGIN;

// Feste Hoehen im Fussbereich, von unten gemessen.
const FOOTER_Y = 44;          // Hinweis und Seitenzahl
const SIGNATURE_TOP = 112;    // Oberkante des Unterschriftenblocks
const REMARK_BOTTOM = 150;    // Unterkante des Bemerkungskastens
const TABLE_GAP = 22;         // Luft zwischen Tabelle und Bemerkungen
const PAGE_BOTTOM = 64;       // Tiefster Punkt einer Tabellenzeile

const HEADER_ROW_HEIGHT = 22;
const MIN_ROW_HEIGHT = 34;
const FONT_SIZES = [9, 8.5, 8, 7.5, 7, 6.5];

const WEEKDAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

function germanDate(value) {
  const [year, month, day] = String(value || "").slice(0, 10).split("-");
  return year && month && day ? `${day}.${month}.${year}` : "-";
}

function duration(minutes) {
  const value = Math.max(0, Number(minutes) || 0);
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")} h`;
}

function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// Kalenderwoche nach ISO 8601 - dieselbe Zaehlung, die auf jedem deutschen
// Kalender steht.
export function isoWeekNumber(isoDate) {
  const date = new Date(`${isoDate}T12:00:00Z`);
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3);
  return {
    week: 1 + Math.round((date - firstThursday) / (7 * 86_400_000)),
    year: date.getUTCFullYear()
  };
}

// Das Lehrjahr ergibt sich aus dem Ausbildungsbeginn. Von Hand gepflegt waere
// es spaetestens im zweiten Jahr falsch.
export function trainingYear(startedOn, weekStart) {
  if (!startedOn) return null;
  const beginn = new Date(`${startedOn}T12:00:00Z`);
  const woche = new Date(`${weekStart}T12:00:00Z`);
  if (woche < beginn) return null;
  const jahre = Math.floor((woche - beginn) / (365.25 * 86_400_000));
  return Math.min(4, jahre + 1);
}

function wrapText(text, font, size, maxWidth) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

// Die Abwesenheit steht zuerst: an einem Urlaubstag ist sie die Aussage des
// Tages, alles andere waere daneben.
function dayEntries(zeile) {
  const eintraege = [
    ...(zeile.absence ? [zeile.absence] : []),
    ...(zeile.activities || [])
  ];
  return eintraege.length ? eintraege : ["–"];
}

// Wie hoch wird die Tabelle bei dieser Schriftgroesse? Der Punkt vor der
// ersten Zeile eines Eintrags wird hier schon gesetzt, damit beim Zeichnen
// nicht geraten werden muss, welche Zeile zu welchem Eintrag gehoert.
function layoutRows(zeilen, font, size, textWidth) {
  const zeilenhoehe = size + 3;
  return zeilen.map((zeile) => {
    const texte = [];
    for (const eintrag of dayEntries(zeile)) {
      wrapText(eintrag, font, size, textWidth).forEach((text, index) => {
        texte.push({ text, punkt: index === 0 });
      });
    }
    return {
      zeile,
      texte,
      zeilenhoehe,
      hoehe: Math.max(MIN_ROW_HEIGHT, texte.length * zeilenhoehe + 16)
    };
  });
}

// Eine Woche zeichnen: ein Blatt, im Ausnahmefall zwei. Die Funktion haengt
// ihre Seiten an die uebergebene Liste an, damit ein Heft ueber mehrere Wochen
// am Ende durchgezaehlt werden kann.
function drawWeek({ document, seiten, fonts, logoImage, report, apprentice, company }) {
  const { regular, bold, italic } = fonts;
  const { week, year } = isoWeekNumber(report.weekStart);

  const neueSeite = () => {
    const seite = document.addPage(A4);
    seiten.push(seite);
    return seite;
  };

  let page = neueSeite();
  let y = A4[1] - MARGIN;

  if (logoImage) {
    const skala = Math.min(132 / logoImage.width, 62 / logoImage.height);
    page.drawImage(logoImage, {
      x: MARGIN,
      y: y - logoImage.height * skala,
      width: logoImage.width * skala,
      height: logoImage.height * skala
    });
    y -= logoImage.height * skala + 14;
  } else {
    page.drawText(company.displayName, { x: MARGIN, y: y - 16, size: 15, font: bold, color: INK });
    y -= 34;
  }

  page.drawLine({ start: { x: MARGIN, y }, end: { x: RIGHT, y }, thickness: 1, color: LINE });
  y -= 30;

  const mitte = (text, font, size, abstand) => {
    const textBreite = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: MARGIN + (WIDTH - textBreite) / 2, y, size, font, color: INK });
    y -= abstand;
  };
  mitte("BERICHTSHEFT", bold, 17, 22);
  mitte(`Woche ${week} / ${year}`, bold, 11, 16);
  mitte(
    `${germanDate(report.weekStart)} – ${germanDate(addDays(report.weekStart, 4))}`,
    regular, 10, 24
  );

  // Kopfdaten
  //
  // Das Lehrjahr wird je Woche gerechnet: ein Heft ueber zwei Lehrjahre truege
  // sonst auf allen Blaettern dasselbe.
  const lehrjahr = trainingYear(apprentice.startedOn, report.weekStart)
    ?? apprentice.trainingYear
    ?? null;
  const kopfZeilen = [
    ["Azubi:", apprentice.name],
    ["Lehrjahr:", lehrjahr ? `${lehrjahr}. Lehrjahr` : "–"],
    ["Ausbildungsberuf:", apprentice.occupation || "–"],
    ["Berichtsheft-Intervall:", "wöchentlich"]
  ];
  const kopfHoehe = kopfZeilen.length * 17 + 16;
  page.drawRectangle({
    x: MARGIN, y: y - kopfHoehe, width: WIDTH, height: kopfHoehe,
    borderColor: LINE, borderWidth: 0.8, color: SOFT
  });
  let kopfY = y - 20;
  for (const [beschriftung, wert] of kopfZeilen) {
    page.drawText(beschriftung, { x: MARGIN + 14, y: kopfY, size: 9, font: regular, color: MUTED });
    page.drawText(wert, { x: MARGIN + 150, y: kopfY, size: 9.5, font: regular, color: INK });
    kopfY -= 17;
  }
  y -= kopfHoehe + 26;

  // Der Bemerkungskasten waechst mit seinem Text nach oben; die Unterschriften
  // darunter bleiben, wo sie sind.
  const bemerkungZeilen = wrapText(report.weekRemark || "", regular, 9, WIDTH - 24).slice(0, 10);
  const bemerkungHoehe = 30 + Math.max(3, bemerkungZeilen.filter(Boolean).length) * 15;
  const bemerkungOben = REMARK_BOTTOM + bemerkungHoehe;

  // Tagestabelle
  const spalten = [
    { titel: "Tag", x: MARGIN, breite: 74 },
    { titel: "Datum", x: MARGIN + 74, breite: 74 },
    { titel: "Tätigkeiten (Was habe ich heute gemacht?)", x: MARGIN + 148, breite: 268 },
    { titel: "Arbeitszeit", x: MARGIN + 416, breite: WIDTH - 416 }
  ];
  const textBreite = spalten[2].breite - 24;

  const tabellenkopf = (oben) => {
    page.drawRectangle({
      x: MARGIN, y: oben - HEADER_ROW_HEIGHT, width: WIDTH, height: HEADER_ROW_HEIGHT,
      borderColor: LINE, borderWidth: 0.8, color: SOFT
    });
    for (const spalte of spalten) {
      page.drawText(spalte.titel, {
        x: spalte.x + 8, y: oben - 15, size: 8.5, font: regular, color: MUTED
      });
    }
    return oben - HEADER_ROW_HEIGHT;
  };

  const rohzeilen = (report.dailyEntries || []).filter((zeile) => zeile.workDate);

  // Die groesste Schrift waehlen, mit der die Woche auf dieses eine Blatt
  // passt. Zwei Blaetter fuer eine Woche waeren im Ordner der Kammer eines zu
  // viel - aber immer noch besser, als Geschriebenes wegzulassen.
  const platzAufErsterSeite = (y - HEADER_ROW_HEIGHT) - (bemerkungOben + TABLE_GAP);
  let gelegt = layoutRows(rohzeilen, regular, FONT_SIZES.at(-1), textBreite);
  let schriftgroesse = FONT_SIZES.at(-1);
  for (const groesse of FONT_SIZES) {
    const versuch = layoutRows(rohzeilen, regular, groesse, textBreite);
    const gesamt = versuch.reduce((summe, eintrag) => summe + eintrag.hoehe, 0);
    if (gesamt <= platzAufErsterSeite) {
      gelegt = versuch;
      schriftgroesse = groesse;
      break;
    }
  }

  y = tabellenkopf(y);

  for (const eintrag of gelegt) {
    // Reicht der Platz auf diesem Blatt nicht mehr, faengt die Zeile oben auf
    // dem naechsten an - vollstaendig, nicht halbiert.
    if (y - eintrag.hoehe < PAGE_BOTTOM) {
      page = neueSeite();
      y = tabellenkopf(A4[1] - MARGIN);
    }
    page.drawRectangle({
      x: MARGIN, y: y - eintrag.hoehe, width: WIDTH, height: eintrag.hoehe,
      borderColor: LINE, borderWidth: 0.6
    });
    for (const spalte of spalten.slice(1)) {
      page.drawLine({
        start: { x: spalte.x, y }, end: { x: spalte.x, y: y - eintrag.hoehe },
        thickness: 0.6, color: LINE
      });
    }
    const abstand = Math.round(
      (new Date(`${eintrag.zeile.workDate}T12:00:00Z`) - new Date(`${report.weekStart}T12:00:00Z`))
      / 86_400_000
    );
    page.drawText(WEEKDAYS[abstand] || "", {
      x: MARGIN + 8, y: y - 18, size: 8.5, font: regular, color: INK
    });
    page.drawText(germanDate(eintrag.zeile.workDate), {
      x: spalten[1].x + 8, y: y - 18, size: 8.5, font: regular, color: INK
    });
    eintrag.texte.forEach((zeilentext, index) => {
      page.drawText(zeilentext.punkt ? `• ${zeilentext.text}` : `   ${zeilentext.text}`, {
        x: spalten[2].x + 8,
        y: y - 14 - index * eintrag.zeilenhoehe,
        size: schriftgroesse,
        font: regular,
        color: INK
      });
    });
    page.drawText(duration(eintrag.zeile.workedMinutes), {
      x: spalten[3].x + 8, y: y - 18, size: 8.5, font: regular, color: INK
    });
    y -= eintrag.hoehe;
  }

  // Bemerkungen und Unterschriften stehen immer am Fuss des letzten Blattes.
  if (y < bemerkungOben + TABLE_GAP) {
    page = neueSeite();
  }
  page.drawRectangle({
    x: MARGIN, y: REMARK_BOTTOM, width: WIDTH, height: bemerkungHoehe,
    borderColor: LINE, borderWidth: 0.8
  });
  page.drawText("Bemerkungen zur Woche:", {
    x: MARGIN + 12, y: bemerkungOben - 18, size: 9, font: regular, color: INK
  });
  bemerkungZeilen.forEach((text, index) => {
    page.drawText(text, {
      x: MARGIN + 12, y: bemerkungOben - 36 - index * 15, size: 9, font: regular, color: INK
    });
  });
  for (let index = bemerkungZeilen.filter(Boolean).length; index < 3; index += 1) {
    page.drawLine({
      start: { x: MARGIN + 12, y: bemerkungOben - 40 - index * 15 },
      end: { x: RIGHT - 12, y: bemerkungOben - 40 - index * 15 },
      thickness: 0.5, color: LINE
    });
  }

  const unterschrift = (x, beschriftung, name, datum) => {
    page.drawText(beschriftung, { x, y: SIGNATURE_TOP, size: 8.5, font: regular, color: MUTED });
    if (name) {
      page.drawText(name, { x, y: SIGNATURE_TOP - 26, size: 12, font: italic, color: INK });
    }
    page.drawLine({
      start: { x, y: SIGNATURE_TOP - 32 }, end: { x: x + 232, y: SIGNATURE_TOP - 32 },
      thickness: 0.8, color: LINE
    });
    page.drawText(datum ? `Datum: ${germanDate(datum)}` : "Datum:", {
      x, y: SIGNATURE_TOP - 46, size: 8.5, font: regular, color: INK
    });
  };
  unterschrift(
    MARGIN, "Azubi (Unterschrift)",
    report.apprenticeSignatureName, report.submittedAt?.slice(0, 10)
  );
  unterschrift(
    MARGIN + 280, "Ausbilder (Unterschrift)",
    report.trainerSignatureName, report.reviewedAt?.slice(0, 10)
  );
}

// Die Fusszeile kommt zuletzt: erst wenn alle Wochen gezeichnet sind, steht
// fest, wie viele Blaetter es geworden sind.
function stampFooters(seiten, regular) {
  seiten.forEach((blatt, index) => {
    blatt.drawText(
      "Dieses Berichtsheft wurde digital erstellt und ist ohne Unterschriften ungültig.",
      { x: MARGIN, y: FOOTER_Y, size: 7.5, font: regular, color: MUTED }
    );
    const seitenzahl = `Seite ${index + 1} von ${seiten.length}`;
    blatt.drawText(seitenzahl, {
      x: RIGHT - regular.widthOfTextAtSize(seitenzahl, 7.5),
      y: FOOTER_Y, size: 7.5, font: regular, color: MUTED
    });
  });
}

function weekLabel(weekStart) {
  const { week, year } = isoWeekNumber(weekStart);
  return `Woche ${week} / ${year}`;
}

async function renderReportBook({
  reports,
  apprentice,
  company,
  companyLogo = null,
  printedAt = new Date(),
  title
}) {
  const document = await PDFDocument.create();
  const fonts = {
    regular: await document.embedFont(StandardFonts.Helvetica),
    bold: await document.embedFont(StandardFonts.HelveticaBold),
    italic: await document.embedFont(StandardFonts.HelveticaOblique)
  };

  document.setTitle(title);
  document.setAuthor(company.legalName || company.displayName);
  document.setSubject(`Ausbildungsnachweis ${apprentice.name}`);
  document.setCreator("Schäfchen");
  document.setProducer("Schäfchen");
  document.setCreationDate(printedAt);
  document.setModificationDate(printedAt);

  // Das Logo wird einmal eingebettet und auf jedem Blatt derselben Datei
  // verwendet. Je Woche neu eingebettet wuerde ein Lehrjahr das Bild
  // vierzigmal mitschleppen.
  let logoImage = null;
  if (companyLogo) {
    try {
      logoImage = await document.embedPng(companyLogo);
    } catch {
      logoImage = null;
    }
  }

  const seiten = [];
  for (const report of reports) {
    drawWeek({ document, seiten, fonts, logoImage, report, apprentice, company });
  }
  stampFooters(seiten, fonts.regular);
  return Buffer.from(await document.save());
}

// Eine Woche, ein Blatt.
export function buildApprenticeReportPdf({ report, apprentice, ...rest }) {
  return renderReportBook({
    reports: [report],
    apprentice,
    ...rest,
    title: `Berichtsheft ${weekLabel(report.weekStart)}`
  });
}

// Mehrere Wochen am Stueck, etwa ein ganzes Lehrjahr: eine Datei, eine Seite
// je Woche. Woche fuer Woche einzeln zu laden und von Hand zu heften ist genau
// die Arbeit, die diese App abnehmen soll.
//
// Das Lehrjahr steht je Woche im Kopf und wird deshalb je Bericht gerechnet -
// ein Heft ueber zwei Lehrjahre traegt sonst auf allen Blaettern dasselbe.
export function buildApprenticeReportBookPdf({ reports, apprentice, ...rest }) {
  const sortiert = [...reports].sort((links, rechts) =>
    links.weekStart.localeCompare(rechts.weekStart));
  const spanne = sortiert.length > 1
    ? `${weekLabel(sortiert[0].weekStart)} bis ${weekLabel(sortiert.at(-1).weekStart)}`
    : weekLabel(sortiert[0].weekStart);
  return renderReportBook({
    reports: sortiert,
    apprentice,
    ...rest,
    title: `Berichtsheft ${spanne}`
  });
}
