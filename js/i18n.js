/* Traduction de l'interface : le français est la langue source, EN et RU viennent de I18N_DICT (i18n-dict.js).
   Chaque rendu passe par I18N.apply() qui traduit les textes et attributs visibles. */
const I18N = (() => {
  const LANGS = { fr: { name: 'Français', short: 'FR', loc: 'fr-FR' }, en: { name: 'English', short: 'EN', loc: 'en-GB' }, ru: { name: 'Русский', short: 'RU', loc: 'ru-RU' } };
  let lang = 'fr';
  const D = () => (window.I18N_DICT || {})[lang] || {};
  const P = () => ((window.I18N_DICT || {}).patterns || {})[lang] || [];
  const NUM = /\d+(?:[.,]\d+)?/g;
  let collect = null;

  function t(s) {
    if (s == null) return s;
    s = String(s);
    const k = s.trim();
    if (!k) return s;
    if (collect && /[a-zA-Zéèàùç]/.test(k) && !/[؀-ۿ]{2}/.test(k)) collect.add(k.replace(NUM, '{n}'));
    if (lang === 'fr') return s;
    const d = D();
    let out = d[k];
    if (out == null) {
      const nums = [];
      const key = k.replace(NUM, m => { nums.push(m); return '{n}'; });
      if (nums.length && d[key] != null) { let i = 0; out = d[key].replace(/\{n\}/g, () => nums[i++]); }
    }
    // ponctuation en tête (« · 59 mots… ») : on traduit le reste
    if (out == null) { const m = k.match(/^([·—:,.\s]+)(.+)$/); if (m) { const r = t(m[2]); if (r !== m[2]) out = m[1] + r; } }
    if (out == null) { const m = k.match(/^(.+?)(\s*[·—,]\s*)$/); if (m) { const r = t(m[1]); if (r !== m[1]) out = r + m[2]; } }
    // phrase composée « A · B » ou « A — B » : on traduit chaque morceau
    if (out == null) for (const sep of [' · ', ' — ']) if (k.includes(sep)) { const parts = k.split(sep).map(x => t(x)); if (parts.join(sep) !== k) { out = parts.join(sep); break; } }
    if (out == null) for (const [re, rep] of P()) { if (re.test(k)) { out = k.replace(re, rep); break; } }
    return out == null ? s : s.replace(k, out);
  }
  const SKIP = 'script,style,textarea,.ar,[lang="ar"],[dir="rtl"],.noi18n,code';
  function apply(root) {
    if (!root) return;
    if (lang === 'fr' && !collect) return;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: n => (n.nodeValue.trim() && !(n.parentElement && n.parentElement.closest(SKIP)) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT)
    });
    const nodes = []; while (w.nextNode()) nodes.push(w.currentNode);
    for (const n of nodes) { const v = t(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; }
    root.querySelectorAll('[placeholder],[data-tip],[aria-label],[title]').forEach(el => {
      for (const a of ['placeholder', 'data-tip', 'aria-label', 'title']) {
        const v = el.getAttribute(a); if (!v || /[؀-ۿ]{2}/.test(v) && a === 'placeholder') continue;
        const tv = t(v); if (tv !== v) el.setAttribute(a, tv);
      }
    });
  }
  function set(l) {
    lang = LANGS[l] ? l : 'fr';
    document.documentElement.lang = lang;
  }
  // boîtes de dialogue du navigateur traduites aussi
  const _confirm = window.confirm.bind(window), _prompt = window.prompt.bind(window);
  window.confirm = m => _confirm(t(m));
  window.prompt = (m, d) => _prompt(t(m), d);

  return {
    LANGS, t, apply, set,
    get lang() { return lang; },
    loc: () => LANGS[lang].loc,
    startCollect: () => { collect = new Set(); }, collected: () => [...(collect || [])].sort()
  };
})();
