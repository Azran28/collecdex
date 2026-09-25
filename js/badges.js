/*
 * Badges à débloquer (succès). Ils restent secrets tant qu'ils ne sont pas obtenus :
 * la vitrine n'affiche que ceux que tu as, et le nombre qu'il reste à découvrir.
 * Niveaux : 1 bronze, 2 argent, 3 or, 4 holo.
 */
App.badges = (() => {
  const N = (s) => App.util.norm(s || '');
  const has = (ctx, name) => ctx.items.some((i) => N(i.snap.name).split(' ').includes(N(name)));
  const L = [
    // Taille de la collection
    ['c1', 'Premier pas', 'Ta première carte dans ton Dex', 'sparkles', 1, (x) => x.n >= 1],
    ['c10', 'Apprenti collectionneur', '10 cartes différentes', 'layers', 1, (x) => x.n >= 10],
    ['c50', 'Classeur entamé', '50 cartes différentes', 'layers', 1, (x) => x.n >= 50],
    ['c100', 'Centurion', '100 cartes différentes', 'layers', 2, (x) => x.n >= 100],
    ['c250', 'Accro aux boosters', '250 cartes différentes', 'layers', 2, (x) => x.n >= 250],
    ['c500', 'Maître du classeur', '500 cartes différentes', 'layers', 3, (x) => x.n >= 500],
    ['c1000', 'Légende vivante', '1 000 cartes différentes', 'crown', 4, (x) => x.n >= 1000],
    ['c2500', 'Archiviste', '2 500 cartes différentes', 'crown', 4, (x) => x.n >= 2500],
    // Séries
    ['s1', 'Série bouclée', 'Ta première série complète', 'trophy', 2, (x) => x.complete >= 1],
    ['s5', 'Complétiste', '5 séries complètes', 'trophy', 3, (x) => x.complete >= 5],
    ['s10', 'Perfectionniste', '10 séries complètes', 'trophy', 4, (x) => x.complete >= 10],
    ['t10', 'Globe-trotter', 'Des cartes de 10 séries différentes', 'globe', 1, (x) => x.sets >= 10],
    ['t25', 'Grand explorateur', 'Des cartes de 25 séries différentes', 'globe', 2, (x) => x.sets >= 25],
    ['e5', 'Voyageur temporel', 'Des cartes de 5 époques différentes', 'clock', 3, (x) => x.eras >= 5],
    ['v1', 'Nostalgique', 'Une carte sortie avant 2004', 'clock', 1, (x) => x.vintage >= 1],
    ['v25', 'Old school', '25 cartes sorties avant 2004', 'clock', 3, (x) => x.vintage >= 25],
    // Rareté
    ['r4', 'Ça brille !', 'Ta première carte holographique (ou plus rare)', 'star', 1, (x) => x.maxRank >= 4],
    ['r8', 'Éclat rare', 'Une Ultra Rare (ou plus rare)', 'star', 2, (x) => x.maxRank >= 8],
    ['r11', 'Trésor caché', 'Une Illustration spéciale, secrète ou hyper rare', 'star', 3, (x) => x.maxRank >= 11],
    ['r13', 'Couronné', 'Une carte Couronne ou Méga Hyper Rare', 'crown', 4, (x) => x.maxRank >= 13],
    // Valeur
    ['p100', 'Petit trésor', 'Collection estimée à 100 € ou plus', 'coins', 1, (x) => x.value >= 100],
    ['p500', 'Coffre-fort', 'Collection estimée à 500 € ou plus', 'coins', 2, (x) => x.value >= 500],
    ['p1000', 'Banque centrale', 'Collection estimée à 1 000 € ou plus', 'coins', 3, (x) => x.value >= 1000],
    ['pc100', 'Pièce maîtresse', 'Une carte qui vaut 100 € ou plus', 'gem', 3, (x) => x.maxPrice >= 100],
    // Certification
    ['k1', 'Authentique', 'Ta première carte certifiée', 'shield', 1, (x) => x.cert >= 1],
    ['k25', 'Sceau de confiance', '25 cartes certifiées', 'shield', 2, (x) => x.cert >= 25],
    ['k100', 'Incorruptible', '100 cartes certifiées', 'shield', 4, (x) => x.cert >= 100],
    // Doublons, favoris
    ['d10', 'Prêt à échanger', '10 doublons de côté', 'gift', 1, (x) => x.dup >= 10],
    ['d50', 'Marchand ambulant', '50 doublons de côté', 'gift', 2, (x) => x.dup >= 50],
    ['f10', 'Coups de cœur', '10 cartes en favori', 'heart', 1, (x) => x.fav >= 10],
    // Pokémon
    ['pk-chen', 'Le choix du Prof. Chen', 'Bulbizarre, Salamèche et Carapuce', 'bolt', 2, (x) => ['bulbizarre', 'salameche', 'carapuce'].every((n) => has(x, n))],
    ['pk-pika', 'Pika-fan', '5 cartes Pikachu différentes', 'bolt', 2, (x) => x.items.filter((i) => N(i.snap.name).includes('pikachu')).length >= 5],
    ['pk-dracau', 'Dresseur de dragons', 'Un Dracaufeu dans ton Dex', 'flame', 2, (x) => has(x, 'dracaufeu')],
    ['pk-evoli', 'Évolimaniac', '5 membres de la famille Évoli', 'sparkles', 3, (x) => ['evoli', 'aquali', 'voltali', 'pyroli', 'mentali', 'noctali', 'phyllali', 'givrali', 'nymphali'].filter((n) => has(x, n)).length >= 5],
    ['pk-mew', 'Code génétique', 'Mew et Mewtwo', 'sparkles', 3, (x) => has(x, 'mew') && has(x, 'mewtwo')],
  ].map(([id, name, desc, icon, tier, test]) => ({ id, name, desc, icon, tier, test }));

  let setsCache = null;
  async function context(list = null, isCert = null) {
    const items = (list || App.col.all()).filter((i) => i.qty > 0);
    const certOf = isCert || ((i) => App.certify && App.certify.isCertified(i));
    const ad = App.games.get('pokemon');
    if (!setsCache) setsCache = await ad.listSets().catch(() => []);
    const byId = new Map(setsCache.map((s) => [s.id, s]));
    const setIds = new Set(items.map((i) => i.setId));
    const eras = new Set(items.map((i) => (byId.get(i.setId) || {}).group).filter(Boolean).map((g) => g.id));
    const vintage = items.filter((i) => { const s = byId.get(i.setId); return s && s.releaseDate && s.releaseDate < '2004'; }).length;
    const complete = [...setIds].map((id) => byId.get(id)).filter((s) => s && App.col.progress('pokemon', s, list ? items : null).complete).length;
    const price = (i) => App.col.valueOf(i);
    return {
      items, n: items.length, sets: setIds.size, eras: eras.size, vintage, complete,
      maxRank: Math.max(0, ...items.map((i) => Math.max(ad.rarity.rank(i.snap.rarity), i.snap.holo ? 4 : 0))),
      value: items.reduce((s, i) => s + price(i) * i.qty, 0), maxPrice: Math.max(0, ...items.map(price)),
      cert: items.filter(certOf).length,
      dup: items.reduce((s, i) => s + Math.max(0, i.qty - 1), 0), fav: items.filter((i) => i.favorite).length,
    };
  }
  /** Badges obtenus (les tiens, ou ceux d'un ami : list = ses cartes, isCert = ses certifications) */
  async function unlocked(list = null, isCert = null) {
    const x = await context(list, isCert);
    return L.filter((b) => { try { return b.test(x); } catch (e) { return false; } });
  }

  /** Médaille HTML */
  const medal = (b, { isNew = false, size = 'md' } = {}) => `<div class="badge-medal t${b.tier} ${size} ${isNew ? 'new' : ''}" title="${App.util.esc(b.name + ' — ' + b.desc)}">
      <div class="bm-disc">${App.icons.icon(b.icon, size === 'sm' ? 18 : 24)}</div>
      <div class="bm-txt"><b>${App.util.esc(b.name)}</b><span>${App.util.esc(b.desc)}</span></div>
    </div>`;

  /** Nouveaux badges depuis la dernière fois → petite annonce */
  async function check({ silent = false } = {}) {
    const got = await unlocked();
    const seen = new Set((await App.db.get('kv', 'badgesSeen').catch(() => null)) || []);
    const fresh = got.filter((b) => !seen.has(b.id));
    if (!fresh.length) return [];
    await App.db.set('kv', 'badgesSeen', got.map((b) => b.id));
    const firstTime = seen.size === 0 && fresh.length > 2;
    if (!silent) {
      if (firstTime) App.util.toast(`🏅 ${fresh.length} badges débloqués ! Va les voir dans ta vitrine.`, 5000);
      else fresh.forEach((b, k) => setTimeout(() => App.util.toast(`🏅 Nouveau badge : ${b.name}`, 4000), k * 1500));
    }
    return fresh;
  }

  return { list: L, total: L.length, unlocked, medal, check };
})();
