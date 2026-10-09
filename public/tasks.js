// Shared helpers for the student pages (dashboard + practice): skill icons, due dates, task status.
const BRAND = 'UPSEAS CONSULTANTS';   // used on the full-screen exam header (the other pages hold it in their HTML)
const TK = {
  skills: {
    reading:   { name: 'Reading',   time: '60 min',       icon: '<path d="M3 5h8a3 3 0 0 1 1 1v14a3 3 0 0 0-1-1H3zM21 5h-8a3 3 0 0 0-1 1v14a3 3 0 0 1 1-1h8z"/>' },
    listening: { name: 'Listening', time: 'About 30 min', icon: '<path d="M4 14v-2a8 8 0 0 1 16 0v2M4 14h3v6H4zM17 14h3v6h-3z"/>' },
    writing:   { name: 'Writing',   time: '60 min',       icon: '<path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"/>' },
    speaking:  { name: 'Speaking',  time: '11–14 min',    icon: '<path d="M4 5h16v11H9l-5 4z"/><path d="M9 10h.01M12 10h.01M15 10h.01"/>' }
  },
  icon: s => '<svg class="i" viewBox="0 0 24 24" aria-hidden="true">' + ((TK.skills[s] || TK.skills.reading).icon) + '</svg>',
  name: s => (TK.skills[s] || {}).name || s || 'Task',
  time: s => (TK.skills[s] || {}).time || '',
  // "due" is whatever the admin typed; show it nicely if it parses as a date, otherwise as typed
  due(t) {
    if (!t.due) return { label: '', overdue: false, ts: Infinity };
    const d = new Date(t.due);
    if (isNaN(d)) return { label: String(t.due), overdue: false, ts: Infinity };
    return { label: d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }),
             overdue: d.getTime() + 864e5 < Date.now(), ts: d.getTime() };
  },
  state: t => t.submitted ? 'done' : TK.due(t).overdue ? 'late' : 'todo',
  stateLabel: { done: 'Submitted', late: 'Overdue', todo: 'To do' },
  // to-do first (soonest due first), submitted last
  sort: list => [...list].sort((a, b) => (a.submitted - b.submitted) || (TK.due(a).ts - TK.due(b).ts)),
  async load() {
    const r = await fetch('/api/my/tasks');
    if (!r.ok) throw new Error('tasks');
    return (await r.json()).tasks || [];
  },
  day: iso => iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : ''
};
