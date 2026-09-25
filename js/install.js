/*
 * Appli installable : enregistre le service worker (hors ligne), capte la proposition d'installation
 * du navigateur et fournit le bouton « Installer » (accueil sur téléphone + Paramètres).
 */
App.install = (() => {
  let deferred = null; // proposition d'installation gardée pour plus tard (Chrome, Edge, Samsung…)
  const listeners = new Set();
  const notify = () => listeners.forEach((f) => { try { f(); } catch (e) { console.error(e); } });

  const standalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isMobile = isIOS || /Android|Mobile/i.test(ua) || (window.matchMedia && matchMedia('(pointer: coarse)').matches);

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service worker', e)); });
  }
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; notify(); });
  window.addEventListener('appinstalled', () => { deferred = null; App.util.toast('📲 CollecDex est installée ! Tu la retrouves sur ton écran d’accueil.', 5000); notify(); });

  // hors ligne / de retour en ligne
  window.addEventListener('offline', () => { document.documentElement.classList.add('offline'); App.util.toast('Hors ligne : ta collection reste consultable, les prix et la capture attendront le réseau.', 5000); });
  window.addEventListener('online', () => { document.documentElement.classList.remove('offline'); App.util.toast('De retour en ligne ✓'); });
  if (navigator.onLine === false) document.documentElement.classList.add('offline');

  /** 'installed' | 'prompt' (bouton direct) | 'ios' (instructions Safari) | 'manual' (menu du navigateur) */
  function state() {
    if (standalone()) return 'installed';
    if (deferred) return 'prompt';
    if (isIOS) return 'ios';
    return 'manual';
  }

  async function prompt() {
    if (deferred) {
      const d = deferred; deferred = null;
      d.prompt();
      const { outcome } = await d.userChoice.catch(() => ({ outcome: 'dismissed' }));
      notify();
      return outcome === 'accepted';
    }
    help();
    return false;
  }

  function help() {
    const ios = isIOS;
    App.util.openModal(`<div class="install-help">
      <h2>${App.icons.icon('download', 20)} Installer CollecDex</h2>
      ${ios ? `<ol>
          <li>Ouvre le site dans <b>Safari</b> (pas dans une autre appli).</li>
          <li>Touche le bouton <b>Partager</b> <span class="ios-share">${App.icons.icon('share', 16)}</span> en bas de l’écran.</li>
          <li>Choisis <b>« Sur l’écran d’accueil »</b>, puis <b>Ajouter</b>.</li>
        </ol>`
        : `<ol>
          <li>Ouvre le menu du navigateur (<b>⋮</b> en haut à droite sur Chrome, ou l’icône d’installation dans la barre d’adresse).</li>
          <li>Choisis <b>« Installer l’application »</b> ou <b>« Ajouter à l’écran d’accueil »</b>.</li>
        </ol>`}
      <p class="small muted">L’icône CollecDex apparaît alors sur ton écran d’accueil : l’appli s’ouvre en plein écran et reste consultable sans réseau.</p>
    </div>`);
  }

  /** Bandeau discret pour l’accueil (téléphone seulement, tant que ce n’est ni installé ni refusé) */
  async function banner(host) {
    const draw = async () => {
      const dismissed = await App.db.get('kv', 'installDismissed').catch(() => null);
      const st = state();
      if (!isMobile || st === 'installed' || dismissed) { host.innerHTML = ''; return; }
      host.innerHTML = `<div class="install-banner">
        <img src="icons/icon-192.png" alt="" width="40" height="40">
        <div><b>Installe CollecDex</b><span>Une icône sur ton écran d’accueil, en plein écran, même sans réseau.</span></div>
        <button class="btn sm primary" data-install>Installer</button>
        <button class="install-x" data-install-x title="Plus tard" aria-label="Masquer">×</button>
      </div>`;
    };
    host.addEventListener('click', async (e) => {
      if (e.target.closest('[data-install]')) { await prompt(); draw(); }
      if (e.target.closest('[data-install-x]')) { await App.db.set('kv', 'installDismissed', Date.now()); draw(); }
    });
    listeners.add(draw);
    await draw();
    return () => listeners.delete(draw);
  }

  /** Bloc pour les Paramètres */
  function panel(host) {
    const draw = () => {
      const st = state();
      host.innerHTML = st === 'installed'
        ? `<p class="small">${App.icons.icon('check', 14)} Tu utilises CollecDex en tant qu’appli installée.</p>`
        : `<p class="muted small">Ajoute CollecDex sur ton écran d’accueil (téléphone ou ordinateur) : elle s’ouvre en plein écran comme une vraie appli et ta collection reste consultable sans réseau.</p>
           <div class="row"><button class="btn primary" data-install>${App.icons.icon('download', 16)} Installer l’appli</button>
           ${st !== 'prompt' ? '<span class="small muted">(on t’explique comment)</span>' : ''}</div>`;
    };
    host.addEventListener('click', async (e) => { if (e.target.closest('[data-install]')) { await prompt(); draw(); } });
    listeners.add(draw);
    draw();
    return () => listeners.delete(draw);
  }

  return { state, prompt, help, banner, panel, isIOS, isMobile, standalone };
})();
