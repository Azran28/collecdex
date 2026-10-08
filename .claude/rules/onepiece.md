---
paths:
  - "js/games/onepiece*.js"
  - "js/games/registry.js"
  - "js/views/scan.js"
  - "js/views/sets.js"
  - "js/views/set.js"
---
# One Piece (v2.85, `js/games/onepiece.js`, 2ᵉ licence)

## Données
- « Punk Records » (`raw.githubusercontent.com/buhbbl/punk-records/main/{french|english}/` : `packs.json`, `index/cards_by_id.json` = index des deux langues gardé 3 jours en `op1:index`, `data/<pack>.json` = cartes d'une série, `op1:<lang>:set:<id>`), copie du site officiel de Bandai ; français depuis OP-09, anglais avant (`enOnly`).
- **Id d'une carte = son code imprimé** (`OP09-004`, parallèle `_p1`, réimpression au même dessin `_r1` = `SUFFIX`), unique dans une langue ; `localId` affiché « OP09-004 P1 » ; id de série = étiquette (`OP-09`, `OP14-EB04`, `ST-15`, `EB-02`, `PRB-01`, `PROMO`, `AUTRES`) ; groupes `op-booster/op-extra/op-deck/op-promo` ; pas de date → `sortKey` (utilisé par `sets.js` et `fillSetSelect`) ; « numérotées » = `isOfficial` (utilisé par `collection.progress`, `set.js`, `goals.js`).
- Holo = rareté (`FOIL` : R (v2.93), SR, SEC, SP, TR, parallèle → `variants: { holo }`, sinon `{ normal }`, cache `op3`).
- **Images** : Bandai envoie `Cross-Origin-Resource-Policy: same-site` → `img.card` les fait passer par `images.weserv.nl/?url=…&w=360|720&output=webp` (CORS ok : comparaison d'images possible ; gardées par `sw.js`) ; toutes portent « SAMPLE » (règle de Bandai). `fetchImage` : 10 s max pour images.weserv.nl.
- Visuel de série (v2.86) : `img.logo(s)` = `…/renewal/images/products/{boosters|decks}/<op09|st15|op14-eb04>/img_item01.webp` via le relais, avec `default=` = la même image dans l'autre langue (relayée aussi), sinon `logoText` (`img[data-prod]`, `.logo-code`).
- **Prix** : `optcgapi.com/api/sets|decks/<id>/`, `allPromos` (marché TCGplayer, USD, `card_image_id`), 1 jour. CSP : `optcgapi.com` et `images.weserv.nl`.
- Progression par rareté : `<details class="rp-box">` (`localStorage.rpOpen`, repliée par défaut sur téléphone). Fiche : `#cd-holo.cd-loading` + petite image puis grande. Explorer : `App.views.sets.gamePick(game)`, dernière licence dans `localStorage['cdx-game']`.
- Combats (v2.94) : Personnages et Leaders dans les decks (`battle.fighterOP` / `fighterOf`, `match.js › adOf`, `FIGHT_GAMES`). Capsules : Pokémon seulement. Badges : 4 One Piece.

## Reconnaissance (`ad.recognize(blob)`, carte seule)
- `App.recognizer.readZones(blob, zones)` (zones du bas : code en bas à droite, nom), `codesIn` = lecture tolérante avec poids (`digitsOf` : « g/s » → 9 ou 5…), codes existants, vérification par le nom (`names()`), code corrigé par le nom (même numéro), puis `resemblanceMany(blob, cards, urlOf)` (160 px) sur ≤ 40 candidates + toutes les versions du même numéro des 3 plus proches ; « sûre » = code confirmé ET illustration nettement devant (jamais si une réimpression a le même dessin). Vérification par l'image dès le début (`visual.md`).
- **v2.87, vraies photos d'Arnaud** (`_tests-scanner/One piece/`, `réponses.txt`) : code lu seulement en bandes serrées ×8 (`CODE_ZONES`), `CODE_RE` en `String.raw` (sinon les `s` sont perdus dans le gabarit), préfixe `©P`/`(P`…, badge collé accepté ; `recognize(…, { original })` = photo d'origine (`pageBlob`) → `otherCrops` (cutCard, puis photo entière avec `SLIDE_ZONES`) ; DON!! → `info.don` (message, pas de propositions) ; bouton `[data-retry]` dans `showCandidates`. `info.crop` = cadrage qui a vraiment montré le code, il remplace la photo. Point faible : photo floue d'un personnage aux dizaines de cartes (Zoro, Luffy) sans code lisible. Panneau du navigateur masqué → taille d'image nulle au recadrage (artefact de test).
- **`scan.js` par licence (v2.88)** : `batch` (`game`, `isPk()`, `readCard(blob, hint, st, orig)`, état `don`, `guessSeries`/`visualPass`/`measureVers` seulement Pokémon, `cell.orig` = photo d'origine en rafale) ; `single` : `game` variable (puces `.sc-game`, `?jeu=onepiece`, `sessionStorage.scanGame`), `switchGame` si une carte One Piece est lue en mode Pokémon (`info.otherGame`). `readSummary` accepte `info.read`. Série de la page et recherche à la main One Piece depuis v2.95.
- Import : `importer.js › matchOP` (`row.game`, `row.code`, `row.par` = V.2 / Parallel / Alternate Art).
- **Dos One Piece (v2.97)** : le score de dos (`backScoreOf`) ne sépare pas le dos bleu uni des faces ternes (Événement en pochette 0,61 ; vrais dos 0,53–0,58) → en classeur / rafale (`recogOne`), une case One Piece qui ressemble à un dos est quand même lue, « dos » seulement si rien n'est reconnu (ni sûre, ni code lu, ni image ≥ 25). Pokémon : dos sûr (0,71–0,80 contre ≤ 0,47), inchangé. Page de test : `_tests-scanner/op/capture_page1.webp` (OP10-056…064, page dans la capture d'écran : x 28, y 578, 844 × 1122) — 9/9.
- **Classeur (v3.02)** : `recognize(…, { context })` = la case et ses alentours (+20 %). `visualPass(blob, cands, codes, context)` : reconnaissance sur la case (plus large, les voisines gênent MobileNet : Sanji de la page 1 pris pour L'Oiseau), vrais bords pris dans `context` (`App.visual.cropOn`), `check(context)` seulement si la case n'est pas sûre. Code illisible mais image ≥ 25 (jumelle) : code relu sur `e.crop` avant `otherCrops`. `NOT_DON` : texte d'Événement (« 1 carte DON!! redressée ») ≠ carte DON!!. Page de test 2 : `_tests-scanner/op/page2.webp` (OP10-075…083), banc `_tests-scanner/op-page.js` (`__opPage(chemin)`).
