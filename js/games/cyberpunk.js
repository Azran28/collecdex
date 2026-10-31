/*
 * Adaptateur Cyberpunk TCG (v3.96, 10ᵉ licence, WeirdCo sous licence CD PROJEKT RED).
 * Cartes : data/cp-cartes.json, préparé depuis la base officielle (cyberpunktcg.com/cards, servie par Netdeck.gg : noms, textes,
 * raretés, couleurs, coût, Power, RAM, tags, EN FRANÇAIS ; cartes seulement anglaises : Bêta du Kickstarter, tournois, promos) par
 * outils/ci/cyberpunk-cartes.mjs, remis à jour chaque lundi par le robot de l'index.
 * Visuels : les images officielles sont des adresses signées valables 5 minutes → une petite copie de chaque visuel (300 px, webp,
 * le visuel français d'abord) est rangée dans le site, data/cp-img/<id>.webp, par le même outil (comme Wankul).
 * Prix : marché TCGplayer (en $, cartes anglaises), préparé chaque jour par le robot de mise en ligne (data/cp-prix.json,
 * outils/ci/prix-cyberpunk.mjs), relié par le n° de produit TCGplayer (« tp »).
 * Identifiant d'une carte = série + numéro imprimé : « wnc-010 », « wnc-005a », « wncb-010 » (Bêta, imprimé « B010 »), « hei-001 ».
 * Code imprimé à la VERTICALE en bas à gauche : « MS01 - WNC [A] », numéro en biais dans un onglet jaune juste à côté.
 */
(() => {
  const DAY = 24 * 3600 * 1000;
  const { norm } = App.util;

  // ---------- Données (fichier du site, gardé en cache : utilisable hors ligne ; relu à chaque nouvelle version du site) ----------
  let indexP = null;
  const index = () => indexP || (indexP = (async () => {
    const hit = await App.db.get('cache', 'cp1:index').catch(() => null);
    if (hit && hit.ver === window.APP_VERSION && Date.now() - hit.t < 3 * DAY) return hit.v;
    try {
      const r = await fetch('data/cp-cartes.json', { cache: 'no-cache' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const v = await r.json();
      await App.db.set('cache', 'cp1:index', { t: Date.now(), ver: window.APP_VERSION, v }).catch(() => {});
      return v;
    } catch (e) {
      if (hit) { console.warn('Réseau indisponible, données en cache utilisées', e); return hit.v; }
      indexP = null;
      throw e;
    }
  })());

  // ---------- Raretés ----------
  // clé → [rang, nom FR, sigle, couleur] ; Rare et au-dessus : brillantes (cartes à part, pas de version normale)
  const RAR = {
    c:  [1, 'Commune',              'C',  '#a9b0ba'],
    u:  [2, 'Peu commune',          'U',  '#5fb86a'],
    r:  [3, 'Rare',                 'R',  '#5aa0e0'],
    e:  [4, 'Épique',               'E',  '#9b6ef0'],
    nr: [4, 'Nova Rare',            'NR', '#e0679b'],
    s:  [6, 'Secrète',              'S',  '#e8b923'],
    il: [7, 'Légende iconique',     'IL', '#ff3b5c'],
    io: [7, 'Iconique',             'IC', '#22d3ee'],
    is: [9, 'Secrète iconique',     'IS', 'url(#rbw)'],
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
      return `<span class="rar" title="${lab}"><span class="rar-txt" style="background:${k ? pillBg(RAR[k][3]) : '#b9c0d4'}">${esc(k ? RAR[k][2] : String(r || '?').slice(0, 4))}</span></span>`;
    },
    css: (r) => { const k = rkey(r); return k ? pillBg(RAR[k][3]) : '#b9c0d4'; },
  };
  // (TCGplayer : communes et peu communes normales, Rare et au-dessus brillantes ; une seule version par carte)
  const variantsOf = (k) => (k.r === 'c' || k.r === 'u' ? { normal: true } : { holo: true });

  // ---------- Séries ----------
  const GROUPS = {
    main: { id: 'cp-main', name: 'Extensions', order: 1 }, deck: { id: 'cp-deck', name: 'Decks', order: 2 },
    promo: { id: 'cp-promo', name: 'Promos et tournois', order: 3 }, beta: { id: 'cp-beta', name: 'Édition Bêta (Kickstarter)', order: 4 },
  };
  const TYPE = { l: 'Légende', u: 'Unité', g: 'Équipement', p: 'Programme' };
  const COLOR = { r: 'Rouge', b: 'Bleu', g: 'Vert', y: 'Jaune' };
  // cartes de la série (les suivantes sont les versions iconiques, illustrations alternatives)
  const MAX = { wnc: 140, wncb: 140 };

  let memo = null;
  async function data() {
    const idx = await index();
    if (memo && memo.idx === idx) return memo;
    const byId = new Map(), bySet = new Map(), byNum = new Map(), byCid = new Map();
    for (const k of idx.cards) {
      byId.set(k.id, k); if (!bySet.has(k.s)) bySet.set(k.s, []); bySet.get(k.s).push(k);
      byNum.set(`${k.s}|${k.l}`, k);
      if (k.cid) { if (!byCid.has(k.cid)) byCid.set(k.cid, []); byCid.get(k.cid).push(k); }
    }
    const sets = idx.sets.filter((s) => bySet.has(s.id)).map((s, i) => {
      const list = bySet.get(s.id);
      return {
        id: s.id, name: s.name, en: s.en || '', code: s.code || '', type: s.type, fr: !!s.fr, pk: s.pk || 0, logo: '', symbol: '',
        releaseDate: s.date || '', sortKey: `${s.date || '2026-12-31'}-${String(99 - i).padStart(2, '0')}`,
        total: list.length, official: MAX[s.id] ? list.filter((k) => isOfficialIn(k.l, MAX[s.id])).length : list.length, group: GROUPS[s.type] || GROUPS.promo,
      };
    });
    memo = { idx, byId, bySet, byNum, byCid, sets };
    return memo;
  }
  const isOfficialIn = (l, max) => !max || (parseInt(l, 10) >= 1 && parseInt(l, 10) <= max);
  async function listSets() {
    const { sets } = await data();
    return sets.map(({ en, code, type, fr, pk, ...s }) => s);
  }

  // ---------- Cartes ----------
  const cmp = (a, b) => (parseInt(a.l, 10) - parseInt(b.l, 10)) || String(a.l).localeCompare(String(b.l));
  const setShape = (s) => ({ id: s.id, name: s.name, logo: '', symbol: '', releaseDate: s.releaseDate, sortKey: s.sortKey, cardCount: { total: s.total, official: s.official }, serie: s.group });
  const imageOf = (k) => `data/cp-img/${k.id}.webp`;
  /** Code imprimé en bas à gauche : « MS01 - WNC [A] · 010 », Bêta « MS01 - WNC [A] · B010 » */
  const printed = (k, s) => `${(s && s.code) || ''}${s && s.code ? ' · ' : ''}${s && s.type === 'beta' ? 'B' : ''}${k.l}`;
  const nameOf = (k) => (k.st ? `${k.n} : ${k.st}` : k.n);
  const nameEnOf = (k) => (k.ne ? (k.se ? `${k.ne} — ${k.se}` : k.ne) : '');
  // « {Call} Jetez 3. » → « CALL Jetez 3. » (mots-clés imprimés en capitales sur fond jaune)
  const textOf = (x) => String(x || '').replace(/\{([^}]+)\}/g, (m, a) => a.toUpperCase());
  function normCard(k, s) {
    const facts = [TYPE[k.t] || '', COLOR[k.c] ? `Couleur ${COLOR[k.c].toLowerCase()}` : '', k.co != null ? `Coût ${k.co}` : '', k.p != null ? `Power ${k.p}` : '',
      k.ram != null ? `RAM ${k.ram}` : '', k.ed ? 'Revendable (€$)' : '', k.tg && k.tg.length ? `Tags : ${k.tg.join(', ')}` : '',
      k.lg === 'en' ? 'Imprimée en anglais seulement' : '', `Code ${printed(k, s)}`].filter(Boolean);
    return {
      id: k.id, localId: k.l, name: nameOf(k), baseName: k.n, subtitle: k.st || '', nameEn: nameEnOf(k), code: printed(k, s), image: imageOf(k),
      rarity: k.r, variants: variantsOf(k), category: TYPE[k.t] || '', kind: k.t || '', types: [], facts, text: textOf(k.x), illustrator: k.a || '',
      color: k.c || '', cost: k.co, power: k.p, ram: k.ram, tags: k.tg || [], eddies: !!k.ed, cid: k.cid || '', tp: k.tp || 0,
      setId: s.id, serieId: s.group.id, alt: s.type !== 'main' || !isOfficialIn(k.l, MAX[s.id]),
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

  // ---------- Prix (TCGplayer, préparés par le robot : data/cp-prix.json = { m: date, p: { n° de produit TCGplayer: [normal, brillant] } }) ----------
  const ONLINE = 'https://azran28.github.io/collecdex/data/cp-prix.json';
  let pricesP = null;
  const prices = () => pricesP || (pricesP = (async () => {
    const hit = await App.db.get('cache', 'cp1:prix').catch(() => null);
    const full = hit && hit.v && hit.v.p && Object.keys(hit.v.p).length;
    if (hit && Date.now() - hit.t < (full ? DAY / 2 : 15 * 60 * 1000)) return hit.v;
    for (const u of ['data/cp-prix.json', ONLINE]) {
      const r = await fetch(u, { cache: 'no-cache' }).catch(() => null);
      const v = r && r.ok ? await r.json().catch(() => null) : null;
      if (v && v.p && Object.keys(v.p).length) { await App.db.set('cache', 'cp1:prix', { t: Date.now(), v }).catch(() => {}); return v; }
    }
    if (full) return hit.v;
    await App.db.set('cache', 'cp1:prix', { t: Date.now(), v: { m: '', p: {} } }).catch(() => {});
    return { m: '', p: {} };
  })().finally(() => setTimeout(() => { pricesP = null; }, 60000)));
  async function getCard(id) {
    id = String(id);
    const D = await data(), k = D.byId.get(id);
    if (!k) throw new Error('Carte inconnue : ' + id);
    const s = D.sets.find((x) => x.id === k.s) || { id: k.s, name: k.s, group: GROUPS.promo, releaseDate: '', sortKey: '', total: 0, official: 0 };
    const P = await prices().catch(() => ({ p: {} })), p = k.tp ? (P.p || {})[k.tp] : null;
    // (un seul produit par carte chez TCGplayer : son prix va à la version de la carte, normale ou brillante)
    const v = p ? p[0] || p[1] : null, holo = !variantsOf(k).normal;
    return {
      ...normCard(k, s),
      set: setShape(s),
      pricing: v ? { tcgplayer: { normal: holo ? null : v, holo: holo ? v : null }, updated: P.m || '' } : null,
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
  const numKey = (n) => String(n).trim().toLowerCase().replace(/^[bβ]/, '').replace(/^(\d+)/, (d) => d.padStart(3, '0'));
  /** La carte d'un numéro dans une série (« wnc », « 10 » / « 005a ») */
  async function byCode(setId, num) {
    const D = await data(), k = D.byNum.get(`${String(setId).toLowerCase()}|${numKey(num)}`);
    return k ? fromIds([k.id]) : [];
  }
  const dateOf = (D) => new Map(D.sets.map((s) => [s.id, s.sortKey]));
  async function search({ name }) {
    const q = norm(name); if (!q) return [];
    const D = await data();
    const c = codesIn(name);
    if (c.length) { const ids = [...new Set(c.sort((a, b) => b[1] - a[1]).map(([key]) => (D.byNum.get(key) || {}).id).filter(Boolean))]; if (ids.length) return fromIds(ids); }
    if (D.byId.has(String(name).trim().toLowerCase())) return fromIds([String(name).trim().toLowerCase()]);
    const ids = [];
    for (const k of D.idx.cards) if (norm(nameOf(k)).includes(q) || norm(`${k.n} ${k.st || ''}`).includes(q) || (k.ne && norm(`${k.ne} ${k.se || ''}`).includes(q))) ids.push(k.id);
    // (même nom dans plusieurs séries : l'extension française d'abord, puis les plus récentes ; la Bêta en dernier)
    const date = dateOf(D), beta = (id) => (D.sets.find((s) => s.id === D.byId.get(id).s) || {}).type === 'beta';
    ids.sort((a, b) => (beta(a) - beta(b)) || String(date.get(D.byId.get(b).s)).localeCompare(String(date.get(D.byId.get(a).s))));
    return fromIds(ids.slice(0, 300));
  }
  /** Séries dont le nom ou le code correspond (« Welcome to Night City », « WNC », « Beta ») — import d'un fichier */
  async function setIdsByName(name) {
    const raw = String(name).replace(/^cyberpunk\s*(tcg)?\s*[-:–]?\s*/i, '');
    const q = norm(raw); if (!q) return [];
    const beta = /\bbeta\b|bêta/i.test(raw), qq = norm(raw.replace(/[-–(]\s*(retail|beta|bêta)\s*\)?/ig, ' '));
    const sets = (await data()).sets.filter((s) => (s.type === 'beta') === beta || !/retail|beta|bêta/i.test(raw));
    const names = (s) => [s.id, s.name, s.en || '', String(s.en || '').replace(/\s*-\s*(Retail|Beta)\b.*$/i, ''), s.code, String(s.code).split(' - ').pop()].map(norm);
    const exact = sets.filter((s) => names(s).includes(q) || names(s).includes(qq));
    const out = exact.length ? exact : sets.filter((s) => names(s).some((n) => n && n.length > 3 && (n.includes(qq) || qq.includes(n))));
    // (sans « Beta » dans le nom : la version vendue en boutique d'abord)
    return out.sort((a, b) => ((a.type === 'beta') - (b.type === 'beta'))).map((s) => s.id);
  }
  async function versions(name) {
    const n = norm(name);
    return (await search({ name })).filter((c) => norm(c.baseName) === n || norm(c.name) === n || norm(c.nameEn) === n);
  }
  /** Noms des cartes (français et anglais ; nom seul et nom + sous-titre) : nom normalisé → ids */
  let namesMemo = null;
  async function names() {
    const D = await data();
    if (namesMemo && namesMemo.D === D) return namesMemo.m;
    const m = new Map();
    const add = (x, id) => { const key = norm(x); if (key.length < 3) return; if (!m.has(key)) m.set(key, new Set()); m.get(key).add(id); };
    for (const k of D.idx.cards) { add(k.n, k.id); if (k.st) add(`${k.n} ${k.st}`, k.id); if (k.ne) add(k.ne, k.id); if (k.se) add(`${k.ne} ${k.se}`, k.id); }
    namesMemo = { D, m };
    return m;
  }

  // ---------- Images ----------
  const img = {
    // (adresse complète : la vérification par l'image lit les visuels depuis un worker, où une adresse relative ne mène nulle part)
    card: (c) => { const u = (c && c.image) || ''; return /^data\/cp-img\/[a-z0-9-]+\.webp$/.test(u) ? new URL(u, document.baseURI).href : u; },
    // visuel de la série : son sachet de booster (ou son deck) chez TCGplayer ; promos : le code
    logo: (s) => { const pk = s && memo && (memo.sets.find((x) => x.id === s.id) || {}).pk; return pk ? `https://tcgplayer-cdn.tcgplayer.com/product/${pk}_400w.jpg` : ''; },
    logoCrop: () => null,
    symbol: () => '',
  };
  const tcgSearch = (q) => `https://www.tcgplayer.com/search/cyberpunk-tcg/product?q=${encodeURIComponent(q)}`;
  const tcgLink = (card) => (card && card.tp ? `https://www.tcgplayer.com/product/${card.tp}` : tcgSearch(card ? (card.nameEn || card.name).split(' — ')[0] : ''));

  // ---------- Reconnaissance d'une photo ----------
  // le code est imprimé à la verticale le long du bord gauche, en bas (« MS01 - WNC [A] », « SD01 - HEI [A] », « NCB01 - WNC »,
  // « PRM - DD2 [A] », « PRM01 ») et le numéro en biais dans l'onglet jaune du coin (« 010 », « 005a », Bêta « B010 »)
  const DIG = { O: '0', D: '0', Q: '0', I: '1', L: '1', '|': '1', S: '5', Z: '2', B: '8', G: '6' };
  const digits = (s) => [...s].map((ch) => (/\d/.test(ch) ? ch : DIG[ch] || '')).join('');
  const fuzz = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/0/g, '[0OD]').replace(/1/g, '[1IL|]');
  let codeRes = null;
  /** [{ id, beta, pre (préfixe seul), full (préfixe + suite) }] des séries, d'après leur code imprimé */
  function codeRules() {
    if (codeRes && codeRes.memo === memo) return codeRes.list;
    const list = (memo ? memo.sets : []).filter((s) => s.code).map((s) => {
      const [pre, suf] = s.code.split(' - ');
      return {
        id: s.id, beta: s.type === 'beta', suf: !!suf,
        pre: new RegExp(`(?:^|[^A-Z0-9])${fuzz(pre)}(?![0-9]|[ODQ][1IL|])`),
        full: suf ? new RegExp(`(?:^|[^A-Z0-9])${fuzz(pre)}\\s*[-–_.~=]?\\s*${fuzz(suf)}`) : null,
      };
    });
    codeRes = { memo, list };
    return list;
  }
  /** Codes lus (« wnc|010 », avec un poids) ; il faut le code de la série ET un numéro : rien sur un code Pokémon (« 025/165 ») */
  function codesIn(text) {
    const out = [], T = String(text || '').toUpperCase().replace(/[‐-―]/g, '-');
    const rules = codeRules();
    const sets = [];
    for (const r of rules) { if (r.full && r.full.test(T)) sets.push([r, 1]); else if (r.pre.test(T)) sets.push([r, r.suf ? 0.6 : 1]); }
    if (!sets.length) return out;
    const nums = [];
    for (const m of T.matchAll(/(?:^|[^A-Z0-9])(B|β)?\s?([0-9OIL|]{3})([AB])?(?![0-9A-Z])/g)) {
      const d = digits(m[2]); if (!/^\d{3}$/.test(d) || +d < 1) continue;
      nums.push([d + (m[3] || '').toLowerCase(), !!m[1]]);
    }
    for (const [r, w] of sets) for (const [n, b] of nums) {
      const k = memo && memo.byNum.get(`${r.id}|${n}`);
      if (memo && !k) continue;
      out.push([`${r.id}|${n}`, w * (r.beta === b ? 1 : 0.3)]);
    }
    return out;
  }
  // zones de lecture : le code sur la photo tournée d'un quart de tour vers la gauche (il est alors couché en bas à droite) ;
  // le numéro dans le coin bas-gauche tourné de −50° ; le nom en haut (Légendes) ou au-dessus du texte (autres cartes)
  const CODE_BANDS = [[0.935, 0.985, 0.78, 0.99], [0.94, 0.99, 0.75, 0.99]];
  const CODE_ZONES = [[0.9, 1, 0.72, 1]];
  const NUM_BOX = [0.02, 0.86, 0.2, 1];
  const NUM_ZONES = [[0.3, 0.7, 0, 1]];
  const NAME_BANDS = [[0.07, 0.13, 0.2, 0.8], [0.125, 0.185, 0.2, 0.8], [0.6, 0.68, 0.08, 0.78], [0.645, 0.725, 0.08, 0.78]];
  /** Photo tournée d'un quart de tour vers la gauche : le code vertical se lit alors à l'horizontale */
  async function leftTurned(b) {
    const bmp = await createImageBitmap(b), c = document.createElement('canvas');
    c.width = bmp.height; c.height = bmp.width;
    const g = c.getContext('2d'); g.translate(0, c.height); g.rotate(-Math.PI / 2); g.drawImage(bmp, 0, 0);
    return c;
  }
  /** Coin bas-gauche (onglet du numéro) tourné pour que le numéro soit à l'horizontale */
  async function numCorner(b, deg = -50) {
    const bmp = await createImageBitmap(b), [x0, y0, x1, y1] = NUM_BOX, w = (x1 - x0) * bmp.width, h = (y1 - y0) * bmp.height;
    const S = Math.ceil(Math.hypot(w, h)), c = document.createElement('canvas'); c.width = S; c.height = S;
    const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, S, S); g.translate(S / 2, S / 2); g.rotate(deg * Math.PI / 180);
    g.drawImage(bmp, x0 * bmp.width, y0 * bmp.height, w, h, -w / 2, -h / 2, w, h);
    return c;
  }
  async function ocrTexts(b) {
    const O = App.recognizerParts && App.recognizerParts.codeOcr;
    if (!O) return [];
    const [lt, nc] = await Promise.all([leftTurned(b).catch(() => null), numCorner(b).catch(() => null)]);
    const [cd, nb, nm] = await Promise.all([
      lt ? O.read(lt, CODE_BANDS, { zones: CODE_ZONES }).catch(() => null) : null,
      nc ? O.read(nc, [], { zones: NUM_ZONES }).catch(() => null) : null,
      O.read(b, NAME_BANDS).catch(() => null),
    ]);
    const code = cd ? cd.texts.filter(Boolean) : [], num = nb ? nb.texts.filter(Boolean) : [];
    // (code et numéro lus à part : recollés pour que codesIn les voie ensemble)
    return [...code, ...num, ...(nm ? nm.texts : []), code.length && num.length ? `${code.join(' ')} ${num.join(' ')}` : ''].filter(Boolean);
  }
  // meilleur cadre en forme de carte dans la photo (détourage raté), remis à plat — v3.46, commun : js/games/card-tools.js
  const findCrop = (src) => App.cardTools.findCrop(src);

  // ---------- Vérification par l'image : réseau de neurones + points clés (js/visual.js › check), index data/cp-index ----------
  const CP_INDEX_V = 1;
  const IMG_SURE = 30;
  const useVisual = () => App.visual && App.visual.supported() && App.settings.visualCheck !== false;
  // même illustration dans l'extension et dans la Bêta (et l'anglais / le français) : le numéro lu (« B010 ») tranche
  async function twinsOf(c) {
    const D = await data(), k = D.byId.get(c.id);
    if (!k || !k.cid) return [];
    return fromIds(D.byCid.get(k.cid).filter((x) => x.id !== k.id && x.l === k.l).map((x) => x.id));
  }
  const visualOpts = (codes, setId = '') => ({
    index: 'data/cp-index', v: CP_INDEX_V, cardsOf: (near) => fromIds(near.map((x) => x.id)), urlOf: (c) => img.card(c, 'low'),
    twinsOf, twinKey: (c) => `${c.cid}|${c.localId}`,
    tie: (a, b) => (codes.includes(b.id) - codes.includes(a.id)) || ((b.setId === setId) - (a.setId === setId)) || (a.alt - b.alt),
  });
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
  /** Bêta ou boutique (même illustration) : sans numéro lu, la carte de boutique devant, « à vérifier » */
  function twinDoubt(cands, codeIds) {
    const top = cands[0];
    if (!top || codeIds.has(top.id)) return;
    const tw = cands.filter((c) => c !== top && c.cid === top.cid && c.localId === top.localId);
    if (!tw.length) return;
    delete top.confident;
    const shop = [top, ...tw].sort((a, b) => ((a.set && a.set.serie && a.set.serie.id === 'cp-beta') - (b.set && b.set.serie && b.set.serie.id === 'cp-beta')))[0];
    if (shop !== top) { cands.splice(cands.indexOf(shop), 1); cands.unshift(shop); }
  }

  /**
   * Lit une photo de carte (déjà recadrée) : code imprimé à la verticale + numéro en biais, nom, puis vérification par l'image.
   * Même déroulé que Wankul et Final Fantasy. Renvoie { info: { code, name, read, crop… }, cands }.
   */
  async function recognize(blob, statusFn = () => {}, { setId = '', original = null, context = null, onCrop = null } = {}) {
    const R = App.recognizer, D = await data();
    const early = useVisual() ? visualPass(blob, [], [], context, setId).catch((e) => { console.warn('vérification par l’image', e); return null; }) : null;
    if (early && onCrop) early.then((e) => { if (e && e.crop) onCrop(e.crop); }, () => {}); // (cadrage sur les vrais bords montré dès qu'il est trouvé, v3.47)
    statusFn('Lecture du code de la carte…');
    const texts = await ocrTexts(blob);
    let read = texts.map(codesIn), betterCrop = null;
    const anyCode = () => read.some((r) => r.length);
    if (early && !anyCode()) {
      statusFn('Vérification par l’image…');
      const e = await early;
      if (e && e.cands[0] && e.cands[0].confident && (e.cands[0].orb || 0) >= IMG_SURE) {
        const cands = e.cands.slice(0, 40); twinDoubt(cands, new Set());
        if (cands[0].confident) return { info: { code: cands[0].id, name: '', votes: {}, crop: e.crop, ctxQuad: e.ctxQuad, orb: e.best, read: 'reconnue à l’image ✓' }, cands };
      }
      const crop = e && e.crop;
      statusFn(crop ? 'Lecture du code (carte recadrée)…' : 'Lecture du code…');
      const t = crop ? await ocrTexts(crop) : [];
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
    // code et nom en désaccord (numéro mal lu) : la carte de ce nom au même numéro, dans une autre série, passe devant
    if (nameOk && cands.length && !agreed) {
      const nums = new Set(codes.map((c) => c.split('|')[1]));
      const fx = (await fromIds(nameIds)).filter((c) => nums.has(String(c.localId)));
      if (fx.length) { for (const c of fx) c.codeFix = true; cands = [...fx, ...cands]; agreed = true; }
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
      twinDoubt(cands, codeIds); top = cands[0];
    }
    if (orb && orb.crop) betterCrop = orb.crop;
    const cropLater = !orb && early && top ? early.then((e) => (e && e.crop && e.cands[0] && e.cands[0].id === top.id ? e.crop : null), () => null) : null;
    const codeTxt = (c) => { const k = D.byNum.get(c), s = k && D.sets.find((x) => x.id === k.s); return k ? `code ${printed(k, s)} (${s ? s.name : k.s})` : c; };
    const byImg = codes.length && top && !codeIds.has(top.id) && top.orb >= 25;
    const readTxt = codes.length ? `${byImg ? codeTxt(`${top.setId}|${top.localId}`) : codeTxt(codes[0])}${byImg ? ' (corrigé grâce à l’illustration)' : ''}` : '';
    return { info: { code: top ? top.id : '', name: nameOk, votes, crop: betterCrop, cropLater, ctxQuad: orb && top && orb.cands[0] === top ? orb.ctxQuad : null, orb: orb ? orb.best : null, read: [readTxt, nameOk ? `nom « ${nameOk} »` : '', top && top.orb >= 25 ? 'reconnue à l’image ✓' : ''].filter(Boolean).join(', ') }, cands: cands.slice(0, 40) };
  }

  /** Recherche à la main (nom, ou numéro « 010 », « B010 »), classée par ressemblance avec la photo */
  async function manual(blob, nameTxt, numTxt) {
    const name = (nameTxt || '').trim(), num = (numTxt || '').trim();
    if (!name && !num) throw new Error('Indique un nom, ou un numéro (ex. 010)');
    let cands = [];
    if (num) {
      const D = await data(), n = numKey(num), beta = /^[bβ]/i.test(num);
      cands = await fromIds(D.idx.cards.filter((k) => k.l === n).map((k) => k.id));
      cands.sort((a, b) => ((a.serieId === 'cp-beta') !== beta) - ((b.serieId === 'cp-beta') !== beta) || (a.alt - b.alt));
    } else cands = await search({ name });
    if (num && name) { const q = norm(name), f = cands.filter((c) => norm(c.name).includes(q) || norm(c.nameEn).includes(q)); cands = f.length ? f : await search({ name }); }
    if (blob && cands.length > 1) {
      const pool = cands.slice(0, 24), vis = await App.recognizer.resemblanceMany(blob, pool, (c) => img.card(c, 'low')).catch(() => new Map());
      for (const c of pool) c.visual = vis.has(c.id) ? vis.get(c.id) : null;
      cands = [...pool.sort((a, b) => (b.visual ?? -1) - (a.visual ?? -1)), ...cands.slice(24)];
    }
    return cands;
  }

  App.games.register('cyberpunk', {
    id: 'cyberpunk',
    name: 'Cyberpunk TCG',
    listSets, getSet, getCard, search, versions, byCode, setIdsByName, price, tpMarket, img, recognize, manual, codesIn, names, // (pas de foil() : une seule version par carte)
    visualIndex: { index: 'data/cp-index', v: CP_INDEX_V },
    visualCheck: (blob) => (useVisual() ? visualPass(blob, [], []) : Promise.resolve(null)),
    langFor: () => 'fr',
    printedCode: (c) => c.code || '',
    // (pas de page Cyberpunk sur Cardmarket : le lien mène au produit TCGplayer, d'où vient le prix)
    refLink: { label: 'Voir sur TCGplayer', url: tcgLink },
    cardmarketUrl: tcgLink,
    boosterLabel: 'Prix des boosters et decks sur TCGplayer',
    boosterUrl: (set) => tcgSearch(`${(set.en || set.name).replace(/\s*-\s*Retail.*$/i, '')} booster`),
    isOfficial: (localId, set) => isOfficialIn(localId, MAX[set && set.id]),
    numLabel: (card) => card.localId,
    logoText: (s) => (memo && (memo.sets.find((x) => x.id === s.id) || {}).code) || s.id.toUpperCase(), // (« NCB01 - WNC »)
    extraLabel: 'versions iconiques',
    priceNote: 'Prix : marché américain TCGplayer (cartes anglaises), converti en euros, mise à jour quotidienne.',
    rarity,
    pullRates: () => null,
    source: { name: 'Base officielle des cartes (cyberpunktcg.com)', url: 'https://cyberpunktcg.com/cards' },
  });
})();
