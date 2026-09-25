/* Page « Match » : réservée aux échanges entre collectionneurs (à venir) */
App.views.match = {
  async render(el) {
    el.innerHTML = `<div class="breadcrumb"><a href="#/">Accueil</a> › Match</div>
      <section class="panel match-soon">
        <div class="match-ico">${App.icons.icon('swap', 34)}</div>
        <h1>Match</h1>
        <p class="muted">Bientôt ici : trouver les collectionneurs qui ont les cartes que tu cherches, et proposer tes doublons en échange.</p>
        <div class="row" style="justify-content:center;gap:8px;margin-top:6px">
          <a class="btn" href="#/objectifs?tab=souhaits">${App.icons.icon('heart', 16)} Ma liste de souhaits</a>
          <a class="btn" href="#/collection?f=doublons">${App.icons.icon('dex', 16)} Mes doublons</a>
        </div>
      </section>`;
  },
};
