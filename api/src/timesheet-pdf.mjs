import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const A4 = [595.28, 841.89];
const RED = rgb(0.89, 0.02, 0.08);
const INK = rgb(0.08, 0.08, 0.08);
const MUTED = rgb(0.38, 0.38, 0.38);
const LINE = rgb(0.86, 0.86, 0.86);
const SOFT = rgb(0.97, 0.97, 0.97);
const WHITE = rgb(1, 1, 1);

const STATUS_LABELS = {
  approved: "Freigegeben",
  locked: "Abgerechnet",
  completed: "Abgeschlossen",
  billed: "Abgerechnet"
};

function germanDate(value) {
  const [year, month, day] = String(value || "").slice(0, 10).split("-");
  return year && month && day ? `${day}.${month}.${year}` : "-";
}

function localTime(value, timeZone) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone
  }).format(new Date(value));
}

function duration(minutes) {
  const value = Math.max(0, Number(minutes) || 0);
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

function sumDays(days) {
  const fields = [
    "targetWorkMinutes",
    "grossMinutes",
    "breakMinutes",
    "workMinutes",
    "travelMinutes",
    "overtimeMinutes"
  ];
  return Object.fromEntries(fields.map((field) => [
    field,
    days.reduce((sum, day) => sum + Math.max(0, Number(day[field] || 0)), 0)
  ]));
}

function groupEmployees(workDays) {
  const groups = new Map();
  [...workDays]
    .sort((left, right) => (
      left.employeeName.localeCompare(right.employeeName, "de-DE")
      || left.workDate.localeCompare(right.workDate)
    ))
    .forEach((day) => {
      const key = `${day.personnelNumber}\u0000${day.employeeName}`;
      if (!groups.has(key)) {
        groups.set(key, {
          employeeName: day.employeeName,
          personnelNumber: day.personnelNumber,
          days: []
        });
      }
      groups.get(key).days.push(day);
    });
  return [...groups.values()];
}

function wrapText(text, font, size, width, maxLines = Number.POSITIVE_INFINITY) {
  const words = String(text || "-").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return ["-"];
  const lines = [];
  let line = words.shift();
  let truncated = false;
  for (const word of words) {
    const next = `${line} ${word}`;
    if (font.widthOfTextAtSize(next, size) <= width) {
      line = next;
    } else {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) {
        truncated = true;
        break;
      }
    }
  }
  if (!truncated && lines.length < maxLines) lines.push(line);
  if (truncated) {
    let last = lines.at(-1);
    while (last.length > 1 && font.widthOfTextAtSize(`${last} …`, size) > width) {
      last = last.slice(0, -1);
    }
    lines[lines.length - 1] = `${last.trimEnd()} …`;
  }
  return lines;
}

export async function buildTimesheetPdf({
  companyName,
  from,
  to,
  workDays,
  timeZone = "Europe/Berlin"
}) {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const employees = groupEmployees(workDays);
  const pages = [];
  const margin = 38;
  const contentWidth = A4[0] - margin * 2;
  const tableColumns = [
    { label: "Datum", key: "date", width: 51 },
    { label: "Status", key: "status", width: 59 },
    { label: "Von", key: "from", width: 34 },
    { label: "Bis", key: "to", width: 34 },
    { label: "Soll", key: "target", width: 38 },
    { label: "Pause", key: "break", width: 39 },
    { label: "Arbeit", key: "work", width: 42 },
    { label: "Fahrt", key: "travel", width: 38 },
    { label: "Mehr", key: "overtime", width: 40 },
    { label: "Baustelle", key: "sites", width: 144 }
  ];

  document.setTitle("Stundenzettel");
  document.setAuthor(companyName || "Schäfchen");
  document.setSubject("Freigegebene Arbeitszeiten");
  document.setCreator("Schäfchen");
  document.setProducer("Schäfchen");

  function drawFooter(page, employeeName) {
    page.drawLine({
      start: { x: margin, y: 33 },
      end: { x: A4[0] - margin, y: 33 },
      thickness: 0.6,
      color: LINE
    });
    page.drawText(
      `${employeeName} · Erstellt aus freigegebenen Schäfchen-Zeitdaten`,
      { x: margin, y: 19, size: 7, font: regular, color: MUTED }
    );
  }

  function addEmployeePage(employee, continuation = false) {
    const page = document.addPage(A4);
    pages.push({ page, employeeName: employee.employeeName });
    drawFooter(page, employee.employeeName);

    page.drawText(companyName || "Schäfchen", {
      x: margin,
      y: A4[1] - 48,
      size: 13,
      font: bold,
      color: INK
    });
    page.drawText(continuation ? "STUNDENZETTEL · FORTSETZUNG" : "STUNDENZETTEL", {
      x: 306,
      y: A4[1] - 48,
      size: continuation ? 12 : 17,
      font: bold,
      color: INK
    });
    if (!continuation) {
      page.drawText("FREIGEGEBEN", {
        x: 474,
        y: A4[1] - 67,
        size: 7.5,
        font: bold,
        color: RED
      });
    }
    page.drawLine({
      start: { x: margin, y: A4[1] - 78 },
      end: { x: A4[0] - margin, y: A4[1] - 78 },
      thickness: 1,
      color: RED
    });
    page.drawText(employee.employeeName, {
      x: margin,
      y: A4[1] - 103,
      size: 14,
      font: bold,
      color: INK
    });
    page.drawText(
      `Personalnummer ${employee.personnelNumber} · ${germanDate(from)} bis ${germanDate(to)}`,
      { x: margin, y: A4[1] - 120, size: 8.5, font: regular, color: MUTED }
    );
    return { page, y: A4[1] - 142 };
  }

  function drawSummary(page, y, totals) {
    const values = [
      ["Soll", totals.targetWorkMinutes],
      ["Arbeit", totals.workMinutes],
      ["Pause", totals.breakMinutes],
      ["Fahrt", totals.travelMinutes],
      ["Mehrzeit", totals.overtimeMinutes]
    ];
    const gap = 7;
    const width = (contentWidth - gap * (values.length - 1)) / values.length;
    values.forEach(([label, minutes], index) => {
      const x = margin + index * (width + gap);
      page.drawRectangle({ x, y: y - 43, width, height: 43, color: SOFT });
      page.drawText(label, { x: x + 9, y: y - 15, size: 7.5, font: regular, color: MUTED });
      page.drawText(`${duration(minutes)} h`, { x: x + 9, y: y - 32, size: 11, font: bold, color: INK });
    });
    return y - 58;
  }

  function drawTableHeader(page, y) {
    page.drawRectangle({ x: margin, y: y - 23, width: contentWidth, height: 23, color: INK });
    let x = margin;
    tableColumns.forEach((column) => {
      page.drawText(column.label, {
        x: x + 4,
        y: y - 15,
        size: 7,
        font: bold,
        color: WHITE
      });
      x += column.width;
    });
    return y - 23;
  }

  function drawTableRow(page, y, day) {
    const sites = day.siteNames?.join(", ") || "-";
    const siteLines = wrapText(sites, regular, 7, tableColumns.at(-1).width - 8, 2);
    const height = Math.max(24, siteLines.length * 9 + 8);
    const values = {
      date: germanDate(day.workDate),
      status: STATUS_LABELS[day.approvalStatus]
        || STATUS_LABELS[day.workflowStatus]
        || day.workflowStatus,
      from: localTime(day.firstClockInAt, timeZone),
      to: localTime(day.lastClockOutAt, timeZone),
      target: duration(day.targetWorkMinutes),
      break: duration(day.breakMinutes),
      work: duration(day.workMinutes),
      travel: duration(day.travelMinutes),
      overtime: duration(day.overtimeMinutes)
    };
    page.drawLine({
      start: { x: margin, y: y - height },
      end: { x: A4[0] - margin, y: y - height },
      thickness: 0.5,
      color: LINE
    });
    let x = margin;
    tableColumns.forEach((column) => {
      const lines = column.key === "sites" ? siteLines : [String(values[column.key] || "-")];
      lines.forEach((line, index) => {
        page.drawText(line, {
          x: x + 4,
          y: y - 15 - index * 9,
          size: 7,
          font: column.key === "work" ? bold : regular,
          color: INK
        });
      });
      x += column.width;
    });
    return y - height;
  }

  function drawSignatures(page, y) {
    const lineWidth = 212;
    const lineY = y - 30;
    page.drawLine({ start: { x: margin, y: lineY }, end: { x: margin + lineWidth, y: lineY }, thickness: 0.7, color: MUTED });
    page.drawLine({
      start: { x: A4[0] - margin - lineWidth, y: lineY },
      end: { x: A4[0] - margin, y: lineY },
      thickness: 0.7,
      color: MUTED
    });
    page.drawText("Datum, Unterschrift Mitarbeiter", {
      x: margin,
      y: lineY - 12,
      size: 7,
      font: regular,
      color: MUTED
    });
    page.drawText("Datum, Prüfung / Büro", {
      x: A4[0] - margin - lineWidth,
      y: lineY - 12,
      size: 7,
      font: regular,
      color: MUTED
    });
  }

  if (employees.length === 0) {
    const employee = { employeeName: "Keine Stundenzettel", personnelNumber: "-", days: [] };
    const { page, y } = addEmployeePage(employee);
    page.drawText("Im gewählten Zeitraum sind keine passenden Arbeitstage vorhanden.", {
      x: margin,
      y,
      size: 10,
      font: regular,
      color: MUTED
    });
  }

  for (const employee of employees) {
    const totals = sumDays(employee.days);
    let { page, y } = addEmployeePage(employee);
    y = drawSummary(page, y, totals);
    y = drawTableHeader(page, y);

    for (const day of employee.days) {
      const siteLength = (day.siteNames || []).join(", ").length;
      const neededHeight = Math.max(24, Math.min(2, Math.ceil(siteLength / 25) || 1) * 9 + 8);
      if (y - neededHeight < 88) {
        ({ page, y } = addEmployeePage(employee, true));
        y = drawTableHeader(page, y);
      }
      y = drawTableRow(page, y, day);
    }

    if (y < 145) {
      ({ page, y } = addEmployeePage(employee, true));
    }
    page.drawRectangle({ x: margin, y: y - 34, width: contentWidth, height: 34, color: SOFT });
    page.drawText("GESAMT", { x: margin + 8, y: y - 21, size: 8, font: bold, color: INK });
    [
      ["Arbeit", totals.workMinutes, 205],
      ["Pause", totals.breakMinutes, 330],
      ["Fahrt", totals.travelMinutes, 445]
    ].forEach(([label, minutes, x]) => {
      page.drawText(label, { x, y: y - 17, size: 7, font: regular, color: MUTED });
      page.drawText(`${duration(minutes)} h`, {
        x,
        y: y - 28,
        size: 9,
        font: bold,
        color: INK
      });
    });
    drawSignatures(page, y - 46);
  }

  const pageCount = pages.length;
  pages.forEach(({ page }, index) => {
    const label = `Seite ${index + 1} von ${pageCount}`;
    page.drawText(label, {
      x: A4[0] - margin - regular.widthOfTextAtSize(label, 7),
      y: 19,
      size: 7,
      font: regular,
      color: MUTED
    });
  });

  return Buffer.from(await document.save());
}
