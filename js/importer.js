/*
 * Import d'une collection depuis un fichier (Cardmarket, Collectr, Pokellector, Dragon Shield, Excel / CSV / tableau collé).
 * 1) lecture du fichier : CSV (séparateur deviné) ou Excel .xlsx (lu ici même : un .xlsx est un zip de fichiers XML) ;
 * 2) colonnes reconnues par leur titre (anglais, français, allemand…), modifiables à la main ;
 * 3) chaque ligne est rapprochée d'une carte TCGdex : série (nom français OU anglais) + numéro, sinon nom ;
 * 4) les cartes importées sont ajoutées SANS photo et donc NON certifiées (item.imported = { from, at }).
 */
App.importer = (() => {
  const ad = () => App.games.get('pokemon');
  const norm = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const sim = (a, b) => App.util.similarity(a, b);

  // ---------- Lecture des fichiers ----------
  function decode(buf) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, ''); }
    catch (e) { return new TextDecoder('windows-1252').decode(buf); } // vieux fichiers Excel « CSV (séparateur : point-virgule) »
  }

  /** CSV / TSV / tableau collé depuis Excel → lignes de cellules (séparateur deviné, guillemets gérés) */
  function parseCSV(text) {
    text = String(text || '').replace(/\r\n?/g, '\n');
    // 1re ligne « sep=, » (exports Dragon Shield, Excel) : séparateur imposé
    let forced = null;
    const sm = text.match(/^\s*"?sep=(.)[^\n]*\n/i);
    if (sm) { forced = sm[1]; text = text.slice(sm[0].length); }
    const first = text.split('\n').find((l) => l.trim()) || '';
    const count = (ch) => first.split(ch).length - 1;
    const sep = ['\t', ';', ',', '|'].map((c) => [c, count(c)]).sort((a, b) => b[1] - a[1])[0];
    const S = forced || (sep && sep[1] ? sep[0] : ',');
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += ch;
      } else if (ch === '"' && cell === '') q = true;
      else if (ch === S) { row.push(cell); cell = ''; }
      else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c));
  }

  /** Fichier .zip (un .xlsx en est un) → { nom: () => Promise<Uint8Array> } */
  async function unzip(buf) {
    const u8 = new Uint8Array(buf), dv = new DataView(buf);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('fichier Excel illisible');
    const n = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const files = {};
    for (let k = 0; k < n; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
      const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
      const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nl)).replace(/\\/g, '/'); // certains outils écrivent « xl\worksheets\… »
      files[name] = async () => {
        const start = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true);
        const data = u8.subarray(start, start + csize);
        if (method === 0) return data;
        if (method !== 8) throw new Error('fichier Excel compressé autrement');
        if (typeof DecompressionStream === 'undefined') throw new Error('ton navigateur ne sait pas lire les fichiers Excel : enregistre-le en CSV');
        const out = await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer();
        return new Uint8Array(out);
      };
      p += 46 + nl + xl + cl;
    }
    return files;
  }

  /** Excel .xlsx → lignes de cellules de la 1re feuille */
  async function parseXLSX(buf) {
    const files = await unzip(buf);
    const xml = async (name) => (files[name] ? new DOMParser().parseFromString(new TextDecoder().decode(await files[name]()), 'application/xml') : null);
    const tags = (node, t) => [...node.getElementsByTagNameNS('*', t)];
    // 1re feuille du classeur (dans l'ordre des onglets)
    let sheet = null;
    try {
      const wb = await xml('xl/workbook.xml'), rels = await xml('xl/_rels/workbook.xml.rels');
      const first = wb && tags(wb, 'sheet')[0];
      const rid = first && (first.getAttribute('r:id') || [...first.attributes].find((a) => /:id$/.test(a.name))?.value);
      const rel = rid && rels && tags(rels, 'Relationship').find((r) => r.getAttribute('Id') === rid);
      if (rel) { const t = rel.getAttribute('Target').replace(/^\/?(xl\/)?/, ''); sheet = 'xl/' + t; }
    } catch (e) { /* on prend la 1re trouvée */ }
    if (!sheet || !files[sheet]) sheet = Object.keys(files).filter((f) => /^xl\/worksheets\/sheet\d+\.xml$/.test(f)).sort((a, b) => App.util.numSort(a, b))[0];
    if (!sheet) throw new Error('aucune feuille trouvée dans ce fichier Excel');
    const ss = await xml('xl/sharedStrings.xml');
    const shared = ss ? tags(ss, 'si').map((si) => tags(si, 't').map((t) => t.textContent).join('')) : [];
    const doc = await xml(sheet);
    const rows = [];
    const colOf = (ref) => { let c = 0; for (const ch of String(ref).replace(/\d+/g, '')) c = c * 26 + (ch.charCodeAt(0) - 64); return c - 1; };
    for (const r of tags(doc, 'row')) {
      const row = [];
      tags(r, 'c').forEach((c, j) => {
        const t = c.getAttribute('t'), v = tags(c, 'v')[0];
        let val = '';
        if (t === 's') val = shared[+(v && v.textContent)] || '';
        else if (t === 'inlineStr') val = tags(c, 't').map((x) => x.textContent).join('');
        else if (t === 'b') val = v && v.textContent === '1' ? 'TRUE' : 'FALSE';
        else val = v ? v.textContent : '';
        const ix = c.getAttribute('r') ? colOf(c.getAttribute('r')) : j;
        row[ix] = String(val).trim();
      });
      for (let k = 0; k < row.length; k++) if (row[k] == null) row[k] = '';
      if (row.some((x) => x)) rows.push(row);
    }
    return rows;
  }

  /** Fichier choisi → lignes de cellules */
  async function readFile(file) {
    const buf = await file.arrayBuffer();
    const head = new Uint8Array(buf.slice(0, 4));
    if (head[0] === 0x50 && head[1] === 0x4b) return parseXLSX(buf); // « PK » : zip → Excel .xlsx
    if (head[0] === 0xd0 && head[1] === 0xcf) throw new Error('ancien format Excel (.xls) : ouvre-le et enregistre-le en .xlsx ou en CSV');
    return parseCSV(decode(buf));
  }

  // ---------- Colonnes ----------
  // titres possibles (comparés sans accents ni ponctuation)
  const FIELDS = {
    name: ['name', 'product name', 'card name', 'english name', 'local name', 'locname', 'enname', 'nom', 'nom de la carte', 'carte', 'card', 'pokemon', 'produit', 'product', 'kartenname', 'titre', 'title'],
    set: ['set', 'set name', 'expansion', 'exp name', 'expansion name', 'edition', 'serie', 'series', 'extension', 'nom de la serie', 'nom de l extension', 'collection', 'erweiterung', 'set_name'],
    number: ['card number', 'number', 'no', 'nr', 'num', 'numero', 'n', 'n de la carte', 'numero de carte', 'collector number', 'collectors number', 'cn', 'nummer', 'card no', 'card'],
    qty: ['quantity', 'qty', 'owned', 'quantity owned', 'qty owned', 'have', 'collected', 'amount', 'count', 'quantite', 'qte', 'nombre', 'nb', 'exemplaires', 'copies', 'anzahl', 'menge', 'stock', 'total quantity'],
    lang: ['language', 'langue', 'lang', 'idlanguage', 'sprache', 'card language'],
    cond: ['condition', 'card condition', 'etat', 'etat de la carte', 'zustand', 'cond'],
    grade: ['grade', 'grading', 'graded', 'note', 'gradation'],
    version: ['variance', 'variant', 'variation', 'version', 'versions', 'printing', 'finish', 'foil', 'foil?', 'isfoil', 'is foil', 'holo', 'type', 'reverse', 'edition type'],
    firstEd: ['isfirsted', 'first edition', '1st edition', 'first ed', '1st ed', 'premiere edition', '1ere edition', 'edition 1'],
    category: ['category', 'categorie', 'game', 'jeu', 'product line', 'productline'],
  };
  const LABELS = { name: 'Nom de la carte', set: 'Série', number: 'Numéro', qty: 'Quantité', lang: 'Langue', cond: 'État', grade: 'Gradée (PSA…)', version: 'Version (holo, reverse…)', firstEd: '1ʳᵉ édition', category: 'Jeu / catégorie' };
  const ORDER = ['name', 'set', 'number', 'qty', 'version', 'lang', 'cond', 'grade', 'firstEd', 'category'];

  /** Ligne de titres + correspondance colonne → champ */
  function detect(rows) {
    let best = { score: 0, at: -1, map: {} };
    for (let r = 0; r < Math.min(10, rows.length); r++) {
      const map = {}; let score = 0;
      const heads = rows[r].map((h) => norm(String(h == null ? '' : h).replace(/#/g, ' number '))); // « Card # », « # » → numéro
      // 1) titres exacts, puis 2) titres qui commencent / finissent par un mot connu (« Card Condition », « Nom FR »)
      for (const pass of [0, 1]) {
        heads.forEach((n, j) => {
          if (!n || Object.values(map).includes(j)) return;
          for (const f of ORDER) {
            if (map[f] != null) continue;
            const ok = pass === 0 ? FIELDS[f].includes(n) : n.length > 3 && FIELDS[f].some((w) => w.length > 3 && (n.startsWith(w + ' ') || n.endsWith(' ' + w)));
            if (ok) { map[f] = j; score++; break; }
          }
        });
      }
      if (score > best.score) best = { score, at: r, map };
    }
    if (best.score >= 2 && best.map.name != null) return { header: best.at, map: best.map, cols: rows[best.at].map((h, j) => h || `Colonne ${j + 1}`) };
    // pas de titres : on devine d'après le contenu
    const width = Math.max(...rows.slice(0, 30).map((r) => r.length));
    const sample = rows.slice(0, 30), map = {};
    const ratio = (j, re) => sample.filter((r) => re.test(r[j] || '')).length / Math.max(1, sample.length);
    for (let j = 0; j < width; j++) {
      if (map.number == null && ratio(j, /^[A-Za-z]{0,4}\d{1,3}[a-z]?\s*\/\s*[A-Za-z]{0,4}\d{1,3}$/) > 0.5) map.number = j;
      else if (map.qty == null && ratio(j, /^\d{1,3}$/) > 0.7) map.qty = j;
    }
    let longest = -1, len = 0;
    for (let j = 0; j < width; j++) { if (j === map.number || j === map.qty) continue; const l = sample.reduce((s, r) => s + (/[a-z]/i.test(r[j] || '') ? 1 : 0), 0); if (l > len) { len = l; longest = j; } }
    if (longest >= 0) map.name = longest;
    return { header: -1, map, cols: Array.from({ length: width }, (_, j) => `Colonne ${String.fromCharCode(65 + (j % 26))}`) };
  }

  /** Source reconnue d'après les titres (pour les réglages par défaut et le texte) */
  function sourceOf(cols) {
    const h = cols.map(norm).join('|');
    if (/portfolio name|variance|average cost paid|market price/.test(h)) return 'collectr';
    if (/folder name|trade quantity/.test(h)) return 'dragonshield';
    if (/pokellector/.test(h)) return 'pokellector';
    if (/idproduct|idarticle|exp name|english name|local name|isfoil|foil \?/.test(h)) return 'cardmarket';
    return 'tableau';
  }

  // ---------- Valeurs ----------
  const LANGS = { 1: 'en', 2: 'fr', 3: 'de', 4: 'es', 5: 'it', 6: 'zh', 7: 'ja', 8: 'pt', 9: 'ru', 10: 'ko', 11: 'zh' };
  function langOf(v, def) {
    const n = norm(v); if (!n) return def;
    if (LANGS[n]) return LANGS[n];
    if (/^(fr|fra|french|francais|franzosisch)/.test(n)) return 'fr';
    if (/^(en|eng|english|anglais|englisch)/.test(n)) return 'en';
    if (/^(ja|jp|jap|japanese|japonais)/.test(n)) return 'ja';
    if (/^(de|ger|german|allemand|deutsch)/.test(n)) return 'de';
    if (/^(es|spa|spanish|espagnol)/.test(n)) return 'es';
    if (/^(it|ita|italian|italien)/.test(n)) return 'it';
    if (/^(pt|por|portug)/.test(n)) return 'pt';
    if (/^(ko|kor|korean|coreen)/.test(n)) return 'ko';
    if (/^(zh|chi|chinese|chinois)/.test(n)) return 'zh';
    return def;
  }
  /** État (échelle Cardmarket du site : MT NM EX GD LP PL PO) */
  function condOf(v, g) {
    const gm = String(g || v || '').match(/\b(PSA|CGC|BGS|PCA|BECKETT)\s*:?\s*(\d+(?:[.,]5)?)\b/i);
    if (gm) return { kind: 'graded', company: gm[1].toUpperCase() === 'BECKETT' ? 'BGS' : gm[1].toUpperCase(), grade: +gm[2].replace(',', '.') };
    const n = norm(String(v || '').replace(/([a-z])([A-Z])/g, '$1 $2')); if (!n) return null; // « NearMint », « LightPlayed » (Dragon Shield)
    const code = n.toUpperCase();
    if (['MT', 'NM', 'EX', 'GD', 'LP', 'PL', 'PO'].includes(code)) return { kind: 'raw', grade: code };
    // expressions les plus précises d'abord (« Moderately Played » commence par un m, « Near Mint » contient « mint »)
    const R = [
      [/near mint|comme neuf|quasi neuf|^neuf/, 'NM'], [/light(?:ly)? played|excellent|tres bon/, 'EX'], [/moderately played/, 'LP'],
      [/heavily played|^played|^joue|bien use/, 'PL'], [/damaged|poor|abime|endommage/, 'PO'], [/^(good|bon|bon etat)$/, 'GD'], [/^(mint|m|parfait)$/, 'MT'],
    ];
    const hit = R.find(([re]) => re.test(n));
    return hit ? { kind: 'raw', grade: hit[1] } : null;
  }
  const yes = (v) => /^(x|1|true|vrai|yes|oui|ja|y|o|foil|holo|reverse)$/i.test(String(v || '').trim());
  /** Version demandée : normal / holo / reverse, + 1re édition */
  function versionOf(v, firstEd, colName) {
    const n = norm(v), out = { base: null, first: yes(firstEd) };
    if (/1st|first|1re|1ere|premiere|edition 1/.test(n)) out.first = true;
    if (/reverse/.test(n)) out.base = 'reverse';
    else if (/holo|foil/.test(n)) out.base = 'holo';
    else if (/normal|unlimited|non holo|standard/.test(n)) out.base = 'normal';
    else if (yes(v)) out.base = /reverse/.test(norm(colName)) ? 'reverse' : 'foil'; // colonne « Foil? » cochée
    return out;
  }
  /** « 4/102 », « SV049/SV094 », « 004 », « TG12/TG30 » → { n: '4', total: 102 } */
  function numOf(v) {
    const s = String(v || '').trim(); if (!s) return null;
    const m = s.match(/^#?\s*([A-Za-z]{0,5}-?\d{1,4}[a-z]?)\s*(?:\/\s*([A-Za-z]{0,5}\d{1,4}))?$/);
    if (!m) return null;
    const tot = m[2] ? parseInt(m[2].replace(/\D/g, ''), 10) : null;
    return { n: m[1].replace('-', ''), total: Number.isFinite(tot) ? tot : null };
  }
  const normNum = (n) => String(n || '').toUpperCase().replace(/^([A-Z]*)0+(\d)/, '$1$2');
  /** nom nettoyé (« Charizard - 4/102 (Holo) [1st Edition] » → « charizard ») + numéro trouvé dedans */
  function cleanName(v) {
    let s = String(v || '');
    let num = null;
    const m = s.match(/(?:#|\s-\s|\s)([A-Za-z]{0,5}\d{1,4}[a-z]?\s*\/\s*[A-Za-z]{0,5}\d{1,4})\b/);
    if (m) { num = numOf(m[1].replace(/\s+/g, '')); s = s.replace(m[0], ' '); }
    s = s.replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').replace(/\s-\s.*$/, ' ').replace(/\b(reverse holo|reverse|holofoil|holo|1st edition|first edition|shadowless)\b/gi, ' ');
    return { name: s.replace(/\s+/g, ' ').trim(), num };
  }
  const SEALED = /\b(booster|display|elite trainer|etb|coffret|box|bundle|tin|pokebox|blister|deck|theme deck|starter|collection box|pack|sleeve|binder|classeur|portfolio|playmat)\b/i;

  /** Lignes du fichier → lignes à importer ({ name, setName, num, qty, lang, cond, ver, skip }) */
  function rowsOf(rows, det, opts = {}) {
    const m = det.map, get = (r, f) => (m[f] != null ? r[m[f]] || '' : '');
    const out = [];
    rows.forEach((r, i) => {
      if (i <= det.header) return;
      let rawName = get(r, 'name');
      if (!rawName) return;
      // liste en texte (« 2x Dracaufeu 4/102 », « Dracaufeu x2 ») : quantité dans le nom
      let qIn = null;
      const qa = m.qty == null && rawName.match(/^\s*(\d{1,3})\s*[x×]\s+(.+)$/i), qb = m.qty == null && !qa && rawName.match(/^(.+?)\s+[x×]\s*(\d{1,3})\s*$/i);
      if (qa) { qIn = +qa[1]; rawName = qa[2]; } else if (qb) { qIn = +qb[2]; rawName = qb[1]; }
      const cn = cleanName(rawName);
      const num = numOf(get(r, 'number')) || cn.num;
      const q = parseInt(String(get(r, 'qty')).replace(/[^\d]/g, ''), 10);
      const row = {
        line: i + 1, raw: rawName, name: cn.name || rawName, setName: get(r, 'set'), num, qty: m.qty != null ? (Number.isFinite(q) ? q : 0) : qIn || 1,
        lang: langOf(get(r, 'lang'), opts.lang || 'fr'), cond: condOf(get(r, 'cond'), get(r, 'grade')),
        ver: versionOf(get(r, 'version'), get(r, 'firstEd'), det.cols[m.version] || ''),
        skip: null,
      };
      const cat = norm(get(r, 'category'));
      if (cat && !/pok/.test(cat)) row.skip = 'autre jeu';
      else if (/japan|japon/.test(cat) || row.lang === 'ja') row.skip = 'carte japonaise (pas encore prise en charge)';
      else if (!num && SEALED.test(rawName)) row.skip = 'produit scellé, pas une carte';
      else if (m.qty != null && row.qty <= 0) row.skip = 'quantité 0';
      out.push(row);
    });
    return out;
  }

  // ---------- Rapprochement avec les cartes TCGdex ----------
  let setIdx = null;
  async function sets() {
    if (setIdx) return setIdx;
    const [fr, en] = await Promise.all([ad().listSets(), ad().setNamesEn().catch(() => [])]);
    const enById = Object.fromEntries(en.map((s) => [s.id, s]));
    setIdx = fr.map((s) => ({ s, names: [...new Set([norm(s.name), enById[s.id] ? norm(enById[s.id].name) : ''].filter(Boolean))], official: s.official || (enById[s.id] && enById[s.id].official) || 0 }));
    return setIdx;
  }
  /** « SV03: Obsidian Flames », « Scarlet & Violet: 151 », « Base Set (Shadowless) », « Évolutions » → séries possibles */
  async function findSets(name, total) {
    const idx = await sets();
    const raw = String(name || '').replace(/^\s*[A-Za-z]{1,6}\d{0,3}(?:\.\d)?[a-z]?\s*:\s*/, '').replace(/\bpok[eé]mon\b|\btcg\b|\bjcc\b/gi, ' ');
    const q = norm(raw); if (!q) return [];
    let hits = idx.filter((x) => x.names.includes(q));
    // nom précédé de la grande série (« Scarlet & Violet 151 » → « 151 », « Sword & Shield Evolving Skies ») : fin du texte d'abord
    if (!hits.length) {
      const w = q.split(' ');
      for (let k = 1; k < w.length && !hits.length; k++) { const tail = w.slice(k).join(' '); hits = idx.filter((x) => x.names.includes(tail)); }
    }
    if (!hits.length) {
      // nom de la série contenu dans le texte (le plus long : « Base Set 2 » plutôt que « Base Set »)
      const pad = ` ${q} `;
      const inside = idx.map((x) => ({ x, l: Math.max(0, ...x.names.filter((n) => n.length >= 3 && pad.includes(` ${n} `)).map((n) => n.length)) })).filter((y) => y.l > 0);
      const top = Math.max(0, ...inside.map((y) => y.l));
      hits = inside.filter((y) => y.l === top && top >= Math.min(5, q.length)).map((y) => y.x);
    }
    if (!hits.length) {
      const sc = idx.map((x) => ({ x, v: Math.max(...x.names.map((n) => sim(n, q))) })).sort((a, b) => b.v - a.v);
      if (sc[0] && sc[0].v >= 0.82) hits = sc.filter((y) => y.v >= sc[0].v - 0.02).map((y) => y.x);
    }
    if (total && hits.length > 1) { const same = hits.filter((x) => x.official === total); if (same.length) hits = same; }
    return hits.slice(0, 4).map((x) => x.s);
  }
  const setCache = new Map(), enCache = new Map();
  const getSet = (id) => { if (!setCache.has(id)) setCache.set(id, ad().getSet(id).catch(() => null)); return setCache.get(id); };
  const getEn = (id) => { if (!enCache.has(id)) enCache.set(id, ad().setCardsEn(id).catch(() => [])); return enCache.get(id); };
  /** même nom ? (français ou anglais, sans « ex », « V » collés…) */
  // nom contenu comme mot entier (« Florizarre » → « Florizarre EX », « M-Florizarre EX ») : proche, mais jamais « sûr »
  const nameScore = (q, ...names) => Math.max(0, ...names.filter(Boolean).map((n) => { const a = norm(n); return a === q ? 1 : q.length >= 3 && ` ${a} `.includes(` ${q} `) ? Math.max(0.85, sim(a, q)) : sim(a, q); }));

  /** Une ligne → { status: 'ok'|'verif'|'choix'|'introuvable', card, set, cands } */
  async function match(row) {
    const q = norm(row.name);
    const pick = async (setId, cardId) => { const st = await getSet(setId); const c = st && st.cards.find((x) => x.id === cardId); return c ? { card: c, set: st } : null; };
    const withNames = async (st) => { const en = await getEn(st.id); const enBy = Object.fromEntries(en.map((c) => [c.id, c.name])); return st.cards.map((c) => ({ c, s: nameScore(q, c.name, enBy[c.id]) })); };
    const setsFound = row.setName ? await findSets(row.setName, row.num && row.num.total) : [];
    // 1) série + numéro
    if (setsFound.length && row.num) {
      const hits = [];
      for (const s of setsFound) {
        const st = await getSet(s.id); if (!st) continue;
        const c = st.cards.find((x) => normNum(x.localId) === normNum(row.num.n));
        if (c) hits.push({ card: c, set: st });
      }
      if (hits.length) {
        const scored = await Promise.all(hits.map(async (h) => ({ ...h, s: nameScore(q, h.card.name, ((await getEn(h.set.id)).find((x) => x.id === h.card.id) || {}).name) })));
        scored.sort((a, b) => b.s - a.s);
        const best = scored[0];
        return { status: best.s >= 0.6 ? 'ok' : 'verif', card: best.card, set: best.set, cands: scored.slice(1).map((x) => ({ card: x.card, set: x.set })), why: best.s >= 0.6 ? '' : 'le nom ne correspond pas tout à fait au numéro' };
      }
    }
    // 2) série + nom
    if (setsFound.length) {
      let all = [];
      for (const s of setsFound) { const st = await getSet(s.id); if (st) all.push(...(await withNames(st)).map((x) => ({ card: x.c, set: st, s: x.s }))); }
      all = all.filter((x) => x.s >= 0.8).sort((a, b) => b.s - a.s);
      const exact = all.filter((x) => x.s === 1);
      const list = exact.length ? exact : all.slice(0, 6);
      if (list.length === 1) return { status: exact.length ? 'ok' : 'verif', card: list[0].card, set: list[0].set, cands: [] };
      if (list.length > 1) return { status: 'choix', card: list[0].card, set: list[0].set, cands: list.slice(1, 12).map((x) => ({ card: x.card, set: x.set })), why: 'plusieurs cartes de ce nom dans la série' };
    }
    // 3) nom seul (partout), filtré par numéro et nombre de cartes de la série
    if (q.length < 2) return { status: 'introuvable', why: 'nom vide' };
    const [en, fr] = await Promise.all([ad().searchEn(row.name).catch(() => []), ad().search({ name: row.name, en: false }).catch(() => [])]);
    const ids = new Map();
    for (const c of en) ids.set(c.id, { setId: c.setId, localId: c.localId, s: nameScore(q, c.name) });
    for (const c of fr) { const prev = ids.get(c.id); const s = nameScore(q, c.name); if (!prev || prev.s < s) ids.set(c.id, { setId: c.setId, localId: c.localId, s }); }
    let cands = [...ids.entries()].map(([id, v]) => ({ id, ...v })).filter((x) => x.s >= 0.8);
    if (row.num) {
      const byNum = cands.filter((x) => normNum(x.localId) === normNum(row.num.n));
      if (byNum.length) cands = byNum;
      if (row.num.total && cands.length > 1) { const idx = await sets(); const off = Object.fromEntries(idx.map((x) => [x.s.id, x.official])); const t = cands.filter((x) => off[x.setId] === row.num.total); if (t.length) cands = t; }
    }
    const shown = new Set((await sets()).map((x) => x.s.id));
    cands = cands.filter((x) => shown.has(x.setId)).sort((a, b) => b.s - a.s);
    const exact = cands.filter((x) => x.s === 1);
    if (exact.length) cands = exact;
    const full = (await Promise.all(cands.slice(0, 12).map((x) => pick(x.setId, x.id)))).filter(Boolean);
    if (!full.length) return { status: 'introuvable', why: row.setName && !setsFound.length ? `série « ${row.setName} » inconnue` : 'carte introuvable' };
    // une seule carte, ou une seule au bon numéro : sûre
    if (full.length === 1 && (row.num || exact.length)) return { status: row.num ? 'ok' : 'verif', card: full[0].card, set: full[0].set, cands: [] };
    // les plus récentes d'abord (on possède plus souvent une carte récente)
    full.sort((a, b) => (b.set.releaseDate || '').localeCompare(a.set.releaseDate || ''));
    return { status: full.length === 1 ? 'verif' : 'choix', card: full[0].card, set: full[0].set, cands: full.slice(1).map((x) => ({ card: x.card, set: x.set })), why: !row.setName ? (full.length > 1 ? 'série non indiquée' : '') : setsFound.length ? `pas de carte de ce nom dans « ${setsFound[0].name} »` : `série « ${row.setName} » pas reconnue` };
  }

  /** Toutes les lignes, 4 à la fois, avec la progression */
  async function matchAll(rows, onProgress) {
    let done = 0;
    await App.util.pool(rows.filter((r) => !r.skip), 4, async (r) => {
      try { Object.assign(r, await match(r)); } catch (e) { console.warn('import', e); r.status = 'introuvable'; r.why = 'erreur de connexion'; }
      done++; if (onProgress) onProgress(done);
    });
    for (const r of rows) if (r.skip) r.status = 'ignoree';
    return rows;
  }

  /** Version à enregistrer, parmi celles qui existent pour la carte */
  function variantFor(row, card) {
    const v = card.variants || null, out = [];
    let base = row.ver.base;
    if (base === 'foil') base = v && v.reverse && !(v.holo && !v.normal) ? 'reverse' : 'holo';
    if (base && (!v || v[base])) out.push(base);
    if (row.ver.first && (!v || v.firstEdition)) out.push('firstEdition');
    return out;
  }

  /**
   * Ajoute les lignes choisies à la collection.
   * mode si la carte est déjà dans ton Dex : 'keep' (on n'y touche pas), 'add' (+ quantités), 'max' (la plus grande quantité)
   */
  async function apply(rows, { mode = 'keep', from = 'tableau', onProgress } = {}) {
    // plusieurs lignes pour la même carte (normale + reverse…) : on additionne
    const byId = new Map();
    for (const r of rows) {
      if (!r.use || !r.card) continue;
      const g = byId.get(r.card.id) || { card: r.card, set: r.set, qty: 0, vars: new Set(), lang: r.lang, cond: r.cond };
      g.qty += Math.max(1, r.qty || 1);
      variantFor(r, r.card).forEach((x) => g.vars.add(x));
      if (!g.cond && r.cond) g.cond = r.cond;
      byId.set(r.card.id, g);
    }
    const keys = [], stats = { added: 0, updated: 0, kept: 0 };
    let n = 0;
    for (const g of byId.values()) {
      const key = App.col.keyOf('pokemon', g.card.id), cur = App.col.byKey(key);
      const lang = g.lang === 'fr' ? 'fr' : 'en'; // les visuels existent en français ou en anglais
      if (cur && cur.qty > 0) {
        if (mode === 'keep') { stats.kept++; }
        else {
          const qty = mode === 'add' ? cur.qty + g.qty : Math.max(cur.qty, g.qty);
          await App.col.update(key, { qty, variants: [...new Set([...(cur.variants || []), ...g.vars])] });
          stats.updated++; keys.push(key);
        }
      } else {
        const set = { id: g.set.id, name: g.set.name, symbol: g.set.symbol, logo: g.set.logo, official: g.set.official, group: g.set.group };
        await App.col.add('pokemon', { ...g.card, serieId: g.card.serieId || (g.set.group && g.set.group.id) || '' }, set, { qty: g.qty, lang });
        await App.col.update(key, { variants: [...g.vars], ...(g.cond ? { cond: g.cond } : {}), imported: { from, at: Date.now() } });
        stats.added++; keys.push(key);
      }
      if (onProgress) onProgress(++n, byId.size);
    }
    if (keys.length) App.col.refreshPrices(keys, 'Prix des cartes importées').catch(() => {});
    return stats;
  }

  const SOURCES = { collectr: 'Collectr', cardmarket: 'Cardmarket', pokellector: 'Pokellector', dragonshield: 'Dragon Shield', tableau: 'un tableau' };
  return { readFile, parseCSV, detect, sourceOf, rowsOf, matchAll, match, apply, variantFor, FIELDS, LABELS, ORDER, SOURCES, _t: { numOf, cleanName, condOf, langOf, versionOf, findSets, norm } };
})();
