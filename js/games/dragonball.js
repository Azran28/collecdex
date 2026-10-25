/*
 * Adaptateur Dragon Ball Super Card Game (v3.68, 9ᵉ licence, Bandai ; le jeu « Masters », pas Fusion World).
 * Cartes : data/db-cartes.json, préparé depuis le site officiel de Bandai (www.dbs-cardgame.com/europe-fr/cartes/ : noms, raretés,
 * types, couleurs EN FRANÇAIS) et TCGplayer (noms anglais, dates, n° de produit, sachets) par outils/ci/dragonball-cartes.mjs, remis à
 * jour chaque lundi par le robot de l'index. Les textes des cartes (lourds) sont à part : data/db-textes.json, lus par la fiche.
 * Visuels : images officielles françaises (…/europe-fr/images/cartes/cardimg/BT22-083.png, 260 × 364, pas de CORS) relayées par
 * images.weserv.nl (qui autorise la lecture des pixels : vérification par l'image).
 * Prix : marché TCGplayer (en $), préparé chaque jour par le robot de mise en ligne (data/db-prix.json, outils/ci/prix-dragonball.mjs).
 * Identifiant d'une carte = son numéro imprimé en minuscules : « bt22-083 » (Son Gohan, Coup imprévu, BT22-083 R) ; versions à part
 * « bt22-009_spr » (Special Rare), « bt22-140_gdr » (God Rare), « bt22-054_pr » (promo) ; promos « p-001 », decks « sd23-01 ».
 * Leaders : une seule carte (recto, et verso « éveillé » dans la fiche).
 */
(() => {
  const DAY = 24 * 3600 * 1000;
  const { norm } = App.util;

  // ---------- Données (fichier du site, gardé en cache : utilisable hors ligne ; relu à chaque nouvelle version du site) ----------
  const cached = (key, url) => {
    let p = null;
    return () => p || (p = (async () => {
      const hit = await App.db.get('cache', key).catch(() => null);
      if (hit && hit.ver === window.APP_VERSION && Date.now() - hit.t < 3 * DAY) return hit.v;
      try {
        const r = await fetch(url, { cache: 'no-cache' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const v = await r.json();
        await App.db.set('cache', key, { t: Date.now(), ver: window.APP_VERSION, v }).catch(() => {});
        return v;
      } catch (e) {
        if (hit) { console.warn('Réseau indisponible, données en cache utilisées', e); return hit.v; }
        p = null;
        throw e;
      }
    })());
  };
  const index = cached('db1:index', 'data/db-cartes.json');
  const textsAll = cached('db1:textes', 'data/db-textes.json');

  // ---------- Raretés (sigle imprimé après le numéro : « BT22-083 R ») ----------
  // clé → [rang, nom FR, sigle, couleur]
  const RAR = {
    c: [1, 'Commune', 'C', '#a9b0ba'], uc: [2, 'Peu commune', 'UC', '#5fb86a'], r: [3, 'Rare', 'R', '#5aa0e0'], st: [3, 'Rare de deck', 'ST', '#5aa0e0'],
    sr: [4, 'Super Rare', 'SR', '#9b6ef0'], ex: [4, 'Expansion Rare', 'EX', '#9b6ef0'], pr: [4, 'Promo', 'PR', '#e07a5f'], cr: [5, 'Concept Rare', 'CR', '#e8b923'],
    spr: [6, 'Special Rare', 'SPR', '#e8b923'], spr_s: [7, 'Special Rare (version spéciale)', 'SPR', '#e8b923'], slr: [7, 'Special Leader Rare', 'SLR', '#e8b923'],
    scr: [8, 'Secret Rare', 'SCR', '#e94f64'], gdr: [9, 'God Rare', 'GDR', '#ff9f1c'],
    dr: [7, 'Destruction Rare', 'DR', '#e8b923'], dpr: [7, 'Duo Power Rare', 'DPR', '#e8b923'], dar: [7, 'Destroyer & Angel Rare', 'DAR', '#e8b923'],
    dbr: [8, 'Dragon Ball Rare', 'DBR', '#ff9f1c'], gfr: [7, 'Giant Force Rare', 'GFR', '#e8b923'], iar: [7, 'Iconic Attack Rare', 'IAR', '#e8b923'],
    isr: [7, 'Infinite Saiyan Rare', 'ISR', '#e8b923'], ivr: [7, 'Ignoble Villain Rare', 'IVR', '#e8b923'], nhr: [7, 'Noble Hero Rare', 'NHR', '#e8b923'],
    rlr: [7, 'Reboot Leader Rare', 'RLR', '#e8b923'], sgr: [7, 'Son Gohan Rare', 'SGR', '#e8b923'],
  };
  const rkey = (r) => (RAR[r] ? r : Object.keys(RAR).find((k) => norm(RAR[k][1]) === norm(r) || norm(RAR[k][2]) === norm(r)) || null);
  const rarity = {
    key: (r) => rkey(r),
    rank: (r) => { const k = rkey(r); return k ? RAR[k][0] : 3; },
    label: (r) => { const k = rkey(r); return k ? RAR[k][1] : (r || 'Inconnue'); },
    symbol: (r) => {
      const k = rkey(r), esc = App.util.esc;
      const lab = esc(k ? RAR[k][1] : (r || '?'));
      return `<span class="rar" title="${lab}"><span class="rar-txt" style="background:${k ? RAR[k][3] : '#b9c0d4'}">${esc(k ? RAR[k][2] : String(r || '?').slice(0, 6).toUpperCase())}</span></span>`;
    },
    css: (r) => { const k = rkey(r); return k ? RAR[k][3] : '#b9c0d4'; },
  };
  // normale et / ou brillante : d'après TCGplayer (vf « hn », « h », « n ») ; inconnu → communes, peu communes et rares dans les deux, le reste brillant
  const variantsOf = (k) => {
    const v = k.vf || (['c', 'uc', 'r'].includes(k.r) ? 'hn' : 'h');
    return { ...(v.includes('n') ? { normal: true } : {}), ...(v.includes('h') ? { holo: true } : {}) };
  };

  // ---------- Séries ----------
  const GROUPS = {
    main: { id: 'db-main', name: 'Boosters', order: 1 }, deck: { id: 'db-deck', name: 'Decks et coffrets', order: 2 }, promo: { id: 'db-promo', name: 'Promos', order: 3 },
  };
  const TYPE = { le: 'Leader', ba: 'Combat', ex: 'Extra', un: 'Unisson' };
  const COLOR = { r: 'Rouge', b: 'Bleu', v: 'Vert', j: 'Jaune', n: 'Noir', w: 'Blanc' };

  let memo = null;
  async function data() {
    const idx = await index();
    if (memo && memo.idx === idx) return memo;
    const byId = new Map(), bySet = new Map(), setKey = new Map(), byNum = new Map();
    for (const k of idx.cards) {
      byId.set(k.id, k); if (!bySet.has(k.s)) bySet.set(k.s, []); bySet.get(k.s).push(k);
      const [num, suf] = k.id.slice(k.s.length + 1).split('_');
      const key = `${k.s}|${parseInt(num, 10)}${suf ? '|' + suf.replace(/\d+$/, '').toUpperCase() : ''}`;
      if (!byNum.has(key)) byNum.set(key, k);
    }
    const sets = idx.sets.filter((s) => bySet.has(s.id)).map((s) => {
      const list = bySet.get(s.id);
      setKey.set(s.id, s.id);
      return {
        id: s.id, name: s.name, en: s.en, logo: '', symbol: '', releaseDate: s.date, sortKey: s.date || `9999-${s.id}`, type: s.type, max: s.max || 0,
        total: list.length, official: s.max ? list.filter((k) => isOfficialIn(k.l, s.max)).length : list.length, group: GROUPS[s.type] || GROUPS.main,
      };
    });
    memo = { idx, byId, bySet, setKey, byNum, sets };
    return memo;
  }
  const isOfficialIn = (localId, max) => /^\d{2,3}$/.test(String(localId)) && +localId >= 1 && (!max || +localId <= max);
  async function listSets() {
    const { sets } = await data();
    return sets.map(({ en, type, max, ...s }) => s);
  }

  // ---------- Cartes ----------
  const cmp = (a, b) => (parseInt(a.l, 10) - parseInt(b.l, 10)) || String(a.l).localeCompare(String(b.l));
  const setShape = (s) => ({ id: s.id, name: s.name, logo: '', symbol: '', releaseDate: s.releaseDate, sortKey: s.sortKey, cardCount: { total: s.total, official: s.official }, serie: s.group });
  const IMG = 'https://www.dbs-cardgame.com/europe-fr/images/cartes/cardimg/';
  // cartes couchées (le site les montre en largeur, avec des marges blanches) : toutes les Extra Z, et ces Extras (mesuré sur les 7 245 visuels, oct. 2026)
  const LAND = new Set(['bt17-149', 'eb1-68', 'p-270', 'p-271']);
  const codeOf = (k) => (k.img || k.id.toUpperCase()).replace(/_.*$/, '');
  /** Code imprimé en bas à droite : « BT22-083 R », « BT22-009 SPR », « P-001 PR » */
  const printed = (k) => { const k2 = rkey(k.r); return `${codeOf(k)}${k2 ? ' ' + RAR[k2][2] : ''}`; };
  function normCard(k, s, text = null) {
    const t = TYPE[k.t] || '';
    const facts = [t ? `${t}${k.z ? ' Z' : ''}` : '', (k.c || []).map((c) => COLOR[c] || c).join(' / '), k.co != null ? `Coût ${k.co}` : '', k.p ? `Puissance ${k.p}` : '',
      k.cp ? `Combo +${k.cp}` : '', k.ch ? `Personnage : ${k.ch}` : '', k.tr ? `Origine : ${k.tr}` : '', k.er ? `Ère : ${k.er}` : '',
      `Code ${printed(k)}`, k.b ? `Version de la carte ${k.b.toUpperCase()}` : ''].filter(Boolean);
    let x = '';
    if (text) { const v = text[k.id] || (k.b && text[k.b]) || ''; x = Array.isArray(v) ? `${v[0]}${v[1] ? `\n\nÉveillé${k.bn ? ` (${k.bn})` : ''}${k.bp ? `, puissance ${k.bp}` : ''} :\n${v[1]}` : ''}` : v; }
    const ver = k.b ? ` (${String(k.l).split(' ').slice(1).join(' ')})` : '';
    return {
      id: k.id, localId: k.l, name: k.n + ver, baseName: k.n, nameEn: k.ne ? k.ne + ver : '', backName: k.bn || '',
      landscape: k.t === 'ex' && (!!k.z || LAND.has(k.id)), code: printed(k), version: k.b ? String(k.l).split(' ').slice(1).join(' ') : '', image: IMG + (k.img || k.id.toUpperCase()) + '.png',
      rarity: k.r || '', variants: variantsOf(k), category: t, kind: k.t || '', zone: !!k.z, types: [], facts, text: x, illustrator: '',
      colors: k.c || [], cost: k.co ?? null, power: k.p || 0, combo: k.cp || 0, backPower: k.bp || 0, character: k.ch || '', traits: k.tr || '', era: k.er || '', base: k.b || '',
      tp: k.tp || 0, setId: s.id, serieId: s.group.id, alt: !!k.b || s.group.id !== 'db-main',
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

  // ---------- Prix (TCGplayer, préparés par le robot : data/db-prix.json = { m: date, p: { n° de produit TCGplayer: [normal, brillant] } }) ----------
  const ONLINE = 'https://azran28.github.io/collecdex/data/db-prix.json';
  let pricesP = null;
  const prices = () => pricesP || (pricesP = (async () => {
    const hit = await App.db.get('cache', 'db1:prix').catch(() => null);
    const full = hit && hit.v && hit.v.p && Object.keys(hit.v.p).length;
    if (hit && Date.now() - hit.t < (full ? DAY / 2 : 15 * 60 * 1000)) return hit.v;
    for (const u of ['data/db-prix.json', ONLINE]) {
      const r = await fetch(u, { cache: 'no-cache' }).catch(() => null);
      const v = r && r.ok ? await r.json().catch(() => null) : null;
      if (v && v.p && Object.keys(v.p).length) { await App.db.set('cache', 'db1:prix', { t: Date.now(), v }).catch(() => {}); return v; }
    }
    if (full) return hit.v;
    await App.db.set('cache', 'db1:prix', { t: Date.now(), v: { m: '', p: {} } }).catch(() => {});
    return { m: '', p: {} };
  })().finally(() => setTimeout(() => { pricesP = null; }, 60000)));
  async function getCard(id) {
    id = String(id).toLowerCase();
    const D = await data(), k = D.byId.get(id);
    if (!k) throw new Error('Carte inconnue : ' + id);
    const s = D.sets.find((x) => x.id === k.s) || { id: k.s, name: k.s, group: GROUPS.main, releaseDate: '', sortKey: '', total: 0, official: 0 };
    const [P, T] = await Promise.all([prices().catch(() => ({ p: {} })), textsAll().catch(() => null)]);
    const p = k.tp ? (P.p || {})[k.tp] : null;
    return {
      ...normCard(k, s, T),
      set: setShape(s),
      pricing: p && (p[0] || p[1]) ? { tcgplayer: { normal: p[0] || null, holo: p[1] || null }, updated: P.m || '' } : null,
    };
  }
  const tpMarket = (tp, variant) => (tp ? (variant === 'holo' ? tp.holo || tp.normal : tp.normal || tp.holo) || null : null);
  function price(card, variant) {
    const tp = card && card.pricing && card.pricing.tcgplayer;
    const v = tpMarket(tp, variant || (card && card.variants && !card.variants.normal ? 'holo' : 'normal'));
    return v > 0 ? { value: v, unit: 'USD', source: 'TCGplayer', updated: card.pricing.updated, raw: tp } : null;
  }

  // ---------- Recherche ----------
  // (« bt22-031#b » = verso éveillé d'un leader, dans la base d'images : la carte, avec le visuel de son verso)
  async function fromIds(ids) {
    const D = await data(), out = [];
    for (const id0 of ids) {
      const [id, face] = String(id0).split('#');
      const k = D.byId.get(id); if (!k) continue;
      const s = D.sets.find((x) => x.id === k.s); if (!s) continue;
      const c = { ...normCard(k, s), set: setShape(s) };
      if (face === 'b' && k.bk) { c.image = c.image.replace(/\.png$/, '_b.png'); c.face = 'b'; }
      out.push(c);
    }
    return out;
  }
  /** La carte d'un numéro dans une série (« BT22 », « 83 » ; version « SPR » en plus si lue) */
  async function byCode(setId, num, suf = '') {
    const D = await data(), sid = String(setId).toUpperCase(), n = parseInt(String(num).replace(/\D/g, ''), 10);
    const k = (suf && D.byNum.get(`${sid}|${n}|${String(suf).toUpperCase()}`)) || D.byNum.get(`${sid}|${n}`);
    return k ? fromIds([k.id]) : [];
  }
  async function search({ name }) {
    const q = norm(name); if (!q) return [];
    const D = await data();
    const c = codesIn(name);
    if (c.length) { const [s, n, suf] = c.sort((a, b) => b[1] - a[1])[0][0].split('|'); const r = await byCode(s, n, suf); if (r.length) return r; }
    if (D.byId.has(String(name).trim().toLowerCase())) return fromIds([String(name).trim().toLowerCase()]);
    const ids = [];
    for (const k of D.idx.cards) if (norm(k.n).includes(q) || (k.ne && norm(k.ne).includes(q)) || (k.bn && norm(k.bn).includes(q))) ids.push(k.id);
    // (même nom dans plusieurs séries : les plus récentes d'abord, la version normale avant les autres)
    const date = new Map(D.sets.map((s) => [s.id, s.sortKey]));
    ids.sort((a, b) => String(date.get(D.byId.get(b).s)).localeCompare(String(date.get(D.byId.get(a).s))) || (!!D.byId.get(a).b - !!D.byId.get(b).b));
    return fromIds(ids.slice(0, 300));
  }
  /** Séries dont le nom ou le code correspond (« Critical Blow », « BT22 », « DBS-B22 », « Zenkai Series Set 05 ») — import d'un fichier */
  async function setIdsByName(name) {
    const q = norm(String(name).replace(/^dragon\s*ball(\s*super)?(\s*(card\s*game|ccg|tcg))?\s*[-:–]?\s*/i, '')); if (!q) return [];
    const sets = (await data()).sets;
    const m = String(name).toUpperCase().match(/\b(?:DBS-)?(BT|B|TB|DB|SD|XD|EB|EX)-?0?(\d{1,2})\b/);
    if (m) { const id = (m[1] === 'B' ? 'BT' : m[1]) + (m[1] === 'EX' ? m[2].padStart(2, '0') : String(+m[2])); if (sets.some((s) => s.id === id)) return [id]; }
    const names = (s) => [s.id, s.name, s.en || ''].map(norm);
    const exact = sets.filter((s) => names(s).includes(q));
    return (exact.length ? exact : sets.filter((s) => names(s).some((n) => n && n.length > 3 && (n.includes(q) || q.includes(n))))).map((s) => s.id);
  }
  async function versions(name) {
    const n = norm(name);
    return (await search({ name })).filter((c) => norm(c.baseName) === n || norm(c.name) === n || norm(c.nameEn) === n);
  }
  /** Noms des cartes (français, anglais, verso des leaders) : nom normalisé → ids */
  let namesMemo = null;
  async function names() {
    const D = await data();
    if (namesMemo && namesMemo.D === D) return namesMemo.m;
    const m = new Map();
    const add = (x, id) => { const key = norm(x); if (key.length < 3) return; if (!m.has(key)) m.set(key, new Set()); m.get(key).add(id); };
    for (const k of D.idx.cards) { add(k.n, k.id); if (k.ne) add(k.ne, k.id); if (k.bn) add(k.bn, k.id); }
    namesMemo = { D, m };
    return m;
  }

  // sachet de booster de chaque série (produit TCGplayer) : [produit, largeur, hauteur de l'image _400w, zone du sachet x0, y0, x1, y1],
  // mesurée sur l'image (pixels pas blancs, oct. 2026). Sans mesure (sachet qui remplit l'image) : image entière (`pk` du robot).
  const PACKS_CROP = {
    BT3: [155553, 400, 400, 79, 1, 323, 398], BT4: [162383, 400, 400, 78, 0, 322, 400], BT5: [175551, 400, 400, 77, 0, 322, 400], BT6: [184048, 400, 450, 66, 6, 335, 444],
    BT9: [206232, 400, 450, 63, 2, 336, 448], BT11: [220349, 256, 377, 13, 0, 248, 376], BT12: [228830, 324, 340, 56, 0, 265, 339], BT13: [234491, 400, 450, 79, 1, 319, 448],
    BT14: [242460, 400, 580, 53, 62, 338, 523], BT15: [248240, 400, 580, 45, 36, 353, 541], BT19: [450259, 400, 400, 82, 9, 318, 391], BT22: [496529, 400, 400, 88, 18, 312, 382],
    BT23: [505879, 400, 400, 75, 1, 325, 400], BT24: [519030, 400, 400, 85, 11, 316, 387], BT29: [669274, 400, 400, 71, 0, 331, 400], BT30: [682047, 400, 400, 78, 0, 323, 400],
    BT31: [693635, 400, 400, 79, 0, 321, 400], TB1: [162381, 400, 450, 64, 2, 337, 449], DB2: [210867, 400, 400, 79, 3, 319, 395], DB3: [224162, 225, 353, 9, 7, 218, 346],
    EB1: [228920, 400, 400, 94, 23, 310, 373],
  };
  const NO_PACK = new Set();

  // ---------- Images ----------
  // (le site de Bandai ne permet pas de lire les pixels depuis une page : relais images.weserv.nl, qui l'autorise et les donne en webp)
  // carte Extra Z (imprimée couchée : le site la montre en largeur, avec des marges blanches) : marges retirées et tournée d'un quart
  // de tour vers la droite par le relais, comme elle est rangée debout dans un classeur (titre à droite, photo 16 d'Arnaud)
  const relay = (u, land) => `https://images.weserv.nl/?url=${encodeURIComponent(u.replace(/^https:\/\//, ''))}${land ? '&trim=20&ro=90' : ''}&output=webp`;
  const img = {
    card: (c) => { const u = (c && c.image) || ''; return u.startsWith(IMG) ? relay(u, c.landscape) : u; },
    logo: (s) => { const p = s && PACKS_CROP[s.id], pk = p ? p[0] : s && !NO_PACK.has(s.id) && memo && (memo.idx.sets.find((x) => x.id === s.id) || {}).pk; return pk ? `https://tcgplayer-cdn.tcgplayer.com/product/${pk}_400w.jpg` : ''; },
    logoCrop: (s) => { const p = s && PACKS_CROP[s.id]; return p ? { W: p[1], H: p[2], x0: p[3], y0: p[4], x1: p[5], y1: p[6] } : null; },
    symbol: () => '',
  };
  const cm = (q) => `https://www.cardmarket.com/fr/DragonBallSuper/Products/Search?searchString=${encodeURIComponent(q)}`;

  // ---------- Reconnaissance d'une photo ----------
  // le code est imprimé en bas à droite, après le logo de la série : « BT22-083 R » (série, numéro, rareté), « BT22-009 SPR »,
  // decks « SD23-01 ST », promos « P-001 PR », coffrets « EX21-05 EX ».
  const ALT = { O: '0', D: '0', Q: '0', U: '0', I: '1', L: '1', '|': '1', T: '1', J: '1', S: '5', Z: '2', B: '8', G: '6' };
  const fix = (s) => [...s].map((ch) => (/\d/.test(ch) ? ch : ALT[ch] || '')).join('');
  // (« 8T22-083 », « 8722-031 » (leader au verso), « BT22-O83 », « BT 22 - 083 » ; « P-001 » seulement suivi de PR, sinon trop court pour être sûr)
  const codeRe = () => /(?<![A-Z0-9])(BT|8T|B7|87|TB|T8|DB|D8|SD|5D|XD|EB|E8|EX)\s*([0-9OILDQSZ|]{1,2})\s*[-‐–—~_.]\s*([0-9OILDQSZB|]{2,3})(?:\s*(SPR|SCR|GDR|SLR|SR|UC|ST|EX|PR|C|R)\b)?|(?<![A-Z0-9])P\s*[-‐–—]\s*([0-9OILDQSZB|]{3})\s*(PR)\b/g;
  const PRE = { '8T': 'BT', B7: 'BT', 87: 'BT', T8: 'TB', D8: 'DB', '5D': 'SD', E8: 'EB' };
  /** Codes lus (« BT22|83 », « BT22|9|SPR », avec un poids) ; rien sur un numéro Pokémon (« 25/165 ») ni One Piece (« OP09-004 ») */
  function codesIn(text) {
    const out = [], T = String(text || '').toUpperCase().replace(/[‐-―]/g, '-');
    for (const m of T.matchAll(codeRe())) {
      let set, num, rar;
      if (m[5]) { set = 'P'; num = parseInt(fix(m[5]), 10); rar = 'PR'; }
      else {
        const pre = PRE[m[1]] || m[1], sn = parseInt(fix(m[2]), 10);
        if (!(sn >= 1)) continue;
        set = pre === 'EX' ? `EX${String(sn).padStart(2, '0')}` : `${pre}${sn}`;
        num = parseInt(fix(m[3]), 10); rar = m[4] || '';
      }
      if (!(num >= 1)) continue;
      if (memo && !memo.setKey.has(set)) continue;
      const suf = /^(SPR|GDR)$/.test(rar) ? rar : '';
      const key = suf && memo && memo.byNum.has(`${set}|${num}|${suf}`) ? `${set}|${num}|${suf}` : `${set}|${num}`;
      if (memo && !memo.byNum.has(key)) continue;
      // rareté lue juste après le numéro, et celle de la carte : sûr ; série lue de travers (« 8T ») : un peu moins
      const k = memo && memo.byNum.get(key), r = k && rkey(k.r);
      let w = rar ? (r && RAR[r][2] === rar ? 1 : 0.8) : 0.85;
      if (m[1] && PRE[m[1]]) w *= 0.85;
      out.push([key, w]);
    }
    return out;
  }
  // zones de lecture (fractions de la carte debout) : code en bas à droite (petit, sous le cadre des caractéristiques), nom en haut
  const OCR_BANDS = [[0.955, 0.99, 0.6, 0.99], [0.945, 0.985, 0.55, 0.99], [0.96, 0.998, 0.6, 0.995]];
  const NAME_BANDS = [[0.025, 0.085, 0.2, 0.95], [0.035, 0.1, 0.2, 0.95]];
  const ZONES = [[0.92, 1, 0.5, 1], [0, 0.13, 0.15, 1]];
  const CODE_ZONES = [[0.95, 0.995, 6, 'sharp', 0.6, 0.99], [0.95, 0.995, 6, 'invert', 0.6, 0.99], [0.94, 1, 5, 'otsu', 0.55, 0.99]];
  const NAME_ZONES = [[0.025, 0.1, 2.5, 'sharp', 0.2, 0.95]];
  // carte Extra Z (couchée, rangée debout : titre à droite) : photo tournée d'un quart de tour vers la gauche → elle se lit en largeur,
  // code en bas à droite, nom en haut
  const T_BANDS = [[0.9, 0.97, 0.6, 0.99], [0.92, 0.99, 0.6, 0.99], [0.03, 0.13, 0.2, 0.9]];
  const T_ZONES = [[0.86, 1, 0.5, 1], [0, 0.16, 0.15, 0.95]];
  async function turned(b) {
    const bmp = await createImageBitmap(b), c = document.createElement('canvas');
    c.width = bmp.height; c.height = bmp.width;
    const g = c.getContext('2d'); g.translate(0, c.height); g.rotate(-Math.PI / 2); g.drawImage(bmp, 0, 0);
    return c;
  }
  async function ocrTexts(b, { land = 'auto' } = {}) {
    const O = App.recognizerParts && App.recognizerParts.codeOcr;
    if (!O) return [];
    const out = [];
    if (land !== true) { const rd = await O.read(b, [...OCR_BANDS, ...NAME_BANDS], { zones: ZONES }).catch(() => null); if (rd) out.push(...rd.texts); }
    if (land === true || (land === 'auto' && !out.some((t) => codesIn(t).length))) {
      const t = await turned(b).catch(() => null);
      const rd = t ? await O.read(t, T_BANDS, { zones: T_ZONES }).catch(() => null) : null;
      if (rd) out.push(...rd.texts);
    }
    return out;
  }
  // meilleur cadre en forme de carte dans la photo (détourage raté), remis à plat — commun : js/games/card-tools.js
  const findCrop = (src) => App.cardTools.findCrop(src);

  // ---------- Vérification par l'image : réseau de neurones + points clés (js/visual.js › check), index data/db-index ----------
  const DB_INDEX_V = 1;
  const IMG_SURE = 30;
  const useVisual = () => App.visual && App.visual.supported() && App.settings.visualCheck !== false;
  const visualOpts = (codes, setId = '') => ({
    index: 'data/db-index', v: DB_INDEX_V, cardsOf: (near) => fromIds(near.map((x) => x.id)), urlOf: (c) => img.card(c),
    twinsOf: async (top) => twinsOf(top), twinKey: (c) => c.id,
    tie: (a, b) => (codes.includes(b.id) - codes.includes(a.id)) || ((b.setId === setId) - (a.setId === setId)) || (a.alt - b.alt),
  });
  /** Même dessin ailleurs : la carte d'origine et ses versions promo (« _PR », souvent la même illustration tamponnée) ; pas les Special / God Rare */
  async function twinsOf(c) {
    const D = await data(), root = c.base || c.id;
    if (!D.byId.has(root) || /_(spr|gdr)/.test(c.id)) return [];
    return fromIds(D.idx.cards.filter((k) => (k.id === root || (k.b === root && !/_(spr|gdr)/.test(k.id))) && k.id !== c.id).map((k) => k.id));
  }
  const cropQuad = (blob, quad) => App.cardTools.cropQuad(blob, quad);
  // coins par l'image gardés seulement s'ils ont la forme d'une carte, perspective retirée (88/63 ± 0,1) — comme Final Fantasy (v3.44)
  const cardShaped = (quad, im) => App.cardTools.cardShaped(quad, im);
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
   * Brillant : PAS mesuré sur la photo (v3.68, comme Star Wars Unlimited) : les visuels officiels n'ont que 260 px de large, la mesure
   * de Final Fantasy (paillettes contre le visuel, card-tools › foilMeasure) n'y est pas fiable → « Ta carte brille ? » est posée.
   */
  const foil = async () => null;

  /**
   * Lit une photo de carte (déjà recadrée) : code imprimé (« BT22-083 R »), nom (titre), puis vérification par l'image.
   * Même déroulé que Star Wars Unlimited (sans les cartes couchées). Renvoie { info: { code, name, read, crop… }, cands }.
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
      let t = crop ? await ocrTexts(crop) : [];
      if (!t.some((x) => codesIn(x).length)) t = [...t, ...(await R.readZones(crop || blob, crop ? CODE_ZONES : [...CODE_ZONES.slice(2), ...(context ? [] : NAME_ZONES)]))];
      texts.push(...t); read.push(...t.map(codesIn));
      if (anyCode() && crop) betterCrop = crop;
    }
    // pas de code lu : la carte cherchée dans la photo elle-même (détourage raté), puis relue — elle sert ensuite à la comparaison
    const nm = await names();
    if (!anyCode()) {
      const hadName = App.cardTools.nameIn(texts, nm);
      for (const src of [...new Set((context ? [blob] : [blob, original]).filter(Boolean))]) { // (classeur : la case seule, pas ses alentours où sont les voisines)
        statusFn('Recherche de la carte dans la photo…');
        const fc = await findCrop(src); if (!fc) continue;
        const t = await ocrTexts(fc), r = t.map(codesIn);
        if (r.some((x) => x.length) || (!hadName && App.cardTools.nameIn(t, nm))) { texts.push(...t); read.push(...r); betterCrop = fc; blob = fc; break; }
      }
    }
    if (original && !context && !anyCode()) {
      statusFn('Lecture du code (autre cadrage)…');
      const t = await R.readZones(original, ['full']).catch(() => []);
      texts.push(...t); read.push(...t.map(codesIn));
    }
    if (!anyCode() && !(context && early)) { statusFn('Lecture de toute la carte…'); const [full] = await R.readZones(blob, ['full']); texts.push(full); read.push(codesIn(full)); }
    // votes : « série|numéro(|version) » → poids ; seuls les codes qui existent comptent
    const votes = {};
    for (const r of read) for (const [c, w] of r) votes[c] = (votes[c] || 0) + w;
    const idOf = (c) => (D.byNum.get(c) || {}).id;
    let codes = Object.keys(votes).filter(idOf).sort((a, b) => votes[b] - votes[a]);
    if (codes.length) codes = codes.filter((c) => votes[c] >= votes[codes[0]] * 0.5);
    statusFn('Recherche de la carte…');
    const best = App.cardTools.bestName(texts, nm, { pairs: true });
    const nameOk = best.s >= 0.8 ? best.k : '';
    const nameIds = nameOk ? [...nm.get(nameOk)] : [];
    let agreed = false;
    let cands = [];
    for (const c of codes.slice(0, 5)) { const id = idOf(c); if (id) cands.push(...(await fromIds([id]))); }
    // (numéro lu sans la version : ses versions Special Rare / promo, au même numéro, derrière — l'image tranche)
    const sib = new Set(); for (const c of codes.slice(0, 2)) { const id = idOf(c); for (const k of D.idx.cards) if (k.b === id) sib.add(k.id); }
    cands.push(...(await fromIds([...sib])));
    const codeIds = new Set(codes.map(idOf).filter(Boolean));
    if (nameOk && cands.length) { const ok = cands.filter((c) => nameIds.includes(c.id)); if (ok.length) agreed = true; }
    // code et nom en désaccord (série ou numéro mal lu) : la carte de ce nom au même numéro, dans une autre série, passe devant
    if (nameOk && cands.length && !agreed) {
      const fx = await App.cardTools.codeFix(nameIds, new Set(codes.map((c) => c.split('|')[1])), fromIds, (c) => String(parseInt(c.localId, 10)));
      if (fx) { cands = [...fx, ...cands]; agreed = true; }
    }
    if (nameOk && !agreed) cands.push(...(await fromIds(nameIds)).sort((a, b) => ((b.setId === setId) - (a.setId === setId)) || (a.alt - b.alt) || String(b.set.sortKey).localeCompare(String(a.set.sortKey))));
    const seen = new Set(); cands = cands.filter((x) => !seen.has(x.id) && seen.add(x.id));
    const rk = (c) => (c.codeFix ? 3 : 0) + (codeIds.has(c.id) ? 2 : 0) + (nameIds.includes(c.id) ? 1 : 0);
    cands.sort((a, b) => rk(b) - rk(a));
    for (const c of cands) { c.numOk = codeIds.has(c.id); c.ofOk = c.numOk; }
    if (cands.length > 1) {
      statusFn('Comparaison des illustrations…');
      const pool = cands.slice(0, 24), vis = await R.resemblanceMany(blob, pool, (c) => img.card(c)).catch(() => new Map());
      for (const c of cands) c.visual = vis.has(c.id) ? vis.get(c.id) : null;
      cands.sort((a, b) => (Math.round(((b.visual ?? -1) - (a.visual ?? -1)) * 16)) || (codeIds.has(b.id) - codeIds.has(a.id)) || (a.alt - b.alt));
      if (cands.some((c) => c.codeFix || codeIds.has(c.id))) cands.sort((a, b) => (rk(b) - rk(a)) || ((b.visual ?? -1) - (a.visual ?? -1)));
    }
    if (nameOk) for (const x of cands) x.nameScore = nameIds.includes(x.id) ? 1 : 0;
    let top = cands[0];
    const second = cands[1];
    // (même numéro qu'une version Special Rare / promo à l'illustration différente : le code seul ne tranche pas sans l'image)
    const hasSib = top && D.idx.cards.some((k) => k.b === top.id || (top.base && (k.id === top.base || k.b === top.base) && k.id !== top.id));
    const codeSure = codes.length > 0 && codeIds.has(top && top.id) && (agreed || votes[codes[0]] >= 1.6) && !hasSib;
    const visSure = top && (!second || (top.visual != null && top.visual >= 0.55 && top.visual - (second.visual ?? 0) >= 0.1) || (codeIds.has(top.id) && !codeIds.has(second.id) && agreed));
    if (top && codeSure && visSure) top.confident = true;
    let orb = null;
    if (!(top && top.confident) && useVisual()) {
      statusFn('Vérification par l’image…');
      const e = early && !cands.length ? await early : null;
      if (e) orb = e;
      else orb = await visualPass(blob, cands, [...codeIds], context, setId).catch((err) => { console.warn('vérification par l’image', err); return null; });
      if (orb) {
        cands = orb.cands;
        // image pas sûre et pas du nom lu : les cartes du nom lu d'abord
        if (nameOk && cands[0] && !cands[0].confident && !nameIds.includes(cands[0].id) && cands.some((c) => nameIds.includes(c.id))) cands = [...cands.filter((c) => nameIds.includes(c.id)), ...cands.filter((c) => !nameIds.includes(c.id))];
        top = cands[0];
      }
      if (top && top.confident && !codeIds.has(top.id) && (top.orb || 0) < IMG_SURE) delete top.confident;
      // même dessin ailleurs (promo) : le code lu sur la carte, confirmé par l'image, tranche
      if (top && !top.confident && codeIds.has(top.id) && (top.orb || 0) >= App.visual.SURE) top.confident = true;
    }
    if (orb && orb.crop) betterCrop = orb.crop;
    const cropLater = !orb && early && top ? early.then((e) => (e && e.crop && e.cands[0] && e.cands[0].id === top.id ? e.crop : null), () => null) : null;
    const codeTxt = (c) => { const k = D.byNum.get(c); return `code ${k ? printed(k) : c}`; };
    const byImg = codes.length && top && !codeIds.has(top.id) && top.orb >= 25;
    const readTxt = codes.length ? `${byImg ? `code ${top.code}` : codeTxt(codes[0])}${byImg ? ' (corrigé grâce à l’illustration)' : ''}` : '';
    if (top) top.foil = await foil(betterCrop || blob, top);
    return { info: { code: top ? top.id : '', name: nameOk, votes, crop: betterCrop, cropLater, ctxQuad: orb && top && orb.cands[0] === top ? orb.ctxQuad : null, orb: orb ? orb.best : null, read: [readTxt, nameOk ? `nom « ${nameOk} »` : '', top && top.orb >= 25 ? 'reconnue à l’image ✓' : ''].filter(Boolean).join(', ') }, cands: cands.slice(0, 40) };
  }

  /** Recherche à la main (nom français ou anglais, ou code « BT22-083 », « BT22 83 »), classée par ressemblance avec la photo */
  async function manual(blob, nameTxt, numTxt) {
    const name = (nameTxt || '').trim(), num = (numTxt || '').trim();
    if (!name && !num) throw new Error('Indique un nom, ou un code (ex. BT22-083)');
    let cands = [];
    const m = num.toUpperCase().match(/^(?:([A-Z]{1,2}\d{0,2})\s*[-\s]\s*)?(\d{1,3})\s*([A-Z]{2,3})?/);
    if (m && m[1]) cands = await byCode(m[1], m[2], m[3] || '');
    else if (m) { const D = await data(); for (const s of D.sets) cands.push(...await byCode(s.id, m[2])); }
    if (!cands.length && name) cands = await search({ name });
    if (num && name) { const n = norm(name), f = cands.filter((c) => norm(c.name).includes(n) || norm(c.nameEn).includes(n)); cands = f.length ? f : await search({ name }); }
    if (blob && cands.length > 1) {
      const pool = cands.slice(0, 24), vis = await App.recognizer.resemblanceMany(blob, pool, (c) => img.card(c)).catch(() => new Map());
      for (const c of pool) c.visual = vis.has(c.id) ? vis.get(c.id) : null;
      cands = [...pool.sort((a, b) => (b.visual ?? -1) - (a.visual ?? -1)), ...cands.slice(24)];
    }
    return cands;
  }

  App.games.register('dragonball', {
    id: 'dragonball',
    name: 'Dragon Ball Super',
    listSets, getSet, getCard, search, versions, byCode, setIdsByName, price, tpMarket, img, recognize, manual, codesIn, names, // (pas de foil() : brillant pas mesurable, voir plus haut)
    texts: textsAll,
    visualIndex: { index: 'data/db-index', v: DB_INDEX_V },
    visualCheck: (blob) => (useVisual() ? visualPass(blob, [], []) : Promise.resolve(null)),
    langFor: () => 'fr',
    printedCode: (c) => c.code || '',
    cardmarketUrl: (card) => cm(card.nameEn ? card.nameEn.replace(/\s*\(.*\)$/, '') : card.baseName || card.name),
    boosterUrl: (set) => cm((set.en || set.name) + ' booster'),
    isOfficial: (localId, set) => isOfficialIn(localId, memo && (memo.sets.find((s) => s.id === set.id) || {}).max),
    logoText: (s) => (s.id === 'P' ? 'Promos' : s.id),
    extraLabel: 'versions Special Rare, God Rare et promos',
    priceNote: 'Prix : marché américain TCGplayer (cartes anglaises), converti en euros, mise à jour quotidienne.',
    rarity,
    pullRates: () => null,
    source: { name: 'Bandai (liste officielle des cartes)', url: 'https://www.dbs-cardgame.com/europe-fr/cartes/' },
  });
})();
