/* Page « Combat » — socle partagé (données, licences, petits morceaux d'interface). Les autres parties : match-battle.js (écran de combat),
 * match-teams.js (équipes et sacs), match-duel.js (contre un ami), match.js (la page). Elles se partagent App.matchParts. */
(() => {
  const { esc } = App.util;
  const B = () => App.battle;
  // FAST : combat en ligne rejoué en accéléré (reprise après un rafraîchissement) : ni attente, ni effets, ni sons
  let FAST = false;
  const isFast = () => FAST, setFast = (v) => { FAST = !!v; };
  const sleep = (ms) => (FAST ? Promise.resolve() : new Promise((r) => setTimeout(r, ms)));
  const ad = (game) => App.games.get(game || 'pokemon');
  const gameOf = (it) => (it && it.game) || 'pokemon';
  const adOf = (it) => ad(gameOf(it)) || ad();
  // v2.99 : chaque licence a ses combats (decks, adversaires, salons en ligne) ; on choisit d'abord la licence
  const FIGHT_GAMES = ['pokemon', 'onepiece'];
  const TEAMS = 3, BAG_MAX = App.battleCards.DECK_MAX; // pioche du mode Avancé : 10 cartes (v2.80)
  const RM = () => FAST || window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- Licences : vocabulaire et ambiance ----------
  const LIC = {
    pokemon: {
      name: 'Pokémon', icon: 'bolt', myTurn: 'À toi !', champion: 'Tu es une vraie Légende !', back: 'img/combat/dos-pokemon.svg',
      bagKinds: 'Dresseur / Énergie', bagName: 'Sac', bagTitle: 'Ton sac', search: 'Rechercher un Pokémon…', place: 'Sur le terrain',
      tag: 'Combats de dresseurs sur le terrain', foeTag: 'Du Set de Base aux Pokémon-ex',
    },
    onepiece: {
      name: 'One Piece', icon: 'anchor', myTurn: 'À l’abordage !', champion: 'Tu es le Roi des pirates !', back: 'img/combat/dos-onepiece.svg',
      bagKinds: 'Événement / Lieu / DON!!', bagName: 'Coffre', bagTitle: 'Ton coffre', search: 'Rechercher un personnage…', place: 'En haute mer',
      tag: 'Abordages en haute mer', foeTag: 'Des mousses aux Empereurs',
    },
  };
  const lic = (game) => LIC[game] || LIC.pokemon;
  // icônes du sac (Pokémon : sac à dos) et du coffre (One Piece : coffre au trésor)
  const BAG_ICON = {
    pokemon: '<svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true"><path d="M11 8a5 5 0 0 1 10 0" fill="none" stroke="currentColor" stroke-width="2.4"/><rect x="6" y="8" width="20" height="20" rx="6" fill="#e3350d" stroke="#1a1a2e" stroke-width="2"/><path d="M6 15h20" stroke="#1a1a2e" stroke-width="2"/><rect x="10" y="18" width="12" height="7" rx="2" fill="#ffcb05" stroke="#1a1a2e" stroke-width="1.6"/><circle cx="16" cy="15" r="2.4" fill="#fff" stroke="#1a1a2e" stroke-width="1.6"/></svg>',
    onepiece: '<svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true"><path d="M5 14a11 7 0 0 1 22 0v2H5z" fill="#8a5a32" stroke="#3b230f" stroke-width="1.8"/><rect x="5" y="15" width="22" height="12" rx="2" fill="#6b4423" stroke="#3b230f" stroke-width="1.8"/><path d="M5 19h22M10 9v18M22 9v18" stroke="#e8b04a" stroke-width="2"/><rect x="13.5" y="16" width="5" height="6" rx="1" fill="#ffd479" stroke="#3b230f" stroke-width="1.2"/></svg>',
  };
  /** Vocabulaire de la licence : en One Piece, on parle de personnages et de DON!! (pas de Pokémon ni d'énergie) */
  const say = (game, s) => (game !== 'onepiece' ? String(s) : String(s)
    .replace(/ \(\+1 si l’énergie est de son type\)/g, '').replace(/l’énergie/g, 'le DON!!').replace(/d’énergie/g, 'de DON!!')
    .replace(/\b(les|des|tes|ses|vos|nos|aux|\d+) Pokémon\b/g, '$1 personnages').replace(/Pokémon/g, 'personnage')
    .replace(/[ÉéE]nergies?/g, 'DON!!'));
  const LAST = 'cdx-combat-game';
  const lastGame = () => { try { const g = localStorage.getItem(LAST); return FIGHT_GAMES.includes(g) ? g : 'pokemon'; } catch (e) { return 'pokemon'; } };

  // ---------- Données ----------
  const normStats = (st, m = {}) => {
    st = st && typeof st === 'object' ? st : { classic: { wins: m.wins || 0, losses: m.losses || 0 }, adv: { wins: 0, losses: 0 } };
    for (const k of ['classic', 'adv', 'online']) st[k] = Object.assign({ wins: 0, losses: 0 }, st[k] || {});
    return st;
  };
  const normTeams = (teams) => {
    teams = Array.isArray(teams) ? [...teams] : [];
    while (teams.length < TEAMS) teams.push({ name: `Équipe ${teams.length + 1}`, keys: [] });
    return teams.slice(0, TEAMS).map((t, i) => ({ name: String((t && t.name) || `Équipe ${i + 1}`).slice(0, 24), keys: ((t && t.keys) || []).slice(0, 3), bag: ((t && t.bag) || []).slice(0, BAG_MAX) }));
  };
  const keyGame = (k) => String(k).split(':')[0] || 'pokemon';
  /**
   * profile.match = { teams:[{name, keys:[3 clés], bag}×3], teamIdx, team (= équipe choisie, pour les anciennes versions), beaten, beatenAdv, stats, mode,
   *   games: { onepiece: { teams, teamIdx, beaten, beatenAdv, stats } } } — Pokémon reste à la racine (anciennes versions de l'appli)
   */
  function normMatch(m) {
    m = Object.assign({ team: [], beaten: {}, beatenAdv: {}, wins: 0, losses: 0, mode: 'classic' }, m || {});
    if (m.mode !== 'adv') m.mode = 'classic';
    // victoires / défaites par mode (les anciennes comptent pour le mode basique)
    m.stats = normStats(m.stats, m);
    let teams = Array.isArray(m.teams) ? m.teams : [];
    if (!teams.length && m.team && m.team.length) teams = [{ name: 'Équipe 1', keys: [...m.team] }];
    m.teams = normTeams(teams);
    m.teamIdx = Math.min(TEAMS - 1, Math.max(0, m.teamIdx | 0));
    m.games = m.games && typeof m.games === 'object' ? m.games : {};
    for (const g of FIGHT_GAMES) {
      if (g === 'pokemon') continue;
      // v2.99 : licences séparées ; les cartes de cette licence rangées dans les anciens decks mélangés y passent (même nom de deck)
      let s = m.games[g];
      if (!s || typeof s !== 'object') s = { teams: m.teams.map((t) => ({ name: t.name, keys: t.keys.filter((k) => keyGame(k) === g), bag: [] })), teamIdx: m.teamIdx };
      s = Object.assign({ beaten: {}, beatenAdv: {} }, s);
      s.stats = normStats(s.stats);
      s.teams = normTeams(s.teams);
      s.teamIdx = Math.min(TEAMS - 1, Math.max(0, s.teamIdx | 0));
      m.games[g] = s;
    }
    m.teams.forEach((t) => { t.keys = t.keys.filter((k) => keyGame(k) === 'pokemon'); });
    return m;
  }
  /** Partie du profil d'une licence (decks, niveaux battus, victoires) */
  const sideOf = (m, game) => (game && game !== 'pokemon' && m.games[game]) || m;
  async function getMatch() { const p = await App.col.getProfile(); return normMatch(p.match); }
  async function saveMatch(m) { m.team = [...m.teams[m.teamIdx].keys]; const p = await App.col.getProfile(); p.match = m; await App.col.saveProfile(p); }
  const teamItems = (keys) => keys.map((k) => App.col.byKey(k)).filter((i) => i && i.qty > 0);
  /** Cartes du sac encore possédées (une même carte peut y être plusieurs fois, dans la limite de ses exemplaires) */
  const bagItems = (keys) => { const n = {}; return (keys || []).map((k) => App.col.byKey(k)).filter((i) => i && i.qty > 0 && (n[i.key] = (n[i.key] || 0) + 1) <= i.qty); };

  /** Tes cartes de pioche (Dresseur et Énergie ; One Piece : Événement et Lieu), d'après les listes des séries */
  async function myTrainers(game = 'pokemon') {
    const items = App.col.all().filter((i) => i.qty > 0 && gameOf(i) === game);
    const bySet = {};
    for (const it of items) (bySet[it.setId] = bySet[it.setId] || []).push(it);
    const out = [];
    const ok = game === 'onepiece' ? (c) => /^(Événement|Lieu|Event|Stage)$/i.test(c) : (c) => !/pok/i.test(c);
    await App.util.pool(Object.keys(bySet), 4, async (sid) => {
      const set = await ad(game).getSet(sid).catch(() => null);
      const cat = new Map((set ? set.cards : []).map((c) => [c.id, c.category]));
      for (const it of bySet[sid]) { const c = cat.get(it.id); if (c && ok(c)) out.push(it); }
    });
    return out.sort((a, b) => (a.snap.name || '').localeCompare(b.snap.name || '', 'fr'));
  }

  /** Tes cartes qui peuvent combattre dans une licence (Pokémon ; One Piece : Personnages et Leaders), d'après les listes des séries */
  async function myPokemon(game = 'pokemon') {
    const items = App.col.all().filter((i) => i.qty > 0 && gameOf(i) === game);
    const bySet = {};
    for (const it of items) (bySet[`${it.game}|${it.setId}`] = bySet[`${it.game}|${it.setId}`] || []).push(it);
    const out = [];
    await App.util.pool(Object.keys(bySet), 4, async (k) => {
      const [game, sid] = k.split('|'), op = game === 'onepiece';
      const set = await App.games.get(game).getSet(sid).catch(() => null);
      const cat = new Map((set ? set.cards : []).map((c) => [c.id, c]));
      for (const it of bySet[k]) {
        const c = cat.get(it.id);
        if (op) { // (liste One Piece : catégorie seulement ; PV et type viennent de la fiche, en arrière-plan)
          if (c && c.category && !/^(Personnage|Leader)$/i.test(c.category)) continue;
          out.push(Object.assign(Object.create(it), { _hp: null, _type: null }));
          continue;
        }
        if (c && c.category && !/pok/i.test(c.category)) continue; // catégorie inconnue : on tente
        out.push(Object.assign(Object.create(it), { _hp: c && c.hp ? +c.hp : null, _type: c && c.types && c.types[0] ? B().typeKey(c.types[0]) : null }));
      }
    });
    return out.sort((a, b) => App.col.valueOf(b) - App.col.valueOf(a));
  }

  /** Combattant d'une carte de la collection (toutes licences) ; null si elle ne peut pas combattre */
  async function fromItem(it) {
    const game = it.game || 'pokemon', card = await adOf(it).getCard(it.id);
    if (game === 'onepiece' ? !B().isOpFighter(card) : (!/pok/i.test(card.category || 'Pokémon') || !card.hp)) return null;
    const img = await App.col.displayImage(it, adOf(it), 'high');
    return B().fighterOf(card, game, { img: img.src, imgOff: App.battleCards.offImg(card), mine: true });
  }
  async function fromId(id, extra = {}, game = 'pokemon') {
    const card = await ad(game).getCard(id);
    const off = App.battleCards.offImg(card);
    return B().fighterOf(card, game, { img: off, imgOff: off, ...extra });
  }
  /** One Piece : les cartes DON!! ne se capturent pas → 3 DON!! s'ajoutent à ma pioche (dans la limite de 10 cartes) */
  const withDon = (bag, game) => (game !== 'onepiece' || !bag.length ? bag
    : [...bag, ...Array.from({ length: Math.max(0, Math.min(3, BAG_MAX - bag.length)) }, () => App.battleCards.donCard())]);
  /** Mes combattants (complétés par des cartes de prêt de la licence) */
  async function myFighters(items, game) {
    const fs = (await Promise.all(items.map((it) => fromItem(it).catch(() => null)))).filter(Boolean);
    const loan = pick(B().levels(game)[0].pool, 6);
    while (fs.length < 3 && loan.length) { const f = await fromId(loan.shift(), { loan: true }, game).catch(() => null); if (f) fs.push(f); }
    return fs;
  }
  const pick = (arr, n) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, n); };

  // ---------- Morceaux d'interface ----------
  const typeColor = (t) => (B().TYPE_INFO[t] || ['?', '#dfe4ee'])[1];
  // One Piece : la couleur de la carte tient lieu de type
  const OP_NAMES = { fire: 'Rouge', grass: 'Vert', water: 'Bleu', psychic: 'Violet', darkness: 'Noir', lightning: 'Jaune', colorless: 'Sans couleur' };
  const typesOf = (game) => (game === 'onepiece' ? Object.values(B().OP_COLOR) : Object.keys(B().TYPE_INFO));
  const typeName = (t, game) => (game === 'onepiece' ? OP_NAMES[t] || '?' : (B().TYPE_INFO[t] || ['?'])[0]);
  const typeChip = (t, game) => `<span class="bt-type" style="--tc:${typeColor(t)}">${esc(typeName(t, game))}</span>`;
  const pips = (n) => `<span class="bt-pips" title="${n} énergie${n > 1 ? 's' : ''}">${Array.from({ length: Math.min(n, 8) }, () => '<i></i>').join('')}${n > 8 ? `<b>+${n - 8}</b>` : ''}</span>`;
  const costPips = (n) => (n ? Array.from({ length: n }, () => '<i></i>').join('') : '<small>0</small>');
  const hpCls = (r) => (r < 0.3 ? 'low' : r < 0.6 ? 'mid' : '');

  App.matchParts = { esc, B, isFast, setFast, sleep, ad, gameOf, adOf, FIGHT_GAMES, TEAMS, BAG_MAX, RM, LIC, lic, BAG_ICON, say, LAST, lastGame, normStats, normTeams, keyGame, normMatch, sideOf, getMatch, saveMatch, teamItems, bagItems, myTrainers, myPokemon, fromItem, fromId, withDon, myFighters, pick, typeColor, OP_NAMES, typesOf, typeName, typeChip, pips, costPips, hpCls };
})();
