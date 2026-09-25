/*
 * Capsules : une nouvelle toutes les heures (10 maximum), on l'ouvre pour attraper un Pokémon.
 * Tout se passe sur le serveur (supabase-v3.sql) : réserve, tirage, liste des Pokémon attrapés.
 */
App.capsules = (() => {
  let st = null;          // { stock, max, next_at (ms) }
  let offset = 0;         // heure du serveur - heure du téléphone
  let dexCache = null;    // Map espèce → { n, shiny, first, last }
  let timer = null, missing = false;
  const listeners = new Set();
  const notify = () => listeners.forEach((f) => { try { f(st); } catch (e) { console.error(e); } });

  const ready = () => App.cloud.enabled && !!App.cloud.user && !missing;
  const now = () => Date.now() + offset;

  function take(r) {
    if (r.now) offset = new Date(r.now).getTime() - Date.now();
    st = { stock: r.stock, max: r.max || 10, next_at: r.next_at ? new Date(r.next_at).getTime() : null };
    clearTimeout(timer);
    // quand la prochaine capsule arrive, on redemande au serveur
    if (st.next_at) timer = setTimeout(() => status().catch(() => {}), Math.max(2000, st.next_at - now() + 1500));
    notify();
    return st;
  }

  /** Le script SQL v3 n'a pas encore été lancé dans Supabase ? */
  const isMissing = (e) => /capsule_|schema cache|does not exist|Could not find/i.test(String(e && e.message));

  async function status() {
    if (!App.cloud.enabled || !App.cloud.user) { st = null; notify(); return null; }
    try { return take(await App.cloud.rpc('capsule_status')); }
    catch (e) { if (isMissing(e)) { missing = true; notify(); } throw e; }
  }

  async function open() {
    const r = await App.cloud.rpc('capsule_open');
    take(r);
    if (dexCache) {
      const d = dexCache.get(r.species) || { n: 0, shiny: 0, first: Date.now(), last: 0 };
      d.n++; if (r.shiny) d.shiny++; d.last = Date.now();
      dexCache.set(r.species, d);
    }
    return r;
  }

  async function dex({ fresh = false } = {}) {
    if (!ready()) return new Map();
    if (dexCache && !fresh) return dexCache;
    const rows = await App.cloud.rpc('capsule_dex');
    dexCache = new Map((rows || []).map((x) => [x.species, { n: x.n, shiny: x.shiny, first: new Date(x.first_at).getTime(), last: new Date(x.last_at).getTime() }]));
    return dexCache;
  }

  /** Temps restant avant la prochaine capsule, en texte (« 42 min », « 1 h 05 ») */
  function countdown() {
    if (!st || !st.next_at) return '';
    const s = Math.max(0, Math.round((st.next_at - now()) / 1000));
    const m = Math.floor(s / 60), sec = s % 60;
    return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : m ? `${m} min ${String(sec).padStart(2, '0')}` : `${sec} s`;
  }

  /** Image d'avatar du profil : le Pokémon choisi (sinon l'ancienne photo, s'il y en a une) */
  async function avatarURL(p) {
    if (p && p.avatarPoke && p.avatarPoke.id) return App.pokedex.img(p.avatarPoke.id, !!p.avatarPoke.shiny);
    if (p && p.avatar) return App.col.photoURL(p.avatar).catch(() => '');
    return '';
  }

  // on se (re)met à jour à la connexion / déconnexion
  let lastUser = undefined;
  App.cloud.on(() => {
    const u = App.cloud.user ? App.cloud.user.id : null;
    if (u === lastUser) return;
    lastUser = u; dexCache = null; missing = false;
    if (u) status().catch(() => {}); else { st = null; notify(); }
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && ready()) status().catch(() => {}); });

  return {
    status, open, dex, countdown, avatarURL,
    get state() { return st; }, get missing() { return missing; }, ready,
    on: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
  };
})();
