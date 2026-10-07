---
paths:
  - "js/friends.js"
  - "js/views/friends.js"
  - "js/views/showcase.js"
  - "supabase-v4.sql"
  - "supabase-v9.sql"
  - "supabase-v14.sql"
  - "supabase-v16.sql"
---
# Amis et vitrine
**Rappel** : la liste de souhaits n'est jamais montrée aux autres ; pas d'échanges ni de ventes.

## Amis (`supabase-v4.sql`, `js/friends.js`, `#/amis`)
- Table `friendships` a→b pending/accepted, `are_friends`, `friend_request(pseudo)` (accepte direct si demande croisée), `friend_respond`, `friend_remove`, `friend_list`, `friend_showcase(uid)` (profil + cartes + certifs seulement si amis), règle de stockage « photos de mes amis ».
- Invitation par lien `#/amis?ajout=Pseudo` gardée dans `kv.invite` jusqu'à la connexion. Vitrine d'un ami = `views/showcase.js` avec `params.friend` (`#/ami/<uid>`, lecture seule, source de données `S`). `App.col.progress(game, set, items)` et `App.badges.unlocked(items, isCert)` acceptent les cartes d'un autre dresseur.
- Filtrage obligatoire de tout ce qui vient d'un autre : `cleanRow`, `cleanItem`, `cleanProfile` (jeu connu, thèmes/cadres de la liste, avatar = entier 1…1025, photos `[A-Za-z0-9_-]`, images seulement `assets.tcgdex.net` + hors-série).
- **Bloquer / signaler (v2.77, `supabase-v14.sql`)** : `App.friends.moderate(uid, pseudo)` (Signaler / Bloquer, 6 raisons `REASONS`, précisions ≤ 500, « Bloquer aussi » coché) ; `block`, `unblock`, `blocked`, `report`. Boutons : carte d'ami « Signaler / bloquer », « ⋯ » sur une demande reçue, section « Dresseurs bloqués », `#v-mod` « ⚑ Signaler » sur les vitrines. Serveur : bloquer supprime l'amitié et les salons en attente ; `friendships_block_guard` (demande ignorée en silence), `battle_block_guard` ; signalements lisibles seulement dans Supabase (vue `reports_a_traiter`, `status` nouveau/traite/rejete). Pas encore : bloquer depuis un combat, prévenir Arnaud d'un signalement.

## Vitrine (`views/showcase.js`, `#/compte`)
- **Ne jamais redessiner à chaque `App.col.on`** (prix du jour, synchro) : comparer une signature et redessiner une seule fois après 1,2 s en gardant hauteur et défilement.
- **Personnalisation (v2.69)** : en mode `editing`, chaque partie est un `.v-sec.v-editable[data-sec]` avec un crayon `.v-pen[data-sheet]` → `openSheet(kind)` (`App.util.openModal`, `sheetHtml(kind)` redessinée par `refreshSheet()` après chaque `save()`, scroll gardé) ; parties masquées en grisé (`.v-off`) avec interrupteur `data-show` ; barre `.v-editbar` (Thème, Cadre, Vitrine publique). Statistiques : `V.STATS` / `V.DEFAULT_STATS`, `profile.stats` (≤ 4, 1re `.stat.lead`), `statValue`. Badges : `.badge-grid.compact` (médailles `size: 'sm'`, toucher = toast).
- **Vitrine publique (v2.59, `supabase-v9.sql`)** : `#/@Pseudo` → `params.pub` (lecture seule : `S.friend` ET `S.pub`, `S.uid`). Activée par `profile.public` (case `#e-public` dans `.v-pubbox`, seulement connecté + pseudo réservé), `profile.publicPhotos` (≠ false). `public_showcase(p_pseudo)` ouverte à `anon` (même réponse si pseudo inconnu ou privé ; retire `note`, `certNote`, `rating`, `goals`, `favSets`, `match`, liste de souhaits) ; photos : `photo_is_public(name)` = seulement `displayPhoto` et `avatar`. Site : `App.cloud.publicRpc`, `App.cloud.fetchPublicPhoto`, `App.friends.publicShowcase`, `App.friends.publicLink`, bouton `#v-share`. Section « Cartes certifiées » (`.v-certs`, `profile.showCerts`) et bouclier `.v-certmark`. `onboarding.maybeShow` ne s'affiche pas sur `#/@…`. Sans le SQL : « Les vitrines publiques ne sont pas encore activées sur le serveur ».
- **Statut des profils (v2.72)** : `computeTrust()` sur l'appareil qui regarde (`TRUST` : ok / part / declared / imported / new / suspect) ; « suspect » = ≥ 3 cartes ≥ 100 € non certifiées, certifiées < 10 % de la valeur, et parmi les 6 plus chères au moins 3 (ou la moitié, ≥ 2) photos avec `recognizer.resemblance ≥ 0,9` (image officielle = 1,0 ; vraie photo 0,4–0,8). Chip `#v-trust`, `trustSheet()`.
