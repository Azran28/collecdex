/*
 * Apparitions spéciales de certains Pokémon, jouées par-dessus l'ouverture normale (rien ne change au tirage).
 * Arceus a la sienne, à part (capsules-god.js). Ajouter un Pokémon : une entrée dans FX, ses styles dans css/13-arceus.css.
 * Carapuce (7) : ses lunettes de soleil tombent du ciel (l'Escouade Carapuce de l'animé), « Carapute », petite danse.
 */
App.capsuleFx = (() => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // lunettes de soleil (dessin original) : verre gauche plus petit, le Carapuce officiel est vu de trois quarts
  const SHADES = `<svg viewBox="0 0 200 70" aria-hidden="true">
    <defs><linearGradient id="fxlens" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a3f5c"/><stop offset=".55" stop-color="#11131f"/><stop offset="1" stop-color="#05060b"/></linearGradient></defs>
    <path d="M4 14 H196" stroke="#05060b" stroke-width="9" stroke-linecap="round"/>
    <path d="M10 12 H76 Q82 12 80 22 L74 44 Q70 58 54 58 H32 Q16 58 13 42 L8 22 Q6 12 10 12 Z" fill="url(#fxlens)" stroke="#05060b" stroke-width="5"/>
    <path d="M100 12 H188 Q196 12 194 24 L186 46 Q181 62 160 62 H128 Q108 62 104 44 L98 24 Q96 12 100 12 Z" fill="url(#fxlens)" stroke="#05060b" stroke-width="5"/>
    <path d="M78 20 Q89 13 100 20" fill="none" stroke="#05060b" stroke-width="7" stroke-linecap="round"/>
    <path class="fx-shine" d="M22 22 L40 22 L30 46 Z M114 22 L138 22 L124 52 Z" fill="#fff" opacity=".28"/>
  </svg>`;

  const FX = {
    7: {
      cls: 'fx-squirtle',
      async play(ov) {
        const scene = ov.querySelector('.cap-scene'), mon = ov.querySelector('.cap-mon');
        scene.insertAdjacentHTML('afterbegin', '<div class="fx-water"></div><div class="fx-drops"></div>');
        mon.insertAdjacentHTML('beforeend', `<div class="fx-shades">${SHADES}<i class="fx-glint"></i></div>`);
        ov.querySelector('.fx-drops').innerHTML = Array.from({ length: 18 }, (_, i) => `<i style="--a:${i * 20 + Math.random() * 10}deg;--d:${120 + Math.random() * 80}px;--dl:${Math.round(Math.random() * 120)}ms"></i>`).join('');
        await sleep(650); // Carapuce vient d'apparaître
        App.sfx.shades();
        ov.classList.add('fx-drop');
        await sleep(470); // les lunettes touchent son nez
        ov.classList.add('fx-on');
        const text = ov.querySelector('.cap-text');
        if (text) text.insertAdjacentHTML('afterbegin', '<div class="cap-banner fx-squad">Carapute</div>');
        await sleep(380); // petite danse
        ov.classList.add('fx-dance');
      },
    },
  };

  return { get: (id) => FX[id] || null };
})();
