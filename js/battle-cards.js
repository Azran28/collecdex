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

  /**
   * Effet simplifié d'une carte One Piece (Événement, Lieu, DON!!) d'après son texte (français ou anglais) :
   * [Contre] +X000 → protection ; +X000 de puissance → dégâts en plus ; KO → gros coup ; −X000 / épuiser → DON!! adverse en moins ;
   * renvoyer à la main / sous le deck → Rafale ; piocher / regarder des cartes → +1 DON!! ; Lieu → Stade.
   */
  const isOpCard = (card) => /^(evenement|lieu|event|stage|don!!)$/.test(norm(card && card.category));
  function effectOfOP(card) {
    const text = norm(card.text || ''), cat = norm(card.category);
    const mk = (key, n) => { const [short, desc] = LABEL[key](n); return { key, n, short, desc }; };
    const k = (v) => Math.min(40, Math.max(10, Math.round(+v / 100))); // 3000 de puissance → 30
    const gain = /(?:gagne\w*|gains?)\s+\+\s?(\d000)/;
    let m;
    if (/^don/.test(cat)) return mk('energy', 1);
    if (/^(lieu|stage)$/.test(cat)) return mk('stadium', (m = text.match(/\+\s?(\d)000/)) ? Math.min(20, +m[1] * 10) : 10);
    if (/\[(contre|counter)\]/.test(text) && (m = text.match(gain))) return mk('shield', k(m[1]));
    if (/mettez ko|k\.o\. up to/.test(text)) return mk('power', 30);
    if ((m = text.match(gain))) return mk('power', k(m[1]));
    if (/perd\w*\s+-\s?\d000|[-−]\s?\d000 power|epuise\w* jusqu'a \d+ personnage adverse|rest up to \d+ of your opponent/.test(text)) return mk('strip', 1);
    if (/(renvoy\w*|return\w*).{0,60}(main|hand)|au-dessous du deck de son proprietaire|bottom of the owner/.test(text)) return mk('gust');
    if (/piochez|draw \d|regardez \d+ cartes|look at \d+ cards|don!!/.test(text)) return mk('charge');
    return mk('heal', 30);
  }

  /**
   * Effet simplifié d'une carte Riftbound (Sort, Équipement, Rune, Champ de bataille) d'après son texte (anglais, chez Riot) :
   * Rune → +1 énergie de son domaine ; Champ de bataille → Stade ; Équipement → +20 PV max ; « Kill a unit » → gros coup ;
   * « Deal N » / « +N ⚔ » → dégâts en plus ; « Stun » / « −N ⚔ » / contrer → protection ; renvoyer une unité ennemie → Rafale ;
   * renvoyer / déplacer une unité alliée → échange ; piocher / canaliser → +1 énergie.
   */
  const isRbCard = (card) => /^(sort|equipement|rune|champ de bataille)$/.test(norm(card && card.category));
  function effectOfRB(card) {
    const text = norm(card.text || ''), cat = norm(card.category);
    const mk = (key, n, extra = {}) => { const [short, desc] = LABEL[key](n); return { key, n, short, desc, ...extra }; };
    const k = (v) => Math.min(40, Math.max(10, +v * 10)); // 3 dégâts → 30
    let m;
    if (cat === 'rune') return mk('energy', 1, { eType: App.battle.RB_DOMAIN[(card.domains || [])[0]] || null });
    if (cat === 'champ de bataille') return mk('stadium', /\+\d\s*⚔/.test(text) ? 20 : 10);
    if (cat === 'equipement') return /deal \d|[-−]\d\s*⚔/.test(text) ? mk('armor', 10) : mk('toolHp', 20);
    if (/\bkill (?:a|an enemy|it)\b|\bkill a unit\b/.test(text)) return mk('power', 40);
    if ((m = text.match(/deal (\d+)/))) return mk('power', k(m[1]));
    if (/\bstun\b|counter a spell|prevent all/.test(text)) return mk('shield', 30);
    if ((m = text.match(/[-−](\d+)\s*⚔/))) return mk('shield', k(m[1]));
    if ((m = text.match(/\+(\d+)\s*⚔/))) return mk('power', k(m[1]));
    if (/return a unit at a battlefield\b.{0,40}owner'?s hand|move an enemy unit|choose an enemy unit/.test(text)) return mk('gust');
    if (/return a friendly unit|move a friendly unit|\brecall\b/.test(text)) return mk('switch');
    if (/\bchannel\b|\bdraw \d|look at the top|\bready\b/.test(text)) return mk('charge');
    return mk('heal', 30);
  }

  /**
   * Effet simplifié d'une carte Disney Lorcana (Action, Chanson, Objet, Lieu) d'après son texte (français, ou anglais) :
   * Encre → +1 énergie ; Lieu → Stade ; bannir un personnage → gros coup ; « infligez N dommages » / « +N ¤ » → dégâts en plus ;
   * « −N ¤ » → protection ; retirer des dommages → soin ; renvoyer un personnage dans la main → Rafale ; épuiser un adversaire →
   * énergie adverse en moins ; piocher / redresser → +1 énergie ; Objet sans effet reconnu → +20 PV max.
   */
  const isLcCard = (card) => !!card && (Array.isArray(card.inks) || card.id === 'INK') && /^(action|objet|lieu|encre)$/.test(norm(card.category));
  function effectOfLC(card) {
    const text = norm(card.text || '').replace(/bannissez cet objet|banish this item/g, ''), cat = norm(card.category);
    const mk = (key, n, extra = {}) => { const [short, desc] = LABEL[key](n); return { key, n, short, desc, ...extra }; };
    const k = (v) => Math.min(40, Math.max(10, +v * 10)); // 3 dommages → 30
    let m;
    if (cat === 'encre') return mk('energy', 1);
    if (cat === 'lieu') return mk('stadium', /\+\d+\s*¤/.test(text) ? 20 : 10);
    if ((m = text.match(/retire\w*(?:-lui)?\s+jusqu'a\s+(\d+)\s+jetons? dommage|remove up to (\d+) damage/))) return /chacun de vos personnages|each of your characters/.test(text) ? mk('healAll', k(m[1] || m[2])) : mk('heal', k(m[1] || m[2]));
    if (/bannissez[- ]le|bannissez-la|et bannissez|bannissez tous|banish (?:chosen|that|all|them|it)/.test(text)) return mk('power', 40);
    if ((m = text.match(/infligez(?:-lui)?\s+(\d+)\s+dommages?|deal (\d+) damage/))) return mk('power', k(m[1] || m[2]));
    if ((m = text.match(/gagne\w*\s+\+(\d+)\s*¤|gets? \+(\d+)\s*¤/))) return mk('power', k(m[1] || m[2]));
    if ((m = text.match(/[-−](\d+)\s*¤/))) return mk('shield', k(m[1]));
    if (/renvoy\w*.{0,60}dans la main de son proprietaire|return .{0,40}to (?:their|its) (?:player|owner)'?s hand/.test(text)) return mk('gust');
    if (/personnage adverse et epuisez|epuisez-le|exert chosen opposing/.test(text)) return mk('strip', 1);
    if (/piochez|regardez les \d+ premieres|redressez|draw (?:a|\d) cards?|look at the top|ready chosen/.test(text)) return mk('charge');
    if (cat === 'objet') return mk('toolHp', 20);
    return mk('heal', 30);
  }

  /**
   * Effet simplifié d'une carte Yu-Gi-Oh! (Magie, Piège) : cartes célèbres par leur nom (français ou anglais), sinon d'après leur
   * texte (français de YGOPRODeck) et leur genre : Terrain → Stade ; Équipement → +20 PV max ; détruire des monstres → gros coup ;
   * « gagne N ATK » → dégâts en plus ; Piège qui arrête une attaque → protection ; Invocation depuis le Cimetière → Réanimation ;
   * renvoyer / changer de position → Rafale ; gagner des LP → soin ; piocher → +1 énergie ; Piège quelconque → protection.
   */
  const isYgCard = (card) => !!card && card.passcode != null && /^carte (magie|piege)$/.test(norm(card.category));
  const YG_BY_NAME = {
    'pot de cupidite': ['charge'], 'pot of greed': ['charge'], polymerisation: ['charge'], polymerization: ['charge'], 'destruction de carte': ['charge'], 'card destruction': ['charge'],
    'trou noir': ['power', 40], 'dark hole': ['power', 40], raigeki: ['power', 40], fissure: ['power', 30], hinotama: ['power', 20], 'charge intrepide': ['power', 30], 'rush recklessly': ['power', 30],
    'monster reborn': ['revive'], 'renaissance du monstre': ['revive'], 'appel de l\'etre hante': ['revive'], 'call of the haunted': ['revive'],
    'force de miroir': ['shield', 40], 'mirror force': ['shield', 40], waboku: ['shield', 40], 'annulation d\'attaque': ['shield', 40], 'negate attack': ['shield', 40],
    'cylindre magique': ['shield', 30], 'magic cylinder': ['shield', 30], 'epees de revelation de la lumiere': ['shield', 30], 'swords of revealing light': ['shield', 30], 'chapeaux magiques': ['shield', 30], 'magical hats': ['shield', 30],
    trappe: ['power', 30], 'trap hole': ['power', 30], 'medicament rouge': ['heal', 30], 'red medicine': ['heal', 30], 'dian keto le maitre guerisseur': ['heal', 50], 'dian keto the cure master': ['heal', 50],
    'guerison de monstre': ['fullHeal'], 'monster recovery': ['fullHeal'], 'typhon d\'espace mystique': ['strip', 1], 'mystical space typhoon': ['strip', 1], 'le livre de la lune': ['gust'], 'book of moon': ['gust'],
  };
  function effectOfYG(card) {
    const text = norm(card.text || ''), cat = norm(card.category), kind = norm(card.race), trap = /piege/.test(cat);
    const mk = (key, n, extra = {}) => { const [short, desc] = LABEL[key](n); return { key, n, short, desc, ...extra }; };
    const k = (v) => Math.min(40, Math.max(10, Math.round(+v / 25 / 10) * 10)); // 500 ATK → 20, 1000 → 40
    const known = YG_BY_NAME[norm(card.name)] || YG_BY_NAME[norm(card.nameEn)];
    if (known) return mk(known[0], known[1]);
    let m;
    if (kind === 'field') return mk('stadium', /gagne\w* \d+ (?:d')?atk|gain \d+ atk/.test(text) ? 20 : 10);
    if (kind === 'equip') return mk('toolHp', 20);
    if (/detruisez tous les monstres|detruisez \d+ monstres?|detruisez[- ]le|destroy all monsters|destroy (?:1|that|target) monster/.test(text)) return trap ? mk('shield', 40) : mk('power', 40);
    if ((m = text.match(/gagne\w*\s+(\d+)\s+(?:d')?atk|gains?\s+(\d+)\s+atk/))) return mk('power', k(m[1] || m[2]));
    if (/(?:cimetiere|graveyard).{0,80}invoqu|invoqu\w* specialement.{0,60}cimetiere|special summon.{0,60}graveyard/.test(text)) return mk('revive');
    if ((m = text.match(/gagnez\s+(\d+)\s+(?:lp|points de vie)|gain\s+(\d+)\s+(?:lp|life points)/))) return mk('heal', Math.min(50, k(m[1] || m[2])));
    if (/annulez l'attaque|negate (?:the|an) attack|terminez la battle phase|end the battle phase/.test(text)) return mk('shield', 40);
    if (/renvoyez .{0,60}main|return .{0,40}to the hand|changez .{0,40}position|change .{0,40}battle position/.test(text)) return mk('gust');
    if ((m = text.match(/perd\w*\s+(\d+)\s+(?:d')?atk|loses?\s+(\d+)\s+atk/))) return mk('shield', k(m[1] || m[2]));
    if (/piochez|draw \d|draw (?:1|2) cards?/.test(text)) return mk('charge');
    if (kind === 'counter' || trap) return mk('shield', 20);
    return mk('heal', 30);
  }

  /**
   * Effet simplifié d'une carte Final Fantasy (Invocation, Soutien, Cristal, Monstre sans force) d'après son texte français :
   * Cristal → +1 énergie ; détruire un Avant → gros coup ; « infligez-lui N points de dégâts » / « +N de force » → dégâts en plus ;
   * « ne peut pas être détruit » / dégâts réduits → protection ; renvoyer dans la main → Rafale ; dullez / gelez → énergie adverse
   * en moins ; Break Zone → terrain → Réanimation ; piocher / activer → +1 énergie ; Soutien sans effet reconnu → +20 PV max.
   */
  const isFfCard = (card) => !!card && (Array.isArray(card.elements) || card.kind === 'cr') && /^(invocation|soutien|cristal|monstre)$/.test(norm(card.category));
  function effectOfFF(card) {
    const text = norm(card.text || '').replace(/^ex burst\s*/, ''), cat = norm(card.category);
    const mk = (key, n, extra = {}) => { const [short, desc] = LABEL[key](n); return { key, n, short, desc, ...extra }; };
    const k = (v) => Math.min(40, Math.max(10, Math.round(+v / 2000) * 10)); // 4000 dégâts → 20, 8000 → 40
    let m;
    if (cat === 'cristal') return mk('energy', 1);
    if (/detruisez-le|detruisez-les|detruisez tous les avants|break (?:it|them|all forwards)/.test(text) && !/soutien de cout/.test(text)) return mk('power', 40);
    if ((m = text.match(/infligez(?:-lui|-leur)?\s+(\d{3,5})\s+points? de degats|deal (?:it |them )?(\d{3,5}) damage/))) return mk('power', k(m[1] || m[2]));
    if ((m = text.match(/gagne\w*\s+\+(\d{3,5})\s+de force|gains? \+(\d{3,5}) power/))) return mk('power', k(m[1] || m[2]));
    if (/ne peut pas etre detruit|reduisez les degats|ne recoit pas de degats|cannot be broken|damage .{0,30}is reduced/.test(text)) return mk('shield', 30);
    if (/renvoyez[- ]\w*.{0,50}dans la main|return .{0,40}to (?:its|their) owner'?s hand/.test(text)) return mk('gust');
    if (/break zone.{0,80}sur le terrain|de votre break zone|from your break zone onto the field/.test(text)) return mk('revive');
    if (/dullez[- ]l|gelez[- ]l|dull (?:it|them)|freeze (?:it|them)/.test(text)) return mk('strip', 1);
    if (/piochez|activez[- ]l|draw \d|draw (?:1|2) cards?|activate (?:it|them)/.test(text)) return mk('charge');
    if (cat === 'soutien') return mk('toolHp', 20);
    return mk('heal', 30);
  }

  /** Effet simplifié d'une carte Dresseur / Énergie (fiche TCGdex), ou d'une carte One Piece / Riftbound / Lorcana / Yu-Gi-Oh! / Final Fantasy */
  function effectOf(card) {
    if (isFfCard(card)) return effectOfFF(card); // (avant les autres : « Monstre » existe aussi chez Yu-Gi-Oh!, qui a un passcode)
    if (isYgCard(card)) return effectOfYG(card);
    if (isLcCard(card)) return effectOfLC(card); // (avant One Piece : « Lieu » existe dans les deux jeux)
    if (isOpCard(card)) return effectOfOP(card);
    if (isRbCard(card)) return effectOfRB(card);
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
    if (/^https:\/\/cmsassets\.rgpub\.io\//.test(card.image || '')) return App.games.get('riftbound').img.card(card, 'high'); // Riftbound : visuel relayé (réduit)
    if (/^https:\/\/api\.lorcana\.ravensburger\.com\//.test(card.image || '')) return App.games.get('lorcana').img.card(card, 'high'); // Lorcana : visuel relayé (réduit)
    if (/^https:\/\/images\.ygoprodeck\.com\//.test(card.image || '')) return App.games.get('yugioh').img.card(card, 'high'); // Yu-Gi-Oh! : visuel relayé (réduit)
    if (/^https:\/\/fftcg\.cdn\.sewest\.net\//.test(card.image || '')) return App.games.get('finalfantasy').img.card(card, 'high'); // Final Fantasy : visuel relayé
    if (/^https:\/\/tcgplayer-cdn\.tcgplayer\.com\/product\/\d+_in_1000x1000\.jpg$/.test(card.image || '')) return card.image.replace('_in_1000x1000', '_400w'); // (promo Final Fantasy)
    if (card.image) return `${card.image}/high.webp`;
    const m = String((card.set && (card.set.symbol || card.set.logo)) || '').match(/assets\.tcgdex\.net\/[a-z-]+\/([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)\/(?:logo|symbol)/);
    return m && card.localId ? `https://assets.tcgdex.net/en/${m[1]}/${m[2]}/${encodeURIComponent(card.localId)}/high.webp` : '';
  }
  /** Carte du sac prête pour le combat (img peut être ta photo ; imgOff = visuel officiel, envoyé à l'adversaire) */
  function bagCard(card, extra = {}) {
    return { uid: Math.random().toString(36).slice(2, 9), id: card.id, name: card.name, img: offImg(card), imgOff: offImg(card), energy: /energ|^don|^rune$|^encre$|^cristal$/.test(norm(card.category)), fx: effectOf(card), used: false, ...extra };
  }
  // carte DON!! One Piece : absente des listes de Bandai, on la dessine (img/combat/don.svg)
  const DON_IMG = 'img/combat/don.svg';
  const donCard = (extra = {}) => bagCard({ id: 'DON', name: 'DON!!', category: 'DON!!', image: '' }, { img: DON_IMG, imgOff: DON_IMG, ...extra });
  // encre Lorcana (v3.21) : pas de carte d'énergie dans ce jeu (n'importe quelle carte va dans la réserve d'encre) → on la dessine
  const INK_IMG = 'img/combat/encre-lorcana.svg';
  const inkCard = (extra = {}) => bagCard({ id: 'INK', name: 'Encre', category: 'Encre', image: '' }, { img: INK_IMG, imgOff: INK_IMG, ...extra });
  // Cristal Final Fantasy (v3.43) : la vraie carte « C-001 » (visuel officiel), ajoutée d'office à la pioche perso comme l'encre Lorcana
  const crystalCard = (extra = {}) => bagCard({ id: 'c-001', name: 'Cristal', category: 'Cristal', kind: 'cr', elements: [], image: 'https://fftcg.cdn.sewest.net/images/cards/full/C-001_fr.jpg' }, extra);
  /** Cartes du sac à partir de leurs numéros (ordinateur, prêt) ; « DON » = carte DON!!, « INK » = encre Lorcana */
  const loadBag = (ids, game, extra = {}) => Promise.all(ids.map((id) => (id === 'DON' ? Promise.resolve(donCard(extra)) : id === 'INK' ? Promise.resolve(inkCard(extra))
    : App.games.get(game || 'pokemon').getCard(id).then((c) => bagCard(c, extra)).catch(() => null)))).then((l) => l.filter(Boolean));

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
  // One Piece : Guard Point / Repel (protection), Four Thousand-Brick Fist / Hound Blaze (puissance), Straw Sword (DON!! adverse en moins),
  // Thousand Sunny (Lieu), Sables (Rafale), Gum-Gum Jet Pistol (gros coup), You Can Be My Samurai!! (+1 DON!!), puis des DON!!
  const AI_BAGS_OP = [
    [['ST01-014', 2]],
    [['ST01-014', 2], ['OP05-020', 1]],
    [['ST01-014', 2], ['OP05-020', 1], ['ST02-017', 1], ['ST01-017', 1]],
    [['ST02-016', 1], ['ST01-014', 1], ['OP05-057', 2], ['ST02-017', 1], ['ST03-015', 1], ['ST01-017', 1]],
    [['ST02-016', 2], ['OP05-057', 2], ['ST01-015', 1], ['ST02-017', 1], ['ST03-015', 1], ['OP01-055', 1]],
  ];
  // Riftbound (Origins) : Hextech Ray / Void Seeker / Falling Comet (dégâts), Discipline / Primal Strength (+⚔), Rune Prison (étourdir),
  // Rebuke (Rafale), Vengeance (gros coup), Mobilize (+1 énergie), Targon's Peak (champ de bataille), puis des runes du domaine
  const rb = (n) => `ogn-${String(n).padStart(3, '0')}-298`;
  const AI_BAGS_RB = [
    [[rb(9), 2]],
    [[rb(9), 2], [rb(58), 1]],
    [[rb(9), 2], [rb(58), 1], [rb(50), 1], [rb(172), 1]],
    [[rb(24), 1], [rb(9), 1], [rb(58), 2], [rb(50), 1], [rb(172), 1], [rb(289), 1]],
    [[rb(85), 2], [rb(154), 2], [rb(50), 1], [rb(229), 1], [rb(172), 1], [rb(134), 1]],
  ];
  const RUNE_OF = { fire: rb(7), grass: rb(42), water: rb(89), fighting: rb(126), psychic: rb(166), lightning: rb(214) };
  const runeFor = (type) => RUNE_OF[type] || rb(7);
  // Lorcana (Premier Chapitre) : Lueur réparatrice / Fleur aux pétales d'or (soin), Hakuna Matata (soin de tous), Il a un sabre ! (+2 ¤),
  // Très mauvais caractère ! (−2 ¤), Gel (épuiser), Fracasser ! (3 dommages), Feu du dragon (bannir), Emberlificotage (renvoyer),
  // Mes amis de l'au-delà (piocher), puis de l'encre
  const lc = (n) => `1-${n}`;
  const AI_BAGS_LC = [
    [[lc(28), 2]],
    [[lc(28), 2], [lc(132), 1]],
    [[lc(28), 2], [lc(132), 1], [lc(26), 1], [lc(63), 1]],
    [[lc(169), 1], [lc(28), 1], [lc(200), 2], [lc(26), 1], [lc(62), 1], [lc(63), 1]],
    [[lc(169), 2], [lc(200), 2], [lc(130), 1], [lc(27), 1], [lc(62), 1], [lc(64), 1]],
  ];
  // Yu-Gi-Oh! (premières séries) : Médicament Rouge / Dian Keto (soin), Charge Intrépide (+ATK), Épées de Révélation de la Lumière /
  // Force de Miroir / Waboku (protection), Typhon d'Espace Mystique (énergie adverse en moins), Le Livre de la Lune (Rafale),
  // Trou Noir / Raigeki (gros coup), Monster Reborn (Réanimation), Sogen (Terrain) ; pas de carte d'énergie : Pot de Cupidité (+1 énergie)
  const AI_BAGS_YG = [
    [['LOB-E043', 2]],
    [['LOB-E043', 2], ['MRL-E043', 1]],
    [['LOB-E043', 2], ['MRL-E043', 1], ['LOB-E081', 1], ['MRL-E047', 1]],
    [['SDY-E021', 1], ['LOB-E043', 1], ['MRL-E043', 2], ['SDY-E036', 1], ['PGD-035', 1], ['LOB-E038', 1]],
    [['SDY-E021', 2], ['LOB-E041', 1], ['MRD-E138', 1], ['LOB-E096', 1], ['PGD-035', 1], ['MRL-E047', 1], ['LOB-E042', 1]],
  ];
  // Final Fantasy (Opus I) : Ifrit / Shiva / Brynhildr (dégâts), Golem (+force), Titan (protection), Shiva « Gelez-le » (énergie adverse
  // en moins), Léviathan (Rafale), Odin / Bahamut (gros coup), Fée / Mog (piocher), puis des Cristaux (c-001 : la carte d'énergie du jeu)
  const ff = (n) => `1-${String(n).padStart(3, '0')}`;
  const AI_BAGS_FF = [
    [[ff(4), 2]],
    [[ff(4), 2], [ff(106), 1]],
    [[ff(4), 2], [ff(106), 1], [ff(110), 1], [ff(38), 1]],
    [[ff(23), 1], [ff(39), 1], [ff(106), 2], [ff(110), 1], [ff(178), 1], [ff(170), 1]],
    [[ff(23), 2], [ff(124), 1], [ff(18), 1], [ff(110), 1], [ff(178), 1], [ff(38), 1], [ff(172), 1]],
  ];
  const many = (list) => list.flatMap(([id, n]) => Array(n).fill(id));
  const aiBag = (level, type, game) => (game === 'finalfantasy' ? [...many(AI_BAGS_FF[level - 1]), ...Array(AI_ENERGY[level - 1]).fill('c-001')]
    : game === 'yugioh' ? [...many(AI_BAGS_YG[level - 1]), ...Array(AI_ENERGY[level - 1]).fill('LOB-119')]
    : game === 'onepiece'
    ? [...many(AI_BAGS_OP[level - 1]), ...Array(AI_ENERGY[level - 1]).fill('DON')]
    : game === 'riftbound' ? [...many(AI_BAGS_RB[level - 1]), ...Array(AI_ENERGY[level - 1]).fill(runeFor(type))]
      : game === 'lorcana' ? [...many(AI_BAGS_LC[level - 1]), ...Array(AI_ENERGY[level - 1]).fill('INK')]
        : [...many(AI_BAGS[level - 1]), ...Array(AI_ENERGY[level - 1]).fill(energyFor(type))]);
  // deck de prêt (8 cartes) : 2 Potion, PlusPower, Défenseur, Transfert, 3 Énergies
  // (One Piece : 2 Guard Point, Four Thousand-Brick Fist, You Can Be My Samurai!!, Sables, 3 DON!! ;
  //  Riftbound : 2 Hextech Ray, Discipline, Rune Prison, Retreat, 3 runes ;
  //  Lorcana : 2 Lueur réparatrice, Il a un sabre !, Très mauvais caractère !, Emberlificotage, 3 encres)
  //  Yu-Gi-Oh! : 2 Médicament Rouge, Charge Intrépide, Épées de Révélation de la Lumière, Le Livre de la Lune, 3 Pot de Cupidité ;
  //  Final Fantasy : 2 Ifrit, Golem, Titan, Léviathan, 3 Cristaux)
  const loanBag = (type, game) => (game === 'finalfantasy' ? [...many([[ff(4), 2], [ff(106), 1], [ff(110), 1], [ff(178), 1]]), 'c-001', 'c-001', 'c-001']
    : game === 'yugioh' ? [...many([['LOB-E043', 2], ['MRL-E043', 1], ['LOB-E081', 1], ['PGD-035', 1]]), 'LOB-119', 'LOB-119', 'LOB-119']
    : game === 'onepiece'
    ? [...many([['ST01-014', 2], ['OP05-020', 1], ['OP01-055', 1], ['ST03-015', 1]]), 'DON', 'DON', 'DON']
    : game === 'riftbound' ? [...many([[rb(9), 2], [rb(58), 1], [rb(50), 1], [rb(104), 1]]), ...Array(3).fill(runeFor(type))]
      : game === 'lorcana' ? [...many([[lc(28), 2], [lc(132), 1], [lc(26), 1], [lc(62), 1]]), 'INK', 'INK', 'INK']
      : [...many([['base1-94', 2], ['base1-84', 1], ['base1-80', 1], ['base1-95', 1]]), ...Array(3).fill(energyFor(type))]);
  // v3.00 : pioche plus lente (2 cartes au départ, 1 tous les 2 tours, 4 en main au plus)
  const DECK_MAX = 10, HAND_START = 2, DRAW_EVERY = 2, HAND_MAX = 4;

  /** Effet reconstruit à partir de sa clé (cartes reçues d'un ami : on ne garde pas ses textes) */
  function fxOf(key, n, eType) {
    if (typeof key !== 'string' || !Object.prototype.hasOwnProperty.call(LABEL, key)) return null;
    const [short, desc] = LABEL[key](n);
    return { key, n, short, desc, ...(eType ? { eType } : {}) };
  }

  return { effectOf, isOpCard, isRbCard, isLcCard, isYgCard, isFfCard, bagCard, donCard, inkCard, crystalCard, loadBag, DON_IMG, INK_IMG, offImg, playable, aiCard, aiBag, loanBag, norm, fxOf, DECK_MAX, HAND_START, DRAW_EVERY, HAND_MAX };
})();
