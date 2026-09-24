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

  /** Découpe une zone de la carte, l'agrandit et la rend plus lisible (gris + contraste, ou noir/blanc) */
  function band(img, y0, y1, scale, mode = 'sharp', x0 = 0, x1 = 1) {
    const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
    const sx = W * x0, sw = W * (x1 - x0), sy = H * y0, sh = H * (y1 - y0);
    const c = document.createElement('canvas');
    c.width = Math.round(sw * scale); c.height = Math.round(sh * scale);
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.filter = mode === 'invert' ? 'grayscale(1) invert(1) contrast(1.6)' : 'grayscale(1) contrast(1.6)';
    g.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
    if (mode === 'otsu') {
      const d = g.getImageData(0, 0, c.width, c.height), p = d.data, n = p.length / 4;
      const hist = new Array(256).fill(0), gray = new Uint8Array(n);
      for (let i = 0; i < n; i++) { gray[i] = p[i * 4]; hist[gray[i]]++; }
      let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
      let sumB = 0, wB = 0, best = 0, th = 128;
      for (let i = 0; i < 256; i++) {
        wB += hist[i]; if (!wB) continue; const wF = n - wB; if (!wF) break;
        sumB += i * hist[i]; const mB = sumB / wB, mF = (sum - sumB) / wF, v = wB * wF * (mB - mF) ** 2;
        if (v > best) { best = v; th = i; }
      }
      for (let i = 0; i < n; i++) { const v = gray[i] > th ? 255 : 0; p[i * 4] = p[i * 4 + 1] = p[i * 4 + 2] = v; }
      g.putImageData(d, 0, 0);
    }
    return c;
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
    const c = document.createElement('canvas'); c.width = 24; c.height = 33;
    const g = c.getContext('2d'); g.drawImage(bmp, 0, 0, 24, 33);
    const p = g.getImageData(0, 0, 24, 33).data, v = new Float32Array(24 * 33);
    for (let i = 0; i < v.length; i++) v[i] = 0.299 * p[i * 4] + 0.587 * p[i * 4 + 1] + 0.114 * p[i * 4 + 2];
    return v;
  }
  /** Corrélation entre deux empreintes (1 = identiques) — insensible à la luminosité */
  function corr(a, b) {
    const n = a.length; let ma = 0, mb = 0;
    for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
    ma /= n; mb /= n;
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; num += x * y; da += x * x; db += y * y; }
    return da && db ? num / Math.sqrt(da * db) : 0;
  }

  /** Pochette vide ? (image presque uniforme) */
  async function looksEmpty(blob) {
    const v = await thumb(blob);
    let m = 0; for (const x of v) m += x; m /= v.length;
    let s = 0; for (const x of v) s += (x - m) ** 2;
    return Math.sqrt(s / v.length) < 14;
  }

  const officialThumbs = new Map();
  async function officialThumb(src) {
    if (!officialThumbs.has(src)) {
      officialThumbs.set(src, fetch(src).then((r) => (r.ok ? r.blob() : null)).then((b) => (b ? thumb(b) : null)).catch(() => null));
    }
    return officialThumbs.get(src);
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
    const uniq = new Map();
    for (const c of list) if (!uniq.has(c.id)) {
      const nameScore = Math.max(0, ...lines.slice(0, 8).map((l) => similarity(l, c.name)), text.includes(norm(c.name)) ? 1 : 0);
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
        if (v) { c.visual = corr(mine, v); c.score += Math.max(0, c.visual) * visualWeight; }
      });
      out.sort((a, b) => b.score - a.score);
    }
    return out;
  }

  async function findCandidates({ num, alt = [], words, lines }, blob) {
    const A = ad();
    let byNum = [];
    if (num) byNum = await A.findByNumber(num.n, num.of).catch(() => []);
    for (const a of alt) { if (byNum.length) break; byNum = await A.findByNumber(a.n, a.of).catch(() => []); if (byNum.length) num = a; }
    const mine = blob ? await thumb(blob).catch(() => null) : null;
    let out = await rank(byNum, num, lines, mine);
    // numéro absent, ou carte trouvée qui ne ressemble pas à la photo → on cherche aussi par le nom
    const weak = !out.length || (mine && (out[0].visual == null || out[0].visual < 0.45));
    if (weak && words.length) {
      status('Recherche par le nom…');
      const byName = await nameSearch(words);
      out = await rank([...byNum, ...byName], num, lines, mine, { cap: 100, visualWeight: 3, needName: true });
    }
    // « sûre » : bon numéro ET bon total, ou photo très ressemblante
    for (const c of out) c.confident = (c.numOk && c.ofOk && (c.visual == null || c.visual > 0.15)) || (c.visual != null && c.visual >= 0.65);
    return out.slice(0, 8);
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

  /** Ajoute une carte scannée à la collection, avec sa photo comme visuel */
  async function addScanned(c, blob) {
    const set = c.set ? { id: c.set.id, name: c.set.name, symbol: c.set.symbol, logo: c.set.logo, official: c.set.cardCount && c.set.cardCount.official, group: c.set.serie || { id: c.serieId } } : null;
    const before = App.col.get(game, c.id);
    await App.col.add(game, { ...c, serieId: c.serieId || (c.set && c.set.serie ? c.set.serie.id : '') }, set);
    const key = App.col.keyOf(game, c.id);
    // la photo du scan devient le visuel (pour un exemplaire de plus, elle s'ajoute à tes photos)
    await App.col.addPhoto(key, blob, { makeDisplay: !before || !before.displayPhoto });
    return key;
  }

  function stop() { if (worker) { worker.terminate(); worker = null; workerP = null; } }

  return { recognize, manual, readSummary, addScanned, looksEmpty, stop, RATIO: 63 / 88 };
})();
