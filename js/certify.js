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
   * Retournement réussi ? Analyse faite juste après la photo, sur les dernières images filmées.
   * frames : [{ b (ressemblance avec un dos), g (petite image grise) }] ; la dernière = la face photographiée.
   * On part du dernier dos vu (2 images de suite), puis chaque image suivante est classée :
   * F (ressemble à la face photographiée), B (dos), X (entre deux : carte de profil, floue).
   * Il faut au moins une image X avant la face : un vrai geste prend du temps, alors qu'une image
   * changée d'un coup sur un écran passe directement du dos à la face.
   */
  function judgeFlip(frames, w, h) {
    let lb = -1;
    for (let i = frames.length - 1; i > 0; i--) if (frames[i].b >= BACK_T && frames[i - 1].b >= BACK_T) { lb = i; break; }
    if (lb < 0) return { passed: false, why: 'le dos de la carte n’a pas été vu' };
    const face = frames[frames.length - 1].g;
    const states = frames.slice(lb + 1).map((f) => (f.b >= BACK_T ? 'B' : corr(f.g, face, w, h) >= FRONT_T ? 'F' : 'X')).join('');
    const firstF = states.indexOf('F');
    const gap = (states.slice(0, firstF < 0 ? states.length : firstF).match(/X/g) || []).length;
    if (gap < 1) return { passed: false, why: 'retournement trop brusque (image remplacée d’un coup ?)', gap, states, lb };
    return { passed: true, gap, states, lb };
  }

  // ---------- Liaison avec le serveur ----------
  const challenges = {}; // par type de capture ('carte' | 'page') : { id, challenge, at }
  const certs = new Map(); // photoId → { key, at }
  const listeners = new Set();
  const emit = () => listeners.forEach((f) => { try { f(); } catch (e) { console.error(e); } });

  const available = () => !!(App.cloud.enabled && App.cloud.user);

  async function prepare(kind = 'carte') {
    if (!available() || kind === 'page') return null;
    const c = challenges[kind];
    if (c && Date.now() - c.at < 8 * 60 * 1000) return c;
    try {
      let d;
      try { d = await App.cloud.rpc('cert_start', { p_kind: kind }); }
      catch (e) { if (kind === 'carte') d = await App.cloud.rpc('cert_start'); else throw e; } // serveur sans la mise à jour v2
      challenges[kind] = { id: d.id, challenge: d.challenge, at: Date.now() };
    } catch (e) { console.warn('certification', e); challenges[kind] = null; }
    return challenges[kind];
  }

  /** Consignes affichées sur la vidéo selon l'étape */
  const HINTS = {
    attente: '<b>1.</b> Montre le <b>dos</b> de la carte dans le cadre',
    dos: '<b>2.</b> Retourne-la !',
    retourne: '<b>3.</b> Tiens-la immobile…',
    pret: '📸',
  };

  /**
   * Certification « dos d'abord » : on suit la zone du cadre en continu. On montre le dos, on retourne
   * la carte, on la tient immobile → la photo se prend toute seule (un seul geste, environ 1 seconde).
   * step() à chaque image (~90 ms) → 'attente' | 'dos' | 'retourne' | 'pret'.
   * Quand c'est 'pret' : prendre la photo, puis proof() donne le résultat à envoyer au serveur.
   * regionFn() : zone du cadre dans la vidéo { sx, sy, sw, sh }.
   */
  function tracker(video, regionFn) {
    const GW = 24, GH = 33, SW = 72, SH = 100;
    const cv = Object.assign(document.createElement('canvas'), { width: SW, height: SH });
    const cg = cv.getContext('2d', { willReadFrequently: true });
    let frames = [], phase = 'attente', lastBack = 0, stable = 0, prev = null;
    const reset = () => { frames = []; phase = 'attente'; stable = 0; prev = null; };
    function step() {
      const r = regionFn();
      if (!r || !video || !video.videoWidth) return phase;
      cg.drawImage(video, r.sx, r.sy, r.sw, r.sh, 0, 0, SW, SH);
      const b = App.recognizer.backScoreOf(cv, SW, SH);
      const g = grayOf(cv, 0, 0, SW, SH, GW, GH);
      let m = 0; for (const v of g) m += v; m /= g.length;
      let sd = 0; for (const v of g) sd += (v - m) ** 2; sd = Math.sqrt(sd / g.length);
      let diff = 99; if (prev) { diff = 0; for (let i = 0; i < g.length; i++) diff += Math.abs(g[i] - prev[i]); diff /= g.length; }
      prev = g;
      const now = Date.now();
      // petites images gardées pour la bande-preuve (seulement une fois le dos vu : c'est léger)
      frames.push({ t: now, b, g, img: phase !== 'attente' || b >= BACK_T ? cg.getImageData(0, 0, SW, SH) : null });
      if (frames.length > 50) frames.shift();
      const n = frames.length;
      if (b >= BACK_T) { if (n > 1 && frames[n - 2].b >= BACK_T) { phase = 'dos'; lastBack = now; } stable = 0; return phase; }
      if (phase === 'attente') return phase;
      if (now - lastBack > 4000) { reset(); return phase; } // dos vu il y a trop longtemps : on recommence
      phase = 'retourne';
      // la face est posée : carte présente (assez de détails), immobile, et ce n'est pas un dos
      const still = sd >= 16 && diff < 4 + sd * 0.08;
      stable = still ? stable + 1 : 0;
      if (stable >= 3) phase = 'pret';
      return phase;
    }
    /** Résultat, juste après la photo (le défi du serveur est consommé) */
    async function proof() {
      const ch = challenges.carte; challenges.carte = null; // usage unique
      if (!ch) return { passed: false, reasons: [available() ? 'serveur de certification injoignable' : 'connecte-toi pour certifier'] };
      if (ch.challenge !== 'retourne') return { passed: false, reasons: ['serveur de certification pas à jour (supabase-v7.sql)'] };
      const j = judgeFlip(frames, GW, GH);
      const r = regionFn() || { sx: 0, sy: 0, sw: video.videoWidth, sh: video.videoHeight };
      const N = 256, side = Math.min(r.sw, r.sh, Math.max(N, Math.min(r.sw, r.sh) * 0.5));
      const screen = screenScore(grayOf(video, r.sx + (r.sw - side) / 2, r.sy + (r.sh - side) / 2, side, side, N, N), N);
      const hash = dhash(grayOf(video, 0, 0, video.videoWidth, video.videoHeight, 9, 8));
      const recent = frames.slice(-15).map((f) => f.g);
      const frozen = frozenPairs(recent);
      const reasons = [];
      if (!j.passed) reasons.push(j.why);
      if (frozen >= Math.ceil((recent.length - 1) * 0.8)) reasons.push('image figée (ce n’est pas une caméra en direct)');
      if (screen.peak >= SCREEN_PEAK) reasons.push('on dirait une carte affichée sur un écran');
      const passed = reasons.length === 0;
      // bande-preuve : le dos, l'image « entre deux », la face photographiée
      let strip = null;
      if (passed) {
        const c = Object.assign(document.createElement('canvas'), { width: SW * 3, height: SH }), sg = c.getContext('2d');
        const x = frames.slice(j.lb + 1).find((f, i) => j.states[i] === 'X');
        [frames[j.lb], x, frames[frames.length - 1]].forEach((f, i) => { if (f && f.img) sg.putImageData(f.img, i * SW, 0); });
        strip = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.8));
      }
      const r2 = (v) => Math.round(v * 100) / 100;
      const maxB = Math.max(0, ...frames.map((f) => f.b));
      return {
        passed, reasons, id: ch.id, challenge: ch.challenge, dhash: hash, strip,
        scores: {
          passed, challenge: ch.challenge, frozen, screen: screen.peak, screenStrong: screen.strong,
          flip: { states: j.states || '', gap: j.gap, back: r2(maxB), ms: j.lb >= 0 ? frames[frames.length - 1].t - frames[j.lb].t : null },
        },
      };
    }
    return { step, proof, reset, get phase() { return phase; } };
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
      const ok = self != null && self >= 0.35 && (self - other >= 0.1 || (App.util.norm(otherName) === App.util.norm(c.name) && self >= other));
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
    rows.forEach((r) => certs.set(r.photo_id, { key: r.key, at: Date.parse(r.created_at) || 0 }));
    save(); emit();
  }
  /** La carte (objet de collection) a-t-elle une photo certifiée ? */
  const isCertified = (it) => !!(it && it.qty > 0 && (it.photos || []).some((p) => certs.has(p) && certs.get(p).key === it.key));
  const photoCertified = (id) => certs.has(id);
  const count = () => App.col.all().filter(isCertified).length;

  return {
    available, prepare, tracker, HINTS, finish, identity, note, load, setFromServer, isCertified, photoCertified, count,
    on: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    _test: { motion, judgeFlip, corr, frozenPairs, screenScore, dhash },
  };
})();
