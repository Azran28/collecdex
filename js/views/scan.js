/*
 * Scanner — le SEUL moyen d'ajouter une carte (elle doit être réelle).
 * Deux modes :
 *   - « Une carte » : photo → recadrage → reconnaissance → confirmation
 *   - « Page de classeur » : photo d'une page (9 pochettes par défaut) → grille ajustée
 *     → chaque carte est reconnue → vérification → ajout de toutes les cartes en une fois
 * La photo de chaque carte devient son visuel dans ta collection.
 * Fichiers (v3.06) : scan.js (commun : page, caméra), scan-single.js (une carte), scan-batch.js (classeur et rafale).
 */
App.views.scan = {
  /** Menu déroulant des séries : voir App.ui.fillSetSelect (components.js, utilisé aussi par Objectifs) */
  fillSetSelect(...a) { return App.ui.fillSetSelect(...a); },
  /** Dessin affiché avant la photo ; en classeur, les pochettes au format choisi ([colonnes, rangées]) */
  empty(mode, dims = [3, 3]) {
    const [c, r] = dims, cw = Math.min(38, Math.floor(210 / c)), ch = Math.round((cw * 88) / 63);
    const grid = mode === 'classeur' ? `style="grid-template-columns:repeat(${c},${cw}px);grid-template-rows:repeat(${r},${ch}px)"` : '';
    return `<div class="scan-empty">
      <div class="se-frame ${mode === 'classeur' ? 'grid' : ''}" ${grid}>${mode === 'classeur' ? `${'<i></i>'.repeat(c * r)}` : App.icons.icon(mode === 'rafale' ? 'rafale' : 'capture', 40)}</div>
      <b>${mode === 'classeur' ? `Photo d’une page de classeur <span class="muted">(${c * r} cartes)</span>` : mode === 'rafale' ? 'Tes cartes, l’une après l’autre' : 'Photo de ta carte'}</b>
      ${App.views.scan.curName ? `<em class="se-lic">${App.util.esc(App.views.scan.curName)}</em>` : ''}
      ${mode === 'carte' && App.views.scan.certWanted() ? App.views.scan.certSteps() : `<span>${mode === 'rafale' ? 'Appuie sur « Démarrer la rafale » ou « Choisir des photos »' : 'Appuie sur « Caméra » ou « Choisir une photo »'}</span>`}
    </div>`;
  },

  /**
   * Aide sous la photo tant qu'il n'y a pas de résultat : plus rien depuis v3.16 (le choix de la certification est passé en
   * haut, en tuiles : `certPick`, et ses étapes dans le cadre vide : `certSteps`) ; gardée car appelée à plusieurs endroits.
   */
  guide() { return ''; },

  /** Certification demandée en carte seule (connecté et « Certifier » choisi ; v2.58 : optionnelle, demande d'Arnaud) */
  certWanted() { return !!(App.certify && App.certify.available()) && App.settings.certCarte !== false; },

  /**
   * v3.16 (Arnaud : « la certif au même niveau que le choix des pages de classeur ») : deux tuiles au-dessus du cadre,
   * comme les formats du classeur, aux couleurs de la certification (vert = certifier). Rien si pas connecté.
   */
  certPick() {
    if (!(App.certify && App.certify.available())) return '';
    const on = App.settings.certCarte !== false, I = App.icons.icon;
    const opt = (v, icon, title, sub) => `<button type="button" class="fp-opt cp-opt${v ? ' cp-yes' : ''}${on === v ? ' on' : ''}" data-cert="${v ? 1 : 0}" role="radio" aria-checked="${on === v}">
        <span class="cp-ic">${I(icon, 18)}</span><span class="fp-t"><b>${title}</b><small>${sub}</small></span></button>`;
    return `<div class="fmt-pick cert-pick" role="radiogroup" aria-label="Certifier la carte">
      ${opt(true, 'shield', 'Certifier', 'Badge « Certifiée »')}${opt(false, 'camera', 'Juste la photo', 'Plus rapide, sans badge')}
    </div>`;
  },

  /** Les 3 gestes de la certification, dans le cadre vide (à la place de « Appuie sur… ») */
  certSteps() {
    const steps = ['Touche <b>Caméra</b>, montre d’abord le <b>dos</b>', 'La lampe clignote : garde-le <b>immobile</b>', '<b>Retourne</b> la carte, prends la photo'];
    return `<ol class="se-steps">${steps.map((t, i) => `<li><i>${i + 1}</i><span>${t}</span></li>`).join('')}</ol>`;
  },

  /** Interrupteur vert (activé) / rouge (désactivé), le même partout (v2.57 : « plus compréhensible », demande d'Arnaud) */
  certSwitch(id, on, label) {
    return `<label class="btn pc-switch"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}> <span>${label}</span> <b class="pc-sw"></b></label>`;
  },

  /**
   * Encadré « certification », le même dans les modes (v2.55, demande d'Arnaud : même logique visuelle pour une
   * carte / classeur / rafale) : titre, 3 étapes numérotées, et selon le mode un bouton ou un interrupteur.
   * v2.57 : la lampe seulement en carte seule (optionnelle) ; plus de certification de page pour le moment.
   */
  certBlock(mode, extra = '') {
    const I = (n, s = 18) => App.icons.icon(n, s);
    const lamp = true; // (la lampe s'utilise dès que le téléphone le permet)
    const S = {
      carte: ['Certifier la carte', [
        'Touche <b>Caméra</b> et montre d’abord le <b>dos</b> de la carte (pas d’étui opaque)',
        lamp ? '💡 La lampe clignote : <b>garde le dos immobile</b> jusqu’à la fin' : 'Garde le dos visible un instant',
        '<b>Retourne</b> la carte, puis appuie sur <b>Prendre la photo</b>']],
      classeur: ['Certifier la page', [
        'Touche <b>Certifier la page</b> et cadre <b>toute la page</b>',
        'Appuie sur <b>Prendre la photo</b>',
        '💡 <b>Ne bouge pas 3 secondes</b> : la lampe clignote, puis la photo se prend']],
      rafale: ['Certifier chaque carte', [
        'Montre le <b>dos</b> d’une carte',
        '<b>Retourne</b>-la et tiens-la immobile',
        'Elle est prise et certifiée toute seule : passe à la suivante']],
    }[mode];
    const off = mode === 'carte' && App.settings.certCarte === false;
    return `<div class="pc-block${off ? ' pc-off' : ''}" id="${mode === 'classeur' ? 'b-cert-help' : mode === 'rafale' ? 'r-cert-help' : 'sc-cert-help'}">
      <div class="pc-block-h">${I('shield')} <b>${S[0]}</b> <span class="small muted">— badge « Certifiée »</span></div>
      <ol class="pc-steps">${S[1].map((t, i) => `<li><i>${i + 1}</i><span>${t}</span></li>`).join('')}</ol>${extra}
    </div>`;
  },

  /**
   * Cadre trouvé par le détourage sur une photo de la caméra (v2.90) : refusé s'il touche un bord de la photo d'un côté
   * en laissant une grande marge du côté opposé — c'est que la carte dépassait (tenue trop près) et qu'on a pris un
   * rectangle à l'intérieur (cadre de l'illustration, zone de texte). Mesuré sur des cartes qui tiennent dans la photo :
   * marges presque égales des deux côtés ; qui dépassent : 0,01 contre 0,08.
   */
  sane(r) {
    if (!r || !r.quad) return r || null;
    const xs = r.quad.map((p) => p[0]), ys = r.quad.map((p) => p[1]);
    const m = { l: Math.min(...xs), r: 1 - Math.max(...xs), t: Math.min(...ys), b: 1 - Math.max(...ys) };
    const cut = (a, b) => (a < 0.025 && b > 0.06) || (b < 0.025 && a > 0.06);
    return cut(m.l, m.r) || cut(m.t, m.b) ? null : r;
  },

  /** Carte remise à plat d'après ses 4 coins (fractions de l'image : HG, HD, BD, BG) → canvas */
  warpTo(img, quad) {
    const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height, q = quad.map(([x, y]) => [x * W, y * H]);
    const qw = (Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]) + Math.hypot(q[2][0] - q[3][0], q[2][1] - q[3][1])) / 2;
    return App.recognizer.warpQuad(img, q, Math.min(1000, Math.max(240, Math.round(qw)))); // (v3.30 : 1000 px, la photo gardée fait 1200 px de haut)
  },

  /** « Set de Base (1999) » */
  setLabel(c) { return c.set ? `${c.set.name}${c.set.releaseDate ? ' (' + c.set.releaseDate.slice(0, 4) + ')' : ''}` : (c.setId || ''); },

  /** Licences proposées dans Capturer (actives et branchées) */
  games() { return App.games.list.filter((g) => g.status === 'actif' && App.games.get(g.id)); },
  /**
   * Autres licences à essayer pour une carte qui n'est pas de la licence choisie (sauf `except`) : d'abord celle dont le texte
   * lu parle (code imprimé « OGN · 013/298 », « 25/204 • FR • 1 », mots « Disney Lorcana », « BANDAI », « RGI »… : textScores),
   * puis One Piece, puis les autres. (v3.21, photos d'Arnaud : sans les mots, Lorcana passait en dernier, 10 s par licence essayée)
   */
  otherGames(raw, except) {
    const sc = App.views.scan.textScores(raw || '');
    return App.views.scan.games().map((g) => g.id).filter((id) => id !== except && id !== 'pokemon')
      .map((id, i) => ({ id, w: (sc[id] || 0) * 2 + (id === 'onepiece' ? 1 : 0), i })).sort((a, b) => (b.w - a.w) || (a.i - b.i)).map((x) => x.id);
  },
  /** Licence choisie : une licence, ou « auto » (toutes les licences, v3.11) */
  AUTO: 'auto',
  /**
   * Licence de départ d'un écran de Capturer : { auto, game } — ?jeu=…, sinon celle de la session ; en « auto », game = la
   * dernière licence reconnue (ou Pokémon), remplacée dès qu'une carte est reconnue.
   */
  startGame(params) {
    let q = params.query.jeu;
    if (!q) { try { q = sessionStorage.getItem('scanGame') || ''; } catch (e) { /* */ } }
    const auto = q === App.views.scan.AUTO;
    let game = !auto && q && App.games.get(q) ? q : 'pokemon';
    if (auto) { try { const g = sessionStorage.getItem('scanAutoGame'); if (g && App.games.get(g)) game = g; } catch (e) { /* */ } }
    App.views.scan.remember(auto ? App.views.scan.AUTO : game);
    return { auto, game };
  },
  /** Licence choisie gardée pour la session (et la dernière, pour « Dernière utilisée » sur la page de choix) */
  remember(choice) { try { sessionStorage.setItem('scanGame', choice); localStorage.setItem('scanGameLast', choice); } catch (e) { /* */ } },
  /**
   * Haut de Capturer : v3.12 (Arnaud : « une fois la licence choisie, seulement le nombre de cartes et la certification ») —
   * plus de puces de licence ; en « Toutes », une ligne dit la licence reconnue.
   */
  gameChips(game, auto) {
    return auto ? `<div class="small muted sc-autogame">${App.views.scan.autoLabel(game, false)}</div>` : '';
  },
  /** « Licence reconnue toute seule » / « Licence reconnue : Riftbound » */
  autoLabel(game, found) {
    const g = App.games.info(game);
    return found && g ? `${App.icons.icon(g.icon, 13)} Licence reconnue : <b>${App.util.esc(g.name)}</b>` : 'La licence de chaque carte est reconnue toute seule';
  },
  /** Met à jour les puces après une carte reconnue en mode « Toutes » */
  showAutoGame(root, game) {
    const s = root.querySelector('.sc-autogame');
    if (s) { s.hidden = false; s.innerHTML = App.views.scan.autoLabel(game, true); }
    try { sessionStorage.setItem('scanAutoGame', game); } catch (e) { /* */ }
  },

  /**
   * Choix de la licence avant Capturer (v3.11, demande d'Arnaud) ; v3.12 : grille compacte (d'autres licences arriveront) —
   * « Toutes les licences » en bandeau, puis une petite tuile par licence (icône sur sa couleur, nom, cartes dans le Dex),
   * les licences à venir en grisé. Plus d'exemples de cartes.
   */
  picker(el, params) {
    const { esc } = App.util, I = App.icons.icon;
    const mode = ['classeur', 'rafale'].includes(params.query.mode) ? params.query.mode : '';
    let last = ''; try { last = sessionStorage.getItem('scanGame') || localStorage.getItem('scanGameLast') || ''; } catch (e) { /* */ }
    const href = (g) => `#/scan?jeu=${g}${mode ? '&mode=' + mode : ''}`;
    const count = {}; for (const i of App.col.all()) if (i.qty > 0) count[i.game || 'pokemon'] = (count[i.game || 'pokemon'] || 0) + 1;
    const games = App.views.scan.games(), soon = App.games.list.filter((g) => g.status !== 'actif' && g.id !== 'autres');
    const lastCls = (id) => (id === last ? ' last' : '');
    // nombre de cartes de la licence dans le Dex : petite icône du Dex + « 12 dans ton Dex » (v3.13 : on ne savait pas ce qu'était ce nombre)
    const n = (k) => `<small class="lic-n" title="Cartes de cette licence déjà dans ton Dex">${I('dex', 11)} ${count[k] || 0} dans ton Dex</small>`;
    el.innerHTML = `
      <div class="breadcrumb"><a href="#/">Accueil</a> › Capturer</div>
      <h1 style="margin:0 0 2px">Capturer</h1>
      <p class="muted" style="margin:0 0 12px">Quelle licence vas-tu capturer ?</p>
      <div class="lic-grid">
        <a class="lic-tile lic-auto${lastCls('auto')}" href="${href(App.views.scan.AUTO)}" data-game="auto">
          <span class="lic-ic">${I('sparkles', 22)}</span>
          <span class="lic-t"><b>Toutes les licences</b><small>La licence de chaque carte est reconnue toute seule</small></span>
          ${last === 'auto' ? '<em class="lic-last">Dernière</em>' : ''}</a>
        ${games.map((g) => `<a class="lic-tile g-${g.id}${lastCls(g.id)}" href="${href(g.id)}" data-game="${g.id}">
          <span class="lic-ic">${I(g.icon, 20)}</span>
          <span class="lic-t"><b>${esc(g.name)}</b>${n(g.id)}</span>
          ${g.id === last ? '<em class="lic-last">Dernière</em>' : ''}</a>`).join('')}
        ${soon.map((g) => `<span class="lic-tile g-${g.id} soon" aria-disabled="true">
          <span class="lic-ic">${I(g.icon, 20)}</span>
          <span class="lic-t"><b>${esc(g.name)}</b><small>Bientôt</small></span></span>`).join('')}
      </div>`;
  },

  /**
   * Licence d'une carte d'après le texte lu sur toute la carte (mode « Toutes les licences ») :
   * 'riftbound' (code « OGN · 013/298 », UNITÉ, RGI…), 'onepiece' (code « OP09-004 », BANDAI, DON!!), 'pokemon' (PV, faiblesse…),
   * ou '' si rien n'est net (on essaie alors les licences l'une après l'autre).
   */
  async detectGame(blob, st = () => {}) {
    st('Quelle licence ?');
    // carte entière + les deux petits codes du bas, très agrandis : One Piece en bas à droite (« OP10-001 »), Riftbound en bas à gauche
    const texts = await App.recognizer.readZones(blob, ['full', [0.93, 0.985, 7, 'sharp', 0.6, 0.97], [0.935, 0.99, 7, 'sharp', 0.02, 0.5]]).catch(() => ['']);
    const score = App.views.scan.textScores(texts.join('\n'));
    const [best, second] = Object.entries(score).sort((a, b) => b[1] - a[1]);
    return best[1] >= 2 && best[1] >= second[1] + 2 ? best[0] : '';
  },
  /** Points de chaque licence d'après un texte lu sur une carte (codes imprimés ×2, mots typiques) */
  textScores(T) {
    const rb = App.games.get('riftbound'), lc = App.games.get('lorcana'), yg = App.games.get('yugioh'), ff = App.games.get('finalfantasy'), wk = App.games.get('wankul');
    return {
      // Wankul (v3.48) : code « STELLAR · LAINK · C#55 » en bas à droite, « Art : … » en bas à gauche, Laink / Terracid, COMBO, terrains « Le gagnant… / Le perdant… »
      wankul: (wk && wk.codesIn && wk.codesIn(T).some(([, w]) => w >= 0.9) ? 2 : 0) + [/wankul|wankil/i, /\blaink\b/i, /\bterracid\b/i, /\b(origins|campus|battle|stellar|legacy)\b[^#\n]{0,30}#/i, /\bcombo\b/i, /\ble\s+(gagnant|perdant)\b/i, /\bscore[zr]?\b|\bmeule\b/i, /\bart\s*:/i].filter((r) => r.test(T)).length,
      // Final Fantasy (v3.43) : code « 16-006C » en bas au milieu, « © SQUARE ENIX » et « CHARACTER DESIGN » en bas, Avant / Soutien, Break Zone, EX BURST
      finalfantasy: (ff && ff.codesIn && ff.codesIn(T).some(([, w]) => w >= 0.9) ? 2 : 0) + [/square\s*enix/i, /character\s+design|tetsuya|nomura/i, /break\s*zone/i, /ex\s*burst/i, /\b1\s+avant\b|\bavants?\s+(que|contr[ôo]l)|\bsoutien\b|\bforward\b|\bbackup\b/i, /\bdull/i, /final\s*fantasy/i, /infligez|choisissez\s+1\s+avant/i].filter((r) => r.test(T)).length,
      // Yu-Gi-Oh! (v3.26) : code « RGBT-FR007 » sous l'illustration, passcode et « ©1996 KAZUKI TAKAHASHI » en bas, ATK/DEF, [TYPE/EFFET]
      yugioh: (yg && yg.codesIn && yg.codesIn(T).some(([c, w]) => w >= 0.9 && !/^#/.test(c)) ? 2 : 0) + [/konami/i, /kazuki|takahashi/i, /\bATK\s*[/|]/i, /\bDEF\s*[/|]/i, /carte\s+(magie|pi[eè]ge)|(spell|trap)\s+card/i, /\b(1re|1ère|1st)\s+[ée]dition/i, /\/\s*effe[ct]t?\s*\]|\[\s*[A-ZÉ-]+\s*\/\s*effe/i, /invoqu|summon/i].filter((r) => r.test(T)).length,
      // Lorcana (v3.21) : code « 25/204 • FR • 1 » en bas à gauche, « Disney Lorcana ©Disney » en bas à droite, Storyborn / Floodborn…
      lorcana: (lc && lc.codesIn && lc.codesIn(T).some(([, w]) => w >= 0.9) ? 2 : 0) + [/lorcana/i, /disney/i, /ravensburger/i, /\b(storyborn|floodborn|dreamborn)\b/i, /[ée]clats?\s+de\s+lore|\blore\b/i, /\b(chanson|song)\b/i, /\bm[ée]lomane\b|\bsinger\b/i, /\bd[ée]fi\b|\bchallenger\b/i].filter((r) => r.test(T)).length,
      riftbound: (rb && rb.codesIn && rb.codesIn(T).length ? 2 : 0) + [/\bRG[Il1]\b/, /\bUNIT[ÉE](?![A-Za-zÀ-ÿ])/, /\bL[ÉE]GENDE\b/, /\bRUNE\b/, /CHAMP\s+DE\s+BATAILLE|BATTLEFIELD/i, /comp[ée]tence|canalis/i, /\bSORT\b|\bSPELL\b/, /\bUNIT\b/].filter((r) => r.test(T)).length,
      onepiece: (/(OP|[0©(C]P|ST|EB|PRB)\s?[0-9OIS]{2}\s?[-–—_.]\s?[0-9OIS]{3}/i.test(T) ? 2 : 0) + [/\b(OP|ST|EB|PRB)\s?\d{2}\s?-\s?\d{3}\b/i, /bandai/i, /DON\s*!!/i, /\bCOUNTER\b|\bCONTRE\b/i, /\bLEADER\b/i, /d[ée]clenchement|trigger/i, /\b(personnage|character)\b/i].filter((r) => r.test(T)).length,
      pokemon: [/\b(PV|HP)\s*\d{2,3}\b|\b\d{2,3}\s*(PV|HP)\b/, /pok[eé]mon/i, /nintendo|game\s*freak|creatures/i, /faiblesse|weakness/i, /r[ée]sistance|resistance/i, /retraite|retreat/i, /\bdresseur\b|\btrainer\b/i, /[ée]nergie|energy/i].filter((r) => r.test(T)).length,
    };
  },

  /**
   * Licence d'une carte d'après son illustration (mode « Toutes », cases de classeur où le texte est trop petit) :
   * la base d'images de chaque licence, la licence `first` d'abord ; '' si aucune ne retrouve la carte avec certitude.
   */
  async visualGame(blob, first = '') {
    const V = App.visual;
    if (!V || !V.supported() || App.settings.visualCheck === false) return '';
    const ids = App.views.scan.games().map((g) => g.id).sort((a, b) => (b === first) - (a === first));
    for (const id of ids) {
      const A = App.games.get(id);
      const o = await (id === 'pokemon' ? V.check(blob, []) : A.visualCheck ? A.visualCheck(blob) : null).catch(() => null);
      const t = o && o.cands && o.cands[0];
      if (t && t.confident && (t.orb || 0) >= V.SURE) return id;
    }
    return '';
  },

  async render(el, params, alive) {
    // pas de licence choisie (onglet Capturer) : d'abord le choix de la licence (v3.11) ; carte visée (?carte=…) : directement
    if (!params.query.jeu && !params.query.carte) return App.views.scan.picker(el, params, alive);
    const mode = ['classeur', 'rafale'].includes(params.query.mode) ? params.query.mode : 'carte';
    const jq = params.query.jeu ? `jeu=${encodeURIComponent(params.query.jeu)}` : '';
    const link = (m) => `#/scan?${[m ? 'mode=' + m : '', jq].filter(Boolean).join('&')}`;
    // licence choisie (v3.12 : plus de puces de licence ici — on la change avec la flèche retour / « Capturer »)
    const q = params.query.jeu, licName = q === App.views.scan.AUTO ? 'Toutes les licences' : (App.games.info(q || 'pokemon') || { name: 'Pokémon' }).name;
    App.views.scan.curName = licName; // (rappelé dans le cadre vide : « Riftbound »)
    // téléphone (v3.13, Arnaud : « choix plus clair ») : une phrase sous les onglets dit ce que fait le mode choisi
    const MODE_HINT = {
      carte: '<b>Une carte</b> : une photo par carte. La plus fiable, et la seule qui peut <b>certifier</b> ta carte.',
      classeur: '<b>Classeur</b> : une photo d’une page de classeur, toutes ses cartes (4, 9 ou 18) reconnues d’un coup.',
      rafale: '<b>Rafale</b> : passe tes cartes l’une après l’autre devant la caméra, elles sont prises toutes seules.',
    };
    el.innerHTML = `
      <div class="breadcrumb"><a href="#/">Accueil</a> › <a href="#/scan">Capturer</a> › ${App.util.esc(licName)}</div>
      <h1 class="m-hide" style="margin:0 0 4px">Capturer · ${App.util.esc(licName)}</h1>
      <div class="mode-pick" role="tablist">
        <a class="mode-card ${mode === 'carte' ? 'on' : ''}" href="${link('')}" role="tab" aria-selected="${mode === 'carte'}">
          <span class="mc-ico">${App.icons.icon('capture', 22)}</span>
          <span class="mc-txt"><b>Une carte</b><span>Carte par carte, la plus fiable</span><small class="mc-short">1 carte</small></span>
          ${mode === 'carte' ? `<span class="mc-check">${App.icons.icon('shield', 14)}</span>` : ''}
        </a>
        <a class="mode-card ${mode === 'classeur' ? 'on' : ''}" href="${link('classeur')}" role="tab" aria-selected="${mode === 'classeur'}">
          <span class="mc-ico">${App.icons.icon('dex', 22)}</span>
          <span class="mc-txt"><b class="m-hide">Page de classeur</b><b class="d-hide">Classeur</b><span>Jusqu’à 18 cartes d’un coup</span><small class="mc-short">1 page</small></span>
          ${mode === 'classeur' ? `<span class="mc-check">${App.icons.icon('shield', 14)}</span>` : ''}
        </a>
        <a class="mode-card ${mode === 'rafale' ? 'on' : ''}" href="${link('rafale')}" role="tab" aria-selected="${mode === 'rafale'}">
          <span class="mc-ico">${App.icons.icon('rafale', 22)}</span>
          <span class="mc-txt"><b>Rafale</b><span>Les cartes défilent, sans cliquer</span><small class="mc-short">À la suite</small></span>
        </a>
        <button type="button" class="sc-help d-hide" id="sc-help" aria-label="Mode d’emploi de Capturer">?</button>
      </div>
      <p class="mode-hint d-hide">${MODE_HINT[mode]}</p>
      <div id="sc-body"></div>`;
    const body = el.querySelector('#sc-body');
    // téléphone : mode d'emploi à la 1re visite, et bouton « ? » pour le revoir
    el.querySelector('#sc-help').addEventListener('click', () => App.onboarding.showScan());
    App.onboarding.maybeShowScan();
    // v3.36 : lecteurs de texte et vérification par l'image préparés dès maintenant (avant : au 1er scan, plusieurs secondes)
    App.scanMemo.prepare(params.query.jeu || 'pokemon');
    const cleanup = mode === 'carte' ? await App.views.scan.single(body, params, alive) : await App.views.scan.batch(body, params, alive, mode === 'rafale');
    const unfit = alive() ? App.views.scan.fitScreen(el) : () => {};
    return () => { unfit(); if (cleanup) cleanup(); App.recognizer.stopLater(); }; // (lecteurs gardés 90 s : changer de mode ne les recharge pas)
  },

  /**
   * v3.15 (Arnaud : « empêcher le défilement tant que la recherche n'est pas démarrée ») : sur téléphone, avant la photo
   * (cadre vide ou caméra), tout tient sur un écran — le cadre rétrécit juste assez — et la page ne défile pas.
   * Dès qu'il y a une photo, un résultat ou un message, la page redevient normale. Renvoie la fonction qui arrête tout.
   */
  fitScreen(el) {
    const mq = matchMedia('(max-width: 760px)'), root = document.documentElement;
    let timer = 0;
    const idleView = () => {
      const v = el.querySelector('.scan-view');
      if (!v || !v.querySelector('.scan-empty, video, .sc-scanwrap')) return null; // (v3.35 : aussi la carte pendant sa recherche)
      const st = el.querySelector('#sc-status, #b-status'), res = el.querySelector('#sc-results, #b-results');
      if (st && st.children.length) return null; // message, attente…
      if (res && [...res.children].some((c) => !c.matches('.pc-block'))) return null; // (l'encadré « Certifier ? » ne compte pas)
      if (el.querySelector('.sv:not(.hidden)')) return null;
      return v;
    };
    const free = () => {
      root.classList.remove('scan-still');
      el.querySelectorAll('.scan-view[data-fit]').forEach((v) => { v.style.height = ''; delete v.dataset.fit; });
    };
    const apply = () => {
      timer = 0;
      const v = mq.matches ? idleView() : null;
      free();
      if (!v) return;
      const over = () => root.scrollHeight - window.innerHeight;
      // v3.16 : le cadre prend toute la place libre (grandit ou rétrécit) pour que les boutons arrivent juste au-dessus de la barre du bas
      // (mesuré sur le bas de la page : la barre des boutons « colle » au bas de l'écran, sa position ne compte pas)
      const main = el.closest('main') || el;
      const delta = v.querySelector('.scan-empty, .sc-scanwrap') ? window.innerHeight - (main.getBoundingClientRect().bottom + window.scrollY) : -Math.max(0, over());
      if (Math.abs(delta) > 1) {
        const h = Math.min(760, v.getBoundingClientRect().height + delta);
        if (h < 180) return;
        v.style.height = `${Math.floor(h)}px`; v.dataset.fit = '1';
      }
      if (over() > 1) { free(); return; }
      if (window.scrollY) window.scrollTo(0, 0);
      root.classList.add('scan-still');
    };
    const later = () => { if (!timer) timer = setTimeout(apply, 30); }; // (pas requestAnimationFrame : arrêté quand l'onglet est en arrière-plan)
    const mo = new MutationObserver(later);
    mo.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] });
    window.addEventListener('resize', later);
    apply();
    return () => { mo.disconnect(); window.removeEventListener('resize', later); clearTimeout(timer); free(); };
  },

  /* ================= Caméra (partagée par les deux modes) ================= */
  camera(view, { guide }) {
    let stream = null, base = {}, focusT = 0;
    const track = () => stream && stream.getVideoTracks()[0];
    const within = (p, ms) => Promise.race([p, new Promise((res) => setTimeout(() => res(null), ms))]); // p, ou null après ms
    const caps = () => { try { const t = track(); return (t && t.getCapabilities && t.getCapabilities()) || {}; } catch (e) { return {}; } };
    // (réglages gardés ensemble : chaque applyConstraints remplace les précédents)
    const tune = (set) => { const t = track(); return t ? t.applyConstraints({ advanced: [Object.assign(base, set)] }).catch(() => {}) : Promise.resolve(); };
    const poiOk = () => { try { return !!navigator.mediaDevices.getSupportedConstraints().pointsOfInterest; } catch (e) { return false; } };
    // v3.30 (Arnaud : « très rarement net, Google Lens 10× plus net ») : toucher l'image = mise au point à cet endroit
    const onTap = (e) => {
      const v = view.querySelector('video'); if (!stream || !v || !v.videoWidth || e.target.closest('button, a, input')) return;
      const modes = caps().focusMode || []; if (!modes.length) return;
      const vr = v.getBoundingClientRect(), p = cam.toVideo(e.clientX, e.clientY); if (!p) return;
      const ring = document.createElement('i'); ring.className = 'focus-ring';
      ring.style.left = (e.clientX - view.getBoundingClientRect().left) + 'px'; ring.style.top = (e.clientY - view.getBoundingClientRect().top) + 'px';
      view.appendChild(ring); setTimeout(() => ring.remove(), 900);
      const poi = poiOk() && vr.width ? { pointsOfInterest: [{ x: p.x, y: p.y }] } : {};
      clearTimeout(focusT);
      if (modes.includes('single-shot')) {
        tune({ ...poi, focusMode: 'single-shot' });
        if (modes.includes('continuous')) focusT = setTimeout(() => { if (stream) tune({ focusMode: 'continuous' }); }, 3000); // puis le suivi reprend, centré sur ce point
      } else if (modes.includes('continuous')) tune({ ...poi, focusMode: 'continuous' });
    };
    const cam = {
      async start() {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 3840 }, height: { ideal: 2160 } }, audio: false });
        base = {};
        view.innerHTML = `<video autoplay playsinline muted></video>${guide ? '<div class="scan-guide"></div>' : ''}`;
        const v = view.querySelector('video');
        v.srcObject = stream;
        // pas de grandes bandes noires : en mode carte la vidéo remplit le cadre (on ne cadre que la carte),
        // en mode classeur la zone prend la forme exacte de l'image (on voit toute la page)
        v.addEventListener('loadedmetadata', () => {
          if (guide) view.classList.add('live-cover');
          else { view.classList.add('live-fit'); view.style.aspectRatio = `${v.videoWidth} / ${v.videoHeight}`; view.style.setProperty('--vr', v.videoHeight / v.videoWidth); }
          setTimeout(() => cam.sharpen(), 60); // (après la mise en page : le centre du cadre jaune doit être connu)
        }, { once: true });
        view.addEventListener('click', onTap);
      },
      /**
       * v3.30 : réglages de netteté. Mise au point continue, centrée sur le cadre jaune ; avec le cadre (une carte),
       * zoom ×2 quand le téléphone le permet : on tient la carte 2× plus loin, à une distance où l'objectif sait faire
       * le point (de près, la plupart des téléphones n'y arrivent pas : c'est ce que font Google Lens et l'appareil photo)
       * v3.46 (Arnaud : « en carte seule il faut s’éloigner très loin de la carte ») : ×1,4 au lieu de ×2 (carte tenue ~30 % plus près ;
       * la mise au point des téléphones se fait encore à cette distance)
       */
      sharpen() {
        const ZOOM = 1.4;
        const c = caps(), set = {};
        if ((c.focusMode || []).includes('continuous')) set.focusMode = 'continuous';
        if (guide && c.zoom && c.zoom.max >= 1.5) set.zoom = Math.max(c.zoom.min || 1, Math.min(ZOOM, c.zoom.max));
        const g = guide && view.querySelector('.scan-guide');
        if (g && poiOk() && set.focusMode) {
          const r = g.getBoundingClientRect(), p = cam.toVideo(r.left + r.width / 2, r.top + r.height / 2);
          if (p) set.pointsOfInterest = [{ x: p.x, y: p.y }];
        }
        if (Object.keys(set).length) tune(set);
      },
      /** Point de l'écran → position dans l'image de la caméra (fractions 0…1) */
      toVideo(x, y) {
        const v = view.querySelector('video'); if (!v || !v.videoWidth) return null;
        const vr = v.getBoundingClientRect();
        const scale = (view.classList.contains('live-cover') ? Math.max : Math.min)(vr.width / v.videoWidth, vr.height / v.videoHeight);
        const ox = vr.left + (vr.width - v.videoWidth * scale) / 2, oy = vr.top + (vr.height - v.videoHeight * scale) / 2;
        const cl = (t) => Math.min(1, Math.max(0, t));
        return { x: cl((x - ox) / scale / v.videoWidth), y: cl((y - oy) / scale / v.videoHeight) };
      },
      get video() { return view.querySelector('video'); },
      /** Zone du cadre jaune (+ marge) dans la vidéo, en pixels de la vidéo */
      // m : marge autour du cadre jaune (6 % pour le suivi de la certification, réglé ainsi pour les dos)
      region(m = 0.06) {
        const v = view.querySelector('video'); if (!v || !v.videoWidth) return null;
        let sx = 0, sy = 0, sw = v.videoWidth, sh = v.videoHeight, g = null;
        if (guide) {
          const vr = v.getBoundingClientRect(), gr = view.querySelector('.scan-guide').getBoundingClientRect();
          const scale = (view.classList.contains('live-cover') ? Math.max : Math.min)(vr.width / v.videoWidth, vr.height / v.videoHeight);
          const ox = vr.left + (vr.width - v.videoWidth * scale) / 2, oy = vr.top + (vr.height - v.videoHeight * scale) / 2;
          sx = Math.max(0, (gr.left - ox) / scale - gr.width / scale * m); sy = Math.max(0, (gr.top - oy) / scale - gr.height / scale * m);
          sw = Math.min(v.videoWidth - sx, gr.width / scale * (1 + 2 * m)); sh = Math.min(v.videoHeight - sy, gr.height / scale * (1 + 2 * m));
          g = { x: (gr.left - ox) / scale, y: (gr.top - oy) / scale, w: gr.width / scale, h: gr.height / scale };
        }
        return { sx, sy, sw, sh, g };
      },
      /**
       * Image du flux vidéo ; avec guide, la zone du cadre jaune + 15 % de marge (v2.92, demande d'Arnaud : une carte
       * un peu trop grande ou décalée n'est plus coupée). this.zone = position du cadre jaune dans l'image (fractions).
       */
      frame(r, vid) { // (vid : la vidéo, même retirée de la page — v3.35 : sinon plus rien après l'image figée)
        const v = vid || view.querySelector('video'), { sx, sy, sw, sh } = r;
        const c = document.createElement('canvas'); c.width = sw; c.height = sh;
        c.getContext('2d').drawImage(v, sx, sy, sw, sh, 0, 0, sw, sh);
        return c;
      },
      capture(m = 0.15) {
        const r = this.region(m); if (!r) return null;
        const { sx, sy, sw, sh, g } = r, c = this.frame(r);
        this.lastCanvas = c; // (affichable tout de suite, avant l'encodage JPEG qui prend jusqu'à 1 s)
        this.zone = g ? { x: (g.x - sx) / sw, y: (g.y - sy) / sh, w: g.w / sw, h: g.h / sh } : { x: 0, y: 0, w: 1, h: 1 };
        return new Promise((res) => c.toBlob(res, 'image/jpeg', 0.95));
      },
      /**
       * v3.30 : photo d'une carte (carte seule), la plus nette possible. Même cadrage que capture() (cadre + 15 %,
       * this.lastCanvas et this.zone tout de suite) mais : (1) vraie photo du capteur (ImageCapture, Chrome Android :
       * traitement de l'appareil photo, 3 à 6× plus de pixels sur la carte), ramenée sur le cadre par alignStill ;
       * (2) sinon (iPhone, photo pas alignée ou floue), l'image la plus nette parmi les 400 ms qui suivent l'appui
       * (l'appui sur l'écran fait bouger le téléphone : la 1ʳᵉ image est souvent floue).
       */
      // (useStill = faux : seulement l'image vidéo la plus nette — rafale, quand la vraie photo n'a pas marché une fois)
      shot(m = 0.15, { useStill = true } = {}) {
        const v = view.querySelector('video'), r = this.region(m); if (!r) return null;
        const first = this.frame(r), { sx, sy, sw, sh, g } = r, vw = v.videoWidth, vh = v.videoHeight;
        this.lastCanvas = first;
        this.zone = g ? { x: (g.x - sx) / sw, y: (g.y - sy) / sh, w: g.w / sw, h: g.h / sh } : { x: 0, y: 0, w: 1, h: 1 };
        const S = App.views.scan;
        const stillP = !useStill ? Promise.resolve(null) : this.still().then((b) => (b ? S.alignStill(b, first, vw, vh, r) : null)).catch((e) => { console.warn('Photo pleine résolution impossible', e); return null; });
        const framesP = (async () => {
          let best = first, bs = S.sharpness(first);
          // (l'écran remplace la vidéo par l'image figée : une vidéo retirée de la page se met en pause, on la relance)
          setTimeout(() => { if (stream && v.paused) v.play().catch(() => {}); }, 0);
          for (let i = 0; i < 4 && stream; i++) {
            await new Promise((res) => setTimeout(res, 90));
            if (!stream || !v.videoWidth) break;
            const c = this.frame(r, v), s = S.sharpness(c);
            if (s > bs) { best = c; bs = s; }
          }
          return { c: best, s: bs };
        })();
        const toBlob = (c) => new Promise((res) => { try { c.toBlob(res, 'image/jpeg', 0.95); } catch (e) { res(null); } });
        const work = (async () => {
          // v3.35 : la vraie photo a 5,5 s au plus (alignement compris) ; sinon on garde l'image vidéo
          const [st, fr] = await Promise.all([within(stillP, 5500), framesP]);
          // vraie photo gardée sauf si nettement plus floue que la meilleure image vidéo (carte bougée pendant la prise)
          const c = st && S.sharpness(st) >= 0.5 * fr.s ? st : fr.c;
          this.lastSource = c === st ? 'photo' : 'video';
          return (await toBlob(c)) || (c !== first ? toBlob(first) : null);
        })().catch((e) => { console.warn('Photo impossible, image figée utilisée', e); this.lastSource = 'video'; return toBlob(first); });
        // filet de sécurité (v3.35 : sur certains téléphones, l'appareil photo ne répondait jamais → « photo en cours » sans fin)
        return within(work, 7000).then((b) => b || toBlob(first));
      },
      /** Vraie photo du capteur (Blob) ou null ; flash coupé (reflets sur la carte), 5 s au plus en tout */
      async still() {
        const t = track(); if (!t || !window.ImageCapture) return null;
        const ic = new ImageCapture(t), opts = {};
        // (getPhotoCapabilities ne répond jamais sur certains Android : 1 s au plus)
        try { const pc = await within(ic.getPhotoCapabilities(), 1000); if (pc && (pc.fillLightMode || []).includes('off')) opts.fillLightMode = 'off'; } catch (e) { /* */ }
        const b = await within(ic.takePhoto(opts).catch(() => null), 4000);
        return b && b.size > 50000 ? b : null;
      },
      /**
       * Vraie photo en pleine résolution (capteur complet, ex. 12 Mpx) quand le navigateur le permet
       * (Chrome Android) ; sinon, image du flux vidéo. Indispensable pour une page de 9 cartes.
       */
      async photo() {
        try { const b = await this.still(); if (b) return b; } catch (e) { console.warn('Photo pleine résolution impossible, image vidéo utilisée', e); }
        return this.capture();
      },
      stop() {
        clearTimeout(focusT); view.removeEventListener('click', onTap);
        if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
        view.classList.remove('live-cover', 'live-fit'); view.style.aspectRatio = ''; view.style.removeProperty('--vr');
      },
      get on() { return !!stream; },
    };
    return cam;
  },

  /** Netteté d'une image (variance du laplacien sur sa version de 360 px de large, centre 80 %) */
  sharpness(src) {
    const W = src.width, H = src.height; if (!W || !H) return 0;
    const w = Math.min(360, W), h = Math.max(8, Math.round(H * w / W));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(src, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data, L = new Float32Array(w * h);
    for (let i = 0, j = 0; j < L.length; i += 4, j++) L[j] = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    let n = 0, s = 0, s2 = 0;
    for (let y = Math.round(h * 0.1); y < h * 0.9 - 1; y++) {
      for (let x = Math.round(w * 0.1); x < w * 0.9 - 1; x++) {
        const k = y * w + x, l = 4 * L[k] - L[k - 1] - L[k + 1] - L[k - w] - L[k + w];
        n++; s += l; s2 += l * l;
      }
    }
    return n ? s2 / n - (s / n) ** 2 : 0;
  },

  /**
   * v3.38 (« Qualité photos », points 2 et 3) : qualité d'une image de carte, mesurée sur 200 px de large (r = zone en pixels de
   * la source, toute l'image sinon). `sharp` = Σ|laplacien| / Σ|gradient| : ne dépend ni de la lumière ni du contraste —
   * mesuré : 0,69–1,26 sur les vraies photos nettes (Pokémon, One Piece, Riftbound, Lorcana, Yu-Gi-Oh!), 0,54–0,62 avec un flou
   * de 2 px à 600 px de large, où la lecture échoue déjà (1,5 px aussi). `mean` = luminosité, `sd` = contraste (< 16 : pas de
   * carte), `glare` = part de pixels brûlés (presque blancs), `L` = l'image en gris (pour voir si la carte bouge).
   */
  quality(src, r = null) {
    const sx = r ? r.sx : 0, sy = r ? r.sy : 0, sw = r ? r.sw : (src.videoWidth || src.width), sh = r ? r.sh : (src.videoHeight || src.height);
    if (!sw || !sh) return null;
    const w = 200, h = Math.max(16, Math.round(sh * w / sw));
    const c = App.views.scan._qc || (App.views.scan._qc = document.createElement('canvas'));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const g = c.getContext('2d', { willReadFrequently: true }); g.imageSmoothingQuality = 'high'; g.drawImage(src, sx, sy, sw, sh, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data, L = new Float32Array(w * h);
    let m = 0, m2 = 0, burnt = 0;
    for (let i = 0, j = 0; j < L.length; i += 4, j++) {
      const v = L[j] = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
      m += v; m2 += v * v; if (d[i] >= 240 && d[i + 1] >= 240 && d[i + 2] >= 240) burnt++;
    }
    let sl = 0, sg = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1, k = y * w + 1; x < w - 1; x++, k++) {
        sl += Math.abs(4 * L[k] - L[k - 1] - L[k + 1] - L[k - w] - L[k + w]);
        sg += Math.hypot(L[k + 1] - L[k - 1], L[k + w] - L[k - w]);
      }
    }
    m /= L.length;
    return { sharp: sg ? sl / sg : 0, mean: m, sd: Math.sqrt(Math.max(0, m2 / L.length - m * m)), glare: burnt / L.length, L };
  },
  /**
   * Problème d'une image (quality) qui vaut un conseil, sinon '' — seulement les cas où la carte risque vraiment de ne pas être
   * reconnue (Arnaud : « que si c'est primordial, il ne faut pas que ça devienne envahissant »). blur = seuil de netteté.
   */
  problem(q, blur = 0.6) {
    if (!q) return '';
    if (q.mean < 40) return 'sombre';
    if (q.sd < 16) return ''; // (pas de carte dans le cadre)
    if (q.glare > 0.05 && q.glare < 0.6) return 'reflet'; // (plus de 60 % : une surface blanche, pas un reflet)
    return q.sharp < blur ? 'flou' : '';
  },
  TIPS: {
    sombre: 'Trop sombre : approche-toi d’une lampe',
    reflet: 'Reflet sur la carte : incline-la un peu',
    flou: 'Image floue : recule un peu la carte, ou touche l’écran',
  },
  /**
   * v3.38 : conseil sur la caméra (carte seule), seulement quand il le faut : le même problème vu pendant 1,2 s (le flou
   * seulement si la carte est immobile : bouger rend flou, c'est normal) ; retiré dès qu'il est réglé.
   * skip() vrai = aucun conseil (photo en cours, lampe de la certification). Renvoie la fonction qui l'arrête.
   */
  tipWatch(cam, view, skip = () => false) {
    const S = App.views.scan;
    let prev = null, still = 0, cand = '', n = 0, shown = '';
    const show = (k) => {
      if (k === shown) return; shown = k;
      let t = view.querySelector('.shot-tip');
      if (!k) { if (t) t.remove(); return; }
      if (!t) { t = document.createElement('div'); t.className = 'shot-tip'; t.setAttribute('role', 'status'); view.appendChild(t); }
      t.textContent = S.TIPS[k];
    };
    const tick = () => {
      const v = cam.on && !skip() ? cam.video : null, r = v && v.videoWidth ? cam.region(0) : null;
      if (!r) { prev = null; still = 0; n = 0; show(''); return; }
      const q = S.quality(v, r); if (!q) return;
      let diff = 99;
      if (prev && prev.length === q.L.length) { diff = 0; for (let i = 0; i < q.L.length; i += 7) diff += Math.abs(q.L[i] - prev[i]); diff /= Math.ceil(q.L.length / 7); }
      prev = q.L; still = diff < 4 + q.sd * 0.08 ? still + 1 : 0;
      let k = S.problem(q, 0.55); // (vidéo : un peu moins nette qu'une photo)
      if (k === 'flou' && still < 3) k = '';
      if (k !== cand) { cand = k; n = 0; }
      if (++n >= 4) show(k); else if (k !== shown) show(''); // (réglé, ou autre problème pas encore confirmé)
    };
    const timer = setInterval(tick, 300);
    return () => { clearInterval(timer); show(''); };
  },

  /**
   * v3.30 : vraie photo (blob) → la même zone que `ref` (image vidéo de la zone r, vidéo vw × vh), en pleine résolution
   * (2400 px au plus). La photo n'a pas toujours le même sens ni le même champ que la vidéo (4:3 contre 16:9, vidéo
   * stabilisée = un peu plus serrée) : sens (0/180° ou 90/270°) et champ cherchés en comparant avec `ref` ;
   * null si rien ne correspond nettement (on garde alors la vidéo).
   */
  async alignStill(blob, ref, vw, vh, r, maxSide = 2400) {
    const bmp = await createImageBitmap(blob);
    try {
      const G = 64, GH = Math.max(8, Math.min(192, Math.round(G * r.sh / r.sw)));
      // image en gris réduite une seule fois (≈ 2 pixels par case), puis cases lues par interpolation (rapide)
      const grayImg = (draw, w, h) => {
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const g = c.getContext('2d', { willReadFrequently: true }); g.imageSmoothingQuality = 'high'; draw(g);
        const d = g.getImageData(0, 0, w, h).data, o = new Float32Array(w * h);
        for (let i = 0, j = 0; j < o.length; i += 4, j++) o[j] = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
        return { d: o, w, h };
      };
      const grayOf = (im, x, y, w, h) => {
        const o = new Float32Array(G * GH);
        for (let j = 0; j < GH; j++) {
          const py = Math.min(im.h - 1.001, Math.max(0, y + (j + 0.5) * h / GH - 0.5)), yi = py | 0, fy = py - yi;
          for (let i = 0; i < G; i++) {
            const px = Math.min(im.w - 1.001, Math.max(0, x + (i + 0.5) * w / G - 0.5)), xi = px | 0, fx = px - xi, a = yi * im.w + xi;
            o[j * G + i] = (im.d[a] * (1 - fx) + im.d[a + 1] * fx) * (1 - fy) + (im.d[a + im.w] * (1 - fx) + im.d[a + im.w + 1] * fx) * fy;
          }
        }
        return o;
      };
      const corr = (a, b) => {
        let ma = 0, mb = 0; for (let i = 0; i < a.length; i++) { ma += a[i]; mb += b[i]; } ma /= a.length; mb /= b.length;
        let ab = 0, aa = 0, bb = 0; for (let i = 0; i < a.length; i++) { const x = a[i] - ma, y = b[i] - mb; ab += x * y; aa += x * x; bb += y * y; }
        return aa && bb ? ab / Math.sqrt(aa * bb) : 0;
      };
      const want = grayOf(grayImg((g) => g.drawImage(ref, 0, 0, 2 * G, 2 * GH), 2 * G, 2 * GH), 0, 0, 2 * G, 2 * GH);
      const land = bmp.width >= bmp.height, vland = vw >= vh;
      let best = null;
      for (const rot of land === vland ? [0, 180] : [90, 270]) {
        const W = rot % 180 ? bmp.height : bmp.width, H = rot % 180 ? bmp.width : bmp.height;
        const k = Math.min(1, 2 * G / (r.sw * Math.min(W / vw, H / vh) * 0.8));
        const sm = grayImg((g) => { g.scale(k, k); App.views.scan.drawRot(g, bmp, rot, W, H); }, Math.round(W * k), Math.round(H * k));
        const tryAt = (z, dx = 0, dy = 0) => {
          const s = Math.min(W / vw, H / vh) * z, ox = (W - vw * s) / 2 + dx * W, oy = (H - vh * s) / 2 + dy * H;
          const rect = { x: ox + r.sx * s, y: oy + r.sy * s, w: r.sw * s, h: r.sh * s };
          const c = corr(want, grayOf(sm, rect.x * k, rect.y * k, rect.w * k, rect.h * k));
          const o = { c, rot, rect, W, H, z, dx, dy };
          if (!best || c > best.c) best = o;
          return o;
        };
        // champ grossier (vidéo stabilisée = 0 à 20 % plus serrée), puis affiné (champ et petit décalage)
        let top = null;
        for (const z of [1, 0.96, 0.92, 0.88, 0.84, 0.8]) for (const dx of [-0.02, 0, 0.02]) for (const dy of [-0.02, 0, 0.02]) { const o = tryAt(z, dx, dy); if (!top || o.c > top.c) top = o; }
        for (const st of [0.01, 0.005, 0.0025, 0.00125]) {
          for (let pass = 0; pass < 4; pass++) {
            const c0 = top;
            for (const dz of [-1, 0, 1]) for (const ex of [-1, 0, 1]) for (const ey of [-1, 0, 1]) {
              if (dz || ex || ey) { const o = tryAt(c0.z + dz * st, c0.dx + ex * st, c0.dy + ey * st); if (o.c > top.c) top = o; }
            }
            if (top === c0) break;
          }
        }
      }
      if (!best || best.c < 0.6) { console.warn('Photo pas alignée sur la vidéo', best && best.c); return null; }
      const { rect, rot, W, H } = best, k = Math.min(1, maxSide / Math.max(rect.w, rect.h));
      const out = document.createElement('canvas'); out.width = Math.round(rect.w * k); out.height = Math.round(rect.h * k);
      const og = out.getContext('2d'); og.imageSmoothingQuality = 'high';
      og.scale(k, k); og.translate(-rect.x, -rect.y); App.views.scan.drawRot(og, bmp, rot, W, H);
      out.alignScore = best.c;
      return out;
    } finally { if (bmp.close) bmp.close(); }
  },
  /** Dessine `img` tournée de `rot` degrés (sens horaire) dans un repère W × H (taille une fois tournée) */
  drawRot(g, img, rot, W, H) {
    g.save();
    if (rot === 90) { g.translate(W, 0); g.rotate(Math.PI / 2); } else if (rot === 180) { g.translate(W, H); g.rotate(Math.PI); } else if (rot === 270) { g.translate(0, H); g.rotate(-Math.PI / 2); }
    g.drawImage(img, 0, 0); g.restore();
  },
};
