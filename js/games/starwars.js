/*
 * Adaptateur Star Wars: Unlimited (v3.67, 8ᵉ licence, Fantasy Flight Games).
 * Cartes : data/sw-cartes.json, préparé depuis la base officielle (admin.starwarsunlimited.com › api/card-list?locale=fr : noms,
 * sous-titres, traits, textes EN FRANÇAIS) et TCGplayer (dates, n° de produit, sachets) par outils/ci/starwars-cartes.mjs, remis à
 * jour chaque lundi par le robot de l'index.
 * Visuels : images officielles françaises (cdn.starwarsunlimited.com, 300 × 419, CORS accordé) lues directement ; leaders et bases
 * (cartes couchées) relayés par images.weserv.nl, tournés d'un quart de tour (`&ro=270`), comme ils sont rangés dans un classeur.
 * Prix : marché TCGplayer (en $), préparé chaque jour par le robot de mise en ligne (data/sw-prix.json, outils/ci/prix-starwars.mjs).
 * Identifiant d'une carte = série + numéro imprimé : « sor-038 » (Comte Dooku, SOR • FR • 038/252), « sor-297 » (Inferno Quatre
 * Hyperspace), « jtlp-001 » (Weekly Play), promos de tournoi au même numéro « p24-002b ». La version brillante (Foil) d'une carte
 * n'est pas une carte à part (variante « brillante ») ; depuis Passage en Vitesse Lumière elle a son propre numéro (`fn`).
 */
(() => {
  const DAY = 24 * 3600 * 1000;
  const { norm } = App.util;

  // ---------- Données (fichier du site, gardé en cache : utilisable hors ligne ; relu à chaque nouvelle version du site) ----------
  let indexP = null;
  const index = () => indexP || (indexP = (async () => {
    const hit = await App.db.get('cache', 'sw1:index').catch(() => null);
    if (hit && hit.ver === window.APP_VERSION && Date.now() - hit.t < 3 * DAY) return hit.v;
    try {
      const r = await fetch('data/sw-cartes.json', { cache: 'no-cache' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const v = await r.json();
      await App.db.set('cache', 'sw1:index', { t: Date.now(), ver: window.APP_VERSION, v }).catch(() => {});
      return v;
    } catch (e) {
      if (hit) { console.warn('Réseau indisponible, données en cache utilisées', e); return hit.v; }
      indexP = null;
      throw e;
    }
  })());

  // ---------- Raretés (petit symbole imprimé avant le numéro : C, U, R, L, S) ----------
  // clé → [rang, nom FR, sigle, couleur]
  const RAR = {
    c: [1, 'Commune',     'C', '#a9b0ba'],
    u: [2, 'Peu commune', 'U', '#5fb86a'],
    r: [3, 'Rare',        'R', '#5aa0e0'],
    s: [4, 'Spéciale',    'S', '#9b6ef0'],
    l: [5, 'Légendaire',  'L', '#e8b923'],
  };
  const rkey = (r) => (RAR[r] ? r : Object.keys(RAR).find((k) => norm(RAR[k][1]) === norm(r) || norm(RAR[k][2]) === norm(r)) || null);
  const rarity = {
    key: (r) => rkey(r),
    rank: (r) => { const k = rkey(r); return k ? RAR[k][0] : 3; },
    label: (r) => { const k = rkey(r); return k ? RAR[k][1] : (r || 'Inconnue'); },
    symbol: (r) => {
      const k = rkey(r), esc = App.util.esc;
      const lab = esc(k ? RAR[k][1] : (r || '?'));
      return `<span class="rar" title="${lab}"><span class="rar-txt" style="background:${k ? RAR[k][3] : '#b9c0d4'}">${esc(k ? RAR[k][2] : String(r || '?').slice(0, 6))}</span></span>`;
    },
    css: (r) => { const k = rkey(r); return k ? RAR[k][3] : '#b9c0d4'; },
  };
  // la plupart des cartes existent en normale et en brillante (Foil) ; vf « n » = normale seulement (leaders et bases de la 1ʳᵉ série…), « h » = brillante seulement
  const variantsOf = (k) => (k.vf === 'n' ? { normal: true } : k.vf === 'h' ? { holo: true } : { normal: true, holo: true });

  // ---------- Séries ----------
  const GROUPS = {
    main: { id: 'sw-main', name: 'Extensions', order: 1 }, deck: { id: 'sw-deck', name: 'Decks et coffrets', order: 2 }, promo: { id: 'sw-promo', name: 'Promos', order: 3 },
  };
  const TYPE = { un: 'Unité', ev: 'Événement', up: 'Amélioration', le: 'Leader', ba: 'Base', to: 'Jeton' };
  const ASPECT = { vi: 'Vigilance', co: 'Commandement', ag: 'Agressivité', ru: 'Ruse', he: 'Héroïsme', in: 'Infamie' };
  const ARENA = { te: 'Terrestre', sp: 'Spatiale', tesp: 'Terrestre et spatiale' };

  let memo = null;
  async function data() {
    const idx = await index();
    if (memo && memo.idx === idx) return memo;
    const byId = new Map(), bySet = new Map(), setKey = new Map(), byNum = new Map();
    for (const k of idx.cards) {
      byId.set(k.id, k); if (!bySet.has(k.s)) bySet.set(k.s, []); bySet.get(k.s).push(k);
      const key = `${k.s}|${parseInt(k.l, 10)}`;
      if (!byNum.has(key)) byNum.set(key, { k, foil: false });
      for (const n of k.fn || []) if (!byNum.has(`${k.s}|${n}`)) byNum.set(`${k.s}|${n}`, { k, foil: true }); // (brillante numérotée à part)
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
  const isOfficialIn = (localId, max) => /^\d{3,4}$/.test(String(localId)) && +localId >= 1 && (!max || +localId <= max);
  async function listSets() {
    const { sets } = await data();
    return sets.map(({ en, type, max, ...s }) => s);
  }

  // ---------- Cartes ----------
  const cmp = (a, b) => (parseInt(a.l, 10) - parseInt(b.l, 10)) || String(a.l).localeCompare(String(b.l));
  const setShape = (s) => ({ id: s.id, name: s.name, logo: '', symbol: '', releaseDate: s.releaseDate, sortKey: s.sortKey, cardCount: { total: s.total, official: s.official }, serie: s.group });
  const IMG = 'https://cdn.starwarsunlimited.com/';
  /** Code imprimé en bas à droite : « SOR • FR • 038/252 », Hyperspace « SOR • FR • 297 » */
  const printed = (k, s) => {
    const n = parseInt(k.l, 10), max = s && s.max;
    return `${k.s} • FR • ${max && n <= max ? `${String(n).padStart(3, '0')}/${max}` : String(n).padStart(3, '0')}`;
  };
  const nameOf = (k) => (k.st ? `${k.n}, ${k.st}` : k.n);
  function normCard(k, s, D) {
    const base = k.b && D ? D.byId.get(k.b) : null;
    const text = k.x || (base && base.x) || '';
    const facts = [TYPE[k.t] || '', (k.a || []).map((a) => ASPECT[a] || a).join(' · '), k.ar ? `Arène ${(ARENA[k.ar] || k.ar).toLowerCase()}` : '',
      k.co != null ? `Coût ${k.co}` : '', k.p != null ? `Puissance ${k.p}` : '', k.tr ? `Traits : ${k.tr}` : '',
      k.v ? `Version ${k.v}` : '', `Code ${printed(k, s)}`, k.fn && k.fn.length ? `Brillante : n° ${k.fn.join(', ')}` : '', base ? `Version de la carte ${base.s} ${base.l}` : ''].filter(Boolean);
    const v = k.v ? ` (${k.v})` : '';
    return {
      id: k.id, localId: k.l, name: nameOf(k) + v, baseName: k.n, subtitle: k.st || '', nameEn: k.ne || k.se ? `${k.ne || k.n}${k.se || k.st ? ', ' + (k.se || k.st) : ''}${v}` : '',
      code: printed(k, s), version: k.v || '', image: k.img ? IMG + k.img : '', landscape: !!k.h,
      rarity: k.r, variants: variantsOf(k), category: TYPE[k.t] || '', kind: k.t || '', types: [], facts, text, illustrator: '',
      aspects: k.a || [], arena: k.ar || '', cost: k.co, power: k.p, hp: k.hp, traits: k.tr || '', base: k.b || '',
      tp: k.tp || 0, tpf: k.tpf || 0, setId: s.id, serieId: s.group.id, alt: !!k.v || s.group.id !== 'sw-main',
    };
  }
  async function getSet(id) {
    id = String(id);
    const D = await data(), s = D.sets.find((x) => x.id === id);
    if (!s) throw new Error('Série inconnue : ' + id);
    const set = { ...setShape(s), ...s, cardCount: { total: s.total, official: s.official } };
    set.cards = [...D.bySet.get(id)].sort(cmp).map((k) => normCard(k, s, D));
    return set;
  }

  // ---------- Prix (TCGplayer, préparés par le robot : data/sw-prix.json = { m: date, p: { n° de produit TCGplayer: [normal, brillant] } }) ----------
  const ONLINE = 'https://azran28.github.io/collecdex/data/sw-prix.json';
  let pricesP = null;
  const prices = () => pricesP || (pricesP = (async () => {
    const hit = await App.db.get('cache', 'sw1:prix').catch(() => null);
    const full = hit && hit.v && hit.v.p && Object.keys(hit.v.p).length;
    if (hit && Date.now() - hit.t < (full ? DAY / 2 : 15 * 60 * 1000)) return hit.v;
    for (const u of ['data/sw-prix.json', ONLINE]) {
      const r = await fetch(u, { cache: 'no-cache' }).catch(() => null);
      const v = r && r.ok ? await r.json().catch(() => null) : null;
      if (v && v.p && Object.keys(v.p).length) { await App.db.set('cache', 'sw1:prix', { t: Date.now(), v }).catch(() => {}); return v; }
    }
    if (full) return hit.v;
    await App.db.set('cache', 'sw1:prix', { t: Date.now(), v: { m: '', p: {} } }).catch(() => {});
    return { m: '', p: {} };
  })().finally(() => setTimeout(() => { pricesP = null; }, 60000)));
  async function getCard(id) {
    id = String(id);
    const D = await data(), k = D.byId.get(id);
    if (!k) throw new Error('Carte inconnue : ' + id);
    const s = D.sets.find((x) => x.id === k.s) || { id: k.s, name: k.s, group: GROUPS.main, releaseDate: '', sortKey: '', total: 0, official: 0 };
    const P = await prices().catch(() => ({ p: {} })), pp = P.p || {};
    const p = k.tp ? pp[k.tp] : null, pf = k.tpf ? pp[k.tpf] : null; // (brillante numérotée à part : son propre produit TCGplayer)
    const normal = p ? p[0] : null, holo = pf ? pf[1] || pf[0] : p ? p[1] : null;
    return {
      ...normCard(k, s, D),
      set: setShape(s),
      pricing: normal || holo ? { tcgplayer: { normal: normal || null, holo: holo || null }, updated: P.m || '' } : null,
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
      out.push({ ...normCard(k, s, D), set: setShape(s) });
    }
    return out;
  }
  /** La carte d'un numéro dans une série (« SOR », « 38 ») ; numéro d'une brillante (« JTL », « 687 ») → sa carte */
  async function byCode(setId, num) {
    const D = await data(), sid = String(setId).toUpperCase();
    const hit = D.byNum.get(`${sid}|${parseInt(String(num).replace(/\D/g, ''), 10)}`);
    return hit ? fromIds([hit.k.id]) : [];
  }
  async function search({ name }) {
    const q = norm(name); if (!q) return [];
    const D = await data();
    const c = codesIn(name);
    if (c.length) { const [s, n] = c.sort((a, b) => b[1] - a[1])[0][0].split('|'); const r = await byCode(s, n); if (r.length) return r; }
    if (D.byId.has(String(name).trim().toLowerCase())) return fromIds([String(name).trim().toLowerCase()]);
    const ids = [];
    for (const k of D.idx.cards) if (norm(nameOf(k)).includes(q) || (k.ne && norm(k.ne).includes(q)) || (k.se && norm(`${k.ne || k.n} ${k.se}`).includes(q))) ids.push(k.id);
    // (même nom dans plusieurs séries : les plus récentes d'abord, la version normale avant les autres)
    const date = new Map(D.sets.map((s) => [s.id, s.sortKey]));
    ids.sort((a, b) => String(date.get(D.byId.get(b).s)).localeCompare(String(date.get(D.byId.get(a).s))) || (!!D.byId.get(a).v - !!D.byId.get(b).v));
    return fromIds(ids.slice(0, 300));
  }
  /** Séries dont le nom ou le code correspond (« Étincelle de Rébellion », « Spark of Rebellion », « SOR ») — import d'un fichier */
  async function setIdsByName(name) {
    const q = norm(String(name).replace(/^star\s*wars\s*:?\s*unlimited\s*[-:–]?\s*/i, '')); if (!q) return [];
    const sets = (await data()).sets;
    const names = (s) => [s.id, s.name, s.en || ''].map(norm);
    const exact = sets.filter((s) => names(s).includes(q));
    return (exact.length ? exact : sets.filter((s) => names(s).some((n) => n && n.length > 3 && (n.includes(q) || q.includes(n))))).map((s) => s.id);
  }
  async function versions(name) {
    const n = norm(name);
    return (await search({ name })).filter((c) => norm(c.baseName) === n || norm(c.name) === n || norm(c.nameEn) === n);
  }
  /** Noms des cartes (français et anglais ; titre seul et titre + sous-titre) : nom normalisé → ids */
  let namesMemo = null;
  async function names() {
    const D = await data();
    if (namesMemo && namesMemo.D === D) return namesMemo.m;
    const m = new Map();
    const add = (x, id) => { const key = norm(x); if (key.length < 3) return; if (!m.has(key)) m.set(key, new Set()); m.get(key).add(id); };
    for (const k of D.idx.cards) { add(k.n, k.id); if (k.ne) add(k.ne, k.id); if (k.st) add(`${k.n} ${k.st}`, k.id); }
    namesMemo = { D, m };
    return m;
  }

  // sachet de booster de chaque extension (produit TCGplayer) : [produit, largeur, hauteur de l'image _400w, zone du sachet x0, y0, x1, y1],
  // mesurée sur l'image (pixels pas blancs). À compléter à chaque nouvelle série (sinon : image entière, `pk` du robot).
  const PACKS_CROP = {
    SOR: [533898, 338, 624, 0, 1, 338, 624], SHD: [549700, 400, 400, 94, 0, 303, 400], TWI: [578940, 400, 752, 0, 0, 400, 752], JTL: [610306, 400, 752, 0, 0, 399, 752],
    LOF: [626542, 400, 400, 91, 0, 311, 400], SEC: [652034, 400, 400, 92, 0, 308, 400], LAW: [672288, 400, 400, 91, 2, 308, 398], ASH: [693392, 400, 400, 92, 0, 309, 400],
    HMW: [710963, 400, 400, 91, 0, 309, 400],
  };
  const NO_PACK = new Set(['IC27']); // (pas encore d'image chez TCGplayer, oct. 2026)

  // ---------- Images ----------
  const img = {
    card: (c, q = 'low') => {
      const u = (c && c.image) || '';
      if (!u.startsWith(IMG)) return u;
      // carte couchée (leader, base) : tournée d'un quart de tour par le relais (sens du classeur), qui autorise aussi CORS
      if (c.landscape) return `https://images.weserv.nl/?url=${encodeURIComponent(u.replace(/^https:\/\//, ''))}&ro=270${q === 'high' ? '' : '&w=300'}&output=webp`;
      return u;
    },
    // visuel de la série : son sachet de booster chez TCGplayer (affiché directement), recadré sur le sachet ; decks, promos : le code
    logo: (s) => { const p = s && PACKS_CROP[s.id], pk = p ? p[0] : s && !NO_PACK.has(s.id) && memo && (memo.idx.sets.find((x) => x.id === s.id) || {}).pk; return pk ? `https://tcgplayer-cdn.tcgplayer.com/product/${pk}_400w.jpg` : ''; },
    logoCrop: (s) => { const p = s && PACKS_CROP[s.id]; return p ? { W: p[1], H: p[2], x0: p[3], y0: p[4], x1: p[5], y1: p[6] } : null; },
    symbol: () => '',
  };
  const cm = (q) => `https://www.cardmarket.com/fr/StarWarsUnlimited/Products/Search?searchString=${encodeURIComponent(q)}`;

  // ---------- Reconnaissance d'une photo ----------
  // le code est imprimé en bas à droite : « SOR • FR • 038/252 » (série, langue, symbole de rareté, numéro / total), Hyperspace
  // « SOR • FR • 297 » (sans total) ; leaders et bases sont couchés : leur code est en bas à droite de la carte couchée.
  const ALT = { O: '0', D: '0', Q: '0', U: '0', I: '1', L: '1', '|': '1', T: '1', J: '1', S: '5', Z: '2', B: '8', G: '6' };
  const fix = (s) => [...s].map((ch) => (/\d/.test(ch) ? ch : ALT[ch] || '')).join('');
  const SET_ALT = { '0': 'O', '5': 'S', '1': 'I', '8': 'B' };
  // (« SOR • FR • C 038/252 » : séparateurs lus « . », « * », « - », le symbole de rareté lu comme une lettre ou rien)
  // (« SOR+FR 297 » : le point lu « + » ; « SOR-FRU 257 », « SOR-FR (À 166/252 » : le symbole de rareté lu « U », « (À », « Ÿ »)
  const codeRe = () => /(?<![A-Z0-9])([A-Z0-9]{3,4})\s*[•·.*+\-_~,:°o]?\s*(FR|EN|DE|IT|ES|PT|F R)\s*[•·.*+\-_~,:°o]?\s*(?:[A-Z©@®]{1,2}\s*|[^\sA-Z0-9/]{1,2}\s*)?([0-9OILDQSZB|]{1,4})(?:\s*[/|\\7]\s*([0-9OILDQSZB]{2,3}))?(?![0-9])/g;
  /** Codes lus (« SOR|38 », avec un poids) ; rien sans la langue (« FR ») : ni un numéro Pokémon (« 025/165 ») ni Riftbound (« OGN · 013/298 ») */
  function codesIn(text) {
    const out = [], T = String(text || '').toUpperCase().replace(/[‐-―]/g, '-');
    for (const m of T.matchAll(codeRe())) {
      let set = m[1];
      const num = parseInt(fix(m[3]), 10), total = m[4] ? parseInt(fix(m[4]), 10) : 0;
      if (!(num >= 1)) continue;
      if (memo && !memo.setKey.has(set)) set = set.replace(/[0-9]/g, (d) => SET_ALT[d] || d); // (« S0R »)
      if (memo && !memo.setKey.has(set)) {
        // série mal lue (« S0R », « SHO ») : la plus proche des séries connues, à une lettre près
        const near = [...memo.setKey.keys()].filter((s) => s.length === set.length && [...s].filter((ch, i) => ch !== set[i]).length <= 1);
        if (near.length !== 1) continue;
        set = near[0];
      }
      const s = memo && memo.sets.find((x) => x.id === set);
      // total lu = celui de la série : sûr ; numéro plus grand que la série sans total (Hyperspace, Showcase) : sûr aussi
      let w = total ? (s && s.max && total === s.max ? 1 : 0.6) : (s && s.max && num > s.max ? 0.9 : 0.75);
      if (memo && !memo.byNum.has(`${set}|${num}`)) continue;
      if (set !== m[1]) w *= 0.85;
      out.push([`${set}|${num}`, w]);
    }
    return out;
  }
  /**
   * « SOR-FR » et « 166/252 » lus sur deux lignes à part (le lecteur coupe souvent au symbole de rareté) → lignes recollées
   * « SOR FR 166/252 » (le total doit être celui de la série pour compter, voir codesIn)
   */
  function joinedLines(texts) {
    const T = texts.join('\n').toUpperCase(), out = [];
    const sets = new Set([...T.matchAll(/(?<![A-Z0-9])([A-Z0-9]{3,4})\s*[•·.*+\-_~,:]?\s*FR(?![A-Z])/g)].map((m) => m[1]));
    if (!sets.size) return out;
    for (const m of T.matchAll(/(?<![0-9])([0-9OILDQSZB]{1,3})\s*[/|]\s*([0-9]{3})(?![0-9])/g)) for (const s of sets) out.push(`${s} FR ${m[1]}/${m[2]}`);
    return out.filter((l) => !texts.includes(l));
  }
  // zones de lecture (fractions de la carte debout) : code en bas à droite, nom en haut (unités, événements, améliorations)
  // (cadre Hyperspace plus épais : code plus haut, ~0,92 ; cadre normal ~0,96)
  const OCR_BANDS = [[0.945, 0.985, 0.55, 0.98], [0.955, 0.995, 0.55, 0.98], [0.91, 0.95, 0.5, 0.98]];
  const NAME_BANDS = [[0.03, 0.115, 0.12, 0.92]];
  const ZONES = [[0.89, 1, 0.45, 1], [0, 0.16, 0.05, 0.95]];
  // carte couchée (leader, base ; photo tournée d'un quart de tour vers la droite) : code en bas à droite, nom dans le haut
  const T_BANDS = [[0.925, 0.975, 0.6, 0.985], [0.935, 0.99, 0.6, 0.985]];
  const T_ZONES = [[0.88, 1, 0.5, 1], [0.08, 0.42, 0.2, 0.85]];
  const CODE_ZONES = [[0.945, 0.99, 6, 'sharp', 0.55, 0.98], [0.945, 0.99, 6, 'invert', 0.55, 0.98], [0.935, 0.995, 5, 'otsu', 0.5, 0.99]];
  const NAME_ZONES = [[0.03, 0.115, 2.5, 'sharp', 0.12, 0.92]];
  /** Photo tournée d'un quart de tour (vers la droite) : leaders et bases se lisent alors comme une carte couchée */
  async function turned(b) {
    const bmp = await createImageBitmap(b), c = document.createElement('canvas');
    c.width = bmp.height; c.height = bmp.width;
    const g = c.getContext('2d'); g.translate(c.width, 0); g.rotate(Math.PI / 2); g.drawImage(bmp, 0, 0);
    return c;
  }
  async function ocrTexts(b, { land = 'auto' } = {}) {
    const O = App.recognizerParts && App.recognizerParts.codeOcr;
    if (!O) return [];
    const out = [];
    if (land !== true) { const rd = await O.read(b, [...OCR_BANDS, ...NAME_BANDS], { zones: ZONES }).catch(() => null); if (rd) out.push(...rd.texts, ...joinedLines(rd.texts)); }
    if (land === true || (land === 'auto' && !out.some((t) => codesIn(t).length))) {
      const t = await turned(b).catch(() => null);
      const rd = t ? await O.read(t, T_BANDS, { zones: T_ZONES }).catch(() => null) : null;
      if (rd) out.push(...rd.texts, ...joinedLines(rd.texts));
    }
    return out;
  }
  // meilleur cadre en forme de carte dans la photo (détourage raté), remis à plat — commun : js/games/card-tools.js
  const findCrop = (src) => App.cardTools.findCrop(src);

  // ---------- Vérification par l'image : réseau de neurones + points clés (js/visual.js › check), index data/sw-index ----------
  const SW_INDEX_V = 1;
  const IMG_SURE = 30;
  const useVisual = () => App.visual && App.visual.supported() && App.settings.visualCheck !== false;
  // même dessin ailleurs (promo Weekly Play ou de tournoi d'une carte, réimpression d'un deck) : le code lu, la série de la page, puis la carte d'origine
  const visualOpts = (codes, setId = '') => ({
    index: 'data/sw-index', v: SW_INDEX_V, cardsOf: (near) => fromIds(near.map((x) => x.id)), urlOf: (c) => img.card(c, 'low'),
    twinsOf: async (top) => twinsOf(top), twinKey: (c) => c.id,
    tie: (a, b) => (codes.includes(b.id) - codes.includes(a.id)) || ((b.setId === setId) - (a.setId === setId)) || (a.alt - b.alt),
  });
  const BOOSTER_V = new Set(['Hyperspace', 'Showcase', 'Prestige', 'Prestige numérotée']);
  /** Cartes au même dessin : la carte d'origine et ses autres impressions à l'illustration identique (Hyperspace avec Hyperspace…) */
  async function twinsOf(c) {
    const D = await data(), root = c.base || c.id, k0 = D.byId.get(root);
    if (!k0) return [];
    const art = (v) => (BOOSTER_V.has(v || '') ? v : ''); // (Hyperspace, Showcase, Prestige : autre cadre ou autre dessin ; promos : souvent le même)
    const ids = D.idx.cards.filter((k) => (k.id === root || k.b === root) && art(k.v) === art(c.version)).map((k) => k.id);
    return fromIds(ids.filter((id) => id !== c.id));
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
   * Brillant (Foil) : PAS mesuré sur la photo (v3.67). La mesure de Final Fantasy (paillettes contre le visuel officiel,
   * card-tools › foilMeasure) a été essayée sur l'Inferno Quatre Hyperspace brillante d'Arnaud (photo 20) : 0,8, moins que les
   * normales d'autres licences (les visuels officiels n'ont que 300 px de large). → « Ta carte brille ? » est posée, sauf si le numéro
   * de la version brillante est lu (Passage en Vitesse Lumière et après : elle a son propre numéro, `foilRead` dans recognize).
   */
  const foil = async () => null;

  /**
   * Normale ou Hyperspace ? (v3.67, page 18 d'Arnaud : 4 cartes normales sur 9 prises pour leur version Hyperspace, même illustration ;
   * l'image les note même plus haut, 100 contre 79 : l'illustration Hyperspace va jusqu'au bord, plus de points communs.) Le numéro
   * tranche : « 038/252 » = normale, « 304 » = Hyperspace. Numéro pas lu (case coupée par le bord de la photo…) : la version normale
   * passe devant (de loin la plus courante dans les boosters), « à vérifier », l'autre juste derrière. (Essayé : bandes des côtés de la
   * carte comparées aux visuels — fausses sur les cases mal cadrées, abandonné.)
   */
  const artOf = (c) => (c.version === 'Hyperspace' ? 'h' : !c.version || !BOOSTER_V.has(c.version) ? 's' : '');
  /** Autres versions de la même illustration dans la même série (normale ↔ Hyperspace) */
  async function artFamily(top) {
    if (!top || !artOf(top)) return [];
    const D = await data(), root = top.base || top.id;
    return (await fromIds(D.idx.cards.filter((k) => (k.id === root || k.b === root) && k.s === top.setId).map((k) => k.id))).filter((c) => artOf(c) && artOf(c) !== artOf(top));
  }
  async function pickArt(cands, codeIds) {
    const top = cands[0];
    if (!top) return cands;
    const fam = (await artFamily(top)).map((c) => cands.find((x) => x.id === c.id) || c); // (celles déjà proposées gardent leurs notes)
    if (!fam.length) return cands;
    const pool = [top, ...fam], coded = pool.find((c) => codeIds.has(c.id));
    const best = coded || (artOf(top) === 's' ? top : pool.find((c) => artOf(c) === 's') || top);
    const was = !!top.confident;
    if (best !== top) best.orb = Math.max(best.orb || 0, top.orb || 0);
    if (!coded) for (const c of pool) delete c.confident;
    else if (best !== top) { delete top.confident; if (was || (best.orb || 0) >= App.visual.SURE || best.numOk) best.confident = true; }
    // ordre : la retenue, puis les autres versions de la même illustration, puis le reste
    const front = [best, ...pool.filter((c) => c !== best)];
    return [...front, ...cands.filter((c) => !front.some((f) => f.id === c.id))];
  }

  /**
   * Lit une photo de carte (déjà recadrée) : code imprimé (« SOR • FR • 038/252 », cartes couchées comprises), nom (titre), puis
   * vérification par l'image. Même déroulé que Wankul. Renvoie { info: { code, name, read, crop… }, cands }.
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
      // normale ou Hyperspace (même illustration) : le numéro relu sur la carte recadrée tranche (« 038/252 » ou « 304 »), sinon la normale, à vérifier
      let twinRead = false;
      if (e && e.cands[0] && e.cands[0].confident && (e.cands[0].orb || 0) >= IMG_SURE && (await artFamily(e.cands[0])).length) {
        statusFn('Lecture du numéro (normale ou Hyperspace ?)…');
        const t = e.crop ? await ocrTexts(e.crop, { land: e.cands[0].landscape ? true : 'auto' }) : [];
        texts.push(...t); read.push(...t.map(codesIn));
        if (anyCode()) { twinRead = true; betterCrop = e.crop; }
        else {
          const cs = await pickArt(e.cands, new Set());
          return { info: { code: cs[0].id, name: '', votes: {}, crop: e.crop, ctxQuad: e.ctxQuad, orb: e.best, read: 'reconnue à l’image ✓ (numéro illisible : normale ou Hyperspace ?)' }, cands: cs.slice(0, 40) };
        }
      }
      if (!twinRead && e && e.cands[0] && e.cands[0].confident && (e.cands[0].orb || 0) >= IMG_SURE) { e.cands[0].foil = await foil(e.crop || blob, e.cands[0]); return { info: { code: e.cands[0].id, name: '', votes: {}, crop: e.crop, ctxQuad: e.ctxQuad, orb: e.best, read: `reconnue à l’image ✓${e.cands[0].artFix ? ' (version choisie d’après le cadre)' : ''}` }, cands: e.cands.slice(0, 40) }; }
      const crop = e && e.crop;
      if (!twinRead) {
        statusFn(crop ? 'Lecture du code (carte recadrée)…' : 'Lecture du code…');
        let t = crop ? await ocrTexts(crop, { land: e.cands[0] && e.cands[0].landscape ? true : 'auto' }) : [];
        if (!t.some((x) => codesIn(x).length)) t = [...t, ...(await R.readZones(crop || blob, crop ? CODE_ZONES : [...CODE_ZONES.slice(2), ...(context ? [] : NAME_ZONES)]))];
        texts.push(...t); read.push(...t.map(codesIn));
        if (anyCode() && crop) betterCrop = crop;
      }
    }
    // ni code ni nom lus : la carte cherchée dans la photo elle-même (détourage raté), puis relue — elle sert ensuite à la comparaison
    const nm = await names();
    if (!anyCode()) { // (aussi quand seul le nom est lu, comme Final Fantasy v3.50 : le bas de la photo n'est alors souvent pas celui de la carte)
      const hadName = App.cardTools.nameIn(texts, nm);
      for (const src of [...new Set((context ? [blob] : [blob, original]).filter(Boolean))]) { // (classeur : la case seule, pas ses alentours où sont les voisines)
        statusFn('Recherche de la carte dans la photo…');
        const fc = await findCrop(src); if (!fc) continue;
        const t = await ocrTexts(fc), r = t.map(codesIn);
        // (nom déjà lu : la découpe n'est gardée que si elle fait lire le code — sinon un morceau de la carte, Inferno Quatre coupé au texte)
        if (r.some((x) => x.length) || (!hadName && App.cardTools.nameIn(t, nm))) { texts.push(...t); read.push(...r); betterCrop = fc; blob = fc; break; }
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
    const hitOf = (c) => D.byNum.get(c), idOf = (c) => (hitOf(c) || {}).k && hitOf(c).k.id;
    let codes = Object.keys(votes).filter(idOf).sort((a, b) => votes[b] - votes[a]);
    if (codes.length) codes = codes.filter((c) => votes[c] >= votes[codes[0]] * 0.5);
    const foilRead = codes.length && hitOf(codes[0]).foil; // (numéro d'une brillante lu : Passage en Vitesse Lumière et après)
    statusFn('Recherche de la carte…');
    const best = App.cardTools.bestName(texts, nm, { pairs: true });
    const nameOk = best.s >= 0.8 ? best.k : '';
    const nameIds = nameOk ? [...nm.get(nameOk)] : [];
    let agreed = false;
    let cands = [];
    for (const c of codes.slice(0, 5)) { const id = idOf(c); if (id) cands.push(...(await fromIds([id]))); }
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
      const pool = cands.slice(0, 24), vis = await R.resemblanceMany(blob, pool, (c) => img.card(c, 'low')).catch(() => new Map());
      for (const c of cands) c.visual = vis.has(c.id) ? vis.get(c.id) : null;
      cands.sort((a, b) => (Math.round(((b.visual ?? -1) - (a.visual ?? -1)) * 16)) || (codeIds.has(b.id) - codeIds.has(a.id)) || (a.alt - b.alt));
      if (cands.some((c) => c.codeFix || codeIds.has(c.id))) cands.sort((a, b) => (rk(b) - rk(a)) || ((b.visual ?? -1) - (a.visual ?? -1)));
    }
    if (nameOk) for (const x of cands) x.nameScore = nameIds.includes(x.id) ? 1 : 0;
    let top = cands[0];
    const second = cands[1];
    const codeSure = codes.length > 0 && codeIds.has(top && top.id) && (agreed || votes[codes[0]] >= 1.8);
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
    if (top) { cands = await pickArt(cands, codeIds); top = cands[0]; } // (normale ou Hyperspace : le numéro lu tranche, sinon la normale, à vérifier)
    const cropLater = !orb && early && top ? early.then((e) => (e && e.crop && e.cands[0] && e.cands[0].id === top.id ? e.crop : null), () => null) : null;
    const codeTxt = (c) => { const [s, n] = c.split('|'); return `code ${s} ${String(n).padStart(3, '0')}`; };
    const byImg = codes.length && top && !codeIds.has(top.id) && top.orb >= 25;
    const readTxt = codes.length ? `${byImg ? codeTxt(`${top.setId}|${parseInt(top.localId, 10)}`) : codeTxt(codes[0])}${byImg ? ' (corrigé grâce à l’illustration)' : ''}` : '';
    if (top) {
      top.foil = await foil(betterCrop || blob, top);
      if (foilRead && codeIds.has(top.id) && top.variants.holo) top.foil = { holo: true, sure: true, score: 9, code: true }; // (numéro de la brillante lu)
    }
    return { info: { code: top ? top.id : '', name: nameOk, votes, crop: betterCrop, cropLater, ctxQuad: orb && top && orb.cands[0] === top ? orb.ctxQuad : null, orb: orb ? orb.best : null, read: [readTxt, nameOk ? `nom « ${nameOk} »` : '', top && top.orb >= 25 ? 'reconnue à l’image ✓' : ''].filter(Boolean).join(', ') }, cands: cands.slice(0, 40) };
  }

  /** Recherche à la main (nom français ou anglais, ou code « SOR 038 », « 38 »), classée par ressemblance avec la photo */
  async function manual(blob, nameTxt, numTxt) {
    const name = (nameTxt || '').trim(), num = (numTxt || '').trim();
    if (!name && !num) throw new Error('Indique un nom, ou un numéro (ex. SOR 038)');
    let cands = [];
    const m = num.toUpperCase().match(/^([A-Z0-9]{2,4})?\s*[•·.\-\s]*(?:FR\s*[•·.\-\s]*)?(\d{1,4})/);
    if (m && m[1] && /[A-Z]/.test(m[1])) cands = await byCode(m[1], m[2]);
    else if (m) { const D = await data(); for (const s of D.sets) cands.push(...await byCode(s.id, m[2])); }
    if (!cands.length && name) cands = await search({ name });
    if (num && name) { const n = norm(name), f = cands.filter((c) => norm(c.name).includes(n) || norm(c.nameEn).includes(n)); cands = f.length ? f : await search({ name }); }
    if (blob && cands.length > 1) {
      const pool = cands.slice(0, 24), vis = await App.recognizer.resemblanceMany(blob, pool, (c) => img.card(c, 'low')).catch(() => new Map());
      for (const c of pool) c.visual = vis.has(c.id) ? vis.get(c.id) : null;
      cands = [...pool.sort((a, b) => (b.visual ?? -1) - (a.visual ?? -1)), ...cands.slice(24)];
    }
    return cands;
  }

  App.games.register('starwars', {
    id: 'starwars',
    name: 'Star Wars Unlimited',
    listSets, getSet, getCard, search, versions, byCode, setIdsByName, price, tpMarket, img, recognize, manual, codesIn, names, // (pas de foil() : brillant pas mesurable, voir plus haut)
    visualIndex: { index: 'data/sw-index', v: SW_INDEX_V },
    visualCheck: (blob) => (useVisual() ? visualPass(blob, [], []) : Promise.resolve(null)),
    langFor: () => 'fr',
    printedCode: (c) => c.code || '',
    cardmarketUrl: (card) => cm(card.nameEn ? card.nameEn.replace(/\s*\(.*\)$/, '').split(',')[0] : card.baseName || card.name),
    boosterUrl: (set) => cm((set.en || set.name) + ' booster'),
    isOfficial: (localId, set) => isOfficialIn(localId, memo && (memo.sets.find((s) => s.id === set.id) || {}).max),
    logoText: (s) => (s.id === 'P24' ? 'Promos 24' : s.id),
    extraLabel: 'versions Hyperspace, Showcase et Prestige',
    priceNote: 'Prix : marché américain TCGplayer (cartes anglaises), converti en euros, mise à jour quotidienne.',
    rarity,
    pullRates: () => null,
    source: { name: 'Fantasy Flight Games (base officielle des cartes)', url: 'https://starwarsunlimited.com/fr/cards' },
  });
})();
