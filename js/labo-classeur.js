/*
 * Labo de certification — banc « classeur feuilleté » (essai, pas utilisé par le site)
 *
 * Idée à tester (Arnaud, 24 oct.) : certifier une page de classeur en la TOURNANT devant la caméra. Une vraie page
 * pivote autour des anneaux : l'ancienne page s'écrase vers les anneaux (perspective, ombre, main) pendant que la
 * nouvelle apparaît, immobile, derrière. Une tricherie sur un écran (diaporama) change d'un coup, en fondu, ou fait
 * GLISSER les pages d'un bloc. Seule une animation « page qui tourne » ou la vidéo d'une vraie page tournée imitent
 * le geste : là, il reste le détecteur d'écran (moiré).
 * Mesure (« G ») : pour chaque image du geste, la page vue est expliquée par (a) l'ancienne page ÉCRASÉE vers un bord
 * + la nouvelle immobile (ou l'inverse : la nouvelle qui se déplie), ou par (b) un glissement / un fondu. G = (b) − (a).
 * Fausses vidéos : vraies photos de pages (_tests-scanner : 02, 04, 05, 09, 10, 12, 13, 17), 360 × 480, ~11 images/s.
 */
(() => {
  const A = window.__laboApi; if (!A) return;
  const P = A.parts, T = App.certify._test, R = App.recognizer, $ = (s) => document.querySelector(s), esc = App.util.esc;
  const { VW, VH, rng, lerp, ease, canvas, grayFrom, CACHE, renderFrame, baseEnv, drawScreen, vcan, loadBmp, prepareDecor } = P;
  const SHEET = { x: 22, y: 26, w: 316, h: 421 }; // la page dans l'image (un peu de table autour)
  const REGP = { sx: SHEET.x - 6, sy: SHEET.y - 6, sw: SHEET.w + 12, sh: SHEET.h + 12 }; // zone suivie (cadre jaune)
  const { GW, GH } = App.pageTurn; // petite image grise de la page

  // ---------- Les pages : tes photos, recadrées sur la grille des 9 cartes ----------
  let PAGES = null;
  async function loadPages(onStatus = () => {}) {
    if (PAGES) return PAGES;
    PAGES = [];
    for (const n of ['02', '04', '05', '09', '10', '12', '13', '17']) {
      try {
        const img = await loadBmp(`_tests-scanner/${n}.jpg`), W = img.width, H = img.height;
        const g = R.detectGrid(img, 3, 3); if (!g || !g.cells) continue;
        const px = g.cells.flatMap((c) => (c.quad ? c.quad : [[c.x, c.y], [c.x + c.w, c.y + c.h]]));
        const fr = px.every(([x, y]) => x <= 1.5 && y <= 1.5);
        const xs = px.map((p) => p[0] * (fr ? W : 1)), ys = px.map((p) => p[1] * (fr ? H : 1));
        let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
        const m = 0.03 * (x1 - x0); x0 -= m; x1 += m; y0 -= m; y1 += m;
        const c = canvas(SHEET.w, SHEET.h); c.getContext('2d').drawImage(img, x0, y0, x1 - x0, y1 - y0, 0, 0, SHEET.w, SHEET.h);
        PAGES.push({ n, img: c });
        onStatus(`Pages : ${PAGES.length}`);
      } catch (e) { console.warn('page', n, e); }
    }
    return PAGES;
  }

  // ---------- Dessin d'une feuille qui pivote autour des anneaux ----------
  /**
   * th = 0 : à plat sur la page de droite ; π/2 : debout ; π : posée à gauche (hors du cadre). side 'L' : anneaux à
   * gauche (page de droite du classeur). curl : la feuille se courbe (le bord libre tourne plus vite que le pli).
   * front = recto (vu tant que th < π/2), back = verso.
   */
  const DC = 2.2; // distance de la caméra, en largeurs de page
  function drawSheet(g, front, back, rect, th, { side = 'L', curl = 0, shade = true } = {}) {
    const N = 40, sp = side === 'L' ? rect.x : rect.x + rect.w, sg = side === 'L' ? 1 : -1, cy = rect.y + rect.h / 2;
    const pos = (u) => { const t = Math.min(Math.PI, th * (1 - curl * 0.35 + curl * 0.7 * u)); const z = u * Math.sin(t) * 0.9, f = DC / (DC - z); return [sp + sg * u * rect.w * Math.cos(t) * f, f, t]; };
    for (let i = 0; i < N; i++) {
      const u0 = i / N, u1 = (i + 1) / N, [x0, f0, t0] = pos(u0), [x1, f1] = pos(u1), f = (f0 + f1) / 2;
      const showFront = Math.cos(t0) >= 0, img = showFront ? front : back; if (!img) continue;
      const lo = Math.min(x0, x1), len = Math.abs(x1 - x0) + 0.7; if (len < 0.3) continue;
      const tu = side === 'L' ? (showFront ? u0 : 1 - u1) : (showFront ? 1 - u1 : u0); // le verso est vu de l'autre sens
      g.drawImage(img, tu * img.width, 0, img.width / N + 0.5, img.height, lo, cy - rect.h * f / 2, len, rect.h * f);
      if (shade) { g.fillStyle = `rgba(0,0,0,${(0.28 * Math.sin(t0)).toFixed(3)})`; g.fillRect(lo, cy - rect.h * f / 2, len, rect.h * f); }
    }
    return pos(1)[0]; // position du bord libre (pour la main et l'ombre)
  }
  function shadowAt(g, rect, xe, th, side) { // ombre de la feuille levée sur la page du dessous
    const w = 50 * Math.sin(Math.min(th, Math.PI - th)), dir = side === 'L' ? 1 : -1; if (w < 2) return;
    const gr = g.createLinearGradient(xe, 0, xe + dir * w, 0); gr.addColorStop(0, 'rgba(0,0,0,.32)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(Math.min(xe, xe + dir * w), rect.y, w, rect.h);
  }
  function hand(g, x, y, skin) { g.fillStyle = skin; g.beginPath(); g.ellipse(x, y, 30, 46, 0.3, 0, Math.PI * 2); g.fill(); g.beginPath(); g.ellipse(x + 30, y + 70, 60, 70, 0.3, 0, Math.PI * 2); g.fill(); }

  // ---------- Situations ----------
  /** Vrai geste : o.dir 'fwd' (page suivante) / 'bwd' (page précédente), o.D, o.curl, o.hes (hésitation), o.side */
  function realTurn(o = {}) {
    return (env, pg) => {
      const r = env.r, side = o.side || 'L';
      if (o.dark) { env.light = 0.5 + r() * 0.12; env.noise = 0.12 + r() * 0.05; env.expo = 16 + r() * 16; }
      if (o.slowCam) env.dt = 125 + r() * 30;
      if (o.glare) env.glare = true;
      if (o.shake) { const amp = o.shake, ph = r() * 6; env.shake = (t) => ({ dx: amp * Math.sin(t / 180 + ph) + amp * 0.5 * Math.sin(t / 61), dy: amp * Math.cos(t / 150 + ph), dr: 0.006 * Math.sin(t / 300) }); }
      if (o.frozen) { env.frozen = true; env.surface = 'none'; env.shake = () => ({ dx: 0, dy: 0, dr: 0 }); }
      const t1 = lerp([700, 1300], r()), D = lerp(o.D || [550, 1100], r()), hes = o.hes ? 900 : 0, curl = o.curl ?? r() * 0.6;
      env.turn = { t1: t1 + hes, D }; env.shootAt = t1 + hes + D + lerp([700, 1200], r());
      const thAt = (t) => {
        if (o.hes && t < t1 + hes) { const x = (t - t1) / hes; return x < 0 ? 0 : 0.7 * Math.sin(Math.PI * Math.min(1, x)); }
        const x = ease((t - t1 - hes) / D); return o.dir === 'bwd' ? Math.PI * (1 - x) : Math.PI * x;
      };
      env.thAt = thAt;
      env.draw = (g, t) => {
        const s = env.shake(t), rect = { ...SHEET, x: SHEET.x + s.dx, y: SHEET.y + s.dy };
        const th = thAt(t), fwd = o.dir !== 'bwd';
        const under = fwd ? pg.N : pg.O, sheet = fwd ? pg.O : pg.N; // en arrière : la page précédente revient par-dessus
        const done = fwd && th >= Math.PI - 1e-3;
        g.drawImage(under, rect.x, rect.y, rect.w, rect.h);
        if (!done) {
          if (th < Math.PI - 1e-3) { const xe = drawSheet(g, sheet, pg.V, rect, th, { side, curl }); if (th > 0.02) { shadowAt(g, rect, xe, th, side); } }
        }
        // la main tient le bord libre pendant le geste, arrive juste avant et repart juste après
        const k = Math.max(0, Math.min(1, (t - (t1 - 400)) / 400)) * (1 - Math.max(0, Math.min(1, (t - (t1 + hes + D + 150)) / 400)));
        if (k > 0) {
          const tt = Math.min(Math.PI, th), z = Math.sin(tt) * 0.9, f = DC / (DC - z);
          const hx = rect.x + rect.w * Math.cos(tt) * f + (1 - k) * 160, hy = rect.y + rect.h * (0.5 + 0.38 * f) + (1 - k) * 120;
          hand(g, hx, hy, env.skin);
        }
      };
      env.blurAt = (t) => { const w = Math.abs(thAt(t + 8) - thAt(t - 8)) / 16; return Math.min(6, w * SHEET.w * 0.5 * env.expo / 3.5); };
    };
  }
  /** Tricheries sur une tablette tenue devant la caméra (diaporama, animations, vidéo) */
  function screenTurn(kind, o = {}) {
    return (env, pg) => {
      const r = env.r;
      env.moire = !!o.moire; env.surface = 'screen';
      env.P = { cx: VW / 2, cy: VH / 2, w: SHEET.w + 6, h: SHEET.h + 6, rot: 0 };
      const t1 = lerp([700, 1300], r()), D = kind === 'coupe' ? 0 : lerp(kind === 'fondu' ? [300, 700] : [400, 900], r());
      env.turn = { t1, D }; env.shootAt = t1 + D + lerp([700, 1200], r());
      env.draw = (g, t) => drawScreen(g, env, t, (g2, q) => {
        const x = D ? Math.max(0, Math.min(1, (t - t1) / D)) : (t >= t1 ? 1 : 0), k = ease(x), rect = { x: q.x, y: q.y, w: q.w, h: q.h };
        if (kind === 'coupe' || kind === 'main') g2.drawImage((kind === 'main' ? t >= t1 + 200 : x >= 1) ? pg.N : pg.O, q.x, q.y, q.w, q.h);
        else if (kind === 'fondu') { g2.drawImage(pg.O, q.x, q.y, q.w, q.h); g2.globalAlpha = k; g2.drawImage(pg.N, q.x, q.y, q.w, q.h); g2.globalAlpha = 1; }
        else if (kind === 'glisse') { g2.drawImage(pg.O, q.x - k * q.w, q.y, q.w, q.h); g2.drawImage(pg.N, q.x + (1 - k) * q.w, q.y, q.w, q.h); }
        else if (kind === 'couvre') { g2.drawImage(pg.O, q.x, q.y, q.w, q.h); g2.drawImage(pg.N, q.x + (1 - k) * q.w, q.y, q.w, q.h); }
        else if (kind === 'anim') { // animation « page qui tourne » (sans main, sans relief)
          g2.drawImage(pg.N, q.x, q.y, q.w, q.h); if (k < 0.999) drawSheet(g2, pg.O, pg.V, rect, Math.PI * k, { curl: 0.2, shade: true });
        } else if (kind === 'video') { // vidéo d'un vrai geste rejouée sur l'écran
          g2.drawImage(pg.N, q.x, q.y, q.w, q.h);
          if (k < 0.999) { const th = Math.PI * k, xe = drawSheet(g2, pg.O, pg.V, rect, th, { curl: 0.4 }); shadowAt(g2, rect, xe, th, 'L'); hand(g2, xe, q.y + q.h * 0.85, env.skin); }
        }
      });
      if (kind === 'main') { const d0 = env.draw; env.draw = (g, t) => { d0(g, t); const x = (t - t1 + 300) / 700; if (x < 0 || x > 1) return; hand(g, VW * 1.2 - x * VW * 1.5, VH * 0.55, env.skin); hand(g, VW * 1.35 - x * VW * 1.5, VH * 0.4, env.skin); }; }
    };
  }
  const SITU = [
    { id: 'g-normal', ok: true, name: 'Page suivante, geste normal (0,5–1,1 s)', mk: realTurn() },
    { id: 'g-rapide', ok: true, name: 'Page tournée vite (0,25–0,4 s)', mk: realTurn({ D: [250, 400] }) },
    { id: 'g-lent', ok: true, name: 'Page tournée lentement (1,5–2,2 s)', mk: realTurn({ D: [1500, 2200] }) },
    { id: 'g-retour', ok: true, name: 'Page précédente (elle revient par-dessus)', mk: realTurn({ dir: 'bwd' }) },
    { id: 'g-courbe', ok: true, name: 'Feuille très courbée', mk: realTurn({ curl: 1 }) },
    { id: 'g-hesite', ok: true, name: 'Hésitation (soulevée, reposée, puis tournée)', mk: realTurn({ hes: true }) },
    { id: 'g-sombre', ok: true, name: 'Pièce sombre, mains qui tremblent', mk: realTurn({ dark: true, shake: 5 }) },
    { id: 'g-reflet', ok: true, name: 'Reflets sur les pochettes', mk: realTurn({ glare: true }) },
    { id: 'g-lentcam', ok: true, name: 'Téléphone lent (7 images/s)', mk: realTurn({ slowCam: true }) },
    { id: 'f-coupe', ok: false, name: 'Tablette : diaporama, page changée d’un coup', mk: screenTurn('coupe') },
    { id: 'f-fondu', ok: false, name: 'Tablette : fondu enchaîné', mk: screenTurn('fondu') },
    { id: 'f-glisse', ok: false, name: 'Tablette : les pages glissent (balayage du doigt)', mk: screenTurn('glisse') },
    { id: 'f-couvre', ok: false, name: 'Tablette : la nouvelle page glisse par-dessus', mk: screenTurn('couvre') },
    { id: 'f-main', ok: false, name: 'Tablette : main passée devant pendant le changement', mk: screenTurn('main') },
    { id: 'f-anim', ok: false, name: 'Tablette : animation « page qui tourne » (moiré)', mk: screenTurn('anim', { moire: true }) },
    { id: 'f-anim-net', ok: false, limit: true, name: 'Tablette : animation « page qui tourne », sans moiré', mk: screenTurn('anim') },
    { id: 'f-video', ok: false, name: 'Tablette : vidéo d’une vraie page tournée (moiré)', mk: screenTurn('video', { moire: true }) },
    { id: 'f-video-net', ok: false, limit: true, name: 'Tablette : vidéo d’une vraie page tournée, sans moiré', mk: screenTurn('video') },
    { id: 'f-fige', ok: false, name: 'Flux injecté (vidéo sans bruit de caméra)', mk: realTurn({ frozen: true }) },
  ];

  // ---------- Fabrication d'une vidéo ----------
  function simulate(pg, scen, seed) {
    prepareDecor(); const r = rng(seed), env = baseEnv(r, { img: pg.O }, { img: pg.N }, pg.O);
    env.t0 = 0; env.torch = null;
    scen.mk(env, pg);
    const frames = [];
    let t = 0;
    while (t <= env.shootAt) {
      renderFrame(env, t, vcan);
      frames.push({ t, g: grayFrom(vcan, REGP.sx, REGP.sy, REGP.sw, REGP.sh, GW, GH, CACHE), s: grayFrom(vcan, REGP.sx, REGP.sy, REGP.sw, REGP.sh, 24, 33, CACHE) });
      if (t >= env.shootAt) break;
      t = Math.min(env.shootAt, t + env.dt * (r() < 0.06 ? 1.8 : 1));
    }
    const side = 256, cx = REGP.sx + REGP.sw / 2, cy = REGP.sy + REGP.sh / 2;
    const screen = T.screenScore(grayFrom(vcan, cx - side / 2, cy - side / 2, side, side, side, side, CACHE), side).peak;
    // image figée : seulement sur la page immobile de la fin (les images du geste bougent forcément)
    const recent = frames.slice(-6).map((f) => f.s), frozen = T.frozenPairs(recent) >= Math.ceil((recent.length - 1) * 0.8);
    return { frames, env, screen, frozen };
  }

  // ---------- La mesure ----------
  // (dans le site : js/page-turn.js, le même code pour le labo et pour l'appli)
  const { judge: judgeTurn, explain } = App.pageTurn;

  // ---------- Banc ----------
  async function run(onStatus, reps = 2, opts = {}) {
    const pages = await loadPages(onStatus); if (pages.length < 3) throw new Error('photos de pages introuvables (_tests-scanner)');
    const rows = [];
    for (let i = 0; i < pages.length; i++) for (let rep = 0; rep < reps; rep++) {
      const pg = { O: pages[i].img, N: pages[(i + 1 + rep) % pages.length].img, V: pages[(i + 3 + rep) % pages.length].img };
      for (const S of SITU) {
        const seed = A.hashStr(`${pages[i].n}|${S.id}|${rep}`), sim = simulate(pg, S, seed);
        const j = judgeTurn(sim.frames, opts);
        const final = j.pass && !sim.frozen && sim.screen < 40;
        rows.push({ id: S.id, ok: S.ok, G: j.pass, F: final, why: !j.pass ? j.why : sim.frozen ? 'image figée' : sim.screen >= 40 ? 'écran détecté' : '', ev: j.ev, screen: Math.round(sim.screen), n: sim.frames.length });
        await A.tick();
      }
      onStatus(`Classeur feuilleté : page ${i + 1} / ${pages.length} (essai ${rep + 1})`);
    }
    return rows;
  }
  function show(rows) {
    const pct = (a, b) => (b ? `${(Math.round((a / b) * 1000) / 10).toString().replace('.', ',')} %` : '—');
    let h = '<div class="box scroll"><table><tr><th>Situation</th><th>Attendu</th><th>Vidéos</th><th>G (géométrie)</th><th>G + écran + figée</th><th>Refus fréquent</th><th>Mesure G (médiane)</th></tr>';
    const tot = { ok: [0, 0, 0], ko: [0, 0, 0] };
    for (const S of SITU) {
      const x = rows.filter((r) => r.id === S.id); if (!x.length) continue;
      const g = x.filter((r) => r.G === S.ok).length, f = x.filter((r) => r.F === S.ok).length;
      const whys = {}; x.filter((r) => !r.F).forEach((r) => { whys[r.why] = (whys[r.why] || 0) + 1; });
      const top = Object.entries(whys).sort((p, q) => q[1] - p[1])[0];
      const bs = x.map((r) => (r.ev && r.ev.best != null ? r.ev.best : -1)).sort((p, q) => p - q);
      const b = S.ok ? tot.ok : tot.ko; b[0] += g; b[1] += f; b[2] += x.length;
      const cl = (v) => (v >= 0.95 ? 'good' : v >= 0.8 ? 'mid' : 'bad');
      h += `<tr><td>${esc(S.name)}${S.limit ? ' <span class="tag">limite</span>' : ''}</td><td>${S.ok ? 'certifiée' : 'refusée'}</td><td class="n">${x.length}</td><td class="n ${cl(g / x.length)}">${pct(g, x.length)}</td><td class="n ${cl(f / x.length)}">${pct(f, x.length)}</td><td>${top ? `${esc(top[0])} (${top[1]})` : ''}</td><td class="n">${String(bs[bs.length >> 1]).replace('.', ',')}</td></tr>`;
    }
    h += `<tr><td><b>Vrais gestes certifiés</b></td><td></td><td></td><td class="n"><b>${pct(tot.ok[0], tot.ok[2])}</b></td><td class="n"><b>${pct(tot.ok[1], tot.ok[2])}</b></td><td colspan="2"></td></tr>`;
    h += `<tr><td><b>Tricheries refusées</b></td><td></td><td></td><td class="n"><b>${pct(tot.ko[0], tot.ko[2])}</b></td><td class="n"><b>${pct(tot.ko[1], tot.ko[2])}</b></td><td colspan="2"></td></tr></table>`;
    h += '<p class="lead" style="margin-top:8px">Bonne décision = vrai geste certifié, tricherie refusée. « G » : la page vue pendant le geste s’explique mieux par une page qui pivote autour des anneaux que par un glissement ou un fondu.</p></div>';
    return h;
  }
  async function go() {
    const btn = $('#go4'); btn.disabled = true;
    try {
      const st = (m) => { $('#status4').textContent = m; }, t0 = performance.now();
      const rows = await run(st, +($('#o-rep4') || {}).value || 2);
      window.__turn = rows; $('#results4').innerHTML = show(rows);
      st(`Terminé en ${Math.round((performance.now() - t0) / 1000)} s.`);
    } catch (e) { $('#status4').textContent = 'Erreur : ' + e.message; } finally { btn.disabled = false; }
  }
  if ($('#go4')) $('#go4').addEventListener('click', go);
  window.__laboTurn = { loadPages, simulate, judgeTurn, explain, run, show, SITU, go, drawSheet };
})();
