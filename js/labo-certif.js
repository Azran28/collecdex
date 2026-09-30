/*
 * Labo de certification (outil de test, pas utilisé par le site) : labo-certif.html
 *
 * 1. Cartes : tes photos (_tests-scanner : pages de classeur découpées, captures du téléphone) et/ou
 *    les visuels officiels TCGdex. Les dos viennent de la photo 04 (7 vrais dos en pochette).
 * 2. Pour chaque carte et chaque situation, on fabrique une fausse vidéo (360×480, une image toutes les
 *    ~90 ms comme sur le téléphone) : table, carte en perspective qui se retourne, pouce, flou de bougé,
 *    bruit du capteur, lumière, reflets… ou bien une tricherie (écran, fondu, glissement, main devant, …).
 * 3. Chaque image passe par les mêmes mesures que le vrai suivi (certify.tracker) : zone du cadre 72×100,
 *    ressemblance avec un dos, petite image grise 24×33.
 * 4. Cinq algorithmes décident. Contrôles communs à tous (identiques au site) : dos vu 2 fois, photo qui ne
 *    montre pas le dos, continuité (la photo montre la carte retournée), image figée, écran filmé.
 *    Ils ne diffèrent que par la PREUVE DU RETOURNEMENT.
 */
(() => {
  const T = App.certify._test;
  const R = App.recognizer;
  const $ = (s) => document.querySelector(s);
  const esc = App.util.esc;
  const VW = 360, VH = 480, SW = 72, SH = 100, GW = 24, GH = 33, DW = 48, DH = 66;
  const RW = Math.round(VW * 0.72), RH = Math.round(RW * 88 / 63);
  const REG = { sx: (VW - RW) / 2, sy: (VH - RH) / 2, sw: RW, sh: RH };
  const BACK_T = 0.55, FRONT_T = 0.5;

  // ---------- Petits outils ----------
  const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
  const lerp = ([a, b], x) => a + (b - a) * x;
  const ease = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
  const canvas = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // rend la main au navigateur sans attendre (setTimeout est freiné à 1 s ou plus quand l'onglet est caché)
  const chan = new MessageChannel(), waiting = [];
  chan.port1.onmessage = () => { const f = waiting.shift(); if (f) f(); };
  const tick = () => new Promise((r) => { waiting.push(r); chan.port2.postMessage(0); });
  const pctTxt = (a, b) => (b ? (Math.round((a / b) * 1000) / 10).toString().replace('.', ',') + ' %' : '—');

  function grayFrom(src, sx, sy, sw, sh, w, h, cache) {
    const c = cache[w + 'x' + h] || (cache[w + 'x' + h] = canvas(w, h));
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(src, sx, sy, sw, sh, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data, out = new Float32Array(w * h);
    for (let i = 0; i < out.length; i++) out[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    return out;
  }
  const CACHE = {};

  // ---------- Cartes et dos ----------
  const CARD_W = 315, CARD_H = 440;
  const toCard = (src, sx, sy, sw, sh) => { const c = canvas(CARD_W, CARD_H); c.getContext('2d').drawImage(src, sx, sy, sw, sh, 0, 0, CARD_W, CARD_H); return c; };
  const loadBmp = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(url + ' ' + r.status); return createImageBitmap(await r.blob()); };

  async function loadPhotos(onCard, onBack) {
    let ver;
    try { ver = await (await fetch('_tests-scanner/verite.json')).json(); } catch (e) { return false; }
    for (const [n, e] of Object.entries(ver)) {
      if (n.startsWith('_')) continue;
      try {
        if (e.type === 'page' && n !== '03' && n !== '11') { // 03 = même page floue, 11 = classeur ouvert (cartes couchées)
          const img = await loadBmp(`_tests-scanner/${n}.jpg`);
          const cells = e.cells ? e.cells.map(([x0, y0, x1, y1]) => ({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 })) : (R.detectGrid(img, 3, 3) || {}).cells;
          if (!cells) continue;
          cells.forEach((cell, i) => {
            const cv = R.cellCard(img, cell).canvas, c = toCard(cv, 0, 0, cv.width, cv.height);
            if (e.cards[i]) onCard({ id: e.cards[i], label: `${e.cards[i]} (photo ${n})`, src: 'photo', img: c });
            else if (R.backScoreOf(c, CARD_W, CARD_H) >= 0.6) onBack(c);
          });
        } else if (e.type === 'decoupe') {
          const img = await loadBmp(`_tests-scanner/${n}${e.ext || '.jpg'}`), k = 1.2, r = e.rect;
          onCard({ id: e.cards[0], label: `${e.cards[0]} (capture ${n})`, src: 'photo', img: toCard(img, r[0] * k, r[1] * k, (r[2] - r[0]) * k, (r[3] - r[1]) * k) });
        }
      } catch (err) { console.warn('photo', n, err); }
      await tick();
    }
    for (const f of ['voltorbe', 'magmar']) {
      try { const img = await loadBmp(`test/${f}.png`); onCard({ id: f, label: `${f} (photo test)`, src: 'photo', img: toCard(img, 0, 0, img.width, img.height) }); } catch (e) { /* */ }
    }
    return true;
  }

  async function fetchRetry(url, n = 3) {
    for (let i = 0; i < n; i++) { try { const r = await fetch(url); if (r.ok) return r; } catch (e) { /* en-tête CORS en double, parfois */ } await sleep(300 * (i + 1)); }
    throw new Error('échec ' + url);
  }
  async function loadOfficial(setIds, onCard, onStatus) {
    for (const id of setIds) {
      let set;
      try { set = await (await fetchRetry(`https://api.tcgdex.net/v2/fr/sets/${encodeURIComponent(id)}`)).json(); } catch (e) { onStatus(`série ${id} introuvable`); continue; }
      const list = (set.cards || []).filter((c) => c.image);
      let k = 0;
      const worker = async () => {
        while (k < list.length) {
          const c = list[k++];
          try { const bmp = await createImageBitmap(await (await fetchRetry(c.image + '/low.webp')).blob()); onCard({ id: c.id, label: `${c.id} ${c.name} (officiel)`, src: 'officiel', img: toCard(bmp, 0, 0, bmp.width, bmp.height) }); } catch (e) { console.warn(e); }
          onStatus(`Visuels ${set.name} : ${k}/${list.length}`);
        }
      };
      await Promise.all([worker(), worker(), worker(), worker(), worker(), worker()]);
    }
  }

  /** Dos de secours (dessiné) si les photos ne sont pas là (site en ligne) */
  function drawnBack() {
    const c = canvas(CARD_W, CARD_H), g = c.getContext('2d');
    g.fillStyle = '#1d3f8f'; g.fillRect(0, 0, CARD_W, CARD_H);
    g.fillStyle = '#2f64c6'; g.fillRect(14, 14, CARD_W - 28, CARD_H - 28);
    for (let i = 0; i < 9; i++) { g.strokeStyle = `rgba(120,170,255,${0.15 + i * 0.03})`; g.lineWidth = 10; g.beginPath(); g.arc(CARD_W / 2, CARD_H / 2, 40 + i * 22, i, i + 4); g.stroke(); }
    g.fillStyle = '#e8e8e8'; g.beginPath(); g.arc(CARD_W / 2, CARD_H / 2, 70, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#d33'; g.beginPath(); g.arc(CARD_W / 2, CARD_H / 2, 70, Math.PI, 0); g.fill();
    g.fillStyle = '#222'; g.fillRect(CARD_W / 2 - 70, CARD_H / 2 - 6, 140, 12); g.beginPath(); g.arc(CARD_W / 2, CARD_H / 2, 20, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#eee'; g.beginPath(); g.arc(CARD_W / 2, CARD_H / 2, 12, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#f5c518'; g.font = 'bold 44px sans-serif'; g.textAlign = 'center'; g.fillText('POKéMON', CARD_W / 2, 90);
    return c;
  }

  // ---------- Décors (tables) et bruit du capteur, préparés une fois ----------
  let TABLES = null, NOISE = null, MOIRE = null;
  function prepareDecor() {
    if (TABLES) return;
    const r = rng(7);
    const pal = [[132, 94, 60], [170, 130, 90], [95, 95, 100], [215, 212, 205], [40, 40, 45], [70, 95, 150], [120, 140, 110], [180, 70, 60]];
    TABLES = pal.map(([cr, cg, cb], k) => {
      const c = canvas(VW + 200, VH + 200), g = c.getContext('2d');
      g.fillStyle = `rgb(${cr},${cg},${cb})`; g.fillRect(0, 0, c.width, c.height);
      const wood = k < 2;
      for (let i = 0; i < (wood ? 260 : 900); i++) {
        const v = (r() - 0.5) * (wood ? 50 : 30);
        g.fillStyle = `rgba(${cr + v | 0},${cg + v | 0},${cb + v | 0},${wood ? 0.35 : 0.5})`;
        if (wood) g.fillRect(0, r() * c.height, c.width, 1 + r() * 4);
        else g.fillRect(r() * c.width, r() * c.height, 2 + r() * 6, 2 + r() * 6);
      }
      if (k === 6) for (let y = 0; y < c.height; y += 40) for (let x = (y / 40) % 2 * 40; x < c.width; x += 80) { g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(x, y, 40, 40); } // nappe à carreaux
      const gr = g.createRadialGradient(c.width * 0.4, c.height * 0.3, 50, c.width / 2, c.height / 2, c.width * 0.8);
      gr.addColorStop(0, 'rgba(255,255,255,.12)'); gr.addColorStop(1, 'rgba(0,0,0,.35)');
      g.fillStyle = gr; g.fillRect(0, 0, c.width, c.height);
      return c;
    });
    NOISE = [0, 1, 2].map(() => {
      const c = canvas(640, 640), g = c.getContext('2d'), d = g.createImageData(640, 640);
      for (let i = 0; i < d.data.length; i += 4) { const v = r() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
      g.putImageData(d, 0, 0); return c;
    });
    // grille de pixels d'un écran filmé (sous-pixels R, V, B)
    const m = canvas(3, 3), mg = m.getContext('2d');
    ['rgba(255,60,60,1)', 'rgba(60,255,60,1)', 'rgba(60,60,255,1)'].forEach((col, i) => { mg.fillStyle = col; mg.fillRect(i, 0, 1, 2); });
    mg.fillStyle = 'rgba(0,0,0,1)'; mg.fillRect(0, 2, 3, 1);
    MOIRE = m;
  }

  // ---------- Dessin ----------
  const layer = canvas(VW, VH), lg = layer.getContext('2d');

  /**
   * Carte qui se retourne (th = 0 : dos vers la caméra, π : face) autour d'un axe vertical ('v') ou
   * horizontal ('h') placé à a (−1…1 le long de la carte). Perspective par tranches (plus proche = plus grand).
   */
  function drawCard(g, back, face, P) {
    const { cx, cy, w, h, rot = 0, th = 0, axis = 'v', a = 0 } = P;
    const c = Math.cos(th), s = Math.sin(th);
    const L = axis === 'v' ? w / 2 : h / 2, O = axis === 'v' ? h : w; // demi-longueur tournée, longueur de l'autre côté
    const Dcam = 3.4;
    g.save(); g.translate(cx, cy); g.rotate(rot);
    if (Math.abs(c) < 0.03) { // carte vue par la tranche
      g.fillStyle = '#d8d6d0';
      const x = a * L;
      if (axis === 'v') g.fillRect(x - 1.5, -O / 2, 3, O); else g.fillRect(-O / 2, x - 1.5, O, 3);
    } else {
      const img = c >= 0 ? back : face, N = 24;
      const X = (u) => { const z = (u - a) * s; const f = Dcam / (Dcam + z); return [(a + (u - a) * c) * L * f, f]; };
      for (let i = 0; i < N; i++) {
        const u0 = -1 + 2 * i / N, u1 = u0 + 2 / N;
        const [x0, f0] = X(u0), [x1, f1] = X(u1), f = (f0 + f1) / 2;
        const lo = Math.min(x0, x1), len = Math.abs(x1 - x0) + 0.8;
        const tu = c >= 0 ? (u0 + 1) / 2 : (1 - u1) / 2; // le côté face est vu de l'autre sens : pas de miroir
        if (axis === 'v') g.drawImage(img, tu * img.width, 0, img.width / N + 0.5, img.height, lo, -O * f / 2, len, O * f);
        else g.drawImage(img, 0, tu * img.height, img.width, img.height / N + 0.5, -O * f / 2, lo, O * f, len);
      }
      // ombre du geste : la carte penchée reçoit moins de lumière
      if (Math.abs(c) < 0.95) { g.fillStyle = `rgba(0,0,0,${(1 - Math.abs(c)) * 0.25})`; const ex = Math.abs(c) * L * 1.1 + 2; if (axis === 'v') g.fillRect(a * L - ex, -O / 2 * 1.1, ex * 2, O * 1.1); else g.fillRect(-O / 2 * 1.1, a * L - ex, O * 1.1, ex * 2); }
    }
    g.restore();
  }

  /** Pouce et main qui tiennent la carte (sur l'axe du geste) */
  function drawThumb(g, P, skin, big = false) {
    const { cx, cy, w, h, rot = 0, axis = 'v', a = 0 } = P;
    g.save(); g.translate(cx, cy); g.rotate(rot); g.fillStyle = skin;
    if (big) { g.beginPath(); g.ellipse(w * 0.4, h * 0.36, w * 0.13, h * 0.08, -0.7, 0, Math.PI * 2); g.fill(); g.beginPath(); g.ellipse(w * 0.62, h * 0.62, w * 0.3, h * 0.2, -0.7, 0, Math.PI * 2); g.fill(); }
    else if (axis === 'v') { const x = a * w / 2; g.beginPath(); g.ellipse(x, h / 2 + 4, 13, 22, 0, 0, Math.PI * 2); g.fill(); g.beginPath(); g.ellipse(x + 12, h / 2 + 70, 48, 62, 0.2, 0, Math.PI * 2); g.fill(); }
    else { const y = a * h / 2; g.beginPath(); g.ellipse(w / 2 + 4, y, 22, 13, 0, 0, Math.PI * 2); g.fill(); g.beginPath(); g.ellipse(w / 2 + 70, y + 12, 62, 48, 0.2, 0, Math.PI * 2); g.fill(); }
    g.restore();
  }

  function drawTable(g, env, t) {
    const tb = TABLES[env.table], s = env.shake ? env.shake(t) : { dx: 0, dy: 0 };
    g.drawImage(tb, -100 + s.dx * 0.6, -100 + s.dy * 0.6);
  }

  /** Téléphone/tablette posé qui affiche une image (tricherie par écran) */
  function drawScreen(g, env, t, content) {
    const s = env.shake(t), P = env.P;
    const x = P.cx + s.dx - P.w / 2, y = P.cy + s.dy - P.h / 2;
    g.fillStyle = '#0c0c0e'; g.fillRect(x - 26, y - 40, P.w + 52, P.h + 80); // bords de l'appareil
    g.save(); g.beginPath(); g.rect(x, y, P.w, P.h); g.clip();
    g.fillStyle = '#000'; g.fillRect(x, y, P.w, P.h);
    content(g, { x, y, w: P.w, h: P.h, cx: x + P.w / 2, cy: y + P.h / 2 });
    if (env.moire) { g.globalAlpha = 0.22; g.globalCompositeOperation = 'multiply'; g.fillStyle = g.createPattern(MOIRE, 'repeat'); g.fillRect(x, y, P.w, P.h); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; }
    const gr = g.createLinearGradient(x, y, x + P.w, y + P.h); gr.addColorStop(0.3, 'rgba(255,255,255,0)'); gr.addColorStop(0.45, 'rgba(255,255,255,.10)'); gr.addColorStop(0.6, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(x, y, P.w, P.h); // reflet de la vitre
    g.restore();
  }

  /** Image finale d'une vidéo à l'instant t (caméra : lumière, flou, bruit) */
  function renderFrame(env, t, out) {
    const g = out.getContext('2d');
    g.filter = 'none'; g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    drawTable(g, env, t);
    lg.clearRect(0, 0, VW, VH);
    env.draw(lg, t);
    const bl = env.blurAt ? env.blurAt(t) : 0;
    if (bl > 0.3) g.filter = `blur(${bl.toFixed(1)}px)`;
    g.drawImage(layer, 0, 0); g.filter = 'none';
    if (env.glare) { // reflet de lumière (holo, pochette) qui glisse sur la carte
      const k = (t / 2400) % 1, gx = VW * (0.2 + 0.6 * k), gy = VH * (0.25 + 0.4 * Math.sin(k * 3));
      const gr = g.createRadialGradient(gx, gy, 5, gx, gy, 90); gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.globalCompositeOperation = 'screen'; g.fillStyle = gr; g.fillRect(0, 0, VW, VH); g.globalCompositeOperation = 'source-over';
    }
    if (!env.frozen) {
      const l = env.light * (1 + 0.03 * Math.sin(t / 700 + env.ph)); // exposition automatique qui respire
      g.globalCompositeOperation = 'multiply';
      g.fillStyle = `rgb(${Math.min(255, 255 * l * env.warm[0]) | 0},${Math.min(255, 255 * l * env.warm[1]) | 0},${Math.min(255, 255 * l * env.warm[2]) | 0})`;
      g.fillRect(0, 0, VW, VH);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = env.noise; g.drawImage(NOISE[(t / 7 | 0) % 3], -((t * 37) % 280), -((t * 53) % 160)); g.globalAlpha = 1;
    } else { g.globalCompositeOperation = 'multiply'; g.fillStyle = 'rgb(235,235,235)'; g.fillRect(0, 0, VW, VH); g.globalCompositeOperation = 'source-over'; }
    // lampe du téléphone (code tiré par le serveur) : une carte ou un papier tout proche la renvoie nettement ;
    // un écran émet sa propre lumière et ne renvoie qu'un petit point brillant ; un flux injecté n'y réagit pas.
    // L'exposition automatique de la caméra compense à moitié en ~0,4 s.
    const on = torchAt(env.torch, t);
    if (on && env.surface !== 'none') {
      const k = Math.min(1, on.since / 400), a = (env.torchAmp ?? (env.surface === 'screen' ? 0.02 : 0.22)) * (1 - 0.5 * k);
      g.globalCompositeOperation = 'screen'; g.fillStyle = `rgba(255,255,255,${a})`; g.fillRect(0, 0, VW, VH);
      // reflet de la lampe : petit point sur la vitre d'un écran, grande tache sur des pochettes brillantes
      const gr0 = env.torchGlare || (env.surface === 'screen' ? 22 : 0);
      if (gr0) { const hx = env.torch.hx, hy = env.torch.hy, gr = g.createRadialGradient(hx, hy, 2, hx, hy, gr0); gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(0.5, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(hx - gr0, hy - gr0, gr0 * 2, gr0 * 2); }
      g.globalCompositeOperation = 'source-over';
    }
  }
  /** Lampe allumée à l'instant t ? (avec le retard d'allumage du téléphone) → { since } ou null */
  function torchAt(T0, t) {
    if (!T0) return null;
    const x = t - T0.start - T0.lag, i = Math.floor(x / T0.slot);
    if (x < 0 || i >= T0.bits.length || !T0.bits[i]) return null;
    let j = i; while (j > 0 && T0.bits[j - 1]) j--;
    return { since: x - j * T0.slot };
  }

  // ---------- Situations ----------
  const skins = ['#e0ac8a', '#c68a64', '#8d5a3b', '#f1c7a8', '#b77b58'];
  function baseEnv(r, card, other, back) {
    const k = 0.86 + r() * 0.12;
    const P = { cx: VW / 2 + (r() - 0.5) * 14, cy: VH / 2 + (r() - 0.5) * 18, w: RW * k, h: RH * k, rot: (r() - 0.5) * 0.08 };
    const amp = 1.5 + r() * 2, ph = [r() * 6.3, r() * 6.3, r() * 6.3];
    // défi du serveur : code de la lampe (6 tranches de 250 ms, au moins 2 allumées et 2 éteintes), pendant qu'on montre le dos
    let bits;
    do { bits = [0, 1, 2, 3, 4, 5].map(() => (r() < 0.5 ? 1 : 0)); } while (bits.reduce((s, x) => s + x, 0) < 2 || bits.reduce((s, x) => s + x, 0) > 4 || bits.filter((x, i) => x && !bits[i - 1]).length < 2); // comme le site : ≥ 2 éclairs
    const torch = { bits, slot: 350, start: 150, lag: 80 + r() * 170, hx: VW * (0.35 + r() * 0.3), hy: VH * (0.3 + r() * 0.4) };
    return {
      t0: 2500, torch, surface: 'card', // le geste commence après le code de la lampe
      r, face: card.img, other: other.img, back, P, skin: skins[(r() * skins.length) | 0],
      table: (r() * TABLES.length) | 0, light: 0.72 + r() * 0.28, warm: r() < 0.5 ? [1, 0.95, 0.85] : [0.92, 0.97, 1], noise: 0.05 + r() * 0.04, ph: r() * 6,
      expo: 4 + r() * 12, // temps de pose de la caméra (ms) : flou de bougé
      dt: 85 + r() * 15, // une image toutes les ~90 ms
      shake: (t) => ({ dx: amp * (Math.sin(t / 310 + ph[0]) * 0.7 + Math.sin(t / 97 + ph[1]) * 0.3), dy: amp * (Math.sin(t / 270 + ph[2]) * 0.7 + Math.sin(t / 113 + ph[0]) * 0.3), dr: amp * 0.002 * Math.sin(t / 400 + ph[1]) }),
    };
  }
  const posed = (env, t, extra = {}) => { const s = env.shake(t); return { ...env.P, cx: env.P.cx + s.dx, cy: env.P.cy + s.dy, rot: env.P.rot + s.dr, ...extra }; };

  /** Un vrai retournement (options : durée, axe, recadrage, hésitation, …) */
  function flipScene(o = {}) {
    return (env) => {
      const r = env.r;
      if (o.small) { env.P.w *= 0.8; env.P.h *= 0.8; }
      if (o.dark) { env.light = 0.42 + r() * 0.12; env.noise = 0.13 + r() * 0.05; env.expo = 16 + r() * 16; }
      if (o.slowCam) env.dt = 125 + r() * 30;
      if (o.glare) env.glare = true;
      if (o.shake) { const amp = o.shake, ph = r() * 6; env.shake = (t) => ({ dx: amp * Math.sin(t / 180 + ph) + amp * 0.5 * Math.sin(t / 61), dy: amp * Math.cos(t / 150 + ph) + amp * 0.5 * Math.sin(t / 53 + 1), dr: 0.01 * Math.sin(t / 300) }); }
      if (o.frozen) { env.frozen = true; env.surface = 'none'; env.shake = () => ({ dx: 0, dy: 0, dr: 0 }); env.dt = 90; }
      const tb = env.t0 + 700 + r() * 900, D = lerp(o.D || [320, 600], r());
      const axis = o.axis || 'v';
      const a = o.offAxis ? (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.4) : (r() - 0.5) * 0.4;
      const hes = o.hes ? 1100 : 0; // hésitation : on commence, on revient, on recommence
      const f0 = tb + hes, flipEnd = f0 + D;
      const react = lerp(o.react || [700, 1400], r());
      const rec = o.recad ? { dx: (r() - 0.5) * 50, dy: (r() - 0.5) * 40, z: (r() - 0.5) * 0.2 } : null;
      const swapAt = o.swap ? flipEnd + 500 + r() * 400 : Infinity; // carte échangée (tricherie)
      const awayAt = o.away ? flipEnd + react : Infinity; // téléphone pointé ailleurs juste avant la photo
      env.shootAt = flipEnd + react + (rec ? 1200 : 0) + (o.swap ? 1500 : 0) + (o.away ? 700 : 0);
      if (o.backShot) env.shootAt = tb + 300 + r() * 600;
      env.info = { tb, D, axis, a: +a.toFixed(2) }; env.faceAt = flipEnd;
      const thAt = (t) => {
        if (o.backShot) return 0;
        if (o.hes && t < f0) { const x = (t - tb) / 500; return x < 0 ? 0 : x < 0.5 ? 1.0 * ease(x * 2) : x < 1 ? 1.0 * (1 - ease((x - 0.5) * 2)) : 0; }
        return Math.PI * ease((t - f0) / D);
      };
      env.draw = (g, t) => {
        let p = posed(env, t, { axis, a });
        const x = (t - f0) / D;
        if (x > 0 && x < 1) { const lift = Math.sin(x * Math.PI) * 0.05; p.w *= 1 + lift; p.h *= 1 + lift; p.cy -= lift * 60; }
        // tournée autour d'un axe décentré, la carte finit à côté : la main la ramène dans le cadre
        // (la moitié pendant le geste, le reste dans la demi-seconde qui suit)
        if (x > 0 && !o.backShot) {
          const back = a * (axis === 'v' ? p.w : p.h) / 2 * (ease(x) + ease((t - flipEnd) / 500));
          if (axis === 'v') p.cx -= back; else p.cy -= back;
        }
        if (rec && t > flipEnd) { const q = ease((t - flipEnd - 200) / 800); p.cx += q * rec.dx; p.cy += q * rec.dy; p.w *= 1 + q * rec.z; p.h *= 1 + q * rec.z; }
        if (t > awayAt) { const q = ease((t - awayAt) / 450); p.cx += q * VW * 1.1; }
        let face = env.face;
        if (t > swapAt) { // la carte retournée sort par le bas, une autre carte arrive
          const q = (t - swapAt) / 900;
          if (q < 0.45) p.cy += ease(q / 0.45) * VH; else { p.cy += (1 - ease((q - 0.45) / 0.55)) * VH; face = env.other; }
        }
        drawCard(g, env.back, face, { ...p, th: thAt(t) });
        drawThumb(g, p, env.skin, o.bigThumb);
      };
      env.blurAt = (t) => {
        if (env.frozen) return 0;
        const w = Math.abs(thAt(t + 8) - thAt(t - 8)) / 16; // rad/ms
        return Math.min(9, (w * (axis === 'v' ? env.P.w : env.P.h) / 2) * env.expo / 3.5);
      };
    };
  }

  /** Tricheries avec un écran : content(g, rect, t) */
  function screenScene(kind, o = {}) {
    return (env) => {
      const r = env.r;
      env.moire = !!o.moire; env.surface = 'screen';
      const tb = env.t0 + 800 + r() * 900, D = kind === 'coupe' ? 0 : lerp(kind === 'fondu' ? [300, 600] : [250, 500], r());
      env.shootAt = tb + D + lerp([600, 1300], r());
      env.info = { tb, D }; env.faceAt = tb + D;
      const img = (g, im, x, y, w, h) => g.drawImage(im, x, y, w, h);
      env.draw = (g, t) => drawScreen(g, env, t, (g2, q) => {
        const x = D ? (t - tb) / D : (t >= tb ? 1 : 0);
        if (kind === 'coupe' || kind === 'main') {
          img(g2, (kind === 'main' ? t >= tb + D / 2 : x >= 1) ? env.face : env.back, q.x, q.y, q.w, q.h);
        } else if (kind === 'fondu') {
          const k = Math.max(0, Math.min(1, x));
          g2.globalAlpha = 1; img(g2, env.back, q.x, q.y, q.w, q.h); g2.globalAlpha = k; img(g2, env.face, q.x, q.y, q.w, q.h); g2.globalAlpha = 1;
        } else if (kind === 'glisse') {
          const k = ease(x);
          img(g2, env.back, q.x - k * q.w, q.y, q.w, q.h); img(g2, env.face, q.x + (1 - k) * q.w, q.y, q.w, q.h);
        } else if (kind === 'video') { // vidéo d'un vrai retournement affichée sur l'écran
          drawCard(g2, env.back, env.face, { cx: q.cx, cy: q.cy, w: q.w * 0.92, h: q.h * 0.92, th: Math.PI * ease(x), axis: 'v', a: 0 });
        }
      });
      if (kind === 'main') { // une main passe devant l'écran pendant le changement d'image
        const d0 = env.draw;
        env.draw = (g, t) => {
          d0(g, t);
          const x = (t - tb) / D; if (x < -0.2 || x > 1.2) return;
          const hx = VW * 1.3 - (x + 0.1) * VW * 1.6;
          g.fillStyle = env.skin; g.beginPath(); g.ellipse(hx, VH / 2, VW * 0.42, VH * 0.5, 0.2, 0, Math.PI * 2); g.fill();
          for (let i = 0; i < 4; i++) { g.beginPath(); g.ellipse(hx - VW * 0.38, VH * (0.18 + i * 0.17), 50, 22, 0, 0, Math.PI * 2); g.fill(); }
        };
      }
    };
  }

  /** Deux morceaux de papier (dos imprimé, face imprimée) : on retire l'un du cadre et on met l'autre */
  function paperSwap() {
    return (env) => {
      const r = env.r, tb = env.t0 + 800 + r() * 800, out = 250 + r() * 200, gapT = 150 + r() * 350, inn = 300 + r() * 200;
      const dir = r() < 0.5 ? 1 : -1, vert = r() < 0.5;
      env.shootAt = tb + out + gapT + inn + lerp([600, 1200], r());
      env.info = { tb, D: out + gapT + inn }; env.faceAt = tb + out + gapT + inn;
      env.draw = (g, t) => {
        const p = posed(env, t), k = t - tb;
        let off = 0, th = 0;
        if (k > 0 && k < out) off = ease(k / out);
        else if (k >= out && k < out + gapT) off = 1.2;
        else if (k >= out + gapT) { th = Math.PI; off = -(1 - ease((k - out - gapT) / inn)); }
        if (vert) p.cy += off * VH * dir; else p.cx += off * VW * dir;
        if (Math.abs(off) < 1.1) { drawCard(g, env.back, env.face, { ...p, th, axis: 'v', a: 0 }); drawThumb(g, p, env.skin); }
      };
    };
  }

  const SCEN = [
    // vrais gestes : doivent être certifiés
    { id: 'g-normal', ok: true, name: 'Retournement normal (0,3–0,6 s)', mk: flipScene() },
    { id: 'g-lent', ok: true, name: 'Retournement lent (1–1,6 s)', mk: flipScene({ D: [1000, 1600] }) },
    { id: 'g-rapide', ok: true, name: 'Retournement très rapide (0,15–0,22 s)', mk: flipScene({ D: [150, 220] }) },
    { id: 'g-haut', ok: true, name: 'Retournée de haut en bas', mk: flipScene({ axis: 'h' }) },
    { id: 'g-recadre', ok: true, name: 'Recadrée après le geste', mk: flipScene({ recad: true }) },
    { id: 'g-attente', ok: true, name: 'Photo 5 s après le geste', mk: flipScene({ react: [4800, 5500] }) },
    { id: 'g-sombre', ok: true, name: 'Pièce sombre, mains qui tremblent', mk: flipScene({ dark: true, shake: 6 }) },
    { id: 'g-reflet', ok: true, name: 'Reflets (holo, pochette)', mk: flipScene({ glare: true }) },
    { id: 'g-pouce', ok: true, name: 'Pouce posé sur un coin de la carte', mk: flipScene({ bigThumb: true }) },
    { id: 'g-hesite', ok: true, name: 'Hésitation puis retournement', mk: flipScene({ hes: true }) },
    { id: 'g-bord', ok: true, name: 'Tenue par un bord (axe décentré)', mk: flipScene({ offAxis: true }) },
    { id: 'g-petite', ok: true, name: 'Carte petite dans le cadre (≈ 75 %)', mk: flipScene({ small: true }) },
    { id: 'g-lent-cam', ok: true, name: 'Téléphone lent (7 images/s)', mk: flipScene({ slowCam: true }) },
    // tricheries : doivent être refusées
    { id: 'f-coupe', ok: false, name: 'Écran : image changée d’un coup', mk: screenScene('coupe') },
    { id: 'f-fondu', ok: false, name: 'Écran : fondu enchaîné dos → face', mk: screenScene('fondu') },
    { id: 'f-glisse', ok: false, name: 'Écran : la face glisse sur le dos', mk: screenScene('glisse') },
    { id: 'f-main', ok: false, name: 'Écran : main passée devant pendant le changement', mk: screenScene('main') },
    { id: 'f-papier', ok: false, name: 'Dos imprimé retiré, face imprimée posée', mk: paperSwap() },
    { id: 'f-autre', ok: false, name: 'Vrai geste, puis une autre carte photographiée', mk: flipScene({ swap: true }) },
    { id: 'f-table', ok: false, name: 'Vrai geste, puis photo de la table', mk: flipScene({ away: true }) },
    { id: 'f-dos', ok: false, name: 'Photo du dos (pas retournée)', mk: flipScene({ backShot: true }) },
    { id: 'f-fige', ok: false, name: 'Flux injecté (vidéo sans bruit de caméra)', mk: flipScene({ frozen: true, react: [1600, 2200] }) },
    { id: 'f-video', ok: false, name: 'Écran : vidéo d’un vrai retournement (moiré visible)', mk: screenScene('video', { moire: true }) },
    { id: 'f-video-net', ok: false, limit: true, name: 'Écran : vidéo d’un vrai retournement, sans moiré', mk: screenScene('video') },
  ];

  // ---------- Fabrication d'une vidéo et mesures (comme certify.tracker) ----------
  const vcan = canvas(VW, VH), grab = canvas(SW, SH), gg = grab.getContext('2d', { willReadFrequently: true });
  function simulate(card, other, back, scen, seed, keep = false) {
    const r = rng(seed), env = baseEnv(r, card, other, back);
    scen.mk(env);
    const frames = [], video = [];
    let t = 0, n = 0;
    const t1 = performance.now();
    while (t <= env.shootAt + 1) {
      renderFrame(env, t, vcan);
      gg.drawImage(vcan, REG.sx, REG.sy, REG.sw, REG.sh, 0, 0, SW, SH);
      const b = R.backScoreOf(grab, SW, SH);
      const f = { t, b, g: grayFrom(grab, 0, 0, SW, SH, GW, GH, CACHE), d: grayFrom(grab, 0, 0, SW, SH, DW, DH, CACHE) };
      frames.push(f);
      if (keep) { const c = canvas(VW / 2, VH / 2); c.getContext('2d').drawImage(vcan, 0, 0, VW / 2, VH / 2); video.push({ t, c }); }
      if (frames.length > 200) frames.shift();
      n++;
      if (t >= env.shootAt) break;
      t = Math.min(env.shootAt, t + env.dt * (r() < 0.06 ? 1.8 : 1)); // parfois une image sautée
    }
    const renderMs = performance.now() - t1;
    // contrôles communs, au moment de la photo (mêmes fonctions que le site)
    const side = 256;
    const screen = T.screenScore(grayFrom(vcan, REG.sx + (REG.sw - side) / 2, REG.sy + (REG.sh - side) / 2, side, side, side, side, CACHE), side);
    const recent = frames.slice(-15).map((x) => x.g);
    const frozen = T.frozenPairs(recent) >= Math.ceil((recent.length - 1) * 0.8);
    // défi « sens du retournement » tiré par le serveur : un vrai joueur le suit (et le tricheur qui retourne
    // une vraie carte aussi) ; une vidéo préparée ou des papiers préparés d'avance tombent juste une fois sur deux
    const follows = scen.ok || ['f-autre', 'f-table', 'f-dos'].includes(scen.id);
    const axis = follows && env.info.axis ? env.info.axis : (r() < 0.5 ? 'v' : 'h');
    return { frames, video, env, renderMs, n, chal: { torch: env.torch, axis }, shared: { screen: screen.peak >= 40, screenPeak: screen.peak, frozen } };
  }

  // ---------- Base commune (même logique que judgeFlip) ----------
  const sdOf = (G) => { let m = 0; for (const v of G) m += v; m /= G.length; let s = 0; for (const v of G) s += (v - m) ** 2; return Math.sqrt(s / G.length); };
  const madOf = (A, B) => { let d = 0; for (let i = 0; i < A.length; i++) d += Math.abs(A[i] - B[i]); return d / A.length; };
  function core(frames) {
    let lb = -1;
    for (let i = frames.length - 1; i > 0; i--) if (frames[i].b >= BACK_T && frames[i - 1].b >= BACK_T) { lb = i; break; }
    if (lb < 0) return { fail: 'dos jamais vu' };
    const last = frames[frames.length - 1];
    if (lb === frames.length - 1 || last.b >= BACK_T) return { fail: 'la photo montre le dos', lb };
    const face = last.g;
    const states = frames.slice(lb + 1).map((f) => (f.b >= BACK_T ? 'B' : T.corr(f.g, face, GW, GH) >= FRONT_T ? 'F' : 'X')).join('');
    const gap = (states.match(/^X*/) || [''])[0].length;
    const firsts = [];
    for (let i = lb + 2; i < frames.length - 1 && firsts.length < 3; i++) {
      const f = frames[i], s = sdOf(f.g);
      if (f.b < BACK_T && s >= 16 && madOf(f.g, frames[i - 1].g) < 4 + s * 0.08) firsts.push(f);
    }
    const cont = firsts.some((f) => T.corr(f.g, face, GW, GH, 4) >= FRONT_T);
    // images du geste : après le dernier dos, jusqu'un peu après la première image qui ressemble à la face
    const fF = states.indexOf('F');
    const end = Math.min(frames.length - 2, lb + 1 + (fF < 0 ? states.length : fF) + 3, lb + 30);
    const gesture = []; for (let i = lb + 1; i <= end; i++) gesture.push(i);
    // continuité « tolérante » : si les mains tremblent, aucune image n'est parfaitement immobile ;
    // on prend alors les 3 images les plus calmes de la demi-seconde qui suit la première image de la face
    // (pas plus tard : sinon une autre carte glissée dans le cadre ensuite passerait)
    let cont2 = cont;
    if (!cont && !firsts.length && fF >= 0) {
      const cand = [], i0 = lb + 1 + fF;
      for (let i = Math.max(i0, 1); i < frames.length - 1 && frames[i].t - frames[i0].t <= 500; i++) if (frames[i].b < BACK_T && sdOf(frames[i].g) >= 12) cand.push([madOf(frames[i].g, frames[i - 1].g), i]);
      cand.sort((x, y) => x[0] - y[0]);
      cont2 = cand.slice(0, 3).some(([, i]) => T.corr(frames[i].g, face, GW, GH, 4) >= FRONT_T);
    }
    return { lb, states, gap, cont, cont2, gesture, fF };
  }
  const finish = (c, evidence, why, tolerant = false) => {
    if (c.fail) return { pass: false, why: c.fail };
    if (!evidence) return { pass: false, why };
    if (!(tolerant ? c.cont2 : c.cont)) return { pass: false, why: 'la photo ne montre pas la carte retournée' };
    return { pass: true };
  };

  // ---------- Mesures sur les images du geste ----------

  /** Profil des bords le long d'un axe ('v' : colonnes, 'h' : lignes) d'une image grise 48×66 */
  function edgeProfile(F, axis) {
    const A = axis === 'v' ? DW : DH, B = axis === 'v' ? DH : DW, P = new Float32Array(A);
    for (let a = 1; a < A - 1; a++) {
      let s = 0;
      for (let b = 0; b < B; b++) { const i1 = axis === 'v' ? b * DW + a - 1 : (a - 1) * DW + b, i2 = axis === 'v' ? b * DW + a + 1 : (a + 1) * DW + b; s += Math.abs(F[i2] - F[i1]); }
      P[a] = s / B;
    }
    return P;
  }
  /** Les deux bords les plus nets (un dans chaque moitié) : largeur w, milieu m (fractions), netteté */
  function silhouette(F, axis) {
    const P = edgeProfile(F, axis), A = P.length, h = A >> 1;
    const sorted = [...P].sort((x, y) => x - y), med = sorted[A >> 1] || 1;
    let L = 1, Rr = A - 2;
    for (let a = 2; a < h; a++) if (P[a] > P[L]) L = a;
    for (let a = h; a < A - 2; a++) if (P[a] > P[Rr]) Rr = a;
    return { w: (Rr - L) / A, m: (L + Rr) / 2 / A, sharp: Math.min(P[L], P[Rr]) / med };
  }
  const narrow = (s) => s.w >= 0.15 && s.w <= 0.7 && Math.abs(s.m - 0.5) <= 0.3; // carte vue de biais, pas sortie du cadre
  /** Netteté de la meilleure silhouette « de biais » pendant le geste */
  function silScore(frames, c, only = null) {
    let best = 0;
    for (const i of c.gesture) for (const axis of only ? [only] : ['v', 'h']) { const s = silhouette(frames[i].d, axis); if (narrow(s)) best = Math.max(best, s.sharp); }
    return best;
  }

  /**
   * Ressemblance (Pearson) entre une bande de l'image F et le modèle Tpl (dos ou face, image 48×66) :
   * bande de largeur s (fraction) centrée en off (−1…1). crop < 0 : modèle ÉCRASÉ dans la bande
   * (k = perspective : un côté plus haut que l'autre) ; crop = 0 / 1 / 2 : modèle en taille réelle,
   * dont on ne voit que le début / la fin / la partie à cet endroit (carte sortie du cadre, glissement, main).
   */
  function pearsonZone(F, Tpl, axis, s, off, k, crop = -1) {
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
        const fv = axis === 'v' ? F[bp * DW + a] : F[a * DW + bp];
        const tv = axis === 'v' ? Tpl[tb * DW + ta] : Tpl[ta * DW + tb];
        sa += fv; sb += tv; saa += fv * fv; sbb += tv * tv; sab += fv * tv; n++;
      }
    }
    if (n < 40) return -1;
    const va = saa - sa * sa / n, vb = sbb - sb * sb / n;
    if (va < n * 25 || vb < n * 25) return -1; // bande sans détails
    return (sab - sa * sb / n) / Math.sqrt(va * vb);
  }
  /**
   * Carte écrasée ENTRE SES DEUX BORDS : pour chaque image du geste dont la silhouette est étroite,
   * la bande entre les bords doit ressembler au dos (ou à la face) écrasé, mieux qu'à un morceau coupé.
   * Renvoie la meilleure avance (écrasé − coupé).
   */
  function squeezeScore(frames, c, only = null) {
    const tpls = [frames[c.lb].d, frames[frames.length - 1].d];
    let best = -9, info = '';
    for (const i of c.gesture) {
      const F = frames[i].d;
      for (const axis of only ? [only] : ['v', 'h']) {
        const s = silhouette(F, axis);
        if (!(s.w >= 0.15 && s.w <= 0.75 && Math.abs(s.m - 0.5) <= 0.35)) continue;
        const off = (s.m - 0.5) * 2;
        for (const Tpl of tpls) {
          let sq = -1, cr = -1;
          for (const ds of [-0.05, 0, 0.05]) {
            for (const k of [0, -0.2, 0.2, -0.35, 0.35]) sq = Math.max(sq, pearsonZone(F, Tpl, axis, s.w + ds, off, k));
            for (const cm of [0, 1, 2]) cr = Math.max(cr, pearsonZone(F, Tpl, axis, s.w + ds, off, 0, cm));
          }
          const m = sq - Math.max(cr, 0);
          if (m > best) { best = m; info = `${axis} largeur ${s.w.toFixed(2)} écrasée ${sq.toFixed(2)} coupée ${cr.toFixed(2)}`; }
        }
      }
    }
    return { m: best, info };
  }

  // ---------- Les 5 algorithmes ----------
  const SIL_T = 1.8, SQ_T = 0.03;

  /** A — actuel (v2.21) : l'image juste après le dos doit être « entre deux » (judgeFlip du site, tel quel) */
  function algoA(frames) {
    const j = T.judgeFlip(frames, GW, GH);
    return { pass: j.passed, why: j.why, info: j.states };
  }

  /** B — durée : au moins 2 images « entre deux » et un geste de 0,12 à 3 s (un écran change trop vite) */
  function algoB(frames) {
    const c = core(frames);
    if (c.fail) return finish(c);
    const ms = c.fF < 0 ? Infinity : frames[c.lb + 1 + c.fF].t - frames[c.lb].t;
    return finish(c, c.gap >= 2 && ms >= 120 && ms <= 3000, `geste trop bref ou trop long (${c.gap} image(s), ${isFinite(ms) ? Math.round(ms) + ' ms' : '—'})`);
  }

  /** C — silhouette : on doit voir les DEUX bords de la carte se rapprocher (carte de biais), pas un seul bord qui balaie l'image */
  function algoC(frames) {
    const c = core(frames);
    if (c.fail) return finish(c);
    const s = silScore(frames, c);
    const r = finish(c, s >= SIL_T, 'pas de silhouette de carte de biais');
    r.info = `netteté ${s.toFixed(1)}`;
    return r;
  }

  /** D — carte écrasée : entre ses deux bords, l'image montre le dos ou la face écrasé(e), pas un morceau coupé (fondu, glissement, main) */
  function algoD(frames) {
    const c = core(frames);
    if (c.fail) return finish(c);
    const q = squeezeScore(frames, c);
    const r = finish(c, q.m >= SQ_T, 'aucune image de la carte écrasée');
    r.info = `${q.m.toFixed(2)} ${q.info}`;
    return r;
  }

  /**
   * E — combiné : silhouette (C) OU carte écrasée (D) comme preuve du retournement, et continuité « tolérante »
   * (mains qui tremblent : on prend les images les plus calmes juste après le geste).
   */
  function algoE(frames) {
    const c = core(frames);
    if (c.fail) return finish(c);
    const s = silScore(frames, c);
    const q = s >= SIL_T ? null : squeezeScore(frames, c);
    const r = finish(c, s >= SIL_T || q.m >= SQ_T, 'ni silhouette ni carte écrasée pendant le geste', true);
    r.info = q ? `écrasée ${q.m.toFixed(2)}` : `netteté ${s.toFixed(1)}`;
    return r;
  }

  // ---------- Méthodes trouvées ailleurs, combinées avec E ----------

  /**
   * Lampe qui clignote (principe de « Flashmark » d'iProov pour les visages, ici avec la lampe arrière) :
   * le serveur tire un code (6 tranches de 250 ms) ; pendant qu'on montre le dos, la luminosité de la carte
   * doit suivre ce code (retard d'allumage permis). Un écran renvoie à peine la lampe, une vidéo préparée ou
   * un flux injecté ne connaissent pas le code. Luminosité = médiane (un petit reflet ne compte pas).
   */
  function flashScore(frames, chal) {
    const Tc = chal.torch, end = Tc.start + Tc.bits.length * Tc.slot + 350;
    const fs = frames.filter((f) => f.t >= Tc.start && f.t <= end);
    if (fs.length < 10) return { ok: false, corr: 0, amp: 0 };
    const med = fs.map((f) => { const s = Array.from(f.d).sort((a, b) => a - b); return s[s.length >> 1]; });
    let best = { corr: -1, amp: 0 };
    for (let lag = 0; lag <= 320; lag += 20) {
      const on = fs.map((f) => { const i = Math.floor((f.t - Tc.start - lag) / Tc.slot); return i >= 0 && i < Tc.bits.length && Tc.bits[i] ? 1 : 0; });
      const n1 = on.reduce((s, x) => s + x, 0); if (n1 < 2 || n1 > on.length - 2) continue;
      let m1 = 0, m0 = 0; on.forEach((x, k) => { if (x) m1 += med[k]; else m0 += med[k]; }); m1 /= n1; m0 /= on.length - n1;
      const mm = med.reduce((s, x) => s + x, 0) / med.length, om = n1 / on.length;
      let num = 0, da = 0, db = 0; med.forEach((v, k) => { num += (v - mm) * (on[k] - om); da += (v - mm) ** 2; db += (on[k] - om) ** 2; });
      const corr = num / (Math.sqrt(da * db) || 1);
      if (corr > best.corr) best = { corr, amp: (m1 - m0) / (m0 || 1) };
    }
    return { ok: best.corr >= 0.75 && best.amp >= 0.06, ...best };
  }

  /** F — E + lampe qui clignote (téléphones Android : l'iPhone ne laisse pas un site allumer la lampe) */
  function algoF(frames, sim) {
    const r = algoE(frames);
    if (!r.pass) return r;
    const fl = flashScore(frames, sim.chal);
    return fl.ok ? { pass: true, info: `lampe ${fl.corr.toFixed(2)} / +${Math.round(fl.amp * 100)} %` } : { pass: false, why: 'la carte n’a pas renvoyé la lumière de la lampe au bon moment', info: `lampe ${fl.corr.toFixed(2)} / ${Math.round(fl.amp * 100)} %` };
  }

  /** G — E + sens imposé : le serveur dit « de gauche à droite » ou « de haut en bas », la preuve doit être dans ce sens */
  function algoG(frames, sim) {
    const c = core(frames);
    if (c.fail) return finish(c);
    const ax = sim.chal.axis, s = silScore(frames, c, ax);
    const q = s >= SIL_T ? null : squeezeScore(frames, c, ax);
    return finish(c, s >= SIL_T || q.m >= SQ_T, `carte pas retournée dans le sens demandé (${ax === 'v' ? 'gauche-droite' : 'haut-bas'})`, true);
  }

  /** H — les trois ensemble : E + lampe + sens imposé */
  function algoH(frames, sim) {
    const r = algoG(frames, sim);
    if (!r.pass) return r;
    const fl = flashScore(frames, sim.chal);
    return fl.ok ? { pass: true } : { pass: false, why: 'la carte n’a pas renvoyé la lumière de la lampe au bon moment' };
  }

  /**
   * V — le site tel qu'il est (v2.51, certify.js) : judgeE (silhouette ou carte écrasée, continuité par chaîne
   * image par image) ; si la lampe est reconnue, l'ancienne règle du retournement suffit et le détecteur d'écran ne
   * bloque plus. blocks = lampe bloquante (prochaine étape) ; sinon mode essai (comme aujourd'hui).
   */
  const medianOf = (G) => { const s = Array.from(G).sort((a, b) => a - b); return s[s.length >> 1]; };
  function siteV(frames, sim, blocks) {
    const j = T.judgeE(frames, GW, GH);
    const Tc = sim.chal.torch, code = { t0: Tc.start, end: Tc.start + Tc.bits.length * Tc.slot, ev: [] };
    Tc.bits.forEach((b, i) => { if (i === 0 || b !== Tc.bits[i - 1]) code.ev.push({ t: Tc.start + i * Tc.slot, on: !!b }); });
    code.ev.push({ t: code.end, on: false });
    const fit = T.flashFit(frames.map((f) => ({ t: f.t, v: medianOf(f.d) })), code), fok = T.flashOk(fit, 0.06, 0.08);
    let ok = j.passed, why = j.why;
    if (!ok && fok && j.cont) { const a = T.judgeFlip(frames, GW, GH); if (a.passed || a.gap >= 1) ok = true; }
    if (ok && blocks && !fok) { ok = false; why = 'lampe pas reconnue'; }
    return { pass: ok, why: ok ? undefined : why, screenOk: fok, info: `lampe ${fok ? 'vue' : 'pas vue'}` };
  }

  const ALGOS = [
    { id: 'A', name: 'A — Actuel (v2.21) : une image « entre deux » juste après le dos', fn: algoA },
    { id: 'B', name: 'B — Durée : ≥ 2 images entre deux, geste de 0,12 à 3 s', fn: algoB },
    { id: 'C', name: 'C — Silhouette : les deux bords de la carte se rapprochent', fn: algoC },
    { id: 'D', name: 'D — Carte « écrasée » entre ses bords (pas coupée)', fn: algoD },
    { id: 'E', name: 'E — Combiné : C ou D + continuité tolérante', fn: algoE },
    { id: 'F', name: 'F — E + lampe qui clignote selon un code du serveur', fn: algoF },
    { id: 'G', name: 'G — E + sens du retournement imposé par le serveur', fn: algoG },
    { id: 'H', name: 'H — E + lampe + sens imposé', fn: algoH },
    { id: 'V', name: 'V — Site actuel (v2.51), lampe en mode essai', fn: (fr, sim) => siteV(fr, sim, false) },
    { id: 'W', name: 'W — Site v2.51 avec lampe bloquante (prochaine étape)', fn: (fr, sim) => siteV(fr, sim, true) },
  ];

  function judge(sim) {
    const out = {};
    for (const A of ALGOS) {
      const t0 = performance.now();
      let r;
      try { r = A.fn(sim.frames, sim); } catch (e) { console.error(e); r = { pass: false, why: 'erreur ' + e.message }; }
      const ms = performance.now() - t0;
      if (r.pass && sim.shared.frozen) r = { pass: false, why: 'image figée' };
      if (r.pass && sim.shared.screen && !r.screenOk) r = { pass: false, why: 'écran détecté' };
      out[A.id] = { ...r, ms };
    }
    return out;
  }

  // ---------- Banc d'essai complet ----------
  const state = { cards: [], backs: [], results: null };

  function showThumbs() {
    const box = $('#thumbs'); box.innerHTML = '';
    for (const c of [...state.backs.slice(0, 3), ...state.cards.slice(0, 40)]) { const t = canvas(36, 50); t.getContext('2d').drawImage(c.img || c, 0, 0, 36, 50); box.appendChild(t); }
    if (state.cards.length > 40) box.insertAdjacentHTML('beforeend', `<span class="tag">+ ${state.cards.length - 40}</span>`);
  }

  async function loadAll() {
    prepareDecor();
    state.cards = []; state.backs = [];
    const st = (m) => { $('#status').textContent = m; };
    if ($('#o-photos').checked) { st('Découpe des cartes sur tes photos…'); await loadPhotos((c) => state.cards.push(c), (b) => state.backs.push(b)); }
    if (!state.backs.length) { try { await loadPhotos(() => {}, (b) => state.backs.push(b)); } catch (e) { /* */ } }
    if (!state.backs.length) state.backs.push(drawnBack());
    if ($('#o-off').checked) await loadOfficial($('#o-sets').value.split(',').map((s) => s.trim()).filter(Boolean), (c) => state.cards.push(c), st);
    showThumbs(); fillPlayer();
    st(`${state.cards.length} cartes, ${state.backs.length} dos.`);
  }

  async function runAll() {
    $('#go').disabled = true;
    try {
      if (!state.cards.length) await loadAll();
      const rep = +$('#o-rep').value, cards = state.cards, total = cards.length * SCEN.length * rep;
      const rows = []; let done = 0; const t0 = performance.now();
      for (let ci = 0; ci < cards.length; ci++) {
        for (const sc of SCEN) for (let k = 0; k < rep; k++) {
          const seed = hashStr(cards[ci].id + '|' + sc.id + '|' + k);
          const back = state.backs[seed % state.backs.length], other = cards[(ci + 1 + (seed % (cards.length - 1 || 1))) % cards.length];
          const sim = simulate(cards[ci], other, back, sc, seed);
          const v = judge(sim);
          rows.push({ card: cards[ci].id, src: cards[ci].src, scen: sc.id, ok: sc.ok, limit: !!sc.limit, n: sim.n, v, screen: sim.shared.screenPeak, frozen: sim.shared.frozen, states: v.A.info || '' });
          done++;
        }
        $('#bar').style.width = (done / total * 100).toFixed(1) + '%';
        $('#status').textContent = `${done} / ${total} vidéos (${Math.round((performance.now() - t0) / 1000)} s)`;
        await tick();
      }
      state.results = rows;
      window.__labo = { rows, summary: summarize(rows) };
      renderResults(rows);
      $('#status').textContent = `Terminé : ${rows.length} vidéos en ${Math.round((performance.now() - t0) / 1000)} s.`;
    } finally { $('#go').disabled = false; }
  }

  function summarize(rows) {
    const S = {};
    for (const A of ALGOS) {
      const g = rows.filter((r) => r.ok), f = rows.filter((r) => !r.ok && !r.limit), l = rows.filter((r) => r.limit);
      const acc = g.filter((r) => r.v[A.id].pass).length, rej = f.filter((r) => !r.v[A.id].pass).length, lrej = l.filter((r) => !r.v[A.id].pass).length;
      const ms = rows.map((r) => r.v[A.id].ms).sort((a, b) => a - b);
      const per = {};
      for (const sc of SCEN) { const x = rows.filter((r) => r.scen === sc.id); per[sc.id] = { n: x.length, good: x.filter((r) => r.v[A.id].pass === sc.ok).length }; }
      const whys = {};
      for (const r of g) if (!r.v[A.id].pass) { const w = (r.v[A.id].why || '?').replace(/\(.*\)/, '').trim(); whys[w] = (whys[w] || 0) + 1; }
      S[A.id] = { acc, g: g.length, rej, f: f.length, lrej, l: l.length, msMed: ms[ms.length >> 1], ms95: ms[Math.floor(ms.length * 0.95)], per, whys };
    }
    return S;
  }

  function cls(x) { return x >= 0.97 ? 'good' : x >= 0.85 ? 'mid' : 'bad'; }
  function renderResults(rows) {
    const S = summarize(rows);
    // meilleur : fiabilité d'abord (tricheries refusées), puis réussite
    const score = (s) => (s.rej / s.f) * 0.6 + (s.acc / s.g) * 0.4;
    const best = ALGOS.map((a) => a.id).sort((x, y) => score(S[y]) - score(S[x]))[0];
    const fmt = (v) => (v < 10 ? v.toFixed(1) : Math.round(v)).toString().replace('.', ',');
    const nCards = new Set(rows.map((r) => r.card + '|' + r.src)).size;
    let h = `<h2>Résultats (${rows.length} vidéos, ${nCards} cartes)</h2><div class="box scroll"><table>
      <tr><th>Algorithme</th><th>Réussite<br>(vrais gestes certifiés)</th><th>Fiabilité<br>(tricheries refusées)</th><th>Hors de portée<br>(vidéo sans moiré)</th><th>Calcul par photo<br>(médiane / 95 %)</th></tr>`;
    for (const A of ALGOS) {
      const s = S[A.id];
      h += `<tr class="${A.id === best ? 'best' : ''}"><td>${esc(A.name)}${A.id === best ? ' <span class="tag">meilleur</span>' : ''}</td>
        <td class="n ${cls(s.acc / s.g)}">${pctTxt(s.acc, s.g)} <span class="tag">${s.acc}/${s.g}</span></td>
        <td class="n ${cls(s.rej / s.f)}">${pctTxt(s.rej, s.f)} <span class="tag">${s.rej}/${s.f}</span></td>
        <td class="n">${pctTxt(s.lrej, s.l)}</td>
        <td class="n">${fmt(s.msMed)} / ${fmt(s.ms95)} ms</td></tr>`;
    }
    h += `</table></div><h2>Détail par situation</h2><div class="box scroll"><table><tr><th>Situation</th><th>Attendu</th>${ALGOS.map((a) => `<th>${a.id}</th>`).join('')}</tr>`;
    for (const sc of SCEN) {
      h += `<tr><td>${esc(sc.name)}</td><td>${sc.ok ? 'certifiée' : sc.limit ? 'refusée (limite)' : 'refusée'}</td>`;
      for (const A of ALGOS) { const p = S[A.id].per[sc.id]; h += `<td class="n ${cls(p.good / p.n)}">${pctTxt(p.good, p.n)}</td>`; }
      h += '</tr>';
    }
    h += `</table><p class="lead" style="margin-top:8px">Pourcentage de bonnes décisions : vrais gestes certifiés, tricheries refusées.</p></div>`;
    h += `<h2>Pourquoi des vrais gestes ont été refusés</h2><div class="box scroll"><table><tr><th>Algorithme</th><th>Raisons (nombre de vidéos)</th></tr>`;
    for (const A of ALGOS) h += `<tr><td>${A.id}</td><td style="white-space:normal">${Object.entries(S[A.id].whys).sort((a, b) => b[1] - a[1]).map(([w, n]) => `${esc(w)} : ${n}`).join(' · ') || '—'}</td></tr>`;
    h += '</table></div>';
    const src = ['photo', 'officiel'].filter((s) => rows.some((r) => r.src === s));
    if (src.length > 1) {
      h += `<h2>Selon l'origine des cartes</h2><div class="box scroll"><table><tr><th>Cartes</th>${ALGOS.map((a) => `<th>${a.id} réussite</th><th>${a.id} fiabilité</th>`).join('')}</tr>`;
      for (const s of src) { const x = summarize(rows.filter((r) => r.src === s)); h += `<tr><td>${s === 'photo' ? 'Tes photos' : 'Visuels officiels'}</td>${ALGOS.map((a) => `<td class="n">${pctTxt(x[a.id].acc, x[a.id].g)}</td><td class="n">${pctTxt(x[a.id].rej, x[a.id].f)}</td>`).join('')}</tr>`; }
      h += '</table></div>';
    }
    $('#results').innerHTML = h;
  }

  // ---------- Lecteur ----------
  function fillPlayer() {
    $('#p-card').innerHTML = state.cards.map((c, i) => `<option value="${i}">${esc(c.label)}</option>`).join('');
    $('#p-scen').innerHTML = SCEN.map((s, i) => `<option value="${i}">${s.ok ? '✅' : '⛔'} ${esc(s.name)}</option>`).join('');
  }
  let playing = 0;
  async function play() {
    if (!state.cards.length) await loadAll();
    const ci = +$('#p-card').value || 0, sc = SCEN[+$('#p-scen').value || 0], cards = state.cards;
    const seed = hashStr(cards[ci].id + '|' + sc.id + '|0');
    const sim = simulate(cards[ci], cards[(ci + 1 + (seed % (cards.length - 1 || 1))) % cards.length], state.backs[seed % state.backs.length], sc, seed, true);
    const v = judge(sim);
    $('#p-out').innerHTML = `<div class="lead">${sim.n} images, geste à ${Math.round(sim.env.info.tb)} ms (${Math.round(sim.env.info.D)} ms) · écran ${sim.shared.screenPeak}${sim.shared.frozen ? ' · figée' : ''}</div>`
      + ALGOS.map((A) => `<div><b class="${v[A.id].pass === sc.ok ? 'ok' : 'ko'}">${v[A.id].pass ? 'certifiée' : 'refusée'}</b> ${esc(A.name.split(' — ')[0])} ${v[A.id].pass ? '' : '· ' + esc(v[A.id].why || '')} ${v[A.id].info ? `<code>${esc(v[A.id].info)}</code>` : ''}</div>`).join('');
    const id = ++playing, pv = $('#pv').getContext('2d');
    const t0 = performance.now();
    for (let i = 0; i < sim.video.length && id === playing; i++) {
      const wait = sim.video[i].t - (performance.now() - t0); if (wait > 0) await sleep(wait);
      pv.drawImage(sim.video[i].c, 0, 0, 360, 480);
      pv.strokeStyle = '#ffd23f'; pv.lineWidth = 2; pv.strokeRect(REG.sx, REG.sy, REG.sw, REG.sh);
      const f = sim.frames[sim.frames.length - sim.video.length + i];
      if (f) { pv.fillStyle = 'rgba(0,0,0,.6)'; pv.fillRect(0, 0, 360, 22); pv.fillStyle = '#fff'; pv.font = '13px sans-serif'; pv.fillText(`${(sim.video[i].t / 1000).toFixed(2)} s · dos ${f.b.toFixed(2)}`, 6, 15); }
    }
  }


  // ---------- 2ᵉ banc : la lampe en rafale et en classeur ----------

  function genBits(r, n) {
    const m = Math.max(1, Math.floor(n / 3));
    for (;;) { const b = Array.from({ length: n }, () => (r() < 0.5 ? 1 : 0)), s = b.reduce((a, x) => a + x, 0); if (s >= m && s <= n - m) return b; }
  }
  /** Même geste qu'en carte seule, mais la lampe clignote pendant que la FACE est tenue immobile, juste avant la photo automatique */
  const rafale = (mk, n, slot) => (env) => {
    env.t0 = 0; mk(env);
    const r = env.r;
    env.torch = { bits: genBits(r, n), slot, start: env.faceAt + 300, lag: 80 + r() * 170, hx: env.torch.hx, hy: env.torch.hy };
    env.shootAt = env.torch.start + n * slot + 350;
  };
  const R_BASE = [
    ['g-normal', true, 'Retournement normal', flipScene()],
    ['g-rapide', true, 'Retournement très rapide', flipScene({ D: [150, 220] })],
    ['g-sombre', true, 'Pièce sombre, mains qui tremblent', flipScene({ dark: true, shake: 6 })],
    ['g-reflet', true, 'Reflets (holo, pochette)', flipScene({ glare: true })],
    ['g-lent-cam', true, 'Téléphone lent (7 images/s)', flipScene({ slowCam: true })],
    ['f-coupe', false, 'Écran : image changée d’un coup', screenScene('coupe')],
    ['f-fondu', false, 'Écran : fondu enchaîné', screenScene('fondu')],
    ['f-glisse', false, 'Écran : glissement', screenScene('glisse')],
    ['f-main', false, 'Écran : main passée devant', screenScene('main')],
    ['f-video', false, 'Écran : vidéo d’un vrai retournement (moiré)', screenScene('video', { moire: true })],
    ['f-video-net', false, 'Écran : vidéo d’un vrai retournement, sans moiré', screenScene('video')],
    ['f-fige', false, 'Flux injecté', flipScene({ frozen: true })],
    ['f-papier', false, 'Dos imprimé retiré, face imprimée posée', paperSwap()],
  ];
  const CODES = [{ id: 'court', n: 4, slot: 200, name: 'code court (4 × 0,2 s = 0,8 s)' }, { id: 'long', n: 6, slot: 250, name: 'code long (6 × 0,25 s = 1,5 s)' }];

  /** Luminosité (série de valeurs) qui suit-elle le code de la lampe ? → meilleure corrélation et hausse relative */
  function seriesFlash(ts, vals, Tc) {
    let best = { corr: -1, amp: 0 };
    for (let lag = 0; lag <= 320; lag += 20) {
      const on = ts.map((t) => { const i = Math.floor((t - Tc.start - lag) / Tc.slot); return i >= 0 && i < Tc.bits.length && Tc.bits[i] ? 1 : 0; });
      const n1 = on.reduce((s, x) => s + x, 0); if (n1 < 2 || n1 > on.length - 2) continue;
      let m1 = 0, m0 = 0; on.forEach((x, k) => { if (x) m1 += vals[k]; else m0 += vals[k]; }); m1 /= n1; m0 /= on.length - n1;
      const mm = vals.reduce((s, x) => s + x, 0) / vals.length, om = n1 / on.length;
      let num = 0, da = 0, db = 0; vals.forEach((v, k) => { num += (v - mm) * (on[k] - om); da += (v - mm) ** 2; db += (on[k] - om) ** 2; });
      const corr = num / (Math.sqrt(da * db) || 1);
      if (corr > best.corr) best = { corr, amp: (m1 - m0) / (m0 || 1) };
    }
    return best;
  }

  async function runRafale(onStatus) {
    const cards = state.cards, rows = [];
    for (let ci = 0; ci < cards.length; ci++) {
      for (const code of CODES) for (const [id, ok, name, mk] of R_BASE) {
        const sc = { id: 'r-' + id, ok, mk: rafale(mk, code.n, code.slot) };
        const seed = hashStr(cards[ci].id + '|' + sc.id + '|' + code.id);
        const sim = simulate(cards[ci], cards[(ci + 1) % cards.length], state.backs[seed % state.backs.length], sc, seed);
        const e = algoE(sim.frames);
        let pE = e.pass && !sim.shared.frozen && !sim.shared.screen;
        const fl = flashScore(sim.frames, sim.chal);
        rows.push({ code: code.id, id, ok, name, E: pE, F: pE && fl.ok, corr: fl.corr, amp: fl.amp, why: e.why });
      }
      onStatus(`Rafale : ${ci + 1} / ${cards.length} cartes`);
      await tick();
    }
    return rows;
  }

  // Page de classeur filmée (certification « touche la carte ») : on ne simule que la lampe, le geste du doigt est déjà testé
  const LIGHTS = [{ id: 'forte', name: 'Pièce peu éclairée (la lampe compte beaucoup)', amp: 0.15, light: 0.55 }, { id: 'moyenne', name: 'Pièce éclairée', amp: 0.07, light: 0.8 }, { id: 'faible', name: 'Plein jour (la lampe compte peu)', amp: 0.03, light: 1 }];
  const PKINDS = [{ id: 'vrai', ok: true, name: 'Vraie page (pochettes brillantes)' }, { id: 'tremble', ok: true, name: 'Vraie page, mains qui tremblent' }, { id: 'ecran', ok: false, name: 'Photo de la page sur un écran' }, { id: 'fige', ok: false, name: 'Flux injecté' }, { id: 'imprime', ok: false, name: 'Photo de la page imprimée sur papier' }];
  function pageScene(pg, L, kind) {
    return (env) => {
      const r = env.r;
      env.t0 = 0; env.light = L.light * (0.92 + r() * 0.1);
      env.surface = kind === 'fige' ? 'none' : kind === 'ecran' ? 'screen' : 'card';
      if (kind === 'fige') { env.frozen = true; env.shake = () => ({ dx: 0, dy: 0, dr: 0 }); }
      if (kind === 'tremble') { const amp = 6, ph = r() * 6; env.shake = (t) => ({ dx: amp * Math.sin(t / 180 + ph) + amp * 0.5 * Math.sin(t / 61), dy: amp * Math.cos(t / 150 + ph), dr: 0.008 * Math.sin(t / 300) }); }
      env.torchAmp = kind === 'ecran' ? L.amp * 0.1 : L.amp;
      env.torchGlare = kind === 'imprime' ? 0 : kind === 'ecran' ? 30 : 50 + r() * 50;
      env.torch = { bits: genBits(r, 6), slot: 250, start: 400, lag: 80 + r() * 170, hx: VW * (0.35 + r() * 0.3), hy: VH * (0.35 + r() * 0.3) };
      env.shootAt = 400 + 1500 + 400;
      env.info = { tb: 0, D: 0 };
      const k = Math.max(VW / pg.width, VH / pg.height) * 1.04, w = pg.width * k, h = pg.height * k;
      env.draw = (g, t) => { const s = env.shake(t); g.save(); g.translate(VW / 2 + s.dx, VH / 2 + s.dy); g.rotate(s.dr); g.drawImage(pg, -w / 2, -h / 2, w, h); g.restore(); };
    };
  }
  function simulatePage(pg, L, kind, seed) {
    const r = rng(seed), env = baseEnv(r, { img: pg }, { img: pg }, pg);
    pageScene(pg, L, kind)(env);
    const ts = [], whole = [], cells = Array.from({ length: 9 }, () => []);
    let t = 0;
    while (t <= env.shootAt) {
      renderFrame(env, t, vcan);
      const G = grayFrom(vcan, 0, 0, VW, VH, 36, 48, CACHE);
      const med = (arr) => { const s = Array.from(arr).sort((a, b) => a - b); return s[s.length >> 1]; };
      ts.push(t); whole.push(med(G));
      for (let cy = 0; cy < 3; cy++) for (let cx = 0; cx < 3; cx++) { const v = []; for (let y = cy * 16; y < cy * 16 + 16; y++) for (let x = cx * 12; x < cx * 12 + 12; x++) v.push(G[y * 36 + x]); cells[cy * 3 + cx].push(med(v)); }
      t += env.dt * (r() < 0.06 ? 1.8 : 1);
    }
    const win = ts.map((x, i) => (x >= env.torch.start && x <= env.torch.start + 1850 ? i : -1)).filter((i) => i >= 0);
    const pick = (a) => win.map((i) => a[i]), tt = pick(ts);
    const w = seriesFlash(tt, pick(whole), env.torch);
    const cs = cells.map((c) => seriesFlash(tt, pick(c), env.torch));
    return { whole: w, cells: cs };
  }
  const pageOk = (res, amp) => res.cells.filter((c) => c.corr >= 0.75 && c.amp >= amp).length >= 5;

  async function runPages(onStatus) {
    const names = ['02', '04', '05', '09', '10', '12', '13', '17'], pages = [];
    for (const n of names) {
      try { const b = await loadBmp(`_tests-scanner/${n}.jpg`); const k = 480 / Math.max(b.width, b.height), c = canvas(Math.round(b.width * k), Math.round(b.height * k)); c.getContext('2d').drawImage(b, 0, 0, c.width, c.height); pages.push([n, c]); } catch (e) { /* photos absentes (site en ligne) */ }
    }
    if (!pages.length) return [];
    const rows = [];
    for (const [n, pg] of pages) {
      for (const L of LIGHTS) for (const K of PKINDS) for (let k = 0; k < 8; k++) {
        const res = simulatePage(pg, L, K.id, hashStr(n + L.id + K.id + k));
        rows.push({ page: n, light: L.id, kind: K.id, ok: K.ok, p4: pageOk(res, 0.04), p25: pageOk(res, 0.025), whole: res.whole.corr >= 0.75 && res.whole.amp >= 0.04, amp: res.whole.amp });
      }
      onStatus(`Classeur : page ${n}`);
      await tick();
    }
    return rows;
  }

  async function runLamp() {
    $('#go2').disabled = true;
    try {
      const st = (m) => { $('#status2').textContent = m; };
      if (!state.cards.length) { $('#o-off').checked = false; await loadAll(); }
      const t0 = performance.now();
      const rr = await runRafale(st), pr = await runPages(st);
      window.__lamp = { rr, pr };
      const rate = (a, f) => pctTxt(a.filter(f).length, a.length);
      let h = `<h2>Rafale : lampe pendant la face (${rr.length} vidéos)</h2><div class="box scroll"><table><tr><th>Situation</th><th>Attendu</th>${CODES.map((c) => `<th>Sans lampe (E)</th><th>E + ${esc(c.name)}</th>`).join('')}</tr>`;
      for (const [id, ok, name] of R_BASE) {
        h += `<tr><td>${esc(name)}</td><td>${ok ? 'certifiée' : 'refusée'}</td>`;
        for (const c of CODES) { const x = rr.filter((r) => r.code === c.id && r.id === id); h += `<td class="n">${rate(x, (r) => r.E === ok)}</td><td class="n">${rate(x, (r) => r.F === ok)}</td>`; }
        h += '</tr>';
      }
      for (const [lab, ok] of [['Vrais gestes certifiés', true], ['Tricheries refusées', false]]) {
        h += `<tr><td><b>${lab}</b></td><td></td>`;
        for (const c of CODES) { const x = rr.filter((r) => r.code === c.id && r.ok === ok); h += `<td class="n"><b>${rate(x, (r) => r.E === ok)}</b></td><td class="n"><b>${rate(x, (r) => r.F === ok)}</b></td>`; }
        h += '</tr>';
      }
      h += '</table></div>';
      if (pr.length) {
        h += `<h2>Classeur : lampe sur la page (${pr.length} vidéos)</h2><div class="box scroll"><table><tr><th>Situation</th>${LIGHTS.map((L) => `<th>${esc(L.name)}<br>seuil 4 %</th><th>seuil 2,5 %</th>`).join('')}</tr>`;
        for (const K of PKINDS) {
          h += `<tr><td>${esc(K.name)} — ${K.ok ? 'à certifier' : 'à refuser'}</td>`;
          for (const L of LIGHTS) { const x = pr.filter((r) => r.kind === K.id && r.light === L.id); h += `<td class="n">${rate(x, (r) => r.p4 === K.ok)}</td><td class="n">${rate(x, (r) => r.p25 === K.ok)}</td>`; }
          h += '</tr>';
        }
        h += '</table><p class="lead" style="margin-top:8px">Bonne décision : vraie page acceptée, tricherie refusée. Seuil = hausse de lumière minimale exigée sur au moins 5 des 9 cases.</p></div>';
      }
      $('#results2').innerHTML = h;
      st(`Terminé en ${Math.round((performance.now() - t0) / 1000)} s.`);
    } finally { $('#go2').disabled = false; }
  }
  $('#go2').addEventListener('click', runLamp);
  $('#go').addEventListener('click', runAll);
  $('#p-go').addEventListener('click', play);
  window.__laboApi = { runLamp, runRafale, runPages, tick, state, SCEN, ALGOS, simulate, judge, loadAll, runAll, summarize, core, squeezeScore, silScore, silhouette, hashStr };
})();
