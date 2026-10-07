---
paths:
  - "js/capsules.js"
  - "js/views/capsules.js"
  - "js/pokedex.js"
  - "supabase-v3.sql"
  - "supabase-v5.sql"
---
# Capsules (Pokémon seulement ; absentes de la version Play Store, voir `appli-mobile.md`)
- `supabase-v3.sql` : tables `dex_species` (rareté des 1025 Pokémon), `capsule_state`, `caught` en lecture seule ; `capsule_status`, `capsule_open` (tirage), `capsule_dex`.
- `js/pokedex.js` (`App.pokedex` : noms FR, rareté identique au SQL, visuels PokéAPI `official-artwork`, `img(id)` force un nombre, `family(id)` = évolutions par stades, `EVO`/`EVO_FAR` tirées de PokéAPI ; `speciesModal(id, dex)` montre évolutions + chromatique, grisés « ? » s'ils manquent ; toucher le Pokémon révélé ouvre la capsule suivante ; « Attrapés seulement » visible seulement dans une région).
- `js/capsules.js` (`App.capsules`), `js/views/capsules.js` (`#/capsules`, animation d'ouverture, `pickAvatar`, `setAvatar`). Avatar = `profile.avatarPoke = {id, shiny}` (l'ancienne photo `profile.avatar` reste lue). La capsule est un dessin original (pas de Poké Ball), `capsuleSVG(cls, size, gold)`. Classes d'animation préfixées `co-` (`.reveal` existe déjà).
- **Boutique (`supabase-v5.sql`)** : monnaie **éclats** à l'écran (colonne `coins`) ; `bonus` (capsules achetées, hors limite de 10), `big` ; `capsule_price(tier, shiny)` = 1/3/8/20/100/150 ×5 si chromatique ; `capsule_open(p_kind default 'normal')` (`'grande'` : rare 45 %, très rare 33 %, légendaire 17 %, fabuleux 5 %, chromatique 3 %) ; `capsule_sell`, `capsule_sell_dupes()` (garde 1 normal par espèce, chromatiques jamais vendus), `capsule_buy('capsule'|'grande', n)` (20 / 150 éclats) ; `capsule_log`. Revente moyenne : capsule ≈ 7, grande ≈ 38 (pas de boucle infinie).
- Site : `App.capsules.sell/sellDupes/buy/price/dupes/total`, `state.shop` faux si v5 absent (« il reste une étape »). `.shop-item.can` (dorée pour la grande) seulement si assez d'éclats. Impossible de vendre le dernier exemplaire de son avatar ; confirmation pour le dernier exemplaire, légendaires/fabuleux et chromatiques.
