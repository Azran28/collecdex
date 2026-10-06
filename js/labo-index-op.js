/*
 * Outil de préparation de l'index One Piece « toute la base » (v2.94) — outil de test, pas chargé par le site.
 * Le refaire quand de nouvelles séries sortent, puis augmenter OP_INDEX_V dans js/games/onepiece.js.
 * Dans le navigateur intégré, sur une copie de serveur.ps1 qui accepte POST /__save?name=… (écrit dans data/) :
 *   charger ce fichier dans la page de l'appli, puis await __opIndex.build() (~15 min, 4 300 cartes, onglet au premier plan)
 *   et await __opIndex.pack(128) → data/op-index.json + .bin (format lu par js/visual-worker.js, comme data/vis-index).
 */
(() => { const S = {}; const D = 1280;
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
  const proj = (x, P, D2, d) => { const y = new Float32Array(d); for (let i = 0; i < D; i++) { const xi = x[i]; if (!xi) continue; for (let j = 0; j < d; j++) y[j] += xi * P[i * D2 + j]; } let n = 0; for (const t of y) n += t * t; n = Math.sqrt(n) || 1; for (let j = 0; j < d; j++) y[j] /= n; return y; };
  const quant = (y) => { let m = 0; for (const t of y) m = Math.max(m, Math.abs(t)); m = m || 1; return { q: Int8Array.from(y, (t) => Math.round((t / m) * 127)), s: m / 127 }; };
  const O = window.__op = { cards: [], vecs: new Map(), done: 0, fail: 0, state: 'prêt' };
  /** Empreintes du réseau (MobileNet, comme le scanner) de toutes les cartes One Piece, par paquets de 48 */
  async function build() {
    const ad = App.games.get('onepiece'), seen = new Set();
    O.cards = []; O.state = 'liste';
    for (const s of await ad.listSets()) {
      try { for (const c of (await ad.getSet(s.id)).cards) if (!seen.has(c.id)) { seen.add(c.id); const url = ad.img.card(c, 'low'); if (url) O.cards.push({ id: c.id, set: s.id, url }); } } catch (e) { console.warn(s.id, e); }
    }
    O.state = 'empreintes';
    for (let i = 0; i < O.cards.length && O.state === 'empreintes'; i += 48) {
      const part = O.cards.slice(i, i + 48), v = await App.visual.embed(part.map((c) => c.url));
      part.forEach((c, k) => { if (v[k]) O.vecs.set(c.id, { set: c.set, url: c.url, full: v[k].full, art: v[k].art }); else O.fail++; });
      O.done = i + part.length;
    }
    O.state = 'fini';
    return { n: O.vecs.size, fail: O.fail };
  }
  /** Réduction à d dimensions (composantes principales) puis fichiers data/op-index.json + .bin */
  async function pack(d = 128) {
    const O = window.__op, R = [...O.vecs.entries()];
    S.state = ''; window.__opS = S;
    const Pf = await topEig(R, 'full', d), Pa = await topEig(R, 'art', d), n = R.length;
    const meta = { v: 1, game: 'onepiece', n, d, date: new Date().toISOString().slice(0, 10), base: '', ids: R.map((r) => r[0]), sets: R.map(([, x]) => x.set), imgs: R.map(() => '') };
    const sc = new Float32Array(n * 2), v = new Int8Array(n * 2 * d);
    R.forEach(([, x], r) => { const f = quant(proj(x.full, Pf, d, d)), a = quant(proj(x.art, Pa, d, d)); sc[2 * r] = f.s; sc[2 * r + 1] = a.s; v.set(f.q, r * 2 * d); v.set(a.q, r * 2 * d + d); });
    const bin = new Blob([Pf, Pa, sc, v]), out = [];
    for (const [name, body] of [['op-index.json', JSON.stringify(meta)], ['op-index.bin', bin]]) { const r = await fetch('/__save?name=' + name, { method: 'POST', body }); out.push(name + ' ' + r.status + ' ' + await r.text()); }
    return { n, d, bin: bin.size, out };
  }
  window.__opIndex = { build, pack, state: O, stop: () => { O.state = 'arrêté'; } };
})();
