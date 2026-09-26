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
  /** Zone photo vide : invitation à prendre la photo */
  empty(mode) {
    return `<div class="scan-empty">
      <div class="se-frame ${mode === 'classeur' ? 'grid' : ''}">${mode === 'classeur' ? '<i></i>'.repeat(9) : App.icons.icon(mode === 'rafale' ? 'rafale' : 'capture', 40)}</div>
      <b>${mode === 'classeur' ? 'Photo d’une page de classeur' : mode === 'rafale' ? 'Tes cartes, l’une après l’autre' : 'Photo de ta carte'}</b>
      <span>${mode === 'rafale' ? 'Appuie sur « Démarrer la rafale » ou « Choisir des photos »' : 'Appuie sur « Caméra » ou « Choisir une photo »'}</span>
    </div>`;
  },

  /** Mode d'emploi affiché à côté de la photo tant qu'il n'y a pas de résultat */
  guide(mode) {
    const steps = mode === 'rafale'
      ? [['rafale', 'Lance la rafale', 'Présente tes cartes une par une dans le cadre jaune : dès qu’une carte est immobile, elle est prise toute seule.'],
        ['shield', 'Suis la flèche', 'Pour la certification : bouge la carte comme indiqué (1 seconde), puis passe à la suivante.'],
        ['search', 'Vérifie et enregistre', 'Les cartes sont lues pendant que tu continues. Les sûres sont cochées d’office.']]
      : mode === 'classeur'
      ? [['camera', 'Photographie la page entière', 'Bien à plat, de face, sans reflet. La page doit remplir la photo.'],
        ['dex', 'La grille se place toute seule', 'Elle trouve les pochettes (et le format de la page). Si elle se trompe, glisse-la ou tire ses coins ronds.'],
        ['search', 'Vérifie et enregistre', 'Les cartes sûres sont cochées d’office. Corrige les autres si besoin.']]
      : [['camera', 'Prends la carte en photo', 'Bien à plat, bien éclairée, sans reflet sur le numéro en bas.'],
        ['capture', 'Ajuste le cadre jaune', 'Il doit entourer la carte, bords compris.'],
        ['search', 'Confirme la carte', 'Le site lit le numéro et le nom, puis compare l’illustration.']];
    const certOn = App.certify && App.certify.available();
    return `<div class="panel scan-guide-panel">
      <h3 style="margin-top:0">Comment ça marche</h3>
      <ol class="sg-steps">${steps.map(([ic, t, d], i) => `<li><span class="sg-n">${i + 1}</span><span class="sg-ic">${App.icons.icon(ic, 18)}</span><span><b>${t}</b><br><span class="muted small">${d}</span></span></li>`).join('')}</ol>
      <div class="sg-cert">${App.icons.icon('shield', 18)}<div><b>Carte certifiée</b><br><span class="small muted">${certOn
        ? 'Utilise le bouton « Caméra » du site et suis la consigne après la photo (1 seconde) : tes cartes bien reconnues recevront le badge.'
        : App.cloud && App.cloud.enabled ? '<a href="#/connexion">Connecte-toi</a>, puis utilise le bouton « Caméra » du site : tes cartes recevront le badge « Certifiée ».' : 'Avec un compte, les cartes capturées en direct reçoivent le badge « Certifiée ».'}</span></div></div>
      ${mode === 'rafale' ? '<p class="small muted" style="margin:10px 0 0">Astuce : si tes cartes viennent toutes de la même série, choisis-la au-dessus : c’est plus rapide et bien plus fiable.</p>' : mode === 'classeur' ? '<p class="small muted" style="margin:10px 0 0">Astuce : si ta page ne contient qu’une série, choisis-la dans « Série de la page ».</p>' : '<p class="small muted" style="margin:10px 0 0">Astuce : si tu connais la série, choisis-la au-dessus : c’est bien plus fiable.</p>'}
    </div>`;
  },

  /** « Set de Base (1999) » */
  setLabel(c) { return c.set ? `${c.set.name}${c.set.releaseDate ? ' (' + c.set.releaseDate.slice(0, 4) + ')' : ''}` : (c.setId || ''); },

  async render(el, params, alive) {
    const mode = ['classeur', 'rafale'].includes(params.query.mode) ? params.query.mode : 'carte';
    el.innerHTML = `
      <div class="breadcrumb"><a href="#/">Accueil</a> › Capturer</div>
      <h1 style="margin:0 0 4px">Capturer</h1>
      <p class="muted small" style="margin:0 0 12px">Prends tes cartes en photo : elles rejoignent ton Dex, avec ta photo comme visuel. Que veux-tu capturer ?</p>
      <div class="mode-pick" role="tablist">
        <a class="mode-card ${mode === 'carte' ? 'on' : ''}" href="#/scan" role="tab" aria-selected="${mode === 'carte'}">
          <span class="mc-ico">${App.icons.icon('capture', 22)}</span>
          <span class="mc-txt"><b>Une carte</b><span>Carte par carte, la plus fiable</span></span>
          ${mode === 'carte' ? `<span class="mc-check">${App.icons.icon('shield', 14)}</span>` : ''}
        </a>
        <a class="mode-card ${mode === 'classeur' ? 'on' : ''}" href="#/scan?mode=classeur" role="tab" aria-selected="${mode === 'classeur'}">
          <span class="mc-ico">${App.icons.icon('dex', 22)}</span>
          <span class="mc-txt"><b>Page de classeur</b><span>Jusqu’à 18 cartes d’un coup</span></span>
          ${mode === 'classeur' ? `<span class="mc-check">${App.icons.icon('shield', 14)}</span>` : ''}
        </a>
        <a class="mode-card ${mode === 'rafale' ? 'on' : ''}" href="#/scan?mode=rafale" role="tab" aria-selected="${mode === 'rafale'}">
          <span class="mc-ico">${App.icons.icon('rafale', 22)}</span>
          <span class="mc-txt"><b>Rafale</b><span>Les cartes défilent, sans cliquer</span></span>
        </a>
      </div>
      <div id="sc-body"></div>`;
    const body = el.querySelector('#sc-body');
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
        <div class="sf-head">${App.icons.icon('layers', 18)}<div><b>Tu connais la série de ta carte ?</b><br><span class="small muted">Facultatif, mais la reconnaissance devient bien plus fiable (surtout pour les cartes réimprimées).</span></div></div>
        <select id="sc-set"><option value="">Je ne sais pas : chercher partout</option></select>
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

    el.querySelector('#sc-cam').addEventListener('click', async () => {
      try {
        await cam.start(); el.querySelector('#sc-shot').classList.remove('hidden'); results.innerHTML = App.views.scan.guide('carte');
        setStatus(App.certify.available() ? `<span class="small">${App.icons.icon('shield', 14)} <b>Capture certifiée</b> : après la photo, garde la carte dans le cadre et suis la consigne à l’écran (1 seconde).</span>` : '');
        App.certify.prepare();
      }
      catch (e) { setStatus(`<b>Caméra indisponible.</b><br><span class="small muted">${esc(e.message)}. Autorise la caméra dans le navigateur, ou utilise « Choisir une photo ».</span>`); }
    });
    el.querySelector('#sc-shot').addEventListener('click', async () => {
      const shot = el.querySelector('#sc-shot');
      const b = await cam.capture(); if (!b) return;
      shot.classList.add('hidden');
      cert = null;
      if (App.certify.available()) {
        setStatus('');
        try { cert = await App.certify.live(cam.video, view, cam.region()); } catch (e) { console.warn(e); cert = { passed: false, reasons: ['vérification impossible'] }; }
      }
      cam.stop();
      startCrop(b, 0.92);
      if (cert) setStatus(cert.passed
        ? `<span class="cert-ok">${App.icons.icon('shield', 16)} Capture en direct vérifiée</span> <span class="small muted">— la carte sera certifiée à l’ajout.</span>`
        : `<span class="small">${App.icons.icon('shield', 14)} <b>Non certifiable</b> : ${App.util.esc(cert.reasons.join(', '))}. <span class="muted">Tu peux quand même l’ajouter, ou reprendre la photo.</span></span>`);
    });
    el.querySelector('#sc-file').addEventListener('change', (e) => { if (e.target.files[0]) { cam.stop(); cert = null; startCrop(e.target.files[0]); } e.target.value = ''; });

    // Recadrage (cadre au format d'une carte, 63 × 88 mm)
    let crop = null;
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
        let cx = 0.5, cy = 0.5;
        // photo importée : le cadre se place tout seul sur la carte (bords trouvés), on peut toujours le déplacer
        if (!initial && !lp.page) {
          try {
            const NW = img.naturalWidth, NH = img.naturalHeight;
            const f = R.locateCard(img, { x: 0, y: 0, w: NW, h: NH }, 0.45);
            if (f && f.h / NH > 0.55) {
              const m = 1.03; // un poil plus grand que la carte : bords compris
              size = Math.min(1, f.h * m / NH); if (f.w * m > NW) size = Math.min(1, f.w * m / NW);
              cx = (f.x + f.w / 2) / NW; cy = (f.y + f.h / 2) / NH;
            }
          } catch (e) { console.warn(e); }
        }
        crop = { img, url, box: view.querySelector('.crop-box'), cx, cy, size };
        el.querySelector('#sc-size').value = Math.round(size * 100);
        placeBox();
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
      c.toBlob((b) => analyse(b), 'image/jpeg', 0.9);
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
              ${!c.isTarget && i === 0 && c.confident ? '<br><span class="pill small" style="background:var(--ok);color:#063">Meilleure correspondance</span>' : ''}${c.visual != null && (c.visual - 0.3) / 0.55 >= 0.15 ? `<br><span class="small muted">Ressemblance avec ta photo : ${Math.round(Math.min(1, (c.visual - 0.3) / 0.55) * 100)} %</span>` : ''}</div>
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

    async function analyse(blob) {
      cardBlob = blob;
      if (cardURL) URL.revokeObjectURL(cardURL);
      cardURL = URL.createObjectURL(blob);
      view.innerHTML = `<img src="${cardURL}" alt="Ta carte">`;
      results.innerHTML = '';
      spin('Lecture de la carte…');
      try {
        const setId = el.querySelector('#sc-set').value;
        let info, cands;
        if (setId) { info = await R.read(blob, spin); cands = await R.inSet(blob, info, setId, spin); }
        else ({ info, cands } = await R.recognize(blob, spin));
        if (!alive()) return;
        setStatus(info.otherGame ? `<span class="small">${App.icons.icon('layers', 14)} <b>Ça ne ressemble pas à une carte Pokémon</b> (autre jeu ?). CollecDex ne reconnaît que les cartes Pokémon pour l’instant : les autres jeux arriveront plus tard.</span>` : '');
        showCandidates(cands, R.readSummary(info));
      } catch (e) {
        console.error(e);
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
    const FORMATS = { '3x3': [3, 3, '9 cartes (3 × 3)'], '2x2': [2, 2, '4 cartes (2 × 2)'], '4x3': [4, 3, '12 cartes (4 × 3)'], '3x4': [3, 4, '12 cartes (3 × 4)'], double: [6, 3, '18 cartes (classeur ouvert, 2 pages)'] };
    const PAGE_FORMATS = Object.fromEntries(Object.entries(FORMATS).filter(([k]) => k !== 'double'));
    let fmt = '3x3';
    let photo = null;          // { img, url }
    let grid = null;           // { x, y, w, h } en fraction de l'image affichée
    let cells = [];            // résultats par pochette
    let running = false, stopped = false, detected = null;
    let autoGrid = false, autoTimer = null;   // grille trouvée toute seule / lancement automatique
    let autoCells = null, autoRot = 0, dimsOv = null; // cases trouvées (photo en biais) ; cartes couchées ; 2 pages en hauteur
    let pageCert = null;       // vérification en direct de la photo de page (null = photo importée)
    let pageId = null;         // page gardée sur cet appareil pour pouvoir recadrer plus tard
    let allSets = null;
    const urls = [];

    const certOn = App.certify.available();
    const setBox = (title, sub) => `<div class="set-first">
            <div class="sf-head">${App.icons.icon('layers', 18)}<div><b>${title}</b><br><span class="small muted">${sub}</span></div></div>
            <select id="b-set"><option value="">Plusieurs séries / je ne sais pas</option></select>
          </div>`;
    // commandes du mode page (gardées cachées en rafale : le code commun s'en sert)
    const pageCtl = `<div class="row" style="margin-bottom:10px">
            <label class="small">Format de la page
              <select id="b-fmt">${Object.entries(FORMATS).map(([k, v]) => `<option value="${k}">${v[2]}</option>`).join('')}</select></label>
          </div>`;
    const pageBtns = `<div class="row action-dock scan-dock" style="margin-top:14px" id="b-actions">
            <button class="btn primary" id="b-cam">${App.icons.icon('camera', 16)} Caméra</button>
            <button class="btn primary hidden" id="b-shot">${App.icons.icon('capture', 16)} Prendre la photo</button>
            <label class="btn">Choisir une photo<input type="file" accept="image/*" capture="environment" id="b-file" hidden></label>
          </div>
          <div id="b-gridbar" class="hidden" style="margin-top:14px">
            <div id="b-auto" class="b-auto hidden"></div>
            <p class="small muted">La grille se place toute seule. Si besoin, glisse-la pour la déplacer et tire ses coins ronds : chaque case doit entourer une pochette.</p>
            <div class="row action-dock"><button class="btn primary" id="b-go">▶ Reconnaître les cartes</button><button class="btn ghost" id="b-reset">Reprendre une photo</button></div>
          </div>`;
    el.innerHTML = burst ? `
      <div class="batch-wrap">
        <div>
          ${setBox('Tes cartes sont de quelle série ?', 'Facultatif : si elles viennent toutes de la même série, la reconnaissance est bien plus fiable.')}
          <div class="scan-view" id="b-view">${App.views.scan.empty('rafale')}</div>
          <div id="r-hint" class="r-hint hidden"></div>
          <div class="row action-dock scan-dock" style="margin-top:14px" id="r-actions">
            <button class="btn primary" id="r-start">${App.icons.icon('camera', 16)} Démarrer la rafale</button>
            <button class="btn hidden" id="r-pause">Pause</button>
            <label class="btn" id="r-files-btn">Choisir des photos<input type="file" accept="image/*" multiple id="r-files" hidden></label>
          </div>
          ${certOn ? `<label class="r-cert small"><input type="checkbox" id="r-cert" checked> ${App.icons.icon('shield', 14)} <span>Certifier chaque carte <span class="muted">(bouger la carte comme indiqué, 1 seconde)</span></span></label>` : ''}
          <div hidden>${pageCtl}${pageBtns}</div>
        </div>
        <div>
          <div id="b-status"></div>
          <div id="b-results">${App.views.scan.guide('rafale')}</div>
        </div>
      </div>` : `
      <div class="batch-wrap">
        <div>
          ${setBox('De quelle série est cette page ?', 'Si toute la page vient de la même série, choisis-la : la reconnaissance devient bien plus fiable.')}
          ${pageCtl}
          <div class="scan-view batch-view" id="b-view">${App.views.scan.empty('classeur')}</div>
          ${pageBtns}
        </div>
        <div>
          <div id="b-status"></div>
          <div id="b-results">${App.views.scan.guide('classeur')}</div>
        </div>
      </div>`;

    const view = el.querySelector('#b-view');
    const statusEl = el.querySelector('#b-status');
    const resultsEl = el.querySelector('#b-results');
    const setStatus = (html) => { statusEl.innerHTML = html ? `<div class="panel" style="margin-bottom:14px">${html}</div>` : ''; };
    const cam = App.views.scan.camera(view, { guide: burst });
    const dims = () => (burst ? [3, 1] : dimsOv || FORMATS[fmt]);
    /** Applique une détection (grille régulière ou cases une par une) */
    function useDetection(g, k) {
      grid = { x: g.x, y: g.y, w: g.w, h: g.h }; autoGrid = true;
      autoCells = g.cells || null; autoRot = g.rot || 0;
      dimsOv = k === 'double' && g.rot ? [3, 6] : null;
    }

    // liste des séries pour « Série de la page »
    ad.listSets().then((sets) => {
      allSets = sets;
      let saved = ''; try { saved = sessionStorage.getItem('pageSet') || ''; } catch (e) { /* */ }
      const sel = el.querySelector('#b-set'); if (sel) { App.views.scan.fillSetSelect(sel, sets, saved); sel.closest('.set-first').classList.toggle('chosen', !!sel.value); }
    }).catch(() => {});
    el.querySelector('#b-fmt').addEventListener('change', (e) => {
      fmt = e.target.value; cancelAuto(); autoCells = null; autoRot = 0; dimsOv = null; autoGrid = false;
      if (photo && !running) {
        let gd = null;
        try { gd = fmt === 'double' ? R.detectDouble(photo.img) : R.detectGrid(photo.img, ...FORMATS[fmt].slice(0, 2)); } catch (err) { console.warn(err); }
        if (gd && gd.fit >= 0.45) useDetection(gd, fmt);
        else if (fmt === 'double') { const t = photo.img.naturalHeight > photo.img.naturalWidth; dimsOv = t ? [3, 6] : null; }
        drawGrid();
      }
    });
    el.querySelector('#b-set').addEventListener('change', (e) => {
      try { sessionStorage.setItem('pageSet', e.target.value); } catch (err) { /* */ }
      e.target.closest('.set-first').classList.toggle('chosen', !!e.target.value);
    });
    el.querySelector('#b-cam').addEventListener('click', async () => {
      try {
        await cam.start(); el.querySelector('#b-shot').classList.remove('hidden');
        setStatus(App.certify.available() ? `<span class="small">${App.icons.icon('shield', 14)} <b>Page certifiée</b> : après la photo, suis la consigne à l’écran (1 seconde). Les cartes bien reconnues seront certifiées.</span>` : '');
        App.certify.prepare('page');
      }
      catch (e) { setStatus(`<b>Caméra indisponible.</b><br><span class="small muted">${esc(e.message)}</span>`); }
    });
    el.querySelector('#b-shot').addEventListener('click', async () => {
      el.querySelector('#b-shot').classList.add('hidden');
      setStatus('<div class="spinner"></div><div style="text-align:center">Photo en haute définition…</div>');
      const b = await cam.photo();
      if (!b) { setStatus(''); el.querySelector('#b-shot').classList.remove('hidden'); return; }
      await new Promise((r) => setTimeout(r, 400)); // le flux reprend après la photo
      let res = null;
      if (App.certify.available()) {
        setStatus('');
        try { res = await App.certify.live(cam.video, view, cam.region(), 'page'); } catch (err) { console.warn(err); res = { passed: false, reasons: ['vérification impossible'] }; }
      }
      cam.stop();
      startGrid(b, res);
    });
    el.querySelector('#b-file').addEventListener('change', (e) => { if (e.target.files[0]) { cam.stop(); startGrid(e.target.files[0], null); } e.target.value = ''; });
    el.querySelector('#b-reset').addEventListener('click', () => {
      if (running) return;
      cancelAuto(); el.querySelector('#b-auto').classList.add('hidden');
      photo = null; grid = null; cells = []; pageCert = null; pageId = null; resultsEl.innerHTML = ''; setStatus('');
      el.querySelector('#b-gridbar').classList.add('hidden');
      el.querySelector('#b-actions').classList.remove('hidden');
      view.innerHTML = App.views.scan.empty('classeur');
      resultsEl.innerHTML = App.views.scan.guide('classeur');
    });

    // photo transmise par le mode « Une carte » (page de classeur détectée)
    if (App._pendingPage) { const b = App._pendingPage; App._pendingPage = null; setTimeout(() => startGrid(b, null), 0); }

    // ---------- Grille ajustable ----------
    function startGrid(blob, cert = null) {
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
        grid = { x: 0.04, y: 0.04, w: 0.92, h: 0.92 }; autoGrid = false; autoCells = null; autoRot = 0; dimsOv = null;
        drawGrid();
        el.querySelector('#b-actions').classList.add('hidden');
        el.querySelector('#b-gridbar').classList.remove('hidden');
        // on cherche la grille tout seul (format compris) ; si c'est sûr, la reconnaissance démarre d'elle-même
        setTimeout(() => {
          let r = null;
          try { r = R.detectPage(img, PAGE_FORMATS, fmt === 'double' ? '3x3' : fmt); } catch (e) { console.warn('grille', e); }
          if (!photo || photo.img !== img) return;
          const found = r && r.grid && r.grid.fit >= 0.38 && r.grid.w > 0.2 && r.grid.h > 0.2;
          const ok = found && r.grid.fit >= 0.45; // assez sûr pour lancer la reconnaissance tout seul
          const auto = el.querySelector('#b-auto');
          if (found) {
            if (r.fmt !== fmt) { fmt = r.fmt; el.querySelector('#b-fmt').value = fmt; }
            useDetection(r.grid, r.fmt); drawGrid();
          }
          if (!ok) { auto.classList.remove('hidden'); auto.innerHTML = `${App.icons.icon('layers', 14)} ${found ? 'Vérifie les cases (glisse la grille si besoin)' : 'Je n’ai pas trouvé la grille tout seul : place-la sur les pochettes'}, puis lance la reconnaissance.`; return; }
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
    function cellBlob(i, rot = autoRot) {
      const [cols, rows] = dims();
      const img = photo.img, NW = img.naturalWidth, NH = img.naturalHeight;
      if (autoGrid && autoCells && autoCells[i]) {
        let r = null; try { r = R.cellCard(img, autoCells[i], rot); } catch (e) { console.warn(e); }
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
      running = true;
      el.querySelector('#b-go').disabled = true; el.querySelector('#b-reset').disabled = true; el.querySelector('#b-fmt').disabled = true;
      const [cols, rows] = dims(), n = cols * rows;
      const hint = el.querySelector('#b-set').value;
      detected = null;
      cells = [];
      for (let i = 0; i < n; i++) {
        const { blob, auto, box } = await cellBlob(i);
        const url = URL.createObjectURL(blob); urls.push(url);
        cells.push({ i, blob, url, auto, box, state: 'attente', cands: [], choice: '', info: null, mode: null });
      }
      drawResults();
      let rotChecked = !autoRot; // cartes couchées : on vérifie le sens (haut de la carte à droite ou à gauche) sur la 1re carte lue
      for (const cell of cells) {
        if (stopped || !alive()) return;
        cell.state = 'lecture'; drawResults();
        setStatus(`<div class="spinner"></div><div style="text-align:center">Carte ${cell.i + 1} / ${n}…</div>`);
        const st = (m) => { if (alive()) setStatus(`<div class="spinner"></div><div style="text-align:center">Carte ${cell.i + 1} / ${n} — ${esc(m)}</div>`); };
        try {
          await recogOne(cell, hint, st);
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
        drawResults();
      }
      // Deuxième passe : la page semble rangée par série → on recompare les cartes incertaines à cette série
      if (!hint && alive() && !stopped) await guessSeries();
      running = false;
      el.querySelector('#b-reset').disabled = false; el.querySelector('#b-fmt').disabled = false; el.querySelector('#b-go').disabled = false;
      el.querySelector('#b-set').disabled = false;
      setStatus('');
      drawResults();
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
    function undoSeries() {
      for (const c of cells) if (c.before && !c.saved) { Object.assign(c, c.before); delete c.before; }
      detected = null; drawResults();
    }

    /** Lecture d'une pochette : vide, dos, autre jeu, ou carte Pokémon (candidats) */
    async function recogOne(cell, hint, st) {
      if (await R.looksEmpty(cell.blob)) { cell.state = 'vide'; return; }
      if (await R.looksLikeBack(cell.blob).catch(() => false)) { cell.state = 'dos'; return; }
      let info, cands;
      if (hint) { info = await R.read(cell.blob, st); cands = await R.inSet(cell.blob, info, hint, st); }
      else ({ info, cands } = await R.recognize(cell.blob, st));
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
          if (hint) { info = await R.read(cell.blob, st); cands = await R.inSet(cell.blob, info, hint, st); }
          else ({ info, cands } = await R.recognize(cell.blob, st));
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

    function drawResults() {
      const [cols] = dims();
      const chosen = cells.filter((c) => c.choice && modeOf(c) !== 'rien');
      const savedN = cells.filter((c) => c.saved).length, leftN = cells.filter((c) => !c.saved && c.choice).length;
      resultsEl.innerHTML = `
        ${savedN ? `<div class="panel" style="margin-bottom:12px"><b>✓ ${savedN} carte${savedN > 1 ? 's' : ''} enregistrée${savedN > 1 ? 's' : ''}</b> dans ta collection.
          ${leftN ? ` Il reste ${leftN} carte${leftN > 1 ? 's' : ''} ${burst ? 'dans la rafale' : 'sur cette page'} : coche celles que tu veux ajouter, corrige-les si besoin, puis enregistre à nouveau.` : ''}
          <div class="row" style="margin-top:8px"><button class="btn sm primary" id="b-next">${burst ? 'Nouvelle rafale' : 'Page suivante'}</button><a class="btn sm" href="#/collection">Voir mon Dex</a></div></div>` : ''}
        <div class="row" style="margin-bottom:10px"><h3 style="margin:0">${burst ? `Cartes capturées <span class="muted small">(${cells.length})</span>` : 'Résultat de la page'}</h3><span class="spacer"></span>
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
            return `<div class="btile ${(['vide', 'dos', 'autre'].includes(c.state) && !c.choice) || (canCheck && !c.checked) ? 'dim' : ''} ${c.checked && c.choice ? 'on' : ''}" data-i="${c.i}">
              ${canCheck ? `<label class="bcheck"><input type="checkbox" data-check="${c.i}" ${c.checked ? 'checked' : ''}> Ajouter</label>` : ''}
              <div class="bimgs">
                <img src="${c.url}" alt="Ta carte ${c.i + 1}">
                ${cur ? `<img src="${esc(ad.img.card(cur, 'low'))}" alt="Visuel officiel" data-alt="" title="Visuel officiel">` : '<span class="bnone">?</span>'}
              </div>
              <div class="bstate ${cls}">${c.i + 1}. ${lab}${c.info ? ` <span class="muted">· ${esc(R.readSummary(c.info))}</span>` : ''}</div>
              ${['attente', 'lecture', 'dos', 'autre'].includes(c.state) && !c.choice ? (['dos', 'autre'].includes(c.state) ? `<button class="btn sm" data-notback="${c.i}">${c.state === 'dos' ? 'Ce n’est pas un dos' : 'C’est une carte Pokémon'} : la reconnaître</button><button class="btn sm ghost" data-find="${c.i}">🔎 Chercher à la main</button>
                <div class="bsearch hidden" data-box="${c.i}"><input type="text" placeholder="Nom" data-name="${c.i}"><input type="text" placeholder="N° ex. 025/165" data-num="${c.i}"><button class="btn sm" data-dosearch="${c.i}">OK</button></div>` : '') : `
                <select data-choice="${c.i}">
                  <option value="">— Ne pas ajouter —</option>
                  ${c.cands.map((x) => `<option value="${esc(x.id)}" ${x.id === c.choice ? 'selected' : ''}>${esc(x.name)} · ${esc(App.views.scan.setLabel(x))} · ${esc(x.localId)}</option>`).join('')}
                </select>
                ${cur ? `<button class="btn sm ghost" data-versions="${c.i}">Toutes les versions de « ${esc(cur.name)} »</button>` : ''}
                ${own || repeat ? `<select data-mode="${c.i}" title="Carte déjà possédée ou en double">
                    ${(own ? ['rien', 'photo', 'doublon'] : ['doublon', 'rien']).map((k) => `<option value="${k}" ${k === m ? 'selected' : ''}>${k === 'doublon' && repeat && !own ? '2e exemplaire sur la page (doublon)' : k === 'rien' && !own ? 'Ne pas la compter' : modeLabels[k]}</option>`).join('')}
                  </select>
                  ${own ? `<div class="small muted">Tu l’as déjà (×${own.qty})</div>` : ''}` : ''}
                ${c.auto === false ? '<div class="small muted">Bords non détectés : centre de la case utilisé</div>' : ''}
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
        ${!running && cells.length ? `<div class="row action-dock" style="margin-top:16px">
          <button class="btn primary" id="b-add" ${chosen.length ? '' : 'disabled'}>✓ Enregistrer ${chosen.length} carte${chosen.length > 1 ? 's' : ''} dans mon Dex</button>
          <span class="muted small">${chosen.length ? 'Vérifie les cartes cochées, puis enregistre.' : 'Coche les cartes à ajouter.'}</span>
        </div>` : ''}`;
      const sa = resultsEl.querySelector('#b-set-after'); if (sa && allSets) App.views.scan.fillSetSelect(sa, allSets);
    }

    resultsEl.addEventListener('change', async (e) => {
      if (e.target.id === 'b-set-after' && e.target.value && !running) {
        const opt = e.target.selectedOptions[0];
        running = true;
        await applySeries(e.target.value, opt.textContent.replace(/\s*\(\d{4}\)$/, ''), 0, false);
        running = false; setStatus(''); drawResults();
        return;
      }
      const ck = e.target.closest('[data-check]');
      if (ck) { cells[+ck.dataset.check].checked = ck.checked; drawResults(); return; }
      const md = e.target.closest('[data-mode]');
      if (md) { cells[+md.dataset.mode].mode = md.value; drawResults(); return; }
      const s = e.target.closest('[data-choice]'); if (!s) return;
      const cell = cells[+s.dataset.choice];
      cell.choice = s.value; cell.mode = null; cell.checked = !!s.value; // choisir une carte à la main = la cocher
      drawResults();
    });
    resultsEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.closest('[data-name],[data-num]')) resultsEl.querySelector(`[data-dosearch="${e.target.dataset.name || e.target.dataset.num}"]`).click();
    });
    resultsEl.addEventListener('click', async (e) => {
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
          const key = await R.addScanned(cand, c.blob, mode === 'nouvelle' ? null : mode);
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
          c.cert = !App.cloud.enabled || !c.photoId ? '' : !App.cloud.user ? 'connecte-toi pour certifier' : !pc ? (burst && c.live === null ? 'certification désactivée' : 'photo importée') : !pc.passed ? pc.reasons[0] : 'encours';
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
    function rTick() {
      if (rBusy || !cam.on) return;
      const F = rGrab(); if (!F) return;
      let mean = 0; for (const v of F) mean += v; mean /= F.length;
      let sd = 0; for (const v of F) sd += (v - mean) ** 2; sd = Math.sqrt(sd / F.length);
      const diff = rPrev ? mad(F, rPrev) : 99; rPrev = F;
      if (sd < 16) { rStable = 0; rHint('Présente une carte dans le cadre'); return; }
      if (diff > 4 + sd * 0.08) { rStable = 0; rHint('Tiens la carte immobile…'); return; }
      if (++rStable < 4) { rHint('Ne bouge plus…', 'go'); return; }
      if (rLast && sameCard(rLast, F)) { rHint(`Carte ${cells.length} prise ✓ — passe à la suivante`, 'ok'); return; }
      rCapture(F);
    }
    async function rCapture(F) {
      rBusy = true; rStable = 0;
      rHint(`📸 Carte ${cells.length + 1} !`, 'ok');
      view.classList.add('r-flash'); setTimeout(() => view.classList.remove('r-flash'), 260);
      App.sfx.click(); try { if (navigator.vibrate) navigator.vibrate(25); } catch (e) { /* */ }
      try {
        const b = await cam.capture();
        if (!b) return;
        let live = null;
        const wantCert = certOn && el.querySelector('#r-cert') && el.querySelector('#r-cert').checked;
        if (wantCert) {
          try { live = await App.certify.live(cam.video, view, cam.region()); } catch (e) { console.warn(e); live = { passed: false, reasons: ['vérification impossible'] }; }
          App.certify.prepare(); // défi de la carte suivante, préparé d'avance
        }
        rLast = F;
        const img = await createImageBitmap(b);
        const r = R.cellCard(img, { x: GM, y: GM, w: 1 - 2 * GM, h: 1 - 2 * GM });
        const blob = await new Promise((res) => r.canvas.toBlob(res, 'image/jpeg', 0.9));
        addBurstCell(blob, r.auto, live);
        if (wantCert) rHint(live && live.passed ? `${App.icons.icon('shield', 13)} Carte ${cells.length} vérifiée — suivante !` : `Carte ${cells.length} prise (non certifiable) — suivante !`, live && live.passed ? 'ok' : '');
      } catch (e) { console.warn(e); }
      finally { rPrev = null; rBusy = false; }
    }
    function addBurstCell(blob, auto, live) {
      if (!cells.length) resultsEl.innerHTML = '';
      const cell = { i: cells.length, blob, url: URL.createObjectURL(blob), auto, box: null, state: 'attente', cands: [], choice: '', info: null, mode: null, live };
      urls.push(cell.url); cells.push(cell);
      rPending++; running = true; drawResults();
      rQueue = rQueue.then(async () => {
        if (stopped || !alive()) return;
        cell.state = 'lecture'; drawResults();
        try { await recogOne(cell, el.querySelector('#b-set').value, () => {}); } catch (e) { console.error(e); cell.state = 'erreur'; cell.error = e.message; }
        if (--rPending <= 0) { rPending = 0; running = false; }
        if (alive()) drawResults();
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
        try { await cam.start(); }
        catch (e) { setStatus(`<b>Caméra indisponible.</b><br><span class="small muted">${esc(e.message)}. Autorise la caméra, ou utilise « Choisir des photos ».</span>`); return; }
        App.sfx.unlock();
        view.insertAdjacentHTML('beforeend', '<div class="r-live">Présente une carte dans le cadre</div>');
        if (certOn) App.certify.prepare();
        rPrev = null; rStable = 0;
        rTimer = setInterval(rTick, 150);
        el.querySelector('#r-start').classList.add('hidden');
        el.querySelector('#r-pause').classList.remove('hidden');
        window.scrollTo({ top: Math.max(0, view.getBoundingClientRect().top + window.scrollY - 70), behavior: 'smooth' });
      });
      el.querySelector('#r-pause').addEventListener('click', () => { rStop(); if (cells.length) resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
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
            const found = R.locateCard(img, { x: 0, y: 0, w: W, h: H }, 0.45);
            const cell = found ? { x: found.x / W, y: found.y / H, w: found.w / W, h: found.h / H } : (() => { const h = Math.min(0.94, 0.94 * W / H / (63 / 88)); const w = h * H / W * (63 / 88); return { x: (1 - w) / 2, y: (1 - h) / 2, w, h }; })();
            const r = R.cellCard(img, cell);
            const blob = await new Promise((res) => r.canvas.toBlob(res, 'image/jpeg', 0.9));
            addBurstCell(blob, r.auto || !!found, undefined);
          } catch (err) { console.warn(err); }
        }
        if (pages) App.util.toast(`${pages} photo${pages > 1 ? 's' : ''} de page${pages > 1 ? 's' : ''} ignorée${pages > 1 ? 's' : ''} : utilise « Page de classeur » pour celles-là`);
      });
    }

    return () => { stopped = true; if (rTimer) clearInterval(rTimer); cam.stop(); urls.forEach((u) => URL.revokeObjectURL(u)); };
  },
};
