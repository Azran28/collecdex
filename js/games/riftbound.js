/*
 * Adaptateur Riftbound (jeu de cartes League of Legends, v3.10).
 * Cartes : galerie officielle de Riot (content.publishing.riotgames.com, la même que playriftbound.com/fr-fr/card-gallery) :
 * séries, raretés et types en français, mais noms et textes des cartes en anglais (Riot ne publie pas les noms français).
 * Visuels : cmsassets.rgpub.io (sans CORS) → relayés par images.weserv.nl, comme One Piece (comparaison d'images possible).
 * Prix : marché TCGplayer (en $), préparé chaque jour par le robot de mise en ligne (data/rb-prix.json, outils/ci/prix-riftbound.mjs).
 * Identifiant d'une carte = celui de Riot (« ogn-013-298 », version alternative « ogn-238a-298 », signature « ogn-304-star-298 »,
 * rune « rad-r01 », jeton « unl-t01 ») ; numéro affiché = celui imprimé (« 013 », « 238a », « 304* », « R01 », « T01 »).
 */
(() => {
  const API = 'https://content.publishing.riotgames.com/publishing-content/v2.0/public/channel/riftbound_website/list';
  const DAY = 24 * 3600 * 1000;
  const { norm } = App.util;

  // ---------- Réseau + cache (même principe que Pokémon et One Piece : la dernière réponse reste utilisable hors ligne) ----------
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
  // clé (comme chez Riot) → [rang, nom FR, sigle, couleur (celle de la gemme imprimée sur la carte)]
  const RAR = {
    common:    [1,  'Commune',     'C', '#8fa597'],
    uncommon:  [2,  'Peu commune', 'U', '#41b4b8'],
    rare:      [4,  'Rare',        'R', '#b881a9'],
    epic:      [7,  'Épique',      'É', '#d0874f'],
    showcase:  [10, 'Showcase',    'S', 'url(#gpk)'],
  };
  const rkey = (r) => (RAR[r] ? r : Object.keys(RAR).find((k) => norm(RAR[k][1]) === norm(r) || norm(k) === norm(r)) || null);
  const pillBg = (c) => (c === 'url(#gpk)' ? 'linear-gradient(90deg,#e8c25a,#b89d3b)' : c);
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
  // brillance : Rare, Épique et Showcase n'existent qu'en brillant ; Commune et Peu commune en normal ET en brillant (1 par booster)
  const variantsOf = (rar) => (['rare', 'epic', 'showcase'].includes(rar) ? { holo: true } : { normal: true, holo: true });

  // ---------- Séries ----------
  // sortie (anglaise) et genre ; une série inconnue (sortie après cette version) passe en dernier, comme extension
  const SETS = {
    OGN: ['2025-10-31', 'main', 1], OGS: ['2025-10-31', 'deck', 2], SFD: ['2026-02-13', 'main', 3],
    UNL: ['2026-05-08', 'main', 4], VEN: ['2026-07-31', 'main', 5], RAD: ['2026-10-23', 'main', 6],
  };
  // produit TCGplayer montré comme visuel de la série (sachet de booster ; Proving Grounds : son coffret) — à ajouter à chaque nouvelle série :
  // [produit, largeur, hauteur de l'image _400w, puis la zone du sachet x0, y0, x1, y1 (le reste est blanc)]
  const PACKS_CROP = {
    OGN: [635366, 400, 400, 96, 26, 302, 374], OGS: [635460, 400, 400, 28, 12, 372, 386], SFD: [661954, 400, 676, 0, 0, 400, 676],
    UNL: [678149, 400, 676, 0, 0, 400, 676], VEN: [693377, 400, 400, 76, 0, 322, 400], RAD: [711362, 400, 400, 78, 0, 320, 400],
  };
  const PACKS = Object.fromEntries(Object.entries(PACKS_CROP).map(([k, v]) => [k, v[0]]));
  const GROUPS = { main: { id: 'rb-main', name: 'Extensions' }, deck: { id: 'rb-deck', name: 'Decks de démarrage' } };
  const NAMES = { OGN: 'Origins', OGS: 'Origins : Proving Grounds' }; // (noms français donnés par Riot pour les autres)

  // ---------- Textes (Riot : HTML anglais avec des symboles « :rb_might: ») ----------
  const DOM = { fury: 'Fureur', calm: 'Calme', mind: 'Esprit', body: 'Corps', chaos: 'Chaos', order: 'Ordre', colorless: 'Sans couleur' };
  const TYPE = { unit: 'Unité', spell: 'Sort', gear: 'Équipement', legend: 'Légende', battlefield: 'Champ de bataille', rune: 'Rune' };
  const SUP = { champion: 'Champion', signature: 'Signature', token: 'Jeton', basic: 'De base' };
  const plain = (html) => String(html || '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>\s*<p>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/:rb_might:/g, '⚔').replace(/:rb_exhaust:/g, '⟳').replace(/:rb_energy_(\d+):/g, '($1)')
    .replace(/:rb_rune_rainbow:/g, '[rune]').replace(/:rb_rune_([a-z]+):/g, (m, d) => `[${DOM[d] || d}]`).replace(/:[a-z_0-9]+:/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, '\'').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\n{2,}/g, '\n').trim();
  const val = (x) => (x && x.value && x.value.id != null ? +x.value.id : null);

  /** Carte Riot → carte compacte gardée dans l'index (≈ 400 octets) */
  function compact(c) {
    const type = ((c.cardType && c.cardType.type) || [])[0];
    const tags = (c.tags && c.tags.tags) || [];
    const m = String(c.publicCode || '').match(/^([A-Z]+)-([^/]+)(?:\/(\d+))?$/) || [];
    return {
      id: c.id, s: (c.set && c.set.value && c.set.value.id) || m[1] || '', l: m[2] || String(c.collectorNumber || ''), n: c.name || '', sub: c.subtitle || '',
      t: type ? type.id : '', sp: ((c.cardType && c.cardType.superType) || []).map((x) => x.id), r: (c.rarity && c.rarity.value && c.rarity.value.id) || '',
      d: ((c.domain && c.domain.values) || []).map((x) => x.id), img: (c.cardImage && c.cardImage.url) || '', o: c.orientation === 'landscape' ? 1 : 0,
      a: ((c.illustrator && c.illustrator.values) || []).map((x) => x.label).join(', '), x: plain(c.text && c.text.richText && c.text.richText.body),
      e: val(c.energy), m: val(c.might), p: val(c.power), tg: tags,
    };
  }
  /** Nom affiché : « Leona, Determined » ; légende : « Lee Sin, Blind Monk » (le champion est dans les étiquettes) */
  const nameOf = (k) => (k.t === 'legend' && k.tg[0] && norm(k.tg[0]) !== norm(k.n) ? `${k.tg[0]}, ${k.n}` : k.sub ? `${k.n}, ${k.sub}` : k.n);

  /** Toutes les cartes et les séries (≈ 300 Ko compressés), gardées 3 jours */
  const index = () => cached('rb1:index', 3 * DAY, async () => {
    const sets = await getJSON(`${API}/riftbound_gallery_sets?locale=fr_FR&from=0&limit=200`);
    const cards = [];
    for (let from = 0, total = 1; from < total && from < 20000; from += 1000) {
      const r = await getJSON(`${API}/riftbound_gallery_cards?locale=fr_FR&from=${from}&limit=1000`);
      total = (r.metadata && r.metadata.totalItems) || 0;
      cards.push(...(r.data || []));
      if (!(r.data || []).length) break;
    }
    const seen = new Set();
    return {
      sets: (sets.data || []).map((s) => ({ id: s.id, name: s.name, max: s.collectorNumberMax || 0 })),
      cards: cards.filter((c) => c && c.id && !seen.has(c.id) && seen.add(c.id)).map(compact),
    };
  });

  /** Numéro « de la série » : 3 chiffres, sans lettre, pas au-delà du dernier numéro (les « 299* » d'Origins sont en plus) */
  const isOfficialIn = (localId, max) => /^\d{3}$/.test(String(localId)) && +localId >= 1 && (!max || +localId <= max);
  let memo = null;
  async function data() {
    const idx = await index();
    if (memo && memo.idx === idx) return memo;
    const byId = new Map(), bySet = new Map(), num = new Map();
    // (Riot a quelques doublons au numéro « …-000 » : Kayn OGN-189 → seule la vraie carte est gardée)
    for (const k of idx.cards) { const key = `${k.s}|${k.l}|${norm(nameOf(k))}`; if (!num.has(key) || /-000$/.test(num.get(key).id)) num.set(key, k); }
    for (const k of num.values()) { byId.set(k.id, k); if (!bySet.has(k.s)) bySet.set(k.s, []); bySet.get(k.s).push(k); }
    const sets = idx.sets.filter((s) => bySet.has(s.id)).map((s) => {
      const info = SETS[s.id] || ['', 'main', 9], list = bySet.get(s.id);
      return {
        id: s.id, name: NAMES[s.id] || s.name, logo: '', symbol: '', releaseDate: info[0], sortKey: info[0] || `9999-${s.id}`,
        total: list.length, official: list.filter((k) => isOfficialIn(k.l, s.max)).length, max: s.max, group: GROUPS[info[1]] || GROUPS.main,
      };
    });
    memo = { idx, byId, bySet, sets };
    return memo;
  }
  async function listSets() {
    const { sets } = await data();
    return sets.map(({ max, ...s }) => s);
  }

  // ---------- Cartes ----------
  /** « 013 » avant « 013a », runes et jetons à la fin */
  const order = (k) => { const m = String(k.l).match(/^(\d+)(.*)$/); return m ? [0, +m[1], m[2]] : [/^R/.test(k.l) ? 1 : /^SP/.test(k.l) ? 2 : 3, parseInt(k.l.replace(/\D/g, ''), 10) || 0, k.l]; };
  const cmp = (a, b) => { const x = order(a), y = order(b); return (x[0] - y[0]) || (x[1] - y[1]) || String(x[2]).localeCompare(String(y[2])); };
  // (total imprimé sur les cartes, « /167 », même si Riot n'a pas encore publié toute la série)
  const setShape = (s) => ({ id: s.id, name: s.name, logo: '', symbol: '', releaseDate: s.releaseDate, sortKey: s.sortKey, cardCount: { total: s.total, official: s.max || s.official }, serie: s.group });
  function normCard(k, s) {
    const rar = k.r;
    const facts = [TYPE[k.t] || k.t, k.sp.filter((x) => x !== 'basic').map((x) => SUP[x] || x).join(' · '), k.d.map((x) => DOM[x] || x).join(' / '),
      k.e != null ? `Coût ${k.e}` : '', k.p ? `${k.p} essence runique` : '', k.m != null ? `${k.m} de puissance` : '',
      k.t !== 'legend' ? k.tg.filter((x) => norm(x) !== norm(k.n)).join(' · ') : ''].filter(Boolean);
    return {
      id: k.id, localId: k.l, name: nameOf(k), baseName: k.n, image: k.img, rarity: rar, variants: variantsOf(rar), landscape: !!k.o,
      category: TYPE[k.t] || k.t || '', kind: k.t, types: [], facts, text: k.x, illustrator: k.a,
      domains: k.d, cost: k.e, might: k.m, power: k.p, tags: k.tg, supertypes: k.sp,
      setId: s.id, serieId: s.group.id, alt: /[a-z*]$/.test(k.l) || /^SP/.test(k.l),
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

  // ---------- Prix (TCGplayer, préparés par le robot de mise en ligne : data/rb-prix.json = { m: date, p: { id: [normal, brillant] } }) ----------
  // (pas de fichier : site du PC d'Arnaud → celui du site en ligne, que GitHub Pages permet de lire ; sinon pas de prix)
  const ONLINE = 'https://azran28.github.io/collecdex/data/rb-prix.json';
  // gardés 12 h ; une liste vide (fichier pas encore préparé, réseau coupé) seulement 15 min, pour réessayer bientôt
  let pricesP = null;
  const prices = () => pricesP || (pricesP = (async () => {
    const hit = await App.db.get('cache', 'rb1:prix').catch(() => null);
    const full = hit && hit.v && hit.v.p && Object.keys(hit.v.p).length;
    if (hit && Date.now() - hit.t < (full ? DAY / 2 : 15 * 60 * 1000)) return hit.v;
    for (const u of ['data/rb-prix.json', ONLINE]) {
      const r = await fetch(u, { cache: 'no-cache' }).catch(() => null);
      const v = r && r.ok ? await r.json().catch(() => null) : null;
      if (v && v.p && Object.keys(v.p).length) { await App.db.set('cache', 'rb1:prix', { t: Date.now(), v }).catch(() => {}); return v; }
    }
    if (full) return hit.v; // (réseau coupé : les derniers prix connus)
    await App.db.set('cache', 'rb1:prix', { t: Date.now(), v: { m: '', p: {} } }).catch(() => {});
    return { m: '', p: {} };
  })().finally(() => setTimeout(() => { pricesP = null; }, 60000)));
  async function getCard(id) {
    id = String(id);
    const D = await data(), k = D.byId.get(id);
    if (!k) throw new Error('Carte inconnue : ' + id);
    const s = D.sets.find((x) => x.id === k.s) || { id: k.s, name: k.s, group: GROUPS.main, releaseDate: '', sortKey: '', total: 0, official: 0 };
    const P = await prices().catch(() => ({ p: {} })), p = (P.p || {})[id];
    return {
      ...normCard(k, s),
      set: { id: s.id, name: s.name, logo: '', symbol: '', releaseDate: s.releaseDate, cardCount: { total: s.total, official: s.max || s.official }, serie: s.group },
      pricing: p ? { tcgplayer: { normal: p[0] || null, holo: p[1] || null }, updated: P.m || '' } : null,
    };
  }
  // carte commune possédée en brillant : prix du brillant ; sinon le prix de la version qui existe
  const tpMarket = (tp, variant) => (tp ? (variant === 'holo' ? tp.holo || tp.normal : tp.normal || tp.holo) || null : null);
  function price(card, variant) {
    const tp = card && card.pricing && card.pricing.tcgplayer;
    const v = tpMarket(tp, variant || (card && card.variants && !card.variants.normal ? 'holo' : 'normal'));
    return v > 0 ? { value: v, unit: 'USD', source: 'TCGplayer', updated: card.pricing.updated, raw: tp } : null;
  }

  // ---------- Recherche ----------
  /** Cartes de l'index au format des propositions du scanner */
  async function fromIds(ids) {
    const D = await data(), out = [];
    for (const id of ids) {
      const k = D.byId.get(id); if (!k) continue;
      const s = D.sets.find((x) => x.id === k.s); if (!s) continue;
      out.push({ ...normCard(k, s), set: setShape(s) });
    }
    return out;
  }
  // code imprimé : « OGN · 013/298 », « SFD · R02a », « UNL · T01 », « VEN · SP3/006 », « OGN · 304*/298 »
  const SET_CODES = () => (memo ? memo.sets.map((s) => s.id) : Object.keys(SETS));
  /** Toutes les cartes d'un numéro dans une série : la carte et ses versions alternatives (« 238 » → 238, 238a, 238*) */
  async function byCode(setId, num) {
    const D = await data(), list = D.bySet.get(String(setId).toUpperCase()) || [];
    const n = String(num).toUpperCase().replace(/^0+(?=\d)/, '');
    const base = (l) => String(l).toUpperCase().replace(/^0+(?=\d)/, '').replace(/(\d)[A-Z*]+$/, '$1');
    return fromIds(list.filter((k) => base(k.l) === base(n) || String(k.l).toUpperCase().replace(/^0+(?=\d)/, '') === n).sort(cmp).map((k) => k.id));
  }
  async function search({ name }) {
    const q = norm(name); if (!q) return [];
    await data();
    const m = String(name).toUpperCase().match(new RegExp(String.raw`\b(${SET_CODES().join('|')})\s*[-·.•:\s]\s*((?:\d{1,3}[A-Z*]?)|R\d{2}A?|T\d{2}|SP\d)\b`));
    if (m) return byCode(m[1], m[2]);
    const D = await data(), ids = [];
    for (const k of D.idx.cards) if (norm(nameOf(k)).includes(q) || k.tg.some((t) => norm(t) === q)) ids.push(k.id);
    return fromIds(ids.slice(0, 300));
  }
  /** Séries dont le nom ou le code correspond (« Origins », « OGN ») — import d'un fichier */
  async function setIdsByName(name) {
    const q = norm(name); if (!q) return [];
    const sets = (await data()).sets, names = (s) => [s.id, s.name, SETS_EN[s.id] || ''].map(norm);
    // nom exact d'abord (« Origins » ≠ « Origins : Proving Grounds »)
    const exact = sets.filter((s) => names(s).includes(q));
    return (exact.length ? exact : sets.filter((s) => names(s).some((n) => n && n.includes(q)))).map((s) => s.id);
  }
  const SETS_EN = { SFD: 'Spiritforged', UNL: 'Unleashed', OGS: 'Proving Grounds' };
  async function versions(name) {
    const n = norm(name);
    return (await search({ name })).filter((c) => norm(c.name) === n);
  }
  /** Noms des cartes (pour reconnaître le nom lu sur une carte anglaise) : nom normalisé → ids */
  let namesMemo = null;
  async function names() {
    const D = await data();
    if (namesMemo && namesMemo.D === D) return namesMemo.m;
    const m = new Map();
    for (const k of D.idx.cards) for (const x of [k.n, nameOf(k)]) { const key = norm(x); if (key.length < 3) continue; if (!m.has(key)) m.set(key, new Set()); m.get(key).add(k.id); }
    namesMemo = { D, m };
    return m;
  }

  // ---------- Images ----------
  // visuels officiels en PNG 744 × 1039 (~1 Mo) → relais images.weserv.nl (réduit, en webp, et autorise CORS : comparaison d'images) ;
  // champs de bataille (horizontaux) tournés d'un quart de tour, comme ils sont rangés dans un classeur
  const img = {
    card: (c, q = 'low') => {
      const u = (c && c.image) || '';
      if (!/^https:\/\/cmsassets\.rgpub\.io\//.test(u)) return u;
      const land = c.landscape || /-1039x744\./.test(u);
      return `https://images.weserv.nl/?url=${encodeURIComponent(u.replace(/^https:\/\//, '').replace(/\?.*$/, ''))}&w=${q === 'high' ? 720 : 360}${land ? '&ro=270' : ''}&output=webp`;
    },
    // visuel de la série (v3.13) : le sachet de booster (coffret pour Proving Grounds), photo de TCGplayer (pas de visuel de série
    // chez Riot) ; affiché directement (le relais images.weserv.nl refuse TCGplayer ; une image n'a pas besoin de CORS)
    logo: (s) => (s && PACKS[s.id] ? `https://tcgplayer-cdn.tcgplayer.com/product/${PACKS[s.id]}_400w.jpg` : ''),
    logoCrop: (s) => { const p = s && PACKS_CROP[s.id]; return p ? { W: p[1], H: p[2], x0: p[3], y0: p[4], x1: p[5], y1: p[6] } : null; },
    symbol: () => '',
  };
  const cm = (q) => `https://www.cardmarket.com/fr/Riftbound/Products/Search?searchString=${encodeURIComponent(q)}`;

  // ---------- Reconnaissance d'une photo ----------
  // le code est imprimé en bas à gauche : « OGN · 013/298 · FR » (le nom de la série, puis le numéro et la langue)
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
  // séries lues de travers : « 0GN », « OCN », « SFO », « UNI »…
  const SET_ALT = { OGN: 'O[GC6]N|0[GC6]N|DGN|QGN', OGS: 'O[GC6][S5]|0[GC6][S5]', SFD: '[S5]F[DO0]', UNL: 'UN[LI1]', VEN: 'VEN|YEN', RAD: 'RAD|RA0' };
  function codeRe() {
    const known = SET_CODES(), alts = known.map((s) => `(?<${s}>${SET_ALT[s] || s})`).join('|');
    // série, séparateur (« · » lu « - », « . », « + », « » ou rien), puis numéro (3 chiffres + lettre éventuelle, R01, T01, SP3), puis « /298 » éventuel
    return new RegExp(String.raw`(?<![A-Z])(?:${alts})\s*[^A-Z0-9\s]?\s*((?:${D_}{3}(?:A(?![A-Z])|\*)?)|R${D_}{2}A?|T${D_}{2}|SP${D_})(?:\s*[/|lI1]\s*(${D_}{3}))?`, 'g');
  }
  /** Codes lus (« OGN-013 », avec un poids) */
  function codesIn(text) {
    const out = [], T = String(text || '').toUpperCase().replace(/[‐-―]/g, '-');
    for (const m of T.matchAll(codeRe())) {
      const set = Object.keys(m.groups || {}).find((k) => m.groups[k]); if (!set) continue;
      const raw = m[m.length - 2] || '', tail = m[m.length - 1] || '';
      const head = raw.match(/^(R|T|SP)?(.*?)([A*])?$/), pre = head[1] || '', suf = head[3] ? head[3].toLowerCase() : '';
      const w0 = tail ? 1.2 : 1; // « /298 » lu aussi : bien plus sûr
      for (const [n, w] of digitsOf(head[2])) out.push([`${set}|${pre}${n}${suf}`, w * w0]);
    }
    return out;
  }
  // zones de lecture (fractions de la carte) : bande du bas, côté gauche (code) — serrée et très agrandie, comme One Piece ;
  // puis le nom (bandeau au tiers inférieur), en clair et en négatif (texte blanc sur fond de couleur)
  const CODE_ZONES = [[0.945, 0.985, 8, 'sharp', 0.03, 0.42], [0.945, 0.985, 8, 'otsu', 0.03, 0.42], [0.935, 0.99, 7, 'sharp', 0.02, 0.5], [0.93, 0.995, 6, 'invert', 0.02, 0.5]];
  const NAME_ZONES = [[0.52, 0.66, 2.5, 'invert', 0.05, 0.95], [0.6, 0.72, 2.5, 'invert', 0.05, 0.95], [0.52, 0.72, 2.5, 'sharp', 0.05, 0.95]];
  const SLIDE_ZONES = [0.8, 0.84, 0.88, 0.92, 0.95].map((y) => [y, y + 0.04, 7, 'sharp', 0.02, 0.5]);
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

  // ---------- Vérification par l'image : réseau de neurones + points clés (js/visual.js › check), index data/rb-index ----------
  const RB_INDEX_V = 2;
  // seuil « sûre » par l'image seule, plus haut que le seuil commun (25) : la carte française est comparée au visuel anglais
  // (moins de points communs) — page d'Arnaud : Rayon Hextech pris « sûr » pour Abandon à 27 ; vraies cartes sûres ≥ 36
  const IMG_SURE = 30;
  const useVisual = () => App.visual && App.visual.supported() && App.settings.visualCheck !== false;
  const twinBase = (c) => `${c.setId}|${String(c.localId).replace(/[a-z*]+$/, '')}`;
  // setId : série de la page / choisie — même dessin dans deux séries (runes d'Origins et de Vendetta) : celle-ci d'abord
  const visualOpts = (codes, setId = '') => ({
    index: 'data/rb-index', v: RB_INDEX_V, cardsOf: (near) => fromIds(near.map((x) => x.id)), urlOf: (c) => img.card(c, 'low'),
    twinsOf: (top) => byCode(top.setId, String(top.localId).replace(/[a-z*]+$/, '')), // la carte et ses versions alternatives
    twinKey: (c) => c.id, // (chaque version a son propre dessin)
    tie: (a, b) => (codes.includes(b.id) - codes.includes(a.id)) || ((b.setId === setId) - (a.setId === setId)) || (a.alt - b.alt),
  });
  /**
   * Recadrage sur les vrais bords (v3.14, Arnaud : cartes Riftbound mal recadrées dans le Dex). Les coins trouvés par l'image
   * sont imprécis pour Riftbound : la carte (française) est comparée au visuel anglais, seule l'illustration correspond, le bas
   * de la carte est donc deviné (cadre penché, coupé, pochette gardée). On cherche alors les vrais bords de la carte (détourage)
   * autour de ces coins, et on ne les garde que s'ils concordent (chaque coin à moins de 12 % de la taille de la photo).
   */
  async function edgeCrop(blob, quad) {
    // v3.18 : sans coins trouvés par l’image, rien à recadrer (avant : cadre supposé à 8 % du bord = le cadre intérieur de la carte sur
    // une image déjà recadrée → carte zoomée, coupée)
    if (!quad) return null;
    try {
      const bmp = await createImageBitmap(blob), c = document.createElement('canvas');
      c.width = bmp.width; c.height = bmp.height; c.getContext('2d').drawImage(bmp, 0, 0);
      const cl = (v) => Math.min(1, Math.max(0, v));
      const E = quad.map(([x, y]) => [cl(x), cl(y)]);
      // v3.18 : carte qui touche le bord de l'image (photo déjà recadrée sur la carte) : rien à recadrer ici (le cadre intérieur
      // passait pour le bord → carte zoomée, coupée : Fizz et Poro d'Arnaud) ; c'est la photo d'origine (context) qui servira
      if (E.some(([x, y]) => x < 0.03 || x > 0.97 || y < 0.03 || y > 0.97)) return null;
      // détecteur de bords appris au labo (recognizer-edges.js), guidé par les coins trouvés par l'image
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
    // carte reconnue : vrais bords cherchés autour des coins trouvés par l'image (d'abord sur la photo elle-même)
    const edge = top && top.orb >= V.SURE ? await edgeCrop(blob, o.quad) : null;
    if (edge) o.crop = edge;
    if (!context || !o) return o;
    if (top && top.orb >= V.SURE) {
      // v3.17 : coins de la carte dans les alentours de la case (ctxQuad) → recalage de la grille du classeur (scan-batch-realign.js),
      // et vrais bords cherchés là, où la carte est entière même quand la grille l'a coupée
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
   * Lit une photo de carte (déjà recadrée) : code imprimé (« OGN · 013/298 »), nom, puis vérification par l'image.
   * Même déroulé que One Piece. Renvoie { info: { code, name, read, crop… }, cands }.
   */
  // v3.40 : bandes fines du code (en bas à gauche) lues par PaddleOCR (recognizer-ocr.js) ; [] si le lecteur n'est pas là
  const OCR_BANDS = [0.925, 0.935, 0.945, 0.955].map((y) => [y, y + 0.045, 0.02, 0.5]);
  async function ocrTexts(b) {
    const O = App.recognizerParts && App.recognizerParts.codeOcr;
    const rd = O ? await O.read(b, OCR_BANDS, { zones: [[0.935, 0.99, 0, 0.5]] }).catch(() => null) : null;
    return rd ? rd.texts : [];
  }
  async function recognize(blob, statusFn = () => {}, { setId = '', original = null, context = null } = {}) {
    const R = App.recognizer, D = await data();
    // vérification par l'image lancée tout de suite, en même temps que la lecture du texte
    const early = useVisual() ? visualPass(blob, [], [], context, setId).catch((e) => { console.warn('vérification par l’image', e); return null; }) : null;
    statusFn('Lecture du code de la carte…');
    // (2 bandes seulement au premier passage : 4 s → 2 s par carte ; le nom n'est lu qu'avec la carte entière, en dernier recours :
    //  les cartes françaises ne peuvent pas être reconnues par leur nom, Riot ne publiant que les noms anglais)
    // v3.40 : PaddleOCR d'abord (labo : 20 codes sur 22 contre 10 pour Tesseract), les 2 bandes Tesseract seulement s'il ne trouve rien
    const texts = await ocrTexts(blob);
    if (!texts.some((t) => codesIn(t).length)) texts.push(...(await R.readZones(blob, CODE_ZONES.slice(0, 2))));
    let read = texts.map(codesIn), betterCrop = null;
    const anyCode = () => read.some((r) => r.length);
    if (!anyCode() && !early) { const t = await R.readZones(blob, [...CODE_ZONES.slice(2), ...NAME_ZONES]); texts.push(...t); read.push(...t.map(codesIn)); }
    if (early && !anyCode()) {
      statusFn('Vérification par l’image…');
      const e = await early;
      if (e && e.cands[0] && e.cands[0].confident && (e.cands[0].orb || 0) >= IMG_SURE) return { info: { code: e.cands[0].id, name: '', votes: {}, crop: e.crop, ctxQuad: e.ctxQuad, orb: e.best, read: 'reconnue à l’image ✓' }, cands: e.cands.slice(0, 40) };
      // code relu : sur la carte recadrée par l'image (vrais bords) s'il y en a une, sinon les 2 autres bandes sur la case
      const crop = e && e.crop;
      statusFn(crop ? 'Lecture du code (carte recadrée)…' : 'Lecture du code…');
      let t = crop ? await ocrTexts(crop) : [];
      if (!t.some((x) => codesIn(x).length)) t = [...t, ...(await R.readZones(crop || blob, crop ? CODE_ZONES : CODE_ZONES.slice(2)))];
      texts.push(...t); read.push(...t.map(codesIn));
      if (anyCode() && crop) betterCrop = crop;
    }
    // autres cadrages : carte seule et rafale ; pas en classeur (context), où la vérification par l'image fait mieux et plus vite
    // (mesuré sur une page d'Arnaud : 4 à 7 s de plus par carte difficile, pour aucune carte en plus — et un faux « OGN 071 »)
    if (original && !context && !anyCode()) {
      statusFn('Lecture du code (autre cadrage)…');
      for (const alt of await otherCrops(original)) {
        const t = await R.readZones(alt.blob, alt.zones); texts.push(...t); read.push(...t.map(codesIn));
        if (anyCode()) { betterCrop = alt.asPhoto ? alt.blob : null; break; }
      }
    }
    if (!anyCode() && !(context && early)) { statusFn('Lecture de toute la carte…'); const [full] = await R.readZones(blob, ['full']); texts.push(full); read.push(codesIn(full)); }
    // votes : « série|numéro » → poids ; seuls les numéros qui existent comptent
    const votes = {};
    for (const r of read) for (const [c, w] of r) votes[c] = (votes[c] || 0) + w;
    const exists = (c) => { const [s, n] = c.split('|'); return (D.bySet.get(s) || []).some((k) => String(k.l).toUpperCase() === n.toUpperCase()); };
    let codes = Object.keys(votes).filter(exists).sort((a, b) => votes[b] - votes[a]);
    if (codes.length) codes = codes.filter((c) => votes[c] >= votes[codes[0]] * 0.5);
    // nom (cartes anglaises seulement : Riot ne publie pas les noms français)
    statusFn('Recherche de la carte…');
    const nm = await names(), lines = texts.join('\n').split('\n').map((l) => norm(l)).filter((l) => l.length >= 3);
    let best = { k: '', s: 0 };
    const keys = [...nm.keys()];
    for (const l of lines) for (const k of keys) {
      if (Math.abs(k.length - l.length) > Math.max(3, k.length * 0.4)) continue;
      const s = l === k ? 1 : l.includes(k) && k.length >= 5 ? 0.9 : App.util.similarity(l, k);
      if (s > best.s) best = { k, s };
    }
    const nameOk = best.s >= 0.8 ? best.k : '';
    const nameIds = nameOk ? [...nm.get(nameOk)] : [];
    let agreed = false;
    let cands = [];
    for (const c of codes.slice(0, 3)) { const [s, n] = c.split('|'); cands.push(...(await byCode(s, n))); }
    // le code lu désigne la carte exacte (« 238a ») : elle d'abord, puis ses autres versions
    const codeIds = new Set(codes.map((c) => { const [s, n] = c.split('|'); const k = (D.bySet.get(s) || []).find((x) => String(x.l).toUpperCase() === n.toUpperCase()); return k && k.id; }).filter(Boolean));
    if (nameOk && cands.length) { const ok = cands.filter((c) => nameIds.includes(c.id)); if (ok.length) agreed = true; }
    if (!cands.length && nameOk) cands = (await fromIds(nameIds)).sort((a, b) => ((b.setId === setId) - (a.setId === setId)) || String(b.set.sortKey).localeCompare(String(a.set.sortKey)));
    const seen = new Set(); cands = cands.filter((x) => !seen.has(x.id) && seen.add(x.id));
    cands.sort((a, b) => (codeIds.has(b.id) - codeIds.has(a.id)));
    for (const c of cands) { c.numOk = codeIds.has(c.id); c.ofOk = c.numOk; }
    // illustration comparée à la photo (versions alternatives : même numéro, autre dessin)
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
    // pas sûre par le texte : vérification par l'image (et recadrage sur les vrais bords)
    let orb = null;
    if (!(top && top.confident) && useVisual()) {
      statusFn('Vérification par l’image…');
      // (rien trouvé par le texte : la vérification lancée au début a déjà tout comparé, inutile de la refaire — 6 s par carte)
      const e = early && !cands.length ? await early : null;
      if (e) orb = e;
      else orb = await visualPass(blob, cands, [...codeIds], context, setId).catch((err) => { console.warn('vérification par l’image', err); return null; });
      if (orb) { cands = orb.cands; top = cands[0]; }
      // sûre par l'image seule : score d'au moins IMG_SURE (sinon « à vérifier »), sauf si le code lu désigne cette carte
      if (top && top.confident && !codeIds.has(top.id) && (top.orb || 0) < IMG_SURE) delete top.confident;
    }
    if (orb && orb.crop) betterCrop = orb.crop;
    const cropLater = !orb && early && top ? early.then((e) => (e && e.crop && e.cands[0] && e.cands[0].id === top.id ? e.crop : null), () => null) : null;
    const first = codes[0] ? codes[0].replace('|', ' · ') : '';
    const byImg = codes.length && top && !codeIds.has(top.id) && top.orb >= 25;
    const readTxt = codes.length ? `code ${byImg ? `${top.setId} · ${top.localId}` : first}${byImg ? ' (corrigé grâce à l’illustration)' : ''}` : '';
    return { info: { code: top ? top.id : '', name: nameOk, votes, crop: betterCrop, cropLater, ctxQuad: orb && top && orb.cands[0] === top ? orb.ctxQuad : null, orb: orb ? orb.best : null, read: [readTxt, nameOk ? `nom « ${nameOk} »` : '', top && top.orb >= 25 ? 'reconnue à l’image ✓' : ''].filter(Boolean).join(', ') }, cands: cands.slice(0, 40) };
  }

  /** Recherche à la main (code « OGN-013 » ou nom anglais), classée par ressemblance avec la photo */
  async function manual(blob, nameTxt, numTxt) {
    const name = (nameTxt || '').trim(), num = (numTxt || '').trim();
    if (!name && !num) throw new Error('Indique un nom (en anglais), ou un code (ex. OGN-013)');
    let cands = await search({ name: num || name });
    // numéro seul (« 013 ») : dans toutes les séries
    if (!cands.length && /^\d{1,3}[a-z*]?$/i.test(num)) { const D = await data(); for (const s of D.sets) cands.push(...await byCode(s.id, num)); }
    if (num && name) { const n = norm(name), f = cands.filter((c) => norm(c.name).includes(n)); if (f.length) cands = f; }
    if (blob && cands.length > 1) {
      const pool = cands.slice(0, 24), vis = await App.recognizer.resemblanceMany(blob, pool, (c) => img.card(c, 'low').replace('&w=360', '&w=160')).catch(() => new Map());
      for (const c of pool) c.visual = vis.has(c.id) ? vis.get(c.id) : null;
      cands = [...pool.sort((a, b) => (b.visual ?? -1) - (a.visual ?? -1)), ...cands.slice(24)];
    }
    return cands;
  }

  App.games.register('riftbound', {
    id: 'riftbound',
    name: 'Riftbound',
    listSets, getSet, getCard, search, versions, byCode, setIdsByName, price, tpMarket, img, recognize, manual, codesIn, names,
    visualIndex: { index: 'data/rb-index', v: RB_INDEX_V }, // (v3.36 : préparée d'avance par App.scanMemo.prepare)
    visualCheck: (blob) => (useVisual() ? visualPass(blob, [], []) : Promise.resolve(null)), // (« Toutes » : licence devinée à l'image)
    langFor: () => (App.settings && App.settings.lang === 'en' ? 'en' : 'fr'),
    cardmarketUrl: (card) => cm(card.baseName || String(card.name || '').replace(/,.*$/, '')),
    boosterUrl: (set) => cm(set.name + ' booster'),
    isOfficial: (localId, set) => isOfficialIn(localId, memo && (memo.sets.find((s) => s.id === set.id) || {}).max),
    logoText: (s) => s.id,
    extraLabel: 'versions alternatives, signatures et jetons',
    priceNote: 'Prix : marché américain TCGplayer (cartes anglaises), converti en euros, mise à jour quotidienne. Noms et textes des cartes en anglais (Riot ne publie pas encore les noms français).',
    rarity,
    pullRates: () => null,
    source: { name: 'Riot Games (galerie officielle)', url: 'https://playriftbound.com/fr-fr/card-gallery/' },
  });
})();
