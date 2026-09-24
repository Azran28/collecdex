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
          ${own && it.displayPhoto && App.settings.preferPhotos ? '<span class="myphoto" title="Visuel : ta photo (et non l’image officielle)">📷</span>' : ''}
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

  /**
   * Recadrer une image au format carte (63 × 88) : cadre jaune déplaçable + curseur de taille.
   * Renvoie une promesse : le nouveau Blob, ou null si annulé.
   */
  function cropImage(blob, { title = 'Recadrer la photo' } = {}) {
    return new Promise((resolve) => {
      const RATIO = 63 / 88;
      const url = URL.createObjectURL(blob);
      const ov = document.createElement('div');
      ov.className = 'cropper';
      ov.innerHTML = `<div class="cropper-box">
        <h3 style="margin-top:0">${esc(title)}</h3>
        <p class="small muted">Fais glisser le cadre jaune sur la carte, ajuste sa taille, puis valide.</p>
        <div class="cropper-stage"><div class="crop-area"><img src="${url}" alt=""><div class="crop-box"></div></div></div>
        <div class="row" style="margin-top:10px"><span class="small">Taille</span><input type="range" min="10" max="100" value="60" style="flex:1"></div>
        <div class="row" style="margin-top:10px;justify-content:flex-end"><button class="btn ghost" data-act="no">Annuler</button><button class="btn primary" data-act="ok">✓ Valider</button></div>
      </div>`;
      document.body.appendChild(ov);
      const img = ov.querySelector('img'), box = ov.querySelector('.crop-box'), range = ov.querySelector('input[type=range]');
      const st = { cx: 0.5, cy: 0.5, size: 0.6 };
      const rect = () => {
        const W = img.clientWidth, H = img.clientHeight;
        let h = H * st.size, w = h * RATIO;
        if (w > W) { w = W * st.size; h = w / RATIO; }
        return { x: Math.min(Math.max(0, st.cx * W - w / 2), W - w), y: Math.min(Math.max(0, st.cy * H - h / 2), H - h), w, h, W, H };
      };
      const place = () => { const r = rect(); Object.assign(box.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' }); };
      img.onload = () => { const ar = img.naturalWidth / img.naturalHeight; st.size = Math.abs(ar - RATIO) < 0.06 ? 1 : 0.6; range.value = st.size * 100; place(); };
      range.oninput = () => { st.size = range.value / 100; place(); };
      ov.querySelector('.crop-area').addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const area = e.currentTarget.getBoundingClientRect();
        const move = (ev) => { st.cx = (ev.clientX - area.left) / img.clientWidth; st.cy = (ev.clientY - area.top) / img.clientHeight; place(); };
        move(e);
        const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
        window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
      });
      const done = (val) => { URL.revokeObjectURL(url); ov.remove(); resolve(val); };
      ov.addEventListener('click', (e) => {
        const a = e.target.closest('[data-act]'); if (!a) return;
        if (a.dataset.act === 'no') return done(null);
        const r = rect(), k = img.naturalWidth / r.W, sw = r.w * k, sh = r.h * k;
        const outW = Math.min(900, Math.round(sw)), outH = Math.round(outW / RATIO);
        const c = document.createElement('canvas'); c.width = outW; c.height = outH;
        c.getContext('2d').drawImage(img, r.x * k, r.y * k, sw, sh, 0, 0, outW, outH);
        c.toBlob((b) => done(b), 'image/jpeg', 0.9);
      });
    });
  }

  return { cropImage, progressBar, countHTML, cardTile, hydratePhotos, rarityRow, loading, errorBox, stars };
})();
