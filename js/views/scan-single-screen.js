/*
 * Carte seule — écran plein écran (v3.55, Arnaud : « beaucoup d'info, le défilement n'est pas intuitif, et il reste les boutons
 * pour passer en classeur ») : sur téléphone, l'analyse puis le choix de la carte se font dans un écran à part, comme en
 * classeur (mêmes classes .sv-*) : ta photo en grand pendant la lecture, puis ta carte à côté de la proposition, son code,
 * le zoom sur le code de ta carte, les autres propositions à toucher et de gros boutons.
 * La page habituelle (liste « C'est laquelle ? », recherche) reste derrière : « Voir la liste détaillée » y ramène.
 * Les gestes sont renvoyés aux boutons de cette liste (mêmes règles : doublon, versions, carnet des scans…).
 */
App.views.scan.singleScreen = (el, { gameOf, adOf, isPk, results, status, view }) => {
  const { esc } = App.util;
  const G = () => gameOf(), A = () => adOf(); // (la licence peut changer en « Toutes »)
  const phone = () => matchMedia('(max-width: 760px)').matches;
  const box = document.createElement('div');
  box.className = 'sv ss hidden'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Analyse de ta carte');
  el.appendChild(box);
  const lock = (on) => document.documentElement.classList.toggle('sv-lock', on);
  let open = false, list = [], idx = 0, info = '', zoom = '', photo = '', mode = '';
  const head = (label) => { const lic = App.games.info(G()); return `<div class="sv-top ss-top"><div class="bprog-lbl"><span>${label}</span>${lic ? `<b class="ss-lic">${App.ui.licIc(G(), 11, 'lic-ic-xs')} ${esc(lic.name)}</b>` : ''}</div></div>`; };
  const codeOf = (c) => esc(App.views.scan.codeOf(G(), c));
  const statusHtml = () => `<div class="ss-status">${status.innerHTML}</div>`;

  function show() { if (!open) { open = true; lock(true); box.classList.remove('hidden'); box.scrollTop = 0; } }
  function close() { if (!open) return; open = false; mode = ''; lock(false); box.classList.add('hidden'); box.innerHTML = ''; }

  /** pendant la lecture : la photo en grand (adresse d'image ou canevas de la photo qui vient d'être prise) */
  function scan(src, msg) {
    if (!phone()) return;
    mode = 'scan'; photo = typeof src === 'string' ? src : '';
    box.innerHTML = `<div class="sv-in ph-txt">${head('Analyse de ta carte')}
      <div class="sv-stage"><span class="sv-shot"><span class="bphoto sv-card scan-txt">${photo ? `<img src="${photo}" alt="Ta carte">` : ''}<i class="bscan"></i></span></span></div>
      <div class="sv-caption"><div class="sv-title">Recherche de la carte…</div><div class="sv-sub ss-msg">${esc(msg || '')}</div></div>
      ${statusHtml()}
      <div class="sv-acts ss-acts"><button class="btn" data-retry="photo">${App.icons.icon('camera', 16)} Reprendre la photo</button></div></div>`;
    if (!photo && src && src.tagName === 'CANVAS') { const c = src.cloneNode(); c.getContext('2d').drawImage(src, 0, 0); box.querySelector('.bphoto').prepend(c); }
    show();
  }
  const msg = (m) => { const s = box.querySelector('.ss-msg'); if (s) s.textContent = m; };
  function setPhoto(url) {
    photo = url;
    const ph = box.querySelector('.ss-mine, .sv-shot .bphoto'); if (!ph) return;
    const old = ph.querySelector('img, canvas'), im = document.createElement('img'); im.src = url; im.alt = 'Ta carte';
    if (old) old.replaceWith(im); else ph.prepend(im);
  }

  /** le choix : ta carte, la proposition en grand, les autres en petit */
  function pick(cands, readInfo, src, url) {
    if (!phone()) return;
    list = cands; idx = 0; info = readInfo || ''; mode = 'pick'; zoom = ''; if (url) photo = url;
    draw();
    if (!isPk() && src) App.views.scan.codeZoom(G(), src).then((u) => { zoom = u; if (open && mode === 'pick') { const z = box.querySelector('.sc-mycode'); if (z && u) { z.querySelector('img').src = u; z.classList.remove('hidden'); } } });
  }
  function draw() {
    const c = list[idx];
    if (!c) {
      box.innerHTML = `<div class="sv-in">${head('Ta carte')}
        <div class="sv-pair ss-pair1"><span class="bphoto ss-mine">${photo ? `<img src="${photo}" alt="Ta carte">` : ''}</span></div>
        ${statusHtml()}
        <div class="sv-name">Carte pas reconnue</div>
        <div class="sv-why">${results.querySelector('.panel') ? esc(results.querySelector('.panel').innerText.split('\n').slice(0, 3).join(' ')) : ''}</div>
        <div class="sv-acts ss-acts">
          <button class="btn primary" data-retry="photo">${App.icons.icon('camera', 16)} Réessayer</button>
          <div class="ss-row"><button class="btn" data-ss="search">🔎 Chercher</button>${results.querySelector('[data-retry="crop"]') ? '<button class="btn" data-retry="crop">✂ Recadrer</button>' : ''}</div>
        </div></div>`;
      return show();
    }
    const own = App.col.get(G(), c.id), others = list.filter((x) => x !== c).slice(0, 8);
    const sure = (idx === 0 && c.confident) || (c.isTarget && !c.notRead);
    const pills = [
      own ? `<span class="pill small">Déjà ×${own.qty} — un exemplaire de plus</span>` : '',
      c.learned ? '<span class="pill small" style="background:var(--accent2)">Choisie par toi la dernière fois</span>' : '',
      sure ? '<span class="pill small" style="background:var(--ok);color:#063">Meilleure correspondance</span>' : '',
      c.numOk && c.ofOk ? `<span class="pill small ss-ok">${isPk() ? 'Numéro' : 'Code'} lu sur ta carte ✓</span>` : '',
    ].filter(Boolean).join('');
    const names = [...new Set(list.slice(0, 3).map((x) => x.name))].slice(0, 2);
    box.innerHTML = `<div class="sv-in">${head(list.length > 1 ? `C’est laquelle ? <span class="muted">· ${idx + 1} / ${list.length}</span>` : 'C’est elle ?')}
      <div class="sv-pair"><span class="bphoto ss-mine">${photo ? `<img src="${photo}" alt="Ta carte">` : ''}</span><img class="sv-off" src="${esc(A().img.card(c, 'low'))}" alt="Carte proposée"></div>
      <div class="sv-name">${esc(c.name)} ${A().rarity.symbol(c.rarity, 13)}</div>
      <div class="sv-why">${isPk() ? `n° ${esc(c.localId)} · ` : `<span class="sc-code">${codeOf(c)}</span> ${A().rarity.label ? esc(A().rarity.label(c.rarity)) + ' · ' : ''}`}${esc(App.views.scan.setLabel(c))}</div>
      ${pills ? `<div class="ss-pills">${pills}</div>` : ''}
      ${!sure ? `<div class="sv-why">${list.length > 1 ? 'Compare ta carte (à gauche) avec la proposition, ou touche une autre carte plus bas.' : 'Compare ta carte (à gauche) avec la proposition.'}</div>` : ''}
      ${isPk() ? '' : App.views.scan.codeZoomBox(G(), zoom)}
      ${statusHtml()}
      <div class="sv-acts ss-acts">
        <button class="btn primary" data-ss="yes">✓ C’est elle</button>
        <div class="ss-row"><button class="btn" data-retry="photo">${App.icons.icon('camera', 16)} Réessayer</button><button class="btn" data-ss="search">🔎 Chercher</button></div>
      </div>
      ${others.length ? `<div class="sv-alts"><span class="small muted">Ou bien l’une de celles-ci :</span>
        <div>${others.map((x) => `<button class="sv-alt" data-ss="alt" data-id="${esc(x.id)}"><img src="${esc(A().img.card(x, 'low'))}" alt=""><span><b>${esc(x.name)}</b></span><span class="muted">${isPk() ? esc(x.localId) : codeOf(x)}</span></button>`).join('')}</div></div>` : ''}
      ${names.map((n) => `<button class="linkbtn small" data-ss="versions" data-name="${esc(n)}">Toutes les versions de « ${esc(n)} »</button>`).join('')}
      <button class="linkbtn small ss-list" data-ss="list">Voir la liste détaillée</button></div>`;
    show();
  }
  /** « Tu as déjà cette carte » : même carte (photo) ou doublon */
  function dup(c) {
    const own = App.col.get(G(), c.id);
    mode = 'dup';
    box.innerHTML = `<div class="sv-in">${head('Déjà dans ton Dex')}
      <div class="sv-pair"><span class="bphoto ss-mine">${photo ? `<img src="${photo}" alt="Ta carte">` : ''}</span><img class="sv-off" src="${esc(A().img.card(c, 'low'))}" alt=""></div>
      <div class="sv-name">Tu as déjà ${esc(c.name)} (×${own ? own.qty : 1})</div>
      <div class="sv-why">Cette carte, c’est… Ta progression compte chaque carte une seule fois ; les doublons sont comptés à part.</div>
      <div class="sv-acts ss-acts">
        <button class="btn primary" data-ss="dupmode" data-v="doublon">Un autre exemplaire (doublon)</button>
        <button class="btn" data-ss="dupmode" data-v="photo">La même carte : utiliser cette photo</button>
        <button class="btn ghost" data-ss="dupmode" data-v="annuler">Annuler</button>
      </div></div>`;
    show();
  }

  /** « C'est elle » sur la carte affichée (aussi appelé tout seul quand la carte est sûre, v3.56) */
  function yes() {
    const c = list[idx]; if (!c) return;
    const p = results.querySelector(`[data-pick="${CSS.escape(c.id)}"]`); if (!p) return close();
    p.click();
    const dm = results.querySelector('[data-dupmode]');
    if (dm) dup(c); else close(); // (carte ajoutée : la page repart à zéro, voir scan-single.js)
  }
  box.addEventListener('click', (e) => {
    if (e.target.closest('[data-retry]')) { close(); return; } // (géré par la page : nouvelle photo / recadrage)
    if (e.target.closest('#sc-recrop')) { e.stopPropagation(); close(); const r = status.querySelector('#sc-recrop'); if (r) r.click(); return; }
    const b = e.target.closest('[data-ss]'); if (!b) return;
    const a = b.dataset.ss, c = list[idx];
    if (a === 'alt') { const i = list.findIndex((x) => x.id === b.dataset.id); if (i >= 0) { idx = i; draw(); box.scrollTop = 0; } return; }
    if (a === 'list') return close();
    if (a === 'search') {
      close();
      const m = el.querySelector('#sc-manual'); if (m) { m.classList.remove('hidden'); m.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      const inp = el.querySelector('#sc-name'); if (inp) setTimeout(() => inp.focus(), 400);
      return;
    }
    if (a === 'versions') { const v = results.querySelector(`[data-versions="${CSS.escape(b.dataset.name)}"]`); if (v) { b.disabled = true; b.textContent = 'Chargement…'; v.click(); } return; }
    if (a === 'yes' && c) return yes();
    if (a === 'dupmode') {
      const d = results.querySelector(`[data-dupmode="${b.dataset.v}"]`); if (!d) return close();
      if (b.dataset.v === 'annuler') { d.click(); return; } // (la liste revient : pick() la redessine)
      close(); d.click();
    }
  });
  // messages de la page (photo floue, certification, licence changée…) recopiés dans l'écran
  const mo = new MutationObserver(() => { const s = box.querySelector('.ss-status'); if (s) s.innerHTML = status.innerHTML; });
  mo.observe(status, { childList: true, subtree: true, characterData: true });
  // pendant la lecture : l'étape écrite sur la carte et la photo (remplacée par un meilleur cadrage) suivent la page
  const mv = new MutationObserver(() => {
    if (!open || mode !== 'scan') return;
    const l = view.querySelector('.sc-scanlbl span'); if (l) msg(l.textContent);
    const im = view.querySelector('.bphoto img'); if (im && im.src && im.src !== photo) setPhoto(im.src);
  });
  mv.observe(view, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['src'] });

  return { scan, msg, setPhoto, pick, yes, close, get open() { return open; }, stop: () => { mo.disconnect(); mv.disconnect(); close(); } };
};
