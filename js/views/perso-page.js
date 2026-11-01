/*
 * Collections perso, page de classeur (v4.08, Arnaud : ses DreamWorks de Carrefour et WWE Slam Attax sont rangées en classeur).
 * Une photo de la page → chaque carte repérée (même détecteur que Capturer › Classeur : R.detectCards / detectLoose, sinon la grille),
 * lue l'une après l'autre (App.views.persoAdd.read), puis une liste à vérifier et « Ajouter les N cartes » d'un coup.
 * Licence, série et total = ceux de la page d'ajout (bouton en haut, ctx.pick). Carte déjà dans le Dex (même numéro) : décochée.
 */
App.views.persoPage = {
  async run(file, ctx) {
    const { esc } = App.util, I = App.icons.icon, ad = App.games.get('perso');
    const { box, alive } = ctx;
    const run = (App.views.persoPage.token = (App.views.persoPage.token || 0) + 1);
    const live = () => alive() && run === App.views.persoPage.token;
    box.innerHTML = `<div class="panel pp-wait"><span class="pa-spin"></span> Je repère les cartes de la page…</div>`;

    await App.need('reco', 'scan');
    const R = App.recognizer, [cols, rows] = ctx.fmt === '2x2' ? [2, 2] : [3, 3];
    const img = await createImageBitmap(file);
    let quads = null, src = img, turned = false;
    const detect = (im) => Promise.resolve().then(() => (ctx.fmt === '2x2' ? R.detectLoose(im, cols, rows) : R.detectCards(im, cols, rows))).catch((e) => { console.warn('cartes', e); return null; });
    const enough = (r) => r && r.found >= Math.ceil(cols * rows * 0.5);
    const r = await detect(img);
    if (enough(r)) quads = r.cells.map((c) => c.quad);
    // v4.13 (page WWE d'Arnaud : cartes match / Pay Per View en largeur, photo en largeur) : page aussi cherchée tournée d'un quart de tour ;
    // nettement mieux (note × 1,5) → cartes prises là, remises en largeur, dans l'ordre de la page (mesuré : 105 contre 44)
    if (img.width > img.height && live()) {
      const c = document.createElement('canvas'); c.width = img.height; c.height = img.width;
      const x = c.getContext('2d'); x.translate(c.width / 2, c.height / 2); x.rotate(Math.PI / 2); x.drawImage(img, -img.width / 2, -img.height / 2);
      const rimg = await createImageBitmap(c), r2 = await detect(rimg);
      if (enough(r2) && (!quads || (r2.score || 0) > 1.5 * ((r && r.score) || 0))) {
        // (point (u, v) de la photo tournée = (v, 1 − u) sur la photo : rangées de haut en bas, puis de gauche à droite)
        const at = (q) => { const u = q.reduce((t, p) => t + p[0], 0) / 4, v = q.reduce((t, p) => t + p[1], 0) / 4; return { x: v, y: 1 - u }; };
        quads = r2.cells.map((c) => c.quad).sort((p, q) => { const A = at(p), B = at(q); return (Math.round(A.y * rows - 0.5) - Math.round(B.y * rows - 0.5)) || (A.x - B.x); });
        src = rimg; turned = true;
      }
    }
    if (!quads) {
      let g = null; try { g = R.detectGrid(img, cols, rows); } catch (e) { /* */ }
      quads = g && g.cells && g.cells.length === cols * rows ? g.cells.map((c) => c.quad) : null;
    }
    if (!quads) { // grille régulière sur toute la photo
      quads = [];
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) quads.push([[i / cols, j / rows], [(i + 1) / cols, j / rows], [(i + 1) / cols, (j + 1) / rows], [i / cols, (j + 1) / rows]]);
    }
    if (!live()) return;

    // cartes découpées ; pochette vide écartée
    const cards = [];
    for (const q of quads) {
      try {
        let cv = App.views.scan.warpTo(src, q);
        if (turned) { const t = document.createElement('canvas'); t.width = cv.height; t.height = cv.width; const x = t.getContext('2d'); x.translate(t.width / 2, t.height / 2); x.rotate(-Math.PI / 2); x.drawImage(cv, -cv.width / 2, -cv.height / 2); cv = t; }
        const blob = await new Promise((res) => cv.toBlob(res, 'image/webp', 0.9));
        if (blob && !(await R.looksEmpty(blob).catch(() => false))) cards.push({ blob, url: URL.createObjectURL(blob), on: true, num: '', name: '', state: 'wait' });
      } catch (e) { console.warn(e); }
    }
    if (!live()) return;
    if (!cards.length) { box.innerHTML = `<div class="panel pp-wait">Je n’ai trouvé aucune carte sur cette photo. Essaie « 4 cases », ou une photo plus droite.</div>`; return; }

    const draw = () => {
      const n = cards.filter((c) => c.on).length, reading = cards.some((c) => c.state === 'wait' || c.state === 'read');
      box.innerHTML = `
        <div class="pp-head small">${reading ? `<span class="pa-spin"></span> Lecture des cartes… (${cards.filter((c) => c.state === 'done').length}/${cards.length})` : `${I('check', 13)} ${cards.length} carte${cards.length > 1 ? 's' : ''} trouvée${cards.length > 1 ? 's' : ''} : vérifie les noms, décoche celles à ne pas ajouter.`}</div>
        <div class="pp-list">${cards.map((c, i) => `
          <div class="pp-row ${c.on ? '' : 'off'}" data-i="${i}">
            <img src="${c.url}" alt="">
            <div class="pp-fields">
              <input type="text" data-k="name" value="${esc(c.name)}" placeholder="${c.state === 'done' ? 'Nom de la carte' : 'lecture…'}" maxlength="80">
              <input type="text" data-k="num" value="${esc(c.num)}" placeholder="Numéro" maxlength="24">
              ${c.had ? `<span class="pp-had small">Déjà dans ton Dex</span>` : ''}
            </div>
            <label class="pp-on" title="Ajouter cette carte"><input type="checkbox" ${c.on ? 'checked' : ''}></label>
          </div>`).join('')}</div>
        <button class="btn primary pp-add" type="button" ${n ? '' : 'disabled'}>${I('plus', 16)} Ajouter ${n} carte${n > 1 ? 's' : ''}</button>`;
    };
    box.oninput = (e) => { const row = e.target.closest('.pp-row'); if (row && e.target.dataset.k) cards[+row.dataset.i][e.target.dataset.k] = e.target.value; };
    box.onchange = (e) => {
      const row = e.target.closest('.pp-row');
      if (row && e.target.type === 'checkbox') { cards[+row.dataset.i].on = e.target.checked; row.classList.toggle('off', !e.target.checked); const n = cards.filter((c) => c.on).length; const b = box.querySelector('.pp-add'); b.disabled = !n; b.innerHTML = `${I('plus', 16)} Ajouter ${n} carte${n > 1 ? 's' : ''}`; }
    };
    box.onclick = async (e) => {
      if (!e.target.closest('.pp-add')) return;
      if (!ctx.shared().lic && !(await ctx.pick())) return;
      const { lic, setName, total } = ctx.shared();
      const todo = cards.filter((c) => c.on);
      const nameless = todo.filter((c) => !c.name.trim() && !c.num.trim());
      if (nameless.length) { App.util.toast(`${nameless.length} carte${nameless.length > 1 ? 's' : ''} sans nom ni numéro : complète ou décoche`); return; }
      e.target.disabled = true;
      let n = 0, setId = '';
      for (const c of todo) {
        try {
          const name = c.name.trim() || `n° ${c.num.trim()}`;
          const r = await App.views.persoAdd.save({ lic, setName, num: c.num.trim(), name, total, blob: c.blob });
          setId = r.setId; n++; c.on = false; c.saved = true;
        } catch (err) { console.error(err); }
      }
      ctx.saved(lic, setName || 'Sans série');
      App.util.toast(`${n} carte${n > 1 ? 's' : ''} ajoutée${n > 1 ? 's' : ''} à ton Dex`);
      box.innerHTML = `<div class="panel pa-ok">${I('check', 16)} <b>${n} carte${n > 1 ? 's' : ''}</b> dans ta collection perso. <a href="#/jeu/perso/serie/${encodeURIComponent(setId)}">Voir la série ›</a></div>
        <label for="pa-cam" class="btn primary pp-add">${I('camera', 16)} Page suivante</label>`;
    };
    draw();

    // lecture carte par carte ; la licence trouvée sur une carte remplit la case commune
    for (const c of cards) {
      if (!live()) return;
      c.state = 'read';
      let g = null;
      try { g = await App.views.persoAdd.read(c.blob, ctx.lics); } catch (e) { console.warn(e); }
      if (!live()) return;
      c.state = 'done';
      if (g) {
        if (g.lic) ctx.fillLic(g.lic);
        if (g.set && g.lic === ctx.shared().lic) ctx.fillSet(g.set);
        const lic = ctx.shared().lic, had = ad.ownedByNum(g.num, lic);
        if (!c.num) c.num = g.num || '';
        if (!c.name) c.name = (had && had.snap.name) || g.name || '';
        if (had) { c.had = true; c.on = false; }
        const pre = ad.setByPrefix(g.num, lic);
        if (pre && (!lic || pre.lic === lic)) ctx.fillSet(pre.set);
        if (g.total) ctx.fillTotal(g.total);
      }
      // (garde ce que la personne est en train d'écrire : seule la ligne lue est redessinée si elle n'a pas le focus)
      if (!box.contains(document.activeElement)) draw();
      else { const row = box.querySelector(`.pp-row[data-i="${cards.indexOf(c)}"]`); if (row) { for (const k of ['name', 'num']) { const inp = row.querySelector(`[data-k="${k}"]`); if (inp !== document.activeElement && !inp.value) inp.value = c[k]; } } }
    }
    // un « nom » lu sur 3 cartes ou plus de la page = le titre de la série (film « Megamind », « Kung Fu Panda ») : série, pas nom
    if (live()) {
      const cnt = new Map();
      for (const c of cards) { const k = App.util.norm(c.name); if (k) cnt.set(k, (cnt.get(k) || 0) + 1); }
      const [top, n] = [...cnt].sort((a, b) => b[1] - a[1])[0] || [];
      if (top && n >= 3) {
        const title = cards.find((c) => App.util.norm(c.name) === top).name;
        ctx.fillSet(title);
        for (const c of cards) if (App.util.norm(c.name) === top) c.name = '';
      }
    }
    if (live() && !box.contains(document.activeElement)) draw();
    else if (live()) { const h = box.querySelector('.pp-head'); if (h) h.innerHTML = `${I('check', 13)} ${cards.length} cartes lues : vérifie les noms, décoche celles à ne pas ajouter.`; }
  },
};
