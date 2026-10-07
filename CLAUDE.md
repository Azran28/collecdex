# CollecDex — contexte pour Claude

« Pokédex » de collection de cartes pop-culture (Pokémon d'abord, puis One Piece, Magic, Yu-Gi-Oh!, Lorcana, et à terme tout ce qui se collectionne en « X / Y »).
Propriétaire : **Arnaud** (GitHub `Azran28`). Il code très peu : c'est Claude qui écrit tout le code, Arnaud teste et décide.

## Organisation du contexte (économie de tokens)
Ce fichier ne garde que l'essentiel. Le détail technique est dans **`.claude/rules/*.md`** : chaque fichier déclare des `paths:` et n'est chargé que quand on ouvre un fichier correspondant.
| Règle | Sujet |
|---|---|
| `supabase.md` | scripts SQL (ordre), Edge Function, notifications push, session, suppression de compte |
| `scanner-ecran.md` | `views/scan.js` : carte seule, classeur (écran plein écran), rafale, caméra |
| `reconnaissance.md` | `recognizer.js` : OCR, grille, détourage, versions, dos, série devinée |
| `visuel.md` | vérification par l'image (`visual.js`, worker, index, labo) |
| `certification.md` | `certify.js`, lampe, labo de certification |
| `onepiece.md` | adaptateur One Piece et ses particularités (scanner, images, prix) |
| `pokemon-donnees.md` | adaptateur Pokémon / TCGdex, séries anglaises, hors-série, langues |
| `combat.md` | combats (ordinateur, Avancé, en ligne, reprise, revanche) |
| `capsules.md` | capsules, boutique, Pokédex |
| `amis-vitrine.md` | amis, vitrine (publique, personnalisation, statut), bloquer/signaler |
| `collection.md` | `App.col`, valeur, prix, photos dans le compte, souhaits/objectifs |
| `import.md` | import de fichiers (Collectr, Cardmarket…) |
| `appli-mobile.md` | CSS téléphone, présentation, lancement, version Play Store, service worker, effets |
Documents non chargés automatiquement (à lire seulement si besoin) : `.claude/docs/git-premiere-fois.md`, `docs/FEUILLE-DE-ROUTE.md`, `LISEZ-MOI.md`.
**Nouvelle connaissance à noter → dans la règle du sujet** (courte, sans historique inutile), pas ici. Nouveau sujet → nouvelle règle avec ses `paths:` + une ligne dans ce tableau.

## Façon de travailler avec Arnaud
- Toujours répondre **en français**, simplement, sans jargon ; pas de commandes à taper de son côté sauf nécessité (ex. coller un script SQL dans Supabase, en expliquant où cliquer).
- Tester soi-même avant de dire « c'est fait » (navigateur intégré sur `http://localhost:8765` et le site en ligne), en ordinateur **et** en taille téléphone (375 × 812).
- **Même logique et même DA pour toutes les licences** (Arnaud, 6 oct.) : le travail fait pour Pokémon doit servir à chaque licence (scanner, pages, fiches, progression, badges, combats) ; n'adapter que ce qui ne peut pas être reproduit à l'identique, et légèrement. Chercher chaque `isPk()` / `=== 'pokemon'` : toute différence doit venir de la licence elle-même.
- **Le but est l'appli sur téléphone** (Arnaud, 29 sept.) : penser chaque changement d'abord pour le téléphone (appli installée), en « appli » plutôt qu'en « site ». Le PC reste tel quel : n'y toucher que s'il le demande (ou le lui suggérer).
- Ne jamais demander ni manipuler la clé secrète Supabase (`sb_secret_…` / `service_role`) ni le mot de passe de la base. Arnaud crée ses comptes et tape ses mots de passe lui-même.
- Données de test dans le navigateur intégré : les effacer après (`App.col.wipeLocal()`, seulement si personne n'est connecté).
- Les fichiers contenant son e-mail (ex. `supabase-mes-certificats.sql`) restent sur son PC, jamais sur GitHub.
- **Jamais de `confirm()` / `alert()` / `prompt()`** : `await App.util.ask({ title, text, ok, cancel, danger, icon })` → vrai/faux, ou `choices: [{label, value, kind}]` → valeur / `null` (z-index 6000) ; messages simples → `App.util.toast`. Gestionnaire `async`.

## Où vit le site
- **En ligne** : https://azran28.github.io/collecdex/ (GitHub Pages, dépôt `Azran28/collecdex`, branche `main`, fichier `.nojekyll`).
- **Sur le PC d'Arnaud** : `C:\Users\Arnaud\Documents\Collection`, lancé par `Lancer CollecDex.bat` (petit serveur `outils/serveur.ps1` sur le port 8765). Même code que le dépôt.
- **Comptes et synchro** : Supabase, projet `zjzfwhtqrigfmqzfebzy` (offre gratuite), clé publique dans `js/config.js`. Détails (scripts SQL v1…v17, Edge Function `hyper-processor`, e-mails) : `.claude/rules/supabase.md`.

## Mettre une version en ligne
1. Numéro de version : `sh outils/stamp.sh` (Linux / Git Bash) ou `powershell -ExecutionPolicy Bypass -File outils/stamp.ps1` (Windows). Il met `?v=AAAAMMJJ-HHMMSS` sur tous les scripts/styles de `index.html`, dans `<meta name="app-version">` (lu par `util.js` → `window.APP_VERSION`) et dans `version.json`. GitHub Pages garde les pages en cache ~10 min : le site compare sa version à `version.json` et se recharge tout seul.
2. `git commit` (auteur `Azran28`) + `git push origin main` ; vérifier `https://azran28.github.io/collecdex/version.json` (1 à 2 min).
3. Le dossier du PC d'Arnaud doit avoir la même version.
4. Mettre à jour `LISEZ-MOI.md` (mode d'emploi pour Arnaud) et `docs/FEUILLE-DE-ROUTE.md` (état du projet, idées, historique des versions). Si la session a accès au projet claude.ai « Collection », y recopier aussi la feuille de route (document « CollecDex - etat et feuille de route »).

## Où travaille Claude
- **Session locale sur le PC d'Arnaud** (cas visé) : on modifie directement les fichiers ; le site local (`localhost:8765`) est à jour tout de suite. **Au début de chaque session** : `git status` puis `git pull`. (Si ce n'est pas un dépôt git : `.claude/docs/git-premiere-fois.md`.) Au premier `git push`, c'est **Arnaud** qui se connecte à GitHub, jamais Claude.
- **Tester** : `Lancer CollecDex.bat` (ou `powershell -ExecutionPolicy Bypass -File outils/serveur.ps1`) puis `http://localhost:8765` dans l'aperçu ; ordinateur et téléphone (375 × 812). Pas de Playwright ni de PostgreSQL sur ce PC : pour le SQL, relire très attentivement et faire tester Arnaud dans Supabase. **Le navigateur garde les fichiers `?v=`** : `sh outils/stamp.sh` avant de recharger, sinon on teste l'ancien code. Ne pas faire attendre un appel `javascript_tool` plus de ~35 s (limite 45 s).
- **Claude Code dans le cloud** (dépôt GitHub) : même chose, mais dire à Arnaud de faire un `git pull` dans son dossier (ou le faire à la session locale suivante). Pas d'internet : tester dans l'aperçu.
- **Claude (application, onglet discussion) avec le PC relié** : historique jusqu'au 27 sept. 2026 ; copie de travail dans l'espace cloud, publication par git, puis copie des fichiers sur le PC (toujours depuis un **nouveau** dossier de préparation). Espace cloud : Playwright + Chromium et PostgreSQL 16 (`/usr/lib/postgresql/16/bin`, fausse `auth.uid()`).

## Rangement du dossier
- **Racine = seulement ce qui doit y être** : `index.html`, `sw.js` (sa place fixe sa portée), `manifest.webmanifest`, `version.json`, `.nojekyll`, `confidentialite.html` et `supprimer-compte.html` (adresses données au Play Store : ne jamais les déplacer), `labo.html` / `labo-certif.html` (outils de test), `Lancer CollecDex.bat` (Arnaud double-clique dessus), `README.md`, `LICENSE`, `LISEZ-MOI.md`, `CLAUDE.md`.
- `css/`, `js/` (+ `js/views/`, `js/games/`), `data/` (index d'images), `icons/`, `img/` : le site.
- `supabase/sql/` : scripts SQL (`supabase-*.sql`) ; `supabase/functions/` : Edge Function.
- `outils/` : `serveur.ps1` (serveur local, sert le dossier parent), `stamp.sh` / `stamp.ps1` (numéro de version).
- `docs/` : `FEUILLE-DE-ROUTE.md`. `.claude/rules/` et `.claude/docs/` : contexte de Claude.
- Seulement sur le PC (`.gitignore`) : `_tests-scanner/` (photos de test, bancs, `test/` = images du labo de certification, `test-classeur.png`), `supabase/sql/supabase-mes-certificats.sql`.

## Architecture (HTML/CSS/JS sans framework ni build)
- Scripts classiques, espace de noms global `App`, routeur par `#` (`js/app.js`). **Ordre de chargement important** : `util.js` crée `App`, donc `icons.js` vient après. Tous les `<script>` ont `defer` (garder `defer` sur tout nouveau script) ; nouveau fichier JS → l'ajouter dans `index.html` avec `?v=`.
- `js/db.js` (IndexedDB : `items`, `photos`, `kv`, `cache`) · `js/collection.js` (`App.col`) · `js/cloud.js` (synchro Supabase) · `js/games/registry.js` + un adaptateur par jeu (`pokemon.js`, `onepiece.js`…) · `js/recognizer.js` (reconnaissance) · `js/visual.js` + `visual-worker.js` (image) · `js/certify.js` · `js/notify.js` · `js/wish.js` · `js/install.js` + `sw.js` · `js/capsules.js` + `js/pokedex.js` · `js/battle*.js` + `js/duel.js` · `js/friends.js` · `js/importer.js` · `js/badges.js` (39 badges secrets, toutes licences) · `js/icons.js` (SVG, logo) · `js/sfx.js` (`App.sfx`, Web Audio, réglage `App.settings.sound`) · `js/onboarding.js`.
- `js/views/*.js` : une page par fichier (accueil, séries, série, fiche carte, Mon Dex, vitrine, capture, paramètres, compte, match…).
- Navigation : `#/compte` = la **vitrine** (avatar en haut à droite ; `#/vitrine` alias) ; connexion/synchro (`views/account.js`) en haut des **Paramètres** (`embedded: true`) et sur `#/connexion` ; **Combat** = `#/combat` (alias `#/match`, fichier `views/match.js`). La pastille du compte pointe vers `#/compte` si connecté, `#/connexion` sinon.
- `css/style.css` : styles de base puis blocs successifs ; règles mobiles sous `@media (max-width: 760px)` (voir `appli-mobile.md`).

## Sécurité (à respecter partout)
- **CSP** dans `index.html` : scripts seulement du site et de bibliothèques précises de `cdn.jsdelivr.net` (supabase-js 2.117.2, tesseract.js / tesseract.js-core 5.1.1 avec et sans « v » ; + `wasm-unsafe-eval`), workers `blob:`, connexions limitées (TCGdex, Supabase, jsDelivr, tessdata, raw.githubusercontent, optcgapi.com, images.weserv.nl). **Nouveau service externe ou nouvelle bibliothèque → l'ajouter à la CSP**, sinon bloqué en silence (`securitypolicyviolation`). Pas de script en ligne ni d'attribut `onclick=` (utiliser un écouteur, ex. `data-reload`).
- Bibliothèques CDN **à version figée avec SRI** (`integrity` + `crossOrigin`) : supabase-js 2.117.2 (`cloud.js`), tesseract.js 5.1.1 (`recognizer.js`). Changer de version → recalculer le sha384 et changer la CSP.
- **Données d'un autre dresseur = jamais fiables** : `friends.js` filtre tout (`cleanRow`, `cleanItem`, `cleanProfile`). Toujours `esc()` dans les gabarits, y compris dans `style="…url('…')"` et `data-game`.
- `outils/serveur.ps1` : sert le dossier parent, ne sert jamais `.git`/`.claude`, option `-NoBrowser`. `.claude/launch.json` : l'aperçu se branche sur le serveur d'Arnaud (port 8765 réservé) ; `collecdex-copie` = `outils/serveur.ps1 -Port 8766` sur le worktree.
- Pages publiques (Play Store) : `confidentialite.html`, `supprimer-compte.html` (`css/page.css`, CSP stricte `style-src 'self'` : aucun attribut `style=`), contact collecdex.app@gmail.com.

## Règles produit
- Ajout d'une carte **par photo** (capture) ; la photo devient le visuel. Seule exception : l'import d'un fichier (`#/importer`), cartes sans photo, non certifiées (`item.imported`). Une carte compte une fois ; les exemplaires en plus sont des doublons.
- Certification : l'import depuis la galerie reste possible mais **sans badge**. Seul le serveur pose le badge (table `certifications` en lecture seule).
- **Écarté par Arnaud (5 oct. 2026) : les échanges entre collectionneurs** (et « suivre des collectionneurs ») — risques d'arnaque et de vente. **La liste de souhaits est un outil personnel : ne jamais la montrer aux autres** (ni vitrine, ni amis, ni notification), pas de prix ni de « à vendre » entre dresseurs.
- Idées pour la suite : `docs/FEUILLE-DE-ROUTE.md` (en bref : analyse de certification côté serveur, autres licences).
