/*
 * Tests des fonctions (sans dessiner de page). Chaque test reçoit l'App du site testé.
 * Quand un comportement change exprès, mettre le test à jour en même temps.
 */

// ---------- Le site se charge ----------
test('le site se charge et tous les modules sont présents', async (App, W) => {
  ok(App, 'App introuvable (erreur de syntaxe dans un fichier ?)');
  // pas encore chargés au démarrage : seulement à l'ouverture de leur page (v3.07)
  const early = ['recognizer', 'visual', 'battle', 'duel', 'importer'].filter((m) => App[m]).concat(['scan', 'match', 'import'].filter((v) => App.views[v]));
  eq(early, [], 'chargés dès l’accueil alors qu’ils devraient attendre leur page');
  await App.need('reco', 'scan', 'match', 'import');
  const mods = ['util', 'db', 'games', 'col', 'cloud', 'sfx', 'pokedex', 'capsules', 'battle', 'battleCards', 'duel', 'friends', 'certify', 'badges', 'wish', 'importer', 'notify', 'ui', 'recognizer', 'visual'];
  eq(mods.filter((m) => !App[m]), [], 'modules manquants');
  const views = ['home', 'sets', 'set', 'collection', 'showcase', 'match', 'friends', 'account', 'scan', 'settings', 'goals', 'capsules', 'import'];
  eq(views.filter((v) => !(App.views[v] && App.views[v].render)), [], 'pages manquantes');
  ok(W.APP_VERSION && /^\d{8}-\d{6}$/.test(W.APP_VERSION), 'numéro de version absent');
});

test('chaque script de la page a le même numéro de version', async (App, W) => {
  const srcs = [...W.document.querySelectorAll('script[src^="js/"], link[rel="stylesheet"][href^="css/"]')].map((s) => s.getAttribute('src') || s.getAttribute('href'));
  ok(srcs.length > 30, 'scripts introuvables');
  eq(srcs.filter((s) => !s.includes('?v=' + W.APP_VERSION)), [], 'fichiers sans le bon ?v= (lancer outils/stamp.sh)');
  const v = await (await fetch('version.json?t=' + Date.now(), { cache: 'no-store' })).json();
  eq(v.v, W.APP_VERSION, 'version.json');
});

test('les jeux (licences) sont enregistrés', (App) => {
  ok(App.games.get('pokemon'), 'Pokémon');
  ok(App.games.get('onepiece'), 'One Piece');
  ok(App.games.get('riftbound'), 'Riftbound');
  ok(App.games.get('lorcana'), 'Lorcana');
  ok(App.games.get('yugioh'), 'Yu-Gi-Oh!');
  ok(!App.games.get('inconnu'), 'un jeu inconnu ne doit pas exister');
});

// ---------- Outils ----------
test('util.esc protège le HTML', (App) => {
  eq(App.util.esc('<img src=x onerror="alert(1)">&\''), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;&#39;');
  eq(App.util.esc(null), '');
});
test('util.lev / similarity', (App) => {
  eq(App.util.lev('pikachu', 'pikachu'), 0);
  eq(App.util.lev('dracaufeu', 'dracofeu'), 2);
  ok(App.util.similarity('Dracaufeu', 'dracaufeu') > 0.95, 'majuscules ignorées');
  ok(App.util.similarity('Pikachu', 'Rattata') < 0.5, 'noms différents');
});

// ---------- Valeur ----------
test('valeur : état, carte gradée, valeur manuelle', (App) => {
  const p = { value: 100, unit: 'EUR' };
  eq(App.col.valueOf({ price: p, cond: { kind: 'raw', grade: 'NM' } }), 100, 'Near Mint');
  ok(App.col.valueOf({ price: p, cond: { kind: 'raw', grade: 'PO' } }) < 50, 'Poor vaut beaucoup moins');
  eq(App.col.valueOf({ price: p, valueOverride: 12 }), 12, 'valeur manuelle prioritaire');
  eq(App.col.valueOf({ cond: { kind: 'raw', grade: 'NM' } }), 0, 'sans prix');
  eq(App.col.totalValue([{ price: p, qty: 2, cond: { kind: 'raw', grade: 'NM' } }, { valueOverride: 5, qty: 1 }]), 205, 'total');
});

// ---------- Import ----------
test('import : lecture CSV (séparateur deviné, guillemets)', (App) => {
  const I = App.importer;
  eq(I.parseCSV('Nom;Numéro\n"Dracaufeu; holo";4/102\n\nPikachu;58/102'), [['Nom', 'Numéro'], ['Dracaufeu; holo', '4/102'], ['Pikachu', '58/102']]);
  eq(I.parseCSV('sep=,\na,b\n1,2'), [['a', 'b'], ['1', '2']], 'ligne sep=');
  eq(I.parseCSV('a\tb\n"x ""y"""\t2'), [['a', 'b'], ['x "y"', '2']], 'tabulations et guillemets doublés');
});
test('import : numéros, états, langues, versions', (App) => {
  const t = App.importer._t;
  eq(t.numOf('4/102'), { n: '4', total: 102 });
  eq(t.numOf('SV049/SV094'), { n: 'SV049', total: 94 });
  eq(t.numOf('#25'), { n: '25', total: null });
  eq(t.numOf('Dracaufeu'), null);
  eq(t.condOf('Near Mint'), { kind: 'raw', grade: 'NM' });
  eq(t.condOf('PSA 9'), { kind: 'graded', company: 'PSA', grade: 9 });
  eq(t.condOf('', 'CGC 9.5'), { kind: 'graded', company: 'CGC', grade: 9.5 });
  eq(t.langOf('French', 'en'), 'fr');
  eq(t.langOf('', 'en'), 'en');
  eq(t.versionOf('Reverse Holo').base, 'reverse');
  ok(t.versionOf('1st Edition').first, '1re édition');
});
test('import : colonnes reconnues (Collectr)', (App) => {
  const I = App.importer;
  const rows = I.parseCSV('Portfolio Name,Category,Set,Product Name,Card Number,Rarity,Variance,Grade,Card Condition,Average Cost Paid,Quantity,Market Price\nMa coll,Pokemon,Base Set,Charizard,4/102,Holo Rare,Holofoil,Ungraded,Near Mint,0,1,300');
  const det = I.detect(rows);
  eq(det.header, 0, 'ligne de titres');
  eq(I.sourceOf(det.cols), 'collectr', 'format reconnu');
  const r = I.rowsOf(rows, det);
  ok(r.length === 1, 'une ligne de carte');
  const row = r[0];
  ok(/charizard/i.test(row.name), 'nom : ' + row.name);
  eq([row.num && row.num.n, row.qty], ['4', 1]);
});

// ---------- Combat ----------
const fx = (type, o = {}) => ({ type, weak: [], res: [], ...o });
test('combat : dégâts avec faiblesse ×2, +N et résistance', (App) => {
  const B = App.battle;
  eq(B.damage({ base: 30 }, fx('fire'), fx('grass', { weak: [{ type: 'fire', mult: 2 }] })).dmg, 60, 'faiblesse ×2');
  eq(B.damage({ base: 30 }, fx('fire'), fx('grass', { weak: [{ type: 'fire', add: 20 }] })).dmg, 50, 'faiblesse +20');
  eq(B.damage({ base: 30 }, fx('fire'), fx('water', { res: [{ type: 'fire', sub: 30 }] })).dmg, 0, 'résistance');
  eq(B.damage({ base: 0 }, fx('fire'), fx('grass', { weak: [{ type: 'fire', mult: 2 }] })).dmg, 0, '0 dégât reste 0');
});
test('combat : pièces (« × » et « + ») selon le tirage', (App) => {
  const B = App.battle, heads = () => 0.1, tails = () => 0.9;
  eq(B.damage({ base: 20, mode: 'x' }, fx('water'), fx('fire'), heads).dmg, 40, '2 faces');
  eq(B.damage({ base: 20, mode: 'x' }, fx('water'), fx('fire'), tails).dmg, 0, '2 piles');
  eq(B.damage({ base: 30, mode: '+' }, fx('water'), fx('fire'), heads).dmg, 40, '+10 si face');
  eq(B.damage({ base: 30, mode: '+' }, fx('water'), fx('fire'), tails).dmg, 30, 'rien si pile');
});
test('combat : types reconnus en français et en anglais', (App) => {
  const k = App.battle.typeKey;
  eq([k('Feu'), k('fire'), k('Eau'), k('Plante'), k('???')], [k('Fire'), 'fire', k('water'), k('grass'), 'colorless']);
});
test('combat : niveaux de l’ordinateur', (App) => {
  ok(App.battle.levels('pokemon').length >= 5, 'niveaux Pokémon');
  ok(App.battle.levels('onepiece').length >= 1, 'niveaux One Piece');
  eq(App.battle.levels('riftbound').length, 5, 'niveaux Riftbound');
  eq(App.battle.levels('lorcana').length, 5, 'niveaux Lorcana');
  eq(App.battle.levels('yugioh').length, 5, 'niveaux Yu-Gi-Oh!');
});

// ---------- Combat en ligne : les deux téléphones doivent tirer les mêmes nombres ----------
test('combat en ligne : tirages identiques avec la même graine', (App) => {
  const D = App.duel, a = D.rng(12345), b = D.rng(12345), c = D.rng(54321);
  const sa = Array.from({ length: 20 }, a), sb = Array.from({ length: 20 }, b), sc = Array.from({ length: 20 }, c);
  eq(sa, sb, 'même graine');
  ok(show(sa) !== show(sc), 'autre graine');
  ok(sa.every((x) => x >= 0 && x < 1), 'entre 0 et 1');
  eq(D.hostFirst(777), D.hostFirst(777), 'qui commence');
});
const show = (v) => JSON.stringify(v);
test('combat en ligne : code de salon retrouvé dans un message collé', (App) => {
  const D = App.duel;
  eq(D.normCode(' ab-c 12x9 '), 'ABC12X');
  eq(D.pickCode('Rejoins-moi : https://azran28.github.io/collecdex/#/combat?salon=K7PQ2Z'), 'K7PQ2Z');
  eq(D.pickCode('k7pq2z'), 'K7PQ2Z');
});

// ---------- Sécurité : données venant d'un autre dresseur ----------
test('sécurité : carte d’un ami nettoyée (texte piégé, image étrangère)', (App) => {
  const { cleanItem } = App.friends._t;
  eq(cleanItem({ game: 'inconnu', id: 'x' }), null, 'jeu inconnu refusé');
  const it = cleanItem({
    game: 'pokemon', id: 'base1-4', qty: '3.7', lang: 'fr"><script>', photos: ['ok_1', '../../x', '<b>'], displayPhoto: 'javascript:alert(1)',
    cond: { kind: 'graded', company: 'EVIL', grade: 10 }, price: { value: '12', unit: 'BTC' },
    snap: { name: 'x'.repeat(500), image: 'https://evil.example/x.png', holo: 'oui' },
  });
  eq(it.qty, 3); eq(it.lang, 'fr'); eq(it.photos, ['ok_1']); eq(it.displayPhoto, null);
  eq(it.cond, null, 'note inconnue refusée'); eq(it.price, { value: 12, unit: 'EUR' });
  eq(it.snap.image, '', 'image hors TCGdex refusée'); eq(it.snap.name.length, 200); eq(it.snap.holo, true);
  eq(cleanItem({ game: 'pokemon', snap: { image: 'https://assets.tcgdex.net/fr/base/base1/4' } }).snap.image, 'https://assets.tcgdex.net/fr/base/base1/4', 'image TCGdex gardée');
});
test('sécurité : profil d’un ami nettoyé', (App) => {
  const { cleanProfile, cleanRow } = App.friends._t;
  const p = cleanProfile({ theme: 'url(javascript:1)', frame: '"><x', avatarPoke: { id: '99999' }, avatar: '../x', featured: Array(20).fill('k'), stats: ['inconnue'] });
  eq([p.theme, p.frame, p.avatarPoke, p.avatar, p.featured.length, p.stats], ['nuit', 'or', null, null, 9, []]);
  eq(cleanProfile({ avatarPoke: { id: 25, shiny: 1 } }).avatarPoke, { id: 25, shiny: true });
  eq(cleanRow({ user_id: 'pas-un-uuid' }), null);
  eq(cleanRow({ user_id: '123e4567-e89b-12d3-a456-426614174000', pseudo: '', cards: -4 }).pseudo, 'Dresseur');
});

// ---------- Pokédex ----------
test('Pokédex : noms, raretés, évolutions', (App) => {
  const P = App.pokedex;
  eq(P.TOTAL, 1025);
  eq(P.name(25), 'Pikachu'); eq(P.name(6), 'Dracaufeu');
  ok(P.tier(150) !== P.tier(16), 'Mewtwo plus rare que Roucool');
  const f = P.family(4).flat ? P.family(4).flat(3) : P.family(4);
  ok(JSON.stringify(f).includes('6'), 'Salamèche évolue en Dracaufeu');
});

// ---------- Badges ----------
test('badges : liste et collection vide', (App) => {
  ok(App.badges.total >= 30, 'au moins 30 badges');
  const u = App.badges.unlocked([], () => false);
  ok(Array.isArray(u) || u instanceof Set || typeof u === 'object', 'résultat');
});

// ---------- Index de reconnaissance par l'image (fichiers data/) ----------
const checkIndex = async (name) => {
  const meta = await (await fetch(`data/${name}.json`, { cache: 'no-store' })).json();
  const bin = await (await fetch(`data/${name}.bin`, { cache: 'no-store' })).arrayBuffer();
  ok(meta.n > 1000 && meta.d > 0, 'en-tête');
  eq(meta.ids.length, meta.n, 'nombre d’identifiants');
  eq(new Set(meta.ids).size, meta.n, 'identifiants en double');
  // Pf, Pa (1280 × d float32) + échelles (n × 2 float32) + empreintes (n × 2d int8)
  eq(bin.byteLength, 1280 * meta.d * 4 * 2 + meta.n * 2 * 4 + meta.n * 2 * meta.d, 'taille du fichier .bin');
  return meta;
};
test('index Pokémon (data/vis-index) cohérent', async (App) => {
  const m = await checkIndex('vis-index');
  ok(m.ids.includes('base1-4'), 'Dracaufeu du Set de Base présent');
});
test('index One Piece (data/op-index) cohérent', async () => { await checkIndex('op-index'); });
test('index Riftbound (data/rb-index) cohérent', async () => {
  const m = await checkIndex('rb-index');
  ok(m.ids.includes('ogn-013-298'), 'Poro ronchon (OGN 013) présent');
});

test('index Lorcana (data/lc-index) cohérent', async () => {
  const m = await checkIndex('lc-index');
  ok(m.ids.includes('1-1') && m.ids.includes('1-205') && m.ids.includes('p1-18'), 'Ariel (1-1), une enchantée (1-205), une promo (p1-18)');
});

// ---------- Lorcana (v3.21) : cartes en français, code imprimé, combattant, cartes de pioche, import ----------
test('Lorcana : cartes en français (data/lc-cartes.json)', async (App) => {
  const A = App.games.get('lorcana'), sets = await A.listSets();
  ok(sets.length >= 20, `${sets.length} séries`);
  const s1 = await A.getSet('1');
  eq([s1.name, s1.cardCount.official], ['Premier Chapitre', 204]);
  const c = await A.getCard('1-1');
  eq([c.name, c.nameEn, c.rarity, c.category], ['Ariel - Sur des jambes humaines', 'Ariel - On Human Legs', 'u', 'Personnage']);
  ok(/^https:\/\/images\.weserv\.nl\/\?url=https%3A%2F%2Fapi\.lorcana\.ravensburger\.com%2Fimages%2Ffr%2F/.test(A.img.card(c)), 'visuel français relayé');
  ok(A.isOfficial('204', s1) && !A.isOfficial('205', s1) && !A.isOfficial('4a', s1), 'enchantées et variantes en plus des 204');
});
test('Lorcana : inserts puzzle (série par chapitre, images du site)', async (App) => {
  const A = App.games.get('lorcana'), pz = await A.getSet('PZ6');
  eq([pz.cards.length, pz.cards[0].category, pz.cards[0].rarity], [9, 'Insert puzzle', 'pz']);
  ok(/\/data\/lc-puzzles\/\d+\.jpg$/.test(A.img.card(pz.cards[0])), 'image copiée dans le site');
  const r = await fetch(A.img.card(pz.cards[4]), { cache: 'no-store' });
  ok(r.ok, 'image de la pièce 5 présente');
});
test('Lorcana : code imprimé lu même mal reconnu', async (App) => {
  const A = App.games.get('lorcana'); await A.listSets();
  const c = (t) => A.codesIn(t).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  eq(c('1/204 • FR • 1')[0], '1|1', '« 1/204 • FR • 1 »');
  eq(c('205/204 . FR . 1')[0], '1|205', 'enchantée, puces lues « . »');
  eq(c('l2O/204 - EN - 7')[0], '7|120', 'lettres lues à la place des chiffres');
  eq(c('18/P1 • FR • 2')[0], 'P1|18', 'promo « 18/P1 »');
  eq(c('1/31 • FR • Q1')[0], 'Q1|1', 'quête « 1/31 • FR • Q1 »');
  eq(c('4a/204 • FR • 3')[0], '3|4a', 'chiot dalmatien « 4a »');
  eq(c('Infligez 2 dommages à chaque personnage adverse.'), [], 'pas de code dans un texte de carte');
  eq(c('Pikachu 25/165'), [], 'numéro Pokémon (pas un total Lorcana)');
});
test('Lorcana : personnage → combattant, cartes de pioche', (App) => {
  const f = App.battle.fighterLC({ id: 'x', name: 'Guimauve', kind: 'ch', category: 'Personnage', strength: 5, willpower: 5, cost: 6, inks: ['st'], text: 'Rempart (Ce personnage peut être épuisé…)\nRésistance +1' });
  eq([f.hp, f.type, f.attacks.length, f.attacks[1].base], [120, 'metal', 2, 50]);
  ok(App.battle.canFight({ kind: 'ch', category: 'Personnage', strength: 2 }, 'lorcana') && !App.battle.canFight({ kind: 'ac', category: 'Action' }, 'lorcana'), 'seuls les personnages combattent');
  const fx = (category, text) => App.battleCards.effectOf({ id: 'y', name: 'z', category, text, inks: ['ru'] }).key;
  eq([fx('Action', 'Choisissez un personnage et infligez-lui 3 dommages.'), fx('Action', 'Choisissez un personnage et bannissez-le.'), fx('Action', 'Choisissez un personnage, il subit -2 ¤ pour le reste de ce tour.'),
    fx('Action', "Choisissez un personnage et retirez-lui jusqu'à 2 jetons Dommage."), fx('Lieu', 'Vos personnages ici gagnent +1 ¤.'), fx('Objet', 'Rien de connu.')],
  ['power', 'power', 'shield', 'heal', 'stadium', 'toolHp']);
  eq(App.battleCards.inkCard().fx.key, 'energy', 'encre = énergie');
});
test('Lorcana : dos de carte reconnu (photo d’Arnaud réduite), pas une face', async (App) => {
  await App.need('reco');
  const back = await createImageBitmap(await (await fetch('tests/dos-lorcana.jpg')).blob());
  const f = document.createElement('canvas'); f.width = 126; f.height = 176; const g = f.getContext('2d');
  g.fillStyle = '#111'; g.fillRect(0, 0, 126, 176);
  for (let i = 0; i < 40; i++) { g.fillStyle = `hsl(${i * 37 % 360} 70% 50%)`; g.fillRect(6 + (i % 6) * 19, 6 + Math.floor(i / 6) * 12, 19, 12); }
  g.fillStyle = '#e8d6aa'; g.fillRect(6, 110, 114, 56); // (zone de texte claire d'une face)
  const s = (c, w, h) => App.recognizer.backScoreOf(c, w, h, true, 'lorcana');
  ok(s(back, 126, 176) >= 0.7, `dos : ${s(back, 126, 176).toFixed(2)}`);
  ok(s(f, 126, 176) < 0.4, `face : ${s(f, 126, 176).toFixed(2)}`);
});
test('Capturer « Toutes » : une carte Lorcana reconnue sur son texte', async (App) => {
  await App.need('reco', 'scan'); await App.games.get('lorcana').listSets();
  const S = App.views.scan, R = App.recognizer, keep = R.readZones;
  const guess = async (txt) => { R.readZones = async (b, zones) => zones.map((z, i) => (i ? '' : txt)); try { return await S.detectGame(null); } finally { R.readZones = keep; } };
  eq(await guess('ARIEL Sur des jambes humaines Storyborn • Héros • Princesse 1/204 • FR • 1 Disney Lorcana ©Disney'), 'lorcana');
  eq(S.otherGames('25/204 • FR • 1', 'pokemon')[0], 'lorcana', 'Lorcana essayée d’abord quand son code se lit');
});
test('Import : lignes Lorcana (Collectr, Cardmarket)', async (App) => {
  await App.need('import');
  const I = App.importer;
  const rows = [['Product Name', 'Category', 'Set', 'Card Number', 'Quantity'], ['Ariel - On Human Legs', 'Lorcana', 'The First Chapter', '1/204', '1'], ['Stitch - Rock Star', 'Disney Lorcana', 'The First Chapter', '', '2']];
  const det = I.detect(rows), list = I.rowsOf ? I.rowsOf(rows, det) : null;
  ok(list && list.length === 2 && list.every((r) => r.game === 'lorcana'), 'lignes reconnues comme Lorcana');
  const m1 = await I.match(list[0]), m2 = await I.match(list[1]);
  eq([m1.status, m1.card.id], ['ok', '1-1'], 'série + numéro');
  ok(m2.card && /^Stitch - Rock star$/i.test(m2.card.name), `par le nom anglais : ${m2.card && m2.card.name}`);
});

// ---------- Yu-Gi-Oh! (v3.26) : cartes (noms français), codes imprimés, combattant, cartes de pioche, dos, import ----------
test('index Yu-Gi-Oh! (data/yg-index) cohérent', async () => {
  const m = await checkIndex('yg-index');
  ok(m.n > 13000 && m.ids.includes('#41160533') && m.ids.includes('#89631139'), 'une entrée par carte : Rose Tentaculaire, Dragon Blanc aux Yeux Bleus');
});
test('Yu-Gi-Oh! : cartes et séries (data/yg-cartes.json)', async (App) => {
  const A = App.games.get('yugioh'), sets = await A.listSets();
  ok(sets.length >= 900, `${sets.length} séries`);
  const s = await A.getSet('RGBT');
  eq([s.name, s.group && s.group.id], ['Raging Battle', 'yg-main']);
  ok(s.cards.length >= 100, `${s.cards.length} cartes dans Raging Battle`);
  const c = await A.getCard('RGBT-007');
  eq([c.name, c.nameEn, c.localId, c.kind, c.attribute, c.atk, c.def, c.level], ['Rose Tentaculaire', 'Rose Tentacles', '007', 'e', 'te', 2200, 1200, 6]);
  ok(/^https:\/\/images\.weserv\.nl\/\?url=https%3A%2F%2Fimages\.ygoprodeck\.com%2Fimages%2Fcards%2F41160533\.jpg/.test(A.img.card(c)), 'visuel relayé');
  const lob = await A.getSet('LOB');
  ok(lob.cards.some((x) => x.id === 'LOB-E001') && !lob.cards.some((x) => x.id === 'LOB-001'), 'LOB : numérotation européenne (celle des cartes françaises)');
  const ra = (await A.byKey('RA04-087')).map((x) => x.rarity);
  ok(ra.length >= 5 && ra[0] === 'sr', `autres raretés du même code : ${ra.join(', ')}`);
  ok(A.isOfficial('007') && !A.isOfficial('087 ScR'), 'autres raretés en plus');
});
test('Yu-Gi-Oh! : code imprimé lu même mal reconnu', async (App) => {
  const A = App.games.get('yugioh'); await A.listSets();
  const c = (t) => A.codesIn(t).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  eq(c('RGBT-FR007')[0], 'RGBT-007', '« RGBT-FR007 »');
  eq(c('CRMS-FR067')[0], 'CRMS-067', '« CRMS-FR067 »');
  eq(c('CRMS- FROO/')[0], 'CRMS-007', 'lettres lues à la place des chiffres (« O » = 0, « / » = 7)');
  eq(c('LOB-F003')[0], 'LOB-E003', 'anciennes cartes européennes « LOB-F003 »');
  ok(c('41160533').includes('#41160533'), 'passcode');
  eq(c('Pikachu 25/165'), [], 'numéro Pokémon');
  eq(c('OP09-004 Monkey D. Luffy'), [], 'code One Piece');
  eq(c('Infligez 300 points de dommages à votre adversaire.'), [], 'pas de code dans un texte de carte');
  eq(c('SDK-C032')[0], 'SDK-E032', 'anciennes cartes françaises du Canada « SDK-C032 »');
});
test('Yu-Gi-Oh! : impression choisie par le code dessiné (v3.30)', async (App) => {
  await App.need('reco'); const A = App.games.get('yugioh'), P = A.parts; await A.listSets();
  ok(P.printedForms('SDK-E032').includes('SDK-C032') && P.printedForms('RGBT-007').includes('RGBT-FR007'), 'formes imprimées');
  const r = P.readScores(['ROSE', 'DDK-C035'], ['SDK-E032', 'SDY-E027', 'SDJ-029']);
  ok(r.get('SDK-E032') > r.get('SDY-E027') && r.get('SDK-E032') > r.get('SDJ-029'), '« DDK-C035 » lu = SDK-C032');
  // fausse carte : fond clair, trait sous le code, « SDY-C027 » à sa place (aligné à droite sous l'illustration)
  const c = document.createElement('canvas'); c.width = 600; c.height = 838; const g = c.getContext('2d');
  g.fillStyle = '#c9a36b'; g.fillRect(0, 0, 600, 838); g.fillStyle = '#3a2a1a'; g.fillRect(40, 632, 520, 3);
  g.font = '15px Georgia, serif'; g.textAlign = 'right'; g.fillText('SDY-C027', 555, 624); g.filter = 'blur(0.6px)'; g.drawImage(c, 0, 0);
  const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.9));
  const m = await App.recognizerParts.codeMatch(blob, ['SDK-E032', 'SDY-E027', 'SDJ-029'].map((k) => [k, P.printedForms(k)]), P.CODE_BAND);
  eq(m && m.ranked[0][0], 'SDY-E027', 'code dessiné retrouvé');
});
test('Yu-Gi-Oh! : monstre → combattant, Magies et Pièges → cartes de pioche', async (App) => {
  await App.need('match');
  const A = App.games.get('yugioh'), bewd = await A.getCard('LOB-E001');
  const f = App.battle.fighterYG(bewd);
  eq([f.hp, f.type, f.attacks.length, f.attacks[0].base, f.attacks[0].cost], [130, 'lightning', 1, 100, 3]);
  ok(App.battle.canFight(bewd, 'yugioh') && !App.battle.canFight(await A.getCard('LOB-E041'), 'yugioh'), 'seuls les monstres combattent');
  const fx = async (id) => App.battleCards.effectOf(await A.getCard(id)).key;
  eq([await fx('LOB-119'), await fx('LOB-E041'), await fx('MRD-E138'), await fx('LOB-E096'), await fx('LOB-E038'), await fx('MRL-E002')], ['charge', 'power', 'shield', 'revive', 'stadium', 'toolHp']);
  eq(App.battle.levels('yugioh').length, 5, 'niveaux Yu-Gi-Oh!');
  for (const lv of App.battle.levels('yugioh')) for (const id of lv.pool) ok(await A.getCard(id).then((c) => App.battle.canFight(c, 'yugioh'), () => false), `adversaire ${id}`);
});
test('Yu-Gi-Oh! : dos de carte reconnu (photo d’Arnaud réduite), pas une face', async (App) => {
  await App.need('reco');
  const back = await createImageBitmap(await (await fetch('tests/dos-yugioh.jpg')).blob());
  // face : fine bordure sombre, cadre orange (monstre à effet), illustration, zone de texte claire
  const f = document.createElement('canvas'); f.width = 126; f.height = 176; const g = f.getContext('2d');
  g.fillStyle = '#222'; g.fillRect(0, 0, 126, 176); g.fillStyle = '#c8763a'; g.fillRect(4, 4, 118, 168);
  for (let i = 0; i < 30; i++) { g.fillStyle = `hsl(${i * 37 % 360} 60% 45%)`; g.fillRect(16 + (i % 6) * 16, 32 + Math.floor(i / 6) * 18, 16, 18); }
  g.fillStyle = '#e8d6aa'; g.fillRect(10, 130, 106, 34);
  const s = (c, w, h) => App.recognizer.backScoreOf(c, w, h, false, 'yugioh');
  ok(s(back, back.width, back.height) >= 0.6, `dos : ${s(back, back.width, back.height).toFixed(2)}`);
  ok(s(f, 126, 176) < 0.4, `face : ${s(f, 126, 176).toFixed(2)}`);
});
test('Capturer « Toutes » : une carte Yu-Gi-Oh! reconnue sur son texte', async (App) => {
  await App.need('reco', 'scan'); await App.games.get('yugioh').listSets();
  const S = App.views.scan, R = App.recognizer, keep = R.readZones;
  const guess = async (txt) => { R.readZones = async (b, zones) => zones.map((z, i) => (i ? '' : txt)); try { return await S.detectGame(null); } finally { R.readZones = keep; } };
  eq(await guess('ROSE TENTACULAIRE TERRE 1re Édition RGBT-FR007 [PLANTE/EFFET] ATK/2200 DEF/1200 41160533 ©1996 KAZUKI TAKAHASHI'), 'yugioh');
  eq(S.otherGames('RGBT-FR007', 'pokemon')[0], 'yugioh', 'Yu-Gi-Oh! essayé d’abord quand son code se lit');
});
test('Import : lignes Yu-Gi-Oh! (Collectr, Cardmarket)', async (App) => {
  await App.need('import');
  const I = App.importer;
  const rows = [['Product Name', 'Category', 'Set', 'Card Number', 'Rarity', 'Quantity'], ['Rose Tentacles', 'YuGiOh', 'Raging Battle', 'RGBT-EN007', 'Common', '1'], ['Blue-Eyes White Dragon', 'Yu-Gi-Oh!', 'Legend of Blue Eyes White Dragon', '', 'Ultra Rare', '1'], ['Pikachu', 'Pokemon', 'Base Set', '58/102', 'Common', '1']];
  const det = I.detect(rows), list = I.rowsOf ? I.rowsOf(rows, det) : null;
  ok(list && list.length === 3 && list[0].game === 'yugioh' && list[1].game === 'yugioh' && list[2].game !== 'yugioh', 'lignes reconnues comme Yu-Gi-Oh!');
  const m1 = await I.match(list[0]), m2 = await I.match(list[1]);
  eq([m1.status, m1.card.id], ['ok', 'RGBT-007'], 'par le code');
  ok(m2.card && m2.card.passcode === 89631139, `par le nom anglais : ${m2.card && m2.card.name}`);
});

// ---------- Riftbound : code imprimé lu sur la photo, combattant ----------
test('Riftbound : code imprimé lu même mal reconnu', (App) => {
  const c = (t) => App.games.get('riftbound').codesIn(t).map(([k]) => k);
  ok(c('OGN · 013/298 · FR').includes('OGN|013'), '« OGN · 013/298 »');
  ok(c('0GN - O31/298').includes('OGN|031'), 'lettres lues à la place des chiffres');
  ok(c('OGN • 238A/298').includes('OGN|238a'), 'version alternative « 238a »');
  ok(c('SFD · R02A').includes('SFD|R02a'), 'rune « R02a »');
  eq(c('Deal 3 to a unit at a battlefield.'), [], 'pas de code dans un texte de carte');
});
test('Riftbound : unité → combattant', (App) => {
  const f = App.battle.fighterRB({ id: 'x', name: 'Leona', kind: 'unit', might: 4, cost: 4, domains: ['order'], supertypes: ['champion'], text: '[Shield] (+1 ⚔ while I\'m a defender.)' });
  eq([f.hp, f.type, f.attacks.length], [130, 'lightning', 2]);
  ok(App.battle.canFight({ kind: 'unit', category: 'Unité', might: 2 }, 'riftbound') && !App.battle.canFight({ kind: 'spell', category: 'Sort' }, 'riftbound'), 'seules les unités combattent');
});
test('Riftbound : dos de carte reconnu (fond uni, filets dorés symétriques), pas une face colorée', async (App) => {
  await App.need('reco');
  const mk = (back) => { const c = document.createElement('canvas'); c.width = 126; c.height = 176; const g = c.getContext('2d');
    if (back) { g.fillStyle = '#16264a'; g.fillRect(0, 0, 126, 176); g.strokeStyle = '#e0b84a'; g.lineWidth = 3; g.strokeRect(10, 10, 106, 156); g.beginPath(); g.moveTo(63, 30); g.lineTo(105, 88); g.lineTo(63, 146); g.lineTo(21, 88); g.closePath(); g.stroke(); g.beginPath(); g.arc(63, 88, 30, 0, 7); g.stroke(); }
    else for (let i = 0; i < 40; i++) { g.fillStyle = `hsl(${i * 37 % 360} 70% 50%)`; g.fillRect((i % 6) * 21, Math.floor(i / 6) * 25, 21, 25); }
    return c; };
  const s = (c) => App.recognizer.backScoreOf(c, c.width, c.height, true, 'riftbound');
  ok(s(mk(true)) >= 0.6, `dos : ${s(mk(true)).toFixed(2)}`);
  ok(s(mk(false)) < 0.55, `face : ${s(mk(false)).toFixed(2)}`);
});
test('Capturer « Toutes » : licence devinée sur le texte d’une carte', async (App) => {
  await App.need('reco', 'scan');
  const S = App.views.scan, R = App.recognizer, keep = R.readZones;
  const guess = async (txt) => { R.readZones = async (b, zones) => zones.map((z, i) => (i ? '' : txt)); try { return await S.detectGame(null); } finally { R.readZones = keep; } };
  eq(await guess('UNITÉ PORO Poro ronchon OGN · 013/298 · FR ©2025RGI'), 'riftbound');
  eq(await guess('Smoker OP10-001 LEADER BANDAI'), 'onepiece');
  eq(await guess('Pikachu PV 60 Faiblesse Résistance Retraite Nintendo'), 'pokemon');
  eq(await guess('illisible'), '');
});
// v3.18 : détecteur de bords appris au labo (recognizer-edges.js) — une carte dessinée sur un fond (bordure noire, dessin,
// texte) doit être trouvée à 2 % près, même un peu tournée
test('bords d’une carte (détecteur appris)', async (App) => {
  await App.need('reco');
  const c = document.createElement('canvas'); c.width = 600; c.height = 780; const g = c.getContext('2d');
  g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, 600, 780);
  g.save(); g.translate(300, 390); g.rotate(0.03);
  const w = 400, h = w * 88 / 63;
  g.fillStyle = '#15151a'; g.beginPath(); g.roundRect(-w / 2, -h / 2, w, h, 18); g.fill();
  for (let i = 0; i < 30; i++) { g.fillStyle = `hsl(${i * 47 % 360} 60% 55%)`; g.fillRect(-w / 2 + 16 + (i % 6) * 61, -h / 2 + 16 + Math.floor(i / 6) * 60, 61, 60); }
  g.fillStyle = '#eee8dc'; g.fillRect(-w / 2 + 16, h / 2 - 220, w - 32, 200); g.fillStyle = '#333';
  for (let l = 0; l < 6; l++) g.fillRect(-w / 2 + 30, h / 2 - 200 + l * 28, 260 + (l % 3) * 30, 9);
  g.restore();
  const r = App.recognizer.findCard(c); ok(r, 'aucune carte trouvée');
  const want = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => [300 + x * Math.cos(0.03) - y * Math.sin(0.03), 390 + x * Math.sin(0.03) + y * Math.cos(0.03)]);
  const diag = Math.hypot(w, h), worst = Math.max(...r.quad.map(([x, y], j) => Math.hypot(x * 600 - want[j][0], y * 780 - want[j][1]))) / diag * 100;
  ok(worst < 2, `pire coin à ${worst.toFixed(1)} % de la diagonale`);
  // v3.20 : reclassement avec le cadre jaune de la caméra (carte seule) : même carte
  const r2 = App.recognizer.bestCardIn(c, { x: 0.1, y: 0.1, w: 0.8, h: 0.8 }); ok(r2, 'bestCardIn : rien');
  const worst2 = Math.max(...r2.quad.map(([x, y], j) => Math.hypot(x * 600 - want[j][0], y * 780 - want[j][1]))) / diag * 100;
  ok(worst2 < 2, `bestCardIn : pire coin à ${worst2.toFixed(1)} %`);
});
// v3.19 : chaque carte d'une page de classeur sur son propre bord (recognizer-page.js) — page dessinée : coutures soudées
// en pointillés clairs (comme les vraies feuilles), 9 cartes un peu décalées / tournées dans leur pochette, bandeau du
// nom bien net au milieu (piège de l'ancienne grille) ; chaque carte à 3 % près de la diagonale. (Faiblesse connue : des
// pochettes dessinées en rectangles fermés bien nets passent pour des cartes ; les vraies coutures ne le font pas.)
test('cartes d’une page de classeur, une par une', async (App) => {
  await App.need('reco');
  const c = document.createElement('canvas'); c.width = 900; c.height = 1200; const g = c.getContext('2d');
  g.fillStyle = '#4a4a50'; g.fillRect(0, 0, 900, 1200);
  const pw = 290, ph = 390, w = 252, h = w * 88 / 63, want = [];
  g.fillStyle = '#9a9aa2';
  for (let s = 1; s < 3; s++) { for (let y = 0; y < 1200; y += 9) g.fillRect(15 + s * (pw + 5) - 4, y, 3, 5); for (let x = 0; x < 900; x += 9) g.fillRect(x, 15 + s * (ph + 5) - 4, 5, 3); }
  for (let k = 0; k < 9; k++) {
    const i = k % 3, j = (k / 3) | 0, px = 15 + i * (pw + 5), py = 15 + j * (ph + 5);
    const a = ((k * 37) % 7 - 3) * 0.004, cx = px + pw / 2 + ((k * 13) % 5 - 2) * 3, cy = py + ph / 2 + ((k * 7) % 5 - 2) * 3;
    g.save(); g.translate(cx, cy); g.rotate(a);
    g.fillStyle = '#121216'; g.beginPath(); g.roundRect(-w / 2, -h / 2, w, h, 12); g.fill();
    g.fillStyle = `hsl(${k * 40} 55% 50%)`; g.fillRect(-w / 2 + 10, -h / 2 + 10, w - 20, h * 0.55);
    g.fillStyle = '#c0282c'; g.fillRect(-w / 2 + 10, -h / 2 + 10 + h * 0.55, w - 20, 24); // bandeau du nom
    g.fillStyle = '#efe8da'; g.fillRect(-w / 2 + 10, -h / 2 + 34 + h * 0.55, w - 20, h * 0.45 - 54); g.fillStyle = '#333';
    for (let l = 0; l < 4; l++) g.fillRect(-w / 2 + 22, -h / 2 + 50 + h * 0.55 + l * 18, 150 + (l % 2) * 40, 6);
    g.restore();
    want.push([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => [cx + x * Math.cos(a) - y * Math.sin(a), cy + x * Math.sin(a) + y * Math.cos(a)]));
  }
  const r = await App.recognizer.detectCards(c, 3, 3); ok(r && r.cells.length === 9, 'pas 9 cartes');
  const diag = Math.hypot(w, h);
  const errs = r.cells.map((cell, k) => Math.max(...cell.quad.map(([x, y], m) => Math.hypot(x * 900 - want[k][m][0], y * 1200 - want[k][m][1]))) / diag * 100);
  ok(Math.max(...errs) < 3, `pire carte à ${Math.max(...errs).toFixed(1)} % (${errs.map((e) => e.toFixed(1)).join(' ')})`);
});
// v3.20 : classeur ouvert (2 pages de 3 × 3 côte à côte, photo en largeur) : chaque page cherchée seule (detectSpread),
// 18 cartes, chacune à 4 % près de la diagonale ; cartes droites (rot 0)
test('classeur ouvert, 2 pages cherchées une par une', async (App) => {
  await App.need('reco');
  const c = document.createElement('canvas'); c.width = 1500; c.height = 1000; const g = c.getContext('2d');
  g.fillStyle = '#4a4a50'; g.fillRect(0, 0, 1500, 1000); g.fillStyle = '#18181c'; g.fillRect(735, 0, 30, 1000); // reliure
  const pw = 225, ph = 315, w = 196, h = w * 88 / 63, want = [];
  for (const ox of [30, 790]) {
    g.fillStyle = '#9a9aa2';
    for (let s = 1; s < 3; s++) { for (let y = 0; y < 1000; y += 9) g.fillRect(ox + s * (pw + 5) - 4, y, 3, 5); for (let x = ox; x < ox + 690; x += 9) g.fillRect(x, 15 + s * (ph + 5) - 4, 5, 3); }
    for (let k = 0; k < 9; k++) {
      const i = k % 3, j = (k / 3) | 0, cx = ox + i * (pw + 5) + pw / 2 + ((k * 13) % 5 - 2) * 2, cy = 15 + j * (ph + 5) + ph / 2 + ((k * 7) % 5 - 2) * 2;
      g.fillStyle = '#121216'; g.beginPath(); g.roundRect(cx - w / 2, cy - h / 2, w, h, 9); g.fill();
      g.fillStyle = `hsl(${k * 40 + ox} 55% 50%)`; g.fillRect(cx - w / 2 + 8, cy - h / 2 + 8, w - 16, h * 0.55);
      g.fillStyle = '#c0282c'; g.fillRect(cx - w / 2 + 8, cy - h / 2 + 8 + h * 0.55, w - 16, 18);
      g.fillStyle = '#efe8da'; g.fillRect(cx - w / 2 + 8, cy - h / 2 + 26 + h * 0.55, w - 16, h * 0.45 - 40);
      want.push([[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2]]);
    }
  }
  const r = await App.recognizer.detectSpread(c); ok(r && r.cells.length === 18, 'pas 18 cartes'); eq(r.rot, 0);
  const diag = Math.hypot(w, h), cen = (q) => [q.reduce((a, p) => a + p[0], 0) / 4, q.reduce((a, p) => a + p[1], 0) / 4];
  const errs = want.map((t) => { const ct = cen(t); let b = null, bd = 1e9; for (const cell of r.cells) { const q = cell.quad.map(([x, y]) => [x * 1500, y * 1000]), d = Math.hypot(cen(q)[0] - ct[0], cen(q)[1] - ct[1]); if (d < bd) { bd = d; b = q; } } return Math.max(...b.map((p, m) => Math.hypot(p[0] - t[m][0], p[1] - t[m][1]))) / diag * 100; });
  ok(Math.max(...errs) < 4, `pire carte à ${Math.max(...errs).toFixed(1)} %`);
});
