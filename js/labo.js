/*
 * Labo (labo.html) : banc d'essai des méthodes de reconnaissance d'une carte — outil de test, pas utilisé par le site.
 * Les photos de test et leurs bonnes réponses (_tests-scanner/verite.json) restent sur le PC d'Arnaud :
 * la page ne marche donc qu'en local (http://localhost:8765/labo.html).
 *
 * Chaque carte des photos de test est découpée comme le fait le scanner, puis chaque méthode donne sa réponse.
 * Les méthodes « visuelles » comparent la carte aux visuels officiels de toutes les cartes des séries concernées
 * (+ séries de réimpressions : Évolutions, Base Set 2) ; le scanner actuel cherche dans toute la base.
 */
(() => {
  const { esc } = App.util;
  const R = App.recognizer;
  const ad = () => App.games.get('pokemon');
  const TEST = '_tests-scanner/';
  const FORMATS = { '3x3': [3, 3, ''], '4x3': [4, 3, ''], '2x2': [2, 2, ''] };
  const EXTRA_SETS = ['xy12', 'base4']; // réimpressions qui ressemblent (Évolutions ↔ Set de Base, Base Set 2 ↔ Base/Jungle)
  const KEY = 'labo1:'; // empreintes des visuels officiels gardées dans IndexedDB
  const LIBS = {
    cv: { src: 'https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.10.0-release.1/dist/opencv.js', sri: 'sha384-XsTfGA62I8LzqS3D7IcgiSOCrJuECWLcg4s1M0AnrkDCcJ8lXX+j+qdg+o6t7KZa' },
    tf: { src: 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js', sri: 'sha384-vE8hbVJ4lezako5rlvE7bY0BVzWlFhZncPlckrqNwcUQpVtgbENTgZ8TBbnPjZre' },
  };
  const MN_URL = 'https://storage.googleapis.com/tfjs-models/savedmodel/mobilenet_v2_1.0_224/model.json';
  const MN_NODE = 'module_apply_default/MobilenetV2/Logits/AvgPool';

  const METHODS = [
    { id: 'actuel', name: 'Scanner actuel', desc: 'Lecture du texte (numéro, nom, attaques) + ressemblance de l’illustration ; recherche dans toute la base TCGdex.' },
    { id: 'illus', name: 'Empreinte de l’illustration', desc: 'Illustration réduite à 24 × 16 en gris, 75 recadrages essayés : la partie « visuelle » du scanner actuel, seule.' },
    { id: 'phash', name: 'pHash', desc: 'Empreinte perceptuelle de 64 bits (transformée en cosinus) de l’illustration, comparée bit à bit.' },
    { id: 'orb', name: 'Points clés ORB', desc: '500 petits détails repérés sur la carte (OpenCV), appariés puis vérifiés géométriquement (RANSAC).' },
    { id: 'mobilenet', name: 'Réseau de neurones', desc: 'MobileNet v2 : 1 280 caractéristiques apprises (carte entière + illustration), comparées par cosinus.' },
    { id: 'hybride', name: 'Hybride : réseau + points clés', desc: 'Le réseau de neurones présélectionne 40 cartes, les points clés ORB tranchent (vérification géométrique).', combo: true },
    { id: 'texte', name: 'Points clés + numéro lu', desc: 'Points clés ORB, et le numéro lu en bas de la carte (ex. 37/102) départage les cartes au même dessin.', combo: true },
    { id: 'repli', name: 'Hybride + repli', desc: 'Hybride ; s’il trouve peu de points en commun (score < 25), points clés dans toute la base.', combo: true },
    { id: 'ameliore', name: 'Hybride amélioré', desc: 'Présélection élargie à la série devinée sur la page et aux cartes trouvées par le texte (scanner actuel), puis repli si pas sûr. Temps de lecture du texte compris.', combo: true },
    { id: 'ameliore2', name: 'Amélioré + bonus série', desc: 'Comme l’hybride amélioré, et en classeur les cartes de la série devinée sur la page gagnent 20 % (réimpressions au même dessin).', combo: true },
  ];

  const S = { refs: [], byId: new Map(), feats: [], queries: [], results: {}, log: [] };
  window.__labo = S; // pour les essais dans la console

  // ---------- Outils ----------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const canvas = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });
  const toBlob = (c, q = 0.92) => new Promise((res) => c.toBlob(res, 'image/jpeg', q));
  function loadScript({ src, sri }) {
    return new Promise((res, rej) => {
      if (document.querySelector(`script[src="${src}"]`)) return res();
      const s = document.createElement('script');
      s.src = src; s.integrity = sri; s.crossOrigin = 'anonymous';
      s.onload = res; s.onerror = () => rej(new Error('Chargement impossible : ' + src));
      document.head.appendChild(s);
    });
  }
  let cvP = null;
  const loadCV = () => cvP || (cvP = (async () => {
    await loadScript(LIBS.cv);
    let cv = window.cv;
    if (cv instanceof Promise) cv = await cv;
    else if (!cv.Mat) await new Promise((r) => { cv.onRuntimeInitialized = r; });
    // le module d'OpenCV a une méthode « then » : l'attendre ou le renvoyer d'une fonction async tourne en boucle sans fin
    if (typeof cv.then === 'function') delete cv.then;
    window.cv = cv;
    return true;
  })());
  let tfP = null;
  const loadTF = () => tfP || (tfP = (async () => {
    await loadScript(LIBS.tf);
    await tf.ready();
    const model = await tf.loadGraphModel(MN_URL);
    return model;
  })());

  /** Visuel officiel (le serveur de TCGdex refuse parfois une requête au hasard : on réessaie) */
  async function fetchBitmap(url) {
    for (let i = 0; i < 4; i++) {
      try {
        const u = i === 3 ? url.replace(/\.webp$/, '.png') : url;
        const r = await fetch(u, { mode: 'cors' });
        if (r.status === 404) return null;
        if (r.ok) return await createImageBitmap(await r.blob());
      } catch (e) { /* on réessaie */ }
      await sleep(300 * (i + 1));
    }
    return null;
  }

  /** Certains visuels officiels sont des photos de la carte sur fond sombre : on ne garde que la carte */
  function trimBackground(bmp) {
    const W = 120, H = Math.max(40, Math.round(120 * bmp.height / bmp.width));
    const c = canvas(W, H), g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bmp, 0, 0, W, H);
    const p = g.getImageData(0, 0, W, H).data, lum = (x, y) => { const i = (y * W + x) * 4; return 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]; };
    let sum = 0, n = 0; const m = Math.max(2, Math.round(W * 0.03));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x < m || x >= W - m || y < m || y >= H - m) { sum += lum(x, y); n++; }
    const bg = sum / n;
    if (bg > 70) return bmp;
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
    const k = bmp.width / W, out = canvas(Math.round(w * k), Math.round(h * k));
    out.getContext('2d').drawImage(bmp, x0 * k, y0 * k, w * k, h * k, 0, 0, out.width, out.height);
    return out;
  }
  /** Rognage de `f` (0…0,5) de chaque côté */
  function inset(src, f) {
    if (!f) return src;
    const W = src.width, H = src.height, c = canvas(Math.round(W * (1 - 2 * f)), Math.round(H * (1 - 2 * f)));
    c.getContext('2d').drawImage(src, W * f, H * f, c.width, c.height, 0, 0, c.width, c.height);
    return c;
  }

  // ---------- Méthode « illustration » (copie de la ressemblance du scanner) ----------
  const ART = { x0: 0.09, x1: 0.91, y0: 0.11, y1: 0.50 }, AW = 24, AH = 16;
  function artVec(bmp, dx = 0, dy = 0, sc = 1) {
    const W = bmp.width, H = bmp.height;
    const cx = (ART.x0 + ART.x1) / 2 + dx, cy = (ART.y0 + ART.y1) / 2 + dy, w = (ART.x1 - ART.x0) * sc, h = (ART.y1 - ART.y0) * sc;
    const c = canvas(AW, AH), g = c.getContext('2d', { willReadFrequently: true }); g.filter = 'blur(0.5px)';
    g.drawImage(bmp, W * (cx - w / 2), H * (cy - h / 2), W * w, H * h, 0, 0, AW, AH);
    const p = g.getImageData(0, 0, AW, AH).data, n = AW * AH, v = new Float32Array(n);
    let m = 0; for (let i = 0; i < n; i++) { v[i] = 0.299 * p[i * 4] + 0.587 * p[i * 4 + 1] + 0.114 * p[i * 4 + 2]; m += v[i]; }
    m /= n; let sd = 0; for (let i = 0; i < n; i++) sd += (v[i] - m) ** 2; sd = Math.sqrt(sd / n) || 1;
    for (let i = 0; i < n; i++) v[i] = (v[i] - m) / sd;
    return v;
  }
  function artVariants(bmp) {
    const out = [];
    for (const sc of [0.9, 1, 1.1]) for (const dx of [-0.06, -0.03, 0, 0.03, 0.06]) for (const dy of [-0.06, -0.03, 0, 0.03, 0.06]) out.push(artVec(bmp, dx, dy, sc));
    return out;
  }
  function artScore(variants, ref) {
    let best = -1;
    for (const v of variants) { let s = 0; for (let i = 0; i < v.length; i++) s += v[i] * ref[i]; s /= v.length; if (s > best) best = s; }
    return best;
  }

  // ---------- pHash ----------
  const PN = 32, COS = (() => { const t = new Float32Array(PN * PN); for (let u = 0; u < PN; u++) for (let x = 0; x < PN; x++) t[u * PN + x] = Math.cos(((2 * x + 1) * u * Math.PI) / (2 * PN)); return t; })();
  /** Empreinte 64 bits d'une zone (fractions de la carte) */
  function pHash(src, z = { x0: 0, x1: 1, y0: 0, y1: 1 }) {
    const W = src.width, H = src.height, c = canvas(PN, PN), g = c.getContext('2d', { willReadFrequently: true });
    g.filter = 'grayscale(1)';
    g.drawImage(src, W * z.x0, H * z.y0, W * (z.x1 - z.x0), H * (z.y1 - z.y0), 0, 0, PN, PN);
    const p = g.getImageData(0, 0, PN, PN).data, a = new Float32Array(PN * PN);
    for (let i = 0; i < PN * PN; i++) a[i] = p[i * 4];
    // DCT séparable, on ne garde que les 8 × 8 basses fréquences
    const tmp = new Float32Array(8 * PN);
    for (let u = 0; u < 8; u++) for (let y = 0; y < PN; y++) { let s = 0; for (let x = 0; x < PN; x++) s += a[y * PN + x] * COS[u * PN + x]; tmp[u * PN + y] = s; }
    const d = new Float32Array(64);
    for (let u = 0; u < 8; u++) for (let v = 0; v < 8; v++) { let s = 0; for (let y = 0; y < PN; y++) s += tmp[u * PN + y] * COS[v * PN + y]; d[v * 8 + u] = s; }
    const rest = [...d.slice(1)].sort((x, y) => x - y), med = rest[31];
    const bits = new Uint32Array(2);
    for (let i = 1; i < 64; i++) if (d[i] > med) bits[i >> 5] |= 1 << (i & 31);
    return bits;
  }
  const pop = (x) => { x -= (x >>> 1) & 0x55555555; x = (x & 0x33333333) + ((x >>> 2) & 0x33333333); return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24; };
  const hamming = (a, b) => pop(a[0] ^ b[0]) + pop(a[1] ^ b[1]);
  const PH_ZONE = { x0: 0.09, x1: 0.91, y0: 0.11, y1: 0.50 };
  /** Photo : plusieurs recadrages (la découpe garde un peu de pochette), on garde le plus proche */
  const phVariants = (src) => {
    const out = [];
    for (const sc of [0.92, 1, 1.08]) for (const dx of [-0.03, 0, 0.03]) for (const dy of [-0.03, 0, 0.03]) {
      const cx = 0.5 + dx, cy = (PH_ZONE.y0 + PH_ZONE.y1) / 2 + dy, w = (PH_ZONE.x1 - PH_ZONE.x0) * sc, h = (PH_ZONE.y1 - PH_ZONE.y0) * sc;
      out.push(pHash(src, { x0: cx - w / 2, x1: cx + w / 2, y0: cy - h / 2, y1: cy + h / 2 }));
    }
    return out;
  };

  // ---------- ORB (OpenCV) ----------
  let orb = null;
  function orbFeat(src, W = 300) {
    const H = Math.round(W * 88 / 63), c = canvas(W, H);
    c.getContext('2d').drawImage(src, 0, 0, W, H);
    const m = cv.imread(c), gray = new cv.Mat(), kp = new cv.KeyPointVector(), des = new cv.Mat(), none = new cv.Mat();
    try {
      cv.cvtColor(m, gray, cv.COLOR_RGBA2GRAY);
      if (!orb) orb = new cv.ORB(500);
      orb.detectAndCompute(gray, none, kp, des);
      const n = des.rows, pts = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) { const k = kp.get(i); pts[2 * i] = k.pt.x; pts[2 * i + 1] = k.pt.y; }
      return { n, pts, des: new Uint8Array(des.data.slice(0, n * 32)) };
    } finally { m.delete(); gray.delete(); kp.delete(); des.delete(); none.delete(); }
  }
  const matOf = (f) => { const m = new cv.Mat(f.n, 32, cv.CV_8U); m.data.set(f.des); return m; };
  let orbIndex = null; // toutes les empreintes des visuels, par paquets de 50 000 points (d'un seul bloc, OpenCV manque de mémoire)
  function buildOrbIndex() {
    if (orbIndex) orbIndex.chunks.forEach((c) => c.mat.delete());
    const list = S.feats.map((f, i) => [i, f && f.orb]).filter(([, o]) => o && o.n);
    const total = list.reduce((t, [, o]) => t + o.n, 0), owner = new Int32Array(total), all = new Uint8Array(total * 32);
    let r = 0;
    for (const [i, o] of list) { all.set(o.des, r * 32); owner.fill(i, r, r + o.n); r += o.n; }
    const chunks = [], CH = 50000;
    for (let s = 0; s < total; s += CH) { const n = Math.min(CH, total - s), mat = new cv.Mat(n, 32, cv.CV_8U); mat.data.set(all.subarray(s * 32, (s + n) * 32)); chunks.push({ mat, start: s }); }
    orbIndex = { chunks, owner, total, matcher: new cv.BFMatcher(cv.NORM_HAMMING, false) };
  }
  /** Nombre de points qui tombent au même endroit une fois la carte remise à plat (RANSAC) */
  function orbVerify(q, qm, ref) {
    if (!ref || ref.n < 8) return 0;
    const rm = matOf(ref), mm = new cv.DMatchVectorVector();
    try {
      orbIndex.matcher.knnMatch(qm, rm, mm, 2);
      const src = [], dst = [];
      for (let i = 0; i < mm.size(); i++) {
        const v = mm.get(i); if (v.size() < 2) continue;
        const a = v.get(0), b = v.get(1);
        if (a.distance < 0.8 * b.distance) { src.push(q.pts[2 * a.queryIdx], q.pts[2 * a.queryIdx + 1]); dst.push(ref.pts[2 * a.trainIdx], ref.pts[2 * a.trainIdx + 1]); }
      }
      const n = src.length / 2;
      if (n < 6) return n * 0.1;
      const sM = cv.matFromArray(n, 1, cv.CV_32FC2, src), dM = cv.matFromArray(n, 1, cv.CV_32FC2, dst), mask = new cv.Mat();
      try {
        const h = cv.findHomography(sM, dM, cv.RANSAC, 6, mask);
        let inl = 0; if (!h.empty()) for (let i = 0; i < mask.rows; i++) inl += mask.data[i] ? 1 : 0;
        h.delete();
        return inl;
      } finally { sM.delete(); dM.delete(); mask.delete(); }
    } finally { rm.delete(); mm.delete(); }
  }
  function orbRank(src) {
    const q = orbFeat(src), qm = matOf(q), scores = new Float32Array(S.refs.length);
    try {
      // 1) vote : chaque point de la photo vote pour le visuel où se trouve son plus proche voisin
      const bestD = new Float32Array(q.n).fill(1e9), bestO = new Int32Array(q.n).fill(-1);
      for (const ch of orbIndex.chunks) {
        const mm = new cv.DMatchVector();
        orbIndex.matcher.match(qm, ch.mat, mm);
        for (let i = 0; i < mm.size(); i++) { const m = mm.get(i); if (m.distance < bestD[m.queryIdx]) { bestD[m.queryIdx] = m.distance; bestO[m.queryIdx] = orbIndex.owner[ch.start + m.trainIdx]; } }
        mm.delete();
      }
      for (let i = 0; i < q.n; i++) if (bestO[i] >= 0 && bestD[i] <= 64) scores[bestO[i]] += 0.01;
      // 2) les 25 visuels les plus votés sont vérifiés un par un (géométrie)
      const top = [...scores.keys()].sort((a, b) => scores[b] - scores[a]).slice(0, 25);
      for (const i of top) scores[i] += orbVerify(q, qm, S.feats[i].orb);
    } finally { qm.delete(); }
    return scores;
  }

  // ---------- MobileNet ----------
  let mnModel = null;
  function embed(src, z = null) {
    const c = canvas(224, 224), g = c.getContext('2d', { willReadFrequently: true });
    if (z) g.drawImage(src, src.width * z.x0, src.height * z.y0, src.width * (z.x1 - z.x0), src.height * (z.y1 - z.y0), 0, 0, 224, 224);
    else g.drawImage(src, 0, 0, 224, 224);
    // pixels lus par le processeur (getImageData) : en passant le canvas directement à la carte graphique,
    // le résultat changeait parfois d'un appel à l'autre pour la même image
    const px = g.getImageData(0, 0, 224, 224);
    const t = tf.tidy(() => mnModel.execute(tf.browser.fromPixels(px).toFloat().div(255).expandDims(0), MN_NODE).reshape([-1]));
    const v = t.dataSync().slice(); t.dispose();
    let n = 0; for (const x of v) n += x * x; n = Math.sqrt(n) || 1;
    return Float32Array.from(v, (x) => x / n);
  }
  const mnFeat = (src) => ({ full: embed(src), art: embed(src, ART) });
  const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

  // ---------- Références (visuels officiels) ----------
  async function loadTruth() {
    const r = await fetch(TEST + 'verite.json', { cache: 'no-store' }).catch(() => null);
    if (!r || !r.ok) throw new Error('Photos de test introuvables : cette page ne marche que sur le PC (dossier _tests-scanner).');
    const t = await r.json(); delete t._lisezmoi;
    return t;
  }
  async function loadRefs(truth, log) {
    const A = ad();
    await A.listSets(); // remplit la liste des séries seulement en anglais
    const ids = new Set(EXTRA_SETS);
    for (const t of Object.values(truth)) for (const c of t.cards) if (c) ids.add(c.slice(0, c.lastIndexOf('-')));
    const refs = [];
    for (const id of ids) {
      try {
        const set = await A.getSet(id);
        for (const c of set.cards) refs.push({ ...c, setId: c.setId || id, setName: set.name, official: set.official, serieId: c.serieId || (set.group && set.group.id) });
      } catch (e) { log(`Série ${id} introuvable (${e.message})`); }
    }
    S.refs = refs; S.byId = new Map(refs.map((c, i) => [c.id, i]));
    S.sets = [...ids];
    return refs;
  }
  /** Empreintes de chaque visuel officiel (téléchargé une seule fois, puis gardé dans IndexedDB) */
  async function buildFeats(progress) {
    const cvx = await loadCV(); mnModel = await loadTF(); void cvx;
    S.feats = new Array(S.refs.length).fill(null);
    let missing = 0;
    await App.util.pool(S.refs, 6, async (c, i) => {
      const key = KEY + c.id;
      const hit = await App.db.get('cache', key).catch(() => null);
      if (hit && (hit.v || hit.miss)) { S.feats[i] = hit.v || null; if (!hit.v) missing++; return; }
      const url = ad().img.card(c, 'low');
      let bmp = url ? await fetchBitmap(url) : null;
      if (!bmp && url && !/\/en\//.test(url)) bmp = await fetchBitmap(url.replace(/(assets\.tcgdex\.net\/)[a-z-]+\//, '$1en/'));
      if (!bmp) { missing++; App.db.set('cache', key, { miss: true, t: Date.now() }).catch(() => {}); return; }
      const src = trimBackground(bmp);
      const f = { art: artVec(src), ph: pHash(src, PH_ZONE), orb: orbFeat(src), mn: mnFeat(src) };
      S.feats[i] = f;
      App.db.set('cache', key, { v: f, t: Date.now() }).catch(() => {});
    }, progress);
    buildOrbIndex();
    return missing;
  }

  // ---------- Cartes à reconnaître (découpées comme le fait le scanner) ----------
  async function buildQueries(truth, log) {
    const out = [];
    for (const [n, t] of Object.entries(truth).sort(([a], [b]) => a.localeCompare(b))) {
      try {
        const blob = await (await fetch(TEST + n + (t.ext || '.jpg'))).blob();
        const img = await createImageBitmap(blob);
        const push = async (c, i, cv0) => out.push({ n, i, kind: t.type, want: c, blob: await toBlob(cv0), note: t.note || '' });
        if (t.type === 'decoupe') {
          const [x0, y0, x1, y1] = t.rect, k = 1.2, c = canvas(Math.round((x1 - x0) * k), Math.round((y1 - y0) * k));
          c.getContext('2d').drawImage(img, x0 * k, y0 * k, c.width, c.height, 0, 0, c.width, c.height);
          await push(t.cards[0], 0, c);
        } else if (t.type === 'photo') {
          // (comme le scanner : le cadre trouvé n'est gardé que si la carte fait plus de 55 % de la hauteur)
          const W = img.width, H = img.height, f = R.locateCard(img, { x: 0, y: 0, w: W, h: H }, 0.45);
          const cell = f && f.h > H * 0.55 ? { x: f.x / W, y: f.y / H, w: f.w / W, h: f.h / H } : (() => { const h = Math.min(0.94, 0.94 * W / H / (63 / 88)), w = h * H / W * (63 / 88); return { x: (1 - w) / 2, y: (1 - h) / 2, w, h }; })();
          await push(t.cards[0], 0, R.cellCard(img, cell).canvas);
        } else if (t.cells) {
          for (let i = 0; i < t.cards.length; i++) {
            const [x0, y0, x1, y1] = t.cells[i];
            if (t.cards[i]) await push(t.cards[i], i, R.cellCard(img, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }).canvas);
          }
        } else {
          const pg = R.detectPage(img, FORMATS, '3x3');
          const cells = pg.grid && pg.grid.cells;
          if (!cells || cells.length < t.cards.length) { log(`Photo ${n} : grille non trouvée (${cells ? cells.length : 0} cases)`); continue; }
          for (let i = 0; i < t.cards.length; i++) if (t.cards[i]) await push(t.cards[i], i, R.cellCard(img, cells[i], pg.grid.rot || 0).canvas);
        }
      } catch (e) { log(`Photo ${n} : ${e.message}`); }
    }
    for (const q of out) q.url = URL.createObjectURL(q.blob);
    S.queries = out;
    return out;
  }

  // ---------- Hybride (réseau de neurones → points clés) ----------
  const FALLBACK = 25; // moins de points en commun que ça : l'hybride n'est pas sûr (mesuré : erreurs de présélection ≤ 21)
  /** Le réseau présélectionne 40 cartes (+ `extra`), les points clés vérifient ; best = meilleur score */
  function hybridScores(bmp, extra = []) {
    const n = S.refs.length, scores = new Float32Array(n).fill(-1e9);
    const e = mnFeat(bmp);
    for (let i = 0; i < n; i++) if (S.feats[i]) { const f = S.feats[i].mn; scores[i] = (dot(e.full, f.full) + dot(e.art, f.art)) / 2; }
    const short = new Set([...[...scores.keys()].sort((a, b) => scores[b] - scores[a]).slice(0, 40), ...extra.filter((i) => S.feats[i])]);
    const of = orbFeat(bmp), qm = matOf(of);
    let best = -1e9;
    try { for (const i of short) { scores[i] += orbVerify(of, qm, S.feats[i].orb); if (scores[i] > best) best = scores[i]; } } finally { qm.delete(); }
    return { scores, best };
  }
  /** Série de la page de classeur : celle des autres cartes de la page reconnues avec assurance (≥ 2 votes) */
  async function pageSeries(q) {
    const votes = {};
    for (const x of S.queries) {
      if (x.n !== q.n || x === q) continue;
      if (!x.hy) {
        const h = hybridScores(x.bmp || (x.bmp = await createImageBitmap(x.blob)));
        let bi = 0; for (let i = 1; i < h.scores.length; i++) if (h.scores[i] > h.scores[bi]) bi = i;
        x.hy = { set: S.refs[bi].setId, s: h.best };
      }
      if (x.hy.s >= FALLBACK) votes[x.hy.set] = (votes[x.hy.set] || 0) + 1;
    }
    const [set, v] = Object.entries(votes).sort((a, b) => b[1] - a[1])[0] || [];
    return v >= 2 ? set : null;
  }

  // ---------- Essai d'une méthode sur une carte ----------
  const topOf = (scores, k = 5) => [...scores.keys()].filter((i) => S.feats[i]).sort((a, b) => scores[b] - scores[a]).slice(0, k).map((i) => ({ id: S.refs[i].id, s: +scores[i].toFixed(3) }));
  async function runOne(method, q) {
    const t0 = performance.now();
    let top = [], fb = false;
    if (method === 'actuel') {
      const { cands } = await R.recognize(q.blob, null, { atkBand: q.kind !== 'page' }); q.cands = cands;
      top = cands.slice(0, 5).map((c) => ({ id: c.id, s: +(c.score || 0).toFixed(2), sure: !!c.confident, name: c.name, label: `${c.name} ${c.localId}` }));
    } else {
      const bmp = q.bmp || (q.bmp = await createImageBitmap(q.blob));
      const n = S.refs.length, scores = new Float32Array(n).fill(-1e9);
      if (method === 'illus') {
        const v = q.artV || (q.artV = artVariants(bmp));
        for (let i = 0; i < n; i++) if (S.feats[i]) scores[i] = artScore(v, S.feats[i].art);
      } else if (method === 'phash') {
        const v = q.phV || (q.phV = phVariants(bmp));
        for (let i = 0; i < n; i++) if (S.feats[i]) { let d = 64; for (const h of v) d = Math.min(d, hamming(h, S.feats[i].ph)); scores[i] = 64 - d; }
      } else if (method === 'orb' || method === 'texte') {
        const sc = (method === 'texte' && q.scores && q.scores.orb) || orbRank(bmp);
        for (let i = 0; i < n; i++) if (S.feats[i]) scores[i] = sc[i];
        if (method === 'texte') {
          // + le numéro lu en bas de la carte (lecture seule, sans recherche) : départage les cartes au même dessin
          // (Set de Base ↔ Base Set 2, holo ↔ non holo) ; il ne compte que pour les 40 cartes qui ressemblent le plus
          const info = q.info || (q.info = await R.read(q.blob, null, { atkBand: q.kind !== 'page' }));
          const num = info.num;
          if (num) {
            for (const i of [...scores.keys()].sort((a, b) => scores[b] - scores[a]).slice(0, 40)) {
              const c = S.refs[i], ln = parseInt(c.localId, 10), ofOk = num.of && c.official === num.of;
              if (ln === num.n || (ofOk && ln >= 100 && ln % 100 === num.n)) scores[i] += ofOk ? 40 : 15; // (un chiffre perdu devant : « 01/100 » = 101/100)
              else if (ofOk) scores[i] += 5;
            }
          }
        }
      } else if (method === 'repli' || method === 'ameliore' || method === 'ameliore2') {
        const extra = [];
        if (method !== 'repli') {
          // présélection élargie : toute la série devinée sur la page (classeur) + les cartes trouvées par le texte
          const set = q.kind === 'page' ? await pageSeries(q) : null;
          if (set) S.refs.forEach((c, i) => { if (c.setId === set) extra.push(i); });
          const cands = q.cands || (q.cands = (await R.recognize(q.blob, null, { atkBand: q.kind !== 'page' })).cands);
          for (const c of cands) { const i = S.byId.get(c.id); if (i != null) extra.push(i); }
          q.extra = { set, n: extra.length };
        }
        const h = hybridScores(bmp, extra);
        scores.set(h.scores);
        // pas sûr (peu de points en commun) : on cherche avec les points clés dans toute la base
        if (h.best < FALLBACK) { const sc = orbRank(bmp); for (let i = 0; i < n; i++) if (S.feats[i]) scores[i] = sc[i]; fb = true; }
        // série de la page connue : ses cartes passent devant une réimpression au même dessin (Set de Base ↔ Base Set 2)
        if (method === 'ameliore2' && q.extra.set) S.refs.forEach((c, i) => { if (c.setId === q.extra.set && scores[i] > 0) scores[i] *= 1.2; });
      } else {
        const e = mnFeat(bmp);
        for (let i = 0; i < n; i++) if (S.feats[i]) { const f = S.feats[i].mn; scores[i] = (dot(e.full, f.full) + dot(e.art, f.art)) / 2; }
        if (method !== 'mobilenet') {
          // les 40 cartes que le réseau trouve les plus proches sont vérifiées par les points clés (géométrie)
          const short = [...scores.keys()].sort((a, b) => scores[b] - scores[a]).slice(0, 40);
          const of = orbFeat(bmp), qm = matOf(of);
          try { for (const i of short) scores[i] += orbVerify(of, qm, S.feats[i].orb); } finally { qm.delete(); }
        }
      }
      q.scores = q.scores || {}; q.scores[method] = scores;
      top = topOf(scores);
    }
    const ms = Math.round(performance.now() - t0);
    const want = q.want, name = (id) => { const i = S.byId.get(id); return i != null ? S.refs[i].name : null; };
    return { top, ms, fb, ok: top[0] && top[0].id === want, top3: top.slice(0, 3).some((x) => x.id === want), sameName: !!(top[0] && (top[0].name || name(top[0].id)) && App.util.norm(top[0].name || name(top[0].id)) === App.util.norm(name(want) || '')) };
  }

  // ---------- Affichage ----------
  const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
  function summary(results) {
    return METHODS.filter((m) => results[m.id]).map((m) => {
      const rs = Object.values(results[m.id]);
      const by = (f) => rs.filter(f);
      const group = (k) => { const g = rs.filter((r) => r.kind === k); return { n: g.length, ok: g.filter((r) => r.ok).length }; };
      return { m, n: rs.length, fb: by((r) => r.fb).length, ok: by((r) => r.ok).length, top3: by((r) => r.top3).length, sameName: by((r) => r.ok || r.sameName).length, ms: Math.round(rs.reduce((t, r) => t + r.ms, 0) / (rs.length || 1)), page: group('page'), seule: { n: group('photo').n + group('decoupe').n, ok: group('photo').ok + group('decoupe').ok } };
    });
  }
  function render() {
    const el = document.getElementById('labo');
    const sum = summary(S.results);
    const best = sum.reduce((b, s) => (!b || s.ok / s.n > b.ok / b.n ? s : b), null);
    const refName = (id) => { const i = S.byId.get(id); const c = i != null ? S.refs[i] : null; return c ? `${c.name} ${c.localId} · ${c.setName}` : id; };
    el.innerHTML = `
      <h1>Labo — reconnaissance des cartes</h1>
      <p class="muted">Chaque carte des photos de test est découpée comme le fait le scanner, puis chaque méthode donne sa réponse. Les méthodes visuelles comparent la carte aux <b>${S.refs.length || '…'}</b> visuels officiels des séries concernées (+ réimpressions : Évolutions, Base Set 2) ; le scanner actuel cherche dans toute la base.</p>
      <div class="lab-bar">
        <button class="btn primary" id="lab-run">Lancer le test</button>
        ${METHODS.map((m) => `<label class="lab-chk"><input type="checkbox" data-m="${m.id}" checked> ${esc(m.name)}</label>`).join('')}
      </div>
      <div id="lab-status" class="muted">${esc(S.status || '')}</div>
      ${sum.length ? `<div class="lab-tablewrap"><table class="lab-table">
        <thead><tr><th>Méthode</th><th>Bonne carte (1ʳᵉ)</th><th>Dans les 3 premières</th><th>Bon Pokémon</th><th>Classeur</th><th>Carte seule</th><th>Temps / carte</th></tr></thead>
        <tbody>${sum.map((s) => `<tr class="${s === best ? 'best' : ''}"><td><b>${esc(s.m.name)}</b><div class="muted small">${esc(s.m.desc)}</div></td>
          <td class="big">${pct(s.ok, s.n)} %<div class="muted small">${s.ok} / ${s.n}</div></td><td>${pct(s.top3, s.n)} %</td><td>${pct(s.sameName, s.n)} %</td>
          <td>${pct(s.page.ok, s.page.n)} %<div class="muted small">${s.page.ok} / ${s.page.n}</div></td><td>${pct(s.seule.ok, s.seule.n)} %<div class="muted small">${s.seule.ok} / ${s.seule.n}</div></td><td>${s.ms >= 1000 ? (s.ms / 1000).toFixed(1) + ' s' : s.ms + ' ms'}${s.fb ? `<div class="muted small">repli : ${s.fb} cartes</div>` : ''}</td></tr>`).join('')}</tbody>
      </table></div>` : ''}
      ${S.queries.length ? `<h2>Carte par carte</h2><div class="lab-grid">${S.queries.map((q, k) => `<div class="lab-card">
        <img src="${q.url}" alt="">
        <div class="lab-want"><b>${esc(refName(q.want))}</b><div class="muted small">photo ${esc(q.n)}${q.kind === 'page' ? ' · case ' + (q.i + 1) : ''}${q.note ? ' · ' + esc(q.note) : ''}</div></div>
        ${METHODS.filter((m) => S.results[m.id] && S.results[m.id][k]).map((m) => { const r = S.results[m.id][k]; const got = r.top[0]; return `<div class="lab-ans ${r.ok ? 'ok' : r.top3 ? 'near' : 'ko'}" title="${esc(r.top.map((x) => (x.label || refName(x.id)) + ' (' + x.s + ')').join(' · '))}"><span>${esc(m.name)}</span><span>${r.ok ? '✓' : esc(got ? got.label || refName(got.id) : '—')}</span></div>`; }).join('')}
      </div>`).join('')}</div>` : ''}
      <details class="lab-log"><summary>Journal</summary><pre>${esc(S.log.join('\n'))}</pre></details>`;
    el.querySelector('#lab-run').addEventListener('click', () => run([...el.querySelectorAll('[data-m]:checked')].map((x) => x.dataset.m)));
  }
  function setStatus(t) { S.status = t; const s = document.getElementById('lab-status'); if (s) s.textContent = t; }
  const log = (t) => { S.log.push(t); console.log('[labo]', t); };

  let running = false;
  async function run(methods) {
    if (running) return; running = true;
    try {
      const btn = document.getElementById('lab-run'); if (btn) btn.disabled = true;
      setStatus('Lecture des bonnes réponses…');
      const truth = await loadTruth();
      if (!S.refs.length) { setStatus('Liste des cartes des séries concernées…'); await loadRefs(truth, log); }
      if (!S.feats.length && methods.some((m) => m !== 'actuel')) {
        setStatus('Chargement d’OpenCV et du réseau de neurones…');
        const missing = await buildFeats((d, n) => setStatus(`Empreintes des visuels officiels : ${d} / ${n} (gardées pour la prochaine fois)`));
        log(`${S.refs.length} visuels de référence (${S.sets.join(', ')}), ${missing} sans image`);
      }
      if (!S.queries.length) { setStatus('Découpe des cartes sur les photos de test…'); await buildQueries(truth, log); log(`${S.queries.length} cartes à reconnaître`); }
      for (const m of methods) {
        S.results[m] = {};
        for (let k = 0; k < S.queries.length; k++) {
          setStatus(`${METHODS.find((x) => x.id === m).name} : carte ${k + 1} / ${S.queries.length}`);
          const q = S.queries[k];
          try { S.results[m][k] = { ...(await runOne(m, q)), kind: q.kind }; } catch (e) { log(`${m} / photo ${q.n} : ${e.message}`); S.results[m][k] = { top: [], ms: 0, ok: false, top3: false, kind: q.kind, err: String(e) }; }
          await sleep(0);
        }
        render();
      }
      setStatus('Terminé.');
      App.db.set('cache', 'labo:last', { t: Date.now(), results: S.results }).catch(() => {});
    } catch (e) { console.error(e); setStatus('Erreur : ' + e.message); log(String(e.stack || e)); }
    finally { running = false; render(); }
  }

  App.labo = { run, render, METHODS, S, _: { orbFeat, orbRank, orbVerify, matOf, buildOrbIndex, mnFeat, artVariants, phVariants, get orbIndex() { return orbIndex; } } };
  render();
  // derniers résultats gardés sur l'appareil : le tableau s'affiche tout de suite, sans tout relancer
  App.db.get('cache', 'labo:last').then((h) => {
    if (h && h.results && !Object.keys(S.results).length) { S.results = h.results; S.status = `Derniers résultats : ${new Date(h.t).toLocaleString('fr-FR')}. « Lancer le test » pour les refaire (ou pour voir les cartes une par une).`; render(); }
  }).catch(() => {});
})();
