// Prix Riftbound (robot de mise en ligne, .github/workflows/site.yml) : marché TCGplayer via tcgcsv.com (copie quotidienne
// publique des prix TCGplayer, sans clé). tcgcsv.com n'autorise pas les pages web à le lire (pas d'en-tête CORS) : le robot
// prépare donc un petit fichier data/rb-prix.json, mis en ligne avec le site, que js/games/riftbound.js lit.
// Format : { m: 'AAAA-MM-JJ', p: { '<id Riot>': [prix normal, prix brillant] } } (en dollars, null si inconnu).
// Usage : node outils/ci/prix-riftbound.mjs <fichier de sortie>
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const BASE = 'https://tcgcsv.com/tcgplayer/89'; // 89 = Riftbound chez TCGplayer

/** Numéro TCGplayer (« 013/298 », « 238a/298 », « 304*\/298 », « R01 », « T01 », « SP3/006 ») → id de la galerie Riot */
export function idOf(set, num) {
  const s = String(set).toLowerCase(), n = String(num || '').trim();
  let m = n.match(/^(\d{3})([a-z]?)(\*?)\/(\d{3})$/i);
  if (m) return `${s}-${m[1]}${m[2].toLowerCase()}${m[3] ? '-star' : ''}-${m[4]}`;
  m = n.match(/^(R\d{2}[a-z]?|T\d{2})$/i);
  if (m) return `${s}-${m[1].toLowerCase()}`;
  m = n.match(/^SP(\d+)\/(\d{3})$/i);
  if (m) return `${s}-sp${m[1]}-${m[2]}`;
  return null; // (« T01 // T02 » : jetons recto verso, pas dans la galerie)
}

/** getJSON(url) → objet ; renvoie { m, p } */
export async function build(getJSON) {
  const groups = (await getJSON(`${BASE}/groups`)).results || [];
  const out = {};
  for (const g of groups) {
    if (!/^[A-Z]{2,4}$/.test(g.abbreviation || '')) continue;
    const [prods, prices] = await Promise.all([getJSON(`${BASE}/${g.groupId}/products`), getJSON(`${BASE}/${g.groupId}/prices`)]);
    const idOfProduct = new Map();
    for (const p of prods.results || []) {
      const num = ((p.extendedData || []).find((x) => x.name === 'Number') || {}).value;
      const id = idOf(g.abbreviation, num);
      if (id) idOfProduct.set(p.productId, id);
    }
    for (const r of prices.results || []) {
      const id = idOfProduct.get(r.productId), v = r.marketPrice || r.midPrice || null;
      if (!id || !(v > 0)) continue;
      const k = /foil/i.test(r.subTypeName || '') ? 1 : 0;
      (out[id] = out[id] || [null, null])[k] = Math.round(v * 100) / 100;
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
  const file = process.argv[2] || 'data/rb-prix.json';
  build(getJSON).then((r) => {
    const n = Object.keys(r.p).length;
    if (n < 100) throw new Error(`seulement ${n} prix : pas écrit`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(r));
    console.log(`Prix Riftbound : ${n} cartes → ${file}`);
  }).catch((e) => { console.log(`::warning title=Prix Riftbound::${String(e && e.message || e).slice(0, 300)}`); }); // (pas de prix : le site part quand même)
}
