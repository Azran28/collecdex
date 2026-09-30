/*
 * Scanner — le SEUL moyen d'ajouter une carte (elle doit être réelle).
 * Deux modes :
 *   - « Une carte » : photo → recadrage → reconnaissance → confirmation
 *   - « Page de classeur » : photo d'une page (9 pochettes par défaut) → grille ajustée
 *     → chaque carte est reconnue → vérification → ajout de toutes les cartes en une fois
 * La photo de chaque carte devient son visuel dans ta collection.
 */
App.views.scan = {
  /** Remplit un menu déroulant avec toutes les séries, regroupées par bloc (plus récentes d'abord) */
  fillSetSelect(sel, sets, selected = '') {
    const { esc } = App.util;
    const groups = new Map();
    for (const st of [...sets].sort((a, b) => (b.releaseDate || '').localeCompare(a.releaseDate || ''))) {
      if (!groups.has(st.group.id)) groups.set(st.group.id, { name: st.group.name, sets: [] });
      groups.get(st.group.id).sets.push(st);
    }
    sel.insertAdjacentHTML('beforeend', [...groups.values()].map((g) => `<optgroup label="${esc(g.name)}">${g.sets.map((st) => `<option value="${esc(st.id)}" ${st.id === selected ? 'selected' : ''}>${esc(st.name)}${st.releaseDate ? ' (' + st.releaseDate.slice(0, 4) + ')' : ''}</option>`).join('')}</optgroup>`).join(''));
  },
  /** Dessin affiché avant la photo ; en classeur, les pochettes au format choisi ([colonnes, rangées]) */
  empty(mode, dims = [3, 3]) {
    const [c, r] = dims, cw = Math.min(38, Math.floor(210 / c)), ch = Math.round((cw * 88) / 63);
    const grid = mode === 'classeur' ? `style="grid-template-columns:repeat(${c},${cw}px);grid-template-rows:repeat(${r},${ch}px)"` : '';
    return `<div class="scan-empty">
      <div class="se-frame ${mode === 'classeur' ? 'grid' : ''}" ${grid}>${mode === 'classeur' ? `${'<i></i>'.repeat(c * r)}` : App.icons.icon(mode === 'rafale' ? 'rafale' : 'capture', 40)}</div>
      <b>${mode === 'classeur' ? `Photo d’une page de classeur <span class="muted">(${c * r} cartes)</span>` : mode === 'rafale' ? 'Tes cartes, l’une après l’autre' : 'Photo de ta carte'}</b>
      <span>${mode === 'rafale' ? 'Appuie sur « Démarrer la rafale » ou « Choisir des photos »' : mode === 'classeur' ? 'Appuie sur « Prendre la page en photo »' : 'Appuie sur « Caméra » ou « Choisir une photo »'}</span>
    </div>`;
  },

  /**
   * Aide à côté de la photo tant qu'il n'y a pas de résultat : allégée en v2.39 (demande d'Arnaud) — seulement le geste
   * de la certification en carte seule (connecté) ; le reste s'explique tout seul (la grille et la recherche sont automatiques).
   */
  guide(mode) {
    const certOn = App.certify && App.certify.available();
    if (mode !== 'carte' || !certOn) return '';
    return `<p class="small muted sg-mini">${App.icons.icon('shield', 13)} Pour le badge « Certifiée » : montre d’abord le dos de la carte à la caméra, retourne-la, puis prends la photo.</p>`;
  },

  /** « Set de Base (1999) » */
  setLabel(c) { return c.set ? `${c.set.name}${c.set.releaseDate ? ' (' + c.set.releaseDate.slice(0, 4) + ')' : ''}` : (c.setId || ''); },

  async render(el, params, alive) {
    const mode = ['classeur', 'rafale'].includes(params.query.mode) ? params.query.mode : 'carte';
    el.innerHTML = `
      <div class="breadcrumb"><a href="#/">Accueil</a> › Capturer</div>
      <h1 class="m-hide" style="margin:0 0 4px">Capturer</h1>
      <div class="mode-pick" role="tablist">
        <a class="mode-card ${mode === 'carte' ? 'on' : ''}" href="#/scan" role="tab" aria-selected="${mode === 'carte'}">
          <span class="mc-ico">${App.icons.icon('capture', 22)}</span>
          <span class="mc-txt"><b>Une carte</b><span>Carte par carte, la plus fiable</span></span>
          ${mode === 'carte' ? `<span class="mc-check">${App.icons.icon('shield', 14)}</span>` : ''}
        </a>
        <a class="mode-card ${mode === 'classeur' ? 'on' : ''}" href="#/scan?mode=classeur" role="tab" aria-selected="${mode === 'classeur'}">
          <span class="mc-ico">${App.icons.icon('dex', 22)}</span>
          <span class="mc-txt"><b class="m-hide">Page de classeur</b><b class="d-hide">Classeur</b><span>Jusqu’à 18 cartes d’un coup</span></span>
          ${mode === 'classeur' ? `<span class="mc-check">${App.icons.icon('shield', 14)}</span>` : ''}
        </a>
        <a class="mode-card ${mode === 'rafale' ? 'on' : ''}" href="#/scan?mode=rafale" role="tab" aria-selected="${mode === 'rafale'}">
          <span class="mc-ico">${App.icons.icon('rafale', 22)}</span>
          <span class="mc-txt"><b>Rafale</b><span>Les cartes défilent, sans cliquer</span></span>
        </a>
        <button type="button" class="sc-help d-hide" id="sc-help" aria-label="Mode d’emploi de Capturer">?</button>
      </div>
      <div id="sc-body"></div>`;
    const body = el.querySelector('#sc-body');
    // téléphone : mode d'emploi à la 1re visite, et bouton « ? » pour le revoir
    el.querySelector('#sc-help').addEventListener('click', () => App.onboarding.showScan());
    App.onboarding.maybeShowScan();
    const cleanup = mode === 'carte' ? await App.views.scan.single(body, params, alive) : await App.views.scan.batch(body, params, alive, mode === 'rafale');
    return () => { if (cleanup) cleanup(); App.recognizer.stop(); };
  },

  /* ================= Caméra (partagée par les deux modes) ================= */
  camera(view, { guide }) {
    let stream = null;
    return {
      async start() {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 3840 }, height: { ideal: 2160 } }, audio: false });
        view.innerHTML = `<video autoplay playsinline muted></video>${guide ? '<div class="scan-guide"></div>' : ''}`;
        const v = view.querySelector('video');
        v.srcObject = stream;
        // pas de grandes bandes noires : en mode carte la vidéo remplit le cadre (on ne cadre que la carte),
        // en mode classeur la zone prend la forme exacte de l'image (on voit toute la page)
        v.addEventListener('loadedmetadata', () => {
          if (guide) view.classList.add('live-cover');
          else { view.classList.add('live-fit'); view.style.aspectRatio = `${v.videoWidth} / ${v.videoHeight}`; }
        }, { once: true });
      },
      get video() { return view.querySelector('video'); },
      /** Zone du cadre jaune (+ marge) dans la vidéo, en pixels de la vidéo */
      region() {
        const v = view.querySelector('video'); if (!v || !v.videoWidth) return null;
        let sx = 0, sy = 0, sw = v.videoWidth, sh = v.videoHeight;
        if (guide) {
          const vr = v.getBoundingClientRect(), gr = view.querySelector('.scan-guide').getBoundingClientRect();
          const scale = (view.classList.contains('live-cover') ? Math.max : Math.min)(vr.width / v.videoWidth, vr.height / v.videoHeight);
          const ox = vr.left + (vr.width - v.videoWidth * scale) / 2, oy = vr.top + (vr.height - v.videoHeight * scale) / 2;
          const m = 0.06;
          sx = Math.max(0, (gr.left - ox) / scale - gr.width / scale * m); sy = Math.max(0, (gr.top - oy) / scale - gr.height / scale * m);
          sw = Math.min(v.videoWidth - sx, gr.width / scale * (1 + 2 * m)); sh = Math.min(v.videoHeight - sy, gr.height / scale * (1 + 2 * m));
        }
        return { sx, sy, sw, sh };
      },
      /** Image du flux vidéo ; avec guide, seulement la zone du cadre jaune (+ marge) */
      capture() {
        const v = view.querySelector('video'), r = this.region(); if (!r) return null;
        const { sx, sy, sw, sh } = r;
        const c = document.createElement('canvas'); c.width = sw; c.height = sh;
        c.getContext('2d').drawImage(v, sx, sy, sw, sh, 0, 0, sw, sh);
        this.lastCanvas = c; // (affichable tout de suite, avant l'encodage JPEG qui prend jusqu'à 1 s)
        return new Promise((res) => c.toBlob(res, 'image/jpeg', 0.95));
      },
      /**
       * Vraie photo en pleine résolution (capteur complet, ex. 12 Mpx) quand le navigateur le permet
       * (Chrome Android) ; sinon, image du flux vidéo. Indispensable pour une page de 9 cartes.
       */
      async photo() {
        const track = stream && stream.getVideoTracks()[0];
        if (track && window.ImageCapture) {
          try {
            const ic = new ImageCapture(track);
            const b = await ic.takePhoto();
            if (b && b.size > 50000) return b;
          } catch (e) { console.warn('Photo pleine résolution impossible, image vidéo utilisée', e); }
        }
        return this.capture();
      },
      stop() {
        if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
        view.classList.remove('live-cover', 'live-fit'); view.style.aspectRatio = '';
      },
      get on() { return !!stream; },
    };
  },

  /* ================= Mode « une carte » ================= */
  async single(el, params, alive) {
    const { esc } = App.util;
    const R = App.recognizer, RATIO = R.RATIO;
    const game = 'pokemon';
    const ad = App.games.get(game);
    const targetId = params.query.carte || null;
    let cardBlob = null, cardURL = null, target = null, pageBlob = null;
    let cert = null; // résultat de la vérification en direct de la dernière photo (null = photo importée)

    el.innerHTML = `
      <div id="sc-target"></div>
      <div class="set-first" style="max-width:640px">
        <div class="sf-head">${App.icons.icon('layers', 18)}<div><b>Série de ta carte</b> <span class="small muted">(facultatif, plus fiable)</span></div></div>
        <select id="sc-set"><option value="">Série : je ne sais pas (chercher partout)</option></select>
      </div>
      <div class="scan-wrap">
        <div>
          <div class="scan-view" id="sc-view">${App.views.scan.empty('carte')}</div>
          <div class="row action-dock scan-dock" style="margin-top:14px" id="sc-actions">
            <button class="btn primary" id="sc-cam">${App.icons.icon('camera', 16)} Caméra</button>
            <button class="btn primary hidden" id="sc-shot">${App.icons.icon('capture', 16)} Prendre la photo</button>
            <label class="btn">Choisir une photo<input type="file" accept="image/*" capture="environment" id="sc-file" hidden></label>
          </div>
          <div id="sc-cropbar" class="hidden" style="margin-top:14px">
            <div class="panel hidden" id="sc-pagehint" style="margin-bottom:10px;border-color:var(--accent2)">
              <b>On dirait une page de classeur</b> (plusieurs cartes sur la photo).<br>
              <span class="small muted">Le mode « Une carte » n’en reconnaît qu’une, et prendrait toute la photo comme visuel.</span>
              <div class="row" style="margin-top:8px"><button class="btn primary sm" id="sc-topage">Passer en page de classeur</button></div>
            </div>
            <div class="row"><span>Taille du cadre</span><input type="range" id="sc-size" min="20" max="100" value="90" style="flex:1"></div>
            <p class="small muted">Fais glisser le cadre jaune pour qu’il entoure la carte, puis valide.</p>
            <div class="row action-dock"><button class="btn primary" id="sc-crop-ok">✓ Valider le cadrage</button><button class="btn ghost" id="sc-crop-cancel">Reprendre une photo</button></div>
          </div>
        </div>
        <div>
          <div id="sc-status"></div>
          <div id="sc-results">${App.views.scan.guide('carte')}</div>
          <div class="panel section hidden" id="sc-manual">
            <h3>La carte n’est pas proposée ?</h3>
            <p class="small muted">Cherche-la par son nom et/ou son numéro. Ta photo sera utilisée.</p>
            <div class="row">
              <input type="text" id="sc-name" placeholder="Nom (ex. Dracaufeu)" style="flex:1;min-width:160px">
              <input type="text" id="sc-num" placeholder="N° (ex. 025/165)" style="width:130px">
              <button class="btn" id="sc-search">Chercher</button>
            </div>
          </div>
        </div>
      </div>`;

    const view = el.querySelector('#sc-view');
    const status = el.querySelector('#sc-status');
    const results = el.querySelector('#sc-results');
    const setStatus = (html) => { status.innerHTML = html ? `<div class="panel" style="margin-bottom:14px">${html}</div>` : ''; };
    const spin = (msg) => { if (alive()) setStatus(`<div class="spinner"></div><div style="text-align:center">${esc(msg)}</div>`); };
    const cam = App.views.scan.camera(view, { guide: true });
    // série choisie : gardée pour les scans suivants (on scanne souvent une série d'affilée)
    let savedSet = ''; try { savedSet = sessionStorage.getItem('scanSet') || ''; } catch (e) { /* */ }
    ad.listSets().then((sets) => { const sel = el.querySelector('#sc-set'); App.views.scan.fillSetSelect(sel, sets, savedSet); sel.closest('.set-first').classList.toggle('chosen', !!sel.value); }).catch(() => {});
    el.querySelector('#sc-set').addEventListener('change', (e) => { try { sessionStorage.setItem('scanSet', e.target.value); } catch (err) { /* */ } e.target.closest('.set-first').classList.toggle('chosen', !!e.target.value); });

    // Carte visée (bouton « Scanner cette carte » d'une fiche)
    if (targetId) {
      try {
        const c = await ad.getCard(targetId);
        target = { id: c.id, localId: c.localId, name: c.name, image: c.image, rarity: c.rarity, setId: c.set.id, set: null };
        const sets = await ad.listSets();
        const s = sets.find((x) => x.id === c.set.id);
        if (s) { target.set = { id: s.id, name: s.name, logo: s.logo, symbol: s.symbol, cardCount: { total: s.total, official: s.official }, serie: s.group }; target.serieId = s.group.id; }
        el.querySelector('#sc-target').innerHTML = `<div class="cand" style="grid-template-columns:56px 1fr">
          <img src="${esc(ad.img.card(target))}" alt="" style="width:56px" data-alt="">
          <div>Carte à capturer : <b>${esc(target.name)}</b> ${ad.rarity.symbol(target.rarity, 12)}<br><span class="small muted">${esc(c.set.name)} · n° ${esc(target.localId)}</span></div></div>`;
      } catch (e) { console.warn(e); }
    }

    // Certification « dos d'abord » : le dos, on retourne, on tient immobile → la photo se prend toute seule
    let trk = null, trkTimer = null;
    const stopTrack = () => { clearInterval(trkTimer); trkTimer = null; const h = view.querySelector('.flip-hint'); if (h) h.remove(); };
    el.querySelector('#sc-cam').addEventListener('click', async () => {
      try {
        await cam.start(); el.querySelector('#sc-shot').classList.remove('hidden'); results.innerHTML = App.views.scan.guide('carte');
        // la vidéo et le bouton photo entiers à l'écran, sans avoir à faire défiler
        window.scrollTo({ top: Math.max(0, view.getBoundingClientRect().top + window.scrollY - 66), behavior: 'smooth' });
        if (!App.certify.available()) { setStatus(''); return; }
        setStatus(`<span class="small">${App.icons.icon('shield', 14)} <b>Pour la certifier</b> : montre d’abord le <b>dos</b> de la carte dans le cadre (il doit être visible : pas d’étui opaque, une pochette transparente convient), si la lampe du téléphone clignote, garde le dos immobile jusqu’à la fin, puis retourne-la en prenant ton temps et appuie sur « Prendre la photo ». <span class="muted">(Sans montrer le dos : photo sans certification)</span></span>`);
        App.certify.prepare();
        view.insertAdjacentHTML('beforeend', `<div class="flip-hint" data-phase="attente">${App.certify.HINTS.attente}</div>`);
        trk = App.certify.tracker(cam.video, () => cam.region());
        const t0 = Date.now();
        trkTimer = setInterval(() => {
          if (!cam.on || !alive()) return stopTrack();
          let ph = trk.step();
          // dos toujours pas reconnu après 7 s : souvent une carte dans un étui opaque
          const show = ph === 'attente' && Date.now() - t0 > 7000 ? 'aide' : ph;
          const h = view.querySelector('.flip-hint'); if (h && h.dataset.phase !== show) { h.innerHTML = show === 'aide' ? 'Dos pas reconnu : il doit être <b>visible</b> (sors la carte d’un étui opaque ; une pochette transparente, ça va)' : App.certify.HINTS[ph]; h.dataset.phase = show; }
          // dos vu : le bouton de photo le montre (la photo sera certifiée)
          const sb = el.querySelector('#sc-shot'); if (sb) sb.classList.toggle('cert-ready', ph === 'retourne');
        }, 90);
      }
      catch (e) { setStatus(`<b>Caméra indisponible.</b><br><span class="small muted">${esc(e.message)}. Autorise la caméra dans le navigateur, ou utilise « Choisir une photo ».</span>`); }
    });
    // photo certifiable si le dos a été vu (dans les 15 dernières secondes) et la carte retournée depuis
    el.querySelector('#sc-shot').addEventListener('click', () => shoot(!!(trk && trkTimer && trk.phase !== 'attente')));
    let shooting = false, lastShot = null;
    async function shoot(flipped) {
      if (shooting) return; // un seul appui compte (le défi de certification ne sert qu'une fois)
      shooting = true;
      // l'image est figée À L'INSTANT de l'appui (la suite peut prendre 1 à 2 s : on peut bouger)
      const shotP = cam.capture();
      const proofP = App.certify.available() && flipped ? trk.proof().catch((e) => { console.warn(e); return { passed: false, reasons: ['vérification impossible'] }; }) : null;
      const shot = el.querySelector('#sc-shot');
      shot.disabled = true; shot.textContent = '✓ Photo prise — recherche de la carte…';
      view.classList.add('r-flash'); setTimeout(() => view.classList.remove('r-flash'), 260);
      App.sfx.click(); try { if (navigator.vibrate) navigator.vibrate(25); } catch (e) { /* */ }
      // l'animation de scan démarre À L'APPUI, sur l'image figée (avant : après l'encodage de la photo, la vérification
      // de la certification et le détourage, soit 1 à 2 s) ; elle continue ensuite sur la carte détourée.
      // (la vérification a déjà lu la vidéo ci-dessus : on peut la retirer de l'écran)
      if (shotP && cam.lastCanvas) showScan(cam.lastCanvas, 'Photo prise — détourage de la carte…');
      try {
        cert = null;
        const b = await shotP; if (!b) return;
        lastShot = b; cam.stop();
        await new Promise((r) => { requestAnimationFrame(() => setTimeout(r, 0)); setTimeout(r, 80); }); // qu'elle s'affiche avant les calculs (80 ms au plus : onglet caché)
        if (App.certify.available()) cert = proofP ? await proofP : { passed: false, reasons: ['photo prise sans montrer le dos de la carte d’abord'] };
        stopTrack();
        // la carte est détourée toute seule, au ras de ses bords et remise à plat (sinon recadrée au plus près)
        let card = b;
        try {
          const img = await createImageBitmap(b), GM = 0.06 / 1.12, zone = { x: GM, y: GM, w: 1 - 2 * GM, h: 1 - 2 * GM };
          const r = R.cutCard(img, zone) || R.cellCard(img, zone);
          card = await new Promise((res) => r.canvas.toBlob(res, 'image/jpeg', 0.92)) || b;
        } catch (e) { console.warn(e); }
        el.querySelector('#sc-actions').classList.remove('hidden');
        await analyse(card);
        const certLine = !cert ? '' : cert.passed
          ? `<span class="cert-ok">${App.icons.icon('shield', 16)} Capture en direct vérifiée</span> <span class="small muted">— la carte sera certifiée à l’ajout.</span>`
          : `<span class="small">${App.icons.icon('shield', 14)} <b>Non certifiable</b> : ${App.util.esc(cert.reasons.join(', '))}. <span class="muted">Tu peux quand même l’ajouter, ou reprendre la photo.</span></span>`;
        status.insertAdjacentHTML('afterbegin', `<div class="panel" style="margin-bottom:14px">${certLine}${certLine ? '<br>' : ''}<button class="linkbtn small" id="sc-recrop">✂ Mal détourée ? Recadrer à la main</button></div>`);
      } finally {
        shooting = false; shot.disabled = false; shot.classList.add('hidden'); shot.classList.remove('cert-ready');
        shot.innerHTML = `${App.icons.icon('capture', 16)} Prendre la photo`;
      }
    }
    status.addEventListener('click', (e) => { if (e.target.closest('#sc-recrop') && lastShot) { const keep = cert; startCrop(lastShot, 0.92); cert = keep; } });
    el.querySelector('#sc-file').addEventListener('change', (e) => { if (e.target.files[0]) { cam.stop(); cert = null; startCrop(e.target.files[0]); } e.target.value = ''; });

    // Recadrage (cadre au format d'une carte, 63 × 88 mm)
    let crop = null, autoCrop = false; // autoCrop : cadre placé tout seul sur une photo importée (validé d'office)
    function startCrop(blob, initial = null) {
      results.innerHTML = App.views.scan.guide('carte'); setStatus('');
      if (initial === null) cert = null;
      el.querySelector('#sc-manual').classList.add('hidden');
      const url = URL.createObjectURL(blob);
      view.innerHTML = `<div class="crop-area"><img src="${url}" alt="Photo"><div class="crop-box"></div></div>`;
      const img = view.querySelector('img');
      el.querySelector('#sc-actions').classList.add('hidden');
      el.querySelector('#sc-cropbar').classList.remove('hidden');
      img.onload = () => {
        // plusieurs cartes sur la photo ? on propose le mode « page de classeur »
        let lp = { page: false };
        try { lp = R.looksLikePage(img); } catch (e) { console.warn(e); }
        el.querySelector('#sc-pagehint').classList.toggle('hidden', !lp.page);
        pageBlob = blob;
        const ar = img.naturalWidth / img.naturalHeight;
        let size = initial || (Math.abs(ar - RATIO) < 0.06 ? 1 : 0.9); // photo déjà au format carte → toute l'image
        let cx = 0.5, cy = 0.5, found = false;
        // photo importée : le cadre se place tout seul sur la carte (bords trouvés), on peut toujours le déplacer
        if (!initial && !lp.page) {
          try {
            const NW = img.naturalWidth, NH = img.naturalHeight;
            const f = R.locateCard(img, { x: 0, y: 0, w: NW, h: NH }, 0.45);
            if (f && f.h / NH > 0.55) {
              const m = 1.03; // un poil plus grand que la carte : bords compris
              size = Math.min(1, f.h * m / NH); if (f.w * m > NW) size = Math.min(1, f.w * m / NW);
              cx = (f.x + f.w / 2) / NW; cy = (f.y + f.h / 2) / NH; found = true;
            }
          } catch (e) { console.warn(e); }
        }
        crop = { img, url, box: view.querySelector('.crop-box'), cx, cy, size };
        el.querySelector('#sc-size').value = Math.round(size * 100);
        placeBox();
        // carte trouvée toute seule : pas d'étape « Valider le cadrage », la recherche part directement
        // (« Recadrer à la main » reste proposé ensuite)
        if (found) { lastShot = blob; autoCrop = true; setTimeout(() => el.querySelector('#sc-crop-ok').click(), 0); }
      };
    }
    function boxRect() {
      const W = crop.img.clientWidth, H = crop.img.clientHeight;
      let h = H * crop.size, w = h * RATIO;
      if (w > W) { w = W * crop.size; h = w / RATIO; }
      const x = Math.min(Math.max(0, crop.cx * W - w / 2), W - w), y = Math.min(Math.max(0, crop.cy * H - h / 2), H - h);
      return { x, y, w, h, W, H };
    }
    function placeBox() { const r = boxRect(); Object.assign(crop.box.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' }); }
    el.querySelector('#sc-topage').addEventListener('click', () => {
      App._pendingPage = pageBlob;
      location.hash = '#/scan?mode=classeur';
    });
    el.querySelector('#sc-size').addEventListener('input', (e) => { if (crop) { crop.size = e.target.value / 100; placeBox(); } });
    view.addEventListener('pointerdown', (e) => {
      if (!crop || !e.target.closest('.crop-area')) return;
      e.preventDefault();
      const area = view.querySelector('.crop-area').getBoundingClientRect();
      const move = (ev) => { crop.cx = (ev.clientX - area.left) / crop.img.clientWidth; crop.cy = (ev.clientY - area.top) / crop.img.clientHeight; placeBox(); };
      move(e);
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    });
    el.querySelector('#sc-crop-cancel').addEventListener('click', () => {
      crop = null;
      el.querySelector('#sc-cropbar').classList.add('hidden');
      el.querySelector('#sc-actions').classList.remove('hidden');
      view.innerHTML = App.views.scan.empty('carte');
      if (!results.innerHTML.trim()) results.innerHTML = App.views.scan.guide('carte');
    });
    el.querySelector('#sc-crop-ok').addEventListener('click', () => {
      if (!crop) return;
      const r = boxRect(), k = crop.img.naturalWidth / r.W, sw = r.w * k, sh = r.h * k;
      const outW = Math.min(900, Math.round(sw)), outH = Math.round(outW / RATIO);
      const c = document.createElement('canvas'); c.width = outW; c.height = outH;
      c.getContext('2d').drawImage(crop.img, r.x * k, r.y * k, sw, sh, 0, 0, outW, outH);
      URL.revokeObjectURL(crop.url); crop = null;
      el.querySelector('#sc-cropbar').classList.add('hidden');
      el.querySelector('#sc-actions').classList.remove('hidden');
      const auto = autoCrop; autoCrop = false;
      c.toBlob(async (b) => {
        await analyse(b);
        if (auto && alive()) status.insertAdjacentHTML('afterbegin', '<div class="panel" style="margin-bottom:14px"><button class="linkbtn small" id="sc-recrop">✂ Mal cadrée ? Recadrer à la main</button></div>');
      }, 'image/jpeg', 0.9);
    });

    function showCandidates(cands, info) {
      if (target) {
        const i = cands.findIndex((c) => c.id === target.id);
        if (i >= 0) { const [t] = cands.splice(i, 1); t.isTarget = true; cands.unshift(t); }
        else cands.push({ ...target, isTarget: true, notRead: true });
      }
      el.querySelector('#sc-manual').classList.remove('hidden');
      if (!cands.length) {
        results.innerHTML = `<div class="panel">Je n’ai pas reconnu la carte 😕<br><span class="small muted">Refais une photo plus nette (le numéro en bas doit être lisible) ou cherche-la ci-dessous.</span></div>`;
        return;
      }
      results.innerHTML = `
        <h3>C’est laquelle ?</h3>
        ${info ? `<p class="small muted">Lu sur la carte : ${esc(info)}</p>` : ''}
        ${cands.map((c, i) => {
          const own = App.col.get(game, c.id);
          return `<div class="cand">
            <img src="${esc(ad.img.card(c, 'low'))}" alt="" data-alt="${esc(c.name)}">
            <div><b>${esc(c.name)}</b> ${ad.rarity.symbol(c.rarity, 12)}<br>
              <span class="muted small">${esc(App.views.scan.setLabel(c))} · n° ${esc(c.localId)}${c.set && c.set.cardCount ? '/' + c.set.cardCount.official : ''}</span>
              ${i === 0 && c.twin ? '<br><span class="pill small" style="background:#7a4a00">Existe aussi dans une autre série : vérifie la série</span>' : ''}
              ${own ? `<br><span class="pill small">Déjà ×${own.qty} — ce sera un exemplaire de plus</span>` : ''}
              ${c.isTarget && !c.notRead ? '<br><span class="pill small" style="background:var(--ok);color:#063">Carte attendue ✓</span>' : ''}
              ${c.notRead ? '<br><span class="pill small" style="background:#7a4a00">Carte attendue, mais pas reconnue sur la photo</span>' : ''}
              ${!c.isTarget && i === 0 && c.confident ? '<br><span class="pill small" style="background:var(--ok);color:#063">Meilleure correspondance</span>' : ''}${c.numOk && c.ofOk ? `<br><span class="small muted">Numéro lu sur ta carte ✓</span>` : ''}${c.visual != null ? `<br><span class="small muted">Illustration : ${c.visual >= 0.7 ? 'identique' : c.visual >= 0.55 ? 'très proche' : c.visual >= 0.42 ? 'proche' : 'différente'}</span>` : ''}</div>
            <button class="btn primary sm" data-pick="${esc(c.id)}">✓ C’est elle</button>
          </div>`;
        }).join('')}
        ${[...new Set(cands.slice(0, 3).map((c) => c.name))].slice(0, 2).map((n) => `<button class="btn sm" data-versions="${esc(n)}" style="margin:4px 6px 0 0">Toutes les versions de « ${esc(n)} »</button>`).join('')}`;
      results.onclick = async (e) => {
        if (!cardBlob) return;
        const vb = e.target.closest('[data-versions]');
        if (vb) {
          vb.disabled = true; vb.textContent = 'Chargement…';
          const list = await ad.versions(vb.dataset.versions).catch(() => []);
          target = null;
          showCandidates(list, `Toutes les versions de « ${vb.dataset.versions} » (${list.length}) : repère la tienne grâce à l’image, la série et l’année`);
          return;
        }
        const dm = e.target.closest('[data-dupmode]');
        const b = e.target.closest('[data-pick]');
        if (!dm && !b) return;
        const c = cands.find((x) => x.id === (dm ? dm.dataset.card : b.dataset.pick));
        const before = App.col.get(game, c.id);
        // carte déjà possédée : on demande s'il s'agit de la même carte ou d'un autre exemplaire
        if (b && before && before.qty > 0) {
          results.innerHTML = `<div class="panel"><b>Tu as déjà ${esc(c.name)}</b> (×${before.qty}). Cette carte, c’est…
            <div class="row" style="margin-top:12px">
              <button class="btn primary" data-dupmode="photo" data-card="${esc(c.id)}">La même carte : utiliser cette photo</button>
              <button class="btn" data-dupmode="doublon" data-card="${esc(c.id)}">Un autre exemplaire (doublon)</button>
              <button class="btn ghost" data-dupmode="annuler" data-card="${esc(c.id)}">Annuler</button>
            </div>
            <p class="small muted" style="margin-bottom:0">Ta progression compte chaque carte une seule fois. Les doublons sont gardés à part (utiles plus tard pour les échanges).</p></div>`;
          return;
        }
        if (dm && dm.dataset.dupmode === 'annuler') { showCandidates(cands, ''); return; }
        (dm || b).disabled = true;
        const mode = dm ? dm.dataset.dupmode : null;
        const key = await R.addScanned(c, cardBlob, mode);
        App.col.refreshPrices([key], 'Prix');
        const it = App.col.byKey(key);
        const photoId = mode === 'rien' ? null : it.photos[it.photos.length - 1];
        const myCert = cert; cert = null;
        const shotBlob = cardBlob;
        const VN = { normal: 'Normale', reverse: 'Reverse', holo: 'Holo', firstEdition: '1ʳᵉ édition' };
        const det = mode === 'rien' ? null : R.lastVariants;
        const verLine = det && det.list.length ? `<div class="small" style="margin-top:6px">${App.icons.icon('sparkles', 13)} Version reconnue : <b>${det.list.map((v) => VN[v] || v).join(' · ')}</b> <button class="linkbtn small" data-open-card="${esc(c.id)}">modifier</button></div>` : '';
        const what = mode === 'photo' ? 'Photo de <b>' + esc(c.name) + '</b> mise à jour.' : mode === 'doublon' ? `<b>✓ ${esc(c.name)}</b> : doublon ajouté (×${it.qty}).` : `<b>✓ ${esc(c.name)}</b> ajoutée à ton Dex, avec ta photo.`;
        const certLine = !App.cloud.enabled ? '' : !App.cloud.user ? `<div class="small muted" style="margin-top:6px">${App.icons.icon('shield', 13)} <a href="#/connexion">Connecte-toi</a> pour certifier tes captures.</div>`
          : myCert ? `<div class="small" id="sc-cert" style="margin-top:6px">${App.icons.icon('shield', 13)} ${myCert.passed ? 'Certification en cours…' : 'Non certifiée : ' + esc(myCert.reasons.join(', '))}</div>`
          : `<div class="small muted" style="margin-top:6px">${App.icons.icon('shield', 13)} Non certifiée (photo importée). Pour le badge, capture-la avec la caméra.</div>`;
        results.innerHTML = `<div class="panel capture-done">${mode === 'rien' || !cardURL ? '' : `<div class="reveal rt-${App.ui.holoTier(ad.rarity.rank(c.rarity))}"><span class="burst"></span><img src="${cardURL}" alt=""></div>`}<div>${what}${verLine}${certLine}</div><br>
          <div class="row"><button class="btn primary" id="sc-again">Capturer la suivante</button>
          <a class="btn" href="#/jeu/${game}/serie/${encodeURIComponent(c.setId || (c.set && c.set.id))}">Voir la série</a></div></div>`;
        el.querySelector('#sc-manual').classList.add('hidden');
        cardBlob = null; target = null; el.querySelector('#sc-target').innerHTML = '';
        if (photoId && !(myCert && myCert.passed)) App.certify.note(key, photoId, !App.cloud.user ? 'pas connecté au moment de la capture' : myCert ? myCert.reasons.join(', ') : 'photo importée depuis la galerie');
        if (myCert && myCert.passed && photoId) {
          App.certify.identity(shotBlob, c).then((ident) => App.certify.finish(key, photoId, myCert, ident)).then((r) => {
            const line = results.querySelector('#sc-cert'); if (!line) return;
            line.innerHTML = r.ok ? `<span class="cert-ok">${App.icons.icon('shield', 14)} Carte certifiée !</span>` : `${App.icons.icon('shield', 13)} Non certifiée : ${esc(r.reason)}${r.unrecognized ? ' — reprends une photo plus nette pour la certifier' : ''}`;
          });
        }
        results.querySelector('#sc-again').onclick = () => { if (location.hash.includes('?')) location.hash = '#/scan'; else { results.innerHTML = App.views.scan.guide('carte'); setStatus(''); el.querySelector('#sc-cam').click(); } };
      };
    }

    /** Pendant la recherche : rayon de scan sur la carte, et l'étape écrite dessus (visible sans faire défiler) */
    function showScan(src, msg) { // src : adresse d'image, ou le canevas de la photo qui vient d'être prise
      const isUrl = typeof src === 'string';
      view.innerHTML = `<div class="sc-scanwrap"><span class="bphoto scan-txt">${isUrl ? `<img src="${src}" alt="Ta carte">` : ''}<i class="bscan"></i></span>
        <div class="sc-scanlbl"><div class="spinner"></div><span>${esc(msg)}</span></div></div>`;
      if (!isUrl) view.querySelector('.bphoto').prepend(src);
    }
    async function analyse(blob) {
      cardBlob = blob;
      if (cardURL) URL.revokeObjectURL(cardURL);
      cardURL = URL.createObjectURL(blob);
      showScan(cardURL, 'Lecture de la carte…');
      results.innerHTML = ''; setStatus('');
      const vr = view.getBoundingClientRect(); // toute la carte visible pendant la recherche
      if (vr.top < 60 || vr.bottom > window.innerHeight) window.scrollTo({ top: Math.max(0, window.scrollY + vr.top - 70), behavior: 'smooth' });
      const st = (m) => { const s = view.querySelector('.sc-scanlbl span'); if (s && alive()) s.textContent = m; };
      try {
        const setId = el.querySelector('#sc-set').value;
        let info, cands;
        if (setId) { info = await R.read(blob, st, { atkBand: true }); cands = await R.inSet(blob, info, setId, st); }
        else ({ info, cands } = await R.recognize(blob, st, { atkBand: true }));
        if (!alive()) return;
        view.innerHTML = `<img src="${cardURL}" alt="Ta carte">`;
        setStatus(info.otherGame ? `<span class="small">${App.icons.icon('layers', 14)} <b>Ça ne ressemble pas à une carte Pokémon</b> (autre jeu ?). CollecDex ne reconnaît que les cartes Pokémon pour l’instant : les autres jeux arriveront plus tard.</span>` : '');
        showCandidates(cands, R.readSummary(info));
        // les propositions sont sous la photo sur téléphone : on y descend
        requestAnimationFrame(() => { const r = results.getBoundingClientRect(); if (r.top > window.innerHeight * 0.55) window.scrollTo({ top: Math.max(0, window.scrollY + r.top - 70), behavior: 'smooth' }); });
      } catch (e) {
        console.error(e);
        view.innerHTML = `<img src="${cardURL}" alt="Ta carte">`;
        setStatus(`<b>La lecture a échoué.</b><br><span class="small muted">${esc(e.message)}</span>`);
        showCandidates([], '');
      }
    }

    el.querySelector('#sc-search').addEventListener('click', async () => {
      if (!cardBlob) return App.util.toast('Prends d’abord la carte en photo');
      spin('Recherche…');
      try {
        const cands = await R.manual(cardBlob, el.querySelector('#sc-name').value, el.querySelector('#sc-num').value, spin);
        setStatus(''); showCandidates(cands, '');
      } catch (e) { setStatus(''); App.util.toast(e.message); }
    });
    el.querySelector('#sc-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') el.querySelector('#sc-search').click(); });

    return () => { cam.stop(); if (cardURL) URL.revokeObjectURL(cardURL); };
  },

  /* ================= Mode « page de classeur » ================= */
  async batch(el, params, alive, burst = false) {
    const { esc } = App.util;
    const R = App.recognizer, RATIO = R.RATIO;
    const game = 'pokemon';
    const ad = App.games.get(game);
    const FORMATS = { '3x3': [3, 3, '9 cartes (3 × 3)'], '2x2': [2, 2, '4 cartes (2 × 2)'], double: [6, 3, '18 cartes (classeur ouvert, 2 pages)'] };
    const PAGE_FORMATS = Object.fromEntries(Object.entries(FORMATS).filter(([k]) => k !== 'double'));
    let fmt = '3x3', fmtChosen = false; // fmtChosen : format choisi à la main (la détection ne le change plus)
    let photo = null;          // { img, url }
    let grid = null;           // { x, y, w, h } en fraction de l'image affichée
    let cells = [];            // résultats par pochette
    let running = false, stopped = false, detected = null, timing = null, prog = null; // prog : barre de progression de la page ; timing : temps de chaque étape (vérification par l’image, en essai)
    // écran plein écran de la page (v2.32) : 'scan' pendant l'analyse, 'review' = cartes à vérifier une par une, 'recap' = récapitulatif
    const sv = { open: false, mode: 'scan', list: [], idx: 0, single: false };
    let pageDur = 0; // durée de l'analyse de la page (affichée dans le récapitulatif)
    let autoGrid = false, autoTimer = null;   // grille trouvée toute seule / lancement automatique
    let autoCells = null, autoRot = 0, dimsOv = null; // cases trouvées (photo en biais) ; cartes couchées ; 2 pages en hauteur
    let pageCert = null;       // vérification en direct de la photo de page (null = photo importée)
    let pageId = null;         // page gardée sur cet appareil pour pouvoir recadrer plus tard
    let allSets = null;
    const urls = [];

    const certOn = App.certify.available();
    const setBox = (title) => `<div class="set-first">
            <div class="sf-head">${App.icons.icon('layers', 18)}<div><b>${title}</b> <span class="small muted">(facultatif, plus fiable)</span></div></div>
            <select id="b-set"><option value="">Série : je ne sais pas</option></select>
          </div>`;
    // commandes du mode page (gardées cachées en rafale : le code commun s'en sert)
    const pageCtl = `<div class="row" style="margin-bottom:10px">
            <label class="small"><span class="m-hide">Format de la page</span>
              <select id="b-fmt">${Object.entries(FORMATS).map(([k, v]) => `<option value="${k}">${v[2]}</option>`).join('')}</select></label>
          </div>`;
    // page de classeur (pas de certification) : l'appareil photo du téléphone d'abord — plein écran, pleine qualité
    const pageBtns = `<div class="row action-dock scan-dock" style="margin-top:14px" id="b-actions">
            <label class="btn primary" id="b-native">${App.icons.icon('camera', 16)} Prendre la page en photo<input type="file" accept="image/*" capture="environment" id="b-file" hidden></label>
            <button class="btn primary hidden" id="b-shot">${App.icons.icon('capture', 16)} Prendre la photo</button>
            <label class="btn">Choisir une photo<input type="file" accept="image/*" id="b-file2" hidden></label>
            <button class="btn ${certOn ? '' : 'hidden'}" id="b-cam">${App.icons.icon('shield', 16)} Photo certifiée</button>
          </div>
          ${certOn && !burst ? `<p class="small muted b-cert-help" id="b-cert-help">${App.icons.icon('shield', 13)} <b>Photo certifiée</b> : une carte s’allume, touche-la du doigt puis retire ta main.</p>` : ''}
          <div id="b-gridbar" class="hidden" style="margin-top:14px">
            <div id="b-auto" class="b-auto hidden"></div>
            <!-- la reconnaissance part toute seule ; le bouton n'apparaît que si la grille est à placer à la main -->
            <div class="row action-dock"><button class="btn primary hidden" id="b-go">▶ Lancer la reconnaissance</button><button class="btn ghost" id="b-reset">Reprendre une photo</button></div>
          </div>`;
    el.innerHTML = burst ? `
      <div class="batch-wrap">
        <div>
          ${setBox('Série des cartes')}
          <div class="scan-view" id="b-view">${App.views.scan.empty('rafale')}</div>
          <div id="r-hint" class="r-hint hidden"></div>
          <div class="row action-dock scan-dock" style="margin-top:14px" id="r-actions">
            <button class="btn primary" id="r-start">${App.icons.icon('camera', 16)} Démarrer la rafale</button>
            <button class="btn hidden" id="r-pause">Pause</button>
            <label class="btn" id="r-files-btn">Choisir des photos<input type="file" accept="image/*" multiple id="r-files" hidden></label>
          </div>
          ${certOn ? `<label class="r-cert small"><input type="checkbox" id="r-cert" checked> ${App.icons.icon('shield', 14)} <span>Certifier chaque carte <span class="muted">(montre le dos, retourne la carte et tiens-la immobile — la lampe peut clignoter un instant : elle est prise toute seule)</span></span></label>` : ''}
          <div hidden>${pageCtl}${pageBtns}</div>
        </div>
        <div>
          <div id="b-status"></div>
          <div id="b-results">${App.views.scan.guide('rafale')}</div>
          <div id="b-sv" class="sv hidden" role="dialog" aria-modal="true" aria-label="Analyse des cartes"></div>
        </div>
      </div>` : `
      <div class="batch-wrap">
        <div>
          <div class="sc-opts">${setBox('Série de la page')}${pageCtl}</div>
          <div class="scan-view batch-view" id="b-view">${App.views.scan.empty('classeur', FORMATS[fmt])}</div>
          ${pageBtns}
        </div>
        <div>
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
    const dims = () => (burst ? [3, 1] : dimsOv || FORMATS[fmt]);
    /** Grille réglable de départ : la forme du format choisi (cartes 63 × 88, couchées pour un classeur ouvert en hauteur), centrée */
    function defaultGrid() {
      const [cols, rows] = dims();
      const img = photo && photo.img, P = img && img.naturalWidth ? img.naturalWidth / img.naturalHeight : 0.75;
      const A = dimsOv ? (cols * 88) / (rows * 63) : (cols * 63) / (rows * 88); // largeur / hauteur de la zone des cartes
      let h = 0.92, w = (A * h) / P;
      if (w > 0.92) { w = 0.92; h = (w * P) / A; }
      return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
    }
    /** Applique une détection (grille régulière ou cases une par une) */
    function useDetection(g, k) {
      grid = { x: g.x, y: g.y, w: g.w, h: g.h }; autoGrid = true;
      autoCells = g.cells || null; autoRot = g.rot || 0;
      // chaque case ajustée sur les VRAIS bords de sa carte (la grille, régulière, tombe parfois à côté)
      if (autoCells && !autoRot && photo && !window.__noSnap) {
        let snapped = [];
        // (classeur ouvert : les cases viennent page par page, 3 × 3 chacune)
        const [cc, rr] = k === 'double' ? [3, 3] : (FORMATS[k] || [3, 3]);
        try { snapped = R.snapCells(photo.img, autoCells, cc, rr); } catch (e) { console.warn(e); }
        autoCells = autoCells.map((c, i) => (snapped[i] ? { ...c, quad: snapped[i], snapped: true, gridQuad: c.quad } : c));
      }
      dimsOv = k === 'double' && g.rot ? [3, 6] : null;
    }

    // liste des séries pour « Série de la page »
    ad.listSets().then((sets) => {
      allSets = sets;
      let saved = ''; try { saved = sessionStorage.getItem('pageSet') || ''; } catch (e) { /* */ }
      const sel = el.querySelector('#b-set'); if (sel) { App.views.scan.fillSetSelect(sel, sets, saved); sel.closest('.set-first').classList.toggle('chosen', !!sel.value); }
    }).catch(() => {});
    el.querySelector('#b-fmt').addEventListener('change', (e) => {
      fmt = e.target.value; fmtChosen = true; cancelAuto(); autoCells = null; autoRot = 0; dimsOv = null; autoGrid = false; grid = defaultGrid();
      if (photo && !running) {
        let gd = null;
        try { gd = fmt === 'double' ? R.detectDouble(photo.img) : R.detectGrid(photo.img, ...FORMATS[fmt].slice(0, 2)); } catch (err) { console.warn(err); }
        if (gd && gd.fit >= 0.45) useDetection(gd, fmt);
        else { if (fmt === 'double') { const t = photo.img.naturalHeight > photo.img.naturalWidth; dimsOv = t ? [3, 6] : null; } grid = defaultGrid(); }
        drawGrid();
      } else if (view.querySelector('.scan-empty')) view.innerHTML = App.views.scan.empty('classeur', dims()); // pas encore de photo : le dessin prend le format choisi
    });
    el.querySelector('#b-set').addEventListener('change', (e) => {
      try { sessionStorage.setItem('pageSet', e.target.value); } catch (err) { /* */ }
      e.target.closest('.set-first').classList.toggle('chosen', !!e.target.value);
    });
    el.querySelector('#b-cam').addEventListener('click', async () => {
      try {
        await cam.start(); el.querySelector('#b-shot').classList.remove('hidden'); setStatus('');
        el.querySelector('#b-native').classList.add('hidden'); el.querySelector('#b-cam').classList.add('hidden');
        // la vidéo entière à l'écran, sans avoir à faire défiler
        setTimeout(() => window.scrollTo({ top: Math.max(0, view.getBoundingClientRect().top + window.scrollY - 60), behavior: 'smooth' }), 350);
      }
      catch (e) { setStatus(`<b>Caméra indisponible.</b><br><span class="small muted">${esc(e.message)}</span>`); }
    });
    el.querySelector('#b-shot').addEventListener('click', async () => {
      el.querySelector('#b-shot').classList.add('hidden');
      setStatus('<div class="spinner"></div><div style="text-align:center">Photo en haute définition…</div>');
      const b = await cam.photo();
      if (!b) { setStatus(''); el.querySelector('#b-shot').classList.remove('hidden'); return; }
      // certification de la page : une carte tirée au sort à faire glisser hors de sa pochette, puis à remettre
      let res = null;
      if (App.certify.available()) { // « Photo certifiée » : la caméra du site sert à ça
        setStatus('');
        try {
          await new Promise((r) => setTimeout(r, 300)); // le flux reprend après la photo
          const fb = await cam.capture(), fimg = fb ? await createImageBitmap(fb) : null; // pochettes repérées sur l'image vidéo
          const det = fimg ? R.detectPage(fimg, PAGE_FORMATS, fmt === 'double' ? '3x3' : fmt) : null;
          const g = det && det.grid;
          if (g && g.cells && !g.rot && g.fit >= 0.38) res = await App.certify.livePage(cam.video, view, g.cells.map((c) => c.quad));
          else res = { passed: false, reasons: ['pochettes pas trouvées sur la vidéo (page entière, bien de face)'] };
        } catch (e) { console.warn(e); res = { passed: false, reasons: ['vérification impossible'] }; }
      }
      cam.stop();
      startGrid(b, res);
    });
    const fromFile = (e) => { if (e.target.files[0]) { cam.stop(); startGrid(e.target.files[0], null); } e.target.value = ''; };
    el.querySelector('#b-file').addEventListener('change', fromFile); // appareil photo du téléphone
    el.querySelector('#b-file2').addEventListener('change', fromFile); // galerie
    el.querySelector('#b-reset').addEventListener('click', () => {
      if (running) return;
      el.querySelector('#b-native').classList.remove('hidden'); el.querySelector('#b-cam').classList.remove('hidden'); el.querySelector('#b-shot').classList.add('hidden');
      cancelAuto(); el.querySelector('#b-auto').classList.add('hidden');
      photo = null; grid = null; cells = []; pageCert = null; pageId = null; resultsEl.innerHTML = ''; setStatus('');
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
      cells = []; resultsEl.innerHTML = App.views.scan.guide('classeur'); setStatus('');
      pageCert = cert; pageId = null;
      if (cert) setStatus(cert.passed
        ? `<span class="cert-ok">${App.icons.icon('shield', 16)} Capture en direct vérifiée</span> <span class="small muted">— les cartes bien reconnues seront certifiées.</span>`
        : `<span class="small">${App.icons.icon('shield', 14)} <b>Page non certifiable</b> : ${esc(cert.reasons.join(', '))}. <span class="muted">Tu peux quand même ajouter les cartes, ou reprendre la photo.</span></span>`);
      const url = URL.createObjectURL(blob); urls.push(url);
      view.innerHTML = `<div class="crop-area"><img src="${url}" alt="Page de classeur"><div class="grid-box"></div></div>`;
      const img = view.querySelector('img');
      img.onload = () => {
        photo = { img, url, blob };
        autoGrid = false; autoCells = null; autoRot = 0; dimsOv = null; grid = defaultGrid();
        drawGrid();
        el.querySelector('#b-actions').classList.add('hidden');
        el.querySelector('#b-gridbar').classList.remove('hidden');
        // on cherche la grille tout seul (format compris) ; si c'est sûr, la reconnaissance démarre d'elle-même
        setTimeout(() => {
          let r = null;
          try {
            // format choisi à la main : on cherche CETTE grille-là, sans passer à un autre format
            if (fmtChosen) { const g = fmt === 'double' ? R.detectDouble(img) : R.detectGrid(img, ...FORMATS[fmt].slice(0, 2)); r = g ? { fmt, grid: g } : null; }
            else r = R.detectPage(img, PAGE_FORMATS, fmt === 'double' ? '3x3' : fmt);
          } catch (e) { console.warn('grille', e); }
          if (!photo || photo.img !== img) return;
          const found = r && r.grid && r.grid.fit >= 0.38 && r.grid.w > 0.2 && r.grid.h > 0.2;
          const ok = found && r.grid.fit >= 0.45; // assez sûr pour lancer la reconnaissance tout seul
          const auto = el.querySelector('#b-auto');
          if (found) {
            if (r.fmt !== fmt) { fmt = r.fmt; el.querySelector('#b-fmt').value = fmt; }
            useDetection(r.grid, r.fmt); drawGrid();
          }
          if (!ok) { el.querySelector('#b-go').classList.remove('hidden'); auto.classList.remove('hidden'); auto.innerHTML = `${App.icons.icon('layers', 14)} ${found ? 'Vérifie les cases (glisse la grille si besoin)' : 'Je n’ai pas trouvé la grille tout seul : place-la sur les pochettes'}, puis lance la reconnaissance.`; return; }
          let n = 3;
          auto.classList.remove('hidden');
          window.scrollTo({ top: Math.max(0, view.getBoundingClientRect().top + window.scrollY - 70), behavior: 'smooth' });
          const tick = () => {
            auto.innerHTML = `${App.icons.icon('check', 14)} <b>Grille placée toute seule</b> — ${FORMATS[fmt][2]} : reconnaissance dans ${n} s… <button class="linkbtn" id="b-adjust">Ajuster d’abord</button>`;
            if (n-- <= 0) { autoTimer = null; auto.classList.add('hidden'); el.querySelector('#b-go').click(); return; }
            autoTimer = setTimeout(tick, 1000);
          };
          tick();
        }, 60);
      };
    }
    function cancelAuto() {
      // grille ajustée à la main (ou pas trouvée) : le bouton pour lancer la reconnaissance apparaît
      if (photo && !running) el.querySelector('#b-go').classList.remove('hidden');
      if (!autoTimer) return;
      clearTimeout(autoTimer); autoTimer = null;
      const a = el.querySelector('#b-auto'); if (a) a.innerHTML = `${App.icons.icon('layers', 14)} Ajuste la grille si besoin, puis lance la reconnaissance.`;
    }
    el.querySelector('#b-gridbar').addEventListener('click', (e) => { if (e.target.closest('#b-adjust')) cancelAuto(); });
    function drawGrid() {
      const [cols, rows] = dims();
      const box = view.querySelector('.grid-box'); if (!box) return;
      const W = photo.img.clientWidth, H = photo.img.clientHeight;
      // cases trouvées une par une (photo en biais) : on dessine chaque pochette
      let ov = view.querySelector('.cells-ov');
      if (autoGrid && autoCells) {
        box.style.display = 'none';
        if (!ov) { ov = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); ov.setAttribute('class', 'cells-ov'); view.querySelector('.crop-area').appendChild(ov); }
        ov.setAttribute('viewBox', `0 0 ${W} ${H}`); ov.setAttribute('width', W); ov.setAttribute('height', H);
        const outer = `M0 0H${W}V${H}H0Z`;
        const polys = autoCells.map((c) => c.quad.map(([x, y]) => `${(x * W).toFixed(1)},${(y * H).toFixed(1)}`).join(' '));
        ov.innerHTML = `<path d="${outer} ${autoCells.map((c) => 'M' + c.quad.map(([x, y]) => `${(x * W).toFixed(1)} ${(y * H).toFixed(1)}`).join('L') + 'Z').join(' ')}" fill="rgba(0,0,0,.45)" fill-rule="evenodd"/>` +
          polys.map((p, i) => { const q = autoCells[i].quad; return `<polygon points="${p}"/><text x="${(q[0][0] * W + 5).toFixed(1)}" y="${(q[0][1] * H + 15).toFixed(1)}">${i + 1}</text>`; }).join('');
        return;
      }
      if (ov) ov.remove();
      box.style.display = '';
      Object.assign(box.style, { left: grid.x * W + 'px', top: grid.y * H + 'px', width: grid.w * W + 'px', height: grid.h * H + 'px', gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` });
      box.innerHTML = Array.from({ length: cols * rows }, (_, i) => `<div class="gcell"><span>${i + 1}</span></div>`).join('') +
        ['tl', 'tr', 'bl', 'br'].map((h) => `<span class="gh ${h}" data-h="${h}"></span>`).join('');
    }
    view.addEventListener('pointerdown', (e) => {
      if (!photo || running || !e.target.closest('.crop-area')) return;
      e.preventDefault(); cancelAuto();
      if (autoGrid && autoCells) { autoCells = null; autoGrid = false; drawGrid(); } // on repasse en grille réglable à la main
      autoGrid = false;
      const area = view.querySelector('.crop-area').getBoundingClientRect();
      const W = photo.img.clientWidth, H = photo.img.clientHeight;
      const h = e.target.dataset.h;
      const start = { ...grid }, px = (e.clientX - area.left) / W, py = (e.clientY - area.top) / H;
      const clamp = (v) => Math.min(1, Math.max(0, v));
      const move = (ev) => {
        const x = clamp((ev.clientX - area.left) / W), y = clamp((ev.clientY - area.top) / H);
        if (!h) { // déplacer
          grid.x = Math.min(1 - grid.w, Math.max(0, start.x + x - px));
          grid.y = Math.min(1 - grid.h, Math.max(0, start.y + y - py));
        } else {
          let x0 = start.x, y0 = start.y, x1 = start.x + start.w, y1 = start.y + start.h;
          if (h.includes('l')) x0 = Math.min(x, x1 - 0.1); else x1 = Math.max(x, x0 + 0.1);
          if (h.includes('t')) y0 = Math.min(y, y1 - 0.1); else y1 = Math.max(y, y0 + 0.1);
          Object.assign(grid, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
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
    async function cellBlob(i, rot = autoRot) {
      const [cols, rows] = dims();
      const img = photo.img, NW = img.naturalWidth, NH = img.naturalHeight;
      if (autoGrid && autoCells && autoCells[i] && autoCells[i].snapped) {
        // bords de la carte trouvés : on la découpe pile dessus, remise à plat
        try {
          const q = autoCells[i].quad.map(([x, y]) => [x * NW, y * NH]);
          const qw = (Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]) + Math.hypot(q[2][0] - q[3][0], q[2][1] - q[3][1])) / 2;
          const c = R.warpQuad(img, q, Math.min(900, Math.round(qw)));
          const xs = q.map((p) => p[0] / NW), ys = q.map((p) => p[1] / NH);
          const box = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
          // lecture : d'abord la découpe habituelle (éprouvée) ; la carte ajustée n'est retenue que si ELLE est
          // reconnue avec certitude et pas l'autre (mesuré : parfois bien meilleure, parfois trompée par les reflets)
          const snap = await new Promise((res) => c.toBlob((b) => res({ blob: b, auto: true, box }), 'image/jpeg', 0.9));
          try {
            const o = R.cellCard(img, { ...autoCells[i], quad: autoCells[i].gridQuad }, rot);
            return await new Promise((res) => o.canvas.toBlob((b) => res({ blob: b, auto: o.auto, box: o.box, alt: snap }), 'image/jpeg', 0.9));
          } catch (e) { return snap; }
        } catch (e) { console.warn(e); }
      }
      if (autoGrid && autoCells && autoCells[i]) {
        let r = null; try { r = R.cellCard(img, autoCells[i], rot); } catch (e) { console.warn(e); }
        // (le détourage « cutCard » a été essayé ici le 27 sept. : meilleur sur 2 pages, bien pire sur une page
        //  avec reflets de pochettes — série plus devinée. On garde la découpe éprouvée pour le classeur.)
        if (r) return new Promise((res) => r.canvas.toBlob((b) => res({ blob: b, auto: r.auto, box: r.box }), 'image/jpeg', 0.9));
      }
      const gx = grid.x * NW, gy = grid.y * NH, cw = grid.w * NW / cols, ch = grid.h * NH / rows;
      const col = i % cols, row = Math.floor(i / cols);
      const rect = { x: gx + col * cw, y: gy + row * ch, w: cw, h: ch };
      let box = null;
      try { box = R.refineCell(img, rect) || R.locateCard(img, rect, autoGrid ? 0.8 : 0.6); } catch (e) { console.warn(e); }
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
      if (!photo || running) return;
      if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
      el.querySelector('#b-auto').classList.add('hidden');
      running = true; timing = null; pageDur = 0;
      if (!burst) svOpen('scan'); // analyse en plein écran, carte par carte
      const tStart = performance.now();
      el.querySelector('#b-go').disabled = true; el.querySelector('#b-reset').disabled = true; el.querySelector('#b-fmt').disabled = true;
      const warmP = App.visual && App.settings.visualCheck !== false ? App.visual.warm() : null; // bibliothèques de la vérification par l'image chargées pendant la lecture du texte
      const [cols, rows] = dims(), n = cols * rows;
      const hint = el.querySelector('#b-set').value;
      detected = null;
      cells = [];
      for (let i = 0; i < n; i++) {
        const { blob, auto, box, alt } = await cellBlob(i);
        const url = URL.createObjectURL(blob); urls.push(url);
        cells.push({ i, blob, url, auto, box, alt, state: 'attente', cands: [], choice: '', info: null, mode: null });
      }
      drawResults();
      let rotChecked = !autoRot; // cartes couchées : on vérifie le sens (haut de la carte à droite ou à gauche) sur la 1re carte lue
      for (const cell of cells) {
        if (stopped || !alive()) return;
        cell.state = 'lecture'; prog = { step: 'Lecture des cartes', done: cell.i, total: n }; drawResults();
        setStatus(`<div class="spinner"></div><div style="text-align:center">Carte ${cell.i + 1} / ${n}…</div>`);
        const st = (m) => { if (alive()) setStatus(`<div class="spinner"></div><div style="text-align:center">Carte ${cell.i + 1} / ${n} — ${esc(m)}</div>`); };
        try {
          await recogOne(cell, hint, st);
          // pas sûre avec la découpe habituelle : on essaie la carte ajustée sur ses vrais bords, gardée seulement si sûre
          if (cell.alt && cell.state !== 'sure' && !['vide', 'dos', 'autre'].includes(cell.state) && !stopped && alive()) {
            const test = { ...cell, blob: cell.alt.blob };
            await recogOne(test, hint, st);
            if (test.state === 'sure') {
              Object.assign(cell, { blob: test.blob, box: cell.alt.box, auto: cell.alt.auto, info: test.info, cands: test.cands, choice: test.choice, state: test.state, checked: test.checked });
              cell.url = URL.createObjectURL(cell.blob); urls.push(cell.url);
            }
            cell.alt = null;
          }
          if (!rotChecked && !['vide', 'dos', 'autre'].includes(cell.state)) {
            rotChecked = true;
            if (cell.state !== 'sure') {
              // l'autre sens donne-t-il une carte sûre ? si oui, toutes les cartes sont retournées
              const alt = await cellBlob(cell.i, -autoRot);
              const test = { ...cell, blob: alt.blob };
              await recogOne(test, hint, st);
              if (test.state === 'sure') {
                autoRot = -autoRot;
                for (const c of cells) {
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
        drawResults();
      }
      // Deuxième passe : la page semble rangée par série → on recompare les cartes incertaines à cette série
      prog = { step: 'Série de la page…', done: n, total: n };
      if (!hint && alive() && !stopped) await guessSeries();
      // Troisième passe : vérification par l'image (réseau de neurones + points clés)
      if (alive() && !stopped && App.settings.visualCheck !== false) { timing = { text: performance.now() - tStart, warm: await warmP }; await visualPass(hint); }
      running = false; prog = null; pageDur = performance.now() - tStart;
      el.querySelector('#b-reset').disabled = false; el.querySelector('#b-fmt').disabled = false; el.querySelector('#b-go').disabled = false;
      el.querySelector('#b-set').disabled = false;
      setStatus('');
      drawResults();
      if (!burst) svAfterScan(); // écran plein écran : cartes à vérifier une par une, puis récapitulatif
    });

    /**
     * Série de la page devinée (prudemment) : chaque carte vote pour les séries de ses meilleures candidates
     * (une réimpression presque aussi ressemblante compte aussi : ex. Set de Base / Évolutions).
     * Il faut au moins 3 cartes (et un tiers des cartes lues) d’accord, plus que pour toute autre série, et la moitié des cartes sûres.
     */
    async function guessSeries() {
      const read = cells.filter((c) => !c.saved && c.cands.length && !['vide', 'dos', 'autre', 'erreur'].includes(c.state));
      if (read.length < 3) return;
      const votes = {}, names = {}; let sureN = 0; const sureBy = {};
      for (const c of read) {
        const top = c.cands[0], seen = new Set();
        if (c.state === 'sure' && top.set) { sureN++; sureBy[top.set.id] = (sureBy[top.set.id] || 0) + 1; }
        for (const x of c.cands) {
          if (!x.set || seen.has(x.set.id)) continue;
          if (/promo/i.test(x.set.name || '') || /^[a-z]+p$/i.test(x.set.id)) continue; // une page rangée par série n'est pas une page de promos
          // la meilleure candidate compte si elle ressemble vraiment à la photo ; une autre, si elle la talonne
          const close = x === top ? (c.state === 'sure' || (top.visual != null && top.visual >= 0.45) || (top.nameScore || 0) >= 0.8)
            : (c.state !== 'sure' && x.visual != null && top.visual != null && x.visual >= 0.5 && top.visual - x.visual <= 0.12);
          if (!close) continue;
          seen.add(x.set.id); votes[x.set.id] = (votes[x.set.id] || 0) + 1; names[x.set.id] = x.set.name;
        }
      }
      const ranked = Object.entries(votes).sort((x, y) => y[1] - x[1]);
      console.info('[série de la page]', ranked.slice(0, 4).map(([k, v]) => `${names[k]} ${v}`).join(' · '), `(${read.length} cartes lues)`);
      let [best, nb] = ranked[0] || [];
      const second = ranked[1] ? ranked[1][1] : 0;
      // (sans risque : une carte n'est remplacée que si elle est reconnue avec certitude dans la série, et tout s'annule)
      if (!best || nb < 3 || nb < read.length * 0.34 || (sureN && (sureBy[best] || 0) < sureN * 0.5)) return;
      if (nb === second) {
        // égalité (ex. Set de Base et sa réimpression Évolutions) : on essaie les deux séries, la meilleure l'emporte
        const tied = ranked.filter((r) => r[1] === nb).slice(0, 2).map((r) => r[0]);
        const sureIn = {};
        for (const sid of tied) {
          sureIn[sid] = 0;
          for (const c of read) {
            if (stopped || !alive()) return;
            setStatus(`<div class="spinner"></div><div style="text-align:center">Quelle série ? Comparaison avec ${esc(names[sid])}…</div>`);
            // total des meilleures notes dans la série (ressemblance, nom, PV lus…), les cartes sûres comptent double
            try { const r = await R.inSet(c.blob, c.info, sid); if (r[0]) sureIn[sid] += r[0].score + (r[0].confident ? r[0].score : 0); } catch (e) { /* */ }
          }
        }
        setStatus('');
        console.info('[série de la page] égalité', tied.map((t) => `${names[t]} ${sureIn[t].toFixed(2)}`).join(' / '));
        if (Math.abs(sureIn[tied[0]] - sureIn[tied[1]]) < 0.3) return;
        best = sureIn[tied[0]] > sureIn[tied[1]] ? tied[0] : tied[1];
      }
      await applySeries(best, names[best], nb, true);
    }

    /**
     * Recompare les cartes incertaines à une série donnée (détectée ou choisie après coup).
     * On ne remplace le choix que si la carte est reconnue avec certitude (ou même nom réimprimé) ;
     * sinon les cartes de la série sont juste ajoutées à la liste. Tout est annulable.
     */
    async function applySeries(setId, name, nb, auto) {
      detected = { id: setId, name, nb, auto };
      const todo = cells.filter((c) => !c.saved && ['verifier', 'inconnue'].includes(c.state) && c.info);
      for (const cell of todo) cell.before = cell.before || { cands: cell.cands, choice: cell.choice, state: cell.state, checked: cell.checked };
      drawResults();
      for (const cell of todo) {
        if (stopped || !alive()) return;
        cell.state = 'lecture'; drawResults();
        try {
          const cands = await R.inSet(cell.blob, cell.info, setId, (m) => { if (alive()) setStatus(`<div class="spinner"></div><div style="text-align:center">Série ${esc(name)} — carte ${cell.i + 1} : ${esc(m)}</div>`); });
          let top = cands[0], sameName = false;
          const old = cell.before.cands[0];
          if (old && old.set && old.set.id !== setId) {
            // même nom (ou presque : « Lippoutou-ex » ↔ « Lippoutou »)
            const on = App.util.norm(old.name);
            const same = cands.find((x) => App.util.norm(x.name) === on) || cands.slice(0, 3).find((x) => { const xn = App.util.norm(x.name); return xn.length >= 4 && (on.startsWith(xn) || xn.startsWith(on)); });
            if (same) { top = same; sameName = true; cands.splice(cands.indexOf(same), 1); cands.unshift(same); }
          }
          const seen = new Set(cands.map((x) => x.id));
          cell.cands = [...cands, ...cell.before.cands.filter((x) => !seen.has(x.id))].slice(0, 12);
          // nettement la plus ressemblante de la série (sans être sûre) : proposée, mais « À vérifier » et non cochée
          const ahead = top && !top.confident && cands[1] && top.visual != null && top.visual >= 0.45 && (top.score - cands[1].score >= 0.25 || !cell.before.choice);
          if (top && (sameName || top.confident || ahead)) { cell.choice = top.id; cell.state = top.confident ? 'sure' : 'verifier'; }
          else { cell.choice = cell.before.choice; cell.state = cell.before.state; }
        } catch (e) { console.error(e); Object.assign(cell, { cands: cell.before.cands, choice: cell.before.choice, state: cell.before.state }); }
        cell.checked = cell.state === 'sure';
        drawResults();
      }
      setStatus('');
    }
    /**
     * Vérification par l'image (v2.31, méthode choisie avec le Labo : 96 % des 90 cartes de test contre 53 % en classeur) :
     * 1) chaque carte est comparée aux visuels de ses candidates (trouvées par le texte) ;
     * 2) série de la page = celle choisie, devinée, ou celle d'au moins 2 cartes nettement reconnues à l'image ;
     * 3) série connue : chaque carte est comparée à toute la série (le réseau de neurones présélectionne,
     *    les points clés tranchent), les cartes de la série passent devant une réimpression au même dessin.
     * Une carte reconnue à l'image (score ≥ 25) devient le choix ; « à vérifier » si une autre la talonne (même dessin)
     * ou si le texte avait trouvé une autre carte avec certitude.
     */
    const uniq = (list) => { const seen = new Set(); return list.filter((x) => x && !seen.has(x.id) && seen.add(x.id)); };
    /** Découpe la carte selon ses 4 coins (fractions de la photo), remise à plat */
    async function cropToQuad(blob, quad) {
      // un coin hors de la découpe (la case ne contenait pas toute la carte) : on ne recadre pas, sinon les pixels
      // du bord sont étirés pour combler (bandes sur les côtés, vu par Arnaud en v2.33)
      if (quad.some(([x, y]) => x < -0.005 || x > 1.005 || y < -0.005 || y > 1.005)) return null;
      const bmp = await createImageBitmap(blob), W = bmp.width, H = bmp.height;
      const q = quad.map(([x, y]) => [x * W, y * H]);
      const w = Math.round(Math.min(900, Math.max(240, Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]))));
      const cvs = R.warpQuad(bmp, q, w, 0);
      return new Promise((res) => cvs.toBlob(res, 'image/jpeg', 0.92));
    }
    async function visualPass(hint) {
      const V = App.visual;
      if (!V || App.settings.visualCheck === false) return; // (réglage dans Paramètres)
      if (!V.supported()) { timing = { ...(timing || {}), error: 'pas possible sur ce navigateur' }; return; }
      // (une carte sans aucune piste trouvée par le texte n'est comparée qu'une fois la série connue)
      const all = cells.filter((c) => !c.saved && ['sure', 'verifier', 'inconnue'].includes(c.state));
      const todo = all.filter((c) => c.cands.length);
      if (!all.length || (!todo.length && !hint)) return;
      // chronomètre (essai sur téléphone) : visuels officiels à préparer, comparaison, total
      const T = timing = { ...(timing || {}), refs: 0, match: 0, n: 0, dl: 0, fail: 0, total: null }, tv = performance.now();
      const rank = async (...a) => { const r = await V.rank(...a); T.refs += r.t.refs + r.t.tools; T.match += r.t.match; T.dl += r.t.dl || 0; T.fail += r.t.fail || 0; T.n++; T.backend = r.backend; return r; };
      const byId = new Map();
      const refOf = (x) => { byId.set(x.id, x); return { id: x.id, url: ad.img.card(x, 'low'), set: (x.set && x.set.id) || x.setId }; };
      const st = (t) => { if (alive()) setStatus(`<div class="spinner"></div><div style="text-align:center">${t}</div>`); };
      const pageKey = Date.now(), qid = (c) => `${pageKey}:${c.i}`;
      try {
        for (const [k, c] of todo.entries()) {
          if (stopped || !alive()) return;
          st(`Vérification par l'image — carte ${c.i + 1}…`);
          prog = { step: 'Vérification par l’image', done: k, total: todo.length, kind: 'img' };
          c.vscan = true; drawResults();
          try { c.vis = await rank(qid(c), c.blob, c.cands.map(refOf), { must: c.cands.map((x) => x.id) }); } finally { c.vscan = false; }
        }
        let set = hint || (detected && detected.id) || null;
        if (!set) {
          const votes = {};
          for (const c of todo) { const t = c.vis.res[0]; const x = t && byId.get(t.id); if (t && t.s >= V.SURE && x && x.set) votes[x.set.id] = (votes[x.set.id] || 0) + 1; }
          const [best, nb] = Object.entries(votes).sort((a, b) => b[1] - a[1])[0] || [];
          if (nb >= 2) set = best;
        }
        if (set) {
          const s = await ad.getSet(set);
          const shape = { id: s.id, name: s.name, logo: s.logo, symbol: s.symbol, releaseDate: s.releaseDate, cardCount: { total: s.total, official: s.official }, serie: s.group };
          const series = s.cards.map((x) => refOf({ ...x, set: shape }));
          for (const [k, c] of all.entries()) {
            if (stopped || !alive()) return;
            const own = c.cands.map(refOf), ids = new Set(series.map((r) => r.id));
            st(`Comparaison avec les ${series.length} cartes de ${esc(s.name)} — carte ${c.i + 1}…`);
            prog = { step: `Comparaison avec ${s.name}`, done: k, total: all.length, kind: 'img' };
            c.vscan = true; drawResults();
            try {
              c.vis = await rank(qid(c), c.blob, [...series, ...own.filter((r) => !ids.has(r.id))], {
                must: c.cands.map((x) => x.id), bonusSet: set,
                onProgress: (d, n) => st(`Préparation des visuels de ${esc(s.name)} (une seule fois) : ${d} / ${n}…`),
              });
            } finally { c.vscan = false; }
          }
        }
      } catch (e) { console.warn('vérification par l’image', e); T.error = e.message; T.total = performance.now() - tv; setStatus(''); return; }
      for (const c of all) {
        const [a, b] = c.vis ? c.vis.res : [];
        const card = a && byId.get(a.id);
        if (!card || a.s < V.SURE) continue; // pas assez sûr à l'image : on garde la lecture du texte
        const twin = b && b.s >= a.s * 0.8; // une autre carte presque aussi proche (même dessin : holo / non holo, réimpression)
        const clash = c.state === 'sure' && c.choice && c.choice !== a.id; // le texte avait trouvé autre chose avec certitude
        if (clash) console.info('[image] désaccord case', c.i + 1, c.choice, '→', a.id, a.s);
        // les cartes presque aussi proches à l'image (même dessin) sont proposées juste après
        const near = c.vis.res.slice(1).filter((r) => r.s >= a.s * 0.6).map((r) => byId.get(r.id)).filter(Boolean);
        if (clash) { // on garde le choix du texte, la carte trouvée à l'image est proposée juste après
          const t = c.cands.find((x) => x.id === c.choice);
          c.cands = uniq([t, card, ...near, ...c.cands]).slice(0, 12);
          c.state = 'verifier';
        } else {
          c.cands = uniq([card, ...near, ...c.cands]).slice(0, 12);
          c.choice = a.id; c.state = twin ? 'verifier' : 'sure';
        }
        c.visId = a.id; c.found = Date.now(); // petit éclat : carte confirmée à l’image
        c.checked = c.state === 'sure';
        // la carte recadrée pile sur ses bords : les 4 coins du visuel officiel reportés sur la photo par les points clés
        // (photo enregistrée bien cadrée, et relecture du numéro plus facile)
        if (a.quad && !c.cropped) {
          try {
            const blob = await cropToQuad(c.blob, a.quad);
            if (blob) { c.gridBlob = c.blob; c.blob = blob; c.url = URL.createObjectURL(blob); urls.push(c.url); c.cropped = true; c.det = null; }
          } catch (e) { console.warn('recadrage', e); }
        }
      }
      // doute qui reste (même dessin, désaccord) : on relit le numéro sur la carte recadrée ; s'il désigne une seule
      // des cartes proches à l'image, c'est elle (ex. holo 12 / non holo 27, Set de Base 37 / Base Set 2 54)
      const doubt = all.filter((c) => c.cropped && c.state === 'verifier');
      for (const [k, c] of doubt.entries()) {
        if (stopped || !alive()) return;
        prog = { step: 'Relecture du numéro (carte recadrée)', done: k, total: doubt.length, kind: 'img' };
        c.vscan = true; drawResults();
        try {
          const info = await R.read(c.blob, null, { atkBand: false });
          const num = info && info.num, a = c.vis.res[0];
          const off = (x) => (x.set && x.set.cardCount && x.set.cardCount.official) || 0;
          const pool = c.vis.res.filter((r) => r.s >= a.s * 0.6).map((r) => byId.get(r.id)).filter(Boolean);
          const hit = num ? pool.filter((x) => parseInt(x.localId, 10) === num.n && (!num.of || !off(x) || off(x) === num.of)) : [];
          if (hit.length === 1) {
            c.cands = uniq([hit[0], ...c.cands]).slice(0, 12);
            c.choice = hit[0].id; c.state = 'sure'; c.checked = true; c.numFix = `${num.n}${num.of ? '/' + num.of : ''}`; c.found = Date.now();
          }
          if (info) c.info = { ...c.info, num: info.num || (c.info && c.info.num) };
        } catch (e) { console.warn('relecture', e); } finally { c.vscan = false; }
      }
      T.total = performance.now() - tv; T.cards = all.length;
      setStatus('');
    }
    // ---------- Écran plein écran de la page (v2.32, idée d'Arnaud : « plus visuel, moins bordélique ») ----------
    // 1) analyse : la carte en cours en grand avec l'animation, ce qui a été lu, la mini-page ;
    // 2) seulement les cartes « à vérifier », une par une, avec de gros boutons ; 3) récapitulatif + « Enregistrer ».
    // La liste détaillée reste disponible (« Voir la liste »), et l'analyse continue pendant ce temps.
    const svBox = () => el.querySelector('#b-sv');
    const lockScroll = (on) => document.documentElement.classList.toggle('sv-lock', on);
    function svOpen(mode, extra = {}) { Object.assign(sv, { open: true, mode, single: false }, extra); lockScroll(true); drawSV(); }
    function svClose() { sv.open = false; lockScroll(false); drawSV(); drawResults(); }
    /** Cartes qui méritent un coup d'œil : pas sûres, ou pas reconnues */
    const toCheck = () => cells.filter((c) => !c.saved && ['verifier', 'inconnue'].includes(c.state)).map((c) => c.i);
    const cardOf = (c) => c.cands.find((x) => x.id === c.choice) || null;
    const visOf = (x) => esc(ad.img.card(x, 'low'));
    const durTxt = (ms) => { const s = Math.round(ms / 1000); return s >= 60 ? `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s` : `${s} s`; };
    /**
     * La page en vignettes : chaque pochette montre ta photo (grisée en attente), puis le visuel officiel une fois la carte
     * trouvée ; bordure selon l'état ; la carte en cours clignote. Classeur ouvert : les 2 pages côte à côte.
     */
    function miniPage(cur) {
      const per = cells.length > 9 && dims()[0] === 6 ? 9 : cells.length, cols = per === 9 ? 3 : dims()[0], parts = [];
      for (let s = 0; s < cells.length; s += per) parts.push(cells.slice(s, s + per));
      const rows = Math.ceil(per / cols);
      const th = (c) => {
        const x = cardOf(c), st = c.saved ? 'saved' : c.state, done = ['sure', 'verifier'].includes(st) || c.saved;
        const src = done && x ? visOf(x) : c.url;
        return `<span class="sv-th st-${st}${c === cur ? ' cur' : ''}${c.found && Date.now() - c.found < 1500 ? ' pop' : ''}" title="Carte ${c.i + 1}">${['vide', 'dos', 'autre'].includes(st) ? '' : `<img src="${src}" alt="">`}${st === 'sure' || c.saved ? '<b>✓</b>' : st === 'verifier' ? '<b>?</b>' : ''}</span>`;
      };
      return `<div class="sv-board" style="--cols:${cols * parts.length};--rows:${rows}">${parts.map((p) => `<div style="grid-template-columns:repeat(${cols},1fr)">${p.map(th).join('')}</div>`).join('')}</div>`;
    }
    function svTop(label, right, bar) {
      return `<div class="sv-top"><div class="bprog-lbl"><span>${label}</span><b>${right || ''}</b></div>${bar || ''}</div>`;
    }
    /** Écran d'analyse : la carte en cours en grand (rayon de scan), la vignette du visuel trouvé dans son coin, la page en dessous */
    function svScan() {
      const cur = cells.find((c) => c.vscan) || cells.find((c) => c.state === 'lecture');
      const p = prog, off = cur && cardOf(cur);
      const step = !p ? 0 : /^Lecture des/.test(p.step) ? 1 : /^Série/.test(p.step) ? 2 : 3;
      const steps = (burst ? ['Lecture'] : ['Lecture', 'Série', 'Image']).map((s, k) => `<span class="${k + 1 === step ? 'on' : k + 1 < step ? 'past' : ''}">${k + 1 < step ? '✓' : k + 1} ${s}</span>`).join('');
      return `
        <div class="sv-head">
          <div class="sv-steps">${steps}</div>
          <div class="sv-count">${p ? `<b>${Math.min(p.done + 1, p.total)}</b><span>/ ${p.total}</span>` : ''}</div>
        </div>
        ${p ? `<div class="bprog-bar ${p.kind === 'img' ? 'img' : ''}"><i style="width:${Math.round((100 * p.done) / Math.max(1, p.total))}%"></i></div>` : ''}
        <div class="sv-stage">
          ${cur ? `<span class="sv-shot"><span class="bphoto sv-card ${cur.vscan ? 'scan-img' : 'scan-txt'}"><img src="${cur.url}" alt="Ta carte ${cur.i + 1}"><i class="bscan"></i>${cur.vscan ? '<i class="bdot"></i>'.repeat(7) : ''}</span>
            ${off ? `<span class="sv-pip ${cur.state === 'sure' ? 'hit' : ''}"><img src="${visOf(off)}" alt="Carte envisagée">${cur.state === 'sure' ? '<b>✓</b>' : ''}</span>` : ''}</span>`
            : '<div class="spinner"></div>'}
        </div>
        <div class="sv-caption">
          <div class="sv-title">${off ? esc(off.name) : cur ? 'Recherche…' : 'Préparation de la page…'}</div>
          <div class="sv-sub">${p ? esc(p.step) : ''}${cur ? ` · carte ${cur.i + 1}` : ''}${cur && cur.info ? ` · lu : ${esc(R.readSummary(cur.info))}` : ''}</div>
        </div>
        ${miniPage(cur)}
        <button class="linkbtn sv-list" data-sv="close">Voir la liste pendant ce temps →</button>`;
    }
    function svReview() {
      const c = cells[sv.list[sv.idx]];
      if (!c) return svRecap();
      const cur = cardOf(c);
      const sureN = cells.filter((x) => !x.saved && x.state === 'sure').length;
      const others = c.cands.filter((x) => x !== cur).slice(0, 4);
      const twin = cur && others.find((x) => App.util.norm(x.name) === App.util.norm(cur.name));
      const why = !cur ? 'Carte pas reconnue avec certitude : choisis parmi les propositions, ou cherche-la.'
        : twin ? `Même dessin que ${esc(App.views.scan.setLabel(twin))} · ${esc(twin.localId)} : laquelle est-ce ?`
        : 'Pas tout à fait sûr : c’est bien elle ?';
      return `${svTop(sv.single ? `Carte ${c.i + 1}` : `${sureN ? `${sureN} reconnue${sureN > 1 ? 's' : ''} · ` : ''}<span class="warn">${sv.list.length} à vérifier</span>`, sv.single ? '' : `${sv.idx + 1} / ${sv.list.length}`)}
        <div class="sv-pair"><span class="bphoto"><img src="${c.url}" alt="Ta carte ${c.i + 1}"></span>
          ${cur ? `<img class="sv-off" src="${visOf(cur)}" alt="Visuel officiel">` : '<span class="sv-off sv-wait"><b>?</b></span>'}</div>
        <div class="sv-name">${cur ? `${esc(cur.name)} <span class="muted">· ${esc(App.views.scan.setLabel(cur))} · ${esc(cur.localId)}</span>` : 'Carte non reconnue'}</div>
        <div class="sv-why">${why}</div>
        ${svVersions(c, cur)}
        ${others.length ? `<div class="sv-alts"><span class="small muted">${cur ? 'Ou bien l’une de celles-ci :' : 'Propositions :'}</span>
          <div>${others.map((x) => `<button class="sv-alt" data-sv="pick" data-id="${esc(x.id)}"><img src="${visOf(x)}" alt=""><span><b>${esc(x.name)}</b></span><span class="muted">${esc(x.localId)} · ${esc((x.set && x.set.name) || '')}</span></button>`).join('')}</div></div>` : ''}
        <div class="sv-acts">
          ${cur ? `<button class="btn primary" data-sv="yes">✓ C’est elle</button>` : ''}
          <button class="btn" data-sv="search">🔎 Chercher</button>
          <button class="btn" data-sv="no">Ne pas l’ajouter</button>
        </div>
        <div class="sv-nav">${!sv.single && sv.idx > 0 ? '<button class="linkbtn" data-sv="prev">← Carte précédente</button>' : '<span></span>'}<button class="linkbtn" data-sv="close">Voir la liste détaillée</button></div>`;
    }
    /** Version de la carte (normale / holo / reverse, 1re édition) : mesurée sur la photo, corrigeable ici avant l'enregistrement */
    function svVersions(c, cur) {
      if (!cur || !cur.variants) return '';
      const opts = baseOpts(cur), fe = !!cur.variants.firstEdition;
      if (opts.length <= 1 && !fe) return '';
      const v = (c.det && c.det.id === cur.id && versOf(c)) || [];
      const how = !c.det || c.det.id !== cur.id || c.det.measuring ? 'mesure…' : c.det.user ? 'choisie' : c.det.sure ? 'mesurée sur la photo' : 'à vérifier';
      return `<div class="sv-vers"><span class="small muted">Version <span class="${how === 'à vérifier' ? 'warn' : ''}">(${how})</span></span>
        <div class="chips">${opts.map((k) => `<button class="chip ${v.includes(k) ? 'on' : ''}" data-sv="vbase" data-v="${k}">${VN[k]}</button>`).join('')}
        ${fe ? `<button class="chip ${v.includes('firstEdition') ? 'on' : ''}" data-sv="vfe">1ʳᵉ éd.</button>` : ''}</div></div>`;
    }
    /**
     * Étiquette de version posée sur la carte dans le récapitulatif (demande d'Arnaud) : ce qui a été trouvé,
     * orange avec « ? » si pas sûr ; un appui passe à la version suivante (normale → holo → reverse).
     */
    function versPill(c, cur) {
      if (!cur.variants) return '';
      const opts = baseOpts(cur); if (opts.length <= 1) return ''; // une seule version possible : rien à choisir
      const measured = c.det && c.det.id === cur.id && !c.det.measuring;
      const v = (measured && versOf(c)) || [], base = v.find((x) => x !== 'firstEdition');
      const doubt = !measured || (!c.det.user && !c.det.sure);
      const label = measured ? `${VN[base] || '—'}${v.includes('firstEdition') ? ' · 1ʳᵉ éd.' : ''}` : 'Version…';
      return `<button class="sv-vpill ${doubt ? 'doubt' : ''}" data-sv="vcycle" data-i="${c.i}" title="Touche pour passer à la version suivante">${label}${doubt && measured ? ' ?' : ''} <span aria-hidden="true">↻</span></button>`;
    }
    function svRecap() {
      const shown = cells.filter((c) => c.choice || !['vide', 'dos', 'autre', 'erreur'].includes(c.state));
      const ign = cells.length - shown.length;
      const chosen = cells.filter((c) => c.choice && !c.saved && modeOf(c) !== 'rien');
      const tag = (c) => {
        if (c.saved) return ['ok', 'Enregistrée ✓'];
        if (!c.choice || !c.checked) return ['off', 'Pas ajoutée'];
        const m = modeOf(c);
        return m === 'nouvelle' ? ['new', 'Nouvelle'] : m === 'doublon' ? ['dup', 'Doublon'] : m === 'photo' ? ['dup', 'Nouvelle photo'] : ['own', 'Déjà dans ton Dex'];
      };
      return `${svTop('<b>Récapitulatif de la page</b>', pageDur ? `<span class="muted small">analyse : ${durTxt(pageDur)}</span>` : '')}
        <div class="sv-recap">${shown.map((c) => { const cur = cardOf(c), [k, t] = tag(c), vp = !c.saved && cur ? versPill(c, cur) : ''; return `<div class="sv-rc ${k}">
          <button class="sv-rc-open" data-sv="open" data-i="${c.i}" ${c.saved ? 'disabled' : ''}><img src="${cur ? visOf(cur) : c.url}" alt=""><span class="sv-badge">${t}</span></button>
          ${vp}<span class="sv-rn">${cur ? esc(cur.name) : 'Non reconnue'}</span></div>`; }).join('')}</div>
        <div class="small muted sv-hint">${ign ? `${ign} case${ign > 1 ? 's' : ''} ignorée${ign > 1 ? 's' : ''} (vide, dos ou autre jeu). ` : ''}Touche une carte pour la changer, ou son étiquette de version (<b class="warn">?</b> = pas sûre) pour passer à la suivante.</div>
        <div class="sv-acts sv-final">
          <button class="btn primary" data-sv="save" ${chosen.length ? '' : 'disabled'}>✓ Enregistrer ${chosen.length} carte${chosen.length > 1 ? 's' : ''} dans mon Dex</button>
          <button class="btn" data-sv="close">Voir la liste détaillée</button>
        </div>`;
    }
    function drawSV() {
      const box = svBox(); if (!box) return;
      box.classList.toggle('hidden', !sv.open);
      if (!sv.open) { box.innerHTML = ''; return; }
      const ph = sv.mode !== 'scan' ? 'done' : cells.some((c) => c.vscan) ? 'img' : 'txt'; // couleurs de l'étape
      box.innerHTML = `<div class="sv-in sv-m-${sv.mode} ph-${ph}">${sv.mode === 'scan' ? svScan() : sv.mode === 'review' ? svReview() : svRecap()}</div>`;
    }
    /** Fin de l'analyse : cartes à vérifier d'abord, sinon directement le récapitulatif */
    function svAfterScan() {
      if (!sv.open) return;
      const l = toCheck();
      if (l.length) svOpen('review', { list: l, idx: 0 }); else svOpen('recap');
    }
    /** Rafale (au moins 2 cartes) : écran d'analyse ; lectures en cours → défilement, sinon cartes douteuses puis récapitulatif */
    function burstReview() {
      if (rPending > 0) return svOpen('scan');
      const l = toCheck();
      if (l.length) svOpen('review', { list: l, idx: 0 }); else svOpen('recap');
    }
    function svAction(b) {
      const a = b.dataset.sv, c = sv.mode === 'review' ? cells[sv.list[sv.idx]] : null;
      const next = () => {
        if (sv.single || sv.idx >= sv.list.length - 1) Object.assign(sv, { mode: 'recap', single: false }); else sv.idx++;
        drawResults(); drawSV();
        const box = svBox(); if (box) box.scrollTop = 0;
      };
      if (a === 'close') return svClose();
      if (a === 'prev') { sv.idx = Math.max(0, sv.idx - 1); return drawSV(); }
      if (a === 'yes' && c) { c.checked = true; c.mode = null; return next(); }
      if (a === 'no' && c) { c.checked = false; return next(); }
      if (a === 'pick' && c) { // une autre proposition : on la montre en grand, il reste à confirmer
        c.choice = b.dataset.id; c.mode = null; c.checked = true; if (c.state === 'inconnue') c.state = 'verifier';
        drawResults(); return drawSV();
      }
      if (a === 'search' && c) {
        svClose();
        const box = resultsEl.querySelector(`[data-box="${c.i}"]`), tile = resultsEl.querySelector(`.btile[data-i="${c.i}"]`);
        if (box) box.classList.remove('hidden');
        if (tile) tile.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const inp = resultsEl.querySelector(`[data-name="${c.i}"]`); if (inp) setTimeout(() => inp.focus(), 400);
        return;
      }
      if (a === 'open') return svOpen('review', { list: [+b.dataset.i], idx: 0, single: true });
      if (a === 'vcycle') { // version suivante, directement depuis le récapitulatif
        const cc = cells[+b.dataset.i], cur = cc && cardOf(cc); if (!cur) return;
        const opts = baseOpts(cur), now = ((cc.det && cc.det.id === cur.id && versOf(cc)) || []).find((x) => x !== 'firstEdition');
        if (!cc.det || cc.det.id !== cur.id) cc.det = { id: cur.id, list: [] };
        cc.det.base = opts[(opts.indexOf(now) + 1) % opts.length]; cc.det.user = true; cc.det.measuring = false;
        drawResults(); return drawSV();
      }
      if ((a === 'vbase' || a === 'vfe') && c) { // version corrigée à la main
        const cur = cardOf(c); if (!cur) return;
        if (!c.det || c.det.id !== cur.id) c.det = { id: cur.id, list: [] };
        const had = (versOf(c) || []).includes('firstEdition');
        if (a === 'vbase') c.det.base = b.dataset.v; else c.det.fe = !had;
        c.det.user = true; c.det.measuring = false;
        drawResults(); return drawSV();
      }
      if (a === 'save') { svClose(); const add = resultsEl.querySelector('#b-add'); if (add) add.click(); }
    }
    if (svBox()) svBox().addEventListener('click', (e) => { const b = e.target.closest('[data-sv]'); if (b && !b.disabled) svAction(b); });

    /** Chronomètre de la vérification par l'image (réglage « Afficher le temps de chaque étape »), affiché sous la liste */
    function timingHtml() {
      if (!timing || App.settings.visualCheck === false || !App.settings.showTiming) return '';
      const s = (ms) => (ms == null ? '—' : ms >= 10000 ? `${Math.round(ms / 1000)} s` : `${(ms / 1000).toFixed(1)} s`);
      const w = timing.warm;
      return `<div class="panel small" style="margin-top:12px"><b>⏱ Temps (essai de la vérification par l’image)</b><br>
        ${timing.text != null ? `Lecture du texte : ${s(timing.text)} · ` : ''}Chargement des outils : ${w ? s(w.ms) + ' (pendant la lecture)' : '—'}
        ${timing.total != null ? ` · Visuels officiels à préparer : ${s(timing.refs)}${timing.dl ? ` (${timing.dl} téléchargés${timing.fail ? `, dont ${timing.fail} en échec` : ''})` : ''} · Comparaison : ${s(timing.match)}${timing.cards ? ` (${s(timing.match / timing.cards)} par carte)` : ''} · <b>Total image : ${s(timing.total)}</b>` : ''}
        ${timing.error ? `<br><span class="bad">Problème : ${esc(timing.error)}</span>` : ''}
        <br><span class="muted">${esc(navigator.hardwareConcurrency || '?')} cœurs · calcul ${esc((w && w.backend) || timing.backend || '?')}</span></div>`;
    }
    function undoSeries() {
      for (const c of cells) if (c.before && !c.saved) { Object.assign(c, c.before); delete c.before; }
      detected = null; drawResults();
    }

    /** Lecture d'une pochette : vide, dos, autre jeu, ou carte Pokémon (candidats) */
    async function recogOne(cell, hint, st) {
      if (await R.looksEmpty(cell.blob)) { cell.state = 'vide'; return; }
      if (await R.looksLikeBack(cell.blob).catch(() => false)) { cell.state = 'dos'; return; }
      let info, cands;
      if (hint) { info = await R.read(cell.blob, st, { atkBand: burst }); cands = await R.inSet(cell.blob, info, hint, st); }
      else ({ info, cands } = await R.recognize(cell.blob, st, { atkBand: burst }));
      cell.info = info; cell.cands = cands;
      if (info && info.otherGame && !(cands[0] && cands[0].confident)) { cell.state = 'autre'; cell.cands = []; cell.choice = ''; cell.checked = false; return; }
      cell.choice = cands[0] ? cands[0].id : '';
      cell.state = !cands.length ? 'inconnue' : cands[0].confident ? 'sure' : 'verifier';
      // meilleure candidate qui ne ressemble pas à la photo, nom et numéro non lus : on ne la propose pas d'office
      const top = cands[0];
      if (top && !top.confident && !top.numOk && top.visual != null && top.visual < 0.42 && (top.nameScore || 0) < 0.75) { cell.choice = ''; cell.state = 'inconnue'; }
      cell.checked = cell.state === 'sure'; // seules les cartes sûres sont cochées d'office
    }

    /** (Re)lit une seule pochette, par ex. après un recadrage */
    async function recogCell(cell, hint, force = false) {
      cell.state = 'lecture'; cell.cands = []; cell.choice = ''; cell.info = null; cell.mode = null; drawResults();
      const st = (m) => { if (alive()) setStatus(`<div class="spinner"></div><div style="text-align:center">Carte ${cell.i + 1} — ${esc(m)}</div>`); };
      try {
        if (!force && await R.looksEmpty(cell.blob)) { cell.state = 'vide'; }
        else {
          let info, cands;
          if (hint) { info = await R.read(cell.blob, st, { atkBand: burst }); cands = await R.inSet(cell.blob, info, hint, st); }
          else ({ info, cands } = await R.recognize(cell.blob, st, { atkBand: burst }));
          cell.info = info; cell.cands = cands;
          cell.choice = cands[0] ? cands[0].id : '';
          cell.state = !cands.length ? 'inconnue' : cands[0].confident ? 'sure' : 'verifier';
          cell.checked = cell.state === 'sure';
        }
      } catch (e) { console.error(e); cell.state = 'erreur'; cell.error = e.message; }
    }

    const stateLabel = {
      attente: ['En attente', ''], lecture: ['Lecture…', ''], vide: ['Pochette vide', 'muted'], dos: ['Dos de carte (ignoré)', 'muted'], autre: ['Autre jeu que Pokémon (ignorée)', 'muted'],
      sure: ['Reconnue ✓', 'ok'], verifier: ['À vérifier', 'warn'], inconnue: ['Non reconnue', 'bad'], erreur: ['Erreur', 'bad'],
      enregistree: ['Enregistrée ✓', 'ok'],
    };

    /** Que faire de la carte de cette pochette ? (si l'utilisateur n'a pas choisi lui-même) */
    function modeOf(c) {
      if (!c.choice || !c.checked || c.saved) return 'rien';
      if (c.mode) return c.mode;
      const owned = !!App.col.get(game, c.choice);
      const earlier = cells.some((o) => o.i < c.i && o.choice === c.choice);
      if (earlier) return 'doublon';          // 2 pochettes = 2 exemplaires physiques
      return owned ? 'rien' : 'nouvelle';     // déjà possédée : on ne compte qu'un exemplaire, sauf choix contraire
    }
    const modeLabels = { nouvelle: 'Nouvelle carte', rien: 'Déjà possédée : ne rien changer', photo: 'Même carte : utiliser cette photo', doublon: 'Autre exemplaire (doublon)' };

    // ---------- Version de chaque carte (normale / holo / reverse / 1re édition), mesurée AVANT l'ajout ----------
    const VN = { normal: 'Normale', holo: 'Holo', reverse: 'Reverse', firstEdition: '1ʳᵉ édition' };
    const baseOpts = (cur) => ['normal', 'holo', 'reverse'].filter((k) => cur && cur.variants && cur.variants[k]);
    /** Version retenue pour une case : celle mesurée sur la photo, ou celle corrigée à la main */
    const versOf = (c) => {
      if (!c.det) return null;
      const base = c.det.base || (c.det.list || []).find((v) => v !== 'firstEdition') || null;
      const fe = c.det.fe != null ? c.det.fe : (c.det.list || []).includes('firstEdition');
      return [base, fe ? 'firstEdition' : null].filter(Boolean);
    };
    /** Mesure la brillance de la photo (reflets de l'illustration, du fond, logo 1re édition) pour la carte choisie */
    async function measureVers(c) {
      const cur = c.cands.find((x) => x.id === c.choice);
      // pas d'info de version pour cette carte : on le note (sinon elle serait remesurée sans fin et la page se figerait)
      if (!cur || !cur.variants) { c.det = { id: c.choice, list: [], none: true }; return; }
      const id = cur.id;
      c.det = { id, measuring: true, list: [] };
      try {
        const d = await R.detectVariants(c.blob, cur.variants, ad.img.card(cur, 'high'));
        // (« sûre » seulement si la mesure l'est vraiment ; une version choisie à la main pendant la mesure n'est pas écrasée)
        if (c.choice === id && !(c.det && c.det.user)) c.det = { id, list: d.list, sure: !!(d.sure && d.sure.base), info: d.info };
      } catch (e) { if (c.choice === id) c.det = { id, list: [], sure: false }; }
    }
    const versHtml = (c, cur) => {
      if (!cur || !cur.variants) return '';
      const opts = baseOpts(cur), fe = !!cur.variants.firstEdition;
      if (!c.det || c.det.id !== cur.id) return '';
      if (c.det.measuring) return `<div class="small muted bvers">${App.icons.icon('sparkles', 12)} Brillance : mesure…</div>`;
      const v = versOf(c) || [], base = v.find((x) => x !== 'firstEdition') || opts[0];
      if (opts.length <= 1 && !fe) return opts.length ? `<div class="small bvers">${App.icons.icon('sparkles', 12)} ${VN[opts[0]]} <span class="muted">(seule version de cette carte)</span></div>` : '';
      return `<div class="small bvers">${App.icons.icon('sparkles', 12)} Version :
        ${opts.length > 1 ? `<select data-vbase="${c.i}">${opts.map((k) => `<option value="${k}" ${k === base ? 'selected' : ''}>${VN[k]}</option>`).join('')}</select>` : `<b>${VN[opts[0]] || ''}</b>`}
        ${fe ? `<label class="check"><input type="checkbox" data-vfe="${c.i}" ${v.includes('firstEdition') ? 'checked' : ''}> 1ʳᵉ éd.</label>` : ''}
        <span class="muted">(${c.det.user ? 'choisie' : c.det.sure ? 'mesurée sur la photo' : 'mesurée, à vérifier'})</span></div>`;
    };

    function drawResults() {
      if (sv.open) drawSV(); // l'écran plein écran suit l'analyse (et les versions mesurées en arrière-plan)
      const [cols] = dims();
      const chosen = cells.filter((c) => c.choice && modeOf(c) !== 'rien');
      const savedN = cells.filter((c) => c.saved).length, leftN = cells.filter((c) => !c.saved && c.choice).length;
      resultsEl.innerHTML = `
        ${running && prog ? `<div class="bprog" role="status"><div class="bprog-lbl"><span>${esc(prog.step)}</span><b>${Math.min(prog.done + 1, prog.total)} / ${prog.total}</b></div>
          <div class="bprog-bar ${prog.kind === 'img' ? 'img' : ''}"><i style="width:${Math.round((100 * prog.done) / Math.max(1, prog.total))}%"></i></div></div>` : ''}
        ${savedN ? `<div class="panel" style="margin-bottom:12px"><b>✓ ${savedN} carte${savedN > 1 ? 's' : ''} enregistrée${savedN > 1 ? 's' : ''}</b> dans ta collection.
          ${leftN ? ` Il reste ${leftN} carte${leftN > 1 ? 's' : ''} ${burst ? 'dans la rafale' : 'sur cette page'} : coche celles que tu veux ajouter, corrige-les si besoin, puis enregistre à nouveau.` : ''}
          <div class="row" style="margin-top:8px"><button class="btn sm primary" id="b-next">${burst ? 'Nouvelle rafale' : 'Page suivante'}</button><a class="btn sm" href="#/collection">Voir mon Dex</a></div></div>` : ''}
        <div class="row" style="margin-bottom:10px"><h3 style="margin:0">${burst ? `Cartes capturées <span class="muted small">(${cells.length})</span>` : 'Résultat de la page'}</h3><span class="spacer"></span>
          ${!running && cells.length && (!burst || cells.length >= 2) ? `<button class="btn sm" id="b-sv-open">${toCheck().length === 1 ? 'Vérifier la carte douteuse' : toCheck().length ? `Vérifier les ${toCheck().length} cartes douteuses` : 'Récapitulatif'}</button>` : ''}
          ${!running && cells.length ? `<button class="btn sm ghost" id="b-all">Tout cocher</button><button class="btn sm ghost" id="b-none">Tout décocher</button>
            <span class="muted small">${chosen.length} carte${chosen.length > 1 ? 's' : ''} à enregistrer</span>` : ''}</div>
        ${detected ? `<div class="detect-bar small">${App.icons.icon('layers', 15)}<span>${detected.auto ? `Série devinée : <b>${esc(detected.name)}</b> (d’après ${detected.nb} cartes de la page). Les cartes incertaines ont été recomparées à cette série.` : `Cartes incertaines recomparées à <b>${esc(detected.name)}</b>.`}</span>
          ${running ? '' : '<button class="btn sm ghost" id="b-undo-series">Ce n’est pas la bonne série : annuler</button>'}</div>` : ''}
        ${!running && cells.length && !detected && cells.some((c) => !c.saved && ['verifier', 'inconnue'].includes(c.state)) ? `<div class="row small" style="margin:0 0 10px;gap:6px"><span class="muted">Des cartes à vérifier ? Si la page vient d’une seule série :</span>
          <select id="b-set-after" style="max-width:220px"><option value="">Choisir la série…</option></select></div>` : ''}
        <div class="btiles" style="grid-template-columns:repeat(${cols}, minmax(0, 1fr))">
          ${cells.map((c) => {
            const [lab, cls] = stateLabel[c.state];
            const cur = c.cands.find((x) => x.id === c.choice);
            const own = cur && App.col.get(game, cur.id);
            const repeat = cur && cells.some((o) => o.i < c.i && o.choice === c.choice);
            const m = modeOf(c);
            if (c.saved) {
              return `<div class="btile saved" data-i="${c.i}">
                <div class="bimgs"><img src="${c.url}" alt=""><img src="${esc(ad.img.card(cur, 'low'))}" alt="" data-alt=""></div>
                <div class="bstate ok">${c.i + 1}. Enregistrée ✓</div>
                <div class="small"><b>${esc(cur ? cur.name : '')}</b> <span class="muted">${esc(cur && cur.set ? cur.set.name : '')}</span></div>
                ${c.vers && c.vers.length ? `<div class="small">${App.icons.icon('sparkles', 12)} ${c.vers.map((v) => ({ normal: 'Normale', reverse: 'Reverse', holo: 'Holo', firstEdition: '1ʳᵉ édition' }[v] || v)).join(' · ')} <button class="linkbtn small" data-open-card="${esc(cur.id)}">modifier</button></div>` : ''}
                ${c.cert === 'encours' ? `<div class="small muted">${App.icons.icon('shield', 12)} Certification…</div>`
                  : c.cert === 'ok' ? `<div class="small cert-ok">${App.icons.icon('shield', 13)} Certifiée</div>`
                  : c.cert ? `<div class="small muted">${App.icons.icon('shield', 12)} Non certifiée : ${esc(c.cert)}${cur ? ` · <a href="#/scan?carte=${encodeURIComponent(cur.id)}">la capturer seule</a>` : ''}</div>` : ''}
                ${c.photoId && photo ? `<button class="btn sm ghost" data-recrop="${c.i}">✂ Recadrer</button>` : ''}
              </div>`;
            }
            const canCheck = !!c.choice && !['attente', 'lecture'].includes(c.state);
            // animation d'attente : rayon de scan pendant la lecture, points clés pendant la vérification par l'image,
            // petit éclat quand la carte vient d'être trouvée (seulement la carte en cours : batterie)
            const scan = c.vscan ? 'scan-img' : c.state === 'lecture' ? 'scan-txt' : '';
            const found = c.found && Date.now() - c.found < 1200;
            return `<div class="btile ${(['vide', 'dos', 'autre'].includes(c.state) && !c.choice) || (canCheck && !c.checked) ? 'dim' : ''} ${c.checked && c.choice ? 'on' : ''} ${c.state === 'attente' ? 'bwait' : ''} ${found ? 'bfound' : ''}" data-i="${c.i}">
              ${canCheck ? `<label class="bcheck"><input type="checkbox" data-check="${c.i}" ${c.checked ? 'checked' : ''}> Ajouter</label>` : ''}
              <div class="bimgs">
                <span class="bphoto ${scan}"><img src="${c.url}" alt="Ta carte ${c.i + 1}">${scan ? `<i class="bscan"></i>${scan === 'scan-img' ? '<i class="bdot"></i>'.repeat(7) : ''}` : ''}</span>
                ${cur ? `<img class="bofficial" src="${esc(ad.img.card(cur, 'low'))}" alt="Visuel officiel" data-alt="" title="Visuel officiel">` : '<span class="bnone">?</span>'}
              </div>
              <div class="bstate ${cls}">${c.i + 1}. ${lab}${c.visId && c.choice === c.visId ? ' <span class="muted">· image ✓</span>' : ''}${c.info ? ` <span class="muted">· ${esc(R.readSummary(c.info))}</span>` : ''}</div>
              ${['attente', 'lecture', 'dos', 'autre'].includes(c.state) && !c.choice ? (['dos', 'autre'].includes(c.state) ? `<button class="btn sm" data-notback="${c.i}">${c.state === 'dos' ? 'Ce n’est pas un dos' : 'C’est une carte Pokémon'} : la reconnaître</button><button class="btn sm ghost" data-find="${c.i}">🔎 Chercher à la main</button>
                <div class="bsearch hidden" data-box="${c.i}"><input type="text" placeholder="Nom" data-name="${c.i}"><input type="text" placeholder="N° ex. 025/165" data-num="${c.i}"><button class="btn sm" data-dosearch="${c.i}">OK</button></div>` : '') : `
                <select data-choice="${c.i}">
                  <option value="">— Ne pas ajouter —</option>
                  ${c.cands.map((x) => `<option value="${esc(x.id)}" ${x.id === c.choice ? 'selected' : ''}>${esc(x.name)} · ${esc(App.views.scan.setLabel(x))} · ${esc(x.localId)}</option>`).join('')}
                </select>
                ${versHtml(c, cur)}
                ${cur ? `<button class="btn sm ghost" data-versions="${c.i}">Toutes les versions de « ${esc(cur.name)} »</button>` : ''}
                ${own || repeat ? `<select data-mode="${c.i}" title="Carte déjà possédée ou en double">
                    ${(own ? ['rien', 'photo', 'doublon'] : ['doublon', 'rien']).map((k) => `<option value="${k}" ${k === m ? 'selected' : ''}>${k === 'doublon' && repeat && !own ? '2e exemplaire sur la page (doublon)' : k === 'rien' && !own ? 'Ne pas la compter' : modeLabels[k]}</option>`).join('')}
                  </select>
                  ${own ? `<div class="small muted">Tu l’as déjà (×${own.qty})</div>` : ''}` : ''}
                ${photo && c.box ? `<button class="btn sm ghost" data-recrop="${c.i}">✂ Recadrer depuis la page</button>` : ''}
                <button class="btn sm ghost" data-find="${c.i}">🔎 Chercher une autre carte</button>
                <div class="bsearch hidden" data-box="${c.i}">
                  <input type="text" placeholder="Nom" data-name="${c.i}">
                  <input type="text" placeholder="N° ex. 025/165" data-num="${c.i}">
                  <button class="btn sm" data-dosearch="${c.i}">OK</button>
                </div>`}
            </div>`;
          }).join('')}
        </div>
        ${burst ? '' : timingHtml()}
        ${!running && cells.length ? `<div class="row action-dock" style="margin-top:16px">
          <button class="btn primary" id="b-add" ${chosen.length ? '' : 'disabled'}>✓ Enregistrer ${chosen.length} carte${chosen.length > 1 ? 's' : ''} dans mon Dex</button>
          <span class="muted small">${chosen.length ? 'Vérifie les cartes cochées, puis enregistre.' : 'Coche les cartes à ajouter.'}</span>
        </div>` : ''}`;
      const sa = resultsEl.querySelector('#b-set-after'); if (sa && allSets) App.views.scan.fillSetSelect(sa, allSets);
      // brillance des cartes reconnues (ou changées) : mesurée en arrière-plan, affichée dès qu'elle est prête
      for (const c of cells) {
        if (c.saved || !c.choice || c.state === 'lecture' || (c.det && c.det.id === c.choice)) continue;
        measureVers(c).then(() => { if (alive()) setTimeout(drawResults, 0); }); // (setTimeout : la page garde la main entre deux mesures)
      }
    }

    resultsEl.addEventListener('change', async (e) => {
      if (e.target.id === 'b-set-after' && e.target.value && !running) {
        const opt = e.target.selectedOptions[0];
        running = true;
        await applySeries(e.target.value, opt.textContent.replace(/\s*\(\d{4}\)$/, ''), 0, false);
        if (!burst && alive()) await visualPass(e.target.value);
        running = false; setStatus(''); drawResults();
        return;
      }
      const ck = e.target.closest('[data-check]');
      if (ck) { cells[+ck.dataset.check].checked = ck.checked; drawResults(); return; }
      const md = e.target.closest('[data-mode]');
      if (md) { cells[+md.dataset.mode].mode = md.value; drawResults(); return; }
      // version corrigée à la main (normale / holo / reverse, 1re édition)
      const vb = e.target.closest('[data-vbase]');
      if (vb) { const c = cells[+vb.dataset.vbase]; if (c.det) { c.det.base = vb.value; c.det.user = true; } drawResults(); return; }
      const vf = e.target.closest('[data-vfe]');
      if (vf) { const c = cells[+vf.dataset.vfe]; if (c.det) { c.det.fe = vf.checked; c.det.user = true; } drawResults(); return; }
      const s = e.target.closest('[data-choice]'); if (!s) return;
      const cell = cells[+s.dataset.choice];
      cell.choice = s.value; cell.mode = null; cell.checked = !!s.value; // choisir une carte à la main = la cocher
      drawResults();
    });
    resultsEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.closest('[data-name],[data-num]')) resultsEl.querySelector(`[data-dosearch="${e.target.dataset.name || e.target.dataset.num}"]`).click();
    });
    resultsEl.addEventListener('click', async (e) => {
      if (e.target.closest('#b-sv-open')) { const l = toCheck(); if (l.length) svOpen('review', { list: l, idx: 0 }); else svOpen('recap'); return; }
      if (e.target.closest('#b-next')) { if (burst) resetBurst(); else el.querySelector('#b-reset').click(); return; }
      if (e.target.closest('#b-all')) { cells.forEach((c) => { if (c.choice && !c.saved) c.checked = true; }); drawResults(); return; }
      if (e.target.closest('#b-none')) { cells.forEach((c) => { c.checked = false; }); drawResults(); return; }
      if (e.target.closest('#b-undo-series')) { undoSeries(); return; }
      const nbk = e.target.closest('[data-notback]');
      if (nbk && !running) {
        const cell = cells[+nbk.dataset.notback];
        running = true; drawResults();
        await recogCell(cell, el.querySelector('#b-set').value || (detected && detected.id) || '', true);
        if (cell.state === 'vide') cell.state = 'inconnue';
        running = false; setStatus(''); drawResults();
        return;
      }
      const vb = e.target.closest('[data-versions]');
      if (vb) {
        const cell = cells[+vb.dataset.versions];
        const cur = cell.cands.find((x) => x.id === cell.choice);
        if (!cur) return;
        vb.disabled = true; vb.textContent = 'Chargement…';
        const list = await ad.versions(cur.name).catch(() => []);
        const seen = new Set(list.map((x) => x.id));
        cell.cands = [...list, ...cell.cands.filter((x) => !seen.has(x.id))];
        App.util.toast(`${list.length} versions de ${cur.name} dans la liste : choisis la bonne`);
        drawResults();
        const s = resultsEl.querySelector(`[data-choice="${cell.i}"]`); if (s) s.focus();
        return;
      }
      const f = e.target.closest('[data-find]');
      if (f) { resultsEl.querySelector(`[data-box="${f.dataset.find}"]`).classList.toggle('hidden'); return; }
      const d = e.target.closest('[data-dosearch]');
      if (d) {
        const cell = cells[+d.dataset.dosearch];
        d.disabled = true; d.textContent = '…';
        try {
          const cands = await R.manual(cell.blob, resultsEl.querySelector(`[data-name="${cell.i}"]`).value, resultsEl.querySelector(`[data-num="${cell.i}"]`).value);
          if (!cands.length) { App.util.toast('Aucune carte trouvée'); }
          else { cell.cands = cands; cell.choice = cands[0].id; cell.state = 'verifier'; cell.checked = true; }
        } catch (err) { App.util.toast(err.message); }
        drawResults();
        return;
      }
      const rc = e.target.closest('[data-recrop]');
      if (rc && !running) {
        const cell = cells[+rc.dataset.recrop];
        const nb = await App.ui.cropImage(photo.blob, { title: `Recadrer la carte ${cell.i + 1}`, initial: cell.box, withBox: true });
        if (!nb) return;
        cell.box = nb.box;
        if (cell.saved) {
          await App.col.replacePhoto(cell.key, cell.photoId, nb.blob);
          if (pageId) await App.col.setPhotoSource(cell.key, cell.photoId, { page: pageId, rect: cell.box });
          cell.blob = nb.blob; cell.url = URL.createObjectURL(cell.blob); urls.push(cell.url);
          App.util.toast('Photo recadrée ✓');
          drawResults();
          return;
        }
        cell.blob = nb.blob; cell.url = URL.createObjectURL(cell.blob); urls.push(cell.url); cell.auto = true;
        running = true; drawResults();
        await recogCell(cell, el.querySelector('#b-set').value || (detected && detected.id) || '');
        running = false; setStatus(''); drawResults();
        return;
      }
      if (e.target.closest('#b-add')) {
        const todo = cells.filter((c) => c.choice && modeOf(c) !== 'rien').map((c) => ({ c, mode: modeOf(c) }));
        e.target.disabled = true;
        const keys = [];
        // la page est gardée sur cet appareil : on pourra recadrer une carte depuis sa fiche
        if (!pageId && photo) { try { pageId = await App.col.keepPage(photo.blob); } catch (err) { console.warn(err); } }
        for (const { c, mode } of todo) {
          const cand = c.cands.find((x) => x.id === c.choice);
          if (!cand) continue;
          const picked = c.det && c.det.id === cand.id ? versOf(c) : null; // version vue (et corrigée) dans la liste
          const key = await R.addScanned(picked && picked.length ? { ...cand, pickedVariants: picked } : cand, c.blob, mode === 'nouvelle' ? null : mode);
          c.vers = mode === 'rien' ? null : (R.lastVariants ? R.lastVariants.list : null);
          keys.push(key);
          const it = App.col.byKey(key);
          c.key = key; c.cand = cand;
          c.photoId = mode === 'rien' ? null : it.photos[it.photos.length - 1];
          if (c.photoId && pageId && c.box) await App.col.setPhotoSource(key, c.photoId, { page: pageId, rect: c.box });
        }
        App.col.refreshPrices([...new Set(keys)], 'Prix');
        // les cartes enregistrées restent affichées (marquées ✓) : on peut continuer avec les autres
        for (const { c } of todo) {
          c.saved = true; c.checked = false;
          const pc = burst ? c.live : pageCert; c.pc = pc;
          c.cert = !App.cloud.enabled || !c.photoId ? '' : !App.cloud.user ? 'connecte-toi pour certifier'
            : !pc ? (burst ? (c.live === null ? 'certification désactivée' : 'photo importée') : 'page non certifiée (bouton « Photo certifiée » pour le badge)')
            : !pc.passed ? pc.reasons[0] : 'encours';
          if (c.cert && c.cert !== 'encours') App.certify.note(c.key, c.photoId, c.cert === 'photo importée' ? 'photo importée depuis la galerie' : c.cert);
        }
        // certification des cartes bien reconnues (l'une après l'autre, en arrière-plan)
        (async () => {
          for (const { c } of todo) {
            if (c.cert !== 'encours') continue;
            const ident = await App.certify.identity(c.blob, c.cand);
            const r = await App.certify.finish(c.key, c.photoId, c.pc, ident);
            c.cert = r.ok ? 'ok' : r.reason;
            if (alive()) drawResults();
          }
        })();
        App.util.toast(`${keys.length} carte${keys.length > 1 ? 's' : ''} enregistrée${keys.length > 1 ? 's' : ''} ✓`);
        drawResults();
        resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });

    // ---------- Rafale : la caméra reste ouverte, chaque carte immobile est prise toute seule ----------
    let rTimer = null, rBusy = false, rPrev = null, rStable = 0, rLast = null, rQueue = Promise.resolve(), rPending = 0;
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
    let rTrk = null; // certification « dos d'abord » (si « Certifier chaque carte » est coché)
    const wantCert = () => certOn && el.querySelector('#r-cert') && el.querySelector('#r-cert').checked;
    function rTick() {
      if (rBusy || !cam.on) return;
      const F = rGrab(); if (!F) return;
      let mean = 0; for (const v of F) mean += v; mean /= F.length;
      let sd = 0; for (const v of F) sd += (v - mean) ** 2; sd = Math.sqrt(sd / F.length);
      const diff = rPrev ? mad(F, rPrev) : 99; rPrev = F;
      if (wantCert()) {
        // chaque carte : le dos, on la retourne, on la tient immobile → prise et certifiée toute seule
        if (!rTrk) rTrk = App.certify.tracker(cam.video, () => cam.region(), { auto: true });
        const ph = rTrk.step();
        if (ph === 'pret') { if (rLast && sameCard(rLast, F)) { rTrk.reset(); rHint(`Carte ${cells.length} prise ✓ — passe à la suivante`, 'ok'); return; } rCapture(F, true); return; }
        if (ph === 'lampe') { rHint('💡 Ne bouge pas : la lampe clignote…', 'go'); return; }
        if (ph === 'dos') { rHint('Retourne-la !', 'go'); return; }
        if (ph === 'retourne') { rHint('Tiens-la immobile…', 'go'); return; }
        if (rLast && sd >= 16 && sameCard(rLast, F)) { rHint(`Carte ${cells.length} prise ✓ — montre le dos de la suivante`, 'ok'); return; }
        rHint(sd < 16 ? 'Montre le <b>dos</b> d’une carte dans le cadre' : 'Montre d’abord le <b>dos</b>, puis retourne la carte');
        return;
      }
      if (sd < 16) { rStable = 0; rHint('Présente une carte dans le cadre'); return; }
      if (diff > 4 + sd * 0.08) { rStable = 0; rHint('Tiens la carte immobile…'); return; }
      if (++rStable < 4) { rHint('Ne bouge plus…', 'go'); return; }
      if (rLast && sameCard(rLast, F)) { rHint(`Carte ${cells.length} prise ✓ — passe à la suivante`, 'ok'); return; }
      rCapture(F, false);
    }
    async function rCapture(F, flipped) {
      rBusy = true; rStable = 0;
      rHint(`📸 Carte ${cells.length + 1} !`, 'ok');
      view.classList.add('r-flash'); setTimeout(() => view.classList.remove('r-flash'), 260);
      App.sfx.click(); try { if (navigator.vibrate) navigator.vibrate(25); } catch (e) { /* */ }
      try {
        const b = await cam.capture();
        if (!b) return;
        let live = null;
        if (flipped && rTrk) {
          try { live = await rTrk.proof(); } catch (e) { console.warn(e); live = { passed: false, reasons: ['vérification impossible'] }; }
          rTrk.reset();
          App.certify.prepare(); // défi de la carte suivante, préparé d'avance
        }
        rLast = F;
        const img = await createImageBitmap(b);
        const zone = { x: GM, y: GM, w: 1 - 2 * GM, h: 1 - 2 * GM };
        const cut = R.cutCard(img, zone); // détourée au ras des bords, sinon recadrée au plus près
        const r = cut ? { ...cut, auto: true } : R.cellCard(img, zone);
        const blob = await new Promise((res) => r.canvas.toBlob(res, 'image/jpeg', 0.9));
        addBurstCell(blob, r.auto, live);
        if (flipped) rHint(live && live.passed ? `${App.icons.icon('shield', 13)} Carte ${cells.length} vérifiée — suivante !` : `Carte ${cells.length} prise (non certifiable) — suivante !`, live && live.passed ? 'ok' : '');
      } catch (e) { console.warn(e); }
      finally { rPrev = null; rBusy = false; }
    }
    function addBurstCell(blob, auto, live) {
      if (!cells.length) resultsEl.innerHTML = '';
      const cell = { i: cells.length, blob, url: URL.createObjectURL(blob), auto, box: null, state: 'attente', cands: [], choice: '', info: null, mode: null, live };
      urls.push(cell.url); cells.push(cell); if (prog) prog.total = cells.length;
      rPending++; running = true; drawResults();
      rQueue = rQueue.then(async () => {
        if (stopped || !alive()) return;
        cell.state = 'lecture'; prog = { step: 'Lecture des cartes', done: cell.i, total: cells.length }; drawResults();
        try { await recogOne(cell, el.querySelector('#b-set').value, () => {}); } catch (e) { console.error(e); cell.state = 'erreur'; cell.error = e.message; }
        if (['sure', 'verifier'].includes(cell.state)) cell.found = Date.now();
        if (--rPending <= 0) { rPending = 0; running = false; prog = null; }
        if (alive()) drawResults();
        if (!running && sv.open && sv.mode === 'scan') svAfterScan(); // écran d'analyse ouvert : cartes douteuses, puis récapitulatif
      });
    }
    function rStop() {
      if (rTimer) { clearInterval(rTimer); rTimer = null; }
      cam.stop();
      if (burst) {
        view.innerHTML = App.views.scan.empty('rafale');
        el.querySelector('#r-start').classList.remove('hidden');
        el.querySelector('#r-start').innerHTML = `${App.icons.icon('camera', 16)} ${cells.length ? 'Reprendre la rafale' : 'Démarrer la rafale'}`;
        el.querySelector('#r-pause').classList.add('hidden');
      }
    }
    function resetBurst() {
      if (running) return;
      rStop(); cells = []; rLast = null; detected = null;
      resultsEl.innerHTML = App.views.scan.guide('rafale'); setStatus('');
    }
    if (burst) {
      el.querySelector('#r-start').addEventListener('click', async () => {
        if (sv.open) svClose(); // on reprend la rafale : l'écran d'analyse se ferme
        try { await cam.start(); }
        catch (e) { setStatus(`<b>Caméra indisponible.</b><br><span class="small muted">${esc(e.message)}. Autorise la caméra, ou utilise « Choisir des photos ».</span>`); return; }
        App.sfx.unlock();
        view.insertAdjacentHTML('beforeend', '<div class="r-live">Présente une carte dans le cadre</div>');
        if (certOn) App.certify.prepare();
        rPrev = null; rStable = 0;
        rTrk = null;
        rTimer = setInterval(rTick, 100);
        el.querySelector('#r-start').classList.add('hidden');
        el.querySelector('#r-pause').classList.remove('hidden');
        window.scrollTo({ top: Math.max(0, view.getBoundingClientRect().top + window.scrollY - 70), behavior: 'smooth' });
      });
      el.querySelector('#r-pause').addEventListener('click', () => { rStop(); if (cells.length >= 2) burstReview(); else if (cells.length) resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
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
            const r = R.cellCard(img, cell);
            const blob = await new Promise((res) => r.canvas.toBlob(res, 'image/jpeg', 0.9));
            addBurstCell(blob, r.auto || !!found, undefined);
          } catch (err) { console.warn(err); }
        }
        if (files.length - pages >= 2) burstReview(); // plusieurs cartes : l'écran d'analyse
        if (pages) App.util.toast(`${pages} photo${pages > 1 ? 's' : ''} de page${pages > 1 ? 's' : ''} ignorée${pages > 1 ? 's' : ''} : utilise « Page de classeur » pour celles-là`);
      });
    }

    return () => { stopped = true; lockScroll(false); if (rTimer) clearInterval(rTimer); cam.stop(); urls.forEach((u) => URL.revokeObjectURL(u)); };
  },
};
