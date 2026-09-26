/* Page « Capsules » : ouvrir ses capsules (animation selon la rareté) et son Pokédex des Pokémon attrapés */
(() => {
  const { esc } = App.util;
  const P = () => App.pokedex;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /** Capsule CollecDex (dessin original) : moitié haute holographique, moitié basse sombre, étoile */
  let uid = 0;
  function capsuleSVG(cls = '', size = 120, gold = false) {
    const g = 'capg' + (++uid), d = 'capd' + uid, h = 'caph' + uid;
    // grande capsule : moitié haute dorée
    const top = gold ? '<stop offset="0" stop-color="#fff6c2"/><stop offset=".35" stop-color="#ffd23f"/><stop offset=".75" stop-color="#ff9d2e"/><stop offset="1" stop-color="#c96b00"/>'
      : '<stop offset="0" stop-color="#ffd23f"/><stop offset=".38" stop-color="#ff4fa3"/><stop offset=".72" stop-color="#7c5cff"/><stop offset="1" stop-color="#34d5ff"/>';
    return `<svg class="capsule ${cls} ${gold ? 'gold' : ''}" width="${size}" height="${Math.round(size * 1.25)}" viewBox="0 0 120 150" aria-hidden="true">
      <defs>
        <linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1">${top}</linearGradient>
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

  /** Fiche d'un Pokémon attrapé (avec la vente, si la boutique est installée) ; onChange() après une vente */
  function speciesModal(id, d, onChange) {
    let sh = false;
    const st = App.capsules.state, shop = !!(st && st.shop);
    const pts = (n) => `${n} éclat${n > 1 ? 's' : ''}`;
    const body = App.util.openModal(`<div class="sp-modal">
      <div class="sp-art t${P().tier(id)}" style="--tc:${P().TIER[P().tier(id)].color}"><img id="sp-img" src="${P().img(id)}" alt="${esc(P().name(id))}"></div>
      <div class="sp-info">
        <div class="muted small">${P().num(id)} · ${esc(P().region(id))}</div>
        <h2>${esc(P().name(id))}</h2>
        <div class="row" style="gap:8px">${tierPill(P().tier(id))}${d.shiny ? '<span class="shiny-pill">✦ Chromatique</span>' : ''}</div>
        <p class="small muted" id="sp-count"></p>
        ${d.shiny ? '<div class="chips" id="sp-sw"><button class="chip on" data-sh="0">Normal</button><button class="chip" data-sh="1">✦ Chromatique</button></div>' : ''}
        <button class="btn primary" id="sp-av" style="margin-top:12px">${App.icons.icon('user', 16)} En faire mon avatar</button>
        ${shop ? `<div class="sp-sell" id="sp-sell"></div>` : ''}
      </div></div>`);
    const drawSell = async () => {
      body.querySelector('#sp-count').textContent = d.n > 0 ? `Attrapé ${d.n} fois${d.shiny ? ` (dont ${d.shiny} chromatique${d.shiny > 1 ? 's' : ''})` : ''} · la première fois le ${App.util.dateFr(new Date(d.first).toISOString())}.` : 'Tu n’as plus ce Pokémon.';
      const box = body.querySelector('#sp-sell'); if (!box) return;
      const have = sh ? d.shiny : d.n - d.shiny, p = App.capsules.price(id, sh);
      box.innerHTML = have > 0 ? `<div class="small muted">${sh ? 'Chromatique' : 'Normal'} : ${have} exemplaire${have > 1 ? 's' : ''} · se vend <b>${pts(p)}</b></div>
        <div class="row" style="gap:8px;margin-top:6px"><button class="btn sm" data-sell="1">${App.icons.icon('coin', 14)} Vendre 1 (+${p})</button>
        ${have > 2 ? `<button class="btn sm ghost" data-sell="${have - 1}">Vendre ${have - 1}, en garder 1 (+${p * (have - 1)})</button>` : ''}</div>`
        : `<div class="small muted">Aucun exemplaire ${sh ? 'chromatique' : 'normal'} à vendre.</div>`;
    };
    drawSell();
    body.addEventListener('click', async (e) => {
      const b = e.target.closest('#sp-sw [data-sh]');
      if (b) { sh = b.dataset.sh === '1'; body.querySelectorAll('#sp-sw .chip').forEach((c) => c.classList.toggle('on', c === b)); body.querySelector('#sp-img').src = P().img(id, sh); drawSell(); }
      if (e.target.closest('#sp-av')) { await setAvatar(id, sh); App.util.closeModal(); }
      const sb = e.target.closest('[data-sell]');
      if (sb) {
        const n = +sb.dataset.sell, have = sh ? d.shiny : d.n - d.shiny;
        const prof = await App.col.getProfile().catch(() => ({}));
        const isAv = prof.avatarPoke && prof.avatarPoke.id === id && !!prof.avatarPoke.shiny === sh;
        if (isAv && n >= have) { App.util.toast('C’est ton avatar : change d’avatar avant de vendre ton dernier exemplaire', 4000); return; }
        if (n >= d.n && !confirm(`Vendre ton dernier ${P().name(id)} ? Il quittera ton Pokédex.`)) return;
        if (P().tier(id) >= 5 && n >= have && !confirm(`${P().name(id)} est ${P().TIER[P().tier(id)].name.toLowerCase()} : le vendre quand même ?`)) return;
        sb.disabled = true;
        try {
          const r = await App.capsules.sell(id, sh, n);
          App.sfx.click();
          App.util.toast(`+${pts(r.gain)} (tu as ${pts(r.coins)})`);
          if (d.n <= 0) { App.util.closeModal(); } else drawSell();
          if (onChange) onChange();
        } catch (err) { App.util.toast(err.message, 4000); sb.disabled = false; }
      }
    });
  }

  /**
   * Ouverture : la capsule tombe, tremble (plus longtemps si c'est rare), s'ouvre dans un éclair,
   * puis le Pokémon apparaît avec un effet d'autant plus spectaculaire qu'il est rare.
   * Toucher l'écran passe l'animation.
   */
  async function openAnimation(kind = 'normal') {
    const ov = document.createElement('div');
    ov.className = 'cap-ov';
    ov.innerHTML = `<div class="cap-ov-bg"></div><div class="cap-flash"></div>
      <div class="cap-scene">
        <div class="cap-rays"></div><div class="cap-halo"></div><div class="cap-burst"></div>
        <div class="cap-ball">${capsuleSVG('', kind === 'grande' ? 150 : 132, kind === 'grande')}</div>
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
    const res = App.capsules.open(kind).then((r) => ({ r }), (e) => ({ e }));
    App.sfx.unlock();
    ov.classList.add('co-drop');
    setTimeout(() => App.sfx.drop(), 430); // la capsule touche le sol
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
      App.sfx.wobble(i);
      if (i === shakes - 1) ov.classList.add('co-hint');
      await wait(760);
    }
    // ouverture
    ov.classList.add('co-burst', 'co-t' + t);
    App.sfx.open(t, r.shiny);
    if (r.shiny) ov.classList.add('co-shiny');
    const parts = [0, 0, 8, 14, 22, 32, 40][t];
    ov.querySelector('.cap-burst').innerHTML = Array.from({ length: parts }, (_, i) => `<i style="--a:${(360 / parts) * i + Math.random() * 12}deg;--d:${110 + Math.random() * 90}px;--s:${4 + Math.random() * 6}px;--dl:${Math.random() * 120}ms"></i>`).join('');
    if (r.shiny) ov.querySelector('.cap-sparkles').innerHTML = Array.from({ length: 12 }, () => `<b style="left:${10 + Math.random() * 80}%;top:${8 + Math.random() * 80}%;--dl:${Math.random() * 1.6}s">✦</b>`).join('');
    await wait(t >= 5 ? 900 : 550);
    ov.classList.add('co-reveal');
    const isNew = r.count === 1;
    const left = kind === 'grande' ? r.big : r.stock + (r.bonus || 0);
    const shop = r.coins !== undefined, p = shop ? App.capsules.price(r.species, r.shiny) : 0;
    ov.querySelector('.cap-text').innerHTML = `
      ${t >= 5 ? `<div class="cap-banner">${esc(T.name)} !</div>` : ''}
      <div class="cap-name">${esc(P().name(r.species))}</div>
      <div class="row cap-tags">${tierPill(t)}${r.shiny ? '<span class="shiny-pill">✦ Chromatique !</span>' : ''}${isNew ? '<span class="new-pill">Nouveau !</span>' : `<span class="dup-pill">×${r.count}</span>`}</div>
      <div class="muted small">${P().num(r.species)} · ${esc(P().region(r.species))}</div>
      <div class="row cap-btns">
        ${left > 0 ? `<button class="btn primary" data-again>${App.icons.icon('capsule', 16)} Ouvrir la suivante (${left})</button>` : ''}
        <button class="btn" data-avatar>En faire mon avatar</button>
        ${shop ? `<button class="btn" data-sell>${App.icons.icon('coin', 16)} Vendre (+${p})</button>` : ''}
        <button class="btn ghost" data-close>Fermer</button>
      </div>`;
    ov.querySelector('.cap-hint').remove();
    return new Promise((resolve) => {
      ov.querySelector('.cap-btns').addEventListener('click', async (e) => {
        if (e.target.closest('[data-avatar]')) { await setAvatar(r.species, r.shiny); e.target.closest('[data-avatar]').disabled = true; return; }
        const sb = e.target.closest('[data-sell]');
        if (sb) {
          const prof = await App.col.getProfile().catch(() => ({}));
          if (prof.avatarPoke && prof.avatarPoke.id === r.species && !!prof.avatarPoke.shiny === !!r.shiny && r.count === 1) { App.util.toast('C’est ton avatar : impossible de le vendre', 3500); return; }
          if ((t >= 5 || r.shiny) && !confirm(`Vendre ${P().name(r.species)}${r.shiny ? ' chromatique' : ''} pour ${p} éclats ?`)) return;
          sb.disabled = true;
          try { const x = await App.capsules.sell(r.species, r.shiny, 1); App.sfx.click(); sb.innerHTML = `${App.icons.icon('check', 16)} Vendu (+${x.gain})`; ov.querySelector('[data-avatar]').disabled = true; }
          catch (err) { App.util.toast(err.message, 4000); sb.disabled = false; }
          return;
        }
        if (e.target.closest('[data-again]')) { close(); resolve({ r, again: true }); return; }
        if (e.target.closest('[data-close]')) { close(); resolve({ r, again: false }); }
      });
    });
  }

  async function openLoop(after, kind = 'normal') {
    for (;;) {
      const x = await openAnimation(kind);
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
              <a class="btn primary" href="#/connexion">${App.icons.icon('user', 16)} Me connecter pour recevoir mes capsules</a>
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
            <div class="row cap-actions"><button class="btn primary big" id="cp-open" disabled>${App.icons.icon('capsule', 18)} Ouvrir une capsule</button>
              <button class="btn big gold-btn hidden" id="cp-open-big">${App.icons.icon('capsule', 18)} Ouvrir une grande capsule <span class="gb-n" id="cp-big-n"></span></button>
              <button class="btn ghost cp-sound" id="cp-sound" title="Sons de l’ouverture">${App.icons.icon(App.sfx.enabled ? 'sound' : 'mute', 18)}</button></div>
            <details class="cap-odds"><summary class="small">Chances d’obtention</summary>
              <div class="cap-odds-list">${[1, 2, 3, 4, 5, 6].map((t) => `<span>${tierPill(t)} <b>${String(P().TIER[t].odds).replace('.', ',')} %</b></span>`).join('')}<span><span class="shiny-pill">✦ Chromatique</span> <b>1 %</b></span></div>
              <p class="small muted">Une capsule arrive toutes les heures, 10 au maximum en réserve : pense à passer les ouvrir !</p>
              <p class="small"><b>Grande capsule</b> (boutique) : jamais de commun ni de peu commun — ${tierPill(3)} 45 %, ${tierPill(4)} 33 %, ${tierPill(5)} 17 %, ${tierPill(6)} 5 % ; chromatique 3 %.</p></details>
          </div>
        </section>
        <section class="panel cap-shop" id="cp-shop"></section>
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
        const n = s.stock + s.bonus;
        box.innerHTML = `<div class="cap-pips">${Array.from({ length: s.max }, (_, i) => `<i class="${i < s.stock ? 'on' : ''}"></i>`).join('')}</div>
          <div><b>${n}</b> capsule${n > 1 ? 's' : ''} à ouvrir${s.bonus ? ` <span class="small">(dont ${s.bonus} achetée${s.bonus > 1 ? 's' : ''})</span>` : ''}${s.stock >= s.max ? ' <span class="small">(réserve pleine !)</span>' : ''}</div>
          ${s.big ? `<div><b style="color:#ffc83d">${s.big}</b> grande${s.big > 1 ? 's' : ''} capsule${s.big > 1 ? 's' : ''}</div>` : ''}
          ${s.next_at ? `<div class="small">Prochaine capsule gratuite dans <b id="cp-cd">${App.capsules.countdown()}</b></div>` : ''}`;
        btn.disabled = n < 1;
        const bb = $('#cp-open-big'); bb.classList.toggle('hidden', !s.big); $('#cp-big-n').textContent = s.big > 1 ? `×${s.big}` : '';
        $('#cp-stage').classList.toggle('is-empty', n < 1 && !s.big);
        drawShop();
      };

      // ---------- Boutique : éclats (la monnaie), achats, vente des doublons ----------
      const pts = (n) => `${n} éclat${n > 1 ? 's' : ''}`;
      const drawShop = () => {
        const box = $('#cp-shop'), s = App.capsules.state;
        if (!box) return;
        if (!s || App.capsules.missing) { box.hidden = true; return; }
        box.hidden = false;
        if (!s.shop) { box.innerHTML = `<h2 style="margin-top:0">${App.icons.icon('shop', 20)} Boutique</h2><p class="small"><b>Il reste une étape :</b> lancer le script <code>supabase-v5.sql</code> dans Supabase (SQL Editor) pour vendre tes Pokémon et acheter des capsules.</p>`; return; }
        const d = App.capsules.dupes(dex), P1 = s.prices.capsule, P2 = s.prices.grande;
        box.innerHTML = `<div class="shop-head"><h2>${App.icons.icon('shop', 20)} Boutique</h2><div class="coins-pill" title="Tes éclats (gagnés en vendant tes Pokémon)">${App.icons.icon('coin', 18)} <b>${s.coins}</b> éclat${s.coins > 1 ? 's' : ''}</div></div>
          <div class="shop-grid">
            <div class="shop-item ${s.coins >= P1 ? 'can' : ''}"><div class="shop-art">${capsuleSVG('', 46)}</div><div class="shop-txt"><b>Capsule</b><span>La même que celle de chaque heure, en plus de ta réserve.</span></div>
              <button class="btn sm ${s.coins >= P1 ? 'primary' : ''}" data-buy="capsule" ${s.coins >= P1 ? '' : 'disabled'}>${App.icons.icon('coin', 14)} ${P1}</button></div>
            <div class="shop-item gold ${s.coins >= P2 ? 'can' : ''}"><div class="shop-art">${capsuleSVG('', 46, true)}</div><div class="shop-txt"><b>Grande capsule</b><span>Au moins rare, 1 chance sur 5 d’un légendaire ou d’un fabuleux, chromatique 3 %.</span></div>
              <button class="btn sm ${s.coins >= P2 ? 'gold-btn' : ''}" data-buy="grande" ${s.coins >= P2 ? '' : 'disabled'}>${App.icons.icon('coin', 14)} ${P2}</button></div>
            <div class="shop-item"><div class="shop-art coin-art">${App.icons.icon('coin', 34)}</div><div class="shop-txt"><b>Vendre mes doublons</b><span>${d.n ? `${d.n} Pokémon en double → <b>+${pts(d.gain)}</b>. Tu gardes un exemplaire de chaque, et tous tes chromatiques.` : 'Aucun doublon pour l’instant (tu gardes toujours un exemplaire de chaque).'}</span></div>
              <button class="btn sm" data-dupes ${d.n ? '' : 'disabled'}>Vendre${d.n ? ` (+${d.gain})` : ''}</button></div>
          </div>
          <p class="small muted" style="margin:10px 0 0">Prix de vente : commun 1 · peu commun 3 · rare 8 · très rare 20 · légendaire 100 · fabuleux 150 · chromatique ×5. Touche un Pokémon de ton Pokédex pour le vendre à l’unité.</p>`;
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

      const refreshDex = async (fresh) => { dex = await App.capsules.dex({ fresh }).catch(() => new Map()); if (!alive()) return; drawCount(); drawGrid(); drawShop(); };

      el.addEventListener('click', (e) => {
        const r = e.target.closest('[data-r]');
        if (r) { state.region = +r.dataset.r; el.querySelectorAll('#cp-regions .chip').forEach((c) => c.classList.toggle('on', c === r)); return drawGrid(); }
        const sp = e.target.closest('[data-sp]');
        if (sp) return speciesModal(+sp.dataset.sp, dex.get(+sp.dataset.sp), () => refreshDex(false));
        if (e.target.closest('#cp-open')) openLoop(() => { drawStatus(); refreshDex(false); });
        if (e.target.closest('#cp-open-big')) openLoop(() => { drawStatus(); refreshDex(false); }, 'grande');
        const buy = e.target.closest('[data-buy]');
        if (buy) {
          buy.disabled = true;
          App.capsules.buy(buy.dataset.buy, 1).then(() => {
            App.sfx.click();
            App.util.toast(buy.dataset.buy === 'grande' ? 'Grande capsule achetée ✓ — ouvre-la en haut de la page !' : 'Capsule achetée ✓');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }).catch((err) => { App.util.toast(err.message, 4000); drawShop(); });
          return;
        }
        const dp = e.target.closest('[data-dupes]');
        if (dp) {
          const d = App.capsules.dupes(dex);
          if (!d.n || !confirm(`Vendre ${d.n} doublon${d.n > 1 ? 's' : ''} pour ${pts(d.gain)} ? Tu gardes un exemplaire de chaque Pokémon et tous tes chromatiques.`)) return;
          dp.disabled = true;
          App.capsules.sellDupes().then((r) => { App.sfx.click(); App.util.toast(`+${pts(r.gain)} (${r.sold} doublon${r.sold > 1 ? 's' : ''} vendu${r.sold > 1 ? 's' : ''})`); refreshDex(false); })
            .catch((err) => { App.util.toast(err.message, 4000); dp.disabled = false; });
          return;
        }
        const sb = e.target.closest('#cp-sound');
        if (sb) {
          App.settings.sound = !App.sfx.enabled; App.col.saveSettings();
          sb.innerHTML = App.icons.icon(App.sfx.enabled ? 'sound' : 'mute', 18);
          App.util.toast(App.sfx.enabled ? 'Sons activés' : 'Sons coupés');
          App.sfx.click();
        }
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
