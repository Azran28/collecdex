// Prix Star Wars: Unlimited (v3.67, robot de mise en ligne, .github/workflows/site.yml) : marché TCGplayer via tcgcsv.com (copie
// quotidienne publique des prix TCGplayer, sans clé), comme Final Fantasy (prix-finalfantasy.mjs). tcgcsv.com n'autorise pas les pages
// web à le lire : le robot prépare donc data/sw-prix.json, mis en ligne avec le site, que js/games/starwars.js lit.
// Les cartes sont reliées par leur numéro de produit TCGplayer (champ « tp » de data/sw-cartes.json, relié par la série et le numéro).
// Format : { m: 'AAAA-MM-JJ', p: { '<n° de produit TCGplayer>': [prix normal, prix brillant] } } (en dollars, null si inconnu).
// Usage : node outils/ci/prix-starwars.mjs <fichier de sortie>
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const BASE = 'https://tcgcsv.com/tcgplayer/79'; // 79 = Star Wars: Unlimited chez TCGplayer

/** getJSON(url) → objet ; renvoie { m, p } */
export async function build(getJSON) {
  const groups = (await getJSON(`${BASE}/groups`)).results || [];
  const out = {};
  for (const g of groups) {
    const prices = await getJSON(`${BASE}/${g.groupId}/prices`);
    for (const r of prices.results || []) {
      const v = r.marketPrice || r.midPrice || null;
      if (!r.productId || !(v > 0)) continue;
      const k = /foil/i.test(r.subTypeName || '') ? 1 : 0;
      (out[r.productId] = out[r.productId] || [null, null])[k] = Math.round(v * 100) / 100;
    }
  }
  return { m: new Date().toISOString().slice(0, 10), p: out };
}

async function getJSON(url) {
  for (let i = 0; ; i++) {
    // (tcgcsv.com refuse « node » comme nom de programme : 401 ; on se présente)
    try { const r = await fetch(url, { headers: { 'User-Agent': 'CollecDex (github.com/Azran28/collecdex)' } }); if (r.ok) return await r.json(); throw new Error(`HTTP ${r.status} ${url}`); }
    catch (e) { if (i >= 2) throw e; await new Promise((res) => setTimeout(res, 2000 * (i + 1))); }
  }
}

if (typeof process !== 'undefined' && process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const file = process.argv[2] || 'data/sw-prix.json';
  build(getJSON).then((r) => {
    const n = Object.keys(r.p).length;
    if (n < 100) throw new Error(`seulement ${n} prix : pas écrit`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(r));
    console.log(`Prix Star Wars Unlimited : ${n} cartes → ${file}`);
  }).catch((e) => { console.log(`::warning title=Prix Star Wars Unlimited::${String(e && e.message || e).slice(0, 300)}`); }); // (pas de prix : le site part quand même)
}
