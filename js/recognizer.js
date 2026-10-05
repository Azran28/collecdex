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
    // version figée + empreinte : le navigateur refuse le fichier s'il a été modifié sur le CDN
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
    s.integrity = 'sha384-GJqSu7vueQ9qN0E9yLPb3Wtpd7OrgK8KmYzC8T1IysG1bcvxvIO4qtYR/D3A991F';
    s.crossOrigin = 'anonymous';
    s.onload = () => resolve(window.Tesseract);
    s.onerror = () => reject(new Error('Impossible de charger le module de lecture (connexion internet ?)'));
    document.head.appendChild(s);
  });
  const traduire = (s) => ({ 'loading tesseract core': 'Chargement du lecteur', 'initializing tesseract': 'Initialisation', 'loading language traineddata': 'Chargement du français', 'initializing api': 'Préparation' }[s] || s);
  const status = (msg) => { if (onStatus) onStatus(msg); };

  /**
   * Lecteurs de texte : 2 en même temps quand l'appareil a assez de cœurs (téléphones récents, PC) ;
   * worker.recognize(image) prend le premier lecteur libre.
   */
  async function getWorker() {
    if (worker) return worker;
    if (!workerP) {
      workerP = (async () => {
        const T = await loadTesseract();
        const opts = { logger: (m) => { if (m.status && m.status !== 'recognizing text') status(`${traduire(m.status)} ${m.progress ? Math.round(m.progress * 100) + ' %' : ''}`); } };
        const n = (navigator.hardwareConcurrency || 2) >= 4 ? 2 : 1;
        const ws = await Promise.all(Array.from({ length: n }, (_, i) => T.createWorker('fra', 1, i ? {} : opts)));
        const busy = ws.map(() => false), psm = ws.map(() => '3'), queue = [];
        let jobs = 0, retired = false;
        const pump = () => {
          for (let i = 0; i < ws.length; i++) {
            if (busy[i] || !queue.length) continue;
            const job = queue.shift(); busy[i] = true; jobs++;
            // mode de découpe du texte : '3' automatique (par défaut), '6' un seul bloc (zone des attaques)
            const want = job.psm || '3';
            const ready = psm[i] === want ? Promise.resolve() : ws[i].setParameters({ tessedit_pageseg_mode: want }).then(() => { psm[i] = want; });
            ready.then(() => ws[i].recognize(job.img)).then(job.res, job.rej).finally(() => { busy[i] = false; pump(); recycle(); });
          }
        };
        // les lecteurs Tesseract s'encrassent à la longue (mesuré : 0,55 s → 4,6 s par carte après quelques centaines
        // de lectures) : après 300 lectures, dès qu'ils sont au repos, on les remplace par des neufs
        const recycle = () => {
          if (retired || jobs < 300 || queue.length || busy.some(Boolean)) return;
          retired = true;
          if (worker === pool) { worker = null; workerP = null; }
          ws.forEach((w) => w.terminate());
        };
        const pool = {
          size: n,
          recognize: (img, psm) => new Promise((res, rej) => { if (retired) { getWorker().then((w) => w.recognize(img, psm)).then(res, rej); return; } queue.push({ img, psm, res, rej }); pump(); }),
          terminate: () => ws.forEach((w) => w.terminate()),
        };
        worker = pool;
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
   * Détourage d'une carte seule (caméra, rafale) : on trouve ses 4 bords, même un peu penchés ou en perspective,
   * puis on la remet à plat AU RAS de ses bords (plus de table ni de marge autour).
   * Chaque bord : sur chaque ligne (ou colonne), le premier contraste net en venant de l'extérieur,
   * puis une droite ajustée en ignorant les points aberrants (reflets, doigts). Les 4 droites se coupent aux coins.
   * rect : zone où se trouve la carte (fractions de l'image). Renvoie { canvas, quad, fit } ou null si pas sûr.
   * expect : quadrilatère attendu (fractions ; ex. la pochette trouvée par la grille) → on ne garde que des bords
   *   proches de lui (±12 %), le plus proche l'emporte : pas de bord de pochette voisine ni de reflet lointain.
   * warp = false : seulement les coins (quad), sans image remise à plat.
   */
  function cutCard(img, rect = { x: 0, y: 0, w: 1, h: 1 }, { expect = null, warp = true, sizeCheck = null } = {}) {
    const NW = img.naturalWidth || img.width, NH = img.naturalHeight || img.height;
    // zone de recherche : la zone donnée + 8 % (la carte peut dépasser un peu du cadre jaune) ;
    // + 14 % autour d'une case de classeur (la grille, régulière, peut être décalée d'une rangée à l'autre)
    const mg = expect ? 0.14 : 0.08;
    const ax = Math.max(0, (rect.x - rect.w * mg) * NW), ay = Math.max(0, (rect.y - rect.h * mg) * NH);
    const aw = Math.min(NW - ax, rect.w * (1 + 2 * mg) * NW), ah = Math.min(NH - ay, rect.h * (1 + 2 * mg) * NH);
    const S = 320 / Math.max(aw, ah), w = Math.max(40, Math.round(aw * S)), h = Math.max(40, Math.round(ah * S));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.filter = 'grayscale(1) blur(0.8px)';
    g.drawImage(img, ax, ay, aw, ah, 0, 0, w, h);
    const px = g.getImageData(0, 0, w, h).data, G = new Float32Array(w * h);
    for (let i = 0; i < G.length; i++) G[i] = px[i * 4];
    const at = (x, y) => G[y * w + x];
    // mêmes pixels en couleurs (pour reconnaître la bordure de la carte)
    let Cp = null;
    if (expect) { const cc = document.createElement('canvas'); cc.width = w; cc.height = h; const cg = cc.getContext('2d', { willReadFrequently: true }); cg.drawImage(img, ax, ay, aw, ah, 0, 0, w, h); Cp = cg.getImageData(0, 0, w, h).data; }
    const col = (x, y) => { const xi = Math.min(w - 1, Math.max(0, Math.round(x))), yi = Math.min(h - 1, Math.max(0, Math.round(y))), i = (yi * w + xi) * 4; return [Cp[i], Cp[i + 1], Cp[i + 2]]; };
    /**
     * Bordure d'une carte : juste À L'INTÉRIEUR du vrai bord, une bande d'une seule couleur tout autour (jaune, argent…),
     * qui tranche avec ce qu'il y a juste à l'extérieur. Le bord d'une pochette (plastique des deux côtés) ou le cadre
     * intérieur de la carte (dessin ou texte à l'intérieur) n'ont pas cette signature.
     */
    function borderScore(q) {
      const cx = (q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4, cy = (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4;
      const qw = (dist(q[0], q[1]) + dist(q[3], q[2])) / 2, d = qw * 0.022;
      const mean = (L) => [0, 1, 2].map((k) => L.reduce((a, p) => a + p[k], 0) / L.length);
      const allIn = [], per = [];
      // côté par côté : un seul côté faux (ex. le haut coupé à la barre du nom) doit faire baisser la note
      for (let s = 0; s < 4; s++) {
        const A = q[s], B = q[(s + 1) % 4], ins = [], outs = [];
        for (let t = 0.1; t < 0.92; t += 0.06) {
          const x = A[0] + (B[0] - A[0]) * t, y = A[1] + (B[1] - A[1]) * t;
          const nx = cx - x, ny = cy - y, nl = Math.hypot(nx, ny) || 1;
          ins.push(col(x + nx / nl * d, y + ny / nl * d)); outs.push(col(x - nx / nl * d, y - ny / nl * d));
        }
        const mi = mean(ins), mo = mean(outs);
        const sd = Math.sqrt(ins.reduce((a, p) => a + (p[0] - mi[0]) ** 2 + (p[1] - mi[1]) ** 2 + (p[2] - mi[2]) ** 2, 0) / ins.length / 3);
        per.push(Math.hypot(mi[0] - mo[0], mi[1] - mo[1], mi[2] - mo[2]) / (25 + sd));
        allIn.push(mi);
      }
      // la bordure a la même couleur sur les 4 côtés
      const m4 = mean(allIn), spread = Math.sqrt(allIn.reduce((a, p) => a + (p[0] - m4[0]) ** 2 + (p[1] - m4[1]) ** 2 + (p[2] - m4[2]) ** 2, 0) / 4 / 3);
      borderScore.last = { per: per.map((v) => Math.round(v * 100) / 100), spread: Math.round(spread) };
      return (per.reduce((a, b) => a + b, 0) / 4 + Math.min(...per)) / 2 - spread / 60;
    }
    // contraste horizontal (bords gauche/droite) ou vertical (haut/bas), lissé sur 3 pixels le long du bord
    const gx = (x, y) => Math.abs((at(x + 1, y - 1) + at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + at(x - 1, y) + at(x - 1, y + 1))) / 3;
    const gy = (x, y) => Math.abs((at(x - 1, y + 1) + at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + at(x, y - 1) + at(x + 1, y - 1))) / 3;
    // points candidats d'un bord : sur chaque ligne (ou colonne), les contrastes nets (maxima locaux)
    // dans le tiers extérieur de la zone
    function edge(side) {
      const pts = [], vert = side === 'L' || side === 'R';
      const along = vert ? h : w, across = vert ? w : h, out = side === 'L' || side === 'T';
      const lim = Math.round(across * 0.36);
      for (let t = Math.round(along * 0.1); t < along * 0.9; t += 2) {
        const vals = [0];
        for (let k = 1; k < lim; k++) { const p = out ? k : across - 1 - k; vals.push(vert ? gx(p, t) : gy(t, p)); }
        const m = Math.max(...vals); if (m < 14) continue;
        for (let k = 2; k < vals.length - 1; k++) {
          if (vals[k] >= Math.max(12, m * 0.35) && vals[k] >= vals[k - 1] && vals[k] > vals[k + 1]) {
            const p = out ? k : across - 1 - k;
            pts.push({ s: t, v: p, wgt: vals[k] });
          }
        }
      }
      return pts;
    }
    // quelques droites robustes par côté (le bord de la carte, mais aussi celui de la pochette, d'une carte voisine…)
    // vert → x = a·y + b ; sinon y = a·x + b
    function lines(pts, along) {
      const found = [];
      let rest = pts, seed = 12345;
      const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
      const nLines = Math.round((along * 0.8) / 2); // nombre de lignes de mesure
      for (let pass = 0; pass < 4 && rest.length >= 12; pass++) {
        let best = null;
        for (let it = 0; it < 120; it++) {
          const p = rest[Math.floor(rnd() * rest.length)], q = rest[Math.floor(rnd() * rest.length)];
          if (Math.abs(q.s - p.s) < along * 0.3) continue;
          const a = (q.v - p.v) / (q.s - p.s); if (Math.abs(a) > 0.25) continue;
          const b = p.v - a * p.s;
          const inl = rest.filter((o) => Math.abs(o.v - (a * o.s + b)) <= 1.8);
          const span = new Set(inl.map((o) => o.s)).size;
          if (!best || span > best.span) best = { a, b, inl, span };
        }
        if (!best || best.span < nLines * 0.3) break;
        const n = best.inl.length; let sx = 0, sy = 0, sxx = 0, sxy = 0;
        for (const o of best.inl) { sx += o.s; sy += o.v; sxx += o.s * o.s; sxy += o.s * o.v; }
        const den = n * sxx - sx * sx; const a = den ? (n * sxy - sx * sy) / den : best.a, b = (sy - a * sx) / n;
        found.push({ a, b, frac: best.span / nLines });
        rest = rest.filter((o) => !best.inl.includes(o));
      }
      return found;
    }
    const Ls = lines(edge('L'), h), Rs = lines(edge('R'), h), Ts = lines(edge('T'), w), Bs = lines(edge('B'), w);
    if (!Ls.length || !Rs.length || !Ts.length || !Bs.length) return null;
    // coin = croisement d'un bord vertical (x = a·y + b) et d'un bord horizontal (y = c·x + d)
    const cross = (V, H) => { const x = (V.a * H.b + V.b) / (1 - V.a * H.a); return [x, H.a * x + H.b]; };
    const dist = (p, r) => Math.hypot(p[0] - r[0], p[1] - r[1]);
    // bords attendus (pochette de la grille), en coordonnées de la petite image : milieu de chaque côté
    const E = expect ? expect.map(([x, y]) => [(x * NW - ax) * S, (y * NH - ay) * S]) : null;
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const EM = E && { L: mid(E[0], E[3]), R: mid(E[1], E[2]), T: mid(E[0], E[1]), B: mid(E[3], E[2]), w: (dist(E[0], E[1]) + dist(E[3], E[2])) / 2, h: (dist(E[0], E[3]) + dist(E[1], E[2])) / 2 };
    // la combinaison de 4 bords qui forme le mieux une carte (proportions 63 × 88, bords bien marqués, assez grande)
    let pick = null;
    for (const L of Ls) for (const R of Rs) for (const T of Ts) for (const B of Bs) {
      const q = [cross(L, T), cross(R, T), cross(R, B), cross(L, B)];
      const qw = (dist(q[0], q[1]) + dist(q[3], q[2])) / 2, qh = (dist(q[0], q[3]) + dist(q[1], q[2])) / 2;
      const ratio = qw / qh / (63 / 88);
      if (ratio < 0.9 || ratio > 1.1 || qh < rect.h * NH * S * 0.6 || Math.min(L.frac, R.frac, T.frac, B.frac) < 0.3) continue;
      let score;
      if (EM) {
        // écart de chaque bord trouvé au bord attendu, en fraction de la taille de la carte
        const dv = [Math.abs(L.a * EM.L[1] + L.b - EM.L[0]) / EM.w, Math.abs(R.a * EM.R[1] + R.b - EM.R[0]) / EM.w,
          Math.abs(T.a * EM.T[0] + T.b - EM.T[1]) / EM.h, Math.abs(B.a * EM.B[0] + B.b - EM.B[1]) / EM.h];
        if (Math.max(...dv) > 0.16) continue;
        // taille imposée (une carte fait toujours la même taille sur la page redressée)
        let sdev = 0;
        if (sizeCheck) { sdev = sizeCheck(q.map(([x, y]) => [(ax + x / S) / NW, (ay + y / S) / NH])); if (sdev > 0.05) continue; }
        const bs = borderScore(q);
        score = (L.frac + R.frac + T.frac + B.frac) * 0.5 - Math.abs(Math.log(ratio)) * 6 - (dv[0] + dv[1] + dv[2] + dv[3]) * 2 + bs * 3 - sdev * 20;
        if (!pick || score > pick.score) pick = { q, score, qw, qh, fit: Math.min(L.frac, R.frac, T.frac, B.frac), border: borderScore.last };
        continue;
      } else {
        // à forme égale, le plus GRAND rectangle : le bord extérieur de la carte, pas le cadre jaune à l'intérieur
        score = (L.frac + R.frac + T.frac + B.frac) * 0.5 - Math.abs(Math.log(ratio)) * 6 + (qw * qh) / (w * h) * 4;
      }
      if (!pick || score > pick.score) pick = { q, score, qw, qh, fit: Math.min(L.frac, R.frac, T.frac, B.frac) };
    }
    if (!pick || pick.fit < 0.3) return null;
    const q = pick.q.map(([x, y]) => [ax + x / S, ay + y / S]);
    const qw = pick.qw / S;
    if (q.some(([x, y]) => x < -2 || y < -2 || x > NW + 2 || y > NH + 2)) return null;
    const quad = q.map(([x, y]) => [x / NW, y / NH]);
    if (!warp) return { quad, fit: pick.fit, border: pick.border };
    return { canvas: warpQuad(img, q, Math.min(900, Math.round(qw))), quad, fit: pick.fit };
  }

  /** Remet à plat le quadrilatère q (pixels de l'image, coins HG, HD, BD, BG) en une carte de largeur fw, liseré e retiré */
  function warpQuad(img, q, fw, e = 0.004) {
    const NW = img.naturalWidth || img.width, NH = img.naturalHeight || img.height;
    const f = squareToQuad(q), fh = Math.round(fw * 88 / 63);
    const bx0 = Math.max(0, Math.floor(Math.min(...q.map((p) => p[0])))), by0 = Math.max(0, Math.floor(Math.min(...q.map((p) => p[1]))));
    const bx1 = Math.min(NW, Math.ceil(Math.max(...q.map((p) => p[0])))), by1 = Math.min(NH, Math.ceil(Math.max(...q.map((p) => p[1]))));
    const SW = Math.max(1, bx1 - bx0), SH = Math.max(1, by1 - by0);
    const sc = document.createElement('canvas'); sc.width = SW; sc.height = SH;
    sc.getContext('2d').drawImage(img, bx0, by0, SW, SH, 0, 0, SW, SH);
    const src = sc.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, SW, SH).data;
    const out = document.createElement('canvas'); out.width = fw; out.height = fh;
    const og = out.getContext('2d'), od = og.createImageData(fw, fh), D = od.data;
    for (let py = 0; py < fh; py++) {
      const v = e + (py + 0.5) / fh * (1 - 2 * e);
      for (let pxl = 0; pxl < fw; pxl++) {
        const u = e + (pxl + 0.5) / fw * (1 - 2 * e);
        let [x, y] = f(u, v); x -= bx0 + 0.5; y -= by0 + 0.5;
        x = Math.min(SW - 1, Math.max(0, x)); y = Math.min(SH - 1, Math.max(0, y));
        const xi = x | 0, yi = y | 0, fx = x - xi, fy = y - yi, x2 = Math.min(SW - 1, xi + 1), y2 = Math.min(SH - 1, yi + 1);
        const i00 = (yi * SW + xi) * 4, i10 = (yi * SW + x2) * 4, i01 = (y2 * SW + xi) * 4, i11 = (y2 * SW + x2) * 4;
        const o = (py * fw + pxl) * 4;
        for (let k = 0; k < 3; k++) D[o + k] = (src[i00 + k] * (1 - fx) + src[i10 + k] * fx) * (1 - fy) + (src[i01 + k] * (1 - fx) + src[i11 + k] * fx) * fy;
        D[o + 3] = 255;
      }
    }
    og.putImageData(od, 0, 0);
    return out;
  }

  /**
   * Cases d'une page de classeur (grille trouvée) → bords réels de chaque carte, cherchés près de sa case.
   * Renvoie pour chaque case son quadrilatère ajusté (fractions), ou null si ses bords ne sont pas sûrs.
   */
  /** Homographie (3 × 3) qui envoie les 4 points src sur les 4 points dst ; renvoie une fonction (x, y) → [x, y] */
  function homography(src, dst) {
    const A = [], b = [];
    for (let i = 0; i < 4; i++) {
      const [x, y] = src[i], [u, v] = dst[i];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
    }
    // élimination de Gauss (8 × 8)
    for (let c = 0; c < 8; c++) {
      let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
      for (let r = 0; r < 8; r++) {
        if (r === c) continue;
        const f = A[r][c] / (A[c][c] || 1e-12);
        for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k];
        b[r] -= f * b[c];
      }
    }
    const h = b.map((v, i) => v / (A[i][i] || 1e-12));
    return (x, y) => { const w = h[6] * x + h[7] * y + 1; return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w]; };
  }

  /**
   * Cases d'une page de classeur (grille trouvée) → bords réels de chaque carte, cherchés près de sa case.
   * Une carte a toujours la même taille : la page est « redressée » (vue de face, grâce aux coins de la grille),
   * et sur la page redressée toutes les cartes doivent avoir la même taille. Les cadres qui s'en écartent sont
   * rejetés, puis les cases restantes sont recherchées avec cette taille imposée.
   */
  function snapCells(img, cells, cols = 3, rows = 3) {
    snapCells.last = [];
    const NW = img.naturalWidth || img.width, NH = img.naturalHeight || img.height;
    const per = cols * rows;
    // redressement de chaque page (classeur ouvert : 2 pages à la suite) : image → plan de la page (1 unité = 1 case)
    const flat = [];
    for (let g0 = 0; g0 + per <= cells.length; g0 += per) {
      const c = (i) => cells[g0 + i].quad;
      const f = homography([c(0)[0], c(cols - 1)[1], c(per - 1)[2], c((rows - 1) * cols)[3]], [[0, 0], [cols, 0], [cols, rows], [0, rows]]);
      for (let i = 0; i < per; i++) flat[g0 + i] = f;
    }
    // taille d'un cadre sur la page redressée (largeur, hauteur en « cases »)
    const flatSize = (q, i) => {
      const f = flat[i]; if (!f) return null;
      const p = q.map(([x, y]) => f(x, y)), d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
      return [(d(p[0], p[1]) + d(p[3], p[2])) / 2, (d(p[0], p[3]) + d(p[1], p[2])) / 2];
    };
    const find = (c, sizeCheck = null) => {
      try {
        const xs = c.quad.map((p) => p[0]), ys = c.quad.map((p) => p[1]);
        const rect = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
        return cutCard(img, rect, { expect: c.quad, warp: false, sizeCheck });
      } catch (e) { return null; }
    };
    const first = cells.map((c) => find(c));
    const out = first.map((r) => (r ? r.quad : null));
    snapCells.last = first.map((r) => r && r.border);
    // taille de référence d'une carte sur la page redressée : médiane des cadres trouvés
    const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
    const sizes = out.map((q, i) => (q ? flatSize(q, i) : null)).filter(Boolean);
    if (sizes.length >= 3) {
      const W0 = med(sizes.map((s) => s[0])), H0 = med(sizes.map((s) => s[1]));
      const dev = (q, i) => { const s = flatSize(q, i); return s ? Math.max(Math.abs(s[0] - W0) / W0, Math.abs(s[1] - H0) / H0) : 1; };
      // cadres d'une autre taille : rejetés
      out.forEach((q, i) => { if (q && dev(q, i) > 0.04) out[i] = null; });
      // cases sans cadre : on cherche à nouveau, en imposant la taille d'une carte
      cells.forEach((c, i) => {
        if (out[i]) return;
        const r = find(c, (qFrac) => dev(qFrac, i));
        if (r) { out[i] = r.quad; snapCells.last[i] = r.border; }
      });
      snapCells.size = { w: W0, h: H0 };
    }
    const note = snapCells.last.map((b) => (b ? Math.min(...b.per) : -1)); // qualité de la bordure trouvée
    // deux cartes ne se touchent jamais : si deux cadres voisins se chevauchent (ou collent),
    //    celui dont la bordure est la moins nette est écarté
    const gap = 0.003; // écart minimal, en fraction de l'image
    const right = (q) => Math.max(q[1][0], q[2][0]), left = (q) => Math.min(q[0][0], q[3][0]);
    const bottom = (q) => Math.max(q[2][1], q[3][1]), top = (q) => Math.min(q[0][1], q[1][1]);
    for (let i = 0; i < out.length; i++) {
      if (!out[i]) continue;
      const k = i % per; // position dans sa page (classeur ouvert : 2 pages à la suite)
      const nb = [(k % cols) < cols - 1 ? i + 1 : -1, k + cols < per ? i + cols : -1];
      for (const [n, horiz] of [[nb[0], true], [nb[1], false]]) {
        if (n < 0 || !out[n] || !out[i]) continue;
        const touch = horiz ? right(out[i]) > left(out[n]) - gap : bottom(out[i]) > top(out[n]) - gap;
        if (touch) out[note[i] < note[n] ? i : n] = null;
      }
    }
    return out;
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
    // (v2.37, photos d'Arnaud : Libegon et Drattak normales prises pour des holos, Massko reverse prise pour une normale)
    // - normale, holo ET reverse possibles : si ce n'est pas une reverse, on mesure encore holo / normale
    //   (avant : la première de la liste restante, « holo », sans mesure) ;
    // - la mesure n'est pas encore calibrée sur de vraies cartes : « sûr » seulement quand elle est nette dans le bon sens
    //   (reverse Massko : 0,96, comme une normale) → sinon « à vérifier », et la version se corrige avant l'enregistrement.
    const rest = base.filter((k) => k !== 'reverse');
    if (base.length > 1 && base.includes('reverse')) {
      pickBase = rest.includes('normal') ? 'normal' : rest[0] || null;
      if (O) {
        // reverse = le fond (zone du texte) brille, pas l'illustration : on compare au visuel officiel
        const f = (Q, x0, x1, y0, y1) => { const r = foilIn(Q, x0, x1, y0, y1); return r ? r.grain + r.satVar * 40 : null; };
        const tP = f(P, 0.08, 0.92, 0.6, 0.86), aP = f(P, 0.12, 0.88, 0.14, 0.44), tO = f(O, 0.08, 0.92, 0.6, 0.86), aO = f(O, 0.12, 0.88, 0.14, 0.44);
        if (tP && aP && tO && aO) {
          const ratio = (tP / tO) / (aP / aO);
          info.reverseRatio = Math.round(ratio * 100) / 100;
          if (ratio >= 1.7) { pickBase = 'reverse'; sure.base = ratio >= 2.2; }
          else if (rest.includes('holo') && rest.includes('normal')) {
            const hr = (aP / aO) / (tP / tO);
            info.holoRatio = Math.round(hr * 100) / 100;
            pickBase = hr >= 1.4 ? 'holo' : 'normal'; sure.base = hr >= 1.9;
          } else sure.base = false;
        }
      }
    } else if (base.length > 1 && base.includes('holo') && base.includes('normal') && O) {
      // holo ou normale ? holo = l'ILLUSTRATION brille (reflets, grain), pas le texte : même mesure que la reverse,
      // zones inversées, toujours comparée au visuel officiel (qui ne brille pas)
      const f = (Q, x0, x1, y0, y1) => { const r = foilIn(Q, x0, x1, y0, y1); return r ? r.grain + r.satVar * 40 : null; };
      const tP = f(P, 0.08, 0.92, 0.6, 0.86), aP = f(P, 0.12, 0.88, 0.14, 0.44), tO = f(O, 0.08, 0.92, 0.6, 0.86), aO = f(O, 0.12, 0.88, 0.14, 0.44);
      if (tP && aP && tO && aO) {
        const ratio = (aP / aO) / (tP / tO);
        info.holoRatio = Math.round(ratio * 100) / 100;
        pickBase = ratio >= 1.4 ? 'holo' : 'normal'; sure.base = ratio >= 1.9;
      } else pickBase = 'normal';
    } else if (base.length > 1) pickBase = base.includes('normal') ? 'normal' : base[0];
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
  // disjoncteur : quand le serveur d'images refuse tout (panne passagère chez TCGdex), on arrête d'insister
  // 30 s et la reconnaissance se fait sur le texte seul (sinon chaque carte attendait 5 à 15 s de nouveaux essais)
  let imgFails = 0, imgPauseUntil = 0;
  async function fetchImage(url, force = false, once = false) {
    // visuel relayé (One Piece, images.weserv.nl) : la 1re demande d'une image peut être très lente → un seul essai, 10 s au plus
    // (sinon toute la page de classeur attendait une seule image), et le serveur de TCGdex n'est pas en cause
    if (/^https:\/\/images\.weserv\.nl\//.test(url)) {
      const ac = new AbortController(), t = setTimeout(() => ac.abort(), 10000);
      try { const r = await fetch(url, { signal: ac.signal }); return r.ok ? await r.blob() : null; } catch (e) { return null; } finally { clearTimeout(t); }
    }
    if (!force && Date.now() < imgPauseUntil) return null;
    // adresse devinée (carte sans visuel connu chez TCGdex) : une seule tentative, et un échec ne compte pas comme une panne
    // (avant : 4 tentatives de ~3 s chacune = 12 s perdues à chaque scan, et le disjoncteur sautait pour de faux)
    if (once) { try { const r = await fetch(url); return r.ok ? await r.blob() : null; } catch (e) { return null; } }
    const alts = [url, url, url.replace(/\.webp$/, '.png'), url.replace('/low.', '/high.')];
    for (let i = 0; i < alts.length; i++) {
      try { const r = await fetch(alts[i]); if (r.ok) { imgFails = 0; return await r.blob(); } if (r.status === 404 && i >= 2) return null; } catch (e) { /* on réessaie */ }
      if (!force && Date.now() < imgPauseUntil) return null;
      await new Promise((res) => setTimeout(res, 120 * (i + 1)));
    }
    if (++imgFails >= 6) { imgPauseUntil = Date.now() + 30000; imgFails = 0; console.warn('Serveur d\'images TCGdex indisponible : pause de 30 s'); }
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
  async function ocr(blob, { atkBand = false } = {}) {
    const w = await getWorker();
    const img = await loadImg(blob);
    status('Lecture de la carte…');
    const txt = (p) => p.then((r) => r.data.text || '', () => '');
    // tout est demandé d'un coup : les lecteurs libres se partagent le travail
    // (nom, nom avec contours renforcés pour les photos un peu floues, carte entière)
    const topP = Promise.all([txt(w.recognize(band(img, 0.02, 0.14, 2.5))), txt(w.recognize(band(img, 0.02, 0.13, 2.5, 'unsharp', 0, 0.8)))]);
    const fullP = txt(w.recognize(blob));
    // zone des attaques, contrastée et lue d'un bloc : sur un fond texturé (Akwakwak obscur, Métalosse δ) la lecture de la
    // carte entière n'en tirait presque rien ; ici « Troisième œil », « Super Psy 50 », « Écra-brûle 30+ » (~0,15 s)
    // Carte seule et rafale seulement : en classeur (cartes petites sur la photo) ce texte bruité faisait perdre des cartes sûres (09 : 4 → 2)
    const W0 = img.naturalWidth || img.width;
    const atkP = !atkBand ? Promise.resolve('') : txt(w.recognize(band(img, 0.46, 0.93, Math.min(3, Math.max(1, 1450 / W0))), '6'));
    // le numéro est en bas à gauche (ou à droite sur les anciennes cartes)
    // + lectures en couleurs inversées pour les numéros blancs des cartes « full art »
    const reads = [band(img, 0.85, 1, 3), band(img, 0.88, 1, 4, 'sharp', 0, 0.5), band(img, 0.85, 1, 3, 'otsu'), band(img, 0.88, 1, 4, 'sharp', 0.5, 1),
      band(img, 0.86, 1, 3, 'invert'), band(img, 0.88, 1, 4, 'invert', 0, 0.5)];
    let bottom = '';
    // on s'arrête dès que le même numéro « n/total » (total d'une vraie série) a été lu deux fois : plus rapide
    const seen = {};
    let twice = false;
    for (let i = 0; i < reads.length && !twice; i += w.size) {
      const ts = await Promise.all(reads.slice(i, i + w.size).map((r) => txt(w.recognize(r))));
      for (const t of ts) {
        bottom += t + '\n';
        for (const m of t.replace(/[Oo](?=\d)|(?<=\d)[Oo]/g, '0').matchAll(/(\d{1,3})\s*[\/⁄]\s*(\d{2,3})/g)) {
          const of = parseInt(m[2], 10), k = parseInt(m[1], 10) + '/' + of;
          if (!validTotals.has(of)) continue;
          seen[k] = (seen[k] || 0) + 1; if (seen[k] >= 2) twice = true;
        }
      }
    }
    const [tops, full, atk] = await Promise.all([topP, fullP, atkP]);
    // (texte des attaques à part : dans les lignes du nom, « Soins », « Dégâts »… faisaient chercher des cartes Dresseur)
    return { top: tops.join('\n'), bottom, full, atk };
  }

  function parse({ top, bottom, full, atk = '' }) {
    const fix = (t) => t.replace(/[Oo](?=\d)|(?<=\d)[Oo]/g, '0').replace(/[Il|](?=\d{2})/g, '1');
    // tous les « 025/165 » lus ; on garde le plus fréquent, en préférant un total qui existe vraiment
    const nums = {};
    for (const t of [bottom, full]) for (const m of fix(t).matchAll(/(\d{1,3})\s*[\/⁄]\s*(\d{2,3})/g)) {
      const n = parseInt(m[1], 10), of = parseInt(m[2], 10), k = `${n}/${of}`;
      nums[k] = nums[k] || { n, of, raw: m[1], votes: 0 };
      nums[k].votes += 1 + (validTotals.has(of) ? 2 : 0) + (n <= of + 120 ? 0.5 : 0);
    }
    // barre oblique lue comme un chiffre (« 2074191 » pour 207/191 sur les cartes récentes) : seulement si le total existe, et en dernier recours
    if (!Object.keys(nums).length) for (const t of [bottom, full]) for (const m of fix(t).matchAll(/(?<!\d)(\d{1,3})[41l|I7](\d{3})(?!\d)/g)) {
      const n = parseInt(m[1], 10), of = parseInt(m[2], 10), k = `${n}/${of}`;
      if (!validTotals.has(of) || n < 1 || n > of + 120) continue;
      nums[k] = nums[k] || { n, of, raw: m[1], votes: 0, guess: true };
      nums[k].votes += 1;
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
    const T = `${top}\n${bottom}\n${full}\n${atk}`;
    const OTHER = [/bandai/i, /\bBT\d{1,2}\s*[-‐–]\s*\d{2,3}/i, /dragon\s*ball/i, /\bLFL\b/, /\bFFG\b/, /\bSOR\s*[•·.*]?\s*(FR|EN)\b/i, /star\s*wars/i, /unlimited/i, /wankul/i, /konami/i, /yu-?gi-?oh/i, /lorcana/i, /disney/i, /one\s*piece/i, /\bOP\d{2}\s*-\s*\d{3}/i, /\bmagic\b/i, /wizards\s+of\s+the\s+coast/i, /digimon/i, /\bsaiyan/i,
      /\b(son\s*)?(goku|gok[uû]|gohan|goten|vegeta|trunks|broly|piccolo|krilin|freezer|kamesennin|janemba|zenkai)\b/i, /\b(unit[ée]s?|terrestre|spatiale|am[ée]lioration|rebelle|imp[ée]rial|wookie|jedi|[ée]v[ée]nement|prot[ée]g[ée]e)\b/i];
    const POKE = [/\b(PV|HP)\s*\d{2,3}\b/, /\b\d{2,3}\s*(PV|HP)\b/, /pok[eé]mon/i, /nintendo/i, /game\s*freak/i, /faiblesse/i, /weakness/i, /r[ée]sistance/i, /retraite/i, /retreat/i];
    const neg = OTHER.filter((r) => r.test(T)).length, pos = POKE.filter((r) => r.test(T)).length;
    const otherGame = neg >= 1 && pos === 0 || neg >= 2 && pos <= 1;
    // points de vie lus en haut (« 60 PV », « PV 120 », « HP 90 ») : départagent une carte et sa réimpression (ex. Évolutions)
    const hpM = fix(top).match(/(\d{2,3})\s*P\s*V\b|\bP\s*V\s*(\d{2,3})|\bHP\s*(\d{2,3})|(\d{2,3})\s*HP\b/);
    const hp = hpM ? parseInt(hpM[1] || hpM[2] || hpM[3] || hpM[4], 10) : null;
    // noms de Pokémon reconnus dans tout le texte (le titre compte double ; « Évolution de … » est ignoré)
    const clean = (t) => t.split('\n').map(noEvo).join('\n');
    const pokes = knownPokemon(`${clean(top)}\n${clean(top)}\n${clean(full)}\n${clean(atk)}`).slice(0, 4);
    return { num: ranked[0] || null, alt: ranked.slice(1, 3), lines, words, pokes, years: [...years], wizards, otherGame, hp: hp && hp >= 30 && hp <= 340 && hp % 10 === 0 ? hp : null, raw: { bottom, full: full + '\n' + atk } };
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
  async function officialThumb(src, retry = false, guess = false) {
    if (retry) officialThumbs.delete(src);
    if (!officialThumbs.has(src)) {
      const tryUrl = (u) => fetchImage(u, retry, guess);
      officialThumbs.set(src, (async () => {
        // empreinte gardée sur l'appareil (1,5 Ko) : plus besoin de retélécharger le visuel aux scans suivants
        const key = 'art1:' + src;
        const hit = await App.db.get('cache', key).catch(() => null);
        if (hit && hit.v && hit.v.length === AW * AH) return hit.v;
        if (hit && hit.miss && Date.now() - hit.t < 2 * 864e5) return null; // adresse devinée déjà essayée : pas de visuel
        let b = await tryUrl(src);
        if (!b && !guess && /assets\.tcgdex\.net\/(?!en\/)[a-z-]+\//.test(src)) b = await tryUrl(src.replace(/assets\.tcgdex\.net\/[a-z-]+\//, 'assets.tcgdex.net/en/'));
        const v = b ? await createImageBitmap(b).then((bmp) => artVec(trimBackground(bmp))).catch(() => null) : null;
        if (v) App.db.set('cache', key, { t: Date.now(), v }).catch(() => {});
        else if (guess) App.db.set('cache', key, { t: Date.now(), miss: true }).catch(() => {});
        else setTimeout(() => officialThumbs.delete(src), 30000); // image pas reçue (panne ?) : on réessaiera plus tard
        return v;
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
  async function backScore(blob, game = 'pokemon') {
    const bmp = await createImageBitmap(blob);
    return backScoreOf(bmp, bmp.width, bmp.height, false, game);
  }
  let backCanvas = null;
  // modèles de dos par licence (v2.88) : One Piece = dos bleu et dos rouge (js/games/onepiece-backs.js), cadrés au ras de la
  // carte (le Pokémon vient de pochettes : zoom 0,78 à 0,9) → zooms un peu plus larges
  const backRefs = {};
  const refsOf = (game) => {
    if (backRefs[game]) return backRefs[game];
    const list = game === 'onepiece' ? App.onePieceBacks || [] : [BACK];
    const dec = (t) => { const bin = atob(t.b64), a = new Float32Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return normRGB(a, t.w * t.h); };
    return (backRefs[game] = { refs: list.map(dec), scales: game === 'onepiece' ? [0.84, 0.92, 1] : [0.78, 0.84, 0.9] });
  };
  /** Même mesure, directement sur une image déjà dessinée (canvas, image de la caméra) : sert à la certification en direct */
  // fast (suivi en direct de la certification, v2.48) : sans les petits décalages → 3 essais au lieu de 9 (la caméra
  // du téléphone d'Arnaud ne donnait que ~6 images par seconde au suivi)
  function backScoreOf(src, SW, SH, fast = false, game = 'pokemon') {
    if (!backRef) backRef = refsOf('pokemon').refs[0];
    const { refs, scales } = refsOf(game);
    if (!refs.length) return -1;
    const W = BACK.w, H = BACK.h, n = W * H;
    const c = backCanvas || (backCanvas = Object.assign(document.createElement('canvas'), { width: W, height: H }));
    const g = c.getContext('2d', { willReadFrequently: true }); g.filter = 'blur(0.6px)';
    let best = -1;
    const offs = fast ? [0] : [-0.05, 0, 0.05];
    for (const sc of scales) for (const dx of offs) for (const dy of offs) {
      const bw = SW * sc, bh = SH * sc;
      g.clearRect(0, 0, W, H);
      g.drawImage(src, SW * (0.5 + dx) - bw / 2, SH * (0.5 + dy) - bh / 2, bw, bh, 0, 0, W, H);
      const d = g.getImageData(0, 0, W, H).data, px = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { px[i * 3] = d[i * 4]; px[i * 3 + 1] = d[i * 4 + 1]; px[i * 3 + 2] = d[i * 4 + 2]; }
      const v = normRGB(px, n);
      for (const ref of refs) { let s = 0; for (let i = 0; i < v.length; i++) s += v[i] * ref[i]; s /= v.length; if (s > best) best = s; }
    }
    return best;
  }
  async function looksLikeBack(blob, game = 'pokemon') { return (await backScore(blob, game)) >= 0.6; }

  /**
   * Ressemblance de la carte ENTIÈRE (petite image couleur 24×33, corrélation), pour les cartes hors-série :
   * leur mise en page (Illustrator, Trophée…) n'a pas la fenêtre d'illustration des cartes ordinaires,
   * la comparaison habituelle de l'illustration ne marche pas (Illustrator contre sa propre image : 0,21).
   * Renvoie Map(id → score de -1 à 1) ; même méthode que la reconnaissance des dos (backScoreOf).
   */
  const wholeRefs = new Map();
  async function wholeCardScores(blob, cards) {
    const W = BACK.w, H = BACK.h, n = W * H;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true }); g.filter = 'blur(0.6px)';
    const vec = (src, sx, sy, sw, sh) => {
      g.clearRect(0, 0, W, H); g.drawImage(src, sx, sy, sw, sh, 0, 0, W, H);
      const d = g.getImageData(0, 0, W, H).data, px = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { px[i * 3] = d[i * 4]; px[i * 3 + 1] = d[i * 4 + 1]; px[i * 3 + 2] = d[i * 4 + 2]; }
      return normRGB(px, n);
    };
    const refOf = async (card) => {
      const url = ad().img.card(card, 'low'); if (!url) return null;
      if (!wholeRefs.has(url)) wholeRefs.set(url, (async () => { const im = await createImageBitmap(await (await fetch(url)).blob()); return vec(im, 0, 0, im.width, im.height); })().catch(() => null));
      return wholeRefs.get(url);
    };
    const bmp = await createImageBitmap(blob), SW = bmp.width, SH = bmp.height;
    // la carte peut être un peu plus petite que la découpe (marge du cadre) : quelques tailles et décalages
    const views = [];
    for (const sc of [1, 0.94, 0.88]) for (const dx of [-0.03, 0, 0.03]) for (const dy of [-0.03, 0, 0.03]) {
      const bw = SW * sc, bh = SH * sc;
      views.push(vec(bmp, SW * (0.5 + dx) - bw / 2, SH * (0.5 + dy) - bh / 2, bw, bh));
    }
    const out = new Map();
    for (const card of cards) {
      const ref = await refOf(card); if (!ref) continue;
      let best = -1;
      for (const v of views) { let s = 0; for (let i = 0; i < v.length; i++) s += v[i] * ref[i]; s /= v.length; if (s > best) best = s; }
      out.set(card.id, best);
    }
    return out;
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
  /**
   * Noms de Pokémon présents dans le texte lu : chaque mot est comparé aux 1025 noms connus (App.pokedex),
   * même mal lu (« Kadahra » → Kadabra). Le nom figure souvent plusieurs fois sur la carte (titre, attaques,
   * « Évolution de… » exclu) : on garde les mieux notés. Renvoie [{ name, score }].
   */
  let pokeNames = null;
  function knownPokemon(text) {
    if (!App.pokedex) return [];
    if (!pokeNames) pokeNames = Array.from({ length: App.pokedex.TOTAL }, (_, i) => App.pokedex.name(i + 1)).map((n) => ({ n, k: norm(n) })).filter((x) => x.k.length >= 3);
    const words = norm(text).split(' ').filter((w) => w.length >= 4);
    const hits = new Map();
    for (const w of words) {
      let best = null;
      for (const p of pokeNames) {
        if (Math.abs(p.k.length - w.length) > 2 || p.k[0] !== w[0] && p.k.slice(1, 3) !== w.slice(1, 3)) continue;
        const s = similarity(w, p.k);
        if (s >= 0.75 && (!best || s > best.s)) best = { n: p.n, s };
      }
      if (best) { const h = hits.get(best.n) || { name: best.n, score: 0 }; h.score += best.s; hits.set(best.n, h); }
    }
    return [...hits.values()].sort((a, b) => b.score - a.score);
  }

  async function nameSearch(words, known = []) {
    // noms de Pokémon reconnus dans le texte : 1 à 2 recherches précises, en même temps
    if (known.length) {
      // + le nom sans accents : TCGdex écrit parfois « Metalosse δ » (EX Espèces Delta), introuvable en cherchant « Métalosse »
      const plain = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
      const qs = known.slice(0, 2).flatMap((k) => [{ name: k.name }, ...(plain(k.name) !== k.name ? [{ name: plain(k.name), en: false }] : [])]);
      const res = await Promise.all(qs.map((q) => ad().search(q).catch(() => [])));
      const seen = new Set(), out = res.flat().filter((c) => !seen.has(c.id) && seen.add(c.id));
      if (out.length) return out;
    }
    // sinon (Dresseurs, Énergies, nom illisible) : morceaux des premiers mots, recherches en parallèle
    const qs = [...new Set(words.slice(0, 3).flatMap((w) => [w, w.slice(1), w.slice(0, 5), w.slice(1, 6), w.slice(2, 7), w.slice(0, 4)])
      .map((q) => q.replace(/[^a-zA-ZÀ-ÿ\-]/g, '')).filter((q) => q.length >= 4))].slice(0, 10);
    return (await Promise.all(qs.map((q) => ad().search({ name: q, en: false }).catch(() => [])))).flat();
  }

  /** Classe des candidates : ressemblance du nom, numéro, puis comparaison visuelle avec la photo */
  /**
   * Attaques et talents de la carte retrouvés dans le texte lu (« Super Psy » … « 50 ») : part des noms retrouvés (0 à 1).
   * Chaque nom est cherché mot à mot, même un peu mal lu (« Supor Psy »), et ses dégâts à côté comptent un peu plus.
   */
  function attackMatch(atk, words, memo) {
    if (!atk || !atk.length || words.length < 3) return null;
    let got = 0;
    for (const [name, dmg] of atk) {
      // le même nom d'attaque revient sur beaucoup de cartes : mesuré une seule fois par lecture
      const mk = name + '|' + dmg;
      if (!memo.has(mk)) memo.set(mk, attackOne(name, dmg, words));
      got += memo.get(mk);
    }
    return Math.min(1, got / atk.length);
  }
  function attackOne(name, dmg, words) {
    const nw = norm(name).split(' ').filter(Boolean); if (!nw.length) return 0;
    const target = nw.join(' '), n = nw.length, L = target.length;
    let best = 0, at = -1;
    for (let i = 0; i + n <= words.length; i++) {
      // tri rapide avant le calcul (coûteux) : longueur proche et une lettre en commun au début
      const w0 = words[i];
      if (w0[0] !== nw[0][0] && w0[1] !== nw[0][1]) continue;
      const win = n === 1 ? w0 : words.slice(i, i + n).join(' ');
      if (Math.abs(win.length - L) > L * 0.35) continue;
      const s = 1 - App.util.lev(win, target) / Math.max(win.length, L); // textes déjà normalisés : calcul direct
      if (s > best) { best = s; at = i; }
    }
    const need = L <= 5 ? 0.85 : 0.72; // les noms courts (« Soin ») doivent être presque exacts
    if (best < need) return 0;
    const d = String(dmg || '').replace(/\D/g, '');
    return d && words.slice(at + n, at + n + 6).includes(d) ? 1.25 : 1; // dégâts lus juste après
  }

  /**
   * Sûre grâce au texte : bon nom, TOUTES ses attaques / talents retrouvés, et c'est la seule candidate dans ce cas
   * (une réimpression aux mêmes attaques laisse le doute), illustration pas contraire.
   */
  // même carte en deux exemplaires dans une série (holo / non holo, même dessin, mêmes attaques) : seul le numéro tranche
  const sameAtk = (a, b) => (a.atk || []).length > 0 && (a.atk || []).map((x) => norm(x[0])).join('|') === (b.atk || []).map((x) => norm(x[0])).join('|');
  const inSetTwin = (c, out) => out.some((o) => o !== c && o.setId === c.setId && norm(o.name) === norm(c.name) && sameAtk(o, c));
  const atkSure = (c, out) => c.atkM != null && c.atkM >= 0.99 && (c.nameScore || 0) >= 0.75 && (c.visual == null || c.visual >= 0.35)
    && out.filter((o) => o.atkM != null && o.atkM >= 0.99 && (o.nameScore || 0) >= 0.75
      // une réimpression aux mêmes attaques ne crée pas de doute si elle ressemble nettement moins à la photo,
      // ou si elle n'a pas de visuel et pas la bonne année (Métalosse δ 2006 ↔ collection 30ᵉ anniversaire sans image)
      && !(o !== c && ((o.visual != null && c.visual != null && c.visual - o.visual >= 0.15) || (o.visual == null && c.visual != null && c.visual >= 0.6 && c.yearOk && !o.yearOk)))).length === 1;

  async function rank(list, num, lines, mine, { cap = 30, visualWeight = 1.5, needName = false, years = [], wizards = false, hp = null, full = '' } = {}) {
    const allWords = norm(full || lines.join(' ')).split(' ').filter((w) => w.length >= 2).slice(0, 400), memo = new Map();
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
      // … ou avec un chiffre perdu devant (« 01/100 » pour la carte secrète « 101/100 », collée au bord de la carte)
      const offOk = !!num && num.of && c.set && c.set.cardCount && c.set.cardCount.official === num.of;
      const numOk = !!num && (ln === num.n || (num.n >= 10 && ln === num.n % (num.n >= 100 ? 100 : 10) && offOk) || (offOk && ln > num.of && ln < 1000 && ln % (num.n >= 10 ? 100 : 10) === num.n && String(ln).endsWith(String(num.raw || num.n))));
      const ofOk = !!num && !!(c.set && c.set.cardCount) && c.set.cardCount.official === num.of;
      if (needName && !numOk && nameScore < 0.35 && !c._hint) continue;
      const yr = c.set && c.set.releaseDate ? parseInt(c.set.releaseDate, 10) : 0;
      const yearOk = !!yr && (years.includes(yr) || years.includes(yr - 1));
      const eraOk = wizards && !!yr && yr <= 2003;
      const hpOk = hp && c.hp ? (c.hp === hp ? 0.3 : -0.15) : 0;
      // série seulement en anglais (réimpression jamais sortie en français, ex. Base Set 2) : à égalité, la série française l'emporte
      const enPen = c.set && c.set.enOnly && (App.settings.lang || 'fr') !== 'en' ? 0.35 : 0;
      // attaques / talents retrouvés dans le texte lu (seulement si le nom colle : sinon le texte est illisible, inutile)
      const atkM = nameScore >= 0.6 || numOk ? attackMatch(c.atk, allWords, memo) : null;
      uniq.set(c.id, { ...c, nameScore, numOk, ofOk, yearOk, hpOk: hpOk > 0, hpBonus: hpOk, atkM, visual: null, score: nameScore + (numOk && ofOk ? 1.2 : numOk ? 0.4 : ofOk ? 0.2 : 0) + (yearOk ? 0.6 : 0) + (eraOk ? 0.4 : 0) + hpOk - enPen + (atkM || 0) * 1.4 + (c._hint || 0) });
    }
    let out = [...uniq.values()].sort((a, b) => b.score - a.score).slice(0, cap);
    if (mine && out.length) {
      status('Comparaison avec les visuels officiels…');
      await App.util.pool(out, 10, async (c) => {
        const src = ad().img.card(c, 'low'); if (!src) return;
        const v = await officialThumb(src, false, !c.image);
        if (v) { c.visual = artMatch(mine, v); c.score += vis01(c.visual) * visualWeight; }
      });
      out.sort((a, b) => b.score - a.score);
      // visuel des premières candidates pas reçu (le serveur d'images rate parfois une requête) : une 2e chance,
      // sinon la bonne carte (Salamèche 101/100, Poulpaf 207/191) passait derrière une autre qui, elle, avait son visuel
      const miss = out.slice(0, 4).filter((c) => c.visual == null && c.image && ad().img.card(c, 'low'));
      if (miss.length) {
        await new Promise((res) => setTimeout(res, 300));
        await Promise.all(miss.map(async (c) => {
          const v = await officialThumb(ad().img.card(c, 'low'), true);
          if (v) { c.visual = artMatch(mine, v); c.score += vis01(c.visual) * visualWeight; }
        }));
        out.sort((a, b) => b.score - a.score);
      }
      // écart de ressemblance avec la meilleure autre candidate (une carte nettement devant = plus sûre)
      const vs = out.map((c) => c.visual).filter((x) => x != null).sort((a, b) => b - a);
      for (const c of out) if (c.visual != null) c.margin = c.visual - (c.visual === vs[0] ? (vs[1] ?? 0) : vs[0]);
    }
    return out;
  }

  async function findCandidates({ num, alt = [], words, lines, years = [], wizards = false, hp = null, pokes = [], raw = null }, blob) {
    const full = raw ? `${raw.full || ''} ${raw.bottom || ''}` : ''; // tout le texte lu (attaques, talents…)
    const A = ad();
    // tout ce qui ne dépend pas du reste part en même temps : empreinte de la photo, recherche par numéro,
    // et (par avance) la recherche par le nom de Pokémon reconnu dans le texte
    const mineP = blob ? artVariants(blob).catch(() => null) : Promise.resolve(null);
    const known = pokes.filter((p) => p.score >= 0.9);
    let nameP = known.length ? nameSearch(words, known) : null;
    let byNum = [];
    if (num) {
      const [a, b] = await Promise.all([A.findByNumber(num.n, num.of).catch(() => []),
        num.n >= 10 && num.of ? A.findByNumber(num.n % (num.n >= 100 ? 100 : 10), num.of).catch(() => []) : []]);
      byNum = [...a, ...b];
    }
    for (const a of alt) { if (byNum.length) break; byNum = await A.findByNumber(a.n, a.of).catch(() => []); if (byNum.length) num = a; }
    const mine = await mineP;
    // cartes hors-série (Pikachu Illustrator, Trophée…) : sans numéro ni nom lisible (texte japonais), toujours comparées à la photo ;
    // un mot-clé lu sur la carte (« ILLUSTRATOR », « TRAINER No.1 », « LV.38 »…) les fait remonter
    const txt = norm(`${lines.join(' ')} ${full}`);
    const hs = (A.horsSerie ? A.horsSerie() : []).map((c) => ({ ...c, _hs: true, _hint: c.keys.some((k) => txt.includes(k)) ? 0.8 : 0 }));
    // … ou la carte entière qui ressemble nettement plus à l'une d'elles qu'aux autres (texte japonais illisible)
    if (blob && hs.length) {
      const whole = await wholeCardScores(blob, hs).catch(() => new Map());
      const ws = [...whole.values()].sort((a, b) => b - a);
      for (const c of hs) {
        const w = whole.get(c.id);
        if (w != null && w >= 0.5 && w - (w === ws[0] ? (ws[1] ?? 0) : ws[0]) >= 0.08) c._hint = Math.max(c._hint, 0.5);
      }
    }
    let out = await rank([...byNum, ...hs], num, lines, mine, { years, wizards, hp, full });
    // sans mot-clé, une carte hors-série ne reste que si elle ressemble vraiment à la photo (sinon un Pikachu ordinaire → « Illustrator »)
    out = out.filter((c) => !c._hs || c._hint || (c.visual != null && c.visual >= 0.7));
    // numéro absent, ou carte trouvée qui ne ressemble pas à la photo → on cherche aussi par le nom
    const weak = !out.length || (mine && (out[0].visual == null || out[0].visual < 0.55));
    if (weak && (words.length || known.length)) {
      status('Recherche par le nom…');
      const byName = await (nameP || nameSearch(words, known));
      // le nom de Pokémon reconnu compte comme une ligne lue (« Kadabra » lu dans une attaque, titre illisible)
      const lines2 = [...known.slice(0, 2).map((k) => k.name), ...lines];
      // 60 candidates au plus (les mieux classées par le nom, l'année, les PV) : comparer 100 visuels prenait ~7 s
      out = await rank([...byNum, ...byName, ...hs], num, lines2, mine, { cap: 60, visualWeight: 3, needName: true, years, wizards, hp, full });
    }
    // « sûre » : bon numéro ET bon total, ou photo très ressemblante
    // (sans visuel officiel à comparer, le numéro seul ne suffit pas : une lecture de travers donne vite « 10/10 »)
    // (nom + numéro + total lus tous les trois : sûre même si un reflet holo gâche la ressemblance, ex. Mélofée 5/102 à 0,39)
    for (const c of out) c.confident = (c.numOk && c.ofOk && c.visual != null && c.visual > 0.4) || (c.visual != null && c.visual >= 0.75 && (c.margin ?? 1) >= 0.06) || atkSure(c, out)
      || (c.numOk && c.ofOk && (c.nameScore || 0) >= 0.9 && (c.atkM == null || c.atkM >= 0.5) && c.visual != null && c.visual >= 0.25);
    // réimpression (même nom, autre série) presque aussi ressemblante → on ne peut pas trancher : « À vérifier »
    if (out[0] && out[0].confident && !(out[0].numOk && out[0].ofOk)) {
      // (une réimpression aux attaques nettement moins bien retrouvées, ou seulement anglaise, ne crée pas de doute)
      const t0 = out[0], atkAhead = (c) => t0.atkM != null && t0.atkM >= 0.99 && (c.atkM == null || c.atkM <= t0.atkM - 0.3);
      // même carte en deux exemplaires dans la même série (holo / non holo : Sulfura 12 et 27 de Fossile, même dessin,
      // mêmes attaques) : seul le numéro peut trancher, la ressemblance ne veut rien dire (0,78 pour la mauvaise)
      const twin = out.slice(1).find((c) => norm(c.name) === norm(t0.name) && (
        (c.visual != null && t0.visual != null && t0.visual - c.visual < 0.12 && !atkAhead(c) && !(c.set && c.set.enOnly && !(t0.set && t0.set.enOnly)))
        || (c.setId === t0.setId && sameAtk(c, t0))));
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
      const out = await rank(list, num, info.lines, mine, { cap: 500, visualWeight: 3, hp: info.hp, full: info.raw ? `${info.raw.full || ''} ${info.raw.bottom || ''}` : '' });
      // (les PV lus départagent le classement, mais ne rendent jamais une carte « sûre »)
      const second = out[1] ? out[1].score - (out[1].hpBonus || 0) : 0;
      for (const c of out) {
        c.confident = (c.numOk && c.visual != null && c.visual > 0.4) || atkSure(c, out)
          || (c.visual != null && c.visual >= 0.72 && (c.margin ?? 1) >= 0.05)
          || (c === out[0] && c.visual != null && c.visual >= 0.62 && (c.margin ?? 0) >= 0.12 && c.score - (c.hpBonus || 0) - second > 0.3); // nettement devant les autres
      // (mesuré sur une page de 18 cartes : une mauvaise carte peut atteindre 0,59 de ressemblance avec 0,17 d'avance)
        if (c.confident && !c.numOk && inSetTwin(c, out)) { c.confident = false; c.twin = true; }
      }
      return out.slice(0, 8);
    } finally { onStatus = null; }
  }

  /** Lecture seule (sans recherche) */
  async function read(blob, statusFn, opts) {
    onStatus = statusFn || null;
    try { return parse(await ocr(blob, opts)); } finally { onStatus = null; }
  }

  async function recognize(blob, statusFn, opts) {
    onStatus = statusFn || null;
    try {
      const info = parse(await ocr(blob, opts));
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
  // (lecture d'une autre licence — One Piece : info.read = « code OP10-001, nom … »)
  const readSummary = (info) => (info && typeof info.read === 'string' ? info.read : [info.num ? `n° ${info.num.raw}/${info.num.of}` : 'numéro illisible', info.words.length ? `« ${info.words.slice(0, 3).join(', ')} »` : ''].filter(Boolean).join(' · '));

  /**
   * Ajoute une carte scannée à la collection.
   * mode : 'nouvelle' (carte pas encore possédée), 'doublon' (+1 exemplaire, la photo s'ajoute),
   *        'photo' (même carte : sa photo devient le visuel, sans changer la quantité), 'rien'.
   */
  let lastVariants = null;
  /** Lit des zones d'une carte : [y0, y1, échelle, mode, x0, x1, psm] ou 'full' (carte entière) → textes (autres jeux : One Piece) */
  async function readZones(blob, zones) {
    const w = await getWorker(), img = await loadImg(blob);
    return Promise.all(zones.map((z) => (z === 'full' ? w.recognize(blob) : w.recognize(band(img, z[0], z[1], z[2], z[3] || 'sharp', z[4] ?? 0, z[5] ?? 1), z[6])).then((r) => r.data.text || '', () => '')));
  }

  async function addScanned(c, blob, mode = null, game = c.game || 'pokemon') {
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
    // (déjà mesurées et vérifiées dans la liste du classeur : c.pickedVariants)
    try {
      const det = c.pickedVariants ? { list: c.pickedVariants } : c.variants ? await detectVariants(blob, c.variants, ad().img.card(c, 'high')) : null;
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
  async function resemblanceMany(blob, cards, urlOf = (c) => ad().img.card(c, 'low')) { // urlOf : visuel d'un autre jeu (One Piece)
    const mine = await artVariants(blob);
    const out = new Map();
    await App.util.pool(cards, 6, async (c) => {
      const src = urlOf(c); if (!src) return;
      const ref = await officialThumb(src);
      if (ref) out.set(c.id, vis01(artMatch(mine, ref)));
    });
    return out;
  }

  function stop() { if (worker) { worker.terminate(); worker = null; workerP = null; } }

  return { get lastVariants() { return lastVariants; }, wholeCardScores, recognize, read, inSet, manual, resemblance, resemblanceMany, readSummary, addScanned, readZones, looksEmpty, looksLikeBack, backScore, backScoreOf, looksLikePage, locateCard, refineCell, detectGrid, detectVariants, firstEditionStamp, foilIn, cardPixels, detectPage, detectDouble, cellCard, cutCard, warpQuad, snapCells, _gridProfiles: gridProfiles, stop, RATIO: 63 / 88 };
})();
