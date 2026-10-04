# CollecDex — ton Pokédex de collection

## Lancer le site

1. Double-clique sur **`Lancer CollecDex.bat`**.
2. Une fenêtre noire s'ouvre, puis ton navigateur affiche le site (adresse `http://localhost:8765`).
3. **Laisse la fenêtre noire ouverte** pendant que tu utilises le site. Ferme-la pour l'arrêter.

> Si Windows affiche un avertissement la première fois, clique sur « Informations complémentaires » → « Exécuter quand même ». Le fichier ne fait que lancer un petit serveur local sur ton PC.

Il faut une connexion internet : les cartes, images et prix sont téléchargés depuis TCGdex puis gardés en mémoire.


## Travailler avec Claude Code
1. Ouvre l'application Claude sur ton PC, onglet **Code**.
2. Démarre une session **locale** en choisissant le dossier `C:\Users\Arnaud\Documents\Collection`.
3. Premier message conseillé : « Lis CLAUDE.md et FEUILLE-DE-ROUTE.md, puis prépare Git dans ce dossier comme expliqué dans CLAUDE.md. »
4. La première fois, Claude aura peut-être besoin que tu installes **Git pour Windows** (https://git-scm.com/download/win, garder les options par défaut). Au premier envoi sur GitHub, une fenêtre de connexion GitHub s'ouvre : connecte-toi toi-même.
5. Ensuite, demande ce que tu veux comme d'habitude : Claude modifie directement les fichiers du dossier, teste sur `localhost:8765` (pense à lancer `Lancer CollecDex.bat`) et met en ligne.

Claude Code te demandera parfois la permission avant de lancer une commande : c'est normal. Les commandes courantes (git, numéro de version) sont déjà autorisées dans `.claude/settings.json`.

## Ce que tu peux faire

- **Séries favorites** : l'étoile en haut à gauche d'une série (ou à côté de son nom) la met en favori. Tes favorites apparaissent en tête d'Explorer, et le filtre « ★ Favorites » ne montre qu'elles.
- **Capturer une carte manquante** : le bouton rond en bas à droite d'une carte que tu n'as pas ouvre directement la capture de cette carte.
- **Explorer** : toutes les séries Pokémon en français. Pour chacune, tu vois `possédées/total`, le pourcentage, les raretés, la progression par rareté, et un badge 🏆 quand elle est complète.
- **Dans une série** : toutes les cartes sont affichées ; celles que tu n'as pas sont grisées (ou affichées en « numéro seul », au choix dans les Paramètres). Clique sur une carte pour ouvrir sa fiche (prix, note, photos, quantité, versions). Les filtres permettent d'afficher les cartes possédées ou manquantes, par rareté, et de trier par rareté, prix ou note.
- **Ajouter une carte = la capturer en photo** (menu **Capturer**). C'est la seule façon d'ajouter une carte (ou un exemplaire de plus) : la photo prouve que tu l'as, et elle devient le visuel de la carte dans ton Dex. Depuis la fiche d'une carte manquante, le bouton « Capturer cette carte » ouvre directement la capture.
- **Cartes certifiées 🛡** : quand tu es connecté à ton compte et que tu captures une carte **avec la caméra du site**, le site vérifie en direct que c'est une vraie carte : montre d'abord le **dos** de la carte dans le cadre, puis **retourne-la** (prends ton temps : tu as 15 secondes), cadre la face et appuie **une fois** sur **« Prendre la photo »** (le bouton s'entoure de vert avec 🛡 quand le dos a été vu). La carte est recadrée toute seule (bouton « Recadrer la photo » si elle est mal cadrée). Le dos doit être **visible** : pas d'étui opaque (une pochette transparente convient). **La certification est optionnelle** : interrupteur « Certification » dans l’encadré « Certifier la carte » (vert = activée, rouge = désactivée ; désactivée = simple photo, sans badge). **Sur Android, la lampe** clignote environ 3 secondes dès que le dos est vu : une grande consigne « Ne bouge pas » avec compte à rebours s’affiche, garde le dos immobile, puis retourne la carte. Une vraie carte renvoie la lumière de la lampe au bon moment, pas un écran (sur iPhone, un site ne peut pas allumer la lampe : on s’en passe). Le site vérifie aussi qu’il a vu le dos puis la carte de biais pendant le retournement : une carte affichée sur un écran, un fondu ou une image qui glisse ne passent pas. Mieux vaut certifier à l’intérieur (en plein soleil, la lampe ne se voit plus). (Sans montrer le dos, la photo est simplement non certifiée.) Une petite bande de 3 images (dos, retournement, face) est gardée dans ton compte comme preuve. Si le numéro et le nom sont bien lus, la carte est reconnue même avec un reflet. Si tout est bon, la carte reçoit le badge **Certifiée** (bouclier bleu-vert au lieu du ✓ vert). Le serveur vérifie aussi que la photo vient bien de cette capture et qu'elle n'a jamais servi ailleurs. Une photo importée depuis la galerie, ou une vérification ratée, n'empêche pas l'ajout : la carte est simplement « non certifiée », et tu peux la recapturer plus tard pour obtenir le badge. Filtre « Certifiées » dans Mon Dex.
- **Page de classeur certifiée : retirée pour le moment** (la lampe ne marchait pas assez bien sur une page entière). Les cartes d’une page sont ajoutées sans badge ; pour certifier l’une d’elles, capture-la seule (mode « Une carte »).
- **Ancienne règle (avant la v2.25) : pas de badge en page de classeur** (on ne peut pas retourner 9 cartes d'un coup). Les cartes sont ajoutées normalement ; pour certifier l'une d'elles plus tard, ouvre sa fiche et touche « Non certifiée · la certifier » (ou le lien « la capturer seule » dans la liste), montre son dos, retourne-la, prends la photo, et choisis « La même carte : utiliser cette photo ». En rafale, chaque carte peut aussi être certifiée. Seules les cartes **bien reconnues** sont certifiées : le site compare ta photo à toutes les cartes de la série et la carte choisie doit être nettement la plus ressemblante.
- **Recadrer depuis la page** : dans le résultat d'une page de classeur, **✂ Recadrer depuis la page** permet de replacer le cadre sur la page entière (la carte est relue ensuite). Plus tard, depuis la fiche de la carte, le ✂ sur sa photo repart aussi de la page entière, tant que la page est gardée sur cet appareil (les 30 dernières pages).
- **Effet holo** : dans la fiche d'une carte, passe la souris (ou le doigt) sur l'image : elle s'incline et brille. Plus la carte est rare, plus l'effet est marqué (reflet, arc-en-ciel, paillettes, halo doré pour les plus rares).
- **Même carte scannée plusieurs fois** : ta progression compte chaque carte **une seule fois**. Si tu scannes une carte que tu as déjà, le site te demande si c'est la même carte (sa photo est mise à jour) ou un autre exemplaire (compté comme **doublon**, utile plus tard pour les échanges). Sur une page de classeur, une carte déjà possédée ne change rien par défaut, et deux pochettes avec la même carte comptent pour 2 exemplaires.
- **Taux de drop** : affichés quand une étude sérieuse existe, avec la source (pour l'instant : 151 et Flammes Fantasmagoriques).
- **Mon Dex** : toutes tes cartes au même endroit, filtrables et triables. Le bouton **☑ Sélectionner** (juste ☑ sur téléphone) permet de supprimer plusieurs cartes d'un coup (erreur d'ajout, carte vendue…). L'export en tableur (CSV, pour Excel) est dans **Paramètres › Sauvegarde**.
- **Langue d'une série** : en haut à droite de la page d'une série, les boutons **FR / EN** changent la langue des cartes de cette série seulement (noms et visuels officiels, aussi dans Mon Dex et la fiche carte). Ta progression ne change pas (une carte compte une fois, quelle que soit sa langue).
- **Langue de tes cartes** : chaque carte que tu possèdes a sa langue (FR par défaut, ou celle choisie pour la série au moment de la capture). Tu peux la changer dans la fiche de la carte (ligne « Langue »). Si elle diffère de la langue affichée, la tuile porte une petite étiquette « FR » ou « EN » et montre le visuel dans la langue de ta carte.
- **Prix** : Cardmarket donne un seul prix par carte, toutes langues confondues. Quand Cardmarket n'a pas de prix, on prend celui du marché américain (TCGplayer), **converti en euros** au taux du jour (ex. « ≈ 34 € — 38 $US, converti en euros ») ; il compte alors aussi dans la valeur de ta collection. La fiche affiche aussi, quand il existe, le prix du marché américain (cartes anglaises), converti en euros, pour info.
- Le japonais n'est pas possible ainsi : ce sont d'autres séries, avec d'autres listes de cartes.
- **L'icône 📷 sur une carte** : le visuel affiché est **ta photo** (ton scan), pas l'image officielle. Sans 📷, c'est l'image officielle.
- **Supprimer ou corriger une carte** : dans sa fiche, **Retirer de mon Dex**. Si sa photo est mal cadrée, clique sur **✂** sur la photo pour la recadrer.
- **État de la carte** (dans sa fiche, à la place de l'ancienne note) : choisis l'état sur l'échelle Cardmarket (MT Mint, NM Near Mint, EX Excellent, GD Good, LP Light Played, PL Played, PO Poor) ou « Gradée » avec la société (PSA, CGC, BGS, PCA) et la note sur 10. La **valeur estimée** en tient compte (ex. EX = 80 % du prix du marché, PSA 10 ≈ 4 × le prix, très approximatif). Tu peux saisir **« Ma valeur »** si tu connais la vraie cote : elle remplace l'estimation partout (totaux, vitrine, badges). Les cartes gradées portent une petite étiquette (« PSA 10 ») sur leur image. Tri « meilleur état » dans Mon Dex et dans les séries.
- **Prix** : ils se mettent à jour tout seuls (au plus tard toutes les 24 h), le bouton « ↻ Prix » de Mon Dex force la mise à jour.
- **Coût d'une série** (en haut de la page d'une série) : combien coûterait de la finir et la série complète, au prix du marché, avec un lien vers les prix des boosters et displays sur Cardmarket.
- **Mes objectifs** (bouton « Objectifs » dans Mon Dex, ou section de l'accueil) : trois onglets.
  - **Objectifs** : choisis une série à compléter, avec une date si tu veux (ex. « avant Noël »). Tu vois ta progression, les jours restants et combien il faudrait dépenser pour finir. Tu peux aussi le faire depuis la page d'une série (« En faire un objectif »).
  - **Ce qu'il me manque** : les cartes manquantes d'une série, les moins chères d'abord, avec le total pour tout avoir et le prix des 10 moins chères.
  - **Liste de souhaits** : les cartes que tu cherches. Ouvre une carte que tu n'as pas et appuie sur « ♡ Je la cherche » ; elle porte alors un petit cœur rose dans les séries. Une carte capturée sort toute seule de la liste. Elle servira aussi pour les futurs échanges. Tu la retrouves aussi sur l'accueil (section « Mes objectifs ») et dans ta vitrine (« Je recherche », masquable dans Personnaliser).
- **Ta page (« Mon profil »)** : touche ton avatar en haut à droite. C'est ta page de collectionneur, celle que voient tes amis (et tout le monde si tu la rends publique : le bandeau sous le titre le dit) (le petit engrenage à côté de « Personnaliser » mène au compte et aux réglages). Le lien « Choisir mes cartes à l'honneur » sous tes cartes permet d'en choisir jusqu'à 9 (avec recherche) ; les 10 plus précieuses s'affichent en dessous. **« Personnaliser »** : chaque partie de la vitrine porte alors un crayon ✎ (profil, statistiques, cartes à l’honneur, badges…) ; touche-la pour voir ses choix et les changer sur place. En haut : thème, cadre des cartes, vitrine publique. **Statistiques** : choisis jusqu’à 4 chiffres à montrer (cartes, valeur, doublons, carte la plus chère, séries commencées…), la 1re est mise en avant. Ton **pseudo** se change dans « Profil » (unique : « Valider » vérifie qu’il est libre). Les badges s’affichent en petites médailles : touche-en une pour voir son nom, ou « Tout voir » pour les voir tous avec leur description.
- **Statut du profil** (sous le pseudo, touche-le pour l'explication) : « Collection vérifiée » quand la plupart de la valeur est certifiée, « En partie vérifiée », « Non vérifiée », « Collection importée », « Nouveau collectionneur », ou **« Profil suspect »** : beaucoup de cartes chères non certifiées dont les photos sont identiques aux images du web. Pour une collection vérifiée : certifie tes cartes, surtout les plus chères.
- **Cartes hors-série** : Explorer › « Cartes hors-série » (Pikachu Illustrator, Pikachu Trophée…). Ce n'est pas une série : ces cartes ont juste l'étiquette dorée « Hors-série ». Elles se capturent comme les autres.
- **Badges** : 35 badges secrets se débloquent en collectionnant (nombre de cartes, séries complètes, raretés, valeur, cartes certifiées, cartes anciennes, clins d'œil Pokémon…). Seuls ceux que tu as obtenus sont visibles ; une annonce apparaît quand tu en débloques un.
- **Capturer** : prends la carte en photo (caméra ou photo de la galerie : la carte est trouvée et recadrée toute seule ; « Recadrer à la main » si besoin). Le site lit le numéro (ex. `025/165`) et le nom, compare ta photo aux visuels officiels (un rayon lumineux balaie la carte pendant ce temps, l'étape est écrite dessus), puis descend tout seul jusqu'aux propositions ; tu confirmes et c'est ajouté. Astuce : carte bien à plat, bien éclairée, sans reflet sur le numéro en bas. Si ta photo montre une page entière, le site te propose de passer en mode « Page de classeur ». Si tu connais la **série** de ta carte, choisis-la au-dessus de la photo : c'est bien plus fiable. Pour les cartes réimprimées à l'identique (ex. Set de Base 1999 et Évolutions 2016), utilise **Toutes les versions** et repère la tienne grâce à la série et à l'année.
- **Capturer une page de classeur** : onglet « Page de classeur » de Capturer. Prends une page entière en photo : **chaque pochette est trouvée toute seule**, même si la photo est un peu tournée ou prise en biais (les cases jaunes suivent la page), et le format est trouvé aussi (9 ou 4 cartes, ou **classeur ouvert en grand : 2 pages = 18 cartes**, photo en largeur ou en hauteur avec les cartes couchées). La reconnaissance démarre d'elle-même après 3 secondes ; touche « Ajuster d'abord » si une case est mal placée (toucher la photo repasse en grille réglable à la main : glisse-la ou tire ses coins ronds). Chaque carte est redressée, puis marquée « Reconnue ✓ », « À vérifier », « Non reconnue », « Dos de carte », « Pochette vide » ou « Autre jeu que Pokémon » (Dragon Ball, Star Wars, Wankul… sont ignorées ; bouton « C'est une carte Pokémon : la reconnaître » si le site se trompe). Seules les cartes reconnues sont cochées d'office : coche ou décoche la case « Ajouter » de chaque carte, corrige si besoin avec la liste ou « Chercher une autre carte », puis enregistre. Les cartes enregistrées restent affichées (✓) : tu peux continuer avec les autres de la page. Si ta page contient une seule série, choisis-la dans l'encadré jaune avant la photo : c'est beaucoup plus fiable. Sinon, quand la plupart des cartes de la page semblent venir de la même série, le site la **devine** et recompare les cartes incertaines à cette série (une carte n'est remplacée que si elle y est reconnue avec certitude) ; le bouton « Ce n'est pas la bonne série : annuler » remet tout comme avant. Tu peux aussi choisir la série après coup (« Des cartes à vérifier ? … Choisir la série »). Ensuite (sauf si tu décoches « Vérification par l’image des pages de classeur » dans Paramètres), chaque carte est **vérifiée par l'image** : le site compare ta photo aux visuels officiels (un réseau de neurones, puis des centaines de petits détails qui doivent tomber au même endroit) ; « image ✓ » s'affiche quand la carte est confirmée ainsi. Quand deux cartes ont le même dessin (holo / non holo, réimpression), elle reste « À vérifier ». La 1ʳᵉ fois, le site télécharge ses outils (~25 Mo), puis les visuels de chaque nouvelle série (environ 1 minute, ensuite c'est gardé). Sur une photo floue, choisir la série à la main aide beaucoup (page floue de test : 0 → 8 cartes sur 9). Si tu choisis le format de la page (9 ou 4 cartes, classeur ouvert) **avant** la photo, le site s'y tient. Une carte reconnue à l'image est **recadrée pile sur ses bords** (c'est cette photo qui va dans ton Dex), et son numéro y est relu pour lever les doutes. **Tout se passe en plein écran** : pendant l'analyse, tu vois la carte en cours en grand (un rayon lumineux la balaie), ce que le site a lu et une mini-page en couleurs (vert = reconnue, orange = à vérifier). À la fin, le site te montre **seulement les cartes douteuses**, une par une : « C’est elle », touche une autre proposition, « Chercher » ou « Ne pas l’ajouter ». Puis un **récapitulatif** de toute la page (touche une carte pour la changer) et « Enregistrer ». « Voir la liste » ouvre la liste détaillée à tout moment (l'analyse continue) ; le bouton en haut de la liste (« Vérifier les cartes douteuses » ou « Récapitulatif ») rouvre l'écran. Compte 3 à 10 secondes par carte. Utilise plutôt l'appareil photo d'un téléphone, plus net qu'une webcam, et évite le flou : sur une photo floue, les numéros deviennent illisibles.
- **Capture en rafale** : onglet « Rafale » de Capturer. Touche « Démarrer la rafale », puis présente tes cartes **une par une** dans le cadre jaune : dès qu'une carte est immobile (moins d'une seconde), elle est prise toute seule (petit flash et bip). **Pas de certification en rafale pour le moment** (pour le badge, capture la carte seule). Une carte déjà prise n'est pas reprise tant que tu ne la changes pas. Les cartes sont lues pendant que tu continues ; à la fin, touche « Pause », vérifie la liste (comme pour une page de classeur) et enregistre. « Choisir des photos » ajoute d'un coup plusieurs photos de cartes seules depuis la galerie (sans badge « Certifiée »). Si tes cartes sont toutes de la même série, choisis-la avant : c'est plus rapide et plus fiable. À la « Pause » (dès 2 cartes), ou si tu choisis plusieurs photos d'un coup, l'**écran d'analyse** s'ouvre comme pour une page de classeur : cartes douteuses une par une, puis récapitulatif et « Enregistrer ».
- **Page des séries** : trie par date (récentes ou anciennes), nom, progression, nombre de cartes possédées, séries presque complètes ou taille ; filtre par époque, par année, par état ; masque les promos.
- **Paramètres** (engrenage en haut à droite) : **ton compte** (connexion, synchronisation, déconnexion), langue, sons, façon de compter la complétion, **sauvegarde / restauration**.
- **Match** (dans le menu, à la place de Vitrine) : la future page des échanges entre collectionneurs, pour l'instant un simple écran d'attente.

## Labo (tester les méthodes de reconnaissance)
- Page à part, seulement sur ton PC : lance `Lancer CollecDex.bat` puis ouvre **http://localhost:8765/labo.html**.
- Elle prend toutes les cartes Pokémon de tes photos de test (dossier `_tests-scanner`, bonnes réponses dans `verite.json`) et compare plusieurs façons de reconnaître une carte. Touche « Lancer le test » : la 1ʳᵉ fois, il faut ~2 min pour préparer les visuels officiels, puis ~15 min pour tout tester (tu peux décocher des méthodes). Le tableau montre le pourcentage de cartes bien reconnues ; en dessous, chaque carte avec la réponse de chaque méthode (vert = bonne, jaune = dans les 3 premières, rouge = ratée).
- Pour ajouter une photo de test : mets-la dans `_tests-scanner` et demande à Claude de compléter `verite.json`.

## Versions reconnues sur la photo
- À l'ajout d'une carte (seule ou en classeur), le site choisit sa **version** d'après la photo, parmi celles qui existent pour cette carte : **holo** ou **normale** (automatique quand la carte n'existe qu'en une seule), **reverse** (le fond de la carte brille), **1ʳᵉ édition** (le petit logo noir « Édition 1 » sous l'illustration des anciennes cartes).
- La version trouvée s'affiche après l'ajout (« Version reconnue : Holo · 1ʳᵉ édition », bouton « modifier ») et dans la fiche de la carte (« reconnue sur ta photo »). Touche une version dans la fiche pour corriger.
- **Avant d'enregistrer** (page de classeur, rafale) : le récapitulatif affiche la version de chaque carte ; un **?** veut dire « à vérifier ». Touche son étiquette pour passer à la version suivante, ou touche la carte : des boutons **Normale / Holo / Reverse / 1ʳᵉ éd.** permettent de la corriger ; le visuel officiel montre alors où ça brille (holo : l'illustration ; reverse : tout sauf l'illustration), pour comparer avec ta carte. **Après l'ajout**, ouvre la carte depuis Mon Dex : section « Mon Dex » de sa fiche, ligne **Versions** (touche une version pour l'allumer ou l'éteindre).
- Le logo 1ʳᵉ édition est cherché en le comparant à un vrai logo photographié : il est trouvé sur une carte seule nette et sur une page de classeur nette (9 cartes). Sur une photo floue, le site ne met pas « 1ʳᵉ édition » (il vaut mieux l'ajouter à la main que se tromper).
- La **reverse** n'a pas encore pu être testée sur une vraie carte reverse : vérifie-la après l'ajout.

## Importer ma collection (Collectr, Cardmarket, Excel)
- **Mon Dex › Importer** (ou Paramètres › Sauvegarde › « Importer un fichier »).
- Choisis d'où vient ton fichier pour voir comment l'obtenir :
  - **Collectr** : Portfolio › les trois points en haut à droite › Export (offre PRO) : tu reçois un CSV par e-mail.
  - **Cardmarket** : exporte ta liste (stock, collection ou souhaits) en CSV.
  - **Excel / CSV** : un tableau avec au moins une colonne « Nom » (mieux avec Série, Numéro comme 4/102, Quantité). Tu peux aussi copier les cases dans Excel et les coller. Le tableur exporté par CollecDex (Paramètres) se réimporte aussi.
- L'appli reconnaît les colonnes toute seule : vérifie-les, puis « Rechercher les cartes ». Les noms et séries en anglais marchent (Charizard → Dracaufeu).
- Résultat : **Trouvée** (vert), **À choisir** (jaune : plusieurs cartes portent ce nom, touche la bonne ; « Holo » est indiqué), **Introuvable** (rouge : tape un autre nom et « Chercher »). Décoche une ligne pour ne pas l'importer.
- L'état (NM, PSA 9…), la version (holo, reverse, 1ʳᵉ édition), la quantité et la langue sont repris. Si une carte est déjà dans ton Dex : ne rien changer, garder la plus grande quantité, ou ajouter les quantités.
- Les cartes importées **ne sont pas certifiées** (pas de photo) : leur fiche dit « Importée depuis … ». Pour le badge, capture-les avec la caméra.
- Pas encore : les cartes japonaises, les anciens fichiers Excel .xls (enregistre-les en .xlsx ou CSV).

## Combat
- **Organisation (v2.75)** : l'onglet **Combat** propose d'abord 3 choix : **Contre l'ordinateur**, **En ligne** (créer ou rejoindre un salon), **Mes decks** (composer tes 3 decks = équipes). Contre l'ordinateur : choisis ton deck (étape 1), puis la difficulté (étape 2) : le combat démarre. Le mode Basique / Avancé se choisit en haut. Les règles sont en bas, à déplier.
- Onglet **Combat** (anciennement « Match ») : tu as **3 équipes** de 3 Pokémon de ta collection. « Composer » / « Modifier » pour choisir les Pokémon (dans l'ordre : le 1er commence), « Renommer » pour leur donner un nom, « Choisir » pour combattre avec cette équipe (bordure rose « Pour combattre »). Si plusieurs équipes sont prêtes, le site demande « Avec quelle équipe ? » avant chaque combat. Une case vide est remplie par un Pokémon « de prêt ».
- Sur téléphone, les 3 équipes sont des **onglets** : touche un onglet pour choisir l'équipe ; ses 3 cartes s'affichent avec les boutons Modifier / Sac / Renommer (toucher les cartes ouvre aussi le choix des Pokémon).
- Dans le choix des Pokémon, chaque carte montre ses **PV**, son **type** (pastille de couleur) et sa **plus grosse attaque** (⚔) ; filtres par **type** (les 11 types du jeu de cartes, avec le nombre de Pokémon que tu as dans chacun), **PV minimum**, **énergie** (garder ceux qui ont une attaque à 1, 2 ou 3 énergies max) et tri (plus fort, plus de PV, plus gros dégâts, attaque la moins chère, nom). Ton équipe reste affichée en haut (touche × pour retirer).
- **Deux modes** (en haut de la page) : **Basique** et **Avancé**. Chaque mode a ses propres niveaux débloqués et son propre compte de victoires / défaites.
- **Avancé** : chaque équipe a un **sac** (bouton « Sac ») de 6 cartes Dresseur ou Énergie maximum, prises dans ta collection (plusieurs exemplaires possibles si tu les as). Sans carte : sac de prêt (Potion, PlusPower, Transfert, une Énergie). À ton tour, tu peux jouer **une carte du sac** avant ton action ; chaque carte ne sert qu'une fois par combat. Les cartes inutiles sur le moment sont grisées (ex. Potion quand ton Pokémon a tous ses PV). L'ordinateur a aussi son sac (2 cartes au niveau 1, 7 au niveau Légende).
  - Énergie : +1 énergie, +2 si elle est du type de ton Pokémon (Double Énergie Incolore : +2).
  - Dresseurs connus : Potion soin 20, Super Potion soin 40, Centre Pokémon soin 40 pour tous, Rappel soin total (mais perd ses énergies), PlusPower +20 dégâts, Défenseur −20 dégâts subis, Transfert échange gratuit, Rafale de vent (l'adversaire envoie son Pokémon le plus faible), Suppression d'Énergie (−1 énergie adverse, Double : −2), Réanimation (un Pokémon K.O. revient avec la moitié de ses PV), Professeur Chen / Léo +1 énergie.
  - Les autres cartes : effet lu dans leur texte quand c'est possible (soin, dégâts en moins, sans faiblesse, soin à chaque tour…), sinon selon leur genre : Objet = soin 30, Supporter = +1 énergie, Outil = +20 PV, Stade = +10 dégâts pendant 3 tours.
- Le combat prend **tout l'écran** (sur PC : grandes cartes, ton banc à gauche, celui de l'adversaire à droite) avec des effets : la carte fonce sur l'adversaire, projectile de la couleur du type (flammes, gouttes, feuilles, éclair…), impact, secousse de l'écran, « Super efficace ! », barre de PV qui descend, K.O. qui s'effondre, arrivée des Pokémon, grande carte au milieu quand un Dresseur est joué, confettis en cas de victoire. Si ton téléphone est réglé sur « réduire les animations », les effets sont coupés.
- **5 niveaux** : Débutant, Dresseur, Champion, Maître, Légende. Chaque victoire débloque le suivant. La Légende joue avec des Pokémon-ex modernes : il faut tes cartes les plus puissantes.
- **Règles simplifiées** : au début de ton tour ton Pokémon gagne 1 énergie, puis tu **attaques** (1 énergie par symbole de l'attaque ; les énergies en plus restent pour la suite), tu prends **+1 énergie**, ou tu **changes** de Pokémon (touche-le sur ton banc). Les dégâts, faiblesses (×2) et résistances viennent de tes vraies cartes. « 30× » = pile ou face sur 2 pièces. Mets K.O. les 3 Pokémon adverses pour gagner.
- Tes victoires et défaites sont comptées.

## Combat en ligne
- Page **Combat** › choix **« En ligne »**. Il faut juste être connecté (avoir un compte CollecDex) : pas besoin d'être amis.
- **Créer un salon** : un **code de 6 caractères** s’affiche (ex. K7P3QZ). **Touche le code** (ou « Copier le code ») pour le copier, puis colle-le dans un message. Ou envoie-le à qui tu veux avec le bouton « Envoyer » (le lien ouvre directement le salon) et attends qu’il arrive.
- **Rejoindre avec un code** : tape ou colle le code qu’on t’a donné (tu peux même coller le message entier : l’appli y retrouve le code).
- **Une fois tous les deux dans le salon**, chacun choisit son équipe (on ne voit pas celle de l’autre avant le combat). L’écran indique quand l’autre a choisi ; le combat démarre tout seul quand les deux sont prêts. Quitter pendant le choix ferme le salon (ni victoire ni défaite).
- **Pile ou face** au début : une pièce tourne et montre qui commence (le même résultat sur les deux téléphones, une chance sur deux).
- Le mode (Basique ou Avancé avec le sac) est celui choisi par celui qui crée le salon. En Avancé, ton sac est visible dès le début, même quand l’autre commence (cartes grises tant que ce n’est pas ton tour ; touche-en une pour voir ce qu’elle fait).
- Vous voyez exactement le même combat, chacun sur son téléphone. Pendant le tour de l’autre : « … réfléchit ». S’il ne répond plus depuis 2 minutes, tu peux arrêter le combat (ni victoire ni défaite). « Abandonner » = défaite, et victoire pour l’autre.
- Victoires et défaites en ligne sont comptées à part (sous « Combat en ligne »).
- **Page rafraîchie ou appli fermée par erreur** : rouvre l'appli, elle te ramène toute seule dans ton salon (ou dans le combat, là où il en était). Ça marche sur le même téléphone.
- **À faire dans Supabase** : *SQL Editor*, coller `supabase-v10.sql` › *Run* (même si tu l’avais déjà fait : la nouvelle version enlève l’obligation d’être amis). Avant ça : « Les combats en ligne ne sont pas encore activés sur le serveur ». Puis coller `supabase-v12.sql` › *Run* (choix des équipes dans le salon).

## Amis
- **Mes amis** : sur ta vitrine (touche ton avatar), bouton « Amis ». Ajoute quelqu'un avec son **pseudo**, ou envoie-lui **ton lien d'invitation** (bouton « Partager » / « Copier ») : il ouvre le site, crée son compte, et la demande d'ami est prête.
- Une demande reçue apparaît sur l'accueil et sur ton avatar (petite pastille rose). Une fois amis, « Sa vitrine » montre sa collection (cartes à l'honneur, badges, les plus précieuses, ce qu'il recherche, avec « ✓ Tu l'as » sur les cartes que tu possèdes). En lecture seule : il ne peut rien modifier chez toi, et un inconnu ne voit rien.
- Pour qu'un ami puisse s'inscrire : voir « À faire une fois dans Supabase » ci-dessous.

## Vitrine publique (à partager avec tout le monde)
- Ta vitrine › **Personnaliser** › bouton **« Vitrine publique »** en haut : coche « Tout le monde peut voir ma vitrine avec le lien ». Il faut être connecté et avoir réservé ton pseudo.
- Ton adresse : `https://azran28.github.io/collecdex/#/@TonPseudo`. Bouton **Partager** (sur téléphone : WhatsApp, Messages…) ou **Copier**, aussi en haut de ta vitrine. N'importe qui l'ouvre, même sans compte, en lecture seule.
- « Montrer mes photos des cartes » : décoché, les visiteurs voient les visuels officiels à la place de tes photos.
- On y voit tes cartes à l'honneur, tes **cartes certifiées** (bouclier vert), tes badges et ce que tu as choisi d'afficher. Jamais tes notes ni tes objectifs. Décoche la case pour la rendre de nouveau privée (tes amis la voient toujours).
- **À faire une fois** : dans Supabase › *SQL Editor*, coller `supabase-v9.sql` › *Run*. Avant ça, le lien affiche « Les vitrines publiques ne sont pas encore activées sur le serveur ».

### À faire une fois dans Supabase (pour les amis et les nouveaux comptes)
1. *SQL Editor* → coller `supabase-v4.sql` → *Run* (active les amis).
2. *Authentication* → *Sign In / Providers* → *Email* → désactiver **« Confirm email »** → *Save*. Sans ça, tes amis ne reçoivent pas l'e-mail de confirmation : l'envoi d'e-mails gratuit de Supabase ne marche que pour toi (et 2 e-mails par heure au maximum). Ils pourront ainsi créer leur compte et se connecter tout de suite.
3. *Authentication* → *URL Configuration* → *Site URL* : `https://azran28.github.io/collecdex/`.
- Limite qui reste : « Mot de passe oublié » n'envoie d'e-mail qu'à toi. Pour tes amis, il faudra brancher un service d'e-mails gratuit (Brevo, Resend…) plus tard.

## Capsules et Pokédex
- **Une capsule arrive toutes les heures** (10 au maximum en réserve). Ouvre-la dans **Capsules** (la petite capsule en haut de l'écran, avec le nombre à ouvrir, ou la carte sur l'accueil) : tu attrapes un Pokémon.
- Chances : commun 50 %, peu commun 28 %, rare 15 %, très rare 4,5 %, légendaire 2 %, fabuleux 0,5 %, et 1 % de chance qu'il soit **chromatique** (couleurs spéciales). Plus il est rare, plus l'ouverture est spectaculaire, avec un petit son (épique pour les légendaires). Touche l'écran pour passer l'animation. Le haut-parleur à côté du bouton « Ouvrir » (ou Paramètres › Sons) coupe le son.
- **Mon Pokédex** (même page) : les 1025 Pokémon rangés par région, ceux que tu as attrapés, combien de fois, et les chromatiques.
- **Avatar** : touche un de tes Pokémon puis « En faire mon avatar » (ou ta page › Personnaliser › touche ton avatar). L'ancienne photo de profil disparaît.
- Il faut être connecté : les capsules et les tirages sont gardés sur le serveur, pour que personne ne puisse tricher avec l'heure du téléphone.
- **À faire une fois** : dans Supabase, *SQL Editor* → coller le contenu de `supabase-v3.sql` → *Run*.
- **Boutique** (sous les capsules) : vends tes Pokémon pour gagner des **éclats** (la monnaie du site), puis achète des capsules. Prix de vente : commun 1, peu commun 3, rare 8, très rare 20, légendaire 100, fabuleux 150 (×5 pour un chromatique). Une **capsule** coûte 20 éclats (elle s'ajoute à ta réserve, sans limite de 10) ; une **grande capsule** (dorée) coûte 150 éclats : jamais de commun ni de peu commun, 1 chance sur 5 d'un légendaire ou d'un fabuleux, 3 % de chromatique.
- Pour vendre : bouton « Vendre » juste après une ouverture, « Vendre mes doublons » (tu gardes un exemplaire de chaque Pokémon et tous tes chromatiques), ou touche un Pokémon de ton Pokédex. Le site demande confirmation pour ton dernier exemplaire, un légendaire, un fabuleux ou un chromatique ; ton Pokémon d'avatar ne peut pas être vendu s'il ne t'en reste qu'un. Tout est compté sur le serveur (personne ne peut se donner des éclats). Une offre de la boutique s'entoure d'une bordure quand tu as assez d'éclats pour l'acheter.
- **À faire une fois** : lancer `supabase-v5.sql` dans Supabase (SQL Editor), sinon la boutique affiche « Il reste une étape ».
- **Fiche d'un Pokémon** : touche n'importe quel Pokémon de ton Pokédex (même pas encore attrapé) : tu vois sa famille d'**évolutions** et sa **version chromatique** ; ceux que tu n'as pas sont grisés avec un « ? ». Touche une évolution pour ouvrir sa fiche. « Attrapés seulement » apparaît quand tu choisis une région (« Tous » ne montre déjà que tes Pokémon).
- **Ouvrir à la chaîne** : à la fin d'une ouverture, touche le Pokémon pour ouvrir la capsule suivante.

## Notifications
- **Paramètres › Notifications** : coche « Notifications sur cet appareil » (le navigateur demande l'autorisation), puis choisis lesquelles recevoir. **« Ma réserve de capsules est pleine »** (10 capsules à ouvrir) et **« Je reçois une demande d'ami »** (avec le pseudo de celui qui demande ; la toucher ouvre la page Amis), même quand le site est fermé.
- Le réglage est propre à chaque appareil (téléphone, ordinateur) ; te déconnecter les coupe sur cet appareil.
- **iPhone** : les notifications ne marchent qu'avec l'appli **installée** sur l'écran d'accueil (iOS 16.4 ou plus récent) : installe-la, ouvre-la, puis active les notifications dans ses Paramètres.
- **À faire une fois dans Supabase** (2 étapes) :
  1. *SQL Editor* → coller `supabase-v7.sql` → *Run* (notifications + nouvelle certification).
  2. *Edge Functions* : la fonction d'envoi s'appelle **`hyper-processor`** (nom choisi par Supabase). Son code = le fichier `supabase/functions/capsule-notify/index.ts` (onglet *Code* → tout remplacer → *Deploy*), « Verify JWT » désactivé dans *Settings*. Le serveur l'appelle tout seul toutes les 5 minutes.
  3. **Demandes d'ami (v2.62)** : *SQL Editor* → coller `supabase-v11.sql` → *Run*, puis remettre à jour le code de **`hyper-processor`** comme à l'étape 2 (le fichier a changé).
- Pour le moment, une carte dans un **étui opaque** ne peut pas être certifiée : le site doit voir le dos Pokémon (c'est ce qui prouve que ce n'est pas un écran). Une pochette transparente convient.

## Sécurité
- Le site ne fait jamais confiance aux données des autres dresseurs : un texte piégé dans la vitrine ou l'avatar d'un ami s'affiche comme du simple texte, sans jamais s'exécuter.
- La page n'exécute que son propre code et celui de bibliothèques connues, dont la version est figée et vérifiée (le navigateur refuse un fichier modifié).
- **À faire une fois** : lancer `supabase-v6.sql` dans Supabase (SQL Editor → coller → *Run*). Rien ne change à l'écran : la liste des pseudos n'est plus lisible en entier, une demande d'ami en attente ne montre plus ton nombre de cartes, et la taille des données envoyées est limitée (contre les abus).
- Conseillé dans Supabase : *Authentication* → *Providers* → *Email* → longueur minimale du mot de passe à **8**.

## L'appli sur ton téléphone
- Ouvre le site sur ton téléphone : un bandeau **« Installe CollecDex »** apparaît sous l'accueil. Touche **Installer**, et l'icône CollecDex arrive sur ton écran d'accueil.
- Sur iPhone : dans **Safari**, bouton **Partager** puis **« Sur l'écran d'accueil »** (le bouton Installer t'explique).
- Le bouton est aussi dans **Paramètres › Application** (marche aussi sur ordinateur, avec Chrome ou Edge).
- L'appli s'ouvre en plein écran et reste consultable **sans réseau** : ta collection, tes photos, les séries et visuels déjà vus. Les prix, la synchro et la capture ont besoin du réseau.
- Les mises à jour arrivent toutes seules, comme sur le site.
- **Sur téléphone, le site se comporte comme une appli** : une flèche **‹** en haut à gauche ramène à la page précédente (séries, paramètres, amis, capsules…) ; l'accueil tient en un écran et demi (bouton « Capturer une carte » + raccourcis « Page de classeur » et « Rafale », tes séries en cours et tes derniers ajouts dans des rangées qui défilent de côté) ; la page Capturer est compacte (Une carte / Classeur / Rafale en onglets, série sur une ligne, grande zone photo avec les boutons juste en dessous).
- **Présentation à la première ouverture** : sur téléphone, la toute première fois, 5 écrans animés expliquent l'appli (bienvenue, capturer une carte ou une page de classeur, ta collection, les séries, les combats). Fais-les glisser du doigt ou touche « Suivant » ; « Passer » en haut à droite. Pour la revoir : **Paramètres › Application › Revoir la présentation de l'appli**.
- **Mode d'emploi de Capturer** : sur téléphone, la première fois que tu ouvres **Capturer**, 6 écrans animés expliquent tout en détail : les 3 façons de capturer (une carte, classeur, rafale), choisir la série, réussir sa photo (comme ça / pas comme ça), ce que fait l'appli pendant l'analyse (vert = reconnue, orange = à vérifier), le récapitulatif et l'enregistrement, puis le badge « Certifiée ». Pour le revoir : bouton **?** en haut de Capturer, au bout des onglets.
- L'appli garde **toujours le même aspect**, même si ton téléphone est réglé en « mode sombre » (il ne l'assombrit plus).

## Le site en ligne

Le site est aussi en ligne : **https://azran28.github.io/collecdex/** (PC, téléphone, tablette). Connecte-toi avec ton compte (bouton « Se connecter » en haut à droite, ou Paramètres › Compte) : ta collection, tes photos et ta vitrine sont synchronisées entre tous tes appareils. Les mises à jour du site en ligne sont automatiques : recharge simplement la page.

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

## Confidentialité et suppression du compte
- La **politique de confidentialité** est sur `confidentialite.html` (lien dans Paramètres › Données › À propos, et sous « Créer un compte »). C'est l'adresse à donner à Google Play.
- **Supprimer son compte** : Paramètres › Mon compte › « Supprimer mon compte… », écrire SUPPRIMER, confirmer. Tout est effacé du serveur (cartes, photos, vitrine, pseudo, capsules, amis, notifications, e-mail). La page publique `supprimer-compte.html` explique la marche à suivre : c'est l'adresse « suppression de compte » à donner à Google Play.
- **À faire une fois** : lancer `supabase-v13.sql` dans Supabase (SQL Editor). Sans lui, le bouton affiche « La suppression n'est pas encore installée sur le serveur » et n'efface rien.
