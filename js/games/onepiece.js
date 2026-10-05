/*
 * Adaptateur One Piece (v2.85).
 * Cartes : « Punk Records » (github.com/buhbbl/punk-records), copie en JSON du site officiel de Bandai
 * (fr.onepiece-cardgame.com et en.onepiece-cardgame.com), en français depuis OP-09 (sortie française),
 * en anglais pour les séries plus anciennes. Visuels : site officiel. Prix : optcgapi.com (marché TCGplayer, en $).
 * Identifiant d'une carte = son code imprimé (« OP09-004 », version parallèle « OP09-004_p1 ») : unique dans une langue.
 */
(() => {
  const DATA = 'https://raw.githubusercontent.com/buhbbl/punk-records/main';
  const PRICES = 'https://optcgapi.com/api';
  const DAY = 24 * 3600 * 1000;
  const FOLDER = { fr: 'french', en: 'english' };
  const { norm } = App.util;
  const lang = () => (App.settings && App.settings.lang === 'en' ? 'en' : 'fr');
  const LANGS = { fr: 'Français', en: 'Anglais' };

  // ---------- Réseau + cache (même principe que Pokémon : la dernière réponse reste utilisable hors ligne) ----------
  const inflight = {};
  async function cached(key, ttl, loader) {
    const hit = await App.db.get('cache', key).catch(() => null);
    if (hit && Date.now() - hit.t < ttl) return hit.v;
    if (inflight[key]) return inflight[key];
    inflight[key] = (async () => {
      try {
        const v = await loader();
        await App.db.set('cache', key, { t: Date.now(), v }).catch(() => {});
        return v;
      } catch (e) {
        if (hit) { console.warn('Réseau indisponible, données en cache utilisées', e); return hit.v; }
        throw e;
      } finally { delete inflight[key]; }
    })();
    return inflight[key];
  }
  async function getJSON(url, tries = 3) {
    let err;
    for (let i = 0; i < tries; i++) {
      try { const r = await fetch(url); if (r.ok) return r.json(); if (r.status === 404) throw new Error('introuvable : ' + url); err = new Error('HTTP ' + r.status); }
      catch (e) { err = e; if (/introuvable/.test(e.message)) throw e; }
      await new Promise((res) => setTimeout(res, 300 * (i + 1)));
    }
    throw err;
  }

  // ---------- Raretés ----------
  // clé (comme dans les données) → [rang, nom FR, sigle imprimé sur la carte, couleur]
  const RAR = {
    Common:       [1,  'Commune',       'C',   '#8a92a8'],
    Uncommon:     [2,  'Peu commune',   'UC',  '#3ddc97'],
    Rare:         [3,  'Rare',          'R',   '#4da3ff'],
    Promo:        [3,  'Promo',         'P',   '#36d6e7'],
    Leader:       [4,  'Leader',        'L',   '#ff9f43'],
    Don:          [1,  'DON!!',         'DON', '#b9c0d4'],
    SuperRare:    [6,  'Super rare',    'SR',  '#c77dff'],
    Parallel:     [9,  'Parallèle',     'ALT', '#ff6ec7'],
    SecretRare:   [10, 'Secrète rare',  'SEC', '#ffc53d'],
    Special:      [11, 'Spéciale',      'SP',  'url(#gpk)'],
    TreasureRare: [12, 'Trésor rare',   'TR',  'url(#rbw)'],
  };
  const rkey = (r) => (RAR[r] ? r : Object.keys(RAR).find((k) => norm(RAR[k][1]) === norm(r) || norm(RAR[k][2]) === norm(r)) || null);
  const pillBg = (c) => (c === 'url(#rbw)' ? 'linear-gradient(90deg,#ff6ec4,#7873f5,#4ade80,#facc15)' : c === 'url(#gpk)' ? 'linear-gradient(90deg,#ffc53d,#ff6ec7)' : c);
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
  // carte parallèle (« _p1 », illustration alternative) : rareté à part, sauf les SP / TR / promos qui gardent la leur
  const rarOf = (id, r) => (/_p\d+$/.test(id) && !['Special', 'TreasureRare', 'Promo'].includes(r) ? 'Parallel' : r || '');

  // ---------- Séries ----------
  const unent = (s) => String(s || '').replace(/&amp;/g, '&').replace(/&apos;/g, '\'').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&apos;/g, '\'');
  /** « LES NOUVEAUX EMPEREURS » → « Les nouveaux empereurs » (les titres déjà en minuscules sont gardés) */
  const niceTitle = (t) => { t = unent(t).trim(); return t && t === t.toUpperCase() ? t.charAt(0) + t.slice(1).toLowerCase() : t; };
  const labelOf = (pid, p) => {
    const tail = String(pid).slice(-3);
    if (tail === '901') return 'PROMO';
    if (tail === '801') return 'AUTRES';
    const l = (p.title_parts && p.title_parts.label) || (String(p.raw_title || '').match(/\[([A-Z0-9-]+)\]/) || [])[1] || '';
    return l.replace(/\s+/g, '');
  };
  const GROUPS = {
    booster: { id: 'op-booster', name: 'Boosters' },
    extra: { id: 'op-extra', name: 'Boosters extra et premium' },
    deck: { id: 'op-deck', name: 'Decks de démarrage' },
    promo: { id: 'op-promo', name: 'Promos et autres' },
  };
  const kindOf = (label) => (/^OP-?\d/.test(label) ? 'booster' : /^(EB|PRB)-/.test(label) ? 'extra' : /^ST-/.test(label) ? 'deck' : 'promo');
  // ordre de sortie approximatif (en mois depuis Romance Dawn, déc. 2022) : les données n'ont pas de date
  function sortKey(label) {
    let m = label.match(/^OP-?(\d+)/); if (m) return (+m[1] - 1) * 3;
    m = label.match(/^EB-(\d+)/); if (m) return [17, 29, 38][+m[1] - 1] ?? +m[1] * 12;
    m = label.match(/^PRB-(\d+)/); if (m) return [23, 33][+m[1] - 1] ?? +m[1] * 12;
    m = label.match(/^ST-(\d+)/); if (m) return Math.round((+m[1] - 1) * 1.15);
    return -1;
  }
  const NAMES = { PROMO: 'Cartes promo', AUTRES: 'Autres produits' };
  const nameOf = (label, p) => {
    if (NAMES[label]) return NAMES[label];
    const tp = p.title_parts || {};
    const t = niceTitle(tp.title || p.raw_title || label);
    const pre = String(tp.prefix || '').toUpperCase();
    const kind = /ULTRA/.test(pre) ? 'Ultra deck' : /DECK/.test(pre) ? 'Deck' : /EXTRA/.test(pre) ? 'Extra' : /PREMIUM/.test(pre) ? 'Premium' : '';
    return `${label} · ${kind ? kind + ' ' : ''}${t}`;
  };
  /** Codes des cartes « de la série » (les autres sont des réimpressions) : OP-09 → OP09 ; OP14-EB04 → OP14, EB04 */
  // « _p1 » = version parallèle (autre illustration), « _r1 » = réimpression au même dessin dans une autre série
  const SUFFIX = /_[pr]\d+$/;
  const codesOf = (label) => (label === 'PROMO' ? ['P'] : label === 'AUTRES' ? [] : label.split(/(?<=\d)-(?=[A-Z])/).map((x) => x.replace('-', '')));
  const isOfficialIn = (id, label) => {
    if (SUFFIX.test(id)) return false;
    if (label === 'AUTRES') return true;
    const pre = String(id).split('-')[0];
    return codesOf(label).includes(pre);
  };

  /** Index des deux langues : séries + toutes les cartes (code → série, nom, rareté). ~1 à 2 Mo, gardé 3 jours */
  const index = () => cached('op1:index', 3 * DAY, async () => {
    const out = {};
    await Promise.all(['fr', 'en'].map(async (L) => {
      const [packs, cards] = await Promise.all([getJSON(`${DATA}/${FOLDER[L]}/packs.json`), getJSON(`${DATA}/${FOLDER[L]}/index/cards_by_id.json`)]);
      const P = {};
      for (const [pid, p] of Object.entries(packs)) { const label = labelOf(pid, p); if (label) P[pid] = { label, name: nameOf(label, p) }; }
      const C = {};
      for (const [id, c] of Object.entries(cards)) if (c && P[c.pack_id]) C[id] = [c.pack_id, unent(c.name), c.rarity || '', c.img_url || ''];
      out[L] = { packs: P, cards: C };
    }));
    return out;
  });

  let setsMemo = null;
  async function sets() {
    const idx = await index();
    if (setsMemo && setsMemo.idx === idx) return setsMemo.list;
    const by = {};
    for (const L of ['fr', 'en']) for (const [pid, p] of Object.entries(idx[L].packs)) {
      const s = by[p.label] = by[p.label] || { id: p.label, packs: {}, names: {}, counts: {} };
      s.packs[L] = pid; s.names[L] = p.name; s.counts[L] = { total: 0, official: 0 };
    }
    for (const L of ['fr', 'en']) for (const [id, c] of Object.entries(idx[L].cards)) {
      const s = by[idx[L].packs[c[0]].label]; const n = s.counts[L];
      n.total++; if (isOfficialIn(id, s.id)) n.official++;
    }
    const list = Object.values(by).map((s) => ({ ...s, enOnly: !s.packs.fr, sortKey: String(sortKey(s.id) + 100).padStart(4, '0'), group: GROUPS[kindOf(s.id)] }));
    setsMemo = { idx, list };
    return list;
  }
  const langFor = (setId) => {
    const m = ((App.settings && App.settings.setLangs) || {})[setId];
    const s = setsMemo && setsMemo.list.find((x) => x.id === setId);
    if (s && s.enOnly) return 'en';
    if (s && !s.packs.en) return 'fr';
    return m === 'en' || m === 'fr' ? m : lang();
  };
  const setLanguages = () => [{ id: 'fr', name: LANGS.fr }, { id: 'en', name: LANGS.en }];
  function setLangFor(setId, l) {
    const m = { ...(App.settings.setLangs || {}) };
    if (!l || l === lang()) delete m[setId]; else m[setId] = l;
    App.settings.setLangs = m;
    return App.col.saveSettings();
  }
  const shapeOf = (s, L = langFor(s.id)) => {
    const c = s.counts[L] || s.counts.fr || s.counts.en;
    return { id: s.id, name: s.names[L] || s.names.fr || s.names.en, logo: '', symbol: '', releaseDate: '', sortKey: s.sortKey, total: c.total, official: c.official, group: s.group, ...(s.enOnly ? { enOnly: true } : {}) };
  };
  async function listSets() {
    const list = await sets();
    return list.map((s) => shapeOf(s)).filter((s) => s.total > 0);
  }

  // ---------- Cartes ----------
  const CAT = { Leader: 'Leader', Character: 'Personnage', Event: 'Événement', Stage: 'Lieu', Don: 'DON!!' };
  const COL = { Red: 'Rouge', Green: 'Vert', Blue: 'Bleu', Purple: 'Violet', Black: 'Noir', Yellow: 'Jaune' };
  const nb = (v) => Number(v).toLocaleString('fr-FR');
  /** « OP09-004_p1 » → « OP09-004 P1 » (affiché sous la carte) */
  const pretty = (id) => String(id).replace(/_([pr])(\d+)$/, (m, k, n) => ` ${k.toUpperCase()}${n}`);
  function normCard(c, s, L) {
    const id = c.id || c.card_id;
    const facts = [CAT[c.category] || c.category, (c.colors || []).map((x) => COL[x] || x).join(' / '), c.cost != null && c.category !== 'Leader' ? `Coût ${c.cost}` : '', c.category === 'Leader' && c.cost != null ? `${c.cost} vies` : '',
      c.power ? `${nb(c.power)} de puissance` : '', c.counter ? `Contre +${nb(c.counter)}` : '', (c.types || []).map(unent).join(' · ')].filter(Boolean);
    return {
      id, localId: pretty(id), name: unent(c.name), image: c.img_full_url || c.img_url || '', rarity: rarOf(id, c.rarity), baseRarity: c.rarity || '',
      category: CAT[c.category] || c.category || '', types: [], facts,
      text: [unent(c.effect || ''), c.trigger ? '[Déclenchement] ' + unent(c.trigger) : ''].filter((x) => x && x !== '-').join('\n'),
      colors: c.colors || [], cost: c.cost ?? null, power: c.power ?? null, counter: c.counter ?? null,
      setId: s.id, serieId: s.group.id, dataLang: L, reprint: !/_p\d+$/.test(id) && !isOfficialIn(id, s.id),
    };
  }
  async function getSet(id) {
    id = String(id);
    const list = await sets();
    const s = list.find((x) => x.id === id);
    if (!s) throw new Error('Série inconnue : ' + id);
    const L = s.packs[langFor(id)] ? langFor(id) : s.packs.fr ? 'fr' : 'en';
    return cached(`op1:${L}:set:${id}`, 7 * DAY, async () => {
      const raw = await getJSON(`${DATA}/${FOLDER[L]}/data/${s.packs[L]}.json`);
      const set = { ...shapeOf(s, L), cardCount: { total: raw.length, official: 0 } };
      // série d'abord dans l'ordre des numéros, puis ses versions parallèles, réimpressions à la fin
      set.cards = raw.filter((c) => c && c.id).map((c) => normCard(c, set, L))
        .sort((a, b) => (a.reprint - b.reprint) || a.id.localeCompare(b.id, 'en', { numeric: true }));
      set.official = set.cardCount.official = set.cards.filter((c) => isOfficialIn(c.id, id)).length;
      set.total = set.cards.length;
      return set;
    });
  }
  /** Série d'une carte d'après son code (dans la langue voulue, sinon l'autre) */
  async function setOfCard(id, prefer) {
    const idx = await index();
    for (const L of prefer === 'en' ? ['en', 'fr'] : ['fr', 'en']) {
      const c = idx[L].cards[id]; if (c) return { setId: idx[L].packs[c[0]].label, L };
    }
    return null;
  }
  // ---------- Prix (optcgapi : marché TCGplayer, cartes anglaises, en dollars) ----------
  const priceList = (setId) => cached(`op1:prices:${setId}`, DAY, async () => {
    const path = setId === 'PROMO' ? '/allPromos/' : /^ST-/.test(setId) ? `/decks/${setId}/` : setId === 'AUTRES' ? null : `/sets/${setId}/`;
    if (!path) return {};
    const rows = await getJSON(PRICES + path, 2).catch(() => []);
    const m = {};
    for (const r of Array.isArray(rows) ? rows : []) {
      const k = r.card_image_id || r.card_set_id, v = r.market_price || r.inventory_price;
      if (k && v > 0) m[k] = { v, t: r.date_scraped || '' };
    }
    return m;
  });
  async function getCard(id, { fresh = false } = {}) {
    id = String(id);
    await sets();
    const guess = await setOfCard(id, null);
    const where = guess ? (await setOfCard(id, langFor(guess.setId))) : null;
    if (!where) throw new Error('Carte inconnue : ' + id);
    // la série telle qu'affichée ; si la carte n'y est pas (série passée dans l'autre langue), la liste de l'autre langue
    const set = await getSet(where.setId);
    let c = set.cards.find((x) => x.id === id);
    if (!c) {
      const s = (await sets()).find((x) => x.id === where.setId), L = where.L;
      const raw = await cached(`op1:${L}:raw:${s.packs[L]}`, 7 * DAY, () => getJSON(`${DATA}/${FOLDER[L]}/data/${s.packs[L]}.json`));
      const r = raw.find((x) => x && x.id === id); if (!r) throw new Error('Carte inconnue : ' + id);
      c = normCard(r, set, L);
    }
    const prices = await priceList(set.id).catch(() => ({}));
    const p = prices[id];
    return {
      ...c,
      set: { id: set.id, name: set.name, logo: '', symbol: '', releaseDate: '', cardCount: { total: set.total, official: set.official }, serie: set.group },
      pricing: p ? { tcgplayer: { market: { marketPrice: p.v } }, updated: p.t } : null,
    };
  }
  function price(card) {
    const tp = card && card.pricing && card.pricing.tcgplayer;
    const v = tp && tp.market && tp.market.marketPrice;
    return v > 0 ? { value: v, unit: 'USD', source: 'TCGplayer', updated: card.pricing.updated, raw: tp } : null;
  }
  const tpMarket = (tp) => (tp && tp.market && tp.market.marketPrice) || null;

  // ---------- Recherche ----------
  const setShape = (s) => ({ id: s.id, name: s.name, logo: '', symbol: '', releaseDate: '', sortKey: s.sortKey, cardCount: { total: s.total, official: s.official }, serie: s.group, ...(s.enOnly ? { enOnly: true } : {}) });
  /** Cartes de l'index (sans le détail) au format des propositions du scanner */
  async function fromIndex(ids) {
    const idx = await index(), list = await sets(), out = [];
    for (const id of ids) {
      const g = await setOfCard(id, null); if (!g) continue;
      const s = list.find((x) => x.id === g.setId); if (!s) continue;
      const L = idx[langFor(s.id)].cards[id] ? langFor(s.id) : g.L, c = idx[L].cards[id];
      out.push({ id, localId: pretty(id), name: c[1], image: c[3], rarity: rarOf(id, c[2]), setId: s.id, serieId: s.group.id, set: setShape(shapeOf(s)) });
    }
    return out;
  }
  /** Toutes les cartes d'un code : la carte, ses versions parallèles, et ses réimpressions */
  async function byCode(code) {
    const idx = await index();
    const base = String(code).toUpperCase().replace(/_[PR]\d+$/, '');
    const ids = new Set();
    for (const L of ['fr', 'en']) for (const id of Object.keys(idx[L].cards)) if (id === base || (id.startsWith(base) && /^_[pr]\d+$/.test(id.slice(base.length)))) ids.add(id);
    return (await fromIndex([...ids])).sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
  }
  async function search({ name }) {
    const q = norm(name); if (!q) return [];
    const code = String(name).toUpperCase().match(/\b(OP|ST|EB|PRB)\s?(\d{2})\s?-\s?(\d{3})\b|\bP-\d{3}\b/);
    if (code) return byCode(code[1] ? `${code[1]}${code[2]}-${code[3]}` : code[0]);
    const idx = await index(), ids = new Set();
    for (const L of ['fr', 'en']) for (const [id, c] of Object.entries(idx[L].cards)) if (norm(c[1]).includes(q)) ids.add(id);
    return (await fromIndex([...ids].slice(0, 300)));
  }
  /** Séries dont le nom (français ou anglais) contient `name`, ou dont c'est le code (« Royal Blood », « OP-10 ») — import d'un fichier */
  async function setIdsByName(name) {
    const q = norm(name); if (!q) return [];
    return (await sets()).filter((s) => norm(s.id) === q || Object.values(s.names).some((n) => norm(n).includes(q))).map((s) => s.id);
  }
  async function versions(name) {
    const n = norm(name);
    return (await search({ name })).filter((c) => norm(c.name) === n);
  }
  /** Noms des personnages (pour reconnaître le nom lu sur la photo) : nom normalisé → ids */
  let namesMemo = null;
  async function names() {
    const idx = await index();
    if (namesMemo && namesMemo.idx === idx) return namesMemo.m;
    const m = new Map();
    for (const L of ['fr', 'en']) for (const [id, c] of Object.entries(idx[L].cards)) { const k = norm(c[1]); if (!k) continue; if (!m.has(k)) m.set(k, new Set()); m.get(k).add(id); }
    namesMemo = { idx, m };
    return m;
  }

  // ---------- Reconnaissance d'une photo ----------
  // sur une carte One Piece, le code (« OP09-004 ») est imprimé en bas à droite, et le nom en gros au-dessus des types
  // lecture tolérante (« OPO9-0O4 », « 0P09—004 ») puis chiffres corrigés : O → 0, I/L → 1, S → 5…
  const D = '[0-9OILSDQZBG|]';
  // (String.raw : les « \s » doivent arriver tels quels dans l'expression ; avant, ils devenaient « s » et un code lu avec un espace était ignoré)
  // préfixe : « O » souvent lu « 0 », « © », « ( », « C »… ; un chiffre collé après le code = le badge de rareté (« OP10-1198 » → OP10-119)
  const CODE_RE = new RegExp(String.raw`(OP|[0©(CQGD]P|ST|5T|EB|E8|PRB|PR8)\s?[-–—_.]?\s?(${D}{2})\s?[-–—_.]\s?(${D}{3})|(?<![A-Z0-9])P\s?[-–—]\s?(${D}{3})(?![0-9])`, 'g');
  // lettres lues à la place d'un chiffre : toutes les possibilités (le petit « 9 » est souvent lu « g » ou « s »)
  const ALT = { O: ['0'], D: ['0'], Q: ['9', '0'], I: ['1'], L: ['1'], '|': ['1'], S: ['5', '9'], G: ['9', '6'], Z: ['2'], B: ['8'] };
  /** Chiffres possibles d'un groupe lu (« OS » → 05, 09) avec un poids : 1 si lu tel quel, moins s'il a fallu deviner */
  function digitsOf(s) {
    let out = [['', 1]];
    for (const ch of s) {
      const opts = /\d/.test(ch) ? [ch] : ALT[ch] || [];
      if (!opts.length) return [];
      out = out.flatMap(([p, w]) => opts.map((d, i) => [p + d, w * (opts.length > 1 ? (i ? 0.35 : 0.55) : /\d/.test(ch) ? 1 : 0.9)]));
    }
    return out;
  }
  /** Codes lus (« OP09-004 », avec un poids) et numéros seuls (« -004 », quand le début du code est illisible) */
  function codesIn(text) {
    const codes = [], nums = [];
    const T = String(text || '').toUpperCase();
    for (const m of T.matchAll(CODE_RE)) {
      if (!m[1]) { for (const [n, w] of digitsOf(m[4])) codes.push([`P-${n}`, w]); continue; }
      const pre = m[1].replace(/^[0©(CQGD]P$/, 'OP').replace('5T', 'ST').replace('E8', 'EB').replace('PR8', 'PRB');
      for (const [a, wa] of digitsOf(m[2])) for (const [b, wb] of digitsOf(m[3])) codes.push([`${pre}${a}-${b}`, wa * wb]);
    }
    for (const m of T.matchAll(new RegExp(`[-–—](${D}{3})(?![0-9A-Z])`, 'g'))) for (const [n] of digitsOf(m[1]).slice(0, 1)) if (n !== '000') nums.push(n);
    return { codes, nums };
  }
  const baseOf = (id) => String(id).replace(SUFFIX, '');
  const numOfId = (id) => (String(id).match(/-(\d{3})/) || [])[1] || '';
  /**
   * Lit une photo de carte (déjà recadrée) : code et nom, puis propose les cartes qui correspondent,
   * classées par ressemblance de l'illustration (visuels relayés par images.weserv.nl, qui autorise la comparaison).
   * Renvoie { info: { code, name, read }, cands }.
   */
  // zones de lecture (fractions de la carte) : le code, tout petit, en bas à droite (vraies photos d'Arnaud : il n'est lu
  // qu'en bande serrée et très agrandie) ; puis le bas de la carte et le nom
  // (deux bandes serrées décalées : le code n'est pas au même endroit sur un Leader, qui a la case « VIE » à droite)
  const CODE_ZONES = [[0.94, 0.97, 8, 'sharp', 0.74, 0.9], [0.94, 0.97, 8, 'otsu', 0.74, 0.9], [0.94, 0.975, 8, 'sharp', 0.62, 0.86], [0.935, 0.985, 7, 'sharp', 0.6, 0.95]];
  const NAME_ZONES = [[0.9, 1, 4, 'sharp', 0.5, 1], [0.86, 1, 3, 'sharp', 0, 1], [0.72, 0.9, 2.5, 'sharp', 0.08, 0.92], [0.72, 0.9, 2.5, 'invert', 0.08, 0.92]];
  /** Autres cadrages d'une photo (carte mal recadrée : le cadre jaune a pris l'intérieur d'une carte à bordure jaune) */
  async function otherCrops(orig) {
    const out = [];
    try {
      const bmp = await createImageBitmap(orig), k = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      const r = App.recognizer.cutCard(c, { x: 0.02, y: 0.02, w: 0.96, h: 0.96 }); // bords de la carte
      if (r) out.push({ blob: await new Promise((res) => r.canvas.toBlob(res, 'image/jpeg', 0.92)), zones: CODE_ZONES });
      // la photo entière (carte qui la remplit presque) : on ne sait pas où est le bas de la carte → bandes qui glissent sur le bas
      out.push({ blob: await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.9)), zones: SLIDE_ZONES });
    } catch (e) { console.warn(e); }
    return out.filter((x) => x.blob);
  }
  // (bandes serrées et très agrandies : une bande large, avec le texte voisin, ne lit pas le code)
  const SLIDE_ZONES = [0.8, 0.83, 0.86, 0.89, 0.92, 0.95].map((y) => [y, y + 0.035, 8, 'sharp', 0.72, 0.92]);
  async function recognize(blob, statusFn = () => {}, { setId = '', original = null } = {}) {
    const R = App.recognizer;
    statusFn('Lecture du code de la carte…');
    const texts = await R.readZones(blob, [...CODE_ZONES, ...NAME_ZONES]);
    let read = texts.map(codesIn);
    // rien lu sur la carte recadrée : le code est cherché sur d'autres cadrages de la photo d'origine
    if (original && !read.some((r) => r.codes.length)) {
      statusFn('Lecture du code (autre cadrage)…');
      for (const alt of await otherCrops(original)) {
        const t = await R.readZones(alt.blob, alt.zones); texts.push(...t); read.push(...t.map(codesIn));
        if (read.some((r) => r.codes.length)) break;
      }
    }
    if (!read.some((r) => r.codes.length)) { statusFn('Lecture de toute la carte…'); const [full] = await R.readZones(blob, ['full']); texts.push(full); read.push(codesIn(full)); }
    const votes = {}, numsRead = new Set();
    for (const r of read) { for (const [c, w] of r.codes) votes[c] = (votes[c] || 0) + w; for (const n of r.nums) numsRead.add(n); }
    const idx = await index();
    const exists = (c) => idx.fr.cards[c] || idx.en.cards[c];
    let codes = Object.keys(votes).filter(exists).sort((a, b) => votes[b] - votes[a]);
    if (codes.length) codes = codes.filter((c) => votes[c] >= votes[codes[0]] * 0.5); // les lectures nettement moins probables sont écartées
    // carte DON!! (« CARTE DON!! », « Votre tour +1000 ») : pas de code, absente des listes de Bandai → on le dit au lieu de proposer n'importe quoi
    // (pas « DON!! » seul : le texte de beaucoup de cartes parle de « cartes DON!! »)
    if (!codes.length && /CARTE\s*D[O0]N\s*!|votre\s+tour\s*\+\s*1\s*[0O]\s*[0O]\s*[0O]/i.test(texts.join('\n'))) {
      return { info: { code: '', name: '', don: true, read: 'carte DON!!' }, cands: [] };
    }
    // nom : chaque ligne lue comparée aux noms connus
    statusFn('Recherche de la carte…');
    const nm = await names(), lines = texts.join('\n').split('\n').map((l) => norm(l)).filter((l) => l.length >= 3);
    let best = { k: '', s: 0 };
    const keys = [...nm.keys()];
    for (const l of lines) for (const k of keys) {
      if (Math.abs(k.length - l.length) > Math.max(3, k.length * 0.4)) continue;
      const s = l === k ? 1 : l.includes(k) && k.length >= 4 ? 0.9 : App.util.similarity(l, k);
      if (s > best.s) best = { k, s };
    }
    const nameOk = best.s >= 0.75 ? best.k : '';
    const nameIds = nameOk ? [...nm.get(nameOk)] : [];
    // le nom vérifie le code : « OP05-004 » lu sur un Shanks alors que Shanks est OP09-004 → les cartes de ce nom au même numéro
    let agreed = false, fixed = false;
    if (nameOk && codes.length) {
      const ok = codes.filter((c) => nameIds.some((id) => baseOf(id) === c));
      if (ok.length) { codes = ok; agreed = true; }
      else {
        const nums = new Set([...codes.map(numOfId), ...numsRead]);
        const alt = [...new Set(nameIds.filter((id) => nums.has(numOfId(id))).map(baseOf))];
        if (alt.length) { codes = alt; fixed = true; }
      }
    }
    let cands = [];
    for (const c of codes.slice(0, 3)) cands.push(...(await byCode(c)).map((x) => ({ ...x, numOk: !fixed, ofOk: !fixed })));
    if (!cands.length && nameOk) {
      // pas de code lu : toutes les cartes de ce nom (celles au numéro lu d'abord, puis la série choisie)
      cands = (await fromIndex(nameIds)).sort((a, b) => ((b.setId === setId) - (a.setId === setId)) || String(b.set.sortKey).localeCompare(String(a.set.sortKey)));
      const byNum = cands.filter((x) => numsRead.has(numOfId(x.id)));
      if (byNum.length) cands = byNum;
    }
    const seen = new Set(); cands = cands.filter((x) => !seen.has(x.id) && seen.add(x.id));
    // comparaison de l'illustration avec la photo (versions parallèles, même personnage ; une seule carte : vérification)
    if (cands.length) {
      statusFn('Comparaison des illustrations…');
      const pool = cands.slice(0, codes.length ? 40 : 24); // sans code : les 24 premières (série choisie d'abord)
      // visuel en petit (160 px) : empreinte identique, téléchargement 4 fois plus léger
      const thumb = (c) => img.card(c, 'low').replace('&w=360', '&w=160');
      const vis = await R.resemblanceMany(blob, pool, thumb).catch(() => new Map());
      // code lu mais aucune illustration ne ressemble (« OP12-050 » lu sur OP12-030) : les autres cartes du même nom sont comparées aussi
      if (codes.length && nameOk && !agreed && Math.max(0, ...vis.values()) < 0.55) { // (pas si le nom confirme déjà le code : coûteux, visuels à télécharger)
        const extra = (await fromIndex(nameIds)).filter((x) => !seen.has(x.id))
          .sort((a, b) => { const pre = codes[0].split('-')[0], p = (x) => (x.id.split('-')[0] === pre ? 1 : 0); return (p(b) - p(a)) || String(b.set.sortKey).localeCompare(String(a.set.sortKey)); }).slice(0, 24); // même série que le code lu d'abord
        for (const x of extra) { seen.add(x.id); cands.push(x); }
        for (const [id, v] of await R.resemblanceMany(blob, extra, thumb).catch(() => new Map())) vis.set(id, v);
      }
      // les autres versions du même numéro que les plus ressemblantes (réimpression au même dessin, parallèle…) sont comparées aussi
      const best3 = [...vis.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => baseOf(id));
      const more = [];
      for (const b of new Set(best3)) for (const x of await byCode(b)) if (!vis.has(x.id)) { more.push(x); if (!seen.has(x.id)) { seen.add(x.id); cands.push(x); } }
      if (more.length) for (const [id, v] of await R.resemblanceMany(blob, more, thumb).catch(() => new Map())) vis.set(id, v);
      for (const c of cands) c.visual = vis.has(c.id) ? vis.get(c.id) : null;
      // à ressemblance égale (même dessin), la carte de base d'abord
      // (écart de moins de 0,03 = même dessin, vu à travers la photo)
      cands.sort((a, b) => ((b.setId === setId) - (a.setId === setId)) || (Math.round(((b.visual ?? -1) - (a.visual ?? -1)) * 16)) || (SUFFIX.test(a.id) - SUFFIX.test(b.id)));
    }
    // carte « sûre » : code confirmé (lu deux fois ou par le nom) et, s'il y a plusieurs versions, l'illustration nettement la plus proche
    // (jamais si une autre carte a le même dessin : réimpression « _r1 » d'une autre série)
    // nom lu = nom de la carte : noté comme pour Pokémon (le classeur garde alors la proposition même si l'illustration diffère)
    if (nameOk) for (const x of cands) x.nameScore = norm(x.name) === nameOk ? 1 : 0;
    const top = cands[0], second = cands[1];
    const codeSure = codes.length > 0 && (agreed || (votes[codes[0]] >= 2 && !nameOk));
    const visSure = top && (!second || (top.visual != null && top.visual >= 0.55 && top.visual - (second.visual ?? 0) >= 0.1));
    // (carte retrouvée par l'image alors que le code lu en désignait une autre : sûre seulement si l'illustration ne laisse aucun doute)
    const viaCode = codes.includes(top ? baseOf(top.id) : '');
    if (top && ((codeSure && viaCode && visSure) || ((!codes.length || !viaCode) && top.visual >= (viaCode ? 0.7 : 0.75) && (!second || top.visual - (second.visual ?? 0) >= (viaCode ? 0.12 : 0.15))))) top.confident = true;
    const code = top ? baseOf(top.id) : '';
    // code mal lu mais retrouvé par l'image (« OP05-004 » lu, c'est OP09-004) : on le dit
    const byImg = codes.length && code && !codes.includes(code) && top.visual >= 0.6;
    const readTxt = codes.length ? `code ${byImg ? code : codes[0]}${fixed ? ' (corrigé grâce au nom)' : byImg ? ' (corrigé grâce à l’illustration)' : ''}` : numsRead.size ? `numéro ${[...numsRead][0]}` : '';
    return { info: { code, name: nameOk, votes, read: [readTxt, nameOk ? `nom « ${nameOk} »` : ''].filter(Boolean).join(', ') }, cands: cands.slice(0, 40) };
  }

  // ---------- Images ----------
  const img = {
    // carte possédée dans l'autre langue : visuel du site de cette langue (français en .webp, anglais en .png)
    // le site de Bandai interdit d'afficher ses images ailleurs (Cross-Origin-Resource-Policy: same-site) :
    // elles passent par le relais images.weserv.nl, qui les réduit aussi (360 px, 720 en grand) et autorise CORS
    card: (c, q = 'low') => {
      let u = (c && c.image) || '';
      if (!u) return '';
      if (c.lang === 'en' && /\/\/fr\./.test(u)) u = u.replace('//fr.', '//en.').replace(/\.webp(\?|$)/, '.png$1');
      else if (c.lang === 'fr' && /\/\/en\./.test(u)) u = u.replace('//en.', '//fr.').replace(/\.png(\?|$)/, '.webp$1');
      if (!/^https:\/\/(fr|en)\.onepiece-cardgame\.com\//.test(u)) return u;
      return `https://images.weserv.nl/?url=${encodeURIComponent(u.replace(/^https:\/\//, '').replace(/\?.*$/, ''))}&w=${q === 'high' ? 720 : 360}&output=webp`;
    },
    // visuel officiel du produit (pochette du booster, boîte du deck) : …/products/boosters/op09/img_item01.webp
    // dans la langue de la série, sinon en anglais (« default » du relais) ; les produits les plus récents ont une autre adresse
    // → introuvable : le code de la série en gros (setLogo)
    logo: (s) => {
      if (!s || !s.id || s.id === 'PROMO' || s.id === 'AUTRES') return '';
      const dir = s.id.toLowerCase().replace(/^([a-z]+)-(\d)/, '$1$2'), kind = /^ST-/.test(s.id) ? 'decks' : 'boosters';
      const path = (h) => `${h}.onepiece-cardgame.com/renewal/images/products/${kind}/${dir}/img_item01.webp`;
      const first = langFor(s.id) === 'en' ? 'en' : 'fr';
      // (« default » renvoie vers cette adresse : elle doit passer elle aussi par le relais, Bandai bloquant l'affichage direct)
      const via = (h) => `https://images.weserv.nl/?url=${encodeURIComponent(path(h))}&trim=12&h=240&output=webp`;
      return `${via(first)}&default=${encodeURIComponent(via(first === 'fr' ? 'en' : 'fr'))}`;
    },
    symbol: () => '',
  };
  const cm = (q) => `https://www.cardmarket.com/fr/OnePiece/Products/Search?searchString=${encodeURIComponent(q)}`;

  App.games.register('onepiece', {
    id: 'onepiece',
    name: 'One Piece',
    listSets, getSet, getCard, langFor, setLanguages, setLangFor, search, versions, byCode, setIdsByName, price, tpMarket, img, recognize,
    cardmarketUrl: (card) => cm(String(card.id || '').replace(SUFFIX, '') || card.name),
    boosterUrl: (set) => cm(set.name.replace(/^.*·\s*/, '') + ' booster'),
    isOfficial: (localId, set) => isOfficialIn(String(localId).replace(/ ([PR])(\d+)$/, (m, k, n) => `_${k.toLowerCase()}${n}`), set.id),
    numLabel: (card) => card.localId,
    logoText: (s) => (s.id === 'PROMO' ? 'Promos' : s.id === 'AUTRES' ? 'Autres' : s.id),
    priceNote: 'Prix : marché américain TCGplayer (cartes anglaises), converti en euros, mise à jour quotidienne.',
    rarity,
    pullRates: () => null,
    source: { name: 'Bandai (via Punk Records)', url: 'https://fr.onepiece-cardgame.com/cardlist/' },
    noVisualMatch: true, // visuels officiels sans CORS : pas de comparaison d'images possible
  });
})();
