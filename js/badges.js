/*
 * Badges à débloquer (succès). Ils restent secrets tant qu'ils ne sont pas obtenus :
 * la vitrine n'affiche que ceux que tu as, et le nombre qu'il reste à découvrir.
 * Niveaux : 1 bronze, 2 argent, 3 or, 4 holo.
 */
App.badges = (() => {
  const N = (s) => App.util.norm(s || '');
  const has = (ctx, name) => ctx.items.some((i) => N(i.snap.name).split(' ').includes(N(name)));
  // champions de League of Legends présents dans Riftbound (nom avant la virgule : « Jinx, Demolitionist », « Lee Sin, Blind Monk »)
  const RB_CHAMPS = new Set(['ahri', 'akali', 'ambessa', 'anivia', 'annie', 'aphelios', 'azir', 'bard', 'blitzcrank', 'caitlyn', 'darius', 'diana', 'dr. mundo', 'draven', 'ekko',
    'evelynn', 'ezreal', 'fiora', 'garen', 'heimerdinger', 'irelia', 'ivern', 'jarvan iv', 'jax', 'jayce', 'jhin', 'jinx', 'k\'sante', 'kai\'sa', 'karma', 'karthus', 'kayn', 'kennen',
    'kha\'zix', 'kog\'maw', 'leblanc', 'lee sin', 'leona', 'lillia', 'lucian', 'lux', 'malzahar', 'master yi', 'mel', 'miss fortune', 'nocturne', 'poppy', 'qiyana', 'rek\'sai', 'renata glasc',
    'rengar', 'rumble', 'sett', 'shen', 'sivir', 'sona', 'taric', 'teemo', 'tryndamere', 'twisted fate', 'udyr', 'vayne', 'vi', 'viktor', 'volibear', 'warwick', 'yasuo', 'yone', 'zed'].map(N));
  // Lorcana : personnage = nom avant « - » (« Belle - Étrange demoiselle ») ; princesses Disney présentes dans le jeu
  const hasLc = (ctx, name) => ctx.items.some((i) => i.game === 'lorcana' && N(String(i.snap.name).split(' - ')[0]) === name);
  const LC_PRINCESSES = ['ariel', 'cendrillon', 'belle', 'raiponce', 'aurore', 'blanche-neige', 'jasmine', 'mulan', 'pocahontas', 'tiana', 'vaiana', 'merida', 'anna', 'elsa'];
  // Yu-Gi-Oh! : noms des cartes possédées (normalisés)
  const ygNames = (ctx) => ctx.items.filter((i) => i.game === 'yugioh').map((i) => N(i.snap.name));
  // Final Fantasy : noms des cartes possédées (normalisés, « Poussin chocobo (VII) » → « poussin chocobo vii »)
  const ffNames = (ctx) => ctx.items.filter((i) => i.game === 'finalfantasy').map((i) => N(String(i.snap.name).replace(/\s*\(Full Art\)$/, '')));
  // Wankul : cartes possédées
  const wkItems = (ctx) => ctx.items.filter((i) => i.game === 'wankul');
  // Star Wars Unlimited : titres des cartes possédées (« Dark Vador, Seigneur Noir Des Sith (Hyperspace) » → « dark vador »)
  const swNames = (ctx) => ctx.items.filter((i) => i.game === 'starwars').map((i) => N(String(i.snap.name).replace(/\s*\([^)]*\)$/, '').split(',')[0]));
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
    ['d10', 'Bien fourni', '10 doublons de côté', 'gift', 1, (x) => x.dup >= 10],
    ['d50', 'Marchand ambulant', '50 doublons de côté', 'gift', 2, (x) => x.dup >= 50],
    ['f10', 'Coups de cœur', '10 cartes en favori', 'heart', 1, (x) => x.fav >= 10],
    // Pokémon
    ['pk-chen', 'Le choix du Prof. Chen', 'Bulbizarre, Salamèche et Carapuce', 'bolt', 2, (x) => ['bulbizarre', 'salameche', 'carapuce'].every((n) => has(x, n))],
    ['pk-pika', 'Pika-fan', '5 cartes Pikachu différentes', 'bolt', 2, (x) => x.items.filter((i) => N(i.snap.name).includes('pikachu')).length >= 5],
    ['pk-dracau', 'Dresseur de dragons', 'Un Dracaufeu dans ton Dex', 'flame', 2, (x) => has(x, 'dracaufeu')],
    ['pk-evoli', 'Évolimaniac', '5 membres de la famille Évoli', 'sparkles', 3, (x) => ['evoli', 'aquali', 'voltali', 'pyroli', 'mentali', 'noctali', 'phyllali', 'givrali', 'nymphali'].filter((n) => has(x, n)).length >= 5],
    ['pk-mew', 'Code génétique', 'Mew et Mewtwo', 'sparkles', 3, (x) => has(x, 'mew') && has(x, 'mewtwo')],
    // One Piece (v2.94 : mêmes idées que les badges Pokémon)
    ['op-luffy', 'Chapeau de paille', '5 cartes Luffy différentes', 'anchor', 2, (x) => x.items.filter((i) => i.game === 'onepiece' && N(i.snap.name).includes('luffy')).length >= 5],
    ['op-crew', 'Équipage au complet', '5 membres de l’équipage de Luffy', 'anchor', 3, (x) => ['zoro', 'nami', 'usopp', 'sanji', 'chopper', 'robin', 'franky', 'brook', 'jinbe'].filter((n) => has(x, n)).length >= 5],
    ['op-yonko', 'Les Quatre Empereurs', 'Shanks, Big Mom, Kaido et Barbe Noire', 'crown', 3, (x) => has(x, 'shanks') && has(x, 'linlin') && has(x, 'kaido') && has(x, 'teach')],
    ['op-lead', 'Capitaine', '10 cartes Leader différentes', 'anchor', 2, (x) => x.items.filter((i) => i.game === 'onepiece' && /leader/i.test(i.snap.rarity || '')).length >= 10],
    // Riftbound (v3.10 : mêmes idées ; noms des cartes en anglais, comme chez Riot)
    ['rb-poro', 'Poro-mania', '3 Poros différents', 'rune', 2, (x) => x.items.filter((i) => i.game === 'riftbound' && N(i.snap.name).includes('poro')).length >= 3],
    ['rb-runes', 'Maître des runes', 'Les 6 runes : Fureur, Calme, Esprit, Corps, Chaos et Ordre', 'rune', 2, (x) => ['fury', 'calm', 'mind', 'body', 'chaos', 'order'].every((d) => x.items.some((i) => i.game === 'riftbound' && N(i.snap.name) === `${d} rune`))],
    ['rb-champs', 'Invocateur', '10 champions différents', 'crown', 3, (x) => new Set(x.items.filter((i) => i.game === 'riftbound').map((i) => N(String(i.snap.name).split(',')[0])).filter((n) => RB_CHAMPS.has(n))).size >= 10],
    ['rb-showcase', 'Vitrine dorée', '3 cartes Showcase', 'rune', 3, (x) => x.items.filter((i) => i.game === 'riftbound' && i.snap.rarity === 'showcase').length >= 3],
    // Disney Lorcana (v3.21 : mêmes idées ; noms français « Ariel - Sur des jambes humaines », personnage avant le tiret)
    ['lc-mickey', 'Ami de Mickey', '5 cartes Mickey Mouse différentes', 'ink', 2, (x) => x.items.filter((i) => i.game === 'lorcana' && N(i.snap.name).startsWith('mickey mouse')).length >= 5],
    ['lc-princes', 'Royaume des princesses', '5 princesses différentes', 'crown', 2, (x) => LC_PRINCESSES.filter((n) => hasLc(x, n)).length >= 5],
    ['lc-villains', 'Côté obscur', 'Ursula, Maléfique, Jafar et Hadès', 'ink', 3, (x) => ['ursula', 'malefique', 'jafar', 'hades'].every((n) => hasLc(x, n))],
    ['lc-ench', 'Enchanteur', '3 cartes Enchantées', 'sparkles', 3, (x) => x.items.filter((i) => i.game === 'lorcana' && i.snap.rarity === 'en').length >= 3],
    // Yu-Gi-Oh! (v3.26 ; noms français ou anglais, selon la carte)
    ['yg-exodia', 'L’Interdit', 'Les 5 pièces d’Exodia', 'pyramid', 3, (x) => new Set(ygNames(x).filter((n) => /interdit|forbidden one/.test(n))).size >= 5],
    ['yg-dragons', 'Yeux bleus, yeux rouges', 'Un Dragon Blanc aux Yeux Bleus et un Dragon Noir aux Yeux Rouges', 'pyramid', 2, (x) => ygNames(x).some((n) => /^(dragon blanc aux yeux bleus|blue eyes white dragon)$/.test(n)) && ygNames(x).some((n) => /^(dragon noir aux yeux rouges|red eyes black dragon|red eyes b dragon)$/.test(n))],
    ['yg-dieux', 'Dieux égyptiens', 'Obélisk, Slifer et Râ', 'crown', 4, (x) => [/obelisk/, /slifer/, /dragon aile de ra|winged dragon of ra/].every((r) => ygNames(x).some((n) => r.test(n)))],
    ['yg-secret', 'Rareté secrète', '3 cartes Secret Rare ou plus rares', 'sparkles', 3, (x) => x.items.filter((i) => i.game === 'yugioh' && App.games.get('yugioh') && App.games.get('yugioh').rarity.rank(i.snap.rarity) >= 8).length >= 3],
    // Final Fantasy (v3.43 : mêmes idées — un héros culte, une famille, les méchants, une rareté haute)
    ['ff-cloud', 'SOLDAT', '5 cartes Cloud différentes', 'crystal', 2, (x) => ffNames(x).filter((n) => n === 'cloud').length >= 5],
    ['ff-invoc', 'Invocateur', 'Ifrit, Shiva, Ramuh et Bahamut', 'crystal', 2, (x) => ['ifrit', 'shiva', 'ramuh', 'bahamut'].every((n) => ffNames(x).includes(n))],
    ['ff-mechants', 'Ennemis jurés', 'Séphiroth, Kefka, Kuja et Exdeath', 'crown', 3, (x) => ['sephiroth', 'kefka', 'kuja', 'exdeath'].every((n) => ffNames(x).includes(n))],
    ['ff-legende', 'Légende du Cristal', '3 cartes Légende', 'sparkles', 3, (x) => x.items.filter((i) => i.game === 'finalfantasy' && i.snap.rarity === 'l').length >= 3],
    // Wankul (v3.48 : mêmes idées — les deux héros, une famille, une carte rare à trouver, une rareté haute)
    ['wk-duo', 'Le duo', 'Une carte Laink et une carte Terracid', 'wankil', 1, (x) => ['laink', 'terracid'].every((n) => wkItems(x).some((i) => N(i.snap.name) === n))],
    ['wk-terrains', 'Agent immobilier', '20 Terrains Wankul différents', 'wankil', 2, (x) => wkItems(x).filter((i) => i.snap.rarity === 't').length >= 20],
    ['wk-ticket', 'Ticket d’or', 'Une carte de Gagnant du Ticket d’or', 'star', 3, (x) => wkItems(x).some((i) => i.snap.rarity === 'tor')],
    ['wk-legende', 'Légende du Wankul', '3 cartes Légendaires (Bronze, Argent ou Or)', 'sparkles', 3, (x) => wkItems(x).filter((i) => ['lb', 'la', 'lo'].includes(i.snap.rarity)).length >= 3],
    // Star Wars Unlimited (v3.67 : mêmes idées — un duo culte, une famille, les méchants, une version rare)
    ['sw-skywalker', 'Je suis ton père', 'Luke Skywalker et Dark Vador', 'saber', 1, (x) => ['luke skywalker', 'dark vador'].every((n) => swNames(x).includes(n))],
    ['sw-rebelles', 'Héros de l’Alliance', 'Leia Organa, Han Solo, Chewbacca, R2-D2 et C-3PO', 'saber', 2, (x) => ['leia organa', 'han solo', 'chewbacca', 'r2-d2', 'c-3po'].every((n) => swNames(x).includes(n))],
    ['sw-sith', 'Côté obscur', 'Dark Vador, Empereur Palpatine, Comte Dooku et Dark Maul', 'crown', 3, (x) => ['dark vador', 'empereur palpatine', 'comte dooku', 'dark maul'].every((n) => swNames(x).includes(n))],
    ['sw-hyper', 'Hyperespace', '3 cartes Hyperspace ou Showcase', 'sparkles', 3, (x) => x.items.filter((i) => i.game === 'starwars' && /\((Hyperspace|Showcase)\)$/.test(String(i.snap.name))).length >= 3],
  ].map(([id, name, desc, icon, tier, test]) => ({ id, name, desc, icon, tier, test }));

  const setsCache = {}; // séries de chaque licence
  async function context(list = null, isCert = null) {
    const items = (list || App.col.all()).filter((i) => i.qty > 0);
    const certOf = isCert || ((i) => App.certify && App.certify.isCertified(i));
    // toutes les licences (Pokémon, One Piece…) : séries, époques, séries complètes, rareté selon chaque jeu
    const games = [...new Set(items.map((i) => i.game || 'pokemon'))].filter((g) => App.games.get(g));
    const byId = new Map();
    for (const g of games) {
      if (!setsCache[g]) setsCache[g] = await App.games.get(g).listSets().catch(() => []);
      for (const s of setsCache[g]) byId.set(`${g}:${s.id}`, s);
    }
    const setOf = (i) => byId.get(`${i.game || 'pokemon'}:${i.setId}`);
    const setKeys = new Set(items.map((i) => `${i.game || 'pokemon'}:${i.setId}`));
    const eras = new Set(items.map((i) => (setOf(i) || {}).group).filter(Boolean).map((g) => g.id));
    const vintage = items.filter((i) => { const s = setOf(i); return s && s.releaseDate && s.releaseDate < '2004'; }).length;
    const complete = [...setKeys].filter((k) => { const s = byId.get(k); return s && App.col.progress(k.split(':')[0], s, list ? items : null).complete; }).length;
    const rankOf = (i) => { const ad = App.games.get(i.game || 'pokemon'); return ad && ad.rarity ? ad.rarity.rank(i.snap.rarity) : 0; };
    const price = (i) => App.col.valueOf(i);
    return {
      items, n: items.length, sets: setKeys.size, eras: eras.size, vintage, complete,
      maxRank: Math.max(0, ...items.map((i) => Math.max(rankOf(i), i.snap.holo ? 4 : 0))),
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
    // notification du téléphone (Paramètres › Notifications › « Je débloque un badge ») ; pas pour la toute première fois
    if (!firstTime && App.notify) {
      const one = fresh.length === 1;
      App.notify.local('badges', one ? `🏅 Nouveau badge : ${fresh[0].name}` : `🏅 ${fresh.length} nouveaux badges`,
        one ? fresh[0].desc : fresh.map((b) => b.name).join(' · '), '#/compte', 'badge-' + fresh.map((b) => b.id).join('-'));
    }
    return fresh;
  }

  return { list: L, total: L.length, unlocked, medal, check };
})();
