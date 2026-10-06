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
  /** (outil de préparation de l'index) empreintes du réseau pour des visuels / une photo */
  const embed = (urls) => ask('embed', { urls }).then((r) => r.vecs);
  const embedBlob = (blob) => ask('embedBlob', { blob });
  const forget = (qid) => { if (w) w.postMessage({ op: 'forget', qid }); };
  function stop() {
    if (w) { w.terminate(); w = null; }
    for (const p of pend.values()) p.reject(new Error('arrêté'));
    pend.clear();
  }
  return { SURE, supported, rank, warm, global, embed, embedBlob, forget, stop };
})();
