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

  // ---------- Apparitions déjà vues (réglage du compte, suit d'un appareil à l'autre) et souvenirs ----------
  // clé : le numéro du Pokémon (« 130s » = Léviator rouge, seulement en chromatique)
  const keyOf = (id, shiny) => {
    id = +id;
    if (id === 130) return shiny ? '130s' : null;
    return FX[id] || id === App.pokedex.GOD || App.capsuleLegend.get(id, shiny) ? String(id) : null;
  };
  const seenList = () => (Array.isArray(App.settings.fxSeen) ? App.settings.fxSeen : []);
  const seen = (id, shiny = false) => { const k = keyOf(id, shiny); return !k || seenList().includes(k); };
  function markSeen(id, shiny = false) {
    const k = keyOf(id, shiny);
    if (!k || seenList().includes(k)) return;
    App.settings.fxSeen = [...seenList(), k];
    App.col.saveSettings().catch(() => {});
  }

  /**
   * À l'ouverture de l'appli : les Pokémon déjà attrapés dont l'apparition est nouvelle (pas encore vue)
   * la rejouent une fois, en « souvenir » (rien n'est envoyé au serveur). Imposé (Arnaud) : un écran plein
   * « Nouvelle apparition ! » qu'on ne peut que toucher pour lancer (ce toucher autorise aussi le son sur téléphone).
   */
  let asked = false;
  async function souvenirs() {
    if (asked || App.play || !App.capsules.ready()) return;
    asked = true;
    const dex = await App.capsules.dex().catch(() => new Map());
    const list = [];
    for (const [id, d] of [...dex.entries()].sort((a, b) => a[0] - b[0])) {
      if (keyOf(id, false) && !seen(id, false)) list.push({ id, shiny: false });
      if (id === 130 && d.shiny && !seen(130, true)) list.push({ id, shiny: true });
    }
    if (!list.length) return;
    // pas par-dessus une ouverture, la présentation de l'appli ou une fenêtre
    if (document.querySelector('.cap-ov, #ob, .ask, #modal:not([hidden])')) { asked = false; setTimeout(souvenirs, 8000); return; }
    const many = list.length > 1;
    const call = document.createElement('div');
    call.className = 'fx-call';
    call.innerHTML = `<div class="fx-call-glow"></div>
      <div class="fx-call-mons">${list.map((x) => `<img src="${App.pokedex.img(x.id, x.shiny)}" alt="">`).join('')}</div>
      <div class="fx-call-title">${many ? 'Nouvelles apparitions !' : 'Nouvelle apparition !'}</div>
      <p class="fx-call-text">${many ? 'Tes Pokémon ont' : 'Ton Pokémon a'} maintenant ${many ? 'leur' : 'sa'} propre apparition :<br><b>${list.map((x) => App.util.esc(x.id === 130 ? 'Léviator rouge' : App.pokedex.name(x.id))).join(', ')}</b></p>
      <div class="fx-call-tap">Touche l’écran pour ${many ? 'les' : 'la'} voir</div>`;
    document.body.appendChild(call);
    document.body.classList.add('cap-lock');
    await new Promise((resolve) => call.addEventListener('click', resolve, { once: true }));
    App.sfx.unlock();
    call.remove();
    for (const x of list) await App.views.capsules.replay(x.id, x.shiny);
  }

  return { get: (id) => FX[id] || null, seen, markSeen, souvenirs };
})();
