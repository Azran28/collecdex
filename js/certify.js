/*
 * Certification d'une carte : preuve que la photo vient d'une capture EN DIRECT d'une vraie carte.
 *
 * Au moment de la photo (caméra du site uniquement, jamais depuis la galerie) :
 *   1. le serveur donne un défi à usage unique (« retourne ») ;
 *   2. « dos d'abord » : on montre le DOS de la carte dans le cadre, on la retourne, on la tient immobile
 *      et la photo se prend toute seule. Le site vérifie : dos reconnu, puis un vrai retournement
 *      (au moins une image « entre deux », carte de profil : un écran ou une photo qu'on change d'un coup
 *      passe directement du dos à la face). Il faut avoir la carte en main.
 *   3. il vérifie que l'image « vit » (une image injectée est figée) ;
 *   4. il cherche les motifs typiques d'un écran filmé (grille de pixels, moiré) ;
 *   5. une bande de 3 petites images (dos, retournement, face) est envoyée avec la photo (preuve consultable) ;
 *   6. le serveur vérifie le défi (usage unique, 15 min), que la photo et la bande ont été envoyées après
 *      le défi, et que la photo n'a jamais servi ailleurs, puis pose le badge.
 * Pas de badge pour une page de classeur (on ne peut pas retourner 9 cartes) : on recapture la carte seule.
 * Si une étape échoue, la carte peut quand même être ajoutée, sans badge.
 */
App.certify = (() => {

  // ---------- Analyses (fonctions pures, testables) ----------

  /** Niveaux de gris d'une zone d'une source (vidéo, image, canvas) */
  function grayOf(src, sx, sy, sw, sh, w, h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(src, sx, sy, sw, sh, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data, out = new Float32Array(w * h);
    for (let i = 0; i < out.length; i++) out[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    return out;
  }

  /**
   * Mouvement de la carte entre deux images : zoom s et décalage (dx, dy) en fraction de la largeur.
   * Recherche exhaustive du meilleur recalage (l'image B ≈ image A zoomée et décalée).
   */
  function motion(A, B, w, h) {
    const half = (X, W, H) => {
      const w2 = W >> 1, h2 = H >> 1, o = new Float32Array(w2 * h2);
      for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) { const i = 2 * y * W + 2 * x; o[y * w2 + x] = (X[i] + X[i + 1] + X[i + W] + X[i + W + 1]) / 4; }
      return o;
    };
    const center = (X) => { let m = 0; for (let i = 0; i < X.length; i++) m += X[i]; m /= X.length; const o = new Float32Array(X.length); for (let i = 0; i < X.length; i++) o[i] = X[i] - m; return o; };
    // écart moyen entre B et A transformée (B ≈ A zoomée de s autour du centre puis décalée de dx, dy)
    const errOf = (A, B, W, H, s, dx, dy, step) => {
      const cx = W / 2, cy = H / 2, inv = 1 / s;
      let e = 0, n = 0;
      for (let y = 1; y < H - 1; y += step) {
        const ay = ((y - cy - dy) * inv + cy + 0.5) | 0;
        if (ay < 0 || ay >= H) continue;
        const row = ay * W, brow = y * W;
        for (let x = 1; x < W - 1; x += step) {
          const ax = ((x - cx - dx) * inv + cx + 0.5) | 0;
          if (ax < 0 || ax >= W) continue;
          const d = B[brow + x] - A[row + ax]; e += d < 0 ? -d : d; n++;
        }
      }
      return n > (W * H) / (8 * step * step) ? e / n : Infinity;
    };
    const Ac = center(A), Bc = center(B);
    const a2 = half(Ac, w, h), b2 = half(Bc, w, h), w2 = w >> 1, h2 = h >> 1;
    // 1) recherche grossière sur l'image réduite
    const e0 = errOf(Ac, Bc, w, h, 1, 0, 0, 1);
    let best = { s: 1, dx: 0, dy: 0, e: errOf(a2, b2, w2, h2, 1, 0, 0, 1) };
    const R = Math.round(w2 * 0.32);
    for (let s = 0.7; s <= 1.46; s += 0.04) for (let dy = -R; dy <= R; dy += 2) for (let dx = -R; dx <= R; dx += 2) {
      const e = errOf(a2, b2, w2, h2, s, dx, dy, 1);
      if (e < best.e) best = { s, dx, dy, e };
    }
    // 2) affinage en pleine taille
    const c = { s: best.s, dx: best.dx * 2, dy: best.dy * 2 };
    best = { ...c, e: errOf(Ac, Bc, w, h, c.s, c.dx, c.dy, 1) };
    for (let s = c.s - 0.04; s <= c.s + 0.041; s += 0.01) for (let dy = c.dy - 3; dy <= c.dy + 3; dy++) for (let dx = c.dx - 3; dx <= c.dx + 3; dx++) {
      const e = errOf(Ac, Bc, w, h, s, dx, dy, 1); if (e < best.e) best = { s, dx, dy, e };
    }
    let contrast = 0; for (let i = 0; i < Ac.length; i++) contrast += Math.abs(Ac[i]); contrast /= Ac.length;
    return { s: best.s, dx: best.dx / w, dy: best.dy / h, fit: best.e / (e0 || 1), rel: best.e / (contrast || 1) };
  }

  /** Images identiques d'affilée = flux figé (image injectée, pas une vraie caméra) */
  function frozenPairs(frames) {
    let n = 0;
    for (let i = 1; i < frames.length; i++) {
      const A = frames[i - 1], B = frames[i]; let d = 0;
      for (let j = 0; j < A.length; j++) d += Math.abs(A[j] - B[j]);
      if (d / A.length < 0.02) n++; // strictement identiques (même le bruit du capteur)
    }
    return n;
  }

  // FFT 1D en place (taille puissance de 2)
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit;
      if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < len / 2; k++) {
          const ur = re[i + k], ui = im[i + k];
          const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
          re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
          const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
        }
      }
    }
  }

  /**
   * Motif d'écran : un écran filmé laisse des pics très nets dans le spectre (grille de pixels, moiré),
   * alors qu'une carte imprimée a un spectre « doux ». Renvoie le pic le plus marqué (rapport à la médiane de son anneau).
   */
  function screenScore(G, N = 256) {
    const re = new Float64Array(N * N), im = new Float64Array(N * N);
    let m = 0; for (let i = 0; i < N * N; i++) m += G[i]; m /= N * N;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const wgt = (0.5 - 0.5 * Math.cos(2 * Math.PI * x / (N - 1))) * (0.5 - 0.5 * Math.cos(2 * Math.PI * y / (N - 1)));
      re[y * N + x] = (G[y * N + x] - m) * wgt;
    }
    const rr = new Float64Array(N), ri = new Float64Array(N);
    for (let y = 0; y < N; y++) { for (let x = 0; x < N; x++) { rr[x] = re[y * N + x]; ri[x] = im[y * N + x]; } fft(rr, ri); for (let x = 0; x < N; x++) { re[y * N + x] = rr[x]; im[y * N + x] = ri[x]; } }
    for (let x = 0; x < N; x++) { for (let y = 0; y < N; y++) { rr[y] = re[y * N + x]; ri[y] = im[y * N + x]; } fft(rr, ri); for (let y = 0; y < N; y++) { re[y * N + x] = rr[y]; im[y * N + x] = ri[y]; } }
    const H = N / 2, rings = Array.from({ length: H }, () => []), pts = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < H; x++) {
      const fy = y < H ? y : y - N, fx = x;
      if (Math.abs(fx) <= 2 || Math.abs(fy) <= 2) continue; // les bords de la carte font des traits sur les axes
      const r = Math.round(Math.hypot(fx, fy)); if (r < 10 || r >= H) continue;
      const mag = Math.hypot(re[y * N + x], im[y * N + x]);
      rings[r].push(mag); pts.push([r, mag]);
    }
    const med = rings.map((a) => { if (!a.length) return 0; const s = [...a].sort((p, q) => p - q); return s[s.length >> 1]; });
    let peak = 0, strong = 0;
    for (const [r, mag] of pts) { const q = mag / (med[r] || 1); if (q > peak) peak = q; if (q > 12) strong++; }
    return { peak: Math.round(peak * 10) / 10, strong };
  }

  /** Empreinte 64 bits (dHash) de l'image entière, pour repérer une image réutilisée */
  function dhash(G9x8) {
    let hex = '';
    for (let y = 0; y < 8; y++) {
      let byte = 0;
      for (let x = 0; x < 8; x++) byte = (byte << 1) | (G9x8[y * 9 + x] > G9x8[y * 9 + x + 1] ? 1 : 0);
      hex += byte.toString(16).padStart(2, '0');
    }
    return hex;
  }

  /** Ressemblance (corrélation normalisée, petit décalage permis) entre deux petites images grises : 1 = identiques */
  function corr(A, B, w, h, R = 2) {
    let best = -1;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      let sa = 0, sb = 0, n = 0;
      for (let y = R; y < h - R; y++) for (let x = R; x < w - R; x++) { sa += A[y * w + x]; sb += B[(y + dy) * w + x + dx]; n++; }
      const ma = sa / n, mb = sb / n;
      let num = 0, da = 0, db = 0;
      for (let y = R; y < h - R; y++) for (let x = R; x < w - R; x++) {
        const a = A[y * w + x] - ma, b = B[(y + dy) * w + x + dx] - mb;
        num += a * b; da += a * a; db += b * b;
      }
      const c = num / (Math.sqrt(da * db) || 1);
      if (c > best) best = c;
    }
    return best;
  }

  // Seuils (à affiner avec les vraies captures : les mesures sont enregistrées avec chaque certification)
  const SCREEN_PEAK = 40;
  const BACK_T = 0.55, FRONT_T = 0.5; // dos : 0,71 à 0,95 mesurés ; faces jusqu'à 0,49

  /**
   * Retournement réussi ? Analyse faite au moment de la photo, sur les images filmées depuis le dos.
   * frames : [{ b (ressemblance avec un dos), g (petite image grise) }] ; la dernière = la face photographiée.
   * On part du dernier dos vu (2 images de suite), puis chaque image suivante est classée :
   * F (ressemble déjà à la face photographiée), B (dos), X (entre deux : carte de profil, floue, main…).
   * L'image qui suit immédiatement le dos doit être « entre deux » (X) : un vrai geste prend du temps,
   * alors qu'une image changée d'un coup sur un écran passe directement du dos à la face.
   * Ce qui se passe ensuite (recadrage, hésitation) ne compte pas : on peut prendre son temps.
   */
  function judgeFlip(frames, w, h) {
    let lb = -1;
    for (let i = frames.length - 1; i > 0; i--) if (frames[i].b >= BACK_T && frames[i - 1].b >= BACK_T) { lb = i; break; }
    if (lb < 0) return { passed: false, why: 'le dos de la carte n’a pas été vu' };
    const last = frames[frames.length - 1];
    if (lb === frames.length - 1 || last.b >= BACK_T) return { passed: false, why: 'la photo montre le dos : retourne la carte avant d’appuyer', lb, states: '' };
    const face = last.g;
    const states = frames.slice(lb + 1).map((f) => (f.b >= BACK_T ? 'B' : corr(f.g, face, w, h) >= FRONT_T ? 'F' : 'X')).join('');
    const gap = (states.match(/^X*/) || [''])[0].length; // images « entre deux » juste après le dos
    if (gap < 1) return { passed: false, why: 'retournement trop brusque (image remplacée d’un coup ?)', gap, states: states.slice(0, 60), lb };
    // la photo doit montrer la face posée JUSTE APRÈS le retournement (pas une autre carte, ni la table si le
    // téléphone a bougé ensuite) : on prend les premières images stables après le geste, la photo doit leur
    // ressembler (décalage permis ±15 % : on peut recadrer un peu)
    const sd = (G) => { let m = 0; for (const v of G) m += v; m /= G.length; let s = 0; for (const v of G) s += (v - m) ** 2; return Math.sqrt(s / G.length); };
    const mad = (A, B) => { let d = 0; for (let i = 0; i < A.length; i++) d += Math.abs(A[i] - B[i]); return d / A.length; };
    const firsts = [];
    for (let i = lb + 2; i < frames.length - 1 && firsts.length < 3; i++) {
      const f = frames[i], s = sd(f.g);
      if (f.b < BACK_T && s >= 16 && mad(f.g, frames[i - 1].g) < 4 + s * 0.08) firsts.push(f);
    }
    const cont = firsts.some((f) => corr(f.g, face, w, h, 4) >= FRONT_T);
    if (!cont) return { passed: false, why: 'la photo ne montre pas la carte retournée (tiens-la dans le cadre au moment d’appuyer)', gap, states: states.slice(0, 60), lb };
    return { passed: true, gap, states: states.slice(0, 60), lb };
  }

  /*
   * Preuve du retournement « E » (v2.43, choisie avec le labo labo-certif.html : 85 % de vrais gestes certifiés,
   * 74 % de tricheries refusées, contre 80 % / 61 % pour judgeFlip). Pendant le geste (après le dernier dos),
   * au moins une image doit montrer la carte DE BIAIS : ses deux bords se rapprochent (silhouette), ou, entre
   * ses deux bords, le dos ou la face « écrasé(e) » plutôt qu'un morceau coupé. Un fondu, une image qui glisse
   * ou une main passée devant un écran ne donnent jamais ça. Images grises 48×66 (f.d).
   */
  const DW = 48, DH = 66, SIL_T = 1.8, SQ_T = 0.03;
  const sdOf = (G) => { let m = 0; for (const v of G) m += v; m /= G.length; let s = 0; for (const v of G) s += (v - m) ** 2; return Math.sqrt(s / G.length); };
  const madOf = (A, B) => { let d = 0; for (let i = 0; i < A.length; i++) d += Math.abs(A[i] - B[i]); return d / A.length; };
  /** Les deux bords les plus nets (un dans chaque moitié) le long d'un axe : largeur w, milieu m (fractions), netteté */
  function silhouette(F, axis) {
    const A = axis === 'v' ? DW : DH, B = axis === 'v' ? DH : DW, P = new Float32Array(A);
    for (let a = 1; a < A - 1; a++) {
      let s = 0;
      for (let b = 0; b < B; b++) { const i1 = axis === 'v' ? b * DW + a - 1 : (a - 1) * DW + b, i2 = axis === 'v' ? b * DW + a + 1 : (a + 1) * DW + b; s += Math.abs(F[i2] - F[i1]); }
      P[a] = s / B;
    }
    const h = A >> 1, med = [...P].sort((x, y) => x - y)[A >> 1] || 1;
    let L = 1, R = A - 2;
    for (let a = 2; a < h; a++) if (P[a] > P[L]) L = a;
    for (let a = h; a < A - 2; a++) if (P[a] > P[R]) R = a;
    return { w: (R - L) / A, m: (L + R) / 2 / A, sharp: Math.min(P[L], P[R]) / med };
  }
  /**
   * Ressemblance entre une bande de F (largeur s, centrée en off) et le modèle Tpl : écrasé dans la bande
   * (crop < 0, k = perspective), ou en taille réelle dont on ne voit que le début / la fin / la partie à cet endroit (crop 0/1/2)
   */
  function bandCorr(F, Tpl, axis, s, off, k, crop = -1) {
    const A = axis === 'v' ? DW : DH, B = axis === 'v' ? DH : DW;
    const len = Math.round(s * A), a0 = Math.round(A / 2 - len / 2 + off * A / 2);
    const t0 = crop === 1 ? A - len : crop === 2 ? a0 : 0;
    let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0, n = 0;
    for (let j = 0; j < len; j++) {
      const a = a0 + j; if (a < 1 || a >= A - 1) continue;
      const ta = crop >= 0 ? Math.min(A - 1, Math.max(0, t0 + j)) : Math.min(A - 1, ((j + 0.5) / len * A) | 0);
      const vs = crop >= 0 ? 1 : Math.max(0.6, 1 + k * ((j + 0.5) / len * 2 - 1));
      const bl = Math.round(B * vs), b0 = Math.round((B - bl) / 2);
      for (let q = 1; q < bl - 1; q++) {
        const bp = b0 + q; if (bp < 0 || bp >= B) continue;
        const tb = Math.min(B - 1, ((q + 0.5) / bl * B) | 0);
        const fv = axis === 'v' ? F[bp * DW + a] : F[a * DW + bp], tv = axis === 'v' ? Tpl[tb * DW + ta] : Tpl[ta * DW + tb];
        sa += fv; sb += tv; saa += fv * fv; sbb += tv * tv; sab += fv * tv; n++;
      }
    }
    if (n < 40) return -1;
    const va = saa - sa * sa / n, vb = sbb - sb * sb / n;
    if (va < n * 25 || vb < n * 25) return -1;
    return (sab - sa * sb / n) / Math.sqrt(va * vb);
  }
  function judgeE(frames, w = 24, h = 33) {
    let lb = -1;
    for (let i = frames.length - 1; i > 0; i--) if (frames[i].b >= BACK_T && frames[i - 1].b >= BACK_T) { lb = i; break; }
    if (lb < 0) return { passed: false, why: 'le dos de la carte n’a pas été vu' };
    const last = frames[frames.length - 1];
    if (lb === frames.length - 1 || last.b >= BACK_T) return { passed: false, why: 'la photo montre le dos : retourne la carte avant d’appuyer', lb, states: '' };
    const face = last.g;
    const states = frames.slice(lb + 1).map((f) => (f.b >= BACK_T ? 'B' : corr(f.g, face, w, h) >= FRONT_T ? 'F' : 'X')).join('');
    const gap = (states.match(/^X*/) || [''])[0].length, fF = states.indexOf('F');
    const end = Math.min(frames.length - 2, lb + 1 + (fF < 0 ? states.length : fF) + 3, lb + 30);
    // preuve : silhouette de biais, sinon carte écrasée entre ses bords
    let sil = 0, sq = -9;
    for (let i = lb + 1; i <= end; i++) for (const axis of ['v', 'h']) {
      const s = silhouette(frames[i].d, axis);
      if (s.w >= 0.15 && s.w <= 0.7 && Math.abs(s.m - 0.5) <= 0.3) sil = Math.max(sil, s.sharp);
    }
    if (sil < SIL_T) {
      const tpls = [frames[lb].d, last.d];
      for (let i = lb + 1; i <= end; i++) for (const axis of ['v', 'h']) {
        const F = frames[i].d, s = silhouette(F, axis);
        if (!(s.w >= 0.15 && s.w <= 0.75 && Math.abs(s.m - 0.5) <= 0.35)) continue;
        const off = (s.m - 0.5) * 2;
        for (const Tpl of tpls) {
          let a = -1, c = -1;
          for (const ds of [-0.05, 0, 0.05]) {
            for (const k of [0, -0.2, 0.2, -0.35, 0.35]) a = Math.max(a, bandCorr(F, Tpl, axis, s.w + ds, off, k));
            for (const cm of [0, 1, 2]) c = Math.max(c, bandCorr(F, Tpl, axis, s.w + ds, off, 0, cm));
          }
          sq = Math.max(sq, a - Math.max(c, 0));
        }
      }
    }
    const r2 = (v) => Math.round(v * 100) / 100, ev = { sil: r2(sil), sq: r2(sq) };
    if (sil < SIL_T && sq < SQ_T) return { passed: false, why: 'retournement pas reconnu (la carte doit être vue de biais pendant le geste)', gap, states: states.slice(0, 60), lb, ev };
    // continuité : la photo montre la carte vue juste après le geste (pas une autre carte, pas la table) ;
    // si les mains tremblent (aucune image immobile), les 3 images les plus calmes de la demi-seconde qui suit
    const firsts = [];
    for (let i = lb + 2; i < frames.length - 1 && firsts.length < 3; i++) {
      const f = frames[i], s = sdOf(f.g);
      if (f.b < BACK_T && s >= 16 && madOf(f.g, frames[i - 1].g) < 4 + s * 0.08) firsts.push(f);
    }
    let cont = firsts.some((f) => corr(f.g, face, w, h, 4) >= FRONT_T);
    if (!cont && !firsts.length && fF >= 0) {
      const cand = [], i0 = lb + 1 + fF;
      for (let i = Math.max(i0, 1); i < frames.length - 1 && frames[i].t - frames[i0].t <= 500; i++) if (frames[i].b < BACK_T && sdOf(frames[i].g) >= 12) cand.push([madOf(frames[i].g, frames[i - 1].g), i]);
      cand.sort((x, y) => x[0] - y[0]);
      cont = cand.slice(0, 3).some(([, i]) => corr(frames[i].g, face, w, h, 4) >= FRONT_T);
    }
    if (!cont) return { passed: false, why: 'la photo ne montre pas la carte retournée (tiens-la dans le cadre au moment d’appuyer)', gap, states: states.slice(0, 60), lb, ev };
    return { passed: true, gap, states: states.slice(0, 60), lb, ev };
  }

  /*
   * Lampe qui clignote selon un code (principe de « Flashmark » d'iProov) : une vraie carte ou page toute proche
   * renvoie la lumière de la lampe au bon moment ; un écran émet sa propre lumière (à peine plus clair), une vidéo
   * préparée ou un flux injecté ne connaissent pas le code. Seulement quand le navigateur sait allumer la lampe
   * (Chrome Android ; pas l'iPhone) : sinon on s'en passe. Labo : la lampe ne refuse aucun vrai geste, et les
   * tricheries refusées passent de 74 % à 87 %.
   */
  const SLOT = 350; // tranches de 0,35 s (v2.44 ; 0,25 s en v2.43 : trop court pour certaines caméras)
  function torchOf(video) {
    try {
      const tr = video && video.srcObject && video.srcObject.getVideoTracks()[0];
      const cap = tr && tr.getCapabilities ? tr.getCapabilities() : null;
      return cap && cap.torch ? tr : null;
    } catch (e) { return null; }
  }
  function newCode() { // 6 tranches, 2 à 4 allumées, en au moins 2 éclairs (≥ 4 changements à mesurer)
    for (;;) {
      const b = Array.from(crypto.getRandomValues(new Uint8Array(6)), (x) => x & 1), s = b.reduce((a, x) => a + x, 0);
      const pulses = b.filter((x, i) => x && !b[i - 1]).length;
      if (s >= 2 && s <= 4 && pulses >= 2) return b;
    }
  }
  /** Joue le code avec la lampe ; renvoie { bits, ev: [{ t, on }], t0, end } (ev = instants réels d'allumage/extinction) */
  async function playCode(tr) {
    const bits = newCode(), ev = [], t0 = Date.now(), set = (on) => tr.applyConstraints({ advanced: [{ torch: on }] });
    try {
      for (let i = 0; i < bits.length; i++) {
        if (i === 0 || bits[i] !== bits[i - 1]) { await set(!!bits[i]); ev.push({ t: Date.now(), on: !!bits[i] }); }
        const wait = t0 + (i + 1) * SLOT - Date.now(); if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      }
      await set(false); ev.push({ t: Date.now(), on: false });
      return { bits, ev, t0, end: Date.now() };
    } catch (e) {
      try { await set(false); } catch (e2) { /* */ }
      return { bits, ev, t0, end: Date.now(), error: String(e && e.message || e) };
    }
  }
  /**
   * La luminosité (échantillons { t, v }) suit-elle le code ? Deux mesures, retard d'image de la caméra 0 à 1 s :
   * - niveau : corrélation entre luminosité et lampe allumée / éteinte, et hausse relative (amp) ;
   * - changements (v2.44, après le 1er essai d'Arnaud refusé) : à chaque allumage la luminosité doit monter, à chaque
   *   extinction baisser, juste après le changement. Ça marche même quand la caméra corrige vite sa luminosité
   *   (exposition automatique), qui efface la différence de niveau au bout d'un moment.
   */
  function flashFit(samples, code) {
    const s = samples.filter((x) => x.t >= code.t0 && x.t <= code.end + 1100);
    let best = { corr: -1, amp: 0, lag: 0, n: s.length, edges: 0, edgesOk: 0, jump: 0, lagE: 0, score: -9 }, bestE = { e: -1 };
    if (s.length < 8) return best;
    const W = SLOT * 0.7, mean = (a) => a.reduce((x, y) => x + y.v, 0) / a.length;
    // vrais changements (le premier « éteint » ne change rien : la lampe l'était déjà)
    const tr = []; let st = false; for (const e of code.ev) { if (e.on !== st) tr.push(e); st = e.on; }
    for (let lag = 0; lag <= 1000; lag += 25) {
      const on = s.map(({ t }) => { let v = 0; for (const e of code.ev) if (e.t <= t - lag) v = e.on ? 1 : 0; return v; });
      const n1 = on.reduce((a, x) => a + x, 0);
      let c = -1, amp = 0;
      if (n1 >= 2 && n1 <= on.length - 2) {
        let m1 = 0, m0 = 0; on.forEach((x, k) => { if (x) m1 += s[k].v; else m0 += s[k].v; }); m1 /= n1; m0 /= on.length - n1;
        const mm = mean(s), om = n1 / on.length;
        let num = 0, da = 0, db = 0; s.forEach((x, k) => { num += (x.v - mm) * (on[k] - om); da += (x.v - mm) ** 2; db += (on[k] - om) ** 2; });
        c = num / (Math.sqrt(da * db) || 1); amp = (m1 - m0) / (m0 || 1);
      }
      let edges = 0, edgesOk = 0, jump = 0;
      for (const e of tr) {
        const at = e.t + lag, bf = s.filter((x) => x.t >= at - W && x.t < at), af = s.filter((x) => x.t >= at && x.t < at + W);
        if (!bf.length || !af.length) continue;
        const b = mean(bf), d = (mean(af) - b) / (b || 1), signed = e.on ? d : -d;
        edges++; jump += signed; if (signed >= 0.02) edgesOk++;
      }
      if (edges) jump /= edges;
      const eScore = edges >= 3 ? edgesOk / edges + jump : -1; // chaque mesure garde son meilleur retard
      if (eScore > bestE.e) bestE = { e: eScore, edges, edgesOk, jump, lagE: lag };
      if (c > best.corr) best = { ...best, corr: c, amp, lag };
    }
    if (bestE.e > -1) Object.assign(best, { edges: bestE.edges, edgesOk: bestE.edgesOk, jump: bestE.jump, lagE: bestE.lagE });
    best.score = Math.max(best.corr, bestE.e - 1.2);
    return best;
  }
  /** Lampe vue ? (carte : ampT 6 %, jumpT 3 % ; case de classeur : 4 % et 2,5 %) */
  const flashOk = (f, ampT, jumpT) => (f.corr >= 0.75 && f.amp >= ampT) || (f.edges >= 3 && f.edgesOk / f.edges >= 0.8 && f.jump >= jumpT);
  const flashTxt = (f) => `mesures : accord ${Math.max(0, f.corr).toFixed(2).replace('.', ',')}, ${f.amp >= 0 ? '+' : ''}${Math.round(f.amp * 100)} %, changements ${f.edgesOk}/${f.edges} (${Math.round(f.jump * 100)} %), retard ${(f.lag / 1000).toFixed(2).replace('.', ',')} s, ${f.n} images`;
  const median = (G) => { const s = Array.from(G).sort((a, b) => a - b); return s[s.length >> 1]; };

  // ---------- Liaison avec le serveur ----------
  const challenges = {}; // par type de capture ('carte' | 'page') : { id, challenge, at }
  const certs = new Map(); // photoId → { key, at }
  const listeners = new Set();
  const emit = () => listeners.forEach((f) => { try { f(); } catch (e) { console.error(e); } });

  const available = () => !!(App.cloud.enabled && App.cloud.user);

  async function prepare(kind = 'carte', n = 9) {
    if (!available()) return null;
    const c = challenges[kind];
    if (kind === 'carte' && c && Date.now() - c.at < 8 * 60 * 1000) return c;
    try {
      // page de classeur : un tirage neuf à chaque fois (le numéro dépend du nombre de cases)
      const d = await App.cloud.rpc('cert_start', kind === 'page' ? { p_kind: 'page', p_n: n } : { p_kind: kind });
      challenges[kind] = { id: d.id, challenge: d.challenge, at: Date.now() };
    } catch (e) { console.warn('certification', e); challenges[kind] = null; }
    return challenges[kind];
  }

  /**
   * Certification d'une PAGE de classeur : le serveur tire au sort une case ; on TOUCHE cette carte du bout
   * du doigt, puis on retire la main (une main tient le téléphone : geste simple et court).
   * On filme : seule cette case doit changer nettement (les autres restent pareilles : ce n'est pas le
   * téléphone qui bouge), puis revenir comme avant. Une vidéo préparée ne connaît pas le numéro.
   * (Essayé d'abord : faire glisser la carte hors de sa pochette — trop instable d'une seule main.)
   * cells : quadrilatères des pochettes (fractions de l'image vidéo). host : l'élément de la vidéo.
   */
  async function livePage(video, host, cells) {
    const ch = await prepare('page', cells.length);
    challenges.page = null;
    if (!ch) return { passed: false, reasons: [available() ? 'serveur de certification injoignable (supabase-v8.sql ?)' : 'connecte-toi pour certifier'] };
    const m = /^case-(\d+)$/.exec(ch.challenge || '');
    if (!m) return { passed: false, reasons: ['serveur de certification pas à jour (supabase-v8.sql)'] };
    const target = Math.min(cells.length, +m[1]) - 1;
    livePage.trace = [];
    const W = video.videoWidth, H = video.videoHeight;
    // cases (un peu rétrécies : on regarde la carte, pas les bords de la pochette)
    const boxes = cells.map((q) => {
      const xs = q.map((p) => p[0] * W), ys = q.map((p) => p[1] * H);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      return { x: x0 + (x1 - x0) * 0.12, y: y0 + (y1 - y0) * 0.12, w: (x1 - x0) * 0.76, h: (y1 - y0) * 0.76 };
    });
    const grab = () => boxes.map((b) => grayOf(video, b.x, b.y, b.w, b.h, 16, 22));
    const mad = (A, B) => { let d = 0; for (let i = 0; i < A.length; i++) d += Math.abs(A[i] - B[i]); return d / A.length; };
    const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
    // consigne : la case tirée au sort s'allume
    const ov = document.createElement('div');
    ov.className = 'page-cert';
    const poly = (q) => q.map(([x, y]) => `${(x * 100).toFixed(2)},${(y * 100).toFixed(2)}`).join(' ');
    const tq = cells[target], tx = (tq[0][0] + tq[1][0] + tq[2][0] + tq[3][0]) / 4 * 100, ty = (tq[0][1] + tq[1][1] + tq[2][1] + tq[3][1]) / 4 * 100;
    ov.innerHTML = `<svg viewBox="0 0 100 100" preserveAspectRatio="none">${cells.map((q, i) => `<polygon points="${poly(q)}" class="${i === target ? 'tgt' : ''}"/>`).join('')}</svg>
      <div class="pc-num" style="left:${tx}%;top:${ty}%">${target + 1}</div>
      <div class="pc-txt">Prépare-toi…</div><div class="cert-bar"><span></span></div>`;
    host.appendChild(ov);
    const txt = ov.querySelector('.pc-txt'), bar = ov.querySelector('.cert-bar span');
    // lampe (si le téléphone sait l'allumer), AVANT le geste : chaque case doit renvoyer la lumière au rythme du code.
    // Labo : pièce peu éclairée ou éclairée, 97 à 100 % des vraies pages ; photo de la page sur un écran refusée
    // à 83–100 % ; en plein jour la lampe ne se voit plus (17 %) → message « à l'intérieur ».
    let pageFlash = null;
    const tr = torchOf(video);
    if (tr) {
      txt.innerHTML = '💡 Ne bouge pas : la lampe clignote…';
      const samples = cells.map(() => []), sample = () => { const t = Date.now(); grab().forEach((g, i) => samples[i].push({ t, v: median(g) })); };
      let playing = true;
      const codeP = playCode(tr).then((c) => { playing = false; return c; });
      while (playing) { sample(); await new Promise((r) => setTimeout(r, 90)); }
      const code = await codeP;
      for (const stop = Date.now() + 1100; Date.now() < stop;) { sample(); await new Promise((r) => setTimeout(r, 90)); } // retard de la caméra
      if (code.error) pageFlash = { used: false, error: code.error };
      else {
        const fits = samples.map((s) => flashFit(s, code)), good = fits.filter((x) => flashOk(x, 0.04, 0.025)).length;
        const mid = [...fits].sort((a, b) => b.score - a.score)[Math.floor(fits.length / 2)];
        pageFlash = { used: true, ok: good >= Math.ceil(cells.length * 0.55), good, cells: cells.length, amp: Math.round(median(fits.map((x) => x.amp)) * 1000) / 1000, txt: `${good}/${cells.length} cases ; case moyenne : ${flashTxt(mid)}` };
      }
      if (pageFlash.used && !pageFlash.ok) {
        ov.remove();
        return { passed: false, reasons: [`la lampe n’a pas été vue sur la page (trop de lumière : soleil, fenêtre ? ou un écran ?) — réessaie à l’intérieur (${pageFlash.txt})`], id: ch.id, challenge: ch.challenge, strip: null, scores: { passed: false, challenge: ch.challenge, kind: 'page', cells: cells.length, flash: pageFlash } };
      }
      txt.innerHTML = '✓ Lampe vue — attends…'; // la consigne du geste vient après l’image de départ
    }
    // image de référence (moyenne de 2 images) et bande-preuve (la case avant, sortie, remise)
    const SW = 72, SH = 100, strip = Object.assign(document.createElement('canvas'), { width: SW * 3, height: SH }), sg = strip.getContext('2d');
    const tb = boxes[target], keep = (slot) => sg.drawImage(video, tb.x, tb.y, tb.w, tb.h, slot * SW, 0, SW, SH);
    await new Promise((r) => setTimeout(r, 150));
    let base = grab(); keep(0);
    const hash = dhash(grayOf(video, 0, 0, W, H, 9, 8));
    let phase = 'sortir', streak = 0, peak = 0, othersAtPeak = 0, moved = 0, frozen = 0, prevT = null;
    const t0 = Date.now(), LIMIT = 15000;
    while (Date.now() - t0 < LIMIT) {
      await new Promise((r) => setTimeout(r, 100));
      const cur = grab();
      const diffs = cur.map((g, i) => mad(g, base[i]));
      const tgt = diffs[target], others = med(diffs.filter((_, i) => i !== target));
      (livePage.trace = livePage.trace || []).push([Math.round(tgt), Math.round(others), phase[0]]); // mesures (réglages)
      if (prevT && mad(cur[target], prevT) === 0) frozen++; // images strictement identiques = image injectée (une vraie caméra a toujours un peu de bruit)
      prevT = cur[target];
      if (others > 16) { // tout bouge : c'est le téléphone, pas la carte (avant le geste : on repart de l'image actuelle)
        moved++; txt.innerHTML = 'Tiens le téléphone immobile…'; if (phase === 'sortir') base = cur; streak = 0; continue;
      }
      if (phase === 'sortir') {
        txt.innerHTML = `☝ Touche la carte <b>${target + 1}</b> du bout du doigt`;
        // le doigt (et sa main) couvre la case tirée au sort, pas les autres
        if (tgt >= 10 && tgt >= others * 3 + 4) { if (++streak >= 2) { phase = 'remettre'; streak = 0; peak = tgt; othersAtPeak = others; keep(1); txt.innerHTML = '✓ Retire ta main'; ov.classList.add('out'); } }
        else streak = 0;
      } else {
        if (tgt > peak) { peak = tgt; othersAtPeak = others; }
        // main retirée : la case revient au niveau de « bruit » des autres cases
        if (tgt <= Math.max(6, others * 2 + 4, peak * 0.4)) { if (++streak >= 2) { keep(2); break; } } else streak = 0;
      }
      bar.style.width = Math.min(100, Math.round(((Date.now() - t0) / LIMIT) * 100)) + '%';
    }
    ov.remove();
    const done = phase === 'remettre' && streak >= 2;
    const reasons = [];
    if (phase === 'sortir') reasons.push(`la carte ${target + 1} n’a pas été touchée (ou le téléphone a trop bougé)`);
    else if (!done) reasons.push('la main n’a pas été retirée de la page');
    if (frozen >= 25) reasons.push('image figée (ce n’est pas une caméra en direct)');
    const passed = reasons.length === 0;
    const r2 = (v) => Math.round(v * 10) / 10;
    return {
      passed, reasons, id: ch.id, challenge: ch.challenge, dhash: hash,
      strip: passed ? await new Promise((res) => strip.toBlob(res, 'image/jpeg', 0.8)) : null,
      scores: { passed, challenge: ch.challenge, kind: 'page', cells: cells.length, page: { peak: r2(peak), others: r2(othersAtPeak), moved, frozen, ms: Date.now() - t0 }, flash: pageFlash },
    };
  }

  /** Consignes affichées sur la vidéo selon l'étape */
  const HINTS = {
    attente: '<b>1.</b> Montre le <b>dos</b> de la carte dans le cadre',
    lampe: '💡 Garde le <b>dos</b> immobile : la lampe clignote…',
    dos: '<b>2.</b> Retourne-la (prends ton temps)',
    retourne: '<b>3.</b> Cadre la face, puis appuie sur <b>Prendre la photo</b>',
    pret: '📸',
  };
  const WINDOW = 15000; // après le dos, on a 15 s pour retourner la carte et prendre la photo

  /**
   * Certification « dos d'abord » : on suit la zone du cadre en continu. On montre le dos, on retourne
   * la carte, puis on prend la photo (bouton) ; en rafale (auto), la photo se prend toute seule
   * quand la face reste immobile ~0,6 s.
   * step() à chaque image (~90 ms) → 'attente' | 'dos' | 'retourne' | 'pret' (seulement en auto).
   * Au moment de la photo, proof() donne le résultat à envoyer au serveur.
   * regionFn() : zone du cadre dans la vidéo { sx, sy, sw, sh }.
   */
  function tracker(video, regionFn, { auto = false } = {}) {
    const GW = 24, GH = 33, SW = 72, SH = 100;
    const cv = Object.assign(document.createElement('canvas'), { width: SW, height: SH });
    const cg = cv.getContext('2d', { willReadFrequently: true });
    let frames = [], phase = 'attente', lastBack = 0, stable = 0, prev = null, sinceBack = 99;
    // lampe : carte seule → le code est joué pendant qu'on montre le dos ; rafale → pendant que la face est tenue
    // immobile, juste avant la photo automatique. lamp : { state: 'idle' | 'play' | 'done', code }
    let torch, lamp = { state: 'idle', code: null };
    const reset = () => { frames = []; phase = 'attente'; stable = 0; prev = null; sinceBack = 99; lamp = { state: 'idle', code: null }; };
    // la lampe joue son code, puis 0,65 s de plus : la caméra montre l'image avec un retard (jusqu'à 0,6 s)
    const lampBusy = (now) => lamp.state === 'play' || (lamp.state === 'done' && now - lamp.code.end < 1100);
    function startLamp() {
      if (torch === undefined) torch = torchOf(video);
      if (!torch || lamp.state !== 'idle') return false;
      const L = lamp = { state: 'play', code: null };
      playCode(torch).then((c) => { if (lamp !== L) return; L.code = c; L.state = c.error ? 'error' : 'done'; });
      return true;
    }
    function grab() {
      const r = regionFn();
      if (!r || !video || !video.videoWidth) return null;
      cg.drawImage(video, r.sx, r.sy, r.sw, r.sh, 0, 0, SW, SH);
      const b = App.recognizer.backScoreOf(cv, SW, SH);
      const g = grayOf(cv, 0, 0, SW, SH, GW, GH), d = grayOf(cv, 0, 0, SW, SH, DW, DH);
      sinceBack = b >= BACK_T ? 0 : sinceBack + 1;
      // petites images gardées seulement autour du dos (pour la bande-preuve) : c'est léger
      const f = { t: Date.now(), b, g, d, v: median(d), img: sinceBack < 12 ? cg.getImageData(0, 0, SW, SH) : null };
      frames.push(f);
      if (frames.length > 200) frames.shift();
      return f;
    }
    function step() {
      const f = grab(); if (!f) return phase;
      const { b, g, t: now } = f;
      let m = 0; for (const v of g) m += v; m /= g.length;
      let sd = 0; for (const v of g) sd += (v - m) ** 2; sd = Math.sqrt(sd / g.length);
      let diff = 99; if (prev) { diff = 0; for (let i = 0; i < g.length; i++) diff += Math.abs(g[i] - prev[i]); diff /= g.length; }
      prev = g;
      const n = frames.length;
      if (b >= BACK_T) {
        if (n > 1 && frames[n - 2].b >= BACK_T) { phase = 'dos'; lastBack = now; if (!auto) startLamp(); }
        stable = 0;
        return !auto && lampBusy(now) ? 'lampe' : phase;
      }
      if (phase === 'attente') return phase;
      if (now - lastBack > WINDOW) { reset(); return phase; } // dos vu il y a trop longtemps : on recommence
      if (!auto && lampBusy(now)) return 'lampe'; // retournée trop tôt : la preuve de la lampe ne comptera pas
      phase = 'retourne';
      if (auto) {
        // rafale : la face est posée (assez de détails) et immobile un bon moment → (lampe) → photo
        if (lampBusy(now)) return 'lampe';
        if (lamp.state === 'done' || lamp.state === 'error') { phase = 'pret'; return phase; }
        const still = sd >= 16 && diff < 4 + sd * 0.08;
        stable = still ? stable + 1 : 0;
        if (stable >= 6) { if (startLamp()) return 'lampe'; phase = 'pret'; }
      }
      return phase;
    }
    /** Résultat, au moment de la photo (le défi du serveur est consommé) */
    async function proof() {
      const ch = challenges.carte; challenges.carte = null; // usage unique
      if (!ch) return { passed: false, reasons: [available() ? 'serveur de certification injoignable' : 'connecte-toi pour certifier'] };
      if (ch.challenge !== 'retourne') return { passed: false, reasons: ['serveur de certification pas à jour (supabase-v7.sql)'] };
      grab(); // la dernière image = ce que montre la photo
      const j = judgeE(frames, GW, GH);
      // lampe : la carte a-t-elle renvoyé la lumière au rythme du code ? (au dos en carte seule, à la face en rafale)
      let flash = null;
      if (lamp.state === 'play') flash = { used: true, ok: false, why: auto ? 'photo prise pendant le clignotement de la lampe' : 'retourne la carte seulement quand la lampe a fini de clignoter' };
      else if (lamp.state === 'done') {
        const fit = flashFit(frames.map((x) => ({ t: x.t, v: x.v })), lamp.code);
        flash = { used: true, ok: flashOk(fit, 0.06, 0.03), corr: Math.round(fit.corr * 100) / 100, amp: Math.round(fit.amp * 1000) / 1000, lag: fit.lag, lagE: fit.lagE, n: fit.n, edges: fit.edges, edgesOk: fit.edgesOk, jump: Math.round(fit.jump * 1000) / 1000 };
        if (!flash.ok) flash.why = `la carte n’a pas renvoyé la lumière de la lampe (trop de lumière autour ? ou un écran ?) — ${flashTxt(fit)}`;
      } else if (lamp.state === 'error') flash = { used: false, error: lamp.code && lamp.code.error };
      const r = regionFn() || { sx: 0, sy: 0, sw: video.videoWidth, sh: video.videoHeight };
      const N = 256, side = Math.min(r.sw, r.sh, Math.max(N, Math.min(r.sw, r.sh) * 0.5));
      const screen = screenScore(grayOf(video, r.sx + (r.sw - side) / 2, r.sy + (r.sh - side) / 2, side, side, N, N), N);
      const hash = dhash(grayOf(video, 0, 0, video.videoWidth, video.videoHeight, 9, 8));
      const recent = frames.slice(-15).map((x) => x.g);
      const frozen = frozenPairs(recent);
      const reasons = [];
      if (!j.passed) reasons.push(j.why);
      if (frozen >= Math.ceil((recent.length - 1) * 0.8)) reasons.push('image figée (ce n’est pas une caméra en direct)');
      if (screen.peak >= SCREEN_PEAK) reasons.push('on dirait une carte affichée sur un écran');
      if (flash && flash.used && !flash.ok) reasons.push(flash.why);
      const passed = reasons.length === 0;
      // bande-preuve : le dos, l'image « entre deux », la face photographiée
      let strip = null;
      if (passed) {
        const c = Object.assign(document.createElement('canvas'), { width: SW * 3, height: SH }), sg = c.getContext('2d');
        // dos, image « entre deux » (en plein retournement), face photographiée
        sg.putImageData(frames[j.lb].img || cg.getImageData(0, 0, SW, SH), 0, 0);
        const mid = frames[j.lb + Math.max(1, Math.ceil(j.gap / 2))];
        if (mid && mid.img) sg.putImageData(mid.img, SW, 0);
        cg.drawImage(video, r.sx, r.sy, r.sw, r.sh, 0, 0, SW, SH); sg.drawImage(cv, SW * 2, 0);
        strip = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.8));
      }
      const r2 = (v) => Math.round(v * 100) / 100;
      const maxB = Math.max(0, ...frames.map((f) => f.b));
      return {
        passed, reasons, id: ch.id, challenge: ch.challenge, dhash: hash, strip,
        scores: {
          passed, challenge: ch.challenge, frozen, screen: screen.peak, screenStrong: screen.strong,
          flip: { states: j.states || '', gap: j.gap, ev: j.ev, algo: 'E', back: r2(maxB), ms: j.lb >= 0 ? frames[frames.length - 1].t - frames[j.lb].t : null },
          flash: flash && { ...flash, why: undefined },
        },
      };
    }
    return { step, proof, reset, get phase() { return phase; }, get _debug() { return { frames, lamp }; } };
  }

  /** Après l'ajout : envoie la photo, puis demande au serveur de poser le badge */
  /**
   * La carte choisie est-elle bien celle de la photo ? (sinon on pourrait certifier n'importe quelle carte)
   * Oui si la reconnaissance était sûre, si numéro + nom ont été lus, ou si la photo ressemble au visuel officiel.
   */
  async function identity(blob, c) {
    // numéro, total et nom bien lus sur la photo (ou reconnaissance « sûre ») : c'est bien elle,
    // inutile de comparer à toute la série (plus rapide, et une photo avec reflet n'est plus refusée)
    if (c && (c.confident || (c.numOk && c.ofOk && (c.nameScore || 0) >= 0.6))) return { ok: true, how: 'lecture', res: c.visual == null ? null : Math.round(c.visual * 100) / 100 };
    // la carte proposée est la plus ressemblante de toutes celles comparées par la reconnaissance (et ressemble bien)
    // → c'est elle (avant, on exigeait 0,10 d'avance sur toute la série : de bonnes photos étaient refusées)
    if (c && c.visual != null && c.visual >= 0.42 && c.margin != null && c.margin >= 0) return { ok: true, how: 'meilleure', res: Math.round(c.visual * 100) / 100, margin: Math.round(c.margin * 100) / 100 };
    // on compare la photo à TOUTES les cartes de la série choisie : la carte choisie doit être
    // nettement la plus ressemblante (le numéro lu ou tapé à la main ne suffit pas)
    try {
      const setId = c.setId || (c.set && c.set.id);
      const set = await App.games.get('pokemon').getSet(setId);
      const cards = set.cards.map((x) => ({ ...x, setId, serieId: c.serieId || (set.group && set.group.id) || '' }));
      if (!cards.some((x) => x.id === c.id)) cards.push(c);
      const m = await App.recognizer.resemblanceMany(blob, cards);
      const self = m.get(c.id);
      let other = 0, otherName = '';
      for (const x of cards) if (x.id !== c.id && m.has(x.id) && m.get(x.id) > other) { other = m.get(x.id); otherName = x.name; }
      // une réimpression identique dans la même série (même nom) ne compte pas comme concurrente
      const r2 = (v) => Math.round(v * 100) / 100;
      // règle relative : la carte choisie doit être nettement la plus ressemblante de sa série
      // (mesuré sur de vraies photos : bonne carte 0,44 à 0,83 et loin devant ; mauvaise carte toujours derrière une autre)
      const ok = self != null && self >= 0.35 && (self - other >= 0.05 || (App.util.norm(otherName) === App.util.norm(c.name) && self >= other));
      return { ok, how: 'ressemblance', res: self == null ? null : r2(self), next: r2(other) };
    } catch (e) {
      console.warn(e);
      return { ok: false, how: 'erreur' };
    }
  }

  /** Garde sur la carte la raison d'un échec de certification (affichée dans sa fiche) */
  async function note(key, photoId, reason) {
    try { if (App.col.byKey(key)) await App.col.update(key, { certNote: reason ? { photo: photoId, reason, at: Date.now() } : null }); } catch (e) { /* */ }
  }
  async function finish(key, photoId, res, ident = { ok: true }) {
    const r = await doFinish(key, photoId, res, ident);
    await note(key, photoId, r.ok ? null : r.reason);
    return r;
  }
  async function doFinish(key, photoId, res, ident) {
    if (!res || !res.passed) return { ok: false, reason: (res && res.reasons && res.reasons[0]) || 'non vérifiée' };
    if (!ident.ok) return { ok: false, reason: 'carte pas assez reconnue sur la photo', unrecognized: true };
    try {
      // bande-preuve du retournement : envoyée avec la photo, le serveur vérifie qu'elle existe
      if (res.strip) { await App.db.set('photos', 'cert_' + res.id, res.strip); App.cloud.markPhoto('cert_' + res.id); }
      await App.cloud.flushNow();
      if (res.strip) App.db.del('photos', 'cert_' + res.id).catch(() => {}); // plus besoin de la garder sur l'appareil
      const d = await App.cloud.rpc('cert_finish', { p_id: res.id, p_key: key, p_photo: photoId, p_dhash: res.dhash, p_scores: { ...res.scores, recognized: true, ident } });
      if (d && d.ok) { certs.set(photoId, { key, at: Date.now() }); save(); emit(); return { ok: true }; }
      return { ok: false, reason: (d && d.reason) || 'refusée par le serveur' };
    } catch (e) {
      console.warn(e);
      return { ok: false, reason: /cert_finish|function/i.test(e.message || '') ? 'la certification n’est pas encore activée sur le serveur' : (e.message || 'erreur réseau') };
    }
  }

  // ---------- Badges ----------
  const save = () => { try { App.db.set('kv', 'certs', [...certs]); } catch (e) { /* */ } };
  async function load() {
    try { const a = await App.db.get('kv', 'certs'); if (a) a.forEach(([k, v]) => certs.set(k, v)); } catch (e) { /* */ }
  }
  /** Liste venant du serveur (seule source qui compte) */
  function setFromServer(rows) {
    certs.clear();
    rows.forEach((r) => certs.set(r.photo_id, { key: r.key, at: Date.parse(r.created_at) || 0, page: /^case-/.test(r.challenge || '') }));
    save(); emit();
  }
  /** La carte (objet de collection) a-t-elle une photo certifiée ? */
  const isCertified = (it) => !!(it && it.qty > 0 && (it.photos || []).some((p) => certs.has(p) && certs.get(p).key === it.key));
  const photoCertified = (id) => certs.has(id);
  /** Certifiée seulement en page de classeur (carte tirée au sort), pas carte par carte ? */
  const pageOnly = (it) => { const ph = (it && it.photos || []).filter((p) => certs.has(p) && certs.get(p).key === it.key); return ph.length > 0 && ph.every((p) => certs.get(p).page); };
  const count = () => App.col.all().filter(isCertified).length;

  return {
    available, prepare, tracker, livePage, pageOnly, HINTS, finish, identity, note, load, setFromServer, isCertified, photoCertified, count,
    on: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    _test: { motion, judgeFlip, judgeE, flashFit, silhouette, corr, frozenPairs, screenScore, dhash },
  };
})();
