/* Reconnaissance — partie 2/5 : géométrie (page de classeur, grille, bords réels, découpe et redressement des cartes). Voir recognizer-text.js. */
(() => {

  /**
   * Trouve la carte dans une zone de photo (pochette de classeur) : on cherche le rectangle
   * au format carte (63 × 88) dont les bords sont les plus nets. Gère les marges entre pochettes
   * et les cartes un peu décalées. Renvoie { x, y, w, h } en pixels de l'image, ou null.
   */
  function locateCard(img, rect, minFrac = 0.6) {
    const R = 63 / 88;
    const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
    // on cherche un peu au-delà de la case, au cas où la grille n'est pas parfaitement posée
    const mx = rect.w * 0.08, my = rect.h * 0.08;
    const ax = Math.max(0, rect.x - mx), ay = Math.max(0, rect.y - my);
    const aw = Math.min(W - ax, rect.w + 2 * mx), ah = Math.min(H - ay, rect.h + 2 * my);
    const S = 160 / aw; // travail sur une petite image
    const cw = Math.max(20, Math.round(aw * S)), ch = Math.max(20, Math.round(ah * S));
    const c = document.createElement('canvas'); c.width = cw; c.height = ch;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.filter = 'grayscale(1) blur(0.6px)';
    g.drawImage(img, ax, ay, aw, ah, 0, 0, cw, ch);
    const p = g.getImageData(0, 0, cw, ch).data;
    const gray = new Float32Array(cw * ch);
    for (let i = 0; i < gray.length; i++) gray[i] = p[i * 4];
    // bords horizontaux (haut/bas) et verticaux (gauche/droite)
    const eh = new Float32Array(cw * ch), ev = new Float32Array(cw * ch);
    for (let y = 1; y < ch - 1; y++) for (let x = 1; x < cw - 1; x++) {
      const i = y * cw + x;
      eh[i] = Math.abs(gray[i + cw] - gray[i - cw]);
      ev[i] = Math.abs(gray[i + 1] - gray[i - 1]);
    }
    // sommes cumulées par ligne (pour eh) et par colonne (pour ev) → somme d'un segment en O(1)
    const rowC = new Float32Array((cw + 1) * ch), colC = new Float32Array((ch + 1) * cw);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) rowC[y * (cw + 1) + x + 1] = rowC[y * (cw + 1) + x] + eh[y * cw + x];
    for (let x = 0; x < cw; x++) for (let y = 0; y < ch; y++) colC[x * (ch + 1) + y + 1] = colC[x * (ch + 1) + y] + ev[y * cw + x];
    const rowSum = (y, x0, x1) => { let best = 0; for (let d = -1; d <= 1; d++) { const yy = y + d; if (yy < 0 || yy >= ch) continue; const v = rowC[yy * (cw + 1) + x1] - rowC[yy * (cw + 1) + x0]; if (v > best) best = v; } return best; };
    const colSum = (x, y0, y1) => { let best = 0; for (let d = -1; d <= 1; d++) { const xx = x + d; if (xx < 0 || xx >= cw) continue; const v = colC[xx * (ch + 1) + y1] - colC[xx * (ch + 1) + y0]; if (v > best) best = v; } return best; };
    const cellW = rect.w * S, cellH = rect.h * S;
    const maxW = Math.min(cw - 2, (ch - 2) * R, Math.max(cellW, cellH * R) * 1.05);
    const minW = Math.min(cellW, cellH * R) * minFrac;
    let best = null;
    for (let w = Math.floor(maxW); w >= minW; w -= 1.5) {
      const h = w / R;
      for (let y = 1; y + h < ch - 1; y += 1.5) {
        const yi = Math.round(y), yb = Math.round(y + h);
        for (let x = 1; x + w < cw - 1; x += 1.5) {
          const xi = Math.round(x), xr = Math.round(x + w);
          // moyenne de netteté sur les 4 côtés ; on pénalise un côté beaucoup plus faible que les autres
          const t = rowSum(yi, xi, xr) / w, b = rowSum(yb, xi, xr) / w, l = colSum(xi, yi, yb) / h, r = colSum(xr, yi, yb) / h;
          const score = (t + b + l + r) / 4 + Math.min(t, b, l, r) * 0.8;
          if (!best || score > best.score) best = { score, x, y, w, h };
        }
      }
    }
    if (!best) return null;
    // la carte doit ressortir nettement par rapport au reste de la zone
    let mean = 0; for (let i = 0; i < eh.length; i++) mean += eh[i] + ev[i]; mean /= eh.length * 2;
    if (best.score < mean * 2.2) return null;
    return { x: ax + best.x / S, y: ay + best.y / S, w: best.w / S, h: best.h / S, score: best.score / (mean || 1) };
  }

  /**
   * Grille d'une page de classeur, trouvée toute seule.
   * On mesure où se trouvent les longs bords verticaux et horizontaux (les bords des cartes),
   * puis on cherche la grille régulière (cols × rows cartes, même taille, même écart) qui tombe dessus.
   * Renvoie { x, y, w, h } en fraction de l'image (la zone des pochettes) et une confiance, ou null.
   */
  function detectGrid(img, cols, rows, pre = null, asp = 63 / 88) {
    const P = pre || gridProfiles(img);
    const { V, Hp, Vs, Hs, W, H } = P;
    const fx = fitAxis(V, cols, W), fy = fitAxis(Hp, rows, H);
    const midW = (F) => F.ws[F.ws.length >> 1];
    let best = null;
    for (const X of fx) for (const Y of fy) {
      const pen = Math.abs(Math.log((midW(X) / midW(Y)) / asp));
      if (pen > 0.22) continue; // forme de carte impossible
      const gapPen = Math.abs(X.p - X.w - (Y.p - Y.w)) / Math.max(X.p, Y.p) * 2; // écarts entre pochettes comparables
      const score = X.score + Y.score - pen * 4 - gapPen;
      if (!best || score > best.score) best = { score, X, Y };
    }
    if (!best) return null;
    const { X, Y } = best;
    const edgesOf = (F, n) => { const e = []; for (let k = 0; k < n; k++) e.push(F.a + F.st[k], F.a + F.st[k] + F.ws[k]); return e; };
    const EX = edgesOf(X, cols), EY = edgesOf(Y, rows);
    // pente de chaque bord (moyenne pondérée autour de sa position)
    const slopeAt = (Prof, Sl, pos, len) => {
      const t = Math.max(2, Math.round(len * 0.012)); let s = 0, n = 0;
      for (let i = Math.round(pos) - t; i <= Math.round(pos) + t; i++) if (i >= 0 && i < len) { s += Sl[i] * Prof[i]; n += Prof[i]; }
      return n ? s / n : 0;
    };
    const SX = EX.map((e) => slopeAt(V, Vs, e, W)), SY = EY.map((e) => slopeAt(Hp, Hs, e, H));
    // intersection d'un bord vertical (x = ex + sx·(y − H/2)) et d'un bord horizontal (y = ey + sy·(x − W/2))
    const cross = (ex, sx, ey, sy) => { const x = (ex + sx * (ey - sy * W / 2 - H / 2)) / (1 - sx * sy); return [x, ey + sy * (x - W / 2)]; };
    const clamp = (v) => Math.max(0, Math.min(1, v));
    const cells = [];
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const q = [cross(EX[2 * i], SX[2 * i], EY[2 * j], SY[2 * j]), cross(EX[2 * i + 1], SX[2 * i + 1], EY[2 * j], SY[2 * j]),
        cross(EX[2 * i + 1], SX[2 * i + 1], EY[2 * j + 1], SY[2 * j + 1]), cross(EX[2 * i], SX[2 * i], EY[2 * j + 1], SY[2 * j + 1])];
      const xs = q.map((p) => p[0]), ys = q.map((p) => p[1]);
      const bx0 = clamp(Math.min(...xs) / W), by0 = clamp(Math.min(...ys) / H), bx1 = clamp(Math.max(...xs) / W), by1 = clamp(Math.max(...ys) / H);
      cells.push({ x: bx0, y: by0, w: bx1 - bx0, h: by1 - by0, quad: q.map(([a, b]) => [a / W, b / H]) });
    }
    const gxp = (X.p - X.w) / 2, gyp = (Y.p - Y.w) / 2;
    const x0 = clamp(Math.min(...cells.map((c) => c.x)) - gxp / W), y0 = clamp(Math.min(...cells.map((c) => c.y)) - gyp / H);
    const x1 = clamp(Math.max(...cells.map((c) => c.x + c.w)) + gxp / W), y1 = clamp(Math.max(...cells.map((c) => c.y + c.h)) + gyp / H);
    // part des grands bords de la photo expliquée par cette grille (sert à choisir le bon format de page)
    const explained = (Prof, F, n, len) => {
      const t = Math.max(2, Math.round(len * 0.015));
      let mx = 0; for (const v of Prof) if (v > mx) mx = v;
      const edges = edgesOf(F, n);
      let tot = 0, ok = 0;
      for (let i = 1; i < len - 1; i++) {
        const v = Prof[i]; if (v < mx * 0.3) continue;
        let isMax = true; for (let d = -t; d <= t; d++) if (Prof[i + d] > v) { isMax = false; break; }
        if (!isMax) continue;
        tot += v; if (edges.some((e) => Math.abs(e - i) <= t * 1.5)) ok += v;
      }
      return tot ? ok / tot : 0;
    };
    const fit = (explained(V, X, cols, W) + explained(Hp, Y, rows, H)) / 2;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, score: best.score, sx: X.score, sy: Y.score, extra: Math.max(X.extra, Y.extra), inner: Math.max(X.inner || 0, Y.inner || 0), fit, cells };
  }

  /**
   * Profils des longs bords droits de la photo (calculés une fois pour tous les formats).
   * Chaque bord est suivi le long d'une droite un peu penchée (photo tournée, prise en biais) :
   * pour chaque position on garde la pente qui colle le mieux (V[x] et sa pente Vs[x], idem pour les lignes).
   */
  function gridProfiles(img) {
    const W0 = img.naturalWidth || img.width, H0 = img.naturalHeight || img.height;
    const S = 300 / Math.max(W0, H0);
    const W = Math.max(40, Math.round(W0 * S)), H = Math.max(40, Math.round(H0 * S));
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.filter = 'grayscale(1) blur(0.6px)';
    g.drawImage(img, 0, 0, W, H);
    const px = g.getImageData(0, 0, W, H).data;
    const gray = new Float32Array(W * H);
    for (let i = 0; i < gray.length; i++) gray[i] = px[i * 4];
    const gx = new Float32Array(W * H), gy = new Float32Array(W * H);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x; gx[i] = gray[i + 1] - gray[i - 1]; gy[i] = gray[i + W] - gray[i - W]; }
    // gradient signé : le long d'un vrai bord (carte / pochette), il garde le même signe ; le bruit et le texte s'annulent
    const L = Math.max(6, Math.round(Math.min(W, H) / 22));
    const SL = []; for (let s = -0.1; s <= 0.1001; s += 0.02) SL.push(Math.round(s * 100) / 100);
    const scan = (n, len, get) => {
      const P = new Float32Array(n), Ps = new Float32Array(n), buf = new Float32Array(L);
      for (const s of SL) for (let a = 0; a < n; a++) {
        let run = 0, acc = 0; buf.fill(0);
        for (let t = 0; t < len; t++) {
          const u = Math.round(a + s * (t - len / 2));
          const v = u >= 1 && u < n - 1 ? get(u, t) : 0;
          run += v - buf[t % L]; buf[t % L] = v;
          if (t >= L - 1) { const m = Math.abs(run) / L; if (m > 6) acc += m - 6; }
        }
        if (acc > P[a]) { P[a] = acc; Ps[a] = s; }
      }
      return [P, Ps];
    };
    const [V, Vs] = scan(W, H, (x, y) => gx[y * W + x]);
    const [Hp, Hs] = scan(H, W, (y, x) => gy[y * W + x]);
    return { V, Hp, Vs, Hs, W, H };
  }

  /** Meilleures grilles sur un axe : n cartes de taille w, espacées de p, à partir de a */
  function fitAxis(P, n, len) {
    const t = Math.max(1, Math.round(len * 0.012));
    const Pk = new Float32Array(len);
    for (let i = 0; i < len; i++) { let m = 0; for (let d = -t; d <= t; d++) { const j = i + d; if (j >= 0 && j < len && P[j] > m) m = P[j]; } Pk[i] = m; }
    let mu = 0; for (const v of P) mu += v; mu = mu / len || 1;
    const at = (x) => { const i = Math.round(x); return i >= 0 && i < len ? Pk[i] : 0; };
    // plus fort bord à l'intérieur d'une carte (hors marges) : une séparation de pochettes au milieu = mauvais format
    const inner = (x0, x1) => { let m = 0; for (let i = Math.round(x0); i <= x1; i++) if (i >= 0 && i < len && P[i] > m) m = P[i]; return m; };
    const out = []; let thr = -Infinity;
    // r : photo prise en biais, les cartes du fond paraissent un peu plus petites (perspective)
    const RS = n > 1 ? [0.84, 0.9, 0.95, 1, 1.05, 1.1, 1.18] : [1];
    for (const r of RS) for (let p = len * 0.35 / n; p <= len / n + 0.01; p += 1) {
      for (let w = p * 0.8; w <= p - 0.5; w += 1) {
        const st = [0], ws = []; let sp = p, sw = w;
        for (let k = 0; k < n; k++) { ws.push(sw); st.push(st[k] + sp); sp *= r; sw *= r; }
        const span = st[n - 1] + ws[n - 1];
        for (let a = 0; a + span <= len; a += 1) {
          let s = 0, low = Infinity;
          for (let k = 0; k < n; k++) { const e = Math.min(at(a + st[k]), at(a + st[k] + ws[k])); s += e; if (e < low) low = e; }
          // une rangée de cartes en plus juste à côté = la grille est incomplète ou décalée
          const extra = Math.max(Math.min(at(a - p / r), at(a - p / r + w / r)), Math.min(at(a + st[n]), at(a + st[n] + ws[n - 1] * r)));
          // la perspective est permise mais coûte un peu (sinon elle sert à « tricher » sur des bords voisins)
          const score = (s / n + low * 0.5 - extra * 0.9) / mu - Math.abs(Math.log(r)) * 4;
          if (score <= thr) continue;
          out.push({ p, w, a, r, st, ws, score, extra: extra / mu, low });
          if (out.length > 20000) { out.sort((x, y) => y.score - x.score); out.length = 2000; thr = out[1999].score; }
        }
      }
    }
    // pénalité « séparation au milieu d'une carte » sur les meilleurs seulement (calcul plus lourd)
    out.sort((x, y) => y.score - x.score);
    const top = out.slice(0, 600);
    for (const o of top) {
      let m = 0; for (let k = 0; k < n; k++) m = Math.max(m, inner(o.a + o.st[k] + o.ws[k] * 0.18, o.a + o.st[k] + o.ws[k] * 0.82));
      o.inner = m / mu; o.score -= Math.max(0, m - o.low * 0.7) / mu * 0.8;
    }
    top.sort((x, y) => y.score - x.score);
    const keep = [];
    for (const o of top) { if (keep.every((k) => Math.abs(k.a - o.a) > 2 || Math.abs(k.p - o.p) > 2 || Math.abs(k.w - o.w) > 2 || k.r !== o.r)) keep.push(o); if (keep.length >= 30) break; }
    return keep;
  }

  /** Homographie qui envoie le carré unité (0,0)(1,0)(1,1)(0,1) sur le quadrilatère q */
  function squareToQuad(q) {
    const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
    const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
    const den = dx1 * dy2 - dx2 * dy1 || 1e-9;
    const g = (dx3 * dy2 - dx2 * dy3) / den, h = (dx1 * dy3 - dx3 * dy1) / den;
    const a = x1 - x0 + g * x1, b = x3 - x0 + h * x3, d = y1 - y0 + g * y1, e = y3 - y0 + h * y3;
    return (u, v) => { const w = g * u + h * v + 1; return [(a * u + b * v + x0) / w, (d * u + e * v + y0) / w]; };
  }

  /**
   * Image redressée d'une pochette : le quadrilatère de la case (photo tournée ou en biais) est remis à plat,
   * puis on cherche les bords exacts de la carte à l'intérieur. rot : 90 / -90 si les cartes sont couchées.
   * Renvoie { canvas, box (rectangle englobant, en fraction de la page), auto (bords de la carte trouvés) }.
   */
  function cellCard(img, cell, rot = 0) {
    const NW = img.naturalWidth || img.width, NH = img.naturalHeight || img.height;
    const q = (cell.quad || [[cell.x, cell.y], [cell.x + cell.w, cell.y], [cell.x + cell.w, cell.y + cell.h], [cell.x, cell.y + cell.h]]).map(([x, y]) => [x * NW, y * NH]);
    const f = squareToQuad(q), m = 0.1;
    const dist = (p, r) => Math.hypot(p[0] - r[0], p[1] - r[1]);
    const qw = (dist(q[0], q[1]) + dist(q[3], q[2])) / 2, qh = (dist(q[0], q[3]) + dist(q[1], q[2])) / 2;
    const k = Math.min(1, 1000 / Math.max(qw, qh));
    const cw = Math.max(40, Math.round(qw * k)), ch = Math.max(40, Math.round(qh * k));
    const OW = Math.round(cw * (1 + 2 * m)), OH = Math.round(ch * (1 + 2 * m));
    // pixels de la zone utile de la photo
    const corners = [[-m, -m], [1 + m, -m], [1 + m, 1 + m], [-m, 1 + m]].map(([u, v]) => f(u, v));
    const sx0 = Math.max(0, Math.floor(Math.min(...corners.map((p) => p[0])))), sy0 = Math.max(0, Math.floor(Math.min(...corners.map((p) => p[1]))));
    const sx1 = Math.min(NW, Math.ceil(Math.max(...corners.map((p) => p[0])))), sy1 = Math.min(NH, Math.ceil(Math.max(...corners.map((p) => p[1]))));
    const SW = Math.max(1, sx1 - sx0), SH = Math.max(1, sy1 - sy0);
    const sc = document.createElement('canvas'); sc.width = SW; sc.height = SH;
    sc.getContext('2d').drawImage(img, sx0, sy0, SW, SH, 0, 0, SW, SH);
    const src = sc.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, SW, SH).data;
    const out = document.createElement('canvas'); out.width = OW; out.height = OH;
    const og = out.getContext('2d'); const od = og.createImageData(OW, OH); const D = od.data;
    for (let py = 0; py < OH; py++) {
      const v = (py + 0.5) / OH * (1 + 2 * m) - m;
      for (let px = 0; px < OW; px++) {
        const u = (px + 0.5) / OW * (1 + 2 * m) - m;
        let [x, y] = f(u, v); x -= sx0 + 0.5; y -= sy0 + 0.5;
        const o = (py * OW + px) * 4;
        if (x < 0 || y < 0 || x > SW - 1 || y > SH - 1) { D[o] = D[o + 1] = D[o + 2] = 0; D[o + 3] = 255; continue; }
        const xi = x | 0, yi = y | 0, fx = x - xi, fy = y - yi, x2 = Math.min(SW - 1, xi + 1), y2 = Math.min(SH - 1, yi + 1);
        const i00 = (yi * SW + xi) * 4, i10 = (yi * SW + x2) * 4, i01 = (y2 * SW + xi) * 4, i11 = (y2 * SW + x2) * 4;
        for (let c = 0; c < 3; c++) D[o + c] = (src[i00 + c] * (1 - fx) + src[i10 + c] * fx) * (1 - fy) + (src[i01 + c] * (1 - fx) + src[i11 + c] * fx) * fy;
        D[o + 3] = 255;
      }
    }
    og.putImageData(od, 0, 0);
    // cartes couchées : on tourne la case d'un quart de tour (le haut de la carte en haut)
    let pic = out, PW = OW, PH = OH, inner = { x: cw * m, y: ch * m, w: cw, h: ch };
    if (rot) {
      pic = document.createElement('canvas'); pic.width = OH; pic.height = OW; PW = OH; PH = OW;
      const pg = pic.getContext('2d'); pg.translate(OH / 2, OW / 2); pg.rotate(rot * Math.PI / 180); pg.drawImage(out, -OW / 2, -OH / 2);
      inner = { x: ch * m, y: cw * m, w: ch, h: cw };
    }
    // bords exacts de la carte dans la pochette redressée ; sinon la case entière
    let b = null;
    try { b = refineCell(pic, inner); } catch (e) { b = null; }
    // bords trouvés acceptés seulement s'ils sont proches de ceux de la case (sinon on garde la case : plus sûr)
    const near = b && Math.abs(b.x - inner.x) <= inner.w * 0.08 && Math.abs(b.x + b.w - inner.x - inner.w) <= inner.w * 0.08
      && Math.abs(b.y - inner.y) <= inner.h * 0.07 && Math.abs(b.y + b.h - inner.y - inner.h) <= inner.h * 0.07;
    const auto = !!near;
    if (!auto) b = inner;
    else { // petite marge : le bord trouvé est parfois le cadre intérieur, et le numéro est tout en bas de la carte
      const ex = b.w * 0.02, ey = b.h * 0.02;
      const x0 = Math.max(0, b.x - ex), y0 = Math.max(0, b.y - ey);
      b = { x: x0, y: y0, w: Math.min(PW - x0, b.w + 2 * ex), h: Math.min(PH - y0, b.h + 2 * ey) };
    }
    const fw = Math.min(900, Math.round(b.w)), fh = Math.round(fw / (63 / 88));
    const fin = document.createElement('canvas'); fin.width = fw; fin.height = fh;
    fin.getContext('2d').drawImage(pic, b.x, b.y, b.w, b.h, 0, 0, fw, fh);
    // rectangle englobant de la carte dans la page (pour recadrer plus tard)
    const back = ([x, y]) => { // point de « pic » → point de « out »
      if (!rot) return [x, y];
      const dx = x - PW / 2, dy = y - PH / 2, a = -rot * Math.PI / 180;
      return [dx * Math.cos(a) - dy * Math.sin(a) + OW / 2, dx * Math.sin(a) + dy * Math.cos(a) + OH / 2];
    };
    const pts = [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]].map(back).map(([x, y]) => f((x / OW) * (1 + 2 * m) - m, (y / OH) * (1 + 2 * m) - m));
    const bx0 = Math.max(0, Math.min(...pts.map((p) => p[0]))), by0 = Math.max(0, Math.min(...pts.map((p) => p[1])));
    const bx1 = Math.min(NW, Math.max(...pts.map((p) => p[0]))), by1 = Math.min(NH, Math.max(...pts.map((p) => p[1])));
    return { canvas: fin, auto, box: { x: bx0 / NW, y: by0 / NH, w: (bx1 - bx0) / NW, h: (by1 - by0) / NH } };
  }

  /**
   * Détourage d'une carte seule (caméra, rafale) : on trouve ses 4 bords, même un peu penchés ou en perspective,
   * puis on la remet à plat AU RAS de ses bords (plus de table ni de marge autour).
   * Chaque bord : sur chaque ligne (ou colonne), le premier contraste net en venant de l'extérieur,
   * puis une droite ajustée en ignorant les points aberrants (reflets, doigts). Les 4 droites se coupent aux coins.
   * rect : zone où se trouve la carte (fractions de l'image). Renvoie { canvas, quad, fit } ou null si pas sûr.
   * expect : quadrilatère attendu (fractions ; ex. la pochette trouvée par la grille) → on ne garde que des bords
   *   proches de lui (±12 %), le plus proche l'emporte : pas de bord de pochette voisine ni de reflet lointain.
   * warp = false : seulement les coins (quad), sans image remise à plat.
   */
  /** Quadrilatère (pixels, coins dans l'ordre haut-gauche, haut-droit, bas-droit, bas-gauche) en forme de carte debout ? */
  function plausibleQuad(q) {
    const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const top = d(q[0], q[1]), right = d(q[1], q[2]), bottom = d(q[2], q[3]), left = d(q[3], q[0]);
    if (!top || !right || !bottom || !left) return false;
    const r1 = top / bottom, r2 = left / right, ar = (top + bottom) / (left + right);
    return r1 > 0.82 && r1 < 1.22 && r2 > 0.82 && r2 < 1.22 && ar > 0.6 && ar < 0.84;
  }
  function cutCard(img, rect = { x: 0, y: 0, w: 1, h: 1 }, { expect = null, warp = true, sizeCheck = null, noSleeve = false } = {}) {
    const NW = img.naturalWidth || img.width, NH = img.naturalHeight || img.height;
    // zone de recherche : la zone donnée + 8 % (la carte peut dépasser un peu du cadre jaune) ;
    // + 14 % autour d'une case de classeur (la grille, régulière, peut être décalée d'une rangée à l'autre)
    const mg = expect ? 0.14 : 0.08;
    const ax = Math.max(0, (rect.x - rect.w * mg) * NW), ay = Math.max(0, (rect.y - rect.h * mg) * NH);
    const aw = Math.min(NW - ax, rect.w * (1 + 2 * mg) * NW), ah = Math.min(NH - ay, rect.h * (1 + 2 * mg) * NH);
    const S = 320 / Math.max(aw, ah), w = Math.max(40, Math.round(aw * S)), h = Math.max(40, Math.round(ah * S));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.filter = 'grayscale(1) blur(0.8px)';
    g.drawImage(img, ax, ay, aw, ah, 0, 0, w, h);
    const px = g.getImageData(0, 0, w, h).data, G = new Float32Array(w * h);
    for (let i = 0; i < G.length; i++) G[i] = px[i * 4];
    const at = (x, y) => G[y * w + x];
    // mêmes pixels en couleurs (pour reconnaître la bordure de la carte)
    let Cp = null;
    { const cc = document.createElement('canvas'); cc.width = w; cc.height = h; const cg = cc.getContext('2d', { willReadFrequently: true }); cg.drawImage(img, ax, ay, aw, ah, 0, 0, w, h); Cp = cg.getImageData(0, 0, w, h).data; }
    // carte seule (v2.91) : la couleur compte aussi — un dos rouge sur un fond gris a presque la même luminosité
    // (≈ 105 contre 120 : bord de la carte invisible en gris, seul celui de la pochette ressortait → marge sur la photo)
    if (!expect && Cp) for (let i = 0; i < G.length; i++) { const r = Cp[i * 4], gg = Cp[i * 4 + 1], bb = Cp[i * 4 + 2]; G[i] = 0.65 * G[i] + 0.35 * (Math.max(r, gg, bb) - Math.min(r, gg, bb)); }
    const col = (x, y) => { const xi = Math.min(w - 1, Math.max(0, Math.round(x))), yi = Math.min(h - 1, Math.max(0, Math.round(y))), i = (yi * w + xi) * 4; return [Cp[i], Cp[i + 1], Cp[i + 2]]; };
    /**
     * Bordure d'une carte : juste À L'INTÉRIEUR du vrai bord, une bande d'une seule couleur tout autour (jaune, argent…),
     * qui tranche avec ce qu'il y a juste à l'extérieur. Le bord d'une pochette (plastique des deux côtés) ou le cadre
     * intérieur de la carte (dessin ou texte à l'intérieur) n'ont pas cette signature.
     */
    function borderScore(q) {
      const cx = (q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4, cy = (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4;
      const qw = (dist(q[0], q[1]) + dist(q[3], q[2])) / 2, d = qw * 0.022;
      const mean = (L) => [0, 1, 2].map((k) => L.reduce((a, p) => a + p[k], 0) / L.length);
      const allIn = [], per = [];
      // côté par côté : un seul côté faux (ex. le haut coupé à la barre du nom) doit faire baisser la note
      for (let s = 0; s < 4; s++) {
        const A = q[s], B = q[(s + 1) % 4], ins = [], outs = [];
        for (let t = 0.1; t < 0.92; t += 0.06) {
          const x = A[0] + (B[0] - A[0]) * t, y = A[1] + (B[1] - A[1]) * t;
          const nx = cx - x, ny = cy - y, nl = Math.hypot(nx, ny) || 1;
          ins.push(col(x + nx / nl * d, y + ny / nl * d)); outs.push(col(x - nx / nl * d, y - ny / nl * d));
        }
        const mi = mean(ins), mo = mean(outs);
        const sd = Math.sqrt(ins.reduce((a, p) => a + (p[0] - mi[0]) ** 2 + (p[1] - mi[1]) ** 2 + (p[2] - mi[2]) ** 2, 0) / ins.length / 3);
        per.push(Math.hypot(mi[0] - mo[0], mi[1] - mo[1], mi[2] - mo[2]) / (25 + sd));
        allIn.push(mi);
      }
      // la bordure a la même couleur sur les 4 côtés
      const m4 = mean(allIn), spread = Math.sqrt(allIn.reduce((a, p) => a + (p[0] - m4[0]) ** 2 + (p[1] - m4[1]) ** 2 + (p[2] - m4[2]) ** 2, 0) / 4 / 3);
      borderScore.last = { per: per.map((v) => Math.round(v * 100) / 100), spread: Math.round(spread) };
      return (per.reduce((a, b) => a + b, 0) / 4 + Math.min(...per)) / 2 - spread / 60;
    }
    // contraste horizontal (bords gauche/droite) ou vertical (haut/bas), lissé sur 3 pixels le long du bord
    const gx = (x, y) => Math.abs((at(x + 1, y - 1) + at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + at(x - 1, y) + at(x - 1, y + 1))) / 3;
    const gy = (x, y) => Math.abs((at(x - 1, y + 1) + at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + at(x, y - 1) + at(x + 1, y - 1))) / 3;
    // points candidats d'un bord : sur chaque ligne (ou colonne), les contrastes nets (maxima locaux)
    // dans le tiers extérieur de la zone
    function edge(side) {
      const pts = [], vert = side === 'L' || side === 'R';
      const along = vert ? h : w, across = vert ? w : h, out = side === 'L' || side === 'T';
      const lim = Math.round(across * 0.36);
      for (let t = Math.round(along * 0.1); t < along * 0.9; t += 2) {
        const vals = [0];
        for (let k = 1; k < lim; k++) { const p = out ? k : across - 1 - k; vals.push(vert ? gx(p, t) : gy(t, p)); }
        const m = Math.max(...vals); if (m < 14) continue;
        for (let k = 2; k < vals.length - 1; k++) {
          if (vals[k] >= Math.max(12, m * 0.35) && vals[k] >= vals[k - 1] && vals[k] > vals[k + 1]) {
            const p = out ? k : across - 1 - k;
            pts.push({ s: t, v: p, wgt: vals[k] });
          }
        }
      }
      return pts;
    }
    // quelques droites robustes par côté (le bord de la carte, mais aussi celui de la pochette, d'une carte voisine…)
    // vert → x = a·y + b ; sinon y = a·x + b
    function lines(pts, along) {
      const found = [];
      let rest = pts, seed = 12345;
      const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
      const nLines = Math.round((along * 0.8) / 2); // nombre de lignes de mesure
      for (let pass = 0; pass < 4 && rest.length >= 12; pass++) {
        let best = null;
        for (let it = 0; it < 120; it++) {
          const p = rest[Math.floor(rnd() * rest.length)], q = rest[Math.floor(rnd() * rest.length)];
          if (Math.abs(q.s - p.s) < along * 0.3) continue;
          const a = (q.v - p.v) / (q.s - p.s); if (Math.abs(a) > 0.25) continue;
          const b = p.v - a * p.s;
          const inl = rest.filter((o) => Math.abs(o.v - (a * o.s + b)) <= 1.8);
          const span = new Set(inl.map((o) => o.s)).size;
          if (!best || span > best.span) best = { a, b, inl, span };
        }
        if (!best || best.span < nLines * 0.3) break;
        const n = best.inl.length; let sx = 0, sy = 0, sxx = 0, sxy = 0;
        for (const o of best.inl) { sx += o.s; sy += o.v; sxx += o.s * o.s; sxy += o.s * o.v; }
        const den = n * sxx - sx * sx; const a = den ? (n * sxy - sx * sy) / den : best.a, b = (sy - a * sx) / n;
        found.push({ a, b, frac: best.span / nLines });
        rest = rest.filter((o) => !best.inl.includes(o));
      }
      return found;
    }
    const Ls = lines(edge('L'), h), Rs = lines(edge('R'), h), Ts = lines(edge('T'), w), Bs = lines(edge('B'), w);
    if (!Ls.length || !Rs.length || !Ts.length || !Bs.length) return null;
    // coin = croisement d'un bord vertical (x = a·y + b) et d'un bord horizontal (y = c·x + d)
    const cross = (V, H) => { const x = (V.a * H.b + V.b) / (1 - V.a * H.a); return [x, H.a * x + H.b]; };
    const dist = (p, r) => Math.hypot(p[0] - r[0], p[1] - r[1]);
    // bords attendus (pochette de la grille), en coordonnées de la petite image : milieu de chaque côté
    const E = expect ? expect.map(([x, y]) => [(x * NW - ax) * S, (y * NH - ay) * S]) : null;
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const EM = E && { L: mid(E[0], E[3]), R: mid(E[1], E[2]), T: mid(E[0], E[1]), B: mid(E[3], E[2]), w: (dist(E[0], E[1]) + dist(E[3], E[2])) / 2, h: (dist(E[0], E[3]) + dist(E[1], E[2])) / 2 };
    // la combinaison de 4 bords qui forme le mieux une carte (proportions 63 × 88, bords bien marqués, assez grande)
    let pick = null; const all = []; // (all : tous les cadres possibles, pour la pochette → carte)
    for (const L of Ls) for (const R of Rs) for (const T of Ts) for (const B of Bs) {
      const q = [cross(L, T), cross(R, T), cross(R, B), cross(L, B)];
      const qw = (dist(q[0], q[1]) + dist(q[3], q[2])) / 2, qh = (dist(q[0], q[3]) + dist(q[1], q[2])) / 2;
      const ratio = qw / qh / (63 / 88);
      if (ratio < 0.9 || ratio > 1.1 || qh < rect.h * NH * S * 0.6 || Math.min(L.frac, R.frac, T.frac, B.frac) < 0.3) continue;
      let score;
      if (EM) {
        // écart de chaque bord trouvé au bord attendu, en fraction de la taille de la carte
        const dv = [Math.abs(L.a * EM.L[1] + L.b - EM.L[0]) / EM.w, Math.abs(R.a * EM.R[1] + R.b - EM.R[0]) / EM.w,
          Math.abs(T.a * EM.T[0] + T.b - EM.T[1]) / EM.h, Math.abs(B.a * EM.B[0] + B.b - EM.B[1]) / EM.h];
        if (Math.max(...dv) > 0.16) continue;
        // taille imposée (une carte fait toujours la même taille sur la page redressée)
        let sdev = 0;
        if (sizeCheck) { sdev = sizeCheck(q.map(([x, y]) => [(ax + x / S) / NW, (ay + y / S) / NH])); if (sdev > 0.05) continue; }
        const bs = borderScore(q);
        score = (L.frac + R.frac + T.frac + B.frac) * 0.5 - Math.abs(Math.log(ratio)) * 6 - (dv[0] + dv[1] + dv[2] + dv[3]) * 2 + bs * 3 - sdev * 20;
        if (!pick || score > pick.score) pick = { q, score, qw, qh, fit: Math.min(L.frac, R.frac, T.frac, B.frac), border: borderScore.last };
        continue;
      } else {
        if (!plausibleQuad(q)) continue; // (côtés opposés trop différents : pas une carte, v2.89)
        // à forme égale, le plus GRAND rectangle : le bord extérieur de la carte, pas le cadre jaune à l'intérieur
        score = (L.frac + R.frac + T.frac + B.frac) * 0.5 - Math.abs(Math.log(ratio)) * 6 + (qw * qh) / (w * h) * 4;
        // v3.04 : bordure de la carte (bande d'une seule couleur juste à l'intérieur du bord) — sans elle, le bord de la pochette
        // ou une ligne dans le dessin passait pour le bord (photo d'Arnaud : Fujitora coupé à gauche, pochette en haut et à droite)
        score += borderScore(q) * (cutCard.bw ?? 3);
      }
      const cand = { q, score, qw, qh, fit: Math.min(L.frac, R.frac, T.frac, B.frac) };
      all.push(cand);
      if (!pick || score > pick.score) pick = cand;
    }
    if (!pick || pick.fit < 0.3) return null;
    // v2.91 : carte dans une POCHETTE — le plus grand rectangle est souvent le bord de la pochette (marge de plastique
    // autour de la carte sur la photo, vu par Arnaud en Pokémon comme en One Piece). Un rectangle presque aussi grand
    // juste à l'intérieur, séparé par une bande qui ressemble au fond (plastique transparent), est la vraie carte.
    // Une bande COLORÉE (bordure jaune d'une carte Pokémon, bordure d'une carte One Piece) : on garde le grand.
    if (!EM && !noSleeve) {
      const ctr = (p) => [(p.q[0][0] + p.q[1][0] + p.q[2][0] + p.q[3][0]) / 4, (p.q[0][1] + p.q[1][1] + p.q[2][1] + p.q[3][1]) / 4];
      const [pcx, pcy] = ctr(pick);
      // les bords sont pris au 1er contraste en venant de l'extérieur : celui de la carte, juste derrière celui de la
      // pochette, n'est jamais vu → seconde recherche à l'intérieur du cadre trouvé, son bord retiré (1,2 %)
      let inner = null;
      try {
        const xs = pick.q.map((p) => ax + p[0] / S), ys = pick.q.map((p) => ay + p[1] / S);
        const bx0 = Math.min(...xs), by0 = Math.min(...ys), bw0 = Math.max(...xs) - bx0, bh0 = Math.max(...ys) - by0;
        const ins = 0.012, cx0 = bx0 + bw0 * ins, cy0 = by0 + bh0 * ins, cw0 = bw0 * (1 - 2 * ins), ch0 = bh0 * (1 - 2 * ins);
        const k2 = Math.min(1, 900 / Math.max(cw0, ch0)), sub = document.createElement('canvas');
        sub.width = Math.max(40, Math.round(cw0 * k2)); sub.height = Math.max(40, Math.round(ch0 * k2));
        sub.getContext('2d').drawImage(img, cx0, cy0, cw0, ch0, 0, 0, sub.width, sub.height);
        const r2 = cutCard(sub, { x: 0.01, y: 0.01, w: 0.98, h: 0.98 }, { warp: false, noSleeve: true });
        if (r2) {
          const q2 = r2.quad.map(([x, y]) => [((cx0 + x * cw0) - ax) * S, ((cy0 + y * ch0) - ay) * S]);
          const qw2 = (dist(q2[0], q2[1]) + dist(q2[3], q2[2])) / 2, qh2 = (dist(q2[0], q2[3]) + dist(q2[1], q2[2])) / 2;
          const cand = { q: q2, qw: qw2, qh: qh2, fit: r2.fit, score: pick.score };
          if (qw2 / pick.qw >= 0.88 && qw2 / pick.qw <= 0.985 && qh2 / pick.qh >= 0.9 && qh2 / pick.qh <= 0.99 && Math.hypot(ctr(cand)[0] - pcx, ctr(cand)[1] - pcy) <= pick.qw * 0.04) inner = cand;
        }
      } catch (e) { /* */ }
      if (inner) {
        // points du milieu de chaque côté : juste à l'extérieur de la pochette, et dans la bande pochette → carte
        const mean = (L) => [0, 1, 2].map((k) => L.reduce((a, p) => a + p[k], 0) / L.length);
        const outside = [], band = [];
        for (let s = 0; s < 4; s++) for (const t of [0.25, 0.5, 0.75]) {
          const a = pick.q[s], b = pick.q[(s + 1) % 4], ia = inner.q[s], ib = inner.q[(s + 1) % 4];
          const P = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], I = [ia[0] + (ib[0] - ia[0]) * t, ia[1] + (ib[1] - ia[1]) * t];
          const dx = P[0] - I[0], dy = P[1] - I[1], n = Math.hypot(dx, dy) || 1, k = Math.max(2, pick.qw * 0.015);
          outside.push(col(P[0] + dx / n * k, P[1] + dy / n * k)); band.push(col((P[0] + I[0]) / 2, (P[1] + I[1]) / 2));
        }
        const mo = mean(outside), mb = mean(band), d = Math.hypot(mo[0] - mb[0], mo[1] - mb[1], mo[2] - mb[2]);
        const sat = (c) => (Math.max(...c) - Math.min(...c)) / 255;
        cutCard.lastSleeve = { d: Math.round(d), satBand: +sat(mb).toFixed(2) };
        if (d < 45 && sat(mb) < 0.3) pick = inner; // bande ≈ fond, peu colorée : plastique de la pochette
      }
    }
    const q = pick.q.map(([x, y]) => [ax + x / S, ay + y / S]);
    const qw = pick.qw / S;
    if (q.some(([x, y]) => x < -2 || y < -2 || x > NW + 2 || y > NH + 2)) return null;
    // carte seule (v2.89) : le cadre trouvé doit avoir une forme de carte (côtés opposés presque égaux, 63 × 88) ;
    // sinon le recadrage « n'a pas de sens » (photo d'Arnaud : bord du haut 0,58, du bas 0,79 → carte coupée en biais)
    if (!expect && !plausibleQuad(q)) return null;
    const quad = q.map(([x, y]) => [x / NW, y / NH]);
    if (!warp) return { quad, fit: pick.fit, border: pick.border };
    return { canvas: warpQuad(img, q, Math.min(900, Math.round(qw))), quad, fit: pick.fit };
  }

  /** Remet à plat le quadrilatère q (pixels de l'image, coins HG, HD, BD, BG) en une carte de largeur fw, liseré e retiré */
  function warpQuad(img, q, fw, e = 0.004) {
    const NW = img.naturalWidth || img.width, NH = img.naturalHeight || img.height;
    const f = squareToQuad(q), fh = Math.round(fw * 88 / 63);
    const bx0 = Math.max(0, Math.floor(Math.min(...q.map((p) => p[0])))), by0 = Math.max(0, Math.floor(Math.min(...q.map((p) => p[1]))));
    const bx1 = Math.min(NW, Math.ceil(Math.max(...q.map((p) => p[0])))), by1 = Math.min(NH, Math.ceil(Math.max(...q.map((p) => p[1]))));
    const SW = Math.max(1, bx1 - bx0), SH = Math.max(1, by1 - by0);
    const sc = document.createElement('canvas'); sc.width = SW; sc.height = SH;
    sc.getContext('2d').drawImage(img, bx0, by0, SW, SH, 0, 0, SW, SH);
    const src = sc.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, SW, SH).data;
    const out = document.createElement('canvas'); out.width = fw; out.height = fh;
    const og = out.getContext('2d'), od = og.createImageData(fw, fh), D = od.data;
    for (let py = 0; py < fh; py++) {
      const v = e + (py + 0.5) / fh * (1 - 2 * e);
      for (let pxl = 0; pxl < fw; pxl++) {
        const u = e + (pxl + 0.5) / fw * (1 - 2 * e);
        let [x, y] = f(u, v); x -= bx0 + 0.5; y -= by0 + 0.5;
        x = Math.min(SW - 1, Math.max(0, x)); y = Math.min(SH - 1, Math.max(0, y));
        const xi = x | 0, yi = y | 0, fx = x - xi, fy = y - yi, x2 = Math.min(SW - 1, xi + 1), y2 = Math.min(SH - 1, yi + 1);
        const i00 = (yi * SW + xi) * 4, i10 = (yi * SW + x2) * 4, i01 = (y2 * SW + xi) * 4, i11 = (y2 * SW + x2) * 4;
        const o = (py * fw + pxl) * 4;
        for (let k = 0; k < 3; k++) D[o + k] = (src[i00 + k] * (1 - fx) + src[i10 + k] * fx) * (1 - fy) + (src[i01 + k] * (1 - fx) + src[i11 + k] * fx) * fy;
        D[o + 3] = 255;
      }
    }
    og.putImageData(od, 0, 0);
    return out;
  }

  /**
   * Cases d'une page de classeur (grille trouvée) → bords réels de chaque carte, cherchés près de sa case.
   * Renvoie pour chaque case son quadrilatère ajusté (fractions), ou null si ses bords ne sont pas sûrs.
   */
  /** Homographie (3 × 3) qui envoie les 4 points src sur les 4 points dst ; renvoie une fonction (x, y) → [x, y] */
  function homography(src, dst) {
    const A = [], b = [];
    for (let i = 0; i < 4; i++) {
      const [x, y] = src[i], [u, v] = dst[i];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
    }
    // élimination de Gauss (8 × 8)
    for (let c = 0; c < 8; c++) {
      let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
      for (let r = 0; r < 8; r++) {
        if (r === c) continue;
        const f = A[r][c] / (A[c][c] || 1e-12);
        for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k];
        b[r] -= f * b[c];
      }
    }
    const h = b.map((v, i) => v / (A[i][i] || 1e-12));
    return (x, y) => { const w = h[6] * x + h[7] * y + 1; return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w]; };
  }

  /**
   * Cases d'une page de classeur (grille trouvée) → bords réels de chaque carte, cherchés près de sa case.
   * Une carte a toujours la même taille : la page est « redressée » (vue de face, grâce aux coins de la grille),
   * et sur la page redressée toutes les cartes doivent avoir la même taille. Les cadres qui s'en écartent sont
   * rejetés, puis les cases restantes sont recherchées avec cette taille imposée.
   */
  function snapCells(img, cells, cols = 3, rows = 3) {
    snapCells.last = [];
    const NW = img.naturalWidth || img.width, NH = img.naturalHeight || img.height;
    const per = cols * rows;
    // redressement de chaque page (classeur ouvert : 2 pages à la suite) : image → plan de la page (1 unité = 1 case)
    const flat = [];
    for (let g0 = 0; g0 + per <= cells.length; g0 += per) {
      const c = (i) => cells[g0 + i].quad;
      const f = homography([c(0)[0], c(cols - 1)[1], c(per - 1)[2], c((rows - 1) * cols)[3]], [[0, 0], [cols, 0], [cols, rows], [0, rows]]);
      for (let i = 0; i < per; i++) flat[g0 + i] = f;
    }
    // taille d'un cadre sur la page redressée (largeur, hauteur en « cases »)
    const flatSize = (q, i) => {
      const f = flat[i]; if (!f) return null;
      const p = q.map(([x, y]) => f(x, y)), d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
      return [(d(p[0], p[1]) + d(p[3], p[2])) / 2, (d(p[0], p[3]) + d(p[1], p[2])) / 2];
    };
    const find = (c, sizeCheck = null) => {
      try {
        const xs = c.quad.map((p) => p[0]), ys = c.quad.map((p) => p[1]);
        const rect = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
        return cutCard(img, rect, { expect: c.quad, warp: false, sizeCheck });
      } catch (e) { return null; }
    };
    const first = cells.map((c) => find(c));
    const out = first.map((r) => (r ? r.quad : null));
    snapCells.last = first.map((r) => r && r.border);
    // taille de référence d'une carte sur la page redressée : médiane des cadres trouvés
    const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
    const sizes = out.map((q, i) => (q ? flatSize(q, i) : null)).filter(Boolean);
    if (sizes.length >= 3) {
      const W0 = med(sizes.map((s) => s[0])), H0 = med(sizes.map((s) => s[1]));
      const dev = (q, i) => { const s = flatSize(q, i); return s ? Math.max(Math.abs(s[0] - W0) / W0, Math.abs(s[1] - H0) / H0) : 1; };
      // cadres d'une autre taille : rejetés
      out.forEach((q, i) => { if (q && dev(q, i) > 0.04) out[i] = null; });
      // cases sans cadre : on cherche à nouveau, en imposant la taille d'une carte
      cells.forEach((c, i) => {
        if (out[i]) return;
        const r = find(c, (qFrac) => dev(qFrac, i));
        if (r) { out[i] = r.quad; snapCells.last[i] = r.border; }
      });
      snapCells.size = { w: W0, h: H0 };
    }
    const note = snapCells.last.map((b) => (b ? Math.min(...b.per) : -1)); // qualité de la bordure trouvée
    // deux cartes ne se touchent jamais : si deux cadres voisins se chevauchent (ou collent),
    //    celui dont la bordure est la moins nette est écarté
    const gap = 0.003; // écart minimal, en fraction de l'image
    const right = (q) => Math.max(q[1][0], q[2][0]), left = (q) => Math.min(q[0][0], q[3][0]);
    const bottom = (q) => Math.max(q[2][1], q[3][1]), top = (q) => Math.min(q[0][1], q[1][1]);
    for (let i = 0; i < out.length; i++) {
      if (!out[i]) continue;
      const k = i % per; // position dans sa page (classeur ouvert : 2 pages à la suite)
      const nb = [(k % cols) < cols - 1 ? i + 1 : -1, k + cols < per ? i + cols : -1];
      for (const [n, horiz] of [[nb[0], true], [nb[1], false]]) {
        if (n < 0 || !out[n] || !out[i]) continue;
        const touch = horiz ? right(out[i]) > left(out[n]) - gap : bottom(out[i]) > top(out[n]) - gap;
        if (touch) out[note[i] < note[n] ? i : n] = null;
      }
    }
    return out;
  }

  /**
   * Bords exacts d'une carte dans sa pochette (grille déjà posée) : on cherche la paire de bords gauche/droite
   * et haut/bas la plus nette, chaque axe séparément (tolère une photo un peu en biais). Null si pas net.
   */
  function refineCell(img, rect) {
    const W0 = img.naturalWidth || img.width, H0 = img.naturalHeight || img.height;
    const mx = rect.w * 0.1, my = rect.h * 0.1;
    const ax = Math.max(0, rect.x - mx), ay = Math.max(0, rect.y - my);
    const aw = Math.min(W0 - ax, rect.w + 2 * mx), ah = Math.min(H0 - ay, rect.h + 2 * my);
    const Sc = 220 / Math.max(aw, ah);
    const w = Math.max(30, Math.round(aw * Sc)), h = Math.max(30, Math.round(ah * Sc));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.filter = 'grayscale(1) blur(0.6px)';
    g.drawImage(img, ax, ay, aw, ah, 0, 0, w, h);
    const px = g.getImageData(0, 0, w, h).data;
    const gray = new Float32Array(w * h); for (let i = 0; i < gray.length; i++) gray[i] = px[i * 4];
    const L = Math.max(6, Math.round(Math.min(w, h) / 10));
    const V = new Float32Array(w), Hh = new Float32Array(h);
    for (let x = 1; x < w - 1; x++) { let run = 0; for (let y = 0; y < h; y++) { run += gray[y * w + x + 1] - gray[y * w + x - 1]; if (y >= L) run -= gray[(y - L) * w + x + 1] - gray[(y - L) * w + x - 1]; if (y >= L - 1) { const m = Math.abs(run) / L; if (m > 5) V[x] += m - 5; } } }
    for (let y = 1; y < h - 1; y++) { let run = 0; for (let x = 0; x < w; x++) { run += gray[(y + 1) * w + x] - gray[(y - 1) * w + x]; if (x >= L) run -= gray[(y + 1) * w + x - L] - gray[(y - 1) * w + x - L]; if (x >= L - 1) { const m = Math.abs(run) / L; if (m > 5) Hh[y] += m - 5; } } }
    const pair = (P, len, want, lo = 0.8, hi = 1.12) => {
      let best = null, mu = 0; for (const v of P) mu += v; mu = mu / len || 1;
      for (let a = 1; a < len - 1; a++) for (let b = a + Math.round(want * lo); b <= Math.min(len - 2, a + want * hi); b++) {
        const sc = (Math.min(P[a], P[b]) * 1.5 + P[a] + P[b]) / mu + (b - a) / want * 0.8;
        if (!best || sc > best.sc) best = { a, b, sc, q: Math.min(P[a], P[b]) / mu };
      }
      return best;
    };
    let X = pair(V, w, rect.w * Sc), Y = pair(Hh, h, rect.h * Sc);
    if (!X || !Y) return null;
    // un seul axe net : l'autre se déduit de la forme d'une carte (63 × 88), à ±8 %
    if (X.q >= 2 && Y.q < 2) { const Y2 = pair(Hh, h, (X.b - X.a) / (63 / 88), 0.92, 1.08); if (Y2 && Y2.q >= 0.8) Y = { ...Y2, q: 2 }; }
    else if (Y.q >= 2 && X.q < 2) { const X2 = pair(V, w, (Y.b - Y.a) * (63 / 88), 0.92, 1.08); if (X2 && X2.q >= 0.8) X = { ...X2, q: 2 }; }
    if (X.q < 2 || Y.q < 2) return null;
    const r = (63 / 88) / (((X.b - X.a) / Sc) / ((Y.b - Y.a) / Sc));
    if (r < 0.8 || r > 1.25) return null; // pas une forme de carte
    return { x: ax + X.a / Sc, y: ay + Y.a / Sc, w: (X.b - X.a) / Sc, h: (Y.b - Y.a) / Sc, score: Math.min(X.q, Y.q) };
  }

  // ---------- Versions d'une carte (1re édition, holo, reverse) ----------
  /** Carte recadrée → niveaux de gris à taille fixe (et couleurs) */
  function cardPixels(img, W = 300) {
    const H = Math.round(W / (63 / 88));
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, W, H);
    const d = g.getImageData(0, 0, W, H).data;
    const L = new Float32Array(W * H), Sat = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) {
      const r = d[i * 4], gg = d[i * 4 + 1], b = d[i * 4 + 2];
      L[i] = 0.299 * r + 0.587 * gg + 0.114 * b;
      const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b); Sat[i] = mx ? (mx - mn) / mx : 0;
    }
    return { W, H, L, Sat, rgb: d };
  }

  /**
   * Essaie les formats de page connus et garde celui qui colle le mieux.
   * Reconnaît aussi un classeur ouvert en grand (2 pages de 3 × 3 = 18 cartes), cartes droites ou couchées.
   */
  function detectPage(img, formats, current) {
    const res = {}, pre = gridProfiles(img);
    const [c0, r0] = formats[current];
    try { res[current] = detectGrid(img, c0, r0, pre); } catch (e) { res[current] = null; }
    // format habituel bien reconnu : inutile d'essayer les autres (plus rapide)
    if (!res[current] || res[current].fit < 0.72) {
      for (const [k, [cols, rows]] of Object.entries(formats)) { if (k === current) continue; try { res[k] = detectGrid(img, cols, rows, pre); } catch (e) { res[k] = null; } }
    }
    // le format qui explique le mieux les bords des cartes ; celui choisi (3 × 3 d'habitude) garde nettement l'avantage
    let bestK = current;
    for (const k of Object.keys(res)) if (res[k] && (!res[bestK] || res[k].fit > res[bestK].fit + (bestK === current ? 0.2 : 0.03))) bestK = k;
    let out = { fmt: bestK, grid: res[bestK], all: res };
    // double page ?
    if (!res[bestK] || res[bestK].fit < 0.7) {
      let dbl = null; try { dbl = detectDouble(img); } catch (e) { console.warn(e); }
      if (dbl) { res.double = dbl; if (dbl.fit >= 0.55 && (!res[bestK] || dbl.fit > res[bestK].fit + (bestK === current ? 0.05 : 0))) out = { fmt: 'double', grid: dbl, all: res }; }
    }
    return out;
  }

  /**
   * Classeur ouvert (2 pages de 3 × 3) : photo en largeur = pages côte à côte, cartes droites ;
   * photo en hauteur = pages l'une au-dessus de l'autre, cartes couchées (rot = −90 : haut de la carte à droite).
   */
  function detectDouble(img) {
    const NW = img.naturalWidth || img.width, NH = img.naturalHeight || img.height;
    const tall = NH > NW;
    const halves = tall ? [[0, 0, 1, 0.53], [0, 0.47, 1, 0.53]] : [[0, 0, 0.53, 1], [0.47, 0, 0.53, 1]];
    const parts = [];
    for (const [hx, hy, hw, hh] of halves) {
      const k = Math.min(1, 1100 / Math.max(hw * NW, hh * NH));
      const c = document.createElement('canvas'); c.width = Math.round(hw * NW * k); c.height = Math.round(hh * NH * k);
      c.getContext('2d').drawImage(img, hx * NW, hy * NH, hw * NW, hh * NH, 0, 0, c.width, c.height);
      const g = detectGrid(c, 3, 3, gridProfiles(c), tall ? 88 / 63 : 63 / 88);
      if (!g) return null;
      const map = ([x, y]) => [hx + x * hw, hy + y * hh];
      parts.push({ g, cells: g.cells.map((cl) => ({ x: hx + cl.x * hw, y: hy + cl.y * hh, w: cl.w * hw, h: cl.h * hh, quad: cl.quad.map(map) })), box: { x: hx + g.x * hw, y: hy + g.y * hh, w: g.w * hw, h: g.h * hh } });
    }
    const x0 = Math.min(...parts.map((p) => p.box.x)), y0 = Math.min(...parts.map((p) => p.box.y));
    const x1 = Math.max(...parts.map((p) => p.box.x + p.box.w)), y1 = Math.max(...parts.map((p) => p.box.y + p.box.h));
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, fit: Math.min(...parts.map((p) => p.g.fit)), score: parts[0].g.score + parts[1].g.score, extra: 0, cells: [...parts[0].cells, ...parts[1].cells], rot: tall ? -90 : 0, double: true };
  }

  /**
   * La photo montre-t-elle une page de classeur (plusieurs cartes) plutôt qu'une seule carte ?
   * Une page 3×3 a des séparations nettes verticales vers 1/3 et 2/3 de la largeur (entre les pochettes),
   * sur toute la hauteur ; une carte seule n'en a pas à ces endroits.
   */
  function looksLikePage(img) {
    const W0 = img.naturalWidth || img.width, H0 = img.naturalHeight || img.height;
    const W = 150, H = Math.max(60, Math.round(150 * H0 / W0));
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true }); g.filter = 'grayscale(1) blur(0.7px)'; g.drawImage(img, 0, 0, W, H);
    const p = g.getImageData(0, 0, W, H).data, v = (x, y) => p[(y * W + x) * 4];
    const colP = new Float32Array(W), rowP = new Float32Array(H);
    for (let y = Math.round(H * 0.08); y < H * 0.92; y++) for (let x = 1; x < W - 1; x++) colP[x] += Math.abs(v(x + 1, y) - v(x - 1, y));
    for (let x = Math.round(W * 0.08); x < W * 0.92; x++) for (let y = 1; y < H - 1; y++) rowP[y] += Math.abs(v(x, y + 1) - v(x, y - 1));
    const peak = (prof, n, t) => {
      const sorted = [...prof.slice(Math.round(n * 0.1), Math.round(n * 0.9))].sort((a, b) => a - b);
      const med = sorted[Math.floor(sorted.length / 2)] || 1;
      let m = 0; for (let i = Math.round(n * (t - 0.08)); i <= Math.round(n * (t + 0.08)); i++) m = Math.max(m, prof[i] || 0);
      return m / med;
    };
    const vx = [peak(colP, W, 1 / 3), peak(colP, W, 2 / 3)], hy = [peak(rowP, H, 1 / 3), peak(rowP, H, 2 / 3)];
    return { page: vx[0] > 2.2 && vx[1] > 2.2 && Math.max(...hy) > 1.8, vx, hy };
  }

  Object.assign(App.recognizerParts, { locateCard, detectGrid, gridProfiles, fitAxis, squareToQuad, cellCard, plausibleQuad, cutCard, warpQuad, homography, snapCells, refineCell, cardPixels, detectPage, detectDouble, looksLikePage });
})();
