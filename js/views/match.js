/* Page « Match » : bientôt, jouer avec ses cartes (decks, combats contre d'autres dresseurs ou l'ordinateur) */
App.views.match = {
  async render(el) {
    el.innerHTML = `<div class="breadcrumb"><a href="#/">Accueil</a> › Match</div>
      <section class="panel match-soon">
        <div class="match-ico">${App.icons.icon('swap', 34)}</div>
        <h1>Match</h1>
        <p class="muted">Bientôt ici : tes cartes deviennent jouables. Construis ton deck avec les cartes de ton Dex, puis affronte tes amis ou l’ordinateur.</p>
        <ul class="match-list">
          <li>${App.icons.icon('layers', 16)} Création de decks avec tes propres cartes</li>
          <li>${App.icons.icon('users', 16)} Combats contre tes amis</li>
          <li>${App.icons.icon('bolt', 16)} Combats contre l’ordinateur, avec des niveaux</li>
        </ul>
        <div><span class="pill">En préparation</span></div>
      </section>`;
  },
};
