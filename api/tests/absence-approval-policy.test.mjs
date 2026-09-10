import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { absenceApprovalPolicy, validateApprovalPolicy, saveApprovalPolicy } from '../src/absence-approval-policy.mjs';
import { createPool } from '../src/database.mjs';

const a=randomUUID(), b=randomUUID();
const chosen={mode:'selected',reviewerIds:[a],approverIds:[b],rowVersion:0,reason:'Vertretung'};
test('Abwesenheitszuständigkeit: vollständige Auswahl, zwei Personen und serverseitige Herkunft',()=>{
  assert.deepEqual(validateApprovalPolicy(chosen),chosen);
  assert.equal(validateApprovalPolicy({...chosen,reviewerIds:[a,a]}).reviewerIds.length,1);
  assert.equal(validateApprovalPolicy({mode:'default',reviewerIds:[],approverIds:[],rowVersion:1,reason:'Standard'}).mode,'default');
  for(const input of [null,[],{}, {...chosen,companyId:a},{...chosen,mode:'all'}, {...chosen,rowVersion:-1},
    {...chosen,reason:'a'},{...chosen,reason:'a'.repeat(501)}, {...chosen,reviewerIds:[]}, {...chosen,approverIds:[a]},
    {...chosen,reviewerIds:'all'},{...chosen,reviewerIds:Array(101).fill(a)}, {...chosen,approverIds:['bad']},
    {...chosen,mode:'default'}]) assert.throws(()=>validateApprovalPolicy(input));
});

const integration=process.env.API_INTEGRATION_TEST==='true'?test:test.skip;
integration('Zuständigkeitsverlauf: Mandanten, aktive Personen, Rollen, Konkurrenz und Unveränderlichkeit',async()=>{
  const pool=createPool({host:process.env.POSTGRES_HOST,port:Number(process.env.POSTGRES_PORT||5432),database:process.env.POSTGRES_DB,user:process.env.POSTGRES_USER,password:process.env.POSTGRES_PASSWORD});
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const company=async()=>(await client.query("INSERT INTO companies(company_number,legal_name,display_name) VALUES('F-' || nextval('companies_number_seq'),'Zuständigkeitstest','Zuständigkeitstest') RETURNING id")).rows[0].id;
    const companyId=await company(), foreignCompany=await company();
    const user=async c=>(await client.query("INSERT INTO users(company_id,personnel_number,first_name,last_name) VALUES($1,$2,'Test','Freigabe') RETURNING id",[c,randomUUID().slice(0,12)])).rows[0].id;
    const admin=await user(companyId), reviewer=await user(companyId), approver=await user(companyId), foreign=await user(foreignCompany);
    await client.query("INSERT INTO user_roles(company_id,user_id,role_id) SELECT $1,$2,id FROM roles WHERE company_id=$1 AND role_key='admin'",[companyId,admin]);
    await client.query("SELECT set_config('app.current_company_id',$1,true),set_config('app.current_user_id',$2,true)",[companyId,admin]);
    await client.query('SET LOCAL ROLE schaefchen_api');
    const ctx={companyId,userId:admin};
    assert.equal((await absenceApprovalPolicy(client,ctx)).mode,'default');
    const policy=await saveApprovalPolicy(client,ctx,{...chosen,reviewerIds:[reviewer],approverIds:[approver]});
    assert.equal(policy.rowVersion,1);assert.equal(policy.mode,'selected');
    await assert.rejects(saveApprovalPolicy(client,ctx,{...chosen,reviewerIds:[reviewer],approverIds:[approver]}),{status:409});
    await assert.rejects(saveApprovalPolicy(client,ctx,{...chosen,rowVersion:1,reviewerIds:[reviewer],approverIds:[foreign]}),{status:400});
    const expectSQL=async(sql,params,code)=>{await client.query('SAVEPOINT bad');await assert.rejects(client.query(sql,params),{code});await client.query('ROLLBACK TO SAVEPOINT bad');};
    await expectSQL('UPDATE absence_approval_policies SET reason=$1 WHERE company_id=$2',['Andere Begründung',companyId],'42501');
    await expectSQL('DELETE FROM absence_approval_policies WHERE company_id=$1',[companyId],'42501');
    await client.query("SELECT set_config('app.current_user_id',$1,true)",[reviewer]);
    await expectSQL("INSERT INTO absence_approval_policies(company_id,row_version,actor_user_id,reason) VALUES($1,2,$2,'Unerlaubt')",[companyId,reviewer],'42501');
    await client.query("SELECT set_config('app.current_company_id',$1,true),set_config('app.current_user_id',$2,true)",[foreignCompany,foreign]);
    assert.equal((await client.query('SELECT * FROM absence_approval_policies WHERE company_id=$1',[companyId])).rowCount,0);
    await client.query("SELECT set_config('app.current_company_id',$1,true),set_config('app.current_user_id',$2,true)",[companyId,admin]);
    const reset=await saveApprovalPolicy(client,ctx,{mode:'default',reviewerIds:[],approverIds:[],rowVersion:1,reason:'Standard wiederherstellen'});
    assert.equal(reset.rowVersion,2);assert.equal(reset.mode,'default');
    assert.equal((await client.query('SELECT * FROM absence_approval_policies WHERE company_id=$1',[companyId])).rowCount,2);
  } finally {await client.query('ROLLBACK');client.release();await pool.end();}
});
