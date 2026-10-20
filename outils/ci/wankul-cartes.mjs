// Cartes Wankul (v3.48) : liste complète, en français, préparée depuis le Wankuldex officiel (wankul.fr › apps/wankul/api/wankuldex :
// noms, raretés, effigies, force, coût, textes, citations, illustrateurs, visuels). L'API n'autorise pas les pages web à la lire
// (pas de CORS) et ses images refusent d'être affichées depuis un autre site (« Hotlinking not allowed », même par le relais
// images.weserv.nl) : ce petit outil garde l'essentiel dans data/wk-cartes.json et une petite copie de chaque visuel dans
// data/wk-img/<id>.webp (300 px de large, ~20 Ko), que js/games/wankul.js lit. Relancé chaque lundi par le robot de l'index
// (.github/workflows/index.yml) pour les nouvelles saisons ; seuls les visuels nouveaux ou changés sont retéléchargés.
// Usage : node outils/ci/wankul-cartes.mjs [fichier de sortie] [dossier des visuels]
//   (visuels convertis en webp par Chromium (Playwright, installé par le robot) ; sans Playwright : liste seulement)
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const API = 'https://wankul.fr/apps/wankul/api/wankuldex';
const MEDIA = 'https://wankul.fr/apps/wankul/api/media/';
const UA = { 'User-Agent': 'CollecDex (github.com/Azran28/collecdex)' };
const IMG_W = 300;

// saisons : slug de l'API → [id de la série, n° de saison]
const SEASON = { origins: ['or', 1], campus: ['ca', 2], battle: ['ba', 3], stellar: ['st', 4], legacy: ['le', 5] };
// hors-série : rareté (sigle de l'API) → série à part
const HS_SET = (acr) => (acr === 'T-OR' ? 'to' : acr === 'E-G' ? 'eg' : /^PGW-/.test(acr) ? 'pgw' : /^SP-/.test(acr) ? 'sp' : 'ed');
const HS_NAMES = { to: 'Gagnants du Ticket d’or', eg: 'Éditions Gold', pgw: 'Paris Games Week', sp: 'Starter Packs', ed: 'Éditions spéciales' };
// rareté (sigle de l'API) → clé courte
const RAR = { T: 't', C: 'c', UC: 'uc', R: 'r', UR1: 'ur1', UR2: 'ur2', 'L-B': 'lb', 'L-A': 'la', 'L-O': 'lo', DUO: 'duo', 'T-OR': 'tor', 'E-G': 'eg', 'E-D': 'ed', 'NOEL-23': 'ed', 'G-P': 'ed' };
const rarOf = (acr) => RAR[acr] || (/^PGW-/.test(acr) ? 'pgw' : /^SP-/.test(acr) ? 'sp' : 'ed');
const EFF = { terrain: 't', laink: 'l', terracid: 'tc', guest: 'g', random: 'ra', duo: 'd', 'gagnant-ticket-or': 'to' };

const slug = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/α/g, 'alpha').replace(/[^a-z0-9]+/g, '');
const clean = (t) => String(t || '').replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();
// « CHEF KEBAB - Starter Pack Showtime », « PIRATE - PGW 2023 », « HAOC - Gagnant TIcket Or Campus » → nom + édition
// noms écrits en capitales dans l'API (« CHEF KEBAB », « DÉNUÉ D'ÉCLAT ») → « Chef kebab », « Dénué d'éclat » (comme sur la carte, à la casse près)
const nice = (n) => (n !== n.toUpperCase() ? n : n.toLowerCase().replace(/(^|[&/(]\s*|\.\s+)(\p{L})/gu, (m, a, b) => a + b.toUpperCase()));
const splitName = (n) => { const m = String(n).match(/^(.*?)\s+[-–]\s+(.+)$/); return m ? [m[1].trim(), m[2].trim()] : [String(n).trim(), '']; };

/** Carte de l'API (liste + détail) → { id, s, l, … } ; null si inconnue */
export function cardOf(c, d = {}) {
  const set = c.set && c.set.slug, acr = (c.rarity && c.rarity.acronym) || '';
  let s, l = String(c.number || '').trim(), id;
  if (SEASON[set]) { s = SEASON[set][0]; l = l.replace(/^0+(?=\d)/, '').toUpperCase(); id = `${s}-${slug(l)}`; }
  else if (set === 'hors-serie') {
    s = HS_SET(acr);
    const sub = s === 'pgw' ? acr.slice(4) : s === 'sp' ? slug(acr.slice(3)) : s === 'ed' && acr !== 'E-D' ? slug(acr) : '';
    l = l.replace(/^0+(?=\d)/, '');
    id = `${s}-${sub ? sub + '-' : ''}${slug(l)}`;
  } else return null;
  const [n, pe] = splitName(c.name);
  const holo = !!(c.imageUR || c.imageLeg || c.holoMasks) || /^(UR|L-|E-G)/.test(acr);
  const k = {
    id, s, l, n: nice(n), r: rarOf(acr), ra: acr, e: EFF[c.effigy && c.effigy.slug] || '', pe,
    f: d.force != null && d.force !== '' ? +d.force : null, co: d.cost != null && d.cost !== '' ? +d.cost : null,
    x: clean(d.rules), cb: clean(d.combo), q: clean(d.quote),
    w: clean(d.effectWin), lo: clean(d.effectLose), sp: clean(d.effectSpecial),
    a: (c.artist && c.artist.name) || '', h: holo ? 1 : 0, u: String(c.imageUrl || '').replace(/^\/apps\/wankul\/api\/media\//, ''), wid: c.id,
  };
  if (pe && s !== 'pgw' && s !== 'sp' && s !== 'to' && s !== 'eg') k.pe = pe;
  if (/^PGW-/.test(acr)) k.pe = `PGW 20${acr.slice(4)}`;
  if (s === 'to') k.pe = pe.replace(/Gagnant\s+ticket\s+or/i, 'Ticket d’or').trim() || `Ticket d’or saison ${l[0]}`;
  for (const key of Object.keys(k)) if (k[key] === '' || k[key] === null || k[key] === 0 || Number.isNaN(k[key])) delete k[key];
  return k;
}

/** list = cartes de la liste ; details = { id API: détail } → { m, sets, cards } */
export function build(list, details) {
  const cards = [], seen = new Set();
  for (const c of list) {
    const k = cardOf(c, details[c.id] || {});
    if (!k) continue;
    if (seen.has(k.id)) { k.id += 'b'; if (seen.has(k.id)) continue; }
    seen.add(k.id); cards.push(k);
  }
  const sets = [];
  for (const [slugName, [id, num]] of Object.entries(SEASON)) {
    const any = list.find((c) => c.set && c.set.slug === slugName);
    if (!any) continue;
    sets.push({ id, name: any.set.name, num, type: 'main', color: any.set.themeColor || '', n: cards.filter((k) => k.s === id).length });
  }
  for (const id of ['to', 'eg', 'pgw', 'sp', 'ed']) { const n = cards.filter((k) => k.s === id).length; if (n) sets.push({ id, name: HS_NAMES[id], type: 'hs', n }); }
  return { m: new Date().toISOString().slice(0, 10), sets, cards };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getJSON(url) {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url, { headers: UA });
      if (r.ok) return await r.json();
      if (r.status === 429) { await sleep(5000 * (i + 1)); if (i < 6) continue; }
      throw new Error(`HTTP ${r.status} ${url}`);
    } catch (e) { if (i >= 3) throw e; await sleep(2000 * (i + 1)); }
  }
}
/** Liste + détails (ceux déjà connus et inchangés sont repris de old : moins d'appels) */
export async function fetchAll(old) {
  const list = [];
  for (let p = 1; p < 50; p++) {
    const r = await getJSON(`${API}/cards?page=${p}&limit=100&sort=default&dir=asc`);
    list.push(...(r.data || []));
    if (!r.meta || p >= r.meta.totalPages) break;
  }
  const known = new Map(((old && old.cards) || []).map((k) => [k.wid, k]));
  const details = {};
  for (const c of list) {
    const k = known.get(c.id);
    if (k && k.u === String(c.imageUrl || '').replace(/^\/apps\/wankul\/api\/media\//, '') && process.env.WK_REFRESH !== '1') {
      details[c.id] = { force: k.f, cost: k.co, rules: k.x, combo: k.cb, quote: k.q, effectWin: k.w, effectLose: k.lo, effectSpecial: k.sp };
      continue;
    }
    details[c.id] = (await getJSON(`${API}/cards/${c.id}`)).data || {};
    await sleep(150);
  }
  return { list, details };
}

/** Visuel d'origine (le serveur ne le donne qu'à une demande « du même site » : redirection vers une adresse signée de 90 s) */
async function original(u) {
  for (let i = 0; i < 3; i++) {
    const r = await fetch(MEDIA + u, { headers: { ...UA, 'Sec-Fetch-Site': 'same-origin' } }).catch(() => null);
    if (r && r.ok) return Buffer.from(await r.arrayBuffer());
    await sleep(2000 * (i + 1));
  }
  return null;
}
/** Visuels manquants → dir/<id>.webp (300 px de large), par Chromium (Playwright) */
export async function images(cards, dir) {
  mkdirSync(dir, { recursive: true });
  const stamp = join(dir, 'sources.json'), src = existsSync(stamp) ? JSON.parse(readFileSync(stamp, 'utf8')) : {};
  const todo = cards.filter((k) => k.u && (src[k.id] !== k.u || !existsSync(join(dir, k.id + '.webp'))));
  if (!todo.length) return 0;
  let chromium;
  try { ({ chromium } = await import('playwright')); } catch (e) { console.log(`::warning title=Visuels Wankul::Playwright absent, ${todo.length} visuels non convertis`); return 0; }
  const browser = await chromium.launch(), page = await browser.newPage();
  let done = 0;
  for (const k of todo) {
    const buf = await original(k.u);
    if (!buf) { console.log(`visuel introuvable : ${k.id}`); continue; }
    const b64 = await page.evaluate(async ([data, type, W]) => {
      const bin = Uint8Array.from(atob(data), (ch) => ch.charCodeAt(0));
      const bmp = await createImageBitmap(new Blob([bin], { type }));
      const H = Math.round(bmp.height * W / bmp.width), c = new OffscreenCanvas(W, H), g = c.getContext('2d');
      g.imageSmoothingQuality = 'high'; g.drawImage(bmp, 0, 0, W, H);
      const out = new Uint8Array(await (await c.convertToBlob({ type: 'image/webp', quality: 0.8 })).arrayBuffer());
      let s = ''; for (let i = 0; i < out.length; i += 0x8000) s += String.fromCharCode.apply(null, out.subarray(i, i + 0x8000));
      return btoa(s);
    }, [buf.toString('base64'), /\.png$/i.test(k.u) ? 'image/png' : 'image/jpeg', IMG_W]).catch((e) => { console.log(`${k.id} : ${e.message}`); return null; });
    if (!b64) continue;
    writeFileSync(join(dir, k.id + '.webp'), Buffer.from(b64, 'base64'));
    src[k.id] = k.u; done++;
    await sleep(100);
  }
  await browser.close();
  writeFileSync(stamp, JSON.stringify(src, null, 0));
  return done;
}

if (typeof process !== 'undefined' && process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const file = process.argv[2] || 'data/wk-cartes.json', dir = process.argv[3] || 'data/wk-img';
  (async () => {
    const old = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
    const { list, details } = await fetchAll(old);
    const r = build(list, details);
    if (r.cards.length < 900) throw new Error(`seulement ${r.cards.length} cartes : pas écrit`);
    const n = await images(r.cards, dir);
    if (n) console.log(`Visuels Wankul : ${n} ajoutés ou changés`);
    if (old && JSON.stringify({ ...old, m: '' }) === JSON.stringify({ ...r, m: '' })) { console.log(`Cartes Wankul : ${r.cards.length}, inchangées`); return; }
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(r));
    console.log(`Cartes Wankul : ${r.cards.length} cartes, ${r.sets.length} séries → ${file}`);
  })().catch((e) => { console.log(`::warning title=Cartes Wankul::${String(e && e.message || e).slice(0, 300)}`); process.exitCode = 0; });
}
