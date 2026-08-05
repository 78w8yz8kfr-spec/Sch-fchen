// Berichtsheft: Wochenberichte eines Auszubildenden.
//
// Fachlicher Hintergrund: ohne vollstaendigen Ausbildungsnachweis laesst die
// Kammer den Auszubildenden nicht zur Pruefung zu. Ein Bericht je Woche haelt
// fest, was im Betrieb getan wurde, was die Berufsschule behandelt hat und wo
// Urlaub oder Krankheit lagen. Der Ausbilder gibt frei oder gibt zurueck.
//
// Warum die Arbeitszeit nicht eingetippt wird: die App kennt sie bereits aus
// der Zeiterfassung. Wer sie abschreiben muesste, schriebe sie irgendwann
// falsch ab - und die Kammer saehe eine andere Zahl als das Buero.

export const APPRENTICE_MODULE_KEY = "apprentice_reports";

const fullName = (row) => `${row.first_name} ${row.last_name}`.trim();

export function apprenticeReportDto(row) {
  return {
    id: row.id,
    weekStart: row.week_start instanceof Date
      ? row.week_start.toISOString().slice(0, 10)
      : String(row.week_start),
    status: row.status,
    companySummary: row.company_summary || "",
    schoolSummary: row.school_summary || null,
    absenceNote: row.absence_note || null,
    workedMinutes: Number(row.worked_minutes || 0),
    submittedAt: row.submitted_at ? new Date(row.submitted_at).toISOString() : null,
    apprenticeSignatureName: row.apprentice_signature_name || null,
    reviewedAt: row.reviewed_at ? new Date(row.reviewed_at).toISOString() : null,
    trainerSignatureName: row.trainer_signature_name || null,
    returnComment: row.return_comment || null,
    rowVersion: Number(row.row_version),
    ...(row.apprentice_user_id ? { apprenticeUserId: row.apprentice_user_id } : {}),
    ...(row.apprentice_name ? { apprenticeName: row.apprentice_name } : {})
  };
}

// Wer fuehrt ein Berichtsheft, und wer bildet ihn aus?
export async function loadApprenticeProfile(client, context, userId = context.userId) {
  const result = await client.query(
    `SELECT person.id, person.first_name, person.last_name, person.is_apprentice,
            person.apprenticeship_started_on, person.apprenticeship_ends_on,
            person.trainer_user_id,
            trainer.first_name AS trainer_first_name,
            trainer.last_name AS trainer_last_name
     FROM users AS person
     LEFT JOIN users AS trainer
       ON trainer.company_id = person.company_id AND trainer.id = person.trainer_user_id
     WHERE person.company_id = $1 AND person.id = $2`,
    [context.companyId, userId]
  );
  if (result.rowCount !== 1) return null;
  const row = result.rows[0];
  return {
    userId: row.id,
    name: fullName(row),
    isApprentice: row.is_apprentice,
    startedOn: row.apprenticeship_started_on
      ? new Date(row.apprenticeship_started_on).toISOString().slice(0, 10)
      : null,
    endsOn: row.apprenticeship_ends_on
      ? new Date(row.apprenticeship_ends_on).toISOString().slice(0, 10)
      : null,
    trainerUserId: row.trainer_user_id,
    trainerName: row.trainer_first_name
      ? `${row.trainer_first_name} ${row.trainer_last_name}`.trim()
      : null
  };
}

// Geleistete Arbeitszeit der Woche aus der Zeiterfassung.
export async function weekWorkedMinutes(client, context, userId, weekStart) {
  const result = await client.query(
    `SELECT COALESCE(SUM(work_minutes), 0)::INTEGER AS minutes
     FROM work_days
     WHERE company_id = $1 AND user_id = $2
       AND work_date >= $3::DATE AND work_date < $3::DATE + 7`,
    [context.companyId, userId, weekStart]
  );
  return Number(result.rows[0]?.minutes || 0);
}

export async function listOwnApprenticeReports(client, context, { from, to }) {
  const result = await client.query(
    `SELECT * FROM apprentice_reports
     WHERE company_id = $1 AND apprentice_user_id = $2
       AND week_start >= $3::DATE AND week_start <= $4::DATE
     ORDER BY week_start DESC`,
    [context.companyId, context.userId, from, to]
  );
  return result.rows.map(apprenticeReportDto);
}

async function readOwnReport(client, context, weekStart) {
  const result = await client.query(
    `SELECT * FROM apprentice_reports
     WHERE company_id = $1 AND apprentice_user_id = $2 AND week_start = $3::DATE
     FOR UPDATE`,
    [context.companyId, context.userId, weekStart]
  );
  return result.rows[0] || null;
}

// Speichert den Entwurf einer Woche. Ein eingereichter oder freigegebener
// Bericht wird dabei nicht angefasst: sonst koennte der Auszubildende den
// Nachweis nach der Freigabe umschreiben.
export async function saveOwnApprenticeReport(client, context, weekStart, input, errors) {
  const vorhanden = await readOwnReport(client, context, weekStart);
  if (vorhanden && !["draft", "returned"].includes(vorhanden.status)) {
    throw new errors.InputError(
      "Dieser Wochenbericht wurde bereits eingereicht.",
      409,
      "apprentice_report_locked"
    );
  }
  const minuten = await weekWorkedMinutes(client, context, context.userId, weekStart);
  const result = await client.query(
    `INSERT INTO apprentice_reports (
       company_id, apprentice_user_id, week_start, status,
       company_summary, school_summary, absence_note, worked_minutes
     ) VALUES ($1,$2,$3::DATE,'draft',$4,$5,$6,$7)
     ON CONFLICT (company_id, apprentice_user_id, week_start) DO UPDATE
       SET status = 'draft',
           company_summary = EXCLUDED.company_summary,
           school_summary = EXCLUDED.school_summary,
           absence_note = EXCLUDED.absence_note,
           worked_minutes = EXCLUDED.worked_minutes,
           return_comment = NULL
     RETURNING *`,
    [
      context.companyId, context.userId, weekStart,
      input.companySummary, input.schoolSummary, input.absenceNote, minuten
    ]
  );
  return apprenticeReportDto(result.rows[0]);
}

export async function submitOwnApprenticeReport(client, context, weekStart, profile, errors) {
  const vorhanden = await readOwnReport(client, context, weekStart);
  if (!vorhanden) {
    throw new errors.InputError(
      "Für diese Woche gibt es noch keinen Bericht.",
      404,
      "apprentice_report_not_found"
    );
  }
  if (!["draft", "returned"].includes(vorhanden.status)) {
    throw new errors.InputError(
      "Dieser Wochenbericht wurde bereits eingereicht.",
      409,
      "apprentice_report_locked"
    );
  }
  if (!String(vorhanden.company_summary || "").trim()) {
    throw new errors.InputError(
      "Ohne Tätigkeiten im Betrieb lässt sich der Bericht nicht einreichen.",
      400,
      "apprentice_report_empty"
    );
  }
  const minuten = await weekWorkedMinutes(client, context, context.userId, weekStart);
  const result = await client.query(
    `UPDATE apprentice_reports
     SET status = 'submitted',
         worked_minutes = $4,
         apprentice_signature_name = $5,
         submitted_at = CURRENT_TIMESTAMP
     WHERE company_id = $1 AND apprentice_user_id = $2 AND week_start = $3::DATE
     RETURNING *`,
    [context.companyId, context.userId, weekStart, minuten, profile.name]
  );
  return apprenticeReportDto(result.rows[0]);
}

// Berichte, ueber die dieser Mensch entscheiden darf. Die Planung sieht alle,
// ein Ausbilder ohne Planungsrolle nur die seiner Auszubildenden: ein
// Vorarbeiter bildet aus, ohne deshalb das ganze Buero zu sehen.
export async function listApprenticeReviews(client, context, { allApprentices }) {
  const result = await client.query(
    `SELECT report.*, person.first_name, person.last_name,
            (person.first_name || ' ' || person.last_name) AS apprentice_name
     FROM apprentice_reports AS report
     JOIN users AS person
       ON person.company_id = report.company_id AND person.id = report.apprentice_user_id
     WHERE report.company_id = $1
       AND report.status IN ('submitted', 'approved', 'returned')
       AND ($2::BOOLEAN OR person.trainer_user_id = $3)
     ORDER BY report.status = 'submitted' DESC, report.week_start DESC
     LIMIT 200`,
    [context.companyId, allApprentices, context.userId]
  );
  return result.rows.map(apprenticeReportDto);
}

// Freigabe oder Rueckgabe, auch fuer mehrere Berichte auf einmal. Ein Ausbilder
// hat am Monatsende schnell zehn Wochen vor sich; einzeln wuerde es niemand
// machen, und ein Berichtsheft ohne Unterschriften ist wertlos.
export async function reviewApprenticeReports(client, context, input, reviewer, options, errors) {
  const result = await client.query(
    `SELECT report.id, report.status, person.trainer_user_id
     FROM apprentice_reports AS report
     JOIN users AS person
       ON person.company_id = report.company_id AND person.id = report.apprentice_user_id
     WHERE report.company_id = $1 AND report.id = ANY($2::UUID[])
     FOR UPDATE OF report`,
    [context.companyId, input.reportIds]
  );
  if (result.rowCount !== input.reportIds.length) {
    throw new errors.InputError(
      "Mindestens ein Bericht wurde nicht gefunden.",
      404,
      "apprentice_report_not_found"
    );
  }
  for (const row of result.rows) {
    if (row.status !== "submitted") {
      throw new errors.InputError(
        "Es lassen sich nur eingereichte Berichte entscheiden.",
        409,
        "apprentice_report_not_submitted"
      );
    }
    if (!options.allApprentices && row.trainer_user_id !== context.userId) {
      throw new errors.InputError(
        "Dieser Bericht gehört zu einem anderen Ausbilder.",
        403,
        "apprentice_report_forbidden"
      );
    }
  }

  const entschieden = await client.query(
    `UPDATE apprentice_reports
     SET status = $3::VARCHAR,
         reviewed_by_user_id = $4,
         reviewed_at = CURRENT_TIMESTAMP,
         trainer_signature_name = CASE WHEN $3::VARCHAR = 'approved' THEN $5::VARCHAR ELSE NULL END,
         return_comment = CASE WHEN $3::VARCHAR = 'returned' THEN $6::TEXT ELSE NULL END
     WHERE company_id = $1 AND id = ANY($2::UUID[])
     RETURNING *`,
    [
      context.companyId, input.reportIds, input.decision,
      context.userId, reviewer.name, input.comment
    ]
  );
  return entschieden.rows.map(apprenticeReportDto);
}
