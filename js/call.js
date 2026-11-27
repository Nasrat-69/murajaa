/* Salon vocal / vidéo intégré au duel en direct (WebRTC pair-à-pair, signalisation via Firestore).
   L'hôte de la salle lance l'appel dès que les deux joueurs l'ont rejoint. */
const Call = (() => {
  // STUN : trouve l'adresse publique. TURN (relais) : indispensable quand l'un des deux est en 4G/5G ou derrière un réseau strict.
  // js/config.js peut fournir window.TURN_API (adresse qui renvoie la liste des relais, ex. Metered) ou window.TURN_SERVERS.
  const STUN = { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] };
  const FREE_TURN = [
    { urls: ['turn:freestun.net:3478', 'turns:freestun.net:5349'], username: 'free', credential: 'free' },
    { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turn:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' }
  ];
  let iceCache = null;
  async function iceConfig() {
    if (iceCache && Date.now() - iceCache.at < 3600e3) return iceCache.cfg;
    let turn = window.TURN_SERVERS || null;
    if (!turn && window.TURN_API) {
      try { const r = await fetch(window.TURN_API, { cache: 'no-store' }); if (r.ok) turn = await r.json(); } catch (e) { warn(e); }
    }
    const cfg = { iceServers: [STUN, ...((turn && turn.length) ? turn : FREE_TURN)] };
    iceCache = { at: Date.now(), cfg };
    return cfg;
  }
  const el = document.getElementById('call');
  const st = {
    code: null, room: null, joined: false, mic: true, cam: false, local: null, camTrack: null, pc: null, sid: null,
    remote: null, unsub: null, seen: new Set(), pending: [], outbox: [], docReady: false, status: 'idle', min: false,
    videoSender: null, meters: {}, raf: null, ac: null, err: null, joining: false, route: '', retries: 0
  };
  const warn = e => console.warn('[appel]', e);
  const uid = () => Cloud.uid();
  const isHost = () => st.room && st.room.host === uid();
  const otherId = () => (st.room ? Object.keys(st.room.players || {}).find(k => k !== uid()) : null);
  const members = () => (st.room && st.room.call) || {};
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---- cycle de vie ---- */
  function attach(code, room) {
    if (!code || !room) { detach(); return; }
    if (st.code !== code) { detach(); st.code = code; st.unsub = Cloud.rtc(code).onSnapshot(s => onRtc(s.exists ? s.data() : null), warn); }
    st.room = room;
    sync();
  }
  function detach() {
    if (st.joined) leave(true);
    if (st.unsub) { st.unsub(); st.unsub = null; }
    st.code = null; st.room = null;
    el.innerHTML = ''; el.className = 'call hidden'; document.body.classList.remove('call-on');
  }
  function sync() {
    const o = otherId(), mem = members();
    const both = st.joined && o && mem[o];
    if (!both && st.pc) closePc();
    if (both && isHost() && !st.pc) makeOffer().catch(warn);
    render();
  }

  /* ---- WebRTC ---- */
  function newPc(cfg) {
    const pc = new RTCPeerConnection(cfg);
    pc.onicecandidate = e => { if (e.candidate) sendCand(JSON.stringify(e.candidate.toJSON())); };
    pc.ontrack = e => {
      if (!st.remote) st.remote = new MediaStream();
      // un seul flux par type : on remplace l'ancienne piste (après une relance)
      st.remote.getTracks().filter(t => t.kind === e.track.kind && t !== e.track).forEach(t => st.remote.removeTrack(t));
      if (!st.remote.getTracks().includes(e.track)) st.remote.addTrack(e.track);
      e.track.onunmute = () => render(); e.track.onmute = () => render();
      bindMedia(); meter('them', st.remote); render();
    };
    pc.onconnectionstatechange = () => {
      st.status = pc.connectionState;
      if (pc.connectionState === 'connected') { st.retries = 0; st.route = ''; routeOf(pc).then(r => { st.route = r; render(); }); }
      // échec : l'hôte relance l'appel (2 fois maximum), puis on explique le problème
      if (pc.connectionState === 'failed') {
        if (isHost() && st.retries < 2) { st.retries++; setTimeout(() => { if (st.pc === pc) makeOffer().catch(warn); }, 1500); }
        else if (st.retries >= 2 || !isHost()) st.status = 'blocked';
      }
      render();
    };
    return pc;
  }
  // connexion directe ou par le relais ? (affiché dans le salon pour comprendre les problèmes)
  async function routeOf(pc) {
    try {
      const stats = await pc.getStats(); let pair = null; const by = {};
      stats.forEach(r => { by[r.id] = r; if (r.type === 'transport' && r.selectedCandidatePairId) pair = r.selectedCandidatePairId; });
      if (!pair) stats.forEach(r => { if (r.type === 'candidate-pair' && (r.selected || r.nominated) && r.state === 'succeeded') pair = r.id; });
      const p = by[pair], l = p && by[p.localCandidateId], rm = p && by[p.remoteCandidateId];
      return (l && l.candidateType === 'relay') || (rm && rm.candidateType === 'relay') ? 'relais' : 'direct';
    } catch (e) { return ''; }
  }
  function sendCand(s) {
    if (!st.docReady) { st.outbox.push(s); return; }
    Cloud.rtc(st.code).update({ [isHost() ? 'cH' : 'cG']: Cloud.arrayUnion(s) }).catch(warn);
  }
  function closePc() {
    if (st.pc) { try { st.pc.close(); } catch (e) { /* déjà fermé */ } }
    if (st.remote) st.remote.getTracks().forEach(t => st.remote.removeTrack(t));
    st.pc = null; st.sid = null; st.videoSender = null; st.seen.clear(); st.pending = []; st.outbox = []; st.docReady = false;
    stopMeter('them'); st.status = st.joined ? 'waiting' : 'idle';
  }
  async function makeOffer() {
    const cfg = await iceConfig();
    closePc();
    const pc = st.pc = newPc(cfg);
    st.sid = Math.random().toString(36).slice(2); st.status = 'connecting';
    st.local.getAudioTracks().forEach(t => pc.addTrack(t, st.local));
    const vt = pc.addTransceiver('video', { direction: 'sendrecv' });
    st.videoSender = vt.sender;
    if (st.camTrack) await vt.sender.replaceTrack(st.camTrack);
    const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
    await Cloud.rtc(st.code).set({ sid: st.sid, offer: { type: offer.type, sdp: offer.sdp }, answer: null, cH: st.outbox.slice(), cG: [] });
    st.outbox = []; st.docReady = true;
  }
  async function answerOffer(d) {
    st.sid = d.sid;
    const cfg = await iceConfig();
    closePc();
    st.sid = d.sid; st.docReady = true; st.status = 'connecting';
    const pc = st.pc = newPc(cfg);
    await pc.setRemoteDescription(d.offer);
    st.local.getAudioTracks().forEach(t => pc.addTrack(t, st.local));
    const vt = pc.getTransceivers().find(t => t.receiver && t.receiver.track && t.receiver.track.kind === 'video');
    if (vt) { vt.direction = 'sendrecv'; st.videoSender = vt.sender; if (st.camTrack) await vt.sender.replaceTrack(st.camTrack); }
    const ans = await pc.createAnswer(); await pc.setLocalDescription(ans);
    await Cloud.rtc(st.code).update({ answer: { type: ans.type, sdp: ans.sdp } });
    flush();
  }
  function addCand(c) { if (st.pc && st.pc.remoteDescription) st.pc.addIceCandidate(c).catch(warn); else st.pending.push(c); }
  function flush() { const p = st.pending; st.pending = []; p.forEach(addCand); }
  function onRtc(d) {
    if (!d || !st.joined) return;
    if (!isHost()) {
      if (d.offer && d.sid && d.sid !== st.sid && members()[otherId()]) { answerOffer(d).then(() => onRtc(d)).catch(warn); return; }
    } else if (d.answer && d.sid === st.sid && st.pc && st.pc.signalingState === 'have-local-offer') {
      st.pc.setRemoteDescription(d.answer).then(flush).catch(warn);
    }
    const theirs = isHost() ? d.cG : d.cH;
    if (d.sid === st.sid && theirs) for (const s of theirs) if (!st.seen.has(s)) { st.seen.add(s); addCand(JSON.parse(s)); }
  }

  /* ---- actions ---- */
  async function join() {
    if (st.joining) return;
    st.joining = true; st.err = null; render();
    try { st.local = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false }); }
    catch (e) { st.joining = false; st.err = 'Micro refusé : autorise le micro dans ton navigateur.'; render(); return; }
    st.joined = true; st.joining = false; st.mic = true; st.status = 'waiting'; st.retries = 0;
    unlockAudio();
    meter('me', st.local);
    await Cloud.setCall(st.code, { mic: true, cam: false }).catch(warn);
    sync();
  }
  function unlockAudio() {
    try { st.ac = st.ac || new (window.AudioContext || window.webkitAudioContext)(); if (st.ac.state === 'suspended') st.ac.resume(); } catch (e) { /* rien */ }
    const a = document.getElementById('ca-them');
    if (a) { if (!st.remote) st.remote = new MediaStream(); a.srcObject = st.remote; a.muted = false; a.play().then(() => { st.blocked = false; }).catch(() => { st.blocked = true; render(); }); }
  }
  function leave(silent) {
    closePc();
    if (st.local) st.local.getTracks().forEach(t => t.stop());
    if (st.camTrack) st.camTrack.stop();
    st.local = null; st.camTrack = null; st.joined = false; st.cam = false; st.status = 'idle';
    stopMeter('me');
    if (st.code) Cloud.setCall(st.code, null).catch(warn);
    if (!silent) render();
  }
  function toggleMic() {
    if (!st.local) return;
    st.mic = !st.mic; st.local.getAudioTracks().forEach(t => { t.enabled = st.mic; });
    Cloud.setCall(st.code, { mic: st.mic, cam: st.cam }).catch(warn); render();
  }
  async function toggleCam() {
    if (!st.joined) return;
    if (!st.cam) {
      try { const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } }); st.camTrack = s.getVideoTracks()[0]; }
      catch (e) { st.err = 'Caméra refusée ou indisponible.'; render(); return; }
      st.cam = true;
      if (st.videoSender) st.videoSender.replaceTrack(st.camTrack).catch(warn);
    } else {
      st.cam = false;
      if (st.videoSender) st.videoSender.replaceTrack(null).catch(warn);
      if (st.camTrack) st.camTrack.stop(); st.camTrack = null;
    }
    Cloud.setCall(st.code, { mic: st.mic, cam: st.cam }).catch(warn); render();
  }

  /* ---- indicateur « parle » ---- */
  function meter(who, stream) {
    stopMeter(who);
    if (!stream || !stream.getAudioTracks().length) return;
    try {
      st.ac = st.ac || new (window.AudioContext || window.webkitAudioContext)();
      if (st.ac.state === 'suspended') st.ac.resume();
      const src = st.ac.createMediaStreamSource(stream), an = st.ac.createAnalyser();
      an.fftSize = 512; src.connect(an);
      st.meters[who] = { an, src, buf: new Uint8Array(an.fftSize), on: false };
      if (!st.raf) loop();
    } catch (e) { warn(e); }
  }
  function stopMeter(who) { const m = st.meters[who]; if (m) { try { m.src.disconnect(); } catch (e) { /* rien */ } delete st.meters[who]; } }
  function loop() {
    st.raf = requestAnimationFrame(loop);
    for (const [who, m] of Object.entries(st.meters)) {
      m.an.getByteTimeDomainData(m.buf);
      let s = 0; for (const v of m.buf) s += (v - 128) * (v - 128);
      const rms = Math.sqrt(s / m.buf.length);
      const on = rms > 6 && !(who === 'me' && !st.mic);
      if (on !== m.on) { m.on = on; const t = document.getElementById('ct-' + who); if (t) t.classList.toggle('talk', on); }
    }
    if (!Object.keys(st.meters).length) { cancelAnimationFrame(st.raf); st.raf = null; }
  }

  /* ---- interface façon Discord ---- */
  function bindMedia() {
    const a = document.getElementById('ca-them');
    if (a && st.remote) { if (a.srcObject !== st.remote) a.srcObject = st.remote; if (a.paused) a.play().then(() => { if (st.blocked) { st.blocked = false; render(); } }).catch(() => { if (!st.blocked) { st.blocked = true; render(); } }); }
    const vt = document.getElementById('cv-them'); if (vt && st.remote && vt.srcObject !== st.remote) { vt.srcObject = st.remote; vt.play().catch(() => {}); }
    const vm = document.getElementById('cv-me');
    if (vm) { const want = st.camTrack ? new MediaStream([st.camTrack]) : null; if (!want) vm.srcObject = null; else if (!vm.srcObject || vm.srcObject.getVideoTracks()[0] !== st.camTrack) { vm.srcObject = want; vm.play().catch(() => {}); } }
  }
  function avatar(p) {
    const n = (p && p.name) || '?';
    return p && p.photo ? `<img src="${esc(p.photo)}" alt="" referrerpolicy="no-referrer">` : `<span>${esc(n.slice(0, 1).toUpperCase())}</span>`;
  }
  function statusText() {
    const o = otherId(), p = o && st.room.players[o];
    if (st.err) return st.err;
    if (!st.joined) return members()[o] ? `${esc(p.name)} est dans le salon` : 'Personne dans le salon';
    if (!o) return 'En attente de ton binôme';
    if (!members()[o]) return `En attente de ${esc(p.name)}…`;
    return { connecting: 'Connexion…', new: 'Connexion…', connected: st.route === 'relais' ? 'Connecté (par relais)' : st.route === 'direct' ? 'Connecté (direct)' : 'Connecté', disconnected: 'Connexion instable…', failed: 'Échec de connexion, nouvel essai…', blocked: 'Vos réseaux bloquent l’appel : essayez en Wi-Fi, ou quittez et rejoignez le salon', waiting: 'Connexion…' }[st.status] || 'Connexion…';
  }
  function render() {
    if (!st.code || !st.room) return;
    document.body.classList.add('call-on');
    const o = otherId(), op = o ? st.room.players[o] : null, me = st.room.players[uid()] || {};
    const om = members()[o] || null;
    const remoteCam = !!(om && om.cam && st.remote && st.remote.getVideoTracks().some(t => !t.muted && t.readyState === 'live'));
    if (!el.querySelector('.call-card')) {
      el.innerHTML = `<div class="call-card">
        <div class="call-head"><span class="live-dot"></span><b>Salon vocal</b><small id="call-st"></small><button class="cbtn sm" data-c="min" aria-label="Réduire">${ico('minus')}</button></div>
        <div class="call-body">
          <div class="call-tiles">
            <div class="vt" id="ct-me"><video id="cv-me" muted autoplay playsinline></video><div class="vav" id="cav-me"></div><span class="vnm" id="cnm-me"></span><i class="vmute" id="cmu-me">${ico('micoff')}</i></div>
            <div class="vt" id="ct-them"><video id="cv-them" muted autoplay playsinline></video><div class="vav" id="cav-them"></div><span class="vnm" id="cnm-them"></span><i class="vmute" id="cmu-them">${ico('micoff')}</i></div>
          </div>
          <audio id="ca-them" autoplay playsinline></audio>
          <div class="call-ctl" id="call-ctl"></div>
        </div></div>`;
      el.addEventListener('click', e => {
        const b = e.target.closest('[data-c]'); if (!b) return;
        const c = b.dataset.c;
        if (c === 'join') join(); else if (c === 'leave') leave(); else if (c === 'mic') toggleMic(); else if (c === 'cam') toggleCam();
        else if (c === 'min') { st.min = !st.min; render(); }
        else if (c === 'unmute') unlockAudio();
      });
    }
    el.className = 'call' + (st.min ? ' min' : '') + (st.joined ? ' joined' : '');
    el.querySelector('#call-st').innerHTML = statusText();
    const setTile = (who, p, inCall, mic, cam) => {
      const t = el.querySelector('#ct-' + who);
      t.classList.toggle('off', !inCall); t.classList.toggle('cam', !!cam);
      el.querySelector('#cav-' + who).innerHTML = avatar(p);
      el.querySelector('#cnm-' + who).textContent = who === 'me' ? 'Toi' : ((p && p.name) || '…');
      el.querySelector('#cmu-' + who).style.display = inCall && mic === false ? '' : 'none';
    };
    setTile('me', me, st.joined, st.mic, st.cam);
    setTile('them', op, !!om, om ? om.mic : true, remoteCam);
    el.querySelector('#call-ctl').innerHTML = st.joined
      ? `${st.blocked ? `<button class="cbtn join" data-c="unmute">${ico('sound')}Activer le son</button>` : ''}<button class="cbtn ${st.mic ? '' : 'off'}" data-c="mic" aria-label="Micro">${ico(st.mic ? 'mic' : 'micoff')}</button>
         <button class="cbtn ${st.cam ? 'on' : ''}" data-c="cam" aria-label="Caméra">${ico(st.cam ? 'video' : 'camoff')}</button>
         <button class="cbtn red" data-c="leave" aria-label="Quitter l'appel">${ico('phone')}</button>`
      : `<button class="cbtn join" data-c="join" ${st.joining ? 'disabled' : ''}>${ico('headset')}${st.joining ? 'Connexion…' : 'Rejoindre le salon vocal'}</button>`;
    if (typeof I18N !== 'undefined') I18N.apply(el);
    bindMedia();
  }

  window.addEventListener('pagehide', () => { if (st.joined) leave(true); });
  return { attach, detach, get state() { return st; } };
})();
