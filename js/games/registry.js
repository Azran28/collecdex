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
    { id: 'pokemon', name: 'Pokémon', icon: 'bolt', status: 'actif', desc: 'Toutes les séries en français, prix Cardmarket.' },
    { id: 'onepiece', name: 'One Piece', icon: 'anchor', status: 'bientôt', desc: 'OP01 → OP14 et plus.' },
    { id: 'magic', name: 'Magic: The Gathering', icon: 'sparkles', status: 'bientôt', desc: 'Toutes les extensions, prix inclus.' },
    { id: 'yugioh', name: 'Yu-Gi-Oh!', icon: 'pyramid', status: 'bientôt', desc: 'Toutes les boîtes, prix inclus.' },
    { id: 'lorcana', name: 'Disney Lorcana', icon: 'star', status: 'bientôt', desc: 'Chapitres 1 et suivants.' },
    { id: 'autres', name: 'Et au-delà…', icon: 'box', status: 'plus tard', desc: 'Figurines, Funko Pop, pièces, jeux vidéo…' },
  ];
  const adapters = {};
  return {
    list,
    register(id, adapter) { adapters[id] = adapter; },
    get(id) { return adapters[id]; },
    info(id) { return list.find((g) => g.id === id); },
  };
})();
