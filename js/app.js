/* Interface : vues, actions, jeux, duel en direct. */
(() => {
  'use strict';
  const S = () => Store.S;
  const F = Engine.FIELDS, T = Engine.TYPES, CATS = Engine.CATS;
  const CAT_ICON = { tr: 'globe', conj: 'repeat', pl: 'plural', ant: 'swap', syn: 'equal', prep: 'link' };
  const app = document.getElementById('app');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ar = (s, cls = '') => (s ? `<span class="ar ${cls}" lang="ar" dir="rtl">${esc(s)}</span>` : '');
  const val = (f, v, cls = '') => (F[f] && F[f].isAr ? ar(v, cls) : `<span class="frv ${cls}">${esc(v)}</span>`);
  const flabel = f => `<span class="flabel">${esc(F[f].fr)} <span class="ar">${esc(F[f].ar)}</span></span>`;
  let LIB = Engine.build();
  let V = { name: 'home' };
  let timer = null, timeouts = [], lastView = null, lastCard = null, liveUnsub = null;

  /* ---------- utilitaires ---------- */
  function toast(msg, ms = 2600) {
    const t = document.getElementById('toast');
    t.textContent = I18N.t(msg); t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms);
  }
  function later(fn, ms) { const id = setTimeout(fn, ms); timeouts.push(id); return id; }
  function stopTimers() { if (timer) { clearInterval(timer); timer = null; } timeouts.forEach(clearTimeout); timeouts = []; }
  function unwatch() { if (liveUnsub) { liveUnsub(); liveUnsub = null; } }
  function go(name, p = {}) {
    if (V.name === 'live' && name !== 'live') { Call.detach(); Cloud.leaveRoom(V.code, V.room); unwatch(); }
    if (V.name === 'paper' && !V.done && name !== 'paper' && V.answered && V.answered() > 0 && !confirm('Quitter l\'examen ? Tes réponses seront perdues.')) return;
    stopTimers(); V = Object.assign({ name }, p); render(); window.scrollTo(0, 0);
  }
  function rebuild() { LIB = Engine.build(); }
  const center = () => Engine.CENTERS.find(c => c.id === S().center) || Engine.CENTERS[0];
  const centerDecks = () => LIB.decks.filter(d => d.center === S().center);
  function sel() {
    const all = centerDecks().flatMap(d => d.lessons.map(l => l.id));
    const ids = S().sel.filter(id => all.includes(id));
    return ids.length ? ids : all;
  }
  function bar(p) { const pc = Math.round(p * 100); return `<span class="bar" data-tip="Maîtrise ${pc} %"><b style="width:${pc}%"></b></span>`; }
  function download(name, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast('Copié'); }
    catch (e) { prompt('Copie ce texte :', text); }
  }
  const fmtTime = ms => { const s = Math.round(ms / 1000); return s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`; };
  const isDark = () => (S().settings.theme === 'dark') || (S().settings.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  function applyTheme() { const t = S().settings.theme; if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t); }
  const todayXP = () => (S().days[Store.today()] || { xp: 0 }).xp;
  function gain(n, label = true) { if (n <= 0) return; Store.addXP(n); if (label) FX.floatCenter('+' + n + ' XP', 'xp'); }
  function seg(action, key, opts, cur) {
    return `<div class="seg">${opts.map(([v, l]) => `<button class="${String(cur) === String(v) ? 'on' : ''}" data-a="${action}" data-k="${key}" data-v="${v}">${l}</button>`).join('')}</div>`;
  }
  const parseV = v => (v === 'true' ? true : v === 'false' ? false : /^\d+$/.test(v) ? +v : v);
  function avatar(p, cls = '') {
    const name = (p && p.name) || '?';
    return p && p.photo ? `<img class="av ${cls}" src="${esc(p.photo)}" alt="" referrerpolicy="no-referrer">` : `<span class="av ${cls}">${esc(name.slice(0, 1).toUpperCase())}</span>`;
  }
  const me = () => ({ name: S().name || 'Moi', photo: Cloud.st.user ? Cloud.st.user.photoURL : '' });
  // navigateur intégré (WhatsApp, Instagram, Messenger…) : la connexion Google n'y fonctionne pas
  const IN_APP = (() => { const u = navigator.userAgent || ''; return /FBAN|FBAV|FB_IAB|Instagram|WhatsApp|Line\/|Snapchat|Messenger|; wv\)|GSA\//i.test(u) || (/iPhone|iPad|iPod/.test(u) && !/Safari\//.test(u)); })();
  const IS_IOS = /iPhone|iPad|iPod/.test(navigator.userAgent || '');
  let inappHelp = false;
  const appLink = () => location.origin + location.pathname;
  function inappNotice() {
    return IN_APP ? `<div class="notice">${ico('globe')}<div><b>Ouvre l'appli dans ${IS_IOS ? 'Safari' : 'Chrome'} pour te connecter.</b><small>La connexion Google ne marche pas dans le navigateur de WhatsApp ou d'Instagram.</small>
      <button class="link" data-a="inappHelp">Comment faire ?</button></div></div>` : '';
  }
  function inappModal() {
    return `<div class="modal" data-a="closeInapp"><div class="sheet" data-stop>
      <h2>${ico('globe')} Ouvre l'appli dans ${IS_IOS ? 'Safari' : 'Chrome'}</h2>
      <p class="muted">Google bloque la connexion quand le lien est ouvert depuis WhatsApp (ou Instagram, Messenger…). Il faut l'ouvrir dans le vrai navigateur du téléphone.</p>
      <ol class="steps">${IS_IOS
        ? '<li>Touche l\'icône <b>Partager</b> (carré avec une flèche) ou les <b>…</b> en bas de l\'écran.</li><li>Choisis <b>Ouvrir dans Safari</b>.</li><li>Dans Safari, reconnecte-toi avec Google.</li>'
        : '<li>Touche les <b>⋮</b> en haut à droite.</li><li>Choisis <b>Ouvrir dans Chrome</b> (ou « Ouvrir dans le navigateur »).</li><li>Dans Chrome, reconnecte-toi avec Google.</li>'}</ol>
      <p class="muted small">Sinon : copie le lien et colle-le dans ${IS_IOS ? 'Safari' : 'Chrome'}.</p>
      <div class="row wrap"><button class="btn primary" data-a="copy" data-text="${esc(appLink())}">${ico('copy')}Copier le lien</button><button class="btn ghost" data-a="closeInapp">Fermer</button></div>
    </div></div>`;
  }

  /* ---------- rendu ---------- */
  const SESSION = ['flash', 'exam', 'paper', 'rush', 'tf', 'rain', 'anagram', 'live'];
  const NAV = [['home', 'home', 'Accueil'], ['reviewSetup', 'cards', 'Réviser'], ['examSetup', 'exam', 'Examen'], ['games', 'game', 'Jeux'], ['words', 'book', 'Mots']];
  function render() {
    setTimeout(() => window.dispatchEvent(new Event('murajaa:render')), 0);
    // garde ce qui est en cours de saisie (utile quand l'adversaire répond pendant qu'on écrit)
    const drafts = {}; let focusF = null;
    app.querySelectorAll('.hole-in:not([readonly])').forEach(i => { drafts[i.dataset.f] = i.value; if (document.activeElement === i) focusF = i.dataset.f; });
    const html = (VIEWS[V.name] || VIEWS.home)();
    const session = SESSION.includes(V.name);
    const enter = V.name !== lastView; lastView = V.name;
    app.innerHTML = (session ? '' : header()) + `<main class="main ${session ? 'session' : ''} ${enter ? 'enter' : ''}">${html}</main>` + (session ? '' : nav()) + (inappHelp ? inappModal() : '');
    I18N.apply(app);
    if (!enter) app.querySelectorAll('.hole-in:not([readonly])').forEach(i => { if (drafts[i.dataset.f] != null && !i.value) i.value = drafts[i.dataset.f]; if (focusF === i.dataset.f) i.focus({ preventScroll: true }); });
    const af = app.querySelector('[autofocus]'); if (af && !focusF && !matchMedia('(pointer:coarse)').matches) af.focus({ preventScroll: true });
    OSK.refresh();
    if (V.name === 'flash') bindSwipe();
  }
  function navCur() { return { duel: 'games', gameSetup: 'games', stats: 'home', account: 'home', import: 'words' }[V.name] || V.name; }
  function header() {
    const L = Store.level(), u = Cloud.st.user;
    return `<header class="top"><div class="top-in">
      <button class="brand" data-a="go" data-to="home"><span class="logo">م</span><span class="brand-t">Murājaʿa</span></button>
      <nav class="topnav">${NAV.map(([v, , l]) => `<button data-a="go" data-to="${v}" class="${navCur() === v ? 'on' : ''}">${l}</button>`).join('')}</nav>
      <div class="hud">
        <span class="pill" data-tip="Jours de suite">${ico('flame', 'fire')}${Store.streak()}</span>
        <span class="pill" data-tip="${S().xp} XP · encore ${L.next} XP pour le niveau ${L.lvl + 1}">${ico('star', 'gold')}${L.lvl}</span>
        <div class="langw"><button class="pill langb" data-a="langMenu" aria-label="Langue">${ico('globe')}${I18N.LANGS[I18N.lang].short}</button>${V.langOpen ? `<div class="langm">${Object.entries(I18N.LANGS).map(([k, l]) => `<button class="noi18n ${k === I18N.lang ? 'on' : ''}" data-a="setLang" data-v="${k}">${l.name}</button>`).join('')}</div>` : ''}</div>
        <button class="icon themeb" data-a="toggleTheme" aria-label="Mode sombre">${ico(isDark() ? 'sun' : 'moon')}</button>
        <button class="avbtn" data-a="go" data-to="account" aria-label="Mon compte">${u ? avatar({ name: S().name || u.displayName, photo: u.photoURL }) : `<span class="av ghost">${ico('user')}</span>`}</button>
      </div></div></header>`;
  }
  function nav() {
    return `<nav class="tabs">${NAV.map(([v, i, l]) => `<button data-a="go" data-to="${v}" class="${navCur() === v ? 'on' : ''}">${ico(i)}<span>${l}</span></button>`).join('')}</nav>`;
  }
  function sessionTop(i, n, extra = '') {
    return `<div class="stop"><button class="icon quit" data-a="quit" aria-label="Quitter">${ico('x')}</button>
      <div class="prog"><b style="width:${n ? Math.round(i / n * 100) : 0}%"></b></div><span class="cnt">${Math.min(i + 1, n)}/${n}</span>${extra}</div>`;
  }
  const emptyCenter = () => `<div class="empty">${ico('building', 'big')}<h3>${esc(center().name)} n'a pas encore de vocabulaire</h3>
    <p class="muted">Envoie les photos de tes cours ${esc(center().name)} pour remplir ce centre. En attendant, tu peux réviser un autre centre.</p>
    ${centerSwitch()}</div>`;

  /* ---------- centre + sélecteur de contenu ---------- */
  function centerSwitch() {
    return `<div class="centers">${Engine.CENTERS.map(c => {
      const n = LIB.decks.filter(d => d.center === c.id).reduce((a, d) => a + d.lessons.reduce((b, l) => b + l.items.length, 0), 0);
      return `<button class="center ${S().center === c.id ? 'on' : ''}" data-a="setCenter" data-v="${c.id}">${ar(c.ar, 'sm')}<b>${esc(c.name)}</b><small>${n ? n + ' mots' : 'bientôt'}</small></button>`;
    }).join('')}</div>`;
  }
  // niveaux repliés / dépliés (sélecteur et page Mots)
  const OPEN = new Set();
  const soonRow = soon => soon.length ? `<div class="soonlv"><small class="muted">Bientôt :</small>${soon.map(d => `<span class="soonchip">${ar(d.title, 'sm')}<small>${esc(d.subtitle || '')}</small></span>`).join('')}</div>` : '';
  function picker() {
    const s = S().sel, decks = centerDecks();
    if (!decks.length) return emptyCenter();
    const none = !s.some(id => decks.some(d => d.lessons.some(l => l.id === id)));
    return `<div class="picker">${centerSwitch()}${decks.map(d => {
      if (!d.lessons.length) return `<div class="pdeck soon"><div class="pdeck-h"><span class="pdeck-tg">${ico('lock', 'pchev')}<span class="pdeck-t">${ar(d.title, 'sm')}<small>${esc(d.subtitle || '')} · bientôt</small></span></span></div></div>`;
      const ids = d.lessons.map(l => l.id), on = ids.filter(id => s.includes(id)).length;
      const all = ids.length && on === ids.length;
      const words = d.lessons.reduce((a, l) => a + l.items.length, 0);
      const open = OPEN.has(d.id);
      return `<div class="pdeck ${on ? 'has' : ''} ${open ? 'open' : ''}">
        <div class="pdeck-h"><button class="pdeck-tg" data-a="togDeck" data-id="${esc(d.id)}" aria-expanded="${open}">${ico('chevron', 'pchev')}<span class="pdeck-t">${ar(d.title, 'md')}<small>${esc(d.subtitle || '')} · ${d.lessons.length} textes · ${words} mots</small></span>${on ? `<span class="pcount">${on}</span>` : ''}</button>
          <button class="chip-btn ${all ? 'on' : ''}" data-a="selDeck" data-id="${esc(d.id)}">${all ? ico('check') : ''}Tout le niveau</button></div>
        ${open ? `<div class="pchips">${d.lessons.map(l => `<button class="pchip ${s.includes(l.id) ? 'on' : ''}" data-a="selLesson" data-id="${esc(l.id)}">
          <span>${esc(l.title)}</span><small>${l.items.length}</small></button>`).join('')}</div>` : ''}</div>`;
    }).join('')}
    <p class="hint">${none ? 'Rien de coché : tout le centre est inclus.' : `${Engine.itemsFor(sel()).length} mots sélectionnés · <button class="link" data-a="selNone">tout décocher</button>`}</p></div>`;
  }
  function whatChips(obj, action) {
    const items = Engine.itemsFor(sel());
    return `<div class="wchips">${Object.entries(CATS).map(([k, c]) => {
      const n = Engine.catCount(items, k);
      return `<button class="wchip ${obj[k] ? 'on' : ''} ${n ? '' : 'empty'}" data-a="${action}" data-k="${k}">${ico(CAT_ICON[k])}<b>${c.label}</b><small>${n} mots</small><i class="tick">${ico('check')}</i></button>`;
    }).join('')}</div>`;
  }
  // toutes les prépositions d'un verbe, chacune avec son sens (et son exemple)
  function prepList(it, current) {
    const ps = Engine.parsePreps(it);
    if (!ps.length || (current && ps.length < 2)) return '';
    return `<div class="preps">${current ? `<span class="flabel">${esc('Avec ce verbe')}</span>` : flabel('prep')}
      ${ps.map(e => `<div class="pr ${current && AR.letters(e.p) === AR.letters(current) ? 'cur' : ''}">${ar(e.p, 'md')}<span class="pr-fr">${esc(e.fr)}</span>${e.ex ? `<span class="pr-ex">${ar(e.ex, 'sm')}</span>` : ''}</div>`).join('')}</div>`;
  }
  // la question en clair, au centre : « Quel est le pluriel ? »
  const ASKQ = { fr: 'Traduction', pl: 'Pluriel', mud: 'Présent', amr: 'Impératif', masdar: 'Masdar', madi: 'Passé', w: 'Mot', ant: 'Contraire', syn: 'Synonyme', prep: 'Préposition', blank: 'Mot manquant', fem: 'Féminin' };
  const askLabel = (f, given, small) => `<div class="qask ${small ? 'sm' : ''}"><b>${esc(f === 'w' && given === 'pl' ? 'Singulier' : (ASKQ[f] || F[f].fr))}</b>${ar(F[f].ar, 'sm')}</div>`;
  const prepHint = q => (q.to === 'prep' && q.item.prepFr ? `<div class="sub muted small">${esc('sens : ' + q.item.prepFr)}</div>` : '');
  function itemCard(it, compact = false, skip = []) {
    const cell = f => (it[f] && !skip.includes(f) ? `<div class="cell">${flabel(f)}${val(f, it[f], 'lg')}</div>` : '');
    const grid = it.t === 'verb' ? ['madi', 'mud', 'amr', 'masdar'] : ['w', 'fem', 'pl', 'syn', 'ant'];
    return `<div class="icard ${compact ? 'compact' : ''}">
      <div class="cells">${grid.map(cell).join('')}</div>
      ${it.fr && !skip.includes('fr') ? `<div class="tr">${esc(it.fr)}</div>` : ''}
      ${it.prep && !skip.includes('prep') ? prepList(it) : ''}
      ${it.ex ? `<div class="ex">${ar(it.ex)}</div>` : ''}
      ${it.note ? `<div class="note">${esc(it.note)}</div>` : ''}
    </div>`;
  }

  /* ================= VUES ================= */
  const VIEWS = {};

  VIEWS.home = () => {
    const xp = todayXP(), goal = S().settings.goal, pct = Math.min(1, xp / goal);
    const cards = Engine.cards(Engine.itemsFor(sel()), S().rev), st = Engine.srsStats(cards);
    const en = Engine.enemies(10).filter(it => centerDecks().some(d => d.id === it.deckId));
    const decks = centerDecks();
    const hello = S().name ? `Bonjour ${esc(S().name)}` : 'Bienvenue';
    return `
      <div class="greet"><div><p class="ar salam">السَّلَامُ عَلَيْكُمْ</p><h1>${hello}</h1></div>
        <button class="cchip" data-a="go" data-to="account" data-tip="Changer de centre">${ico('building')}${esc(center().name)}</button></div>
      ${!S().name ? `<div class="panel namecard"><p class="muted small">Ton prénom (visible par ton binôme en duel) :</p><div class="row"><input id="nameIn" placeholder="Prénom" maxlength="20"><button class="btn primary" data-a="saveName">OK</button></div></div>` : ''}
      <section class="livehero">
        <div class="lh-top"><span class="lh-ic">${ico('live')}</span><div><b>Duel en direct</b><small>Révise avec ton binôme en même temps, avec le salon vocal intégré.</small></div></div>
        <div class="lh-a"><button class="btn primary" data-a="homeLiveCreate">${ico('plus')}Créer une salle</button>
          <div class="lh-join"><input id="homeCode" class="codein sm" placeholder="CODE" maxlength="5" autocapitalize="characters"><button class="btn" data-a="homeLiveJoin">Rejoindre</button></div></div>
      </section>
      <section class="today">
        <div class="ring" style="--p:${pct}" data-tip="Objectif du jour : ${goal} XP"><div><b>${xp}</b><small>/ ${goal} XP</small></div></div>
        <div class="today-r">
          <div class="kpis">
            <div><b>${Store.streak()}</b><small>${ico('flame', 'fire')}jours de suite</small></div>
            <div><b>${st.due}</b><small>à revoir</small></div>
            <div><b>${st.newAvail}</b><small>nouvelles</small></div>
          </div>
          <div class="row wrap"><button class="btn primary" data-a="quickReview" ${decks.length ? '' : 'disabled'}>Programme du jour ${ico('arrow')}</button>
          <button class="btn ghost" data-a="go" data-to="stats">${ico('chart')}Statistiques</button></div>
        </div>
      </section>

      <h2 class="sec">Réviser</h2>
      <div class="quick">
        ${[['flip', 'cards', 'Cartes', 'à retourner'], ['cram', 'zap', 'Je sais /', 'je ne sais pas'], ['write', 'pen', 'Écrire', 'la réponse'], ['qcm', 'choice', 'QCM', '4 choix']].map(([m, i, a, b]) =>
          `<button class="qbtn" data-a="quickMode" data-v="${m}"><span class="qi">${ico(i)}</span><b>${a}</b><small>${b}</small></button>`).join('')}
        <button class="qbtn" data-a="go" data-to="examSetup"><span class="qi">${ico('exam')}</span><b>Examen</b><small>blanc</small></button>
      </div>

      <h2 class="sec">Jeux <button class="link" data-a="go" data-to="games">Tout voir</button></h2>
      <div class="hscroll">${Object.entries(GAMES).map(([k, g]) => gameCard(k, g, true)).join('')}</div>

      ${en.length ? `<section class="panel"><div class="row between"><h2>${ico('target', 'red')} Mots difficiles</h2><button class="btn sm" data-a="fightEnemies">S'entraîner</button></div>
        <p class="muted small">Les mots que tu rates le plus souvent.</p>
        <div class="chips">${en.map(it => `<span class="chip">${ar(Engine.head(it), 'sm')}</span>`).join('')}</div></section>` : ''}

      <h2 class="sec">${esc(center().name)} · tes niveaux <button class="link" data-a="go" data-to="import">${ico('plus')}Ajouter des mots</button></h2>
      ${decks.length ? `<div class="decks">${decks.filter(d => d.lessons.length).map(d => {
        const items = d.lessons.flatMap(l => l.items);
        const m = items.length ? items.reduce((a, it) => a + Engine.mastery(it), 0) / items.length : 0;
        return `<div class="dcard"><div class="dcard-h">${ar(d.title, 'md')}<span class="dpct">${Math.round(m * 100)} %</span></div>
          <small class="muted">${esc(d.subtitle || '')} · ${d.lessons.length} textes · ${items.length} mots</small>${bar(m)}
          <div class="row wrap"><button class="btn sm primary" data-a="reviseDeck" data-id="${esc(d.id)}">Réviser ce niveau</button><button class="btn sm ghost" data-a="go" data-to="words">Voir les mots</button></div></div>`;
      }).join('')}
        <button class="dcard soon" data-a="go" data-to="import"><b>${ico('plus')} Ajouter un niveau ou un texte</b><small class="muted">Colle simplement ta liste de mots, une ligne par mot.</small></button></div>${soonRow(decks.filter(d => !d.lessons.length))}` : emptyCenter()}`;
  };

  /* ----- Réviser : réglages ----- */
  const MODES = [
    ['flip', 'cards', 'Cartes à retourner', 'Tu retournes la carte puis tu dis si tu savais. L\'appli s\'en sert pour te la reproposer au bon moment.'],
    ['cram', 'zap', 'Je sais / je ne sais pas', 'Glisse la carte à droite si tu sais, à gauche sinon. Elle revient jusqu\'à ce que tu la saches.'],
    ['write', 'pen', 'Écrire', 'Tape la réponse au clavier, la correction est automatique.'],
    ['qcm', 'choice', 'QCM', 'Choisis la bonne réponse parmi 4 propositions.']];
  const WHICH = [
    ['due', 'Programme du jour', 'L\'appli choisit : les mots que tu es en train d\'oublier + quelques nouveaux.'],
    ['all', 'Tous les mots', 'Toute ta sélection, sans exception.'],
    ['new', 'Jamais vus', 'Ceux que tu n\'as encore jamais révisés.'],
    ['hard', 'Mots difficiles', 'Ceux où tu as déjà fait des erreurs.'],
    ['weak', 'En cours', 'Déjà vus mais pas encore bien retenus.'],
    ['known', 'Déjà maîtrisés', 'Pour vérifier qu\'ils sont toujours là.']];
  VIEWS.reviewSetup = () => {
    const r = S().rev, items = Engine.itemsFor(sel()), cards = Engine.cards(items, r);
    const cnt = Engine.countWhich(cards), avail = cnt[r.which] || 0;
    const n = r.which === 'due' || r.n === 'all' ? avail : Math.min(avail, r.n);
    return `<div class="page-h"><h1>Réviser</h1><p class="muted">Tu choisis tout : les textes, le type de question, les cartes et la façon de réviser.</p></div>
      <section class="panel"><h2 class="step"><i>1</i>Quels textes ?</h2>${picker()}</section>
      <section class="panel"><h2 class="step"><i>2</i>Type de question</h2>${whatChips(r.what, 'revWhat')}
        <h3>Sens</h3>${seg('revOpt', 'dir', [['ar', 'Arabe → Français'], ['fr', 'Français → Arabe'], ['both', 'Les deux']], r.dir)}
        <p class="muted small">Pour le pluriel, les contraires et les synonymes : « Arabe → Français » va du mot vers sa forme, l'autre sens fait l'inverse.</p></section>
      <section class="panel"><h2 class="step"><i>3</i>Quelles cartes ?</h2>
        <div class="which">${WHICH.map(([k, t, d]) => `<button class="whc ${r.which === k ? 'on' : ''} ${cnt[k] ? '' : 'empty'}" data-a="revOpt" data-k="which" data-v="${k}"><b>${t}</b><span class="whn">${cnt[k]}</span><small>${d}</small></button>`).join('')}</div>
        <h3>Ordre des mots</h3>${seg('revOpt', 'order', [['random', 'Aléatoire'], ['book', 'Ordre du livre']], r.order)}
        ${r.which !== 'due' ? `<h3>Nombre de cartes</h3>${seg('revOpt', 'n', [[10, '10'], [20, '20'], [40, '40'], ['all', 'Toutes']], r.n)}` : ''}</section>
      <section class="panel"><h2 class="step"><i>4</i>Comment ?</h2>
        <div class="modes">${MODES.map(([k, i, t, d]) => `<button class="mode ${r.mode === k ? 'on' : ''}" data-a="revOpt" data-k="mode" data-v="${k}"><span class="mi">${ico(i)}</span><b>${t}</b><small>${d}</small></button>`).join('')}</div></section>
      <div class="cta-bar"><div class="cta-info"><b>${n}</b> carte${n > 1 ? 's' : ''}<small>${esc(WHICH.find(w => w[0] === r.which)[1])} · ${cards.length} au total</small></div>
        <button class="btn primary lg" data-a="startRevision" ${n ? '' : 'disabled'}>Commencer</button></div>`;
  };

  function startRevision() {
    const r = S().rev, cards = Engine.cards(Engine.itemsFor(sel()), r);
    let list = Engine.selectCards(cards, r.which);
    if (!list.length) { toast(r.which === 'due' ? 'Rien à revoir aujourd\'hui. Choisis « Tous les mots » ou un autre groupe.' : 'Aucune carte dans ce groupe.', 3800); return; }
    if (r.which !== 'due') { if (r.order !== 'book') list = Engine.shuffle(list); if (r.n !== 'all') list = list.slice(0, r.n); }
    if (r.mode === 'flip') go('flash', { mode: 'srs', q: list, i: 0, flip: false, n: 0, xp: 0, total: list.length });
    else if (r.mode === 'cram') go('flash', { mode: 'cram', q: list, i: 0, flip: false, n: 0, xp: 0, total: list.length, known: 0, unknown: 0, seen: {} });
    else startExamQs(Engine.qsFromCards(list), { mode: r.mode === 'write' ? 'type' : 'qcm', title: r.mode === 'write' ? 'Écrire' : 'QCM', review: true });
  }

  /* ----- cartes ----- */
  function face(c, side) {
    const it = c.item;
    if (side === 'front') {
      let h = c.p.map(f => `<div class="pv">${val(f, it[f], F[f].isAr ? 'xxl' : 'xl')}</div>`).join('');
      if (c.kind === 'arfr' && it.t === 'verb' && it.mud) h += `<div class="sub">${ar(it.mud, 'md')}</div>`;
      if (c.kind === 'frar') h += `<div class="sub muted">${esc(T[it.t] ? T[it.t].label : '')}</div>`;
      if (/^prep/.test(c.kind)) h += `<div class="sub muted">${it.prepFr ? 'sens : ' + esc(it.prepFr) : esc(it.fr || '')}</div>`;
      return h + `<div class="ask">${c.a.map(f => esc(F[f].fr)).join(' · ')} ?</div>`;
    }
    if (/^prep/.test(c.kind)) {
      // préposition : le harf avec SON sens, SA phrase, puis les autres prépositions du verbe pour comparer
      return `<div class="prep-ans">${flabel('prep')}<div class="pa-row">${ar(it.prep, 'xl')}<span class="pa-eq">=</span><span class="pa-fr">${esc(it.prepFr || it.fr)}</span></div>
        ${it.prepEx ? `<div class="ex">${ar(it.prepEx)}</div>` : ''}</div>
        ${prepList(it, it.prep)}${itemCard(Object.assign({}, it, { ex: '' }), true, ['prep'])}`;
    }
    return `<div class="ans">${c.a.map(f => `<div class="av2">${flabel(f)}${val(f, it[f], 'xl')}</div>`).join('')}</div>${itemCard(it, true, c.a)}`;
  }
  VIEWS.flash = () => {
    const c = V.q[V.i];
    if (!c) return flashDone();
    const isNew = V.mode === 'srs' && !S().cards[c.id];
    const fresh = lastCard !== c.id + V.i; lastCard = c.id + V.i;
    const top = V.mode === 'cram'
      ? sessionTop(V.known, V.total, `<span class="tally"><i class="u" data-tip="À revoir">${V.unknown}</i><i class="k" data-tip="Je sais">${V.known}</i></span>`)
      : sessionTop(V.i, V.q.length);
    const g = [[1, 'À revoir', 'bad'], [2, 'Difficile', 'hard'], [3, 'Bien', 'good'], [4, 'Facile', 'easy']];
    const controls = V.mode === 'cram'
      ? `<div class="cram-ctl"><button class="round bad" data-a="cram" data-v="0" aria-label="À revoir">${ico('x')}</button>
           <span class="muted small">Glisse ou utilise<br>les boutons</span>
         <button class="round good" data-a="cram" data-v="1" aria-label="Je sais">${ico('check')}</button></div>`
      : V.flip
        ? `<div class="grades">${g.map(([n, l, cl]) => `<button class="gr ${cl}" data-a="grade" data-g="${n}"><b>${l}</b><small>${Store.preview(c.id, n)}</small><kbd>${n}</kbd></button>`).join('')}</div>`
        : `<button class="btn primary lg wide" data-a="flip">Retourner la carte <kbd>espace</kbd></button>`;
    return `${top}
      <div class="fc-wrap"><div class="fc ${V.flip ? 'flipped' : ''} ${fresh ? 'card-in' : ''}" id="fc" data-a="flip">
        <div class="fc-inner">
          <div class="face front"><div class="fc-kind">${isNew ? '<span class="badge">nouveau</span>' : ''}<span>${esc(Engine.KINDS[c.kind].label)}</span></div>
            <div class="fc-body">${face(c, 'front')}</div><div class="fc-hint">Touche la carte pour la retourner</div></div>
          <div class="face back"><div class="fc-kind"><span>Réponse</span></div><div class="fc-body">${face(c, 'back')}</div></div>
        </div>
        ${V.mode === 'cram' ? '<div class="stamp know">JE SAIS</div><div class="stamp dont">À REVOIR</div>' : ''}
      </div></div>
      ${controls}`;
  };
  function doneIcon(name, cls = '') { return `<div class="done-ic ${cls}">${ico(name)}</div>`; }
  function flashDone() {
    later(() => { FX.sound.win(); FX.confetti(70); }, 150);
    return `<div class="done">${doneIcon('check', 'ok')}<h1>Session terminée</h1>
      <p class="muted">${V.mode === 'cram' ? `${V.total} cartes maîtrisées` : `${V.n} cartes revues`} · +${V.xp} XP</p>
      <div class="col"><button class="btn primary lg" data-a="startRevision">Recommencer</button>
      <button class="btn" data-a="go" data-to="reviewSetup">Changer les réglages</button>
      <button class="btn ghost" data-a="go" data-to="home">Accueil</button></div></div>`;
  }
  function flip() {
    if (V.dragged) { V.dragged = false; return; }
    V.flip = !V.flip; FX.sound.flip();
    const fc = document.getElementById('fc');
    if (fc && V.mode === 'cram') { fc.classList.toggle('flipped', V.flip); fc.classList.remove('card-in'); return; }
    render();
  }
  function grade(g) {
    const c = V.q[V.i]; if (!c || !V.flip) return;
    Store.grade(c.id, g); V.n++;
    if (g >= 3) FX.sound.ok(); else if (g === 1) FX.sound.bad();
    const x = g >= 3 ? 2 : 1; V.xp += x; gain(x, false);
    if (g <= 2) Store.markHard(c.item.id);
    V.i++; V.flip = false; render();
  }
  function cram(know) {
    const c = V.q[V.i]; if (!c || V.busy) return;
    V.busy = true;
    const fc = document.getElementById('fc');
    if (fc) { fc.style.transition = 'transform .32s ease, opacity .32s'; fc.style.transform = `translateX(${know ? 130 : -130}%) rotate(${know ? 14 : -14}deg)`; fc.style.opacity = '0'; }
    if (know) { FX.sound.ok(); V.known++; V.xp += 1; gain(1, false); Store.answer(c.item.id, !V.seen[c.id]); }
    else { FX.sound.bad(); V.unknown++; V.seen[c.id] = 1; V.q.push(c); Store.answer(c.item.id, false); }
    later(() => { V.busy = false; V.i++; V.flip = false; render(); }, 280);
  }
  function bindSwipe() {
    if (V.mode !== 'cram') return;
    const fc = document.getElementById('fc'); if (!fc) return;
    let x0 = null, dx = 0;
    fc.addEventListener('pointerdown', e => { x0 = e.clientX; dx = 0; fc.setPointerCapture(e.pointerId); fc.style.transition = 'none'; });
    fc.addEventListener('pointermove', e => {
      if (x0 == null) return; dx = e.clientX - x0;
      if (Math.abs(dx) > 6) V.dragged = true;
      fc.style.transform = `translateX(${dx}px) rotate(${dx / 22}deg)`;
      fc.style.setProperty('--know', Math.max(0, Math.min(1, dx / 120)));
      fc.style.setProperty('--dont', Math.max(0, Math.min(1, -dx / 120)));
    });
    const end = () => {
      if (x0 == null) return; x0 = null;
      if (dx > 110) cram(true); else if (dx < -110) cram(false);
      else { fc.style.transition = 'transform .25s'; fc.style.transform = ''; fc.style.setProperty('--know', 0); fc.style.setProperty('--dont', 0); setTimeout(() => { V.dragged = false; }, 50); }
    };
    fc.addEventListener('pointerup', end); fc.addEventListener('pointercancel', end);
  }

  /* ----- Examen blanc : une vraie copie en plusieurs parties ----- */
  const SEC_ICON = { tr: 'globe', conj: 'repeat', pl: 'plural', antsyn: 'swap', prep: 'link', sent: 'book' };
  const SEC_CATS = { tr: { tr: true }, conj: { conj: true }, pl: { pl: true }, antsyn: { ant: true, syn: true }, prep: { prep: true }, sent: { tr: true } };
  const lvlName = () => ({ none: 'souple (lettres seulement)', mudari: 'voyelle du muḍāriʿ exigée', strict: 'toutes les harakat' }[S().settings.harakat]);
  const fmtNote = n => (Math.round(n * 2) / 2).toLocaleString(I18N.loc());
  const mention = n => (n >= 16 ? 'Excellent' : n >= 14 ? 'Très bien' : n >= 12 ? 'Bien' : n >= 10 ? 'Assez bien' : 'À retravailler');
  function examHistory(list) {
    if (!list.length) return '';
    return `<div class="hist">${list.map(e => `<div class="hrow" data-tip="${new Date(e.at).toLocaleDateString(I18N.loc())} : ${fmtNote(e.note)}/20">
      <span class="muted small">${new Date(e.at).toLocaleDateString(I18N.loc(), { day: 'numeric', month: 'short' })}</span>
      <span class="bar"><b style="width:${e.note / 20 * 100}%"></b></span><b>${fmtNote(e.note)}/20</b></div>`).join('')}</div>`;
  }
  VIEWS.examSetup = () => {
    const p = S().paper, items = Engine.itemsFor(sel());
    const hist = S().exams.filter(e => e.center === S().center).slice(-6).reverse();
    const per = p.size === 'all' ? 25 : p.size;
    const total = p.sections.reduce((a, k) => a + Math.min(Engine.sectionCount(k, items), per), 0);
    return `<div class="page-h"><h1>Examen blanc</h1><p class="muted">Comme le jour de l'examen : une copie en plusieurs parties, sans aide ni correction pendant l'épreuve. À la fin, tu as ta note, la correction détaillée et un plan de révision.</p></div>
      <section class="panel"><h2 class="step"><i>1</i>Sur quels textes ?</h2>${picker()}</section>
      <section class="panel"><h2 class="step"><i>2</i>Parties de l'examen</h2>
        <div class="wchips">${Object.entries(Engine.SECTIONS).map(([k, s]) => {
          const n = Engine.sectionCount(k, items), on = p.sections.includes(k);
          return `<button class="wchip ${on ? 'on' : ''} ${n ? '' : 'empty'}" data-a="paperSec" data-k="${k}">${ico(SEC_ICON[k])}<b>${s.title}</b><small>${n} mot${n > 1 ? 's' : ''}</small><i class="tick">${ico('check')}</i></button>`;
        }).join('')}</div></section>
      <section class="panel"><h2 class="step"><i>3</i>Réglages</h2>
        <h3>Longueur</h3>${seg('paperOpt', 'size', [[4, 'Courte'], [8, 'Normale'], [15, 'Longue'], ['all', 'Complète']], p.size)}
        <p class="muted small">Courte : 4 questions par partie · Normale : 8 · Longue : 15 · Complète : tous les mots.</p>
        <h3>Réponses</h3>${seg('paperOpt', 'mode', [['type', 'À écrire'], ['qcm', 'Choix multiples']], p.mode)}
        <h3>Ordre des questions</h3>${seg('paperOpt', 'order', [['random', 'Aléatoire'], ['book', 'Ordre du livre']], p.order || 'random')}
        <h3>Temps limite</h3>${seg('paperOpt', 'timer', [[0, 'Sans'], [10, '10 min'], [20, '20 min'], [30, '30 min'], [45, '45 min']], p.timer)}
        ${p.mode === 'type' ? `<p class="muted small">Correction des harakat : <b>${lvlName()}</b> — <button class="link" data-a="go" data-to="settings">modifier</button></p>` : ''}</section>
      ${hist.length ? `<section class="panel"><h2>${ico('chart')} Tes derniers examens</h2>${examHistory(hist)}</section>` : ''}
      <div class="cta-bar"><div class="cta-info"><b>${total}</b> questions<small>${p.sections.length} partie${p.sections.length > 1 ? 's' : ''}${p.timer ? ' · ' + p.timer + ' min' : ''}</small></div>
        <button class="btn primary lg" data-a="startPaper" ${total ? '' : 'disabled'}>Commencer</button></div>`;
  };
  function startPaper(items, opts = {}) {
    const p = S().paper;
    const secs = Engine.makePaper(items || Engine.itemsFor(sel()), { sections: opts.sections || p.sections, size: opts.size || p.size, order: p.order || 'random' });
    if (!secs.length) { toast('Pas assez de mots pour ces parties.'); return; }
    const answered = () => Object.keys(V.ans).filter(q => Object.values(V.ans[q]).some(v => v)).length;
    go('paper', { secs, si: 0, ans: {}, answered, mode: opts.mode || p.mode, level: S().settings.harakat, t0: Date.now(), limit: (opts.timer ?? p.timer) * 60000, done: false });
    if (V.limit) timer = setInterval(paperTick, 1000);
  }
  function paperTick() {
    const left = V.limit - (Date.now() - V.t0);
    const el = document.getElementById('pt'); if (el) { el.textContent = fmtClock(left); el.classList.toggle('hurry', left < 60000); }
    if (left <= 0) { stopTimers(); toast('Temps écoulé : ta copie est ramassée', 3500); submitPaper(true); }
  }
  const fmtClock = ms => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  function paperQ(q, n) {
    const it = q.item, a = V.ans[q.qid] || {};
    const given = q.given === 'exBlank'
      ? `<div class="psent">${ar(it.exBlank, 'md')}</div>`
      : `<div class="pgiven">${flabel(q.given)}${val(q.given, it[q.given], 'lg')}${q.sec === 'prep' && it.prepFr ? `<small class="muted">sens : ${esc(it.prepFr)}</small>` : ''}</div>`;
    const holes = q.hidden.map(f => {
      const isAr = F[f].isAr;
      const body = V.mode === 'qcm'
        ? `<div class="opts ${isAr ? 'ar-opts' : ''}">${q.options[f].map((o, k) => `<button class="opt ${a[f] === o ? 'sel' : ''}" data-a="ppick" data-q="${q.qid}" data-f="${f}" data-k="${k}">${val(f, o)}</button>`).join('')}</div>`
        : `<input class="pin ${isAr ? 'ar-input' : ''}" data-q="${q.qid}" data-f="${f}" dir="${isAr ? 'rtl' : 'ltr'}" lang="${isAr ? 'ar' : 'fr'}" value="${esc(a[f] || '')}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="${isAr ? 'اُكْتُبْ هُنَا…' : 'en français…'}">`;
      return `<div class="phole">${askLabel(f, q.given, true)}${body}</div>`;
    }).join('');
    return `<div class="pq"><span class="pn">${n}</span><div class="pbody">${given}<div class="pholes ${q.hidden.length > 1 ? 'multi' : ''}">${holes}</div></div></div>`;
  }
  VIEWS.paper = () => {
    if (V.done) return paperResult();
    const total = V.secs.reduce((a, s) => a + s.qs.length, 0), done = V.answered();
    const sec = V.secs[V.si];
    let n = V.secs.slice(0, V.si).reduce((a, s) => a + s.qs.length, 0);
    const last = V.si === V.secs.length - 1;
    return `<div class="stop"><button class="icon quit" data-a="quit" aria-label="Quitter">${ico('x')}</button>
        <div class="prog"><b style="width:${Math.round(done / total * 100)}%"></b></div><span class="cnt">${done}/${total}</span>
        ${V.limit ? `<span class="timer">${ico('clock')}<b id="pt">${fmtClock(V.limit - (Date.now() - V.t0))}</b></span>` : ''}</div>
      <div class="ptabs">${V.secs.map((s, i) => { const a = s.qs.filter(q => V.ans[q.qid] && Object.values(V.ans[q.qid]).some(Boolean)).length; return `<button class="${i === V.si ? 'on' : ''} ${a === s.qs.length ? 'full' : ''}" data-a="paperTab" data-i="${i}"><b>${i + 1}</b><span>${esc(s.title)}</span><small>${a}/${s.qs.length}</small></button>`; }).join('')}</div>
      <section class="paper">
        <div class="ph"><span class="pnum">Partie ${V.si + 1}</span><h2>${ico(SEC_ICON[sec.key])} ${esc(sec.title)}</h2><p class="muted small">${esc(sec.desc)}</p></div>
        ${sec.qs.map(q => paperQ(q, ++n)).join('')}
      </section>
      ${V.mode === 'type' ? `<button class="link osk-toggle" data-a="toggleOsk">${ico('keyboard')} Clavier arabe à l'écran : ${S().settings.osk ? 'activé' : 'désactivé'}</button>` : ''}
      <div class="pnav">${V.si > 0 ? `<button class="btn" data-a="paperTab" data-i="${V.si - 1}">${ico('back')}Partie précédente</button>` : '<span></span>'}
        ${last ? `<button class="btn primary lg" data-a="submitPaper">Rendre ma copie</button>` : `<button class="btn primary" data-a="paperTab" data-i="${V.si + 1}">Partie suivante ${ico('arrow')}</button>`}</div>`;
  };
  function checkPaperField(q, f, v) {
    const it = q.item;
    if (V.mode === 'qcm') return { ok: v != null && v === it[f] };
    if (!v) return { ok: false, empty: true };
    if (f === 'blank') {
      const r = AR.check(v, it.blank, V.level, f);
      if (r.ok) return r;
      const b = s => AR.letters(s).replace(/^(ال|وال|بال|فال|لل)/, '');
      return { ok: V.level !== 'strict' && b(v) === b(it.blank), near: r.near };
    }
    return F[f].isAr ? AR.check(v, it[f], V.level, f) : AR.checkFr(v, it[f]);
  }
  function submitPaper(force) {
    const total = V.secs.reduce((a, s) => a + s.qs.length, 0), left = total - V.answered();
    if (!force && left > 0 && !confirm(`Il reste ${left} question${left > 1 ? 's' : ''} sans réponse. Rendre ta copie quand même ?`)) return;
    stopTimers();
    const secs = V.secs.map(s => {
      let ok = 0, tot = 0;
      const qs = s.qs.map(q => {
        const a = V.ans[q.qid] || {};
        const fields = q.hidden.map(f => Object.assign({ f, v: a[f] || '' }, checkPaperField(q, f, a[f])));
        const good = fields.filter(x => x.ok).length; ok += good; tot += fields.length;
        Store.answer(q.item.id, good === fields.length);
        return { q, fields, ok: good === fields.length };
      });
      return { key: s.key, title: s.title, ok, tot, pct: tot ? ok / tot : 0, qs };
    });
    const ok = secs.reduce((a, s) => a + s.ok, 0), tot = secs.reduce((a, s) => a + s.tot, 0);
    const note = tot ? ok / tot * 20 : 0;
    V.result = { secs, note, ok, tot, time: Date.now() - V.t0 };
    S().exams.push({ at: Date.now(), center: S().center, note: Math.round(note * 10) / 10, secs: Object.fromEntries(secs.map(s => [s.key, Math.round(s.pct * 100)])) });
    gain(Math.round(ok * 1.5) + 10, false);
    V.done = true; render(); window.scrollTo(0, 0);
    later(() => { if (note >= 14) { FX.sound.win(); FX.confetti(note >= 17 ? 160 : 80); } else FX.sound.ok(); }, 200);
  }
  function paperResult() {
    const R = V.result, weak = R.secs.filter(s => s.pct < 0.75);
    const wrongAll = [...new Map(R.secs.flatMap(s => s.qs.filter(x => !x.ok).map(x => [x.q.item.id, LIB.items[x.q.item.id]]))).values()].filter(Boolean);
    const hist = S().exams.filter(e => e.center === S().center).slice(-6).reverse();
    const ansCell = (x, f, it) => {
      const right = f === 'blank' ? it.blank : it[f];
      return `<div class="cf ${x.ok ? 'ok' : 'ko'}">${flabel(f)}${x.ok ? `${ico('check')}${val(f, right, 'md')}` : `${x.v ? `<s>${val(f, x.v)}</s>` : '<span class="muted small">pas de réponse</span>'}${ico('arrow')}${val(f, right, 'md')}`}</div>`;
    };
    return `<div class="done">
      <div class="note ${R.note >= 10 ? 'ok' : 'ko'}"><b>${fmtNote(R.note)}</b><span>/20</span></div>
      <h1>${mention(R.note)}</h1>
      <p class="muted">${R.ok}/${R.tot} réponses justes · ${fmtTime(R.time)}</p></div>
      <section class="panel"><h2>Résultats par partie</h2>
        ${R.secs.map(s => `<div class="mrow"><span>${ico(SEC_ICON[s.key])} ${esc(s.title)}</span>${bar(s.pct)}<b class="${s.pct >= 0.75 ? 'okc' : 'koc'}">${Math.round(s.pct * 100)} %</b></div>`).join('')}</section>
      ${weak.length ? `<section class="panel plan"><h2>${ico('target', 'red')} Ton plan de révision</h2><p class="muted small">Les parties sous 75 % : entraîne-toi d'abord sur les mots ratés.</p>
        ${weak.map(s => { const wr = s.qs.filter(x => !x.ok).map(x => x.q.item.id); return `<div class="planrow"><div><b>${esc(s.title)}</b><small class="muted">${wr.length} erreur${wr.length > 1 ? 's' : ''} · ${Math.round(s.pct * 100)} %</small></div>
          <div class="row wrap"><button class="btn sm" data-a="planCards" data-k="${s.key}">${ico('zap')}Réviser ces mots</button><button class="btn sm ghost" data-a="planRedo" data-k="${s.key}">${ico('repeat')}Refaire la partie</button></div></div>`; }).join('')}</section>`
        : `<section class="panel plan"><h2>${ico('trophy')} Rien à rattraper</h2><p class="muted small">Toutes les parties sont au-dessus de 75 %. Passe au texte suivant ou fais un examen plus long.</p></section>`}
      <div class="row wrap center">${wrongAll.length ? `<button class="btn primary" data-a="redoWrong">${ico('repeat')}Refaire toutes mes erreurs (${wrongAll.length})</button>` : ''}<button class="btn" data-a="go" data-to="examSetup">Nouvel examen</button><button class="btn ghost" data-a="go" data-to="home">Accueil</button></div>
      <h2 class="sec">Correction détaillée</h2>
      ${R.secs.map((s, si) => `<section class="panel corr"><h3>Partie ${si + 1} · ${esc(s.title)}</h3>
        ${s.qs.map((x, i) => { const it = x.q.item; const g = x.q.given === 'exBlank' ? ar(it.exBlank, 'sm') : val(x.q.given, it[x.q.given], 'md'); return `<div class="cq ${x.ok ? 'ok' : 'ko'}"><span class="pn">${i + 1}</span><div class="cqb"><div class="cg">${g}${it.fr && x.q.given !== 'fr' ? ` <small class="muted">${esc(it.fr)}</small>` : ''}</div><div class="cfs">${x.fields.map(fx => ansCell(fx, fx.f, it)).join('')}</div></div></div>`; }).join('')}</section>`).join('')}
      ${hist.length > 1 ? `<section class="panel"><h2>${ico('chart')} Ta progression</h2>${examHistory(hist)}</section>` : ''}`;
  }
  function startExamQs(qs, opts = {}) {
    if (!qs.length) { toast('Pas assez de mots dans la sélection.'); return; }
    const e = S().exam;
    go('exam', {
      qs, i: 0, phase: 'ask', pick: {}, cur: null, res: [], score: 0, max: 0, streak: 0,
      mode: opts.mode ?? e.mode, lives: (opts.boss ?? (opts.review ? false : e.boss)) ? 3 : null, level: opts.level ?? S().settings.harakat,
      t0: Date.now(), duel: opts.duel || null, xp: 0, title: opts.title || 'Examen', review: !!opts.review
    });
  }
  function startExam(items, opts = {}) {
    const rng = opts.seed != null ? Engine.rng32(opts.seed) : Math.random;
    startExamQs(Engine.makeExam(items, { n: opts.n ?? S().exam.n, rng }), opts);
  }
  const hearts = n => `<span class="hearts">${[0, 1, 2].map(i => `<i class="${i < n ? 'on' : ''}">${ico('heart')}</i>`).join('')}</span>`;
  // rendu d'une question (partagé par l'examen et le duel en direct)
  function questionCard(q, mode, pick, cur, level, tag) {
    const it = q.item, fb = !!cur;
    const hole = f => {
      const r = fb ? cur[f] : null;
      let body;
      if (mode === 'qcm') {
        body = `<div class="opts ${F[f].isAr ? 'ar-opts' : ''}">${q.options[f].map((o, k) => {
          let cl = pick[f] === o ? 'sel' : '';
          if (fb) cl = o === it[f] ? 'good' : (pick[f] === o ? 'bad' : 'dim');
          return `<button class="opt ${cl}" data-a="pick" data-f="${f}" data-k="${k}" ${fb ? 'disabled' : ''}>${val(f, o)}</button>`;
        }).join('')}</div>`;
      } else {
        const isAr = F[f].isAr;
        body = `<input class="hole-in ${isAr ? 'ar-input' : ''} ${r ? (r.ok ? 'good' : 'bad') : ''}" data-f="${f}" dir="${isAr ? 'rtl' : 'ltr'}" lang="${isAr ? 'ar' : 'fr'}"
          value="${esc(r ? r.val : '')}" ${fb ? 'readonly' : ''} autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="${isAr ? 'اُكْتُبْ هُنَا…' : 'en français…'}">`;
      }
      const fbl = r ? `<div class="fbl ${r.ok ? 'ok' : 'ko'}">${r.ok ? ico('check') + ' Correct' : ico('x') + ' Réponse :'} ${!r.ok || mode === 'type' ? val(f, it[f], 'md') : ''}
        ${!r.ok && r.near ? `<small>${f === 'mud' && level === 'mudari' ? 'Lettres justes — vérifie la voyelle de la ʿayn' : 'Lettres justes, harakat à corriger'}</small>` : ''}</div>` : '';
      return `<div class="hole ${r ? (r.ok ? 'is-ok' : 'is-ko') : ''}">${askLabel(f, q.given)}${body}${fbl}</div>`;
    };
    const allOk = fb && q.hidden.every(f => cur[f].ok);
    return `<div class="qcard ${fb ? (allOk ? 'pulse-ok' : 'shake') : ''}"><div class="given">${tag ? `<div class="qtag">${tag}</div>` : ''}${flabel(q.given)}<div class="gval">${val(q.given, it[q.given], 'xxl')}</div>
        <div class="typ">${esc(T[it.t] ? T[it.t].label : '')}${q.hidden.includes('prep') && it.prepFr ? ` · ${esc('sens : ' + it.prepFr)}` : ''}</div></div>
        <div class="holes">${q.hidden.map(hole).join('')}</div></div>`;
  }
  function grade_q(q, mode, pick, level) {
    const it = q.item, cur = {};
    q.hidden.forEach(f => {
      let v, r;
      if (mode === 'qcm') { v = pick[f]; r = { ok: v != null && v === it[f] }; }
      else {
        v = (app.querySelector(`.hole-in[data-f="${f}"]`) || {}).value || '';
        r = F[f].isAr ? AR.check(v, it[f], level, f) : AR.checkFr(v, it[f]);
      }
      cur[f] = Object.assign({ val: v ?? '' }, r);
    });
    const nOk = q.hidden.filter(f => cur[f].ok).length;
    return { cur, nOk, all: nOk === q.hidden.length };
  }
  VIEWS.exam = () => {
    if (V.over) return examResult();
    const q = V.qs[V.i], fb = V.phase === 'fb';
    const extra = V.lives != null ? hearts(V.lives) : (V.streak >= 3 ? `<span class="streak-b">${ico('flame')}${V.streak}</span>` : '');
    const allOk = fb && q.hidden.every(f => V.cur[f].ok);
    return `${sessionTop(V.i, V.qs.length, extra)}
      ${questionCard(q, V.mode, V.pick, fb ? V.cur : null, V.level, esc(V.title) + (q.kind ? ' · ' + esc(Engine.KINDS[q.kind].label) : ''))}
      ${V.mode === 'type' && !fb ? `<button class="link osk-toggle" data-a="toggleOsk">${ico('keyboard')} Clavier arabe à l'écran : ${S().settings.osk ? 'activé' : 'désactivé'}</button>` : ''}
      ${fb
        ? `<div class="fbbar ${allOk ? 'ok' : 'ko'}"><div class="fbh"><b>${allOk ? pickCheer() : 'Pas tout à fait'}</b>
            ${!allOk ? `<button class="link" data-a="override">J'avais juste</button>` : ''}</div>
            ${(q.hidden.includes('prep') ? q.item.prepEx : q.item.ex) ? `<div class="ex">${ar(q.hidden.includes('prep') ? q.item.prepEx : q.item.ex)}</div>` : ''}
            <button class="btn lg wide ${allOk ? 'success' : 'danger'}" data-a="examNext" autofocus>Continuer <kbd>Entrée</kbd></button></div>`
        : `<button class="btn primary lg wide" data-a="examCheck">Valider <kbd>Entrée</kbd></button>`}`;
  };
  const CHEERS = ['ممتاز', 'أحسنت', 'Bravo', 'ما شاء الله', 'Parfait', 'جيد جدا'];
  const pickCheer = () => CHEERS[(V.i + V.score) % CHEERS.length];

  function examCheck() {
    const q = V.qs[V.i];
    if (V.mode === 'qcm' && q.hidden.some(f => V.pick[f] == null)) { toast('Réponds à toutes les cases'); return; }
    const { cur, nOk, all } = grade_q(q, V.mode, V.pick, V.level);
    V.cur = cur; V.phase = 'fb';
    V.score += nOk; V.max += q.hidden.length;
    V.res.push({ qi: V.i, id: q.item.id, ok: all });
    if (all) { V.streak++; FX.sound[V.streak % 5 === 0 ? 'combo' : 'ok'](); }
    else { V.streak = 0; FX.sound.bad(); FX.buzz(60); }
    if (!all && V.lives != null) V.lives--;
    if (!V.duel) Store.answer(q.item.id, all);
    const x = nOk * 2 + (all ? 2 : 0); V.xp += x; gain(x, !!x);
    render();
  }
  function examNext() {
    V.i++; V.phase = 'ask'; V.pick = {}; V.cur = null;
    if (V.i >= V.qs.length || V.lives === 0) {
      V.over = true; V.time = Date.now() - V.t0;
      if (V.score === V.max && V.lives !== 0) { V.xp += 20; Store.addXP(20); }
      if (V.duel) finishDuel();
    }
    render();
  }
  function examResult() {
    const pct = V.max ? Math.round(V.score / V.max * 100) : 0;
    const stars = pct >= 95 ? 3 : pct >= 75 ? 2 : pct >= 50 ? 1 : 0;
    const wrong = V.res.filter(r => !r.ok);
    const dead = V.lives === 0;
    if (!V.celebrated) { V.celebrated = true; later(() => { if (dead) FX.sound.lose(); else { FX.sound.win(); if (stars === 3) FX.confetti(120); } }, 200); }
    return `<div class="done">
      ${doneIcon(dead ? 'heart' : stars >= 2 ? 'trophy' : 'check', dead ? 'ko' : 'ok')}
      <h1>${dead ? 'Plus de vies' : pct === 100 ? 'Sans faute' : 'Terminé'}</h1>
      <div class="stars">${[0, 1, 2].map(i => `<span class="${i < stars ? 'on' : ''}" style="--d:${i * 0.15}s">${ico('star')}</span>`).join('')}</div>
      <div class="result-grid"><div><b>${pct} %</b><small>réussite</small></div><div><b>${V.score}/${V.max}</b><small>cases</small></div><div><b>${fmtTime(V.time)}</b><small>temps</small></div><div><b>+${V.xp}</b><small>XP</small></div></div>
      ${V.duel ? duelBox() : ''}
      ${wrong.length ? `<section class="panel left"><h2>À retravailler (${wrong.length})</h2>
        ${wrong.map(r => { const it = LIB.items[r.id]; return it ? `<details><summary>${ar(Engine.head(it), 'md')} <span class="muted">${esc(it.fr)}</span></summary>${itemCard(it, true)}</details>` : ''; }).join('')}
        ${V.duel ? '' : `<button class="btn primary" data-a="retryWrong">${ico('repeat')}Rejouer mes erreurs</button>`}</section>` : ''}
      <div class="col">${V.duel ? `<button class="btn primary" data-a="go" data-to="duel">Retour aux duels</button>` : `<button class="btn primary" data-a="${V.review ? 'startRevision' : 'go'}" data-to="games">${V.review ? 'Recommencer' : 'Retour aux jeux'}</button>`}
      <button class="btn ghost" data-a="go" data-to="home">Accueil</button></div></div>`;
  }

  /* ----- Jeux ----- */
  const GAMES = {
    rush: { icon: 'zap', name: 'Chrono-rush', desc: 'Enchaîne un maximum de bonnes réponses avant la fin du chrono. Les séries multiplient les points.', c: 'var(--c-rush)' },
    tf: { icon: 'scale', name: 'Vrai ou faux', desc: 'Une paire s\'affiche : est-elle juste ? Réponds au plus vite avant la fin du chrono.', c: 'var(--c-tf)' },
    rain: { icon: 'rain', name: 'Pluie de mots', desc: 'Les mots tombent de plus en plus vite. Réponds avant qu\'ils touchent le sol. 3 vies.', c: 'var(--c-rain)' },
    anagram: { icon: 'letters', name: 'Lettres mélangées', desc: 'Reconstruis le mot arabe lettre par lettre. Idéal pour l\'orthographe.', c: 'var(--c-ana)' }
  };
  function gameCard(k, g, small) {
    return `<button class="gcard ${small ? 'small' : ''}" style="--c:${g.c}" data-a="openGame" data-v="${k}"><span class="gi">${ico(g.icon)}</span><b>${g.name}</b>${small ? '' : `<small>${esc(g.desc)}</small>`}<span class="best">${ico('trophy')}${S().best[k] || 0}</span></button>`;
  }
  VIEWS.games = () => `<div class="page-h"><h1>Jeux</h1><p class="muted">Chaque jeu se règle : centre, niveau, textes et type de question.</p></div>
    <button class="livebanner" data-a="go" data-to="duel"><span class="gi">${ico('live')}</span><div><b>Duel en direct</b><small>Jouez en même temps, question par question, avec un chrono. Idéal pendant un appel vidéo.</small></div>${ico('chevron')}</button>
    <div class="ggrid">${Object.entries(GAMES).map(([k, g]) => gameCard(k, g)).join('')}
      <button class="gcard" style="--c:var(--c-boss)" data-a="startBoss"><span class="gi">${ico('crown')}</span><b>Boss de leçon</b><small>Examen à écrire sur toute la sélection. 3 vies, pas une de plus.</small></button>
      <button class="gcard" style="--c:var(--c-hard)" data-a="fightEnemies"><span class="gi">${ico('target')}</span><b>Mots difficiles</b><small>Un examen uniquement sur les mots que tu rates le plus.</small></button></div>`;

  VIEWS.gameSetup = () => {
    const g = GAMES[V.game], w = S().game.what;
    const items = Engine.itemsFor(sel());
    const pairs = Engine.pairsFor(w).filter(p => V.game !== 'anagram' || (F[p[1]].isAr && p[1] !== 'prep'));
    const n = Engine.playable(Engine.expandPreps(items), pairs).length;
    const G = S().game, k = V.game;
    const opts = [
      (k === 'rush' || k === 'tf') ? `<h3>Durée</h3>${seg('gameOpt', 'dur', [[15, '15 s'], [30, '30 s'], [45, '45 s'], [60, '1 min'], [120, '2 min']], G.dur)}` : '',
      (k === 'rush' || k === 'rain') ? `<h3>Nombre de choix</h3>${seg('gameOpt', 'choices', [[3, '3'], [4, '4'], [6, '6']], G.choices)}` : '',
      k === 'rain' ? `<h3>Vitesse de départ</h3>${seg('gameOpt', 'speed', [['slow', 'Lente'], ['normal', 'Normale'], ['fast', 'Rapide']], G.speed)}` : '',
      k === 'anagram' ? `<h3>Nombre de mots</h3>${seg('gameOpt', 'n', [[10, '10'], [20, '20'], [30, '30']], G.n)}` : ''
    ].join('');
    return `<button class="link back" data-a="go" data-to="games">${ico('back')}Jeux</button>
      <div class="ghead" style="--c:${g.c}"><span class="gi">${ico(g.icon)}</span><div><h1>${g.name}</h1><p class="muted">${esc(g.desc)}</p></div><span class="best">${ico('trophy')}Record : ${S().best[V.game] || 0}</span></div>
      <section class="panel"><h2 class="step"><i>1</i>Quoi réviser ?</h2>${picker()}</section>
      <section class="panel"><h2 class="step"><i>2</i>Types de questions</h2>${whatChips(w, 'gameWhat')}</section>
      <section class="panel"><h2 class="step"><i>3</i>Options</h2>${opts}<p class="muted small">Les mots sont tirés au hasard : chacun passe une fois avant qu'un mot revienne.</p></section>
      <div class="cta-bar"><div class="cta-info"><b>${n}</b> mots jouables</div><button class="btn primary lg" data-a="startGame" ${n >= 4 ? '' : 'disabled'}>Jouer</button></div>`;
  };
  function startGame(k) {
    const G = S().game, w = G.what;
    const items = Engine.expandPreps(Engine.itemsFor(sel()));
    const pairs = Engine.pairsFor(w);
    const pool = Engine.playable(items, pairs);
    if (pool.length < 4) { toast('Pas assez de mots pour ces réglages.'); return; }
    const next = Engine.bag(pool), ch = G.choices, dur = G.dur * 1000;
    if (k === 'rush') {
      go('rush', { items: pool, pairs, next, ch, q: Engine.gameQ(pool, pairs, next, Math.random, ch), score: 0, combo: 0, maxCombo: 0, n: 0, dur, end: Date.now() + dur, fb: null });
      timer = setInterval(rushTick, 100);
    } else if (k === 'tf') {
      go('tf', { items: pool, pairs, next, q: Engine.tfQ(pool, pairs, next), score: 0, combo: 0, maxCombo: 0, n: 0, dur, end: Date.now() + dur, fb: null });
      timer = setInterval(rushTick, 100);
    } else if (k === 'rain') {
      const speed = { slow: 11000, normal: 9000, fast: 6500 }[G.speed] || 9000;
      go('rain', { items: pool, pairs, next, ch, q: Engine.gameQ(pool, pairs, next, Math.random, ch), score: 0, lives: 3, speed, qid: 0, fb: null });
      armRain();
    } else if (k === 'anagram') {
      const q = Engine.anagramQ(pool, w, next);
      if (!q) { toast('Choisis au moins un type avec des réponses en arabe.'); return; }
      go('anagram', { items: pool, w, next, q, built: [], round: 0, total: G.n, score: 0, hints: 0, fb: null, ok: 0 });
    }
  }
  function gameOver(k, score, extra = {}) {
    stopTimers();
    const record = score > (S().best[k] || 0);
    if (record) { S().best[k] = score; Store.save(); }
    const xp = Math.max(1, Math.round(score * (k === 'anagram' ? 2 : 1.5)));
    Store.addXP(xp);
    Object.assign(V, { over: true, record, xp }, extra);
    render();
    later(() => { if (score > 0) { FX.sound.win(); if (record) FX.confetti(120); } else FX.sound.lose(); }, 150);
  }
  function overScreen(k, lines) {
    return `<div class="done">${doneIcon(V.record ? 'trophy' : GAMES[k].icon, 'ok')}<h1>${V.record ? 'Nouveau record' : 'Partie terminée'}</h1>
      <div class="result-grid">${lines.map(([v, l]) => `<div><b>${v}</b><small>${l}</small></div>`).join('')}<div><b>+${V.xp}</b><small>XP</small></div></div>
      <div class="col"><button class="btn primary lg" data-a="startGame" data-v="${k}">Rejouer</button><button class="btn" data-a="openGame" data-v="${k}">Réglages</button><button class="btn ghost" data-a="go" data-to="games">Jeux</button></div></div>`;
  }
  function timebar(p) { return `<div class="timebar"><b id="tb" style="transform:scaleX(${Math.max(0, p)})"></b></div>`; }
  function rushTick() {
    const left = V.end - Date.now();
    const el = document.getElementById('rt'); if (el) el.textContent = Math.max(0, Math.ceil(left / 1000));
    const tb = document.getElementById('tb'); if (tb) { tb.style.transform = `scaleX(${Math.max(0, left / V.dur)})`; tb.classList.toggle('hurry', left < 10000); }
    if (left <= 0) gameOver(V.name, V.score);
  }
  const gtop = extra => `<div class="stop game"><button class="icon quit" data-a="quit" aria-label="Quitter">${ico('x')}</button>
    <span class="timer">${ico('clock')}<b id="rt">${Math.max(0, Math.ceil((V.end - Date.now()) / 1000))}</b> s</span><span class="pts">${V.score} pts</span>${extra || ''}</div>${timebar((V.end - Date.now()) / V.dur)}`;
  const comboTag = () => (V.combo >= 3 ? `<span class="streak-b">${ico('flame')}${V.combo}${V.name === 'rush' ? ' · ×' + (1 + Math.floor(V.combo / 5)) : ''}</span>` : '');

  VIEWS.rush = () => {
    if (V.over) return overScreen('rush', [[V.score, 'points'], [V.n, 'réponses'], ['×' + V.maxCombo, 'meilleure série']]);
    const q = V.q;
    return `${gtop(comboTag())}
      <div class="qcard game-card ${V.fb ? (V.fb.ok ? 'pulse-ok' : 'shake') : 'card-in'}"><div class="given">${flabel(q.from)}<div class="gval">${val(q.from, q.item[q.from], 'xxl')}</div>${prepHint(q)}</div>
        <div class="hole">${askLabel(q.to, q.from)}<div class="opts ${F[q.to].isAr ? 'ar-opts' : ''}">${q.options.map((o, k) => {
          let cl = ''; if (V.fb) cl = o === q.answer ? 'good' : (V.fb.k === k ? 'bad' : 'dim');
          return `<button class="opt ${cl}" data-a="rushPick" data-k="${k}"><kbd>${k + 1}</kbd>${val(q.to, o)}</button>`;
        }).join('')}</div></div></div>`;
  };
  function rushPick(k) {
    if (V.fb || V.over) return;
    const q = V.q, ok = q.options[k] === q.answer;
    V.fb = { k, ok }; V.n++;
    if (ok) {
      const pts = 1 + Math.floor(V.combo / 5);
      V.score += pts; V.combo++; V.maxCombo = Math.max(V.maxCombo, V.combo);
      (V.combo % 5 === 0 ? FX.sound.combo : FX.sound.ok)(); FX.floatCenter('+' + pts, 'pts');
    } else { V.combo = 0; FX.sound.bad(); FX.buzz(80); Store.answer(q.item.id, false); }
    render();
    later(() => { if (V.name !== 'rush' || V.over) return; V.fb = null; V.q = Engine.gameQ(V.items, V.pairs, () => V.next(q.item), Math.random, V.ch); render(); }, ok ? 320 : 1200);
  }

  VIEWS.tf = () => {
    if (V.over) return overScreen('tf', [[V.score, 'points'], [V.n, 'réponses'], ['×' + V.maxCombo, 'meilleure série']]);
    const q = V.q, fb = V.fb;
    return `${gtop(comboTag())}
      <div class="tf-card ${fb ? (fb.ok ? 'pulse-ok' : 'shake') : 'card-in'}">
        <div class="tf-side">${flabel(q.from)}${val(q.from, q.item[q.from], 'xxl')}${prepHint(q)}</div>
        <div class="tf-eq">=</div>
        <div class="tf-side">${flabel(q.to)}${val(q.to, q.shown, 'xl')}</div>
        ${fb && !fb.ok && !q.truth ? `<div class="tf-fix">Bonne réponse : ${val(q.to, q.item[q.to], 'md')}</div>` : ''}
        ${fb ? `<div class="tf-verdict ${fb.ok ? 'ok' : 'ko'}">${q.truth ? 'C\'était vrai' : 'C\'était faux'}</div>` : ''}
      </div>
      <div class="tf-btns"><button class="tfb bad" data-a="tfPick" data-v="0">${ico('x')}Faux<kbd>←</kbd></button>
        <button class="tfb good" data-a="tfPick" data-v="1">${ico('check')}Vrai<kbd>→</kbd></button></div>`;
  };
  function tfPick(v) {
    if (V.fb || V.over) return;
    const q = V.q, ok = (v === 1) === q.truth;
    V.fb = { ok }; V.n++;
    if (ok) { V.combo++; V.maxCombo = Math.max(V.maxCombo, V.combo); const pts = 1 + Math.floor(V.combo / 5); V.score += pts; (V.combo % 5 === 0 ? FX.sound.combo : FX.sound.ok)(); FX.floatCenter('+' + pts, 'pts'); }
    else { V.combo = 0; FX.sound.bad(); FX.buzz(80); Store.answer(q.item.id, false); }
    render();
    later(() => { if (V.name !== 'tf' || V.over) return; V.fb = null; V.q = Engine.tfQ(V.items, V.pairs, () => V.next(q.item)); render(); }, ok ? 350 : 1400);
  }

  function armRain() {
    const id = ++V.qid;
    later(() => { if (V.name === 'rain' && !V.over && V.qid === id && !V.fb) rainResolve(-1); }, V.speed);
  }
  VIEWS.rain = () => {
    if (V.over) return overScreen('rain', [[V.score, 'mots'], [`${(V.speed / 1000).toFixed(1)} s`, 'vitesse finale']]);
    const q = V.q, fb = V.fb;
    return `<div class="stop game"><button class="icon quit" data-a="quit" aria-label="Quitter">${ico('x')}</button>
        ${hearts(V.lives)}<span class="pts">${V.score} mots</span></div>
      <div class="arena ${fb && !fb.ok ? 'hit' : ''}">
        <div class="drop ${fb ? (fb.ok ? 'pop' : 'splash') : ''}" style="animation-duration:${V.speed}ms">${flabel(q.from)}${val(q.from, q.item[q.from], 'xl')}${prepHint(q)}</div>
        <div class="ground"></div>
        ${fb && !fb.ok ? `<div class="rain-ans">${val(q.to, q.answer, 'lg')}</div>` : ''}
      </div>
      <div class="hole">${askLabel(q.to, q.from)}<div class="opts ${F[q.to].isAr ? 'ar-opts' : ''}">${q.options.map((o, k) => {
        let cl = ''; if (fb) cl = o === q.answer ? 'good' : (fb.k === k ? 'bad' : 'dim');
        return `<button class="opt ${cl}" data-a="rainPick" data-k="${k}"><kbd>${k + 1}</kbd>${val(q.to, o)}</button>`;
      }).join('')}</div></div>`;
  };
  function rainResolve(k) {
    if (V.fb || V.over) return;
    const q = V.q, ok = k >= 0 && q.options[k] === q.answer;
    V.fb = { k, ok };
    if (ok) { V.score++; V.speed = Math.max(2600, Math.round(V.speed * 0.93)); FX.sound.ok(); FX.floatCenter('+1', 'pts'); }
    else { V.lives--; FX.sound.bad(); FX.buzz(120); Store.answer(q.item.id, false); }
    render();
    later(() => {
      if (V.name !== 'rain') return;
      if (V.lives <= 0) { gameOver('rain', V.score); return; }
      V.fb = null; V.q = Engine.gameQ(V.items, V.pairs, () => V.next(q.item), Math.random, V.ch); render(); armRain();
    }, ok ? 380 : 1500);
  }

  VIEWS.anagram = () => {
    if (V.over) return overScreen('anagram', [[V.score, 'points'], [`${V.ok}/${V.total}`, 'mots trouvés']]);
    const q = V.q, fb = V.fb;
    const built = V.built.map(i => q.tiles[i].ch).join('');
    const slots = q.letters.map((_, i) => `<span class="slot ${i < V.built.length ? 'full' : ''}"></span>`).join('');
    return `${sessionTop(V.round, V.total, `<span class="pts">${V.score} pts</span>`)}
      <div class="qcard ana ${fb ? (fb.ok ? 'pulse-ok' : 'shake') : 'card-in'}">
        <div class="given">${flabel(q.from)}<div class="gval">${val(q.from, q.item[q.from], 'xl')}</div></div>
        <div class="ana-ask">${askLabel(q.to, q.from)}</div>
        <div class="built ${fb ? (fb.ok ? 'ok' : 'ko') : ''}" dir="rtl">${fb && fb.reveal ? ar(q.item[q.to], 'xxl') : (built ? ar(built, 'xxl') : '<span class="ph">…</span>')}</div>
        <div class="slots" dir="rtl">${slots}</div>
        <div class="tiles" dir="rtl">${q.tiles.map((t, i) => `<button class="tile ${V.built.includes(i) ? 'used' : ''}" data-a="tile" data-i="${i}" ${V.built.includes(i) || fb ? 'disabled' : ''}>${esc(t.ch)}</button>`).join('')}</div>
        <div class="row center wrap"><button class="btn sm" data-a="anaBack" ${V.built.length && !fb ? '' : 'disabled'}>${ico('erase')}Effacer</button>
          <button class="btn sm" data-a="anaHint" ${fb ? 'disabled' : ''}>${ico('hint')}Indice</button><button class="btn sm ghost" data-a="anaSkip" ${fb ? 'disabled' : ''}>${ico('skip')}Passer</button></div>
      </div>`;
  };
  function anaCheck() {
    const q = V.q, built = V.built.map(i => q.tiles[i].ch).join('');
    if (V.built.length < q.letters.length) return;
    if (built === q.target) {
      const pts = Math.max(1, 3 - V.hints);
      V.score += pts; V.ok++; V.fb = { ok: true, reveal: true };
      FX.sound.ok(); FX.floatCenter('+' + pts, 'pts');
      render(); later(anaNext, 1100);
    } else {
      V.fb = { ok: false }; FX.sound.bad(); FX.buzz(80);
      render(); later(() => { V.fb = null; V.built = []; render(); }, 700);
    }
  }
  function anaNext() {
    V.round++; V.hints = 0; V.built = []; V.fb = null;
    if (V.round >= V.total) { gameOver('anagram', V.score); return; }
    const prev = V.q.item; V.q = Engine.anagramQ(V.items, V.w, () => V.next(prev)); render();
  }

  /* ----- Duel : page principale ----- */
  VIEWS.duel = () => {
    const tab = V.tab || 'live';
    const tabs = `<div class="seg wide">${[['live', 'En direct'], ['rivals', 'Bilan'], ['code', 'Sans compte']].map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-a="duelTab" data-tab="${k}">${l}</button>`).join('')}</div>`;
    let body = '';
    if (tab === 'live') body = liveHome();
    else if (tab === 'rivals') body = rivalsView();
    else body = codeDuel();
    return `<button class="link back" data-a="go" data-to="games">${ico('back')}Jeux</button>
      <div class="ghead" style="--c:var(--c-live)"><span class="gi">${ico('live')}</span><div><h1>Duel</h1><p class="muted">Affronte ton binôme sur les mêmes questions, en même temps.</p></div></div>${tabs}${body}`;
  };
  function needAccount(msg) {
    if (!Cloud.st.enabled) return `<section class="panel empty">${ico('cloud', 'big')}<h3>Les comptes ne sont pas encore activés</h3><p class="muted">${msg} Il faut d'abord brancher l'appli sur Firebase (gratuit). En attendant, utilise l'onglet « Sans compte ».</p></section>`;
    if (!Cloud.st.user) return `<section class="panel empty">${ico('user', 'big')}<h3>Connecte-toi pour jouer en direct</h3><p class="muted">${msg}</p>${inappNotice()}<button class="btn google" data-a="signIn">${GOOGLE_G}Continuer avec Google</button></section>`;
    return '';
  }
  const LIVE_MODES = [['qcm', 'choice', 'QCM', 'Choisis la bonne réponse parmi 4 propositions.'], ['type', 'pen', 'Écrire', 'Tape la réponse au clavier, la correction est automatique.'],
    ['oral', 'mic', 'À l\'oral', 'Chacun son tour, sans chrono : l\'un interroge, l\'autre répond à voix haute. Celui qui interroge voit la réponse et dit si c\'est juste.'],
    ['speed', 'zap', 'Oral chrono', 'Une manche chacun : l\'un enchaîne les mots le plus vite possible à voix haute, l\'autre voit la réponse et valide dès que c\'est juste. Puis on inverse.']];
  const isOral = m => m === 'oral' || m === 'speed';
  const SPEED_T = [[5, '5 s'], [8, '8 s'], [10, '10 s'], [15, '15 s'], [20, '20 s']];
  // cartes du duel : choisies par l'hôte (mêmes réglages que Réviser), puis envoyées par identifiant à l'adversaire
  function liveCardList(st) {
    const items = Engine.itemsFor(st.l).filter(it => !it.custom && !(LIB.decks.find(d => d.id === it.deckId) || {}).user);
    let list = Engine.selectCards(Engine.cards(items, { what: st.what, dir: st.dir }), st.which || 'all');
    if ((st.which || 'all') !== 'due' && st.order !== 'book') list = Engine.shuffle(list);
    list = st.n === 'all' ? list : list.slice(0, st.n);
    if (st.mode === 'speed' && list.length > 1 && list.length % 2) list = list.slice(0, -1);   // autant de mots pour chacun
    return list.map(c => c.id);
  }
  // réglages du duel : les mêmes à la création et dans la salle d'attente (pour l'hôte)
  function liveSetupPanels(l, cnt) {
    return `<section class="panel"><h2 class="step"><i>1</i>Quels textes ?</h2>${picker()}</section>
      <section class="panel"><h2 class="step"><i>2</i>Type de question</h2>${whatChips(l.what, 'liveWhat')}
        <h3>Sens</h3>${seg('liveOpt', 'dir', [['ar', 'Arabe → Français'], ['fr', 'Français → Arabe'], ['both', 'Les deux']], l.dir)}</section>
      <section class="panel"><h2 class="step"><i>3</i>Quelles cartes ?</h2>
        <div class="which">${WHICH.map(([k, t, d]) => `<button class="whc ${l.which === k ? 'on' : ''} ${cnt[k] ? '' : 'empty'}" data-a="liveOpt" data-k="which" data-v="${k}"><b>${t}</b><span class="whn">${cnt[k]}</span><small>${d}</small></button>`).join('')}</div>
        <p class="muted small">Ce sont tes cartes (ta progression) qui servent à choisir les questions ; ton binôme reçoit exactement les mêmes.</p>
        <h3>Ordre des mots</h3>${seg('liveOpt', 'order', [['random', 'Aléatoire'], ['book', 'Ordre du livre']], l.order)}
        <h3>Nombre de questions</h3>${seg('liveOpt', 'n', [[5, '5'], [10, '10'], [15, '15'], [20, '20'], ['all', 'Toutes']], l.n)}</section>
      <section class="panel"><h2 class="step"><i>4</i>Comment ?</h2>
        <div class="modes">${LIVE_MODES.map(([k, i, t, d]) => `<button class="mode ${l.mode === k ? 'on' : ''}" data-a="liveOpt" data-k="mode" data-v="${k}"><span class="mi">${ico(i)}</span><b>${t}</b><small>${d}</small></button>`).join('')}</div></section>
      <section class="panel"><h2 class="step"><i>5</i>Règles du duel</h2>
        ${l.mode === 'speed' ? `<p class="muted small">Ton binôme répond d'abord à la moitié des mots, puis c'est ton tour sur l'autre moitié. Un seul chrono tourne pendant toute la manche : enchaîne les mots le plus vite possible. Chaque mot juste rapporte des points, et plus il est rapide, plus il rapporte. Rejoignez le salon vocal pour vous entendre.</p>`
        : l.mode === 'oral' ? '<p class="muted small">À l\'oral, il n\'y a pas de chrono : rejoignez le salon vocal pour vous entendre. Les rôles s\'inversent à chaque carte, et une seule faute rend la carte fausse.</p>'
          : `<h3>Temps par question</h3>${seg('liveOpt', 'time', [[20, '20 s'], [30, '30 s'], [45, '45 s'], [60, '60 s'], [90, '90 s'], [120, '2 min']], l.time)}`}
        ${l.mode === 'speed' ? '' : `<h3>Après chaque question</h3>${seg('liveOpt', 'adv', [['auto', 'On passe tout seul'], ['manual', 'Bouton « Suivant »']], l.adv)}`}
        ${l.mode === 'speed' ? '' : '<p class="muted small">Avec « Suivant », vous voyez la correction et vous pouvez en discuter avant de continuer. Le chrono peut aussi être mis en pause à tout moment.</p>'}</section>`;
  }
  // l'hôte change les réglages dans la salle : on les envoie à la salle (petit délai pour grouper les clics)
  let lobbySyncT = null;
  function liveLobbySync() {
    if (V.name !== 'live' || !V.room || V.room.state !== 'lobby' || !isHost()) return;
    clearTimeout(lobbySyncT);
    lobbySyncT = setTimeout(() => {
      if (V.name !== 'live' || !V.room || V.room.state !== 'lobby') return;
      const l = S().live;
      Cloud.updateSettings(V.code, Object.assign({}, V.room.settings, { l: sel(), n: l.n, mode: l.mode, time: l.time, adv: l.adv, what: Object.assign({}, l.what), dir: l.dir, which: l.which, order: l.order }))
        .catch(e => toast(e.message));
    }, 350);
  }
  function liveHome() {
    const gate = needAccount('Chaque joueur se connecte avec son compte Google, puis l\'un crée une salle et l\'autre la rejoint avec le code.');
    if (gate) return gate;
    const l = S().live;
    const cards = Engine.cards(Engine.itemsFor(sel()), l), cnt = Engine.countWhich(cards), avail = cnt[l.which] || 0;
    const n = l.n === 'all' ? avail : Math.min(avail, l.n);
    return `<section class="panel"><h2>Rejoindre une salle</h2>
        <div class="row"><input id="liveCode" class="codein" placeholder="CODE" maxlength="5" value="${esc(V.joinCode || '')}" autocapitalize="characters"><button class="btn primary" data-a="liveJoin">Rejoindre</button></div></section>
      <h2 class="sec">Créer une salle</h2>
      ${liveSetupPanels(l, cnt)}
      <div class="cta-bar"><div class="cta-info"><b>${n}</b> question${n > 1 ? 's' : ''}<small>${esc(WHICH.find(w => w[0] === l.which)[1])} · ${cards.length} au total</small></div>
        <button class="btn primary lg" data-a="liveCreate" ${n ? '' : 'disabled'}>Créer la salle</button></div>`;
  }

  /* ----- Duel en direct ----- */
  function openLive(code) {
    stopTimers(); unwatch();
    V = { name: 'live', code, room: null, loading: true };
    liveUnsub = Cloud.watchRoom(code, (data, err) => onRoom(data, err));
    timer = setInterval(liveTick, 250);
    history.replaceState(null, '', location.pathname + '#live=' + code);
    render();
  }
  function liveQs(st) {
    if (st.cards) {
      const map = {}; Engine.cards(Engine.itemsFor(st.l), { what: st.what, dir: st.dir, all: true }).forEach(c => { map[c.id] = c; });
      V.missing = st.cards.filter(id => !map[id]).length;
      return Engine.qsFromCards(st.cards.map(id => map[id]).filter(Boolean), Engine.rng32(st.seed));
    }
    const items = Engine.itemsFor(st.l).slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return Engine.makeExam(items, { n: st.n, rng: Engine.rng32(st.seed) });
  }
  const isHost = () => V.room && V.room.host === Cloud.uid();
  // oral : l'hôte interroge aux questions paires, l'invité aux impaires
  function oralRoles(r, qi) {
    const order = [r.host, ...Object.keys(r.players).filter(k => k !== r.host)];
    // oral chrono : l'invité répond à la 1re moitié, puis l'hôte à la 2de
    if (r.settings.mode === 'speed') { const N = (r.settings.cards || []).length || +r.settings.n || 2, half = Math.ceil(N / 2), g = order[1] || order[0]; return qi < half ? { ask: order[0], ans: g, half } : { ask: g, ans: order[0], half }; }
    return { ask: order[qi % 2] || r.host, ans: order[(qi + 1) % 2] || r.host };
  }
  const opp = () => { const r = V.room; if (!r) return null; const id = Object.keys(r.players).find(k => k !== Cloud.uid()); return id ? Object.assign({ id }, r.players[id]) : null; };
  const mine = () => (V.room ? V.room.players[Cloud.uid()] : null);
  const liveLim = () => (V.room.settings.mode === 'speed' ? 3600e3 : V.room.settings.time * 1000);
  const SPEED_REF = 10000;   // oral chrono : bonus de rapidité calculé sur 10 s par mot
  const fmtChrono = ms => { const s = Math.max(0, ms) / 1000; return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}.${Math.floor((s * 10) % 10)}`; };
  // chrono de la manche : temps de tous les mots déjà faits + mot en cours
  function roundElapsed(r) {
    const ro = oralRoles(r, V.qi), ans = (r.players[ro.ans] || {}).ans || {};
    let t = 0; for (let i = V.qi < ro.half ? 0 : ro.half; i < V.qi; i++) if (ans[i]) t += ans[i].ms || 0;
    return t + (ans[V.qi] ? ans[V.qi].ms || 0 : V.paused ? liveLim() - V.paused.left : Date.now() - V.t0);
  }
  function onRoom(data, err) {
    if (V.name !== 'live') return;
    V.loading = false; V.room = data; V.err = err ? err.message : null;
    if (!data) { Call.detach(); render(); return; }
    if (!data.players[Cloud.uid()]) { V.kicked = true; Call.detach(); render(); return; }
    Call.attach(V.code, data);
    const st = data.settings;
    if (data.state !== 'lobby' && (!V.qs || V.seed !== st.seed)) { V.qs = liveQs(st); V.seed = st.seed; }
    if (data.state === 'playing') {
      if (V.qi !== data.qi) { V.qi = data.qi; V.t0 = Date.now(); V.pick = {}; V.cur = null; V.sent = false; V.paused = null; V.oppSeen = null; }
      const op = opp();
      if (op && op.ans && op.ans[data.qi] && V.oppSeen !== data.qi) { V.oppSeen = data.qi; if (!V.sent) { FX.sound.tap(); FX.buzz(30); } }
      // pause : le chrono est figé pour les deux joueurs
      const pz = data.paused && data.paused.qi === data.qi ? data.paused : null;
      if (pz) V.paused = pz;
      else if (V.paused) { V.t0 = Date.now() - (liveLim() - V.paused.left); V.paused = null; }
      const all = isOral(st.mode) ? (() => { const p = data.players[oralRoles(data, data.qi).ans]; return !!(p && p.ans && p.ans[data.qi]); })()
        : Object.values(data.players).every(p => p.ans && p.ans[data.qi]);
      if (all && V.revealFor !== data.qi) { V.revealFor = data.qi; FX.sound.flip(); }
      if (all && isHost() && (st.adv !== 'manual' || st.mode === 'speed') && !V.paused && V.advFor !== data.qi) {
        V.advFor = data.qi; const qi = data.qi;
        later(() => { if (V.room && !V.room.paused && V.room.qi === qi) Cloud.advanceFrom(V.code, qi, V.qs.length).catch(console.warn); else V.advFor = null; }, st.mode === 'speed' ? 900 : 3500);
      }
    }
    if (data.state === 'lobby') { V.qs = null; V.qi = null; V.recorded = false; V.advFor = null; V.revealFor = null; V.paused = null; V.celebrated = false; }
    if (data.state === 'done') recordLive(data);
    render();
  }
  function liveTick() {
    const r = V.room; if (!r || r.state !== 'playing' || V.qi == null) return;
    // si l'écoute en temps réel se fige (réseau mobile), on relit la salle sur le serveur
    if (!V.lastFetch || Date.now() - V.lastFetch > 3000) {
      V.lastFetch = Date.now(); const code = V.code;
      Cloud.fetchRoom(code).then(d => { if (d && V.name === 'live' && V.code === code && JSON.stringify(d) !== JSON.stringify(V.room)) onRoom(d); }).catch(() => {});
    }
    if (r.settings.mode === 'speed') { const t = document.getElementById('lt'); if (t) t.textContent = fmtChrono(roundElapsed(r)); return; }
    if (V.paused || r.settings.mode === 'oral') return;
    const lim = liveLim(), el = Date.now() - V.t0, left = lim - el;
    const t = document.getElementById('lt'); if (t) t.textContent = Math.max(0, Math.ceil(left / 1000));
    const tb = document.getElementById('tb'); if (tb) { tb.style.transform = `scaleX(${Math.max(0, left / lim)})`; tb.classList.toggle('hurry', left < 8000); }
    if (!V.sent && left <= 0) submitLive(true);
    // adversaire déconnecté : l'hôte passe à la suite (mode automatique) ou le bouton apparaît
    if (el > lim + 6000 && !V.stale) { V.stale = V.qi; if (isHost() && r.settings.adv !== 'manual') Cloud.advanceFrom(V.code, V.qi, V.qs.length).catch(console.warn); else render(); }
    if (V.stale !== false && V.stale !== V.qi && el < lim) V.stale = false;
  }
  function submitLive(timeout) {
    if (V.sent || !V.qs || V.paused) return;
    const st = V.room.settings, q = V.qs[V.qi];
    if (!timeout && st.mode === 'qcm' && q.hidden.some(f => V.pick[f] == null)) { toast('Réponds à toutes les cases'); return; }
    const { cur, nOk, all } = grade_q(q, st.mode, V.pick, st.h || 'none');
    const ms = Math.min(Date.now() - V.t0, st.time * 1000);
    // 100 points par case juste + bonus de rapidité (au dixième de seconde près)
    const pts = nOk * 100 + (all ? Math.round(100 * Math.max(0, 1 - ms / (st.time * 1000))) : 0);
    V.cur = cur; V.sent = true;
    const v = {}; q.hidden.forEach(f => { v[f] = [String(cur[f].val ?? '').slice(0, 80), !!cur[f].ok]; });
    Cloud.answer(V.code, V.qi, { ok: all, n: nOk, pts, ms, to: !!timeout, v }).catch(e => toast('Envoi impossible : ' + e.message));
    Store.answer(q.item.id, all);
    if (all) FX.sound.ok(); else { FX.sound.bad(); FX.buzz(60); }
    if (pts) FX.floatCenter('+' + pts, 'pts');
    render();
  }
  function scoreboard(r) {
    const m = mine(), o = opp();
    const ms = m ? m.score : 0, os = o ? o.score : 0;
    const lead = ms === os ? 'Égalité' : ms > os ? `Tu mènes de ${ms - os}` : `${esc(o.name)} mène de ${os - ms}`;
    const play = r.state === 'playing' && V.qi != null;
    const oral = isOral(r.settings.mode), roles = play && oral ? oralRoles(r, V.qi) : null;
    const stat = (p, id) => !play || !p ? '' : oral ? (roles.ask === id ? `<em class="pst">${ico('eye')}interroge</em>` : p.ans && p.ans[V.qi] ? `<em class="pst ok">${ico('check')}a répondu</em>` : `<em class="pst">${ico('mic')}répond</em>`)
      : (p.ans && p.ans[V.qi] ? `<em class="pst ok">${ico('check')}a validé</em>` : `<em class="pst">réfléchit <span class="dots"><i></i><i></i><i></i></span></em>`);
    const pl = (p, you) => p ? `<div class="sp ${you ? 'you' : ''} ${(you ? ms > os : os > ms) ? 'lead' : ''} ${play && p.ans && p.ans[V.qi] ? 'answered' : ''}">${avatar(p)}<div><b>${esc(p.name)}${you ? ' (toi)' : ''}</b><span>${p.score} pts</span>${stat(p, you ? Cloud.uid() : (o && o.id))}</div>${(you ? ms > os : os > ms) ? `<i class="crown">${ico('crown')}</i>` : ''}</div>` : `<div class="sp wait">${avatar({ name: '?' })}<div><b>En attente…</b><span>—</span></div></div>`;
    return `<div class="scoreboard">${pl(Object.assign({}, m, { name: (m && m.name) || 'Moi' }), true)}<div class="vs-mid"><small>${r.state === 'playing' ? lead : 'VS'}</small></div>${pl(o, false)}</div>`;
  }
  VIEWS.live = () => {
    if (V.loading) return `<div class="done">${doneIcon('live')}<h1>Connexion…</h1></div>`;
    const r = V.room;
    if (!r || V.kicked) return `<div class="done">${doneIcon('x', 'ko')}<h1>Salle fermée</h1><p class="muted">${V.err ? esc(V.err) : 'L\'hôte a fermé la salle ou elle n\'existe plus.'}</p><div class="col"><button class="btn primary" data-a="go" data-to="duel">Retour</button></div></div>`;
    const st = r.settings, o = opp();
    const playing = r.state === 'playing' && V.qs;
    const quit = `<div class="stop"><button class="icon quit" data-a="liveQuit" aria-label="Quitter">${ico('x')}</button><span class="roomcode">Salle <b>${esc(V.code)}</b></span>
      ${playing ? `<button class="btn sm ghost" data-a="liveStop">${ico('x')}Arrêter la partie</button>` : ''}
      ${playing && st.mode !== 'oral' ? (V.paused ? `<button class="btn sm primary" data-a="liveResume">${ico('play')}Reprendre</button>` : `<button class="btn sm" data-a="livePause">${ico('pause')}Pause</button>`) : ''}</div>`;
    if (r.state === 'lobby') {
      const missing = st.l.filter(id => !LIB.lessons[id]);
      const words = Engine.itemsFor(st.l).length;
      return `${quit}
        <section class="panel lobby"><p class="muted small">Donne ce code à ton binôme :</p>
          <div class="bigcode">${esc(V.code).split('').map(c => `<span>${c}</span>`).join('')}</div>
          <div class="row center wrap"><button class="btn sm" data-a="copy" data-text="${esc(V.code)}">${ico('copy')}Copier le code</button>
          ${location.protocol.startsWith('http') ? `<button class="btn sm" data-a="copy" data-text="${esc(location.origin + location.pathname + '#live=' + V.code)}">${ico('link')}Copier le lien</button>` : ''}</div>
          <p class="muted small">${ico('headset')} Rejoignez le salon vocal en bas de l'écran pour vous parler pendant la partie.</p></section>
        ${scoreboard(r)}
        <section class="panel"><h3>Réglages de la partie</h3>
          <p class="small">${words} mots · ${st.n === 'all' ? 'toutes les' : st.n} questions${st.what ? ' · ' + Object.keys(CATS).filter(k => st.what[k]).map(k => CATS[k].label).join(', ') : ''} · ${st.mode === 'qcm' ? 'choix multiples' : st.mode === 'oral' ? 'à l\'oral, chacun son tour' : st.mode === 'speed' ? 'oral chrono, une manche chacun' : 'à écrire'}${isOral(st.mode) ? '' : ` · ${st.time} s par question`} · ${st.adv === 'manual' ? 'bouton « Suivant »' : 'passage automatique'}</p>
          ${missing.length ? `<p class="warn">Il te manque des leçons de cette partie (mets l'appli à jour).</p>` : ''}
          ${isHost() ? '<p class="muted small">Change les textes, le niveau ou le type de questions ci-dessous : ton binôme voit les nouveaux réglages tout de suite.</p>' : "<p class='muted small'>L'hôte choisit les réglages.</p>"}</section>
        ${isHost() ? (() => { const l = S().live, cards = Engine.cards(Engine.itemsFor(sel()), l); return liveSetupPanels(l, Engine.countWhich(cards)); })() : ''}
        ${isHost() ? `<button class="btn primary lg wide" data-a="liveStart" ${o ? '' : 'disabled'}>${o ? 'Lancer la partie' : 'En attente de ton binôme…'}</button>`
          : `<div class="waiting"><span class="dots"><i></i><i></i><i></i></span>En attente du lancement par l'hôte</div>`}`;
    }
    if (playing && isOral(st.mode)) return liveOral(r, quit);
    if (playing) {
      const q = V.qs[V.qi], lim = liveLim(), left = V.paused ? V.paused.left : lim - (Date.now() - V.t0);
      const m = mine(), myA = m.ans && m.ans[V.qi], oA = o && o.ans && o.ans[V.qi];
      const stale = V.stale === V.qi;
      const reveal = myA && (oA || !o || stale);
      const head = `${scoreboard(r)}<div class="livebar"><span class="cnt">Question ${V.qi + 1}/${V.qs.length}</span><span class="timer ${V.paused ? 'paused' : ''}">${ico(V.paused ? 'pause' : 'clock')}<b id="lt">${Math.max(0, Math.ceil(left / 1000))}</b> s</span></div>${timebar(reveal ? 0 : left / lim)}`;
      const pauseBox = V.paused ? `<div class="pausebox">${ico('pause')}<div><b>Partie en pause</b><small>${V.paused.by === Cloud.uid() ? 'Tu as mis en pause.' : `${esc(o ? o.name : 'Ton binôme')} a mis en pause.`} Le chrono est arrêté pour vous deux.</small></div><button class="btn primary" data-a="liveResume">${ico('play')}Reprendre</button></div>` : '';
      const card = questionCard(q, st.mode, V.pick, V.cur, st.h || 'none');
      if (!V.sent) return `${quit}${head}${pauseBox}<div class="${V.paused ? 'frozen' : ''}">${card}</div>
        ${st.mode === 'type' ? `<button class="link osk-toggle" data-a="toggleOsk">${ico('keyboard')} Clavier arabe : ${S().settings.osk ? 'activé' : 'désactivé'}</button>` : ''}
        <div class="oppstat ${oA ? 'ok' : ''}">${o ? (oA ? `${avatar(o)}<span><b>${esc(o.name)}</b> a validé sa réponse</span>${ico('check')}` : `${avatar(o)}<span><b>${esc(o.name)}</b> réfléchit</span><span class="dots"><i></i><i></i><i></i></span>`) : ''}</div>
        <button class="btn primary lg wide" data-a="liveSubmit" ${V.paused ? 'disabled' : ''}>Valider <kbd>Entrée</kbd></button>`;
      const said = a => (a.v ? `<div class="rr-ans">${q.hidden.map(f => { const x = a.v[f]; if (!x) return ''; const t = x[0] ? (F[f].isAr ? ar(x[0], 'md') : esc(x[0])) : '<i class="muted">—</i>'; return `<span class="ra ${x[1] ? 'ok' : 'ko'}"><small>${esc(ASKQ[f] || F[f].fr)}</small>${t}</span>`; }).join('')}</div>` : '');
      const res = (p, a) => a ? `<div class="rr-w"><div class="rr ${a.ok ? 'ok' : 'ko'}">${avatar(p)}<b>${esc(p.name)}</b><span>${a.to ? 'temps écoulé' : (a.ok ? 'juste' : `${a.n}/${q.hidden.length}`)} · ${(a.ms / 1000).toFixed(1)} s</span><em>+${a.pts}</em></div>${said(a)}</div>` : '';
      const manual = st.adv === 'manual' || stale;
      const last = V.qi + 1 >= V.qs.length;
      return `${quit}${head}${pauseBox}${card}
        ${reveal ? `<div class="reveal">${res(m, myA)}${o ? res(o, oA) : ''}
            ${q.item.ex ? `<div class="ex">${ar(q.item.ex)}</div>` : ''}
            ${manual ? `<button class="btn primary lg wide" data-a="liveNext" ${V.paused ? 'disabled' : ''}>${last ? 'Voir les résultats' : 'Question suivante'} ${ico('arrow')}</button><p class="muted small center">Le premier qui clique fait passer les deux joueurs.</p>`
              : `<p class="muted small center">${V.paused ? 'En pause : prenez le temps d\'en discuter.' : 'Question suivante dans un instant… (Pause pour en discuter)'}</p>`}</div>`
          : `<div class="waiting">${o ? avatar(o) : ''}<span>En attente de ${esc(o ? o.name : 'ton binôme')}</span><span class="dots"><i></i><i></i><i></i></span></div>`}`;
    }
    if (r.state === 'done') return liveResult(r);
    return `${quit}<div class="done"><h1>…</h1></div>`;
  };
  function liveOral(r, quit) {
    const st = r.settings, q = V.qs[V.qi], it = q.item, roles = oralRoles(r, V.qi);
    const asking = roles.ask === Cloud.uid(), ansP = r.players[roles.ans] || {}, a = ansP.ans && ansP.ans[V.qi];
    const name = id => esc((r.players[id] || {}).name || 'ton binôme');
    const speed = st.mode === 'speed', last = V.qi + 1 >= V.qs.length, shown = !!a || (asking && (speed || V.shown === V.qi));
    const role = asking ? `${ico('eye')}<span>Tu interroges <b>${name(roles.ans)}</b></span>` : `${ico('mic')}<span>À toi de répondre, <b>à voix haute</b></span>`;
    const holes = q.hidden.map(f => `<div class="hole">${askLabel(f, q.given)}${shown ? `<div class="oral-ans">${val(f, it[f], 'xl')}</div>` : `<div class="oral-mask">${asking ? ico('lock') + ' Réponse cachée' : ico('mic') + ' Dis ta réponse'}</div>`}</div>`).join('');
    const card = `<div class="qcard ${a ? (a.ok ? 'pulse-ok' : 'shake') : ''}"><div class="given">${flabel(q.given)}<div class="gval">${val(q.given, it[q.given], 'xxl')}</div>
      <div class="typ">${esc(T[it.t] ? T[it.t].label : '')}${q.hidden.includes('prep') && it.prepFr ? ` · ${esc('sens : ' + it.prepFr)}` : ''}</div></div><div class="holes">${holes}</div></div>`;
    let ctl;
    if (speed) {
      const turn = V.qi === roles.half ? `<div class="notice turn">${ico('repeat')}<span>${roles.ans === Cloud.uid() ? "Changement de manche : <b>c'est ton tour</b> de répondre, le plus vite possible !" : `Changement de manche : c'est au tour de <b>${name(roles.ans)}</b> de répondre`}</span></div>` : '';
      const pauseBox = V.paused ? `<div class="pausebox">${ico('pause')}<div><b>Partie en pause</b><small>Le chrono est arrêté pour vous deux.</small></div><button class="btn primary" data-a="liveResume">${ico('play')}Reprendre</button></div>` : '';
      const inRound = V.qi < roles.half ? V.qi + 1 : V.qi + 1 - roles.half, roundN = V.qi < roles.half ? roles.half : V.qs.length - roles.half;
      const head = `${scoreboard(r)}${turn}<div class="livebar"><span class="cnt">Manche ${V.qi < roles.half ? 1 : 2} · mot ${inRound}/${roundN}</span><span class="role ${asking ? 'ask' : 'ans'}">${role}</span><span class="timer chrono ${V.paused ? 'paused' : ''}">${ico(V.paused ? 'pause' : 'clock')}<b id="lt">${fmtChrono(roundElapsed(r))}</b></span></div>`;
      const res = a ? `<div class="reveal"><div class="rr ${a.ok ? 'ok' : 'ko'}">${avatar(ansP)}<b>${name(roles.ans)}</b><span>${a.ok ? `juste · ${(a.ms / 1000).toFixed(1)} s` : 'faux'}</span><em>+${a.pts}</em></div></div>`
        : asking ? `<div class="judge top"><button class="btn lg danger" data-a="oralJudge" data-v="0" ${V.paused ? 'disabled' : ''}>${ico('x')}Faux</button><button class="btn lg success" data-a="oralJudge" data-v="1" ${V.paused ? 'disabled' : ''}>${ico('check')}Juste</button></div>`
        : `<div class="waiting">${avatar(r.players[roles.ask] || {})}<span>Vite ! ${name(roles.ask)} valide ta réponse</span><span class="dots"><i></i><i></i><i></i></span></div>`;
      return `${quit}${head}${pauseBox}${asking ? res : ''}<div class="${V.paused ? 'frozen' : ''}">${card}</div>${asking ? '' : res}`;
    }
    if (a) ctl = `<div class="reveal"><div class="rr ${a.ok ? 'ok' : 'ko'}">${avatar(ansP)}<b>${name(roles.ans)}</b><span>${a.ok ? 'juste' : 'faux'}</span><em>+${a.pts}</em></div>
        ${(q.hidden.includes('prep') ? it.prepEx : it.ex) ? `<div class="ex">${ar(q.hidden.includes('prep') ? it.prepEx : it.ex)}</div>` : ''}
        ${st.adv === 'manual' ? `<button class="btn primary lg wide" data-a="liveNext">${last ? 'Voir les résultats' : 'Question suivante'} ${ico('arrow')}</button><p class="muted small center">Le premier qui clique fait passer les deux joueurs.</p>` : '<p class="muted small center">Question suivante dans un instant…</p>'}</div>`;
    else if (asking) ctl = V.shown === V.qi
      ? `<p class="muted small center">Tout est juste ? Une seule faute = faux.</p><div class="judge"><button class="btn lg danger" data-a="oralJudge" data-v="0">${ico('x')}Faux</button><button class="btn lg success" data-a="oralJudge" data-v="1">${ico('check')}Juste</button></div>`
      : `<button class="btn primary lg wide" data-a="oralShow">${ico('eye')}Voir la réponse</button><p class="muted small center">Écoute d'abord la réponse de ${name(roles.ans)}, puis dévoile.</p>`;
    else ctl = `<div class="waiting">${avatar(r.players[roles.ask] || {})}<span>${name(roles.ask)} écoute ta réponse</span><span class="dots"><i></i><i></i><i></i></span></div>`;
    return `${quit}${scoreboard(r)}<div class="livebar"><span class="cnt">Question ${V.qi + 1}/${V.qs.length}</span><span class="role ${asking ? 'ask' : 'ans'}">${role}</span></div>${card}${ctl}`;
  }
  function liveResult(r) {
    const m = mine(), o = opp(), n = V.qs ? V.qs.length : r.settings.n;
    const w = !o ? 1 : m.score > o.score ? 1 : m.score < o.score ? -1 : 0;
    if (!V.celebrated) { V.celebrated = true; later(() => { if (w > 0) { FX.sound.win(); FX.confetti(140); } else if (w < 0) FX.sound.lose(); else FX.sound.ok(); }, 200); }
    const stats = p => {
      const a = Object.values(p.ans || {}); const ok = a.filter(x => x.ok).length;
      const okA = a.filter(x => x.ok), base = r.settings.mode === 'speed' ? okA : a;
      const t = base.length ? base.reduce((s, x) => s + x.ms, 0) / base.length : 0;
      const tot = a.reduce((s, x) => s + (x.ms || 0), 0);
      return { ok, t, tot, n: isOral(r.settings.mode) ? a.length : n };
    };
    const sm = stats(m), so = o ? stats(o) : null;
    const bits = p => Array.from({ length: n }, (_, i) => { const a = p.ans && p.ans[i]; return `<i class="${a ? (a.ok ? 'y' : 'n') : ''}" data-tip="Q${i + 1} : ${a ? (a.ok ? 'juste' : 'faux') + ' · ' + (a.ms / 1000).toFixed(1) + ' s' : '—'}"></i>`; }).join('');
    const rv = o ? S().rivals[o.id] : null;
    return `<div class="stop"><button class="icon quit" data-a="liveQuit" aria-label="Quitter">${ico('x')}</button><span class="roomcode">Salle <b>${esc(V.code)}</b></span></div>
      <div class="done">${doneIcon(w > 0 ? 'trophy' : w < 0 ? 'users' : 'equal', w >= 0 ? 'ok' : '')}
      <h1>${w > 0 ? 'Victoire' : w < 0 ? `${esc(o.name)} gagne` : 'Égalité'}</h1>
      ${scoreboard(r)}
      <table class="vs"><tr><th></th><th>${esc(m.name)}</th><th>${o ? esc(o.name) : ''}</th></tr>
        <tr><td>Points</td><td><b>${m.score}</b></td><td><b>${o ? o.score : ''}</b></td></tr>
        <tr><td>Bonnes réponses</td><td>${sm.ok}/${sm.n}</td><td>${so ? so.ok + '/' + so.n : ''}</td></tr>
        ${r.settings.mode === 'speed' ? `<tr><td>Temps de la manche</td><td>${fmtChrono(sm.tot)}</td><td>${so ? fmtChrono(so.tot) : ''}</td></tr>` : ''}
        ${r.settings.mode === 'oral' ? '' : `<tr><td>${r.settings.mode === 'speed' ? 'Temps moyen (réponses justes)' : 'Temps moyen'}</td><td>${(sm.t / 1000).toFixed(1)} s</td><td>${so ? (so.t / 1000).toFixed(1) + ' s' : ''}</td></tr>`}
        <tr><td>Questions</td><td class="bits">${bits(m)}</td><td class="bits">${o ? bits(o) : ''}</td></tr></table>
      ${rv ? `<p class="h2h">Bilan contre ${esc(o.name)} : <b class="w">${rv.w} victoire${rv.w > 1 ? 's' : ''}</b> · <b class="d">${rv.d} nul${rv.d > 1 ? 's' : ''}</b> · <b class="l">${rv.l} défaite${rv.l > 1 ? 's' : ''}</b></p>` : ''}
      <div class="col">${isHost() ? `<button class="btn primary lg" data-a="liveRematch">Revanche</button>` : `<div class="waiting">L'hôte peut lancer une revanche</div>`}
        <button class="btn ghost" data-a="liveQuit">Quitter la salle</button></div></div>`;
  }
  function recordLive(r) {
    const key = V.code + ':' + r.settings.seed;
    if (V.recorded || S().liveDone.includes(key)) { V.recorded = true; return; }
    V.recorded = true;
    const m = mine(), o = opp(); if (!o) return;
    const rv = S().rivals[o.id] || { name: o.name, photo: o.photo, w: 0, l: 0, d: 0, games: [] };
    const res = m.score > o.score ? 'w' : m.score < o.score ? 'l' : 'd';
    rv[res]++; rv.name = o.name; rv.photo = o.photo; rv.at = Date.now();
    rv.games = [...(rv.games || []), { at: Date.now(), me: m.score, them: o.score, n: r.settings.n }].slice(-30);
    S().rivals[o.id] = rv; S().liveDone.push(key);
    const myOk = Object.values(m.ans || {}).filter(a => a.ok).length;
    Store.addXP(10 + myOk * 2 + (res === 'w' ? 15 : 0));
  }
  function rivalsView() {
    const list = Object.entries(S().rivals).sort((a, b) => (b[1].at || 0) - (a[1].at || 0));
    if (!list.length) return `<section class="panel empty">${ico('users', 'big')}<h3>Pas encore de duel en direct</h3><p class="muted">Après ta première partie, tu verras ici qui est devant.</p></section>`;
    if (!V.profiles && Cloud.st.user && !V.loadingP) { V.loadingP = true; Cloud.profiles([Cloud.uid(), ...list.map(([id]) => id)]).then(p => { V.profiles = p; if (V.name === 'duel') render(); }); }
    const P = V.profiles || {};
    const meP = P[Cloud.uid()] || { xp: S().xp, streak: Store.streak(), mastered: null, level: Store.level().lvl };
    return list.map(([id, rv]) => {
      const tot = rv.w + rv.l + rv.d, p = P[id];
      const ahead = rv.w > rv.l ? 'Tu es devant' : rv.w < rv.l ? `${esc(rv.name)} est devant` : 'À égalité';
      const cmp = (label, a, b) => (a == null || b == null) ? '' : `<tr><td>${label}</td><td class="${a > b ? 'win' : ''}">${a}</td><td class="${b > a ? 'win' : ''}">${b}</td></tr>`;
      return `<section class="panel rival"><div class="row between"><div class="row">${avatar(rv)}<div><b>${esc(rv.name)}</b><small class="muted block">${tot} partie${tot > 1 ? 's' : ''} · ${ahead}</small></div></div>
        <div class="wld"><span class="w">${rv.w}</span><span class="d">${rv.d}</span><span class="l">${rv.l}</span></div></div>
        <div class="wldbar">${tot ? `<b class="w" style="flex:${rv.w}" data-tip="${rv.w} victoire(s)"></b><b class="d" style="flex:${rv.d}" data-tip="${rv.d} nul(s)"></b><b class="l" style="flex:${rv.l}" data-tip="${rv.l} défaite(s)"></b>` : ''}</div>
        <div class="legend"><span><i class="w"></i>Victoires</span><span><i class="d"></i>Nuls</span><span><i class="l"></i>Défaites</span></div>
        ${p ? `<table class="vs"><tr><th></th><th>Toi</th><th>${esc(rv.name)}</th></tr>${cmp('XP total', meP.xp, p.xp)}${cmp('Niveau', meP.level, p.level)}${cmp('Série', meP.streak, p.streak)}${cmp('Mots maîtrisés', meP.mastered, p.mastered)}</table>` : ''}
        ${rv.games && rv.games.length ? `<p class="muted small">Dernières parties : ${rv.games.slice(-5).reverse().map(g => `<span class="gres ${g.me > g.them ? 'w' : g.me < g.them ? 'l' : 'd'}">${g.me}–${g.them}</span>`).join(' ')}</p>` : ''}</section>`;
    }).join('');
  }

  /* ----- Duel sans compte (par code) ----- */
  function codeDuel() {
    const d = V.d || (V.d = { n: 15, mode: 'qcm' });
    const list = S().duels.slice().reverse();
    return `<p class="muted small">Sans compte ni connexion : chacun joue de son côté quand il veut, puis vous échangez vos codes résultat.</p>
      <section class="panel"><h2>Créer un défi</h2><p class="muted small">Contenu : <b>${esc(center().name)}</b> · ${Engine.itemsFor(sel()).length} mots selon ta sélection</p>
        <h3>Questions</h3>${seg('duelOpt', 'n', [[10, '10'], [15, '15'], [25, '25']], d.n)}
        <h3>Réponses</h3>${seg('duelOpt', 'mode', [['qcm', 'Choix multiples'], ['type', 'Écrire']], d.mode)}
        ${V.code ? `<div class="codebox"><textarea readonly rows="3">${esc(V.code)}</textarea>
          <div class="row wrap"><button class="btn sm" data-a="copy" data-text="${esc(V.code)}">${ico('copy')}Copier le code</button>
          ${location.protocol.startsWith('http') ? `<button class="btn sm" data-a="copy" data-text="${esc(location.origin + location.pathname + '#duel=' + V.code)}">${ico('link')}Copier le lien</button>` : ''}</div>
          <button class="btn primary lg wide" data-a="playDuel" data-code="${esc(V.code)}">Jouer mon tour</button></div>`
        : `<button class="btn primary wide" data-a="createDuel">Créer le défi</button>`}</section>
      <section class="panel"><h2>Rejoindre un défi</h2><textarea id="joinCode" rows="3" placeholder="DUEL-…">${esc(V.join || '')}</textarea>
        <button class="btn primary wide" data-a="joinDuel">Lancer le défi</button></section>
      ${list.length ? `<h2 class="sec">Historique</h2>${list.map(duelCard).join('')}` : ''}`;
  }
  function duelCard(dl) {
    const m = dl.mine, t = dl.theirs;
    let verdict = '';
    if (m && t) {
      const w = m.sc !== t.sc ? (m.sc > t.sc ? 1 : -1) : (m.t !== t.t ? (m.t < t.t ? 1 : -1) : 0);
      verdict = `<div class="verdict ${w > 0 ? 'win' : w < 0 ? 'lose' : ''}">${w > 0 ? 'Tu gagnes' : w < 0 ? `${esc(t.by)} gagne` : 'Égalité parfaite'}</div>
        <table class="vs"><tr><th></th><th>${esc(m.by || 'Moi')}</th><th>${esc(t.by || 'Binôme')}</th></tr>
        <tr><td>Score</td><td>${m.sc}/${m.mx}</td><td>${t.sc}/${t.mx}</td></tr>
        <tr><td>Temps</td><td>${fmtTime(m.t)}</td><td>${fmtTime(t.t)}</td></tr>
        <tr><td>Questions</td><td class="bits">${m.b.split('').map(x => `<i class="${x === '1' ? 'y' : 'n'}"></i>`).join('')}</td><td class="bits">${t.b.split('').map(x => `<i class="${x === '1' ? 'y' : 'n'}"></i>`).join('')}</td></tr></table>`;
    }
    return `<section class="panel duelcard"><div class="row between"><b>Défi de ${esc(dl.by || '?')}</b><small class="muted">${new Date(dl.at).toLocaleDateString(I18N.loc())} · ${dl.n} questions</small></div>
      ${verdict || (m ? `<p>Ton score : <b>${m.sc}/${m.mx}</b> en ${fmtTime(m.t)}</p>` : '<p class="muted">Pas encore joué.</p>')}
      ${m && !t ? `<p class="muted small">Envoie ton code résultat, puis colle celui de ton binôme :</p>
        <div class="row"><button class="btn sm" data-a="copy" data-text="${esc(dl.myCode)}">${ico('copy')}Mon code résultat</button></div>
        <div class="row"><input data-paste="${dl.s}" placeholder="RES-… de ton binôme"><button class="btn primary" data-a="pasteRes" data-s="${dl.s}">Comparer</button></div>` : ''}
      ${!m ? `<button class="btn primary" data-a="playDuel" data-code="${esc(dl.code)}">Jouer</button>` : ''}</section>`;
  }
  function duelBox() { const dl = S().duels.find(d => d.s === V.duel.s); return dl ? duelCard(dl) : ''; }
  function playDuel(code) {
    const d = Engine.dec(code, 'DUEL-');
    if (!d || !d.s) { toast('Code de défi invalide'); return; }
    const missing = d.l.filter(id => !LIB.lessons[id]);
    if (missing.length) { toast('Il te manque des leçons de ce défi : ' + missing.join(', '), 5000); return; }
    const old = S().duels.find(x => x.s === d.s);
    if (old && old.mine) { go('duel', { tab: 'code' }); toast('Tu as déjà joué ce défi'); return; }
    if (!old) { S().duels.push({ s: d.s, code, by: d.by, n: d.n, l: d.l, m: d.m, at: Date.now() }); Store.save(); }
    const items = Engine.itemsFor(d.l).slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    startExam(items, { seed: d.s, n: d.n, mode: d.m, boss: false, level: d.h || 'none', duel: d, title: 'Duel' });
  }
  function finishDuel() {
    const dl = S().duels.find(d => d.s === V.duel.s); if (!dl) return;
    dl.mine = { by: S().name || 'Anonyme', sc: V.score, mx: V.max, t: V.time, b: V.res.map(r => (r.ok ? '1' : '0')).join('') };
    dl.myCode = Engine.enc(Object.assign({ s: dl.s }, dl.mine), 'RES-');
    Store.save();
  }

  /* ----- Statistiques ----- */
  function lastDays(n) {
    const out = [], d = new Date();
    d.setDate(d.getDate() - (n - 1));
    for (let i = 0; i < n; i++) { out.push(Store.today(d)); d.setDate(d.getDate() + 1); }
    return out;
  }
  const dfmt = k => new Date(k + 'T12:00:00').toLocaleDateString(I18N.loc(), { day: 'numeric', month: 'short' });
  function barChart(keys, vals, unit) {
    const W = 640, H = 190, padL = 30, padB = 22, padT = 12, n = keys.length;
    const max = Math.max(10, ...vals), nice = Math.ceil(max / 10) * 10;
    const bw = (W - padL) / n, w = Math.max(3, bw - 3);
    const y = v => padT + (H - padT - padB) * (1 - v / nice);
    const path = (x, v) => { const top = y(v), base = H - padB, r = Math.min(4, w / 2, base - top); if (v <= 0) return ''; return `M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top + r}V${base}Z`; };
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Graphique ${unit} par jour">
      ${[0, 0.5, 1].map(f => `<line class="grid" x1="${padL}" x2="${W}" y1="${y(nice * f)}" y2="${y(nice * f)}"/><text class="axis" x="${padL - 6}" y="${y(nice * f) + 4}" text-anchor="end">${Math.round(nice * f)}</text>`).join('')}
      ${keys.map((k, i) => { const x = padL + i * bw + (bw - w) / 2; return `<g class="bar-g" data-tip="${dfmt(k)} : ${vals[i]} ${unit}"><rect class="hit" x="${padL + i * bw}" y="${padT}" width="${bw}" height="${H - padT - padB}"/>${vals[i] > 0 ? `<path class="mark" d="${path(x, vals[i])}"/>` : ''}</g>`; }).join('')}
      ${keys.map((k, i) => (i % 7 === (n - 1) % 7 ? `<text class="axis" x="${padL + i * bw + bw / 2}" y="${H - 6}" text-anchor="middle">${dfmt(k)}</text>` : '')).join('')}
    </svg>`;
  }
  function heatmap() {
    const weeks = 16, d = new Date();
    const dow = (d.getDay() + 6) % 7; // lundi = 0
    d.setDate(d.getDate() - dow - (weeks - 1) * 7);
    const cells = [], vals = Object.values(S().days).map(x => x.xp || 0).filter(Boolean).sort((a, b) => a - b);
    const q = p => vals.length ? vals[Math.min(vals.length - 1, Math.floor(p * vals.length))] : 1;
    const th = [q(.25), q(.5), q(.75)];
    const todayK = Store.today();
    for (let w = 0; w < weeks; w++) for (let i = 0; i < 7; i++) {
      const k = Store.today(d), v = (S().days[k] || {}).xp || 0;
      const lvl = !v ? 0 : v <= th[0] ? 1 : v <= th[1] ? 2 : v <= th[2] ? 3 : 4;
      cells.push(k > todayK ? '<i class="fut"></i>' : `<i class="h${lvl}" data-tip="${dfmt(k)} : ${v} XP"></i>`);
      d.setDate(d.getDate() + 1);
    }
    return `<div class="heat" style="--w:${weeks}">${cells.join('')}</div>
      <div class="heat-leg"><span>Moins</span><i class="h0"></i><i class="h1"></i><i class="h2"></i><i class="h3"></i><i class="h4"></i><span>Plus</span></div>`;
  }
  VIEWS.stats = () => {
    const keys = lastDays(30), D = S().days;
    const xp = keys.map(k => (D[k] || {}).xp || 0);
    const ok = keys.reduce((a, k) => a + ((D[k] || {}).ok || 0), 0), err = keys.reduce((a, k) => a + ((D[k] || {}).err || 0), 0);
    const acc = ok + err ? Math.round(ok / (ok + err) * 100) : null;
    const items = centerDecks().flatMap(d => d.lessons.flatMap(l => l.items));
    const ms = items.map(it => Engine.mastery(it));
    const mastered = ms.filter(m => m >= 0.7).length, learning = ms.filter(m => m > 0 && m < 0.7).length, fresh = ms.length - mastered - learning;
    const tot = Math.max(1, ms.length);
    const active = keys.filter(k => (D[k] || {}).xp).length;
    const hard = Engine.enemies(8).filter(it => items.includes(it));
    return `<button class="link back" data-a="go" data-to="home">${ico('back')}Accueil</button>
      <div class="page-h"><h1>Statistiques</h1><p class="muted">Ton évolution sur ${esc(center().name)}.</p></div>
      <div class="statgrid">
        <div class="stat"><small>XP total</small><b>${S().xp}</b><span>niveau ${Store.level().lvl}</span></div>
        <div class="stat"><small>Série</small><b>${Store.streak()} j</b><span>record ${Store.bestStreak()} j</span></div>
        <div class="stat"><small>Mots maîtrisés</small><b>${mastered}</b><span>sur ${items.length}</span></div>
        <div class="stat"><small>Précision (30 j)</small><b>${acc == null ? '—' : acc + ' %'}</b><span>${ok + err} réponses</span></div>
      </div>
      <section class="panel"><div class="row between"><h2>XP par jour</h2><small class="muted">30 derniers jours · ${active} jours actifs</small></div>${barChart(keys, xp, 'XP')}</section>
      <section class="panel"><h2>Régularité</h2><p class="muted small">Chaque case est un jour des 16 dernières semaines.</p>${heatmap()}</section>
      <section class="panel"><h2>Où en sont tes mots</h2>
        <div class="stack">${[['m', mastered, 'Maîtrisés'], ['lr', learning, 'En cours'], ['f', fresh, 'Pas encore vus']].map(([c, v, l]) => v ? `<b class="${c}" style="flex:${v}" data-tip="${l} : ${v} mots (${Math.round(v / tot * 100)} %)"></b>` : '').join('')}</div>
        <div class="legend"><span><i class="m"></i>Maîtrisés · ${mastered}</span><span><i class="lr"></i>En cours · ${learning}</span><span><i class="f"></i>Pas encore vus · ${fresh}</span></div></section>
      <section class="panel"><h2>Maîtrise par texte</h2>${centerDecks().flatMap(d => d.lessons).map(l => { const m = Engine.lessonMastery(l); return `<div class="mrow"><span>${esc(l.title)}</span>${bar(m)}<b>${Math.round(m * 100)} %</b></div>`; }).join('') || '<p class="muted">Aucun texte.</p>'}</section>
      ${hard.length ? `<section class="panel"><h2>Mots les plus difficiles</h2>${hard.map(it => { const r = S().items[it.id]; return `<div class="mrow"><span>${ar(Engine.head(it), 'sm')} <small class="muted">${esc(it.fr)}</small></span><span class="muted small">${r.err} erreur${r.err > 1 ? 's' : ''} · ${r.ok} juste${r.ok > 1 ? 's' : ''}</span></div>`; }).join('')}</section>` : ''}
      ${Object.keys(S().rivals).length ? `<section class="panel"><div class="row between"><h2>Face à face</h2><button class="link" data-a="openRivals">Voir le bilan</button></div>
        ${Object.values(S().rivals).map(rv => `<div class="mrow"><span class="row">${avatar(rv, 'sm')}${esc(rv.name)}</span><span class="wld"><span class="w">${rv.w}</span><span class="d">${rv.d}</span><span class="l">${rv.l}</span></span></div>`).join('')}</section>` : ''}`;
  };

  /* ----- Compte ----- */
  VIEWS.account = () => {
    const c = Cloud.st, u = c.user;
    const status = { ok: 'Progression synchronisée', sync: 'Synchronisation…', error: 'Erreur de synchronisation', loading: 'Connexion…' }[c.status] || '';
    let acc;
    if (!c.enabled) acc = `<section class="panel empty">${ico('cloud', 'big')}<h3>Comptes bientôt disponibles</h3><p class="muted">Pour se connecter avec Google et retrouver sa progression sur tous ses appareils, l'appli doit être reliée à Firebase. Ta progression reste enregistrée sur cet appareil en attendant.</p></section>`;
    else if (!u) acc = `<section class="panel empty">${ico('user', 'big')}<h3>Crée ton compte</h3><p class="muted">Avec ton compte Google : ta progression est sauvegardée et synchronisée sur ton téléphone et ton PC, et tu peux jouer en direct avec ton binôme.</p>
      ${inappNotice()}<button class="btn google lg" data-a="signIn">${GOOGLE_G}Continuer avec Google</button>${c.error ? `<p class="warn">${esc(c.error)}</p>` : ''}</section>`;
    else acc = `<section class="panel profile">${avatar({ name: S().name || u.displayName, photo: u.photoURL }, 'lg')}<div><h2>${esc(S().name || u.displayName || '')}</h2><p class="muted small">${esc(u.email || '')}</p>
        <p class="sync ${c.status}">${ico(c.status === 'error' ? 'x' : 'cloud')}${status}${c.lastSync ? ` · ${new Date(c.lastSync).toLocaleTimeString(I18N.loc(), { hour: '2-digit', minute: '2-digit' })}` : ''}</p></div>
        <div class="row wrap"><button class="btn sm" data-a="syncNow">${ico('repeat')}Synchroniser</button><button class="btn sm ghost" data-a="signOut">${ico('logout')}Se déconnecter</button></div></section>`;
    return `<div class="page-h"><h1>Mon compte</h1></div>${acc}
      <section class="panel"><h2>Mon centre</h2><p class="muted small">Le centre dont tu révises le vocabulaire.</p>${centerSwitch()}</section>
      <div class="menu">
        <button data-a="go" data-to="stats">${ico('chart')}<span>Statistiques</span>${ico('chevron')}</button>
        <button data-a="openRivals">${ico('users')}<span>Bilan des duels</span>${ico('chevron')}</button>
        <button data-a="go" data-to="settings">${ico('settings')}<span>Réglages</span>${ico('chevron')}</button>
      </div>`;
  };

  /* ----- Mots : chaque compte ajoute / modifie / supprime pour lui-même ; l'admin peut changer la base pour tous ----- */
  const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const deckOf = L => LIB.decks.find(d => d.id === L.deckId);
  const userDeck = id => S().decks.find(d => d.id === id);
  const adminOn = () => Cloud.isAdmin() && !!S().adminMode;
  // mots du livre masqués par ce compte, dans une leçon
  const hiddenIn = L => {
    const raw = (window.DECKS || []).flatMap(d => d.lessons).find(l => l.id === L.id);
    const ids = raw ? raw.items.map((it, i) => it.id || `${L.id}:${i}`) : [];
    return ids.concat((Cloud.base.added[L.id] || []).map(it => it.id)).filter(id => S().hidden[id]);
  };
  VIEWS.words = () => {
    if (V.lesson && LIB.lessons[V.lesson]) return lessonView();
    const decks = centerDecks(), base = decks.filter(d => !d.user), mine = decks.filter(d => d.user);
    const lrow = l => `<button class="lrow" data-a="openLesson" data-id="${esc(l.id)}"><span class="lt">${esc(l.title)} ${ar(l.titleAr || '', 'sm')}</span><span class="cnt">${l.items.length} mots</span>${bar(Engine.lessonMastery(l))}${ico('chevron', 'chev')}</button>`;
    return `<div class="page-h"><h1>Mots</h1><p class="muted">Ajoute, corrige ou supprime les mots comme tu veux : ça ne change que ton compte, jamais celui des autres.</p></div>${centerSwitch()}
      ${adminBar()}
      <button class="addbig" data-a="goImport">${ico('plus')}<div><b>Ajouter des mots</b><small>Colle ta liste, une ligne par mot. Ou importe le paquet d'un ami avec son code.</small></div>${ico('chevron')}</button>
      ${base.filter(d => d.lessons.length).map(d => { const open = OPEN.has(d.id); return `<section class="panel pdeck-w ${open ? 'open' : ''}"><button class="pdeck-tg wide" data-a="togDeck" data-id="${esc(d.id)}" aria-expanded="${open}">${ico('chevron', 'pchev')}<span class="pdeck-t">${ar(d.title, 'md')}<small>${esc(d.subtitle || '')} · ${d.lessons.length} textes · ${d.lessons.reduce((a, l) => a + l.items.length, 0)} mots</small></span><span class="lock">${ico('book')}Livre</span></button>${open ? d.lessons.map(lrow).join('') : ''}</section>`; }).join('')}
      ${base.filter(d => !d.lessons.length).map(d => `<section class="panel pdeck-w soon"><span class="pdeck-tg wide">${ico('lock', 'pchev')}<span class="pdeck-t">${ar(d.title, 'sm')}<small>${esc(d.subtitle || '')} · bientôt</small></span></span></section>`).join('')}
      <h2 class="sec">Mes paquets</h2>
      ${mine.length ? mine.map(d => `<section class="panel"><div class="row between"><div class="pdeck-t"><b class="dname">${esc(d.title)}</b><small>${d.lessons.length} texte${d.lessons.length > 1 ? 's' : ''}</small></div>
          <div class="row"><button class="btn sm ghost" data-a="renameDeck" data-id="${esc(d.id)}">Renommer</button><button class="btn sm ghost danger-t" data-a="delDeck" data-id="${esc(d.id)}">Supprimer</button></div></div>
        ${d.lessons.map(lrow).join('') || '<p class="muted small">Aucun texte.</p>'}</section>`).join('')
        : `<section class="panel empty">${ico('book', 'big')}<h3>Aucun paquet perso</h3><p class="muted">Crée tes propres paquets de mots, en plus de ceux du livre.</p></section>`}
      ${!decks.length ? emptyCenter() : ''}`;
  };
  function adminBar() {
    if (!Cloud.isAdmin()) return '';
    return `<div class="adminbar ${S().adminMode ? 'on' : ''}"><div><b>${ico('crown')} Mode administrateur</b><small>${S().adminMode ? 'Tes ajouts, corrections et suppressions dans les mots du livre s\'appliquent à TOUS les utilisateurs.' : 'Désactivé : tes changements ne concernent que ton compte.'}</small></div>
      <label class="toggle"><input type="checkbox" data-a="setAdmin" ${S().adminMode ? 'checked' : ''}><i></i></label></div>`;
  }
  function lessonView() {
    const L = LIB.lessons[V.lesson], d = deckOf(L), own = d && d.user;
    const selOn = !!V.selMode, picked = V.picked || (V.picked = {});
    const rows = L.items.map(it => {
      const forms = it.t === 'verb' ? [it.mud, it.amr, it.masdar] : [it.pl];
      const tag = it.custom ? '<span class="wtag">perso</span>' : (it.global ? '<span class="wtag g">ajout</span>' : (S().edits[it.id] ? '<span class="wtag">modifié</span>' : ''));
      return `<button class="wrow ${selOn ? 'sel' : ''} ${picked[it.id] ? 'picked' : ''}" data-a="${selOn ? 'pickItem' : 'editItem'}" data-id="${esc(it.id)}">
        ${selOn ? `<span class="cbx">${picked[it.id] ? ico('check') : ''}</span>` : `<span class="dot" style="--m:${Engine.mastery(it)}"></span>`}
        <span class="wh">${ar(Engine.head(it), 'md')}</span><span class="wf">${ar(forms.filter(Boolean).join(' · '), 'sm')}</span><span class="wt">${esc(it.fr)} ${tag}</span></button>`;
    }).join('');
    const nPicked = Object.values(picked).filter(Boolean).length, hid = own ? [] : hiddenIn(L);
    return `<button class="link back" data-a="go" data-to="words">${ico('back')}Mots</button>
      <div class="page-h"><h1>${esc(L.title)} ${ar(L.titleAr || '', 'md')}</h1><p class="muted small">${own ? `Mon paquet « ${esc(d.title)} »` : 'Livre'} · ${L.items.length} mots</p></div>
      ${!own ? adminBar() : ''}
      <div class="row wrap"><button class="btn primary" data-a="lessonReview" data-id="${esc(L.id)}">${ico('cards')}Réviser ce texte</button><button class="btn" data-a="lessonExam" data-id="${esc(L.id)}">${ico('exam')}Examen blanc</button>
        <button class="btn ghost" data-a="copyText" data-id="${esc(L.id)}">${ico('copy')}Copier en texte</button>
        ${own ? `<button class="btn ghost" data-a="shareLesson" data-id="${esc(L.id)}">${ico('link')}Partager</button>` : ''}</div>
      <div class="selbar">${selOn
        ? `<button class="btn sm" data-a="pickAll">Tout sélectionner</button><span class="muted small">${nPicked} sélectionné${nPicked > 1 ? 's' : ''}</span>
           <button class="btn sm danger" data-a="delPicked" ${nPicked ? '' : 'disabled'}>Supprimer</button><button class="btn sm ghost" data-a="selMode">Terminer</button>`
        : `<button class="btn sm" data-a="selMode">${ico('check')}Sélectionner plusieurs mots</button>
           ${own ? `<button class="btn sm" data-a="addToLesson" data-id="${esc(L.id)}">${ico('plus')}Ajouter des mots</button>
             <button class="btn sm ghost" data-a="renameLesson" data-id="${esc(L.id)}">Renommer le texte</button><button class="btn sm ghost danger-t" data-a="delLesson" data-id="${esc(L.id)}">Supprimer le texte</button>`
             : Object.entries(T).map(([k, t]) => `<button class="btn sm" data-a="newItem" data-t="${k}">${ico('plus')}${t.label}</button>`).join('')}`}</div>
      ${hid.length ? `<p class="muted small">${hid.length} mot${hid.length > 1 ? 's' : ''} du livre masqué${hid.length > 1 ? 's' : ''} dans ton compte — <button class="link" data-a="restoreHidden" data-id="${esc(L.id)}">tout réafficher</button></p>` : ''}
      <div class="wlist">${rows || '<p class="muted">Aucun mot.</p>'}</div>
      ${V.edit ? editModal() : ''}`;
  }
  function editModal() {
    const it = V.edit === 'new' ? { t: V.newType } : LIB.items[V.edit];
    if (!it) return '';
    const L = LIB.lessons[it.lessonId || V.lesson], d = L && deckOf(L), isBase = !(d && d.user) && !it.custom;
    const scope = isBase ? (adminOn() ? `<p class="scope admin">${ico('crown')} Mode administrateur : ce changement s'appliquera à TOUS les utilisateurs.</p>` : `<p class="scope">Ce changement ne concerne que ton compte.</p>`) : '';
    return `<div class="modal" data-a="closeEdit"><div class="sheet" data-stop>
      <h2>${V.edit === 'new' ? 'Nouveau' : 'Modifier'} · ${T[it.t].label}</h2>${scope}
      ${T[it.t].edit.map(f => `<label class="fld">${flabel(f)}<input data-ef="${f}" class="${F[f].isAr ? 'ar-input' : ''}" dir="${F[f].isAr ? 'rtl' : 'ltr'}" value="${esc(it[f] || '')}" autocomplete="off"></label>`).join('')}
      <p class="muted small">Plusieurs réponses possibles : sépare-les par « / ». Préposition avec un sens : إِلَى = aller à / مِنْ = venir de</p>
      <div class="row between">${V.edit !== 'new' ? `<button class="btn danger" data-a="delItem">Supprimer</button>` : '<span></span>'}
      <div class="row"><button class="btn ghost" data-a="closeEdit">Annuler</button><button class="btn primary" data-a="saveItem">Enregistrer</button></div></div>
    </div></div>`;
  }
  // supprime des mots : de mes paquets (effacés), du livre (masqués pour moi, ou pour tous en mode admin)
  async function deleteItems(ids) {
    const set = new Set(ids), baseIds = ids.filter(id => { const it = LIB.items[id]; const L = it && LIB.lessons[it.lessonId]; return it && !it.custom && !(L && deckOf(L).user); });
    for (const d of S().decks) for (const l of d.lessons || []) l.items = (l.items || []).filter(it => !set.has(it.id));
    for (const k of Object.keys(S().custom)) S().custom[k] = S().custom[k].filter(it => !set.has(it.id));
    if (baseIds.length && adminOn()) {
      try { await Cloud.saveBase(b => { baseIds.forEach(id => { const it = LIB.items[id]; if (it.global) b.added[it.lessonId] = (b.added[it.lessonId] || []).filter(x => x.id !== id); else b.hidden[id] = true; }); }); }
      catch (e) { toast(e.message, 4000); return; }
    } else baseIds.forEach(id => { S().hidden[id] = 1; });
    for (const id of ids) { if (baseIds.includes(id)) continue; for (const c of Object.keys(S().cards)) if (c.startsWith(id + '|')) delete S().cards[c]; delete S().items[id]; delete S().edits[id]; }
    Store.save(); rebuild();
  }

  /* ----- Ajouter des mots (texte simple) ----- */
  VIEWS.import = () => {
    const im = V.imp || (V.imp = { deck: 'new', lesson: 'new', deckName: '', lessonName: '', text: '' });
    const mine = centerDecks().filter(d => d.user);
    if (im.deck !== 'new' && !mine.some(d => d.id === im.deck)) im.deck = mine.length ? mine[0].id : 'new';
    const d = mine.find(x => x.id === im.deck);
    return `<button class="link back" data-a="go" data-to="words">${ico('back')}Mots</button>
      <div class="page-h"><h1>Ajouter des mots</h1><p class="muted">Écris ou colle ta liste : une ligne = un mot. L'appli reconnaît toute seule les verbes, les noms et les pluriels.</p></div>
      <section class="panel"><h2 class="step"><i>1</i>Où les ranger ?</h2>${centerSwitch()}
        <h3>Paquet</h3><div class="pchips">${mine.map(x => `<button class="pchip ${im.deck === x.id ? 'on' : ''}" data-a="impDeck" data-id="${esc(x.id)}">${esc(x.title)}</button>`).join('')}
          <button class="pchip ${im.deck === 'new' ? 'on' : ''}" data-a="impDeck" data-id="new">${ico('plus')}Nouveau paquet</button></div>
        ${im.deck === 'new' ? `<input class="impf" data-k="deckName" placeholder="Nom du paquet (ex. Mustawa 1, Al-Furqan niveau 2…)" value="${esc(im.deckName)}">` : ''}
        <h3>Texte</h3><div class="pchips">${(d ? d.lessons : []).map(l => `<button class="pchip ${im.lesson === l.id ? 'on' : ''}" data-a="impLesson" data-id="${esc(l.id)}">${esc(l.title)}</button>`).join('')}
          <button class="pchip ${im.lesson === 'new' ? 'on' : ''}" data-a="impLesson" data-id="new">${ico('plus')}Nouveau texte</button></div>
        ${im.lesson === 'new' ? `<input class="impf" data-k="lessonName" placeholder="Nom du texte (ex. Texte 3 · À l'aéroport)" value="${esc(im.lessonName)}">` : ''}</section>
      <section class="panel"><h2 class="step"><i>2</i>Tes mots</h2>
        <details class="fmt"><summary>${ico('hint')} Comment écrire ? (exemples)</summary>
          <table class="fmt-t">${Importer.helpLines().map(([l, x]) => `<tr><td>${esc(l)}</td><td class="fmt-l noi18n">${esc(x)}</td></tr>`).join('')}</table>
          <p class="muted small">Règles : l'arabe d'abord, puis le signe = et la traduction. Les formes d'un verbe sont séparées par /. Le pluriel va entre ( ). Les infos en plus se mettent après |. Tu peux aussi coller des colonnes depuis Excel ou Google Sheets.</p></details>
        <textarea id="impText" rows="9" placeholder="${esc(Importer.EXAMPLE)}">${esc(im.text)}</textarea>
        <div class="row wrap"><button class="btn sm ghost" data-a="impExample">Insérer un exemple</button></div>
        <div id="impPrev">${importPreview()}</div></section>
      <div class="cta-bar"><div class="cta-info" id="impCount">${importCount()}</div><button class="btn primary lg" data-a="impSave">Ajouter</button></div>
      <section class="panel"><h2>Importer le paquet d'un ami</h2><p class="muted small">Ton ami ouvre son texte, clique sur « Partager » et te donne le code.</p>
        <div class="row"><input id="shareCode" class="codein" placeholder="CODE" maxlength="5" autocapitalize="characters"><button class="btn primary" data-a="impCode">Importer</button></div>
        <label class="link">${ico('download')}ou importer un fichier .json<input type="file" accept=".json,application/json" data-a="importDeck" hidden></label></section>`;
  };
  function importPreview() {
    const rows = Importer.parse((V.imp || {}).text || '');
    if (!rows.length) return '<p class="muted small">L\'aperçu de tes mots apparaîtra ici.</p>';
    return `<div class="prev">${rows.map(r => r.item
      ? `<div class="pv-row"><span class="tag t-${r.item.t}">${T[r.item.t].label}</span><span class="ar sm" dir="rtl">${esc(r.item.t === 'verb' ? [r.item.madi, r.item.mud, r.item.amr, r.item.masdar].filter(Boolean).join(' · ') : r.item.w + (r.item.pl ? ' — ' + r.item.pl : ''))}</span><span class="pv-fr">${esc(r.item.fr)}</span>
        <span class="pv-x">${[r.item.prep && 'حرف : ' + r.item.prep, r.item.ant && 'contraire', r.item.syn && 'synonyme', r.item.ex && 'phrase'].filter(Boolean).map(esc).join(' · ')}</span></div>`
      : `<div class="pv-row err"><span class="tag t-err">À corriger</span><span class="pv-raw">${esc(r.raw)}</span><span class="pv-fr">${esc(r.error)}</span></div>`).join('')}</div>`;
  }
  function importCount() {
    const rows = Importer.parse((V.imp || {}).text || ''), ok = rows.filter(r => r.item).length, bad = rows.length - ok;
    return `<b>${ok}</b> mot${ok > 1 ? 's' : ''} prêt${ok > 1 ? 's' : ''}${bad ? `<small class="koc">${bad} ligne${bad > 1 ? 's' : ''} à corriger</small>` : '<small>vérifie l\'aperçu</small>'}`;
  }
  function importSave() {
    const im = V.imp, rows = Importer.parse(im.text || '').filter(r => r.item);
    if (!rows.length) { toast('Ajoute au moins un mot valide'); return; }
    let d = im.deck === 'new' ? null : userDeck(im.deck);
    if (!d) { d = { id: 'u' + rid(), center: S().center, title: im.deckName.trim() || 'Mes mots', subtitle: 'Mon paquet', order: 500, user: true, lessons: [] }; S().decks.push(d); }
    let l = im.lesson === 'new' ? null : d.lessons.find(x => x.id === im.lesson);
    if (!l) { l = { id: d.id + '-' + rid(), title: im.lessonName.trim() || `Texte ${d.lessons.length + 1}`, items: [] }; d.lessons.push(l); }
    rows.forEach(r => l.items.push(Object.assign({ id: 'w' + rid() }, r.item)));
    Store.save(); rebuild(); V.imp = null;
    toast(`${rows.length} mot${rows.length > 1 ? 's' : ''} ajouté${rows.length > 1 ? 's' : ''}`);
    go('words', { lesson: l.id });
  }
  function addSharedPack(p) {
    if (!p || !p.deck || !p.lesson) throw new Error('Paquet invalide');
    let d = userDeck(p.deck.id);
    if (!d) { d = Object.assign({ order: 500, subtitle: 'Paquet partagé' }, p.deck, { user: true, lessons: [] }); S().decks.push(d); }
    d.lessons = d.lessons.filter(l => l.id !== p.lesson.id).concat([p.lesson]);
    Store.save(); rebuild();
    return p.lesson;
  }

  /* ----- Réglages ----- */
  VIEWS.settings = () => {
    const st = S().settings;
    const radio = (k, v, l, d) => `<label class="radio ${st[k] === v ? 'on' : ''}"><input type="radio" name="${k}" data-a="setting" data-k="${k}" data-v="${v}" ${st[k] === v ? 'checked' : ''}><span><b>${l}</b>${d ? `<small>${d}</small>` : ''}</span></label>`;
    const tog = (k, l) => `<label class="toggle"><span>${l}</span><input type="checkbox" data-a="setBool" data-k="${k}" ${st[k] ? 'checked' : ''}><i></i></label>`;
    return `<button class="link back" data-a="go" data-to="account">${ico('back')}Mon compte</button><div class="page-h"><h1>Réglages</h1></div>
      <section class="panel"><h3>Prénom</h3><div class="row"><input id="nameIn" value="${esc(S().name)}" maxlength="20"><button class="btn" data-a="saveName">OK</button></div></section>
      <section class="panel"><h3>Correction des harakat (quand tu écris)</h3>
        ${radio('harakat', 'none', 'Souple', 'Seules les lettres comptent. Idéal pour commencer.')}
        ${radio('harakat', 'mudari', 'Voyelle du muḍāriʿ', 'Lettres + la voyelle de la ʿayn au présent (يَفْعَلُ / يَفْعِلُ / يَفْعُلُ).')}
        ${radio('harakat', 'strict', 'Strict', 'Toutes les harakat doivent être exactes.')}</section>
      <section class="panel"><h3>Objectifs</h3>
        <label class="fld">Nouvelles cartes par jour (répétition espacée)<input type="number" min="0" max="200" value="${st.newPerDay}" data-a="setNum" data-k="newPerDay"></label>
        <label class="fld">Objectif quotidien (XP)<input type="number" min="10" max="1000" value="${st.goal}" data-a="setNum" data-k="goal"></label></section>
      <section class="panel"><h3>Affichage et sons</h3>
        ${radio('theme', 'auto', 'Automatique')}${radio('theme', 'light', 'Clair')}${radio('theme', 'dark', 'Sombre')}</section>
      <section class="panel"><h3>Langue</h3><div class="pchips">${Object.entries(I18N.LANGS).map(([k, l]) => `<button class="pchip noi18n ${k === I18N.lang ? 'on' : ''}" data-a="setLang" data-v="${k}">${l.name}</button>`).join('')}</div>
        <p class="muted small">Change toute l'interface et le sens des mots du livre.</p></section>
      <section class="panel"><h3>Sons et clavier</h3>
        ${tog('sound', 'Effets sonores')}${tog('osk', 'Clavier arabe à l\'écran (remplace celui du téléphone)')}</section>
      <section class="panel"><h3>Sauvegarde</h3><p class="muted small">${Cloud.st.user ? 'Ta progression est synchronisée avec ton compte.' : 'Ta progression est enregistrée sur cet appareil. Connecte-toi pour la synchroniser, ou exporte-la.'}</p>
        <div class="row wrap"><button class="btn sm" data-a="exportAll">${ico('upload')}Exporter</button>
        <label class="btn sm">${ico('download')}Restaurer<input type="file" accept=".json" data-a="importAll" hidden></label>
        <button class="btn sm danger" data-a="resetAll">Tout réinitialiser</button></div></section>`;
  };

  /* ================= ACTIONS ================= */
  const A = {
    go: b => go(b.dataset.to),
    quit: () => {
      if (V.name === 'exam' && V.duel && !V.over && !confirm('Abandonner le duel ? Ton tour ne pourra pas être rejoué.')) return;
      const back = V.duel ? ['duel', { tab: 'code' }] : V.name === 'paper' ? ['examSetup'] : V.name === 'exam' && !V.review ? ['games'] : V.name === 'exam' || V.name === 'flash' ? ['reviewSetup'] : ['gameSetup', { game: V.name }];
      go(back[0], back[1] || {});
    },
    saveName: () => { const v = (document.getElementById('nameIn').value || '').trim(); if (!v) return; S().name = v; Store.save(); toast('Enregistré'); render(); },
    setCenter: b => { S().center = b.dataset.v; Store.save(); FX.sound.tap(); render(); liveLobbySync(); },
    selLesson: b => { const id = b.dataset.id, s = S().sel; const i = s.indexOf(id); if (i >= 0) s.splice(i, 1); else s.push(id); Store.save(); FX.sound.tap(); render(); liveLobbySync(); },
    selDeck: b => {
      const d = LIB.decks.find(x => x.id === b.dataset.id); const ids = d.lessons.map(l => l.id);
      const allOn = ids.every(id => S().sel.includes(id));
      S().sel = S().sel.filter(id => !ids.includes(id)); if (!allOn) S().sel.push(...ids);
      Store.save(); FX.sound.tap(); render(); liveLobbySync();
    },
    togDeck: b => { const id = b.dataset.id; OPEN.has(id) ? OPEN.delete(id) : OPEN.add(id); FX.sound.tap(); render(); },
    selNone: () => { S().sel = []; Store.save(); render(); liveLobbySync(); },
    quickReview: () => {
      const cards = Engine.cards(Engine.itemsFor(sel()), S().rev);
      if (Engine.srsQueue(cards).length) { S().rev.mode = 'flip'; S().rev.which = 'due'; Store.save(); startRevision(); }
      else go('reviewSetup');
    },
    quickMode: b => { S().rev.mode = b.dataset.v; Store.save(); go('reviewSetup'); },
    goImport: () => go('import'),
    langMenu: () => { V.langOpen = !V.langOpen; render(); },
    setLang: b => { V.langOpen = false; if (b.dataset.v === S().settings.lang) { render(); return; } S().settings.lang = b.dataset.v; Store.save(); Store.saveNow(); location.reload(); },
    toggleTheme: () => { S().settings.theme = isDark() ? 'light' : 'dark'; Store.save(); applyTheme(); render(); },
    reviseDeck: b => { const d = LIB.decks.find(x => x.id === b.dataset.id); S().sel = d.lessons.map(l => l.id); Store.save(); go('reviewSetup'); },
    revOpt: b => { S().rev[b.dataset.k] = parseV(b.dataset.v); Store.save(); FX.sound.tap(); render(); },
    revWhat: b => { const w = S().rev.what; w[b.dataset.k] = !w[b.dataset.k]; Store.save(); FX.sound.tap(); render(); },
    gameWhat: b => { const w = S().game.what; w[b.dataset.k] = !w[b.dataset.k]; Store.save(); FX.sound.tap(); render(); },
    startRevision: () => startRevision(),
    flip: () => flip(),
    grade: b => grade(+b.dataset.g),
    cram: b => cram(b.dataset.v === '1'),
    examOpt: b => { S().exam[b.dataset.k] = parseV(b.dataset.v); Store.save(); render(); },
    startExam: () => startExam(Engine.itemsFor(sel())),
    startBoss: () => startExam(Engine.itemsFor(sel()), { boss: true, mode: 'type', n: 'all', title: 'Boss' }),
    lessonExam: b => startExam(LIB.lessons[b.dataset.id].items),
    lessonReview: b => { S().sel = [b.dataset.id]; Store.save(); go('reviewSetup'); },
    fightEnemies: () => { const en = Engine.enemies(15); if (en.length < 2) { toast('Pas encore assez de mots difficiles'); return; } startExam(en, { n: 'all', title: 'Mots difficiles' }); },
    retryWrong: () => {
      const qs = V.res.filter(r => !r.ok).map(r => V.qs[r.qi]).filter(Boolean);
      startExamQs(qs, { mode: V.mode, boss: false, title: V.title, review: V.review });
    },
    pick: b => {
      if (V.name === 'live') { if (V.sent) return; const q = V.qs[V.qi]; V.pick[b.dataset.f] = q.options[b.dataset.f][+b.dataset.k]; FX.sound.tap(); render(); return; }
      if (V.phase !== 'ask') return; const q = V.qs[V.i]; V.pick[b.dataset.f] = q.options[b.dataset.f][+b.dataset.k]; FX.sound.tap(); render();
    },
    examCheck: () => examCheck(),
    examNext: () => examNext(),
    override: () => {
      const q = V.qs[V.i], r = V.res[V.res.length - 1];
      const nWrong = q.hidden.filter(f => !V.cur[f].ok).length;
      q.hidden.forEach(f => { V.cur[f].ok = true; });
      V.score += nWrong; r.ok = true;
      if (V.lives != null) V.lives++;
      if (!V.duel) { const it = S().items[q.item.id]; if (it && it.err) { it.err--; it.ok++; Store.save(); } }
      render();
    },
    toggleOsk: () => { S().settings.osk = !S().settings.osk; Store.save(); render(); },
    openGame: b => go('gameSetup', { game: b.dataset.v }),
    startGame: b => startGame(b.dataset.v || V.game),
    rushPick: b => rushPick(+b.dataset.k),
    tfPick: b => tfPick(+b.dataset.v),
    rainPick: b => rainResolve(+b.dataset.k),
    tile: b => { if (V.fb) return; const i = +b.dataset.i; if (V.built.includes(i)) return; V.built.push(i); FX.sound.tap(); render(); anaCheck(); },
    anaBack: () => { V.built.pop(); render(); },
    anaHint: () => {
      const q = V.q;
      let k = 0; while (k < V.built.length && q.tiles[V.built[k]].ch === q.letters[k]) k++;
      V.built = V.built.slice(0, k);
      const next = q.tiles.findIndex((t, i) => t.ch === q.letters[k] && !V.built.includes(i));
      if (next >= 0) { V.built.push(next); V.hints++; }
      render(); anaCheck();
    },
    anaSkip: () => { V.fb = { ok: false, reveal: true }; Store.answer(V.q.item.id, false); FX.sound.bad(); render(); later(anaNext, 1500); },
    duelTab: b => { V.tab = b.dataset.tab; render(); },
    openRivals: () => go('duel', { tab: 'rivals' }),
    duelOpt: b => { V.d[b.dataset.k] = parseV(b.dataset.v); V.code = null; render(); },
    createDuel: () => {
      const d = { s: Math.floor(Math.random() * 2 ** 31), l: sel(), n: V.d.n, m: V.d.mode, h: S().settings.harakat, by: S().name || 'Anonyme' };
      V.code = Engine.enc(d, 'DUEL-'); render();
    },
    playDuel: b => playDuel(b.dataset.code),
    joinDuel: () => playDuel(document.getElementById('joinCode').value),
    pasteRes: b => {
      const s = +b.dataset.s, inp = app.querySelector(`[data-paste="${s}"]`);
      const r = Engine.dec(inp && inp.value, 'RES-');
      if (!r) { toast('Code résultat invalide'); return; }
      if (r.s !== s) { toast('Ce résultat correspond à un autre défi'); return; }
      const dl = S().duels.find(d => d.s === s); dl.theirs = r; Store.save(); render();
    },
    copy: b => copy(b.dataset.text),
    // compte
    signIn: async () => {
      try { await Cloud.signIn(); }
      catch (e) { if (e.code === 'inapp') { inappHelp = true; render(); } else toast('Connexion impossible : ' + (e.message || e.code), 5000); }
    },
    inappHelp: () => { inappHelp = true; render(); },
    closeInapp: () => { inappHelp = false; render(); },
    signOut: async () => { if (!confirm('Se déconnecter ? Ta progression reste aussi sur cet appareil.')) return; await Cloud.signOut(); toast('Déconnecté'); render(); },
    syncNow: async () => { await Cloud.pull(); rebuild(); render(); toast('Synchronisé'); },
    // duel en direct
    liveWhat: b => { const w = S().live.what; w[b.dataset.k] = !w[b.dataset.k]; Store.save(); FX.sound.tap(); render(); liveLobbySync(); },
    liveOpt: b => { S().live[b.dataset.k] = parseV(b.dataset.v); if (b.dataset.k === 'mode') S().live.time = S().live.mode === 'type' ? 60 : S().live.mode === 'speed' ? 10 : 30; Store.save(); render(); liveLobbySync(); },
    liveCreate: async b => {
      b.disabled = true;
      const l = S().live;
      const settings = { l: sel(), n: l.n, mode: l.mode, time: l.time, adv: l.adv, what: Object.assign({}, l.what), dir: l.dir, which: l.which, order: l.order, h: S().settings.harakat, seed: Math.floor(Math.random() * 2 ** 31) };
      try { const c = await Cloud.createRoom(settings); openLive(c); } catch (e) { b.disabled = false; toast('Erreur : ' + e.message, 4000); }
    },
    liveJoin: async b => {
      const c = (document.getElementById('liveCode').value || '').trim().toUpperCase();
      if (c.length < 4) { toast('Entre le code de la salle'); return; }
      b.disabled = true;
      try { await Cloud.joinRoom(c); openLive(c); } catch (e) { b.disabled = false; toast(e.message, 4000); }
    },
    liveSet: b => { const st = Object.assign({}, V.room.settings, { [b.dataset.k]: parseV(b.dataset.v) }); if (b.dataset.k === 'mode') st.time = st.mode === 'type' ? 60 : st.mode === 'speed' ? 10 : 30; Cloud.updateSettings(V.code, st); },
    liveUseSel: () => { const l = S().live; Cloud.updateSettings(V.code, Object.assign({}, V.room.settings, { l: sel(), what: Object.assign({}, l.what), dir: l.dir, which: l.which, order: l.order })); },
    liveStart: () => {
      const st = Object.assign({}, V.room.settings, { seed: Math.floor(Math.random() * 2 ** 31) });
      if (st.what) { st.cards = liveCardList(st); if (!st.cards.length) { toast('Aucune carte avec ces réglages. Choisis « Tous les mots » ou d\'autres textes.', 4000); return; } }
      Cloud.updateSettings(V.code, st).then(() => Cloud.startRoom(V.code));
    },
    liveSubmit: () => submitLive(false),
    liveStop: () => { if (!V.room || !confirm('Arrêter la partie ? Vous restez tous les deux dans la salle et pouvez en relancer une.')) return; Cloud.rematch(V.code, Object.assign({}, V.room.settings)).catch(e => toast(e.message)); },
    oralShow: () => { V.shown = V.qi; FX.sound.flip(); render(); },
    oralJudge: b => {
      if (!V.room || V.judging === V.qi) return;
      if (V.paused) return;
      const ok = b.dataset.v === '1', roles = oralRoles(V.room, V.qi), q = V.qs[V.qi];
      const speed = V.room.settings.mode === 'speed', ms = speed ? Date.now() - V.t0 : 0;
      const pts = ok ? 100 + (speed ? Math.round(100 * Math.max(0, 1 - ms / SPEED_REF)) : 0) : 0;
      V.judging = V.qi;
      Cloud.judge(V.code, V.qi, roles.ans, { ok, n: ok ? q.hidden.length : 0, pts, ms, oral: true })
        .then(() => (ok ? FX.sound.ok() : FX.sound.bad())).catch(e => { V.judging = null; toast(e.message); });
    },
    liveRematch: () => { const st = Object.assign({}, V.room.settings, { seed: Math.floor(Math.random() * 2 ** 31) }); if (st.what) st.cards = liveCardList(st); Cloud.rematch(V.code, st); },
    liveQuit: () => { if (V.room && V.room.state === 'playing' && !confirm('Quitter la partie en cours ?')) return; history.replaceState(null, '', location.pathname); go('duel', { tab: 'live' }); },
    livePause: () => { if (!V.room || V.paused) return; Cloud.pause(V.code, V.qi, liveLim() - (Date.now() - V.t0)).catch(e => toast(e.message)); },
    liveResume: () => Cloud.resume(V.code).catch(e => toast(e.message)),
    liveNext: b => { b.disabled = true; Cloud.advanceFrom(V.code, V.qi, V.qs.length).catch(e => { b.disabled = false; toast(e.message); }); },
    homeLiveCreate: () => go('duel', { tab: 'live' }),
    homeLiveJoin: () => {
      const c = (document.getElementById('homeCode').value || '').trim().toUpperCase();
      if (!Cloud.st.user || c.length < 4) { go('duel', { tab: 'live', joinCode: c }); if (c.length < 4) toast('Entre le code donné par ton binôme'); return; }
      Cloud.joinRoom(c).then(() => openLive(c)).catch(e => toast(e.message, 4000));
    },
    // examen blanc
    paperSec: b => { const s = S().paper.sections, k = b.dataset.k, i = s.indexOf(k); if (i >= 0) s.splice(i, 1); else s.push(k); S().paper.sections = Object.keys(Engine.SECTIONS).filter(x => s.includes(x)); Store.save(); render(); },
    paperOpt: b => { S().paper[b.dataset.k] = parseV(b.dataset.v); Store.save(); render(); },
    startPaper: () => startPaper(),
    paperTab: b => { V.si = +b.dataset.i; render(); window.scrollTo(0, 0); },
    ppick: b => { const q = V.secs.flatMap(s => s.qs).find(x => x.qid === b.dataset.q); (V.ans[q.qid] = V.ans[q.qid] || {})[b.dataset.f] = q.options[b.dataset.f][+b.dataset.k]; FX.sound.tap(); render(); },
    submitPaper: () => submitPaper(false),
    planCards: b => {
      const s = V.result.secs.find(x => x.key === b.dataset.k);
      const items = [...new Set(s.qs.filter(x => !x.ok).map(x => LIB.items[x.q.item.id]).filter(Boolean))];
      const list = Engine.shuffle(Engine.cards(items, { dir: 'both', what: SEC_CATS[b.dataset.k] }));
      if (!list.length) { toast('Rien à réviser ici'); return; }
      V.done = false; go('flash', { mode: 'cram', q: list, i: 0, flip: false, n: 0, xp: 0, total: list.length, known: 0, unknown: 0, seen: {} });
    },
    planRedo: b => { const s = V.result.secs.find(x => x.key === b.dataset.k); const items = [...new Set(s.qs.filter(x => !x.ok).map(x => LIB.items[x.q.item.id]).filter(Boolean))]; V.done = false; startPaper(items, { sections: [s.key], size: 'all' }); },
    redoWrong: () => { const items = [...new Set(V.result.secs.flatMap(s => s.qs.filter(x => !x.ok).map(x => LIB.items[x.q.item.id])).filter(Boolean))]; const secs = V.result.secs.filter(s => s.pct < 1).map(s => s.key); V.done = false; startPaper(items, { sections: secs, size: 'all' }); },
    gameOpt: b => { S().game[b.dataset.k] = parseV(b.dataset.v); Store.save(); render(); },
    // mots
    openLesson: b => go('words', { lesson: b.dataset.id }),
    editItem: b => { V.edit = b.dataset.id; render(); },
    newItem: b => { V.edit = 'new'; V.newType = b.dataset.t; render(); },
    closeEdit: () => { V.edit = null; render(); },
    saveItem: async () => {
      const data = {}; app.querySelectorAll('[data-ef]').forEach(i => { data[i.dataset.ef] = i.value.trim(); });
      const L = LIB.lessons[V.lesson], ud = L && userDeck(L.deckId);
      if (V.edit === 'new') {
        const t = V.newType, hf = t === 'verb' ? 'madi' : 'w';
        if (!data[hf]) { toast('Le mot arabe est obligatoire'); return; }
        Object.keys(data).forEach(k => { if (!data[k]) delete data[k]; });
        const item = Object.assign({ id: 'w' + rid(), t }, data);
        if (ud) ud.lessons.find(l => l.id === L.id).items.push(item);                       // mon paquet
        else if (adminOn()) { try { await Cloud.saveBase(b => { (b.added[L.id] = b.added[L.id] || []).push(item); }); } catch (e) { toast(e.message, 4000); return; } }
        else (S().custom[L.id] = S().custom[L.id] || []).push(item);                         // ajout perso au livre
      } else {
        const it = LIB.items[V.edit];
        const ul = it && userDeck(it.deckId) ? userDeck(it.deckId).lessons.find(l => l.id === it.lessonId) : null;
        const raw = ul ? ul.items.find(x => x.id === it.id) : null;
        if (raw) Object.assign(raw, data);                                                   // mot de mon paquet
        else if (!it.custom && adminOn()) {                                                  // admin : pour tout le monde
          try { await Cloud.saveBase(b => { if (it.global) { const a = (b.added[it.lessonId] || []).find(x => x.id === it.id); if (a) Object.assign(a, data); } else b.edits[it.id] = Object.assign(b.edits[it.id] || {}, data); }); }
          catch (e) { toast(e.message, 4000); return; }
        } else S().edits[V.edit] = Object.assign(S().edits[V.edit] || {}, data);            // perso, ce compte seulement
      }
      Store.save(); rebuild(); V.edit = null; toast(adminOn() && !ud ? 'Enregistré pour tout le monde' : 'Enregistré'); render();
    },
    delItem: async () => { if (!confirm('Supprimer ce mot ?')) return; await deleteItems([V.edit]); V.edit = null; render(); },
    restoreHidden: b => { hiddenIn(LIB.lessons[b.dataset.id]).forEach(id => { delete S().hidden[id]; }); Store.save(); rebuild(); render(); },
    selMode: () => { V.selMode = !V.selMode; V.picked = {}; render(); },
    pickItem: b => { V.picked[b.dataset.id] = !V.picked[b.dataset.id]; render(); },
    pickAll: () => { const L = LIB.lessons[V.lesson]; const all = L.items.every(it => V.picked[it.id]); L.items.forEach(it => { V.picked[it.id] = !all; }); render(); },
    delPicked: async () => {
      const ids = Object.keys(V.picked).filter(k => V.picked[k]);
      if (!ids.length || !confirm(`Supprimer ${ids.length} mot${ids.length > 1 ? 's' : ''} ?`)) return;
      await deleteItems(ids); V.picked = {}; V.selMode = false; toast('Supprimé'); render();
    },
    renameDeck: b => { const d = userDeck(b.dataset.id); const t = prompt('Nouveau nom du paquet :', d.title); if (!t) return; d.title = t.trim(); Store.save(); rebuild(); render(); },
    delDeck: b => {
      const d = userDeck(b.dataset.id); const n = d.lessons.reduce((a, l) => a + (l.items || []).length, 0);
      if (!confirm(`Supprimer le paquet « ${d.title} » et ses ${n} mots ? Ta progression sur ces mots sera effacée.`)) return;
      deleteItems(d.lessons.flatMap(l => (l.items || []).map(it => it.id)));
      S().decks = S().decks.filter(x => x.id !== d.id); Store.save(); rebuild(); render();
    },
    renameLesson: b => { const L = LIB.lessons[b.dataset.id], l = userDeck(L.deckId).lessons.find(x => x.id === L.id); const t = prompt('Nouveau nom du texte :', l.title); if (!t) return; l.title = t.trim(); Store.save(); rebuild(); render(); },
    delLesson: b => {
      const L = LIB.lessons[b.dataset.id], d = userDeck(L.deckId);
      if (!confirm(`Supprimer le texte « ${L.title} » (${L.items.length} mots) ?`)) return;
      deleteItems(L.items.map(it => it.id)); d.lessons = d.lessons.filter(l => l.id !== L.id); Store.save(); rebuild(); go('words');
    },
    addToLesson: b => { const L = LIB.lessons[b.dataset.id]; S().center = deckOf(L).center; go('import', { imp: { deck: L.deckId, lesson: L.id, deckName: '', lessonName: '', text: '' } }); },
    copyText: b => copy(Importer.toText(LIB.lessons[b.dataset.id].items)),
    shareLesson: async b => {
      if (!Cloud.st.user) { toast('Connecte-toi (Mon compte) pour partager un paquet', 3500); return; }
      const L = LIB.lessons[b.dataset.id], d = userDeck(L.deckId), l = d.lessons.find(x => x.id === L.id);
      try {
        const c = await Cloud.share({ deck: { id: d.id, title: d.title, subtitle: d.subtitle, center: d.center }, lesson: l });
        copy(c); toast(`Code de partage : ${c} (copié). Ton ami le colle dans « Ajouter des mots ».`, 7000);
      } catch (e) { toast('Partage impossible : ' + e.message, 4000); }
    },
    impDeck: b => { V.imp.deck = b.dataset.id; V.imp.lesson = 'new'; render(); },
    impLesson: b => { V.imp.lesson = b.dataset.id; render(); },
    impExample: () => { V.imp.text = (V.imp.text ? V.imp.text.trim() + '\n' : '') + Importer.EXAMPLE; render(); },
    impSave: () => importSave(),
    impCode: async () => {
      const c = (document.getElementById('shareCode').value || '').trim();
      if (c.length < 4) { toast('Entre le code de partage'); return; }
      if (!Cloud.st.user) { toast('Connecte-toi (Mon compte) pour importer avec un code', 3500); return; }
      try { const l = addSharedPack(await Cloud.getShared(c)); toast(`Texte « ${l.title} » importé`); go('words', { lesson: l.id }); } catch (e) { toast(e.message, 4000); }
    },
    setting: b => { S().settings[b.dataset.k] = b.dataset.v; Store.save(); applyTheme(); render(); },
    exportAll: () => download(`murajaa-sauvegarde-${Store.today()}.json`, S()),
    resetAll: () => { if (!confirm('Effacer toute ta progression, tes modifications et tes duels ?')) return; Store.S = Store.defaults(); Store.save(); rebuild(); go('home'); }
  };

  async function readJSON(input) { const f = input.files && input.files[0]; if (!f) return null; try { return JSON.parse(await f.text()); } catch (e) { toast('Fichier illisible'); return null; } }
  const CHANGE = {
    setNum: b => { S().settings[b.dataset.k] = Math.max(0, +b.value || 0); Store.save(); },
    setBool: b => { S().settings[b.dataset.k] = b.checked; Store.save(); if (b.dataset.k === 'sound' && b.checked) FX.sound.ok(); },
    setAdmin: b => { S().adminMode = b.checked; Store.save(); render(); },
    importDeck: async b => {
      const data = await readJSON(b); if (!data) return;
      const decks = Array.isArray(data) ? data : [data];
      let n = 0;
      for (const d of decks) {
        if (!d || !d.id || !Array.isArray(d.lessons)) continue;
        const builtIn = (window.DECKS || []).find(x => x.id === d.id);
        if (builtIn) {
          const known = new Set(builtIn.lessons.map(l => l.id));
          d.lessons = d.lessons.filter(l => !known.has(l.id)); d.id = d.id + '-import';
          if (!d.lessons.length) continue;
        }
        const i = S().decks.findIndex(x => x.id === d.id);
        const deck = Object.assign({ order: 50, user: true, center: S().center }, d);
        if (i >= 0) S().decks[i] = deck; else S().decks.push(deck);
        n += d.lessons.length;
      }
      Store.save(); rebuild(); toast(n ? `${n} leçon(s) importée(s)` : 'Rien de nouveau à importer'); render();
    },
    importAll: async b => {
      const data = await readJSON(b); if (!data || !data.cards) { toast('Ce n\'est pas une sauvegarde valide'); return; }
      if (!confirm('Remplacer ta progression actuelle par cette sauvegarde ?')) return;
      data.updatedAt = Date.now();
      Store.replace(data); Store.save(); rebuild(); applyTheme(); go('home'); toast('Sauvegarde restaurée');
    }
  };

  app.addEventListener('click', e => {
    if (V.langOpen && !e.target.closest('.langw')) { V.langOpen = false; render(); }
    const b = e.target.closest('[data-a]'); if (!b) return;
    if (b.tagName === 'INPUT' && (b.type === 'file' || b.type === 'number' || b.type === 'checkbox')) return;
    if (b.classList.contains('modal') && e.target.closest('[data-stop]')) return;
    if (b.disabled) return;
    const fn = A[b.dataset.a]; if (fn) fn(b, e);
  });
  app.addEventListener('change', e => { const b = e.target.closest('[data-a]'); if (b && CHANGE[b.dataset.a]) CHANGE[b.dataset.a](b, e); });
  // saisie : réponses de l'examen blanc, liste de mots à importer
  let prevT = null;
  app.addEventListener('input', e => {
    const t = e.target;
    if (t.classList.contains('pin') && V.name === 'paper') {
      (V.ans[t.dataset.q] = V.ans[t.dataset.q] || {})[t.dataset.f] = t.value;
      const done = V.answered(), total = V.secs.reduce((a, s) => a + s.qs.length, 0);
      const pb = app.querySelector('.stop .prog b'), c = app.querySelector('.stop .cnt');
      if (pb) pb.style.width = Math.round(done / total * 100) + '%'; if (c) c.textContent = `${done}/${total}`;
    } else if (V.name === 'import' && V.imp) {
      if (t.id === 'impText') {
        V.imp.text = t.value;
        clearTimeout(prevT); prevT = setTimeout(() => { const p = document.getElementById('impPrev'), n = document.getElementById('impCount'); if (p) p.innerHTML = importPreview(); if (n) n.innerHTML = importCount(); }, 250);
      } else if (t.classList.contains('impf')) V.imp[t.dataset.k] = t.value;
    }
  });

  function onEnter(target) {
    if (V.name === 'paper' && target && target.classList && target.classList.contains('pin')) {
      const ins = [...app.querySelectorAll('.pin')], i = ins.indexOf(target);
      if (i < ins.length - 1) ins[i + 1].focus(); else target.blur();
      return;
    }
    const live = V.name === 'live' && V.room && V.room.state === 'playing' && !V.sent;
    if ((V.name === 'exam' && !V.over) || live) {
      if (V.name === 'exam' && V.phase === 'fb') return examNext();
      if (target && target.classList && target.classList.contains('hole-in')) {
        const ins = [...app.querySelectorAll('.hole-in')], i = ins.indexOf(target);
        if (i < ins.length - 1) { ins[i + 1].focus(); return; }
      }
      if (live) submitLive(false); else examCheck();
    }
  }
  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const typing = e.target.matches && e.target.matches('input, textarea');
    if (V.name === 'flash' && V.q && V.q[V.i]) {
      if (e.key === ' ' || (e.key === 'Enter' && V.mode === 'srs' && !V.flip)) { e.preventDefault(); if (V.mode === 'srs' && V.flip) return; flip(); }
      else if (V.mode === 'srs' && V.flip && '1234'.includes(e.key)) { e.preventDefault(); grade(+e.key); }
      else if (V.mode === 'cram' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) { e.preventDefault(); cram(e.key === 'ArrowRight'); }
    } else if ((V.name === 'exam' || V.name === 'live' || V.name === 'paper') && e.key === 'Enter') { if (V.name !== 'paper' || typing) { e.preventDefault(); onEnter(e.target); } }
    else if ((V.name === 'rush' || V.name === 'rain') && !V.over && !typing && '1234'.includes(e.key)) (V.name === 'rush' ? rushPick : rainResolve)(+e.key - 1);
    else if (V.name === 'tf' && !V.over && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); tfPick(e.key === 'ArrowRight' ? 1 : 0); }
    else if (V.name === 'anagram' && !V.over && e.key === 'Backspace' && !typing) { e.preventDefault(); A.anaBack(); }
    else if (V.name === 'words' && V.edit && e.key === 'Escape') A.closeEdit();
  });

  /* ---------- infobulles (graphiques, barres) ---------- */
  const tip = document.getElementById('tip');
  function showTip(el, x, y) { tip.textContent = el.dataset.tip; tip.classList.add('show'); const w = tip.offsetWidth; tip.style.left = Math.min(innerWidth - w - 8, Math.max(8, x - w / 2)) + 'px'; tip.style.top = Math.max(8, y - 44) + 'px'; }
  document.addEventListener('pointerover', e => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el) showTip(el, e.clientX, e.clientY); else tip.classList.remove('show'); });
  document.addEventListener('pointermove', e => { if (!tip.classList.contains('show')) return; const el = e.target.closest && e.target.closest('[data-tip]'); if (el) showTip(el, e.clientX, e.clientY); });
  document.addEventListener('scroll', () => tip.classList.remove('show'), { passive: true });

  /* ---------- clavier arabe à l'écran ---------- */
  const OSK = (() => {
    const el = document.getElementById('osk');
    let target = null;
    const lab = k => (/[ً-ْ]/.test(k) ? '◌' + k : k);
    el.innerHTML = AR.KEYS.map(r => `<div class="krow">${r.map(k => `<button data-k="${k}" class="${/[ً-ْ]/.test(k) ? 'hk' : ''}">${lab(k)}</button>`).join('')}</div>`).join('') +
      `<div class="krow"><button data-k="hide" class="wide2">▾</button><button data-k=" " class="space">espace</button><button data-k="bs" class="wide2">⌫</button><button data-k="enter" class="wide2 ent">↵</button></div>`;
    el.addEventListener('pointerdown', e => {
      const b = e.target.closest('[data-k]'); if (!b) return;
      e.preventDefault();
      const k = b.dataset.k;
      if (k === 'hide') { hide(); return; }
      if (!target || !document.body.contains(target)) return;
      if (k === 'enter') { onEnter(target); return; }
      const s = target.selectionStart ?? target.value.length, en = target.selectionEnd ?? s;
      if (k === 'bs') { if (s !== en) target.setRangeText('', s, en, 'end'); else if (s > 0) target.setRangeText('', s - 1, s, 'end'); }
      else target.setRangeText(k, s, en, 'end');
      target.dispatchEvent(new Event('input', { bubbles: true }));
    });
    document.addEventListener('focusin', e => {
      if (e.target.matches && e.target.matches('.ar-input')) { target = e.target; if (S().settings.osk && !e.target.readOnly) show(); }
    });
    function show() { el.classList.remove('hidden'); document.body.classList.add('osk-on'); }
    function hide() { el.classList.add('hidden'); document.body.classList.remove('osk-on'); }
    function refresh() {
      const on = S().settings.osk;
      app.querySelectorAll('.ar-input').forEach(i => { i.inputMode = on ? 'none' : 'text'; });
      const first = app.querySelector('.ar-input:not([readonly])');
      if (!on || !first) { hide(); return; }
      if (!target || !document.body.contains(target)) target = first;
      show();
    }
    return { refresh, show, hide };
  })();

  /* ---------- démarrage ---------- */
  I18N.set(S().settings.lang); rebuild();
  I18N.apply(document.getElementById('osk'));
  document.title = I18N.t('Murājaʿa');
  applyTheme();
  Cloud.on(st => {
    rebuild(); if (st.status === 'ok' || st.status === 'out') applyTheme();   // aussi quand la base commune change
    if (V.pendingLive && st.user) { const c = V.pendingLive; V.pendingLive = null; Cloud.joinRoom(c).then(() => openLive(c)).catch(e => { toast(e.message, 4000); render(); }); return; }
    if (!['flash', 'exam', 'rush', 'tf', 'rain', 'anagram', 'live'].includes(V.name)) render();
  });
  Cloud.init();
  const h = location.hash;
  if (h.startsWith('#duel=')) { V = { name: 'duel', tab: 'code', join: h.slice(6) }; history.replaceState(null, '', location.pathname); }
  else if (h.startsWith('#live=')) { const c = h.slice(6).toUpperCase(); V = { name: 'duel', tab: 'live', joinCode: c, pendingLive: Cloud.st.enabled ? c : null }; history.replaceState(null, '', location.pathname); }
  render();
  // mise à jour automatique : la page ouverte se recharge quand une nouvelle version est en ligne
  // (pas au milieu d'une partie ou d'une révision : on attend la fin)
  const busy = () => (V.name === 'live' && V.room && V.room.state === 'playing') || ['flash', 'exam', 'paper', 'rush', 'tf', 'rain', 'anagram'].includes(V.name);
  let updatePending = false;
  window.addEventListener('murajaa:render', () => { if (updatePending && !busy()) location.reload(); });
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').then(reg => {
      setInterval(() => reg.update().catch(() => {}), 5 * 60 * 1000);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
    }).catch(() => {});
    let hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController) { hadController = true; return; }          // toute première installation : rien à recharger
      if (busy()) { updatePending = true; toast("Nouvelle version disponible : elle s'installera à la fin de la partie.", 4000); }
      else location.reload();
    });
  }
})();
