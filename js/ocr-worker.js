/*
 * Lecture des codes et numéros de carte en arrière-plan (Web Worker, v3.40) : PaddleOCR PP-OCRv5 (modèle de lecture
 * « anglais mobile », ONNX, data/ocr/) exécuté par onnxruntime-web. Choisi au labo (_tests-scanner/ocr-*.js, 18 oct. 2026,
 * 105 cartes des photos d'Arnaud, 5 licences) : lecture brute 58 bonnes contre 23 pour Tesseract, ~0,4 s par carte contre ~6 s.
 *
 * Comme visual-worker.js : bibliothèque vérifiée (sha384) avant d'être exécutée ; le calcul ne fige pas la page.
 * Messages reçus :
 *   { op: 'read', rid, lines: [{ w, h, data: Float32Array 3×48×w }], zones: [ImageBitmap] } → { rid, ok, res: [{ text, conf }] }
 *     (lignes données, puis lignes de texte trouvées dans chaque zone par le détecteur ; sorties gardées pour « score », 8 lectures)
 *   { op: 'score', rid, asks: [[ligne, chaîne]…] } → { rid, ok, res: [note…] } : vraisemblance de chaque chaîne (0 = aussi
 *     probable que la lecture brute, très négatif = absente)
 */
const ORT = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/';
const LIBS = {
  js: { src: ORT + 'ort.wasm.min.js', sri: 'sha384-6hgW9I+eQKl5CrHLstudPd4L3E2eTYHm+qNKvf4pI+RZnfBJILOHAiaalHV+trgG' },
  mjs: { src: ORT + 'ort-wasm-simd-threaded.mjs', sri: 'sha384-SyfqCcawqO3udRV2twBwYuuR4Wh7Nj/yfAxyfN6UltDOh5VTrJH4aT9HfEvthS02' },
  wasm: { src: ORT + 'ort-wasm-simd-threaded.wasm', sri: 'sha384-t24pimTffN4djMKJaYLDupLzilNBHTgwqbjacQNJObCC4RrMH4UjfZgDkwHEU04k' },
};
const MODEL = '../data/ocr/ppocr5-en-rec.onnx?v=1', DICT = '../data/ocr/ppocr5-en-dict.txt?v=1';
// détecteur des lignes de texte (PP-OCRv4, 4,7 Mo) : sans lui, Pokémon 3/31 au lieu de 13 (le texte doit remplir la hauteur
// de la bande lue ; un repérage des lignes sans modèle, par profil d'encre, faisait encore moins bien)
const DET = '../data/ocr/ppocr4-det.onnx?v=1';

async function verified({ src, sri }) {
  const buf = await (await fetch(src)).arrayBuffer();
  const h = new Uint8Array(await crypto.subtle.digest('SHA-384', buf));
  let bin = ''; for (const b of h) bin += String.fromCharCode(b);
  if ('sha384-' + btoa(bin) !== sri) throw new Error('Bibliothèque modifiée, refusée : ' + src);
  return buf;
}
let readyP = null, sess = null, det = null, keys = null, idx = null;
function ready() {
  return readyP || (readyP = (async () => {
    const [js, mjs, wasm] = await Promise.all([verified(LIBS.js), verified(LIBS.mjs), verified(LIBS.wasm)]);
    const u = URL.createObjectURL(new Blob([js], { type: 'text/javascript' }));
    try { importScripts(u); } finally { URL.revokeObjectURL(u); }
    ort.env.wasm.numThreads = 1;
    // (le module .mjs est importé depuis son adresse, déjà vérifiée ci-dessus : depuis une adresse blob:, il ne retrouve pas son
    // fichier .wasm — « Invalid URL »)
    ort.env.wasm.wasmPaths = { mjs: LIBS.mjs.src, wasm: LIBS.wasm.src };
    ort.env.wasm.wasmBinary = wasm;
    const get = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error('modèle ' + r.status); return r.arrayBuffer(); });
    const [model, dict, dmodel] = await Promise.all([get(MODEL), fetch(DICT).then((r) => r.text()), get(DET)]);
    sess = await ort.InferenceSession.create(model, { executionProviders: ['wasm'] });
    det = await ort.InferenceSession.create(dmodel, { executionProviders: ['wasm'] });
    // classe 0 = « rien » (CTC), puis une lettre par ligne du dictionnaire, puis l'espace
    keys = ['', ...dict.split(/\r?\n/).filter((x, i, a) => i < a.length - 1 || x), ' '];
    idx = new Map(keys.map((k, i) => [k, i]));
  })().catch((e) => { readyP = null; throw e; }));
}

// ---------- lecture d'une ligne (CTC glouton) ----------
async function readLine({ w, h, data }) {
  const out = await sess.run({ [sess.inputNames[0]]: new ort.Tensor('float32', data, [1, 3, h, w]) });
  const o = out[sess.outputNames[0]], [, T, C] = o.dims, d = o.data;
  const gs = new Int32Array(T);
  let text = '', last = 0, conf = 0, n = 0;
  for (let t = 0; t < T; t++) {
    let bi = 0, bv = -1; for (let k = 0; k < C; k++) if (d[t * C + k] > bv) { bv = d[t * C + k]; bi = k; }
    gs[t] = bi;
    if (bi && bi !== last) { text += keys[bi] || ''; conf += bv; n++; }
    last = bi;
  }
  return { text, conf: n ? conf / n : 0, r: { d, T, C, gs } };
}

// ---------- lignes de texte d'une zone (détecteur DB de PaddleOCR) ----------
/** image (ImageBitmap) → tenseur de lecture 3×48×w (BGR, (x / 255 − 0,5) / 0,5) d'un rectangle */
function lineTensor(bmp, [x0, y0, x1, y1]) {
  const sw = x1 - x0, sh = y1 - y0, w = Math.max(16, Math.min(1600, Math.round(sw * 48 / sh)));
  const oc = new OffscreenCanvas(w, 48), g = oc.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingQuality = 'high'; g.drawImage(bmp, x0, y0, sw, sh, 0, 0, w, 48);
  const px = g.getImageData(0, 0, w, 48).data, n = w * 48, data = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) data[k * n + i] = (px[i * 4 + (2 - k)] / 255 - 0.5) / 0.5;
  return { w, h: 48, data };
}
/** zone (ImageBitmap) → rectangles des lignes de texte, de haut en bas (pixels de la zone) */
async function detBoxes(bmp, maxSide = 960) {
  const k = Math.min(4, maxSide / Math.max(bmp.width, bmp.height)) || 1;
  const W = Math.max(32, Math.round(bmp.width * k / 32) * 32), H = Math.max(32, Math.round(bmp.height * k / 32) * 32);
  const oc = new OffscreenCanvas(W, H), g = oc.getContext('2d', { willReadFrequently: true }); g.drawImage(bmp, 0, 0, W, H);
  const px = g.getImageData(0, 0, W, H).data, x = new Float32Array(3 * H * W), mean = [0.485, 0.456, 0.406], std = [0.229, 0.224, 0.225];
  for (let i = 0; i < H * W; i++) for (let j = 0; j < 3; j++) x[j * H * W + i] = (px[i * 4 + (2 - j)] / 255 - mean[j]) / std[j];
  const out = await det.run({ [det.inputNames[0]]: new ort.Tensor('float32', x, [1, 3, H, W]) });
  const m = out[det.outputNames[0]].data, seen = new Uint8Array(W * H), boxes = [];
  for (let i = 0; i < W * H; i++) {
    if (seen[i] || m[i] < 0.3) continue;
    const st = [i]; seen[i] = 1; let x0 = W, y0 = H, x1 = 0, y1 = 0, n = 0, sc = 0;
    while (st.length) {
      const p = st.pop(), px_ = p % W, py = (p / W) | 0; n++; sc += m[p];
      if (px_ < x0) x0 = px_; if (px_ > x1) x1 = px_; if (py < y0) y0 = py; if (py > y1) y1 = py;
      for (const q of [p - 1, p + 1, p - W, p + W]) if (q >= 0 && q < W * H && !seen[q] && m[q] >= 0.3 && Math.abs((q % W) - px_) <= 1) { seen[q] = 1; st.push(q); }
    }
    if (n < 6 || sc / n < 0.5) continue;
    const e = (y1 - y0 + 1) * 0.75; // (la carte de probabilité est plus fine que le texte : on agrandit le rectangle)
    const b = [(x0 - e) / W * bmp.width, (y0 - e) / H * bmp.height, (x1 + 1 + e) / W * bmp.width, (y1 + 1 + e) / H * bmp.height].map((v, j) => Math.max(0, Math.min(j % 2 ? bmp.height : bmp.width, v)));
    if (b[2] - b[0] >= 6 && b[3] - b[1] >= 4) boxes.push(b);
  }
  return boxes.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}

// ---------- note d'une chaîne attendue (CTC, posée n'importe où dans la ligne) ----------
// Au lieu de lire puis de comparer (« IDGS-FROT6 » ≈ « TDGS-FR016 » ?), on demande au modèle la probabilité que la ligne
// contienne exactement cette chaîne : écart très net entre le bon code et les autres (labo : −0,9 contre −15).
const isDigit = (k) => k > 0 && /[0-9]/.test(keys[k] || '');
function prep(r) {
  if (r.G) return;
  const { d, T, C, gs } = r, G = new Float64Array(T + 1);
  for (let t = 0; t < T; t++) G[t + 1] = G[t] + Math.log(Math.max(1e-12, d[t * C + gs[t]]));
  // un code qui commence (finit) par un chiffre ne doit pas être collé à un autre chiffre lu (« 1/102 » dans « 31/102 »)
  const prevD = new Uint8Array(T + 1); let last = 0;
  for (let t = 0; t < T; t++) { prevD[t] = isDigit(last) ? 1 : 0; if (gs[t]) last = gs[t]; }
  const nextD = new Uint8Array(T); let nx = 0;
  for (let t = T - 1; t >= 0; t--) { nextD[t] = isDigit(nx) ? 1 : 0; if (gs[t] && (t === 0 || gs[t] !== gs[t - 1])) nx = gs[t]; }
  Object.assign(r, { G, prevD, nextD });
}
function ctc(r, str) {
  const lab = [...str].map((ch) => idx.get(ch) ?? idx.get(ch.toUpperCase()) ?? -1);
  if (!lab.length || lab.some((x) => x < 0)) return -1e9;
  prep(r);
  const { d, T, C, G, prevD, nextD } = r, L = lab.length, S = 2 * L + 1, NEG = -1e9;
  const lp = (t, k) => Math.log(Math.max(1e-12, d[t * C + k]));
  const dStart = /^[0-9]/.test(str), dEnd = /[0-9]$/.test(str);
  let a = new Float64Array(S).fill(NEG), b = new Float64Array(S), best = NEG;
  for (let t = 0; t < T; t++) {
    const enter = !dStart || !prevD[t];
    for (let s = 0; s < S; s++) {
      const k = s % 2 ? lab[(s - 1) / 2] : 0;
      let v = a[s];
      if (s > 0 && a[s - 1] > v) v = a[s - 1];
      if (s > 1 && s % 2 && lab[(s - 1) / 2] !== lab[(s - 3) / 2] && a[s - 2] > v) v = a[s - 2];
      if (s <= 1 && enter && G[t] > v) v = G[t]; // entrée dans la chaîne à l'instant t (avant : la lecture brute)
      b[s] = v + lp(t, k);
    }
    [a, b] = [b, a];
    // sortie à l'instant t : la suite de la ligne suit la lecture brute
    if (!dEnd || !nextD[t]) { const e = Math.max(a[S - 1], a[S - 2]) + G[T] - G[t + 1]; if (e > best) best = e; }
  }
  return best - G[T];
}

// sorties gardées pour les 8 dernières lectures (plusieurs cartes d'une page peuvent être lues en même temps)
const kept = new Map();
self.onmessage = async (e) => {
  const m = e.data;
  try {
    await ready();
    if (m.op === 'read') {
      const res = [], rs = [];
      for (const l of m.lines || []) { const x = await readLine(l); rs.push(x.r); res.push({ text: x.text, conf: +x.conf.toFixed(3) }); }
      // zones où chercher d'abord les lignes de texte (ImageBitmap), chaque ligne trouvée lue à son tour
      for (const z of m.zones || []) {
        for (const b of await detBoxes(z)) { const x = await readLine(lineTensor(z, b)); rs.push(x.r); res.push({ text: x.text, conf: +x.conf.toFixed(3), det: 1 }); }
        z.close && z.close();
      }
      kept.set(m.rid, rs); while (kept.size > 8) kept.delete(kept.keys().next().value);
      self.postMessage({ rid: m.rid, ok: true, res });
    } else if (m.op === 'score') {
      const rs = kept.get(m.ref) || [];
      self.postMessage({ rid: m.rid, ok: true, res: m.asks.map(([i, s]) => (rs[i] ? +ctc(rs[i], s).toFixed(3) : -1e9)) });
    } else if (m.op === 'warm') self.postMessage({ rid: m.rid, ok: true });
  } catch (err) {
    self.postMessage({ rid: m.rid, ok: false, error: String(err && err.message || err) });
  }
};
