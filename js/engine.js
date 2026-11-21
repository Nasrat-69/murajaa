/* Bibliothèque de mots, files de révision, génération d'examens / jeux. */
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
  const KINDS = {
    arfr: 'Arabe → Français', frar: 'Français → Arabe', forms: 'Conjugaison (مضارع · أمر · مصدر)', plural: 'Pluriel (الجمع)'
  };
  const S = () => Store.S;
  let LIB = { decks: [], items: {}, lessons: {} };

  function build() {
    const decks = [...(window.DECKS || []), ...S().decks].slice().sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
    const items = {}, lessons = {};
    const out = decks.map(d => ({
      id: d.id, title: d.title, subtitle: d.subtitle, user: !!d.user,
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

  const head = it => (it.t === 'verb' ? it.madi : it.w);
  const examFields = it => (TYPES[it.t] || TYPES.expr).exam.filter(f => it[f]);
  const itemsFor = ids => ids.flatMap(id => (LIB.lessons[id] ? LIB.lessons[id].items : []));
  function allKinds(it) {
    if (it.t === 'verb') return ['arfr', 'frar', 'forms'];
    return it.pl ? ['arfr', 'frar', 'plural'] : ['arfr', 'frar'];
  }
  const kindsFor = it => allKinds(it).filter(k => S().settings.kinds[k] !== false);

  function reviewQueue(ids) {
    const now = Date.now(), due = [], fresh = [];
    for (const it of itemsFor(ids)) for (const k of kindsFor(it)) {
      const id = it.id + '|' + k, c = S().cards[id];
      if (c) { if (c.due <= now) due.push({ id, kind: k, item: it, due: c.due }); }
      else fresh.push({ id, kind: k, item: it });
    }
    due.sort((a, b) => a.due - b.due);
    const limit = Math.max(0, S().settings.newPerDay - Store.newToday());
    const order = { arfr: 0, forms: 1, plural: 1, frar: 2 };
    const nw = fresh.slice(0, limit).map((c, i) => ({ c, i })).sort((a, b) => order[a.c.kind] - order[b.c.kind] || a.i - b.i).map(x => x.c);
    // mélange : une nouvelle carte toutes les 3 cartes dues
    const q = []; let n = 0;
    for (const d of due) { q.push(d); if (++n % 3 === 0 && nw.length) q.push(nw.shift()); }
    return q.concat(nw);
  }
  function stats(ids) {
    const now = Date.now(); let due = 0, fresh = 0;
    for (const it of itemsFor(ids)) for (const k of kindsFor(it)) {
      const c = S().cards[it.id + '|' + k];
      if (!c) fresh++; else if (c.due <= now) due++;
    }
    return { due, fresh, newAvail: Math.min(fresh, Math.max(0, S().settings.newPerDay - Store.newToday())) };
  }
  function mastery(it) {
    const ks = allKinds(it); let s = 0;
    for (const k of ks) { const c = S().cards[it.id + '|' + k]; if (c) s += Math.min(c.ivl, 21) / 21; }
    return s / ks.length;
  }
  const lessonMastery = L => (L.items.length ? L.items.reduce((a, it) => a + mastery(it), 0) / L.items.length : 0);
  function enemies(n = 8) {
    return Object.values(LIB.items).map(it => {
      const r = S().items[it.id]; return { it, score: r ? r.err - r.ok * 0.5 : 0, err: r ? r.err : 0 };
    }).filter(x => x.err > 0 && x.score > 0).sort((a, b) => b.score - a.score).slice(0, n).map(x => x.it);
  }

  /* ---- aléatoire reproductible (pour les duels) ---- */
  function rng32(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function shuffle(a, rng = Math.random) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  const keyOf = (f, v) => (FIELDS[f] && FIELDS[f].isAr ? AR.letters(v) : String(v).toLowerCase().trim());

  function distractors(it, f, pool, rng, count) {
    const correct = it[f];
    const seen = new Set([keyOf(f, correct)]), cands = [];
    const push = v => { if (!v) return; const k = keyOf(f, v); if (seen.has(k)) return; seen.add(k); cands.push(v); };
    pool.forEach(o => push(o[f]));
    if (cands.length < count) Object.values(LIB.items).sort((a, b) => (a.id < b.id ? -1 : 1)).forEach(o => push(o[f]));
    return shuffle(cands, rng).slice(0, count);
  }
  function options(it, f, pool, rng) {
    let opts = [];
    if (f === 'mud' && it.madi && AR.letters(AR.alts(it.madi)[0]).length === 3) {
      // piège : même verbe avec une autre voyelle de la ʿayn
      const v = AR.ainVariants(AR.alts(it.mud)[0] || it.mud);
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

  const RUSH_PAIRS = [['w', 'fr'], ['fr', 'w'], ['madi', 'fr'], ['fr', 'madi'], ['madi', 'masdar'], ['madi', 'mud'], ['masdar', 'madi'], ['w', 'pl'], ['w', 'ant']];
  function rushQ(items, rng = Math.random) {
    for (let tries = 0; tries < 50; tries++) {
      const it = items[Math.floor(rng() * items.length)];
      const ok = RUSH_PAIRS.filter(([a, b]) => it[a] && it[b]);
      if (!ok.length) continue;
      const [a, b] = ok[Math.floor(rng() * ok.length)];
      const opts = b === 'mud' ? options(it, 'mud', items, rng) : shuffle([it[b], ...distractors(it, b, items, rng, 3)], rng);
      if (opts.length < 2) continue;
      return { item: it, from: a, to: b, options: opts, answer: it[b] };
    }
    return null;
  }

  const MATCH_TYPES = [['madi', 'masdar', 'Passé ↔ Masdar'], ['w', 'fr', 'Mot ↔ Traduction'], ['madi', 'fr', 'Verbe ↔ Traduction'], ['w', 'pl', 'Singulier ↔ Pluriel'], ['madi', 'mud', 'Passé ↔ Présent'], ['mud', 'amr', 'Présent ↔ Impératif']];
  function matchRound(items, rng = Math.random) {
    const types = shuffle(MATCH_TYPES.slice(), rng);
    for (const [a, b, label] of types) {
      const seenA = new Set(), seenB = new Set(), pick = [];
      for (const it of shuffle(items.filter(x => x[a] && x[b]), rng)) {
        const ka = keyOf(a, it[a]), kb = keyOf(b, it[b]);
        if (seenA.has(ka) || seenB.has(kb)) continue;
        seenA.add(ka); seenB.add(kb); pick.push(it);
        if (pick.length === 6) break;
      }
      if (pick.length >= 4) {
        return {
          label, a, b, n: pick.length,
          left: shuffle(pick.map(it => ({ id: it.id, text: it[a] })), rng),
          right: shuffle(pick.map(it => ({ id: it.id, text: it[b] })), rng)
        };
      }
    }
    return null;
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
    FIELDS, TYPES, KINDS, build, get LIB() { return LIB; }, head, examFields, itemsFor, kindsFor, allKinds,
    reviewQueue, stats, mastery, lessonMastery, enemies, rng32, shuffle, makeExam, rushQ, matchRound, enc, dec
  };
})();
