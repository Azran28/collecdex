/*
 * Reconnaissance d'une carte — partie 1/5 : lecture du texte (Tesseract), images TCGdex, analyse du texte lu.
 * Les parties (dans cet ordre dans index.html) : recognizer-text.js, recognizer-geometry.js (grille, bords, découpe),
 * recognizer-image.js (empreintes, dos, pochette vide), recognizer-versions.js (holo, reverse, 1re édition),
 * recognizer.js (recherche de la carte, App.recognizer). Elles se partagent App.recognizerParts.
 */
(() => {
  const { similarity, norm } = App.util;
  const game = 'pokemon';
  const ad = () => App.games.get(game);
  let worker = null, workerP = null, onStatus = null;
  let validTotals = new Set();

  const loadTesseract = () => new Promise((resolve, reject) => {
    if (window.Tesseract) return resolve(window.Tesseract);
    const s = document.createElement('script');
    // version figée + empreinte : le navigateur refuse le fichier s'il a été modifié sur le CDN
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
    s.integrity = 'sha384-GJqSu7vueQ9qN0E9yLPb3Wtpd7OrgK8KmYzC8T1IysG1bcvxvIO4qtYR/D3A991F';
    s.crossOrigin = 'anonymous';
    s.onload = () => resolve(window.Tesseract);
    s.onerror = () => reject(new Error('Impossible de charger le module de lecture (connexion internet ?)'));
    document.head.appendChild(s);
  });
  const traduire = (s) => ({ 'loading tesseract core': 'Chargement du lecteur', 'initializing tesseract': 'Initialisation', 'loading language traineddata': 'Chargement du français', 'initializing api': 'Préparation' }[s] || s);
  const status = (msg) => { if (onStatus) onStatus(msg); };

  /**
   * Lecteurs de texte : 2 en même temps quand l'appareil a assez de cœurs (téléphones récents, PC) ;
   * worker.recognize(image) prend le premier lecteur libre.
   */
  async function getWorker() {
    if (worker) return worker;
    if (!workerP) {
      workerP = (async () => {
        const T = await loadTesseract();
        const opts = { logger: (m) => { if (m.status && m.status !== 'recognizing text') status(`${traduire(m.status)} ${m.progress ? Math.round(m.progress * 100) + ' %' : ''}`); } };
        const n = (navigator.hardwareConcurrency || 2) >= 4 ? 2 : 1;
        const ws = await Promise.all(Array.from({ length: n }, (_, i) => T.createWorker('fra', 1, i ? {} : opts)));
        const busy = ws.map(() => false), psm = ws.map(() => '3'), queue = [];
        let jobs = 0, retired = false;
        const pump = () => {
          for (let i = 0; i < ws.length; i++) {
            if (busy[i] || !queue.length) continue;
            const job = queue.shift(); busy[i] = true; jobs++;
            // mode de découpe du texte : '3' automatique (par défaut), '6' un seul bloc (zone des attaques)
            const want = job.psm || '3';
            const ready = psm[i] === want ? Promise.resolve() : ws[i].setParameters({ tessedit_pageseg_mode: want }).then(() => { psm[i] = want; });
            ready.then(() => ws[i].recognize(job.img)).then(job.res, job.rej).finally(() => { busy[i] = false; pump(); recycle(); });
          }
        };
        // les lecteurs Tesseract s'encrassent à la longue (mesuré : 0,55 s → 4,6 s par carte après quelques centaines
        // de lectures) : après 300 lectures, dès qu'ils sont au repos, on les remplace par des neufs
        const recycle = () => {
          if (retired || jobs < 300 || queue.length || busy.some(Boolean)) return;
          retired = true;
          if (worker === pool) { worker = null; workerP = null; }
          ws.forEach((w) => w.terminate());
        };
        const pool = {
          size: n,
          recognize: (img, psm) => new Promise((res, rej) => { if (retired) { getWorker().then((w) => w.recognize(img, psm)).then(res, rej); return; } queue.push({ img, psm, res, rej }); pump(); }),
          terminate: () => ws.forEach((w) => w.terminate()),
        };
        worker = pool;
        ad().listSets().then((sets) => { validTotals = new Set(sets.map((x) => x.official)); }).catch(() => {});
        return worker;
      })().catch((e) => { workerP = null; throw e; });
    }
    return workerP;
  }

  /**
   * Découpe une zone de la carte, l'agrandit et la rend lisible :
   * gris, puis « niveaux automatiques » (le plus sombre devient noir, le plus clair blanc),
   * ce qui compense une zone trop sombre ou trop éclairée. Variantes : noir/blanc (otsu), inversé (texte blanc).
   */
  function band(img, y0, y1, scale, mode = 'sharp', x0 = 0, x1 = 1) {
    const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
    const sx = W * x0, sw = W * (x1 - x0), sy = H * y0, sh = H * (y1 - y0);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(sw * scale)); c.height = Math.max(1, Math.round(sh * scale));
    const g = c.getContext('2d', { willReadFrequently: true });
    g.imageSmoothingQuality = 'high';
    g.filter = mode === 'invert' ? 'grayscale(1) invert(1)' : 'grayscale(1)';
    g.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
    const d = g.getImageData(0, 0, c.width, c.height), p = d.data, n = p.length / 4;
    const hist = new Array(256).fill(0);
    for (let i = 0; i < n; i++) hist[p[i * 4]]++;
    // niveaux automatiques : 2 % les plus sombres → noir, 2 % les plus clairs → blanc
    let lo = 0, hi = 255, acc = 0;
    for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc > n * 0.02) { lo = i; break; } }
    acc = 0;
    for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc > n * 0.02) { hi = i; break; } }
    const span = Math.max(20, hi - lo);
    const lut = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      let v = Math.min(1, Math.max(0, (i - lo) / span));
      v = v < 0.5 ? 2 * v * v : 1 - 2 * (1 - v) * (1 - v); // courbe en S : plus de contraste au milieu
      lut[i] = Math.round(v * 255);
    }
    if (mode === 'otsu') {
      const h2 = new Array(256).fill(0);
      for (let i = 0; i < n; i++) h2[lut[p[i * 4]]]++;
      let sum = 0; for (let i = 0; i < 256; i++) sum += i * h2[i];
      let sumB = 0, wB = 0, best = 0, th = 128;
      for (let i = 0; i < 256; i++) {
        wB += h2[i]; if (!wB) continue; const wF = n - wB; if (!wF) break;
        sumB += i * h2[i]; const mB = sumB / wB, mF = (sum - sumB) / wF, v = wB * wF * (mB - mF) ** 2;
        if (v > best) { best = v; th = i; }
      }
      for (let i = 0; i < 256; i++) lut[i] = lut[i] > th ? 255 : 0;
    }
    for (let i = 0; i < n; i++) { const v = lut[p[i * 4]]; p[i * 4] = p[i * 4 + 1] = p[i * 4 + 2] = v; }
    if (mode === 'unsharp') { // photo un peu floue : on renforce les contours (masque flou)
      const W2 = c.width, H2 = c.height, src = new Float32Array(n);
      for (let i = 0; i < n; i++) src[i] = p[i * 4];
      for (let y = 1; y < H2 - 1; y++) for (let x = 1; x < W2 - 1; x++) {
        const i = y * W2 + x;
        const blur = (src[i - W2 - 1] + src[i - W2] + src[i - W2 + 1] + src[i - 1] + src[i] + src[i + 1] + src[i + W2 - 1] + src[i + W2] + src[i + W2 + 1]) / 9;
        const v = Math.max(0, Math.min(255, src[i] + 1.6 * (src[i] - blur)));
        p[i * 4] = p[i * 4 + 1] = p[i * 4 + 2] = v;
      }
    }
    g.putImageData(d, 0, 0);
    return c;
  }

  /**
   * Visuel officiel en Blob. Le serveur d'images de TCGdex refuse parfois une requête au hasard
   * (en-tête CORS en double) : on réessaie, puis on tente un autre format (png) ou la taille « high ».
   */
  // disjoncteur : quand le serveur d'images refuse tout (panne passagère chez TCGdex), on arrête d'insister
  // 30 s et la reconnaissance se fait sur le texte seul (sinon chaque carte attendait 5 à 15 s de nouveaux essais)
  let imgFails = 0, imgPauseUntil = 0;
  async function fetchImage(url, force = false, once = false) {
    // visuel relayé (One Piece, images.weserv.nl) : la 1re demande d'une image peut être très lente → un seul essai, 10 s au plus
    // (sinon toute la page de classeur attendait une seule image), et le serveur de TCGdex n'est pas en cause
    if (/^https:\/\/images\.weserv\.nl\//.test(url)) {
      const ac = new AbortController(), t = setTimeout(() => ac.abort(), 10000);
      try { const r = await fetch(url, { signal: ac.signal }); return r.ok ? await r.blob() : null; } catch (e) { return null; } finally { clearTimeout(t); }
    }
    if (!force && Date.now() < imgPauseUntil) return null;
    // adresse devinée (carte sans visuel connu chez TCGdex) : une seule tentative, et un échec ne compte pas comme une panne
    // (avant : 4 tentatives de ~3 s chacune = 12 s perdues à chaque scan, et le disjoncteur sautait pour de faux)
    if (once) { try { const r = await fetch(url); return r.ok ? await r.blob() : null; } catch (e) { return null; } }
    const alts = [url, url, url.replace(/\.webp$/, '.png'), url.replace('/low.', '/high.')];
    for (let i = 0; i < alts.length; i++) {
      try { const r = await fetch(alts[i]); if (r.ok) { imgFails = 0; return await r.blob(); } if (r.status === 404 && i >= 2) return null; } catch (e) { /* on réessaie */ }
      if (!force && Date.now() < imgPauseUntil) return null;
      await new Promise((res) => setTimeout(res, 120 * (i + 1)));
    }
    if (++imgFails >= 6) { imgPauseUntil = Date.now() + 30000; imgFails = 0; console.warn('Serveur d\'images TCGdex indisponible : pause de 30 s'); }
    return null;
  }

  const loadImg = (blob) => new Promise((res, rej) => {
    const url = URL.createObjectURL(blob);
    const i = new Image();
    i.onload = () => { URL.revokeObjectURL(url); res(i); };
    i.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Image illisible')); };
    i.src = url;
  });

  /** Lit la carte : bande du nom (haut), plusieurs lectures du numéro (bas), texte complet */
  async function ocr(blob, { atkBand = false } = {}) {
    const w = await getWorker();
    const img = await loadImg(blob);
    status('Lecture de la carte…');
    const txt = (p) => p.then((r) => r.data.text || '', () => '');
    // tout est demandé d'un coup : les lecteurs libres se partagent le travail
    // (nom, nom avec contours renforcés pour les photos un peu floues, carte entière)
    const topP = Promise.all([txt(w.recognize(band(img, 0.02, 0.14, 2.5))), txt(w.recognize(band(img, 0.02, 0.13, 2.5, 'unsharp', 0, 0.8)))]);
    const fullP = txt(w.recognize(blob));
    // zone des attaques, contrastée et lue d'un bloc : sur un fond texturé (Akwakwak obscur, Métalosse δ) la lecture de la
    // carte entière n'en tirait presque rien ; ici « Troisième œil », « Super Psy 50 », « Écra-brûle 30+ » (~0,15 s)
    // Carte seule et rafale seulement : en classeur (cartes petites sur la photo) ce texte bruité faisait perdre des cartes sûres (09 : 4 → 2)
    const W0 = img.naturalWidth || img.width;
    const atkP = !atkBand ? Promise.resolve('') : txt(w.recognize(band(img, 0.46, 0.93, Math.min(3, Math.max(1, 1450 / W0))), '6'));
    // le numéro est en bas à gauche (ou à droite sur les anciennes cartes)
    // + lectures en couleurs inversées pour les numéros blancs des cartes « full art »
    const reads = [band(img, 0.85, 1, 3), band(img, 0.88, 1, 4, 'sharp', 0, 0.5), band(img, 0.85, 1, 3, 'otsu'), band(img, 0.88, 1, 4, 'sharp', 0.5, 1),
      band(img, 0.86, 1, 3, 'invert'), band(img, 0.88, 1, 4, 'invert', 0, 0.5)];
    let bottom = '';
    // on s'arrête dès que le même numéro « n/total » (total d'une vraie série) a été lu deux fois : plus rapide
    const seen = {};
    let twice = false;
    for (let i = 0; i < reads.length && !twice; i += w.size) {
      const ts = await Promise.all(reads.slice(i, i + w.size).map((r) => txt(w.recognize(r))));
      for (const t of ts) {
        bottom += t + '\n';
        for (const m of t.replace(/[Oo](?=\d)|(?<=\d)[Oo]/g, '0').matchAll(/(\d{1,3})\s*[\/⁄]\s*(\d{2,3})/g)) {
          const of = parseInt(m[2], 10), k = parseInt(m[1], 10) + '/' + of;
          if (!validTotals.has(of)) continue;
          seen[k] = (seen[k] || 0) + 1; if (seen[k] >= 2) twice = true;
        }
      }
    }
    const [tops, full, atk] = await Promise.all([topP, fullP, atkP]);
    // (texte des attaques à part : dans les lignes du nom, « Soins », « Dégâts »… faisaient chercher des cartes Dresseur)
    return { top: tops.join('\n'), bottom, full, atk };
  }

  function parse({ top, bottom, full, atk = '' }) {
    const fix = (t) => t.replace(/[Oo](?=\d)|(?<=\d)[Oo]/g, '0').replace(/[Il|](?=\d{2})/g, '1');
    // tous les « 025/165 » lus ; on garde le plus fréquent, en préférant un total qui existe vraiment
    const nums = {};
    for (const t of [bottom, full]) for (const m of fix(t).matchAll(/(\d{1,3})\s*[\/⁄]\s*(\d{2,3})/g)) {
      const n = parseInt(m[1], 10), of = parseInt(m[2], 10), k = `${n}/${of}`;
      nums[k] = nums[k] || { n, of, raw: m[1], votes: 0 };
      nums[k].votes += 1 + (validTotals.has(of) ? 2 : 0) + (n <= of + 120 ? 0.5 : 0);
    }
    // barre oblique lue comme un chiffre (« 2074191 » pour 207/191 sur les cartes récentes) : seulement si le total existe, et en dernier recours
    if (!Object.keys(nums).length) for (const t of [bottom, full]) for (const m of fix(t).matchAll(/(?<!\d)(\d{1,3})[41l|I7](\d{3})(?!\d)/g)) {
      const n = parseInt(m[1], 10), of = parseInt(m[2], 10), k = `${n}/${of}`;
      if (!validTotals.has(of) || n < 1 || n > of + 120) continue;
      nums[k] = nums[k] || { n, of, raw: m[1], votes: 0, guess: true };
      nums[k].votes += 1;
    }
    const ranked = Object.values(nums).sort((a, b) => b.votes - a.votes);
    // « Évolution de Machopeur », « Placez Mackogneur sur… », « Evolves from … » : ce n'est pas le nom de la carte
    const noEvo = (l) => l.replace(/[ÉE]volution\s+d[e'’]\s*\S+/gi, ' ').replace(/Evolves\s+from\s+\S+/gi, ' ').replace(/Placez\s+\S+(\s+sur)?/gi, ' ').replace(/Put\s+\S+\s+on/gi, ' ');
    const toLines = (t) => t.split('\n').map((l) => noEvo(l).trim()).filter((l) => /[a-zA-ZÀ-ÿ]{3,}/.test(l));
    const lines = [...toLines(top), ...toLines(full).slice(0, 6)];
    const stop = new Set(['base', 'niveau', 'stade', 'pokemon', 'pv', 'hp', 'evolue', 'illus', 'faiblesse', 'resistance', 'retraite', 'talent', 'dresseur', 'supporter', 'objet', 'energie', 'nintendo', 'creatures', 'game', 'freak', 'the', 'and', 'souris', 'pass']);
    const words = [...new Set(lines.join(' ').split(/[^a-zA-ZÀ-ÿ\-]+/).filter((w) => w.length >= 4 && !stop.has(norm(w))))];
    // année du copyright en bas de carte (« ©1999 Wizards », « ©2016 Pokémon ») : départage une carte et sa réimpression
    const years = new Set();
    for (const m of (bottom + '\n' + full).matchAll(/(?:^|[^\d])((?:19|20)\d\d)(?!\d)/g)) { const y = +m[1]; if (y >= 1995 && y <= new Date().getFullYear() + 1) years.add(y); }
    const wizards = /wizard/i.test(bottom + ' ' + full);
    // carte d'un autre jeu (Dragon Ball, Star Wars, One Piece, Wankul…) : mots typiques, et aucun mot typique d'une carte Pokémon
    const T = `${top}\n${bottom}\n${full}\n${atk}`;
    const OTHER = [/bandai/i, /\bBT\d{1,2}\s*[-‐–]\s*\d{2,3}/i, /dragon\s*ball/i, /\bLFL\b/, /\bFFG\b/, /\bSOR\s*[•·.*]?\s*(FR|EN)\b/i, /star\s*wars/i, /unlimited/i, /wankul/i, /konami/i, /yu-?gi-?oh/i, /lorcana/i, /disney/i, /one\s*piece/i, /\bOP\d{2}\s*-\s*\d{3}/i, /\bmagic\b/i, /wizards\s+of\s+the\s+coast/i, /digimon/i, /\bsaiyan/i,
      /\b(son\s*)?(goku|gok[uû]|gohan|goten|vegeta|trunks|broly|piccolo|krilin|freezer|kamesennin|janemba|zenkai)\b/i, /\b(unit[ée]s?|terrestre|spatiale|am[ée]lioration|rebelle|imp[ée]rial|wookie|jedi|[ée]v[ée]nement|prot[ée]g[ée]e)\b/i];
    const POKE = [/\b(PV|HP)\s*\d{2,3}\b/, /\b\d{2,3}\s*(PV|HP)\b/, /pok[eé]mon/i, /nintendo/i, /game\s*freak/i, /faiblesse/i, /weakness/i, /r[ée]sistance/i, /retraite/i, /retreat/i];
    const neg = OTHER.filter((r) => r.test(T)).length, pos = POKE.filter((r) => r.test(T)).length;
    const otherGame = neg >= 1 && pos === 0 || neg >= 2 && pos <= 1;
    // points de vie lus en haut (« 60 PV », « PV 120 », « HP 90 ») : départagent une carte et sa réimpression (ex. Évolutions)
    const hpM = fix(top).match(/(\d{2,3})\s*P\s*V\b|\bP\s*V\s*(\d{2,3})|\bHP\s*(\d{2,3})|(\d{2,3})\s*HP\b/);
    const hp = hpM ? parseInt(hpM[1] || hpM[2] || hpM[3] || hpM[4], 10) : null;
    // noms de Pokémon reconnus dans tout le texte (le titre compte double ; « Évolution de … » est ignoré)
    const clean = (t) => t.split('\n').map(noEvo).join('\n');
    const pokes = knownPokemon(`${clean(top)}\n${clean(top)}\n${clean(full)}\n${clean(atk)}`).slice(0, 4);
    return { num: ranked[0] || null, alt: ranked.slice(1, 3), lines, words, pokes, years: [...years], wizards, otherGame, hp: hp && hp >= 30 && hp <= 340 && hp % 10 === 0 ? hp : null, raw: { bottom, full: full + '\n' + atk } };
  }

  /** Recherche par nom tolérante aux erreurs de lecture (« AictiniV » → « ictin », « Drace » → « Drac »…) */
  /**
   * Noms de Pokémon présents dans le texte lu : chaque mot est comparé aux 1025 noms connus (App.pokedex),
   * même mal lu (« Kadahra » → Kadabra). Le nom figure souvent plusieurs fois sur la carte (titre, attaques,
   * « Évolution de… » exclu) : on garde les mieux notés. Renvoie [{ name, score }].
   */
  let pokeNames = null;
  function knownPokemon(text) {
    if (!App.pokedex) return [];
    if (!pokeNames) pokeNames = Array.from({ length: App.pokedex.TOTAL }, (_, i) => App.pokedex.name(i + 1)).map((n) => ({ n, k: norm(n) })).filter((x) => x.k.length >= 3);
    const words = norm(text).split(' ').filter((w) => w.length >= 4);
    const hits = new Map();
    for (const w of words) {
      let best = null;
      for (const p of pokeNames) {
        if (Math.abs(p.k.length - w.length) > 2 || p.k[0] !== w[0] && p.k.slice(1, 3) !== w.slice(1, 3)) continue;
        const s = similarity(w, p.k);
        if (s >= 0.75 && (!best || s > best.s)) best = { n: p.n, s };
      }
      if (best) { const h = hits.get(best.n) || { name: best.n, score: 0 }; h.score += best.s; hits.set(best.n, h); }
    }
    return [...hits.values()].sort((a, b) => b.score - a.score);
  }
  /** Lit des zones d'une carte : [y0, y1, échelle, mode, x0, x1, psm] ou 'full' (carte entière) → textes (autres jeux : One Piece) */
  async function readZones(blob, zones) {
    const w = await getWorker(), img = await loadImg(blob);
    return Promise.all(zones.map((z) => (z === 'full' ? w.recognize(blob) : w.recognize(band(img, z[0], z[1], z[2], z[3] || 'sharp', z[4] ?? 0, z[5] ?? 1), z[6])).then((r) => r.data.text || '', () => '')));
  }

  function stop() { if (worker) { worker.terminate(); worker = null; workerP = null; } }
  const setOnStatus = (fn) => { onStatus = fn || null; }; // suivi d'une lecture (recognize, read, manual)

  App.recognizerParts = { similarity, norm, game, ad, loadTesseract, traduire, status, setOnStatus, getWorker, band, fetchImage, loadImg, ocr, parse, knownPokemon, readZones, stop };
})();
