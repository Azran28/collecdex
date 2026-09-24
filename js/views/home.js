/* Page d'accueil : chiffres clés, jeux disponibles, séries en cours, derniers ajouts */
App.views.home = {
  async render(el, params, alive) {
    const { esc, euro } = App.util;
    const items = App.col.all().filter((i) => i.qty > 0);
    const copies = items.reduce((s, i) => s + i.qty, 0);
    const value = items.reduce((s, i) => s + (i.price && i.price.value && i.price.unit === 'EUR' ? i.price.value * i.qty : 0), 0);

    el.innerHTML = `
      <section class="hero">
        <h1>Ton Pokédex de collection</h1>
        <p>Répertorie, suis et mets en valeur tes cartes. Chaque série affiche ta progression, les raretés, et un badge quand elle est complète.</p>
        <div class="stats">
          <div class="stat"><b>${items.length}</b><span>cartes différentes</span></div>
          <div class="stat"><b>${copies}</b><span>exemplaires au total</span></div>
          <div class="stat"><b>${euro(value)}</b><span>valeur estimée (Cardmarket)</span></div>
          <div class="stat" id="h-complete"><b>…</b><span>séries complétées</span></div>
        </div>
        <div class="row" style="margin-top:16px">
          <a class="btn primary" href="#/scan">📷 Scanner une carte</a>
          <a class="btn" href="#/jeu/pokemon">Parcourir les séries</a>
          <a class="btn" href="#/vitrine">Voir ma vitrine</a>
        </div>
      </section>

      <h2>Collections</h2>
      <div class="grid-auto" style="margin-bottom:28px">
        ${App.games.list.map((g) => `
          <a class="game-tile ${g.status === 'actif' ? '' : 'soon'}" href="${g.status === 'actif' ? `#/jeu/${g.id}` : '#/'}">
            <span class="pill tag">${g.status === 'actif' ? '● disponible' : esc(g.status)}</span>
            <div class="gicon">${g.icon}</div>
            <h3>${esc(g.name)}</h3>
            <div class="muted small">${esc(g.desc)}</div>
            ${g.status === 'actif' ? `<div class="small" style="margin-top:8px"><b>${items.filter((i) => i.game === g.id).length}</b> cartes possédées</div>` : ''}
          </a>`).join('')}
      </div>

      <div id="h-inprogress"></div>

      <h2>Derniers ajouts</h2>
      <div id="h-recent">${items.length ? '' : '<div class="empty panel">Ta collection est vide pour l’instant.<br>Scanne ta première carte pour commencer : chaque carte ajoutée est une vraie carte, avec ta photo.</div>'}</div>
    `;

    // Derniers ajouts
    const recent = [...items].sort((a, b) => b.addedAt - a.addedAt).slice(0, 12);
    if (recent.length) {
      const r = el.querySelector('#h-recent');
      r.innerHTML = `<div class="cards">${recent.map((it) => App.ui.cardTile({ id: it.id, name: it.snap.name, localId: it.snap.localId, image: it.snap.image, rarity: it.snap.rarity, setId: it.setId, serieId: it.snap.serieId, setName: it.snap.setName }, { game: it.game, item: it, showSet: true, quickAdd: false })).join('')}</div>`;
      App.ui.hydratePhotos(r);
      r.addEventListener('click', (e) => { const t = e.target.closest('.ctile'); if (t) App.cardModal(t.dataset.game, t.dataset.card); });
    }

    // Séries en cours + séries complétées
    try {
      const ad = App.games.get('pokemon');
      const sets = await ad.listSets();
      if (!alive()) return;
      const bySet = {};
      for (const it of items.filter((i) => i.game === 'pokemon')) { bySet[it.setId] = Math.max(bySet[it.setId] || 0, it.addedAt); }
      const started = sets.filter((s) => bySet[s.id]).map((s) => ({ s, p: App.col.progress('pokemon', s), t: bySet[s.id] }));
      el.querySelector('#h-complete b').textContent = started.filter((x) => x.p.complete).length;
      if (started.length) {
        started.sort((a, b) => b.t - a.t);
        el.querySelector('#h-inprogress').innerHTML = `<h2>Mes séries en cours</h2><div class="grid-auto" style="margin-bottom:28px">${started.slice(0, 6).map(({ s, p }) => App.views.sets.setCard('pokemon', s, p)).join('')}</div>`;
      }
    } catch (e) {
      el.querySelector('#h-complete b').textContent = '—';
    }
  },
};
