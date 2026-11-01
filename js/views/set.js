/* Page d'une série : progression, raretés, taux de drop, filtres et toutes les cartes */
App.views.set = {
  async render(el, { game, setId, query }, alive) {
    const { esc, euro, norm, debounce } = App.util;
    const ad = App.games.get(game);
    const own = !!ad.ownOnly; // collection perso : seulement tes cartes
    const set = await ad.getSet(setId);
    if (!alive()) return;

    const prices = {}; // id carte → { value, unit }
    let pricesDone = false, allP = null; // allP : chargement de tous les prix (demandé : coût de la série, tri par prix)
    const byId = new Map(set.cards.map((c) => [c.id, c]));
    /** Coût estimé (prix du marché) : pour finir la série, et pour la série complète */
    const costBlock = () => {
      if (ad.noPrices) return '';
      const official = (c) => { if (ad.isOfficial) return ad.isOfficial(c.localId, set); const n = parseInt(c.localId, 10); return !isNaN(n) && String(n) === String(c.localId).replace(/^0+(?=\d)/, '') && n <= set.official; };
      const counted = App.settings.completion === 'official' ? set.cards.filter(official) : set.cards;
      const pv = (c) => (prices[c.id] && App.util.toEur(prices[c.id].value, prices[c.id].unit)) || 0;
      const miss = counted.filter((c) => !App.col.owned(game, c.id));
      const missCost = miss.reduce((t, c) => t + pv(c), 0), fullCost = counted.reduce((t, c) => t + pv(c), 0);
      const unknown = counted.filter((c) => !pv(c)).length;
      const booster = ad.boosterUrl ? ad.boosterUrl(set) : `https://www.cardmarket.com/fr/Pokemon/Products/Search?searchString=${encodeURIComponent(set.name + ' booster')}`;
      return `<div class="set-cost">
        ${pricesDone ? `${miss.length ? `<span>${App.icons.icon('target', 14)} Finir la série : <b>≈ ${euro(missCost)}</b> <span class="muted">(${miss.length} carte${miss.length > 1 ? 's' : ''})</span></span>` : ''}
          <span>${App.icons.icon('coins', 14)} Série complète : <b>≈ ${euro(fullCost)}</b></span>${unknown ? `<span class="muted small">${unknown} carte${unknown > 1 ? 's' : ''} sans prix</span>` : ''}`
          : allP ? `<span class="muted">${App.icons.icon('coins', 14)} Estimation du coût de la série… (prix en cours de chargement)</span>`
          : `<button class="btn sm" id="st-cost">${App.icons.icon('coins', 14)} Combien coûte la série ?</button>`}
        <a href="${booster}" target="_blank" rel="noopener" class="small">${esc(ad.boosterLabel || 'Prix des boosters et displays sur Cardmarket')} ↗</a>
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
        ${ad.setLanguages ? `<div class="set-lang" role="group" aria-label="Langue des cartes de cette série">${ad.setLanguages().map((l) => `<button class="${ad.langFor(set.id) === l.id ? 'on' : ''}" data-lang="${l.id}" title="Cartes en ${l.name.toLowerCase()}">${l.id.toUpperCase()}</button>`).join('')}</div>` : ''}
      </section>

      <section class="panel section" id="st-rar" ${own ? 'hidden' : ''}></section>
      ${pr ? `<section class="panel section" id="st-pull"></section>` : ''}

      <div class="toolbar">
        <div class="chips" id="st-own" ${own ? 'hidden' : ''}>
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
      <div id="st-more" class="st-more"></div>
      ${own ? `<p class="muted small" style="margin-top:22px">Collection perso : seulement tes cartes, ajoutées par photo. <a href="#" id="st-propose">Proposer une licence</a></p>`
        : `<p class="muted small" style="margin-top:22px">Données cartes : <a href="${ad.source.url}" target="_blank" rel="noopener">${ad.source.name}</a>. ${esc(ad.priceNote || "Prix : tendance Cardmarket (€), mise à jour quotidienne.")}</p>`}
    `;

    const langBox = el.querySelector('.set-lang');
    if (langBox) langBox.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-lang]');
      if (!b || b.classList.contains('on')) return;
      langBox.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      await ad.setLangFor(set.id, b.dataset.lang);
      window.dispatchEvent(new HashChangeEvent('hashchange')); // on redessine la page dans la nouvelle langue
    });
    const head = el.querySelector('#st-head');
    head.addEventListener('click', async (e) => {
      if (e.target.closest('#st-cost')) { allPrices(); drawHead(); return; }
      if (!e.target.closest('#st-goal')) return;
      await App.wish.addGoal(game, set);
      App.util.toast(`🎯 Objectif ajouté : compléter ${set.name}`);
      drawHead();
    });
    const grid = el.querySelector('#st-grid');

    /** Collection perso (v4.02) : seulement tes cartes ; « Complète » si le nombre de cartes de la série est connu */
    const drawOwnHead = (p) => {
      const lic = set.group.name, add = `#/perso/ajouter?lic=${encodeURIComponent(lic)}&serie=${encodeURIComponent(set.name)}`;
      head.innerHTML = `
        <div class="muted small">${esc(lic)} · collection perso</div>
        <h1 class="row" style="gap:10px">${esc(set.name)}${App.ui.favSetBtn(game, set, 'inline')}</h1>
        <div class="row" style="align-items:baseline">
          ${p.total ? `<span class="bigcount">${p.have}<span class="muted" style="font-size:1.4rem">/${p.total}</span></span>` : `<span class="bigcount">${p.have}</span><span class="muted">carte${p.have > 1 ? 's' : ''}</span>`}
          ${p.complete ? `<span class="medal">${App.icons.icon('trophy', 14)} Complète !</span>` : ''}
        </div>
        ${p.total ? `<div style="margin:10px 0">${App.ui.progressBar(p)}</div>` : ''}
        <form class="row small st-total" id="st-total" style="gap:8px;margin-top:8px">
          <label class="muted">Cartes dans la série <input type="number" min="0" max="5000" inputmode="numeric" value="${p.total || ''}" placeholder="?" style="width:80px"></label>
          <button class="btn sm" type="submit">OK</button>
        </form>
        <div class="row" style="margin-top:12px;gap:8px"><a class="btn sm primary" href="${add}">${App.icons.icon('camera', 14)} Ajouter une carte</a></div>`;
      el.querySelector('#st-rfilter').innerHTML = '';
    };
    if (own) {
      head.addEventListener('submit', async (e) => {
        e.preventDefault();
        await ad.setTotal(set.id, e.target.querySelector('input').value);
        App.util.toast('Nombre de cartes de la série enregistré');
      });
      el.querySelector('#st-propose').addEventListener('click', (e) => { e.preventDefault(); App.views.persoAdd.propose(); });
    }

    // progression par rareté dépliée ? (dernier choix ; par défaut repliée sur téléphone, dépliée sur ordinateur)
    let rpOpen = !matchMedia('(max-width: 760px)').matches;
    try { const v = localStorage.getItem('rpOpen'); if (v) rpOpen = v === '1'; } catch (e) { /* */ }
    const drawHead = () => {
      const p = App.col.progress(game, set);
      if (own) return drawOwnHead(p);
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
          <span>${set.official} cartes numérotées${set.total > set.official ? ` + ${set.total - set.official} ${ad.extraLabel || "secrètes"}` : ''}</span>
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
        // repliable (demande d'Arnaud : bloc trop grand sur téléphone) : fermé par défaut sur téléphone, avec les pastilles « 1/3 » en résumé
        rar.innerHTML = `<details class="rp-box" ${rpOpen ? 'open' : ''}><summary><h3>Progression par rareté</h3><span class="rp-mini">${App.ui.rarityRow(game, p.byRarity)}</span></summary><div class="rarity-progress">${p.byRarity.map((r) => {
          const rp = { have: r.have, total: r.total, pct: App.util.pct(r.have, r.total), complete: r.have >= r.total };
          const k = ad.rarity.key(r.rarity);
          const rate = pr && k && pr.rates[k];
          return `<div class="rp-row">
            <span class="rp-name">${ad.rarity.symbol(r.rarity)} ${esc(ad.rarity.label(r.rarity))}${rp.complete ? ' ✓' : ''}</span>
            <span class="count small">${r.have}<span class="of">/${r.total}</span></span>
            ${App.ui.progressBar(rp)}
            ${rate ? `<span class="muted small" style="grid-column:1/-1">≈ 1 booster sur ${rate}</span>` : ''}
          </div>`;
        }).join('')}</div></details>`;
        rar.querySelector('.rp-box').addEventListener('toggle', (e) => { rpOpen = e.target.open; try { localStorage.setItem('rpOpen', rpOpen ? '1' : '0'); } catch (err) { /* */ } });
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

    // ---------- Prix (v4.01) : seulement des cartes qui passent à l'écran ; toutes d'un coup sur demande ----------
    let stopped = false, running = 0;
    const priceQ = [], queued = new Set(), fresh = new Set();
    const tileOf = (c) => App.ui.cardTile(c, { game, item: App.col.get(game, c.id), price: prices[c.id] });
    // tuiles dont le prix vient d'arriver : redessinées une par une (pas toute la grille)
    const flush = debounce(() => {
      if (stopped || !alive()) return;
      for (const id of fresh) {
        const node = grid.querySelector(`.ctile[data-card="${CSS.escape(id)}"]`);
        if (!node) continue;
        node.insertAdjacentHTML('afterend', tileOf(byId.get(id)));
        const nn = node.nextElementSibling;
        node.remove();
        App.ui.hydratePhotos(nn);
      }
      fresh.clear();
    }, 250);
    const fetchPrice = async (c) => {
      const full = await ad.getCard(c.id).catch(() => null);
      if (!full || stopped) return;
      const p = ad.price(full);
      if (p && !prices[c.id]) { prices[c.id] = p; fresh.add(c.id); flush(); }
      if (!c.rarity && full.rarity) c.rarity = full.rarity;
    };
    const pump = () => {
      while (running < 4 && priceQ.length && !stopped) {
        const c = priceQ.shift(); running++;
        fetchPrice(c).finally(() => { running--; pump(); });
      }
    };
    const wantPrice = (c) => { if (ad.noPrices || allP || queued.has(c.id)) return; queued.add(c.id); priceQ.push(c); pump(); };
    const seen = window.IntersectionObserver ? new IntersectionObserver((ents) => {
      for (const e of ents) if (e.isIntersecting) { seen.unobserve(e.target); const c = byId.get(e.target.dataset.card); if (c) wantPrice(c); }
    }, { rootMargin: '300px 0px' }) : null;
    /** Tous les prix de la série (gardés 24 h en cache) : coût de la série, tri par prix, raretés manquantes */
    const allPrices = () => allP || (allP = (async () => {
      priceQ.length = 0;
      const task = App.bg.start(`Prix · ${set.name}`, set.cards.length);
      await App.util.pool(ad.noPrices ? [] : set.cards, 4, async (c) => { if (!stopped && !prices[c.id]) await fetchPrice(c); }, (d) => task.tick(d));
      task.done();
      pricesDone = true;
      if (stopped || !alive()) return;
      drawHead();
      if (set.rarityInfoMissing && set.cards.every((c) => c.rarity)) { set.rarityInfoMissing = false; drawHead(); drawPull(); }
      if (state.sort === 'price' || state.sort === 'rar') drawGrid(true);
    })());

    // ---------- Grille : les cartes arrivent par paquets, au fil du défilement ----------
    const PAGE = 48;
    const more = el.querySelector('#st-more');
    let list = [], limit = PAGE;
    const addTiles = (from, to) => {
      grid.insertAdjacentHTML('beforeend', list.slice(from, to).map(tileOf).join(''));
      const added = [...grid.children].slice(from);
      if (seen) added.forEach((n) => seen.observe(n));
      else list.slice(from, to).forEach(wantPrice);
      App.ui.hydratePhotos(grid);
    };
    const drawMore = () => {
      const left = list.length - Math.min(limit, list.length);
      more.innerHTML = left > 0 ? `<button class="btn sm" data-more>Voir ${Math.min(left, PAGE)} carte${left > 1 ? 's' : ''} de plus (${left} restante${left > 1 ? 's' : ''})</button>` : '';
    };
    const showMore = () => {
      if (limit >= list.length) return;
      const from = limit; limit += PAGE;
      addTiles(from, Math.min(limit, list.length));
      drawMore();
    };
    more.addEventListener('click', (e) => { if (e.target.closest('[data-more]')) showMore(); });
    const moreObs = window.IntersectionObserver ? new IntersectionObserver((ents) => {
      if (ents.some((e) => e.isIntersecting)) showMore();
    }, { rootMargin: '600px 0px' }) : null;
    // le bas de la grille reste visible après un paquet (grand écran) : le suivant tout de suite
    const fillScreen = () => requestAnimationFrame(() => {
      if (!stopped && alive() && limit < list.length && more.getBoundingClientRect().top < innerHeight + 600) { showMore(); fillScreen(); }
    });

    /** keep = garder le nombre de cartes déjà montrées (collection modifiée, prix arrivés) */
    const drawGrid = (keep = false) => {
      list = cardsFiltered();
      if (!keep) limit = PAGE;
      el.querySelector('#st-shown').textContent = `${list.length} carte${list.length > 1 ? 's' : ''} affichée${list.length > 1 ? 's' : ''}`;
      if (seen) seen.disconnect();
      grid.innerHTML = list.length ? '' : `<div class="empty">${state.own === 'manquantes' ? '🎉 Aucune carte manquante ici !' : 'Aucune carte ne correspond.'}</div>`;
      if (list.length) addTiles(0, Math.min(limit, list.length));
      drawMore();
      fillScreen();
    };

    drawHead(); drawPull(); drawGrid();
    if (moreObs) moreObs.observe(more);
    if (set.rarityInfoMissing) allPrices(); // la progression par rareté en a besoin

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
    el.querySelector('#st-sort').addEventListener('change', (e) => {
      state.sort = e.target.value;
      if (state.sort === 'price') { allPrices(); drawHead(); }
      drawGrid();
    });
    el.querySelector('#st-q').addEventListener('input', debounce((e) => { state.q = e.target.value; drawGrid(); }, 200));
    grid.addEventListener('click', async (e) => {
      const card = byId.get((e.target.closest('.ctile') || {}).dataset?.card);
      if (!card) return;
      App.cardModal(game, card.id, { set, list: cardsFiltered().map((c) => c.id) });
    });

    const unsub = App.col.on(() => { drawHead(); drawGrid(true); });

    return () => { stopped = true; unsub(); if (seen) seen.disconnect(); if (moreObs) moreObs.disconnect(); };
  },
};
