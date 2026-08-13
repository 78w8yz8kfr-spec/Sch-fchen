// Baustromverteiler.
//
// WAS HIER STEHT UND WAS NICHT
//
// Ein Baustromverteiler ist ein Geraet. Stammdaten, Standort, Baustelle,
// Maengel, QR-Code und die vierteljaehrliche Pruefung fuehrt deshalb die
// Geraeteverwaltung, und dieses Modul fasst sie nicht an. Es kommt nur dazu,
// was ein Verteiler zusaetzlich braucht und ein Akkuschrauber nicht:
//
//   - eine Ampel ueber zwei verschiedene Fristen zugleich
//   - den monatlichen Druck auf die Prueftaste des RCD
//   - Zaehlerstaende fuer die Weiterberechnung
//
// ZWEI FRISTEN, DIE NICHT DASSELBE SIND
//
// Nach DGUV V3 in Verbindung mit DIN VDE 0100-704 wird ein Verteiler auf der
// Baustelle vierteljaehrlich von einer Elektrofachkraft geprueft. Davon
// getrennt drueckt der Monteur monatlich die Prueftaste des
// Fehlerstromschutzschalters.
//
// Das eine ersetzt das andere nicht, und deshalb duerfen sie sich auch nicht
// denselben Termin teilen. Wuerde der Tastendruck als Pruefung gebucht,
// verschoebe der Monteur damit den Termin, an dem die Fachkraft anruecken
// muss - und die Frist liefe still aus.

import { loadCompanyModules } from "./company-modules.mjs";
import { InputError, readJson } from "./validation.mjs";

/** Der Bereich haengt an der Freigabe der Geraeteverwaltung, nicht an einer eigenen. */
const MODULE_KEY = "devices";

/** Die Kategorie, an der ein Verteiler zu erkennen ist. */
export const KATEGORIE = "power_distributors";

/** Vierteljaehrlich auf der Baustelle. */
export const PRUEFFRIST_TAGE = 90;

/** Monatlich der Druck auf die Prueftaste. */
export const FI_FRIST_TAGE = 30;

/** Ab wann eine Frist als "bald" gilt - eine Woche Vorlauf reicht zum Planen. */
const VORLAUF_TAGE = 14;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATUM = /^\d{4}-\d{2}-\d{2}$/;

function kennung(wert, feld) {
  const text = String(wert || "").trim();
  if (!UUID.test(text)) throw new InputError(`${feld} ist ungültig.`);
  return text;
}

function datum(wert, feld, vorgabe) {
  if (wert === undefined || wert === null || wert === "") return vorgabe;
  const text = String(wert).trim();
  if (!DATUM.test(text) || Number.isNaN(Date.parse(text))) {
    throw new InputError(`${feld} ist ungültig.`);
  }
  return text;
}

function notiz(wert, feld, laenge = 2000) {
  if (wert === undefined || wert === null) return null;
  const text = String(wert).trim();
  if (!text) return null;
  if (text.length > laenge) throw new InputError(`${feld} ist zu lang.`);
  return text;
}

/** Tage zwischen zwei Datumsangaben, ohne Zeitzonenkunststuecke. */
export function tageBis(von, bis) {
  if (!von || !bis) return null;
  return Math.round((Date.parse(bis) - Date.parse(von)) / 86_400_000);
}

/**
 * Die Ampel einer Frist.
 *
 * Vier Zustaende statt drei: "nie" ist etwas anderes als "ueberfaellig". Ein
 * Verteiler, der noch nie geprueft wurde, ist kein vergessener Termin, sondern
 * ein fehlender Anfang - und die Ansicht soll das unterscheiden koennen, weil
 * die Abhilfe eine andere ist.
 */
export function ampel(faelligAm, heute) {
  if (!faelligAm) return { lage: "nie", tage: null };
  const tage = tageBis(heute, faelligAm);
  if (tage < 0) return { lage: "ueberfaellig", tage };
  if (tage <= VORLAUF_TAGE) return { lage: "bald", tage };
  return { lage: "gut", tage };
}

/** Aus einem Datum plus Frist wird der naechste Termin. */
export function naechsterTermin(letzter, fristTage) {
  if (!letzter) return null;
  const zeit = Date.parse(letzter) + fristTage * 86_400_000;
  return new Date(zeit).toISOString().slice(0, 10);
}

async function requireModule(client, context) {
  const modules = await loadCompanyModules(client, context);
  if (!modules.find((module) => module.key === MODULE_KEY)?.enabled) {
    throw new InputError(
      "Maschinen & Geräte ist für diese Firma nicht freigeschaltet.",
      403,
      "devices_module_disabled"
    );
  }
}

/**
 * Der Verteiler muss dieser Firma gehoeren und in der Kategorie stehen.
 *
 * Beides zusammen: die Mandantengrenze faengt die Datenbank ohnehin ab, aber
 * ein Akkuschrauber mit einem Zaehlerstand waere kein Sicherheits-, sondern
 * ein Sinnfehler - und der faellt spaeter niemandem mehr auf.
 */
async function verteilerHolen(client, context, deviceId) {
  const gefunden = await client.query(
    `SELECT geraet.id, geraet.name, geraet.inventory_number,
            geraet.assigned_construction_site_id
     FROM devices AS geraet
     JOIN device_categories AS art
       ON art.company_id = geraet.company_id AND art.id = geraet.category_id
     WHERE geraet.company_id = $1 AND geraet.id = $2 AND art.category_key = $3`,
    [context.companyId, deviceId, KATEGORIE]
  );
  if (gefunden.rowCount !== 1) {
    throw new InputError("Dieser Baustromverteiler wurde nicht gefunden.", 404, "power_distributor_unknown");
  }
  return gefunden.rows[0];
}

const LISTE_SELECT = `
  SELECT geraet.id, geraet.inventory_number, geraet.name, geraet.status,
         geraet.condition_key, geraet.next_inspection_on, geraet.last_inspection_on,
         baustelle.id AS site_id, baustelle.name AS site_name,
         ort.name AS location_name,
         fi.tested_on AS rcd_tested_on, fi.result AS rcd_result,
         zaehler.read_on AS meter_read_on, zaehler.reading_kwh AS meter_reading,
         zaehler.reason AS meter_reason
  FROM devices AS geraet
  JOIN device_categories AS art
    ON art.company_id = geraet.company_id AND art.id = geraet.category_id
  LEFT JOIN construction_sites AS baustelle
    ON baustelle.company_id = geraet.company_id
   AND baustelle.id = geraet.assigned_construction_site_id
  LEFT JOIN device_locations AS ort
    ON ort.company_id = geraet.company_id AND ort.id = geraet.current_location_id
  LEFT JOIN LATERAL (
    SELECT tested_on, result FROM power_rcd_tests
    WHERE company_id = geraet.company_id AND device_id = geraet.id
    ORDER BY tested_on DESC, created_at DESC LIMIT 1
  ) AS fi ON TRUE
  LEFT JOIN LATERAL (
    SELECT read_on, reading_kwh, reason FROM power_meter_readings
    WHERE company_id = geraet.company_id AND device_id = geraet.id
    ORDER BY read_on DESC, created_at DESC LIMIT 1
  ) AS zaehler ON TRUE
  WHERE geraet.company_id = $1 AND art.category_key = '${KATEGORIE}'
    AND geraet.retired_at IS NULL
`;

function verteilerDto(row, heute) {
  const fiFaellig = naechsterTermin(row.rcd_tested_on
    ? new Date(row.rcd_tested_on).toISOString().slice(0, 10)
    : null, FI_FRIST_TAGE);

  return {
    id: row.id,
    inventoryNumber: row.inventory_number,
    name: row.name,
    status: row.status,
    condition: row.condition_key,
    locationName: row.location_name || null,
    constructionSiteId: row.site_id || null,
    constructionSiteName: row.site_name || null,
    // Die Pruefung nach DGUV V3 - die Frist fuehrt die Geraeteverwaltung.
    inspection: {
      lastOn: row.last_inspection_on ? new Date(row.last_inspection_on).toISOString().slice(0, 10) : null,
      dueOn: row.next_inspection_on ? new Date(row.next_inspection_on).toISOString().slice(0, 10) : null,
      ...ampel(row.next_inspection_on ? new Date(row.next_inspection_on).toISOString().slice(0, 10) : null, heute)
    },
    // Der monatliche Tastendruck - eigene Frist, eigener Termin.
    rcdTest: {
      lastOn: row.rcd_tested_on ? new Date(row.rcd_tested_on).toISOString().slice(0, 10) : null,
      lastResult: row.rcd_result || null,
      dueOn: fiFaellig,
      ...ampel(fiFaellig, heute)
    },
    meter: row.meter_read_on
      ? {
        readOn: new Date(row.meter_read_on).toISOString().slice(0, 10),
        readingKwh: Number(row.meter_reading),
        reason: row.meter_reason
      }
      : null
  };
}

/**
 * Die Liste, sortiert nach Dringlichkeit.
 *
 * Was ueberfaellig ist, steht oben - und zwar egal, welche der beiden Fristen
 * abgelaufen ist. Wer die Seite oeffnet, sucht nicht nach einem Namen, sondern
 * nach dem, was heute liegenbleibt.
 */
async function liste(client, context, heute) {
  const gefunden = await client.query(`${LISTE_SELECT} ORDER BY geraet.inventory_number`, [context.companyId]);
  const verteiler = gefunden.rows.map((row) => verteilerDto(row, heute));

  const rang = { ueberfaellig: 0, nie: 1, bald: 2, gut: 3 };
  verteiler.sort((eins, zwei) => {
    const a = Math.min(rang[eins.inspection.lage], rang[eins.rcdTest.lage]);
    const b = Math.min(rang[zwei.inspection.lage], rang[zwei.rcdTest.lage]);
    if (a !== b) return a - b;
    return eins.inventoryNumber.localeCompare(zwei.inventoryNumber, "de");
  });
  return verteiler;
}

async function detail(client, context, deviceId, heute) {
  await verteilerHolen(client, context, deviceId);
  const gefunden = await client.query(
    `${LISTE_SELECT} AND geraet.id = $2`,
    [context.companyId, deviceId]
  );
  if (!gefunden.rowCount) {
    throw new InputError("Dieser Baustromverteiler wurde nicht gefunden.", 404, "power_distributor_unknown");
  }

  const [tests, ablesungen] = await Promise.all([
    client.query(
      `SELECT test.tested_on, test.result, test.note,
              nutzer.first_name, nutzer.last_name,
              baustelle.name AS site_name
       FROM power_rcd_tests AS test
       JOIN users AS nutzer ON nutzer.company_id = test.company_id AND nutzer.id = test.tested_by_user_id
       LEFT JOIN construction_sites AS baustelle
         ON baustelle.company_id = test.company_id AND baustelle.id = test.construction_site_id
       WHERE test.company_id = $1 AND test.device_id = $2
       ORDER BY test.tested_on DESC, test.created_at DESC
       LIMIT 24`,
      [context.companyId, deviceId]
    ),
    client.query(
      `SELECT ablesung.read_on, ablesung.reading_kwh, ablesung.reason, ablesung.note,
              nutzer.first_name, nutzer.last_name,
              baustelle.name AS site_name
       FROM power_meter_readings AS ablesung
       JOIN users AS nutzer ON nutzer.company_id = ablesung.company_id AND nutzer.id = ablesung.read_by_user_id
       LEFT JOIN construction_sites AS baustelle
         ON baustelle.company_id = ablesung.company_id AND baustelle.id = ablesung.construction_site_id
       WHERE ablesung.company_id = $1 AND ablesung.device_id = $2
       ORDER BY ablesung.read_on DESC, ablesung.created_at DESC
       LIMIT 50`,
      [context.companyId, deviceId]
    )
  ]);

  const name = (row) => `${row.first_name} ${row.last_name}`.trim();
  return {
    distributor: verteilerDto(gefunden.rows[0], heute),
    rcdTests: tests.rows.map((row) => ({
      testedOn: new Date(row.tested_on).toISOString().slice(0, 10),
      result: row.result,
      testedBy: name(row),
      constructionSiteName: row.site_name || null,
      note: row.note
    })),
    readings: ablesungen.rows.map((row) => ({
      readOn: new Date(row.read_on).toISOString().slice(0, 10),
      readingKwh: Number(row.reading_kwh),
      reason: row.reason,
      readBy: name(row),
      constructionSiteName: row.site_name || null,
      note: row.note
    }))
  };
}

/**
 * Die Baustelle, die an einer Aufzeichnung stehenbleibt.
 *
 * Ohne ausdrueckliche Angabe die, auf der der Verteiler gerade steht. Der
 * Umweg ueber das Geraet ist der Punkt der ganzen Spalte: ein Verteiler
 * wandert im Lauf eines Jahres ueber fuenf Baustellen, und die Ablesung von
 * Baustelle drei muss bei Baustelle drei bleiben, auch wenn er inzwischen
 * woanders steht. Beim ersten Durchgang blieb die Spalte leer, und die
 * Ablesung stand ohne Baustelle in der Akte - fuer die Weiterberechnung
 * genau die Angabe, auf die es ankommt.
 */
function baustelleFuer(body, verteiler) {
  if (body?.constructionSiteId) return kennung(body.constructionSiteId, "Baustelle");
  return verteiler.assigned_construction_site_id || null;
}

/**
 * Der monatliche Druck auf die Prueftaste.
 *
 * Vorbelegt wird nichts ausser dem Datum: das Ergebnis muss jemand angeben,
 * denn ein durchgefallener RCD ist der eigentliche Grund, warum es diesen
 * Vorgang gibt. Eine Vorbelegung auf "bestanden" waere ein Klick, der immer
 * dasselbe sagt.
 */
async function fiTestErfassen(client, context, deviceId, body, heute) {
  const verteiler = await verteilerHolen(client, context, deviceId);

  const ergebnis = String(body?.result || "").trim();
  if (!["passed", "failed"].includes(ergebnis)) {
    throw new InputError("Das Ergebnis muss „bestanden“ oder „nicht bestanden“ sein.");
  }

  const eingetragen = await client.query(
    `INSERT INTO power_rcd_tests (
       company_id, device_id, construction_site_id, tested_on, tested_by_user_id, result, note
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING tested_on`,
    [
      context.companyId, deviceId,
      baustelleFuer(body, verteiler),
      datum(body?.testedOn, "Prüfdatum", heute),
      context.userId, ergebnis, notiz(body?.note, "Notiz")
    ]
  );

  const geprueftAm = new Date(eingetragen.rows[0].tested_on).toISOString().slice(0, 10);
  return { testedOn: geprueftAm, result: ergebnis, dueOn: naechsterTermin(geprueftAm, FI_FRIST_TAGE) };
}

/**
 * Eine Ablesung.
 *
 * Ein Zaehler laeuft vorwaerts. Ein Stand unter dem vorigen ist entweder ein
 * Tippfehler oder ein Zaehlerwechsel - in beiden Faellen soll jemand
 * hinsehen, statt dass die Rechnung stillschweigend eine negative Menge
 * ausweist. Die Pruefung steht hier und nicht in der Datenbank, weil sie den
 * Vorgaenger kennen muss.
 */
async function ablesungErfassen(client, context, deviceId, body, heute) {
  const verteiler = await verteilerHolen(client, context, deviceId);

  const anlass = String(body?.reason || "interim").trim();
  if (!["installation", "interim", "removal"].includes(anlass)) {
    throw new InputError("Der Anlass der Ablesung ist ungültig.");
  }

  const stand = Number(body?.readingKwh);
  if (!Number.isFinite(stand) || stand < 0 || stand > 99_999_999) {
    throw new InputError("Der Zählerstand ist ungültig.");
  }

  const vorher = await client.query(
    `SELECT reading_kwh, read_on FROM power_meter_readings
     WHERE company_id = $1 AND device_id = $2
     ORDER BY read_on DESC, created_at DESC LIMIT 1`,
    [context.companyId, deviceId]
  );
  if (vorher.rowCount && stand < Number(vorher.rows[0].reading_kwh)) {
    const letzter = Number(vorher.rows[0].reading_kwh);
    throw new InputError(
      `Der Zählerstand ist kleiner als der letzte (${letzter}). Bitte prüfen — bei einem Zählerwechsel bitte als Notiz vermerken.`,
      409,
      "power_meter_reading_backwards"
    );
  }

  const eingetragen = await client.query(
    `INSERT INTO power_meter_readings (
       company_id, device_id, construction_site_id, read_on, reading_kwh, reason, read_by_user_id, note
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING read_on, reading_kwh`,
    [
      context.companyId, deviceId,
      baustelleFuer(body, verteiler),
      datum(body?.readOn, "Ablesedatum", heute),
      stand, anlass, context.userId, notiz(body?.note, "Notiz")
    ]
  );

  const vorigerStand = vorher.rowCount ? Number(vorher.rows[0].reading_kwh) : null;
  return {
    readOn: new Date(eingetragen.rows[0].read_on).toISOString().slice(0, 10),
    readingKwh: Number(eingetragen.rows[0].reading_kwh),
    reason: anlass,
    // Der Verbrauch seit der letzten Ablesung steht gleich dabei: danach wird
    // gefragt, und er laesst sich sonst nur von Hand ausrechnen.
    consumedKwh: vorigerStand === null ? null : Number((stand - vorigerStand).toFixed(1))
  };
}

export async function handlePowerRequest({ request, url, client, context, today }) {
  const path = url.pathname;
  if (!path.startsWith("/api/v1/power")) return null;

  const heute = today || new Date().toISOString().slice(0, 10);
  await requireModule(client, context);

  if (request.method === "GET" && path === "/api/v1/power/distributors") {
    return { status: 200, body: { distributors: await liste(client, context, heute) } };
  }

  const einzeln = /^\/api\/v1\/power\/distributors\/([^/]+)$/.exec(path);
  if (request.method === "GET" && einzeln) {
    return { status: 200, body: await detail(client, context, kennung(einzeln[1], "Baustromverteiler"), heute) };
  }

  const fiTest = /^\/api\/v1\/power\/distributors\/([^/]+)\/rcd-test$/.exec(path);
  if (request.method === "POST" && fiTest) {
    const body = await readJson(request);
    return {
      status: 201,
      body: await fiTestErfassen(client, context, kennung(fiTest[1], "Baustromverteiler"), body, heute)
    };
  }

  const ablesung = /^\/api\/v1\/power\/distributors\/([^/]+)\/readings$/.exec(path);
  if (request.method === "POST" && ablesung) {
    const body = await readJson(request);
    return {
      status: 201,
      body: await ablesungErfassen(client, context, kennung(ablesung[1], "Baustromverteiler"), body, heute)
    };
  }

  return null;
}
