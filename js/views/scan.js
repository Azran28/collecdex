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
      <span>${mode === 'rafale' ? 'Appuie sur « Démarrer la rafale » ou « Choisir des photos »' : mode === 'classeur' ? 'Appuie sur « Prendre la page en photo »' : 'Appuie sur « Caméra » ou « Choisir une photo »'}</span>
    </div>`;
  },

  /**
   * Aide à côté de la photo tant qu'il n'y a pas de résultat : allégée en v2.39 (demande d'Arnaud) — seulement le geste
   * de la certification en carte seule (connecté) ; le reste s'explique tout seul (la grille et la recherche sont automatiques).
   */
  guide(mode) {
    const certOn = App.certify && App.certify.available();
    if (mode !== 'carte' || !certOn) return '';
    const on = App.settings.certCarte !== false; // v2.58 : certification optionnelle en carte seule (demande d'Arnaud)
    return App.views.scan.certBlock('carte', App.views.scan.certSwitch('sc-certon', on, `${App.icons.icon('shield', 16)} Certification`));
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

  /** « Set de Base (1999) » */
  setLabel(c) { return c.set ? `${c.set.name}${c.set.releaseDate ? ' (' + c.set.releaseDate.slice(0, 4) + ')' : ''}` : (c.setId || ''); },

  /** Licences proposées dans Capturer (actives et branchées) */
  games() { return App.games.list.filter((g) => g.status === 'actif' && App.games.get(g.id)); },
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
  /** Puces des licences en haut de Capturer : « Auto » (toutes les licences) puis chaque licence ; en auto, la licence reconnue */
  gameChips(game, auto, mode = '') {
    const { esc } = App.util, games = App.views.scan.games(), m = mode && mode !== 'carte' ? `mode=${mode}&` : '';
    if (games.length < 2) return '';
    const chip = (id, icon, name, on) => `<a class="chip ${on ? 'on' : ''}" href="#/scan?${m}jeu=${id}" data-game="${id}" role="tab" aria-selected="${on}">${App.icons.icon(icon, 14)} ${esc(name)}</a>`;
    return `<div class="chips sc-game" role="tablist" aria-label="Licence des cartes">${chip(App.views.scan.AUTO, 'sparkles', 'Toutes', auto)}${games.map((g) => chip(g.id, g.icon, g.name, !auto && g.id === game)).join('')}</div>
      <div class="small muted sc-autogame" ${auto ? '' : 'hidden'}>${auto ? App.views.scan.autoLabel(game, false) : ''}</div>`;
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
   * Choix de la licence avant Capturer (v3.11, demande d'Arnaud) : une tuile par licence + « Toutes les licences »
   * (la licence de chaque carte est reconnue toute seule). Même présentation que le choix de licence du Combat.
   */
  async picker(el, params, alive) {
    const { esc } = App.util, I = App.icons.icon;
    const mode = ['classeur', 'rafale'].includes(params.query.mode) ? params.query.mode : '';
    let last = ''; try { last = sessionStorage.getItem('scanGame') || localStorage.getItem('scanGameLast') || ''; } catch (e) { /* */ }
    const href = (g) => `#/scan?jeu=${g}${mode ? '&mode=' + mode : ''}`;
    const games = App.views.scan.games();
    const rows = await Promise.all(games.map(async (g) => {
      const items = App.col.all().filter((i) => i.qty > 0 && (i.game || 'pokemon') === g.id).sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
      const imgs = await Promise.all(items.slice(0, 3).map((it) => App.col.displayImage(it, App.games.get(g.id)).catch(() => null)));
      return { g, n: items.length, imgs: imgs.filter(Boolean) };
    }));
    if (!alive()) return;
    const total = rows.reduce((s, r) => s + r.n, 0);
    const lastTag = (id) => (id === last ? '<em class="sp-last">Dernière utilisée</em>' : '');
    const tile = (r) => `<a class="bt-lic-tile sp-tile g-${r.g.id}" href="${href(r.g.id)}" data-game="${r.g.id}">
        <span class="bt-lic-ic">${I(r.g.icon, 24)}</span>
        <span class="bt-lic-t"><b>${esc(r.g.name)}</b><span>${esc(r.g.desc)}</span>
          <small>${r.n ? `${r.n} carte${r.n > 1 ? 's' : ''} dans ton Dex` : 'Aucune carte dans ton Dex'} ${lastTag(r.g.id)}</small></span>
        ${r.imgs.length ? `<span class="bt-lic-cards">${r.imgs.map((x) => `<img src="${esc(x.src)}" alt="">`).join('')}</span>` : ''}
        <span class="bt-lic-go">›</span></a>`;
    el.innerHTML = `
      <div class="breadcrumb"><a href="#/">Accueil</a> › Capturer</div>
      <h1 style="margin:0 0 4px">Capturer</h1>
      <p class="bt-lead">Quelle licence vas-tu capturer ? Tu pourras en changer en haut de l’écran.</p>
      <div class="bt-lics sp-lics">
        <a class="bt-lic-tile sp-tile g-auto" href="${href(App.views.scan.AUTO)}" data-game="auto">
          <span class="bt-lic-ic">${I('sparkles', 24)}</span>
          <span class="bt-lic-t"><b>Toutes les licences</b><span>Scanne n’importe quelle carte : CollecDex reconnaît sa licence tout seul.</span>
            <small>${games.map((g) => esc(g.name)).join(' · ')} ${lastTag('auto')}</small></span>
          <span class="bt-lic-go">›</span></a>
        ${rows.map(tile).join('')}
      </div>
      <p class="small muted bt-soon">${total ? `${total} carte${total > 1 ? 's' : ''} dans ton Dex. ` : ''}Choisir la licence est un peu plus rapide et plus sûr que « Toutes les licences ».</p>`;
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
    const T = texts.join('\n'), rb = App.games.get('riftbound');
    const score = {
      riftbound: (rb && rb.codesIn && rb.codesIn(T).length ? 2 : 0) + [/\bRG[Il1]\b/, /\bUNIT[ÉE](?![A-Za-zÀ-ÿ])/, /\bL[ÉE]GENDE\b/, /\bRUNE\b/, /CHAMP\s+DE\s+BATAILLE|BATTLEFIELD/i, /comp[ée]tence|canalis/i, /\bSORT\b|\bSPELL\b/, /\bUNIT\b/].filter((r) => r.test(T)).length,
      onepiece: (/(OP|[0©(C]P|ST|EB|PRB)\s?[0-9OIS]{2}\s?[-–—_.]\s?[0-9OIS]{3}/i.test(T) ? 2 : 0) + [/\b(OP|ST|EB|PRB)\s?\d{2}\s?-\s?\d{3}\b/i, /bandai/i, /DON\s*!!/i, /\bCOUNTER\b|\bCONTRE\b/i, /\bLEADER\b/i, /d[ée]clenchement|trigger/i, /\b(personnage|character)\b/i].filter((r) => r.test(T)).length,
      pokemon: [/\b(PV|HP)\s*\d{2,3}\b|\b\d{2,3}\s*(PV|HP)\b/, /pok[eé]mon/i, /nintendo|game\s*freak|creatures/i, /faiblesse|weakness/i, /r[ée]sistance|resistance/i, /retraite|retreat/i, /\bdresseur\b|\btrainer\b/i, /[ée]nergie|energy/i].filter((r) => r.test(T)).length,
    };
    const [best, second] = Object.entries(score).sort((a, b) => b[1] - a[1]);
    return best[1] >= 2 && best[1] >= second[1] + 2 ? best[0] : '';
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
    el.innerHTML = `
      <div class="breadcrumb"><a href="#/">Accueil</a> › Capturer</div>
      <h1 class="m-hide" style="margin:0 0 4px">Capturer</h1>
      <div class="mode-pick" role="tablist">
        <a class="mode-card ${mode === 'carte' ? 'on' : ''}" href="${link('')}" role="tab" aria-selected="${mode === 'carte'}">
          <span class="mc-ico">${App.icons.icon('capture', 22)}</span>
          <span class="mc-txt"><b>Une carte</b><span>Carte par carte, la plus fiable</span></span>
          ${mode === 'carte' ? `<span class="mc-check">${App.icons.icon('shield', 14)}</span>` : ''}
        </a>
        <a class="mode-card ${mode === 'classeur' ? 'on' : ''}" href="${link('classeur')}" role="tab" aria-selected="${mode === 'classeur'}">
          <span class="mc-ico">${App.icons.icon('dex', 22)}</span>
          <span class="mc-txt"><b class="m-hide">Page de classeur</b><b class="d-hide">Classeur</b><span>Jusqu’à 18 cartes d’un coup</span></span>
          ${mode === 'classeur' ? `<span class="mc-check">${App.icons.icon('shield', 14)}</span>` : ''}
        </a>
        <a class="mode-card ${mode === 'rafale' ? 'on' : ''}" href="${link('rafale')}" role="tab" aria-selected="${mode === 'rafale'}">
          <span class="mc-ico">${App.icons.icon('rafale', 22)}</span>
          <span class="mc-txt"><b>Rafale</b><span>Les cartes défilent, sans cliquer</span></span>
        </a>
        <button type="button" class="sc-help d-hide" id="sc-help" aria-label="Mode d’emploi de Capturer">?</button>
      </div>
      <div id="sc-body"></div>`;
    const body = el.querySelector('#sc-body');
    // téléphone : mode d'emploi à la 1re visite, et bouton « ? » pour le revoir
    el.querySelector('#sc-help').addEventListener('click', () => App.onboarding.showScan());
    App.onboarding.maybeShowScan();
    const cleanup = mode === 'carte' ? await App.views.scan.single(body, params, alive) : await App.views.scan.batch(body, params, alive, mode === 'rafale');
    return () => { if (cleanup) cleanup(); App.recognizer.stop(); };
  },

  /* ================= Caméra (partagée par les deux modes) ================= */
  camera(view, { guide }) {
    let stream = null;
    return {
      async start() {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 3840 }, height: { ideal: 2160 } }, audio: false });
        view.innerHTML = `<video autoplay playsinline muted></video>${guide ? '<div class="scan-guide"></div>' : ''}`;
        const v = view.querySelector('video');
        v.srcObject = stream;
        // pas de grandes bandes noires : en mode carte la vidéo remplit le cadre (on ne cadre que la carte),
        // en mode classeur la zone prend la forme exacte de l'image (on voit toute la page)
        v.addEventListener('loadedmetadata', () => {
          if (guide) view.classList.add('live-cover');
          else { view.classList.add('live-fit'); view.style.aspectRatio = `${v.videoWidth} / ${v.videoHeight}`; view.style.setProperty('--vr', v.videoHeight / v.videoWidth); }
        }, { once: true });
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
      capture(m = 0.15) {
        const v = view.querySelector('video'), r = this.region(m); if (!r) return null;
        const { sx, sy, sw, sh, g } = r;
        const c = document.createElement('canvas'); c.width = sw; c.height = sh;
        c.getContext('2d').drawImage(v, sx, sy, sw, sh, 0, 0, sw, sh);
        this.lastCanvas = c; // (affichable tout de suite, avant l'encodage JPEG qui prend jusqu'à 1 s)
        this.zone = g ? { x: (g.x - sx) / sw, y: (g.y - sy) / sh, w: g.w / sw, h: g.h / sh } : { x: 0, y: 0, w: 1, h: 1 };
        return new Promise((res) => c.toBlob(res, 'image/jpeg', 0.95));
      },
      /**
       * Vraie photo en pleine résolution (capteur complet, ex. 12 Mpx) quand le navigateur le permet
       * (Chrome Android) ; sinon, image du flux vidéo. Indispensable pour une page de 9 cartes.
       */
      async photo() {
        const track = stream && stream.getVideoTracks()[0];
        if (track && window.ImageCapture) {
          try {
            const ic = new ImageCapture(track);
            const b = await ic.takePhoto();
            if (b && b.size > 50000) return b;
          } catch (e) { console.warn('Photo pleine résolution impossible, image vidéo utilisée', e); }
        }
        return this.capture();
      },
      stop() {
        if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
        view.classList.remove('live-cover', 'live-fit'); view.style.aspectRatio = ''; view.style.removeProperty('--vr');
      },
      get on() { return !!stream; },
    };
  },
};
