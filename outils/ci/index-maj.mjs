// Robot de l'index d'images (GitHub Actions, .github/workflows/index.yml) : ouvre outils/index-maj.html dans Chromium,
// ajoute les nouvelles cartes Pokémon et One Piece à data/*-index, augmente le numéro de version de l'index
// (INDEX_V dans js/visual.js, OP_INDEX_V dans js/games/onepiece.js) pour que les téléphones le retéléchargent.
// Usage : node outils/ci/index-maj.mjs [adresse du site local]   → écrit « changed=true|false » dans $GITHUB_OUTPUT
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';

const site = process.argv[2] || 'http://localhost:8080/';
const FILES = { pokemon: ['data/vis-index', 'js/visual.js', /const INDEX_V = (\d+);/, 'INDEX_V'], onepiece: ['data/op-index', 'js/games/onepiece.js', /const OP_INDEX_V = (\d+);/, 'OP_INDEX_V'] };
const out = (k, v) => { if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`); };
const summary = (t) => { console.log(t); if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, t + '\n'); };

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', (m) => { if (/\[index\]/.test(m.text())) console.log(m.text()); });
  page.on('pageerror', (e) => console.log('[erreur de la page]', e.message));
  await page.goto(new URL('outils/index-maj.html', site).href);
  for (let t0 = Date.now(); !(await page.evaluate(() => typeof window.__maj === 'function' && !!(window.App && App.visual))); ) {
    if (Date.now() - t0 > 60000) throw new Error('outils/index-maj.html ne s’est pas chargé');
    await new Promise((r) => setTimeout(r, 500));
  }
  let changed = false;
  summary('## Base de référence des images');
  for (const [game, [base, file, re, name]] of Object.entries(FILES)) {
    const r = await page.evaluate((g) => window.__maj(g), game);
    summary(`- **${game}** : ${r.before} → ${r.after} cartes (${r.added.length} ajoutées${r.failed.length ? `, ${r.failed.length} sans visuel pour l’instant` : ''})`);
    if (r.added.length) summary(`  - ajoutées : ${r.added.slice(0, 40).join(', ')}${r.added.length > 40 ? '…' : ''}`);
    if (!r.json) continue;
    writeFileSync(base + '.json', r.json);
    writeFileSync(base + '.bin', Buffer.from(r.bin, 'base64'));
    const src = readFileSync(file, 'utf8'), m = src.match(re);
    if (!m) throw new Error(`${name} introuvable dans ${file}`);
    writeFileSync(file, src.replace(re, `const ${name} = ${+m[1] + 1};`));
    summary(`  - ${name} : ${m[1]} → ${+m[1] + 1}`);
    changed = true;
  }
  await browser.close();
  out('changed', changed);
  return 0;
}

main().then((c) => process.exit(c), (e) => { console.log(`::error title=Index d'images::${String((e && e.stack) || e).replace(/\r?\n/g, '%0A').slice(0, 900)}`); process.exit(1); });
