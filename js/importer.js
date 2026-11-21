/* Import simple en texte : une ligne = un mot.
   ذَهَبَ / يَذْهَبُ / اِذْهَبْ / ذَهَابًا + إِلَى = aller
   مَطَارٌ (مَطَارَاتٌ) = aéroport
   كَبِيرٌ = grand | contraire: صَغِيرٌ | phrase: المَرْكَزُ كَبِيرٌ
   Accepte aussi un copier-coller depuis Excel / Google Sheets (colonnes). */
const Importer = (() => {
  const AR_RE = /[؀-ۿ]/;
  const isAr = s => AR_RE.test(s || '');
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const KEYS = {
    pl: ['pluriel', 'pl', 'plural', 'множественное', 'мн', 'جمع', 'الجمع'], ant: ['contraire', 'ant', 'oppose', 'opposite', 'antonym', 'антоним', 'عكس', 'العكس'], syn: ['synonyme', 'syn', 'synonym', 'синоним', 'معنى', 'المعنى'],
    prep: ['harf', 'prep', 'preposition', 'предлог', 'حرف', 'حرف الجر'], ex: ['phrase', 'ex', 'exemple', 'example', 'sentence', 'пример', 'предложение', 'جملة', 'الجملة', 'الجملة المفيدة'],
    note: ['note', 'remarque', 'заметка'], fem: ['feminin', 'fem', 'feminine', 'женский', 'مؤنث'], t: ['type', 'тип'],
    fr: ['traduction', 'francais', 'sens', 'fr', 'translation', 'meaning', 'перевод', 'الترجمة'],
    madi: ['passe', 'madi', 'الماضي', 'ماضي'], mud: ['present', 'mudari', 'المضارع', 'مضارع'], amr: ['imperatif', 'amr', 'الأمر', 'أمر'],
    masdar: ['masdar', 'المصدر', 'مصدر'], w: ['mot', 'الكلمة', 'كلمة']
  };
  const keyOf = k => { k = norm(k).replace(/[\s:]+$/, ''); for (const [f, names] of Object.entries(KEYS)) if (names.map(norm).includes(k)) return f; return null; };
  const TYPE_WORDS = { verbe: 'verb', verb: 'verb', 'глагол': 'verb', nom: 'noun', noun: 'noun', 'существительное': 'noun', adjectif: 'adj', adj: 'adj', adjective: 'adj', 'прилагательное': 'adj', expression: 'expr', expr: 'expr', 'выражение': 'expr' };
  const looksMudari = s => /^[يتنأ][ً-ْ]?/.test(AR.clean(s));

  function parseLine(raw) {
    let line = String(raw).replace(/‏|‎/g, '').trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) return null;
    // séparateur « = » entre arabe et français (accepte aussi le tiret long)
    let eq = line.indexOf('=');
    if (eq < 0) { const m = line.match(/\s[—–]\s/); if (m) eq = m.index + 1; }
    if (eq < 0) return { raw, error: 'Ajoute la traduction après un signe « = »' };
    let arPart = line.slice(0, eq).trim(), rest = line.slice(eq + 1).trim();
    const it = {};
    // options « | clé: valeur »
    const parts = rest.split('|').map(s => s.trim());
    it.fr = parts.shift();
    for (const p of parts) {
      const m = p.match(/^([^:：]+)[:：]\s*(.+)$/);
      if (!m) { it.note = (it.note ? it.note + ' · ' : '') + p; continue; }
      const f = keyOf(m[1]);
      if (f === 't') it.t = TYPE_WORDS[norm(m[2])] || undefined;
      else if (f) it[f] = m[2].trim();
      else it.note = (it.note ? it.note + ' · ' : '') + p;
    }
    // « + إلى » : préposition du verbe
    const pm = arPart.match(/\+\s*(.+)$/);
    if (pm) { it.prep = it.prep || pm[1].trim(); arPart = arPart.slice(0, pm.index).trim(); }
    // « (pluriel) »
    const par = arPart.match(/\(([^)]+)\)/);
    if (par) { if (isAr(par[1])) it.pl = it.pl || par[1].trim(); arPart = arPart.replace(par[0], '').trim(); }
    let forms, plSplit = arPart.split(/\s*;\s*/);
    if (plSplit.length === 2 && !it.pl) { it.pl = plSplit[1]; arPart = plSplit[0]; }
    forms = arPart.split(/\s*[\/،,]\s*|\s+[-–]\s+/).map(s => s.trim()).filter(Boolean);
    if (!forms.length || !forms.every(isAr)) return { raw, error: 'La partie avant « = » doit être en arabe' };
    if (!it.fr) return { raw, error: 'Il manque la traduction après « = »' };
    let t = it.t;
    if (!t) {
      if (forms.length >= 3 || (forms.length === 2 && looksMudari(forms[1]))) t = 'verb';
      else if (forms.length === 2) t = 'noun';
      else t = AR.clean(forms[0]).split(' ').length > 2 ? 'expr' : 'noun';
    }
    it.t = t;
    if (t === 'verb') { [it.madi, it.mud, it.amr, it.masdar] = forms; }
    else { it.w = forms[0]; if (forms[1] && !it.pl) it.pl = forms[1]; }
    Object.keys(it).forEach(k => { if (it[k] == null || it[k] === '') delete it[k]; });
    return { raw, item: it };
  }

  // tableau collé (colonnes séparées par des tabulations)
  function parseTable(lines) {
    const rows = lines.map(l => l.split('\t').map(c => c.trim()));
    let map = null;
    const hdr = rows[0].map(keyOf);
    if (hdr.filter(Boolean).length >= 2) { map = hdr; rows.shift(); }
    return rows.filter(r => r.some(Boolean)).map(r => {
      const raw = r.join(' | ');
      if (map) {
        const it = {};
        r.forEach((c, i) => { if (c && c !== '=' && c !== '//' && map[i]) it[map[i]] = c; });
        it.t = it.madi ? 'verb' : 'noun';
        if (!it.fr && !it.madi && !it.w) return { raw, error: 'Ligne vide ou colonnes non reconnues' };
        if (!it.fr) return { raw, error: 'Il manque la traduction' };
        return { raw, item: it };
      }
      const ars = r.filter(isAr), frs = r.filter(c => c && !isAr(c));
      return parseLine(ars.join(' / ') + ' = ' + (frs[0] || ''));
    });
  }

  function parse(text) {
    const lines = String(text || '').split(/\r?\n/);
    if (lines.some(l => l.includes('\t'))) return parseTable(lines.filter(l => l.trim()));
    return lines.map(parseLine).filter(Boolean);
  }

  function toLine(it) {
    let ar = it.t === 'verb' ? [it.madi, it.mud, it.amr, it.masdar].filter(Boolean).join(' / ') : it.w + (it.pl ? ` (${it.pl.split('/')[0].trim()})` : '');
    const extra = [];
    if (it.t !== 'verb' && it.pl && it.pl.includes('/')) extra.push('pluriel: ' + it.pl);
    if (it.prep) extra.push('harf: ' + it.prep);
    if (it.ant) extra.push('contraire: ' + it.ant);
    if (it.syn) extra.push('synonyme: ' + it.syn);
    if (it.fem) extra.push('féminin: ' + it.fem);
    if (it.ex) extra.push('phrase: ' + it.ex);
    if (it.note) extra.push('note: ' + it.note);
    if (it.t === 'adj' || it.t === 'expr') extra.push('type: ' + (it.t === 'adj' ? 'adjectif' : 'expression'));
    return `${ar} = ${it.fr || ''}${extra.length ? ' | ' + extra.join(' | ') : ''}`;
  }
  const toText = items => items.map(toLine).join('\n');

  const EX = {
    fr: ['aller', 'aéroport', 'grand | contraire', 'étudiant | synonyme', 'phrase'],
    en: ['to go', 'airport', 'big | opposite', 'student | synonym', 'sentence'],
    ru: ['идти', 'аэропорт', 'большой | антоним', 'студент | синоним', 'пример']
  };
  const example = () => {
    const w = EX[(window.I18N && I18N.lang) || 'fr'] || EX.fr;
    return `ذَهَبَ / يَذْهَبُ / اِذْهَبْ / ذَهَابًا + إِلَى = ${w[0]}
مَطَارٌ (مَطَارَاتٌ) = ${w[1]}
كَبِيرٌ = ${w[2]}: صَغِيرٌ
طَالِبٌ (طُلَّابٌ) = ${w[3]}: تِلْمِيذٌ | ${w[4]}: الطَّالِبُ جَدِيدٌ`;
  };

  return { parse, parseLine, toText, toLine, get EXAMPLE() { return example(); } };
})();
