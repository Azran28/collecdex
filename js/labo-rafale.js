/*
 * Labo de certification — banc « rafale en paquet » (v3.58, outil de test, pas utilisé par le site)
 *
 * Le dresseur tient son paquet FACE CACHÉE dans le cadre, retourne la carte du dessus, la tient immobile : elle est
 * prise et certifiée toute seule ; il la pose (elle sort du cadre) et le dos de la suivante apparaît.
 * Chaque fausse vidéo enchaîne plusieurs cartes. Chaque image passe par le VRAI suivi du site
 * (App.certify.tracker, { auto: true, kind: 'rafale' }, horloge = temps de la vidéo) et par une copie du
 * déclenchement de scan-batch-burst.js › rTick (à garder identique). La preuve : judgeE + écran + image figée,
 * comme certify.tracker › proof (sans le défi du serveur).
 * Mesures : cartes prises une fois, certifiées, oubliées, prises deux fois, photos du dos, temps par carte.
 */
(() => {
  const A = window.__laboApi; if (!A) return;
  const P = A.parts, T = App.certify._test, $ = (s) => document.querySelector(s), esc = App.util.esc;
  const { VW, VH, REG, GW, GH, rng, lerp, ease, canvas, grayFrom, CACHE, drawCard, drawThumb, renderFrame, baseEnv, posed, vcan } = P;
  vcan.videoWidth = VW; vcan.videoHeight = VH; // le suivi du site lit la « vidéo » (ici, le canevas de la fausse caméra)

  // ---------- La scène : un paquet tenu dans le cadre, les cartes retournées l'une après l'autre ----------
  /**
   * o : D (durée du retournement), axis, offAxis, dark, shake, glare, slowCam, quick (dresseur pressé),
   *     slide (tricherie : la face glisse sur le paquet sans être retournée), facesOnly (pas de paquet : faces montrées),
   *     twins (la même carte deux fois de suite : doublons)
   */
  function pileScene(env, faces, o) {
    const r = env.r;
    if (o.dark) { env.light = 0.42 + r() * 0.12; env.noise = 0.13 + r() * 0.05; env.expo = 16 + r() * 16; }
    if (o.slowCam) env.dt = 125 + r() * 30;
    if (o.glare) env.glare = true;
    if (o.shake) { const amp = o.shake, ph = r() * 6; env.shake = (t) => ({ dx: amp * Math.sin(t / 180 + ph) + amp * 0.5 * Math.sin(t / 61), dy: amp * Math.cos(t / 150 + ph) + amp * 0.5 * Math.sin(t / 53 + 1), dr: 0.01 * Math.sin(t / 300) }); }
    const cards = faces.map((face) => ({
      face, pause: o.quick ? lerp([150, 320], r()) : lerp([350, 1000], r()), D: lerp(o.D || [300, 600], r()),
      axis: o.axis || (r() < 0.25 ? 'h' : 'v'), a: o.offAxis ? (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.4) : (r() - 0.5) * 0.4,
      off: { dx: (r() - 0.5) * 18, dy: (r() - 0.5) * 14 }, react: o.quick ? lerp([120, 260], r()) : lerp([250, 700], r()),
      L: lerp([300, 550], r()), dir: r() < 0.7 ? 1 : -1, start: null, capT: null, leaveAt: null,
      DX: lerp(o.DX || [700, 1300], r()), DC: lerp([300, 800], r()), down: r() < 0.5, // sortie du cadre (v3.84) : durée, vers le bas ou le côté
    }));
    cards[0].start = 600;
    const sc = { cards, k: 0, done: false };
    /** Carte en cours et son étape à l'instant t ('pause' = le dos du paquet, 'flip', 'hold' = face tenue, 'leave') */
    sc.at = (t) => {
      let c = cards[sc.k];
      if (c.leaveAt != null && t >= c.leaveAt + c.L) { // carte posée : la suivante
        if (sc.k + 1 >= cards.length) { sc.done = true; return { k: sc.k, ph: 'fin', c }; }
        const s = c.leaveAt + c.L; sc.k++; c = cards[sc.k]; c.start = s;
      }
      const f0 = c.start + (o.below ? ENTER : 0) + c.pause, f1 = f0 + (o.slide ? 450 : o.exit ? c.DX : o.cut ? c.DC : c.D);
      if (c.leaveAt == null && t > f1 + 4500) c.leaveAt = t; // jamais prise : le dresseur passe à la suivante
      if (t < f0) return { k: sc.k, ph: 'pause', c, f0, f1 };
      if (t < f1) return { k: sc.k, ph: 'flip', c, f0, f1 };
      if (c.leaveAt == null || t < c.leaveAt) return { k: sc.k, ph: 'hold', c, f0, f1 };
      return { k: sc.k, ph: 'leave', c, f0, f1 };
    };
    sc.onCapture = (t) => { const c = cards[sc.k]; if (c.capT == null) { c.capT = t; c.leaveAt = t + c.react; } };
    const ENTER = 380; // paquet sous le cadre : la carte du dessus monte dans le cadre, dos visible
    env.draw = (g, t) => {
      const s = sc.at(t), c = s.c, p0 = posed(env, t);
      if (!o.facesOnly) { // le paquet (quelques dos un peu décalés), tenu dans la main — dans le cadre ou juste en dessous
        const py = o.below ? VH * 0.72 : 0;
        for (let i = 3; i >= 0; i--) drawCard(g, env.back, env.back, { ...p0, cx: p0.cx + i * 1.2, cy: p0.cy + py + i * 1.6, th: 0 });
        if (o.below) drawThumb(g, { ...p0, cy: p0.cy + py }, env.skin);
      }
      if (s.ph === 'fin' || (s.ph === 'pause' && (!o.below || o.facesOnly))) { if (!o.facesOnly && !o.below) drawThumb(g, p0, env.skin); return; }
      const p = { ...p0, axis: c.axis, a: c.a };
      let th = Math.PI;
      if (s.ph === 'pause') { th = 0; p.cy += (1 - ease((t - c.start) / ENTER)) * VH * 0.72; } // la carte monte, dos visible
      if (s.ph === 'flip' && o.cut) return; // triche : le dos disparaît d'un coup, rien, puis la face d'un coup
      if (s.ph === 'flip' && o.exit) {
        // v3.84 : la carte sort du cadre (vers le bas ou le côté), est retournée dehors, puis revient face visible
        // (outFlip : on la voit commencer à pivoter en sortant ; slideOnly : triche, aucune rotation, un dos puis une face qui glissent)
        const x = (t - s.f0) / c.DX, z = x < 0.35 ? ease(x / 0.35) : x < 0.65 ? 1 : 1 - ease((x - 0.65) / 0.35);
        th = x < 0.35 ? (o.outFlip ? Math.PI * 0.3 * ease(x / 0.35) : 0) : x < 0.65 ? Math.PI * ease((x - 0.35) / 0.3) : Math.PI;
        if (o.slideOnly) th = x < 0.5 ? 0 : Math.PI;
        if (c.down) p.cy += z * VH * 0.95; else p.cx += z * VW * 1.15 * c.dir;
        p.cx += c.off.dx * Math.min(1, x * 2); p.cy += c.off.dy * Math.min(1, x * 2);
        drawCard(g, env.back, c.face, { ...p, th }); drawThumb(g, p, env.skin);
        return;
      }
      if (s.ph === 'flip' && !o.slide && !o.facesOnly) {
        const x = (t - s.f0) / c.D; th = Math.PI * ease(x);
        const lift = Math.sin(x * Math.PI) * 0.05; p.w *= 1 + lift; p.h *= 1 + lift; p.cy -= lift * 60;
      }
      // tournée autour d'un bord, la carte finit à côté : la main la ramène dans le cadre (comme labo-certif › flipScene)
      if (s.ph !== 'pause' && !o.slide && !o.facesOnly && !o.exit && !o.cut) {
        const back = c.a * (c.axis === 'v' ? p.w : p.h) / 2 * (ease((t - s.f0) / c.D) + ease((t - s.f1) / 500));
        if (c.axis === 'v') p.cx -= back; else p.cy -= back;
      }
      if ((s.ph === 'flip' && (o.slide || o.facesOnly))) { const q = 1 - ease((t - s.f0) / (s.f1 - s.f0)); p.cx += q * VW * 1.1 * c.dir; } // arrive par le côté
      // après le geste, la carte est un peu à côté du paquet ; en partant, elle sort du cadre
      const q = s.ph === 'pause' ? 0 : s.ph === 'flip' ? (o.slide || o.facesOnly ? 1 : ease((t - s.f0) / c.D)) : 1;
      p.cx += c.off.dx * q; p.cy += c.off.dy * q;
      if (s.ph === 'leave') { const z = ease((t - c.leaveAt) / c.L); p.cx += z * VW * 1.15 * c.dir; p.cy += z * 40; }
      drawCard(g, env.back, c.face, { ...p, th });
      drawThumb(g, p, env.skin);
    };
    env.blurAt = (t) => {
      const s = sc.at(t); if (s.ph !== 'flip' || o.slide || o.facesOnly || o.cut) return s.ph === 'leave' ? 3 : 0;
      if (o.exit) return 2.5;
      const w = Math.PI * Math.abs(ease((t + 8 - s.f0) / s.c.D) - ease((t - 8 - s.f0) / s.c.D)) / 16;
      return Math.min(9, (w * env.P.w / 2) * env.expo / 3.5);
    };
    return sc;
  }

  // ---------- Copie du déclenchement de la rafale (scan-batch-burst.js › rTick, mode « Certifier ») ----------
  const RGW = 40, RGH = 56, GM = 0.06 / 1.12, rg = canvas(RGW, RGH), rgg = rg.getContext('2d', { willReadFrequently: true });
  const mad = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]); return d / a.length; };
  function rGrab() {
    const r = REG;
    rgg.drawImage(vcan, r.sx + r.sw * GM, r.sy + r.sh * GM, r.sw * (1 - 2 * GM), r.sh * (1 - 2 * GM), 0, 0, RGW, RGH);
    const d = rgg.getImageData(0, 0, RGW, RGH).data, o = new Float32Array(RGW * RGH);
    for (let i = 0; i < o.length; i++) o[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    return o;
  }
  function sameCard(a, b) {
    if (mad(a, b) < 9) return true;
    try { const m = T.motion(a, b, RGW, RGH); return m.rel < 0.62 && m.fit < 0.78; } catch (e) { return false; }
  }

  /** Une fausse vidéo de rafale → ce qui a été pris (carte, étape, certifiée ou non) */
  function runSeq(faces, back, o, seed) {
    const r = rng(seed), env = baseEnv(r, { img: faces[0] }, { img: faces[0] }, back);
    env.t0 = 0;
    const sc = pileScene(env, faces, o);
    let t = 0, simT = 0, busyUntil = -1, prev = null, stable = 0, last = null;
    const trk = App.certify.tracker(vcan, () => REG, { auto: true, kind: 'rafale', only: o.allBacks ? null : 'pokemon', clock: () => simT }); // (cartes et dos Pokémon : licence choisie)
    const shots = [];
    const capture = (F, flipped, s) => {
      let passed = false, why = flipped ? '' : 'dos pas vu';
      if (flipped) {
        const j = T.judgeE(trk._debug.frames, GW, GH, { exit: !o.noExit }); if (o.keep) o.keep.push({ k: s.k, frames: trk._debug.frames.slice(), j });
        const side = 256, scr = T.screenScore(grayFrom(vcan, REG.sx + (REG.sw - side) / 2, REG.sy + (REG.sh - side) / 2, side, side, side, side, CACHE), side);
        const recent = trk._debug.frames.slice(-15).map((x) => x.g), frozen = T.frozenPairs(recent) >= Math.ceil((recent.length - 1) * 0.8);
        passed = j.passed && scr.peak < 40 && !frozen; why = j.passed ? (frozen ? 'figée' : scr.peak >= 40 ? 'écran' : '') : j.why;
        trk.reset();
      }
      shots.push({ k: s.k, ph: s.ph, t, flipped, passed, why, since: t - s.c.start });
      last = F; stable = 0; prev = null; busyUntil = t + 380; // ~0,4 s pour la photo (la plus nette des images vidéo)
      sc.onCapture(t);
    };
    for (let n = 0; n < 4000 && !sc.done; n++) {
      simT = t;
      renderFrame(env, t, vcan);
      const s = sc.at(t);
      if (t >= busyUntil) {
        const F = rGrab();
        let mean = 0; for (const v of F) mean += v; mean /= F.length;
        let sd = 0; for (const v of F) sd += (v - mean) ** 2; sd = Math.sqrt(sd / F.length);
        const diff = prev ? mad(F, prev) : 99; prev = F;
        const ph = trk.step(); if (o.trace) o.trace.push([Math.round(t), s.k, s.ph, ph, Math.round(sd), +diff.toFixed(1), +(trk._debug.frames.at(-1) || {}).b?.toFixed?.(2)]);
        if (ph === 'pret') capture(F, true, s);
        else if (ph === 'dos' || ph === 'retourne' || sd < 16) stable = 0;
        else if (last && sameCard(last, F)) stable = 0;
        else if (diff > 4 + sd * 0.08) stable = 0;
        else if (++stable >= 4) capture(F, false, s);
      }
      t += env.dt * (r() < 0.06 ? 1.8 : 1);
    }
    // bilan par carte
    const per = sc.cards.map((c, k) => {
      const mine = shots.filter((x) => x.k === k && (x.ph === 'hold' || x.ph === 'flip' || x.ph === 'leave'));
      return { taken: mine.length > 0, twice: mine.length > 1, cert: mine.some((x) => x.passed), ms: mine.length ? mine[0].since : null, why: mine.length ? mine[0].why : 'oubliée' };
    });
    return { per, backShots: shots.filter((x) => x.ph === 'pause').length, shots, ms: t };
  }

  const SITU = [
    { id: 'normal', ok: true, name: 'Retournement normal', o: {} },
    { id: 'rapide', ok: true, name: 'Retournement très rapide (0,15–0,25 s)', o: { D: [150, 250] } },
    { id: 'lent', ok: true, name: 'Retournement lent (0,9–1,4 s)', o: { D: [900, 1400] } },
    { id: 'haut', ok: true, name: 'Retournée de haut en bas', o: { axis: 'h' } },
    { id: 'bord', ok: true, name: 'Tenue par un bord (axe décentré)', o: { offAxis: true } },
    { id: 'presse', ok: true, name: 'Dresseur pressé (pauses et départs courts)', o: { quick: true } },
    { id: 'sombre', ok: true, name: 'Pièce sombre, mains qui tremblent', o: { dark: true, shake: 6 } },
    { id: 'reflet', ok: true, name: 'Reflets (holo, pochette)', o: { glare: true } },
    { id: 'lentcam', ok: true, name: 'Téléphone lent (7 images/s)', o: { slowCam: true } },
    { id: 'doublon', ok: true, name: 'Doublons : la même carte deux fois de suite', o: { twins: true } },
    { id: 'sortie', ok: true, name: 'Carte sortie du cadre pour la retourner (v3.84)', o: { exit: true } },
    { id: 'sortie2', ok: true, name: 'Sortie du cadre, retournée en sortant', o: { exit: true, outFlip: true } },
    { id: 'sortievite', ok: true, name: 'Sortie du cadre, geste rapide (0,5–0,7 s)', o: { exit: true, DX: [500, 700] } },
    { id: 'sortielent', ok: true, name: 'Sortie du cadre, téléphone lent et mains qui tremblent', o: { exit: true, slowCam: true, shake: 6 } },
    { id: 'faces', ok: false, cap: true, name: 'Sans paquet : faces montrées directement (prises sans badge)', o: { facesOnly: true } },
    { id: 'glisse', ok: false, cap: true, name: 'Triche : un dos montré, puis une face glissée à sa place (sans retourner)', o: { slide: true } },
    { id: 'coupe', ok: false, cap: true, name: 'Triche : le dos disparaît d’un coup, puis la face apparaît d’un coup', o: { cut: true } },
    { id: 'diapo', ok: false, cap: true, name: 'Triche (limite connue) : un dos qui sort en glissant, une face qui entre en glissant', o: { exit: true, slideOnly: true } },
  ];

  // deux façons de tenir le paquet : juste sous le cadre (la carte monte, dos visible) ou dans le cadre (derrière la carte)
  const LAYOUTS = [{ id: 'sous', below: true, name: 'Paquet tenu sous le cadre' }, { id: 'dans', below: false, name: 'Paquet tenu dans le cadre' }];
  async function runPile(onStatus, perSeq = 5, maxSeq = 8, layouts = LAYOUTS, extra = {}) {
    if (!A.state.cards.length) await A.loadAll();
    const cards = A.state.cards, backs = A.state.backs, rows = [];
    const nSeq = Math.min(maxSeq, Math.floor(cards.length / perSeq));
    for (let q = 0; q < nSeq; q++) {
      for (const Lay of layouts) for (const S of SITU) {
        let faces = cards.slice(q * perSeq, (q + 1) * perSeq).map((c) => c.img);
        if (S.o.twins) faces = faces.flatMap((f, i) => (i % 2 ? [] : [f, f])).slice(0, perSeq);
        const seed = A.hashStr(`${q}|${S.id}`), o = { ...S.o, ...extra, below: Lay.below };
        const res = runSeq(faces, backs[seed % backs.length], o, seed);
        rows.push({ lay: Lay.id, situ: S.id, ok: S.ok, ...res });
        onStatus(`Rafale en paquet : série ${q + 1} / ${nSeq} · ${Lay.name} · ${S.name}`);
        await A.tick();
      }
    }
    return rows;
  }

  function show(rows) { return LAYOUTS.filter((L) => rows.some((x) => x.lay === L.id)).map((L) => `<h3>${esc(L.name)}</h3>${showOne(rows.filter((x) => x.lay === L.id))}`).join(''); }
  function showOne(rows) {
    const pct = (a, b) => (b ? `${(Math.round((a / b) * 1000) / 10).toString().replace('.', ',')} %` : '—');
    const sec = (ms) => `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
    let h = `<div class="box scroll"><table><tr><th>Situation</th><th>Attendu</th><th>Cartes</th><th>Prises</th><th>Certifiées</th><th>Prises 2 fois</th><th>Photos du dos</th><th>Temps / carte</th><th>Refus fréquent</th></tr>`;
    const tot = { ok: [0, 0, 0], ko: [0, 0, 0] };
    for (const S of SITU) {
      const R = rows.filter((x) => x.situ === S.id), per = R.flatMap((x) => x.per);
      const taken = per.filter((p) => p.taken), cert = per.filter((p) => p.cert).length, twice = per.filter((p) => p.twice).length;
      const backs = R.reduce((s, x) => s + x.backShots, 0), ms = taken.map((p) => p.ms).sort((a, b) => a - b);
      const whys = {}; per.filter((p) => !p.cert).forEach((p) => { const w = (p.why || '').split(' — ')[0]; whys[w] = (whys[w] || 0) + 1; });
      const topWhy = Object.entries(whys).sort((a, b) => b[1] - a[1])[0];
      const good = S.ok ? cert : per.length - cert;
      const b = S.ok ? tot.ok : tot.ko; b[0] += good; b[1] += per.length; b[2] += taken.length;
      h += `<tr><td>${esc(S.name)}</td><td>${S.ok ? 'certifiées' : 'sans badge'}</td><td class="n">${per.length}</td><td class="n">${pct(taken.length, per.length)}</td>`
        + `<td class="n ${S.ok ? (cert / per.length >= 0.9 ? 'good' : cert / per.length >= 0.75 ? 'mid' : 'bad') : (cert ? 'bad' : 'good')}">${pct(cert, per.length)}</td>`
        + `<td class="n">${twice}</td><td class="n">${backs}</td><td class="n">${ms.length ? sec(ms[ms.length >> 1]) : '—'}</td><td>${topWhy && topWhy[1] ? `${esc(topWhy[0])} (${topWhy[1]})` : ''}</td></tr>`;
    }
    h += `<tr><td><b>Vrais gestes certifiés</b></td><td></td><td></td><td class="n"><b>${pct(tot.ok[2], tot.ok[1])}</b></td><td class="n"><b>${pct(tot.ok[0], tot.ok[1])}</b></td><td colspan="4"></td></tr>`;
    h += `<tr><td><b>Sans retournement : pas de badge</b></td><td></td><td></td><td class="n"><b>${pct(tot.ko[2], tot.ko[1])}</b></td><td class="n"><b>${pct(tot.ko[0], tot.ko[1])}</b></td><td colspan="4"></td></tr></table>`;
    h += '<p class="lead" style="margin-top:8px">Temps / carte = médiane, du moment où le dos de la carte apparaît jusqu’à la photo. « Prises » : chaque carte doit être prise une fois, même sans badge.</p></div>';
    return h;
  }

  async function go() {
    const btn = $('#go3'); btn.disabled = true;
    try {
      const st = (m) => { $('#status3').textContent = m; };
      const t0 = performance.now();
      const rows = await runPile(st, 5, +($('#o-seq3') || {}).value || 8);
      window.__pile = rows;
      $('#results3').innerHTML = show(rows);
      st(`Terminé en ${Math.round((performance.now() - t0) / 1000)} s.`);
    } finally { btn.disabled = false; }
  }
  if ($('#go3')) $('#go3').addEventListener('click', go);
  window.__laboPile = { runPile, runSeq, show, SITU, go };
})();
