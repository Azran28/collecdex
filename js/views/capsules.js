/* Page « Capsules » : ouvrir ses capsules (animation selon la rareté) et son Pokédex des Pokémon attrapés */
(() => {
  const { esc } = App.util;
  const P = () => App.pokedex;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /** Capsule CollecDex (dessin original) : moitié haute holographique, moitié basse sombre, étoile */
  let uid = 0;
  function capsuleSVG(cls = '', size = 120) {
    const g = 'capg' + (++uid), d = 'capd' + uid, h = 'caph' + uid;
    return `<svg class="capsule ${cls}" width="${size}" height="${Math.round(size * 1.25)}" viewBox="0 0 120 150" aria-hidden="true">
      <defs>
        <linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd23f"/><stop offset=".38" stop-color="#ff4fa3"/><stop offset=".72" stop-color="#7c5cff"/><stop offset="1" stop-color="#34d5ff"/></linearGradient>
        <linearGradient id="${d}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b3160"/><stop offset="1" stop-color="#141733"/></linearGradient>
        <radialGradient id="${h}" cx=".32" cy=".25" r=".5"><stop offset="0" stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
      </defs>
      <g class="cap-bot"><path d="M12 76 V96 A48 48 0 0 0 108 96 V76 Z" fill="url(#${d})" stroke="#0b0d1f" stroke-width="3"/>
        <path d="M24 98 A36 36 0 0 0 60 132" fill="none" stroke="#fff" stroke-opacity=".12" stroke-width="5" stroke-linecap="round"/></g>
      <g class="cap-top"><path d="M12 74 V54 A48 48 0 0 1 108 54 V74 Z" fill="url(#${g})" stroke="#0b0d1f" stroke-width="3"/>
        <path d="M12 74 V54 A48 48 0 0 1 108 54 V74 Z" fill="url(#${h})"/>
        <path d="M60 22l5.2 11.6 12.6 1.3-9.4 8.5 2.7 12.4L60 49.4l-11.1 6.4 2.7-12.4-9.4-8.5 12.6-1.3z" fill="#fff" stroke="#0b0d1f" stroke-width="2.4" stroke-linejoin="round"/></g>
      <rect class="cap-seam" x="10" y="72" width="100" height="6" rx="3" fill="#0b0d1f"/>
      <rect class="cap-glow" x="14" y="73.5" width="92" height="3" rx="1.5" fill="#fff"/>
    </svg>`;
  }

  const tierPill = (t) => `<span class="tier-pill" style="--tc:${P().TIER[t].color}">${esc(P().TIER[t].name)}</span>`;

  /** Choisir son avatar parmi ses Pokémon attrapés → { id, shiny } ou null */
  async function pickAvatar() {
    const dex = await App.capsules.dex().catch(() => new Map());
    const list = [];
    for (const [id, d] of [...dex.entries()].sort((a, b) => a[0] - b[0])) {
      list.push({ id, shiny: false });
      if (d.shiny) list.push({ id, shiny: true });
    }
    return new Promise((resolve) => {
      let done = false;
      const body = App.util.openModal(`<div class="av-pick">
        <h2>Choisis ton avatar</h2>
        ${list.length ? `<p class="small muted">Parmi les Pokémon que tu as attrapés (${list.length}).</p>
          <input type="search" id="av-q" placeholder="Rechercher…">
          <div class="av-grid">${list.map((x) => `<button class="av-cell ${x.shiny ? 'shiny' : ''}" data-av="${x.id}" data-sh="${x.shiny ? 1 : 0}" data-n="${esc(App.util.norm(P().name(x.id)))}" title="${esc(P().name(x.id))}${x.shiny ? ' (chromatique)' : ''}"><img src="${P().img(x.id, x.shiny)}" alt="" loading="lazy"><span>${esc(P().name(x.id))}</span></button>`).join('')}</div>`
          : `<p class="muted">Tu n’as pas encore attrapé de Pokémon. Ouvre des capsules pour en attraper !</p><a class="btn primary" href="#/capsules">${App.icons.icon('capsule', 16)} Mes capsules</a>`}
      </div>`, () => { if (!done) resolve(null); });
      body.addEventListener('click', (e) => {
        const c = e.target.closest('[data-av]');
        if (c) { done = true; resolve({ id: +c.dataset.av, shiny: c.dataset.sh === '1' }); App.util.closeModal(); }
        if (e.target.closest('a[href]')) App.util.closeModal();
      });
      const q = body.querySelector('#av-q');
      if (q) q.addEventListener('input', () => { const v = App.util.norm(q.value); body.querySelectorAll('.av-cell').forEach((c) => { c.hidden = v && !c.dataset.n.includes(v); }); });
    });
  }

  /** Enregistre le Pokémon comme avatar (et oublie l'ancienne photo de profil) */
  async function setAvatar(id, shiny) {
    const p = await App.col.getProfile();
    if (p.avatar) { App.cloud.markPhotoDelete(p.avatar); p.avatar = null; }
    p.avatarPoke = { id, shiny: !!shiny };
    await App.col.saveProfile(p);
    App.col.notify();
    App.util.toast(`${P().name(id)} est ton nouvel avatar ✓`);
  }

  /** Fiche d'un Pokémon attrapé */
  function speciesModal(id, d) {
    let sh = false;
    const body = App.util.openModal(`<div class="sp-modal">
      <div class="sp-art t${P().tier(id)}" style="--tc:${P().TIER[P().tier(id)].color}"><img id="sp-img" src="${P().img(id)}" alt="${esc(P().name(id))}"></div>
      <div class="sp-info">
        <div class="muted small">${P().num(id)} · ${esc(P().region(id))}</div>
        <h2>${esc(P().name(id))}</h2>
        <div class="row" style="gap:8px">${tierPill(P().tier(id))}${d.shiny ? '<span class="shiny-pill">✦ Chromatique</span>' : ''}</div>
        <p class="small muted">Attrapé ${d.n} fois${d.shiny ? ` (dont ${d.shiny} chromatique${d.shiny > 1 ? 's' : ''})` : ''} · la première fois le ${App.util.dateFr(new Date(d.first).toISOString())}.</p>
        ${d.shiny ? '<div class="chips" id="sp-sw"><button class="chip on" data-sh="0">Normal</button><button class="chip" data-sh="1">✦ Chromatique</button></div>' : ''}
        <button class="btn primary" id="sp-av" style="margin-top:12px">${App.icons.icon('user', 16)} En faire mon avatar</button>
      </div></div>`);
    body.addEventListener('click', async (e) => {
      const b = e.target.closest('#sp-sw [data-sh]');
      if (b) { sh = b.dataset.sh === '1'; body.querySelectorAll('#sp-sw .chip').forEach((c) => c.classList.toggle('on', c === b)); body.querySelector('#sp-img').src = P().img(id, sh); }
      if (e.target.closest('#sp-av')) { await setAvatar(id, sh); App.util.closeModal(); }
    });
  }

  /**
   * Ouverture : la capsule tombe, tremble (plus longtemps si c'est rare), s'ouvre dans un éclair,
   * puis le Pokémon apparaît avec un effet d'autant plus spectaculaire qu'il est rare.
   * Toucher l'écran passe l'animation.
   */
  async function openAnimation() {
    const ov = document.createElement('div');
    ov.className = 'cap-ov';
    ov.innerHTML = `<div class="cap-ov-bg"></div><div class="cap-flash"></div>
      <div class="cap-scene">
        <div class="cap-rays"></div><div class="cap-halo"></div><div class="cap-burst"></div>
        <div class="cap-ball">${capsuleSVG('', 132)}</div>
        <div class="cap-mon"><img alt=""></div>
        <div class="cap-sparkles"></div>
      </div>
      <div class="cap-text"></div>
      <div class="cap-hint small">Touche pour passer</div>`;
    document.body.appendChild(ov);
    document.body.classList.add('cap-lock');
    let skip = false;
    ov.addEventListener('click', (e) => { if (!e.target.closest('button')) skip = true; });
    const wait = async (ms) => { const end = Date.now() + ms; while (!skip && Date.now() < end) await sleep(40); };
    const close = () => { ov.classList.add('co-out'); document.body.classList.remove('cap-lock'); setTimeout(() => ov.remove(), 250); };

    // le tirage part tout de suite (réseau) pendant que la capsule tombe
    const res = App.capsules.open().then((r) => ({ r }), (e) => ({ e }));
    ov.classList.add('co-drop');
    const out = await res;
    if (out.e) { close(); App.util.toast(out.e.message || 'Ouverture impossible', 4000); return null; }
    const r = out.r, t = r.tier, T = P().TIER[t];
    ov.style.setProperty('--tc', T.color);
    const img = ov.querySelector('.cap-mon img');
    img.src = P().img(r.species, r.shiny);
    await wait(650);

    // secousses : 1 (commun) à 3 (légendaire / fabuleux) ; la lueur prend la couleur de la rareté
    const shakes = t <= 2 ? 1 : t <= 4 ? 2 : 3;
    for (let i = 0; i < shakes && !skip; i++) {
      ov.classList.remove('co-wobble'); void ov.offsetWidth; ov.classList.add('co-wobble');
      if (i === shakes - 1) ov.classList.add('co-hint');
      await wait(760);
    }
    // ouverture
    ov.classList.add('co-burst', 'co-t' + t);
    if (r.shiny) ov.classList.add('co-shiny');
    const parts = [0, 0, 8, 14, 22, 32, 40][t];
    ov.querySelector('.cap-burst').innerHTML = Array.from({ length: parts }, (_, i) => `<i style="--a:${(360 / parts) * i + Math.random() * 12}deg;--d:${110 + Math.random() * 90}px;--s:${4 + Math.random() * 6}px;--dl:${Math.random() * 120}ms"></i>`).join('');
    if (r.shiny) ov.querySelector('.cap-sparkles').innerHTML = Array.from({ length: 12 }, () => `<b style="left:${10 + Math.random() * 80}%;top:${8 + Math.random() * 80}%;--dl:${Math.random() * 1.6}s">✦</b>`).join('');
    await wait(t >= 5 ? 900 : 550);
    ov.classList.add('co-reveal');
    const isNew = r.count === 1;
    ov.querySelector('.cap-text').innerHTML = `
      ${t >= 5 ? `<div class="cap-banner">${esc(T.name)} !</div>` : ''}
      <div class="cap-name">${esc(P().name(r.species))}</div>
      <div class="row cap-tags">${tierPill(t)}${r.shiny ? '<span class="shiny-pill">✦ Chromatique !</span>' : ''}${isNew ? '<span class="new-pill">Nouveau !</span>' : `<span class="dup-pill">×${r.count}</span>`}</div>
      <div class="muted small">${P().num(r.species)} · ${esc(P().region(r.species))}</div>
      <div class="row cap-btns">
        ${r.stock > 0 ? `<button class="btn primary" data-again>${App.icons.icon('capsule', 16)} Ouvrir la suivante (${r.stock})</button>` : ''}
        <button class="btn" data-avatar>En faire mon avatar</button>
        <button class="btn ghost" data-close>Fermer</button>
      </div>`;
    ov.querySelector('.cap-hint').remove();
    return new Promise((resolve) => {
      ov.querySelector('.cap-btns').addEventListener('click', async (e) => {
        if (e.target.closest('[data-avatar]')) { await setAvatar(r.species, r.shiny); e.target.closest('[data-avatar]').disabled = true; return; }
        if (e.target.closest('[data-again]')) { close(); resolve({ r, again: true }); return; }
        if (e.target.closest('[data-close]')) { close(); resolve({ r, again: false }); }
      });
    });
  }

  async function openLoop(after) {
    for (;;) {
      const x = await openAnimation();
      if (after) after();
      if (!x || !x.again) return;
    }
  }

  App.views.capsules = {
    capsuleSVG, pickAvatar, setAvatar, openLoop,
    async render(el, params, alive) {
      const state = { region: +(params.query.r || 0), tier: 0, only: false };

      if (!App.cloud.enabled || !App.cloud.user) {
        el.innerHTML = `<div class="breadcrumb"><a href="#/">Accueil</a> › Capsules</div>
          <section class="panel cap-hero">
            <div class="cap-stage">${capsuleSVG('idle', 120)}</div>
            <div><h1>Capsules</h1>
              <p>Chaque heure, une nouvelle capsule t’attend (10 au maximum). Ouvre-la pour attraper un Pokémon, plus ou moins rare, et complète ton Pokédex. Tes Pokémon servent aussi d’avatar.</p>
              <a class="btn primary" href="#/compte">${App.icons.icon('user', 16)} Me connecter pour recevoir mes capsules</a>
              <p class="small muted">Les capsules sont gardées sur ton compte (pour que personne ne puisse tricher avec l’heure du téléphone).</p></div>
          </section>`;
        return;
      }

      el.innerHTML = `<div class="breadcrumb"><a href="#/">Accueil</a> › Capsules</div>
        <section class="panel cap-hero">
          <div class="cap-stage" id="cp-stage">${capsuleSVG('idle', 120)}</div>
          <div class="cap-main">
            <h1>Capsules</h1>
            <div id="cp-status" class="cap-status muted">Chargement…</div>
            <div class="row" style="gap:10px;margin-top:12px"><button class="btn primary big" id="cp-open" disabled>${App.icons.icon('capsule', 18)} Ouvrir une capsule</button></div>
            <details class="cap-odds"><summary class="small">Chances d’obtention</summary>
              <div class="cap-odds-list">${[1, 2, 3, 4, 5, 6].map((t) => `<span>${tierPill(t)} <b>${String(P().TIER[t].odds).replace('.', ',')} %</b></span>`).join('')}<span><span class="shiny-pill">✦ Chromatique</span> <b>1 %</b></span></div>
              <p class="small muted">Une capsule arrive toutes les heures, 10 au maximum en réserve : pense à passer les ouvrir !</p></details>
          </div>
        </section>
        <section class="section">
          <div class="section-title"><h2>Mon Pokédex</h2><span class="spacer"></span><span class="muted small" id="cp-count"></span></div>
          <div id="cp-bar"></div>
          <div class="toolbar">
            <div class="chips" id="cp-regions">${['Tous', ...P().REGIONS].map((r, i) => `<button class="chip ${state.region === i ? 'on' : ''}" data-r="${i}">${esc(r)}</button>`).join('')}</div>
          </div>
          <div class="toolbar">
            <select id="cp-tier"><option value="0">Toutes les raretés</option>${[1, 2, 3, 4, 5, 6].map((t) => `<option value="${t}">${esc(P().TIER[t].name)}</option>`).join('')}</select>
            <label class="check small"><input type="checkbox" id="cp-only"> Attrapés seulement</label>
            <span class="spacer"></span><span class="muted small" id="cp-shown"></span>
          </div>
          <div class="dex-grid" id="cp-grid"></div>
        </section>`;

      const $ = (s) => el.querySelector(s);
      let dex = new Map();

      const drawStatus = () => {
        const s = App.capsules.state;
        const box = $('#cp-status'), btn = $('#cp-open');
        if (!box) return;
        if (App.capsules.missing) {
          box.innerHTML = '<b>Il reste une étape :</b> lancer le script <code>supabase-v3.sql</code> dans Supabase (SQL Editor) pour activer les capsules.';
          btn.disabled = true; return;
        }
        if (!s) { box.textContent = 'Chargement…'; btn.disabled = true; return; }
        box.innerHTML = `<div class="cap-pips">${Array.from({ length: s.max }, (_, i) => `<i class="${i < s.stock ? 'on' : ''}"></i>`).join('')}</div>
          <div><b>${s.stock}</b> capsule${s.stock > 1 ? 's' : ''} à ouvrir${s.stock >= s.max ? ' <span class="small">(réserve pleine !)</span>' : ''}</div>
          ${s.next_at ? `<div class="small">Prochaine capsule dans <b id="cp-cd">${App.capsules.countdown()}</b></div>` : ''}`;
        btn.disabled = s.stock < 1;
        $('#cp-stage').classList.toggle('is-empty', s.stock < 1);
      };

      const drawGrid = () => {
        const R = state.region, G = P().GEN_END;
        const from = R ? (R === 1 ? 1 : G[R - 2] + 1) : 1, to = R ? G[R - 1] : P().TOTAL;
        const ids = [];
        for (let i = from; i <= to; i++) {
          if (state.tier && P().tier(i) !== state.tier) continue;
          if (state.only && !dex.has(i)) continue;
          ids.push(i);
        }
        // « Tous » : seulement les Pokémon attrapés (sinon 1025 cases)
        const list = R === 0 && !state.only ? ids.filter((i) => dex.has(i)) : ids;
        $('#cp-shown').textContent = R === 0 && !state.only ? '' : `${list.length} affichés`;
        $('#cp-grid').innerHTML = list.length ? list.map((i) => {
          const d = dex.get(i);
          const t = P().tier(i);
          return d ? `<button class="dex-cell got" data-sp="${i}" style="--tc:${P().TIER[t].color}" title="${esc(P().name(i))}">
              <img src="${P().img(i)}" alt="" loading="lazy"><span class="dn">${esc(P().name(i))}</span><span class="dnum">${P().num(i)}</span>
              ${d.n > 1 ? `<span class="dq">×${d.n}</span>` : ''}${d.shiny ? '<span class="dsh" title="Chromatique">✦</span>' : ''}</button>`
            : `<div class="dex-cell miss" style="--tc:${P().TIER[t].color}"><span class="dq-miss">?</span><span class="dnum">${P().num(i)}</span></div>`;
        }).join('') : `<div class="empty panel">${dex.size ? 'Aucun Pokémon ici avec ces filtres.' : 'Ton Pokédex est vide : ouvre ta première capsule !'}</div>`;
      };

      const drawCount = () => {
        const shinies = [...dex.values()].filter((d) => d.shiny).length;
        $('#cp-count').innerHTML = `<b style="color:var(--text)">${dex.size}</b> / ${P().TOTAL} espèces${shinies ? ` · ${shinies} chromatique${shinies > 1 ? 's' : ''}` : ''}`;
        const p = { have: dex.size, total: P().TOTAL, pct: Math.round((dex.size / P().TOTAL) * 1000) / 10, complete: dex.size >= P().TOTAL };
        $('#cp-bar').innerHTML = `<div style="margin:6px 0 14px">${App.ui.progressBar(p)}</div>`;
      };

      const refreshDex = async (fresh) => { dex = await App.capsules.dex({ fresh }).catch(() => new Map()); if (!alive()) return; drawCount(); drawGrid(); };

      el.addEventListener('click', (e) => {
        const r = e.target.closest('[data-r]');
        if (r) { state.region = +r.dataset.r; el.querySelectorAll('#cp-regions .chip').forEach((c) => c.classList.toggle('on', c === r)); return drawGrid(); }
        const sp = e.target.closest('[data-sp]');
        if (sp) return speciesModal(+sp.dataset.sp, dex.get(+sp.dataset.sp));
        if (e.target.closest('#cp-open')) openLoop(() => { drawStatus(); refreshDex(false); });
      });
      el.addEventListener('change', (e) => {
        if (e.target.id === 'cp-tier') { state.tier = +e.target.value; drawGrid(); }
        if (e.target.id === 'cp-only') { state.only = e.target.checked; drawGrid(); }
      });

      const off = App.capsules.on(drawStatus);
      const tick = setInterval(() => { const c = el.querySelector('#cp-cd'); if (c) c.textContent = App.capsules.countdown(); }, 1000);
      drawStatus();
      App.capsules.status().catch(() => drawStatus());
      refreshDex(true);
      return () => { off(); clearInterval(tick); };
    },
  };
})();
