/* Scanner — mode « une carte » (photo → recadrage → reconnaissance → confirmation). Partie de App.views.scan (voir scan.js). */
Object.assign(App.views.scan, {
  /* ================= Mode « une carte » ================= */
  async single(el, params, alive) {
    const { esc } = App.util;
    const R = App.recognizer, RATIO = R.RATIO;
    // licence de la carte (v2.85) : choisie en haut (gardée pour les scans suivants), ou celle de la carte visée (?jeu=…)
    const GAMES = App.games.list.filter((g) => g.status === 'actif' && App.games.get(g.id));
    let game = params.query.jeu && App.games.get(params.query.jeu) ? params.query.jeu : 'pokemon';
    if (!params.query.jeu) { try { const g = sessionStorage.getItem('scanGame'); if (g && App.games.get(g)) game = g; } catch (e) { /* */ } }
    try { sessionStorage.setItem('scanGame', game); } catch (e) { /* */ }
    let ad = App.games.get(game);
    const isPk = () => game === 'pokemon';
    // la certification (dos de la carte, lampe) n'existe que pour Pokémon pour l'instant
    const guideC = () => App.views.scan.guide('carte'); // certification : Pokémon et One Piece (dos One Piece appris en v2.88)
    const targetId = params.query.carte || null;
    let cardBlob = null, cardURL = null, target = null, pageBlob = null;
    let donCard = false; // carte DON!! de One Piece lue sur la photo (pas encore gérée)
    let cert = null; // résultat de la vérification en direct de la dernière photo (null = photo importée)

    el.innerHTML = `
      ${GAMES.length > 1 ? `<div class="chips sc-game" role="tablist" aria-label="Licence de la carte">${GAMES.map((g) => `<a class="chip ${g.id === game ? 'on' : ''}" href="#/scan?jeu=${g.id}" data-game="${g.id}" role="tab" aria-selected="${g.id === game}">${App.icons.icon(g.icon, 14)} ${esc(g.name)}</a>`).join('')}</div>` : ''}
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
          <div id="sc-results">${guideC()}</div>
          <div class="panel section hidden" id="sc-manual">
            <h3>La carte n’est pas proposée ?</h3>
            <p class="small muted">Cherche-la par son nom et/ou son numéro. Ta photo sera utilisée.</p>
            <div class="row">
              <input type="text" id="sc-name" placeholder="Nom (ex. ${isPk() ? "Dracaufeu" : "Monkey D. Luffy"})" style="flex:1;min-width:160px">
              <input type="text" id="sc-num" placeholder="${isPk() ? "N° (ex. 025/165)" : "Code (ex. OP09-004)"}" style="width:130px">
              <button class="btn" id="sc-search">Chercher</button>
            </div>
          </div>
        </div>
      </div>`;

    /** Change de licence sans quitter la page (carte d'une autre licence reconnue sur la photo) */
    function switchGame(g) {
      game = g; ad = App.games.get(g);
      try { sessionStorage.setItem('scanGame', g); } catch (e) { /* */ }
      el.querySelectorAll('.sc-game [data-game]').forEach((a) => { a.classList.toggle('on', a.dataset.game === g); a.setAttribute('aria-selected', a.dataset.game === g); });
      fillSets();
      el.querySelector('#sc-name').placeholder = `Nom (ex. ${isPk() ? 'Dracaufeu' : 'Monkey D. Luffy'})`;
      el.querySelector('#sc-num').placeholder = isPk() ? 'N° (ex. 025/165)' : 'Code (ex. OP09-004)';
    }
    const view = el.querySelector('#sc-view');
    const status = el.querySelector('#sc-status');
    const results = el.querySelector('#sc-results');
    const setStatus = (html) => { status.innerHTML = html ? `<div class="panel" style="margin-bottom:14px">${html}</div>` : ''; };
    const spin = (msg) => { if (alive()) setStatus(`<div class="spinner"></div><div style="text-align:center">${esc(msg)}</div>`); };
    const cam = App.views.scan.camera(view, { guide: true });
    // série choisie : gardée pour les scans suivants (on scanne souvent une série d'affilée)
    function fillSets() {
      let savedSet = ''; try { savedSet = sessionStorage.getItem(isPk() ? 'scanSet' : 'scanSet:' + game) || ''; } catch (e) { /* */ }
      const sel = el.querySelector('#sc-set'), g = game;
      sel.innerHTML = '<option value="">Série : je ne sais pas (chercher partout)</option>';
      sel.closest('.set-first').classList.remove('chosen');
      ad.listSets().then((sets) => { if (g !== game) return; App.views.scan.fillSetSelect(sel, sets, savedSet); sel.closest('.set-first').classList.toggle('chosen', !!sel.value); }).catch(() => {});
    }
    fillSets();
    el.querySelector('#sc-set').addEventListener('change', (e) => { try { sessionStorage.setItem(isPk() ? 'scanSet' : 'scanSet:' + game, e.target.value); } catch (err) { /* */ } e.target.closest('.set-first').classList.toggle('chosen', !!e.target.value); });

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
    const stopTrack = () => { clearInterval(trkTimer); trkTimer = null; const h = view.querySelector('.flip-hint'); if (h) h.remove(); const pc = view.querySelector('.page-cert'); if (pc) pc.remove(); };
    el.querySelector('#sc-cam').addEventListener('click', async () => {
    // pendant la capture, seul « Prendre la photo » reste (demande d'Arnaud) : « Caméra » et « Choisir une photo » reviennent après
    const camButtons = (show) => { el.querySelector('#sc-cam').classList.toggle('hidden', !show); el.querySelector('#sc-file').closest('label').classList.toggle('hidden', !show); };
      try {
        await cam.start(); el.querySelector('#sc-shot').classList.remove('hidden'); camButtons(false); results.innerHTML = guideC();
        // la vidéo et le bouton photo entiers à l'écran, sans avoir à faire défiler
        window.scrollTo({ top: Math.max(0, view.getBoundingClientRect().top + window.scrollY - 66), behavior: 'smooth' });
        if (!App.certify.available() || App.settings.certCarte === false) { setStatus(''); return; } // certification désactivée : simple photo
        setStatus(''); // les étapes de la certification sont dans l'encadré commun (certBlock), sous la caméra
        App.certify.prepare();
        view.insertAdjacentHTML('beforeend', `<div class="flip-hint" data-phase="attente">${App.certify.HINTS.attente}</div>`);
        // lampe : option de l'encadré (Android) ; pendant le code, grande consigne au centre (ampoule, « Ne bouge pas », compte à rebours)
        const useLamp = true; // lampe dès que le téléphone le permet (Android)
        trk = App.certify.tracker(cam.video, () => cam.region(), { game, lamp: useLamp, onLamp: (on) => { const b = view.querySelector('.pc-big .pc-bulb'); if (b) b.classList.toggle('on', on); } });
        const t0 = Date.now();
        trkTimer = setInterval(() => {
          if (!cam.on || !alive()) return stopTrack();
          let ph = trk.step();
          // dos toujours pas reconnu après 7 s : souvent une carte dans un étui opaque
          const show = ph === 'attente' && Date.now() - t0 > 7000 ? 'aide' : ph;
          const h = view.querySelector('.flip-hint'); if (h && h.dataset.phase !== show) { h.innerHTML = show === 'aide' ? 'Dos pas reconnu : il doit être <b>visible</b> (sors la carte d’un étui opaque ; une pochette transparente, ça va)' : App.certify.HINTS[ph]; h.dataset.phase = show; }
          // dos vu : le bouton de photo le montre (la photo sera certifiée)
          const sb = el.querySelector('#sc-shot'); if (sb) sb.classList.toggle('cert-ready', ph === 'retourne');
          let big = view.querySelector('.page-cert');
          if (ph === 'lampe') {
            if (!big) { view.insertAdjacentHTML('beforeend', `<div class="page-cert"><div class="pc-big"><div class="pc-bulb">💡</div><b>Ne bouge pas</b><span class="pc-count">3</span><small>garde le dos immobile : la lampe clignote</small><div class="cert-bar"><span></span></div></div></div>`); big = view.querySelector('.page-cert'); }
            const el0 = Date.now() - trk.lampStart, left = Math.max(0, trk.LAMP_MS - el0);
            big.querySelector('.pc-count').textContent = Math.max(1, Math.ceil(left / 1000));
            big.querySelector('.cert-bar span').style.width = Math.min(100, Math.round(el0 / trk.LAMP_MS * 100)) + '%';
            if (h) h.style.visibility = 'hidden';
          } else if (big) { big.remove(); if (h) h.style.visibility = ''; }
        }, 90);
      }
      catch (e) { setStatus(`<b>Caméra indisponible.</b><br><span class="small muted">${esc(e.message)}. Autorise la caméra dans le navigateur, ou utilise « Choisir une photo ».</span>`); }
    });
    // photo certifiable si le dos a été vu (dans les 15 dernières secondes) et la carte retournée depuis
    el.querySelector('#sc-shot').addEventListener('click', () => shoot(!!(trk && trkTimer && trk.phase !== 'attente')));
    let shooting = false, lastShot = null, tooClose = false;
    async function shoot(flipped) {
      if (shooting) return; // un seul appui compte (le défi de certification ne sert qu'une fois)
      shooting = true;
      // l'image est figée À L'INSTANT de l'appui (la suite peut prendre 1 à 2 s : on peut bouger)
      const shotP = cam.capture();
      const certWanted = App.certify.available() && App.settings.certCarte !== false;
      if (certWanted && flipped) { try { trk.step(); } catch (e) { /* */ } } // image fraîche au moment de l'appui (sinon la dernière, jusqu'à 90 ms plus tôt, montrait parfois encore le dos)
      const proofP = certWanted && flipped ? trk.proof().catch((e) => { console.warn(e); return { passed: false, reasons: ['vérification impossible'] }; }) : null;
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
        lastShot = b; pageBlob = b; cam.stop(); // (pageBlob : photo d'origine, relue autrement si la carte recadrée ne donne rien)
        await new Promise((r) => { requestAnimationFrame(() => setTimeout(r, 0)); setTimeout(r, 80); }); // qu'elle s'affiche avant les calculs (80 ms au plus : onglet caché)
        if (certWanted) cert = proofP ? await proofP : { passed: false, reasons: ['photo prise sans montrer le dos de la carte d’abord'] };
        stopTrack();
        // la carte est détourée toute seule, au ras de ses bords et remise à plat (sinon recadrée au plus près)
        let card = b;
        try {
          // v2.92 (demande d'Arnaud) : la photo comprend le cadre jaune + 15 % de marge ; on ne recadre au ras de la carte
          // que si ses 4 bords sont trouvés avec assurance (dans le cadre, sinon dans toute la photo) — sinon on garde la
          // photo entière, marge comprise : toutes les infos de la carte restent visibles, rien n'est coupé
          const img = await createImageBitmap(b), zone = cam.zone || { x: 0.115, y: 0.115, w: 0.77, h: 0.77 }, all = { x: 0.01, y: 0.01, w: 0.98, h: 0.98 };
          const sure = (r) => (r && r.fit >= 0.45 ? App.views.scan.sane(r) : null);
          const cz = sure(R.cutCard(img, zone)), ca = cz ? null : sure(R.cutCard(img, all));
          tooClose = !cz && !ca; // bords pas trouvés avec assurance : photo entière (et conseil d'éloigner un peu la carte)
          if (cz || ca) card = await new Promise((res) => (cz || ca).canvas.toBlob(res, 'image/jpeg', 0.92)) || b;
        } catch (e) { console.warn(e); }
        el.querySelector('#sc-actions').classList.remove('hidden');
        await analyse(card);
        const certLine = !cert ? '' : cert.passed
          ? `<span class="cert-ok">${App.icons.icon('shield', 16)} Capture en direct vérifiée</span> <span class="small muted">— la carte sera certifiée à l’ajout.</span>`
          : `<span class="small">${App.icons.icon('shield', 14)} <b>Non certifiable</b> : ${App.util.esc(cert.reasons.join(', '))}. <span class="muted">Tu peux quand même l’ajouter, ou reprendre la photo.</span></span>`;
        // lampe en mode essai : note + petit graphique (mesures à transmettre pour le réglage)
        const lampHtml = cert && cert.flashTrace ? `${cert.lampNote ? `<div class="small" style="margin-top:6px">${App.util.esc(cert.lampNote)}</div>` : ''}${App.certify.lampChart(cert.flashTrace, cert.lampFit)}` : '';
        const closeTip = tooClose ? `<div class="small close-tip" style="margin:6px 0">${App.icons.icon('capture', 13)} <b>Bords de la carte pas trouvés</b> : éloigne un peu la carte, elle doit tenir <b>entière</b> dans le cadre jaune (avec un peu de marge).</div>` : '';
        status.insertAdjacentHTML('afterbegin', `<div class="panel" style="margin-bottom:14px">${certLine}${lampHtml}${closeTip}${certLine && !closeTip ? '<br>' : ''}<button class="linkbtn small" id="sc-recrop">✂ Mal détourée ? Recadrer à la main</button></div>`);
      } finally {
        shooting = false; shot.disabled = false; shot.classList.add('hidden'); shot.classList.remove('cert-ready');
        shot.innerHTML = `${App.icons.icon('capture', 16)} Prendre la photo`; camButtons(true);
      }
    }
    status.addEventListener('click', (e) => { if (e.target.closest('#sc-recrop') && lastShot) { const keep = cert; startCrop(lastShot, 0.92); cert = keep; } });
    // interrupteur « Certification » de l'encadré (retenu dans les réglages, synchronisé)
    el.addEventListener('change', (e) => {
      if (e.target.id !== 'sc-certon') return;
      App.settings.certCarte = e.target.checked; App.col.saveSettings().catch(() => {});
      const box = el.querySelector('#sc-cert-help'); if (box) box.outerHTML = App.views.scan.guide('carte'); // étapes grisées si désactivée
    });
    el.querySelector('#sc-file').addEventListener('change', (e) => { if (e.target.files[0]) { cam.stop(); cert = null; startCrop(e.target.files[0]); } e.target.value = ''; });

    // Recadrage (cadre au format d'une carte, 63 × 88 mm)
    let crop = null, autoCrop = false; // autoCrop : cadre placé tout seul sur une photo importée (validé d'office)
    function startCrop(blob, initial = null) {
      results.innerHTML = guideC(); setStatus('');
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
        let cx = 0.5, cy = 0.5, found = false, warped = null;
        // v2.89 : d'abord le détourage par les 4 bords (carte remise à plat, forme de carte vérifiée) — le cadre jaune
        // automatique ci-dessous prenait parfois l'intérieur d'une carte à bordure jaune (recadrage « sans sens »)
        if (!initial && !lp.page) {
          try {
            const r = R.cutCard(img, { x: 0.01, y: 0.01, w: 0.98, h: 0.98 });
            if (r && r.fit >= 0.45) {
              const xs = r.quad.map((p) => p[0]), ys = r.quad.map((p) => p[1]);
              const bw = Math.max(...xs) - Math.min(...xs), bh = Math.max(...ys) - Math.min(...ys);
              size = Math.min(1, Math.max(bh, (bw * ar) / RATIO)); cx = (Math.max(...xs) + Math.min(...xs)) / 2; cy = (Math.max(...ys) + Math.min(...ys)) / 2;
              warped = r.canvas; found = true;
            }
          } catch (e) { console.warn(e); }
        }
        // photo importée : le cadre se place tout seul sur la carte (bords trouvés), on peut toujours le déplacer
        if (!initial && !lp.page && !found) {
          try {
            const NW = img.naturalWidth, NH = img.naturalHeight;
            const f = R.locateCard(img, { x: 0, y: 0, w: NW, h: NH }, 0.45);
            if (f && f.h / NH > 0.55) {
              const m = 1.12; // nettement plus grand que la carte (v2.92) : bords compris, rien de coupé si le cadre est un peu faux
              size = Math.min(1, f.h * m / NH); if (f.w * m > NW) size = Math.min(1, f.w * m / NW);
              cx = (f.x + f.w / 2) / NW; cy = (f.y + f.h / 2) / NH; found = true;
            }
          } catch (e) { console.warn(e); }
        }
        crop = { img, url, box: view.querySelector('.crop-box'), cx, cy, size, warped };
        el.querySelector('#sc-size').value = Math.round(size * 100);
        placeBox();
        // carte trouvée toute seule : pas d'étape « Valider le cadrage », la recherche part directement
        // (« Recadrer à la main » reste proposé ensuite)
        if (found) { lastShot = blob; autoCrop = true; setTimeout(() => el.querySelector('#sc-crop-ok').click(), 0); }
      };
    }
    function boxRect() {
      // (image pas encore affichée, ou page cachée : sa taille réelle — sinon le recadrage était vide)
      const W = crop.img.clientWidth || crop.img.naturalWidth, H = crop.img.clientHeight || crop.img.naturalHeight;
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
      if (!results.innerHTML.trim()) results.innerHTML = guideC();
    });
    el.querySelector('#sc-crop-ok').addEventListener('click', () => {
      if (!crop) return;
      const auto = autoCrop; autoCrop = false;
      let c = auto && crop.warped; // carte détourée sur ses 4 bords (cadre automatique) : remise à plat, au ras des bords
      if (!c) {
        const r = boxRect(), k = crop.img.naturalWidth / r.W, sw = r.w * k, sh = r.h * k;
        const outW = Math.min(900, Math.round(sw)), outH = Math.round(outW / RATIO);
        c = document.createElement('canvas'); c.width = outW; c.height = outH;
        c.getContext('2d').drawImage(crop.img, r.x * k, r.y * k, sw, sh, 0, 0, outW, outH);
      }
      URL.revokeObjectURL(crop.url); crop = null;
      el.querySelector('#sc-cropbar').classList.add('hidden');
      el.querySelector('#sc-actions').classList.remove('hidden');
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
      // scan raté ou mauvaise carte : reprendre une photo (ou recadrer celle-ci) en un geste (demande d'Arnaud)
      const retry = `<div class="row sc-retry"><button class="btn primary" data-retry="photo">${App.icons.icon('camera', 16)} Réessayer</button>${lastShot ? '<button class="btn" data-retry="crop">✂ Recadrer cette photo</button>' : ''}</div>`;
      if (!cands.length) {
        results.innerHTML = `<div class="panel">${donCard ? `<b>C’est une carte DON!!</b><br><span class="small muted">Les cartes DON!! ne sont pas encore dans CollecDex : elles n’ont pas de numéro et Bandai ne les liste pas avec les autres cartes.</span>` : `Je n’ai pas reconnu la carte 😕<br><span class="small muted">Refais une photo plus nette (${isPk() ? 'le numéro en bas doit être lisible' : 'le code en bas à droite, ex. OP10-001, doit être lisible'}) ou cherche-la ci-dessous.</span>`}${retry}</div>`;
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
              <span class="muted small">${esc(App.views.scan.setLabel(c))} · n° ${esc(c.localId)}${c.set && c.set.cardCount && !ad.numLabel ? '/' + c.set.cardCount.official : ''}</span>
              ${!isPk() && c.variants ? `<br><span class="small muted">${c.variants.holo ? '✨ Holo' : 'Non holo'}</span>` : ''}
              ${!isPk() && /_p\d+$/.test(c.id) ? '<br><span class="small muted">Version parallèle (autre illustration) : compare avec ta carte</span>' : ''}
              ${!isPk() && /_r\d+$/.test(c.id) ? '<br><span class="small muted">Réimpression au même dessin, dans une autre série : vérifie la série</span>' : ''}
              ${i === 0 && c.twin ? '<br><span class="pill small" style="background:#7a4a00">Existe aussi dans une autre série : vérifie la série</span>' : ''}
              ${own ? `<br><span class="pill small">Déjà ×${own.qty} — ce sera un exemplaire de plus</span>` : ''}
              ${c.isTarget && !c.notRead ? '<br><span class="pill small" style="background:var(--ok);color:#063">Carte attendue ✓</span>' : ''}
              ${c.notRead ? '<br><span class="pill small" style="background:#7a4a00">Carte attendue, mais pas reconnue sur la photo</span>' : ''}
              ${!c.isTarget && i === 0 && c.confident ? '<br><span class="pill small" style="background:var(--ok);color:#063">Meilleure correspondance</span>' : ''}${c.numOk && c.ofOk ? `<br><span class="small muted">${isPk() ? 'Numéro' : 'Code'} lu sur ta carte ✓</span>` : ''}${c.visual != null && !(c.numOk && c.ofOk && c.visual < 0.42) ? `<br><span class="small muted">Illustration : ${c.visual >= 0.7 ? 'identique' : c.visual >= 0.55 ? 'très proche' : c.visual >= 0.42 ? 'proche' : 'différente'}</span>` : ''}</div>
            <button class="btn primary sm" data-pick="${esc(c.id)}">✓ C’est elle</button>
          </div>`;
        }).join('')}
        ${[...new Set(cands.slice(0, 3).map((c) => c.name))].slice(0, 2).map((n) => `<button class="btn sm" data-versions="${esc(n)}" style="margin:4px 6px 0 0">Toutes les versions de « ${esc(n)} »</button>`).join('')}
        <div class="sc-retry-box"><span class="small muted">Aucune ne correspond ?</span>${retry}</div>`;
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
            <p class="small muted" style="margin-bottom:0">Ta progression compte chaque carte une seule fois. Les doublons sont comptés à part.</p></div>`;
          return;
        }
        if (dm && dm.dataset.dupmode === 'annuler') { showCandidates(cands, ''); return; }
        (dm || b).disabled = true;
        const mode = dm ? dm.dataset.dupmode : null;
        const key = await R.addScanned(c, cardBlob, mode, game);
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
          : App.settings.certCarte === false ? `<div class="small muted" style="margin-top:6px">${App.icons.icon('shield', 13)} Non certifiée (certification désactivée). Active-la dans l’encadré « Certifier la carte » pour le badge.</div>`
          : `<div class="small muted" style="margin-top:6px">${App.icons.icon('shield', 13)} Non certifiée (photo importée). Pour le badge, capture-la avec la caméra.</div>`;
        results.innerHTML = `<div class="panel capture-done">${mode === 'rien' || !cardURL ? '' : `<div class="reveal rt-${App.ui.holoTier(ad.rarity.rank(c.rarity))}"><span class="burst"></span><img src="${cardURL}" alt=""></div>`}<div>${what}${verLine}${certLine}</div><br>
          <div class="row"><button class="btn primary" id="sc-again">Capturer la suivante</button>
          <a class="btn" href="#/jeu/${game}/serie/${encodeURIComponent(c.setId || (c.set && c.set.id))}">Voir la série</a></div></div>`;
        el.querySelector('#sc-manual').classList.add('hidden');
        cardBlob = null; target = null; el.querySelector('#sc-target').innerHTML = '';
        if (photoId && !(myCert && myCert.passed)) App.certify.note(key, photoId, !App.cloud.user ? 'pas connecté au moment de la capture' : myCert ? myCert.reasons.join(', ') : App.settings.certCarte === false ? 'certification désactivée au moment de la capture' : 'photo importée depuis la galerie');
        if (myCert && myCert.passed && photoId) {
          App.certify.identity(shotBlob, c, game).then((ident) => App.certify.finish(key, photoId, myCert, ident)).then((r) => {
            const line = results.querySelector('#sc-cert'); if (!line) return;
            line.innerHTML = r.ok ? `<span class="cert-ok">${App.icons.icon('shield', 14)} Carte certifiée !</span>` : `${App.icons.icon('shield', 13)} Non certifiée : ${esc(r.reason)}${r.unrecognized ? ' — reprends une photo plus nette pour la certifier' : ''}`;
          });
        }
        results.querySelector('#sc-again').onclick = () => { if (location.hash.includes('?')) location.hash = '#/scan'; else { results.innerHTML = guideC(); setStatus(''); el.querySelector('#sc-cam').click(); } };
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
      if (!blob) return; // recadrage vide (image pas encore affichée)
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
        let info, cands, summary, switched = false;
        // photo d'origine (cadre jaune + marge) : la carte y est entière même si le détourage l'a mal coupée (bord de la pochette,
        // ligne dans le dessin) → une fois la carte reconnue à l'image, ses vrais bords y sont repris (comme le classeur, v3.02)
        const ctx = pageBlob && pageBlob !== blob ? pageBlob : null;
        if (!isPk()) { ({ info, cands } = await ad.recognize(blob, st, { setId, original: pageBlob, context: ctx }) /* photo d'origine : autre cadrage si besoin */); summary = info.read;
          // la carte n'a été lue que sur un autre cadrage : c'est lui qui montre vraiment la carte → il devient sa photo
          if (info.crop) { tooClose = false; cardBlob = info.crop; if (cardURL) URL.revokeObjectURL(cardURL); cardURL = URL.createObjectURL(info.crop); }
        }
        else {
          // vérification par l'image (comme One Piece et le classeur) — seulement si le texte n'est pas sûr (v2.96 : lancée en même
          // temps que le texte, elle lui prenait le processeur du téléphone même quand le texte suffisait)
          const V = App.visual, useV = V && V.supported() && App.settings.visualCheck !== false;
          const tie = (a, b) => (((b.set && b.set.id) === setId) - ((a.set && a.set.id) === setId)); // (série choisie d'abord)
          // carte reconnue à l'image : ses vrais bords, pris de préférence sur la photo d'origine (la carte y est entière)
          const edgesOf = async (o) => {
            const t = o && o.cands[0];
            if (!t || !(t.orb >= V.SURE)) return null;
            return (ctx && o.url ? await V.cropOn(ctx, t, o.url).catch(() => null) : null) || o.crop || null;
          };
          if (setId) { info = await R.read(blob, st, { atkBand: true }); cands = await R.inSet(blob, info, setId, st); }
          else ({ info, cands } = await R.recognize(blob, st, { atkBand: true }));
          summary = R.readSummary(info);
          // pas une carte Pokémon : c'est peut-être une carte One Piece (code « OP09-004 » lu) → on bascule tout seul
          const op = App.games.get('onepiece');
          if (info.otherGame && op && op.recognize) {
            const r = await op.recognize(blob, st).catch(() => null);
            if (r && r.cands.length) { switchGame('onepiece'); ({ info, cands } = r); summary = info.read; switched = true; }
          }
          if (useV && !switched && !info.otherGame) {
            const top = cands[0];
            if (!(top && top.confident)) {
              // (avec les cartes du texte : Sulfura 27 ↔ 12, la jumelle au même dessin ne doit pas manquer)
              st('Vérification par l’image…');
              let o = await V.check(blob, cands, { tie }).catch((err) => { console.warn('vérification par l’image', err); return null; });
              // rien de sûr sur la carte détourée (mal coupée ?) : on cherche sur la photo d'origine
              if (ctx && !(o && o.cands[0] && o.cands[0].confident)) {
                const w = await V.check(ctx, cands, { tie }).catch(() => null);
                if (w && w.cands[0] && w.cands[0].confident) o = w;
              }
              if (o && o.cands[0] && o.cands[0].orb >= V.SURE) summary = [summary, 'reconnue à l’image ✓'].filter(Boolean).join(' · ');
              if (o) { cands = o.cands; const c = await edgesOf(o); if (c) info.crop = c; }
            } else {
              // sûre par le texte : les propositions s'affichent tout de suite ; la carte est recadrée sur ses vrais bords ensuite
              info.cropLater = V.check(blob, cands.slice(0, 6), { tie }).then((o) => (o && o.cands[0] && o.cands[0].id === top.id ? edgesOf(o) : null), () => null);
            }
          }
          if (info.crop) { tooClose = false; cardBlob = info.crop; if (cardURL) URL.revokeObjectURL(cardURL); cardURL = URL.createObjectURL(info.crop); }
        }
        if (!alive()) return;
        view.innerHTML = `<img src="${cardURL}" alt="Ta carte">`;
        setStatus(switched ? `<span class="small">${App.icons.icon('anchor', 14)} <b>Carte One Piece reconnue</b> : passage en One Piece.</span>`
          : info.otherGame ? `<span class="small">${App.icons.icon('layers', 14)} <b>Ça ne ressemble pas à une carte ${esc(ad.name)}</b> (autre jeu ?). CollecDex reconnaît les cartes ${GAMES.map((g) => esc(g.name)).join(' et ')} pour l’instant : choisis la licence en haut de la page.</span>` : '');
        donCard = !!info.don;
        showCandidates(cands, summary);
        // carte recadrée sur ses vrais bords en arrière-plan (texte sûr : on n'a pas attendu) — seulement si rien n'a changé entre-temps
        if (info.cropLater) {
          const shown = cardBlob;
          info.cropLater.then((c) => {
            if (!c || !alive() || cardBlob !== shown) return;
            tooClose = false; cardBlob = c; if (cardURL) URL.revokeObjectURL(cardURL); cardURL = URL.createObjectURL(c);
            const im = view.querySelector('img'); if (im) im.src = cardURL;
            const tip = status.querySelector('.close-tip'); if (tip) tip.remove();
          });
        }
        // les propositions sont sous la photo sur téléphone : on y descend
        requestAnimationFrame(() => { const r = results.getBoundingClientRect(); if (r.top > window.innerHeight * 0.55) window.scrollTo({ top: Math.max(0, window.scrollY + r.top - 70), behavior: 'smooth' }); });
      } catch (e) {
        console.error(e);
        view.innerHTML = `<img src="${cardURL}" alt="Ta carte">`;
        setStatus(`<b>La lecture a échoué.</b><br><span class="small muted">${esc(e.message)}</span>`);
        showCandidates([], '');
      }
    }

    // « Réessayer » : on repart d'une nouvelle photo (caméra du site) ; « Recadrer » : même photo, cadre à la main
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-retry]'); if (!b) return;
      e.stopPropagation();
      if (b.dataset.retry === 'crop' && lastShot) { const keep = cert; startCrop(lastShot, 0.92); cert = keep; return; }
      cardBlob = null; cert = null; donCard = false; setStatus('');
      el.querySelector('#sc-manual').classList.add('hidden');
      view.innerHTML = App.views.scan.empty('carte');
      results.innerHTML = guideC();
      window.scrollTo({ top: Math.max(0, view.getBoundingClientRect().top + window.scrollY - 66), behavior: 'smooth' });
      el.querySelector('#sc-cam').click();
    });
    el.querySelector('#sc-search').addEventListener('click', async () => {
      if (!cardBlob) return App.util.toast('Prends d’abord la carte en photo');
      spin('Recherche…');
      try {
        const nameQ = el.querySelector('#sc-name').value, numQ = el.querySelector('#sc-num').value;
        let cands;
        // (même logique pour toutes les licences : nom / numéro, puis classées par ressemblance avec la photo)
        if (isPk()) cands = await R.manual(cardBlob, nameQ, numQ, spin);
        else cands = await ad.manual(cardBlob, nameQ, numQ);
        setStatus(''); showCandidates(cands, '');
      } catch (e) { setStatus(''); App.util.toast(e.message); }
    });
    el.querySelector('#sc-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') el.querySelector('#sc-search').click(); });

    return () => { cam.stop(); if (cardURL) URL.revokeObjectURL(cardURL); };
  },

});
