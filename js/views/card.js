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
  let showOfficial = false, lastPhoto = null;
  // intensité de l'effet holographique selon la rareté (0 = carte ordinaire)
  // les anciennes holos sont notées « Rare » par la source : une carte qui n'existe qu'en holo compte comme holo
  const onlyHolo = card.variants && card.variants.holo && !card.variants.normal;
  const rrank = Math.max(ad.rarity.rank(card.rarity), onlyHolo ? 4 : 0);
  const holoTier = rrank <= 2 ? 0 : rrank === 3 ? 1 : rrank <= 5 ? 2 : rrank <= 8 ? 3 : rrank <= 10 ? 4 : 5;

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
        <div class="holo-card tier-${holoTier}" id="cd-holo">
          <img id="cd-img" src="${esc(ad.img.card(base, 'high'))}" alt="${esc(card.name)}" data-alt="${esc(card.name)}">
          ${holoTier ? '<div class="holo-shine"></div><div class="holo-glare"></div>' : ''}${holoTier >= 4 ? '<div class="holo-sparkle"></div>' : ''}
        </div>
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
    const hasPhoto = it && it.qty > 0 && it.displayPhoto;
    showOfficial = !hasPhoto;
    if (hasPhoto) imgEl.src = await App.col.photoURL(it.displayPhoto);
    else imgEl.src = ad.img.card(base, 'high');
    // visuel utilisé partout (Mon Dex, vitrine, séries) : ta photo ou le visuel officiel
    sw.innerHTML = it && it.qty > 0 && (it.photos || []).length ? `<div class="chips"><button class="chip ${showOfficial ? '' : 'on'}" data-img="mine">${App.icons.icon('camera', 14)} Ma photo</button><button class="chip ${showOfficial ? 'on' : ''}" data-img="off">Visuel officiel</button></div>` : '';
  };

  const drawMine = async () => {
    const box = body.querySelector('#cd-mine');
    const it = App.col.get(game, card.id);
    if (!it || !it.qty) {
      box.innerHTML = `<h3>Mon Dex</h3>
        <p class="muted">Tu n’as pas encore cette carte. Capture-la en photo pour l’ajouter à ton Dex.</p>
        <div class="row"><a class="btn primary" href="#/scan?carte=${encodeURIComponent(card.id)}">${App.icons.icon('capture', 16)} Capturer cette carte</a>
        <button class="btn ${App.wish.has(game, card.id) ? 'wish-on' : ''}" id="cd-wish">${App.wish.has(game, card.id) ? '♥ Je la cherche' : '♡ Je la cherche'}</button></div>
        <p class="small muted" style="margin:8px 0 0">${App.wish.has(game, card.id) ? 'Elle est dans ta <a href="#/objectifs?tab=souhaits">liste de souhaits</a>.' : 'Ajoute-la à ta liste de souhaits pour la retrouver (et plus tard pour les échanges).'}</p>`;
      return;
    }
    const photos = await Promise.all((it.photos || []).map(async (id) => ({ id, url: await App.col.photoURL(id) })));
    const certified = App.certify.isCertified(it);
    box.innerHTML = `<h3 class="row" style="gap:8px">Mon Dex ${certified ? `<span class="cert-pill" title="Au moins une photo de cette carte a été capturée en direct et vérifiée">${App.icons.icon('shield', 14)} Certifiée</span>` : ''}</h3>
      ${certified ? '' : `<p class="small muted" style="margin-top:-4px">${App.icons.icon('shield', 13)} Non certifiée${it.certNote && it.certNote.reason ? ` (raison : ${esc(it.certNote.reason)})` : ''}. Pour le badge, <a href="#/scan?carte=${encodeURIComponent(card.id)}">capture-la avec la caméra</a>${App.cloud.enabled && !App.cloud.user ? ' (connecté à ton compte)' : ''}.</p>`}
      <div class="row" style="margin-bottom:12px">
        <span>Exemplaires</span>
        <span class="stepper"><button id="cd-minus" title="Retirer un exemplaire">−</button><span>${it.qty}</span></span>
        <button class="btn sm danger" id="cd-remove" title="Tu ne l’as plus, ou erreur d’ajout">${App.icons.icon('trash', 14)} Retirer de mon Dex</button>
        <a class="btn sm" href="#/scan?carte=${encodeURIComponent(card.id)}" title="Chaque exemplaire se capture en photo">${App.icons.icon('plus', 14)} Capturer un exemplaire</a>
        <button class="btn sm ${it.favorite ? 'primary' : ''}" id="cd-fav">${it.favorite ? '★ Favorite' : '☆ Mettre en favori'}</button>
      </div>
      ${availVariants.length ? `<div class="row" style="margin-bottom:12px"><span>Versions possédées</span><div class="chips" id="cd-vars">${availVariants.map((v) => `<button class="chip ${it.variants.includes(v) ? 'on' : ''}" data-v="${v}">${variantNames[v]}</button>`).join('')}</div></div>` : ''}
      <div class="row" style="margin-bottom:12px"><span>Ma note</span>${App.ui.stars(it.rating || 0)}</div>
      <div style="margin-bottom:12px"><textarea id="cd-note" placeholder="Note perso (état, provenance, gradée PSA…)">${esc(it.note || '')}</textarea></div>
      <div style="margin-bottom:6px">Mes photos de cette carte <span class="muted small">(clique pour l’utiliser comme visuel, ✂ pour la recadrer)</span></div>
      <div class="photos" id="cd-photos">
        ${photos.map((p) => `<div class="ph ${it.displayPhoto === p.id ? 'sel' : ''}" data-ph="${p.id}"><img src="${p.url}" alt="">${App.certify.photoCertified(p.id) ? `<span class="ph-cert" title="Photo certifiée">${App.icons.icon('shield', 12)}</span>` : ''}<button class="del" data-del="${p.id}" title="Supprimer cette photo">×</button><button class="crop" data-crop="${p.id}" title="Recadrer cette photo">✂</button></div>`).join('')}
        <label class="btn sm" style="height:fit-content">📷 Ajouter une photo<input type="file" accept="image/*" id="cd-file" hidden></label>
      </div>

      <div class="row" style="margin-top:16px"><span class="muted small">Ajoutée le ${dateFr(it.addedAt)}</span></div>`;
  };

  // la carte s'incline et ses reflets suivent le doigt / la souris
  const holo = body.querySelector('#cd-holo');
  if (holo) {
    let idleT = null;
    const setP = (x, y) => {
      holo.style.setProperty('--mx', (x * 100).toFixed(1) + '%'); holo.style.setProperty('--my', (y * 100).toFixed(1) + '%');
      holo.style.setProperty('--rx', ((0.5 - y) * 16).toFixed(2) + 'deg'); holo.style.setProperty('--ry', ((x - 0.5) * 20).toFixed(2) + 'deg');
      holo.style.setProperty('--pos', (x * 100).toFixed(1) + '%'); holo.style.setProperty('--hyp', Math.min(1, Math.hypot(x - 0.5, y - 0.5) * 2).toFixed(2));
    };
    holo.addEventListener('pointermove', (e) => {
      const r = holo.getBoundingClientRect();
      holo.classList.add('active'); holo.classList.remove('idle');
      setP(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)));
      clearTimeout(idleT); idleT = setTimeout(() => { holo.classList.remove('active'); holo.classList.add('idle'); }, 2500);
    });
    holo.addEventListener('pointerleave', () => { holo.classList.remove('active'); setP(0.5, 0.5); holo.classList.add('idle'); });
    setP(0.5, 0.5);
    if (holoTier) holo.classList.add('idle'); // sans souris (téléphone) : la carte bouge doucement toute seule
  }

  body.addEventListener('click', async (e) => {
    const t = e.target;
    if (t.closest('#cd-wish')) {
      await App.wish.toggle(game, { id: card.id, name: card.name, localId: card.localId, image: card.image, rarity: card.rarity, setId: setInfo.id, serieId: base.serieId }, { id: setInfo.id, name: setInfo.name });
      return drawMine();
    }
    const key = App.col.keyOf(game, card.id);
    if (t.closest('#cd-prev') && prevId) return App.cardModal(game, prevId, ctx);
    if (t.closest('#cd-next') && nextId) return App.cardModal(game, nextId, ctx);
    if (t.closest('[data-img]')) {
      const it = App.col.byKey(key); if (!it) return;
      if (t.closest('[data-img]').dataset.img === 'off') { if (it.displayPhoto) lastPhoto = it.displayPhoto; await App.col.update(key, { displayPhoto: null }); }
      else { const id = (lastPhoto && it.photos.includes(lastPhoto)) ? lastPhoto : it.photos[it.photos.length - 1]; await App.col.update(key, { displayPhoto: id }); }
      drawImage(); return drawMine();
    }
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
    if (t.closest('[data-crop]')) {
      e.stopPropagation();
      const id = t.closest('[data-crop]').dataset.crop;
      const it = App.col.byKey(key);
      // photo venant d'une page de classeur gardée sur cet appareil → on recadre depuis la page entière
      const src = it && it.photoSrc && it.photoSrc[id];
      const page = src ? await App.col.getPage(src.page) : null;
      if (page) {
        const out = await App.ui.cropImage(page, { title: `Recadrer ${card.name} depuis la page du classeur`, initial: src.rect, withBox: true });
        if (out) { await App.col.replacePhoto(key, id, out.blob); await App.col.setPhotoSource(key, id, { page: src.page, rect: out.box }); App.util.toast('Photo recadrée ✓'); drawImage(); drawMine(); }
        return;
      }
      const blob = (await App.db.get('photos', id)) || (await App.cloud.fetchPhoto(id).catch(() => null));
      if (!blob) return App.util.toast('Photo introuvable sur cet appareil');
      const out = await App.ui.cropImage(blob, { title: `Recadrer la photo de ${card.name}` });
      if (out) { await App.col.replacePhoto(key, id, out); App.util.toast('Photo recadrée ✓'); drawImage(); drawMine(); }
      return;
    }
    if (t.closest('[data-del]')) {
      e.stopPropagation();
      if (!confirm('Supprimer cette photo ?')) return;
      await App.col.deletePhoto(key, t.closest('[data-del]').dataset.del); drawImage(); return drawMine();
    }
    if (t.closest('[data-ph]')) { await App.col.update(key, { displayPhoto: t.closest('[data-ph]').dataset.ph }); showOfficial = false; drawImage(); return drawMine(); }
    if (t.closest('#cd-useoff')) { await App.col.update(key, { displayPhoto: null }); drawImage(); return drawMine(); }
    if (t.closest('#cd-remove')) {
      if (!confirm(`Supprimer ${card.name} de ta collection ?\n\nSes photos et ses exemplaires seront supprimés. (Tu pourras la rescanner plus tard.)`)) return;
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
