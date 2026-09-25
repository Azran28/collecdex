/*
 * Combat simplifié avec ses cartes (contre l'ordinateur).
 * Règles maison, inspirées du jeu de cartes mais bien plus simples :
 *  - 3 Pokémon par équipe ; un combattant actif, les autres sur le banc.
 *  - Au début de ton tour, ton Pokémon actif gagne 1 énergie (chaque Pokémon garde les siennes).
 *  - Une action par tour : attaquer (s'il a assez d'énergie : 1 par symbole du coût),
 *    « Charger » (+1 énergie en plus) ou changer de Pokémon.
 *  - Dégâts de la carte ; « 30× » = 30 par face sur 2 pièces, « 20+ » = 20, +10 sur face.
 *    Attaque sans dégâts indiqués (effet) : 10 dégâts.
 *  - Faiblesse (×2 ou +X) et résistance (−X) de la carte.
 *  - Le premier qui met K.O. les 3 Pokémon adverses gagne.
 */
App.battle = (() => {
  // types (français ou anglais selon la langue de la carte) → clé commune
  const T = {
    plante: 'grass', grass: 'grass', feu: 'fire', fire: 'fire', eau: 'water', water: 'water',
    'électrique': 'lightning', electrique: 'lightning', lightning: 'lightning', psy: 'psychic', psychic: 'psychic',
    combat: 'fighting', fighting: 'fighting', 'obscurité': 'darkness', obscurite: 'darkness', darkness: 'darkness',
    'métal': 'metal', metal: 'metal', incolore: 'colorless', colorless: 'colorless', dragon: 'dragon', 'fée': 'fairy', fee: 'fairy', fairy: 'fairy',
  };
  const TYPE_INFO = {
    grass: ['Plante', '#4cc97a'], fire: ['Feu', '#ff6b3d'], water: ['Eau', '#3fa2ff'], lightning: ['Électrique', '#ffd23f'],
    psychic: ['Psy', '#c86bff'], fighting: ['Combat', '#d9844a'], darkness: ['Obscurité', '#5b6a8a'], metal: ['Métal', '#aab4c8'],
    colorless: ['Incolore', '#dfe4ee'], dragon: ['Dragon', '#c9a227'], fairy: ['Fée', '#ff8fd2'],
  };
  const typeKey = (t) => T[String(t || '').toLowerCase()] || 'colorless';

  /** Combattant à partir d'une carte détaillée TCGdex */
  function fighter(card, extra = {}) {
    const attacks = (card.attacks || []).map((a) => {
      const raw = a.damage == null ? '' : String(a.damage).trim();
      const base = parseInt(raw, 10) || 0;
      const mode = /[×x]/i.test(raw) ? 'x' : /\+/.test(raw) ? '+' : '';
      return { name: a.name || 'Attaque', cost: (a.cost || []).length, base: base || 10, mode, noDamage: !base, text: a.effect || '' };
    });
    if (!attacks.length) attacks.push({ name: 'Charge', cost: 1, base: 10, mode: '', noDamage: false, text: '' });
    const hp = Math.max(30, parseInt(card.hp, 10) || 50);
    return {
      uid: Math.random().toString(36).slice(2, 9), id: card.id, name: card.name, hp, maxHp: hp,
      type: typeKey((card.types || [])[0]),
      weak: (card.weaknesses || []).map((w) => ({ type: typeKey(w.type), mult: /[×x]/.test(w.value || '×2') ? parseInt(String(w.value).replace(/\D/g, ''), 10) || 2 : 1, add: /\+/.test(w.value || '') ? parseInt(String(w.value).replace(/\D/g, ''), 10) || 0 : 0 })),
      res: (card.resistances || []).map((r) => ({ type: typeKey(r.type), sub: parseInt(String(r.value || '-30').replace(/\D/g, ''), 10) || 30 })),
      attacks, energy: 0, ko: false, ...extra,
    };
  }

  /** Dégâts d'une attaque (avec le hasard des pièces si besoin) */
  function damage(att, from, to, rand = Math.random) {
    let dmg = att.base, coins = null;
    if (att.mode === 'x') { coins = [rand() < 0.5, rand() < 0.5]; dmg = att.base * coins.filter(Boolean).length; }
    else if (att.mode === '+') { coins = [rand() < 0.5]; if (coins[0]) dmg += 10 * Math.max(1, Math.round(att.base / 30)); }
    let weak = false, resist = false;
    const w = to.weak.find((x) => x.type === from.type);
    if (w && dmg > 0) { weak = true; dmg = w.add ? dmg + w.add : dmg * w.mult; }
    const r = to.res.find((x) => x.type === from.type);
    if (r && dmg > 0) { resist = true; dmg = Math.max(0, dmg - r.sub); }
    return { dmg, coins, weak, resist };
  }
  /** Dégâts moyens attendus (pour l'ordinateur) */
  function expected(att, from, to) {
    let d = att.mode === 'x' ? att.base : att.mode === '+' ? att.base + 5 * Math.max(1, Math.round(att.base / 30)) : att.base;
    const w = to.weak.find((x) => x.type === from.type); if (w) d = w.add ? d + w.add : d * w.mult;
    const r = to.res.find((x) => x.type === from.type); if (r) d = Math.max(0, d - r.sub);
    return d;
  }

  const active = (side) => side.team[side.active];
  const alive = (side) => side.team.filter((f) => !f.ko);
  const bench = (side) => side.team.map((f, i) => ({ f, i })).filter((x) => x.i !== side.active && !x.f.ko);

  /** Meilleur coup de « from » contre « to » : l'attaque jouable la plus forte */
  function bestAttack(from, to) {
    let best = null;
    from.attacks.forEach((a, i) => { if (a.cost <= from.energy) { const e = expected(a, from, to); if (!best || e > best.e) best = { i, e }; } });
    return best;
  }
  /** Force d'un combattant contre un autre (pour choisir qui envoyer) */
  function matchup(f, vs) {
    const off = Math.max(...f.attacks.map((a) => expected(a, f, vs) / Math.max(1, a.cost)));
    const def = Math.max(...vs.attacks.map((a) => expected(a, vs, f) / Math.max(1, a.cost)));
    return off * 1.2 - def + f.hp / 20;
  }

  /**
   * Coup de l'ordinateur. Niveaux : 1 débutant (au hasard), 2 dresseur (la plus forte attaque),
   * 3 champion et 4 maître (faiblesses, finit les Pokémon affaiblis, change de Pokémon au bon moment).
   */
  function aiMove(ai, foe, level) {
    const me = active(ai), him = active(foe);
    const playable = me.attacks.map((a, i) => ({ a, i })).filter((x) => x.a.cost <= me.energy);
    if (level <= 1) {
      if (playable.length && Math.random() < 0.8) return { type: 'attack', i: playable[Math.floor(Math.random() * playable.length)].i };
      return { type: 'charge' };
    }
    const best = bestAttack(me, him);
    if (level >= 3) {
      // mauvais duel et un meilleur Pokémon sur le banc : on change (pas si on peut mettre K.O. tout de suite)
      const canKo = best && best.e >= him.hp;
      if (!canKo) {
        const here = matchup(me, him);
        const alt = bench(ai).map((x) => ({ ...x, s: matchup(x.f, him) })).sort((a, b) => b.s - a.s)[0];
        if (alt && alt.s > here + 25 && me.hp < me.maxHp * 0.6 && Math.random() < (level >= 4 ? 0.9 : 0.6)) return { type: 'switch', to: alt.i };
      }
      if (best && best.e >= him.hp) return { type: 'attack', i: best.i };
      // attendre une grosse attaque presque prête plutôt que taper faiblement
      const big = me.attacks.map((a, i) => ({ i, e: expected(a, me, him), cost: a.cost })).sort((a, b) => b.e - a.e)[0];
      if (best && big && big.cost === me.energy + 1 && big.e > best.e * 2 && me.hp > (him.attacks.length ? Math.max(...him.attacks.map((a) => expected(a, him, me))) : 0)) return { type: 'charge' };
    }
    if (best && best.e > 0) return { type: 'attack', i: best.i };
    return { type: 'charge' };
  }
  /** Remplaçant choisi par l'ordinateur après un K.O. */
  function aiReplace(ai, foe, level) {
    const b = bench(ai); if (!b.length) return null;
    if (level <= 1) return b[Math.floor(Math.random() * b.length)].i;
    const him = active(foe);
    return b.map((x) => ({ ...x, s: matchup(x.f, him) })).sort((a, b2) => b2.s - a.s)[0].i;
  }

  // Équipes de l'ordinateur (cartes vérifiées chez TCGdex)
  const range = (a, b, p = 'base1-') => Array.from({ length: b - a + 1 }, (_, i) => p + (a + i));
  const LEVELS = [
    { n: 1, name: 'Débutant', desc: 'Des Pokémon de base du Set de Base, et un adversaire qui joue un peu au hasard.', pool: range(44, 69), bonus: 0, color: '#3ddc97' },
    { n: 2, name: 'Dresseur', desc: 'Des évolutions du Set de Base. Il attaque toujours le plus fort possible.', pool: range(22, 43), bonus: 0, color: '#34a0ff' },
    { n: 3, name: 'Champion', desc: 'Les holographiques du Set de Base. Il connaît les faiblesses et change de Pokémon.', pool: range(1, 16), bonus: 0, color: '#a78bfa' },
    { n: 4, name: 'Maître', desc: 'Les meilleures holographiques du Set de Base, une énergie d’avance, et il joue très bien.', pool: range(1, 16), bonus: 1, strong: true, color: '#ff8a3d' },
    { n: 5, name: 'Légende', desc: 'Des Pokémon-ex modernes (série 151) : il te faudra tes cartes les plus puissantes !', pool: ['sv03.5-003', 'sv03.5-006', 'sv03.5-009', 'sv03.5-024', 'sv03.5-038', 'sv03.5-065', 'sv03.5-076', 'sv03.5-124', 'sv03.5-145', 'sv03.5-040', 'sv03.5-115'], bonus: 1, color: '#ffc83d' },
  ];

  /** Puissance d'un combattant (pour que le Maître prenne ses meilleurs Pokémon) */
  const power = (f) => f.hp + 1.5 * Math.max(...f.attacks.map((a) => a.base));

  return { power, fighter, damage, expected, aiMove, aiReplace, bestAttack, active, alive, bench, typeKey, TYPE_INFO, LEVELS };
})();
