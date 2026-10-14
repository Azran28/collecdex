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
