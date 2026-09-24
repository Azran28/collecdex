/*
 * Registre des « collections » disponibles.
 *
 * Chaque jeu (ou plus tard : figurines, Funko, pièces…) est un « adaptateur »
 * qui sait fournir, dans un format commun :
 *   - listSets()            → toutes les séries  [{ id, name, logo, symbol, total, official, releaseDate, group:{id,name,logo} }]
 *   - getSet(id)            → une série + ses éléments [{ id, localId, name, image, rarity, ... }]
 *   - getCard(id)           → le détail d'un élément (prix, illustrateur, etc.)
 *   - rarity                → { rank(r), symbol(r), label(r) }
 *   - pullRates(setId)      → taux de drop connus (avec source), ou null
 *
 * Ajouter un nouveau jeu = écrire un nouvel adaptateur et l'enregistrer ici.
 */
App.games = (() => {
  const list = [
    { id: 'pokemon', name: 'Pokémon', icon: '⚡', status: 'actif', desc: 'Toutes les séries du JCC Pokémon, en français, avec les prix Cardmarket.' },
    { id: 'onepiece', name: 'One Piece', icon: '🏴‍☠️', status: 'bientôt', desc: 'OP01 → OP14 et plus.' },
    { id: 'magic', name: 'Magic: The Gathering', icon: '🧙', status: 'bientôt', desc: 'Données Scryfall (prix inclus).' },
    { id: 'yugioh', name: 'Yu-Gi-Oh!', icon: '🐉', status: 'bientôt', desc: 'Données YGOPRODeck (prix inclus).' },
    { id: 'lorcana', name: 'Disney Lorcana', icon: '✨', status: 'bientôt', desc: '' },
    { id: 'autres', name: 'Et au-delà…', icon: '🧸', status: 'plus tard', desc: 'Figurines, Funko Pop, pièces, jeux vidéo : tout ce qui se collectionne en « X / Y ».' },
  ];
  const adapters = {};
  return {
    list,
    register(id, adapter) { adapters[id] = adapter; },
    get(id) { return adapters[id]; },
    info(id) { return list.find((g) => g.id === id); },
  };
})();
