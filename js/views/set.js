/* Page d'une série : progression, raretés, taux de drop, filtres et toutes les cartes */
App.views.set = {
  async render(el, { game, setId, query }, alive) {
    const { esc, euro, norm, debounce } = App.util;
    const ad = App.games.get(game);
    const set = await ad.getSet(setId);
    if (!alive()) return;

    const prices = {}; // id carte → { value, unit }
    let pricesDone = false;
    /** Coût estimé (prix du marché) : pour finir la série, et pour la série complète */
    const costBlock = () => {
      const official = (c) => { const n = parseInt(c.localId, 10); return !isNaN(n) && String(n) === String(c.localId).replace(/^0+(?=\d)/, '') && n <= set.official; };
      const counted = App.settings.completion === 'official' ? set.cards.filter(official) : set.cards;
      const pv = (c) => (prices[c.id] && prices[c.id].unit === 'EUR' && prices[c.id].value) || 0;
      const miss = counted.filter((c) => !App.col.owned(game, c.id));
      const missCost = miss.reduce((t, c) => t + pv(c), 0), fullCost = counted.reduce((t, c) => t + pv(c), 0);
      const unknown = counted.filter((c) => !pv(c)).length;
      const booster = `https://www.cardmarket.com/fr/Pokemon/Products/Search?searchString=${encodeURIComponent(set.name + ' booster')}`;
      return `<div class="set-cost">
        ${pricesDone ? `${miss.length ? `<span>${App.icons.icon('target', 14)} Finir la série : <b>≈ ${euro(missCost)}</b> <span class="muted">(${miss.length} carte${miss.length > 1 ? 's' : ''})</span></span>` : ''}
          <span>${App.icons.icon('coins', 14)} Série complète : <b>≈ ${euro(fullCost)}</b></span>${unknown ? `<span class="muted small">${unknown} carte${unknown > 1 ? 's' : ''} sans prix</span>` : ''}`
          : `<span class="muted">${App.icons.icon('coins', 14)} Estimation du coût de la série… (prix en cours de chargement)</span>`}
        <a href="${booster}" target="_blank" rel="noopener" class="small">Prix des boosters et displays sur Cardmarket ↗</a>
      </div>`;
    };
    const state = { own: query.f || 'toutes', rarities: new Set(), sort: 'num', q: '' };
    const pr = ad.pullRates(set.id);

    el.innerHTML = `
      <div class="breadcrumb"><a href="#/">Accueil</a> › <a href="#/jeu/${game}">${esc(ad.name)}</a> › ${esc(set.group.name)} › ${esc(set.name)}</div>
      <section class="set-hero panel">
        <div style="text-align:center">
          ${ad.img.logo(set) ? App.ui.setLogo(game, set, { big: true }).replace('<img ', '<img class="logo-big" ') : App.ui.setLogo(game, set, { big: true })}
        </div>
        <div id="st-head"></div>
      </section>

      <section class="panel section" id="st-rar"></section>
      ${pr ? `<section class="panel section" id="st-pull"></section>` : ''}

      <div class="toolbar">
        <div class="chips" id="st-own">
          ${[['toutes', 'Toutes'], ['possedees', 'Possédées'], ['manquantes', 'Manquantes']].map(([k, l]) => `<button class="chip ${state.own === k ? 'on' : ''}" data-own="${k}">${l}</button>`).join('')}
        </div>
        <select id="st-sort" title="Trier">
          <option value="num">Par numéro</option>
          <option value="rar">plus rares d’abord</option>
          <option value="price">plus chères d’abord</option>
          <option value="etat">Meilleur état (tes cartes)</option>
          <option value="name">Par nom</option>
        </select>
        <input type="search" id="st-q" placeholder="Nom ou numéro…">
        <span class="spacer"></span>
        <span class="muted small" id="st-shown"></span>
      </div>
      <div class="chips" id="st-rfilter" style="margin-bottom:14px"></div>
      <div class="cards" id="st-grid"></div>
      <p class="muted small" style="margin-top:22px">Données cartes : <a href="${ad.source.url}" target="_blank" rel="noopener">${ad.source.name}</a>. Prix : tendance Cardmarket (€), mise à jour quotidienne.</p>
    `;

    const head = el.querySelector('#st-head');
    head.addEventListener('click', async (e) => {
      if (!e.target.closest('#st-goal')) return;
      await App.wish.addGoal(game, set);
      App.util.toast(`🎯 Objectif ajouté : compléter ${set.name}`);
      drawHead();
    });
    const grid = el.querySelector('#st-grid');

    const drawHead = () => {
      const p = App.col.progress(game, set);
      const value = App.col.totalValue(App.col.inSet(game, set.id));
      head.innerHTML = `
        <div class="muted small">${esc(set.group.name)}${set.releaseDate ? ' · ' + App.util.dateFr(set.releaseDate) : ''}</div>
        <h1 class="row" style="gap:10px">${ad.img.symbol(set) ? `<img src="${esc(ad.img.symbol(set))}" alt="" style="height:28px">` : ''}${esc(set.name)}${App.ui.favSetBtn(game, set, 'inline')}</h1>
        <div class="row" style="align-items:baseline">
          <span class="bigcount">${p.have}<span class="muted" style="font-size:1.4rem">/${p.total}</span></span>
          <span style="font-size:1.1rem;font-weight:700">${p.pct.toLocaleString("fr-FR")} %</span>
          ${p.complete ? `<span class="medal">${App.icons.icon('trophy', 14)} Complétée !</span>` : `<span class="muted">${p.missing} carte${p.missing > 1 ? 's' : ''} manquante${p.missing > 1 ? 's' : ''}</span>`}
        </div>
        <div style="margin:10px 0">${App.ui.progressBar(p)}</div>
        <div class="row small muted">
          <span>${set.official} cartes numérotées${set.total > set.official ? ` + ${set.total - set.official} secrètes` : ''}</span>
          <span>· comptées : <a href="#/parametres">${App.settings.completion === 'official' ? 'numérotées' : 'toutes'}</a></span>
          ${value ? `<span>· Valeur : <b style="color:var(--accent2)">${euro(value)}</b></span>` : ''}
        </div>
        ${costBlock()}
        ${p.complete ? '' : `<div class="row set-goal" style="margin-top:12px;gap:8px">
          ${App.wish.isGoal(game, set.id) ? `<a class="btn sm goal-on" href="#/objectifs">${App.icons.icon('target', 14)} Objectif en cours</a>` : `<button class="btn sm" id="st-goal">${App.icons.icon('target', 14)} En faire un objectif</button>`}
          ${p.have ? `<a class="btn sm" href="#/objectifs?tab=manque&set=${encodeURIComponent(set.id)}">${App.icons.icon('search', 14)} Ce qu’il me manque (${p.missing})</a>` : ''}
        </div>`}`;

      const rar = el.querySelector('#st-rar');
      if (!p.byRarity || set.rarityInfoMissing) {
        rar.innerHTML = `<h3>Progression par rareté</h3><div class="muted small">Les raretés de cette série ne sont pas encore renseignées par la source de données.</div>`;
      } else {
        rar.innerHTML = `<h3>Progression par rareté</h3><div class="rarity-progress">${p.byRarity.map((r) => {
          const rp = { have: r.have, total: r.total, pct: App.util.pct(r.have, r.total), complete: r.have >= r.total };
          const k = ad.rarity.key(r.rarity);
          const rate = pr && k && pr.rates[k];
          return `<div class="rp-row">
            <span class="rp-name">${ad.rarity.symbol(r.rarity)} ${esc(ad.rarity.label(r.rarity))}${rp.complete ? ' ✓' : ''}</span>
            <span class="count small">${r.have}<span class="of">/${r.total}</span></span>
            ${App.ui.progressBar(rp)}
            ${rate ? `<span class="muted small" style="grid-column:1/-1">≈ 1 booster sur ${rate}</span>` : ''}
          </div>`;
        }).join('')}</div>`;
      }

      const rf = el.querySelector('#st-rfilter');
      if (p.byRarity && !set.rarityInfoMissing) {
        rf.innerHTML = p.byRarity.map((r) => `<button class="chip ${state.rarities.has(r.rarity) ? 'on' : ''}" data-r="${esc(r.rarity)}">${ad.rarity.symbol(r.rarity, 12)} ${esc(ad.rarity.label(r.rarity))}</button>`).join('');
      }
    };

    const drawPull = () => {
      const box = el.querySelector('#st-pull'); if (!box) return;
      const counts = {};
      for (const c of set.cards) { const k = ad.rarity.key(c.rarity); if (k) counts[k] = (counts[k] || 0) + 1; }
      box.innerHTML = `
        <h3>Taux de drop connus</h3>
        <table class="pull-table">
          <tr><th>Rareté</th><th>Fréquence</th><th>Cartes de cette rareté</th><th>Une carte précise (estimation)</th></tr>
          ${Object.entries(pr.rates).map(([k, n]) => `<tr>
            <td>${ad.rarity.symbol(k)} ${esc(ad.rarity.label(k))}</td>
            <td><b>1 booster sur ${n.toLocaleString('fr-FR')}</b></td>
            <td>${counts[k] || '—'}</td>
            <td>${counts[k] ? `≈ 1 sur ${(n * counts[k]).toLocaleString('fr-FR')}` : '—'}</td></tr>`).join('')}
        </table>
        <p class="small muted" style="margin-bottom:0">Source : <a href="${esc(pr.url)}" target="_blank" rel="noopener">${esc(pr.source)}</a> (${esc(pr.sample)}). ${esc(pr.note || '')}<br>
        Pokémon ne publie pas de taux officiels : ce sont des mesures sur un grand nombre de boosters. « Une carte précise » = fréquence × nombre de cartes de la rareté (en supposant qu’elles tombent toutes aussi souvent).</p>`;
    };

    const cardsFiltered = () => {
      let cards = set.cards.slice();
      if (state.own === 'possedees') cards = cards.filter((c) => App.col.owned(game, c.id));
      if (state.own === 'manquantes') cards = cards.filter((c) => !App.col.owned(game, c.id));
      if (state.rarities.size) cards = cards.filter((c) => state.rarities.has(c.rarity));
      if (state.q) { const q = norm(state.q); cards = cards.filter((c) => norm(c.name).includes(q) || norm(c.localId) === q || String(parseInt(c.localId, 10)) === q); }
      const priceOf = (c) => { const it = App.col.get(game, c.id); return (it && it.qty > 0 && App.col.valueOf(it)) || (prices[c.id] && prices[c.id].value) || 0; };
      const sorters = {
        num: (a, b) => App.util.numSort(a.localId, b.localId),
        rar: (a, b) => ad.rarity.rank(b.rarity) - ad.rarity.rank(a.rarity) || priceOf(b) - priceOf(a),
        price: (a, b) => priceOf(b) - priceOf(a),
        etat: (a, b) => App.col.condRank((App.col.get(game, b.id) || {}).cond) - App.col.condRank((App.col.get(game, a.id) || {}).cond),
        name: (a, b) => a.name.localeCompare(b.name, 'fr'),
      };
      return cards.sort(sorters[state.sort]);
    };

    const drawGrid = () => {
      const cards = cardsFiltered();
      el.querySelector('#st-shown').textContent = `${cards.length} carte${cards.length > 1 ? 's' : ''} affichée${cards.length > 1 ? 's' : ''}`;
      grid.innerHTML = cards.length ? cards.map((c) => {
        return App.ui.cardTile(c, { game, item: App.col.get(game, c.id), price: prices[c.id] });
      }).join('') : `<div class="empty">${state.own === 'manquantes' ? '🎉 Aucune carte manquante ici !' : 'Aucune carte ne correspond.'}</div>`;
      App.ui.hydratePhotos(grid);
    };

    drawHead(); drawPull(); drawGrid();

    // Interactions
    el.querySelector('#st-own').addEventListener('click', (e) => {
      const b = e.target.closest('[data-own]'); if (!b) return;
      state.own = b.dataset.own;
      el.querySelectorAll('#st-own .chip').forEach((c) => c.classList.toggle('on', c === b));
      drawGrid();
    });
    el.querySelector('#st-rfilter').addEventListener('click', (e) => {
      const b = e.target.closest('[data-r]'); if (!b) return;
      const r = b.dataset.r;
      state.rarities.has(r) ? state.rarities.delete(r) : state.rarities.add(r);
      b.classList.toggle('on');
      drawGrid();
    });
    el.querySelector('#st-sort').addEventListener('change', (e) => { state.sort = e.target.value; drawGrid(); });
    el.querySelector('#st-q').addEventListener('input', debounce((e) => { state.q = e.target.value; drawGrid(); }, 200));
    grid.addEventListener('click', async (e) => {
      const card = set.cards.find((c) => c.id === (e.target.closest('.ctile') || {}).dataset?.card);
      if (!card) return;
      App.cardModal(game, card.id, { set, list: cardsFiltered().map((c) => c.id) });
    });

    const unsub = App.col.on(() => { drawHead(); drawGrid(); });

    // Prix de toutes les cartes de la série (en arrière-plan, gardés 24 h en cache)
    let stopped = false;
    const task = App.bg.start(`Prix · ${set.name}`, set.cards.length);
    App.util.pool(set.cards, 4, async (c) => {
      if (stopped) return;
      const full = await ad.getCard(c.id);
      const p = ad.price(full);
      if (p) prices[c.id] = p;
      if (!c.rarity && full.rarity) c.rarity = full.rarity;
    }, (d, n) => task.tick(d)).then(() => {
      task.done();
      pricesDone = true;
      if (!stopped && alive()) {
        drawHead();
        if (set.rarityInfoMissing && set.cards.every((c) => c.rarity)) { set.rarityInfoMissing = false; drawHead(); drawPull(); }
        drawGrid();
      }
    });

    return () => { stopped = true; unsub(); task.done(); };
  },
};
