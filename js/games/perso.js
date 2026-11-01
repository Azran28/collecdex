/*
 * Collections perso (v4.02) : tout ce qui n'est pas dans les 10 licences de base (Digimon, cartes de supermarché…).
 * Pas de base de cartes : une série ne contient QUE les cartes de la personne, ajoutées par photo (#/perso/ajouter).
 * Pas de combats, de badges, de prix ni de certification. Une série est « complète » seulement si son total est connu.
 *
 * Carte possédée = item de App.col (jeu 'perso') :
 *   id      « <licence>--<série>--<numéro ou nom> » (petits mots sans accents)
 *   setId   « <licence>--<série> »
 *   snap    name, localId (numéro imprimé), image (visuel officiel trouvé, sinon ''), rarity (texte libre), setName, serieId (= id de la licence)
 *   perso   { lic (nom de la licence), total (nombre de cartes de la série, 0 = inconnu), text, code }
 */
(() => {
  const { esc, norm } = App.util;
  const GAME = 'perso';

  const slug = (s) => norm(String(s || '')).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'x';
  const setIdOf = (lic, set) => `${slug(lic)}--${slug(set)}`;
  const cardIdOf = (lic, set, num, name) => `${setIdOf(lic, set)}--${slug(num || name)}`;

  const mine = () => App.col.all().filter((it) => it.game === GAME && it.qty > 0);
  const licOf = (it) => (it.perso && it.perso.lic) || it.snap.serieId || 'Perso';

  // ---------- Raretés : texte libre, rang deviné par les mots ----------
  const RANKS = [[/secr|gold|or\b|ultime|legend|l[ée]gend/i, 8], [/ultra|super|holo|brill|foil|prism/i, 5], [/rare/i, 3], [/peu|uncommon|inhab/i, 2], [/commun|common/i, 1]];
  const rank = (r) => { if (!r) return 0; const m = RANKS.find(([re]) => re.test(r)); return m ? m[1] : 3; };
  const COLORS = { 0: '#b9c0d4', 1: '#9aa3b5', 2: '#5fb86a', 3: '#5aa0e0', 5: '#9b6ef0', 8: '#e8b923' };
  const rarity = {
    key: (r) => (r ? String(r) : null),
    rank,
    label: (r) => r || 'Sans rareté',
    symbol: (r) => (r ? `<span class="rar" title="${esc(r)}"><span class="rar-txt" style="background:${COLORS[rank(r)]}">${esc(String(r).slice(0, 8))}</span></span>` : ''),
    css: (r) => COLORS[rank(r)],
  };

  // dos de carte dessiné quand la carte n'a ni visuel officiel ni photo
  const blank = (name) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 63 88"><rect width="63" height="88" rx="4" fill="#1b2140"/><rect x="3" y="3" width="57" height="82" rx="3" fill="none" stroke="#7c5cff" stroke-width="1.2"/><text x="31.5" y="46" font-family="sans-serif" font-size="5" fill="#c9cdef" text-anchor="middle">${String(name || '').replace(/[<&>"]/g, '').slice(0, 22)}</text></svg>`);
  const img = {
    card: (c) => (c && c.image) || blank(c && c.name),
    logo: () => '',
    symbol: () => '',
  };

  // ---------- Séries (tirées des cartes possédées) ----------
  const GROUP_ORDER = (name) => name.toLowerCase();
  function setsFrom(items) {
    const by = new Map();
    for (const it of items) {
      const s = by.get(it.setId) || { id: it.setId, name: it.snap.setName || 'Sans série', lic: licOf(it), total: 0, last: 0, items: [] };
      s.items.push(it);
      s.total = Math.max(s.total, (it.perso && it.perso.total) || 0);
      s.last = Math.max(s.last, it.addedAt || 0);
      by.set(it.setId, s);
    }
    return [...by.values()].map((s) => ({
      id: s.id, name: s.name, logo: '', symbol: '', releaseDate: '', sortKey: new Date(s.last || 0).toISOString(),
      total: s.total, official: s.total, known: s.total > 0,
      group: { id: slug(s.lic), name: s.lic, order: GROUP_ORDER(s.lic) },
      cardCount: { total: s.total, official: s.total },
    }));
  }
  const listSets = async () => setsFrom(mine());

  function normCard(it) {
    const p = it.perso || {};
    return {
      id: it.id, localId: it.snap.localId || '', name: it.snap.name, image: it.snap.image || '', rarity: it.snap.rarity || '',
      variants: { normal: true }, setId: it.setId, setName: it.snap.setName, serieId: it.snap.serieId,
      text: p.text || '', code: p.code || '', facts: [p.lic ? `Licence : ${p.lic}` : '', it.snap.localId ? `Numéro ${it.snap.localId}` : ''].filter(Boolean),
      perso: true,
    };
  }
  async function getSet(id) {
    const items = mine().filter((it) => it.setId === id);
    const s = setsFrom(items)[0];
    if (!s) throw new Error('Tu n’as plus de carte dans cette série.');
    return { ...s, cards: items.map(normCard).sort((a, b) => App.util.numSort(a.localId, b.localId) || a.name.localeCompare(b.name, 'fr')) };
  }
  async function getCard(id) {
    const it = App.col.get(GAME, id);
    if (!it) throw new Error('Carte inconnue : ' + id);
    const s = setsFrom([it])[0];
    return { ...normCard(it), set: s, pricing: null };
  }
  /** Nombre de cartes de la série (0 = inconnu) : gardé sur chacune de ses cartes */
  async function setTotal(setId, total) {
    const n = Math.max(0, Math.min(5000, Math.floor(+total || 0)));
    for (const it of mine().filter((x) => x.setId === setId)) await App.col.update(it.key, { perso: { ...(it.perso || {}), total: n } });
  }

  /** Licences et séries déjà utilisées (pour proposer les mêmes noms à l'ajout) */
  function known() {
    const lics = new Map();
    for (const it of mine()) {
      const l = licOf(it);
      if (!lics.has(l)) lics.set(l, new Set());
      lics.get(l).add(it.snap.setName || '');
    }
    return lics;
  }

  // ---------- Digimon Card Game (2020…) : la carte retrouvée par son code « BT1-010 » ----------
  // digimoncard.io (CORS *, ~15 demandes rapprochées) ; les anciennes cartes de 1999 (« Bo-113 », « Jd-53 ») n'y sont pas
  const DG_CODE = /^\s*((?:BT|EX|ST|RB|LM|AD|BO|P)\d*-\d{2,3})\s*$/i;
  async function lookup(lic, code) {
    if (!/digimon/i.test(lic || '') || !DG_CODE.test(code || '')) return null;
    const id = code.trim().toUpperCase();
    const r = await fetch(`https://digimoncard.io/api-public/search?card=${encodeURIComponent(id)}`).catch(() => null);
    if (!r || !r.ok) return null;
    const list = await r.json().catch(() => null);
    const c = Array.isArray(list) && list.find((x) => String(x.id).toUpperCase() === id);
    if (!c) return null;
    const RAR = { c: 'Commune', u: 'Peu commune', r: 'Rare', sr: 'Super rare', sec: 'Secrète', p: 'Promo' };
    // la carte est dans toutes ses réimpressions : la série d'origine est celle du code (« BT1-010 » → « BT-01: Booster New Evolution »)
    const names = (Array.isArray(c.set_name) ? c.set_name : [c.set_name]).filter(Boolean).map(String);
    const [, pre, n] = id.match(/^([A-Z]+)(\d*)-/) || [];
    const home = names.find((s) => new RegExp(`^${pre}-?0*${n || ''}\\s*:`, 'i').test(s)) || names[0] || '';
    return {
      name: String(c.name || ''), rarity: RAR[String(c.rarity || '').toLowerCase()] || String(c.rarity || '').toUpperCase(),
      setName: home,
      image: `https://images.digimoncard.io/images/cards/${encodeURIComponent(id)}.jpg`,
      text: [c.main_effect, c.source_effect].filter(Boolean).map(String).join('\n'),
    };
  }

  App.games.register(GAME, {
    id: GAME,
    name: 'Collections perso',
    ownOnly: true,      // la série ne montre que tes cartes (pas les manquantes)
    photoFirst: true,   // ta photo est toujours le visuel
    noPrices: true,
    listSets, getSet, getCard, setTotal, known, lookup, setIdOf, cardIdOf, img, rarity,
    price: () => null,
    pullRates: () => null,
    langFor: () => 'fr',
    isOfficial: () => true,
    numLabel: (card) => card.localId,
    logoText: (s) => s.group.name,
    priceNote: 'Pas de cote pour les collections perso.',
    source: { name: 'tes photos', url: '#/perso/ajouter' },
  });
})();
