/* Morceaux d'interface réutilisés par plusieurs pages */
App.ui = (() => {
  const { esc, euro } = App.util;

  // Image manquante en français → on essaie l'anglais, puis on affiche un texte.
  window.addEventListener('error', (e) => {
    const el = e.target;
    if (!(el instanceof HTMLImageElement)) return;
    const src = el.getAttribute('src') || '';
    if (!el.dataset.fb && /assets\.tcgdex\.net\/(?!en\/)[a-z-]+\//.test(src)) {
      el.dataset.fb = '1';
      el.src = src.replace(/assets\.tcgdex\.net\/[a-z-]+\//, 'assets.tcgdex.net/en/');
      return;
    }
    if (el.dataset.alt) {
      const span = document.createElement('span');
      span.className = el.dataset.altClass || 'noimg';
      span.textContent = el.dataset.alt;
      el.replaceWith(span);
    } else {
      el.style.visibility = 'hidden';
    }
  }, true);

  const progressBar = (p) => `<div class="progress ${p.complete ? 'done' : ''}"><span style="width:${Math.min(100, p.pct)}%"></span></div>`;

  const countHTML = (p) => `<span class="count">${p.have}<span class="of">/${p.total}</span></span>`;

  /** Tuile de carte dans une grille */
  function cardTile(card, { game = 'pokemon', item = null, showSet = false, showPrice = true, price: marketPrice = null } = {}) {
    const ad = App.games.get(game);
    const it = item || App.col.get(game, card.id);
    const own = it && it.qty > 0;
    const pv = it && it.price && it.price.value != null ? it.price : marketPrice;
    const price = pv && pv.value != null ? euro(pv.value, pv.unit) : '';
    const numOnly = !own && App.settings.missingStyle === 'numero';
    const src = numOnly ? '' : ad.img.card(card, 'low');
    return `
      <div class="ctile ${own ? 'owned' : 'missing'}" data-card="${esc(card.id)}" data-game="${game}">
        <div class="cimg">
          ${numOnly ? `<div class="numonly"><b>${esc(card.localId)}</b><span>${esc(card.name)}</span></div>`
            : src ? `<img loading="lazy" src="${esc(src)}" alt="${esc(card.name)}" data-alt="${esc(card.name)}" ${it && it.displayPhoto && App.settings.preferPhotos ? `data-photo="${esc(it.displayPhoto)}"` : ''}>` : `<span class="noimg">${esc(card.name)}</span>`}
          ${own && it.qty > 1 ? `<span class="qty">×${it.qty}</span>` : ''}
          ${own && it.favorite ? '<span class="fav">★</span>' : ''}
          ${own && it.displayPhoto && App.settings.preferPhotos ? '<span class="myphoto">📷</span>' : ''}
          ${own ? '<span class="ownedmark">✓</span>' : ''}
        </div>
        <div class="cinfo">
          <span class="cname" title="${esc(card.name)}">${esc(card.name)}</span>
          ${ad.rarity.symbol(card.rarity, 12)}
        </div>
        <div class="cinfo">
          <span class="cnum">${showSet ? esc((card.setName || '') + ' · ') : ''}#${esc(card.localId)}</span>
          ${showPrice && price ? `<span class="price">${price}</span>` : ''}
        </div>
      </div>`;
  }

  /** Remplace les images officielles par tes photos quand tu en as choisi une */
  async function hydratePhotos(root) {
    for (const img of root.querySelectorAll('img[data-photo]')) {
      const u = await App.col.photoURL(img.dataset.photo);
      if (u) { img.src = u; img.removeAttribute('data-photo'); }
    }
  }

  function rarityRow(game, byRarity) {
    const ad = App.games.get(game);
    return `<div class="rarity-list">${byRarity.map((r) => `<span class="pill" title="${esc(ad.rarity.label(r.rarity))} : ${r.have}/${r.total}">${ad.rarity.symbol(r.rarity, 12)} <span class="small">${r.have}/${r.total}</span></span>`).join('')}</div>`;
  }

  const loading = (msg = 'Chargement…') => `<div class="loading"><div class="spinner"></div>${esc(msg)}</div>`;

  const errorBox = (e) => `<div class="error-box"><b>Oups, impossible de charger les données.</b><br><span class="small">${esc(e && e.message ? e.message : e)}</span><br><br><span class="small muted">Vérifie ta connexion internet. Les données viennent de TCGdex (api.tcgdex.net).</span><br><br><button class="btn sm" onclick="location.reload()">Réessayer</button></div>`;

  const stars = (n, name = 'rating') => `<span class="stars" data-stars="${name}">${[1, 2, 3, 4, 5].map((i) => `<button type="button" data-v="${i}" class="${i <= n ? 'on' : ''}" aria-label="${i} étoile${i > 1 ? 's' : ''}">★</button>`).join('')}</span>`;

  return { progressBar, countHTML, cardTile, hydratePhotos, rarityRow, loading, errorBox, stars };
})();
