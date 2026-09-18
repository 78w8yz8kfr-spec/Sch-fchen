// Die Abwesenheitsfreigabe ist ein Bereich der Arbeitsapp (data-dashboard-pane
// "absences" in index.html), kein eigenstaendiger Bildschirm mehr - der
// Nutzer hat zu Recht bemaengelt, dass die eigenstaendige Seite ohne
// Seitenleiste und Kopfzeile "wie eine Handy-App" wirkte. Dieselbe Datei
// bedient trotzdem weiter die schlanke Weiterleitungsseite
// absence-approvals.html fuer alte Lesezeichen (siehe unten,
// embedded === false): ohne die Huelle "#absence-section", die es nur in
// index.html gibt, verdrahtet sie die Freigabelogik gar nicht erst und
// springt stattdessen in die App.
//
// Anders als inventory.js bekommen die Kennungen hier bewusst KEIN Praefix:
// keine von ihnen kollidiert mit etwas in index.html, und so bleiben die
// zahlreichen wörtlichen Kennungs-Bezüge in dieser Datei unveraendert (siehe
// frontend/tests/standalone-pages.test.mjs).
// Alle Kennungen tragen hier das Praefix "aa-": inventory.js nutzt in
// derselben Seite dieselben kurzen Namen (u. a. search, message, history,
// reload, save, workspace, form-message) - in einem gemeinsamen Dokument
// muessen Kennungen eindeutig sein. Die Aufrufe unten bleiben unveraendert
// kurz ($('search') usw.); nur diese eine Stelle haengt das Praefix an.
const $ = id => document.getElementById(`aa-${id}`);
const embedded = Boolean(document.getElementById("absence-section"));
const endpoint = './api/v1/absence-approvals';
let state = null, busy = false;
const selected = {reviewerIds:new Set(),approverIds:new Set()};
const stages = {office_review:'Erste Prüfung',management_review:'Verbindliche Freigabe',approved:'Genehmigt'};
const kinds = {vacation:'Urlaub',sick:'Krankheit',sick_leave:'Krankheit',time_off:'Freizeitausgleich',unpaid_leave:'Unbezahlter Urlaub',other:'Sonstiges'};
async function request(url=endpoint,options={}) {
  const response=await fetch(url,{credentials:'same-origin',cache:'no-store',...options,
    headers:{'Content-Type':'application/json','X-Schaefchen-Version':'0.44.54'}});
  // Eine Fehlerseite des Servers (etwa 404 oder 502) kommt als HTML, nicht als
  // JSON. Ohne diesen Fang landete die rohe Meldung "Unexpected token '<' ..."
  // vor den Augen des Nutzers. Bei unlesbarer Antwort bleibt data leer, und die
  // verstaendliche Meldung unten greift.
  const data=await response.json().catch(()=>({}));
  if(!response.ok) {
    const error=new Error(response.status===401?'Bitte zuerst in der Arbeitsapp anmelden.':data.error?.message||'Die Anfrage ist fehlgeschlagen. Bitte später erneut versuchen.');
    error.code=data.error?.code;
    throw error;
  }
  return data;
}
// Alle Aktionsknoepfe der offenen Antraege sperren/entsperren: "busy" blockt
// bereits jede zweite Anfrage zuverlaessig ab (siehe Pruefungen unten), aber
// ohne dies hier blieben die Knoepfe der UEBRIGEN, gerade nicht angeklickten
// Antraege waehrenddessen anklickbar und reagierten dann kommentarlos nicht -
// gerade bei vielen offenen Antraegen der haeufigste Fall im Buero.
function setRequestsBusy(locked) {
  for (const button of document.querySelectorAll('#aa-requests button')) button.disabled = locked || !navigator.onLine;
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
      if(key==='reviewerIds' && $('steps').value==='1')continue;
      const field=el('label'),input=el('input');input.type='checkbox';input.checked=selected[key].has(person.id);
      input.disabled=busy || (person.status!=='active'&&!input.checked);
      input.setAttribute('aria-label',`${name}: ${label}`);
      input.addEventListener('change',()=>input.checked?selected[key].add(person.id):selected[key].delete(person.id));
      field.append(input,document.createTextNode(label));row.append(field);
    }
    $('employees').append(row);
  }
}
function modeChanged() {$('default-note').textContent=$('steps').value==='1'?'Standard: Die Geschäftsführung erteilt die Freigabe.':'Standard: Administration, Büro und Planung prüfen zuerst; die Geschäftsführung gibt verbindlich frei.';$('selection').hidden=$('mode').value!=='selected';$('default-note').hidden=$('mode').value!=='default';}
function renderRequests() {
  $('requests').replaceChildren();
  if(!state.absences.length) {$('requests').textContent='Keine Anträge zur Prüfung vorhanden.';return;}
  for(const item of state.absences) {
    const card=el('article');card.className='request field';
    card.append(el('h3',`${item.employeeName} · ${kinds[item.absenceType]||item.absenceType}`),el('p',`${item.startDate} bis ${item.endDate} · ${state.approvalSteps===1&&item.status==='office_review'?'Wartet auf Freigabe':stages[item.status]}`));
    if(item.entrySource==='office_direct')card.append(el('p',`Direkt vom Büro eingetragen · ${item.managementReviewedByName||''}`));
    if(item.note)card.append(el('p',item.note));
    if(item.officeReviewedByName)card.append(el('p',`Erste Prüfung: ${item.officeReviewedByName}`));
    const own=item.employeeId===state.userId;
    const first=state.approvalSteps===2&&item.status==='office_review'&&state.canReviewAbsenceOffice;
    const second=(item.status==='management_review'||(state.approvalSteps===1&&item.status==='office_review'))&&state.canApproveAbsenceManagement;
    const cancel=item.status==='approved'&&(state.canApproveAbsenceManagement||(state.canRecordDirect&&item.entrySource==='office_direct'));
    if(own)card.append(el('p','Eigener Antrag – eine andere Person übernimmt die Prüfung.'));
    else if(second&&state.approvalSteps===2&&item.officeReviewerId===state.userId)card.append(el('p','Du hast bereits die erste Prüfung vorgenommen. Eine andere Person übernimmt die Freigabe.'));
    else if(first||second||cancel) {
      const comment=el('input');comment.maxLength=500;comment.placeholder='Begründung (bei Ablehnung oder Aufhebung erforderlich)';comment.setAttribute('aria-label',`Kommentar für ${item.employeeName}`);
      const commentErrorId=`comment-error-${item.id}`;comment.setAttribute('aria-describedby',commentErrorId);
      const commentError=el('p');commentError.id=commentErrorId;commentError.className='aa-field-error';commentError.setAttribute('aria-live','polite');
      card.append(comment,commentError);
      const period=`${item.startDate} bis ${item.endDate}`;
      const kindLabel=kinds[item.absenceType]||item.absenceType;
      for(const [action,label] of cancel?[['cancel','Freigabe aufheben']]:[['approve',first?'Geprüft – zur Freigabe': 'Verbindlich freigeben'],['reject','Ablehnen']]) {
        const button=el('button',label);button.type='button';button.className=`button ${action==='approve'?'button--primary':'button--secondary'}`;button.disabled=busy||!navigator.onLine;
        button.addEventListener('click',async()=>{
          if(busy)return;
          commentError.textContent='';comment.setAttribute('aria-invalid','false');
          if(action!=='approve'&&comment.value.trim().length<3){commentError.textContent='Bitte eine Begründung mit mindestens 3 Zeichen angeben.';comment.setAttribute('aria-invalid','true');comment.focus();return;}
          // Zeitraum und Art gehoeren in die Bestaetigung: "Freigabe aufheben:
          // Antrag von ..." allein sagte nicht, welcher Zeitraum und welche
          // Abwesenheitsart betroffen sind.
          if(!window.confirm(`${label}: ${item.employeeName} · ${kindLabel} · ${period}?`))return;
          busy=true;setRequestsBusy(true);
          try {await request(`./api/v1/admin/absence-requests/${item.id}`,{method:'PATCH',body:JSON.stringify({action,comment:comment.value.trim(),rowVersion:item.rowVersion})});await reload();}
          catch(error){$('message').textContent=error.message;setRequestsBusy(false);}
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
    $('procedure-note').textContent=data.approvalSteps===1?'Einstufig: Eine berechtigte Person genehmigt den Antrag. Eigene Anträge sind ausgeschlossen.':'Zweistufig: Zwei verschiedene Personen prüfen und genehmigen. Eigene Anträge sind ausgeschlossen.';
    $('direct-entry').hidden=!data.canRecordDirect;
    if(data.canRecordDirect) {
      const previous=$('direct-employee').value;$('direct-employee').replaceChildren();
      const empty=el('option','Mitarbeiter auswählen');empty.value='';$('direct-employee').append(empty);
      for(const person of data.employees.filter(p=>p.status==='active'&&p.id!==data.userId)) {
        const option=el('option',`${person.first_name} ${person.last_name} · ${person.personnel_number}`);option.value=person.id;$('direct-employee').append(option);
      }
      $('direct-employee').value=previous;
    }
    if(data.canManage) {
      $('steps').value=String(data.policy.approvalSteps);$('mode').value=data.policy.mode;
      for(const key of ['reviewerIds','approverIds'])selected[key]=new Set(data.policy[key]);
      renderPeople();modeChanged();$('history').replaceChildren();
      const names=ids=>ids?ids.map(id=>{const p=data.employees.find(p=>p.id===id);return p?`${p.first_name} ${p.last_name}`:'Ehemaliges Konto';}).join(', '):'Standardrollen';
      for(const event of data.history) $('history').append(el('li',`${new Date(event.created_at).toLocaleString('de-DE')} · ${event.actor_name}: ${event.reason} · ${event.approval_steps===1?'Einstufig':'Zweistufig'} · Prüfung: ${names(event.reviewer_ids)} · Freigabe: ${names(event.approver_ids)}`));
    }
    renderRequests();
  } catch(error){$('workspace').hidden=true;$('message').textContent=error.message;}
}
// Konkrete Fehlermeldung direkt am Feld statt nur in der Sammelzeile oben -
// die Formulare tragen deshalb novalidate; die Grenzen (min. 3 Zeichen)
// entsprechen validateApprovalPolicy() in api/src/absence-approval-policy.mjs.
function validateReason() {
  const reason=$('reason'),ok=reason.value.trim().length>=3;
  $('reason-error').textContent=ok?'':'Bitte eine Begründung mit mindestens 3 Zeichen angeben.';
  reason.setAttribute('aria-invalid',String(!ok));
  if(!ok)reason.focus();
  return ok;
}
// Grenzen entsprechen validateAbsenceRequest() in api/src/validation.mjs
// (Start-/Enddatum erforderlich, Ende darf nicht vor Beginn liegen). Der
// direkte Eintrag verlangt zusaetzlich immer einen Hinweis (siehe HTML
// "required") - strenger als der Server, der ihn nur bei "Sonstiges" fordert,
// damit im Buero jede verbindliche Direkteintragung dokumentiert ist.
function validateDirectEntry() {
  const employee=$('direct-employee'),start=$('direct-start'),end=$('direct-end'),note=$('direct-note');
  const noteOk=note.value.trim().length>=3;
  $('direct-note-error').textContent=noteOk?'':'Bitte eine Begründung oder einen Hinweis mit mindestens 3 Zeichen angeben.';
  note.setAttribute('aria-invalid',String(!noteOk));
  if(!employee.value){$('direct-message').textContent='Bitte einen Mitarbeiter auswählen.';employee.focus();return false;}
  if(!start.value||!end.value){$('direct-message').textContent='Bitte Von- und Bis-Datum angeben.';(start.value?end:start).focus();return false;}
  if(end.value<start.value){$('direct-message').textContent='Das Enddatum darf nicht vor dem Startdatum liegen.';end.focus();return false;}
  if(!noteOk){note.focus();return false;}
  return true;
}
// Der Rest dieser Datei verdrahtet echte Bedienelemente - die gibt es nur,
// wenn diese Datei innerhalb von index.html laeuft (siehe "embedded" oben).
// Auf der schlanken Weiterleitungsseite absence-approvals.html existieren sie
// nicht; dort springt die Datei stattdessen sofort in die App.
if (embedded) {
  $('policy-form').addEventListener('submit',async event=>{
    event.preventDefault();if(busy||!state?.canManage)return;
    $('form-message').textContent='';
    if(!validateReason())return;
    busy=true;$('save').disabled=true;
    try {
      await request(endpoint,{method:'PUT',body:JSON.stringify({mode:$('mode').value,approvalSteps:Number($('steps').value),
        reviewerIds:$('mode').value==='selected'&&$('steps').value==='2'?[...selected.reviewerIds]:[],approverIds:$('mode').value==='selected'?[...selected.approverIds]:[],
        rowVersion:state.policy.rowVersion,reason:$('reason').value.trim()})});
      $('reason').value='';await reload();$('message').textContent='Zuständigkeiten gespeichert. Sie gelten ab sofort.';
    } catch(error){$('form-message').textContent=error.message;}
    finally{busy=false;$('save').disabled=false;}
  });
  $('steps').addEventListener('change',()=>{modeChanged();renderPeople();});
  $('mode').addEventListener('change',modeChanged);$('search').addEventListener('input',renderPeople);$('reload').addEventListener('click',()=>{if(!busy)void reload();});
  $('direct-form').addEventListener('submit',async event=>{
    event.preventDefault();if(busy||!state?.canRecordDirect)return;
    $('direct-message').textContent='';
    if(!validateDirectEntry())return;
    if(!window.confirm(`Abwesenheit ohne Antrag verbindlich in die Planung eintragen? ${$('direct-employee').selectedOptions[0]?.textContent||''} · ${kinds[$('direct-type').value]} · ${$('direct-start').value} bis ${$('direct-end').value}`))return;
    busy=true;$('direct-save').disabled=true;
    try {
      await request('./api/v1/admin/absences',{method:'POST',body:JSON.stringify({employeeId:$('direct-employee').value,
        absenceType:$('direct-type').value,startDate:$('direct-start').value,endDate:$('direct-end').value,
        dayPart:$('direct-part').value,note:$('direct-note').value.trim()})});
      $('direct-form').reset();await reload();$('direct-message').textContent='Abwesenheit eingetragen und in der Planung berücksichtigt.';
    } catch(error){$('direct-message').textContent=error.message;}
    finally{busy=false;$('direct-save').disabled=false;}
  });
  // Fehlermeldung am Feld verschwindet, sobald sie behoben ist, statt erst beim
  // naechsten Absenden.
  $('reason').addEventListener('input',()=>{if($('reason-error').textContent)validateReason();});
  $('direct-note').addEventListener('input',()=>{if($('direct-note-error').textContent&&$('direct-note').value.trim().length>=3)$('direct-note-error').textContent='';});
} else {
  // Altes Lesezeichen auf die eigenstaendige Seite (auch mit "#direct-entry",
  // siehe frontend/absence-approvals.html): die Abwesenheitsfreigabe lebt
  // jetzt in der Arbeitsapp, sofort dorthin springen statt eine zweite,
  // abweichend gestaltete Oberflaeche zu zeigen. Der Bereich in index.html
  // nutzt dieselbe (unveraenderte) ID "direct-entry" - der alte Anker
  // funktioniert damit unveraendert weiter.
  const sub = window.location.hash === '#direct-entry' ? '&sub=direct-entry' : '';
  const ziel = `./?pane=absences${sub}`;
  // Der Knopf "Jetzt öffnen" auf derselben Seite bietet denselben Sprung von
  // Hand an, falls die automatische Weiterleitung ausbleibt.
  $('absence-open')?.addEventListener('click', () => window.location.replace(ziel));
  window.location.replace(ziel);
}

let started = false, ladevorgang = null;
// Von app.js aufgerufen, wenn der Bereich zum ersten Mal geoeffnet wird - erst
// dann lohnt sich der Netzwerkabruf. Ein sofortiger Abruf beim Import haette
// bei JEDEM App-Start eine Anfrage ausgeloest. Der zurueckgegebene Ladevorgang
// laesst app.js beim Sprung auf "#direct-entry" gezielt warten, bis der
// Abschnitt tatsaechlich sichtbar sein kann.
export function initAbsencesPane() {
  if (!embedded) return Promise.resolve();
  if (!started) { started = true; ladevorgang = reload(); }
  return ladevorgang;
}
