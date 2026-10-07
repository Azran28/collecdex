---
paths:
  - "js/collection.js"
  - "js/db.js"
  - "js/wish.js"
  - "js/util.js"
  - "js/components.js"
  - "js/views/goals.js"
  - "js/views/collection.js"
  - "js/views/card.js"
---
# Collection (`App.col`), valeur, photos, souhaits
- `js/collection.js` : ajout, photos (`addPhoto`, `replacePhoto` avec `photoRev`, `setPhotoSource`, `keepPage`), progression, profil de vitrine, sauvegarde. `wipeLocal()` pour effacer les données de test.
- **Valeur** : toujours `App.col.valueOf(it)` / `App.col.totalValue(list)` (`item.cond` = `{kind:'raw', grade:'NM'}` ou `{kind:'graded', company, grade}`, `item.valueOverride` prioritaire). L'ancienne note `rating` n'est plus affichée.
- **Prix en dollars (v2.41)** : `price()` retombe sur TCGplayer (`unit: 'USD'`, `tpMarket` lit `holofoil`, `unlimited-holofoil`, `1st-edition-…`, reverse en dernier) si Cardmarket n'a rien. Prix gardé en $, converti à l'affichage : `App.util.euro(v, unit)` (toujours €), `App.util.toEur(v, unit)` (calculs), `App.util.usd(v)`. Taux : `cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/…/usd.min.json`, 24 h dans `localStorage['fx-usd-eur']`, 0,86 de secours.
- **Photos dans le compte (v2.81, 1 Go gratuit)** : `App.util.photoBlob(file, 800)` = WebP q 0,8 (~30 Ko ; JPEG 0,82 si pas de WebP, ex. Safari). Nom gardé en `.jpg` dans le stockage (`cert_finish`, `photo_is_public`), `contentType` = type réel. **Seules les photos « en ligne » sont envoyées** : `App.col.onlinePhotos(it)` = visuel (`displayPhoto`) + photos certifiées ; `addPhoto` n'envoie que si `makeDisplay`, `update({ displayPhoto })` envoie la nouvelle. Les autres restent sur l'appareil : la fiche compte les absentes (`elsewhere`). Le nettoyage unique `photosRefreshed1` ne supprime en local que des photos en ligne.
- **Effets des cartes** (`components.js`) : `App.ui.holoTier(rang, holo)` → niveau 0 à 5 ; tuiles `rt-N` et `--rc` ; inclinaison suit la souris via un seul écouteur global (ordinateur uniquement). Pas d'animation permanente sur toutes les tuiles (batterie) : reflets au survol, animation permanente seulement pour les plus rares sur téléphone. Pas d'animation d'apparition sur les tuiles (grilles souvent redessinées).
- Fiche carte : « Importée depuis … : pas de photo, donc pas certifiée » ; raison d'échec de certification (`item.certNote`).
- **Souhaits et objectifs** : `js/wish.js` (`App.wish`), rangés dans le profil (`profile.wishlist`, `profile.goals`, synchronisés) ; `js/views/goals.js` (`#/objectifs`, onglets objectifs / ce qu'il me manque / souhaits), toutes licences. **Jamais montrés aux autres.**
