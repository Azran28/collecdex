---
paths:
  - "js/games/lorcana.js"
  - "js/games/registry.js"
  - "outils/ci/lorcana-cartes.mjs"
  - "outils/ci/prix-lorcana.mjs"
  - "data/lc-cartes.json"
---
# Disney Lorcana (v3.21, `js/games/lorcana.js`, 4ᵉ licence)
Même logique que Riftbound (voir `riftbound.md`) ; ici seulement ce qui diffère. Choisie par Arnaud (17 oct.) parce qu'il a des cartes (session « Licences TCG »).

## Données
- **LorcanaJSON** (`lorcanajson.org/files/current/{fr,en}/allCards.json`, données des applis officielles de Ravensburger) : **noms, textes, séries, raretés en français** ; 10 Mo par langue et **pas de CORS** → `outils/ci/lorcana-cartes.mjs` en fait `data/lc-cartes.json` (**dans le dépôt**, ~1,8 Mo, 470 Ko compressé), relancé chaque lundi par `index.yml` (étape « Liste des cartes Lorcana », `changed` si le fichier change ; fichier inchangé si seule la date diffère). Le site le lit (`index()`, cache `lc1:index` relu à chaque nouvelle `APP_VERSION` ou après 3 jours).
- Format compact : `id, s, o (chapitre d'une promo), l, n, v, st (film), r, t, k (encres), co, iw, sg, wp, lo, mv, sb, x (texte, sections séparées par \n), a, img (chemin après api.lorcana.ravensburger.com/images/), f (1 normale, 2 brillante, 3 les deux), tp (n° TCGplayer), cm (n° Cardmarket), ne (nom anglais si différent), of (total imprimé), enOnly`.
- **Id = `<série>-<numéro>`** : `1-1`, `1-205` (enchantée), `3-4a` (chiots dalmatiens 4a…4e), promos par groupe imprimé (`18/P1 • FR • 2` → `p1-18` ; groupes P1…P4, C1, C2, D23, DIS, PD1, RPH, CC1), quêtes `q1-3`. Ids LorcanaJSON communs aux langues ; 92 promos seulement anglaises (`enOnly`).
- Séries : 14 chapitres (`main`, `base` = total imprimé « /204 », `isOfficial` = numéro ≤ base sans lettre), 3 quêtes, 11 groupes de promos (noms FR dans `PROMO` de l'outil). Nom affiché « Ariel - Sur des jambes humaines ». Raretés FR : Commune, Inhabituelle, Rare, Très rare, Légendaire, Épique, Enchantée, Iconique, Spéciale (clés `c u r sr l e en i p`). Termes FR : « éclat de Lore », force `¤`, volonté, encrier `⬡`, épuiser `⟳`.
- **Images** : visuels officiels **français** (`api.lorcana.ravensburger.com/images/fr/…jpg`, 1468 × 2048 ; **403 si la requête porte un en-tête Origin**, donc jamais lus directement) → `images.weserv.nl/?url=https%3A%2F%2F…` (le `https://` doit être dans l'adresse relayée, sinon 404). Les lieux y sont déjà en hauteur (sens du classeur). `friends.js` / `duel.js` acceptent ces adresses (nom de fichier `24A_…` possible : `[A-Za-z0-9]+`).
- **Visuel de chapitre** : sachet de booster TCGplayer (`PACKS_CROP`, mesuré en ouvrant l'image sur tcgplayer-cdn ; à compléter à chaque chapitre), quêtes / promos = code (« Q1 », « P1 » ; chapitres sans sachet : « Ch. 15 »).
- **Prix** : tcgcsv.com catégorie 71 → `outils/ci/prix-lorcana.mjs` (robot de mise en ligne, chaque matin) → `_site/data/lc-prix.json` `{ m, p: { <n° TCGplayer>: [normal, brillant] } }` (pas dans le dépôt, `.gitignore` ; local → celui du site en ligne). Relié par `tp` : 3 221 cartes sur 3 228 avec un numéro. Lorcast (api.lorcast.com, CORS *, anglais seulement) = autre source possible.

## Reconnaissance
- Code en **bas à gauche** « 1/204 • FR • 1 » (numéro / total, langue, chapitre ; promo « 18/P1 • FR • 2 », quête « 1/31 • FR • Q1 ») → `codesIn` : chapitre lu à la fin, confirmé par le total (`TOTALS`), sinon série devinée par le total seul (poids 0,5) ; un « 25/165 » Pokémon ne donne rien. Zones `CODE_ZONES` (texte blanc sur noir → `invert`/`otsu`), `NAME_ZONES` (nom + version au milieu : les noms FR servent aussi, comme One Piece).
- Vérification par l'image : `data/lc-index` (3 554 cartes, `LC_INDEX_V`), visuels français = même carte que la photo ; `IMG_SURE = 30`. Recadrage `edgeCrop` / `ctxQuad` comme Riftbound (grille recalée en classeur).
- Mesuré (visuels officiels posés de travers sur un fond, pas encore de vraies photos) : 6/6 sûres par l'image (dont chiot 4a), lecture du code 3/3 en 0,3–4 s ; Capturer carte seule Lorcana / « Toutes » / mode Pokémon (bascule) : 3/3 ; page 3 × 3 fabriquée (L'Ascension des Floodborn 10…18) : 9/9 justes, 8 sûres, Mulan 15 « à vérifier » (même dessin réimprimé dans Fabuleux 10), série devinée.
- Mode Pokémon : `recognizer-text › OTHER` contenait déjà « lorcana », « disney » → `scan.otherGames(raw, except)` essaie d'abord la licence dont le code se lit (Riftbound, Lorcana), puis One Piece. `detectGame` : points Lorcana (code ≥ 0,9, Disney/Lorcana/Ravensburger, Storyborn/Floodborn/Dreamborn, éclat de Lore, chanson, mélomane, défi).
- **Dos / certification** : `App.lorcanaBacks` (modèles 24 × 33 comme One Piece, `recognizer-image › refsOf`) + `certify.js › LC_BACK` (décalage) — **à faire avec une photo du dos par Arnaud** (pas de source libre : le wiki demande une vérification anti-robot) ; sans modèle, pas de certification Lorcana (le reste marche).

## Ailleurs
- Import : `importer.js` › `LC_CODE` (code complet avec la langue, pour ne pas prendre « 4/102 » Pokémon), `LC_SETS` (noms EN/FR), `matchLC` (code, série + numéro, nom FR ou anglais ; enchantée si la ligne le dit) ; nom pris tel quel (`cleanName` coupe au tiret).
- Combats : `battle.fighterLC` (PV 30 + volonté × 15 (+ Résistance), « Défi » = force × 10 (+ Offensif), « Riposte » si Rempart / Résistance, Charge = 1 encre, `LC_INK` encre → type), `LEVELS_LC` (Apprenti → Légende, Premier Chapitre), `battleCards.effectOfLC` (texte FR, `isLcCard` avant One Piece car « Lieu » existe dans les deux), carte « Encre » `inkCard()` (`INK`, `img/combat/encre-lorcana.svg`, +3 dans la pioche perso par `withDon`), `AI_BAGS_LC`, `LIC.lorcana` (Grimoire, « Défis au Grand Illuminarium »), `say` (personnage, encre), `LC_NAMES` ; décor `illuminarium-lorcana.svg`, dos `dos-lorcana.svg`, CSS `.g-lorcana` (livre de contes : parchemin, violet, dorures).
- Badges : `lc-mickey`, `lc-princes` (`LC_PRINCESSES`), `lc-villains`, `lc-ench`. Icône `ink` (hexagone + goutte).
- Explorer / Objectifs : 4 licences → `.game-pick` défile sur téléphone, `sets.showPick(el)` centre la licence choisie.
- Tests : `tests/unit.js` (données FR, codes, combattant + cartes de pioche, « Toutes », import, index), `tests/pages.js` (séries, série 1, promos, combat, Capturer), `tests/combat.js` (combat Avancé Lorcana).
