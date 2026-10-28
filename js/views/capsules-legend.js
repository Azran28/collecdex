/*
 * Apparitions des grands légendaires et fabuleux : à la place des secousses de la capsule, une scène de 4 à 7 s
 * tirée de l'animé ou des jeux, puis la capsule éclate et le Pokémon apparaît normalement.
 * Impossible à passer la première fois (App.capsuleFx.seen), passable ensuite. Rien ne change au tirage.
 * Hiérarchie (Arnaud) : Arceus (capsules-god.js) > Rayquaza (~7 s) > Mewtwo (~5,5 s) > les autres (~4 s) ; Carapuce = clin d'œil (capsules-fx.js).
 * Chaque entrée : back / front = décor derrière / devant la capsule ; steps = [moment en ms, classe posée sur .cap-ov]
 * (« q » = l'écran tremble, « f » = éclair de la couleur --lgf, « r » = ondes de choc) ; burst = moment où la capsule éclate ;
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
    // Rayquaza (le 2e plus important après Arceus) : il veille dans la couche d'ozone, traverse le ciel étoilé,
    // plonge à travers les nuages et fond comme une comète sur la tempête de Groudon et Kyogre, qu'il disperse
    384: {
      key: 'rayquaza', title: 'Gardien du ciel', vars: { '--lgf': '#eafff1', '--lgr': '#7dffb0' },
      back: () => `${sky('linear-gradient(#000 0%, #040818 55%, #0b2346 82%, #2f8fe0 100%)')}${stars(160)}<div class="lg-earth"></div>
        <svg class="lg-serpent" viewBox="0 0 1000 220" preserveAspectRatio="none" aria-hidden="true">
          <path class="edge" d="M-260 130 C -60 30, 120 210, 330 110 S 640 20, 860 120 S 1120 190, 1300 90"/><path class="body" d="M-260 130 C -60 30, 120 210, 330 110 S 640 20, 860 120 S 1120 190, 1300 90"/><path class="belly" d="M-260 130 C -60 30, 120 210, 330 110 S 640 20, 860 120 S 1120 190, 1300 90"/>
          <path class="rings" d="M-260 130 C -60 30, 120 210, 330 110 S 640 20, 860 120 S 1120 190, 1300 90"/></svg>
        <div class="lg-clouds">${dots(7, (i) => `<i style="left:${rnd(-10, 80).toFixed(0)}%;--dl:${(i * 0.12).toFixed(2)}s;--w:${rnd(120, 260).toFixed(0)}px"></i>`)}</div>
        <div class="lg-speed"></div>
        <div class="lg-half left"><div class="lg-sun"></div></div><div class="lg-half right"><div class="lg-rain"></div></div>
        <div class="lg-clear"></div><div class="lg-godrays"></div>${shocks(3)}
        ${text('Au-dessus des nuages, là où l’air se raréfie…', '…le gardien du ciel veille.', 'En bas, la tempête fait rage… Il fond sur elle !')}`,
      front: () => '<div class="lg-comet"></div>',
      steps: [[0, 'lg-on'], [200, 'lg-l1'], [1200, 's-serp'], [1500, 'q'], [2500, 'lg-l2'], [3300, 's-dive'], [3350, 'q'], [3900, 'q'],
        [4500, 's-storm'], [4600, 'lg-l3'], [5000, 'q'], [5500, 's-comet'], [5950, 's-impact'], [5950, 'f'], [5970, 'q'], [6000, 'r']],
      burst: 6500,
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
    // Lugia : la mer en furie, un tourbillon géant, des plumes argentées, une colonne d'eau, un chant au loin
    249: {
      key: 'lugia', title: 'Gardien des mers', vars: { '--lgf': '#e8f3ff', '--lgr': '#bfe0ff', '--sea': 'rgba(20,60,120,.85)', '--wave': 'rgba(20,60,120,.85)' },
      back: () => `${sky('linear-gradient(#01030a, #071530 55%, #0e2a52)')}<div class="lg-moon"></div><div class="lg-vortex"></div>
        <div class="lg-pillar"></div>${parts(16, 'down', '#e9f2ff', 'feather', [6, 12], [2.6, 4])}${shocks(2)}
        ${text('Les mers se déchaînent…', 'Le gardien des mers s’élève.')}`,
      front: () => '<div class="lg-sea low"><div class="lg-wave w1"></div><div class="lg-wave w2"></div></div>',
      steps: [[0, 'lg-on'], [200, 'lg-l1'], [700, 's-vortex'], [1500, 'q'], [1900, 'lg-p'], [2300, 'lg-l2'], [2700, 's-pillar'], [2750, 'q'], [3300, 'f'], [3350, 'r']],
      burst: 3800,
    },
    // Ho-Oh : le premier épisode — un arc-en-ciel traverse le ciel, une plume aux sept couleurs tombe, les cloches sonnent
    250: {
      key: 'hooh', vars: { '--lgf': '#fff4c2', '--lgr': '#ffd23f' },
      back: () => `${sky('linear-gradient(#1b2a6b 0%, #6b4a9e 40%, #ff8a6b 75%, #ffd27a 100%)')}
        <svg class="lg-rainbow" viewBox="0 0 400 220" preserveAspectRatio="none" aria-hidden="true">
          ${['#ff4d4d', '#ff9a3c', '#ffe066', '#6be07a', '#4db8ff', '#6f6bff', '#c86bff'].map((c, i) => `<path d="M-20 220 A 220 190 0 0 1 420 220" stroke="${c}" transform="translate(0 ${i * 9})"/>`).join('')}</svg>
        <svg class="lg-plume" viewBox="0 0 40 120" aria-hidden="true"><defs><linearGradient id="lgplume" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#ff4d4d"/><stop offset=".3" stop-color="#ffe066"/><stop offset=".55" stop-color="#6be07a"/><stop offset=".8" stop-color="#4db8ff"/><stop offset="1" stop-color="#c86bff"/></linearGradient></defs>
          <path d="M20 2 C 36 30, 38 70, 20 118 C 2 70, 4 30, 20 2 Z" fill="url(#lgplume)"/><path d="M20 10 V116" stroke="#fff" stroke-width="1.5" opacity=".7"/></svg>
        ${parts(24, 'up', '#ffe27a', '', [2, 5], [2, 3.4])}<div class="lg-flames"></div>${shocks(2)}
        ${text('Un arc-en-ciel traverse le ciel…', 'Une plume aux sept couleurs tombe.')}`,
      front: () => '',
      steps: [[0, 'lg-on'], [200, 'lg-l1'], [500, 's-rainbow'], [1500, 's-plume'], [1900, 'lg-l2'], [2000, 'lg-p'], [3000, 's-flames'], [3300, 'f'], [3350, 'r']],
      burst: 3800,
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
    // Deoxys : une météorite traverse l'espace et s'écrase, son ADN se transforme, son cristal violet s'allume
    386: {
      key: 'deoxys', vars: { '--lgf': '#ffd2a6', '--lgr': '#ff9a3c' },
      back: () => `${sky('linear-gradient(#000, #070312 60%, #140a26)')}${stars(120)}
        <svg class="lg-dna" viewBox="0 0 120 400" preserveAspectRatio="none" aria-hidden="true">
          <path class="a" d="M30 0 C 90 50, 90 50, 30 100 S -30 150, 30 200 S 90 250, 30 300 S -30 350, 30 400"/>
          <path class="b" d="M90 0 C 30 50, 30 50, 90 100 S 150 150, 90 200 S 30 250, 90 300 S 150 350, 90 400"/>
          ${dots(16, (i) => `<path class="rung" d="M${i % 2 ? 40 : 50} ${12 + i * 25} H${i % 2 ? 80 : 70}"/>`)}</svg>
        <div class="lg-core"></div>${shocks(3)}${text('Une météorite tombe du ciel…', 'Son ADN se transforme.')}`,
      front: () => '<div class="lg-meteor"></div>',
      steps: [[0, 'lg-on'], [200, 'lg-l1'], [600, 's-fall'], [1250, 's-hit'], [1250, 'f'], [1280, 'q'], [1300, 'r'], [1800, 's-dna'], [2000, 'lg-l2'], [2600, 's-core'], [3100, 'f']],
      burst: 3500,
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
      if (cls === 'q') again('lg-q'); else if (cls === 'f') again('lg-f', 750); else if (cls === 'r') again('lg-r'); else ov.classList.add(cls);
    }
    await wait(lg.burst - at);
    ov.classList.remove('lg-f');
    ov.classList.add('lg-burst');
    burst();
    await wait(900);
  }

  return { get, play, ids: () => Object.keys(LEGENDS).map(Number) };
})();
