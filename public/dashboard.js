// Student dashboard (landing page): greeting, task counts, the next few tasks, new-task alert.
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

(async () => {
  let me = null;
  try { const r = await fetch('/api/me'); if (r.ok) me = await r.json(); } catch (e) {}
  if (!me) return;                                   // shell.js sends logged-out visitors to the login page
  const first = (me.name || me.email || '').trim().split(/\s+/)[0];
  if (first) $('hello').textContent = 'Welcome back, ' + first;

  let tasks;
  try { tasks = await TK.load(); }
  catch (e) { $('next').innerHTML = ''; $('err').textContent = 'Could not load your tasks. Please refresh the page.'; return; }

  const todo = tasks.filter(t => !t.submitted), late = todo.filter(t => TK.state(t) === 'late'), done = tasks.length - todo.length;
  $('s-todo').textContent = todo.length; $('s-late').textContent = late.length; $('s-done').textContent = done;
  $('stats').hidden = !tasks.length;
  $('lead').textContent = !tasks.length ? 'Nothing has been assigned yet. Your tutor will add tasks here.'
    : todo.length ? 'You have ' + todo.length + (todo.length === 1 ? ' task' : ' tasks') + ' waiting for you.'
    : 'You are all caught up. Well done!';

  // "Up next": the first three tasks still to do
  const next = TK.sort(todo).slice(0, 3);
  $('next').innerHTML = next.length ? next.map(t => {
    const d = TK.due(t), st = TK.state(t);
    return `<a class="tk-card" href="practice.html?task=${encodeURIComponent(t.id)}"><span class="ico">${TK.icon(t.skill)}</span>
      <div class="tk-main"><h3>${esc(t.title)}</h3><p class="tk-meta"><span>${esc(TK.name(t.skill))}</span><span>${esc(TK.time(t.skill))}</span>${d.label ? `<span class="${d.overdue ? 'late' : ''}">Due ${esc(d.label)}</span>` : ''}</p></div>
      <div class="tk-act"><span class="pill ${st}">${TK.stateLabel[st]}</span><span class="btn">Open</span></div></a>`;
  }).join('') : `<p class="tk-empty">${tasks.length ? 'No tasks left to do. Check the Practice page for your submitted work.' : 'No tasks have been assigned to you yet.'}</p>`;

  // First visit after new tasks arrive: show a one-off alert. "Seen" ids are kept in this browser, per student.
  const key = 'seenTasks:' + me.id;
  try {
    const seen = JSON.parse(localStorage.getItem(key) || 'null');
    const ids = tasks.map(t => t.id), fresh = seen ? todo.filter(t => !seen.includes(t.id)) : todo;
    if (fresh.length) {
      $('newtext').textContent = fresh.length === 1 ? 'New task: ' + fresh[0].title : fresh.length + ' new tasks have been assigned to you.';
      $('newbanner').hidden = false;
    }
    const mark = () => localStorage.setItem(key, JSON.stringify(ids));
    $('newx').onclick = () => { $('newbanner').hidden = true; mark(); };
    if (!fresh.length) mark(); else window.addEventListener('pagehide', mark);
  } catch (e) {}
})();
