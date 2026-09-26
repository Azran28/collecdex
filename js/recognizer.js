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
    if (mode === 'unsharp') { // photo un peu floue : on renforce les contours (masque flou)
      const W2 = c.width, H2 = c.height, src = new Float32Array(n);
      for (let i = 0; i < n; i++) src[i] = p[i * 4];
      for (let y = 1; y < H2 - 1; y++) for (let x = 1; x < W2 - 1; x++) {
        const i = y * W2 + x;
        const blur = (src[i - W2 - 1] + src[i - W2] + src[i - W2 + 1] + src[i - 1] + src[i] + src[i + 1] + src[i + W2 - 1] + src[i + W2] + src[i + W2 + 1]) / 9;
        const v = Math.max(0, Math.min(255, src[i] + 1.6 * (src[i] - blur)));
        p[i * 4] = p[i * 4 + 1] = p[i * 4 + 2] = v;
      }
    }
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
  function detectGrid(img, cols, rows, pre = null, asp = 63 / 88) {
    const P = pre || gridProfiles(img);
    const { V, Hp, Vs, Hs, W, H } = P;
    const fx = fitAxis(V, cols, W), fy = fitAxis(Hp, rows, H);
    const midW = (F) => F.ws[F.ws.length >> 1];
    let best = null;
    for (const X of fx) for (const Y of fy) {
      const pen = Math.abs(Math.log((midW(X) / midW(Y)) / asp));
      if (pen > 0.22) continue; // forme de carte impossible
      const gapPen = Math.abs(X.p - X.w - (Y.p - Y.w)) / Math.max(X.p, Y.p) * 2; // écarts entre pochettes comparables
      const score = X.score + Y.score - pen * 4 - gapPen;
      if (!best || score > best.score) best = { score, X, Y };
    }
    if (!best) return null;
    const { X, Y } = best;
    const edgesOf = (F, n) => { const e = []; for (let k = 0; k < n; k++) e.push(F.a + F.st[k], F.a + F.st[k] + F.ws[k]); return e; };
    const EX = edgesOf(X, cols), EY = edgesOf(Y, rows);
    // pente de chaque bord (moyenne pondérée autour de sa position)
    const slopeAt = (Prof, Sl, pos, len) => {
      const t = Math.max(2, Math.round(len * 0.012)); let s = 0, n = 0;
      for (let i = Math.round(pos) - t; i <= Math.round(pos) + t; i++) if (i >= 0 && i < len) { s += Sl[i] * Prof[i]; n += Prof[i]; }
      return n ? s / n : 0;
    };
    const SX = EX.map((e) => slopeAt(V, Vs, e, W)), SY = EY.map((e) => slopeAt(Hp, Hs, e, H));
    // intersection d'un bord vertical (x = ex + sx·(y − H/2)) et d'un bord horizontal (y = ey + sy·(x − W/2))
    const cross = (ex, sx, ey, sy) => { const x = (ex + sx * (ey - sy * W / 2 - H / 2)) / (1 - sx * sy); return [x, ey + sy * (x - W / 2)]; };
    const clamp = (v) => Math.max(0, Math.min(1, v));
    const cells = [];
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const q = [cross(EX[2 * i], SX[2 * i], EY[2 * j], SY[2 * j]), cross(EX[2 * i + 1], SX[2 * i + 1], EY[2 * j], SY[2 * j]),
        cross(EX[2 * i + 1], SX[2 * i + 1], EY[2 * j + 1], SY[2 * j + 1]), cross(EX[2 * i], SX[2 * i], EY[2 * j + 1], SY[2 * j + 1])];
      const xs = q.map((p) => p[0]), ys = q.map((p) => p[1]);
      const bx0 = clamp(Math.min(...xs) / W), by0 = clamp(Math.min(...ys) / H), bx1 = clamp(Math.max(...xs) / W), by1 = clamp(Math.max(...ys) / H);
      cells.push({ x: bx0, y: by0, w: bx1 - bx0, h: by1 - by0, quad: q.map(([a, b]) => [a / W, b / H]) });
    }
    const gxp = (X.p - X.w) / 2, gyp = (Y.p - Y.w) / 2;
    const x0 = clamp(Math.min(...cells.map((c) => c.x)) - gxp / W), y0 = clamp(Math.min(...cells.map((c) => c.y)) - gyp / H);
    const x1 = clamp(Math.max(...cells.map((c) => c.x + c.w)) + gxp / W), y1 = clamp(Math.max(...cells.map((c) => c.y + c.h)) + gyp / H);
    // part des grands bords de la photo expliquée par cette grille (sert à choisir le bon format de page)
    const explained = (Prof, F, n, len) => {
      const t = Math.max(2, Math.round(len * 0.015));
      let mx = 0; for (const v of Prof) if (v > mx) mx = v;
      const edges = edgesOf(F, n);
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
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, score: best.score, sx: X.score, sy: Y.score, extra: Math.max(X.extra, Y.extra), inner: Math.max(X.inner || 0, Y.inner || 0), fit, cells };
  }

  /**
   * Profils des longs bords droits de la photo (calculés une fois pour tous les formats).
   * Chaque bord est suivi le long d'une droite un peu penchée (photo tournée, prise en biais) :
   * pour chaque position on garde la pente qui colle le mieux (V[x] et sa pente Vs[x], idem pour les lignes).
   */
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
    const gx = new Float32Array(W * H), gy = new Float32Array(W * H);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x; gx[i] = gray[i + 1] - gray[i - 1]; gy[i] = gray[i + W] - gray[i - W]; }
    // gradient signé : le long d'un vrai bord (carte / pochette), il garde le même signe ; le bruit et le texte s'annulent
    const L = Math.max(6, Math.round(Math.min(W, H) / 22));
    const SL = []; for (let s = -0.1; s <= 0.1001; s += 0.02) SL.push(Math.round(s * 100) / 100);
    const scan = (n, len, get) => {
      const P = new Float32Array(n), Ps = new Float32Array(n), buf = new Float32Array(L);
      for (const s of SL) for (let a = 0; a < n; a++) {
        let run = 0, acc = 0; buf.fill(0);
        for (let t = 0; t < len; t++) {
          const u = Math.round(a + s * (t - len / 2));
          const v = u >= 1 && u < n - 1 ? get(u, t) : 0;
          run += v - buf[t % L]; buf[t % L] = v;
          if (t >= L - 1) { const m = Math.abs(run) / L; if (m > 6) acc += m - 6; }
        }
        if (acc > P[a]) { P[a] = acc; Ps[a] = s; }
      }
      return [P, Ps];
    };
    const [V, Vs] = scan(W, H, (x, y) => gx[y * W + x]);
    const [Hp, Hs] = scan(H, W, (y, x) => gy[y * W + x]);
    return { V, Hp, Vs, Hs, W, H };
  }

  /** Meilleures grilles sur un axe : n cartes de taille w, espacées de p, à partir de a */
  function fitAxis(P, n, len) {
    const t = Math.max(1, Math.round(len * 0.012));
    const Pk = new Float32Array(len);
    for (let i = 0; i < len; i++) { let m = 0; for (let d = -t; d <= t; d++) { const j = i + d; if (j >= 0 && j < len && P[j] > m) m = P[j]; } Pk[i] = m; }
    let mu = 0; for (const v of P) mu += v; mu = mu / len || 1;
    const at = (x) => { const i = Math.round(x); return i >= 0 && i < len ? Pk[i] : 0; };
    // plus fort bord à l'intérieur d'une carte (hors marges) : une séparation de pochettes au milieu = mauvais format
    const inner = (x0, x1) => { let m = 0; for (let i = Math.round(x0); i <= x1; i++) if (i >= 0 && i < len && P[i] > m) m = P[i]; return m; };
    const out = []; let thr = -Infinity;
    // r : photo prise en biais, les cartes du fond paraissent un peu plus petites (perspective)
    const RS = n > 1 ? [0.84, 0.9, 0.95, 1, 1.05, 1.1, 1.18] : [1];
    for (const r of RS) for (let p = len * 0.35 / n; p <= len / n + 0.01; p += 1) {
      for (let w = p * 0.8; w <= p - 0.5; w += 1) {
        const st = [0], ws = []; let sp = p, sw = w;
        for (let k = 0; k < n; k++) { ws.push(sw); st.push(st[k] + sp); sp *= r; sw *= r; }
        const span = st[n - 1] + ws[n - 1];
        for (let a = 0; a + span <= len; a += 1) {
          let s = 0, low = Infinity;
          for (let k = 0; k < n; k++) { const e = Math.min(at(a + st[k]), at(a + st[k] + ws[k])); s += e; if (e < low) low = e; }
          // une rangée de cartes en plus juste à côté = la grille est incomplète ou décalée
          const extra = Math.max(Math.min(at(a - p / r), at(a - p / r + w / r)), Math.min(at(a + st[n]), at(a + st[n] + ws[n - 1] * r)));
          // la perspective est permise mais coûte un peu (sinon elle sert à « tricher » sur des bords voisins)
          const score = (s / n + low * 0.5 - extra * 0.9) / mu - Math.abs(Math.log(r)) * 4;
          if (score <= thr) continue;
          out.push({ p, w, a, r, st, ws, score, extra: extra / mu, low });
          if (out.length > 20000) { out.sort((x, y) => y.score - x.score); out.length = 2000; thr = out[1999].score; }
        }
      }
    }
    // pénalité « séparation au milieu d'une carte » sur les meilleurs seulement (calcul plus lourd)
    out.sort((x, y) => y.score - x.score);
    const top = out.slice(0, 600);
    for (const o of top) {
      let m = 0; for (let k = 0; k < n; k++) m = Math.max(m, inner(o.a + o.st[k] + o.ws[k] * 0.18, o.a + o.st[k] + o.ws[k] * 0.82));
      o.inner = m / mu; o.score -= Math.max(0, m - o.low * 0.7) / mu * 0.8;
    }
    top.sort((x, y) => y.score - x.score);
    const keep = [];
    for (const o of top) { if (keep.every((k) => Math.abs(k.a - o.a) > 2 || Math.abs(k.p - o.p) > 2 || Math.abs(k.w - o.w) > 2 || k.r !== o.r)) keep.push(o); if (keep.length >= 30) break; }
    return keep;
  }

  /** Homographie qui envoie le carré unité (0,0)(1,0)(1,1)(0,1) sur le quadrilatère q */
  function squareToQuad(q) {
    const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
    const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
    const den = dx1 * dy2 - dx2 * dy1 || 1e-9;
    const g = (dx3 * dy2 - dx2 * dy3) / den, h = (dx1 * dy3 - dx3 * dy1) / den;
    const a = x1 - x0 + g * x1, b = x3 - x0 + h * x3, d = y1 - y0 + g * y1, e = y3 - y0 + h * y3;
    return (u, v) => { const w = g * u + h * v + 1; return [(a * u + b * v + x0) / w, (d * u + e * v + y0) / w]; };
  }

  /**
   * Image redressée d'une pochette : le quadrilatère de la case (photo tournée ou en biais) est remis à plat,
   * puis on cherche les bords exacts de la carte à l'intérieur. rot : 90 / -90 si les cartes sont couchées.
   * Renvoie { canvas, box (rectangle englobant, en fraction de la page), auto (bords de la carte trouvés) }.
   */
  function cellCard(img, cell, rot = 0) {
    const NW = img.naturalWidth || img.width, NH = img.naturalHeight || img.height;
    const q = (cell.quad || [[cell.x, cell.y], [cell.x + cell.w, cell.y], [cell.x + cell.w, cell.y + cell.h], [cell.x, cell.y + cell.h]]).map(([x, y]) => [x * NW, y * NH]);
    const f = squareToQuad(q), m = 0.1;
    const dist = (p, r) => Math.hypot(p[0] - r[0], p[1] - r[1]);
    const qw = (dist(q[0], q[1]) + dist(q[3], q[2])) / 2, qh = (dist(q[0], q[3]) + dist(q[1], q[2])) / 2;
    const k = Math.min(1, 1000 / Math.max(qw, qh));
    const cw = Math.max(40, Math.round(qw * k)), ch = Math.max(40, Math.round(qh * k));
    const OW = Math.round(cw * (1 + 2 * m)), OH = Math.round(ch * (1 + 2 * m));
    // pixels de la zone utile de la photo
    const corners = [[-m, -m], [1 + m, -m], [1 + m, 1 + m], [-m, 1 + m]].map(([u, v]) => f(u, v));
    const sx0 = Math.max(0, Math.floor(Math.min(...corners.map((p) => p[0])))), sy0 = Math.max(0, Math.floor(Math.min(...corners.map((p) => p[1]))));
    const sx1 = Math.min(NW, Math.ceil(Math.max(...corners.map((p) => p[0])))), sy1 = Math.min(NH, Math.ceil(Math.max(...corners.map((p) => p[1]))));
    const SW = Math.max(1, sx1 - sx0), SH = Math.max(1, sy1 - sy0);
    const sc = document.createElement('canvas'); sc.width = SW; sc.height = SH;
    sc.getContext('2d').drawImage(img, sx0, sy0, SW, SH, 0, 0, SW, SH);
    const src = sc.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, SW, SH).data;
    const out = document.createElement('canvas'); out.width = OW; out.height = OH;
    const og = out.getContext('2d'); const od = og.createImageData(OW, OH); const D = od.data;
    for (let py = 0; py < OH; py++) {
      const v = (py + 0.5) / OH * (1 + 2 * m) - m;
      for (let px = 0; px < OW; px++) {
        const u = (px + 0.5) / OW * (1 + 2 * m) - m;
        let [x, y] = f(u, v); x -= sx0 + 0.5; y -= sy0 + 0.5;
        const o = (py * OW + px) * 4;
        if (x < 0 || y < 0 || x > SW - 1 || y > SH - 1) { D[o] = D[o + 1] = D[o + 2] = 0; D[o + 3] = 255; continue; }
        const xi = x | 0, yi = y | 0, fx = x - xi, fy = y - yi, x2 = Math.min(SW - 1, xi + 1), y2 = Math.min(SH - 1, yi + 1);
        const i00 = (yi * SW + xi) * 4, i10 = (yi * SW + x2) * 4, i01 = (y2 * SW + xi) * 4, i11 = (y2 * SW + x2) * 4;
        for (let c = 0; c < 3; c++) D[o + c] = (src[i00 + c] * (1 - fx) + src[i10 + c] * fx) * (1 - fy) + (src[i01 + c] * (1 - fx) + src[i11 + c] * fx) * fy;
        D[o + 3] = 255;
      }
    }
    og.putImageData(od, 0, 0);
    // cartes couchées : on tourne la case d'un quart de tour (le haut de la carte en haut)
    let pic = out, PW = OW, PH = OH, inner = { x: cw * m, y: ch * m, w: cw, h: ch };
    if (rot) {
      pic = document.createElement('canvas'); pic.width = OH; pic.height = OW; PW = OH; PH = OW;
      const pg = pic.getContext('2d'); pg.translate(OH / 2, OW / 2); pg.rotate(rot * Math.PI / 180); pg.drawImage(out, -OW / 2, -OH / 2);
      inner = { x: ch * m, y: cw * m, w: ch, h: cw };
    }
    // bords exacts de la carte dans la pochette redressée ; sinon la case entière
    let b = null;
    try { b = refineCell(pic, inner); } catch (e) { b = null; }
    // bords trouvés acceptés seulement s'ils sont proches de ceux de la case (sinon on garde la case : plus sûr)
    const near = b && Math.abs(b.x - inner.x) <= inner.w * 0.08 && Math.abs(b.x + b.w - inner.x - inner.w) <= inner.w * 0.08
      && Math.abs(b.y - inner.y) <= inner.h * 0.07 && Math.abs(b.y + b.h - inner.y - inner.h) <= inner.h * 0.07;
    const auto = !!near;
    if (!auto) b = inner;
    else { // petite marge : le bord trouvé est parfois le cadre intérieur, et le numéro est tout en bas de la carte
      const ex = b.w * 0.02, ey = b.h * 0.02;
      const x0 = Math.max(0, b.x - ex), y0 = Math.max(0, b.y - ey);
      b = { x: x0, y: y0, w: Math.min(PW - x0, b.w + 2 * ex), h: Math.min(PH - y0, b.h + 2 * ey) };
    }
    const fw = Math.min(900, Math.round(b.w)), fh = Math.round(fw / (63 / 88));
    const fin = document.createElement('canvas'); fin.width = fw; fin.height = fh;
    fin.getContext('2d').drawImage(pic, b.x, b.y, b.w, b.h, 0, 0, fw, fh);
    // rectangle englobant de la carte dans la page (pour recadrer plus tard)
    const back = ([x, y]) => { // point de « pic » → point de « out »
      if (!rot) return [x, y];
      const dx = x - PW / 2, dy = y - PH / 2, a = -rot * Math.PI / 180;
      return [dx * Math.cos(a) - dy * Math.sin(a) + OW / 2, dx * Math.sin(a) + dy * Math.cos(a) + OH / 2];
    };
    const pts = [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]].map(back).map(([x, y]) => f((x / OW) * (1 + 2 * m) - m, (y / OH) * (1 + 2 * m) - m));
    const bx0 = Math.max(0, Math.min(...pts.map((p) => p[0]))), by0 = Math.max(0, Math.min(...pts.map((p) => p[1])));
    const bx1 = Math.min(NW, Math.max(...pts.map((p) => p[0]))), by1 = Math.min(NH, Math.max(...pts.map((p) => p[1])));
    return { canvas: fin, auto, box: { x: bx0 / NW, y: by0 / NH, w: (bx1 - bx0) / NW, h: (by1 - by0) / NH } };
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
    const pair = (P, len, want, lo = 0.8, hi = 1.12) => {
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
   * Logo « Édition 1 » (petit rond noir marqué « 1 » sous le mot EDITION), sous l'illustration :
   * à gauche (Set de Base, Team Rocket, Gym, Neo…) ou à droite (Jungle, Fossile).
   * On compare chaque endroit possible à un vrai logo (photographié de près), à plusieurs tailles
   * (corrélation normalisée : insensible à la luminosité et au contraste).
   * Mesuré sur de vraies photos : vrai logo 0,91 (carte de 260 px de large) ; cartes sans logo ≤ 0,81.
   */
  const STAMP = { w: 40, h: 32, b64: 'fXd4d3d6e3p7enl6fHx4eHp5eHl2c3Bxc3BwcGpjXltVU1FPT09LRX53d3h4e3x6enl4d3x9eXh6eHZ3d3Jwb3BraWZhWlROR0M/Ojg0My1+dXd6e3x9fXt6eXZ6fXl5enV1eXdxbW5uaWViYV1YUkZBQDs2MjMtfnl6e31+f315fH17fX15endxcHJ0cm9tampoZWNhX1dLREM/OTY3M4B8e318fn59enx+fXx5dnVoV1NWWmhtaWZramhlYV1XT0lGQTw7OTaBfXt9e3t+f319fn12am9xWzwsLTtZZ1lUYmdoZ2FbV1VOS0ZCPj48gH19fXp8gH5+fn18Z0dVb2ZHJCNBX2A/NVNna2ljWFdXVVNQTkZCQ399fn17foB+fn18d1w1OGNxXjAlUGlSKitUbGxoYl5aWFhXVVZQSUyAf319gIGBfHdycnZrRC5NamY2JlNnRyU1WmRaTktVXV5cWlhaV1NUhIF9foOCfG1dTk9fb1owOl5iNSdRZD0mQ1pMNiksQFliYF5bW1lXVoN9e3yBgG9MLCUoNFJgPy9SZTwrUlcuK01PLyMoJS1OZGVkYV9eWl2CfHp9fnldLhUmNCkwUlAxQVpDMktKMkBXOh0vPCsqS2hramZkY15ggn16fn12YTcYIjcyJUZZPDQ7LScyMDFHVjEZMTUmM1Vrbm1qaWRhYYR+e35+enFcOSAhJyhGUi8WDw0PEhEaLj80GiAlNFNobW5ubWtnaGmEgX5+fn19eGVGKCAuPzARCA0bJh4LCxIbKy4xOExhZFtaZW5sZ2dog4J+e3FtdHd0aUw7PykKAwohRVZAEwcIBhc6U0xCQDsyN1BqbWpqboOCfnNYT19fZmJVVUQYAgEKIlFrTBYFAwMLKkc3IRUSGSxNbHFtb3GCfn1wPC5COkZGN0cqCgMCCRhIb1MZBQQGBxk8Nx8KBhEqS2p1dHNyf3x7aDEfIxsjJik3GwYDBQoUQG9YHAUDBggTMDwpDgcOIT9hdXh0cn96eWpALCUeGRcoNxAEBQYIEz9sVhsEBAYHESw7KBwiLThNZHN2dHKEf3x5Z1xSST84PzoPBQUFCBVAalcbBQUGCRQzTEhMV2BkanJ0cnNzg4F+fnt5c25pZGFJFAQDBAcSO2VTGwcHCg4bQGNyeXh5enh2dXNzdYKBgYB/fnt4dXNvWicJAwMIFDljUxwHBwsXLll0eX18fH18dXV1dXaDg4OAfnp3dXRzdGs+EQUECRY9aFsjCgcLHD1penp8eXd6fHl1c3R2g4KCgHx5d3VzdXRxXzEPBgkbPVtdORUKFC9YdXx6eXl5e3p4d3Z0dIOAg4SBfnp0dHd0cG5YJQ0JEyw2MyYWFSlOcHx9fn5+fXx6d3h5dnSEg4OEhYB7dnZ3dHBvak0uGQ8NEhUVHDBKaHx+fYB/fn+AfXh5eXd2g4OBg4N/fXp7enh1dHVwYUc0KiMoM0BVbHyDgX+AfXx+fn55d3l3doSBgISDf4B9fXx7e3l5eXVtZ2RkZGduc3p/gYB/fn18e3t8eXZ5eHiBf4CCgYGCf315eXt5d3d6eXl6fHt8fn59fH6Af319fXx7fHl3fHt9gn+AgYOEgX17enl4d3h5fHx8fn9+f4B+e3t+gH17e36AfXt7e358eoF+gYGAgH17e3t6d3d6fH1+fX5/f39/fHt7fX99e3x+gH57ent8e3g=' };
  let stampPx = null;
  function stampTemplate(w, h) {
    if (!stampPx) { const bin = atob(STAMP.b64); stampPx = new Float32Array(bin.length); for (let i = 0; i < bin.length; i++) stampPx[i] = bin.charCodeAt(i); }
    const t = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const sx = Math.min(STAMP.w - 1.001, (x + 0.5) * STAMP.w / w - 0.5), sy = Math.min(STAMP.h - 1.001, (y + 0.5) * STAMP.h / h - 0.5);
      const x0 = Math.max(0, Math.floor(sx)), y0 = Math.max(0, Math.floor(sy)), fx = Math.max(0, sx - x0), fy = Math.max(0, sy - y0);
      const v = (a, b) => stampPx[b * STAMP.w + a];
      t[y * w + x] = (v(x0, y0) * (1 - fx) + v(x0 + 1, y0) * fx) * (1 - fy) + (v(x0, y0 + 1) * (1 - fx) + v(x0 + 1, y0 + 1) * fx) * fy;
    }
    let m = 0; for (const v of t) m += v; m /= t.length;
    let n = 0; for (let i = 0; i < t.length; i++) { t[i] -= m; n += t[i] * t[i]; }
    n = Math.sqrt(n) || 1; for (let i = 0; i < t.length; i++) t[i] /= n;
    return t;
  }
  function firstEditionStamp(P, only = null) {
    const { W, H, L } = P;
    // sommes cumulées (moyenne et énergie d'une zone en temps constant)
    const I = new Float64Array((W + 1) * (H + 1)), I2 = new Float64Array((W + 1) * (H + 1));
    for (let y = 0; y < H; y++) { let r = 0, r2 = 0; for (let x = 0; x < W; x++) { const v = L[y * W + x]; r += v; r2 += v * v; I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + r; I2[(y + 1) * (W + 1) + x + 1] = I2[y * (W + 1) + x + 1] + r2; } }
    const box = (A, x, y, w, h) => A[(y + h) * (W + 1) + x + w] - A[y * (W + 1) + x + w] - A[(y + h) * (W + 1) + x] + A[y * (W + 1) + x];
    let best = null;
    for (const frac of [0.058, 0.066, 0.075, 0.085]) {
      const w = Math.round(W * frac), h = Math.round(w * STAMP.h / STAMP.w), N = w * h, t = stampTemplate(w, h);
      const zones = only ? [only] : [[0, 0.3], [0.7, 1]];
      for (const [z0, z1] of zones) {
        const X0 = Math.max(0, Math.round(W * z0)), X1 = Math.min(W - w, Math.round(W * z1) - w);
        const Y0 = Math.round(H * 0.42), Y1 = Math.min(H - h, Math.round(H * 0.72) - h);
        for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
          const sm = box(I, x, y, w, h), s2 = box(I2, x, y, w, h), nrm = Math.sqrt(Math.max(0, s2 - sm * sm / N));
          if (nrm < 1e-3 || nrm / Math.sqrt(N) < 12) continue; // zone unie : pas de logo
          let c = 0;
          for (let j = 0; j < h; j++) { const row = (y + j) * W + x, tr = j * w; for (let i = 0; i < w; i++) c += L[row + i] * t[tr + i]; }
          const sc = c / nrm; // la moyenne du modèle est nulle : inutile de retirer celle de la zone
          if (!best || sc > best.score) best = { score: sc, x: x / W, y: y / H, size: frac, side: z0 < 0.5 ? 'gauche' : 'droite' };
        }
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
      try { const b = await fetchImage(officialSrc); if (b) O = cardPixels(await createImageBitmap(b)); } catch (e) { O = null; }
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
      // le même endroit sur le visuel officiel (qui n'a pas le logo) ne doit pas lui ressembler
      const so = O && st ? firstEditionStamp(O, st.side === 'gauche' ? [0, 0.3] : [0.7, 1]) : null;
      info.stamp = st; info.stampOfficial = so;
      const ok = st && st.score >= 0.86 && (!so || so.score < 0.75 || Math.abs(so.y - st.y) > 0.03);
      if (ok) { list.push('firstEdition'); sure.firstEdition = st.score >= 0.9; }
    }
    return { list, sure, info };
  }

  /**
   * Essaie les formats de page connus et garde celui qui colle le mieux.
   * Reconnaît aussi un classeur ouvert en grand (2 pages de 3 × 3 = 18 cartes), cartes droites ou couchées.
   */
  function detectPage(img, formats, current) {
    const res = {}, pre = gridProfiles(img);
    const [c0, r0] = formats[current];
    try { res[current] = detectGrid(img, c0, r0, pre); } catch (e) { res[current] = null; }
    // format habituel bien reconnu : inutile d'essayer les autres (plus rapide)
    if (!res[current] || res[current].fit < 0.72) {
      for (const [k, [cols, rows]] of Object.entries(formats)) { if (k === current) continue; try { res[k] = detectGrid(img, cols, rows, pre); } catch (e) { res[k] = null; } }
    }
    // le format qui explique le mieux les bords des cartes ; celui choisi (3 × 3 d'habitude) garde nettement l'avantage
    let bestK = current;
    for (const k of Object.keys(res)) if (res[k] && (!res[bestK] || res[k].fit > res[bestK].fit + (bestK === current ? 0.2 : 0.03))) bestK = k;
    let out = { fmt: bestK, grid: res[bestK], all: res };
    // double page ?
    if (!res[bestK] || res[bestK].fit < 0.7) {
      let dbl = null; try { dbl = detectDouble(img); } catch (e) { console.warn(e); }
      if (dbl) { res.double = dbl; if (dbl.fit >= 0.55 && (!res[bestK] || dbl.fit > res[bestK].fit + (bestK === current ? 0.05 : 0))) out = { fmt: 'double', grid: dbl, all: res }; }
    }
    return out;
  }

  /**
   * Classeur ouvert (2 pages de 3 × 3) : photo en largeur = pages côte à côte, cartes droites ;
   * photo en hauteur = pages l'une au-dessus de l'autre, cartes couchées (rot = −90 : haut de la carte à droite).
   */
  function detectDouble(img) {
    const NW = img.naturalWidth || img.width, NH = img.naturalHeight || img.height;
    const tall = NH > NW;
    const halves = tall ? [[0, 0, 1, 0.53], [0, 0.47, 1, 0.53]] : [[0, 0, 0.53, 1], [0.47, 0, 0.53, 1]];
    const parts = [];
    for (const [hx, hy, hw, hh] of halves) {
      const k = Math.min(1, 1100 / Math.max(hw * NW, hh * NH));
      const c = document.createElement('canvas'); c.width = Math.round(hw * NW * k); c.height = Math.round(hh * NH * k);
      c.getContext('2d').drawImage(img, hx * NW, hy * NH, hw * NW, hh * NH, 0, 0, c.width, c.height);
      const g = detectGrid(c, 3, 3, gridProfiles(c), tall ? 88 / 63 : 63 / 88);
      if (!g) return null;
      const map = ([x, y]) => [hx + x * hw, hy + y * hh];
      parts.push({ g, cells: g.cells.map((cl) => ({ x: hx + cl.x * hw, y: hy + cl.y * hh, w: cl.w * hw, h: cl.h * hh, quad: cl.quad.map(map) })), box: { x: hx + g.x * hw, y: hy + g.y * hh, w: g.w * hw, h: g.h * hh } });
    }
    const x0 = Math.min(...parts.map((p) => p.box.x)), y0 = Math.min(...parts.map((p) => p.box.y));
    const x1 = Math.max(...parts.map((p) => p.box.x + p.box.w)), y1 = Math.max(...parts.map((p) => p.box.y + p.box.h));
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, fit: Math.min(...parts.map((p) => p.g.fit)), score: parts[0].g.score + parts[1].g.score, extra: 0, cells: [...parts[0].cells, ...parts[1].cells], rot: tall ? -90 : 0, double: true };
  }

  /**
   * Visuel officiel en Blob. Le serveur d'images de TCGdex refuse parfois une requête au hasard
   * (en-tête CORS en double) : on réessaie, puis on tente un autre format (png) ou la taille « high ».
   */
  async function fetchImage(url) {
    const alts = [url, url, url.replace(/\.webp$/, '.png'), url.replace('/low.', '/high.')];
    for (let i = 0; i < alts.length; i++) {
      try { const r = await fetch(alts[i]); if (r.ok) return await r.blob(); if (r.status === 404 && i >= 2) return null; } catch (e) { /* on réessaie */ }
      await new Promise((res) => setTimeout(res, 120 * (i + 1)));
    }
    return null;
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
    let top = (await w.recognize(band(img, 0.02, 0.14, 2.5))).data.text || '';
    // 2e lecture du nom avec les contours renforcés (photos un peu floues, pages de classeur)
    top += '\n' + ((await w.recognize(band(img, 0.02, 0.13, 2.5, 'unsharp', 0, 0.8))).data.text || '');
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
    // « Évolution de Machopeur », « Placez Mackogneur sur… », « Evolves from … » : ce n'est pas le nom de la carte
    const noEvo = (l) => l.replace(/[ÉE]volution\s+d[e'’]\s*\S+/gi, ' ').replace(/Evolves\s+from\s+\S+/gi, ' ').replace(/Placez\s+\S+(\s+sur)?/gi, ' ').replace(/Put\s+\S+\s+on/gi, ' ');
    const toLines = (t) => t.split('\n').map((l) => noEvo(l).trim()).filter((l) => /[a-zA-ZÀ-ÿ]{3,}/.test(l));
    const lines = [...toLines(top), ...toLines(full).slice(0, 6)];
    const stop = new Set(['base', 'niveau', 'stade', 'pokemon', 'pv', 'hp', 'evolue', 'illus', 'faiblesse', 'resistance', 'retraite', 'talent', 'dresseur', 'supporter', 'objet', 'energie', 'nintendo', 'creatures', 'game', 'freak', 'the', 'and', 'souris', 'pass']);
    const words = [...new Set(lines.join(' ').split(/[^a-zA-ZÀ-ÿ\-]+/).filter((w) => w.length >= 4 && !stop.has(norm(w))))];
    // année du copyright en bas de carte (« ©1999 Wizards », « ©2016 Pokémon ») : départage une carte et sa réimpression
    const years = new Set();
    for (const m of (bottom + '\n' + full).matchAll(/(?:^|[^\d])((?:19|20)\d\d)(?!\d)/g)) { const y = +m[1]; if (y >= 1995 && y <= new Date().getFullYear() + 1) years.add(y); }
    const wizards = /wizard/i.test(bottom + ' ' + full);
    // carte d'un autre jeu (Dragon Ball, Star Wars, One Piece, Wankul…) : mots typiques, et aucun mot typique d'une carte Pokémon
    const T = `${top}\n${bottom}\n${full}`;
    const OTHER = [/bandai/i, /\bBT\d{1,2}\s*[-‐–]\s*\d{2,3}/i, /dragon\s*ball/i, /\bLFL\b/, /\bFFG\b/, /\bSOR\s*[•·.*]?\s*(FR|EN)\b/i, /star\s*wars/i, /unlimited/i, /wankul/i, /konami/i, /yu-?gi-?oh/i, /lorcana/i, /disney/i, /one\s*piece/i, /\bOP\d{2}\s*-\s*\d{3}/i, /\bmagic\b/i, /wizards\s+of\s+the\s+coast/i, /digimon/i, /\bsaiyan/i,
      /\b(son\s*)?(goku|gok[uû]|gohan|goten|vegeta|trunks|broly|piccolo|krilin|freezer|kamesennin|janemba|zenkai)\b/i, /\b(unit[ée]s?|terrestre|spatiale|am[ée]lioration|rebelle|imp[ée]rial|wookie|jedi|[ée]v[ée]nement|prot[ée]g[ée]e)\b/i];
    const POKE = [/\b(PV|HP)\s*\d{2,3}\b/, /\b\d{2,3}\s*(PV|HP)\b/, /pok[eé]mon/i, /nintendo/i, /game\s*freak/i, /faiblesse/i, /weakness/i, /r[ée]sistance/i, /retraite/i, /retreat/i];
    const neg = OTHER.filter((r) => r.test(T)).length, pos = POKE.filter((r) => r.test(T)).length;
    const otherGame = neg >= 1 && pos === 0 || neg >= 2 && pos <= 1;
    // points de vie lus en haut (« 60 PV », « PV 120 », « HP 90 ») : départagent une carte et sa réimpression (ex. Évolutions)
    const hpM = fix(top).match(/(\d{2,3})\s*P\s*V\b|\bP\s*V\s*(\d{2,3})|\bHP\s*(\d{2,3})|(\d{2,3})\s*HP\b/);
    const hp = hpM ? parseInt(hpM[1] || hpM[2] || hpM[3] || hpM[4], 10) : null;
    return { num: ranked[0] || null, alt: ranked.slice(1, 3), lines, words, years: [...years], wizards, otherGame, hp: hp && hp >= 30 && hp <= 340 && hp % 10 === 0 ? hp : null, raw: { bottom, full } };
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

  /**
   * Pochette vide ? Image presque uniforme, ou reflets du plastique sans détails ni couleurs
   * (mesuré : pochettes vides ≤ 8 de « détails », cartes ≥ 8 et bien plus colorées).
   */
  async function looksEmpty(blob) {
    const v = (await thumb(blob)).subarray(0, 24 * 33);
    let m = 0; for (const x of v) m += x; m /= v.length;
    let s = 0; for (const x of v) s += (x - m) ** 2;
    if (Math.sqrt(s / v.length) < 14) return true;
    const bmp = await createImageBitmap(blob);
    const W = 60, H = 84, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bmp, 0, 0, W, H);
    const d = g.getImageData(0, 0, W, H).data, L = new Float32Array(W * H);
    let sat = 0;
    for (let i = 0; i < W * H; i++) { const r = d[i * 4], gg = d[i * 4 + 1], b = d[i * 4 + 2], mx = Math.max(r, gg, b), mn = Math.min(r, gg, b); L[i] = 0.299 * r + 0.587 * gg + 0.114 * b; sat += mx ? (mx - mn) / mx : 0; }
    sat /= W * H;
    let gx = 0, gy = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W - 1; x++) gx += Math.abs(L[y * W + x + 1] - L[y * W + x]);
    for (let y = 0; y < H - 1; y++) for (let x = 0; x < W; x++) gy += Math.abs(L[(y + 1) * W + x] - L[y * W + x]);
    const grad = gx / (H * (W - 1)) + gy / ((H - 1) * W);
    looksEmpty.last = { grad, sat };
    return grad < 8 || (grad < 13 && sat < 0.1);
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
      const tryUrl = (u) => fetchImage(u);
      officialThumbs.set(src, (async () => {
        let b = await tryUrl(src);
        if (!b && /assets\.tcgdex\.net\/(?!en\/)[a-z-]+\//.test(src)) b = await tryUrl(src.replace(/assets\.tcgdex\.net\/[a-z-]+\//, 'assets.tcgdex.net/en/'));
        return b ? createImageBitmap(b).then((bmp) => artVec(trimBackground(bmp))).catch(() => null) : null;
      })());
    }
    return officialThumbs.get(src);
  }

  /**
   * Dos de carte Pokémon ? On compare la photo à un vrai dos (moyenne de dos photographiés en pochette),
   * en petit et en couleurs, avec un peu de décalage et de zoom permis (carte mal centrée dans sa pochette).
   * Mesuré : dos 0,86 à 0,93 ; recto, pochette vide ou autre jeu ≤ 0,49.
   */
  const BACK = { w: 24, h: 33, b64: 'aHiIYnKHaHeKdX+Odn6MfYOPg4qUi4+YlJadmJqfm52gmZuelJaalpicn6CioaKin6CioKKjoaKkn5+ioKGjnJ2hgoiTg4aLZnKBZnKBcXqEfoKIgYOIhYiPh4yUjJCXkZKWkpOVlJaXlJSWlZOSmZiVm5uZm5mXl5aYlZebmJqdm5yen6ChnJ2gg4iSgoWJaXF8eHp9lop4qpN1qJJ3lo2Ei4iLjomJnpCAo5N/n5OBmZGFm5GEnJKFoZODrJd9oZWElJGMlJCMkI2JlpGLkpKUf4OKgIKFa3J8gn96qZJwuZltspVxoI57k4uCmot9sZd0uZtxrJZ4qZV6pZR8qJV7sph3wp9vtJp1oZJ8opB7oI11pY9ykouBf359fX6BZW96b3Z9kIR2rZVvqpFypZF3p5N4rpV0tZdxtplxrZZ2r5d3r5h3rJZ5rpV4tplws5hxrpR0rpNxtJRqrJFsnI57gH17fn+BYm16aHF+f319oo90oI10oo52rpR0r5Z1ppF4oZB9nZCBnI+Alo2Ek4yIkomDlYl8m4p4pI50q5BvsJBpooxwnI98e3t+fH6BYGt4aXOBen6FkId8lId6kIiBl46GmZKKmZSQnJqYm5qbkZGUjIyUjZCXiIqRgIGIe3qAfnt8g3t4jX5yiX52i4R7cnV+d3p/X2p3Z3F+dXyJe32Eg4KIj5CWoKCiq6uorq6rr66uqKeqmpuhkpOajJCZgIaTcnuIa3OCaHB9Z255aWx3am14bXB6ZGx7cHN6Xmp4Y257b3mJdn+NgIeUmZuhsrGuvbuzvrmyubOts6ilrJ+cqJmYoZWXj4yTen+NanWJYnKGYG6CXGl9WGR2VmJ0U2B0Y2pyXWl4ZG99bXiJeIKQipCYqaqov7uywrqwva6ks5ePqoV/qn12sn12u4R9tYqHn42ShIeUbn2TYnSOWm2HU2V8T2B2Tl1zXmZvYG17bXeEcn2LgYmToKKiurivxLyvwaugtY2EpHhwnnRso3For3BmwXdryYB1voWApIuOhomXbXySXG+KU2aATmB5Tl51XWZwanWDe4OOgoqTlJicsbCqwb2wxLKkvJaKqIB1ln90moV5ooB1q3VquHRoxHdrxXpwt4N+n4yQgoeUZnWLVGeATmJ7TV11XWZwc3uHi4+VlJico6WkubatwbmqvKaYrY6CmYl/jo6GjImAlIR5qYl8tIV3uX5xvHlutX92q4qFkouPdnyJXGl9T2B3TF1zXmdwcnmFj5OWnZ6gqqmmurisvLeos6mcqKCTlpePipOOgoV+jIh7qqCPuamXvKWSuZiIsI6BrJCGm4+Ng4WKaG99VV9xUFtuX2RsaHF9hImQlpibqKilurisvrqrtbChpqKVjI6Fe396fHx1jop+p6KStbCevLWhu7Ges6WVr6OWpJuVkZCTen2FYmh2WmFvZGRpXGZzcXiCgoaNnJ2ctbOpwb2uvbmpsq6enpyPjYyCkY2CoJuNsKuavbikwr2pvbmmsKycraibp6SanZuajY6Rc3d/ZWl2aWlsVmFvYWx5b3eBiY2Rqamju7isvbmotrGhq6eZn5qNoJuNqaSUtrKfwr6qyMOuwLypsa2dr6ueqaacpqSfnJuZgIKJb3J9cHByU15tWWZ1Y258d36HmJqZr62ltLCjrKiao5+RnZmMoJuNqaSTtrGewbyoxcCsv7qnsa2fs6+iqqeepqOfm5qZf4GJb3N/d3Z2Ul1uV2R1W2h5Z3F9goaLnp6aqqeepaGWnJiMl5SHm5aJpKCQsayau7ajvbiltrGhs66gs66gp6Sdm5mXjY2RdXiBaW55d3V1UV5wV2V4WWh6Xmp6anR+g4eKl5eUnJqVl5WNko+GlJCFnZmLqaSUsaycsaydsayes66gr6ugn5yXjIuMfH6DZWp2YWZ0cG5vUF1xVWN2WWd6W2h7X2t6aXB8en6DiIqNj4+OjYyIjYqEk5CHnZmPpaCWqqWar6ugsq2iqqefkpCPgICEbW93W19tXGBvaGdqVF90VmJ0V2N2WWV4XGh6X2l5ZGt4bXR/d32FgYSJh4iKkI+OnJmWp6Ocrqqhs66krquhnJqXh4aIdXd/YWZxVlxqVl1rZGRnXmZ6YGh4XmZ2XGR1W2Z3XGd4X2d4X2l5Ymx7aXF+dXuGh4mOnZqcqqeir6ukrKehoJ6ZjIuLfnx/bG55XWJvVV1rVFtsYWNmb3SFdXaBeHR0c21uZ2lxZGl1Zmp4ZWt7Zm+AbXOBdnqGg4OKlZKToJuYoJqVmpSNjYaCg315fXRub2xuZWRpVl1qUltsYGNnfH+LiYKBnIZsl35liHdpg3Ztg3dxeXV3dXZ+e3p+fXp/h399kIV7kYZ8k4Z5mIVvkX5qkX1kjXdgd21lcWliWl5lUVpqYWNmhIOLmIl6rYxkqodepIVhoYVlmoNplYBqkX9tkH9vj31tmIFqmINon4ZloYZio4ZgmoFil35gnH9bhnRge29gZWNhVFpnYmNkhYOGnIp0p4plpoZfoIRkmoNpoYdosY1frIpgnYRmm4JlnoRjooVgpIZhp4ddnINhj31mk31jnIBclntchXNedGpdX2BkZWRjg4KFlYl7l4dzl4RsjH5xjIJ4nolxr41io4hik4Bqj39rk39omYNnnINlmYJjjn5ognhvhHdrk3xinH9ainZeeW5cbGZfbGdgj46SmZWTmZOPlI6IjoqKkYyLlYuCmIl3kYZ6ioN7hX54hHx1iX92iYB2g3x1fnp6e3h7e3V0f3dufHFkcWpjZWNjW1xiZWJekpGVn5ycoZ2dnpqbmpiamZeZlpSVl5STlpOUj42NhIKEg4GChIWJhISLfn+IeXyHc3aCaW55aGt1W2FpWF5nVFtnUlhkZGRhi4qQk5GVlpSYlJOXkpGWkZGXkpGXkpKYkJGViYqQhISMgoSLg4WOf4GLdnmFb3SBZGp4XWVzWmBvUlpnVFxpUFlpUlpnaGhldnqFd3uHdnqHdXqHdHmHc3mHdHmIdXqJdHqHcXiFcXaEbnWCbXOCaG99Ymp5XGV0VF5wVV9uU1tsUVtqU11sUVxrVl5qbG1qXmh5W2R2WWN1V2J1VmJ1VmJ1VmJ2VmN2VmR1VmV2WWV3WGR2VmJ0VGFyU2BxUF5vT11vU2BvV2FwV2NwV2RxWWNyX2dwcnNx' };
  let backRef = null;
  const normRGB = (px, n) => {
    const v = new Float32Array(n * 3);
    for (let k = 0; k < 3; k++) {
      let m = 0; for (let i = 0; i < n; i++) m += px[i * 3 + k]; m /= n;
      let sd = 0; for (let i = 0; i < n; i++) sd += (px[i * 3 + k] - m) ** 2; sd = Math.sqrt(sd / n) || 1;
      for (let i = 0; i < n; i++) v[k * n + i] = (px[i * 3 + k] - m) / sd;
    }
    return v;
  };
  async function backScore(blob) {
    if (!backRef) { const bin = atob(BACK.b64), a = new Float32Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); backRef = normRGB(a, BACK.w * BACK.h); }
    const bmp = await createImageBitmap(blob);
    const W = BACK.w, H = BACK.h, n = W * H, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true }); g.filter = 'blur(0.6px)';
    let best = -1;
    for (const sc of [0.78, 0.84, 0.9]) for (const dx of [-0.05, 0, 0.05]) for (const dy of [-0.05, 0, 0.05]) {
      const bw = bmp.width * sc, bh = bmp.height * sc;
      g.clearRect(0, 0, W, H);
      g.drawImage(bmp, bmp.width * (0.5 + dx) - bw / 2, bmp.height * (0.5 + dy) - bh / 2, bw, bh, 0, 0, W, H);
      const d = g.getImageData(0, 0, W, H).data, px = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { px[i * 3] = d[i * 4]; px[i * 3 + 1] = d[i * 4 + 1]; px[i * 3 + 2] = d[i * 4 + 2]; }
      const v = normRGB(px, n); let s = 0; for (let i = 0; i < v.length; i++) s += v[i] * backRef[i];
      s /= v.length; if (s > best) best = s;
    }
    return best;
  }
  async function looksLikeBack(blob) { return (await backScore(blob)) >= 0.6; }

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
  async function rank(list, num, lines, mine, { cap = 30, visualWeight = 1.5, needName = false, years = [], wizards = false, hp = null } = {}) {
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
      // numéro lu avec un chiffre de trop devant (« 38/102 » pour « 8/102 » : étoile ou symbole lu comme un chiffre)
      const ln = parseInt(c.localId, 10);
      const numOk = !!num && (ln === num.n || (num.n >= 10 && ln === num.n % (num.n >= 100 ? 100 : 10) && num.of && c.set && c.set.cardCount && c.set.cardCount.official === num.of));
      const ofOk = !!num && !!(c.set && c.set.cardCount) && c.set.cardCount.official === num.of;
      if (needName && !numOk && nameScore < 0.35) continue;
      const yr = c.set && c.set.releaseDate ? parseInt(c.set.releaseDate, 10) : 0;
      const yearOk = !!yr && (years.includes(yr) || years.includes(yr - 1));
      const eraOk = wizards && !!yr && yr <= 2003;
      const hpOk = hp && c.hp ? (c.hp === hp ? 0.3 : -0.15) : 0;
      uniq.set(c.id, { ...c, nameScore, numOk, ofOk, yearOk, hpOk: hpOk > 0, hpBonus: hpOk, visual: null, score: nameScore + (numOk && ofOk ? 1.2 : numOk ? 0.4 : ofOk ? 0.2 : 0) + (yearOk ? 0.6 : 0) + (eraOk ? 0.4 : 0) + hpOk });
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

  async function findCandidates({ num, alt = [], words, lines, years = [], wizards = false, hp = null }, blob) {
    const A = ad();
    let byNum = [];
    if (num) byNum = await A.findByNumber(num.n, num.of).catch(() => []);
    if (num && num.n >= 10 && num.of) byNum = [...byNum, ...(await A.findByNumber(num.n % (num.n >= 100 ? 100 : 10), num.of).catch(() => []))];
    for (const a of alt) { if (byNum.length) break; byNum = await A.findByNumber(a.n, a.of).catch(() => []); if (byNum.length) num = a; }
    const mine = blob ? await artVariants(blob).catch(() => null) : null;
    let out = await rank(byNum, num, lines, mine, { years, wizards, hp });
    // numéro absent, ou carte trouvée qui ne ressemble pas à la photo → on cherche aussi par le nom
    const weak = !out.length || (mine && (out[0].visual == null || out[0].visual < 0.55));
    if (weak && words.length) {
      status('Recherche par le nom…');
      const byName = await nameSearch(words);
      out = await rank([...byNum, ...byName], num, lines, mine, { cap: 100, visualWeight: 3, needName: true, years, wizards, hp });
    }
    // « sûre » : bon numéro ET bon total, ou photo très ressemblante
    // (sans visuel officiel à comparer, le numéro seul ne suffit pas : une lecture de travers donne vite « 10/10 »)
    for (const c of out) c.confident = (c.numOk && c.ofOk && c.visual != null && c.visual > 0.4) || (c.visual != null && c.visual >= 0.75 && (c.margin ?? 1) >= 0.06);
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
      const out = await rank(list, num, info.lines, mine, { cap: 500, visualWeight: 3, hp: info.hp });
      // (les PV lus départagent le classement, mais ne rendent jamais une carte « sûre »)
      const second = out[1] ? out[1].score - (out[1].hpBonus || 0) : 0;
      for (const c of out) {
        c.confident = (c.numOk && c.visual != null && c.visual > 0.4)
          || (c.visual != null && c.visual >= 0.72 && (c.margin ?? 1) >= 0.05)
          || (c === out[0] && c.visual != null && c.visual >= 0.62 && (c.margin ?? 0) >= 0.12 && c.score - (c.hpBonus || 0) - second > 0.3); // nettement devant les autres
      // (mesuré sur une page de 18 cartes : une mauvaise carte peut atteindre 0,59 de ressemblance avec 0,17 d'avance)
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

  return { get lastVariants() { return lastVariants; }, recognize, read, inSet, manual, resemblance, resemblanceMany, readSummary, addScanned, looksEmpty, looksLikeBack, backScore, looksLikePage, locateCard, refineCell, detectGrid, detectVariants, firstEditionStamp, foilIn, cardPixels, detectPage, detectDouble, cellCard, _gridProfiles: gridProfiles, stop, RATIO: 63 / 88 };
})();
