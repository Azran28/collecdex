/* Ouvre le site dans le cadre, attend qu'il soit prêt, lance les tests, remet tout comme avant */
(async () => {
  const frame = document.getElementById('frame');
  const W = () => frame.contentWindow;
  const App = () => W().App;
  // pas de présentation de l'appli dans le cadre (elle cacherait les pages en taille téléphone)
  const KEYS = ['onboarded1', 'onboardedScan1'];
  const before = KEYS.map((k) => { try { return localStorage.getItem(k); } catch (e) { return null; } });
  try { KEYS.forEach((k) => localStorage.setItem(k, '1')); } catch (e) { /* stockage indisponible */ }

  // erreurs du site pendant les tests (une page qui plante sans afficher « Oups »)
  const errors = window.__siteErrors = [];
  const hook = () => {
    const w = W();
    if (!w || w.__hooked) return; w.__hooked = true;
    w.addEventListener('error', (e) => errors.push(String(e.message || e.error || 'erreur')));
    w.addEventListener('unhandledrejection', (e) => errors.push('promesse : ' + String((e.reason && e.reason.message) || e.reason)));
    const ce = w.console.error.bind(w.console);
    w.console.error = (...a) => { errors.push(a.map((x) => (x && x.stack) || (x && x.message) || String(x)).join(' ')); ce(...a); };
  };
  frame.addEventListener('load', hook);
  frame.src = 'index.html#/';
  try {
    await until(() => { hook(); const A = App(); return A && A.views && A.views.home && document.readyState === 'complete' && W().document.querySelector('#app'); }, 30000, 'chargement du site');
  } catch (e) { /* le test « le site se charge » le signalera */ }

  await window.__runTests({ App, W, frame, errors });
  KEYS.forEach((k, i) => { try { if (before[i] == null) localStorage.removeItem(k); else localStorage.setItem(k, before[i]); } catch (e) { /* */ } });
})();
