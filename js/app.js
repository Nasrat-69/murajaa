/* Interface : vues, actions, jeux. */
(() => {
  'use strict';
  const S = () => Store.S;
  const F = Engine.FIELDS, T = Engine.TYPES;
  const app = document.getElementById('app');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ar = (s, cls = '') => (s ? `<span class="ar ${cls}" lang="ar" dir="rtl">${esc(s)}</span>` : '');
  const val = (f, v, cls = '') => (F[f] && F[f].isAr ? ar(v, cls) : `<span class="frv ${cls}">${esc(v)}</span>`);
  const flabel = f => `<span class="flabel">${esc(F[f].fr)} ${ar(F[f].ar, 'sm')}</span>`;
  let LIB = Engine.build();
  let V = { name: 'home' };
  let timer = null;

  /* ---------- utilitaires ---------- */
  function toast(msg, ms = 2600) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms);
  }
  function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }
  function go(name, p = {}) { stopTimer(); V = Object.assign({ name }, p); render(); window.scrollTo(0, 0); }
  function rebuild() { LIB = Engine.build(); }
  function sel() { const ids = S().sel.filter(id => LIB.lessons[id]); return ids.length ? ids : Object.keys(LIB.lessons); }
  function bar(p, cls = '') { const pc = Math.round(p * 100); return `<span class="bar ${cls}" title="${pc}%"><b style="width:${pc}%" class="${pc >= 70 ? 'g' : pc >= 30 ? 'y' : 'r'}"></b></span>`; }
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

  /* ---------- rendu ---------- */
  const SESSION = ['review', 'exam', 'rush', 'match'];
  function render() {
    const html = (VIEWS[V.name] || VIEWS.home)();
    const session = SESSION.includes(V.name);
    app.innerHTML = (session ? '' : header()) + `<main class="main ${session ? 'session' : ''}">${html}</main>` + (session ? '' : nav());
    const af = app.querySelector('[autofocus]'); if (af && !matchMedia('(pointer:coarse)').matches) af.focus();
    OSK.refresh();
  }
  function header() {
    const L = Store.level();
    return `<header class="top">
      <button class="brand" data-a="go" data-to="home"><span class="logo">م</span><span>Murājaʿa</span></button>
      <div class="hud">
        <span class="pill fire" title="Jours de suite">🔥 ${Store.streak()}</span>
        <span class="pill lvl" title="${S().xp} XP · encore ${L.next} XP">Niv. ${L.lvl}<i class="xpbar"><b style="width:${L.pct}%"></b></i></span>
        <button class="icon" data-a="go" data-to="settings" aria-label="Réglages">⚙️</button>
      </div></header>`;
  }
  function nav() {
    const items = [['home', '🏠', 'Accueil'], ['review', '🃏', 'Réviser'], ['examSetup', '📝', 'Examen'], ['games', '🎮', 'Jeux'], ['words', '📚', 'Mots']];
    const cur = V.name === 'duel' ? 'games' : V.name;
    return `<nav class="tabs">${items.map(([v, i, l]) => `<button data-a="${v === 'review' ? 'startReview' : 'go'}" data-to="${v}" class="${cur === v ? 'on' : ''}"><span>${i}</span>${l}</button>`).join('')}</nav>`;
  }
  function sessionTop(i, n, extra = '') {
    return `<div class="stop"><button class="icon quit" data-a="quit" aria-label="Quitter">✕</button>
      <div class="prog"><b style="width:${n ? Math.round(i / n * 100) : 0}%"></b></div><span class="cnt">${Math.min(i + 1, n)}/${n}</span>${extra}</div>`;
  }
  function lessonPicker() {
    return LIB.decks.map(d => `<div class="deck">
      <div class="deck-h">${ar(d.title, 'md')}<small>${esc(d.subtitle || '')}</small><button class="link" data-a="selDeck" data-id="${esc(d.id)}">tout / rien</button></div>
      ${d.lessons.map(l => {
        const on = S().sel.includes(l.id);
        return `<label class="lesson ${on ? 'on' : ''}"><input type="checkbox" data-a="selLesson" data-id="${esc(l.id)}" ${on ? 'checked' : ''}>
          <span class="lt">${esc(l.title)} ${ar(l.titleAr || '', 'sm')}</span><span class="cnt">${l.items.length}</span>${bar(Engine.lessonMastery(l))}</label>`;
      }).join('') || '<p class="muted">Aucune leçon</p>'}</div>`).join('');
  }
  function selSummary() {
    const n = S().sel.filter(id => LIB.lessons[id]).length;
    const words = Engine.itemsFor(sel()).length;
    return `<p class="muted small">${n ? `${n} leçon(s) sélectionnée(s)` : 'Toutes les leçons'} · ${words} mots — <button class="link" data-a="go" data-to="home" data-anchor="lessons">changer</button></p>`;
  }

  function itemCard(it) {
    const cell = f => (it[f] ? `<div class="cell">${flabel(f)}${val(f, it[f], 'lg')}</div>` : '');
    const grid = it.t === 'verb' ? ['madi', 'mud', 'amr', 'masdar'] : ['w', 'fem', 'pl', 'syn', 'ant'];
    return `<div class="icard">
      <div class="cells">${grid.map(cell).join('')}</div>
      <div class="tr">${esc(it.fr || '')}</div>
      ${it.prep ? `<div class="line">${flabel('prep')} ${ar(it.prep)}</div>` : ''}
      ${it.t === 'verb' ? '' : ''}
      ${it.ex ? `<div class="ex">${ar(it.ex)}</div>` : ''}
      ${it.note ? `<div class="note">📝 ${esc(it.note)}</div>` : ''}
    </div>`;
  }

  /* ---------- VUES ---------- */
  const VIEWS = {};

  VIEWS.home = () => {
    const st = Engine.stats(sel()), en = Engine.enemies(8), L = Store.level();
    const hello = S().name
      ? `<h1 class="hello">السَّلَامُ عَلَيْكُمْ <span>${esc(S().name)}</span></h1>`
      : `<div class="card namecard"><h2>Bienvenue 👋</h2><p class="muted">Ton prénom (utilisé pour les duels) :</p>
         <div class="row"><input id="nameIn" placeholder="Prénom" maxlength="20"><button class="btn primary" data-a="saveName">OK</button></div></div>`;
    return `${hello}
      <section class="tiles">
        <div class="tile"><b>${st.due}</b><span>à réviser</span></div>
        <div class="tile"><b>${st.newAvail}</b><span>nouvelles</span></div>
        <div class="tile"><b>🔥 ${Store.streak()}</b><span>jours de suite</span></div>
        <div class="tile"><b>${L.lvl}</b><span>niveau · ${S().xp} XP</span></div>
      </section>
      <button class="btn big primary" data-a="startReview">🃏 Réviser maintenant <small>${st.due + st.newAvail} cartes</small></button>
      <div class="grid2">
        <button class="gbtn" data-a="go" data-to="examSetup"><span>📝</span><b>Examen à trous</b><small>Retrouve les formes cachées</small></button>
        <button class="gbtn" data-a="startRush"><span>⚡</span><b>Chrono-rush</b><small>60 secondes · record ${S().best.rush}</small></button>
        <button class="gbtn" data-a="startMatch"><span>🔗</span><b>Associations</b><small>Relie les paires</small></button>
        <button class="gbtn" data-a="go" data-to="duel"><span>⚔️</span><b>Duel</b><small>Défie ton binôme</small></button>
      </div>
      ${en.length ? `<section class="card enemy"><h2>👹 Mots ennemis</h2><p class="muted small">Les mots que tu rates le plus.</p>
        <div class="chips">${en.map(it => `<span class="chip">${ar(Engine.head(it))}</span>`).join('')}</div>
        <button class="btn" data-a="fightEnemies">⚔️ Les affronter</button></section>` : ''}
      <section class="card" id="lessons"><h2>Leçons actives</h2>
        <p class="muted small">Coche les leçons à travailler. Rien de coché = tout.</p>${lessonPicker()}</section>`;
  };

  /* ----- Révision (cartes) ----- */
  VIEWS.review = () => {
    const c = V.q[V.i];
    if (!c) {
      return `<div class="done"><div class="big-emoji">🎉</div><h1>Session terminée</h1>
        <p>${V.n} cartes revues · +${V.xp} XP</p>
        <div class="col"><button class="btn primary big" data-a="go" data-to="examSetup">📝 Passer à l'examen</button>
        <button class="btn" data-a="go" data-to="home">Accueil</button></div></div>`;
    }
    const it = c.item;
    let front, ask;
    if (c.kind === 'arfr') { front = it.t === 'verb' ? `${ar(it.madi, 'xl')}<div class="sub">${ar(it.mud, 'md')}</div>` : ar(it.w, 'xl'); ask = 'Que veut dire ce mot ?'; }
    else if (c.kind === 'frar') { front = `<span class="frv xl">${esc(it.fr)}</span><div class="sub">${esc(T[it.t]?.label || '')}</div>`; ask = it.t === 'verb' ? 'En arabe ? (الماضي · المضارع)' : 'En arabe ?'; }
    else if (c.kind === 'forms') { front = `${ar(it.madi, 'xl')}<div class="sub frv">${esc(it.fr)}</div>`; ask = 'المضارع · الأمر · المصدر ؟'; }
    else { front = `${ar(it.w, 'xl')}<div class="sub frv">${esc(it.fr)}</div>`; ask = 'الجمع ؟'; }
    const isNew = !S().cards[c.id];
    const g = [[1, 'À revoir', 'bad'], [2, 'Difficile', 'hard'], [3, 'Bien', 'good'], [4, 'Facile', 'easy']];
    return `${sessionTop(V.i, V.q.length)}
      <div class="flash ${V.flip ? 'flipped' : ''}">
        <div class="kind">${isNew ? '<span class="new">nouveau</span>' : ''}${esc(Engine.KINDS[c.kind])}</div>
        <div class="prompt">${front}</div>
        <div class="ask">${ask.match(/[؀-ۿ]/) ? ar(ask, 'md') : esc(ask)}</div>
        ${V.flip ? `<div class="answer">${itemCard(it)}</div>` : ''}
      </div>
      ${V.flip
        ? `<div class="grades">${g.map(([n, l, cl]) => `<button class="gr ${cl}" data-a="grade" data-g="${n}"><b>${l}</b><small>${Store.preview(c.id, n)}</small></button>`).join('')}</div>`
        : `<button class="btn big primary" data-a="flip">Voir la réponse <kbd>espace</kbd></button>`}`;
  };

  /* ----- Examen ----- */
  VIEWS.examSetup = () => {
    const e = S().exam;
    const seg = (k, opts) => `<div class="seg">${opts.map(([v, l]) => `<button class="${String(e[k]) === String(v) ? 'on' : ''}" data-a="examOpt" data-k="${k}" data-v="${v}">${l}</button>`).join('')}</div>`;
    const lvl = { none: 'souple (lettres seulement)', mudari: 'voyelle du muḍāriʿ exigée', strict: 'toutes les harakat' }[S().settings.harakat];
    return `<h1>📝 Examen à trous</h1>
      <p class="muted">Une forme est donnée (le passé, le masdar, la traduction…), tu dois retrouver toutes les autres.</p>
      ${selSummary()}
      <section class="card"><h3>Nombre de questions</h3>${seg('n', [[10, '10'], [15, '15'], [25, '25'], ['all', 'Tout']])}
        <h3>Réponses</h3>${seg('mode', [['qcm', '🔘 Choix multiples'], ['type', '⌨️ Écrire']])}
        <p class="muted small">${e.mode === 'type' ? `Correction des harakat : <b>${lvl}</b> — <button class="link" data-a="go" data-to="settings">modifier</button>` : 'Les choix incluent des pièges sur la voyelle du muḍāriʿ.'}</p>
        <h3>Mode boss 👑</h3>${seg('boss', [[false, 'Normal'], [true, '3 vies seulement']])}
      </section>
      <button class="btn big primary" data-a="startExam">C'est parti</button>`;
  };

  function startExam(items, opts = {}) {
    const e = S().exam;
    const rng = opts.seed != null ? Engine.rng32(opts.seed) : Math.random;
    const qs = Engine.makeExam(items, { n: opts.n ?? e.n, rng });
    if (!qs.length) { toast('Pas assez de mots dans la sélection.'); return; }
    go('exam', {
      qs, i: 0, phase: 'ask', pick: {}, cur: null, res: [], score: 0, max: 0,
      mode: opts.mode ?? e.mode, lives: (opts.boss ?? e.boss) ? 3 : null, level: opts.level ?? S().settings.harakat,
      t0: Date.now(), duel: opts.duel || null, xp: 0
    });
  }

  VIEWS.exam = () => {
    if (V.over) return examResult();
    const q = V.qs[V.i], it = q.item, fb = V.phase === 'fb';
    const hearts = V.lives != null ? `<span class="hearts">${'❤️'.repeat(V.lives)}${'🖤'.repeat(3 - V.lives)}</span>` : '';
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
          value="${esc(r ? r.val : '')}" ${fb ? 'readonly' : ''} autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="${isAr ? '…' : 'en français'}">`;
      }
      const fbl = r ? `<div class="fbl ${r.ok ? 'ok' : 'ko'}">${r.ok ? '✓' : '✗'} ${!r.ok || V.mode === 'type' ? val(f, it[f], 'md') : ''}
        ${!r.ok && r.near ? `<small>${f === 'mud' && V.level === 'mudari' ? 'Lettres justes — vérifie la voyelle de la ʿayn' : 'Lettres justes, harakat à corriger'}</small>` : ''}</div>` : '';
      return `<div class="hole">${flabel(f)}${body}${fbl}</div>`;
    };
    const allOk = fb && q.hidden.every(f => V.cur[f].ok);
    return `${sessionTop(V.i, V.qs.length, hearts)}
      <div class="qcard"><div class="given">${flabel(q.given)}<div class="gval">${val(q.given, it[q.given], 'xl')}</div>
        <div class="typ">${esc(T[it.t]?.label || '')}${it.prep && q.given !== 'fr' ? ` · ${ar(it.prep, 'sm')}` : ''}</div></div>
        <div class="holes">${q.hidden.map(hole).join('')}</div></div>
      ${V.mode === 'type' && !fb ? `<button class="link osk-toggle" data-a="toggleOsk">⌨️ Clavier arabe à l'écran : ${S().settings.osk ? 'activé' : 'désactivé'}</button>` : ''}
      ${fb
        ? `<div class="fbbar ${allOk ? 'ok' : 'ko'}"><b>${allOk ? pickCheer() : 'Pas tout à fait…'}</b>
            ${!allOk ? `<button class="link" data-a="override">J'avais juste</button>` : ''}
            ${it.ex ? `<div class="ex">${ar(it.ex)}</div>` : ''}
            <button class="btn big ${allOk ? 'primary' : 'danger'}" data-a="examNext" autofocus>Continuer <kbd>Entrée</kbd></button></div>`
        : `<button class="btn big primary" data-a="examCheck">Valider <kbd>Entrée</kbd></button>`}`;
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
    V.res.push({ id: it.id, ok: all, given: q.given, wrong: q.hidden.filter(f => !cur[f].ok) });
    if (!all && V.lives != null) V.lives--;
    if (!V.duel) Store.answer(it.id, all);
    const gain = nOk * 2 + (all ? 2 : 0); V.xp += gain; Store.addXP(gain);
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
    return `<div class="done">
      <div class="big-emoji">${dead ? '💀' : ['😅', '🙂', '😃', '🏆'][stars]}</div>
      <h1>${dead ? 'Le boss t\'a eu !' : pct === 100 ? 'Sans faute !' : 'Examen terminé'}</h1>
      <div class="stars">${'★'.repeat(stars)}<span>${'★'.repeat(3 - stars)}</span></div>
      <p class="score"><b>${pct}%</b> · ${V.score}/${V.max} cases · ${V.res.length} questions · ${fmtTime(V.time)} · +${V.xp} XP</p>
      ${V.duel ? duelBox() : ''}
      ${wrong.length ? `<section class="card left"><h2>À retravailler (${wrong.length})</h2>
        ${wrong.map(r => { const it = LIB.items[r.id]; return it ? `<details><summary>${ar(Engine.head(it), 'md')} <span class="muted">${esc(it.fr)}</span></summary>${itemCard(it)}</details>` : ''; }).join('')}
        ${V.duel ? '' : `<button class="btn primary" data-a="retryWrong">🔁 Rejouer mes erreurs</button>`}</section>` : ''}
      <div class="col"><button class="btn primary" data-a="${V.duel ? 'go' : 'startExamSame'}" data-to="duel">${V.duel ? 'Retour aux duels' : '🔄 Nouvel examen'}</button>
      <button class="btn" data-a="go" data-to="home">Accueil</button></div></div>`;
  }

  /* ----- Jeux ----- */
  VIEWS.games = () => `<h1>🎮 Jeux</h1>${selSummary()}
    <div class="grid2">
      <button class="gbtn" data-a="startRush"><span>⚡</span><b>Chrono-rush</b><small>Un max de bonnes réponses en 60 s. Les combos multiplient les points. Record : ${S().best.rush}</small></button>
      <button class="gbtn" data-a="startMatch"><span>🔗</span><b>Associations</b><small>Relie passé ↔ masdar, mot ↔ pluriel… Record : ${S().best.match ? fmtTime(S().best.match) : '—'}</small></button>
      <button class="gbtn" data-a="startBoss"><span>👑</span><b>Boss de leçon</b><small>Examen à écrire, 3 vies seulement.</small></button>
      <button class="gbtn" data-a="go" data-to="duel"><span>⚔️</span><b>Duel</b><small>Mêmes questions pour toi et ton binôme, comparez vos scores.</small></button>
      <button class="gbtn" data-a="fightEnemies"><span>👹</span><b>Mots ennemis</b><small>Examen sur les mots que tu rates le plus.</small></button>
    </div>`;

  function startRush() {
    const items = Engine.itemsFor(sel());
    const q = items.length >= 4 && Engine.rushQ(items);
    if (!q) { toast('Pas assez de mots dans la sélection.'); return; }
    go('rush', { items, q, score: 0, combo: 0, maxCombo: 0, n: 0, end: Date.now() + 60000, fb: null });
    timer = setInterval(rushTick, 200);
  }
  function rushTick() {
    const left = V.end - Date.now();
    const el = document.getElementById('rt'); if (el) el.textContent = Math.max(0, Math.ceil(left / 1000));
    if (left <= 0) {
      stopTimer(); V.over = true;
      V.record = V.score > S().best.rush; if (V.record) S().best.rush = V.score;
      V.xp = V.score * 2; Store.addXP(V.xp); render();
    }
  }
  VIEWS.rush = () => {
    if (V.over) return `<div class="done"><div class="big-emoji">${V.record ? '🏆' : '⚡'}</div><h1>${V.record ? 'Nouveau record !' : 'Temps écoulé'}</h1>
      <p class="score"><b>${V.score}</b> points · ${V.n} réponses · meilleur combo ×${V.maxCombo} · +${V.xp} XP</p>
      <div class="col"><button class="btn primary big" data-a="startRush">Rejouer</button><button class="btn" data-a="go" data-to="games">Jeux</button></div></div>`;
    const q = V.q, mult = 1 + Math.floor(V.combo / 5);
    return `<div class="stop"><button class="icon quit" data-a="quit">✕</button><span class="timer">⏱ <b id="rt">${Math.ceil((V.end - Date.now()) / 1000)}</b></span>
      <span class="pts">${V.score} pts</span>${V.combo >= 3 ? `<span class="combo">combo ×${mult} 🔥${V.combo}</span>` : ''}</div>
      <div class="qcard rush"><div class="given">${flabel(q.from)}<div class="gval">${val(q.from, q.item[q.from], 'xl')}</div></div>
        <div class="hole">${flabel(q.to)}<div class="opts ${F[q.to].isAr ? 'ar-opts' : ''}">${q.options.map((o, k) => {
          let cl = ''; if (V.fb) cl = o === q.answer ? 'good' : (V.fb.k === k ? 'bad' : 'dim');
          return `<button class="opt ${cl}" data-a="rushPick" data-k="${k}"><kbd>${k + 1}</kbd>${val(q.to, o)}</button>`;
        }).join('')}</div></div></div>`;
  };
  function rushPick(k) {
    if (V.fb || V.over) return;
    const q = V.q, ok = q.options[k] === q.answer;
    V.fb = { k, ok }; V.n++;
    if (ok) { V.score += 1 + Math.floor(V.combo / 5); V.combo++; V.maxCombo = Math.max(V.maxCombo, V.combo); }
    else { V.combo = 0; Store.answer(q.item.id, false); }
    render();
    setTimeout(() => { if (V.name !== 'rush' || V.over) return; V.fb = null; V.q = Engine.rushQ(V.items); render(); }, ok ? 280 : 1100);
  }

  function startMatch() {
    const items = Engine.itemsFor(sel());
    const r = Engine.matchRound(items);
    if (!r) { toast('Pas assez de mots dans la sélection.'); return; }
    go('match', Object.assign(r, { items, done: [], selL: null, selR: null, err: 0, t0: Date.now(), wrong: null, round: (V.round || 0) + 1 }));
  }
  VIEWS.match = () => {
    const fin = V.done.length === V.n;
    const col = (side, f) => `<div class="mcol">${V[side].map(x => {
      const done = V.done.includes(x.id), s = side === 'left' ? V.selL : V.selR;
      const wr = V.wrong && V.wrong.includes(side + x.id);
      return `<button class="mbtn ${done ? 'done' : ''} ${s === x.id ? 'sel' : ''} ${wr ? 'shake' : ''}" data-a="mpick" data-side="${side}" data-id="${esc(x.id)}" ${done ? 'disabled' : ''}>${val(f, x.text)}</button>`;
    }).join('')}</div>`;
    return `${sessionTop(V.done.length, V.n)}
      <h2 class="center">${esc(V.label)}</h2>
      ${fin ? `<div class="done"><div class="big-emoji">${V.err === 0 ? '🎯' : '✅'}</div><h1>${fmtTime(V.time)}</h1>
        <p>${V.err} erreur(s)${V.record ? ' · nouveau record !' : ''} · +${V.xp} XP</p>
        <div class="col"><button class="btn primary big" data-a="startMatch">Manche suivante</button><button class="btn" data-a="go" data-to="games">Jeux</button></div></div>`
      : `<div class="match">${col('left', V.a)}${col('right', V.b)}</div>`}`;
  };
  function mpick(side, id) {
    if (side === 'left') V.selL = id; else V.selR = id;
    V.wrong = null;
    if (V.selL && V.selR) {
      if (V.selL === V.selR) { V.done.push(V.selL); }
      else { V.err++; V.wrong = ['left' + V.selL, 'right' + V.selR]; Store.answer(V.selL, false); }
      V.selL = V.selR = null;
      if (V.done.length === V.n) {
        V.time = Date.now() - V.t0;
        V.xp = Math.max(2, V.n * 2 - V.err); Store.addXP(V.xp);
        if (V.err === 0 && (!S().best.match || V.time < S().best.match)) { S().best.match = V.time; V.record = true; Store.save(); }
      }
    }
    render();
  }

  /* ----- Duel ----- */
  VIEWS.duel = () => {
    const tab = V.tab || 'create';
    const tabs = `<div class="seg wide">${[['create', 'Créer'], ['join', 'Rejoindre'], ['history', 'Historique']].map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-a="duelTab" data-tab="${k}">${l}</button>`).join('')}</div>`;
    let body = '';
    if (tab === 'create') {
      const d = V.d || (V.d = { n: 15, mode: 'qcm' });
      const seg = (k, opts) => `<div class="seg">${opts.map(([v, l]) => `<button class="${String(d[k]) === String(v) ? 'on' : ''}" data-a="duelOpt" data-k="${k}" data-v="${v}">${l}</button>`).join('')}</div>`;
      body = `${selSummary()}<section class="card"><h3>Questions</h3>${seg('n', [[10, '10'], [15, '15'], [25, '25']])}
        <h3>Réponses</h3>${seg('mode', [['qcm', '🔘 Choix multiples'], ['type', '⌨️ Écrire']])}</section>
        ${V.code ? `<section class="card codebox"><h3>Code du défi</h3><p class="muted small">Envoie ce code (ou le lien) à ton binôme. Vous aurez exactement les mêmes questions.</p>
          <textarea readonly rows="3">${esc(V.code)}</textarea>
          <div class="row"><button class="btn" data-a="copy" data-text="${esc(V.code)}">📋 Copier le code</button>
          ${location.protocol.startsWith('http') ? `<button class="btn" data-a="copy" data-text="${esc(location.origin + location.pathname + '#duel=' + V.code)}">🔗 Copier le lien</button>` : ''}</div>
          <button class="btn big primary" data-a="playDuel" data-code="${esc(V.code)}">⚔️ Jouer mon tour</button></section>`
        : `<button class="btn big primary" data-a="createDuel">Créer le défi</button>`}`;
    } else if (tab === 'join') {
      body = `<section class="card"><h3>Colle le code reçu</h3><textarea id="joinCode" rows="4" placeholder="DUEL-…">${esc(V.join || '')}</textarea>
        <button class="btn big primary" data-a="joinDuel">⚔️ Lancer le défi</button></section>`;
    } else {
      const list = S().duels.slice().reverse();
      body = list.length ? list.map(dl => duelCard(dl)).join('') : '<p class="muted">Aucun duel pour l\'instant.</p>';
    }
    return `<h1>⚔️ Duel</h1><p class="muted">Chacun joue sur son appareil, puis vous échangez vos codes résultat pour savoir qui gagne.</p>${tabs}${body}`;
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
        <tr><td>Questions</td><td class="bits">${m.b.split('').map(x => x === '1' ? '🟩' : '🟥').join('')}</td><td class="bits">${t.b.split('').map(x => x === '1' ? '🟩' : '🟥').join('')}</td></tr></table>`;
    }
    return `<section class="card duelcard"><div class="row between"><b>Défi de ${esc(dl.by || '?')}</b><small class="muted">${new Date(dl.at).toLocaleDateString('fr-FR')} · ${dl.n} questions</small></div>
      ${verdict || (m ? `<p>Ton score : <b>${m.sc}/${m.mx}</b> en ${fmtTime(m.t)}</p>` : '<p class="muted">Pas encore joué.</p>')}
      ${m && !t ? `<p class="muted small">Envoie ton code résultat, puis colle celui de ton binôme :</p>
        <div class="row"><button class="btn" data-a="copy" data-text="${esc(dl.myCode)}">📋 Mon code résultat</button></div>
        <div class="row"><input data-paste="${dl.s}" placeholder="RES-… de ton binôme"><button class="btn primary" data-a="pasteRes" data-s="${dl.s}">Comparer</button></div>` : ''}
      ${!m ? `<button class="btn primary" data-a="playDuel" data-code="${esc(dl.code)}">Jouer</button>` : ''}</section>`;
  }
  function duelBox() {
    const dl = S().duels.find(d => d.s === V.duel.s);
    return dl ? duelCard(dl) : '';
  }
  function playDuel(code) {
    const d = Engine.dec(code, 'DUEL-');
    if (!d || !d.s) { toast('Code de défi invalide'); return; }
    const missing = d.l.filter(id => !LIB.lessons[id]);
    if (missing.length) { toast('Il te manque des leçons de ce défi : ' + missing.join(', '), 5000); return; }
    const old = S().duels.find(x => x.s === d.s);
    if (old && old.mine) { V = { name: 'duel', tab: 'history' }; render(); toast('Tu as déjà joué ce défi'); return; }
    if (!old) { S().duels.push({ s: d.s, code, by: d.by, n: d.n, l: d.l, m: d.m, at: Date.now() }); Store.save(); }
    const items = Engine.itemsFor(d.l).slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    startExam(items, { seed: d.s, n: d.n, mode: d.m, boss: false, level: d.h || 'none', duel: d });
  }
  function finishDuel() {
    const dl = S().duels.find(d => d.s === V.duel.s); if (!dl) return;
    dl.mine = { by: S().name || 'Anonyme', sc: V.score, mx: V.max, t: V.time, b: V.res.map(r => (r.ok ? '1' : '0')).join('') };
    dl.myCode = Engine.enc(Object.assign({ s: dl.s }, dl.mine), 'RES-');
    if (dl.pending) { dl.theirs = dl.pending; delete dl.pending; }
    Store.save();
  }

  /* ----- Mots / éditeur ----- */
  VIEWS.words = () => {
    if (V.lesson && LIB.lessons[V.lesson]) return lessonView();
    return `<h1>📚 Mes mots</h1>
      ${LIB.decks.map(d => `<section class="card"><div class="deck-h">${ar(d.title, 'md')}<small>${esc(d.subtitle || '')}</small></div>
        ${d.lessons.map(l => `<button class="lrow" data-a="openLesson" data-id="${esc(l.id)}"><span>${esc(l.title)} ${ar(l.titleAr || '', 'sm')}</span><span class="cnt">${l.items.length} mots</span>${bar(Engine.lessonMastery(l))}</button>`).join('')}
        ${d.user ? `<button class="link" data-a="newLesson" data-deck="${esc(d.id)}">+ Nouvelle leçon</button>` : ''}</section>`).join('')}
      <section class="card"><h3>Ajouter du contenu</h3>
        <div class="row wrap"><button class="btn" data-a="newLesson" data-deck="perso">+ Créer une leçon perso</button>
        <label class="btn">📥 Importer un paquet (.json)<input type="file" accept=".json,application/json" data-a="importDeck" hidden></label></div>
        <p class="muted small">Les paquets transcrits depuis tes photos du livre s'importent ici. Ton binôme peut importer les mêmes fichiers.</p></section>`;
  };
  function lessonView() {
    const L = LIB.lessons[V.lesson];
    const rows = L.items.map(it => {
      const forms = it.t === 'verb' ? [it.mud, it.amr, it.masdar] : [it.pl];
      return `<button class="wrow" data-a="editItem" data-id="${esc(it.id)}"><span class="dot" style="--m:${Engine.mastery(it)}"></span>
        <span class="wh">${ar(Engine.head(it), 'md')}</span><span class="wf">${ar(forms.filter(Boolean).join(' · '), 'sm')}</span><span class="wt">${esc(it.fr)}</span></button>`;
    }).join('');
    return `<button class="link" data-a="go" data-to="words">← Retour</button>
      <h1>${esc(L.title)} ${ar(L.titleAr || '', 'md')}</h1>
      <div class="row wrap"><button class="btn primary" data-a="lessonExam" data-id="${esc(L.id)}">📝 Examen sur cette leçon</button>
      <button class="btn" data-a="exportLesson" data-id="${esc(L.id)}">📤 Exporter</button></div>
      <div class="wlist">${rows || '<p class="muted">Aucun mot.</p>'}</div>
      <section class="card"><h3>Ajouter un mot</h3><div class="row wrap">${Object.entries(T).map(([k, t]) => `<button class="btn" data-a="newItem" data-t="${k}">+ ${t.label}</button>`).join('')}</div></section>
      ${V.edit ? editModal() : ''}`;
  }
  function editModal() {
    const it = V.edit === 'new' ? { t: V.newType } : LIB.items[V.edit];
    if (!it) return '';
    const fields = T[it.t].edit;
    return `<div class="modal" data-a="closeEdit"><div class="sheet" data-stop>
      <h2>${V.edit === 'new' ? 'Nouveau' : 'Modifier'} · ${T[it.t].label}</h2>
      ${fields.map(f => `<label class="fld">${flabel(f)}<input data-ef="${f}" class="${F[f].isAr ? 'ar-input' : ''}" dir="${F[f].isAr ? 'rtl' : 'ltr'}" value="${esc(it[f] || '')}" autocomplete="off"></label>`).join('')}
      <p class="muted small">Plusieurs réponses possibles : sépare-les par « / ».</p>
      <div class="row between">${V.edit !== 'new' ? `<button class="btn danger" data-a="delItem">Supprimer</button>` : '<span></span>'}
      <div class="row"><button class="btn" data-a="closeEdit">Annuler</button><button class="btn primary" data-a="saveItem">Enregistrer</button></div></div>
    </div></div>`;
  }

  /* ----- Réglages ----- */
  VIEWS.settings = () => {
    const st = S().settings;
    const radio = (k, v, l, d) => `<label class="radio ${st[k] === v ? 'on' : ''}"><input type="radio" name="${k}" data-a="setting" data-k="${k}" data-v="${v}" ${st[k] === v ? 'checked' : ''}><span><b>${l}</b>${d ? `<small>${d}</small>` : ''}</span></label>`;
    return `<h1>⚙️ Réglages</h1>
      <section class="card"><h3>Prénom</h3><div class="row"><input id="nameIn" value="${esc(S().name)}" maxlength="20"><button class="btn" data-a="saveName">OK</button></div></section>
      <section class="card"><h3>Correction des harakat (mode « écrire »)</h3>
        ${radio('harakat', 'none', 'Souple', 'Seules les lettres comptent. Idéal pour commencer.')}
        ${radio('harakat', 'mudari', 'Voyelle du muḍāriʿ', 'Lettres + la voyelle de la ʿayn au présent (يَفْعَلُ / يَفْعِلُ / يَفْعُلُ).')}
        ${radio('harakat', 'strict', 'Strict', 'Toutes les harakat doivent être exactes.')}</section>
      <section class="card"><h3>Révision</h3>
        <label class="fld">Nouvelles cartes par jour<input type="number" min="0" max="200" value="${st.newPerDay}" data-a="setNum" data-k="newPerDay"></label>
        ${Object.entries(Engine.KINDS).map(([k, l]) => `<label class="check"><input type="checkbox" data-a="setKind" data-k="${k}" ${st.kinds[k] !== false ? 'checked' : ''}> ${esc(l)}</label>`).join('')}</section>
      <section class="card"><h3>Affichage</h3>
        ${radio('theme', 'auto', 'Automatique')}${radio('theme', 'light', 'Clair')}${radio('theme', 'dark', 'Sombre')}
        <label class="check"><input type="checkbox" data-a="setOsk" ${st.osk ? 'checked' : ''}> Clavier arabe à l'écran (remplace le clavier du téléphone)</label></section>
      <section class="card"><h3>Sauvegarde</h3><p class="muted small">Ta progression est enregistrée uniquement sur cet appareil. Exporte-la de temps en temps.</p>
        <div class="row wrap"><button class="btn" data-a="exportAll">📤 Exporter ma progression</button>
        <label class="btn">📥 Restaurer<input type="file" accept=".json" data-a="importAll" hidden></label>
        <button class="btn danger" data-a="resetAll">Tout réinitialiser</button></div></section>`;
  };

  /* ---------- ACTIONS ---------- */
  const A = {
    go: b => { if (b.dataset.anchor) { go(b.dataset.to); setTimeout(() => document.getElementById(b.dataset.anchor)?.scrollIntoView({ behavior: 'smooth' }), 50); } else go(b.dataset.to); },
    quit: () => { if (V.name === 'exam' && V.duel && !V.over && !confirm('Abandonner le duel ? Ton tour ne pourra pas être rejoué.')) return; go(V.duel ? 'duel' : 'home', V.duel ? { tab: 'history' } : {}); },
    saveName: () => { const v = (document.getElementById('nameIn').value || '').trim(); if (!v) return; S().name = v; Store.save(); toast('Enregistré'); render(); },
    selLesson: b => { const id = b.dataset.id, s = S().sel; const i = s.indexOf(id); if (i >= 0) s.splice(i, 1); else s.push(id); Store.save(); render(); },
    selDeck: b => {
      const d = LIB.decks.find(x => x.id === b.dataset.id); const ids = d.lessons.map(l => l.id);
      const allOn = ids.every(id => S().sel.includes(id));
      S().sel = S().sel.filter(id => !ids.includes(id)); if (!allOn) S().sel.push(...ids);
      Store.save(); render();
    },
    startReview: () => {
      const q = Engine.reviewQueue(sel());
      if (!q.length) { toast('Rien à réviser pour l\'instant 🎉 Essaie un examen ou un jeu.'); return; }
      go('review', { q, i: 0, flip: false, n: 0, xp: 0 });
    },
    flip: () => { V.flip = true; render(); },
    grade: b => {
      const g = +b.dataset.g, c = V.q[V.i];
      Store.grade(c.id, g); V.n++;
      const x = g >= 3 ? 2 : 1; V.xp += x; Store.addXP(x);
      if (g === 1) V.q.splice(Math.min(V.i + 4, V.q.length), 0, c);
      V.i++; V.flip = false; render();
    },
    examOpt: b => { let v = b.dataset.v; if (v === 'true' || v === 'false') v = v === 'true'; else if (/^\d+$/.test(v)) v = +v; S().exam[b.dataset.k] = v; Store.save(); render(); },
    startExam: () => startExam(Engine.itemsFor(sel())),
    startExamSame: () => go('examSetup'),
    startBoss: () => startExam(Engine.itemsFor(sel()), { boss: true, mode: 'type', n: 'all' }),
    lessonExam: b => startExam(LIB.lessons[b.dataset.id].items),
    fightEnemies: () => { const en = Engine.enemies(15); if (en.length < 2) { toast('Pas encore assez de mots ennemis 💪'); return; } startExam(en, { n: 'all' }); },
    retryWrong: () => { const items = V.res.filter(r => !r.ok).map(r => LIB.items[r.id]).filter(Boolean); startExam(items, { n: 'all', mode: V.mode, boss: false }); },
    pick: b => { const q = V.qs[V.i]; V.pick[b.dataset.f] = q.options[b.dataset.f][+b.dataset.k]; render(); },
    examCheck: () => examCheck(),
    examNext: () => examNext(),
    override: () => {
      const q = V.qs[V.i], r = V.res[V.res.length - 1];
      const nWrong = q.hidden.filter(f => !V.cur[f].ok).length;
      q.hidden.forEach(f => { V.cur[f].ok = true; });
      V.score += nWrong; r.ok = true; r.wrong = [];
      if (V.lives != null) V.lives++;
      if (!V.duel) { const it = S().items[q.item.id]; if (it && it.err) { it.err--; it.ok++; Store.save(); } }
      render();
    },
    toggleOsk: () => { S().settings.osk = !S().settings.osk; Store.save(); render(); },
    startRush: () => startRush(),
    rushPick: b => rushPick(+b.dataset.k),
    startMatch: () => startMatch(),
    mpick: b => mpick(b.dataset.side, b.dataset.id),
    duelTab: b => { V.tab = b.dataset.tab; render(); },
    duelOpt: b => { let v = b.dataset.v; if (/^\d+$/.test(v)) v = +v; V.d[b.dataset.k] = v; V.code = null; render(); },
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
    openLesson: b => go('words', { lesson: b.dataset.id }),
    editItem: b => { V.edit = b.dataset.id; render(); },
    newItem: b => { V.edit = 'new'; V.newType = b.dataset.t; render(); },
    closeEdit: (b, e) => { if (e && e.target.closest('[data-stop]') && b.classList.contains('modal')) return; V.edit = null; render(); },
    saveItem: () => {
      const data = {}; app.querySelectorAll('[data-ef]').forEach(i => { data[i.dataset.ef] = i.value.trim(); });
      if (V.edit === 'new') {
        const t = V.newType, headF = t === 'verb' ? 'madi' : 'w';
        if (!data[headF]) { toast('Le mot arabe est obligatoire'); return; }
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
    setNum: () => {},
    setKind: b => { S().settings.kinds[b.dataset.k] = b.checked; Store.save(); },
    setOsk: b => { S().settings.osk = b.checked; Store.save(); },
    exportAll: () => download(`murajaa-sauvegarde-${Store.today()}.json`, S()),
    resetAll: () => { if (!confirm('Effacer toute ta progression, tes modifications et tes duels ?')) return; Store.S = Store.defaults(); Store.saveNow(); rebuild(); go('home'); }
  };

  async function readJSON(input) { const f = input.files && input.files[0]; if (!f) return null; try { return JSON.parse(await f.text()); } catch (e) { toast('Fichier illisible'); return null; } }
  const CHANGE = {
    setNum: b => { S().settings[b.dataset.k] = Math.max(0, +b.value || 0); Store.save(); },
    importDeck: async b => {
      const data = await readJSON(b); if (!data) return;
      const decks = Array.isArray(data) ? data : [data];
      let n = 0;
      for (const d of decks) {
        if (!d || !d.id || !Array.isArray(d.lessons)) continue;
        const builtIn = (window.DECKS || []).find(x => x.id === d.id);
        if (builtIn) {
          // ajoute seulement les leçons absentes du paquet intégré
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
    if (b.tagName === 'INPUT' && (b.type === 'file' || b.type === 'number')) return;
    if (b.classList.contains('modal') && e.target.closest('[data-stop]')) return;
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
    if (V.name === 'review' && V.q && V.q[V.i]) {
      if (!V.flip && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); A.flip(); }
      else if (V.flip && '1234'.includes(e.key)) { e.preventDefault(); A.grade({ dataset: { g: e.key } }); }
    } else if (V.name === 'exam' && e.key === 'Enter') { e.preventDefault(); onEnter(e.target); }
    else if (V.name === 'rush' && !V.over && '1234'.includes(e.key)) rushPick(+e.key - 1);
    else if (V.name === 'words' && V.edit && e.key === 'Escape') A.closeEdit({ classList: { contains: () => false } });
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
