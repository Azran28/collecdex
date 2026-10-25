// Cartes Star Wars: Unlimited (v3.67) : liste complète en français, préparée depuis la base officielle de Fantasy Flight Games
// (admin.starwarsunlimited.com › api/card-list?locale=fr : noms, sous-titres, textes, traits, visuels français cdn.starwarsunlimited.com),
// complétée par TCGplayer (tcgcsv.com, catégorie 79) : dates des séries, n° de produit (prix), sachet de booster (visuel de la série).
// La base officielle n'autorise pas les pages web à la lire (pas de CORS) et pèse ~200 Mo (10 000 fiches, une par impression : normale,
// brillante, Hyperspace, Showcase, Prestige, promos…) : ce petit outil en garde l'essentiel dans data/sw-cartes.json (dans le dépôt),
// que js/games/starwars.js lit. Relancé chaque lundi par le robot de l'index (.github/workflows/index.yml) pour les nouvelles séries.
// Une carte de CollecDex = une illustration imprimée : la version brillante (Foil) d'une carte est la même carte (variante « brillante ») ;
// Hyperspace, Showcase, Prestige, Weekly Play, promos de tournoi = cartes à part (comme les versions Full Art de Final Fantasy).
// Usage : node outils/ci/starwars-cartes.mjs [fichier de sortie]
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

const API = 'https://admin.starwarsunlimited.com/api/card-list?locale=fr';
const IMG = 'https://cdn.starwarsunlimited.com/';
const TCG = 'https://tcgcsv.com/tcgplayer/79';
const UA = { 'User-Agent': 'CollecDex (github.com/Azran28/collecdex)' };

const TYPE = { Unit: 'un', Event: 'ev', Upgrade: 'up', Leader: 'le', Base: 'ba', Token: 'to' };
const RAR = { C: 'c', U: 'u', R: 'r', L: 'l', S: 's' };
// affinités (noms français de la base) → clé courte
const ASPECT = { vigilance: 'vi', commandement: 'co', agressivite: 'ag', agressivité: 'ag', ruse: 'ru', heroisme: 'he', héroïsme: 'he', infamie: 'in', ignominie: 'in', vilenie: 'in' };
const ARENA = { terrestre: 'te', spatiale: 'sp' };
// séries de boosters et produits (decks) : le reste = promos
const DECKS = new Set(['IBH', 'TS26']);
// extensions de 2024 : leurs promos de tournoi sont rangées dans la même extension par la base (« SOR » + « SS Champion ») → série « P24 »
const OLD = new Set(['SOR', 'SHD', 'TWI']);

const rel = (x) => (x && x.data ? (Array.isArray(x.data) ? x.data.map((d) => d.attributes) : x.data.attributes) : null);
const low = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
/** « Standard Foil » → « Standard », « Foil Prestige » → « Prestige », « Weekly Play Foil » → « Weekly Play » (famille d'une impression) */
const family = (v) => String(v || '').replace(/\bFoil\b/g, '').replace(/\s+/g, ' ').trim().replace(/^Standard (Prestige)$/, '$1').replace(/^Serialized Prestige$/, 'Prestige numérotée');
const VERSION = { Standard: '', Hyperspace: 'Hyperspace', Showcase: 'Showcase', Prestige: 'Prestige', 'Prestige numérotée': 'Prestige numérotée' };
// (chemin après « cdn.starwarsunlimited.com/ » ; un « / » en plus au début fait partie du nom chez le CDN : « //04010009_FR_… », sans lui 403)
const imgPath = (a) => { const f = rel(a); return f && f.url ? String(f.url).replace(IMG, '') : ''; };
const clean = (t) => String(t || '').replace(/\s+/g, ' ').trim();

/** raw = fiches de la base officielle (attributs) ; tcg = { groups, products: { groupId: [...] } } → { m, sets, cards } */
export function build(raw, tcg) {
  const groups = (tcg && tcg.groups) || [];
  // 1. chaque fiche → sa série dans CollecDex et sa famille (normale + brillante ensemble)
  const items = [];
  const expNames = new Map(), expCount = new Map();
  const isPromoCode = (code) => (/P$/.test(code) && code.length >= 4 && !DECKS.has(code)) || /^(P|J|C|G)\d{2}$|^GG$/.test(code);
  // nombre de cartes de chaque extension (« 038/252 » → 252)
  for (const a of raw) {
    const e = rel(a.expansion), vt = (rel(a.variantTypes) || [])[0] || {};
    if (e && e.code && !isPromoCode(String(e.code).toUpperCase()) && family(vt.name) === 'Standard' && a.cardCount > 20) expCount.set(String(e.code).toUpperCase(), Math.max(expCount.get(String(e.code).toUpperCase()) || 0, a.cardCount));
  }
  for (const a of raw) {
    const e = rel(a.expansion); if (!e || !e.code) continue;
    const vt = (rel(a.variantTypes) || [])[0] || {}, vname = vt.name || '';
    const foil = !!vt.foil || /\bfoil\b/i.test(vname);
    const fam = family(vname);
    const code = String(e.code).toUpperCase(), max = expCount.get(code) || 0;
    if (!expNames.has(code)) expNames.set(code, clean(e.name));
    let set = code, kind = 'main';
    const booster = ['Standard', 'Hyperspace', 'Showcase', 'Prestige', 'Prestige numérotée'].includes(fam);
    const weekly = () => { set = code + 'P'; kind = 'promo'; if (!expNames.has(set)) expNames.set(set, `${clean(e.name)} Weekly Play`); };
    if (isPromoCode(code) || (!max && !DECKS.has(code))) kind = 'promo'; // (produit sans booster : « CST » Costco, « MV26 » film…)
    else if ((rel(a.type) || {}).value === 'Token') { set = 'JET'; kind = 'deck'; expNames.set(set, 'Jetons'); } // (jetons Expérience, Bouclier, Soldat Clone… de chaque extension)
    else if (DECKS.has(code)) kind = 'deck';
    else if (fam === 'Weekly Play') weekly();
    else if (!booster && OLD.has(code)) { set = 'P24'; kind = 'promo'; } // (promos de tournoi d'Étincelle, Ombres, Crépuscule : rangées ensemble)
    else if (!booster) { set = code + 'X'; kind = 'promo'; if (!expNames.has(set)) expNames.set(set, `${clean(e.name)} : éditions spéciales`); } // (Secrets du Pouvoir « Carbonite »…)
    // (« 5/20 », « 1/2 » dans une extension : Hyperspace des Weekly Play et des avant-premières, pas du booster)
    else if (a.cardCount && max && a.cardCount !== max && a.cardNumber <= max) { if (a.cardCount === 20) weekly(); else { set = 'P24'; kind = 'promo'; } }
    const of = rel(a.variantOf);
    // (Weekly Play : la brillante n'est pas reliée à la normale dans la base → même nom et sous-titre)
    const key = fam === 'Weekly Play' ? `${set}|${low(a.title)}|${low(a.subtitle)}|wp` : `${set}|${of ? of.cardUid : a.cardUid}|${fam || a.cardUid}`;
    items.push({ a, set, kind, fam, foil, key, vname, code });
  }
  // 2. familles → cartes (la fiche non brillante d'abord : son numéro et son visuel)
  const fams = new Map();
  for (const it of items) { if (!fams.has(it.key)) fams.set(it.key, []); fams.get(it.key).push(it); }
  const cards = [], firstSeen = new Map(); // (série → 1ʳᵉ mise en ligne d'une de ses cartes dans la base officielle)
  for (const it of items) { const d = String(it.a.publishedAt || '').slice(0, 10); if (d && (!firstSeen.has(it.set) || d < firstSeen.get(it.set))) firstSeen.set(it.set, d); }
  for (const list of fams.values()) {
    list.sort((x, y) => (x.foil - y.foil) || (x.a.cardNumber - y.a.cardNumber));
    const m = list[0], a = m.a;
    const en = (rel(a.localizations) || []).find((l) => l.locale === 'en');
    const type = rel(a.type) || {};
    const k = {
      s: m.set, num: a.cardNumber, n: clean(a.title), st: clean(a.subtitle), ne: en && clean(en.title) !== clean(a.title) ? clean(en.title) : '',
      se: en && clean(en.subtitle) !== clean(a.subtitle) ? clean(en.subtitle) : '',
      t: TYPE[type.value] || '', a: (rel(a.aspects) || []).map((x) => ASPECT[low(x.name)] || low(x.name)).concat((rel(a.aspectDuplicates) || []).map((x) => ASPECT[low(x.name)] || low(x.name))),
      tr: (rel(a.traits) || []).map((x) => clean(x.name)).join(' · '), ar: (rel(a.arenas) || []).map((x) => ARENA[low(x.name)] || '').filter(Boolean).join(''),
      co: a.cost != null ? +a.cost : null, p: a.power != null ? +a.power : null, hp: a.hp != null ? +a.hp : null,
      x: [clean(a.text), a.deployBox ? `Déployé : ${clean(a.deployBox)}` : '', clean(a.epicAction)].filter(Boolean).join('\n'),
      r: RAR[(rel(a.rarity) || {}).character] || '', img: imgPath(a.artFront), h: a.artFrontHorizontal ? 1 : 0,
      v: m.kind === 'main' || m.kind === 'deck' ? VERSION[m.fam] ?? m.fam : m.fam === 'Weekly Play' ? '' : m.vname,
      nf: list.some((x) => !x.foil) ? 1 : 0, f: list.some((x) => x.foil) ? 1 : 0,
      fn: [...new Set(list.filter((x) => x.foil && x.a.cardNumber !== a.cardNumber).map((x) => x.a.cardNumber))],
      u: a.cardUid, of: (rel(a.variantOf) || {}).cardUid || (rel(a.reprintOf) || {}).cardUid || '',
      kind: m.kind, ex: m.code, order: (((rel(a.variantTypes) || [])[0] || {}).sortValue) || 0,
    };
    if (!k.img) continue;
    cards.push(k);
  }
  // 3. identifiants : « sor-017 » ; deux cartes au même numéro dans une série (promos de tournoi) → « p24-002b »
  cards.sort((x, y) => x.s.localeCompare(y.s) || (x.num - y.num) || (x.order - y.order) || x.u.localeCompare(y.u));
  const used = new Set(), byUid = new Map();
  for (const k of cards) {
    const base = k.s === 'JET' || k.s === 'P24' ? `${k.s.toLowerCase()}-${k.ex.toLowerCase()}${k.num}` : `${k.s.toLowerCase()}-${String(k.num).padStart(3, '0')}`; // (jeton, promo de tournoi 2024 : « jet-sor1 », numéro « SOR1 »)
    let id = base, i = 1;
    while (used.has(id)) { i++; id = base + (i <= 26 ? 'abcdefghijklmnopqrstuvwxyz'[i - 1] : i); }
    used.add(id); k.id = id; k.l = k.s === 'JET' || k.s === 'P24' ? id.slice(4).toUpperCase() : id.slice(k.s.length + 1);
    byUid.set(k.u, k);
  }
  // carte d'origine (version normale) d'une version Hyperspace / Showcase / promo : son id (« b »)
  for (const k of cards) { const o = k.of && byUid.get(k.of); if (o && o !== k) { k.b = o.id; if (k.x === o.x) k.x = ''; } } // (même texte que la carte d'origine : pas recopié)
  // 4. TCGplayer : n° de produit par série et numéro (« 031/252 », « 297 ») ; promos Weekly Play « SOR-WPP » / « JTL-WPP » / « LOFWPP »
  const tpOf = new Map();
  const setOfGroup = (g) => { const ab = String(g.abbreviation || '').toUpperCase(); const m = ab.match(/^([A-Z]{3})-?WPP$/); return m ? m[1] + 'P' : ab; };
  for (const g of groups) for (const p of (tcg.products[g.groupId] || [])) {
    const n = ((p.extendedData || []).find((e) => e.name === 'Number') || {}).value;
    if (!n || !/^\d+/.test(n)) continue;
    const key = `${setOfGroup(g)}|${parseInt(n, 10)}`;
    if (!tpOf.has(key)) tpOf.set(key, p.productId);
  }
  for (const k of cards) {
    const tp = tpOf.get(`${k.s}|${k.num}`); if (tp) k.tp = tp;
    const tf = k.fn.map((n) => tpOf.get(`${k.s}|${n}`)).find(Boolean); if (tf) k.tpf = tf; // (Passage en Vitesse Lumière et après : la brillante a son propre numéro)
  }
  // 5. séries
  const groupOf = (id) => groups.find((g) => String(g.abbreviation || '').toUpperCase() === id && !/promo|wpp/i.test(g.name)) || groups.find((g) => setOfGroup(g) === id);
  const packOf = (id) => { const g = groupOf(id); const p = g && (tcg.products[g.groupId] || []).find((x) => /- booster pack$/i.test(x.name) && !/carbonite|box|case/i.test(x.name)); return p ? p.productId : 0; };
  const sets = [];
  for (const s of [...new Set(cards.map((k) => k.s))]) {
    const list = cards.filter((k) => k.s === s), kind = list[0].kind;
    const g = groupOf(s);
    let date = g ? String(g.publishedOn || '').slice(0, 10) : '';
    if (s === 'P24') date = '2024-03-08';
    const pk = kind === 'main' ? packOf(s) : 0;
    sets.push({ id: s, name: s === 'P24' ? 'Promos 2024' : expNames.get(s) || s, en: g ? g.name : '', type: kind, date, n: list.length, max: expCount.get(s) || 0, ...(pk ? { pk } : {}) });
  }
  // séries sans date chez TCGplayer : celle de la série principale (« SORP » = SOR), sinon l'année du code (« C25 », « MV26 »), sinon la 1ʳᵉ mise en ligne de ses cartes
  for (const s of sets) if (!s.date) { const b = sets.find((x) => x.id === s.id.replace(/[PX]$/, '') && x.date), y = s.id.match(/(2[4-9])$/); s.date = b ? b.date : y ? `20${y[1]}-06-01` : firstSeen.get(s.id) || ''; }
  // 6. format compact
  const out = cards.map((k) => {
    const o = { id: k.id, s: k.s, l: k.l, n: k.n, st: k.st, ne: k.ne, se: k.se, t: k.t, a: k.a, tr: k.tr, ar: k.ar, co: k.co, p: k.p, hp: k.hp, x: k.x, r: k.r, img: k.img, h: k.h, v: k.v, f: k.f, nf: k.nf, fn: k.fn, tp: k.tp, tpf: k.tpf, b: k.b };
    if (o.nf && !o.f) delete o.f; // (par défaut : normale + brillante)
    if (o.f) { if (o.nf) { delete o.f; delete o.nf; o.vf = 'nh'; } else { delete o.nf; o.vf = 'h'; } } else { delete o.nf; o.vf = 'n'; }
    if (o.vf === 'nh') delete o.vf;
    for (const key of Object.keys(o)) if (o[key] === '' || o[key] === null || o[key] === undefined || o[key] === 0 || (Array.isArray(o[key]) && !o[key].length)) delete o[key];
    return o;
  });
  return { m: new Date().toISOString().slice(0, 10), sets, cards: out };
}

async function getJSON(url, opts = {}) {
  for (let i = 0; ; i++) {
    try { const r = await fetch(url, { ...opts, headers: { ...UA, ...(opts.headers || {}) } }); if (r.ok) return await r.json(); throw new Error(`HTTP ${r.status} ${url}`); }
    catch (e) { if (i >= 4) throw e; await new Promise((res) => setTimeout(res, 3000 * (i + 1))); }
  }
}
export async function fetchAll() {
  const raw = [];
  for (let page = 1, count = 1; page <= count; page++) {
    const j = await getJSON(`${API}&pagination[page]=${page}&pagination[pageSize]=100`);
    count = j.meta.pagination.pageCount;
    raw.push(...j.data.map((d) => d.attributes));
  }
  const groups = (await getJSON(`${TCG}/groups`)).results || [], products = {};
  for (const g of groups) products[g.groupId] = (await getJSON(`${TCG}/${g.groupId}/products`)).results || [];
  return { raw, tcg: { groups, products } };
}

if (typeof process !== 'undefined' && process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const file = process.argv[2] || 'data/sw-cartes.json';
  (async () => {
    const { raw, tcg } = await fetchAll();
    const r = build(raw, tcg);
    if (r.cards.length < 3000) throw new Error(`seulement ${r.cards.length} cartes : pas écrit`);
    // rien de nouveau (même liste qu'avant) : fichier laissé tel quel (pas d'envoi inutile du robot)
    const old = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
    if (old && JSON.stringify({ ...old, m: '' }) === JSON.stringify({ ...r, m: '' })) { console.log(`Cartes Star Wars Unlimited : ${r.cards.length}, inchangées`); return; }
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(r));
    console.log(`Cartes Star Wars Unlimited : ${r.cards.length} cartes, ${r.sets.length} séries → ${file}`);
  })().catch((e) => { console.log(`::warning title=Cartes Star Wars Unlimited::${String(e && e.message || e).slice(0, 300)}`); process.exitCode = 0; });
}
