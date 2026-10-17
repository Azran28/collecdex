/*
 * Adaptateur Disney Lorcana (v3.21, 4ᵉ licence).
 * Cartes : data/lc-cartes.json, préparé depuis LorcanaJSON (données des applications officielles de Ravensburger) par
 * outils/ci/lorcana-cartes.mjs et remis à jour chaque lundi par le robot de l'index : noms, textes, séries, raretés EN FRANÇAIS
 * (et nom anglais à côté, pour les cartes anglaises et l'import d'un fichier).
 * Visuels : les images officielles françaises de Ravensburger (api.lorcana.ravensburger.com, refusent d'être lues par une page)
 * → relayées par images.weserv.nl, comme One Piece et Riftbound (comparaison d'images possible).
 * Prix : marché TCGplayer (en $), préparé chaque jour par le robot de mise en ligne (data/lc-prix.json, outils/ci/prix-lorcana.mjs),
 * relié à chaque carte par son numéro de produit TCGplayer.
 * Identifiant d'une carte = « <série>-<numéro> » : « 1-1 » (Ariel, Premier Chapitre), « 1-205 » (enchantée), « 3-4a » (chiots),
 * « p1-18 » (promo 18/P1), « q1-3 » (quête) ; numéro affiché = celui imprimé (« 205 », « 4a »).
 */
(() => {
  const DAY = 24 * 3600 * 1000;
  const { norm } = App.util;

  // ---------- Données (fichier du site, gardé en cache : utilisable hors ligne ; relu à chaque nouvelle version du site) ----------
  let indexP = null;
  const index = () => indexP || (indexP = (async () => {
    const hit = await App.db.get('cache', 'lc1:index').catch(() => null);
    if (hit && hit.ver === window.APP_VERSION && Date.now() - hit.t < 3 * DAY) return hit.v;
    try {
      const r = await fetch('data/lc-cartes.json', { cache: 'no-cache' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const v = await r.json();
      await App.db.set('cache', 'lc1:index', { t: Date.now(), ver: window.APP_VERSION, v }).catch(() => {});
      return v;
    } catch (e) {
      if (hit) { console.warn('Réseau indisponible, données en cache utilisées', e); return hit.v; }
      indexP = null;
      throw e;
    }
  })());

  // ---------- Raretés ----------
  // clé → [rang, nom FR (celui des cartes françaises), sigle, couleur (celle du symbole imprimé sur la carte)]
  const RAR = {
    c:  [1,  'Commune',     'C',  '#a9b0ba'],
    u:  [2,  'Inhabituelle', 'I',  '#5aa77a'],
    r:  [4,  'Rare',        'R',  '#d0874f'],
    sr: [6,  'Très rare',   'TR', '#b8c4d6'],
    l:  [8,  'Légendaire',  'L',  '#e8b923'],
    e:  [9,  'Épique',      'É',  '#8f7cf0'],
    en: [11, 'Enchantée',   'En', 'url(#rbw)'],
    i:  [12, 'Iconique',    'Ic', 'url(#gpk)'],
    p:  [10, 'Spéciale',    'S',  '#d9425f'],
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
  // brillance (f : 1 = normale, 2 = brillante, 3 = les deux — toutes les cartes des boosters existent aussi en brillant)
  const variantsOf = (f) => (f === 2 ? { holo: true } : f === 3 ? { normal: true, holo: true } : { normal: true });

  // ---------- Séries ----------
  const GROUPS = { main: { id: 'lc-main', name: 'Chapitres' }, quest: { id: 'lc-quest', name: 'Quêtes des Illumineurs' }, promo: { id: 'lc-promo', name: 'Promos' } };
  const INK = { am: 'Ambre', amy: 'Améthyste', em: 'Émeraude', ru: 'Rubis', sa: 'Saphir', st: 'Acier' };
  const TYPE = { ch: 'Personnage', ac: 'Action', it: 'Objet', lo: 'Lieu' };
  /** Nom affiché : « Ariel - Sur des jambes humaines » (comme sur les cartes et chez Ravensburger) */
  const nameOf = (k) => (k.v ? `${k.n} - ${k.v}` : k.n);

  let memo = null;
  async function data() {
    const idx = await index();
    if (memo && memo.idx === idx) return memo;
    const byId = new Map(), bySet = new Map(), byTp = new Map();
    for (const k of idx.cards) { byId.set(k.id, k); if (!bySet.has(k.s)) bySet.set(k.s, []); bySet.get(k.s).push(k); }
    const sets = idx.sets.filter((s) => bySet.has(s.id)).map((s) => {
      const list = bySet.get(s.id);
      return {
        id: s.id, name: s.name, en: s.en, logo: '', symbol: '', releaseDate: s.date, sortKey: s.date || `9999-${s.id}`, type: s.type,
        total: list.length, official: s.base ? list.filter((k) => isOfficialIn(k.l, s.base)).length : list.length, max: s.base, group: GROUPS[s.type] || GROUPS.main,
      };
    });
    memo = { idx, byId, bySet, byTp, sets };
    return memo;
  }
  /** Numéro « de la série » : sans lettre, pas au-delà du dernier numéro imprimé (« /204 » : les enchantées 205 à 216 sont en plus) */
  const isOfficialIn = (localId, max) => /^\d+$/.test(String(localId)) && +localId >= 1 && (!max || +localId <= max);
  async function listSets() {
    const { sets } = await data();
    return sets.map(({ max, en, type, ...s }) => s);
  }

  // ---------- Cartes ----------
  const order = (k) => { const m = String(k.l).match(/^(\d+)(.*)$/); return m ? [+m[1], m[2]] : [9999, k.l]; };
  const cmp = (a, b) => { const x = order(a), y = order(b); return (x[0] - y[0]) || String(x[1]).localeCompare(String(y[1])); };
  // (total imprimé sur les cartes, « /204 » ; promos : pas de total)
  const setShape = (s) => ({ id: s.id, name: s.name, logo: '', symbol: '', releaseDate: s.releaseDate, sortKey: s.sortKey, cardCount: { total: s.total, official: s.max || 0 }, serie: s.group });
  function normCard(k, s) {
    const inks = (k.k || []).map((x) => INK[x] || x);
    const facts = [TYPE[k.t] || '', inks.join(' / '), k.co != null ? `Coût ${k.co}${k.iw ? ' (encrier)' : ''}` : '',
      k.sg != null ? `Force ${k.sg}` : '', k.wp != null ? `Volonté ${k.wp}` : '', k.lo ? `${k.lo} éclat${k.lo > 1 ? 's' : ''} de Lore` : '',
      k.mv != null ? `Déplacement ${k.mv}` : '', (k.sb || []).join(' · '), k.st || '', k.o ? `Promo du chapitre ${k.o}` : ''].filter(Boolean);
    return {
      id: k.id, localId: k.l, name: nameOf(k), baseName: k.n, version: k.v || '', nameEn: k.ne || '', image: k.img ? 'https://api.lorcana.ravensburger.com/images/' + k.img : '',
      rarity: k.r, variants: variantsOf(k.f), category: TYPE[k.t] || '', kind: k.t || '', types: [], facts, text: k.x || '', illustrator: k.a || '',
      inks: k.k || [], cost: k.co, inkwell: !!k.iw, strength: k.sg, willpower: k.wp, lore: k.lo, moveCost: k.mv, subtypes: k.sb || [], story: k.st || '',
      tp: k.tp || 0, cm: k.cm || 0, enOnly: !!k.enOnly,
      setId: s.id, serieId: s.group.id, alt: /[a-z]$/.test(k.l) || (s.max > 0 && +k.l > s.max),
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

  // ---------- Prix (TCGplayer, préparés par le robot : data/lc-prix.json = { m: date, p: { n° de produit TCGplayer: [normal, brillant] } }) ----------
  // (pas de fichier : site du PC d'Arnaud → celui du site en ligne, que GitHub Pages permet de lire ; sinon pas de prix)
  const ONLINE = 'https://azran28.github.io/collecdex/data/lc-prix.json';
  // gardés 12 h ; une liste vide (fichier pas encore préparé, réseau coupé) seulement 15 min, pour réessayer bientôt
  let pricesP = null;
  const prices = () => pricesP || (pricesP = (async () => {
    const hit = await App.db.get('cache', 'lc1:prix').catch(() => null);
    const full = hit && hit.v && hit.v.p && Object.keys(hit.v.p).length;
    if (hit && Date.now() - hit.t < (full ? DAY / 2 : 15 * 60 * 1000)) return hit.v;
    for (const u of ['data/lc-prix.json', ONLINE]) {
      const r = await fetch(u, { cache: 'no-cache' }).catch(() => null);
      const v = r && r.ok ? await r.json().catch(() => null) : null;
      if (v && v.p && Object.keys(v.p).length) { await App.db.set('cache', 'lc1:prix', { t: Date.now(), v }).catch(() => {}); return v; }
    }
    if (full) return hit.v; // (réseau coupé : les derniers prix connus)
    await App.db.set('cache', 'lc1:prix', { t: Date.now(), v: { m: '', p: {} } }).catch(() => {});
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
      set: { id: s.id, name: s.name, logo: '', symbol: '', releaseDate: s.releaseDate, cardCount: { total: s.total, official: s.max || 0 }, serie: s.group },
      pricing: p ? { tcgplayer: { normal: p[0] || null, holo: p[1] || null }, updated: P.m || '' } : null,
    };
  }
  // carte possédée en brillant : prix du brillant ; sinon le prix de la version qui existe
  const tpMarket = (tp, variant) => (tp ? (variant === 'holo' ? tp.holo || tp.normal : tp.normal || tp.holo) || null : null);
  function price(card, variant) {
    const tp = card && card.pricing && card.pricing.tcgplayer;
    const v = tpMarket(tp, variant || (card && card.variants && !card.variants.normal ? 'holo' : 'normal'));
    return v > 0 ? { value: v, unit: 'USD', source: 'TCGplayer', updated: card.pricing.updated, raw: tp } : null;
  }

  // ---------- Recherche ----------
  /** Cartes de la base au format des propositions du scanner */
  async function fromIds(ids) {
    const D = await data(), out = [];
    for (const id of ids) {
      const k = D.byId.get(id); if (!k) continue;
      const s = D.sets.find((x) => x.id === k.s); if (!s) continue;
      out.push({ ...normCard(k, s), set: setShape(s) });
    }
    return out;
  }
  /** La carte d'un numéro dans une série (« 1 », « 205 ») et ses variantes à lettre (« 4 » → 4a…4e) */
  async function byCode(setId, num) {
    const D = await data(), list = D.bySet.get(String(setId).toUpperCase()) || D.bySet.get(String(setId)) || [];
    const n = String(num).toLowerCase().replace(/^0+(?=\d)/, '');
    const base = (l) => String(l).toLowerCase().replace(/^0+(?=\d)/, '').replace(/(\d)[a-z]+$/, '$1');
    return fromIds(list.filter((k) => k.l === n || base(k.l) === base(n)).sort((a, b) => (b.l === n) - (a.l === n) || cmp(a, b)).map((k) => k.id));
  }
  async function search({ name }) {
    const q = norm(name); if (!q) return [];
    const D = await data();
    // code : « 1-205 », « 205/204 • FR • 1 », « P1-18 », « 18/P1 »
    const c = codesIn(name);
    if (c.length) { const [s, n] = c[0][0].split('|'); const r = await byCode(s, n); if (r.length) return r; }
    const m = String(name).trim().match(/^(\d{1,2}|Q\d|[A-Z]{1,3}\d?)\s*[-·.\s]\s*(\d{1,3}[a-e]?)$/i);
    if (m) { const r = await byCode(m[1].toUpperCase(), m[2]); if (r.length) return r; }
    const ids = [];
    for (const k of D.idx.cards) if (norm(nameOf(k)).includes(q) || (k.ne && norm(k.ne).includes(q))) ids.push(k.id);
    return fromIds(ids.slice(0, 300));
  }
  /** Séries dont le nom ou le code correspond (« Premier Chapitre », « The First Chapter », « 1 ») — import d'un fichier */
  async function setIdsByName(name) {
    const q = norm(name); if (!q) return [];
    const sets = (await data()).sets, names = (s) => [s.id, s.name, s.en || '', s.type === 'main' ? `chapitre ${s.id}` : ''].map(norm);
    const exact = sets.filter((s) => names(s).includes(q));
    return (exact.length ? exact : sets.filter((s) => names(s).some((n) => n && n.length > 2 && (n.includes(q) || q.includes(n))))).map((s) => s.id);
  }
  async function versions(name) {
    const n = norm(name);
    return (await search({ name })).filter((c) => norm(c.name) === n || norm(c.nameEn) === n);
  }
  /** Noms des cartes (français et anglais : reconnaître le nom lu sur la carte) : nom normalisé → ids */
  let namesMemo = null;
  async function names() {
    const D = await data();
    if (namesMemo && namesMemo.D === D) return namesMemo.m;
    const m = new Map();
    const add = (x, id) => { const key = norm(x); if (key.length < 3) return; if (!m.has(key)) m.set(key, new Set()); m.get(key).add(id); };
    for (const k of D.idx.cards) { add(nameOf(k), k.id); if (k.v) add(k.v, k.id); if (k.ne) { add(k.ne, k.id); add(k.ne.replace(/^.*? - /, ''), k.id); } }
    namesMemo = { D, m };
    return m;
  }

  // sachet de booster de chaque chapitre (produit TCGplayer) — à ajouter à chaque nouveau chapitre :
  // [produit, largeur, hauteur de l'image _400w, puis la zone du sachet x0, y0, x1, y1 (le reste est blanc)], mesurés sur l'image
  const PACKS_CROP = {
    1: [482406, 400, 695, 0, 0, 400, 695], 2: [516297, 400, 692, 0, 0, 400, 692], 3: [531523, 400, 400, 90, 10, 310, 391], 4: [543860, 400, 400, 87, 9, 306, 389],
    5: [555142, 400, 400, 87, 9, 306, 389], 6: [578095, 400, 400, 87, 10, 307, 391], 7: [607760, 400, 682, 5, 6, 395, 676], 8: [623063, 400, 678, 12, 14, 387, 658],
    9: [649927, 400, 678, 11, 15, 387, 659], 10: [652701, 400, 672, 15, 14, 387, 654], 11: [664821, 400, 672, 24, 14, 377, 655], 12: [678167, 400, 688, 0, 0, 400, 688],
    13: [690386, 400, 672, 15, 14, 387, 656], 14: [706241, 400, 672, 15, 13, 387, 652],
  };

  // ---------- Images ----------
  // visuels officiels français (JPEG 1468 × 2048, ~250 Ko ; les lieux y sont déjà tournés dans le sens du classeur)
  // → relais images.weserv.nl (réduit, en webp, et autorise CORS : comparaison d'images)
  const img = {
    card: (c, q = 'low') => {
      const u = (c && c.image) || '';
      if (!/^https:\/\/api\.lorcana\.ravensburger\.com\//.test(u)) return u;
      return `https://images.weserv.nl/?url=${encodeURIComponent(u)}&w=${q === 'high' ? 720 : 360}&output=webp`;
    },
    // visuel du chapitre : son sachet de booster, photo de TCGplayer (affichée directement, comme Riftbound ; le relais d'images
    // refuse TCGplayer) ; quêtes et promos : le code de la série
    logo: (s) => (s && PACKS_CROP[s.id] ? `https://tcgplayer-cdn.tcgplayer.com/product/${PACKS_CROP[s.id][0]}_400w.jpg` : ''),
    logoCrop: (s) => { const p = s && PACKS_CROP[s.id]; return p ? { W: p[1], H: p[2], x0: p[3], y0: p[4], x1: p[5], y1: p[6] } : null; },
    symbol: () => '',
  };
  const cm = (q) => `https://www.cardmarket.com/fr/Lorcana/Products/Search?searchString=${encodeURIComponent(q)}`;

  // ---------- Reconnaissance d'une photo ----------
  // le code est imprimé en bas à gauche : « 1/204 • FR • 1 » (numéro / total, langue, chapitre) ; promo : « 18/P1 • FR • 2 » ;
  // quête : « 1/31 • FR • Q1 ». Le total et le chapitre désignent la série, le numéro la carte (une seule carte par code).
  const D_ = '[0-9OILSDQZBG|]';
  const ALT = { O: ['0'], D: ['0'], Q: ['0', '9'], I: ['1'], L: ['1'], '|': ['1'], S: ['5', '9'], G: ['6', '9'], Z: ['2'], B: ['8'] };
  function digitsOf(s) {
    let out = [['', 1]];
    for (const ch of s) {
      const opts = /\d/.test(ch) ? [ch] : ALT[ch] || [];
      if (!opts.length) return [];
      out = out.flatMap(([p, w]) => opts.map((d, i) => [p + d, w * (opts.length > 1 ? (i ? 0.35 : 0.55) : /\d/.test(ch) ? 1 : 0.9)]));
    }
    return out;
  }
  // groupes de promos imprimés à la place du total (« 18/P1 ») ; lus de travers : « PI », « Pl », « P|»
  const PROMO_RE = 'P[1Il|]|P[2-9]|C[1Il|]|C[2-9]|D23|DIS|PD[1Il|]|RPH|CC[1Il|]';
  const fixGrp = (g) => g.replace(/[Il|]$/, '1');
  // langue (deux lettres, souvent mal lue) entre deux puces « • » (lues « . », « - », « + », « * », « e », rien)
  const SEP = String.raw`\s*[^A-Z0-9\s]{0,2}\s*`;
  const codeRe = () => new RegExp(String.raw`(?<![0-9])(${D_}{1,3})([a-e])?\s*[/|]\s*(?:(${D_}{2,3})|(${PROMO_RE}))${SEP}(?:[A-Z]{2}${SEP})?(Q${D_}|${D_}{1,2})?(?![0-9])`, 'gi');
  // totaux imprimés connus (« /204 ») par chapitre : un code lu sans chapitre désigne quand même sa série
  const TOTALS = () => (memo ? memo.sets.filter((s) => s.max).map((s) => [s.id, s.max]) : []);
  /** Codes lus (« 1|205 », « P1|18 », avec un poids) */
  function codesIn(text) {
    const out = [], T = String(text || '').toUpperCase().replace(/[‐-―]/g, '-');
    const sets = memo ? new Set(memo.sets.map((s) => s.id)) : null;
    for (const m of T.matchAll(codeRe())) {
      const [, rawNum, suf = '', rawTot, grp, rawSet] = m;
      const nums = digitsOf(rawNum).filter(([n]) => +n >= 0 && +n <= 400);
      if (!nums.length) continue;
      const tot = rawTot ? digitsOf(rawTot).map(([t]) => +t) : [];
      // série : groupe de promos (« P1 »), sinon le chapitre lu à la fin (« • 1 »), vérifié avec le total (« /204 ») s'il est lu
      let cands = [];
      if (grp) cands = [[fixGrp(grp), 1.1]];
      else {
        const setsRead = rawSet ? (/^Q/.test(rawSet) ? [['Q' + (digitsOf(rawSet.slice(1))[0] || [''])[0], 1]] : digitsOf(rawSet).map(([s, w]) => [String(+s), w])) : [];
        const byTot = TOTALS().filter(([, max]) => tot.includes(max)).map(([id]) => id);
        for (const [s, w] of setsRead) if (!sets || sets.has(s)) cands.push([s, w * (byTot.includes(s) ? 1.2 : byTot.length ? 0.6 : 1)]);
        if (!cands.length) for (const id of byTot) cands.push([id, 0.5 / byTot.length]); // (chapitre illisible : série devinée par son total)
      }
      for (const [s, ws] of cands) for (const [n, wn] of nums) out.push([`${s}|${String(+n)}${suf.toLowerCase()}`, ws * wn]);
    }
    return out;
  }
  // zones de lecture (fractions de la carte) : petite bande du bas à gauche (code, texte blanc sur noir) très agrandie ;
  // puis le nom (bandeau au milieu, texte blanc sur la couleur de l'encre), en négatif
  const CODE_ZONES = [[0.955, 0.99, 8, 'invert', 0.02, 0.32], [0.95, 0.99, 8, 'otsu', 0.02, 0.32], [0.945, 0.995, 7, 'sharp', 0.01, 0.4], [0.94, 0.995, 6, 'invert', 0.01, 0.45]];
  const NAME_ZONES = [[0.53, 0.63, 2.5, 'sharp', 0.04, 0.72], [0.53, 0.63, 2.5, 'invert', 0.04, 0.72]];
  const SLIDE_ZONES = [0.86, 0.9, 0.93, 0.955].map((y) => [y, y + 0.045, 7, 'invert', 0.01, 0.45]);
  async function otherCrops(orig) {
    const out = [];
    try {
      const bmp = await createImageBitmap(orig), k = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      const r = App.recognizer.cutCard(c, { x: 0.02, y: 0.02, w: 0.96, h: 0.96 });
      const sane = App.views && App.views.scan && App.views.scan.sane;
      if (r && r.fit >= 0.45 && (!sane || sane(r))) out.push({ blob: await new Promise((res) => r.canvas.toBlob(res, 'image/jpeg', 0.92)), zones: CODE_ZONES, asPhoto: true });
      out.push({ blob: await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.9)), zones: SLIDE_ZONES });
    } catch (e) { console.warn(e); }
    return out.filter((x) => x.blob);
  }

  // ---------- Vérification par l'image : réseau de neurones + points clés (js/visual.js › check), index data/lc-index ----------
  const LC_INDEX_V = 1;
  // seuil « sûre » par l'image seule, comme Riftbound (visuels officiels FRANÇAIS ici : même carte, mêmes textes)
  const IMG_SURE = 30;
  const useVisual = () => App.visual && App.visual.supported() && App.settings.visualCheck !== false;
  // setId : série de la page / choisie — même dessin dans deux séries (réimpressions, promos) : celle-ci d'abord
  const visualOpts = (codes, setId = '') => ({
    index: 'data/lc-index', v: LC_INDEX_V, cardsOf: (near) => fromIds(near.map((x) => x.id)), urlOf: (c) => img.card(c, 'low'),
    twinsOf: (top) => byCode(top.setId, String(top.localId).replace(/[a-z]+$/, '')), // (chiots dalmatiens 4a…4e : même numéro, autre dessin)
    twinKey: (c) => c.id,
    tie: (a, b) => (codes.includes(b.id) - codes.includes(a.id)) || ((b.setId === setId) - (a.setId === setId)) || (a.alt - b.alt),
  });
  /** Recadrage sur les vrais bords autour des coins trouvés par l'image (même principe que Riftbound, v3.14 / v3.18) */
  async function edgeCrop(blob, quad) {
    if (!quad) return null;
    try {
      const bmp = await createImageBitmap(blob), c = document.createElement('canvas');
      c.width = bmp.width; c.height = bmp.height; c.getContext('2d').drawImage(bmp, 0, 0);
      const cl = (v) => Math.min(1, Math.max(0, v));
      const E = quad.map(([x, y]) => [cl(x), cl(y)]);
      if (E.some(([x, y]) => x < 0.03 || x > 0.97 || y < 0.03 || y > 0.97)) return null; // (photo déjà recadrée sur la carte)
      const sq = App.recognizer.snapQuad ? App.recognizer.snapQuad(c, E) : null;
      if (sq) {
        const q = sq.map(([x, y]) => [x * c.width, y * c.height]), qw = (Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]) + Math.hypot(q[2][0] - q[3][0], q[2][1] - q[3][1])) / 2;
        const out = App.recognizer.warpQuad(c, q, Math.min(900, Math.max(240, Math.round(qw))));
        return await new Promise((res) => out.toBlob(res, 'image/jpeg', 0.92));
      }
      const xs = E.map((p) => p[0]), ys = E.map((p) => p[1]);
      const r = App.recognizer.cutCard(c, { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }, { expect: E });
      if (!r || !r.canvas || r.fit < 0.45 || !r.quad) return null;
      if (r.quad.some((p, i) => Math.hypot(p[0] - E[i][0], p[1] - E[i][1]) > 0.12)) return null;
      return await new Promise((res) => r.canvas.toBlob(res, 'image/jpeg', 0.92));
    } catch (e) { return null; }
  }
  async function visualPass(blob, cands, codes, context = null, setId = '') {
    const V = App.visual, o = await V.check(blob, cands, visualOpts(codes, setId));
    const top = o && o.cands[0];
    const edge = top && top.orb >= V.SURE ? await edgeCrop(blob, o.quad) : null;
    if (edge) o.crop = edge;
    if (!context || !o) return o;
    if (top && top.orb >= V.SURE) {
      // coins de la carte dans les alentours de la case (ctxQuad) → recalage de la grille du classeur (scan-batch-realign.js)
      const cq = o.url ? await V.quadOn(context, top, o.url).catch(() => null) : null;
      if (cq) o.ctxQuad = cq;
      if (edge) return o;
      const crop = (cq && await edgeCrop(context, cq)) || (o.url ? await V.cropOn(context, top, o.url).catch(() => null) : null);
      return crop ? { ...o, crop } : o;
    }
    const w = await V.check(context, cands, visualOpts(codes, setId)).catch(() => null);
    if (w && w.quad) w.ctxQuad = w.quad;
    return w && w.cands[0] && w.cands[0].confident ? w : o;
  }

  /**
   * Lit une photo de carte (déjà recadrée) : code imprimé (« 1/204 • FR • 1 »), nom (français ou anglais), puis vérification
   * par l'image. Même déroulé que Riftbound. Renvoie { info: { code, name, read, crop… }, cands }.
   */
  async function recognize(blob, statusFn = () => {}, { setId = '', original = null, context = null } = {}) {
    const R = App.recognizer, D = await data();
    const early = useVisual() ? visualPass(blob, [], [], context, setId).catch((e) => { console.warn('vérification par l’image', e); return null; }) : null;
    statusFn('Lecture du code de la carte…');
    const texts = await R.readZones(blob, CODE_ZONES.slice(0, 2));
    let read = texts.map(codesIn), betterCrop = null;
    const anyCode = () => read.some((r) => r.length);
    if (!anyCode() && !early) { const t = await R.readZones(blob, [...CODE_ZONES.slice(2), ...NAME_ZONES]); texts.push(...t); read.push(...t.map(codesIn)); }
    if (early && !anyCode()) {
      statusFn('Vérification par l’image…');
      const e = await early;
      if (e && e.cands[0] && e.cands[0].confident && (e.cands[0].orb || 0) >= IMG_SURE) return { info: { code: e.cands[0].id, name: '', votes: {}, crop: e.crop, ctxQuad: e.ctxQuad, orb: e.best, read: 'reconnue à l’image ✓' }, cands: e.cands.slice(0, 40) };
      const crop = e && e.crop;
      statusFn(crop ? 'Lecture du code (carte recadrée)…' : 'Lecture du code…');
      const t = await R.readZones(crop || blob, crop ? CODE_ZONES : [...CODE_ZONES.slice(2), ...(context ? [] : NAME_ZONES)]); texts.push(...t); read.push(...t.map(codesIn));
      if (anyCode() && crop) betterCrop = crop;
    }
    if (original && !context && !anyCode()) {
      statusFn('Lecture du code (autre cadrage)…');
      for (const alt of await otherCrops(original)) {
        const t = await R.readZones(alt.blob, alt.zones); texts.push(...t); read.push(...t.map(codesIn));
        if (anyCode()) { betterCrop = alt.asPhoto ? alt.blob : null; break; }
      }
    }
    if (!anyCode() && !(context && early)) { statusFn('Lecture de toute la carte…'); const [full] = await R.readZones(blob, ['full']); texts.push(full); read.push(codesIn(full)); }
    // votes : « série|numéro » → poids ; seuls les codes qui existent comptent
    const votes = {};
    for (const r of read) for (const [c, w] of r) votes[c] = (votes[c] || 0) + w;
    const idOf = (c) => { const [s, n] = c.split('|'); const k = (D.bySet.get(s) || []).find((x) => x.l === n); return k && k.id; };
    let codes = Object.keys(votes).filter(idOf).sort((a, b) => votes[b] - votes[a]);
    if (codes.length) codes = codes.filter((c) => votes[c] >= votes[codes[0]] * 0.5);
    // nom (français, ou anglais pour une carte anglaise) : « ARIEL » + « Sur des jambes humaines »
    statusFn('Recherche de la carte…');
    const nm = await names(), lines = texts.join('\n').split('\n').map((l) => norm(l)).filter((l) => l.length >= 3);
    // (nom et version sur deux lignes : chaque ligne seule, et chaque paire de lignes voisines)
    const tries = [...lines, ...lines.slice(1).map((l, i) => `${lines[i]} ${l}`)];
    let best = { k: '', s: 0 };
    const keys = [...nm.keys()];
    for (const l of tries) for (const k of keys) {
      if (Math.abs(k.length - l.length) > Math.max(3, k.length * 0.4)) continue;
      const s = l === k ? 1 : l.includes(k) && k.length >= 8 ? 0.9 : App.util.similarity(l, k);
      if (s > best.s) best = { k, s };
    }
    const nameOk = best.s >= 0.8 ? best.k : '';
    const nameIds = nameOk ? [...nm.get(nameOk)] : [];
    let agreed = false;
    let cands = [];
    for (const c of codes.slice(0, 3)) { const [s, n] = c.split('|'); cands.push(...(await byCode(s, n))); }
    const codeIds = new Set(codes.map(idOf).filter(Boolean));
    if (nameOk && cands.length) { const ok = cands.filter((c) => nameIds.includes(c.id)); if (ok.length) agreed = true; }
    if (!cands.length && nameOk) cands = (await fromIds(nameIds)).sort((a, b) => ((b.setId === setId) - (a.setId === setId)) || String(b.set.sortKey).localeCompare(String(a.set.sortKey)));
    const seen = new Set(); cands = cands.filter((x) => !seen.has(x.id) && seen.add(x.id));
    cands.sort((a, b) => (codeIds.has(b.id) - codeIds.has(a.id)) || ((nameIds.includes(b.id)) - (nameIds.includes(a.id))));
    for (const c of cands) { c.numOk = codeIds.has(c.id); c.ofOk = c.numOk; }
    // illustration comparée à la photo (chiots 4a…4e, réimpressions d'un même nom)
    if (cands.length > 1) {
      statusFn('Comparaison des illustrations…');
      const thumb = (c) => img.card(c, 'low').replace('&w=360', '&w=160');
      const pool = cands.slice(0, 24), vis = await R.resemblanceMany(blob, pool, thumb).catch(() => new Map());
      for (const c of cands) c.visual = vis.has(c.id) ? vis.get(c.id) : null;
      cands.sort((a, b) => (Math.round(((b.visual ?? -1) - (a.visual ?? -1)) * 16)) || (codeIds.has(b.id) - codeIds.has(a.id)) || (a.alt - b.alt));
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
    }
    if (orb && orb.crop) betterCrop = orb.crop;
    const cropLater = !orb && early && top ? early.then((e) => (e && e.crop && e.cands[0] && e.cands[0].id === top.id ? e.crop : null), () => null) : null;
    const codeTxt = (c) => { const [s, n] = c.split('|'); return /^\d+$/.test(s) ? `n° ${n}, chapitre ${s}` : `n° ${n}/${s}`; };
    const byImg = codes.length && top && !codeIds.has(top.id) && top.orb >= 25;
    const readTxt = codes.length ? `${byImg ? codeTxt(`${top.setId}|${top.localId}`) : codeTxt(codes[0])}${byImg ? ' (corrigé grâce à l’illustration)' : ''}` : '';
    return { info: { code: top ? top.id : '', name: nameOk, votes, crop: betterCrop, cropLater, ctxQuad: orb && top && orb.cands[0] === top ? orb.ctxQuad : null, orb: orb ? orb.best : null, read: [readTxt, nameOk ? `nom « ${nameOk} »` : '', top && top.orb >= 25 ? 'reconnue à l’image ✓' : ''].filter(Boolean).join(', ') }, cands: cands.slice(0, 40) };
  }

  /** Recherche à la main (nom français ou anglais, ou numéro « 205 », « 1-205 », « 18/P1 »), classée par ressemblance avec la photo */
  async function manual(blob, nameTxt, numTxt) {
    const name = (nameTxt || '').trim(), num = (numTxt || '').trim();
    if (!name && !num) throw new Error('Indique un nom, ou un numéro (ex. 25/204 • 1)');
    let cands = await search({ name: num || name });
    // numéro seul (« 25 ») : dans toutes les séries
    if (!cands.length && /^\d{1,3}[a-e]?(\s*\/\s*\d{3})?$/i.test(num)) { const D = await data(); for (const s of D.sets) cands.push(...await byCode(s.id, num.replace(/\s*\/.*$/, ''))); }
    if (num && name) { const n = norm(name), f = cands.filter((c) => norm(c.name).includes(n) || norm(c.nameEn).includes(n)); if (f.length) cands = f; else cands = (await search({ name })).filter((c) => !num || c.localId === num.replace(/\s*\/.*$/, '').replace(/^0+/, '')); }
    if (blob && cands.length > 1) {
      const pool = cands.slice(0, 24), vis = await App.recognizer.resemblanceMany(blob, pool, (c) => img.card(c, 'low').replace('&w=360', '&w=160')).catch(() => new Map());
      for (const c of pool) c.visual = vis.has(c.id) ? vis.get(c.id) : null;
      cands = [...pool.sort((a, b) => (b.visual ?? -1) - (a.visual ?? -1)), ...cands.slice(24)];
    }
    return cands;
  }

  App.games.register('lorcana', {
    id: 'lorcana',
    name: 'Disney Lorcana',
    listSets, getSet, getCard, search, versions, byCode, setIdsByName, price, tpMarket, img, recognize, manual, codesIn, names,
    visualCheck: (blob) => (useVisual() ? visualPass(blob, [], []) : Promise.resolve(null)), // (« Toutes » : licence devinée à l'image)
    langFor: () => 'fr',
    cardmarketUrl: (card) => cm(card.nameEn || card.name),
    boosterUrl: (set) => cm((set.en || set.name) + ' booster'),
    isOfficial: (localId, set) => isOfficialIn(localId, memo && (memo.sets.find((s) => s.id === set.id) || {}).max),
    logoText: (s) => (/^\d+$/.test(s.id) ? `Ch. ${s.id}` : s.id),
    extraLabel: 'enchantées, épiques et iconiques',
    priceNote: 'Prix : marché américain TCGplayer (cartes anglaises), converti en euros, mise à jour quotidienne.',
    rarity,
    pullRates: () => null,
    source: { name: 'LorcanaJSON (données officielles Ravensburger)', url: 'https://lorcanajson.org/' },
  });
})();
