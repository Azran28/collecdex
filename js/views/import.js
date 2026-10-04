/* Page « Importer ma collection » (#/importer) : fichier Cardmarket, Collectr, Pokellector, Dragon Shield, Excel ou tableau collé → cartes non certifiées */
App.views.import = {
  async render(el, params, alive) {
    const { esc } = App.util;
    const I = App.importer, ad = App.games.get('pokemon');
    const HELP = {
      collectr: 'Dans l’appli Collectr : écran <b>Portfolio</b> › les <b>trois points</b> en haut à droite › <b>Export</b> (offre PRO). Tu reçois un fichier CSV par e-mail : enregistre-le, puis choisis-le ici.',
      cardmarket: 'Sur <b>cardmarket.com</b>, exporte ta liste de cartes (stock, collection ou liste de souhaits) en fichier <b>CSV</b>, puis choisis-le ici. Les noms et séries en anglais sont reconnus.',
      pokellector: 'Dans <b>Pokellector</b>, exporte ta collection en fichier <b>CSV</b> (fonction d’export de l’appli ou du site), enregistre-le, puis choisis-le ici. Une simple liste copiée (« 2x Dracaufeu 4/102 ») marche aussi : colle-la plus bas.',
      dragonshield: 'Dans l’appli <b>Dragon Shield</b> (Card Manager / Poké TCG Scanner) : ouvre ton dossier › <b>Export</b> › fichier <b>CSV</b>, envoie-le-toi, puis choisis-le ici. Quantité, état, langue et version (holo, reverse…) sont repris.',
      tableau: 'Un tableau <b>Excel (.xlsx)</b> ou <b>CSV</b> avec au moins une colonne <b>Nom</b> ; mieux avec <b>Série</b>, <b>Numéro</b> (ex. 4/102) et <b>Quantité</b>. Tu peux aussi copier les cases dans Excel et les coller plus bas.',
    };
    let S = { step: 'source', src: 'collectr', cells: null, det: null, list: [], file: '', lang: 'en', mode: 'keep', filter: 'all', shown: 150, busy: false };
    const card = (r) => r.card;
    const thumb = (c) => (c ? ad.img.card(c, 'low') : '');
    const statusTxt = { ok: 'Trouvée', verif: 'À vérifier', choix: 'À choisir', introuvable: 'Introuvable', ignoree: 'Ignorée' };

    const head = () => `<div class="breadcrumb"><a href="#/">Accueil</a> › <a href="#/collection">Mon Dex</a> › Importer</div>
      <div class="row"><h1>Importer ma collection</h1></div>`;

    // ---------- 1) choix du fichier ----------
    const drawSource = () => {
      el.innerHTML = `${head()}
        <p class="imp-note">${App.icons.icon('shield', 15)} <span>Les cartes importées comptent dans ton Dex (progression, valeur, badges) mais <b>ne sont pas certifiées</b> : elles n’ont pas de photo. Pour le badge, capture-les plus tard avec la caméra.</span></p>
        <div class="imp-src" role="tablist">${[['collectr', 'Collectr'], ['cardmarket', 'Cardmarket'], ['pokellector', 'Pokellector'], ['dragonshield', 'Dragon Shield'], ['tableau', 'Excel / CSV']].map(([k, l]) => `<button class="${S.src === k ? 'on' : ''}" data-src="${k}" role="tab">${l}</button>`).join('')}</div>
        <div class="panel imp-help"><p style="margin:0">${HELP[S.src]}</p>
          <label class="btn primary imp-file">${App.icons.icon('download', 16)} Choisir le fichier<input type="file" id="imp-file" accept=".csv,.tsv,.txt,.xlsx,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden></label>
          <div class="small muted" id="imp-msg" style="margin-top:8px"></div>
          <details class="imp-paste" ${S.src === 'tableau' ? 'open' : ''}><summary>Ou coller un tableau</summary>
            <textarea id="imp-text" rows="5" placeholder="Nom&#9;Série&#9;Numéro&#9;Quantité&#10;Dracaufeu&#9;Set de Base&#9;4/102&#9;1"></textarea>
            <button class="btn" id="imp-read">Lire le tableau</button></details>
        </div>`;
    };

    const load = (cells, name) => {
      if (!cells || cells.length < 1) throw new Error('le fichier est vide');
      S.cells = cells; S.file = name; S.det = I.detect(cells);
      // le format reconnu dans le fichier compte ; sinon on garde l'onglet Pokellector / Dragon Shield choisi (titres de colonnes ordinaires)
      const found = I.sourceOf(S.det.cols);
      S.src = found !== 'tableau' || !['pokellector', 'dragonshield'].includes(S.src) ? found : S.src;
      S.lang = S.src === 'tableau' ? (App.settings.lang || 'fr') : 'en';
      S.step = 'cols'; drawCols();
    };

    // ---------- 2) colonnes ----------
    const preview = () => I.rowsOf(S.cells, S.det, { lang: S.lang });
    const drawCols = () => {
      const rows = preview(), cols = S.det.cols;
      const sel = (f) => `<label class="imp-map"><span>${esc(I.LABELS[f])}</span><select data-map="${f}"><option value="">— aucune —</option>${cols.map((c, j) => `<option value="${j}" ${S.det.map[f] === j ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>`;
      const ex = rows.slice(0, 4);
      el.innerHTML = `${head()}
        <div class="panel imp-step">
          <div class="imp-file-h">${App.icons.icon('layers', 16)} <b>${esc(S.file)}</b><span class="muted small">${rows.length} ligne${rows.length > 1 ? 's' : ''}${S.src !== 'tableau' ? ` · format ${esc(I.SOURCES[S.src])} reconnu` : ''}</span></div>
          <h2 style="margin:14px 0 6px">Colonnes</h2>
          <p class="small muted" style="margin:0 0 8px">Vérifie que chaque information est bien prise dans la bonne colonne.</p>
          <div class="imp-maps">${I.ORDER.map(sel).join('')}</div>
          ${S.det.map.name == null ? '<p class="imp-warn">Choisis au moins la colonne du <b>nom de la carte</b>.</p>' : ''}
          <h3 style="margin:14px 0 6px">Aperçu</h3>
          <div class="imp-prev">${ex.length ? ex.map((r) => `<div><b>${esc(r.name)}</b>${r.setName ? ` · ${esc(r.setName)}` : ''}${r.num ? ` · n° ${esc(r.num.n)}${r.num.total ? '/' + r.num.total : ''}` : ''} · ×${r.qty}${r.ver.base && r.ver.base !== 'normal' ? ` · ${esc(r.ver.base)}` : ''}${r.ver.first ? ' · 1ʳᵉ éd.' : ''}${r.cond ? ` · ${esc(App.col.condLabel(r.cond))}` : ''}${r.skip ? ` <span class="muted">(ignorée : ${esc(r.skip)})</span>` : ''}</div>`).join('') : '<div class="muted">Aucune ligne lisible.</div>'}</div>
          <h3 style="margin:14px 0 6px">Réglages</h3>
          <label class="imp-map"><span>Langue des cartes (si elle n’est pas indiquée)</span><select id="imp-lang"><option value="fr" ${S.lang === 'fr' ? 'selected' : ''}>Français</option><option value="en" ${S.lang === 'en' ? 'selected' : ''}>Anglais</option></select></label>
          <div class="imp-modes"><span class="small muted">Si la carte est déjà dans mon Dex :</span>
            ${[['keep', 'ne rien changer'], ['max', 'garder la plus grande quantité'], ['add', 'ajouter les quantités']].map(([k, l]) => `<label class="check"><input type="radio" name="imp-mode" value="${k}" ${S.mode === k ? 'checked' : ''}> ${l}</label>`).join('')}</div>
          <div class="row" style="gap:8px;margin-top:14px;flex-wrap:wrap"><button class="btn ghost" id="imp-back">Autre fichier</button><span class="spacer"></span>
            <button class="btn primary" id="imp-go" ${S.det.map.name == null || !rows.length ? 'disabled' : ''}>${App.icons.icon('search', 16)} Rechercher les ${rows.filter((r) => !r.skip).length} cartes</button></div>
        </div>`;
    };

    // ---------- 3) recherche des cartes ----------
    const runMatch = async () => {
      S.list = preview(); S.step = 'match'; S.filter = 'all'; S.shown = 150;
      const todo = S.list.filter((r) => !r.skip).length;
      el.innerHTML = `${head()}<div class="panel imp-step"><h2 style="margin-top:0">Recherche des cartes…</h2>
        <div class="imp-bar"><i style="width:0%"></i></div><p class="small muted" id="imp-prog">0 / ${todo}</p>
        <p class="small muted">La 1ʳᵉ fois, chaque série est téléchargée : compte quelques secondes par série.</p></div>`;
      const bar = el.querySelector('.imp-bar i'), pg = el.querySelector('#imp-prog');
      await I.matchAll(S.list, (n) => { if (!alive()) return; bar.style.width = (100 * n / Math.max(1, todo)).toFixed(1) + '%'; pg.textContent = `${n} / ${todo}`; });
      if (!alive()) return;
      for (const r of S.list) r.use = ['ok', 'verif', 'choix'].includes(r.status);
      drawResults();
    };

    const counts = () => { const c = { ok: 0, verif: 0, choix: 0, introuvable: 0, ignoree: 0 }; S.list.forEach((r) => { c[r.status] = (c[r.status] || 0) + 1; }); return c; };
    const rowHtml = (r, i) => {
      const c = card(r), owned = c && App.col.owned('pokemon', c.id);
      const alt = (r.cands || []).slice(0, 11);
      return `<div class="imp-row st-${r.status} ${r.use ? 'use' : ''}" data-i="${i}">
        <label class="imp-chk" title="Importer cette carte"><input type="checkbox" data-use="${i}" ${r.use ? 'checked' : ''} ${c ? '' : 'disabled'}></label>
        <div class="imp-img">${c ? `<img src="${esc(thumb(c))}" alt="" loading="lazy" data-alt="${esc(c.name)}">` : '<span>?</span>'}</div>
        <div class="imp-info">
          <div class="imp-t">${c ? `<b>${esc(c.name)}</b> <span class="muted">· ${esc(r.set.name)} · n° ${esc(c.localId)}</span>` : `<b>${esc(r.name)}</b>`}</div>
          <div class="imp-l small muted">Ligne ${r.line} : ${esc(r.raw)}${r.setName ? ` · ${esc(r.setName)}` : ''}${r.num ? ` · ${esc(r.num.n)}${r.num.total ? '/' + r.num.total : ''}` : ''} · ×${r.qty || 1}${r.ver.base && r.ver.base !== 'normal' ? ` · ${esc(r.ver.base === 'foil' ? 'foil' : r.ver.base)}` : ''}${r.ver.first ? ' · 1ʳᵉ éd.' : ''}</div>
          <div class="imp-s"><span class="imp-pill">${statusTxt[r.status] || ''}</span>${r.why || r.skip ? `<span class="small muted">${esc(r.why || r.skip)}</span>` : ''}${owned ? `<span class="small imp-own">${App.icons.icon('check', 12)} déjà dans ton Dex</span>` : ''}</div>
          ${alt.length ? `<div class="imp-alts"><span class="small muted">${r.status === 'choix' ? 'Laquelle ?' : 'Autres possibilités :'}</span>${[{ card: r.card, set: r.set }, ...alt].map((a, j) => `<button class="imp-alt ${j === 0 ? "on" : ""}" data-pick="${i}:${j}" title="${esc(a.card.name)} · ${esc(a.set.name)} n° ${esc(a.card.localId)}"><img src="${esc(thumb(a.card))}" alt="" loading="lazy" data-alt="${esc(a.card.name)}"><small>${a.set.id === r.set.id && (r.cands || []).every((x) => x.set.id === r.set.id) ? `n° ${esc(a.card.localId)}${a.card.variants && a.card.variants.holo && !a.card.variants.normal ? ' · Holo' : a.card.rarity ? ' · ' + esc(a.card.rarity) : ''}` : `${esc(a.set.name)} · n° ${esc(a.card.localId)}`}</small></button>`).join('')}</div>` : ''}
          ${r.status === 'introuvable' ? `<div class="imp-find"><input type="search" data-q="${i}" value="${esc(r.name)}" placeholder="Nom de la carte"><button class="btn sm" data-find="${i}">${App.icons.icon('search', 14)} Chercher</button></div>` : ''}
        </div></div>`;
    };
    const visible = () => S.list.map((r, i) => ({ r, i })).filter(({ r }) => S.filter === 'all' ? r.status !== 'ignoree' : S.filter === 'check' ? ['verif', 'choix'].includes(r.status) : r.status === S.filter);
    const drawResults = () => {
      const c = counts(), n = S.list.filter((r) => r.use && r.card).length, vis = visible();
      el.innerHTML = `${head()}
        <div class="imp-sum">
          <button class="${S.filter === 'all' ? 'on' : ''}" data-f="all">Toutes <b>${S.list.length - c.ignoree}</b></button>
          <button class="${S.filter === 'ok' ? 'on' : ''} ok" data-f="ok">✓ Trouvées <b>${c.ok}</b></button>
          <button class="${S.filter === 'check' ? 'on' : ''} chk" data-f="check">? À vérifier <b>${c.verif + c.choix}</b></button>
          <button class="${S.filter === 'introuvable' ? 'on' : ''} ko" data-f="introuvable">✗ Introuvables <b>${c.introuvable}</b></button>
          ${c.ignoree ? `<button class="${S.filter === 'ignoree' ? 'on' : ''}" data-f="ignoree">Ignorées <b>${c.ignoree}</b></button>` : ''}
        </div>
        ${S.filter === 'check' ? '<p class="small muted" style="margin:0 0 8px">Touche la bonne carte parmi les propositions (la 1ʳᵉ est choisie si tu ne fais rien).</p>' : ''}
        <div class="imp-list">${vis.slice(0, S.shown).map(({ r, i }) => rowHtml(r, i)).join('') || '<div class="empty">Rien ici.</div>'}</div>
        ${vis.length > S.shown ? `<div style="text-align:center;margin:10px 0"><button class="btn" id="imp-more">Afficher plus (${vis.length - S.shown})</button></div>` : ''}
        <div class="imp-dock"><button class="btn ghost" id="imp-cols">‹ Colonnes</button><span class="spacer"></span><button class="btn primary" id="imp-apply" ${n ? '' : 'disabled'}>Importer ${n} carte${n > 1 ? 's' : ''}</button></div>`;
    };
    const updateDock = () => { const n = S.list.filter((r) => r.use && r.card).length, b = el.querySelector('#imp-apply'); if (b) { b.disabled = !n; b.textContent = `Importer ${n} carte${n > 1 ? 's' : ''}`; } };

    // ---------- 4) ajout ----------
    const runApply = async () => {
      const n = S.list.filter((r) => r.use && r.card).length;
      const ok = await App.util.ask({ icon: 'download', title: `Importer ${n} carte${n > 1 ? 's' : ''} ?`, text: 'Elles seront ajoutées à ton Dex sans photo (non certifiées). Tu pourras les supprimer depuis Mon Dex si besoin.', ok: 'Importer', cancel: 'Annuler' });
      if (!ok) return;
      el.querySelector('.imp-dock').innerHTML = '<div class="imp-bar" style="flex:1"><i style="width:0%"></i></div>';
      const bar = el.querySelector('.imp-dock .imp-bar i');
      const st = await I.apply(S.list, { mode: S.mode, from: S.src, onProgress: (k, t) => { bar.style.width = (100 * k / t) + '%'; } });
      if (!alive()) return;
      App.sfx.open && App.sfx.open(3);
      S.step = 'done';
      el.innerHTML = `${head()}<div class="panel imp-step imp-done">
        <div class="imp-done-ic">${App.icons.icon('check', 34)}</div>
        <h2>Import terminé</h2>
        <p><b>${st.added}</b> carte${st.added > 1 ? 's' : ''} ajoutée${st.added > 1 ? 's' : ''}${st.updated ? `, <b>${st.updated}</b> mise${st.updated > 1 ? 's' : ''} à jour` : ''}${st.kept ? `, ${st.kept} déjà dans ton Dex (inchangée${st.kept > 1 ? 's' : ''})` : ''}.</p>
        <p class="small muted">Les prix arrivent en arrière-plan. Ces cartes ne sont pas certifiées : capture-les avec la caméra pour le badge.</p>
        <div class="row" style="justify-content:center;gap:8px;flex-wrap:wrap"><a class="btn primary" href="#/collection">Voir Mon Dex</a><button class="btn ghost" id="imp-again">Importer un autre fichier</button></div></div>`;
    };

    // ---------- évènements ----------
    el.addEventListener('click', async (e) => {
      const t = e.target;
      const src = t.closest('[data-src]'); if (src) { S.src = src.dataset.src; drawSource(); return; }
      if (t.closest('#imp-read')) {
        const v = el.querySelector('#imp-text').value;
        try { load(I.parseCSV(v), 'Tableau collé'); } catch (err) { el.querySelector('#imp-msg').innerHTML = `<span style="color:#ff8a8a">${esc(err.message)}</span>`; }
        return;
      }
      if (t.closest('#imp-back') || t.closest('#imp-again')) { S = { ...S, step: 'source', cells: null, list: [] }; drawSource(); return; }
      if (t.closest('#imp-go')) { if (!S.busy) { S.busy = true; try { await runMatch(); } finally { S.busy = false; } } return; }
      if (t.closest('#imp-cols')) { S.step = 'cols'; drawCols(); return; }
      if (t.closest('#imp-apply')) { if (!S.busy) { S.busy = true; try { await runApply(); } finally { S.busy = false; } } return; }
      if (t.closest('#imp-more')) { S.shown += 300; drawResults(); return; }
      const f = t.closest('[data-f]'); if (f) { S.filter = f.dataset.f; S.shown = 150; drawResults(); return; }
      const alt = t.closest("[data-pick]");
      if (alt) {
        const [i, j] = alt.dataset.pick.split(':').map(Number), r = S.list[i];
        if (j > 0) {
          const all = [{ card: r.card, set: r.set }, ...r.cands];
          const pick = all.splice(j, 1)[0];
          r.card = pick.card; r.set = pick.set; r.cands = all;
        }
        r.status = 'ok'; r.why = 'choisie à la main'; r.use = true;
        const row = el.querySelector(`.imp-row[data-i="${i}"]`); if (row) row.outerHTML = rowHtml(r, i);
        updateDock(); return;
      }
      const fd = t.closest('[data-find]');
      if (fd) {
        const i = +fd.dataset.find, r = S.list[i], q = el.querySelector(`[data-q="${i}"]`).value.trim();
        if (!q) return;
        fd.disabled = true; fd.textContent = '…';
        const res = await I.match({ ...r, name: q, setName: r.setName, num: r.num }).catch(() => ({ status: 'introuvable' }));
        let out = res;
        if (res.status === 'introuvable' && (r.setName || r.num)) out = await I.match({ ...r, name: q, setName: '', num: null }).catch(() => res);
        if (!alive()) return;
        if (out.card) { Object.assign(r, out); r.status = out.cands && out.cands.length ? 'choix' : 'ok'; r.why = 'trouvée avec « ' + q + ' »'; r.use = true; }
        else App.util.toast('Toujours rien avec « ' + q + ' »');
        const row = el.querySelector(`.imp-row[data-i="${i}"]`); if (row) row.outerHTML = rowHtml(r, i);
        updateDock(); return;
      }
    });
    el.addEventListener('change', async (e) => {
      const t = e.target;
      if (t.id === 'imp-file' && t.files[0]) {
        const file = t.files[0], msg = el.querySelector('#imp-msg');
        if (file.size > 15 * 1024 * 1024) { msg.innerHTML = '<span style="color:#ff8a8a">Fichier trop gros (15 Mo maximum)</span>'; return; }
        msg.textContent = 'Lecture du fichier…';
        try { load(await I.readFile(file), file.name); }
        catch (err) { msg.innerHTML = `<span style="color:#ff8a8a">Lecture impossible : ${esc(err.message)}</span>`; }
        return;
      }
      if (t.dataset.map) { if (t.value === '') delete S.det.map[t.dataset.map]; else S.det.map[t.dataset.map] = +t.value; drawCols(); return; }
      if (t.id === 'imp-lang') { S.lang = t.value; drawCols(); return; }
      if (t.name === 'imp-mode') { S.mode = t.value; return; }
      if (t.dataset.use) { const r = S.list[+t.dataset.use]; r.use = t.checked; t.closest('.imp-row').classList.toggle('use', t.checked); updateDock(); }
    });
    el.addEventListener('keydown', (e) => { if (e.target.dataset && e.target.dataset.q != null && e.key === 'Enter') { const b = el.querySelector(`[data-find="${e.target.dataset.q}"]`); if (b) b.click(); } });

    drawSource();
  },
};
