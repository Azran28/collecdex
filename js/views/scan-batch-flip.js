/*
 * Scanner — classeur « feuilleté » (ESSAI, v3.62, Arnaud : « certifier le classeur, mais sans que ce soit long »).
 * Seulement pour les comptes testeurs (App.scanShare.isTester) : bouton « Feuilleter (essai) » en Classeur. La caméra reste
 * allumée, on tourne les pages devant elle ; chaque page tournée est jugée par App.pageTurn (js/page-turn.js : la page
 * a-t-elle pivoté autour des anneaux comme une vraie page ?) et le résultat s'affiche tout de suite, avec la durée du geste.
 * Rien n'est lu ni certifié pendant l'essai. Chaque geste part au labo (petites images grises en mosaïque + mesures,
 * kind 'feuillete') pour régler la mesure sur de vraies vidéos. Morceau de scan-batch.js (état partagé : X.S).
 */
App.scanBatchParts = App.scanBatchParts || {};
App.scanBatchParts.flip = (X, { alive, burst, cam, dims, el, setStatus, view }) => {
  const { S } = X, T = App.pageTurn, I = App.icons.icon;
  S.flipTimer = null; S.flipLog = []; S.flipping = false;
  const btn = el.querySelector('#b-flip');
  if (!burst && btn && App.scanShare && T) App.scanShare.isTester().then((v) => { if (v && alive()) btn.classList.remove('hidden'); }).catch(() => {});
  const sec = (ms) => `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
  const hint = (html, cls = '') => { const h = view.querySelector('.r-live'); if (h) { h.className = `r-live ${cls}`; h.innerHTML = html; } };
  const showButtons = (flipping) => {
    ['#b-native', '#b-flip'].forEach((s) => { const b = el.querySelector(s); if (b) b.classList.toggle('hidden', flipping); });
    const f2 = el.querySelector('#b-file2'); if (f2) f2.closest('label').classList.toggle('hidden', flipping);
    el.querySelector('#b-flip-stop').classList.toggle('hidden', !flipping);
  };
  function drawLog() {
    const L = S.flipLog, ok = L.filter((x) => x.res.pass).length;
    setStatus(`<div class="panel flip-log"><b>${I('shield', 14)} Essai : tourne les pages devant la caméra</b>
      <div class="small muted">Les pages ne sont pas lues ni certifiées pendant l'essai : on vérifie seulement le geste.</div>
      ${L.length ? `<div style="margin-top:6px"><b>${ok} / ${L.length}</b> pages tournées reconnues</div>` : ''}
      ${L.slice(-6).reverse().map((x) => `<div class="small">Page ${x.n} : ${x.res.pass ? '✅ geste reconnu' : `❌ ${App.util.esc(x.res.why || 'pas reconnu')}`} · geste ${sec(x.ms)} · ${x.fps.toFixed(1).replace('.', ',')} images/s</div>`).join('')}</div>`);
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
      App.scanShare.scan({ game: S.game, mode: 'classeur', kind: 'feuillete', extra: { feuillete: { pass: e.res.pass, why: e.res.why || '', ev: e.res.ev || null, ms: Math.round(item.ms), fps: Math.round(item.fps * 10) / 10, n: item.n, ts: e.frames.slice(-48).map((f) => Math.round(f.t - t0)) } } }, b);
    } catch (err) { console.warn('feuilleté → labo', err); }
  }
  function flipStop() {
    if (S.flipTimer) { clearInterval(S.flipTimer); S.flipTimer = null; }
    if (!S.flipping) return;
    S.flipping = false;
    cam.stop(); showButtons(false);
    view.innerHTML = App.views.scan.empty('classeur', dims());
  }
  async function flipStart() {
    try { await cam.start(); } catch (e) { setStatus(`<b>Caméra indisponible.</b><br><span class="small muted">${App.util.esc(e.message)}</span>`); return; }
    App.sfx.unlock(); showButtons(true); S.flipping = true;
    view.insertAdjacentHTML('beforeend', '<div class="r-live">Cadre <b>toute la page</b> et tiens-la immobile</div>');
    S.flipLog = []; drawLog();
    const w = T.watcher();
    let n = 1, lastPage = 0;
    S.flipTimer = setInterval(() => {
      if (!alive() || !cam.on || !cam.video || !cam.video.videoWidth) return;
      const r = cam.region(0); if (!r) return;
      const f = { t: performance.now(), g: T.grab(cam.video, r) };
      const was = w.state(), e = w.push(f), st = w.state();
      if (!e) {
        if (st === 'page' && was !== 'page') { lastPage = f.t; hint(n === 1 ? '✓ Page vue — <b>tourne-la</b> (comme d’habitude)' : `Page ${n} vue — tourne la suivante`, 'go'); }
        else if (st === 'geste' && was !== 'geste') hint('Tourne…', 'go');
        else if (st === 'attente' && was !== 'attente') hint('Cadre <b>toute la page</b> et tiens-la immobile');
        return;
      }
      n++;
      const fr = e.frames, ms = fr[fr.length - 1].t - fr[0].t, fps = (fr.length - 1) * 1000 / (ms || 1);
      const mv = fr.findIndex((x, i) => i > 0 && T.madShift(x.g, fr[i - 1].g) > 6); // (début du mouvement, pour la durée du geste)
      const item = { n, res: e.res, ms: fr[fr.length - 1].t - fr[Math.max(0, mv)].t, fps, sinceLast: lastPage ? f.t - lastPage : 0 };
      S.flipLog.push(item); drawLog();
      const score = `${S.flipLog.filter((x) => x.res.pass).length}/${S.flipLog.length}`;
      hint(e.res.pass ? `✅ Page ${n} : geste reconnu (${score})` : `❌ Page ${n} : ${App.util.esc(e.res.why || 'pas reconnu')} (${score})`, e.res.pass ? 'ok' : 'warn');
      if (e.res.pass) App.sfx.click();
      try { if (navigator.vibrate) navigator.vibrate(e.res.pass ? 25 : [20, 60, 20]); } catch (err) { /* */ }
      lastPage = f.t;
      send(e, item);
    }, 90);
  }
  if (btn) btn.addEventListener('click', flipStart);
  el.querySelector('#b-flip-stop').addEventListener('click', flipStop);
  return { flipStop };
};
