/* Page « Capsules » : ouvrir ses capsules (animation selon la rareté) et son Pokédex des Pokémon attrapés */
(() => {
  const { esc } = App.util;
  const P = () => App.pokedex;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /** Capsule CollecDex (dessin original) : moitié haute holographique, moitié basse sombre, étoile */
  let uid = 0;
  function capsuleSVG(cls = '', size = 120, gold = false, theme = null) {
    const g = 'capg' + (++uid), d = 'capd' + uid, h = 'caph' + uid;
    // grande capsule : moitié haute dorée ; capsule du mois : couleurs et dessin du thème
    const top = theme ? theme.stops.map((c, i) => `<stop offset="${[0, 0.35, 0.72, 1][i]}" stop-color="${c}"/>`).join('')
      : gold ? '<stop offset="0" stop-color="#fff6c2"/><stop offset=".35" stop-color="#ffd23f"/><stop offset=".75" stop-color="#ff9d2e"/><stop offset="1" stop-color="#c96b00"/>'
      : '<stop offset="0" stop-color="#ffd23f"/><stop offset=".38" stop-color="#ff4fa3"/><stop offset=".72" stop-color="#7c5cff"/><stop offset="1" stop-color="#34d5ff"/>';
    const emblem = theme ? `<text x="60" y="48" text-anchor="middle" font-size="30">${theme.icon}</text>`
      : '<path d="M60 22l5.2 11.6 12.6 1.3-9.4 8.5 2.7 12.4L60 49.4l-11.1 6.4 2.7-12.4-9.4-8.5 12.6-1.3z" fill="#fff" stroke="#0b0d1f" stroke-width="2.4" stroke-linejoin="round"/>';
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
        ${emblem}</g>
      <rect class="cap-seam" x="10" y="72" width="100" height="6" rx="3" fill="#0b0d1f"/>
      <rect class="cap-glow" x="14" y="73.5" width="92" height="3" rx="1.5" fill="#fff"/>
    </svg>`;
  }

  // rareté cachée (Arceus) : « ??? » tant qu'on ne l'a pas attrapé
  const tierPill = (t, known = true) => `<span class="tier-pill ${P().TIER[t].secret ? 'secret' : ''}" style="--tc:${P().TIER[t].color}">${esc(P().TIER[t].secret && !known ? '???' : P().TIER[t].name)}</span>`;
  // « Forme Feu » (Arceus), « Lettre B » / « Signe ! » (Zarbi)
  const formLabel = (id, F) => (+id === 201 ? `${F.key.length === 1 ? 'Lettre' : 'Signe'} ${F.name}` : F.skin ? `Costume ${F.name}` : `Forme ${F.name}`);
  const rareText = (id) => (P().TIER[P().tier(id)].secret ? 'C’est le Dieu des Pokémon.' : `C’est un Pokémon ${P().TIER[P().tier(id)].name.toLowerCase()}.`);

  /** Choisir son avatar parmi ses Pokémon attrapés → { id, shiny } ou null */
  async function pickAvatar() {
    const dex = await App.capsules.dex().catch(() => new Map());
    await App.capsules.forms(0).catch(() => null); // charge les formes attrapées (Arceus, Zarbi)
    const list = [];
    for (const [id, d] of [...dex.entries()].sort((a, b) => a[0] - b[0])) {
      // Pokémon à formes (Arceus, Zarbi) : une case par forme attrapée (normale et chromatique)
      const forms = P().formsOf(id) ? await App.capsules.forms(id).catch(() => new Map()) : new Map();
      if (forms.size) {
        for (const f of P().formsOf(id)) {
          const c = forms.get(f.key); if (!c) continue;
          if (c.n > c.shiny) list.push({ id, shiny: false, form: f.key });
          if (c.shiny) list.push({ id, shiny: true, form: f.key });
        }
        continue;
      }
      list.push({ id, shiny: false });
      if (d.shiny) list.push({ id, shiny: true });
    }
    return new Promise((resolve) => {
      let done = false;
      const body = App.util.openModal(`<div class="av-pick">
        <h2>Choisis ton avatar</h2>
        ${list.length ? `<p class="small muted">Parmi les Pokémon que tu as attrapés (${list.length}).</p>
          <input type="search" id="av-q" placeholder="Rechercher…">
          <div class="av-grid">${list.map((x) => `<button class="av-cell ${x.shiny ? 'shiny' : ''}" data-av="${x.id}" data-sh="${x.shiny ? 1 : 0}" data-form="${esc(x.form || '')}" data-n="${esc(App.util.norm(P().fullName(x.id, x.form)))}" title="${esc(P().fullName(x.id, x.form))}${x.shiny ? ' (chromatique)' : ''}"><img src="${P().img(x.id, x.shiny, x.form)}" alt="" loading="lazy"><span>${esc(P().fullName(x.id, x.form))}</span></button>`).join('')}</div>`
          : `<p class="muted">Tu n’as pas encore attrapé de Pokémon. Ouvre des capsules pour en attraper !</p><a class="btn primary" href="#/capsules">${App.icons.icon('capsule', 16)} Mes capsules</a>`}
      </div>`, () => { if (!done) resolve(null); });
      body.addEventListener('click', (e) => {
        const c = e.target.closest('[data-av]');
        if (c) {
          done = true;
          const fm = P().form(+c.dataset.av, c.dataset.form);
          resolve({ id: +c.dataset.av, shiny: c.dataset.sh === '1', ...(fm ? { form: fm } : {}) }); App.util.closeModal();
        }
        if (e.target.closest('a[href]')) App.util.closeModal();
      });
      const q = body.querySelector('#av-q');
      if (q) q.addEventListener('input', () => { const v = App.util.norm(q.value); body.querySelectorAll('.av-cell').forEach((c) => { c.hidden = v && !c.dataset.n.includes(v); }); });
    });
  }

  /** Enregistre le Pokémon comme avatar (et oublie l'ancienne photo de profil) */
  async function setAvatar(id, shiny, form = null) {
    const p = await App.col.getProfile();
    if (p.avatar) { App.cloud.markPhotoDelete(p.avatar); p.avatar = null; }
    const fm = P().form(id, form);
    p.avatarPoke = { id, shiny: !!shiny, ...(fm ? { form: fm } : {}) };
    await App.col.saveProfile(p);
    App.col.notify();
    App.util.toast(`${P().fullName(id, fm)} est ton nouvel avatar ✓`);
  }

  /** Petite case d'un Pokémon dans la fiche (évolutions, chromatique) : grisée avec « ? » s'il n'est pas attrapé */
  const evoCell = (i, got, shiny, cur) => `<button class="evo-cell ${got ? 'got' : 'miss'} ${i === cur && !shiny ? 'cur' : ''}" data-evo="${i}" style="--tc:${P().TIER[P().tier(i)].color}" title="${esc(P().name(i))}${shiny ? ' chromatique' : ''}${got ? '' : ' (pas encore attrapé)'}">
      <span class="evo-img"><img src="${P().img(i, shiny)}" alt="" loading="lazy">${shiny ? '<span class="evo-sh">✦</span>' : ''}</span>
      <span class="evo-n">${esc(P().name(i))}</span></button>`;

  /** Nombre d'exemplaires normaux / chromatiques d'une espèce */
  const counts = (d) => ({ normal: d ? d.n - d.shiny : 0, shiny: d ? d.shiny : 0 });

  /** Fiche d'un Pokémon (attrapé ou non) : évolutions, version chromatique, avatar et vente ; onChange() après une vente */
  async function speciesModal(id, dex, onChange) {
    const d = dex.get(id);
    const got = !!d, c0 = counts(d);
    let sh = c0.normal === 0 && c0.shiny > 0; // seulement le chromatique : on montre celui-là d'abord
    // Pokémon à formes (Arceus : 18 types, Zarbi : 28 lettres) ; la forme affichée = la première attrapée
    const FL = P().formsOf(id);
    const forms = FL && got ? new Map(await App.capsules.forms(id).catch(() => new Map())) : null;
    // costumes (Pikachu, Cadoizo) : les exemplaires sans costume forment la « forme » normale ; les costumes ne se vendent pas
    const skins = !!(FL && FL[1].skin);
    let skinN = 0, skinSh = 0;
    if (skins && forms) {
      for (const f of forms.values()) { skinN += f.n; skinSh += f.shiny; }
      if (d.n > skinN) forms.set('normal', { n: d.n - skinN, shiny: d.shiny - skinSh });
    }
    let form = forms && forms.size ? FL.find((f) => forms.has(f.key)).key : null;
    if (form) { const c = forms.get(form); sh = c.n === c.shiny; }
    const st = App.capsules.state, shop = !!(got && st && st.shop);
    const pts = (n) => `${n} éclat${n > 1 ? 's' : ''}`;
    const fam = P().family(id);
    // évolutions : la version que tu as (normale, sinon chromatique) ; grisée avec « ? » si tu n'as aucune des deux
    const famCell = (i) => { const c = counts(dex.get(i)); return c.normal || !c.shiny ? evoCell(i, c.normal > 0, false, id) : evoCell(i, true, true, id); };
    const evoHTML = fam.flat().length > 1 ? `<div class="sp-evo"><h3>Évolutions</h3><div class="evo-line">${fam.map((stage) => `<div class="evo-stage">${stage.map(famCell).join('')}</div>`).join('<span class="evo-arrow" aria-hidden="true">›</span>')}</div></div>` : '';
    const shinyHTML = `<div class="sp-evo"><h3>Version chromatique</h3><div class="evo-line">${evoCell(id, c0.shiny > 0, true, -1)}
      <p class="small muted" style="margin:0;align-self:center">${c0.shiny ? `Tu l’as attrapé en chromatique${c0.shiny > 1 ? ` ${c0.shiny} fois` : ''} ✦` : 'Pas encore attrapé en chromatique (1 % de chance à chaque capsule, 3 % avec une grande capsule).'}</p></div></div>`;
    const formsHTML = forms ? `<div class="sp-evo"><h3>${skins ? 'Les costumes' : `Les ${FL.length} formes`} <span class="muted small">${forms.size}/${FL.length}</span></h3>
      <p class="small muted" style="margin:0 0 8px">${skins ? 'Les costumes s’obtiennent dans la capsule de la semaine, pendant les événements (20 % de chances). Ils ne se vendent pas.' : `Chaque ${esc(P().name(id))} attrapé est une forme que tu n’as pas encore.`}</p>
      <div class="form-grid ${id === 201 ? 'unown' : ''}">${FL.map((f) => { const c = forms.get(f.key); return `<button class="evo-cell form-cell ${c ? 'got' : 'miss'}" data-form="${f.key}" style="--tc:${f.color}" title="${esc(P().fullName(id, f.key))}${c ? '' : ' (pas encore attrapé)'}">
        <span class="evo-img"><img src="${P().img(id, false, f.key)}" alt="" loading="lazy">${c && c.shiny ? '<span class="evo-sh">✦</span>' : ''}</span><span class="evo-n">${esc(f.name)}</span></button>`; }).join('')}</div></div>` : '';
    const body = App.util.openModal(`<div class="sp-modal">
      <div class="sp-art t${P().tier(id)}" style="--tc:${P().TIER[P().tier(id)].color}"><img id="sp-img" src="${P().img(id, sh)}" alt="${esc(P().name(id))}" width="200" height="200"><span class="sp-q">?</span></div>
      <div class="sp-info">
        <div class="muted small">${P().num(id)} · ${esc(P().region(id))}</div>
        <h2 id="sp-name">${esc(P().fullName(id, form))}</h2>
        <div class="row" style="gap:8px">${tierPill(P().tier(id), got)}${c0.shiny ? '<span class="shiny-pill">✦ Chromatique</span>' : ''}</div>
        <p class="small muted sp-count">${got ? `Attrapé ${d.n} fois${c0.shiny ? ` (dont ${c0.shiny} chromatique${c0.shiny > 1 ? 's' : ''})` : ''} · la première fois le ${App.util.dateFr(new Date(d.first).toISOString())}.` : 'Pas encore attrapé : ouvre des capsules pour le trouver !'}</p>
        ${got ? `<div class="chips" id="sp-sw"><button class="chip" data-sh="0">Normal${c0.normal ? ` ×${c0.normal}` : ''}</button><button class="chip" data-sh="1">✦ Chromatique${c0.shiny ? ` ×${c0.shiny}` : ''}</button></div>
          <button class="btn primary" id="sp-av" style="margin-top:12px">${App.icons.icon('user', 16)} En faire mon avatar</button>` : ''}
        ${shop ? `<div class="sp-sell" id="sp-sell"></div>` : ''}
      </div></div>${formsHTML}${evoHTML}${shinyHTML}`);
    body.addEventListener('click', (e) => {
      const ev = e.target.closest('[data-evo]');
      if (ev && +ev.dataset.evo !== id) speciesModal(+ev.dataset.evo, dex, onChange);
    });
    const own = () => {
      if (form) { const c = forms.get(form); return !!c && (sh ? c.shiny : c.n - c.shiny) > 0; }
      return (sh ? counts(d).shiny : counts(d).normal) > 0;
    };
    // version affichée (normale / chromatique, et forme d'Arceus) : grisée si tu ne l'as pas, sans changer la taille de la fiche
    const drawVersion = () => {
      body.querySelector('.sp-modal').classList.toggle('sp-miss', !own());
      body.querySelector('#sp-img').src = P().img(id, sh, form);
      body.querySelector('#sp-name').textContent = P().fullName(id, form);
      body.querySelectorAll('.form-cell').forEach((c) => c.classList.toggle('cur', c.dataset.form === form));
      body.querySelectorAll('#sp-sw .chip').forEach((c) => c.classList.toggle('on', (c.dataset.sh === '1') === sh));
      const av = body.querySelector('#sp-av');
      if (av) { av.disabled = !own(); av.title = own() ? '' : `Tu n’as pas ${P().name(id)} en version ${sh ? 'chromatique' : 'normale'}`; }
    };
    drawVersion();
    if (!got) return;
    const drawSell = async () => {
      const box = body.querySelector('#sp-sell'); if (!box) return;
      const have = (sh ? counts(d).shiny - skinSh : counts(d).normal - (skinN - skinSh)), p = App.capsules.price(id, sh); // sans les costumes
      box.innerHTML = have > 0 ? `<div class="small muted">${sh ? 'Chromatique' : 'Normal'} : ${have} exemplaire${have > 1 ? 's' : ''} · se vend <b>${pts(p)}</b></div>
        <div class="row" style="gap:8px;margin-top:6px"><button class="btn sm" data-sell="1">${App.icons.icon('coin', 14)} Vendre 1 (+${p})</button>
        ${have > 2 ? `<button class="btn sm ghost" data-sell="${have - 1}">Vendre ${have - 1}, en garder 1 (+${p * (have - 1)})</button>` : ''}</div>`
        : `<div class="small muted">Aucun exemplaire ${sh ? 'chromatique' : 'normal'} à vendre.</div>`;
    };
    drawSell();
    body.addEventListener('click', async (e) => {
      const b = e.target.closest('#sp-sw [data-sh]');
      if (b) { sh = b.dataset.sh === '1'; drawVersion(); drawSell(); }
      const fc = e.target.closest('.form-cell.got');
      if (fc) { form = fc.dataset.form; drawVersion(); }
      if (e.target.closest('#sp-av')) { if (!own()) return; await setAvatar(id, sh, form); App.util.closeModal(); }
      const sb = e.target.closest('[data-sell]');
      if (sb) {
        const n = +sb.dataset.sell, have = sh ? d.shiny : d.n - d.shiny;
        const prof = await App.col.getProfile().catch(() => ({}));
        const isAv = prof.avatarPoke && prof.avatarPoke.id === id && !!prof.avatarPoke.shiny === sh;
        if (isAv && n >= have) { App.util.toast('C’est ton avatar : change d’avatar avant de vendre ton dernier exemplaire', 4000); return; }
        const last = n >= d.n, rare = P().tier(id) >= 5 && n >= have;
        if ((last || rare) && !await App.util.ask({
          icon: 'coin', danger: true,
          title: last ? `Vendre ton dernier ${P().name(id)} ?` : `Vendre ${P().name(id)} ?`,
          text: [last ? 'Il quittera ton Pokédex.' : '', rare ? rareText(id) : ''].filter(Boolean).join(' '),
          ok: `Vendre (+${pts(App.capsules.price(id, sh) * n)})`,
        })) return;
        sb.disabled = true;
        try {
          const r = await App.capsules.sell(id, sh, n);
          App.sfx.click();
          App.util.toast(`+${pts(r.gain)} (tu as ${pts(r.coins)})`);
          // Arceus : le serveur a choisi quelles formes partent, on ferme la fiche (elle sera relue)
          if (d.n <= 0 || forms) { if (d.n <= 0) dex.delete(id); App.util.closeModal(); } else { drawVersion(); drawSell(); }
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
  async function openAnimation(kind = 'normal', demo = null) {
    const ov = document.createElement('div');
    ov.className = 'cap-ov';
    ov.innerHTML = `<div class="cap-ov-bg"></div><div class="cap-flash"></div>
      <div class="cap-scene">
        <div class="cap-rays"></div><div class="cap-halo"></div><div class="cap-burst"></div>
        <div class="cap-ball">${capsuleSVG('', kind === 'grande' ? 150 : 132, kind === 'grande', kind === 'week' ? App.capsuleThemes.current() : null)}</div>
        <div class="cap-mon"><img alt=""></div>
        <div class="cap-sparkles"></div>
      </div>
      <div class="cap-text"></div>
      <div class="cap-hint small">Touche pour passer</div>`;
    document.body.appendChild(ov);
    document.body.classList.add('cap-lock');
    // capsule de la semaine : fond aux couleurs du thème, et ses symboles s'envolent à l'éclatement
    const wk = kind === 'week' ? App.capsuleThemes.current() : null;
    if (wk) { ov.classList.add('co-week'); ov.style.setProperty('--wk1', wk.stops[1]); ov.style.setProperty('--wk2', wk.stops[2]); }
    let skip = false, locked = false; // locked : l'apparition d'Arceus ne se passe pas
    ov.addEventListener('click', (e) => { if (!locked && !e.target.closest('button')) skip = true; });
    const wait = async (ms) => { const end = Date.now() + ms; while (!skip && Date.now() < end) await sleep(40); };
    const close = () => { ov.classList.add('co-out'); document.body.classList.remove('cap-lock'); setTimeout(() => ov.remove(), 250); };

    // le tirage part tout de suite (réseau) pendant que la capsule tombe
    // demo : faux tirage pour revoir une animation (rien n'est envoyé au serveur)
    const res = demo ? sleep(300).then(() => ({ r: demo })) : App.capsules.open(kind).then((r) => ({ r }), (e) => ({ e }));
    App.sfx.unlock();
    ov.classList.add('co-drop');
    setTimeout(() => App.sfx.drop(), 430); // la capsule touche le sol
    const out = await res;
    if (out.e) { close(); App.util.toast(out.e.message || 'Ouverture impossible', 4000); return null; }
    // rareté d'après le site : Arceus est tiré comme un fabuleux par le serveur, mais il est « Dieu » ici
    const r = out.r, t = P().tier(r.species), T = P().TIER[t], god = !!T.secret;
    ov.style.setProperty('--tc', T.color);
    const img = ov.querySelector('.cap-mon img');
    const fm = P().form(r.species, r.form), F = fm ? P().formInfo(r.species, fm) : null; // forme (Arceus, Zarbi : supabase-v22/v23.sql)
    if (F) ov.style.setProperty('--gt', F.color);
    img.src = P().img(r.species, r.shiny, fm);
    const sparkles = () => { if (r.shiny) ov.querySelector('.cap-sparkles').innerHTML = Array.from({ length: 12 }, () => `<b style="left:${10 + Math.random() * 80}%;top:${8 + Math.random() * 80}%;--dl:${Math.random() * 1.6}s">✦</b>`).join(''); };
    // ouverture : la capsule éclate, particules et fanfare selon la rareté
    const burst = () => {
      ov.classList.add('co-burst', 'co-t' + t);
      App.sfx.open(t, r.shiny);
      if (r.shiny) ov.classList.add('co-shiny');
      const parts = [0, 0, 8, 14, 22, 32, 40, 40][t];
      ov.querySelector('.cap-burst').innerHTML = Array.from({ length: parts }, (_, i) => `<i style="--a:${(360 / parts) * i + Math.random() * 12}deg;--d:${110 + Math.random() * 90}px;--s:${4 + Math.random() * 6}px;--dl:${Math.random() * 120}ms"></i>`).join('')
        + (wk ? Array.from({ length: 9 }, (_, i) => `<b class="wk-ic" style="--a:${i * 40 + Math.random() * 20}deg;--d:${120 + Math.random() * 70}px;--rt:${Math.round(Math.random() * 120 - 60)}deg;--dl:${Math.round(Math.random() * 150)}ms">${wk.icon}</b>`).join('') : '');
      sparkles();
    };
    const lg = !god && App.capsuleLegend.get(r.species, r.shiny);
    if (god) {
      // Arceus : sa propre apparition, impossible à passer (js/views/capsules-god.js)
      skip = false; locked = true;
      ov.querySelector('.cap-hint').remove();
      if (r.shiny) ov.classList.add('co-shiny');
      sparkles();
      await App.capsuleGod.play(ov);
    } else if (lg) {
      // grands légendaires : leur apparition, impossible à passer la première fois (js/views/capsules-legend.js)
      skip = false; locked = !App.capsuleFx.seen(r.species, r.shiny);
      if (locked) ov.querySelector('.cap-hint').remove();
      await App.capsuleLegend.play(ov, lg, wait, burst);
    } else {
      await wait(650);
      // secousses : 1 (commun) à 3 (légendaire / fabuleux) ; la lueur prend la couleur de la rareté
      const shakes = t <= 2 ? 1 : t <= 4 ? 2 : 3;
      for (let i = 0; i < shakes && !skip; i++) {
        ov.classList.remove('co-wobble'); void ov.offsetWidth; ov.classList.add('co-wobble');
        App.sfx.wobble(i);
        if (i === shakes - 1) ov.classList.add('co-hint');
        await wait(760);
      }
      burst();
      await wait(t >= 5 ? 900 : 550);
    }
    const fx = !god && App.capsuleFx.get(r.species); // apparition spéciale (Carapuce à lunettes…), js/views/capsules-fx.js
    if (fx) ov.classList.add(fx.cls);
    ov.classList.add('co-reveal');
    const isNew = fm ? r.form_count === 1 : r.count === 1;
    const nForms = fm && !demo ? (await App.capsules.forms(r.species).catch(() => new Map())).size : 0;
    const left = demo || kind === 'week' ? 0 : kind === 'grande' ? r.big : r.stock + (r.bonus || 0);
    const shop = !demo && r.coins !== undefined && !(F && F.skin), p = shop ? App.capsules.price(r.species, r.shiny) : 0;
    ov.querySelector('.cap-text').innerHTML = `
      ${god ? '<div class="cap-banner god-banner" id="god-banner">???</div>' : F && F.skin ? `<div class="cap-banner skin-banner" style="--tc:${F.color}">Costume ${esc(F.name)} !</div>` : lg && lg.title ? `<div class="cap-banner lg-title">${esc(lg.title)}</div>` : t >= 5 ? `<div class="cap-banner">${esc(T.name)} !</div>` : ''}
      <div class="cap-name">${esc(P().name(r.species))}</div>
      <div class="row cap-tags">${tierPill(t, !god)}${F ? `<span class="tier-pill" style="--tc:${F.color}">${esc(formLabel(r.species, F))}</span>` : ''}${r.shiny ? '<span class="shiny-pill">✦ Chromatique !</span>' : ''}${demo && demo.souvenir ? '<span class="dup-pill">Souvenir</span>' : isNew ? `<span class="new-pill">${F ? (F.skin ? 'Nouveau costume !' : 'Nouvelle forme !') : 'Nouveau !'}</span>` : `<span class="dup-pill">×${F ? r.form_count : r.count}</span>`}</div>
      ${nForms ? `<div class="small cap-forms">${F && F.skin ? 'Costumes' : 'Formes'} de ${esc(P().name(r.species))} : <b>${nForms}/${P().formsOf(r.species).length - (F && F.skin ? 1 : 0)}</b></div>` : ''}
      <div class="muted small">${P().num(r.species)} · ${esc(P().region(r.species))}</div>
      <div class="small cap-tap">Touche ${esc(P().name(r.species))} ${left > 0 ? 'pour ouvrir la suivante' : 'pour revenir à tes capsules'}</div>
      <div class="row cap-btns">
        ${left > 0 ? `<button class="btn primary" data-again>${App.icons.icon('capsule', 16)} Ouvrir la suivante (${left})</button>` : ''}
        ${demo ? '' : '<button class="btn" data-avatar>En faire mon avatar</button>'}
        ${shop ? `<button class="btn" data-sell>${App.icons.icon('coin', 16)} Vendre (+${p})</button>` : ''}
        <button class="btn ghost" data-close>Fermer</button>
      </div>`;
    if (fx) fx.play(ov);
    if (god) await App.capsuleGod.revealTitle(ov);
    else ov.querySelector('.cap-hint')?.remove();
    locked = false;
    // apparition spéciale vue (vrai tirage ou souvenir) : elle ne sera plus imposée ni proposée en souvenir
    if (!demo || demo.souvenir) App.capsuleFx.markSeen(r.species, r.shiny);
    return new Promise((resolve) => {
      // toucher le Pokémon = ouvrir la suivante (s'il en reste), sinon revenir à la page des capsules
      const mon = ov.querySelector('.cap-mon');
      mon.classList.add('tap-next');
      mon.addEventListener('click', () => { close(); resolve({ r, again: left > 0 }); }, { once: true });
      ov.querySelector('.cap-btns').addEventListener('click', async (e) => {
        if (e.target.closest('[data-avatar]')) { await setAvatar(r.species, r.shiny, fm); e.target.closest('[data-avatar]').disabled = true; return; }
        const sb = e.target.closest('[data-sell]');
        if (sb) {
          const prof = await App.col.getProfile().catch(() => ({}));
          if (prof.avatarPoke && prof.avatarPoke.id === r.species && !!prof.avatarPoke.shiny === !!r.shiny && r.count === 1) { App.util.toast('C’est ton avatar : impossible de le vendre', 3500); return; }
          if ((t >= 5 || r.shiny) && !await App.util.ask({ icon: 'coin', danger: true, title: `Vendre ${P().name(r.species)}${r.shiny ? ' chromatique' : ''} ?`, text: r.shiny ? 'Les chromatiques sont très rares.' : rareText(r.species), ok: `Vendre (+${p} éclats)` })) return;
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

  /** Rejoue l'ouverture d'un Pokémon déjà attrapé, en « souvenir » (rien n'est envoyé au serveur) */
  const replay = (id, shiny = false) => openAnimation('normal', { species: id, tier: P().tier(id), shiny, count: 1, souvenir: true });

  async function openLoop(after, kind = 'normal') {
    for (;;) {
      const x = await openAnimation(kind);
      if (after) after();
      if (!x || !x.again) return;
    }
  }

  App.views.capsules = {
    capsuleSVG, pickAvatar, setAvatar, openLoop, speciesModal, replay,
    async render(el, params, alive) {
      const state = { region: +(params.query.r || 0), tier: 0, only: false, q: '' };
      // #/capsules?arceus (ou ?arceus=feu, ?arceus=feu-shiny) : revoir l'apparition d'Arceus, seulement sur le PC (localhost),
      // pour ne pas dévoiler le secret ; sans forme indiquée, une forme au hasard
      if ('arceus' in params.query && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
        const w = params.query.arceus.split('-').map((x) => App.util.norm(x)), F = P().formsOf(P().GOD);
        const pick = F.find((f) => w.includes(f.key) || w.includes(App.util.norm(f.name)));
        const form = (pick || F[Math.floor(Math.random() * F.length)]).key;
        setTimeout(() => openAnimation('normal', { species: P().GOD, tier: 7, shiny: w.includes('shiny'), form, count: 1, form_count: 1 }), 400);
      }
      // #/capsules?capsule=7 (ou ?capsule=7-shiny) : revoir l'ouverture d'un Pokémon (apparitions spéciales), seulement sur le PC
      if ('capsule' in params.query && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
        const w = params.query.capsule.split('-'), id = parseInt(w[0], 10), FL = P().formsOf(id);
        // Zarbi : ?capsule=201-b (sinon une lettre au hasard)
        const form = FL ? P().form(id, w[1]) || FL[Math.floor(Math.random() * FL.length)].key : null;
        if (id >= 1 && id <= P().TOTAL && id !== P().GOD) setTimeout(() => openAnimation('normal', { species: id, tier: P().tier(id), shiny: w.includes('shiny'), form, count: 1, form_count: 1 }), 400);
      }

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
          <div class="toolbar"><input type="search" id="cp-q" class="cp-q" placeholder="Rechercher un Pokémon (nom ou numéro)…" autocomplete="off"></div>
          <div class="toolbar">
            <select id="cp-tier"><option value="0">Toutes les raretés</option>${[1, 2, 3, 4, 5, 6].map((t) => `<option value="${t}">${esc(P().TIER[t].name)}</option>`).join('')}<option value="7">???</option></select>
            <label class="check small" id="cp-only-l" ${state.region ? '' : 'hidden'}><input type="checkbox" id="cp-only"> Attrapés seulement</label>
            <span class="spacer"></span><span class="muted small" id="cp-shown"></span>
          </div>
          <div class="dex-grid" id="cp-grid"></div>
        </section>`;

      const $ = (s) => el.querySelector(s);
      let dex = new Map(), formCount = {}, formMaps = {}; // formes attrapées (Arceus, Zarbi, costumes de Pikachu et Cadoizo)

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
      // capsule de la semaine (supabase-v24.sql) : change le jeudi à 20 h ; 50 éclats (type ou région) ou 75 (événement + costume)
      // texte court (Arnaud) : le thème et « jusqu'à jeudi 20 h », placée avant la grande capsule ; petit « i » discret → liste
      const themeItem = (s) => {
        const th = App.capsuleThemes.current();
        if (!th) return '';
        const ok = s.coins >= th.price;
        return `<div class="shop-item theme ${th.event ? 'event' : ''} ${ok ? 'can' : ''}" style="--th:${th.stops[1]};--th2:${th.stops[2]}"><div class="shop-art">${capsuleSVG('', 46, false, th)}</div>
          <div class="shop-txt"><b>${esc(th.name)} <button type="button" class="info-btn" data-theme-list title="Voir les Pokémon possibles" aria-label="Voir les Pokémon possibles">i</button></b><span>${esc(th.short)} · jusqu’à jeudi 20 h.</span></div>
          <button class="btn sm ${ok ? 'theme-btn' : ''}" data-theme-open ${ok ? '' : 'disabled'}>${App.icons.icon('coin', 14)} ${th.price}</button></div>`;
      };
      // les Pokémon possibles dans la capsule de la semaine (grisés s'ils manquent), costumes en premier
      const hasSkin = (id, f) => !!(formMaps[id] && formMaps[id].get(f));
      const skinCell = (i, f) => { const F = P().formInfo(i, f), got = hasSkin(i, f);
        return `<span class="evo-cell form-cell ${got ? 'got' : 'miss'}" style="--tc:${F.color}"><span class="evo-img"><img src="${P().img(i, false, f)}" alt="" loading="lazy"></span><span class="evo-n">${esc(P().name(i))} ✦</span></span>`; };
      const themeList = () => {
        const th = App.capsuleThemes.current();
        if (!th) return;
        const got = th.ids.filter((i) => dex.has(i)).length;
        App.util.openModal(`<h2>${esc(th.name)}</h2><p class="small muted">${esc(th.desc)}. ${got} / ${th.ids.length} attrapés · jusqu’au ${esc(App.capsuleThemes.until(th.ends))} · chromatique 2 %.</p>
          ${th.skins ? `<h3 style="margin:8px 0">Costume${th.skins.length > 1 ? 's' : ''} de l’événement (20 %)</h3><div class="form-grid">${th.skins.map(([i, f]) => skinCell(i, f)).join('')}</div><h3 style="margin:12px 0 8px">Les Pokémon</h3>` : ''}
          <div class="form-grid">${th.ids.map((i) => evoCell(i, dex.has(i), false, -1)).join('')}</div>`);
      };
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
            ${themeItem(s)}
            <div class="shop-item gold ${s.coins >= P2 ? 'can' : ''}"><div class="shop-art">${capsuleSVG('', 46, true)}</div><div class="shop-txt"><b>Grande capsule</b><span>Au moins rare, 1 chance sur 5 d’un légendaire ou d’un fabuleux, chromatique 3 %.</span></div>
              <button class="btn sm ${s.coins >= P2 ? 'gold-btn' : ''}" data-buy="grande" ${s.coins >= P2 ? '' : 'disabled'}>${App.icons.icon('coin', 14)} ${P2}</button></div>
            <div class="shop-item"><div class="shop-art coin-art">${App.icons.icon('coin', 34)}</div><div class="shop-txt"><b>Vendre mes doublons</b><span>${d.n ? `${d.n} Pokémon en double → <b>+${pts(d.gain)}</b>. Tu gardes un exemplaire de chaque, et tous tes chromatiques.` : 'Aucun doublon pour l’instant (tu gardes toujours un exemplaire de chaque).'}</span></div>
              <button class="btn sm" data-dupes ${d.n ? '' : 'disabled'}>Vendre${d.n ? ` (+${d.gain})` : ''}</button></div>
          </div>
          <p class="small muted" style="margin:10px 0 0">Prix de vente : commun 1 · peu commun 3 · rare 8 · très rare 20 · légendaire 100 · fabuleux 150 · chromatique ×5. Touche un Pokémon de ton Pokédex pour le vendre à l’unité.</p>`;
      };

      const drawGrid = () => {
        const R = state.region, G = P().GEN_END;
        // « Attrapés seulement » n'a de sens que dans une région (« Tous » ne montre déjà que les attrapés)
        $('#cp-only-l').hidden = !R;
        // recherche : dans tout le Pokédex (attrapés ou non), par nom ou numéro, sans tenir compte de la région
        const q = App.util.norm(state.q), qn = /^\d+$/.test(q) ? +q : 0;
        const from = R && !q ? (R === 1 ? 1 : G[R - 2] + 1) : 1, to = R && !q ? G[R - 1] : P().TOTAL;
        const ids = [];
        for (let i = from; i <= to; i++) {
          if (q && !(qn ? i === qn || String(i).startsWith(q) : App.util.norm(P().name(i)).includes(q))) continue;
          if (state.tier && P().tier(i) !== state.tier) continue;
          if (state.only && !q && !dex.has(i)) continue;
          ids.push(i);
        }
        // « Tous » : seulement les Pokémon attrapés (sinon 1025 cases)
        const list = R === 0 && !q ? ids.filter((i) => dex.has(i)) : ids;
        $('#cp-shown').textContent = R === 0 && !q ? '' : `${list.length} affiché${list.length > 1 ? 's' : ''}`;
        $('#cp-grid').innerHTML = list.length ? list.map((i) => {
          const d = dex.get(i);
          const t = P().tier(i);
          return d ? `<button class="dex-cell got" data-sp="${i}" style="--tc:${P().TIER[t].color}" title="${esc(P().name(i))}">
              <img src="${P().img(i)}" alt="" loading="lazy"><span class="dn">${esc(P().name(i))}</span><span class="dnum">${P().num(i)}</span>
              ${d.n > 1 ? `<span class="dq">×${d.n}</span>` : ''}${d.shiny ? '<span class="dsh" title="Chromatique">✦</span>' : ''}${formCount[i] ? `<span class="dforms" title="Formes attrapées">${formCount[i]}/${P().formsOf(i).length}</span>` : ''}</button>`
            : `<button class="dex-cell miss" data-sp="${i}" style="--tc:${P().TIER[t].color}" title="Pas encore attrapé"><span class="dq-miss">?</span>${q ? `<span class="dn">${esc(P().name(i))}</span>` : ''}<span class="dnum">${P().num(i)}</span></button>`;
        }).join('') : `<div class="empty panel">${q ? 'Aucun Pokémon ne correspond à ta recherche.' : dex.size ? 'Aucun Pokémon ici avec ces filtres.' : 'Ton Pokédex est vide : ouvre ta première capsule !'}</div>`;
      };

      const drawCount = () => {
        const shinies = [...dex.values()].filter((d) => d.shiny).length;
        $('#cp-count').innerHTML = `<b style="color:var(--text)">${dex.size}</b> / ${P().TOTAL} espèces${shinies ? ` · ${shinies} chromatique${shinies > 1 ? 's' : ''}` : ''}`;
        const p = { have: dex.size, total: P().TOTAL, pct: Math.round((dex.size / P().TOTAL) * 1000) / 10, complete: dex.size >= P().TOTAL };
        $('#cp-bar').innerHTML = `<div style="margin:6px 0 14px">${App.ui.progressBar(p)}</div>`;
      };

      const refreshDex = async (fresh) => {
        dex = await App.capsules.dex({ fresh }).catch(() => new Map());
        formCount = {};
        await App.capsules.forms(0, { fresh }).catch(() => null);
        formMaps = {};
        for (const id of [P().GOD, 201, 25, 225]) {
          if (!dex.has(id)) continue;
          const m = formMaps[id] = await App.capsules.forms(id).catch(() => new Map());
          // costumes : la forme normale compte aussi si on a un exemplaire sans costume
          const skinN = [...m.values()].reduce((s, f) => s + f.n, 0);
          formCount[id] = m.size + (P().formsOf(id)[1].skin && dex.get(id).n > skinN ? 1 : 0);
        }
        if (!alive()) return; drawCount(); drawGrid(); drawShop(); };

      el.addEventListener('click', (e) => {
        const r = e.target.closest('[data-r]');
        if (r) { state.region = +r.dataset.r; el.querySelectorAll('#cp-regions .chip').forEach((c) => c.classList.toggle('on', c === r)); return drawGrid(); }
        const sp = e.target.closest('[data-sp]');
        if (sp) return speciesModal(+sp.dataset.sp, dex, () => refreshDex(false));
        if (e.target.closest('#cp-open')) openLoop(() => { drawStatus(); refreshDex(false); });
        if (e.target.closest('#cp-open-big')) openLoop(() => { drawStatus(); refreshDex(false); }, 'grande');
        if (e.target.closest('[data-theme-list]')) return themeList();
        if (e.target.closest('[data-theme-open]')) openLoop(() => { drawStatus(); refreshDex(false); drawShop(); }, 'week');
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
          if (!d.n) return;
          App.util.ask({ icon: 'coins', title: `Vendre ${d.n} doublon${d.n > 1 ? 's' : ''} ?`, text: 'Tu gardes un exemplaire de chaque Pokémon et tous tes chromatiques.', ok: `Vendre (+${pts(d.gain)})` }).then((yes) => {
          if (!yes) return;
          dp.disabled = true;
          App.capsules.sellDupes().then((r) => { App.sfx.click(); App.util.toast(`+${pts(r.gain)} (${r.sold} doublon${r.sold > 1 ? 's' : ''} vendu${r.sold > 1 ? 's' : ''})`); refreshDex(false); })
            .catch((err) => { App.util.toast(err.message, 4000); dp.disabled = false; });
          });
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
      el.addEventListener('input', (e) => { if (e.target.id === 'cp-q') { state.q = e.target.value; drawGrid(); } });
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
