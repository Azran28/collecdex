// Cartes Cyberpunk TCG (v3.96) : liste complète, en français, préparée depuis la base officielle (cyberpunktcg.com/cards, servie par
// Netdeck.gg : api.netdeck.gg/api/cards/cyberpunk?language=fr|en — noms, textes, raretés, couleurs, coûts, puissance, RAM, tags,
// illustrateurs, une fiche par carte avec toutes ses impressions, anglaises et françaises). L'API autorise les pages web, mais ses
// visuels sont des adresses signées valables 5 minutes (et refusées sans signature, relais compris) : ce petit outil garde l'essentiel
// dans data/cp-cartes.json et une petite copie de chaque visuel dans data/cp-img/<id>.webp (300 px de large, ~20 Ko), comme Wankul.
// Il relie aussi chaque carte à son produit TCGplayer (prix : outils/ci/prix-cyberpunk.mjs) et chaque série à son booster (visuel).
// Relancé chaque lundi par le robot de l'index (.github/workflows/index.yml) ; seuls les visuels nouveaux ou changés sont retéléchargés.
// Usage : node outils/ci/cyberpunk-cartes.mjs [fichier de sortie] [dossier des visuels]
//   (visuels convertis en webp par Chromium (Playwright, installé par le robot) ; sans Playwright : liste seulement)
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const API = 'https://api.netdeck.gg/api/cards/cyberpunk';
const TCG = 'https://tcgcsv.com/tcgplayer/92'; // 92 = Cyberpunk TCG chez TCGplayer
const UA = { 'User-Agent': 'CollecDex (github.com/Azran28/collecdex)' };
const IMG_W = 300;

// série de la base (sans « -fr ») → [id, nom, code imprimé (« MS01 - WNC [A] » ; Bêta : numéro « B010 »), genre, nom TCGplayer du groupe]
// genres : main (extension), deck (decks de démarrage et de démo), promo (promos et tournois), beta (première impression, Kickstarter)
export const SETS = {
  welcometonightcityretail: ['wnc', 'Welcome to Night City', 'MS01 - WNC', 'main', 'Welcome to Night City - Retail'],
  theheistretailstarterdeck: ['hei', 'Deck de démarrage The Heist', 'SD01 - HEI', 'deck', 'The Heist - Retail Starter Deck'],
  embracingpowerretailstarterdeck: ['emb', 'Deck de démarrage Embracing Power', 'SD02 - EBP', 'deck', 'Embracing Power - Retail Starter Deck'],
  boxtoppersretail: ['bt', 'Cartes bonus des displays', 'PRM - WNC', 'promo', 'Box Toppers - Retail'],
  prereleaseretail: ['prr', 'Avant-première', 'PRR02 - WNC', 'promo', ''],
  PRM01: ['prm1', 'Promos de la série 1', 'PRM01', 'promo', 'Set 1 Promos'],
  nightcitybrawls1: ['ncb1', 'Night City Brawl, saison 1', 'NCB01 - WNC', 'promo', 'Night City Brawl Season 1'],
  nightcityshowdowns1: ['ncs1', 'Night City Showdown, saison 1', 'NCS01 - WNC', 'promo', ''],
  edgerunneropens1: ['eor1', 'Edgerunner Open, saison 1', 'EOR01 - WNC', 'promo', 'Edgerunner Open Season 1'],
  judgepromos: ['jdg', 'Promos d’arbitre', 'JDG - WNC', 'promo', ''],
  arasakademodeck: ['dar', 'Deck de démo Arasaka', 'PRM - DD2', 'deck', ''],
  mercdemodeck: ['dme', 'Deck de démo Merc', 'PRM - DD1', 'deck', ''],
  welcometonightcitybeta: ['wncb', 'Welcome to Night City (Bêta)', 'MS01 - WNC', 'beta', 'Welcome to Night City - Beta'],
  theheistbetastarterdeck: ['heib', 'The Heist (Bêta)', 'SD01 - HEI', 'beta', 'The Heist - Beta Starter Deck'],
  embracingpowerbetastarterdeck: ['embb', 'Embracing Power (Bêta)', 'SD02 - EBP', 'beta', 'Embracing Power - Beta Starter Deck'],
  boxtoppersbeta: ['btb', 'Cartes bonus des displays (Bêta)', 'PRM - WNC', 'beta', 'Box Toppers - Beta'],
  prereleasebeta: ['prrb', 'Avant-première (Bêta)', 'PRR01 - WNC', 'beta', 'Pre-Release Beta'],
};
// rareté de la base → clé courte (Rare et au-dessus : brillantes)
const RAR = { Common: 'c', Uncommon: 'u', Rare: 'r', Epic: 'e', Secret: 's', 'Nova Rare': 'nr', 'Iconic Legend': 'il', 'Iconic Secret': 'is', 'Iconic Other': 'io' };
const TYPE = { Legend: 'l', Unit: 'u', Gear: 'g', Program: 'p' };
const COLOR = { Red: 'r', Blue: 'b', Green: 'g', Yellow: 'y' };

const slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const clean = (t) => String(t || '').replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();
// « Gosse Des Rues », « Jônin De Japantown » (capitales à chaque mot dans la base) → « Gosse des Rues », « Jônin de Japantown »
const SMALL = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'et', 'à', 'au', 'aux', 'en', 'sur', 'dans', 'par', 'pour', 'un', 'une']);
const nice = (s) => String(s || '').trim().split(/\s+/).map((w, i) => (i && SMALL.has(w.toLowerCase()) ? w.toLowerCase() : /^(D|L)'/.test(w) && i ? w[0].toLowerCase() + w.slice(1) : w)).join(' ');
/** Série de la base (« welcometonightcityretail-fr », « embracingpowerretailstarterde-fr ») → clé de SETS */
export function familyOf(code) {
  const c = String(code || '').replace(/-fr$/i, '');
  if (SETS[c]) return c;
  return Object.keys(SETS).find((k) => k.startsWith(c) && c.length > 12) || c;
}
const setOf = (code) => { const f = familyOf(code); return SETS[f] || [slug(f).slice(0, 8), f, '', 'promo', '']; };
// « β005a » (Bêta), « B005a » (TCGplayer), « 10 » (une fiche anglaise) → « 005a », « 010 »
const numOf = (n) => String(n || '').trim().replace(/^[βB]/i, '').toLowerCase().replace(/^(\d+)/, (d) => d.padStart(3, '0'));
const pathOf = (u) => String(u || '').replace(/^https:\/\/dstcynss47vun\.cloudfront\.net\/prod\/cyberpunk\/portal\//, '').replace(/\?.*$/, '');

/**
 * raw = { en: [fiches], fr: [fiches] } (API), tcg = { groups, products: { groupId: [produits] } } → { m, sets, cards }
 * Une carte = une impression dans une série (anglaise ou française : même carte, le visuel français d'abord).
 */
export function build(raw, tcg = { groups: [], products: {} }) {
  const fr = new Map((raw.fr || []).map((c) => [c.id, c])), all = new Map();
  for (const c of [...(raw.en || []), ...(raw.fr || [])]) if (!all.has(c.id)) all.set(c.id, c);
  const cards = new Map(), order = [];
  for (const [cid, c] of all) {
    const f = fr.get(cid), en = (raw.en || []).find((x) => x.id === cid) || c;
    for (const p of c.printings || []) {
      const [s] = setOf(p.set && p.set.code), l = numOf(p.collector_number), id = `${s}-${l}`;
      if (!l) continue;
      let k = cards.get(id);
      if (!k) {
        const frName = f && f.language === 'fr' ? f : null;
        k = {
          id, s, l, n: nice(frName ? frName.name : en.name), st: nice(frName ? frName.subname : en.subname),
          ne: en.name || '', se: en.subname || '', t: TYPE[c.card_type] || '', c: COLOR[c.color] || '',
          co: c.cost, p: c.power, ram: c.ram, ed: c.is_eddiable ? 1 : 0, tg: c.classifications || [],
          x: clean(frName ? frName.rules_text : en.rules_text), r: RAR[p.rarity] || slug(p.rarity), a: p.artist || '',
          u: '', lg: 'en', cid,
        };
        cards.set(id, k); order.push(id);
      }
      // visuel : l'impression française d'abord
      if (p.language === 'fr' || !k.u) { k.u = pathOf(p.source_image_url || p.image_url); k.sig = p.image_url || ''; if (p.language === 'fr') { k.lg = 'fr'; if (p.localized_name) k.ln = p.localized_name; } }
    }
  }
  // produits TCGplayer : carte (série + numéro + début du nom anglais) → n° de produit ; série → sachet de booster (visuel)
  const groupSet = {};
  for (const [, v] of Object.entries(SETS)) if (v[4]) groupSet[v[4]] = v[0];
  const packs = {}, dates = {};
  for (const g of tcg.groups || []) {
    const s = groupSet[g.name]; if (!s) continue;
    dates[s] = String(g.publishedOn || '').slice(0, 10);
    for (const pr of (tcg.products || {})[g.groupId] || []) {
      const ed = Object.fromEntries((pr.extendedData || []).map((e) => [e.name, e.value]));
      if (!ed.Number) {
        // (« Welcome to Night City - Retail Booster Pack », « Starter Deck: The Heist - Retail » ; pas les boîtes ni les présentoirs)
        if (!packs[s] && /Booster Pack$|^Starter Deck:/i.test(pr.name) && !/Case|Box|Display/i.test(pr.name)) packs[s] = pr.productId;
        continue;
      }
      const k = cards.get(`${s}-${numOf(ed.Number)}`);
      if (k && slug(pr.name).startsWith(slug(k.ne).slice(0, 6))) k.tp = pr.productId;
    }
  }
  const list = order.map((id) => cards.get(id));
  const sets = [];
  for (const [, [id, name, code, type, tname]] of Object.entries(SETS)) {
    const n = list.filter((k) => k.s === id).length; if (!n) continue;
    const anyFr = list.some((k) => k.s === id && k.lg === 'fr');
    sets.push({ id, name, code, type, n, fr: anyFr ? 1 : 0, date: dates[id] || '', pk: packs[id] || 0, en: tname || '' });
  }
  for (const id of new Set(list.map((k) => k.s))) if (!sets.some((s) => s.id === id)) sets.push({ id, name: id, code: '', type: 'promo', n: list.filter((k) => k.s === id).length, fr: 0, date: '', pk: 0, en: '' });
  for (const k of list) {
    if (!k.tg.length) delete k.tg;
    for (const key of Object.keys(k)) if (k[key] === '' || k[key] === null || k[key] === undefined || (k[key] === 0 && key !== 'co' && key !== 'p')) delete k[key];
  }
  return { m: new Date().toISOString().slice(0, 10), sets, cards: list };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getJSON(url) {
  for (let i = 0; ; i++) {
    try { const r = await fetch(url, { headers: UA }); if (r.ok) return await r.json(); throw new Error(`HTTP ${r.status} ${url}`); }
    catch (e) { if (i >= 3) throw e; await sleep(2000 * (i + 1)); }
  }
}
/** Toutes les fiches, en anglais et en français (100 par page, « offset ») + produits TCGplayer */
export async function fetchAll() {
  const raw = {};
  for (const lang of ['en', 'fr']) {
    const items = [];
    for (let o = 0; o < 5000; o += 100) {
      const r = await getJSON(`${API}?offset=${o}&limit=100&language=${lang}`);
      items.push(...(r.items || []));
      if (!r.items || r.items.length < 100 || items.length >= (r.total || 0)) break;
    }
    raw[lang] = [...new Map(items.map((c) => [c.id, c])).values()];
  }
  const tcg = { groups: [], products: {} };
  try {
    tcg.groups = (await getJSON(`${TCG}/groups`)).results || [];
    for (const g of tcg.groups) tcg.products[g.groupId] = (await getJSON(`${TCG}/${g.groupId}/products`)).results || [];
  } catch (e) { console.log(`::warning title=Cartes Cyberpunk::produits TCGplayer illisibles (${String(e.message).slice(0, 120)})`); }
  return { raw, tcg };
}

/** Visuels manquants ou changés → dir/<id>.webp (300 px de large), par Chromium (Playwright) ; adresses signées fraîches (5 min) */
export async function images(cards, dir) {
  mkdirSync(dir, { recursive: true });
  const stamp = join(dir, 'sources.json'), src = existsSync(stamp) ? JSON.parse(readFileSync(stamp, 'utf8')) : {};
  const todo = cards.filter((k) => k.u && (src[k.id] !== k.u || !existsSync(join(dir, k.id + '.webp'))));
  if (!todo.length) return 0;
  let chromium;
  try { ({ chromium } = await import('playwright')); } catch (e) { console.log(`::warning title=Visuels Cyberpunk::Playwright absent, ${todo.length} visuels non convertis`); return 0; }
  const browser = await chromium.launch(), page = await browser.newPage();
  let done = 0;
  for (const k of todo) {
    const r = k.sig ? await fetch(k.sig).catch(() => null) : null;
    if (!r || !r.ok) { console.log(`visuel introuvable : ${k.id}`); continue; }
    const buf = Buffer.from(await r.arrayBuffer());
    const b64 = await page.evaluate(async ([data, W]) => {
      const bin = Uint8Array.from(atob(data), (ch) => ch.charCodeAt(0));
      const bmp = await createImageBitmap(new Blob([bin], { type: 'image/webp' }));
      const H = Math.round(bmp.height * W / bmp.width), c = new OffscreenCanvas(W, H), g = c.getContext('2d');
      g.imageSmoothingQuality = 'high'; g.drawImage(bmp, 0, 0, W, H);
      const out = new Uint8Array(await (await c.convertToBlob({ type: 'image/webp', quality: 0.8 })).arrayBuffer());
      let s = ''; for (let i = 0; i < out.length; i += 0x8000) s += String.fromCharCode.apply(null, out.subarray(i, i + 0x8000));
      return btoa(s);
    }, [buf.toString('base64'), IMG_W]).catch((e) => { console.log(`${k.id} : ${e.message}`); return null; });
    if (!b64) continue;
    writeFileSync(join(dir, k.id + '.webp'), Buffer.from(b64, 'base64'));
    src[k.id] = k.u; done++;
  }
  await browser.close();
  writeFileSync(stamp, JSON.stringify(src, null, 0));
  return done;
}

if (typeof process !== 'undefined' && process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const file = process.argv[2] || 'data/cp-cartes.json', dir = process.argv[3] || 'data/cp-img';
  (async () => {
    const old = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
    const { raw, tcg } = await fetchAll();
    const r = build(raw, tcg);
    if (r.cards.length < 300) throw new Error(`seulement ${r.cards.length} cartes : pas écrit`);
    const n = await images(r.cards, dir);
    if (n) console.log(`Visuels Cyberpunk : ${n} ajoutés ou changés`);
    for (const k of r.cards) delete k.sig; // (adresse signée de 5 min : inutile ensuite)
    if (old && JSON.stringify({ ...old, m: '' }) === JSON.stringify({ ...r, m: '' })) { console.log(`Cartes Cyberpunk : ${r.cards.length}, inchangées`); return; }
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(r));
    console.log(`Cartes Cyberpunk : ${r.cards.length} cartes, ${r.sets.length} séries → ${file}`);
  })().catch((e) => { console.log(`::warning title=Cartes Cyberpunk::${String(e && e.message || e).slice(0, 300)}`); process.exitCode = 0; });
}
