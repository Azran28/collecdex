/*
 * Certification d'une carte : preuve que la photo vient d'une capture EN DIRECT d'une vraie carte.
 *
 * Au moment de la photo (caméra du site uniquement, jamais depuis la galerie) :
 *   1. le serveur tire un défi au hasard (approche / éloigne / déplace à gauche / à droite) ;
 *   2. le site filme ~2 secondes et vérifie que la carte a bougé comme demandé
 *      (une vidéo préenregistrée ne peut pas deviner le défi) ;
 *   3. il vérifie que l'image « vit » (bruit du capteur : une image injectée est figée) ;
 *   4. il cherche les motifs typiques d'un écran filmé (grille de pixels, moiré) ;
 *   5. le serveur vérifie le défi (usage unique, 10 min), que la photo a été envoyée après
 *      le défi, et qu'elle n'a jamais servi ailleurs, puis pose le badge.
 * Si une étape échoue, la carte peut quand même être ajoutée, sans badge.
 */
App.certify = (() => {
  const SMALL = 96;           // largeur des petites images de suivi
  const FRAMES = 11, STEP = 180; // ~2 s de film

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

  /** Le défi est-il réussi ? (on garde le meilleur moment du film) */
  function judgeChallenge(challenge, moves) {
    const ok = moves.filter((m) => m.fit < 0.85 && m.rel < 1); // recalage net = un vrai objet qui bouge
    const pick = {
      approche: (m) => m.s,
      eloigne: (m) => -m.s,
      gauche: (m) => -m.dx,
      droite: (m) => m.dx,
    }[challenge];
    if (!pick || !ok.length) return { passed: false, best: null };
    const best = ok.reduce((a, b) => (pick(b) > pick(a) ? b : a));
    const passed = challenge === 'approche' ? best.s >= 1.1 : challenge === 'eloigne' ? best.s <= 0.91
      : challenge === 'gauche' ? best.dx <= -0.1 : best.dx >= 0.1;
    return { passed, best };
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

  // Seuils (à affiner avec les vraies captures : les mesures sont enregistrées avec chaque certification)
  const SCREEN_PEAK = 40;

  // ---------- Liaison avec le serveur ----------
  let challenge = null; // { id, challenge, at }
  const certs = new Map(); // photoId → { key, at }
  const listeners = new Set();
  const emit = () => listeners.forEach((f) => { try { f(); } catch (e) { console.error(e); } });

  const available = () => !!(App.cloud.enabled && App.cloud.user);

  async function prepare() {
    if (!available()) return null;
    if (challenge && Date.now() - challenge.at < 8 * 60 * 1000) return challenge;
    try {
      const d = await App.cloud.rpc('cert_start');
      challenge = { id: d.id, challenge: d.challenge, at: Date.now() };
    } catch (e) { console.warn('certification', e); challenge = null; }
    return challenge;
  }

  const LABEL = {
    approche: { txt: 'Approche la carte de l’objectif', arrow: '⤢' },
    eloigne: { txt: 'Éloigne un peu la carte', arrow: '⤡' },
    gauche: { txt: 'Déplace la carte vers la flèche', arrow: '←' },
    droite: { txt: 'Déplace la carte vers la flèche', arrow: '→' },
  };

  /**
   * Film du défi, juste après la photo. host : l'élément qui contient la vidéo (pour afficher la consigne).
   * region : zone de la carte dans la vidéo { sx, sy, sw, sh }.
   */
  async function live(video, host, region) {
    const ch = await prepare();
    if (!ch) return { passed: false, reasons: [available() ? 'serveur de certification injoignable' : 'connecte-toi pour certifier'] };
    challenge = null; // usage unique
    const { sx, sy, sw, sh } = region;
    const w = SMALL, h = Math.round(SMALL * sh / sw);
    const grab = () => grayOf(video, sx, sy, sw, sh, w, h);
    // mesures sur la photo elle-même
    const f0 = grab();
    const N = 256, side = Math.min(sw, sh, Math.max(N, Math.min(sw, sh) * 0.5));
    const patch = grayOf(video, sx + (sw - side) / 2, sy + (sh - side) / 2, side, side, N, N);
    const screen = screenScore(patch, N);
    const hash = dhash(grayOf(video, 0, 0, video.videoWidth, video.videoHeight, 9, 8));
    // consigne
    const L = LABEL[ch.challenge];
    const ov = document.createElement('div');
    ov.className = 'cert-overlay';
    ov.innerHTML = `<div class="cert-arrow ${ch.challenge}">${L.arrow}</div><div class="cert-txt">${L.txt}</div><div class="cert-bar"><span></span></div>`;
    host.appendChild(ov);
    await new Promise((r) => setTimeout(r, 350));
    // petite zone en pleine résolution (le bruit du capteur y est visible)
    const nat = () => grayOf(video, sx + sw / 2 - 32, sy + sh / 2 - 32, 64, 64, 64, 64);
    const frames = [f0], raw = [nat()];
    for (let i = 0; i < FRAMES; i++) {
      await new Promise((r) => setTimeout(r, STEP));
      frames.push(grab()); raw.push(nat());
      ov.querySelector('.cert-bar span').style.width = Math.round(((i + 1) / FRAMES) * 100) + '%';
    }
    ov.remove();
    const moves = frames.filter((_, i) => i >= 4 && i % 2 === 0).map((F) => motion(f0, F, w, h));
    const j = judgeChallenge(ch.challenge, moves);
    const frozen = frozenPairs(raw);
    const reasons = [];
    if (!j.passed) reasons.push('le mouvement demandé n’a pas été détecté');
    if (frozen >= Math.ceil(FRAMES * 0.6)) reasons.push('image figée (ce n’est pas une caméra en direct)');
    if (screen.peak >= SCREEN_PEAK) reasons.push('on dirait une carte affichée sur un écran');
    const passed = reasons.length === 0;
    const r2 = (x) => Math.round(x * 100) / 100;
    return {
      passed, reasons, id: ch.id, challenge: ch.challenge, dhash: hash,
      scores: {
        passed, challenge: ch.challenge, frozen, screen: screen.peak, screenStrong: screen.strong,
        move: j.best ? { s: r2(j.best.s), dx: r2(j.best.dx), dy: r2(j.best.dy), fit: r2(j.best.fit), rel: r2(j.best.rel) } : null,
      },
    };
  }

  /** Après l'ajout : envoie la photo, puis demande au serveur de poser le badge */
  async function finish(key, photoId, res) {
    if (!res || !res.passed) return { ok: false, reason: (res && res.reasons && res.reasons[0]) || 'non vérifiée' };
    try {
      await App.cloud.flushNow();
      const d = await App.cloud.rpc('cert_finish', { p_id: res.id, p_key: key, p_photo: photoId, p_dhash: res.dhash, p_scores: res.scores });
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
    available, prepare, live, finish, load, setFromServer, isCertified, photoCertified, count,
    on: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    _test: { motion, judgeChallenge, frozenPairs, screenScore, dhash },
  };
})();
