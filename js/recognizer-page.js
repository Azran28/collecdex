/*
 * Reconnaissance — chaque carte d'une page de classeur sur son vrai bord (v3.19, labo : _tests-scanner/bords-page.js…).
 * Demande d'Arnaud (14 oct.) : « chaque carte détectée exactement sur son bord extérieur, avec son propre contour (pas une
 * grille régulière) ». La grille (detectGrid) se calait sur le bas du bandeau du nom (Riftbound) ou sur les pochettes.
 * 1) POUSSE : une carte sûre près du centre (findCard, plusieurs tailles), puis chaque voisine cherchée là où elle devrait
 *    être (le pas mesuré sur les cartes déjà trouvées) ; 3 graines essayées, la meilleure note totale gagne.
 * 2) CHOIX CONJOINT : 80 cadres possibles par case ; on prend l'ensemble le plus cohérent (mêmes tailles d'une case à
 *    l'autre, jamais deux cartes collées : deux POCHETTES se touchent, deux cartes jamais).
 * 3) FINITION CÔTÉ PAR CÔTÉ (petit modèle appris) : pour chaque côté, toutes les lignes parallèles à ± 9 % (17 indices :
 *    netteté, régularité, bande de bordure…) ; les 4 côtés choisis ensemble (5 × 5 × 5 × 5) avec les VRAIES proportions de la
 *    carte (Zhang & He : perspective retirée d'après une focale de téléphone ; vérité : 1,393 ± 0,034 pour 88/63 = 1,397).
 * 4) DEUX PASSES : réseau de la page (homographie sur les centres des cartes cohérentes, taille médiane) → une carte qui s'en
 *    écarte est refaite autour de sa place prévue.
 * Mesuré sur 5 pages vérifiées à la main (45 cartes ; poids appris en laissant chaque page de côté) : pire coin < 2 % de la
 * diagonale 25 fois (grille d'avant : 9), < 5 % 40 fois (avant : 10). Poids W1 / W2 appris : ne pas changer un indice
 * sans refaire l'apprentissage (labo : __B.sideCollect, __B.sideCV, __B.comboCollect, __B.comboCV).
 */
App.recognizerParts = App.recognizerParts || {};
(() => {
  const P = App.recognizerParts;
  // poids appris (labo, 14 oct. 2026) : W1 = une ligne d'un côté (14 indices), W2 = les 4 côtés ensemble (8 indices)
  const W1 = [1.0423, 1.0135, 2.4418, -5.562, -0.5183, -0.0208, 0.9507, -0.0509, -0.1243, -3.2051, 0.466, -0.8993, 0.8327, -0.4739];
  const W2 = [0.6437, -1.3814, -5.9659, -2.3739, -5.8084, -1.781, -0.855, 0.7731];
  const SIDE = { band: 0.09, step: 0.0025, taus: [-0.02, -0.01, 0, 0.01, 0.02], nt: 32, target: 320 };
  const RATIO = 88 / 63, RHO = 1.4;
  const hyp = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const add = (a, b) => [a[0] + b[0], a[1] + b[1]], sub = (a, b) => [a[0] - b[0], a[1] - b[1]], mul = (a, k) => [a[0] * k, a[1] * k];
  const center = (q) => [q.reduce((a, p) => a + p[0], 0) / 4, q.reduce((a, p) => a + p[1], 0) / 4];
  const sizeOf = (q) => [(hyp(q[0], q[1]) + hyp(q[3], q[2])) / 2, (hyp(q[0], q[3]) + hyp(q[1], q[2])) / 2];
  const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
  const dot = (F, w) => { let s = 0; for (let i = 0; i < w.length; i++) s += w[i] * F[i]; return s; };
  const pause = () => new Promise((r) => setTimeout(r, 0)); // laisse respirer l'écran entre deux gros calculs

  /** Vraies proportions (hauteur / largeur) d'un rectangle photographié en perspective, coins en pixels (Zhang & He 2006) */
  function trueRatio(q, W, H, f = 0.75 * Math.max(W, H)) {
    const m = q.map(([x, y]) => [x - W / 2, y - H / 2, 1]), m1 = m[0], m2 = m[1], m4 = m[2], m3 = m[3];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], d3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const c14 = cross(m1, m4), e2 = d3(cross(m2, m4), m3), e3 = d3(cross(m3, m4), m2);
    if (!e2 || !e3) return 0;
    const k2 = d3(c14, m3) / e2, k3 = d3(c14, m2) / e3;
    const n2 = [k2 * m2[0] - m1[0], k2 * m2[1] - m1[1], k2 * m2[2] - m1[2]], n3 = [k3 * m3[0] - m1[0], k3 * m3[1] - m1[1], k3 * m3[2] - m1[2]];
    const nn = (n) => (n[0] * n[0] + n[1] * n[1]) / (f * f) + n[2] * n[2];
    const r = Math.sqrt(nn(n3) / nn(n2)); return Number.isFinite(r) ? r : 0;
  }

  /** Homographie par moindres carrés (≥ 4 points) : src → dst ; null si dégénérée */
  function fitH(src, dst) {
    const N = Array.from({ length: 8 }, () => new Float64Array(9));
    const row = (a, b) => { for (let i = 0; i < 8; i++) { for (let j = 0; j < 8; j++) N[i][j] += a[i] * a[j]; N[i][8] += a[i] * b; } };
    src.forEach(([x, y], k) => { const [u, v] = dst[k]; row([x, y, 1, 0, 0, 0, -u * x, -u * y], u); row([0, 0, 0, x, y, 1, -v * x, -v * y], v); });
    for (let i = 0; i < 8; i++) {
      let p = i; for (let r = i + 1; r < 8; r++) if (Math.abs(N[r][i]) > Math.abs(N[p][i])) p = r;
      [N[i], N[p]] = [N[p], N[i]]; const d = N[i][i]; if (Math.abs(d) < 1e-12) return null;
      for (let j = i; j < 9; j++) N[i][j] /= d;
      for (let r = 0; r < 8; r++) if (r !== i) { const f = N[r][i]; if (f) for (let j = i; j < 9; j++) N[r][j] -= f * N[i][j]; }
    }
    const h = N.map((r) => r[8]);
    return (x, y) => { const w = h[6] * x + h[7] * y + 1; return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w]; };
  }

  // ---------- 1) pousse ----------
  /** Morceau de la photo (pixels) centré en (cx, cy) → canvas + passages fenêtre ↔ photo (fractions) */
  function win(img, cx, cy, w, h) {
    const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
    const c = document.createElement('canvas'); c.width = Math.max(8, Math.round(w)); c.height = Math.max(8, Math.round(h));
    const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, cx - w / 2, cy - h / 2, w, h, 0, 0, c.width, c.height);
    return { c, back: (q) => q.map(([x, y]) => [(cx - w / 2 + x * w) / W, (cy - h / 2 + y * h) / H]), there: (q) => q.map(([x, y]) => [(x * W - (cx - w / 2)) / w, (y * H - (cy - h / 2)) / h]) };
  }
  /** findCard dans une fenêtre 1,35 × la carte attendue (q, fractions) → { quad, score, cands (top cadres, pixels de la photo) } */
  function around(img, q, n = 480, top = 0, lines = 20) {
    const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
    const Q = q.map(([x, y]) => [x * W, y * H]), c = center(Q), [cw, ch] = sizeOf(Q);
    const w = win(img, c[0], c[1], cw * 1.35, ch * 1.35);
    const r = P.findCard(w.c, { expect: w.there(q), top, n, lines }); if (!r) return null;
    const px = (qq) => w.back(qq).map(([x, y]) => [x * W, y * H]);
    return { quad: w.back(r.quad), score: r.score, cands: (r.cands || []).map((cd) => ({ px: px(cd.quad), score: cd.score })) };
  }
  /** Graines : carte de la case (si, sj) à plusieurs tailles ; taille trouvée cohérente avec la fenêtre ; 3 meilleures distinctes */
  async function seeds(img, cols, rows, si, sj, n, o = {}) {
    const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height, all = [];
    const tryAt = async (cx, cy, ch) => {
      const cw = ch / RATIO, w = win(img, cx, cy, cw * 1.3, ch * 1.3);
      const r = P.findCard(w.c, { n, lines: o.lines || 15 }); await pause(); if (!r) return;
      const q = w.back(r.quad), rel = sizeOf(q.map(([x, y]) => [x * W, y * H]))[1] / ch;
      if (rel >= 0.85 && rel <= 1.15) all.push({ quad: q, score: r.score });
    };
    // 1) au milieu de la photo (la page la remplit), plusieurs tailles
    for (let hh = 0.22; hh <= 0.4701; hh += (o.hStep || 0.025)) await tryAt((si + 0.5) / cols * W, (sj + 0.5) / rows * H, hh * 3 / rows * H);
    // 2) v3.20 : case du milieu de la grille (page décalée dans la photo : moitié d'un classeur ouvert, photo mal centrée)
    if (o.gridSeed) {
      let g = null; try { g = P.detectGrid(img, cols, rows); } catch (e) { /* */ }
      const c = g && g.cells && g.cells[sj * cols + si];
      if (c && g.fit >= 0.3) { const Q = c.quad.map(([x, y]) => [x * W, y * H]), [, h] = sizeOf(Q), m = center(Q); for (const k of [0.88, 0.95, 1.02]) await tryAt(m[0], m[1], h * k); }
    }
    all.sort((a, b) => b.score - a.score);
    const keep = [];
    for (const s of all) {
      const c = center(s.quad), h = sizeOf(s.quad)[1];
      if (keep.every((k) => hyp(c, center(k.quad)) > 0.02 || Math.abs(h - sizeOf(k.quad)[1]) / sizeOf(k.quad)[1] > 0.05)) keep.push(s);
      if (keep.length >= 3) break;
    }
    return keep;
  }
  /** Une pousse depuis une graine : chaque case prévue d'après la carte trouvée la plus proche et le pas mesuré */
  async function growFrom(img, seed, cols, rows, si, sj, n, lines) {
    const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
    const px = (q) => q.map(([x, y]) => [x * W, y * H]), fr = (q) => q.map(([x, y]) => [x / W, y / H]);
    const key = (i, j) => i + ',' + j, found = {}, score = {};
    found[key(si, sj)] = seed.quad; score[key(si, sj)] = seed.score;
    const pitch = { u: null, v: null };
    const predict = (i, j) => {
      let best = null;
      for (const k of Object.keys(found)) {
        const [i0, j0] = k.split(',').map(Number), d = Math.abs(i - i0) + Math.abs(j - j0) + (score[k] > 0 ? 0 : 0.5);
        if (!best || d < best.d) best = { d, i0, j0, q: px(found[k]) };
      }
      const Q = best.q, pu = pitch.u || mul(add(sub(Q[1], Q[0]), sub(Q[2], Q[3])), 0.525), pv = pitch.v || mul(add(sub(Q[3], Q[0]), sub(Q[2], Q[1])), 0.525);
      return fr(Q.map((p) => add(p, add(mul(pu, i - best.i0), mul(pv, j - best.j0)))));
    };
    const order = [];
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) if (i !== si || j !== sj) order.push([i, j]);
    order.sort((a, b) => (Math.abs(a[0] - si) + Math.abs(a[1] - sj)) - (Math.abs(b[0] - si) + Math.abs(b[1] - sj)));
    let total = seed.score;
    for (const [i, j] of order) {
      const q = predict(i, j), k = key(i, j), r = around(img, q, n, 0, lines); await pause();
      if (r) { found[k] = r.quad; score[k] = r.score; total += r.score; } else { found[k] = q; score[k] = 0; }
      // pas = médiane des écarts entre centres de cartes voisines trouvées
      const us = [], vs = [];
      for (const kk of Object.keys(found)) {
        if (!(score[kk] > 0)) continue;
        const [a, b] = kk.split(',').map(Number), A = center(px(found[kk]));
        if (score[key(a + 1, b)] > 0) us.push(sub(center(px(found[key(a + 1, b)])), A));
        if (score[key(a, b + 1)] > 0) vs.push(sub(center(px(found[key(a, b + 1)])), A));
      }
      if (us.length) pitch.u = [med(us.map((p) => p[0])), med(us.map((p) => p[1]))];
      if (vs.length) pitch.v = [med(vs.map((p) => p[0])), med(vs.map((p) => p[1]))];
    }
    const out = [];
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) out.push({ quad: found[key(i, j)], score: score[key(i, j)] });
    return { cells: out, total };
  }

  // ---------- 2) choix conjoint ----------
  /** Un cadre par case : Σ notes − tailles différentes des voisines − cartes collées (écart < 5 % de la largeur) − proportions */
  function joint(cands, cols, rows, W, H, LR = 100) {
    const LS = 60, LG = 200, GMIN = 0.05, TOL = 0.06;
    const L = cands.map((list) => (list || []).map((c) => {
      const r = trueRatio(c.px, W, H), dev = r > 0 ? Math.abs(Math.log(r / RATIO)) : 1;
      return { ...c, s: c.score - LR * Math.max(0, dev - TOL), sz: sizeOf(c.px) };
    }));
    const pick = L.map((l) => (l.length ? 0 : -1));
    const pair = (a, b, dir) => {
      let p = LS * (Math.abs(Math.log(a.sz[0] / b.sz[0])) + Math.abs(Math.log(a.sz[1] / b.sz[1])));
      const g = dir === 'R' ? (b.px[0][0] + b.px[3][0]) - (a.px[1][0] + a.px[2][0]) : dir === 'L' ? (a.px[0][0] + a.px[3][0]) - (b.px[1][0] + b.px[2][0])
        : dir === 'B' ? (b.px[0][1] + b.px[1][1]) - (a.px[3][1] + a.px[2][1]) : (a.px[0][1] + a.px[1][1]) - (b.px[3][1] + b.px[2][1]);
      const gap = g / 2 / a.sz[0];
      return gap < GMIN ? p + LG * (GMIN - gap) : p;
    };
    const nbs = (k) => { const i = k % cols, j = (k / cols) | 0, r = []; if (i > 0) r.push([k - 1, 'L']); if (i < cols - 1) r.push([k + 1, 'R']); if (j > 0) r.push([k - cols, 'T']); if (j < rows - 1) r.push([k + cols, 'B']); return r; };
    const local = (k, ci) => { let s = L[k][ci].s; for (const [n, dir] of nbs(k)) if (pick[n] >= 0) s -= pair(L[k][ci], L[n][pick[n]], dir) / 2; return s; };
    for (let it = 0; it < 10; it++) {
      let ch = false;
      for (let k = 0; k < L.length; k++) {
        if (!L[k].length) continue;
        let best = pick[k], bs = local(k, pick[k]);
        for (let ci = 0; ci < L[k].length; ci++) { const s = local(k, ci); if (s > bs + 1e-9) { bs = s; best = ci; } }
        if (best !== pick[k]) { pick[k] = best; ch = true; }
      }
      if (!ch) break;
    }
    return pick.map((p, k) => (p >= 0 ? L[k][p].px : null));
  }

  // ---------- 3) finition côté par côté ----------
  const smalls = new WeakMap();
  /** photo réduite (k = facteur, arrondi au 1/50), gardée pour toute la page */
  function small(img, k) {
    let byK = smalls.get(img); if (!byK) { byK = new Map(); smalls.set(img, byK); }
    let m = byK.get(k); if (m) return m;
    const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height, w = Math.round(W * k), h = Math.round(H * k);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true }); g.filter = 'blur(0.5px)'; g.drawImage(img, 0, 0, w, h);
    m = { k, w, h, px: g.getImageData(0, 0, w, h).data }; byK.set(k, m); return m;
  }
  function sample(S, x, y, out) {
    const xi = Math.floor(x), yi = Math.floor(y);
    if (xi < 0 || yi < 0 || xi >= S.w - 1 || yi >= S.h - 1) { out[0] = NaN; return out; }
    const fx = x - xi, fy = y - yi, p = S.px, w = S.w;
    for (let c = 0; c < 3; c++) {
      const a = p[(yi * w + xi) * 4 + c], b = p[(yi * w + xi + 1) * 4 + c], d = p[((yi + 1) * w + xi) * 4 + c], e = p[((yi + 1) * w + xi + 1) * 4 + c];
      out[c] = (a * (1 - fx) + b * fx) * (1 - fy) + (d * (1 - fx) + e * fx) * fy;
    }
    return out;
  }
  /**
   * Lignes possibles de chaque côté d'un cadre q (pixels) : profil du contraste perpendiculaire (signé par canal) à ± 9 % de
   * la largeur, 5 inclinaisons → pics, chacun avec ses 14 indices (même ordre que W1 ; voir _tests-scanner/bords-side.js).
   */
  function sideCands(img, q) {
    const Wc = (hyp(q[0], q[1]) + hyp(q[3], q[2])) / 2, k = Math.min(1, SIDE.target / Wc);
    const S = small(img, Math.round(k * 50) / 50), kk = S.k, Q = q.map(([x, y]) => [x * kk, y * kk]), Wk = Wc * kk;
    const cx = Q.reduce((a, p) => a + p[0], 0) / 4, cy = Q.reduce((a, p) => a + p[1], 0) / 4;
    const nd = Math.round(SIDE.band / SIDE.step), D = []; for (let i = -nd; i <= nd; i++) D.push(i * SIDE.step);
    const t1 = [0, 0, 0], t2 = [0, 0, 0], sides = [];
    for (let s = 0; s < 4; s++) {
      const A = Q[s], Bp = Q[(s + 1) % 4];
      let nx = -(Bp[1] - A[1]) / hyp(A, Bp), ny = (Bp[0] - A[0]) / hyp(A, Bp);
      if (((A[0] + Bp[0]) / 2 - cx) * nx + ((A[1] + Bp[1]) / 2 - cy) * ny < 0) { nx = -nx; ny = -ny; } // normale vers l'extérieur
      const prof = SIDE.taus.map(() => new Float32Array(D.length)), hit = SIDE.taus.map(() => new Float32Array(D.length)), cols = D.map(() => []), grads = [];
      for (let ti = 0; ti < SIDE.taus.length; ti++) {
        const tau = SIDE.taus[ti];
        for (let di = 0; di < D.length; di++) {
          const s3 = [0, 0, 0], vals = []; let n = 0;
          for (let it = 0; it < SIDE.nt; it++) {
            const t = 0.1 + 0.8 * (it + 0.5) / SIDE.nt, off = (D[di] + tau * (t - 0.5)) * Wk;
            const x = A[0] + (Bp[0] - A[0]) * t + nx * off, y = A[1] + (Bp[1] - A[1]) * t + ny * off;
            sample(S, x + nx, y + ny, t1); sample(S, x - nx, y - ny, t2);
            if (Number.isNaN(t1[0]) || Number.isNaN(t2[0])) continue;
            const g = [t1[0] - t2[0], t1[1] - t2[1], t1[2] - t2[2]];
            s3[0] += g[0]; s3[1] += g[1]; s3[2] += g[2]; vals.push(g); n++;
            if (ti === 2) { grads.push(Math.abs(g[0]) + Math.abs(g[1]) + Math.abs(g[2])); if (it % 2 === 0) cols[di].push([(t1[0] + t2[0]) / 2, (t1[1] + t2[1]) / 2, (t1[2] + t2[2]) / 2]); }
          }
          if (!n) continue;
          const m = [s3[0] / n, s3[1] / n, s3[2] / n];
          prof[ti][di] = Math.abs(m[0]) + Math.abs(m[1]) + Math.abs(m[2]);
          let h = 0; for (const g of vals) if (g[0] * m[0] + g[1] * m[1] + g[2] * m[2] > 0 && Math.abs(g[0]) + Math.abs(g[1]) + Math.abs(g[2]) > 12) h++;
          hit[ti][di] = h / n;
        }
      }
      sides.push({ s, A, Bp, nx, ny, prof, hit, cols, grads });
    }
    const allG = sides.flatMap((sd) => sd.grads).sort((a, b) => a - b), scale = allG[Math.floor(allG.length * 0.9)] || 40;
    const meanC = (L) => (L.length ? [0, 1, 2].map((c) => L.reduce((a, p) => a + p[c], 0) / L.length) : [0, 0, 0]);
    const sdC = (L) => { const m = meanC(L); return L.length ? Math.sqrt(L.reduce((a, p) => a + (p[0] - m[0]) ** 2 + (p[1] - m[1]) ** 2 + (p[2] - m[2]) ** 2, 0) / L.length / 3) : 0; };
    const band = (sd, d0, d1) => { const L = []; D.forEach((d, di) => { if (d >= d0 && d <= d1) L.push(...sd.cols[di]); }); return L; };
    return sides.map((sd) => {
      const best = D.map((_, di) => { let b = 0, bt = 2; sd.prof.forEach((p, ti) => { if (p[di] > b) { b = p[di]; bt = ti; } }); return { v: b / scale, ti: bt }; });
      const emax = Math.max(...best.map((b) => b.v)) || 1, peaks = [];
      for (let di = 1; di < D.length - 1; di++) { const v = best[di].v; if (v >= emax * 0.12 && v >= best[di - 1].v && v >= best[di + 1].v) peaks.push({ di, d: D[di], v, ti: best[di].ti }); }
      peaks.sort((a, b) => b.v - a.v); peaks.splice(14);
      const strong = peaks.filter((p) => p.v >= emax * 0.3).map((p) => p.d).sort((a, b) => b - a);
      const mx = (lo, hi) => Math.max(0, ...best.filter((_, di) => D[di] >= lo && D[di] <= hi).map((b) => b.v)) / emax;
      for (const p of peaks) {
        const inB = band(sd, p.d - 0.02, p.d - 0.006), outB = band(sd, p.d + 0.006, p.d + 0.02), mi = meanC(inB), mo = meanC(outB);
        const rk = strong.findIndex((d) => Math.abs(d - p.d) < 1e-9);
        p.F = [p.v / emax, Math.min(p.v, 3), sd.hit[p.ti][p.di], sdC(inB) / 60, sdC(outB) / 60, Math.hypot(mi[0] - mo[0], mi[1] - mo[1], mi[2] - mo[2]) / 100,
          mx(p.d - 0.06, p.d - 0.015), mx(p.d + 0.015, p.d + 0.06), p.d * 10, Math.abs(p.d) * 10, strong.length ? Math.max(0, rk) / Math.max(1, strong.length - 1) : 1,
          (mi[0] + mi[1] + mi[2]) / 765, (mo[0] + mo[1] + mo[2]) / 765, Math.abs(SIDE.taus[p.ti]) * 50];
        p.tau = SIDE.taus[p.ti]; p.u = dot(p.F, W1);
      }
      return { s: sd.s, peaks, A: sd.A, Bp: sd.Bp, nx: sd.nx, ny: sd.ny, Wk, kk };
    });
  }
  /** 4 lignes choisies → coins (pixels de la photo) */
  function sideQuad(sides, pick) {
    const lines = sides.map((sd, s) => {
      const p = pick[s], o0 = (p.d - p.tau / 2) * sd.Wk, o1 = (p.d + p.tau / 2) * sd.Wk;
      return [[sd.A[0] + sd.nx * o0, sd.A[1] + sd.ny * o0], [sd.Bp[0] + sd.nx * o1, sd.Bp[1] + sd.ny * o1]];
    });
    const inter = ([[x1, y1], [x2, y2]], [[x3, y3], [x4, y4]]) => {
      const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4); if (Math.abs(den) < 1e-9) return null;
      const a = x1 * y2 - y1 * x2, b = x3 * y4 - y3 * x4;
      return [(a * (x3 - x4) - (x1 - x2) * b) / den, (a * (y3 - y4) - (y1 - y2) * b) / den];
    };
    const q = [inter(lines[3], lines[0]), inter(lines[0], lines[1]), inter(lines[1], lines[2]), inter(lines[2], lines[3])], kk = sides[0].kk;
    return q.some((p) => !p) ? null : q.map(([x, y]) => [x / kk, y / kk]);
  }
  /** Meilleur cadre autour d'un cadre de départ (pixels) : 5 lignes par côté, 625 cadres notés (W2) → { q, s } */
  function bestCombo(img, rough, rRef) {
    const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height, sides = sideCands(img, rough);
    const top = sides.map((sd) => [...sd.peaks].sort((a, b) => b.u - a.u).slice(0, 5));
    if (top.some((t) => !t.length)) return null;
    const [Wr, Hr] = sizeOf(rough); let best = null;
    for (const a of top[0]) for (const b of top[1]) for (const c of top[2]) for (const d of top[3]) {
      const pk = [a, b, c, d], q = sideQuad(sides, pk); if (!q) continue;
      const [w, h] = sizeOf(q), lum = pk.map((x) => x.F[11]), lm = (lum[0] + lum[1] + lum[2] + lum[3]) / 4, tr = trueRatio(q, W, H) || 0.01;
      const G = [a.u + b.u + c.u + d.u, Math.abs(Math.log(w / h / rRef)) * 10, Math.abs(Math.log(tr / RATIO)) * 10,
        Math.sqrt(lum.reduce((s, v) => s + (v - lm) ** 2, 0) / 4) * 10, (a.F[3] + b.F[3] + c.F[3] + d.F[3]) / 4,
        Math.abs(Math.log(w / Wr)) * 10, Math.abs(Math.log(h / Hr)) * 10, Math.min(a.u, b.u, c.u, d.u)];
      const s = dot(G, W2); if (!best || s > best.s) best = { q, s };
    }
    return best;
  }
  // ---------- 4) réseau de la page ----------
  /** Cadres prévus de chaque case (pixels), d'après les centres et la taille médiane des cartes fiables (ok[k]) */
  function lattice(quads, cols, rows, ok) {
    let pts = quads.map((q, k) => ({ k, i: k % cols, j: (k / cols) | 0, c: center(q) })).filter((p) => ok[p.k]);
    if (pts.length < 4) return null;
    let Hm = null;
    for (let pass = 0; pass < 3; pass++) {
      Hm = fitH(pts.map((p) => [p.i, p.j * RHO]), pts.map((p) => p.c)); if (!Hm) return null;
      const pitch = hyp(Hm(1, 0), Hm(0, 0)), res = pts.map((p) => hyp(Hm(p.i, p.j * RHO), p.c) / pitch), worst = res.indexOf(Math.max(...res));
      if (res[worst] < 0.06 || pts.length <= 5) break;
      pts = pts.filter((_, n) => n !== worst);
    }
    const grid = []; for (let i = -1; i <= cols; i++) for (let j = -1; j <= rows; j++) grid.push([i, j * RHO]);
    const inv = fitH(grid.map((p) => Hm(p[0], p[1])), grid); if (!inv) return null;
    const sz = pts.map((p) => sizeOf(quads[p.k].map(([x, y]) => inv(x, y)))), w = med(sz.map((s) => s[0])), h = med(sz.map((s) => s[1]));
    return quads.map((_, k) => { const i = k % cols, cy = ((k / cols) | 0) * RHO; return [[i - w / 2, cy - h / 2], [i + w / 2, cy - h / 2], [i + w / 2, cy + h / 2], [i - w / 2, cy + h / 2]].map(([x, y]) => Hm(x, y)); });
  }

  /**
   * Cartes d'une page de classeur (cols × rows, cartes droites) → { cells: [{ x, y, w, h, quad }] (fractions, ordre de
   * lecture), score, found } ou null. Asynchrone (laisse respirer l'écran) ; ~ 5 s sur PC.
   */
  async function detectCards(img, cols = 3, rows = 3, o = {}) {
    const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
    const si = Math.floor((cols - 1) / 2), sj = Math.floor((rows - 1) / 2);
    // 1) pousse depuis 3 graines (image de travail réduite : nGrow), la meilleure note totale
    const nGrow = o.nGrow || 480, T = { t0: performance.now() };
    let g = null;
    const tries = [];
    for (const s of await seeds(img, cols, rows, si, sj, o.nSeed || nGrow, o)) { const r = await growFrom(img, s, cols, rows, si, sj, nGrow, o.lines || 15); tries.push(Math.round(r.total)); if (!g || r.total > g.total) g = r; }
    if (!g) return null;
    // 2) choix conjoint : 80 cadres possibles autour de chaque carte trouvée (pleine précision)
    T.grow = performance.now();
    for (const c of g.cells) { const r = around(img, c.quad, 480, 80); await pause(); c.cands = r ? r.cands : null; }
    T.cands = performance.now();
    const sel = joint(g.cells.map((c) => c.cands), cols, rows, W, H, o.lr ?? 100).map((q, k) => q || g.cells[k].quad.map(([x, y]) => [x * W, y * H]));
    T.joint = performance.now(); await pause();
    // 3) + 4) finition côté par côté, deux passes
    const rRef = med(sel.map((q) => { const [w, h] = sizeOf(q); return w / h; }));
    const p1 = [];
    for (const q of sel) { p1.push(bestCombo(img, q, rRef) || { q, s: -1e9 }); await pause(); }
    const sMed = med(p1.map((r) => r.s)), pred = lattice(p1.map((r) => r.q), cols, rows, p1.map((r) => r.s >= sMed - 1));
    // forme de carte compatible avec la perspective de la page (place prévue P2) : vraies proportions à ± 9 %, côtés opposés
    // dans le même rapport (± 10 %) et aussi parallèles (± 7°) que sur la place prévue (vérité : au plus 7 %, 7 %, 6°)
    const ang = (A, Bp) => Math.atan2(Bp[1] - A[1], Bp[0] - A[0]);
    const shapeOk = (q, P2) => {
      const tb = (Q) => hyp(Q[0], Q[1]) / hyp(Q[3], Q[2]), lr = (Q) => hyp(Q[0], Q[3]) / hyp(Q[1], Q[2]);
      const sh = (Q) => [ang(Q[0], Q[1]) - ang(Q[3], Q[2]), ang(Q[0], Q[3]) - ang(Q[1], Q[2])], a = sh(q), b = sh(P2);
      return Math.abs(Math.log((trueRatio(q, W, H) || 0.01) / RATIO)) <= 0.09 && Math.abs(Math.log(tb(q) / tb(P2))) <= 0.1 && Math.abs(Math.log(lr(q) / lr(P2))) <= 0.1
        && Math.abs(a[0] - b[0]) <= 0.12 && Math.abs(a[1] - b[1]) <= 0.12;
    };
    const out = [];
    for (let k = 0; k < p1.length; k++) {
      let q = p1[k].q;
      if (pred) {
        const dg = hyp(pred[k][0], pred[k][2]), d1 = Math.max(...q.map((p, j) => hyp(p, pred[k][j]))) / dg;
        if (d1 >= 0.04 || !shapeOk(q, pred[k])) {
          const r2 = bestCombo(img, pred[k], rRef); await pause();
          if (r2 && shapeOk(r2.q, pred[k])) { const d2 = Math.max(...r2.q.map((p, j) => hyp(p, pred[k][j]))) / dg; if (!shapeOk(q, pred[k]) || r2.s - 30 * d2 > p1[k].s - 30 * d1) q = r2.q; }
        }
        // garde-fou : toujours pas une forme de carte → la place prévue
        if (!shapeOk(q, pred[k])) q = pred[k];
      }
      out.push(q);
    }
    const cells = out.map((q) => {
      const f = q.map(([x, y]) => [x / W, y / H]), xs = f.map((p) => p[0]), ys = f.map((p) => p[1]);
      return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys), quad: f };
    });
    // cartes « trouvées » : ni hors de la photo, ni de travers (vraies proportions à ± 8 %)
    const found = out.filter((q) => q.every(([x, y]) => x > -0.01 * W && y > -0.01 * H && x < 1.01 * W && y < 1.01 * H) && Math.abs(Math.log((trueRatio(q, W, H) || 0.01) / RATIO)) < 0.08).length;
    T.end = performance.now();
    detectCards.last = { tries, seedTotal: g.total, p1: p1.map((r) => r.s), pred: pred && pred.map((q) => q.map(([x, y]) => [x / W, y / H])), first: p1.map((r) => r.q.map(([x, y]) => [x / W, y / H])), ms: { pousse: T.grow - T.t0, cadres: T.cands - T.grow, conjoint: T.joint - T.cands, finition: T.end - T.joint } };
    return { cells, found, score: g.total };
  }

  /**
   * Classeur ouvert (2 pages de 3 × 3, v3.20) : chaque page cherchée seule (detectCards sur sa moitié de photo, un peu plus
   * large), cartes droites ou couchées : le sens est celui où les cartes sont le mieux trouvées (avant : photo en hauteur =
   * cartes couchées, faux pour une photo en hauteur aux pages l'une sur l'autre). Coins dans le sens de la CARTE (son coin
   * haut-gauche d'abord). → { cells (18 : page 1 puis page 2, ordre de lecture), found, rot (0 ou −90) } ou null.
   */
  async function detectSpread(img, o = {}) {
    const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
    const view = (turn) => {
      if (!turn) return { c: img, w: W, h: H, back: (x, y) => [x, y] };
      // photo tournée d'un quart de tour (sens des aiguilles) : (x, y) → (H − y, x)
      const c = document.createElement('canvas'); c.width = H; c.height = W;
      const g = c.getContext('2d'); g.translate(H, 0); g.rotate(Math.PI / 2); g.drawImage(img, 0, 0);
      return { c, w: H, h: W, back: (u, v) => [v, H - u] };
    };
    const half = async (V, side) => {
      const ov = o.ov ?? 0.54, wide = V.w >= V.h, x0 = wide ? (side ? 1 - ov : 0) * V.w : 0, y0 = wide ? 0 : (side ? 1 - ov : 0) * V.h;
      const w = wide ? ov * V.w : V.w, h = wide ? V.h : ov * V.h;
      const c = document.createElement('canvas'); c.width = Math.round(w); c.height = Math.round(h);
      c.getContext('2d').drawImage(V.c, x0, y0, w, h, 0, 0, c.width, c.height);
      const r = await detectCards(c, 3, 3, { gridSeed: true }); if (!r) return null;
      return { ...r, cells: r.cells.map((cl) => cl.quad.map(([x, y]) => { const [a, b] = V.back(x0 + x * w, y0 + y * h); return [a / W, b / H]; })) };
    };
    // sens des cartes : les deux essayés sur la 1re page ; photo en largeur = cartes droites sauf si « couchées » est nettement
    // mieux noté (× 1,5 : en couchées, des demi-cartes nettes sont parfois bien notées), photo en hauteur = la meilleure note
    const tries = []; let best = null;
    for (const turn of [false, true]) {
      const V = view(turn), a = await half(V, 0);
      if (a) tries.push({ turn, V, a });
      if (!turn && W >= H && a && a.found >= 8) break; // photo en largeur, cartes droites trouvées : pas d'essai « couchées » (plus rapide)
    }
    const up = tries.find((t) => !t.turn), down = tries.find((t) => t.turn), bias = W >= H ? 1.5 : 1;
    best = !up ? down : !down ? up : down.a.score > up.a.score * bias ? down : up;
    if (!best) return null;
    const b = await half(best.V, 1); if (!b) return null;
    const cells = [...best.a.cells, ...b.cells].map((q) => {
      const xs = q.map((p) => p[0]), ys = q.map((p) => p[1]);
      return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys), quad: q };
    });
    return { cells, found: best.a.found + b.found, rot: best.turn ? -90 : 0 };
  }

  /**
   * v3.59 — cartes PAS côte à côte (Arnaud : « en 4 cartes, les cartes peuvent ne pas être côte à côte », posées espacées sur
   * une feuille) : detectCards suppose des cartes régulièrement serrées (pas mesuré sur les voisines). Ici chaque carte est
   * cherchée pour elle-même dans sa part de la photo (cols × rows, débordement de 22 %) : le meilleur cadre en forme de carte
   * (vraies proportions ± 12 %) dont le centre tombe dans sa part ; puis tailles mises d'accord (une carte à plus de 25 % de la
   * taille médiane reprend le cadre le plus proche de cette taille). → { cells, found, score } comme detectCards, ou null.
   */
  async function detectLoose(img, cols = 2, rows = 2, o = {}) {
    const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
    if (!W || !H) return null;
    const cw = W / cols, ch = H / rows, m = o.margin ?? 0.22, per = [];
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const x0 = Math.max(0, (i - m) * cw), x1 = Math.min(W, (i + 1 + m) * cw), y0 = Math.max(0, (j - m) * ch), y1 = Math.min(H, (j + 1 + m) * ch);
      const k = Math.min(1, 1000 / Math.max(x1 - x0, y1 - y0)), c = document.createElement('canvas');
      c.width = Math.round((x1 - x0) * k); c.height = Math.round((y1 - y0) * k);
      c.getContext('2d').drawImage(img, x0, y0, x1 - x0, y1 - y0, 0, 0, c.width, c.height);
      let r = null; try { r = P.findCard(c, { top: 40 }); } catch (e) { console.warn('bords', e); }
      await pause();
      const cands = ((r && r.cands) || []).map((cd) => {
        const q = cd.quad.map(([x, y]) => [x0 + x * (x1 - x0), y0 + y * (y1 - y0)]), [cx, cy] = center(q), h = sizeOf(q)[1];
        const dev = Math.abs(Math.log((trueRatio(q, W, H) || 0.01) / RATIO));
        return { q, h, dev, s: cd.score - 30 * dev, inCell: cx >= i * cw && cx < (i + 1) * cw && cy >= j * ch && cy < (j + 1) * ch };
      }).filter((cd) => cd.inCell && cd.dev < 0.12 && cd.h > 0.3 * ch && cd.h < 1.2 * ch);
      cands.sort((a, b) => b.s - a.s);
      per.push({ i, j, cands, pick: cands[0] || null });
    }
    // tailles d'accord : sur une feuille ou dans un classeur, les cartes ont toutes à peu près la même taille sur la photo
    const hs = per.filter((p) => p.pick).map((p) => p.pick.h);
    if (hs.length >= 2) {
      const hm = med(hs);
      for (const p of per) {
        if (!p.pick || Math.abs(Math.log(p.pick.h / hm)) <= Math.log(1.25)) continue;
        const ok = p.cands.filter((cd) => Math.abs(Math.log(cd.h / hm)) <= Math.log(1.25));
        p.pick = ok[0] || null;
      }
    }
    const found = per.filter((p) => p.pick).length;
    if (!found) return null;
    const hm = med(per.filter((p) => p.pick).map((p) => p.pick.h)), wm = hm / RATIO;
    const cells = per.map((p) => {
      // part sans carte trouvée : un cadre de la taille médiane au milieu de sa part (la lecture dira si c'est vide)
      const q = p.pick ? p.pick.q : (() => { const cx = (p.i + 0.5) * cw, cy = (p.j + 0.5) * ch; return [[cx - wm / 2, cy - hm / 2], [cx + wm / 2, cy - hm / 2], [cx + wm / 2, cy + hm / 2], [cx - wm / 2, cy + hm / 2]]; })();
      const f = q.map(([x, y]) => [x / W, y / H]), xs = f.map((pt) => pt[0]), ys = f.map((pt) => pt[1]);
      return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys), quad: f };
    });
    detectLoose.last = per.map((p) => p.pick && { s: Math.round(p.pick.s * 10) / 10, dev: Math.round(p.pick.dev * 100) / 100, h: Math.round(p.pick.h) });
    return { cells, found, score: per.reduce((a, p) => a + (p.pick ? p.pick.s : 0), 0) };
  }

  Object.assign(P, { detectCards, detectSpread, detectLoose, trueRatio });
})();
