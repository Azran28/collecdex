/* Ta collection : cartes possédées, photos perso, réglages. Enregistrée sur l'appareil, et copiée dans ton compte en ligne si tu es connecté (voir cloud.js). */
App.settings = { lang: 'fr', completion: 'total', preferPhotos: true, showPocket: false, missingStyle: 'grise' };

App.col = (() => {
  let items = {};           // clé "jeu:id" → entrée
  const listeners = new Set();
  const photoURLs = {};     // cache des URL d'affichage des photos

  const keyOf = (game, id) => `${game}:${id}`;
  const emit = (key) => listeners.forEach((fn) => { try { fn(key); } catch (e) { console.error(e); } });

  async function load() {
    const s = await App.db.get('kv', 'settings').catch(() => null);
    if (s) Object.assign(App.settings, s);
    items = await App.db.all('items');
  }
  const cloud = () => App.cloud || { markItem() {}, markDelete() {}, markPhoto() {}, markPhotoDelete() {}, markProfile() {}, fetchPhoto: async () => null };
  const saveSettings = async () => { App.settings.updatedAt = Date.now(); await App.db.set('kv', 'settings', { ...App.settings }); cloud().markProfile(); };

  const get = (game, id) => items[keyOf(game, id)] || null;
  const byKey = (k) => items[k] || null;
  const all = () => Object.values(items);
  const owned = (game, id) => { const it = get(game, id); return !!(it && it.qty > 0); };
  const inSet = (game, setId) => all().filter((it) => it.game === game && it.setId === setId && it.qty > 0);

  async function put(it) { it.updatedAt = Date.now(); items[it.key] = it; await App.db.set('items', it.key, it); cloud().markItem(it.key); emit(it.key); return it; }

  /** Ajoute une carte (ou +1 exemplaire si déjà possédée) */
  async function add(game, card, set, opts = {}) {
    const k = keyOf(game, card.id);
    const cur = items[k];
    const variant = opts.variant || null;
    if (cur) {
      cur.qty = (cur.qty || 0) + (opts.qty || 1);
      if (variant && !cur.variants.includes(variant)) cur.variants.push(variant);
      return put(cur);
    }
    const it = {
      key: k, game, id: card.id, setId: card.setId || (set && set.id), qty: opts.qty || 1,
      variants: variant ? [variant] : [], favorite: false, rating: 0, note: '', photos: [], displayPhoto: null,
      addedAt: Date.now(),
      snap: {
        name: card.name, localId: card.localId, image: card.image || '', rarity: card.rarity || '',
        setName: set ? set.name : (card.setName || ''), setSymbol: set ? set.symbol : '', serieId: card.serieId || (set && set.group ? set.group.id : ''),
        official: set ? set.official : null,
      },
      price: null,
    };
    return put(it);
  }

  async function update(k, patch) { const it = items[k]; if (!it) return null; Object.assign(it, patch); return put(it); }

  async function setQty(k, qty) {
    const it = items[k]; if (!it) return;
    if (qty <= 0) return remove(k);
    it.qty = qty; return put(it);
  }

  async function remove(k) {
    const it = items[k]; if (!it) return;
    for (const p of it.photos || []) await App.db.del('photos', p).catch(() => {});
    delete items[k]; await App.db.del('items', k); cloud().markDelete(k, it.photos || []); emit(k);
  }

  // ---------- Photos perso ----------
  async function addPhoto(k, fileOrBlob, { makeDisplay = true } = {}) {
    const it = items[k]; if (!it) throw new Error('Carte non possédée');
    const blob = await App.util.resizeImage(fileOrBlob, 800, 0.82); // ~80 Ko : assez net, et léger pour le stockage en ligne
    const id = 'ph_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    await App.db.set('photos', id, blob);
    cloud().markPhoto(id);
    it.photos.push(id);
    if (makeDisplay) it.displayPhoto = id;
    await put(it);
    return id;
  }
  async function deletePhoto(k, id) {
    const it = items[k]; if (!it) return;
    it.photos = it.photos.filter((p) => p !== id);
    if (it.displayPhoto === id) it.displayPhoto = null;
    await App.db.del('photos', id);
    cloud().markPhotoDelete(id);
    if (photoURLs[id]) { URL.revokeObjectURL(photoURLs[id]); delete photoURLs[id]; }
    await put(it);
  }
  /** Remplace le contenu d'une photo (ex. après recadrage), en gardant sa place dans la carte */
  async function replacePhoto(k, id, blob) {
    const it = items[k]; if (!it) return;
    const small = await App.util.resizeImage(blob, 800, 0.85);
    await App.db.set('photos', id, small);
    if (photoURLs[id]) { URL.revokeObjectURL(photoURLs[id]); delete photoURLs[id]; }
    cloud().markPhoto(id);
    // numéro de version : les autres appareils sauront que leur copie de cette photo est périmée
    it.photoRev = Object.assign({}, it.photoRev, { [id]: Date.now() });
    await put(it);
  }
  /** D'où vient une photo (page de classeur + zone), pour pouvoir la recadrer plus tard */
  async function setPhotoSource(k, id, src) {
    const it = items[k]; if (!it || !src || !src.page) return;
    it.photoSrc = Object.assign({}, it.photoSrc, { [id]: src });
    await put(it);
  }
  /** Garde la photo d'une page de classeur sur CET appareil (pas envoyée en ligne) ; les 30 dernières */
  async function keepPage(blob) {
    const id = 'page_' + Date.now().toString(36);
    const small = await App.util.resizeImage(blob, 2400, 0.88);
    await App.db.set('photos', id, small);
    const list = ((await App.db.get('kv', 'pages').catch(() => null)) || []).concat(id);
    while (list.length > 30) await App.db.del('photos', list.shift()).catch(() => {});
    await App.db.set('kv', 'pages', list);
    return id;
  }
  const getPage = (id) => (id ? App.db.get('photos', id).catch(() => null) : null);
  async function photoURL(id) {
    if (!id) return '';
    if (photoURLs[id]) return photoURLs[id];
    let b = await App.db.get('photos', id);
    if (!b) b = await cloud().fetchPhoto(id).catch(() => null); // photo prise sur un autre appareil
    if (!b) return '';
    photoURLs[id] = URL.createObjectURL(b);
    return photoURLs[id];
  }
  /** Image à afficher pour une entrée : ta photo si choisie, sinon l'image officielle */
  async function displayImage(it, adapter, q = 'low') {
    if (it && it.displayPhoto && App.settings.preferPhotos) {
      const u = await photoURL(it.displayPhoto);
      if (u) return { src: u, mine: true };
    }
    return { src: adapter.img.card({ image: it.snap.image, id: it.id, setId: it.setId, localId: it.snap.localId, serieId: it.snap.serieId }, q), mine: false };
  }

  // ---------- Prix ----------
  async function refreshPrices(keys, label = 'Mise à jour des prix') {
    const list = keys.map((k) => items[k]).filter(Boolean);
    if (!list.length) return;
    const task = App.bg.start(label, list.length);
    await App.util.pool(list, 4, async (it) => {
      const ad = App.games.get(it.game);
      const card = await ad.getCard(it.id);
      const p = ad.price(card, it.variants[0]);
      it.price = p ? { value: p.value, unit: p.unit, source: p.source, updated: p.updated, t: Date.now() } : { value: null, t: Date.now() };
      if (card.rarity && !it.snap.rarity) it.snap.rarity = card.rarity;
      if (card.illustrator) it.snap.illustrator = card.illustrator;
      if (card.variants) it.snap.holo = !!(card.variants.holo && !card.variants.normal);
      items[it.key] = it; await App.db.set('items', it.key, it);
    }, (d) => task.tick(d));
    task.done();
    emit('*');
  }
  /** Met à jour en arrière-plan les prix de plus de 24 h */
  function refreshStalePrices() {
    const stale = all().filter((it) => !it.price || Date.now() - (it.price.t || 0) > 24 * 3600 * 1000).map((it) => it.key);
    if (stale.length) refreshPrices(stale, 'Prix de ta collection');
  }

  // ---------- État de la carte et valeur estimée ----------
  // Échelle Cardmarket. Le prix « tendance » de Cardmarket correspond à peu près à une carte Near Mint.
  const CONDITIONS = [
    ['MT', 'Mint', 'Parfaite, comme sortie du booster', 1.15],
    ['NM', 'Near Mint', 'Quasi parfaite, micro-défauts à peine visibles', 1],
    ['EX', 'Excellent', 'Légère usure : bords ou coins un peu blanchis', 0.8],
    ['GD', 'Good', 'Usure visible, petites marques', 0.6],
    ['LP', 'Light Played', 'Rayures ou petits plis', 0.45],
    ['PL', 'Played', 'Bien usée, plis marqués', 0.3],
    ['PO', 'Poor', 'Très abîmée', 0.15],
  ];
  const GRADERS = ['PSA', 'CGC', 'BGS', 'PCA'];
  /** Multiplicateur d'une carte gradée (très approximatif : le bonus d'une note varie beaucoup d'une carte à l'autre) */
  const gradeMult = (g) => (g >= 10 ? 4 : g >= 9.5 ? 2.8 : g >= 9 ? 2 : g >= 8.5 ? 1.6 : g >= 8 ? 1.35 : g >= 7 ? 1.15 : g >= 6 ? 1 : g >= 5 ? 0.85 : 0.7);
  function condMult(c) {
    if (!c) return 1;
    if (c.kind === 'graded') return gradeMult(+c.grade || 0);
    const row = CONDITIONS.find((r) => r[0] === c.grade);
    return row ? row[3] : 1;
  }
  const condLabel = (c) => (!c ? '' : c.kind === 'graded' ? `${c.company} ${String(c.grade).replace('.', ',')}` : c.grade);
  /** Pour trier du meilleur état au pire (inconnu = en dernier) */
  const condRank = (c) => (!c ? -1 : c.kind === 'graded' ? 100 + (+c.grade || 0) : CONDITIONS.length - CONDITIONS.findIndex((r) => r[0] === c.grade));
  /** Valeur estimée d'UN exemplaire, en euros : ta valeur si tu l'as saisie, sinon prix du marché × état */
  function valueOf(it) {
    if (!it) return 0;
    if (it.valueOverride > 0) return it.valueOverride;
    if (!it.price || !it.price.value || it.price.unit !== 'EUR') return 0;
    return Math.round(it.price.value * condMult(it.cond) * 100) / 100;
  }
  /** Valeur totale (tous les exemplaires) */
  const totalValue = (list) => list.reduce((s, i) => s + valueOf(i) * (i.qty || 0), 0);

  // ---------- Progression ----------
  /**
   * Calcule la progression d'une série.
   * set = { id, total, official, cards? }. Si les cartes sont connues, on calcule aussi par rareté.
   */
  function progress(game, set) {
    const mode = App.settings.completion;
    const ownedItems = inSet(game, set.id);
    const isOfficial = (localId) => { const n = parseInt(localId, 10); return !isNaN(n) && String(n) === String(localId).replace(/^0+(?=\d)/, '') && n <= set.official; };
    let total, have, byRarity = null;
    if (set.cards && set.cards.length) {
      const cards = mode === 'official' ? set.cards.filter((c) => isOfficial(c.localId)) : set.cards;
      const ownedIds = new Set(ownedItems.map((i) => i.id));
      total = cards.length;
      have = cards.filter((c) => ownedIds.has(c.id)).length;
      byRarity = {};
      for (const c of cards) {
        const r = c.rarity || 'None';
        byRarity[r] = byRarity[r] || { rarity: r, total: 0, have: 0 };
        byRarity[r].total++;
        if (ownedIds.has(c.id)) byRarity[r].have++;
      }
      byRarity = Object.values(byRarity).sort((a, b) => App.games.get(game).rarity.rank(a.rarity) - App.games.get(game).rarity.rank(b.rarity));
    } else {
      total = mode === 'official' ? set.official : set.total;
      have = mode === 'official' ? ownedItems.filter((i) => isOfficial(i.snap.localId)).length : ownedItems.length;
    }
    total = total || 0;
    return { have, total, missing: Math.max(0, total - have), pct: App.util.pct(have, total), complete: total > 0 && have >= total, byRarity };
  }

  // ---------- Profil ----------
  const defaultProfile = { pseudo: 'Dresseur', bio: '', avatar: null, theme: 'nuit', frame: 'or', layout: 'vedette', featured: [], frames: {}, showStats: true, showBadges: true, showTop: true };
  async function getProfile() { return Object.assign({}, defaultProfile, (await App.db.get('kv', 'profile').catch(() => null)) || {}); }
  const saveProfile = async (p) => { p.updatedAt = Date.now(); await App.db.set('kv', 'profile', p); cloud().markProfile(); };

  // ---------- Appliquer ce qui vient du compte en ligne (sans le renvoyer) ----------
  async function applyRemote(it) {
    // photo recadrée sur un autre appareil : on jette la copie locale, elle sera retéléchargée
    const old = items[it.key];
    for (const [id, rev] of Object.entries(it.photoRev || {})) {
      if (!old || !old.photoRev || old.photoRev[id] !== rev) {
        await App.db.del('photos', id).catch(() => {});
        if (photoURLs[id]) { URL.revokeObjectURL(photoURLs[id]); delete photoURLs[id]; }
      }
    }
    items[it.key] = it; await App.db.set('items', it.key, it);
  }
  async function applyRemoteDelete(k) {
    const it = items[k]; if (!it) return;
    for (const p of it.photos || []) await App.db.del('photos', p).catch(() => {});
    delete items[k]; await App.db.del('items', k);
  }
  async function applyRemoteProfile(profile, settings) {
    if (profile) await App.db.set('kv', 'profile', profile);
    if (settings) { Object.assign(App.settings, settings); await App.db.set('kv', 'settings', { ...App.settings }); }
  }
  async function wipeLocal() {
    await App.db.clear('items'); await App.db.clear('photos'); await App.db.del('kv', 'profile');
    items = {};
  }
  const notify = () => emit('*');

  // ---------- Sauvegarde / restauration ----------
  async function exportAll() {
    const photos = await App.db.all('photos');
    const ph = {};
    for (const [id, b] of Object.entries(photos)) if (!id.startsWith('page_')) ph[id] = await App.util.blobToDataURL(b);
    return { app: 'CollecDex', version: 1, date: new Date().toISOString(), settings: App.settings, profile: await getProfile(), items: all(), photos: ph };
  }
  async function importAll(data, { merge = false } = {}) {
    if (!data || data.app !== 'CollecDex') throw new Error('Ce fichier n’est pas une sauvegarde CollecDex.');
    if (!merge) { await App.db.clear('items'); await App.db.clear('photos'); items = {}; }
    for (const [id, d] of Object.entries(data.photos || {})) await App.db.set('photos', id, await App.util.dataURLToBlob(d));
    for (const it of data.items || []) { items[it.key] = it; await App.db.set('items', it.key, it); }
    if (data.profile) await saveProfile(data.profile);
    if (data.settings) { Object.assign(App.settings, data.settings); await saveSettings(); }
    for (const it of data.items || []) { cloud().markItem(it.key); (it.photos || []).forEach((id) => cloud().markPhoto(id)); }
    if (data.profile && data.profile.avatar) cloud().markPhoto(data.profile.avatar);
    emit('*');
  }

  return {
    load, saveSettings, keyOf, get, byKey, all, owned, inSet, add, update, setQty, remove,
    CONDITIONS, GRADERS, condMult, condLabel, condRank, valueOf, totalValue,
    addPhoto, deletePhoto, replacePhoto, setPhotoSource, keepPage, getPage, photoURL, displayImage, refreshPrices, refreshStalePrices, progress,
    getProfile, saveProfile, exportAll, importAll, applyRemote, applyRemoteDelete, applyRemoteProfile, wipeLocal, notify,
    on: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
  };
})();

/* Petites barres de progression en bas à droite pour les tâches de fond */
App.bg = (() => {
  const tasks = new Map();
  let n = 0;
  const render = () => {
    const el = document.getElementById('bgtasks');
    if (!tasks.size) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = [...tasks.values()].map((t) => `<div>${App.util.esc(t.label)} — ${t.done}/${t.total}<div class="progress"><span style="width:${App.util.pct(t.done, t.total)}%"></span></div></div>`).join('<br>');
  };
  return {
    start(label, total) {
      const id = ++n; const t = { label, total, done: 0 }; tasks.set(id, t); render();
      return { tick(d) { t.done = d; render(); }, done() { tasks.delete(id); render(); } };
    },
  };
})();
