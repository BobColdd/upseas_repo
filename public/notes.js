// Notes page behaviour only: switches between the four skill tabs. All the text lives in notes.html.
const SKILLS = ['listening', 'reading', 'writing', 'speaking'];

function showSkill(id) {
  if (!SKILLS.includes(id)) id = SKILLS[0];
  SKILLS.forEach(s => {
    document.getElementById('panel-' + s).hidden = s !== id;
    document.getElementById('tab-' + s).setAttribute('aria-pressed', s === id);
  });
  history.replaceState(null, '', '?skill=' + id);
}

showSkill(new URLSearchParams(location.search).get('skill'));
