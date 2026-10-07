# Première session locale : transformer le dossier du PC en dépôt git

(Fait le 27 sept. 2026 ; à ne refaire que si `git status` dit que ce n'est pas un dépôt.)

- Vérifier `git --version` (sinon faire installer Git pour Windows à Arnaud : https://git-scm.com/download/win, options par défaut).
- `git init`, `git remote add origin https://github.com/Azran28/collecdex.git`, `git fetch origin`, `git reset origin/main` (sans `--hard` : les fichiers du dossier sont gardés), `git branch -M main`, `git branch --set-upstream-to=origin/main main`, `git config user.name Azran28`, `git config user.email` avec l'e-mail d'Arnaud (celui du compte GitHub, à lui demander).
- `git status` doit alors être propre (fichiers perso dans `.gitignore`), sauf `.claude/settings.json` marqué supprimé et les images `icons/*.png` marquées modifiées (l'outil de copie à distance ajoute un bloc « caBX » aux PNG, l'image est identique) : `git restore .claude/settings.json icons/`.
- Au premier `git push`, une fenêtre de connexion GitHub s'ouvre : c'est **Arnaud** qui se connecte, jamais Claude.
