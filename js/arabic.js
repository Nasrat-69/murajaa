/* Outils arabe : normalisation, correction (avec niveaux de harakat), français tolérant, clavier. */
const AR = (() => {
  const MARK = /[ً-ٰٟ]/;
  const MARKS = /[ً-ٰٟ]/g;
  const VOW = { 'َ': 'a', 'ُ': 'u', 'ِ': 'i' };
  const VOW_CH = { a: 'َ', u: 'ُ', i: 'ِ' };
  const LETTER = /[ء-ي]/;

  const clean = s => String(s ?? '').replace(/ـ/g, '').replace(/[‌-‏]/g, '').replace(/\s+/g, ' ').trim();
  const strip = s => clean(s).replace(MARKS, '');

  // Lettres seules, variantes d'alif/ta marbuta/alif maqsura unifiées
  function letters(s) {
    return strip(s).replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
      .replace(/[^ء-ي ]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  // + tolère l'alif final du tanwin (وصولا = وصول)
  const loose = s => letters(s).split(' ').map(w => (w.length > 2 && w.endsWith('ا') ? w.slice(0, -1) : w)).join(' ');

  function clusters(s) {
    const out = [];
    for (const ch of clean(s)) {
      if (MARK.test(ch) && out.length) out[out.length - 1].m.push(ch);
      else out.push({ c: ch, m: [] });
    }
    return out;
  }
  const join = cl => cl.map(x => x.c + x.m.join('')).join('');
  function canon(s) {
    const t = clean(s).replace(/ٱ/g, 'ا').replace(/اً/g, 'ًا');
    return clusters(t).map(x => x.c + x.m.slice().sort().join('')).join('');
  }
  // index de la lettre qui porte la voyelle de la ʿayn (dernière voyelle brève avant la dernière lettre)
  function ainIndex(cl) {
    let last = -1;
    for (let i = cl.length - 1; i >= 0; i--) if (LETTER.test(cl[i].c)) { last = i; break; }
    for (let i = last - 1; i >= 0; i--) {
      if (!LETTER.test(cl[i].c)) break;
      if (cl[i].m.some(m => VOW[m])) return i;
    }
    return -1;
  }
  function ainVowel(s) {
    const cl = clusters(s); const i = ainIndex(cl);
    if (i < 0) return null;
    return VOW[cl[i].m.find(m => VOW[m])];
  }
  // يَصِلُ → [يَصَلُ, يَصُلُ] : pièges pour les QCM du muḍāriʿ
  function ainVariants(s) {
    const cl = clusters(s); const i = ainIndex(cl);
    if (i < 0) return [];
    // verbes creux / défectueux (يَقُولُ, يُعْطِي…) : pas de piège
    const nxt = cl[i + 1], lastL = cl.filter(x => LETTER.test(x.c)).pop();
    if ((nxt && /[اوي]/.test(nxt.c) && !nxt.m.some(m => VOW[m])) || /[يىا]/.test(lastL.c)) return [];
    const cur = VOW[cl[i].m.find(m => VOW[m])];
    return ['a', 'i', 'u'].filter(v => v !== cur).map(v => {
      const c2 = cl.map(x => ({ c: x.c, m: x.m.slice() }));
      c2[i].m = c2[i].m.map(m => (VOW[m] ? VOW_CH[v] : m));
      return join(c2);
    });
  }

  const alts = e => String(e ?? '').split(/\s*[\/،,|]\s*/).map(x => x.trim()).filter(Boolean);

  /* level : none (lettres) | mudari (voyelle de la ʿayn exigée pour le muḍāriʿ) | strict (toutes les harakat) */
  function check(user, expected, level, field) {
    const u = clean(user);
    if (!u) return { ok: false, empty: true };
    let near = false;
    for (const a of alts(expected)) {
      if (!(letters(u) === letters(a) || loose(u) === loose(a))) continue;
      near = true;
      if (level === 'strict') { if (canon(u) === canon(a)) return { ok: true }; }
      else if (level === 'mudari' && field === 'mud') { if (ainVowel(u) && ainVowel(u) === ainVowel(a)) return { ok: true }; }
      else return { ok: true };
    }
    return { ok: false, near };
  }

  /* ---- français ---- */
  function normFr(s) {
    return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[’'`]/g, ' ').replace(/[^\p{L}\p{N} ]+/gu, ' ')
      .replace(/(^|\s)(le|la|les|l|un|une|des|du|de|d|se|s|en|a|an|to|the)(?=\s|$)/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }
  const frAlts = e => String(e ?? '').replace(/[()]/g, ',').split(/[,;\/]|\bou\b/).map(normFr).filter(Boolean);
  function lev(a, b) {
    const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[n];
  }
  function checkFr(user, expected) {
    const us = String(user ?? '').split(/[,;\/]/).map(normFr).filter(Boolean);
    if (!us.length) return { ok: false, empty: true };
    for (const a of frAlts(expected)) for (const x of us) {
      if (x === a) return { ok: true };
      const tol = a.length >= 8 ? 2 : a.length >= 5 ? 1 : 0;
      if (lev(x, a) <= tol) return { ok: true };
      if (x.length >= 4 && a.includes(x)) return { ok: true };
      if (a.length >= 4 && x.includes(a)) return { ok: true };
    }
    return { ok: false };
  }

  const KEYS = [
    ['ض', 'ص', 'ث', 'ق', 'ف', 'غ', 'ع', 'ه', 'خ', 'ح', 'ج', 'د'],
    ['ش', 'س', 'ي', 'ب', 'ل', 'ا', 'ت', 'ن', 'م', 'ك', 'ط', 'ذ'],
    ['ئ', 'ء', 'ؤ', 'ر', 'ى', 'ة', 'و', 'ز', 'ظ', 'أ', 'إ', 'آ'],
    ['َ', 'ُ', 'ِ', 'ْ', 'ّ', 'ً', 'ٌ', 'ٍ', 'ٱ']
  ];

  return { clean, strip, letters, canon, check, checkFr, normFr, ainVowel, ainVariants, alts, KEYS };
})();
