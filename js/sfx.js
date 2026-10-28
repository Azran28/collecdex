/*
 * Petits sons des capsules, fabriqués à la volée (Web Audio : aucun fichier à télécharger).
 * Légers pour un Pokémon commun, de plus en plus épiques avec la rareté.
 * Coupables dans les Paramètres (App.settings.sound) ou d'un clic sur la page Capsules.
 */
App.sfx = (() => {
  let ctx = null, master = null;
  let hush = false; // silence momentané (combat en ligne rejoué en accéléré après un rafraîchissement)
  const on = () => !hush && (!App.settings || App.settings.sound !== false);

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
  /** Rugissement d'un grand Pokémon : deux voix rauques qui descendent + souffle */
  function roar(at, f, dur = 1.1) {
    tone(f, at, dur, 'sawtooth', 0.22, f * 0.55, 0.06); tone(f * 1.5, at + 0.03, dur * 0.9, 'sawtooth', 0.1, f * 0.8, 0.08);
    noise(at, dur, 0.35, f * 4, 'bandpass');
  }
  const thunder = (at) => { noise(at, 0.15, 0.5, 3000, 'highpass'); noise(at + 0.05, 1.3, 0.6, 180, 'lowpass'); };
  /** Scènes des grands légendaires (calées sur js/views/capsules-legend.js) ; la fanfare d'ouverture suit (open) */
  const LEGEND = {
    groudon: () => {
      pad([N(24), N(31), N(36)], 0, 3.8, 0.08); // grondement
      [0.6, 1.3, 3.0].forEach((at) => { tone(52, at, 0.5, 'sine', 0.9, 30, 0.005); noise(at, 0.3, 0.35, 260, 'lowpass'); }); // pas lourds
      noise(1.9, 0.7, 0.5, 900, 'bandpass'); tone(140, 1.9, 0.6, 'sawtooth', 0.08, 60); // le sol se fend
      noise(2.4, 1.2, 0.12, 5200, 'highpass'); // grésillement de la lave
      roar(3.45, 105, 1.2);
    },
    kyogre: () => {
      noise(0, 3.7, 0.16, 6000, 'highpass'); noise(0.2, 3.4, 0.1, 1400, 'bandpass'); // pluie
      thunder(0.9); thunder(2.4);
      tone(70, 1.5, 1.4, 'sine', 0.35, 150); noise(1.5, 1.4, 0.25, 500, 'lowpass'); // la mer monte
      noise(2.9, 0.8, 0.55, 650, 'lowpass'); tone(90, 2.9, 0.7, 'sine', 0.5, 45); // la vague
      roar(3.3, 85, 1.3);
    },
    rayquaza: () => {
      noise(0, 1.9, 0.14, 800, 'bandpass'); pad([N(38), N(45)], 0, 2.6, 0.06); // vent, tension
      thunder(1.3);
      tone(N(55), 1.8, 0.8, 'sawtooth', 0.06, N(86)); noise(1.8, 0.8, 0.25, 1600, 'bandpass'); // il fond du ciel
      noise(2.6, 0.25, 0.6, 4200, 'highpass'); tone(3200, 2.6, 0.22, 'square', 0.05, 500); // la griffe tranche
      roar(2.7, 140, 1.0);
      pad([N(57), N(62), N(66), N(69)], 3.1, 1.6, 0.08); // ciel dégagé
    },
  };

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
    /** Apparition d'Arceus (~9,5 s, calée sur js/views/capsules-god.js) : néant, battements, big bang, chœur, fanfare */
    god: () => play(() => {
      pad([N(26), N(33), N(38)], 0, 4.2, 0.09); // grondement du néant
      [0.7, 1.5, 2.3].forEach((at, i) => { tone(70, at, 0.35, 'sine', 0.6 + i * 0.15, 38, 0.01); noise(at, 0.25, 0.2 + i * 0.1, 220, 'lowpass'); });
      tone(N(45), 2.6, 1.3, 'sawtooth', 0.07, N(93)); noise(2.6, 1.3, 0.14, 3200, 'highpass'); // la lumière monte
      tone(95, 3.9, 2.4, 'sine', 0.95, 28, 0.005); noise(3.9, 1.8, 0.65, 240, 'lowpass'); noise(3.9, 0.6, 0.35, 4200, 'highpass'); // big bang
      pad([N(38), N(50), N(57), N(62), N(66), N(69)], 4.3, 5.6, 0.12); // chœur
      [74, 78, 81, 86, 90, 93].forEach((m, i) => tone(N(m), 5.9 + i * 0.36, 1.4, 'sine', 0.16)); // cloches
      tone(N(62), 7.6, 0.7, 'sine', 0.14, N(98));
      [[62, 0], [69, 0], [74, 0], [78, 0.18], [81, 0.36], [86, 0.6]].forEach(([m, d]) => { // fanfare finale
        tone(N(m), 8.3 + d, d === 0.6 ? 1.6 : 0.5, 'triangle', 0.26); tone(N(m), 8.3 + d, d === 0.6 ? 1.6 : 0.5, 'square', 0.07);
      });
      noise(8.3, 0.5, 0.3, 2600, 'highpass');
      for (let i = 0; i < 16; i++) tone(N(98 + [0, 4, 7, 12][i % 4]), 9 + i * 0.07, 0.4, 'sine', 0.09);
    }),
    /** Le titre « ??? » qui se brouille puis devient « Dieu » */
    godTitle: () => play(() => {
      for (let i = 0; i < 8; i++) tone(300 + Math.random() * 1600, i * 0.07, 0.05, 'square', 0.05);
      [86, 90, 93, 98].forEach((m, i) => tone(N(m), 0.63 + i * 0.05, 1.2, 'sine', 0.15));
      tone(N(50), 0.63, 1.6, 'sine', 0.3);
    }),
    /** Carapuce : les lunettes tombent (sifflement), « clac » sur le nez, éclat du verre, accord funk */
    shades: () => play(() => {
      tone(1700, 0, 0.42, 'sine', 0.09, 260); noise(0, 0.42, 0.12, 1800, 'bandpass');
      noise(0.46, 0.06, 0.55, 3200, 'bandpass'); tone(2400, 0.46, 0.07, 'square', 0.07);
      tone(55, 0.5, 0.5, 'sine', 0.7, 38, 0.005); // basse
      [[57, 60, 64, 67], [57, 60, 64, 67], [55, 59, 62, 66]].forEach((ch, i) => ch.forEach((m) => tone(N(m), 0.55 + [0, 0.24, 0.48][i], 0.16, 'square', 0.05)));
      tone(N(100), 0.62, 0.7, 'sine', 0.13); tone(N(107), 0.68, 0.6, 'sine', 0.09); // éclat
      // la petite danse : basse et claquements sur le temps
      [0, 0.29, 0.58, 0.87].forEach((d, i) => { tone(i % 2 ? 73 : 55, 0.86 + d, 0.18, 'sine', 0.5, 45, 0.005); noise(0.86 + d + 0.145, 0.05, 0.3, 2600, 'bandpass'); });
      [[57, 60, 64], [62, 65, 69], [57, 60, 64], [55, 59, 62]].forEach((ch, i) => ch.forEach((m) => tone(N(m), 0.93 + i * 0.29, 0.12, 'square', 0.04)));
    }),
    legend: (key) => play(() => { if (LEGEND[key]) LEGEND[key](); }),
    click: () => play(() => tone(900, 0, 0.04, 'triangle', 0.15)),
    // combats (Match)
    energy: () => play(() => { tone(N(84), 0, 0.08, 'triangle', 0.18); tone(N(91), 0.06, 0.12, 'triangle', 0.16); }),
    hit: (strong) => play(() => { noise(0, strong ? 0.3 : 0.16, strong ? 0.45 : 0.3, strong ? 500 : 900, 'lowpass'); tone(strong ? 180 : 260, 0, strong ? 0.3 : 0.15, 'square', 0.12, strong ? 60 : 120); }),
    whoosh: () => play(() => { noise(0, 0.28, 0.28, 1400, 'bandpass'); tone(300, 0, 0.22, 'sine', 0.08, 900); }),
    charge: () => play(() => { tone(N(60), 0, 0.45, 'sawtooth', 0.05, N(84)); tone(N(72), 0.05, 0.4, 'sine', 0.12, N(96)); }),
    swap: () => play(() => { tone(700, 0, 0.12, 'triangle', 0.15, 350); tone(450, 0.14, 0.14, 'triangle', 0.15, 900); }),
    ko: () => play(() => { tone(520, 0, 0.7, 'triangle', 0.3, 90); noise(0.05, 0.4, 0.2, 400, 'lowpass'); }),
    lose: () => play(() => { [67, 63, 60].forEach((m, i) => tone(N(m), i * 0.28, 0.5, 'triangle', 0.25)); tone(N(48), 0.84, 1, 'sine', 0.25); }),
    get enabled() { return on(); },
    quiet: (v) => { hush = !!v; },
  };
})();
