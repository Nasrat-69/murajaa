/* Interface : vues, actions, jeux. */
(() => {
  'use strict';
  const S = () => Store.S;
  const F = Engine.FIELDS, T = Engine.TYPES, CATS = Engine.CATS;
  const app = document.getElementById('app');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ar = (s, cls = '') => (s ? `<span class="ar ${cls}" lang="ar" dir="rtl">${esc(s)}</span>` : '');
  const val = (f, v, cls = '') => (F[f] && F[f].isAr ? ar(v, cls) : `<span class="frv ${cls}">${esc(v)}</span>`);
  const flabel = f => `<span class="flabel">${esc(F[f].fr)} <span class="ar">${esc(F[f].ar)}</span></span>`;
  let LIB = Engine.build();
  let V = { name: 'home' };
  let timer = null, timeouts = [], lastView = null, lastCard = null;

  /* ---------- utilitaires ---------- */
  function toast(msg, ms = 2600) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms);
  }
  function later(fn, ms) { const id = setTimeout(fn, ms); timeouts.push(id); return id; }
  function stopTimers() { if (timer) { clearInterval(timer); timer = null; } timeouts.forEach(clearTimeout); timeouts = []; }
  function go(name, p = {}) { stopTimers(); V = Object.assign({ name }, p); render(); window.scrollTo(0, 0); }
  function rebuild() { LIB = Engine.build(); }
  function sel() { const ids = S().sel.filter(id => LIB.lessons[id]); return ids.length ? ids : Object.keys(LIB.lessons); }
  function bar(p, cls = '') { const pc = Math.round(p * 100); return `<span class="bar ${cls}" title="Maîtrise ${pc}%"><b style="width:${pc}%"></b></span>`; }
  function download(name, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast('Copié ✔'); }
    catch (e) { prompt('Copie ce texte :', text); }
  }
  const fmtTime = ms => { const s = Math.round(ms / 1000); return s >= 60 ? `${Math.floor(s / 60)} min ${s % 60}s` : `${s}s`; };
  function applyTheme() { const t = S().settings.theme; if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t); }
  const todayXP = () => (S().days[Store.today()] || { xp: 0 }).xp;
  function gain(n, label = true) {
    if (n <= 0) return;
    Store.addXP(n);
    if (label) FX.floatCenter('+' + n + ' XP', 'xp');
  }
  function seg(action, key, opts, cur) {
    return `<div class="seg">${opts.map(([v, l]) => `<button class="${String(cur) === String(v) ? 'on' : ''}" data-a="${action}" data-k="${key}" data-v="${v}">${l}</button>`).join('')}</div>`;
  }
  const parseV = v => (v === 'true' ? true : v === 'false' ? false : /^\d+$/.test(v) ? +v : v);

  /* ---------- rendu ---------- */
  const SESSION = ['flash', 'exam', 'rush', 'tf', 'rain', 'anagram'];
  const NAV = [['home', '🏠', 'Accueil'], ['reviewSetup', '🃏', 'Réviser'], ['examSetup', '📝', 'Examen'], ['games', '🎮', 'Jeux'], ['words', '📚', 'Mots']];
  function render() {
    const html = (VIEWS[V.name] || VIEWS.home)();
    const session = SESSION.includes(V.name);
    const enter = V.name !== lastView; lastView = V.name;
    app.innerHTML = (session ? '' : header()) + `<main class="main ${session ? 'session' : ''} ${enter ? 'enter' : ''}">${html}</main>` + (session ? '' : nav());
    const af = app.querySelector('[autofocus]'); if (af && !matchMedia('(pointer:coarse)').matches) af.focus({ preventScroll: true });
    OSK.refresh();
    if (V.name === 'flash') bindSwipe();
  }
  function navCur() { return { duel: 'games', gameSetup: 'games' }[V.name] || V.name; }
  function header() {
    const L = Store.level();
    return `<header class="top"><div class="top-in">
      <button class="brand" data-a="go" data-to="home"><span class="logo">م</span><span class="brand-t">Murājaʿa</span></button>
      <nav class="topnav">${NAV.map(([v, , l]) => `<button data-a="go" data-to="${v}" class="${navCur() === v ? 'on' : ''}">${l}</button>`).join('')}</nav>
      <div class="hud">
        <span class="pill fire" title="Jours de suite"><span class="flame">🔥</span>${Store.streak()}</span>
        <span class="pill lvl" title="${S().xp} XP · encore ${L.next} XP pour le niveau ${L.lvl + 1}"><b>${L.lvl}</b><i class="xpbar"><b style="width:${L.pct}%"></b></i></span>
        <button class="icon" data-a="go" data-to="settings" aria-label="Réglages">⚙️</button>
      </div></div></header>`;
  }
  function nav() {
    return `<nav class="tabs">${NAV.map(([v, i, l]) => `<button data-a="go" data-to="${v}" class="${navCur() === v ? 'on' : ''}"><span>${i}</span>${l}</button>`).join('')}</nav>`;
  }
  function sessionTop(i, n, extra = '') {
    return `<div class="stop"><button class="icon quit" data-a="quit" aria-label="Quitter">✕</button>
      <div class="prog"><b style="width:${n ? Math.round(i / n * 100) : 0}%"></b></div><span class="cnt">${Math.min(i + 1, n)}/${n}</span>${extra}</div>`;
  }

  /* ---------- sélecteur de contenu ---------- */
  function picker() {
    const s = S().sel;
    const none = !s.some(id => LIB.lessons[id]);
    return `<div class="picker">${LIB.decks.map(d => {
      const ids = d.lessons.map(l => l.id), on = ids.filter(id => s.includes(id)).length;
      const all = ids.length && on === ids.length;
      const words = d.lessons.reduce((a, l) => a + l.items.length, 0);
      return `<div class="pdeck ${on || none ? 'has' : ''}">
        <div class="pdeck-h"><div class="pdeck-t">${ar(d.title, 'md')}<small>${esc(d.subtitle || '')} · ${words} mots</small></div>
          <button class="chip-btn ${all ? 'on' : ''}" data-a="selDeck" data-id="${esc(d.id)}">${all ? '✓ ' : ''}Tout le niveau</button></div>
        <div class="pchips">${d.lessons.map(l => `<button class="pchip ${s.includes(l.id) ? 'on' : ''}" data-a="selLesson" data-id="${esc(l.id)}">
          <span>${esc(l.title)}</span><small>${l.items.length}</small></button>`).join('')}</div></div>`;
    }).join('')}
    <p class="hint">${none ? '💡 Rien de coché : tout est inclus.' : `${Engine.itemsFor(sel()).length} mots sélectionnés · <button class="link" data-a="selNone">tout décocher</button>`}</p></div>`;
  }
  function whatChips(obj, action) {
    const items = Engine.itemsFor(sel());
    return `<div class="wchips">${Object.entries(CATS).map(([k, c]) => {
      const n = Engine.catCount(items, k);
      return `<button class="wchip ${obj[k] ? 'on' : ''} ${n ? '' : 'empty'}" data-a="${action}" data-k="${k}"><span class="wi">${c.icon}</span><b>${c.label}</b><small>${n} mots</small><i class="tick">✓</i></button>`;
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
      ${it.note ? `<div class="note">📝 ${esc(it.note)}</div>` : ''}
    </div>`;
  }

  /* ================= VUES ================= */
  const VIEWS = {};

  VIEWS.home = () => {
    const L = Store.level(), xp = todayXP(), goal = S().settings.goal, pct = Math.min(1, xp / goal);
    const cards = Engine.cards(Engine.itemsFor(sel()), S().rev), st = Engine.srsStats(cards);
    const en = Engine.enemies(10);
    const hello = S().name
      ? `<div class="hello"><span class="ar">السَّلَامُ عَلَيْكُمْ</span><b>${esc(S().name)} 👋</b></div>`
      : `<div class="hello"><span class="ar">أَهْلًا وَسَهْلًا</span><div class="namerow"><input id="nameIn" placeholder="Ton prénom" maxlength="20"><button class="btn white sm" data-a="saveName">OK</button></div></div>`;
    return `
      <section class="hero">
        <i class="blob b1"></i><i class="blob b2"></i><i class="blob b3"></i>
        <div class="hero-top">${hello}
          <div class="ring" style="--p:${pct}" title="Objectif du jour"><div><b>${xp}</b><small>/ ${goal} XP</small></div></div></div>
        <div class="hero-stats">
          <span><i>🔥</i><b>${Store.streak()}</b> jour${Store.streak() > 1 ? 's' : ''}</span>
          <span><i>⭐</i>Niveau <b>${L.lvl}</b></span>
          <span><i>🃏</i><b>${st.due}</b> à revoir · <b>${st.newAvail}</b> nouvelles</span>
        </div>
        <button class="btn white lg" data-a="quickReview">Réviser maintenant <span class="arrow">→</span></button>
      </section>

      <h2 class="sec">Modes de révision</h2>
      <div class="quick">
        ${[['srs', '🧠', 'Répétition', 'espacée'], ['cram', '⚡', 'Cartes', 'rapides'], ['write', '✍️', 'Écrire', 'la réponse'], ['qcm', '🔘', 'QCM', '4 choix']].map(([m, i, a, b]) =>
          `<button class="qbtn" data-a="quickMode" data-v="${m}"><span class="qi">${i}</span><b>${a}</b><small>${b}</small></button>`).join('')}
        <button class="qbtn" data-a="go" data-to="examSetup"><span class="qi">📝</span><b>Examen</b><small>à trous</small></button>
      </div>

      <h2 class="sec">Jeux <button class="link" data-a="go" data-to="games">Tout voir</button></h2>
      <div class="hscroll">${Object.entries(GAMES).map(([k, g]) => gameCard(k, g, true)).join('')}</div>

      ${en.length ? `<section class="panel enemy"><div class="row between"><h2>👹 Mots ennemis</h2><button class="btn sm danger-soft" data-a="fightEnemies">Les affronter</button></div>
        <p class="muted small">Les mots que tu rates le plus souvent.</p>
        <div class="chips">${en.map(it => `<span class="chip">${ar(Engine.head(it), 'sm')}</span>`).join('')}</div></section>` : ''}

      <h2 class="sec">Tes niveaux</h2>
      <div class="decks">${LIB.decks.map(d => {
        const items = d.lessons.flatMap(l => l.items);
        const m = items.length ? items.reduce((a, it) => a + Engine.mastery(it), 0) / items.length : 0;
        return `<div class="dcard"><div class="dcard-h">${ar(d.title, 'md')}<span class="dpct">${Math.round(m * 100)}%</span></div>
          <small class="muted">${esc(d.subtitle || '')} · ${d.lessons.length} pages · ${items.length} mots</small>${bar(m)}
          <div class="row wrap"><button class="btn sm primary" data-a="reviseDeck" data-id="${esc(d.id)}">Réviser ce niveau</button><button class="btn sm" data-a="go" data-to="words">Voir les mots</button></div></div>`;
      }).join('')}
        <div class="dcard soon"><div class="dcard-h"><b>+ Mustawa 1 à 7</b></div><small class="muted">Envoie les photos de ton livre pour les ajouter.</small></div>
      </div>`;
  };

  /* ----- Réviser : réglages ----- */
  const MODES = [['srs', '🧠', 'Répétition espacée', 'Comme Anki : chaque mot revient au bon moment'], ['cram', '⚡', 'Cartes rapides', 'Je sais / je ne sais pas, glisse les cartes'], ['write', '✍️', 'Écrire', 'Tape la réponse au clavier'], ['qcm', '🔘', 'QCM', 'Choisis parmi 4 propositions']];
  VIEWS.reviewSetup = () => {
    const r = S().rev, items = Engine.itemsFor(sel()), cards = Engine.cards(items, r);
    const st = Engine.srsStats(cards);
    const n = r.n === 'all' ? cards.length : Math.min(cards.length, r.n);
    return `<div class="page-h"><h1>Réviser</h1><p class="muted">Choisis le niveau, les pages, le type de question, le sens et le mode.</p></div>
      <section class="panel"><h2 class="step"><i>1</i>Quel niveau, quelles pages ?</h2>${picker()}</section>
      <section class="panel"><h2 class="step"><i>2</i>Que veux-tu travailler ?</h2>${whatChips(r.what, 'revWhat')}
        <h3>Sens</h3>${seg('revOpt', 'dir', [['ar', 'Arabe → Français'], ['fr', 'Français → Arabe'], ['both', 'Les deux']], r.dir)}
        <p class="muted small">Pour le pluriel, les contraires et les synonymes : « Arabe → Français » = du mot vers sa forme, l'autre sens = l'inverse.</p></section>
      <section class="panel"><h2 class="step"><i>3</i>Comment ?</h2>
        <div class="modes">${MODES.map(([k, i, t, d]) => `<button class="mode ${r.mode === k ? 'on' : ''}" data-a="revOpt" data-k="mode" data-v="${k}"><span class="mi">${i}</span><b>${t}</b><small>${d}</small></button>`).join('')}</div>
        ${r.mode !== 'srs' ? `<h3>Nombre de cartes</h3>${seg('revOpt', 'n', [[10, '10'], [20, '20'], [40, '40'], ['all', 'Toutes']], r.n)}` : ''}</section>
      <div class="cta-bar"><div class="cta-info">${r.mode === 'srs'
        ? `<b>${st.due}</b> à revoir · <b>${st.newAvail}</b> nouvelles <small>sur ${cards.length} cartes</small>`
        : `<b>${n}</b> cartes <small>sur ${cards.length}</small>`}</div>
        <button class="btn primary lg" data-a="startRevision" ${cards.length ? '' : 'disabled'}>Commencer</button></div>`;
  };

  function startRevision() {
    const r = S().rev, cards = Engine.cards(Engine.itemsFor(sel()), r);
    if (!cards.length) { toast('Aucune carte pour cette sélection'); return; }
    if (r.mode === 'srs') {
      const q = Engine.srsQueue(cards);
      if (!q.length) { toast('Rien à revoir pour l\'instant 🎉 Essaie les cartes rapides ou un jeu.', 3500); return; }
      go('flash', { mode: 'srs', q, i: 0, flip: false, n: 0, xp: 0, total: q.length });
      return;
    }
    let list = Engine.shuffle(cards.slice());
    if (r.n !== 'all') list = list.slice(0, r.n);
    if (r.mode === 'cram') go('flash', { mode: 'cram', q: list, i: 0, flip: false, n: 0, xp: 0, total: list.length, known: 0, unknown: 0, seen: {} });
    else startExamQs(Engine.qsFromCards(list), { mode: r.mode === 'write' ? 'type' : 'qcm', title: r.mode === 'write' ? 'Écrire' : 'QCM', review: true });
  }

  /* ----- cartes (répétition espacée + cartes rapides) ----- */
  function face(c, side) {
    const it = c.item;
    if (side === 'front') {
      let h = c.p.map(f => `<div class="pv">${val(f, it[f], F[f].isAr ? 'xxl' : 'xl')}</div>`).join('');
      if (c.kind === 'arfr' && it.t === 'verb' && it.mud) h += `<div class="sub">${ar(it.mud, 'md')}</div>`;
      if (c.kind === 'frar') h += `<div class="sub muted">${esc(T[it.t] ? T[it.t].label : '')}</div>`;
      return h + `<div class="ask">${c.a.map(f => esc(F[f].fr)).join(' · ')} ?</div>`;
    }
    return `<div class="ans">${c.a.map(f => `<div class="av">${flabel(f)}${val(f, it[f], F[f].isAr ? 'xl' : 'xl')}</div>`).join('')}</div>${itemCard(it, true, c.a)}`;
  }
  VIEWS.flash = () => {
    const c = V.q[V.i];
    if (!c) return flashDone();
    const isNew = V.mode === 'srs' && !S().cards[c.id];
    const fresh = lastCard !== c.id + V.i; lastCard = c.id + V.i;
    const top = V.mode === 'cram'
      ? sessionTop(V.known, V.total, `<span class="tally"><i class="u" title="À revoir">${V.unknown}</i><i class="k" title="Je sais">${V.known}</i></span>`)
      : sessionTop(V.i, V.q.length);
    const g = [[1, 'À revoir', 'bad'], [2, 'Difficile', 'hard'], [3, 'Bien', 'good'], [4, 'Facile', 'easy']];
    const controls = V.mode === 'cram'
      ? `<div class="cram-ctl"><button class="round bad" data-a="cram" data-v="0" aria-label="À revoir">✕</button>
           <span class="muted small">← glisse →<br>ou touche la carte</span>
         <button class="round good" data-a="cram" data-v="1" aria-label="Je sais">✓</button></div>`
      : V.flip
        ? `<div class="grades">${g.map(([n, l, cl]) => `<button class="gr ${cl}" data-a="grade" data-g="${n}"><b>${l}</b><small>${Store.preview(c.id, n)}</small><kbd>${n}</kbd></button>`).join('')}</div>`
        : `<button class="btn primary lg wide" data-a="flip">Retourner la carte <kbd>espace</kbd></button>`;
    return `${top}
      <div class="fc-wrap"><div class="fc ${V.flip ? 'flipped' : ''} ${fresh ? 'card-in' : ''}" id="fc" data-a="flip">
        <div class="fc-inner">
          <div class="face front"><div class="fc-kind">${isNew ? '<span class="badge new">nouveau</span>' : ''}<span>${esc(Engine.KINDS[c.kind].label)}</span></div>
            <div class="fc-body">${face(c, 'front')}</div><div class="fc-hint">Touche pour retourner ↻</div></div>
          <div class="face back"><div class="fc-kind"><span>Réponse</span></div><div class="fc-body">${face(c, 'back')}</div></div>
        </div>
        ${V.mode === 'cram' ? '<div class="stamp know">JE SAIS</div><div class="stamp dont">À REVOIR</div>' : ''}
      </div></div>
      ${controls}`;
  };
  function flashDone() {
    later(() => { FX.confetti(); FX.sound.win(); }, 150);
    return `<div class="done"><div class="big-emoji">🎉</div><h1>Bravo, session terminée !</h1>
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
    if (fc) { fc.style.transition = 'transform .32s ease, opacity .32s'; fc.style.transform = `translateX(${know ? 130 : -130}%) rotate(${know ? 18 : -18}deg)`; fc.style.opacity = '0'; }
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
      fc.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`;
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
      <section class="panel"><h2 class="step"><i>1</i>Quel niveau, quelles pages ?</h2>${picker()}</section>
      <section class="panel"><h2 class="step"><i>2</i>Réglages</h2>
        <h3>Nombre de questions</h3>${seg('examOpt', 'n', [[10, '10'], [15, '15'], [25, '25'], ['all', 'Tout']], e.n)}
        <h3>Réponses</h3>${seg('examOpt', 'mode', [['qcm', '🔘 Choix multiples'], ['type', '✍️ Écrire']], e.mode)}
        <p class="muted small">${e.mode === 'type' ? `Correction des harakat : <b>${lvl}</b> — <button class="link" data-a="go" data-to="settings">modifier</button>` : 'Les choix contiennent des pièges sur la voyelle du muḍāriʿ.'}</p>
        <h3>Mode boss 👑</h3>${seg('examOpt', 'boss', [[false, 'Normal'], [true, '3 vies seulement']], e.boss)}</section>
      <div class="cta-bar"><div class="cta-info"><b>${Engine.itemsFor(sel()).length}</b> mots</div><button class="btn primary lg" data-a="startExam">C'est parti</button></div>`;
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

  VIEWS.exam = () => {
    if (V.over) return examResult();
    const q = V.qs[V.i], it = q.item, fb = V.phase === 'fb';
    const hearts = V.lives != null ? `<span class="hearts">${'❤️'.repeat(V.lives)}${'🤍'.repeat(Math.max(0, 3 - V.lives))}</span>` : (V.streak >= 3 ? `<span class="streak-b">🔥 ${V.streak}</span>` : '');
    const hole = f => {
      const r = fb ? V.cur[f] : null;
      let body;
      if (V.mode === 'qcm') {
        body = `<div class="opts ${F[f].isAr ? 'ar-opts' : ''}">${q.options[f].map((o, k) => {
          let cl = V.pick[f] === o ? 'sel' : '';
          if (fb) cl = o === it[f] ? 'good' : (V.pick[f] === o ? 'bad' : 'dim');
          return `<button class="opt ${cl}" data-a="pick" data-f="${f}" data-k="${k}" ${fb ? 'disabled' : ''}>${val(f, o)}</button>`;
        }).join('')}</div>`;
      } else {
        const isAr = F[f].isAr;
        body = `<input class="hole-in ${isAr ? 'ar-input' : ''} ${r ? (r.ok ? 'good' : 'bad') : ''}" data-f="${f}" dir="${isAr ? 'rtl' : 'ltr'}" lang="${isAr ? 'ar' : 'fr'}"
          value="${esc(r ? r.val : '')}" ${fb ? 'readonly' : ''} autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="${isAr ? 'اُكْتُبْ هُنَا…' : 'en français…'}">`;
      }
      const fbl = r ? `<div class="fbl ${r.ok ? 'ok' : 'ko'}">${r.ok ? '✓ Correct' : '✗ Réponse :'} ${!r.ok || V.mode === 'type' ? val(f, it[f], 'md') : ''}
        ${!r.ok && r.near ? `<small>${f === 'mud' && V.level === 'mudari' ? 'Lettres justes — vérifie la voyelle de la ʿayn' : 'Lettres justes, harakat à corriger'}</small>` : ''}</div>` : '';
      return `<div class="hole ${r ? (r.ok ? 'is-ok' : 'is-ko') : ''}">${flabel(f)}${body}${fbl}</div>`;
    };
    const allOk = fb && q.hidden.every(f => V.cur[f].ok);
    return `${sessionTop(V.i, V.qs.length, hearts)}
      <div class="qcard ${fb ? (allOk ? 'pulse-ok' : 'shake') : ''}"><div class="given"><div class="qtag">${esc(V.title)}${q.kind ? ' · ' + esc(Engine.KINDS[q.kind].label) : ''}</div>${flabel(q.given)}<div class="gval">${val(q.given, it[q.given], 'xxl')}</div>
        <div class="typ">${esc(T[it.t] ? T[it.t].label : '')}${it.prep && q.given !== 'fr' ? ` · ${ar(it.prep, 'sm')}` : ''}</div></div>
        <div class="holes">${q.hidden.map(hole).join('')}</div></div>
      ${V.mode === 'type' && !fb ? `<button class="link osk-toggle" data-a="toggleOsk">⌨️ Clavier arabe à l'écran : ${S().settings.osk ? 'activé' : 'désactivé'}</button>` : ''}
      ${fb
        ? `<div class="fbbar ${allOk ? 'ok' : 'ko'}"><div class="fbh"><b>${allOk ? pickCheer() : 'Pas tout à fait…'}</b>
            ${!allOk ? `<button class="link" data-a="override">J'avais juste</button>` : ''}</div>
            ${it.ex ? `<div class="ex">${ar(it.ex)}</div>` : ''}
            <button class="btn lg wide ${allOk ? 'success' : 'danger'}" data-a="examNext" autofocus>Continuer <kbd>Entrée</kbd></button></div>`
        : `<button class="btn primary lg wide" data-a="examCheck">Valider <kbd>Entrée</kbd></button>`}`;
  };
  const CHEERS = ['ممتاز ! 🌟', 'أحسنت ! ✨', 'Bravo ! 🔥', 'ما شاء الله ! 💎', 'Parfait ! 🎯', 'جيد جدا ! 👏'];
  const pickCheer = () => CHEERS[(V.i + V.score) % CHEERS.length];

  function examCheck() {
    const q = V.qs[V.i], it = q.item;
    if (V.mode === 'qcm' && q.hidden.some(f => V.pick[f] == null)) { toast('Réponds à toutes les cases'); return; }
    const cur = {};
    q.hidden.forEach(f => {
      let v, r;
      if (V.mode === 'qcm') { v = V.pick[f]; r = { ok: v === it[f] }; }
      else {
        v = (app.querySelector(`.hole-in[data-f="${f}"]`) || {}).value || '';
        r = F[f].isAr ? AR.check(v, it[f], V.level, f) : AR.checkFr(v, it[f]);
      }
      cur[f] = Object.assign({ val: v }, r);
    });
    V.cur = cur; V.phase = 'fb';
    const nOk = q.hidden.filter(f => cur[f].ok).length, all = nOk === q.hidden.length;
    V.score += nOk; V.max += q.hidden.length;
    V.res.push({ qi: V.i, id: it.id, ok: all });
    if (all) { V.streak++; FX.sound[V.streak > 0 && V.streak % 5 === 0 ? 'combo' : 'ok'](); }
    else { V.streak = 0; FX.sound.bad(); FX.buzz(60); }
    if (!all && V.lives != null) V.lives--;
    if (!V.duel) Store.answer(it.id, all);
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
    if (!V.celebrated) { V.celebrated = true; later(() => { if (dead) FX.sound.lose(); else { FX.sound.win(); if (stars >= 2) FX.confetti(stars === 3 ? 220 : 120); } }, 200); }
    return `<div class="done">
      <div class="big-emoji">${dead ? '💀' : ['😅', '🙂', '😃', '🏆'][stars]}</div>
      <h1>${dead ? 'Le boss t\'a eu !' : pct === 100 ? 'Sans faute !' : 'Terminé !'}</h1>
      <div class="stars">${[0, 1, 2].map(i => `<span class="${i < stars ? 'on' : ''}" style="--d:${i * 0.15}s">★</span>`).join('')}</div>
      <div class="result-grid"><div><b>${pct}%</b><small>réussite</small></div><div><b>${V.score}/${V.max}</b><small>cases</small></div><div><b>${fmtTime(V.time)}</b><small>temps</small></div><div><b>+${V.xp}</b><small>XP</small></div></div>
      ${V.duel ? duelBox() : ''}
      ${wrong.length ? `<section class="panel left"><h2>À retravailler (${wrong.length})</h2>
        ${wrong.map(r => { const it = LIB.items[r.id]; return it ? `<details><summary>${ar(Engine.head(it), 'md')} <span class="muted">${esc(it.fr)}</span></summary>${itemCard(it, true)}</details>` : ''; }).join('')}
        ${V.duel ? '' : `<button class="btn primary" data-a="retryWrong">🔁 Rejouer mes erreurs</button>`}</section>` : ''}
      <div class="col">${V.duel ? `<button class="btn primary" data-a="go" data-to="duel">Retour aux duels</button>` : `<button class="btn primary" data-a="${V.review ? 'startRevision' : 'go'}" data-to="examSetup">🔄 Recommencer</button>`}
      <button class="btn ghost" data-a="go" data-to="home">Accueil</button></div></div>`;
  }

  /* ----- Jeux ----- */
  const GAMES = {
    rush: { icon: '⚡', name: 'Chrono-rush', desc: '60 secondes pour enchaîner un max de bonnes réponses. Les combos multiplient les points.', grad: 'g1' },
    tf: { icon: '⚖️', name: 'Vrai ou faux', desc: 'Une paire s\'affiche : est-elle juste ? Réponds au plus vite, 45 secondes.', grad: 'g2' },
    rain: { icon: '🌧️', name: 'Pluie de mots', desc: 'Les mots tombent de plus en plus vite. Réponds avant qu\'ils touchent le sol. 3 vies.', grad: 'g3' },
    anagram: { icon: '🧩', name: 'Lettres mélangées', desc: 'Reconstruis le mot arabe lettre par lettre. Idéal pour l\'orthographe.', grad: 'g4' }
  };
  function gameCard(k, g, small) {
    const best = S().best[k] || 0;
    return `<button class="gcard ${g.grad} ${small ? 'small' : ''}" data-a="openGame" data-v="${k}"><span class="gi">${g.icon}</span><b>${g.name}</b>${small ? '' : `<small>${esc(g.desc)}</small>`}<span class="best">🏆 ${best}</span></button>`;
  }
  VIEWS.games = () => `<div class="page-h"><h1>Jeux</h1><p class="muted">Apprends en t'amusant. Chaque jeu se règle : niveau, pages et type de question.</p></div>
    <div class="ggrid">${Object.entries(GAMES).map(([k, g]) => gameCard(k, g)).join('')}
      <button class="gcard g5" data-a="startBoss"><span class="gi">👑</span><b>Boss de leçon</b><small>Examen à écrire sur toute la sélection. 3 vies, pas une de plus.</small></button>
      <button class="gcard g6" data-a="fightEnemies"><span class="gi">👹</span><b>Mots ennemis</b><small>Un examen uniquement sur les mots que tu rates le plus.</small></button>
      <button class="gcard g7" data-a="go" data-to="duel"><span class="gi">⚔️</span><b>Duel</b><small>Les mêmes questions pour toi et ton binôme. Qui gagne ?</small></button></div>`;

  VIEWS.gameSetup = () => {
    const g = GAMES[V.game], w = S().game.what;
    const items = Engine.itemsFor(sel());
    const pairs = Engine.pairsFor(w).filter(p => V.game !== 'anagram' || F[p[1]].isAr);
    const n = Engine.playable(items, pairs).length;
    return `<button class="link back" data-a="go" data-to="games">← Jeux</button>
      <div class="ghead ${g.grad}"><span class="gi">${g.icon}</span><div><h1>${g.name}</h1><p>${esc(g.desc)}</p></div><span class="best">🏆 Record : ${S().best[V.game] || 0}</span></div>
      <section class="panel"><h2 class="step"><i>1</i>Quel niveau, quelles pages ?</h2>${picker()}</section>
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
    later(() => { if (record || score > 0) { FX.sound.win(); FX.confetti(record ? 200 : 90); } else FX.sound.lose(); }, 150);
  }
  function overScreen(k, lines) {
    return `<div class="done"><div class="big-emoji">${V.record ? '🏆' : GAMES[k].icon}</div><h1>${V.record ? 'Nouveau record !' : 'Partie terminée'}</h1>
      <div class="result-grid">${lines.map(([v, l]) => `<div><b>${v}</b><small>${l}</small></div>`).join('')}<div><b>+${V.xp}</b><small>XP</small></div></div>
      <div class="col"><button class="btn primary lg" data-a="startGame" data-v="${k}">Rejouer</button><button class="btn" data-a="openGame" data-v="${k}">Réglages</button><button class="btn ghost" data-a="go" data-to="games">Jeux</button></div></div>`;
  }
  function timebar() {
    const p = Math.max(0, (V.end - Date.now()) / V.dur);
    return `<div class="timebar"><b id="tb" style="transform:scaleX(${p})"></b></div>`;
  }
  function rushTick() {
    const left = V.end - Date.now();
    const el = document.getElementById('rt'); if (el) el.textContent = Math.max(0, Math.ceil(left / 1000));
    const tb = document.getElementById('tb'); if (tb) { tb.style.transform = `scaleX(${Math.max(0, left / V.dur)})`; tb.classList.toggle('hurry', left < 10000); }
    if (left <= 0) gameOver(V.name, V.score);
  }
  const gtop = (extra) => `<div class="stop game"><button class="icon quit" data-a="quit" aria-label="Quitter">✕</button>
    <span class="timer">⏱ <b id="rt">${Math.max(0, Math.ceil((V.end - Date.now()) / 1000))}</b>s</span><span class="pts" id="pts">${V.score} pts</span>${extra || ''}</div>${timebar()}`;

  // Chrono-rush
  VIEWS.rush = () => {
    if (V.over) return overScreen('rush', [[V.score, 'points'], [V.n, 'réponses'], ['×' + V.maxCombo, 'meilleur combo']]);
    const q = V.q, mult = 1 + Math.floor(V.combo / 5);
    return `${gtop(V.combo >= 3 ? `<span class="combo">🔥 ${V.combo} · ×${mult}</span>` : '')}
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

  // Vrai ou faux
  VIEWS.tf = () => {
    if (V.over) return overScreen('tf', [[V.score, 'points'], [V.n, 'réponses'], ['×' + V.maxCombo, 'meilleure série']]);
    const q = V.q, fb = V.fb;
    return `${gtop(V.combo >= 3 ? `<span class="combo">🔥 ${V.combo}</span>` : '')}
      <div class="tf-card ${fb ? (fb.ok ? 'pulse-ok' : 'shake') : 'card-in'}">
        <div class="tf-side">${flabel(q.from)}${val(q.from, q.item[q.from], 'xxl')}</div>
        <div class="tf-eq">=</div>
        <div class="tf-side">${flabel(q.to)}${val(q.to, q.shown, 'xl')}</div>
        ${fb && !fb.ok && !q.truth ? `<div class="tf-fix">Bonne réponse : ${val(q.to, q.item[q.to], 'md')}</div>` : ''}
        ${fb ? `<div class="tf-verdict ${fb.ok ? 'ok' : 'ko'}">${fb.ok ? '✓' : '✗'} ${q.truth ? 'C\'était vrai' : 'C\'était faux'}</div>` : ''}
      </div>
      <div class="tf-btns"><button class="round-lg bad" data-a="tfPick" data-v="0"><span>✕</span>Faux<kbd>←</kbd></button>
        <button class="round-lg good" data-a="tfPick" data-v="1"><span>✓</span>Vrai<kbd>→</kbd></button></div>`;
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

  // Pluie de mots
  function armRain() {
    const id = ++V.qid;
    later(() => { if (V.name === 'rain' && !V.over && V.qid === id && !V.fb) rainResolve(-1); }, V.speed);
  }
  VIEWS.rain = () => {
    if (V.over) return overScreen('rain', [[V.score, 'mots'], [`${(V.speed / 1000).toFixed(1)}s`, 'vitesse finale']]);
    const q = V.q, fb = V.fb;
    return `<div class="stop game"><button class="icon quit" data-a="quit" aria-label="Quitter">✕</button>
        <span class="hearts">${'❤️'.repeat(V.lives)}${'🤍'.repeat(3 - V.lives)}</span><span class="pts">${V.score} mots</span></div>
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

  // Lettres mélangées
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
        <div class="row center wrap"><button class="btn sm" data-a="anaBack" ${V.built.length && !fb ? '' : 'disabled'}>⌫ Effacer</button>
          <button class="btn sm" data-a="anaHint" ${fb ? 'disabled' : ''}>💡 Indice</button><button class="btn sm ghost" data-a="anaSkip" ${fb ? 'disabled' : ''}>Passer</button></div>
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

  /* ----- Duel ----- */
  VIEWS.duel = () => {
    const tab = V.tab || 'create';
    const tabs = `<div class="seg wide">${[['create', 'Créer'], ['join', 'Rejoindre'], ['history', 'Historique']].map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-a="duelTab" data-tab="${k}">${l}</button>`).join('')}</div>`;
    let body = '';
    if (tab === 'create') {
      const d = V.d || (V.d = { n: 15, mode: 'qcm' });
      body = `<section class="panel"><h2 class="step"><i>1</i>Quel niveau, quelles pages ?</h2>${picker()}</section>
        <section class="panel"><h2 class="step"><i>2</i>Réglages</h2><h3>Questions</h3>${seg('duelOpt', 'n', [[10, '10'], [15, '15'], [25, '25']], d.n)}
        <h3>Réponses</h3>${seg('duelOpt', 'mode', [['qcm', '🔘 Choix multiples'], ['type', '✍️ Écrire']], d.mode)}</section>
        ${V.code ? `<section class="panel codebox"><h3>Code du défi</h3><p class="muted small">Envoie ce code ou le lien à ton binôme : vous aurez exactement les mêmes questions.</p>
          <textarea readonly rows="3">${esc(V.code)}</textarea>
          <div class="row wrap"><button class="btn" data-a="copy" data-text="${esc(V.code)}">📋 Copier le code</button>
          ${location.protocol.startsWith('http') ? `<button class="btn" data-a="copy" data-text="${esc(location.origin + location.pathname + '#duel=' + V.code)}">🔗 Copier le lien</button>` : ''}</div>
          <button class="btn primary lg wide" data-a="playDuel" data-code="${esc(V.code)}">⚔️ Jouer mon tour</button></section>`
        : `<button class="btn primary lg wide" data-a="createDuel">Créer le défi</button>`}`;
    } else if (tab === 'join') {
      body = `<section class="panel"><h3>Colle le code reçu</h3><textarea id="joinCode" rows="4" placeholder="DUEL-…">${esc(V.join || '')}</textarea>
        <button class="btn primary lg wide" data-a="joinDuel">⚔️ Lancer le défi</button></section>`;
    } else {
      const list = S().duels.slice().reverse();
      body = list.length ? list.map(duelCard).join('') : '<p class="muted center">Aucun duel pour l\'instant.</p>';
    }
    return `<button class="link back" data-a="go" data-to="games">← Jeux</button>
      <div class="ghead g7"><span class="gi">⚔️</span><div><h1>Duel</h1><p>Chacun joue sur son appareil, puis vous échangez vos codes résultat pour savoir qui gagne.</p></div></div>${tabs}${body}`;
  };
  function duelCard(dl) {
    const m = dl.mine, t = dl.theirs;
    let verdict = '';
    if (m && t) {
      const w = m.sc !== t.sc ? (m.sc > t.sc ? 1 : -1) : (m.t !== t.t ? (m.t < t.t ? 1 : -1) : 0);
      verdict = `<div class="verdict ${w > 0 ? 'win' : w < 0 ? 'lose' : ''}">${w > 0 ? '🏆 Tu gagnes !' : w < 0 ? `🥈 ${esc(t.by)} gagne` : '🤝 Égalité parfaite'}</div>
        <table class="vs"><tr><th></th><th>${esc(m.by || 'Moi')}</th><th>${esc(t.by || 'Binôme')}</th></tr>
        <tr><td>Score</td><td>${m.sc}/${m.mx}</td><td>${t.sc}/${t.mx}</td></tr>
        <tr><td>Temps</td><td>${fmtTime(m.t)}</td><td>${fmtTime(t.t)}</td></tr>
        <tr><td>Questions</td><td class="bits">${m.b.split('').map(x => `<i class="${x === '1' ? 'y' : 'n'}"></i>`).join('')}</td><td class="bits">${t.b.split('').map(x => `<i class="${x === '1' ? 'y' : 'n'}"></i>`).join('')}</td></tr></table>`;
    }
    return `<section class="panel duelcard"><div class="row between"><b>Défi de ${esc(dl.by || '?')}</b><small class="muted">${new Date(dl.at).toLocaleDateString('fr-FR')} · ${dl.n} questions</small></div>
      ${verdict || (m ? `<p>Ton score : <b>${m.sc}/${m.mx}</b> en ${fmtTime(m.t)}</p>` : '<p class="muted">Pas encore joué.</p>')}
      ${m && !t ? `<p class="muted small">Envoie ton code résultat, puis colle celui de ton binôme :</p>
        <div class="row"><button class="btn" data-a="copy" data-text="${esc(dl.myCode)}">📋 Mon code résultat</button></div>
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
    if (old && old.mine) { go('duel', { tab: 'history' }); toast('Tu as déjà joué ce défi'); return; }
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

  /* ----- Mots / éditeur ----- */
  VIEWS.words = () => {
    if (V.lesson && LIB.lessons[V.lesson]) return lessonView();
    return `<div class="page-h"><h1>Mes mots</h1><p class="muted">Consulte, corrige ou ajoute des mots.</p></div>
      ${LIB.decks.map(d => `<section class="panel"><div class="pdeck-t">${ar(d.title, 'md')}<small>${esc(d.subtitle || '')}</small></div>
        ${d.lessons.map(l => `<button class="lrow" data-a="openLesson" data-id="${esc(l.id)}"><span class="lt">${esc(l.title)} ${ar(l.titleAr || '', 'sm')}</span><span class="cnt">${l.items.length} mots</span>${bar(Engine.lessonMastery(l))}<span class="chev">›</span></button>`).join('')}
        ${d.user ? `<button class="link" data-a="newLesson" data-deck="${esc(d.id)}">+ Nouvelle leçon</button>` : ''}</section>`).join('')}
      <section class="panel"><h3>Ajouter du contenu</h3>
        <div class="row wrap"><button class="btn" data-a="newLesson" data-deck="perso">+ Créer une leçon perso</button>
        <label class="btn">📥 Importer un paquet (.json)<input type="file" accept=".json,application/json" data-a="importDeck" hidden></label></div>
        <p class="muted small">Les paquets transcrits depuis tes photos s'importent ici. Ton binôme peut importer les mêmes fichiers.</p></section>`;
  };
  function lessonView() {
    const L = LIB.lessons[V.lesson];
    const rows = L.items.map(it => {
      const forms = it.t === 'verb' ? [it.mud, it.amr, it.masdar] : [it.pl];
      return `<button class="wrow" data-a="editItem" data-id="${esc(it.id)}"><span class="dot" style="--m:${Engine.mastery(it)}"></span>
        <span class="wh">${ar(Engine.head(it), 'md')}</span><span class="wf">${ar(forms.filter(Boolean).join(' · '), 'sm')}</span><span class="wt">${esc(it.fr)}</span></button>`;
    }).join('');
    return `<button class="link back" data-a="go" data-to="words">← Mes mots</button>
      <div class="page-h"><h1>${esc(L.title)} ${ar(L.titleAr || '', 'md')}</h1></div>
      <div class="row wrap"><button class="btn primary" data-a="lessonReview" data-id="${esc(L.id)}">🃏 Réviser cette page</button><button class="btn" data-a="lessonExam" data-id="${esc(L.id)}">📝 Examen</button>
      <button class="btn ghost" data-a="exportLesson" data-id="${esc(L.id)}">📤 Exporter</button></div>
      <div class="wlist">${rows || '<p class="muted">Aucun mot.</p>'}</div>
      <section class="panel"><h3>Ajouter un mot</h3><div class="row wrap">${Object.entries(T).map(([k, t]) => `<button class="btn sm" data-a="newItem" data-t="${k}">+ ${t.label}</button>`).join('')}</div></section>
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
    return `<div class="page-h"><h1>Réglages</h1></div>
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
        ${tog('sound', '🔊 Effets sonores')}${tog('osk', '⌨️ Clavier arabe à l\'écran (remplace celui du téléphone)')}</section>
      <section class="panel"><h3>Sauvegarde</h3><p class="muted small">Ta progression est enregistrée uniquement sur cet appareil. Exporte-la de temps en temps.</p>
        <div class="row wrap"><button class="btn" data-a="exportAll">📤 Exporter</button>
        <label class="btn">📥 Restaurer<input type="file" accept=".json" data-a="importAll" hidden></label>
        <button class="btn danger" data-a="resetAll">Tout réinitialiser</button></div></section>`;
  };

  /* ================= ACTIONS ================= */
  const A = {
    go: b => go(b.dataset.to),
    quit: () => {
      if (V.name === 'exam' && V.duel && !V.over && !confirm('Abandonner le duel ? Ton tour ne pourra pas être rejoué.')) return;
      const back = V.duel ? ['duel', { tab: 'history' }] : V.name === 'exam' && !V.review ? ['examSetup'] : V.name === 'exam' || V.name === 'flash' ? ['reviewSetup'] : ['gameSetup', { game: V.name }];
      go(back[0], back[1] || {});
    },
    saveName: () => { const v = (document.getElementById('nameIn').value || '').trim(); if (!v) return; S().name = v; Store.save(); toast('Enregistré'); render(); },
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
    startBoss: () => startExam(Engine.itemsFor(sel()), { boss: true, mode: 'type', n: 'all', title: 'Boss 👑' }),
    lessonExam: b => startExam(LIB.lessons[b.dataset.id].items),
    lessonReview: b => { S().sel = [b.dataset.id]; Store.save(); go('reviewSetup'); },
    fightEnemies: () => { const en = Engine.enemies(15); if (en.length < 2) { toast('Pas encore assez de mots ennemis 💪'); return; } startExam(en, { n: 'all', title: 'Mots ennemis 👹' }); },
    retryWrong: () => {
      const qs = V.res.filter(r => !r.ok).map(r => V.qs[r.qi]).filter(Boolean);
      startExamQs(qs, { mode: V.mode, boss: false, title: V.title, review: V.review });
    },
    pick: b => { if (V.phase !== 'ask') return; const q = V.qs[V.i]; V.pick[b.dataset.f] = q.options[b.dataset.f][+b.dataset.k]; FX.sound.tap(); render(); },
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
      if (dl.mine && (dl.mine.sc > r.sc || (dl.mine.sc === r.sc && dl.mine.t < r.t))) FX.confetti();
    },
    copy: b => copy(b.dataset.text),
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
      if (!d) { d = { id: b.dataset.deck, title: 'مُفْرَدَاتِي', subtitle: 'Mes mots perso', order: 999, user: true, lessons: [] }; S().decks.push(d); }
      d.lessons.push({ id: d.id + '-' + Date.now().toString(36), title, items: [] });
      Store.save(); rebuild(); render();
    },
    exportLesson: b => {
      const L = LIB.lessons[b.dataset.id], d = LIB.decks.find(x => x.id === L.deckId);
      const items = L.items.map(({ id, lessonId, deckId, custom, ...rest }) => rest);
      download(`${L.id}.json`, { id: d.id, title: d.title, subtitle: d.subtitle, lessons: [{ id: L.id, title: L.title, titleAr: L.titleAr, items }] });
    },
    setting: b => { S().settings[b.dataset.k] = b.dataset.v; Store.save(); applyTheme(); render(); },
    exportAll: () => download(`murajaa-sauvegarde-${Store.today()}.json`, S()),
    resetAll: () => { if (!confirm('Effacer toute ta progression, tes modifications et tes duels ?')) return; Store.S = Store.defaults(); Store.saveNow(); rebuild(); go('home'); }
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
        const deck = Object.assign({ order: 50, user: true }, d);
        if (i >= 0) S().decks[i] = deck; else S().decks.push(deck);
        n += d.lessons.length;
      }
      Store.save(); rebuild(); toast(n ? `${n} leçon(s) importée(s)` : 'Rien de nouveau à importer'); render();
    },
    importAll: async b => {
      const data = await readJSON(b); if (!data || !data.cards) { toast('Ce n\'est pas une sauvegarde valide'); return; }
      if (!confirm('Remplacer ta progression actuelle par cette sauvegarde ?')) return;
      localStorage.setItem(Store.KEY, JSON.stringify(data)); Store.load(); rebuild(); applyTheme(); go('home'); toast('Sauvegarde restaurée');
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
    if (V.name === 'exam' && !V.over) {
      if (V.phase === 'fb') return examNext();
      if (target && target.classList && target.classList.contains('hole-in')) {
        const ins = [...app.querySelectorAll('.hole-in')], i = ins.indexOf(target);
        if (i < ins.length - 1) { ins[i + 1].focus(); return; }
      }
      examCheck();
    }
  }
  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const typing = e.target.matches && e.target.matches('input, textarea');
    if (V.name === 'flash' && V.q && V.q[V.i]) {
      if (e.key === ' ' || (e.key === 'Enter' && V.mode === 'srs' && !V.flip)) { e.preventDefault(); if (V.mode === 'srs' && V.flip) return; flip(); }
      else if (V.mode === 'srs' && V.flip && '1234'.includes(e.key)) { e.preventDefault(); grade(+e.key); }
      else if (V.mode === 'cram' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) { e.preventDefault(); cram(e.key === 'ArrowRight'); }
    } else if (V.name === 'exam' && e.key === 'Enter') { e.preventDefault(); onEnter(e.target); }
    else if ((V.name === 'rush' || V.name === 'rain') && !V.over && !typing && '1234'.includes(e.key)) (V.name === 'rush' ? rushPick : rainResolve)(+e.key - 1);
    else if (V.name === 'tf' && !V.over && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); tfPick(e.key === 'ArrowRight' ? 1 : 0); }
    else if (V.name === 'anagram' && !V.over && e.key === 'Backspace' && !typing) { e.preventDefault(); A.anaBack(); }
    else if (V.name === 'words' && V.edit && e.key === 'Escape') A.closeEdit();
  });

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
  const h = location.hash;
  if (h.startsWith('#duel=')) { V = { name: 'duel', tab: 'join', join: h.slice(6) }; history.replaceState(null, '', location.pathname); }
  render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
