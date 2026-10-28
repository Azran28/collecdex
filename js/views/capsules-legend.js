/*
 * Apparitions des grands légendaires (et fabuleux) : à la place des secousses de la capsule, une scène de 4 à 5 s
 * tirée de l'animé ou des jeux, puis la capsule éclate et le Pokémon apparaît normalement.
 * Impossible à passer la première fois (App.capsuleFx.seen), passable ensuite. Rien ne change au tirage.
 * Arceus a la sienne, au-dessus de tout (capsules-god.js) ; Carapuce n'a qu'un clin d'œil (capsules-fx.js).
 * Chaque entrée : back / front = décor derrière / devant la capsule, steps = [moment en ms, classe posée sur .cap-ov]
 * (« q » = l'écran tremble), burst = moment où la capsule éclate. Styles : css/14-legendaires.css ; son : App.sfx.legend(key).
 */
App.capsuleLegend = (() => {
  const rnd = (a, b) => a + Math.random() * (b - a);
  const dots = (n, f) => Array.from({ length: n }, (_, i) => f(i)).join('');

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
        <svg class="lg-bolt b1" viewBox="0 0 60 200" aria-hidden="true"><path d="M38 0 L14 92 L32 92 L8 200 L52 74 L32 74 L50 0 Z"/></svg>
        <svg class="lg-bolt b2" viewBox="0 0 60 200" aria-hidden="true"><path d="M38 0 L14 92 L32 92 L8 200 L52 74 L32 74 L50 0 Z"/></svg>
        <div class="lg-sea"><div class="lg-wave w1"></div><div class="lg-wave w2"></div>
          <div class="lg-bubbles">${dots(18, () => `<i style="left:${rnd(0, 100)}%;--dl:${rnd(0, 2).toFixed(2)}s;--du:${rnd(1.4, 2.6).toFixed(2)}s;--s:${rnd(4, 10).toFixed(1)}px"></i>`)}</div></div>`,
      steps: [[0, 'lg-on'], [200, 'lg-l1'], [900, 'lg-bolt1'], [1500, 'lg-rise'], [2400, 'lg-bolt2'], [2900, 'lg-surge'], [3150, 'q']],
      burst: 3600,
    },
    // Rayquaza : soleil contre pluie (Groudon contre Kyogre) ; il descend du ciel et tranche le combat
    384: {
      key: 'rayquaza',
      back: () => `<div class="lg-half left"><div class="lg-sun"></div></div><div class="lg-half right"><div class="lg-rain"></div></div>
        <div class="lg-clear"></div>
        <svg class="lg-snake" viewBox="0 0 200 600" preserveAspectRatio="none" aria-hidden="true">
          <defs><linearGradient id="lgdrag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1f8f4e"/><stop offset=".5" stop-color="#3fd17a"/><stop offset="1" stop-color="#ffe066"/></linearGradient></defs>
          <path d="M100 -30 C 10 70, 190 150, 100 250 S 10 420, 100 480" stroke="url(#lgdrag)"/></svg>
        <div class="lg-shock"></div><div class="lg-shock r2"></div>
        <p class="lg-text t1">Le soleil et la pluie s’affrontent…</p><p class="lg-text t2">…jusqu’à ce que le ciel rugisse.</p>`,
      front: () => '<div class="lg-cut"></div>',
      steps: [[0, 'lg-on'], [200, 'lg-l1'], [700, 'q'], [1300, 'lg-clash'], [1350, 'q'], [1800, 'lg-dragon'], [2600, 'lg-slash'], [2650, 'q'], [2900, 'lg-l2'], [3200, 'lg-ring']],
      burst: 3600,
    },
  };

  /** Apparition d'un Pokémon (null s'il n'en a pas) ; shinyOnly : seulement en chromatique (Léviator rouge) */
  const get = (id, shiny = false) => { const l = LEGENDS[+id]; return l && (!l.shinyOnly || shiny) ? l : null; };

  /** Joue la scène ; wait(ms) s'arrête plus tôt si on peut passer et qu'on a touché l'écran ; burst() fait éclater la capsule */
  async function play(ov, lg, wait, burst) {
    const scene = ov.querySelector('.cap-scene');
    scene.insertAdjacentHTML('beforebegin', `<div class="lg-layer lg-back">${lg.back()}</div>`);
    scene.insertAdjacentHTML('afterend', `<div class="lg-layer lg-front">${lg.front()}</div>`);
    ov.classList.add('lg', 'lg-' + lg.key);
    App.sfx.legend(lg.key);
    const quake = () => { ov.classList.remove('lg-q'); void ov.offsetWidth; ov.classList.add('lg-q'); };
    let at = 0;
    for (const [ms, cls] of lg.steps) {
      await wait(ms - at); at = ms;
      if (cls === 'q') quake(); else ov.classList.add(cls);
    }
    await wait(lg.burst - at);
    ov.classList.add('lg-burst');
    burst();
    await wait(900);
  }

  return { get, play, ids: () => Object.keys(LEGENDS).map(Number) };
})();
