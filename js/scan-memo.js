/*
 * Aides du scanner (v3.36), chargé au démarrage (Paramètres s'en sert aussi), toutes licences :
 *  - carnet des scans ratés (log, list, send, clear) : chaque carte mal ou pas reconnue est gardée sur l'appareil
 *    (photo, ce qui a été lu, les propositions, la bonne carte) ; « Envoyer » en fait un fichier à transmettre à Claude
 *    pour régler le scanner sur de vraies photos de téléphone ;
 *  - corrections retenues (learn, apply, choose) : la carte choisie à la main à la place de la 1re proposition est
 *    proposée en premier la fois suivante (jamais « sûre » pour autant) ;
 *  - préparation (prepare, prefetch) : outils de lecture chargés dès l'ouverture de Capturer, et tout ce dont le scanner
 *    a besoin téléchargé d'avance (bouton des Paramètres, ou tout seul en Wi-Fi).
 */
App.scanMemo = (() => {
  const MAX = 40; // scans gardés dans le carnet (le fichier envoyé reste sous ~10 Mo)
  const K_LIST = 'scanLog', K_ITEM = (id) => 'scanLog:' + id, K_LEARN = 'scanLearn';
  const getKv = (k) => App.db.get('kv', k).catch(() => null);
  const setKv = (k, v) => App.db.set('kv', k, v).catch((e) => console.warn('carnet', e));

  // ---------------- Carnet des scans ratés ----------------
  const KINDS = { aucune: 'Pas reconnue', corrigee: 'Mauvaise carte proposée', reprise: 'Photo reprise' };
  const enabled = () => App.settings.scanLog !== false;
  const setName = (c) => (c.set && (c.set.name || c.set.id)) || c.setName || c.setId || '';
  const ref = (c) => (c ? { id: c.id, name: c.name || '', localId: c.localId || '', set: setName(c) } : null);
  const candRef = (c) => ({ ...ref(c), sure: !!c.confident, num: !!(c.numOk && c.ofOk), image: c.orb != null ? Math.round(c.orb) : null, dessin: c.visual != null ? Math.round(c.visual * 100) / 100 : null, nom: c.nameScore != null ? Math.round(c.nameScore * 100) / 100 : null, appris: !!c.learned });
  let queue = Promise.resolve(); // (écritures l'une après l'autre : la liste n'est jamais écrasée par une écriture plus ancienne)
  const serial = (fn) => (queue = queue.then(fn, fn));
  async function list() { return (await getKv(K_LIST)) || []; }
  /**
   * Garde un scan raté → son id (pour le compléter ensuite avec update), ou null.
   * { game, mode: 'carte'|'classeur'|'rafale', kind: 'aucune'|'corrigee'|'reprise', photo (carte), original (photo entière),
   *   read (ce qui a été lu, en texte), cands (propositions, la 1re d'abord), chosen (la bonne carte) }
   */
  function log({ game, mode, kind, photo, original = null, read = '', cands = [], chosen = null }) {
    if (!enabled() || !photo) return Promise.resolve(null);
    return serial(async () => {
      try {
        const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const small = await App.util.resizeImage(photo, 800, 0.85, 'image/webp').catch(() => photo);
        const orig = original && original !== photo ? await App.util.resizeImage(original, 1200, 0.8, 'image/webp').catch(() => null) : null;
        await setKv(K_ITEM(id), { photo: small, original: orig });
        const meta = { id, t: Date.now(), game, mode, kind, read: String(read || '').slice(0, 300), cands: cands.slice(0, 5).map(candRef), chosen: ref(chosen) };
        const all = [meta, ...(await list())];
        for (const old of all.splice(MAX)) await App.db.del('kv', K_ITEM(old.id)).catch(() => {});
        await setKv(K_LIST, all);
        return id;
      } catch (e) { console.warn('carnet des scans ratés', e); return null; }
    });
  }
  /** Complète un scan déjà gardé (ex. la bonne carte trouvée ensuite à la main) */
  function update(id, patch) {
    if (!id) return Promise.resolve();
    return serial(async () => {
      const all = await list(), m = all.find((x) => x.id === id); if (!m) return;
      if (patch.kind) m.kind = patch.kind;
      if ('chosen' in patch) m.chosen = ref(patch.chosen);
      await setKv(K_LIST, all);
    });
  }
  const photoOf = async (id) => { const it = await getKv(K_ITEM(id)); return it && it.photo; };
  function clear() {
    return serial(async () => { for (const m of await list()) await App.db.del('kv', K_ITEM(m.id)).catch(() => {}); await setKv(K_LIST, []); });
  }
  /** Fichier du carnet (photos comprises, en texte) : { file, n } */
  async function exportFile(asText = false) {
    const metas = await list(), scans = [];
    for (const m of metas) {
      const it = (await getKv(K_ITEM(m.id))) || {};
      scans.push({ ...m, quand: new Date(m.t).toISOString(), photo: it.photo ? await App.util.blobToDataURL(it.photo) : null, original: it.original ? await App.util.blobToDataURL(it.original) : null });
    }
    const device = { cœurs: navigator.hardwareConcurrency || null, écran: `${screen.width}×${screen.height}`, navigateur: navigator.userAgent };
    const json = JSON.stringify({ app: 'CollecDex', type: 'carnet-scans-rates', version: window.APP_VERSION || '', date: new Date().toISOString(), device, scans });
    const day = new Date().toISOString().slice(0, 10);
    // (partage du téléphone : Chrome n'accepte pas les .json, seulement le texte, les images, les PDF…)
    const file = new File([json], `collecdex-scans-rates-${day}.${asText ? 'txt' : 'json'}`, { type: asText ? 'text/plain' : 'application/json' });
    return { file, n: scans.length };
  }
  /** « Envoyer à Claude » : partage du téléphone (Gmail, Drive…) sinon téléchargement → 'partage' | 'telecharge' | 'annule' | 'vide' */
  async function send() {
    if (!(await list()).length) return 'vide';
    const { file } = await exportFile(true);
    if (navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'CollecDex — scans ratés', text: 'Carnet des scans ratés de CollecDex (photos + ce que le scanner a lu), pour Claude.' }); return 'partage'; }
      catch (e) { if (e && e.name === 'AbortError') return 'annule'; }
    }
    const { file: f2 } = await exportFile(false);
    const a = document.createElement('a'); a.href = URL.createObjectURL(f2); a.download = f2.name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    return 'telecharge';
  }

  // ---------------- Corrections retenues ----------------
  let learnP = null;
  const learned = () => learnP || (learnP = getKv(K_LEARN).then((m) => m || {}));
  const keyOf = (game, id) => `${game}|${id}`;
  // la carte gardée telle qu'elle a été proposée (pour la reproposer même si la recherche ne la trouve pas), sans les notes du scan
  const TRANSIENT = ['confident', 'learned', 'numOk', 'ofOk', 'orb', 'visual', 'nameScore', 'score', 'twin', 'atkM', 'isTarget', 'notRead', 'numFix'];
  const snap = (c) => { try { const o = JSON.parse(JSON.stringify(c, (k, v) => (v instanceof Blob ? undefined : v))); for (const k of TRANSIENT) delete o[k]; return o; } catch (e) { return null; } };
  async function save(m) {
    const keys = Object.keys(m);
    if (keys.length > 400) keys.sort((a, b) => m[a].t - m[b].t).slice(0, keys.length - 400).forEach((k) => delete m[k]);
    await setKv(K_LEARN, m);
  }
  /** La 1re proposition était « wrong », la personne a choisi « chosen » : retenu */
  async function learn(game, wrong, chosen) {
    if (!wrong || !chosen || wrong.id === chosen.id) return;
    const m = await learned(), k = keyOf(game, wrong.id), cur = m[k], card = snap(chosen);
    if (!card) return;
    m[k] = { card, n: (cur && cur.card.id === chosen.id ? cur.n : 0) + 1, t: Date.now() };
    await save(m);
  }
  async function unlearn(game, wrongId) { const m = await learned(), k = keyOf(game, wrongId); if (m[k]) { delete m[k]; await save(m); } }
  const learnedCount = async () => Object.keys(await learned()).length;
  async function forgetAll() { await setKv(K_LEARN, {}); learnP = null; } // (relues depuis la base au prochain usage)
  /**
   * Propositions d'un scan → { cands, from } : si la 1re a déjà été corrigée par la personne, la carte qu'elle avait choisie
   * passe devant (« learned »), et plus rien n'est « sûr » (from = id de la 1re d'origine)
   */
  async function apply(game, cands) {
    const top = cands && cands[0];
    if (!top) return { cands: cands || [], from: null };
    const r = (await learned())[keyOf(game, top.id)];
    if (!r || !r.card) return { cands, from: null };
    const c = cands.find((x) => x.id === r.card.id) || { ...r.card };
    for (const x of cands) delete x.confident;
    c.learned = true;
    return { cands: [c, ...cands.filter((x) => x !== c)], from: top.id };
  }
  /**
   * La personne a choisi une carte parmi les propositions affichées (shown, 1re d'abord ; from = 1re d'origine si une
   * correction l'avait remplacée) → la correction est retenue, renforcée ou oubliée. Renvoie la 1re d'origine si elle
   * n'a pas été choisie (= scan raté, à garder dans le carnet), sinon null.
   */
  async function choose(game, shown, chosen, from = null) {
    if (!chosen || !shown || !shown.length) return null;
    if (from) {
      if (chosen.id === from) { await unlearn(game, from); return null; } // la correction retenue était fausse cette fois
      await learn(game, { id: from }, chosen);
      return chosen.id === shown[0].id ? null : { id: from };
    }
    if (chosen.id === shown[0].id) return null;
    await learn(game, shown[0], chosen);
    return shown[0];
  }

  // Classeur et rafale : la proposition d'origine d'une case est gardée au 1er choix fait à la main…
  function markPick(cell) { if (cell && !cell.sys) cell.sys = { choice: cell.choice || '', cands: (cell.cands || []).slice(0, 5) }; }
  /** …puis, à l'enregistrement, comparée à la carte choisie : correction retenue, scan raté gardé dans le carnet */
  async function batchPicked(game, mode, cell, cand, read = '') {
    if (!cell || !cell.sys || !cand) return;
    const shown = cell.sys.cands, top = shown.find((x) => x.id === cell.sys.choice) || null;
    const list = top ? [top, ...shown.filter((x) => x !== top)] : [];
    const miss = top ? await choose(game, list, cand, top.learned ? cell.learnFrom : null) : null;
    if (miss || !top) await log({ game, mode, kind: top ? 'corrigee' : 'aucune', photo: cell.blob, original: cell.orig || null, read, cands: list, chosen: cand });
  }

  // ---------------- Préparation du scanner ----------------
  const indexOf = (game) => (game === 'pokemon' || !App.games.get(game) ? App.visual && App.visual.POKEMON_INDEX : App.games.get(game).visualIndex);
  const lite = () => !!(navigator.connection && navigator.connection.saveData);
  /** Ouverture de Capturer : lecteurs de texte et vérification par l'image (avec la base d'images de la licence) préparés d'avance */
  function prepare(game) {
    if (lite()) return;
    setTimeout(() => {
      try { if (App.recognizer && App.recognizer.warm) App.recognizer.warm(); } catch (e) { /* */ }
      try {
        const V = App.visual;
        if (V && V.supported() && App.settings.visualCheck !== false && !V.isWarm()) V.warm(indexOf(game));
      } catch (e) { /* */ }
    }, 700); // (la page et la caméra d'abord)
  }

  // Tout ce que le scanner télécharge au 1er scan (gardé ensuite par le service worker, sw.js)
  const TESS = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/';
  const CORE = 'https://cdn.jsdelivr.net/npm/tesseract.js-core@v5.1.1/';
  const MODEL = 'https://storage.googleapis.com/tfjs-models/savedmodel/mobilenet_v2_1.0_224/';
  const simd = () => { try { return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11])); } catch (e) { return false; } };
  function groups() {
    const games = App.games.list.filter((g) => g.status === 'actif' && App.games.get(g.id));
    const idx = (i) => (i ? [`${i.index}.json?v=${i.v}`, `${i.index}.bin?v=${i.v}`] : []);
    return [
      { id: 'texte', name: 'Lecteur de texte', urls: [TESS + 'tesseract.min.js', 'https://cdn.jsdelivr.net/npm/tesseract.js@v5.1.1/dist/worker.min.js', CORE + (simd() ? 'tesseract-core-simd-lstm.wasm.js' : 'tesseract-core-lstm.wasm.js'), 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/fra/4.0.0_best_int/fra.traineddata.gz'] },
      // v3.40 : lecteur des codes et numéros (PaddleOCR, js/ocr-worker.js)
      { id: 'codes', name: 'Lecteur des numéros de carte', urls: ['js/ocr-worker.js?v=' + encodeURIComponent(window.APP_VERSION || '1'), ...['ort.wasm.min.js', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm'].map((f) => 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/' + f), 'data/ocr/ppocr5-en-rec.onnx?v=1', 'data/ocr/ppocr5-en-dict.txt?v=1', 'data/ocr/ppocr4-det.onnx?v=1'] },
      { id: 'image', name: 'Reconnaissance par l’image', model: true, urls: ['js/visual-worker.js?v=' + encodeURIComponent(window.APP_VERSION || '1'), 'https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.10.0-release.1/dist/opencv.js', 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js', MODEL + 'model.json'] },
      ...games.map((g) => ({ id: g.id, name: `Base d’images ${g.name}`, urls: [...idx(indexOf(g.id)), ...({ lorcana: ['data/lc-cartes.json'], yugioh: ['data/yg-cartes.json'] }[g.id] || [])] })).filter((g) => g.urls.length),
    ];
  }
  const sig = () => groups().map((g) => g.urls.join(',')).join('|');
  const cached = async (u) => { try { return !!(window.caches && await caches.match(new URL(u, location.href).href, { ignoreVary: true, ignoreSearch: false })); } catch (e) { return false; } };
  /** Où en est la préparation : [{ id, name, ok }] */
  async function prefetchState() {
    await App.need('reco').catch(() => {}); // (numéro de la base d'images Pokémon : dans visual.js)
    const out = [];
    for (const g of groups()) out.push({ id: g.id, name: g.name, ok: (await Promise.all(g.urls.map(cached))).every(Boolean) });
    return out;
  }
  let running = null;
  /** Télécharge d'avance tout ce qui manque → { ok, failed, mb } ; onStep(nom du groupe, fait, total) */
  function prefetch(onStep = () => {}) {
    if (running) return running;
    running = (async () => {
      await App.need('reco').catch(() => {});
      let bytes = 0, failed = 0; const bad = [];
      const gs = groups();
      const get = async (u) => {
        if (await cached(u)) return true;
        try { const r = await fetch(u, { mode: 'cors', credentials: 'omit' }); if (!r.ok) throw new Error(r.status); bytes += (await r.arrayBuffer()).byteLength; return true; }
        catch (e) { failed++; bad.push(u); return false; }
      };
      for (const [i, g] of gs.entries()) {
        onStep(g.name, i, gs.length);
        if (g.model) {
          // OpenCV, TensorFlow et le modèle : chargés par l'outil lui-même (visual-worker.js), comme au 1er scan — la page n'a
          // pas le droit de joindre le serveur du modèle (CSP), le worker si ; le service worker garde tout au passage
          if ((await Promise.all(g.urls.map(cached))).every(Boolean)) continue;
          const V = App.visual, inScan = () => location.hash.startsWith('#/scan');
          const ok = V && V.supported() ? await V.warm().catch(() => null) : null;
          if (!ok) { failed++; bad.push(g.id); }
          if (V && !inScan()) V.stop(); // (hors de Capturer : inutile de le garder en mémoire)
          continue;
        }
        for (const u of g.urls) await get(u);
      }
      onStep('', gs.length, gs.length);
      if (!failed) { try { localStorage.setItem('scanPrep', sig()); } catch (e) { /* */ } }
      return { ok: !failed, failed, bad, mb: Math.round(bytes / 1e5) / 10 };
    })().finally(() => { running = null; });
    return running;
  }
  // tout seul en Wi-Fi (Android : navigator.connection.type), une fois par version des fichiers, au calme après le démarrage
  function autoPrefetch() {
    const c = navigator.connection;
    if (App.settings.scanPrefetch === false || !c || !['wifi', 'ethernet'].includes(c.type) || c.saveData) return;
    if (!navigator.serviceWorker || !navigator.serviceWorker.controller) return; // (sans service worker, rien ne serait gardé)
    let done = ''; try { done = localStorage.getItem('scanPrep') || ''; } catch (e) { /* */ }
    App.need('reco').then(() => { if (done !== sig()) prefetch().catch(() => {}); }).catch(() => {});
  }
  setTimeout(autoPrefetch, 20000);

  return { KINDS, MAX, log, update, list, photoOf, clear, send, exportFile, learn, unlearn, apply, choose, markPick, batchPicked, learnedCount, forgetAll, prepare, prefetch, prefetchState, groups };
})();
