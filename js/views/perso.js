/*
 * Collections perso (v4.03, voir js/games/perso.js) : ajouter une carte d'une licence hors des 10 de base (#/perso/ajouter),
 * et « Proposer une licence » (la demande part par e-mail / partage vers collecdex.app@gmail.com).
 */
App.views.persoAdd = {
  // noms proposés quand on n'a encore rien ajouté
  SUGGEST: ['Digimon', 'Magic: The Gathering', 'Flesh and Blood', 'Naruto', 'Dragon Ball Z (Panini)', 'Cartes de supermarché'],
  RARITIES: ['Commune', 'Peu commune', 'Rare', 'Holo', 'Super rare', 'Secrète'],

  async render(el, params, alive) {
    const { esc } = App.util, I = App.icons.icon, ad = App.games.get('perso');
    const known = ad.known();
    const q = params.query;
    // licence et série de la dernière carte ajoutée (sans ?lic= : ouverte depuis Capturer)
    let last = {}; try { last = JSON.parse(localStorage.getItem('persoLast') || '{}') || {}; } catch (e) { /* */ }
    if (!q.lic && last.lic && known.has(last.lic)) { q.lic = last.lic; q.serie = q.serie || last.serie || ''; }
    let photo = null; // carte recadrée (Blob)
    let found = null; // carte retrouvée dans une base (Digimon) : visuel officiel

    const lics = [...new Set([...known.keys(), ...App.views.persoAdd.SUGGEST])];
    el.innerHTML = `
      <div class="breadcrumb"><a href="#/">Accueil</a> › <a href="#/jeu/perso">Collections perso</a> › Ajouter</div>
      <h1 style="margin:0 0 4px">Ajouter une carte perso</h1>
      <p class="muted small" style="margin:0 0 14px">Pour les licences hors des 10 de l’appli. Tu ne vois que tes cartes : pas de combats ni de prix.</p>
      <div class="pa-wrap">
        <div class="pa-photo panel" id="pa-photo">
          <div class="pa-empty">${I('camera', 34)}<b>Photo de ta carte</b><span class="small muted">Elle devient son visuel</span></div>
        </div>
        <div class="row action-dock" style="margin:10px 0 0">
          <label class="btn primary">${I('camera', 16)} Prendre la photo<input type="file" accept="image/*" capture="environment" id="pa-cam" hidden></label>
          <label class="btn">Choisir une photo<input type="file" accept="image/*" id="pa-file" hidden></label>
        </div>
        <div class="small pa-read" id="pa-read" hidden></div>
        <form class="pa-form panel" id="pa-form" autocomplete="off">
          <label>Licence<input type="text" id="pa-lic" list="pa-lics" required maxlength="40" placeholder="ex. Digimon" value="${esc(q.lic || '')}"></label>
          <datalist id="pa-lics">${lics.map((l) => `<option value="${esc(l)}">`).join('')}</datalist>
          <label>Série<input type="text" id="pa-set" list="pa-sets" maxlength="60" placeholder="ex. Digi-Battle (1999)" value="${esc(q.serie || '')}"></label>
          <datalist id="pa-sets"></datalist>
          <div class="pa-two">
            <label>Numéro<input type="text" id="pa-num" maxlength="24" placeholder="ex. Bo-113, 18"></label>
            <label>Rareté<input type="text" id="pa-rar" list="pa-rars" maxlength="30" placeholder="facultatif"></label>
          </div>
          <datalist id="pa-rars">${App.views.persoAdd.RARITIES.map((r) => `<option value="${esc(r)}">`).join('')}</datalist>
          <div class="small muted" id="pa-found" hidden></div>
          <label>Nom de la carte<input type="text" id="pa-name" required maxlength="80" placeholder="ex. Garurumon"></label>
          <label>Cartes dans la série<input id="pa-total" type="number" min="0" max="5000" inputmode="numeric" placeholder="facultatif (ex. 40)"></label>
          <button class="btn primary" id="pa-save" type="submit" disabled>${I('plus', 16)} Ajouter à mon Dex</button>
        </form>
        <div id="pa-done"></div>
        <p class="small muted" style="margin-top:18px">Ta licence n’est pas dans la liste et tu aimerais qu’elle soit mieux prise en charge ? <a href="#" id="pa-propose">Proposer une licence</a></p>
      </div>`;

    const $ = (s) => el.querySelector(s);
    const fillSets = () => {
      const sets = known.get($('#pa-lic').value.trim()) || new Set();
      $('#pa-sets').innerHTML = [...sets].filter(Boolean).map((s) => `<option value="${esc(s)}">`).join('');
      const tot = totalOf($('#pa-lic').value, $('#pa-set').value);
      if (tot && !$('#pa-total').value) $('#pa-total').value = tot;
    };
    const totalOf = (lic, set) => { const id = ad.setIdOf(lic, set || 'Sans série'); const it = App.col.all().find((x) => x.game === 'perso' && x.setId === id); return (it && it.perso && it.perso.total) || 0; };
    const ready = () => { $('#pa-save').disabled = !(photo && $('#pa-lic').value.trim() && $('#pa-name').value.trim()); };
    fillSets();
    $('#pa-lic').addEventListener('input', () => { fillSets(); ready(); });
    $('#pa-set').addEventListener('change', fillSets);
    $('#pa-name').addEventListener('input', ready);

    // Digimon Card Game : code « BT1-010 » → nom, série, rareté et visuel officiel
    $('#pa-num').addEventListener('change', async () => {
      const lic = $('#pa-lic').value, num = $('#pa-num').value;
      found = null; $('#pa-found').hidden = true;
      const c = await ad.lookup(lic, num).catch(() => null);
      if (!alive() || !c || $('#pa-num').value !== num) return;
      found = c;
      if (!$('#pa-name').value.trim()) $('#pa-name').value = c.name;
      if (!$('#pa-set').value.trim() && c.setName) $('#pa-set').value = c.setName;
      if (!$('#pa-rar').value.trim() && c.rarity) $('#pa-rar').value = c.rarity;
      $('#pa-found').hidden = false;
      $('#pa-found').innerHTML = `${I('check', 13)} Carte trouvée : <b>${esc(c.name)}</b>${c.setName ? ' · ' + esc(c.setName) : ''}`;
      ready();
    });

    // photo → carte détourée toute seule (détecteur de bords du scanner), sinon la photo entière
    const takePhoto = async (file) => {
      if (!file) return;
      const box = $('#pa-photo');
      box.innerHTML = `<div class="pa-empty">${App.ui.loading()}</div>`;
      let blob = file;
      try {
        await App.need('reco', 'scan');
        const img = await createImageBitmap(file), R = App.recognizer;
        const nb = R.bestCard(img);
        const r = nb ? { quad: nb.quad, canvas: App.views.scan.warpTo(img, nb.quad), fit: 1 } : R.cutCard(img, { x: 0.01, y: 0.01, w: 0.98, h: 0.98 });
        if (r && r.fit >= 0.45 && r.canvas) blob = await new Promise((res) => r.canvas.toBlob(res, 'image/webp', 0.9)) || file;
      } catch (e) { console.warn(e); }
      if (!alive()) return;
      photo = blob;
      box.innerHTML = `<img src="${URL.createObjectURL(blob)}" alt="Ta carte">`;
      ready();
      readPhoto(blob);
    };

    // v4.05 : la carte est lue (numéro, nom, licence) et les cases vides sont pré-remplies ; tout reste modifiable
    const status = (html) => { const s = $('#pa-read'); s.hidden = !html; s.innerHTML = html || ''; };
    const fill = (sel, v) => { if (v && !$(sel).value.trim()) { $(sel).value = v; $(sel).classList.add('pa-auto'); } };
    const readPhoto = async (blob) => {
      const mine = photo;
      status(`<span class="pa-spin"></span> Je lis la carte…`);
      let g = null;
      try { g = await App.views.persoAdd.read(blob, [...known.keys(), ...App.views.persoAdd.SUGGEST]); } catch (e) { console.warn(e); }
      if (!alive() || photo !== mine) return;
      if (!g || !(g.num || g.name || g.lic)) { status(`Je n’ai rien pu lire : écris le nom et le numéro.`); $('#pa-name').focus(); return; }
      const pre = ad.setByPrefix(g.num, g.lic);
      fill('#pa-lic', g.lic || (pre && pre.lic));
      const lic = $('#pa-lic').value.trim();
      const had = ad.ownedByNum(g.num, lic);
      fill('#pa-num', g.num);
      if (had) { fill('#pa-name', had.snap.name); fill('#pa-set', had.snap.setName); fill('#pa-rar', had.snap.rarity); }
      fill('#pa-name', g.name);
      fill('#pa-set', pre && (!lic || pre.lic === lic) ? pre.set : '');
      if (g.total) fill('#pa-total', String(g.total));
      fillSets(); ready();
      status(`${I('check', 13)} Lu sur la carte : <b>${esc([g.num, g.name].filter(Boolean).join(' · ') || g.lic)}</b>${had ? ' — <b>déjà dans ton Dex</b> (un exemplaire de plus)' : ''}. Vérifie et corrige si besoin.`);
      if (g.num) $('#pa-num').dispatchEvent(new Event('change')); // Digimon récent : la carte retrouvée par son code
      if (!$('#pa-name').value.trim()) $('#pa-name').focus();
    };
    for (const f of ['#pa-lic', '#pa-set', '#pa-num', '#pa-name', '#pa-rar', '#pa-total']) $(f).addEventListener('input', () => $(f).classList.remove('pa-auto'));
    $('#pa-cam').addEventListener('change', (e) => takePhoto(e.target.files[0]));
    $('#pa-file').addEventListener('change', (e) => takePhoto(e.target.files[0]));

    $('#pa-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const lic = $('#pa-lic').value.trim(), setName = $('#pa-set').value.trim() || 'Sans série', num = $('#pa-num').value.trim(), name = $('#pa-name').value.trim();
      if (!photo || !lic || !name) return;
      $('#pa-save').disabled = true;
      try {
        const id = ad.cardIdOf(lic, setName, num, name), setId = ad.setIdOf(lic, setName);
        const card = { id, localId: num, name, image: found ? found.image : '', rarity: $('#pa-rar').value.trim(), setId, serieId: ad.setIdOf(lic, '').replace(/--.*$/, '') };
        const set = { id: setId, name: setName, symbol: '', official: null, group: { id: card.serieId, name: lic } };
        const had = App.col.get('perso', id);
        const it = await App.col.add('perso', card, set);
        const total = Math.max(0, Math.floor(+$('#pa-total').value || 0));
        await App.col.update(it.key, { variants: ['normal'], perso: { ...(it.perso || {}), lic, total: total || (it.perso && it.perso.total) || 0, code: num, text: found ? found.text : ((it.perso && it.perso.text) || '') } });
        if (total) await ad.setTotal(setId, total);
        if (!had) await App.col.addPhoto(it.key, photo, { makeDisplay: true });
        App.util.toast(had ? `+1 exemplaire : ${name}` : `${name} ajoutée à ton Dex`);
        // carte suivante : même licence, même série
        photo = null; found = null;
        $('#pa-photo').innerHTML = `<div class="pa-empty">${I('camera', 34)}<b>Carte suivante</b><span class="small muted">Même licence et même série</span></div>`;
        for (const f of ['#pa-num', '#pa-name', '#pa-rar', '#pa-total']) $(f).value = '';
        fillSets(); // (nombre de cartes de cette série, s'il est connu)
        $('#pa-found').hidden = true;
        $('#pa-done').innerHTML = `<div class="panel pa-ok">${I('check', 16)} <b>${esc(name)}</b> est dans ta collection perso. <a href="#/jeu/perso/serie/${encodeURIComponent(setId)}">Voir la série ›</a></div>`;
        known.has(lic) ? known.get(lic).add(setName) : known.set(lic, new Set([setName]));
        try { localStorage.setItem('persoLast', JSON.stringify({ lic, serie: setName === 'Sans série' ? '' : setName })); } catch (e2) { /* */ }
        status('');
      } catch (err) {
        console.error(err);
        App.util.toast('La carte n’a pas pu être ajoutée');
      }
      ready();
    });

    $('#pa-propose').addEventListener('click', (e) => { e.preventDefault(); App.views.persoAdd.propose(photo); });
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
