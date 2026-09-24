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

    document.querySelectorAll('.topbar a[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === navOf[view]));
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

  /**
   * Mise à jour automatique : le site en ligne peut rester en cache quelques minutes dans le navigateur.
   * On compare la version chargée à celle du serveur ; si elle a changé, on recharge une seule fois.
   */
  async function checkVersion() {
    try {
      const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) return;
      const { v } = await r.json();
      const done = sessionStorage.getItem('reloadedFor');
      if (v && v !== window.APP_VERSION && done !== v) {
        sessionStorage.setItem('reloadedFor', v);
        location.replace(location.pathname + '?v=' + encodeURIComponent(v) + location.hash);
      }
    } catch (e) { /* hors ligne : on garde la version en cache */ }
  }
  checkVersion();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkVersion(); });

  // icônes et logo de l'en-tête
  document.querySelectorAll('[data-icon]').forEach((e) => { e.innerHTML = App.icons.icon(e.dataset.icon, 20); });
  document.querySelectorAll('[data-logo]').forEach((e) => { e.innerHTML = App.icons.logo(30); });

  (async () => {
    try { await App.col.load(); await App.certify.load(); }
    catch (e) { console.error(e); App.util.toast('Stockage local indisponible : ta collection ne sera pas sauvegardée.', 6000); }
    // Compte en ligne : indicateur dans le menu (vert = synchronisé, orange = en cours, rouge = problème, gris = non connecté)
    const nav = document.getElementById('nav-account');
    if (App.cloud.enabled) {
      nav.hidden = false;
      // pastille de compte : photo de profil (ou initiale) + pseudo, anneau coloré selon la synchro
      const paint = async () => {
        const s = App.cloud.state, u = App.cloud.user;
        nav.dataset.state = s;
        nav.classList.toggle('in', !!u);
        nav.title = u ? `${u.email} — ${s === 'ok' ? 'synchronisé' : s === 'erreur' ? 'problème de synchronisation' : 'synchronisation…'}` : 'Se connecter';
        const p = await App.col.getProfile().catch(() => ({}));
        const pseudo = u ? (p.pseudo && p.pseudo !== 'Dresseur' ? p.pseudo : (u.email || '').split('@')[0]) : 'Se connecter';
        nav.querySelector('.acc-lbl').textContent = pseudo;
        const av = nav.querySelector('.acc-avatar');
        const url = u && p.avatar ? await App.col.photoURL(p.avatar).catch(() => '') : '';
        av.style.backgroundImage = url ? `url('${url}')` : '';
        av.innerHTML = url ? '' : (u ? `<span class="acc-initial">${App.util.esc(pseudo[0].toUpperCase())}</span>` : App.icons.icon('user', 16));
      };
      App.cloud.on(paint); App.col.on(() => paint()); paint();
      await App.cloud.init();
    }
    route();
    setTimeout(() => App.col.refreshStalePrices(), 4000);
  })();
})();
