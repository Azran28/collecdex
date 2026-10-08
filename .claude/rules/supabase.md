---
paths:
  - "supabase/sql/*.sql"
  - "supabase/**"
  - "js/cloud.js"
  - "js/notify.js"
  - "js/config.js"
  - "js/views/account.js"
  - "supprimer-compte.html"
---
# Supabase, notifications, compte

## Scripts SQL (dossier `supabase/sql/`, à exécuter une fois, dans l'ordre, dans *SQL Editor*)
`supabase-setup.sql` → `supabase-certif.sql` → `supabase-v2.sql` → `supabase-v3.sql` (capsules) → `supabase-v4.sql` (amis) → `supabase-v5.sql` (boutique des capsules) → `supabase-v6.sql` (sécurité : pseudos lisibles seulement par leur propriétaire, nombre de cartes caché pour les demandes en attente, taille max des données) → `supabase-v7.sql` (certification par retournement, notifications push, message boutique corrigé ; + `grant … to service_role` sur push_config/push_subs) → `supabase-v8.sql` (certification d'une page de classeur) → `supabase-v9.sql` (vitrine publique) → `supabase-v10.sql` (combats entre amis) → `supabase-v11.sql` (notification « demande d'ami » : colonne `friendships.notified`, `push_due_friends()` pour service_role, déclencheur `friend_notify_now` qui appelle la fonction tout de suite via pg_net ; préférence `kinds.friends`) → `supabase-v12.sql` (salon : équipes choisies après l'entrée de l'adversaire, statut `lobby`, `battle_team`, équipes cachées tant que le combat n'a pas commencé ; `battle_create`/`battle_join` acceptent une équipe nulle) → `supabase-v13.sql` (suppression de son compte, `delete_my_account(p_check)`) → `supabase-v14.sql` (bloquer / signaler : tables `blocks`, `reports`, vue `reports_a_traiter`, déclencheurs sur `friendships` et `battle_rooms`) → `supabase-v15.sql` (revanche : colonne `battle_rooms.rematch`, `battle_rematch(code)`, `battle_state` renvoie `rematch` / `rematch_by`) → `supabase-v16.sql` (liste de souhaits personnelle : `friend_showcase` et `public_showcase` retirent `wishlist`/`showWish` ; supprime `wish_alerts`, `wish_check`, `push_due_wishes` de l'ancienne v15) → `supabase-v17.sql` (audit de sécurité : `photo_locked` = photo certifiée et bande-preuve non remplaçables, `photo_quota_ok` = 100 Mo / 5 000 photos par compte, photos ≤ 1 Mo, cartes ≤ 16 Ko et 25 000 par compte (`items_quota`), vitrine + réglages ≤ 256 Ko, `are_friends` seulement pour soi, `friend_showcase` sans `note`/`certNote`, clé d'appel `push_config.call_key` envoyée par `_notify_headers()` en en-tête `x-cdx-key`, `push_endpoint_ok` = seulement FCM / Mozilla / Apple / Windows ; le site efface d'abord les photos par l'API de stockage) → `supabase-v18.sql` (combats en ligne par licence : colonne `battle_rooms.game`, `battle_set_game(code, game)` appelée par `App.duel.create`, `battle_peek` / `battle_state` renvoient `game`, `battle_rematch` la recopie).

- Dans ce projet, `service_role` n'a PAS de droits par défaut sur les nouvelles tables : les donner explicitement (`grant … to service_role`, fait pour `push_config` et `push_subs`).
- Toute nouvelle table liée à un dresseur doit avoir `references auth.users (id) on delete cascade`, sinon ses lignes survivent à la suppression du compte.
- Tester du SQL : seulement dans l'espace cloud (PostgreSQL 16, fausse `auth.uid()`) ; sur le PC, relire très attentivement et faire tester Arnaud.

## Edge Function d'envoi des notifications
Nommée **`hyper-processor` sur le serveur** (nom automatique de Supabase ; code dans `supabase/functions/capsule-notify/index.ts`, fichier `capsule-notify.ts` dans l'éditeur, « Verify JWT » désactivé ; le cron de v7 appelle `/functions/v1/hyper-processor`). Clé serveur lue dans `SUPABASE_SECRET_KEYS` (nouvelles clés) sinon `SUPABASE_SERVICE_ROLE_KEY`. Clés VAPID créées le 27 sept. 2026, envoi vérifié (`{ok:true}`). Depuis v17, elle exige l'en-tête `x-cdx-key` (= `push_config.call_key`, lisible seulement par le serveur) : un appel sans la clé répond 401 `{ok:false, error:"appel non autorisé"}` (test sans danger).

## E-mails
SMTP perso **Brevo** depuis le 8 oct. 2026 (v3.01) : expéditeur `collecdex.app@gmail.com`, `smtp-relay.brevo.com:587`, 300 e-mails/jour, réglé par Arnaud (Authentication › Emails › SMTP Settings ; identifiant et clé Brevo : jamais à Claude). Gmail « mots de passe des applications » était indisponible sur ce compte. « Confirm email » reste désactivé (moins d'étapes ; réactivable).
**Mot de passe oublié** : modèle *Reset Password* = `{{ .SiteURL }}?token_hash={{ .TokenHash }}&type=recovery` → `cloud.init` lit `token_hash`/`type` avant `createClient`, les retire de l'adresse, `verifyOtp` → `#/connexion?reset=1` (marche sur un autre appareil ; lien périmé → toast). L'ancien lien `{{ .ConfirmationURL }}` (`?code=`, PKCE) ne marche que dans le navigateur qui a demandé l'e-mail, et son événement `PASSWORD_RECOVERY` arrive pendant `getSession` → écouteur `recovery` posé juste après `createClient`.

## Notifications push (`js/notify.js`, `App.notify`, v2.15)
`supabase-v7.sql` : tables `push_subs` par appareil avec `kinds`, `push_config` = clés VAPID lisibles seulement par le serveur, `push_public_key`, `push_subscribe`, `push_unsubscribe`, `push_due_capsules` pour service_role, colonne `capsule_state.notified_full` remise à faux par déclencheur quand la réserve baisse, pg_cron toutes les 5 min → pg_net → Edge Function (npm:web-push, crée les clés VAPID au 1er passage). `sw.js` : `push` + `notificationclick`. Bloc dans Paramètres ; `cloud.signOut` coupe les notifications de l'appareil. Le navigateur intégré refuse les notifications : à tester sur un vrai téléphone. iPhone : seulement appli installée.
`KINDS` + `badges` (`wish` retiré en v2.82) ; `App.notify.local(kind, title, body, url, tag)` = `showNotification` du service worker si activé ; appelé par `badges.check`, sauf la toute première fois.

## `js/cloud.js`
- Synchro (file d'attente, la date la plus récente gagne), `rpc`, `flushNow`, chargement des certifications.
- **Lancement (v2.74)** : `app.js` n'attend plus `App.cloud.init()` : `cloud.js` lit la session gardée (`localStorage` `sb-…-auth-token`) dès son chargement (`user` provisoire, état `synchro`) ; `ready` / `waitReady()` : `flush`, `sync`, `rpc`, `fetchPhoto`, `myPseudo`, `signIn`… attendent que le client Supabase soit prêt. supabase-js est téléchargé dès le chargement de `cloud.js`.
- **Session expirée (v2.68)** : `isAuthErr(e)` (« JWT expired », PGRST301, 401, refresh token invalide, « Auth session missing ») → `renew()` = `sb.auth.refreshSession()` (2 essais max, `authFails` remis à 0 à chaque succès) puis on réessaie ; sinon `expire()` = `signOut({ scope: 'local' })`, état `deconnecte`, toast. Utilisé dans `flush`, `sync` et `rpc` ; aussi au retour sur l'appli (`visibilitychange` → `getSession`). Panne de réseau (`isNetErr`) : jamais de déconnexion. Les changements en attente (`pend`) sont gardés.
- **Suppression du compte (v2.76)** : `App.cloud.deleteAccount()` vérifie d'abord que `delete_my_account(p_check: true)` existe, efface `photos/<uid>/` par l'API de stockage, puis `delete_my_account()` (cascade sur `auth.users`) ; écran `#/supprimer-compte` (`views/account.js`, `params.del`).
- `App.cloud.publicRpc` (sans connexion), `App.cloud.fetchPublicPhoto` : voir `amis-vitrine.md`. `cloud.fetchPhoto` mémorise les photos absentes (`noPhoto`).
