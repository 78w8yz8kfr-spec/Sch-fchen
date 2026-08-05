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
export const APPRENTICE_ROLE_KEY = "apprentice";

// Abwesenheitsarten, wie sie im Berichtsheft stehen sollen. Das Berichtsheft
// verlangt genau diese Angaben: an welchen Tagen war der Auszubildende nicht
// im Betrieb, und warum.
const ABSENCE_LABELS = {
  vacation: "Urlaub",
  unpaid_vacation: "Unbezahlter Urlaub",
  time_off: "Freizeitausgleich",
  leave: "Freistellung",
  special_leave: "Sonderurlaub",
  sick: "Krank",
  training: "Schulung",
  vocational_school: "Berufsschule",
  other: "Abwesend"
};

const WEEKDAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

const fullName = (row) => `${row.first_name} ${row.last_name}`.trim();

// week_start_text kommt fertig formatiert aus der Datenbank. Ueber ein
// Javascript-Datum gewandelt haengt der Tag an der Zeitzone des Prozesses:
// Mitternacht in Berlin ist in UTC der Vortag, und der Wochenbericht rutschte
// auf den Sonntag davor.
export function apprenticeReportDto(row) {
  return {
    id: row.id,
    weekStart: row.week_start_text,
    status: row.status,
    dailyEntries: Array.isArray(row.daily_entries) ? row.daily_entries : [],
    weekRemark: row.week_remark || null,
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
//
// Auszubildender ist seit Migration 058 eine Rolle, kein Kennzeichen am
// Mitarbeiter: eine Taetigkeit gehoert dorthin, wo Monteur und Vorarbeiter
// auch stehen, und zwei Quellen fuer dieselbe Aussage liefen irgendwann
// auseinander.
export async function loadApprenticeProfile(client, context, userId = context.userId) {
  const result = await client.query(
    `SELECT person.id, person.first_name, person.last_name,
            person.apprenticeship_occupation,
            TO_CHAR(person.apprenticeship_started_on, 'YYYY-MM-DD') AS started_on,
            TO_CHAR(person.apprenticeship_ends_on, 'YYYY-MM-DD') AS ends_on,
            person.trainer_user_id,
            trainer.first_name AS trainer_first_name,
            trainer.last_name AS trainer_last_name,
            EXISTS (
              SELECT 1
              FROM user_roles AS zuweisung
              JOIN roles AS rolle
                ON rolle.company_id = zuweisung.company_id AND rolle.id = zuweisung.role_id
              WHERE zuweisung.company_id = person.company_id
                AND zuweisung.user_id = person.id
                AND zuweisung.revoked_at IS NULL
                AND rolle.status = 'active'
                AND rolle.role_key = $3
            ) AS is_apprentice
     FROM users AS person
     LEFT JOIN users AS trainer
       ON trainer.company_id = person.company_id AND trainer.id = person.trainer_user_id
     WHERE person.company_id = $1 AND person.id = $2`,
    [context.companyId, userId, APPRENTICE_ROLE_KEY]
  );
  if (result.rowCount !== 1) return null;
  const row = result.rows[0];
  return {
    userId: row.id,
    name: fullName(row),
    isApprentice: row.is_apprentice,
    occupation: row.apprenticeship_occupation || null,
    startedOn: row.started_on,
    endsOn: row.ends_on,
    trainerUserId: row.trainer_user_id,
    trainerName: row.trainer_first_name
      ? `${row.trainer_first_name} ${row.trainer_last_name}`.trim()
      : null
  };
}

// Ergaenzt die geschriebenen Tageszeilen um das, was die App ohnehin weiss:
// die Arbeitszeit des Tages und eine genehmigte Abwesenheit. Ein Urlaubstag
// bekommt dabei eine eigene Zeile, auch wenn der Auszubildende nichts
// geschrieben hat - im Nachweis darf kein Tag fehlen.
export async function buildDailyEntries(client, context, userId, weekStart, geschrieben) {
  const [zeiten, abwesenheiten] = await Promise.all([
    client.query(
      `SELECT TO_CHAR(work_date, 'YYYY-MM-DD') AS tag, work_minutes
       FROM work_days
       WHERE company_id = $1 AND user_id = $2
         AND work_date >= $3::DATE AND work_date < $3::DATE + 7`,
      [context.companyId, userId, weekStart]
    ),
    client.query(
      `SELECT absence_type, day_part,
              TO_CHAR(start_date, 'YYYY-MM-DD') AS von,
              TO_CHAR(end_date, 'YYYY-MM-DD') AS bis
       FROM absence_requests
       WHERE company_id = $1 AND user_id = $2 AND status = 'approved'
         AND start_date < $3::DATE + 7 AND end_date >= $3::DATE`,
      [context.companyId, userId, weekStart]
    )
  ]);
  const minutenJeTag = new Map(zeiten.rows.map((zeile) => [zeile.tag, Number(zeile.work_minutes || 0)]));
  const geschriebeneZeilen = new Map(
    (geschrieben || []).map((eintrag) => [eintrag.workDate, eintrag.activities])
  );

  const wochenbeginn = new Date(`${weekStart}T12:00:00Z`);
  const zeilen = [];
  for (let index = 0; index < 7; index += 1) {
    const tag = new Date(wochenbeginn);
    tag.setUTCDate(tag.getUTCDate() + index);
    const datum = tag.toISOString().slice(0, 10);
    // Geschriebenes und Abgeleitetes bleiben getrennt. Beides in dasselbe Feld
    // zu mischen hiesse, es beim naechsten Speichern erneut hineinzumischen -
    // nach dem dritten Mal stuende "Urlaub" dreimal in der Zeile.
    const taetigkeiten = [...(geschriebeneZeilen.get(datum) || [])];
    const abwesend = abwesenheiten.rows.find(
      (eintrag) => datum >= eintrag.von && datum <= eintrag.bis
    );
    const abwesenheit = abwesend
      ? `${ABSENCE_LABELS[abwesend.absence_type] || ABSENCE_LABELS.other}${
        abwesend.day_part && abwesend.day_part !== "full_day" ? " (halber Tag)" : ""
      }`
      : null;
    const minuten = minutenJeTag.get(datum) || 0;
    if (taetigkeiten.length === 0 && !abwesenheit && minuten === 0) continue;
    zeilen.push({ workDate: datum, activities: taetigkeiten, absence: abwesenheit, workedMinutes: minuten });
  }
  return zeilen;
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
    `SELECT *, TO_CHAR(week_start, 'YYYY-MM-DD') AS week_start_text
     FROM apprentice_reports
     WHERE company_id = $1 AND apprentice_user_id = $2
       AND week_start >= $3::DATE AND week_start <= $4::DATE
     ORDER BY week_start DESC`,
    [context.companyId, context.userId, from, to]
  );
  return result.rows.map(apprenticeReportDto);
}

async function readOwnReport(client, context, weekStart) {
  const result = await client.query(
    `SELECT *, TO_CHAR(week_start, 'YYYY-MM-DD') AS week_start_text
     FROM apprentice_reports
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
  const zeilen = await buildDailyEntries(
    client, context, context.userId, weekStart, input.dailyEntries
  );
  const result = await client.query(
    `INSERT INTO apprentice_reports (
       company_id, apprentice_user_id, week_start, status,
       daily_entries, week_remark, worked_minutes
     ) VALUES ($1,$2,$3::DATE,'draft',$4::JSONB,$5,$6)
     ON CONFLICT (company_id, apprentice_user_id, week_start) DO UPDATE
       SET status = 'draft',
           daily_entries = EXCLUDED.daily_entries,
           week_remark = EXCLUDED.week_remark,
           worked_minutes = EXCLUDED.worked_minutes,
           return_comment = NULL
     RETURNING *, TO_CHAR(week_start, 'YYYY-MM-DD') AS week_start_text`,
    [
      context.companyId, context.userId, weekStart,
      JSON.stringify(zeilen), input.weekRemark, minuten
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
  const geschrieben = Array.isArray(vorhanden.daily_entries) ? vorhanden.daily_entries : [];
  if (geschrieben.every((zeile) => (zeile.activities || []).length === 0)) {
    throw new errors.InputError(
      "Ohne einen einzigen Tag lässt sich der Bericht nicht einreichen.",
      400,
      "apprentice_report_empty"
    );
  }
  const minuten = await weekWorkedMinutes(client, context, context.userId, weekStart);
  const zeilen = await buildDailyEntries(client, context, context.userId, weekStart, geschrieben);
  const result = await client.query(
    `UPDATE apprentice_reports
     SET status = 'submitted',
         worked_minutes = $4,
         daily_entries = $6::JSONB,
         apprentice_signature_name = $5,
         submitted_at = CURRENT_TIMESTAMP
     WHERE company_id = $1 AND apprentice_user_id = $2 AND week_start = $3::DATE
     RETURNING *, TO_CHAR(week_start, 'YYYY-MM-DD') AS week_start_text`,
    [context.companyId, context.userId, weekStart, minuten, profile.name, JSON.stringify(zeilen)]
  );
  return apprenticeReportDto(result.rows[0]);
}

// Berichte, die dieser Mensch sehen darf.
//
// Das ist ausschliesslich der eingetragene Ausbilder. Ein Berichtsheft ist
// persoenlich: es steht darin, was jemand gelernt hat, wann er krank war und
// was ihm der Ausbilder zurueckgegeben hat. Das geht das Buero nichts an,
// solange es nicht selbst ausbildet - und auch die Geschaeftsfuehrung nicht.
// Wer den Ausbilder wechselt, aendert damit auch, wer den Nachweis sieht.
export async function listApprenticeReviews(client, context) {
  const result = await client.query(
    `SELECT report.*, person.first_name, person.last_name,
            TO_CHAR(report.week_start, 'YYYY-MM-DD') AS week_start_text,
            (person.first_name || ' ' || person.last_name) AS apprentice_name
     FROM apprentice_reports AS report
     JOIN users AS person
       ON person.company_id = report.company_id AND person.id = report.apprentice_user_id
     WHERE report.company_id = $1
       AND report.status IN ('submitted', 'approved', 'returned')
       AND person.trainer_user_id = $2
     ORDER BY report.status = 'submitted' DESC, report.week_start DESC
     LIMIT 200`,
    [context.companyId, context.userId]
  );
  return result.rows.map(apprenticeReportDto);
}

// Freigabe oder Rueckgabe, auch fuer mehrere Berichte auf einmal. Ein Ausbilder
// hat am Monatsende schnell zehn Wochen vor sich; einzeln wuerde es niemand
// machen, und ein Berichtsheft ohne Unterschriften ist wertlos.
export async function reviewApprenticeReports(client, context, input, reviewer, errors) {
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
    if (row.trainer_user_id !== context.userId) {
      throw new errors.InputError(
        "Diesen Bericht unterschreibt ein anderer Ausbilder.",
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
     RETURNING *, TO_CHAR(week_start, 'YYYY-MM-DD') AS week_start_text`,
    [
      context.companyId, input.reportIds, input.decision,
      context.userId, reviewer.name, input.comment
    ]
  );
  return entschieden.rows.map(apprenticeReportDto);
}
