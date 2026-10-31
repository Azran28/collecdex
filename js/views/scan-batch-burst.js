/* Scanner — rafale (caméra ouverte, cartes prises toutes seules) — morceau de la fonction de scan-batch.js (découpage automatique v3.06 ; état partagé : X.S). */
App.scanBatchParts = App.scanBatchParts || {};
App.scanBatchParts.burst = (X, { R, RAFALE_CERT, ad, alive, burst, cam, certOn, el, esc, resultsEl, setStatus, sv, urls, view }) => {
  const { S } = X;
    // ---------- Rafale : la caméra reste ouverte, chaque carte immobile est prise toute seule ----------
    S.rTimer = null; S.rBusy = false; S.rPrev = null; S.rStable = 0; S.rLast = null; S.rQueue = Promise.resolve(); S.rPending = 0;
    const GW = 40, GH = 56, GM = 0.06 / 1.12; // petite image de suivi ; marge du cadre jaune dans la zone capturée
    const mad = (A, B) => { let d = 0; for (let i = 0; i < A.length; i++) d += Math.abs(A[i] - B[i]); return d / A.length; };
    function rGrab() {
      const v = cam.video, r = cam.region(); if (!v || !r || !v.videoWidth) return null;
      const c = rGrab.c || (rGrab.c = Object.assign(document.createElement('canvas'), { width: GW, height: GH }));
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(v, r.sx + r.sw * GM, r.sy + r.sh * GM, r.sw * (1 - 2 * GM), r.sh * (1 - 2 * GM), 0, 0, GW, GH);
      const d = g.getImageData(0, 0, GW, GH).data, o = new Float32Array(GW * GH);
      for (let i = 0; i < o.length; i++) o[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
      return o;
    }
    /** Même carte que la précédente (juste un peu bougée ou zoomée, par ex. après la consigne) ? */
    function sameCard(A, B) {
      if (mad(A, B) < 9) return true;
      try { const m = App.certify._test.motion(A, B, GW, GH); return m.rel < 0.62 && m.fit < 0.78; } catch (e) { return false; }
    }
    const rHint = (html, cls = '') => { const h = view.querySelector('.r-live'); if (h) { h.className = `r-live ${cls}`; h.innerHTML = html; } };
    S.rTrk = null; // certification « dos d'abord » (si « Certifier » est choisi)
    const wantCert = () => RAFALE_CERT && certOn && App.views.scan.certWanted('rafale');
    function rTick() {
      if (S.rBusy || !cam.on) return;
      const F = rGrab(); if (!F) return;
      let mean = 0; for (const v of F) mean += v; mean /= F.length;
      let sd = 0; for (const v of F) sd += (v - mean) ** 2; sd = Math.sqrt(sd / F.length);
      const hadPrev = !!S.rPrev, diff = hadPrev ? mad(F, S.rPrev) : 99; S.rPrev = F;
      if (wantCert()) {
        // v3.58 : paquet face cachée tenu SOUS le cadre — on monte la carte du dessus (dos vu), on la retourne, on la tient
        // immobile → prise et certifiée toute seule (sans lampe), on la pose. Paquet dans le cadre : au labo, 63 % certifiées
        // au lieu de 92 % (le dos du paquet, derrière, cache le geste). Le dos vu depuis la dernière photo prouve que c'est
        // une nouvelle carte : pas de « même carte » ici (doublons dans le paquet). Banc : labo-certif.html › labo-rafale.js.
        if (!S.rTrk) S.rTrk = App.certify.tracker(cam.video, () => cam.region(), { auto: true, kind: 'rafale', only: S.auto ? null : S.game }); // licence choisie : seulement son dos
        const ph = S.rTrk.step(), n = S.cells.length + 1;
        // v3.87 (Arnaud : « je n'ai pas compris qu'il fallait rescanner le dos pour chaque carte ») : le numéro de la carte et
        // l'étape restent affichés pendant toute la rafale
        if (ph !== 'attente') S.rNoBackT = 0;
        if (ph === 'pret') { S.rStable = 0; rCapture(F, true); return; }
        if (ph === 'dos') { S.rStable = 0; rHint(`Carte ${n} : dos vu ✓ — <b>retourne</b>-la`, 'go'); return; }
        if (ph === 'retourne') { S.rStable = 0; rHint(`Carte ${n} : tiens-la immobile…`, 'go'); return; }
        // dos pas vu : une carte montrée face visible est prise quand même, sans badge (suite ci-dessous)
        if (sd < 16) { S.rStable = 0; S.rNoBackT = 0; S.rSeen = 0; S.rArmed = true; rHint(`Carte ${n} : montre d’abord son <b>dos</b>`); return; }
        if (S.rLast && sameCard(S.rLast, F)) {
          S.rStable = 0;
          const ok = S.rLastLive && S.rLastLive.passed;
          rHint(ok ? `${App.icons.icon('shield', 13)} Carte ${n - 1} certifiée — pose-la, puis le <b>dos</b> de la suivante` : `Carte ${n - 1} sans badge — pour la suivante, montre d’abord son <b>dos</b>`, ok ? 'ok' : 'warn');
          return;
        }
      }
      // v3.38 : pièce vraiment trop sombre (1 s de suite) : dit à la place de « Présente une carte »
      S.rDark = mean < 40 ? (S.rDark || 0) + 1 : 0;
      if (S.rDark >= 10) { S.rStable = 0; rHint(App.views.scan.TIPS.sombre, 'warn'); return; }
      if (sd < 16) { S.rStable = 0; S.rSeen = 0; S.rArmed = true; rHint('Présente une carte dans le cadre'); return; }
      // v3.82 (Arnaud : « trop dur de ne pas bouger, il faut que ce soit bien plus permissif ») : avant, 4 images de suite
      // presque identiques (écart < 4 + 0,08 σ) ; maintenant une main qui tremble suffit (écart < 10 + 0,12 σ, 3 images = 0,3 s),
      // et une nouvelle carte présente depuis 0,8 s est prise même si elle bouge (1,8 s : prise quoi qu'il arrive).
      // La photo garde la plus nette des images qui suivent (cam.shot) : le léger flou d'un geste ne gêne pas la lecture.
      // après une photo, il faut un vrai changement (cadre vide, ou geste franc : carte changée) avant la suivante : sans ça, une
      // même carte tenue d'une main qui tremble était parfois reprise (2 doublons sur 21 au banc de la fausse caméra)
      if (hadPrev && diff > 30 + sd * 0.3) S.rArmed = true; // (pas juste après la photo : rPrev vient d'être remis à zéro)
      // « même carte » (comparaison grossière : toutes les cartes d'une licence ont la même mise en page) crue seulement sur 3 images
      // de suite : une seule image « pareille » remettait l'attente à zéro → cartes ratées quand la main tremble fort
      const same = !!S.rLast && sameCard(S.rLast, F); S.rSame = same ? (S.rSame || 0) + 1 : 0;
      if (window.__rLog) window.__rLog.push([Math.round(performance.now()), Math.round(sd), Math.round(diff), S.rArmed ? 1 : 0, same ? 1 : 0, S.rSeen || 0]); // (labo : journal de la rafale)
      if (S.rLast && (!S.rArmed || S.rSame >= 3)) { S.rStable = 0; S.rSeen = 0; if (wantCert()) rHint(`Carte ${S.cells.length} ${S.rLastLive && S.rLastLive.passed ? 'certifiée' : 'sans badge'} — pose-la, puis le <b>dos</b> de la suivante`, S.rLastLive && S.rLastLive.passed ? 'ok' : 'warn'); else rHint(`Carte ${S.cells.length} prise ✓ — passe à la suivante`, 'ok'); return; }
      // v3.87 : face montrée sans son dos alors que « Certifier » est choisi → 2 s pour remontrer le dos (avertissement orange après 0,6 s),
      // puis la carte est prise quand même, sans badge
      if (wantCert()) {
        const now = Date.now(); if (!S.rNoBackT) S.rNoBackT = now;
        // (les 0,6 premières secondes, simple consigne : pendant un vrai geste, la carte qui monte n’est pas encore vue comme un dos)
        if (now - S.rNoBackT < 600) { S.rStable = 0; S.rSeen = 0; rHint(`Carte ${S.cells.length + 1} : montre d’abord son <b>dos</b>`); return; }
        if (now - S.rNoBackT < 2000) { S.rStable = 0; S.rSeen = 0; rHint('Pas de badge sans le dos : montre d’abord le <b>dos</b> de la carte', 'warn'); return; }
      }
      S.rSeen = (S.rSeen || 0) + 1;
      const calm = diff < 10 + sd * 0.12, slow = diff < 28 + sd * 0.3;
      S.rStable = calm ? S.rStable + 1 : 0;
      const ready = S.rStable >= 3 || (S.rSeen >= 8 && slow) || S.rSeen >= 18;
      if (!ready) { S.rWait = 0; rHint(calm ? 'Je prends la photo…' : 'Tiens la carte dans le cadre…', 'go'); return; }
      // v3.38 (point 4) : image floue ou reflet → on attend un peu que ça s'arrange (mise au point, carte inclinée),
      // 0,8 s au plus (avant : 1,5 s), puis elle est prise quand même ; le conseil n'apparaît qu'après 0,5 s d'attente
      const pb = App.views.scan.problem(App.views.scan.quality(cam.video, cam.region(0)), 0.55);
      if (pb && pb !== 'sombre' && (S.rWait = (S.rWait || 0) + 1) < 8) { if (S.rWait >= 5) rHint(App.views.scan.TIPS[pb], 'warn'); return; }
      S.rSeen = 0;
      S.rWait = 0;
      rCapture(F, false);
    }
    /**
     * v3.84 : chaque carte certifiée (ou refusée) part au labo (comptes testeurs seulement, App.scanShare) : les petites
     * images grises du geste en mosaïque (8 par rangée, 24 × 33) + les mesures, pour régler le jugement sur de vrais gestes
     */
    async function rLabo(live, fr) {
      try {
        if (!App.scanShare || !fr.length || !(await App.scanShare.isTester())) return;
        const W = 24, H = 33, C = 8, c = Object.assign(document.createElement('canvas'), { width: C * W, height: Math.ceil(fr.length / C) * H });
        const g = c.getContext('2d'), img = g.createImageData(W, H);
        fr.forEach((f, k) => { for (let i = 0; i < f.g.length; i++) { img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = f.g[i]; img.data[i * 4 + 3] = 255; } g.putImageData(img, (k % C) * W, Math.floor(k / C) * H); });
        const blob = await new Promise((res) => c.toBlob(res, 'image/png')), t0 = fr[0].t, sc = (live && live.scores) || {};
        App.scanShare.scan({ game: S.game, mode: 'rafale', kind: 'rafale-cert', extra: { rafale: { passed: !!(live && live.passed), reasons: ((live && live.reasons) || []).map((x) => String(x).slice(0, 300)), flip: sc.flip || null, screen: sc.screen, b: fr.map((f) => Math.round(f.b * 100) / 100), ts: fr.map((f) => Math.round(f.t - t0)) } } }, blob);
      } catch (e) { console.warn('rafale → labo', e); }
    }
    async function rCapture(F, flipped) {
      S.rBusy = true; S.rStable = 0;
      rHint(`📸 Carte ${S.cells.length + 1} !`, 'ok');
      view.classList.add('r-flash'); setTimeout(() => view.classList.remove('r-flash'), 260);
      App.sfx.click(); try { if (navigator.vibrate) navigator.vibrate(25); } catch (e) { /* */ }
      try {
        // v3.38 (point 4 de « Qualité photos ») : comme en carte seule, la vraie photo du capteur quand le téléphone la donne,
        // sinon l'image vidéo la plus nette des 0,4 s qui suivent ; la vraie photo n'est plus essayée si elle n'a pas marché
        // ou a pris plus de 2,5 s (la rafale doit rester rapide)
        // v3.58 : la preuve est jugée à l'instant de la photo (comme en carte seule), avant d'attendre l'appareil photo
        const proofP = flipped && S.rTrk ? S.rTrk.proof().catch((e) => { console.warn(e); return { passed: false, reasons: ['vérification impossible'] }; }) : null;
        const t0 = Date.now(), b = await cam.shot(0.15, { useStill: !S.rNoStill });
        if (!S.rNoStill && (cam.lastSource !== 'photo' || Date.now() - t0 > 2500)) S.rNoStill = true;
        let live = null;
        if (proofP) {
          live = await proofP;
          rLabo(live, S.rTrk._debug.frames.slice(-48));
          S.rTrk.reset(); // (seulement après la preuve : elle relit les images du geste)
          App.certify.prepare('rafale'); // défi de la carte suivante (le même tant qu'il lui reste des usages)
        } else if (wantCert()) live = { passed: false, reasons: ['carte montrée sans retourner le dos d’abord'] };
        if (!b) return;
        S.rLast = F; S.rArmed = false;
        const img = await createImageBitmap(b);
        // v2.92 : photo = cadre jaune + 15 % de marge ; recadrée au ras de la carte seulement si ses bords sont sûrs, sinon
        // la photo entière (marge comprise : rien de coupé)
        const zone = cam.zone || { x: GM, y: GM, w: 1 - 2 * GM, h: 1 - 2 * GM };
        const sure = (x) => (x && x.fit >= 0.45 ? App.views.scan.sane(x) : null);
        const cut = sure(R.cutCard(img, zone)) || sure(R.cutCard(img, { x: 0.01, y: 0.01, w: 0.98, h: 0.98 }));
        const blob = cut ? await new Promise((res) => cut.canvas.toBlob(res, 'image/jpeg', 0.9)) : b;
        addBurstCell(blob, !!cut, live);
        S.rLastLive = live;
        if (live) rHint(live.passed ? `${App.icons.icon('shield', 13)} Carte ${S.cells.length} certifiée !` : `Carte ${S.cells.length} sans badge (${flipped ? 'retournement pas reconnu' : 'dos pas vu'})`, live.passed ? 'ok' : 'warn');
      } catch (e) { console.warn(e); }
      finally { S.rPrev = null; S.rBusy = false; S.rNoBackT = 0; }
    }
    /**
     * v3.82 (Arnaud : « rechercher les cartes en même temps qu'on prend les photos ») : la lecture tournait déjà pendant la
     * rafale, mais on ne la voyait pas (la caméra prend l'écran). Bande posée en bas de l'image : les dernières cartes prises,
     * avec le visuel officiel et le nom dès qu'elles sont trouvées (rond qui tourne = en lecture, ✓ sûre, ? à vérifier).
     */
    function rStrip() {
      if (!cam.on || !S.cells.length) return;
      let s = view.querySelector('.r-strip');
      if (!s) { s = document.createElement('div'); s.className = 'r-strip'; s.setAttribute('aria-live', 'polite'); view.appendChild(s); }
      const ok = S.cells.filter((c) => c.state === 'sure').length;
      // v3.87 : en « Certifier », nombre de cartes certifiées et petit bouclier vert (certifiée) ou gris barré (sans badge)
      const cert = wantCert() || S.cells.some((c) => c.live), nCert = S.cells.filter((c) => c.live && c.live.passed).length;
      const th = (c) => {
        const x = c.cands.find((y) => y.id === c.choice), done = ['sure', 'verifier'].includes(c.state) && x;
        const mark = ['attente', 'lecture'].includes(c.state) ? '<i class="spinner"></i>' : c.state === 'sure' ? '<b class="ok">✓</b>' : c.state === 'verifier' ? '<b class="q">?</b>' : '<b class="no">✕</b>';
        const shield = cert ? `<em class="r-cert${c.live && c.live.passed ? ' on' : ''}" title="${c.live && c.live.passed ? 'Certifiée' : 'Sans badge'}">${App.icons.icon('shield', 11)}</em>` : '';
        return `<span class="r-th st-${c.state}"><img src="${done ? esc(ad.img.card(x, 'low')) : c.url}" alt="">${mark}${shield}<small>${done ? esc(x.name) : c.state === 'lecture' ? 'Lecture…' : c.state === 'attente' ? 'En attente' : 'À revoir'}</small></span>`;
      };
      s.innerHTML = `<span class="r-sum">${ok}/${S.cells.length}<small>sûres</small>${cert ? `<span class="r-sum-cert">${App.icons.icon('shield', 11)} ${nCert}</span>` : ''}</span>${S.cells.slice(-5).map(th).join('')}`;
    }
    function addBurstCell(blob, auto, live, orig = null) { // orig : photo d'origine (One Piece : relue autrement si besoin)
      if (!S.cells.length) resultsEl.innerHTML = '';
      const cell = { i: S.cells.length, blob, url: URL.createObjectURL(blob), auto, box: null, state: 'attente', cands: [], choice: '', info: null, mode: null, live, orig };
      urls.push(cell.url); S.cells.push(cell); if (S.prog) S.prog.total = S.cells.length;
      S.rPending++; S.running = true; X.drawResults(); rStrip();
      S.rQueue = S.rQueue.then(async () => {
        if (S.stopped || !alive()) return;
        cell.state = 'lecture'; S.prog = { step: 'Lecture des cartes', done: cell.i, total: S.cells.length }; X.drawResults(); rStrip();
        try { await X.recogOne(cell, el.querySelector('#b-set').value, () => {}); } catch (e) { console.error(e); cell.state = 'erreur'; cell.error = e.message; }
        if (['sure', 'verifier'].includes(cell.state)) cell.found = Date.now();
        if (--S.rPending <= 0) { S.rPending = 0; S.running = false; S.prog = null; }
        if (alive()) { X.drawResults(); rStrip(); }
        if (!S.running && sv.open && sv.mode === 'scan') X.svAfterScan(); // écran d'analyse ouvert : cartes douteuses, puis récapitulatif
      });
    }
    function rStop() {
      if (S.rTimer) { clearInterval(S.rTimer); S.rTimer = null; }
      el.classList.remove('r-shooting');
      cam.stop();
      if (burst) {
        view.innerHTML = App.views.scan.empty('rafale');
        el.querySelector('#r-start').classList.remove('hidden'); el.querySelector('#r-files-btn').classList.remove('hidden');
        el.querySelector('#r-start').innerHTML = `${App.icons.icon('camera', 16)} ${S.cells.length ? 'Reprendre la rafale' : 'Démarrer la rafale'}`;
        el.querySelector('#r-pause').classList.add('hidden');
      }
    }
    function resetBurst() {
      if (S.running) return;
      rStop(); S.cells = []; S.rLast = null; S.detected = null;
      resultsEl.innerHTML = App.views.scan.guide('rafale'); setStatus('');
    }

  return { addBurstCell, rStop, rStrip, rTick, resetBurst, wantCert };
};
