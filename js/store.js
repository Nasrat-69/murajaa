/* Persistance locale + répétition espacée + XP. Tout reste dans le navigateur (localStorage). */
const Store = (() => {
  const KEY = 'murajaa.v1';
  const MIN = 60000, DAY = 86400000;
  const defaults = () => ({
    v: 1, name: '',
    settings: { harakat: 'none', newPerDay: 20, theme: 'auto', osk: false,
      kinds: { arfr: true, frar: true, forms: true, plural: true } },
    exam: { n: 15, mode: 'qcm', boss: false },
    sel: [], cards: {}, items: {}, edits: {}, hidden: {}, custom: {}, decks: [],
    xp: 0, days: {}, best: { rush: 0, match: 0 }, newLog: {}, duels: []
  });
  let S = defaults();

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
      const d = defaults();
      S = Object.assign(d, raw);
      S.settings = Object.assign(d.settings, raw.settings || {});
      S.settings.kinds = Object.assign(defaults().settings.kinds, (raw.settings || {}).kinds || {});
      S.exam = Object.assign(defaults().exam, raw.exam || {});
      S.best = Object.assign(defaults().best, raw.best || {});
    } catch (e) { S = defaults(); }
  }
  let t = null;
  const save = () => { clearTimeout(t); t = setTimeout(saveNow, 120); };
  function saveNow() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { console.warn('save', e); } }
  window.addEventListener('beforeunload', saveNow);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });

  const today = (d = new Date()) => {
    const z = new Date(d.getTime() - d.getTimezoneOffset() * MIN);
    return z.toISOString().slice(0, 10);
  };
  function dayRec() { const d = today(); return (S.days[d] = S.days[d] || { xp: 0, n: 0 }); }
  function addXP(n) { S.xp += n; dayRec().xp += n; save(); }
  function streak() {
    const d = new Date(); let n = 0;
    if (!S.days[today(d)]) d.setDate(d.getDate() - 1);
    while (S.days[today(d)]) { n++; d.setDate(d.getDate() - 1); }
    return n;
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
    S.cards[id] = c; dayRec().n++; save();
  }
  function preview(id, g) {
    const c = nextState(S.cards[id], g);
    if (g === 1) return '10 min';
    const d = c.ivl;
    return d < 30 ? Math.round(d) + ' j' : d < 365 ? Math.round(d / 30) + ' mois' : (d / 365).toFixed(1) + ' an';
  }
  // résultat d'examen / jeu : statistiques + une erreur ramène le mot en révision
  function answer(itemId, ok) {
    const r = (S.items[itemId] = S.items[itemId] || { ok: 0, err: 0 });
    if (ok) r.ok++; else {
      r.err++;
      const now = Date.now();
      for (const k in S.cards) if (k.startsWith(itemId + '|')) S.cards[k].due = Math.min(S.cards[k].due, now);
    }
    dayRec().n++; save();
  }

  load();
  return { get S() { return S; }, set S(v) { S = v; }, save, saveNow, load, defaults, today, addXP, streak, level, newToday, grade, preview, answer, KEY };
})();
