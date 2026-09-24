/* Vitrine : ton profil de collectionneur, personnalisable (thème, cadres, mise en page, cartes à l'honneur) */
App.views.showcase = {
  THEMES: [['nuit', 'Nuit étoilée'], ['holo', 'Holographique'], ['feu', 'Braise'], ['foret', 'Forêt'], ['classeur', 'Classeur'], ['pokeball', 'Poké Ball']],
  FRAMES: [['aucun', 'Aucun'], ['or', 'Or'], ['argent', 'Argent'], ['holo', 'Holo'], ['neon', 'Néon'], ['bois', 'Bois'], ['vitre', 'Vitrine']],
  LAYOUTS: [['vedette', 'Vedette + grille'], ['grille', 'Grille'], ['classeur', 'Page de classeur (3×3)'], ['eventail', 'Éventail']],

  async render(el, params, alive) {
    const { esc, euro } = App.util;
    const V = App.views.showcase;
    let profile = await App.col.getProfile();
    let editing = !!params.query.edit;

    const owned = () => App.col.all().filter((i) => i.qty > 0);
    const val = (i) => (i.price && i.price.value) || 0;
    const featuredItems = () => {
      const list = profile.featured.map((k) => App.col.byKey(k)).filter((i) => i && i.qty > 0);
      if (list.length) return { list, auto: false };
      const favs = owned().filter((i) => i.favorite);
      const auto = (favs.length ? favs : owned()).sort((a, b) => val(b) - val(a)).slice(0, profile.layout === 'classeur' ? 9 : 7);
      return { list: auto, auto: true };
    };

    let completedSets = [];
    const loadBadges = async () => {
      try {
        const ad = App.games.get('pokemon');
        const sets = await ad.listSets();
        completedSets = sets.filter((s) => App.col.inSet('pokemon', s.id).length && App.col.progress('pokemon', s).complete);
      } catch (e) { completedSets = []; }
    };

    const vcard = async (it, i, n) => {
      const ad = App.games.get(it.game);
      const img = await App.col.displayImage(it, ad, 'high');
      const frame = profile.frames[it.key] || profile.frame;
      // éventail : l'angle se resserre quand il y a beaucoup de cartes (tout doit tenir dans la vitrine)
      const d = i - (n - 1) / 2, step = n > 1 ? Math.min(7, 32 / (n - 1)) : 0;
      const fan = profile.layout === 'eventail' ? `style="--rot:${(d * step).toFixed(2)}deg; --dy:${(Math.abs(d) * step * 0.9).toFixed(1)}px; z-index:${n - Math.abs(Math.round(d))}"` : '';
      return `<div class="vcard" data-card="${esc(it.id)}" data-game="${it.game}" ${fan}>
        <div class="frame-${frame}"><img src="${esc(img.src)}" alt="${esc(it.snap.name)}" data-alt="${esc(it.snap.name)}"></div>
        ${profile.layout !== 'eventail' ? `<div class="vlabel">${esc(it.snap.name)}${it.price && it.price.value ? ` · <span style="color:var(--accent2)">${euro(it.price.value, it.price.unit)}</span>` : ''}</div>` : ''}
      </div>`;
    };

    const draw = async () => {
      const items = owned();
      const total = items.reduce((s, i) => s + (i.price && i.price.unit === 'EUR' ? val(i) * i.qty : 0), 0);
      const { list: feat, auto } = featuredItems();
      const top = [...items].sort((a, b) => val(b) - val(a)).slice(0, 10);
      const fresh = new Set((await App.badges.check({ silent: true })).map((b) => b.id));
      const got = await App.badges.unlocked();
      const avatar = profile.avatar ? await App.col.photoURL(profile.avatar) : '';
      const featHTML = (await Promise.all(feat.map((it, i) => vcard(it, i, feat.length)))).join('');
      const topHTML = (await Promise.all(top.map(async (it) => {
        const img = await App.col.displayImage(it, App.games.get(it.game));
        return `<div class="vcard" data-card="${esc(it.id)}" data-game="${it.game}"><div class="frame-aucun"><img src="${esc(img.src)}" alt="" data-alt="${esc(it.snap.name)}"></div><div class="vlabel">${esc(it.snap.name)}<br><span style="color:var(--accent2)">${it.price && it.price.value ? euro(it.price.value, it.price.unit) : '—'}</span></div></div>`;
      }))).join('');
      if (!alive()) return;

      el.innerHTML = `
        <div class="row v-top" style="margin-bottom:14px"><h1>Ma vitrine</h1><span class="spacer"></span>
          <button class="btn ${editing ? 'primary' : ''}" id="v-edit">${editing ? '✓ Terminer' : '✎ Personnaliser'}</button></div>
        <section class="vitrine theme-${esc(profile.theme)}" id="v-page">
          <div class="v-head">
            <div class="v-avatar" style="${avatar ? `background-image:url('${avatar}')` : ''}">${avatar ? '' : esc((profile.pseudo || '?')[0].toUpperCase())}</div>
            <div style="flex:1;min-width:220px">
              <div class="v-name">${esc(profile.pseudo)}</div>
              ${profile.bio ? `<div class="muted" style="white-space:pre-line">${esc(profile.bio)}</div>` : ''}
            </div>
          </div>
          ${profile.showStats ? `<div class="stats">
            <div class="stat"><b>${items.length}</b><span>cartes</span></div>
            <div class="stat"><b>${euro(total)}</b><span>valeur estimée</span></div>
            <div class="stat"><b>${completedSets.length}</b><span>séries complétées</span></div>
            <div class="stat"><b>${items.filter((i) => App.certify.isCertified(i)).length}</b><span>certifiées</span></div>
          </div>` : ''}
          ${feat.length ? `<div class="v-featured layout-${esc(profile.layout)}" style="--n:${feat.length}">${featHTML}</div>
            ${editing ? '' : `<p class="small muted v-pick-link">${auto ? 'Sélection automatique (favorites ou plus chères). ' : ''}<a href="#" id="v-pickcards2">${App.icons.icon('star', 13)} Choisir mes cartes à l’honneur</a></p>`}`
            : '<div class="empty">Ajoute des cartes à ta collection pour remplir ta vitrine.</div>'}
          ${profile.showBadges ? `<div class="v-achievements">
            <div class="row" style="margin-bottom:8px"><h2 style="margin:0">Badges</h2><span class="muted small">${got.length} / ${App.badges.total}</span><span class="spacer"></span>
              ${App.badges.total > got.length ? `<span class="small muted">${App.icons.icon('lock', 13)} ${App.badges.total - got.length} badge${App.badges.total - got.length > 1 ? 's' : ''} secret${App.badges.total - got.length > 1 ? 's' : ''} à débloquer</span>` : ''}</div>
            ${got.length ? `<div class="badge-grid">${[...got].sort((a, b) => b.tier - a.tier).map((b) => App.badges.medal(b, { isNew: fresh.has(b.id) })).join('')}</div>` : '<div class="muted small">Aucun badge pour l’instant : ils se débloquent en complétant ta collection.</div>'}
          </div>` : ''}
          ${profile.showBadges && completedSets.length ? `<div class="v-badges">${completedSets.map((s) => `<span class="v-badge" title="Série complétée">${s.symbol ? `<img src="${esc(s.symbol)}.png" alt="">` : App.icons.icon('trophy', 14)}${esc(s.name)}</span>`).join('')}</div>` : ''}
          ${profile.showTop && top.length ? `<h2 style="margin-top:26px">Les ${top.length} plus précieuses</h2><div class="v-featured layout-grille" style="grid-template-columns:repeat(auto-fill,minmax(130px,1fr))">${topHTML}</div>` : ''}
        </section>
        <section class="panel edit-panel" id="v-editor" ${editing ? '' : 'hidden'}></section>`;

      if (editing) await drawEditor();
    };

    const drawEditor = async () => {
      const box = el.querySelector('#v-editor');
      const items = owned().sort((a, b) => val(b) - val(a));
      const imgs = await Promise.all(items.map((it) => App.col.displayImage(it, App.games.get(it.game))));
      const fp = (list, cur, attr, swatch) => `<div class="frame-picker">${list.map(([k, l]) => `<div class="fp ${k === cur ? 'on' : ''}" data-${attr}="${k}">${swatch(k)}${l}</div>`).join('')}</div>`;
      box.innerHTML = `
        <h2>Personnaliser ma vitrine</h2>
        <h3 id="e-picker">Cartes à l’honneur <span class="muted small">(${profile.featured.length}/9 — clique pour ajouter ou retirer, dans l’ordre voulu)</span></h3>
        ${items.length ? `<div class="row" style="margin-bottom:8px"><input type="search" id="e-pick-q" placeholder="Chercher une carte…" style="flex:1;min-width:0">${profile.featured.length ? '<button class="btn sm ghost" id="e-pick-clear">Tout retirer</button>' : ''}</div>
          <div class="pick-list">${items.map((it, i) => {
          const n = profile.featured.indexOf(it.key);
          return `<div class="pk ${n >= 0 ? 'on' : ''}" data-pick="${esc(it.key)}" data-q="${esc(App.util.norm(it.snap.name + ' ' + (it.snap.setName || '')))}" title="${esc(it.snap.name)}">${n >= 0 ? `<span class="n">${n + 1}</span>` : ''}<img src="${esc(imgs[i].src)}" alt="" loading="lazy" data-alt="${esc(it.snap.name)}"></div>`;
        }).join('')}</div>` : '<div class="muted">Aucune carte dans ta collection pour l’instant.</div>'}
        ${profile.featured.length ? `<h3 style="margin-top:18px">Cadre par carte</h3><div class="row">${profile.featured.map((k) => { const it = App.col.byKey(k); if (!it) return ''; return `<label class="pill">${esc(it.snap.name)} <select data-cframe="${esc(k)}"><option value="">(cadre par défaut)</option>${V.FRAMES.map(([f, l]) => `<option value="${f}" ${profile.frames[k] === f ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`; }).join('')}</div>` : ''}
        <div class="grid-auto" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr));margin-top:22px">
          <div>
            <h3>Profil</h3>
            <div class="row" style="gap:6px;flex-wrap:nowrap"><input type="text" id="e-pseudo" value="${esc(profile.pseudo)}" placeholder="Pseudo" maxlength="20" style="flex:1;min-width:0"><button class="btn sm primary" id="e-pseudo-ok">Valider</button></div>
            <div class="small muted" id="e-pseudo-msg" style="margin:4px 0 10px">${App.cloud.user ? 'Chaque pseudo est unique : 3 à 20 caractères.' : 'Connecte-toi pour réserver ton pseudo (il est unique).'}</div>
            <p><textarea id="e-bio" placeholder="Quelques mots sur ta collection…">${esc(profile.bio)}</textarea></p>
            <div class="row"><label class="btn sm">🖼 Photo de profil<input type="file" accept="image/*" id="e-avatar" hidden></label>${profile.avatar ? '<button class="btn sm ghost" id="e-avatar-del">Retirer</button>' : ''}</div>
            <h3 style="margin-top:16px">Afficher</h3>
            <label class="check"><input type="checkbox" id="e-stats" ${profile.showStats ? 'checked' : ''}> Statistiques</label><br>
            <label class="check"><input type="checkbox" id="e-badges" ${profile.showBadges ? 'checked' : ''}> Badges</label><br>
            <label class="check"><input type="checkbox" id="e-top" ${profile.showTop ? 'checked' : ''}> « Les plus précieuses »</label>
          </div>
          <div>
            <h3>Thème</h3>
            ${fp(V.THEMES, profile.theme, 'theme', (k) => `<div class="sw vitrine theme-${k}" style="padding:0"></div>`)}
            <h3 style="margin-top:16px">Cadre des cartes</h3>
            ${fp(V.FRAMES, profile.frame, 'frame', (k) => `<div class="sw frame-${k}" style="padding:6px"><div style="background:#556;height:100%;border-radius:4px"></div></div>`)}
            <h3 style="margin-top:16px">Mise en page</h3>
            <div class="chips">${V.LAYOUTS.map(([k, l]) => `<button class="chip ${profile.layout === k ? 'on' : ''}" data-layout="${k}">${l}</button>`).join('')}</div>
          </div>
        </div>
      `;
    };

    const save = async (redraw = true) => {
      await App.col.saveProfile(profile);
      if (redraw) { const y = window.scrollY; await draw(); window.scrollTo(0, y); }
    };

    el.addEventListener('click', async (e) => {
      const t = e.target;
      if (t.closest('#v-edit')) {
        editing = !editing; await draw();
        if (editing) { const ed = el.querySelector('#v-editor'); if (ed) ed.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
        return;
      }
      if (t.closest('#v-pickcards2')) {
        e.preventDefault(); editing = true; await draw();
        const h = el.querySelector('#e-picker'); if (h) h.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      if (t.closest('#e-pick-clear')) { profile.featured = []; return save(); }
      if (t.closest('#e-pseudo-ok')) {
        const v = el.querySelector('#e-pseudo').value.trim(), msg = el.querySelector('#e-pseudo-msg');
        if (!App.cloud.user) { profile.pseudo = v || 'Dresseur'; await save(); return; }
        msg.textContent = 'Vérification…';
        try {
          const r = await App.cloud.rpc('claim_pseudo', { p: v });
          if (r && r.ok) { profile.pseudo = r.pseudo; await save(); App.col.notify(); App.util.toast('Pseudo enregistré ✓'); }
          else { msg.innerHTML = `<span style="color:#ff8a8a">${esc((r && r.reason) || 'Pseudo refusé')}</span>`; }
        } catch (err) {
          msg.innerHTML = `<span style="color:#ff8a8a">${/claim_pseudo|function/i.test(err.message) ? 'Réservation des pseudos pas encore activée sur le serveur' : esc(err.message)}</span>`;
        }
        return;
      }
      const th = t.closest('[data-theme]'); if (th) { profile.theme = th.dataset.theme; return save(); }
      const fr = t.closest('[data-frame]'); if (fr) { profile.frame = fr.dataset.frame; return save(); }
      const ly = t.closest('[data-layout]'); if (ly) { profile.layout = ly.dataset.layout; return save(); }
      const pk = t.closest('[data-pick]');
      if (pk) {
        const k = pk.dataset.pick;
        if (profile.featured.includes(k)) profile.featured = profile.featured.filter((x) => x !== k);
        else if (profile.featured.length >= 9) return App.util.toast('9 cartes maximum à l’honneur');
        else profile.featured.push(k);
        return save();
      }
      if (t.closest('#e-avatar-del')) { if (profile.avatar) App.cloud.markPhotoDelete(profile.avatar); profile.avatar = null; return save(); }
      const vc = t.closest('#v-page .vcard');
      if (vc && !editing) App.cardModal(vc.dataset.game, vc.dataset.card);
    });
    el.addEventListener('change', async (e) => {
      const t = e.target;
      if (t.id === 'e-avatar' && t.files[0]) {
        const blob = await App.util.resizeImage(t.files[0], 400);
        const id = 'avatar_' + Date.now();
        await App.db.set('photos', id, blob);
        App.cloud.markPhoto(id);
        if (profile.avatar) { await App.db.del('photos', profile.avatar).catch(() => {}); App.cloud.markPhotoDelete(profile.avatar); }
        profile.avatar = id; return save();
      }
      if (t.id === 'e-stats') { profile.showStats = t.checked; return save(); }
      if (t.id === 'e-badges') { profile.showBadges = t.checked; return save(); }
      if (t.id === 'e-top') { profile.showTop = t.checked; return save(); }
      if (t.dataset.cframe) { if (t.value) profile.frames[t.dataset.cframe] = t.value; else delete profile.frames[t.dataset.cframe]; return save(); }
    });
    el.addEventListener('input', (e) => {
      if (e.target.id !== 'e-pick-q') return;
      const q = App.util.norm(e.target.value);
      el.querySelectorAll('.pick-list .pk').forEach((d) => { d.hidden = !!q && !d.dataset.q.includes(q); });
    });
    el.addEventListener('keydown', (e) => { if (e.target.id === 'e-pseudo' && e.key === 'Enter') el.querySelector('#e-pseudo-ok').click(); });
    el.addEventListener('input', App.util.debounce(async (e) => {
      if (e.target.id === 'e-bio') { profile.bio = e.target.value; await save(false); }
    }, 400));

    await loadBadges();
    await draw();
    const unsub = App.col.on(() => { if (!editing) draw(); });
    return unsub;
  },
};
