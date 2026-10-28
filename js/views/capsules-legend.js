/*
 * Apparitions des grands légendaires et fabuleux : à la place des secousses de la capsule, une scène de 4 à 7 s
 * tirée de l'animé ou des jeux, puis la capsule éclate et le Pokémon apparaît normalement.
 * Impossible à passer la première fois (App.capsuleFx.seen), passable ensuite. Rien ne change au tirage.
 * Hiérarchie (Arnaud) : Arceus (capsules-god.js) > Rayquaza (~7 s) > Mewtwo (~5,5 s) > les autres (~4 s) ; Carapuce = clin d'œil (capsules-fx.js).
 * Chaque entrée : back / front = décor derrière / devant la capsule ; steps = [moment en ms, classe posée sur .cap-ov]
 * (« q » = l'écran tremble, « f » = éclair de la couleur --lgf, « r » = ondes de choc, « t » = la foudre éclaire les nuages) ; burst = moment où la capsule éclate ;
 * title = bannière à la place de « Légendaire ! » ; vars = variables CSS posées sur .cap-ov.
 * Les classes d'étape commencent par « s- » (ou lg-on / lg-l1… / lg-p) : jamais le nom d'un élément du décor.
 * Styles : css/14-legendaires.css ; son : App.sfx.legend(key).
 */
App.capsuleLegend = (() => {
  const rnd = (a, b) => a + Math.random() * (b - a);
  const dots = (n, f) => Array.from({ length: n }, (_, i) => f(i)).join('');
  const sky = (bg) => `<div class="lg-sky" style="--sky:${bg}"></div>`;
  const text = (...lines) => lines.map((l, i) => `<p class="lg-text t${i + 1}">${l}</p>`).join('');
  /** Particules : dir = up (montent), down (tombent), side (traversent) ; forme = feather / petal / leaf (sinon ronde) */
  const parts = (n, dir, color, shape = '', size = [3, 7], dur = [2, 4]) => `<div class="lg-parts ${dir} ${shape}" style="--pc:${color}">${dots(n, () =>
    `<i style="${dir === 'side' ? `top:${rnd(0, 90).toFixed(1)}%` : `left:${rnd(0, 100).toFixed(1)}%`};--dl:${rnd(0, 2.5).toFixed(2)}s;--du:${rnd(dur[0], dur[1]).toFixed(2)}s;--s:${rnd(size[0], size[1]).toFixed(1)}px"></i>`)}</div>`;
  // étoiles : une seule petite tache recopiée par box-shadow (léger sur téléphone)
  const stars = (n) => `<div class="lg-stars"><i style="box-shadow:${Array.from({ length: n }, () => `${rnd(0, 100).toFixed(1)}vw ${rnd(0, 100).toFixed(1)}vh 0 ${Math.random() < 0.15 ? 1 : 0}px rgba(255,255,255,${rnd(0.3, 1).toFixed(2)})`).join(',')}"></i></div>`;
  const shocks = (n = 2) => dots(n, (i) => `<div class="lg-shock r${i + 1}"></div>`);
  const BOLT = '<path d="M38 0 L14 92 L32 92 L8 200 L52 74 L32 74 L50 0 Z"/>';
  // aile droite de Lugia (dessin original) : l'épaule en (0, 100), cinq grandes plumes aux pointes sombres
  const WING = 'M0 96 C 50 40, 150 6, 292 14 C 262 34, 250 44, 278 56 C 232 64, 220 76, 252 90 C 204 96, 192 108, 220 124 C 168 124, 140 138, 152 162 C 104 152, 60 136, 0 122 Z';

  const LEGENDS = {
    // Groudon : la sécheresse — un soleil écrasant, le sol se fend, la lave remonte
    383: {
      key: 'groudon',
      back: () => `<div class="lg-sky"></div><div class="lg-sun"></div>
        <svg class="lg-cracks" viewBox="0 0 400 300" preserveAspectRatio="none" aria-hidden="true">
          <path d="M200 300 L188 262 L212 230 L196 196 L214 160"/><path d="M200 300 L150 270 L128 240 L90 232 L60 200"/>
          <path d="M200 300 L250 274 L276 246 L318 238 L350 206"/><path d="M128 240 L120 205 L96 186"/><path d="M276 246 L290 210 L318 196"/>
        </svg><div class="lg-lava"></div>
        <div class="lg-embers">${dots(30, () => `<i style="left:${rnd(0, 100)}%;--dl:${rnd(0, 2.2).toFixed(2)}s;--du:${rnd(1.6, 3).toFixed(2)}s;--s:${rnd(2, 5).toFixed(1)}px"></i>`)}</div>
        <p class="lg-text t1">La terre se met à brûler…</p>`,
      front: () => '',
      steps: [[0, 'lg-on'], [200, 'lg-l1'], [600, 'q'], [1300, 'q'], [1900, 'lg-crack'], [2400, 'lg-heat'], [3000, 'q'], [3500, 'lg-erupt']],
      burst: 3700,
    },
    // Kyogre : le déluge — ciel noir, pluie torrentielle, éclairs, la mer monte et engloutit tout
    382: {
      key: 'kyogre',
      back: () => `<div class="lg-sky"></div><p class="lg-text t1">Les océans se soulèvent…</p>`,
      front: () => `<div class="lg-rain"></div>
        <svg class="lg-bolt b1" viewBox="0 0 60 200" aria-hidden="true">${BOLT}</svg><svg class="lg-bolt b2" viewBox="0 0 60 200" aria-hidden="true">${BOLT}</svg>
        <div class="lg-sea"><div class="lg-wave w1"></div><div class="lg-wave w2"></div>
          <div class="lg-bubbles">${dots(18, () => `<i style="left:${rnd(0, 100)}%;--dl:${rnd(0, 2).toFixed(2)}s;--du:${rnd(1.4, 2.6).toFixed(2)}s;--s:${rnd(4, 10).toFixed(1)}px"></i>`)}</div></div>`,
      steps: [[0, 'lg-on'], [200, 'lg-l1'], [900, 'lg-bolt1'], [1500, 'lg-rise'], [2400, 'lg-bolt2'], [2900, 'lg-surge'], [3150, 'q']],
      burst: 3600,
    },
    // Rayquaza (le 2e plus important après Arceus) : furieux et dangereux — un orage noir, deux yeux qui s'ouvrent
    // dans les nuages, l'écran vire au rouge, il charge une sphère d'énergie qui aspire tout, puis un rayon pulvérise la capsule
    384: {
      key: 'rayquaza', title: 'Seigneur des cieux', vars: { '--lgf': '#eafff1', '--lgr': '#7dffb0' },
      back: () => `${sky('linear-gradient(#010302 0%, #04100a 45%, #0a1c12 100%)')}
        <div class="lg-storm">${dots(8, (i) => `<i style="left:${(i * 13 - 10 + rnd(-4, 4)).toFixed(0)}%;top:${rnd(-6, 30).toFixed(0)}%;--w:${rnd(220, 380).toFixed(0)}px;--dl:${rnd(0, 2).toFixed(2)}s;--dx:${rnd(-70, 70).toFixed(0)}px;--dy:${rnd(-14, 14).toFixed(0)}px;--du:${rnd(2.4, 4.4).toFixed(2)}s"></i>`)}</div>
        <div class="lg-eyes"><i class="l"></i><i class="r"></i></div><div class="lg-danger"></div>
        <div class="lg-gather">${dots(30, () => `<i style="--a:${rnd(0, 360).toFixed(0)}deg;--d:${rnd(120, 240).toFixed(0)}px;--dl:${rnd(0, 0.9).toFixed(2)}s;--s:${rnd(5, 11).toFixed(1)}px"></i>`)}</div>
        <div class="lg-charge"></div><div class="lg-blast"></div>
        ${parts(26, 'up', '#7dffb0', '', [3, 7], [1.4, 2.6])}
        ${text('Le ciel s’assombrit d’un coup…', 'Quelque chose gronde au-dessus des nuages…', 'Il est furieux.')}`,
      front: () => `<div class="lg-beam"></div>
        <div class="lg-debris">${dots(20, () => `<i style="--a:${rnd(0, 360).toFixed(0)}deg;--d:${rnd(120, 260).toFixed(0)}px;--rt:${rnd(-300, 300).toFixed(0)}deg;--s:${rnd(8, 20).toFixed(0)}px"></i>`)}</div>`,
      steps: [[0, 'lg-on'], [200, 'lg-l1'], [900, 't'], [950, 'q'], [1600, 'lg-l2'], [1900, 's-eyes'], [1950, 'q'], [2700, 's-glare'], [2750, 'q'],
        [2300, 't'], [3400, 'lg-l3'], [3600, 's-charge'], [4100, 't'], [3700, 'q'], [4300, 'q'], [4900, 'q'], [4950, 't'], [5300, 's-beam'], [5600, 's-impact'], [5600, 'f'], [5620, 'q'], [5650, 'lg-p'], [6100, 'q']],
      burst: 6600,
    },
    // Mewtwo : le laboratoire du 1er film — la cuve, l'alarme, le verre qui se fend puis vole en éclats,
    // figé en l'air par la télékinésie, puis une onde psy
    150: {
      key: 'mewtwo', title: 'Créé par l’homme', vars: { '--lgf': '#d9b8ff', '--lgr': '#b07cff' },
      back: () => `${sky('linear-gradient(#010604, #04120d 60%, #081c16)')}<div class="lg-lab"></div>
        <div class="lg-tube"><div class="lg-liquid"></div>${parts(14, 'up', 'rgba(170,255,210,.8)', 'bubble', [4, 9], [1.4, 2.6])}</div>
        <div class="lg-alarm"></div><div class="lg-psy"></div>${shocks(3)}
        ${text('Laboratoire secret, île Nouvelle…', '« Qui m’a créé… et pourquoi ? »')}`,
      front: () => `<svg class="lg-glass" viewBox="0 0 180 300" aria-hidden="true">
          <path class="c1" d="M90 120 L70 95 L60 60 M90 120 L118 100 L130 70 M90 120 L80 160 L58 190"/>
          <path class="c2" d="M90 120 L120 150 L140 200 M90 120 L50 128 L28 150 M90 120 L100 60 L96 20 M80 160 L100 220 L92 270"/></svg>
        <div class="lg-shards">${dots(16, () => `<i style="--a:${rnd(0, 360).toFixed(0)}deg;--d:${rnd(90, 170).toFixed(0)}px;--rt:${rnd(-200, 200).toFixed(0)}deg;--s:${rnd(8, 18).toFixed(0)}px"></i>`)}</div>`,
      steps: [[0, 'lg-on'], [200, 'lg-l1'], [1000, 's-alarm'], [1500, 's-crack1'], [1550, 'q'], [2100, 's-crack2'], [2150, 'q'], [2600, 'lg-l2'],
        [3000, 's-shatter'], [3000, 'f'], [3050, 'q'], [3450, 's-freeze'], [3700, 's-psy'], [4500, 'r'], [4550, 'q']],
      burst: 4900,
    },
    // Mew : une petite bulle rose qui joue autour de la capsule, des loopings, un rire… et le camion des rumeurs
    151: {
      key: 'mew', vars: { '--lgf': '#ffe0f0', '--lgr': '#ff9ccf' },
      back: () => `${sky('linear-gradient(#ffd1e8 0%, #c9d9ff 60%, #a9e4ff 100%)')}<div class="lg-fluff">${dots(5, () => `<i style="left:${rnd(-10, 80).toFixed(0)}%;top:${rnd(5, 70).toFixed(0)}%;--w:${rnd(90, 180).toFixed(0)}px"></i>`)}</div>
        <svg class="lg-truck" viewBox="0 0 120 60" aria-hidden="true"><rect x="2" y="8" width="72" height="38" rx="3"/><path d="M76 20 H100 L116 34 V46 H76 Z"/><circle cx="22" cy="50" r="8"/><circle cx="96" cy="50" r="8"/></svg>
        ${parts(22, 'up', '#ffffff', '', [2, 5], [2.2, 3.6])}${shocks(2)}${text('Un petit rire résonne…', 'Il paraît qu’il se cache sous un camion…')}`,
      front: () => '<div class="lg-orbit"><div class="lg-bubble"></div></div>',
      steps: [[0, 'lg-on'], [200, 'lg-l1'], [300, 'lg-p'], [500, 's-orbit'], [1600, 's-loop'], [2000, 'lg-l2'], [2900, 's-pop'], [2900, 'f'], [2950, 'r']],
      burst: 3300,
    },
    // Giratina : le Monde Distorsion — un portail s'ouvre, tout bascule à l'envers, des ombres rampent, puis tout se remet d'aplomb
    487: {
      key: 'giratina', vars: { '--lgf': '#ff4d4d', '--lgr': '#ffcf5a' },
      back: () => `${sky('linear-gradient(#050008, #14031f 50%, #22062e)')}
        <div class="lg-world">${dots(9, () => `<i style="left:${rnd(0, 90).toFixed(0)}%;top:${rnd(0, 90).toFixed(0)}%;--w:${rnd(40, 110).toFixed(0)}px;--rt:${rnd(-30, 30).toFixed(0)}deg;--dl:${rnd(0, 2).toFixed(2)}s"></i>`)}</div>
        <div class="lg-portal"></div>
        <svg class="lg-shadows" viewBox="0 0 400 300" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 300 C 40 240, 10 200, 60 160 S 70 90, 40 60"/><path d="M400 300 C 360 250, 390 190, 340 150 S 330 80, 370 40"/>
          <path d="M120 300 C 140 260, 100 230, 130 190"/><path d="M290 300 C 270 255, 310 230, 280 185"/></svg>
        ${shocks(2)}${text('Le Monde Distorsion s’ouvre…', 'Ici, tout est à l’envers.')}`,
      front: () => '',
      steps: [[0, 'lg-on'], [200, 'lg-l1'], [600, 's-portal'], [1300, 's-flip'], [1350, 'q'], [2000, 'lg-l2'], [2200, 's-shadow'], [2900, 'q'],
        [3300, 's-unflip'], [3300, 'f'], [3350, 'r']],
      burst: 3800,
    },
    // Lugia : la tempête sur l'océan ; une lueur argentée monte des profondeurs, la mer se soulève,
    // d'immenses ailes se déploient et d'un battement chassent la tempête : ciel calme, lune, étoiles
    249: {
      key: 'lugia', title: 'Gardien des mers', vars: { '--lgf': '#eef5ff', '--lgr': '#cfe2ff' },
      back: () => `${sky('linear-gradient(#0c1a36 0%, #1b3160 50%, #2b4a80 100%)')}
        <div class="lg-calm">${stars(150)}<div class="lg-moon"></div></div>
        <div class="lg-storm sea">${dots(8, (i) => `<i style="left:${(i * 13 - 10 + rnd(-4, 4)).toFixed(0)}%;top:${rnd(-6, 34).toFixed(0)}%;--w:${rnd(220, 380).toFixed(0)}px;--dl:${rnd(0, 2).toFixed(2)}s;--dx:${rnd(-70, 70).toFixed(0)}px;--dy:${rnd(-14, 14).toFixed(0)}px;--du:${rnd(2.4, 4.4).toFixed(2)}s"></i>`)}</div>
        <svg class="lg-wings" viewBox="-300 -40 600 260" aria-hidden="true"><defs>
          <linearGradient id="lgwingr" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#f4f8ff"/><stop offset=".62" stop-color="#cdd9f2"/><stop offset=".86" stop-color="#7d93c9"/><stop offset="1" stop-color="#34477f"/></linearGradient>
          <linearGradient id="lgwingl" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#f4f8ff"/><stop offset=".62" stop-color="#cdd9f2"/><stop offset=".86" stop-color="#7d93c9"/><stop offset="1" stop-color="#34477f"/></linearGradient></defs>
          <path fill="url(#lgwingr)" d="${WING}" transform="rotate(-20 0 100)"/><path fill="url(#lgwingl)" d="${WING}" transform="scale(-1 1) rotate(-20 0 100)"/></svg>
        ${text('La tempête fait rage sur l’océan…', 'Une lueur argentée monte des profondeurs…', 'Le gardien des mers déploie ses ailes.')}`,
      front: () => `<div class="lg-ocean"><div class="lg-deep"></div></div>${parts(26, 'up', 'rgba(225,240,255,.9)', 'drop', [6, 14], [0.9, 1.6])}`,
      steps: [[0, 'lg-on'], [200, 'lg-l1'], [900, 't'], [1500, 'lg-l2'], [1500, 's-glow'], [2300, 's-swell'], [2350, 'q'], [2900, 'lg-l3'],
        [3000, 's-wings'], [3000, 'lg-p'], [3050, 'q'], [3700, 's-beat'], [3750, 's-calm'], [4100, 'f'], [4150, 'r']],
      burst: 4500,
    },
    // Ho-Oh : le premier épisode — l'aube se lève, un arc-en-ciel (une bande douce, pas des traits) s'étend dans le ciel,
    // une plume aux sept couleurs tombe, le Feu Sacré monte en flammes multicolores, puis des ailes de feu se déploient
    250: {
      key: 'hooh', title: 'Gardien des arcs-en-ciel', vars: { '--lgf': '#fff4c2', '--lgr': '#ffd23f' },
      back: () => `${sky('linear-gradient(#141c4a 0%, #3b2f6e 45%, #7a4b7e 75%, #b8697a 100%)')}<div class="lg-dawn"></div>
        <div class="lg-arc"></div>
        <svg class="lg-plume" viewBox="0 0 40 120" aria-hidden="true"><defs><linearGradient id="lgplume" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#ff4d4d"/><stop offset=".3" stop-color="#ffe066"/><stop offset=".55" stop-color="#6be07a"/><stop offset=".8" stop-color="#4db8ff"/><stop offset="1" stop-color="#c86bff"/></linearGradient></defs>
          <path d="M20 2 C 36 30, 38 70, 20 118 C 2 70, 4 30, 20 2 Z" fill="url(#lgplume)"/></svg>
        <svg class="lg-wings fire" viewBox="-300 -40 600 260" aria-hidden="true"><defs>
          <linearGradient id="lgfirer" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff3c4"/><stop offset=".35" stop-color="#ffb347"/><stop offset=".65" stop-color="#ff5a3c"/><stop offset=".85" stop-color="#6be07a"/><stop offset="1" stop-color="#4db8ff"/></linearGradient>
          <linearGradient id="lgfirel" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#fff3c4"/><stop offset=".35" stop-color="#ffb347"/><stop offset=".65" stop-color="#ff5a3c"/><stop offset=".85" stop-color="#6be07a"/><stop offset="1" stop-color="#4db8ff"/></linearGradient></defs>
          <path fill="url(#lgfirer)" d="${WING}" transform="rotate(-16 0 100)"/><path fill="url(#lgfirel)" d="${WING}" transform="scale(-1 1) rotate(-16 0 100)"/></svg>
        ${parts(40, 'up', '#ff9a3c', 'flame', [14, 28], [0.9, 1.6])}${parts(18, 'up', '#fff1a8', '', [2, 4], [2, 3.2])}${shocks(2)}
        ${text('L’aube se lève…', 'Un arc-en-ciel s’étend, une plume aux sept couleurs tombe…', 'Le Feu Sacré s’embrase !')}`,
      front: () => '',
      steps: [[0, 'lg-on'], [200, 'lg-l1'], [300, 's-dawn'], [900, 's-arc'], [1500, 'lg-l2'], [1600, 's-plume'], [2500, 'lg-l3'], [2500, 'lg-p'], [3000, 's-wings'], [3050, 'q'], [3500, 'f'], [3550, 'r']],
      burst: 3900,
    },
    // Celebi : le voyage dans le temps — une horloge qui tourne à l'envers, tout passe en sépia, les feuilles remontent
    251: {
      key: 'celebi', vars: { '--lgf': '#eaffd6', '--lgr': '#b6f27a' },
      back: () => `${sky('linear-gradient(#0d2a12, #1d4d22 55%, #2f6b2c)')}
        <svg class="lg-trees" viewBox="0 0 400 300" preserveAspectRatio="none" aria-hidden="true">${dots(7, (i) => {
          const x = 20 + i * 60 + rnd(-10, 10);
          return `<path d="M${x} 300 V${rnd(120, 180).toFixed(0)}" stroke-width="${rnd(10, 18).toFixed(0)}"/><circle cx="${x}" cy="${rnd(90, 140).toFixed(0)}" r="${rnd(40, 60).toFixed(0)}"/>`;
        })}</svg>
        <svg class="lg-clock" viewBox="0 0 200 200" aria-hidden="true"><circle cx="100" cy="100" r="92"/>
          ${dots(12, (i) => `<path d="M100 14 V30" transform="rotate(${i * 30} 100 100)"/>`)}
          <path class="hh" d="M100 100 V52"/><path class="mm" d="M100 100 V26"/></svg>
        ${parts(18, 'up', '#9be06a', 'leaf', [8, 14], [2, 3.2])}${shocks(3)}${text('Le temps se met à reculer…', 'Bienvenue dans le passé.')}`,
      front: () => '',
      steps: [[0, 'lg-on'], [200, 'lg-l1'], [500, 's-clock'], [1300, 's-past'], [1400, 'lg-p'], [2000, 'lg-l2'], [2600, 'r'], [3100, 'f']],
      burst: 3500,
    },
    // Deoxys : une boule de feu venue de l'espace grossit en approchant et s'écrase (explosion, fumée, débris),
    // puis son ADN se transforme (double hélice de points lumineux orange et bleus)
    386: {
      key: 'deoxys', vars: { '--lgf': '#ffe2c2', '--lgr': '#ff9a3c' },
      back: () => `${sky('linear-gradient(#000, #05020d 60%, #120822)')}${stars(140)}<div class="lg-nebula"></div>
        <div class="lg-fireball"></div><div class="lg-smoke"></div>
        <div class="lg-helix">${dots(14, (i) => `<i class="a" style="--i:${i}"></i><i class="b" style="--i:${i}"></i>`)}</div>
        ${parts(20, 'up', '#ff9a3c', '', [2, 5], [1.5, 2.8])}${text('Une boule de feu fonce vers toi…', 'Son ADN se transforme.')}`,
      front: () => `<div class="lg-rock"><div class="lg-fall"><div class="lg-tail"></div><div class="lg-head"></div></div></div>
        <div class="lg-debris">${dots(18, () => `<i style="--a:${rnd(180, 360).toFixed(0)}deg;--d:${rnd(110, 230).toFixed(0)}px;--rt:${rnd(-300, 300).toFixed(0)}deg;--s:${rnd(7, 16).toFixed(0)}px"></i>`)}</div>`,
      steps: [[0, 'lg-on'], [200, 'lg-l1'], [400, 's-fall'], [1650, 's-impact'], [1650, 'f'], [1680, 'q'], [2300, 'lg-l2'], [2400, 's-dna'], [2400, 'lg-p'], [3300, 'f']],
      burst: 3700,
    },
    // Shaymin : des Gracidées s'ouvrent partout sur l'écran, puis une rafale de pétales
    492: {
      key: 'shaymin', vars: { '--lgf': '#fff0f6', '--lgr': '#ff9ccf' },
      back: () => `${sky('linear-gradient(#bfe6ff 0%, #dff4ff 50%, #a8e07a 78%, #6cbf4a 100%)')}
        <div class="lg-flowers">${dots(22, (i) => `<i style="left:${rnd(2, 94).toFixed(0)}%;top:${rnd(i < 14 ? 66 : 8, i < 14 ? 94 : 60).toFixed(0)}%;--dl:${(i * 0.05).toFixed(2)}s;--s:${rnd(24, 46).toFixed(0)}px"></i>`)}</div>
        ${parts(26, 'side', '#ff8fc4', 'petal', [8, 13], [1.4, 2.4])}${shocks(2)}${text('Les fleurs s’ouvrent sur ton passage…')}`,
      front: () => '',
      steps: [[0, 'lg-on'], [200, 'lg-l1'], [500, 's-bloom'], [1600, 'lg-p'], [2500, 'f'], [2550, 'r']],
      burst: 2900,
    },
    // Léviator rouge (seulement en chromatique) : le lac Colère se met à bouillir, la rage monte, des geysers jaillissent
    130: {
      key: 'leviator', shinyOnly: true, title: 'Léviator rouge !', vars: { '--lgf': '#ff6b6b', '--lgr': '#ff3d3d', '--sea': 'rgba(150,10,20,.72)', '--wave': 'rgba(150,10,20,.72)' },
      back: () => `${sky('linear-gradient(#0d0204, #2a0508 55%, #4a0a10)')}<div class="lg-rage"></div>
        <div class="lg-spouts">${dots(4, (i) => `<i style="left:${[12, 30, 66, 84][i]}%;--dl:${(i * 0.12).toFixed(2)}s"></i>`)}</div>${shocks(2)}
        ${text('Le lac Colère se met à bouillir…', 'Une rage rouge monte des profondeurs !')}`,
      front: () => `<div class="lg-sea"><div class="lg-wave w1"></div><div class="lg-wave w2"></div>
        <div class="lg-bubbles">${dots(16, () => `<i style="left:${rnd(0, 100)}%;--dl:${rnd(0, 2).toFixed(2)}s;--du:${rnd(1, 2).toFixed(2)}s;--s:${rnd(4, 10).toFixed(1)}px"></i>`)}</div></div>`,
      steps: [[0, 'lg-on'], [200, 'lg-l1'], [500, 'lg-rise'], [1200, 'q'], [1600, 's-rage'], [2000, 'lg-l2'], [2200, 's-spout'], [2250, 'q'], [2800, 'q'], [3100, 'f'], [3150, 'r']],
      burst: 3500,
    },
  };

  /** Apparition d'un Pokémon (null s'il n'en a pas) ; shinyOnly : seulement en chromatique (Léviator rouge) */
  const get = (id, shiny = false) => { const l = LEGENDS[+id]; return l && (!l.shinyOnly || shiny) ? l : null; };

  /** Joue la scène ; wait(ms) s'arrête plus tôt si on peut passer et qu'on a touché l'écran ; burst() fait éclater la capsule */
  async function play(ov, lg, wait, burst) {
    const scene = ov.querySelector('.cap-scene');
    scene.insertAdjacentHTML('beforebegin', `<div class="lg-layer lg-back">${lg.back()}</div>`);
    scene.insertAdjacentHTML('afterend', `<div class="lg-layer lg-front">${lg.front()}</div>`);
    for (const [k, v] of Object.entries(lg.vars || {})) ov.style.setProperty(k, v);
    ov.classList.add('lg', 'lg-' + lg.key);
    App.sfx.legend(lg.key);
    // relance une animation déjà jouée (tremblement, éclair, ondes) ; l'éclair s'efface pour laisser celui de l'ouverture
    const again = (cls, ms) => { ov.classList.remove(cls); void ov.offsetWidth; ov.classList.add(cls); if (ms) setTimeout(() => ov.classList.remove(cls), ms); };
    let at = 0;
    for (const [ms, cls] of lg.steps) {
      await wait(ms - at); at = ms;
      if (cls === 'q') again('lg-q'); else if (cls === 'f') again('lg-f', 750); else if (cls === 'r') again('lg-r'); else if (cls === 't') again('s-thunder'); else ov.classList.add(cls);
    }
    await wait(lg.burst - at);
    ov.classList.remove('lg-f');
    ov.classList.add('lg-burst');
    burst();
    await wait(900);
  }

  return { get, play, ids: () => Object.keys(LEGENDS).map(Number) };
})();
