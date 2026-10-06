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
/**
 * Visuel officiel, ou null s'il n'a pas pu être obtenu. 2 essais seulement (.webp puis .png) : le service worker du site
 * réessaie déjà 3 fois chaque visuel. Un visuel qui n'existe pas (adresse devinée) répond sans en-tête CORS, donc comme
 * une panne : avant, 4 essais × 3 = ~15 s perdues par visuel à chaque page.
 */
async function fetchBitmap(url) {
  for (const u of [url, url.replace(/\.webp$/, '.png')]) {
    try {
      const r = await fetch(u, { mode: 'cors' });
      if (r.ok) return await createImageBitmap(await r.blob());
    } catch (e) { /* essai suivant */ }
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
let lastH = null; // transformation photo → visuel officiel trouvée par la dernière vérification
function orbVerify(q, qm, ref) {
  lastH = null;
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
      lastH = !h.empty() && h.data64F.length === 9 ? Array.from(h.data64F) : null; // photo → visuel officiel (pour recadrer)
      h.delete();
      return inl;
    } finally { sM.delete(); dM.delete(); mask.delete(); }
  } finally { rm.delete(); mm.delete(); }
}
/**
 * Les 4 coins du visuel officiel reportés sur la photo (en fraction de la photo : 0…1), grâce à la transformation
 * trouvée par les points clés (photo → visuel, inversée). Null si la forme obtenue n'est pas crédible.
 */
function cardQuad(H) {
  if (!H) return null;
  const [a, b, c, d, e, f, g, h, i] = H;
  const A = e * i - f * h, B = f * g - d * i, C = d * h - e * g, det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return null;
  const inv = [A, c * h - b * i, b * f - c * e, B, a * i - c * g, c * d - a * f, C, b * g - a * h, a * e - b * d].map((v) => v / det);
  const W = 300, Hh = Math.round(300 * 88 / 63); // taille de travail des empreintes (orbFeat)
  const q = [[0, 0], [W, 0], [W, Hh], [0, Hh]].map(([x, y]) => {
    const z = inv[6] * x + inv[7] * y + inv[8];
    return [(inv[0] * x + inv[1] * y + inv[2]) / z / W, (inv[3] * x + inv[4] * y + inv[5]) / z / Hh];
  });
  if (q.some(([x, y]) => !isFinite(x) || !isFinite(y) || x < -0.2 || x > 1.2 || y < -0.2 || y > 1.2)) return null;
  // convexe, sans croisement, et d'une taille plausible (la carte occupe l'essentiel de la découpe)
  let area = 0, sign = 0;
  for (let k = 0; k < 4; k++) {
    const [x0, y0] = q[k], [x1, y1] = q[(k + 1) % 4], [x2, y2] = q[(k + 2) % 4];
    const cr = (x1 - x0) * (y2 - y1) - (y1 - y0) * (x2 - x1);
    if (sign && Math.sign(cr) !== sign) return null; sign = Math.sign(cr);
    area += x0 * y1 - x1 * y0;
  }
  area = Math.abs(area) / 2;
  return area > 0.35 && area < 1.3 ? q.map(([x, y]) => [Math.round(x * 1e4) / 1e4, Math.round(y * 1e4) / 1e4]) : null;
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
const refMem = new Map(), stats = { dl: 0, fail: 0, streak: 0 }; // visuels téléchargés / en échec (chronomètre)
async function refFeat(url) {
  if (refMem.has(url)) return refMem.get(url);
  const key = 'v1:' + url, hit = await dbGet(key);
  let f = null;
  if (hit && !hit.miss) f = hit;
  else if (!hit || Date.now() - hit.t > 864e5) { // visuel introuvable : on ne réessaie que le lendemain
    const bmp = await fetchBitmap(url); stats.dl++;
    if (bmp) { f = feats(trimBackground(bmp)); dbSet(key, f); stats.streak = 0; }
    // (5 échecs d'affilée = serveur d'images en panne : rien n'est gardé, on réessaiera à la page suivante)
    else { stats.fail++; if (++stats.streak < 5) dbSet(key, { miss: true, t: Date.now() }); }
  }
  if (refMem.size > 600) refMem.delete(refMem.keys().next().value);
  refMem.set(url, f);
  return f;
}

// ---------- Comparaison ----------
const queries = new Map(); // empreinte de chaque photo (qid), calculée une fois
async function rank({ rid, qid, blob, refs, must = [], bonusSet = null, bonus = 1.2 }) {
  // temps de chaque étape (ms) : chargement des outils, visuels officiels à préparer, comparaison
  const t = { tools: 0, refs: 0, match: 0, dl: -stats.dl, fail: -stats.fail };
  let t0 = performance.now();
  await ready();
  t.tools = performance.now() - t0; t0 = performance.now();
  let q = queries.get(qid);
  if (!q) { q = feats(await createImageBitmap(blob)); queries.set(qid, q); if (queries.size > 60) queries.delete(queries.keys().next().value); }
  t.match = performance.now() - t0; t0 = performance.now(); // (empreinte de la photo : compte dans la comparaison)
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
  t.refs = performance.now() - t0; t0 = performance.now(); t.dl += stats.dl; t.fail += stats.fail;
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
      res.push({ id: refs[i].id, s: Math.round(s * 100) / 100, H: lastH });
    }
  } finally { qm.delete(); }
  res.sort((a, b) => b.s - a.s);
  // coins de la carte sur la photo, pour les meilleures (la carte recadrée pile sur ses bords)
  for (const [k, r] of res.entries()) { if (k < 3 && r.s >= 20) r.quad = cardQuad(r.H); delete r.H; }
  t.match += performance.now() - t0;
  return { res: res.slice(0, 12), best: res[0] ? res[0].s : 0, missing: F.filter((f) => !f).length, t, backend: tf.getBackend() };
}

// ---------- Toute la base (v2.83) : empreintes des ~21 000 cartes préparées d'avance (data/vis-index.*) ----------
// Fichier .json : { n, d, base, imgs: [chemin du visuel sans « /low.webp »], ids, sets } ; fichier .bin (petit-boutiste) :
// Pf, Pa (1280 × d float32 : projections du réseau, carte entière / illustration), sc (n × 2 float32 : échelles),
// v (n × 2d int8 : empreintes réduites et normées). Score ≈ cosinus du réseau, comme la présélection habituelle.
const idxP = new Map(); // un index par licence (Pokémon, One Piece)
function loadIndex(base, qs = '') {
  if (idxP.has(base)) return idxP.get(base);
  const p = (async () => {
    const [meta, buf] = await Promise.all([
      fetch(base + '.json' + qs).then((r) => { if (!r.ok) throw new Error('index ' + r.status); return r.json(); }),
      fetch(base + '.bin' + qs).then((r) => { if (!r.ok) throw new Error('index ' + r.status); return r.arrayBuffer(); }),
    ]);
    const { n, d } = meta, D = 1280;
    let o = 0;
    const Pf = new Float32Array(buf, o, D * d); o += D * d * 4;
    const Pa = new Float32Array(buf, o, D * d); o += D * d * 4;
    const sc = new Float32Array(buf, o, n * 2); o += n * 8;
    const v = new Int8Array(buf, o, n * 2 * d);
    return { ...meta, Pf, Pa, sc, v };
  })().catch((e) => { idxP.delete(base); throw e; });
  idxP.set(base, p);
  return p;
}
function project(x, P, d) {
  const y = new Float32Array(d);
  for (let i = 0; i < 1280; i++) { const xi = x[i]; if (!xi) continue; const row = i * d; for (let j = 0; j < d; j++) y[j] += xi * P[row + j]; }
  let n = 0; for (const t of y) n += t * t; n = Math.sqrt(n) || 1;
  for (let j = 0; j < d; j++) y[j] /= n;
  return y;
}
/** Les k cartes de toute la base les plus proches pour le réseau de neurones → [{ id, img, s }] */
async function globalTop({ qid, blob, k = 40, base, qs }) {
  await ready();
  const I = await loadIndex(base, qs);
  let q = queries.get(qid);
  if (!q) { q = feats(await createImageBitmap(blob)); queries.set(qid, q); if (queries.size > 60) queries.delete(queries.keys().next().value); }
  // empreinte moyenne sur 5 cadrages de la photo (marges de pochette, carte un peu décalée) : mesuré sur les cartes de
  // test, la bonne carte arrive plus souvent parmi les 40 premières (seulement ici : 10 passages du réseau par carte)
  if (!q.tta) {
    const bmp = await createImageBitmap(blob), acc = { full: new Float32Array(1280), art: new Float32Array(1280) };
    for (const [l, t, r, b] of [[0, 0, 0, 0], [0.03, 0.03, 0.03, 0.03], [0.06, 0.05, 0.06, 0.05], [0.03, 0, 0.03, 0.06], [0.03, 0.06, 0.03, 0]]) {
      const w = Math.round(bmp.width * (1 - l - r)), h = Math.round(bmp.height * (1 - t - b)), c = canvas(w, h);
      c.getContext('2d').drawImage(bmp, bmp.width * l, bmp.height * t, w, h, 0, 0, w, h);
      const f = embed(c), a = embed(c, ART);
      for (let i = 0; i < 1280; i++) { acc.full[i] += f[i]; acc.art[i] += a[i]; }
    }
    q.tta = acc;
  }
  const { n, d, sc, v } = I, qf = project(q.tta.full, I.Pf, d), qa = project(q.tta.art, I.Pa, d);
  const s = new Float32Array(n);
  for (let r = 0; r < n; r++) {
    const o = r * 2 * d; let a = 0, b = 0;
    for (let j = 0; j < d; j++) { a += qf[j] * v[o + j]; b += qa[j] * v[o + d + j]; }
    s[r] = (a * sc[2 * r] + b * sc[2 * r + 1]) / 2;
  }
  const top = [...s.keys()].sort((x, y) => s[y] - s[x]).slice(0, k);
  return { res: top.map((r) => ({ id: I.ids[r], set: I.sets[r], img: I.base + I.imgs[r], s: Math.round(s[r] * 1000) / 1000 })) };
}
/** Empreintes du réseau pour une liste de visuels (outil de préparation de l'index, labo) */
async function embedUrls({ rid, urls }) {
  await ready();
  const out = new Array(urls.length).fill(null);
  let next = 0;
  await Promise.all(Array.from({ length: 24 }, async () => {
    while (next < urls.length) {
      const i = next++;
      try { const bmp = await fetchBitmap(urls[i]); if (bmp) { const src = trimBackground(bmp); out[i] = { full: embed(src), art: embed(src, ART) }; } } catch (e) { /* visuel introuvable */ }
    }
  }));
  return { vecs: out };
}

let chain = Promise.resolve();
self.onmessage = (e) => {
  const m = e.data;
  if (m.op === 'forget') { queries.delete(m.qid); return; }
  if (m.op === 'global' || m.op === 'embed' || m.op === 'embedBlob') {
    chain = chain.then(async () => {
      try {
        const r = m.op === 'global' ? await globalTop(m)
          : m.op === 'embed' ? await embedUrls(m)
          : await (async () => { await ready(); const b = await createImageBitmap(m.blob); return { full: embed(b), art: embed(b, ART) }; })();
        postMessage({ rid: m.rid, ok: true, ...r });
      } catch (err) { postMessage({ rid: m.rid, ok: false, error: String((err && err.message) || err) }); }
    });
    return;
  }
  if (m.op === 'warm') {
    chain = chain.then(async () => {
      const t0 = performance.now();
      try { await ready(); postMessage({ rid: m.rid, ok: true, ms: performance.now() - t0, backend: tf.getBackend() }); }
      catch (err) { postMessage({ rid: m.rid, ok: false, error: String((err && err.message) || err) }); }
    });
    return;
  }
  if (m.op !== 'rank') return;
  chain = chain.then(async () => {
    try { postMessage({ rid: m.rid, ok: true, ...(await rank(m)) }); }
    catch (err) { postMessage({ rid: m.rid, ok: false, error: String((err && err.message) || err) }); }
  });
};
