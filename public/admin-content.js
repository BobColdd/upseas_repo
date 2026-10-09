const C={files:[],q:'',cur:null,closed:{}};
const GROUPS=[['reading','Reading'],['listening','Listening'],['writing','Writing'],['speaking','Speaking'],['data/notes','Notes'],['data/quiz','Quiz'],['data','Site text']];
const grp=k=>{const p=k.split('/');if(p[0]==='data')return p.length>2?'data/'+p[1]:'data';return p.length>1?p[0]:'other'};
const gi=id=>{const i=GROUPS.findIndex(g=>g[0]===id);return i<0?99:i};
const gLabel=id=>{const g=GROUPS.find(x=>x[0]===id);return g?g[1]:id==='other'?'Other':id.charAt(0).toUpperCase()+id.slice(1)};
const cl=()=>A.L.content;
const enc=k=>k.split('/').map(encodeURIComponent).join('/');
function cmsg(m,err){const e=$('c-msg');if(e){e.textContent=m;e.className='msg'+(err?' err':'')}}
function contentShell(){const L=cl();return `<div class="two wide"><div class="card"><div class="bar" style="margin:0 0 10px"><h3 style="margin:0;flex:1">${esc(L.files)}</h3>
  <input type="text" style="max-width:200px" aria-label="${esc(L.search)}" placeholder="${esc(L.search)}" value="${esc(C.q)}" oninput="C.q=this.value;cList()"></div><div class="clist" id="c-list"></div></div>
  <div class="card"><p class="hint" id="c-backend" style="margin:0 0 10px"></p><div id="c-edit"></div></div></div>`}
async function contentInit(){C.cur=null;let failed=false;
  try{const r=await fetch('/api/admin/content');if(!r.ok)throw 0;const j=await r.json();C.files=j.files;$('c-backend').textContent=tpl(cl().backend,{name:j.backend})}
  catch(e){C.files=[];failed=true}
  cList();cEdit();if(failed)cmsg(cl().loadError,1)}
function cList(){const L=cl(),q=C.q.toLowerCase(),l=C.files.filter(f=>f.key.toLowerCase().includes(q));
  if(!l.length){$('c-list').innerHTML=`<p class="hint" style="padding:12px">${esc(L.empty)}</p>`;return}
  const g={};l.forEach(f=>{const id=grp(f.key);(g[id]=g[id]||[]).push(f)});
  $('c-list').innerHTML=Object.keys(g).sort((a,b)=>gi(a)-gi(b)||a.localeCompare(b)).map(id=>{
    const open=q||!C.closed[id]?' open':'';
    const rows=g[id].map(f=>`<button class="crow" data-k="${esc(f.key)}" title="${esc(f.key)}" aria-current="${!!C.cur&&C.cur.key===f.key}" onclick="cOpen(this.dataset.k)">${esc(f.key.slice(id==='other'?0:id.length+1))}<small>${esc(tpl(L.size,{n:(f.size/1024).toFixed(1)}))} \u00b7 ${esc(f.modified.slice(0,10))}</small></button>`).join('');
    return `<details class="cgroup"${open} ontoggle="C.closed['${id}']=!this.open"><summary><b>${esc(gLabel(id))}</b><span>${g[id].length}</span></summary>${rows}</details>`}).join('')}
async function cOpen(key){
  if(/\.json$/i.test(key)){
    try{const r=await fetch('/api/admin/content/'+enc(key));if(!r.ok)throw 0;const t=await r.text();C.cur={key,text:t,orig:t}}
    catch(e){C.cur=null;cList();cEdit();return cmsg(cl().readError,1)}
  }else C.cur={key};
  cList();cEdit()}
function cEdit(){const L=cl(),c=C.cur;
  const make=`<div class="inline"><input type="text" id="c-new" aria-label="${esc(L.newFile)}" placeholder="${esc(L.newPlaceholder)}"><button class="btn ghost" onclick="cNew()">${esc(L.create)}</button></div>`;
  let body=`<p class="hint">${esc(L.select)}</p>`;
  if(c&&c.text!==undefined)body=`<h3 style="margin:0 0 8px;word-break:break-all">${esc(c.key)}</h3><textarea class="code" id="c-text" spellcheck="false" aria-label="${esc(c.key)}" oninput="C.cur.text=this.value">${esc(c.text)}</textarea>
    <div class="foot"><span><button class="btn ghost" onclick="cFormat()">${esc(L.format)}</button> <button class="btn ghost" onclick="cRevert()">${esc(L.revert)}</button></span><button class="btn" onclick="cSave()">${esc(L.save)}</button></div>`;
  else if(c&&/^audio\/.+\.(mp3|m4a|wav|ogg)$/i.test(c.key))body=`<h3 style="margin:0 0 8px;word-break:break-all">${esc(c.key)}</h3><p class="hint">${esc(L.audio)}</p><audio controls preload="none" style="width:100%" src="/${enc(c.key)}"></audio>`;
  else if(c)body=`<h3 style="margin:0 0 8px;word-break:break-all">${esc(c.key)}</h3><p class="hint">${esc(L.unsupported)}</p>`;
  $('c-edit').innerHTML=make+body+`<p class="msg" id="c-msg" role="alert" aria-live="polite" style="margin-top:10px"></p>`}
function cNew(){const k=val('c-new').trim();
  if(!/^[\w\-./]+\.json$/.test(k)||k.includes('..')||k.startsWith('/'))return cmsg(cl().keyError,1);
  if(C.files.some(f=>f.key===k))return cOpen(k);
  C.cur={key:k,text:'{}',orig:null,isNew:true};cList();cEdit()}
function cFormat(){try{C.cur.text=JSON.stringify(JSON.parse(C.cur.text),null,2)+'\n';$('c-text').value=C.cur.text;cmsg('')}catch(e){cmsg(tpl(cl().invalid,{detail:e.message}),1)}}
function cRevert(){C.cur.text=C.cur.orig===null?'{}':C.cur.orig;cEdit()}
async function cSave(){const L=cl(),c=C.cur;
  try{JSON.parse(c.text)}catch(e){return cmsg(tpl(L.invalid,{detail:e.message}),1)}
  try{const r=await fetch('/api/admin/content/'+enc(c.key),{method:'PUT',headers:{'Content-Type':'application/json'},body:c.text});
    if(!r.ok){const j=await r.json().catch(()=>({}));return cmsg(j.detail?tpl(L.invalid,{detail:j.detail}):L.saveError,1)}
    c.orig=c.text;
    if(c.isNew){c.isNew=false;C.files.push({key:c.key,size:new Blob([c.text]).size,modified:new Date().toISOString()});C.files.sort((a,b)=>a.key.localeCompare(b.key));cList()}
    cmsg(L.saved)}
  catch(e){cmsg(L.saveError,1)}}
