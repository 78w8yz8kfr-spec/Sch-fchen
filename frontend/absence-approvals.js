const $ = id => document.getElementById(id);
const endpoint = './api/v1/absence-approvals';
let state = null, busy = false;
const selected = {reviewerIds:new Set(),approverIds:new Set()};
const stages = {office_review:'Erste Prüfung',management_review:'Verbindliche Freigabe',approved:'Genehmigt'};
const kinds = {vacation:'Urlaub',sick:'Krankheit',sick_leave:'Krankheit',time_off:'Freizeitausgleich',unpaid_leave:'Unbezahlter Urlaub',other:'Sonstiges'};
async function request(url=endpoint,options={}) {
  const response=await fetch(url,{credentials:'same-origin',cache:'no-store',...options,
    headers:{'Content-Type':'application/json','X-Schaefchen-Version':'0.44.43'}});
  const data=await response.json();
  if(!response.ok) throw new Error(response.status===401?'Bitte zuerst in der Arbeitsapp anmelden.':data.error?.message||'Anfrage fehlgeschlagen.');
  return data;
}
function el(tag,text) {const node=document.createElement(tag);if(text!==undefined) node.textContent=text;return node;}
function renderPeople() {
  const query=$('search').value.trim().toLocaleLowerCase('de');
  $('employees').replaceChildren();
  for(const person of state.employees) {
    const name=`${person.first_name} ${person.last_name}`;
    if(!`${name} ${person.personnel_number}`.toLocaleLowerCase('de').includes(query)) continue;
    const row=el('div');row.className='person';const info=el('div');info.append(el('strong',name),el('small',`${person.personnel_number}${person.status==='active'?'':' · nicht aktiv'}`));row.append(info);
    for(const [key,label] of [['reviewerIds','Prüfen'],['approverIds','Freigeben']]) {
      const field=el('label'),input=el('input');input.type='checkbox';input.checked=selected[key].has(person.id);
      input.disabled=busy || (person.status!=='active'&&!input.checked);
      input.setAttribute('aria-label',`${name}: ${label}`);
      input.addEventListener('change',()=>input.checked?selected[key].add(person.id):selected[key].delete(person.id));
      field.append(input,document.createTextNode(label));row.append(field);
    }
    $('employees').append(row);
  }
}
function modeChanged() {$('selection').hidden=$('mode').value!=='selected';$('default-note').hidden=$('mode').value!=='default';}
function renderRequests() {
  $('requests').replaceChildren();
  if(!state.absences.length) {$('requests').textContent='Keine Anträge zur Prüfung vorhanden.';return;}
  for(const item of state.absences) {
    const card=el('article');card.className='request';
    card.append(el('h3',`${item.employeeName} · ${kinds[item.absenceType]||item.absenceType}`),el('p',`${item.startDate} bis ${item.endDate} · ${stages[item.status]}`));
    if(item.note)card.append(el('p',item.note));
    if(item.officeReviewedByName)card.append(el('p',`Erste Prüfung: ${item.officeReviewedByName}`));
    const own=item.employeeId===state.userId;
    const first=item.status==='office_review'&&state.canReviewAbsenceOffice;
    const second=item.status==='management_review'&&state.canApproveAbsenceManagement;
    const cancel=item.status==='approved'&&state.canApproveAbsenceManagement;
    if(own)card.append(el('p','Eigener Antrag – eine andere Person übernimmt die Prüfung.'));
    else if(second&&item.officeReviewerId===state.userId)card.append(el('p','Du hast bereits die erste Prüfung vorgenommen. Eine andere Person übernimmt die Freigabe.'));
    else if(first||second||cancel) {
      const comment=el('input');comment.maxLength=500;comment.placeholder='Begründung (bei Ablehnung oder Aufhebung erforderlich)';comment.setAttribute('aria-label',`Kommentar für ${item.employeeName}`);card.append(comment);
      for(const [action,label] of cancel?[['cancel','Freigabe aufheben']]:[['approve',first?'Geprüft – zur Freigabe': 'Verbindlich freigeben'],['reject','Ablehnen']]) {
        const button=el('button',label);button.type='button';button.disabled=busy||!navigator.onLine;
        button.addEventListener('click',async()=>{
          if(busy)return;
          if(action!=='approve'&&comment.value.trim().length<3){$('message').textContent='Bitte eine Begründung mit mindestens 3 Zeichen angeben.';comment.focus();return;}
          if(!window.confirm(`${label}: Antrag von ${item.employeeName}?`))return;
          busy=true;button.disabled=true;
          try {await request(`./api/v1/admin/absence-requests/${item.id}`,{method:'PATCH',body:JSON.stringify({action,comment:comment.value.trim(),rowVersion:item.rowVersion})});busy=false;await reload();}
          catch(error){$('message').textContent=error.message;button.disabled=false;}
          finally{busy=false;}
        });card.append(button);
      }
    }
    $('requests').append(card);
  }
}
async function reload() {
  try {
    const data=await request();state=data;$('workspace').hidden=false;$('settings').hidden=!data.canManage;
    $('message').textContent='Zuständigkeiten und Anträge sind aktuell.';
    if(data.canManage) {
      $('mode').value=data.policy.mode;
      for(const key of ['reviewerIds','approverIds'])selected[key]=new Set(data.policy[key]);
      renderPeople();modeChanged();$('history').replaceChildren();
      const names=ids=>ids?ids.map(id=>{const p=data.employees.find(p=>p.id===id);return p?`${p.first_name} ${p.last_name}`:'Ehemaliges Konto';}).join(', '):'Standardrollen';
      for(const event of data.history) $('history').append(el('li',`${new Date(event.created_at).toLocaleString('de-DE')} · ${event.actor_name}: ${event.reason} · Prüfung: ${names(event.reviewer_ids)} · Freigabe: ${names(event.approver_ids)}`));
    }
    renderRequests();
  } catch(error){$('workspace').hidden=true;$('message').textContent=error.message;}
}
$('policy-form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy||!state?.canManage)return;
  busy=true;$('save').disabled=true;$('form-message').textContent='';
  try {
    await request(endpoint,{method:'PUT',body:JSON.stringify({mode:$('mode').value,
      reviewerIds:$('mode').value==='selected'?[...selected.reviewerIds]:[],approverIds:$('mode').value==='selected'?[...selected.approverIds]:[],
      rowVersion:state.policy.rowVersion,reason:$('reason').value.trim()})});
    $('reason').value='';busy=false;await reload();$('message').textContent='Zuständigkeiten gespeichert. Sie gelten ab sofort.';
  } catch(error){$('form-message').textContent=error.message;}
  finally{busy=false;$('save').disabled=false;}
});
$('mode').addEventListener('change',modeChanged);$('search').addEventListener('input',renderPeople);$('reload').addEventListener('click',()=>{if(!busy)void reload();});
void reload();
