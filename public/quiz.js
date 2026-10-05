let QI;
const S={phase:'intro',tasks:null,sel:'',task:null,load:null,d:null,i:0,ans:{},t:null,left:0,rec:false,count:0,over:false,err:'',msg:'',sending:false,started:false};
const sk=id=>(SKILLS.find(s=>s.id===id)||{}).name||id;
function stop(){clearInterval(S.t);S.t=null}
function runTimer(){stop();S.t=setInterval(()=>{S.left=Math.max(0,S.left-1);const e=$('tm');if(e)e.textContent=fmt(S.left);
  if(S.left===0){stop();S.over=true;const m=$('tmsg');if(m)m.textContent=UI.timeUp;const b=$('tb');if(b)b.disabled=true;submitAll(true)}},1000)}
function tick(){if(S.t)stop();else if(S.left>0){S.started=true;runTimer()}const b=$('tb');if(b)b.textContent=S.t?UI.pause:UI.resume}
async function loadTasks(){try{const r=await fetch('/api/my/tasks');if(!r.ok)throw 0;S.tasks=(await r.json()).tasks}catch(e){S.tasks=[];S.err=QI.loadError}render()}
const getContent=async k=>{const r=await fetch('/content/'+k.split('/').map(encodeURIComponent).join('/'));if(!r.ok)throw new Error(k);return r.json()};
// Listening time = length of the audio (read from the mp3 itself). Falls back to "time" in the JSON.
const audioLen=u=>new Promise(res=>{const a=new Audio();let done=false;
  const fin=v=>{if(!done){done=true;clearTimeout(tm);res(v)}},tm=setTimeout(()=>fin(0),8000);
  a.preload='metadata';a.onloadedmetadata=()=>fin(isFinite(a.duration)?Math.ceil(a.duration):0);a.onerror=()=>fin(0);a.src=u});
async function listeningTime(d){
  const urls=[...new Set((d.sections||[]).map(s=>s.audio).filter(Boolean))];   // one mp3 shared by sections counts once
  const lens=await Promise.all(urls.map(audioLen));
  if(!lens.length||lens.some(x=>!x))return d.time;
  return lens.reduce((a,b)=>a+b,0)+(d.extraSeconds||0)}
function audioStarted(){   // listening timer starts the first time the student presses play
  if(S.phase!=='test'||S.started||S.left<=0||S.over)return;
  S.started=true;runTimer();const b=$('tb');if(b)b.textContent=UI.pause;const h=$('thint');if(h)h.remove()}
async function loadQuiz(t){
  const main=await getContent(t.file);
  if(main.layout){if(main.layout==='listening')main.time=await listeningTime(main);return main}
  if(main.passages&&/passages/i.test(t.file)){
    const qd=await getContent(t.file.replace(/passages/i,'questions'));
    return {layout:'reading',time:(UI.defaultTime||{})[t.skill||'reading']||3600,passages:main.passages.map(p=>{
      const s=(qd.sets||[]).find(x=>x.passage===p.id)||{heading:'',questions:[]};
      return {label:p.label,title:p.title,paragraphs:p.paragraphs,heading:s.heading,questions:s.questions}})}}
  throw new Error('format')}
function onPick(v){S.sel=v;S.err='';render()}
function proceed(){
  const t=(S.tasks||[]).find(x=>x.id===S.sel);if(!t)return;
  S.task=t;S.phase='count';S.count=QI.countdownSeconds||10;S.err='';
  S.load=loadQuiz(t);S.load.catch(()=>{});render();
  const iv=setInterval(()=>{S.count--;const n=$('cnt');if(n)n.textContent=Math.max(S.count,0);if(S.count<=0){clearInterval(iv);openTest()}},1000)}
async function openTest(){
  try{S.d=await S.load}catch(e){S.phase='intro';S.err=QI.openError;return render()}
  S.phase='test';S.i=0;S.ans={};S.rec=false;S.over=false;S.msg='';S.sending=false;S.started=false;S.left=S.d.time||(UI.defaultTime||{})[S.task.skill]||3600;render();if(S.d.layout!=='listening')runTimer()}
function pick(id,v){S.ans[id]=v;render()}
function items(){const d=S.d;return d.passages||d.sections||d.tasks||d.parts}
function subTabs(){const it=items();return `<div class="pal" role="group">${it.map((x,i)=>`<button style="width:auto;padding:0 14px;min-width:34px" aria-pressed="${i===S.i}" onclick="S.i=${i};S.rec=false;render()">${esc(x.label)}</button>`).join('')}</div>`}
function qhtml(q){
  if(q.type==='mcq')return `<div class="q"><p>${esc(q.text)}</p>${q.options.map((o,i)=>`<button class="opt" aria-pressed="${S.ans[q.id]===i}" onclick="pick('${q.id}',${i})"><i></i>${String.fromCharCode(65+i)}. ${esc(o)}</button>`).join('')}</div>`;
  if(q.type==='tfng')return `<div class="q"><p>${esc(q.text)}</p><div class="tf">${UI.tfng.map((o,i)=>`<button class="opt" aria-pressed="${S.ans[q.id]===i}" onclick="pick('${q.id}',${i})">${esc(o)}</button>`).join('')}</div></div>`;
  return `<div class="q"><p>${esc(q.text)}</p><input type="text" aria-label="${esc(UI.answerLabel)}" value="${esc(S.ans[q.id]||'')}" oninput="S.ans['${q.id}']=this.value"></div>`}
function qcard(x){return `<div class="card"><h3>${esc(x.heading)}</h3>${x.instructions?`<p class="hint" style="margin-bottom:8px">${esc(x.instructions)}</p>`:''}${x.questions.map(qhtml).join('')}
  <div class="foot"><span class="hint">${esc(UI.autosaved)}</span><button class="btn" onclick="submitAll()">${esc(UI.submit)}</button></div></div>`}
const words=()=>{const t=(S.ans['essay'+S.i]||'').trim();return t?t.split(/\s+/).length:0};
function upd(){$('wcount').textContent=tpl(UI.wordsOf,{n:words(),min:items()[S.i].minWords})}
const L={
 reading(){const p=items()[S.i];return `${items().length>1?subTabs():''}<div class="two wide"><div class="card pass serif"><h3 style="font-family:var(--font-ui,inherit)">${esc(p.title)}</h3>${p.paragraphs.map(x=>`<p>${esc(x)}</p>`).join('')}</div>${qcard(p)}</div>`},
 listening(){const s=items()[S.i];return `<div class="card" style="margin-bottom:18px"><audio controls preload="none" style="width:100%" src="${esc(s.audio)}" onplay="audioStarted()" onerror="$('amiss').classList.remove('hidden')"></audio>${S.started?'':'<p class="hint" id="thint">The timer starts when you press play.</p>'}<p class="hint hidden" id="amiss">${esc(UI.audioMissing)}</p></div>${subTabs()}${qcard(s)}`},
 writing(){const t=items()[S.i];return `${subTabs()}<div class="two"><div class="card"><h3>${esc(t.label)}</h3><p class="serif">${esc(t.prompt)}</p><p class="hint">${esc(tpl(UI.writeAtLeast,{min:t.minWords}))}</p>${t.image?`<img src="${esc(t.image)}" alt="" style="max-width:100%;margin-top:10px">`:`<div style="height:120px;background:var(--bg);border:1.5px dashed var(--line);border-radius:3px;display:grid;place-items:center;color:var(--mute);margin-top:10px">${esc(UI.chartHere)}</div>`}</div>
  <div class="card"><h3>${esc(UI.yourAnswer)}</h3><textarea aria-label="${esc(UI.yourAnswer)}" oninput="S.ans['essay'+S.i]=this.value;upd()">${esc(S.ans['essay'+S.i]||'')}</textarea>
  <div class="foot"><span class="hint" id="wcount">${esc(tpl(UI.wordsOf,{n:words(),min:t.minWords}))}</span><button class="btn" onclick="submitAll()">${esc(UI.submitMarking)}</button></div></div></div>`},
 speaking(){const p=items()[S.i];return `${subTabs()}<div class="two"><div class="card"><div class="cue"><b>${esc(p.title)}</b>${p.points?`<p class="hint">${esc(UI.youShouldSay)}</p><ul>${p.points.map(x=>`<li>${esc(x)}</li>`).join('')}</ul><p class="hint">${esc(tpl(UI.prep,{prep:p.prep,speak:p.speak}))}</p>`:(p.questions||[]).map(x=>`<p>${esc(x)}</p>`).join('')}</div>${p.audio?`<audio controls preload="none" style="width:100%;margin-top:12px" src="${esc(p.audio)}"></audio>`:''}</div>
  <div class="card" style="text-align:center"><h3>${esc(UI.respond)}</h3><button class="rec" aria-pressed="${S.rec}" onclick="S.rec=!S.rec;render()">${esc(S.rec?UI.stop:UI.record)}</button><p class="hint">${esc(S.rec?UI.recording:UI.tapRecord)}</p>
  <div class="foot" style="justify-content:center"><button class="btn ghost">${esc(UI.playback)}</button><button class="btn">${esc(UI.feedback)}</button></div></div></div>`}};
function introView(){const g=QI.general,T=S.tasks;
  const chooser=T===null?`<p class="hint">${esc(QI.loading)}</p>`:T.length?`<div class="field"><label for="tsel">${esc(QI.chooseLabel)}</label><select id="tsel" onchange="onPick(this.value)"><option value="">${esc(QI.choosePlaceholder)}</option>${T.map(t=>`<option value="${esc(t.id)}" ${S.sel===t.id?'selected':''} ${t.submitted?'disabled':''}>${esc(t.title)} · ${esc(sk(t.skill))}${t.due?' · '+esc(QI.due)+' '+esc(t.due):''}${t.submitted?' · ✓ submitted':''}</option>`).join('')}</select></div>${S.sel?`<button class="btn" onclick="proceed()">${esc(QI.proceed)}</button>`:''}`:`<p class="hint">${esc(QI.noTasks)}</p>`;
  return `<div class="wrap"><div class="bar"><h1>${esc(QI.title)}</h1></div><p class="serif" style="margin:0 0 16px">${esc(QI.intro)}</p>
  <div class="grid">${QI.types.map(t=>`<div class="card"><h3>${esc(sk(t.id))}</h3><p class="hint" style="margin:0 0 8px">${esc(QI.durationLabel)}: ${esc(t.duration)}</p>${t.facts.map(f=>`<span class="chip">${esc(f)}</span>`).join('')}<ul style="padding-left:20px;margin:10px 0 0">${t.rules.map(r=>`<li>${esc(r)}</li>`).join('')}</ul></div>`).join('')}</div>
  <div class="card" style="margin-top:14px"><h3>${esc(g.heading)}</h3><ul style="padding-left:20px;margin:0">${g.rules.map(r=>`<li>${esc(r)}</li>`).join('')}</ul></div>
  <p class="msg err" role="alert" style="margin-top:14px">${esc(S.err)}</p><div class="choose">${chooser}</div><div style="height:32px"></div></div>`}
function countView(){return `<div class="wrap count"><p class="hint">${esc(S.task.title)}</p><h1 role="timer">${tpl(esc(QI.startsIn),{n:`<span class="n" id="cnt">${S.count}</span>`})}</h1></div>`}
function testView(){return `<div class="wrap"><div class="bar"><h1>${esc(S.task.title)}</h1><span class="timer" id="tm">${fmt(S.left)}</span><button class="btn ghost" id="tb" onclick="tick()" ${S.over?'disabled':''}>${esc(S.t?UI.pause:UI.resume)}</button></div>
  <p class="msg err" id="tmsg" role="alert">${esc([S.over?UI.timeUp:'',S.msg].filter(Boolean).join(' '))}</p>${L[S.d.layout]()}<div style="height:32px"></div></div>`}

function readable(q){const a=S.ans[q.id];if(a===undefined||a===null||a==='')return '';
  if(q.type==='mcq')return String.fromCharCode(65+a)+'. '+((q.options||[])[a]||'');
  if(q.type==='tfng')return (UI.tfng||[])[a]||String(a);
  return String(a)}
function buildReview(){return items().map((x,i)=>{
  if(S.d.layout==='writing'){const t=S.ans['essay'+i]||'';return {label:x.label,heading:x.prompt||'',text:t,words:t.trim()?t.trim().split(/\s+/).length:0}}
  return {label:x.label||'',heading:x.heading||x.title||'',items:(x.questions||[]).map(q=>({id:q.id,q:q.text,a:readable(q)}))}})}
function unanswered(){return buildReview().reduce((n,sec)=>n+(sec.items?sec.items.filter(i=>!i.a).length:(sec.text.trim()?0:1)),0)}
async function submitAll(auto){
  if(S.sending||S.phase!=='test')return;
  if(!auto){const un=unanswered();
    if(!confirm((un?'You have '+un+' unanswered. ':'')+'Submit your answers? You cannot change them afterwards.'))return}
  S.sending=true;stop();S.msg='';
  try{const r=await fetch('/api/my/submissions',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({task:S.task.id,answers:S.ans,review:buildReview(),secondsLeft:S.left,auto:!!auto})});
    const out=await r.json().catch(()=>({}));
    if(!r.ok&&out.error!=='already_submitted')throw new Error(out.error||r.status);
    S.phase='done'}
  catch(e){S.msg='Could not submit. Check your connection and press Submit again.';if(S.left>0)runTimer()}
  S.sending=false;render()}
function doneView(){return `<div class="wrap count"><p class="hint">${esc(S.task.title)}</p><h1>Answers submitted</h1><p class="serif">Your answers have been sent to your tutor.</p><button class="btn" onclick="again()">Back to my tasks</button></div>`}
function again(){S.phase='intro';S.sel='';S.d=null;S.msg='';S.over=false;S.tasks=null;render();loadTasks()}
function render(){$('app').innerHTML=({intro:introView,count:countView,test:testView,done:doneView})[S.phase]()}
boot('quizTitle').then(async()=>{try{QI=await J('data/quiz-intro.json')}catch(e){$('app').textContent='Could not load '+e.message;return}render();loadTasks()});
