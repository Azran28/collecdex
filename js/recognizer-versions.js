/* Reconnaissance — partie 4/5 : versions d'une carte (holo, reverse, 1re édition). Voir recognizer-text.js. */
(() => {
  const { fetchImage, loadImg, cardPixels } = App.recognizerParts;

  /**
   * Logo « Édition 1 » (petit rond noir marqué « 1 » sous le mot EDITION), sous l'illustration :
   * à gauche (Set de Base, Team Rocket, Gym, Neo…) ou à droite (Jungle, Fossile).
   * On compare chaque endroit possible à un vrai logo (photographié de près), à plusieurs tailles
   * (corrélation normalisée : insensible à la luminosité et au contraste).
   * Mesuré sur de vraies photos : vrai logo 0,91 (carte de 260 px de large) ; cartes sans logo ≤ 0,81.
   */
  const STAMP = { w: 40, h: 32, b64: 'fXd4d3d6e3p7enl6fHx4eHp5eHl2c3Bxc3BwcGpjXltVU1FPT09LRX53d3h4e3x6enl4d3x9eXh6eHZ3d3Jwb3BraWZhWlROR0M/Ojg0My1+dXd6e3x9fXt6eXZ6fXl5enV1eXdxbW5uaWViYV1YUkZBQDs2MjMtfnl6e31+f315fH17fX15endxcHJ0cm9tampoZWNhX1dLREM/OTY3M4B8e318fn59enx+fXx5dnVoV1NWWmhtaWZramhlYV1XT0lGQTw7OTaBfXt9e3t+f319fn12am9xWzwsLTtZZ1lUYmdoZ2FbV1VOS0ZCPj48gH19fXp8gH5+fn18Z0dVb2ZHJCNBX2A/NVNna2ljWFdXVVNQTkZCQ399fn17foB+fn18d1w1OGNxXjAlUGlSKitUbGxoYl5aWFhXVVZQSUyAf319gIGBfHdycnZrRC5NamY2JlNnRyU1WmRaTktVXV5cWlhaV1NUhIF9foOCfG1dTk9fb1owOl5iNSdRZD0mQ1pMNiksQFliYF5bW1lXVoN9e3yBgG9MLCUoNFJgPy9SZTwrUlcuK01PLyMoJS1OZGVkYV9eWl2CfHp9fnldLhUmNCkwUlAxQVpDMktKMkBXOh0vPCsqS2hramZkY15ggn16fn12YTcYIjcyJUZZPDQ7LScyMDFHVjEZMTUmM1Vrbm1qaWRhYYR+e35+enFcOSAhJyhGUi8WDw0PEhEaLj80GiAlNFNobW5ubWtnaGmEgX5+fn19eGVGKCAuPzARCA0bJh4LCxIbKy4xOExhZFtaZW5sZ2dog4J+e3FtdHd0aUw7PykKAwohRVZAEwcIBhc6U0xCQDsyN1BqbWpqboOCfnNYT19fZmJVVUQYAgEKIlFrTBYFAwMLKkc3IRUSGSxNbHFtb3GCfn1wPC5COkZGN0cqCgMCCRhIb1MZBQQGBxk8Nx8KBhEqS2p1dHNyf3x7aDEfIxsjJik3GwYDBQoUQG9YHAUDBggTMDwpDgcOIT9hdXh0cn96eWpALCUeGRcoNxAEBQYIEz9sVhsEBAYHESw7KBwiLThNZHN2dHKEf3x5Z1xSST84PzoPBQUFCBVAalcbBQUGCRQzTEhMV2BkanJ0cnNzg4F+fnt5c25pZGFJFAQDBAcSO2VTGwcHCg4bQGNyeXh5enh2dXNzdYKBgYB/fnt4dXNvWicJAwMIFDljUxwHBwsXLll0eX18fH18dXV1dXaDg4OAfnp3dXRzdGs+EQUECRY9aFsjCgcLHD1penp8eXd6fHl1c3R2g4KCgHx5d3VzdXRxXzEPBgkbPVtdORUKFC9YdXx6eXl5e3p4d3Z0dIOAg4SBfnp0dHd0cG5YJQ0JEyw2MyYWFSlOcHx9fn5+fXx6d3h5dnSEg4OEhYB7dnZ3dHBvak0uGQ8NEhUVHDBKaHx+fYB/fn+AfXh5eXd2g4OBg4N/fXp7enh1dHVwYUc0KiMoM0BVbHyDgX+AfXx+fn55d3l3doSBgISDf4B9fXx7e3l5eXVtZ2RkZGduc3p/gYB/fn18e3t8eXZ5eHiBf4CCgYGCf315eXt5d3d6eXl6fHt8fn59fH6Af319fXx7fHl3fHt9gn+AgYOEgX17enl4d3h5fHx8fn9+f4B+e3t+gH17e36AfXt7e358eoF+gYGAgH17e3t6d3d6fH1+fX5/f39/fHt7fX99e3x+gH57ent8e3g=' };
  let stampPx = null;
  function stampTemplate(w, h) {
    if (!stampPx) { const bin = atob(STAMP.b64); stampPx = new Float32Array(bin.length); for (let i = 0; i < bin.length; i++) stampPx[i] = bin.charCodeAt(i); }
    const t = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const sx = Math.min(STAMP.w - 1.001, (x + 0.5) * STAMP.w / w - 0.5), sy = Math.min(STAMP.h - 1.001, (y + 0.5) * STAMP.h / h - 0.5);
      const x0 = Math.max(0, Math.floor(sx)), y0 = Math.max(0, Math.floor(sy)), fx = Math.max(0, sx - x0), fy = Math.max(0, sy - y0);
      const v = (a, b) => stampPx[b * STAMP.w + a];
      t[y * w + x] = (v(x0, y0) * (1 - fx) + v(x0 + 1, y0) * fx) * (1 - fy) + (v(x0, y0 + 1) * (1 - fx) + v(x0 + 1, y0 + 1) * fx) * fy;
    }
    let m = 0; for (const v of t) m += v; m /= t.length;
    let n = 0; for (let i = 0; i < t.length; i++) { t[i] -= m; n += t[i] * t[i]; }
    n = Math.sqrt(n) || 1; for (let i = 0; i < t.length; i++) t[i] /= n;
    return t;
  }
  function firstEditionStamp(P, only = null) {
    const { W, H, L } = P;
    // sommes cumulées (moyenne et énergie d'une zone en temps constant)
    const I = new Float64Array((W + 1) * (H + 1)), I2 = new Float64Array((W + 1) * (H + 1));
    for (let y = 0; y < H; y++) { let r = 0, r2 = 0; for (let x = 0; x < W; x++) { const v = L[y * W + x]; r += v; r2 += v * v; I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + r; I2[(y + 1) * (W + 1) + x + 1] = I2[y * (W + 1) + x + 1] + r2; } }
    const box = (A, x, y, w, h) => A[(y + h) * (W + 1) + x + w] - A[y * (W + 1) + x + w] - A[(y + h) * (W + 1) + x] + A[y * (W + 1) + x];
    let best = null;
    for (const frac of [0.058, 0.066, 0.075, 0.085]) {
      const w = Math.round(W * frac), h = Math.round(w * STAMP.h / STAMP.w), N = w * h, t = stampTemplate(w, h);
      const zones = only ? [only] : [[0, 0.3], [0.7, 1]];
      for (const [z0, z1] of zones) {
        const X0 = Math.max(0, Math.round(W * z0)), X1 = Math.min(W - w, Math.round(W * z1) - w);
        const Y0 = Math.round(H * 0.42), Y1 = Math.min(H - h, Math.round(H * 0.72) - h);
        for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
          const sm = box(I, x, y, w, h), s2 = box(I2, x, y, w, h), nrm = Math.sqrt(Math.max(0, s2 - sm * sm / N));
          if (nrm < 1e-3 || nrm / Math.sqrt(N) < 12) continue; // zone unie : pas de logo
          let c = 0;
          for (let j = 0; j < h; j++) { const row = (y + j) * W + x, tr = j * w; for (let i = 0; i < w; i++) c += L[row + i] * t[tr + i]; }
          const sc = c / nrm; // la moyenne du modèle est nulle : inutile de retirer celle de la zone
          if (!best || sc > best.score) best = { score: sc, x: x / W, y: y / H, size: frac, side: z0 < 0.5 ? 'gauche' : 'droite' };
        }
      }
    }
    return best;
  }

  /**
   * Reflets « foil » dans une zone : sur une carte normale, le fond est uni (seul le texte fait des contrastes) ;
   * sur une reverse, le fond scintille (petits points clairs, couleurs changeantes).
   */
  function foilIn(P, x0, x1, y0, y1) {
    const { W, H, L, Sat } = P;
    const X0 = Math.round(W * x0), X1 = Math.round(W * x1), Y0 = Math.round(H * y0), Y1 = Math.round(H * y1);
    let n = 0, res = 0, sat = 0, sat2 = 0;
    for (let y = Y0 + 2; y < Y1 - 2; y++) for (let x = X0 + 2; x < X1 - 2; x++) {
      const i = y * W + x;
      if (L[i] < 120) continue; // texte et symboles : ignorés
      let m = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) m += L[i + dy * W + dx]; m /= 25;
      if (m < 110) continue; // à côté du texte
      res += Math.abs(L[i] - m); sat += Sat[i]; sat2 += Sat[i] * Sat[i]; n++;
    }
    if (n < 50) return null;
    const ms = sat / n;
    return { grain: res / n, satVar: Math.sqrt(Math.max(0, sat2 / n - ms * ms)), n };
  }

  /**
   * Versions probables d'une carte d'après sa photo, parmi celles qui existent pour elle.
   * Tout est comparé au visuel officiel de la même carte (même zones) : ça neutralise la netteté
   * et la taille de la photo, et un symbole imprimé sur la carte n'est pas pris pour un logo.
   * Renvoie { list: ['holo', 'firstEdition'], sure: {…}, info: {…} }.
   */
  async function detectVariants(blob, variants, officialSrc = '') {
    const v = variants || {};
    const img = await loadImg(blob);
    const P = cardPixels(img);
    let O = null;
    if (officialSrc) {
      try { const b = await fetchImage(officialSrc); if (b) O = cardPixels(await createImageBitmap(b)); } catch (e) { O = null; }
    }
    const info = {}, list = [], sure = {};
    // version de base : holo / normale / reverse
    const base = ['holo', 'normal', 'reverse'].filter((k) => v[k]);
    let pickBase = base.length === 1 ? base[0] : null;
    // (v2.37, photos d'Arnaud : Libegon et Drattak normales prises pour des holos, Massko reverse prise pour une normale)
    // - normale, holo ET reverse possibles : si ce n'est pas une reverse, on mesure encore holo / normale
    //   (avant : la première de la liste restante, « holo », sans mesure) ;
    // - la mesure n'est pas encore calibrée sur de vraies cartes : « sûr » seulement quand elle est nette dans le bon sens
    //   (reverse Massko : 0,96, comme une normale) → sinon « à vérifier », et la version se corrige avant l'enregistrement.
    const rest = base.filter((k) => k !== 'reverse');
    if (base.length > 1 && base.includes('reverse')) {
      pickBase = rest.includes('normal') ? 'normal' : rest[0] || null;
      if (O) {
        // reverse = le fond (zone du texte) brille, pas l'illustration : on compare au visuel officiel
        const f = (Q, x0, x1, y0, y1) => { const r = foilIn(Q, x0, x1, y0, y1); return r ? r.grain + r.satVar * 40 : null; };
        const tP = f(P, 0.08, 0.92, 0.6, 0.86), aP = f(P, 0.12, 0.88, 0.14, 0.44), tO = f(O, 0.08, 0.92, 0.6, 0.86), aO = f(O, 0.12, 0.88, 0.14, 0.44);
        if (tP && aP && tO && aO) {
          const ratio = (tP / tO) / (aP / aO);
          info.reverseRatio = Math.round(ratio * 100) / 100;
          if (ratio >= 1.7) { pickBase = 'reverse'; sure.base = ratio >= 2.2; }
          else if (rest.includes('holo') && rest.includes('normal')) {
            const hr = (aP / aO) / (tP / tO);
            info.holoRatio = Math.round(hr * 100) / 100;
            pickBase = hr >= 1.4 ? 'holo' : 'normal'; sure.base = hr >= 1.9;
          } else sure.base = false;
        }
      }
    } else if (base.length > 1 && base.includes('holo') && base.includes('normal') && O) {
      // holo ou normale ? holo = l'ILLUSTRATION brille (reflets, grain), pas le texte : même mesure que la reverse,
      // zones inversées, toujours comparée au visuel officiel (qui ne brille pas)
      const f = (Q, x0, x1, y0, y1) => { const r = foilIn(Q, x0, x1, y0, y1); return r ? r.grain + r.satVar * 40 : null; };
      const tP = f(P, 0.08, 0.92, 0.6, 0.86), aP = f(P, 0.12, 0.88, 0.14, 0.44), tO = f(O, 0.08, 0.92, 0.6, 0.86), aO = f(O, 0.12, 0.88, 0.14, 0.44);
      if (tP && aP && tO && aO) {
        const ratio = (aP / aO) / (tP / tO);
        info.holoRatio = Math.round(ratio * 100) / 100;
        pickBase = ratio >= 1.4 ? 'holo' : 'normal'; sure.base = ratio >= 1.9;
      } else pickBase = 'normal';
    } else if (base.length > 1) pickBase = base.includes('normal') ? 'normal' : base[0];
    if (pickBase) list.push(pickBase);
    if (v.firstEdition) {
      const st = firstEditionStamp(P);
      // le même endroit sur le visuel officiel (qui n'a pas le logo) ne doit pas lui ressembler
      const so = O && st ? firstEditionStamp(O, st.side === 'gauche' ? [0, 0.3] : [0.7, 1]) : null;
      info.stamp = st; info.stampOfficial = so;
      const ok = st && st.score >= 0.86 && (!so || so.score < 0.75 || Math.abs(so.y - st.y) > 0.03);
      if (ok) { list.push('firstEdition'); sure.firstEdition = st.score >= 0.9; }
    }
    return { list, sure, info };
  }

  Object.assign(App.recognizerParts, { STAMP, stampTemplate, firstEditionStamp, foilIn, detectVariants });
})();
