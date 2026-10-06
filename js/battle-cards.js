/*
 * Combat « avec Dresseurs & Énergies » : cartes du sac.
 * Chaque joueur a un deck de 10 cartes Dresseur / Énergie au plus (v2.80 : système de pioche) :
 * il est mélangé, on commence avec 3 cartes en main et on en pioche 1 au début de chacun de ses tours.
 * À chaque tour, on peut jouer AU PLUS UNE carte de sa main, en plus de son action (attaquer / charger / changer).
 * Chaque carte ne sert qu'une fois par combat. Les effets sont simplifiés :
 * on reconnaît les cartes connues par leur nom, sinon par leur texte, sinon par leur genre.
 */
App.battleCards = (() => {
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, "'").trim();

  // effets : clé → [étiquette courte, description]
  const LABEL = {
    energy: (n) => [`+${n} énergie${n > 1 ? 's' : ''}`, `Donne ${n} énergie${n > 1 ? 's' : ''} à ton Pokémon actif (+1 si l’énergie est de son type).`],
    heal: (n) => [`Soin ${n}`, `Soigne ${n} PV à ton Pokémon actif.`],
    healAll: (n) => [`Soin ${n} à tous`, `Soigne ${n} PV à tous tes Pokémon (pas les K.O.).`],
    fullHeal: () => ['Soin total', 'Rend tous ses PV à ton Pokémon actif, mais il perd ses énergies.'],
    power: (n) => [`+${n} dégâts`, `Ta prochaine attaque de ce tour fait ${n} dégâts de plus.`],
    shield: (n) => [`−${n} dégâts subis`, `Ton Pokémon actif subit ${n} dégâts de moins jusqu’à ton prochain tour.`],
    switch: () => ['Échange gratuit', 'Change de Pokémon actif sans utiliser ton action.'],
    gust: () => ['Rafale', 'L’adversaire doit envoyer son Pokémon de banc le plus faible.'],
    strip: (n) => [`−${n} énergie${n > 1 ? 's' : ''} adverse`, `Retire ${n} énergie${n > 1 ? 's' : ''} au Pokémon actif adverse.`],
    revive: () => ['Réanimation', 'Ramène un de tes Pokémon K.O. sur le banc avec la moitié de ses PV.'],
    charge: () => ['+1 énergie', 'Tu te motives : +1 énergie à ton Pokémon actif.'],
    toolHp: (n) => [`+${n} PV max`, `Outil : ton Pokémon actif gagne ${n} PV (et ${n} PV max) pour le combat.`],
    noWeak: () => ['Sans faiblesse', 'Outil : ton Pokémon actif n’a plus de faiblesse pour le combat.'],
    armor: (n) => [`Armure −${n}`, `Outil : ton Pokémon actif subit ${n} dégâts de moins pendant tout le combat.`],
    regen: (n) => [`Soin ${n}/tour`, `Outil : ton Pokémon actif se soigne de ${n} PV à la fin de chacun de tes tours.`],
    stadium: (n) => [`Stade +${n}`, `Stade : tes attaques font ${n} dégâts de plus pendant 3 tours.`],
  };

  // cartes connues (noms français et anglais)
  const BY_NAME = {
    potion: ['heal', 20], 'super potion': ['heal', 40], 'hyper potion': ['heal', 60], 'max potion': ['fullHeal'], 'potion max': ['fullHeal'],
    'guerison totale': ['heal', 20], 'full heal': ['heal', 20], 'centre pokemon': ['healAll', 40], 'pokemon center': ['healAll', 40],
    rappel: ['fullHeal'], 'scoop up': ['fullHeal'],
    pluspower: ['power', 20], defenseur: ['shield', 20], defender: ['shield', 20],
    transfert: ['switch'], switch: ['switch'], 'rafale de vent': ['gust'], 'gust of wind': ['gust'], 'boss\'s orders': ['gust'], 'ordres du boss': ['gust'],
    'suppression d\'energie': ['strip', 1], 'energy removal': ['strip', 1], 'double suppression d\'energie': ['strip', 2], 'super energy removal': ['strip', 2],
    'faux professeur chen': ['strip', 1], reanimation: ['revive'], revive: ['revive'],
    'professeur chen': ['charge'], 'professor oak': ['charge'], leo: ['charge'], bill: ['charge'],
    'double energie incolore': ['energy', 2], 'double colorless energy': ['energy', 2],
  };

  /** Effet simplifié d'une carte Dresseur / Énergie (fiche TCGdex) */
  function effectOf(card) {
    const name = norm(card.name), text = norm(card.effect || card.description || '');
    const cat = norm(card.category);
    const mk = (key, n, extra = {}) => { const [short, desc] = LABEL[key](n); return { key, n, short, desc, ...extra }; };
    if (/energ/.test(cat)) {
      if (BY_NAME[name]) return mk('energy', BY_NAME[name][1] || 1);
      const t = Object.keys(App.battle.TYPE_INFO).find((k) => name.includes(norm(App.battle.TYPE_INFO[k][0])) || name.includes(k));
      return mk('energy', 1, { eType: t || null });
    }
    if (BY_NAME[name]) { const [k, n] = BY_NAME[name]; return mk(k, n); }
    let m;
    const tool = /outil|tool/.test(norm(card.trainerType));
    if ((m = text.match(/fin de votre tour.*soign\w*\s+(\d+)/))) return mk('regen', Math.min(30, +m[1]));
    if (/attache\w* (?:une|1) carte energie/.test(text)) return mk('charge');
    if (tool && (m = text.match(/(\d+)\s*degats de moins/))) return mk('armor', Math.min(30, +m[1]));
    if ((m = text.match(/soign\w*\s+(\d+)\s*degats/))) return /tous vos/.test(text) ? mk('healAll', +m[1]) : mk('heal', +m[1]);
    if ((m = text.match(/retire\w*\s+(?:jusqu'a\s+)?(\d+)\s+marqueurs?\s+de\s+degats/))) return mk('heal', +m[1] * 10);
    if (/retire\w* tous les marqueurs de degats/.test(text)) return mk('healAll', 40);
    if (/n'a pas de faiblesse/.test(text)) return mk('noWeak');
    if ((m = text.match(/(\d+)\s*degats de moins/))) return mk('shield', Math.min(40, +m[1]));
    if ((m = text.match(/(\d+)\s*degats (?:de plus|supplementaires)/))) return /stade/.test(norm(card.trainerType)) ? mk('stadium', Math.min(30, +m[1])) : mk('power', Math.min(40, +m[1]));
    if (/banc (?:de )?votre adversaire.*actif|pokemon de banc de votre adversaire/.test(text)) return mk('gust');
    if (/echangez (?:1 pokemon de )?votre (?:pokemon actif|banc)/.test(text)) return mk('switch');
    if (/energie.*attachee.*adversaire|adversaire.*defauss\w*.*energie/.test(text)) return mk('strip', 1);
    if (/pile de defausse sur votre banc|pokemon de base de votre pile de defausse/.test(text)) return mk('revive');
    const tt = norm(card.trainerType);
    if (tool) return mk('toolHp', 20);
    if (/stade|stadium/.test(tt)) return mk('stadium', 10);
    if (/supporter/.test(tt) || /piochez/.test(text)) return mk('charge');
    return mk('heal', 30); // Objet quelconque : petite potion
  }

  /**
   * Visuel officiel d'une carte (celui que voit l'adversaire en ligne) : image française, sinon l'anglaise,
   * retrouvée d'après la série (TCGdex n'a pas toutes les images en français : ex. Rhinastoc sm10-95).
   */
  function offImg(card) {
    if (!card) return '';
    if (App.pokemonHorsSerie && App.pokemonHorsSerie.isLocalImage(card.image)) return `${card.image}.jpg`; // carte hors-série : visuel du site
    if (/onepiece-cardgame\.com\//.test(card.image || '')) return App.games.get('onepiece').img.card(card, 'high'); // One Piece : visuel relayé (Bandai bloque l'affichage direct)
    if (card.image) return `${card.image}/high.webp`;
    const m = String((card.set && (card.set.symbol || card.set.logo)) || '').match(/assets\.tcgdex\.net\/[a-z-]+\/([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)\/(?:logo|symbol)/);
    return m && card.localId ? `https://assets.tcgdex.net/en/${m[1]}/${m[2]}/${encodeURIComponent(card.localId)}/high.webp` : '';
  }
  /** Carte du sac prête pour le combat (img peut être ta photo ; imgOff = visuel officiel, envoyé à l'adversaire) */
  function bagCard(card, extra = {}) {
    return { uid: Math.random().toString(36).slice(2, 9), id: card.id, name: card.name, img: offImg(card), imgOff: offImg(card), energy: /energ/.test(norm(card.category)), fx: effectOf(card), used: false, ...extra };
  }

  const B = () => App.battle;
  /** La carte peut-elle servir maintenant ? (sinon elle est grisée) */
  function playable(c, me, him) {
    if (c.used || c.inHand === false) return false; // pas encore piochée
    const a = B().active(me), o = B().active(him);
    switch (c.fx.key) {
      case 'heal': case 'fullHeal': return a.hp < a.maxHp;
      case 'healAll': return me.team.some((f) => !f.ko && f.hp < f.maxHp);
      case 'switch': return B().bench(me).length > 0;
      case 'gust': return B().bench(him).length > 0;
      case 'strip': return o.energy > 0;
      case 'revive': return me.team.some((f) => f.ko);
      case 'power': return a.attacks.some((x) => x.cost <= a.energy + 0) && !me.power;
      case 'shield': return !a.shield;
      case 'toolHp': case 'noWeak': case 'regen': case 'armor': return !a.tool;
      case 'stadium': return !(me.stadium && me.stadium.turns > 0);
      default: return true;
    }
  }

  /**
   * Carte choisie par l'ordinateur (index dans son sac, ou -1).
   * Niveau 1 : parfois au hasard ; ensuite il joue la carte la plus utile du moment.
   */
  function aiCard(me, him, level) {
    const bag = me.bag || [];
    const ok = bag.map((c, i) => ({ c, i })).filter((x) => playable(x.c, me, him));
    if (!ok.length) return -1;
    if (level <= 1) return Math.random() < 0.5 ? ok[Math.floor(Math.random() * ok.length)].i : -1;
    const a = B().active(me), o = B().active(him);
    const maxCost = Math.max(...a.attacks.map((x) => x.cost));
    const threat = o.attacks.length ? Math.max(...o.attacks.filter((x) => x.cost <= o.energy + 1).map((x) => B().expected(x, o, a)), 0) : 0;
    const score = ({ c }) => {
      const f = c.fx;
      switch (f.key) {
        case 'revive': return 80;
        case 'heal': { const miss = a.maxHp - a.hp; return miss >= f.n * 0.7 && a.hp <= threat + 20 ? 90 : miss >= f.n ? 40 : 0; }
        case 'fullHeal': return a.hp < a.maxHp * 0.4 && a.energy <= 1 ? 85 : 0;
        case 'healAll': return me.team.reduce((s, x) => s + (x.ko ? 0 : x.maxHp - x.hp), 0) >= 60 ? 60 : 0;
        case 'energy': case 'charge': return a.energy < maxCost ? 55 + (f.eType === a.type ? 10 : 0) : 5;
        case 'power': { const b = B().bestAttack(a, o); return b && b.e < o.hp && b.e + f.n >= o.hp ? 95 : b ? 30 : 0; }
        case 'strip': return o.energy >= 2 ? 70 : 20;
        case 'shield': return threat >= 30 ? 50 : 10;
        case 'gust': { const w = B().bench(him).sort((x, y) => x.f.hp - y.f.hp)[0]; const b = B().bestAttack(a, w.f); return b && b.e >= w.f.hp ? 88 : 15; }
        case 'toolHp': case 'noWeak': case 'regen': case 'armor': return 35;
        case 'stadium': return 30;
        case 'switch': return a.hp < a.maxHp * 0.3 ? 45 : 0;
        default: return 10;
      }
    };
    const best = ok.map((x) => ({ ...x, s: score(x) })).sort((x, y) => y.s - x.s)[0];
    return best.s >= (level >= 4 ? 25 : 35) ? best.i : -1;
  }

  // sacs de l'ordinateur et sac de prêt (cartes du Set de Base, vérifiées chez TCGdex)
  const ENERGY_OF = { fighting: 'base1-97', fire: 'base1-98', grass: 'base1-99', lightning: 'base1-100', psychic: 'base1-101', water: 'base1-102' };
  const energyFor = (type) => ENERGY_OF[type] || 'base1-96';
  // decks de 4 à 10 cartes selon le niveau (doublons permis) ; Énergies du type du 1er Pokémon ajoutées par aiBag
  const AI_BAGS = [
    [['base1-94', 2]],                                                          // 2 Potion
    [['base1-94', 2], ['base1-84', 1]],                                         // + PlusPower
    [['base1-94', 2], ['base1-84', 1], ['base1-80', 1], ['base1-92', 1]],         // + Défenseur, Suppression d'Énergie
    [['base1-90', 1], ['base1-94', 1], ['base1-84', 2], ['base1-80', 1], ['base1-92', 1], ['base1-93', 1]], // Super Potion, Rafale de vent
    [['base1-90', 2], ['base1-84', 2], ['base1-80', 1], ['base1-79', 1], ['base1-93', 1], ['base1-89', 1]], // Double Suppression, Réanimation
  ];
  const AI_ENERGY = [2, 3, 3, 3, 2];
  const many = (list) => list.flatMap(([id, n]) => Array(n).fill(id));
  const aiBag = (level, type) => [...many(AI_BAGS[level - 1]), ...Array(AI_ENERGY[level - 1]).fill(energyFor(type))];
  // deck de prêt (8 cartes) : 2 Potion, PlusPower, Défenseur, Transfert, 3 Énergies
  const loanBag = (type) => [...many([['base1-94', 2], ['base1-84', 1], ['base1-80', 1], ['base1-95', 1]]), ...Array(3).fill(energyFor(type))];
  const DECK_MAX = 10, HAND_START = 3;

  /** Effet reconstruit à partir de sa clé (cartes reçues d'un ami : on ne garde pas ses textes) */
  function fxOf(key, n, eType) {
    if (typeof key !== 'string' || !Object.prototype.hasOwnProperty.call(LABEL, key)) return null;
    const [short, desc] = LABEL[key](n);
    return { key, n, short, desc, ...(eType ? { eType } : {}) };
  }

  return { effectOf, bagCard, offImg, playable, aiCard, aiBag, loanBag, norm, fxOf, DECK_MAX, HAND_START };
})();
