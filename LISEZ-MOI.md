# CollecDex — ton Pokédex de collection

## Lancer le site

1. Double-clique sur **`Lancer CollecDex.bat`**.
2. Une fenêtre noire s'ouvre, puis ton navigateur affiche le site (adresse `http://localhost:8765`).
3. **Laisse la fenêtre noire ouverte** pendant que tu utilises le site. Ferme-la pour l'arrêter.

> Si Windows affiche un avertissement la première fois, clique sur « Informations complémentaires » → « Exécuter quand même ». Le fichier ne fait que lancer un petit serveur local sur ton PC.

Il faut une connexion internet : les cartes, images et prix sont téléchargés depuis TCGdex puis gardés en mémoire.

## Ce que tu peux faire

- **Séries favorites** : l'étoile en haut à gauche d'une série (ou à côté de son nom) la met en favori. Tes favorites apparaissent en tête d'Explorer, et le filtre « ★ Favorites » ne montre qu'elles.
- **Capturer une carte manquante** : le bouton rond en bas à droite d'une carte que tu n'as pas ouvre directement la capture de cette carte.
- **Explorer** : toutes les séries Pokémon en français. Pour chacune, tu vois `possédées/total`, le pourcentage, les raretés, la progression par rareté, et un badge 🏆 quand elle est complète.
- **Dans une série** : toutes les cartes sont affichées ; celles que tu n'as pas sont grisées (ou affichées en « numéro seul », au choix dans les Paramètres). Clique sur une carte pour ouvrir sa fiche (prix, note, photos, quantité, versions). Les filtres permettent d'afficher les cartes possédées ou manquantes, par rareté, et de trier par rareté, prix ou note.
- **Ajouter une carte = la capturer en photo** (menu **Capturer**). C'est la seule façon d'ajouter une carte (ou un exemplaire de plus) : la photo prouve que tu l'as, et elle devient le visuel de la carte dans ton Dex. Depuis la fiche d'une carte manquante, le bouton « Capturer cette carte » ouvre directement la capture.
- **Cartes certifiées 🛡** : quand tu es connecté à ton compte et que tu captures une carte **avec la caméra du site**, le site vérifie en direct que c'est une vraie carte : juste après la photo, garde la carte dans le cadre et suis la consigne affichée pendant 2 secondes (« approche la carte », « éloigne-la », ou « déplace-la vers la flèche »). Si tout est bon, la carte reçoit le badge **Certifiée** (bouclier bleu-vert au lieu du ✓ vert). Le serveur vérifie aussi que la photo vient bien de cette capture et qu'elle n'a jamais servi ailleurs. Une photo importée depuis la galerie, ou une vérification ratée, n'empêche pas l'ajout : la carte est simplement « non certifiée », et tu peux la recapturer plus tard pour obtenir le badge. Filtre « Certifiées » dans Mon Dex.
- **Certification en page de classeur** : même principe qu'en carte seule. Après la photo de la page, suis la consigne (approcher ou reculer le téléphone, faire glisser la page vers la flèche). Seules les cartes **bien reconnues** sont certifiées : le site compare ta photo à toutes les cartes de la série et la carte choisie doit être nettement la plus ressemblante. Pour une carte difficile, le lien « la capturer seule » ouvre la capture carte par carte.
- **Recadrer depuis la page** : dans le résultat d'une page de classeur, **✂ Recadrer depuis la page** permet de replacer le cadre sur la page entière (la carte est relue ensuite). Plus tard, depuis la fiche de la carte, le ✂ sur sa photo repart aussi de la page entière, tant que la page est gardée sur cet appareil (les 30 dernières pages).
- **Effet holo** : dans la fiche d'une carte, passe la souris (ou le doigt) sur l'image : elle s'incline et brille. Plus la carte est rare, plus l'effet est marqué (reflet, arc-en-ciel, paillettes, halo doré pour les plus rares).
- **Même carte scannée plusieurs fois** : ta progression compte chaque carte **une seule fois**. Si tu scannes une carte que tu as déjà, le site te demande si c'est la même carte (sa photo est mise à jour) ou un autre exemplaire (compté comme **doublon**, utile plus tard pour les échanges). Sur une page de classeur, une carte déjà possédée ne change rien par défaut, et deux pochettes avec la même carte comptent pour 2 exemplaires.
- **Taux de drop** : affichés quand une étude sérieuse existe, avec la source (pour l'instant : 151 et Flammes Fantasmagoriques).
- **Mon Dex** : toutes tes cartes au même endroit, filtrables et triables. Le bouton **☑ Sélectionner** (juste ☑ sur téléphone) permet de supprimer plusieurs cartes d'un coup (erreur d'ajout, carte vendue…). L'export en tableur (CSV, pour Excel) est dans **Paramètres › Sauvegarde**.
- **Langue d'une série** : en haut à droite de la page d'une série, les boutons **FR / EN** changent la langue des cartes de cette série seulement (noms et visuels officiels, aussi dans Mon Dex et la fiche carte). Tes cartes et ta progression ne changent pas. Le japonais n'est pas possible ainsi : ce sont d'autres séries, avec d'autres listes de cartes.
- **L'icône 📷 sur une carte** : le visuel affiché est **ta photo** (ton scan), pas l'image officielle. Sans 📷, c'est l'image officielle.
- **Supprimer ou corriger une carte** : dans sa fiche, **Retirer de mon Dex**. Si sa photo est mal cadrée, clique sur **✂** sur la photo pour la recadrer.
- **État de la carte** (dans sa fiche, à la place de l'ancienne note) : choisis l'état sur l'échelle Cardmarket (MT Mint, NM Near Mint, EX Excellent, GD Good, LP Light Played, PL Played, PO Poor) ou « Gradée » avec la société (PSA, CGC, BGS, PCA) et la note sur 10. La **valeur estimée** en tient compte (ex. EX = 80 % du prix du marché, PSA 10 ≈ 4 × le prix, très approximatif). Tu peux saisir **« Ma valeur »** si tu connais la vraie cote : elle remplace l'estimation partout (totaux, vitrine, badges). Les cartes gradées portent une petite étiquette (« PSA 10 ») sur leur image. Tri « meilleur état » dans Mon Dex et dans les séries.
- **Prix** : ils se mettent à jour tout seuls (au plus tard toutes les 24 h), le bouton « ↻ Prix » de Mon Dex force la mise à jour.
- **Coût d'une série** (en haut de la page d'une série) : combien coûterait de la finir et la série complète, au prix du marché, avec un lien vers les prix des boosters et displays sur Cardmarket.
- **Mes objectifs** (bouton « Objectifs » dans Mon Dex, ou section de l'accueil) : trois onglets.
  - **Objectifs** : choisis une série à compléter, avec une date si tu veux (ex. « avant Noël »). Tu vois ta progression, les jours restants et combien il faudrait dépenser pour finir. Tu peux aussi le faire depuis la page d'une série (« En faire un objectif »).
  - **Ce qu'il me manque** : les cartes manquantes d'une série, les moins chères d'abord, avec le total pour tout avoir et le prix des 10 moins chères.
  - **Liste de souhaits** : les cartes que tu cherches. Ouvre une carte que tu n'as pas et appuie sur « ♡ Je la cherche » ; elle porte alors un petit cœur rose dans les séries. Une carte capturée sort toute seule de la liste. Elle servira aussi pour les futurs échanges. Tu la retrouves aussi sur l'accueil (section « Mes objectifs ») et dans ta vitrine (« Je recherche », masquable dans Personnaliser).
- **Vitrine** : ton profil de collectionneur. Le lien « Choisir mes cartes à l'honneur » sous tes cartes permet d'en choisir jusqu'à 9 (avec recherche) ; les 10 plus précieuses s'affichent en dessous. « Personnaliser » pour le thème, les cadres, la mise en page et ton **pseudo** (unique : « Valider » vérifie qu'il est libre).
- **Badges** : 35 badges secrets se débloquent en collectionnant (nombre de cartes, séries complètes, raretés, valeur, cartes certifiées, cartes anciennes, clins d'œil Pokémon…). Seuls ceux que tu as obtenus sont visibles ; une annonce apparaît quand tu en débloques un.
- **Capturer** : prends la carte en photo (webcam ou fichier), ajuste le cadre jaune autour de la carte, valide. Le site lit le numéro (ex. `025/165`) et le nom, compare ta photo aux visuels officiels, puis te propose la carte ; tu confirmes et c'est ajouté. Astuce : carte bien à plat, bien éclairée, sans reflet sur le numéro en bas. Si ta photo montre une page entière, le site te propose de passer en mode « Page de classeur ». Si tu connais la **série** de ta carte, choisis-la au-dessus de la photo : c'est bien plus fiable. Pour les cartes réimprimées à l'identique (ex. Set de Base 1999 et Évolutions 2016), utilise **Toutes les versions** et repère la tienne grâce à la série et à l'année.
- **Capturer une page de classeur** : onglet « Page de classeur » de Capturer. Prends une page entière en photo (9 pochettes par défaut, ou 4 / 12), ajuste la grille jaune sur les pochettes, lance la reconnaissance. Chaque carte est marquée « Reconnue ✓ », « À vérifier » ou « Non reconnue ». Seules les cartes reconnues sont cochées d'office : coche ou décoche la case « Ajouter » de chaque carte, corrige si besoin avec la liste ou « Chercher une autre carte », puis enregistre. Les cartes enregistrées restent affichées (✓) : tu peux continuer avec les autres de la page. Les dos de carte et pochettes vides sont ignorés. Si ta page contient une seule série, choisis-la dans l'encadré jaune « De quelle série est cette page ? » avant la photo : c'est beaucoup plus fiable. Sinon, le site ne devine la série que s'il est vraiment sûr (au moins 3 cartes reconnues avec certitude de la même série), et un bouton « Ce n'est pas la bonne série : annuler » remet tout comme avant. Tu peux aussi choisir la série après coup (« Des cartes à vérifier ? … Choisir la série »). Une carte prise pour un dos par erreur : bouton « Ce n'est pas un dos : la reconnaître ». Le site repère tout seul les bords de chaque carte dans sa pochette (marges, carte décalée) et corrige l'éclairage. Compte 5 à 15 secondes par carte. Utilise plutôt l'appareil photo d'un téléphone, plus net qu'une webcam.
- **Page des séries** : trie par date (récentes ou anciennes), nom, progression, nombre de cartes possédées, séries presque complètes ou taille ; filtre par époque, par année, par état ; masque les promos.
- **Paramètres** : langue, façon de compter la complétion, **sauvegarde / restauration**.

## Le site en ligne

Le site est aussi en ligne : **https://azran28.github.io/collecdex/** (PC, téléphone, tablette). Connecte-toi avec ton compte (bouton « Se connecter » en haut à droite) : ta collection, tes photos et ta vitrine sont synchronisées entre tous tes appareils. Les mises à jour du site en ligne sont automatiques : recharge simplement la page.

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
