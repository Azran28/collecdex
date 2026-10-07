---
paths:
  - "css/style.css"
  - "index.html"
  - "js/app.js"
  - "js/onboarding.js"
  - "js/install.js"
  - "js/util.js"
  - "js/views/home.js"
  - "js/views/settings.js"
  - "sw.js"
  - "manifest.webmanifest"
---
# Appli mobile, lancement, Play Store, service worker

## CSS téléphone
- Bloc « APPLI MOBILE » à la fin de `style.css` (tout sous `max-width: 760px`, le PC ne change pas). `.m-hide` / `.d-hide`, `.hscroll` (rangée qui défile jusqu'au bord, accueil : `.cards`, `.grid-auto`, `.licences`). `body[data-view]` = vue en cours. Accueil : `.home-flow` réordonné par `order`. `.app` garde `calc(72px + env(safe-area-inset-bottom))` en bas (barre du bas ≈ 63 px).
- Flèche retour `#nav-back` montrée hors des onglets `TABS` de `app.js` ; `history.state.d` = profondeur → `history.back()` si > 0, sinon dernier lien de `.breadcrumb` (caché sur téléphone mais gardé dans chaque page).
- **Pas de `backdrop-filter` sur un parent de la barre du bas** (ça la fait remonter en haut).
- `:hover` reste collé après un appui : pas de couleur qui rend un texte illisible ; effets qui dévoilent quelque chose sous `@media (hover: hover) and (pointer: fine)` ; images des cartes manquantes : `-webkit-touch-callout: none` + `contextmenu` bloqué.
- **Mode sombre du téléphone (v2.50)** : toujours le même aspect. `<meta name="color-scheme" content="dark only">` + `:root { color-scheme: dark only }` (et un bloc `prefers-color-scheme` neutre, signal pour Samsung Internet). **Ne jamais ajouter de règle qui dépend de `prefers-color-scheme`.** Tester : `resize_window` avec `colorScheme` dark puis light → même rendu.

## Lancement (v2.74)
Tous les `<script>` ont `defer` (sinon ~5 s après chaque mise à jour). Écran `#splash` (HTML + `<style>` en tête de `index.html`, téléphone seulement), retiré par `app.js` après le 1er `route()` (≤ 2,5 s). Session lue tout de suite par `cloud.js` (voir `supabase.md`). Version : `<meta name="app-version">` (pas de script en ligne, CSP).

## Présentation de l'appli (v2.44, `js/onboarding.js`)
`App.onboarding` : `maybeShow()` au début du démarrage, seulement si `max-width: 760px` et `localStorage.onboarded1` absent ; `show()` depuis Paramètres `#p-onboard`. Écrans = défilement horizontal natif (`.ob-track`, scroll-snap), écran visible = `.ob-slide.on`. Dessins en CSS (`.ob-card`, `--h` = teinte) ; bloc « PRÉSENTATION DE L'APPLI » à la fin de `style.css`, `z-index` 7000. Scènes alternées par `visibility` en images clés ; **pas d'animation d'opacité** (l'aperçu les gèle). Revoir : `localStorage.removeItem('onboarded1')`.
Mode d'emploi de Capturer (v2.46) : `open(slides, key, label, last)`, `scanSlides`, clé `onboardedScan1`, `maybeShowScan()` au rendu de `#/scan` (pas si `#ob` ouvert), bouton `#sc-help` (`.d-hide`) → `showScan()`. Scènes en 3 temps (`obT1…3`, `obMT1…3`), carte qui se retourne (`.ob-flip-in`, dos `.ob-back`).

## Version Play Store (v2.78)
`App.play` (`util.js`) vrai si l'adresse contient `?app=play` (`https://azran28.github.io/collecdex/?app=play` dans l'appli Android / TWA), ou referrer `android-app://`, mémorisé dans `sessionStorage` (`cdx-play`) ; `?app=web` l'annule ; classe `flavor-play` sur `<html>`. Dans cette version : pas de capsules (route → accueil, pastille et bloc cachés, pas d'appel `capsule_status`, avatar Pokémon ignoré, choix d'avatar retiré, notification « capsules » retirée), pas de bouton « Installer ». **Nouvelle fonction liée aux capsules ou aux images officielles des Pokémon → penser à `App.play`.**

## Installation et service worker
`js/install.js` (`App.install`) + `sw.js` + `manifest.webmanifest` + `icons/`. Le service worker ne touche jamais `version.json`, l'API TCGdex, ni Supabase ; pages en réseau d'abord ; fichiers `?v=` gardés (seule la dernière version de chaque fichier) ; visuels `assets.tcgdex.net` gardés (1500 max, réessais puis requête d'origine sans CORS) ; polices, bibliothèques CDN, modèle `/tfjs-models/`, images.weserv.nl, index `data/…?v=` gardés. Seule l'appli est gardée hors ligne sous « ./ » (les autres pages HTML sous leur adresse). `push` + `notificationclick` (voir `supabase.md`).
