/* Persistance locale + répétition espacée + XP + historique. Tout reste dans le navigateur ;
   si un compte est connecté, cloud.js synchronise ce même objet. */
const Store = (() => {
  const KEY = 'murajaa.v1';
  const MIN = 60000, DAY = 86400000;
  const defaults = () => ({
    v: 1, name: '', updatedAt: 0, center: 'ibaanah',
    settings: { harakat: 'none', newPerDay: 20, theme: 'auto', osk: false, sound: true, goal: 60, lang: (navigator.language || 'fr').slice(0, 2) === 'ru' ? 'ru' : (navigator.language || 'fr').slice(0, 2) === 'en' ? 'en' : 'fr' },
    exam: { n: 15, mode: 'qcm', boss: false },
    rev: { mode: 'flip', which: 'due', order: 'random', dir: 'both', n: 20, ans: 'type', what: { tr: true, conj: true, pl: true, ant: false, syn: false, prep: false } },
    game: { what: { tr: true, conj: true, pl: true, ant: true, syn: true, prep: true }, dur: 15, choices: 4, n: 10, speed: 'normal' },
    live: { n: 10, parts: 'mix', mode: 'qcm', time: 30, adv: 'auto', which: 'all', order: 'random', dir: 'both', what: { tr: true, conj: true, pl: true, ant: false, syn: false, prep: false } },
    paper: { sections: ['tr', 'conj', 'pl', 'antsyn', 'prep', 'sent'], size: 8, mode: 'type', timer: 0, order: 'random' },
    exams: [],
    sel: [], cards: {}, items: {}, edits: {}, hidden: {}, custom: {}, decks: [],
    xp: 0, days: {}, best: { rush: 0, tf: 0, rain: 0, anagram: 0 }, newLog: {}, duels: [],
    rivals: {}, liveDone: []
  });
  let S = defaults();
  let onSave = null;

  function normalize(raw) {
    const d = defaults();
    const s = Object.assign(d, raw || {});
    s.settings = Object.assign(defaults().settings, (raw || {}).settings || {});
    delete s.settings.kinds;
    s.exam = Object.assign(defaults().exam, (raw || {}).exam || {});
    s.rev = Object.assign(defaults().rev, (raw || {}).rev || {});
    s.rev.what = Object.assign(defaults().rev.what, ((raw || {}).rev || {}).what || {});
    if (s.rev.mode === 'srs') { s.rev.mode = 'flip'; s.rev.which = 'due'; }
    const g = (raw || {}).game || {};
    s.game = Object.assign(defaults().game, g, { what: Object.assign(defaults().game.what, g.what || {}) });
    if (!g.v2) { if (s.game.dur === 60) s.game.dur = 15; s.game.v2 = true; }
    s.live = Object.assign(defaults().live, (raw || {}).live || {});
    s.live.what = Object.assign(defaults().live.what, ((raw || {}).live || {}).what || {});
    s.paper = Object.assign(defaults().paper, (raw || {}).paper || {});
    s.exams = (raw || {}).exams || [];
    s.best = Object.assign(defaults().best, (raw || {}).best || {});
    delete s.best.match;
    return s;
  }
  function load() {
    try { S = normalize(JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { S = defaults(); }
  }
  let t = null;
  const save = () => { S.updatedAt = Date.now(); clearTimeout(t); t = setTimeout(saveNow, 120); };
  function saveNow() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { console.warn('save', e); }
    if (onSave) onSave();
  }
  window.addEventListener('beforeunload', () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* plein */ } });
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });

  /* fusion de deux progressions (appareil ↔ compte) */
  function merge(a, b) {
    const newer = (a.updatedAt || 0) >= (b.updatedAt || 0) ? a : b, older = newer === a ? b : a;
    const m = normalize(JSON.parse(JSON.stringify(newer)));
    for (const [k, c] of Object.entries(older.cards || {})) { const n = m.cards[k]; if (!n || (c.last || 0) > (n.last || 0)) m.cards[k] = c; }
    for (const [k, c] of Object.entries(older.items || {})) { const n = m.items[k]; m.items[k] = n ? { ok: Math.max(n.ok, c.ok), err: Math.max(n.err, c.err) } : c; }
    for (const [k, c] of Object.entries(older.days || {})) {
      const n = m.days[k];
      m.days[k] = n ? { xp: Math.max(n.xp || 0, c.xp || 0), n: Math.max(n.n || 0, c.n || 0), ok: Math.max(n.ok || 0, c.ok || 0), err: Math.max(n.err || 0, c.err || 0) } : c;
    }
    for (const [k, v] of Object.entries(older.best || {})) m.best[k] = Math.max(m.best[k] || 0, v || 0);
    for (const [k, v] of Object.entries(older.rivals || {})) if (!m.rivals[k] || (v.at || 0) > (m.rivals[k].at || 0)) m.rivals[k] = v;
    m.liveDone = [...new Set([...(m.liveDone || []), ...(older.liveDone || [])])].slice(-200);
    const ex = {}; [...(older.exams || []), ...(m.exams || [])].forEach(e => { ex[e.at] = e; });
    m.exams = Object.values(ex).sort((a, b) => a.at - b.at).slice(-100);
    m.xp = Math.max(a.xp || 0, b.xp || 0);
    m.name = m.name || older.name;
    m.updatedAt = Math.max(a.updatedAt || 0, b.updatedAt || 0);
    return m;
  }
  function replace(next) { S = normalize(next); try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* plein */ } }

  const today = (d = new Date()) => {
    const z = new Date(d.getTime() - d.getTimezoneOffset() * MIN);
    return z.toISOString().slice(0, 10);
  };
  function dayRec() { const d = today(); return (S.days[d] = S.days[d] || { xp: 0, n: 0, ok: 0, err: 0 }); }
  function addXP(n) { S.xp += n; dayRec().xp += n; save(); }
  function streak() {
    const d = new Date(); let n = 0;
    if (!S.days[today(d)]) d.setDate(d.getDate() - 1);
    while (S.days[today(d)]) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  function bestStreak() {
    const ks = Object.keys(S.days).sort(); let best = 0, cur = 0, prev = null;
    for (const k of ks) {
      const d = new Date(k + 'T12:00:00');
      cur = prev && Math.round((d - prev) / DAY) === 1 ? cur + 1 : 1;
      best = Math.max(best, cur); prev = d;
    }
    return best;
  }
  function level(xp = S.xp) {
    const lvl = Math.floor(Math.sqrt(xp / 40)) + 1;
    const a = (lvl - 1) ** 2 * 40, b = lvl ** 2 * 40;
    return { lvl, pct: Math.round((xp - a) / (b - a) * 100), next: b - xp };
  }
  const newToday = () => S.newLog[today()] || 0;

  /* ---- Répétition espacée (style Anki / SM-2) ---- */
  function nextState(c, g) {
    const now = Date.now();
    c = c ? Object.assign({}, c) : { ivl: 0, ease: 2.5, reps: 0, lapses: 0 };
    if (g === 1) {
      if (c.reps > 0) c.lapses++;
      c.ease = Math.max(1.3, c.ease - 0.2); c.ivl = 0; c.due = now + 10 * MIN;
    } else {
      if (g === 2) { c.ivl = c.ivl < 1 ? 1 : c.ivl * 1.2; c.ease = Math.max(1.3, c.ease - 0.15); }
      if (g === 3) { c.ivl = c.ivl < 1 ? 1 : c.ivl < 3 ? 3 : c.ivl * c.ease; }
      if (g === 4) { c.ivl = c.ivl < 1 ? 4 : c.ivl * c.ease * 1.3; c.ease += 0.15; }
      c.due = now + c.ivl * DAY;
    }
    c.reps++; c.last = now;
    return c;
  }
  function grade(id, g) {
    if (!S.cards[id]) S.newLog[today()] = newToday() + 1;
    const c = nextState(S.cards[id], g);
    if (c.ivl > 3) { c.ivl *= 0.95 + Math.random() * 0.1; c.due = Date.now() + c.ivl * DAY; }
    S.cards[id] = c;
    const r = dayRec(); r.n++; if (g >= 3) r.ok++; else if (g === 1) r.err++;
    save();
  }
  function preview(id, g) {
    const c = nextState(S.cards[id], g);
    if (g === 1) return '10 min';
    const d = c.ivl;
    return d < 30 ? Math.round(d) + ' j' : d < 365 ? Math.round(d / 30) + ' mois' : (d / 365).toFixed(1) + ' an';
  }
  // résultat d'examen / jeu : statistiques + une erreur ramène le mot en révision
  // « À revoir » / « Difficile » : le mot va dans la liste des mots difficiles
  function markHard(itemId) { const r = (S.items[itemId] = S.items[itemId] || { ok: 0, err: 0 }); r.err++; save(); }
  // « je le sais maintenant » : le mot sort de la liste des mots à revoir
  function clearWeak(itemId) { const r = S.items[itemId]; if (r) { r.ok = Math.max(r.ok, r.err * 2); save(); } }
  function markOk(itemId) { const r = (S.items[itemId] = S.items[itemId] || { ok: 0, err: 0 }); r.ok++; save(); }
  function answer(itemId, ok) {
    const r = (S.items[itemId] = S.items[itemId] || { ok: 0, err: 0 });
    const d = dayRec(); d.n++;
    if (ok) { r.ok++; d.ok++; } else {
      r.err++; d.err++;
      const now = Date.now();
      for (const k in S.cards) if (k.startsWith(itemId + '|')) S.cards[k].due = Math.min(S.cards[k].due, now);
    }
    save();
  }

  load();
  return {
    get S() { return S; }, set S(v) { S = v; }, set onSave(f) { onSave = f; },
    save, saveNow, load, defaults, normalize, merge, replace, today, addXP, streak, bestStreak, level, newToday, grade, preview, answer, markHard, markOk, clearWeak, KEY
  };
})();
