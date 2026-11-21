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
    blank: { ar: 'الكلمة الناقصة', fr: 'Mot manquant', isAr: true },
    exBlank: { ar: 'الجملة', fr: 'Phrase', isAr: true },
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
    tr: { label: 'Traduction' },
    conj: { label: 'Conjugaison' },
    pl: { label: 'Pluriel' },
    ant: { label: 'Contraires' },
    syn: { label: 'Synonymes' },
    prep: { label: 'Prépositions', hint: 'ذهب + إلى' }
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
  for (let i = 0; i < 4; i++) KINDS['prep' + i] = { label: 'Verbe → حرف الجر', cat: 'prep' };
  // centres (markaz) : chacun a ses propres niveaux
  const CENTERS = [
    { id: 'ibaanah', name: 'Al-Ibaanah', ar: 'الإِبَانَة', desc: 'Méthode du centre Al-Ibaanah (Le Caire)' },
    { id: 'furqan', name: 'Al-Furqan', ar: 'الفُرْقَان', desc: 'Méthode du centre Al-Furqan' }
  ];
  const HURUF = ['إِلَى', 'مِنْ', 'فِي', 'عَلَى', 'عَنْ', 'بِـ', 'لِـ', 'مَعَ'];
  const S = () => Store.S;
  let LIB = { decks: [], items: {}, lessons: {} };

  function build() {
    const decks = [...(window.DECKS || []), ...S().decks].slice().sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
    const items = {}, lessons = {};
    const out = decks.map(d => ({
      id: d.id, title: d.title, subtitle: d.subtitle, user: !!d.user, center: d.center || 'ibaanah',
      lessons: (d.lessons || []).map(l => {
        const arr = [];
        // la base du livre est fixe : seules les données perso peuvent être modifiées ou supprimées
        const add = (it, id, custom, own) => {
          const mine = custom || own;
          if (mine && S().hidden[id]) return;
          const x = Object.assign({}, it, mine ? (S().edits[id] || {}) : {}, { id, lessonId: l.id, deckId: d.id, custom });
          arr.push(x); items[id] = x;
        };
        (l.items || []).forEach((it, i) => { if (d.user && !it.id) it.id = `${l.id}:${i}`; add(it, it.id || `${l.id}:${i}`, false, !!d.user); });
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

  /* ---- prépositions : « إِلَى = aller vers / مِنْ = venir de » ---- */
  function parsePreps(it) {
    if (!it.prep) return [];
    return String(it.prep).split(/\s*[\/؛;]\s*/).map(s => {
      const m = s.match(/^(.*?)\s*(?:=|\(|:)\s*(.*?)\)?\s*$/);
      const p = (m ? m[1] : s).trim(), fr = m ? m[2].trim() : '';
      return p ? { p, fr } : null;
    }).filter(Boolean);
  }
  // une copie du mot par préposition (pour les jeux et les examens)
  function expandPreps(items) {
    const out = [];
    for (const it of items) {
      const ps = parsePreps(it);
      if (ps.length <= 1) out.push(ps.length ? Object.assign({}, it, { prep: ps[0].p, prepFr: ps[0].fr }) : it);
      else ps.forEach((e, i) => out.push(Object.assign({}, it, { prep: e.p, prepFr: e.fr, fr: e.fr || it.fr, vid: it.id + '#' + i })));
    }
    return out;
  }

  /* ---- cartes ---- */
  function spec(kind, it) {
    const h = headF(it);
    if (!it[h]) return null;
    const pm = kind.match(/^prep(\d)$/);
    if (pm) {
      if (it.t !== 'verb') return null;
      const e = parsePreps(it)[+pm[1]];
      return e ? { p: [h], a: ['prep'], item: Object.assign({}, it, { prep: e.p, prepFr: e.fr, fr: e.fr || it.fr }) } : null;
    }
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
    if (what.prep) k.push('prep0', 'prep1', 'prep2', 'prep3');
    return k;
  }
  function cards(items, prefs) {
    const ks = kindsWanted(prefs), out = [];
    for (const it of items) for (const k of ks) {
      const s = spec(k, it);
      if (s) out.push({ id: it.id + '|' + k, kind: k, item: s.item || it, p: s.p, a: s.a });
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
    const rank = k => (/_r$|frar/.test(k) ? 2 : k === 'arfr' ? 0 : 1);
    const nw = fresh.slice(0, limit).map((c, i) => ({ c, i })).sort((a, b) => rank(a.c.kind) - rank(b.c.kind) || a.i - b.i).map(x => x.c);
    const q = []; let n = 0;
    for (const d of due) { q.push(d); if (++n % 3 === 0 && nw.length) q.push(nw.shift()); }
    return q.concat(nw);
  }
  function srsStats(list) {
    const now = Date.now(); let due = 0, fresh = 0;
    for (const c of list) { const st = S().cards[c.id]; if (!st) fresh++; else if (st.due <= now) due++; }
    return { due, fresh, newAvail: Math.min(fresh, Math.max(0, S().settings.newPerDay - Store.newToday())) };
  }
  // quelles cartes réviser
  const cardMastery = c => { const st = S().cards[c.id]; return st ? Math.min(st.ivl, 21) / 21 : -1; };
  function selectCards(list, which) {
    const errs = c => (S().items[c.item.id] || { err: 0 }).err;
    switch (which) {
      case 'due': return srsQueue(list);
      case 'new': return list.filter(c => !S().cards[c.id]);
      case 'hard': return list.filter(c => errs(c) > 0 || (S().cards[c.id] && S().cards[c.id].lapses > 0)).sort((a, b) => errs(b) - errs(a));
      case 'weak': return list.filter(c => { const m = cardMastery(c); return m >= 0 && m < 0.7; });
      case 'known': return list.filter(c => cardMastery(c) >= 0.7);
      default: return list.slice();
    }
  }
  function countWhich(list) {
    const o = {}; for (const w of ['due', 'all', 'new', 'hard', 'weak', 'known']) o[w] = selectCards(list, w).length;
    return o;
  }
  function mastery(it) {
    const ks = Object.keys(KINDS).filter(k => spec(k, it));
    if (!ks.length) return 0;
    let s = 0, n = 0;
    for (const k of ks) { const c = S().cards[it.id + '|' + k]; if (c) { s += Math.min(c.ivl, 21) / 21; n++; } }
    return n ? s / Math.max(n, Math.min(ks.length, 2)) : 0;
  }
  const lessonMastery = L => (L.items.length ? L.items.reduce((a, it) => a + mastery(it), 0) / L.items.length : 0);
  function enemies(n = 8) {
    return Object.values(LIB.items).map(it => {
      const r = S().items[it.id]; return { it, score: r ? r.err - r.ok * 0.5 : 0, err: r ? r.err : 0 };
    }).filter(x => x.err > 0 && x.score > 0).sort((a, b) => b.score - a.score).slice(0, n).map(x => x.it);
  }

  /* ---- aléatoire ---- */
  function rng32(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function shuffle(a, rng = Math.random) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  // sac mélangé : chaque mot sort une fois avant qu'un mot ne revienne
  function bag(items, rng = Math.random) {
    let b = [];
    return last => { if (!b.length) { b = shuffle(items.slice(), rng); if (b.length > 1 && b[b.length - 1] === last) b.unshift(b.pop()); } return b.pop(); };
  }
  const keyOf = (f, v) => (FIELDS[f] && FIELDS[f].isAr ? AR.letters(v) : String(v).toLowerCase().trim());

  function distractors(it, f, pool, rng, count) {
    const seen = new Set([keyOf(f, it[f])]), cands = [];
    const push = v => { if (!v) return; const k = keyOf(f, v); if (seen.has(k)) return; seen.add(k); cands.push(v); };
    if (f === 'prep') { shuffle(HURUF.slice(), rng).forEach(push); return cands.slice(0, count); }
    shuffle(pool.filter(o => o.t === it.t), rng).forEach(o => push(o[f]));
    if (cands.length < count) pool.forEach(o => push(o[f]));
    if (cands.length < count) Object.values(LIB.items).sort((a, b) => (a.id < b.id ? -1 : 1)).forEach(o => push(o[f]));
    if (cands.length < count) for (const g of ['w', 'syn', 'ant', 'pl', 'madi', 'masdar']) if (FIELDS[g].isAr === FIELDS[f].isAr) pool.forEach(o => push(o[g]));
    return shuffle(cands, rng).slice(0, count);
  }
  function options(it, f, pool, rng = Math.random, k = 4) {
    let opts = [];
    if (f === 'mud' && it.madi && AR.letters(AR.alts(it.madi)[0]).length === 3) {
      const v = AR.ainVariants(AR.alts(it.mud)[0] || it.mud);   // piège : autre voyelle de la ʿayn
      opts = shuffle(v, rng).slice(0, Math.min(k - 2, rng() < 0.5 ? 1 : 2));
    }
    opts = opts.concat(distractors(it, f, pool, rng, k - 1 - opts.length));
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

  /* ---- phrase à trous : retrouve le mot du vocabulaire dans la phrase d'exemple ---- */
  const bare = w => AR.letters(w).replace(/^(ال|وال|بال|فال|لل)/, '');
  function blankOf(it) {
    if (!it.ex) return null;
    const words = AR.clean(it.ex).split(' ');
    const forms = ['madi', 'mud', 'masdar', 'w', 'pl', 'amr'].flatMap(f => (it[f] ? AR.alts(it[f]) : []));
    for (let i = 0; i < words.length; i++) {
      const bw = bare(words[i]);
      for (const f of forms) {
        const bf = bare(f);
        if (bf.length >= 2 && (bw === bf || (bw.startsWith(bf) && bw.length - bf.length <= 2) || (bf.length >= 3 && bw.slice(0, bf.length - 1) === bf.slice(0, -1) && Math.abs(bw.length - bf.length) <= 2))) {
          return { sentence: words.map((w, j) => (j === i ? '____' : w)).join(' '), word: words[i] };
        }
      }
    }
    return null;
  }

  /* ---- examen « copie » : plusieurs parties, comme un vrai contrôle ---- */
  const SECTIONS = {
    tr: { title: 'Vocabulaire', desc: 'Traduis les mots (dans les deux sens).' },
    conj: { title: 'Conjugaison', desc: 'Complète le tableau : passé, présent, impératif, masdar.' },
    pl: { title: 'Pluriels', desc: 'Donne le pluriel (ou le singulier).' },
    antsyn: { title: 'Contraires et synonymes', desc: 'Donne le contraire ou le synonyme demandé.' },
    prep: { title: 'Prépositions', desc: 'Quelle préposition (حرف الجر) va avec ce verbe ?' },
    sent: { title: 'Phrases à trous', desc: 'Retrouve le mot qui manque dans la phrase.' }
  };
  function sectionPool(key, items) {
    const its = key === 'prep' ? expandPreps(items) : items;
    switch (key) {
      case 'tr': return its.filter(it => it.fr && head(it)).flatMap(it => [{ it, given: headF(it), hidden: ['fr'] }, { it, given: 'fr', hidden: [headF(it)] }]);
      case 'conj': return its.filter(it => it.t === 'verb' && it.mud).map(it => { const fs = ['madi', 'mud', 'amr', 'masdar'].filter(f => it[f]); return { it, given: 'madi', hidden: fs.filter(f => f !== 'madi') }; });
      case 'pl': return its.filter(it => it.pl).flatMap(it => [{ it, given: headF(it), hidden: ['pl'] }, { it, given: 'pl', hidden: [headF(it)] }]);
      case 'antsyn': return its.flatMap(it => [it.ant ? { it, given: headF(it), hidden: ['ant'] } : null, it.syn ? { it, given: headF(it), hidden: ['syn'] } : null]).filter(Boolean);
      case 'prep': return its.filter(it => it.t === 'verb' && it.prep).map(it => ({ it, given: 'madi', hidden: ['prep'] }));
      case 'sent': return its.map(it => { const b = blankOf(it); return b ? { it: Object.assign({}, it, { blank: b.word, exBlank: b.sentence }), given: 'exBlank', hidden: ['blank'] } : null; }).filter(Boolean);
    }
    return [];
  }
  function sectionCount(key, items) {
    const p = sectionPool(key, items);
    return new Set(p.map(x => x.it.vid || x.it.id)).size;
  }
  function makePaper(items, { sections, size = 8, rng = Math.random }) {
    const out = [];
    let qid = 0;
    for (const key of sections) {
      let pool = shuffle(sectionPool(key, items), rng);
      // un mot ne revient pas deux fois dans la même partie
      const seen = new Set(); pool = pool.filter(x => { const k = x.it.vid || x.it.id; if (seen.has(k)) return false; seen.add(k); return true; });
      const n = size === 'all' ? Math.min(pool.length, 25) : Math.min(pool.length, size);
      if (!n) continue;
      const optPool = key === 'prep' ? expandPreps(items) : key === 'sent' ? pool.map(x => x.it) : items;
      const qs = pool.slice(0, n).map(x => {
        const opts = {}; x.hidden.forEach(f => { opts[f] = options(x.it, f, optPool, rng); });
        return { qid: 'q' + (qid++), sec: key, item: x.it, given: x.given, hidden: x.hidden, options: opts };
      });
      out.push(Object.assign({ key, qs }, SECTIONS[key]));
    }
    return out;
  }

  /* ---- jeux ---- */
  const PAIRS = {
    tr: [['w', 'fr'], ['fr', 'w'], ['madi', 'fr'], ['fr', 'madi']],
    conj: [['madi', 'mud'], ['madi', 'masdar'], ['madi', 'amr'], ['masdar', 'madi'], ['mud', 'amr']],
    pl: [['w', 'pl'], ['pl', 'w']],
    ant: [['w', 'ant'], ['ant', 'w']],
    syn: [['w', 'syn'], ['syn', 'w']],
    prep: [['madi', 'prep']]
  };
  const pairsFor = what => Object.keys(PAIRS).filter(k => what[k]).flatMap(k => PAIRS[k]);
  function pickPair(it, pairs, rng, filter) {
    const ok = pairs.filter(([a, b]) => it[a] && it[b] && (!filter || filter(it, a, b)));
    return ok.length ? ok[Math.floor(rng() * ok.length)] : null;
  }
  const playable = (items, pairs) => items.filter(it => pairs.some(([a, b]) => it[a] && it[b]));
  function gameQ(items, pairs, next, rng = Math.random, k = 4) {
    for (let t = 0; t < 30; t++) {
      const it = next(); if (!it) return null;
      const pr = pickPair(it, pairs, rng); if (!pr) continue;
      const [a, b] = pr;
      return { item: it, from: a, to: b, options: options(it, b, items, rng, k), answer: it[b] };
    }
    return null;
  }
  function tfQ(items, pairs, next, rng = Math.random) {
    for (let t = 0; t < 30; t++) {
      const it = next(); const pr = it && pickPair(it, pairs, rng); if (!pr) continue;
      const [a, b] = pr, truth = rng() < 0.5;
      let shown = it[b];
      if (!truth) {
        const d = b === 'mud' && rng() < 0.5 ? AR.ainVariants(it.mud) : [];
        shown = d.length ? d[0] : distractors(it, b, items, rng, 1)[0];
        if (!shown) return { item: it, from: a, to: b, shown: it[b], truth: true };
      }
      return { item: it, from: a, to: b, shown, truth };
    }
    return null;
  }
  function anagramQ(items, what, next, rng = Math.random) {
    const pairs = pairsFor(what).filter(([, b]) => FIELDS[b].isAr && b !== 'prep');
    const target = (it, b) => AR.strip(AR.alts(it[b])[0] || '');
    const okT = (it, a, b) => { const t = target(it, b); return t.length >= 2 && t.length <= 9 && !/\s/.test(t); };
    for (let t = 0; t < 40; t++) {
      const it = next(); const pr = it && pickPair(it, pairs, rng, okT); if (!pr) continue;
      const [a, b] = pr, letters = [...target(it, b)];
      let tiles = letters.map((ch, k) => ({ ch, k }));
      for (let i = 0; i < 5; i++) { shuffle(tiles, rng); if (tiles.some((x, j) => x.k !== j)) break; }
      return { item: it, from: a, to: b, target: letters.join(''), letters, tiles };
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
    FIELDS, TYPES, CATS, KINDS, PAIRS, CENTERS, SECTIONS, HURUF, build, get LIB() { return LIB; }, head, headF, examFields, itemsFor,
    parsePreps, expandPreps, spec, cards, catCount, srsQueue, srsStats, selectCards, countWhich, mastery, lessonMastery, enemies,
    rng32, shuffle, bag, options, makeExam, qsFromCards, blankOf, sectionCount, makePaper,
    pairsFor, playable, gameQ, tfQ, anagramQ, enc, dec
  };
})();
