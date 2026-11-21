/* Comptes Google, synchronisation de la progression et salles de duel en direct (Firebase).
   Sans configuration, l'appli fonctionne entièrement en local. */
const Cloud = (() => {
  const st = { enabled: false, ready: false, user: null, status: 'off', error: null, lastSync: 0 };
  const subs = new Set();
  let auth = null, db = null, pushT = null, pulling = false;
  const emit = () => subs.forEach(f => { try { f(st); } catch (e) { console.warn(e); } });
  const uid = () => (st.user ? st.user.uid : null);
  const FV = () => firebase.firestore.FieldValue;

  function init() {
    if (!window.FIREBASE_CONFIG) { st.status = 'off'; return; }
    if (!window.firebase) { st.status = 'offline'; return; }
    try {
      firebase.initializeApp(window.FIREBASE_CONFIG);
      auth = firebase.auth(); db = firebase.firestore();
      st.enabled = true; st.status = 'loading';
      auth.onAuthStateChanged(async u => {
        st.user = u; st.ready = true;
        if (u) { st.status = 'sync'; emit(); await pull(); }
        else { st.status = 'out'; emit(); }
      });
      Store.onSave = schedulePush;
      window.addEventListener('online', () => { if (st.user) schedulePush(); });
    } catch (e) { console.warn(e); st.status = 'error'; st.error = e.message; }
  }

  async function signIn() {
    if (!st.enabled) throw new Error('Comptes non configurés');
    const p = new firebase.auth.GoogleAuthProvider();
    p.setCustomParameters({ prompt: 'select_account' });
    try { await auth.signInWithPopup(p); }
    catch (e) {
      if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') return auth.signInWithRedirect(p);
      if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') return;
      throw e;
    }
  }
  async function signOut() { await pushNow(); await auth.signOut(); }

  /* ---- progression ---- */
  async function pull() {
    if (!uid() || pulling) return;
    pulling = true;
    try {
      const snap = await db.doc('users/' + uid()).get();
      const local = Store.S;
      let next = local;
      if (snap.exists && snap.data().json) {
        const cloud = JSON.parse(snap.data().json);
        next = Store.merge(local, cloud);
      }
      if (!next.name && st.user.displayName) next.name = st.user.displayName.split(' ')[0];
      Store.replace(next);
      st.status = 'ok'; st.lastSync = Date.now(); emit();
      await pushNow();
    } catch (e) { console.warn('pull', e); st.status = 'error'; st.error = e.message; emit(); }
    pulling = false;
  }
  function schedulePush() { if (!uid() || pulling) return; clearTimeout(pushT); pushT = setTimeout(pushNow, 3000); }
  async function pushNow() {
    clearTimeout(pushT);
    if (!uid()) return;
    const S = Store.S;
    try {
      await db.doc('users/' + uid()).set({ json: JSON.stringify(S), updatedAt: S.updatedAt || Date.now() });
      await db.doc('profiles/' + uid()).set(profileOf(S), { merge: true });
      st.status = 'ok'; st.lastSync = Date.now(); emit();
    } catch (e) { console.warn('push', e); st.status = 'error'; st.error = e.message; emit(); }
  }
  function profileOf(S) {
    const items = Object.values(Engine.LIB.items);
    const mastered = items.filter(it => Engine.mastery(it) >= 0.7).length;
    return {
      name: S.name || (st.user && st.user.displayName) || 'Anonyme', photo: (st.user && st.user.photoURL) || '',
      xp: S.xp, level: Store.level(S.xp).lvl, streak: Store.streak(), mastered, updatedAt: Date.now()
    };
  }
  async function profiles(ids) {
    if (!st.enabled || !uid() || !ids.length) return {};
    const out = {};
    await Promise.all(ids.map(async id => { try { const s = await db.doc('profiles/' + id).get(); if (s.exists) out[id] = s.data(); } catch (e) { /* ignoré */ } }));
    return out;
  }

  /* ---- salles de duel en direct ---- */
  const ALPH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const newCode = () => Array.from({ length: 5 }, () => ALPH[Math.floor(Math.random() * ALPH.length)]).join('');
  const me = () => ({ name: Store.S.name || (st.user.displayName || 'Joueur').split(' ')[0], photo: st.user.photoURL || '', score: 0, ans: {} });
  const room = c => db.doc('rooms/' + c);

  async function createRoom(settings) {
    for (let i = 0; i < 5; i++) {
      const c = newCode();
      const ref = room(c);
      const ex = await ref.get();
      if (ex.exists) continue;
      await ref.set({ host: uid(), state: 'lobby', qi: -1, settings, created: Date.now(), players: { [uid()]: me() } });
      return c;
    }
    throw new Error('Impossible de créer la salle');
  }
  async function joinRoom(c) {
    c = String(c || '').trim().toUpperCase();
    const ref = room(c), snap = await ref.get();
    if (!snap.exists) throw new Error('Salle introuvable');
    const d = snap.data();
    if (d.players[uid()]) return c;
    if (Object.keys(d.players).length >= 2) throw new Error('La salle est déjà complète');
    if (d.state !== 'lobby') throw new Error('La partie a déjà commencé');
    await ref.update({ ['players.' + uid()]: me() });
    return c;
  }
  const watchRoom = (c, cb) => room(c).onSnapshot(s => cb(s.exists ? s.data() : null), e => { console.warn(e); cb(null, e); });
  const updateSettings = (c, settings) => room(c).update({ settings });
  const startRoom = c => room(c).update({ state: 'playing', qi: 0, qAt: Date.now() });
  const advance = (c, qi, n) => room(c).update(qi >= n ? { state: 'done', qi } : { qi, qAt: Date.now() });
  const answer = (c, qi, a) => room(c).update({ ['players.' + uid() + '.ans.' + qi]: a, ['players.' + uid() + '.score']: FV().increment(a.pts || 0) });
  async function leaveRoom(c, data) {
    try {
      if (!data) return;
      if (data.host === uid() && data.state === 'lobby') await room(c).delete();
      else if (data.state === 'lobby') await room(c).update({ ['players.' + uid()]: FV().delete() });
    } catch (e) { /* ignoré */ }
  }
  const rematch = (c, settings) => room(c).get().then(s => {
    const d = s.data(); const players = {};
    for (const [k, p] of Object.entries(d.players)) players[k] = Object.assign({}, p, { score: 0, ans: {} });
    return room(c).update({ state: 'lobby', qi: -1, settings, players });
  });

  return {
    st, init, signIn, signOut, pull, pushNow, profiles, uid,
    createRoom, joinRoom, watchRoom, updateSettings, startRoom, advance, answer, leaveRoom, rematch,
    on: f => { subs.add(f); return () => subs.delete(f); }
  };
})();
