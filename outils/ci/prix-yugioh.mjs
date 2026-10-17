// Prix Yu-Gi-Oh! (robot de mise en ligne, .github/workflows/site.yml, chaque matin) : l'API publique de YGOPRODeck donne pour
// chaque carte son prix Cardmarket (en €, la moins chère de ses impressions) et pour chaque impression (code + rareté) un prix
// TCGplayer (en $). Le fichier fait 25 Mo : le robot en garde l'essentiel dans data/yg-prix.json, mis en ligne avec le site, que
// js/games/yugioh.js lit.
// Format : { m: 'AAAA-MM-JJ', p: { 'RGBT-007|c': prix en $ }, c: { '<passcode>': prix en € } } (seulement les prix > 0).
// Usage : node outils/ci/prix-yugioh.mjs <fichier de sortie>
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { codeKey } from './yugioh-cartes.mjs';

const RAR = {
  Common: 'c', 'Short Print': 'sp', 'Super Short Print': 'ssp', Rare: 'r', 'Super Rare': 'sr', 'Ultra Rare': 'ur', "Ultra Rare (Pharaoh's Rare)": 'urp',
  'Secret Rare': 'scr', 'Ultimate Rare': 'utr', 'Ghost Rare': 'gr', 'Ghost/Gold Rare': 'ggr', "Collector's Rare": 'cr', 'Starlight Rare': 'str',
  'Quarter Century Secret Rare': 'qcsr', 'Platinum Secret Rare': 'plscr', 'PLatinum Secret Rare': 'plscr', 'Prismatic Secret Rare': 'pscr',
  'Extra Secret Rare': 'escr', 'Platinum Rare': 'plr', 'Gold Rare': 'gur', 'Gold Secret Rare': 'gscr', 'Premium Gold Rare': 'pgr',
  'Starfoil Rare': 'sfr', Starfoil: 'sfr', 'Shatterfoil Rare': 'shr', 'Mosaic Rare': 'msr', 'Grand Master Rare': 'gmr',
  'Duel Terminal Normal Parallel Rare': 'dnpr', 'Duel Terminal Rare Parallel Rare': 'drpr', 'Duel Terminal Super Parallel Rare': 'dspr',
  'Duel Terminal Ultra Parallel Rare': 'dupr', 'Normal Parallel Rare': 'npr', 'Super Parallel Rare': 'spr', 'Ultra Parallel Rare': 'upr',
  'Ultra Secret Rare': 'uscr', '10000 Secret Rare': 'tscr',
};
const r2 = (v) => Math.round(v * 100) / 100;

/** en = réponse de cardinfo.php → { m, p, c } */
export function build(en) {
  const p = {}, c = {};
  for (const k of en.data || []) {
    const cm = parseFloat((k.card_prices && k.card_prices[0] && k.card_prices[0].cardmarket_price) || 0);
    if (cm > 0) c[k.id] = r2(cm);
    for (const s of k.card_sets || []) {
      const v = parseFloat(s.set_price || 0), key = codeKey(s.set_code);
      if (v > 0 && key) p[`${key}|${RAR[s.set_rarity] || 'c'}`] = r2(v);
    }
  }
  return { m: new Date().toISOString().slice(0, 10), p, c };
}

if (typeof process !== 'undefined' && process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const file = process.argv[2] || 'data/yg-prix.json';
  (async () => {
    let en = null;
    for (let i = 0; !en; i++) {
      try { const r = await fetch('https://db.ygoprodeck.com/api/v7/cardinfo.php', { headers: { 'User-Agent': 'CollecDex (github.com/Azran28/collecdex)' } }); if (!r.ok) throw new Error('HTTP ' + r.status); en = await r.json(); }
      catch (e) { if (i >= 2) throw e; await new Promise((res) => setTimeout(res, 3000 * (i + 1))); }
    }
    const out = build(en), n = Object.keys(out.c).length;
    if (n < 1000) throw new Error(`seulement ${n} prix : pas écrit`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(out));
    console.log(`Prix Yu-Gi-Oh! : ${n} cartes, ${Object.keys(out.p).length} impressions → ${file}`);
  })().catch((e) => { console.log(`::warning title=Prix Yu-Gi-Oh!::${String(e && e.message || e).slice(0, 300)}`); }); // (pas de prix : le site part quand même)
}
