/*
 * Reconnaissance — bords d'une carte sur une photo (v3.18, labo des bords : _tests-scanner/bords*.js, sur le PC d'Arnaud).
 * Demande d'Arnaud : « trouver un moyen de reconnaître les bords des cartes » (cadre pris sur la pochette, carte coupée…).
 * 1) longues droites presque verticales / horizontales (Hough, pente ≤ 0,2) sur le contraste SIGNÉ en couleurs : un vrai bord
 *    garde le même sens de contraste le long de la carte, le texte et les motifs s'annulent ;
 * 2) toutes les combinaisons de 4 droites en forme de carte (63 × 88), puis les 60 meilleures recalées sur leurs bords ;
 * 3) note = somme pondérée de 20 clues (netteté des côtés, bande de bordure, coins arrondis, largeur de bordure régulière,
 *    forme, position…) ; POIDS APPRIS au labo sur 45 cartes vérifiées à la main (Pokémon, One Piece, Riftbound) × 4 cadrages
 *    « comme la caméra » (180 essais). Mesuré : pire coin < 5 % de la diagonale 133 fois sur 180 (méthode d'avant : 52),
 *    erreur médiane 1,5 % (avant : 5 %). Avec les coins attendus (carte reconnue à l'image) : clue en plus (écart aux coins).
 * Ne pas changer une clue sans refaire l'apprentissage au labo (les poids en dépendent).
 */
App.recognizerParts = App.recognizerParts || {};
(() => {
  // poids appris (labo, 14 oct. 2026) : sans coins attendus (20 clues) / avec (21 clues : + écart aux coins attendus)
  const W_NO = [5.3128, -5.022, 3.2474, 8.179, 5.9075, -0.2595, 4.0407, -6.1818, -13.1172, 0.8658, 6.44, -6.646, -2.1904, -0.2009, -7.1466, -3.0297, -0.7882, 2.3594, 1.4311, 4.8506];
  const W_EXP = [4.2624, -3.9788, -0.4786, 6.7029, 5.2151, 0.3606, 3.5902, -5.3548, -12.6225, 0.7017, 5.5148, -7.1501, -1.948, -0.6018, -7.0224, -1.8531, -1.3121, 1.4325, 1.012, 3.6673, -5.344];
  const T_NO = 15.75; // note minimale sans coins attendus (en dessous : 1 essai sur 5 au labo, dont la plupart des cadres faux)
  const P = { N: 480, slope: 0.2, nLines: 20, inset: 0.025, nRefine: 60 };

  /**
   * Carte la plus probable dans l'image (canvas, image, ImageBitmap) → { quad (fractions, HG HD BD BG), score } ou null.
   * top = K : renvoie aussi `cands`, les K meilleurs cadres distincts (même forme), pour un choix sur toute la page.
   * n = taille de travail (480 px par défaut) ; lines = droites gardées par sens (20 ; 12 = ~5 fois plus rapide).
   */
  function findCard(src, { expect = null, top = 0, n = P.N, lines = P.nLines } = {}) {
    const Wt = expect ? W_EXP : W_NO;
    const W0 = src.naturalWidth || src.width, H0 = src.naturalHeight || src.height;
    if (!W0 || !H0) return null;
    const S = n / Math.max(W0, H0), W = Math.max(40, Math.round(W0 * S)), H = Math.max(40, Math.round(H0 * S));
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d', { willReadFrequently: true }); g.filter = 'blur(0.7px)'; g.drawImage(src, 0, 0, W, H);
    const px = g.getImageData(0, 0, W, H).data;
    // contraste en couleurs : dérivée signée de chaque canal (Sobel) ; |…| sommés pour la netteté
    const SX = [0, 1, 2].map(() => new Float32Array(W * H)), SY = [0, 1, 2].map(() => new Float32Array(W * H));
    const Dx = new Float32Array(W * H), Dy = new Float32Array(W * H);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      let sx = 0, sy = 0; const i0 = y * W + x;
      for (let c = 0; c < 3; c++) {
        const p = (i, j) => px[((y + j) * W + (x + i)) * 4 + c];
        const ex = ((p(1, -1) + 2 * p(1, 0) + p(1, 1)) - (p(-1, -1) + 2 * p(-1, 0) + p(-1, 1))) / 4;
        const ey = ((p(-1, 1) + 2 * p(0, 1) + p(1, 1)) - (p(-1, -1) + 2 * p(0, -1) + p(1, -1))) / 4;
        SX[c][i0] = ex; SY[c][i0] = ey; sx += Math.abs(ex); sy += Math.abs(ey);
      }
      Dx[i0] = sx / 3; Dy[i0] = sy / 3;
    }
    const sample = []; for (let i = 0; i < W * H; i += 7) { const v = Math.max(Dx[i], Dy[i]); if (v > 4) sample.push(v); }
    sample.sort((a, b) => a - b); const scale = sample.length ? sample[Math.floor(sample.length * 0.9)] : 50;
    const cap = (v) => Math.min(1, v / scale);
    const caps = (v) => Math.max(-1, Math.min(1, v / scale));
    // Hough : x = p + a·(y − H/2) (verticales) et y = p + a·(x − W/2) (horizontales)
    const slopes = []; for (let a = -P.slope; a <= P.slope + 1e-9; a += 0.01) slopes.push(+a.toFixed(3));
    function hough(vert) {
      const n = vert ? W : H, len = vert ? H : W, SD = vert ? SX : SY, out = [];
      for (const a of slopes) {
        const acc = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
        for (let t = Math.round(len * 0.02); t < len * 0.98; t += 2) {
          const off = a * (t - len / 2);
          for (let p = 0; p < n; p++) {
            const q = Math.round(p + off); if (q < 1 || q >= n - 1) continue;
            const i = vert ? t * W + q : q * W + t;
            acc[0][p] += caps(SD[0][i]); acc[1][p] += caps(SD[1][i]); acc[2][p] += caps(SD[2][i]);
          }
        }
        const tot = new Float32Array(n);
        for (let p = 0; p < n; p++) tot[p] = (Math.abs(acc[0][p]) + Math.abs(acc[1][p]) + Math.abs(acc[2][p])) / 3;
        out.push(tot);
      }
      const cand = [];
      for (let ai = 0; ai < slopes.length; ai++) for (let p = 2; p < n - 2; p++) {
        const v = out[ai][p]; if (v <= 0) continue;
        let isMax = true;
        for (let aj = Math.max(0, ai - 3); aj <= Math.min(slopes.length - 1, ai + 3) && isMax; aj++) for (let d = -3; d <= 3; d++) { if ((aj !== ai || d) && out[aj][p + d] > v) { isMax = false; break; } }
        if (isMax) cand.push({ a: slopes[ai], p, v: v / (len / 2) });
      }
      cand.sort((x, y) => y.v - x.v);
      const keep = [];
      for (const c of cand) { if (keep.every((k) => Math.abs(k.p - c.p) > 3)) keep.push(c); if (keep.length >= lines) break; }
      return keep;
    }
    const VL = hough(true), HL = hough(false);
    const cross = (V, Hh) => { const x = (V.p + V.a * (Hh.p - Hh.a * W / 2 - H / 2)) / (1 - V.a * Hh.a); return [x, Hh.p + Hh.a * (x - W / 2)]; };
    const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
    const col = (x, y) => { const xi = Math.min(W - 1, Math.max(0, Math.round(x))), yi = Math.min(H - 1, Math.max(0, Math.round(y))), i = (yi * W + xi) * 4; return [px[i], px[i + 1], px[i + 2]]; };
    // netteté d'un côté entre ses coins (sans les coins arrondis) : contraste perpendiculaire, part des points nets, sens constant
    function sideSupport(A, Bp, vert) {
      let s = 0, n = 0, hit = 0; const sg = [0, 0, 0]; const SD = vert ? SX : SY;
      for (let t = 0.08; t <= 0.92; t += 0.02) {
        const x = A[0] + (Bp[0] - A[0]) * t, y = A[1] + (Bp[1] - A[1]) * t;
        let m = 0, mi = -1;
        for (let d = -1; d <= 1; d++) {
          const xi = Math.round(vert ? x + d : x), yi = Math.round(vert ? y : y + d);
          if (xi < 1 || yi < 1 || xi >= W - 1 || yi >= H - 1) continue;
          const v = (vert ? Dx : Dy)[yi * W + xi]; if (v > m) { m = v; mi = yi * W + xi; }
        }
        s += cap(m); n++; if (m > scale * 0.35) hit++;
        if (mi >= 0) for (let c = 0; c < 3; c++) sg[c] += caps(SD[c][mi]);
      }
      return { mean: n ? s / n : 0, hit: n ? hit / n : 0, cons: n ? (Math.abs(sg[0]) + Math.abs(sg[1]) + Math.abs(sg[2])) / 3 / n : 0 };
    }
    const meanC = (L) => [0, 1, 2].map((k) => L.reduce((a, p) => a + p[k], 0) / L.length);
    const cdist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    // bande de bordure juste à l'intérieur (uniforme, même couleur sur les 4 côtés, tranche avec l'extérieur et avec le dessin)
    function border(q) {
      const cx = q.reduce((a, p) => a + p[0], 0) / 4, cy = q.reduce((a, p) => a + p[1], 0) / 4;
      const qw = (dist(q[0], q[1]) + dist(q[3], q[2])) / 2, d = qw * P.inset;
      const per = [], ins4 = [], sds = [], deep = [];
      for (let s = 0; s < 4; s++) {
        const A = q[s], Bp = q[(s + 1) % 4], ins = [], outs = [], dps = [];
        for (let t = 0.12; t < 0.9; t += 0.06) {
          const x = A[0] + (Bp[0] - A[0]) * t, y = A[1] + (Bp[1] - A[1]) * t;
          const nx = cx - x, ny = cy - y, nl = Math.hypot(nx, ny) || 1;
          ins.push(col(x + nx / nl * d, y + ny / nl * d)); outs.push(col(x - nx / nl * d, y - ny / nl * d)); dps.push(col(x + nx / nl * d * 4, y + ny / nl * d * 4));
        }
        const mi = meanC(ins), mo = meanC(outs), md = meanC(dps);
        const sd = Math.sqrt(ins.reduce((a, p) => a + (p[0] - mi[0]) ** 2 + (p[1] - mi[1]) ** 2 + (p[2] - mi[2]) ** 2, 0) / ins.length / 3);
        per.push(cdist(mi, mo) / (25 + sd)); sds.push(sd); ins4.push(mi); deep.push(cdist(mi, md) / 60);
      }
      const m4 = meanC(ins4), spread = Math.sqrt(ins4.reduce((a, p) => a + (p[0] - m4[0]) ** 2 + (p[1] - m4[1]) ** 2 + (p[2] - m4[2]) ** 2, 0) / 4 / 3);
      return { mean: per.reduce((a, b) => a + b, 0) / 4, min: Math.min(...per), spread, sd: sds.reduce((a, b) => a + b, 0) / 4, deep: deep.reduce((a, b) => a + b, 0) / 4, inner: m4 };
    }
    // coins arrondis : juste à l'intérieur du coin « pointu », on voit encore le fond
    function corners(q, inner) {
      const cx = q.reduce((a, p) => a + p[0], 0) / 4, cy = q.reduce((a, p) => a + p[1], 0) / 4;
      const qw = (dist(q[0], q[1]) + dist(q[3], q[2])) / 2; let s = 0;
      for (const p of q) {
        const nx = cx - p[0], ny = cy - p[1], nl = Math.hypot(nx, ny) || 1, k = qw * 0.012;
        s += Math.min(1, cdist(col(p[0] + nx / nl * k, p[1] + ny / nl * k), inner) / 60);
      }
      return s / 4;
    }
    // profil perpendiculaire de chaque côté : 1re ligne parallèle vers l'intérieur / l'extérieur (bordure imprimée = même
    // largeur sur les 4 côtés ; pochette = écart différent d'un côté à l'autre ; cadre intérieur = bordure régulière dehors)
    function profiles(q) {
      const cx = q.reduce((a, p) => a + p[0], 0) / 4, cy = q.reduce((a, p) => a + p[1], 0) / 4;
      const qw = (dist(q[0], q[1]) + dist(q[3], q[2])) / 2, R = Math.max(6, Math.round(qw * 0.1));
      const res = [];
      for (let s = 0; s < 4; s++) {
        const A = q[s], Bp = q[(s + 1) % 4], vert = s === 1 || s === 3, D = vert ? Dx : Dy;
        const prof = new Float32Array(2 * R + 1); let n = 0;
        for (let t = 0.15; t <= 0.86; t += 0.0875) {
          const x = A[0] + (Bp[0] - A[0]) * t, y = A[1] + (Bp[1] - A[1]) * t;
          const nx = cx - x, ny = cy - y, nl = Math.hypot(nx, ny) || 1, ux = nx / nl, uy = ny / nl;
          for (let o = -R; o <= R; o++) {
            const xi = Math.round(x + ux * o), yi = Math.round(y + uy * o);
            if (xi < 1 || yi < 1 || xi >= W - 1 || yi >= H - 1) continue;
            prof[o + R] += D[yi * W + xi];
          }
          n++;
        }
        for (let i = 0; i < prof.length; i++) prof[i] /= n || 1;
        const e0 = Math.max(prof[R - 1], prof[R], prof[R + 1]) || 1;
        const peak = (dir) => {
          let best = { o: R, v: 0 };
          for (let k = 3; k < R; k++) { const i = R + dir * k; if (prof[i] > best.v && prof[i] >= prof[i - 1] && prof[i] >= prof[i + 1]) best = { o: k, v: prof[i] }; }
          return { o: best.o / qw, v: best.v / e0 };
        };
        res.push({ in: peak(1), out: peak(-1) });
      }
      const st = (a) => { const m = a.reduce((x, y) => x + y, 0) / a.length; return { m, sd: Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length) }; };
      const io = st(res.map((r) => r.in.o)), oo = st(res.map((r) => r.out.o));
      return { inSd: io.sd * 20, outSd: oo.sd * 20, inV: res.reduce((a, r) => a + Math.min(2, r.in.v), 0) / 4, outV: res.reduce((a, r) => a + Math.min(2, r.out.v), 0) / 4, inM: io.m * 10 };
    }
    const E = expect ? expect.map(([x, y]) => [x * W, y * H]) : null, dgE = E ? dist(E[0], E[2]) || 1 : 1;
    /** Les 20 (ou 21) clues d'un cadre q ; para = parallélisme des côtés opposés (pentes des droites) */
    function feats(q, para) {
      const sides = [sideSupport(q[0], q[1], false), sideSupport(q[1], q[2], true), sideSupport(q[3], q[2], false), sideSupport(q[0], q[3], true)];
      const bd = border(q);
      const qw = (dist(q[0], q[1]) + dist(q[3], q[2])) / 2, qh = (dist(q[0], q[3]) + dist(q[1], q[2])) / 2, ratio = qw / qh / (63 / 88);
      const ccx = q.reduce((a, p) => a + p[0], 0) / 4 / W - 0.5, ccy = q.reduce((a, p) => a + p[1], 0) / 4 / H - 0.5;
      const F = [
        sides.reduce((a, s) => a + s.mean, 0) / 4, Math.min(...sides.map((s) => s.mean)), sides.reduce((a, s) => a + s.hit, 0) / 4,
        sides.reduce((a, s) => a + s.cons, 0) / 4, Math.min(...sides.map((s) => s.cons)),
        Math.min(bd.mean, 6) / 3, Math.min(bd.min, 6) / 3, bd.spread / 60, bd.sd / 60, bd.deep, corners(q, bd.inner),
        (qw * qh) / (W * H), Math.abs(Math.log(ratio)) * 10, para, Math.hypot(ccx, ccy) * 2,
      ];
      const pf = profiles(q); F.push(pf.inSd, pf.outSd, pf.inV, pf.outV, pf.inM);
      if (E) F.push(q.reduce((a, p, j) => a + dist(p, E[j]), 0) / 4 / dgE * 10);
      let score = 0; for (let i = 0; i < F.length; i++) score += (Wt[i] || 0) * F[i];
      return { F, score };
    }
    const Ls = VL.filter((l) => l.p < W * 0.62), Rs = VL.filter((l) => l.p > W * 0.38), Ts = HL.filter((l) => l.p < H * 0.62), Bs = HL.filter((l) => l.p > H * 0.38);
    const all = [];
    for (const L of Ls) for (const R of Rs) {
      if (R.p - L.p < W * 0.3) continue;
      for (const T of Ts) for (const Bt of Bs) {
        if (Bt.p - T.p < H * 0.35) continue;
        const q = [cross(L, T), cross(R, T), cross(R, Bt), cross(L, Bt)];
        if (q.some(([x, y]) => x < -W * 0.02 || y < -H * 0.02 || x > W * 1.02 || y > H * 1.02)) continue;
        const qw = (dist(q[0], q[1]) + dist(q[3], q[2])) / 2, qh = (dist(q[0], q[3]) + dist(q[1], q[2])) / 2, ratio = qw / qh / (63 / 88);
        if (ratio < 0.86 || ratio > 1.14) continue;
        const r1 = dist(q[0], q[1]) / dist(q[3], q[2]), r2 = dist(q[0], q[3]) / dist(q[1], q[2]);
        if (r1 < 0.85 || r1 > 1.18 || r2 < 0.85 || r2 > 1.18) continue;
        const f = feats(q, (Math.abs(L.a - R.a) + Math.abs(T.a - Bt.a)) * 10);
        all.push({ q, ...f });
      }
    }
    if (!all.length) return null;
    // affinage des meilleurs cadres (et de ceux près des coins attendus) : chaque côté recalé sur son bord (± 3 pixels)
    const pick = new Set([...all].sort((a, b) => b.score - a.score).slice(0, P.nRefine));
    if (E) [...all].sort((a, b) => a.F[a.F.length - 1] - b.F[b.F.length - 1]).slice(0, 20).forEach((c) => pick.add(c));
    const inter = (l1, l2) => {
      const [x1, y1] = l1.A, [x2, y2] = l1.B, [x3, y3] = l2.A, [x4, y4] = l2.B;
      const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4); if (Math.abs(den) < 1e-9) return null;
      const a = x1 * y2 - y1 * x2, b = x3 * y4 - y3 * x4;
      return [(a * (x3 - x4) - (x1 - x2) * b) / den, (a * (y3 - y4) - (y1 - y2) * b) / den];
    };
    const n0 = all.length;
    for (const c of pick) {
      const q = c.q, lines = [];
      for (let s = 0; s < 4; s++) {
        const A = q[s], Bp = q[(s + 1) % 4], vert = s === 1 || s === 3;
        let bestL = null;
        for (let d1 = -3; d1 <= 3; d1++) for (let d2 = -3; d2 <= 3; d2++) {
          const A2 = vert ? [A[0] + d1, A[1]] : [A[0], A[1] + d1], B2 = vert ? [Bp[0] + d2, Bp[1]] : [Bp[0], Bp[1] + d2];
          const ss = sideSupport(A2, B2, vert), v = ss.mean * 0.5 + ss.hit * 0.5 + ss.cons;
          if (!bestL || v > bestL.v) bestL = { v, A: A2, B: B2 };
        }
        lines.push(bestL);
      }
      const nq = [inter(lines[3], lines[0]), inter(lines[0], lines[1]), inter(lines[1], lines[2]), inter(lines[2], lines[3])];
      if (nq.some((p) => !p)) continue;
      all.push({ q: nq, ...feats(nq, c.F[13]) });
    }
    let best = all[0];
    for (let i = 1; i < all.length; i++) if (all[i].score > best.score) best = all[i];
    findCard.last = { n: n0, refined: all.length - n0 };
    const res = { quad: best.q.map(([x, y]) => [x / W, y / H]), score: best.score };
    if (top) {
      // cadres distincts (coins à plus de 1 % de la diagonale l'un de l'autre), du mieux noté au moins bien
      const cands = [];
      for (const c of [...all].sort((a, b) => b.score - a.score)) {
        const dg = dist(c.q[0], c.q[2]);
        if (cands.some((o) => o.q.every((p, j) => dist(p, c.q[j]) < dg * 0.01))) continue;
        cands.push(c); if (cands.length >= top) break;
      }
      res.cands = cands.map((c) => ({ quad: c.q.map(([x, y]) => [x / W, y / H]), score: c.score }));
    }
    return res;
  }

  /** Carte d'une capture (carte seule, rafale) si le détecteur est assez sûr de lui, sinon null */
  function bestCard(src) {
    try { const r = findCard(src); return r && r.score >= T_NO ? r : null; } catch (e) { console.warn('bords', e); return null; }
  }

  /**
   * Coins approximatifs (carte reconnue à l'image, case de classeur) → vrais bords de la carte autour, ou null si rien de
   * proche (pire coin à plus de 12 % de la diagonale des coins attendus : on garde alors les coins donnés)
   */
  function snapQuad(src, quad) {
    try {
      // carte qui touche le bord de l'image (image déjà recadrée sur la carte) : ses bords n'ont rien à l'extérieur, le
      // détecteur prendrait le cadre intérieur → on ne touche à rien (le recadrage se fait alors sur la photo d'origine)
      if (quad.some(([x, y]) => x < 0.03 || x > 0.97 || y < 0.03 || y > 0.97)) return null;
      const r = findCard(src, { expect: quad }); if (!r) return null;
      const W0 = src.naturalWidth || src.width, H0 = src.naturalHeight || src.height;
      const px = (p) => [p[0] * W0, p[1] * H0], dg = Math.hypot(...[0, 1].map((k) => px(quad[2])[k] - px(quad[0])[k])) || 1;
      if (r.quad.some((p, j) => Math.hypot(px(p)[0] - px(quad[j])[0], px(p)[1] - px(quad[j])[1]) / dg > 0.12)) return null;
      return r.quad;
    } catch (e) { console.warn('bords', e); return null; }
  }

  Object.assign(App.recognizerParts, { findCard, bestCard, snapQuad });
})();
