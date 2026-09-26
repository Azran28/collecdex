/*
 * Adaptateur Pokémon — données fournies par TCGdex (https://tcgdex.dev), gratuit et sans clé.
 * Les réponses sont mises en cache localement pour que le site reste rapide.
 */
(() => {
  const API = 'https://api.tcgdex.net/v2';
  const DAY = 24 * 3600 * 1000;
  const lang = () => (App.settings && App.settings.lang) || 'fr';
  // Langue choisie pour une série en particulier (sinon la langue générale des Paramètres)
  const setOfCard = (cardId) => String(cardId).slice(0, String(cardId).lastIndexOf('-'));
  const langFor = (setId) => ((App.settings && App.settings.setLangs) || {})[setId] || lang();
  const LANGS = { fr: 'Français', en: 'Anglais', de: 'Allemand', it: 'Italien', es: 'Espagnol' };
  /** Langues proposées sur la page d'une série : français, anglais (+ la langue générale si autre) */
  const setLanguages = () => [...new Set(['fr', 'en', lang()])].map((id) => ({ id, name: LANGS[id] || id }));
  function setLangFor(setId, l) {
    const m = { ...(App.settings.setLangs || {}) };
    if (!l || l === lang()) delete m[setId]; else m[setId] = l;
    App.settings.setLangs = m;
    return App.col.saveSettings();
  }

  // ---------- Réseau + cache ----------
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

  /** TCGdex refuse parfois une requête au hasard (en-tête CORS en double) : on réessaie un peu plus tard */
  async function retryFetch(url, opts, tries = 3) {
    let err;
    for (let i = 0; i < tries; i++) {
      try { const r = await fetch(url, opts); if (r.ok || r.status === 404 || i === tries - 1) return r; err = new Error('HTTP ' + r.status); }
      catch (e) { err = e; }
      await new Promise((res) => setTimeout(res, 250 * (i + 1)));
    }
    throw err;
  }

  async function getJSON(path) {
    const r = await retryFetch(API + path);
    if (!r.ok) throw new Error(`TCGdex a répondu ${r.status} pour ${path}`);
    return r.json();
  }

  async function gql(query) {
    const r = await retryFetch(API + '/graphql', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
    if (!r.ok) throw new Error('GraphQL ' + r.status);
    const j = await r.json();
    if (j.errors && !j.data) throw new Error(j.errors[0].message);
    return j.data;
  }

  // ---------- Images ----------
  const img = {
    card: (c, q = 'low') => {
      const sid = c && (c.setId || (c.id ? setOfCard(c.id) : ''));
      // langue voulue : celle de TA carte si on la connaît (c.lang), sinon celle choisie pour la série
      const want = (c && c.lang) || (sid && ((App.settings && App.settings.setLangs) || {})[sid]);
      if (c && c.image) return `${want ? c.image.replace(/(assets\.tcgdex\.net\/)[a-z-]+\//, `$1${want}/`) : c.image}/${q}.webp`;
      // pas d'image dans cette langue : on tente l'image anglaise
      if (c && c.id && c.setId) {
        const serie = c.serieId || '';
        if (serie) return `https://assets.tcgdex.net/en/${serie}/${c.setId}/${c.localId}/${q}.webp`;
      }
      return '';
    },
    logo: (s) => (s && s.logo ? `${s.logo}.png` : ''),
    symbol: (s) => (s && s.symbol ? `${s.symbol}.png` : ''),
  };

  // ---------- Séries ----------
  const HIDDEN_GROUPS = ['tcgp']; // Pokémon TCG Pocket (jeu mobile, pas de cartes physiques)

  async function listSets() {
    const L = lang();
    return cached(`pk2:${L}:sets`, 3 * DAY, async () => {
      let sets;
      try {
        const d = await gql(`{ sets @locale(lang: "${L}") { id name logo symbol releaseDate cardCount { total official } serie { id name logo } } }`);
        sets = d.sets;
      } catch (e) {
        // Plan B : API REST (plus de requêtes)
        console.warn('GraphQL indisponible, passage en REST', e);
        const series = await getJSON(`/${L}/series`);
        sets = [];
        await App.util.pool(series, 4, async (s) => {
          const full = await getJSON(`/${L}/series/${encodeURIComponent(s.id)}`);
          for (const st of full.sets || []) sets.push({ ...st, serie: { id: s.id, name: s.name, logo: s.logo }, releaseDate: full.releaseDate });
        });
      }
      // Logos manquants (surtout en français) : 1) logo anglais, 2) logo de la série principale
      // (ex. « Galerie de Dresseurs » → série mère), sinon l'interface dessine un logo.
      const logos = {}, symbols = {};
      try {
        if (L !== 'en') {
          const d = await gql('{ sets @locale(lang: "en") { id logo symbol } }');
          for (const x of d.sets || []) { if (x && x.logo) logos[x.id] = x.logo; if (x && x.symbol) symbols[x.id] = x.symbol; }
        }
      } catch (e) { /* pas grave */ }
      for (const x of sets) if (x && x.logo) logos[x.id] = logos[x.id] || x.logo;
      const parentOf = (id) => {
        const m = id.match(/^(.+?)(tg|gg|sv|cc|a)$/); // swsh9tg, swsh12.5gg, swsh4.5sv, cel25cc, sma…
        if (m && logos[m[1]]) return m[1];
        if (id === 'sma' && logos['sm115']) return 'sm115';
        return null;
      };
      return sets.filter(Boolean).map((s) => ({
        id: s.id,
        name: s.name,
        logo: s.logo || logos[s.id] || (parentOf(s.id) ? logos[parentOf(s.id)] : '') || '',
        symbol: s.symbol || symbols[s.id] || '',
        releaseDate: s.releaseDate || '',
        total: s.cardCount ? s.cardCount.total : 0,
        official: s.cardCount ? s.cardCount.official : 0,
        group: s.serie ? { id: s.serie.id, name: s.serie.name, logo: s.serie.logo || '' } : { id: 'autre', name: 'Autres' },
      }));
    }).then((sets) => sets.filter((s) => App.settings.showPocket || !HIDDEN_GROUPS.includes(s.group.id)));
  }

  function normCard(c, set) {
    return {
      id: c.id,
      localId: c.localId,
      name: c.name,
      image: c.image || '',
      rarity: c.rarity || '',
      category: c.category || '',
      types: c.types || [],
      illustrator: c.illustrator || '',
      hp: c.hp ? parseInt(c.hp, 10) || null : null,
      variants: c.variants || null,
      setId: set.id,
      serieId: set.group ? set.group.id : '',
    };
  }

  const CARD_FIELDS = 'id localId name image rarity category types illustrator hp variants { normal reverse holo firstEdition }';

  async function getSet(id) {
    const L = langFor(id);
    return cached(`pk4:${L}:set:${id}`, 7 * DAY, async () => {
      let meta = null, cards = null;
      // 1) infos de la série
      try {
        const d = await gql(`{ set(filters: { id: "eq:${id}" }) @locale(lang: "${L}") { id name logo symbol releaseDate cardCount { total official normal reverse holo } serie { id name logo } } }`);
        meta = d.set;
      } catch (e) { console.warn(e); }
      // 2) toutes ses cartes, complètes (avec la rareté) : leur identifiant commence par "<série>-"
      try {
        const d = await gql(`{ cards(filters: { id: "${id}-" }) @locale(lang: "${L}") { ${CARD_FIELDS} } }`);
        cards = (d.cards || []).filter((c) => c && c.id.startsWith(id + '-'));
      } catch (e) { console.warn(e); }
      // 3) plan B : l'API classique (cartes sans rareté, complétées ensuite)
      if (!meta || !cards || !cards.length) {
        const r = await getJSON(`/${L}/sets/${encodeURIComponent(id)}`);
        if (!meta) meta = r;
        if (!cards || !cards.length) cards = (r.cards || []).filter(Boolean);
      }
      const cc = meta.cardCount || { total: cards.length, official: cards.length };
      if (!meta.logo || !meta.symbol) {
        const known = (await listSets().catch(() => [])).find((x) => x.id === id);
        if (known) meta = { ...meta, logo: meta.logo || known.logo, symbol: meta.symbol || known.symbol };
      }
      const set = {
        id: meta.id, name: meta.name, logo: meta.logo || '', symbol: meta.symbol || '', releaseDate: meta.releaseDate || '',
        total: Math.max(cc.total || 0, cards.length), official: cc.official, cardCount: cc,
        group: meta.serie ? { id: meta.serie.id, name: meta.serie.name, logo: meta.serie.logo || '' } : { id: 'autre', name: 'Autres' },
      };
      set.cards = cards.map((c) => normCard(c, set)).sort((a, b) => App.util.numSort(a.localId, b.localId));
      set.rarityInfoMissing = set.cards.some((c) => !c.rarity);
      return set;
    });
  }

  /** Détail complet d'une carte (avec prix du jour) */
  async function getCard(id, { fresh = false } = {}) {
    const L = langFor(setOfCard(id));
    return cached(`pk:${L}:card:${id}`, fresh ? 0 : DAY, async () => {
      const c = await getJSON(`/${L}/cards/${encodeURIComponent(id)}`);
      return c;
    });
  }

  /** Infos de série au format attendu par le scanner */
  const setShape = (s) => ({ id: s.id, name: s.name, logo: s.logo, symbol: s.symbol, releaseDate: s.releaseDate, cardCount: { total: s.total, official: s.official }, serie: s.group });

  /**
   * Scanner : retrouve les cartes portant le numéro n dans les séries de `of` cartes numérotées
   * (ex. 25/165 → séries de 165 cartes → carte n° 25).
   */
  async function findByNumber(n, of) {
    const sets = await listSets();
    let cand = sets.filter((s) => s.official === of); // listSets n'inclut que les séries affichées
    if (!cand.length) cand = sets.filter((s) => s.total === of);
    cand = cand.sort((a, b) => (b.releaseDate || '').localeCompare(a.releaseDate || '')).slice(0, 8);
    const out = [];
    await App.util.pool(cand, 4, async (s) => {
      const full = await getSet(s.id);
      for (const c of full.cards) if (parseInt(c.localId, 10) === n) out.push({ ...c, set: setShape(s) });
    });
    return out;
  }

  /** Scanner / recherche : cartes dont le nom contient `name` */
  async function search({ name }) {
    const L = lang();
    if (!name) return [];
    const sets = await listSets().catch(() => []);
    const byId = Object.fromEntries(sets.map((s) => [s.id, s]));
    const toSet = (setId) => (byId[setId] ? setShape(byId[setId]) : null);
    const setIdOf = (cardId) => cardId.slice(0, cardId.lastIndexOf('-'));
    try {
      const d = await gql(`{ cards(filters: { name: "${String(name).replace(/["\\]/g, '')}" }, pagination: { page: 1, itemsPerPage: 200 }) @locale(lang: "${L}") { ${CARD_FIELDS} } }`);
      // on ne garde que les séries affichées sur le site (TCG Pocket exclu par défaut)
      return (d.cards || []).filter((c) => c && byId[setIdOf(c.id)]).map((c) => { const st = toSet(setIdOf(c.id)); return { ...normCard(c, { id: setIdOf(c.id), group: st.serie }), set: st }; });
    } catch (e) {
      const res = await getJSON(`/${L}/cards?name=${encodeURIComponent(name)}`);
      return res.filter((c) => byId[setIdOf(c.id)]).slice(0, 80).map((c) => { const st = toSet(setIdOf(c.id)); return { ...normCard(c, { id: setIdOf(c.id), group: st.serie }), set: st }; });
    }
  }

  /** Toutes les éditions d'une carte (même nom exact), des plus anciennes aux plus récentes */
  async function versions(name) {
    const n = App.util.norm(name);
    const res = await search({ name });
    return res.filter((c) => App.util.norm(c.name) === n)
      .sort((a, b) => ((a.set && a.set.releaseDate) || '').localeCompare((b.set && b.set.releaseDate) || ''));
  }

  /**
   * Extrait un prix lisible d'une carte détaillée.
   * Priorité : Cardmarket (€, tendance) ; sinon TCGplayer ($, prix marché).
   */
  function price(card, variant) {
    const p = card && card.pricing;
    if (!p) return null;
    const cm = p.cardmarket;
    if (cm) {
      const holo = variant === 'reverse';
      const ok = (x) => (typeof x === 'number' && x > 0 ? x : null);
      const v = holo ? (ok(cm['trend-holo']) ?? ok(cm['avg-holo']) ?? ok(cm.trend) ?? ok(cm.avg)) : (ok(cm.trend) ?? ok(cm.avg) ?? ok(cm['trend-holo']));
      if (v != null) return { value: v, unit: 'EUR', source: 'Cardmarket', updated: cm.updated, raw: cm };
    }
    const tp = p.tcgplayer;
    if (tp) {
      const order = variant === 'reverse' ? ['reverse-holofoil', 'reverse', 'holofoil', 'holo', 'normal'] : ['holofoil', 'holo', 'normal', 'reverse-holofoil', 'reverse'];
      for (const k of order) if (tp[k] && tp[k].marketPrice > 0) return { value: tp[k].marketPrice, unit: 'USD', source: 'TCGplayer', updated: tp.updated, raw: tp };
    }
    return null;
  }

  function cardmarketUrl(card, setName) {
    const q = encodeURIComponent(`${card.name} ${setName || ''}`.trim());
    return `https://www.cardmarket.com/fr/Pokemon/Products/Search?searchString=${q}`;
  }

  App.games.register('pokemon', {
    id: 'pokemon',
    name: 'Pokémon',
    listSets, getSet, getCard, langFor, setLanguages, setLangFor, search, versions, findByNumber, price, img, cardmarketUrl,
    rarity: App.pokemonRarity,
    pullRates: (setId) => App.pokemonPullRates[setId] || null,
    source: { name: 'TCGdex', url: 'https://tcgdex.dev' },
  });
})();
