/*
 * Scanner (classeur) — recalage de la grille sur les cartes reconnues à l'image (v3.17) — morceau de la fonction de scan-batch.js
 * (état partagé : X.S).
 * Pourquoi : sur certaines pages Riftbound (photo prise un peu de haut, pochettes brillantes), le vrai bord des cartes se voit à peine
 * et la grille se cale sur des lignes intérieures (bas du bandeau rouge du nom) : chaque case ne montre que le haut de sa carte.
 * Les cartes reconnues avec certitude donnent leurs vrais coins sur la photo (`info.ctxQuad`, dans les alentours de la case) :
 * avec au moins 3 d'entre elles (sur 2 rangées et 2 colonnes), on retrouve la vraie grille (homographie « position dans le
 * classeur → photo »), on redessine les cases, puis on redécoupe et relit les cartes douteuses (gardées seulement si mieux).
 * Pokémon et One Piece ne donnent pas ces coins : rien ne change pour eux.
 */
App.scanBatchParts = App.scanBatchParts || {};
App.scanBatchParts.realign = (X, { alive, dims, esc, setStatus, urls }) => {
  const { S } = X;
  // une carte occupe ~94 % × 95 % de sa pochette (mesuré, voir snapCells)
  const IN = [[0.03, 0.025], [0.97, 0.025], [0.97, 0.975], [0.03, 0.975]];

  /** Homographie par moindres carrés qui envoie les points src sur dst (≥ 4 paires) ; null si impossible */
  function fitH(src, dst) {
    const N = Array.from({ length: 8 }, () => new Float64Array(9)); // équations normales [AᵀA | Aᵀb]
    const add = (row, v) => { for (let i = 0; i < 8; i++) { for (let j = 0; j < 8; j++) N[i][j] += row[i] * row[j]; N[i][8] += row[i] * v; } };
    src.forEach(([x, y], k) => { const [u, v] = dst[k]; add([x, y, 1, 0, 0, 0, -u * x, -u * y], u); add([0, 0, 0, x, y, 1, -v * x, -v * y], v); });
    for (let c = 0; c < 8; c++) {
      let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(N[r][c]) > Math.abs(N[p][c])) p = r;
      if (Math.abs(N[p][c]) < 1e-12) return null;
      [N[c], N[p]] = [N[p], N[c]];
      for (let r = 0; r < 8; r++) { if (r === c) continue; const f = N[r][c] / N[c][c]; for (let k = c; k < 9; k++) N[r][k] -= f * N[c][k]; }
    }
    const h = N.map((row, i) => row[8] / row[i]);
    return (x, y) => { const w = h[6] * x + h[7] * y + 1; return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w]; };
  }

  /** Coins de la carte n° i dans le classeur (unité = une pochette) */
  const slot = (i, cols) => { const c = i % cols, r = Math.floor(i / cols); return IN.map(([u, v]) => [c + u, r + v]); };

  /**
   * v3.44 (Final Fantasy, traits jaunes d'Arnaud sur sa page 1, `_tests-scanner/finalfantasy/12.webp`) : les coins trouvés par
   * l'illustration sont parfois de travers (Valseur 2 : carte rétrécie, 8 % de la diagonale ; Ace : 5,5 %) alors que les autres
   * cartes de la page sont justes (≤ 2,2 %) → une carte sûre dont les coins s'écartent de ≥ 6 % de la place que lui donne la page
   * (grille calculée sur les cartes sûres) est recadrée sur cette place. Mesuré : Valseur 2 8 → 2,2 %, Ace 5,5 → 3,1 % ; les 7 autres
   * (écart ≤ 4,2 %) gardent leurs propres coins (1,1–2,2 %). Seulement Final Fantasy pour l'instant (pas mesuré ailleurs).
   */
  async function refitSure(H, cols) {
    const img = S.photo && S.photo.img; if (!img) return;
    const NW = img.naturalWidth, NH = img.naturalHeight;
    for (const c of S.cells) {
      if (c.state !== 'sure' || !c.info || !c.info.ctxQuad || !c.ctxRect || !alive()) continue;
      const r = c.ctxRect, own = c.info.ctxQuad.map(([x, y]) => [(r.x + x * r.w) * NW, (r.y + y * r.h) * NH]);
      const pq = slot(c.i, cols).map(([x, y]) => H(x, y)).map(([x, y]) => [x * NW, y * NH]);
      if (pq.some(([x, y]) => x < -0.02 * NW || y < -0.02 * NH || x > 1.02 * NW || y > 1.02 * NH)) continue;
      const dg = Math.hypot(own[2][0] - own[0][0], own[2][1] - own[0][1]) || 1;
      if (Math.max(...pq.map((p, j) => Math.hypot(p[0] - own[j][0], p[1] - own[j][1]))) / dg < 0.06) continue;
      try {
        const qw = (Math.hypot(pq[1][0] - pq[0][0], pq[1][1] - pq[0][1]) + Math.hypot(pq[2][0] - pq[3][0], pq[2][1] - pq[3][1])) / 2;
        const cv = App.recognizer.warpQuad(img, pq, Math.min(900, Math.round(qw)));
        const b = await new Promise((res) => cv.toBlob(res, 'image/jpeg', 0.9));
        if (!b) continue;
        c.blob = b; c.url = URL.createObjectURL(b); urls.push(c.url); c.refit = true;
        c.info.ctxQuad = pq.map(([x, y]) => [(x / NW - r.x) / r.w, (y / NH - r.y) / r.h]);
        // (brillant remesuré sur la carte entière : la découpe d'avant en coupait une partie)
        const top = c.cands.find((x) => x.id === c.choice), ad = App.games.get(S.game);
        if (top && top.foil && ad && ad.foil) { top.foil = await ad.foil(b, top) || top.foil; if (c.det && !c.det.user) c.det = null; }
      } catch (e) { console.warn('recadrage par la page', e); }
    }
    X.drawResults();
  }

  async function realign(hint, { cellBlob, ctxBlob, ctxRect, gridQuadOf, drawGrid }) {
    if (S.autoRot || S.fmt === 'double' || !S.photo) return; // (classeur ouvert : deux pages, pas une seule grille régulière)
    const [cols] = dims();
    // vrais coins des cartes reconnues avec certitude, reportés sur la photo
    let known = S.cells.filter((c) => c.state === 'sure' && c.info && c.info.ctxQuad && c.ctxRect).map((c) => {
      const r = c.ctxRect; return { i: c.i, q: c.info.ctxQuad.map(([x, y]) => [r.x + x * r.w, r.y + y * r.h]) };
    });
    // (coins trouvés par l'illustration seule : le bas de la carte est extrapolé, parfois de travers → la carte la plus à l'écart,
    //  nettement pire que les autres, est mise de côté et la grille recalculée)
    const fit = () => {
      const rowsOk = new Set(known.map((k) => Math.floor(k.i / cols))).size >= 2, colsOk = new Set(known.map((k) => k.i % cols)).size >= 2;
      if (known.length < 3 || !rowsOk || !colsOk) return null;
      const h = fitH(known.flatMap((k) => slot(k.i, cols)), known.flatMap((k) => k.q));
      if (!h) return null;
      const errs = known.map((k) => slot(k.i, cols).reduce((s, [x, y], j) => { const [u, v] = h(x, y); return s + Math.hypot(u - k.q[j][0], v - k.q[j][1]); }, 0) / 4);
      return { h, errs, mean: errs.reduce((a, b) => a + b, 0) / errs.length };
    };
    let F = fit();
    for (let t = 0; F && t < 2 && known.length > 4; t++) {
      const worst = F.errs.indexOf(Math.max(...F.errs)), med = [...F.errs].sort((a, b) => a - b)[F.errs.length >> 1];
      if (F.errs[worst] < Math.max(0.02, med * 1.8)) break;
      known = known.filter((_, k) => k !== worst); F = fit();
    }
    // la grille trouvée doit bien expliquer ces cartes (sinon une carte mal placée fausserait tout)
    // (mesuré sur les photos d'Arnaud : 0,016–0,036 par carte, sans carte aberrante → seuil 0,04)
    if (!F || F.mean > 0.04) return;
    const H = F.h;
    if (S.game === 'finalfantasy') await refitSure(H, cols);
    // écart entre la nouvelle grille et l'ancienne (en hauteur de case) : rien à faire si elle était déjà bonne
    const quads = S.cells.map((c) => slot(c.i, cols).map(([x, y]) => H(x, y)));
    const dev = S.cells.map((c) => {
      const g = gridQuadOf(c.i), h = Math.hypot(g[3][0] - g[0][0], g[3][1] - g[0][1]) || 1;
      return Math.max(...g.map((p, j) => Math.hypot(p[0] - quads[c.i][j][0], p[1] - quads[c.i][j][1]))) / h;
    });
    if (Math.max(...dev) < 0.08) return;
    if (quads.some((q) => q.some(([x, y]) => x < -0.05 || y < -0.05 || x > 1.05 || y > 1.05))) return; // (grille hors de la photo : pas fiable)
    const cl = (v) => Math.max(0, Math.min(1, v));
    S.autoCells = quads.map((q) => {
      const qq = q.map(([x, y]) => [cl(x), cl(y)]), xs = qq.map((p) => p[0]), ys = qq.map((p) => p[1]);
      return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys), quad: qq, realigned: true };
    });
    S.autoGrid = true; S.realigned = true;
    try { drawGrid(); } catch (e) { /* (photo masquée par l'écran plein écran) */ }
    // cartes douteuses : redécoupées sur la vraie grille et relues ; gardées seulement si c'est mieux
    const todo = S.cells.filter((c) => ['verifier', 'inconnue', 'erreur'].includes(c.state));
    const rank = { erreur: 0, inconnue: 1, verifier: 2, sure: 3 };
    for (const [k, cell] of todo.entries()) {
      if (S.stopped || !alive()) return;
      S.prog = { step: 'Grille recalée : relecture', done: k, total: todo.length }; X.drawResults();
      const st = (m) => { if (alive()) setStatus(`<div class="spinner"></div><div style="text-align:center">Carte ${cell.i + 1} (grille recalée) — ${esc(m)}</div>`); };
      try {
        const nb = await cellBlob(cell.i), ctx = await ctxBlob(cell.i).catch(() => null);
        const test = { ...cell, blob: nb.blob, ctx, ctxRect: ctx ? ctxRect(cell.i) : null, alt: null };
        await X.recogOne(test, hint, st);
        // mieux = statut meilleur, ou même statut et illustration au moins aussi ressemblante (la case est maintenant la bonne)
        const orb = (c) => (c.cands[0] && c.cands[0].orb) || 0, rt = rank[test.state] ?? -1, rc = rank[cell.state] ?? -1;
        if (rt > rc || (rt === rc && rt >= 2 && orb(test) >= orb(cell))) {
          Object.assign(cell, { blob: test.blob, box: nb.box, auto: nb.auto, ctx: test.ctx, ctxRect: test.ctxRect, info: test.info, cands: test.cands, choice: test.choice, state: test.state, checked: test.checked });
          cell.url = URL.createObjectURL(cell.blob); urls.push(cell.url);
          if (cell.state === 'sure') cell.found = Date.now();
        }
      } catch (e) { console.warn('recalage', e); }
      X.drawResults();
    }
    // cartes sûres sans recadrage sur leurs vrais bords : leur photo reprend la vraie case (au lieu du haut de la carte)
    for (const cell of S.cells) {
      if (cell.state !== 'sure' || (cell.info && cell.info.crop) || dev[cell.i] < 0.08 || !alive()) continue;
      try { const nb = await cellBlob(cell.i); cell.blob = nb.blob; cell.box = nb.box; cell.url = URL.createObjectURL(nb.blob); urls.push(cell.url); } catch (e) { /* */ }
    }
    setStatus(''); X.drawResults();
  }

  return { realign };
};
