/*
 * Scanner — classeur « feuilleté » (ESSAI, v3.62, Arnaud : « certifier le classeur, mais sans que ce soit long »).
 * Seulement pour les comptes testeurs (App.scanShare.isTester) : bouton « Feuilleter (essai) » en Classeur. La caméra reste
 * allumée, on tourne les pages devant elle ; chaque page tournée est jugée par App.pageTurn (js/page-turn.js : la page
 * a-t-elle pivoté autour des anneaux comme une vraie page ?) et le résultat s'affiche tout de suite, avec la durée du geste.
 * Rien n'est lu ni certifié pendant l'essai. Chaque geste part au labo (petites images grises en mosaïque + mesures,
 * kind 'feuillete') pour régler la mesure sur de vraies vidéos. Morceau de scan-batch.js (état partagé : X.S).
 * v3.91 (Arnaud : « je n'arrive pas à utiliser la certif classeur tellement elle est dure à comprendre ») : même DA que la
 * rafale certifiée — pastilles Page → Tourne → Lâche sur la caméra (App.views.scan.stepPills), cadre jaune / vert / orange,
 * une phrase courte dessous, et le score dans une bande en bas de l'image.
 */
App.scanBatchParts = App.scanBatchParts || {};
App.scanBatchParts.flip = (X, { alive, burst, cam, dims, el, setStatus, startGrid, view }) => {
  const { S } = X, T = App.pageTurn, I = App.icons.icon;
  S.flipTimer = null; S.flipLog = []; S.flipping = false; S.flipPages = []; S.flipQueue = [];
  const mot = T.motion(); // (v4.02 : capteurs du téléphone, pour ne pas prendre un téléphone bougé pour une page tournée)
  const btn = el.querySelector('#b-flip');
  if (!burst && btn && T) btn.classList.remove('hidden'); // (v4.12 : pour tout le monde ; avant, seulement les comptes testeurs)
  const sec = (ms) => `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
  const hint = (html, cls = '') => { const h = view.querySelector('.r-live'); if (h) { h.className = `r-live ${cls}`; h.innerHTML = html; } };
  const step = (cur, mood = '') => App.views.scan.stepPills(view, ['Page', 'Tourne', 'Lâche'], cur, mood);
  const showButtons = (flipping) => {
    ['#b-native', '#b-flip'].forEach((s) => { const b = el.querySelector(s); if (b) b.classList.toggle('hidden', flipping); });
    const f2 = el.querySelector('#b-file2'); if (f2) f2.closest('label').classList.toggle('hidden', flipping);
    el.querySelector('#b-flip-stop').classList.toggle('hidden', !flipping);
  };
  // v3.64 (Arnaud : « pas clair ») : un conseil simple à la place de chaque raison technique ; v3.91 : et l'étape ratée (pastille orange)
  const ADVICE = {
    'page pas tenue immobile après le geste': [3, 'Après avoir tourné, <b>lâche la page</b> et ne bouge plus 1 seconde'],
    'page pas tenue immobile avant le geste': [1, 'Avant de tourner, garde la page <b>immobile</b> 1 seconde'],
    'page changée d’un coup': [2, 'Trop rapide pour la caméra : tourne <b>un peu moins vite</b>'],
    'la page n’a pas tourné comme une vraie page': [2, 'Pas reconnu : garde <b>toute la page</b> dans l’image pendant le geste'],
  };
  const advice = (why) => ADVICE[why] || [2, App.util.esc(why || 'pas reconnu')];
  let fpsNow = 0;
  /** Sous la caméra : une phrase, et l'avertissement si la caméra donne trop peu d'images */
  function drawLog() {
    setStatus(`<div class="panel flip-log"><b>${I('shield', 14)} Feuilleter le classeur</b>
      <div class="small muted" style="margin-top:4px">Suis les pastilles sur la caméra : chaque page est photographiée, puis toutes sont lues à la fin. Une page bien tournée donne le badge « certifiée ».</div>
      ${fpsNow && fpsNow < 8 ? `<div class="small" style="margin-top:6px;color:#c47800">Ta caméra donne peu d’images (${fpsNow.toFixed(1).replace('.', ',')} par seconde) : tourne plus lentement.</div>` : ''}</div>`);
  }
  /** Bande en bas de la caméra : pages reconnues / essayées, et les 8 derniers résultats */
  function drawStrip() {
    const L = S.flipLog; if (!L.length && !S.flipPages.length) return;
    let s = view.querySelector('.r-strip');
    if (!s) { s = document.createElement('div'); s.className = 'r-strip flip-strip'; s.setAttribute('aria-live', 'polite'); view.appendChild(s); }
    const ok = L.filter((x) => x.res.pass).length;
    s.innerHTML = `${S.flipPages.length ? `<span class="r-sum">${S.flipPages.length}<small>photo${S.flipPages.length > 1 ? "s" : ""}</small></span>` : ""}<span class="r-sum">${ok}/${L.length}<small>reconnues</small></span><span class="flip-dots">${L.slice(-8).map((x) => `<b class="${x.res.pass ? 'ok' : 'no'}" title="Page ${x.n} · ${sec(x.ms)}">${x.res.pass ? '✓' : '✕'}</b>`).join('')}</span>`;
  }
  /** Bouton du bas : « Terminer et lire les N pages » dès qu'une page est photographiée (v3.99) */
  function stopLabel() {
    const b = el.querySelector('#b-flip-stop'), k = S.flipPages.length;
    if (b) b.textContent = k ? `Terminer et lire ${k > 1 ? `les ${k} pages` : 'la page'}` : 'Arrêter';
  }
  /** Petites images du geste en mosaïque (8 par rangée) pour le labo */
  function mosaic(frames) {
    const fr = frames.slice(-48), C = 8, R = Math.ceil(fr.length / C), c = Object.assign(document.createElement('canvas'), { width: C * T.GW, height: R * T.GH });
    const g = c.getContext('2d'), img = g.createImageData(T.GW, T.GH);
    fr.forEach((f, k) => { for (let i = 0; i < f.g.length; i++) { const v = f.g[i]; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; } g.putImageData(img, (k % C) * T.GW, Math.floor(k / C) * T.GH); });
    return new Promise((res) => c.toBlob(res, 'image/png'));
  }
  async function send(e, item) {
    try {
      const b = await mosaic(e.frames), t0 = e.frames[Math.max(0, e.frames.length - 48)].t;
      App.scanShare.scan({ game: S.game, mode: 'classeur', kind: 'feuillete', extra: { feuillete: { pass: e.res.pass, why: e.res.why || '', ev: e.res.ev || null, ms: Math.round(item.ms), fps: Math.round(item.fps * 10) / 10, n: item.n, mot: e.mot || null, ts: e.frames.slice(-48).map((f) => Math.round(f.t - t0)) } } }, b);
    } catch (err) { console.warn('feuilleté → labo', err); }
  }
  /**
   * v3.99 (Arnaud : « voir ce que ça donne pour la recherche des cartes ») : chaque page vue (la 1re, puis chaque page tournée)
   * est photographiée en pleine résolution (cam.photo) ; à la fin, les pages passent l'une après l'autre dans la lecture
   * normale du classeur (startGrid : grille, lecture, vérification, récapitulatif, Enregistrer) — après chaque page, #b-reset
   * appelle flipNext pour la suivante. v4.00 : page tournée reconnue → badge pour cette page ET la page d’avant (celle qui a été
   * soulevée), App.certify.flipPage.
   */
  function flipNext() {
    const p = S.flipQueue.shift();
    if (!p) { if (S.flipCur) App.util.toast(`Feuilletage terminé : ${S.flipCur.of} page${S.flipCur.of > 1 ? 's lues' : ' lue'}`); S.flipCur = null; return false; }
    S.flipCur = { i: p.i, of: p.of };
    startGrid(p.blob, p.cert || null); // (page tournée reconnue et vérifiée → les cartes bien reconnues seront certifiées, v4.00)
    const box = el.querySelector('#b-certline');
    if (box) box.insertAdjacentHTML('afterbegin', `<div class="panel flip-page" style="margin-bottom:8px"><b>Feuilletage : page ${p.i} sur ${p.of}</b> <span class="small muted">— ${p.cert && p.cert.passed ? 'vérifiée en direct' : p.cert ? `pas de badge : ${App.util.esc(p.cert.reasons[0] || '')}` : !App.certify.available() ? 'connecte-toi pour le badge' : 'aucun geste reconnu autour de cette page : pas de badge'}${S.flipQueue.length ? ` · ensuite ${S.flipQueue.length} page${S.flipQueue.length > 1 ? 's' : ''}` : ''}</span></div>`);
    return true;
  }
  function flipStop() {
    if (S.flipTimer) { clearInterval(S.flipTimer); S.flipTimer = null; }
    if (!S.flipping) return;
    S.flipping = false;
    step(0); cam.stop(); showButtons(false); mot.stop();
    view.innerHTML = App.views.scan.empty('classeur', dims());
    const pages = S.flipPages; S.flipPages = [];
    // v4.02 (Arnaud : « la dernière photo est toujours ratée ») : sans capteur de mouvement, une page photographiée juste
    // avant l'appui sur « Terminer » est le plus souvent le sol (téléphone baissé pour toucher le bouton) → oubliée
    const last = pages[pages.length - 1];
    if (last && last.noSensor && performance.now() - last.at < 2500) pages.pop();
    if (pages.length && alive()) { S.flipQueue = pages.map((p, k) => ({ ...p, i: k + 1, of: pages.length })); flipNext(); }
  }
  async function flipStart() {
    mot.start(); // (sur l'appui : l'iPhone demande l'autorisation)
    try { await cam.start({ light: true }); } catch (e) { setStatus(`<b>Caméra indisponible.</b><br><span class="small muted">${App.util.esc(e.message)}</span>`); return; }
    App.sfx.unlock(); showButtons(true); S.flipping = true;
    view.insertAdjacentHTML('beforeend', '<div class="r-live">Cadre <b>une page entière</b> et ne bouge plus</div>');
    step(1);
    S.flipLog = []; S.flipPages = []; S.flipQueue = []; S.flipFpsShown = 0; fpsNow = 0; drawLog(); stopLabel();
    const w = T.watcher();
    let n = 1, lastPage = 0, ticks = [], holdUntil = 0, busy = false, first = true;
    // v3.99 : photo pleine résolution de la page qu'on voit (pendant ce temps le suivi s'arrête, puis repart de zéro :
    // sur Android la caméra se relance parfois après une vraie photo)
    async function shootPage(pass, e = null) {
      if (pass === null) hint('📸 Photo de la page… ne bouge pas', 'go');
      busy = true;
      try {
        // v4.04 (Arnaud : « la dernière capture pose toujours problème ») : la vraie photo du capteur met jusqu'à plusieurs
        // secondes sur Android ; pour la dernière page, le téléphone est déjà baissé quand elle part → image vidéo prise TOUT
        // DE SUITE (page immobile), gardée à la place de la vraie photo si le téléphone a bougé entre-temps
        const t0 = performance.now(), r0 = cam.region(0), g0 = r0 ? T.grab(cam.video, r0) : null, frameP = cam.capture();
        // v4.00 : page tournée reconnue → preuve « page feuilletée » pour le badge, prise AVANT la photo (la vidéo est encore là)
        const [cols, rows] = dims(), cert = pass && e && App.certify.available() ? await App.certify.flipPage(cam.video, e.frames, e.res, cols * rows).catch(() => null) : null;
        const still = await cam.still().catch(() => null);
        const m = mot.moved(t0, performance.now(), T.STILL), r1 = cam.on && cam.video && cam.video.videoWidth && cam.region(0);
        const shook = m ? m.moved : !!(g0 && r1 && !T.samePage(g0, T.grab(cam.video, r1))); // (sans capteur : l'image a changé)
        const b = (still && !shook ? still : null) || (await frameP);
        if (b && S.flipping) {
          const prev = S.flipPages[S.flipPages.length - 1];
          S.flipPages.push({ blob: b, pass, cert, at: performance.now(), noSensor: !!(e && e.mot === null) }); drawStrip(); stopLabel();
          if (cert && prev && !prev.cert) prev.cert = await App.certify.flipPage(await createImageBitmap(prev.blob), e.frames, e.res, cols * rows).catch(() => null); // (la page soulevée)
          view.classList.add('r-flash'); setTimeout(() => view.classList.remove('r-flash'), 260);
        }
      } catch (err) { console.warn('feuilleté : photo de la page', err); }
      finally { w.reset(); busy = false; }
    }
    // une étape de la page (le résultat d'une page reste affiché 1,2 s, sauf si la page suivante est déjà tournée)
    const show = (st) => {
      if (st === 'page') { step(2); hint('Page vue ✓ — <b>tourne-la</b>'); }
      else if (st === 'geste') { step(3); hint('<b>Lâche</b> la page et ne bouge plus…'); }
      else { step(1); hint('Cadre <b>une page entière</b> et ne bouge plus'); }
    };
    S.flipTimer = setInterval(() => {
      if (busy || !alive() || !cam.on || !cam.video || !cam.video.videoWidth) return;
      const r = cam.region(0); if (!r) return;
      const f = { t: performance.now(), g: T.grab(cam.video, r) };
      ticks.push(f.t); if (ticks.length > 20) ticks.shift(); // cadence réelle (images lues par seconde)
      if (ticks.length === 20 && !(S.flipFpsShown > 0)) { fpsNow = 19000 / (ticks[19] - ticks[0]); S.flipFpsShown = 1; drawLog(); }
      const was = w.state(), e = w.push(f), st = w.state();
      if (!e) {
        if (st === 'page' && was !== 'page') { lastPage = f.t; if (first) { first = false; shootPage(null); return; } } // (la 1re page, avant tout geste)
        if (holdUntil && (f.t < holdUntil && st !== 'geste')) return;
        if (holdUntil || st !== was) { holdUntil = 0; show(st); }
        return;
      }
      // v4.02 : le téléphone a tourné, penché ou bougé pendant le « geste » → ce n'est pas une page tournée : ni photo, ni badge
      e.mot = mot.moved(e.frames[0].t, f.t);
      if (e.mot && e.mot.moved) {
        step(2, 'warn'); hint('Le <b>téléphone</b> a bougé : tiens-le immobile, ne tourne que la page', 'warn');
        try { if (navigator.vibrate) navigator.vibrate([20, 60, 20]); } catch (err) { /* */ }
        holdUntil = f.t + 2200;
        send({ ...e, res: { pass: false, why: 'téléphone bougé', ev: { ...(e.res.ev || {}), was: e.res.pass } } }, { n: 0, ms: f.t - e.frames[0].t, fps: 0 });
        return;
      }
      n++;
      const fr = e.frames, ms = fr[fr.length - 1].t - fr[0].t, fps = (fr.length - 1) * 1000 / (ms || 1);
      const mv = fr.findIndex((x, i) => i > 0 && T.madShift(x.g, fr[i - 1].g) > 6); // (début du mouvement, pour la durée du geste)
      const item = { n: n - 1, res: e.res, ms: fr[fr.length - 1].t - fr[Math.max(0, mv)].t, fps, sinceLast: lastPage ? f.t - lastPage : 0 };
      S.flipLog.push(item); drawStrip();
      if (e.res.pass) { step(4); hint(`${I('shield', 13)} Page ${n - 1} reconnue !`, 'ok'); App.sfx.click(); }
      else { const [k, txt] = advice(e.res.why); step(k, 'warn'); hint(txt, 'warn'); }
      try { if (navigator.vibrate) navigator.vibrate(e.res.pass ? 25 : [20, 60, 20]); } catch (err) { /* */ }
      holdUntil = f.t + (e.res.pass ? 1200 : 2200); // (un conseil se lit moins vite qu'un ✓)
      lastPage = f.t;
      send(e, item);
      shootPage(e.res.pass, e); // (la nouvelle page est immobile : on la photographie)
    }, 90);
  }
  if (btn) btn.addEventListener('click', flipStart);
  el.querySelector('#b-flip-stop').addEventListener('click', flipStop);
  return { flipStop, flipNext };
};
