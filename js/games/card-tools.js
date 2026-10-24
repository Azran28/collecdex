/*
 * Outils de lecture communs aux licences autres que Pokémon (v3.49, Arnaud : « tout ce qui marche bien pour Final Fantasy et
 * Wankul, aussi pour les autres licences »). Écrits d'abord pour Final Fantasy (v3.44, v3.46), repris par Wankul (v3.48), puis
 * mis en commun ici pour One Piece, Riftbound, Lorcana et Yu-Gi-Oh!. Utilisés seulement pendant une lecture (App.recognizer,
 * App.visual et le lecteur de codes sont alors chargés).
 *   App.cardTools.cropQuad(img, quad)   carte remise à plat d'après ses coins (fractions de l'image) ; coins un peu hors de l'image ramenés au bord
 *   App.cardTools.cardShaped(quad, img) les coins ont-ils la forme d'une carte, perspective retirée (88/63 ± 0,1) ?
 *   App.cardTools.findCrop(src)         meilleur cadre en forme de carte dans la photo (détourage raté), remis à plat ; null sinon
 *   App.cardTools.readBands(img, bands, zones)  bandes lues par PaddleOCR → textes ([] si le lecteur n'est pas là)
 *   App.cardTools.bestName(texts, names, { min, contains, pairs })  nom connu le plus proche des lignes lues → { k, s }
 *   App.cardTools.codeFix(nameIds, nums, fromIds, numOf)  code et nom en désaccord : la carte de ce nom au même numéro
 *   App.cardTools.foilMeasure(img, visuel, zones)  paillettes de la photo comparées au visuel officiel (brillant)
 */
App.cardTools = (() => {
  const RATIO = 88 / 63;
  async function cropQuad(img, quad) {
    if (!quad || quad.some(([x, y]) => x < -0.06 || x > 1.06 || y < -0.06 || y > 1.06)) return null;
    return App.visual.quadCrop(img, quad.map(([x, y]) => [Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y))]));
  }
  const sizeOf = async (im) => {
    if (im && im.width && !(im instanceof Blob)) return [im.width, im.height];
    try { const b = await createImageBitmap(im); const s = [b.width, b.height]; if (b.close) b.close(); return s; } catch (e) { return null; }
  };
  /**
   * v3.44 (Final Fantasy, Arnaud : Chocobo brillant coupé, Valseur 2 rétrécie) : sur une carte brillante ou sombre, les coins
   * trouvés par l'illustration déraillent parfois (vraies proportions 1,58 au lieu de 1,40 ; cartes justes : 1,35–1,47).
   * Coins qui n'ont pas la forme d'une carte → refusés (la photo garde son détourage). Rien à mesurer → accepté.
   */
  async function cardShaped(quad, im, tol = 0.1) {
    const R = App.recognizer, wh = quad && R && R.trueRatio ? await sizeOf(im) : null;
    if (!wh) return !!quad;
    const r = R.trueRatio(quad.map(([x, y]) => [x * wh[0], y * wh[1]]), wh[0], wh[1]);
    return !(r > 0) || Math.abs(r - RATIO) <= tol;
  }
  /**
   * v3.46 (Final Fantasy, Vayne tenue en main, carte sombre) : le détourage n'a pas trouvé la carte → lecture faite sur toute la
   * photo, où le bas n'est pas celui de la carte. Ici : meilleur cadre en forme de carte (`findCard`), perspective retirée
   * 88/63 ± 0,1, entre 12 % et 97 % de la photo, remis à plat (≤ 1000 px).
   */
  async function findCrop(src) {
    try {
      const R = App.recognizer, bmp = await createImageBitmap(src), k = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      // v3.50 (Vayne tenue en main) : 1ᵉʳ cadre = un morceau de l'illustration (11 % de la photo), la carte entière 2ᵉ → le 1ᵉʳ des 8 meilleurs qui convient
      const r = R.findCard(c, { top: 8 }); if (!r || !r.quad) return null;
      const ok = (quad) => {
        const px = quad.map(([x, y]) => [x * c.width, y * c.height]);
        const area = Math.abs(px.reduce((s, p, i) => { const q = px[(i + 1) % 4]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2 / (c.width * c.height);
        return area >= 0.12 && area <= 0.97 && Math.abs(R.trueRatio(px, c.width, c.height) - RATIO) <= 0.1 ? px : null;
      };
      let px = null;
      for (const q of [r.quad, ...(r.cands || []).map((x) => x.quad || x)]) if (q && (px = ok(q))) break;
      if (!px) return null;
      const w = Math.min(1000, Math.round(Math.hypot(px[1][0] - px[0][0], px[1][1] - px[0][1])));
      return await new Promise((res) => R.warpQuad(c, px, w).toBlob(res, 'image/jpeg', 0.92));
    } catch (e) { return null; }
  }
  async function readBands(img, bands, zones = []) {
    const O = App.recognizerParts && App.recognizerParts.codeOcr;
    const rd = O ? await O.read(img, bands, { zones }).catch(() => null) : null;
    return rd ? rd.texts : [];
  }
  /** Nom connu le plus proche : chaque ligne lue (et, si `pairs`, chaque paire de lignes voisines) contre tous les noms */
  function bestName(texts, nm, { contains = 6, pairs = false } = {}) {
    const norm = App.util.norm, lines = texts.join('\n').split('\n').map((l) => norm(l)).filter((l) => l.length >= 3);
    const tries = pairs ? [...lines, ...lines.slice(1).map((l, i) => `${lines[i]} ${l}`)] : lines;
    let best = { k: '', s: 0 };
    const keys = [...nm.keys()];
    for (const l of tries) for (const k of keys) {
      if (Math.abs(k.length - l.length) > Math.max(3, k.length * 0.4)) continue;
      const s = l === k ? 1 : l.includes(k) && k.length >= contains ? 0.9 : App.util.similarity(l, k);
      if (s > best.s) best = { k, s };
    }
    return best;
  }
  /** Une des lignes lues est-elle un nom connu (tel quel) ? */
  const nameIn = (texts, nm) => texts.some((t) => String(t || '').split('\n').some((l) => nm.has(App.util.norm(l))));
  /**
   * v3.46 (Final Fantasy, « 8-022 » lu, nom « Vayne » : le 9 pris pour un 8) : le code et le nom ne désignent pas la même carte →
   * les cartes de ce nom au même numéro (`numOf(carte)` dans `nums`) passent devant, marquées `codeFix`. Renvoie la liste, ou null.
   */
  async function codeFix(nameIds, nums, fromIds, numOf) {
    if (!nameIds.length || !nums.size) return null;
    const fix = (await fromIds(nameIds)).filter((c) => nums.has(numOf(c)));
    for (const c of fix) c.codeFix = true;
    return fix.length ? fix : null;
  }
  /**
   * Brillant vu sur la photo (v3.44, Final Fantasy) : paillettes comparées au visuel officiel (non brillant) mis à la même taille.
   * zones = [[x0, x1, y0, y1]…] (la 1ʳᵉ = l'illustration) ; « chroma » = écart de couleur d'un pixel à ses voisins (5 × 5), « lap » =
   * petits points clairs (laplacien) de l'illustration, rapportés au visuel → { chroma, lap, score = max(chroma) + lap, w } ou null.
   * Chaque licence choisit ses seuils (Final Fantasy : voir finalfantasy.js › foil).
   */
  function foilFeat(src, W, H, zones) {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(src, 0, 0, W, H);
    const d = g.getImageData(0, 0, W, H).data, N = W * H, c0 = new Float32Array(N), c1 = new Float32Array(N), L = new Float32Array(N);
    for (let i = 0; i < N; i++) { const r = d[i * 4], gg = d[i * 4 + 1], b = d[i * 4 + 2]; c0[i] = r - gg; c1[i] = (r + gg) / 2 - b; L[i] = (r + gg + b) / 3; }
    return zones.map(([x0, x1, y0, y1]) => {
      let n = 0, ch = 0, lp = 0;
      for (let y = Math.round(y0 * H) + 2; y < y1 * H - 2; y++) for (let x = Math.round(x0 * W) + 2; x < x1 * W - 2; x++) {
        const i = y * W + x;
        lp += Math.abs(4 * L[i] - L[i - 1] - L[i + 1] - L[i - W] - L[i + W]); n++;
        if (L[i] < 40) continue;
        let m0 = 0, m1 = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const j = i + dy * W + dx; m0 += c0[j]; m1 += c1[j]; }
        ch += Math.hypot(c0[i] - m0 / 25, c1[i] - m1 / 25);
      }
      return n ? [ch / n, lp / n] : [0, 0];
    });
  }
  async function foilMeasure(blob, officialUrl, zones) {
    try {
      const p = await createImageBitmap(blob), W = Math.min(900, p.width), H = Math.round(W * RATIO);
      const r = await fetch(officialUrl); if (!r.ok) return null;
      const o = await createImageBitmap(await r.blob());
      const P = foilFeat(p, W, H, zones), O = foilFeat(o, W, H, zones);
      const chroma = Math.max(...P.map((z, k) => z[0] / Math.max(0.3, O[k][0]))), lap = P[0][1] / Math.max(1, O[0][1]);
      const r2 = (v) => Math.round(v * 100) / 100;
      return { chroma: r2(chroma), lap: r2(lap), score: r2(chroma + lap), w: W };
    } catch (e) { return null; }
  }
  return { RATIO, cropQuad, sizeOf, cardShaped, findCrop, readBands, bestName, nameIn, codeFix, foilMeasure };
})();
