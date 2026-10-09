// Lance tests.html dans Chromium sans écran (GitHub Actions) et échoue si un test échoue.
// Usage : node outils/ci/run-tests.mjs [adresse]   (par défaut http://localhost:8080/tests.html)
import { chromium } from 'playwright';

const url = process.argv[2] || 'http://localhost:8080/tests.html';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
page.on('pageerror', (e) => console.log('[erreur de la page de tests]', e.message));

let T = null;
try {
  await page.goto(url);
  await page.waitForFunction(() => window.__tests && window.__tests.done, null, { timeout: 8 * 60 * 1000, polling: 1000 });
  T = await page.evaluate(() => window.__tests);
} catch (e) {
  console.log('Les tests ne sont pas allés au bout :', e.message);
  T = await page.evaluate(() => window.__tests).catch(() => null);
  if (T) T.fail += 1;
}
await browser.close();

if (!T) { console.log('::error title=Tests::Aucun résultat (tests.html ne s’est pas chargé)'); process.exit(1); }
for (const r of T.results) console.log(`${r.ok ? '✓' : '✗'} ${r.name} (${r.ms} ms)${r.ok ? '' : '\n    ' + r.err.replace(/\n/g, '\n    ')}`);
console.log(`\n${T.pass} réussis, ${T.fail} en échec`);
// échecs en « annotations » : visibles sur la page du passage sans se connecter (et lisibles par l'API publique)
const one = (s) => String(s).replace(/%/g, '%25').replace(/\r?\n/g, '%0A').slice(0, 900);
for (const r of T.results.filter((x) => !x.ok).slice(0, 10)) console.log(`::error title=${one(r.name).replace(/[,:]/g, ' ')}::${one(r.err)}`);
if (!T.fail) console.log(`::notice title=Tests::${T.pass} tests réussis`);
process.exit(T.fail ? 1 : 0);
