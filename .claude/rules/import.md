---
paths:
  - "js/importer.js"
  - "js/views/import.js"
---
# Importer sa collection (v2.67, `#/importer`)
Seule exception à « ajout par photo » : cartes sans photo, non certifiées (`item.imported`). Liens dans Mon Dex, Paramètres › Sauvegarde, Dex vide.
- **Lecture** : `readFile` (zip « PK » → `parseXLSX` : petit lecteur zip maison + `DecompressionStream('deflate-raw')`, 1re feuille d'après `workbook.xml`, `sharedStrings` ; `.xls` refusé avec un message ; sinon `parseCSV`, séparateur deviné `\t ; , |`, 1re ligne `sep=,` comprise, UTF-8 sinon windows-1252).
- `detect(rows)` : ligne de titres parmi les 10 premières (`FIELDS` : synonymes anglais/français/allemand, titres exacts puis « commence / finit par » ; « Card Number » ne doit pas devenir le nom ; « Card # » / « # » → numéro) ou devinée sur le contenu ; colonnes modifiables à l'écran. `sourceOf` : collectr / cardmarket / dragonshield (folder name / trade quantity) / pokellector / tableau (format reconnu > onglet choisi ; l'onglet Pokellector / Dragon Shield reste si les titres sont ordinaires ; format Pokellector exact jamais vérifié).
- `rowsOf` : `numOf` (« 4/102 », « SV049/SV094 »), `cleanName`, `condOf` (Near Mint → NM, Lightly Played → EX, Moderately → LP, Heavily → PL, Damaged → PO, « PSA 9 » → gradée, CamelCase « NearMint » accepté), `langOf` (idLanguage Cardmarket 1 = en, 2 = fr…), `versionOf` ; liste collée « 2x Nom 4/102 » / « Nom x2 » → quantité. Lignes ignorées : autre jeu, japonaise, produit scellé, quantité 0.
- `match(row)` : `findSets` (noms FR + EN via `ad.setNamesEn()`, préfixe « SV03: » retiré, exact, puis **fin du nom**, puis contenu le plus long, puis ressemblance ≥ 0,82, départage par le total) → 1) série + numéro (`normNum`), 2) série + nom (`ad.setCardsEn(id)`), 3) nom partout (`ad.searchEn` + `ad.search`) filtré par numéro / total ; statuts `ok` / `verif` / `choix` (`cands`) / `introuvable` ; `nameScore` : mot entier contenu = 0,85 (jamais sûr). One Piece : `matchOP` (voir `onepiece.md`).
- `apply(rows, { mode: keep|max|add, from })` : lignes de la même carte additionnées, `App.col.add` + `update({ variants, cond, imported: { from, at } })`, puis `refreshPrices`.
- Mesuré : 300 lignes avec numéro 300/300 en 0,2 s ; sans numéro, 838 « ok » sur 8 séries, 0 faux. Fichiers de test fabriqués puis effacés.
