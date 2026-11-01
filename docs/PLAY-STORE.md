# CollecDex sur le Play Store : la marche à suivre

Préparé le 1er novembre 2026. Le compte développeur de ton ami a été créé il y a un mois : c'est un **compte personnel récent**,
donc Google demande un **test fermé avec 12 testeurs pendant 14 jours** avant la publication (sauf si c'est un compte
« organisation » : demande-lui, dans ce cas le test n'est pas obligatoire).

Légende : 👤 = toi (ou ton ami), 🤖 = Claude. Tu ne donnes jamais de mot de passe ni de clé à Claude.

---

## Étape 1 — Nom de domaine et hébergement (👤 ~20 min, ~10 à 15 € par an)

1. 👤 Crée un compte gratuit sur **dash.cloudflare.com**.
2. 👤 **Achète le nom de domaine** : menu *Domain Registration › Register Domains*. Idées : `collecdex.app`, `collecdex.com`.
   (Le « .fr » n'existe pas chez Cloudflare : il faudrait passer par OVH, plus compliqué.)
3. 👤 **Crée une clé pour le robot GitHub** : en haut à droite *Mon profil › API Tokens › Create Token › Create Custom Token* :
   - nom : `collecdex-github` ;
   - autorisation : *Account* › *Cloudflare Pages* › *Edit* ;
   - *Continue to summary › Create Token*, puis **copie la clé** (elle ne s'affiche qu'une fois).
4. 👤 **Note ton « Account ID »** : *Workers & Pages* (menu de gauche), il est affiché à droite.
5. 👤 **Donne-les au robot GitHub** (pas à Claude) : sur github.com, dépôt `collecdex` › *Settings › Secrets and variables ›
   Actions › New repository secret* :
   - `CLOUDFLARE_API_TOKEN` = la clé de l'étape 3 ;
   - `CLOUDFLARE_ACCOUNT_ID` = l'identifiant de l'étape 4.
6. 🤖 Dis-le à Claude : à la mise en ligne suivante, le robot crée le site `collecdex.pages.dev` (même contenu que
   GitHub Pages, testé avant). Le robot est déjà prêt depuis la v4.14 (`.github/workflows/site.yml`).
7. 👤 Branche ton domaine : Cloudflare › *Workers & Pages › collecdex › Custom domains › Set up a custom domain*.
8. 👤 Supabase (supabase.com › ton projet) › *Authentication › URL Configuration* : mets le nouveau domaine dans *Site URL*
   et ajoute `https://ton-domaine/**` dans *Redirect URLs* (garde l'ancienne adresse aussi). Sinon les e-mails de connexion
   renverraient vers l'ancienne adresse.
9. 🤖 Claude met à jour l'appli pour la nouvelle adresse (sécurité du site, prix, liens).

> Ton compte et tes cartes synchronisées suivent tout seuls. Ce qui n'est gardé que sur l'appareil (réglages, photos pas
> encore envoyées) reste sur l'ancienne adresse : connecte-toi et laisse la synchronisation finir avant de changer.

---

## Étape 2 — Accès à la Play Console (👤 ton ami, 5 min)

1. Ton ami ouvre **play.google.com/console** › *Utilisateurs et autorisations › Inviter de nouveaux utilisateurs*.
2. Il met **ton adresse e-mail** et te donne les droits **Administrateur** (ou au moins : gérer les applications, les
   tests et les publications).
3. Tu reçois une invitation : accepte-la. Tu travailles ensuite avec ton propre compte Google.
4. Son compte doit avoir **son identité vérifiée** chez Google (obligatoire pour publier) : c'est à lui de le faire.

---

## Étape 3 — Créer l'appli dans la Play Console (👤 10 min)

*Créer une application* :
- Nom : **CollecDex** · Langue par défaut : **Français** · **Application** · **Gratuite** ;
- coche les deux déclarations (règlement, lois américaines sur l'export).

---

## Étape 4 — Fabriquer l'appli Android (🤖 + 👤, 15 min)

L'appli Android est une « coquille » qui ouvre le site en plein écran (Trusted Web Activity), fabriquée par
**PWABuilder** (outil gratuit de Microsoft, pwabuilder.com).

1. Sur pwabuilder.com, adresse du site = **ton nouveau domaine** › *Package for stores › Android › Generate*.
2. Réglages (🤖 Claude te les dicte au moment venu) :
   - *Package ID* : `app.collecdex.twa` (définitif : ne change plus jamais) ;
   - *Launch URL* : `/?app=play#/` (version Play Store : sans capsules, comme prévu en v2.78) ;
   - *Signing key* : *Create new*.
3. Tu télécharges un fichier `.zip`. **Garde-le précieusement** (clé USB + cloud) : il contient la **clé de signature**
   (`signing.keystore` + mots de passe). Sans elle, impossible de mettre à jour l'appli (Google peut la remplacer, mais
   c'est long).
4. Dans la Play Console : *Tester › Test fermé › Créer une version* › déposer le fichier **`.aab`** du zip.
5. Play Console › *Configuration › Intégrité de l'appli › Signature d'application* : copie l'**empreinte SHA-256** et
   donne-la à 🤖 Claude (ce n'est pas un secret). Claude publie `/.well-known/assetlinks.json` sur le site : c'est ce qui
   fait disparaître la barre d'adresse dans l'appli.

---

## Étape 5 — La fiche du Play Store (🤖 prépare, 👤 colle)

- 🤖 **Textes** : description courte (80 caractères) et longue (4 000), en français.
- 🤖 **Images** : icône 512 × 512 (`icons/icon-512.png`), bannière 1024 × 500, au moins 4 captures d'écran téléphone.
- 👤 **Questionnaires** (Claude t'aide à répondre) :
  - *Politique de confidentialité* : `https://ton-domaine/confidentialite.html` ;
  - *Accès à l'appli* : tout est accessible sans compte, sauf amis / combats en ligne / certification (compte gratuit) ;
  - *Annonces* : **non** ;
  - *Classification du contenu* : questionnaire IARC (pas de violence réelle, pas d'achats, échanges entre utilisateurs :
    **oui**, amis et combats en ligne, avec blocage et signalement) ;
  - *Public cible* : **13 ans et plus** (les fonctions sociales compliquent beaucoup les règles « enfants ») ;
  - *Sécurité des données* : voir le tableau ci-dessous ;
  - *Suppression du compte* : `https://ton-domaine/supprimer-compte.html`.

### Sécurité des données (brouillon)
| Donnée | Collectée ? | Pourquoi | Partagée ? | Facultative ? |
|---|---|---|---|---|
| Adresse e-mail | Oui (compte) | Gestion du compte | Non | Oui (l'appli marche sans compte) |
| Pseudo, avatar | Oui | Fonctions de l'appli (vitrine, amis) | Non | Oui |
| Photos des cartes | Oui | Fonctions de l'appli (Dex, certification) | Non | Oui |
| Collection (cartes, souhaits) | Oui | Fonctions de l'appli, synchronisation | Non | Oui |
| Identifiant de notifications | Oui | Notifications (amis, badges) | Non | Oui |
- Données **chiffrées en transit** : oui (https). Suppression sur demande : oui (bouton dans l'appli + page web).
- Pas de publicité, pas de revente, pas de suivi. La caméra ne sert qu'aux photos des cartes.

---

## Étape 6 — Le test fermé : 12 testeurs × 14 jours (👤)

1. Play Console › *Test fermé › Testeurs* : crée une liste d'e-mails (adresses Gmail des testeurs).
2. Chaque testeur doit **accepter l'invitation** (lien « Rejoindre le test ») puis **installer l'appli** depuis le Play Store.
3. Il faut **12 testeurs inscrits pendant 14 jours d'affilée** (les retirer ou mettre le test en pause remet le compteur à 0).
   Google regarde aussi s'ils utilisent vraiment l'appli : demande-leur de l'ouvrir de temps en temps, scanner une carte, etc.
4. Où les trouver :
   - entourage avec un téléphone **Android** (pas iPhone) ;
   - échange de tests gratuit : Reddit **r/AndroidClosedTesting**, appli **Testers Community** (tu testes leurs applis, ils testent la tienne) ;
   - services payants qui fournissent les 12 testeurs (en dernier recours).
5. 🤖 Claude peut rédiger le petit message d'invitation.

## Étape 7 — Publication (👤, après les 14 jours)

Play Console › *Tableau de bord › Demander l'accès à la production* : quelques questions sur le test (combien de testeurs,
ce qu'ils ont remonté, ce qui a été corrigé). Puis *Production › Créer une version* avec le même `.aab`, et envoi en
examen (quelques jours). Les mises à jour du site arrivent ensuite **toutes seules** dans l'appli : pas besoin de republier
sur le Play Store pour chaque nouvelle version, seulement si on change l'icône, le nom ou la coquille Android.
