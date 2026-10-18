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
    const d = W.document, before = d.getElementById('app');
    W.location.hash = hash;
    // (v3.10 : attendre le conteneur de la NOUVELLE page — le routeur en crée un neuf — sinon la page d'avant, déjà dessinée,
    //  passait pour prête et l'on tombait ensuite sur « Chargement… » : « page vide » au 1er chargement des cartes Riftbound)
    //  (même conteneur au bout de 3 s : le site était déjà sur cette page, aucune nouvelle n'a été créée)
    const t0 = Date.now();
    await until(() => {
      const app = d.getElementById('app');
      return app && (app !== before || Date.now() - t0 > 3000) && !app.querySelector(':scope > .loading') && app.children.length > 0;
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
    ['#/', 'Accueil'], ['#/jeu/pokemon', 'Séries Pokémon'], ['#/jeu/onepiece', 'Séries One Piece'], ['#/jeu/riftbound', 'Séries Riftbound'], ['#/jeu/riftbound/serie/OGN', 'Série Origins (Riftbound)'],
    ['#/jeu/lorcana', 'Séries Lorcana'], ['#/jeu/lorcana/serie/1', 'Série Premier Chapitre (Lorcana)'], ['#/jeu/lorcana/serie/P1', 'Promos Lorcana'],
    ['#/jeu/yugioh', 'Séries Yu-Gi-Oh!'], ['#/jeu/yugioh/serie/RGBT', 'Série Raging Battle (Yu-Gi-Oh!)'], ['#/jeu/yugioh/serie/LOB', 'Série La Légende du Dragon Blanc (Yu-Gi-Oh!)'],
    ['#/jeu/pokemon/serie/base1', 'Série Set de Base'], ['#/jeu/pokemon/hors-serie', 'Hors-série'],
    ['#/collection', 'Mon Dex'], ['#/objectifs', 'Objectifs'], ['#/importer', 'Importer'],
    ['#/compte', 'Vitrine'], ['#/amis', 'Amis'], ['#/connexion', 'Connexion'], ['#/parametres', 'Paramètres'],
    ['#/scan', 'Capturer : choix de la licence'], ['#/scan?jeu=pokemon', 'Capturer (carte seule)'], ['#/scan?mode=classeur&jeu=pokemon', 'Capturer (classeur)'], ['#/scan?mode=rafale&jeu=pokemon', 'Capturer (rafale)'],
    ['#/scan?jeu=auto', 'Capturer toutes licences (carte seule)'], ['#/scan?mode=classeur&jeu=auto', 'Capturer toutes licences (classeur)'],
    ['#/combat', 'Combat'], ['#/combat?jeu=pokemon', 'Combat Pokémon'], ['#/combat?jeu=pokemon&ecran=ordi', 'Combat contre l’ordinateur'],
    ['#/combat?jeu=pokemon&ecran=decks', 'Combat : équipes'], ['#/combat?jeu=onepiece', 'Combat One Piece'], ['#/combat?jeu=riftbound', 'Combat Riftbound'], ['#/scan?jeu=riftbound', 'Capturer Riftbound'],
    ['#/combat?jeu=lorcana', 'Combat Lorcana'], ['#/scan?jeu=lorcana', 'Capturer Lorcana'], ['#/scan?mode=classeur&jeu=lorcana', 'Capturer Lorcana (classeur)'],
    ['#/combat?jeu=yugioh', 'Combat Yu-Gi-Oh!'], ['#/scan?jeu=yugioh', 'Capturer Yu-Gi-Oh!'], ['#/scan?mode=classeur&jeu=yugioh', 'Capturer Yu-Gi-Oh! (classeur)'],
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

  // v3.36 : Paramètres › Scanner (préparation d'avance, carnet des scans ratés, corrections retenues)
  test('Paramètres › Scanner', async (App, W) => {
    await visit(W, '#/parametres');
    const p = W.document.querySelector('#p-scan');
    ok(p, 'section Scanner absente');
    await until(() => p.querySelectorAll('.prep-row').length >= 3, 10000, 'liste des outils à préparer');
    ok(/Pokémon/.test(p.textContent) && /Carnet des scans ratés/.test(p.textContent), 'contenu de la section');
  });

  test('fiche d’une carte (Dracaufeu, Set de Base)', async (App, W) => {
    await visit(W, '#/jeu/pokemon/serie/base1');
    const tile = W.document.querySelector('#app [data-card="base1-4"], #app [data-id="base1-4"], #app a[href*="base1-4"]');
    ok(tile, 'tuile de Dracaufeu introuvable');
    tile.click();
    await until(() => W.document.querySelector('.modal, .modal-bg, [role="dialog"]'), 10000, 'fiche de la carte');
    ok(/Dracaufeu/.test(W.document.body.textContent), 'nom de la carte');
    App.util.closeModal();
  }, { net: true });

  // v3.15 : format du classeur en tuiles ; sur téléphone, page sans défilement avant la photo
  test('Capturer (classeur, téléphone) : tuiles du format, page sans défilement', async (App, W) => {
    let saved = null;
    try { saved = W.localStorage.getItem('pageFmt'); } catch (e) { /* */ }
    const app = await visit(W, '#/scan?mode=classeur&jeu=pokemon');
    try {
      const tiles = app.querySelectorAll('.fp-opt');
      ok(tiles.length === 3, `3 tuiles de format attendues, ${tiles.length} trouvées`);
      app.querySelector('.fp-opt[data-fmt="2x2"]').click();
      await sleep(100);
      ok(app.querySelector('#b-fmt').value === '2x2', 'le format 2 × 2 n’est pas choisi');
      ok(app.querySelectorAll('.se-frame i').length === 4, 'le dessin du cadre n’a pas 4 pochettes');
      ok(app.querySelector('.fp-opt[data-fmt="2x2"]').classList.contains('on'), 'la tuile choisie n’est pas allumée');
      await until(() => W.document.documentElement.classList.contains('scan-still'), 3000, 'page bloquée avant la photo');
      ok(W.document.documentElement.scrollHeight <= W.innerHeight + 1, 'la page dépasse de l’écran');
    } finally {
      try { if (saved == null) W.localStorage.removeItem('pageFmt'); else W.localStorage.setItem('pageFmt', saved); } catch (e) { /* */ }
    }
  });

  // v3.16 : certification en tuiles au-dessus du cadre (comme connecté), gestes dans le cadre, page remplie sans défilement
  test('Capturer (carte seule, téléphone) : tuiles de certification, page sans défilement', async (App, W) => {
    const avail = App.certify.available, was = App.settings.certCarte;
    App.certify.available = () => true; App.settings.certCarte = true;
    try {
      const app = await visit(W, '#/scan?jeu=pokemon');
      ok(app.querySelectorAll('.cert-pick .cp-opt').length === 2, 'les 2 tuiles « Certifier / Juste la photo » manquent');
      ok(app.querySelector('.scan-view .se-steps'), 'les gestes de la certification ne sont pas dans le cadre');
      await until(() => W.document.documentElement.classList.contains('scan-still'), 3000, 'page bloquée avant la photo');
      ok(W.document.documentElement.scrollHeight <= W.innerHeight + 1, 'la page dépasse de l’écran');
      const bottom = app.getBoundingClientRect().bottom;
      ok(W.innerHeight - bottom < 4, `la page n’est pas remplie (${Math.round(W.innerHeight - bottom)} px vides en bas)`);
    } finally { App.certify.available = avail; App.settings.certCarte = was; }
  });

  test('retour en taille ordinateur', async () => { size(1200, 800); await sleep(200); });
})();
