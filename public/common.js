const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const J=async p=>{const r=await fetch(p);if(!r.ok)throw new Error(p);return r.json()};
const fmt=s=>String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
const tpl=(s,o)=>s.replace(/\{(\w+)\}/g,(_,k)=>o[k]);
let UI,SKILLS,ME=null;
async function logout(){try{await fetch('/api/logout',{method:'POST'})}catch(e){}location.href='index.html'}
const homeFor=u=>u&&u.role==='admin'?'admin.html':'dashboard.html';
function profileWidget(){
  const P=UI.profile,w=document.createElement('div');w.className='profile';
  w.innerHTML=`<button class="avatar" id="pbtn" aria-haspopup="true" aria-expanded="false" aria-label="${esc(P.label)}"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg></button>
  <div class="menu hidden" id="pmenu" role="menu"><p class="who"><b>${esc(ME.name)}</b><span>${esc(ME.email)}</span>${ME.code?`<span>${esc(ME.code)}</span>`:''}<em>${esc(P.role[ME.role]||ME.role)}</em></p>
  <a role="menuitem" href="notes.html">${esc(P.notes)}</a>
  <a role="menuitem" href="#" onclick="logout();return false">${esc(P.logout)}</a></div>`;
  const btn=w.querySelector('#pbtn'),menu=w.querySelector('#pmenu');
  const set=o=>{menu.classList.toggle('hidden',!o);btn.setAttribute('aria-expanded',o)};
  btn.onclick=e=>{e.stopPropagation();set(menu.classList.contains('hidden'))};
  document.addEventListener('click',e=>{if(!w.contains(e.target))set(false)});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){set(false);btn.focus()}});
  return w}
async function boot(titleKey){
  try{[UI,SKILLS]=await Promise.all([J('data/ui.json'),J('data/skills.json')])}
  catch(e){$('app').textContent='Could not load '+e.message+'. Check that the Flask server is running.';throw e}
  try{const r=await fetch('/api/me');ME=r.ok?await r.json():null}catch(e){ME=null}
  const here=location.pathname.split('/').pop()||'index.html';
  $('nav').remove();
  const cta=$('cta'),c=ME?(UI.ctaQuiz||UI.cta):(UI.ctaLogin||UI.cta);
  cta.style.marginLeft='auto';cta.textContent=c.label;cta.href=c.href;
  const hideCta=(!ME&&here==='login.html')||(ME&&ME.role==='admin');   // admins never see the quiz button
  if(hideCta)cta.style.display='none';
  if(ME){document.querySelector('.logo').href=homeFor(ME);const pw=profileWidget();cta.after(pw);if(hideCta)pw.style.marginLeft='auto'}
  $('foot').textContent=UI.footer;
  document.title=(titleKey&&UI[titleKey]?UI[titleKey]+' · ':'')+'UPSEAS CONSULTANCY';
}
function pickSkill(){const q=new URLSearchParams(location.search).get('skill');return SKILLS.some(s=>s.id===q)?q:SKILLS[0].id}
function tabs(active,fn){return `<div class="pal" role="tablist">${SKILLS.map(s=>`<button role="tab" style="width:auto;padding:0 14px" aria-pressed="${s.id===active}" onclick="${fn}('${s.id}')">${esc(s.name)}</button>`).join('')}</div>`}
