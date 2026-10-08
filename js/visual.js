/*
 * Vérification par l'image (réseau de neurones + points clés), calculée dans js/visual-worker.js.
 * App.visual.rank(qid, blob, refs, { must, bonusSet, onProgress }) → { res: [{ id, s }], best }
 *   refs : [{ id, url (visuel officiel), set }] ; must : cartes toujours vérifiées (celles trouvées par le texte).
 * Score s ≈ nombre de points qui tombent au même endroit : ≥ 25 = la même image (mesuré sur 90 cartes de test).
 */
App.visual = (() => {
  const SURE = 25;
  let w = null, seq = 0, broken = false;
  const pend = new Map();
  const supported = () => !broken && typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap !== 'undefined';
  function worker() {
    if (w) return w;
    w = new Worker('js/visual-worker.js?v=' + encodeURIComponent(window.APP_VERSION || '1'));
    w.onmessage = (e) => {
      const m = e.data, p = pend.get(m.rid);
      if (!p) return;
      if (m.op === 'progress') { if (p.onProgress) p.onProgress(m.done, m.total); return; }
      pend.delete(m.rid);
      if (m.ok) p.resolve(m); else p.reject(new Error(m.error));
    };
    w.onerror = (e) => { console.warn('vérification par l’image indisponible', e.message); broken = true; stop(); };
    return w;
  }
  function rank(qid, blob, refs, { must = [], bonusSet = null, onProgress = null } = {}) {
    return new Promise((resolve, reject) => {
      const rid = ++seq;
      pend.set(rid, { resolve, reject, onProgress });
      worker().postMessage({ op: 'rank', rid, qid, blob, refs, must, bonusSet });
    });
  }
  /** Prépare les bibliothèques pendant que le texte est lu (le 1er chargement prend quelques secondes) → { ms, backend } */
  function warm() {
    if (!supported()) return Promise.resolve(null);
    return new Promise((resolve) => {
      const rid = ++seq;
      pend.set(rid, { resolve, reject: () => resolve(null) });
      worker().postMessage({ op: 'warm', rid });
    });
  }
  /** Demande au worker (op + données) → réponse */
  function ask(op, data) {
    return new Promise((resolve, reject) => {
      const rid = ++seq;
      pend.set(rid, { resolve, reject });
      worker().postMessage({ op, rid, ...data });
    });
  }
  // empreintes de toute la base, préparées d'avance (v2.83) : data/vis-index.json + .bin
  const INDEX = 'data/vis-index';
  /** Les k cartes de toute la base les plus proches pour le réseau de neurones → [{ id, set, img, s }] (img = adresse du visuel sans « /low.webp ») ;
   *  index = autre licence (One Piece : data/op-index, v2.94) */
  const INDEX_V = 1; // à changer quand l'index est refait (le service worker garde le fichier tant que le numéro ne change pas)
  const global = (qid, blob, k = 40, { index = INDEX, v = INDEX_V } = {}) => ask('global', { qid, blob, k, base: new URL(index, location.href).href, qs: '?v=' + v }).then((r) => r.res);
  // ---------- Une carte seule, toutes licences (v2.94) ----------
  /** Coins de la carte (fractions de la photo) → la carte remise à plat, pile sur ses bords ; null si un coin sort de la photo */
  async function quadCrop(blob, quad) {
    // (un coin hors de la photo : carte coupée, on ne recadre pas, sinon les pixels du bord sont étirés)
    if (!quad || quad.some(([x, y]) => x < -0.005 || x > 1.005 || y < -0.005 || y > 1.005)) return null;
    const bmp = await createImageBitmap(blob), q = quad.map(([x, y]) => [x * bmp.width, y * bmp.height]);
    const w = Math.round(Math.min(900, Math.max(240, Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]))));
    const cvs = App.recognizer.warpQuad(bmp, q, w, 0);
    return new Promise((res) => cvs.toBlob(res, 'image/jpeg', 0.92));
  }
  /** Le centre de la photo (k = part gardée) → { blob, k } */
  async function centerOf(blob, k) {
    const bmp = await createImageBitmap(blob), w = bmp.width * k, h = bmp.height * k;
    const c = document.createElement('canvas'); c.width = Math.round(w); c.height = Math.round(h);
    c.getContext('2d').drawImage(bmp, (bmp.width - w) / 2, (bmp.height - h) / 2, w, h, 0, 0, c.width, c.height);
    return { blob: await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.92)), k };
  }
  /** Cartes de l'index Pokémon retrouvées dans leur série (mêmes informations que les propositions du texte) */
  async function pokemonCards(near) {
    const ad = App.games.get('pokemon'), out = [], sets = new Map();
    for (const t of near) {
      try {
        if (!sets.has(t.set)) sets.set(t.set, await ad.getSet(t.set));
        const s = sets.get(t.set), x = s && s.cards.find((y) => y.id === t.id);
        if (x) out.push({ ...x, set: { id: s.id, name: s.name, logo: s.logo, symbol: s.symbol, releaseDate: s.releaseDate, cardCount: { total: s.total, official: s.official }, serie: s.group } });
      } catch (e) { /* série indisponible */ }
    }
    return out;
  }
  /** Jumelles d'une carte Pokémon : même nom dans la même série (holo / non holo au même dessin : Sulfura 12 et 27) */
  async function pokemonTwins(top) {
    const sid = (top.set && top.set.id) || top.setId; if (!sid) return [];
    const s = await App.games.get('pokemon').getSet(sid), n = App.util.norm(top.name);
    return pokemonCards(s.cards.filter((c) => c.id !== top.id && App.util.norm(c.name) === n).map((c) => ({ id: c.id, set: sid })));
  }
  /**
   * Vérification par l'image d'une carte seule (même méthode que le classeur Pokémon) :
   * cands = cartes trouvées par le texte (peut être vide) ; + les 24 cartes de toute la base les plus proches pour le réseau ;
   * puis points clés. → { cands (classées, la 1re `confident` si sûre), best, crop (carte recadrée sur ses bords) } ou null.
   * opts : index / v (index de la licence, Pokémon par défaut), cardsOf(near) (cartes de l’index → propositions), urlOf(carte) (visuel),
   *        tie(a, b) (même image à 10 % près : laquelle d’abord), twinsOf(carte) (jumelles toujours comparées avant « sûre »).
   * Photo entière, marge comprise (main, pochette, boîte autour) : le réseau s'y perd ; son centre (≈ le cadre jaune de la
   * caméra) le trouve bien mieux (photos d'Arnaud : Monet hors des 40 premières → 1ʳᵉ). Carte déjà au ras de ses bords
   * (format d'une carte) : la photo telle quelle d'abord.
   */
  const NEAR = 24; // cartes de toute la base vérifiées par photo (la bonne était dans les 4 premières sur les photos de test ; chaque visuel jamais vu est à télécharger)
  async function check(blob, cands, { index = INDEX, v = INDEX_V, cardsOf = pokemonCards, tie = () => 0, urlOf = null, twinsOf = pokemonTwins, twinKey = null, extra = [] } = {}) {
    const tag = `one:${Date.now()}:${Math.random()}`;
    const bmp = await createImageBitmap(blob), tight = Math.abs(bmp.width / bmp.height - 63 / 88) < 0.04;
    const center = await centerOf(blob, 0.77), queries = tight ? [{ blob, k: 1 }, center] : [center, { blob, k: 1 }];
    // extra : cartes comparées en plus (jumelles), sans compter comme trouvées par le texte
    const sc = new Map(), pool = [...cands.slice(0, 40), ...extra.filter((x) => !cands.slice(0, 40).some((c) => c.id === x.id))], have = new Set([...cands.map((c) => c.id), ...pool.map((c) => c.id)]), urls = new Map();
    const url = (c) => urls.get(c.id) || (urlOf ? urlOf(c) : App.games.get('pokemon').img.card(c, 'low'));
    let best = 0;
    for (const [n, q] of queries.entries()) {
      const qid = `${tag}:${n}`;
      try {
        let near = [];
        try { near = (await global(qid, q.blob, NEAR, { index, v })).filter((x) => !have.has(x.id)); } catch (e) { console.warn('index', index, e.message); }
        for (const t of near) if (t.img) urls.set(t.id, t.img + '/low.webp'); // (visuel de l'index : même empreinte gardée qu'en classeur)
        for (const x of await cardsOf(near)) if (!have.has(x.id)) { have.add(x.id); pool.push(x); }
        if (!pool.length) return null;
        const r = await rank(qid, q.blob, pool.map((c) => ({ id: c.id, url: url(c), set: (c.set && c.set.id) || c.setId })), { must: [...cands.slice(0, 12), ...extra].map((c) => c.id) });
        // coins de la carte reportés sur la photo entière
        const o = (1 - q.k) / 2, full = (quad) => quad && quad.map(([x, y]) => [o + x * q.k, o + y * q.k]);
        for (const x of r.res) if (!sc.has(x.id) || sc.get(x.id).s < x.s) sc.set(x.id, { s: x.s, quad: full(x.quad) });
        best = Math.max(best, r.best);
      } finally { forget(qid); }
      if (best >= SURE) break; // (2ᵉ essai seulement si l'image n'a rien donné de sûr)
    }
    for (const c of pool) c.orb = sc.has(c.id) ? sc.get(c.id).s : null;
    const textPos = new Map(cands.map((c, i) => [c.id, i]));
    const same = (a, b) => tie(a, b) || ((textPos.get(a.id) ?? 99) - (textPos.get(b.id) ?? 99));
    const ranked = pool.filter((c) => c.orb >= 15).sort((a, b) => (Math.abs(a.orb - b.orb) < 0.1 * Math.max(a.orb, b.orb) ? same(a, b) : b.orb - a.orb));
    if (!ranked.length) return { cands, best };
    // numéro complet lu sur la carte (« 101/100 », code « OP10-119 ») et image compatible : cette carte reste devant, pas « sûre »
    // si l'image en préfère une autre (Salamèche 101 ↔ Reptincel 102, dessins proches : l'image seule se trompait)
    const read = cands.find((c) => c.numOk && c.ofOk && c.orb >= 15);
    if (read && ranked[0] !== read) { ranked.splice(ranked.indexOf(read), 1); ranked.unshift(read); }
    // même dessin (holo / non holo de la même série, réimpression) : l'image ne les sépare pas vraiment (Sulfura 27 ↔ 12 :
    // 110 contre 79 selon le cadrage) → une jumelle à plus de la moitié du score suffit pour ne pas dire « sûre »
    const sameArt = (a, b) => (twinKey ? twinKey(a) === twinKey(b) : App.util.norm(a.name) === App.util.norm(b.name) && ((a.set && a.set.id) || a.setId) === ((b.set && b.set.id) || b.setId));
    const top = ranked[0], second = ranked.find((c) => c !== top && (c.orb >= 0.8 * top.orb || (sameArt(c, top) && c.orb >= 0.5 * top.orb)));
    const out = [...ranked, ...cands.filter((c) => !ranked.includes(c))];
    for (const c of out) delete c.confident;
    // jumelles de la meilleure (même nom dans la même série, autres versions du même code) : toujours comparées avant de dire
    // « sûre » — sans elles, Sulfura 27 passait sûre alors que c'était la 12 (même dessin, holo / non holo)
    if (twinsOf && top.orb >= SURE && !second) {
      const tw = (await twinsOf(top).catch(() => [])).filter((x) => !pool.some((c) => c.id === x.id && c.orb != null));
      if (tw.length) return check(blob, cands, { index, v, cardsOf, tie, urlOf, twinsOf: null, twinKey, extra: [...extra, ...ranked.filter((c) => !cands.includes(c)).slice(0, 12), ...tw] });
    }
    // sûre : image nettement reconnue, aucune autre carte aussi proche (sinon même dessin : la personne choisit)
    if (top.orb >= SURE && !second && !(read && top.orb < Math.max(...ranked.map((c) => c.orb)))) top.confident = true;
    const q = top.orb >= SURE && sc.get(top.id) && sc.get(top.id).quad;
    return { cands: out, best: top.orb, crop: q ? await quadCrop(blob, q).catch(() => null) : null, url: url(top) };
  }
  /**
   * Carte déjà reconnue : ses vrais bords cherchés dans une autre image (classeur : la case et ses alentours, où la carte est
   * entière même si la grille l'a coupée) → la carte pile sur ses bords, ou null
   */
  async function cropOn(blob, c, url) {
    const ref = [{ id: c.id, url, set: (c.set && c.set.id) || c.setId }];
    const quadIn = async (b) => {
      const qid = `crop:${Date.now()}:${Math.random()}`;
      try { const r = await rank(qid, b, ref, { must: [c.id] }), x = r.res.find((y) => y.id === c.id); return x && x.s >= SURE && x.quad ? x.quad : null; } finally { forget(qid); }
    };
    let q1 = await quadIn(blob);
    if (!q1) {
      // pas assez de points (carte sombre, petite dans l'image) : 2ᵉ essai sur le centre de l'image, la carte y est plus grande
      const k = 0.8, o = (1 - k) / 2, mid = await centerOf(blob, k), q = await quadIn(mid.blob);
      q1 = q && q.map(([x, y]) => [o + x * k, o + y * k]);
    }
    if (!q1) return null;
    // la carte est petite dans cette image (peu de points, bords approximatifs) : on recommence au plus près d'elle
    try {
      const bmp = await createImageBitmap(blob), W = bmp.width, H = bmp.height;
      const xs = q1.map((p) => p[0]), ys = q1.map((p) => p[1]), mx = (Math.max(...xs) - Math.min(...xs)) * 0.06, my = (Math.max(...ys) - Math.min(...ys)) * 0.06;
      const x0 = Math.max(0, Math.min(...xs) - mx), y0 = Math.max(0, Math.min(...ys) - my), x1 = Math.min(1, Math.max(...xs) + mx), y1 = Math.min(1, Math.max(...ys) + my);
      const cv = document.createElement('canvas'); cv.width = Math.round((x1 - x0) * W); cv.height = Math.round((y1 - y0) * H);
      cv.getContext('2d').drawImage(bmp, x0 * W, y0 * H, cv.width, cv.height, 0, 0, cv.width, cv.height);
      const tight = await new Promise((res) => cv.toBlob(res, 'image/jpeg', 0.92));
      const q2 = tight && await quadIn(tight);
      if (q2) { const crop = await quadCrop(tight, q2).catch(() => null); if (crop) return crop; }
    } catch (e) { /* bords de la 1re passe */ }
    return quadCrop(blob, q1);
  }
  /** (outil de préparation de l'index) empreintes du réseau pour des visuels / une photo */
  const embed = (urls) => ask('embed', { urls }).then((r) => r.vecs);
  const embedBlob = (blob) => ask('embedBlob', { blob });
  const forget = (qid) => { if (w) w.postMessage({ op: 'forget', qid }); };
  function stop() {
    if (w) { w.terminate(); w = null; }
    for (const p of pend.values()) p.reject(new Error('arrêté'));
    pend.clear();
  }
  return { SURE, supported, rank, warm, global, check, cropOn, quadCrop, embed, embedBlob, forget, stop };
})();
