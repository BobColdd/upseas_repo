// Login page behaviour only. All the text lives in login.html.
const $ = id => document.getElementById(id);
const say = (text, isError) => { $('msg').textContent = text; $('msg').className = 'msg' + (isError ? ' err' : ''); };

// Error messages (edit the wording here)
const ERR = {
  invalid:  'Incorrect email / student ID or password.',
  too_many: 'Too many attempts. Please wait a few minutes and try again.',
  failed:   'Could not log you in. Please try again.',
  network:  'Could not reach the server. Check your connection and try again.'
};

// Show / hide password
$('toggle').onclick = () => {
  const p = $('password'), show = p.type === 'password';
  p.type = show ? 'text' : 'password';
  $('toggle').textContent = show ? 'Hide' : 'Show';
  $('toggle').setAttribute('aria-pressed', show);
};

$('form').onsubmit = async e => {
  e.preventDefault();
  const who = $('login').value.trim(), password = $('password').value;
  if (!who) return say('Enter your email or student ID.', true);
  if (!password) return say('Enter your password.', true);

  const btn = $('submit');
  btn.disabled = true; say('');
  try {
    const next = new URLSearchParams(location.search).get('next');
    const r = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: who, password, next })
    });
    const out = await r.json().catch(() => ({}));
    if (!r.ok) { say(ERR[out.error] || ERR.failed, true); btn.disabled = false; return; }
    location.href = out.redirect;
  } catch (x) {
    say(ERR.network, true); btn.disabled = false;
  }
};
