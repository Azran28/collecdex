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
  /** « Set de Base (1999) » */
  setLabel(c) { return c.set ? `${c.set.name}${c.set.releaseDate ? ' (' + c.set.releaseDate.slice(0, 4) + ')' : ''}` : (c.setId || ''); },

  async render(el, params, alive) {
    const mode = params.query.mode === 'classeur' ? 'classeur' : 'carte';
    el.innerHTML = `
      <div class="breadcrumb"><a href="#/">Accueil</a> › Capturer</div>
      <div class="row" style="margin-bottom:6px"><h1 style="margin:0">Capturer</h1><span class="spacer"></span>
        <div class="chips">
          <a class="chip ${mode === 'carte' ? 'on' : ''}" href="#/scan">Une carte</a>
          <a class="chip ${mode === 'classeur' ? 'on' : ''}" href="#/scan?mode=classeur">Page de classeur</a>
        </div></div>
      <p class="muted small" style="margin-top:0">Prends ta carte en photo : elle rejoint ton Dex, avec ta photo comme visuel.</p>
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
        view.querySelector('video').srcObject = stream;
      },
      /** Image du flux vidéo ; avec guide, seulement la zone du cadre jaune (+ marge) */
      capture() {
        const v = view.querySelector('video'); if (!v || !v.videoWidth) return null;
        let sx = 0, sy = 0, sw = v.videoWidth, sh = v.videoHeight;
        if (guide) {
          const vr = v.getBoundingClientRect(), gr = view.querySelector('.scan-guide').getBoundingClientRect();
          const scale = Math.min(vr.width / v.videoWidth, vr.height / v.videoHeight);
          const ox = vr.left + (vr.width - v.videoWidth * scale) / 2, oy = vr.top + (vr.height - v.videoHeight * scale) / 2;
          const m = 0.06;
          sx = Math.max(0, (gr.left - ox) / scale - gr.width / scale * m); sy = Math.max(0, (gr.top - oy) / scale - gr.height / scale * m);
          sw = Math.min(v.videoWidth - sx, gr.width / scale * (1 + 2 * m)); sh = Math.min(v.videoHeight - sy, gr.height / scale * (1 + 2 * m));
        }
        const c = document.createElement('canvas'); c.width = sw; c.height = sh;
        c.getContext('2d').drawImage(v, sx, sy, sw, sh, 0, 0, sw, sh);
        return new Promise((res) => c.toBlob(res, 'image/jpeg', 0.95));
      },
      stop() { if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; } },
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

    el.innerHTML = `
      <div id="sc-target"></div>
      <div class="row" style="margin-bottom:12px">
        <label class="small">Série <span class="muted">(facultatif, plus fiable)</span><br>
          <select id="sc-set" style="max-width:320px"><option value="">Je ne sais pas : chercher partout</option></select></label>
      </div>
      <div class="scan-wrap">
        <div>
          <div class="scan-view" id="sc-view"><div class="muted" style="padding:20px;text-align:center">Utilise la caméra ou choisis une photo de ta carte</div></div>
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
            <div class="row"><button class="btn primary" id="sc-crop-ok">✓ Valider le cadrage</button><button class="btn ghost" id="sc-crop-cancel">Reprendre une photo</button></div>
          </div>
        </div>
        <div>
          <div id="sc-status"></div>
          <div id="sc-results"></div>
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
    ad.listSets().then((sets) => App.views.scan.fillSetSelect(el.querySelector('#sc-set'), sets, savedSet)).catch(() => {});
    el.querySelector('#sc-set').addEventListener('change', (e) => { try { sessionStorage.setItem('scanSet', e.target.value); } catch (err) { /* */ } });

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
      try { await cam.start(); el.querySelector('#sc-shot').classList.remove('hidden'); results.innerHTML = ''; setStatus(''); }
      catch (e) { setStatus(`<b>Caméra indisponible.</b><br><span class="small muted">${esc(e.message)}. Autorise la caméra dans le navigateur, ou utilise « Choisir une photo ».</span>`); }
    });
    el.querySelector('#sc-shot').addEventListener('click', async () => {
      const b = await cam.capture(); if (!b) return;
      cam.stop(); el.querySelector('#sc-shot').classList.add('hidden');
      startCrop(b, 0.92);
    });
    el.querySelector('#sc-file').addEventListener('change', (e) => { if (e.target.files[0]) { cam.stop(); startCrop(e.target.files[0]); } e.target.value = ''; });

    // Recadrage (cadre au format d'une carte, 63 × 88 mm)
    let crop = null;
    function startCrop(blob, initial = null) {
      results.innerHTML = ''; setStatus('');
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
      view.innerHTML = '<div class="muted" style="padding:20px;text-align:center">Utilise la caméra ou choisis une photo de ta carte</div>';
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
        const what = mode === 'photo' ? 'Photo de <b>' + esc(c.name) + '</b> mise à jour.' : mode === 'doublon' ? `<b>✓ ${esc(c.name)}</b> : doublon ajouté (×${it.qty}).` : `<b>✓ ${esc(c.name)}</b> ajoutée à ta collection, avec ta photo.`;
        results.innerHTML = `<div class="panel">${what}<br><br>
          <div class="row"><button class="btn primary" id="sc-again">Capturer la suivante</button>
          <a class="btn" href="#/jeu/${game}/serie/${encodeURIComponent(c.setId || (c.set && c.set.id))}">Voir la série</a></div></div>`;
        el.querySelector('#sc-manual').classList.add('hidden');
        cardBlob = null; target = null; el.querySelector('#sc-target').innerHTML = '';
        results.querySelector('#sc-again').onclick = () => { if (location.hash.includes('?')) location.hash = '#/scan'; else { results.innerHTML = ''; setStatus(''); el.querySelector('#sc-cam').click(); } };
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
    const urls = [];

    el.innerHTML = `
      <details class="help"><summary>Comment ça marche ?</summary>
        Prends en photo une page entière de ton classeur, bien à plat, de face et sans reflet. Ajuste la grille sur les pochettes, puis lance la reconnaissance : tu vérifies chaque carte avant de l’ajouter.
        Astuce : l’appareil photo d’un téléphone donne de bien meilleurs résultats qu’une webcam.
      </details>
      <div class="batch-wrap">
        <div>
          <div class="row" style="margin-bottom:10px">
            <label>Format de la page
              <select id="b-fmt">${Object.entries(FORMATS).map(([k, v]) => `<option value="${k}">${v[2]}</option>`).join('')}</select></label>
            <label>Série de la page
              <select id="b-set" style="max-width:220px"><option value="">Détection automatique</option></select></label>
          </div>
          <div class="scan-view batch-view" id="b-view"><div class="muted" style="padding:20px;text-align:center">Photo d’une page de classeur</div></div>
          <div class="row" style="margin-top:14px" id="b-actions">
            <button class="btn primary" id="b-cam">${App.icons.icon('camera', 16)} Caméra</button>
            <button class="btn primary hidden" id="b-shot">${App.icons.icon('capture', 16)} Prendre la photo</button>
            <label class="btn">Choisir une photo<input type="file" accept="image/*" capture="environment" id="b-file" hidden></label>
          </div>
          <div id="b-gridbar" class="hidden" style="margin-top:14px">
            <p class="small muted">Glisse la grille pour la déplacer, et ses coins ronds pour l’ajuster : chaque case doit entourer une pochette.</p>
            <div class="row"><button class="btn primary" id="b-go">▶ Reconnaître les cartes</button><button class="btn ghost" id="b-reset">Reprendre une photo</button></div>
          </div>
        </div>
        <div>
          <div id="b-status"></div>
          <div id="b-results"></div>
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
      const sel = el.querySelector('#b-set'); if (sel) App.views.scan.fillSetSelect(sel, sets);
    }).catch(() => {});
    el.querySelector('#b-fmt').addEventListener('change', (e) => { fmt = e.target.value; if (photo && !running) drawGrid(); });
    el.querySelector('#b-cam').addEventListener('click', async () => {
      try { await cam.start(); el.querySelector('#b-shot').classList.remove('hidden'); }
      catch (e) { setStatus(`<b>Caméra indisponible.</b><br><span class="small muted">${esc(e.message)}</span>`); }
    });
    el.querySelector('#b-shot').addEventListener('click', async () => {
      const b = await cam.capture(); if (!b) return;
      cam.stop(); el.querySelector('#b-shot').classList.add('hidden');
      startGrid(b);
    });
    el.querySelector('#b-file').addEventListener('change', (e) => { if (e.target.files[0]) { cam.stop(); startGrid(e.target.files[0]); } e.target.value = ''; });
    el.querySelector('#b-reset').addEventListener('click', () => {
      if (running) return;
      photo = null; grid = null; cells = []; resultsEl.innerHTML = ''; setStatus('');
      el.querySelector('#b-gridbar').classList.add('hidden');
      el.querySelector('#b-actions').classList.remove('hidden');
      view.innerHTML = '<div class="muted" style="padding:20px;text-align:center">Photo d’une page de classeur</div>';
    });

    // photo transmise par le mode « Une carte » (page de classeur détectée)
    if (App._pendingPage) { const b = App._pendingPage; App._pendingPage = null; setTimeout(() => startGrid(b), 0); }

    // ---------- Grille ajustable ----------
    function startGrid(blob) {
      cells = []; resultsEl.innerHTML = ''; setStatus('');
      const url = URL.createObjectURL(blob); urls.push(url);
      view.innerHTML = `<div class="crop-area"><img src="${url}" alt="Page de classeur"><div class="grid-box"></div></div>`;
      const img = view.querySelector('img');
      img.onload = () => {
        photo = { img, url };
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
      return new Promise((res) => c.toBlob((b) => res({ blob: b, auto: box.auto }), 'image/jpeg', 0.9));
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
        const { blob, auto } = await cellBlob(i);
        const url = URL.createObjectURL(blob); urls.push(url);
        cells.push({ i, blob, url, auto, state: 'attente', cands: [], choice: '', info: null, mode: null });
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
      // Deuxième passe : si plusieurs cartes sûres viennent de la même série, la page est sans doute
      // rangée par série → on recompare les cartes incertaines à toutes les cartes de cette série.
      if (!hint && alive() && !stopped) {
        // Indices : une carte sûre compte 2, une carte « à vérifier » dont le nom a été bien lu compte 1.
        const count = {}, votes = {};
        for (const c of cells) {
          const top = c.cands[0]; if (!top || !top.set) continue;
          const w = c.state === 'sure' ? 2 : (c.state === 'verifier' && (top.nameScore || 0) >= 0.85 ? 1 : 0);
          if (!w) continue;
          count[top.set.id] = (count[top.set.id] || 0) + w; votes[top.set.id] = (votes[top.set.id] || 0) + 1;
        }
        const [best, nb] = Object.entries(count).sort((a, b) => b[1] - a[1])[0] || [];
        const todo = cells.filter((c) => ['verifier', 'inconnue'].includes(c.state) && c.info);
        if (best && nb >= 3 && votes[best] >= 2 && todo.length) {
          const src = cells.find((c) => c.cands[0] && c.cands[0].set && c.cands[0].set.id === best);
          detected = { id: best, name: src.cands[0].set.name, nb: votes[best] };
          drawResults();
          for (const cell of todo) {
            if (stopped || !alive()) return;
            cell.state = 'lecture'; drawResults();
            try {
              const cands = await R.inSet(cell.blob, cell.info, best, (m) => { if (alive()) setStatus(`<div class="spinner"></div><div style="text-align:center">Série détectée : ${esc(detected.name)} — carte ${cell.i + 1} : ${esc(m)}</div>`); });
              let top = cands[0], sameName = false;
              const old = cell.cands[0];
              // même carte réimprimée ailleurs (ex. Dardargnan Évolutions) → on prend la version de la série de la page
              if (old && old.set && old.set.id !== best) {
                const same = cands.find((x) => App.util.norm(x.name) === App.util.norm(old.name));
                if (same) { top = same; sameName = true; cands.splice(cands.indexOf(same), 1); cands.unshift(same); }
              }
              if (top && (sameName || top.confident || !old || top.score >= old.score)) {
                const seen = new Set(cands.map((x) => x.id));
                cell.cands = [...cands, ...cell.cands.filter((x) => !seen.has(x.id))].slice(0, 10);
                cell.choice = top.id;
                cell.state = top.confident ? 'sure' : 'verifier';
              } else cell.state = old ? 'verifier' : 'inconnue';
            } catch (e) { console.error(e); cell.state = cell.cands.length ? 'verifier' : 'inconnue'; }
            cell.checked = cell.state === 'sure';
            drawResults();
          }
        }
      }
      running = false;
      el.querySelector('#b-reset').disabled = false; el.querySelector('#b-fmt').disabled = false; el.querySelector('#b-go').disabled = false;
      el.querySelector('#b-set').disabled = false;
      setStatus('');
      drawResults();
    });

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
        ${detected ? `<p class="small" style="margin:0 0 10px">🔎 Série détectée sur cette page : <b>${esc(detected.name)}</b> (d’après ${detected.nb} cartes) — les cartes incertaines ont été recomparées aux cartes de cette série.</p>` : ''}
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
              ${['attente', 'lecture', 'dos'].includes(c.state) && !c.choice ? (c.state === 'dos' ? `<button class="btn sm ghost" data-find="${c.i}">🔎 Ce n’est pas un dos : chercher</button>
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
                <button class="btn sm ghost" data-find="${c.i}">🔎 Chercher une autre carte</button>
                <div class="bsearch hidden" data-box="${c.i}">
                  <input type="text" placeholder="Nom" data-name="${c.i}">
                  <input type="text" placeholder="N° ex. 025/165" data-num="${c.i}">
                  <button class="btn sm" data-dosearch="${c.i}">OK</button>
                </div>`}
            </div>`;
          }).join('')}
        </div>
        ${!running && cells.length ? `<div class="row" style="margin-top:16px">
          <button class="btn primary" id="b-add" ${chosen.length ? '' : 'disabled'}>✓ Enregistrer ${chosen.length} carte${chosen.length > 1 ? 's' : ''} dans mon Dex</button>
        </div>` : ''}`;
    }

    resultsEl.addEventListener('change', (e) => {
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
      if (e.target.closest('#b-add')) {
        const todo = cells.filter((c) => c.choice && modeOf(c) !== 'rien').map((c) => ({ c, mode: modeOf(c) }));
        e.target.disabled = true;
        const keys = [];
        for (const { c, mode } of todo) {
          const cand = c.cands.find((x) => x.id === c.choice);
          if (cand) keys.push(await R.addScanned(cand, c.blob, mode === 'nouvelle' ? null : mode));
        }
        App.col.refreshPrices([...new Set(keys)], 'Prix');
        // les cartes enregistrées restent affichées (marquées ✓) : on peut continuer avec les autres
        for (const { c } of todo) { c.saved = true; c.checked = false; }
        App.util.toast(`${keys.length} carte${keys.length > 1 ? 's' : ''} enregistrée${keys.length > 1 ? 's' : ''} ✓`);
        drawResults();
        resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });

    return () => { stopped = true; cam.stop(); urls.forEach((u) => URL.revokeObjectURL(u)); };
  },
};
