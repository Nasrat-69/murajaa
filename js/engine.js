/* Bibliothèque de mots, cartes de révision, génération d'examens / jeux. */
const Engine = (() => {
  const FIELDS = {
    madi: { ar: 'الماضي', fr: 'Passé', isAr: true },
    mud: { ar: 'المضارع', fr: 'Présent', isAr: true },
    amr: { ar: 'الأمر', fr: 'Impératif', isAr: true },
    masdar: { ar: 'المصدر', fr: 'Masdar', isAr: true },
    w: { ar: 'الكلمة', fr: 'Mot', isAr: true },
    fem: { ar: 'المؤنث', fr: 'Féminin', isAr: true },
    pl: { ar: 'الجمع', fr: 'Pluriel', isAr: true },
    syn: { ar: 'المعنى', fr: 'Synonyme', isAr: true },
    ant: { ar: 'العكس', fr: 'Contraire', isAr: true },
    prep: { ar: 'حرف الجر', fr: 'Préposition', isAr: true },
    ex: { ar: 'الجملة المفيدة', fr: 'Phrase', isAr: true },
    fr: { ar: 'الترجمة', fr: 'Traduction', isAr: false },
    note: { ar: 'ملاحظة', fr: 'Note', isAr: false }
  };
  const TYPES = {
    verb: { label: 'Verbe', ar: 'فِعْل', exam: ['madi', 'mud', 'amr', 'masdar', 'fr'], edit: ['madi', 'mud', 'amr', 'masdar', 'prep', 'fr', 'ex', 'note'] },
    noun: { label: 'Nom', ar: 'اِسْم', exam: ['w', 'pl', 'ant', 'fr'], edit: ['w', 'pl', 'syn', 'ant', 'fr', 'ex', 'note'] },
    adj: { label: 'Adjectif', ar: 'صِفَة', exam: ['w', 'fem', 'pl', 'ant', 'fr'], edit: ['w', 'fem', 'pl', 'syn', 'ant', 'fr', 'ex', 'note'] },
    expr: { label: 'Expression', ar: 'عِبَارَة', exam: ['w', 'fr'], edit: ['w', 'fr', 'ex', 'note'] }
  };
  // catégories de questions (révision + jeux)
  const CATS = {
    tr: { label: 'Traduction', icon: '🌍' },
    conj: { label: 'Conjugaison', icon: '🔁' },
    pl: { label: 'Pluriel', icon: '👥' },
    ant: { label: 'Contraires', icon: '↔️' },
    syn: { label: 'Synonymes', icon: '🟰' }
  };
  const KINDS = {
    arfr: { label: 'Arabe → Français', cat: 'tr' },
    frar: { label: 'Français → Arabe', cat: 'tr' },
    forms: { label: 'Conjugaison', cat: 'conj' },
    plural: { label: 'Singulier → Pluriel', cat: 'pl' },
    plural_r: { label: 'Pluriel → Singulier', cat: 'pl' },
    ant: { label: 'Mot → Contraire', cat: 'ant' },
    ant_r: { label: 'Contraire → Mot', cat: 'ant' },
    syn: { label: 'Mot → Synonyme', cat: 'syn' },
    syn_r: { label: 'Synonyme → Mot', cat: 'syn' }
  };
  // centres (markaz) : chacun a ses propres niveaux
  const CENTERS = [
    { id: 'ibaanah', name: 'Al-Ibaanah', ar: 'الإِبَانَة', desc: 'Méthode du centre Al-Ibaanah (Le Caire)' },
    { id: 'furqan', name: 'Al-Furqan', ar: 'الفُرْقَان', desc: 'Méthode du centre Al-Furqan' }
  ];
  const S = () => Store.S;
  let LIB = { decks: [], items: {}, lessons: {} };

  function build() {
    const decks = [...(window.DECKS || []), ...S().decks].slice().sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
    const items = {}, lessons = {};
    const out = decks.map(d => ({
      id: d.id, title: d.title, subtitle: d.subtitle, user: !!d.user, center: d.center || 'ibaanah',
      lessons: (d.lessons || []).map(l => {
        const arr = [];
        const add = (it, id, custom) => {
          if (S().hidden[id]) return;
          const x = Object.assign({}, it, S().edits[id] || {}, { id, lessonId: l.id, deckId: d.id, custom });
          arr.push(x); items[id] = x;
        };
        (l.items || []).forEach((it, i) => add(it, it.id || `${l.id}:${i}`, false));
        (S().custom[l.id] || []).forEach(it => add(it, it.id, true));
        const L = { id: l.id, title: l.title, titleAr: l.titleAr, deckId: d.id, items: arr };
        lessons[l.id] = L;
        return L;
      })
    }));
    LIB = { decks: out, items, lessons };
    return LIB;
  }

  const headF = it => (it.t === 'verb' ? 'madi' : 'w');
  const head = it => it[headF(it)];
  const examFields = it => (TYPES[it.t] || TYPES.expr).exam.filter(f => it[f]);
  const itemsFor = ids => ids.flatMap(id => (LIB.lessons[id] ? LIB.lessons[id].items : []));

  /* ---- cartes ---- */
  function spec(kind, it) {
    const h = headF(it);
    if (!it[h]) return null;
    switch (kind) {
      case 'arfr': return it.fr ? { p: [h], a: ['fr'] } : null;
      case 'frar': return it.fr ? { p: ['fr'], a: [h] } : null;
      case 'forms': return it.t === 'verb' && it.mud ? { p: ['madi'], a: ['mud', 'amr', 'masdar'].filter(f => it[f]) } : null;
      case 'plural': return it.pl ? { p: [h], a: ['pl'] } : null;
      case 'plural_r': return it.pl ? { p: ['pl'], a: [h] } : null;
      case 'ant': return it.ant ? { p: [h], a: ['ant'] } : null;
      case 'ant_r': return it.ant ? { p: ['ant'], a: [h] } : null;
      case 'syn': return it.syn ? { p: [h], a: ['syn'] } : null;
      case 'syn_r': return it.syn ? { p: ['syn'], a: [h] } : null;
    }
    return null;
  }
  function kindsWanted({ dir = 'both', what = {} } = {}) {
    const k = [];
    if (what.tr) { if (dir !== 'fr') k.push('arfr'); if (dir !== 'ar') k.push('frar'); }
    if (what.conj) k.push('forms');
    for (const c of ['pl', 'ant', 'syn']) if (what[c]) {
      const base = c === 'pl' ? 'plural' : c;
      if (dir !== 'fr') k.push(base);
      if (dir !== 'ar') k.push(base + '_r');
    }
    return k;
  }
  function cards(items, prefs) {
    const ks = kindsWanted(prefs), out = [];
    for (const it of items) for (const k of ks) {
      const s = spec(k, it);
      if (s) out.push({ id: it.id + '|' + k, kind: k, item: it, p: s.p, a: s.a });
    }
    return out;
  }
  function catCount(items, cat) {
    const ks = Object.keys(KINDS).filter(k => KINDS[k].cat === cat);
    return items.filter(it => ks.some(k => spec(k, it))).length;
  }
  function srsQueue(list) {
    const now = Date.now(), due = [], fresh = [];
    for (const c of list) {
      const st = S().cards[c.id];
      if (st) { if (st.due <= now) due.push(Object.assign({ due: st.due }, c)); }
      else fresh.push(c);
    }
    due.sort((a, b) => a.due - b.due);
    const limit = Math.max(0, S().settings.newPerDay - Store.newToday());
    const order = { arfr: 0, forms: 1, plural: 1, ant: 1, syn: 1, frar: 2, plural_r: 2, ant_r: 2, syn_r: 2 };
    const nw = fresh.slice(0, limit).map((c, i) => ({ c, i })).sort((a, b) => order[a.c.kind] - order[b.c.kind] || a.i - b.i).map(x => x.c);
    const q = []; let n = 0;
    for (const d of due) { q.push(d); if (++n % 3 === 0 && nw.length) q.push(nw.shift()); }
    return q.concat(nw);
  }
  function srsStats(list) {
    const now = Date.now(); let due = 0, fresh = 0;
    for (const c of list) { const st = S().cards[c.id]; if (!st) fresh++; else if (st.due <= now) due++; }
    return { due, fresh, newAvail: Math.min(fresh, Math.max(0, S().settings.newPerDay - Store.newToday())) };
  }
  function mastery(it) {
    const ks = Object.keys(KINDS).filter(k => spec(k, it));
    if (!ks.length) return 0;
    let s = 0, n = 0;
    for (const k of ks) { const c = S().cards[it.id + '|' + k]; if (c) { s += Math.min(c.ivl, 21) / 21; n++; } }
    // une carte jamais vue compte pour 0, mais on ne pénalise pas les sens rarement révisés
    return n ? s / Math.max(n, Math.min(ks.length, 2)) : 0;
  }
  const lessonMastery = L => (L.items.length ? L.items.reduce((a, it) => a + mastery(it), 0) / L.items.length : 0);
  function enemies(n = 8) {
    return Object.values(LIB.items).map(it => {
      const r = S().items[it.id]; return { it, score: r ? r.err - r.ok * 0.5 : 0, err: r ? r.err : 0 };
    }).filter(x => x.err > 0 && x.score > 0).sort((a, b) => b.score - a.score).slice(0, n).map(x => x.it);
  }

  /* ---- aléatoire reproductible (duels) ---- */
  function rng32(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function shuffle(a, rng = Math.random) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  const keyOf = (f, v) => (FIELDS[f] && FIELDS[f].isAr ? AR.letters(v) : String(v).toLowerCase().trim());

  function distractors(it, f, pool, rng, count) {
    const seen = new Set([keyOf(f, it[f])]), cands = [];
    const push = v => { if (!v) return; const k = keyOf(f, v); if (seen.has(k)) return; seen.add(k); cands.push(v); };
    // même catégorie de champ, de préférence même type de mot
    shuffle(pool.filter(o => o.t === it.t), rng).forEach(o => push(o[f]));
    if (cands.length < count) pool.forEach(o => push(o[f]));
    if (cands.length < count) Object.values(LIB.items).sort((a, b) => (a.id < b.id ? -1 : 1)).forEach(o => push(o[f]));
    // champs voisins (ex. ant ↔ syn ↔ w) si toujours pas assez
    if (cands.length < count) for (const g of ['w', 'syn', 'ant', 'pl', 'madi', 'masdar']) if (FIELDS[g].isAr === FIELDS[f].isAr) pool.forEach(o => push(o[g]));
    return shuffle(cands, rng).slice(0, count);
  }
  function options(it, f, pool, rng) {
    let opts = [];
    if (f === 'mud' && it.madi && AR.letters(AR.alts(it.madi)[0]).length === 3) {
      const v = AR.ainVariants(AR.alts(it.mud)[0] || it.mud);   // piège : autre voyelle de la ʿayn
      opts = shuffle(v, rng).slice(0, rng() < 0.5 ? 1 : 2);
    }
    opts = opts.concat(distractors(it, f, pool, rng, 3 - opts.length));
    return shuffle([it[f], ...opts], rng);
  }

  function makeExam(items, { n = 15, rng = Math.random } = {}) {
    const usable = items.filter(it => examFields(it).length >= 2);
    if (!usable.length) return [];
    const order = shuffle(usable.slice(), rng);
    const count = n === 'all' ? usable.length : Math.min(+n, usable.length);
    const qs = [];
    for (let i = 0; i < count; i++) {
      const it = order[i], fs = examFields(it);
      const given = fs[Math.floor(rng() * fs.length)];
      const hidden = fs.filter(f => f !== given);
      const opts = {}; hidden.forEach(f => { opts[f] = options(it, f, usable, rng); });
      qs.push({ item: it, given, hidden, options: opts });
    }
    return qs;
  }
  // questions d'examen à partir de cartes (modes Écrire / QCM)
  function qsFromCards(list, rng = Math.random) {
    const pool = [...new Set(list.map(c => c.item))];
    return list.map(c => {
      const opts = {}; c.a.forEach(f => { opts[f] = options(c.item, f, pool, rng); });
      return { item: c.item, given: c.p[0], hidden: c.a, options: opts, kind: c.kind };
    });
  }

  /* ---- jeux ---- */
  const PAIRS = {
    tr: [['w', 'fr'], ['fr', 'w'], ['madi', 'fr'], ['fr', 'madi']],
    conj: [['madi', 'mud'], ['madi', 'masdar'], ['madi', 'amr'], ['masdar', 'madi'], ['mud', 'amr']],
    pl: [['w', 'pl'], ['pl', 'w']],
    ant: [['w', 'ant'], ['ant', 'w']],
    syn: [['w', 'syn'], ['syn', 'w']]
  };
  const pairsFor = what => Object.keys(PAIRS).filter(k => what[k]).flatMap(k => PAIRS[k]);
  function pick(items, pairs, rng, filter) {
    for (let tries = 0; tries < 80; tries++) {
      const it = items[Math.floor(rng() * items.length)];
      const ok = pairs.filter(([a, b]) => it[a] && it[b] && (!filter || filter(it, a, b)));
      if (ok.length) { const [a, b] = ok[Math.floor(rng() * ok.length)]; return { it, a, b }; }
    }
    return null;
  }
  const playable = (items, pairs) => items.filter(it => pairs.some(([a, b]) => it[a] && it[b]));
  function gameQ(items, pairs, rng = Math.random, last) {
    let p = pick(items, pairs, rng);
    if (p && last && p.it.id === last && items.length > 2) p = pick(items, pairs, rng) || p;
    if (!p) return null;
    const opts = options(p.it, p.b, items, rng);
    return { item: p.it, from: p.a, to: p.b, options: opts, answer: p.it[p.b] };
  }
  function tfQ(items, pairs, rng = Math.random) {
    const p = pick(items, pairs, rng); if (!p) return null;
    const truth = rng() < 0.5;
    let shown = p.it[p.b];
    if (!truth) {
      const d = p.b === 'mud' && rng() < 0.5 ? AR.ainVariants(p.it.mud) : [];
      shown = d.length ? d[0] : (distractors(p.it, p.b, items, rng, 1)[0]);
      if (!shown) return { item: p.it, from: p.a, to: p.b, shown: p.it[p.b], truth: true };
    }
    return { item: p.it, from: p.a, to: p.b, shown, truth };
  }
  function anagramQ(items, what, rng = Math.random, last) {
    const pairs = pairsFor(what).filter(([, b]) => FIELDS[b].isAr);
    const target = (it, b) => AR.strip(AR.alts(it[b])[0] || '');
    const p = pick(items, pairs, rng, (it, a, b) => { const t = target(it, b); return t.length >= 2 && t.length <= 9 && !/\s/.test(t) && it.id !== last; })
      || pick(items, pairs, rng, (it, a, b) => { const t = target(it, b); return t.length >= 2 && t.length <= 9 && !/\s/.test(t); });
    if (!p) return null;
    const t = [...target(p.it, p.b)];
    let tiles = t.map((ch, k) => ({ ch, k }));
    for (let i = 0; i < 5; i++) { shuffle(tiles, rng); if (tiles.some((x, j) => x.k !== j)) break; }
    return { item: p.it, from: p.a, to: p.b, target: t.join(''), letters: t, tiles };
  }

  /* ---- codes de duel ---- */
  function enc(obj, prefix) {
    const s = btoa(unescape(encodeURIComponent(JSON.stringify(obj)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return prefix + s;
  }
  function dec(code, prefix) {
    code = String(code || '').trim();
    if (code.includes('#duel=')) code = code.split('#duel=')[1];
    const at = code.indexOf(prefix);
    if (at < 0) return null;
    let s = code.slice(at + prefix.length).split(/\s/)[0].replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    try { return JSON.parse(decodeURIComponent(escape(atob(s)))); } catch (e) { return null; }
  }

  return {
    FIELDS, TYPES, CATS, KINDS, PAIRS, CENTERS, build, get LIB() { return LIB; }, head, headF, examFields, itemsFor,
    spec, cards, catCount, srsQueue, srsStats, mastery, lessonMastery, enemies, rng32, shuffle,
    makeExam, qsFromCards, pairsFor, playable, gameQ, tfQ, anagramQ, enc, dec
  };
})();
