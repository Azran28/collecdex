// Cartes Final Fantasy TCG (v3.43) : liste complète en français, préparée depuis la base officielle de Square Enix
// (fftcg.square-enix-games.com › get-cards : noms, textes, jobs, catégories en 6 langues, visuels français fftcg.cdn.sewest.net),
// complétée par TCGplayer (tcgcsv.com, catégorie 24) : dates des séries, n° de produit (prix), et les promos « PR-112/16-067L »
// que la base officielle ne montre presque pas (3 sur ~240). Ni l'une ni l'autre n'autorise les pages web à les lire (pas de CORS),
// et la base officielle pèse 13 Mo : ce petit outil en garde l'essentiel dans data/ff-cartes.json (dans le dépôt), que
// js/games/finalfantasy.js lit. Relancé chaque lundi par le robot de l'index (.github/workflows/index.yml) pour les nouvelles séries.
// Usage : node outils/ci/finalfantasy-cartes.mjs [fichier de sortie]
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

const API = 'https://fftcg.square-enix-games.com/en/get-cards';
const IMG = 'https://fftcg.cdn.sewest.net/images/cards/full/';
const TCG = 'https://tcgcsv.com/tcgplayer/24';
const UA = { 'User-Agent': 'CollecDex (github.com/Azran28/collecdex)' };

// élément (japonais dans la base officielle) → clé courte
const EL = { '火': 'fe', '氷': 'gl', '風': 've', '土': 'te', '雷': 'fo', '水': 'ea', '光': 'lu', '闇': 'tn' };
const EL_TXT = { '火': 'Feu', '氷': 'Glace', '風': 'Vent', '土': 'Terre', '雷': 'Foudre', '水': 'Eau', '光': 'Lumière', '闇': 'Ténèbres' };
// type (français de la base officielle) → clé courte
const TYPE = { Avant: 'av', Soutien: 'so', Invocation: 'in', Monstre: 'mo', Cristal: 'cr' };
const TYPE_EN = { Forward: 'av', Backup: 'so', Summon: 'in', Monster: 'mo', Crystal: 'cr' };
// rareté (lettre imprimée à la fin du code) → clé
const RAR = { C: 'c', R: 'r', H: 'h', L: 'l', S: 's', B: 'b', PR: 'pr' };

/** Texte de la base officielle → texte lisible : [[br]] = retour à la ligne, 《火》 = (Feu), 《ダル》 = (Dull), balises retirées */
export function cleanText(t) {
  return String(t || '')
    .replace(/<br\s*\/?>|\[\[br\]\]/gi, '\n').replace(/<\/?p>/gi, '').replace(/&nbsp;/g, ' ').replace(/&middot;/g, '·').replace(/&amp;/g, '&')
    .replace(/\[\[\/?[a-z]*\]\]/gi, '')
    .replace(/《([^》]*)》/g, (m, x) => `(${EL_TXT[x] || (x === 'ダル' ? 'Dull' : x === '一般' ? 'Général' : x.replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0)))})`)
    .replace(/<[^>]+>/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').replace(/[ \t]{2,}/g, ' ').trim();
}
const cleanCat = (c) => String(c || '').replace(/&middot;/g, '·').trim();

/** « 16-006C » → { set: '16', num: '006', r: 'C' } ; « Re-006C/16-003C » → Re, 006, base « 16-003C » ; « PR-112/16-067L » ; « C-004 » ; « B-001 » */
export function parseCode(code) {
  const [first, base = ''] = String(code || '').split('/');
  const m = first.match(/^([0-9]+|Re|PR|C|B)-(\d{3})([A-Z]{0,2})$/i);
  if (!m) return null;
  return { set: m[1].length <= 2 && /^\d+$/.test(m[1]) ? String(+m[1]) : m[1].toUpperCase() === 'RE' ? 'Re' : m[1].toUpperCase(), num: m[2], r: m[3] || '', base };
}

/** cards = base officielle ; tcg = { groups, products: { groupId: [...] } } → { m, sets, cards } */
export function build(cards, tcg) {
  const out = [], seen = new Set(), byCode = new Map();
  const groups = (tcg && tcg.groups) || [];
  // n° de produit TCGplayer par code imprimé (« 16-006C ») : la carte de base, pas les éditions spéciales « (Full Art) »
  const tpOf = new Map(), tpFull = new Map();
  for (const g of groups) for (const p of (tcg.products[g.groupId] || [])) {
    const n = ((p.extendedData || []).find((e) => e.name === 'Number') || {}).value;
    if (!n) continue;
    const key = String(n).split('/')[0].trim().toUpperCase(), plain = !/\(/.test(p.name);
    if (/\(full art\)/i.test(p.name) && !tpFull.has(key)) tpFull.set(key, p.productId);
    if (!tpOf.has(key) || (plain && !tpOf.get(key).plain)) tpOf.set(key, { id: p.productId, plain });
  }
  const setNames = new Map(); // série → noms rencontrés (le plus fréquent l'emporte)
  for (const c of cards) {
    const pc = parseCode(c.code);
    if (!pc) continue;
    const id = `${pc.set.toLowerCase()}-${pc.num}`;
    if (seen.has(id)) continue; // (C-001 : même cristal dans deux séries)
    seen.add(id);
    const imgs = ((c.images && c.images.full) || []).map(String);
    const img = imgs.find((u) => /_fr\.jpg$/.test(u)) || imgs.find((u) => /_fr/.test(u)) || imgs[0] || '';
    const sn = (c.set || [])[0] || '';
    if (sn) { const m = setNames.get(pc.set) || new Map(); m.set(sn, (m.get(sn) || 0) + 1); setNames.set(pc.set, m); }
    const firstCode = String(c.code).split('/')[0];
    const k = {
      id, s: pc.set, l: pc.num, c: c.code, n: c.name_fr || '', ne: c.name_en && c.name_en !== c.name_fr ? c.name_en : '',
      t: TYPE[c.type_fr] || TYPE_EN[c.type_en] || '', j: c.job_fr || '', ca: [...new Set([cleanCat(c.category_1), cleanCat(c.category_2)].join(' · ').split(' · ').filter(Boolean))].join(' · '),
      e: (c.element || []).map((x) => EL[x]).filter(Boolean), co: c.cost != null && c.cost !== '' ? +c.cost : null, p: c.power ? +c.power : null,
      r: RAR[pc.r] || (TYPE[c.type_fr] === 'cr' ? 'cr' : RAR[c.rarity] || ''), x: cleanText(c.text_fr || c.text_en),
      img: img.replace(IMG, ''), ex: c.ex_burst === '1' ? 1 : 0, mc: c.multicard === '1' ? 1 : 0,
      tp: (tpOf.get(firstCode.toUpperCase()) || {}).id || 0,
    };
    if (pc.base) k.b = pc.base; // (réimpression « Re-006C/16-003C » : carte d'origine)
    if (!k.n) k.n = k.t === 'cr' ? `Cristal${k.ca ? ` (${k.ca})` : ''}` : k.ne; // (cristaux : pas de nom)
    for (const key of Object.keys(k)) if (k[key] === '' || k[key] === null || k[key] === 0 || (Array.isArray(k[key]) && !k[key].length)) delete k[key];
    out.push(k); byCode.set(firstCode.toUpperCase(), k);
    // version « Full Art » (même code imprimé, texte posé sur l'illustration, sans cadre ; fichier « _FL ») : une carte à part,
    // id « 9-022fa » (Vayne 9-022L d'Arnaud, photo 10)
    const fl = imgs.find((u) => /_FL[_.]/.test(u) && /_fr/.test(u)) || imgs.find((u) => /_FL[_.]/.test(u));
    if (fl && fl !== img) {
      const v = { ...k, id: `${id}fa`, img: fl.replace(IMG, ''), fa: 1, tp: tpFull.get(firstCode.toUpperCase()) || 0 };
      if (!v.tp) delete v.tp;
      out.push(v); seen.add(v.id);
    }
  }
  // promos (TCGplayer « FF: Promo Cards ») : « PR-112/16-067L » ; la carte d'origine donne le nom et le texte français
  const promoGroup = groups.find((g) => g.abbreviation === 'PR');
  for (const p of (promoGroup ? tcg.products[promoGroup.groupId] || [] : [])) {
    const n = ((p.extendedData || []).find((e) => e.name === 'Number') || {}).value || '';
    const pc = parseCode(n);
    if (!pc || pc.set !== 'PR') continue;
    const id = `pr-${pc.num}`;
    const base = pc.base ? byCode.get(pc.base.toUpperCase()) : null;
    const known = out.find((k) => k.id === id);
    if (known) { if (!known.tp) known.tp = p.productId; continue; } // (PR-001…003 : déjà dans la base officielle, visuel français)
    if (seen.has(id)) continue;
    seen.add(id);
    const ext = (name) => ((p.extendedData || []).find((e) => e.name === name) || {}).value || '';
    const nameEn = String(p.name).replace(/\s*\([^)]*\)\s*/g, ' ').trim();
    const k = {
      id, s: 'PR', l: pc.num, c: n, n: base ? base.n : nameEn, ne: base ? (base.ne || '') : '', t: base ? base.t : TYPE_EN[ext('CardType')] || '',
      j: base ? base.j : '', ca: base ? base.ca : cleanCat(ext('Category')), e: base ? base.e : [], co: base ? base.co : +ext('Cost') || null,
      p: base ? base.p : +ext('Power') || null, r: 'pr', x: base ? base.x : '', ex: base ? base.ex : 0, mc: base ? base.mc : 0,
      img: `tcg:${p.productId}`, tp: p.productId, pe: String(p.name).match(/\(([^)]*)\)/) ? String(p.name).match(/\(([^)]*)\)/)[1] : '',
    };
    if (pc.base) k.b = pc.base;
    if (base && base.ne === '' && base.n !== nameEn) k.ne = nameEn;
    for (const key of Object.keys(k)) if (k[key] === '' || k[key] === null || k[key] === 0 || (Array.isArray(k[key]) && !k[key].length)) delete k[key];
    out.push(k);
  }
  // séries : numéros (« 16 » = Emissaries of Light), Legacy Collection (Re), promos, cristaux, Boss Decks
  const date = (name) => { const g = groups.find((x) => x.name === name || String(x.name).startsWith(name + ':') || String(x.name).replace(/^Boss Deck: /, 'Boss Deck ') === name); return g ? String(g.publishedOn || '').slice(0, 10) : ''; };
  const sets = [];
  for (const s of [...new Set(out.map((k) => k.s))]) {
    const names = setNames.get(s), en = names ? [...names.entries()].sort((a, b) => b[1] - a[1])[0][0] : '';
    let name = en, type = 'main';
    if (s === 'PR') { name = 'Promos'; type = 'promo'; }
    else if (s === 'C') { name = 'Cristaux'; type = 'extra'; }
    else if (s === 'B') { name = 'Boss Decks'; type = 'deck'; }
    else if (s === 'Re') { name = 'Legacy Collection'; type = 'extra'; }
    const list = out.filter((k) => k.s === s);
    let d = s === 'B' ? date('Boss Deck: Chaos') : s === 'C' ? date('Crystal Dominion') : s === 'PR' ? '2016-10-28' : date(en);
    if (!d && /^\d+$/.test(s)) d = '';
    sets.push({ id: s, name, en, type, date: d, n: list.length });
  }
  // séries sans date chez TCGplayer : entre ses voisines (ordre des numéros)
  const nums = sets.filter((s) => /^\d+$/.test(s.id)).sort((a, b) => a.id - b.id);
  nums.forEach((s, i) => { if (!s.date) { const prev = nums.slice(0, i).reverse().find((x) => x.date); s.date = prev ? prev.date.slice(0, 7) + '-28' : '2016-10-28'; } });
  return { m: new Date().toISOString().slice(0, 10), sets, cards: out };
}

async function getJSON(url, opts = {}) {
  for (let i = 0; ; i++) {
    try { const r = await fetch(url, { ...opts, headers: { ...UA, ...(opts.headers || {}) } }); if (r.ok) return await r.json(); throw new Error(`HTTP ${r.status} ${url}`); }
    catch (e) { if (i >= 2) throw e; await new Promise((res) => setTimeout(res, 2000 * (i + 1))); }
  }
}
export async function fetchAll() {
  const body = { language: 'fr', text: '', type: [], element: [], cost: [], rarity: [], power: [], category_1: [], set: [], multicard: '', ex_burst: '', code: '', special: '', exactmatch: 0 };
  const off = await getJSON(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const groups = (await getJSON(`${TCG}/groups`)).results || [], products = {};
  for (const g of groups) products[g.groupId] = (await getJSON(`${TCG}/${g.groupId}/products`)).results || [];
  return { cards: off.cards || [], tcg: { groups, products } };
}

if (typeof process !== 'undefined' && process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const file = process.argv[2] || 'data/ff-cartes.json';
  (async () => {
    const { cards, tcg } = await fetchAll();
    const r = build(cards, tcg);
    if (r.cards.length < 3500) throw new Error(`seulement ${r.cards.length} cartes : pas écrit`);
    // rien de nouveau (même liste qu'avant) : fichier laissé tel quel (pas d'envoi inutile du robot)
    const old = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
    if (old && JSON.stringify({ ...old, m: '' }) === JSON.stringify({ ...r, m: '' })) { console.log(`Cartes Final Fantasy : ${r.cards.length}, inchangées`); return; }
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(r));
    console.log(`Cartes Final Fantasy : ${r.cards.length} cartes, ${r.sets.length} séries → ${file}`);
  })().catch((e) => { console.log(`::warning title=Cartes Final Fantasy::${String(e && e.message || e).slice(0, 300)}`); process.exitCode = 0; });
}
