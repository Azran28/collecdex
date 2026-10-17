// Cartes Yu-Gi-Oh! (v3.26) : liste complète, préparée depuis l'API publique de YGOPRODeck (db.ygoprodeck.com, noms et textes
// en français pour ~11 700 cartes, toutes les séries TCG avec leur code imprimé et leur rareté). L'API pèse 25 Mo : ce petit
// outil en garde l'essentiel dans data/yg-cartes.json (dans le dépôt), que js/games/yugioh.js lit. Les textes ne sont pas gardés
// (trop lourds) : la fiche d'une carte les demande à l'API (CORS autorisé). Relancé chaque lundi par le robot de l'index
// (.github/workflows/index.yml) pour les nouvelles séries.
// Usage : node outils/ci/yugioh-cartes.mjs [fichier de sortie]
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

const API = 'https://db.ygoprodeck.com/api/v7/';

// rareté (anglais, YGOPRODeck) → clé courte (la même liste de clés que js/games/yugioh.js › RAR)
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
// rang (ordre des versions d'un même code : la plus commune garde l'identifiant sans suffixe)
const RANK = ['c', 'sp', 'ssp', 'npr', 'dnpr', 'r', 'drpr', 'sfr', 'msr', 'shr', 'sr', 'spr', 'dspr', 'ur', 'upr', 'dupr', 'urp', 'gur', 'pgr', 'plr', 'scr', 'gscr', 'plscr', 'pscr', 'escr', 'uscr', 'utr', 'cr', 'gr', 'ggr', 'str', 'qcsr', 'tscr', 'gmr'];
// genre de carte (frameType de YGOPRODeck) → clé courte
const FRAME = { normal: 'n', effect: 'e', ritual: 'ri', fusion: 'f', synchro: 'sy', xyz: 'x', link: 'l', spell: 's', trap: 't', token: 'tk', skill: 'sk',
  normal_pendulum: 'pn', effect_pendulum: 'pe', ritual_pendulum: 'pri', fusion_pendulum: 'pf', synchro_pendulum: 'psy', xyz_pendulum: 'px' };
const ATTR = { EARTH: 'te', WATER: 'ea', FIRE: 'fe', WIND: 've', LIGHT: 'lu', DARK: 'tn', DIVINE: 'di' };

const ent = (s) => String(s || '').replace(/&apos;|&#0?39;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();

/**
 * Code imprimé → identifiant sans la langue : « RGBT-EN007 » → « RGBT-007 », « LOB-E003 » (anciennes cartes européennes,
 * numérotées autrement que « LOB-005 » américaine) → « LOB-E003 », « NECH-ENS10 » → « NECH-S10 », « IOC-SE1 » reste tel quel.
 */
export function codeKey(code) {
  const m = String(code || '').toUpperCase().match(/^([A-Z0-9]{2,5})-?(.*)$/);
  if (!m) return '';
  const [, pre, rest] = m;
  if (!rest) return pre;
  let r = rest;
  if (/^(EN|FR|DE|IT|SP|PT|JP|JA|KR|AE)(?=[A-Z0-9?]+$)/.test(r) && r.length > 2) r = r.slice(2);
  else if (/^[EFGIS]\d{3}$/.test(r)) r = 'E' + r.slice(1);
  return `${pre}-${r}`;
}

/** Famille de la série (groupes de la page des séries) */
export function groupOf(name, count, code) {
  const n = String(name);
  if (/promo|participation|prize|sweepstakes|tournament pack|\bOTS\b|shonen jump|duelist league|premiere|championship|\bYCS\b|grand tournament|mattel|mcdonald|video game|game promotional|celebration|demo|limited pack|giveaway|subscription|magazine|\bbook\b|manga|\bjump\b|world championship|forbidden memories|duelists of the roses|nightmare troubadour|tag force|gx duel academy|reshef|eternal duelist|sacred cards|stairway|dawn of destiny|power of chaos|movie|astral pack|champion pack|turbo pack|hobby league|ycs|event|exclusive|regional|national|launch|holiday|day|gift|bundle|ultimate edition/i.test(n)) return 'promo';
  if (/special edition|deluxe edition|super edition|sneak peek|advent calendar/i.test(n)) return 'se';
  if (/structure deck|starter deck|starter set|starter kit|\bdecks?\b|duelist kit|egyptian god deck|deck:|chronicles deck|duel kit/i.test(n)) return 'deck';
  if (/\btin\b|mega pack|mega-pack|collectible tin|collector box|collectors tin/i.test(n)) return 'tin';
  if (/speed duel/i.test(n)) return 'speed';
  if (/duel terminal|legendary|collection|gold|duelist pack|hidden arsenal|battle pack|maximum|rarity|anniversary|ghosts from the past|of legend|enforcers|superstars|retro|duel power|duel devastator|premium|dark beginning|dark revelation|power of the elements|duel overload|king's court|toon chaos|ancient guardians|mystic fighters|genesis impact|cyberstorm access|valiant smashers|wild survivors|crossover breakers|darkwing blast|maze|blazing vortex|photon hypernova|amazing defenders|spirit warriors|dimension force|lost art|millennium|ra yellow|movie pack|destiny soldiers|fists of the gadgets|soul fusion|mega|reprint|world premiere|ultimate|unlimited/i.test(n) && !(count >= 55 && count <= 130 && /^[A-Z]{4}$/.test(code) && !/legendary|collection|gold|duelist pack|hidden arsenal|battle pack|maximum|rarity|anniversary|duel terminal|retro|of legend|dark beginning|dark revelation|duel devastator|premium|mega|millennium pack|duel power/i.test(n))) return 'coll';
  if (count >= 55 && /^[A-Z0-9]{3,4}$/.test(code)) return 'main';
  return 'coll';
}

/** fr, en = réponses de cardinfo.php (français, anglais avec misc), sets = cardsets.php → { m, sets, cards, p } */
export function build(fr, en, setList) {
  const frById = new Map(fr.data.map((c) => [c.id, c]));
  // séries : nom (unique) → code ; un code partagé par plusieurs noms (« Absolute Powerforce », « …: Special Edition »,
  // « … Sneak Peek Participation Card ») : la plus grosse garde le code, les autres « ABPF.2 », « ABPF.3 » (par date)
  const byName = new Map();
  for (const s of setList) { const name = ent(s.set_name); if (!byName.has(name)) byName.set(name, { name, code: String(s.set_code || '').toUpperCase(), date: s.tcg_date || '', count: s.num_of_cards || 0, img: s.set_image ? 1 : 0 }); }
  // cartes et impressions
  const cards = [], prints = new Map(); // nom de série → [[code, n° de carte, rareté]]
  for (const c of en.data) {
    if (!c.card_sets || !c.card_sets.length) continue; // (cartes seulement japonaises, Duel Links…)
    const f = frById.get(c.id), misc = (c.misc_info && c.misc_info[0]) || {};
    if (misc.formats && !misc.formats.includes('TCG') && !c.card_sets.length) continue;
    const ci = cards.length;
    const nFr = f ? ent(f.name) : '', nEn = ent(c.name);
    const row = [c.id, nFr || nEn, nFr && nFr !== nEn ? nEn : '', FRAME[c.frameType] || c.frameType || '', ATTR[c.attribute] || '', c.level ?? c.linkval ?? null,
      c.atk ?? null, c.def ?? null, c.race || '', (c.card_images || []).length > 1 ? c.card_images.map((x) => x.id) : 0, nFr ? 0 : 1];
    cards.push(row);
    for (const s of c.card_sets) {
      const name = ent(s.set_name), key = codeKey(s.set_code);
      if (!key || /\?/.test(key)) continue;
      if (!byName.has(name)) byName.set(name, { name, code: key.split('-')[0], date: '', count: 0, img: 0 });
      if (!prints.has(name)) prints.set(name, []);
      prints.get(name).push([key, ci, RAR[s.set_rarity] || 'c']);
    }
  }
  // premières séries (2002-2004) : numérotation américaine (« LOB-005 », reprise par les rééditions « LOB-EN005 ») et européenne
  // (« LOB-E003 » / « LOB-F003 » en français, d'autres numéros) → la série ne garde que l'européenne (celle des cartes
  // françaises) ; le code américain reste lisible par le scanner (alias)
  const alias = {};
  for (const [name, pr] of prints) {
    const eu = new Map(pr.filter(([k]) => /-E\d{3}$/.test(k)).map(([k, ci]) => [ci, k]));
    if (!eu.size) continue;
    prints.set(name, pr.filter(([k, ci]) => { if (/-E\d{3}$/.test(k) || !eu.has(ci)) return true; alias[k] = eu.get(ci); return false; }));
  }
  // identifiants des séries
  const byCode = new Map();
  for (const s of byName.values()) if (prints.has(s.name)) { if (!byCode.has(s.code)) byCode.set(s.code, []); byCode.get(s.code).push(s); }
  const sets = [], P = {};
  for (const [code, list] of byCode) {
    list.sort((a, b) => (prints.get(b.name).length - prints.get(a.name).length) || a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
    const rest = list.slice(1).sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
    [list[0], ...rest].forEach((s, i) => {
      const id = i ? `${code}.${i + 1}` : code;
      // une même impression (code + rareté) une seule fois ; plusieurs raretés du même code → la plus commune sans suffixe
      const seen = new Set(), pr = [];
      for (const [k, ci, r] of prints.get(s.name)) { const t = `${k}|${r}`; if (seen.has(t)) continue; seen.add(t); pr.push([k, ci, r]); }
      sets.push({ id, name: s.name, date: s.date, g: groupOf(s.name, pr.length, code), img: s.img });
      P[id] = pr;
    });
  }
  // suffixe de rareté pour les versions d'un même code (toutes séries confondues : « RA04-087 », « RA04-087_scr »)
  const all = new Map();
  for (const [sid, pr] of Object.entries(P)) for (const x of pr) { if (!all.has(x[0])) all.set(x[0], []); all.get(x[0]).push([sid, x]); }
  for (const [k, list] of all) {
    const rars = [...new Set(list.map(([, x]) => x[2]))].sort((a, b) => RANK.indexOf(a) - RANK.indexOf(b));
    const sids = [...new Set(list.map(([sid]) => sid))];
    for (const [sid, x] of list) {
      // (même code et même rareté dans deux séries : la 1re garde l'identifiant, l'autre est marquée par sa série)
      const dupSet = sids.length > 1 && list.filter(([, y]) => y[2] === x[2]).length > 1 && list.find(([, y]) => y[2] === x[2])[0] !== sid;
      x[0] = (x[2] === rars[0] ? k : `${k}_${x[2]}`) + (dupSet ? `@${sid}` : '');
    }
  }
  sets.sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || a.id.localeCompare(b.id));
  for (const k of Object.keys(alias)) if (all.has(k)) delete alias[k]; // (code encore utilisé ailleurs : pas un alias)
  return { m: new Date().toISOString().slice(0, 10), sets, cards, p: P, a: alias };
}

async function getJSON(url) {
  for (let i = 0; ; i++) {
    try { const r = await fetch(url, { headers: { 'User-Agent': 'CollecDex (github.com/Azran28/collecdex)' } }); if (r.ok) return await r.json(); throw new Error(`HTTP ${r.status} ${url}`); }
    catch (e) { if (i >= 2) throw e; await new Promise((res) => setTimeout(res, 3000 * (i + 1))); }
  }
}

if (typeof process !== 'undefined' && process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const file = process.argv[2] || 'data/yg-cartes.json';
  (async () => {
    const [fr, en, setList] = await Promise.all([getJSON(API + 'cardinfo.php?language=fr'), getJSON(API + 'cardinfo.php?misc=yes'), getJSON(API + 'cardsets.php')]);
    const out = build(fr, en, setList);
    if (out.cards.length < 10000) throw new Error(`seulement ${out.cards.length} cartes : pas écrit`);
    // (fichier inchangé si seule la date diffère : pas de commit inutile du robot)
    if (existsSync(file)) { try { const old = JSON.parse(readFileSync(file, 'utf8')); if (JSON.stringify({ ...old, m: '' }) === JSON.stringify({ ...out, m: '' })) { console.log('Cartes Yu-Gi-Oh! : rien de nouveau'); return; } } catch (e) { /* refait */ } }
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(out));
    const n = Object.values(out.p).reduce((t, x) => t + x.length, 0);
    console.log(`Cartes Yu-Gi-Oh! : ${out.cards.length} cartes, ${n} impressions, ${out.sets.length} séries → ${file}`);
  })().catch((e) => { console.error(e); process.exitCode = 1; });
}
