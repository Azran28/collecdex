/*
 * Comparaison d'images en arrière-plan (Web Worker) : réseau de neurones MobileNet + points clés ORB (OpenCV).
 * Méthode choisie grâce au Labo (labo.html, 28 sept. 2026) : le réseau présélectionne les cartes les plus proches,
 * les points clés tranchent (vérification géométrique). Sur les 90 cartes de test : 96 % avec la série de la page.
 *
 * Pourquoi un worker : OpenCV.js a besoin d'« eval », interdit sur le site (CSP) ; un worker a ses propres règles
 * (celles de son fichier, sans CSP), et les calculs ne figent pas la page. Les bibliothèques sont vérifiées
 * (empreinte sha384) avant d'être exécutées, comme avec l'attribut « integrity » sur la page.
 *
 * Messages reçus : { op: 'rank', rid, qid, blob, refs: [{ id, url, set }], must: [id], bonusSet, bonus }
 *   → { rid, ok: true, res: [{ id, s }] (meilleures d'abord), best } ; { op: 'progress', rid, done, total } pendant les téléchargements.
 *   { op: 'forget', qid } oublie l'empreinte d'une photo.
 */
const LIBS = {
  cv: { src: 'https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.10.0-release.1/dist/opencv.js', sri: 'sha384-XsTfGA62I8LzqS3D7IcgiSOCrJuECWLcg4s1M0AnrkDCcJ8lXX+j+qdg+o6t7KZa' },
  tf: { src: 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js', sri: 'sha384-vE8hbVJ4lezako5rlvE7bY0BVzWlFhZncPlckrqNwcUQpVtgbENTgZ8TBbnPjZre' },
};
const MN_URL = 'https://storage.googleapis.com/tfjs-models/savedmodel/mobilenet_v2_1.0_224/model.json';
const MN_NODE = 'module_apply_default/MobilenetV2/Logits/AvgPool';
const ART = { x0: 0.09, x1: 0.91, y0: 0.11, y1: 0.50 }; // zone de l'illustration
const SHORT = 40; // cartes présélectionnées par le réseau puis vérifiées par les points clés

// ---------- Chargement (une seule fois) ----------
async function loadVerified({ src, sri }) {
  const buf = await (await fetch(src)).arrayBuffer();
  const h = new Uint8Array(await crypto.subtle.digest('SHA-384', buf));
  let bin = ''; for (const b of h) bin += String.fromCharCode(b);
  if ('sha384-' + btoa(bin) !== sri) throw new Error('Bibliothèque modifiée, refusée : ' + src);
  const url = URL.createObjectURL(new Blob([buf], { type: 'text/javascript' }));
  try { importScripts(url); } finally { URL.revokeObjectURL(url); }
}
let readyP = null, model = null, orb = null, matcher = null;
function ready() {
  return readyP || (readyP = (async () => {
    await loadVerified(LIBS.cv);
    let cv = self.cv;
    if (cv instanceof Promise) cv = await cv;
    else if (!cv.Mat) await new Promise((r) => { cv.onRuntimeInitialized = r; });
    // le module d'OpenCV a une méthode « then » : l'attendre ou le renvoyer d'une fonction async tourne en boucle sans fin
    if (typeof cv.then === 'function') delete cv.then;
    self.cv = cv;
    orb = new cv.ORB(500); matcher = new cv.BFMatcher(cv.NORM_HAMMING, false);
    await loadVerified(LIBS.tf);
    await tf.ready();
    model = await tf.loadGraphModel(MN_URL);
    return true;
  })().catch((e) => { readyP = null; throw e; }));
}

// ---------- Empreintes gardées sur l'appareil (IndexedDB à part, 1 entrée ≈ 30 Ko par visuel) ----------
let dbP = null;
const db = () => dbP || (dbP = new Promise((res, rej) => {
  const r = indexedDB.open('collecdex-vis', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('f');
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
}));
const dbGet = async (k) => { const d = await db(); return new Promise((res) => { const r = d.transaction('f').objectStore('f').get(k); r.onsuccess = () => res(r.result); r.onerror = () => res(null); }); };
const dbSet = async (k, v) => { const d = await db(); return new Promise((res) => { const t = d.transaction('f', 'readwrite'); t.objectStore('f').put(v, k); t.oncomplete = res; t.onerror = res; }); };

// ---------- Images ----------
const canvas = (w, h) => new OffscreenCanvas(w, h);
/** Visuel officiel (le serveur de TCGdex refuse parfois une requête au hasard : on réessaie, puis .png) ; GONE = n'existe pas */
const GONE = 'gone';
async function fetchBitmap(url) {
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(i === 3 ? url.replace(/\.webp$/, '.png') : url, { mode: 'cors' });
      if (r.status === 404) return GONE;
      if (r.ok) return await createImageBitmap(await r.blob());
    } catch (e) { /* on réessaie */ }
    await new Promise((res) => setTimeout(res, 300 * (i + 1)));
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

// ---------- Empreintes ----------
function orbFeat(src, W = 300) {
  const H = Math.round(W * 88 / 63), c = canvas(W, H), g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(src, 0, 0, W, H);
  const m = cv.matFromImageData(g.getImageData(0, 0, W, H)), gray = new cv.Mat(), kp = new cv.KeyPointVector(), des = new cv.Mat(), none = new cv.Mat();
  try {
    cv.cvtColor(m, gray, cv.COLOR_RGBA2GRAY);
    orb.detectAndCompute(gray, none, kp, des);
    const n = des.rows, pts = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { const k = kp.get(i); pts[2 * i] = k.pt.x; pts[2 * i + 1] = k.pt.y; }
    return { n, pts, des: new Uint8Array(des.data.slice(0, n * 32)) };
  } finally { m.delete(); gray.delete(); kp.delete(); des.delete(); none.delete(); }
}
const matOf = (f) => { const m = new cv.Mat(f.n, 32, cv.CV_8U); m.data.set(f.des); return m; };
/** Nombre de points qui tombent au même endroit une fois la carte remise à plat (RANSAC) */
function orbVerify(q, qm, ref) {
  if (!ref || ref.n < 8) return 0;
  const rm = matOf(ref), mm = new cv.DMatchVectorVector();
  try {
    matcher.knnMatch(qm, rm, mm, 2);
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
function embed(src, z = null) {
  const c = canvas(224, 224), g = c.getContext('2d', { willReadFrequently: true });
  if (z) g.drawImage(src, src.width * z.x0, src.height * z.y0, src.width * (z.x1 - z.x0), src.height * (z.y1 - z.y0), 0, 0, 224, 224);
  else g.drawImage(src, 0, 0, 224, 224);
  const px = g.getImageData(0, 0, 224, 224); // (pixels lus d'abord : le canvas direct donnait parfois un autre résultat)
  const t = tf.tidy(() => model.execute(tf.browser.fromPixels(px).toFloat().div(255).expandDims(0), MN_NODE).reshape([-1]));
  const v = t.dataSync().slice(); t.dispose();
  let n = 0; for (const x of v) n += x * x; n = Math.sqrt(n) || 1;
  return Float32Array.from(v, (x) => x / n);
}
const feats = (src) => ({ orb: orbFeat(src), full: embed(src), art: embed(src, ART) });
const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

/** Empreinte d'un visuel officiel : gardée sur l'appareil, sinon téléchargée et calculée */
const refMem = new Map();
async function refFeat(url) {
  if (refMem.has(url)) return refMem.get(url);
  const key = 'v1:' + url, hit = await dbGet(key);
  let f = null;
  if (hit && !hit.miss) f = hit;
  else if (!hit || Date.now() - hit.t > 2 * 864e5) { // visuel absent chez TCGdex : on ne réessaie que 2 jours plus tard
    const bmp = await fetchBitmap(url);
    if (bmp && bmp !== GONE) { f = feats(trimBackground(bmp)); dbSet(key, f); }
    else if (bmp === GONE) dbSet(key, { miss: true, t: Date.now() });
    // (panne passagère : rien de gardé sur l'appareil, seulement pour cette session)
  }
  if (refMem.size > 600) refMem.delete(refMem.keys().next().value);
  refMem.set(url, f);
  return f;
}

// ---------- Comparaison ----------
const queries = new Map(); // empreinte de chaque photo (qid), calculée une fois
async function rank({ rid, qid, blob, refs, must = [], bonusSet = null, bonus = 1.2 }) {
  await ready();
  let q = queries.get(qid);
  if (!q) { q = feats(await createImageBitmap(blob)); queries.set(qid, q); if (queries.size > 60) queries.delete(queries.keys().next().value); }
  // empreintes des visuels (6 téléchargements à la fois)
  const F = new Array(refs.length).fill(null);
  let done = 0, next = 0;
  const todo = refs.filter((r) => !refMem.has(r.url)).length;
  const work = async () => {
    while (next < refs.length) {
      const i = next++;
      const known = refMem.has(refs[i].url);
      try { F[i] = await refFeat(refs[i].url); } catch (e) { F[i] = null; }
      if (!known && todo > 8 && ++done % 5 === 0) postMessage({ op: 'progress', rid, done, total: todo });
    }
  };
  await Promise.all(Array.from({ length: 6 }, work));
  // 1) le réseau de neurones présélectionne ; 2) les points clés vérifient
  const mn = refs.map((r, i) => (F[i] ? (dot(q.full, F[i].full) + dot(q.art, F[i].art)) / 2 : -1));
  const order = [...mn.keys()].filter((i) => F[i]).sort((a, b) => mn[b] - mn[a]);
  const mustSet = new Set(must);
  const short = new Set([...order.slice(0, SHORT), ...order.filter((i) => mustSet.has(refs[i].id))]);
  const qm = matOf(q.orb), res = [];
  try {
    for (const i of short) {
      let s = mn[i] + orbVerify(q.orb, qm, F[i].orb);
      if (bonusSet && refs[i].set === bonusSet) s *= bonus; // carte de la série de la page (réimpressions au même dessin)
      res.push({ id: refs[i].id, s: Math.round(s * 100) / 100 });
    }
  } finally { qm.delete(); }
  res.sort((a, b) => b.s - a.s);
  return { res: res.slice(0, 12), best: res[0] ? res[0].s : 0, missing: F.filter((f) => !f).length };
}

let chain = Promise.resolve();
self.onmessage = (e) => {
  const m = e.data;
  if (m.op === 'forget') { queries.delete(m.qid); return; }
  if (m.op === 'warm') { chain = chain.then(() => ready()).catch(() => {}); return; }
  if (m.op !== 'rank') return;
  chain = chain.then(async () => {
    try { postMessage({ rid: m.rid, ok: true, ...(await rank(m)) }); }
    catch (err) { postMessage({ rid: m.rid, ok: false, error: String((err && err.message) || err) }); }
  });
};
