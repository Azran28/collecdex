/*
 * Cartes « hors-série » : cartes officielles qui n'appartiennent à aucune série (concours, tournois, prototypes).
 * Il n'existe pas de liste officielle : ce sont des cartes taguées « hors-série », pas une série.
 * Absentes de TCGdex : décrites ici ; visuels dans img/hors-serie/ (provenance dans img/hors-serie/SOURCES.md).
 * Elles se capturent comme les autres : le scanner les ajoute toujours à ses candidates
 * (comparaison avec le visuel + mots-clés lus sur la carte, `keys`).
 */
App.pokemonHorsSerie = (() => {
  const SET_ID = 'hors-serie';
  const SET = { id: SET_ID, name: 'Hors-série', logo: '', symbol: '', releaseDate: '1997-01-01', cardCount: { total: 5, official: 5 }, serie: { id: SET_ID, name: 'Hors-série' } };
  const card = (o) => ({
    category: 'Dresseur', rarity: 'Promo', types: [], hp: null, atk: [],
    variants: { normal: false, reverse: false, holo: true, firstEdition: false },
    set: SET, setId: SET_ID, serieId: SET_ID, tags: ['hors-serie'], ...o,
  });
  const CARDS = [
    card({ id: 'hors-serie-illustrator', localId: 'HS1', name: 'Pikachu Illustrator', image: 'img/hors-serie/illustrator', illustrator: 'Atsuko Nishida',
      origin: 'Prix du concours d’illustration du magazine CoroCoro (Japon, 1998)', copies: 'une quarantaine d’exemplaires connus', year: 1998,
      keys: ['illustrator', 'illustrateur'] }),
    card({ id: 'hors-serie-trophee1', localId: 'HS2', name: 'Pikachu Trophée No.1 (or)', image: 'img/hors-serie/trophee1', illustrator: 'Mitsuhiro Arita',
      origin: 'Remise aux vainqueurs du 1er tournoi officiel japonais (1997)', copies: 'quelques exemplaires', year: 1997, keys: ['trainer no 1', 'no 1'] }),
    card({ id: 'hors-serie-trophee2', localId: 'HS3', name: 'Pikachu Trophée No.2 (argent)', image: 'img/hors-serie/trophee2', illustrator: 'Mitsuhiro Arita',
      origin: 'Remise aux 2es du 1er tournoi officiel japonais (1997)', copies: 'quelques exemplaires', year: 1997, keys: ['trainer no 2', 'no 2'] }),
    card({ id: 'hors-serie-trophee3', localId: 'HS4', name: 'Pikachu Trophée No.3 (bronze)', image: 'img/hors-serie/trophee3', illustrator: 'Mitsuhiro Arita',
      origin: 'Remise aux 3es du 1er tournoi officiel japonais (1997)', copies: 'quelques exemplaires', year: 1997, keys: ['trainer no 3', 'no 3'] }),
    card({ id: 'hors-serie-kangourex', localId: 'HS5', name: 'Kangourex Trophée famille', category: 'Pokémon', types: ['Incolore'], hp: 80, image: 'img/hors-serie/kangourex', illustrator: 'Ken Sugimori',
      origin: 'Remise aux gagnants du tournoi parent-enfant « Family Event » (Japon, 1998)', copies: 'quelques dizaines d’exemplaires', year: 1998, keys: ['lv 38', 'lv38', 'hp80', 'sugimori'],
      // attaques (au format TCGdex : le combat s'en sert) : Ultimapoing 30, et 2 pièces × 10
      attacks: [{ cost: ['Incolore'], name: 'Poing Piou-Piou', effect: 'Lancez 2 pièces. Cette attaque inflige 10 dégâts multipliés par le nombre de côtés face.', damage: '10×' },
        { cost: ['Incolore', 'Incolore', 'Incolore'], name: 'Ultimapoing', damage: 30 }],
      weaknesses: [{ type: 'Combat', value: '×2' }], resistances: [{ type: 'Psy', value: '-30' }], retreat: 3,
      atk: [['Poing Piou-Piou', '10×'], ['Ultimapoing', '30']] }),
  ];
  const byId = new Map(CARDS.map((c) => [c.id, c]));
  const LOCAL = /^img\/hors-serie\/[a-z0-9-]+$/;
  return {
    SET_ID, SET, CARDS,
    has: (id) => byId.has(id),
    get: (id) => byId.get(id) || null,
    isSet: (id) => id === SET_ID,
    /** visuel local (adresse complète : marche aussi depuis le Web Worker de la vérification par l'image) */
    isLocalImage: (s) => typeof s === 'string' && LOCAL.test(s),
    imgUrl: (s) => new URL(`${s}.jpg`, location.href).href,
    /** la série telle que getSet la renvoie (pour la page des cartes hors-série et le scanner) */
    asSet: () => ({
      id: SET_ID, name: SET.name, logo: '', symbol: '', releaseDate: SET.releaseDate, total: CARDS.length, official: CARDS.length,
      group: SET.serie, rarityInfoMissing: true,
      cards: CARDS.map((c) => ({ id: c.id, localId: c.localId, name: c.name, image: c.image, rarity: c.rarity, category: c.category, types: c.types, illustrator: c.illustrator, hp: c.hp, variants: c.variants, atk: c.atk, setId: SET_ID, serieId: SET_ID })),
    }),
    tagged: (c) => !!c && (c.setId === SET_ID || (c.set && c.set.id === SET_ID) || String(c.id || '').startsWith(SET_ID + '-')),
  };
})();
