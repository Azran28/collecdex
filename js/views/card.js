/* Fiche détaillée d'une carte (fenêtre) : infos, prix, taux de drop, et ta gestion (quantité, note, photos…) */
App.cardModal = async function (game, cardId, ctx = {}) {
  const { esc, euro, dateFr } = App.util;
  const ad = App.games.get(game);
  const body = App.util.openModal(App.ui.loading('Chargement de la carte…'), () => { closed = true; });
  let closed = false;
  let card;
  try { card = await ad.getCard(cardId); }
  catch (e) { body.innerHTML = App.ui.errorBox(e); return; }
  if (closed) return;

  const setInfo = ctx.set || {
    id: card.set.id, name: card.set.name, logo: card.set.logo, symbol: card.set.symbol,
    official: card.set.cardCount ? card.set.cardCount.official : null, total: card.set.cardCount ? card.set.cardCount.total : null,
    group: { id: (App.col.get(game, card.id) || { snap: {} }).snap.serieId || '' },
  };
  const base = { id: card.id, localId: card.localId, name: card.name, image: card.image, rarity: card.rarity, setId: setInfo.id, serieId: setInfo.group ? setInfo.group.id : '' };
  const price = ad.price(card);
  const pr = ad.pullRates(setInfo.id);
  const rk = ad.rarity.key(card.rarity);
  const rate = pr && rk && pr.rates[rk];
  let showOfficial = false;

  const variantNames = { normal: 'Normale', reverse: 'Reverse', holo: 'Holo', firstEdition: '1re édition' };
  const availVariants = Object.entries(card.variants || {}).filter(([k, v]) => v && variantNames[k]).map(([k]) => k);

  const idx = ctx.list ? ctx.list.indexOf(card.id) : -1;
  const prevId = idx > 0 ? ctx.list[idx - 1] : null;
  const nextId = idx >= 0 && idx < ctx.list.length - 1 ? ctx.list[idx + 1] : null;

  const cm = card.pricing && card.pricing.cardmarket;
  const priceRows = [];
  if (cm) {
    if (cm.trend > 0) priceRows.push(['Tendance', cm.trend]);
    if (cm.avg > 0) priceRows.push(['Prix moyen', cm.avg]);
    if (cm.avg30 > 0) priceRows.push(['Moyenne 30 j', cm.avg30]);
    if (cm.low > 0) priceRows.push(['Plus bas', cm.low]);
    if (cm['trend-holo'] > 0) priceRows.push(['Tendance holo/reverse', cm['trend-holo']]);
  }

  body.innerHTML = `
    <div class="cd">
      <div class="cd-img">
        <img id="cd-img" src="${esc(ad.img.card(base, 'high'))}" alt="${esc(card.name)}" data-alt="${esc(card.name)}">
        <div class="row imgswitch" id="cd-imgswitch"></div>
        ${ctx.list ? `<div class="row" style="margin-top:10px;justify-content:space-between">
          <button class="btn sm" id="cd-prev" ${prevId ? '' : 'disabled'}>‹ Précédente</button>
          <span class="muted small">${idx + 1} / ${ctx.list.length}</span>
          <button class="btn sm" id="cd-next" ${nextId ? '' : 'disabled'}>Suivante ›</button></div>` : ''}
      </div>
      <div>
        <div class="muted">${esc(setInfo.name)} · n° ${esc(card.localId)}${setInfo.official ? '/' + String(setInfo.official).padStart(String(card.localId).length, '0') : ''}</div>
        <h1 style="margin-top:4px">${esc(card.name)}</h1>
        <div class="row">${ad.rarity.symbol(card.rarity, 18)} <b>${esc(ad.rarity.label(card.rarity))}</b>${rate ? `<span class="pill">≈ 1 booster sur ${rate.toLocaleString('fr-FR')} pour cette rareté</span>` : ''}</div>
        <dl>
          ${card.category ? `<dt>Catégorie</dt><dd>${esc(card.category)}${card.stage ? ' · ' + esc(card.stage) : ''}</dd>` : ''}
          ${card.types && card.types.length ? `<dt>Type</dt><dd>${esc(card.types.join(', '))}</dd>` : ''}
          ${card.hp ? `<dt>PV</dt><dd>${esc(card.hp)}</dd>` : ''}
          ${card.illustrator ? `<dt>Illustrateur</dt><dd>${esc(card.illustrator)}</dd>` : ''}
          ${availVariants.length ? `<dt>Versions</dt><dd>${availVariants.map((v) => variantNames[v]).join(', ')}</dd>` : ''}
          ${setInfo.releaseDate ? `<dt>Sortie</dt><dd>${dateFr(setInfo.releaseDate)}</dd>` : ''}
        </dl>

        <div class="section">
          <h3>Valeur</h3>
          ${priceRows.length ? `<div class="price-box">${priceRows.map(([l, v]) => `<div class="stat"><b>${euro(v)}</b><span>${l}</span></div>`).join('')}</div>
            <div class="small muted">Cardmarket, mis à jour le ${dateFr(cm.updated)}.</div>`
            : price ? `<div class="price-box"><div class="stat"><b>${euro(price.value, price.unit)}</b><span>Prix marché ${esc(price.source)}</span></div></div>`
            : '<div class="muted small">Pas de prix disponible pour cette carte.</div>'}
          <div class="row" style="margin-top:8px"><a class="btn sm" target="_blank" rel="noopener" href="${esc(ad.cardmarketUrl(card, setInfo.name))}">Voir sur Cardmarket ↗</a></div>
        </div>

        <div class="section" id="cd-mine"></div>
      </div>
    </div>`;

  const drawImage = async () => {
    const it = App.col.get(game, card.id);
    const imgEl = body.querySelector('#cd-img');
    const sw = body.querySelector('#cd-imgswitch');
    const hasPhoto = it && it.displayPhoto;
    if (hasPhoto && !showOfficial) imgEl.src = await App.col.photoURL(it.displayPhoto);
    else imgEl.src = ad.img.card(base, 'high');
    sw.innerHTML = hasPhoto ? `<div class="chips"><button class="chip ${showOfficial ? '' : 'on'}" data-img="mine">📷 Ma photo</button><button class="chip ${showOfficial ? 'on' : ''}" data-img="off">Visuel officiel</button></div>` : '';
  };

  const drawMine = async () => {
    const box = body.querySelector('#cd-mine');
    const it = App.col.get(game, card.id);
    if (!it || !it.qty) {
      box.innerHTML = `<h3>Ma collection</h3>
        <p class="muted">Tu n’as pas encore cette carte. Pour l’ajouter, scanne-la : ta photo deviendra son visuel.</p>
        <a class="btn primary" href="#/scan?carte=${encodeURIComponent(card.id)}">📷 Scanner cette carte</a>`;
      return;
    }
    const photos = await Promise.all((it.photos || []).map(async (id) => ({ id, url: await App.col.photoURL(id) })));
    box.innerHTML = `<h3>Ma collection</h3>
      <div class="row" style="margin-bottom:12px">
        <span>Exemplaires</span>
        <span class="stepper"><button id="cd-minus" title="Retirer un exemplaire">−</button><span>${it.qty}</span></span>
        <a class="btn sm" href="#/scan?carte=${encodeURIComponent(card.id)}" title="Chaque exemplaire se scanne">📷 Scanner un exemplaire de plus</a>
        <button class="btn sm ${it.favorite ? 'primary' : ''}" id="cd-fav">${it.favorite ? '★ Favorite' : '☆ Mettre en favori'}</button>
      </div>
      ${availVariants.length ? `<div class="row" style="margin-bottom:12px"><span>Versions possédées</span><div class="chips" id="cd-vars">${availVariants.map((v) => `<button class="chip ${it.variants.includes(v) ? 'on' : ''}" data-v="${v}">${variantNames[v]}</button>`).join('')}</div></div>` : ''}
      <div class="row" style="margin-bottom:12px"><span>Ma note</span>${App.ui.stars(it.rating || 0)}</div>
      <div style="margin-bottom:12px"><textarea id="cd-note" placeholder="Note perso (état, provenance, gradée PSA…)">${esc(it.note || '')}</textarea></div>
      <div style="margin-bottom:6px">Mes photos de cette carte <span class="muted small">(clique pour l’utiliser comme visuel)</span></div>
      <div class="photos" id="cd-photos">
        ${photos.map((p) => `<div class="ph ${it.displayPhoto === p.id ? 'sel' : ''}" data-ph="${p.id}"><img src="${p.url}" alt=""><button class="del" data-del="${p.id}" title="Supprimer">×</button></div>`).join('')}
        <label class="btn sm" style="height:fit-content">📷 Ajouter une photo<input type="file" accept="image/*" id="cd-file" hidden></label>
      </div>
      ${it.displayPhoto ? `<button class="btn sm ghost" id="cd-useoff" style="margin-top:8px">Utiliser le visuel officiel par défaut</button>` : ''}
      <div class="row" style="margin-top:16px"><span class="muted small">Ajoutée le ${dateFr(it.addedAt)}</span><span class="spacer"></span><button class="btn sm ghost" id="cd-remove">Retirer de ma collection</button></div>`;
  };

  body.addEventListener('click', async (e) => {
    const t = e.target;
    const key = App.col.keyOf(game, card.id);
    if (t.closest('#cd-prev') && prevId) return App.cardModal(game, prevId, ctx);
    if (t.closest('#cd-next') && nextId) return App.cardModal(game, nextId, ctx);
    if (t.closest('[data-img]')) { showOfficial = t.closest('[data-img]').dataset.img === 'off'; return drawImage(); }
    if (t.closest('#cd-minus')) {
      const it = App.col.get(game, card.id);
      if (it.qty === 1 && !confirm('Retirer cette carte de ta collection ?')) return;
      await App.col.setQty(key, it.qty - 1); drawImage(); return drawMine();
    }
    if (t.closest('#cd-fav')) { const it = App.col.get(game, card.id); await App.col.update(key, { favorite: !it.favorite }); return drawMine(); }
    if (t.closest('[data-v]') && t.closest('#cd-vars')) {
      const v = t.closest('[data-v]').dataset.v; const it = App.col.get(game, card.id);
      const vars = it.variants.includes(v) ? it.variants.filter((x) => x !== v) : [...it.variants, v];
      await App.col.update(key, { variants: vars }); return drawMine();
    }
    if (t.closest('[data-stars] button')) { await App.col.update(key, { rating: +t.closest('button').dataset.v }); return drawMine(); }
    if (t.closest('[data-del]')) {
      e.stopPropagation();
      if (!confirm('Supprimer cette photo ?')) return;
      await App.col.deletePhoto(key, t.closest('[data-del]').dataset.del); drawImage(); return drawMine();
    }
    if (t.closest('[data-ph]')) { await App.col.update(key, { displayPhoto: t.closest('[data-ph]').dataset.ph }); showOfficial = false; drawImage(); return drawMine(); }
    if (t.closest('#cd-useoff')) { await App.col.update(key, { displayPhoto: null }); drawImage(); return drawMine(); }
    if (t.closest('#cd-remove')) {
      if (!confirm('Retirer complètement cette carte (et ses photos) de ta collection ?')) return;
      await App.col.remove(key); drawImage(); return drawMine();
    }
  });
  body.addEventListener('change', async (e) => {
    if (e.target.id === 'cd-file' && e.target.files[0]) {
      try { await App.col.addPhoto(App.col.keyOf(game, card.id), e.target.files[0]); App.util.toast('Photo ajoutée ✓'); }
      catch (err) { App.util.toast(err.message); }
      showOfficial = false; drawImage(); drawMine();
    }
  });
  body.addEventListener('input', App.util.debounce(async (e) => {
    if (e.target.id === 'cd-note') await App.col.update(App.col.keyOf(game, card.id), { note: e.target.value });
  }, 400));

  drawImage(); drawMine();
};
