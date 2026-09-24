# CollecDex — ton Pokédex de collection

## Lancer le site

1. Double-clique sur **`Lancer CollecDex.bat`**.
2. Une fenêtre noire s'ouvre, puis ton navigateur affiche le site (adresse `http://localhost:8765`).
3. **Laisse la fenêtre noire ouverte** pendant que tu utilises le site. Ferme-la pour l'arrêter.

> Si Windows affiche un avertissement la première fois, clique sur « Informations complémentaires » → « Exécuter quand même ». Le fichier ne fait que lancer un petit serveur local sur ton PC.

Il faut une connexion internet : les cartes, images et prix sont téléchargés depuis TCGdex puis gardés en mémoire.

## Ce que tu peux faire

- **Séries** : toutes les séries Pokémon en français. Pour chacune, tu vois `possédées/total`, le pourcentage, les raretés, la progression par rareté, et un badge 🏆 quand elle est complète.
- **Dans une série** : toutes les cartes sont affichées ; celles que tu n'as pas sont grisées (ou affichées en « numéro seul », au choix dans les Paramètres). Clique sur une carte pour ouvrir sa fiche (prix, note, photos, quantité, versions). Les filtres permettent d'afficher les cartes possédées ou manquantes, par rareté, et de trier par rareté, prix ou note.
- **Ajouter une carte = la scanner.** C'est la seule façon d'ajouter une carte (ou un exemplaire de plus) : la photo prouve que tu l'as, et elle devient le visuel de la carte dans ta collection. Depuis la fiche d'une carte manquante, le bouton « Scanner cette carte » ouvre le scanner directement.
- **Même carte scannée plusieurs fois** : ta progression compte chaque carte **une seule fois**. Si tu scannes une carte que tu as déjà, le site te demande si c'est la même carte (sa photo est mise à jour) ou un autre exemplaire (compté comme **doublon**, utile plus tard pour les échanges). Sur une page de classeur, une carte déjà possédée ne change rien par défaut, et deux pochettes avec la même carte comptent pour 2 exemplaires.
- **Taux de drop** : affichés quand une étude sérieuse existe, avec la source (pour l'instant : 151 et Flammes Fantasmagoriques).
- **Ma collection** : toutes tes cartes au même endroit, filtrables et triables, avec un export Excel (CSV).
- **Vitrine** : ton profil de collectionneur. Clique sur « Personnaliser » pour changer le thème, les cadres, la mise en page et les cartes à l'honneur.
- **Scanner** : prends la carte en photo (webcam ou fichier), ajuste le cadre jaune autour de la carte, valide. Le site lit le numéro (ex. `025/165`) et le nom, compare ta photo aux visuels officiels, puis te propose la carte ; tu confirmes et c'est ajouté. Astuce : carte bien à plat, bien éclairée, sans reflet sur le numéro en bas.
- **Scanner une page de classeur** : onglet « ▦ Page de classeur » du Scanner. Prends une page entière en photo (9 pochettes par défaut, ou 4 / 12), ajuste la grille jaune sur les pochettes, lance la reconnaissance. Chaque carte est marquée « Reconnue ✓ », « À vérifier » ou « Non reconnue ». Seules les cartes reconnues sont cochées d'office : coche ou décoche la case « Ajouter » de chaque carte, corrige si besoin avec la liste ou « Chercher une autre carte », puis enregistre. Les dos de carte et pochettes vides sont ignorés. Si ta page contient une seule série, choisis-la dans « Série de la page » : c'est beaucoup plus fiable (sinon le site la devine quand 2 cartes sûres viennent de la même série). Le site repère tout seul les bords de chaque carte dans sa pochette (marges, carte décalée) et corrige l'éclairage. Compte 5 à 15 secondes par carte. Utilise plutôt l'appareil photo d'un téléphone, plus net qu'une webcam.
- **Page des séries** : trie par date (récentes ou anciennes), nom, progression, nombre de cartes possédées, séries presque complètes ou taille ; filtre par bloc, par année, par état ; masque les promos.
- **Paramètres** : langue, façon de compter la complétion, **sauvegarde / restauration**.

## Le site en ligne

Le site est aussi en ligne : **https://azran28.github.io/collecdex/** (PC, téléphone, tablette). Connecte-toi avec ton compte (menu « Compte ») : ta collection, tes photos et ta vitrine sont synchronisées entre tous tes appareils. Les mises à jour du site en ligne sont automatiques : recharge simplement la page.

## Quand je t'envoie une mise à jour

Je remplace directement les fichiers dans ce dossier. De ton côté :

1. **Recharge la page** dans le navigateur : touche **F5** (ou **Ctrl + F5** si rien ne change).
2. C'est tout. Pas besoin de fermer la fenêtre noire, ni de relancer le `.bat`.

Exception : si je te dis que j'ai modifié `serveur.ps1` ou `Lancer CollecDex.bat`, ferme la fenêtre noire puis relance `Lancer CollecDex.bat`.

Ta collection, tes photos et ta vitrine ne sont **jamais** touchées par une mise à jour.

## Où sont mes données ?

Dans ton navigateur, sur ce PC. Pense à faire une **sauvegarde** de temps en temps (Paramètres → Télécharger une sauvegarde). Elle contient tes cartes, tes photos et ta vitrine.

Utilise toujours le même navigateur et le lanceur `.bat` : si tu ouvres `index.html` directement, le navigateur considère que c'est un autre site et ta collection n'apparaît pas.

## Sources des données

- Cartes, raretés, images, prix : [TCGdex](https://tcgdex.dev), base libre et gratuite. Les prix Cardmarket (€) sont mis à jour chaque jour.
- Taux de drop : études publiques d'ouverture de boosters (Pokémon ne publie pas de chiffres officiels).
- Notes : ta note personnelle.

## Organisation des fichiers (pour plus tard)

- `index.html` : la page
- `css/style.css` : l'apparence
- `js/games/` : un fichier par jeu (Pokémon aujourd'hui ; One Piece, Magic… ensuite)
- `js/games/pokemon-pullrates.js` : les taux de drop et leurs sources
- `js/views/` : une page du site par fichier
