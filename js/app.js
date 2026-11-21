/* Interface : vues, actions, jeux, duel en direct. */
(() => {
  'use strict';
  const S = () => Store.S;
  const F = Engine.FIELDS, T = Engine.TYPES, CATS = Engine.CATS;
  const CAT_ICON = { tr: 'globe', conj: 'repeat', pl: 'plural', ant: 'swap', syn: 'equal' };
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
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms);
  }
  function later(fn, ms) { const id = setTimeout(fn, ms); timeouts.push(id); return id; }
  function stopTimers() { if (timer) { clearInterval(timer); timer = null; } timeouts.forEach(clearTimeout); timeouts = []; }
  function unwatch() { if (liveUnsub) { liveUnsub(); liveUnsub = null; } }
  function go(name, p = {}) {
    if (V.name === 'live' && name !== 'live') { Cloud.leaveRoom(V.code, V.room); unwatch(); }
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
  const SESSION = ['flash', 'exam', 'rush', 'tf', 'rain', 'anagram', 'live'];
  const NAV = [['home', 'home', 'Accueil'], ['reviewSetup', 'cards', 'Réviser'], ['examSetup', 'exam', 'Examen'], ['games', 'game', 'Jeux'], ['words', 'book', 'Mots']];
  function render() {
    // garde ce qui est en cours de saisie (utile quand l'adversaire répond pendant qu'on écrit)
    const drafts = {}; let focusF = null;
    app.querySelectorAll('.hole-in:not([readonly])').forEach(i => { drafts[i.dataset.f] = i.value; if (document.activeElement === i) focusF = i.dataset.f; });
    const html = (VIEWS[V.name] || VIEWS.home)();
    const session = SESSION.includes(V.name);
    const enter = V.name !== lastView; lastView = V.name;
    app.innerHTML = (session ? '' : header()) + `<main class="main ${session ? 'session' : ''} ${enter ? 'enter' : ''}">${html}</main>` + (session ? '' : nav()) + (inappHelp ? inappModal() : '');
    if (!enter) app.querySelectorAll('.hole-in:not([readonly])').forEach(i => { if (drafts[i.dataset.f] != null && !i.value) i.value = drafts[i.dataset.f]; if (focusF === i.dataset.f) i.focus({ preventScroll: true }); });
    const af = app.querySelector('[autofocus]'); if (af && !focusF && !matchMedia('(pointer:coarse)').matches) af.focus({ preventScroll: true });
    OSK.refresh();
    if (V.name === 'flash') bindSwipe();
  }
  function navCur() { return { duel: 'games', gameSetup: 'games', stats: 'home', account: 'home' }[V.name] || V.name; }
  function header() {
    const L = Store.level(), u = Cloud.st.user;
    return `<header class="top"><div class="top-in">
      <button class="brand" data-a="go" data-to="home"><span class="logo">م</span><span class="brand-t">Murājaʿa</span></button>
      <nav class="topnav">${NAV.map(([v, , l]) => `<button data-a="go" data-to="${v}" class="${navCur() === v ? 'on' : ''}">${l}</button>`).join('')}</nav>
      <div class="hud">
        <span class="pill" data-tip="Jours de suite">${ico('flame', 'fire')}${Store.streak()}</span>
        <span class="pill" data-tip="${S().xp} XP · encore ${L.next} XP pour le niveau ${L.lvl + 1}">${ico('star', 'gold')}${L.lvl}</span>
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
  function picker() {
    const s = S().sel, decks = centerDecks();
    if (!decks.length) return emptyCenter();
    const none = !s.some(id => decks.some(d => d.lessons.some(l => l.id === id)));
    return `<div class="picker">${centerSwitch()}${decks.map(d => {
      const ids = d.lessons.map(l => l.id), on = ids.filter(id => s.includes(id)).length;
      const all = ids.length && on === ids.length;
      const words = d.lessons.reduce((a, l) => a + l.items.length, 0);
      return `<div class="pdeck ${on || none ? 'has' : ''}">
        <div class="pdeck-h"><div class="pdeck-t">${ar(d.title, 'md')}<small>${esc(d.subtitle || '')} · ${words} mots</small></div>
          <button class="chip-btn ${all ? 'on' : ''}" data-a="selDeck" data-id="${esc(d.id)}">${all ? ico('check') : ''}Tout le niveau</button></div>
        <div class="pchips">${d.lessons.map(l => `<button class="pchip ${s.includes(l.id) ? 'on' : ''}" data-a="selLesson" data-id="${esc(l.id)}">
          <span>${esc(l.title)}</span><small>${l.items.length}</small></button>`).join('')}</div></div>`;
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
  function itemCard(it, compact = false, skip = []) {
    const cell = f => (it[f] && !skip.includes(f) ? `<div class="cell">${flabel(f)}${val(f, it[f], 'lg')}</div>` : '');
    const grid = it.t === 'verb' ? ['madi', 'mud', 'amr', 'masdar'] : ['w', 'fem', 'pl', 'syn', 'ant'];
    return `<div class="icard ${compact ? 'compact' : ''}">
      <div class="cells">${grid.map(cell).join('')}</div>
      ${it.fr && !skip.includes('fr') ? `<div class="tr">${esc(it.fr)}</div>` : ''}
      ${it.prep ? `<div class="line">${flabel('prep')} ${ar(it.prep)}</div>` : ''}
      ${it.ex ? `<div class="ex">${ar(it.ex)}</div>` : ''}
      ${it.note ? `<div class="note">${esc(it.note)}</div>` : ''}
    </div>`;
  }

  /* ================= VUES ================= */
  const VIEWS = {};

  VIEWS.home = () => {
    const L = Store.level(), xp = todayXP(), goal = S().settings.goal, pct = Math.min(1, xp / goal);
    const cards = Engine.cards(Engine.itemsFor(sel()), S().rev), st = Engine.srsStats(cards);
    const en = Engine.enemies(10).filter(it => centerDecks().some(d => d.id === it.deckId));
    const decks = centerDecks();
    const hello = S().name ? `Bonjour ${esc(S().name)}` : 'Bienvenue';
    return `
      <div class="greet"><div><p class="ar salam">السَّلَامُ عَلَيْكُمْ</p><h1>${hello}</h1></div>
        <button class="cchip" data-a="go" data-to="account" data-tip="Changer de centre">${ico('building')}${esc(center().name)}</button></div>
      ${!S().name ? `<div class="panel namecard"><p class="muted small">Ton prénom (visible par ton binôme en duel) :</p><div class="row"><input id="nameIn" placeholder="Prénom" maxlength="20"><button class="btn primary" data-a="saveName">OK</button></div></div>` : ''}
      <section class="today">
        <div class="ring" style="--p:${pct}" data-tip="Objectif du jour : ${goal} XP"><div><b>${xp}</b><small>/ ${goal} XP</small></div></div>
        <div class="today-r">
          <div class="kpis">
            <div><b>${Store.streak()}</b><small>${ico('flame', 'fire')}jours de suite</small></div>
            <div><b>${st.due}</b><small>à revoir</small></div>
            <div><b>${st.newAvail}</b><small>nouvelles</small></div>
          </div>
          <div class="row wrap"><button class="btn primary" data-a="quickReview" ${decks.length ? '' : 'disabled'}>Réviser maintenant ${ico('arrow')}</button>
          <button class="btn ghost" data-a="go" data-to="stats">${ico('chart')}Statistiques</button></div>
        </div>
      </section>

      <h2 class="sec">Modes de révision</h2>
      <div class="quick">
        ${[['srs', 'repeat', 'Répétition', 'espacée'], ['cram', 'zap', 'Cartes', 'rapides'], ['write', 'pen', 'Écrire', 'la réponse'], ['qcm', 'choice', 'QCM', '4 choix']].map(([m, i, a, b]) =>
          `<button class="qbtn" data-a="quickMode" data-v="${m}"><span class="qi">${ico(i)}</span><b>${a}</b><small>${b}</small></button>`).join('')}
        <button class="qbtn" data-a="go" data-to="examSetup"><span class="qi">${ico('exam')}</span><b>Examen</b><small>à trous</small></button>
      </div>

      <h2 class="sec">Jeux <button class="link" data-a="go" data-to="games">Tout voir</button></h2>
      <div class="hscroll">${Object.entries(GAMES).map(([k, g]) => gameCard(k, g, true)).join('')}
        <button class="gcard small" style="--c:var(--c-live)" data-a="go" data-to="duel"><span class="gi">${ico('live')}</span><b>Duel en direct</b><span class="best">2 joueurs</span></button></div>

      ${en.length ? `<section class="panel"><div class="row between"><h2>${ico('target', 'red')} Mots difficiles</h2><button class="btn sm" data-a="fightEnemies">S'entraîner</button></div>
        <p class="muted small">Les mots que tu rates le plus souvent.</p>
        <div class="chips">${en.map(it => `<span class="chip">${ar(Engine.head(it), 'sm')}</span>`).join('')}</div></section>` : ''}

      <h2 class="sec">${esc(center().name)} · tes niveaux</h2>
      ${decks.length ? `<div class="decks">${decks.map(d => {
        const items = d.lessons.flatMap(l => l.items);
        const m = items.length ? items.reduce((a, it) => a + Engine.mastery(it), 0) / items.length : 0;
        return `<div class="dcard"><div class="dcard-h">${ar(d.title, 'md')}<span class="dpct">${Math.round(m * 100)} %</span></div>
          <small class="muted">${esc(d.subtitle || '')} · ${d.lessons.length} pages · ${items.length} mots</small>${bar(m)}
          <div class="row wrap"><button class="btn sm primary" data-a="reviseDeck" data-id="${esc(d.id)}">Réviser ce niveau</button><button class="btn sm ghost" data-a="go" data-to="words">Voir les mots</button></div></div>`;
      }).join('')}
        ${S().center === 'ibaanah' ? `<div class="dcard soon"><b>Mustawa 1 à 7</b><small class="muted">Envoie les photos de ton livre pour les ajouter.</small></div>` : ''}</div>` : emptyCenter()}`;
  };

  /* ----- Réviser : réglages ----- */
  const MODES = [['srs', 'repeat', 'Répétition espacée', 'Chaque mot revient au bon moment, comme Anki'], ['cram', 'zap', 'Cartes rapides', 'Je sais / je ne sais pas, glisse les cartes'], ['write', 'pen', 'Écrire', 'Tape la réponse au clavier'], ['qcm', 'choice', 'QCM', 'Choisis parmi 4 propositions']];
  VIEWS.reviewSetup = () => {
    const r = S().rev, items = Engine.itemsFor(sel()), cards = Engine.cards(items, r);
    const st = Engine.srsStats(cards);
    const n = r.n === 'all' ? cards.length : Math.min(cards.length, r.n);
    return `<div class="page-h"><h1>Réviser</h1><p class="muted">Choisis le centre, le niveau, les pages, le type de question, le sens et le mode.</p></div>
      <section class="panel"><h2 class="step"><i>1</i>Quoi réviser ?</h2>${picker()}</section>
      <section class="panel"><h2 class="step"><i>2</i>Type de question</h2>${whatChips(r.what, 'revWhat')}
        <h3>Sens</h3>${seg('revOpt', 'dir', [['ar', 'Arabe → Français'], ['fr', 'Français → Arabe'], ['both', 'Les deux']], r.dir)}
        <p class="muted small">Pour le pluriel, les contraires et les synonymes : « Arabe → Français » va du mot vers sa forme, l'autre sens fait l'inverse.</p></section>
      <section class="panel"><h2 class="step"><i>3</i>Mode</h2>
        <div class="modes">${MODES.map(([k, i, t, d]) => `<button class="mode ${r.mode === k ? 'on' : ''}" data-a="revOpt" data-k="mode" data-v="${k}"><span class="mi">${ico(i)}</span><b>${t}</b><small>${d}</small></button>`).join('')}</div>
        ${r.mode !== 'srs' ? `<h3>Nombre de cartes</h3>${seg('revOpt', 'n', [[10, '10'], [20, '20'], [40, '40'], ['all', 'Toutes']], r.n)}` : ''}</section>
      <div class="cta-bar"><div class="cta-info">${r.mode === 'srs'
        ? `<b>${st.due}</b> à revoir · <b>${st.newAvail}</b> nouvelles<small>sur ${cards.length} cartes</small>`
        : `<b>${n}</b> cartes<small>sur ${cards.length}</small>`}</div>
        <button class="btn primary lg" data-a="startRevision" ${cards.length ? '' : 'disabled'}>Commencer</button></div>`;
  };

  function startRevision() {
    const r = S().rev, cards = Engine.cards(Engine.itemsFor(sel()), r);
    if (!cards.length) { toast('Aucune carte pour cette sélection'); return; }
    if (r.mode === 'srs') {
      const q = Engine.srsQueue(cards);
      if (!q.length) { toast('Rien à revoir pour l\'instant. Essaie les cartes rapides ou un jeu.', 3500); return; }
      go('flash', { mode: 'srs', q, i: 0, flip: false, n: 0, xp: 0, total: q.length });
      return;
    }
    let list = Engine.shuffle(cards.slice());
    if (r.n !== 'all') list = list.slice(0, r.n);
    if (r.mode === 'cram') go('flash', { mode: 'cram', q: list, i: 0, flip: false, n: 0, xp: 0, total: list.length, known: 0, unknown: 0, seen: {} });
    else startExamQs(Engine.qsFromCards(list), { mode: r.mode === 'write' ? 'type' : 'qcm', title: r.mode === 'write' ? 'Écrire' : 'QCM', review: true });
  }

  /* ----- cartes ----- */
  function face(c, side) {
    const it = c.item;
    if (side === 'front') {
      let h = c.p.map(f => `<div class="pv">${val(f, it[f], F[f].isAr ? 'xxl' : 'xl')}</div>`).join('');
      if (c.kind === 'arfr' && it.t === 'verb' && it.mud) h += `<div class="sub">${ar(it.mud, 'md')}</div>`;
      if (c.kind === 'frar') h += `<div class="sub muted">${esc(T[it.t] ? T[it.t].label : '')}</div>`;
      return h + `<div class="ask">${c.a.map(f => esc(F[f].fr)).join(' · ')} ?</div>`;
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
    if (g === 1) V.q.splice(Math.min(V.i + 4, V.q.length), 0, c);
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

  /* ----- Examen ----- */
  VIEWS.examSetup = () => {
    const e = S().exam;
    const lvl = { none: 'souple (lettres seulement)', mudari: 'voyelle du muḍāriʿ exigée', strict: 'toutes les harakat' }[S().settings.harakat];
    return `<div class="page-h"><h1>Examen à trous</h1><p class="muted">Une forme est donnée (passé, masdar, traduction…) : retrouve toutes les autres.</p></div>
      <section class="panel"><h2 class="step"><i>1</i>Quoi réviser ?</h2>${picker()}</section>
      <section class="panel"><h2 class="step"><i>2</i>Réglages</h2>
        <h3>Nombre de questions</h3>${seg('examOpt', 'n', [[10, '10'], [15, '15'], [25, '25'], ['all', 'Tout']], e.n)}
        <h3>Réponses</h3>${seg('examOpt', 'mode', [['qcm', 'Choix multiples'], ['type', 'Écrire']], e.mode)}
        <p class="muted small">${e.mode === 'type' ? `Correction des harakat : <b>${lvl}</b> — <button class="link" data-a="go" data-to="settings">modifier</button>` : 'Les choix contiennent des pièges sur la voyelle du muḍāriʿ.'}</p>
        <h3>Mode boss</h3>${seg('examOpt', 'boss', [[false, 'Normal'], [true, '3 vies seulement']], e.boss)}</section>
      <div class="cta-bar"><div class="cta-info"><b>${Engine.itemsFor(sel()).length}</b> mots</div><button class="btn primary lg" data-a="startExam" ${Engine.itemsFor(sel()).length ? '' : 'disabled'}>Commencer</button></div>`;
  };
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
      return `<div class="hole ${r ? (r.ok ? 'is-ok' : 'is-ko') : ''}">${flabel(f)}${body}${fbl}</div>`;
    };
    const allOk = fb && q.hidden.every(f => cur[f].ok);
    return `<div class="qcard ${fb ? (allOk ? 'pulse-ok' : 'shake') : ''}"><div class="given">${tag ? `<div class="qtag">${tag}</div>` : ''}${flabel(q.given)}<div class="gval">${val(q.given, it[q.given], 'xxl')}</div>
        <div class="typ">${esc(T[it.t] ? T[it.t].label : '')}${it.prep && q.given !== 'fr' ? ` · ${ar(it.prep, 'sm')}` : ''}</div></div>
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
            ${q.item.ex ? `<div class="ex">${ar(q.item.ex)}</div>` : ''}
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
      <div class="col">${V.duel ? `<button class="btn primary" data-a="go" data-to="duel">Retour aux duels</button>` : `<button class="btn primary" data-a="${V.review ? 'startRevision' : 'go'}" data-to="examSetup">Recommencer</button>`}
      <button class="btn ghost" data-a="go" data-to="home">Accueil</button></div></div>`;
  }

  /* ----- Jeux ----- */
  const GAMES = {
    rush: { icon: 'zap', name: 'Chrono-rush', desc: '60 secondes pour enchaîner un maximum de bonnes réponses. Les séries multiplient les points.', c: 'var(--c-rush)' },
    tf: { icon: 'scale', name: 'Vrai ou faux', desc: 'Une paire s\'affiche : est-elle juste ? Réponds au plus vite, 45 secondes.', c: 'var(--c-tf)' },
    rain: { icon: 'rain', name: 'Pluie de mots', desc: 'Les mots tombent de plus en plus vite. Réponds avant qu\'ils touchent le sol. 3 vies.', c: 'var(--c-rain)' },
    anagram: { icon: 'letters', name: 'Lettres mélangées', desc: 'Reconstruis le mot arabe lettre par lettre. Idéal pour l\'orthographe.', c: 'var(--c-ana)' }
  };
  function gameCard(k, g, small) {
    return `<button class="gcard ${small ? 'small' : ''}" style="--c:${g.c}" data-a="openGame" data-v="${k}"><span class="gi">${ico(g.icon)}</span><b>${g.name}</b>${small ? '' : `<small>${esc(g.desc)}</small>`}<span class="best">${ico('trophy')}${S().best[k] || 0}</span></button>`;
  }
  VIEWS.games = () => `<div class="page-h"><h1>Jeux</h1><p class="muted">Chaque jeu se règle : centre, niveau, pages et type de question.</p></div>
    <button class="livebanner" data-a="go" data-to="duel"><span class="gi">${ico('live')}</span><div><b>Duel en direct</b><small>Jouez en même temps, question par question, avec un chrono. Idéal pendant un appel vidéo.</small></div>${ico('chevron')}</button>
    <div class="ggrid">${Object.entries(GAMES).map(([k, g]) => gameCard(k, g)).join('')}
      <button class="gcard" style="--c:var(--c-boss)" data-a="startBoss"><span class="gi">${ico('crown')}</span><b>Boss de leçon</b><small>Examen à écrire sur toute la sélection. 3 vies, pas une de plus.</small></button>
      <button class="gcard" style="--c:var(--c-hard)" data-a="fightEnemies"><span class="gi">${ico('target')}</span><b>Mots difficiles</b><small>Un examen uniquement sur les mots que tu rates le plus.</small></button></div>`;

  VIEWS.gameSetup = () => {
    const g = GAMES[V.game], w = S().game.what;
    const items = Engine.itemsFor(sel());
    const pairs = Engine.pairsFor(w).filter(p => V.game !== 'anagram' || F[p[1]].isAr);
    const n = Engine.playable(items, pairs).length;
    return `<button class="link back" data-a="go" data-to="games">${ico('back')}Jeux</button>
      <div class="ghead" style="--c:${g.c}"><span class="gi">${ico(g.icon)}</span><div><h1>${g.name}</h1><p class="muted">${esc(g.desc)}</p></div><span class="best">${ico('trophy')}Record : ${S().best[V.game] || 0}</span></div>
      <section class="panel"><h2 class="step"><i>1</i>Quoi réviser ?</h2>${picker()}</section>
      <section class="panel"><h2 class="step"><i>2</i>Types de questions</h2>${whatChips(w, 'gameWhat')}</section>
      <div class="cta-bar"><div class="cta-info"><b>${n}</b> mots jouables</div><button class="btn primary lg" data-a="startGame" ${n >= 4 ? '' : 'disabled'}>Jouer</button></div>`;
  };
  function startGame(k) {
    const items = Engine.itemsFor(sel()), w = S().game.what;
    const pairs = Engine.pairsFor(w);
    const pool = Engine.playable(items, pairs);
    if (pool.length < 4) { toast('Pas assez de mots pour ces réglages.'); return; }
    if (k === 'rush') {
      go('rush', { items: pool, pairs, q: Engine.gameQ(pool, pairs), score: 0, combo: 0, maxCombo: 0, n: 0, dur: 60000, end: Date.now() + 60000, fb: null });
      timer = setInterval(rushTick, 100);
    } else if (k === 'tf') {
      go('tf', { items: pool, pairs, q: Engine.tfQ(pool, pairs), score: 0, combo: 0, maxCombo: 0, n: 0, dur: 45000, end: Date.now() + 45000, fb: null });
      timer = setInterval(rushTick, 100);
    } else if (k === 'rain') {
      go('rain', { items: pool, pairs, q: Engine.gameQ(pool, pairs), score: 0, lives: 3, speed: 9000, qid: 0, fb: null });
      armRain();
    } else if (k === 'anagram') {
      const q = Engine.anagramQ(pool, w);
      if (!q) { toast('Choisis au moins un type avec des réponses en arabe.'); return; }
      go('anagram', { items: pool, w, q, built: [], round: 0, total: 10, score: 0, hints: 0, fb: null, ok: 0 });
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
      <div class="qcard game-card ${V.fb ? (V.fb.ok ? 'pulse-ok' : 'shake') : 'card-in'}"><div class="given">${flabel(q.from)}<div class="gval">${val(q.from, q.item[q.from], 'xxl')}</div></div>
        <div class="hole">${flabel(q.to)}<div class="opts ${F[q.to].isAr ? 'ar-opts' : ''}">${q.options.map((o, k) => {
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
    later(() => { if (V.name !== 'rush' || V.over) return; V.fb = null; V.q = Engine.gameQ(V.items, V.pairs, Math.random, q.item.id); render(); }, ok ? 320 : 1200);
  }

  VIEWS.tf = () => {
    if (V.over) return overScreen('tf', [[V.score, 'points'], [V.n, 'réponses'], ['×' + V.maxCombo, 'meilleure série']]);
    const q = V.q, fb = V.fb;
    return `${gtop(comboTag())}
      <div class="tf-card ${fb ? (fb.ok ? 'pulse-ok' : 'shake') : 'card-in'}">
        <div class="tf-side">${flabel(q.from)}${val(q.from, q.item[q.from], 'xxl')}</div>
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
    later(() => { if (V.name !== 'tf' || V.over) return; V.fb = null; V.q = Engine.tfQ(V.items, V.pairs); render(); }, ok ? 350 : 1400);
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
        <div class="drop ${fb ? (fb.ok ? 'pop' : 'splash') : ''}" style="animation-duration:${V.speed}ms">${flabel(q.from)}${val(q.from, q.item[q.from], 'xl')}</div>
        <div class="ground"></div>
        ${fb && !fb.ok ? `<div class="rain-ans">${val(q.to, q.answer, 'lg')}</div>` : ''}
      </div>
      <div class="hole">${flabel(q.to)}<div class="opts ${F[q.to].isAr ? 'ar-opts' : ''}">${q.options.map((o, k) => {
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
      V.fb = null; V.q = Engine.gameQ(V.items, V.pairs, Math.random, q.item.id); render(); armRain();
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
        <div class="ana-ask">${flabel(q.to)}</div>
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
    V.q = Engine.anagramQ(V.items, V.w, Math.random, V.q.item.id); render();
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
  function liveHome() {
    const gate = needAccount('Chaque joueur se connecte avec son compte Google, puis l\'un crée une salle et l\'autre la rejoint avec le code.');
    if (gate) return gate;
    const l = S().live;
    const nItems = Engine.itemsFor(sel()).length;
    return `<section class="panel"><h2>Créer une salle</h2>
        <p class="muted small">Contenu : <b>${esc(center().name)}</b> · ${nItems} mots selon ta sélection — <button class="link" data-a="go" data-to="reviewSetup">changer</button></p>
        <h3>Questions</h3>${seg('liveOpt', 'n', [[5, '5'], [10, '10'], [15, '15'], [20, '20']], l.n)}
        <h3>Réponses</h3>${seg('liveOpt', 'mode', [['qcm', 'Choix multiples'], ['type', 'Écrire']], l.mode)}
        <h3>Temps par question</h3>${seg('liveOpt', 'time', [[20, '20 s'], [30, '30 s'], [45, '45 s'], [60, '60 s'], [90, '90 s']], l.time)}
        <p class="muted small">Conseil : 30 s pour les choix multiples, 60 s quand il faut écrire.</p>
        <button class="btn primary lg wide" data-a="liveCreate" ${nItems ? '' : 'disabled'}>Créer la salle</button></section>
      <section class="panel"><h2>Rejoindre une salle</h2>
        <div class="row"><input id="liveCode" class="codein" placeholder="CODE" maxlength="5" value="${esc(V.joinCode || '')}" autocapitalize="characters"><button class="btn primary" data-a="liveJoin">Rejoindre</button></div></section>`;
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
    const items = Engine.itemsFor(st.l).slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return Engine.makeExam(items, { n: st.n, rng: Engine.rng32(st.seed) });
  }
  const isHost = () => V.room && V.room.host === Cloud.uid();
  const opp = () => { const r = V.room; if (!r) return null; const id = Object.keys(r.players).find(k => k !== Cloud.uid()); return id ? Object.assign({ id }, r.players[id]) : null; };
  const mine = () => (V.room ? V.room.players[Cloud.uid()] : null);
  function onRoom(data, err) {
    if (V.name !== 'live') return;
    V.loading = false; V.room = data; V.err = err ? err.message : null;
    if (!data) { render(); return; }
    if (!data.players[Cloud.uid()]) { V.kicked = true; render(); return; }
    const st = data.settings;
    if (data.state !== 'lobby' && (!V.qs || V.seed !== st.seed)) { V.qs = liveQs(st); V.seed = st.seed; }
    if (data.state === 'playing') {
      if (V.qi !== data.qi) { V.qi = data.qi; V.t0 = Date.now(); V.pick = {}; V.cur = null; V.sent = false; }
      const all = Object.values(data.players).every(p => p.ans && p.ans[data.qi]);
      if (all && V.revealFor !== data.qi) { V.revealFor = data.qi; V.revealAt = Date.now(); FX.sound.flip(); }
      if (all && isHost() && V.advFor !== data.qi) { V.advFor = data.qi; const qi = data.qi; later(() => Cloud.advance(V.code, qi + 1, V.qs.length), 3500); }
    }
    if (data.state === 'lobby') { V.qs = null; V.qi = null; V.recorded = false; V.advFor = null; V.revealFor = null; }
    if (data.state === 'done') recordLive(data);
    render();
  }
  function liveTick() {
    const r = V.room; if (!r || r.state !== 'playing' || V.qi == null) return;
    const lim = r.settings.time * 1000, el = Date.now() - V.t0, left = lim - el;
    const t = document.getElementById('lt'); if (t) t.textContent = Math.max(0, Math.ceil(left / 1000));
    const tb = document.getElementById('tb'); if (tb) { tb.style.transform = `scaleX(${Math.max(0, left / lim)})`; tb.classList.toggle('hurry', left < 8000); }
    if (!V.sent && left <= 0) submitLive(true);
    // si l'adversaire ne répond plus (connexion perdue), l'hôte passe à la suite
    if (isHost() && el > lim + 6000 && V.advFor !== V.qi) { V.advFor = V.qi; Cloud.advance(V.code, V.qi + 1, V.qs.length); }
  }
  function submitLive(timeout) {
    if (V.sent || !V.qs) return;
    const st = V.room.settings, q = V.qs[V.qi];
    if (!timeout && st.mode === 'qcm' && q.hidden.some(f => V.pick[f] == null)) { toast('Réponds à toutes les cases'); return; }
    const { cur, nOk, all } = grade_q(q, st.mode, V.pick, st.h || 'none');
    const ms = Math.min(Date.now() - V.t0, st.time * 1000);
    const pts = nOk * 10 + (all ? Math.round(10 * Math.max(0, 1 - ms / (st.time * 1000))) : 0);
    V.cur = cur; V.sent = true;
    Cloud.answer(V.code, V.qi, { ok: all, n: nOk, pts, ms, to: !!timeout }).catch(e => toast('Envoi impossible : ' + e.message));
    Store.answer(q.item.id, all);
    if (all) FX.sound.ok(); else { FX.sound.bad(); FX.buzz(60); }
    if (pts) FX.floatCenter('+' + pts, 'pts');
    render();
  }
  function scoreboard(r) {
    const m = mine(), o = opp();
    const ms = m ? m.score : 0, os = o ? o.score : 0;
    const lead = ms === os ? 'Égalité' : ms > os ? `Tu mènes de ${ms - os}` : `${esc(o.name)} mène de ${os - ms}`;
    const pl = (p, you) => p ? `<div class="sp ${you ? 'you' : ''} ${(you ? ms > os : os > ms) ? 'lead' : ''}">${avatar(p)}<div><b>${esc(p.name)}${you ? ' (toi)' : ''}</b><span>${p.score} pts</span></div>${(you ? ms > os : os > ms) ? `<i class="crown">${ico('crown')}</i>` : ''}</div>` : `<div class="sp wait">${avatar({ name: '?' })}<div><b>En attente…</b><span>—</span></div></div>`;
    return `<div class="scoreboard">${pl(Object.assign({}, m, { name: (m && m.name) || 'Moi' }), true)}<div class="vs-mid"><small>${r.state === 'playing' ? lead : 'VS'}</small></div>${pl(o, false)}</div>`;
  }
  VIEWS.live = () => {
    if (V.loading) return `<div class="done">${doneIcon('live')}<h1>Connexion…</h1></div>`;
    const r = V.room;
    if (!r || V.kicked) return `<div class="done">${doneIcon('x', 'ko')}<h1>Salle fermée</h1><p class="muted">${V.err ? esc(V.err) : 'L\'hôte a fermé la salle ou elle n\'existe plus.'}</p><div class="col"><button class="btn primary" data-a="go" data-to="duel">Retour</button></div></div>`;
    const st = r.settings, o = opp();
    const quit = `<div class="stop"><button class="icon quit" data-a="liveQuit" aria-label="Quitter">${ico('x')}</button><span class="roomcode">Salle <b>${esc(V.code)}</b></span>
      <button class="btn sm ghost" data-a="video">${ico('video')}Appel vidéo</button></div>`;
    if (r.state === 'lobby') {
      const missing = st.l.filter(id => !LIB.lessons[id]);
      const words = Engine.itemsFor(st.l).length;
      return `${quit}
        <section class="panel lobby"><p class="muted small">Donne ce code à ton binôme :</p>
          <div class="bigcode">${esc(V.code).split('').map(c => `<span>${c}</span>`).join('')}</div>
          <div class="row center wrap"><button class="btn sm" data-a="copy" data-text="${esc(V.code)}">${ico('copy')}Copier le code</button>
          ${location.protocol.startsWith('http') ? `<button class="btn sm" data-a="copy" data-text="${esc(location.origin + location.pathname + '#live=' + V.code)}">${ico('link')}Copier le lien</button>` : ''}</div></section>
        ${scoreboard(r)}
        <section class="panel"><h3>Réglages de la partie</h3>
          <p class="small">${words} mots · ${st.n} questions · ${st.mode === 'qcm' ? 'choix multiples' : 'à écrire'} · ${st.time} s par question</p>
          ${missing.length ? `<p class="warn">Il te manque des leçons de cette partie (mets l'appli à jour).</p>` : ''}
          ${isHost() ? `<h3>Questions</h3>${seg('liveSet', 'n', [[5, '5'], [10, '10'], [15, '15'], [20, '20']], st.n)}
            <h3>Réponses</h3>${seg('liveSet', 'mode', [['qcm', 'Choix multiples'], ['type', 'Écrire']], st.mode)}
            <h3>Temps</h3>${seg('liveSet', 'time', [[20, '20 s'], [30, '30 s'], [45, '45 s'], [60, '60 s'], [90, '90 s']], st.time)}
            <button class="link" data-a="liveUseSel">Utiliser ma sélection actuelle (${Engine.itemsFor(sel()).length} mots)</button>` : ''}</section>
        ${isHost() ? `<button class="btn primary lg wide" data-a="liveStart" ${o ? '' : 'disabled'}>${o ? 'Lancer la partie' : 'En attente de ton binôme…'}</button>`
          : `<div class="waiting"><span class="dots"><i></i><i></i><i></i></span>En attente du lancement par l'hôte</div>`}`;
    }
    if (r.state === 'playing' && V.qs) {
      const q = V.qs[V.qi], lim = st.time * 1000, left = lim - (Date.now() - V.t0);
      const m = mine(), myA = m.ans && m.ans[V.qi], oA = o && o.ans && o.ans[V.qi];
      const reveal = myA && (oA || !o);
      const head = `${scoreboard(r)}<div class="livebar"><span class="cnt">Question ${V.qi + 1}/${V.qs.length}</span><span class="timer">${ico('clock')}<b id="lt">${Math.max(0, Math.ceil(left / 1000))}</b> s</span></div>${timebar(reveal ? 0 : left / lim)}`;
      const card = questionCard(q, st.mode, V.pick, V.cur, st.h || 'none');
      if (!V.sent) return `${quit}${head}${card}
        ${st.mode === 'type' ? `<button class="link osk-toggle" data-a="toggleOsk">${ico('keyboard')} Clavier arabe : ${S().settings.osk ? 'activé' : 'désactivé'}</button>` : ''}
        <div class="oppstat">${o ? (oA ? `${avatar(o)} <b>${esc(o.name)}</b> a répondu` : `${avatar(o)} <b>${esc(o.name)}</b> réfléchit <span class="dots"><i></i><i></i><i></i></span>`) : ''}</div>
        <button class="btn primary lg wide" data-a="liveSubmit">Valider <kbd>Entrée</kbd></button>`;
      const res = (p, a) => a ? `<div class="rr ${a.ok ? 'ok' : 'ko'}">${avatar(p)}<b>${esc(p.name)}</b><span>${a.to ? 'temps écoulé' : (a.ok ? 'juste' : `${a.n}/${q.hidden.length}`)} · ${(a.ms / 1000).toFixed(1)} s</span><em>+${a.pts}</em></div>` : '';
      return `${quit}${head}${card}
        ${reveal ? `<div class="reveal">${res(m, myA)}${o ? res(o, oA) : ''}<p class="muted small center">Question suivante dans un instant…</p></div>`
          : `<div class="waiting">${o ? avatar(o) : ''}<span>En attente de ${esc(o ? o.name : 'ton binôme')}</span><span class="dots"><i></i><i></i><i></i></span></div>`}`;
    }
    if (r.state === 'done') return liveResult(r);
    return `${quit}<div class="done"><h1>…</h1></div>`;
  }
  function liveResult(r) {
    const m = mine(), o = opp(), n = V.qs ? V.qs.length : r.settings.n;
    const w = !o ? 1 : m.score > o.score ? 1 : m.score < o.score ? -1 : 0;
    if (!V.celebrated) { V.celebrated = true; later(() => { if (w > 0) { FX.sound.win(); FX.confetti(140); } else if (w < 0) FX.sound.lose(); else FX.sound.ok(); }, 200); }
    const stats = p => {
      const a = Object.values(p.ans || {}); const ok = a.filter(x => x.ok).length;
      const t = a.length ? a.reduce((s, x) => s + x.ms, 0) / a.length : 0;
      return { ok, t };
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
        <tr><td>Bonnes réponses</td><td>${sm.ok}/${n}</td><td>${so ? so.ok + '/' + n : ''}</td></tr>
        <tr><td>Temps moyen</td><td>${(sm.t / 1000).toFixed(1)} s</td><td>${so ? (so.t / 1000).toFixed(1) + ' s' : ''}</td></tr>
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
    return `<section class="panel duelcard"><div class="row between"><b>Défi de ${esc(dl.by || '?')}</b><small class="muted">${new Date(dl.at).toLocaleDateString('fr-FR')} · ${dl.n} questions</small></div>
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
  const dfmt = k => new Date(k + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
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
      <section class="panel"><h2>Maîtrise par page</h2>${centerDecks().flatMap(d => d.lessons).map(l => { const m = Engine.lessonMastery(l); return `<div class="mrow"><span>${esc(l.title)}</span>${bar(m)}<b>${Math.round(m * 100)} %</b></div>`; }).join('') || '<p class="muted">Aucune page.</p>'}</section>
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
        <p class="sync ${c.status}">${ico(c.status === 'error' ? 'x' : 'cloud')}${status}${c.lastSync ? ` · ${new Date(c.lastSync).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : ''}</p></div>
        <div class="row wrap"><button class="btn sm" data-a="syncNow">${ico('repeat')}Synchroniser</button><button class="btn sm ghost" data-a="signOut">${ico('logout')}Se déconnecter</button></div></section>`;
    return `<div class="page-h"><h1>Mon compte</h1></div>${acc}
      <section class="panel"><h2>Mon centre</h2><p class="muted small">Le centre dont tu révises le vocabulaire.</p>${centerSwitch()}</section>
      <div class="menu">
        <button data-a="go" data-to="stats">${ico('chart')}<span>Statistiques</span>${ico('chevron')}</button>
        <button data-a="openRivals">${ico('users')}<span>Bilan des duels</span>${ico('chevron')}</button>
        <button data-a="go" data-to="settings">${ico('settings')}<span>Réglages</span>${ico('chevron')}</button>
      </div>`;
  };

  /* ----- Mots / éditeur ----- */
  VIEWS.words = () => {
    if (V.lesson && LIB.lessons[V.lesson]) return lessonView();
    const decks = centerDecks();
    return `<div class="page-h"><h1>Mes mots</h1><p class="muted">Consulte, corrige ou ajoute des mots.</p></div>${centerSwitch()}
      ${decks.length ? decks.map(d => `<section class="panel"><div class="pdeck-t">${ar(d.title, 'md')}<small>${esc(d.subtitle || '')}</small></div>
        ${d.lessons.map(l => `<button class="lrow" data-a="openLesson" data-id="${esc(l.id)}"><span class="lt">${esc(l.title)} ${ar(l.titleAr || '', 'sm')}</span><span class="cnt">${l.items.length} mots</span>${bar(Engine.lessonMastery(l))}${ico('chevron', 'chev')}</button>`).join('')}
        ${d.user ? `<button class="link" data-a="newLesson" data-deck="${esc(d.id)}">${ico('plus')}Nouvelle leçon</button>` : ''}</section>`).join('') : emptyCenter()}
      <section class="panel"><h3>Ajouter du contenu</h3>
        <div class="row wrap"><button class="btn sm" data-a="newLesson" data-deck="perso-${S().center}">${ico('plus')}Créer une leçon perso</button>
        <label class="btn sm">${ico('download')}Importer un paquet (.json)<input type="file" accept=".json,application/json" data-a="importDeck" hidden></label></div>
        <p class="muted small">Les paquets transcrits depuis tes photos s'importent ici. Ton binôme peut importer les mêmes fichiers.</p></section>`;
  };
  function lessonView() {
    const L = LIB.lessons[V.lesson];
    const rows = L.items.map(it => {
      const forms = it.t === 'verb' ? [it.mud, it.amr, it.masdar] : [it.pl];
      return `<button class="wrow" data-a="editItem" data-id="${esc(it.id)}"><span class="dot" style="--m:${Engine.mastery(it)}"></span>
        <span class="wh">${ar(Engine.head(it), 'md')}</span><span class="wf">${ar(forms.filter(Boolean).join(' · '), 'sm')}</span><span class="wt">${esc(it.fr)}</span></button>`;
    }).join('');
    return `<button class="link back" data-a="go" data-to="words">${ico('back')}Mes mots</button>
      <div class="page-h"><h1>${esc(L.title)} ${ar(L.titleAr || '', 'md')}</h1></div>
      <div class="row wrap"><button class="btn primary" data-a="lessonReview" data-id="${esc(L.id)}">${ico('cards')}Réviser cette page</button><button class="btn" data-a="lessonExam" data-id="${esc(L.id)}">${ico('exam')}Examen</button>
      <button class="btn ghost" data-a="exportLesson" data-id="${esc(L.id)}">${ico('upload')}Exporter</button></div>
      <div class="wlist">${rows || '<p class="muted">Aucun mot.</p>'}</div>
      <section class="panel"><h3>Ajouter un mot</h3><div class="row wrap">${Object.entries(T).map(([k, t]) => `<button class="btn sm" data-a="newItem" data-t="${k}">${ico('plus')}${t.label}</button>`).join('')}</div></section>
      ${V.edit ? editModal() : ''}`;
  }
  function editModal() {
    const it = V.edit === 'new' ? { t: V.newType } : LIB.items[V.edit];
    if (!it) return '';
    return `<div class="modal" data-a="closeEdit"><div class="sheet" data-stop>
      <h2>${V.edit === 'new' ? 'Nouveau' : 'Modifier'} · ${T[it.t].label}</h2>
      ${T[it.t].edit.map(f => `<label class="fld">${flabel(f)}<input data-ef="${f}" class="${F[f].isAr ? 'ar-input' : ''}" dir="${F[f].isAr ? 'rtl' : 'ltr'}" value="${esc(it[f] || '')}" autocomplete="off"></label>`).join('')}
      <p class="muted small">Plusieurs réponses possibles : sépare-les par « / ».</p>
      <div class="row between">${V.edit !== 'new' ? `<button class="btn danger" data-a="delItem">Supprimer</button>` : '<span></span>'}
      <div class="row"><button class="btn ghost" data-a="closeEdit">Annuler</button><button class="btn primary" data-a="saveItem">Enregistrer</button></div></div>
    </div></div>`;
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
        ${radio('theme', 'auto', 'Automatique')}${radio('theme', 'light', 'Clair')}${radio('theme', 'dark', 'Sombre')}
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
      const back = V.duel ? ['duel', { tab: 'code' }] : V.name === 'exam' && !V.review ? ['examSetup'] : V.name === 'exam' || V.name === 'flash' ? ['reviewSetup'] : ['gameSetup', { game: V.name }];
      go(back[0], back[1] || {});
    },
    saveName: () => { const v = (document.getElementById('nameIn').value || '').trim(); if (!v) return; S().name = v; Store.save(); toast('Enregistré'); render(); },
    setCenter: b => { S().center = b.dataset.v; Store.save(); FX.sound.tap(); render(); },
    selLesson: b => { const id = b.dataset.id, s = S().sel; const i = s.indexOf(id); if (i >= 0) s.splice(i, 1); else s.push(id); Store.save(); FX.sound.tap(); render(); },
    selDeck: b => {
      const d = LIB.decks.find(x => x.id === b.dataset.id); const ids = d.lessons.map(l => l.id);
      const allOn = ids.every(id => S().sel.includes(id));
      S().sel = S().sel.filter(id => !ids.includes(id)); if (!allOn) S().sel.push(...ids);
      Store.save(); FX.sound.tap(); render();
    },
    selNone: () => { S().sel = []; Store.save(); render(); },
    quickReview: () => {
      const cards = Engine.cards(Engine.itemsFor(sel()), S().rev);
      if (Engine.srsQueue(cards).length) { S().rev.mode = 'srs'; Store.save(); startRevision(); }
      else go('reviewSetup');
    },
    quickMode: b => { S().rev.mode = b.dataset.v; Store.save(); go('reviewSetup'); },
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
    liveOpt: b => { S().live[b.dataset.k] = parseV(b.dataset.v); if (b.dataset.k === 'mode') S().live.time = S().live.mode === 'type' ? 60 : 30; Store.save(); render(); },
    liveCreate: async b => {
      b.disabled = true;
      const l = S().live;
      const settings = { l: sel(), n: l.n, mode: l.mode, time: l.time, h: S().settings.harakat, seed: Math.floor(Math.random() * 2 ** 31) };
      try { const c = await Cloud.createRoom(settings); openLive(c); } catch (e) { b.disabled = false; toast('Erreur : ' + e.message, 4000); }
    },
    liveJoin: async b => {
      const c = (document.getElementById('liveCode').value || '').trim().toUpperCase();
      if (c.length < 4) { toast('Entre le code de la salle'); return; }
      b.disabled = true;
      try { await Cloud.joinRoom(c); openLive(c); } catch (e) { b.disabled = false; toast(e.message, 4000); }
    },
    liveSet: b => { const st = Object.assign({}, V.room.settings, { [b.dataset.k]: parseV(b.dataset.v) }); if (b.dataset.k === 'mode') st.time = st.mode === 'type' ? 60 : 30; Cloud.updateSettings(V.code, st); },
    liveUseSel: () => Cloud.updateSettings(V.code, Object.assign({}, V.room.settings, { l: sel() })),
    liveStart: () => { const st = Object.assign({}, V.room.settings, { seed: Math.floor(Math.random() * 2 ** 31) }); Cloud.updateSettings(V.code, st).then(() => Cloud.startRoom(V.code)); },
    liveSubmit: () => submitLive(false),
    liveRematch: () => Cloud.rematch(V.code, Object.assign({}, V.room.settings, { seed: Math.floor(Math.random() * 2 ** 31) })),
    liveQuit: () => { if (V.room && V.room.state === 'playing' && !confirm('Quitter la partie en cours ?')) return; history.replaceState(null, '', location.pathname); go('duel', { tab: 'live' }); },
    video: () => { const r = V.room; window.open(`https://meet.jit.si/Murajaa-${V.code}-${(r && r.host ? r.host.slice(0, 6) : '')}`, '_blank', 'noopener'); },
    // mots
    openLesson: b => go('words', { lesson: b.dataset.id }),
    editItem: b => { V.edit = b.dataset.id; render(); },
    newItem: b => { V.edit = 'new'; V.newType = b.dataset.t; render(); },
    closeEdit: () => { V.edit = null; render(); },
    saveItem: () => {
      const data = {}; app.querySelectorAll('[data-ef]').forEach(i => { data[i.dataset.ef] = i.value.trim(); });
      if (V.edit === 'new') {
        const t = V.newType, hf = t === 'verb' ? 'madi' : 'w';
        if (!data[hf]) { toast('Le mot arabe est obligatoire'); return; }
        const arr = (S().custom[V.lesson] = S().custom[V.lesson] || []);
        Object.keys(data).forEach(k => { if (!data[k]) delete data[k]; });
        arr.push(Object.assign({ id: 'c' + Date.now().toString(36), t }, data));
      } else {
        S().edits[V.edit] = Object.assign(S().edits[V.edit] || {}, data);
      }
      Store.save(); rebuild(); V.edit = null; toast('Enregistré'); render();
    },
    delItem: () => { if (!confirm('Supprimer ce mot ?')) return; S().hidden[V.edit] = 1; Store.save(); rebuild(); V.edit = null; render(); },
    newLesson: b => {
      const title = prompt('Nom de la leçon :'); if (!title) return;
      let d = S().decks.find(x => x.id === b.dataset.deck);
      if (!d) { d = { id: b.dataset.deck, center: S().center, title: 'مُفْرَدَاتِي', subtitle: 'Mes mots perso', order: 999, user: true, lessons: [] }; S().decks.push(d); }
      d.lessons.push({ id: d.id + '-' + Date.now().toString(36), title, items: [] });
      Store.save(); rebuild(); render();
    },
    exportLesson: b => {
      const L = LIB.lessons[b.dataset.id], d = LIB.decks.find(x => x.id === L.deckId);
      const items = L.items.map(({ id, lessonId, deckId, custom, ...rest }) => rest);
      download(`${L.id}.json`, { id: d.id, center: d.center, title: d.title, subtitle: d.subtitle, lessons: [{ id: L.id, title: L.title, titleAr: L.titleAr, items }] });
    },
    setting: b => { S().settings[b.dataset.k] = b.dataset.v; Store.save(); applyTheme(); render(); },
    exportAll: () => download(`murajaa-sauvegarde-${Store.today()}.json`, S()),
    resetAll: () => { if (!confirm('Effacer toute ta progression, tes modifications et tes duels ?')) return; Store.S = Store.defaults(); Store.save(); rebuild(); go('home'); }
  };

  async function readJSON(input) { const f = input.files && input.files[0]; if (!f) return null; try { return JSON.parse(await f.text()); } catch (e) { toast('Fichier illisible'); return null; } }
  const CHANGE = {
    setNum: b => { S().settings[b.dataset.k] = Math.max(0, +b.value || 0); Store.save(); },
    setBool: b => { S().settings[b.dataset.k] = b.checked; Store.save(); if (b.dataset.k === 'sound' && b.checked) FX.sound.ok(); },
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
    const b = e.target.closest('[data-a]'); if (!b) return;
    if (b.tagName === 'INPUT' && (b.type === 'file' || b.type === 'number' || b.type === 'checkbox')) return;
    if (b.classList.contains('modal') && e.target.closest('[data-stop]')) return;
    if (b.disabled) return;
    const fn = A[b.dataset.a]; if (fn) fn(b, e);
  });
  app.addEventListener('change', e => { const b = e.target.closest('[data-a]'); if (b && CHANGE[b.dataset.a]) CHANGE[b.dataset.a](b, e); });

  function onEnter(target) {
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
    } else if ((V.name === 'exam' || V.name === 'live') && e.key === 'Enter') { e.preventDefault(); onEnter(e.target); }
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
      if (!on || !app.querySelector('.ar-input:not([readonly])')) hide();
      else if (target && document.body.contains(target)) show();
    }
    return { refresh, show, hide };
  })();

  /* ---------- démarrage ---------- */
  applyTheme();
  Cloud.on(st => {
    if (st.status === 'ok' || st.status === 'out') { rebuild(); applyTheme(); }
    if (V.pendingLive && st.user) { const c = V.pendingLive; V.pendingLive = null; Cloud.joinRoom(c).then(() => openLive(c)).catch(e => { toast(e.message, 4000); render(); }); return; }
    if (!['flash', 'exam', 'rush', 'tf', 'rain', 'anagram', 'live'].includes(V.name)) render();
  });
  Cloud.init();
  const h = location.hash;
  if (h.startsWith('#duel=')) { V = { name: 'duel', tab: 'code', join: h.slice(6) }; history.replaceState(null, '', location.pathname); }
  else if (h.startsWith('#live=')) { const c = h.slice(6).toUpperCase(); V = { name: 'duel', tab: 'live', joinCode: c, pendingLive: Cloud.st.enabled ? c : null }; history.replaceState(null, '', location.pathname); }
  render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
