/*
 * Capsules : une nouvelle toutes les heures (10 maximum), on l'ouvre pour attraper un Pokémon.
 * Tout se passe sur le serveur (supabase-v3.sql) : réserve, tirage, liste des Pokémon attrapés.
 * Boutique (supabase-v5.sql) : vendre ses Pokémon contre des éclats (la monnaie), acheter des capsules et des grandes capsules.
 */
App.capsules = (() => {
  let st = null;          // { stock, max, next_at (ms), coins, bonus, big, shop }
  let offset = 0;         // heure du serveur - heure du téléphone
  let dexCache = null;    // Map espèce → { n, shiny, first, last }
  let timer = null, missing = false;
  const listeners = new Set();
  const notify = () => listeners.forEach((f) => { try { f(st); } catch (e) { console.error(e); } });

  const ready = () => App.cloud.enabled && !!App.cloud.user && !missing;
  const now = () => Date.now() + offset;

  function take(r) {
    if (r.now) offset = new Date(r.now).getTime() - Date.now();
    const shop = r.coins !== undefined; // boutique installée (supabase-v5.sql)
    st = { stock: r.stock, max: r.max || 10, next_at: r.next_at ? new Date(r.next_at).getTime() : null,
      shop, coins: r.coins || 0, bonus: r.bonus || 0, big: r.big || 0, prices: r.prices || { capsule: 20, grande: 150 } };
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

  /** Ouvre une capsule : 'normal' (réserve gratuite, puis capsules achetées) ou 'grande' */
  async function open(kind = 'normal') {
    const r = await App.cloud.rpc('capsule_open', kind === 'grande' ? { p_kind: 'grande' } : {});
    take(r);
    if (dexCache) {
      const d = dexCache.get(r.species) || { n: 0, shiny: 0, first: Date.now(), last: 0 };
      d.n++; if (r.shiny) d.shiny++; d.last = Date.now();
      dexCache.set(r.species, d);
    }
    return r;
  }

  // ---------- Boutique ----------
  /** Prix de vente d'un Pokémon (même barème que sur le serveur) : commun 1 … fabuleux 150, chromatique ×5 */
  const PRICES = [0, 1, 3, 8, 20, 100, 150];
  const price = (species, shiny = false) => PRICES[App.pokedex.tier(species)] * (shiny ? 5 : 1);
  /** Doublons vendables d'un coup : on garde 1 exemplaire normal de chaque Pokémon, les chromatiques ne sont pas vendus */
  function dupes(dex) {
    let n = 0, gain = 0;
    for (const [id, d] of dex) { const extra = Math.max(0, d.n - d.shiny - 1); n += extra; gain += extra * price(id); }
    return { n, gain };
  }
  async function sell(species, shiny = false, n = 1) {
    const r = await App.cloud.rpc('capsule_sell', { p_species: species, p_shiny: !!shiny, p_n: n });
    take(r);
    if (dexCache && dexCache.has(species)) {
      const d = dexCache.get(species);
      d.n -= r.sold; if (shiny) d.shiny -= r.sold;
      if (d.n <= 0) dexCache.delete(species);
    }
    return r;
  }
  async function sellDupes() {
    const r = await App.cloud.rpc('capsule_sell_dupes');
    take(r);
    if (dexCache) for (const d of dexCache.values()) d.n = d.shiny + Math.min(1, d.n - d.shiny);
    return r;
  }
  async function buy(kind, n = 1) { return take(await App.cloud.rpc('capsule_buy', { p_kind: kind, p_n: n })); }
  /** Capsules qu'on peut ouvrir tout de suite (réserve gratuite + achetées + grandes) */
  const total = () => (st ? st.stock + st.bonus + st.big : 0);

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
    status, open, dex, countdown, avatarURL, sell, sellDupes, buy, price, dupes, total, PRICES,
    get state() { return st; }, get missing() { return missing; }, ready,
    on: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
  };
})();
