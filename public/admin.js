const A={d:null,L:null,tab:'students',sel:null,q:'',subs:{},ans:{}};let N=1000;
const sk=id=>(SKILLS.find(s=>s.id===id)||{}).name||id;
const stu=id=>A.d.students.find(s=>s.id===id);
const val=id=>($(id)||{}).value||'';
const say=(m,err)=>{const e=$('amsg');if(e){e.textContent=m;e.className='msg'+(err?' err':'')}};
const picked=n=>[...document.querySelectorAll(`input[name=${n}]:checked`)].map(i=>i.value);
const checks=(n,sel=[])=>`<label class="chk"><input type="checkbox" onchange="document.querySelectorAll('input[name=${n}]').forEach(i=>i.checked=this.checked)"> <b>${esc(A.L.selectAll)}</b></label>
 <div class="chks">${A.d.students.map(s=>`<label class="chk"><input type="checkbox" name="${n}" value="${s.id}" ${sel.includes(s.id)?'checked':''}> ${esc(s.name)}</label>`).join('')}</div>`;
const count=(k,id)=>A.d[k].filter(x=>x.assignedTo.includes(id)).length;

function rowsHtml(){const L=A.L.students,q=A.q.toLowerCase();
  const l=A.d.students.filter(s=>(s.name+s.email+(s.code||'')).toLowerCase().includes(q));
  return l.length?l.map(s=>`<tr><td><b>${esc(s.name)}</b>${s.code?` <span class="chip">${esc(s.code)}</span>`:''}${s.submitted?` <span class="badge ok">${s.submitted} submitted</span>`:''}</td><td>${esc(s.email)}</td><td>${esc(s.target)}</td><td>${count('tasks',s.id)}</td><td>${count('mocks',s.id)}</td><td><button class="link" onclick="openStudent('${s.id}')">${esc(L.view)}</button></td></tr>`).join(''):`<tr><td colspan="6" class="hint">${esc(L.none)}</td></tr>`}
function rows(){$('rows').innerHTML=rowsHtml()}

function students(){if(A.sel)return profile(A.sel);const L=A.L.students;
  return `<div class="two wide"><div class="card"><div class="bar" style="margin:0 0 10px"><h3 style="margin:0;flex:1">${esc(L.list)}</h3>
  <input type="text" style="max-width:220px" aria-label="${esc(L.search)}" placeholder="${esc(L.search)}" value="${esc(A.q)}" oninput="A.q=this.value;rows()"></div>
  <div class="tw"><table><thead><tr>${L.cols.map(c=>`<th>${esc(c)}</th>`).join('')}<th></th></tr></thead><tbody id="rows">${rowsHtml()}</tbody></table></div></div>
  <div class="card"><h3>${esc(L.add)}</h3>${L.fields.filter(f=>f.id!=='username').map(f=>`<div class="field"><label for="s-${f.id}">${esc(f.label)}</label><input id="s-${f.id}" type="${f.type}" ${f.step?`step="${f.step}" min="${f.min}" max="${f.max}"`:''}></div>`).join('')}
  ${acctFields()}<p class="msg" id="amsg" role="alert" aria-live="polite"></p><button class="btn full" onclick="addStudent()">${esc(L.submit)}</button></div></div>`}
const M=(k,d)=>(A.L.errors&&A.L.errors[k])||d;
function acctFields(){const ids=A.L.students.fields.map(f=>f.id);
  return `<p class="hint" style="margin:0 0 10px">The student ID (STD/001, STD/002, …) is created automatically.</p>`+
  (ids.includes('password')?'':`<div class="field"><label for="s-password">Password</label><input id="s-password" type="password" autocomplete="new-password"><label class="chk"><input type="checkbox" onchange="$('s-password').type=this.checked?'text':'password'"> Show password</label></div>`)}
const PW_BAD='Password must be 8 to 72 characters.';
const API_ERR={bad_password:PW_BAD,
  duplicate_email:'A student with that email already exists.',
  bad_email:'Enter a valid email address.',bad_name:'Enter the full name.',bad_target:'Target band must be between 4 and 9.',db_error:'Database error. Try again.'};
async function addStudent(){const E=A.L.errors,name=val('s-name').trim(),email=val('s-email').trim(),password=val('s-password'),target=parseFloat(val('s-target'));
  if(!name)return say(E.name,1);
  if(!/^\S+@\S+\.\S+$/.test(email))return say(E.email,1);
  if(password.length<8||new TextEncoder().encode(password).length>72)return say(PW_BAD,1);if(!(target>=4&&target<=9))return say(E.target,1);
  try{const r=await fetch('/api/admin/students',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,email,password,target})});
    const out=await r.json().catch(()=>({}));if(!r.ok)return say(API_ERR[out.error]||E.persist,1);
    A.d.students.push(out.student);A.q='';render();persist(A.L.students.created)}
  catch(e){say(E.persist,1)}}
async function resetPw(id){
  const f=$('pw-new'),m=$('pw-msg'),pw=f.value,note=(t,err)=>{m.textContent=t;m.className='msg'+(err?' err':'')};
  if(pw.length<8||new TextEncoder().encode(pw).length>72)return note(PW_BAD,1);
  try{const r=await fetch('/api/admin/students/'+id+'/password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:pw})});
    if(r.ok){f.value='';note('Password updated for '+stu(id).name+'.')}else note('Could not update the password.',1)}
  catch(e){note('Could not update the password.',1)}}
function syncStudents(list){const old=A.d.students||[];   // DB is the source of truth for students
  list.forEach(n=>{const o=old.find(s=>s.id!==n.id&&String(s.email).toLowerCase()===n.email.toLowerCase());
    if(o){['tasks','mocks'].forEach(k=>A.d[k].forEach(x=>{x.assignedTo=[...new Set(x.assignedTo.map(i=>i===o.id?n.id:i))]}));
      A.d.results.forEach(r=>{if(r.student===o.id)r.student=n.id})}});
  A.d.students=list}

async function openStudent(id){
  try{const r=await fetch('/api/admin/students/'+id+'/submissions');A.subs[id]=r.ok?(await r.json()).submissions:[]}catch(e){A.subs[id]=[]}
  A.sel=id;render()}
function reviewBody(p){return (p.review||[]).map(sec=>`<details class="topic"><summary>${esc(sec.label||'')}${sec.heading?' · '+esc(sec.heading):''}</summary>`+
    (sec.items?`<ul class="serif">${sec.items.map((i,n)=>`<li><b>${n+1}.</b> ${esc(i.q||'')}<br><span class="chip">${i.a?esc(i.a):'— no answer —'}</span></li>`).join('')}</ul>`
      :`<p class="serif" style="white-space:pre-wrap">${sec.text?esc(sec.text):'— no answer —'}</p><p class="hint">${sec.words||0} words</p>`)+`</details>`).join('')}
function subCard(x,sid){const p=A.ans[sid+'/'+x.task],t=A.d.tasks.find(k=>k.id===x.task);
  const all=p?(p.review||[]).flatMap(sec=>sec.items||[]):[],n=all.filter(i=>i.a).length;
  return `<div class="card" style="margin-bottom:12px"><div class="bar" style="margin:0 0 8px"><h3 style="margin:0;flex:1">${esc(t?t.title:x.task)}</h3><span class="hint">${x.submittedAt?esc(new Date(x.submittedAt).toLocaleString()):''}</span></div>
  <div><span class="badge ok">Submitted: YES</span>${t&&t.skill?`<span class="chip">${esc(sk(t.skill))}</span>`:''}${all.length?`<span class="chip">${n}/${all.length} answered</span>`:''}${p&&p.secondsLeft!=null?`<span class="chip">${fmt(p.secondsLeft)} left</span>`:''}${p&&p.auto?`<span class="chip">time ran out</span>`:''}</div>
  ${p?reviewBody(p):`<div style="margin-top:10px"><button class="btn" onclick="viewAnswers('${sid}','${x.task}')">View answers</button></div>`}
  <div style="margin-top:10px"><button class="btn ghost" onclick="retake('${sid}','${x.task}')">Allow retake</button></div></div>`}
function subsHtml(id){const l=(A.subs[id]||[]).filter(x=>x.status==='YES');
  return `<h3 style="margin:0 0 10px">Submissions</h3>${l.length?l.map(x=>subCard(x,id)).join(''):`<p class="hint" style="margin-bottom:16px">No submissions yet.</p>`}`}
async function viewAnswers(sid,ref){
  try{const r=await fetch('/api/admin/students/'+sid+'/submissions/'+encodeURIComponent(ref));if(!r.ok)throw 0;A.ans[sid+'/'+ref]=await r.json()}
  catch(e){alert('Could not load the answers.')}render()}
async function retake(sid,ref){if(!confirm('Set this back to NO so the student can take the task again? The old answers are kept in an archive.'))return;
  try{const r=await fetch('/api/admin/students/'+sid+'/submissions/'+encodeURIComponent(ref)+'/reopen',{method:'POST'});if(!r.ok)throw 0;
    const row=(A.subs[sid]||[]).find(x=>x.task===ref);if(row){row.status='NO';row.submittedAt=null}delete A.ans[sid+'/'+ref];
    const st=stu(sid);if(st)st.submitted=Math.max(0,(st.submitted||0)-1);render()}
  catch(e){alert('Could not reopen the task.')}}
function resultCard(r){const P=A.L,t=[...A.d.tasks,...A.d.mocks].find(x=>x.id===r.ref);
  const chips=r.bands?Object.entries(r.bands).map(([k,v])=>`<span class="chip band"><b>${v}</b> ${esc(sk(k))}</span>`).join(''):`<span class="chip band"><b>${r.band}</b> ${esc(sk(r.skill))}</span>`;
  return `<div class="card" style="margin-bottom:12px"><div class="bar" style="margin:0 0 8px"><h3 style="margin:0;flex:1">${esc(t?t.title:r.ref)}</h3><span class="hint">${esc(r.date)}</span></div>
  <div>${chips}${r.overall?`<span class="chip band tot"><b>${r.overall}</b> ${esc(P.overall)}</span>`:''}</div>
  ${r.audio?`<p class="hint" style="margin:10px 0 4px">${esc(P.recording)}</p><audio controls preload="none" style="width:100%" src="${esc(r.audio)}" onerror="this.nextElementSibling.classList.remove('hidden')"></audio><p class="hint hidden">${esc(P.audioMissing)}</p>`:''}
  ${r.text?`<details class="topic" style="margin:10px 0 0"><summary>${esc(P.writing)}</summary><p class="serif">${esc(r.text)}</p></details>`:''}</div>`}
function profile(id){const s=stu(id),P=A.L.profile,S2=A.L.status;
  const done=ref=>(A.subs[id]||[]).some(x=>x.task===ref&&x.status==='YES');
  const list=k=>{const m=A.d[k].filter(x=>x.assignedTo.includes(id));return m.length?m.map(x=>`<div class="note"><b>${esc(x.title)}</b> <span class="badge ${done(x.id)?'ok':''}">Submitted: ${done(x.id)?'YES':'NO'}</span><small>${esc((x.skill?sk(x.skill)+' · ':'')+(x.due||x.date||''))}</small></div>`).join(''):`<p class="hint">${esc(P.none)}</p>`};
  const res=A.d.results.filter(r=>r.student===id).sort((a,b)=>b.date.localeCompare(a.date));
  return `<button class="link" onclick="A.sel=null;render()">← ${esc(P.back)}</button>
  <div class="card" style="margin:12px 0"><h2 style="margin:0">${esc(s.name)}</h2><p class="hint" style="margin:4px 0 8px">${s.code?`<b>${esc(s.code)}</b> · `:''}${esc(s.email)}</p><span class="chip">${esc(P.target)}: ${esc(s.target)}</span> </div>
  <div class="card" style="margin:12px 0"><h3 style="margin:0 0 10px">Reset password</h3>
    <div class="inline"><input id="pw-new" type="password" autocomplete="new-password" placeholder="New password (8-72 characters)" aria-label="New password"><button class="btn" onclick="resetPw('${s.id}')">Update password</button></div>
    <label class="chk"><input type="checkbox" onchange="$('pw-new').type=this.checked?'text':'password'"> Show password</label>
    <p class="msg" id="pw-msg" role="alert"></p></div>
  <div class="two"><div><div class="card" style="margin-bottom:12px"><h3>${esc(P.tasks)}</h3>${list('tasks')}</div><div class="card"><h3>${esc(P.mocks)}</h3>${list('mocks')}</div></div>
  <div>${subsHtml(id)}<h3 style="margin:0 0 10px">${esc(P.results)}</h3>${res.length?res.map(resultCard).join(''):`<p class="hint">${esc(P.none)}</p>`}</div></div>`}

function items(kind){const L=A.L[kind],list=A.d[kind];
  const fld=f=>{const id=`${kind}-${f.id}`;return `<div class="field"><label for="${id}">${esc(f.label)}</label>${f.type==='select'?`<select id="${id}">${SKILLS.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select>`:f.type==='textarea'?`<textarea id="${id}" style="min-height:80px"></textarea>`:`<input id="${id}" type="${f.type}">`}</div>`};
  const pick=`<div class="field"><label for="${kind}-pick">${esc(L.choose)}</label><select id="${kind}-pick" onchange="fillFrom('${kind}',this.value)"><option value="">${esc(L.choosePlaceholder)}</option>${sourceFiles(kind).map(f=>`<option value="${esc(f.key)}">${esc(f.key)}</option>`).join('')}</select>${A.files&&!sourceFiles(kind).length?`<p class="hint">${esc(L.noSource)}</p>`:''}</div>`;
  const meta=x=>L.fields.filter(f=>f.id!=='title'&&f.type!=='textarea').map(f=>f.type==='select'?sk(x[f.id]):x[f.id]).filter(Boolean).concat(x.file?[x.file]:[],tpl(A.L.assigned,{n:x.assignedTo.length})).join(' · ');
  return `<p class="msg" id="amsg" role="alert" aria-live="polite"></p><div class="two"><div class="card"><h3>${esc(L.create)}</h3>${pick}${L.fields.map(fld).join('')}<h3 style="margin-top:16px">${esc(A.L.assignTo)}</h3>${checks('chk_'+kind+'_new')}<button class="btn full" onclick="createItem('${kind}')">${esc(L.submit)}</button></div>
  <div><h3 style="margin:0 0 10px">${esc(L.list)}</h3>${list.length?list.map(x=>`<div class="card" style="margin-bottom:12px"><div class="bar" style="margin:0 0 6px"><h3 style="margin:0;flex:1">${esc(x.title)}</h3><button class="btn ghost" onclick="$('p-${x.id}').classList.toggle('hidden')">${esc(A.L.manage)}</button></div>
  <p class="hint" style="margin:0 0 8px">${esc(meta(x))}</p>${x.note?`<p style="margin:0 0 8px">${esc(x.note)}</p>`:''}<div>${x.assignedTo.map(id=>`<span class="chip">${esc(stu(id)?.name||id)}</span>`).join('')}</div>
  <div class="hidden" id="p-${x.id}" style="margin-top:12px">${checks('chk_'+x.id,x.assignedTo)}<button class="btn" onclick="saveAssign('${kind}','${x.id}')">${esc(A.L.save)}</button></div></div>`).join(''):`<p class="hint">${esc(L.empty)}</p>`}</div></div>`}
function sourceFiles(kind){const src=A.L[kind].source||{prefixes:[],exclude:[]};
  return (A.files||[]).filter(f=>/\.json$/i.test(f.key)&&src.prefixes.some(p=>f.key.startsWith(p))&&!src.exclude.some(x=>f.key.toLowerCase().includes(x)))}
function fillFrom(kind,key){if(!key)return;
  const name=key.split('/').pop().replace(/\.json$/i,'').replace(/[-_]+/g,' ');
  if($(`${kind}-title`))$(`${kind}-title`).value=name.charAt(0).toUpperCase()+name.slice(1);
  const folder=key.split('/')[0];if($(`${kind}-skill`)&&SKILLS.some(x=>x.id===folder))$(`${kind}-skill`).value=folder}
async function persist(okMsg){
  try{const r=await fetch('/api/admin/content/'+A.L.stateKey,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(A.d,null,2)});
    if(!r.ok)throw 0;say(okMsg)}
  catch(e){say(A.L.errors.persist,1)}}
async function loadFiles(){try{const r=await fetch('/api/admin/content');if(!r.ok)throw 0;A.files=(await r.json()).files}catch(e){A.files=[]}paint()}
function createItem(kind){const L=A.L[kind],o={id:kind[0]+(++N)};
  L.fields.forEach(f=>o[f.id]=val(`${kind}-${f.id}`).trim());if(!o.title)return say(A.L.errors.title,1);o.file=val(kind+'-pick');if(!o.file)return say(A.L.errors.file,1);
  o.assignedTo=picked(`chk_${kind}_new`);A.d[kind].push(o);render();persist(L.created)}
function saveAssign(kind,id){A.d[kind].find(x=>x.id===id).assignedTo=picked('chk_'+id);render();persist(A.L.saved)}

function render(){paint();if(A.tab==='content')contentInit();else if(['tasks','mocks'].includes(A.tab)&&!A.files)loadFiles()}
const TAB_ICON={students:'<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 19a6 6 0 0 1 12 0M14 19a4 4 0 0 1 7 0"/>',
  tasks:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>',
  mocks:'<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/>',
  content:'<path d="M4 4h12l4 4v12H4z"/><path d="M8 12h8M8 16h5"/>',
  results:'<path d="M5 20V10M12 20V4M19 20v-7"/>'};
const tabIcon=id=>`<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${TAB_ICON[id]||TAB_ICON.content}</svg>`;
function overview(){const n=A.d.students.reduce((c,s)=>c+(s.submitted||0),0),t=(v,l)=>`<div class="tk-stat"><b>${v}</b><span>${l}</span></div>`;
  return `<div class="tk-stats four">${t(A.d.students.length,'Students')}${t(A.d.tasks.length,'Tasks')}${t(A.d.mocks.length,'Mock exams')}${t(n,'Submissions')}</div>`}
function paint(){const cur=A.L.tabs.find(t=>t.id===A.tab)||{label:''};
  $('atabs').innerHTML=A.L.tabs.map(t=>`<button aria-current="${t.id===A.tab?'page':'false'}" onclick="A.tab='${t.id}';A.sel=null;A.files=null;render()">${tabIcon(t.id)}${esc(t.label)}</button>`).join('');
  $('app').innerHTML=`<div class="crumb"><span>${tabIcon(A.tab)}</span>${esc(cur.label)}</div><h1>${esc(A.L.title)}</h1>
  ${A.tab==='students'&&!A.sel?overview():''}
  ${A.tab==='students'?students():A.tab==='content'?contentShell():items(A.tab)}<div style="height:24px"></div>`}
(async()=>{
  try{[UI,SKILLS]=await Promise.all([J('data/ui.json'),J('data/skills.json')]);[A.d,A.L]=await Promise.all([J('data/admin-data.json'),J('data/admin.json')])}
  catch(e){$('app').textContent='Could not load '+e.message+'. Check that the Flask server is running.';return}
  ['students','tasks','mocks','results'].forEach(k=>A.d[k]=A.d[k]||[]);
  try{const r=await fetch('/api/admin/students');if(r.ok)syncStudents((await r.json()).students)}catch(e){}
  N=Math.max(N,...[...A.d.tasks,...A.d.mocks].map(x=>parseInt(String(x.id).slice(1))||0));   // keep new ids unique after a reload
  document.title=A.L.title+' · UPSEAS CONSULTANTS';render()})();
