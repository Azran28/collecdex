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
      <div class="se-frame ${mode === 'classeur' ? 'grid' : ''}">${mode === 'classeur' ? '<i></i>'.repeat(9) : App.icons.icon('capture', 40)}</div>
      <b>${mode === 'classeur' ? 'Photo d’une page de classeur' : 'Photo de ta carte'}</b>
      <span>Appuie sur « Caméra » ou « Choisir une photo »</span>
    </div>`;
  },

  /** Mode d'emploi affiché à côté de la photo tant qu'il n'y a pas de résultat */
  guide(mode) {
    const steps = mode === 'classeur'
      ? [['camera', 'Photographie la page entière', 'Bien à plat, de face, sans reflet. La page doit remplir la photo.'],
        ['dex', 'Ajuste la grille', 'Glisse-la sur les pochettes et tire ses coins ronds : une case par carte.'],
        ['search', 'Vérifie et enregistre', 'Les cartes sûres sont cochées d’office. Corrige les autres si besoin.']]
      : [['camera', 'Prends la carte en photo', 'Bien à plat, bien éclairée, sans reflet sur le numéro en bas.'],
        ['capture', 'Ajuste le cadre jaune', 'Il doit entourer la carte, bords compris.'],
        ['search', 'Confirme la carte', 'Le site lit le numéro et le nom, puis compare l’illustration.']];
    const certOn = App.certify && App.certify.available();
    return `<div class="panel scan-guide-panel">
      <h3 style="margin-top:0">Comment ça marche</h3>
      <ol class="sg-steps">${steps.map(([ic, t, d], i) => `<li><span class="sg-n">${i + 1}</span><span class="sg-ic">${App.icons.icon(ic, 18)}</span><span><b>${t}</b><br><span class="muted small">${d}</span></span></li>`).join('')}</ol>
      <div class="sg-cert">${App.icons.icon('shield', 18)}<div><b>Carte certifiée</b><br><span class="small muted">${certOn
        ? 'Utilise le bouton « Caméra » du site et suis la consigne après la photo (2 secondes) : tes cartes bien reconnues recevront le badge.'
        : App.cloud && App.cloud.enabled ? '<a href="#/compte">Connecte-toi</a>, puis utilise le bouton « Caméra » du site : tes cartes recevront le badge « Certifiée ».' : 'Avec un compte, les cartes capturées en direct reçoivent le badge « Certifiée ».'}</span></div></div>
      ${mode === 'classeur' ? '<p class="small muted" style="margin:10px 0 0">Astuce : si ta page ne contient qu’une série, choisis-la dans « Série de la page ».</p>' : '<p class="small muted" style="margin:10px 0 0">Astuce : si tu connais la série, choisis-la au-dessus : c’est bien plus fiable.</p>'}
    </div>`;
  },

  /** « Set de Base (1999) » */
  setLabel(c) { return c.set ? `${c.set.name}${c.set.releaseDate ? ' (' + c.set.releaseDate.slice(0, 4) + ')' : ''}` : (c.setId || ''); },

  async render(el, params, alive) {
    const mode = params.query.mode === 'classeur' ? 'classeur' : 'carte';
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
          <span class="mc-txt"><b>Page de classeur</b><span>Jusqu’à 12 cartes d’un coup</span></span>
          ${mode === 'classeur' ? `<span class="mc-check">${App.icons.icon('shield', 14)}</span>` : ''}
        </a>
      </div>
      <div id="sc-body"></div>`;
    const body = el.querySelector('#sc-body');
    const cleanup = mode === 'classeur' ? await App.views.scan.batch(body, params, alive) : await App.views.scan.single(body, params, alive);
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
          <div class="row" style="margin-top:14px" id="sc-actions">
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
        setStatus(App.certify.available() ? `<span class="small">${App.icons.icon('shield', 14)} <b>Capture certifiée</b> : après la photo, garde la carte dans le cadre et suis la consigne à l’écran (2 secondes).</span>` : '');
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
        const size = initial || (Math.abs(ar - RATIO) < 0.06 ? 1 : 0.9); // photo déjà au format carte → toute l'image
        crop = { img, url, box: view.querySelector('.crop-box'), cx: 0.5, cy: 0.5, size };
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
        const what = mode === 'photo' ? 'Photo de <b>' + esc(c.name) + '</b> mise à jour.' : mode === 'doublon' ? `<b>✓ ${esc(c.name)}</b> : doublon ajouté (×${it.qty}).` : `<b>✓ ${esc(c.name)}</b> ajoutée à ton Dex, avec ta photo.`;
        const certLine = !App.cloud.enabled ? '' : !App.cloud.user ? `<div class="small muted" style="margin-top:6px">${App.icons.icon('shield', 13)} <a href="#/compte">Connecte-toi</a> pour certifier tes captures.</div>`
          : myCert ? `<div class="small" id="sc-cert" style="margin-top:6px">${App.icons.icon('shield', 13)} ${myCert.passed ? 'Certification en cours…' : 'Non certifiée : ' + esc(myCert.reasons.join(', '))}</div>`
          : `<div class="small muted" style="margin-top:6px">${App.icons.icon('shield', 13)} Non certifiée (photo importée). Pour le badge, capture-la avec la caméra.</div>`;
        results.innerHTML = `<div class="panel">${what}${certLine}<br>
          <div class="row"><button class="btn primary" id="sc-again">Capturer la suivante</button>
          <a class="btn" href="#/jeu/${game}/serie/${encodeURIComponent(c.setId || (c.set && c.set.id))}">Voir la série</a></div></div>`;
        el.querySelector('#sc-manual').classList.add('hidden');
        cardBlob = null; target = null; el.querySelector('#sc-target').innerHTML = '';
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
        setStatus('');
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
  async batch(el, params, alive) {
    const { esc } = App.util;
    const R = App.recognizer, RATIO = R.RATIO;
    const game = 'pokemon';
    const ad = App.games.get(game);
    const FORMATS = { '3x3': [3, 3, '9 cartes (3 × 3)'], '2x2': [2, 2, '4 cartes (2 × 2)'], '4x3': [4, 3, '12 cartes (4 × 3)'], '3x4': [3, 4, '12 cartes (3 × 4)'] };
    let fmt = '3x3';
    let photo = null;          // { img, url }
    let grid = null;           // { x, y, w, h } en fraction de l'image affichée
    let cells = [];            // résultats par pochette
    let running = false, stopped = false, detected = null;
    let pageCert = null;       // vérification en direct de la photo de page (null = photo importée)
    let pageId = null;         // page gardée sur cet appareil pour pouvoir recadrer plus tard
    let allSets = null;
    const urls = [];

    el.innerHTML = `
      <div class="batch-wrap">
        <div>
          <div class="set-first">
            <div class="sf-head">${App.icons.icon('layers', 18)}<div><b>De quelle série est cette page ?</b><br><span class="small muted">Si toute la page vient de la même série, choisis-la : la reconnaissance devient bien plus fiable.</span></div></div>
            <select id="b-set"><option value="">Plusieurs séries / je ne sais pas</option></select>
          </div>
          <div class="row" style="margin-bottom:10px">
            <label class="small">Format de la page
              <select id="b-fmt">${Object.entries(FORMATS).map(([k, v]) => `<option value="${k}">${v[2]}</option>`).join('')}</select></label>
          </div>
          <div class="scan-view batch-view" id="b-view">${App.views.scan.empty('classeur')}</div>
          <div class="row" style="margin-top:14px" id="b-actions">
            <button class="btn primary" id="b-cam">${App.icons.icon('camera', 16)} Caméra</button>
            <button class="btn primary hidden" id="b-shot">${App.icons.icon('capture', 16)} Prendre la photo</button>
            <label class="btn">Choisir une photo<input type="file" accept="image/*" capture="environment" id="b-file" hidden></label>
          </div>
          <div id="b-gridbar" class="hidden" style="margin-top:14px">
            <p class="small muted">Glisse la grille pour la déplacer, et ses coins ronds pour l’ajuster : chaque case doit entourer une pochette.</p>
            <div class="row action-dock"><button class="btn primary" id="b-go">▶ Reconnaître les cartes</button><button class="btn ghost" id="b-reset">Reprendre une photo</button></div>
          </div>
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
    const cam = App.views.scan.camera(view, { guide: false });
    const dims = () => FORMATS[fmt];

    // liste des séries pour « Série de la page »
    ad.listSets().then((sets) => {
      allSets = sets;
      let saved = ''; try { saved = sessionStorage.getItem('pageSet') || ''; } catch (e) { /* */ }
      const sel = el.querySelector('#b-set'); if (sel) { App.views.scan.fillSetSelect(sel, sets, saved); sel.closest('.set-first').classList.toggle('chosen', !!sel.value); }
    }).catch(() => {});
    el.querySelector('#b-fmt').addEventListener('change', (e) => { fmt = e.target.value; if (photo && !running) drawGrid(); });
    el.querySelector('#b-set').addEventListener('change', (e) => {
      try { sessionStorage.setItem('pageSet', e.target.value); } catch (err) { /* */ }
      e.target.closest('.set-first').classList.toggle('chosen', !!e.target.value);
    });
    el.querySelector('#b-cam').addEventListener('click', async () => {
      try {
        await cam.start(); el.querySelector('#b-shot').classList.remove('hidden');
        setStatus(App.certify.available() ? `<span class="small">${App.icons.icon('shield', 14)} <b>Page certifiée</b> : après la photo, suis la consigne à l’écran (2 secondes). Les cartes bien reconnues seront certifiées.</span>` : '');
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
        grid = { x: 0.04, y: 0.04, w: 0.92, h: 0.92 };
        drawGrid();
        el.querySelector('#b-actions').classList.add('hidden');
        el.querySelector('#b-gridbar').classList.remove('hidden');
      };
    }
    function drawGrid() {
      const [cols, rows] = dims();
      const box = view.querySelector('.grid-box'); if (!box) return;
      const W = photo.img.clientWidth, H = photo.img.clientHeight;
      Object.assign(box.style, { left: grid.x * W + 'px', top: grid.y * H + 'px', width: grid.w * W + 'px', height: grid.h * H + 'px', gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` });
      box.innerHTML = Array.from({ length: cols * rows }, (_, i) => `<div class="gcell"><span>${i + 1}</span></div>`).join('') +
        ['tl', 'tr', 'bl', 'br'].map((h) => `<span class="gh ${h}" data-h="${h}"></span>`).join('');
    }
    view.addEventListener('pointerdown', (e) => {
      if (!photo || running || !e.target.closest('.crop-area')) return;
      e.preventDefault();
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
    function cellBlob(i) {
      const [cols, rows] = dims();
      const img = photo.img, NW = img.naturalWidth, NH = img.naturalHeight;
      const gx = grid.x * NW, gy = grid.y * NH, cw = grid.w * NW / cols, ch = grid.h * NH / rows;
      const col = i % cols, row = Math.floor(i / cols);
      const rect = { x: gx + col * cw, y: gy + row * ch, w: cw, h: ch };
      let box = null;
      try { box = R.locateCard(img, rect); } catch (e) { console.warn(e); }
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
      for (const cell of cells) {
        if (stopped || !alive()) return;
        cell.state = 'lecture'; drawResults();
        setStatus(`<div class="spinner"></div><div style="text-align:center">Carte ${cell.i + 1} / ${n}…</div>`);
        try {
          if (await R.looksEmpty(cell.blob)) { cell.state = 'vide'; }
          else if (await R.looksLikeBack(cell.blob).catch(() => false)) { cell.state = 'dos'; }
          else {
            const st = (m) => { if (alive()) setStatus(`<div class="spinner"></div><div style="text-align:center">Carte ${cell.i + 1} / ${n} — ${esc(m)}</div>`); };
            let info, cands;
            if (hint) { info = await R.read(cell.blob, st); cands = await R.inSet(cell.blob, info, hint, st); }
            else ({ info, cands } = await R.recognize(cell.blob, st));
            cell.info = info; cell.cands = cands;
            cell.choice = cands[0] ? cands[0].id : '';
            cell.state = !cands.length ? 'inconnue' : cands[0].confident ? 'sure' : 'verifier';
            cell.checked = cell.state === 'sure'; // seules les cartes sûres sont cochées d'office
          }
        } catch (e) { console.error(e); cell.state = 'erreur'; cell.error = e.message; }
        drawResults();
      }
      // Deuxième passe (prudente) : seulement si la page semble clairement rangée par série
      // (au moins 3 cartes SÛRES de la même série, et presque toutes les cartes sûres de cette série).
      if (!hint && alive() && !stopped) {
        const votes = {}; let sureN = 0;
        for (const c of cells) {
          const top = c.cands[0];
          if (c.state !== 'sure' || !top || !top.set) continue;
          sureN++; votes[top.set.id] = (votes[top.set.id] || 0) + 1;
        }
        const [best, nb] = Object.entries(votes).sort((x, y) => y[1] - x[1])[0] || [];
        if (best && nb >= 3 && nb >= sureN * 0.8) {
          const src = cells.find((c) => c.cands[0] && c.cands[0].set && c.cands[0].set.id === best);
          await applySeries(best, src.cands[0].set.name, nb, true);
        }
      }
      running = false;
      el.querySelector('#b-reset').disabled = false; el.querySelector('#b-fmt').disabled = false; el.querySelector('#b-go').disabled = false;
      el.querySelector('#b-set').disabled = false;
      setStatus('');
      drawResults();
    });

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
            const same = cands.find((x) => App.util.norm(x.name) === App.util.norm(old.name));
            if (same) { top = same; sameName = true; cands.splice(cands.indexOf(same), 1); cands.unshift(same); }
          }
          const seen = new Set(cands.map((x) => x.id));
          cell.cands = [...cands, ...cell.before.cands.filter((x) => !seen.has(x.id))].slice(0, 12);
          if (top && (sameName || top.confident)) { cell.choice = top.id; cell.state = top.confident ? 'sure' : 'verifier'; }
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
      attente: ['En attente', ''], lecture: ['Lecture…', ''], vide: ['Pochette vide', 'muted'], dos: ['Dos de carte (ignoré)', 'muted'],
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
          ${leftN ? ` Il reste ${leftN} carte${leftN > 1 ? 's' : ''} sur cette page : coche celles que tu veux ajouter, corrige-les si besoin, puis enregistre à nouveau.` : ''}
          <div class="row" style="margin-top:8px"><button class="btn sm primary" id="b-next">Page suivante</button><a class="btn sm" href="#/collection">Voir mon Dex</a></div></div>` : ''}
        <div class="row" style="margin-bottom:10px"><h3 style="margin:0">Résultat de la page</h3><span class="spacer"></span>
          ${!running && cells.length ? `<button class="btn sm ghost" id="b-all">Tout cocher</button><button class="btn sm ghost" id="b-none">Tout décocher</button>
            <span class="muted small">${chosen.length} carte${chosen.length > 1 ? 's' : ''} à enregistrer</span>` : ''}</div>
        ${detected ? `<div class="detect-bar small">${App.icons.icon('layers', 15)}<span>${detected.auto ? `Série devinée : <b>${esc(detected.name)}</b> (d’après ${detected.nb} cartes sûres). Les cartes incertaines ont été recomparées à cette série.` : `Cartes incertaines recomparées à <b>${esc(detected.name)}</b>.`}</span>
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
                ${c.cert === 'encours' ? `<div class="small muted">${App.icons.icon('shield', 12)} Certification…</div>`
                  : c.cert === 'ok' ? `<div class="small cert-ok">${App.icons.icon('shield', 13)} Certifiée</div>`
                  : c.cert ? `<div class="small muted">${App.icons.icon('shield', 12)} Non certifiée : ${esc(c.cert)}${cur ? ` · <a href="#/scan?carte=${encodeURIComponent(cur.id)}">la capturer seule</a>` : ''}</div>` : ''}
                ${c.photoId && photo ? `<button class="btn sm ghost" data-recrop="${c.i}">✂ Recadrer</button>` : ''}
              </div>`;
            }
            const canCheck = !!c.choice && !['attente', 'lecture'].includes(c.state);
            return `<div class="btile ${(['vide', 'dos'].includes(c.state) && !c.choice) || (canCheck && !c.checked) ? 'dim' : ''} ${c.checked && c.choice ? 'on' : ''}" data-i="${c.i}">
              ${canCheck ? `<label class="bcheck"><input type="checkbox" data-check="${c.i}" ${c.checked ? 'checked' : ''}> Ajouter</label>` : ''}
              <div class="bimgs">
                <img src="${c.url}" alt="Ta carte ${c.i + 1}">
                ${cur ? `<img src="${esc(ad.img.card(cur, 'low'))}" alt="Visuel officiel" data-alt="" title="Visuel officiel">` : '<span class="bnone">?</span>'}
              </div>
              <div class="bstate ${cls}">${c.i + 1}. ${lab}${c.info ? ` <span class="muted">· ${esc(R.readSummary(c.info))}</span>` : ''}</div>
              ${['attente', 'lecture', 'dos'].includes(c.state) && !c.choice ? (c.state === 'dos' ? `<button class="btn sm" data-notback="${c.i}">Ce n’est pas un dos : la reconnaître</button><button class="btn sm ghost" data-find="${c.i}">🔎 Chercher à la main</button>
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
      if (e.target.closest('#b-next')) { el.querySelector('#b-reset').click(); return; }
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
          c.cert = !App.cloud.enabled || !c.photoId ? '' : !App.cloud.user ? 'connecte-toi pour certifier' : !pageCert ? 'photo importée' : !pageCert.passed ? pageCert.reasons[0] : 'encours';
        }
        // certification des cartes bien reconnues (l'une après l'autre, en arrière-plan)
        (async () => {
          for (const { c } of todo) {
            if (c.cert !== 'encours') continue;
            const ident = await App.certify.identity(c.blob, c.cand);
            const r = await App.certify.finish(c.key, c.photoId, pageCert, ident);
            c.cert = r.ok ? 'ok' : r.reason;
            if (alive()) drawResults();
          }
        })();
        App.util.toast(`${keys.length} carte${keys.length > 1 ? 's' : ''} enregistrée${keys.length > 1 ? 's' : ''} ✓`);
        drawResults();
        resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });

    return () => { stopped = true; cam.stop(); urls.forEach((u) => URL.revokeObjectURL(u)); };
  },
};
