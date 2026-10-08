/* Header account menu for logged-in pages. Needs no JSON files.
   Expects the page header to contain  <a id="logo">  and  <a id="cta">. */
(async () => {
  let me = null;
  try { const r = await fetch('/api/me'); if (r.ok) me = await r.json(); } catch (e) {}
  if (!me) {                                   // not logged in (or session expired)
    location.href = 'login.html?next=' + encodeURIComponent(location.pathname.split('/').pop() || 'index.html');
    return;
  }

  const home = me.role === 'admin' ? 'admin.html' : 'dashboard.html';

  // A page can require a role:  <body data-role="student">  (admins are sent back to their dashboard)
  const need = document.body.dataset.role;
  if (need && me.role !== need) { location.href = home; return; }

  // Elements marked  data-student-only hidden  are shown to students and removed for admins
  document.querySelectorAll('[data-student-only]').forEach(n => me.role === 'student' ? n.removeAttribute('hidden') : n.remove());
  const logo = document.getElementById('logo');
  if (logo) logo.href = home;

  const el = (tag, attrs = {}, kids = []) => {
    const n = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
    kids.forEach(k => n.append(k));
    return n;
  };
  const text = (tag, t) => { const n = document.createElement(tag); n.textContent = t; return n; };
  const link = (label, href) => { const a = el('a', { role: 'menuitem', href }); a.textContent = label; return a; };

  // Avatar button
  const btn = el('button', { class: 'avatar', 'aria-haspopup': 'true', 'aria-expanded': 'false', 'aria-label': 'Account menu' });
  btn.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>';

  // Dropdown
  const who = el('p', { class: 'who' }, [text('b', me.name), text('span', me.email), text('em', me.role === 'admin' ? 'Admin' : 'Student')]);
  const out = link('Log out', '#');
  out.onclick = async e => {
    e.preventDefault();
    try { await fetch('/api/logout', { method: 'POST' }); } catch (x) {}
    location.href = 'index.html';
  };
  // Admins: Notes only. Students: Notes and the quiz.
  const menu = el('div', { class: 'menu hidden', role: 'menu' }, [who, link('Study notes', 'notes.html')]);
  if (me.role === 'student') menu.append(link('Practice', 'practice.html'));
  menu.append(out);

  const wrap = el('div', { class: 'profile' }, [btn, menu]);
  const set = open => { menu.classList.toggle('hidden', !open); btn.setAttribute('aria-expanded', open); };
  btn.onclick = e => { e.stopPropagation(); set(menu.classList.contains('hidden')); };
  document.addEventListener('click', e => { if (!wrap.contains(e.target)) set(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { set(false); btn.focus(); } });

  const cta = document.getElementById('cta');
  if (cta) cta.after(wrap);
  else { document.querySelector('header').append(wrap); wrap.style.marginLeft = 'auto'; }
})();
