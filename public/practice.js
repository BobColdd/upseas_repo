// Messages that used to come from data/quiz-intro.json (edit the wording here)
const QI={
  countdownSeconds:10,
  startsIn:'Starts in {n}',
  loading:'Loading your tasks…',
  noTasks:'No tasks have been assigned to you yet. Please check with your tutor.',
  empty:'No tasks have been assigned to you yet. Please check with your tutor.',
  nothing:'No tasks match this view.',
  confirmStart:'Start “{t}” now?\n\nThe timer cannot be paused once the test opens.',
  headphones:'Put your headphones on and check your volume. The recording starts as soon as the test opens.',
  due:'Due',
  loadError:'Could not load your tasks. Please refresh the page.',
  openError:'Could not open this task. Please try again, or tell your tutor.'
};
const S={phase:'intro',tasks:null,view:'todo',skillF:'',hl:'',fs:1,sel:'',task:null,load:null,d:null,i:0,ans:{},t:null,left:0,rec:false,count:0,over:false,err:'',msg:'',sending:false,started:false};
const ALLOW_REPLAY=false;   // true = students may play the listening recording again after it finishes
const audioOf=s=>s.audio||(S.d&&S.d.audio)||'';   // the test's single recording, unless a section has its own
const AUD={};              // url -> Audio element. Kept outside the page so answering a question never stops the recording
const sk=id=>(SKILLS.find(s=>s.id===id)||{}).name||id;
function stop(){clearInterval(S.t);S.t=null}
function runTimer(){stop();S.t=setInterval(()=>{S.left=Math.max(0,S.left-1);const e=$('tm');if(e){e.textContent=fmt(S.left);e.parentNode.parentNode.classList.toggle('low',S.left<=300)}
  if(S.left===0){stop();S.over=true;const m=$('tmsg');if(m)m.textContent=UI.timeUp;submitAll(true)}},1000)}
async function loadTasks(){try{const r=await fetch('/api/my/tasks');if(!r.ok)throw 0;S.tasks=(await r.json()).tasks}catch(e){S.tasks=[];S.err=QI.loadError}render()}
const getContent=async k=>{const r=await fetch('/content/'+k.split('/').map(encodeURIComponent).join('/'));if(!r.ok)throw new Error(k);return r.json()};
// Listening time = length of the audio (read from the mp3 itself). Falls back to "time" in the JSON.
const audioLen=u=>new Promise(res=>{const a=new Audio();let done=false;
  const fin=v=>{if(!done){done=true;clearTimeout(tm);res(v)}},tm=setTimeout(()=>fin(0),8000);
  a.preload='metadata';a.onloadedmetadata=()=>fin(isFinite(a.duration)?Math.ceil(a.duration):0);a.onerror=()=>fin(0);a.src=u});
async function listeningTime(d){
  const urls=[...new Set([d.audio,...(d.sections||[]).map(s=>s.audio)].filter(Boolean))];   // one recording for all parts counts once
  const lens=await Promise.all(urls.map(audioLen));
  if(!lens.length||lens.some(x=>!x))return d.time;
  return lens.reduce((a,b)=>a+b,0)+(d.extraSeconds||0)}
function aud(url){
  if(AUD[url])return AUD[url];
  const a=new Audio();a.preload='auto';a.src=url;a.volume=S.vol??1;
  a.onplay=()=>{audioStarted();audUi()};
  a.onpause=()=>{if(!a.ended&&S.phase==='test'&&!S.over)a.play().catch(()=>{});audUi()};   // cannot be paused
  a.onended=a.ontimeupdate=a.onloadedmetadata=()=>audUi();
  a.onerror=()=>{const m=$('amiss');if(m)m.classList.remove('hidden')};
  return AUD[url]=a}
function audPlay(i){
  const s=items()[i];if(!s||!audioOf(s))return;
  const a=aud(audioOf(s));
  if(!a.paused||(!ALLOW_REPLAY&&(a.ended||a.currentTime>0)))return;
  if(a.ended)a.currentTime=0;
  a.play().catch(()=>{const m=$('amiss');if(m)m.classList.remove('hidden')})}
function setVol(v){S.vol=+v;Object.values(AUD).forEach(a=>a.volume=S.vol)}
function stopAudio(){Object.keys(AUD).forEach(k=>{const a=AUD[k];a.onpause=null;a.pause();delete AUD[k]})}
function audUi(){
  if(S.phase!=='test'||!S.d||S.d.layout!=='listening')return;
  const s=items()[S.i];if(!s||!audioOf(s))return;
  const a=AUD[audioOf(s)];if(!a)return;
  const playing=!a.paused&&!a.ended,used=a.currentTime>0||a.ended,d=a.duration,known=isFinite(d)&&d>0;
  const b=$('aplay');if(b){b.hidden=!((S.autoBlocked&&!playing&&!used)||(ALLOW_REPLAY&&a.ended));b.textContent=a.ended?'Play again':'Start recording'}
  const st=$('astatus');if(st)st.textContent=a.ended?'Recording finished. Check your answers, then submit.':playing?'Recording in progress':S.autoBlocked?'Your browser did not start the recording by itself. Press the button to start it.':'Starting the recording…';
  const wv=document.querySelectorAll('#wave i');if(wv.length&&known){const k=Math.round(a.currentTime/d*wv.length);wv.forEach((b,i)=>b.classList.toggle('on',i<k))}}
function startAudio(){   // the recording starts by itself when the test screen opens
  const s=items()[0];if(!s||!audioOf(s))return;
  aud(audioOf(s)).play().catch(()=>{S.autoBlocked=true;render()})}
function audioStarted(){   // listening timer starts the first time the student presses play
  if(S.phase!=='test'||S.started||S.left<=0||S.over)return;
  S.started=true;runTimer();const h=$('thint');if(h)h.textContent='Time remaining'}
async function loadQuiz(t){
  const main=await getContent(t.file);
  if(main.layout){if(main.layout==='listening')main.time=await listeningTime(main);return main}
  if(main.passages&&/passages/i.test(t.file)){
    const qd=await getContent(t.file.replace(/passages/i,'questions'));
    return {layout:'reading',time:(UI.defaultTime||{})[t.skill||'reading']||3600,passages:main.passages.map(p=>{
      const s=(qd.sets||[]).find(x=>x.passage===p.id)||{heading:'',questions:[]};
      return {label:p.label,title:p.title,paragraphs:p.paragraphs,heading:s.heading,questions:s.questions}})}}
  throw new Error('format')}
function proceed(){
  const t=(S.tasks||[]).find(x=>x.id===S.sel);if(!t)return;
  S.task=t;S.phase='count';S.count=QI.countdownSeconds||10;S.err='';
  S.load=loadQuiz(t);S.load.catch(()=>{});render();
  const iv=setInterval(()=>{S.count--;const n=$('cnt');if(n)n.textContent=Math.max(S.count,0);if(S.count<=0){clearInterval(iv);openTest()}},1000)}
async function openTest(){
  stopAudio();
  try{S.d=await S.load}catch(e){S.phase='intro';S.err=QI.openError;return render()}
  S.phase='test';S.i=0;S.ans={};S.rec=false;S.over=false;S.msg='';S.sending=false;S.started=false;S.left=S.d.time||(UI.defaultTime||{})[S.task.skill]||3600;S.autoBlocked=false;S.flag={};numbering();render();if(S.d.layout==='listening')startAudio();else runTimer()}
const hasAns=id=>{const a=S.ans[id];return a!==undefined&&a!==null&&(typeof a!=='string'||a.trim()!=='')};
function numbering(){S.num={};S.qids=[];S.qmeta=[];let n=0;
  items().forEach((x,i)=>(x.questions||[]).forEach(q=>{if(q.type==='figure')return;S.num[q.id]=++n;S.qids.push(q.id);S.qmeta.push({id:q.id,n,sec:i})}));
  if(S.d.layout==='writing')items().forEach((x,i)=>S.qmeta.push({id:'essay'+i,n:i+1,sec:i,essay:true}))}   // writing: one box per task
// The row of boxes at the bottom: one per question, filled in as soon as it is answered
function chkStrip(){
  const m=S.qmeta||[];if(!m.length)return '';const it=items(),multi=it.length>1;
  const groups=it.map((x,i)=>({x,i,b:m.map((q,k)=>({q,k})).filter(o=>o.q.sec===i)})).filter(g=>g.b.length);
  const box=o=>`<button type="button" class="cb${hasAns(o.q.id)?' on':''}" data-k="${o.k}" onclick="jump(${o.k})" aria-label="${o.q.essay?'Task ':'Question '}${o.q.n}: ${hasAns(o.q.id)?'answered':'not answered'}" title="${o.q.essay?'Task ':'Question '}${o.q.n}">${o.q.n}</button>`;
  return `<div class="xchk" id="xchk" role="group" aria-label="Answered questions"><span class="xchk-t"><b id="xcount"></b> answered</span><div class="xchk-r">${groups.map(g=>`<span class="xchk-g${g.i===S.i?' cur':''}">${multi?`<em>${esc(g.x.label||'')}</em>`:''}${g.b.map(box).join('')}</span>`).join('')}</div></div>`}
function chkUpdate(){
  const m=S.qmeta||[];if(!m.length)return;let a=0;
  document.querySelectorAll('#xchk .cb').forEach(b=>{const q=m[+b.dataset.k],on=hasAns(q.id);if(on)a++;
    b.classList.toggle('on',on);b.setAttribute('aria-label',(q.essay?'Task ':'Question ')+q.n+': '+(on?'answered':'not answered'))});
  const c=$('xcount');if(c)c.textContent=a+' of '+m.length}
function jump(k){const q=S.qmeta[k];if(!q)return;
  if(q.sec!==S.i){S.i=q.sec;S.rec=false;render()}
  const el=q.essay?document.querySelector('.editor'):document.querySelector('[data-q="'+q.id+'"]');
  if(el){el.scrollIntoView({block:'center',behavior:'smooth'});const f=q.essay?el:el.querySelector('input,select,button');if(f)f.focus({preventScroll:true})}}
function prog(){chkUpdate();const t=S.qids?S.qids.length:0;if(!t)return;const a=S.qids.filter(hasAns).length,p=Math.round(a/t*100);
  const l=$('plabel');if(l)l.textContent=(l.dataset.pre||'')+a+' of '+t+' answered';
  const r=$('ppct');if(r)r.textContent=p+'%';const f=$('pfq');if(f)f.style.width=p+'%'}
function pick(id,v){S.ans[id]=v;document.querySelectorAll('[data-q="'+id+'"] .opt').forEach((b,i)=>b.setAttribute('aria-pressed',i===v));prog()}
function setAns(id,v){S.ans[id]=v;prog()}
function items(){const d=S.d;return d.passages||d.sections||d.tasks||d.parts}
function go(d){S.i=Math.min(Math.max(S.i+d,0),items().length-1);S.rec=false;render()}
function fsize(d){S.fs=Math.min(1.4,Math.max(.85,Math.round((S.fs+d)*10)/10));const a=$('app');if(a)a.style.setProperty('--rs',S.fs)}
function toggleFlag(){S.flag[S.i]=!S.flag[S.i];const b=$('flag');if(b){b.classList.toggle('on',S.flag[S.i]);b.textContent=S.flag[S.i]?'\u2691 Flagged for review':'\u2690 Flag for review'}const t=$('tab'+S.i);if(t)t.classList.toggle('flag',!!S.flag[S.i])}
function tabs(){const it=items();if(it.length<2)return '';return `<div class="tabs" role="group">${it.map((x,i)=>`<button class="tab${i===S.i?' active':''}${S.flag[i]?' flag':''}" id="tab${i}" aria-pressed="${i===S.i}" onclick="S.i=${i};S.rec=false;render()">${esc(x.label)}</button>`).join('')}</div>`}
const qrange=x=>{const n=(x.questions||[]).filter(q=>q.type!=='figure').map(q=>S.num[q.id]);return n.length?(n.length===1?'Question '+n[0]:'Questions '+n[0]+'\u2013'+n[n.length-1]):''};
function qhtml(q){
  if(q.type==='figure')return `<figure class="qfig"><img src="${esc(q.image)}" alt="${esc(q.alt||'')}">${q.caption?`<figcaption>${esc(q.caption)}</figcaption>`:''}</figure>`;
  const head=`<div class="qhead"><span class="num">${S.num[q.id]}</span><div class="qtext">${esc(q.text)}</div></div>`;
  let ans;
  if(q.type==='map')ans=`<select aria-label="${esc(q.text)}" onchange="setAns('${q.id}',this.value)"><option value="">Select a letter</option>${(q.letters||'ABCDEFGH').split('').map(l=>`<option${S.ans[q.id]===l?' selected':''}>${l}</option>`).join('')}</select>`;
  else if(q.type==='mcq')ans=q.options.map((o,i)=>`<button class="opt" aria-pressed="${S.ans[q.id]===i}" onclick="pick('${q.id}',${i})"><i></i>${String.fromCharCode(65+i)}. ${esc(o)}</button>`).join('');
  else if(q.type==='tfng')ans=`<div class="tf">${UI.tfng.map((o,i)=>`<button class="opt" aria-pressed="${S.ans[q.id]===i}" onclick="pick('${q.id}',${i})"><i></i>${esc(o)}</button>`).join('')}</div>`;
  else ans=`<input type="text" aria-label="${esc(UI.answerLabel)}" value="${esc(S.ans[q.id]||'')}" oninput="setAns('${q.id}',this.value)">`;
  return `<div class="q${q.type==='map'?' mapq':''}" data-q="${q.id}">${head}<div class="answer">${ans}</div></div>`}
const qpanel=(x,heading)=>`<section class="panel"><div class="questions">${tabs()}${heading&&x.heading?`<h2 class="qh">${esc(x.heading)}</h2>`:''}${x.instructions?`<p class="qintro">${esc(x.instructions)}</p>`:''}${x.questions.map(qhtml).join('')}</div></section>`;
const words=()=>{const t=(S.ans['essay'+S.i]||'').trim();return t?t.split(/\s+/).length:0};
function upd(){$('wcount').textContent=tpl(UI.wordsOf,{n:words(),min:items()[S.i].minWords})}
function audioCard(i){return `<div class="audio"><div class="audio-top"><span class="beat" aria-hidden="true">\u266a</span><b>Listening recording</b><span class="astatus" id="astatus">Starting the recording\u2026</span></div><div class="wave" id="wave" aria-hidden="true">${Array.from({length:70},(_,k)=>`<i style="height:${10+Math.round(Math.abs(Math.sin(k*.72))*30)}px"></i>`).join('')}</div><label class="vol">Volume <input type="range" min="0" max="1" step="0.05" value="${S.vol??1}" oninput="setVol(this.value)" aria-label="Volume"></label><button class="btn" id="aplay" onclick="audPlay(${i})" hidden>Start recording</button><p class="hint hidden" id="amiss">${esc(UI.audioMissing)}</p></div>`}
const L={
 reading(){const p=items()[S.i];return `<main class="xmain reading"><section class="panel"><div class="head"><strong>${esc(p.label)}</strong><span>${qrange(p)}</span></div><div class="content serif"><div class="kicker">Reading passage</div><h1>${esc(p.title)}</h1>${p.paragraphs.map(x=>`<p>${esc(x)}</p>`).join('')}</div></section>${qpanel(p,true)}</main>`},
 listening(){const s=items()[S.i];return `<main class="xmain listening"><section class="panel"><div class="head"><strong>${esc(s.label)}</strong><span>${qrange(s)}</span></div><div class="content"><div class="kicker">Listening</div><h1>${esc(s.heading||s.label)}</h1>${audioCard(S.i)}<div class="script-note"><b>Important:</b> The recording starts by itself and covers every part. Move to the next part when the speaker tells you to. It cannot be paused${ALLOW_REPLAY?'':' or replayed'}.</div></div></section>${qpanel(s,false)}</main>`},
 writing(){const t=items()[S.i];return `<main class="xmain writing"><section class="panel"><div class="head"><strong>${esc(t.label)}</strong>${tabs()}</div><article class="content"><div class="kicker">${esc(t.label)}</div><div class="task serif">${esc(t.prompt)}</div>${t.image?`<img class="qimg" src="${esc(t.image)}" alt="">`:''}<div class="requirements"><b>${esc(tpl(UI.writeAtLeast,{min:t.minWords}))}</b></div></article></section>
  <section class="panel"><div class="head"><strong>${esc(UI.yourAnswer)}</strong><span id="wcount">${esc(tpl(UI.wordsOf,{n:words(),min:t.minWords}))}</span></div><textarea class="editor" aria-label="${esc(UI.yourAnswer)}" oninput="S.ans['essay'+S.i]=this.value;upd();prog()">${esc(S.ans['essay'+S.i]||'')}</textarea></section></main>`},
 speaking(){const p=items()[S.i];return `<main class="xmain speaking"><section class="panel"><div class="head"><strong>${esc(p.label)}</strong>${tabs()}</div><div class="content"><div class="cue"><b>${esc(p.title)}</b>${p.points?`<p class="hint">${esc(UI.youShouldSay)}</p><ul>${p.points.map(x=>`<li>${esc(x)}</li>`).join('')}</ul><p class="hint">${esc(tpl(UI.prep,{prep:p.prep,speak:p.speak}))}</p>`:(p.questions||[]).map(x=>`<p>${esc(x)}</p>`).join('')}</div>${p.audio?`<audio controls preload="none" style="width:100%;margin-top:12px" src="${esc(p.audio)}"></audio>`:''}</div></section>
  <section class="panel"><div class="head"><strong>${esc(UI.respond)}</strong></div><div class="content center"><button class="rec" aria-pressed="${S.rec}" onclick="S.rec=!S.rec;render()">${esc(S.rec?UI.stop:UI.record)}</button><p class="hint">${esc(S.rec?UI.recording:UI.tapRecord)}</p><div style="display:flex;gap:10px;justify-content:center"><button class="btn ghost">${esc(UI.playback)}</button><button class="btn">${esc(UI.feedback)}</button></div></div></section></main>`}};
const taskCard=t=>{const d=TK.due(t),st=TK.state(t);
  return `<article class="tk-card${S.hl===t.id?' hl':''}" id="t-${esc(t.id)}"><span class="ico">${TK.icon(t.skill)}</span>
    <div class="tk-main"><h3>${esc(t.title)}</h3><p class="tk-meta"><span>${esc(sk(t.skill))}</span><span>${esc(TK.time(t.skill))}</span>${d.label?`<span class="${d.overdue&&!t.submitted?'late':''}">${esc(QI.due)} ${esc(d.label)}</span>`:''}${t.submitted&&t.submittedAt?`<span>Submitted ${esc(TK.day(t.submittedAt))}</span>`:''}</p>${t.note?`<p class="tk-note">${esc(t.note)}</p>`:''}</div>
    <div class="tk-act"><span class="pill ${st}">${TK.stateLabel[st]}</span>${t.submitted?'<button class="btn ghost" disabled>Submitted</button>':`<button class="btn" data-start="${esc(t.id)}">Start task</button>`}</div></article>`};
function renderList(){
  $('intro-msg').textContent=S.err;
  const T=S.tasks,box=$('tasks');
  if(T===null){box.innerHTML=`<p class="hint">${esc(QI.loading)}</p>`;return}
  $('c-todo').textContent=T.filter(t=>!t.submitted).length;$('c-done').textContent=T.filter(t=>t.submitted).length;$('c-all').textContent=T.length;
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.view===S.view));
  document.querySelectorAll('[data-skill]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.skill===S.skillF));
  const list=TK.sort(T).filter(t=>S.view==='all'||(S.view==='done')===!!t.submitted).filter(t=>!S.skillF||t.skill===S.skillF);
  box.innerHTML=list.length?list.map(taskCard).join(''):`<p class="tk-empty">${esc(T.length?QI.nothing:QI.empty)}</p>`}
function startTask(id){
  const t=(S.tasks||[]).find(x=>x.id===id);if(!t||t.submitted)return;
  if(!confirm(tpl(QI.confirmStart,{t:t.title})))return;
  S.sel=id;proceed()}
function countView(){return `<section class="count"><p class="hint">${esc(S.task.title)}</p>${S.task.skill==='listening'?`<p class="hint">${esc(QI.headphones)}</p>`:''}<h1 role="timer">${tpl(esc(QI.startsIn),{n:`<span class="n" id="cnt">${S.count}</span>`})}</h1></section>`}
function testView(){
  const lay=S.d.layout,it=items(),x=it[S.i],last=S.i===it.length-1,listen=lay==='listening',hasQ=S.qids&&S.qids.length;
  const timer=`<div class="xtimer${S.left<=300?' low':''}" role="timer"><span class="clock" aria-hidden="true">\u25f7</span><div><b id="tm">${fmt(S.left)}</b><small id="thint">${listen&&!S.started?'Starts with the recording':'Time remaining'}</small></div></div>`;
  const pg=hasQ?`<div class="xprog"><div class="plabel"><span id="plabel" data-pre="${esc((x.label||'')+' \u00b7 ')}"></span><span id="ppct"></span></div><div class="pbar"><i id="pfq"></i></div></div>`:`<span class="xnote">${esc(x.label||'')} \u00b7 ${S.i+1} of ${it.length}</span>`;
  const submitLabel=lay==='writing'?(UI.submitMarking||UI.submit):UI.submit;
  const fl=!!S.flag[S.i];
  return `<header class="xtop"><div class="xbrand"><div class="mark">U</div><div><b>${esc(BRAND)}</b><small>IELTS Training Platform</small></div></div><div class="xdiv"></div><div class="xtitle">${esc(sk(S.task.skill))} Test<small>${esc(S.task.title)}</small></div><div class="xright">${timer}${pg}</div></header>
${L[lay]()}
<div class="xbottom">${chkStrip()}<footer class="xfoot"><button class="xbtn${fl?' on':''}" id="flag" onclick="toggleFlag()">${fl?'\u2691 Flagged for review':'\u2690 Flag for review'}</button>${lay==='reading'?`<button class="xbtn" onclick="fsize(-.1)" aria-label="Smaller text">A\u2212</button><button class="xbtn" onclick="fsize(.1)" aria-label="Larger text">A+</button><span class="hint">Text size</span>`:''}<span class="xmsg" id="tmsg" role="alert">${esc([S.over?UI.timeUp:'',S.msg].filter(Boolean).join(' '))}</span><span class="spacer"></span><button class="xbtn" onclick="go(-1)"${S.i===0?' disabled':''}>\u2190 Previous</button>${last?`<button class="xbtn next" onclick="submitAll()">${esc(submitLabel)} \u2192</button>`:`<button class="xbtn next" onclick="go(1)">Next \u2192</button>`}</footer></div>`}

function readable(q){const a=S.ans[q.id];if(a===undefined||a===null||a==='')return '';
  if(q.type==='mcq')return String.fromCharCode(65+a)+'. '+((q.options||[])[a]||'');
  if(q.type==='tfng')return (UI.tfng||[])[a]||String(a);
  return String(a)}
function buildReview(){return items().map((x,i)=>{
  if(S.d.layout==='writing'){const t=S.ans['essay'+i]||'';return {label:x.label,heading:x.prompt||'',text:t,words:t.trim()?t.trim().split(/\s+/).length:0}}
  return {label:x.label||'',heading:x.heading||x.title||'',items:(x.questions||[]).filter(q=>q.type!=='figure').map(q=>({id:q.id,q:q.text,a:readable(q)}))}})}
function unanswered(){return buildReview().reduce((n,sec)=>n+(sec.items?sec.items.filter(i=>!i.a).length:(sec.text.trim()?0:1)),0)}
async function submitAll(auto){
  if(S.sending||S.phase!=='test')return;
  if(!auto){const un=unanswered();
    const fl=Object.values(S.flag||{}).filter(Boolean).length;
    if(!confirm((un?'You have '+un+' unanswered. ':'')+(fl?'You flagged '+fl+' part'+(fl>1?'s':'')+' for review. ':'')+'Submit your answers? You cannot change them afterwards.'))return}
  S.sending=true;stop();S.msg='';
  try{const r=await fetch('/api/my/submissions',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({task:S.task.id,answers:S.ans,review:buildReview(),secondsLeft:S.left,auto:!!auto})});
    const out=await r.json().catch(()=>({}));
    if(!r.ok&&out.error!=='already_submitted')throw new Error(out.error||r.status);
    S.phase='done';stopAudio()}
  catch(e){S.msg='Could not submit. Check your connection and press Submit again.';if(S.left>0)runTimer()}
  S.sending=false;render()}
function doneView(){return `<section class="count"><p class="hint">${esc(S.task.title)}</p><h1>Answers submitted</h1><p class="serif">Your answers have been sent to your tutor.</p><button class="btn" onclick="again()">Back to my tasks</button></section>`}
function again(){S.phase='intro';S.sel='';S.view='todo';S.hl='';S.d=null;S.msg='';S.over=false;S.flag={};S.tasks=null;render();loadTasks()}
function render(){
  const intro=S.phase==='intro';
  $('intro').hidden=!intro;$('app').hidden=intro;
  document.body.classList.toggle('in-exam',S.phase==='test');
  if(intro){renderList();return}
  $('app').className=S.phase==='test'?'exam':'';$('app').style.setProperty('--rs',S.fs);
  $('app').innerHTML=({count:countView,test:testView,done:doneView})[S.phase]();
  audUi();prog()}
$('tasks').onclick=e=>{const b=e.target.closest('[data-start]');if(b)startTask(b.dataset.start)};
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{S.view=b.dataset.view;renderList()});
document.querySelectorAll('[data-skill]').forEach(b=>b.onclick=()=>{S.skillF=b.dataset.skill;renderList()});
(async()=>{
  try{[UI,SKILLS]=await Promise.all([J('data/ui.json'),J('data/skills.json')])}
  catch(e){$('intro-msg').textContent='Could not load '+e.message+'. Please refresh the page.';return}
  // ?skill=reading (from the notes pages) filters the list; ?task=<id> (from the dashboard) highlights one task
  const q=new URLSearchParams(location.search),sf=q.get('skill'),tid=q.get('task');
  if(sf&&TK.skills[sf]){S.skillF=sf;S.view='all'}
  if(tid){S.hl=tid;S.view='all'}
  render();await loadTasks();
  const el=tid&&document.getElementById('t-'+tid);if(el)el.scrollIntoView({block:'center'})})();
