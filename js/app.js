/* Démarrage du site et navigation entre les pages (adresse après le # dans la barre) */
App.views = App.views || {};

(() => {
  const routes = [
    [/^\/?$/, 'home', () => ({})],
    [/^\/jeu\/([^/]+)\/?$/, 'sets', (m) => ({ game: m[1] })],
    [/^\/jeu\/([^/]+)\/serie\/([^/]+)\/?$/, 'set', (m) => ({ game: m[1], setId: decodeURIComponent(m[2]) })],
    [/^\/collection\/?$/, 'collection', () => ({})],
    [/^\/vitrine\/?$/, 'showcase', () => ({})],
    [/^\/match\/?$/, 'match', () => ({})],
    [/^\/amis\/?$/, 'friends', () => ({})],
    [/^\/ami\/([^/]+)\/?$/, 'showcase', (m) => ({ friend: decodeURIComponent(m[1]) })],
    [/^\/connexion\/?$/, 'account', () => ({})],
    [/^\/scan\/?$/, 'scan', () => ({})],
    [/^\/parametres\/?$/, 'settings', () => ({})],
    [/^\/compte\/?$/, 'showcase', () => ({})],
    [/^\/objectifs\/?$/, 'goals', () => ({})],
    [/^\/capsules\/?$/, 'capsules', () => ({})],
  ];
  const navOf = { home: 'home', sets: 'jeu', set: 'jeu', collection: 'collection', showcase: 'compte', scan: 'scan', settings: 'parametres', account: 'parametres', match: 'match', friends: 'compte', goals: 'collection', capsules: 'capsules' };

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
  setTimeout(checkVersion, 5000); // seconde vérification (réseau lent au lancement, appli installée…)
  window.addEventListener('pageshow', (e) => { if (e.persisted) checkVersion(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkVersion(); });

  // icônes et logo de l'en-tête
  document.querySelectorAll('[data-icon]').forEach((e) => { e.innerHTML = App.icons.icon(e.dataset.icon, 20); });
  document.querySelectorAll('[data-logo]').forEach((e) => { e.innerHTML = App.icons.logo(30); });

  (async () => {
    try { await App.col.load(); await App.certify.load(); await App.wish.load(); }
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
        nav.href = u ? '#/compte' : '#/connexion'; // connecté : ta page (vitrine) ; sinon : se connecter
        nav.title = u ? `${u.email} — ${s === 'ok' ? 'synchronisé' : s === 'erreur' ? 'problème de synchronisation' : 'synchronisation…'}` : 'Se connecter';
        const p = await App.col.getProfile().catch(() => ({}));
        const pseudo = u ? (p.pseudo && p.pseudo !== 'Dresseur' ? p.pseudo : (u.email || '').split('@')[0]) : 'Se connecter';
        nav.querySelector('.acc-lbl').textContent = pseudo;
        const av = nav.querySelector('.acc-avatar');
        const url = u ? await App.capsules.avatarURL(p) : '';
        av.style.backgroundImage = url ? `url('${url}')` : '';
        av.innerHTML = url ? '' : (u ? `<span class="acc-initial">${App.util.esc(pseudo[0].toUpperCase())}</span>` : App.icons.icon('user', 16));
      };
      App.cloud.on(paint); App.col.on(() => paint()); paint();
      // demandes d'ami reçues : pastille sur l'avatar
      const paintFriends = () => {
        const n = App.cloud.user ? App.friends.pendingIn() : 0;
        let dot = nav.querySelector('.acc-dot');
        if (!n) { if (dot) dot.remove(); return; }
        if (!dot) { dot = document.createElement('span'); dot.className = 'acc-dot'; nav.appendChild(dot); }
        dot.textContent = n; dot.title = `${n} demande${n > 1 ? 's' : ''} d’ami`;
      };
      App.friends.on(paintFriends);
      // capsules à ouvrir : pastille dans l'en-tête
      const caps = document.getElementById('nav-caps');
      const paintCaps = () => {
        const st = App.capsules.state;
        caps.hidden = !App.cloud.user || App.capsules.missing || !st;
        if (caps.hidden) return;
        const n = caps.querySelector('.caps-n'), tot = App.capsules.total();
        n.textContent = tot ? tot : App.capsules.countdown().replace(/ min .*/, ' min');
        caps.classList.toggle('has', tot > 0);
        caps.classList.toggle('full', st.stock >= st.max);
        caps.title = tot ? `${tot} capsule${tot > 1 ? 's' : ''} à ouvrir` : `Prochaine capsule dans ${App.capsules.countdown()}`;
      };
      App.capsules.on(paintCaps); paintCaps();
      setInterval(() => { if (App.capsules.state && !App.capsules.total()) paintCaps(); }, 30000);
      await App.cloud.init();
    }
    route();
    setTimeout(() => App.col.refreshStalePrices(), 4000);
    // badges : annonce quand un nouveau se débloque
    setTimeout(() => App.badges.check().catch(() => {}), 3000);
    App.col.on(App.util.debounce(() => App.badges.check().catch(() => {}), 2500));
    App.col.on(App.util.debounce(() => App.wish.load().catch(() => {}), 200)); // profil reçu d'un autre appareil
  })();
})();
