/*
 * Adaptateur Final Fantasy TCG (v3.43, 6ᵉ licence, Square Enix).
 * Cartes : data/ff-cartes.json, préparé depuis la base officielle de Square Enix (fftcg.square-enix-games.com, noms, jobs, textes
 * EN FRANÇAIS) et TCGplayer (dates, n° de produit, promos) par outils/ci/finalfantasy-cartes.mjs, remis à jour chaque lundi par le
 * robot de l'index.
 * Visuels : images officielles françaises (fftcg.cdn.sewest.net, sans CORS) → relayées par images.weserv.nl, comme Lorcana ;
 * promos (absentes de la base officielle) : photo TCGplayer (tcgplayer-cdn, CORS accordé), en anglais.
 * Prix : marché TCGplayer (en $), préparé chaque jour par le robot de mise en ligne (data/ff-prix.json, outils/ci/prix-finalfantasy.mjs),
 * relié à chaque carte par son numéro de produit TCGplayer.
 * Identifiant d'une carte = code imprimé sans la rareté, en minuscules : « 16-006 » (16-006C, Emissaries of Light), « re-006 »
 * (Legacy Collection « Re-006C/16-003C »), « pr-112 » (promo « PR-112/16-067L »), « c-004 » (cristal), « b-001 » (Boss Deck).
 */
(() => {
  const DAY = 24 * 3600 * 1000;
  const { norm } = App.util;

  // ---------- Données (fichier du site, gardé en cache : utilisable hors ligne ; relu à chaque nouvelle version du site) ----------
  let indexP = null;
  const index = () => indexP || (indexP = (async () => {
    const hit = await App.db.get('cache', 'ff1:index').catch(() => null);
    if (hit && hit.ver === window.APP_VERSION && Date.now() - hit.t < 3 * DAY) return hit.v;
    try {
      const r = await fetch('data/ff-cartes.json', { cache: 'no-cache' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const v = await r.json();
      await App.db.set('cache', 'ff1:index', { t: Date.now(), ver: window.APP_VERSION, v }).catch(() => {});
      return v;
    } catch (e) {
      if (hit) { console.warn('Réseau indisponible, données en cache utilisées', e); return hit.v; }
      indexP = null;
      throw e;
    }
  })());

  // ---------- Raretés (lettre imprimée à la fin du code : 16-006C) ----------
  // clé → [rang, nom FR, sigle, couleur]
  const RAR = {
    c:  [1,  'Commune',  'C',  '#a9b0ba'],
    r:  [3,  'Rare',     'R',  '#5aa0e0'],
    h:  [5,  'Héros',    'H',  '#d0874f'],
    l:  [8,  'Légende',  'L',  '#e8b923'],
    s:  [2,  'Starter',  'S',  '#7c8aa8'],
    b:  [6,  'Boss',     'B',  '#8f2d3b'],
    pr: [9,  'Promo',    'PR', 'url(#rbw)'],
    cr: [4,  'Cristal',  'Cr', '#63b6e6'],
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
  // toutes les cartes des boosters existent aussi en brillant (foil) ; promos et cristaux : brillants seulement
  const variantsOf = (k) => (k.r === 'pr' || k.t === 'cr' ? { holo: true } : { normal: true, holo: true });

  // ---------- Séries ----------
  const GROUPS = {
    main: { id: 'ff-main', name: 'Opus et séries', order: 1 }, extra: { id: 'ff-extra', name: 'Collections et cristaux', order: 2 },
    deck: { id: 'ff-deck', name: 'Boss Decks', order: 3 }, promo: { id: 'ff-promo', name: 'Promos', order: 4 },
  };
  const ELEM = { fe: 'Feu', gl: 'Glace', ve: 'Vent', te: 'Terre', fo: 'Foudre', ea: 'Eau', lu: 'Lumière', tn: 'Ténèbres' };
  const TYPE = { av: 'Avant', so: 'Soutien', in: 'Invocation', mo: 'Monstre', cr: 'Cristal' };
  const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV'];

  let memo = null;
  async function data() {
    const idx = await index();
    if (memo && memo.idx === idx) return memo;
    const byId = new Map(), bySet = new Map(), setKey = new Map();
    for (const k of idx.cards) { byId.set(k.id, k); if (!bySet.has(k.s)) bySet.set(k.s, []); bySet.get(k.s).push(k); }
    const sets = idx.sets.filter((s) => bySet.has(s.id)).map((s) => {
      const list = bySet.get(s.id);
      setKey.set(s.id.toLowerCase(), s.id);
      return {
        id: s.id, name: s.name, en: s.en, logo: '', symbol: '', releaseDate: s.date, sortKey: s.date || `9999-${s.id}`, type: s.type,
        total: list.length, official: list.filter((k) => !k.fa).length, group: GROUPS[s.type] || GROUPS.main,
      };
    });
    memo = { idx, byId, bySet, setKey, sets };
    return memo;
  }
  async function listSets() {
    const { sets } = await data();
    return sets.map(({ en, type, ...s }) => s);
  }

  // ---------- Cartes ----------
  const cmp = (a, b) => (+a.l - +b.l) || ((a.fa || 0) - (b.fa || 0)) || String(a.l).localeCompare(String(b.l));
  const setShape = (s) => ({ id: s.id, name: s.name, logo: '', symbol: '', releaseDate: s.releaseDate, sortKey: s.sortKey, cardCount: { total: s.total, official: s.official }, serie: s.group });
  const IMG = 'https://fftcg.cdn.sewest.net/images/cards/full/';
  const imageOf = (k) => (!k.img ? '' : /^tcg:\d+$/.test(k.img) ? `https://tcgplayer-cdn.tcgplayer.com/product/${k.img.slice(4)}_in_1000x1000.jpg` : IMG + k.img);
  function normCard(k, s) {
    const els = (k.e || []).map((x) => ELEM[x] || x);
    const facts = [TYPE[k.t] || '', els.join(' / '), k.co != null ? `Coût ${k.co}` : '', k.p ? `Force ${k.p}` : '', k.j ? `Job : ${k.j}` : '',
      k.ca ? `Catégorie ${k.ca}` : '', k.ex ? 'EX BURST' : '', k.mc ? 'Multi-cartes' : '', k.fa ? 'Version Full Art (texte sur l’illustration)' : '', `Code ${k.c}`,
      k.b ? (k.s === 'PR' ? `Promo de la carte ${k.b}` : `Réimpression de la carte ${k.b}`) : '', k.pe ? `Promo : ${k.pe}` : ''].filter(Boolean);
    return {
      id: k.id, localId: k.fa ? `${k.l} FA` : k.l, name: k.fa ? `${k.n} (Full Art)` : k.n, baseName: k.n, nameEn: k.ne ? (k.fa ? `${k.ne} (Full Art)` : k.ne) : '', code: k.c, version: k.fa ? 'Full Art' : '', fullArt: !!k.fa, image: imageOf(k),
      rarity: k.r, variants: variantsOf(k), category: TYPE[k.t] || '', kind: k.t || '', types: [], facts, text: k.x || '', illustrator: '',
      elements: k.e || [], cost: k.co, power: k.p, job: k.j || '', fcat: k.ca || '', exBurst: !!k.ex, base: k.b || '',
      tp: k.tp || 0, setId: s.id, serieId: s.group.id, alt: k.s === 'Re' || k.s === 'PR' || !!k.fa,
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

  // ---------- Prix (TCGplayer, préparés par le robot : data/ff-prix.json = { m: date, p: { n° de produit TCGplayer: [normal, brillant] } }) ----------
  const ONLINE = 'https://azran28.github.io/collecdex/data/ff-prix.json';
  let pricesP = null;
  const prices = () => pricesP || (pricesP = (async () => {
    const hit = await App.db.get('cache', 'ff1:prix').catch(() => null);
    const full = hit && hit.v && hit.v.p && Object.keys(hit.v.p).length;
    if (hit && Date.now() - hit.t < (full ? DAY / 2 : 15 * 60 * 1000)) return hit.v;
    for (const u of ['data/ff-prix.json', ONLINE]) {
      const r = await fetch(u, { cache: 'no-cache' }).catch(() => null);
      const v = r && r.ok ? await r.json().catch(() => null) : null;
      if (v && v.p && Object.keys(v.p).length) { await App.db.set('cache', 'ff1:prix', { t: Date.now(), v }).catch(() => {}); return v; }
    }
    if (full) return hit.v;
    await App.db.set('cache', 'ff1:prix', { t: Date.now(), v: { m: '', p: {} } }).catch(() => {});
    return { m: '', p: {} };
  })().finally(() => setTimeout(() => { pricesP = null; }, 60000)));
  async function getCard(id) {
    id = String(id);
    const D = await data(), k = D.byId.get(id);
    if (!k) throw new Error('Carte inconnue : ' + id);
    const s = D.sets.find((x) => x.id === k.s) || { id: k.s, name: k.s, group: GROUPS.main, releaseDate: '', sortKey: '', total: 0, official: 0 };
    const P = await prices().catch(() => ({ p: {} })), p = k.tp ? (P.p || {})[k.tp] : null;
    return {
      ...normCard(k, s),
      set: setShape(s),
      pricing: p ? { tcgplayer: { normal: p[0] || null, holo: p[1] || null }, updated: P.m || '' } : null,
    };
  }
  const tpMarket = (tp, variant) => (tp ? (variant === 'holo' ? tp.holo || tp.normal : tp.normal || tp.holo) || null : null);
  function price(card, variant) {
    const tp = card && card.pricing && card.pricing.tcgplayer;
    const v = tpMarket(tp, variant || (card && card.variants && !card.variants.normal ? 'holo' : 'normal'));
    return v > 0 ? { value: v, unit: 'USD', source: 'TCGplayer', updated: card.pricing.updated, raw: tp } : null;
  }

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
  /** La carte d'un numéro dans une série (« 16 », « 6 » / « Re », « PR », « C », « B ») */
  async function byCode(setId, num) {
    const D = await data(), sid = D.setKey.get(String(setId).toLowerCase().replace(/^0+(?=\d)/, '')) || String(setId);
    const n = String(num).replace(/\D/g, '').padStart(3, '0');
    return fromIds((D.bySet.get(sid) || []).filter((k) => k.l === n).map((k) => k.id));
  }
  async function search({ name }) {
    const q = norm(name); if (!q) return [];
    const D = await data();
    const c = codesIn(name);
    if (c.length) { const [s, n] = c.sort((a, b) => b[1] - a[1])[0][0].split('|'); const r = await byCode(s, n); if (r.length) return r; }
    const ids = [];
    for (const k of D.idx.cards) if (norm(k.n).includes(q) || (k.ne && norm(k.ne).includes(q))) ids.push(k.id);
    // (même nom dans plusieurs séries : les plus récentes d'abord)
    const date = new Map(D.sets.map((s) => [s.id, s.sortKey]));
    ids.sort((a, b) => String(date.get(D.byId.get(b).s)).localeCompare(String(date.get(D.byId.get(a).s))));
    return fromIds(ids.slice(0, 300));
  }
  /** Séries dont le nom ou le code correspond (« Opus XIV », « Emissaries of Light », « 16 ») — import d'un fichier */
  async function setIdsByName(name) {
    const q = norm(String(name).replace(/^opus\s+([ivx]+)\s*:.*$/i, 'opus $1')); if (!q) return [];
    const sets = (await data()).sets;
    const names = (s) => [s.id, s.name, s.en || '', /^\d+$/.test(s.id) && +s.id <= 14 ? `opus ${ROMAN[+s.id]}` : '', /^\d+$/.test(s.id) && +s.id <= 14 ? `op${s.id}` : ''].map(norm);
    const exact = sets.filter((s) => names(s).includes(q));
    return (exact.length ? exact : sets.filter((s) => names(s).some((n) => n && n.length > 3 && (n.includes(q) || q.includes(n))))).map((s) => s.id);
  }
  async function versions(name) {
    const n = norm(name);
    return (await search({ name })).filter((c) => norm(c.baseName) === n || norm(c.name) === n || norm(c.nameEn) === n);
  }
  /** Noms des cartes (français et anglais) : nom normalisé → ids */
  let namesMemo = null;
  async function names() {
    const D = await data();
    if (namesMemo && namesMemo.D === D) return namesMemo.m;
    const m = new Map();
    const add = (x, id) => { const key = norm(x); if (key.length < 3) return; if (!m.has(key)) m.set(key, new Set()); m.get(key).add(id); };
    for (const k of D.idx.cards) { if (k.t === 'cr') continue; add(k.n, k.id); if (k.ne) add(k.ne, k.id); }
    namesMemo = { D, m };
    return m;
  }

  // sachet de booster de chaque série (produit TCGplayer) : [produit, largeur, hauteur de l'image _400w, zone du sachet x0, y0, x1, y1],
  // mesurée sur l'image (pixels pas blancs) ; Opus XI et Crystal Dominion : la boîte (sachet sans image / image provisoire chez TCGplayer) ;
  // Legacy Collection : aucune image (403) → son nom. À compléter à chaque nouvelle série (sinon : image entière, `pk` du robot).
  const PACKS_CROP = {
    1: [133424, 400, 696, 23, 26, 385, 680], 2: [133425, 345, 667, 2, 16, 345, 665], 3: [133562, 331, 616, 19, 0, 320, 616], 4: [133563, 400, 450, 94, 3, 308, 440],
    5: [157796, 400, 450, 94, 70, 313, 440], 6: [166602, 400, 450, 94, 6, 306, 443], 7: [176959, 400, 746, 0, 0, 400, 746], 8: [184328, 359, 671, 20, 18, 335, 647],
    9: [191347, 400, 400, 109, 16, 299, 386], 10: [198836, 400, 778, 4, 0, 305, 762], 11: [206226, 400, 360, 26, 37, 334, 333], 12: [220441, 400, 400, 110, 22, 291, 377],
    13: [229217, 400, 399, 104, 9, 296, 385], 14: [233984, 400, 769, 11, 12, 385, 756], 15: [250486, 400, 448, 8, 44, 393, 416], 16: [257582, 321, 626, 4, 2, 316, 616],
    17: [275214, 400, 790, 2, 4, 399, 768], 18: [287168, 400, 400, 110, 9, 294, 383], 19: [477188, 400, 400, 105, 27, 287, 389], 20: [503032, 400, 782, 5, 0, 391, 768],
    21: [509412, 400, 400, 103, 6, 297, 388], 22: [532147, 400, 400, 103, 6, 297, 388], 23: [560111, 400, 763, 13, 8, 387, 750], 24: [588204, 400, 783, 0, 1, 394, 775],
    25: [619248, 306, 555, 14, 3, 294, 550], 26: [629824, 320, 555, 20, 6, 292, 544], 27: [656959, 400, 400, 105, 15, 294, 379], 28: [671545, 400, 693, 50, 12, 380, 672],
    29: [678102, 400, 792, 3, 2, 395, 773],
  };
  const NO_PACK = new Set(['Re']); // (pas d'image chez TCGplayer)

  // ---------- Images ----------
  // visuels officiels français (JPEG 429 × 600, carte entière, coins arrondis) → relais images.weserv.nl (CORS, webp) ;
  // promos : photo TCGplayer (CORS accordé), 400 px ou 1000 px
  const img = {
    card: (c, q = 'low') => {
      const u = (c && c.image) || '';
      if (/^https:\/\/tcgplayer-cdn\.tcgplayer\.com\/product\/\d+_in_1000x1000\.jpg$/.test(u)) return q === 'high' ? u : u.replace('_in_1000x1000', '_400w');
      if (!/^https:\/\/fftcg\.cdn\.sewest\.net\//.test(u)) return u;
      return `https://images.weserv.nl/?url=${encodeURIComponent(u)}${q === 'high' ? '' : '&w=360'}&output=webp`;
    },
    // visuel de la série (v3.45) : son sachet de booster chez TCGplayer (affiché directement : le relais refuse TCGplayer),
    // recadré sur le sachet (le reste de l'image est blanc) ; série sans mesure (nouvelle) : l'image entière (`pk` du robot)
    logo: (s) => { const p = s && PACKS_CROP[s.id], pk = p ? p[0] : s && !NO_PACK.has(s.id) && memo && (memo.idx.sets.find((x) => x.id === s.id) || {}).pk; return pk ? `https://tcgplayer-cdn.tcgplayer.com/product/${pk}_400w.jpg` : ''; },
    logoCrop: (s) => { const p = s && PACKS_CROP[s.id]; return p ? { W: p[1], H: p[2], x0: p[3], y0: p[4], x1: p[5], y1: p[6] } : null; },
    symbol: () => '',
  };
  const cm = (q) => `https://www.cardmarket.com/fr/FinalFantasy/Products/Search?searchString=${encodeURIComponent(q)}`;

  // ---------- Reconnaissance d'une photo ----------
  // le code est imprimé en bas, au milieu, au bout de la dernière ligne du copyright : « 16-006C » (série-numéro + rareté) ;
  // réimpression « Re-006C/16-003C », promo « PR-112/16-067L », cristal « C-004 », Boss Deck « B-001 ».
  const ALT = { O: '0', D: '0', Q: '0', U: '0', I: '1', L: '1', '|': '1', T: '1', J: '1', S: '5', Z: '2', B: '8', G: '6' };
  const fix = (s) => [...s].map((ch) => (/\d/.test(ch) ? ch : ALT[ch] || '')).join('');
  // (« PR- » / « Re- » souvent collé au mot d'avant, dernière ligne du copyright : « FINAL FANTASY VII REMAKEPR-112/16-067L »)
  const codeRe = () => /(?:(?<![A-Z0-9])(C|B|[0-9OIL|ZS]{1,2})|(P[RK]|RE))\s*[-‐–—_~.]\s*([0-9OILDQSZBG|]{3})\s*([CRHLSB])?(?![0-9])/gi;
  /** Codes lus (« 16|006 », « PR|112 », avec un poids) ; rien sur un code Pokémon (« 025/165 ») ni One Piece (« OP09-004 ») */
  function codesIn(text) {
    const out = [], T = String(text || '').toUpperCase().replace(/[‐-―]/g, '-');
    const sets = memo ? memo.setKey : null;
    for (const m of T.matchAll(codeRe())) {
      const rawSet = m[1] || m[2], rawNum = m[3], letter = m[4] || '';
      const num = fix(rawNum);
      if (num.length !== 3) continue;
      let set = /^P[KR]$/.test(rawSet) ? 'PR' : rawSet === 'RE' ? 'Re' : /^[CB]$/.test(rawSet) ? rawSet : String(+fix(rawSet));
      if (set === 'NaN' || set === '0') continue;
      if (sets && !sets.has(set.toLowerCase())) continue;
      // (lettre de rareté lue juste après : c'est bien un code Final Fantasy ; cristal / Boss Deck : « C-004 » seul)
      const exact = /^\d+$/.test(rawSet) && /^\d{3}$/.test(rawNum);
      // « PR-112/16-067L », « Re-006C/16-003C » : la promo / la réimpression, pas la carte d'origine (écrite après la barre)
      const before = T.slice(Math.max(0, m.index - 2), m.index), after = T.slice(m.index + m[0].length, m.index + m[0].length + 2);
      let w = (letter || ((set === 'PR' || set === 'Re') && /^\s*[/|]/.test(after)) ? 1 : 0.75) * (exact || set === 'PR' || set === 'Re' ? 1 : 0.85);
      if (set === 'PR' || set === 'Re') w *= 1.2;
      else if (/[/|]\s*$/.test(before)) w *= 0.5;
      out.push([`${set}|${num}`, w]);
    }
    return out;
  }
  // zones de lecture (fractions de la carte) : bande du bas au milieu (petit texte noir, ou blanc sur les cartes sombres)
  const CODE_ZONES = [[0.935, 0.985, 6, 'sharp', 0.3, 0.7], [0.935, 0.985, 6, 'invert', 0.3, 0.7], [0.925, 0.99, 5, 'otsu', 0.25, 0.75], [0.92, 0.995, 4, 'sharp', 0.2, 0.8]];
  const NAME_ZONES = [[0.025, 0.085, 2.5, 'sharp', 0.2, 0.85], [0.025, 0.085, 2.5, 'invert', 0.2, 0.85]];
  const OCR_BANDS = [0.925, 0.935, 0.945, 0.955].map((y) => [y, y + 0.04, 0.28, 0.72]);
  // v3.46 : le nom en haut aussi (police étroite, souvent sur une illustration sombre : Tesseract n'y lit rien, PaddleOCR « Vayne »)
  const NAME_BANDS = [[0.02, 0.1, 0.15, 0.75]];
  async function ocrTexts(b) {
    const O = App.recognizerParts && App.recognizerParts.codeOcr;
    const rd = O ? await O.read(b, [...OCR_BANDS, ...NAME_BANDS], { zones: [[0.91, 1, 0.2, 0.8], [0, 0.12, 0.1, 0.9]] }).catch(() => null) : null;
    return rd ? rd.texts : [];
  }
  /**
   * v3.46 (Vayne d'Arnaud, carte sombre tenue en main, plusieurs essais « pas reconnue ») : le détourage n'a pas trouvé la carte
   * (bords peu contrastés : note 7 pour un seuil de 10–15) → lecture faite sur toute la photo, où le bas n'est pas le bas de la carte.
   * Ici : meilleur cadre en forme de carte dans la photo (`findCard`, perspective retirée 88/63 ± 0,1, ≥ 12 % de la photo), remis à plat.
   */
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

  // ---------- Vérification par l'image : réseau de neurones + points clés (js/visual.js › check), index data/ff-index ----------
  const FF_INDEX_V = 2;
  const IMG_SURE = 30;
  const useVisual = () => App.visual && App.visual.supported() && App.settings.visualCheck !== false;
  // même dessin dans deux séries (Legacy Collection « Re-006C/16-003C » = 16-003) : le code lu, puis la série de la page, puis l'originale
  const visualOpts = (codes, setId = '') => ({
    index: 'data/ff-index', v: FF_INDEX_V, cardsOf: (near) => fromIds(near.map((x) => x.id)), urlOf: (c) => img.card(c, 'low'),
    twinsOf: async (top) => (top.base ? (await search({ name: top.base })) : []).concat(await reprintsOf(top), await byCode(top.setId, top.localId)), // (+ version Full Art du même code)
    twinKey: (c) => c.id,
    tie: (a, b) => (codes.includes(b.id) - codes.includes(a.id)) || ((b.setId === setId) - (a.setId === setId)) || (a.alt - b.alt),
  });
  /** Réimpressions d'une carte (Legacy Collection) : même dessin, autre code */
  async function reprintsOf(c) {
    const D = await data(), code = String(c.code || '').split('/')[0];
    return fromIds((D.bySet.get('Re') || []).filter((k) => k.b && k.b.toUpperCase() === code.toUpperCase()).map((k) => k.id));
  }
  async function cropQuad(blob, quad) {
    if (!quad || quad.some(([x, y]) => x < -0.06 || x > 1.06 || y < -0.06 || y > 1.06)) return null;
    return App.visual.quadCrop(blob, quad.map(([x, y]) => [Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y))]));
  }
  /**
   * v3.44 (Arnaud : Chocobo brillant coupé à gauche et en bas ; page 1 : Valseur 2 rétrécie) : sur une carte brillante ou sombre, les
   * coins trouvés par l'illustration déraillent parfois (proportions vraies 1,58 au lieu de 1,40). Coins dont la forme, perspective
   * retirée (`trueRatio`), n'est pas celle d'une carte (88/63 ± 0,1 ; cartes justes : 1,35–1,47) → refusés : la photo garde son
   * détourage (carte seule) ou la place donnée par la page (classeur, `scan-batch-realign › refitSure`).
   */
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
   * Brillant (foil) vu sur la photo (v3.44, Arnaud : « tu ne reconnais pas les effets de brillance ») : le brillant Final Fantasy
   * = des paillettes de couleur sur l'illustration et les bandes unies (copyright, force). Mesuré contre le visuel officiel (non
   * brillant) mis à la même taille, zones illustration (0,1…0,55) et bande du bas (0,9…0,98) : « chroma » = écart de couleur d'un
   * pixel à ses voisins (5 × 5), « lap » = petits points clairs (laplacien) ; note = max(chroma) + lap de l'illustration.
   * Photos d'Arnaud : carte seule (≥ 600 px) normales 2,0–2,3, brillantes 3,3–6,5 (Poussin chocobo, Chocobo, cristal) ;
   * classeur (~400 px, moins net) : « lap » ≥ 0,44 (normales ≤ 0,41 : Cloud ; brillantes Lightning 0,76, Tidus 0,67, Chocobo 0,49,
   * Lulu 0,45 ; Hyoh 0,39 pas vue) ou note ≥ 1,5, jamais « sûr ». Renvoie { holo, sure, score, chroma, lap, w } ou null.
   */
  const FOIL_Z = [[0.08, 0.92, 0.1, 0.55], [0.05, 0.95, 0.9, 0.98]];
  function foilFeat(src, W, H) {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(src, 0, 0, W, H);
    const d = g.getImageData(0, 0, W, H).data, N = W * H, c0 = new Float32Array(N), c1 = new Float32Array(N), L = new Float32Array(N);
    for (let i = 0; i < N; i++) { const r = d[i * 4], gg = d[i * 4 + 1], b = d[i * 4 + 2]; c0[i] = r - gg; c1[i] = (r + gg) / 2 - b; L[i] = (r + gg + b) / 3; }
    return FOIL_Z.map(([x0, x1, y0, y1]) => {
      let n = 0, ch = 0, lp = 0;
      for (let y = Math.round(y0 * H) + 2; y < y1 * H - 2; y++) for (let x = Math.round(x0 * W) + 2; x < x1 * W - 2; x++) {
        const i = y * W + x;
        lp += Math.abs(4 * L[i] - L[i - 1] - L[i + 1] - L[i - W] - L[i + W]); n++;
        if (L[i] < 40) continue;
        let m0 = 0, m1 = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const j = i + dy * W + dx; m0 += c0[j]; m1 += c1[j]; }
        ch += Math.hypot(c0[i] - m0 / 25, c1[i] - m1 / 25);
      }
      return n ? [ch / n, lp / n] : [0, 0];
    });
  }
  async function foil(blob, card) {
    if (!blob || !card || !card.variants || !card.variants.holo || !card.variants.normal) return null;
    try {
      const p = await createImageBitmap(blob), W = Math.min(900, p.width), H = Math.round(W * 88 / 63);
      const r = await fetch(img.card(card, 'high')); if (!r.ok) return null;
      const o = await createImageBitmap(await r.blob());
      const P = foilFeat(p, W, H), O = foilFeat(o, W, H);
      const chroma = Math.max(...P.map((z, k) => z[0] / Math.max(0.3, O[k][0]))), lap = P[0][1] / Math.max(1, O[0][1]);
      const score = Math.round((chroma + lap) * 100) / 100, big = W >= 600;
      return { holo: big ? score >= 3 : lap >= 0.44 || score >= 1.5, sure: big && (score >= 4 || score <= 2.4), score, chroma: Math.round(chroma * 100) / 100, lap: Math.round(lap * 100) / 100, w: W };
    } catch (e) { return null; }
  }

  /**
   * Lit une photo de carte (déjà recadrée) : code imprimé (« 16-006C »), nom (français ou anglais), puis vérification par
   * l'image. Même déroulé que Lorcana. Renvoie { info: { code, name, read, crop… }, cands }.
   */
  async function recognize(blob, statusFn = () => {}, { setId = '', original = null, context = null } = {}) {
    const R = App.recognizer, D = await data();
    const early = useVisual() ? visualPass(blob, [], [], context, setId).catch((e) => { console.warn('vérification par l’image', e); return null; }) : null;
    statusFn('Lecture du code de la carte…');
    const texts = await ocrTexts(blob);
    if (!texts.some((t) => codesIn(t).length)) texts.push(...(await R.readZones(blob, CODE_ZONES.slice(0, 2))));
    let read = texts.map(codesIn), betterCrop = null;
    const anyCode = () => read.some((r) => r.length);
    if (!anyCode() && !early) { const t = await R.readZones(blob, [...CODE_ZONES.slice(2), ...NAME_ZONES]); texts.push(...t); read.push(...t.map(codesIn)); }
    if (early && !anyCode()) {
      statusFn('Vérification par l’image…');
      const e = await early;
      if (e && e.cands[0] && e.cands[0].confident && (e.cands[0].orb || 0) >= IMG_SURE) { e.cands[0].foil = await foil(e.crop || blob, e.cands[0]); return { info: { code: e.cands[0].id, name: '', votes: {}, crop: e.crop, ctxQuad: e.ctxQuad, orb: e.best, read: 'reconnue à l’image ✓' }, cands: e.cands.slice(0, 40) }; }
      const crop = e && e.crop;
      statusFn(crop ? 'Lecture du code (carte recadrée)…' : 'Lecture du code…');
      let t = crop ? await ocrTexts(crop) : [];
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
    const idOf = (c) => { const [s, n] = c.split('|'); const k = (D.bySet.get(s) || []).find((x) => x.l === n); return k && k.id; };
    let codes = Object.keys(votes).filter(idOf).sort((a, b) => votes[b] - votes[a]);
    if (codes.length) codes = codes.filter((c) => votes[c] >= votes[codes[0]] * 0.5);
    // promo / réimpression lue (« PR-112/16-067L ») : la carte d'origine écrite après la barre n'est pas la carte photographiée
    const bases = new Set(codes.map((c) => D.byId.get(idOf(c))).filter((k) => k && k.b).map((k) => k.b.toUpperCase()));
    codes = codes.filter((c) => !bases.has(String((D.byId.get(idOf(c)) || {}).c || '').toUpperCase()));
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
    for (const c of codes.slice(0, 3)) { const [s, n] = c.split('|'); cands.push(...(await byCode(s, n))); }
    const codeIds = new Set(codes.map(idOf).filter(Boolean));
    if (nameOk && cands.length) { const ok = cands.filter((c) => nameIds.includes(c.id)); if (ok.length) agreed = true; }
    // code et nom en désaccord (« 8-022 » lu, nom « Vayne » : le 9 pris pour un 8) : la carte de ce nom au même numéro passe devant
    // (v3.46, Vayne 9-022L d'Arnaud)
    if (nameOk && cands.length && !agreed) {
      const nums = new Set(codes.map((c) => c.split('|')[1]));
      const fix = (await fromIds(nameIds)).filter((c) => nums.has(String(c.localId).slice(0, 3)));
      if (fix.length) { for (const c of fix) c.codeFix = true; cands = [...fix, ...cands]; agreed = true; }
    }
    if (!cands.length && nameOk) cands = (await fromIds(nameIds)).sort((a, b) => ((b.setId === setId) - (a.setId === setId)) || String(b.set.sortKey).localeCompare(String(a.set.sortKey)));
    const seen = new Set(); cands = cands.filter((x) => !seen.has(x.id) && seen.add(x.id));
    const rk = (c) => (c.codeFix ? 3 : 0) + (codeIds.has(c.id) ? 2 : 0) + (nameIds.includes(c.id) ? 1 : 0);
    cands.sort((a, b) => rk(b) - rk(a));
    for (const c of cands) { c.numOk = codeIds.has(c.id); c.ofOk = c.numOk; }
    if (cands.length > 1) {
      statusFn('Comparaison des illustrations…');
      const thumb = (c) => img.card(c, 'low').replace('&w=360', '&w=160').replace('_400w', '_200w');
      const pool = cands.slice(0, 24), vis = await R.resemblanceMany(blob, pool, thumb).catch(() => new Map());
      for (const c of cands) c.visual = vis.has(c.id) ? vis.get(c.id) : null;
      cands.sort((a, b) => (Math.round(((b.visual ?? -1) - (a.visual ?? -1)) * 16)) || (codeIds.has(b.id) - codeIds.has(a.id)) || (a.alt - b.alt));
      if (cands.some((c) => c.codeFix)) cands.sort((a, b) => (rk(b) - rk(a)) || ((b.visual ?? -1) - (a.visual ?? -1))); // (nom + numéro lus : devant une illustration à peine plus proche)
    }
    if (nameOk) for (const x of cands) x.nameScore = nameIds.includes(x.id) ? 1 : 0;
    let top = cands[0];
    const second = cands[1];
    const codeSure = codes.length > 0 && codeIds.has(top && top.id) && (agreed || votes[codes[0]] >= 2);
    const visSure = top && (!second || (top.visual != null && top.visual >= 0.55 && top.visual - (second.visual ?? 0) >= 0.1));
    if (top && codeSure && visSure) top.confident = true;
    let orb = null;
    if (!(top && top.confident) && useVisual()) {
      statusFn('Vérification par l’image…');
      const e = early && !cands.length ? await early : null;
      if (e) orb = e;
      else orb = await visualPass(blob, cands, [...codeIds], context, setId).catch((err) => { console.warn('vérification par l’image', err); return null; });
      if (orb) { cands = orb.cands; top = cands[0]; }
      if (top && top.confident && !codeIds.has(top.id) && (top.orb || 0) < IMG_SURE) delete top.confident;
      // même dessin ailleurs (Legacy Collection) : le code lu sur la carte, confirmé par l'image, tranche
      if (top && !top.confident && codeIds.has(top.id) && (top.orb || 0) >= App.visual.SURE) top.confident = true;
    }
    if (orb && orb.crop) betterCrop = orb.crop;
    const cropLater = !orb && early && top ? early.then((e) => (e && e.crop && e.cands[0] && e.cands[0].id === top.id ? e.crop : null), () => null) : null;
    const codeTxt = (c) => { const [s, n] = c.split('|'); return `code ${s}-${n}`; };
    const byImg = codes.length && top && !codeIds.has(top.id) && top.orb >= 25;
    const readTxt = codes.length ? `${byImg ? codeTxt(`${top.setId}|${top.localId}`) : codeTxt(codes[0])}${byImg ? ' (corrigé grâce à l’illustration)' : ''}` : '';
    if (top) top.foil = await foil(betterCrop || blob, top); // (brillant vu sur la photo, v3.44)
    return { info: { code: top ? top.id : '', name: nameOk, votes, crop: betterCrop, cropLater, ctxQuad: orb && top && orb.cands[0] === top ? orb.ctxQuad : null, orb: orb ? orb.best : null, read: [readTxt, nameOk ? `nom « ${nameOk} »` : '', top && top.orb >= 25 ? 'reconnue à l’image ✓' : ''].filter(Boolean).join(', ') }, cands: cands.slice(0, 40) };
  }

  /** Recherche à la main (nom français ou anglais, ou code « 16-006C », « PR-112 »), classée par ressemblance avec la photo */
  async function manual(blob, nameTxt, numTxt) {
    const name = (nameTxt || '').trim(), num = (numTxt || '').trim();
    if (!name && !num) throw new Error('Indique un nom, ou un code (ex. 16-006C)');
    let cands = await search({ name: num || name });
    // numéro seul (« 6 », « 006 ») : dans toutes les séries
    if (!cands.length && /^\d{1,3}[CRHLSB]?$/i.test(num)) { const D = await data(); for (const s of D.sets) cands.push(...await byCode(s.id, num)); }
    if (num && name) { const n = norm(name), f = cands.filter((c) => norm(c.name).includes(n) || norm(c.nameEn).includes(n)); if (f.length) cands = f; else cands = await search({ name }); }
    if (blob && cands.length > 1) {
      const pool = cands.slice(0, 24), vis = await App.recognizer.resemblanceMany(blob, pool, (c) => img.card(c, 'low').replace('&w=360', '&w=160').replace('_400w', '_200w')).catch(() => new Map());
      for (const c of pool) c.visual = vis.has(c.id) ? vis.get(c.id) : null;
      cands = [...pool.sort((a, b) => (b.visual ?? -1) - (a.visual ?? -1)), ...cands.slice(24)];
    }
    return cands;
  }

  App.games.register('finalfantasy', {
    id: 'finalfantasy',
    name: 'Final Fantasy',
    listSets, getSet, getCard, search, versions, byCode, setIdsByName, price, tpMarket, img, recognize, manual, codesIn, names, foil,
    visualIndex: { index: 'data/ff-index', v: FF_INDEX_V },
    visualCheck: (blob) => (useVisual() ? visualPass(blob, [], []) : Promise.resolve(null)),
    langFor: () => 'fr',
    cardmarketUrl: (card) => cm(card.nameEn || card.name),
    boosterUrl: (set) => cm((set.en || set.name) + ' booster'),
    isOfficial: (localId) => /^\d{3}$/.test(String(localId)), // (version Full Art « 022 FA » : en plus de la série)
    logoText: (s) => (/^\d+$/.test(s.id) ? (+s.id <= 14 ? `Opus ${ROMAN[+s.id]}` : `Série ${s.id}`) : ({ PR: 'Promos', Re: 'Legacy', C: 'Cristaux', B: 'Boss' })[s.id] || s.id),
    extraLabel: 'versions Full Art',
    priceNote: 'Prix : marché américain TCGplayer (cartes anglaises), converti en euros, mise à jour quotidienne.',
    rarity,
    pullRates: () => null,
    source: { name: 'Square Enix (base officielle des cartes)', url: 'https://fftcg.square-enix-games.com/fr/card-browser' },
  });
})();
