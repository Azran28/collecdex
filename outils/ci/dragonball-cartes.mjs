// Cartes Dragon Ball Super Card Game (v3.68) : liste complète en français, préparée depuis le site officiel de Bandai
// (www.dbs-cardgame.com/europe-fr/cartes/ : une page par série, noms, raretés, types, couleurs, textes EN FRANÇAIS, visuels français
// …/europe-fr/images/cartes/cardimg/BT22-083.png), complétée par TCGplayer (tcgcsv.com, catégorie 27 « Dragon Ball Super CCG ») :
// noms anglais, dates des séries, n° de produit (prix), normale et / ou brillante, sachet de booster (visuel de la série).
// Le site officiel n'autorise pas les pages web à le lire (pas de CORS) et pèse ~30 Mo (76 pages) : ce petit outil en garde
// l'essentiel dans data/db-cartes.json (dans le dépôt), que js/games/dragonball.js lit. Relancé chaque lundi par le robot de l'index
// (.github/workflows/index.yml) pour les nouvelles séries.
// Une carte de CollecDex = un numéro imprimé : « BT22-083 » ; ses versions à part (« BT22-009_SPR » Special Rare, « _GDR », « _PR »
// promo…) sont des cartes à part (comme les Full Art de Final Fantasy). Leaders : une seule carte (recto = leader, verso = éveil).
// Usage : node outils/ci/dragonball-cartes.mjs [fichier de sortie] (variable DB_CACHE = dossier où garder les pages, pour les essais)
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const SITE = 'https://www.dbs-cardgame.com/europe-fr/cartes/';
const TCG = 'https://tcgcsv.com/tcgplayer/27';
const UA = { 'User-Agent': 'CollecDex (github.com/Azran28/collecdex)' };

const TYPE = { LEADER: 'le', COMBAT: 'ba', EXTRA: 'ex', UNISSON: 'un' };
const COLOR = { rouge: 'r', bleu: 'b', vert: 'v', jaune: 'j', noir: 'n', blanc: 'w' };
const BALL = { red: 'R', blue: 'B', green: 'V', yellow: 'J', black: 'N', white: 'W' };

const ent = (s) => String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, ' ');
const clean = (s) => ent(String(s || '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
/** Texte d'une capacité : pictogrammes → [Auto], [Permanent]… ; boules d'énergie → (J) ; lignes gardées */
function skill(html) {
  return ent(String(html || '')
    .replace(/<img[^>]*src="[^"]*\/([a-z]+)_ball\.png"[^>]*>/gi, (m, c) => `(${BALL[c.toLowerCase()] || '•'})`)
    .replace(/<img[^>]*alt="([^"]+)"[^>]*>/gi, '[$1]')
    .replace(/<img[^>]*>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''))
    .split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join('\n');
}
const field = (h, col) => { const m = h.match(new RegExp(`<dl class="${col}[^"]*">\\s*<dt>[\\s\\S]*?</dt>\\s*<dd>([\\s\\S]*?)</dd>`)); return m ? m[1] : ''; };
const titleCase = (s) => (s === s.toUpperCase() ? s.toLowerCase().replace(/(^|[\s(-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()).replace(/\b(Of|The|And|De|Du|Des|La|Le|Les)\b/g, (w, x, i) => (i ? w.toLowerCase() : w)) : s);
/** « Z05 Booster -CRITICAL BLOW- » → « Critical Blow » ; « Série 1 DECK DE DÉMARRAGE ~THE AWAKENING～ » → « Deck de démarrage The Awakening » */
function setName(cat) {
  const c = ent(cat).trim();
  const m = c.match(/[-~～－](.+?)[-~～－]\s*(\[[^\]]*\])?\s*$/);
  const core = m ? titleCase(m[1].trim()) : c;
  if (/DECK DE D[ÉE]MARRAGE/i.test(c)) return `Deck de démarrage ${core}`;
  if (/DECK EXPERT/i.test(c)) return `Deck expert ${core}`;
  if (/^Booster à thème/i.test(c)) return core;
  if (/EXPANSION SET/i.test(c) && m) return `Expansion Set ${core}`;
  return core;
}

/** Une page de série → fiches { no, n, img, series, r, t, z, c, p, co, cp, ce, ch, tr, er, x, back } */
function parsePage(html) {
  const out = [];
  for (const li of html.split(/<li>\s*(?=<dl class="cardListCol)/).slice(1)) {
    const parts = li.split('<div class="cardBack">');
    const one = (h) => {
      const no = clean((h.match(/class="cardNumber">([^<]*)</) || [])[1]);
      if (!no) return null;
      const cls = (h.match(/<dl class="cardListCol ([^"]*)"/) || [])[1] || '';
      const typeTxt = clean(field(h, 'typeCol'));
      const tm = typeTxt.match(/^(LEADER|COMBAT|EXTRA|UNISSON)\s*(Z)?/i) || cls.match(/csrdType(LEADER|COMBAT|EXTRA|UNISSON)\s*(Z)?/);
      const colors = clean(field(h, 'colorCol')).split(/[\/・]/).map((x) => COLOR[x.trim().toLowerCase()]).filter(Boolean);
      const cost = clean(field(h, 'energyCol')).match(/^(\d+|X)/);
      const num = (s) => { const v = clean(s).replace(/[^\d]/g, ''); return v ? +v : null; };
      return {
        no, n: clean((h.match(/class="cardName">([\s\S]*?)<\/dd>/) || [])[1]),
        img: ((h.match(/cardimg\/([^"]+)\.png/) || [])[1]) || '',
        series: clean(field(h, 'seriesCol')), r: ((clean(field(h, 'rarityCol')).match(/\[([^\]］]+)[\]］]/) || [])[1] || '').toLowerCase().replace(/^fr$/, 'r'),
        t: tm ? TYPE[tm[1].toUpperCase()] : '', z: tm && tm[2] ? 1 : 0, c: colors,
        p: num(field(h, 'powerCol')), co: cost ? (cost[1] === 'X' ? 'X' : +cost[1]) : null,
        ce: num(field(h, 'comboEnergyCol')), cp: num(field(h, 'comboPowerCol')),
        ch: clean(field(h, 'characterCol')).replace(/^-$/, ''), tr: clean(field(h, 'specialTraitCol')).replace(/^-$/, ''), er: clean(field(h, 'eraCol')).replace(/^-$/, ''),
        x: skill(field(h, 'skillCol')).replace(/^-$/, ''),
      };
    };
    const f = one(parts[0]); if (!f) continue;
    if (parts[1]) { const b = one(parts[1]); if (b) f.back = b; }
    out.push(f);
  }
  return out;
}

// noms de séries mal écrits sur le site (ou page qui mêle plusieurs séries)
const NAMES = {
  BT19: "Fighter's Ambition", BT25: 'Legend of the Dragon Balls', TB3: 'Clash of Fates', EB1: 'Battle Evolution Booster', DB1: 'Dragon Brawl', DB2: 'Divine Multiverse', DB3: 'Giant Force',
  SD5: 'Deck de démarrage The Crimson Saiyan', SD6: 'Deck de démarrage Resurrected Fusion', SD7: "Deck de démarrage Shenron's Advent", P: 'Cartes promotionnelles',
};
const prefixOf =(no) => (no.match(/^([A-Z]+\d*)-/) || [])[1] || '';
const KIND = (p) => (/^(BT|TB|EB|DB)\d/.test(p) ? 'main' : p === 'P' ? 'promo' : 'deck');

/** pages = [{ cat, name, html }] ; tcg = { groups, products: { groupId: [...] }, prices: { groupId: [...] } } → { m, sets, cards } */
export function build(pages, tcg) {
  // 1. fiches de toutes les pages (une carte peut être sur deux pages : promo, coffret) → une par numéro
  const byNo = new Map(), pageOf = new Map();
  for (const pg of pages) {
    const list = parsePage(pg.html);
    const counts = {}; for (const f of list) { const p = prefixOf(f.no); counts[p] = (counts[p] || 0) + 1; }
    const main = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    for (const f of list) {
      if (!byNo.has(f.no)) byNo.set(f.no, f);
      const p = prefixOf(f.no);
      if (p === main && !pageOf.has(p)) pageOf.set(p, pg.name); // (nom de la série = celui de la page où ses cartes sont les plus nombreuses)
    }
  }
  // 2. TCGplayer : produits par numéro (« BT22-009 ») avec leur genre (« (SPR) », « (GDR) », promo…), dates des séries
  const groups = (tcg && tcg.groups) || [];
  const promoGroup = (g) => /promotion|pre-?release|release event|judge/i.test(g.name) || g.isSupplemental;
  const tcgOf = new Map(), dateOf = new Map(), packOf = new Map();
  for (const g of groups) {
    const d = String(g.publishedOn || '').slice(0, 10), prs = {};
    for (const r of (tcg.prices && tcg.prices[g.groupId]) || []) (prs[r.productId] = prs[r.productId] || new Set()).add(/foil/i.test(r.subTypeName || '') ? 'h' : 'n');
    for (const p of (tcg.products[g.groupId] || [])) {
      const e = Object.fromEntries((p.extendedData || []).map((x) => [x.name, x.value]));
      const no = String(e.Number || '').trim().toUpperCase();
      if (!no) { if (/booster pack$/i.test(p.name) && !promoGroup(g) && !packOf.has(g.groupId)) packOf.set(g.groupId, p.productId); continue; }
      const pre = prefixOf(no);
      if (pre && d && !promoGroup(g) && (!dateOf.has(pre) || d < dateOf.get(pre))) dateOf.set(pre, d);
      const tag = ((p.name.match(/\(([^)]*)\)\s*$/) || [])[1] || '').toUpperCase();
      const kind = /\bSPR\b|SPECIAL RARE/.test(tag) || /^Special Rare/.test(e.Rarity || '') ? 'SPR' : /GDR|GOD RARE/.test(tag) || /^God/.test(e.Rarity || '') ? 'GDR'
        : promoGroup(g) || /PROMO|PRE-?RELEASE|ALTERNATE|ALT ART|PR$/.test(tag) ? 'PR' : '';
      const key = `${no}|${kind}`;
      const en = p.name.replace(/\s*\([^)]*\)\s*$/, '').split(' // ').pop().trim();
      if (!tcgOf.has(key)) tcgOf.set(key, { id: p.productId, en, vf: prs[p.productId], g: g.groupId });
      if (!tcgOf.has(`${no}|*`)) tcgOf.set(`${no}|*`, { id: 0, en, vf: null });
    }
  }
  // 3. cartes
  const cards = [];
  for (const f of byNo.values()) {
    const s = prefixOf(f.no); if (!s) continue;
    const [base, suf = ''] = f.no.split('_');
    const SUF = suf.replace(/\d+$/, '').replace(/^PR$/, 'PR'), sufKind = /^SPR/.test(SUF) ? 'SPR' : /^GDR/.test(SUF) ? 'GDR' : SUF ? 'PR' : '';
    const t = tcgOf.get(`${base}|${sufKind}`) || (sufKind === 'PR' && /\d$/.test(suf) ? null : null);
    const any = tcgOf.get(`${base}|*`);
    const k = {
      id: f.no.toLowerCase(), s, l: f.no.slice(s.length + 1).replace(/_/g, ' '), n: f.n, ne: any && any.en && any.en !== f.n ? any.en : '',
      t: f.t, z: f.z, c: f.c, p: f.p, co: f.co, ce: f.ce, cp: f.cp, ch: f.ch, tr: f.tr, er: f.er, x: f.x, r: f.r,
      img: f.img && f.img !== f.no ? f.img : '', bk: f.back ? 1 : 0,
      bn: f.back && f.back.n !== f.n ? f.back.n : '', bp: f.back ? f.back.p : null, bx: f.back ? f.back.x : '',
      b: suf ? base.toLowerCase() : '', tp: t ? t.id : 0, vf: t && t.vf ? [...t.vf].sort().join('') : '',
    };
    cards.push(k);
  }
  // versions (SPR, PR…) : même texte que la carte d'origine → pas recopié ; carte d'origine absente → plus de lien
  const ids = new Map(cards.map((k) => [k.id, k]));
  for (const k of cards) {
    const o = k.b && ids.get(k.b);
    if (!o) { k.b = ''; continue; }
    if (k.x === o.x) k.x = '';
    if (k.bx === o.bx) k.bx = '';
    if (!k.ne && o.ne) k.ne = o.ne;
  }
  cards.sort((a, b) => a.s.localeCompare(b.s, 'en', { numeric: true }) || a.id.localeCompare(b.id, 'en', { numeric: true }));
  // 4. séries
  const sets = [];
  for (const s of [...new Set(cards.map((k) => k.s))]) {
    const list = cards.filter((k) => k.s === s);
    // groupe TCGplayer de la série : « DBS-B01 » = BT1, « BT22 », « DBS-TB01 » = TB1, « EB-01 » = EB1, « DBS-BE04 » / « DBS-EB09 » = EX04 / EX09
    const ab = (x) => String(x.abbreviation || '').toUpperCase().replace(/^DBS-/, '').replace(/-/g, '');
    const pad = (x) => x.replace(/(\D)(\d)$/, '$10$2');
    const keys = /^EX\d+$/.test(s) ? [s.replace(/^EX/, 'BE'), s.replace(/^EX/, 'EB')] : [s, pad(s), pad(s.replace(/^BT/, 'B'))];
    const g = keys.map((key) => groups.find((x) => !promoGroup(x) && ab(x) === key && !(/^EX/.test(s) && /Battle Evolution/i.test(x.name)))).find(Boolean);
    let name = NAMES[s] || '';
    if (!name && /^(BT|SD|XD|TB)\d/.test(s) && pageOf.get(s)) name = setName(pageOf.get(s));
    if (!name && g) name = g.name.replace(/^Expansion Deck Box Set \d+:\s*/i, '').replace(/^Draft Box \d+ - /i, '');
    if (!name) {
      // coffrets mêlés sur une page : nom tiré de la série écrite sur ses cartes
      const c = {}; for (const f of byNo.values()) if (prefixOf(f.no) === s && f.series) c[f.series] = (c[f.series] || 0) + 1;
      const best = Object.keys(c).sort((a, b) => c[b] - c[a])[0];
      name = best ? titleCase(best.replace(/[【\[][^\]】]*[\]】]/g, '').trim()) : s;
    }
    const max = KIND(s) === 'main' ? Math.max(0, ...list.filter((k) => !k.b && /^\d+$/.test(k.l)).map((k) => +k.l)) : 0;
    const pk = g ? packOf.get(g.groupId) || 0 : 0;
    const date = (g ? String(g.publishedOn || '').slice(0, 10) : '') || dateOf.get(s) || (s === 'P' ? '2017-07-28' : '');
    sets.push({ id: s, name, en: g ? g.name : '', type: KIND(s), date, n: list.length, max, ...(pk ? { pk } : {}) });
  }
  // 5. format compact ; les textes (lourds : 2,6 Mo) à part, dans data/db-textes.json, lus seulement par la fiche d'une carte et les combats
  const texts = {};
  const out = cards.map((k) => {
    const { x, bx, ...o } = k;
    if (x || bx) texts[k.id] = bx ? [x || '', bx] : x;
    for (const key of Object.keys(o)) if (o[key] === '' || o[key] === null || o[key] === undefined || o[key] === 0 || (Array.isArray(o[key]) && !o[key].length)) delete o[key];
    return o;
  });
  return { m: new Date().toISOString().slice(0, 10), sets, cards: out, texts };
}

async function get(url, json = true) {
  for (let i = 0; ; i++) {
    try { const r = await fetch(url, { headers: UA }); if (r.ok) return json ? await r.json() : await r.text(); throw new Error(`HTTP ${r.status} ${url}`); }
    catch (e) { if (i >= 4) throw e; await new Promise((res) => setTimeout(res, 3000 * (i + 1))); }
  }
}
export async function fetchAll(cache = '') {
  const cached = (name, fn) => async () => {
    const f = cache && join(cache, name);
    if (f && existsSync(f)) return JSON.parse(readFileSync(f, 'utf8'));
    const v = await fn(); if (f) { mkdirSync(cache, { recursive: true }); writeFileSync(f, JSON.stringify(v)); }
    return v;
  };
  const pages = await cached('pages.json', async () => {
    const top = await get(SITE, false), out = [];
    for (const m of top.matchAll(/<option value="(46\d{4})"\s*>([^<]+)</g)) out.push({ cat: m[1], name: ent(m[2]).trim(), html: await get(`${SITE}?search=true&category=${m[1]}`, false) });
    return out;
  })();
  const tcg = await cached('tcg.json', async () => {
    const groups = (await get(`${TCG}/groups`)).results || [], products = {}, prices = {};
    for (const g of groups) {
      products[g.groupId] = (await get(`${TCG}/${g.groupId}/products`)).results || [];
      prices[g.groupId] = ((await get(`${TCG}/${g.groupId}/prices`)).results || []).map((r) => ({ productId: r.productId, subTypeName: r.subTypeName }));
    }
    return { groups, products, prices };
  })();
  return { pages, tcg };
}

if (typeof process !== 'undefined' && process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const file = process.argv[2] || 'data/db-cartes.json';
  (async () => {
    const { pages, tcg } = await fetchAll(process.env.DB_CACHE || '');
    const r = build(pages, tcg);
    if (r.cards.length < 3000) throw new Error(`seulement ${r.cards.length} cartes : pas écrit`);
    const { texts, ...main } = r, tfile = file.replace(/cartes\.json$/, 'textes.json');
    const old = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
    const same = old && JSON.stringify({ ...old, m: '' }) === JSON.stringify({ ...main, m: '' }) && existsSync(tfile) && readFileSync(tfile, 'utf8') === JSON.stringify(texts);
    if (same) { console.log(`Cartes Dragon Ball : ${r.cards.length}, inchangées`); return; }
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(main));
    writeFileSync(tfile, JSON.stringify(texts));
    console.log(`Cartes Dragon Ball : ${r.cards.length} cartes, ${r.sets.length} séries → ${file}`);
  })().catch((e) => { console.log(`::warning title=Cartes Dragon Ball::${String(e && e.message || e).slice(0, 300)}`); process.exitCode = 0; });
}
