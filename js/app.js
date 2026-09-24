/* Démarrage du site et navigation entre les pages (adresse après le # dans la barre) */
App.views = App.views || {};

(() => {
  const routes = [
    [/^\/?$/, 'home', () => ({})],
    [/^\/jeu\/([^/]+)\/?$/, 'sets', (m) => ({ game: m[1] })],
    [/^\/jeu\/([^/]+)\/serie\/([^/]+)\/?$/, 'set', (m) => ({ game: m[1], setId: decodeURIComponent(m[2]) })],
    [/^\/collection\/?$/, 'collection', () => ({})],
    [/^\/vitrine\/?$/, 'showcase', () => ({})],
    [/^\/scan\/?$/, 'scan', () => ({})],
    [/^\/parametres\/?$/, 'settings', () => ({})],
    [/^\/compte\/?$/, 'account', () => ({})],
  ];
  const navOf = { home: 'home', sets: 'jeu', set: 'jeu', collection: 'collection', showcase: 'vitrine', scan: 'scan', settings: 'parametres', account: 'compte' };

  let cleanup = null;
  let renderId = 0;

  async function route() {
    const path = (location.hash || '#/').slice(1).split('?')[0];
    const query = Object.fromEntries(new URLSearchParams((location.hash.split('?')[1]) || ''));
    let view = null, params = {};
    for (const [re, name, fn] of routes) { const m = path.match(re); if (m) { view = name; params = fn(m); break; } }
    if (!view) { location.hash = '#/'; return; }
    params.query = query;

    if (typeof cleanup === 'function') { try { cleanup(); } catch (e) { console.error(e); } }
    cleanup = null;
    App.util.closeModal();

    document.querySelectorAll('#mainnav a').forEach((a) => a.classList.toggle('active', a.dataset.nav === navOf[view]));
    // conteneur neuf à chaque page, pour repartir sans les écouteurs de la page précédente
    const oldEl = document.getElementById('app');
    const el = oldEl.cloneNode(false);
    oldEl.replaceWith(el);
    const id = ++renderId;
    el.innerHTML = App.ui.loading();
    window.scrollTo(0, 0);
    try {
      const c = await App.views[view].render(el, params, () => id === renderId);
      if (id === renderId) cleanup = c || null; else if (typeof c === 'function') c();
    } catch (e) {
      console.error(e);
      if (id === renderId) el.innerHTML = App.ui.errorBox(e);
    }
  }

  window.addEventListener('hashchange', route);

  (async () => {
    try { await App.col.load(); }
    catch (e) { console.error(e); App.util.toast('Stockage local indisponible : ta collection ne sera pas sauvegardée.', 6000); }
    // Compte en ligne : indicateur dans le menu (vert = synchronisé, orange = en cours, rouge = problème, gris = non connecté)
    const nav = document.getElementById('nav-account');
    if (App.cloud.enabled) {
      nav.hidden = false;
      const paint = () => {
        const s = App.cloud.state;
        nav.dataset.state = s;
        nav.title = App.cloud.user ? `${App.cloud.user.email} — ${s === 'ok' ? 'synchronisé' : s === 'erreur' ? 'problème de synchronisation' : 'synchronisation…'}` : 'Se connecter';
        nav.lastChild.textContent = App.cloud.user ? ' Compte' : ' Se connecter';
      };
      App.cloud.on(paint); paint();
      await App.cloud.init();
    }
    route();
    setTimeout(() => App.col.refreshStalePrices(), 4000);
  })();
})();
