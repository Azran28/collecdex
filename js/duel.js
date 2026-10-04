/*
 * Combat contre un ami (supabase-v10.sql, v12) : salon avec un code de 6 caractères ; chacun choisit son équipe une fois l’adversaire arrivé.
 * Principe : chaque téléphone rejoue les mêmes coups dans le même ordre, avec le même tirage des pièces
 * (générateur pseudo-aléatoire partagé, graine donnée par le serveur) : les deux voient le même combat.
 * Les coups passent par le serveur (table battle_moves) ; on la consulte toutes les ~1,2 s pendant le combat.
 */
App.duel = (() => {
  const CODE = /^[A-HJ-NP-Z2-9]{6}$/;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const isMissing = (e) => /battle_|schema cache|does not exist|Could not find/i.test(String(e && e.message));
  const rpc = async (name, args) => {
    try { return await App.cloud.rpc(name, args); }
    catch (e) { throw new Error(isMissing(e) ? 'Les combats en ligne ne sont pas encore activés sur le serveur.' : e.message); }
  };
  const normCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

  /** Générateur pseudo-aléatoire (mulberry32) : même graine = mêmes tirages sur les deux téléphones */
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // ---------- Équipes envoyées / reçues ----------
  // Ce qui vient de l'ami n'est jamais fiable : on ne garde que des valeurs attendues, bornées.
  const str = (v, max = 60) => (typeof v === 'string' || typeof v === 'number' ? String(v).slice(0, max) : '');
  const int = (v, lo, hi, def = lo) => { const n = Math.round(+v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def; };
  const tcgImg = (v) => (typeof v === 'string' && /^https:\/\/assets\.tcgdex\.net\/[A-Za-z0-9_./-]+$/.test(v) ? v : '');
  const type = (t) => (typeof t === 'string' && App.battle.TYPE_INFO[t] ? t : 'colorless');

  const wireFighter = (f) => ({
    id: f.id, name: f.name, hp: f.maxHp, type: f.type, loan: !!f.loan, img: f.imgOff || '',
    weak: f.weak.map((w) => ({ type: w.type, mult: w.mult, add: w.add })), res: f.res.map((r) => ({ type: r.type, sub: r.sub })),
    attacks: f.attacks.map((a) => ({ name: a.name, cost: a.cost, base: a.base, mode: a.mode, noDamage: a.noDamage })),
  });
  function cleanFighter(o, i) {
    o = o && typeof o === 'object' ? o : {};
    const hp = int(o.hp, 30, 400, 50);
    const attacks = (Array.isArray(o.attacks) ? o.attacks : []).slice(0, 4).map((a) => ({
      name: str(a && a.name, 40) || 'Attaque', cost: int(a && a.cost, 0, 6), base: int(a && a.base, 0, 400, 10),
      mode: a && (a.mode === 'x' || a.mode === '+') ? a.mode : '', noDamage: !!(a && a.noDamage), text: '',
    }));
    if (!attacks.length) attacks.push({ name: 'Charge', cost: 1, base: 10, mode: '', noDamage: false, text: '' });
    return {
      uid: 'f' + i + Math.random().toString(36).slice(2, 7), id: str(o.id, 40), name: str(o.name, 40) || 'Pokémon', hp, maxHp: hp, type: type(o.type),
      weak: (Array.isArray(o.weak) ? o.weak : []).slice(0, 2).map((w) => ({ type: type(w && w.type), mult: int(w && w.mult, 1, 4, 2), add: int(w && w.add, 0, 100) })),
      res: (Array.isArray(o.res) ? o.res : []).slice(0, 2).map((r) => ({ type: type(r && r.type), sub: int(r && r.sub, 0, 60, 30) })),
      attacks, energy: 0, ko: false, loan: !!o.loan, img: tcgImg(o.img),
    };
  }
  const wireBag = (c) => ({ id: c.id, name: c.name, img: c.imgOff || c.img || '', key: c.fx.key, n: c.fx.n, eType: c.fx.eType || null, loan: !!c.loan });
  function cleanBag(o, i) {
    o = o && typeof o === 'object' ? o : {};
    const eType = typeof o.eType === 'string' && App.battle.TYPE_INFO[o.eType] ? o.eType : null;
    const fx = App.battleCards.fxOf(o.key, int(o.n, 0, 100), eType);
    if (!fx) return null;
    return { uid: 'b' + i + Math.random().toString(36).slice(2, 7), id: str(o.id, 40), name: str(o.name, 40) || 'Carte', img: tcgImg(o.img), energy: fx.key === 'energy', fx, used: false, loan: !!o.loan };
  }
  const cleanTeam = (t) => {
    t = t && typeof t === 'object' ? t : {};
    return {
      name: str(t.name, 24),
      fighters: (Array.isArray(t.fighters) ? t.fighters : []).slice(0, 3).map(cleanFighter),
      bag: (Array.isArray(t.bag) ? t.bag : []).slice(0, 6).map(cleanBag).filter(Boolean),
    };
  };

  // ---------- Salon ----------
  // Salon sans équipe (supabase-v12.sql) : chacun choisit son équipe une fois l'adversaire arrivé.
  // Serveur pas encore mis à jour : il refuse un salon sans équipe → message clair.
  const oldServer = (r, team) => (!team && r && r.reason === 'Équipe invalide' ? 'Il reste une étape côté serveur pour les salons (supabase-v12.sql).' : null);
  async function create(mode, team = null) {
    const r = await rpc('battle_create', { p_mode: mode, p_team: team });
    if (!r || !r.ok || !CODE.test(r.code)) throw new Error(oldServer(r, team) || (r && r.reason) || 'Création du salon impossible');
    return r.code;
  }
  async function peek(code) {
    const r = await rpc('battle_peek', { p_code: normCode(code) });
    if (!r || !r.ok) throw new Error((r && r.reason) || 'Salon introuvable');
    return { mode: r.mode === 'adv' ? 'adv' : 'classic', host: str(r.host_pseudo, 40) || 'Dresseur' };
  }
  async function join(code, team = null) {
    const r = await rpc('battle_join', { p_code: normCode(code), p_team: team });
    if (!r || !r.ok) throw new Error(oldServer(r, team) || (r && r.reason) || 'Impossible de rejoindre ce salon');
    return r.code;
  }
  /** Envoie mon équipe, choisie une fois dans le salon */
  async function setTeam(code, team) {
    const r = await rpc('battle_team', { p_code: code, p_team: team });
    if (!r || !r.ok) throw new Error((r && r.reason) || 'Équipe refusée');
  }
  async function state(code, after = -1) {
    const r = await rpc('battle_state', { p_code: code, p_after: after });
    if (!r || !r.ok) throw new Error((r && r.reason) || 'Salon introuvable');
    if (r.guest && !UUID.test(r.guest)) throw new Error('Salon invalide');
    const meHost = !!r.me_host;
    return {
      code: r.code, status: ['waiting', 'lobby', 'playing', 'done'].includes(r.status) ? r.status : 'done', mode: r.mode === 'adv' ? 'adv' : 'classic',
      seed: int(r.seed, 0, 2147483647), meHost, foeReady: !!(meHost ? r.guest_ready : r.host_ready),
      foeName: str(meHost ? r.guest_pseudo : r.host_pseudo, 40) || 'Dresseur',
      myTeam: after < 0 ? cleanTeam(meHost ? r.host_team : r.guest_team) : null,
      foeTeam: after < 0 && (meHost ? r.guest_team : r.host_team) ? cleanTeam(meHost ? r.guest_team : r.host_team) : null,
      moves: (Array.isArray(r.moves) ? r.moves : []).map((m) => ({ n: int(m && m.n, 0, 5000), move: m && typeof m.move === 'object' && m.move ? m.move : {} })),
    };
  }
  /** Quitter un salon avant le combat (en attente, ou pendant le choix des équipes) */
  const cancel = (code) => rpc('battle_move', { p_code: code, p_n: 1, p_move: { kind: 'quit' } }).catch(() => {});

  /** Surveille le salon jusqu'à ce que ready(état) soit vrai → onOk(état). Renvoie une fonction pour arrêter. */
  function watch(code, ready, onOk, onError, onTick) {
    let stop = false;
    (async () => {
      let fails = 0;
      while (!stop) {
        await sleep(document.visibilityState === 'visible' ? 1500 : 4000);
        if (stop) return;
        try {
          const s = await state(code, -1); fails = 0;
          if (stop) return;
          if (ready(s)) { stop = true; onOk(s); return; }
          if (s.status === 'done') { stop = true; onError(new Error(`${s.foeName} a quitté le salon`)); return; }
          if (onTick) onTick(s);
        } catch (e) { if (++fails >= 8 || /introuvable/i.test(e.message)) { stop = true; onError(e); return; } }
      }
    })();
    return () => { stop = true; };
  }
  /** L'adversaire est entré dans le salon (choix des équipes ; ou combat direct avec une ancienne version) */
  const waitJoin = (code, onJoin, onError) => watch(code, (s) => s.status === 'lobby' || (s.status === 'playing' && !!s.foeTeam), onJoin, onError);
  /** Les deux équipes sont prêtes : le combat commence */
  const waitStart = (code, onStart, onError, onTick) => watch(code, (s) => s.status === 'playing' && !!s.foeTeam && !!s.myTeam.fighters.length, onStart, onError, onTick);

  /**
   * Liaison pendant le combat :
   *  send(move) : envoie mon coup (réessaie tout seul en cas de coupure) ;
   *  next()     : attend le prochain coup de l'ami (dans l'ordre) ;
   *  onQuit     : appelé si l'ami abandonne, à tout moment.
   */
  function link(code) {
    let myN = 0, foeN = 0, closed = false, lastSeen = Date.now();
    const queue = [], waiters = [];
    const out = [];
    let sending = false;
    const L = { onQuit: null, onStatus: null, get idle() { return Date.now() - lastSeen; }, get waiting() { return waiters.length > 0; } };
    const status = (s) => { if (L.onStatus) try { L.onStatus(s); } catch (e) { console.error(e); } };

    async function pump() {
      if (sending) return;
      sending = true;
      try {
        while (out.length && !closed) {
          const { n, move } = out[0];
          try { await rpc('battle_move', { p_code: code, p_n: n, p_move: move }); out.shift(); status('ok'); }
          catch (e) { status('net'); await sleep(2000); }
        }
      } finally { sending = false; }
    }
    L.send = (move) => { out.push({ n: ++myN, move }); pump(); };
    /** coup final (fin du combat) : attendu, pour que le serveur ferme le salon */
    L.flush = async () => { for (let i = 0; i < 20 && out.length; i++) { pump(); await sleep(500); } };
    L.next = () => new Promise((resolve) => { if (queue.length) resolve(queue.shift()); else waiters.push(resolve); });
    const deliver = (mv) => {
      if (mv.kind === 'quit' && L.onQuit) { try { L.onQuit(); } catch (e) { console.error(e); } }
      if (waiters.length) waiters.shift()(mv); else queue.push(mv);
    };
    (async () => {
      let fails = 0;
      while (!closed) {
        await sleep(document.visibilityState === 'visible' ? 1200 : 4000);
        if (closed) return;
        try {
          const s = await state(code, foeN); fails = 0; status('ok');
          for (const m of s.moves.sort((a, b) => a.n - b.n)) if (m.n === foeN + 1) { foeN = m.n; lastSeen = Date.now(); deliver(m.move); }
          if (s.status === 'done' && !s.moves.length && waiters.length && !queue.length) { /* salon fermé sans coup : l'ami est parti */ deliver({ kind: 'quit' }); }
        } catch (e) { fails++; status('net'); if (fails > 3) await sleep(3000); }
      }
    })();
    L.close = () => { closed = true; };
    return L;
  }

  /** Pile ou face : l'hôte commence-t-il ? (tirage à part, pour ne pas décaler celui des pièces des attaques) */
  const hostFirst = (seed) => rng((seed ^ 0x5bd1e995) >>> 0)() < 0.5;

  /** Code trouvé dans un texte collé (message entier « … Code du salon : K7P3QZ » + lien) ; sinon le texte nettoyé */
  const pickCode = (txt) => {
    const s = String(txt || '').toUpperCase();
    if (s.replace(/[^A-Z0-9]/g, '').length <= 6) return normCode(s);
    const m = s.match(/SALON=([A-Z0-9]{6})/) || s.match(/(?:^|[^A-Z0-9])([A-HJ-NP-Z2-9]{6})(?:[^A-Z0-9]|$)/);
    return m ? m[1] : normCode(s);
  };

  return { CODE, normCode, pickCode, rng, hostFirst, wireFighter, wireBag, cleanTeam, create, peek, join, setTeam, state, cancel, waitJoin, waitStart, link };
})();
