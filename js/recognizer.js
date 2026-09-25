/*
 * Moteur de reconnaissance d'une carte à partir d'une photo recadrée (format carte).
 * Utilisé par le scan « une carte » et par le scan « page de classeur ».
 *
 *   recognize(blob, onStatus) → { info, cands }
 *     info  : ce qui a été lu (numéro « 025/165 », mots du nom)
 *     cands : cartes candidates, la plus probable en premier
 */
App.recognizer = (() => {
  const { similarity, norm } = App.util;
  const game = 'pokemon';
  const ad = () => App.games.get(game);
  let worker = null, workerP = null, onStatus = null;
  let validTotals = new Set();

  const loadTesseract = () => new Promise((resolve, reject) => {
    if (window.Tesseract) return resolve(window.Tesseract);
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    s.onload = () => resolve(window.Tesseract);
    s.onerror = () => reject(new Error('Impossible de charger le module de lecture (connexion internet ?)'));
    document.head.appendChild(s);
  });
  const traduire = (s) => ({ 'loading tesseract core': 'Chargement du lecteur', 'initializing tesseract': 'Initialisation', 'loading language traineddata': 'Chargement du français', 'initializing api': 'Préparation' }[s] || s);
  const status = (msg) => { if (onStatus) onStatus(msg); };

  async function getWorker() {
    if (worker) return worker;
    if (!workerP) {
      workerP = (async () => {
        const T = await loadTesseract();
        worker = await T.createWorker('fra', 1, {
          logger: (m) => { if (m.status && m.status !== 'recognizing text') status(`${traduire(m.status)} ${m.progress ? Math.round(m.progress * 100) + ' %' : ''}`); },
        });
        ad().listSets().then((sets) => { validTotals = new Set(sets.map((x) => x.official)); }).catch(() => {});
        return worker;
      })().catch((e) => { workerP = null; throw e; });
    }
    return workerP;
  }

  /**
   * Découpe une zone de la carte, l'agrandit et la rend lisible :
   * gris, puis « niveaux automatiques » (le plus sombre devient noir, le plus clair blanc),
   * ce qui compense une zone trop sombre ou trop éclairée. Variantes : noir/blanc (otsu), inversé (texte blanc).
   */
  function band(img, y0, y1, scale, mode = 'sharp', x0 = 0, x1 = 1) {
    const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
    const sx = W * x0, sw = W * (x1 - x0), sy = H * y0, sh = H * (y1 - y0);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(sw * scale)); c.height = Math.max(1, Math.round(sh * scale));
    const g = c.getContext('2d', { willReadFrequently: true });
    g.imageSmoothingQuality = 'high';
    g.filter = mode === 'invert' ? 'grayscale(1) invert(1)' : 'grayscale(1)';
    g.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
    const d = g.getImageData(0, 0, c.width, c.height), p = d.data, n = p.length / 4;
    const hist = new Array(256).fill(0);
    for (let i = 0; i < n; i++) hist[p[i * 4]]++;
    // niveaux automatiques : 2 % les plus sombres → noir, 2 % les plus clairs → blanc
    let lo = 0, hi = 255, acc = 0;
    for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc > n * 0.02) { lo = i; break; } }
    acc = 0;
    for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc > n * 0.02) { hi = i; break; } }
    const span = Math.max(20, hi - lo);
    const lut = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      let v = Math.min(1, Math.max(0, (i - lo) / span));
      v = v < 0.5 ? 2 * v * v : 1 - 2 * (1 - v) * (1 - v); // courbe en S : plus de contraste au milieu
      lut[i] = Math.round(v * 255);
    }
    if (mode === 'otsu') {
      const h2 = new Array(256).fill(0);
      for (let i = 0; i < n; i++) h2[lut[p[i * 4]]]++;
      let sum = 0; for (let i = 0; i < 256; i++) sum += i * h2[i];
      let sumB = 0, wB = 0, best = 0, th = 128;
      for (let i = 0; i < 256; i++) {
        wB += h2[i]; if (!wB) continue; const wF = n - wB; if (!wF) break;
        sumB += i * h2[i]; const mB = sumB / wB, mF = (sum - sumB) / wF, v = wB * wF * (mB - mF) ** 2;
        if (v > best) { best = v; th = i; }
      }
      for (let i = 0; i < 256; i++) lut[i] = lut[i] > th ? 255 : 0;
    }
    for (let i = 0; i < n; i++) { const v = lut[p[i * 4]]; p[i * 4] = p[i * 4 + 1] = p[i * 4 + 2] = v; }
    g.putImageData(d, 0, 0);
    return c;
  }

  /**
   * Trouve la carte dans une zone de photo (pochette de classeur) : on cherche le rectangle
   * au format carte (63 × 88) dont les bords sont les plus nets. Gère les marges entre pochettes
   * et les cartes un peu décalées. Renvoie { x, y, w, h } en pixels de l'image, ou null.
   */
  function locateCard(img, rect, minFrac = 0.6) {
    const R = 63 / 88;
    const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
    // on cherche un peu au-delà de la case, au cas où la grille n'est pas parfaitement posée
    const mx = rect.w * 0.08, my = rect.h * 0.08;
    const ax = Math.max(0, rect.x - mx), ay = Math.max(0, rect.y - my);
    const aw = Math.min(W - ax, rect.w + 2 * mx), ah = Math.min(H - ay, rect.h + 2 * my);
    const S = 160 / aw; // travail sur une petite image
    const cw = Math.max(20, Math.round(aw * S)), ch = Math.max(20, Math.round(ah * S));
    const c = document.createElement('canvas'); c.width = cw; c.height = ch;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.filter = 'grayscale(1) blur(0.6px)';
    g.drawImage(img, ax, ay, aw, ah, 0, 0, cw, ch);
    const p = g.getImageData(0, 0, cw, ch).data;
    const gray = new Float32Array(cw * ch);
    for (let i = 0; i < gray.length; i++) gray[i] = p[i * 4];
    // bords horizontaux (haut/bas) et verticaux (gauche/droite)
    const eh = new Float32Array(cw * ch), ev = new Float32Array(cw * ch);
    for (let y = 1; y < ch - 1; y++) for (let x = 1; x < cw - 1; x++) {
      const i = y * cw + x;
      eh[i] = Math.abs(gray[i + cw] - gray[i - cw]);
      ev[i] = Math.abs(gray[i + 1] - gray[i - 1]);
    }
    // sommes cumulées par ligne (pour eh) et par colonne (pour ev) → somme d'un segment en O(1)
    const rowC = new Float32Array((cw + 1) * ch), colC = new Float32Array((ch + 1) * cw);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) rowC[y * (cw + 1) + x + 1] = rowC[y * (cw + 1) + x] + eh[y * cw + x];
    for (let x = 0; x < cw; x++) for (let y = 0; y < ch; y++) colC[x * (ch + 1) + y + 1] = colC[x * (ch + 1) + y] + ev[y * cw + x];
    const rowSum = (y, x0, x1) => { let best = 0; for (let d = -1; d <= 1; d++) { const yy = y + d; if (yy < 0 || yy >= ch) continue; const v = rowC[yy * (cw + 1) + x1] - rowC[yy * (cw + 1) + x0]; if (v > best) best = v; } return best; };
    const colSum = (x, y0, y1) => { let best = 0; for (let d = -1; d <= 1; d++) { const xx = x + d; if (xx < 0 || xx >= cw) continue; const v = colC[xx * (ch + 1) + y1] - colC[xx * (ch + 1) + y0]; if (v > best) best = v; } return best; };
    const cellW = rect.w * S, cellH = rect.h * S;
    const maxW = Math.min(cw - 2, (ch - 2) * R, Math.max(cellW, cellH * R) * 1.05);
    const minW = Math.min(cellW, cellH * R) * minFrac;
    let best = null;
    for (let w = Math.floor(maxW); w >= minW; w -= 1.5) {
      const h = w / R;
      for (let y = 1; y + h < ch - 1; y += 1.5) {
        const yi = Math.round(y), yb = Math.round(y + h);
        for (let x = 1; x + w < cw - 1; x += 1.5) {
          const xi = Math.round(x), xr = Math.round(x + w);
          // moyenne de netteté sur les 4 côtés ; on pénalise un côté beaucoup plus faible que les autres
          const t = rowSum(yi, xi, xr) / w, b = rowSum(yb, xi, xr) / w, l = colSum(xi, yi, yb) / h, r = colSum(xr, yi, yb) / h;
          const score = (t + b + l + r) / 4 + Math.min(t, b, l, r) * 0.8;
          if (!best || score > best.score) best = { score, x, y, w, h };
        }
      }
    }
    if (!best) return null;
    // la carte doit ressortir nettement par rapport au reste de la zone
    let mean = 0; for (let i = 0; i < eh.length; i++) mean += eh[i] + ev[i]; mean /= eh.length * 2;
    if (best.score < mean * 2.2) return null;
    return { x: ax + best.x / S, y: ay + best.y / S, w: best.w / S, h: best.h / S, score: best.score / (mean || 1) };
  }

  /**
   * Grille d'une page de classeur, trouvée toute seule.
   * On mesure où se trouvent les longs bords verticaux et horizontaux (les bords des cartes),
   * puis on cherche la grille régulière (cols × rows cartes, même taille, même écart) qui tombe dessus.
   * Renvoie { x, y, w, h } en fraction de l'image (la zone des pochettes) et une confiance, ou null.
   */
  function detectGrid(img, cols, rows, pre = null) {
    const P = pre || gridProfiles(img);
    const { V, Hp, W, H } = P;
    const fx = fitAxis(V, cols, W), fy = fitAxis(Hp, rows, H);
    let best = null;
    for (const X of fx) for (const Y of fy) {
      const pen = Math.abs(Math.log((X.w / Y.w) / (63 / 88)));
      if (pen > 0.22) continue; // forme de carte impossible
      const gapPen = Math.abs(X.p - X.w - (Y.p - Y.w)) / Math.max(X.p, Y.p) * 2; // écarts entre pochettes comparables
      const score = X.score + Y.score - pen * 4 - gapPen;
      if (!best || score > best.score) best = { score, X, Y };
    }
    if (!best) return null;
    const { X, Y } = best;
    const x = (X.a - (X.p - X.w) / 2) / W, y = (Y.a - (Y.p - Y.w) / 2) / H;
    const clamp = (v) => Math.max(0, Math.min(1, v));
    const x0 = clamp(x), y0 = clamp(y), x1 = clamp(x + cols * X.p / W), y1 = clamp(y + rows * Y.p / H);
    // part des grands bords de la photo expliquée par cette grille (sert à choisir le bon format de page)
    const explained = (Prof, F, n, len) => {
      const t = Math.max(2, Math.round(len * 0.015));
      let mx = 0; for (const v of Prof) if (v > mx) mx = v;
      const edges = []; for (let k = 0; k < n; k++) edges.push(F.a + k * F.p, F.a + k * F.p + F.w);
      let tot = 0, ok = 0;
      for (let i = 1; i < len - 1; i++) {
        const v = Prof[i]; if (v < mx * 0.3) continue;
        let isMax = true; for (let d = -t; d <= t; d++) if (Prof[i + d] > v) { isMax = false; break; }
        if (!isMax) continue;
        tot += v; if (edges.some((e) => Math.abs(e - i) <= t * 1.5)) ok += v;
      }
      return tot ? ok / tot : 0;
    };
    const fit = (explained(V, X, cols, W) + explained(Hp, Y, rows, H)) / 2;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, score: best.score, sx: X.score, sy: Y.score, extra: Math.max(X.extra, Y.extra), fit };
  }

  /** Profils des longs bords droits de la photo (calculés une fois pour tous les formats) */
  function gridProfiles(img) {
    const W0 = img.naturalWidth || img.width, H0 = img.naturalHeight || img.height;
    const S = 300 / Math.max(W0, H0);
    const W = Math.max(40, Math.round(W0 * S)), H = Math.max(40, Math.round(H0 * S));
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.filter = 'grayscale(1) blur(0.6px)';
    g.drawImage(img, 0, 0, W, H);
    const px = g.getImageData(0, 0, W, H).data;
    const gray = new Float32Array(W * H);
    for (let i = 0; i < gray.length; i++) gray[i] = px[i * 4];
    // gradient signé : le long d'un vrai bord (carte / pochette), il garde le même signe ; le bruit et le texte s'annulent
    const L = Math.max(6, Math.round(Math.min(W, H) / 22));
    const V = new Float32Array(W), Hp = new Float32Array(H);
    for (let x = 1; x < W - 1; x++) {
      let run = 0;
      for (let y = 0; y < H; y++) {
        run += gray[y * W + x + 1] - gray[y * W + x - 1];
        if (y >= L) run -= gray[(y - L) * W + x + 1] - gray[(y - L) * W + x - 1];
        if (y >= L - 1) { const m = Math.abs(run) / L; if (m > 6) V[x] += m - 6; }
      }
    }
    for (let y = 1; y < H - 1; y++) {
      let run = 0;
      for (let x = 0; x < W; x++) {
        run += gray[(y + 1) * W + x] - gray[(y - 1) * W + x];
        if (x >= L) run -= gray[(y + 1) * W + x - L] - gray[(y - 1) * W + x - L];
        if (x >= L - 1) { const m = Math.abs(run) / L; if (m > 6) Hp[y] += m - 6; }
      }
    }
    return { V, Hp, W, H };
  }

  /** Meilleures grilles sur un axe : n cartes de taille w, espacées de p, à partir de a */
  function fitAxis(P, n, len) {
    const t = Math.max(1, Math.round(len * 0.012));
    const Pk = new Float32Array(len);
    for (let i = 0; i < len; i++) { let m = 0; for (let d = -t; d <= t; d++) { const j = i + d; if (j >= 0 && j < len && P[j] > m) m = P[j]; } Pk[i] = m; }
    let mu = 0; for (const v of P) mu += v; mu = mu / len || 1;
    const at = (x) => { const i = Math.round(x); return i >= 0 && i < len ? Pk[i] : 0; };
    const out = [];
    for (let p = len * 0.35 / n; p <= len / n + 0.01; p += 1) {
      for (let w = p * 0.8; w <= p - 0.5; w += 1) {
        const span = (n - 1) * p + w;
        for (let a = 0; a + span <= len; a += 1) {
          let s = 0, low = Infinity;
          for (let k = 0; k < n; k++) { const e = Math.min(at(a + k * p), at(a + k * p + w)); s += e; if (e < low) low = e; }
          // une rangée de cartes en plus juste à côté = la grille est incomplète ou décalée
          const extra = Math.max(Math.min(at(a - p), at(a - p + w)), Math.min(at(a + n * p), at(a + n * p + w)));
          const score = (s / n + low * 0.5 - extra * 0.9) / mu;
          out.push({ p, w, a, score, extra: extra / mu });
        }
      }
    }
    out.sort((x, y) => y.score - x.score);
    const keep = [];
    for (const o of out) { if (keep.every((k) => Math.abs(k.a - o.a) > 2 || Math.abs(k.p - o.p) > 2 || Math.abs(k.w - o.w) > 2)) keep.push(o); if (keep.length >= 30) break; }
    return keep;
  }

  /**
   * Bords exacts d'une carte dans sa pochette (grille déjà posée) : on cherche la paire de bords gauche/droite
   * et haut/bas la plus nette, chaque axe séparément (tolère une photo un peu en biais). Null si pas net.
   */
  function refineCell(img, rect) {
    const W0 = img.naturalWidth || img.width, H0 = img.naturalHeight || img.height;
    const mx = rect.w * 0.1, my = rect.h * 0.1;
    const ax = Math.max(0, rect.x - mx), ay = Math.max(0, rect.y - my);
    const aw = Math.min(W0 - ax, rect.w + 2 * mx), ah = Math.min(H0 - ay, rect.h + 2 * my);
    const Sc = 220 / Math.max(aw, ah);
    const w = Math.max(30, Math.round(aw * Sc)), h = Math.max(30, Math.round(ah * Sc));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.filter = 'grayscale(1) blur(0.6px)';
    g.drawImage(img, ax, ay, aw, ah, 0, 0, w, h);
    const px = g.getImageData(0, 0, w, h).data;
    const gray = new Float32Array(w * h); for (let i = 0; i < gray.length; i++) gray[i] = px[i * 4];
    const L = Math.max(6, Math.round(Math.min(w, h) / 10));
    const V = new Float32Array(w), Hh = new Float32Array(h);
    for (let x = 1; x < w - 1; x++) { let run = 0; for (let y = 0; y < h; y++) { run += gray[y * w + x + 1] - gray[y * w + x - 1]; if (y >= L) run -= gray[(y - L) * w + x + 1] - gray[(y - L) * w + x - 1]; if (y >= L - 1) { const m = Math.abs(run) / L; if (m > 5) V[x] += m - 5; } } }
    for (let y = 1; y < h - 1; y++) { let run = 0; for (let x = 0; x < w; x++) { run += gray[(y + 1) * w + x] - gray[(y - 1) * w + x]; if (x >= L) run -= gray[(y + 1) * w + x - L] - gray[(y - 1) * w + x - L]; if (x >= L - 1) { const m = Math.abs(run) / L; if (m > 5) Hh[y] += m - 5; } } }
    const pair = (P, len, want, lo = 0.8, hi = 1.04) => {
      let best = null, mu = 0; for (const v of P) mu += v; mu = mu / len || 1;
      for (let a = 1; a < len - 1; a++) for (let b = a + Math.round(want * lo); b <= Math.min(len - 2, a + want * hi); b++) {
        const sc = (Math.min(P[a], P[b]) * 1.5 + P[a] + P[b]) / mu + (b - a) / want * 0.8;
        if (!best || sc > best.sc) best = { a, b, sc, q: Math.min(P[a], P[b]) / mu };
      }
      return best;
    };
    let X = pair(V, w, rect.w * Sc), Y = pair(Hh, h, rect.h * Sc);
    if (!X || !Y) return null;
    // un seul axe net : l'autre se déduit de la forme d'une carte (63 × 88), à ±8 %
    if (X.q >= 2 && Y.q < 2) { const Y2 = pair(Hh, h, (X.b - X.a) / (63 / 88), 0.92, 1.08); if (Y2 && Y2.q >= 0.8) Y = { ...Y2, q: 2 }; }
    else if (Y.q >= 2 && X.q < 2) { const X2 = pair(V, w, (Y.b - Y.a) * (63 / 88), 0.92, 1.08); if (X2 && X2.q >= 0.8) X = { ...X2, q: 2 }; }
    if (X.q < 2 || Y.q < 2) return null;
    const r = (63 / 88) / (((X.b - X.a) / Sc) / ((Y.b - Y.a) / Sc));
    if (r < 0.8 || r > 1.25) return null; // pas une forme de carte
    return { x: ax + X.a / Sc, y: ay + Y.a / Sc, w: (X.b - X.a) / Sc, h: (Y.b - Y.a) / Sc, score: Math.min(X.q, Y.q) };
  }

  // ---------- Versions d'une carte (1re édition, holo, reverse) ----------
  /** Carte recadrée → niveaux de gris à taille fixe (et couleurs) */
  function cardPixels(img, W = 300) {
    const H = Math.round(W / (63 / 88));
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, W, H);
    const d = g.getImageData(0, 0, W, H).data;
    const L = new Float32Array(W * H), Sat = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) {
      const r = d[i * 4], gg = d[i * 4 + 1], b = d[i * 4 + 2];
      L[i] = 0.299 * r + 0.587 * gg + 0.114 * b;
      const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b); Sat[i] = mx ? (mx - mn) / mx : 0;
    }
    return { W, H, L, Sat, rgb: d };
  }

  /**
   * Logo « Édition 1 » : petit rond noir sous l'illustration, à gauche (Set de Base, Team Rocket, Gym, Neo…)
   * ou à droite (Jungle, Fossile). On cherche une tache sombre, ronde, peu colorée, de la bonne taille,
   * nettement plus sombre que ce qui l'entoure. Réglé pour ne jamais se déclencher sur une carte normale :
   * sur une photo trop petite ou floue, le logo peut passer inaperçu (on garde alors la version normale).
   */
  function firstEditionStamp(P) {
    const { W, H, L, Sat } = P, D = W * 0.045;
    let best = null;
    for (const [x0, x1] of [[0.005, 0.26], [0.74, 0.995]]) {
      const X0 = Math.round(W * x0), X1 = Math.round(W * x1), Y0 = Math.round(H * 0.44), Y1 = Math.round(H * 0.6);
      const vals = []; for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) vals.push(L[y * W + x]);
      vals.sort((a, b) => a - b);
      const med = vals[vals.length >> 1];
      const thr = med * 0.72;
      const seen = new Uint8Array(W * H);
      for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) {
        const i0 = y * W + x;
        if (seen[i0] || L[i0] >= thr) continue;
        const stack = [i0]; seen[i0] = 1;
        let n = 0, minx = x, maxx = x, miny = y, maxy = y, sat = 0;
        while (stack.length) {
          const i = stack.pop(); n++; sat += Sat[i];
          const xx = i % W, yy = (i / W) | 0;
          if (xx < minx) minx = xx; if (xx > maxx) maxx = xx; if (yy < miny) miny = yy; if (yy > maxy) maxy = yy;
          for (const j of [i - 1, i + 1, i - W, i + W]) {
            const jx = j % W, jy = (j / W) | 0;
            if (j < 0 || jx < X0 - 3 || jx > X1 + 3 || jy < Y0 - 3 || jy > Y1 + 3 || seen[j] || L[j] >= thr) continue;
            seen[j] = 1; stack.push(j);
          }
        }
        const bw = maxx - minx + 1, bh = maxy - miny + 1, big = Math.max(bw, bh);
        if (big < D * 0.55 || big > D * 1.9) continue;
        const asp = bw / bh; if (asp < 0.6 || asp > 1.65) continue;
        const fill = n / (bw * bh); if (fill < 0.4) continue;
        if (sat / n > 0.42) continue; // un symbole d'énergie est coloré, le logo est noir
        let ring = 0, rn = 0;
        for (let yy = miny - 3; yy <= maxy + 3; yy++) for (let xx = minx - 3; xx <= maxx + 3; xx++) {
          if (xx >= minx && xx <= maxx && yy >= miny && yy <= maxy) continue;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          ring += L[yy * W + xx]; rn++;
        }
        ring /= rn || 1;
        let inner = 0; for (let yy = miny; yy <= maxy; yy++) for (let xx = minx; xx <= maxx; xx++) inner += L[yy * W + xx]; inner /= bw * bh;
        const contrast = (ring - inner) / (ring || 1);
        if (contrast < 0.22) continue;
        const score = contrast * fill * (1 - Math.abs(Math.log(big / D)) * 0.5);
        if (!best || score > best.score) best = { score, x: minx / W, y: miny / H, size: big / W, side: x0 < 0.5 ? 'gauche' : 'droite' };
      }
    }
    return best;
  }

  /**
   * Reflets « foil » dans une zone : sur une carte normale, le fond est uni (seul le texte fait des contrastes) ;
   * sur une reverse, le fond scintille (petits points clairs, couleurs changeantes).
   */
  function foilIn(P, x0, x1, y0, y1) {
    const { W, H, L, Sat } = P;
    const X0 = Math.round(W * x0), X1 = Math.round(W * x1), Y0 = Math.round(H * y0), Y1 = Math.round(H * y1);
    let n = 0, res = 0, sat = 0, sat2 = 0;
    for (let y = Y0 + 2; y < Y1 - 2; y++) for (let x = X0 + 2; x < X1 - 2; x++) {
      const i = y * W + x;
      if (L[i] < 120) continue; // texte et symboles : ignorés
      let m = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) m += L[i + dy * W + dx]; m /= 25;
      if (m < 110) continue; // à côté du texte
      res += Math.abs(L[i] - m); sat += Sat[i]; sat2 += Sat[i] * Sat[i]; n++;
    }
    if (n < 50) return null;
    const ms = sat / n;
    return { grain: res / n, satVar: Math.sqrt(Math.max(0, sat2 / n - ms * ms)), n };
  }

  /**
   * Versions probables d'une carte d'après sa photo, parmi celles qui existent pour elle.
   * Tout est comparé au visuel officiel de la même carte (même zones) : ça neutralise la netteté
   * et la taille de la photo, et un symbole imprimé sur la carte n'est pas pris pour un logo.
   * Renvoie { list: ['holo', 'firstEdition'], sure: {…}, info: {…} }.
   */
  async function detectVariants(blob, variants, officialSrc = '') {
    const v = variants || {};
    const img = await loadImg(blob);
    const P = cardPixels(img);
    let O = null;
    if (officialSrc) {
      try { const b = await fetch(officialSrc).then((r) => (r.ok ? r.blob() : null)); if (b) O = cardPixels(await createImageBitmap(b)); } catch (e) { O = null; }
    }
    const info = {}, list = [], sure = {};
    // version de base : holo / normale / reverse
    const base = ['holo', 'normal', 'reverse'].filter((k) => v[k]);
    let pickBase = base.length === 1 ? base[0] : null;
    if (base.length > 1 && base.includes('reverse')) {
      const other = base.find((k) => k !== 'reverse') || null;
      pickBase = other;
      if (O) {
        // reverse = le fond (zone du texte) brille, pas l'illustration : on compare au visuel officiel
        const f = (Q, x0, x1, y0, y1) => { const r = foilIn(Q, x0, x1, y0, y1); return r ? r.grain + r.satVar * 40 : null; };
        const tP = f(P, 0.08, 0.92, 0.6, 0.86), aP = f(P, 0.12, 0.88, 0.14, 0.44), tO = f(O, 0.08, 0.92, 0.6, 0.86), aO = f(O, 0.12, 0.88, 0.14, 0.44);
        if (tP && aP && tO && aO) {
          const ratio = (tP / tO) / (aP / aO);
          info.reverseRatio = Math.round(ratio * 100) / 100;
          if (ratio >= 1.7) { pickBase = 'reverse'; sure.base = ratio >= 2.2; } else sure.base = ratio <= 1.3;
        }
      }
    } else if (base.length > 1) pickBase = base.includes('holo') ? 'holo' : base[0];
    if (pickBase) list.push(pickBase);
    if (v.firstEdition) {
      const st = firstEditionStamp(P);
      const so = O ? firstEditionStamp(O) : null;
      info.stamp = st; info.stampOfficial = so;
      // une tache sombre à cet endroit sur la photo, mais pas sur le visuel officiel (qui n'a pas le logo)
      const ok = st && st.score >= 0.3 && (!O || !so || so.score < 0.15 || Math.abs(so.y - st.y) > 0.04 || so.side !== st.side);
      if (ok) { list.push('firstEdition'); sure.firstEdition = st.score >= 0.4; }
    }
    return { list, sure, info };
  }

  /** Essaie les formats de page connus et garde celui qui colle le mieux */
  function detectPage(img, formats, current) {
    const res = {}, pre = gridProfiles(img);
    for (const [k, [cols, rows]] of Object.entries(formats)) { try { res[k] = detectGrid(img, cols, rows, pre); } catch (e) { res[k] = null; } }
    // le format qui explique le mieux les bords des cartes (à égalité, on garde celui choisi)
    let bestK = current;
    for (const k of Object.keys(res)) if (res[k] && (!res[bestK] || res[k].fit > res[bestK].fit + 0.05)) bestK = k;
    return { fmt: bestK, grid: res[bestK], all: res };
  }

  const loadImg = (blob) => new Promise((res, rej) => {
    const url = URL.createObjectURL(blob);
    const i = new Image();
    i.onload = () => { URL.revokeObjectURL(url); res(i); };
    i.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Image illisible')); };
    i.src = url;
  });

  /** Lit la carte : bande du nom (haut), plusieurs lectures du numéro (bas), texte complet */
  async function ocr(blob) {
    const w = await getWorker();
    const img = await loadImg(blob);
    status('Lecture du nom…');
    const top = (await w.recognize(band(img, 0.02, 0.14, 2.5))).data.text || '';
    status('Lecture du numéro…');
    // le numéro est en bas à gauche (ou à droite sur les anciennes cartes)
    // + lectures en couleurs inversées pour les numéros blancs des cartes « full art »
    const reads = [band(img, 0.85, 1, 3), band(img, 0.88, 1, 4, 'sharp', 0, 0.5), band(img, 0.85, 1, 3, 'otsu'), band(img, 0.88, 1, 4, 'sharp', 0.5, 1),
      band(img, 0.86, 1, 3, 'invert'), band(img, 0.88, 1, 4, 'invert', 0, 0.5)];
    let bottom = '';
    for (const r of reads) bottom += ((await w.recognize(r)).data.text || '') + '\n';
    status('Lecture de la carte…');
    const full = (await w.recognize(blob)).data.text || '';
    return { top, bottom, full };
  }

  function parse({ top, bottom, full }) {
    const fix = (t) => t.replace(/[Oo](?=\d)|(?<=\d)[Oo]/g, '0').replace(/[Il|](?=\d{2})/g, '1');
    // tous les « 025/165 » lus ; on garde le plus fréquent, en préférant un total qui existe vraiment
    const nums = {};
    for (const t of [bottom, full]) for (const m of fix(t).matchAll(/(\d{1,3})\s*[\/⁄]\s*(\d{2,3})/g)) {
      const n = parseInt(m[1], 10), of = parseInt(m[2], 10), k = `${n}/${of}`;
      nums[k] = nums[k] || { n, of, raw: m[1], votes: 0 };
      nums[k].votes += 1 + (validTotals.has(of) ? 2 : 0) + (n <= of + 120 ? 0.5 : 0);
    }
    const ranked = Object.values(nums).sort((a, b) => b.votes - a.votes);
    const toLines = (t) => t.split('\n').map((l) => l.trim()).filter((l) => /[a-zA-ZÀ-ÿ]{3,}/.test(l));
    const lines = [...toLines(top), ...toLines(full).slice(0, 6)];
    const stop = new Set(['base', 'niveau', 'stade', 'pokemon', 'pv', 'hp', 'evolue', 'illus', 'faiblesse', 'resistance', 'retraite', 'talent', 'dresseur', 'supporter', 'objet', 'energie', 'nintendo', 'creatures', 'game', 'freak', 'the', 'and', 'souris', 'pass']);
    const words = [...new Set(lines.join(' ').split(/[^a-zA-ZÀ-ÿ\-]+/).filter((w) => w.length >= 4 && !stop.has(norm(w))))];
    // année du copyright en bas de carte (« ©1999 Wizards », « ©2016 Pokémon ») : départage une carte et sa réimpression
    const years = new Set();
    for (const m of (bottom + '\n' + full).matchAll(/(?:^|[^\d])((?:19|20)\d\d)(?!\d)/g)) { const y = +m[1]; if (y >= 1995 && y <= new Date().getFullYear() + 1) years.add(y); }
    const wizards = /wizard/i.test(bottom + ' ' + full);
    return { num: ranked[0] || null, alt: ranked.slice(1, 3), lines, words, years: [...years], wizards, raw: { bottom, full } };
  }

  /** Petite empreinte en niveaux de gris (24×33) pour comparer deux images de carte */
  async function thumb(blob) {
    const bmp = await createImageBitmap(blob);
    const W = 24, H = 33, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true }); g.filter = 'blur(0.5px)'; g.drawImage(bmp, 0, 0, W, H);
    const p = g.getImageData(0, 0, W, H).data, n = W * H, v = new Float32Array(n * 3);
    // 3 couches de couleur : distingue deux illustrations du même Pokémon (ex. Feunard Set de Base / Expedition)
    for (let i = 0; i < n; i++) { v[i] = p[i * 4]; v[n + i] = p[i * 4 + 1]; v[2 * n + i] = p[i * 4 + 2]; }
    return v;
  }
  /** Corrélation entre deux empreintes (1 = identiques) — insensible à la luminosité */
  function corr(a, b) {
    const n3 = a.length / 3;
    if (Number.isInteger(n3) && n3 > 100) { // moyenne des 3 couches de couleur
      let t = 0;
      for (let k = 0; k < 3; k++) t += corr1(a.subarray(k * n3, (k + 1) * n3), b.subarray(k * n3, (k + 1) * n3));
      return t / 3;
    }
    return corr1(a, b);
  }
  function corr1(a, b) {
    const n = a.length; let ma = 0, mb = 0;
    for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
    ma /= n; mb /= n;
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; num += x * y; da += x * x; db += y * y; }
    return da && db ? num / Math.sqrt(da * db) : 0;
  }

  /** Pochette vide ? (image presque uniforme) */
  async function looksEmpty(blob) {
    const v = (await thumb(blob)).subarray(0, 24 * 33);
    let m = 0; for (const x of v) m += x; m /= v.length;
    let s = 0; for (const x of v) s += (x - m) ** 2;
    return Math.sqrt(s / v.length) < 14;
  }

  /**
   * Empreinte de l'ILLUSTRATION (la partie la plus reconnaissable d'une carte), en niveaux de gris normalisés.
   * Pour la photo, on en calcule plusieurs versions légèrement décalées/zoomées : le cadrage d'une photo
   * n'est jamais parfait (pochette, carte de travers), on garde la version qui ressemble le plus.
   */
  const ART = { x0: 0.09, x1: 0.91, y0: 0.11, y1: 0.50 }, AW = 24, AH = 16;
  function artVec(bmp, dx = 0, dy = 0, sc = 1) {
    const W = bmp.width, H = bmp.height;
    const cx = (ART.x0 + ART.x1) / 2 + dx, cy = (ART.y0 + ART.y1) / 2 + dy, w = (ART.x1 - ART.x0) * sc, h = (ART.y1 - ART.y0) * sc;
    const c = document.createElement('canvas'); c.width = AW; c.height = AH;
    const g = c.getContext('2d', { willReadFrequently: true }); g.filter = 'blur(0.5px)';
    g.drawImage(bmp, W * (cx - w / 2), H * (cy - h / 2), W * w, H * h, 0, 0, AW, AH);
    const p = g.getImageData(0, 0, AW, AH).data, n = AW * AH, v = new Float32Array(n);
    let m = 0; for (let i = 0; i < n; i++) { v[i] = 0.299 * p[i * 4] + 0.587 * p[i * 4 + 1] + 0.114 * p[i * 4 + 2]; m += v[i]; }
    m /= n; let sd = 0; for (let i = 0; i < n; i++) sd += (v[i] - m) ** 2; sd = Math.sqrt(sd / n) || 1;
    for (let i = 0; i < n; i++) v[i] = (v[i] - m) / sd;
    return v;
  }
  async function artVariants(blob) {
    const bmp = await createImageBitmap(blob);
    const out = [];
    for (const sc of [0.9, 1, 1.1]) for (const dx of [-0.06, -0.03, 0, 0.03, 0.06]) for (const dy of [-0.06, -0.03, 0, 0.03, 0.06]) out.push(artVec(bmp, dx, dy, sc));
    return out;
  }
  /** Ressemblance (≈ 0,3 sans rapport … 0,9 identique) : meilleure version de la photo contre le visuel officiel */
  function artMatch(variants, ref) {
    let best = -1;
    for (const v of variants) { let s = 0; for (let i = 0; i < v.length; i++) s += v[i] * ref[i]; s /= v.length; if (s > best) best = s; }
    return best;
  }
  /**
   * Certains visuels « officiels » (surtout les anciennes cartes françaises) sont des photos de la carte
   * posée sur un fond sombre. On repère ce fond (bords uniformes et sombres) et on ne garde que la carte.
   */
  function trimBackground(bmp) {
    const W = 120, H = Math.max(40, Math.round(120 * bmp.height / bmp.width));
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bmp, 0, 0, W, H);
    const p = g.getImageData(0, 0, W, H).data, lum = (x, y) => { const i = (y * W + x) * 4; return 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]; };
    // fond : moyenne des 3 % de bord
    let sum = 0, n = 0; const m = Math.max(2, Math.round(W * 0.03));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x < m || x >= W - m || y < m || y >= H - m) { sum += lum(x, y); n++; }
    const bg = sum / n;
    if (bg > 70) return bmp; // pas de fond sombre : visuel bord à bord
    const th = bg + 45;
    const rowIn = (y) => { let k = 0; for (let x = 0; x < W; x++) if (lum(x, y) > th) k++; return k > W * 0.25; };
    const colIn = (x) => { let k = 0; for (let y = 0; y < H; y++) if (lum(x, y) > th) k++; return k > H * 0.25; };
    let y0 = 0, y1 = H - 1, x0 = 0, x1 = W - 1;
    while (y0 < H - 1 && !rowIn(y0)) y0++;
    while (y1 > y0 && !rowIn(y1)) y1--;
    while (x0 < W - 1 && !colIn(x0)) x0++;
    while (x1 > x0 && !colIn(x1)) x1--;
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    if (w < W * 0.3 || h < H * 0.3 || (w > W * 0.95 && h > H * 0.95)) return bmp;
    const k = bmp.width / W;
    const out = document.createElement('canvas'); out.width = Math.round(w * k); out.height = Math.round(h * k);
    out.getContext('2d').drawImage(bmp, x0 * k, y0 * k, w * k, h * k, 0, 0, out.width, out.height);
    return out;
  }

  /** Ressemblance ramenée entre 0 et 1 pour l'affichage et le score */
  const vis01 = (x) => (x == null ? 0 : Math.max(0, Math.min(1, (x - 0.3) / 0.55)));

  const officialThumbs = new Map();
  /** Empreinte du visuel officiel ; si l'image française manque, on prend l'anglaise */
  async function officialThumb(src) {
    if (!officialThumbs.has(src)) {
      const tryUrl = (u) => fetch(u).then((r) => (r.ok ? r.blob() : null)).catch(() => null);
      officialThumbs.set(src, (async () => {
        let b = await tryUrl(src);
        if (!b && /assets\.tcgdex\.net\/(?!en\/)[a-z-]+\//.test(src)) b = await tryUrl(src.replace(/assets\.tcgdex\.net\/[a-z-]+\//, 'assets.tcgdex.net/en/'));
        return b ? createImageBitmap(b).then((bmp) => artVec(trimBackground(bmp))).catch(() => null) : null;
      })());
    }
    return officialThumbs.get(src);
  }

  /**
   * Dos de carte Pokémon ? Le dos a un large bord bleu foncé tout autour,
   * alors que le recto a un bord jaune, argenté ou blanc.
   */
  async function looksLikeBack(blob) {
    const bmp = await createImageBitmap(blob);
    const W = 40, H = 56, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bmp, 0, 0, W, H);
    const p = g.getImageData(0, 0, W, H).data;
    let ring = 0, ringBlue = 0, all = 0, allBlue = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4, r = p[i], gg = p[i + 1], b = p[i + 2];
      const blue = b > r + 25 && b > gg + 5 && b > 60;
      const onRing = x < 4 || x >= W - 4 || y < 4 || y >= H - 4;
      if (onRing) { ring++; if (blue) ringBlue++; }
      all++; if (blue) allBlue++;
    }
    const rb = ringBlue / ring, ab = allBlue / all;
    // 2e règle (photo réelle, bleu terni par la pochette) : bord « plutôt bleu que jaune » et presque pas de jaune.
    // Un recto a un bord jaune (anciennes cartes) ou argenté/gris ; on exige aussi que la carte entière soit bleutée.
    let ringTint = 0, allTint = 0, ringYellow = 0, n2 = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4, r = p[i], gg = p[i + 1], b = p[i + 2], t = b - Math.max(r, gg);
      const onRing = x < 5 || x >= W - 5 || y < 5 || y >= H - 5;
      if (onRing) { ringTint += t; n2++; if (Math.min(r, gg) - b > 25) ringYellow++; }
      allTint += t;
    }
    ringTint /= n2; allTint /= W * H; ringYellow /= n2;
    if (ringTint > -30 && allTint > -25 && ringYellow < 0.25 && ab >= 0.12) return true;
    // dos : bord majoritairement bleu, et plus bleu que le reste de la carte (un Pokémon Eau a un bord jaune/argent)
    return rb >= 0.4 && rb > ab * 1.3;
  }

  /**
   * La photo montre-t-elle une page de classeur (plusieurs cartes) plutôt qu'une seule carte ?
   * Une page 3×3 a des séparations nettes verticales vers 1/3 et 2/3 de la largeur (entre les pochettes),
   * sur toute la hauteur ; une carte seule n'en a pas à ces endroits.
   */
  function looksLikePage(img) {
    const W0 = img.naturalWidth || img.width, H0 = img.naturalHeight || img.height;
    const W = 150, H = Math.max(60, Math.round(150 * H0 / W0));
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true }); g.filter = 'grayscale(1) blur(0.7px)'; g.drawImage(img, 0, 0, W, H);
    const p = g.getImageData(0, 0, W, H).data, v = (x, y) => p[(y * W + x) * 4];
    const colP = new Float32Array(W), rowP = new Float32Array(H);
    for (let y = Math.round(H * 0.08); y < H * 0.92; y++) for (let x = 1; x < W - 1; x++) colP[x] += Math.abs(v(x + 1, y) - v(x - 1, y));
    for (let x = Math.round(W * 0.08); x < W * 0.92; x++) for (let y = 1; y < H - 1; y++) rowP[y] += Math.abs(v(x, y + 1) - v(x, y - 1));
    const peak = (prof, n, t) => {
      const sorted = [...prof.slice(Math.round(n * 0.1), Math.round(n * 0.9))].sort((a, b) => a - b);
      const med = sorted[Math.floor(sorted.length / 2)] || 1;
      let m = 0; for (let i = Math.round(n * (t - 0.08)); i <= Math.round(n * (t + 0.08)); i++) m = Math.max(m, prof[i] || 0);
      return m / med;
    };
    const vx = [peak(colP, W, 1 / 3), peak(colP, W, 2 / 3)], hy = [peak(rowP, H, 1 / 3), peak(rowP, H, 2 / 3)];
    return { page: vx[0] > 2.2 && vx[1] > 2.2 && Math.max(...hy) > 1.8, vx, hy };
  }

  /** Recherche par nom tolérante aux erreurs de lecture (« AictiniV » → « ictin », « Drace » → « Drac »…) */
  async function nameSearch(words) {
    const qs = [...new Set(words.slice(0, 3).flatMap((w) => [w, w.slice(1), w.slice(0, 5), w.slice(1, 6), w.slice(2, 7), w.slice(0, 4)])
      .map((q) => q.replace(/[^a-zA-ZÀ-ÿ\-]/g, '')).filter((q) => q.length >= 4))].slice(0, 10);
    const out = [];
    for (const q of qs) out.push(...(await ad().search({ name: q }).catch(() => [])));
    return out;
  }

  /** Classe des candidates : ressemblance du nom, numéro, puis comparaison visuelle avec la photo */
  async function rank(list, num, lines, mine, { cap = 30, visualWeight = 1.5, needName = false, years = [], wizards = false } = {}) {
    const text = norm(lines.slice(0, 8).join(' '));
    const ocrWords = [...new Set(text.split(' ').filter((w) => w.length >= 4))];
    // ressemblance mot à mot : « Nictini » ↔ « Victini », « Dracaufeu » ↔ « Dracaufeu-ex »
    const wordScore = (name) => {
      let best = 0;
      for (const t of norm(name).split(' ').filter((x) => x.length >= 3)) {
        for (const w of ocrWords) { const v = similarity(w, t) * (t.length >= 5 ? 1 : 0.8); if (v > best) best = v; }
      }
      return best;
    };
    const uniq = new Map();
    for (const c of list) if (!uniq.has(c.id)) {
      const nameScore = Math.max(0, ...lines.slice(0, 8).map((l) => similarity(l, c.name)), text.includes(norm(c.name)) ? 1 : 0, wordScore(c.name));
      const numOk = !!num && parseInt(c.localId, 10) === num.n;
      const ofOk = !!num && !!(c.set && c.set.cardCount) && c.set.cardCount.official === num.of;
      if (needName && !numOk && nameScore < 0.35) continue;
      const yr = c.set && c.set.releaseDate ? parseInt(c.set.releaseDate, 10) : 0;
      const yearOk = !!yr && (years.includes(yr) || years.includes(yr - 1));
      const eraOk = wizards && !!yr && yr <= 2003;
      uniq.set(c.id, { ...c, nameScore, numOk, ofOk, yearOk, visual: null, score: nameScore + (numOk ? 0.5 : 0) + (ofOk ? 0.5 : 0) + (yearOk ? 0.6 : 0) + (eraOk ? 0.4 : 0) });
    }
    let out = [...uniq.values()].sort((a, b) => b.score - a.score).slice(0, cap);
    if (mine && out.length) {
      status('Comparaison avec les visuels officiels…');
      await App.util.pool(out, 6, async (c) => {
        const src = ad().img.card(c, 'low'); if (!src) return;
        const v = await officialThumb(src);
        if (v) { c.visual = artMatch(mine, v); c.score += vis01(c.visual) * visualWeight; }
      });
      out.sort((a, b) => b.score - a.score);
      // écart de ressemblance avec la meilleure autre candidate (une carte nettement devant = plus sûre)
      const vs = out.map((c) => c.visual).filter((x) => x != null).sort((a, b) => b - a);
      for (const c of out) if (c.visual != null) c.margin = c.visual - (c.visual === vs[0] ? (vs[1] ?? 0) : vs[0]);
    }
    return out;
  }

  async function findCandidates({ num, alt = [], words, lines, years = [], wizards = false }, blob) {
    const A = ad();
    let byNum = [];
    if (num) byNum = await A.findByNumber(num.n, num.of).catch(() => []);
    for (const a of alt) { if (byNum.length) break; byNum = await A.findByNumber(a.n, a.of).catch(() => []); if (byNum.length) num = a; }
    const mine = blob ? await artVariants(blob).catch(() => null) : null;
    let out = await rank(byNum, num, lines, mine, { years, wizards });
    // numéro absent, ou carte trouvée qui ne ressemble pas à la photo → on cherche aussi par le nom
    const weak = !out.length || (mine && (out[0].visual == null || out[0].visual < 0.55));
    if (weak && words.length) {
      status('Recherche par le nom…');
      const byName = await nameSearch(words);
      out = await rank([...byNum, ...byName], num, lines, mine, { cap: 100, visualWeight: 3, needName: true, years, wizards });
    }
    // « sûre » : bon numéro ET bon total, ou photo très ressemblante
    for (const c of out) c.confident = (c.numOk && c.ofOk && (c.visual == null || c.visual > 0.4)) || (c.visual != null && c.visual >= 0.75 && (c.margin ?? 1) >= 0.06);
    // réimpression (même nom, autre série) presque aussi ressemblante → on ne peut pas trancher : « À vérifier »
    if (out[0] && out[0].confident && !(out[0].numOk && out[0].ofOk)) {
      const twin = out.slice(1).find((c) => norm(c.name) === norm(out[0].name) && c.visual != null && out[0].visual != null && out[0].visual - c.visual < 0.12);
      if (twin) { out[0].confident = false; out[0].twin = true; }
    }
    return out.slice(0, 8);
  }

  /**
   * Reconnaissance limitée à une série (ex. une page de classeur rangée par série) :
   * on compare la photo à toutes les cartes de la série. Beaucoup plus fiable quand le nom est mal lu.
   */
  async function inSet(blob, info, setId, statusFn) {
    onStatus = statusFn || null;
    try {
      const A = ad();
      const set = await A.getSet(setId);
      const shape = { id: set.id, name: set.name, logo: set.logo, symbol: set.symbol, releaseDate: set.releaseDate, cardCount: { total: set.total, official: set.official }, serie: set.group };
      const list = set.cards.map((c) => ({ ...c, set: shape }));
      const num = info.num && (!info.num.of || info.num.of === set.official) ? info.num : null;
      const mine = await artVariants(blob).catch(() => null);
      status(`Comparaison avec les ${list.length} cartes de ${set.name}…`);
      const out = await rank(list, num, info.lines, mine, { cap: 500, visualWeight: 3 });
      const second = out[1] ? out[1].score : 0;
      for (const c of out) {
        c.confident = (c.numOk && (c.visual == null || c.visual > 0.4))
          || (c.visual != null && c.visual >= 0.72 && (c.margin ?? 1) >= 0.05)
          || (c === out[0] && c.visual != null && c.visual >= 0.55 && (c.margin ?? 0) >= 0.08 && c.score - second > 0.3); // nettement devant les autres
      }
      return out.slice(0, 8);
    } finally { onStatus = null; }
  }

  /** Lecture seule (sans recherche) */
  async function read(blob, statusFn) {
    onStatus = statusFn || null;
    try { return parse(await ocr(blob)); } finally { onStatus = null; }
  }

  async function recognize(blob, statusFn) {
    onStatus = statusFn || null;
    try {
      const info = parse(await ocr(blob));
      status('Recherche dans la base…');
      const cands = await findCandidates(info, blob);
      return { info, cands };
    } finally { onStatus = null; }
  }

  /** Recherche manuelle (nom et/ou « 025/165 »), classée avec la photo */
  async function manual(blob, nameTxt, numTxt, statusFn) {
    onStatus = statusFn || null;
    try {
      const name = (nameTxt || '').trim();
      const m = (numTxt || '').trim().match(/(\d{1,3})(?:\s*\/\s*(\d{2,3}))?/);
      const num = m ? { n: parseInt(m[1], 10), of: m[2] ? parseInt(m[2], 10) : null, raw: m[1] } : null;
      if (!name && !(num && num.of)) throw new Error('Indique un nom, ou un numéro complet (ex. 025/165)');
      if (num && num.of) return findCandidates({ num, words: name ? [name] : [], lines: name ? [name] : [] }, blob);
      const r = await findCandidates({ num: null, words: [name], lines: [name] }, blob);
      return num ? r.filter((c) => parseInt(c.localId, 10) === num.n) : r;
    } finally { onStatus = null; }
  }

  /** Texte court « ce qui a été lu » */
  const readSummary = (info) => [info.num ? `n° ${info.num.raw}/${info.num.of}` : 'numéro illisible', info.words.length ? `« ${info.words.slice(0, 3).join(', ')} »` : ''].filter(Boolean).join(' · ');

  /**
   * Ajoute une carte scannée à la collection.
   * mode : 'nouvelle' (carte pas encore possédée), 'doublon' (+1 exemplaire, la photo s'ajoute),
   *        'photo' (même carte : sa photo devient le visuel, sans changer la quantité), 'rien'.
   */
  let lastVariants = null;
  async function addScanned(c, blob, mode = null) {
    const before = App.col.get(game, c.id);
    if (!mode) mode = before && before.qty > 0 ? 'photo' : 'nouvelle';
    const key = App.col.keyOf(game, c.id);
    if (mode === 'rien') return key;
    if (mode === 'photo' && before) { await App.col.addPhoto(key, blob, { makeDisplay: true }); return key; }
    const set = c.set ? { id: c.set.id, name: c.set.name, symbol: c.set.symbol, logo: c.set.logo, official: c.set.cardCount && c.set.cardCount.official, group: c.set.serie || { id: c.serieId } } : null;
    await App.col.add(game, { ...c, serieId: c.serieId || (c.set && c.set.serie ? c.set.serie.id : '') }, set);
    // nouvelle carte : la photo devient son visuel ; doublon : la photo s'ajoute à ses photos
    await App.col.addPhoto(key, blob, { makeDisplay: !before || !before.displayPhoto });
    // versions reconnues sur la photo (holo / reverse / 1re édition), parmi celles qui existent pour cette carte
    try {
      const det = c.variants ? await detectVariants(blob, c.variants, ad().img.card(c, 'high')) : null;
      if (det && det.list.length) {
        const it = App.col.byKey(key);
        const vars = [...new Set([...((it && it.variants) || []), ...det.list])];
        await App.col.update(key, { variants: vars, variantsAuto: det.list });
        lastVariants = det;
      } else lastVariants = null;
    } catch (e) { console.warn('versions', e); lastVariants = null; }
    return key;
  }

  /** Ressemblance (0 à 1) entre ta photo et le visuel officiel d'une carte donnée */
  async function resemblance(blob, c) {
    const src = ad().img.card(c, 'low'); if (!src) return null;
    const [mine, ref] = await Promise.all([artVariants(blob), officialThumb(src)]);
    return ref ? vis01(artMatch(mine, ref)) : null;
  }
  /** Ressemblance de la photo avec plusieurs cartes (la photo n'est analysée qu'une fois) */
  async function resemblanceMany(blob, cards) {
    const mine = await artVariants(blob);
    const out = new Map();
    await App.util.pool(cards, 6, async (c) => {
      const src = ad().img.card(c, 'low'); if (!src) return;
      const ref = await officialThumb(src);
      if (ref) out.set(c.id, vis01(artMatch(mine, ref)));
    });
    return out;
  }

  function stop() { if (worker) { worker.terminate(); worker = null; workerP = null; } }

  return { get lastVariants() { return lastVariants; }, recognize, read, inSet, manual, resemblance, resemblanceMany, readSummary, addScanned, looksEmpty, looksLikeBack, looksLikePage, locateCard, refineCell, detectGrid, detectVariants, firstEditionStamp, foilIn, cardPixels, detectPage, stop, RATIO: 63 / 88 };
})();
