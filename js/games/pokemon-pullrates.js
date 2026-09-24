/*
 * Taux de drop (« pull rates ») Pokémon.
 *
 * The Pokémon Company ne publie PAS de taux officiels. Les chiffres ci-dessous
 * viennent d'études publiques d'ouverture de boosters (nombre de boosters indiqué).
 * Ils sont mesurés sur des boosters anglais ; la structure des boosters français est la même.
 *
 * Format : setId TCGdex → { source, url, sample, note, rates: { 'clé rareté': nombre de boosters pour 1 carte } }
 * Pour ajouter une série : copier un bloc, mettre la source et les chiffres vérifiés.
 */
App.pokemonPullRates = {
  'sv03.5': {
    source: 'PokéPatch — données communautaires',
    url: 'https://pokepatch.com/2025/05/15/scarlet-violet-151-pull-rates-in-pokemon-tcg-set/',
    sample: 'plus de 1 000 boosters',
    note: 'Chiffres concordants avec l’étude Card Shop Live (1 728 boosters) à ~10 % près, selon TCGscreener.',
    rates: {
      'Double rare': 8,
      'Illustration rare': 12,
      'Ultra Rare': 16,
      'Special illustration rare': 32,
      'Hyper rare': 51,
    },
  },
  'me02': {
    source: 'TCGplayer — étude interne (relayée par PokéBeach)',
    url: 'https://www.pokebeach.com/2025/11/phantasmal-flames-pull-rates-revealed-chances-of-pulling-mega-charizard-ex',
    sample: 'plus de 5 000 boosters',
    note: 'Méga-Dracaufeu-ex Illustration spéciale rare : environ 1 booster sur 400 selon la même étude.',
    rates: {
      'Double rare': 5,
      'Illustration rare': 9,
      'Ultra Rare': 12,
      'Special illustration rare': 80,
      'Mega Hyper Rare': 1260,
    },
  },
};
