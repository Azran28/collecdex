/*
 * Adaptateur Wankul (v3.48, 7ᵉ licence, Wankil Studio : Laink et Terracid).
 * Cartes : data/wk-cartes.json, préparé depuis le Wankuldex officiel (wankul.fr › apps/wankul/api/wankuldex : noms, raretés,
 * effigies, force, coût, textes, citations, illustrateurs, EN FRANÇAIS) par outils/ci/wankul-cartes.mjs, remis à jour chaque
 * lundi par le robot de l'index.
 * Visuels : le site officiel refuse d'afficher ses images ailleurs (« Hotlinking not allowed », relais compris) → une petite
 * copie de chaque visuel (300 px, webp) est rangée dans le site, data/wk-img/<id>.webp, par le même outil.
 * Prix : aucune cote connue (ni Cardmarket ni TCGplayer ne vendent les cartes Wankul) → pas de prix.
 * Identifiant d'une carte = série + numéro imprimé : « st-55 » (Stellar · Laink · C#55), « le-179a » (Legacy, DUO 179A),
 * hors-série : « to-4f » (Gagnant du Ticket d'or #F de la saison 4), « eg-131 » (Édition Gold), « pgw-23-1 », « sp-st-s181 »,
 * « ed-67 ». Séries : or (Origins, saison 1), ca (Campus), ba (Battle), st (Stellar), le (Legacy), puis to, eg, pgw, sp, ed.
 */
(() => {
  const DAY = 24 * 3600 * 1000;
  const { norm } = App.util;

  // ---------- Données (fichier du site, gardé en cache : utilisable hors ligne ; relu à chaque nouvelle version du site) ----------
  let indexP = null;
  const index = () => indexP || (indexP = (async () => {
    const hit = await App.db.get('cache', 'wk1:index').catch(() => null);
    if (hit && hit.ver === window.APP_VERSION && Date.now() - hit.t < 3 * DAY) return hit.v;
    try {
      const r = await fetch('data/wk-cartes.json', { cache: 'no-cache' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const v = await r.json();
      await App.db.set('cache', 'wk1:index', { t: Date.now(), ver: window.APP_VERSION, v }).catch(() => {});
      return v;
    } catch (e) {
      if (hit) { console.warn('Réseau indisponible, données en cache utilisées', e); return hit.v; }
      indexP = null;
      throw e;
    }
  })());

  // ---------- Raretés (imprimées avant le numéro : « C#55 », « UC#109 », « L-ARGENT #178 ») ----------
  // clé → [rang, nom FR, sigle, couleur]
  const RAR = {
    t:   [1, 'Terrain',            'T',     '#8fa3b8'],
    c:   [1, 'Commune',            'C',     '#a9b0ba'],
    uc:  [2, 'Peu commune',        'UC',    '#5fb86a'],
    r:   [3, 'Rare',               'R',     '#5aa0e0'],
    ur1: [5, 'Ultra rare holo 1',  'UR1',   '#9b6ef0'],
    ur2: [6, 'Ultra rare holo 2',  'UR2',   '#c45ce0'],
    duo: [6, 'Duo',                'DUO',   '#e0679b'],
    // (tiret insécable : sinon « L-B » se coupe en deux lignes dans les petites pastilles du téléphone)
    lb:  [7, 'Légendaire Bronze',  'L‑B',   '#c27a45'],
    la:  [8, 'Légendaire Argent',  'L‑A',   '#aab4c2'],
    lo:  [9, 'Légendaire Or',      'L‑O',   '#e8b923'],
    tor: [9, 'Gagnant Ticket d’or', 'T‑OR', 'url(#rbw)'],
    eg:  [7, 'Édition Gold',       'GOLD',  '#d6a824'],
    pgw: [4, 'Paris Games Week',   'PGW',   '#3a8fd8'],
    sp:  [4, 'Starter Pack',       'SP',    '#7c8aa8'],
    ed:  [7, 'Édition spéciale',   'ÉD',    '#e07a3a'],
  };
  const rkey = (r) => (RAR[r] ? r : Object.keys(RAR).find((k) => norm(RAR[k][1]) === norm(r) || norm(RAR[k][2]) === norm(r)) || null);
  const pillBg = (c) => (c === 'url(#rbw)' ? 'linear-gradient(90deg,#ff6ec4,#7873f5,#4ade80,#facc15)' : c);
  const rarity = {
    key: (r) => rkey(r),
    rank: (r) => { const k = rkey(r); return k ? RAR[k][0] : 3; },
    label: (r) => { const k = rkey(r); return k ? RAR[k][1] : (r || 'Inconnue'); },
    symbol: (r) => {
      const k = rkey(r), esc = App.util.esc;
      const lab = esc(k ? RAR[k][1] : (r || '?'));
      return `<span class="rar" title="${lab}"><span class="rar-txt" style="background:${k ? pillBg(RAR[k][3]) : '#b9c0d4'}">${esc(k ? RAR[k][2] : String(r || '?').slice(0, 6))}</span></span>`;
    },
    css: (r) => { const k = rkey(r); return k ? pillBg(RAR[k][3]) : '#b9c0d4'; },
  };
  // une seule version par carte : les ultra rares, légendaires, Gold, starters… sont brillantes (cartes à part, autre numéro)
  const variantsOf = (k) => (k.h ? { holo: true } : { normal: true });

  // ---------- Séries ----------
  const GROUPS = { main: { id: 'wk-main', name: 'Saisons', order: 1 }, hs: { id: 'wk-hs', name: 'Hors-série', order: 2 } };
  const EFF = { l: 'Laink', tc: 'Terracid', g: 'Invité', ra: 'Random', d: 'Duo', t: 'Terrain', to: 'Gagnant du Ticket d’or' };
  const SEASON_WORD = { or: 'ORIGINS', ca: 'CAMPUS', ba: 'BATTLE', st: 'STELLAR', le: 'LEGACY' };
  const HS_ORDER = ['to', 'eg', 'pgw', 'sp', 'ed'];
  const HS_SHORT = { to: 'Ticket d’or', eg: 'Gold', pgw: 'PGW', sp: 'Starters', ed: 'Spéciales' };

  let memo = null;
  async function data() {
    const idx = await index();
    if (memo && memo.idx === idx) return memo;
    const byId = new Map(), bySet = new Map(), byNum = new Map();
    for (const k of idx.cards) {
      byId.set(k.id, k); if (!bySet.has(k.s)) bySet.set(k.s, []); bySet.get(k.s).push(k);
      byNum.set(`${k.s}|${String(k.l).toUpperCase()}`, k);
    }
    const sets = idx.sets.filter((s) => bySet.has(s.id)).map((s) => ({
      id: s.id, name: s.name, logo: '', symbol: '', releaseDate: '', num: s.num || 0, color: s.color || '',
      sortKey: s.type === 'main' ? `2023-${String(s.num).padStart(2, '0')}` : `2022-${HS_ORDER.indexOf(s.id) + 1}`,
      total: bySet.get(s.id).length, official: bySet.get(s.id).length, group: GROUPS[s.type] || GROUPS.main,
    }));
    memo = { idx, byId, bySet, byNum, sets };
    return memo;
  }
  async function listSets() {
    const { sets } = await data();
    return sets.map(({ num, color, ...s }) => s);
  }

  // ---------- Cartes ----------
  const numOf = (l) => parseInt(String(l).replace(/^S/i, ''), 10);
  const cmp = (a, b) => ((numOf(a.l) || 0) - (numOf(b.l) || 0)) || String(a.l).localeCompare(String(b.l), 'fr', { numeric: true });
  const setShape = (s) => ({ id: s.id, name: s.name, logo: '', symbol: '', releaseDate: s.releaseDate, sortKey: s.sortKey, cardCount: { total: s.total, official: s.official }, serie: s.group });
  const imageOf = (k) => `data/wk-img/${k.id}.webp`;
  /** Code imprimé en bas à droite : « STELLAR · LAINK · C#55 », terrain « STELLAR T#20 » */
  const printed = (k, s) => {
    const word = SEASON_WORD[k.s] || (s && s.name) || '';
    if (k.s === 'to') return `${SEASON_WORD[['', 'or', 'ca', 'ba', 'st', 'le'][+String(k.l)[0]]] || ''} · Gagnant Ticket d’or #${String(k.l).slice(1)}`.trim();
    const r = { lb: 'L-BRONZE ', la: 'L-ARGENT ', lo: 'L-OR ' }[k.r] || k.ra || '';
    return `${word}${k.e && k.e !== 't' && EFF[k.e] ? ' · ' + EFF[k.e].toUpperCase() : ''} · ${r}#${k.l}`;
  };
  function textOf(k) {
    if (k.r === 't' || k.w || k.lo) return [k.w ? `Le gagnant… ${k.w.replace(/^le gagnant\s*/i, '')}` : '', k.lo ? `Le perdant… ${k.lo.replace(/^le perdant\s*/i, '')}` : '', k.sp ? `Spécial : ${k.sp}` : ''].filter(Boolean).join('\n');
    return [k.x || '', k.cb ? `COMBO : ${k.cb}` : '', !k.x && k.sp ? k.sp : ''].filter(Boolean).join('\n');
  }
  function normCard(k, s) {
    const terrain = k.r === 't' || k.e === 't';
    const facts = [terrain ? 'Terrain' : 'Personnage', k.e && !terrain && EFF[k.e] ? `Effigie : ${EFF[k.e]}` : '', k.co != null ? `Coût ${k.co}` : '', k.f != null ? `Force ${k.f}` : '',
      k.pe ? k.pe : '', `Code ${printed(k, s)}`].filter(Boolean);
    return {
      id: k.id, localId: k.l, name: k.n, baseName: k.n, nameEn: '', code: printed(k, s), image: imageOf(k),
      rarity: k.r, variants: variantsOf(k), category: terrain ? 'Terrain' : 'Personnage', kind: terrain ? 't' : 'p', types: [], facts,
      text: [textOf(k), k.q ? `« ${k.q.replace(/^«\s*|\s*»$/g, '')} »` : ''].filter(Boolean).join('\n'), quote: k.q || '', illustrator: k.a || '',
      effigy: k.e || '', cost: k.co, power: k.f, edition: k.pe || '', wid: k.wid || 0,
      setId: s.id, serieId: s.group.id, alt: s.group.id === 'wk-hs',
    };
  }
  async function getSet(id) {
    id = String(id);
    const D = await data(), s = D.sets.find((x) => x.id === id);
    if (!s) throw new Error('Série inconnue : ' + id);
    const set = { ...setShape(s), ...s, cardCount: { total: s.total, official: s.official } };
    set.cards = [...D.bySet.get(id)].sort(cmp).map((k) => normCard(k, s));
    return set;
  }
  async function getCard(id) {
    id = String(id);
    const D = await data(), k = D.byId.get(id);
    if (!k) throw new Error('Carte inconnue : ' + id);
    const s = D.sets.find((x) => x.id === k.s) || { id: k.s, name: k.s, group: GROUPS.main, releaseDate: '', sortKey: '', total: 0, official: 0 };
    return { ...normCard(k, s), set: setShape(s), pricing: null };
  }
  // pas de cote connue pour Wankul
  const price = () => null;

  // ---------- Recherche ----------
  async function fromIds(ids) {
    const D = await data(), out = [];
    for (const id of ids) {
      const k = D.byId.get(id); if (!k) continue;
      const s = D.sets.find((x) => x.id === k.s); if (!s) continue;
      out.push({ ...normCard(k, s), set: setShape(s) });
    }
    return out;
  }
  /** La carte d'un numéro dans une série (« st », « 55 ») */
  async function byCode(setId, num) {
    const D = await data(), k = D.byNum.get(`${String(setId).toLowerCase()}|${String(num).toUpperCase().replace(/^0+(?=\d)/, '')}`);
    return k ? fromIds([k.id]) : [];
  }
  async function search({ name }) {
    const q = norm(name); if (!q) return [];
    const D = await data();
    const c = codesIn(name);
    if (c.length) { const best = c.sort((a, b) => b[1] - a[1]); const ids = [...new Set(best.map(([key]) => (D.byNum.get(key) || {}).id).filter(Boolean))]; if (ids.length) return fromIds(ids); }
    if (D.byId.has(String(name).trim().toLowerCase())) return fromIds([String(name).trim().toLowerCase()]);
    const ids = [];
    for (const k of D.idx.cards) if (norm(k.n).includes(q)) ids.push(k.id);
    // (même nom dans plusieurs séries : les plus récentes d'abord)
    const date = new Map(D.sets.map((s) => [s.id, s.sortKey]));
    ids.sort((a, b) => String(date.get(D.byId.get(b).s)).localeCompare(String(date.get(D.byId.get(a).s))));
    return fromIds(ids.slice(0, 300));
  }
  /** Séries dont le nom correspond (« Stellar », « Saison 4 », « S4 ») — import d'un fichier */
  async function setIdsByName(name) {
    const q = norm(name); if (!q) return [];
    const sets = (await data()).sets;
    const names = (s) => [s.id, s.name, s.num ? `saison ${s.num}` : '', s.num ? `s${s.num}` : '', s.num ? `wankul ${s.name}` : ''].map(norm);
    const exact = sets.filter((s) => names(s).includes(q));
    return (exact.length ? exact : sets.filter((s) => names(s).some((n) => n && n.length > 3 && (n.includes(q) || q.includes(n))))).map((s) => s.id);
  }
  async function versions(name) {
    const n = norm(name);
    return (await search({ name })).filter((c) => norm(c.name) === n);
  }
  /** Noms des cartes : nom normalisé → ids */
  let namesMemo = null;
  async function names() {
    const D = await data();
    if (namesMemo && namesMemo.D === D) return namesMemo.m;
    const m = new Map();
    for (const k of D.idx.cards) { const key = norm(k.n); if (key.length < 3) continue; if (!m.has(key)) m.set(key, new Set()); m.get(key).add(k.id); }
    namesMemo = { D, m };
    return m;
  }

  // visuel de chaque saison : son booster sur la boutique officielle (CDN Shopify, CORS accordé), zone du sachet mesurée sur l'image
  // à 300 px de large (Battle : pas de booster seul, l'éventail de 8 boosters) ; hors-série : son nom
  const SHOP = 'https://cdn.shopify.com/s/files/1/0683/2055/9412/files/';
  const PACKS = {
    or: ['b5copie_ef16162d-41e9-404e-b1f1-846370970bc6.png?v=1745828532', [300, 290, 32, 15, 285, 270]],
    ca: ['Blank800x800_-_copie_3403bb44-d7bd-4715-809b-39895a808878.png', [300, 347, 64, 24, 242, 322]],
    ba: ['8boostersbattle.png', [300, 232, 43, 39, 259, 188]],
    st: ['S4_one_booster_1.png?v=1764770000', [300, 488, 45, 64, 266, 433]],
    le: ['Untitled_design_8d517fc3-95ca-4b6b-a515-5b71a964a4bb.png?v=1779023673', [300, 208, 96, 9, 210, 199]],
  };

  // ---------- Images ----------
  const img = {
    // (adresse complète : la vérification par l'image lit les visuels depuis un worker, où une adresse relative ne mène nulle part)
    card: (c) => { const u = (c && c.image) || ''; return /^data\/wk-img\/[a-z0-9-]+\.webp$/.test(u) ? new URL(u, document.baseURI).href : u; },
    logo: (s) => { const p = s && PACKS[s.id]; return p ? `${SHOP}${p[0]}${p[0].includes('?') ? '&' : '?'}width=300` : ''; },
    logoCrop: (s) => { const p = s && PACKS[s.id] && PACKS[s.id][1]; return p ? { W: p[0], H: p[1], x0: p[2], y0: p[3], x1: p[4], y1: p[5] } : null; },
    symbol: () => '',
  };

  // ---------- Reconnaissance d'une photo ----------
  // le code est imprimé en bas à droite, après la saison et l'effigie : « STELLAR · LAINK · C#55 », « STELLAR · TERRACID · L-ARGENT #178 »,
  // « ORIGINS · LAINK · L#179 », Gagnant du Ticket d'or « STELLAR · GAGNANT TICKET D'OR #F » ; terrains (cartes couchées) « STELLAR T#20 »
  const ALT = { O: '0', D: '0', Q: '0', U: '0', I: '1', L: '1', '|': '1', T: '1', J: '1', S: '5', Z: '2', B: '8', G: '6' };
  const fix = (s) => [...s].map((ch) => (/\d/.test(ch) ? ch : ALT[ch] || '')).join('');
  const WORDS = Object.entries(SEASON_WORD);
  /** Saison écrite dans un texte (« STELLAR », « STELIAR » mal lu) → id de la série, sinon '' */
  function seasonIn(T) {
    for (const w of T.split(/[^A-Z0-9]+/)) { if (w.length < 5) continue; for (const [id, word] of WORDS) if (w === word || (w.length >= word.length - 1 && App.util.similarity(w, word) >= 0.8)) return id; }
    return '';
  }
  // rareté imprimée → clés possibles
  const RAR_PRINT = (t) => { t = String(t || '').replace(/[^A-Z0-9]/g, ''); return !t ? null : t === 'T' ? ['t'] : t === 'C' ? ['c'] : t === 'UC' || t === 'UG' || t === 'OC' ? ['uc'] : t === 'R' ? ['r'] : /^UR/.test(t) ? ['ur1', 'ur2'] : /^L/.test(t) ? ['lb', 'la', 'lo'] : /^DU/.test(t) ? ['duo'] : null; };
  /** Codes lus (« st|55 », « to|4F », avec un poids) ; rien sur un code Pokémon (« 025/165 ») ni d'une autre licence (pas de « # ») */
  function codesIn(text) {
    const out = [], T = String(text || '').toUpperCase().replace(/[‐-―]/g, '-');
    if (!/[#*£]/.test(T)) return out;
    const season = seasonIn(T);
    // Gagnant du Ticket d'or : « … TICKET D'OR #F »
    for (const m of T.matchAll(/TICK[EF]T\s*D\W?\s*OR\s*[#*£]\s*([A-F])\b/g)) {
      const n = season ? ['', 'or', 'ca', 'ba', 'st', 'le'].indexOf(season) : 0;
      if (n > 0) out.push([`to|${n}${m[1]}`, 1]);
    }
    for (const m of T.matchAll(/(?:^|[^A-Z0-9])((?:L\s*-\s*[A-Z]{1,8})|UR\s*[12I]?|UC|DUO|[TCRL])?\s*[#*£]\s*([0-9OILSZB|]{1,3})([AB])?(?![0-9])/g)) {
      const num = fix(m[2]).replace(/^0+(?=\d)/, '') + (m[3] || '');
      if (!/^\d{1,3}[AB]?$/.test(num) || +num.replace(/\D/g, '') < 1 || +num.replace(/\D/g, '') > 200) continue;
      const rars = RAR_PRINT(m[1]);
      const sets = season ? [season] : Object.keys(SEASON_WORD);
      for (const s of sets) {
        const k = memo && memo.byNum.get(`${s}|${num}`);
        if (memo && !k) continue;
        // (rareté lue qui ne correspond pas à la carte de ce numéro : sans doute un autre numéro mal lu)
        let w = (season ? 1 : 0.4) * (rars ? (k && !rars.includes(k.r) ? 0.4 : 1) : 0.75);
        if (season && rars && /^\d/.test(m[2])) w = Math.max(w, 1);
        out.push([`${s}|${num}`, w]);
      }
    }
    return out;
  }
  // zones de lecture (fractions de la carte debout) : le code en bas à droite, le nom au-dessus du texte (police épaisse)
  const OCR_BANDS = [[0.93, 0.975, 0.5, 0.97], [0.94, 0.985, 0.5, 0.97], [0.925, 0.965, 0.45, 0.97]];
  const NAME_BANDS = [[0.67, 0.77, 0.15, 0.85], [0.64, 0.73, 0.15, 0.85]];
  const ZONES = [[0.9, 1, 0.4, 1], [0.6, 0.82, 0.1, 0.9]];
  // terrain (carte couchée, photo tournée d'un quart de tour vers la droite) : code en bas à droite, nom au milieu
  const T_BANDS = [[0.9, 0.97, 0.6, 0.98], [0.91, 0.985, 0.6, 0.98], [0.48, 0.64, 0.15, 0.85]];
  const T_ZONES = [[0.86, 1, 0.5, 1], [0.44, 0.68, 0.1, 0.9]];
  const CODE_ZONES = [[0.935, 0.985, 6, 'sharp', 0.5, 0.97], [0.935, 0.985, 6, 'invert', 0.5, 0.97], [0.925, 0.99, 5, 'otsu', 0.45, 0.98]];
  const NAME_ZONES = [[0.66, 0.77, 2.5, 'sharp', 0.15, 0.85]];
  /** Photo tournée d'un quart de tour (vers la droite) : les terrains se lisent alors comme une carte couchée */
  async function turned(b) {
    const bmp = await createImageBitmap(b), c = document.createElement('canvas');
    c.width = bmp.height; c.height = bmp.width;
    const g = c.getContext('2d'); g.translate(c.width, 0); g.rotate(Math.PI / 2); g.drawImage(bmp, 0, 0);
    return c;
  }
  async function ocrTexts(b, { terrain = 'auto' } = {}) {
    const O = App.recognizerParts && App.recognizerParts.codeOcr;
    if (!O) return [];
    const out = [];
    if (terrain !== true) { const rd = await O.read(b, [...OCR_BANDS, ...NAME_BANDS], { zones: ZONES }).catch(() => null); if (rd) out.push(...rd.texts); }
    if (terrain === true || (terrain === 'auto' && !out.some((t) => codesIn(t).length))) {
      const t = await turned(b).catch(() => null);
      const rd = t ? await O.read(t, T_BANDS, { zones: T_ZONES }).catch(() => null) : null;
      if (rd) out.push(...rd.texts);
    }
    return out;
  }
  /** Meilleur cadre en forme de carte dans la photo (détourage raté), remis à plat — comme Final Fantasy (v3.46) */
  async function findCrop(src) {
    try {
      const R = App.recognizer, bmp = await createImageBitmap(src), k = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      const r = R.findCard(c, {}); if (!r || !r.quad) return null;
      const px = r.quad.map(([x, y]) => [x * c.width, y * c.height]);
      const area = Math.abs(px.reduce((s, p, i) => { const q = px[(i + 1) % 4]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2 / (c.width * c.height);
      if (area < 0.12 || area > 0.97 || Math.abs(R.trueRatio(px, c.width, c.height) - 88 / 63) > 0.1) return null;
      const w = Math.min(1000, Math.round(Math.hypot(px[1][0] - px[0][0], px[1][1] - px[0][1])));
      return await new Promise((res) => R.warpQuad(c, px, w).toBlob(res, 'image/jpeg', 0.92));
    } catch (e) { return null; }
  }

  // ---------- Vérification par l'image : réseau de neurones + points clés (js/visual.js › check), index data/wk-index ----------
  const WK_INDEX_V = 1;
  const IMG_SURE = 30;
  const useVisual = () => App.visual && App.visual.supported() && App.settings.visualCheck !== false;
  // même personnage dans plusieurs cartes (Commune, UR, légendaire, starter) : illustrations différentes, le code lu tranche
  const visualOpts = (codes, setId = '') => ({
    index: 'data/wk-index', v: WK_INDEX_V, cardsOf: (near) => fromIds(near.map((x) => x.id)), urlOf: (c) => img.card(c, 'low'),
    twinsOf: async () => [], twinKey: (c) => c.id,
    tie: (a, b) => (codes.includes(b.id) - codes.includes(a.id)) || ((b.setId === setId) - (a.setId === setId)) || (a.alt - b.alt),
  });
  async function cropQuad(blob, quad) {
    if (!quad || quad.some(([x, y]) => x < -0.06 || x > 1.06 || y < -0.06 || y > 1.06)) return null;
    return App.visual.quadCrop(blob, quad.map(([x, y]) => [Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y))]));
  }
  // coins par l'image gardés seulement s'ils ont la forme d'une carte, perspective retirée (88/63 ± 0,1) — comme Final Fantasy (v3.44)
  const sizeOf = async (im) => { try { const b = await createImageBitmap(im); return [b.width, b.height]; } catch (e) { return null; } };
  async function cardShaped(quad, im) {
    const R = App.recognizer, wh = quad && R.trueRatio ? await sizeOf(im) : null;
    if (!wh) return !!quad;
    const r = R.trueRatio(quad.map(([x, y]) => [x * wh[0], y * wh[1]]), wh[0], wh[1]);
    return !(r > 0) || Math.abs(r - 88 / 63) <= 0.1;
  }
  async function visualPass(blob, cands, codes, context = null, setId = '') {
    const V = App.visual, o = await V.check(blob, cands, visualOpts(codes, setId));
    const grow = async (r, im) => { if (r && r.quad) { if (!(await cardShaped(r.quad, im))) { r.quad = null; r.crop = null; return r; } r.crop = await cropQuad(im, r.quad).catch(() => null) || r.crop; } return r; };
    await grow(o, blob);
    const top = o && o.cands[0];
    if (!context || !o) return o;
    if (top && top.orb >= V.SURE) {
      let cq = o.url ? await V.quadOn(context, top, o.url).catch(() => null) : null;
      if (cq && !(await cardShaped(cq, context))) cq = null;
      if (cq) o.ctxQuad = cq;
      const crop = cq ? await cropQuad(context, cq).catch(() => null) : null;
      return crop ? { ...o, crop } : o;
    }
    const w = await grow(await V.check(context, cands, visualOpts(codes, setId)).catch(() => null), context);
    if (w && w.quad) w.ctxQuad = w.quad;
    return w && w.cands[0] && w.cands[0].confident ? w : o;
  }

  /**
   * Lit une photo de carte (déjà recadrée) : code imprimé (« STELLAR · LAINK · C#55 », terrains couchés compris), nom, puis
   * vérification par l'image. Même déroulé que Final Fantasy. Renvoie { info: { code, name, read, crop… }, cands }.
   */
  async function recognize(blob, statusFn = () => {}, { setId = '', original = null, context = null, onCrop = null } = {}) {
    const R = App.recognizer, D = await data();
    const early = useVisual() ? visualPass(blob, [], [], context, setId).catch((e) => { console.warn('vérification par l’image', e); return null; }) : null;
    if (early && onCrop) early.then((e) => { if (e && e.crop) onCrop(e.crop); }, () => {}); // (cadrage sur les vrais bords montré dès qu'il est trouvé, v3.47)
    statusFn('Lecture du code de la carte…');
    const texts = await ocrTexts(blob);
    if (!texts.some((t) => codesIn(t).length)) texts.push(...(await R.readZones(blob, CODE_ZONES.slice(0, 2))));
    let read = texts.map(codesIn), betterCrop = null;
    const anyCode = () => read.some((r) => r.length);
    if (!anyCode() && !early) { const t = await R.readZones(blob, [...CODE_ZONES.slice(2), ...NAME_ZONES]); texts.push(...t); read.push(...t.map(codesIn)); }
    if (early && !anyCode()) {
      statusFn('Vérification par l’image…');
      const e = await early;
      if (e && e.cands[0] && e.cands[0].confident && (e.cands[0].orb || 0) >= IMG_SURE) return { info: { code: e.cands[0].id, name: '', votes: {}, crop: e.crop, ctxQuad: e.ctxQuad, orb: e.best, read: 'reconnue à l’image ✓' }, cands: e.cands.slice(0, 40) };
      const crop = e && e.crop;
      statusFn(crop ? 'Lecture du code (carte recadrée)…' : 'Lecture du code…');
      let t = crop ? await ocrTexts(crop, { terrain: e.cands[0] && e.cands[0].kind === 't' ? true : 'auto' }) : [];
      if (!t.some((x) => codesIn(x).length)) t = [...t, ...(await R.readZones(crop || blob, crop ? CODE_ZONES : [...CODE_ZONES.slice(2), ...(context ? [] : NAME_ZONES)]))];
      texts.push(...t); read.push(...t.map(codesIn));
      if (anyCode() && crop) betterCrop = crop;
    }
    // ni code ni nom lus : la carte cherchée dans la photo elle-même (détourage raté), puis relue — elle sert ensuite à la comparaison
    const nameIn = async (ts) => { const nm = await names(); return ts.some((t) => String(t || '').split('\n').some((l) => nm.has(norm(l)))); };
    if (!anyCode() && !(await nameIn(texts))) {
      for (const src of [...new Set([blob, original, context].filter(Boolean))]) {
        statusFn('Recherche de la carte dans la photo…');
        const fc = await findCrop(src); if (!fc) continue;
        const t = await ocrTexts(fc); texts.push(...t); read.push(...t.map(codesIn));
        if (anyCode() || await nameIn(t)) { betterCrop = fc; blob = fc; break; }
      }
    }
    if (original && !context && !anyCode()) {
      statusFn('Lecture du code (autre cadrage)…');
      const t = await R.readZones(original, ['full']).catch(() => []);
      texts.push(...t); read.push(...t.map(codesIn));
    }
    if (!anyCode() && !(context && early)) { statusFn('Lecture de toute la carte…'); const [full] = await R.readZones(blob, ['full']); texts.push(full); read.push(codesIn(full)); }
    // votes : « série|numéro » → poids ; seuls les codes qui existent comptent
    const votes = {};
    for (const r of read) for (const [c, w] of r) votes[c] = (votes[c] || 0) + w;
    const idOf = (c) => (D.byNum.get(c) || {}).id;
    let codes = Object.keys(votes).filter(idOf).sort((a, b) => votes[b] - votes[a]);
    if (codes.length) codes = codes.filter((c) => votes[c] >= votes[codes[0]] * 0.5);
    statusFn('Recherche de la carte…');
    const nm = await names(), lines = texts.join('\n').split('\n').map((l) => norm(l)).filter((l) => l.length >= 3);
    let best = { k: '', s: 0 };
    const keys = [...nm.keys()];
    for (const l of lines) for (const k of keys) {
      if (Math.abs(k.length - l.length) > Math.max(3, k.length * 0.4)) continue;
      const s = l === k ? 1 : l.includes(k) && k.length >= 6 ? 0.9 : App.util.similarity(l, k);
      if (s > best.s) best = { k, s };
    }
    const nameOk = best.s >= 0.8 ? best.k : '';
    const nameIds = nameOk ? [...nm.get(nameOk)] : [];
    let agreed = false;
    let cands = [];
    for (const c of codes.slice(0, 5)) { const id = idOf(c); if (id) cands.push(...(await fromIds([id]))); }
    const codeIds = new Set(codes.map(idOf).filter(Boolean));
    if (nameOk && cands.length) { const ok = cands.filter((c) => nameIds.includes(c.id)); if (ok.length) agreed = true; }
    // code et nom en désaccord (numéro mal lu) : la carte de ce nom au même numéro, dans une autre saison, passe devant
    if (nameOk && cands.length && !agreed) {
      const nums = new Set(codes.map((c) => c.split('|')[1]));
      const fx = (await fromIds(nameIds)).filter((c) => nums.has(String(c.localId).toUpperCase()));
      if (fx.length) { for (const c of fx) c.codeFix = true; cands = [...fx, ...cands]; agreed = true; }
    }
    if (nameOk && !agreed) cands.push(...(await fromIds(nameIds)).sort((a, b) => ((b.setId === setId) - (a.setId === setId)) || String(b.set.sortKey).localeCompare(String(a.set.sortKey))));
    const seen = new Set(); cands = cands.filter((x) => !seen.has(x.id) && seen.add(x.id));
    const rk = (c) => (c.codeFix ? 3 : 0) + (codeIds.has(c.id) ? 2 : 0) + (nameIds.includes(c.id) ? 1 : 0);
    cands.sort((a, b) => rk(b) - rk(a));
    for (const c of cands) { c.numOk = codeIds.has(c.id); c.ofOk = c.numOk; }
    if (cands.length > 1) {
      statusFn('Comparaison des illustrations…');
      const pool = cands.slice(0, 24), vis = await R.resemblanceMany(blob, pool, (c) => img.card(c, 'low')).catch(() => new Map());
      for (const c of cands) c.visual = vis.has(c.id) ? vis.get(c.id) : null;
      cands.sort((a, b) => (Math.round(((b.visual ?? -1) - (a.visual ?? -1)) * 16)) || (codeIds.has(b.id) - codeIds.has(a.id)) || (a.alt - b.alt));
      if (cands.some((c) => c.codeFix || codeIds.has(c.id))) cands.sort((a, b) => (rk(b) - rk(a)) || ((b.visual ?? -1) - (a.visual ?? -1)));
    }
    if (nameOk) for (const x of cands) x.nameScore = nameIds.includes(x.id) ? 1 : 0;
    let top = cands[0];
    const second = cands[1];
    const codeSure = codes.length > 0 && codeIds.has(top && top.id) && (agreed || votes[codes[0]] >= 2);
    const visSure = top && (!second || (top.visual != null && top.visual >= 0.55 && top.visual - (second.visual ?? 0) >= 0.1) || (codeIds.has(top.id) && !codeIds.has(second.id) && agreed));
    if (top && codeSure && visSure) top.confident = true;
    let orb = null;
    if (!(top && top.confident) && useVisual()) {
      statusFn('Vérification par l’image…');
      const e = early && !cands.length ? await early : null;
      if (e) orb = e;
      else orb = await visualPass(blob, cands, [...codeIds], context, setId).catch((err) => { console.warn('vérification par l’image', err); return null; });
      if (orb) { cands = orb.cands; top = cands[0]; }
      if (top && top.confident && !codeIds.has(top.id) && (top.orb || 0) < IMG_SURE) delete top.confident;
      if (top && !top.confident && codeIds.has(top.id) && (top.orb || 0) >= App.visual.SURE) top.confident = true;
    }
    if (orb && orb.crop) betterCrop = orb.crop;
    const cropLater = !orb && early && top ? early.then((e) => (e && e.crop && e.cands[0] && e.cands[0].id === top.id ? e.crop : null), () => null) : null;
    const codeTxt = (c) => { const k = D.byNum.get(c); return k ? `code ${k.ra || ''}#${k.l} (${(D.sets.find((s) => s.id === k.s) || {}).name || k.s})` : c; };
    const byImg = codes.length && top && !codeIds.has(top.id) && top.orb >= 25;
    const readTxt = codes.length ? `${byImg ? codeTxt(`${top.setId}|${String(top.localId).toUpperCase()}`) : codeTxt(codes[0])}${byImg ? ' (corrigé grâce à l’illustration)' : ''}` : '';
    return { info: { code: top ? top.id : '', name: nameOk, votes, crop: betterCrop, cropLater, ctxQuad: orb && top && orb.cands[0] === top ? orb.ctxQuad : null, orb: orb ? orb.best : null, read: [readTxt, nameOk ? `nom « ${nameOk} »` : '', top && top.orb >= 25 ? 'reconnue à l’image ✓' : ''].filter(Boolean).join(', ') }, cands: cands.slice(0, 40) };
  }

  /** Recherche à la main (nom, ou code « C#55 », « 55 »), classée par ressemblance avec la photo */
  async function manual(blob, nameTxt, numTxt) {
    const name = (nameTxt || '').trim(), num = (numTxt || '').trim();
    if (!name && !num) throw new Error('Indique un nom, ou un numéro (ex. C#55)');
    let cands = num ? await search({ name: /#/.test(num) ? num : `#${num.replace(/^[A-Z-]*\s*/i, '')}` }) : await search({ name });
    if (num && name) { const n = norm(name), f = cands.filter((c) => norm(c.name).includes(n)); cands = f.length ? f : await search({ name }); }
    if (blob && cands.length > 1) {
      const pool = cands.slice(0, 24), vis = await App.recognizer.resemblanceMany(blob, pool, (c) => img.card(c, 'low')).catch(() => new Map());
      for (const c of pool) c.visual = vis.has(c.id) ? vis.get(c.id) : null;
      cands = [...pool.sort((a, b) => (b.visual ?? -1) - (a.visual ?? -1)), ...cands.slice(24)];
    }
    return cands;
  }

  const dex = (card) => (card && card.wid ? `https://wankul.fr/apps/wankul/wankuldex?card=${card.wid}` : 'https://wankul.fr/apps/wankul/wankuldex');
  App.games.register('wankul', {
    id: 'wankul',
    name: 'Wankul',
    listSets, getSet, getCard, search, versions, byCode, setIdsByName, price, img, recognize, manual, codesIn, names,
    visualIndex: { index: 'data/wk-index', v: WK_INDEX_V },
    visualCheck: (blob) => (useVisual() ? visualPass(blob, [], []) : Promise.resolve(null)),
    langFor: () => 'fr',
    // pas sur Cardmarket : le lien mène à la carte dans le Wankuldex officiel
    noPrices: true,
    refLink: { label: 'Voir dans le Wankuldex officiel', url: dex },
    cardmarketUrl: dex,
    boosterUrl: () => 'https://wankul.fr/collections/ns_cartes',
    isOfficial: () => true,
    numLabel: (card) => card.localId, // (« C#55 » : pas de total imprimé sur la carte)
    logoText: (s) => (SEASON_WORD[s.id] ? `S${(memo && (memo.sets.find((x) => x.id === s.id) || {}).num) || ''} ${s.name}` : HS_SHORT[s.id] || s.name),
    priceNote: 'Pas de cote connue pour les cartes Wankul : ni Cardmarket ni TCGplayer ne les vendent.',
    rarity,
    pullRates: () => null,
    source: { name: 'Wankuldex officiel (wankul.fr)', url: 'https://wankul.fr/apps/wankul/wankuldex' },
  });
})();
