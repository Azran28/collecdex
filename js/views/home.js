/* Page d'accueil : chiffres clés, licences disponibles, séries en cours, derniers ajouts */
App.views.home = {
  async render(el, params, alive) {
    const { esc, euro } = App.util;
    const items = App.col.all().filter((i) => i.qty > 0);
    const copies = items.reduce((s, i) => s + i.qty, 0);
    const value = App.col.totalValue(items);

    el.innerHTML = `
      <section class="hero">
        <h1>Ton <span class="holo">Dex</span> de collection</h1>
        <p class="muted">Capture tes cartes, complète tes séries, montre tes pépites.</p>
        <div class="stats">
          <div class="stat"><b>${items.length}</b><span>cartes</span></div>
          <div class="stat"><b>${copies - items.length}</b><span>doublons</span></div>
          <div class="stat"><b>${euro(value)}</b><span>valeur estimée</span></div>
          <div class="stat" id="h-complete"><b>…</b><span>séries complètes</span></div>
        </div>
        <div class="row" style="margin-top:14px">
          <a class="btn primary" href="#/scan">${App.icons.icon('capture', 16)} Capturer une carte</a>
          <a class="btn" href="#/jeu/pokemon">${App.icons.icon('explore', 16)} Explorer</a>
          <a class="btn" href="#/compte">${App.icons.icon('trophy', 16)} Ma vitrine</a>
        </div>
      </section>
      <div id="h-friends"></div>
      <div id="h-caps"></div>
      <div id="h-install"></div>

      <div class="section-title"><h2>Licences</h2></div>
      <div class="grid-auto licences">
        ${App.games.list.map((g) => {
          const on = g.status === 'actif';
          const n = items.filter((i) => i.game === g.id).length;
          return `
          <a class="game-tile g-${g.id} ${on ? '' : 'soon'}" href="${on ? `#/jeu/${g.id}` : '#/'}">
            <div class="gicon">${App.icons.icon(g.icon, 26)}</div>
            <div class="gtxt">
              <h3>${esc(g.name)}</h3>
              <div class="muted small">${on ? `<b style="color:var(--text)">${n}</b> carte${n > 1 ? 's' : ''} · ` : ''}${esc(g.desc)}</div>
            </div>
            <span class="pill tag">${on ? 'dispo' : esc(g.status)}</span>
          </a>`;
        }).join('')}
      </div>

      <div id="h-goals"></div>
      <div id="h-inprogress"></div>

      <div class="section-title"><h2>Derniers ajouts</h2><span class="spacer"></span>${items.length ? '<a href="#/collection">Tout voir ›</a>' : ''}</div>
      <div id="h-recent">${items.length ? '' : '<div class="empty panel">Ton Dex est vide pour l’instant.<br>Capture ta première carte pour commencer !</div>'}</div>
    `;

    // Derniers ajouts (redessinés dès qu'une carte change : photo, visuel, quantité…)
    const r = el.querySelector('#h-recent');
    const drawRecent = () => {
      const recent = App.col.all().filter((i) => i.qty > 0).sort((a, b) => b.addedAt - a.addedAt).slice(0, 12);
      if (!recent.length) return;
      r.innerHTML = `<div class="cards">${recent.map((it) => App.ui.cardTile({ id: it.id, name: it.snap.name, localId: it.snap.localId, image: it.snap.image, rarity: it.snap.rarity, setId: it.setId, serieId: it.snap.serieId, setName: it.snap.setName }, { game: it.game, item: it, showSet: true, quickAdd: false })).join('')}</div>`;
      App.ui.hydratePhotos(r);
    };
    drawRecent();
    r.addEventListener('click', (e) => { const t = e.target.closest('.ctile'); if (t) App.cardModal(t.dataset.game, t.dataset.card); });
    const unsubCol = App.col.on(App.util.debounce(() => { if (alive()) drawRecent(); }, 300));
    // proposition d'installer l'appli (téléphone seulement, discret, masquable)
    let offInstall = null;
    App.install.banner(el.querySelector('#h-install')).then((f) => { offInstall = f; });
    // capsules à ouvrir (compte connecté)
    const drawCaps = () => {
      const box = el.querySelector('#h-caps'); if (!box) return;
      const st = App.capsules.state;
      if (!st || App.capsules.missing) { box.innerHTML = ''; return; }
      box.innerHTML = `<a class="cap-home" href="#/capsules">${App.views.capsules.capsuleSVG('', 34)}
        <div><b>${st.stock ? `${st.stock} capsule${st.stock > 1 ? 's' : ''} à ouvrir` : 'Capsules'}</b><span>${st.stock >= st.max ? 'Réserve pleine : ouvre-les !' : st.next_at ? `Prochaine dans <b class="hc-cd">${App.capsules.countdown()}</b>` : ''}</span></div>
        ${st.stock ? '<span class="btn sm primary">Ouvrir</span>' : ''}</a>`;
    };
    const offCaps = App.capsules.on(drawCaps); drawCaps();
    // demandes d'ami reçues
    const drawFriends = () => {
      const box = el.querySelector('#h-friends'); if (!box) return;
      const n = App.cloud.user ? App.friends.pendingIn() : 0;
      box.innerHTML = n ? `<a class="cap-home fr-home" href="#/amis"><span class="fr-home-ico">${App.icons.icon('users', 20)}</span>
        <div><b>${n} demande${n > 1 ? 's' : ''} d’ami</b><span>Accepte pour voir sa vitrine</span></div><span class="btn sm primary">Voir</span></a>` : '';
    };
    const offFriends = App.friends.on(drawFriends); drawFriends();
    // le compte à rebours défile en direct
    const capTick = setInterval(() => { const c = el.querySelector('.hc-cd'); if (c) c.textContent = App.capsules.countdown(); }, 1000);
    const unsub = () => { unsubCol(); offCaps(); offFriends(); clearInterval(capTick); if (offInstall) offInstall(); };

    // Séries en cours + séries complétées
    try {
      const ad = App.games.get('pokemon');
      const sets = await ad.listSets();
      if (!alive()) return unsub;
      // Objectifs + liste de souhaits
      const gs = await App.wish.goals();
      const wl = (await App.wish.list()).filter((w) => !App.col.owned(w.game, w.id));
      const hg = el.querySelector('#h-goals');
      const wishLink = wl.length ? `<a class="slim-link" href="#/objectifs?tab=souhaits">${App.icons.icon('heart', 14)} ${wl.length} carte${wl.length > 1 ? 's' : ''} recherchée${wl.length > 1 ? 's' : ''}</a>` : '';
      if (gs.length) {
        const rows = gs.map((g) => ({ g, s: sets.find((x) => x.id === g.setId) })).filter((x) => x.s).slice(0, 3);
        hg.innerHTML = `<div class="section-title"><h2>Mes objectifs</h2><span class="spacer"></span>${wishLink}<a href="#/objectifs">Tout voir ›</a></div>
          <div class="home-goals">${rows.map(({ g, s }) => {
            const p = App.col.progress('pokemon', s), left = App.wish.daysLeft(g.deadline);
            return `<a class="home-goal ${p.complete ? 'done' : ''}" href="#/objectifs?tab=manque&set=${encodeURIComponent(s.id)}">
              <div class="row" style="gap:8px"><b>${esc(s.name)}</b><span class="spacer"></span>${p.complete ? App.icons.icon('trophy', 15) : g.deadline ? `<span class="small ${left < 0 ? 'late' : ''}">${left < 0 ? 'dépassé' : 'J-' + left}</span>` : ''}</div>
              <div class="row small muted" style="gap:6px;margin:4px 0">${p.have}/${p.total} · ${p.pct.toLocaleString('fr-FR')} %${p.complete ? '' : ` · ${p.missing} à trouver`}</div>
              ${App.ui.progressBar(p)}
            </a>`;
          }).join('')}</div>`;
      } else if (items.length) {
        // pas encore d'objectif : une simple ligne, discrète
        hg.innerHTML = `<div class="home-slim"><a class="slim-link" href="#/objectifs">${App.icons.icon('target', 14)} Fixe-toi un objectif de série</a>${wishLink}</div>`;
      }
      const bySet = {};
      for (const it of items.filter((i) => i.game === 'pokemon')) { bySet[it.setId] = Math.max(bySet[it.setId] || 0, it.addedAt); }
      const started = sets.filter((s) => bySet[s.id]).map((s) => ({ s, p: App.col.progress('pokemon', s), t: bySet[s.id] }));
      el.querySelector('#h-complete b').textContent = started.filter((x) => x.p.complete).length;
      if (started.length) {
        started.sort((a, b) => b.t - a.t);
        el.querySelector('#h-inprogress').innerHTML = `<div class="section-title"><h2>Mes séries en cours</h2></div><div class="grid-auto">${started.slice(0, 6).map(({ s, p }) => App.views.sets.setCard('pokemon', s, p)).join('')}</div>`;
      }
    } catch (e) {
      el.querySelector('#h-complete b').textContent = '—';
    }
    return unsub;
  },
};
