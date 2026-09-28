# CollecDex — état du projet et feuille de route

## En ligne (septembre 2026)
- Site : https://azran28.github.io/collecdex/ (GitHub Pages, dépôt Azran28/collecdex, branche main). Claude publie les mises à jour directement.
- **Appli installable** (PWA) : icône sur l'écran d'accueil, plein écran, hors ligne (service worker `sw.js`, manifeste `manifest.webmanifest`, icônes dans `icons/`).
- Comptes et synchronisation : Supabase, projet zjzfwhtqrigfmqzfebzy (offre gratuite). Tables `items` et `profiles` + stockage `photos`, protégés par RLS.
- Scripts SQL à exécuter une fois, dans l'ordre : `supabase-setup.sql`, `supabase-certif.sql`, `supabase-v2.sql`, `supabase-v3.sql` (capsules), `supabase-v4.sql` (amis), `supabase-v5.sql` (boutique des capsules), `supabase-v6.sql` (sécurité), `supabase-v7.sql` (certification par retournement, notifications) + fonction `capsule-notify` dans Edge Functions. Pour que d'autres puissent s'inscrire : désactiver « Confirm email » dans Supabase (l'envoi d'e-mails gratuit ne marche que pour Arnaud). `supabase-mes-certificats.sql` (certifie les cartes déjà présentes chez Arnaud) est seulement sur son PC, pas sur GitHub.
- Version PC (localhost:8765 via `Lancer CollecDex.bat`) : même code, avec compte et synchronisation.
- Contexte permanent pour Claude : `CLAUDE.md` et cette feuille de route `FEUILLE-DE-ROUTE.md` (dans le dépôt et le dossier du PC ; copie dans le projet claude.ai « Collection »).

## Idées retenues (liste du 25 septembre 2026)
Rangées par thème. ✅ = fait, ✗ = écartée par Arnaud.

**1. Collectionner au quotidien** ✅
- ✅ Liste de souhaits (cartes recherchées), base des futurs échanges.
- ✅ Objectifs personnels (finir une série, avec date facultative).
- ✅ « Ce qu'il me manque » : cartes manquantes les moins chères pour avancer.
- ✗ Historique / graphique de la collection (pas utile pour Arnaud).
- ✗ Mode « ouverture de booster » (pas convaincant).

**2. Valeur et marché** ✅
- ✗ Évolution des prix (les prix se mettent à jour tout seuls, pas besoin d'historique).
- ✅ État de la carte (Mint → Poor, ou gradée + note) pris en compte dans la valeur ; « Ma valeur » manuelle prioritaire.
- ✅ Coût estimé pour finir une série et pour la série complète + lien vers les prix des boosters/displays sur Cardmarket.

**En plus (demandes d'Arnaud)** ✅ séries favorites, bouton Capturer sur les cartes manquantes, export CSV rangé dans Paramètres, langue par série (FR/EN) et langue de chaque carte possédée (le japonais = autres séries chez TCGdex, écarté pour l'instant).

**Capsules (idée d'Arnaud, 25 sept.)** ✅ une capsule par heure (10 max), ouverte côté serveur, Pokémon tiré selon sa rareté (commun 50 %, peu commun 28 %, rare 15 %, très rare 4,5 %, légendaire 2 %, fabuleux 0,5 %, chromatique 1 %), animation selon la rareté, Mon Pokédex (1025 espèces par région), avatar choisi parmi ses Pokémon. ✅ Boutique : vendre ses Pokémon contre des **éclats**, acheter capsules et grandes capsules. Pistes : badges Pokédex, échanges de Pokémon, afficher son Pokédex dans la vitrine publique.

**3. Social** (le cœur à terme)
- ✅ Amis : ajout par pseudo ou lien d'invitation, demandes reçues/envoyées, vitrine d'un ami en lecture seule (avec « ✓ Tu l'as » sur ce qu'il recherche).
- Vitrine publique partageable (`collecdex/@pseudo`), cartes certifiées mises en avant.
- Échanges : doublons « disponibles », correspondances avec la liste de souhaits des autres, propositions d'échange.
- Classements et défis du mois, badges exclusifs.
- Amis : suivre des collectionneurs.

**4. Capture**
- ✅ Capture en rafale (caméra ouverte, cartes prises toutes seules quand elles sont immobiles, certification carte par carte ; import de plusieurs photos d'un coup).
- ✅ Détection automatique de la grille du classeur (format compris, photo tournée ou en biais, classeur ouvert 18 cartes ; reconnaissance lancée seule après 3 s).
- ✅ (1re version) Reconnaissance des versions : holo/normale déduites, reverse et logo 1re édition comparés au visuel officiel. Réglage prudent, à recalibrer avec des photos nettes d'une vraie reverse et d'une vraie 1re édition.
- Import depuis d'autres applis (Cardmarket, Collectr, Excel), cartes non certifiées.
- Reconnaissance : encore faible sur les holos à fort reflet (Arceus, Airmure ex de loin), les photos floues et très en biais ; reverse jamais testée sur une vraie carte.

**5. Côté Pokédex**
- Dex par Pokémon (tous les Pikachu…), vue par illustrateur, classeur virtuel à feuilleter.

**Combat (ex-« Match », idée d'Arnaud)** ✅ contre l'ordinateur : **3 équipes** de 3 Pokémon de sa collection (nommées, choisies avant le combat, composées avec des filtres de combat : les 11 types du JCC, PV, énergie, tris par force / PV / dégâts / attaque la moins chère), 5 niveaux (Débutant → Légende), règles simplifiées (énergie par tour, attaques/PV/faiblesses des vraies cartes, pièces). ✅ Combat plein écran sur PC avec effets (attaque qui fonce, projectile par type, impacts, secousses, K.O., confettis).
- ✅ **2ᵉ mode « Avancé »** (ex-« Avec Dresseurs ») (idée d'Arnaud du 27 sept.) : chaque équipe a un sac de 6 cartes Dresseur/Énergie max ; 1 carte par tour avant l'action, chaque carte une fois par combat ; effets simplifiés (cartes connues du Set de Base, sinon lecture du texte, sinon genre Objet/Supporter/Outil/Stade) ; l'ordinateur a son sac (2 à 7 cartes selon le niveau) ; niveaux débloqués à part. Ses autres pistes de départ : (1) deux actions par tour (attaque + carte), (2) énergie OU carte avec un nombre limité — le mode actuel mélange les deux.
- À venir : combats entre amis, decks plus grands, récompenses (éclats ?), équilibrage du mode Dresseurs après les premiers essais d'Arnaud. Les règles complètes du JCC avec tous les effets de cartes ne sont pas réalistes ; la version simplifiée l'est.

**6. Confort** (en cours)
- ✅ Application installable sur le téléphone (icône, plein écran, hors ligne).
- ✅ Notifications (réglables dans Paramètres) : réserve de capsules pleine. À ajouter : demande d'ami reçue, carte recherchée proposée, badge débloqué.

## Historique des versions
- **v2.29 (28 sept.)** : le scanner lit les **attaques et talents** de la carte (noms + dégâts) pour trouver la version exacte parmi toutes les cartes du même Pokémon — cartes reconnues avec certitude sur 5 pages de test : 8 → 24 (page 02 : 3→6, 09 : 0→4, 13 : 0→7, 17 : 4→6). Corrigé : blocage possible de la liste du classeur, lecture qui ralentissait à la longue, attente quand le serveur d'images de TCGdex est en panne.
- **v2.28 (28 sept.)** : scanner plus rapide et plus juste — 2 lectures de texte en parallèle, arrêt dès que le numéro est sûr (≈ 2 × plus rapide), visuels officiels gardés sur l'appareil ; le nom du Pokémon est cherché dans tout le texte de la carte (Kadabra n'est plus pris pour Rototaupe) ; **21 séries absentes de la base française ajoutées** (Arceus, Base Set 2, Gym Heroes/Challenge, Legendary Collection, Skyridge…), visibles aussi dans Explorer. Mesuré sur 5 pages : ~40 % plus rapide, page Set de Base 9/9, page Arceus 0 → 7 cartes trouvées.
- **v2.27 (28 sept.)** : classeur — « une carte fait toujours la même taille » (idée d'Arnaud) : la page est redressée comme vue de face et tous les cadres doivent y avoir la même taille (plus de cadres ajustés, tous justes) ; la brillance de chaque carte (normale / holo / reverse / 1ʳᵉ édition) est mesurée et affichée dans la liste, modifiable avant d'enregistrer.
- **v2.26 (27 sept., soir)** : certification d'une page plus simple — bouton « 🛡 Photo certifiée » (plus de case à cocher), et il suffit de **toucher du doigt** la carte qui s'allume puis de retirer la main (au lieu de la sortir de sa pochette : trop instable d'une main).
- **v2.25 (27 sept., soir)** : **certification d'une page de classeur** (idée retenue par Arnaud) — avec « Caméra dans la page », une carte tirée au sort par le serveur s'allume : on la fait glisser hors de sa pochette puis on la remet ; seule cette case doit bouger → badge « Certifiée (classeur) » pour les cartes reconnues. `supabase-v8.sql` à lancer. v2.24 : cadres du classeur écartés s'ils n'ont pas la taille de leurs voisins de rangée ou s'ils touchent une carte voisine (idée d'Arnaud).
- **v2.23 (27 sept., soir)** : classeur — chaque case est ajustée sur les vrais bords de sa carte (cadres jaunes sur la carte, plus sur la pochette), la bordure de la carte est reconnue à sa couleur ; lecture prudente (la carte ajustée n'est retenue que si elle rend la reconnaissance sûre). Holo ou normale : mesurée sur la photo quand la carte existe dans les deux versions (à calibrer).
- **v2.22 (27 sept., soir)** : page de classeur — « Prendre la page en photo » ouvre l'appareil photo du téléphone (plein écran, pleine qualité) ; « Choisir une photo » ouvre la galerie ; la caméra dans la page reste possible (cadrée toute seule, toute la largeur de l'écran). Capsules : sur la dernière capsule, toucher le Pokémon ramène à la page des capsules.
- **v2.21 (27 sept., soir)** : la photo est prise à l'instant exact de l'appui (avant, elle partait 1 à 2 s plus tard) ; la certification vérifie que la photo montre bien la carte vue juste après le retournement (une photo de la table ou d'une autre carte n'est plus certifiée).
- **v2.20 (27 sept., soir)** : détourage automatique — la carte photographiée (carte seule et rafale) est découpée au ras de ses bords et remise à plat même un peu penchée ; plus de table ni de marge autour. Si les bords ne sont pas sûrs, recadrage habituel (et « Recadrer à la main » reste possible). v2.19 : bonne carte proposée en 1er = certifiable ; bouton « ✓ Photo prise — recherche de la carte… ».
- **v2.18 (27 sept., soir)** : capture d'une carte plus simple — la caméra se place toute seule à l'écran (plus besoin de faire défiler), un seul appui sur « Prendre la photo » compte (« Photo en cours… » tout de suite ; les appuis répétés donnaient « serveur de certification injoignable »), plus d'étape de cadrage (carte recadrée toute seule au plus près des bords, « Recadrer » si besoin), recherche plus rapide (60 visuels comparés au plus au lieu de 100), « Illustration : identique / très proche / proche » et « Numéro lu ✓ » au lieu d'un pourcentage trompeur ; rappel que le dos doit être visible (pas d'étui opaque).
- **v2.17 (27 sept., soir)** : certification plus souple — après le dos, on a 15 s pour retourner et cadrer la carte, puis on appuie soi-même sur « Prendre la photo » (bouton vert 🛡 quand le dos a été vu) ; seul le geste juste après le dos est vérifié. Notifications en service (fonction `hyper-processor`). Page Capturer réparée (cassée en v2.16).
- **v2.16 (27 sept., fin d'après-midi)** : certification refaite après les essais d'Arnaud (trop longue, ratée avec un étui, carte bien photographiée refusée à 27 %) — « dos d'abord » : on montre le dos, on retourne la carte, la photo se prend toute seule (≈ 1 s, un seul geste, aussi en rafale) ; une carte dont le numéro et le nom sont lus est reconnue sans dépendre de la ressemblance d'image. Fiche Pokémon : plus de saut de page à l'ouverture, taille fixe, un Pokémon seulement chromatique s'affiche en chromatique (la version normale est grisée, pas d'avatar normal possible).
- **v2.15 (27 sept., après-midi)** : **nouvelle certification** — il faut retourner la carte (montrer le dos, puis la face) ; filmer un écran ou une photo ne marche plus ; bande de 5 images gardée comme preuve ; plus de badge en page de classeur (recapture seule depuis la fiche). **Notifications** (Paramètres › Notifications) : « ma réserve de capsules est pleine », même site fermé. Capsules : fiche de chaque Pokémon (même non attrapé) avec ses évolutions et sa version chromatique, toucher le Pokémon pour ouvrir la suivante, « Attrapés seulement » seulement dans une région. `supabase-v7.sql` + fonction `capsule-notify` à créer.
- **v2.14 (27 sept., après-midi)** : relecture complète et sécurité — les données des amis sont filtrées (un avatar ou une vitrine piégés ne peuvent plus exécuter de code, même via une simple demande d'ami), règles de sécurité du navigateur (CSP), bibliothèques à version figée et vérifiée, module de connexion téléchargé plus tôt (accueil plus rapide), « Effacer toute ma collection » efface aussi dans le compte quand on est connecté, script `supabase-v6.sql` (pseudos non listables, nombre de cartes caché pour les demandes en attente, taille max des données).
- **v2.13 (27 sept., midi)** : projet prêt pour Claude Code — `FEUILLE-DE-ROUTE.md` dans le dossier, `stamp.ps1` (numéro de version sous Windows), `.gitignore` (fichiers perso du PC), `.claude/settings.json` (commandes git autorisées), `CLAUDE.md` : où travaille Claude selon la session et mise en place de Git sur le PC.
- **v2.12 (27 sept., midi)** : « Match » devient **Combat** (menu, page, adresse #/combat), modes **Basique** / **Avancé**, victoires/défaites comptées par mode, une attaque ne dépense plus que son coût en énergie (le reste est gardé), textes de la page raccourcis, équipes en onglets sur téléphone.
- **v2.11 (27 sept., midi)** : Match — 2ᵉ mode « Avec Dresseurs » (sac de cartes Dresseur/Énergie, grande carte au milieu quand elle est jouée, états 🛡 ⚔ 🏟 🔧 sous les PV, sac de l'ordinateur) ; sur téléphone les équipes passent derrière un bouton « Équipes » ; bouton « Choisir » sur les équipes (la carte entière n'est plus cliquable).
- **v2.10 (27 sept., fin de matinée)** : Match — filtres pour composer une équipe : chaque carte affiche PV, type et plus grosse attaque ; filtres type (les 11 types du JCC, grisés si aucun, avec le nombre), PV minimum, énergie max d'une attaque ; tris plus fort / PV / dégâts / attaque la moins chère / nom ; équipe en cours affichée en haut.
- **v2.9 (27 sept.)** : Match — 3 équipes à composer et renommer, « Avec quelle équipe ? » avant le combat ; combat en plein écran sur PC (grandes cartes, bancs sur les côtés) ; effets et mouvements : concentration, carte qui fonce, projectile de la couleur du type (éclair pour Électrique), impact, secousse, « Super efficace ! », barre de PV qui descend, K.O. qui s'effondre, entrée des Pokémon, confettis ; nouveaux sons.
- **v2.8 (26 sept., après-midi)** : boutique des capsules — vendre ses Pokémon contre des éclats (commun 1 … légendaire 100, fabuleux 150, chromatique ×5), acheter des capsules (20) et des grandes capsules (150 : rare ou mieux, 1 chance sur 5 de légendaire/fabuleux) ; bordure seulement quand on a assez d'éclats. Script supabase-v5.sql à lancer.
- **v2.7 (26 sept.)** : scanner amélioré grâce aux 21 photos d'Arnaud — cases suivies même en biais et redressées, classeur ouvert (18 cartes, cartes couchées), dos / pochettes vides / autres jeux (Dragon Ball, Star Wars, Wankul) reconnus et ignorés, logo 1ʳᵉ édition comparé à un vrai logo, série de la page devinée plus souvent (réimpressions Set de Base / Évolutions départagées), PV lus pour départager, serveur d'images TCGdex capricieux contourné ; nouveau mode **Rafale**.
- **v2.6 (25 sept., fin d'après-midi)** : classeur — grille placée toute seule + découpe fine de chaque pochette ; versions reconnues automatiquement sur la photo (modifiables).
- **v2.5 (25 sept., après-midi)** : Match — combats simplifiés contre l'ordinateur (5 niveaux, animations, sons).
- **v2.4 (25 sept., midi)** : amis (supabase-v4.sql) et vitrine des amis, invitations par lien, page Match réorientée : cartes jouables (decks, combats contre amis / ordinateur) — idée à venir.
- **v2.3 (25 sept., midi)** : la vitrine devient la page du compte (avatar en haut à droite) et ne saute plus au défilement ; connexion et synchro rangées dans Paramètres ; onglet **Match** à la place de Vitrine ; pastille Capsules bien visible dans l'en-tête ; sons d'ouverture (plus épiques selon la rareté) ; compte à rebours en direct sur l'accueil ; bouton « Prendre la photo » toujours visible ; certification en ~1 s ; nouvelle icône Paramètres.
- **v2.2 (25 sept.)** : capsules et Pokédex (script `supabase-v3.sql`), avatar Pokémon.
- **v2.1 (25 sept., matin)** : appli installable (bandeau « Installer » sur l'accueil du téléphone, bloc Application dans Paramètres, hors ligne : site, visuels déjà vus, polices et bibliothèques gardés), langue FR/EN par série et par carte possédée, prix « toutes langues » + marché US indicatif, export CSV dans Paramètres, en-tête Mon Dex compact sur téléphone.
- **v2.0 (25 sept.)** : liste de souhaits, objectifs, ce qu'il me manque, état des cartes et valeur estimée, coût des séries, séries favorites, fiche carte épurée, effets de cartes (inclinaison au survol).
- **v1.9 (24 sept., soir)** : page Capturer repensée (choix carte/classeur en grandes cases, mode d'emploi, boutons toujours visibles, série mise en avant), série du classeur devinée seulement si très sûre et annulable, « ce n'est pas un dos », caméra sans bandes noires, vitrine éventail adaptative, un seul bouton Personnaliser, certification : règle de reconnaissance relative + raison d'échec affichée.
- **v1.8** : passe responsive (vitrine, Mon Dex, accueil, séries), vraie photo pleine résolution en classeur, visuel photo/officiel appliqué sans recharger.
- **v1.7** : certification en classeur, recadrage depuis la page, badges secrets, pseudo unique, effet holo, photos recadrées synchronisées.
- **v1.6** : cartes certifiées (défi en direct tiré par le serveur, vérifications serveur, badge).
- **v1.5** : refonte visuelle « pop » (logo, icônes, noms Explorer / Capturer / Mon Dex / Époques / Licences).
- **v1.4 et avant** : scan de classeur, doublons, filtres, ajout uniquement par scan, données TCGdex, vitrine, taux de drop.

## Décisions
- Adaptateurs par jeu (`js/games/registry.js`) ; TCG Pocket masqué.
- Certification : l'import de photo reste possible mais sans badge ; l'identité de la carte est prouvée par la ressemblance relative, pas par le numéro.
- Langue : une carte compte une fois quelle que soit sa langue ; Cardmarket donne un seul prix toutes langues confondues.
- Voir `CLAUDE.md` pour les pièges techniques connus.
