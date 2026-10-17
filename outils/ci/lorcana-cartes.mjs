// Cartes Disney Lorcana (v3.21) : liste complète en français, préparée depuis LorcanaJSON (lorcanajson.org, données des
// applications officielles de Ravensburger, en français ET en anglais). LorcanaJSON n'autorise pas les pages web à le lire
// (pas d'en-tête CORS) et pèse 10 Mo par langue : ce petit outil en garde l'essentiel dans data/lc-cartes.json (dans le dépôt),
// que js/games/lorcana.js lit. Relancé chaque lundi par le robot de l'index (.github/workflows/index.yml) pour les nouvelles séries.
// Usage : node outils/ci/lorcana-cartes.mjs [fichier de sortie]
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

const BASE = 'https://lorcanajson.org/files/current';
const IMG = 'https://api.lorcana.ravensburger.com/images/';

// rareté (anglais, LorcanaJSON) → clé courte
const RAR = { Common: 'c', Uncommon: 'u', Rare: 'r', 'Super Rare': 'sr', Legendary: 'l', Epic: 'e', Enchanted: 'en', Iconic: 'i', Special: 'p' };
// encre (anglais) → clé courte ; « Amber-Steel » → ['am', 'st']
const INK = { Amber: 'am', Amethyst: 'amy', Emerald: 'em', Ruby: 'ru', Sapphire: 'sa', Steel: 'st' };
const TYPE = { Character: 'ch', Action: 'ac', Item: 'it', Location: 'lo' };

/** « 1/204 • FR • 1 », « 18/P1 • FR • 2 », « 1 TFC • EN • 1/P1 », « 4a/204 • FR • 3 », « 1/31 • FR • Q1 » → { num, grp, of } */
export function parseId(fi, setCode) {
  const s = String(fi || '');
  let m = s.match(/^(\d+[a-z]?)\s*\/\s*([A-Z]+\d*|\d+)\s*•/i);
  if (m) return /^\d+$/.test(m[2]) ? { num: m[1], grp: '', of: +m[2] } : { num: m[1], grp: m[2].toUpperCase(), of: 0 };
  m = s.match(/•\s*(\d+[a-z]?)\s*\/\s*([A-Z]+\d*)\s*$/i); // (anciennes promos : « 1 TFC • EN • 1/P1 »)
  if (m) return { num: m[1], grp: m[2].toUpperCase(), of: 0 };
  return { num: String(parseInt(s, 10) || ''), grp: '', of: 0, setCode };
}

const clean = (t) => String(t || '').replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();

/** fr, en = allCards.json des deux langues → { m, sets, cards } */
export function build(fr, en) {
  const enById = new Map(en.cards.map((c) => [c.id, c]));
  const frById = new Map(fr.cards.map((c) => [c.id, c]));
  const all = [...fr.cards, ...en.cards.filter((c) => !frById.has(c.id))]; // (quelques promos n'existent qu'en anglais)
  const cards = [], seen = new Set();
  for (const c of all) {
    const e = enById.get(c.id) || c, isFr = frById.has(c.id);
    const { num, grp, of } = parseId(c.fullIdentifier, c.setCode);
    if (!num) continue;
    const set = grp || String(c.setCode);
    const id = `${set.toLowerCase()}-${num}`;
    if (seen.has(id)) continue; // (même carte imprimée deux fois dans la liste : on garde la française)
    seen.add(id);
    const name = isFr ? c.fullName : e.fullName, nameEn = e.fullName;
    const foils = c.foilTypes || e.foilTypes || [];
    const k = {
      id, s: set, o: grp ? String(c.setCode) : '', l: num, n: c.name, v: c.version || '', st: c.story || e.story || '',
      r: RAR[e.rarity] || 'p', t: TYPE[e.type] || '', k: String(e.color || '').split('-').map((x) => INK[x]).filter(Boolean),
      co: c.cost ?? null, iw: c.inkwell ? 1 : 0, sg: c.strength ?? null, wp: c.willpower ?? null, lo: c.lore ?? null, mv: c.moveCost ?? null,
      sb: c.subtypes || [], x: ((c.fullTextSections && c.fullTextSections.length) ? c.fullTextSections : [c.fullText]).map(clean).filter(Boolean).join('\n'), a: c.artistsText || '',
      img: String((c.images && c.images.full) || (e.images && e.images.full) || '').replace(IMG, ''),
      f: (foils.includes('None') || !foils.length ? 1 : 0) + (foils.some((x) => x !== 'None') ? 2 : 0), // 1 = normale, 2 = brillante
      tp: (e.externalLinks && e.externalLinks.tcgPlayerId) || 0, cm: (e.externalLinks && e.externalLinks.cardmarketId) || 0,
    };
    if (!isFr) k.enOnly = 1;
    if (nameEn !== name) k.ne = nameEn; // (nom anglais : cartes anglaises, import d'un fichier Collectr / Cardmarket)
    if (of) k.of = of;
    // champs vides retirés (fichier plus léger)
    for (const key of Object.keys(k)) if (k[key] === '' || k[key] === null || (Array.isArray(k[key]) && !k[key].length)) delete k[key];
    cards.push(k);
  }
  // séries : chapitres et quêtes (LorcanaJSON), puis les groupes de promos (« 18/P1 »)
  const sets = [];
  for (const [code, s] of Object.entries(fr.sets)) {
    const n = cards.filter((k) => k.s === code).length;
    if (!n) continue; // (chapitre annoncé, sans carte encore)
    const se = (en.sets || {})[code] || {};
    sets.push({ id: code, name: s.name, en: se.name || '', type: s.type === 'quest' ? 'quest' : 'main', date: s.releaseDate || s.prereleaseDate || '', base: (s.cardCounts && s.cardCounts.base) || 0 });
  }
  const PROMO = {
    P1: ['Promos (1re vague)', 'Promo Set 1'], P2: ['Promos (2e vague)', 'Promo Set 2'], P3: ['Promos (3e vague)', 'Promo Set 3'], P4: ['Promos (4e vague)', 'Promo Set 4'],
    C1: ['Promos Challenge', 'Challenge Promo'], C2: ['Promos Challenge (année 3)', 'Lorcana Challenge Year 3'], D23: ['Collection D23', 'D23 Collection'],
    DIS: ['Promos Disney Parcs', 'Disney Parks'], PD1: ['Promos avant-première', 'Prerelease Promos'], RPH: ['Promos Disney Store', 'Disney Store'], CC1: ['Collection du conservateur', "Curator's Collection"],
  };
  const groups = [...new Set(cards.filter((k) => k.o).map((k) => k.s))];
  for (const g of groups) {
    const list = cards.filter((k) => k.s === g), first = list.map((k) => sets.find((s) => s.id === k.o)).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date))[0];
    const [name, nameEn] = PROMO[g] || [`Promos ${g}`, `Promo ${g}`];
    sets.push({ id: g, name, en: nameEn, type: 'promo', date: first ? first.date : '', base: 0 });
  }
  return { m: new Date().toISOString().slice(0, 10), v: fr.metadata && fr.metadata.generatedOn, sets, cards };
}

async function getJSON(url) {
  for (let i = 0; ; i++) {
    try { const r = await fetch(url, { headers: { 'User-Agent': 'CollecDex (github.com/Azran28/collecdex)' } }); if (r.ok) return await r.json(); throw new Error(`HTTP ${r.status} ${url}`); }
    catch (e) { if (i >= 2) throw e; await new Promise((res) => setTimeout(res, 2000 * (i + 1))); }
  }
}

if (typeof process !== 'undefined' && process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const file = process.argv[2] || 'data/lc-cartes.json';
  (async () => {
    const [fr, en] = await Promise.all([getJSON(`${BASE}/fr/allCards.json`), getJSON(`${BASE}/en/allCards.json`)]);
    const r = build(fr, en);
    if (r.cards.length < 3000) throw new Error(`seulement ${r.cards.length} cartes : pas écrit`);
    // rien de nouveau (même liste qu'avant) : fichier laissé tel quel (pas d'envoi inutile du robot)
    const old = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
    const same = old && JSON.stringify({ ...old, m: '', v: '' }) === JSON.stringify({ ...r, m: '', v: '' });
    if (same) { console.log(`Cartes Lorcana : ${r.cards.length}, inchangées`); return; }
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(r));
    console.log(`Cartes Lorcana : ${r.cards.length} cartes, ${r.sets.length} séries → ${file}`);
  })().catch((e) => { console.log(`::warning title=Cartes Lorcana::${String(e && e.message || e).slice(0, 300)}`); process.exitCode = 0; });
}
