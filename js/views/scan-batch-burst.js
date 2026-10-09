/* Scanner — rafale (caméra ouverte, cartes prises toutes seules) — morceau de la fonction de scan-batch.js (découpage automatique v3.06 ; état partagé : X.S). */
App.scanBatchParts = App.scanBatchParts || {};
App.scanBatchParts.burst = (X, { R, RAFALE_CERT, alive, burst, cam, certOn, el, resultsEl, setStatus, sv, urls, view }) => {
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
    S.rTrk = null; // certification « dos d'abord » (si « Certifier chaque carte » est coché)
    const wantCert = () => RAFALE_CERT && certOn && el.querySelector('#r-cert') && el.querySelector('#r-cert').checked;
    function rTick() {
      if (S.rBusy || !cam.on) return;
      const F = rGrab(); if (!F) return;
      let mean = 0; for (const v of F) mean += v; mean /= F.length;
      let sd = 0; for (const v of F) sd += (v - mean) ** 2; sd = Math.sqrt(sd / F.length);
      const diff = S.rPrev ? mad(F, S.rPrev) : 99; S.rPrev = F;
      if (wantCert()) {
        // chaque carte : le dos, on la retourne, on la tient immobile → prise et certifiée toute seule
        if (!S.rTrk) S.rTrk = App.certify.tracker(cam.video, () => cam.region(), { auto: true });
        const ph = S.rTrk.step();
        if (ph === 'pret') { if (S.rLast && sameCard(S.rLast, F)) { S.rTrk.reset(); rHint(`Carte ${S.cells.length} prise ✓ — passe à la suivante`, 'ok'); return; } rCapture(F, true); return; }
        if (ph === 'lampe') { rHint('💡 Ne bouge pas : la lampe clignote…', 'go'); return; }
        if (ph === 'dos') { rHint('Retourne-la !', 'go'); return; }
        if (ph === 'retourne') { rHint('Tiens-la immobile…', 'go'); return; }
        if (S.rLast && sd >= 16 && sameCard(S.rLast, F)) { rHint(`Carte ${S.cells.length} prise ✓ — montre le dos de la suivante`, 'ok'); return; }
        rHint(sd < 16 ? 'Montre le <b>dos</b> d’une carte dans le cadre' : 'Montre d’abord le <b>dos</b>, puis retourne la carte');
        return;
      }
      if (sd < 16) { S.rStable = 0; rHint('Présente une carte dans le cadre'); return; }
      if (diff > 4 + sd * 0.08) { S.rStable = 0; rHint('Tiens la carte immobile…'); return; }
      if (++S.rStable < 4) { rHint('Ne bouge plus…', 'go'); return; }
      if (S.rLast && sameCard(S.rLast, F)) { rHint(`Carte ${S.cells.length} prise ✓ — passe à la suivante`, 'ok'); return; }
      rCapture(F, false);
    }
    async function rCapture(F, flipped) {
      S.rBusy = true; S.rStable = 0;
      rHint(`📸 Carte ${S.cells.length + 1} !`, 'ok');
      view.classList.add('r-flash'); setTimeout(() => view.classList.remove('r-flash'), 260);
      App.sfx.click(); try { if (navigator.vibrate) navigator.vibrate(25); } catch (e) { /* */ }
      try {
        const b = await cam.capture();
        if (!b) return;
        let live = null;
        if (flipped && S.rTrk) {
          try { live = await S.rTrk.proof(); } catch (e) { console.warn(e); live = { passed: false, reasons: ['vérification impossible'] }; }
          S.rTrk.reset();
          App.certify.prepare(); // défi de la carte suivante, préparé d'avance
        }
        S.rLast = F;
        const img = await createImageBitmap(b);
        // v2.92 : photo = cadre jaune + 15 % de marge ; recadrée au ras de la carte seulement si ses bords sont sûrs, sinon
        // la photo entière (marge comprise : rien de coupé)
        const zone = cam.zone || { x: GM, y: GM, w: 1 - 2 * GM, h: 1 - 2 * GM };
        const sure = (x) => (x && x.fit >= 0.45 ? App.views.scan.sane(x) : null);
        const cut = sure(R.cutCard(img, zone)) || sure(R.cutCard(img, { x: 0.01, y: 0.01, w: 0.98, h: 0.98 }));
        const blob = cut ? await new Promise((res) => cut.canvas.toBlob(res, 'image/jpeg', 0.9)) : b;
        addBurstCell(blob, !!cut, live);
        if (flipped) rHint(live && live.passed ? `${App.icons.icon('shield', 13)} Carte ${S.cells.length} vérifiée — suivante !` : `Carte ${S.cells.length} prise (non certifiable) — suivante !`, live && live.passed ? 'ok' : '');
      } catch (e) { console.warn(e); }
      finally { S.rPrev = null; S.rBusy = false; }
    }
    function addBurstCell(blob, auto, live, orig = null) { // orig : photo d'origine (One Piece : relue autrement si besoin)
      if (!S.cells.length) resultsEl.innerHTML = '';
      const cell = { i: S.cells.length, blob, url: URL.createObjectURL(blob), auto, box: null, state: 'attente', cands: [], choice: '', info: null, mode: null, live, orig };
      urls.push(cell.url); S.cells.push(cell); if (S.prog) S.prog.total = S.cells.length;
      S.rPending++; S.running = true; X.drawResults();
      S.rQueue = S.rQueue.then(async () => {
        if (S.stopped || !alive()) return;
        cell.state = 'lecture'; S.prog = { step: 'Lecture des cartes', done: cell.i, total: S.cells.length }; X.drawResults();
        try { await X.recogOne(cell, el.querySelector('#b-set').value, () => {}); } catch (e) { console.error(e); cell.state = 'erreur'; cell.error = e.message; }
        if (['sure', 'verifier'].includes(cell.state)) cell.found = Date.now();
        if (--S.rPending <= 0) { S.rPending = 0; S.running = false; S.prog = null; }
        if (alive()) X.drawResults();
        if (!S.running && sv.open && sv.mode === 'scan') X.svAfterScan(); // écran d'analyse ouvert : cartes douteuses, puis récapitulatif
      });
    }
    function rStop() {
      if (S.rTimer) { clearInterval(S.rTimer); S.rTimer = null; }
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

  return { addBurstCell, rStop, rTick, resetBurst };
};
