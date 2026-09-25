/* Mes objectifs : objectifs de séries, cartes qui me manquent (les moins chères d'abord), liste de souhaits */
App.views.goals = {
  async render(el, params, alive) {
    const { esc, euro } = App.util;
    const game = 'pokemon';
    const ad = App.games.get(game);
    const tab = ['objectifs', 'manque', 'souhaits'].includes(params.query.tab) ? params.query.tab : 'objectifs';
    const sets = await ad.listSets();
    if (!alive()) return;
    const setById = new Map(sets.map((s) => [s.id, s]));
    const prices = {}; // id carte → { value, unit }
    let stopped = false;
    const tasks = [];

    // cartes qui comptent pour la complétion (même règle que la progression)
    const counted = (set) => {
      if (App.settings.completion !== 'official') return set.cards;
      return set.cards.filter((c) => { const n = parseInt(c.localId, 10); return !isNaN(n) && String(n) === String(c.localId).replace(/^0+(?=\d)/, '') && n <= set.official; });
    };
    const missingOf = (set) => counted(set).filter((c) => !App.col.owned(game, c.id));
    const priceVal = (id) => (prices[id] && prices[id].value) || 0;
    /** Prix des cartes (en arrière-plan, gardés 24 h), puis on redessine */
    const loadPrices = (cards, label, then) => {
      const todo = cards.filter((c) => !prices[c.id]).slice(0, 300);
      if (!todo.length) { then(); return; }
      const task = App.bg.start(label, todo.length); tasks.push(task);
      App.util.pool(todo, 4, async (c) => {
        if (stopped) return;
        try { const full = await ad.getCard(c.id); const p = ad.price(full); prices[c.id] = p || { value: null }; } catch (e) { prices[c.id] = { value: null }; }
      }, (d) => task.tick(d)).then(() => { task.done(); if (!stopped && alive()) then(); });
    };
    const cardOf = (c, set) => ({ ...c, setId: set.id, serieId: (set.group && set.group.id) || c.serieId || '', setName: set.name });
    const tiles = (cards) => `<div class="cards">${cards.map((c) => App.ui.cardTile(c, { game, price: prices[c.id], showSet: true })).join('')}</div>`;
    const costTxt = (cards) => {
      const known = cards.filter((c) => priceVal(c.id) > 0);
      if (!known.length) return '';
      const sum = known.reduce((s, c) => s + priceVal(c.id), 0);
      return `≈ ${euro(sum)}${known.length < cards.length ? ` <span class="muted">(${cards.length - known.length} sans prix)</span>` : ''}`;
    };

    const goals = await App.wish.goals();
    const wl = await App.wish.list();
    const started = sets.filter((s) => App.col.inSet(game, s.id).length);

    el.innerHTML = `
      <div class="breadcrumb"><a href="#/">Accueil</a> › <a href="#/collection">Mon Dex</a> › Mes objectifs</div>
      <h1 style="margin-bottom:12px">Mes objectifs</h1>
      <div class="goal-tabs" role="tablist">
        ${[['objectifs', 'target', 'Objectifs', 'Objectifs', goals.length], ['manque', 'search', 'Ce qu’il me manque', 'Manquantes', ''], ['souhaits', 'heart', 'Liste de souhaits', 'Souhaits', wl.length]]
          .map(([k, ic, l, sh, n]) => `<a class="goal-tab ${tab === k ? 'on' : ''}" href="#/objectifs?tab=${k}" role="tab">${App.icons.icon(ic, 16)}<span class="lg">${l}</span><span class="sh">${sh}</span>${n !== '' ? `<b>${n}</b>` : ''}</a>`).join('')}
      </div>
      <div id="g-body" class="goals-page"></div>`;
    const body = el.querySelector('#g-body');

    // ================= Objectifs =================
    async function drawGoals() {
      const gs = await App.wish.goals();
      body.innerHTML = `
        <div class="panel goal-new">
          <b class="row" style="gap:6px">${App.icons.icon('target', 16)} Nouvel objectif</b>
          <div class="row" style="margin-top:8px">
            <select id="g-set" style="flex:1;min-width:200px"><option value="">Choisis une série à compléter…</option></select>
            <label class="small muted">Avant le <input type="date" id="g-date"></label>
            <button class="btn primary sm" id="g-add">Ajouter</button>
          </div>
        </div>
        <div id="g-list">${gs.length ? App.ui.loading('Chargement de tes séries…') : `<div class="empty panel">Pas encore d’objectif. Choisis une série à compléter ci-dessus${started.length ? ', ou depuis la page d’une série (« En faire un objectif »)' : ''}.</div>`}</div>`;
      const sel = body.querySelector('#g-set');
      if (started.length) sel.insertAdjacentHTML('beforeend', `<optgroup label="Séries entamées">${started.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}</optgroup>`);
      App.views.scan.fillSetSelect(sel, sets.filter((s) => !App.col.inSet(game, s.id).length));
      if (!gs.length) return;
      const full = await Promise.all(gs.map((g) => ad.getSet(g.setId).catch(() => null)));
      if (!alive()) return;
      const allMissing = [];
      const render = () => {
        body.querySelector('#g-list').innerHTML = gs.map((g, i) => {
          const set = full[i]; if (!set) return '';
          const p = App.col.progress(game, set), miss = missingOf(set), left = App.wish.daysLeft(g.deadline);
          const dl = g.deadline ? `<span class="pill ${p.complete ? '' : left < 0 ? 'late' : left <= 7 ? 'soon' : ''}">${p.complete ? 'Terminé' : left < 0 ? `Dépassé de ${-left} j` : left === 0 ? 'Aujourd’hui !' : `J-${left}`} · ${App.util.dateFr(g.deadline)}</span>` : '';
          return `<div class="goal-card ${p.complete ? 'done' : ''}">
            <div class="gc-logo">${App.ui.setLogo(game, setById.get(set.id) || set)}</div>
            <div class="gc-main">
              <div class="row" style="gap:8px"><b class="gc-name">${esc(set.name)}</b>${dl}<span class="spacer"></span>${p.complete ? `<span class="medal">${App.icons.icon('trophy', 14)} Objectif atteint !</span>` : ''}</div>
              <div class="row" style="gap:10px;align-items:baseline;margin:4px 0">${App.ui.countHTML(p)}<span class="muted small">${p.pct.toLocaleString('fr-FR')} %${p.complete ? '' : ` · ${miss.length} manquante${miss.length > 1 ? 's' : ''}`}</span>
                ${p.complete ? '' : `<span class="small gc-cost" data-cost="${esc(set.id)}">${costTxt(miss) ? `${costTxt(miss)} pour finir` : '<span class="muted">prix en cours…</span>'}</span>`}</div>
              ${App.ui.progressBar(p)}
              <div class="row gc-actions">
                ${p.complete ? '' : `<a class="btn sm primary" href="#/objectifs?tab=manque&set=${encodeURIComponent(set.id)}">${App.icons.icon('search', 14)} Ce qu’il me manque</a>`}
                <a class="btn sm" href="#/jeu/${game}/serie/${encodeURIComponent(set.id)}">Voir la série</a>
                <label class="small muted">Date <input type="date" data-gdate="${g.id}" value="${esc(g.deadline || '')}"></label>
                <button class="btn sm ghost" data-gdel="${g.id}">Retirer</button>
              </div>
            </div>
          </div>`;
        }).join('');
      };
      render();
      full.forEach((set) => { if (set) allMissing.push(...missingOf(set).map((c) => cardOf(c, set))); });
      loadPrices(allMissing, 'Prix des cartes manquantes', render);
    }

    // ================= Ce qu'il me manque =================
    let sortMode = 'prix';
    async function drawMissing() {
      const gs = await App.wish.goals();
      const goalIds = gs.map((g) => g.setId);
      const opts = [...new Set([...goalIds, ...started.map((s) => s.id)])];
      const chosen = params.query.set && setById.has(params.query.set) ? params.query.set : opts[0] || '';
      body.innerHTML = `
        <div class="row" style="margin-bottom:12px;gap:8px">
          <select id="m-set" style="flex:1;min-width:200px">
            ${gs.length ? `<optgroup label="Mes objectifs">${gs.map((g) => `<option value="${esc(g.setId)}" ${g.setId === chosen ? 'selected' : ''}>${esc(g.setName)}</option>`).join('')}</optgroup>` : ''}
            ${started.filter((s) => !goalIds.includes(s.id)).length ? `<optgroup label="Séries entamées">${started.filter((s) => !goalIds.includes(s.id)).map((s) => `<option value="${esc(s.id)}" ${s.id === chosen ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</optgroup>` : ''}
            <optgroup label="Toutes les séries" id="m-all"></optgroup>
          </select>
          <div class="chips" id="m-sort">${[['prix', 'Moins chères d’abord'], ['num', 'Par numéro'], ['rare', 'Plus rares d’abord']].map(([k, l]) => `<button class="chip ${k === sortMode ? 'on' : ''}" data-sort="${k}">${l}</button>`).join('')}</div>
        </div>
        <div id="m-sum"></div>
        <div id="m-grid">${chosen ? App.ui.loading() : '<div class="empty panel">Choisis une série.</div>'}</div>`;
      const allGroup = body.querySelector('#m-all');
      allGroup.innerHTML = sets.filter((s) => !opts.includes(s.id)).map((s) => `<option value="${esc(s.id)}" ${s.id === chosen ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
      body.querySelector('#m-set').onchange = (e) => { params.query.set = e.target.value; drawMissing(); };
      body.querySelector('#m-sort').onclick = (e) => { const b = e.target.closest('[data-sort]'); if (!b) return; sortMode = b.dataset.sort; drawMissing(); };
      if (!chosen) return;
      const set = await ad.getSet(chosen).catch(() => null);
      if (!alive() || !set) return;
      const miss = missingOf(set).map((c) => cardOf(c, set));
      const draw = () => {
        const list = [...miss];
        if (sortMode === 'prix') list.sort((a, b) => (priceVal(a.id) || 1e9) - (priceVal(b.id) || 1e9));
        else if (sortMode === 'rare') list.sort((a, b) => ad.rarity.rank(b.rarity) - ad.rarity.rank(a.rarity));
        const p = App.col.progress(game, set);
        const cheap10 = [...miss].filter((c) => priceVal(c.id) > 0).sort((a, b) => priceVal(a.id) - priceVal(b.id)).slice(0, 10);
        body.querySelector('#m-sum').innerHTML = miss.length ? `<div class="panel miss-sum">
            <div><b>${miss.length}</b><span>carte${miss.length > 1 ? 's' : ''} manquante${miss.length > 1 ? 's' : ''}</span></div>
            <div><b>${costTxt(miss) || '…'}</b><span>pour tout avoir</span></div>
            ${cheap10.length >= 3 ? `<div><b>≈ ${euro(cheap10.reduce((s, c) => s + priceVal(c.id), 0))}</b><span>pour les ${cheap10.length} moins chères (+${cheap10.length} cartes, ${Math.min(100, Math.round(((p.have + cheap10.length) / p.total) * 100))} %)</span></div>` : ''}
            ${App.wish.isGoal(game, set.id) ? '' : `<button class="btn sm" id="m-goal">${App.icons.icon('target', 14)} En faire un objectif</button>`}
          </div>` : '';
        body.querySelector('#m-grid').innerHTML = miss.length ? tiles(list) : `<div class="empty panel">${App.icons.icon('trophy', 18)} Tu as toutes les cartes de cette série !</div>`;
        const g = body.querySelector('#m-goal'); if (g) g.onclick = async () => { await App.wish.addGoal(game, set); App.util.toast(`Objectif ajouté : ${set.name}`); draw(); };
      };
      draw();
      loadPrices(miss, `Prix · ${set.name}`, draw);
    }

    // ================= Liste de souhaits =================
    async function drawWish() {
      const got = await App.wish.prune();
      if (got.length) App.util.toast(`🎉 ${got.length} carte${got.length > 1 ? 's' : ''} de ta liste obtenue${got.length > 1 ? 's' : ''} : retirée${got.length > 1 ? 's' : ''} de la liste`);
      const l = await App.wish.list();
      if (!l.length) {
        body.innerHTML = `<div class="empty panel">${App.icons.icon('heart', 20)}<br>Ta liste de souhaits est vide.<br><span class="small muted">Ouvre une carte que tu n’as pas et appuie sur « ♡ Je la cherche ». Elle servira aussi pour les échanges.</span></div>`;
        return;
      }
      const cards = l.map((w) => ({ id: w.id, name: w.name, localId: w.localId, image: w.image, rarity: w.rarity, setId: w.setId, serieId: w.serieId, setName: w.setName }));
      const draw = () => {
        const sorted = [...cards].sort((a, b) => (priceVal(a.id) || 1e9) - (priceVal(b.id) || 1e9));
        body.innerHTML = `<div class="panel miss-sum">
            <div><b>${cards.length}</b><span>carte${cards.length > 1 ? 's' : ''} recherchée${cards.length > 1 ? 's' : ''}</span></div>
            <div><b>${costTxt(cards) || '…'}</b><span>pour tout avoir</span></div>
          </div>${tiles(sorted)}
          <p class="small muted" style="margin-top:14px">Une carte capturée sort toute seule de la liste. Pour en retirer une, ouvre-la et appuie sur « ♥ Je la cherche ».</p>`;
      };
      draw();
      loadPrices(cards, 'Prix de ta liste de souhaits', draw);
    }

    body.addEventListener('click', async (e) => {
      const t = e.target;
      const tile = t.closest('.ctile'); if (tile) return App.cardModal(tile.dataset.game, tile.dataset.card);
      if (t.closest('#g-add')) {
        const id = body.querySelector('#g-set').value; if (!id) return App.util.toast('Choisis d’abord une série');
        await App.wish.addGoal(game, setById.get(id) || { id, name: id }, body.querySelector('#g-date').value || null);
        App.util.toast('Objectif ajouté ✓'); return drawGoals();
      }
      const del = t.closest('[data-gdel]'); if (del) { await App.wish.removeGoal(del.dataset.gdel); return drawGoals(); }
    });
    body.addEventListener('change', async (e) => {
      const d = e.target.closest('[data-gdate]'); if (d) { await App.wish.setDeadline(d.dataset.gdate, d.value); drawGoals(); }
    });

    if (tab === 'objectifs') await drawGoals();
    else if (tab === 'manque') await drawMissing();
    else await drawWish();

    // une carte capturée ou ajoutée à la liste pendant qu'on regarde → on met à jour
    const redraw = App.util.debounce(() => { if (!alive()) return; if (tab === 'objectifs') drawGoals(); else if (tab === 'manque') drawMissing(); else drawWish(); }, 400);
    const unsub = App.col.on(redraw);
    return () => { stopped = true; unsub(); tasks.forEach((t) => t.done()); };
  },
};
