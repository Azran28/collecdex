/*
 * Petits sons des capsules, fabriqués à la volée (Web Audio : aucun fichier à télécharger).
 * Légers pour un Pokémon commun, de plus en plus épiques avec la rareté.
 * Coupables dans les Paramètres (App.settings.sound) ou d'un clic sur la page Capsules.
 */
App.sfx = (() => {
  let ctx = null, master = null;
  const on = () => !App.settings || App.settings.sound !== false;

  function ac() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0.32;
      const comp = ctx.createDynamicsCompressor(); // évite la saturation quand plusieurs sons se superposent
      master.connect(comp); comp.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  /** Note : fréquence, départ (s), durée (s), forme d'onde, volume, glissement vers une autre fréquence */
  function tone(f, at, dur, type = 'sine', vol = 0.5, to = null, attack = 0.005) {
    const c = ctx, o = c.createOscillator(), g = c.createGain(), t = c.currentTime + at;
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }
  /** Souffle filtré (impact, ouverture) */
  function noise(at, dur, vol = 0.3, freq = 1200, type = 'bandpass') {
    const c = ctx, len = Math.ceil(c.sampleRate * dur), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), t = c.currentTime + at;
    s.buffer = buf; f.type = type; f.frequency.value = freq; g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(master); s.start(t);
  }
  /** Accord tenu qui gonfle (légendaire / fabuleux) */
  function pad(freqs, at, dur, vol = 0.12) {
    const c = ctx, t = c.currentTime + at, lp = c.createBiquadFilter(), g = c.createGain();
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(600, t); lp.frequency.linearRampToValueAtTime(2600, t + dur * 0.6);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.35); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    lp.connect(g); g.connect(master);
    for (const f of freqs) for (const det of [-6, 6]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
      o.connect(lp); o.start(t); o.stop(t + dur + 0.1);
    }
  }
  const N = (m) => 440 * Math.pow(2, (m - 69) / 12); // numéro de note MIDI → fréquence

  function play(fn) { if (!on()) return; try { if (ac()) fn(); } catch (e) { /* pas de son, tant pis */ } }

  return {
    /** À appeler lors d'un clic : autorise le son sur téléphone */
    unlock: () => play(() => {}),
    drop: () => play(() => { tone(150, 0, 0.22, 'sine', 0.6, 55); noise(0, 0.12, 0.25, 300, 'lowpass'); }),
    wobble: (i = 0) => play(() => { tone(1100 + i * 120, 0, 0.05, 'triangle', 0.25); tone(820 + i * 90, 0.09, 0.05, 'triangle', 0.2); }),
    /** Ouverture + fanfare selon la rareté (1 à 6) */
    open: (tier, shiny) => play(() => {
      noise(0, 0.25, 0.35, 2400, 'highpass');
      tone(520, 0, 0.14, 'sine', 0.35, 1300);
      const T = 0.12;
      if (tier === 1) { tone(N(84), T, 0.25, 'triangle', 0.3); tone(N(88), T + 0.09, 0.35, 'triangle', 0.3); }
      if (tier === 2) [84, 88, 91].forEach((m, i) => tone(N(m), T + i * 0.08, 0.4, 'triangle', 0.3));
      if (tier === 3) {
        [79, 84, 88, 91, 96].forEach((m, i) => tone(N(m), T + i * 0.07, 0.45, 'triangle', 0.28));
        [100, 103, 108].forEach((m, i) => tone(N(m), T + 0.4 + i * 0.06, 0.3, 'sine', 0.12));
      }
      if (tier === 4) {
        pad([N(60), N(64), N(67)], T, 1.4, 0.07);
        [72, 76, 79, 84, 88, 91, 96].forEach((m, i) => tone(N(m), T + i * 0.065, 0.55, 'triangle', 0.26));
        for (let i = 0; i < 6; i++) tone(N(96 + (i % 3) * 4), T + 0.5 + i * 0.07, 0.25, 'sine', 0.1);
      }
      if (tier >= 5) {
        tone(70, 0, 1.3, 'sine', 0.7, 38, 0.01); noise(0, 0.7, 0.25, 180, 'lowpass'); // grondement
        const root = tier === 6 ? 62 : 60;
        pad([N(root - 12), N(root), N(root + 4), N(root + 7), tier === 6 ? N(root + 11) : N(root + 12)], 0.1, 2.6, 0.11);
        // fanfare
        [[67, 0], [72, 0.16], [76, 0.32], [79, 0.48], [84, 0.72]].forEach(([m, d]) => {
          tone(N(m + (root - 60)), 0.35 + d, d === 0.72 ? 1.1 : 0.3, 'square', 0.1);
          tone(N(m + (root - 60)), 0.35 + d, d === 0.72 ? 1.1 : 0.3, 'triangle', 0.28);
        });
        const top = tier === 6 ? 14 : 10;
        for (let i = 0; i < top; i++) tone(N(96 + [0, 4, 7, 11, 12][i % 5]), 1.1 + i * 0.07, 0.35, 'sine', 0.1);
        if (tier === 6) tone(N(72), 0.2, 1.2, 'sine', 0.12, N(108)); // glissando qui monte
      }
      if (shiny) for (let i = 0; i < 8; i++) tone(N(100 + [0, 3, 7, 12][i % 4]), 0.9 + i * 0.09, 0.3, 'sine', 0.12);
    }),
    click: () => play(() => tone(900, 0, 0.04, 'triangle', 0.15)),
    get enabled() { return on(); },
  };
})();
