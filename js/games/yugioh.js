/*
 * Adaptateur Yu-Gi-Oh! (v3.26, 5ᵉ licence).
 * Cartes : data/yg-cartes.json, préparé depuis l'API publique de YGOPRODeck (db.ygoprodeck.com) par outils/ci/yugioh-cartes.mjs
 * et remis à jour chaque lundi par le robot de l'index : noms EN FRANÇAIS (et anglais à côté), séries TCG, codes imprimés,
 * raretés. Texte des cartes : demandé à l'API au besoin (fiche d'une carte), en français.
 * Visuels : ceux de YGOPRODeck (cartes anglaises : même illustration que la française), relayés par images.weserv.nl
 * (comparaison d'images possible, et le serveur d'images de YGOPRODeck n'est pas sollicité à chaque affichage).
 * Prix : chaque jour par le robot de mise en ligne (data/yg-prix.json, outils/ci/prix-yugioh.mjs) : prix de l'impression
 * (TCGplayer, en $) sinon le prix Cardmarket de la carte (en €, la moins chère de ses impressions).
 * Identifiant d'une carte = son code imprimé sans la langue : « RGBT-FR007 » → « RGBT-007 » ; anciennes cartes européennes
 * « LOB-F003 » → « LOB-E003 » ; autre rareté du même code : « RA04-087_scr » ; numéro affiché « 007 », « 087 ScR ».
 */
(() => {
  const DAY = 24 * 3600 * 1000;
  const { norm } = App.util;

  // ---------- Données (fichier du site, gardé en cache : utilisable hors ligne ; relu à chaque nouvelle version du site) ----------
  let indexP = null;
  const index = () => indexP || (indexP = (async () => {
    const hit = await App.db.get('cache', 'yg1:index').catch(() => null);
    if (hit && hit.ver === window.APP_VERSION && Date.now() - hit.t < 3 * DAY) return hit.v;
    try {
      const r = await fetch('data/yg-cartes.json', { cache: 'no-cache' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const v = await r.json();
      await App.db.set('cache', 'yg1:index', { t: Date.now(), ver: window.APP_VERSION, v }).catch(() => {});
      return v;
    } catch (e) {
      if (hit) { console.warn('Réseau indisponible, données en cache utilisées', e); return hit.v; }
      indexP = null;
      throw e;
    }
  })());

  // ---------- Raretés ----------
  // clé → [rang, nom (celui des collectionneurs français, souvent l'anglais), sigle, couleur]
  const RAR = {
    c: [1, 'Commune', 'C', '#a9b0ba'], sp: [1, 'Short Print', 'SP', '#a9b0ba'], ssp: [2, 'Super Short Print', 'SSP', '#a9b0ba'],
    npr: [2, 'Normal Parallel Rare', 'NPR', '#9fb7c9'], dnpr: [2, 'Duel Terminal (parallèle)', 'DT', '#9fb7c9'],
    r: [3, 'Rare', 'R', '#c9ccd6'], drpr: [3, 'Duel Terminal Rare', 'DTR', '#c9ccd6'],
    sfr: [4, 'Starfoil Rare', 'SFR', '#7fc8e8'], msr: [4, 'Mosaic Rare', 'MSR', '#7fc8e8'], shr: [4, 'Shatterfoil Rare', 'SHR', '#7fc8e8'],
    sr: [5, 'Super Rare', 'SR', '#5aa7e8'], spr: [5, 'Super Parallel Rare', 'SPR', '#5aa7e8'], dspr: [5, 'Duel Terminal Super', 'DTSR', '#5aa7e8'],
    ur: [6, 'Ultra Rare', 'UR', '#e8b923'], upr: [6, 'Ultra Parallel Rare', 'UPR', '#e8b923'], dupr: [6, 'Duel Terminal Ultra', 'DTUR', '#e8b923'],
    urp: [7, 'Ultra Rare (Pharaoh)', 'URP', '#e8b923'], gur: [7, 'Gold Rare', 'GUR', '#d4a52a'], pgr: [7, 'Premium Gold Rare', 'PGR', '#d4a52a'],
    plr: [7, 'Platinum Rare', 'PlR', '#b8c4d6'], scr: [8, 'Secret Rare', 'ScR', 'url(#rbw)'], gscr: [8, 'Gold Secret Rare', 'GScR', '#d4a52a'],
    plscr: [9, 'Platinum Secret Rare', 'PlScR', '#b8c4d6'], pscr: [9, 'Prismatic Secret Rare', 'PScR', 'url(#rbw)'], escr: [9, 'Extra Secret Rare', 'EScR', 'url(#rbw)'],
    uscr: [9, 'Ultra Secret Rare', 'UScR', 'url(#rbw)'], utr: [10, 'Ultimate Rare', 'UtR', '#c08a4a'], cr: [10, "Collector's Rare", 'CR', 'url(#gpk)'],
    gr: [11, 'Ghost Rare', 'GR', '#dfe6ee'], ggr: [11, 'Ghost/Gold Rare', 'GGR', '#dfe6ee'], str: [12, 'Starlight Rare', 'StR', 'url(#gpk)'],
    qcsr: [12, 'Quarter Century Secret Rare', 'QCScR', 'url(#gpk)'], tscr: [12, '10000 Secret Rare', '10kScR', 'url(#gpk)'], gmr: [12, 'Grand Master Rare', 'GMR', 'url(#gpk)'],
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
  // brillance : donnée par la rareté (Commune, Rare : sans reflet ; Super Rare et au-delà : illustration brillante)
  const holoRar = (r) => !['c', 'sp', 'ssp', 'r', 'drpr'].includes(r);
  const variantsOf = (r) => (holoRar(r) ? { holo: true } : { normal: true });

  // ---------- Vocabulaire (comme sur les cartes françaises) ----------
  const FRAME = { n: 'Monstre Normal', e: 'Monstre à Effet', ri: 'Monstre Rituel', f: 'Monstre Fusion', sy: 'Monstre Synchro', x: 'Monstre Xyz', l: 'Monstre Lien',
    s: 'Carte Magie', t: 'Carte Piège', tk: 'Jeton', sk: 'Carte Compétence', pn: 'Monstre Pendule Normal', pe: 'Monstre Pendule à Effet',
    pri: 'Monstre Pendule Rituel', pf: 'Monstre Pendule Fusion', psy: 'Monstre Pendule Synchro', px: 'Monstre Pendule Xyz' };
  const ATTR = { te: 'Terre', ea: 'Eau', fe: 'Feu', ve: 'Vent', lu: 'Lumière', tn: 'Ténèbres', di: 'Divin' };
  const RACE = { Aqua: 'Aqua', Beast: 'Bête', 'Beast-Warrior': 'Bête-Guerrier', 'Creator-God': 'Dieu Créateur', 'Creator God': 'Dieu Créateur', Cyberse: 'Cyberse', Dinosaur: 'Dinosaure',
    'Divine-Beast': 'Bête Divine', Dragon: 'Dragon', Fairy: 'Elfe', Fiend: 'Démon', Fish: 'Poisson', Illusion: 'Illusion', Insect: 'Insecte', Machine: 'Machine',
    Plant: 'Plante', Psychic: 'Psychique', Pyro: 'Pyro', Reptile: 'Reptile', Rock: 'Rocher', 'Sea Serpent': 'Serpent de Mer', Spellcaster: 'Magicien',
    Thunder: 'Tonnerre', Warrior: 'Guerrier', 'Winged Beast': 'Bête Ailée', Wyrm: 'Wyrm', Zombie: 'Zombie',
    Normal: 'Normale', Field: 'Terrain', Equip: 'Équipement', Continuous: 'Continue', 'Quick-Play': 'Jeu-Rapide', Ritual: 'Rituelle', Counter: 'Contre-Piège' };
  const isMonster = (t) => !['s', 't', 'sk'].includes(t);

  // ---------- Séries ----------
  // (order : ordre des familles sur la page des séries — sinon les promos, les plus récentes, passaient devant les boosters)
  const GROUPS = {
    main: { id: 'yg-main', name: 'Boosters', order: 1 }, deck: { id: 'yg-deck', name: 'Decks de structure et de démarrage', order: 2 },
    coll: { id: 'yg-coll', name: 'Collections et rééditions', order: 3 }, tin: { id: 'yg-tin', name: 'Tins et Mega Packs', order: 4 },
    speed: { id: 'yg-speed', name: 'Speed Duel', order: 5 }, se: { id: 'yg-se', name: 'Éditions spéciales', order: 6 }, promo: { id: 'yg-promo', name: 'Promos et tournois', order: 7 },
  };
  // carte : [passcode, nom (fr), nom anglais (si différent), genre, attribut, niveau / rang / lien, ATK, DEF, type, autres illustrations, sans nom français]
  const K = { pc: 0, n: 1, ne: 2, t: 3, at: 4, lv: 5, atk: 6, def: 7, rc: 8, alt: 9, enOnly: 10 };
  // code sans rareté ni série : « RA04-087_scr@RA04.2 » → « RA04-087 »
  const baseKey = (id) => String(id).replace(/@.*$/, '').replace(/_[a-z0-9]+$/, '');
  const rarOfId = (id) => { const m = String(id).replace(/@.*$/, '').match(/_([a-z0-9]+)$/); return m ? m[1] : ''; };

  let memo = null;
  async function data() {
    const idx = await index();
    if (memo && memo.idx === idx) return memo;
    const byId = new Map(), bySet = new Map(), byKey = new Map(), byPc = new Map(), prefixes = new Set();
    for (const s of idx.sets) {
      const list = (idx.p[s.id] || []).map(([id, ci, r]) => ({ id, s: s.id, c: idx.cards[ci], r }));
      bySet.set(s.id, list);
      for (const p of list) {
        byId.set(p.id, p);
        const k = baseKey(p.id);
        if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(p);
        const pc = p.c[K.pc]; if (!byPc.has(pc)) byPc.set(pc, []); byPc.get(pc).push(p);
        prefixes.add(k.split('-')[0]);
      }
    }
    const sets = idx.sets.filter((s) => (bySet.get(s.id) || []).length).map((s) => {
      const list = bySet.get(s.id);
      return { id: s.id, name: s.name, logo: '', symbol: '', releaseDate: s.date, sortKey: s.date || `9999-${s.id}`, type: s.g, img: s.img,
        total: list.length, official: list.filter((p) => !rarOfId(p.id)).length, group: GROUPS[s.g] || GROUPS.coll };
    });
    // autres illustrations d'une carte (Dragon Ultime aux Yeux Bleus : 3 dessins, passcodes 23995346…48) : même carte
    for (const c of idx.cards) for (const a of Array.isArray(c[K.alt]) ? c[K.alt] : []) if (!byPc.has(a) && byPc.has(c[K.pc])) byPc.set(a, byPc.get(c[K.pc]));
    const setById = new Map(sets.map((s) => [s.id, s]));
    memo = { idx, byId, bySet, byKey, byPc, prefixes, sets, setById, alias: idx.a || {} };
    return memo;
  }
  async function listSets() {
    const { sets } = await data();
    return sets.map(({ type, img, ...s }) => s);
  }

  // ---------- Cartes ----------
  const numOf = (id) => baseKey(id).split('-').slice(1).join('-');
  const localIdOf = (p) => { const r = rarOfId(p.id); return numOf(p.id) + (r && RAR[r] ? ' ' + RAR[r][2] : r ? ' ' + r : ''); };
  const order = (p) => { const n = numOf(p.id), m = n.match(/^([A-Z]*)(\d+)(.*)$/); return m ? [m[1], +m[2], (RAR[p.r] || [0])[0]] : [n, 0, 0]; };
  const cmp = (a, b) => { const x = order(a), y = order(b); return String(x[0]).localeCompare(String(y[0])) || (x[1] - y[1]) || (x[2] - y[2]); };
  const setShape = (s) => ({ id: s.id, name: s.name, logo: '', symbol: '', releaseDate: s.releaseDate, sortKey: s.sortKey, cardCount: { total: s.total, official: s.official }, serie: s.group });
  const nameOf = (c) => c[K.n];
  const imgUrl = (pc) => `https://images.ygoprodeck.com/images/cards/${pc}.jpg`;
  function normCard(p, s) {
    const c = p.c, t = c[K.t], mon = isMonster(t);
    const lvLab = t === 'x' || t === 'px' ? 'Rang' : t === 'l' ? 'Lien' : 'Niveau';
    const facts = [FRAME[t] || '', c[K.at] ? `Attribut ${ATTR[c[K.at]] || c[K.at]}` : '', c[K.rc] ? (mon ? `Type ${RACE[c[K.rc]] || c[K.rc]}` : (RACE[c[K.rc]] || c[K.rc])) : '',
      mon && c[K.lv] != null ? `${lvLab} ${c[K.lv]}` : '', mon && c[K.atk] != null ? `ATK ${c[K.atk] < 0 ? '?' : c[K.atk]}` : '', mon && c[K.def] != null && t !== 'l' ? `DEF ${c[K.def] < 0 ? '?' : c[K.def]}` : '',
      `Code ${baseKey(p.id).replace('-', '-FR')}`, `Passcode ${c[K.pc]}`].filter((x) => x && (mon || !/^Code ?$/.test(x)));
    return {
      id: p.id, localId: localIdOf(p), name: nameOf(c), baseName: nameOf(c), version: '', nameEn: c[K.ne] || (c[K.enOnly] ? c[K.n] : ''), image: imgUrl(c[K.pc]),
      rarity: p.r, variants: variantsOf(p.r), category: FRAME[t] || '', kind: t, types: c[K.at] ? [ATTR[c[K.at]]] : [], facts, text: '', illustrator: '',
      passcode: c[K.pc], attribute: c[K.at] || '', level: c[K.lv], atk: c[K.atk], def: c[K.def], race: c[K.rc] || '', monster: mon, enOnly: !!c[K.enOnly],
      code: baseKey(p.id), setId: s.id, serieId: s.group.id, alt: !!rarOfId(p.id),
    };
  }
  async function getSet(id) {
    id = String(id);
    const D = await data(), s = D.setById.get(id);
    if (!s) throw new Error('Série inconnue : ' + id);
    const set = { ...setShape(s), ...s, cardCount: { total: s.total, official: s.official } };
    set.cards = [...D.bySet.get(id)].sort(cmp).map((p) => normCard(p, s));
    return set;
  }

  // ---------- Texte français (fiche d'une carte) : demandé à YGOPRODeck, gardé 30 jours ----------
  async function textOf(pc) {
    const key = 'yg1:txt:' + pc, hit = await App.db.get('cache', key).catch(() => null);
    if (hit && Date.now() - hit.t < 30 * DAY) return hit.v;
    try {
      const r = await fetch(`https://db.ygoprodeck.com/api/v7/cardinfo.php?id=${encodeURIComponent(pc)}&language=fr`);
      let v = '';
      if (r.ok) { const j = await r.json(); v = (j && j.data && j.data[0] && j.data[0].desc) || ''; }
      else if (r.status === 400) { const e = await fetch(`https://db.ygoprodeck.com/api/v7/cardinfo.php?id=${encodeURIComponent(pc)}`); if (e.ok) { const j = await e.json(); v = (j && j.data && j.data[0] && j.data[0].desc) || ''; } }
      v = String(v).replace(/\r/g, '').slice(0, 3000);
      await App.db.set('cache', key, { t: Date.now(), v }).catch(() => {});
      return v;
    } catch (e) { return hit ? hit.v : ''; }
  }

  // ---------- Prix (préparés par le robot : data/yg-prix.json = { m, p: { « code|rareté » : $ }, c: { passcode : € } }) ----------
  const ONLINE = 'https://azran28.github.io/collecdex/data/yg-prix.json';
  let pricesP = null;
  const prices = () => pricesP || (pricesP = (async () => {
    const hit = await App.db.get('cache', 'yg1:prix').catch(() => null);
    const full = hit && hit.v && hit.v.c && Object.keys(hit.v.c).length;
    if (hit && Date.now() - hit.t < (full ? DAY / 2 : 15 * 60 * 1000)) return hit.v;
    for (const u of ['data/yg-prix.json', ONLINE]) {
      const r = await fetch(u, { cache: 'no-cache' }).catch(() => null);
      const v = r && r.ok ? await r.json().catch(() => null) : null;
      if (v && v.c && Object.keys(v.c).length) { await App.db.set('cache', 'yg1:prix', { t: Date.now(), v }).catch(() => {}); return v; }
    }
    if (full) return hit.v;
    await App.db.set('cache', 'yg1:prix', { t: Date.now(), v: { m: '', p: {}, c: {} } }).catch(() => {});
    return { m: '', p: {}, c: {} };
  })().finally(() => setTimeout(() => { pricesP = null; }, 60000)));
  async function getCard(id) {
    id = String(id);
    const D = await data(), p = D.byId.get(id);
    if (!p) throw new Error('Carte inconnue : ' + id);
    const s = D.setById.get(p.s) || { id: p.s, name: p.s, group: GROUPS.coll, releaseDate: '', sortKey: '', total: 0, official: 0 };
    const [P, text] = await Promise.all([prices().catch(() => ({ p: {}, c: {} })), textOf(p.c[K.pc])]);
    const usd = (P.p || {})[`${baseKey(id)}|${p.r}`] || null, eur = (P.c || {})[p.c[K.pc]] || null;
    return {
      ...normCard(p, s), text,
      set: { id: s.id, name: s.name, logo: '', symbol: '', releaseDate: s.releaseDate, cardCount: { total: s.total, official: s.official }, serie: s.group },
      pricing: usd || eur ? { print: usd, cardmarket: eur, updated: P.m || '' } : null,
    };
  }
  // prix de l'impression (sa rareté) s'il est connu, sinon le prix Cardmarket de la carte (la moins chère de ses impressions)
  function price(card) {
    const p = card && card.pricing;
    if (!p) return null;
    if (p.print > 0) return { value: p.print, unit: 'USD', source: 'TCGplayer', updated: p.updated, raw: p };
    if (p.cardmarket > 0) return { value: p.cardmarket, unit: 'EUR', source: 'Cardmarket', updated: p.updated, raw: p };
    return null;
  }

  // ---------- Recherche ----------
  async function fromIds(ids) {
    const D = await data(), out = [];
    for (const id of ids) {
      const p = D.byId.get(id); if (!p) continue;
      const s = D.setById.get(p.s); if (!s) continue;
      out.push({ ...normCard(p, s), set: setShape(s) });
    }
    return out;
  }
  /** Impressions d'un code (« RGBT-007 », toutes raretés) ; avec setId : seulement dans cette série si elle l'a */
  async function byKey(key, setId = '') {
    const D = await data(), k = D.alias[key] || key, list = D.byKey.get(k) || [];
    const inSet = setId ? list.filter((p) => p.s === setId) : [];
    return fromIds((inSet.length ? inSet : list).slice().sort((a, b) => (RAR[a.r] || [0])[0] - (RAR[b.r] || [0])[0]).map((p) => p.id));
  }
  /** La carte d'un numéro dans une série (« 007 », « 7 », « E003 ») */
  async function byCode(setId, num) {
    const D = await data(), s = D.setById.get(String(setId)) || D.setById.get(String(setId).toUpperCase());
    if (!s) return [];
    const n = String(num).toUpperCase().replace(/\s+.*$/, ''), digits = (x) => x.replace(/^([A-Z]*)0*(?=\d)/, '$1');
    return fromIds(D.bySet.get(s.id).filter((p) => digits(numOf(p.id)) === digits(n)).sort(cmp).map((p) => p.id));
  }
  async function search({ name }) {
    const q = norm(name); if (!q) return [];
    const D = await data();
    const c = codesIn(name);
    if (c.length) { const r = await byKey(c[0][0].replace(/^#/, '')); if (r.length) return r; if (/^#/.test(c[0][0])) return fromIds((D.byPc.get(+c[0][0].slice(1)) || []).map((p) => p.id)); }
    const m = String(name).trim().toUpperCase().match(/^([A-Z0-9]{2,5})\s*-\s*([A-Z]{0,2})(\d{2,3})$/);
    if (m) { const r = await byKey(`${m[1]}-${m[3]}`); if (r.length) return r; }
    // nom : une impression par carte (la plus récente d'abord), puis les autres impressions
    const first = [], rest = [];
    for (const [pc, list] of D.byPc) {
      const k = list[0].c;
      if (!(norm(k[K.n]).includes(q) || (k[K.ne] && norm(k[K.ne]).includes(q)))) continue;
      const sorted = list.slice().sort((a, b) => String((D.setById.get(b.s) || {}).sortKey).localeCompare(String((D.setById.get(a.s) || {}).sortKey)));
      first.push(sorted[0].id); rest.push(...sorted.slice(1).map((p) => p.id));
      if (first.length > 300) break;
    }
    return fromIds([...first, ...rest].slice(0, 300));
  }
  /** Séries dont le nom ou le code correspond (« Raging Battle », « RGBT ») — import d'un fichier */
  async function setIdsByName(name) {
    const q = norm(name); if (!q) return [];
    const sets = (await data()).sets, names = (s) => [s.id, s.name].map(norm);
    const exact = sets.filter((s) => names(s).includes(q));
    return (exact.length ? exact : sets.filter((s) => names(s).some((n) => n && n.length > 3 && (n.includes(q) || q.includes(n))))).map((s) => s.id);
  }
  async function versions(name) {
    const n = norm(name);
    return (await search({ name })).filter((c) => norm(c.name) === n || norm(c.nameEn) === n);
  }
  /** Noms des cartes (français et anglais) : nom normalisé → ids (une impression par carte : la plus récente) */
  let namesMemo = null;
  async function names() {
    const D = await data();
    if (namesMemo && namesMemo.D === D) return namesMemo.m;
    const m = new Map();
    const add = (x, id) => { const key = norm(x); if (key.length < 3) return; if (!m.has(key)) m.set(key, new Set()); m.get(key).add(id); };
    for (const list of D.byPc.values()) { const k = list[0].c; for (const p of list) { add(k[K.n], p.id); if (k[K.ne]) add(k[K.ne], p.id); } }
    namesMemo = { D, m };
    return m;
  }

  // ---------- Images ----------
  // visuels de YGOPRODeck (JPEG 813 × 1185, cartes anglaises) → relais images.weserv.nl (réduit, en webp, autorise CORS)
  const img = {
    card: (c, q = 'low') => {
      const u = (c && c.image) || '';
      if (!/^https:\/\/images\.ygoprodeck\.com\//.test(u)) return u;
      return `https://images.weserv.nl/?url=${encodeURIComponent(u)}&w=${q === 'high' ? 720 : 360}&output=webp`;
    },
    // visuel de la série : son sachet / sa boîte (YGOPRODeck, 100 × 171), sinon le code
    logo: (s) => (s && memo && (memo.setById.get(s.id) || {}).img && !/\./.test(s.id) ? `https://images.weserv.nl/?url=${encodeURIComponent(`https://images.ygoprodeck.com/images/sets/${s.id}.jpg`)}&output=webp` : ''),
    logoCrop: () => null,
    symbol: () => '',
  };
  const cm = (q) => `https://www.cardmarket.com/fr/YuGiOh/Products/Search?searchString=${encodeURIComponent(q)}`;

  // ---------- Reconnaissance d'une photo ----------
  // code imprimé sous l'illustration, à droite : « RGBT-FR007 » (série, langue, numéro) ; anciennes cartes européennes « LOB-F003 » ;
  // et le passcode (8 chiffres) en bas à gauche : « 41160533 » = la carte (pas l'impression).
  const DIG = { O: '0', D: '0', Q: '0', I: '1', L: '1', '|': '1', S: '5', Z: '2', B: '8', G: '6', '/': '7' }; // (« / » : un 7 mal lu, « CRMS-FROO/ »)
  const fixDigits = (s) => s.replace(/[ODQIL|SZBG/]/g, (ch) => DIG[ch]);
  const LANGS = ['FR', 'EN', 'DE', 'IT', 'SP', 'PT'];
  /** Codes lus : [['RGBT-007', poids], ['#41160533', poids]] (seuls les codes qui existent, si les données sont déjà là) */
  function codesIn(text) {
    const out = [], T0 = String(text || '').toUpperCase().replace(/[‐-―–—]/g, '-');
    // (chaque ligne aussi sans ses espaces : « RGB T-FROO7 » lu par Tesseract)
    const T = `${T0}\n${T0.split('\n').map((l) => l.replace(/\s+/g, '')).join('\n')}`;
    const known = memo && memo.byKey, ok = (k) => !known || known.has(k) || memo.alias[k];
    const pre = memo && memo.prefixes;
    // série (2 à 5 lettres ou chiffres) - langue (« FR », « F ») et numéro (« 007 », « S10 », « A26 »)
    for (const m of T.matchAll(/(?<![A-Z0-9])([A-Z0-9]{2,5})\s?-\s?([A-Z0-9|/]{4,6})(?![A-Z0-9])/g)) {
      let [, p, rest] = m;
      const pres = [p, p.replace(/O/g, '0'), p.replace(/0/g, 'O'), p.replace(/1/g, 'I'), p.replace(/5/g, 'S')].filter((x, i, a) => a.indexOf(x) === i && (!pre || pre.has(x)));
      if (!pres.length) continue;
      const tries = [];
      const lang2 = rest.slice(0, 2), tail2 = rest.slice(2);
      // « FR007 », « FRO07 » ; langue mal lue (« FH007 ») : moins sûr
      if (tail2.length >= 2) {
        const w = LANGS.includes(lang2) ? 1 : /^[A-Z]{2}$/.test(lang2) ? 0.6 : 0;
        if (w) { tries.push([fixDigits(tail2), w]); if (/^[A-Z]\w+$/.test(tail2)) tries.push([tail2[0] + fixDigits(tail2.slice(1)), w]); }
      }
      // « F003 », « C032 » (anciennes européennes, françaises du Canada)
      if (/^[CEFGIS]/.test(rest) && rest.length === 4) { tries.push(['E' + fixDigits(rest.slice(1)), 0.9]); tries.push([fixDigits(rest.slice(1)), 0.7]); } // (« SDJ-F006 » : les données n'ont parfois que « SDJ-006 »)
      for (const pp of pres) for (const [n, w] of tries) { const k = `${pp}-${n}`; if (ok(k)) out.push([k, w * (pp === p ? 1 : 0.8)]); }
    }
    // passcode : 8 chiffres seuls (bas gauche) — seulement s'il désigne une carte connue
    if (memo) for (const m of T0.matchAll(/(?<![0-9A-Z])([0-9OIL]{8})(?![0-9])/g)) { const pc = +fixDigits(m[1]); if (memo.byPc.has(pc)) out.push([`#${pc}`, /^\d+$/.test(m[1]) ? 1 : 0.7]); }
    // (une même lecture vue avec et sans espaces : comptée une fois, au meilleur poids)
    const best = new Map(); for (const [k, w] of out) if (!best.has(k) || best.get(k) < w) best.set(k, w);
    return [...best];
  }
  // zones de lecture (fractions de la carte, [haut, bas, agrandissement, réglage, gauche, droite]) : le code, petit, sous
  // l'illustration à droite ; le passcode en bas à gauche ; le nom en haut. Bandes fines qui glissent (la bande haute de 6 %
  // prenait le cadre de l'illustration : rien de lisible) ; agrandissement d'après la taille de la photo, pour des lettres de
  // ~40 pixels (Tesseract lit mal les très grandes lettres : photo de 2 000 pixels × 4 = rien).
  const sizeOf = async (blob) => { try { const b = await createImageBitmap(blob); const h = b.height; b.close && b.close(); return h; } catch (e) { return 900; } };
  const scaleFor = (H, k = 1) => Math.min(6, Math.max(0.8, (40 / (0.016 * H)) * k));
  const CODE_ZONES = (H) => [0.695, 0.71, 0.725, 0.74, 0.755].map((y) => [y, y + 0.04, scaleFor(H), 'sharp', 0.5, 0.98])
    .concat([0.93, 0.95].map((y) => [y, y + 0.045, scaleFor(H), 'sharp', 0, 0.42]));
  // (Pendule : code à gauche sous la boîte de l'échelle ; bandes « otsu » en secours)
  const MORE_ZONES = (H) => [0.705, 0.735].map((y) => [y, y + 0.04, scaleFor(H), 'otsu', 0.5, 0.98])
    .concat([[0.775, 0.815, scaleFor(H), 'sharp', 0.03, 0.5], [0.94, 0.985, scaleFor(H), 'otsu', 0, 0.42]]);
  // nom en haut ; bandes qui glissent (v3.29 : carte détourée trop serrée au téléphone, le titre tout en haut de la découpe : la
  // bande fixe 0,035…0,115 le coupait ; l'image ne retrouvait pas la carte, le nom seul la donne)
  const NAME_ZONES = (H) => [0, 0.02, 0.04, 0.06].flatMap((y) => [[y, y + 0.08, scaleFor(H, 0.55), 'sharp', 0.03, 0.85], [y, y + 0.08, scaleFor(H, 0.55), 'invert', 0.03, 0.85]]);
  // carte recadrée sur ses vrais bords (par l'image ; v3.27 : carte entière, code vers 0,72 de la hauteur) : le code est là où on l'attend, lu de plusieurs façons (Tesseract lit
  // mal cette petite police à empattements : « RGB T-FROO7 », « CRMSTROGI » ; chaque réglage se trompe autrement)
  const CROP_ZONES = (H) => [0.69, 0.7, 0.71, 0.72, 0.73, 0.74].flatMap((y) => [[y, y + 0.035, scaleFor(H, 0.7), 'sharp', 0.5, 0.98], [y, y + 0.035, scaleFor(H, 0.5), 'gray', 0.5, 0.98], [y, y + 0.035, scaleFor(H, 0.5), 'otsu', 0.5, 0.98]])
    .concat([0.93, 0.95].map((y) => [y, y + 0.045, scaleFor(H, 0.7), 'sharp', 0, 0.42]));
  /**
   * Carte déjà reconnue (image, passcode ou nom) : laquelle de ses impressions ? Le code imprimé de chacune (« RGBT-FR007 »,
   * « LC5D-FR088 »…) comparé à ce qui a été lu, lettre à lettre, avec O = 0, I = 1… (même un code mal lu, « RGB T-FROO7 »,
   * « ROBT-FR007 », désigne nettement la bonne). → [ids classés, meilleure note, écart avec la suivante]
   */
  const canon = (s) => String(s).toUpperCase().replace(/\s+/g, '').replace(/[ODQ]/g, '0').replace(/[IJL|]/g, '1').replace(/S/g, '5').replace(/B/g, '8').replace(/Z/g, '2').replace(/\//g, '7');
  function printScores(texts, prints) {
    const lines = texts.join('\n').split('\n').map(canon).filter((l) => l.length >= 5);
    const scored = prints.map((c) => {
      const [pre, num] = c.code.split('-'), want = /^E\d{3}$/.test(num) ? [`${pre}-F${num.slice(1)}`, `${pre}-E${num.slice(1)}`, `${pre}-C${num.slice(1)}`] : [`${pre}-FR${num}`, `${pre}-EN${num}`, ...(/^\d{3}$/.test(num) ? [`${pre}-F${num}`] : [])]; // (« SDJ-F006 » = « SDJ-006 »)
      let s = 0;
      for (const w of want.map(canon)) for (const l of lines) for (let i = -2; i <= l.length - w.length + 2; i++) {
        const part = l.slice(Math.max(0, i), Math.max(0, i) + w.length);
        if (part.length >= w.length - 2) s = Math.max(s, 1 - App.util.lev(part, w) / w.length);
      }
      return { c, s };
    }).sort((a, b) => (b.s - a.s) || (a.c.alt - b.c.alt)); // (même code : la rareté la plus courante d'abord)
    const codes = [...new Set(scored.map((x) => x.c.code))], bestOf = (k) => Math.max(...scored.filter((x) => x.c.code === k).map((x) => x.s));
    return { order: scored.map((x) => x.c), best: scored.length ? scored[0].s : 0, gap: codes.length > 1 ? bestOf(codes[0]) - bestOf(codes[1]) : 1 };
  }
  async function otherCrops(orig) {
    const out = [];
    try {
      const bmp = await createImageBitmap(orig), k = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      const r = App.recognizer.cutCard(c, { x: 0.02, y: 0.02, w: 0.96, h: 0.96 });
      const sane = App.views && App.views.scan && App.views.scan.sane;
      if (r && r.fit >= 0.45 && (!sane || sane(r))) out.push({ blob: await new Promise((res) => r.canvas.toBlob(res, 'image/jpeg', 0.92)), zones: [...CODE_ZONES(r.canvas.height), ...MORE_ZONES(r.canvas.height)], asPhoto: true });
    } catch (e) { console.warn(e); }
    return out.filter((x) => x.blob);
  }

  // ---------- Vérification par l'image : index data/yg-index (une illustration par carte) ----------
  const YG_INDEX_V = 2;
  const IMG_SURE = 30;
  const useVisual = () => App.visual && App.visual.supported() && App.settings.visualCheck !== false;
  // toutes les impressions d'une carte ont la même image : l'image désigne la carte, le code lu (ou la série de la page) l'impression
  // index : une entrée par carte, « #<passcode> » → une impression (celle de la série de la page, sinon la plus ancienne)
  // (rareté la plus courante d'abord : « LODT-041 » plutôt que « LODT-041_utr » quand rien ne les départage)
  const baseFirst = (list) => [...list].sort((a, b) => !!rarOfId(a.id) - !!rarOfId(b.id));
  const printOfPc = (D, id, setId) => { const list = baseFirst(D.byPc.get(+String(id).slice(1)) || []); return ((setId && list.find((p) => p.s === setId)) || list[0] || {}).id; };
  // (autre illustration de la carte, « #23995346 » : son image à elle, pour la comparaison point par point)
  const cardsOfIndex = async (near, setId) => {
    const D = await data(), out = [];
    for (const x of near) {
      const pc = /^#/.test(x.id) ? +x.id.slice(1) : 0, id = pc ? printOfPc(D, x.id, setId) : x.id; if (!id) continue;
      const [c] = await fromIds([id]); if (!c) continue;
      if (pc && pc !== c.passcode) { c.image = imgUrl(pc); c.artId = pc; }
      out.push(c);
    }
    return out;
  };
  const visualOpts = (codes, setId = '') => ({
    index: 'data/yg-index', v: YG_INDEX_V, cardsOf: (near) => cardsOfIndex(near, setId), urlOf: (c) => img.card(c, 'low'),
    twinsOf: null, twinKey: (c) => c.passcode,
    tie: (a, b) => (codes.includes(b.id) - codes.includes(a.id)) || ((b.setId === setId) - (a.setId === setId)) || (a.alt - b.alt),
  });
  /** Carte reconnue à l'image → l'impression : celle du code lu, de la série de la page, sinon toutes (la plus ancienne d'abord) */
  async function printsOf(c, codes, setId) {
    const D = await data(), list = baseFirst(D.byPc.get(c.passcode) || []).map((p) => p.id);
    const read = list.filter((id) => codes.includes(id)), inSet = list.filter((id) => (D.byId.get(id) || {}).s === setId);
    return fromIds([...new Set([...read, ...inSet, c.id, ...list])].slice(0, 40));
  }
  /**
   * Vrais bords de la carte (v3.27, traits jaunes d'Arnaud sur une page de 9 cartes et une carte seule, 18 oct.) : les coins
   * trouvés par l'image (ORB) s'appuient sur l'illustration seule (texte anglais sur l'image de référence, français sur la carte) ;
   * prolonger cette correspondance jusqu'aux coins de la carte amplifie la perspective (4,6 % de la diagonale en moyenne) →
   * transformation affine ajustée sur la zone de l'illustration (`ART_GRID`), puis vrais bords = `OUTER` dans ce repère (les
   * images de YGOPRODeck sont un peu plus serrées que la carte : −3 %…+3 % en largeur, −4 %…+2 % en hauteur). Mesuré sur les
   * 10 cartes dessinées (validation croisée) : 1,9 % en moyenne, pire 3,3 % (bords recalés côté par côté, détecteur appris :
   * essayés, pas mieux).
   */
  const ART_GRID = [0.15, 0.5, 0.85].flatMap((u) => [0.2, 0.425, 0.65].map((v) => [u, v]));
  const OUTER = [[-0.0305, -0.0427], [1.0321, -0.0371], [1.0322, 1.018], [-0.0234, 1.0198]];
  function fullQuad(q) {
    if (!q) return null;
    const f = App.recognizerParts.squareToQuad(q), dst = ART_GRID.map(([u, v]) => f(u, v));
    // moindres carrés : x = a·u + b·v + c, y = d·u + e·v + g
    const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], bx = [0, 0, 0], by = [0, 0, 0];
    ART_GRID.forEach(([u, v], i) => { const r = [u, v, 1]; for (let a = 0; a < 3; a++) { for (let b = 0; b < 3; b++) M[a][b] += r[a] * r[b]; bx[a] += r[a] * dst[i][0]; by[a] += r[a] * dst[i][1]; } });
    const solve = (b) => { const A = M.map((r, i) => [...r, b[i]]); for (let c = 0; c < 3; c++) { let p = c; for (let r = c + 1; r < 3; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; [A[c], A[p]] = [A[p], A[c]]; for (let r = 0; r < 3; r++) if (r !== c) { const k = A[r][c] / A[c][c]; for (let j = c; j < 4; j++) A[r][j] -= k * A[c][j]; } } return A.map((r, i) => r[3] / r[i]); };
    const ax = solve(bx), ay = solve(by);
    if (![...ax, ...ay].every(Number.isFinite)) return q;
    return OUTER.map(([u, v]) => [ax[0] * u + ax[1] * v + ax[2], ay[0] * u + ay[1] * v + ay[2]]);
  }
  /** Carte remise à plat d'après ses coins (fractions de l'image) ; carte qui dépasse un peu de l'image : coins ramenés au bord */
  async function cropQuad(blob, quad) {
    if (!quad || quad.some(([x, y]) => x < -0.06 || x > 1.06 || y < -0.06 || y > 1.06)) return null;
    return App.visual.quadCrop(blob, quad.map(([x, y]) => [Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y))]));
  }
  async function visualPass(blob, cands, codes, context = null, setId = '') {
    const V = App.visual;
    // carte reconnue à l'image → toutes ses impressions (même dessin), la plus probable d'abord
    const expand = async (r) => {
      const top = r && r.cands[0];
      if (!(top && top.orb >= V.SURE)) return r;
      const pr = await printsOf(top, codes, setId), keep = top.orb, sure = !!top.confident;
      if (top.artId) for (const x of pr) { x.image = top.image; x.artId = top.artId; } // (illustration reconnue : celle de la photo)
      for (const x of pr) { x.orb = keep; delete x.confident; }
      const single = pr.length === 1 || codes.includes(pr[0].id) || (setId && pr[0].setId === setId && pr.filter((x) => x.setId === setId).length === 1);
      if (sure && single) pr[0].confident = true;
      r.cands = [...pr, ...r.cands.filter((x) => x.passcode !== top.passcode)];
      return r;
    };
    const o = await V.check(blob, cands, visualOpts(codes, setId));
    if (o && o.quad) { o.quad = fullQuad(o.quad); o.crop = await cropQuad(blob, o.quad).catch(() => null) || o.crop; }
    await expand(o);
    const top = o && o.cands[0];
    if (!context) return o;
    if (top && top.orb >= V.SURE) {
      const cq = o.url ? fullQuad(await V.quadOn(context, top, o.url).catch(() => null)) : null;
      if (cq) o.ctxQuad = cq;
      const crop = cq ? await cropQuad(context, cq).catch(() => null) : null;
      return crop ? { ...o, crop } : o;
    }
    // rien de net sur la découpe (trop serrée : photo d'Arnaud, Dragon Ultime aux Yeux Bleus coupé par le détourage) → les
    // alentours ; v3.28 : gardés dès que l'image y est nette (avant : seulement « sûre », jamais le cas d'une carte réimprimée
    // au même dessin → « Je n'ai pas reconnu la carte »)
    const w = await V.check(context, cands, visualOpts(codes, setId)).catch(() => null);
    if (w && w.quad) { w.quad = fullQuad(w.quad); w.crop = await cropQuad(context, w.quad).catch(() => null) || w.crop; w.ctxQuad = w.quad; }
    await expand(w);
    const wt = w && w.cands[0];
    return wt && (wt.confident || (wt.orb || 0) >= Math.max(V.SURE, (top && top.orb) || 0)) ? w : o;
  }

  /**
   * Impressions de la 1re carte (même passcode) départagées par le code lu (printScores) : la plus proche d'abord ; « sûre » si
   * l'image est nette, le code nettement le sien (≥ 0,75 avec 0,12 d'avance sur les autres codes, ou ≥ 0,65 avec 0,25 d'avance)
   * et une seule rareté pour ce code.
   */
  function choosePrint(cands, texts) {
    const top = cands[0]; if (!top || top.passcode == null) return cands;
    const group = cands.filter((c) => c.passcode === top.passcode), rest = cands.filter((c) => c.passcode !== top.passcode);
    if (group.length < 2) { if (group.length === 1 && (top.orb || 0) >= IMG_SURE) top.confident = true; return cands; }
    const { order, best, gap } = printScores(texts, group);
    if (!((best >= 0.75 && gap >= 0.12) || (best >= 0.65 && gap >= 0.25))) return cands; // (« RGBT-FR00T » lu : 0,70 contre 0,40 aux autres codes)
    const first = order[0], orb = Math.max(...group.map((c) => c.orb || 0));
    for (const c of order) { c.numOk = c.code === first.code; c.ofOk = c.numOk; delete c.confident; if (orb) c.orb = orb; }
    if (orb >= App.visual.SURE && order.filter((c) => c.code === first.code).length === 1) first.confident = true;
    return [...order, ...rest];
  }

  /**
   * Formes imprimées d'un code des données : « RGBT-007 » → RGBT-FR007, RGBT-EN007, RGBT-007 ; anciennes européennes
   * « SDK-E032 » → SDK-F032, SDK-C032 (françaises du Canada), SDK-E032…
   */
  function printedForms(code) {
    const [pre, num = ''] = baseKey(code).split('-');
    if (/^E\d{3}$/.test(num)) return ['F', 'C', 'E', 'G', 'I', 'S'].map((l) => `${pre}-${l}${num.slice(1)}`);
    const f = [`${pre}-FR${num}`, `${pre}-EN${num}`, `${pre}-${num}`];
    if (/^\d{3}$/.test(num)) f.push(`${pre}-F${num}`, `${pre}-C${num}`);
    return f;
  }
  // lettres que Tesseract confond (O/0/D, I/1/L, S/5…) : presque gratuites dans la comparaison
  const LOOK = new Set(['O0', 'D0', 'Q0', 'OD', 'OQ', 'DQ', 'I1', 'L1', 'J1', '|1', 'IL', 'I|', 'T1', 'S5', 'B8', 'Z2', 'G6', 'T7', '/7', 'EF', 'FP', 'CG', 'C0', 'CO', 'RK', 'RP', 'HN', 'MN', 'UV', '38', '56', '68', '69', '89', 'A4', 'E3', 'B3', 'GO', 'G0', 'DB', 'DO', 'CE', 'S8', 'S3', '74', '17'].flatMap((p) => [p, p[1] + p[0]]));
  /** coût de w posé n'importe où dans la ligne t (début et fin libres) */
  function alignCost(w, t) {
    let prev = new Float32Array(t.length + 1), cur = new Float32Array(t.length + 1);
    for (let i = 1; i <= w.length; i++) {
      cur[0] = i * 0.7;
      for (let j = 1; j <= t.length; j++) cur[j] = Math.min(prev[j - 1] + (w[i - 1] === t[j - 1] ? 0 : LOOK.has(w[i - 1] + t[j - 1]) ? 0.35 : 1), prev[j] + 0.7, cur[j - 1] + 0.7);
      [prev, cur] = [cur, prev];
    }
    return Math.min(...prev);
  }
  /** code lu par Tesseract : note de chaque code possible (0…1, meilleure ligne) */
  function readScores(texts, codes) {
    const lines = texts.join('\n').toUpperCase().replace(/[‐-―–—]/g, '-').split('\n').map((l) => l.replace(/[^A-Z0-9\-|/]/g, '')).filter((l) => l.length >= 4);
    return new Map(codes.map((k) => [k, Math.max(0, ...lines.flatMap((l) => printedForms(k).map((w) => 1 - alignCost(w, l) / w.length)))]));
  }
  // bande du code sur la carte recadrée (sous l'illustration, aligné à droite)
  const CODE_BAND = { y0: 0.70, y1: 0.775, x0: 0.5, x1: 1, right: [0.87, 0.985] };
  /**
   * Impression choisie (v3.32, Arnaud : « le numéro de carte a une importance bien plus élevée » qu'ailleurs, tant de cartes sont
   * réimprimées à l'identique) : chaque code possible de la carte est dessiné et superposé à la bande du code
   * (`recognizerParts.codeMatch`), plus 0,3 × la ressemblance avec ce qu'a lu Tesseract ; « sûr » avec 0,1 d'avance. Code
   * nettement lu (`choosePrint`) : il garde la main. Banc de 26 cartes : 14 bonnes impressions (3 sûres) → 20 (12 sûres, 0 fausse) ; v3.37 avec PaddleOCR : 25 (20 sûres).
   */
  async function pickPrint(cands, texts, crop) { return byRarity(await pickCode(cands, texts, crop), crop); }
  // v3.37 : bandes fines qui glissent sur la carte recadrée, lues par PaddleOCR (labo : 12 bandes de 0,68 à 0,76, 3,5 % de haut)
  const PICK_BANDS = Array.from({ length: 12 }, (_, i) => 0.68 + i * 0.0075).map((y) => [y, y + 0.035, 0.45, 0.99]);
  /**
   * v3.37 — code de chaque impression noté par PaddleOCR (probabilité que la bande contienne « RGBT-FR007 », « RGBT-EN007 »…,
   * `codeOcr.best`) : 3 points d'avance → ce code (labo, 26 cartes : 25 bonnes, 20 sûres, 0 fausse ; code dessiné : 20 / 12).
   * Sinon le code dessiné décide comme avant, et s'il désigne le même code que PaddleOCR (1 point d'avance), il est retenu.
   * → { win, gap, ranked } ou null
   */
  async function ocrPick(crop, codes) {
    const O = App.recognizerParts && App.recognizerParts.codeOcr;
    if (!O || !crop) return null;
    const rd = await O.read(crop, PICK_BANDS, { wait: 3000 }).catch(() => null);
    const ranked = rd ? await O.best(rd, new Map(codes.map((k) => [k, printedForms(k)]))) : [];
    const d = O.decide(ranked);
    return d ? { win: d.key, gap: d.gap, sure: d.sure, ranked } : null;
  }
  function markCode(group, rest, win, sure, orb, score) {
    const order = [...group].sort((a, b) => ((baseKey(b.code) === win) - (baseKey(a.code) === win)) || (a.alt - b.alt));
    for (const c of order) { delete c.confident; if (orb) c.orb = orb; c.numOk = sure && baseKey(c.code) === win; c.ofOk = c.numOk; if (score && baseKey(c.code) === win) c.codeScore = score; }
    if (sure && orb >= App.visual.SURE && order.filter((c) => baseKey(c.code) === win).length === 1) order[0].confident = true;
    return [...order, ...rest];
  }
  async function pickCode(cands, texts, crop) {
    const top = cands[0], cm = App.recognizerParts && App.recognizerParts.codeMatch;
    if (!top || top.passcode == null || !crop) return choosePrint(cands, texts);
    const group = cands.filter((c) => c.passcode === top.passcode), rest = cands.filter((c) => c.passcode !== top.passcode);
    const codes = [...new Set(group.map((c) => baseKey(c.code)))];
    if (codes.length < 2) return choosePrint(cands, texts);
    const old = printScores(texts, group);
    if ((old.best >= 0.75 && old.gap >= 0.12) || (old.best >= 0.65 && old.gap >= 0.25)) return choosePrint(cands, texts);
    const orb0 = Math.max(...group.map((c) => c.orb || 0));
    const op = await ocrPick(crop, codes);
    if (op && op.sure) return markCode(group, rest, op.win, true, orb0, +op.ranked[0][1].toFixed(2));
    if (!cm) return op ? markCode(group, rest, op.win, false, orb0) : choosePrint(cands, texts);
    const m = await cm(crop, codes.map((k) => [k, printedForms(k)]), CODE_BAND).catch((e) => { console.warn('code dessiné', e); return null; });
    if (!m) return choosePrint(cands, texts);
    const read = readScores(texts, codes), sc = new Map(codes.map((k) => [k, (m.per.get(k) ?? -1) + 0.3 * (read.get(k) || 0)]));
    const ranked = [...sc].sort((a, b) => b[1] - a[1]), gap = ranked[0][1] - ranked[1][1], win = ranked[0][0];
    // (v3.37 : les deux méthodes d'accord → sûr ; code dessiné hésitant et PaddleOCR d'un autre avis → PaddleOCR, à vérifier)
    if (op && op.win !== win && gap < 0.1) return markCode(group, rest, op.win, false, orb0);
    const agree = !!op && op.win === win && op.gap >= 1;
    const order = [...group].sort((a, b) => (sc.get(baseKey(b.code)) - sc.get(baseKey(a.code))) || (a.alt - b.alt));
    const orb = orb0, ok = gap >= 0.1 || agree;
    for (const c of order) { delete c.confident; if (orb) c.orb = orb; c.codeScore = +sc.get(baseKey(c.code)).toFixed(3); c.numOk = ok && baseKey(c.code) === win; c.ofOk = c.numOk; }
    if (ok && orb >= App.visual.SURE && order.filter((c) => baseKey(c.code) === win).length === 1) order[0].confident = true;
    return [...order, ...rest];
  }
  /**
   * Rareté d'après la couleur des lettres du nom (v3.34, Arnaud : Dragon Ultime aux Yeux Bleus JMP-EN005, Ultra Rare ou Secret
   * Rare, même code). Nom doré = Ultra / Gold / Ultimate ; argenté = Rare, Secret, Platine, Ghost… ; noir (blanc sur Magie,
   * Piège, Xyz) = Commune, Super Rare… Mesuré : lettres = les 12 % de pixels les plus loin du fond de la bande du nom, du côté
   * le plus fourni (clair / sombre). **Doré** : lettres claires dont la teinte est à moins de 30° du jaune (55°) ET nettement
   * plus jaune que le cadre (12°) — un nom argenté prend la teinte du cadre (orangé sur un cadre orange : 17–21°, doré 46–47°).
   * Corriger l'éclairage par le cadre de l'image officielle : essayé, faux (cadres trop différents). Banc (33 cartes) : 5 noms
   * dorés sur 5, aucune Rare / Secret / Commune prise pour dorée.
   */
  const NAME_GOLD = new Set(['ur', 'upr', 'dupr', 'urp', 'gur', 'pgr', 'gscr', 'utr']);
  const NAME_SILVER = new Set(['r', 'drpr', 'scr', 'pscr', 'escr', 'uscr', 'plr', 'plscr', 'gr', 'ggr', 'qcsr', 'str', 'cr']);
  const nameClassOf = (r) => (NAME_GOLD.has(r) ? 'gold' : NAME_SILVER.has(r) ? 'silver' : 'plain');
  const hueOf = ([r, g, b]) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn || 1; let h = (mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60; return h < 0 ? h + 360 : h; };
  async function nameLook(blob) {
    const b = await createImageBitmap(blob), x0 = 0.06, x1 = 0.8, y0 = 0.035, y1 = 0.115, W = 300, H = Math.max(4, Math.round(b.height * (y1 - y0) * W / (b.width * (x1 - x0))));
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(b, b.width * x0, b.height * y0, b.width * (x1 - x0), b.height * (y1 - y0), 0, 0, W, H); b.close && b.close();
    const d = g.getImageData(0, 0, W, H).data, n = W * H, L = new Float32Array(n);
    for (let i = 0; i < n; i++) L[i] = 0.3 * d[i * 4] + 0.59 * d[i * 4 + 1] + 0.11 * d[i * 4 + 2];
    const Lbg = Float32Array.from(L).sort()[n >> 1], dev = Array.from(L, (v) => v - Lbg), lim = dev.map(Math.abs).sort((p, q) => q - p)[Math.floor(n * 0.12)];
    let up = 0, dn = 0; for (const v of dev) if (Math.abs(v) >= lim) (v > 0 ? up++ : dn++);
    const light = up >= dn, t = [0, 0, 0], f = [0, 0, 0]; let nt = 0, nf = 0;
    for (let i = 0; i < n; i++) {
      const a = Math.abs(dev[i]);
      if (a >= lim && (dev[i] > 0) === light) { for (let k = 0; k < 3; k++) t[k] += d[i * 4 + k]; nt++; } else if (a < lim * 0.3) { for (let k = 0; k < 3; k++) f[k] += d[i * 4 + k]; nf++; }
    }
    const lum = (p, m) => (0.3 * p[0] + 0.59 * p[1] + 0.11 * p[2]) / (m || 1);
    return { light, h: hueOf(t.map((v) => v / (nt || 1))), fh: hueOf(f.map((v) => v / (nf || 1))), dL: lum(t, nt) - lum(f, nf) };
  }
  /** 'gold' | 'silver' | 'plain' | null (on ne sait pas) ; kind = genre de la carte (Magie, Piège, Xyz : nom blanc) */
  function nameClass(look, kind) {
    const yd = (h) => Math.min(Math.abs(h - 55), 360 - Math.abs(h - 55));
    if (look.light && yd(look.h) <= 30 && yd(look.h) < yd(look.fh) - 12) return 'gold';
    const white = ['s', 't', 'x', 'px'].includes(kind);
    if (!look.light) return white ? null : 'plain';
    return white || kind === 'l' || look.dL < 35 ? null : 'silver'; // (contraste faible : Grès, capture floue, nom sombre vu « clair »)
  }
  async function byRarity(list, crop) {
    const top = list[0];
    if (!top || !crop || top.passcode == null) return list;
    const same = list.filter((c) => c.passcode === top.passcode && baseKey(c.code) === baseKey(top.code));
    if (same.length < 2 || new Set(same.map((c) => nameClassOf(c.rarity))).size < 2) return list;
    const look = await nameLook(crop).catch(() => null), cl = look && nameClass(look, top.kind);
    const ok = cl ? same.filter((c) => nameClassOf(c.rarity) === cl) : [];
    if (!ok.length) return list;
    const codeSure = top.numOk || list.filter((c) => c.passcode === top.passcode).every((c) => baseKey(c.code) === baseKey(top.code));
    for (const c of same) { delete c.confident; c.rarLook = cl; }
    if (codeSure && ok.length === 1 && (top.orb || 0) >= App.visual.SURE) ok[0].confident = true;
    return [...ok, ...same.filter((c) => !ok.includes(c)), ...list.filter((c) => !same.includes(c))];
  }
  const rarTxt = (c) => (c && c.rarLook ? `nom ${c.rarLook === 'gold' ? 'doré' : c.rarLook === 'silver' ? 'argenté' : 'sans dorure'}` : '');

  // v3.37 — bandes du code (sous l'illustration à droite, la carte n'est pas toujours recadrée au pixel près) et du passcode
  const OCR_BANDS = [...Array.from({ length: 11 }, (_, i) => 0.68 + i * 0.01).map((y) => [y, y + 0.035, 0.45, 0.99]), [0.93, 0.975, 0, 0.42], [0.95, 0.995, 0, 0.42]];
  let lexMemo = null;
  /**
   * Formes imprimées des codes connus (~150 000), rangées par préfixe de série → fonction texte lu → formes à essayer : celles
   * des séries dont le préfixe ressemble à un morceau de la ligne (« IDGS » ≈ TDGS) ; tout comparer prenait ~4 s par carte.
   */
  async function lexicon() {
    const D = await data();
    if (lexMemo && lexMemo.D === D) return lexMemo.pick;
    const by = new Map();
    for (const k of D.byKey.keys()) { const pre = k.split('-')[0]; if (!by.has(pre)) by.set(pre, []); for (const f of printedForms(k)) by.get(pre).push([baseKey(k), f]); }
    const pres = [...by.keys()], align = App.recognizerParts.codeOcr.align;
    const pick = (t) => pres.filter((p) => align(p, t) / p.length <= 0.34).flatMap((p) => by.get(p));
    lexMemo = { D, pick };
    return pick;
  }
  /**
   * Code lu par PaddleOCR → textes (pour codesIn / printScores) ; texts.snapped = [clé, poids] : la lecture rapprochée de la
   * liste des codes existants (« IDGS-FROT6 » → TDGS-016), poids 1,2, seulement si nettement le meilleur (3 points d'avance, note ≥ −6).
   */
  async function ocrCodes(blob) {
    const O = App.recognizerParts && App.recognizerParts.codeOcr, out = [];
    const rd = O ? await O.read(blob, OCR_BANDS, { zones: [[0.69, 0.78, 0.5, 1]] }).catch(() => null) : null;
    if (!rd) return out;
    out.push(...rd.texts);
    if (!out.some((t) => codesIn(t).some(([c]) => !/^#/.test(c)))) {
      const d = O.decide(await O.snap(rd, await lexicon()), { min: -6 });
      if (d && d.sure) out.snapped = [d.key, 1.2];
    }
    return out;
  }

  /**
   * Lit une photo de carte (déjà recadrée) : code (« RGBT-FR007 ») et passcode, nom (français ou anglais), puis vérification
   * par l'image. Même déroulé que Lorcana. Renvoie { info: { code, name, read, crop… }, cands }.
   */
  async function recognize(blob, statusFn = () => {}, { setId = '', original = null, context = null } = {}) {
    const R = App.recognizer, D = await data();
    const early = useVisual() ? visualPass(blob, [], [], context, setId).catch((e) => { console.warn('vérification par l’image', e); return null; }) : null;
    statusFn('Lecture du code de la carte…');
    const H = await sizeOf(blob);
    // v3.37 : PaddleOCR d'abord (labo : lecture brute 8/33 contre 0/33 pour Tesseract, avec la liste des codes 16/33), Tesseract en secours
    const texts = await ocrCodes(blob);
    let read = texts.map(codesIn), betterCrop = null;
    const anyKey = () => read.some((r) => r.some(([c]) => !/^#/.test(c)));
    if (texts.snapped) read.push([texts.snapped]);
    if (!anyKey()) { const t = await R.readZones(blob, CODE_ZONES(H)); texts.push(...t); read.push(...t.map(codesIn)); }
    if (!anyKey()) { const t = await R.readZones(blob, [...MORE_ZONES(H), ...NAME_ZONES(H)]); texts.push(...t); read.push(...t.map(codesIn)); }
    if (early && !anyKey()) {
      const e = await early;
      if (e && e.cands[0] && e.cands[0].confident && (e.cands[0].orb || 0) >= IMG_SURE) return { info: { code: e.cands[0].id, name: '', votes: {}, crop: e.crop, ctxQuad: e.ctxQuad, orb: e.best, read: 'reconnue à l’image ✓' }, cands: e.cands.slice(0, 40) };
      let crop = e && e.crop;
      // carte détourée trop court (bas sombre de la carte confondu avec la main : coins par l'image hors de la découpe) →
      // vrais bords cherchés sur la photo d'origine, où la carte est entière
      if (!crop && e && e.url && e.cands[0] && (e.cands[0].orb || 0) >= App.visual.SURE && (original || context)) {
        const V = App.visual, src = context || original, q = fullQuad(await V.quadOn(src, e.cands[0], e.url).catch(() => null));
        crop = q ? await cropQuad(src, q).catch(() => null) : null;
        if (crop && context) e.ctxQuad = q;
      }
      if (crop) {
        statusFn('Lecture du code (carte recadrée)…');
        // (v3.37 : PaddleOCR ; Tesseract et ses 20 bandes, ~3 s, seulement si le lecteur de codes n'est pas là)
        const t0 = await ocrCodes(crop); texts.push(...t0); read.push(...t0.map(codesIn)); if (t0.snapped) read.push([t0.snapped]);
        if (!t0.length) { const Hc = await sizeOf(crop), t = await R.readZones(crop, CROP_ZONES(Hc)); texts.push(...t); read.push(...t.map(codesIn)); }
        if (anyKey()) betterCrop = crop;
        // carte reconnue à l'image : reste à savoir laquelle de ses impressions (code relu sur la carte recadrée)
        if (e.cands[0] && (e.cands[0].orb || 0) >= App.visual.SURE) {
          statusFn('Comparaison des codes possibles…');
          const cands = await pickPrint(e.cands, texts, crop), top = cands[0];
          return { info: { code: top.id, name: '', votes: {}, crop, ctxQuad: e.ctxQuad, orb: e.best, read: [top.numOk ? `code ${top.code}` : '', rarTxt(top), 'reconnue à l’image ✓'].filter(Boolean).join(', ') }, cands: cands.slice(0, 40) };
        }
      }
    }
    if (original && !context && !anyKey()) {
      statusFn('Lecture du code (autre cadrage)…');
      for (const alt of await otherCrops(original)) {
        const t = await R.readZones(alt.blob, alt.zones); texts.push(...t); read.push(...t.map(codesIn));
        if (anyKey()) { betterCrop = alt.asPhoto ? alt.blob : null; break; }
      }
    }
    // votes : code (« RGBT-007 ») ou passcode (« #41160533 ») → poids
    const votes = {};
    for (const r of read) for (const [c, w] of r) votes[c] = (votes[c] || 0) + w;
    const keys = Object.keys(votes).filter((c) => !/^#/.test(c)).sort((a, b) => votes[b] - votes[a]);
    // (passcode d'une autre illustration → celui de la carte)
    const pcs = Object.keys(votes).filter((c) => /^#/.test(c)).map((c) => ((D.byPc.get(+c.slice(1)) || [])[0] || { c: [] }).c[K.pc]).filter(Boolean);
    const topKeys = keys.filter((c) => votes[c] >= votes[keys[0]] * 0.5).slice(0, 3);
    // nom (français, ou anglais pour une carte anglaise)
    statusFn('Recherche de la carte…');
    const nm = await names(), lines = texts.join('\n').split('\n').map((l) => norm(l)).filter((l) => l.length >= 3);
    let best = { k: '', s: 0 };
    for (const l of lines) for (const k of nm.keys()) {
      if (Math.abs(k.length - l.length) > Math.max(3, k.length * 0.4)) continue;
      const s = l === k ? 1 : l.includes(k) && k.length >= 8 ? 0.9 : App.util.similarity(l, k);
      if (s > best.s) best = { k, s };
    }
    const nameOk = best.s >= 0.8 ? best.k : '';
    const namePcs = new Set(nameOk ? [...nm.get(nameOk)].map((id) => (D.byId.get(id) || { c: [] }).c[K.pc]) : []);
    let cands = [];
    for (const k of topKeys) cands.push(...(await byKey(k, setId)));
    const codeIds = new Set(cands.map((c) => c.id));
    // le code et le passcode / le nom disent la même carte : sûre
    const agree = (c) => pcs.includes(c.passcode) || namePcs.has(c.passcode);
    if (!cands.length && (pcs.length || namePcs.size)) {
      const pc = pcs[0] || [...namePcs][0];
      cands = await fromIds(((D.byPc.get(pc) || []).filter((p) => !setId || p.s === setId).length ? (D.byPc.get(pc) || []).filter((p) => !setId || p.s === setId) : (D.byPc.get(pc) || [])).map((p) => p.id));
    }
    const seen = new Set(); cands = cands.filter((x) => !seen.has(x.id) && seen.add(x.id));
    cands.sort((a, b) => (codeIds.has(b.id) - codeIds.has(a.id)) || (agree(b) - agree(a)) || ((b.setId === setId) - (a.setId === setId)) || (a.alt - b.alt));
    for (const c of cands) { c.numOk = codeIds.has(c.id); c.ofOk = c.numOk; if (nameOk) c.nameScore = namePcs.has(c.passcode) ? 1 : 0; }
    let top = cands[0];
    // plusieurs raretés du même code : le même dessin, on ne sait pas laquelle → à vérifier (la plus commune proposée)
    const sameKey = top ? cands.filter((c) => c.code === top.code).length : 0;
    if (top && codeIds.has(top.id) && (agree(top) || votes[baseKey(top.id)] >= 2) && sameKey === 1) top.confident = true;
    let orb = null;
    if (!(top && top.confident) && useVisual()) {
      statusFn('Vérification par l’image…');
      orb = await (early && !cands.length ? early : visualPass(blob, cands, [...codeIds], context, setId)).catch((err) => { console.warn('vérification par l’image', err); return null; });
      if (orb && orb.cands.length) {
        // image d'une autre carte que le code lu : on garde le code s'il est cohérent avec l'image
        const o0 = orb.cands[0];
        if (!cands.length || !codeIds.size || (o0 && cands.some((c) => c.passcode === o0.passcode))) {
          const byImg = orb.cands.filter((c) => c.orb != null && c.orb >= App.visual.SURE).map((c) => c.passcode);
          if (codeIds.size && byImg.length) {
            const ok = cands.filter((c) => byImg.includes(c.passcode));
            if (ok.length) { for (const c of ok) c.orb = o0.orb; cands = [...ok, ...orb.cands.filter((x) => !ok.some((y) => y.id === x.id))]; if (ok.length === 1 || ok.filter((c) => c.code === ok[0].code).length === 1) cands[0].confident = true; }
            else cands = orb.cands;
          } else cands = orb.cands;
        }
        top = cands[0];
      }
      if (top && top.confident && !codeIds.has(top.id) && (top.orb || 0) < IMG_SURE) delete top.confident;
    }
    if (orb && orb.crop) betterCrop = orb.crop;
    if (top && !top.confident) { cands = await pickPrint(cands, texts, (orb && orb.crop) || betterCrop); top = cands[0]; }
    const cropLater = !orb && early && top ? early.then((e) => (e && e.crop && e.cands[0] && e.cands[0].passcode === top.passcode ? e.crop : null), () => null) : null;
    const readTxt = topKeys.length ? `code ${topKeys[0]}` : pcs.length ? `passcode ${pcs[0]}` : '';
    return { info: { code: top ? top.id : '', name: nameOk, votes, crop: betterCrop, cropLater, ctxQuad: orb && top && orb.cands[0] === top ? orb.ctxQuad : null, orb: orb ? orb.best : null, read: [readTxt, nameOk ? `nom « ${nameOk} »` : '', rarTxt(top), top && top.orb >= 25 ? 'reconnue à l’image ✓' : ''].filter(Boolean).join(', ') }, cands: cands.slice(0, 40) };
  }

  /** Recherche à la main (nom français ou anglais, ou code « RGBT-FR007 »), classée par ressemblance avec la photo */
  async function manual(blob, nameTxt, numTxt) {
    const name = (nameTxt || '').trim(), num = (numTxt || '').trim();
    if (!name && !num) throw new Error('Indique un nom, ou un code (ex. RGBT-FR007)');
    let cands = await search({ name: num || name });
    if (num && name) { const n = norm(name), f = cands.filter((c) => norm(c.name).includes(n) || norm(c.nameEn).includes(n)); cands = f.length ? f : await search({ name }); }
    if (blob && cands.length > 1) {
      const pool = cands.slice(0, 24), vis = await App.recognizer.resemblanceMany(blob, pool, (c) => img.card(c, 'low').replace('&w=360', '&w=160')).catch(() => new Map());
      for (const c of pool) c.visual = vis.has(c.id) ? vis.get(c.id) : null;
      cands = [...pool.sort((a, b) => (b.visual ?? -1) - (a.visual ?? -1)), ...cands.slice(24)];
    }
    return cands;
  }

  App.games.register('yugioh', {
    id: 'yugioh',
    name: 'Yu-Gi-Oh!',
    listSets, getSet, getCard, search, versions, byCode, byKey, setIdsByName, price, img, recognize, manual, codesIn, names,
    visualIndex: { index: 'data/yg-index', v: YG_INDEX_V }, // (v3.36 : préparée d'avance par App.scanMemo.prepare)
    visualCheck: (blob) => (useVisual() ? visualPass(blob, [], []) : Promise.resolve(null)), // (« Toutes » : licence devinée à l'image)
    langFor: () => 'fr',
    cardmarketUrl: (card) => cm(card.nameEn || card.name),
    boosterUrl: (set) => cm(set.name + ' booster'),
    isOfficial: (localId) => !/\s/.test(String(localId)),
    logoText: (s) => String(s.id).replace(/\.\d+$/, ''),
    extraLabel: 'autres raretés',
    priceNote: 'Prix : celui de l’impression (TCGplayer, cartes anglaises, converti en euros), sinon le prix Cardmarket de la carte ; mise à jour quotidienne.',
    rarity,
    pullRates: () => null,
    source: { name: 'YGOPRODeck', url: 'https://ygoprodeck.com/' },
    parts: { baseKey, FRAME, ATTR, RACE, data, visualPass, choosePrint, pickPrint, nameLook, nameClass, byRarity, printScores, readScores, printedForms, CODE_BAND, CROP_ZONES, fullQuad, cropQuad, codesIn, lexicon, ocrCodes, OCR_BANDS },
  });
})();
