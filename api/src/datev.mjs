// DATEV-Lohnschnittstelle, Stufe 1.
//
// WAS HIER STEHT UND WAS NICHT
//
// Dieses Modul verwaltet die Grundlage einer spaeteren Lohnexportdatei: die
// DATEV-Stammdaten einer Firma (Berater-/Mandantennummer, Lohnprodukt) und
// die Zuordnung von Zeit- und Abwesenheitsarten zu kanzleispezifischen
// Lohnarten (Migration 151). Dazu eine Vorschau, die fuer einen Zeitraum
// zeigt, was uebermittelt wuerde - je Mitarbeiter, Tag, Lohnart und
// Stundenzahl -, ohne eine Datei zu erzeugen. Das eigentliche Erzeugen der
// LODAS- oder Lohn-und-Gehalt-Datei ist eine spaetere Stufe.
//
// Die Vorschau rechnet nichts neu: Arbeits-, Fahr- und Ueberstundenminuten
// kommen unveraendert aus work_days (Migration 011), demselben Bestand, den
// auch der Stundenzettel-Export (timesheet-export.mjs) verwendet. Zwei
// Stundenrechnungen, die auseinanderlaufen koennten, waeren schlimmer als
// keine Schnittstelle.
//
// Wie bei devices.mjs und power.mjs bleibt die Rollenpruefung in diesem
// Modul lokal und dupliziert die Rollenliste aus app.mjs, statt sie zu
// importieren - derselbe Schnitt wie bei den beiden genannten Modulen.

import { InputError, readJson, validateDatevExportSettings, validateDatevWageTypeMapping, validateWorkDate } from "./validation.mjs";

// Dieselbe Rolle, die auch sonst firmenweite Einstellungen pflegt (siehe
// FULL_PLANNER_ROLES in app.mjs, z. B. für Stundenkonten und die
// Mitarbeiter-Stammdaten). DATEV-Stammdaten und Lohnart-Zuordnung sind
// Lohnabrechnungsgrundlage - dafuer reicht keine engere, projektbezogene
// Rolle.
const FULL_PLANNER_ROLES = new Set([
  "admin", "managing_director", "dispatch_office", "office", "planner", "executive_assistant"
]);

// Vorschau und Export sind ein und dieselbe sensible Handlung in zwei
// Schaerfegraden; beide brauchen dieselbe Rolle. Eine reine Lesefreigabe für
// andere Rollen gibt es hier bewusst nicht.
async function requireDatevAdministrator(client, context) {
  const result = await client.query(
    `SELECT role.role_key
     FROM user_roles AS assignment
     JOIN roles AS role
       ON role.company_id = assignment.company_id AND role.id = assignment.role_id
     WHERE assignment.company_id = $1
       AND assignment.user_id = $2
       AND assignment.revoked_at IS NULL
       AND role.status = 'active'`,
    [context.companyId, context.userId]
  );
  const roles = new Set(result.rows.map((row) => row.role_key));
  if (![...roles].some((role) => FULL_PLANNER_ROLES.has(role))) {
    throw new InputError(
      "Die DATEV-Lohnschnittstelle ist nur für Administration, Geschäftsführung oder Büro/Disposition freigeschaltet.",
      403,
      "datev_administration_forbidden"
    );
  }
}

function databaseDate(value) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function settingsDto(row) {
  if (!row) return null;
  return {
    consultantNumber: row.consultant_number,
    clientNumber: row.client_number,
    payrollProduct: row.payroll_product,
    updatedAt: new Date(row.updated_at).toISOString(),
    rowVersion: Number(row.row_version)
  };
}

function mappingDto(row) {
  return {
    id: row.id,
    category: row.category,
    mappingKey: row.mapping_key,
    wageTypeNumber: row.wage_type_number,
    absenceCode: row.absence_code,
    validFrom: new Date(row.valid_from).toISOString(),
    validUntil: row.valid_until ? new Date(row.valid_until).toISOString() : null,
    changedByName: row.changed_by_name,
    changeReason: row.change_reason,
    rowVersion: Number(row.row_version)
  };
}

async function loadSettings(client, context) {
  const result = await client.query(
    "SELECT * FROM datev_export_settings WHERE company_id = $1",
    [context.companyId]
  );
  return result.rows[0] || null;
}

// Anlegen und Aktualisieren derselben einzelnen Stammdatenzeile - Muster wie
// bei updateTimeAccountProfile in app.mjs: rowVersion 0 heisst "legt neu an",
// jede andere Zahl muss zur bestehenden Zeile passen.
async function saveSettings(client, context, input) {
  const current = await client.query(
    "SELECT row_version FROM datev_export_settings WHERE company_id = $1 FOR UPDATE",
    [context.companyId]
  );

  if (current.rowCount === 0) {
    if (input.rowVersion !== 0) {
      throw new InputError(
        "Die DATEV-Stammdaten wurden zwischenzeitlich angelegt. Bitte neu laden.",
        409,
        "row_version_conflict"
      );
    }
    const inserted = await client.query(
      `INSERT INTO datev_export_settings (
         company_id, consultant_number, client_number, payroll_product, updated_by_user_id
       ) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (company_id) DO NOTHING
       RETURNING *`,
      [context.companyId, input.consultantNumber, input.clientNumber, input.payrollProduct, context.userId]
    );
    if (inserted.rowCount !== 1) {
      throw new InputError(
        "Die DATEV-Stammdaten wurden gleichzeitig angelegt. Bitte neu laden.",
        409,
        "row_version_conflict"
      );
    }
    return settingsDto(inserted.rows[0]);
  }

  if (Number(current.rows[0].row_version) !== input.rowVersion) {
    throw new InputError(
      "Die DATEV-Stammdaten wurden zwischenzeitlich geändert. Bitte neu laden.",
      409,
      "row_version_conflict"
    );
  }
  const updated = await client.query(
    `UPDATE datev_export_settings
     SET consultant_number = $2, client_number = $3, payroll_product = $4, updated_by_user_id = $5
     WHERE company_id = $1
     RETURNING *`,
    [context.companyId, input.consultantNumber, input.clientNumber, input.payrollProduct, context.userId]
  );
  return settingsDto(updated.rows[0]);
}

async function listMappings(client, context, includeHistory) {
  const result = await client.query(
    `SELECT mapping.*, changer.first_name || ' ' || changer.last_name AS changed_by_name
     FROM datev_wage_type_mappings AS mapping
     JOIN users AS changer
       ON changer.company_id = mapping.company_id AND changer.id = mapping.changed_by_user_id
     WHERE mapping.company_id = $1
       AND ($2::BOOLEAN OR mapping.valid_until IS NULL)
     ORDER BY mapping.mapping_key, mapping.valid_from DESC`,
    [context.companyId, Boolean(includeHistory)]
  );
  return result.rows.map(mappingDto);
}

// Legt die neue gueltige Zeile an. Die Ablösung der bisherigen Zeile ist
// keine Anwendungsentscheidung, sondern laeuft im Auslöser der Migration -
// hier steht deshalb nur ein INSERT, kein UPDATE.
async function createMapping(client, context, input) {
  const inserted = await client.query(
    `INSERT INTO datev_wage_type_mappings (
       company_id, category, mapping_key, wage_type_number, absence_code,
       changed_by_user_id, change_reason
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      context.companyId,
      input.category,
      input.mappingKey,
      input.wageTypeNumber,
      input.absenceCode,
      context.userId,
      input.changeReason
    ]
  );
  const changer = await client.query(
    "SELECT first_name || ' ' || last_name AS name FROM users WHERE company_id = $1 AND id = $2",
    [context.companyId, context.userId]
  );
  return mappingDto({ ...inserted.rows[0], changed_by_name: changer.rows[0]?.name || null });
}

// Ein Jahr reicht für jede reale Abrechnungsperiode und begrenzt die
// generate_series-Erweiterung der Abwesenheiten auf eine überschaubare
// Zeilenzahl.
const PREVIEW_MAX_DAYS = 366;

function previewRange(url) {
  const from = validateWorkDate(url.searchParams.get("from"));
  const to = validateWorkDate(url.searchParams.get("to"));
  if (to < from) {
    throw new InputError("Das Enddatum darf nicht vor dem Startdatum liegen.");
  }
  const dayCount = Math.floor(
    (new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / 86_400_000
  ) + 1;
  if (dayCount > PREVIEW_MAX_DAYS) {
    throw new InputError("Der Vorschauzeitraum darf höchstens ein Jahr umfassen.");
  }
  return { from, to };
}

// Die Vorschau selbst: je Mitarbeiter, Tag, Lohnart die Stunden- oder
// Tageszahl, die Stufe 2 übermitteln würde - ohne dabei eine Datei zu
// erzeugen. Zwei Quellen, beide bereits vorhanden und geprüft:
//
//   - work_days (Migration 011) für Arbeits-, Fahr- und Überstundenminuten,
//     genau die Spalten, die auch timesheet-export.mjs verwendet.
//   - absence_requests (Migration 033), auf dieselbe Art nach einzelnen
//     Tagen aufgelöst wie die Stundenkonto-Berechnung in app.mjs
//     (getTimeAccount): generate_series über den Zeitraum, gefiltert auf
//     Tage mit einem Arbeitszeit-Soll ungleich null, damit ein Wochenende
//     innerhalb eines Urlaubs nicht mitzählt.
//
// Nur genehmigte Tage (work_days.status IN ('approved','locked')) und nur
// endgültig genehmigte Abwesenheiten (absence_requests.status = 'approved')
// fließen ein - ein Datenstand, der noch in Prüfung ist, gehört nicht in
// eine Lohnabrechnung.
async function buildPreview(client, context, range) {
  const [settingsResult, mappingResult, lineResult] = await Promise.all([
    client.query("SELECT * FROM datev_export_settings WHERE company_id = $1", [context.companyId]),
    client.query(
      `SELECT category, mapping_key, wage_type_number, absence_code
       FROM datev_wage_type_mappings
       WHERE company_id = $1 AND valid_until IS NULL`,
      [context.companyId]
    ),
    client.query(
      `WITH work_lines AS (
         SELECT
           day.user_id AS employee_id,
           account.personnel_number,
           account.first_name || ' ' || account.last_name AS employee_name,
           day.work_date::DATE AS work_date,
           'time_type' AS category,
           value.mapping_key,
           (value.minutes / 60.0) AS hours,
           NULL::NUMERIC AS days
         FROM work_days AS day
         JOIN users AS account
           ON account.company_id = day.company_id AND account.id = day.user_id
         CROSS JOIN LATERAL (VALUES
           ('work', day.work_minutes),
           ('travel', day.travel_minutes),
           ('overtime', day.overtime_minutes)
         ) AS value (mapping_key, minutes)
         WHERE day.company_id = $1
           AND day.work_date BETWEEN $2 AND $3
           AND day.status IN ('approved', 'locked')
           AND value.minutes > 0
       ),
       absence_lines AS (
         SELECT
           request.user_id AS employee_id,
           account.personnel_number,
           account.first_name || ' ' || account.last_name AS employee_name,
           absence_day.work_date::DATE AS work_date,
           'absence_type' AS category,
           request.absence_type AS mapping_key,
           NULL::NUMERIC AS hours,
           (CASE request.day_part WHEN 'full_day' THEN 1.0 ELSE 0.5 END) AS days
         FROM absence_requests AS request
         JOIN users AS account
           ON account.company_id = request.company_id AND account.id = request.user_id
         CROSS JOIN LATERAL generate_series(
           GREATEST(request.start_date, $2::DATE),
           LEAST(request.end_date, $3::DATE),
           INTERVAL '1 day'
         ) AS absence_day (work_date)
         WHERE request.company_id = $1
           AND request.status = 'approved'
           AND request.start_date <= $3
           AND request.end_date >= $2
           AND COALESCE((
             account.weekly_target_minutes
             ->> EXTRACT(ISODOW FROM absence_day.work_date)::INTEGER::TEXT
           )::INTEGER, 0) > 0
       )
       SELECT * FROM work_lines
       UNION ALL
       SELECT * FROM absence_lines
       ORDER BY personnel_number, work_date, category, mapping_key`,
      [context.companyId, range.from, range.to]
    )
  ]);

  const settings = settingsResult.rows[0] || null;
  const mappingByKey = new Map(mappingResult.rows.map((row) => [row.mapping_key, row]));
  const missingKeys = new Map();

  const lines = lineResult.rows.map((row) => {
    const mapping = mappingByKey.get(row.mapping_key);
    if (!mapping) missingKeys.set(row.mapping_key, row.category);
    return {
      employeeId: row.employee_id,
      personnelNumber: row.personnel_number,
      employeeName: row.employee_name,
      workDate: databaseDate(row.work_date),
      category: row.category,
      mappingKey: row.mapping_key,
      wageTypeNumber: mapping?.wage_type_number ?? null,
      absenceCode: mapping?.absence_code ?? null,
      hours: row.hours === null ? null : Number(Number(row.hours).toFixed(2)),
      days: row.days === null ? null : Number(row.days),
      mapped: Boolean(mapping)
    };
  });

  return {
    from: range.from,
    to: range.to,
    settingsConfigured: Boolean(settings),
    consultantNumber: settings?.consultant_number || null,
    clientNumber: settings?.client_number || null,
    payrollProduct: settings?.payroll_product || null,
    lineCount: lines.length,
    lines,
    // Was hier steht, würde eine spätere Exportdatei mangels Zuordnung
    // ablehnen müssen. Der Vorschau-Endpunkt zeigt es an, statt es zu
    // verstecken oder mit einer geratenen Nummer zu überdecken.
    missingMappings: [...missingKeys.entries()].map(([mappingKey, category]) => ({ category, mappingKey }))
  };
}

export async function handleDatevRequest({ request, url, client, context }) {
  const path = url.pathname;
  if (!path.startsWith("/api/v1/admin/datev")) return null;

  await requireDatevAdministrator(client, context);

  if (request.method === "GET" && path === "/api/v1/admin/datev/settings") {
    return { status: 200, body: { settings: settingsDto(await loadSettings(client, context)) } };
  }

  if (request.method === "PUT" && path === "/api/v1/admin/datev/settings") {
    const input = validateDatevExportSettings(await readJson(request));
    return { status: 200, body: { settings: await saveSettings(client, context, input) } };
  }

  if (request.method === "GET" && path === "/api/v1/admin/datev/wage-type-mappings") {
    const includeHistory = url.searchParams.get("includeHistory") === "true";
    return { status: 200, body: { mappings: await listMappings(client, context, includeHistory) } };
  }

  if (request.method === "POST" && path === "/api/v1/admin/datev/wage-type-mappings") {
    const input = validateDatevWageTypeMapping(await readJson(request));
    return { status: 201, body: { mapping: await createMapping(client, context, input) } };
  }

  if (request.method === "GET" && path === "/api/v1/admin/datev/export-preview") {
    return { status: 200, body: await buildPreview(client, context, previewRange(url)) };
  }

  return null;
}
