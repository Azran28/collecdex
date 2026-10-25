/*
 * Labo « Brillance » (labo.html?brillant) : une carte est-elle brillante (holo, foil, reverse) ? — outil de test, pas utilisé par le site.
 * Photos et bonnes réponses (_tests-scanner/brillant-verite.json) : seulement sur le PC d'Arnaud.
 *
 * Chaque carte des photos est découpée comme le fait le scanner, puis :
 *  - « Actuel » = ce que fait le site aujourd'hui, licence par licence (rareté, mesure Pokémon `detectVariants`,
 *    mesure Final Fantasy `foil`, sinon « Normale » par défaut) ;
 *  - 3 méthodes nouvelles, identiques pour toutes les licences :
 *    1. paillettes et grain, sans visuel officiel (mesures faites à la main, pesées par un petit modèle) ;
 *    2. réseau de neurones MobileNet (celui de la vérification par l'image), sans visuel officiel ;
 *    3. hybride : la rareté quand elle suffit (une seule version existe), sinon le grain des couleurs comparé au visuel officiel.
 * Les modèles et seuils sont appris en « validation croisée » : chaque carte est jugée par un modèle appris sur toutes
 * les AUTRES cartes (sinon le score serait flatteur).
 *
 * Mesuré le 24 oct. 2026 (163 cartes, 7 licences) : voir .claude/rules/reconnaissance.md (« Brillant »).
 */
(() => {
  const tab = document.getElementById(/brillant/.test(location.search) ? 'tab-holo' : 'tab-reco'); if (tab) tab.classList.add('on');
  if (!/brillant/.test(location.search)) return;
  const { esc } = App.util;
  const R = App.recognizer;
  const TEST = '_tests-scanner/';
  const FORMATS = { '3x3': [3, 3, ''] };
  const GAMES = { pokemon: 'Pokémon', onepiece: 'One Piece', finalfantasy: 'Final Fantasy', lorcana: 'Lorcana', riftbound: 'Riftbound', yugioh: 'Yu-Gi-Oh!', wankul: 'Wankul', starwars: 'Star Wars', dragonball: 'Dragon Ball' };
  const TF = { src: 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js', sri: 'sha384-vE8hbVJ4lezako5rlvE7bY0BVzWlFhZncPlckrqNwcUQpVtgbENTgZ8TBbnPjZre' };
  const MN_URL = 'https://storage.googleapis.com/tfjs-models/savedmodel/mobilenet_v2_1.0_224/model.json';
  const MN_NODE = 'module_apply_default/MobilenetV2/Logits/AvgPool';
  const HY_T = 0.6; // hybride : brillante si la probabilité ≥ 0,6 (la plupart des cartes « à deux versions » sont normales)
  const METHODS = [
    { id: 'actuel', name: 'Actuel (site)', desc: 'Ce que fait le site aujourd’hui : la rareté quand elle suffit (One Piece, Yu-Gi-Oh!, Wankul, Riftbound rare, cartes qui n’existent qu’en brillant), la mesure Pokémon (illustration comparée au visuel officiel), la mesure Final Fantasy (paillettes contre le visuel), sinon « Normale » par défaut (Lorcana).' },
    { id: 'grain', name: '1. Paillettes et grain (sans visuel)', desc: 'Photo seule : petits points brillants isolés, finesse du grain (lumière et couleurs), couleurs ternes ou vives, reflets blancs — dans l’illustration et dans le bas de la carte. Un petit modèle pèse ces 10 mesures.' },
    { id: 'reseau', name: '2. Réseau de neurones (sans visuel)', desc: 'Photo seule : MobileNet (le réseau qui sert déjà à reconnaître les cartes) résume la carte en 1 280 nombres ; un petit modèle apprend lesquels annoncent une carte brillante.' },
    { id: 'hybride', name: '3. Hybride : rareté puis visuel officiel', desc: 'Pareil pour toutes les licences : si la carte reconnue n’existe qu’en une version, on la prend. Sinon on compare le grain des couleurs, les paillettes et la luminosité de la photo à ceux du visuel officiel (un holo ajoute un grain de couleurs que l’image officielle n’a pas).' },
  ];

  const S = { items: [], status: '', log: [], done: false };
  window.__holo = S;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const canvas = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });
  const toBlob = (c, q = 0.92) => new Promise((res) => c.toBlob(res, 'image/jpeg', q));
  const log = (t) => { S.log.push(t); console.log('[brillance]', t); };
  const lg = Math.log;

  // ---------- Découpe des cartes (comme le scanner) ----------
  async function cardsOf(p) {
    const blob = await (await fetch(TEST + p.f)).blob();
    const img = await createImageBitmap(blob);
    const out = [];
    if (p.type === 'decoupe') {
      const [x0, y0, x1, y1] = p.rect, c = canvas(x1 - x0, y1 - y0);
      c.getContext('2d').drawImage(img, x0, y0, c.width, c.height, 0, 0, c.width, c.height);
      out.push([0, c]);
    } else if (p.type === 'photo') {
      // carte seule : détecteur de bords appris (photo importée), sinon le cadre trouvé à l'ancienne, sinon le milieu
      const k = Math.min(1, 1400 / Math.max(img.width, img.height)), c = canvas(Math.round(img.width * k), Math.round(img.height * k));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const best = R.bestCard(c);
      if (best && best.quad) out.push([0, R.warpQuad(c, best.quad.map(([x, y]) => [x * c.width, y * c.height]), 600)]);
      else {
        const W = c.width, H = c.height, f = R.locateCard(c, { x: 0, y: 0, w: W, h: H }, 0.45);
        const cell = f && f.h > H * 0.55 ? { x: f.x / W, y: f.y / H, w: f.w / W, h: f.h / H } : (() => { const h = Math.min(0.94, 0.94 * W / H / (63 / 88)), w = h * H / W * (63 / 88); return { x: (1 - w) / 2, y: (1 - h) / 2, w, h }; })();
        out.push([0, R.cellCard(c, cell).canvas]);
      }
    } else {
      let cells = p.cells && p.cells.map(([x0, y0, x1, y1]) => ({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 })), rot = 0;
      if (!cells) { const pg = R.detectPage(img, FORMATS, '3x3'); cells = pg.grid && pg.grid.cells; rot = (pg.grid && pg.grid.rot) || 0; }
      if (!cells || cells.length < p.cards.length) { log(`${p.f} : grille non trouvée (${cells ? cells.length : 0} cases)`); return out; }
      for (let i = 0; i < p.cards.length; i++) if (p.cards[i]) out.push([i, R.cellCard(img, cells[i], rot).canvas]);
    }
    return out;
  }

  // ---------- Mesures ----------
  /** Paillettes : points plus clairs que leur entourage (7 × 7) et isolés (pas un trait ni une lettre), pour 1 000 pixels */
  function sparkles(src) {
    const W = 360, H = 503, c = canvas(W, H), g = c.getContext('2d', { willReadFrequently: true });
    const mx = src.width * 0.05, my = src.height * 0.05;
    g.drawImage(src, mx, my, src.width - 2 * mx, src.height - 2 * my, 0, 0, W, H);
    const d = g.getImageData(0, 0, W, H).data, N = W * H, L = new Float32Array(N);
    for (let i = 0; i < N; i++) L[i] = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3;
    const integ = (X) => { const I = new Float64Array((W + 1) * (H + 1)); for (let y = 0; y < H; y++) { let s = 0; for (let x = 0; x < W; x++) { s += X[y * W + x]; I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + s; } } return I; };
    const box = (I, x, y, r) => { const x0 = Math.max(0, x - r), y0 = Math.max(0, y - r), x1 = Math.min(W, x + r + 1), y1 = Math.min(H, y + r + 1); return (I[y1 * (W + 1) + x1] - I[y0 * (W + 1) + x1] - I[y1 * (W + 1) + x0] + I[y0 * (W + 1) + x0]) / ((x1 - x0) * (y1 - y0)); };
    const IL = integ(L), bright = new Uint8Array(N);
    for (let y = 3; y < H - 3; y++) for (let x = 3; x < W - 3; x++) { const i = y * W + x; if (L[i] > 50 && L[i] - box(IL, x, y, 3) > 14) bright[i] = 1; }
    const IB = integ(bright);
    let n = 0, sp = 0;
    for (let y = 4; y < H - 4; y++) for (let x = 4; x < W - 4; x++) { n++; if (bright[y * W + x] && box(IB, x, y, 2) * 25 <= 5) sp++; }
    return 1000 * sp / n;
  }
  /** Mesures par zone (illustration, bas de la carte, carte entière) sur la carte remise à 252 × 352 */
  const ZONES = { art: [0.1, 0.9, 0.1, 0.5], low: [0.08, 0.92, 0.55, 0.9], all: [0.05, 0.95, 0.05, 0.95] };
  function zoneStats(src) {
    const W = 252, H = 352, c = canvas(W, H), g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(src, 0, 0, W, H);
    const d = g.getImageData(0, 0, W, H).data, N = W * H, L = new Float32Array(N), A = new Float32Array(N), B = new Float32Array(N), Sa = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const r = d[i * 4], gg = d[i * 4 + 1], b = d[i * 4 + 2], mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
      L[i] = (r + gg + b) / 3; A[i] = r - gg; B[i] = (r + gg) / 2 - b; Sa[i] = mx ? (mx - mn) / mx : 0;
    }
    const lap = (X, i) => Math.abs(4 * X[i] - X[i - 1] - X[i + 1] - X[i - W] - X[i + W]);
    const out = {};
    for (const [k, [x0, x1, y0, y1]] of Object.entries(ZONES)) {
      let n = 0, lp = 0, clp = 0, sat = 0, spec = 0, l = 0, l2 = 0;
      for (let y = Math.round(y0 * H); y < y1 * H; y++) for (let x = Math.round(x0 * W); x < x1 * W; x++) {
        const i = y * W + x; n++;
        lp += lap(L, i); clp += lap(A, i) + lap(B, i); sat += Sa[i]; l += L[i]; l2 += L[i] * L[i];
        if (L[i] > 215 && Sa[i] < 0.18) spec++; // reflet blanc
      }
      const m = l / n;
      out[k] = { lap: lp / n, clap: clp / n, sat: sat / n, spec: spec / n, lum: m, sd: Math.sqrt(Math.max(0, l2 / n - m * m)) };
    }
    return out;
  }
  // MobileNet (chargé à la demande, version figée et empreinte SRI comme labo.js)
  let mnP = null;
  const loadMN = () => mnP || (mnP = (async () => {
    if (!window.tf) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = TF.src; s.integrity = TF.sri; s.crossOrigin = 'anonymous'; s.onload = res; s.onerror = () => rej(new Error('TensorFlow introuvable')); document.head.appendChild(s); });
    await tf.ready();
    return tf.loadGraphModel(MN_URL);
  })());
  function embed(model, src) {
    const c = canvas(224, 224), g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(src, 0, 0, 224, 224);
    const px = g.getImageData(0, 0, 224, 224);
    const t = tf.tidy(() => model.execute(tf.browser.fromPixels(px).toFloat().div(255).expandDims(0), MN_NODE).reshape([-1]));
    const v = t.dataSync().slice(); t.dispose();
    return v;
  }
  async function officialBitmap(url) {
    try { const b = await App.recognizerParts.fetchImage(url); if (b) return await createImageBitmap(b); } catch (e) { /* on essaie autrement */ }
    try { const r = await fetch(url); if (r.ok) return await createImageBitmap(await r.blob()); } catch (e) { /* pas de visuel */ }
    return null;
  }

  // ---------- Ce que fait le site aujourd'hui ----------
  async function current(it) {
    const ad = App.games.get(it.jeu), card = it.card, v = (card && card.variants) || null;
    if (!v) return it.jeu === 'lorcana' || it.jeu === 'finalfantasy' ? { holo: false, how: 'normale par défaut' } : { holo: null, how: 'rareté (carte non donnée)' };
    if (v.holo && !v.normal && !v.reverse) return { holo: true, how: 'n’existe qu’en brillant' };
    if (!v.holo && !v.reverse) return { holo: false, how: 'n’existe qu’en normale' };
    if (it.jeu === 'pokemon') {
      const r = await R.detectVariants(it.blob, v, ad.img.card(card, 'high')).catch(() => null);
      const b = r && r.list[0];
      return { holo: b === 'holo' || b === 'reverse', how: `mesure Pokémon : ${b || '?'}${r && r.info.holoRatio != null ? ' ' + r.info.holoRatio : ''}${r && r.info.reverseRatio != null ? ' (rev. ' + r.info.reverseRatio + ')' : ''}` };
    }
    if (it.jeu === 'finalfantasy') { const f = await ad.foil(it.blob, card).catch(() => null); return { holo: !!(f && f.holo), how: f ? `mesure FF ${f.score} (lap ${f.lap})` : 'mesure impossible' }; }
    return { holo: false, how: 'normale par défaut' };
  }
  /** Une seule version existe → décidé par la carte ; undefined = les deux existent ; null = carte inconnue */
  function byCard(it) {
    const v = it.card && it.card.variants; if (!v) return null;
    if (v.holo && !v.normal && !v.reverse) return true;
    if (!v.holo && !v.reverse) return false;
    return undefined;
  }

  // ---------- Petits modèles (validation croisée) ----------
  /** Régression logistique (variables centrées-réduites, pénalité `lam`, classes équilibrées), descente de gradient */
  function fitLogit(X, y, lam = 0.1, iters = 800) {
    const d = X[0].length, mu = Array(d).fill(0), sd = Array(d).fill(0);
    X.forEach((x) => x.forEach((v, j) => { mu[j] += v / X.length; }));
    X.forEach((x) => x.forEach((v, j) => { sd[j] += (v - mu[j]) ** 2 / X.length; }));
    for (let j = 0; j < d; j++) sd[j] = Math.sqrt(sd[j]) || 1;
    const Z = X.map((x) => x.map((v, j) => (v - mu[j]) / sd[j]));
    const P = y.filter(Boolean).length, wp = y.length / (2 * Math.max(1, P)), wn = y.length / (2 * Math.max(1, y.length - P));
    const w = Array(d).fill(0); let b = 0;
    for (let it = 0; it < iters; it++) {
      const gw = Array(d).fill(0); let gb = 0;
      Z.forEach((z, i) => { let s = b; for (let j = 0; j < d; j++) s += z[j] * w[j]; const e = (1 / (1 + Math.exp(-s)) - y[i]) * (y[i] ? wp : wn); gb += e; for (let j = 0; j < d; j++) gw[j] += e * z[j]; });
      for (let j = 0; j < d; j++) w[j] -= 0.2 * (gw[j] / Z.length + lam * w[j]);
      b -= 0.2 * gb / Z.length;
    }
    const p = (x) => { let s = b; for (let j = 0; j < d; j++) s += ((x[j] - mu[j]) / sd[j]) * w[j]; return 1 / (1 + Math.exp(-s)); };
    return { p, mu, sd, w, b };
  }
  /** Probabilité de chaque carte par un modèle appris sur toutes les autres */
  function loo(list, fx, lam) {
    list.forEach((it, k) => { const o = list.filter((_, j) => j !== k); it._p = fitLogit(o.map(fx), o.map((x) => (x.truth ? 1 : 0)), lam).p(fx(it)); });
    return fitLogit(list.map(fx), list.map((x) => (x.truth ? 1 : 0)), lam); // (modèle final, sur toutes les cartes)
  }
  /** Analyse en composantes principales (sans étiquettes) des empreintes MobileNet → k nombres par carte */
  function pca(rows, k) {
    const n = rows.length, d = rows[0].length, mu = new Float64Array(d);
    rows.forEach((r) => r.forEach((v, j) => { mu[j] += v / n; }));
    const X = rows.map((r) => Float64Array.from(r, (v, j) => v - mu[j]));
    const G = X.map((xi) => Float64Array.from(X, (xj) => { let s = 0; for (let t = 0; t < d; t++) s += xi[t] * xj[t]; return s; }));
    const comps = [];
    for (let c = 0; c < k; c++) {
      let v = Float64Array.from({ length: n }, (_, i) => Math.sin(i * 12.9898 + c * 78.233)); // (départ fixe : résultats reproductibles)
      for (let it = 0; it < 100; it++) {
        const w = new Float64Array(n);
        for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < n; j++) s += G[i][j] * v[j]; w[i] = s; }
        for (const u of comps) { let p = 0; for (let i = 0; i < n; i++) p += w[i] * u[i]; for (let i = 0; i < n; i++) w[i] -= p * u[i]; }
        const nr = Math.hypot(...w) || 1; v = w.map((x) => x / nr);
      }
      comps.push(v);
    }
    return X.map((_, i) => comps.map((u) => u[i] * Math.sqrt(n)));
  }
  const grainX = (it) => { const z = it.zp; return [lg(z.all.lap), z.all.sat, lg(z.art.lap), z.art.sat, lg(z.low.lap), lg(z.art.clap / z.low.clap), lg(0.05 + it.spark), z.art.spec, z.all.sd / 50, z.low.sat]; };
  const hybX = (it) => [lg(it.zp.all.clap / it.zo.all.clap), lg(0.05 + it.spark), lg(it.zp.all.lum / it.zo.all.lum), lg(it.zp.art.clap / it.zo.art.clap)];

  function evaluate() {
    const lab = S.items.filter((it) => it.truth != null);
    lab.forEach((it) => { it.res.actuel = it.cur && it.cur.holo != null ? { holo: it.cur.holo, s: it.cur.how } : null; });
    S.models = {};
    S.models.grain = loo(lab, grainX, 0.1);
    lab.forEach((it) => { it.res.grain = { holo: it._p >= 0.5, s: Math.round(it._p * 100) + ' %' }; });
    const withE = lab.filter((it) => it.pc);
    if (withE.length) { S.models.reseau = loo(withE, (it) => it.pc, 1); withE.forEach((it) => { it.res.reseau = { holo: it._p >= 0.5, s: Math.round(it._p * 100) + ' %' }; }); }
    // hybride : la carte d'abord, puis le modèle appris seulement sur les cartes à deux versions (avec visuel officiel)
    const two = lab.filter((it) => byCard(it) === undefined && it.zo);
    if (two.length > 4) S.models.hybride = loo(two, hybX, 0.1);
    lab.forEach((it) => {
      const k = byCard(it);
      if (k === true || k === false) it.res.hybride = { holo: k, s: k ? 'n’existe qu’en brillant' : 'n’existe qu’en normale' };
      else if (k === undefined && it.zo) it.res.hybride = { holo: it._p >= HY_T, s: 'visuel officiel : ' + Math.round(it._p * 100) + ' %' };
    });
  }

  // ---------- Déroulé ----------
  async function run() {
    if (S.running) return; S.running = true; S.items = []; S.log = []; S.done = false;
    try {
      setStatus('Lecture des bonnes réponses…');
      const r = await fetch(TEST + 'brillant-verite.json', { cache: 'no-store' }).catch(() => null);
      if (!r || !r.ok) throw new Error('Photos de test introuvables : cette page ne marche que sur le PC (dossier _tests-scanner).');
      const truth = await r.json();
      for (const p of truth.photos) {
        setStatus(`Découpe : ${p.f}`);
        let crops = []; try { crops = await cardsOf(p); } catch (e) { log(`${p.f} : ${e.message}`); }
        for (const [i, cv] of crops) {
          const [id, h] = p.cards[i];
          const it = { file: p.f, i, kind: p.type, jeu: p.jeu, id, label: h, res: {} };
          it.blob = await toBlob(cv); it.url = URL.createObjectURL(it.blob);
          S.items.push(it);
        }
        render(); await sleep(0);
      }
      // + les scans envoyés tout seuls par le téléphone (compte testeur), seulement ceux qui ont une bonne réponse
      if (S.useScans && S.scans) for (const sc of S.scans) if (sc.label != null) S.items.push({ ...sc, res: {} });
      setStatus('Chargement du réseau de neurones…');
      const mn = await loadMN().catch((e) => { log('MobileNet : ' + e.message); return null; });
      let tPhoto = 0, tRef = 0;
      for (const [k, it] of S.items.entries()) {
        setStatus(`Mesures : carte ${k + 1} / ${S.items.length} (${GAMES[it.jeu]})`);
        const ad = App.games.get(it.jeu);
        if (it.id) { try { it.card = await ad.getCard(it.id); } catch (e) { log(`${it.id} : ${e.message}`); } }
        it.truth = it.label === 'rar' ? (it.card && it.card.variants ? !!(it.card.variants.holo && !it.card.variants.normal) : null) : it.label == null ? null : !!it.label;
        it.name = it.card ? `${it.card.name} ${it.card.localId || ''}` : it.id || '?';
        const bmp = await createImageBitmap(it.blob);
        let t0 = performance.now();
        it.spark = Math.round(sparkles(bmp) * 1000) / 1000; it.zp = zoneStats(bmp);
        tPhoto += performance.now() - t0;
        if (mn) it.emb = embed(mn, bmp);
        try { it.cur = await current(it); } catch (e) { it.cur = { holo: null, how: 'erreur : ' + e.message }; }
        if (it.card) {
          const o = await officialBitmap(ad.img.card(it.card, 'high'));
          t0 = performance.now(); if (o) it.zo = zoneStats(o); tRef += performance.now() - t0;
        }
        await sleep(0);
      }
      S.ms = { photo: Math.round(tPhoto / S.items.length), ref: Math.round(tRef / Math.max(1, S.items.filter((x) => x.zo).length)) };
      const withE = S.items.filter((it) => it.emb);
      if (withE.length) { setStatus('Réseau de neurones : résumé des empreintes…'); await sleep(0); const P = pca(withE.map((it) => it.emb), 24); withE.forEach((it, i) => { it.pc = P[i]; }); }
      setStatus('Apprentissage en validation croisée…'); await sleep(0);
      evaluate();
      S.done = true;
      setStatus(`Terminé : ${S.items.length} cartes (${S.items.filter((x) => x.truth != null).length} avec une bonne réponse sûre).`);
      App.db.set('cache', 'labo-holo:last', { t: Date.now(), table: table(), ms: S.ms }).catch(() => {});
    } catch (e) { console.error(e); setStatus('Erreur : ' + e.message); log(String(e.stack || e)); }
    finally { S.running = false; render(); }
  }

  // ---------- Scans du téléphone (v3.52, js/scan-share.js : envoyés tout seuls par les comptes testeurs) ----------
  /** Bonne réponse d'un scan : la réponse à « Ta carte brille ? », ou la version choisie à la main dans le classeur */
  function scanLabel(d) {
    const base = (list) => (list || []).find((v) => ['normal', 'holo', 'reverse'].includes(v));
    const v = d.answer || (d.user ? base(d.picked) : null);
    return v ? (v === 'normal' ? 0 : 1) : null;
  }
  async function loadScans() {
    if (S.loadingScans) return; S.loadingScans = true;
    try {
      if (!App.cloud || !App.cloud.enabled) throw new Error('Pas de serveur configuré.');
      if (!S.cloudInit) { S.cloudInit = true; App.cloud.init().catch(() => {}); }
      setStatus('Connexion au compte…');
      for (let i = 0; i < 40 && App.cloud.state === 'synchro' && !App.cloud.user; i++) await sleep(250);
      if (!App.cloud.user) throw new Error('Pas de compte connecté : connecte-toi sur le site (même adresse), puis reviens ici.');
      if (!(await App.cloud.labo.tester())) throw new Error('Ce compte n’est pas testeur (script supabase-v19.sql, dernière ligne).');
      const rows = await App.cloud.labo.list();
      const out = [];
      for (const [k, r] of rows.entries()) {
        if (r.data && (r.data.kind === 'page' || r.data.kind === 'feuillete')) continue; // (photo entière d'une page de classeur, v3.61, ou geste « feuilleté », v3.62 : pas une carte à juger)
        setStatus(`Mes scans : photo ${k + 1} / ${rows.length}`);
        const key = 'labo-scan:' + r.id;
        let blob = await App.db.get('cache', key).catch(() => null);
        if (!blob) { blob = await App.cloud.labo.photo(r.id); if (blob) App.db.set('cache', key, blob).catch(() => {}); }
        if (!blob) continue;
        const d = r.data || {};
        out.push({ scan: true, file: '📱 ' + new Date(r.created_at).toLocaleString('fr-FR'), i: 0, kind: d.mode || 'carte', jeu: r.game, id: d.card ? d.card.id : null, label: scanLabel(d), blob, url: URL.createObjectURL(blob), data: d });
      }
      S.scans = out; S.useScans = true;
      setStatus(`${out.length} scans du téléphone, dont ${out.filter((x) => x.label != null).length} avec une bonne réponse (ta réponse à « Ta carte brille ? » ou la version choisie dans le classeur). « Lancer le test » les ajoute aux photos de test.`);
    } catch (e) { setStatus('Mes scans : ' + e.message); }
    finally { S.loadingScans = false; render(); }
  }
  const VN = { normal: 'normale', holo: 'brillante', reverse: 'reverse', firstEdition: '1ʳᵉ éd.' };
  function scansHtml() {
    if (!S.scans) return '';
    const by = {}; S.scans.forEach((s) => { by[s.jeu] = (by[s.jeu] || 0) + 1; });
    return `<h2>Mes scans du téléphone (${S.scans.length})</h2>
      <p class="muted small">${Object.entries(by).map(([g, n]) => `${esc(GAMES[g] || g)} ${n}`).join(' · ') || 'Aucun scan pour l’instant.'}</p>
      <div class="lab-grid">${S.scans.slice(0, 120).map((s) => { const d = s.data; return `<div class="lab-card">
        <img src="${s.url}" alt="">
        <div class="lab-want"><b>${esc(d.card ? d.card.name + ' ' + d.card.localId : 'Pas reconnue')}</b> · ${esc(GAMES[s.jeu] || s.jeu)}<div class="muted small">${esc(s.file)} · ${esc(d.mode || '')} · ${esc(d.kind || '')}</div></div>
        <div class="muted small">Scanner : ${esc((d.auto || []).map((v) => VN[v] || v).join(' · ') || '—')}${d.sure ? ' (sûr)' : d.exist && d.exist.length > 1 ? ' (à vérifier)' : ''}${d.answer ? ` · ta réponse : <b>${esc(VN[d.answer] || d.answer)}</b>` : d.user ? ` · choisie : <b>${esc((d.picked || []).map((v) => VN[v] || v).join(' · '))}</b>` : ''}</div>
      </div>`; }).join('')}</div>`;
  }

  // ---------- Résultats ----------
  const pct = (a, b) => (b ? Math.round((100 * a) / b) : null);
  function table() {
    const lab = S.items.filter((it) => it.truth != null);
    const score = (m, xs) => { const r = xs.filter((it) => it.res[m]); const hol = r.filter((it) => it.truth), nor = r.filter((it) => !it.truth); return { n: r.length, ok: r.filter((it) => it.res[m].holo === it.truth).length, hol: hol.length, holOk: hol.filter((it) => it.res[m].holo).length, nor: nor.length, norOk: nor.filter((it) => !it.res[m].holo).length }; };
    const two = lab.filter((it) => byCard(it) === undefined);
    return METHODS.map((m) => ({ id: m.id, all: score(m.id, lab), two: score(m.id, two), by: Object.fromEntries(Object.keys(GAMES).map((g) => [g, score(m.id, lab.filter((it) => it.jeu === g))])) }));
  }
  function cell(s) {
    if (!s || !s.n) return '<td class="muted">—</td>';
    return `<td><b>${pct(s.ok, s.n)} %</b><div class="muted small">${s.ok}/${s.n}<br>✨ ${s.holOk}/${s.hol} · normales ${s.norOk}/${s.nor}</div></td>`;
  }
  function render() {
    const el = document.getElementById('labo');
    const T = (S.done ? table() : (S.saved && S.saved.table) || []).filter((r) => METHODS.some((m) => m.id === r.id && r.two)); // (résultats gardés d'une version plus ancienne du labo : ignorés)
    const ms = S.ms || (S.saved && S.saved.ms);
    el.innerHTML = `
      <h1>Labo — cartes brillantes</h1>
      <p class="muted">Pour chaque carte des photos de test (découpée comme le fait le scanner) : est-elle brillante (holo, foil, reverse) ? Les 3 méthodes nouvelles sont <b>les mêmes pour toutes les licences</b>. Modèles appris en validation croisée : chaque carte est jugée par un modèle qui ne l’a jamais vue.</p>
      <div class="lab-bar"><button class="btn primary" id="lab-run" ${S.running ? 'disabled' : ''}>Lancer le test</button><button class="btn" id="lab-scans" ${S.loadingScans ? 'disabled' : ''}>📱 Récupérer mes scans</button>${S.scans ? `<label class="lab-chk"><input type="checkbox" id="lab-usescans" ${S.useScans ? 'checked' : ''}> les inclure dans le test</label>` : ''}${ms ? `<span class="muted small">Mesures : ${ms.photo} ms par photo de carte, + ${ms.ref} ms pour le visuel officiel</span>` : ''}</div>
      <div id="lab-status" class="muted">${esc(S.status || '')}</div>
      ${T.length ? `<div class="lab-tablewrap"><table class="lab-table">
        <thead><tr><th>Méthode</th><th>Toutes</th><th>Cartes à 2 versions</th>${Object.values(GAMES).map((g) => `<th>${esc(g)}</th>`).join('')}</tr></thead>
        <tbody>${T.map((r) => { const m = METHODS.find((x) => x.id === r.id); return `<tr class="${r === T.reduce((b, x) => (x.all.ok / (x.all.n || 1) > b.all.ok / (b.all.n || 1) ? x : b), T[0]) ? 'best' : ''}"><td><b>${esc(m.name)}</b><div class="muted small">${esc(m.desc)}</div></td>${cell(r.all)}${cell(r.two)}${Object.keys(GAMES).map((g) => cell(r.by[g])).join('')}</tr>`; }).join('')}</tbody>
      </table></div><p class="muted small">✨ = brillantes reconnues / brillantes ; normales = normales reconnues / normales. « Cartes à 2 versions » : celles qui existent en normale ET en brillante (la rareté ne suffit pas : c’est là que la photo doit trancher). « — » : rien à juger (ex. Actuel pour une carte dont on ne connaît pas l’identité).</p>` : ''}
      ${scansHtml()}
      ${S.items.length ? `<h2>Carte par carte</h2><div class="lab-grid">${S.items.map((it) => `<div class="lab-card">
        <img src="${it.url}" alt="">
        <div class="lab-want"><b>${it.truth == null ? '? pas sûr' : it.truth ? '✨ Brillante' : 'Normale'}</b> · ${esc(GAMES[it.jeu])}<div class="muted small">${esc(it.name || it.id || '')} · ${esc(it.file)}${it.kind === 'page' ? ' · case ' + (it.i + 1) : ''}</div></div>
        ${METHODS.filter((m) => it.res[m.id]).map((m) => { const r = it.res[m.id], good = it.truth == null ? null : r.holo === it.truth; return `<div class="lab-ans ${good == null ? 'near' : good ? 'ok' : 'ko'}" title="${esc(r.s || '')}"><span>${esc(m.name.replace(/ \(.*\)| :.*$/, ''))}</span><span>${r.holo ? '✨' : 'normale'} ${good == null ? '' : good ? '✓' : '✗'}</span></div>`; }).join('')}
      </div>`).join('')}</div>` : ''}
      <details class="lab-log"><summary>Journal</summary><pre>${esc(S.log.join('\n'))}${S.models && S.models.hybride ? '\nModèle hybride (sur toutes les cartes à 2 versions) : ' + esc(JSON.stringify({ mu: S.models.hybride.mu, sd: S.models.hybride.sd, w: S.models.hybride.w, b: S.models.hybride.b })) : ''}</pre></details>`;
    el.querySelector('#lab-run').addEventListener('click', run);
    el.querySelector('#lab-scans').addEventListener('click', loadScans);
    const us = el.querySelector('#lab-usescans'); if (us) us.addEventListener('change', () => { S.useScans = us.checked; });
  }
  function setStatus(t) { S.status = t; const s = document.getElementById('lab-status'); if (s) s.textContent = t; }

  App.laboHolo = { run, S, _: { sparkles, zoneStats, fitLogit, pca } };
  render();
  App.db.get('cache', 'labo-holo:last').then((h) => {
    if (h && h.table && !S.done && !S.running) { S.saved = h; S.status = `Derniers résultats : ${new Date(h.t).toLocaleString('fr-FR')}. « Lancer le test » pour les refaire et voir les cartes une par une.`; render(); }
  }).catch(() => {});
})();
