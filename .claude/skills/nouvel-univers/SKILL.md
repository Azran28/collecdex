---
name: nouvel-univers
description: Ajouter une nouvelle licence (un nouvel « univers » de cartes à collectionner : Magic, Yu-Gi-Oh!, Star Wars Unlimited, Dragon Ball…) à CollecDex, de la même façon que Riftbound (v3.10) et Disney Lorcana (v3.21) — données, séries, scanner, vérification par l'image, prix, import, combats, badges, certification, tests, mise en ligne. À utiliser quand Arnaud demande « ajoute la licence X », « nouvel univers », « nouveau jeu de cartes ».
---

# Ajouter une nouvelle licence à CollecDex

Modèle à suivre : **Lorcana** (`js/games/lorcana.js`, note `.claude/rules/lorcana.md`, commit `59054eb` « v3.21 : 4e licence ») et **Riftbound** (`js/games/riftbound.js`, `.claude/rules/riftbound.md`, commit `087d692`). En cas de doute sur un détail, **relire le diff de ces commits** (`git show 59054eb -- <fichier>`) : chaque branchement s'y voit en quelques lignes.

Règle d'or (CLAUDE.md) : **même logique et même DA que Pokémon** pour chaque licence. On n'adapte que ce qui ne peut pas être reproduit à l'identique, et légèrement. Tout est pensé **téléphone d'abord**.

Dans tout ce qui suit, `XX` = préfixe court de la licence (Lorcana `lc`, Riftbound `rb`, One Piece `op`) et `<id>` = son identifiant (`lorcana`, `riftbound`…).

Tenir la liste de tâches (`update_plan`) avec les étapes ci-dessous ; ne pas tout faire d'un coup sans tester.

---

## Étape 0 — Décider avec Arnaud (avant d'écrire du code)
- Vérifier que la licence est dans `js/games/registry.js` (ligne `status: 'bientôt'`) ; sinon l'ajouter.
- Demander (une seule question à la fois, `AskUserQuestion`) seulement ce qui ne se devine pas : a-t-il des cartes de cette licence (photos de test) ? cartes françaises ou anglaises ?
- **Photos réelles** : lui demander des photos (carte seule en pochette, en main, une page de classeur, le dos) à mettre dans `_tests-scanner/<id>/` (jamais sur GitHub). Sans photo, mesurer sur des visuels officiels posés de travers sur un fond, et le dire.

## Étape 1 — Trouver les sources (recherche web, puis noter dans la règle)
Pour chaque point, noter l'adresse exacte, le format, si **CORS** est accordé (`fetch` depuis `localhost:8765`) et la taille :
1. **Liste des cartes et séries en français** (noms, textes, raretés, types) — priorité aux données officielles. Pas de CORS ou fichier énorme → un outil du robot (`outils/ci/<id>-cartes.mjs`, modèle `lorcana-cartes.mjs`) qui produit `data/XX-cartes.json` compact dans le dépôt, relancé chaque lundi par `index.yml`. CORS + petit → lecture directe avec cache 3 jours (modèle Riftbound `rb1:index`).
2. **Visuels** : de préférence français ; s'ils refusent d'être lus par une page → relais `images.weserv.nl/?url=https%3A%2F%2F…` (le `https://` encodé dans l'adresse). Vérifier qu'un `fetch` des pixels marche (indispensable pour la vérification par l'image). Cartes couchées : tourner (`&ro=270`) pour le sens du classeur.
3. **Identifiant d'une carte** stable et court (`<série>-<numéro>`), versions (alternatives, enchantées, signatures…), promos.
4. **Code imprimé sur la carte** (où : bas gauche / bas droite ; forme exacte, ex. « 1/204 • FR • 1 », « OGN · 013/298 ») : c'est ce que lit le scanner.
5. **Prix** : tcgcsv.com (copie quotidienne TCGplayer, trouver la catégorie ; `User-Agent` CollecDex obligatoire) → `outils/ci/prix-<id>.mjs` (modèle `prix-lorcana.mjs`), relier chaque carte par son n° de produit TCGplayer (`tp`) si possible.
6. **Visuel de série** : sachet de booster TCGplayer (`PACKS_CROP`, zone mesurée à la main), sinon le code de la série.
7. **Dos de la carte** (pour la certification) et son aspect.

## Étape 2 — L'adaptateur `js/games/<id>.js` (< ~800 lignes)
Copier la structure de `lorcana.js` : en-tête qui explique sources et identifiant, `index()` avec cache `XX1:index` (relu à chaque `APP_VERSION` ou après 3 jours, données en cache si hors ligne), `RAR` (rang, nom FR, sigle, couleur), `GROUPS`, `listSets`, `getSet`, `getCard`, `fromIds`, `byCode`, `search`, `setIdsByName`, `versions`, `names`, `img`, `price` / `tpMarket`, `codesIn` (code imprimé → `[['série|numéro', poids]]`, tolérant aux lettres lues à la place des chiffres, **et rien sur un code Pokémon**), `recognize` (code + vérification par l'image lancée tout de suite, `XX_INDEX_V`, `IMG_SURE`), `manual`, puis :
```js
App.games.register('<id>', { id, name, listSets, getSet, getCard, search, versions, byCode, setIdsByName, price, img, recognize, manual, codesIn, names,
  visualCheck, langFor, cardmarketUrl, boosterUrl, isOfficial, logoText, extraLabel, priceNote, rarity, pullRates: () => null, source: { name, url } });
```
- `registry.js` : passer la ligne en `status: 'actif'`, icône dédiée (nouvelle icône SVG dans `js/icons.js`, trait simple comme les autres), courte description.
- `index.html` : `<script src="js/games/<id>.js?v=…" defer></script>` à côté des autres adaptateurs ; **CSP** : ajouter tout nouveau domaine dans `connect-src` / `img-src` (sinon bloqué en silence).
- `sw.js` : si les visuels passent par un nouveau domaine, l'ajouter là où sont mis en cache ceux de One Piece / Riftbound.
- `css/02-theme.css` : `.g-<id> { --g: linear-gradient(…) }` (couleur de la licence) ; habillage du combat : `css/09-combat-licences.css` ; Explorer / Objectifs : la rangée `.game-pick` défile déjà sur téléphone (`sets.showPick`).

## Étape 3 — Scanner (Capturer), voir `.claude/rules/scanner-ecran.md` et `reconnaissance.md`
- `js/views/scan-single.js` : `HINTS.<id>` (exemples de nom et de code) et le message « le code … doit être lisible ».
- `js/views/scan.js › detectGame` : ligne `<id>: (code lu ≥ 0,9 ? 2 : 0) + [mots typiques de la carte]` (éditeur, mots-clés du jeu) ; `otherGames` prend la licence d'office si elle a `codesIn`.
- `js/recognizer-text.js › OTHER` : mots qui disent « ce n'est pas du Pokémon » (si absents).
- Cadrage : vérifier sur les photos que la carte est coupée sur ses vrais bords (Lorcana a eu besoin de `outerQuad`, Riftbound de `snapQuad`). Classeur : pages 3 × 3 entières, rafale, « Toutes les licences », et **depuis le mode Pokémon** (bascule).
- Brillant : la mesure Pokémon (`detectVariants`) ne marche souvent pas → « Normale » par défaut, à cocher sur la fiche, sauf si la rareté le dit.
- Noter les mesures (x/y justes, sûres, temps par page) dans la règle de la licence.

## Étape 4 — Vérification par l'image (`.claude/rules/visuel.md`)
- Construire `data/XX-index.{json,bin}` : `js/labo-index-op.js` (`FILE.<id> = 'XX-index'`, `__opIndex.build('<id>')`, `pack(128, '<id>')`).
- Robot hebdomadaire : `outils/ci/index-maj.mjs` (entrée `<id>: ['data/XX-index', 'js/games/<id>.js', /const XX_INDEX_V = (\d+);/, 'XX_INDEX_V']`), `outils/index-maj.js` (`INDEX`, message `__maj`), `outils/index-maj.html` (script de l'adaptateur), `.github/workflows/index.yml` (`git add … js/games/<id>.js`, et l'étape de la liste des cartes si besoin).

## Étape 5 — Prix
- `outils/ci/prix-<id>.mjs` → `_site/data/XX-prix.json` `{ m, p: { <clé>: [normal, brillant] } }` ; étape dans `.github/workflows/site.yml` (chaque matin) ; `data/XX-prix.json` dans `.gitignore` ; en local le site lit celui en ligne.
- `priceNote` de l'adaptateur : dire d'où vient le prix (marché, monnaie convertie).

## Étape 6 — Partout ailleurs (chercher `lorcana` dans le code : chaque endroit doit avoir son équivalent)
```bash
grep -rn -i "lorcana" js css index.html sw.js outils tests .github
```
- **Import** (`js/importer.js`, `.claude/rules/import.md`) : `XX_CODE`, `XX_SETS` (noms EN/FR des séries), reconnaissance de la ligne (catégorie, code complet, série), `matchXX(row)` (code → série + numéro → nom FR/EN), branché dans `match`.
- **Combats** (`.claude/rules/combat.md`) : `battle.js` (`fighterXX`, `isXXFighter`, `canFight`, `fighterOf`, `XX_TYPE` couleur → type, `LEVELS_XX` 5 niveaux), `battle-cards.js` (`effectOfXX`, `isXXCard` avant les autres si un nom de catégorie se recoupe, carte d'énergie si le jeu n'en a pas, `AI_BAGS_XX`, pioche de prêt), `views/match-core.js` (`FIGHT_GAMES`, `LIC.<id>` : nom de la pioche, textes, décor, `say`, `XX_NAMES`), `views/match-teams.js` (filtre de types, texte de la pioche de prêt), `views/match.js` (règles affichées) ; images `img/combat/<décor>-<id>.svg`, `dos-<id>.svg` ; CSS `.g-<id>` des combats (fin de `style.css`). Licences **séparées** (choix d'abord, DA et décor propres) ; capsules = Pokémon seul.
- **Badges** (`js/badges.js`) : 4 badges secrets de la licence (préfixe `XX-`), mêmes idées que les autres (un personnage culte, une famille, les méchants, une rareté haute).
- **Amis / vitrine / duel** (`js/friends.js › cleanItem`, `js/duel.js`) : accepter les adresses de visuels de la licence par une expression **stricte** (données d'un autre dresseur = jamais fiables).
- **Certification** (`.claude/rules/certification.md`) : dos reconnu (`recognizer-image.js › backScoreOf`, modèle `js/games/<id>-backs.js` ou mesure dédiée comme `rbBackScore` / `lcBackScore`), `certify.js › backOf`. Sans photo du dos : préparer et le dire.

## Étape 7 — Tests (`.claude/rules/tests.md`)
- `tests/unit.js` : licence enregistrée, `battle.levels('<id>').length === 5`, données FR (série 1, une carte, son visuel), `codesIn` (code normal, lettres mal lues, promo, **pas de code dans un texte de carte ni sur un numéro Pokémon**), combattant + cartes de pioche, « Toutes » reconnaît la licence sur son texte, import (Collectr / Cardmarket), index cohérent (`checkIndex('XX-index')`).
- `tests/pages.js` : `#/jeu/<id>`, une série, les promos, `#/combat?jeu=<id>`, `#/scan?jeu=<id>`, `#/scan?mode=classeur&jeu=<id>`.
- `tests/combat.js` : un combat Avancé complet de la licence.
- `sh outils/stamp.sh` puis `tests.html` dans l'aperçu (`collecdex-copie`, port 8766) → tout vert.

## Étape 8 — Vérifier soi-même dans le navigateur
Ordinateur **et** téléphone (375 × 812) : Explorer (rangée des licences), séries, une série, fiche carte (prix, visuel), Mon Dex, Objectifs, Capturer (carte seule, classeur, « Toutes », mode Pokémon), import d'un petit fichier, un combat, vitrine. Effacer les données de test (`App.col.wipeLocal()`, seulement si personne n'est connecté).

## Étape 9 — Noter et mettre en ligne
- **Nouvelle règle** `.claude/rules/<id>.md` (modèle `lorcana.md` : `paths:` = adaptateur, `registry.js`, outils `ci` ; sections Données / Reconnaissance / Ailleurs ; « Même logique que … ; ici seulement ce qui diffère ») + **une ligne dans le tableau de `CLAUDE.md`** ; ajouter le nom de la licence dans les règles touchées (`combat.md`, `import.md`, `visuel.md`, `certification.md`, `tests.md`, `scanner-ecran.md`).
- `CLAUDE.md` › Architecture : ajouter l'adaptateur à la liste des `js/games/`.
- `LISEZ-MOI.md` (mode d'emploi, simple) et `docs/FEUILLE-DE-ROUTE.md` (version, ce qui manque encore).
- Version : `sh outils/stamp.sh` ; commit « vX.YY : Ne licence, <Nom> » (auteur `Azran28`) avec, comme `59054eb`, la liste de ce qui a été fait ; `git push origin main` seulement avec l'accord d'Arnaud ; vérifier `version.json` en ligne après ~3 min.

## Pièges déjà rencontrés
- Un code d'une autre licence lu comme le sien (« 25/165 » Pokémon, « 4/102 » à l'import) → exiger le code **complet** (langue, série) ou un total connu.
- Sans les mots typiques dans `detectGame` / `otherGames`, la licence est essayée en dernier (> 30 s par carte).
- Visuels officiels rognés plus serré que la carte → cadrage faux (Lorcana `OUTER`).
- Cache d'empreintes du navigateur (IndexedDB `collecdex-vis`) : une image remplacée sous la même adresse garde l'ancienne empreinte → vider avant de mesurer.
- Serveur d'images qui refuse l'en-tête `Origin` (403) → toujours par le relais.
- Le robot de tests GitHub peut échouer une fois sans raison (combat lent) : relancer avant de chercher.
- **Le relais images.weserv.nl limite (~2 500 images par quart d'heure et par adresse)** : ne jamais construire l'index d'images par lui (Yu-Gi-Oh! : 10 703 échecs sur 14 103). Télécharger les petites images une fois sur le PC (scratchpad), les servir en local au calcul (`img.card` remplacé le temps du calcul), puis `pack`.
- Une même illustration pour plusieurs impressions (Yu-Gi-Oh! : réimpressions, raretés) : index **par illustration**, l'image donne la carte et le code lu choisit l'impression (`yugioh.md › choosePrint`) ; penser aux **autres illustrations** d'une même carte (sinon la carte n'est jamais trouvée).
- Tesseract lit mal les très grandes lettres : agrandissement des zones **d'après la taille de la photo** (lettres ~40 px), bandes fines qui glissent.
- `stamp.sh` fait recharger les pages ouvertes (le site compare sa version) : pas de `stamp` pendant un long calcul dans le navigateur.
