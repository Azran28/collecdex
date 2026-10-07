---
paths:
  - "js/visual.js"
  - "js/visual-worker.js"
  - "js/labo.js"
  - "js/labo-index.js"
  - "js/labo-index-op.js"
  - "labo.html"
  - "css/labo.css"
  - "data/**"
---
# Vérification par l'image (`js/visual.js`, `js/visual-worker.js`)

## Principe
- `App.visual.rank(qid, blob, refs, { must, bonusSet, onProgress })`, `warm()`, `SURE = 25`, parle à `visual-worker.js` (Web Worker) : MobileNet v2 (`storage.googleapis.com/tfjs-models/savedmodel/mobilenet_v2_1.0_224`, nœud `…/Logits/AvgPool`) présélectionne 40 cartes (+ `must`), ORB (OpenCV.js) les vérifie (RANSAC) ; score ≈ points communs + cosinus ; `bonusSet` ×1,2.
- **Pourquoi un worker** : OpenCV.js exige `eval`, interdit par la CSP ; le worker (sans CSP) charge les bibliothèques après avoir vérifié leur sha384 (`loadVerified` → Blob → `importScripts`), et ne fige pas la page.
- Empreintes des visuels dans IndexedDB **`collecdex-vis`** (store `f`, clé `v1:<url>`, ~30 Ko ; visuel absent (404) → `{miss}` 2 jours). Visuel introuvable (adresse devinée, TCGdex répond sans CORS) : 2 essais (.webp, .png), puis `{miss}` 1 jour, sauf si 5 échecs d'affilée (panne). Service worker : modèle gardé (`/tfjs-models/`).
- Worker (v2.33) : garde la transformation RANSAC (`lastH`) et renvoie `quad` (coins du visuel reportés sur la découpe, `cardQuad` : inverse 3×3, convexe, aire 0,35…1,3) pour les 3 meilleures (≥ 20) → `cropToQuad` (`R.warpQuad`) : `c.blob` = carte pile sur ses bords, `c.gridBlob` = ancienne découpe ; si le doute reste, **relecture du numéro** sur la carte recadrée : s'il désigne une seule des cartes proches à l'image (≥ 0,6 × la meilleure) → sûre (`c.numFix`). Cartes proches à l'image ajoutées aux candidates (`near`).

## `visualPass(hint)` dans `scan.js` (classeur)
Après `guessSeries` (et après une série choisie à la main) : 1) chaque carte contre ses candidates du texte ; 2) série = choisie / devinée / ≥ 2 cartes à l'image ≥ 25 ; 3) série connue : toute la série (+ candidates) avec bonus, **aussi les cartes sans candidate** ; décision : ≥ 25 → choix (`c.visId`, « image ✓ »), « À vérifier » si la 2ᵉ ≥ 0,8 × la 1ʳᵉ (même dessin) ou si le texte avait une autre carte « sûre » (`clash`) ; 4) **toute la base (v2.83)** : cartes pas « sûres » dont le meilleur score < 25 → `App.visual.global(qid, blob, 60)` (worker `globalTop`) : empreinte MobileNet moyenne sur 5 cadrages (`q.tta`, seulement ici), projetée (ACP sans centrage, 128 dimensions carte entière / illustration), cosinus contre les 19 655 cartes de l'index → 60 meilleures → `rank` (ORB) ; si meilleur, `c.vis` remplacé, cartes retrouvées via `ad.getSet` (`cardIn`).
Mesuré (`_tests-scanner/compare.js`, `__compare(['02',…])`, 9 pages sans la 05) : justes 45 → 55 → **60 / 67**, sûres 34 → 52 → 57, 0 sûre fausse. Téléphone d'Arnaud (9 cœurs, webgl) : 1er passage 35 s, ensuite 15 s (0,8 s/carte). PC : 1er passage d'une série ~30 s, ensuite ~3,5 s/page.

## Commune à toutes les licences (v2.94–v2.96)
`App.visual.check` : centre 77 % de la photo puis la photo, 24 cartes de l'index de la licence + celles du texte, `rank` ORB, sûre ≥ 25 sans 2ᵉ à 80 %, numéro complet lu prioritaire, `quadCrop` = vrais bords ; jumelles toujours comparées avant « sûre » (`twinsOf`, `twinKey`). One Piece (`visualOpts` : `data/op-index`) la lance dès le début (`early`) ; Pokémon carte seule et rafale seulement si le texte n'est pas sûr ; texte sûr = recadrage ensuite (`info.cropLater`). Worker : un index par adresse (`idxP` = Map).

## Index
- `data/vis-index.json` (`{ v, n, d, base, ids, sets, imgs }`, 0,7 Mo) + `data/vis-index.bin` (Pf, Pa 1280×d float32, échelles n×2 float32, empreintes n×2d int8 ; 6,5 Mo), téléchargés au 1er besoin, gardés par le service worker (`?v=INDEX_V` dans `visual.js` : **à augmenter quand l'index est refait** ; One Piece : `OP_INDEX_V`, refait avec `js/labo-index-op.js`). Index absent → on s'arrête sans erreur.
- **Refaire l'index** : `labo.html` + `js/visual.js` + `js/labo-index.js` (`window.__idx` : `build()` reprend où il en était, empreintes dans IndexedDB `collecdex-index` de l'origine `localhost:8768` ; `pca(128)`, `evaluate([64,96,128], { tta: true })`, `pack(128)` → `POST /__save`) servi par une copie de `outils/serveur.ps1` qui accepte `POST /__save?name=…` (à recréer dans le dossier temporaire) ; ~20 min (24 téléchargements à la fois, onglet au premier plan) ; « Kits du dresseur » `tk-…` exclus.

## Labo (`labo.html` + `js/labo.js` + `css/labo.css`, pas dans le menu)
Compare les méthodes sur les 90 cartes des photos de test (`verite.json`) ; empreintes `labo1:<id>`, résultats `labo:last`. Sa CSP ajoute `storage.googleapis.com` et `'unsafe-eval'` (OpenCV.js @techstark 4.10, SRI). Pièges : le module OpenCV a une méthode `then` → l'attendre boucle sans fin (on la supprime) ; `BFMatcher.match` contre 1,1 M de points plante → paquets de 50 000 ; MobileNet : passer `getImageData` à `tf.browser.fromPixels`.
Résultats (28 sept.) : scanner d'alors 59 %, pHash 28 %, MobileNet 60 %, ORB 92 % (5 s/carte), **« Amélioré + bonus série » 96 % (86/90), ~2 s/carte** = méthode retenue. Échecs : même dessin (Set de Base ↔ Base Set 2 floue, Sulfura 12/27, Salamèche 101 ↔ Reptincel 102 : numéro nécessaire) et reflets de la page 09.
Serveur de test sur un autre port : `outils/serveur.ps1 -Port 8766` (config `collecdex-copie`).
