/* Page shell: account menu, who-sees-what, and page protection. Needs no JSON files.

   <body data-auth="required">   -> logged-out visitors are sent to the login page
   <body data-role="student">    -> other roles are sent to their own page
   Any element can carry one of these (and "hidden"):
     data-guest-only   shown to logged-out visitors
     data-user-only    shown to anyone logged in
     data-student-only shown to students
     data-admin-only   shown to admins
   Others are removed from the page.  */
(async () => {
  const body = document.body;
  const here = location.pathname.split('/').pop() || 'index.html';
  let me = null;
  try { const r = await fetch('/api/me'); if (r.ok) me = await r.json(); } catch (e) {}
  const role = me ? me.role : null;

  if (body.dataset.auth === 'required' && !me) { location.href = 'login.html?next=' + encodeURIComponent(here); return; }
  const home = role === 'admin' ? 'admin.html' : 'dashboard.html';
  if (me && body.dataset.role && body.dataset.role !== role) { location.href = home; return; }

  // who sees what
  const show = { 'guest-only': !me, 'user-only': !!me, 'student-only': role === 'student', 'admin-only': role === 'admin' };
  Object.entries(show).forEach(([k, ok]) =>
    document.querySelectorAll('[data-' + k + ']').forEach(n => ok ? n.removeAttribute('hidden') : n.remove()));

  // current page highlight (top menu and side menu)
  document.querySelectorAll('.topbar nav a, .side a').forEach(a => {
    if (a.getAttribute('href') === here) a.setAttribute('aria-current', 'page');
  });
  const logo = document.getElementById('logo');
  if (logo && role) logo.href = home;   // logged-in users: the logo goes to their dashboard (Home tab = public home page)

  // account area
  const box = document.getElementById('user');
  if (!box) return;
  const el = (tag, attrs = {}, kids = []) => {
    const n = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
    kids.forEach(k => n.append(k));
    return n;
  };
  const txt = (tag, t) => { const n = document.createElement(tag); n.textContent = t; return n; };
  const link = (label, href) => { const a = el('a', { role: 'menuitem', href }); a.textContent = label; return a; };

  if (!me) {                                         // guest
    if (body.dataset.page !== 'login') { const a = el('a', { class: 'btn', href: 'login.html' }); a.textContent = 'Log in'; box.append(a); }
    return;
  }
  const avatar = txt('span', (me.name || me.email || '?').trim().charAt(0).toUpperCase()); avatar.className = 'avatar';
  const btn = el('button', { class: 'ubtn', 'aria-haspopup': 'true', 'aria-expanded': 'false' }, [avatar, txt('span', me.name)]);
  const who = el('p', { class: 'who', style: 'margin:0' }, [txt('b', me.name), txt('span', me.email), ...(me.code ? [txt('span', me.code)] : []), txt('em', role === 'admin' ? 'Admin' : 'Student')]);
  const out = link('Log out', '#');
  out.onclick = async e => {
    e.preventDefault();
    try { await fetch('/api/logout', { method: 'POST' }); } catch (x) {}
    location.href = 'index.html';
  };
  // Admins: Dashboard and Notes. Students: Dashboard, Practice and Notes. (No Home link after login.)
  const menu = el('div', { class: 'menu', role: 'menu', hidden: '' }, [who]);
  if (role === 'student') menu.append(link('Dashboard', 'dashboard.html'), link('Practice', 'practice.html'));
  if (role === 'admin') menu.append(link('Dashboard', 'admin.html'));
  menu.append(link('Notes', 'notes.html'));
  menu.append(out);

  const set = open => { menu.hidden = !open; btn.setAttribute('aria-expanded', open); };
  btn.onclick = e => { e.stopPropagation(); set(menu.hidden); };
  document.addEventListener('click', e => { if (!box.contains(e.target)) set(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { set(false); btn.focus(); } });
  box.append(btn, menu);
})();
