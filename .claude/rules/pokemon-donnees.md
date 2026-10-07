---
paths:
  - "js/games/pokemon*.js"
  - "js/games/registry.js"
  - "js/views/hors-serie.js"
  - "js/views/set.js"
  - "js/views/sets.js"
  - "js/views/card.js"
---
# Adaptateur Pokémon (`js/games/pokemon.js` + `pokemon-rarity.js`, `pokemon-pullrates.js`)
- Données TCGdex (REST + GraphQL, FR, prix Cardmarket). `retryFetch` pour l'API (en-tête CORS parfois en double). `CARD_FIELDS` inclut `hp`, `attacks { name damage } abilities { name }` → `card.atk` ; `normCard` gère une attaque `null` (sinon `search` retombait sur REST sans attaques). Cache des séries `pk6` (à augmenter si les champs changent).
- **Séries seulement en anglais (v2.28)** : 21 séries / 1 235 cartes absentes en français (Arceus pl4, Base Set 2, Gym Heroes/Challenge, Legendary Collection, Skyridge, Team Rocket Returns, Legendary Treasures, POP 5/6/8…). `listSets` (cache `pk3`) les ajoute (`enOnly: true`, groupe français) ; `langFor` → 'en', `img.card` ne réécrit pas leur langue, `search` interroge aussi l'anglais pour elles. Pénalité 0,35 dans `rank`.
- **Langue par série** : `App.settings.setLangs = { idSérie: 'en' }` (synchronisé) ; `langFor(setId)` dans `getSet`/`getCard`, langue de l'URL d'image réécrite dans `img.card`. Les cartes japonaises sont d'autres séries chez TCGdex (`PMCG1`, `SV1V`) : pas de bouton JP. `item.lang` (`App.col.langOf(it)`, 'fr' par défaut) : `img.card` privilégie `c.lang` ; étiquette `.langchip` si elle diffère. Prix Cardmarket identiques fr/en.
- Les anciennes holos sont notées « Rare » par TCGdex : une carte qui n'existe qu'en holo est traitée comme holo.
- **Cartes hors-série (v2.72)** : `App.pokemonHorsSerie` (`pokemon-hors-serie.js`, chargé avant `pokemon.js`) : cartes au format TCGdex (ids `hors-serie-…`, `setId: 'hors-serie'`, `tags: ['hors-serie']`, `origin`, `copies`, `keys` = mots-clés lus par l'OCR), visuels `img/hors-serie/<nom>.jpg` (`SOURCES.md`). Adaptateur : `getCard`/`getSet('hors-serie')` (pas dans `listSets`), `search` les ajoute, `horsSerie()`, `isHorsSerie(c)`. Scanner (`findCandidates`) : toujours candidates ; `_hint` (+0,8 mot-clé lu, +0,5 si `wholeCardScores` ≥ 0,5 et 0,08 d'avance) ; sans indice, gardées seulement si ressemblance ≥ 0,7. `friends.js`/`duel.js`/`battleCards.offImg` acceptent ces visuels. Page `#/jeu/pokemon/hors-serie`.
- Prix en dollars (TCGplayer) : voir `collection.md`.
