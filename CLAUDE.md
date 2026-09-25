# CollecDex — contexte pour Claude

« Pokédex » de collection de cartes pop-culture (Pokémon d'abord, puis One Piece, Magic, Yu-Gi-Oh!, Lorcana, et à terme tout ce qui se collectionne en « X / Y »).
Propriétaire : **Arnaud** (GitHub `Azran28`). Il code très peu : c'est Claude qui écrit tout le code, Arnaud teste et décide.

## Façon de travailler avec Arnaud
- Toujours répondre **en français**, simplement, sans jargon ; pas de commandes à taper de son côté sauf nécessité (ex. coller un script SQL dans Supabase, en expliquant où cliquer).
- Tester soi-même avant de dire « c'est fait » (navigateur intégré sur `http://localhost:8765` et le site en ligne), en ordinateur **et** en taille téléphone (375 × 812).
- Ne jamais demander ni manipuler la clé secrète Supabase (`sb_secret_…` / `service_role`) ni le mot de passe de la base. Arnaud crée ses comptes et tape ses mots de passe lui-même.
- Données de test dans le navigateur intégré : les effacer après (`App.col.wipeLocal()`, seulement si personne n'est connecté).
- Les fichiers contenant son e-mail (ex. `supabase-mes-certificats.sql`) restent sur son PC, jamais sur GitHub.

## Où vit le site
- **En ligne** : https://azran28.github.io/collecdex/ (GitHub Pages, dépôt `Azran28/collecdex`, branche `main`, fichier `.nojekyll`).
- **Sur le PC d'Arnaud** : `C:\Users\Arnaud\Documents\Collection`, lancé par `Lancer CollecDex.bat` (petit serveur `serveur.ps1` sur le port 8765). Même code que le dépôt.
- **Comptes et synchro** : Supabase, projet `zjzfwhtqrigfmqzfebzy` (offre gratuite), clé publique dans `js/config.js`.
  Scripts SQL à exécuter une fois, dans l'ordre, dans *SQL Editor* : `supabase-setup.sql` → `supabase-certif.sql` → `supabase-v2.sql`.

## Mettre une version en ligne
1. `stamp.sh` (ou équivalent) : met un numéro de version `?v=AAAAMMJJ-HHMMSS` sur tous les scripts/styles de `index.html`, dans `window.APP_VERSION` et dans `version.json`.
   GitHub Pages garde les pages en cache ~10 min : le site compare sa version à `version.json` et se recharge tout seul.
2. Copier les fichiers modifiés sur le PC d'Arnaud (toujours depuis un **nouveau** dossier de préparation, sinon l'outil peut renvoyer d'anciennes versions), puis vérifier.
3. `git commit` (auteur `Azran28`) + `git push` sur `main` ; vérifier `version.json` en ligne.
4. Mettre à jour `LISEZ-MOI.md` (mode d'emploi pour Arnaud) et le document de projet « CollecDex - etat et feuille de route ».

## Architecture (HTML/CSS/JS sans framework ni build)
- Scripts classiques, espace de noms global `App`, routeur par `#` (`js/app.js`). **Ordre de chargement important** : `util.js` crée `App`, donc `icons.js` vient après.
- `js/db.js` : IndexedDB (magasins `items`, `photos`, `kv`, `cache`).
- `js/collection.js` : cartes possédées (`App.col`) — ajout, photos (`addPhoto`, `replacePhoto` avec `photoRev`, `setPhotoSource`, `keepPage`), progression, profil de vitrine, sauvegarde.
- `js/cloud.js` : synchro Supabase (file d'attente, la date la plus récente gagne), `rpc`, `flushNow`, chargement des certifications.
- `js/games/registry.js` + un adaptateur par jeu (`pokemon.js`, `pokemon-rarity.js`, `pokemon-pullrates.js`). Données Pokémon : TCGdex (REST + GraphQL, FR, prix Cardmarket).
- `js/recognizer.js` : reconnaissance (Tesseract.js pour le numéro et le nom, comparaison visuelle de l'illustration, détection de carte / dos / pochette vide / page de classeur).
- `js/certify.js` : certification en direct (défi tiré par le serveur, film de 2 s, mouvement, flux figé, détection d'écran, empreinte dHash, vérification que la carte choisie est bien la plus ressemblante de sa série).
- `js/wish.js` (`App.wish`) : liste de souhaits et objectifs, rangés dans le profil (`profile.wishlist`, `profile.goals`) donc synchronisés ; `js/views/goals.js` : page « Mes objectifs » (`#/objectifs`, onglets objectifs / ce qu'il me manque / souhaits).
- `js/badges.js` : 35 badges secrets. `js/icons.js` : icônes SVG et logo.
- `js/views/*.js` : une page par fichier (accueil, séries, série, fiche carte, Mon Dex, vitrine, capture, paramètres, compte).
- `css/style.css` : styles de base puis blocs successifs (« THÈME POP », certification, holo, badges, passe responsive). Les règles mobiles sont sous `@media (max-width: 760px)`.

## Règles et pièges connus
- Ajout d'une carte **uniquement par photo** (capture) ; la photo devient le visuel. Une carte compte une fois ; les exemplaires en plus sont des doublons (pour les échanges futurs).
- Certification : l'import depuis la galerie reste possible mais **sans badge**. Seul le serveur pose le badge (table `certifications` en lecture seule).
- Page de classeur prise avec la caméra du site : utiliser `cam.photo()` (vraie photo pleine résolution via `ImageCapture`), pas l'image vidéo, sinon les cartes sont trop petites pour être lues.
- Classeur : ne deviner la série que si c'est très sûr (≥ 3 cartes « sûres » de la même série et ≥ 80 % des cartes sûres), ne remplacer une carte que si elle est reconnue avec certitude, et toujours pouvoir annuler (`applySeries` / `undoSeries`).
- Caméra : en mode carte la vidéo remplit le cadre (`object-fit: cover`, et `region()` utilise alors `Math.max`) ; en mode classeur la zone prend la forme de l'image vidéo.
- Identité pour la certification (`certify.identity`) : règle **relative** — la carte choisie doit être la plus ressemblante de sa série avec ≥ 0,10 d'avance (et ≥ 0,35). Un seuil absolu (0,5) refusait de bonnes cartes selon le cadrage (ex. Voltorbe 0,44). La raison d'un échec est gardée dans `item.certNote` et affichée dans la fiche.
- Effets des cartes : `App.ui.holoTier(rang, holo)` donne le niveau 0 à 5 ; les tuiles ont la classe `rt-N` et `--rc` (couleur de rareté) ; l'inclinaison suit la souris via un seul écouteur global dans `components.js` (ordinateur uniquement). Ne pas animer toutes les tuiles en permanence (batterie) : reflets au survol, animation permanente seulement pour les plus rares sur téléphone. Les grilles sont souvent redessinées : pas d'animation d'apparition sur les tuiles.
- Valeur : toujours passer par `App.col.valueOf(it)` / `App.col.totalValue(list)` (état `item.cond` = `{kind:'raw', grade:'NM'}` ou `{kind:'graded', company, grade}`, et `item.valueOverride` prioritaire). L'ancienne note `rating` n'est plus affichée.
- Pas de `backdrop-filter` sur un parent de la barre du bas mobile (ça la fait remonter en haut).
- Sur téléphone, `:hover` reste collé après un appui : ne pas y mettre de couleur qui rend un texte illisible.
- Les anciennes holos sont notées « Rare » par TCGdex : une carte qui n'existe qu'en holo est traitée comme holo.
- L'espace de travail de Claude n'a pas accès à internet (TCGdex, polices…) : tester dans le navigateur intégré.

## Idées pour la suite
Liste complète et priorités dans le document de projet « CollecDex - etat et feuille de route ». En bref : Échanges entre collectionneurs (doublons + certification + pseudos uniques déjà prêts), vitrine publique, import depuis d'autres applis, One Piece en 2ᵉ licence, analyse de certification côté serveur.
