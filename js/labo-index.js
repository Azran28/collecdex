/*
 * Outil de préparation de l'index « toute la base » (v2.83) — outil de test, pas utilisé par le site.
 * À charger dans labo.html (avec js/visual.js) : window.__idx.
 *   1) build()   : empreintes du réseau de neurones (MobileNet, comme le scanner) de toutes les cartes TCGdex,
 *                  gardées dans IndexedDB « collecdex-index » (on peut arrêter et reprendre) ;
 *   2) pca(d)    : réduction à d dimensions (analyse en composantes principales, sans centrage : garde les cosinus) ;
 *   3) evaluate(): sur les 90 cartes des photos de test, rang de la bonne carte parmi toutes ;
 *   4) pack(d)   : fichiers data/vis-index.json + .bin (format lu par js/visual-worker.js).
 */
(() => {
  const ad = () => App.games.get('pokemon');
  const D = 1280;
  const S = window.__idx = { state: 'prêt', done: 0, total: 0, fail: 0, log: [] };
  const log = (t) => { S.log.push(t); console.log('[index]', t); };

  // ---------- IndexedDB à part ----------
  let dbP = null;
  const db = () => dbP || (dbP = new Promise((res, rej) => {
    const r = indexedDB.open('collecdex-index', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('e');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const tx = async (mode, fn) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction('e', mode); const out = fn(t.objectStore('e')); t.oncomplete = () => res(out && out.result); t.onerror = () => rej(t.error); }); };
  const getAllKeys = () => tx('readonly', (s) => s.getAllKeys());
  const putMany = (rows) => tx('readwrite', (s) => { for (const [k, v] of rows) s.put(v, k); });
  async function readAll() {
    const d = await db();
    return new Promise((res, rej) => {
      const out = []; const r = d.transaction('e').objectStore('e').openCursor();
      r.onsuccess = () => { const c = r.result; if (!c) return res(out); out.push([c.key, c.value]); c.continue(); };
      r.onerror = () => rej(r.error);
    });
  }

  // ---------- 1) Toutes les cartes ----------
  async function allCards() {
    const A = ad(), out = [];
    // (« Kits du dresseur » tk-… : pas de visuels chez TCGdex, et ce ne sont pas des cartes qu'on range en classeur)
    const sets = (await A.listSets()).filter((s) => !/^tk-/.test(s.id));
    for (const s of sets) {
      try {
        const set = await A.getSet(s.id);
        for (const c of set.cards) {
          const url = A.img.card({ ...c, setId: c.setId || s.id, serieId: c.serieId || (set.group && set.group.id) }, 'low');
          if (url && /^https:\/\/assets\.tcgdex\.net\//.test(url)) out.push({ id: c.id, set: s.id, url });
        }
      } catch (e) { log(`Série ${s.id} : ${e.message}`); }
    }
    return out;
  }
  async function build({ batch = 48 } = {}) {
    S.state = 'liste des cartes';
    const cards = await allCards();
    const have = new Set(await getAllKeys());
    const todo = cards.filter((c) => !have.has(c.id));
    Object.assign(S, { total: cards.length, done: cards.length - todo.length, fail: 0, state: 'empreintes', t0: Date.now() });
    log(`${cards.length} cartes, ${todo.length} à calculer`);
    for (let i = 0; i < todo.length && S.state === 'empreintes'; i += batch) {
      const part = todo.slice(i, i + batch);
      let vecs = await App.visual.embed(part.map((c) => c.url));
      // visuel introuvable en français : on essaie l'anglais (même image)
      const retry = part.map((c, k) => (!vecs[k] && /\/fr\//.test(c.url) ? k : -1)).filter((k) => k >= 0);
      if (retry.length) {
        const v2 = await App.visual.embed(retry.map((k) => part[k].url.replace('/fr/', '/en/')));
        retry.forEach((k, j) => { if (v2[j]) { vecs[k] = v2[j]; part[k].url = part[k].url.replace('/fr/', '/en/'); } });
      }
      const rows = [];
      part.forEach((c, k) => { if (vecs[k]) rows.push([c.id, { set: c.set, url: c.url, full: vecs[k].full, art: vecs[k].art }]); else S.fail++; });
      await putMany(rows);
      S.done += part.length;
    }
    if (S.state === 'empreintes') S.state = 'fini';
    log(`fini : ${S.done} / ${S.total}, ${S.fail} visuels introuvables`);
  }
  const stop = () => { S.state = 'arrêté'; };

  // ---------- 2) Réduction (composantes principales, sans centrage) ----------
  const yieldNow = () => new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); });
  async function topEig(rows, key, d, iters = 40) {
    // C = Σ x xᵀ (1280 × 1280)
    const C = new Float64Array(D * D);
    for (let r = 0; r < rows.length; r++) {
      const x = rows[r][1][key];
      for (let i = 0; i < D; i++) { const xi = x[i]; if (!xi) continue; const o = i * D; for (let j = i; j < D; j++) C[o + j] += xi * x[j]; }
      if (r % 500 === 0) { S.state = `covariance ${key} ${r}/${rows.length}`; await yieldNow(); }
    }
    for (let i = 0; i < D; i++) for (let j = 0; j < i; j++) C[i * D + j] = C[j * D + i];
    // itération de sous-espace (d vecteurs à la fois), puis orthonormalisation
    let V = new Float64Array(D * d); for (let k = 0; k < V.length; k++) V[k] = Math.random() - 0.5;
    const orth = (M) => {
      for (let a = 0; a < d; a++) {
        for (let b = 0; b < a; b++) { let s = 0; for (let i = 0; i < D; i++) s += M[i * d + a] * M[i * d + b]; for (let i = 0; i < D; i++) M[i * d + a] -= s * M[i * d + b]; }
        let n = 0; for (let i = 0; i < D; i++) n += M[i * d + a] ** 2; n = Math.sqrt(n) || 1; for (let i = 0; i < D; i++) M[i * d + a] /= n;
      }
    };
    orth(V);
    for (let it = 0; it < iters; it++) {
      const W = new Float64Array(D * d);
      for (let i = 0; i < D; i++) { const o = i * D; for (let k = 0; k < D; k++) { const c = C[o + k]; if (!c) continue; const vo = k * d, wo = i * d; for (let a = 0; a < d; a++) W[wo + a] += c * V[vo + a]; } }
      orth(W); V = W;
      S.state = `axes ${key} ${it + 1}/${iters}`; await yieldNow();
    }
    // ordre par importance (valeur de vᵀ C v)
    const lam = []; for (let a = 0; a < d; a++) { let s = 0; for (let i = 0; i < D; i++) { let t = 0; for (let k = 0; k < D; k++) t += C[i * D + k] * V[k * d + a]; s += V[i * d + a] * t; } lam.push([s, a]); }
    lam.sort((x, y) => y[0] - x[0]);
    const P = new Float32Array(D * d);
    lam.forEach(([, a], j) => { for (let i = 0; i < D; i++) P[i * d + j] = V[i * d + a]; });
    return P;
  }
  let rowsCache = null;
  const rows = async () => rowsCache || (rowsCache = await readAll());
  async function pca(d = 128) {
    const R = await rows();
    S.Pf = await topEig(R, 'full', d); S.Pa = await topEig(R, 'art', d); S.d = d;
    S.state = 'axes prêts'; log(`axes calculés (${d}) sur ${R.length} cartes`);
  }
  const proj = (x, P, D2, d) => { const y = new Float32Array(d); for (let i = 0; i < D; i++) { const xi = x[i]; if (!xi) continue; for (let j = 0; j < d; j++) y[j] += xi * P[i * D2 + j]; } let n = 0; for (const t of y) n += t * t; n = Math.sqrt(n) || 1; for (let j = 0; j < d; j++) y[j] /= n; return y; };
  const quant = (y) => { let m = 0; for (const t of y) m = Math.max(m, Math.abs(t)); m = m || 1; return { q: Int8Array.from(y, (t) => Math.round((t / m) * 127)), s: m / 127 }; };

  // ---------- 3) Évaluation sur les photos de test ----------
  /** Empreinte moyenne sur plusieurs cadrages de la photo (marges de pochette, carte un peu décalée) */
  const CROPS = [[0, 0, 0, 0], [0.03, 0.03, 0.03, 0.03], [0.06, 0.05, 0.06, 0.05], [0.03, 0, 0.03, 0.06], [0.03, 0.06, 0.03, 0]];
  async function embedTTA(blob, crops = CROPS) {
    const bmp = await createImageBitmap(blob), acc = { full: new Float32Array(D), art: new Float32Array(D) };
    for (const [l, t, r, b] of crops) {
      const w = Math.round(bmp.width * (1 - l - r)), h = Math.round(bmp.height * (1 - t - b));
      const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
      c.getContext('2d').drawImage(bmp, bmp.width * l, bmp.height * t, w, h, 0, 0, w, h);
      const e = await App.visual.embedBlob(await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.92)));
      for (const k of ['full', 'art']) for (let i = 0; i < D; i++) acc[k][i] += e[k][i];
    }
    for (const k of ['full', 'art']) { let n = 0; for (const x of acc[k]) n += x * x; n = Math.sqrt(n) || 1; for (let i = 0; i < D; i++) acc[k][i] /= n; }
    return acc;
  }
  async function evaluate(dims = [32, 48, 64, 96, 128], { tta = false } = {}) {
    const L = window.__labo;
    if (!L || !L.buildQueries) throw new Error('labo.js non chargé');
    const truth = await L.loadTruth();
    const qs = await L.buildQueries(truth, log);
    const R = await rows(), ids = R.map((r) => r[0]), pos = new Map(ids.map((id, i) => [id, i]));
    const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
    const out = { n: qs.length, absent: 0, full: [], dims: {} };
    const red = {}; for (const d of dims) red[d] = R.map(([, v]) => [quant(proj(v.full, S.Pf, S.d, d)), quant(proj(v.art, S.Pa, S.d, d))]);
    const rankOf = (sc, t) => { const st = sc[t]; let k = 0; for (const x of sc) if (x > st) k++; return k + 1; };
    for (const [qi, q] of qs.entries()) {
      S.state = `évaluation ${qi + 1}/${qs.length}`;
      const t = pos.get(q.want); if (t == null) { out.absent++; continue; }
      const e = tta ? await embedTTA(q.blob, tta === true ? CROPS : tta) : await App.visual.embedBlob(q.blob);
      out.full.push(rankOf(R.map(([, v]) => (dot(e.full, v.full) + dot(e.art, v.art)) / 2), t));
      for (const d of dims) {
        const qf = proj(e.full, S.Pf, S.d, d), qa = proj(e.art, S.Pa, S.d, d);
        (out.dims[d] = out.dims[d] || []).push(rankOf(red[d].map(([f, a]) => (dot(qf, f.q) * f.s + dot(qa, a.q) * a.s) / 2), t));
      }
    }
    const sum = (a) => ({ top1: a.filter((r) => r <= 1).length, top10: a.filter((r) => r <= 10).length, top40: a.filter((r) => r <= 40).length, top100: a.filter((r) => r <= 100).length, n: a.length });
    S.eval = { absent: out.absent, full: sum(out.full), ...Object.fromEntries(dims.map((d) => [d, sum(out.dims[d])])), raw: out };
    S.state = 'évaluation finie';
    return S.eval;
  }

  // ---------- 4) Fichiers de l'index ----------
  async function pack(d) {
    const R = await rows(), n = R.length;
    const imgs = R.map(([, v]) => v.url.replace(/^https:\/\/assets\.tcgdex\.net\//, '').replace(/\/low\.(webp|png)$/, ''));
    const meta = { v: 1, n, d, date: new Date().toISOString().slice(0, 10), base: 'https://assets.tcgdex.net/', ids: R.map((r) => r[0]), sets: R.map(([, x]) => x.set), imgs };
    const Pf = new Float32Array(D * d), Pa = new Float32Array(D * d);
    for (let i = 0; i < D; i++) for (let j = 0; j < d; j++) { Pf[i * d + j] = S.Pf[i * S.d + j]; Pa[i * d + j] = S.Pa[i * S.d + j]; }
    const sc = new Float32Array(n * 2), v = new Int8Array(n * 2 * d);
    R.forEach(([, x], r) => {
      const f = quant(proj(x.full, S.Pf, S.d, d)), a = quant(proj(x.art, S.Pa, S.d, d));
      sc[2 * r] = f.s; sc[2 * r + 1] = a.s; v.set(f.q, r * 2 * d); v.set(a.q, r * 2 * d + d);
    });
    const bin = new Blob([Pf, Pa, sc, v]);
    for (const [name, body] of [['vis-index.json', JSON.stringify(meta)], ['vis-index.bin', bin]]) {
      const r = await fetch('/__save?name=' + name, { method: 'POST', body });
      log(`${name} : ${r.status} ${await r.text()}`);
    }
    return { n, d, bin: bin.size };
  }

  Object.assign(S, { build, stop, pca, evaluate, pack, allCards });
})();
