import { InputError, validateId } from './validation.mjs';

export async function absenceApprovalPolicy(client, context) {
  const result = await client.query(
    `SELECT row_version, reviewer_ids, approver_ids, approval_steps FROM absence_approval_policies
     WHERE company_id=$1 ORDER BY row_version DESC LIMIT 1`, [context.companyId]);
  const row = result.rows[0];
  return { approvalSteps: row?.approval_steps || 2, rowVersion: Number(row?.row_version || 0), mode: row?.reviewer_ids ? 'selected' : 'default',
    reviewerIds: row?.reviewer_ids || [], approverIds: row?.approver_ids || [] };
}

export function validateApprovalPolicy(body) {
  const fields = ['mode', 'reviewerIds', 'approverIds', 'rowVersion', 'reason', 'approvalSteps'];
  if (!body || Array.isArray(body) || Object.keys(body).some(key => !fields.includes(key))
      || !['default', 'selected'].includes(body.mode)
      || ![1,2].includes(body.approvalSteps ?? 2)
      || !Number.isSafeInteger(body.rowVersion) || body.rowVersion < 0
      || typeof body.reason !== 'string' || body.reason.trim().length < 3 || body.reason.length > 500) {
    throw new InputError('Bitte Auswahl, aktuelle Fassung und eine Begründung (3–500 Zeichen) angeben.');
  }
  const ids = key => {
    if (!Array.isArray(body[key]) || body[key].length > 100) throw new InputError('Ungültige Mitarbeiterauswahl.');
    return [...new Set(body[key].map(id => validateId(id, 'Mitarbeiter-ID').toLowerCase()))];
  };
  const reviewerIds = ids('reviewerIds'), approverIds = ids('approverIds');
  const approvalSteps = body.approvalSteps ?? 2;
  if (body.mode === 'selected' && (!approverIds.length || (approvalSteps === 2 &&
      (!reviewerIds.length || new Set([...reviewerIds, ...approverIds]).size < 2)))) {
    throw new InputError('Freigabeperson wählen; bei zwei Stufen sind zwei verschiedene Personen nötig.');
  }
  if (approvalSteps === 1 && reviewerIds.length) throw new InputError('Bei einer Stufe nur Freigabepersonen auswählen.');
  if (body.mode === 'default' && (reviewerIds.length || approverIds.length)) throw new InputError('Bei Standardrollen keine Personen mitsenden.');
  return { ...body, approvalSteps, reviewerIds, approverIds, reason: body.reason.trim() };
}

export async function saveApprovalPolicy(client, context, body) {
  const input = validateApprovalPolicy(body);
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended('absence-policy:' || $1::text,0))", [context.companyId]);
  const current = await absenceApprovalPolicy(client, context);
  if (current.rowVersion !== input.rowVersion) throw new InputError('Die Zuständigkeit wurde inzwischen geändert. Bitte neu laden.',409,'conflict');
  const ids = [...new Set([...input.reviewerIds, ...input.approverIds])];
  if (ids.length) {
    const users = await client.query("SELECT id FROM users WHERE company_id=$1 AND id=ANY($2::uuid[]) AND status='active' FOR SHARE",[context.companyId,ids]);
    if (users.rowCount !== ids.length) throw new InputError('Nur aktive Mitarbeiter dieser Firma können ausgewählt werden.');
  }
  await client.query(`INSERT INTO absence_approval_policies(company_id,row_version,reviewer_ids,approver_ids,actor_user_id,reason,approval_steps)
    VALUES($1,$2,$3,$4,$5,$6,$7)`, [context.companyId,current.rowVersion+1,
    input.mode==='selected'?input.reviewerIds:null,input.mode==='selected'?input.approverIds:null,context.userId,input.reason,input.approvalSteps]);
  return absenceApprovalPolicy(client,context);
}
