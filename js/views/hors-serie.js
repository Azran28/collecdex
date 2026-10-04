/* Cartes hors-série (#/jeu/pokemon/hors-serie) : cartes officielles taguées « hors-série » (concours, tournois…), pas une série */
App.views.horsserie = {
  async render(el, { game }) {
    const { esc } = App.util;
    const ad = App.games.get(game);
    const cards = ad.horsSerie ? ad.horsSerie() : [];
    const draw = () => {
      const have = cards.filter((c) => App.col.owned(game, c.id)).length;
      el.innerHTML = `
        <div class="breadcrumb"><a href="#/">Accueil</a> › <a href="#/jeu/${esc(game)}">${esc(ad.name)}</a> › Hors-série</div>
        <div class="row" style="align-items:center;gap:10px"><h1 style="margin:0">Cartes hors-série</h1><span class="hs-tag big">Hors-série</span></div>
        <p class="muted" style="max-width:720px">Des cartes officielles qui n’appartiennent à <b>aucune série</b> : prix de concours, trophées de tournois… Elles sont si rares qu’elles ne comptent dans aucune progression. Tu peux quand même les capturer comme les autres : le scanner les reconnaît.</p>
        <p class="small muted">${have ? `Tu en as <b>${have}</b> sur ${cards.length}.` : `${cards.length} cartes pour l’instant.`}</p>
        <div class="cards hs-grid" id="hs-grid">${cards.map((c) => App.ui.cardTile(c, { game, showPrice: false })).join('')}</div>
        <div class="hs-list">${cards.map((c) => `<div class="hs-line"><b>${esc(c.name)}</b><span class="small muted">${esc(c.origin)}${c.copies ? ' · ' + esc(c.copies) : ''}</span></div>`).join('')}</div>`;
      App.ui.hydratePhotos && App.ui.hydratePhotos(el);
    };
    draw();
    el.addEventListener('click', (e) => {
      if (e.target.closest('a')) return;
      const t = e.target.closest('.ctile');
      if (t) App.cardModal(game, t.dataset.card, { list: cards.map((c) => c.id) });
    });
    const off = App.col.on(draw);
    return () => off();
  },
};
