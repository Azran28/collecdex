// Prix Pokémon de secours (robot de mise en ligne, .github/workflows/site.yml) : TCGdex n'a pas de prix pour certaines
// cartes (promos noires anciennes, Étoiles ☆ d'ex10…). TCGplayer les a : marché TCGplayer via tcgcsv.com (sans CORS)
// → petit fichier data/pk-prix.json, lu par js/games/pokemon.js seulement quand TCGdex n'a rien.
// Séries reliées par leur nom anglais (« SWSH09: Brilliant Stars » = « Brilliant Stars »), plus les promos de GROUPS.
// Format : { m: 'AAAA-MM-JJ', p: { '<série TCGdex>-<numéro>': [prix normal, prix brillant] } } (en dollars, null si inconnu).
// Usage : node outils/ci/prix-pokemon.mjs <fichier de sortie>
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const BASE = 'https://tcgcsv.com/tcgplayer/3'; // 3 = Pokémon chez TCGplayer
/** séries TCGdex dont le nom diffère trop chez TCGplayer → nom du groupe TCGplayer */
export const GROUPS = {
  basep: 'WoTC Promo', np: 'Nintendo Promos', dpp: 'Diamond and Pearl Promos', hgssp: 'HGSS Promos', bwp: 'Black and White Promos',
  xyp: 'XY Promos', smp: 'SM Promos', swshp: 'SWSH: Sword & Shield Promo Cards', svp: 'SV: Scarlet & Violet Promo Cards',
  mep: 'ME: Mega Evolution Promo', bog: 'Best of Promos', sm1: 'SM Base Set', 'sv03.5': 'SV: Scarlet & Violet 151',
  rc: 'Generations: Radiant Collection', sve: 'SVE: Scarlet & Violet Energies', mee: 'MEE: Mega Evolution Energies',
  '30th-c': 'ME: 30th Celebration Classic Collection',
};

/** Numéro comparable des deux côtés : « 06/53 » → « 6 », « 032 » → « 32 », « DP06 » → « DP6 », « TG01 » → « TG1 » */
export function numKey(n) {
  const m = String(n || '').trim().split('/')[0].toUpperCase().match(/^([A-Z]*)0*(\d+)([A-Z]?)$/);
  return m ? `${m[1]}${m[2]}${m[3]}` : null;
}
/** Nom de série comparable : « SWSH09: Brilliant Stars » → « brilliantstars », « SV01: Scarlet & Violet Base Set » → « scarletviolet » */
export function setKey(name) {
  let s = String(name || '').replace(/^[A-Z0-9]+:\s*/, '').replace(/^(SM|XY) - /, '').replace(/^EX (?=\S)/, '').toLowerCase()
    .replace(/^pok[eé]mon\s+/, '').replace(/&/g, 'and').replace(/mcdonald's collection/, "mcdonald's promos");
  const t = s.replace(/\s+base set$/, '');
  if (t) s = t;
  return s.replace(/[^a-z0-9]/g, '');
}
// version tamponnée (« (Prerelease) », « [Winner] », « (e-League) »…) : seulement s'il n'y a pas la carte simple
const stamped = (name) => /\[|\((?!\d+\))/.test(name || '');

/** getJSON(url) → objet ; renvoie { m, p } */
export async function build(getJSON) {
  const groups = (await getJSON(`${BASE}/groups`)).results || [];
  const sets = await getJSON('https://api.tcgdex.net/v2/en/sets');
  // nom → groupe, seulement si le nom est unique des deux côtés (sinon on ne devine pas)
  const byName = new Map(), dupG = new Set();
  for (const g of groups) { const k = setKey(g.name); if (byName.has(k)) dupG.add(k); byName.set(k, g.groupId); }
  const link = {}, seen = new Map();
  for (const [id, name] of Object.entries(GROUPS)) { const g = groups.find((x) => x.name === name); if (g) link[id] = g.groupId; }
  for (const s of sets || []) { const k = setKey(s.name); seen.set(k, (seen.get(k) || 0) + 1); }
  for (const s of sets || []) {
    const k = setKey(s.name);
    if (!link[s.id] && byName.has(k) && !dupG.has(k) && seen.get(k) === 1) link[s.id] = byName.get(k);
  }
  const out = {};
  for (const [set, gid] of Object.entries(link)) {
    const [prods, prices] = await Promise.all([getJSON(`${BASE}/${gid}/products`), getJSON(`${BASE}/${gid}/prices`)]);
    const prod = new Map();
    for (const p of prods.results || []) {
      const k = numKey(((p.extendedData || []).find((x) => x.name === 'Number') || {}).value);
      if (k) prod.set(p.productId, { k: `${set}-${k}`, stamped: stamped(p.name) });
    }
    const best = {}; // clé → { stamped, v: [normal, brillant] }
    for (const r of prices.results || []) {
      const p = prod.get(r.productId), v = r.marketPrice || r.midPrice || null;
      if (!p || !(v > 0)) continue;
      const i = /holo|foil/i.test(r.subTypeName || '') ? 1 : 0, cur = best[p.k];
      if (cur && cur.stamped && !p.stamped) delete best[p.k];
      else if (cur && !cur.stamped && p.stamped) continue;
      const b = best[p.k] = best[p.k] || { stamped: p.stamped, v: [null, null] };
      const x = Math.round(v * 100) / 100;
      b.v[i] = b.v[i] == null ? x : Math.min(b.v[i], x);
    }
    for (const k of Object.keys(best)) out[k] = best[k].v;
  }
  return { m: new Date().toISOString().slice(0, 10), p: out, n: Object.keys(link).length };
}

async function getJSON(url) {
  for (let i = 0; ; i++) {
    // (tcgcsv.com refuse « node » comme nom de programme : 401 ; on se présente)
    try { const r = await fetch(url, { headers: { 'User-Agent': 'CollecDex (github.com/Azran28/collecdex)' } }); if (r.ok) return await r.json(); throw new Error(`HTTP ${r.status} ${url}`); }
    catch (e) { if (i >= 2) throw e; await new Promise((res) => setTimeout(res, 2000 * (i + 1))); }
  }
}

if (typeof process !== 'undefined' && process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const file = process.argv[2] || 'data/pk-prix.json';
  build(getJSON).then((r) => {
    const n = Object.keys(r.p).length, sets = r.n;
    delete r.n;
    if (n < 50) throw new Error(`seulement ${n} prix : pas écrit`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(r));
    console.log(`Prix Pokémon de secours : ${n} cartes, ${sets} séries → ${file}`);
  }).catch((e) => { console.log(`::warning title=Prix Pokémon::${String(e && e.message || e).slice(0, 300)}`); }); // (pas de prix : le site part quand même)
}
