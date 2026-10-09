/*
 * Moteur de reconnaissance d'une carte à partir d'une photo recadrée (format carte).
 * Utilisé par le scan « une carte » et par le scan « page de classeur ».
 *
 *   recognize(blob, onStatus) → { info, cands }
 *     info  : ce qui a été lu (numéro « 025/165 », mots du nom)
 *     cands : cartes candidates, la plus probable en premier
 *
 * (découpé en v3.06 : voir recognizer-text.js pour la liste des parties ; ce fichier = recherche de la carte et App.recognizer)
 */
App.recognizer = (() => {
  const P = App.recognizerParts;
  const { similarity, norm, ad, status, setOnStatus, ocr, parse, readZones, stop, locateCard, detectGrid, gridProfiles, cellCard, plausibleQuad, cutCard, warpQuad, snapCells, refineCell, cardPixels, detectPage, detectDouble, looksLikePage, artVariants, artMatch, vis01, officialThumb, looksEmpty, backScore, backScoreOf, looksLikeBack, wholeCardScores, detectVariants, firstEditionStamp, foilIn } = P;

  async function nameSearch(words, known = []) {
    // noms de Pokémon reconnus dans le texte : 1 à 2 recherches précises, en même temps
    if (known.length) {
      // + le nom sans accents : TCGdex écrit parfois « Metalosse δ » (EX Espèces Delta), introuvable en cherchant « Métalosse »
      const plain = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
      const qs = known.slice(0, 2).flatMap((k) => [{ name: k.name }, ...(plain(k.name) !== k.name ? [{ name: plain(k.name), en: false }] : [])]);
      const res = await Promise.all(qs.map((q) => ad().search(q).catch(() => [])));
      const seen = new Set(), out = res.flat().filter((c) => !seen.has(c.id) && seen.add(c.id));
      if (out.length) return out;
    }
    // sinon (Dresseurs, Énergies, nom illisible) : morceaux des premiers mots, recherches en parallèle
    const qs = [...new Set(words.slice(0, 3).flatMap((w) => [w, w.slice(1), w.slice(0, 5), w.slice(1, 6), w.slice(2, 7), w.slice(0, 4)])
      .map((q) => q.replace(/[^a-zA-ZÀ-ÿ\-]/g, '')).filter((q) => q.length >= 4))].slice(0, 10);
    return (await Promise.all(qs.map((q) => ad().search({ name: q, en: false }).catch(() => [])))).flat();
  }

  /** Classe des candidates : ressemblance du nom, numéro, puis comparaison visuelle avec la photo */
  /**
   * Attaques et talents de la carte retrouvés dans le texte lu (« Super Psy » … « 50 ») : part des noms retrouvés (0 à 1).
   * Chaque nom est cherché mot à mot, même un peu mal lu (« Supor Psy »), et ses dégâts à côté comptent un peu plus.
   */
  function attackMatch(atk, words, memo) {
    if (!atk || !atk.length || words.length < 3) return null;
    let got = 0;
    for (const [name, dmg] of atk) {
      // le même nom d'attaque revient sur beaucoup de cartes : mesuré une seule fois par lecture
      const mk = name + '|' + dmg;
      if (!memo.has(mk)) memo.set(mk, attackOne(name, dmg, words));
      got += memo.get(mk);
    }
    return Math.min(1, got / atk.length);
  }
  function attackOne(name, dmg, words) {
    const nw = norm(name).split(' ').filter(Boolean); if (!nw.length) return 0;
    const target = nw.join(' '), n = nw.length, L = target.length;
    let best = 0, at = -1;
    for (let i = 0; i + n <= words.length; i++) {
      // tri rapide avant le calcul (coûteux) : longueur proche et une lettre en commun au début
      const w0 = words[i];
      if (w0[0] !== nw[0][0] && w0[1] !== nw[0][1]) continue;
      const win = n === 1 ? w0 : words.slice(i, i + n).join(' ');
      if (Math.abs(win.length - L) > L * 0.35) continue;
      const s = 1 - App.util.lev(win, target) / Math.max(win.length, L); // textes déjà normalisés : calcul direct
      if (s > best) { best = s; at = i; }
    }
    const need = L <= 5 ? 0.85 : 0.72; // les noms courts (« Soin ») doivent être presque exacts
    if (best < need) return 0;
    const d = String(dmg || '').replace(/\D/g, '');
    return d && words.slice(at + n, at + n + 6).includes(d) ? 1.25 : 1; // dégâts lus juste après
  }

  /**
   * Sûre grâce au texte : bon nom, TOUTES ses attaques / talents retrouvés, et c'est la seule candidate dans ce cas
   * (une réimpression aux mêmes attaques laisse le doute), illustration pas contraire.
   */
  // même carte en deux exemplaires dans une série (holo / non holo, même dessin, mêmes attaques) : seul le numéro tranche
  const sameAtk = (a, b) => (a.atk || []).length > 0 && (a.atk || []).map((x) => norm(x[0])).join('|') === (b.atk || []).map((x) => norm(x[0])).join('|');
  const inSetTwin = (c, out) => out.some((o) => o !== c && o.setId === c.setId && norm(o.name) === norm(c.name) && sameAtk(o, c));
  const atkSure = (c, out) => c.atkM != null && c.atkM >= 0.99 && (c.nameScore || 0) >= 0.75 && (c.visual == null || c.visual >= 0.35)
    && out.filter((o) => o.atkM != null && o.atkM >= 0.99 && (o.nameScore || 0) >= 0.75
      // une réimpression aux mêmes attaques ne crée pas de doute si elle ressemble nettement moins à la photo,
      // ou si elle n'a pas de visuel et pas la bonne année (Métalosse δ 2006 ↔ collection 30ᵉ anniversaire sans image)
      && !(o !== c && ((o.visual != null && c.visual != null && c.visual - o.visual >= 0.15) || (o.visual == null && c.visual != null && c.visual >= 0.6 && c.yearOk && !o.yearOk)))).length === 1;

  async function rank(list, num, lines, mine, { cap = 30, visualWeight = 1.5, needName = false, years = [], wizards = false, hp = null, full = '' } = {}) {
    const allWords = norm(full || lines.join(' ')).split(' ').filter((w) => w.length >= 2).slice(0, 400), memo = new Map();
    const text = norm(lines.slice(0, 8).join(' '));
    const ocrWords = [...new Set(text.split(' ').filter((w) => w.length >= 4))];
    // ressemblance mot à mot : « Nictini » ↔ « Victini », « Dracaufeu » ↔ « Dracaufeu-ex »
    const wordScore = (name) => {
      let best = 0;
      for (const t of norm(name).split(' ').filter((x) => x.length >= 3)) {
        for (const w of ocrWords) { const v = similarity(w, t) * (t.length >= 5 ? 1 : 0.8); if (v > best) best = v; }
      }
      return best;
    };
    const uniq = new Map();
    for (const c of list) if (!uniq.has(c.id)) {
      const nameScore = Math.max(0, ...lines.slice(0, 8).map((l) => similarity(l, c.name)), text.includes(norm(c.name)) ? 1 : 0, wordScore(c.name));
      // numéro lu avec un chiffre de trop devant (« 38/102 » pour « 8/102 » : étoile ou symbole lu comme un chiffre)
      const ln = parseInt(c.localId, 10);
      // … ou avec un chiffre perdu devant (« 01/100 » pour la carte secrète « 101/100 », collée au bord de la carte)
      const offOk = !!num && num.of && c.set && c.set.cardCount && c.set.cardCount.official === num.of;
      const numOk = !!num && (ln === num.n || (num.n >= 10 && ln === num.n % (num.n >= 100 ? 100 : 10) && offOk) || (offOk && ln > num.of && ln < 1000 && ln % (num.n >= 10 ? 100 : 10) === num.n && String(ln).endsWith(String(num.raw || num.n))));
      const ofOk = !!num && !!(c.set && c.set.cardCount) && c.set.cardCount.official === num.of;
      if (needName && !numOk && nameScore < 0.35 && !c._hint) continue;
      const yr = c.set && c.set.releaseDate ? parseInt(c.set.releaseDate, 10) : 0;
      const yearOk = !!yr && (years.includes(yr) || years.includes(yr - 1));
      const eraOk = wizards && !!yr && yr <= 2003;
      const hpOk = hp && c.hp ? (c.hp === hp ? 0.3 : -0.15) : 0;
      // série seulement en anglais (réimpression jamais sortie en français, ex. Base Set 2) : à égalité, la série française l'emporte
      const enPen = c.set && c.set.enOnly && (App.settings.lang || 'fr') !== 'en' ? 0.35 : 0;
      // attaques / talents retrouvés dans le texte lu (seulement si le nom colle : sinon le texte est illisible, inutile)
      const atkM = nameScore >= 0.6 || numOk ? attackMatch(c.atk, allWords, memo) : null;
      uniq.set(c.id, { ...c, nameScore, numOk, ofOk, yearOk, hpOk: hpOk > 0, hpBonus: hpOk, atkM, visual: null, score: nameScore + (numOk && ofOk ? 1.2 : numOk ? 0.4 : ofOk ? 0.2 : 0) + (yearOk ? 0.6 : 0) + (eraOk ? 0.4 : 0) + hpOk - enPen + (atkM || 0) * 1.4 + (c._hint || 0) });
    }
    let out = [...uniq.values()].sort((a, b) => b.score - a.score).slice(0, cap);
    if (mine && out.length) {
      status('Comparaison avec les visuels officiels…');
      await App.util.pool(out, 10, async (c) => {
        const src = ad().img.card(c, 'low'); if (!src) return;
        const v = await officialThumb(src, false, !c.image);
        if (v) { c.visual = artMatch(mine, v); c.score += vis01(c.visual) * visualWeight; }
      });
      out.sort((a, b) => b.score - a.score);
      // visuel des premières candidates pas reçu (le serveur d'images rate parfois une requête) : une 2e chance,
      // sinon la bonne carte (Salamèche 101/100, Poulpaf 207/191) passait derrière une autre qui, elle, avait son visuel
      const miss = out.slice(0, 4).filter((c) => c.visual == null && c.image && ad().img.card(c, 'low'));
      if (miss.length) {
        await new Promise((res) => setTimeout(res, 300));
        await Promise.all(miss.map(async (c) => {
          const v = await officialThumb(ad().img.card(c, 'low'), true);
          if (v) { c.visual = artMatch(mine, v); c.score += vis01(c.visual) * visualWeight; }
        }));
        out.sort((a, b) => b.score - a.score);
      }
      // écart de ressemblance avec la meilleure autre candidate (une carte nettement devant = plus sûre)
      const vs = out.map((c) => c.visual).filter((x) => x != null).sort((a, b) => b - a);
      for (const c of out) if (c.visual != null) c.margin = c.visual - (c.visual === vs[0] ? (vs[1] ?? 0) : vs[0]);
    }
    return out;
  }

  async function findCandidates({ num, alt = [], words, lines, years = [], wizards = false, hp = null, pokes = [], raw = null }, blob) {
    const full = raw ? `${raw.full || ''} ${raw.bottom || ''}` : ''; // tout le texte lu (attaques, talents…)
    const A = ad();
    // tout ce qui ne dépend pas du reste part en même temps : empreinte de la photo, recherche par numéro,
    // et (par avance) la recherche par le nom de Pokémon reconnu dans le texte
    const mineP = blob ? artVariants(blob).catch(() => null) : Promise.resolve(null);
    const known = pokes.filter((p) => p.score >= 0.9);
    let nameP = known.length ? nameSearch(words, known) : null;
    let byNum = [];
    if (num) {
      const [a, b] = await Promise.all([A.findByNumber(num.n, num.of).catch(() => []),
        num.n >= 10 && num.of ? A.findByNumber(num.n % (num.n >= 100 ? 100 : 10), num.of).catch(() => []) : []]);
      byNum = [...a, ...b];
    }
    for (const a of alt) { if (byNum.length) break; byNum = await A.findByNumber(a.n, a.of).catch(() => []); if (byNum.length) num = a; }
    const mine = await mineP;
    // cartes hors-série (Pikachu Illustrator, Trophée…) : sans numéro ni nom lisible (texte japonais), toujours comparées à la photo ;
    // un mot-clé lu sur la carte (« ILLUSTRATOR », « TRAINER No.1 », « LV.38 »…) les fait remonter
    const txt = norm(`${lines.join(' ')} ${full}`);
    const hs = (A.horsSerie ? A.horsSerie() : []).map((c) => ({ ...c, _hs: true, _hint: c.keys.some((k) => txt.includes(k)) ? 0.8 : 0 }));
    // … ou la carte entière qui ressemble nettement plus à l'une d'elles qu'aux autres (texte japonais illisible)
    if (blob && hs.length) {
      const whole = await wholeCardScores(blob, hs).catch(() => new Map());
      const ws = [...whole.values()].sort((a, b) => b - a);
      for (const c of hs) {
        const w = whole.get(c.id);
        if (w != null && w >= 0.5 && w - (w === ws[0] ? (ws[1] ?? 0) : ws[0]) >= 0.08) c._hint = Math.max(c._hint, 0.5);
      }
    }
    let out = await rank([...byNum, ...hs], num, lines, mine, { years, wizards, hp, full });
    // sans mot-clé, une carte hors-série ne reste que si elle ressemble vraiment à la photo (sinon un Pikachu ordinaire → « Illustrator »)
    out = out.filter((c) => !c._hs || c._hint || (c.visual != null && c.visual >= 0.7));
    // numéro absent, ou carte trouvée qui ne ressemble pas à la photo → on cherche aussi par le nom
    const weak = !out.length || (mine && (out[0].visual == null || out[0].visual < 0.55));
    if (weak && (words.length || known.length)) {
      status('Recherche par le nom…');
      const byName = await (nameP || nameSearch(words, known));
      // le nom de Pokémon reconnu compte comme une ligne lue (« Kadabra » lu dans une attaque, titre illisible)
      const lines2 = [...known.slice(0, 2).map((k) => k.name), ...lines];
      // 60 candidates au plus (les mieux classées par le nom, l'année, les PV) : comparer 100 visuels prenait ~7 s
      out = await rank([...byNum, ...byName, ...hs], num, lines2, mine, { cap: 60, visualWeight: 3, needName: true, years, wizards, hp, full });
    }
    // « sûre » : bon numéro ET bon total, ou photo très ressemblante
    // (sans visuel officiel à comparer, le numéro seul ne suffit pas : une lecture de travers donne vite « 10/10 »)
    // (nom + numéro + total lus tous les trois : sûre même si un reflet holo gâche la ressemblance, ex. Mélofée 5/102 à 0,39)
    for (const c of out) c.confident = (c.numOk && c.ofOk && c.visual != null && c.visual > 0.4) || (c.visual != null && c.visual >= 0.75 && (c.margin ?? 1) >= 0.06) || atkSure(c, out)
      || (c.numOk && c.ofOk && (c.nameScore || 0) >= 0.9 && (c.atkM == null || c.atkM >= 0.5) && c.visual != null && c.visual >= 0.25);
    // réimpression (même nom, autre série) presque aussi ressemblante → on ne peut pas trancher : « À vérifier »
    if (out[0] && out[0].confident && !(out[0].numOk && out[0].ofOk)) {
      // (une réimpression aux attaques nettement moins bien retrouvées, ou seulement anglaise, ne crée pas de doute)
      const t0 = out[0], atkAhead = (c) => t0.atkM != null && t0.atkM >= 0.99 && (c.atkM == null || c.atkM <= t0.atkM - 0.3);
      // même carte en deux exemplaires dans la même série (holo / non holo : Sulfura 12 et 27 de Fossile, même dessin,
      // mêmes attaques) : seul le numéro peut trancher, la ressemblance ne veut rien dire (0,78 pour la mauvaise)
      const twin = out.slice(1).find((c) => norm(c.name) === norm(t0.name) && (
        (c.visual != null && t0.visual != null && t0.visual - c.visual < 0.12 && !atkAhead(c) && !(c.set && c.set.enOnly && !(t0.set && t0.set.enOnly)))
        || (c.setId === t0.setId && sameAtk(c, t0))));
      if (twin) { out[0].confident = false; out[0].twin = true; }
    }
    return out.slice(0, 8);
  }

  /**
   * Reconnaissance limitée à une série (ex. une page de classeur rangée par série) :
   * on compare la photo à toutes les cartes de la série. Beaucoup plus fiable quand le nom est mal lu.
   */
  async function inSet(blob, info, setId, statusFn) {
    setOnStatus(statusFn);
    try {
      const A = ad();
      const set = await A.getSet(setId);
      const shape = { id: set.id, name: set.name, logo: set.logo, symbol: set.symbol, releaseDate: set.releaseDate, cardCount: { total: set.total, official: set.official }, serie: set.group };
      const list = set.cards.map((c) => ({ ...c, set: shape }));
      const num = info.num && (!info.num.of || info.num.of === set.official) ? info.num : null;
      const mine = await artVariants(blob).catch(() => null);
      status(`Comparaison avec les ${list.length} cartes de ${set.name}…`);
      const out = await rank(list, num, info.lines, mine, { cap: 500, visualWeight: 3, hp: info.hp, full: info.raw ? `${info.raw.full || ''} ${info.raw.bottom || ''}` : '' });
      // (les PV lus départagent le classement, mais ne rendent jamais une carte « sûre »)
      const second = out[1] ? out[1].score - (out[1].hpBonus || 0) : 0;
      for (const c of out) {
        c.confident = (c.numOk && c.visual != null && c.visual > 0.4) || atkSure(c, out)
          || (c.visual != null && c.visual >= 0.72 && (c.margin ?? 1) >= 0.05)
          || (c === out[0] && c.visual != null && c.visual >= 0.62 && (c.margin ?? 0) >= 0.12 && c.score - (c.hpBonus || 0) - second > 0.3); // nettement devant les autres
      // (mesuré sur une page de 18 cartes : une mauvaise carte peut atteindre 0,59 de ressemblance avec 0,17 d'avance)
        if (c.confident && !c.numOk && inSetTwin(c, out)) { c.confident = false; c.twin = true; }
      }
      return out.slice(0, 8);
    } finally { setOnStatus(null); }
  }

  /** Lecture seule (sans recherche) */
  async function read(blob, statusFn, opts) {
    setOnStatus(statusFn);
    try { return parse(await ocr(blob, opts)); } finally { setOnStatus(null); }
  }

  async function recognize(blob, statusFn, opts) {
    setOnStatus(statusFn);
    try {
      const info = parse(await ocr(blob, opts));
      status('Recherche dans la base…');
      const cands = await findCandidates(info, blob);
      return { info, cands };
    } finally { setOnStatus(null); }
  }

  /** Recherche manuelle (nom et/ou « 025/165 »), classée avec la photo */
  async function manual(blob, nameTxt, numTxt, statusFn) {
    setOnStatus(statusFn);
    try {
      const name = (nameTxt || '').trim();
      const m = (numTxt || '').trim().match(/(\d{1,3})(?:\s*\/\s*(\d{2,3}))?/);
      const num = m ? { n: parseInt(m[1], 10), of: m[2] ? parseInt(m[2], 10) : null, raw: m[1] } : null;
      if (!name && !(num && num.of)) throw new Error('Indique un nom, ou un numéro complet (ex. 025/165)');
      if (num && num.of) return findCandidates({ num, words: name ? [name] : [], lines: name ? [name] : [] }, blob);
      const r = await findCandidates({ num: null, words: [name], lines: [name] }, blob);
      return num ? r.filter((c) => parseInt(c.localId, 10) === num.n) : r;
    } finally { setOnStatus(null); }
  }

  /** Texte court « ce qui a été lu » */
  // (lecture d'une autre licence — One Piece : info.read = « code OP10-001, nom … »)
  const readSummary = (info) => (info && typeof info.read === 'string' ? info.read : [info.num ? `n° ${info.num.raw}/${info.num.of}` : 'numéro illisible', info.words.length ? `« ${info.words.slice(0, 3).join(', ')} »` : ''].filter(Boolean).join(' · '));

  /**
   * Ajoute une carte scannée à la collection.
   * mode : 'nouvelle' (carte pas encore possédée), 'doublon' (+1 exemplaire, la photo s'ajoute),
   *        'photo' (même carte : sa photo devient le visuel, sans changer la quantité), 'rien'.
   */
  let lastVariants = null;

  async function addScanned(c, blob, mode = null, game = c.game || 'pokemon') {
    const before = App.col.get(game, c.id);
    if (!mode) mode = before && before.qty > 0 ? 'photo' : 'nouvelle';
    const key = App.col.keyOf(game, c.id);
    if (mode === 'rien') return key;
    if (mode === 'photo' && before) { await App.col.addPhoto(key, blob, { makeDisplay: true }); return key; }
    const set = c.set ? { id: c.set.id, name: c.set.name, symbol: c.set.symbol, logo: c.set.logo, official: c.set.cardCount && c.set.cardCount.official, group: c.set.serie || { id: c.serieId } } : null;
    await App.col.add(game, { ...c, serieId: c.serieId || (c.set && c.set.serie ? c.set.serie.id : '') }, set);
    // nouvelle carte : la photo devient son visuel ; doublon : la photo s'ajoute à ses photos
    await App.col.addPhoto(key, blob, { makeDisplay: !before || !before.displayPhoto });
    // versions reconnues sur la photo (holo / reverse / 1re édition), parmi celles qui existent pour cette carte
    // (déjà mesurées et vérifiées dans la liste du classeur : c.pickedVariants)
    try {
      // autre licence (One Piece) : la version vient de la carte elle-même (holo selon la rareté), rien à mesurer
      const det = c.pickedVariants ? { list: c.pickedVariants } : game !== 'pokemon' ? (c.variants ? { list: Object.keys(c.variants).filter((k) => c.variants[k]) } : null)
        : c.variants ? await detectVariants(blob, c.variants, ad().img.card(c, 'high')) : null;
      if (det && det.list.length) {
        const it = App.col.byKey(key);
        const vars = [...new Set([...((it && it.variants) || []), ...det.list])];
        await App.col.update(key, { variants: vars, variantsAuto: det.list });
        lastVariants = det;
      } else lastVariants = null;
    } catch (e) { console.warn('versions', e); lastVariants = null; }
    return key;
  }

  /** Ressemblance (0 à 1) entre ta photo et le visuel officiel d'une carte donnée */
  async function resemblance(blob, c) {
    const src = ad().img.card(c, 'low'); if (!src) return null;
    const [mine, ref] = await Promise.all([artVariants(blob), officialThumb(src)]);
    return ref ? vis01(artMatch(mine, ref)) : null;
  }
  /** Ressemblance de la photo avec plusieurs cartes (la photo n'est analysée qu'une fois) */
  async function resemblanceMany(blob, cards, urlOf = (c) => ad().img.card(c, 'low')) { // urlOf : visuel d'un autre jeu (One Piece)
    const mine = await artVariants(blob);
    const out = new Map();
    await App.util.pool(cards, 6, async (c) => {
      const src = urlOf(c); if (!src) return;
      const ref = await officialThumb(src);
      if (ref) out.set(c.id, vis01(artMatch(mine, ref)));
    });
    return out;
  }

  return { get lastVariants() { return lastVariants; }, wholeCardScores, recognize, read, inSet, manual, resemblance, resemblanceMany, readSummary, addScanned, readZones, plausibleQuad, looksEmpty, looksLikeBack, backScore, backScoreOf, looksLikePage, locateCard, refineCell, detectGrid, detectVariants, firstEditionStamp, foilIn, cardPixels, detectPage, detectDouble, cellCard, cutCard, warpQuad, snapCells, _gridProfiles: gridProfiles, stop, RATIO: 63 / 88 };
})();
