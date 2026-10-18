/*
 * Lecture des codes et numéros de carte par PaddleOCR (v3.37, worker js/ocr-worker.js) — toutes les licences.
 * Labo (_tests-scanner/ocr-lab.js, ocr-run.js, ocr-paddle.js ; 18 oct. 2026) : 105 cartes des photos d'Arnaud (Pokémon 31,
 * Yu-Gi-Oh! 33, Riftbound 22, One Piece 12, Lorcana 7), carte à plat, zone du numéro :
 *  - Tesseract (réglages actuels) 23 numéros justes ; Tesseract en ligne seule (psm 7, bandes préparées) encore moins ;
 *  - PaddleOCR PP-OCRv4 51, **PP-OCRv5 anglais 58** (Lorcana 7/7, Riftbound 20/22, One Piece 10/12, Pokémon 13/31,
 *    Yu-Gi-Oh! 8/33), ~0,4 s par carte au lieu de ~6 s ; les deux modèles ensemble : à peine mieux (60), deux fois plus lent ;
 *  - bandes resserrées sur les colonnes qui ont de l'encre (devant un grand fond uni le modèle invente « cYanmaGYlow ») : lecture complète inchangée, choix d'impression Yu-Gi-Oh! 24 → 25 ;
  - lecture rapprochée de la liste des codes existants puis départagée par la probabilité de chaque code (`snap`) : 68,
 *    aucune « sûre » fausse ; série connue (`best` sur tous les numéros de la série) : Pokémon 21/31, One Piece 12/12 ;
 *  - Yu-Gi-Oh!, choix de l'impression d'une carte reconnue (26 cartes à plusieurs codes) : `best` 25 bonnes / 20 sûres
 *    contre 20 / 12 pour le code dessiné + Tesseract.
 * `best` ne lit pas le code puis ne le compare pas : il demande au modèle la probabilité que la ligne contienne exactement
 * « TDGS-FR033 », « TDGS-FR016 »… (CTC) ; l'écart entre le bon code et les autres est très net (−0,9 contre −15).
 */
(() => {
  const P = App.recognizerParts;
  let w = null, seq = 0, broken = false, readyAt = 0;
  const pending = new Map();
  function worker() {
    if (w) return w;
    w = new Worker('js/ocr-worker.js?v=' + encodeURIComponent(window.APP_VERSION || '1'));
    w.onmessage = (e) => { const p = pending.get(e.data.rid); if (!p) return; pending.delete(e.data.rid); if (e.data.ok) p.res(e.data.res); else p.rej(new Error(e.data.error)); };
    w.onerror = (e) => { broken = true; for (const p of pending.values()) p.rej(new Error('lecteur de codes indisponible')); pending.clear(); console.warn('lecteur de codes', e.message || e); };
    return w;
  }
  const call = (msg, transfer = []) => new Promise((res, rej) => { const rid = ++seq; pending.set(rid, { res, rej }); worker().postMessage({ ...msg, rid }, transfer); });
  // (App.settings.codeOcr = false : ancien déroulé, Tesseract seul — pour comparer)
  const supported = () => !broken && App.settings.codeOcr !== false && typeof Worker !== 'undefined' && typeof WebAssembly === 'object' && !!(window.crypto && crypto.subtle);
  let warmP = null;
  /** prépare le lecteur (téléchargement ~8 Mo la 1re fois, gardé ensuite par le service worker) */
  function warm() {
    if (!supported()) return Promise.resolve(false);
    return warmP || (warmP = call({ op: 'warm' }).then(() => { readyAt = Date.now(); return true; }, (e) => { console.warn('lecteur de codes', e); broken = true; return false; }));
  }
  /** prêt dans ms millisecondes au plus ? (1er scan : on ne fait pas attendre la carte sur le téléchargement) */
  const ready = (ms = 8000) => (readyAt ? Promise.resolve(true) : Promise.race([warm(), new Promise((r) => setTimeout(() => r(false), ms))]));

  // ---------- bandes → tenseurs (comme PaddleOCR : hauteur 48, BGR, (x / 255 − 0,5) / 0,5) ----------
  const H = 48;
  let trimOn = true; // (labo : P.codeOcr.trim(false) pour comparer)
  function tensorOf(src, W0, H0, [y0, y1, x0, x1]) {
    const sx = W0 * x0, sy = H0 * y0, sw = W0 * (x1 - x0), sh = H0 * (y1 - y0);
    // (agrandie d'abord à 96 de haut, puis 48 : comme au labo)
    const c1 = document.createElement('canvas'); c1.height = 96; c1.width = Math.max(8, Math.min(3200, Math.round(sw * 96 / sh)));
    const g1 = c1.getContext('2d', { willReadFrequently: true }); g1.imageSmoothingQuality = 'high'; g1.drawImage(src, sx, sy, sw, sh, 0, 0, c1.width, c1.height);
    // bande resserrée sur les colonnes qui ont de l'encre (+ une demi-hauteur de marge) : devant un grand fond uni, le modèle
    // invente du texte (« cYanmaGYlow » au lieu de « 113/167 »)
    let a = 0, b = c1.width;
    if (trimOn) {
      const d = g1.getImageData(0, 0, c1.width, 96).data, W1 = c1.width, col = new Float32Array(W1);
      for (let y = 8; y < 88; y++) for (let x = 1; x < W1; x++) { const i = (y * W1 + x) * 4, j = i - 4, v = Math.abs(d[i] + d[i + 1] + d[i + 2] - d[j] - d[j + 1] - d[j + 2]); if (v > 60) col[x] += v; }
      const mx = Math.max(...col), on = (x) => col[x] > mx * 0.08;
      while (a < W1 && !on(a)) a++;
      while (b > a && !on(b - 1)) b--;
      if (b - a < 8) { a = 0; b = W1; } else { a = Math.max(0, a - 48); b = Math.min(W1, b + 48); }
    }
    const w2 = Math.max(16, Math.min(1600, Math.round((b - a) * H / c1.height)));
    const c = document.createElement('canvas'); c.width = w2; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true }); g.imageSmoothingQuality = 'high'; g.drawImage(c1, a, 0, b - a, 96, 0, 0, w2, H);
    const px = g.getImageData(0, 0, w2, H).data, n = w2 * H, data = new Float32Array(3 * n);
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) data[k * n + i] = (px[i * 4 + (2 - k)] / 255 - 0.5) / 0.5;
    return { w: w2, h: H, data };
  }
  const bitmap = async (img) => (img instanceof Blob ? createImageBitmap(img) : img);
  /**
   * Lit des bandes de la carte ([haut, bas, gauche, droite] en fractions) → { texts, ref } (ref : pour noter des codes
   * ensuite avec score / best, parmi les 8 dernières lectures). Null si le lecteur n'est pas prêt.
   */
  async function read(img, bands, { wait = 8000, zones = [] } = {}) {
    clearTimeout(stopTimer);
    if (!supported() || !(await ready(wait))) return null;
    const b = await bitmap(img), W0 = b.width || b.naturalWidth, H0 = b.height || b.naturalHeight;
    const lines = bands.map((z) => tensorOf(b, W0, H0, z));
    // zones où le détecteur cherche les lignes de texte : agrandies à 240 pixels de haut (comme au labo)
    const zs = await Promise.all(zones.map(([y0, y1, x0, x1]) => { const sh = H0 * (y1 - y0), k = 240 / sh; return createImageBitmap(b, W0 * x0, H0 * y0, W0 * (x1 - x0), sh, { resizeWidth: Math.max(8, Math.round(W0 * (x1 - x0) * k)), resizeHeight: 240, resizeQuality: 'high' }); }));
    if (img instanceof Blob && b.close) b.close();
    try {
      const rid0 = seq + 1, res = await call({ op: 'read', lines, zones: zs }, [...lines.map((l) => l.data.buffer), ...zs]);
      return { texts: res.map((r) => r.text), confs: res.map((r) => r.conf), ref: rid0 };
    } catch (e) { console.warn('lecteur de codes', e); return null; }
  }
  /** vraisemblance de chaînes dans des lignes déjà lues : asks = [[ligne, chaîne]…] → notes */
  const score = (ref, asks) => (asks.length ? call({ op: 'score', ref, asks }).catch(() => asks.map(() => -1e9)) : Promise.resolve([]));
  /**
   * Codes possibles (Map clé → formes imprimées) notés sur toutes les lignes lues → [[clé, note]] du meilleur au moins bon.
   * À égalité, la forme la plus longue l'emporte (lb par caractère : « 113/167 » plutôt que « 13/167 » d'une ligne coupée).
   */
  async function best(rd, cands, { lb = 0.15 } = {}) {
    if (!rd) return [];
    const asks = [], who = [];
    for (const [k, forms] of cands) for (const f of forms) for (let i = 0; i < rd.texts.length; i++) { asks.push([i, f]); who.push([k, f.length]); }
    const s = await score(rd.ref, asks), sc = new Map();
    s.forEach((v, j) => { const [k, len] = who[j], x = v + lb * len; if (!sc.has(k) || x > sc.get(k)) sc.set(k, x); });
    return [...sc].sort((a, b) => b[1] - a[1]);
  }
  // lettres que le modèle confond (O/0, I/1, S/5…) : presque gratuites pour trouver les codes proches d'une lecture
  const LOOK = new Set(['O0', 'D0', 'Q0', 'OD', 'OQ', 'DQ', 'I1', 'L1', 'J1', '|1', 'IL', 'T1', 'S5', 'B8', 'Z2', 'G6', 'T7', '/7', 'EF', 'FP', 'PR', 'CG', 'C0', 'CO', 'RK', 'RP', 'HN', 'MN', 'UV', '38', '56', '68', '69', '89', 'A4', 'E3', 'B3', 'GO', 'G0', 'DB', 'DO', 'CE', 'S8', 'S3', '74', '17', 'R8', 'FE'].flatMap((p) => [p, p[1] + p[0]]));
  /** coût de w posé n'importe où dans t */
  function align(w, t) {
    let prev = new Float32Array(t.length + 1), cur = new Float32Array(t.length + 1);
    for (let i = 1; i <= w.length; i++) {
      cur[0] = i * 0.7;
      for (let j = 1; j <= t.length; j++) cur[j] = Math.min(prev[j - 1] + (w[i - 1] === t[j - 1] ? 0 : LOOK.has(w[i - 1] + t[j - 1]) ? 0.35 : 1), prev[j] + 0.7, cur[j - 1] + 0.7);
      [prev, cur] = [cur, prev];
    }
    let m = Infinity; for (const v of prev) if (v < m) m = v;
    return m;
  }
  /**
   * Carte inconnue : chaque ligne lue rapprochée de la liste de tous les codes (lexique [[clé, forme]…]), les 25 plus proches
   * notés par le modèle → [[clé, note]]. Labo : Yu-Gi-Oh! 16/33 (lecture seule 8, Tesseract 0), aucune « sûre » fausse.
   */
  async function snap(rd, lexicon, { top = 25, lb = 0.15 } = {}) {
    // (lexique trop grand, Yu-Gi-Oh! : fonction texte → formes à essayer, présélectionnées par l'adaptateur)
    const pick = typeof lexicon === 'function' ? lexicon : () => lexicon;
    if (!rd) return [];
    const cands = new Map();
    rd.texts.forEach((t0) => {
      const t = String(t0).toUpperCase().replace(/\s+/g, ''); if (t.length < 3) return;
      const near = [];
      for (const [k, f] of pick(t)) { if (Math.abs(f.length - t.length) > Math.max(6, t.length)) continue; const a = align(f, t) / f.length; if (a <= 0.45) near.push([k, f, a]); }
      near.sort((p, q) => p[2] - q[2]);
      for (const [k, f] of near.slice(0, top)) { if (!cands.has(k)) cands.set(k, new Set()); cands.get(k).add(f); }
    });
    return best(rd, new Map([...cands].map(([k, s]) => [k, [...s]])), { lb });
  }
  /**
   * décision : meilleure clé « sûre » si elle a assez d'avance (gap) et, pour une carte inconnue (snap), une note d'au moins min
   * (labo : sans elle, 2 codes Yu-Gi-Oh! « sûrs » faux, notes −7 et −19 ; les bons sont au-dessus de −3,5) → { key, score, gap, sure } ou null
   */
  function decide(ranked, { gap = 3, min = -Infinity } = {}) {
    if (!ranked.length) return null;
    const g = ranked[0][1] - (ranked[1] ? ranked[1][1] : -1e9);
    return { key: ranked[0][0], score: ranked[0][1], gap: g, sure: g >= gap && ranked[0][1] >= min };
  }

  /** libère le lecteur (mémoire du téléphone) : appelé avec l'arrêt des lecteurs Tesseract (90 s après avoir quitté Capturer) */
  function stop() { if (w) { w.terminate(); w = null; } warmP = null; readyAt = 0; for (const p of pending.values()) p.rej(new Error('arrêté')); pending.clear(); }
  const stopTess = P.stop, laterTess = P.stopLater, warmTess = P.warm;
  let stopTimer = null;
  P.stop = () => { stopTess(); clearTimeout(stopTimer); stop(); };
  P.stopLater = (ms = 90000) => { laterTess(ms); clearTimeout(stopTimer); stopTimer = setTimeout(stop, ms); };
  // (préparé avec les lecteurs Tesseract à l'ouverture de Capturer ; s'en resservir annule l'arrêt prévu)
  P.warm = () => { clearTimeout(stopTimer); warm(); return warmTess(); };

  P.codeOcr = { supported, warm, ready, read, score, best, snap, decide, align, stop, trim: (v) => { trimOn = v; } };
})();
