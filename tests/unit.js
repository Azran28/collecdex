/*
 * Tests des fonctions (sans dessiner de page). Chaque test reçoit l'App du site testé.
 * Quand un comportement change exprès, mettre le test à jour en même temps.
 */

// ---------- Le site se charge ----------
test('le site se charge et tous les modules sont présents', (App, W) => {
  ok(App, 'App introuvable (erreur de syntaxe dans un fichier ?)');
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
