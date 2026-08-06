// Reine Rechen- und Formatierhilfen der Zeiterfassung.
//
// Dieses Modul kennt weder Oberfläche noch Netz noch den Anwendungszustand. Es
// bekommt seine Eingaben übergeben und gibt Werte zurück. Dadurch lässt sich
// die Berechnung des Stundenzettels unabhängig von der App prüfen, während die
// App genau dieselbe Rechnung verwendet.

export function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function currentWeekStart(date = new Date()) {
  const weekday = date.getDay() || 7;
  const monday = new Date(date);
  monday.setHours(12, 0, 0, 0);
  monday.setDate(date.getDate() - weekday + 1);
  return localDateKey(monday);
}

export function addIsoDays(date, days) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function addIsoMonths(date, months) {
  const [year, month] = date.slice(0, 7).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + months, 1))
    .toISOString()
    .slice(0, 10);
}

// Auf einer Baustelle wird auch nachmittags und nachts gearbeitet. "Guten
// Morgen" stand bisher zu jeder Uhrzeit auf der Uebersicht; wer um 15 Uhr von
// der Baustelle kommt, liest daran zuerst, dass die App nicht mitdenkt.
//
// Die Grenzen sind bewusst grosszuegig: die Fruehschicht faengt um sechs an
// und liest dann "Guten Morgen", die Spaetschicht endet nach achtzehn Uhr und
// liest "Guten Abend".
export function greetingForHour(date = new Date()) {
  const stunde = date.getHours();
  if (stunde < 5) return "Gute Nacht";
  if (stunde < 11) return "Guten Morgen";
  if (stunde < 18) return "Guten Tag";
  return "Guten Abend";
}

export function durationMinutes(milliseconds) {
  return Math.max(0, Math.floor(milliseconds / 60000));
}

export function formatMinutes(minutes) {
  const safeMinutes = Math.max(0, Math.floor(minutes));
  return `${String(Math.floor(safeMinutes / 60)).padStart(2, "0")}:${String(safeMinutes % 60).padStart(2, "0")}`;
}

export function formatSignedMinutes(minutes) {
  const safeMinutes = Number.isFinite(Number(minutes)) ? Math.trunc(Number(minutes)) : 0;
  const sign = safeMinutes > 0 ? "+" : safeMinutes < 0 ? "−" : "±";
  const absolute = Math.abs(safeMinutes);
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${
    String(absolute % 60).padStart(2, "0")
  }`;
}

export function assignmentDurationLabel(minutes) {
  if (!Number.isFinite(Number(minutes)) || Number(minutes) <= 0) return "";
  const totalMinutes = Math.round(Number(minutes));
  const hours = Math.floor(totalMinutes / 60);
  const remainder = totalMinutes % 60;
  if (hours && remainder) return `${hours} Std. ${remainder} Min.`;
  if (hours) return `${hours} Std.`;
  return `${remainder} Min.`;
}

export function durationHoursToMinutes(value) {
  if (value === "" || value === null || value === undefined) return null;
  const hours = Number(value);
  return Number.isFinite(hours) ? Math.round(hours * 60) : null;
}

export function assignmentStartMinutes(value) {
  if (!value) return null;
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
}

// Berechnet Brutto-, Pausen-, Arbeits- und Fahrzeit eines Arbeitstags aus der
// Folge der Zeitereignisse.
//
// Die angesetzte Mindestpause beträgt ab 3,5 Stunden Bruttozeit 30 Minuten und
// ab 6 Stunden 60 Minuten. Eine tatsächlich längere Pause bleibt erhalten. Die
// Fahrzeit kann die Arbeitszeit nicht übersteigen. Die Werte sind aus der
// bisherigen Berechnung unverändert übernommen.
export function calculateTimes(events, now = new Date()) {
  const clockIn = events.find((entry) => entry.type === "clock_in");
  const latest = events.at(-1);
  const endTime = latest?.type === "clock_out" ? new Date(latest.recordedAt) : now;
  const gross = clockIn ? durationMinutes(endTime - new Date(clockIn.recordedAt)) : 0;
  let recordedWork = 0;
  let activeStart = null;

  events.forEach((entry) => {
    if (entry.type === "clock_in") {
      activeStart = new Date(entry.recordedAt);
    } else if (entry.type === "clock_out" && activeStart) {
      recordedWork += durationMinutes(new Date(entry.recordedAt) - activeStart);
      activeStart = null;
    }
  });
  if (activeStart) recordedWork += durationMinutes(now - activeStart);

  const explicitPause = Math.max(gross - recordedWork, 0);
  const requiredPause = gross >= 360 ? 60 : gross >= 210 ? 30 : 0;
  const pause = Math.max(explicitPause, requiredPause);
  const work = Math.max(gross - pause, 0);
  let travel = 0;

  events.forEach((entry, index) => {
    if (!["clock_in", "site_departure"].includes(entry.type)) return;
    const destination = events
      .slice(index + 1)
      .find((candidate) => ["site_arrival", "clock_out"].includes(candidate.type));
    const segmentEnd = destination ? new Date(destination.recordedAt) : endTime;
    travel += durationMinutes(segmentEnd - new Date(entry.recordedAt));
  });

  return { gross, pause, work, travel: Math.min(travel, work) };
}
