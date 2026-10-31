/*
 * Page de classeur tournée devant la caméra (essai de certification du classeur, Arnaud, 24–25 oct. 2026).
 * Une vraie page pivote autour des anneaux : pendant le geste, l'ancienne page s'écrase vers les anneaux (perspective :
 * la feuille levée grandit en se rapprochant de la caméra) et la nouvelle apparaît, immobile, derrière. Un diaporama sur
 * un écran change d'un coup, en fondu ou fait glisser les pages d'un bloc. Mesure : chaque image du geste est expliquée
 * par une feuille qui pivote (TURN_MAPS) ou par un glissement / un fondu ; certifiée si une image a ≥ 0,1 d'avance.
 * Réglée au labo (labo-certif.html › « Classeur feuilleté », js/labo-classeur.js, même code) ; limite : une vidéo d'une
 * vraie page tournée rejouée sur un écran sans moiré a la géométrie d'une vraie page.
 * Images : 48 × 64 en gris (zone de la page). frames = [{ t, g }].
 */
App.pageTurn = (() => {
  const GW = 48, GH = 64;
  const mad = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]); return d / a.length; };
  /** Écart moyen en tolérant un décalage d'un point (téléphone tenu à la main) */
  function madShift(a, b, R = 1) {
    let best = 1e9;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      let s = 0, n = 0;
      for (let y = R; y < GH - R; y++) for (let x = R; x < GW - R; x++) { s += Math.abs(a[y * GW + x] - b[(y + dy) * GW + x + dx]); n++; }
      best = Math.min(best, s / n);
    }
    return best;
  }
  const avg = (fs) => { const o = new Float32Array(fs[0].length); for (const f of fs) for (let i = 0; i < o.length; i++) o[i] += f[i] / fs.length; return o; };
  /** Même page, même si le téléphone a un peu bougé ou zoomé ? (v3.94) */
  function samePage(A, B) {
    const w = GW / 8, h = GH / 8, low = (g) => { const o = new Float32Array(w * h); for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) o[(y >> 3) * w + (x >> 3)] += g[y * GW + x] / 64; return o; };
    const a = low(A), b = low(B); let best = 1e9;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { let s = 0, n = 0; for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { s += Math.abs(a[y * w + x] - b[(y + dy) * w + x + dx]); n++; } best = Math.min(best, s / n); }
    return best < 8;
  }
  /**
   * Écart entre F et une page prédite colonne par colonne : spec[x] = [image, colonne source, agrandissement vertical,
   * morceau] (null = rien ne l'explique). Lumière ajustée par morceau (gain : la feuille levée est dans l'ombre).
   */
  function errCols(F, spec) {
    const cy = (GH - 1) / 2, sF = [0, 0], sS = [0, 0];
    const val = (s, y) => { const [S, u, f] = s, sy = Math.round(cy + (y - cy) / f), ux = Math.round(u); return S[sy * GW + Math.max(0, Math.min(GW - 1, ux))]; };
    for (let x = 0; x < GW; x++) { const s = spec[x]; if (!s) continue; for (let y = 0; y < GH; y++) { sF[s[3]] += F[y * GW + x]; sS[s[3]] += val(s, y); } }
    const gain = [sF[0] / (sS[0] || 1), sF[1] / (sS[1] || 1)].map((g) => Math.max(0.5, Math.min(1.6, g)));
    let tot = 0;
    for (let x = 0; x < GW; x++) { const s = spec[x]; if (!s) { tot += 40 * GH; continue; } const g = gain[s[3]]; for (let y = 0; y < GH; y++) tot += Math.abs(F[y * GW + x] - g * val(s, y)); }
    return tot / (GW * GH);
  }
  // feuille qui pivote autour des anneaux, vue de dessus en perspective : pour chaque angle et distance de la caméra,
  // colonne de l'image → colonne de la feuille et agrandissement (la feuille levée se rapproche de la caméra)
  const TURN_MAPS = [];
  for (let th = 0.08; th < 1.55; th += 0.07) for (const dc of [1.8, 3]) {
    const cols = new Array(GW).fill(null); let prevX = null, prevU = 0;
    for (let i = 0; i <= 200; i++) {
      const u = i / 200, z = u * Math.sin(th) * 0.9, f = dc / (dc - z), X = u * Math.cos(th) * f * GW;
      if (prevX != null) for (let x = Math.ceil(prevX); x < X && x < GW; x++) { const k = (x - prevX) / ((X - prevX) || 1); const uu = prevU + (u - prevU) * k; cols[x] = [uu * (GW - 1), dc / (dc - uu * Math.sin(th) * 0.9)]; }
      prevX = X; prevU = u;
    }
    TURN_MAPS.push({ th, dc, cols });
  }
  /** Meilleure explication « page qui pivote » et meilleure explication « glissement / fondu » pour une image */
  function explain(F, O, N) {
    const W = GW, best = { sq: 99, alt: 99, e: 0, fam: '' };
    for (const M of TURN_MAPS) for (const side of ['L', 'R']) for (const dir of ['fwd', 'bwd']) {
      const Sc = dir === 'fwd' ? O : N, Su = dir === 'fwd' ? N : O, spec = new Array(W);
      for (let x = 0; x < W; x++) {
        const xs = side === 'L' ? x : W - 1 - x, c = M.cols[xs];
        spec[x] = c ? [Sc, side === 'L' ? c[0] : W - 1 - c[0], c[1], 0] : [Su, x, 1, 1];
      }
      const v = errCols(F, spec); if (v < best.sq) { best.sq = v; best.e = M.th; best.fam = dir + side; }
    }
    // glissements : pousse (les deux bougent), couvre (la nouvelle par-dessus), découvre (l'ancienne s'en va), dans les 2 sens
    for (let e = 0.06; e < 0.95; e += 0.04) {
      const xe = Math.round(e * W), k = W - xe;
      const two = (a, b) => { const spec = new Array(W); for (let x = 0; x < W; x++) spec[x] = x < xe ? [a[0], a[1](x), 1, 0] : [b[0], b[1](x), 1, 1]; return spec; };
      const L = [
        two([O, (x) => x + k], [N, (x) => x - xe]), two([N, (x) => x + k], [O, (x) => x - xe]),
        two([O, (x) => x], [N, (x) => x - xe]), two([N, (x) => x + k], [O, (x) => x]),
        two([O, (x) => x + k], [N, (x) => x]), two([N, (x) => x], [O, (x) => x - xe]),
      ];
      for (const spec of L) best.alt = Math.min(best.alt, errCols(F, spec.map((s) => (s && s[1] >= -0.5 && s[1] <= W - 0.5 ? s : null))));
    }
    for (let a = 0.1; a < 0.95; a += 0.1) { // fondu
      const Mx = new Float32Array(O.length); for (let i = 0; i < Mx.length; i++) Mx[i] = a * O[i] + (1 - a) * N[i];
      const spec = new Array(W); for (let x = 0; x < W; x++) spec[x] = [Mx, x, 1, 0];
      best.alt = Math.min(best.alt, errCols(F, spec));
    }
    return best;
  }
  // v3.94 : image « entre deux » qui ne s'explique ni par un fondu ni par un glissement. Réglé sur les 25 gestes d'Arnaud (pages
  // tournées vite : 0,45–1,48) et le banc (glissements, page par-dessus, main devant l'écran : 0,28–0,77) : à 0,6, 10 de ses
  // 14 pages rapides passent, et 7 tricheries sur 48 (15 % ; 25 % à 0,5)
  const FAST_T = 0.6;
  /** Jugement d'une vidéo : la page a-t-elle vraiment tourné ? → { pass, why, ev } */
  // still : seuil d'immobilité (le suivi en direct donne le sien, mesuré sur la page immobile ; sinon tiré du film)
  function judge(frames, { tau = 0.1, need = 1, still: stillT = null, fast = true, fastT = FAST_T } = {}) { // réglage choisi au banc : 1 image nette suffit
    const d = frames.map((f, i) => (i ? madShift(f.g, frames[i - 1].g) : 0)).slice(1); // (mains qui tremblent : ±1 point toléré)
    const med = [...d].sort((a, b) => a - b)[d.length >> 1] || 1, still = stillT || 2.5 * med + 1;
    const isStill = (i) => i > 0 && d[i - 1] < still;
    let a = 1; while (a < frames.length && isStill(a)) a++; // fin du début immobile (ancienne page)
    let b = frames.length - 1; while (b > a && isStill(b)) b--; // début de la fin immobile (nouvelle page)
    if (a < 3) return { pass: false, why: 'page pas tenue immobile avant le geste' };
    if (frames.length - b < 3) return { pass: false, why: 'page pas tenue immobile après le geste' };
    const O = avg(frames.slice(Math.max(0, a - 3), a).map((f) => f.g)), N = avg(frames.slice(b + 1, b + 4).map((f) => f.g));
    const eON = mad(O, N);
    // v3.94 (Arnaud, 31 oct. : « je ne comprends pas à partir de l'étape 2 ») : la même page un peu décalée (téléphone bougé)
    // passait pour un geste puis était refusée → pages comparées en tout petit (6 × 8, décalage d’un point toléré) : sur ses
    // 25 gestes, téléphone bougé 4–5, vraie page tournée ≥ 10
    if (eON < 10 || samePage(O, N)) return { pass: false, why: 'même page avant et après', ev: { eON } };
    const mid = frames.slice(a, b + 1);
    if (mid.length < 1 || (!fast && mid.length < 2)) return { pass: false, why: 'page changée d’un coup', ev: { eON, n: mid.length } };
    const scores = [];
    for (const f of mid) {
      const e0 = mad(f.g, O), e1 = mad(f.g, N); if (Math.min(e0, e1) < 0.3 * eON) continue; // presque l'ancienne ou la nouvelle : rien à dire
      const x = explain(f.g, O, N); scores.push({ s: (x.alt - x.sq) / eON, fam: x.fam, e: x.e, sq: x.sq / eON, alt: x.alt / eON });
    }
    const good = scores.filter((s) => s.s >= tau && s.sq < 0.55);
    const fams = {}; good.forEach((s) => { fams[s.fam] = (fams[s.fam] || 0) + 1; });
    const fam = Object.entries(fams).sort((x, y) => y[1] - x[1])[0];
    const r2 = (v) => Math.round(v * 100) / 100;
    const ev = { ss: scores.map((s) => [r2(s.s), s.fam, r2(s.sq), r2(s.alt)]), eON: Math.round(eON), n: mid.length, inf: scores.length, good: good.length, best: scores.length ? r2(Math.max(...scores.map((s) => s.s))) : null, fam: fam && fam[0] };
    if (!fam || fam[1] < need) {
      // v3.94 : page tournée VITE (geste naturel ≈ 0,2 s = 1 à 4 images floues à ~11 images/s : on ne voit pas la feuille
      // pivoter) → acceptée si une image du geste n'est ni l'ancienne ni la nouvelle page, ni un fondu ou un glissement entre
      // les deux (alt = écart à la meilleure de ces explications). Un diaporama qui change d'un coup n'a aucune image « entre deux ».
      const blur = scores.filter((s) => s.alt >= fastT);
      if (fast && mid.length <= 5 && blur.length) return { pass: true, ev: { ...ev, fast: 1 } };
      return { pass: false, why: 'la page n’a pas tourné comme une vraie page', ev };
    }
    return { pass: true, ev };
  }

  /** Petite image grise d'une zone de la vidéo (r = { sx, sy, sw, sh }) */
  let gc = null;
  function grab(video, r) {
    gc = gc || Object.assign(document.createElement('canvas'), { width: GW, height: GH });
    const g = gc.getContext('2d', { willReadFrequently: true });
    g.drawImage(video, r.sx, r.sy, r.sw, r.sh, 0, 0, GW, GH);
    const d = g.getImageData(0, 0, GW, GH).data, o = new Float32Array(GW * GH);
    for (let i = 0; i < o.length; i++) o[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    return o;
  }
  /**
   * Suivi en direct : push({ t, g }) à chaque image → null, ou { frames, res } quand un geste vient de finir
   * (page immobile, puis mouvement, puis page de nouveau immobile 4 images). Une page à peine bougée (même page) ne
   * compte pas. state() : 'attente' | 'page' | 'geste'.
   */
  function watcher({ keep = 90 } = {}) {
    let buf = [], st = 'attente', still = 0, moveAt = -1, ds = [];
    const thr = () => { const s = [...ds].sort((a, b) => a - b); return 2.5 * (s[s.length >> 1] || 2) + 1; };
    return {
      state: () => st,
      push(f) {
        const prev = buf[buf.length - 1]; buf.push(f);
        if (buf.length > keep) { buf.shift(); if (moveAt >= 0) moveAt--; }
        if (!prev) return null;
        const d = madShift(f.g, prev.g);
        if (st !== 'geste') { ds.push(d); if (ds.length > 30) ds.shift(); }
        const isStill = d < thr();
        still = isStill ? still + 1 : 0;
        if (st === 'attente') { if (still >= 3) st = 'page'; return null; }
        if (st === 'page') { if (!isStill) { st = 'geste'; moveAt = buf.length - 1; } return null; }
        if (still < 4) return null; // geste : on attend que la nouvelle page soit immobile
        const frames = buf.slice(Math.max(0, moveAt - 5));
        buf = buf.slice(-4); st = 'page'; moveAt = -1;
        if (samePage(frames[0].g, frames[frames.length - 1].g)) return null; // (v3.94 : téléphone bougé, rien n'a tourné : on n'en dit rien)
        const res = judge(frames, { still: thr() });
        if (res.why === 'même page avant et après') return null;
        return { frames, res };
      },
      reset() { buf = []; st = 'attente'; still = 0; moveAt = -1; },
    };
  }
  return { GW, GH, grab, madShift, explain, judge, watcher };
})();
