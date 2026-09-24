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
  function locateCard(img, rect) {
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
    const minW = Math.min(cellW, cellH * R) * 0.6;
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
    return { num: ranked[0] || null, alt: ranked.slice(1, 3), lines, words };
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
        return b ? createImageBitmap(b).then((bmp) => artVec(bmp)).catch(() => null) : null;
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
  async function rank(list, num, lines, mine, { cap = 30, visualWeight = 1.5, needName = false } = {}) {
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
      uniq.set(c.id, { ...c, nameScore, numOk, ofOk, visual: null, score: nameScore + (numOk ? 0.5 : 0) + (ofOk ? 0.5 : 0) });
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

  async function findCandidates({ num, alt = [], words, lines }, blob) {
    const A = ad();
    let byNum = [];
    if (num) byNum = await A.findByNumber(num.n, num.of).catch(() => []);
    for (const a of alt) { if (byNum.length) break; byNum = await A.findByNumber(a.n, a.of).catch(() => []); if (byNum.length) num = a; }
    const mine = blob ? await artVariants(blob).catch(() => null) : null;
    let out = await rank(byNum, num, lines, mine);
    // numéro absent, ou carte trouvée qui ne ressemble pas à la photo → on cherche aussi par le nom
    const weak = !out.length || (mine && (out[0].visual == null || out[0].visual < 0.55));
    if (weak && words.length) {
      status('Recherche par le nom…');
      const byName = await nameSearch(words);
      out = await rank([...byNum, ...byName], num, lines, mine, { cap: 100, visualWeight: 3, needName: true });
    }
    // « sûre » : bon numéro ET bon total, ou photo très ressemblante
    for (const c of out) c.confident = (c.numOk && c.ofOk && (c.visual == null || c.visual > 0.4)) || (c.visual != null && c.visual >= 0.75 && (c.margin ?? 1) >= 0.06);
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
      const shape = { id: set.id, name: set.name, logo: set.logo, symbol: set.symbol, cardCount: { total: set.total, official: set.official }, serie: set.group };
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
    return key;
  }

  function stop() { if (worker) { worker.terminate(); worker = null; workerP = null; } }

  return { recognize, read, inSet, manual, readSummary, addScanned, looksEmpty, looksLikeBack, looksLikePage, locateCard, stop, RATIO: 63 / 88 };
})();
