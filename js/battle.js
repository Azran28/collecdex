/*
 * Combat simplifié avec ses cartes (contre l'ordinateur).
 * Règles maison, inspirées du jeu de cartes mais bien plus simples :
 *  - 3 Pokémon par équipe ; un combattant actif, les autres sur le banc.
 *  - Au début de ton tour, ton Pokémon actif gagne 1 énergie (chaque Pokémon garde les siennes).
 *  - Une action par tour : attaquer (s'il a assez d'énergie : 1 par symbole du coût, dépensées),
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

  /**
   * Combattant One Piece (v2.94 : les combats sont les mêmes pour toutes les licences, adaptés légèrement).
   * Personnage ou Leader : PV = puissance ÷ 50 (+ contre, + vies du Leader) ; type = couleur (rouge → Feu…) ;
   * attaque principale = puissance ÷ 100, coût selon le coût de la carte ; « Riposte » (1 énergie) si la carte a un contre ;
   * [Double attaque] = 2 pièces ; [Initiative] = commence avec 1 énergie. Pas de faiblesse ni de résistance (One Piece n'en a pas).
   */
  const OP_COLOR = { Red: 'fire', Green: 'grass', Blue: 'water', Purple: 'psychic', Black: 'darkness', Yellow: 'lightning' };
  const r10 = (v) => Math.round(v / 10) * 10;
  const isOpFighter = (card) => /^(Personnage|Leader|Character)$/i.test(card.category || '') && card.power != null;
  function fighterOP(card, extra = {}) {
    const leader = /leader/i.test(card.category || ''), power = +card.power || 0, counter = +card.counter || 0, cost = +card.cost || 0;
    const text = String(card.text || ''), dbl = /\[Double attaque\]|\[Double Attack\]/i.test(text), rush = /\[Initiative\]|\[Rush\]/i.test(text);
    const hp = Math.min(260, Math.max(30, r10(power / 50 + counter / 50 + (leader ? cost * 10 : 0))));
    const base = Math.max(10, r10(power / 100));
    const attacks = [{ name: leader ? 'Ordre du capitaine' : 'Attaque', cost: leader ? 2 : Math.min(3, 1 + Math.floor(cost / 3)), base: dbl ? Math.max(10, r10(base / 2) + 10) : base, mode: dbl ? 'x' : '', noDamage: false, text: dbl ? 'Double attaque : 2 pièces' : '' }];
    if (counter) attacks.unshift({ name: 'Riposte', cost: 1, base: Math.max(10, r10(counter / 50)), mode: '', noDamage: false, text: '' });
    return {
      uid: Math.random().toString(36).slice(2, 9), id: card.id, name: card.name, hp, maxHp: hp, game: 'onepiece',
      type: OP_COLOR[(card.colors || [])[0]] || 'colorless', weak: [], res: [], attacks, energy: rush ? 1 : 0, ko: false, ...extra,
    };
  }
  /**
   * Combattant Riftbound (v3.10, même moteur, adapté légèrement) : seules les unités combattent.
   * PV = 40 + puissance × 16 (+ [Shield], [Tank], champion) ; type = domaine (Fureur → Feu…) ; attaque = puissance × 10 (+ [Assault]),
   * coût selon l'énergie de la carte ; « Riposte » (1 énergie) si l'unité a [Shield] ou [Tank] ; [Accelerate] = commence avec 1 énergie.
   */
  const RB_DOMAIN = { fury: 'fire', calm: 'grass', mind: 'water', body: 'fighting', chaos: 'psychic', order: 'lightning' };
  const isRbFighter = (card) => (card.kind === 'unit' || /^Unité$/i.test(card.category || '')) && card.might != null;
  function fighterRB(card, extra = {}) {
    const might = Math.max(1, +card.might || 1), cost = +card.cost || 0, text = String(card.text || '');
    const kw = (re) => { const m = text.match(re); return m ? +(m[1] || 1) : 0; };
    const shield = kw(/\[Shield(?:\s+(\d+))?\]/i), assault = kw(/\[Assault(?:\s+(\d+))?\]/i), tank = /\[Tank\]/i.test(text);
    const champ = (card.supertypes || []).includes('champion'), accel = /\[Accelerate\]/i.test(text);
    const hp = Math.min(260, Math.max(40, r10(40 + might * 16 + shield * 10 + (tank ? 20 : 0) + (champ ? 20 : 0))));
    const attacks = [{ name: champ ? 'Coup de champion' : 'Attaque', cost: Math.min(3, 1 + Math.floor(cost / 3)), base: Math.max(10, r10(might * 10 + assault * 10)), mode: '', noDamage: false, text: assault ? `Assaut ${assault} : +${assault * 10} dégâts` : '' }];
    if (shield || tank) attacks.unshift({ name: 'Riposte', cost: 1, base: Math.max(10, r10(might * 5)), mode: '', noDamage: false, text: '' });
    return {
      uid: Math.random().toString(36).slice(2, 9), id: card.id, name: card.name, hp, maxHp: hp, game: 'riftbound',
      type: RB_DOMAIN[(card.domains || [])[0]] || 'colorless', weak: [], res: [], attacks, energy: accel ? 1 : 0, ko: false, ...extra,
    };
  }
  /**
   * Combattant Disney Lorcana (v3.21, même moteur, adapté légèrement) : seuls les personnages combattent.
   * PV = 30 + volonté × 15 (+ Résistance) ; type = encre (Rubis → Feu…) ; attaque « Défi » = force × 10 (+ Offensif), coût selon le
   * coût de la carte ; « Riposte » (1 énergie) si le personnage a Rempart ou Résistance ; Charge = commence avec 1 énergie.
   */
  const LC_INK = { ru: 'fire', em: 'grass', sa: 'water', am: 'lightning', amy: 'psychic', st: 'metal' };
  const isLcFighter = (card) => (card.kind === 'ch' || /^Personnage$/i.test(card.category || '')) && card.strength != null;
  function fighterLC(card, extra = {}) {
    const str = Math.max(0, +card.strength || 0), will = Math.max(1, +card.willpower || 1), cost = +card.cost || 0, text = String(card.text || '');
    const kw = (re) => { const m = text.match(re); return m ? +(m[1] || 1) : 0; };
    const resist = kw(/(?:R[ée]sistance|Resist)\s*\+(\d+)/i), offensif = kw(/(?:Offensif|Challenger)\s*\+(\d+)/i);
    const guard = /\b(Rempart|Bodyguard)\b/i.test(text), rush = /^(Charge|Rush)\b|\n(Charge|Rush)\b/i.test(text);
    const hp = Math.min(260, Math.max(40, r10(30 + will * 15 + resist * 10)));
    const attacks = [{ name: 'Défi', cost: Math.min(3, 1 + Math.floor(cost / 3)), base: Math.max(10, r10(str * 10 + offensif * 10)), mode: '', noDamage: false, text: offensif ? `Offensif +${offensif} : +${offensif * 10} dégâts` : '' }];
    if (guard || resist) attacks.unshift({ name: 'Riposte', cost: 1, base: Math.max(10, r10(Math.max(1, str) * 5)), mode: '', noDamage: false, text: '' });
    return {
      uid: Math.random().toString(36).slice(2, 9), id: card.id, name: card.name, hp, maxHp: hp, game: 'lorcana',
      type: LC_INK[(card.inks || [])[0]] || 'colorless', weak: [], res: [], attacks, energy: rush ? 1 : 0, ko: false, ...extra,
    };
  }
  /**
   * Combattant Yu-Gi-Oh! (v3.26, même moteur, adapté légèrement) : seuls les monstres combattent (pas les Magies ni les Pièges).
   * PV = 30 + DEF ÷ 40 + niveau × 5 ; type = attribut (Feu → Feu, Terre → Combat…) ; attaque = ATK ÷ 30, coût selon le niveau
   * (1 à 3) ; « Position de défense » (1 énergie) si DEF > ATK ; monstres de l'Extra Deck (Fusion, Synchro, Xyz, Lien) = commencent
   * avec 1 énergie. ATK / DEF « ? » (dieux égyptiens) = 4000.
   */
  const YG_ATTR = { fe: 'fire', ea: 'water', ve: 'grass', te: 'fighting', lu: 'lightning', tn: 'darkness', di: 'psychic' };
  const isYgFighter = (card) => !!card.monster && card.atk != null && card.kind !== 'tk';
  function fighterYG(card, extra = {}) {
    const val = (v) => (v == null ? 0 : +v < 0 ? 4000 : +v);
    const atk = val(card.atk), link = card.kind === 'l', def = link ? atk * 0.6 : val(card.def), lv = Math.max(1, +card.level || (link ? 2 : 4));
    const extraDeck = ['f', 'sy', 'x', 'l', 'pf', 'psy', 'px'].includes(card.kind);
    const hp = Math.min(260, Math.max(40, r10(30 + def / 40 + (link ? lv * 15 : lv * 5))));
    const attacks = [{ name: 'Attaque', cost: Math.min(3, 1 + Math.floor((link ? lv * 2 : lv) / 4)), base: Math.max(10, r10(atk / 30)), mode: '', noDamage: false, text: '' }];
    if (def > atk) attacks.unshift({ name: 'Position de défense', cost: 1, base: Math.max(10, r10(def / 60)), mode: '', noDamage: false, text: '' });
    return {
      uid: Math.random().toString(36).slice(2, 9), id: card.id, name: card.name, hp, maxHp: hp, game: 'yugioh',
      type: YG_ATTR[card.attribute] || 'colorless', weak: [], res: [], attacks, energy: extraDeck ? 1 : 0, ko: false, ...extra,
    };
  }
  /** La carte peut-elle combattre dans sa licence ? (Pokémon avec des PV ; personnages One Piece ; unités Riftbound ; personnages Lorcana ; monstres Yu-Gi-Oh!) */
  const canFight = (card, game) => (game === 'onepiece' ? isOpFighter(card) : game === 'riftbound' ? isRbFighter(card) : game === 'lorcana' ? isLcFighter(card) : game === 'yugioh' ? isYgFighter(card) : /pok/i.test(card.category || 'Pokémon') && !!card.hp);
  /** Combattant de n'importe quelle licence */
  const fighterOf = (card, game, extra = {}) => (game === 'onepiece' ? fighterOP(card, extra) : game === 'riftbound' ? fighterRB(card, extra) : game === 'lorcana' ? fighterLC(card, extra) : game === 'yugioh' ? fighterYG(card, extra) : fighter(card, extra));

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
    { n: 1, name: 'Débutant', desc: 'Pokémon de base · il joue un peu au hasard', pool: range(44, 69), bonus: 0, color: '#3ddc97' },
    { n: 2, name: 'Dresseur', desc: 'Évolutions · il attaque toujours au plus fort', pool: range(22, 43), bonus: 0, color: '#34a0ff' },
    { n: 3, name: 'Champion', desc: 'Holos du Set de Base · il connaît les faiblesses', pool: range(1, 16), bonus: 0, color: '#a78bfa' },
    { n: 4, name: 'Maître', desc: 'Meilleures holos · une énergie d’avance', pool: range(1, 16), bonus: 1, strong: true, color: '#ff8a3d' },
    { n: 5, name: 'Légende', desc: 'Pokémon-ex modernes · sors tes meilleures cartes', pool: ['sv03.5-003', 'sv03.5-006', 'sv03.5-009', 'sv03.5-024', 'sv03.5-038', 'sv03.5-065', 'sv03.5-076', 'sv03.5-124', 'sv03.5-145', 'sv03.5-040', 'sv03.5-115'], bonus: 1, color: '#ffc83d' },
  ];

  // Équipes de l'ordinateur One Piece (v2.99 : chaque licence a ses adversaires ; cartes vérifiées chez Punk Records)
  const LEVELS_OP = [
    { n: 1, name: 'Mousse', desc: 'Petits personnages des decks de démarrage · il joue un peu au hasard', pool: ['ST01-003', 'ST01-002', 'ST01-009', 'ST01-011', 'ST02-012', 'ST03-011', 'ST03-006', 'ST03-010', 'ST02-007', 'ST01-007'], bonus: 0, color: '#3ddc97' },
    { n: 2, name: 'Pirate', desc: 'Équipages confirmés · il attaque toujours au plus fort', pool: ['ST01-005', 'ST01-008', 'ST01-010', 'ST02-002', 'ST02-006', 'ST02-014', 'ST03-002', 'ST03-004', 'ST03-012', 'OP01-018', 'OP01-045', 'OP01-023'], bonus: 0, color: '#34a0ff' },
    { n: 3, name: 'Supernova', desc: 'La Pire Génération · il connaît tes points faibles', pool: ['ST01-012', 'ST01-013', 'ST02-009', 'ST02-013', 'ST02-010', 'OP01-025', 'OP01-047', 'OP01-054', 'OP01-051', 'OP05-074'], bonus: 0, color: '#a78bfa' },
    { n: 4, name: 'Grand Corsaire', desc: 'Les Sept Grands Corsaires · un DON!! d’avance', pool: ['ST03-003', 'ST03-009', 'OP01-067', 'OP01-070', 'OP01-078', 'OP01-074', 'ST03-005', 'OP01-073'], bonus: 1, strong: true, color: '#ff8a3d' },
    { n: 5, name: 'Empereur', desc: 'Les Empereurs des mers · sors tes meilleures cartes', pool: ['OP01-120', 'OP01-094', 'OP02-004', 'OP11-073', 'OP09-093', 'OP01-070'], bonus: 1, color: '#ffc83d' },
  ];
  // Équipes de l'ordinateur Riftbound (v3.10 ; unités d'Origins vérifiées dans la galerie de Riot)
  const og = (...n) => n.map((x) => `ogn-${String(x).padStart(3, '0')}-298`);
  const LEVELS_RB = [
    { n: 1, name: 'Sbire', desc: 'Petites unités d’Origins · il joue un peu au hasard', pool: og(3, 6, 10, 13, 44, 52, 54, 84, 91, 96, 136, 171, 210), bonus: 0, color: '#3ddc97' },
    { n: 2, name: 'Combattant', desc: 'Unités aguerries · il attaque toujours au plus fort', pool: og(1, 2, 12, 49, 86, 92, 125, 131, 167, 174, 177, 178, 208, 215), bonus: 0, color: '#34a0ff' },
    { n: 3, name: 'Champion', desc: 'Les champions d’Origins · il connaît tes points faibles', pool: og(27, 30, 66, 67, 68, 73, 74, 110, 112, 193, 200, 232, 238, 241), bonus: 0, color: '#a78bfa' },
    { n: 4, name: 'Maître', desc: 'Champions épiques · une énergie d’avance', pool: og(34, 39, 76, 78, 79, 119, 162, 164, 202, 205, 243, 246), bonus: 1, strong: true, color: '#ff8a3d' },
    { n: 5, name: 'Légende', desc: 'Les monstres de Runeterra · sors tes meilleures cartes', pool: og(41, 158, 38, 82, 161, 148, 11, 88), bonus: 1, color: '#ffc83d' },
  ];
  // Équipes de l'ordinateur Lorcana (v3.21 ; personnages du Premier Chapitre, data/lc-cartes.json)
  const ch1 = (...n) => n.map((x) => `1-${x}`);
  const LEVELS_LC = [
    { n: 1, name: 'Apprenti', desc: 'Petits personnages du Premier Chapitre · il joue un peu au hasard', pool: ch1(7, 13, 19, 20, 22, 24, 36, 47, 60, 69, 77, 110), bonus: 0, color: '#3ddc97' },
    { n: 2, name: 'Illumineur', desc: 'Personnages aguerris · il attaque toujours au plus fort', pool: ch1(1, 3, 11, 12, 15, 16, 17, 35, 40, 45, 46, 54, 57), bonus: 0, color: '#34a0ff' },
    { n: 3, name: 'Héros', desc: 'Rares et très rares · il connaît tes points faibles', pool: ch1(5, 10, 23, 37, 43, 50, 51, 56, 75, 78), bonus: 0, color: '#a78bfa' },
    { n: 4, name: 'Grand Illumineur', desc: 'Personnages légendaires · une énergie d’avance', pool: ch1(21, 42, 59, 70, 82, 115, 147, 178), bonus: 1, strong: true, color: '#ff8a3d' },
    { n: 5, name: 'Légende', desc: 'Les plus grands méchants et héros · sors tes meilleures cartes', pool: ch1(113, 5, 192, 178, 21, 82, 115, 42), bonus: 1, color: '#ffc83d' },
  ];
  // Équipes de l'ordinateur Yu-Gi-Oh! (v3.26 ; monstres des premières séries, data/yg-cartes.json)
  const LEVELS_YG = [
    { n: 1, name: 'Duelliste débutant', desc: 'Petits monstres de La Légende du Dragon Blanc · il joue un peu au hasard', pool: ['LOB-E019', 'MRD-E071', 'LOB-E088', 'MRD-E065', 'LOB-E007', 'LOB-009', 'MRD-E061', 'LOB-E054', 'MRD-E069', 'LOB-002'], bonus: 0, color: '#3ddc97' },
    { n: 2, name: 'Duelliste', desc: 'Monstres de niveau 4 · il attaque toujours au plus fort', pool: ['LOB-E005', 'LOB-E050', 'SDY-E002', 'SDK-E004', 'SDK-E024', 'MRD-E008', 'SDY-035', 'LOB-E085', 'SDK-E005', 'SDY-E003', 'MRD-E116', 'LOB-064'], bonus: 0, color: '#34a0ff' },
    { n: 3, name: 'Champion régional', desc: 'Monstres sacrifiés · il connaît tes points faibles', pool: ['LOB-E004', 'SDY-004', 'LOB-E053', 'LOB-003', 'MRD-E143', 'LOB-E102', 'MFC-000', 'PSV-E000'], bonus: 0, color: '#a78bfa' },
    { n: 4, name: 'Roi des Duellistes', desc: 'Les monstres légendaires · une énergie d’avance', pool: ['LOB-E001', 'LOB-E003', 'LOB-E056', 'PSV-E050', 'SYE-024', 'MRD-E018', 'MFC-105', 'FMR-001'], bonus: 1, strong: true, color: '#ff8a3d' },
    { n: 5, name: 'Pharaon', desc: 'Les dieux égyptiens et les dragons ultimes · sors tes meilleures cartes', pool: ['JMP-005_scr', 'JUMP-037', 'SD09-SS1', 'MRD-E000', 'LOB-E001', 'LOB-E003', 'MRD-E018', 'SYE-024'], bonus: 1, color: '#ffc83d' },
  ];
  /** Niveaux de l'ordinateur pour une licence */
  const levels = (game) => (game === 'onepiece' ? LEVELS_OP : game === 'riftbound' ? LEVELS_RB : game === 'lorcana' ? LEVELS_LC : game === 'yugioh' ? LEVELS_YG : LEVELS);

  /** Puissance d'un combattant (pour que le Maître prenne ses meilleurs Pokémon) */
  const power = (f) => f.hp + 1.5 * Math.max(...f.attacks.map((a) => a.base));

  return { power, fighter, fighterOP, fighterRB, fighterLC, fighterYG, fighterOf, canFight, isOpFighter, isRbFighter, isLcFighter, isYgFighter, OP_COLOR, RB_DOMAIN, LC_INK, YG_ATTR, LEVELS_RB, LEVELS_LC, LEVELS_YG, damage, expected, aiMove, aiReplace, bestAttack, active, alive, bench, typeKey, TYPE_INFO, LEVELS, LEVELS_OP, levels };
})();
