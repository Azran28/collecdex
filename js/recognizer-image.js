/* Reconnaissance — partie 3/5 : empreintes d'image (illustration, carte entière), dos de carte, pochette vide. Voir recognizer-text.js. */
(() => {
  const { ad, fetchImage } = App.recognizerParts;

  /** Petite empreinte en niveaux de gris (24×33) pour comparer deux images de carte */
  async function thumb(blob) {
    const bmp = await createImageBitmap(blob);
    const W = 24, H = 33, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true }); g.filter = 'blur(0.5px)'; g.drawImage(bmp, 0, 0, W, H);
    const p = g.getImageData(0, 0, W, H).data, n = W * H, v = new Float32Array(n * 3);
    // 3 couches de couleur : distingue deux illustrations du même Pokémon (ex. Feunard Set de Base / Expedition)
    for (let i = 0; i < n; i++) { v[i] = p[i * 4]; v[n + i] = p[i * 4 + 1]; v[2 * n + i] = p[i * 4 + 2]; }
    return v;
  }
  /** Corrélation entre deux empreintes (1 = identiques) — insensible à la luminosité */
  function corr(a, b) {
    const n3 = a.length / 3;
    if (Number.isInteger(n3) && n3 > 100) { // moyenne des 3 couches de couleur
      let t = 0;
      for (let k = 0; k < 3; k++) t += corr1(a.subarray(k * n3, (k + 1) * n3), b.subarray(k * n3, (k + 1) * n3));
      return t / 3;
    }
    return corr1(a, b);
  }
  function corr1(a, b) {
    const n = a.length; let ma = 0, mb = 0;
    for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
    ma /= n; mb /= n;
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; num += x * y; da += x * x; db += y * y; }
    return da && db ? num / Math.sqrt(da * db) : 0;
  }

  /**
   * Pochette vide ? Image presque uniforme, ou reflets du plastique sans détails ni couleurs
   * (mesuré : pochettes vides ≤ 8 de « détails », cartes ≥ 8 et bien plus colorées).
   */
  async function looksEmpty(blob) {
    const v = (await thumb(blob)).subarray(0, 24 * 33);
    let m = 0; for (const x of v) m += x; m /= v.length;
    let s = 0; for (const x of v) s += (x - m) ** 2;
    if (Math.sqrt(s / v.length) < 14) return true;
    const bmp = await createImageBitmap(blob);
    const W = 60, H = 84, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bmp, 0, 0, W, H);
    const d = g.getImageData(0, 0, W, H).data, L = new Float32Array(W * H);
    let sat = 0;
    for (let i = 0; i < W * H; i++) { const r = d[i * 4], gg = d[i * 4 + 1], b = d[i * 4 + 2], mx = Math.max(r, gg, b), mn = Math.min(r, gg, b); L[i] = 0.299 * r + 0.587 * gg + 0.114 * b; sat += mx ? (mx - mn) / mx : 0; }
    sat /= W * H;
    let gx = 0, gy = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W - 1; x++) gx += Math.abs(L[y * W + x + 1] - L[y * W + x]);
    for (let y = 0; y < H - 1; y++) for (let x = 0; x < W; x++) gy += Math.abs(L[(y + 1) * W + x] - L[y * W + x]);
    const grad = gx / (H * (W - 1)) + gy / ((H - 1) * W);
    looksEmpty.last = { grad, sat };
    return grad < 8 || (grad < 13 && sat < 0.1);
  }

  /**
   * Empreinte de l'ILLUSTRATION (la partie la plus reconnaissable d'une carte), en niveaux de gris normalisés.
   * Pour la photo, on en calcule plusieurs versions légèrement décalées/zoomées : le cadrage d'une photo
   * n'est jamais parfait (pochette, carte de travers), on garde la version qui ressemble le plus.
   */
  const ART = { x0: 0.09, x1: 0.91, y0: 0.11, y1: 0.50 }, AW = 24, AH = 16;
  function artVec(bmp, dx = 0, dy = 0, sc = 1) {
    const W = bmp.width, H = bmp.height;
    const cx = (ART.x0 + ART.x1) / 2 + dx, cy = (ART.y0 + ART.y1) / 2 + dy, w = (ART.x1 - ART.x0) * sc, h = (ART.y1 - ART.y0) * sc;
    const c = document.createElement('canvas'); c.width = AW; c.height = AH;
    const g = c.getContext('2d', { willReadFrequently: true }); g.filter = 'blur(0.5px)';
    g.drawImage(bmp, W * (cx - w / 2), H * (cy - h / 2), W * w, H * h, 0, 0, AW, AH);
    const p = g.getImageData(0, 0, AW, AH).data, n = AW * AH, v = new Float32Array(n);
    let m = 0; for (let i = 0; i < n; i++) { v[i] = 0.299 * p[i * 4] + 0.587 * p[i * 4 + 1] + 0.114 * p[i * 4 + 2]; m += v[i]; }
    m /= n; let sd = 0; for (let i = 0; i < n; i++) sd += (v[i] - m) ** 2; sd = Math.sqrt(sd / n) || 1;
    for (let i = 0; i < n; i++) v[i] = (v[i] - m) / sd;
    return v;
  }
  async function artVariants(blob) {
    const bmp = await createImageBitmap(blob);
    const out = [];
    for (const sc of [0.9, 1, 1.1]) for (const dx of [-0.06, -0.03, 0, 0.03, 0.06]) for (const dy of [-0.06, -0.03, 0, 0.03, 0.06]) out.push(artVec(bmp, dx, dy, sc));
    return out;
  }
  /** Ressemblance (≈ 0,3 sans rapport … 0,9 identique) : meilleure version de la photo contre le visuel officiel */
  function artMatch(variants, ref) {
    let best = -1;
    for (const v of variants) { let s = 0; for (let i = 0; i < v.length; i++) s += v[i] * ref[i]; s /= v.length; if (s > best) best = s; }
    return best;
  }
  /**
   * Certains visuels « officiels » (surtout les anciennes cartes françaises) sont des photos de la carte
   * posée sur un fond sombre. On repère ce fond (bords uniformes et sombres) et on ne garde que la carte.
   */
  function trimBackground(bmp) {
    const W = 120, H = Math.max(40, Math.round(120 * bmp.height / bmp.width));
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bmp, 0, 0, W, H);
    const p = g.getImageData(0, 0, W, H).data, lum = (x, y) => { const i = (y * W + x) * 4; return 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]; };
    // fond : moyenne des 3 % de bord
    let sum = 0, n = 0; const m = Math.max(2, Math.round(W * 0.03));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x < m || x >= W - m || y < m || y >= H - m) { sum += lum(x, y); n++; }
    const bg = sum / n;
    if (bg > 70) return bmp; // pas de fond sombre : visuel bord à bord
    const th = bg + 45;
    const rowIn = (y) => { let k = 0; for (let x = 0; x < W; x++) if (lum(x, y) > th) k++; return k > W * 0.25; };
    const colIn = (x) => { let k = 0; for (let y = 0; y < H; y++) if (lum(x, y) > th) k++; return k > H * 0.25; };
    let y0 = 0, y1 = H - 1, x0 = 0, x1 = W - 1;
    while (y0 < H - 1 && !rowIn(y0)) y0++;
    while (y1 > y0 && !rowIn(y1)) y1--;
    while (x0 < W - 1 && !colIn(x0)) x0++;
    while (x1 > x0 && !colIn(x1)) x1--;
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    if (w < W * 0.3 || h < H * 0.3 || (w > W * 0.95 && h > H * 0.95)) return bmp;
    const k = bmp.width / W;
    const out = document.createElement('canvas'); out.width = Math.round(w * k); out.height = Math.round(h * k);
    out.getContext('2d').drawImage(bmp, x0 * k, y0 * k, w * k, h * k, 0, 0, out.width, out.height);
    return out;
  }

  /** Ressemblance ramenée entre 0 et 1 pour l'affichage et le score */
  const vis01 = (x) => (x == null ? 0 : Math.max(0, Math.min(1, (x - 0.3) / 0.55)));

  const officialThumbs = new Map();
  /** Empreinte du visuel officiel ; si l'image française manque, on prend l'anglaise */
  async function officialThumb(src, retry = false, guess = false) {
    if (retry) officialThumbs.delete(src);
    if (!officialThumbs.has(src)) {
      const tryUrl = (u) => fetchImage(u, retry, guess);
      officialThumbs.set(src, (async () => {
        // empreinte gardée sur l'appareil (1,5 Ko) : plus besoin de retélécharger le visuel aux scans suivants
        const key = 'art1:' + src;
        const hit = await App.db.get('cache', key).catch(() => null);
        if (hit && hit.v && hit.v.length === AW * AH) return hit.v;
        if (hit && hit.miss && Date.now() - hit.t < 2 * 864e5) return null; // adresse devinée déjà essayée : pas de visuel
        let b = await tryUrl(src);
        if (!b && !guess && /assets\.tcgdex\.net\/(?!en\/)[a-z-]+\//.test(src)) b = await tryUrl(src.replace(/assets\.tcgdex\.net\/[a-z-]+\//, 'assets.tcgdex.net/en/'));
        const v = b ? await createImageBitmap(b).then((bmp) => artVec(trimBackground(bmp))).catch(() => null) : null;
        if (v) App.db.set('cache', key, { t: Date.now(), v }).catch(() => {});
        else if (guess) App.db.set('cache', key, { t: Date.now(), miss: true }).catch(() => {});
        else setTimeout(() => officialThumbs.delete(src), 30000); // image pas reçue (panne ?) : on réessaiera plus tard
        return v;
      })());
    }
    return officialThumbs.get(src);
  }

  /**
   * Dos de carte Pokémon ? On compare la photo à un vrai dos (moyenne de dos photographiés en pochette),
   * en petit et en couleurs, avec un peu de décalage et de zoom permis (carte mal centrée dans sa pochette).
   * Mesuré : dos 0,86 à 0,93 ; recto, pochette vide ou autre jeu ≤ 0,49.
   */
  const BACK = { w: 24, h: 33, b64: 'aHiIYnKHaHeKdX+Odn6MfYOPg4qUi4+YlJadmJqfm52gmZuelJaalpicn6CioaKin6CioKKjoaKkn5+ioKGjnJ2hgoiTg4aLZnKBZnKBcXqEfoKIgYOIhYiPh4yUjJCXkZKWkpOVlJaXlJSWlZOSmZiVm5uZm5mXl5aYlZebmJqdm5yen6ChnJ2gg4iSgoWJaXF8eHp9lop4qpN1qJJ3lo2Ei4iLjomJnpCAo5N/n5OBmZGFm5GEnJKFoZODrJd9oZWElJGMlJCMkI2JlpGLkpKUf4OKgIKFa3J8gn96qZJwuZltspVxoI57k4uCmot9sZd0uZtxrJZ4qZV6pZR8qJV7sph3wp9vtJp1oZJ8opB7oI11pY9ykouBf359fX6BZW96b3Z9kIR2rZVvqpFypZF3p5N4rpV0tZdxtplxrZZ2r5d3r5h3rJZ5rpV4tplws5hxrpR0rpNxtJRqrJFsnI57gH17fn+BYm16aHF+f319oo90oI10oo52rpR0r5Z1ppF4oZB9nZCBnI+Alo2Ek4yIkomDlYl8m4p4pI50q5BvsJBpooxwnI98e3t+fH6BYGt4aXOBen6FkId8lId6kIiBl46GmZKKmZSQnJqYm5qbkZGUjIyUjZCXiIqRgIGIe3qAfnt8g3t4jX5yiX52i4R7cnV+d3p/X2p3Z3F+dXyJe32Eg4KIj5CWoKCiq6uorq6rr66uqKeqmpuhkpOajJCZgIaTcnuIa3OCaHB9Z255aWx3am14bXB6ZGx7cHN6Xmp4Y257b3mJdn+NgIeUmZuhsrGuvbuzvrmyubOts6ilrJ+cqJmYoZWXj4yTen+NanWJYnKGYG6CXGl9WGR2VmJ0U2B0Y2pyXWl4ZG99bXiJeIKQipCYqaqov7uywrqwva6ks5ePqoV/qn12sn12u4R9tYqHn42ShIeUbn2TYnSOWm2HU2V8T2B2Tl1zXmZvYG17bXeEcn2LgYmToKKiurivxLyvwaugtY2EpHhwnnRso3For3BmwXdryYB1voWApIuOhomXbXySXG+KU2aATmB5Tl51XWZwanWDe4OOgoqTlJicsbCqwb2wxLKkvJaKqIB1ln90moV5ooB1q3VquHRoxHdrxXpwt4N+n4yQgoeUZnWLVGeATmJ7TV11XWZwc3uHi4+VlJico6WkubatwbmqvKaYrY6CmYl/jo6GjImAlIR5qYl8tIV3uX5xvHlutX92q4qFkouPdnyJXGl9T2B3TF1zXmdwcnmFj5OWnZ6gqqmmurisvLeos6mcqKCTlpePipOOgoV+jIh7qqCPuamXvKWSuZiIsI6BrJCGm4+Ng4WKaG99VV9xUFtuX2RsaHF9hImQlpibqKilurisvrqrtbChpqKVjI6Fe396fHx1jop+p6KStbCevLWhu7Ges6WVr6OWpJuVkZCTen2FYmh2WmFvZGRpXGZzcXiCgoaNnJ2ctbOpwb2uvbmpsq6enpyPjYyCkY2CoJuNsKuavbikwr2pvbmmsKycraibp6SanZuajY6Rc3d/ZWl2aWlsVmFvYWx5b3eBiY2Rqamju7isvbmotrGhq6eZn5qNoJuNqaSUtrKfwr6qyMOuwLypsa2dr6ueqaacpqSfnJuZgIKJb3J9cHByU15tWWZ1Y258d36HmJqZr62ltLCjrKiao5+RnZmMoJuNqaSTtrGewbyoxcCsv7qnsa2fs6+iqqeepqOfm5qZf4GJb3N/d3Z2Ul1uV2R1W2h5Z3F9goaLnp6aqqeepaGWnJiMl5SHm5aJpKCQsayau7ajvbiltrGhs66gs66gp6Sdm5mXjY2RdXiBaW55d3V1UV5wV2V4WWh6Xmp6anR+g4eKl5eUnJqVl5WNko+GlJCFnZmLqaSUsaycsaydsayes66gr6ugn5yXjIuMfH6DZWp2YWZ0cG5vUF1xVWN2WWd6W2h7X2t6aXB8en6DiIqNj4+OjYyIjYqEk5CHnZmPpaCWqqWar6ugsq2iqqefkpCPgICEbW93W19tXGBvaGdqVF90VmJ0V2N2WWV4XGh6X2l5ZGt4bXR/d32FgYSJh4iKkI+OnJmWp6Ocrqqhs66krquhnJqXh4aIdXd/YWZxVlxqVl1rZGRnXmZ6YGh4XmZ2XGR1W2Z3XGd4X2d4X2l5Ymx7aXF+dXuGh4mOnZqcqqeir6ukrKehoJ6ZjIuLfnx/bG55XWJvVV1rVFtsYWNmb3SFdXaBeHR0c21uZ2lxZGl1Zmp4ZWt7Zm+AbXOBdnqGg4OKlZKToJuYoJqVmpSNjYaCg315fXRub2xuZWRpVl1qUltsYGNnfH+LiYKBnIZsl35liHdpg3Ztg3dxeXV3dXZ+e3p+fXp/h399kIV7kYZ8k4Z5mIVvkX5qkX1kjXdgd21lcWliWl5lUVpqYWNmhIOLmIl6rYxkqodepIVhoYVlmoNplYBqkX9tkH9vj31tmIFqmINon4ZloYZio4ZgmoFil35gnH9bhnRge29gZWNhVFpnYmNkhYOGnIp0p4plpoZfoIRkmoNpoYdosY1frIpgnYRmm4JlnoRjooVgpIZhp4ddnINhj31mk31jnIBclntchXNedGpdX2BkZWRjg4KFlYl7l4dzl4RsjH5xjIJ4nolxr41io4hik4Bqj39rk39omYNnnINlmYJjjn5ognhvhHdrk3xinH9ainZeeW5cbGZfbGdgj46SmZWTmZOPlI6IjoqKkYyLlYuCmIl3kYZ6ioN7hX54hHx1iX92iYB2g3x1fnp6e3h7e3V0f3dufHFkcWpjZWNjW1xiZWJekpGVn5ycoZ2dnpqbmpiamZeZlpSVl5STlpOUj42NhIKEg4GChIWJhISLfn+IeXyHc3aCaW55aGt1W2FpWF5nVFtnUlhkZGRhi4qQk5GVlpSYlJOXkpGWkZGXkpGXkpKYkJGViYqQhISMgoSLg4WOf4GLdnmFb3SBZGp4XWVzWmBvUlpnVFxpUFlpUlpnaGhldnqFd3uHdnqHdXqHdHmHc3mHdHmIdXqJdHqHcXiFcXaEbnWCbXOCaG99Ymp5XGV0VF5wVV9uU1tsUVtqU11sUVxrVl5qbG1qXmh5W2R2WWN1V2J1VmJ1VmJ1VmJ2VmN2VmR1VmV2WWV3WGR2VmJ0VGFyU2BxUF5vT11vU2BvV2FwV2NwV2RxWWNyX2dwcnNx' };
  let backRef = null;
  const normRGB = (px, n) => {
    const v = new Float32Array(n * 3);
    for (let k = 0; k < 3; k++) {
      let m = 0; for (let i = 0; i < n; i++) m += px[i * 3 + k]; m /= n;
      let sd = 0; for (let i = 0; i < n; i++) sd += (px[i * 3 + k] - m) ** 2; sd = Math.sqrt(sd / n) || 1;
      for (let i = 0; i < n; i++) v[k * n + i] = (px[i * 3 + k] - m) / sd;
    }
    return v;
  };
  async function backScore(blob, game = 'pokemon') {
    const bmp = await createImageBitmap(blob);
    return backScoreOf(bmp, bmp.width, bmp.height, false, game);
  }
  let backCanvas = null;
  // modèles de dos par licence (v2.88) : One Piece = dos bleu et dos rouge (js/games/onepiece-backs.js), cadrés au ras de la
  // carte (le Pokémon vient de pochettes : zoom 0,78 à 0,9) → zooms un peu plus larges
  const backRefs = {};
  const refsOf = (game) => {
    if (backRefs[game]) return backRefs[game];
    // (Riftbound : mesure dédiée, rbBackScore ; Lorcana v3.21 : js/games/lorcana-backs.js (photos d'Arnaud), complété par lcBackScore)
    const list = game === 'onepiece' ? App.onePieceBacks || [] : game === 'lorcana' ? App.lorcanaBacks || [] : [BACK];
    const dec = (t) => { const bin = atob(t.b64), a = new Float32Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return normRGB(a, t.w * t.h); };
    return (backRefs[game] = { refs: list.map(dec), scales: game === 'pokemon' ? [0.78, 0.84, 0.9] : [0.84, 0.92, 1] });
  };
  /** Même mesure, directement sur une image déjà dessinée (canvas, image de la caméra) : sert à la certification en direct */
  // fast (suivi en direct de la certification, v2.48) : sans les petits décalages → 3 essais au lieu de 9 (la caméra
  // du téléphone d'Arnaud ne donnait que ~6 images par seconde au suivi)
  // Dos Riftbound (v3.10) : fond uni sombre (noir ou bleu nuit) et fins filets dorés symétriques. Un modèle 24 × 33 n'y voit que
  // l'éclairage (dos bleu en pochette : 0,2 contre son propre modèle) → mesure dédiée sur 48 × 66 : part d'or, part de fond sombre,
  // autres couleurs, symétrie du dessin doré (haut/bas et gauche/droite). Photos d'Arnaud (_tests-scanner/riftbound/dos.webp) :
  // dos or 1,7 à 12 %, fond ≥ 80 %, autres ≤ 17 %, symétrie ≥ 0,59 ; ~80 faces (Riftbound, Pokémon, One Piece) : jamais les quatre.
  let rbCanvas = null;
  function rbBackScore(src, SW, SH) {
    const W = 48, H = 66, N = W * H;
    const c = rbCanvas || (rbCanvas = Object.assign(document.createElement('canvas'), { width: W, height: H }));
    const g = c.getContext('2d', { willReadFrequently: true });
    g.clearRect(0, 0, W, H); g.drawImage(src, SW * 0.04, SH * 0.04, SW * 0.92, SH * 0.92, 0, 0, W, H);
    const d = g.getImageData(0, 0, W, H).data, gold = new Uint8Array(N);
    let ng = 0, nd = 0;
    for (let i = 0; i < N; i++) {
      const r = d[i * 4], gg = d[i * 4 + 1], b = d[i * 4 + 2], mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), s = mx ? (mx - mn) / mx : 0;
      let h = 0;
      if (mx !== mn) { h = mx === r ? 60 * (((gg - b) / (mx - mn)) % 6) : mx === gg ? 60 * ((b - r) / (mx - mn) + 2) : 60 * ((r - gg) / (mx - mn) + 4); if (h < 0) h += 360; }
      // (gris peu coloré = table ou tapis autour d'une carte un peu petite dans le cadre : compté comme fond)
      if (h >= 30 && h <= 65 && s > 0.35 && mx > 110) { gold[i] = 1; ng++; } else if (mx < 120 || (h >= 190 && h <= 250 && mx < 200) || s < 0.12) nd++;
    }
    const pg = ng / N, pd = nd / N, po = 1 - pg - pd;
    let sym = 0;
    if (ng) {
      const near = (X, Y) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const x = X + dx, y = Y + dy; if (x >= 0 && y >= 0 && x < W && y < H && gold[y * W + x]) return 1; } return 0; };
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (gold[y * W + x]) sym += (near(W - 1 - x, y) + near(x, H - 1 - y)) / 2;
      sym /= ng;
    }
    const ok = [pg >= 0.012 && pg <= 0.2, pd >= 0.72, po <= 0.22, sym >= 0.5];
    // tout bon : 0,62 à 0,87 selon la symétrie ; sinon au plus 0,3 (seuil du dos : 0,55 en direct, 0,6 en classeur)
    return ok.every(Boolean) ? 0.62 + 0.25 * Math.min(1, (sym - 0.5) / 0.4) : 0.08 * ok.filter(Boolean).length;
  }
  // Dos Lorcana (v3.21) : fond noir à volutes, grand rond doré au centre (étoile noire dedans), bordure noire. La comparaison 24 × 33
  // seule ne suffit pas (les faces ont aussi une bordure noire : jusqu'à 0,58) → en plus, sur 48 × 66 : part dorée dans le rond
  // (centre 50 % × 38,5 %), bas de la carte sombre (une face y a sa zone de texte claire), peu de couleurs vives, rond doré
  // symétrique gauche/droite. Photos d'Arnaud (_tests-scanner/lorcana/1 et 2, avec 0 à 18 % de marge) : 0,75–0,87 ;
  // 508 faces officielles, ses photos de cartes, dos Pokémon / One Piece / Riftbound, carte « appli » au QR code : ≤ 0,35.
  let lcCanvas = null;
  function lcFeatures(src, SW, SH, sc, dx = 0, dy = 0) {
    const W = 48, H = 66, N = W * H;
    const c = lcCanvas || (lcCanvas = Object.assign(document.createElement('canvas'), { width: W, height: H }));
    const g = c.getContext('2d', { willReadFrequently: true });
    g.clearRect(0, 0, W, H); g.drawImage(src, SW * (0.5 + dx) - SW * sc / 2, SH * (0.5 + dy) - SH * sc / 2, SW * sc, SH * sc, 0, 0, W, H);
    const d = g.getImageData(0, 0, W, H).data, gold = new Uint8Array(N);
    let dg = 0, dn = 0, od = 0, on = 0, bd = 0, bn = 0, col = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, r = d[i * 4], gg = d[i * 4 + 1], b = d[i * 4 + 2], mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), s = mx ? (mx - mn) / mx : 0;
      let h = 0;
      if (mx !== mn) { h = mx === r ? 60 * (((gg - b) / (mx - mn)) % 6) : mx === gg ? 60 * ((b - r) / (mx - mn) + 2) : 60 * ((r - gg) / (mx - mn) + 4); if (h < 0) h += 360; }
      const isGold = h >= 20 && h <= 60 && s >= 0.15 && s <= 0.7 && mx > 120, dark = mx < 95, vivid = s > 0.45 && mx > 110 && !isGold;
      const ex = (x + 0.5) / W - 0.5, ey = (y + 0.5) / H - 0.385;
      if ((ex / 0.22) ** 2 + (ey / 0.155) ** 2 <= 1) { dn++; if (isGold) { dg++; gold[i] = 1; } } else { on++; if (dark) od++; if (vivid) col++; }
      const fy = (y + 0.5) / H; if (fy > 0.6 && fy < 0.95) { bn++; if (dark) bd++; }
    }
    // symétrie gauche/droite autour du centre du rond doré lui-même (v3.24 : carte pas centrée dans une case de classeur)
    let sym = 0, ng = 0, cx = 0;
    for (let i = 0; i < N; i++) if (gold[i]) { ng++; cx += i % W; }
    cx = ng ? cx / ng : (W - 1) / 2;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!gold[y * W + x]) continue;
      const xx = Math.round(2 * cx - x); if ((xx > 0 && xx - 1 < W && gold[y * W + xx - 1]) || (xx >= 0 && xx < W && gold[y * W + xx]) || (xx + 1 >= 0 && xx < W - 1 && gold[y * W + xx + 1])) sym++;
    }
    return { disc: dg / dn, out: od / on, bot: bd / bn, col: col / on, sym: ng ? sym / ng : 0 };
  }
  let lcSrc = null;
  function lcBackScore(src, SW, SH, fast) {
    // (v3.24 : une image chargée directement (ImageBitmap) ne se dessine pas comme un canevas quand la zone demandée déborde
    //  — décalages ci-dessous — : 0,35 au lieu de 0,65 sur la même case → copie dans un petit canevas d'abord)
    if (!(src instanceof HTMLCanvasElement)) {
      const k = Math.min(1, 900 / Math.max(SW, SH)), c = lcSrc || (lcSrc = document.createElement('canvas'));
      c.width = Math.max(1, Math.round(SW * k)); c.height = Math.max(1, Math.round(SH * k)); c.getContext('2d').drawImage(src, 0, 0, SW, SH, 0, 0, c.width, c.height);
      src = c; SW = c.width; SH = c.height;
    }
    const k = corrScore(src, SW, SH, fast, 'lorcana');
    let best = 0;
    // (v3.24 : décalages aussi — case de classeur qui garde un bout de pochette d'un côté, dos pas centré)
    const offs = fast ? [[0, 0]] : [[0, 0], [-0.06, 0], [0.06, 0], [0, -0.05], [0, 0.05]];
    for (const sc of fast ? [1, 0.88] : [1, 0.92, 0.84]) for (const [dx, dy] of offs) {
      const x = lcFeatures(src, SW, SH, sc, dx, dy), shape = [x.disc >= 0.25, x.bot >= 0.45, x.out >= 0.35, x.col <= 0.1, x.sym >= 0.6];
      // v3.24 (page 11 d'Arnaud : 2 dos en pochette ne ressemblaient au modèle qu'à 0,37 et 0,46, autre éclairage) : ressemblance
      // moyenne acceptée si le rond doré est bien net et symétrique (dos 0,44–0,56 / 0,85–0,98 ; seule face proche, « Fauchage »
      // Q3-34, toute sombre avec une lune dorée : rond 0,30)
      // (case avec de la marge : modèle 0,25–0,29 mais rond très net ; case qui coupe un peu la carte : symétrie 0,7 ; « Fauchage » : rond 0,30)
      const ok = [...shape, k >= 0.6 || (k >= 0.2 && x.disc >= 0.38 && x.sym >= 0.9) || (k >= 0.3 && x.disc >= 0.45 && x.sym >= 0.7)];
      // tout bon : 0,62 à 0,87 selon la ressemblance au modèle ; sinon au plus 0,35 (seuil du dos : 0,55 en direct, 0,6 en classeur)
      const v = ok.every(Boolean) ? 0.62 + 0.25 * Math.min(1, Math.max(0.12, (k - 0.6) / 0.3)) : 0.07 * ok.filter(Boolean).length;
      if (v > best) { best = v; lcBackScore.last = { k, sc, dx, dy, ...x }; } // (dernier détail : réglages au labo)
    }
    return best;
  }
  // Dos Yu-Gi-Oh! (v3.26) : large bordure cuivrée (brun orangé clair), intérieur sombre à tourbillon de filets orange et jaunes.
  // Les faces ont une fine bordure sombre puis un cadre de couleur (orange, vert, violet…), une illustration et une zone de texte
  // claire → mesure dédiée sur 48 × 66 : part cuivrée dans la bordure (« bord »), couleurs froides au centre (« cool » : bleu, vert,
  // violet), zone de texte claire (« tb »). Le modèle 24 × 33 (comme Pokémon) n'y voit rien : les filets du tourbillon ne tombent
  // jamais au même endroit (dos contre leur moyenne : 0,07 à 0,25). Photos d'Arnaud (_tests-scanner/yugioh/, banc yg-bench.js) :
  // 11 dos occidentaux (classeur sous pochette brillante, en main) bord 0,37–0,90, cool ≤ 0,06, tb ≤ 0,29 ; 23 faces (FR, EN, JP) :
  // bord ≤ 0,42 et alors cool ≥ 0,28, sauf « Dragon Fantôme » (cadre orange, illustration grise, cadrage un peu serré : bord 0,75) →
  // aussi la bande juste à l’intérieur (« in2 ») : sombre sur un dos (bordure fine), cuivrée sur une face (cadre large) : bord − in2 ≥ 0,15.
  // Dos japonais (OCG) : pas reconnu.
  let ygCanvas = null;
  function ygFeatures(src, SW, SH, sc, dx = 0, dy = 0) {
    const W = 48, H = 66;
    const c = ygCanvas || (ygCanvas = Object.assign(document.createElement('canvas'), { width: W, height: H }));
    const g = c.getContext('2d', { willReadFrequently: true });
    g.clearRect(0, 0, W, H); g.drawImage(src, SW * (0.5 + dx) - SW * sc / 2, SH * (0.5 + dy) - SH * sc / 2, SW * sc, SH * sc, 0, 0, W, H);
    const d = g.getImageData(0, 0, W, H).data;
    let bn = 0, bw = 0, in2 = 0, iw = 0, n = 0, cool = 0, tbn = 0, tb = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, r = d[i * 4], gg = d[i * 4 + 1], b = d[i * 4 + 2], mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), s = mx ? (mx - mn) / mx : 0;
      let h = 0;
      if (mx !== mn) { h = mx === r ? 60 * (((gg - b) / (mx - mn)) % 6) : mx === gg ? 60 * ((b - r) / (mx - mn) + 2) : 60 * ((r - gg) / (mx - mn) + 4); if (h < 0) h += 360; }
      const fx = (x + 0.5) / W, fy = (y + 0.5) / H, e = Math.min(fx, 1 - fx, fy * 1.375, (1 - fy) * 1.375);
      const cu = h >= 10 && h <= 45 && s >= 0.2 && mx >= 100;
      if (e < 0.05) { bn++; if (cu) bw++; } else if (e >= 0.07 && e < 0.11) { in2++; if (cu) iw++; }
      if (e > 0.12) { n++; if (s >= 0.12 && h > 55 && h < 340) cool++; if (fy > 0.7 && fy < 0.9) { tbn++; if (mx > 150 && s < 0.3) tb++; } }
    }
    return { bord: bw / bn, in2: iw / in2, cool: cool / n, tb: tb / tbn };
  }
  let ygSrc = null;
  function ygBackScore(src, SW, SH, fast) {
    if (!(src instanceof HTMLCanvasElement)) {
      const k = Math.min(1, 900 / Math.max(SW, SH)), c = ygSrc || (ygSrc = document.createElement('canvas'));
      c.width = Math.max(1, Math.round(SW * k)); c.height = Math.max(1, Math.round(SH * k)); c.getContext('2d').drawImage(src, 0, 0, SW, SH, 0, 0, c.width, c.height);
      src = c; SW = c.width; SH = c.height;
    }
    let best = -1;
    // (cadrages un peu plus serrés : case de classeur ou photo avec de la marge autour du dos)
    const offs = fast ? [[0, 0]] : [[0, 0], [-0.03, 0], [0.03, 0], [0, -0.03], [0, 0.03]];
    for (const sc of fast ? [1, 0.88] : [1, 0.94, 0.88, 0.82, 0.76]) for (const [dx, dy] of offs) {
      const x = ygFeatures(src, SW, SH, sc, dx, dy), ok = [x.bord >= 0.35, x.bord - x.in2 >= 0.15, x.cool <= 0.08, x.tb <= 0.3];
      // tout bon : 0,62 à 0,87 selon la part cuivrée de la bordure ; sinon au plus 0,3 (seuil du dos : 0,55 en direct, 0,6 en classeur)
      const v = ok.every(Boolean) ? 0.62 + 0.25 * Math.min(1, (x.bord - 0.35) / 0.45) : 0.08 * ok.filter(Boolean).length;
      if (v > best) { best = v; ygBackScore.last = { sc, dx, dy, bord: +x.bord.toFixed(2), in2: +x.in2.toFixed(2), cool: +x.cool.toFixed(2), tb: +x.tb.toFixed(2) }; } // (détail : réglages au banc)
    }
    return best;
  }
  // Dos Final Fantasy (v3.43) : carte noire mate, logo argenté « FINAL FANTASY » (lettres grises, carte blanche penchée derrière,
  // bandeau « TRADING CARD GAME ») au milieu, rien d'autre. Sous une pochette brillante le noir devient gris (reflets) : la
  // couleur sombre ne suffit pas (des faces sont aussi sombres et peu colorées). Mesure dédiée sur 48 × 66 : presque rien de
  // coloré (« sat ») et le détail (contraste d'un pixel à l'autre) concentré dans la bande du logo (0,38…0,62) : « ratio » =
  // détail de la bande ÷ détail du haut et du bas. Photos d'Arnaud (_tests-scanner/finalfantasy/3, 4, 9, 10 : en main, en
  // pochette, page de classeur aux reflets gris) : sat ≤ 0,001, ratio 3,0–17 ; 891 visuels officiels : ratio ≤ 2,9, et ≤ 1,9
  // pour les faces peu colorées (sat ≤ 0,06).
  let ffCanvas = null;
  function ffFeatures(src, SW, SH, sc, dx = 0, dy = 0) {
    const W = 48, H = 66, L = new Float32Array(W * H);
    const c = ffCanvas || (ffCanvas = Object.assign(document.createElement('canvas'), { width: W, height: H }));
    const g = c.getContext('2d', { willReadFrequently: true });
    g.clearRect(0, 0, W, H); g.drawImage(src, SW * (0.5 + dx) - SW * sc / 2, SH * (0.5 + dy) - SH * sc / 2, SW * sc, SH * sc, 0, 0, W, H);
    const d = g.getImageData(0, 0, W, H).data;
    let n = 0, sat = 0;
    for (let i = 0; i < W * H; i++) {
      const r = d[i * 4], gg = d[i * 4 + 1], b = d[i * 4 + 2], mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), s = mx ? (mx - mn) / mx : 0;
      L[i] = 0.3 * r + 0.59 * gg + 0.11 * b;
      const fx = (i % W + 0.5) / W, fy = (((i / W) | 0) + 0.5) / H;
      if (fx < 0.06 || fx > 0.94 || fy < 0.05 || fy > 0.95) continue; // (bord : pochette, doigts)
      n++; if (s > 0.35 && mx > 80) sat++;
    }
    let gb = 0, nb = 0, go = 0, no = 0;
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const fx = (x + 0.5) / W, fy = (y + 0.5) / H;
      if (fx < 0.08 || fx > 0.92 || fy < 0.06 || fy > 0.94) continue;
      const i = y * W + x, gr = Math.abs(L[i + 1] - L[i - 1]) + Math.abs(L[i + W] - L[i - W]);
      if (fy >= 0.38 && fy <= 0.62 && fx > 0.12 && fx < 0.88) { gb += gr; nb++; } else if (fy < 0.32 || fy > 0.68) { go += gr; no++; }
    }
    return { sat: sat / n, band: gb / nb, ratio: (gb / nb) / Math.max(2, go / no) };
  }
  let ffSrc = null;
  function ffBackScore(src, SW, SH, fast) {
    if (!(src instanceof HTMLCanvasElement)) {
      const k = Math.min(1, 900 / Math.max(SW, SH)), c = ffSrc || (ffSrc = document.createElement('canvas'));
      c.width = Math.max(1, Math.round(SW * k)); c.height = Math.max(1, Math.round(SH * k)); c.getContext('2d').drawImage(src, 0, 0, SW, SH, 0, 0, c.width, c.height);
      src = c; SW = c.width; SH = c.height;
    }
    let best = -1;
    const offs = fast ? [[0, 0]] : [[0, 0], [-0.04, 0], [0.04, 0], [0, -0.04], [0, 0.04]];
    for (const sc of fast ? [1, 0.88] : [1, 0.92, 0.84]) for (const [dx, dy] of offs) {
      const x = ffFeatures(src, SW, SH, sc, dx, dy), ok = [x.sat <= 0.03, x.band >= 35, x.ratio >= 2.4];
      // tout bon : 0,62 à 0,87 selon le rapport ; sinon au plus 0,2 (seuil du dos : 0,55 en direct, 0,6 en classeur)
      const v = ok.every(Boolean) ? 0.62 + 0.25 * Math.min(1, (x.ratio - 2.4) / 3) : 0.07 * ok.filter(Boolean).length;
      if (v > best) { best = v; ffBackScore.last = { sc, dx, dy, sat: +x.sat.toFixed(3), band: +x.band.toFixed(1), ratio: +x.ratio.toFixed(2) }; }
    }
    return best;
  }
  // Dos Wankul (v3.48) : carte bleue (fond tacheté), logo blanc « WANKUL » au milieu, rien d'autre. Mesure sur 48 × 66, comme
  // Final Fantasy : presque rien de chaud (« warm » : rouge ou vert au-dessus du bleu), beaucoup de bleu, et le détail concentré
  // dans la bande du logo (0,40…0,58) : « ratio » = détail de la bande ÷ détail du haut et du bas. Photos d'Arnaud
  // (_tests-scanner/wankul/1 en main, 2 en pochette brillante, 5 et 6 pages de classeur) : warm ≤ 0,07, blue 0,46–0,93, ratio 4,0–9,4 ;
  // 958 visuels officiels : ratio ≤ 2,8, et ≤ 1,4 pour les faces bleues peu chaudes (warm ≤ 0,12, blue ≥ 0,4 : 45 cartes).
  let wkCanvas = null, wkSrc = null;
  function wkFeatures(src, SW, SH, sc, dx = 0, dy = 0) {
    const W = 48, H = 66, L = new Float32Array(W * H);
    const c = wkCanvas || (wkCanvas = Object.assign(document.createElement('canvas'), { width: W, height: H }));
    const g = c.getContext('2d', { willReadFrequently: true });
    g.clearRect(0, 0, W, H); g.drawImage(src, SW * (0.5 + dx) - SW * sc / 2, SH * (0.5 + dy) - SH * sc / 2, SW * sc, SH * sc, 0, 0, W, H);
    const d = g.getImageData(0, 0, W, H).data;
    let n = 0, warm = 0, blue = 0;
    for (let i = 0; i < W * H; i++) {
      const r = d[i * 4], gg = d[i * 4 + 1], b = d[i * 4 + 2];
      L[i] = 0.3 * r + 0.59 * gg + 0.11 * b;
      const fx = (i % W + 0.5) / W, fy = (((i / W) | 0) + 0.5) / H;
      if (fx < 0.08 || fx > 0.92 || fy < 0.06 || fy > 0.94) continue; // (bord : pochette, doigts)
      n++; if (r > b + 12 || gg > b + 12) warm++; if (b > r + 25 && b >= gg) blue++;
    }
    let gb = 0, nb = 0, go = 0, no = 0;
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const fx = (x + 0.5) / W, fy = (y + 0.5) / H;
      if (fx < 0.08 || fx > 0.92 || fy < 0.06 || fy > 0.94) continue;
      const i = y * W + x, gr = Math.abs(L[i + 1] - L[i - 1]) + Math.abs(L[i + W] - L[i - W]);
      if (fy >= 0.4 && fy <= 0.58 && fx > 0.15 && fx < 0.85) { gb += gr; nb++; } else if (fy < 0.3 || fy > 0.7) { go += gr; no++; }
    }
    return { warm: warm / n, blue: blue / n, band: gb / nb, ratio: (gb / nb) / Math.max(2, go / no) };
  }
  function wkBackScore(src, SW, SH, fast) {
    if (!(src instanceof HTMLCanvasElement)) {
      const k = Math.min(1, 900 / Math.max(SW, SH)), c = wkSrc || (wkSrc = document.createElement('canvas'));
      c.width = Math.max(1, Math.round(SW * k)); c.height = Math.max(1, Math.round(SH * k)); c.getContext('2d').drawImage(src, 0, 0, SW, SH, 0, 0, c.width, c.height);
      src = c; SW = c.width; SH = c.height;
    }
    let best = -1;
    // (case de classeur décalée : le haut de la carte du dessus dedans, logo descendu à 0,7 — page 6 d'Arnaud)
    const offs = fast ? [[0, 0]] : [[0, 0], [-0.04, 0], [0.04, 0], [0, -0.04], [0, 0.04], [0, -0.08], [0, 0.08], [0, -0.12], [0, 0.12]];
    for (const sc of fast ? [1, 0.88] : [1, 0.92, 0.84, 0.76]) for (const [dx, dy] of offs) {
      const x = wkFeatures(src, SW, SH, sc, dx, dy), ok = [x.warm <= 0.15, x.blue >= 0.35, x.band >= 35, x.ratio >= 3];
      // tout bon : 0,62 à 0,87 selon le rapport ; sinon au plus 0,24 (seuil du dos : 0,55 en direct, 0,6 en classeur)
      const v = ok.every(Boolean) ? 0.62 + 0.25 * Math.min(1, (x.ratio - 3) / 5) : 0.06 * ok.filter(Boolean).length;
      if (v > best) { best = v; wkBackScore.last = { sc, dx, dy, warm: +x.warm.toFixed(3), blue: +x.blue.toFixed(2), band: +x.band.toFixed(1), ratio: +x.ratio.toFixed(2) }; }
    }
    return best;
  }
  function backScoreOf(src, SW, SH, fast = false, game = 'pokemon') {
    if (game === 'wankul') return wkBackScore(src, SW, SH, fast);
    if (game === 'finalfantasy') return ffBackScore(src, SW, SH, fast);
    if (game === 'yugioh') return ygBackScore(src, SW, SH, fast);
    if (game === 'riftbound') return rbBackScore(src, SW, SH);
    if (game === 'lorcana') return lcBackScore(src, SW, SH, fast);
    return corrScore(src, SW, SH, fast, game);
  }
  function corrScore(src, SW, SH, fast, game) {
    if (!backRef) backRef = refsOf('pokemon').refs[0];
    const { refs, scales } = refsOf(game);
    if (!refs.length) return -1;
    const W = BACK.w, H = BACK.h, n = W * H;
    const c = backCanvas || (backCanvas = Object.assign(document.createElement('canvas'), { width: W, height: H }));
    const g = c.getContext('2d', { willReadFrequently: true }); g.filter = 'blur(0.6px)';
    let best = -1;
    const offs = fast ? [0] : [-0.05, 0, 0.05];
    for (const sc of scales) for (const dx of offs) for (const dy of offs) {
      const bw = SW * sc, bh = SH * sc;
      g.clearRect(0, 0, W, H);
      g.drawImage(src, SW * (0.5 + dx) - bw / 2, SH * (0.5 + dy) - bh / 2, bw, bh, 0, 0, W, H);
      const d = g.getImageData(0, 0, W, H).data, px = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { px[i * 3] = d[i * 4]; px[i * 3 + 1] = d[i * 4 + 1]; px[i * 3 + 2] = d[i * 4 + 2]; }
      const v = normRGB(px, n);
      for (const ref of refs) { let s = 0; for (let i = 0; i < v.length; i++) s += v[i] * ref[i]; s /= v.length; if (s > best) best = s; }
    }
    return best;
  }
  async function looksLikeBack(blob, game = 'pokemon') { return (await backScore(blob, game)) >= 0.6; }

  /**
   * Ressemblance de la carte ENTIÈRE (petite image couleur 24×33, corrélation), pour les cartes hors-série :
   * leur mise en page (Illustrator, Trophée…) n'a pas la fenêtre d'illustration des cartes ordinaires,
   * la comparaison habituelle de l'illustration ne marche pas (Illustrator contre sa propre image : 0,21).
   * Renvoie Map(id → score de -1 à 1) ; même méthode que la reconnaissance des dos (backScoreOf).
   */
  const wholeRefs = new Map();
  async function wholeCardScores(blob, cards) {
    const W = BACK.w, H = BACK.h, n = W * H;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true }); g.filter = 'blur(0.6px)';
    const vec = (src, sx, sy, sw, sh) => {
      g.clearRect(0, 0, W, H); g.drawImage(src, sx, sy, sw, sh, 0, 0, W, H);
      const d = g.getImageData(0, 0, W, H).data, px = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { px[i * 3] = d[i * 4]; px[i * 3 + 1] = d[i * 4 + 1]; px[i * 3 + 2] = d[i * 4 + 2]; }
      return normRGB(px, n);
    };
    const refOf = async (card) => {
      const url = ad().img.card(card, 'low'); if (!url) return null;
      if (!wholeRefs.has(url)) wholeRefs.set(url, (async () => { const im = await createImageBitmap(await (await fetch(url)).blob()); return vec(im, 0, 0, im.width, im.height); })().catch(() => null));
      return wholeRefs.get(url);
    };
    const bmp = await createImageBitmap(blob), SW = bmp.width, SH = bmp.height;
    // la carte peut être un peu plus petite que la découpe (marge du cadre) : quelques tailles et décalages
    const views = [];
    for (const sc of [1, 0.94, 0.88]) for (const dx of [-0.03, 0, 0.03]) for (const dy of [-0.03, 0, 0.03]) {
      const bw = SW * sc, bh = SH * sc;
      views.push(vec(bmp, SW * (0.5 + dx) - bw / 2, SH * (0.5 + dy) - bh / 2, bw, bh));
    }
    const out = new Map();
    for (const card of cards) {
      const ref = await refOf(card); if (!ref) continue;
      let best = -1;
      for (const v of views) { let s = 0; for (let i = 0; i < v.length; i++) s += v[i] * ref[i]; s /= v.length; if (s > best) best = s; }
      out.set(card.id, best);
    }
    return out;
  }

  Object.assign(App.recognizerParts, { thumb, corr, corr1, looksEmpty, ART, AW, AH, artVec, artVariants, artMatch, trimBackground, vis01, officialThumbs, officialThumb, BACK, normRGB, backScore, backRefs, refsOf, backScoreOf, lcBackScore, ygBackScore, ffBackScore, looksLikeBack, wholeRefs, wholeCardScores });
})();
