/* Scanner — modes « page de classeur » et « rafale ». Partie de App.views.scan (voir scan.js). */
Object.assign(App.views.scan, {
  async batch(el, params, alive, burst = false) {
    const S = {}, X = { S }; // état partagé et fonctions des morceaux (découpage v3.06)
    const { esc } = App.util;
    const R = App.recognizer, RATIO = R.RATIO;
    // licence (v2.88 : classeur et rafale aussi pour One Piece) : la même que dans « Une carte » (puces en haut, ?jeu=…)
    const GAMES = App.games.list.filter((g) => g.status === 'actif' && App.games.get(g.id));
    S.game = params.query.jeu && App.games.get(params.query.jeu) ? params.query.jeu : 'pokemon';
    if (!params.query.jeu) { try { const g = sessionStorage.getItem('scanGame'); if (g && App.games.get(g)) S.game = g; } catch (e) { /* */ } }
    try { sessionStorage.setItem('scanGame', S.game); } catch (e) { /* */ }
    const ad = App.games.get(S.game);
    const isPk = () => S.game === 'pokemon';
    const modeQ = burst ? 'rafale' : 'classeur';
    const gamePick = GAMES.length > 1 ? `<div class="chips sc-game" role="tablist" aria-label="Licence des cartes">${GAMES.map((g) => `<a class="chip ${g.id === S.game ? 'on' : ''}" href="#/scan?mode=${modeQ}&jeu=${g.id}" role="tab" aria-selected="${g.id === S.game}">${App.icons.icon(g.icon, 14)} ${esc(g.name)}</a>`).join('')}</div>` : '';
    /** Lit une carte selon la licence : Pokémon (texte + série) ou One Piece (code imprimé + illustration) */
    const readCard = async (blob, hint, st, orig = null, ctx = null) => {
      // (original : la case elle-même, relue au ras de ses bords et en bandes glissantes si le code n'est pas où on l'attend — marge de la pochette)
      // (ctx : la case et ses alentours, pour la vérification par l'image en classeur)
      if (!isPk()) return ad.recognize(blob, st, { setId: hint, original: orig || blob, context: ctx });
      const r = hint ? await (async () => { const info = await R.read(blob, st, { atkBand: burst }); return { info, cands: await R.inSet(blob, info, hint, st) }; })()
        : await R.recognize(blob, st, { atkBand: burst });
      // rafale (cartes seules) : même vérification par l'image qu'en carte seule, seulement si le texte n'est pas sûr (v2.96)
      // (en classeur, c'est visualPass, sur toute la page, qui s'en charge)
      const V = App.visual;
      if (burst && r.cands && !(r.cands[0] && r.cands[0].confident) && !r.info.otherGame && V && V.supported() && App.settings.visualCheck !== false) {
        const tie = (a, b) => (((b.set && b.set.id) === hint) - ((a.set && a.set.id) === hint));
        const o = await V.check(blob, r.cands, { tie }).catch(() => null);
        if (o) { r.cands = o.cands; if (o.crop) r.info.crop = o.crop; }
      }
      return r;
    };
    const FORMATS = { '3x3': [3, 3, '9 cartes (3 × 3)'], '2x2': [2, 2, '4 cartes (2 × 2)'], double: [6, 3, '18 cartes (classeur ouvert, 2 pages)'] };
    const PAGE_FORMATS = Object.fromEntries(Object.entries(FORMATS).filter(([k]) => k !== 'double'));
    // format de la page = celui affiché dans la liste, toujours respecté (v2.98 : la détection automatique passait parfois en
    // « classeur ouvert, 18 cartes » alors qu'Arnaud avait laissé 9 cartes) ; gardé d'une fois sur l'autre
    S.fmt = (() => { try { const v = localStorage.getItem('pageFmt'); return FORMATS[v] ? v : '3x3'; } catch (e) { return '3x3'; } })(); S.fmtChosen = true;
    S.photo = null;          // { img, url }
    S.grid = null;           // { x, y, w, h } en fraction de l'image affichée
    S.cells = [];            // résultats par pochette
    S.running = false; S.stopped = false; S.detected = null; S.timing = null; S.prog = null; // prog : barre de progression de la page ; timing : temps de chaque étape (vérification par l’image, en essai)
    // écran plein écran de la page (v2.32) : 'scan' pendant l'analyse, 'review' = cartes à vérifier une par une, 'recap' = récapitulatif
    const sv = { open: false, mode: 'scan', list: [], idx: 0, single: false };
    S.pageDur = 0; // durée de l'analyse de la page (affichée dans le récapitulatif)
    S.autoGrid = false; S.autoTimer = null;   // grille trouvée toute seule / lancement automatique
    S.autoCells = null; S.autoRot = 0; S.dimsOv = null; // cases trouvées (photo en biais) ; cartes couchées ; 2 pages en hauteur
    S.pageCert = null;       // vérification en direct de la photo de page (null = photo importée)
    S.pageId = null;         // page gardée sur cet appareil pour pouvoir recadrer plus tard
    S.allSets = null;
    const urls = [];

    const certOn = App.certify.available();
    // v2.57 : certification d'une page retirée pour le moment (la lampe ne marchait pas assez bien sur la page — Arnaud) ;
    // le code reste (livePage), il suffit de repasser PAGE_CERT à vrai
    const PAGE_CERT = false;
    const RAFALE_CERT = false; // v2.58 : certification en rafale retirée pour le moment aussi (demande d'Arnaud)
    const setBox = (title) => `<div class="set-first">
            <div class="sf-head">${App.icons.icon('layers', 18)}<div><b>${title}</b> <span class="small muted">(facultatif, plus fiable)</span></div></div>
            <select id="b-set"><option value="">Série : je ne sais pas</option></select>
          </div>`;
    // commandes du mode page (gardées cachées en rafale : le code commun s'en sert)
    const pageCtl = `<div class="row" style="margin-bottom:10px">
            <label class="small"><span class="m-hide">Format de la page</span>
              <select id="b-fmt">${Object.entries(FORMATS).map(([k, v]) => `<option value="${k}"${k === S.fmt ? ' selected' : ''}>${v[2]}</option>`).join('')}</select></label>
          </div>`;
    // page de classeur (pas de certification) : l'appareil photo du téléphone d'abord — plein écran, pleine qualité
    const pageBtns = `<div class="row action-dock scan-dock" style="margin-top:14px" id="b-actions">
            <label class="btn primary" id="b-native">${App.icons.icon('camera', 16)} Prendre la page en photo<input type="file" accept="image/*" capture="environment" id="b-file" hidden></label>
            <button class="btn primary hidden" id="b-shot">${App.icons.icon('capture', 16)} Prendre la photo</button>
            <label class="btn">Choisir une photo<input type="file" accept="image/*" id="b-file2" hidden></label>
            ${certOn && !burst && PAGE_CERT ? '' : `<button class="btn hidden" id="b-cam">${App.icons.icon('shield', 16)} Certifier la page</button>`}
          </div>
          ${certOn && !burst && PAGE_CERT ? App.views.scan.certBlock('classeur', `<button class="btn primary" id="b-cam">${App.icons.icon('shield', 16)} Certifier la page</button>`) : ''}
          <div id="b-gridbar" class="hidden" style="margin-top:14px">
            <div id="b-auto" class="b-auto hidden"></div>
            <!-- la reconnaissance part toute seule ; le bouton n'apparaît que si la grille est à placer à la main -->
            <div class="row action-dock"><button class="btn primary hidden" id="b-go">▶ Lancer la reconnaissance</button><button class="btn ghost" id="b-reset">Reprendre une photo</button></div>
          </div>`;
    el.innerHTML = burst ? `
      ${gamePick}<div class="batch-wrap">
        <div>
          ${setBox('Série des cartes')}
          <div class="scan-view" id="b-view">${App.views.scan.empty('rafale')}</div>
          <div id="r-hint" class="r-hint hidden"></div>
          <div class="row action-dock scan-dock" style="margin-top:14px" id="r-actions">
            <button class="btn primary" id="r-start">${App.icons.icon('camera', 16)} Démarrer la rafale</button>
            <button class="btn hidden" id="r-pause">Pause</button>
            <label class="btn" id="r-files-btn">Choisir des photos<input type="file" accept="image/*" multiple id="r-files" hidden></label>
          </div>
          ${certOn && RAFALE_CERT ? App.views.scan.certBlock('rafale', App.views.scan.certSwitch('r-cert', true, `${App.icons.icon('shield', 16)} Certification`)) : ''}
          <div hidden>${pageCtl}${pageBtns}</div>
        </div>
        <div>
          <div id="b-status"></div>
          <div id="b-results">${App.views.scan.guide('rafale')}</div>
          <div id="b-sv" class="sv hidden" role="dialog" aria-modal="true" aria-label="Analyse des cartes"></div>
        </div>
      </div>` : `
      ${gamePick}<div class="batch-wrap">
        <div>
          <div class="sc-opts">${setBox('Série de la page')}${pageCtl}</div>
          <div class="scan-view batch-view" id="b-view">${App.views.scan.empty('classeur', FORMATS[S.fmt])}</div>
          ${pageBtns}
        </div>
        <div>
          <div id="b-certline"></div><!-- résultat de la certification de la page : reste affiché (avant, il était remplacé par la suite) -->
          <div id="b-status"></div>
          <div id="b-results">${App.views.scan.guide('classeur')}</div>
          <div id="b-sv" class="sv hidden" role="dialog" aria-modal="true" aria-label="Analyse de la page"></div>
        </div>
      </div>`;

    const view = el.querySelector('#b-view');
    const statusEl = el.querySelector('#b-status');
    const resultsEl = el.querySelector('#b-results');
    const setStatus = (html) => { statusEl.innerHTML = html ? `<div class="panel" style="margin-bottom:14px">${html}</div>` : ''; };
    const cam = App.views.scan.camera(view, { guide: burst });
    const dims = () => (burst ? [3, 1] : S.dimsOv || FORMATS[S.fmt]);
    /** Grille réglable de départ : la forme du format choisi (cartes 63 × 88, couchées pour un classeur ouvert en hauteur), centrée */
    function defaultGrid() {
      const [cols, rows] = dims();
      const img = S.photo && S.photo.img, P = img && img.naturalWidth ? img.naturalWidth / img.naturalHeight : 0.75;
      const A = S.dimsOv ? (cols * 88) / (rows * 63) : (cols * 63) / (rows * 88); // largeur / hauteur de la zone des cartes
      let h = 0.92, w = (A * h) / P;
      if (w > 0.92) { w = 0.92; h = (w * P) / A; }
      return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
    }
    /** Applique une détection (grille régulière ou cases une par une) */
    function useDetection(g, k) {
      S.grid = { x: g.x, y: g.y, w: g.w, h: g.h }; S.autoGrid = true;
      S.autoCells = g.cells || null; S.autoRot = g.rot || 0;
      // chaque case ajustée sur les VRAIS bords de sa carte (la grille, régulière, tombe parfois à côté)
      if (S.autoCells && !S.autoRot && S.photo && !window.__noSnap) {
        let snapped = [];
        // (classeur ouvert : les cases viennent page par page, 3 × 3 chacune)
        const [cc, rr] = k === 'double' ? [3, 3] : (FORMATS[k] || [3, 3]);
        try { snapped = R.snapCells(S.photo.img, S.autoCells, cc, rr); } catch (e) { console.warn(e); }
        S.autoCells = S.autoCells.map((c, i) => (snapped[i] ? { ...c, quad: snapped[i], snapped: true, gridQuad: c.quad } : c));
      }
      S.dimsOv = k === 'double' && g.rot ? [3, 6] : null;
    }

    // liste des séries pour « Série de la page »
    ad.listSets().then((sets) => {
      S.allSets = sets;
      let saved = ''; try { saved = sessionStorage.getItem('pageSet') || ''; } catch (e) { /* */ }
      const sel = el.querySelector('#b-set'); if (sel) { App.views.scan.fillSetSelect(sel, sets, saved); sel.closest('.set-first').classList.toggle('chosen', !!sel.value); }
    }).catch(() => {});
    el.querySelector('#b-fmt').addEventListener('change', (e) => {
      S.fmt = e.target.value; S.fmtChosen = true; try { localStorage.setItem('pageFmt', S.fmt); } catch (err) { /* */ } cancelAuto(); S.autoCells = null; S.autoRot = 0; S.dimsOv = null; S.autoGrid = false; S.grid = defaultGrid();
      if (S.photo && !S.running) {
        let gd = null;
        try { gd = S.fmt === 'double' ? R.detectDouble(S.photo.img) : R.detectGrid(S.photo.img, ...FORMATS[S.fmt].slice(0, 2)); } catch (err) { console.warn(err); }
        if (gd && gd.fit >= 0.45) useDetection(gd, S.fmt);
        else { if (S.fmt === 'double') { const t = S.photo.img.naturalHeight > S.photo.img.naturalWidth; S.dimsOv = t ? [3, 6] : null; } S.grid = defaultGrid(); }
        drawGrid();
      } else if (view.querySelector('.scan-empty')) view.innerHTML = App.views.scan.empty('classeur', dims()); // pas encore de photo : le dessin prend le format choisi
    });
    el.querySelector('#b-set').addEventListener('change', (e) => {
      try { sessionStorage.setItem('pageSet', e.target.value); } catch (err) { /* */ }
      e.target.closest('.set-first').classList.toggle('chosen', !!e.target.value);
    });
    const certHelp = (show) => { const h = el.querySelector('#b-cert-help'); if (h) h.classList.toggle('hidden', !show); };
    el.querySelector('#b-cam').addEventListener('click', async () => {
      try {
        await cam.start(); el.querySelector('#b-shot').classList.remove('hidden'); setStatus('');
        el.querySelector('#b-native').classList.add('hidden'); el.querySelector('#b-cam').classList.add('hidden'); el.querySelector('#b-file2').closest('label').classList.add('hidden');
        certHelp(false);
        // consigne sur la vidéo : cadrer toute la page
        view.insertAdjacentHTML('beforeend', `<div class="flip-hint pc-aim">${App.icons.icon('shield', 14)} Cadre <b>toute la page</b>, puis appuie sur <b>Prendre la photo</b></div>`);
        // la vidéo entière à l'écran, sans avoir à faire défiler
        setTimeout(() => window.scrollTo({ top: Math.max(0, view.getBoundingClientRect().top + window.scrollY - 60), behavior: 'smooth' }), 350);
      }
      catch (e) { setStatus(`<b>Caméra indisponible.</b><br><span class="small muted">${esc(e.message)}</span>`); }
    });
    el.querySelector('#b-shot').addEventListener('click', async () => {
      el.querySelector('#b-shot').classList.add('hidden');
      const aim = view.querySelector('.pc-aim'); if (aim) aim.remove();
      // certification de la page (v2.54) : la LAMPE d'abord (~3 s, on ne bouge pas), PUIS la photo nette.
      // (v2.53 faisait l'inverse : sur Android la caméra se relance après une photo pleine résolution, et la lampe
      // n'avait plus d'images à mesurer — « la caméra n'a pas donné assez d'images »)
      let res = null;
      if (App.certify.available() && PAGE_CERT) {
        setStatus('');
        try {
          // la lampe se mesure sur 9 zones de l'image (inutile de chercher les pochettes : plus rapide, on attend moins)
          const q = (x, y) => [[x / 3, y / 3], [(x + 1) / 3, y / 3], [(x + 1) / 3, (y + 1) / 3], [x / 3, (y + 1) / 3]];
          const uses = FORMATS[S.fmt] ? FORMATS[S.fmt][0] * FORMATS[S.fmt][1] : 9; // nombre de cartes que le défi du serveur pourra certifier
          res = await App.certify.livePage(cam.video, view, [0, 1, 2].flatMap((y) => [0, 1, 2].map((x) => q(x, y))), uses);
        } catch (e) { console.warn(e); res = { passed: false, reasons: ['vérification impossible'] }; }
      }
      setStatus('<div class="spinner"></div><div style="text-align:center">Photo en haute définition…</div>');
      const b = await cam.photo();
      if (!b) { setStatus(''); el.querySelector('#b-shot').classList.remove('hidden'); return; }
      cam.stop();
      startGrid(b, res);
    });
    const fromFile = (e) => { if (e.target.files[0]) { cam.stop(); startGrid(e.target.files[0], null); } e.target.value = ''; };
    el.querySelector('#b-file').addEventListener('change', fromFile); // appareil photo du téléphone
    el.querySelector('#b-file2').addEventListener('change', fromFile); // galerie
    el.querySelector('#b-reset').addEventListener('click', () => {
      if (S.running) return;
      el.querySelector('#b-native').classList.remove('hidden'); if (PAGE_CERT) el.querySelector('#b-cam').classList.remove('hidden'); el.querySelector('#b-file2').closest('label').classList.remove('hidden'); el.querySelector('#b-shot').classList.add('hidden'); certHelp(true);
      cancelAuto(); el.querySelector('#b-auto').classList.add('hidden');
      S.photo = null; S.grid = null; S.cells = []; S.pageCert = null; S.pageId = null; resultsEl.innerHTML = ''; setStatus(''); { const cb = el.querySelector('#b-certline'); if (cb) cb.innerHTML = ''; }
      el.querySelector('#b-gridbar').classList.add('hidden');
      el.querySelector('#b-actions').classList.remove('hidden');
      view.innerHTML = App.views.scan.empty('classeur', dims());
      resultsEl.innerHTML = App.views.scan.guide('classeur');
    });

    // photo transmise par le mode « Une carte » (page de classeur détectée)
    if (App._pendingPage) { const b = App._pendingPage; App._pendingPage = null; setTimeout(() => startGrid(b, null), 0); }

    // ---------- Grille ajustable ----------
    function startGrid(blob, cert = null) {
      el.querySelector('#b-go').classList.add('hidden'); // la reconnaissance partira toute seule si la grille est sûre
      S.cells = []; resultsEl.innerHTML = App.views.scan.guide('classeur'); setStatus('');
      S.pageCert = cert; S.pageId = null;
      const certBox = el.querySelector('#b-certline'); // encadré qui reste affiché pendant toute la reconnaissance
      if (certBox) certBox.innerHTML = !cert ? '' : `<div class="panel" style="margin-bottom:14px">${(cert.passed
        ? `<span class="cert-ok">${App.icons.icon('shield', 16)} Capture en direct vérifiée</span> <span class="small muted">— les cartes bien reconnues seront certifiées.</span>`
        : `<span class="small">${App.icons.icon('shield', 14)} <b>Page non certifiable</b> : ${esc(cert.reasons.join(', '))}. <span class="muted">Tu peux quand même ajouter les cartes, ou reprendre la photo.</span></span>`
      ) + (cert.flashTrace ? App.certify.lampChart(cert.flashTrace, cert.lampFit) : '')}</div>`;
      const url = URL.createObjectURL(blob); urls.push(url);
      view.innerHTML = `<div class="crop-area"><img src="${url}" alt="Page de classeur"><div class="grid-box"></div></div>`;
      const img = view.querySelector('img');
      img.onload = () => {
        S.photo = { img, url, blob };
        S.autoGrid = false; S.autoCells = null; S.autoRot = 0; S.dimsOv = null; S.grid = defaultGrid();
        drawGrid();
        el.querySelector('#b-actions').classList.add('hidden');
        el.querySelector('#b-gridbar').classList.remove('hidden');
        // on cherche la grille tout seul (format compris) ; si c'est sûr, la reconnaissance démarre d'elle-même
        setTimeout(() => {
          let r = null;
          try {
            // format choisi à la main : on cherche CETTE grille-là, sans passer à un autre format
            if (S.fmtChosen) { const g = S.fmt === 'double' ? R.detectDouble(img) : R.detectGrid(img, ...FORMATS[S.fmt].slice(0, 2)); r = g ? { fmt: S.fmt, grid: g } : null; }
            else r = R.detectPage(img, PAGE_FORMATS, S.fmt === 'double' ? '3x3' : S.fmt);
          } catch (e) { console.warn('grille', e); }
          if (!S.photo || S.photo.img !== img) return;
          const found = r && r.grid && r.grid.fit >= 0.38 && r.grid.w > 0.2 && r.grid.h > 0.2;
          const ok = found && r.grid.fit >= 0.45; // assez sûr pour lancer la reconnaissance tout seul
          const auto = el.querySelector('#b-auto');
          if (found) {
            if (r.fmt !== S.fmt) { S.fmt = r.fmt; el.querySelector('#b-fmt').value = S.fmt; }
            useDetection(r.grid, r.fmt); drawGrid();
          }
          if (!ok) { el.querySelector('#b-go').classList.remove('hidden'); auto.classList.remove('hidden'); auto.innerHTML = `${App.icons.icon('layers', 14)} ${found ? 'Vérifie les cases (glisse la grille si besoin)' : 'Je n’ai pas trouvé la grille tout seul : place-la sur les pochettes'}, puis lance la reconnaissance.`; return; }
          let n = 3;
          auto.classList.remove('hidden');
          window.scrollTo({ top: Math.max(0, view.getBoundingClientRect().top + window.scrollY - 70), behavior: 'smooth' });
          const tick = () => {
            auto.innerHTML = `${App.icons.icon('check', 14)} <b>Grille placée toute seule</b> — ${FORMATS[S.fmt][2]} : reconnaissance dans ${n} s… <button class="linkbtn" id="b-adjust">Ajuster d’abord</button>`;
            if (n-- <= 0) { S.autoTimer = null; auto.classList.add('hidden'); el.querySelector('#b-go').click(); return; }
            S.autoTimer = setTimeout(tick, 1000);
          };
          tick();
        }, 60);
      };
    }
    function cancelAuto() {
      // grille ajustée à la main (ou pas trouvée) : le bouton pour lancer la reconnaissance apparaît
      if (S.photo && !S.running) el.querySelector('#b-go').classList.remove('hidden');
      if (!S.autoTimer) return;
      clearTimeout(S.autoTimer); S.autoTimer = null;
      const a = el.querySelector('#b-auto'); if (a) a.innerHTML = `${App.icons.icon('layers', 14)} Ajuste la grille si besoin, puis lance la reconnaissance.`;
    }
    el.querySelector('#b-gridbar').addEventListener('click', (e) => { if (e.target.closest('#b-adjust')) cancelAuto(); });
    function drawGrid() {
      const [cols, rows] = dims();
      const box = view.querySelector('.grid-box'); if (!box) return;
      const W = S.photo.img.clientWidth, H = S.photo.img.clientHeight;
      // cases trouvées une par une (photo en biais) : on dessine chaque pochette
      let ov = view.querySelector('.cells-ov');
      if (S.autoGrid && S.autoCells) {
        box.style.display = 'none';
        if (!ov) { ov = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); ov.setAttribute('class', 'cells-ov'); view.querySelector('.crop-area').appendChild(ov); }
        ov.setAttribute('viewBox', `0 0 ${W} ${H}`); ov.setAttribute('width', W); ov.setAttribute('height', H);
        const outer = `M0 0H${W}V${H}H0Z`;
        const polys = S.autoCells.map((c) => c.quad.map(([x, y]) => `${(x * W).toFixed(1)},${(y * H).toFixed(1)}`).join(' '));
        ov.innerHTML = `<path d="${outer} ${S.autoCells.map((c) => 'M' + c.quad.map(([x, y]) => `${(x * W).toFixed(1)} ${(y * H).toFixed(1)}`).join('L') + 'Z').join(' ')}" fill="rgba(0,0,0,.45)" fill-rule="evenodd"/>` +
          polys.map((p, i) => { const q = S.autoCells[i].quad; return `<polygon points="${p}"/><text x="${(q[0][0] * W + 5).toFixed(1)}" y="${(q[0][1] * H + 15).toFixed(1)}">${i + 1}</text>`; }).join('');
        return;
      }
      if (ov) ov.remove();
      box.style.display = '';
      Object.assign(box.style, { left: S.grid.x * W + 'px', top: S.grid.y * H + 'px', width: S.grid.w * W + 'px', height: S.grid.h * H + 'px', gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` });
      box.innerHTML = Array.from({ length: cols * rows }, (_, i) => `<div class="gcell"><span>${i + 1}</span></div>`).join('') +
        ['tl', 'tr', 'bl', 'br'].map((h) => `<span class="gh ${h}" data-h="${h}"></span>`).join('');
    }
    view.addEventListener('pointerdown', (e) => {
      if (!S.photo || S.running || !e.target.closest('.crop-area')) return;
      e.preventDefault(); cancelAuto();
      if (S.autoGrid && S.autoCells) { S.autoCells = null; S.autoGrid = false; drawGrid(); } // on repasse en grille réglable à la main
      S.autoGrid = false;
      const area = view.querySelector('.crop-area').getBoundingClientRect();
      const W = S.photo.img.clientWidth, H = S.photo.img.clientHeight;
      const h = e.target.dataset.h;
      const start = { ...S.grid }, px = (e.clientX - area.left) / W, py = (e.clientY - area.top) / H;
      const clamp = (v) => Math.min(1, Math.max(0, v));
      const move = (ev) => {
        const x = clamp((ev.clientX - area.left) / W), y = clamp((ev.clientY - area.top) / H);
        if (!h) { // déplacer
          S.grid.x = Math.min(1 - S.grid.w, Math.max(0, start.x + x - px));
          S.grid.y = Math.min(1 - S.grid.h, Math.max(0, start.y + y - py));
        } else {
          let x0 = start.x, y0 = start.y, x1 = start.x + start.w, y1 = start.y + start.h;
          if (h.includes('l')) x0 = Math.min(x, x1 - 0.1); else x1 = Math.max(x, x0 + 0.1);
          if (h.includes('t')) y0 = Math.min(y, y1 - 0.1); else y1 = Math.max(y, y0 + 0.1);
          Object.assign(S.grid, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
        }
        drawGrid();
      };
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    });

    /**
     * Découpe la pochette n° i : on cherche les bords de la carte dans la case
     * (marges entre pochettes, carte décalée…) ; si on ne les trouve pas, on prend le centre de la case.
     */
    /**
     * La case et ses alentours (20 % de chaque côté), sans redressement : la vérification par l'image y retrouve la carte
     * même quand la grille tombe un peu à côté (v3.02 : rangée décalée sur une page d'Arnaud → carte coupée, non reconnue),
     * et ses coins donnent la carte pile sur ses bords
     */
    async function ctxBlob(i) {
      const [cols, rows] = dims();
      const img = S.photo.img, NW = img.naturalWidth, NH = img.naturalHeight;
      let x0, y0, x1, y1;
      const ac = S.autoGrid && S.autoCells && S.autoCells[i];
      if (ac) { const q = ac.gridQuad || ac.quad; x0 = Math.min(...q.map((p) => p[0])); x1 = Math.max(...q.map((p) => p[0])); y0 = Math.min(...q.map((p) => p[1])); y1 = Math.max(...q.map((p) => p[1])); }
      else { const cw = S.grid.w / cols, ch = S.grid.h / rows; x0 = S.grid.x + (i % cols) * cw; y0 = S.grid.y + Math.floor(i / cols) * ch; x1 = x0 + cw; y1 = y0 + ch; }
      const mx = (x1 - x0) * 0.2, my = (y1 - y0) * 0.2;
      x0 = Math.max(0, x0 - mx) * NW; x1 = Math.min(1, x1 + mx) * NW; y0 = Math.max(0, y0 - my) * NH; y1 = Math.min(1, y1 + my) * NH;
      const k = Math.min(1, 1100 / Math.max(x1 - x0, y1 - y0));
      const c = document.createElement('canvas'); c.width = Math.round((x1 - x0) * k); c.height = Math.round((y1 - y0) * k);
      c.getContext('2d').drawImage(img, x0, y0, x1 - x0, y1 - y0, 0, 0, c.width, c.height);
      return new Promise((res) => c.toBlob(res, 'image/jpeg', 0.9));
    }
    async function cellBlob(i, rot = S.autoRot) {
      const [cols, rows] = dims();
      const img = S.photo.img, NW = img.naturalWidth, NH = img.naturalHeight;
      if (S.autoGrid && S.autoCells && S.autoCells[i] && S.autoCells[i].snapped) {
        // bords de la carte trouvés : on la découpe pile dessus, remise à plat
        try {
          const q = S.autoCells[i].quad.map(([x, y]) => [x * NW, y * NH]);
          const qw = (Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]) + Math.hypot(q[2][0] - q[3][0], q[2][1] - q[3][1])) / 2;
          const c = R.warpQuad(img, q, Math.min(900, Math.round(qw)));
          const xs = q.map((p) => p[0] / NW), ys = q.map((p) => p[1] / NH);
          const box = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
          // lecture : d'abord la découpe habituelle (éprouvée) ; la carte ajustée n'est retenue que si ELLE est
          // reconnue avec certitude et pas l'autre (mesuré : parfois bien meilleure, parfois trompée par les reflets)
          const snap = await new Promise((res) => c.toBlob((b) => res({ blob: b, auto: true, box }), 'image/jpeg', 0.9));
          try {
            const o = R.cellCard(img, { ...S.autoCells[i], quad: S.autoCells[i].gridQuad }, rot);
            return await new Promise((res) => o.canvas.toBlob((b) => res({ blob: b, auto: o.auto, box: o.box, alt: snap }), 'image/jpeg', 0.9));
          } catch (e) { return snap; }
        } catch (e) { console.warn(e); }
      }
      if (S.autoGrid && S.autoCells && S.autoCells[i]) {
        let r = null; try { r = R.cellCard(img, S.autoCells[i], rot); } catch (e) { console.warn(e); }
        // (le détourage « cutCard » a été essayé ici le 27 sept. : meilleur sur 2 pages, bien pire sur une page
        //  avec reflets de pochettes — série plus devinée. On garde la découpe éprouvée pour le classeur.)
        if (r) return new Promise((res) => r.canvas.toBlob((b) => res({ blob: b, auto: r.auto, box: r.box }), 'image/jpeg', 0.9));
      }
      const gx = S.grid.x * NW, gy = S.grid.y * NH, cw = S.grid.w * NW / cols, ch = S.grid.h * NH / rows;
      const col = i % cols, row = Math.floor(i / cols);
      const rect = { x: gx + col * cw, y: gy + row * ch, w: cw, h: ch };
      let box = null;
      try { box = R.refineCell(img, rect) || R.locateCard(img, rect, S.autoGrid ? 0.8 : 0.6); } catch (e) { console.warn(e); }
      if (!box) {
        let w, h;
        if (cw / ch > RATIO) { h = ch * 0.94; w = h * RATIO; } else { w = cw * 0.94; h = w / RATIO; }
        box = { x: rect.x + (cw - w) / 2, y: rect.y + (ch - h) / 2, w, h, auto: false };
      } else box.auto = true;
      const outW = Math.min(900, Math.round(box.w)), outH = Math.round(outW / RATIO);
      const c = document.createElement('canvas'); c.width = outW; c.height = outH;
      c.getContext('2d').drawImage(img, box.x, box.y, box.w, box.h, 0, 0, outW, outH);
      return new Promise((res) => c.toBlob((b) => res({ blob: b, auto: box.auto, box: { x: box.x / NW, y: box.y / NH, w: box.w / NW, h: box.h / NH } }), 'image/jpeg', 0.9));
    }

    // ---------- Reconnaissance de toutes les pochettes ----------
    el.querySelector('#b-go').addEventListener('click', async () => {
      if (!S.photo || S.running) return;
      if (S.autoTimer) { clearTimeout(S.autoTimer); S.autoTimer = null; }
      el.querySelector('#b-auto').classList.add('hidden');
      S.running = true; S.timing = null; S.pageDur = 0;
      if (!burst) X.svOpen('scan'); // analyse en plein écran, carte par carte
      const tStart = performance.now();
      el.querySelector('#b-go').disabled = true; el.querySelector('#b-reset').disabled = true; el.querySelector('#b-fmt').disabled = true;
      const warmP = isPk() && App.visual && App.settings.visualCheck !== false ? App.visual.warm() : null; // bibliothèques de la vérification par l'image chargées pendant la lecture du texte
      const [cols, rows] = dims(), n = cols * rows;
      const hint = el.querySelector('#b-set').value;
      S.detected = null;
      S.cells = [];
      for (let i = 0; i < n; i++) {
        const { blob, auto, box, alt } = await cellBlob(i);
        const url = URL.createObjectURL(blob); urls.push(url);
        // (la case et ses alentours, pour la vérification par l'image : vrais bords d'une carte coupée ; pas en classeur ouvert couché)
        const ctx = !S.autoRot ? await ctxBlob(i).catch(() => null) : null;
        S.cells.push({ i, blob, url, auto, box, alt, ctx, state: 'attente', cands: [], choice: '', info: null, mode: null });
      }
      X.drawResults();
      let rotChecked = !S.autoRot; // cartes couchées : on vérifie le sens (haut de la carte à droite ou à gauche) sur la 1re carte lue
      for (const cell of S.cells) {
        if (S.stopped || !alive()) return;
        cell.state = 'lecture'; S.prog = { step: 'Lecture des cartes', done: cell.i, total: n }; X.drawResults();
        setStatus(`<div class="spinner"></div><div style="text-align:center">Carte ${cell.i + 1} / ${n}…</div>`);
        const st = (m) => { if (alive()) setStatus(`<div class="spinner"></div><div style="text-align:center">Carte ${cell.i + 1} / ${n} — ${esc(m)}</div>`); };
        try {
          await X.recogOne(cell, hint, st);
          // pas sûre avec la découpe habituelle : on essaie la carte ajustée sur ses vrais bords, gardée seulement si sûre
          // (pas si l'image a déjà nettement reconnu la carte : le doute vient alors d'une jumelle au même dessin, la relire n'y change rien)
          const imgSure = cell.cands[0] && (cell.cands[0].orb || 0) >= 25;
          if (cell.alt && cell.state !== 'sure' && !imgSure && !['vide', 'dos', 'autre', 'don'].includes(cell.state) && !S.stopped && alive()) {
            const test = { ...cell, blob: cell.alt.blob };
            await X.recogOne(test, hint, st);
            if (test.state === 'sure') {
              Object.assign(cell, { blob: test.blob, box: cell.alt.box, auto: cell.alt.auto, info: test.info, cands: test.cands, choice: test.choice, state: test.state, checked: test.checked });
              cell.url = URL.createObjectURL(cell.blob); urls.push(cell.url);
            }
            cell.alt = null;
          }
          if (!rotChecked && !['vide', 'dos', 'autre', 'don'].includes(cell.state)) {
            rotChecked = true;
            if (cell.state !== 'sure') {
              // l'autre sens donne-t-il une carte sûre ? si oui, toutes les cartes sont retournées
              const alt = await cellBlob(cell.i, -S.autoRot);
              const test = { ...cell, blob: alt.blob };
              await X.recogOne(test, hint, st);
              if (test.state === 'sure') {
                S.autoRot = -S.autoRot;
                for (const c of S.cells) {
                  if (c.i < cell.i) continue;
                  const nb = c === cell ? alt : await cellBlob(c.i);
                  c.blob = nb.blob; c.box = nb.box; c.auto = nb.auto; c.url = URL.createObjectURL(nb.blob); urls.push(c.url);
                }
                Object.assign(cell, { info: test.info, cands: test.cands, choice: test.choice, state: test.state, checked: test.checked });
              }
            }
          }
        } catch (e) { console.error(e); cell.state = 'erreur'; cell.error = e.message; }
        if (['sure', 'verifier'].includes(cell.state)) cell.found = Date.now(); // petit éclat sur la carte trouvée
        X.drawResults();
      }
      // Deuxième passe : la page semble rangée par série → on recompare les cartes incertaines à cette série
      S.prog = { step: 'Série de la page…', done: n, total: n };
      if (!hint && alive() && !S.stopped) await X.guessSeries(); // (toutes les licences, v2.94 : One Piece aussi)
      // Troisième passe : vérification par l'image (réseau de neurones + points clés)
      if (isPk() && alive() && !S.stopped && App.settings.visualCheck !== false) { S.timing = { text: performance.now() - tStart, warm: await warmP }; await X.visualPass(hint); }
      S.running = false; S.prog = null; S.pageDur = performance.now() - tStart;
      el.querySelector('#b-reset').disabled = false; el.querySelector('#b-fmt').disabled = false; el.querySelector('#b-go').disabled = false;
      el.querySelector('#b-set').disabled = false;
      setStatus('');
      X.drawResults();
      if (!burst) X.svAfterScan(); // écran plein écran : cartes à vérifier une par une, puis récapitulatif
    });

    // Scanner (classeur) — série de la page devinée et vérification par l’image : voir scanBatchParts.series
    Object.assign(X, App.scanBatchParts.series(X, { R, ad, alive, esc, isPk, setStatus, urls }));

    // Scanner (classeur/rafale) — écran plein écran (analyse, vérification, récapitulatif) : voir scanBatchParts.screen
    Object.assign(X, App.scanBatchParts.screen(X, { R, ad, burst, dims, el, esc, isPk, resultsEl, sv }));
    if (X.svBox()) X.svBox().addEventListener('click', (e) => { const b = e.target.closest('[data-sv]'); if (b && !b.disabled) X.svAction(b); });

    // Scanner (classeur/rafale) — liste des cartes reconnues, versions, lecture de chaque case : voir scanBatchParts.list
    Object.assign(X, App.scanBatchParts.list(X, { R, ad, alive, burst, dims, esc, isPk, readCard, resultsEl, setStatus, sv, urls }));

    resultsEl.addEventListener('change', async (e) => {
      if (e.target.id === 'b-set-after' && e.target.value && !S.running) {
        const opt = e.target.selectedOptions[0];
        S.running = true;
        await X.applySeries(e.target.value, opt.textContent.replace(/\s*\(\d{4}\)$/, ''), 0, false);
        if (!burst && isPk() && alive()) await X.visualPass(e.target.value);
        S.running = false; setStatus(''); X.drawResults();
        return;
      }
      const ck = e.target.closest('[data-check]');
      if (ck) { S.cells[+ck.dataset.check].checked = ck.checked; X.drawResults(); return; }
      const md = e.target.closest('[data-mode]');
      if (md) { S.cells[+md.dataset.mode].mode = md.value; X.drawResults(); return; }
      // version corrigée à la main (normale / holo / reverse, 1re édition)
      const vb = e.target.closest('[data-vbase]');
      if (vb) { const c = S.cells[+vb.dataset.vbase]; if (c.det) { c.det.base = vb.value; c.det.user = true; } X.drawResults(); return; }
      const vf = e.target.closest('[data-vfe]');
      if (vf) { const c = S.cells[+vf.dataset.vfe]; if (c.det) { c.det.fe = vf.checked; c.det.user = true; } X.drawResults(); return; }
      const s = e.target.closest('[data-choice]'); if (!s) return;
      const cell = S.cells[+s.dataset.choice];
      cell.choice = s.value; cell.mode = null; cell.checked = !!s.value; // choisir une carte à la main = la cocher
      X.drawResults();
    });
    resultsEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.closest('[data-name],[data-num]')) resultsEl.querySelector(`[data-dosearch="${e.target.dataset.name || e.target.dataset.num}"]`).click();
    });
    resultsEl.addEventListener('click', async (e) => {
      if (e.target.closest('#b-sv-open')) { const l = X.toCheck(); if (l.length) X.svOpen('review', { list: l, idx: 0 }); else X.svOpen('recap'); return; }
      if (e.target.closest('#b-next')) { if (burst) X.resetBurst(); else el.querySelector('#b-reset').click(); return; }
      if (e.target.closest('#b-all')) { S.cells.forEach((c) => { if (c.choice && !c.saved) c.checked = true; }); X.drawResults(); return; }
      if (e.target.closest('#b-none')) { S.cells.forEach((c) => { c.checked = false; }); X.drawResults(); return; }
      if (e.target.closest('#b-undo-series')) { X.undoSeries(); return; }
      const nbk = e.target.closest('[data-notback]');
      if (nbk && !S.running) {
        const cell = S.cells[+nbk.dataset.notback];
        S.running = true; X.drawResults();
        await X.recogCell(cell, el.querySelector('#b-set').value || (S.detected && S.detected.id) || '', true);
        if (cell.state === 'vide') cell.state = 'inconnue';
        S.running = false; setStatus(''); X.drawResults();
        return;
      }
      const vb = e.target.closest('[data-versions]');
      if (vb) {
        const cell = S.cells[+vb.dataset.versions];
        const cur = cell.cands.find((x) => x.id === cell.choice);
        if (!cur) return;
        vb.disabled = true; vb.textContent = 'Chargement…';
        const list = await ad.versions(cur.name).catch(() => []);
        const seen = new Set(list.map((x) => x.id));
        cell.cands = [...list, ...cell.cands.filter((x) => !seen.has(x.id))];
        App.util.toast(`${list.length} versions de ${cur.name} dans la liste : choisis la bonne`);
        X.drawResults();
        const s = resultsEl.querySelector(`[data-choice="${cell.i}"]`); if (s) s.focus();
        return;
      }
      const f = e.target.closest('[data-find]');
      if (f) { resultsEl.querySelector(`[data-box="${f.dataset.find}"]`).classList.toggle('hidden'); return; }
      const d = e.target.closest('[data-dosearch]');
      if (d) {
        const cell = S.cells[+d.dataset.dosearch];
        d.disabled = true; d.textContent = '…';
        try {
          const nameQ = resultsEl.querySelector(`[data-name="${cell.i}"]`).value, numQ = resultsEl.querySelector(`[data-num="${cell.i}"]`).value;
          // One Piece : par le code (« OP10-001 ») s'il est donné, sinon par le nom
          const cands = isPk() ? await R.manual(cell.blob, nameQ, numQ) : await ad.manual(cell.blob, nameQ, numQ);
          if (!cands.length) { App.util.toast('Aucune carte trouvée'); }
          else { cell.cands = cands; cell.choice = cands[0].id; cell.state = 'verifier'; cell.checked = true; }
        } catch (err) { App.util.toast(err.message); }
        X.drawResults();
        return;
      }
      const rc = e.target.closest('[data-recrop]');
      if (rc && !S.running) {
        const cell = S.cells[+rc.dataset.recrop];
        const nb = await App.ui.cropImage(S.photo.blob, { title: `Recadrer la carte ${cell.i + 1}`, initial: cell.box, withBox: true });
        if (!nb) return;
        cell.box = nb.box;
        if (cell.saved) {
          await App.col.replacePhoto(cell.key, cell.photoId, nb.blob);
          if (S.pageId) await App.col.setPhotoSource(cell.key, cell.photoId, { page: S.pageId, rect: cell.box });
          cell.blob = nb.blob; cell.url = URL.createObjectURL(cell.blob); urls.push(cell.url);
          App.util.toast('Photo recadrée ✓');
          X.drawResults();
          return;
        }
        cell.blob = nb.blob; cell.url = URL.createObjectURL(cell.blob); urls.push(cell.url); cell.auto = true;
        S.running = true; X.drawResults();
        await X.recogCell(cell, el.querySelector('#b-set').value || (S.detected && S.detected.id) || '');
        S.running = false; setStatus(''); X.drawResults();
        return;
      }
      if (e.target.closest('#b-add')) {
        const todo = S.cells.filter((c) => c.choice && X.modeOf(c) !== 'rien').map((c) => ({ c, mode: X.modeOf(c) }));
        e.target.disabled = true;
        const keys = [];
        // la page est gardée sur cet appareil : on pourra recadrer une carte depuis sa fiche
        if (!S.pageId && S.photo) { try { S.pageId = await App.col.keepPage(S.photo.blob); } catch (err) { console.warn(err); } }
        for (const { c, mode } of todo) {
          const cand = c.cands.find((x) => x.id === c.choice);
          if (!cand) continue;
          const picked = c.det && c.det.id === cand.id ? X.versOf(c) : null; // version vue (et corrigée) dans la liste
          const key = await R.addScanned(picked && picked.length ? { ...cand, pickedVariants: picked } : cand, c.blob, mode === 'nouvelle' ? null : mode, S.game);
          c.vers = mode === 'rien' ? null : (R.lastVariants ? R.lastVariants.list : null);
          keys.push(key);
          const it = App.col.byKey(key);
          c.key = key; c.cand = cand;
          c.photoId = mode === 'rien' ? null : it.photos[it.photos.length - 1];
          if (c.photoId && S.pageId && c.box) await App.col.setPhotoSource(key, c.photoId, { page: S.pageId, rect: c.box });
        }
        App.col.refreshPrices([...new Set(keys)], 'Prix');
        // les cartes enregistrées restent affichées (marquées ✓) : on peut continuer avec les autres
        for (const { c } of todo) {
          c.saved = true; c.checked = false;
          const pc = burst ? c.live : S.pageCert; c.pc = pc;
          c.cert = !App.cloud.enabled || !c.photoId ? '' : !App.cloud.user ? 'connecte-toi pour certifier'
            : !pc ? (burst ? (c.live === null ? 'certification désactivée' : 'photo importée') : 'page non certifiée (bouton « Photo certifiée » pour le badge)')
            : !pc.passed ? pc.reasons[0] : 'encours';
          if (c.cert && c.cert !== 'encours') App.certify.note(c.key, c.photoId, c.cert === 'photo importée' ? 'photo importée depuis la galerie' : c.cert);
        }
        // certification des cartes bien reconnues (l'une après l'autre, en arrière-plan)
        (async () => {
          for (const { c } of todo) {
            if (c.cert !== 'encours') continue;
            const ident = await App.certify.identity(c.blob, c.cand, S.game);
            const r = await App.certify.finish(c.key, c.photoId, c.pc, ident);
            c.cert = r.ok ? 'ok' : r.reason;
            if (alive()) X.drawResults();
          }
        })();
        App.util.toast(`${keys.length} carte${keys.length > 1 ? 's' : ''} enregistrée${keys.length > 1 ? 's' : ''} ✓`);
        X.drawResults();
        resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });

    // Scanner — rafale (caméra ouverte, cartes prises toutes seules) : voir scanBatchParts.burst
    Object.assign(X, App.scanBatchParts.burst(X, { R, RAFALE_CERT, alive, burst, cam, certOn, el, resultsEl, setStatus, sv, urls, view }));
    if (burst) {
      el.querySelector('#r-start').addEventListener('click', async () => {
        if (sv.open) X.svClose(); // on reprend la rafale : l'écran d'analyse se ferme
        try { await cam.start(); }
        catch (e) { setStatus(`<b>Caméra indisponible.</b><br><span class="small muted">${esc(e.message)}. Autorise la caméra, ou utilise « Choisir des photos ».</span>`); return; }
        App.sfx.unlock();
        view.insertAdjacentHTML('beforeend', '<div class="r-live">Présente une carte dans le cadre</div>');
        if (certOn && RAFALE_CERT) App.certify.prepare();
        S.rPrev = null; S.rStable = 0;
        S.rTrk = null;
        S.rTimer = setInterval(X.rTick, 100);
        el.querySelector('#r-start').classList.add('hidden'); el.querySelector('#r-files-btn').classList.add('hidden');
        el.querySelector('#r-pause').classList.remove('hidden');
        window.scrollTo({ top: Math.max(0, view.getBoundingClientRect().top + window.scrollY - 70), behavior: 'smooth' });
      });
      el.querySelector('#r-pause').addEventListener('click', () => { X.rStop(); if (S.cells.length >= 2) X.burstReview(); else if (S.cells.length) resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
      // photos de la galerie (plusieurs d'un coup) : ajoutées à la liste, sans certification
      el.querySelector('#r-files').addEventListener('change', async (e) => {
        const files = [...e.target.files]; e.target.value = '';
        let pages = 0;
        for (const f of files) {
          try {
            const img = await createImageBitmap(f);
            let lp = { page: false }; try { lp = R.looksLikePage(img); } catch (err) { /* */ }
            if (lp.page) { pages++; continue; }
            const W = img.width, H = img.height;
            // (comme pour une carte seule : le cadre trouvé n'est gardé que si la carte fait plus de 55 % de la hauteur)
            const f0 = R.locateCard(img, { x: 0, y: 0, w: W, h: H }, 0.45), found = f0 && f0.h > H * 0.55 ? f0 : null;
            const cell = found ? { x: found.x / W, y: found.y / H, w: found.w / W, h: found.h / H } : (() => { const h = Math.min(0.94, 0.94 * W / H / (63 / 88)); const w = h * H / W * (63 / 88); return { x: (1 - w) / 2, y: (1 - h) / 2, w, h }; })();
            // v2.89 : d'abord le détourage sur les 4 bords (forme de carte vérifiée), le cadre ci-dessus en secours
            let cut = null; try { cut = R.cutCard(img, { x: 0.01, y: 0.01, w: 0.98, h: 0.98 }); if (cut && cut.fit < 0.45) cut = null; } catch (err) { /* */ }
            const r = cut || R.cellCard(img, cell);
            const blob = await new Promise((res) => r.canvas.toBlob(res, 'image/jpeg', 0.9));
            X.addBurstCell(blob, !!cut || r.auto || !!found, undefined, f);
          } catch (err) { console.warn(err); }
        }
        if (files.length - pages >= 2) X.burstReview(); // plusieurs cartes : l'écran d'analyse
        if (pages) App.util.toast(`${pages} photo${pages > 1 ? 's' : ''} de page${pages > 1 ? 's' : ''} ignorée${pages > 1 ? 's' : ''} : utilise « Page de classeur » pour celles-là`);
      });
    }

    return () => { S.stopped = true; X.lockScroll(false); if (S.rTimer) clearInterval(S.rTimer); cam.stop(); urls.forEach((u) => URL.revokeObjectURL(u)); };
  },
});
