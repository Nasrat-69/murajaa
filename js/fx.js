/* Effets : sons (WebAudio, sans fichier), vibrations, confettis, textes flottants. */
const FX = (() => {
  let ctx = null;
  const ac = () => { if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; } } return ctx; };
  function tone(notes, dur = 0.11, type = 'sine', gain = 0.05) {
    if (!Store.S.settings.sound) return;
    const c = ac(); if (!c) return;
    if (c.state === 'suspended') c.resume();
    let t = c.currentTime + 0.01;
    for (const f of notes) {
      const o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
      t += dur * 0.75;
    }
  }
  const sound = {
    ok: () => tone([784, 1047], 0.09, 'sine', 0.05),
    bad: () => tone([233, 175], 0.14, 'triangle', 0.06),
    flip: () => tone([520], 0.04, 'sine', 0.02),
    tap: () => tone([660], 0.03, 'sine', 0.02),
    combo: () => tone([988, 1319, 1568], 0.06, 'sine', 0.04),
    win: () => tone([523, 659, 784, 1047, 1319], 0.12, 'triangle', 0.05),
    lose: () => tone([392, 330, 262], 0.18, 'triangle', 0.05)
  };
  const buzz = ms => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* rien */ } };

  function confetti(n = 140, origin) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const cv = document.createElement('canvas');
    cv.className = 'confetti';
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
    document.body.appendChild(cv);
    const g = cv.getContext('2d'); g.scale(dpr, dpr);
    const cols = ['#4255ff', '#ffcd1f', '#23b26d', '#ff6b8b', '#8b5cf6', '#38bdf8'];
    const ox = origin ? origin.x : innerWidth / 2, oy = origin ? origin.y : innerHeight * 0.35;
    const P = Array.from({ length: n }, () => {
      const a = Math.random() * Math.PI * 2, s = 4 + Math.random() * 9;
      return { x: ox, y: oy, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 6, w: 6 + Math.random() * 6, h: 4 + Math.random() * 6, r: Math.random() * 6, vr: (Math.random() - .5) * .3, c: cols[(Math.random() * cols.length) | 0] };
    });
    const t0 = performance.now();
    (function frame(t) {
      const el = t - t0;
      g.clearRect(0, 0, innerWidth, innerHeight);
      for (const p of P) {
        p.vy += 0.32; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        g.save(); g.globalAlpha = Math.max(0, 1 - el / 2600); g.translate(p.x, p.y); g.rotate(p.r);
        g.fillStyle = p.c; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); g.restore();
      }
      if (el < 2600) requestAnimationFrame(frame); else cv.remove();
    })(t0);
  }
  function float(text, x, y, cls = '') {
    const el = document.createElement('div');
    el.className = 'floater ' + cls; el.textContent = text;
    el.style.left = x + 'px'; el.style.top = y + 'px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1100);
  }
  const floatCenter = (text, cls) => float(text, innerWidth / 2, innerHeight * 0.42, cls);
  return { sound, buzz, confetti, float, floatCenter };
})();
