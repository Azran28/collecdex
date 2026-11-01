/*
 * Collections perso (v4.03, voir js/games/perso.js) : ajouter une carte d'une licence hors des 10 de base (#/perso/ajouter),
 * et « Proposer une licence » (la demande part par e-mail / partage vers collecdex.app@gmail.com).
 */
App.views.persoAdd = {
  // noms proposés quand on n'a encore rien ajouté
  SUGGEST: ['Digimon', 'Magic: The Gathering', 'Flesh and Blood', 'Naruto', 'Dragon Ball Z (Panini)', 'Cartes de supermarché'],
  RARITIES: ['Commune', 'Peu commune', 'Rare', 'Holo', 'Super rare', 'Secrète'],

  // v4.09 (Arnaud : « j'aime pas l'idée du formulaire ») : comme le scanner des autres licences — photo d'abord,
  // la carte est lue, un résultat (nom / numéro touchables pour corriger) et « Ajouter » ; licence + série choisies une fois.
  async render(el, params, alive) {
    const { esc } = App.util, I = App.icons.icon, ad = App.games.get('perso');
    const known = ad.known();
    const q = params.query;
    const lics = () => [...new Set([...known.keys(), ...App.views.persoAdd.SUGGEST])];
    // licence et série : ?lic=&serie= (fiche, page de série), sinon celles de la dernière carte ajoutée
    let last = {}; try { last = JSON.parse(localStorage.getItem('persoLast') || '{}') || {}; } catch (e) { /* */ }
    const st = q.lic ? { lic: q.lic, set: q.serie || '' } : { lic: (last.lic && known.has(last.lic) && last.lic) || '', set: (last.lic && known.has(last.lic) && last.serie) || '' };
    let cur = null; // carte en cours : { blob, url, num, name, total, had, found, state }
    let mode = q.mode === 'page' ? 'page' : 'carte', fmt = '3x3';
    try { if (!q.mode) mode = localStorage.getItem('persoMode') === 'page' ? 'page' : 'carte'; fmt = localStorage.getItem('persoFmt') === '2x2' ? '2x2' : '3x3'; } catch (e) { /* */ }
    const touch = matchMedia('(pointer: coarse)').matches;

    el.innerHTML = `
      <div class="breadcrumb"><a href="#/">Accueil</a> › <a href="#/jeu/perso">Collections perso</a> › Ajouter</div>
      <div class="pa-wrap">
        <div class="pa-top">
          <button class="pa-where" id="pa-where" type="button"></button>
          <div class="chips pa-mode" id="pa-mode" role="tablist">
            <button class="chip" data-m="carte" type="button">Une carte</button>
            <button class="chip" data-m="page" type="button">Page de classeur</button>
            <span class="chips" id="pa-fmt"><button class="chip" data-f="3x3" type="button">9</button><button class="chip" data-f="2x2" type="button">4</button></span>
          </div>
        </div>
        <div id="pa-stage"></div>
        <input type="file" accept="image/*" capture="environment" id="pa-cam" hidden>
        <input type="file" accept="image/*" id="pa-file" hidden>
        <p class="small muted pa-foot">Pour les licences hors des 10 de l’appli : tu ne vois que tes cartes, sans combats ni prix. Ta licence mériterait mieux ? <a href="#" id="pa-propose">Proposer une licence</a></p>
      </div>`;
    const $ = (s) => el.querySelector(s);

    const drawWhere = () => {
      // v4.11 (Arnaud : « le choix de licence n'est pas assez évident ») : « Licence » écrit en toutes lettres, pastille « Changer »
      $('#pa-where').innerHTML = st.lic
        ? `${I('box', 18)}<span><small>Licence${st.set ? ' · série' : ''}</small><b>${esc(st.lic)}</b>${st.set ? ` · ${esc(st.set)}` : ''}</span><em>Changer</em>`
        : `${I('box', 18)}<span><small>Licence</small><b>Pas encore choisie</b></span><em>Choisir</em>`;
      $('#pa-where').classList.toggle('none', !st.lic);
    };
    // série de la dernière carte ajoutée dans cette licence ('' si aucune)
    const lastSet = (lic) => { const it = App.col.all().filter((x) => x.game === 'perso' && App.util.norm((x.perso && x.perso.lic) || '') === App.util.norm(lic)).sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0))[0]; const s = it && it.snap.setName; return s && s !== 'Sans série' ? s : ''; };
    const setWhere = (lic, set) => { if (lic !== st.lic || set !== st.set) st.total = 0; st.lic = lic; st.set = set; drawWhere(); };
    // licence + série : une fenêtre avec des pastilles (licences déjà utilisées d'abord), ou un nom à écrire
    const pick = () => new Promise((done) => {
      let lic = st.lic, set = st.set, ok = false;
      const box = App.util.openModal(`
        <h2 style="margin-top:0">Licence et série</h2>
        <div class="chips pk-chips" id="pk-lics"></div>
        <input type="text" id="pk-lic" class="pk-in" maxlength="40" placeholder="Autre licence…">
        <h3 class="pk-h">Série <span class="small muted">(facultatif)</span></h3>
        <div class="chips pk-chips" id="pk-sets"></div>
        <input type="text" id="pk-set" class="pk-in" maxlength="60" placeholder="ex. Digi-Battle (1999)">
        <button class="btn primary pk-ok" id="pk-ok" type="button">OK</button>`, () => done(ok ? { lic, set } : null));
      const draw = () => {
        const all = lics(); if (lic && !all.includes(lic)) all.unshift(lic);
        box.querySelector('#pk-lics').innerHTML = all.map((l) => `<button class="chip ${l === lic ? 'on' : ''}" data-l="${esc(l)}" type="button">${esc(l)}</button>`).join('');
        const sets = [...(known.get(lic) || [])].filter((s) => s && s !== 'Sans série'); if (set && !sets.includes(set)) sets.unshift(set);
        box.querySelector('#pk-sets').innerHTML = sets.map((s) => `<button class="chip ${s === set ? 'on' : ''}" data-s="${esc(s)}" type="button">${esc(s)}</button>`).join('');
        box.querySelector('#pk-ok').disabled = !lic;
      };
      box.addEventListener('click', (e) => {
        const l = e.target.closest('[data-l]'), s = e.target.closest('[data-s]');
        if (l) { if (l.dataset.l !== lic) set = ''; lic = l.dataset.l; box.querySelector('#pk-lic').value = ''; draw(); }
        else if (s) { set = s.dataset.s === set ? '' : s.dataset.s; box.querySelector('#pk-set').value = ''; draw(); }
        else if (e.target.closest('#pk-ok') && lic) { ok = true; App.util.closeModal(); }
      });
      box.querySelector('#pk-lic').addEventListener('input', (e) => { const v = e.target.value.trim(); if (v) { if (v !== lic) set = ''; lic = v; } draw(); });
      box.querySelector('#pk-set').addEventListener('input', (e) => { set = e.target.value.trim(); draw(); });
      draw();
    }).then((r) => { if (r) setWhere(r.lic, r.set); return r; });
    $('#pa-where').addEventListener('click', () => pick().then(() => { if (cur && cur.state === 'done') drawCard(); }));
    $('#pa-stage').addEventListener('click', (e) => {
      const l = e.target.closest('[data-lic]'), p = e.target.closest('[data-pick]'), b = e.target.closest('[data-base]');
      if (l) { setWhere(l.dataset.lic, lastSet(l.dataset.lic)); if (cur) cur.moved = false; drawCard(); }
      else if (p) pick().then(() => { if (cur && cur.state === 'done') { cur.moved = false; drawCard(); } });
      else if (b && cur) { App.photoHandoff = { blob: cur.blob, to: 'scan' }; App.views.scan.remember(b.dataset.base); location.hash = `#/scan?jeu=${encodeURIComponent(b.dataset.base)}`; }
    });

    // ----- étapes -----
    const drawEmpty = (next = false) => {
      cur = null;
      const page = mode === 'page';
      $('#pa-stage').innerHTML = `
        <label for="pa-cam" class="pa-photo pa-shot panel ${page ? 'page' : ''}">
          <span class="pa-empty">${I('camera', 38)}<b>${page ? 'Prends la page en photo' : next ? 'Carte suivante' : 'Prends ta carte en photo'}</b>
          <span class="small muted">${page ? `Les ${fmt === '2x2' ? 4 : 9} cartes sont découpées et lues` : 'Je la lis et elle devient son visuel'}</span></span>
        </label>
        <div class="pa-alt"><label for="pa-file" class="btn sm">Choisir une photo dans la galerie</label></div>`;
    };
    const drawCard = () => {
      const c = cur, busy = c.state === 'read';
      const tag = busy ? `<span class="pa-spin"></span> Je lis la carte…`
        : c.had ? `${I('check', 13)} Déjà dans ton Dex : un exemplaire de plus`
        : c.found ? `${I('check', 13)} Carte retrouvée`
        : c.name ? `${I('check', 13)} Lu sur la carte` : `Je n’ai pas pu lire le nom : touche-le pour l’écrire`;
      const bn = c.base && App.games.info(c.base).name;
      // licence dans le résultat : pastilles tout de suite si elle n'est pas choisie, sinon une ligne touchable
      const licRow = !st.lic
        ? `<div class="pa-ask"><b>C’est quelle licence ?</b><div class="chips">${lics().slice(0, 6).map((l) => `<button class="chip" type="button" data-lic="${esc(l)}">${esc(l)}</button>`).join('')}<button class="chip" type="button" data-pick>Autre…</button></div></div>`
        : `<button class="pa-licrow" type="button" data-pick>${I('box', 13)}<span><b>${esc(st.lic)}</b> · ${st.set ? esc(st.set) : '<i>sans série</i>'}</span>${I('pencil', 12)}</button>${c.moved ? `<span class="pa-tag small todo">Licence lue sur la carte : passée en ${esc(st.lic)}</span>` : ''}`;
      $('#pa-stage').innerHTML = `
        ${bn ? `<div class="pa-base panel">${App.ui.licIc(c.base, 16, 'lic-ic-xs')}<span><b>On dirait une carte ${esc(bn)} !</b> ${esc(bn)} est une licence complète de l’appli : elle y sera reconnue avec toute sa série.</span><button class="btn sm primary" type="button" data-base="${esc(c.base)}">Scanner en ${esc(bn)}</button></div>` : ''}
        <div class="pa-res panel">
          <div class="pa-res-img"><img src="${c.url}" alt="Ta carte"></div>
          <div class="pa-res-info">
            <span class="pa-tag small ${busy ? '' : c.name ? 'ok' : 'todo'}">${tag}</span>
            <label class="pa-edit"><input type="text" id="pa-name" class="pa-name" maxlength="80" value="${esc(c.name)}" placeholder="${busy ? '…' : 'Nom de la carte'}" ${busy ? 'disabled' : ''}>${I('pencil', 14)}</label>
            <label class="pa-edit pa-numl">n° <input type="text" id="pa-num" class="pa-num" maxlength="24" value="${esc(c.num)}" placeholder="—" ${busy ? 'disabled' : ''}></label>
            ${busy ? '' : licRow}
          </div>
        </div>
        <div class="row action-dock pa-acts">
          <button class="btn primary" id="pa-save" type="button" ${busy ? 'disabled' : ''}>${I('plus', 16)} Ajouter</button>
          <label for="pa-cam" class="btn">${I('camera', 16)} Reprendre</label>
        </div>`;
      $('#pa-name').addEventListener('input', (e) => { c.name = e.target.value; });
      $('#pa-num').addEventListener('input', (e) => { c.num = e.target.value; });
      $('#pa-num').addEventListener('change', () => lookup(c));
      $('#pa-save').addEventListener('click', () => saveCard(c));
    };

    // Digimon Card Game : code « BT1-010 » → nom, série, rareté et visuel officiel
    const lookup = async (c) => {
      const num = c.num, f = await ad.lookup(st.lic, num).catch(() => null);
      if (!alive() || !f || cur !== c || c.num !== num) return;
      c.found = f;
      if (!c.name.trim()) c.name = f.name;
      if (!st.set && f.setName) setWhere(st.lic, f.setName);
      drawCard();
    };

    // photo → carte détourée (détecteur du scanner), affichée tout de suite, puis lue
    const takePhoto = async (file) => {
      const c = cur = { blob: file, url: '', num: '', name: '', total: 0, had: false, found: null, state: 'read' };
      $('#pa-stage').innerHTML = `<div class="pa-photo panel"><span class="pa-empty">${App.ui.loading()}</span></div>`;
      try {
        await App.need('reco', 'scan');
        const img = await createImageBitmap(file), R = App.recognizer;
        const nb = R.bestCard(img);
        const r = nb ? { quad: nb.quad, canvas: App.views.scan.warpTo(img, nb.quad), fit: 1 } : R.cutCard(img, { x: 0.01, y: 0.01, w: 0.98, h: 0.98 });
        if (r && r.fit >= 0.45 && r.canvas) c.blob = await new Promise((res) => r.canvas.toBlob(res, 'image/webp', 0.9)) || file;
      } catch (e) { console.warn(e); }
      if (!alive() || cur !== c) return;
      c.url = URL.createObjectURL(c.blob);
      drawCard();
      // v4.11 : carte d’une des licences de base (Pokémon, One Piece…) ? lu en même temps (~1 s) → « Scanner en Pokémon »
      App.views.scan.licenceScores(c.blob).then((sc) => {
        const g = App.views.scan.clearLicence(sc);
        if (g && alive() && cur === c) { c.base = g; if (c.state === 'done') drawCard(); }
      }).catch(() => {});
      let g = null;
      try { g = await App.views.persoAdd.read(c.blob, lics()); } catch (e) { console.warn(e); }
      if (!alive() || cur !== c) return;
      c.state = 'done';
      if (g) {
        const pre = ad.setByPrefix(g.num, g.lic || st.lic);
        // licence écrite sur la carte (« Slam Attax », « Akiyoshi Hongo »…) ≠ celle de la carte d'avant → on y passe (et on le dit)
        if (st.lic && g.lic && App.util.norm(g.lic) !== App.util.norm(st.lic)) { setWhere(g.lic, (pre && pre.lic === g.lic && pre.set) || lastSet(g.lic)); c.moved = true; }
        else if (!st.lic && (g.lic || pre)) setWhere(g.lic || pre.lic, pre && (!g.lic || pre.lic === g.lic) ? pre.set : '');
        else if (pre && pre.lic === st.lic && !st.set) setWhere(st.lic, pre.set);
        const had = ad.ownedByNum(g.num, st.lic);
        c.num = g.num || ''; c.total = g.total || 0;
        c.name = (had && had.snap.name) || g.name || '';
        if (had) { c.had = true; if (had.snap.setName && had.snap.setName !== 'Sans série') setWhere(st.lic, had.snap.setName); }
        if (g.total && !st.total) st.total = g.total;
      }
      drawCard();
      if (c.num) lookup(c);
    };

    const saveCard = async (c) => {
      if (!c.name.trim() && !c.num.trim()) { App.util.toast('Écris le nom de la carte'); $('#pa-name').focus(); return; }
      if (!st.lic && !(await pick())) return;
      $('#pa-save').disabled = true;
      const name = c.name.trim() || `n° ${c.num.trim()}`;
      try {
        const { had } = await App.views.persoAdd.save({ lic: st.lic, setName: st.set, num: c.num.trim(), name, rar: (c.found && c.found.rarity) || '', total: c.total, blob: c.blob, found: c.found });
        App.util.toast(had ? `+1 exemplaire : ${name}` : `${name} ajoutée à ton Dex`);
        const s = st.set || 'Sans série'; known.has(st.lic) ? known.get(st.lic).add(s) : known.set(st.lic, new Set([s]));
        drawEmpty(true);
        if (touch) $('#pa-cam').click(); // téléphone : l'appareil photo revient pour la carte suivante
      } catch (err) {
        console.error(err);
        App.util.toast('La carte n’a pas pu être ajoutée');
        if ($('#pa-save')) $('#pa-save').disabled = false;
      }
    };

    // v4.08 : « Page de classeur » — chaque carte de la page repérée, lue, puis ajoutée d'un coup (js/views/perso-page.js)
    const setMode = (m) => {
      mode = m;
      el.querySelectorAll('#pa-mode [data-m]').forEach((b) => b.classList.toggle('on', b.dataset.m === m));
      el.querySelectorAll('#pa-fmt [data-f]').forEach((b) => b.classList.toggle('on', b.dataset.f === fmt));
      $('#pa-fmt').hidden = m !== 'page';
      try { localStorage.setItem('persoMode', m); localStorage.setItem('persoFmt', fmt); } catch (e) { /* */ }
      drawEmpty();
    };
    $('#pa-mode').addEventListener('click', (e) => { const b = e.target.closest('[data-m]'), f = e.target.closest('[data-f]'); if (f) { fmt = f.dataset.f; setMode(mode); } else if (b) setMode(b.dataset.m); });
    const onFile = (file) => {
      if (!file) return;
      if (mode !== 'page') return takePhoto(file);
      cur = null;
      App.views.persoPage.run(file, { box: $('#pa-stage'), alive, fmt, lics: lics(), pick,
        shared: () => ({ lic: st.lic, setName: st.set, total: st.total || 0 }),
        fillLic: (v) => { if (!st.lic) setWhere(v, ''); }, fillSet: (v) => { if (!st.set) setWhere(st.lic, v); }, fillTotal: (v) => { if (!st.total) st.total = v; },
        saved: (lic, setName) => { known.has(lic) ? known.get(lic).add(setName) : known.set(lic, new Set([setName])); } });
    };
    $('#pa-cam').addEventListener('change', (e) => { onFile(e.target.files[0]); e.target.value = ''; });
    $('#pa-file').addEventListener('change', (e) => { onFile(e.target.files[0]); e.target.value = ''; });
    $('#pa-propose').addEventListener('click', (e) => { e.preventDefault(); App.views.persoAdd.propose(cur && cur.blob); });

    drawWhere();
    setMode(mode);
    // v4.11 : photo venue de Capturer (« On dirait une carte Digimon › Ajouter à ma collection perso ») → lue ici
    const hand = App.photoHandoff;
    if (hand && hand.to === 'perso' && hand.blob) { App.photoHandoff = null; if (mode === 'page') setMode('carte'); onFile(hand.blob); }
    // Capturer › « Autre licence » (?photo=1) : l'appareil photo s'ouvre tout de suite sur téléphone
    else if (q.photo && touch) try { $('#pa-cam').click(); } catch (e) { /* */ }
  },

  /** Ajoute une carte perso (ou +1 exemplaire) → { had, setId } ; sa photo devient son visuel */
  async save({ lic, setName, num, name, rar = '', total = 0, blob, found = null }) {
    const ad = App.games.get('perso');
    setName = setName || 'Sans série';
    const id = ad.cardIdOf(lic, setName, num, name), setId = ad.setIdOf(lic, setName);
    const card = { id, localId: num, name, image: found ? found.image : '', rarity: rar, setId, serieId: ad.setIdOf(lic, '').replace(/--.*$/, '') };
    const set = { id: setId, name: setName, symbol: '', official: null, group: { id: card.serieId, name: lic } };
    const had = App.col.get('perso', id);
    const it = await App.col.add('perso', card, set);
    total = Math.max(0, Math.floor(+total || 0));
    await App.col.update(it.key, { variants: ['normal'], perso: { ...(it.perso || {}), lic, total: total || (it.perso && it.perso.total) || 0, code: num, text: found ? found.text : ((it.perso && it.perso.text) || '') } });
    if (total) await ad.setTotal(setId, total);
    if (!had && blob) await App.col.addPhoto(it.key, blob, { makeDisplay: true });
    try { localStorage.setItem('persoLast', JSON.stringify({ lic, serie: setName === 'Sans série' ? '' : setName })); } catch (e) { /* */ }
    return { had: !!had, setId };
  },

  /**
   * Lecture d'une carte perso (v4.05) → { num, name, total, lic } : PaddleOCR sur des bandes de toute la carte, droite puis
   * tournée d'un quart de tour (noms écrits à la verticale) ; Tesseract en secours si aucun nom (« 18 Garurumon DP 300 »).
   */
  async read(blob, lics) {
    await App.need('reco', 'scan');
    const P = App.recognizerParts, O = P.codeOcr, ad = App.games.get('perso');
    const img = await createImageBitmap(blob);
    const rot = (q) => { // carte tournée de q quarts de tour vers la droite
      const c = document.createElement('canvas'), side = q % 2;
      c.width = side ? img.height : img.width; c.height = side ? img.width : img.height;
      const x = c.getContext('2d'); x.translate(c.width / 2, c.height / 2); x.rotate(q * Math.PI / 2); x.drawImage(img, -img.width / 2, -img.height / 2);
      return c;
    };
    const zones = []; for (let y = 0; y < 0.9; y += 0.08) zones.push([y, Math.min(1, y + 0.16), 0, 1]);
    const lines = async (src) => { const rd = await O.read(src, [], { zones }); return rd ? rd.texts.filter((t, i) => rd.confs[i] > 0.85) : []; };
    let flat = await lines(img), turned = await lines(rot(1));
    let g = ad.guess({ flat, turned }, { lics });
    // v4.07 : carte photographiée à l'envers, ou nom écrit dans l'autre sens → les deux autres sens
    if (!g.name) { turned = [...turned, ...(await lines(rot(3)))]; flat = [...flat, ...(await lines(rot(2)))]; g = ad.guess({ flat, turned }, { lics }); }
    if (!g.name) {
      const w = await P.getWorker(), r = await w.recognize(blob).catch(() => null);
      g = ad.guess({ flat, turned, tess: (r && r.data && r.data.text) || '' }, { lics });
    }
    return g;
  },

  /** « Proposer une licence » : nom du jeu (+ photo de la carte s'il y en a une) envoyés à collecdex.app@gmail.com */
  async propose(photo = null) {
    const { esc } = App.util;
    const box = App.util.openModal(`
      <h2 style="margin-top:0">Proposer une licence</h2>
      <p class="muted small">Dis-nous quel jeu de cartes tu collectionnes : s’il est demandé, il pourra être mieux pris en charge (cartes reconnues toutes seules).</p>
      <label class="pa-form" style="display:block">Nom de la licence<input type="text" id="pp-name" maxlength="60" placeholder="ex. Digimon (1999), Naruto Kayou…"></label>
      <label class="pa-form" style="display:block;margin-top:8px">Un mot (facultatif)<input type="text" id="pp-note" maxlength="200" placeholder="ex. j’ai 300 cartes françaises"></label>
      <div class="row" style="margin-top:14px;gap:8px"><button class="btn primary" id="pp-send">Envoyer</button><button class="btn" id="pp-cancel">Annuler</button></div>`);
    const root = box && box.querySelector ? box : document;
    root.querySelector('#pp-cancel').addEventListener('click', () => App.util.closeModal());
    root.querySelector('#pp-send').addEventListener('click', async () => {
      const name = root.querySelector('#pp-name').value.trim(), note = root.querySelector('#pp-note').value.trim();
      if (!name) { root.querySelector('#pp-name').focus(); return; }
      const text = `Proposition de licence pour CollecDex : ${name}${note ? '\n' + note : ''}\n(version ${window.APP_VERSION || ''})`;
      App.util.closeModal();
      const file = photo ? new File([photo], 'carte.webp', { type: photo.type || 'image/webp' }) : null;
      if (file && navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: 'CollecDex — proposer une licence', text: `${text}\nÀ envoyer à collecdex.app@gmail.com` }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
      }
      location.href = `mailto:collecdex.app@gmail.com?subject=${encodeURIComponent('Proposer une licence : ' + name)}&body=${encodeURIComponent(text)}`;
      App.util.toast(`Merci ! Ta proposition « ${name} » est prête à partir`);
    });
  },
};
