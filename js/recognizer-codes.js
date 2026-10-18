/*
 * Code imprimé « dessiné » (v3.30, Yu-Gi-Oh!) : la carte est déjà reconnue, il reste à choisir entre ses impressions
 * (« SDK-C032 », « SDY-C027 », « SDJ-029 »…). Le code est souvent trop petit et trop flou pour Tesseract (page de classeur :
 * lettres de 6 à 10 pixels) ; au lieu de le lire, chaque code possible est dessiné dans une police à empattements et superposé
 * à la bande du code (corrélation normalisée) : le plus ressemblant l'emporte.
 * - Filtre passe-haut horizontal sur la photo et sur le dessin : les traits horizontaux (cadre de l'illustration, bord de la
 *   boîte de texte) disparaissent, les lettres restent ; sans lui, le dessin se calait sur le trait sous le code.
 * - λ dans la corrélation : une zone unie ne ressemble à rien (sinon un léger grain y collait mieux que le vrai code).
 * - Taille et position cherchées une fois avec quelques codes, puis chaque code essayé autour, aligné à droite (le code
 *   est aligné à droite sous l'illustration) et sur la même largeur que le plus long : un code court ne gagne pas en se
 *   calant sur la fin d'un plus long.
 * Banc (_tests-scanner/yg-code-tm.js, 26 cartes à plusieurs impressions des photos d'Arnaud, 18 oct.) : 20 bonnes avec Noto Serif
 * (la police des téléphones Android), contre 14 par la lecture seule.
 */
(() => {
  const CW = 600; // carte ramenée à 600 px de large
  const HPR = 5, LAM = 100;
  /** passe-haut horizontal : valeur − moyenne sur ±r pixels de la même ligne */
  function hpx(a, w, h, r = HPR) {
    const o = new Float32Array(w * h), pre = new Float32Array(w + 1);
    for (let y = 0; y < h; y++) {
      const row = y * w; let s = 0;
      for (let x = 0; x < w; x++) { s += a[row + x]; pre[x + 1] = s; }
      for (let x = 0; x < w; x++) { const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1); o[row + x] = a[row + x] - (pre[x1] - pre[x0]) / (x1 - x0); }
    }
    return o;
  }
  /** bande du code (fractions de la carte) en « encre » filtrée */
  async function strip(blob, { y0, y1, x0, x1 }) {
    const b = await createImageBitmap(blob), k = CW / b.width, H = Math.round(b.height * k);
    const sx = b.width * x0, sy = b.height * y0, sw = b.width * (x1 - x0), sh = b.height * (y1 - y0);
    const w = Math.max(1, Math.round(sw * k)), h = Math.max(1, Math.round(sh * k)), c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(b, sx, sy, sw, sh, 0, 0, w, h);
    b.close && b.close();
    const d = g.getImageData(0, 0, w, h).data, ink = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) ink[i] = 255 - (0.3 * d[i * 4] + 0.59 * d[i * 4 + 1] + 0.11 * d[i * 4 + 2]);
    return { ink: hpx(ink, w, h), w, h, H };
  }
  // police : celle du téléphone (Noto Serif sur Android), Georgia (iPhone, PC), sinon la police à empattements par défaut
  let fontName = null;
  function font() {
    if (fontName) return fontName;
    const m = document.createElement('canvas').getContext('2d'), w = (f) => { m.font = `40px ${f}`; return m.measureText('RGBT-FR007 SDK-C032').width; };
    const base = w('monospace');
    fontName = ['"Noto Serif"', 'Georgia'].find((f) => w(`${f}, monospace`) !== base) || 'serif';
    return fontName;
  }
  const tcache = new Map();
  /** texte dessiné (encre filtrée, centrée) ; cap = hauteur des majuscules en px, sx = étirement horizontal */
  function render(text, cap, sx) {
    const key = `${text}|${cap}|${sx}`; if (tcache.has(key)) return tcache.get(key);
    if (tcache.size > 4000) tcache.clear();
    const m = document.createElement('canvas').getContext('2d'); m.font = `100px ${font()}`;
    const size = cap / (m.measureText('H').actualBoundingBoxAscent / 100); m.font = `${size}px ${font()}`;
    const tw = Math.ceil(m.measureText(text).width * sx) + 4, th = Math.ceil(cap * 1.5) + 4;
    const c = document.createElement('canvas'); c.width = tw; c.height = th;
    const g = c.getContext('2d', { willReadFrequently: true }); g.fillStyle = '#fff'; g.fillRect(0, 0, tw, th);
    g.filter = 'blur(0.8px)'; g.fillStyle = '#000'; g.font = `${size}px ${font()}`; g.textBaseline = 'alphabetic';
    g.setTransform(sx, 0, 0, 1, 2, 0); g.fillText(text, 0, 2 + cap + 0.5);
    const d = g.getImageData(0, 0, tw, th).data, t0 = new Float32Array(tw * th);
    for (let i = 0; i < tw * th; i++) t0[i] = (255 - d[i * 4]) / 255;
    const r = center(hpx(t0, tw, th), tw, th); tcache.set(key, r); return r;
  }
  function center(t, w, h) {
    let s = 0; for (const v of t) s += v; const m = s / t.length; let v2 = 0;
    for (let i = 0; i < t.length; i++) { t[i] -= m; v2 += t[i] * t[i]; }
    return { t, w, h, norm: Math.sqrt(v2) || 1 };
  }
  function padLeft(T, W) {
    if (T.w >= W) return T;
    const t = new Float32Array(W * T.h), off = W - T.w;
    for (let j = 0; j < T.h; j++) for (let i = 0; i < T.w; i++) t[j * W + off + i] = T.t[j * T.w + i];
    return center(t, W, T.h);
  }
  /** corrélation (avec λ) du modèle T posé en (x, y) */
  function ncc(S, T, x, y) {
    let si = 0, sii = 0, st = 0; const n = T.w * T.h;
    for (let j = 0; j < T.h; j++) {
      const ro = (y + j) * S.w + x, to = j * T.w;
      for (let i = 0; i < T.w; i++) { const v = S.ink[ro + i]; si += v; sii += v * v; st += v * T.t[to + i]; }
    }
    return st / (Math.sqrt(Math.max(0, sii - si * si / n) + n * LAM) * T.norm);
  }
  function bestAt(S, T, xs, ys) {
    let b = { s: -2, x: 0, y: 0 };
    for (const y of ys) { if (y < 0 || y > S.h - T.h) continue; for (const x of xs) { if (x < 0 || x > S.w - T.w) continue; const s = ncc(S, T, x, y); if (s > b.s) b = { s, x, y }; } }
    return b;
  }
  const range = (a, b, step = 1) => { const o = []; for (let v = a; v <= b; v += step) o.push(v); return o; };
  /**
   * Notes des codes possibles sur une carte recadrée.
   * @param blob carte entière, droite
   * @param keyForms [[clé, [formes imprimées…]]…] (ex. ['SDK-E032', ['SDK-F032', 'SDK-C032', …]])
   * @param zone { y0, y1, x0, x1, right: [r0, r1] } fractions de la carte (bande du code ; bord droit du code entre r0 et r1)
   * @returns { per: Map(clé → note), ranked: [[clé, note]…], gap } ou null
   */
  async function codeMatch(blob, keyForms, zone) {
    if (!blob || keyForms.length < 2) return null;
    const S = await strip(blob, zone);
    const R0 = Math.round((zone.right[0] - zone.x0) * CW), R1 = Math.min(S.w, Math.round((zone.right[1] - zone.x0) * CW));
    const all = keyForms.flatMap(([k, fs]) => fs.map((f) => [k, f]));
    // 1) taille et position : la 1re forme d'une douzaine de codes, chaque taille, par pas de 3 pixels
    let place = { s: -2 };
    const probe = keyForms.slice(0, 12).map(([, fs]) => fs[0]);
    for (const cap of [9, 10, 11, 12, 13, 14]) for (const sx of [0.9, 1, 1.1, 1.2, 1.3]) for (const f of probe) {
      const T = render(f, cap, sx); if (T.w > S.w || T.h > S.h) continue;
      const b = bestAt(S, T, range(R0, R1, 3).map((r) => r - T.w), range(0, S.h - T.h, 3));
      if (b.s > place.s) place = { ...b, cap, sx, right: b.x + T.w };
    }
    if (place.s < 0) return null;
    // 2) chaque forme, tailles voisines, même bord droit, même largeur pour toutes
    const per = new Map();
    for (const cap of [place.cap - 0.75, place.cap, place.cap + 0.75]) for (const sx of [place.sx - 0.05, place.sx, place.sx + 0.05]) {
      const Ts = all.map(([k, f]) => [k, render(f, cap, sx)]), W = Math.min(S.w, Math.max(...Ts.map(([, T]) => T.w)) + 2);
      for (const [k, T0] of Ts) {
        const T = padLeft(T0, W), b = bestAt(S, T, range(place.right - W - 3, place.right - W + 3), range(place.y - 2, place.y + 2));
        if (b.s > (per.get(k) ?? -2)) per.set(k, b.s);
      }
    }
    const ranked = [...per].sort((a, b) => b[1] - a[1]);
    return { per, ranked, gap: ranked.length > 1 ? ranked[0][1] - ranked[1][1] : 1, place };
  }
  App.recognizerParts = Object.assign(App.recognizerParts || {}, { codeMatch });
})();
