/*
 * Apparition d'Arceus (rareté cachée « Dieu ») à l'ouverture d'une capsule : impossible à passer.
 * Le néant, la capsule qui se fissure de lumière, un « big bang », l'univers et l'anneau des 17 plaques,
 * puis Arceus descend en silhouette dans une colonne de lumière et prend ses couleurs (~9,5 s).
 * Appelée par js/views/capsules.js (openAnimation) ; styles : css/13-arceus.css, son : App.sfx.god().
 */
App.capsuleGod = (() => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // couleurs des 17 plaques (un type chacune, sauf Normal)
  const PLATES = ['#ee8130', '#6390f0', '#f7d02c', '#7ac74c', '#96d9d6', '#c22e28', '#a33ea1', '#e2bf65', '#a98ff3',
    '#f95587', '#a6b91a', '#b6a136', '#735797', '#6f35fc', '#705746', '#b7b7ce', '#d685ad'];

  function ringSVG() {
    const gems = PLATES.map((c, i) => {
      const a = (i / PLATES.length) * Math.PI * 2 - Math.PI / 2, x = 200 + Math.cos(a) * 168, y = 200 + Math.sin(a) * 168;
      return `<rect x="${x - 9}" y="${y - 13}" width="18" height="26" rx="5" fill="${c}" stroke="#fff6d6" stroke-width="2.5" transform="rotate(${(a * 180) / Math.PI + 90} ${x} ${y})"/>`;
    }).join('');
    return `<svg viewBox="0 0 400 400" aria-hidden="true">
      <circle cx="200" cy="200" r="168" fill="none" stroke="#ffd76a" stroke-width="10" opacity=".9"/>
      <circle cx="200" cy="200" r="182" fill="none" stroke="#fff3c4" stroke-width="1.5" stroke-dasharray="3 9"/>
      <circle cx="200" cy="200" r="150" fill="none" stroke="#ffd76a" stroke-width="2" opacity=".6"/>
      ${gems}</svg>`;
  }

  // étoiles : une seule petite tache, recopiée partout par box-shadow (léger sur téléphone)
  const stars = (n) => Array.from({ length: n }, () => `${Math.round(Math.random() * innerWidth)}px ${Math.round(Math.random() * innerHeight)}px 0 ${Math.random() < 0.15 ? 1 : 0}px rgba(255,255,255,${(0.35 + Math.random() * 0.65).toFixed(2)})`).join(',');

  async function play(ov) {
    const layer = document.createElement('div');
    layer.className = 'god-layer';
    layer.innerHTML = `<div class="god-void"></div><div class="god-nebula"></div><div class="god-stars"><i style="box-shadow:${stars(170)}"></i></div>
      <div class="god-pillar"></div><div class="god-shock"></div><div class="god-shock s2"></div>
      <div class="god-motes">${Array.from({ length: 34 }, () => `<i style="left:${Math.random() * 100}%;--dl:${(Math.random() * 4).toFixed(2)}s;--du:${(3 + Math.random() * 3).toFixed(2)}s;--s:${2 + Math.random() * 4}px"></i>`).join('')}</div>
      <div class="god-text"><p class="gl1">Au commencement, il n’y avait que le néant…</p><p class="gl2">…puis vint la lumière.</p><p class="gl3">Le Créateur s’éveille.</p></div>`;
    ov.insertBefore(layer, ov.querySelector('.cap-scene'));
    const scene = ov.querySelector('.cap-scene');
    scene.insertAdjacentHTML('afterbegin', `<div class="god-cracks"></div><div class="god-ring">${ringSVG()}</div><div class="god-ring tilt">${ringSVG()}</div>`);
    const step = (c) => ov.classList.add(c);
    const quake = () => { ov.classList.remove('g-quake'); void ov.offsetWidth; ov.classList.add('g-quake'); };

    App.sfx.god();
    step('co-god');
    await sleep(250); step('g-l1');
    // la capsule tremble de plus en plus fort, comme un cœur qui bat
    await sleep(450); quake();
    await sleep(800); quake();
    await sleep(800); quake(); step('g-l2');
    // la lumière s'échappe par les fissures
    await sleep(300); step('g-crack');
    await sleep(1300);
    // big bang : éclair, onde de choc, l'univers apparaît
    step('g-bang'); step('g-shake');
    await sleep(500); step('g-l3');
    await sleep(1100); step('g-pillar');
    // Arceus descend en silhouette, puis prend ses couleurs
    await sleep(400); step('g-desc');
    await sleep(2400); step('g-fill');
    await sleep(1000);
  }

  /** Le titre : « ??? » qui se brouille puis devient « Dieu » (après l'apparition du texte) */
  async function revealTitle(ov) {
    const b = ov.querySelector('#god-banner');
    await sleep(700);
    if (b) b.classList.add('glitch');
    App.sfx.godTitle();
    const chars = '?#%&@!*';
    for (let i = 0; i < 9; i++) {
      if (b) b.textContent = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
      await sleep(70);
    }
    if (b) { b.textContent = 'Dieu des Pokémon'; b.classList.remove('glitch'); b.classList.add('done'); }
    ov.querySelectorAll('.tier-pill.secret').forEach((p) => { p.textContent = App.pokedex.TIER[7].name; });
    await sleep(500);
  }

  return { play, revealTitle };
})();
