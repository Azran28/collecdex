/*
 * Chaque page du site s'ouvre sans « Oups » ni erreur, en taille ordinateur puis téléphone (375 × 812).
 * (v2.16 : une page Capturer cassée était partie en ligne, les tests n'ouvraient pas la page.)
 */
(() => {
  const frame = () => document.getElementById('frame');
  // erreurs sans rapport avec le code du site (réseau coupé, extension…)
  const NOISE = /failed to fetch|networkerror|load failed|net::|err_|aborted|quota|ResizeObserver loop|fonts\.g/i;

  /** ouvre une page du site dans le cadre et attend qu'elle soit dessinée */
  async function visit(W, hash, ms = 20000) {
    const errs = window.__siteErrors, from = errs.length;
    if (W.location.hash === hash) W.location.hash = '#/__';
    await sleep(30);
    W.location.hash = hash;
    const d = W.document;
    await until(() => {
      const app = d.getElementById('app');
      return app && !app.querySelector(':scope > .loading') && app.children.length > 0;
    }, ms, `page ${hash}`);
    await sleep(400); // les morceaux dessinés juste après
    const app = d.getElementById('app');
    const oups = app.querySelector('.error-box');
    if (oups) throw new Error(`« Oups » sur ${hash} : ${oups.textContent.replace(/\s+/g, ' ').slice(0, 200)}`);
    const bad = errs.slice(from).filter((e) => !NOISE.test(e));
    if (bad.length) throw new Error(`erreur sur ${hash} : ${bad.slice(0, 3).join(' | ').slice(0, 400)}`);
    return app;
  }
  window.__visit = visit;

  const PAGES = [
    ['#/', 'Accueil'], ['#/jeu/pokemon', 'Séries Pokémon'], ['#/jeu/onepiece', 'Séries One Piece'],
    ['#/jeu/pokemon/serie/base1', 'Série Set de Base'], ['#/jeu/pokemon/hors-serie', 'Hors-série'],
    ['#/collection', 'Mon Dex'], ['#/objectifs', 'Objectifs'], ['#/importer', 'Importer'],
    ['#/compte', 'Vitrine'], ['#/amis', 'Amis'], ['#/connexion', 'Connexion'], ['#/parametres', 'Paramètres'],
    ['#/scan', 'Capturer (carte seule)'], ['#/scan?mode=classeur', 'Capturer (classeur)'], ['#/scan?mode=rafale', 'Capturer (rafale)'],
    ['#/combat', 'Combat'], ['#/combat?jeu=pokemon', 'Combat Pokémon'], ['#/combat?jeu=pokemon&ecran=ordi', 'Combat contre l’ordinateur'],
    ['#/combat?jeu=pokemon&ecran=decks', 'Combat : équipes'], ['#/combat?jeu=onepiece', 'Combat One Piece'],
    ['#/capsules', 'Capsules'],
  ];
  const size = (w, h) => { const f = frame(); f.style.width = w + 'px'; f.style.height = h + 'px'; };

  for (const [mode, w, h] of [['ordinateur', 1200, 800], ['téléphone', 375, 812]]) {
    test(`taille ${mode} (${w} × ${h})`, async () => { size(w, h); await sleep(300); });
    for (const [hash, name] of PAGES) {
      const needsNet = /jeu\/|combat|^#\/$|collection|objectifs/.test(hash);
      test(`${mode} · ${name} (${hash})`, async (App, W) => {
        const app = await visit(W, hash);
        ok(app.textContent.trim().length > 20, 'page vide');
        if (mode === 'téléphone') {
          const over = W.document.documentElement.scrollWidth - W.innerWidth;
          ok(over <= 2, `la page déborde sur le côté de ${over} px`);
        }
      }, { net: needsNet });
    }
  }

  test('fiche d’une carte (Dracaufeu, Set de Base)', async (App, W) => {
    await visit(W, '#/jeu/pokemon/serie/base1');
    const tile = W.document.querySelector('#app [data-card="base1-4"], #app [data-id="base1-4"], #app a[href*="base1-4"]');
    ok(tile, 'tuile de Dracaufeu introuvable');
    tile.click();
    await until(() => W.document.querySelector('.modal, .modal-bg, [role="dialog"]'), 10000, 'fiche de la carte');
    ok(/Dracaufeu/.test(W.document.body.textContent), 'nom de la carte');
    App.util.closeModal();
  }, { net: true });

  test('retour en taille ordinateur', async () => { size(1200, 800); await sleep(200); });
})();
