---
paths:
  - "tests.html"
  - "tests/**"
  - ".github/**"
  - "outils/ci/**"
---
# Tests automatiques et robots GitHub (v3.05)

## tests.html
- Le vrai site (`index.html#/`) dans un `<iframe>` de même origine (`util.js` n'autorise le cadre qu'à une page du site) ; les tests utilisent son `App` (`W.App`). `tests/runner.js` (moteur : `test(nom, fn, { net })`, `eq`, `ok`, `near`, `until`, `sleep` ; résultat dans `window.__tests` = `{ done, pass, fail, results }`), `tests/unit.js` (fonctions, sécurité, fichiers de l'index), `tests/pages.js` (chaque page en 1200 × 800 puis 375 × 812 : pas de « Oups », pas d'erreur, pas de débordement ; `__visit(W, hash)`), `tests/combat.js` (3 combats complets), `tests/start.js` (ouvre le site, `onboarded1` / `onboardedScan1` posés le temps des tests puis remis).
- `{ net: true }` = a besoin d'internet (TCGdex…) : réessayé une fois.
- Local : `sh outils/stamp.sh` d'abord (sinon le navigateur garde les anciens fichiers `?v=` : un fichier cassé passe inaperçu), puis `tests.html` dans l'aperçu (serveur sur un autre port que 8765 : `collecdex-copie`). ~35 s. Vérifié : une page Capturer cassée exprès → 9 tests en échec.
- Données : rien n'est enregistré (les combats appellent `App.matchParts.battle` directement, sans la page qui compte victoires et défaites).

## Robots (`.github/workflows/`)
- `site.yml` « Tests et mise en ligne » : à chaque envoi sur `main` (et à la demande) : Chromium (Playwright 1.48.2, `outils/ci/package.json`) + `python3 -m http.server` → `outils/ci/run-tests.mjs` ; puis, seulement si tout est vert, mise en ligne GitHub Pages (`upload-pages-artifact` sans `.claude`, `CLAUDE.md`, `docs`, `outils`, `supabase`, `LISEZ-MOI.md`, `README.md`). **Il faut** GitHub › Settings › Pages › Source = « GitHub Actions » (sinon l'ancienne mise en ligne automatique depuis la branche publie aussi, sans attendre les tests).
- `index.yml` : base de référence des images, voir `visuel.md`.
- Pas de `waitForFunction` dans les scripts Playwright (il passe par `eval`, refusé par la CSP de la page) : boucle de `page.evaluate`.
- **Lire un échec sans se connecter** : les journaux demandent une connexion, mais les échecs sont écrits en annotations `::error` : `curl https://api.github.com/repos/Azran28/collecdex/actions/workflows/site.yml/runs?head_sha=<sha>` → id du passage → `…/actions/runs/<id>/jobs` → id du travail → `…/check-runs/<id>/annotations`.
