// Notes page behaviour only: switches between the overview cards and one skill's notes.
// All the text lives in notes.html.
const SKILLS = ['listening', 'reading', 'writing', 'speaking'];

function showSkill(id) {
  const one = SKILLS.includes(id);
  document.getElementById('overview').hidden = one;
  SKILLS.forEach(s => { document.getElementById('panel-' + s).hidden = s !== id; });
  history.replaceState(null, '', one ? '?skill=' + id : location.pathname);
  window.scrollTo({ top: 0 });
}

showSkill(new URLSearchParams(location.search).get('skill'));
