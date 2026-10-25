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
    { id: 'onepiece', name: 'One Piece', icon: 'anchor', status: 'actif', desc: 'Boosters, decks et promos, en français depuis OP-09.' },
    { id: 'riftbound', name: 'Riftbound', icon: 'rune', status: 'actif', desc: 'Le jeu de cartes League of Legends : toutes les extensions.' },
    { id: 'lorcana', name: 'Disney Lorcana', icon: 'ink', status: 'actif', desc: 'Tous les chapitres, quêtes et promos, en français.' },
    { id: 'yugioh', name: 'Yu-Gi-Oh!', icon: 'pyramid', status: 'actif', desc: 'Toutes les séries TCG, noms en français.' },
    { id: 'finalfantasy', name: 'Final Fantasy', icon: 'crystal', status: 'actif', desc: 'Toutes les séries Opus, promos et cristaux, en français.' },
    { id: 'wankul', name: 'Wankul', icon: 'wankil', status: 'actif', desc: 'Le jeu de Laink et Terracid : toutes les saisons et hors-séries.' },
    { id: 'starwars', name: 'Star Wars Unlimited', icon: 'saber', status: 'actif', desc: 'Toutes les extensions, Hyperspace, Showcase et promos, en français.' },
    { id: 'magic', name: 'Magic: The Gathering', icon: 'sparkles', status: 'bientôt', desc: 'Toutes les extensions, prix inclus.' },
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
